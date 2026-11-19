-- Keep the shared "Bandstand Private Events" Google Calendar in step with private_events.
-- On any change that affects the calendar, pg_net calls the memberships app's
-- /api/events-calendar/sync, which owns the Google connection.
-- Needs (inserted outside git):
--   insert into public.private_event_secrets(name, value) values
--     ('gcal_sync_url', 'https://bandstand-memberships.vercel.app/api/events-calendar/sync'),
--     ('memberships_secret', '<same value as EVENTS_MAIL_SECRET in the memberships project>');

create or replace function public.pe_gcal_projection(d jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object('status', d->'status', 'title', d->'title', 'type', d->'type', 'date', d->'date',
    'start', d->'start', 'end', d->'end', 'guests', d->'guests', 'spaceIds', d->'spaceIds', 'owner', d->'owner',
    'company', d->'client'->'company');
$$;

create or replace function public.pe_gcal_queue()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text; v_id text;
begin
  if tg_op = 'UPDATE' and public.pe_gcal_projection(old.data) = public.pe_gcal_projection(new.data) then return null; end if;
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  select value into v_url from public.private_event_secrets where name = 'gcal_sync_url';
  select value into v_secret from public.private_event_secrets where name = 'memberships_secret';
  if v_url is null or v_secret is null then return null; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('id', v_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mail-secret', v_secret),
    timeout_milliseconds := 30000);
  return null;
exception when others then
  raise warning 'calendar sync not queued: %', sqlerrm;
  return null;
end $$;
revoke all on function public.pe_gcal_queue() from public, anon, authenticated;

drop trigger if exists pe_gcal_sync on public.private_events;
create trigger pe_gcal_sync after insert or update or delete on public.private_events
  for each row execute function public.pe_gcal_queue();
