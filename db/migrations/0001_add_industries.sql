-- 2026-09-07: Industry becomes a controlled list, not free text — requested
-- by Lexie so it can back both the Job Create dropdown and Prompt Lab's
-- per-industry organization (prompt_recipes.industry needs a consistent
-- vocabulary, or "Health Supplement" vs "health supplement" vs "保健品"
-- would silently fragment into different buckets).
--
-- clients.industry / prompt_recipes.industry stay plain text columns (same
-- pattern as ad_solution/channel/placement — a lookup table for valid values,
-- not a foreign key enum) — see lib/industries.ts.
--
-- Seeded from the industries actually documented with validated redesign
-- experiments (16 Ref) or real fixture tickets (test_classifier.py), not
-- invented: e-commerce (Coupang), health supplement (Anlene), gaming
-- (NARAKA), food delivery (Keeta), government (Taiwan Workforce Development
-- Agency), banking/finance (Lotte Bank, Mox Invest), telecom (Kakao/Naver
-- roaming products).

create table if not exists industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into industries (name) values
  ('E-commerce'),
  ('Health Supplement'),
  ('Gaming'),
  ('Food Delivery'),
  ('Government / Public Sector'),
  ('Banking / Finance'),
  ('Telecom'),
  ('Other')
on conflict (name) do nothing;
