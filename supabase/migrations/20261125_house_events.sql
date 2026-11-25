-- House events: Bandstand's own events (ugly sweater party, beach party, etc.). Information only:
-- they show on the events calendar and the Event Manager Google Calendar and are mentioned when
-- booking a private event that day, but never block a booking. Live music is read from the Live
-- Music schedule, also information only.

create table if not exists public.house_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  date date not null,
  start_time text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  end_time text check (end_time is null or end_time ~ '^\d{2}:\d{2}$'),
  all_day boolean not null default false,
  space_ids text[] not null default '{}',
  whole_building boolean not null default false,
  notes text,
  series_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists house_events_date_idx on public.house_events(date);
create index if not exists house_events_series_idx on public.house_events(series_id);
alter table public.house_events enable row level security;
drop policy if exists house_read on public.house_events;
drop policy if exists house_write on public.house_events;
create policy house_read on public.house_events for select to authenticated using (public.has_events_access());
create policy house_write on public.house_events for all to authenticated using (public.has_events_access()) with check (public.has_events_access());

create or replace function public.house_events_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists house_events_touch on public.house_events;
create trigger house_events_touch before update on public.house_events for each row execute function public.house_events_touch();

-- Google Calendar: same pipeline as private events, with { house_id } in the body.
create or replace function public.house_gcal_queue()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text; v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  select value into v_url from public.private_event_secrets where name = 'gcal_sync_url';
  select value into v_secret from public.private_event_secrets where name = 'memberships_secret';
  if v_url is null or v_secret is null then return null; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('house_id', v_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mail-secret', v_secret),
    timeout_milliseconds := 30000);
  return null;
exception when others then
  raise warning 'house calendar sync not queued: %', sqlerrm;
  return null;
end $$;
revoke all on function public.house_gcal_queue() from public, anon, authenticated;
drop trigger if exists house_gcal_sync on public.house_events;
create trigger house_gcal_sync after insert or update or delete on public.house_events
  for each row execute function public.house_gcal_queue();

-- Live music for the events calendar: dates, times and artist only (no fees), for events staff.
create or replace function public.events_music_schedule(p_from date, p_to date)
returns table (id uuid, performance_date date, start_time time, end_time time, artist text, status text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.performance_date, b.start_time, b.end_time,
         coalesce(nullif(trim(a.name), ''), nullif(trim(b.source_artist), ''), 'Live music'), b.status
  from public.music_bookings b
  left join public.music_artists a on a.id = b.artist_id
  where (public.has_events_access() or public.has_music_access())
    and b.performance_date between p_from and least(p_to, p_from + 800)
    and coalesce(b.status, '') <> 'cancelled'
  order by b.performance_date, b.start_time;
$$;
revoke all on function public.events_music_schedule(date, date) from public, anon;
grant execute on function public.events_music_schedule(date, date) to authenticated;

alter publication supabase_realtime add table public.house_events;
