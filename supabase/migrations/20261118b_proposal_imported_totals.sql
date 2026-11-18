-- Client proposal: include Tripleseat totals for imported events.
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
      'roomFee', e.data->'roomFee', 'fbMinimum', e.data->'fbMinimum', 'serviceRate', e.data->'serviceRate',
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

