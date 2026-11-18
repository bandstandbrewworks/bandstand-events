-- Default start/end time and guest count for the website inquiry form (set in the app's Settings).
create or replace function public.pe_public_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'venueName', coalesce(s.data->>'venueName', 'Bandstand Brew Works'),
    'tagline',   coalesce(s.data->>'tagline', 'Where Community Gathers'),
    'logo',      coalesce(s.data->>'logo', ''),
    'eventTypes', coalesce(s.data->'eventTypes', '[]'::jsonb),
    'defaultStart', coalesce(s.data->>'defaultStart', '18:00'),
    'defaultEnd', coalesce(s.data->>'defaultEnd', '22:00'),
    'defaultGuests', coalesce(s.data->'defaultGuests', '50'::jsonb),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', sp->>'id', 'name', sp->>'name', 'standing', sp->'standing'))
                        from jsonb_array_elements(coalesce(s.data->'spaces', '[]'::jsonb)) sp), '[]'::jsonb)
  )
  from public.private_event_settings s where s.id = 'main';
$$;
revoke all on function public.pe_public_settings() from public;
grant execute on function public.pe_public_settings() to anon, authenticated;

update public.private_event_settings
set data = data || jsonb_build_object('defaultStart', coalesce(data->>'defaultStart', '18:00'), 'defaultEnd', coalesce(data->>'defaultEnd', '22:00'), 'defaultGuests', coalesce(data->'defaultGuests', '50'::jsonb))
where id = 'main';
