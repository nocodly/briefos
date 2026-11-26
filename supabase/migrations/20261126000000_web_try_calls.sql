-- "Try a call now" on the website (functions/try-call): one row per started
-- call, only to enforce daily limits. No user data — just a hashed IP.
create table if not exists public.web_try_calls (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists web_try_calls_ip_created_idx on public.web_try_calls (ip_hash, created_at);
create index if not exists web_try_calls_created_idx on public.web_try_calls (created_at);

-- Service role only (the edge function); no client access.
alter table public.web_try_calls enable row level security;
