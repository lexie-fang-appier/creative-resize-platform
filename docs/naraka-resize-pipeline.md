# NARAKA Key-Art Resize — Process Steps

This is the manual pipeline used this session to take one NARAKA (永劫無間) key-art PSD and
produce 4 target sizes (320x1200, 1456x180, 970x250, 1940x500), plus every rule learned along
the way. It assumes Python 3 with `psd-tools`, `Pillow`, and `numpy` installed, and `gws`
(Google Workspace CLI) authenticated for Drive/Sheets access. Source assets live in a Drive
folder linked from a CAM Jira ticket (e.g. CAM-406522); target sizes are illustrative — the
same steps apply to whatever sizes a ticket actually asks for.

## 0. Locate and download the source PSD(s)

1. Find the ticket's "原始檔" Drive folder link, list files, identify the asset's size variants
   (a given asset usually ships as 2-3 PSDs: e.g. 1920x1080, 1080x1080, sometimes 1080x1350).
2. Download each variant (`gws drive files get --params '{"fileId":"...","alt":"media"}' -o <path>`).
   These files are 25-350MB — expect the call to background itself; that's fine, wait for the
   completion notification rather than polling.

## 1. Layer decomposition → Layer Experiments sheet

1. Run `scripts/layer_metadata_experiment.py <path/to/file.psd>` on every variant. It prints one
   JSON object: `{source_file, canvas, layers: [...]}`, where each layer has `z_index`, `name`,
   `is_semantic_name`, `type_guess`, `bbox`, `corner_anchor`, `blend_mode`, `opacity`,
   `fill_opacity`, `has_effects`, `has_stroke`, `has_mask`, `clipping`, `fine_detail_ratio`, and
   (for text layers) `text_content`.
2. Append one row per layer to the "Layer Experiments" tab of the tracking Sheet (columns match
   the JSON fields 1:1, plus Client/Campaign/Job columns). This is a durable audit log, not a
   working file — always append, never overwrite past rows.

## 2. Read the layer tree and identify element roles

1. Walk the full PSD layer tree (recursing into groups), printing kind/visibility/bbox/name for
   every layer. Source PSDs typically have a hidden `英` (English) variant group and a visible
   `繁` (Traditional Chinese) variant group — only walk/use the visible one.
2. From the tree, classify every visible layer into one of:
   - **Hero art** — the character/object bleed art. Usually a big smartobject or a handful of
     pixel layers whose combined bbox is often *larger than the canvas* (deliberate bleed margin
     for reframing). There is no character in every asset — some are weapon/item-skin promos;
     treat the object's identity-critical part (hilt, engraved mark) as the "head" analog.
   - **Logo** — a single smartobject, usually named something like `繁中` (not literally "logo").
   - **Rating/compliance badge** — a smartobject near a canvas corner. **Which corner is
     asset-specific** — check this PSD's own bbox, don't assume bottom-left.
   - **True text layers** (`kind == "type"`) — title, subtitle, per-character nameplates. There
     can be more than one; each must be separately identified and separately sized later (see
     Rule 9 in the recipe).
   - **Hero-content insets** (skill-showcase thumbnails, platform icons) — check for these; some
     assets have them, hidden or visible; don't assume they're absent just because the current
     asset you've seen so far didn't have any.
   - Anything else visible (decorative shapes/flourishes attached to text) — lower priority,
     extract with the text layer it's attached to.

## 3. Extract elements

1. **Logo / badge / individual text layers**: `layer.composite()` on the specific layer, save as
   PNG. Then cross-check: crop the *same bbox* out of the full flattened composite and compare
   the two images side by side. psd-tools can silently misrender an isolated layer (no automatic
   way to detect this) — this check is not optional.
