-- Reference: schema change, applied to production via the Supabase MCP migration
-- "items_nearby". Keep in sync if the function is edited.
--
-- Location-scoped item fetch for the map and feed. Uses the existing GiST index
-- on items.location (geography) via ST_DWithin, so cost stays flat as the table
-- grows across cities. SECURITY INVOKER (the default) — the items RLS policies
-- still apply, so callers only ever see approved items (or their own).
-- Returns setof items so the caller can keep chaining .select() with the
-- item_images embed, .or()/.eq() filters, .order() and .limit() as before.

create or replace function public.items_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 15
)
returns setof public.items
language sql
stable
set search_path = public
as $$
  select *
  from public.items
  where location is not null
    and st_dwithin(
      location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    );
$$;

revoke execute on function public.items_nearby(double precision, double precision, double precision) from public, anon;
grant  execute on function public.items_nearby(double precision, double precision, double precision) to authenticated;
