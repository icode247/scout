create table if not exists public.ai_agent_configs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_profile_id uuid not null references public.job_profiles(id) on delete cascade, remote_job_profile_id text, first_apply_id text,
  roles text[] not null default '{}', locations text[] not null default '{}', company_blacklist text[] not null default '{}',
  employment_types text[] not null default '{full-time}', experience_levels text[] not null default '{}', work_modes text[] not null default '{}',
  accuracy_threshold integer not null default 70 check (accuracy_threshold between 50 and 100),
  stealth_apply boolean not null default false, resume_per_job boolean not null default false,
  status text not null default 'draft' check (status in ('draft','activating','active','paused','error')),
  last_error text, remote_payload jsonb not null default '{}'::jsonb, synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, job_profile_id)
);
alter table public.ai_agent_configs enable row level security;
create policy "Users manage their AI agent configurations" on public.ai_agent_configs for all using (auth.uid() = user_id)
with check (auth.uid() = user_id and exists (select 1 from public.job_profiles p where p.id = job_profile_id and p.user_id = auth.uid()));
create index if not exists ai_agent_configs_user_id_idx on public.ai_agent_configs(user_id);
