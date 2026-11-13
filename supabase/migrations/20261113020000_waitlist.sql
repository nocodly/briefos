-- =============================================================================
-- Minutama — website waitlist (Mac / mobile launch emails).
-- The public anon key may INSERT a row but can never read, update or delete.
-- =============================================================================

create table if not exists public.waitlist (
  id         bigint generated always as identity primary key,
  email      text not null,
  platform   text not null default 'mac' check (platform in ('mac', 'ios', 'android')),
  created_at timestamptz not null default now(),
  constraint waitlist_email_format check (
    char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create unique index if not exists waitlist_email_platform_key on public.waitlist (lower(email), platform);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist_insert_anyone" on public.waitlist;
create policy "waitlist_insert_anyone" on public.waitlist
  for insert to anon, authenticated
  with check (true);
-- No select/update/delete policies: the list is only readable with the service role.

revoke all on public.waitlist from anon, authenticated;
grant insert (email, platform) on public.waitlist to anon, authenticated;
