alter table public.jobs
  alter column fit_score drop not null,
  alter column fit_score drop default,
  add column if not exists fit_status text not null default 'pending'
    check (fit_status in ('pending','processing','complete','failed')),
  add column if not exists fit_analysis jsonb not null default '{}'::jsonb,
  add column if not exists fit_error text,
  add column if not exists fit_updated_at timestamptz;

update public.jobs
set fit_score = null, fit_status = 'pending'
where fit_score = 0 and fit_analysis = '{}'::jsonb;

create index if not exists jobs_fit_status_idx on public.jobs (user_id, fit_status);
