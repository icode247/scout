alter table public.job_search_filters add column if not exists name text;
alter table public.job_search_filters add column if not exists is_active boolean not null default false;
update public.job_search_filters f set name = coalesce(nullif(f.name, ''), p.name || ' search') from public.job_profiles p where p.id = f.job_profile_id;
alter table public.job_search_filters alter column name set not null;
alter table public.job_search_filters drop constraint if exists job_search_filters_user_id_job_profile_id_key;
create index if not exists job_search_filters_active_idx on public.job_search_filters(user_id, is_active, updated_at desc);
