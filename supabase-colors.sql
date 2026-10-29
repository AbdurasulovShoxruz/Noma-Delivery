-- Run once in Supabase (SQL Editor -> New query -> paste -> Run).
-- Colour palette that the admin panel manages (Colours tab: add, rename, change shade, remove).
create table if not exists shop_colors (
  hex text primary key,
  name text not null,
  pos int default 0
);
alter table shop_colors enable row level security;
insert into shop_colors (hex, name, pos) values
  ('#FFFFFF', 'Oq', 1),
  ('#181818', 'Qora', 2),
  ('#7C8A9A', 'Ko‘kimtir-kulrang', 3),
  ('#B8A88F', 'Qumrang', 4),
  ('#6B5B4B', 'Jigarrang', 5),
  ('#3A3733', 'To‘q kulrang', 6),
  ('#C9B79C', 'Bej', 7),
  ('#D9CDBA', 'Och bej', 8),
  ('#7A6A58', 'Mokko', 9),
  ('#8C6F5A', 'Qahvarang', 10),
  ('#CFC5B3', 'Kulrang-bej', 11),
  ('#4A4743', 'Grafit', 12),
  ('#D3CDC0', 'Och kulrang', 13),
  ('#C7B89C', 'Xaki', 14),
  ('#5A4B3F', 'Shokolad', 15)
on conflict (hex) do nothing;
