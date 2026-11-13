-- Where a member came from, recorded once when they sign up.
--
-- The browser keeps the visitor's first touch (utm tags, gclid, referrer, landing page, time) in
-- the `scout_ft` cookie (src/lib/attribution.ts). /auth/callback copies it onto the new member's
-- profile the first time they sign in and stamps attribution_captured_at, so it is written once and
-- never overwritten. heard_from is the member's own answer to "How did you hear about Scout?" in
-- onboarding. Every column is nullable: existing members, and signups with no stored first touch
-- (blocked cookies, a sign-in link opened on another device), simply have nulls.
--
-- Safe to re-run: columns are only added when missing, and nothing is backfilled.
alter table public.profiles
  add column if not exists first_utm_source text,
  add column if not exists first_utm_medium text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_term text,
  add column if not exists first_utm_content text,
  add column if not exists first_gclid text,
  add column if not exists first_referrer text,
  add column if not exists first_ai_source text,
  add column if not exists first_landing_path text,
  add column if not exists first_touch_at timestamptz,
  add column if not exists attribution_captured_at timestamptz,
  add column if not exists heard_from text;

comment on column public.profiles.first_referrer is
  'Origin and path of the site that first referred this visitor (no query string); null for direct visits.';
comment on column public.profiles.first_ai_source is
  'Answer engine behind the first visit (chatgpt, perplexity, gemini, copilot, claude, ...), from the referrer or utm_source.';
comment on column public.profiles.first_landing_path is
  'Path of the first page viewed on applyscout.app (no query string).';
comment on column public.profiles.first_touch_at is
  'When the first page view happened (browser clock).';
comment on column public.profiles.attribution_captured_at is
  'When signup copied the first touch onto this profile. Set once by /auth/callback; null for members who signed up before tracking.';
comment on column public.profiles.heard_from is
  'Self-reported "How did you hear about Scout?" from onboarding: an option value or "other: <text>".';
