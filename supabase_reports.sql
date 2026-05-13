create table public.reports (
  id uuid default gen_random_uuid() primary key,
  street_name text not null,
  item_type text not null,
  lat double precision,
  lng double precision,
  takeout_day text,
  collection_day text,
  created_at timestamptz default now()
);

alter table public.reports enable row level security;
create policy "anon_read"   on public.reports for select using (true);
create policy "anon_insert" on public.reports for insert with check (true);
