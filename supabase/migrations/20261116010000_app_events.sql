-- Product usage events from the desktop app (funnel, card latency, errors).
-- Written only by the `track` Edge Function (service role); never readable by clients.
create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists app_events_name_time on public.app_events (name, created_at desc);
create index if not exists app_events_user_time on public.app_events (user_id, created_at desc);
alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;
