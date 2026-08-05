-- SECURITY FIX for 202608050002.
--
-- The previous definition took the target user as an argument while running as
-- SECURITY DEFINER (which bypasses RLS) and was granted to `authenticated`. Any
-- signed-in member could therefore call it with somebody else's user id and burn
-- through that person's paid application quota:
--
--     supabase.rpc('increment_application_usage', { p_user_id: '<victim uuid>' })
--
-- The caller must never name the account being charged. The subject is now taken
-- from auth.uid(), so a member can only ever consume their own allowance.

drop function if exists public.increment_application_usage(uuid);

create or replace function public.increment_application_usage()
returns void language sql security definer set search_path = '' as $$
  update public.subscriptions
     set applications_used = applications_used + 1, updated_at = now()
   where user_id = (select auth.uid()) and status = 'active';
$$;

revoke all on function public.increment_application_usage() from public;
grant execute on function public.increment_application_usage() to authenticated;
