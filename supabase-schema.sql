-- Run this in Supabase's SQL Editor (Project > SQL Editor > New query) after creating
-- your NectarFusions Supabase project. Tip: select-all-delete the box before pasting,
-- and paste with Ctrl+V / Cmd+V so nothing gets truncated, then scroll down to confirm
-- it ends with the last "create policy" line before clicking Run.

create table if not exists markets (
  id text primary key,
  name text not null,
  address text,
  date date not null,
  start_time text not null,
  end_time text not null,
  slot_minutes int not null default 15,
  capacity_per_slot int not null default 3,
  bookings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists flavors (
  id text primary key,
  name text not null,
  category text not null default 'core', -- 'core' or 'seasonal'
  featured boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  items jsonb not null,
  total numeric not null,
  market_id text references markets(id),
  market_name text,
  market_address text,
  market_date date,
  slot text,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  notes text,
  picked_up boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists event_requests (
  id text primary key,
  event_date date,
  event_type text,
  quantity_estimate text,
  preferred_sizes text,
  preferred_flavors text,
  budget_note text,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- Row Level Security: open read/write for the site's public key, same pattern as
-- your Muck-a-Muck site. Fine for this use case (no sensitive account logins involved).
alter table markets enable row level security;
alter table flavors enable row level security;
alter table orders enable row level security;
alter table event_requests enable row level security;

create policy "public can read markets" on markets for select using (true);
create policy "public can insert markets" on markets for insert with check (true);
create policy "public can update markets" on markets for update using (true);
create policy "public can delete markets" on markets for delete using (true);

create policy "public can read flavors" on flavors for select using (true);
create policy "public can insert flavors" on flavors for insert with check (true);
create policy "public can update flavors" on flavors for update using (true);
create policy "public can delete flavors" on flavors for delete using (true);

create policy "public can read orders" on orders for select using (true);
create policy "public can insert orders" on orders for insert with check (true);
create policy "public can update orders" on orders for update using (true);

create policy "public can read event_requests" on event_requests for select using (true);
create policy "public can insert event_requests" on event_requests for insert with check (true);
create policy "public can update event_requests" on event_requests for update using (true);

-- Seed your core six flavors so they're ready to go on day one.
insert into flavors (id, name, category, featured, active, sort_order) values
  ('core-vanilla', 'Madagascar Vanilla', 'core', false, true, 1),
  ('core-cinnamon', 'Cinnamon', 'core', false, true, 2),
  ('core-lemon', 'Lemon', 'core', false, true, 3),
  ('core-blueberry', 'Blueberry', 'core', false, true, 4),
  ('core-raw', 'Natural Raw Unfiltered Michigan Honey', 'core', false, true, 5),
  ('core-chipotle', 'Smoked Chipotle', 'core', false, true, 6)
on conflict (id) do nothing;
