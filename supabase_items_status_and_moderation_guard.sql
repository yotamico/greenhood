-- Reference: schema fix, run manually in the Supabase SQL editor.
-- Fixes 2026-07-13 code review findings #4 and #5:
--   4. items.status only allowed 'active'|'taken'|'expired' — the app's own
--      "remove item" button sends 'removed', which the DB silently rejected
--      while the UI showed the item as removed anyway.
--   5. The "own update" RLS policy let a reporter change moderation_status on
--      their own item (e.g. self-approve a pending listing), because it only
--      checks who owns the row, not which columns changed.

-- 4. Allow 'removed' as a real status value.
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(c.conkey)
    where rel.relname = 'items'
      and c.contype = 'c'
      and att.attname = 'status'
  loop
    execute format('alter table public.items drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.items
  add constraint items_status_check
  check (status = any (array['active','taken','expired','removed']));

-- 5. Block non-admins from changing moderation_status to anything but
--    'pending' (the one legitimate self-service case: resubmitting an edited
--    item for re-review), and from setting a moderation_reason themselves.
--    is_admin() still has full control, unaffected.
create or replace function public.prevent_self_moderation()
returns trigger
language plpgsql
as $$
begin
  if not is_admin()
     and new.moderation_status is distinct from old.moderation_status
     and new.moderation_status <> 'pending' then
    raise exception 'only an admin can approve or reject an item';
  end if;
  if not is_admin()
     and new.moderation_reason is distinct from old.moderation_reason
     and new.moderation_reason is not null then
    raise exception 'only an admin can set a moderation reason';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_moderation on public.items;
create trigger trg_prevent_self_moderation
  before update on public.items
  for each row
  execute function public.prevent_self_moderation();
