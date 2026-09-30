-- Answers from the public Human Assistant intake link (/intake). The form needs no
-- login, so every submission is its own row: a resubmission never overwrites an
-- earlier one, and nobody who merely knows a client's email can replace their
-- answers. Operations reads the latest row per email.
create table if not exists public.assistant_intakes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  answers jsonb not null default '{}'::jsonb,
  -- The uploaded resume, in the private `resumes` bucket under `intake/`.
  -- Anonymous uploads have no auth.uid() folder, so only the service role reaches them.
  resume_path text,
  resume_name text,
  created_at timestamptz not null default now()
);
create index if not exists assistant_intakes_email_idx on public.assistant_intakes(lower(email), created_at desc);
create index if not exists assistant_intakes_created_idx on public.assistant_intakes(created_at desc);

-- Written and read only with the service role; no client may touch it.
alter table public.assistant_intakes enable row level security;
