-- Generation-path layout rules, moved out of lib/naraka-generation.ts.
--
-- These lived as a ruleText dictionary in TypeScript with a hand-written if/else
-- resolver beside it, and a THIRD copy of the labels in app/workspace/page.tsx —
-- which had already drifted (RULE_DETAILS carried extreme-landscape-safe-zone, a
-- slug the resolver never emits). That is the failure 0004_add_recipe_rules.sql
-- was written to stop, reappearing in a different file.
--
-- They go on the General recipe, not the Gaming one: none of them is
-- gaming-specific, and the Drive path resolves the same baseline.
--
-- applies_to gains two keys used only by this surface:
--   layoutFamily   ultra_landscape | landscape | standard | portrait | ultra_portrait | any
--   roles          confirmed object roles that must be present for the rule to apply
--   minAspectRatio extra floor on top of the family (the 3:1-to-4:1 band)
-- and "surface": "generate" marks the pipeline a rule serves. The skill path
-- resolves by aspect class, which is a DIFFERENT taxonomy on purpose — forcing
-- one vocabulary on both would change which rules an existing target receives.
-- resolve_prompt.py skips this surface; the generation resolver takes only it.

delete from recipe_rules where recipe_id = 'aa92bff2-299a-4626-b598-9c4799e6dbcf' and applies_to->>'surface' = 'generate';

insert into recipe_rules (recipe_id, slug, statement, why, applies_to, enforcement, severity, layer, created_by) values
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'preserve-brand-and-visible-copy', 'Preserve the same brand identity and exact visible copy; do not invent, translate, rewrite, or omit text.', null, '{"surface": "generate", "layoutFamily": ["any"]}'::jsonb, 'eye', 'block', 'global', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'protect-required-objects', 'Keep every required object visible and separated from other solid object mass.', null, '{"surface": "generate", "layoutFamily": ["any"]}'::jsonb, 'eye', 'block', 'global', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'no-stretch', 'Never stretch or squeeze people, logos, or typography.', null, '{"surface": "generate", "layoutFamily": ["any"]}'::jsonb, 'eye', 'block', 'global', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'extreme-layer-compositor', 'Generate only the background with the Image API, then place approved transparent original-pixel layers with the deterministic compositor.', 'Asked to redraw an extreme-ratio canvas whole, the model redraws the logo, the copy and the compliance badge — exactly the pixels nobody is allowed to change.', '{"surface": "generate", "layoutFamily": ["ultra_landscape", "ultra_portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'background-outpaint-only', 'Outpaint the source environment across the full canvas without flat-color padding or regenerated foreground objects.', null, '{"surface": "generate", "layoutFamily": ["ultra_landscape", "ultra_portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'ultra-landscape-zones', 'Use one compact horizontal row across the working canvas: brand at the left, compact hero next, headline/copy/CTA next, and the complete compliance badge at the outer-right corner. Keep the outer background simple so it can be extended without repeating objects.', null, '{"surface": "generate", "layoutFamily": ["ultra_landscape"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'landscape-safe-zone', 'Keep all required content inside the final extraction region and use a horizontal visual hierarchy.', null, '{"surface": "generate", "layoutFamily": ["landscape"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'horizontal-copy-row', 'Use a horizontal copy row rather than a tall text stack.', null, '{"surface": "generate", "layoutFamily": ["landscape"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'wide-landscape-crop-safe-band', 'The Image API working canvas is taller than the delivered banner. Keep the top 12% and bottom 12% completely free of logos, people, copy, CTA, platform marks, compliance, and decorative frames. Place every required object''s complete bounds inside the central 76% horizontal band; only continuous painted background may enter the trim zones.', 'The Image API working canvas is taller than the delivered banner, so objects the model placed near the top or bottom edge were cut by the final centre crop after generation.', '{"surface": "generate", "layoutFamily": ["landscape"], "minAspectRatio": 3}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'wide-protected-layer-overlay', 'Generate the hero and scene plate without protected foreground content, apply the final crop, then place only the original PSD layers present in the confirmed inventory inside deterministic safe zones. Never invent a missing CTA, platform mark, gameplay frame, or other object.', null, '{"surface": "generate", "layoutFamily": ["landscape"], "minAspectRatio": 3}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'ultra-portrait-zones', 'Use a top-to-bottom composition across the working canvas: brand at top, complete hero identity area in the middle, headline/copy/CTA below, and the complete compliance badge at the outer-bottom corner. Keep the outer background simple so it can be extended without repeating objects.', null, '{"surface": "generate", "layoutFamily": ["ultra_portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'optional-elements-omit-first', 'If space is limited, omit optional decorative or supporting visual elements before shrinking, cropping, obstructing, or omitting any required element.', null, '{"surface": "generate", "layoutFamily": ["ultra_landscape", "ultra_portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'portrait-hero-center', 'Center the hero''s visual body mass in the portrait frame and keep the identity area visible.', null, '{"surface": "generate", "layoutFamily": ["portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'stack-copy-with-clear-separation', 'Stack copy only where it remains readable and clearly separated from the hero.', null, '{"surface": "generate", "layoutFamily": ["portrait"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'balanced-recomposition', 'Recompose the inventory with balanced visual hierarchy for the target ratio.', null, '{"surface": "generate", "layoutFamily": ["standard"]}'::jsonb, 'eye', 'block', 'layout', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'keep-compliance-in-source-corner', 'Compliance is a hard constraint. Keep the entire compliance badge visible in a corner: uncropped, unobstructed, undistorted, and with its complete border and contents intact. It may remain small, but no part may leave the canvas.', 'Compliance content is a legal requirement, not a design priority that can lose to a tight layout — the same constraint badge-corner-and-floor states for the skill path.', '{"surface": "generate", "roles": ["Compliance"]}'::jsonb, 'eye', 'block', 'industry', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'keep-logo-legible', 'Keep the brand logo complete and legible.', null, '{"surface": "generate", "roles": ["Brand logo"]}'::jsonb, 'eye', 'block', 'industry', 'lexie.fang@appier.com'),
  ('aa92bff2-299a-4626-b598-9c4799e6dbcf', 'keep-hero-identity-area-visible', 'Keep the hero''s complete face, head details, and primary silhouette visible.', null, '{"surface": "generate", "roles": ["Hero"]}'::jsonb, 'eye', 'block', 'industry', 'lexie.fang@appier.com');
