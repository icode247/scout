-- Enforce same-owner references below the API and RLS layers.
create or replace function public.enforce_scout_reference_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'job_profiles' and new.resume_id is not null and not exists (select 1 from public.resumes r where r.id = new.resume_id and r.user_id = new.user_id)
    then raise exception 'Profile resume must belong to the same user' using errcode = '23514'; end if;
  if tg_table_name = 'jobs' and new.job_profile_id is not null and not exists (select 1 from public.job_profiles p where p.id = new.job_profile_id and p.user_id = new.user_id)
    then raise exception 'Job profile must belong to the same user' using errcode = '23514'; end if;
  if tg_table_name = 'applications' then
    if not exists (select 1 from public.jobs j where j.id = new.job_id and j.user_id = new.user_id)
      then raise exception 'Application job must belong to the same user' using errcode = '23514'; end if;
    if new.job_profile_id is not null and not exists (select 1 from public.job_profiles p where p.id = new.job_profile_id and p.user_id = new.user_id)
      then raise exception 'Application profile must belong to the same user' using errcode = '23514'; end if;
    if new.resume_id is not null and not exists (select 1 from public.resumes r where r.id = new.resume_id and r.user_id = new.user_id)
      then raise exception 'Application resume must belong to the same user' using errcode = '23514'; end if;
  end if;
  if tg_table_name = 'job_profile_resumes' then
    if not exists (select 1 from public.job_profiles p where p.id = new.job_profile_id and p.user_id = new.user_id)
      then raise exception 'Linked profile must belong to the same user' using errcode = '23514'; end if;
    if not exists (select 1 from public.resumes r where r.id = new.resume_id and r.user_id = new.user_id)
      then raise exception 'Linked resume must belong to the same user' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
do $$ declare table_name text; begin
  foreach table_name in array array['job_profiles','jobs','applications','job_profile_resumes'] loop
    execute format('drop trigger if exists enforce_reference_ownership on public.%I', table_name);
    execute format('create trigger enforce_reference_ownership before insert or update on public.%I for each row execute function public.enforce_scout_reference_ownership()', table_name);
  end loop;
end $$;
