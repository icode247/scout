-- Store FastApply v2-compatible applicant answers per Scout job profile.
alter table public.job_profiles
  add column if not exists applicant_profile jsonb not null default '{}'::jsonb;

comment on column public.job_profiles.applicant_profile is
  'User-reviewed applicant details mapped to the FastApply v2 job profile/applicant schema.';

alter table public.job_profiles
  drop constraint if exists job_profiles_applicant_profile_object;
alter table public.job_profiles
  add constraint job_profiles_applicant_profile_object
  check (jsonb_typeof(applicant_profile) = 'object');
