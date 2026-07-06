-- Reference: schema applied directly to the Supabase project for the feedback feature.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  category text not null check (category = any (array['improve','keep','bug','idea'])),
  area text not null,
  message text not null,
  screenshot_url text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "feedback: own insert" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "feedback: own read" on public.feedback
  for select to authenticated
  using (auth.uid() = user_id);

create policy "feedback: admin read" on public.feedback
  for select to authenticated
  using (is_admin());

insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload feedback screenshots" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-screenshots');

create policy "Public can view feedback screenshots" on storage.objects
  for select to public
  using (bucket_id = 'feedback-screenshots');
