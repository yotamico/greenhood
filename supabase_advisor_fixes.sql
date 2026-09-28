-- Reference: schema change, applied via the Supabase MCP on 2026-09-28.
-- Response to Supabase's security/performance advisors (checked ahead of onboarding more
-- users to several cities). Two live findings worth calling out:
--
-- 1. supabase_lockdown_rpc_functions.sql's `revoke execute ... from anon, authenticated`
--    lines were a NO-OP: Postgres grants EXECUTE on every new function to the PUBLIC
--    pseudo-role by default, and anon/authenticated never had an EXPLICIT grant of their
--    own — their access came entirely through PUBLIC, so revoking from the named roles
--    revoked nothing. get_push_subscriptions_nearby (real users' push endpoints + approx.
--    location) was confirmed still callable by anon via a live curl to
--    /rest/v1/rpc/get_push_subscriptions_nearby. `revoke ... from public` is the fix; it
--    does not touch a role's own EXPLICIT grant (increment_xp keeps `authenticated`'s).
-- 2. Several trigger-only functions (handle_new_user, notify_moderation_decision,
--    notify_pending_item, trigger_validate_item, prevent_self_moderation) were directly
--    callable via PostgREST RPC even though they only make sense fired by their trigger
--    (they read the NEW/OLD row, which doesn't exist otherwise) — revoked from PUBLIC too.
--    Confirmed none of the revoked functions are referenced in any RLS policy's USING/WITH
--    CHECK (pg_policies), so this can't break row-level security enforcement; triggers keep
--    firing regardless, since SECURITY DEFINER functions run with the *defining* role's
--    rights when invoked by a trigger, independent of the caller's own EXECUTE grant.
--
-- is_admin() is deliberately left alone: several RLS policies call it directly in their
-- USING clause, so anon/authenticated need EXECUTE on it for those row-security checks to
-- run at all. It's harmless to call directly anyway — it only reports whether the CALLER's
-- own auth.uid() is the admin, never anyone else's.

revoke execute on function public.get_push_subscriptions_nearby(double precision, double precision, double precision) from public;
revoke execute on function public.increment_xp(uuid, integer) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.notify_moderation_decision() from public;
revoke execute on function public.notify_pending_item() from public;
revoke execute on function public.trigger_validate_item() from public;
revoke execute on function public.prevent_self_moderation() from public;

-- "Function Search Path Mutable" advisory — same fix already applied to increment_xp and
-- get_push_subscriptions_nearby, extended to the functions that were still missing it.
alter function public.handle_new_user() set search_path = public;
alter function public.prevent_self_moderation() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.trigger_validate_item() set search_path = public;

-- "Unindexed foreign keys" advisory — columns this app's own queries filter/join on
-- constantly (item_images/messages/message_reads/saved_items by item_id, items by
-- reporter_id and the closure-flow user columns, etc.). Free at today's row counts; a
-- join/filter without a covering index degrades linearly as a table grows.
create index if not exists idx_ai_suggestions_item_id on public.ai_suggestions(item_id);
create index if not exists idx_feedback_user_id on public.feedback(user_id);
create index if not exists idx_item_close_requests_item_id on public.item_close_requests(item_id);
create index if not exists idx_item_close_requests_user_id on public.item_close_requests(user_id);
create index if not exists idx_item_dispute_reports_user_id on public.item_dispute_reports(user_id);
create index if not exists idx_item_images_item_id on public.item_images(item_id);
create index if not exists idx_items_closed_by on public.items(closed_by);
create index if not exists idx_items_pending_taken_by on public.items(pending_taken_by);
create index if not exists idx_items_reporter_id on public.items(reporter_id);
create index if not exists idx_items_taken_by on public.items(taken_by);
create index if not exists idx_message_reads_item_id on public.message_reads(item_id);
create index if not exists idx_messages_item_id on public.messages(item_id);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_nav_intents_item_id on public.nav_intents(item_id);
create index if not exists idx_nav_intents_user_id on public.nav_intents(user_id);
create index if not exists idx_saved_items_item_id on public.saved_items(item_id);

-- Deliberately NOT fixed here (see chat for reasoning):
--  - "Extension in Public" (postgis in the public schema) — Supabase's own suggested fix is
--    moving the extension to a dedicated schema, which risks breaking every unqualified
--    geography/geometry type reference and ST_* call across the app (items.location,
--    items_nearby, the street-schedule adapters' geocoding). Needs a dedicated migration
--    with real testing, not a quick advisory fix.
--  - "RLS Disabled in Public" on spatial_ref_sys — PostGIS's own EPSG reference table, not
--    app data (harmless if readable). Couldn't fix via the Supabase MCP: `alter table
--    public.spatial_ref_sys enable row level security` failed with "must be owner of table"
--    (owned by the extension/superuser, not this project's migration role). Needs the
--    Supabase dashboard's SQL editor (runs as a more privileged role) or leaving as-is.
--  - "Leaked Password Protection Disabled" — an Auth setting (HaveIBeenPwned check on
--    signup/password-change), not a schema change; toggle in the Supabase dashboard under
--    Authentication -> Policies -> Password Security.
--  - auth_rls_initplan (21 findings: RLS policies calling auth.uid() unwrapped, so it
--    re-evaluates per row instead of once) and multiple_permissive_policies (11 findings:
--    items/feedback have separate "admin" and "own" policies for the same role+action) — a
--    real win as tables grow, but touches ~10 tables' worth of existing policies; proposed
--    as a follow-up batch rather than folded in here.
