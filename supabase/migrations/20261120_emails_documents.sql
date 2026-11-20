-- Two-way client email on each event, plus a shared document library.
-- Emails are sent and read through the connected Gmail account by the memberships app
-- (service role writes rows); staff with events access can read them here.

-- Gmail permission granted when the account was connected (send only, or send + read).
alter table public.events_email_connection add column if not exists scopes text;

create table if not exists public.private_event_emails (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.private_events(id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  gmail_id text unique,
  thread_id text,
  rfc_message_id text,
  from_addr text, to_addr text, cc text,
  subject text, body text,
  attachments jsonb not null default '[]'::jsonb,
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists private_event_emails_event_idx on public.private_event_emails(event_id, created_at);
create index if not exists private_event_emails_thread_idx on public.private_event_emails(thread_id);
alter table public.private_event_emails enable row level security;
drop policy if exists "events staff read emails" on public.private_event_emails;
create policy "events staff read emails" on public.private_event_emails for select to authenticated using (public.has_events_access());
grant select on public.private_event_emails to authenticated;

create table if not exists public.private_event_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime text,
  notes text,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.private_event_documents enable row level security;
drop policy if exists "events staff manage documents" on public.private_event_documents;
create policy "events staff manage documents" on public.private_event_documents for all to authenticated
  using (public.has_events_access()) with check (public.has_events_access());
grant select, insert, update, delete on public.private_event_documents to authenticated;

-- Private file storage for the library (20 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('event-docs', 'event-docs', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists "events staff read event-docs" on storage.objects;
drop policy if exists "events staff add event-docs" on storage.objects;
drop policy if exists "events staff remove event-docs" on storage.objects;
create policy "events staff read event-docs" on storage.objects for select to authenticated using (bucket_id = 'event-docs' and public.has_events_access());
create policy "events staff add event-docs" on storage.objects for insert to authenticated with check (bucket_id = 'event-docs' and public.has_events_access());
create policy "events staff remove event-docs" on storage.objects for delete to authenticated using (bucket_id = 'event-docs' and public.has_events_access());

-- Live updates in the app (new replies, documents added by someone else).
do $$ begin
  begin alter publication supabase_realtime add table public.private_event_emails; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.private_event_documents; exception when duplicate_object then null; end;
end $$;

-- Check for client replies every 5 minutes, only while there are recent threads.
-- Uses the same memberships URL/secret rows as the calendar sync, plus:
--   insert into public.private_event_secrets(name, value)
--     values ('email_sync_url', 'https://bandstand-memberships.vercel.app/api/events-email/sync');
create or replace function public.pe_queue_email_sync()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.private_event_secrets where name = 'email_sync_url';
  select value into v_secret from public.private_event_secrets where name = 'memberships_secret';
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.private_event_emails where created_at > now() - interval '90 days' and thread_id is not null) then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mail-secret', v_secret),
    timeout_milliseconds := 55000);
end $$;
revoke all on function public.pe_queue_email_sync() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'pe-email-sync';
select cron.schedule('pe-email-sync', '*/5 * * * *', 'select public.pe_queue_email_sync()');

-- Starter email templates (only if none saved yet). Fill-ins are replaced when composing.
update public.private_event_settings
set data = data || jsonb_build_object('emailTemplates', jsonb_build_array(
  jsonb_build_object('id','t-followup','name','Inquiry follow-up','subject','Your {event_type} at Bandstand Brew Works',
    'body', E'Hi {first_name},\n\nThanks so much for thinking of Bandstand Brew Works for your {event_type} on {date}! I''d love to learn a little more about what you have in mind: the feel of the event, food and drinks, and whether you''d like live music.\n\nI''ve attached our event menu so you can take a look. When is a good time for a quick call?\n\nCheers,\n{event_manager}\nBandstand Brew Works'),
  jsonb_build_object('id','t-proposal','name','Proposal ready','subject','Your proposal for {date}',
    'body', E'Hi {first_name},\n\nYour proposal for {event_name} on {date} is ready. You can review it, sign and pay the deposit here:\n{proposal_link}\n\nEstimated total: {total}\nDeposit to hold the date: {deposit}\n\nLet me know if you''d like to change anything.\n\nCheers,\n{event_manager}\nBandstand Brew Works'),
  jsonb_build_object('id','t-deposit','name','Deposit reminder','subject','Holding {date} for you',
    'body', E'Hi {first_name},\n\nJust a friendly reminder that we''re holding {date} for your {event_type}. To confirm the date, please sign and pay the {deposit} deposit here:\n{proposal_link}\n\nThanks!\n{event_manager}\nBandstand Brew Works'),
  jsonb_build_object('id','t-final','name','Final details (30 days out)','subject','Final details for {event_name}',
    'body', E'Hi {first_name},\n\nWe''re getting close to your event on {date}! Final food choices are due 30 days before the event. Could you confirm:\n\n- Final guest count (currently {guests})\n- Menu selections and any allergies or dietary needs\n- Your timeline for the day\n\nCheers,\n{event_manager}\nBandstand Brew Works'),
  jsonb_build_object('id','t-thanks','name','Thank you after the event','subject','Thank you from Bandstand Brew Works',
    'body', E'Hi {first_name},\n\nThank you for celebrating with us! We hope you and your guests had a wonderful time. If you have a moment, we''d love a review, and we''d be happy to host you again.\n\nCheers,\n{event_manager}\nBandstand Brew Works')
))
where id = 'main' and not (data ? 'emailTemplates');
