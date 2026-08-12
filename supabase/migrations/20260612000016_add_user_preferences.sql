SET search_path TO phaseforge, extensions;

-- Create user_preferences table for theme and UI preferences
create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  sidebar_collapsed boolean not null default false,
  gantt_zoom text not null default 'week' check (gantt_zoom in ('day', 'week', 'month', 'quarter')),
  default_board_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_board foreign key (default_board_id) references boards(id) on delete set null
);

-- Create index for fast lookups by user
create index if not exists idx_user_preferences_user_id on user_preferences(user_id);

-- Enable RLS
alter table user_preferences enable row level security;

-- RLS Policy: Users can read/write their own preferences
create policy "Users can access their own preferences"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert for setup
create policy "Service role can insert preferences"
  on user_preferences for insert
  with check (true);

-- Create function to initialize user_preferences on signup
create or replace function phaseforge.initialize_user_preferences()
returns trigger as $$
begin
  insert into user_preferences (user_id, company_id, theme, sidebar_collapsed, gantt_zoom)
  values (new.id, new.company_id, 'system', false, 'week')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create preferences on profile insert
create trigger on_profile_created_init_preferences
  after insert on profiles
  for each row
  execute function initialize_user_preferences();
