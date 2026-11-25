-- Weekly summary email (Monday morning): Private Events, Live Music and Distribution in one email.
-- pg_cron pings /api/weekly-summary (pg_net, same shared secret as the lead emails). The endpoint
-- reads everything through pe_weekly_summary_data() and records the send in weekly_summary_log so
-- a week is never emailed twice.
-- Needs (inserted outside git, like the other hooks):
--   insert into public.private_event_secrets(name, value)
--     values ('weekly_hook_url', 'https://events.bandstandbrewworks.com/api/weekly-summary');

create table if not exists public.weekly_summary_log (
  week_start date primary key,
  status text not null default 'sending',
  lines jsonb,
  at timestamptz not null default now()
);
alter table public.weekly_summary_log enable row level security;
drop policy if exists weekly_summary_log_read on public.weekly_summary_log;
create policy weekly_summary_log_read on public.weekly_summary_log for select to authenticated using (public.has_events_access());

-- Everything the summary needs, for the hook (secret) or an administrator sending a test.
create or replace function public.pe_weekly_summary_data(p_secret text default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_today date := (now() at time zone 'America/New_York')::date;
begin
  if not (public.pe_hook_secret_ok(p_secret) or public.is_admin()) then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'today', v_today,
    'settings', (select jsonb_build_object('venueName', s.data->'venueName', 'spaces', s.data->'spaces',
                   'weeklySummaryOn', s.data->'weeklySummaryOn', 'weeklySummaryTo', s.data->'weeklySummaryTo',
                   'balanceDueDays', s.data->'balanceDueDays', 'depositPct', s.data->'depositPct')
                 from public.private_event_settings s where s.id = 'main'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'data', e.data)) from public.private_events e), '[]'::jsonb),
    'house', coalesce((select jsonb_agg(to_jsonb(h)) from public.house_events h
                       where h.date between v_today - 14 and v_today + 35), '[]'::jsonb),
    'music', coalesce((select jsonb_agg(jsonb_build_object('date', b.performance_date, 'start', b.start_time, 'end', b.end_time,
                         'status', b.status, 'fee', b.fee, 'payment', b.payment_status,
                         'artist', coalesce(nullif(trim(a.name), ''), b.source_artist, 'Live music')) order by b.performance_date, b.start_time)
                       from public.music_bookings b left join public.music_artists a on a.id = b.artist_id
                       where b.performance_date between v_today - 120 and v_today + 60), '[]'::jsonb),
    'noMusic', coalesce((select jsonb_agg(n.performance_date) from public.music_no_music_dates n
                         where n.performance_date between v_today and v_today + 60), '[]'::jsonb)
  );
end $$;
revoke all on function public.pe_weekly_summary_data(text) from public;
grant execute on function public.pe_weekly_summary_data(text) to anon, authenticated;

-- Claim this week's send (once), and record how it went.
create or replace function public.pe_weekly_summary_claim(p_secret text, p_week date)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  insert into public.weekly_summary_log(week_start) values (p_week)
  on conflict (week_start) do update set status = 'sending', at = now()
    where public.weekly_summary_log.status = 'failed'
       or (public.weekly_summary_log.status = 'sending' and public.weekly_summary_log.at < now() - interval '2 hours');
  return found;
end $$;
create or replace function public.pe_weekly_summary_done(p_secret text, p_week date, p_status text, p_lines jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.pe_hook_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  update public.weekly_summary_log set status = left(p_status, 20), lines = p_lines, at = now() where week_start = p_week;
end $$;
revoke all on function public.pe_weekly_summary_claim(text, date) from public;
revoke all on function public.pe_weekly_summary_done(text, date, text, jsonb) from public;
grant execute on function public.pe_weekly_summary_claim(text, date) to anon, authenticated;
grant execute on function public.pe_weekly_summary_done(text, date, text, jsonb) to anon, authenticated;

create or replace function public.pe_queue_weekly_summary()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.private_event_secrets where name = 'weekly_hook_url';
  select value into v_secret from public.private_event_secrets where name = 'lead_hook_secret';
  if v_url is null or v_secret is null then return; end if;
  if exists (select 1 from public.private_event_settings st where st.id = 'main' and st.data->>'weeklySummaryOn' = 'false') then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.pe_queue_weekly_summary() from public, anon, authenticated;

-- Mondays at 13:00 UTC: 8:00 AM Eastern in winter, 9:00 AM in summer.
select cron.unschedule(jobid) from cron.job where jobname = 'pe-weekly-summary';
select cron.schedule('pe-weekly-summary', '0 13 * * 1', 'select public.pe_queue_weekly_summary()');

update public.private_event_settings set data = jsonb_build_object(
  'weeklySummaryOn', true,
  'weeklySummaryTo', 'erin@bandstandbrewworks.com, deane@bandstandbrewworks.com, adam@bandstandbrewworks.com, laurie@bandstandbrewworks.com, darby@bandstandbrewworks.com') || data
where id = 'main';
