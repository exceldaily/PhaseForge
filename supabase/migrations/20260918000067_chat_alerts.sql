-- Chat alerts: a per-person setting for job activity alerts in chat.
-- 'all' = every job, 'following' = jobs I follow, 'off' = none.
alter table phaseforge.profiles
  add column if not exists chat_alerts text not null default 'all'
  check (chat_alerts in ('all', 'following', 'off'));

-- The chat alerts inbox reads a person's unread rows by type.
create index if not exists idx_notifications_user_type
  on phaseforge.notifications (user_id, type, read, created_at desc);
