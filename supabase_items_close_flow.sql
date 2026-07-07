-- הרץ ב-Supabase SQL Editor
-- תומך במנגנון "דיווח נלקח" קהילתי לפריטים "גמישים" + חלון ערעור

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS closed_by                uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS pending_taken_by          uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS pending_taken_at          timestamptz,
  ADD COLUMN IF NOT EXISTS pending_reminder_sent_at  timestamptz;

-- יומן בקשות "דווח כנלקח" (append-only) — משמש להגבלת קצב, לא נמחק גם אם הבעלים דוחה
CREATE TABLE IF NOT EXISTS public.item_close_requests (
  id         uuid default gen_random_uuid() primary key,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  lat        double precision,
  lng        double precision,
  created_at timestamptz default now()
);

alter table public.item_close_requests enable row level security;
create policy "own_insert" on public.item_close_requests for insert with check (auth.uid() = user_id);
create policy "own_select" on public.item_close_requests for select using (auth.uid() = user_id);

-- דיווחי "עדיין שם" בחלון הערעור
CREATE TABLE IF NOT EXISTS public.item_dispute_reports (
  id         uuid default gen_random_uuid() primary key,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  created_at timestamptz default now(),
  unique(item_id, user_id)
);

alter table public.item_dispute_reports enable row level security;
create policy "own_insert" on public.item_dispute_reports for insert with check (auth.uid() = user_id);
