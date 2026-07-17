create table if not exists public.application_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  label text not null,
  storage_path text not null unique,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists application_evidence_user_id_idx
  on public.application_evidence (user_id, created_at desc);
create index if not exists application_evidence_application_id_idx
  on public.application_evidence (application_id, created_at asc);

alter table public.application_evidence enable row level security;
grant select on public.application_evidence to authenticated;

drop policy if exists "Users read own application evidence rows" on public.application_evidence;
create policy "Users read own application evidence rows"
on public.application_evidence for select to authenticated
using ((select auth.uid()) = user_id);
