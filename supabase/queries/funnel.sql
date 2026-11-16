-- Minutama funnel for the last 30 days (run in Supabase → SQL editor).
with u as (
  select p.id, p.created_at, p.plan from public.profiles p
  where p.created_at > now() - interval '30 days'
),
ev as (
  select user_id, name, count(*) n from public.app_events
  where created_at > now() - interval '30 days' group by 1, 2
)
select
  (select count(*) from u)                                                             as signups,
  (select count(distinct user_id) from ev where name = 'meeting_started')              as started_a_meeting,
  (select count(distinct user_id) from ev where name = 'notes_ready')                  as got_notes,
  (select count(*) from (select user_id from ev where name = 'meeting_started' and n >= 3) t) as three_plus_meetings,
  (select count(distinct user_id) from ev where name = 'checkout_opened')              as opened_checkout,
  (select count(*) from u where plan in ('pro', 'max'))                                as paying;

-- Question-card speed (seconds from the end of the client's question to the card).
select
  round(percentile_cont(0.5) within group (order by (props->>'latencyMs')::numeric) / 1000, 1) as median_s,
  round(percentile_cont(0.9) within group (order by (props->>'latencyMs')::numeric) / 1000, 1) as p90_s,
  count(*) as cards
from public.app_events
where name = 'card_shown' and props ? 'latencyMs' and created_at > now() - interval '7 days';

-- Latest errors.
select created_at, app_version, props->>'where' as where_, props->>'message' as message
from public.app_events where name = 'error' order by created_at desc limit 50;

-- Funnel by country (ad regions), last 14 days.
select
  coalesce(props->>'country', '??') as country,
  count(distinct user_id) filter (where name = 'signup')          as signups,
  count(distinct user_id) filter (where name = 'meeting_started') as started_a_call,
  count(distinct user_id) filter (where name = 'notes_ready')     as got_notes,
  count(distinct user_id) filter (where name = 'checkout_opened') as opened_checkout
from public.app_events
where created_at > now() - interval '14 days'
group by 1
order by signups desc;

-- Paying users by country of their latest event.
select coalesce(e.props->>'country', '??') as country, p.plan, count(*)
from public.profiles p
left join lateral (
  select props from public.app_events where user_id = p.id order by created_at desc limit 1
) e on true
where p.plan in ('pro', 'max')
group by 1, 2 order by 3 desc;
