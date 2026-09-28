-- Reference: schema for the advertisers / sponsored-ads feature.
-- Applied to production via the Supabase MCP migration "ads". Keep in sync if edited.
--
-- Model:
--   advertisers   — a local business the admin closed a deal with (manual deal terms, no billing)
--   ad_campaigns  — one ad creative + its targeting (categories, keywords, radius around the business)
--   ad_events     — impression / click / dismiss log; source of truth for stats and frequency caps
--   ad_preferences— per-user opt-out of personalized ads (ads based on what the user collected)
--
-- Clients never read advertisers/ad_campaigns/ad_events directly. The app goes through two
-- SECURITY DEFINER RPCs (ads_pick, ads_log_event) and the admin through RLS (is_admin()) plus
-- ads_campaign_stats. Advertisers only ever get aggregate numbers — never user ids.
--
-- Placements (where in the app an ad can show):
--   item      — item detail page, viewer is not the owner (contextual: the item being viewed)
--   collected — item detail page, viewer is the one who collected it (closed_by = viewer)
--   report    — item detail page, viewer is the reporter/owner
--   me        — profile page, based on the user's recently collected items (last 30 days)
-- 'collected' and 'me' are behavioral, so they respect ad_preferences.personalized = false.

-- ── Tables ─────────────────────────────────────────────────────────────────────
create table public.advertisers (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null,
  contact_name   text,
  phone          text,
  email          text,
  website        text,
  address        text,
  lat            double precision,
  lng            double precision,
  deal_type      text not null default 'monthly'
                   check (deal_type in ('monthly','per_click','trial','other')),
  deal_price     numeric(10,2),
  deal_start     date,
  deal_end       date,
  notes          text,
  status         text not null default 'active' check (status in ('active','paused')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.ad_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  advertiser_id       uuid not null references public.advertisers(id) on delete cascade,
  name                text not null,
  headline            text not null,
  body                text,
  image_url           text,
  cta_type            text not null default 'navigate'
                        check (cta_type in ('call','whatsapp','website','navigate')),
  cta_value           text,
  categories          text[] not null default '{}',
  keywords            text[] not null default '{}',
  radius_km           numeric(6,2) not null default 10 check (radius_km > 0 and radius_km <= 200),
  placements          text[] not null default '{item,collected,report,me}',
  starts_at           date,
  ends_at             date,
  max_impressions     integer check (max_impressions is null or max_impressions > 0),
  per_user_daily_cap  integer not null default 3 check (per_user_daily_cap > 0),
  status              text not null default 'draft' check (status in ('draft','active','paused','ended')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ad_campaigns_advertiser_idx on public.ad_campaigns(advertiser_id);
create index ad_campaigns_active_idx on public.ad_campaigns(status) where status = 'active';

create table public.ad_events (
  id               bigint generated always as identity primary key,
  campaign_id      uuid not null references public.ad_campaigns(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  event            text not null check (event in ('impression','click','dismiss')),
  placement        text not null check (placement in ('item','collected','report','me')),
  item_id          uuid references public.items(id) on delete set null,
  matched_keyword  text,
  created_at       timestamptz not null default now()
);
create index ad_events_campaign_idx on public.ad_events(campaign_id, event, created_at);
create index ad_events_user_idx     on public.ad_events(user_id, campaign_id, created_at);
create index ad_events_item_idx     on public.ad_events(item_id);

create table public.ad_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  personalized  boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table public.advertisers    enable row level security;
alter table public.ad_campaigns   enable row level security;
alter table public.ad_events      enable row level security;
alter table public.ad_preferences enable row level security;

create policy "advertisers: admin all"  on public.advertisers  for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "ad_campaigns: admin all" on public.ad_campaigns for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "ad_events: admin read"   on public.ad_events    for select to authenticated
  using (is_admin());
-- No insert policy on ad_events: writes go only through ads_log_event().

create policy "ad_preferences: own read"   on public.ad_preferences for select to authenticated
  using (auth.uid() = user_id);
create policy "ad_preferences: own insert" on public.ad_preferences for insert to authenticated
  with check (auth.uid() = user_id);
create policy "ad_preferences: own update" on public.ad_preferences for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage: ad creatives ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('ad-images', 'ad-images', true)
on conflict (id) do nothing;

create policy "ad-images: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-images' and is_admin());
create policy "ad-images: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'ad-images' and is_admin());
create policy "ad-images: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ad-images' and is_admin());
create policy "ad-images: public read"  on storage.objects for select to public
  using (bucket_id = 'ad-images');

-- ── ads_pick: choose the best-matching ad(s) for the calling user ─────────────
-- Scoring: keyword hit in the item's title/description/tags = 10, category hit = 5.
-- A campaign with no categories and no keywords is a "general" ad for its radius (score 1).
-- Hard filters: campaign+advertiser active, inside date range, placement allowed, item within
-- radius_km of the business, under max_impressions, under per-user daily cap, not dismissed by
-- this user in the last 30 days. Ties rotate randomly so equal advertisers share exposure.
create or replace function public.ads_pick(
  p_placement text,
  p_item_id   uuid default null,
  p_limit     integer default 1
)
returns table (
  campaign_id       uuid,
  advertiser_name   text,
  headline          text,
  body              text,
  image_url         text,
  cta_type          text,
  cta_value         text,
  business_address  text,
  business_lat      double precision,
  business_lng      double precision,
  distance_km       double precision,
  item_id           uuid,
  item_title        text,
  matched_keyword   text,
  match_reason      text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid,
           coalesce((select ap.personalized from ad_preferences ap where ap.user_id = auth.uid()), true) as personalized
  ),
  src as (
    select i.id, i.title, i.category, i.location,
           lower(coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' ||
                 coalesce(array_to_string(i.tags, ' '), '')) as txt
    from items i, me
    where me.uid is not null
      and i.location is not null
      and p_placement in ('item','collected','report','me')
      and (p_placement not in ('collected','me') or me.personalized)
      and (
        ( p_item_id is not null and p_placement <> 'me'
          and i.id = p_item_id
          and (i.moderation_status = 'approved' or i.reporter_id = me.uid)
          and (p_placement <> 'collected' or i.closed_by = me.uid)
          and (p_placement <> 'report'    or i.reporter_id = me.uid) )
        or
        ( p_item_id is null and p_placement = 'me'
          and i.closed_by = me.uid
          and i.taken_at > now() - interval '30 days' )
      )
    order by coalesce(i.taken_at, i.created_at) desc
    limit 5
  ),
  cand as (
    select c.id as cid, a.business_name, c.headline as hl, c.body as bd, c.image_url as img,
           c.cta_type as ctat, c.cta_value as ctav, a.address as addr, a.lat as alat, a.lng as alng,
           s.id as sid, s.title as stitle,
           (select k from unnest(c.keywords) k
             where length(trim(k)) > 0 and position(lower(trim(k)) in s.txt) > 0
             limit 1) as kw,
           (s.category = any(c.categories)) as catm,
           (cardinality(c.categories) = 0 and cardinality(c.keywords) = 0) as general,
           st_distance(s.location, st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography) / 1000.0 as dist
    from ad_campaigns c
    join advertisers a on a.id = c.advertiser_id
    cross join src s
    cross join me
    where c.status = 'active' and a.status = 'active'
      and p_placement = any(c.placements)
      and (c.starts_at is null or c.starts_at <= current_date)
      and (c.ends_at   is null or c.ends_at   >= current_date)
      and a.lat is not null and a.lng is not null
      and st_dwithin(s.location, st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography, c.radius_km * 1000)
      and (c.max_impressions is null or
           (select count(*) from ad_events e where e.campaign_id = c.id and e.event = 'impression') < c.max_impressions)
      and (select count(*) from ad_events e
            where e.campaign_id = c.id and e.user_id = me.uid and e.event = 'impression'
              and e.created_at > now() - interval '24 hours') < c.per_user_daily_cap
      and not exists (select 1 from ad_events e
            where e.campaign_id = c.id and e.user_id = me.uid and e.event = 'dismiss'
              and e.created_at > now() - interval '30 days')
  ),
  scored as (
    select distinct on (cid) *,
           (case when kw is not null then 10 else 0 end) +
           (case when catm then 5 else 0 end) +
           (case when general then 1 else 0 end) as score
    from cand
    where kw is not null or catm or general
    order by cid,
             (case when kw is not null then 10 else 0 end) + (case when catm then 5 else 0 end) desc,
             dist asc
  )
  select cid, business_name, hl, bd, img, ctat, ctav, addr, alat, alng,
         round(dist::numeric, 1)::double precision, sid, stitle, kw,
         case when kw is not null then 'keyword' when catm then 'category' else 'general' end
  from scored
  order by score desc, random()
  limit greatest(1, least(coalesce(p_limit, 1), 5));
$$;

revoke execute on function public.ads_pick(text, uuid, integer) from public, anon;
grant  execute on function public.ads_pick(text, uuid, integer) to authenticated;

-- ── ads_log_event: record an impression / click / dismiss ─────────────────────
-- Duplicate impressions of the same campaign+item by the same user within 10 minutes are
-- dropped, so re-renders and back/forward navigation don't inflate the advertiser's numbers.
create or replace function public.ads_log_event(
  p_campaign_id uuid,
  p_event       text,
  p_placement   text,
  p_item_id     uuid default null,
  p_keyword     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_event not in ('impression','click','dismiss') then raise exception 'bad event'; end if;
  if p_placement not in ('item','collected','report','me') then raise exception 'bad placement'; end if;
  if not exists (select 1 from ad_campaigns where id = p_campaign_id) then return; end if;

  if p_event = 'impression' and exists (
    select 1 from ad_events
    where user_id = v_uid and campaign_id = p_campaign_id and event = 'impression'
      and item_id is not distinct from p_item_id
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into ad_events (campaign_id, user_id, event, placement, item_id, matched_keyword)
  values (p_campaign_id, v_uid, p_event, p_placement, p_item_id, left(p_keyword, 60));
end;
$$;

revoke execute on function public.ads_log_event(uuid, text, text, uuid, text) from public, anon;
grant  execute on function public.ads_log_event(uuid, text, text, uuid, text) to authenticated;

-- ── ads_campaign_stats: aggregate numbers for the admin dashboard ─────────────
create or replace function public.ads_campaign_stats(p_days integer default 30)
returns table (
  campaign_id   uuid,
  impressions   bigint,
  clicks        bigint,
  dismisses     bigint,
  unique_users  bigint,
  last_seen_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select e.campaign_id,
           count(*) filter (where e.event = 'impression'),
           count(*) filter (where e.event = 'click'),
           count(*) filter (where e.event = 'dismiss'),
           count(distinct e.user_id) filter (where e.event = 'impression'),
           max(e.created_at)
    from ad_events e
    where e.created_at > now() - make_interval(days => greatest(1, p_days))
    group by e.campaign_id;
end;
$$;

revoke execute on function public.ads_campaign_stats(integer) from public, anon;
grant  execute on function public.ads_campaign_stats(integer) to authenticated;

-- Daily series + breakdowns for one campaign (admin detail view).
create or replace function public.ads_campaign_daily(p_campaign_id uuid, p_days integer default 30)
returns table (day date, impressions bigint, clicks bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select d::date,
           count(e.id) filter (where e.event = 'impression'),
           count(e.id) filter (where e.event = 'click')
    from generate_series(current_date - (greatest(1, p_days) - 1), current_date, interval '1 day') d
    left join ad_events e
      on e.campaign_id = p_campaign_id and e.created_at::date = d::date
    group by d
    order by d;
end;
$$;

revoke execute on function public.ads_campaign_daily(uuid, integer) from public, anon;
grant  execute on function public.ads_campaign_daily(uuid, integer) to authenticated;

create or replace function public.ads_campaign_breakdown(p_campaign_id uuid, p_days integer default 30)
returns table (kind text, label text, impressions bigint, clicks bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return query
    select 'placement'::text, e.placement,
           count(*) filter (where e.event = 'impression'),
           count(*) filter (where e.event = 'click')
    from ad_events e
    where e.campaign_id = p_campaign_id and e.created_at > now() - make_interval(days => greatest(1, p_days))
    group by e.placement
    union all
    select 'keyword'::text, coalesce(e.matched_keyword, '(קטגוריה)'),
           count(*) filter (where e.event = 'impression'),
           count(*) filter (where e.event = 'click')
    from ad_events e
    where e.campaign_id = p_campaign_id and e.created_at > now() - make_interval(days => greatest(1, p_days))
    group by coalesce(e.matched_keyword, '(קטגוריה)');
end;
$$;

revoke execute on function public.ads_campaign_breakdown(uuid, integer) from public, anon;
grant  execute on function public.ads_campaign_breakdown(uuid, integer) to authenticated;
