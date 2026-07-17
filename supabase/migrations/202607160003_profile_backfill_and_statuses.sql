-- Backfill users created before the Scout profile trigger existed.
insert into public.profiles (user_id, full_name, email)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', split_part(coalesce(users.email, ''), '@', 1)),
  coalesce(users.email, '')
from auth.users as users
on conflict (user_id) do nothing;

-- Keep the database lifecycle aligned with the operations API.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('preparing','submitted','needs_input','evidence_ready','interview','rejected','withdrawn'));
