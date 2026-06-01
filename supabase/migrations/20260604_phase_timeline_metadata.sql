alter table public.phases
  add column if not exists percent_complete integer default 0,
  add column if not exists is_milestone boolean not null default false,
  add column if not exists is_critical_path boolean not null default false;

update public.phases
set percent_complete = case
  when status in ('completed', 'skipped') then 100
  when status in ('in_progress', 'blocked') then 50
  else 0
end
where percent_complete is null;

alter table public.phases
  alter column percent_complete set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phases_percent_complete_range'
  ) then
    alter table public.phases
      add constraint phases_percent_complete_range
      check (percent_complete between 0 and 100);
  end if;
end $$;
