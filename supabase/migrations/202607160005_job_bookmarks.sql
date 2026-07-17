alter table public.jobs
  add column if not exists is_saved boolean not null default false;

update public.jobs set is_saved = true where status = 'saved';

create index if not exists jobs_saved_idx on public.jobs (user_id, is_saved) where is_saved = true;
