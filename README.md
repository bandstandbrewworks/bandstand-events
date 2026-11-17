# Bandstand Events

Private-events app for Bandstand Brew Works ("Where Community Gathers"), replacing Tripleseat.

- **Staff app** (`/`): pipeline, calendar with space-conflict checks, proposals, BEOs, contracts, payments, reports, settings.
- **Website inquiry form** (`/inquiry`): public; each submission becomes a Lead.
- **Client proposal** (`/proposal?t=…`): private link per event; the client reviews, signs and opens the Toast invoice to pay.

Plain HTML/JS (no framework), Supabase for data and logins, hosted on Vercel.
The database lives in the **memberships** Supabase project, in its own tables (`private_events`, `private_event_settings`), so staff use their memberships logins.

## Setup

1. **Database.** In the **memberships** Supabase project, open SQL Editor and run `supabase/migrations/20261117_private_events.sql`. It only adds new tables and functions.
2. **Access.** In the same SQL Editor, turn on events access for each person (they need a memberships login first):
   ```sql
   update public.staff_roles set events_access = true
   where user_id in (select id from auth.users where lower(email) in ('name@example.com'));
   ```
3. **Vercel.** Add New → Project → import `bandstandbrewworks/bandstand-events`. Framework preset: **Other** (the repo's `vercel.json` sets the build). Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the **same values as the memberships Vercel project** (the public anon/publishable key, never the service_role/secret key). Deploy.
4. Sign in at the Vercel URL, open **Settings**, and enter spaces, menu, tax, service charge, deposit and contract terms. Click **Save settings**.

## Website embed

The staff app's **Website form** page has the link and an iframe snippet for the Bandstand website.

## Payments (Toast)

Cards are charged through Toast Invoicing. In Toast Web: Payments → Payment methods → Customer invoices → create the invoice with a deposit request, then paste its link on the event's **Contract & payments** tab. Record payments in the app when Toast shows them.

## Local preview

`npm run build` with the two environment variables set, then serve `dist/` (for example `npx serve dist`).
