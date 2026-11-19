-- Read-only BEO page for the team (/beo?t=<beo_token>), linked from the shared Google
-- Calendar and the BEO emails. Separate token from the client proposal link, and it
-- shows no prices, payments, or client phone/email.
alter table public.private_events add column if not exists beo_token uuid not null default gen_random_uuid();
create unique index if not exists private_events_beo_token_key on public.private_events(beo_token);

create or replace function public.pe_get_beo(p_token uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'title', e.data->'title', 'status', e.data->'status', 'type', e.data->'type',
      'date', e.data->'date', 'start', e.data->'start', 'end', e.data->'end',
      'guests', e.data->'guests', 'owner', e.data->'owner',
      'client', jsonb_build_object('name', e.data#>'{client,name}', 'company', e.data#>'{client,company}'),
      'spaceNames', coalesce((select jsonb_agg(sp->>'name') from jsonb_array_elements(coalesce(s.data->'spaces', '[]'::jsonb)) sp
                              where (e.data->'spaceIds') ? (sp->>'id')), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', i->'name', 'desc', i->'desc', 'category', i->'category', 'qty', i->'qty'))
                         from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) i), '[]'::jsonb),
      'beo', coalesce(e.data->'beo', '{}'::jsonb),
      'updatedAt', coalesce(e.data->>'updatedAt', e.updated_at::text)
    ),
    'settings', jsonb_build_object(
      'venueName', coalesce(s.data->>'venueName', 'Bandstand Brew Works'), 'tagline', coalesce(s.data->>'tagline', 'Where Community Gathers'),
      'logo', coalesce(s.data->>'logo', ''))
  )
  from public.private_events e
  left join public.private_event_settings s on s.id = 'main'
  where e.beo_token = p_token and coalesce(e.data->>'status', '') <> 'Lost';
$$;
grant execute on function public.pe_get_beo(uuid) to anon, authenticated;

-- BEO reminder emails now carry the team BEO link.
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
    returning e.id, e.data, e.beo_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'beo_token', beo_token)), '[]'::jsonb) into evs from due;

  return jsonb_build_object('ok', true, 'events', evs, 'settings', jsonb_build_object(
    'venueName', s->'venueName', 'spaces', s->'spaces', 'beoReminderTo', s->'beoReminderTo', 'beoReminderHours', v_hours));
end $$;

