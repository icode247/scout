-- Allow each job profile to own one or more resumes.
create table if not exists public.job_profile_resumes (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_profile_id uuid not null references public.job_profiles(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (job_profile_id, resume_id)
);

create index if not exists job_profile_resumes_user_id_idx on public.job_profile_resumes(user_id);
create index if not exists job_profile_resumes_resume_id_idx on public.job_profile_resumes(resume_id);

alter table public.job_profile_resumes enable row level security;
grant select, insert, update, delete on public.job_profile_resumes to authenticated;

drop policy if exists "Users manage own job profile resumes" on public.job_profile_resumes;
create policy "Users manage own job profile resumes"
on public.job_profile_resumes
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.job_profiles
    where job_profiles.id = job_profile_id
      and job_profiles.user_id = (select auth.uid())
  )
  and exists (
    select 1 from public.resumes
    where resumes.id = resume_id
      and resumes.user_id = (select auth.uid())
  )
);

-- Preserve existing single-resume profile associations.
insert into public.job_profile_resumes (user_id, job_profile_id, resume_id, is_primary)
select user_id, id, resume_id, true
from public.job_profiles
where resume_id is not null
on conflict (job_profile_id, resume_id) do nothing;
