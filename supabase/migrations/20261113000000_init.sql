-- =============================================================================
-- Minutama — initial schema for a fresh Supabase project.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Security model:
--   * Each user reads/updates only their own profile row (RLS).
--   * Paid plans and billing fields are changed ONLY by the service role
--     (Stripe webhook / server functions) — enforced by a trigger.
-- =============================================================================

-- 1. Profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  plan                   text not null default 'trial'
                         check (plan in ('trial', 'byok', 'pro', 'enterprise')),
  license_key            text,
  meetings_this_month    integer not null default 0,
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- If the table already existed (old BriefOS project), add any missing columns.
alter table public.profiles
  add column if not exists email                  text,
  add column if not exists plan                   text not null default 'trial',
  add column if not exists license_key            text,
  add column if not exists meetings_this_month    integer not null default 0,
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists created_at             timestamptz not null default now(),
  add column if not exists updated_at             timestamptz not null default now();

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- 2. Auto-create a profile when a user signs up ------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. RLS: own row only --------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 4. Billing protection -------------------------------------------------------
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stripe webhook and server functions use the service role.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Users may only switch between the free plans themselves.
  if new.plan is distinct from old.plan
     and new.plan not in ('trial', 'byok') then
    raise exception 'plan % can only be set by billing', new.plan
      using errcode = '42501';
  end if;

  if new.id                     is distinct from old.id
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.subscription_status    is distinct from old.subscription_status
  or new.current_period_end     is distinct from old.current_period_end then
    raise exception 'billing fields are read-only' using errcode = '42501';
  end if;

  -- Usage counters may never be lowered by the client.
  if new.meetings_this_month < old.meetings_this_month then
    raise exception 'usage counters are read-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_billing_fields on public.profiles;
create trigger protect_profile_billing_fields
  before update on public.profiles
  for each row execute function public.protect_profile_billing_fields();

-- 5. Usage counter RPC (used by the current desktop client) -------------------
drop function if exists public.increment_meetings(uuid);
create function public.increment_meetings(user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set meetings_this_month = meetings_this_month + 1,
         updated_at = now()
   where id = user_id
     and id = auth.uid();
$$;

revoke all on function public.increment_meetings(uuid) from public, anon;
grant execute on function public.increment_meetings(uuid) to authenticated;

-- 6. Realtime: the desktop app listens for plan changes ----------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
