-- Quota accounting. Called only after an application is successfully queued, so
-- a failed submission never consumes a member's allowance.
create or replace function public.increment_application_usage(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.subscriptions
     set applications_used = applications_used + 1, updated_at = now()
   where user_id = p_user_id and status = 'active';
$$;

grant execute on function public.increment_application_usage(uuid) to authenticated;
