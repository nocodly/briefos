-- Legacy client RPC: meeting counting now happens only in start_meeting
-- (service role). Clients must not bump their own counters.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'increment_meetings' and pronamespace = 'public'::regnamespace) then
    execute 'revoke all on function public.increment_meetings(uuid) from public, anon, authenticated';
  end if;
end $$;
