-- Make profile-created preference triggers resilient during signup.
--
-- Why this is needed:
-- New auth users first flow through public.handle_new_user(), which inserts a
-- profile row. Some signup paths can briefly create that profile before the
-- final company assignment is fully present. The preference triggers added on
-- 2026-06-12 assumed company_id was always non-null and caused
-- "Database error saving new user" when auth tried to create the user.
--
-- This patch:
-- 1. Skips preference initialization when company_id is null.
-- 2. Re-runs initialization when company_id is later assigned.
-- 3. Backfills missing preferences for existing profiles.

create or replace function public.initialize_notification_preferences()
returns trigger as $$
begin
  if new.company_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.notification_preferences
    where user_id = new.id
  ) then
    insert into public.notification_preferences (
      user_id,
      company_id,
      email_overdue,
      email_due_soon,
      email_mentions,
      in_app_enabled,
      digest_frequency
    )
    values (
      new.id,
      new.company_id,
      true,
      true,
      true,
      true,
      'daily'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created_init_notification_preferences on public.profiles;
drop trigger if exists on_profile_updated_init_notification_preferences on public.profiles;

create trigger on_profile_created_init_notification_preferences
  after insert on public.profiles
  for each row
  execute function public.initialize_notification_preferences();

create trigger on_profile_updated_init_notification_preferences
  after update of company_id on public.profiles
  for each row
  when (old.company_id is distinct from new.company_id)
  execute function public.initialize_notification_preferences();

create or replace function public.initialize_user_preferences()
returns trigger as $$
begin
  if new.company_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.user_preferences
    where user_id = new.id
  ) then
    insert into public.user_preferences (
      user_id,
      company_id,
      theme,
      sidebar_collapsed,
      gantt_zoom
    )
    values (
      new.id,
      new.company_id,
      'system',
      false,
      'week'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created_init_preferences on public.profiles;
drop trigger if exists on_profile_updated_init_preferences on public.profiles;

create trigger on_profile_created_init_preferences
  after insert on public.profiles
  for each row
  execute function public.initialize_user_preferences();

create trigger on_profile_updated_init_preferences
  after update of company_id on public.profiles
  for each row
  when (old.company_id is distinct from new.company_id)
  execute function public.initialize_user_preferences();

insert into public.notification_preferences (
  user_id,
  company_id,
  email_overdue,
  email_due_soon,
  email_mentions,
  in_app_enabled,
  digest_frequency
)
select
  p.id,
  p.company_id,
  true,
  true,
  true,
  true,
  'daily'
from public.profiles p
where p.company_id is not null
  and not exists (
    select 1
    from public.notification_preferences np
    where np.user_id = p.id
  );

insert into public.user_preferences (
  user_id,
  company_id,
  theme,
  sidebar_collapsed,
  gantt_zoom
)
select
  p.id,
  p.company_id,
  'system',
  false,
  'week'
from public.profiles p
where p.company_id is not null
  and not exists (
    select 1
    from public.user_preferences up
    where up.user_id = p.id
  );
