-- The GIN index added in 202608050001 covers the expression
--   to_tsvector('english', title || ' ' || company)
-- but PostgREST's .textSearch('title', ...) emits `title @@ websearch_to_tsquery(...)`,
-- which is a different expression and therefore cannot use that index. Every
-- search would have fallen back to a sequential scan over the whole corpus.
--
-- A stored generated column gives the query planner something it can actually
-- match, and lets the API filter on one named column.

alter table public.board_jobs
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(company, ''))
  ) stored;

create index if not exists board_jobs_search_vector_idx
  on public.board_jobs using gin (search_vector);

-- Superseded by the generated column above.
drop index if exists public.board_jobs_search_idx;
