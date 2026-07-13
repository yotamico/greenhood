-- Reference: schema fix, run manually in the Supabase SQL editor.
-- Fixes 2026-07-13 code review findings #1 and #2:
--   1. increment_xp was callable by anyone (even logged-out visitors) with any
--      user_id/amount, with zero authorization check.
--   2. get_push_subscriptions_nearby was callable by anyone (even logged-out
--      visitors), leaking real users' push endpoints/keys and approximate location.

-- 1. increment_xp: allow only self-grants (a user giving themselves XP, as
--    happens today from the report/feedback screens) or admin-grants (an
--    admin giving XP to someone else, as happens today from greenhood-admin
--    when a feedback suggestion is marked "done"). Anyone else — including
--    unauthenticated callers — is rejected. Also pins search_path, fixing the
--    separate "mutable search_path" advisory on this function.
create or replace function public.increment_xp(user_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if auth.uid() <> user_id and not is_admin() then
    raise exception 'not authorized';
  end if;
  update profiles set xp = xp + amount where id = user_id;
end;
$$;

revoke execute on function public.increment_xp(uuid, integer) from anon;

-- 2. get_push_subscriptions_nearby: no client ever needs to call this
--    directly — only /api/broadcast-push does, from the server, using the
--    service role key (which keeps working; this revoke only affects the
--    anon/authenticated roles used by browser clients). Also pins search_path.
alter function public.get_push_subscriptions_nearby(double precision, double precision, double precision)
  set search_path = public;

revoke execute on function public.get_push_subscriptions_nearby(double precision, double precision, double precision)
  from anon, authenticated;
