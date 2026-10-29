-- Run once in Supabase (after supabase-update.sql): adds 3 demo shoe products. Safe to run again.
insert into shop_products (id,cat,art,mat,price,sale,stock,active,sizes,colors,name,sub) values
(13,'shoes','sneaker','leather',689000,0,null,true,'["36","37","38","39","40","41","42","43","44","45","46"]','["#FFFFFF", "#181818", "#C9B79C"]','{"uz": "Charm krossovkalar", "ru": "Кожаные кроссовки"}','sneakers'),
(14,'shoes','boot','leather',899000,0,null,true,'["36","37","38","39","40","41","42","43","44","45","46"]','["#181818", "#6B5B4B"]','{"uz": "Chelsi botinkalari", "ru": "Ботинки челси"}','boots'),
(15,'shoes','sneaker','canvas',359000,0,null,true,'["36","37","38","39","40","41","42","43","44","45","46"]','["#FFFFFF", "#181818", "#B8A88F"]','{"uz": "Kanvas krossovkalar", "ru": "Холщовые кеды"}','sneakers')
on conflict (id) do nothing;
