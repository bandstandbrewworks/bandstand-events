-- Bandstand Events (Tripleseat replacement)
-- Run once in the MEMBERSHIPS Supabase project: SQL Editor > New query > paste > Run.
-- Safe to re-run. It only ADDS things: two new tables, one new column on staff_roles,
-- and new functions prefixed pe_. It does not change any membership or music tables.

-- 1. Who can use the events app ---------------------------------------------------------------
alter table public.staff_roles add column if not exists events_access boolean not null default false;

create or replace function public.has_events_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = auth.uid() and events_access = true and role in ('admin', 'staff')
  );
$$;
revoke all on function public.has_events_access() from public, anon;
grant execute on function public.has_events_access() to authenticated, service_role;

-- 2. Tables ------------------------------------------------------------------------------------
-- Each event is one JSON document (same shape the app uses), plus a secret token for the
-- client's proposal link.
create table if not exists public.private_events (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{2,64}$'),
  data jsonb not null,
  client_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists private_events_date_idx on public.private_events ((data->>'date'));

create table if not exists public.private_event_settings (
  id text primary key default 'main' check (id = 'main'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.private_event_settings (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;

create or replace function public._pe_touch()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
drop trigger if exists pe_touch on public.private_events;
create trigger pe_touch before insert or update on public.private_events for each row execute function public._pe_touch();
drop trigger if exists pe_settings_touch on public.private_event_settings;
create trigger pe_settings_touch before insert or update on public.private_event_settings for each row execute function public._pe_touch();

-- 3. Row level security: only staff with events_access can read or change anything ------------
alter table public.private_events enable row level security;
alter table public.private_event_settings enable row level security;
revoke all on public.private_events from anon;
revoke all on public.private_event_settings from anon;
grant select, insert, update, delete on public.private_events to authenticated;
grant select, insert, update on public.private_event_settings to authenticated;

drop policy if exists pe_read on public.private_events;
drop policy if exists pe_insert on public.private_events;
drop policy if exists pe_update on public.private_events;
drop policy if exists pe_delete on public.private_events;
create policy pe_read   on public.private_events for select to authenticated using (public.has_events_access());
create policy pe_insert on public.private_events for insert to authenticated with check (public.has_events_access());
create policy pe_update on public.private_events for update to authenticated using (public.has_events_access()) with check (public.has_events_access());
create policy pe_delete on public.private_events for delete to authenticated using (public.has_events_access());

drop policy if exists pe_settings_read on public.private_event_settings;
drop policy if exists pe_settings_write on public.private_event_settings;
drop policy if exists pe_settings_update on public.private_event_settings;
create policy pe_settings_read   on public.private_event_settings for select to authenticated using (public.has_events_access());
create policy pe_settings_write  on public.private_event_settings for insert to authenticated with check (public.has_events_access());
create policy pe_settings_update on public.private_event_settings for update to authenticated using (public.has_events_access()) with check (public.has_events_access());

-- Live updates between staff screens
do $$ begin
  begin alter publication supabase_realtime add table public.private_events; exception when others then null; end;
  begin alter publication supabase_realtime add table public.private_event_settings; exception when others then null; end;
end $$;

-- 4. Public functions (website form and client proposal link) ---------------------------------
-- These run with elevated rights but only expose what a client should see.

create or replace function public.pe_public_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'venueName', coalesce(s.data->>'venueName', 'Bandstand Brew Works'),
    'tagline',   coalesce(s.data->>'tagline', 'Where Community Gathers'),
    'logo',      coalesce(s.data->>'logo', ''),
    'eventTypes', coalesce(s.data->'eventTypes', '[]'::jsonb),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', sp->>'id', 'name', sp->>'name', 'standing', sp->'standing'))
                        from jsonb_array_elements(coalesce(s.data->'spaces', '[]'::jsonb)) sp), '[]'::jsonb)
  )
  from public.private_event_settings s where s.id = 'main';
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
    'serviceRate', coalesce((s->>'serviceRate')::numeric, 20), 'taxRate', coalesce((s->>'taxRate')::numeric, 7),
    'depositPct', coalesce((s->>'depositPct')::numeric, 50), 'taxService', coalesce((s->>'taxService')::boolean, true),
    'beo', jsonb_build_object('timeline', '[]'::jsonb, 'setup', '', 'music', '', 'bar', '', 'kitchen', '', 'staffing', '', 'allergies', ''),
    'contract', jsonb_build_object('sentAt', '', 'signedAt', '', 'signedName', ''),
    'toast', jsonb_build_object('invoiceNumber', '', 'invoiceUrl', ''),
    'payments', '[]'::jsonb,
    'activity', jsonb_build_array(jsonb_build_object('at', v_now, 'by', null, 'text', 'Inquiry received from website form'))
  ));
  return jsonb_build_object('ok', true);
