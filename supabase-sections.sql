-- Run once in Supabase (SQL Editor -> New query -> paste -> Run).
-- Adds the "New Products" flag. Discounted Products needs nothing: it shows every product that has a discount.
alter table shop_products add column if not exists is_new boolean default false;

-- Demo: mark the three shoes as new so the section is not empty. Untick them in the admin panel any time.
update shop_products set is_new = true where id in (13, 14, 15);
