-- =============================================================================
-- Minutama — stage 1: server-side usage metering.
-- Clients can READ their usage; only server functions (service role) write it.
-- All quota checks are atomic SQL functions so parallel requests can't race
-- past a limit.
-- =============================================================================

-- Monthly counters per user. period = first day of the month (UTC).
create table if not exists public.usage (
  user_id   uuid not null references auth.users(id) on delete cascade,
  period    date not null,
  meetings  integer not null default 0,
  seconds   integer not null default 0,
  primary key (user_id, period)
);

-- One row per recorded meeting (server-side; the desktop keeps its own copy).
create table if not exists public.meeting_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz not null default now(),
  seconds     integer not null default 0,
  enhanced_at timestamptz
);
create index if not exists meeting_sessions_user_idx on public.meeting_sessions (user_id, started_at desc);

alter table public.usage enable row level security;
alter table public.meeting_sessions enable row level security;

drop policy if exists "usage_select_own" on public.usage;
create policy "usage_select_own" on public.usage for select using (auth.uid() = user_id);

drop policy if exists "meeting_sessions_select_own" on public.meeting_sessions;
create policy "meeting_sessions_select_own" on public.meeting_sessions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role writes these tables.

-- Start a meeting if the monthly meeting quota allows it.
-- p_meeting_limit null = unlimited. Returns the new meeting id, or null when
-- the quota is exhausted.
create or replace function public.try_start_meeting(p_user uuid, p_meeting_limit integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_count  integer;
  v_id     uuid;
begin
  insert into public.usage (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;

  -- Row lock serializes concurrent starts for the same user.
  select meetings into v_count from public.usage
   where user_id = p_user and period = v_period
   for update;

  if p_meeting_limit is not null and v_count >= p_meeting_limit then
    return null;
  end if;

  update public.usage set meetings = meetings + 1
   where user_id = p_user and period = v_period;

  insert into public.meeting_sessions (user_id) values (p_user) returning id into v_id;
  return v_id;
end;
$$;

-- Add recorded seconds to a meeting if both the per-meeting cap and the
-- monthly cap allow it. Caps null = unlimited. Returns:
--   'ok' | 'not_found' | 'meeting_limit' | 'month_limit'
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
  v_month   integer;
begin
  select seconds into v_meeting from public.meeting_sessions
   where id = p_meeting and user_id = p_user
   for update;
  if not found then return 'not_found'; end if;

  insert into public.usage (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;
  select seconds into v_month from public.usage
   where user_id = p_user and period = v_period
   for update;

  if p_meeting_cap is not null and v_meeting + p_seconds > p_meeting_cap then
    return 'meeting_limit';
  end if;
  if p_month_cap is not null and v_month + p_seconds > p_month_cap then
    return 'month_limit';
  end if;

  update public.meeting_sessions set seconds = seconds + p_seconds where id = p_meeting;
  update public.usage set seconds = seconds + p_seconds
   where user_id = p_user and period = v_period;
  return 'ok';
end;
$$;

-- Only server functions may call the quota functions.
revoke all on function public.try_start_meeting(uuid, integer) from public, anon, authenticated;
revoke all on function public.try_add_seconds(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.try_start_meeting(uuid, integer) to service_role;
grant execute on function public.try_add_seconds(uuid, uuid, integer, integer, integer) to service_role;
