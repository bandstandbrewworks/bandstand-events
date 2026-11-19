// Automatic emails for website inquiries.
//
//   POST (from the database, header x-hook-secret)  { id }  -> auto-reply to the guest + alert to staff
//   POST (from the app, Authorization: Bearer <staff session>) { test: true } -> test email to that staff member
//   GET  ?status=1  -> whether sending is set up (no secrets returned)
//
// Sending goes through, in order of preference:
//   1. the Gmail account connected in Settings (stored and sent by the memberships app)
//   2. SMTP (e.g. a Google app password) or Resend, if configured
// Vercel environment variables:
//   MEMBERSHIPS_MAIL_SECRET          shared with EVENTS_MAIL_SECRET in the memberships project
//   MEMBERSHIPS_URL (optional)       default https://bandstand-memberships.vercel.app
//   LEAD_HOOK_SECRET                 shared with the database (private_event_secrets.lead_hook_secret)
//   SMTP_USER, SMTP_PASS             e.g. erin@bandstandbrewworks.com + a Google app password
//   SMTP_HOST, SMTP_PORT (optional)  default smtp.gmail.com : 465
//   or RESEND_API_KEY + RESEND_FROM  as an alternative to SMTP
//   EMAIL_FROM_NAME (optional)       default "Bandstand Brew Works Events"
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (already set for the site)

const { SB_URL, SB_KEY, APP_URL, MEMBERSHIPS_URL, pickMailer, mailer, send, rpc, safeEq, fmtDate, fmtTime, splitList } = require('./_lib/mail');

const DEFAULTS = {
  autoReplyOn: true,
  autoReplySubject: 'Thanks for reaching out to Bandstand Brew Works!',
  autoReplyBody: 'Hi {first_name},\n\nThank you for reaching out to Bandstand Brew Works about your {event_type} on {date}! We received your request for {guests} guests, and our events team will be in touch within one business day to talk through spaces, menus and availability.\n\nIf you have questions in the meantime, just reply to this email.\n\nCheers,\nThe Bandstand Brew Works events team\n3922 Main St, Warrensburg, NY\nWhere Community Gathers',
  leadAlertTo: 'erin@bandstandbrewworks.com',
  replyTo: ''
};

