-- Automatic emails for website inquiries.
-- When a guest submits the inquiry form, pe_submit_inquiry queues a call (via pg_net)
-- to the app's /api/lead-notify endpoint. That endpoint claims the lead with a shared
-- secret, sends the customer auto-reply and the staff alert, then records the result.
--
-- The hook URL and secret live in private_event_secrets and are inserted outside this
-- file so the secret never lands in git:
--   insert into public.private_event_secrets(name, value) values
--     ('lead_hook_url', 'https://bandstand-events.vercel.app/api/lead-notify'),
--     ('lead_hook_secret', '<same value as the LEAD_HOOK_SECRET env var in Vercel>');

create extension if not exists pg_net with schema extensions;

create table if not exists public.private_event_secrets (
  name text primary key,
  value text not null
);
alter table public.private_event_secrets enable row level security;
revoke all on public.private_event_secrets from anon, authenticated;

create or replace function public.pe_hook_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from public.private_event_secrets where name = 'lead_hook_secret' and value = p_secret);
$$;
revoke all on function public.pe_hook_secret_ok(text) from public, anon, authenticated;

-- Called by /api/lead-notify. Returns the lead and the email settings once.
create or replace function public.pe_lead_notify_claim(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare d jsonb; s jsonb;
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  update public.private_events
     set data = jsonb_set(data, '{notify,status}', '"sending"')
   where id = p_id and data->'notify'->>'status' = 'pending'
         and created_at > now() - interval '2 days'
  returning data into d;
  if d is null then return jsonb_build_object('ok', false, 'reason', 'not pending'); end if;
  select data into s from public.private_event_settings where id = 'main';
  s := coalesce(s, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'id', p_id, 'event', d, 'settings', jsonb_build_object(
    'venueName', s->'venueName', 'tagline', s->'tagline', 'spaces', s->'spaces',
    'autoReplyOn', s->'autoReplyOn', 'autoReplySubject', s->'autoReplySubject', 'autoReplyBody', s->'autoReplyBody',
    'leadAlertTo', s->'leadAlertTo', 'replyTo', s->'replyTo'));
end $$;

-- Records what was sent on the event's activity log.
create or replace function public.pe_lead_notify_done(p_id text, p_secret text, p_status text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'); acts jsonb;
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('at', v_now, 'by', 'Automatic email', 'text', left(x, 500))), '[]'::jsonb)
    into acts from jsonb_array_elements_text(coalesce(p_lines, '[]'::jsonb)) x;
  update public.private_events
     set data = jsonb_set(data, '{notify}', jsonb_build_object('status', left(coalesce(p_status, 'done'), 20), 'at', v_now))
                || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || acts)
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.pe_lead_notify_claim(text, text) to anon, authenticated;
grant execute on function public.pe_lead_notify_done(text, text, text, jsonb) to anon, authenticated;

-- Queue the webhook. Never lets a problem here block the inquiry itself.
create or replace function public.pe_queue_lead_notify(p_id text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.private_event_secrets where name = 'lead_hook_url';
  select value into v_secret from public.private_event_secrets where name = 'lead_hook_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 20000);
exception when others then
  raise warning 'lead notify not queued: %', sqlerrm;
end $$;
revoke all on function public.pe_queue_lead_notify(text) from public, anon, authenticated;

-- Same as 20261118c, plus the notify marker and the webhook call.
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
    'notify', jsonb_build_object('status', 'pending'),
    'activity', jsonb_build_array(jsonb_build_object('at', v_now, 'by', null, 'text', 'Inquiry received from website form'))
  ));
  perform public.pe_queue_lead_notify(v_id);
  return jsonb_build_object('ok', true);
end $$;

-- Default email settings (only where not already set).
update public.private_event_settings
set data = jsonb_build_object(
  'autoReplyOn', true,
  'autoReplySubject', 'Thanks for reaching out to Bandstand Brew Works!',
  'autoReplyBody', E'Hi {first_name},\n\nThank you for reaching out to Bandstand Brew Works about your {event_type} on {date}! We received your request for {guests} guests, and our events team will be in touch within one business day to talk through spaces, menus and availability.\n\nIf you have questions in the meantime, just reply to this email.\n\nCheers,\nThe Bandstand Brew Works events team\n3922 Main St, Warrensburg, NY\nWhere Community Gathers',
  'leadAlertTo', 'erin@bandstandbrewworks.com',
  'replyTo', 'erin@bandstandbrewworks.com') || data
where id = 'main';
