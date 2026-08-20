-- Per-contact lifecycle state for Scout's four-email launch sequence.
create table if not exists public.launch_email_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  source text not null default 'account_signup',
  preferred_lane text check (preferred_lane in ('human','ai')),
  status text not null default 'active' check (status in ('active','processing','completed','unsubscribed','purchased','failed')),
  next_email smallint not null default 1 check (next_email between 1 and 4),
  next_send_at timestamptz not null default now(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz,
  last_error text,
  enrolled_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  purchased_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists launch_email_enrollments_email_idx
  on public.launch_email_enrollments (lower(email));
create unique index if not exists launch_email_enrollments_token_idx
  on public.launch_email_enrollments (unsubscribe_token);
create index if not exists launch_email_enrollments_due_idx
  on public.launch_email_enrollments (next_send_at)
  where status = 'active';

create table if not exists public.launch_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.launch_email_enrollments(id) on delete cascade,
  email_number smallint not null check (email_number between 1 and 4),
  provider_id text,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, email_number)
);

alter table public.launch_email_enrollments enable row level security;
alter table public.launch_email_deliveries enable row level security;
-- No client policies: enrollment and delivery state are service-role only.

create or replace function public.enroll_profile_in_launch_sequence()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if coalesce(new.email, '') <> '' then
    insert into public.launch_email_enrollments (user_id, email, first_name, preferred_lane)
    values (
      new.user_id,
      lower(new.email),
      nullif(split_part(coalesce(new.full_name, ''), ' ', 1), ''),
      new.assistant_type
    )
    on conflict ((lower(email))) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created_enroll_launch on public.profiles;
create trigger on_profile_created_enroll_launch
after insert on public.profiles
for each row execute procedure public.enroll_profile_in_launch_sequence();

create or replace function public.sync_launch_sequence_lane()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.launch_email_enrollments
  set preferred_lane = new.assistant_type,
      first_name = coalesce(nullif(split_part(new.full_name, ' ', 1), ''), first_name),
      updated_at = now()
  where user_id = new.user_id and status in ('active','processing');
  return new;
end;
$$;

drop trigger if exists on_profile_updated_sync_launch on public.profiles;
create trigger on_profile_updated_sync_launch
after update of assistant_type, full_name on public.profiles
for each row execute procedure public.sync_launch_sequence_lane();

-- Deliberately do not backfill existing profiles here. Applying a migration
-- must not trigger an unreviewed bulk campaign. Existing eligible contacts can
-- be imported separately after the copy and mailing address are approved.

-- Any successful first purchase suppresses the sales sequence immediately.
create or replace function public.suppress_launch_sequence_after_purchase()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.launch_email_enrollments
    set status = 'purchased', purchased_at = now(), claimed_at = null, updated_at = now()
    where user_id = new.user_id and status in ('active','processing');
  end if;
  return new;
end;
$$;

drop trigger if exists on_subscription_purchase_suppress_launch on public.subscriptions;
create trigger on_subscription_purchase_suppress_launch
after insert or update of status on public.subscriptions
for each row execute procedure public.suppress_launch_sequence_after_purchase();
