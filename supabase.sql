-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists customers (
  telegram_id  bigint primary key,
  phone        text not null,          -- digits only, e.g. 998901234567 (verified through Telegram)
  first_name   text,
  username     text,
  lang         text default 'uz',
  verified_at  timestamptz default now()
);

create table if not exists orders (
  id               bigserial primary key,
  telegram_id      bigint references customers(telegram_id),
  name             text,
  phone            text,
  type             text,               -- courier | pickup
  address          text,
  lat              double precision,
  lon              double precision,
  pay              text,               -- cash | card | online
  items            jsonb,
  subtotal         integer,
  delivery_fee     integer,
  total            integer,
  status           text default 'new', -- new | accepted | on_way | delivered | cancelled
  handled_by       text,
  lang             text default 'uz',
  group_message_id bigint,
  created_at       timestamptz default now()
);

-- Only the server (service key) may read or write these tables. No public policies on purpose.
alter table customers enable row level security;
alter table orders    enable row level security;
