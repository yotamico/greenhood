-- Reference: schema fix, run manually in the Supabase SQL editor.
-- Fixes 2026-07-13 code review finding #6 (analyze-image had no auth or rate
-- limit, letting anyone burn unlimited Anthropic API credit). The route now
-- requires a logged-in session and logs every attempt here to enforce
-- 5 requests/hour/user. Written to and read from only by the server (service
-- role), so no client-facing RLS policies are needed — RLS is enabled with no
-- policies, which denies anon/authenticated access by default.
create table public.ai_analyze_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.ai_analyze_requests enable row level security;

create index ai_analyze_requests_user_id_created_at_idx
  on public.ai_analyze_requests (user_id, created_at);
