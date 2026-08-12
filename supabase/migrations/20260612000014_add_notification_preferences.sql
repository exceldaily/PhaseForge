SET search_path TO phaseforge, extensions;

-- Create notification_preferences table
create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  email_overdue boolean not null default true,
  email_due_soon boolean not null default true,
  email_mentions boolean not null default true,
  in_app_enabled boolean not null default true,
  digest_frequency text not null default 'daily' check (digest_frequency in ('none', 'daily', 'weekly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for fast lookups
create index if not exists idx_notification_preferences_user_id on notification_preferences(user_id);

-- Enable RLS
alter table notification_preferences enable row level security;

-- RLS Policy: Users can read/write their own preferences
create policy "Users can access their own notification preferences"
  on notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert for setup
create policy "Service role can insert notification preferences"
  on notification_preferences for insert
  with check (true);

-- Create function to initialize notification_preferences on signup
create or replace function phaseforge.initialize_notification_preferences()
returns trigger as $$
begin
  insert into notification_preferences (user_id, company_id, email_overdue, email_due_soon, email_mentions, in_app_enabled, digest_frequency)
  values (new.id, new.company_id, true, true, true, true, 'daily')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create notification preferences on profile insert
create trigger on_profile_created_init_notification_preferences
  after insert on profiles
  for each row
  execute function initialize_notification_preferences();
