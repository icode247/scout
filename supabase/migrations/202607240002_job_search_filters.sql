create table if not exists public.job_search_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_profile_id uuid not null references public.job_profiles(id) on delete cascade,
  roles text[] not null default '{}', locations text[] not null default '{}',
  company_blacklist text[] not null default '{}', employment_types text[] not null default '{}',
  experience_levels text[] not null default '{}', work_modes text[] not null default '{}',
  platforms text[] not null default '{greenhouse,lever,ashby,workable,recruitee,workday,smartrecruiters}',
  date_posted text not null default '7d', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, job_profile_id)
);
alter table public.job_search_filters enable row level security;
grant select, insert, update, delete on public.job_search_filters to authenticated;
create policy "Users manage own job search filters" on public.job_search_filters for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id and exists (select 1 from public.job_profiles p where p.id = job_profile_id and p.user_id = (select auth.uid())));
create index if not exists job_search_filters_user_id_idx on public.job_search_filters(user_id);