2. **Hero art / "scene"**: do **not** hand-pick named sub-layers and `alpha_composite` them
   yourself — that silently ignores each layer's real blend mode (multiply/screen/etc.) and can
   produce a hard-edged seam at that layer's own bbox, even well inside the original canvas.
   Instead: set the unwanted sibling layers (text group, logo, badge) to `.visible = False`, call
   `.composite()` on their *parent group*, then restore visibility. This lets psd-tools apply
   every remaining layer's actual blend mode correctly.
3. Save the "canvas view" (the scene composite cropped exactly to the original canvas bounds) as
   a quick reference, separately from the full bleed-extended composite.

## 4. Before using any bleed margin beyond the original canvas

The hero-art layer(s) often extend beyond the canvas (e.g. a 1920x1080 canvas fed by a
2900x1680 bleed layer) — this is what lets you reframe for very different aspect ratios. But:

1. Different layers contributing to the scene can have *different* extents — e.g. a color-grade
   or vignette effect layer that only covers the original canvas, sitting on a wider base-art
   layer. If you crop past that shorter layer's edge, you get a visible tonal seam.
2. Before committing to any crop that reaches into bleed margin, render that specific region and
   visually inspect a strip straddling the boundary of every layer that contributes to it. If
   there's a seam, either stay inside the shorter layer's bounds, or don't use that region.

## 5. Plan crops per target size — the aspect-ratio-first rule

The single most common bug this session: cropping "a region that shows the content I want" by
eye, then force-resizing it into the output box. If the crop box's own aspect ratio doesn't
match the output box's aspect ratio, this **stretches or squeezes the hero subject** — a
distortion bug that doesn't show up in any framing/overlap/legibility check, only in "does this
person look narrower/taller than they should."

**Correct order:**
1. Decide what content must be visible (identity-critical core + immediate extension — see
   §6). Pick whichever crop dimension is easiest to pin down from that content (e.g. a width that
   frames both shoulders).
2. Derive the *other* dimension directly from the target output aspect ratio: `other_dim =
   pinned_dim / target_aspect` or `* target_aspect` as appropriate. Now the crop box's aspect
   ratio already equals the output's.
3. Only then crop and resize — the resize is now a uniform scale, never a stretch.
4. If the derived dimension pushes the crop outside the original canvas, that's when you reach
   for bleed margin (§4) or a matte/portrait strategy (§6-8) — not by silently accepting
   distortion instead.

## 6. The hero's framing floor, and multi-instance ("joint constraint") framing

1. **Framing floor**: at minimum, the hero's *entire* identity-critical core — for a character,
   the whole head including hair ornaments/horns/crowns, not just eyes/face — through its
   immediate extension (chest/upper torso for a character; near reach for an object). Never crop
   tighter than that.
2. **More than one instance of the hero** (two characters, a matched pair of weapon hilts, etc.):
   the framing floor applies to *every* instance, and their framing is a **joint constraint** —
   adjusting the shared crop to improve one instance's framing (e.g. raising it) can push
   another instance's core past the frame edge. Concretely: test several exact crop-position
   values and, at each one, zoom into *every* instance's core boundary — don't just check the one
   you're currently optimizing. Iterate toward whatever value satisfies all instances at once.
