-- Admin fee: pass the event's admin fee % to the client proposal page.
create or replace function public.pe_get_proposal(p_token uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'title', e.data->'title', 'status', e.data->'status', 'date', e.data->'date', 'start', e.data->'start', 'end', e.data->'end',
      'guests', e.data->'guests', 'owner', e.data->'owner',
      'client', jsonb_build_object('name', e.data#>'{client,name}', 'company', e.data#>'{client,company}'),
      'spaceNames', coalesce((select jsonb_agg(sp->>'name') from jsonb_array_elements(coalesce(s.data->'spaces', '[]'::jsonb)) sp
                              where (e.data->'spaceIds') ? (sp->>'id')), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', i->'name', 'desc', i->'desc', 'category', i->'category', 'unit', i->'unit', 'price', i->'price', 'qty', i->'qty'))
                         from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) i), '[]'::jsonb),
      'roomFee', e.data->'roomFee', 'fbMinimum', e.data->'fbMinimum', 'serviceRate', e.data->'serviceRate', 'adminFeeRate', e.data->'adminFeeRate',
      'taxRate', e.data->'taxRate', 'depositPct', e.data->'depositPct', 'taxService', e.data->'taxService',
      'contract', jsonb_build_object('signedAt', e.data#>'{contract,signedAt}', 'signedName', e.data#>'{contract,signedName}'),
      'toast', jsonb_build_object('invoiceNumber', e.data#>'{toast,invoiceNumber}', 'invoiceUrl', e.data#>'{toast,invoiceUrl}'),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', pm->'amount', 'kind', pm->'kind', 'date', pm->'date'))
                            from jsonb_array_elements(coalesce(e.data->'payments', '[]'::jsonb)) pm), '[]'::jsonb),
      'imported', case when e.data ? 'imported' then jsonb_build_object('actual', e.data#>'{imported,actual}', 'grandTotal', e.data#>'{imported,grandTotal}', 'deposit', e.data#>'{imported,deposit}') end
    ),
    'settings', jsonb_build_object(
      'venueName', coalesce(s.data->>'venueName', 'Bandstand Brew Works'), 'tagline', coalesce(s.data->>'tagline', 'Where Community Gathers'),
      'logo', coalesce(s.data->>'logo', ''), 'terms', coalesce(s.data->>'terms', ''), 'balanceDueDays', coalesce(s.data->'balanceDueDays', '7'::jsonb))
  )
  from public.private_events e
  left join public.private_event_settings s on s.id = 'main'
  where e.client_token = p_token and coalesce(e.data->>'status', '') <> 'Lost';
$$;


create or replace function public.pe_submit_inquiry(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb;
  v_id text := replace(gen_random_uuid()::text, '-', '');
  v_name text := left(trim(coalesce(p->>'name', '')), 120);
  v_email text := left(trim(coalesce(p->>'email', '')), 200);
  v_date text := coalesce(p->>'date', '');
  v_alt text := coalesce(p->>'alt', '');
  v_space text := left(coalesce(p->>'space', ''), 64);
  v_type text := left(coalesce(p->>'type', 'Private party'), 80);
  v_guests int;
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_today date := (now() at time zone 'America/New_York')::date;
  v_spaces jsonb := '[]'::jsonb;
  v_notes text;
begin
  if coalesce(p->>'website', '') <> '' then return jsonb_build_object('ok', true); end if; -- spam trap
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter your name and a valid email.'; end if;
  if v_date !~ '^\d{4}-\d{2}-\d{2}$' or v_date::date < v_today then raise exception 'Please choose a date in the future.'; end if;
  if v_alt !~ '^\d{4}-\d{2}-\d{2}$' then v_alt := ''; end if;
  if (select count(*) from public.private_events where created_at > now() - interval '1 hour' and data->>'source' = 'Website form') >= 30 then
    raise exception 'We are receiving a lot of requests right now. Please call or email us instead.';
  end if;
  v_guests := least(greatest(coalesce(nullif(regexp_replace(coalesce(p->>'guests', ''), '\D', '', 'g'), '')::int, 0), 1), 5000);
  select data into s from public.private_event_settings where id = 'main';
  s := coalesce(s, '{}'::jsonb);
  if v_space <> '' and exists (select 1 from jsonb_array_elements(coalesce(s->'spaces', '[]'::jsonb)) sp where sp->>'id' = v_space) then
    v_spaces := jsonb_build_array(v_space);
  end if;
  v_notes := concat_ws(E'\n',
    nullif(left(trim(coalesce(p->>'msg', '')), 2000), ''),
    case when v_alt <> '' then 'Backup date: ' || v_alt end,
    'Heard about us: ' || left(coalesce(p->>'heard', ''), 80));

  insert into public.private_events (id, data) values (v_id, jsonb_build_object(
    'status', 'Lead', 'source', 'Website form', 'createdAt', v_now, 'updatedAt', v_now,
    'title', v_type || ' — ' || v_name, 'type', v_type,
    'date', v_date,
    'start', case when coalesce(p->>'start', '') ~ '^\d{2}:\d{2}$' then p->>'start' else '18:00' end,
    'end',   case when coalesce(p->>'end', '')   ~ '^\d{2}:\d{2}$' then p->>'end'   else '22:00' end,
    'spaceIds', v_spaces, 'guests', v_guests, 'owner', '',
    'followUp', to_char(v_today + 1, 'YYYY-MM-DD'), 'lostReason', '', 'notes', v_notes,
    'client', jsonb_build_object('name', v_name, 'email', v_email,
                                 'phone', left(coalesce(p->>'phone', ''), 40), 'company', left(coalesce(p->>'company', ''), 120)),
    'items', '[]'::jsonb, 'roomFee', 0, 'fbMinimum', 0,
    'serviceRate', coalesce((s->>'serviceRate')::numeric, 20), 'adminFeeRate', coalesce((s->>'adminFeeRate')::numeric, 0), 'taxRate', coalesce((s->>'taxRate')::numeric, 7),
    'depositPct', coalesce((s->>'depositPct')::numeric, 50), 'taxService', coalesce((s->>'taxService')::boolean, true),
    'beo', jsonb_build_object('timeline', '[]'::jsonb, 'setup', '', 'music', '', 'bar', '', 'kitchen', '', 'staffing', '', 'allergies', ''),
    'contract', jsonb_build_object('sentAt', '', 'signedAt', '', 'signedName', ''),
    'toast', jsonb_build_object('invoiceNumber', '', 'invoiceUrl', ''),
    'payments', '[]'::jsonb,
    'activity', jsonb_build_array(jsonb_build_object('at', v_now, 'by', null, 'text', 'Inquiry received from website form'))
  ));
  return jsonb_build_object('ok', true);
end $$;


update public.private_event_settings
set data = data || jsonb_build_object('adminFeeRate', coalesce((data->>'adminFeeRate')::numeric, 5),
  'terms', replace(data->>'terms', '4. Service charge and tax. A service charge applies to food and beverage. Sales tax applies as required by law.', '4. Service charge, admin fee and tax. A service charge and an administrative fee apply to food and beverage. Sales tax applies as required by law.'))
where id = 'main';
