-- The Human Assistant roster, managed by admins from /admin instead of being
-- hard-coded. Client profiles still store the assistant by name
-- (profiles.assistant_name); renaming an assistant keeps the old name in
-- former_names so older rows keep resolving.
create table if not exists public.human_assistants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  first_name text not null,
  -- The login this assistant works from; the app mirrors it into that user's
  -- app_metadata (scout_role = 'agent'), which is what grants access.
  email text,
  -- A site path (/assets/agents/...) or a public storage URL.
  avatar_url text,
  former_names text[] not null default '{}',
  -- Inactive assistants keep resolving for existing clients but get no new ones.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists human_assistants_name_idx on public.human_assistants (lower(name));
create unique index if not exists human_assistants_email_idx on public.human_assistants (lower(email)) where email is not null;

-- Read and written only with the service role.
alter table public.human_assistants enable row level security;

-- The five assistants that were hard-coded until now, unchanged.
insert into public.human_assistants (name, first_name, avatar_url, former_names) values
  ('Angela Price', 'Angela', '/assets/agents/angela-price.webp', '{}'),
  ('Clinton', 'Clinton', '/assets/agents/clinton.webp', '{"Daniel Kim"}'),
  ('Lena Santos', 'Lena', '/assets/agents/lena-santos.webp', '{}'),
  ('Marcus Reed', 'Marcus', '/assets/agents/marcus-reed.webp', '{}'),
  ('Maya Brooks', 'Maya', '/assets/agents/maya-brooks.webp', '{}')
on conflict do nothing;