3. If a single continuous crop's arithmetic genuinely can't satisfy every instance at an extreme
   matte ratio (crop height is capped at `crop width ÷ target aspect ratio`, so a very wide-short
   target can force a full-width crop below what's needed) — **first try repositioning or
   narrowing that same single crop.** Only if that's still infeasible, fall back to: crop each
   instance as its own independent, undistorted box (§5's aspect rule applies per-instance box
   too), place them independently in the canvas, and fill the connecting space using the fill hierarchy — a character-free real-art
   region from this same asset first (aspect-matched, feathered), then a flat gradient built from
   colors *sampled from the real scene* near each instance — never a large
   blurred image extension used as edge padding. (Blurred-extend itself is fine, but only for a
   background-only zone with no hero content of its own, e.g. behind a text/logo info block on a
   portrait bottom zone — not as wide padding flanking real hero crops.)

## 7. Portrait/vertical outputs — centering and structural split

1. **Horizontal centering**: center the crop on the hero's actual body/torso mass — the solid
   part a viewer's eye lands on — not on the bounding box of everything attached to it. Flowing
   hair, a trailing sash/cape, or an outstretched weapon are asymmetric and will pull a naive
   bounding-box center off to one side even when the box itself looks centered. Let those
   asymmetric extensions fall unevenly; keep the solid body centered.
2. **Structural top/bottom split** (common for very tall targets like 320x1200): top zone = hero
   crop (aspect-matched per §5); bottom zone = a background-only backdrop carrying
   logo/title/badge, filled per the hierarchy — a character-free real-art region first (for a
   bottom zone that is usually the ground/pavement below the hero's feet), then a flat gradient,
   and only then a blurred/extended continuation. Size this zone from what the elements need at
   their legibility floors (text height + one element row + padding), never a fixed fraction of
   the canvas. Feather the seam
   between the two zones with a short (~80-100px) gradient-alpha blend of a strip taken from
   just above the seam, so the transition isn't a hard cut.
3. Any per-instance nameplate/label must stay in the *character zone*, positioned beside that
   specific instance — never relocated into the shared bottom text zone just because "it's still
   text and there's text down there." A label detached from its subject reads as lost information
   even though the glyphs are technically on the canvas somewhere.

## 8. Matte (short-wide) outputs — text layout

1. Arrange true text (title, subtitle, per-instance nameplates) as a **horizontal row spreading
   toward the hero**, not stacked vertically against one edge — even if the source PSD's own
   design stacks it that way. "The source already does it this way" is not a valid exception;
   it's usually exactly the habit these rules exist to correct.
2. A brand logo may sit in its own top-corner brand-mark position outside that row — that's a
   placement choice, not a stack, and doesn't violate the rule above.
3. The rating/compliance badge stays corner-anchored at **this asset's own corner** (check its
   actual bbox — don't assume bottom-left because a previous asset used bottom-left) and is never
   folded into the text row.
4. At the most extreme aspect ratios (e.g. 1456x180), if a single continuous crop truly can't
   show every required element's framing floor, see §6.3 for the fallback order.

## 9. Text sizing — audit every text element independently

1. Every layer identified as true text (`kind=='type'`) needs its own legibility-floor check —
   sizing the title generously does not mean a secondary nameplate/label was sized correctly.
   It's easy to leave a secondary text element at a small size inherited from an early draft while
   iterating on the more prominent one; explicitly re-check each one before calling the layout
   done.
2. Never drop a text line (e.g. a subtitle) to fit tight space — shrink the whole text block as
   one unit first. Only cut genuinely decorative/flavor text (not part of the core product name)
   if that alone still isn't enough, and only after confirming it really is decorative, not
   product identity.

## 10. Overlap verification

1. Check overlap at the **exact final position and size** the element will occupy — not a wider
   reference box measured at a different height/crop. A diagonal limb, flowing hair, or a
   reaching weapon can intrude at one height/position and not another.
2. Acceptable-overlap tiers, closest scrutiny first:
   - Background/environment (architecture, foliage, decorative spikes) — fine to touch.
   - Thin flowing material (hair strands, dress hems, translucent fabric) — fine, per this asset's
     own source-design precedent (check: does the *original* design already let hair cross behind
     a nameplate ribbon? If so, this is an intentional style, not a bug).
   - Solid hero mass (skin, face, armor, an object's solid body) — never acceptable, regardless of
     how small the intrusion looks in a scaled-down preview. Always verify at true output pixel
     size, not a shrunk full-canvas view — small-but-real overlaps don't read at a glance.

## 11. Final QA pass (run this on every output before calling it done)

Walk the full Validation Rules list in the Prompt Recipe (reproduced below) — this is the
Step-5-equivalent checklist. In practice this means, per output image:
- Zoom into every text/logo/badge boundary against the hero at 100% pixel scale and confirm zero
  overlap (§10).
- Confirm every hero instance's identity-critical core is fully in frame (§6).
- Confirm the hero's proportions are undistorted (§5) and, for portrait outputs, horizontally
  centered on body mass (§7).
- Confirm every true-text element is independently legible (§9).
- Confirm no large blurred edge padding, no opaque panel, no bleed-region seam (§4, §6.3).
- Confirm the badge is at the correct (this-asset-specific) corner and hasn't been enlarged.

## 12. Finalize and hand off

1. Save each output as a plain PNG, named descriptively (asset id + size).
2. Upload to the review Drive folder (or wherever the ticket's review process expects output).
3. If a genuinely new, generalizable rule was learned this round (not a one-off), fold it into
   the Prompt Recipe as a new version rather than only fixing the immediate image — see the
   recipe text below for the current full rule set. Keep the Postgres `prompt_versions` row and
   the Sheet's "Prompts" tab row in sync (archive the old active version, insert the new one,
   append a matching row to the Sheet with the same column order the app's own
   `logPromptVersion()` writer uses).

---

## Prompt Recipe: "Gaming — Character-Centric Key Art" (v10 — generated)

**Authoring surface: the `recipe_rules` table — one rule = one row.** `prompt_versions` v10 is
rendered from it by `scripts/render_recipe_version.py`; do not hand-edit a version row. To change a
rule, edit or add its row and re-render.

Why this changed at v10: v1..v9 grew to ~4200 words while holding only 18 distinct rules, because
the six prose fields are not six kinds of content — they are four *facets* of the same rule
(statement / how-to / prohibition / check), so each rule was written 3-5 times ("aspect/distortion"
appeared 18 times in v9, "multi-instance" 19, "bleed seam" 14). Adding v9's single new idea took 10
separate edits and still grew the recipe 10-13%. Same 18 rules as rows: **816 words**, and a run
only ever sees the rules that apply to its own target.

Two consequences:

- **10 of the 18 rules are enforced by code, not prose** (`enforcement = validator:*`). A failing
  validator stops the run before its output can be wrong, which is stricter than asking a model to
  comply — so those rules are not restated as instructions at all. The `validators` table registers
  each one's entrypoint.
- **Per-target prompts come from `scripts/resolve_prompt.py`**, which filters on the target's aspect
  class and the asset's traits. A 320x1200 run never reads the matte text-row rule; a
  single-character asset never reads the multi-instance rules. In practice that is **260-299 words**
  per target instead of 4200.

```bash
python scripts/resolve_prompt.py --target 1456x180 --traits has_insets,any_fill,split_layout
python scripts/render_recipe_version.py --insert 11     # after editing a rule row
```

### Base Prompt (global-layer rules)

GENERATED from the recipe_rules table (one rule = one row) — do not hand-edit this version. Edit or add a rule row instead and re-render, so a rule is stated exactly once rather than restated as a statement, a how-to, a prohibition and a check. Runs should resolve the rules that apply to their own target via scripts/resolve_prompt.py; this unfiltered rendering exists for the Prompt Lab view and the run snapshot.

Rules whose enforcement is a validator are NOT restated as instructions here — a failing validator stops the run before its output can be wrong, which is stricter than asking the model to comply. They are listed under Forbidden Changes as the checks that gate a run.

[fill-hierarchy] Fill any zone the hero art does not cover in this order: (1) a character-free real-art region from THIS asset — the sky band above the hero, the ground below its feet — aspect-matched and feathered at the seam; (2) a flat gradient from colours sampled next to the join; (3) a blurred/stretched copy of the art, and only for a background-only zone with no hero content. Never an opaque panel replacing scene content, and never large blurred padding flanking real hero crops.
  Why: Lexie rejected wide blurred edge padding outright ("絕對不要做出邊緣大面積模糊的圖", 2026-09-10). Then on PR196.3 a blurred info-band was cutting away art on aspects where the crop already covered the whole canvas, while the pavement below the hero's feet sat unused — real scene beats any synthesized fill, and the seam disappears because both zones are the same scene.

[house-rules-over-source-precedent] An established layout rule applies by default even when this asset's own source PSD does the opposite — "the source already does it this way" is usually the exact habit the rule was written to override. Corner anchoring and badge position are the exception: those are read from THIS asset. If a genuine reason to deviate appears, surface it as a question rather than deciding silently.
  Why: YJp815 skipped row-not-stack because the source PSD stacked text left; that source layout is precisely what the rule exists to correct. Lexie flagged it and the size had to be rebuilt.

### Industry Rules (Gaming)



### Layout Rules

[framing-floor] Every hero instance shows its ENTIRE identity-critical core — a character's whole head including hair ornaments, horns and crowns; an object's whole recognizable core such as a hilt or engraved mark — down through its immediate extension (chest/upper torso, or an object's near reach). Never crop tighter, and never zoom out so far it reads as tiny.
  Why: Extreme matte ratios kept only a face sliver, which stops reading as this character. Formalized by Lexie 2026-09-10 as a standing floor after the YJp816 round.

[multi-instance-joint-constraint] When more than one hero instance shares one crop, their framing is a joint constraint: after any crop shift, re-check EVERY instance's core boundary at that exact position, not just the one being optimized. Iterate toward a value that satisfies all of them.
  Why: On YJp816, raising the left character to fix her framing pushed the right character's horn ornament past the top edge. y0=200 fixed A and clipped B; y0=150 kept B and under-raised A; ~160-165 satisfied both.

[per-instance-label-adjacency] A per-instance label (nameplate, name banner) stays visually beside its own instance wherever that instance appears — never pooled into a shared text zone with another instance's label.
  Why: YJp816's 320x1200 moved both nameplates into the shared bottom zone. Every glyph was on the canvas and Lexie still called it the same problem as dropping them: a label detached from its subject reads as lost.

[portrait-center-body-mass] For a portrait/vertical target, centre the crop on the hero's solid body mass (torso/core midline), not the bounding box of everything attached to it. Let asymmetric extensions — flowing hair, a trailing sash, an outstretched weapon — fall unevenly.
  Why: YJp814's 320x1200 read as shifted right even though the bounding box was centred: the hair streamed left while the solid torso sat right. Lexie: "如果是直立型，請確保人物置於橫向的中間".

[text-row-not-stack] On a matte (short-wide) target, arrange true text as a horizontal row spreading toward the hero, not stacked vertically against one edge. A brand logo may stay in a top-corner brand-mark position outside the row.
  Why: Written after YJp810/811 defaulted to a stacked left column that read as a flat list rather than a composed banner.

[zero-overlap-tiers] No text or icon element overlaps the hero or a hero-content inset, verified at the EXACT final position and size, at true output pixel scale. Acceptable-overlap tiers: background/environment fine; thin flowing material (hair strands, hems) fine where the source design already does it; solid hero mass (skin, face, armour, an object's solid body) never.
  Why: YJp816's title landed on a diagonal reaching arm because the gap was measured at a different height — a gap check only holds where it was measured. On PR196.3 an inset row placed against the body's edge still landed on the spear blade, which is solid object mass.

### Validation Rules (every rule, one line each — the review checklist)

1. [bleed-seam-check] Before using any crop region that reaches past the original canvas into bleed margin, confirm every layer contributing colour, grade or effect to that region actually covers it — inspect a strip straddling the boundary.
2. [crop-aspect-first] Derive a hero crop's dimensions FROM the target aspect ratio before any resize: pin the dimension the framing needs, compute the other from the target ratio. A crop of one aspect force-resized into an output of another stretches the hero.
3. [fill-hierarchy] Fill any zone the hero art does not cover in this order: (1) a character-free real-art region from THIS asset — the sky band above the hero, the ground below its feet — aspect-matched and feathered at the seam; (2) a flat gradient from colours sampled next to the join; (3) a blurred/stretched copy of the art, and only for a background-only zone with no hero content. Never an opaque panel replacing scene content, and never large blurred padding flanking real hero crops.
4. [house-rules-over-source-precedent] An established layout rule applies by default even when this asset's own source PSD does the opposite — "the source already does it this way" is usually the exact habit the rule was written to override. Corner anchoring and badge position are the exception: those are read from THIS asset. If a genuine reason to deviate appears, surface it as a question rather than deciding silently.
5. [scene-extraction-integrity] Extract the scene by hiding every element you will re-place — text, logo, badge AND hero-content insets — then calling composite() on the parent group. Never hand-pick named sub-layers and alpha_composite them yourself.
6. [badge-corner-and-floor] The compliance/rating badge is a hard constraint, not a priority-ranked element: always visible and legible, on THIS asset's own corner (read the source layer's bbox), sized to its legibility floor and never enlarged because the canvas grew.
7. [hero-content-insets-all] Hero-content insets — gameplay/skill-showcase thumbnails embedded in the key art — carry the same priority as the hero itself. Include all of them, sized so the content inside is recognizable, not just the badge silhouette. If one genuinely cannot be made recognizable at a target size, flag for Designer review rather than omitting or shrinking it below that.
8. [corner-anchor-preserved] Any element whose source layer sits flush to a canvas edge stays flush to that same edge at the new size, preserving the source's own relative margin. Read the edge from this asset's layer bbox (layer_metadata's corner_anchor) — never carry over a previous asset's corner.
9. [framing-floor] Every hero instance shows its ENTIRE identity-critical core — a character's whole head including hair ornaments, horns and crowns; an object's whole recognizable core such as a hilt or engraved mark — down through its immediate extension (chest/upper torso, or an object's near reach). Never crop tighter, and never zoom out so far it reads as tiny.
10. [isolated-render-crosscheck] Any isolated layer render whose exact appearance matters must be compared side by side with the same bbox cropped from the full flattened composite before it is trusted. Sample actual pixel values before concluding anything about a backing plate's colour.
11. [multi-instance-joint-constraint] When more than one hero instance shares one crop, their framing is a joint constraint: after any crop shift, re-check EVERY instance's core boundary at that exact position, not just the one being optimized. Iterate toward a value that satisfies all of them.
12. [no-dilated-shadow-on-fine-detail] Never apply a dilated/expanded contact shadow to fine line-art or a small multi-character icon row (fine_detail_ratio below ~0.3) — the dilation bridges the gaps between strokes and reads as blur. Shape-hugging shadows are for thick strokes only.
13. [per-instance-label-adjacency] A per-instance label (nameplate, name banner) stays visually beside its own instance wherever that instance appears — never pooled into a shared text zone with another instance's label.
14. [portrait-center-body-mass] For a portrait/vertical target, centre the crop on the hero's solid body mass (torso/core midline), not the bounding box of everything attached to it. Let asymmetric extensions — flowing hair, a trailing sash, an outstretched weapon — fall unevenly.
15. [text-legibility-floor] Check EVERY true-text layer (psd-tools kind=='type') independently against human legibility at the output's actual pixel size, and keep every line the source has — if the block does not fit, shrink it as one unit rather than dropping a line.
16. [text-row-not-stack] On a matte (short-wide) target, arrange true text as a horizontal row spreading toward the hero, not stacked vertically against one edge. A brand logo may stay in a top-corner brand-mark position outside the row.
17. [zero-overlap-tiers] No text or icon element overlaps the hero or a hero-content inset, verified at the EXACT final position and size, at true output pixel scale. Acceptable-overlap tiers: background/environment fine; thin flowing material (hair strands, hems) fine where the source design already does it; solid hero mass (skin, face, armour, an object's solid body) never.
18. [zone-height-from-floors] Size a hero/element zone split from what the elements actually need at their legibility floors — text height + one element row + padding — never from a fraction of the canvas.
