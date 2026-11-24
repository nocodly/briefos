-- Whether the feedback email was accepted by Resend (and why not, if not).
alter table public.feedback add column if not exists emailed boolean;
alter table public.feedback add column if not exists email_error text;
