-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). Adds delivery to the regions (viloyat) with BTS Express.
alter table orders add column if not exists region text;
alter table orders add column if not exists district text;
alter table orders add column if not exists recipient_phone text;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists bts_track text;
