-- The start of the current billing period, recorded by the Dodo webhook on every
-- activation and renewal. FastApply's per-applicant monthly application limit is
-- anchored to it (src/lib/fastapply-limits.ts); rows from before this column
-- existed derive it from current_period_end and the plan's billing cycle.
alter table public.subscriptions add column if not exists current_period_start timestamptz;
