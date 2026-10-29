-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. (Admin panel: products, stock, discounts, promo codes)
create table if not exists shop_products (
  id int primary key, cat text, art text, mat text,
  price int, sale int default 0, stock int, active boolean default true,
  sizes jsonb, colors jsonb, name jsonb
);
create table if not exists promos (code text primary key, percent int, active boolean default true, used int default 0);
alter table orders add column if not exists promo text;
alter table orders add column if not exists discount int default 0;
alter table shop_products enable row level security;
alter table promos enable row level security;
insert into shop_products (id,cat,art,mat,price,sale,stock,active,sizes,colors,name) values
(1,'men','shirt','linen',389000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#FFFFFF", "#7C8A9A", "#181818"]','{"uz": "Zig‘ir ko‘ylak", "ru": "Льняная рубашка"}'),
(2,'women','trousers','viscose',459000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#181818", "#B8A88F", "#6B5B4B"]','{"uz": "Keng shim", "ru": "Широкие брюки"}'),
(3,'women','coat','wool',1290000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#3A3733", "#C9B79C", "#181818"]','{"uz": "Uzun jun palto", "ru": "Длинное шерстяное пальто"}'),
(4,'men','tee','cotton',169000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#FFFFFF", "#181818", "#B8A88F"]','{"uz": "Asosiy futbolka", "ru": "Базовая футболка"}'),
(5,'women','knit','knit',559000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#D9CDBA", "#7A6A58", "#181818"]','{"uz": "Merinos sviter", "ru": "Свитер из мериноса"}'),
(6,'women','dress','viscose',679000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#181818", "#8C6F5A", "#CFC5B3"]','{"uz": "Midi ko‘ylak", "ru": "Платье миди"}'),
(7,'men','hoodie','cotton',489000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#4A4743", "#D3CDC0", "#181818"]','{"uz": "Qalin xudi", "ru": "Плотное худи"}'),
(8,'men','shorts','cotton',249000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#C7B89C", "#181818", "#7C8A9A"]','{"uz": "Chino shortik", "ru": "Шорты чино"}'),
(9,'women','skirt','viscose',399000,0,null,true,'["XS", "S", "M", "L", "XL"]','["#181818", "#C9B79C", "#5A4B3F"]','{"uz": "Plisse yubka", "ru": "Плиссированная юбка"}'),
(10,'accessories','tote','canvas',129000,0,null,true,null,'["#FFFFFF", "#181818"]','{"uz": "Kanvas sumka", "ru": "Сумка-шоппер"}'),
(11,'accessories','scarf','wool',219000,0,null,true,null,'["#B8A88F", "#3A3733", "#7C8A9A"]','{"uz": "Jun sharf", "ru": "Шерстяной шарф"}'),
(12,'accessories','cap','cotton',99000,0,null,true,null,'["#181818", "#D3CDC0"]','{"uz": "Paxta kepka", "ru": "Хлопковая кепка"}')
on conflict (id) do nothing;
