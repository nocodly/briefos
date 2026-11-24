-- Feedback from the desktop app ("Help us improve Minutama"): name, rating
-- (1–5 stars) and a message. Written only by the `feedback` Edge Function
-- (service role); never readable by clients. Also emailed to the team.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  name text,
  rating smallint check (rating between 1 and 5),
  message text not null,
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_time on public.feedback (created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
