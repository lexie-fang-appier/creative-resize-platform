-- Decomposition of "Gaming — Character-Centric Key Art" v9 (~4200 words of prose) into
-- one row per rule. Nothing is invented here and nothing is dropped: every row traces to
-- text that existed in v9, and the `why` column carries the incident that produced it.
--
-- 18 rules. 10 are enforceable by code (enforcement = validator:*) and therefore need no
-- prompt prose at all; 8 are genuine judgment calls and stay as prose the model/agent reads.

\set recipe '4c4c128c-e7c5-4431-9599-15307e42ff15'
\set author 'lexie.fang23@gmail.com'

insert into validators (name, entrypoint, description) values
  ('crop_aspect',          'scripts/crop_box.py verify',
   'Fails when a crop box resized into its output region would not be a uniform scale.'),
  ('scene_extraction',     'scripts/extract_scene.py',
   'Composites the scene via the parent group with re-placed elements hidden, so blend modes are applied and nothing appears twice.'),
  ('bleed_coverage',       'scripts/validate_bleed.py',
   'Fails when a crop region reaches past the shortest layer contributing colour/grade to it.'),
  ('corner_anchor',        'scripts/validate_anchor.py',
   'Compares a placed element''s edge margins against the source layer''s own corner_anchor.'),
  ('text_floor',           'scripts/validate_text.py',
   'Fails when any true-text element renders below its legibility floor, or when a source line is missing.'),
  ('badge_size',           'scripts/validate_badge.py',
   'Fails when the compliance badge grows relative to canvas height compared with the source.'),
  ('inset_count',          'scripts/validate_insets.py',
   'Fails when hero-content insets are missing, clipped by the canvas, or below the recognizability floor.'),
  ('fine_detail_shadow',   'scripts/validate_shadow.py',
   'Fails when a dilated shadow is applied to a layer whose fine_detail_ratio is below 0.3.'),
  ('zone_height',          'scripts/validate_zone.py',
   'Fails when a hero/element zone split is taller than the elements need at their legibility floors.'),
  ('crosscheck_render',    'scripts/crosscheck_render.py',
   'Renders each isolated layer beside the same region cropped from the full composite. Produces evidence; the verdict stays human.')
on conflict (name) do nothing;

insert into recipe_rules (recipe_id, slug, statement, why, applies_to, enforcement, layer, created_by) values

(:'recipe', 'crop-aspect-first',
 $$Derive a hero crop's dimensions FROM the target aspect ratio before any resize: pin the dimension the framing needs, compute the other from the target ratio. A crop of one aspect force-resized into an output of another stretches the hero.$$,
 $$YJp814's 320x1200 shipped a 500x640 crop resized straight into a 320x780 box — a 66% squeeze. It passed every framing, overlap and legibility check; the only symptom was "he looks too narrow", which took a human eye to catch days later.$$,
 '{"aspect":["any"]}', 'validator:crop_aspect', 'global', :'author'),

