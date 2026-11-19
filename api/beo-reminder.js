// BEO reminder emails to the team before each booked event.
//
//   POST from the database's hourly job (header x-hook-secret)       -> emails every event that is now due
//   POST from the app (Authorization: Bearer <staff session>) { id } -> emails that event's BEO right away
//
// Recipients, lead time and on/off live in Settings (beoReminderTo / beoReminderHours / beoReminderOn).

const fs = require('fs'), path = require('path'), vm = require('vm');
const { SB_URL, SB_KEY, APP_URL, pickMailer, send, rpc, safeEq, splitList } = require('./_lib/mail');

const DEFAULT_TO = 'erin@bandstandbrewworks.com, deane@bandstandbrewworks.com, adam@bandstandbrewworks.com, laurie@bandstandbrewworks.com, darby@bandstandbrewworks.com';

// Reuse the app's own totals/formatting code so the email matches what staff see.
let core = null;
function loadCore() {
  if (core) return core;
  for (const p of [path.join(process.cwd(), 'public', 'core.js'), path.join(__dirname, '..', 'public', 'core.js')]) {
    try {
      const ctx = { window: {}, console };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(p, 'utf8') + '\n;this.__c={totals,money,fmtDate,fmtTime,fmtShort,num};', ctx);
      return (core = ctx.__c);
    } catch (e) { /* try next */ }
  }
  throw new Error('core.js not found');
}

function beoEmail(ev, cfg, hours) {
  const C = loadCore();
  const c = ev.client || {}, beo = ev.beo || {};
  const spaces = (ev.spaceIds || []).map(id => ((cfg.spaces || []).find(s => s.id === id) || {}).name || '(removed space)').join(', ') || '—';
  const when = `${C.fmtDate(ev.date, true)} · ${C.fmtTime(ev.start)}–${C.fmtTime(ev.end)}`;
  const L = [];
  L.push(hours ? `Heads up: this event starts in about ${hours} hours. Here is the latest BEO.` : 'Here is the latest BEO for this event.', '');
  L.push('EVENT DETAILS',
    `  Event: ${ev.title || 'Untitled event'}`,
    `  Type: ${ev.type || '—'}   Status: ${ev.status || '—'}`,
    `  When: ${when}`,
    `  Guests: ${C.num(ev.guests)}   Space: ${spaces}`,
    `  Event manager: ${ev.owner || '—'}`,
    `  Client: ${[c.name, c.company].filter(Boolean).join(', ') || '—'}`,
    `  Phone: ${c.phone || '—'}   Email: ${c.email || '—'}`);
  if (ev.notes) L.push('', 'NOTES', '  ' + String(ev.notes).replace(/\n/g, '\n  '));
  L.push('', 'TIMELINE');
  const tl = (beo.timeline || []).filter(r => r && (r.time || r.desc));
  if (tl.length) tl.forEach(r => L.push(`  ${C.fmtTime(r.time) || '—'}  ${r.desc || ''}`)); else L.push('  (no timeline entered)');
  L.push('', 'FOOD & BEVERAGE');
  const items = ev.items || [];
  if (items.length) items.forEach(i => L.push(`  ${C.num(i.qty)} × ${i.name} [${i.category}]${i.desc ? '\n      ' + String(i.desc).replace(/\n/g, '\n      ') : ''}`));
  else L.push('  (no menu items entered)');
  [['SETUP / FLOOR PLAN', 'setup'], ['MUSIC / STAGE / AV', 'music'], ['BAR', 'bar'], ['KITCHEN', 'kitchen'], ['ALLERGIES & DIETARY', 'allergies'], ['STAFFING', 'staffing']]
    .forEach(([h, k]) => { if (beo[k]) L.push('', h, '  ' + String(beo[k]).replace(/\n/g, '\n  ')); });
  try {
    const t = C.totals(ev);
    L.push('', 'MONEY', `  Est. total ${C.money(t.total)} · Paid ${C.money(t.paid)} · Balance ${C.money(t.balance)}`);
  } catch (e) { /* totals are a nice-to-have */ }
  L.push('', `Open the event: ${APP_URL}/#event-${ev.id}`);
  const subject = `${hours ? 'Event in ' + hours + ' hrs' : 'BEO'}: ${ev.title || 'Event'} — ${C.fmtShort(ev.date)}${ev.start ? ' ' + C.fmtTime(ev.start) : ''}`;
  return { subject, text: L.join('\n') };
}

