SET search_path TO phaseforge, extensions;

-- Add stripe_subscription_id to companies table if it doesn't exist
alter table companies
add column if not exists stripe_subscription_id text unique,
add column if not exists billing_status text not null default 'active' check (billing_status in ('active', 'past_due', 'canceled'));

-- Create index for efficient queries
create index if not exists idx_companies_stripe_subscription_id on companies(stripe_subscription_id);
