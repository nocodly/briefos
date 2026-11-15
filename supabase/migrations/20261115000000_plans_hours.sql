-- Pro / Pro Max with included recording hours + top-ups.
--
-- usage.seconds counts CHANNEL seconds (mic + system audio are transcribed
-- separately), so one hour of call ≈ 7200 here. bonus_seconds is stored in the
-- same unit so caps compare like with like.

-- 1. New plan value.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan = any (array['trial', 'byok', 'pro', 'max', 'enterprise']));

-- 2. Top-up balance for the current month.
alter table public.usage add column if not exists bonus_seconds integer not null default 0;

-- 3. Start a meeting: meeting-count quota (Free) and monthly hours (Pro/Max).
--    The hours check happens only here, so a meeting that already started is
--    never cut off by the monthly limit.
create or replace function public.start_meeting(p_user uuid, p_meeting_limit integer, p_month_cap integer)
returns table (meeting_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_row public.usage%rowtype;
  v_id uuid;
begin
  insert into public.usage (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;
  select * into v_row from public.usage where user_id = p_user and period = v_period for update;

  if p_meeting_limit is not null and v_row.meetings >= p_meeting_limit then
    return query select null::uuid, 'meeting_quota'::text;
    return;
  end if;
  if p_month_cap is not null and v_row.seconds >= p_month_cap + v_row.bonus_seconds then
    return query select null::uuid, 'hours_used'::text;
    return;
  end if;

  update public.usage set meetings = meetings + 1 where user_id = p_user and period = v_period;
  insert into public.meeting_sessions (user_id) values (p_user) returning id into v_id;
  return query select v_id, null::text;
end;
$$;

-- 4. Add recorded seconds: only the per-meeting cap is enforced now.
create or replace function public.try_add_seconds(
  p_user uuid, p_meeting uuid, p_seconds integer,
  p_meeting_cap integer, p_month_cap integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period  date := date_trunc('month', now() at time zone 'utc')::date;
  v_meeting integer;
begin
  select seconds into v_meeting from public.meeting_sessions
   where id = p_meeting and user_id = p_user
   for update;
  if not found then return 'not_found'; end if;

  if p_meeting_cap is not null and v_meeting + p_seconds > p_meeting_cap then
    return 'meeting_limit';
  end if;

  insert into public.usage (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;
  update public.meeting_sessions set seconds = seconds + p_seconds where id = p_meeting;
  update public.usage set seconds = seconds + p_seconds
   where user_id = p_user and period = v_period;
  return 'ok';
end;
$$;

-- 5. Top-up purchase (called by the Stripe webhook).
create or replace function public.add_bonus_hours(p_user uuid, p_hours integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
begin
  insert into public.usage (user_id, period, bonus_seconds) values (p_user, v_period, p_hours * 7200)
  on conflict (user_id, period) do update set bonus_seconds = public.usage.bonus_seconds + p_hours * 7200;
end;
$$;

revoke all on function public.start_meeting(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.add_bonus_hours(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_meeting(uuid, integer, integer) to service_role;
grant execute on function public.add_bonus_hours(uuid, integer) to service_role;

-- Stripe purchases already credited (idempotency for top-ups).
create table if not exists public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
