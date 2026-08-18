-- 044_import_past_clients_multi_property.sql
--
-- Follow-up to 043. Kim confirmed Courtney Cochetas closed several
-- distinct properties on the same day (Sterling, CO parcels). The
-- 043 dedupe key was (lower(borrower), closeDate) which collapsed
-- those legitimate closings — this migration adds them back with
-- a stronger id that includes a property slug so multi-property
-- days don't collide. Best, Matthew 2026-04-07 is included too —
-- Kim: if that turns out to duplicate an existing live loan for
-- the same Parkton NC property, delete the PC row via:
--   delete from public.loans where id='PC-Best-Matthew-2026-04-07-83';
--
-- Idempotent (ON CONFLICT DO NOTHING). Reversible via the
-- imported_from='past_clients_seed' delete filter from 043.

insert into public.loans (id, data, updated_at) values
  ('PC-Best-Matthew-2026-04-07-83', '{"month": "April", "year": 2026, "closeDate": "2026-04-07", "name": "Best, Matthew", "saleType": "PURCHASE", "property": "83 Commander Dr Parkton NC 28371", "price": 280000, "amount": 286020, "type": "VA", "rate": 6.125, "agent": "Allisha Eytcheson Smith", "phone": "585-770-3346", "email": "Bestmatt79@yahoo.com", "lo": "Kyle", "borrower": "Best, Matthew", "id": "PC-Best-Matthew-2026-04-07-83", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now()),
  ('PC-Cochetas-Courtney-2026-04-09-335', '{"month": "April", "year": 2026, "closeDate": "2026-04-09", "name": "Cochetas, Courtney", "saleType": "REFINANCE", "property": "335 Valley Dr Sterling CO 80751", "amount": 150000, "type": "CONV", "rate": 6.875, "agent": "Renee A. Selvidge", "phone": "303-507-5147", "email": "c3signing@gmail.com", "lo": "Missy", "borrower": "Cochetas, Courtney", "id": "PC-Cochetas-Courtney-2026-04-09-335", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now()),
  ('PC-Cochetas-Courtney-2026-04-09-377', '{"month": "April", "year": 2026, "closeDate": "2026-04-09", "name": "Cochetas, Courtney", "saleType": "REFINANCE", "property": "377 Bannock St Sterling CO 80751", "amount": 165000, "type": "CONV", "rate": 6.875, "agent": "Renee A. Selvidge", "phone": "303-507-5147", "email": "c3signing@gmail.com", "lo": "Missy", "borrower": "Cochetas, Courtney", "id": "PC-Cochetas-Courtney-2026-04-09-377", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now()),
  ('PC-Cochetas-Courtney-2026-04-09-430', '{"month": "April", "year": 2026, "closeDate": "2026-04-09", "name": "Cochetas, Courtney", "saleType": "PURCHASE", "property": "430 N 7th Ave Sterling CO 80751", "price": 193000, "amount": 154400, "type": "CONV", "rate": 6.875, "agent": "Renee A. Selvidge", "phone": "303-507-5147", "email": "c3signing@gmail.com", "lo": "Missy", "borrower": "Cochetas, Courtney", "id": "PC-Cochetas-Courtney-2026-04-09-430", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now()),
  ('PC-Cochetas-Courtney-2026-04-10-327', '{"month": "April", "year": 2026, "closeDate": "2026-04-10", "name": "Cochetas, Courtney", "saleType": "PURCHASE", "property": "327 Magnolia Ln Sterling CO 80751", "price": 210000, "amount": 168000, "type": "CONV", "rate": 6.875, "agent": "Renee A. Selvidge", "phone": "303-507-5147", "email": "c3signing@gmail.com", "lo": "Missy", "borrower": "Cochetas, Courtney", "id": "PC-Cochetas-Courtney-2026-04-10-327", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now()),
  ('PC-Cochetas-Courtney-2026-04-10-538', '{"month": "April", "year": 2026, "closeDate": "2026-04-10", "name": "Cochetas, Courtney", "saleType": "PURCHASE", "property": "538 California St Sterling CO 80751", "price": 255000, "amount": 207000, "type": "CONV", "agent": "Renee A. Selvidge", "phone": "303-507-5147", "email": "c3signing@gmail.com", "lo": "Missy", "borrower": "Cochetas, Courtney", "id": "PC-Cochetas-Courtney-2026-04-10-538", "stage": "funded", "status": "Funded", "archived": false, "imported_from": "past_clients_seed"}'::jsonb, now())
on conflict (id) do nothing;

notify pgrst, 'reload schema';