(:'recipe', 'framing-floor',
 $$Every hero instance shows its ENTIRE identity-critical core — a character's whole head including hair ornaments, horns and crowns; an object's whole recognizable core such as a hilt or engraved mark — down through its immediate extension (chest/upper torso, or an object's near reach). Never crop tighter, and never zoom out so far it reads as tiny.$$,
 $$Extreme matte ratios kept only a face sliver, which stops reading as this character. Formalized by Lexie 2026-09-10 as a standing floor after the YJp816 round.$$,
 '{"aspect":["any"]}', 'eye', 'layout', :'author'),

(:'recipe', 'multi-instance-joint-constraint',
 $$When more than one hero instance shares one crop, their framing is a joint constraint: after any crop shift, re-check EVERY instance's core boundary at that exact position, not just the one being optimized. Iterate toward a value that satisfies all of them.$$,
 $$On YJp816, raising the left character to fix her framing pushed the right character's horn ornament past the top edge. y0=200 fixed A and clipped B; y0=150 kept B and under-raised A; ~160-165 satisfied both.$$,
 '{"traits":["multi_instance"]}', 'eye', 'layout', :'author'),

(:'recipe', 'fill-hierarchy',
 $$Fill any zone the hero art does not cover in this order: (1) a character-free real-art region from THIS asset — the sky band above the hero, the ground below its feet — aspect-matched and feathered at the seam; (2) a flat gradient from colours sampled next to the join; (3) a blurred/stretched copy of the art, and only for a background-only zone with no hero content. Never an opaque panel replacing scene content, and never large blurred padding flanking real hero crops.$$,
 $$Lexie rejected wide blurred edge padding outright ("絕對不要做出邊緣大面積模糊的圖", 2026-09-10). Then on PR196.3 a blurred info-band was cutting away art on aspects where the crop already covered the whole canvas, while the pavement below the hero's feet sat unused — real scene beats any synthesized fill, and the seam disappears because both zones are the same scene.$$,
 '{"traits":["any_fill"]}', 'eye', 'global', :'author'),

(:'recipe', 'zone-height-from-floors',
 $$Size a hero/element zone split from what the elements actually need at their legibility floors — text height + one element row + padding — never from a fraction of the canvas.$$,
 $$PR196.3's bands were a guessed 32-34% of canvas height, stealing ~50px from the hero on every landscape size for no reason. Computed from the floors they came out at 24-25%.$$,
 '{"traits":["split_layout"]}', 'validator:zone_height', 'layout', :'author'),

(:'recipe', 'portrait-center-body-mass',
 $$For a portrait/vertical target, centre the crop on the hero's solid body mass (torso/core midline), not the bounding box of everything attached to it. Let asymmetric extensions — flowing hair, a trailing sash, an outstretched weapon — fall unevenly.$$,
 $$YJp814's 320x1200 read as shifted right even though the bounding box was centred: the hair streamed left while the solid torso sat right. Lexie: "如果是直立型，請確保人物置於橫向的中間".$$,
 '{"aspect":["portrait"]}', 'eye', 'layout', :'author'),

(:'recipe', 'text-row-not-stack',
 $$On a matte (short-wide) target, arrange true text as a horizontal row spreading toward the hero, not stacked vertically against one edge. A brand logo may stay in a top-corner brand-mark position outside the row.$$,
 $$Written after YJp810/811 defaulted to a stacked left column that read as a flat list rather than a composed banner.$$,
 '{"aspect":["matte"]}', 'eye', 'layout', :'author'),

(:'recipe', 'text-legibility-floor',
 $$Check EVERY true-text layer (psd-tools kind=='type') independently against human legibility at the output's actual pixel size, and keep every line the source has — if the block does not fit, shrink it as one unit rather than dropping a line.$$,
 $$Two separate incidents: the 1456x180 pass dropped a subtitle that was part of the product name, and YJp816's nameplate sat at an inherited small size while the title was being sized generously. Sizing one text element correctly says nothing about the others.$$,
 '{"aspect":["any"]}', 'validator:text_floor', 'layout', :'author'),

(:'recipe', 'per-instance-label-adjacency',
 $$A per-instance label (nameplate, name banner) stays visually beside its own instance wherever that instance appears — never pooled into a shared text zone with another instance's label.$$,
 $$YJp816's 320x1200 moved both nameplates into the shared bottom zone. Every glyph was on the canvas and Lexie still called it the same problem as dropping them: a label detached from its subject reads as lost.$$,
 '{"traits":["multi_instance"]}', 'eye', 'layout', :'author'),

(:'recipe', 'zero-overlap-tiers',
 $$No text or icon element overlaps the hero or a hero-content inset, verified at the EXACT final position and size, at true output pixel scale. Acceptable-overlap tiers: background/environment fine; thin flowing material (hair strands, hems) fine where the source design already does it; solid hero mass (skin, face, armour, an object's solid body) never.$$,
 $$YJp816's title landed on a diagonal reaching arm because the gap was measured at a different height — a gap check only holds where it was measured. On PR196.3 an inset row placed against the body's edge still landed on the spear blade, which is solid object mass.$$,
 '{"aspect":["any"]}', 'eye', 'layout', :'author'),

(:'recipe', 'badge-corner-and-floor',
 $$The compliance/rating badge is a hard constraint, not a priority-ranked element: always visible and legible, on THIS asset's own corner (read the source layer's bbox), sized to its legibility floor and never enlarged because the canvas grew.$$,
 $$Early rounds pushed it past 30% of canvas height "to be safe"; it tested clearly legible at 30px. Separately, Keeta's badge corner was assumed from a previous asset and placed wrongly.$$,
 '{"aspect":["any"]}', 'validator:badge_size', 'industry', :'author'),

(:'recipe', 'hero-content-insets-all',
 $$Hero-content insets — gameplay/skill-showcase thumbnails embedded in the key art — carry the same priority as the hero itself. Include all of them, sized so the content inside is recognizable, not just the badge silhouette. If one genuinely cannot be made recognizable at a target size, flag for Designer review rather than omitting or shrinking it below that.$$,
 $$NARAKA's first pass discarded all three skill badges as decoration. Lexie: "他的招式也都是很重要的hero".$$,
 '{"traits":["has_insets"]}', 'validator:inset_count', 'industry', :'author'),

(:'recipe', 'no-dilated-shadow-on-fine-detail',
 $$Never apply a dilated/expanded contact shadow to fine line-art or a small multi-character icon row (fine_detail_ratio below ~0.3) — the dilation bridges the gaps between strokes and reads as blur. Shape-hugging shadows are for thick strokes only.$$,
 $$NARAKA's platform-icon row was given the title's shadow treatment in v4; the dilation radius exceeded the stroke spacing in "SERIES"/"X|S" and filled the counters.$$,
 '{"aspect":["any"]}', 'validator:fine_detail_shadow', 'layout', :'author'),

(:'recipe', 'isolated-render-crosscheck',
 $$Any isolated layer render whose exact appearance matters must be compared side by side with the same bbox cropped from the full flattened composite before it is trusted. Sample actual pixel values before concluding anything about a backing plate's colour.$$,
 $$psd-tools silently misrendered the NARAKA logo, and three different numeric heuristics failed to separate "legitimately mostly transparent" from "wrongly rendered" — so this cannot be automated past producing the comparison. The same logo was also assumed white-backed until its pixels turned out dark red.$$,
 '{"aspect":["any"]}', 'validator:crosscheck_render', 'layout', :'author'),

(:'recipe', 'scene-extraction-integrity',
 $$Extract the scene by hiding every element you will re-place — text, logo, badge AND hero-content insets — then calling composite() on the parent group. Never hand-pick named sub-layers and alpha_composite them yourself.$$,
 $$Manual compositing ignores real blend modes: YJp814's multiply layer printed a hard-edged rectangle at its own bbox, well inside the canvas, that looked exactly like a bleed seam. And on PR196.3 leaving the source's inset row in the scene made the insets appear twice in every crop that reached them.$$,
 '{"aspect":["any"]}', 'validator:scene_extraction', 'global', :'author'),

(:'recipe', 'bleed-seam-check',
 $$Before using any crop region that reaches past the original canvas into bleed margin, confirm every layer contributing colour, grade or effect to that region actually covers it — inspect a strip straddling the boundary.$$,
 $$A colour-grade/vignette layer can stop at the original canvas edge while the base art extends further; cropping past it produces a visible tonal seam that looks like a compositing bug.$$,
 '{"traits":["uses_bleed"]}', 'validator:bleed_coverage', 'global', :'author'),

(:'recipe', 'house-rules-over-source-precedent',
 $$An established layout rule applies by default even when this asset's own source PSD does the opposite — "the source already does it this way" is usually the exact habit the rule was written to override. Corner anchoring and badge position are the exception: those are read from THIS asset. If a genuine reason to deviate appears, surface it as a question rather than deciding silently.$$,
 $$YJp815 skipped row-not-stack because the source PSD stacked text left; that source layout is precisely what the rule exists to correct. Lexie flagged it and the size had to be rebuilt.$$,
 '{"aspect":["any"]}', 'eye', 'global', :'author');

insert into recipe_rules (recipe_id, slug, statement, why, applies_to, enforcement, layer, created_by) values
(:'recipe', 'corner-anchor-preserved',
 $$Any element whose source layer sits flush to a canvas edge stays flush to that same edge at the new size, preserving the source's own relative margin. Read the edge from this asset's layer bbox (layer_metadata's corner_anchor) — never carry over a previous asset's corner.$$,
 $$Corner anchoring is a deliberate design decision, not the generic padding logic other elements use, and it is asset-specific: Keeta's compliance badge was placed on an assumed corner. On PR196.3 the copyright line is left+bottom flush and the disclosure line right+bottom flush — two different corners in one asset.$$,
 '{"aspect":["any"]}', 'validator:corner_anchor', 'layout', :'author');

-- All ten validators now have code under scripts/ (see the entrypoint column). Each was
-- written against a defect that had already shipped once and is verified against a manifest
-- reproducing it, so none of these is an always-passes stub. If a future validator is
-- registered before its script exists, insert it with status='declared' — a gate that
-- reports "not checked" is honest; one that reports a pass it never made is not.
