-- A resume belongs to exactly one job profile.
--
-- job_profile_resumes was a many-to-many link, so the profile editor offered the whole
-- account's resume library and one file could back several profiles. Profiles are meant to
-- be independent applicants, so each one now owns its resumes outright.
--
-- Any resume currently shared by more than one profile is copied so every profile keeps its
-- own row. The copies point at the same object in the `resumes` storage bucket, which is why
-- the delete path only removes a stored file once no resume row still references its path.

do $$
declare
  shared_link record;
  copy_id uuid;
begin
  for shared_link in
    select job_profile_id, resume_id
    from (
      select job_profile_id, resume_id,
             row_number() over (partition by resume_id order by created_at, job_profile_id) as rank
      from public.job_profile_resumes
    ) ranked
    where rank > 1
  loop
    insert into public.resumes (
      user_id, name, kind, storage_path, extracted_data, created_at,
      extraction_status, extraction_error, extraction_started_at, extraction_completed_at
    )
    select
      user_id, name, kind, storage_path, extracted_data, created_at,
      extraction_status, extraction_error, extraction_started_at, extraction_completed_at
    from public.resumes
    where id = shared_link.resume_id
    returning id into copy_id;

    update public.job_profile_resumes
       set resume_id = copy_id
     where job_profile_id = shared_link.job_profile_id
       and resume_id = shared_link.resume_id;

    -- Keep the legacy single-resume column pointing at this profile's own copy.
    update public.job_profiles
       set resume_id = copy_id
     where id = shared_link.job_profile_id
       and resume_id = shared_link.resume_id;
  end loop;
end $$;

-- Ownership, enforced: a resume can be linked to at most one profile.
create unique index if not exists job_profile_resumes_resume_id_key
  on public.job_profile_resumes(resume_id);

-- Every profile keeps exactly one default resume. Partial unique index rather than a
-- constraint so a profile mid-edit can briefly have none (its last resume was deleted).
create unique index if not exists job_profile_resumes_one_primary_idx
  on public.job_profile_resumes(job_profile_id)
  where is_primary;

-- Profiles whose links all ended up non-primary (legacy rows) get their oldest resume back
-- as the default, so no profile is left without one.
update public.job_profile_resumes link
   set is_primary = true
 where not exists (
   select 1 from public.job_profile_resumes other
    where other.job_profile_id = link.job_profile_id and other.is_primary
 )
 and link.created_at = (
   select min(first.created_at) from public.job_profile_resumes first
    where first.job_profile_id = link.job_profile_id
 );
