-- Reference: schema change, applied directly via Supabase MCP on 2026-07-13.
-- When an admin (in greenhood-admin) approves or rejects an item, push the
-- reporter a notification. Fires regardless of which admin dashboard performs
-- the update, since it triggers off the items table itself rather than any
-- client code — see app/api/items/[id]/moderation-webhook/route.ts for the
-- receiving endpoint. Mirrors the existing net.http_post pattern used by
-- trigger_validate_item().

create or replace function public.notify_moderation_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and new.moderation_status in ('approved', 'rejected') then
    perform net.http_post(
      url := 'https://eco-navigation.vercel.app/api/items/' || new.id || '/moderation-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || '__SUPABASE_SERVICE_ROLE_KEY__'
      ),
      body := '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_moderation_decision on public.items;
create trigger trg_notify_moderation_decision
  after update on public.items
  for each row
  execute function public.notify_moderation_decision();