async function sendBeo(ev, cfg, hours, m) {
  const to = splitList(cfg.beoReminderTo || DEFAULT_TO);
  const { subject, text } = beoEmail(ev, cfg, hours);
  const ok = [], bad = [];
  for (const addr of to) {
    try { await send({ to: addr, subject, text }, m); ok.push(addr); }
    catch (e) { bad.push(`${addr} (${e.message})`); }
  }
  const lines = [];
  if (ok.length) lines.push(`${hours ? 'BEO reminder' : 'BEO'} emailed to ${ok.join(', ')}.`);
  if (bad.length) lines.push(`BEO email failed for ${bad.join('; ')}`);
  if (!to.length) lines.push('BEO email not sent: no recipients in Settings.');
  return { lines, failed: !ok.length };
}

async function rest(pathAndQuery, token) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.message) || 'Database error ' + r.status);
  return j;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase settings missing' });
    const secret = process.env.LEAD_HOOK_SECRET;

    // Hourly job from the database.
    const hook = req.headers['x-hook-secret'];
    if (hook) {
      if (!safeEq(hook, secret)) return res.status(401).json({ error: 'Not allowed' });
      const claim = await rpc('pe_beo_claim', { p_secret: hook });
      const evs = (claim && claim.events) || [];
      if (!evs.length) return res.status(200).json({ sent: 0 });
      const cfg = claim.settings || {};
      const m = await pickMailer();
      const out = [];
      for (const row of evs) {
        const ev = Object.assign({}, row.data, { id: row.id });
        let r;
        if (!m) r = { lines: ['BEO reminder not sent: email sending is not set up yet.'], failed: true };
        else r = await sendBeo(ev, cfg, cfg.beoReminderHours || 36, m).catch(e => ({ lines: ['BEO reminder failed: ' + e.message], failed: true }));
        await rpc('pe_beo_done', { p_id: row.id, p_secret: hook, p_status: r.failed ? 'failed' : 'sent', p_lines: r.lines });
        out.push({ id: row.id, failed: r.failed });
      }
      return res.status(200).json({ sent: out.filter(x => !x.failed).length, results: out });
    }

    // "Email BEO now" from a signed-in staff member.
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const body = await readBody(req);
    if (!token) return res.status(401).json({ error: 'Sign in first' });
    if ((await rpc('has_events_access', {}, token).catch(() => false)) !== true) return res.status(403).json({ error: 'No events access' });
    const id = String(body.id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).json({ error: 'Bad id' });
    const [rows, st] = await Promise.all([
      rest(`private_events?id=eq.${encodeURIComponent(id)}&select=id,data`, token),
      rest('private_event_settings?id=eq.main&select=data', token)
    ]);
    if (!rows || !rows.length) return res.status(404).json({ error: 'Event not found' });
    const cfg = (st && st[0] && st[0].data) || {};
    const m = await pickMailer();
    if (!m) return res.status(400).json({ error: 'Email sending is not set up yet' });
    const r = await sendBeo(Object.assign({}, rows[0].data, { id }), cfg, 0, m);
    if (secret) await rpc('pe_beo_done', { p_id: id, p_secret: secret, p_status: null, p_lines: r.lines }).catch(() => {});
    return res.status(r.failed ? 502 : 200).json({ ok: !r.failed, lines: r.lines });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Something went wrong' });
  }
};

module.exports._test = { beoEmail };
