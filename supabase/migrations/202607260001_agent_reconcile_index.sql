-- Supports the reconciliation worker's active-agent scan (runs every 5 minutes):
--   select ... from ai_agent_configs
--   where status = 'active' and first_apply_id is not null
--   order by synced_at asc nulls first
-- Partial index keeps it to just the live automations, ordered for the oldest-synced-first sweep.
create index if not exists ai_agent_configs_active_sync_idx
  on public.ai_agent_configs (synced_at)
  where status = 'active' and first_apply_id is not null;
