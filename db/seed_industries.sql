-- See db/migrations/0001_add_industries.sql for rationale and sourcing.
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