function fill(tpl, ev, cfg) {
  const c = ev.client || {};
  const name = String(c.name || '').trim();
  const spaces = (ev.spaceIds || []).map(id => ((cfg.spaces || []).find(s => s.id === id) || {}).name).filter(Boolean).join(', ');
  const vals = {
    first_name: name.split(/\s+/)[0] || 'there', name: name || 'there',
    event_type: String(ev.type || 'event').toLowerCase(), date: fmtDate(ev.date), guests: String(ev.guests || ''),
    space: spaces || 'our event spaces', start: fmtTime(ev.start), end: fmtTime(ev.end)
  };
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}
function alertText(ev, cfg, autoReplyLine) {
  const c = ev.client || {};
  const spaces = (ev.spaceIds || []).map(id => ((cfg.spaces || []).find(s => s.id === id) || {}).name).filter(Boolean).join(', ');
  return [
    'A new inquiry just came in from the website form.', '',
    `Name: ${c.name || ''}`, c.company ? `Company: ${c.company}` : null,
    `Email: ${c.email || ''}`, c.phone ? `Phone: ${c.phone}` : null,
    `Event: ${ev.type || ''}`, `Date: ${fmtDate(ev.date)}${ev.start ? ', ' + fmtTime(ev.start) + '–' + fmtTime(ev.end) : ''}`,
    `Guests: ${ev.guests || ''}`, spaces ? `Space: ${spaces}` : null,
    ev.notes ? '\nNotes:\n' + ev.notes : null, '',
    autoReplyLine, '',
    `Open it in the events app: ${APP_URL}/#event-${ev.id}`
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

async function handleLead(id, secret) {
  const claim = await rpc('pe_lead_notify_claim', { p_id: id, p_secret: secret });
  if (!claim || !claim.ok) return { skipped: claim && claim.reason };
  const ev = Object.assign({}, claim.event, { id });
  const st = claim.settings || {};
  const cfg = {};
  for (const k of Object.keys(DEFAULTS)) cfg[k] = st[k] == null || st[k] === '' ? DEFAULTS[k] : st[k];
  cfg.spaces = st.spaces || [];
  const m = await pickMailer();
  const replyTo = splitList(cfg.replyTo)[0] || (m && m.from) || '';
  const lines = []; let failed = false;
  const guest = (ev.client || {}).email;

  let autoReplyLine;
  if (!m) { autoReplyLine = 'Auto-reply not sent: email sending is not set up yet.'; failed = true; }
  else if (cfg.autoReplyOn === false || cfg.autoReplyOn === 'false') autoReplyLine = 'Auto-reply is turned off in Settings.';
  else if (!guest) autoReplyLine = 'Auto-reply not sent: no email address.';
  else {
    try {
      await send({ to: guest, subject: fill(cfg.autoReplySubject, ev, cfg), text: fill(cfg.autoReplyBody, ev, cfg), replyTo }, m);
      autoReplyLine = `Auto-reply sent to ${guest}.`;
    } catch (e) { autoReplyLine = `Auto-reply to ${guest} failed: ${e.message}`; failed = true; }
  }
  lines.push(autoReplyLine);

  if (m) {
    const c = ev.client || {};
    for (const to of splitList(cfg.leadAlertTo)) {
      try {
        await send({ to, subject: `New event inquiry: ${c.name || 'Website form'} — ${ev.type || 'Event'}, ${fmtDate(ev.date)}`, text: alertText(ev, cfg, autoReplyLine), replyTo: guest || undefined }, m);
        lines.push(`New-lead alert emailed to ${to}.`);
      } catch (e) { lines.push(`New-lead alert to ${to} failed: ${e.message}`); failed = true; }
    }
  }
  await rpc('pe_lead_notify_done', { p_id: id, p_secret: secret, p_status: failed ? 'failed' : 'sent', p_lines: lines });
  return { sent: !failed, lines };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const m = await pickMailer();
      return res.status(200).json({ configured: !!m, from: m ? m.from : '', via: m ? m.kind : '', hook: !!process.env.LEAD_HOOK_SECRET, gmailBridge: !!process.env.MEMBERSHIPS_MAIL_SECRET, membershipsUrl: MEMBERSHIPS_URL });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase settings missing' });
    const body = await readBody(req);

    const hook = req.headers['x-hook-secret'];
    if (hook) {
      if (!safeEq(hook, process.env.LEAD_HOOK_SECRET)) return res.status(401).json({ error: 'Not allowed' });
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(body.id || ''))) return res.status(400).json({ error: 'Bad id' });
      return res.status(200).json(await handleLead(String(body.id), hook));
    }

    // Test email from a signed-in staff member with events access.
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !body.test) return res.status(401).json({ error: 'Sign in first' });
    const ok = await rpc('has_events_access', {}, token).catch(() => false);
    if (ok !== true) return res.status(403).json({ error: 'No events access' });
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } }).then(r => r.json());
    if (!u || !u.email) return res.status(401).json({ error: 'Sign in first' });
    const st = await rpc('pe_public_settings', {}).catch(() => ({}));
    const cfg = Object.assign({}, DEFAULTS, st || {}, body.settings || {});
    cfg.spaces = (st && st.spaces) || [];
    const sample = { id: 'test', type: 'Birthday party', date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), start: '18:00', end: '22:00', guests: 40, client: { name: 'Sample Guest', email: u.email } };
    await send({ to: u.email, subject: '[Test] ' + fill(cfg.autoReplySubject, sample, cfg), text: fill(cfg.autoReplyBody, sample, cfg), replyTo: splitList(cfg.replyTo)[0] || undefined });
    return res.status(200).json({ ok: true, to: u.email });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};

module.exports._test = { fill, alertText, fmtDate, splitList };
