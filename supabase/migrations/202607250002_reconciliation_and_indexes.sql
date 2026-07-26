-- Indexes supporting (a) the scheduled automation reconciliation + background scoring worker
-- and (b) the hot per-user reads in loadScoutData / job dedup that previously had no covering
-- index (flagged in the architecture review as missing external_url / created_at indexes).

-- Reconcile worker: find in-flight automations to poll. Partial index keeps it tiny.
create index if not exists applications_open_automation_idx
  on public.applications (remote_status)
  where remote_automation_id is not null;

-- Background scoring worker: cross-user scan for jobs still awaiting a fit score.
create index if not exists jobs_pending_fit_idx
  on public.jobs (created_at)
  where fit_status = 'pending';

-- AI apply / import dedup: `.eq(user_id).eq(external_url)` lookups.
create index if not exists jobs_user_external_url_idx
  on public.jobs (user_id, external_url)
  where external_url is not null;

-- loadScoutData ordering: newest-first per user.
create index if not exists jobs_user_created_idx
  on public.jobs (user_id, created_at desc);

create index if not exists applications_user_created_idx
  on public.applications (user_id, created_at desc);
