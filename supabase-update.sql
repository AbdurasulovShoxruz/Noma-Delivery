-- Run once in Supabase (SQL Editor -> New query -> paste -> Run), after supabase-admin.sql.
alter table shop_products add column if not exists sub text;
alter table shop_products add column if not exists photos jsonb;
update shop_products set sub = case art
  when 'dress' then 'dresses' when 'tee' then 'tops' when 'shirt' then 'tops'
  when 'hoodie' then 'knitwear' when 'knit' then 'knitwear'
  when 'trousers' then 'bottoms' when 'shorts' then 'bottoms' when 'skirt' then 'bottoms'
  when 'coat' then 'outerwear' when 'tote' then 'bags' when 'scarf' then 'scarves' when 'cap' then 'hats' end
where sub is null;

-- Atomic stock: two orders at the same moment can no longer take the same piece.
create or replace function take_stock(pid int, q int) returns boolean language plpgsql as $$
declare n int;
begin
  update shop_products set stock = case when stock is null then null else stock - q end
  where id = pid and (stock is null or stock >= q);
  get diagnostics n = row_count;
  return n > 0;
end $$;
create or replace function give_stock(pid int, q int) returns void language sql as $$
  update shop_products set stock = stock + q where id = pid and stock is not null;
$$;

-- Public bucket for product photos (uploaded from the admin panel).
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict (id) do nothing;
