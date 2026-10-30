-- Run once in Supabase (SQL Editor -> New query -> paste -> Run).
-- Categories (top menu of the shop) and sections (second menu inside a category), managed in the admin panel (Sections tab).
create table if not exists shop_sections (
  key text primary key,
  kind text not null check (kind in ('cat', 'sub')),
  uz text not null,
  ru text not null,
  pos int default 0
);
alter table shop_sections enable row level security;
insert into shop_sections (key, kind, uz, ru, pos) values
  ('women', 'cat', 'Ayollar', 'Женское', 1),
  ('men', 'cat', 'Erkaklar', 'Мужское', 2),
  ('accessories', 'cat', 'Aksessuarlar', 'Аксессуары', 3),
  ('shoes', 'cat', 'Oyoq kiyim', 'Обувь', 4),
  ('sneakers', 'sub', 'Krossovkalar', 'Кроссовки', 5),
  ('boots', 'sub', 'Botinkalar', 'Ботинки', 6),
  ('dresses', 'sub', 'Ko‘ylaklar', 'Платья', 7),
  ('tops', 'sub', 'Ustki kiyim', 'Верх', 8),
  ('knitwear', 'sub', 'Trikotaj', 'Трикотаж', 9),
  ('bottoms', 'sub', 'Pastki kiyim', 'Низ', 10),
  ('outerwear', 'sub', 'Ustki qatlam', 'Верхняя одежда', 11),
  ('bags', 'sub', 'Sumkalar', 'Сумки', 12),
  ('scarves', 'sub', 'Sharflar', 'Шарфы', 13),
  ('hats', 'sub', 'Bosh kiyim', 'Головные уборы', 14)
on conflict (key) do nothing;
