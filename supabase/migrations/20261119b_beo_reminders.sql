-- Automatic BEO reminder emails, sent to the team a set number of hours (default 36)
-- before each Tentative or Definite event. pg_cron runs hourly and pings
-- /api/beo-reminder (via pg_net, same shared secret as the lead emails). The endpoint
-- claims due events, emails the BEO + event details, then records the result.
--
-- Needs this row (inserted outside git, like the lead hook):
--   insert into public.private_event_secrets(name, value)
--     values ('beo_hook_url', 'https://bandstand-events.vercel.app/api/beo-reminder');

create extension if not exists pg_cron;

-- Start of an event as a timestamptz in Eastern time (null if the date is missing or malformed).
create or replace function public.pe_event_start(d jsonb)
returns timestamptz language sql stable set search_path = ''
as $$
  select case when coalesce(d->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    then ((d->>'date') || ' ' ||
          case when coalesce(d->>'start', '') ~ '^\d{2}:\d{2}$' then d->>'start' else '12:00' end)::timestamp
         at time zone 'America/New_York'
  end;
$$;

-- Claims every event that is due for its reminder and returns them with the settings.
create or replace function public.pe_beo_claim(p_secret text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s jsonb; v_hours numeric; v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'); evs jsonb;
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  select data into s from public.private_event_settings where id = 'main';
  s := coalesce(s, '{}'::jsonb);
  if coalesce(s->>'beoReminderOn', 'true') = 'false' then return jsonb_build_object('ok', true, 'events', '[]'::jsonb, 'off', true); end if;
  v_hours := least(greatest(coalesce(nullif(s->>'beoReminderHours', '')::numeric, 36), 1), 336);

  with due as (
    update public.private_events e
       set data = jsonb_set(e.data, '{beoReminder}', jsonb_build_object('status', 'sending', 'at', v_now))
     where e.data->>'status' in ('Tentative', 'Definite')
       and public.pe_event_start(e.data) > now()
       and public.pe_event_start(e.data) <= now() + make_interval(secs => v_hours * 3600)
       and (coalesce(e.data->'beoReminder'->>'status', '') = ''
            or (e.data->'beoReminder'->>'status' = 'sending'
                and (e.data->'beoReminder'->>'at')::timestamptz < now() - interval '2 hours'))
    returning e.id, e.data, e.client_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'token', client_token)), '[]'::jsonb) into evs from due;

  return jsonb_build_object('ok', true, 'events', evs, 'settings', jsonb_build_object(
    'venueName', s->'venueName', 'spaces', s->'spaces', 'beoReminderTo', s->'beoReminderTo', 'beoReminderHours', v_hours));
end $$;

create or replace function public.pe_beo_done(p_id text, p_secret text, p_status text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'); acts jsonb;
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('at', v_now, 'by', 'Automatic email', 'text', left(x, 500))), '[]'::jsonb)
    into acts from jsonb_array_elements_text(coalesce(p_lines, '[]'::jsonb)) x;
  update public.private_events
     set data = case when p_status is null then data   -- manual "Email BEO now": log only
                     else jsonb_set(data, '{beoReminder}', jsonb_build_object('status', left(p_status, 20), 'at', v_now)) end
                || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || acts)
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.pe_beo_claim(text) to anon, authenticated;
grant execute on function public.pe_beo_done(text, text, text, jsonb) to anon, authenticated;

create or replace function public.pe_queue_beo_reminders()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.private_event_secrets where name = 'beo_hook_url';
  select value into v_secret from public.private_event_secrets where name = 'lead_hook_secret';
  if v_url is null or v_secret is null then return; end if;
  -- Only call out when something is actually due, to keep the hourly job quiet.
  if not exists (
    select 1 from public.private_events e, public.private_event_settings st
     where st.id = 'main' and coalesce(st.data->>'beoReminderOn', 'true') <> 'false'
       and e.data->>'status' in ('Tentative', 'Definite')
       and public.pe_event_start(e.data) > now()
       and public.pe_event_start(e.data) <= now() + make_interval(secs => least(greatest(coalesce(nullif(st.data->>'beoReminderHours', '')::numeric, 36), 1), 336) * 3600)
       and coalesce(e.data->'beoReminder'->>'status', '') in ('', 'sending')
  ) then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.pe_queue_beo_reminders() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'pe-beo-reminders';
select cron.schedule('pe-beo-reminders', '7 * * * *', 'select public.pe_queue_beo_reminders()');

-- Default settings (only where not already set).
update public.private_event_settings
set data = jsonb_build_object(
  'beoReminderOn', true,
  'beoReminderHours', 36,
  'beoReminderTo', 'erin@bandstandbrewworks.com, deane@bandstandbrewworks.com, adam@bandstandbrewworks.com, laurie@bandstandbrewworks.com, darby@bandstandbrewworks.com') || data
where id = 'main';
