-- Run once in Supabase (SQL Editor -> New query -> paste -> Run), after supabase-update.sql.
-- Adds: stock per size (e.g. M 6, S 2, XL 0) and a custom material text.
alter table shop_products add column if not exists size_stock jsonb;
alter table shop_products add column if not exists mat_text jsonb;

-- Takes q pieces of one size in one locked step. Returns false if there are not enough.
create or replace function take_size_stock(pid int, sz text, q int) returns boolean language plpgsql as $$
declare cur int;
begin
  select coalesce((size_stock->>sz)::int, 0) into cur from shop_products where id = pid and size_stock is not null for update;
  if cur is null or cur < q then return false; end if;
  update shop_products set size_stock = jsonb_set(size_stock, array[sz], to_jsonb(cur - q)) where id = pid;
  update shop_products set stock = (select coalesce(sum(value::int), 0) from jsonb_each_text(size_stock)) where id = pid;
  return true;
end $$;

create or replace function give_size_stock(pid int, sz text, q int) returns void language plpgsql as $$
begin
  update shop_products set size_stock = jsonb_set(size_stock, array[sz], to_jsonb(coalesce((size_stock->>sz)::int, 0) + q)) where id = pid and size_stock is not null;
  update shop_products set stock = (select coalesce(sum(value::int), 0) from jsonb_each_text(size_stock)) where id = pid and size_stock is not null;
end $$;
