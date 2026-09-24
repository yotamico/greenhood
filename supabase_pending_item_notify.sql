-- Reference: schema change, applied via the Supabase MCP.
-- When a new item is inserted as moderation_status 'pending', push the admin(s) so
-- items don't sit unmoderated for weeks. Mirrors notify_moderation_decision() (see
-- supabase_moderation_push_notify.sql): a trigger on the items table itself, so it fires no
-- matter which client inserted the row; receiving endpoint is
-- app/api/items/[id]/pending-webhook/route.ts.
--
-- The live function was created by copying the service-role key out of the existing
-- notify_moderation_decision() (so the secret was never pasted anywhere); in this reference
-- file it is the same '__SUPABASE_SERVICE_ROLE_KEY__' placeholder as the other file.
-- Admin ids come from the same email is_admin() checks. The exception block guarantees a
-- notification problem can never make the item insert itself fail.

create or replace function public.notify_pending_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending' then
    perform net.http_post(
      url := 'https://eco-navigation.vercel.app/api/items/' || new.id || '/pending-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || '__SUPABASE_SERVICE_ROLE_KEY__'
      ),
      body := jsonb_build_object(
        'admin_ids',
        (select coalesce(jsonb_agg(id), '[]'::jsonb) from auth.users where email = 'yotamico@gmail.com')
      )
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_notify_pending_item on public.items;
create trigger trg_notify_pending_item
  after insert on public.items
  for each row
  execute function public.notify_pending_item();
