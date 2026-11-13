-- Live reply hints: count per meeting so cost stays bounded (Free vs Pro caps
-- are enforced by the suggest-reply function through this RPC).

alter table public.meeting_sessions
  add column if not exists hints integer not null default 0;

create or replace function public.try_use_hint(p_user uuid, p_meeting uuid, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.meeting_sessions
     set hints = hints + 1
   where id = p_meeting
     and user_id = p_user
     and hints < p_cap
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.try_use_hint(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.try_use_hint(uuid, uuid, integer) to service_role;
