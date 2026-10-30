-- Run once in Supabase (SQL Editor -> New query -> paste -> Run): courier name on orders.
alter table orders add column if not exists courier text;