end $$;

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
                            from jsonb_array_elements(coalesce(e.data->'payments', '[]'::jsonb)) pm), '[]'::jsonb)
    ),
    'settings', jsonb_build_object(
      'venueName', coalesce(s.data->>'venueName', 'Bandstand Brew Works'), 'tagline', coalesce(s.data->>'tagline', 'Where Community Gathers'),
      'logo', coalesce(s.data->>'logo', ''), 'terms', coalesce(s.data->>'terms', ''), 'balanceDueDays', coalesce(s.data->'balanceDueDays', '7'::jsonb))
  )
  from public.private_events e
  left join public.private_event_settings s on s.id = 'main'
  where e.client_token = p_token and coalesce(e.data->>'status', '') <> 'Lost';
$$;

create or replace function public.pe_sign_proposal(p_token uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  e public.private_events;
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_status text;
  v_new text;
  v_act jsonb;
begin
  if length(v_name) < 2 then raise exception 'Please type your full name to sign.'; end if;
  select * into e from public.private_events where client_token = p_token for update;
  if not found or e.data->>'status' in ('Lost', 'Completed') then raise exception 'This proposal is no longer available. Please contact us.'; end if;
  if coalesce(e.data#>>'{contract,signedAt}', '') <> '' then return public.pe_get_proposal(p_token); end if;
  v_status := e.data->>'status';
  v_new := case when v_status in ('Lead', 'Proposal Sent') then 'Tentative' else v_status end;
  v_act := jsonb_build_array(jsonb_build_object('at', v_now, 'by', null, 'text', 'Contract signed online by ' || v_name));
  if v_new <> v_status then
    v_act := v_act || jsonb_build_array(jsonb_build_object('at', v_now, 'by', null, 'text', 'Status changed: ' || v_status || ' → ' || v_new));
  end if;
  update public.private_events set data = data || jsonb_build_object(
      'contract', coalesce(data->'contract', '{}'::jsonb) || jsonb_build_object('signedAt', v_now, 'signedName', v_name),
      'status', v_new,
      'activity', v_act || coalesce(data->'activity', '[]'::jsonb))
  where id = e.id;
  return public.pe_get_proposal(p_token);
end $$;

revoke all on function public.pe_public_settings() from public;
revoke all on function public.pe_submit_inquiry(jsonb) from public;
revoke all on function public.pe_get_proposal(uuid) from public;
revoke all on function public.pe_sign_proposal(uuid, text) from public;
grant execute on function public.pe_public_settings() to anon, authenticated;
grant execute on function public.pe_submit_inquiry(jsonb) to anon, authenticated;
grant execute on function public.pe_get_proposal(uuid) to anon, authenticated;
grant execute on function public.pe_sign_proposal(uuid, text) to anon, authenticated;

-- 5. Give people access (edit the emails, then run these two lines) ----------------------------
-- They must already have a login in this project (the same login they use for memberships).
-- update public.staff_roles set events_access = true
--   where user_id in (select id from auth.users where lower(email) in ('laurie@example.com', 'darby@example.com', 'adam@example.com'));
