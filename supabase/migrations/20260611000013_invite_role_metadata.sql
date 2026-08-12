SET search_path TO phaseforge, extensions;

-- Allow invited users to keep their assigned role + company on signup.
-- Previously handle_new_user() hardcoded role = 'owner', so every invited
-- user became an owner of the inviter's company. Now we read role (and
-- company_id, already supported) from the auth user's metadata, defaulting
-- to 'owner' for normal self-signups that don't pass a role.

create or replace function phaseforge.handle_new_user()
returns trigger as $$
begin
  insert into phaseforge.profiles (id, email, full_name, company_id, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.raw_user_meta_data->>'company_id' is not null
      then (new.raw_user_meta_data->>'company_id')::uuid
      else null
    end,
    coalesce(new.raw_user_meta_data->>'role', 'owner')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
