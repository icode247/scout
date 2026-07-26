-- Postgres-backed fixed-window rate limiter for cost/abuse control on expensive endpoints
-- (billable FastApply automations, LLM scoring/extraction, external job-board search).
--
-- Serverless functions are stateless across invocations, so an in-process counter cannot
-- limit anything. This table is the shared counter. It is written ONLY through the
-- SECURITY DEFINER function below; RLS is enabled with no policies so the user-scoped
-- anon/authenticated clients can neither read nor tamper with the counters directly.

create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.rate_limits enable row level security;
-- Intentionally no policies: direct table access is denied to authenticated/anon. All access
-- flows through public.scout_rate_limit(), which runs as the function owner and bypasses RLS.

create or replace function public.scout_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Single atomic upsert: increment within the current window, or reset when the window
  -- has rolled over. Concurrent callers serialize on the primary-key row, so the returned
  -- count is exact even under a burst of parallel requests.
  insert into public.rate_limits as rl (bucket, window_start, count)
  values (p_key, now(), 1)
  on conflict (bucket) do update set
    count = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rl.count + 1
    end,
    window_start = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rl.window_start
    end
  returning rl.count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.scout_rate_limit(text, integer, integer) from public;
grant execute on function public.scout_rate_limit(text, integer, integer) to authenticated, anon, service_role;

-- Housekeeping: prune buckets whose window is long past. Called opportunistically by the
-- background cron worker so the table cannot grow without bound.
create or replace function public.scout_rate_limit_gc(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.scout_rate_limit_gc(integer) from public;
grant execute on function public.scout_rate_limit_gc(integer) to service_role;
