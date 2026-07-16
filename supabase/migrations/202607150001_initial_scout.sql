-- Scout core schema: run in the Supabase SQL editor or with supabase db push.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  assistant_type text not null default 'ai' check (assistant_type in ('human','ai')),
  onboarding_complete boolean not null default false,
  assistant_name text,
  whatsapp_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'original' check (kind in ('original','tailored')),
  storage_path text,
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists resumes_user_id_idx on public.resumes(user_id);

create table if not exists public.job_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  assistant_type text not null default 'ai' check (assistant_type in ('human','ai')),
  target_roles text[] not null default '{}',
  locations text[] not null default '{}',
  salary_min integer,
  resume_behavior text not null default 'tailor' check (resume_behavior in ('tailor','original')),
  resume_id uuid references public.resumes(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_profiles_user_id_idx on public.job_profiles(user_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_profile_id uuid references public.job_profiles(id) on delete set null,
  title text not null,
  company text not null,
  location text not null default '',
  description text not null default '',
  external_url text,
  source text not null default 'dashboard',
  status text not null default 'saved' check (status in ('saved','delegated','preparing','applied','interview','skipped')),
  fit_score integer not null default 0 check (fit_score between 0 and 100),
  assistant_type text not null default 'ai' check (assistant_type in ('human','ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_user_id_idx on public.jobs(user_id);
create index if not exists jobs_status_idx on public.jobs(user_id, status);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_profile_id uuid references public.job_profiles(id) on delete set null,
  resume_id uuid references public.resumes(id) on delete set null,
  assistant_type text not null check (assistant_type in ('human','ai')),
  status text not null default 'preparing' check (status in ('preparing','submitted','evidence_ready','interview','rejected','withdrawn')),
  submitted_at timestamptz,
  notes text,
  answer_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, job_id)
);
create index if not exists applications_user_id_idx on public.applications(user_id);
create index if not exists applications_status_idx on public.applications(user_id, status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.job_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

grant select, insert, update, delete on public.profiles, public.resumes, public.job_profiles, public.jobs, public.applications to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','resumes','job_profiles','jobs','applications']
  loop
    execute format('drop policy if exists "Users manage own %1$s" on public.%1$I', table_name);
    execute format('create policy "Users manage own %1$s" on public.%1$I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resumes', 'resumes', false, 10485760, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']),
  ('application-evidence', 'application-evidence', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own resume files" on storage.objects;
create policy "Users upload own resume files" on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read own resume files" on storage.objects;
create policy "Users read own resume files" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete own resume files" on storage.objects;
create policy "Users delete own resume files" on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read own application evidence" on storage.objects;
create policy "Users read own application evidence" on storage.objects for select to authenticated
using (bucket_id = 'application-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
