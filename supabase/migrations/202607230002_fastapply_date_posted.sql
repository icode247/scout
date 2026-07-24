alter table public.ai_agent_configs alter column date_posted set default '7d';
update public.ai_agent_configs set date_posted = case date_posted when 'past_day' then '24h' when 'past_week' then '7d' when 'past_month' then '30d' else date_posted end;
