-- Run this FIRST only if you got a "policy already exists" or "table already exists"
-- error while running supabase-schema.sql. It safely clears anything a partial run
-- created, so you can run the full script again from a clean slate.

drop policy if exists "public can read markets" on markets;
drop policy if exists "public can insert markets" on markets;
drop policy if exists "public can update markets" on markets;
drop policy if exists "public can delete markets" on markets;

drop policy if exists "public can read flavors" on flavors;
drop policy if exists "public can insert flavors" on flavors;
drop policy if exists "public can update flavors" on flavors;
drop policy if exists "public can delete flavors" on flavors;

drop policy if exists "public can read orders" on orders;
drop policy if exists "public can insert orders" on orders;
drop policy if exists "public can update orders" on orders;

drop policy if exists "public can read event_requests" on event_requests;
drop policy if exists "public can insert event_requests" on event_requests;
drop policy if exists "public can update event_requests" on event_requests;

drop table if exists orders;
drop table if exists event_requests;
drop table if exists flavors;
drop table if exists markets;
