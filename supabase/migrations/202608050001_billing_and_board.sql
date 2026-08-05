-- Billing, booking leads, and the locally-ingested job corpus.
-- Additive only: this runs against a production database with live members.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  lane text not null check (lane in ('human','ai')),
  status text not null default 'active' check (status in ('active','past_due','canceled','expired')),
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_payment_id text,
  current_period_end timestamptz,
  applications_quota integer not null default 0,
  applications_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_active_idx on public.subscriptions(user_id, status);
create unique index if not exists subscriptions_dodo_subscription_idx
  on public.subscriptions(dodo_subscription_id) where dodo_subscription_id is not null;
create unique index if not exists subscriptions_dodo_payment_idx
  on public.subscriptions(dodo_payment_id) where dodo_payment_id is not null;

-- Webhook idempotency. The primary key rejects a replayed delivery.
create table if not exists public.webhook_events (
  dodo_event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.booking_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  primary_role text,
  target_location text,
  challenge text,
  source_path text,
  status text not null default 'new' check (status in ('new','scheduled','completed','no_show')),
  calendly_event_uri text,
  calendly_invitee_uri text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists booking_leads_created_idx on public.booking_leads(created_at desc);
create index if not exists booking_leads_email_idx on public.booking_leads(lower(email));

-- Corpus ingested from the upstream board. That API returns HTTP 500 (Postgres
-- statement timeout) for q/location/work_mode/employment_type, offers no sort
-- parameter, and dies past offset 100k of 4.49M rows -- so Scout keeps its own
-- indexed copy and searches that instead. See the design spec.
create table if not exists public.board_jobs (
  id bigserial primary key,
  external_id text not null unique,
  board_id bigint,
  title text not null,
  company text not null,
  company_domain text,
  logo_url text,
  location text not null default '',
  workplace_type text,
  employment_type text,
  experience_level text,
  is_remote boolean not null default false,
  remote_worldwide boolean not null default false,
  visa_sponsorship boolean,
  salary jsonb,
  ats text,
  external_url text not null,
  description text not null default '',
  posted_at timestamptz,
  ingested_at timestamptz not null default now()
);
create index if not exists board_jobs_search_idx on public.board_jobs
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'')));
create index if not exists board_jobs_posted_idx on public.board_jobs(posted_at desc nulls last);
create index if not exists board_jobs_ats_idx on public.board_jobs(ats);
create index if not exists board_jobs_remote_idx on public.board_jobs(is_remote);
create index if not exists board_jobs_location_idx on public.board_jobs
  using gin (to_tsvector('simple', coalesce(location,'')));

create table if not exists public.board_ingest_cursor (
  axis text primary key,
  next_offset integer not null default 0,
  last_run_at timestamptz,
  last_error text,
  rows_ingested bigint not null default 0
);

alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.booking_leads enable row level security;
alter table public.board_jobs enable row level security;
alter table public.board_ingest_cursor enable row level security;

grant select on public.subscriptions to authenticated;
grant select on public.board_jobs to authenticated;

drop policy if exists "Users read own subscriptions" on public.subscriptions;
create policy "Users read own subscriptions" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- The corpus is shared reference data: any signed-in member may read it, and
-- nobody may write it from the client. Ingestion runs as the service role.
drop policy if exists "Members read board jobs" on public.board_jobs;
create policy "Members read board jobs" on public.board_jobs
  for select to authenticated using (true);

-- webhook_events, booking_leads and board_ingest_cursor deliberately carry no
-- policy for `authenticated`: RLS is enabled with no policy, which denies all
-- client access. They are written only by the service role, which bypasses RLS.
