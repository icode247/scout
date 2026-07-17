alter table public.resumes
  add column if not exists extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','complete','failed')),
  add column if not exists extraction_error text,
  add column if not exists extraction_started_at timestamptz,
  add column if not exists extraction_completed_at timestamptz;

create index if not exists resumes_extraction_status_idx on public.resumes (user_id, extraction_status);
