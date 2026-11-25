// Monday-morning summary email for the leadership team: Private Events, Live Music and Distribution.
//
//   POST from the database's weekly job (header x-hook-secret)          -> emails the list in Settings, once per week
//   POST from the app (Authorization: Bearer <administrator session>)    -> emails a test to that administrator only
//
// Recipients and on/off live in Settings (weeklySummaryTo / weeklySummaryOn).

const fs = require('fs'), path = require('path'), vm = require('vm');
const { SB_URL, SB_KEY, APP_URL, pickMailer, send, rpc, safeEq, splitList } = require('./_lib/mail');

const DEFAULT_TO = 'erin@bandstandbrewworks.com, deane@bandstandbrewworks.com, adam@bandstandbrewworks.com, laurie@bandstandbrewworks.com, darby@bandstandbrewworks.com';
const DIST_URL = (process.env.DISTRIBUTION_URL || 'https://distribution.bandstandbrewworks.com').replace(/\/$/, '');
const MEMBERS_URL = (process.env.MEMBERS_APP_URL || 'https://members.bandstandbrewworks.com').replace(/\/$/, '');
const BOOKED = ['Tentative', 'Definite', 'Completed'];

let core = null;
async function loadCore() {
  if (core) return core;
  const run = src => { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(src + '\n;this.__c={totals,money,fmtTime,num};', ctx); return ctx.__c; };
  for (const p of [path.join(process.cwd(), 'public', 'core.js'), path.join(__dirname, '..', 'public', 'core.js')]) {
    try { return (core = run(fs.readFileSync(p, 'utf8'))); } catch (e) { /* try next */ }
  }
  const r = await fetch(APP_URL + '/core.js');
  if (!r.ok) throw new Error('core.js not available');
  return (core = run(await r.text()));
}

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const day = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const usd = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const t12 = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return ''; const h = Number(m[1]); return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${h < 12 ? 'am' : 'pm'}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function distributionNumbers() {
  if (!process.env.WEEKLY_SUMMARY_SECRET) return { error: 'not connected' };
  try {
    const r = await fetch(`${DIST_URL}/api/summary/weekly`, { headers: { 'x-summary-secret': process.env.WEEKLY_SUMMARY_SECRET }, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || 'HTTP ' + r.status };
  } catch (e) { return { error: e.message }; }
}

function build(data, dist, C) {
  const today = String(data.today).slice(0, 10);
  const thisMon = addDays(today, -((dow(today) + 6) % 7)), thisSun = addDays(thisMon, 6), lastMon = addDays(thisMon, -7), lastSun = addDays(thisMon, -1);
  const inLast = d => d && d >= lastMon && d <= lastSun, inThis = d => d && d >= thisMon && d <= thisSun;
  const cfg = data.settings || {};
  const spaceName = id => ((cfg.spaces || []).find(s => s.id === id) || {}).name || '';
  const evs = (data.events || []).map(r => Object.assign({}, r.data, { id: r.id })).filter(e => e && e.date !== undefined);
  const T = e => { try { return C.totals(e); } catch (x) { return { total: 0, paid: 0, balance: 0 }; } };
  const L = [];
  const head = h => L.push('', h, '-'.repeat(h.length));

  L.push(`Good morning! Here's Bandstand's week at a glance: last week (${day(lastMon)} – ${day(lastSun)}) and this week (${day(thisMon)} – ${day(thisSun)}).`);

  // ---------- Private events ----------
  head('PRIVATE EVENTS');
  const inquiries = evs.filter(e => inLast(String(e.inquiredAt || e.createdAt || '').slice(0, 10)) && !e.imported);
  const signed = evs.filter(e => inLast(String((e.contract || {}).signedAt || '').slice(0, 10)));
  const held = evs.filter(e => inLast(e.date) && ['Definite', 'Completed'].includes(e.status));
  const pays = []; evs.forEach(e => (e.payments || []).forEach(p => { if (inLast(String(p.date || '').slice(0, 10))) pays.push({ e, amt: (p.kind === 'refund' ? -1 : 1) * (Number(p.amount) || 0) }); }));
  L.push('Last week:',
    `  • ${plural(inquiries.length, 'new inquiry').replace('inquirys', 'inquiries')}${inquiries.length ? ': ' + inquiries.slice(0, 6).map(e => `${e.title || 'Untitled'} (${e.date ? day(e.date) : 'no date'}${e.guests ? ', ' + e.guests + ' guests' : ''})`).join('; ') + (inquiries.length > 6 ? '…' : '') : ''}`,
    `  • ${plural(signed.length, 'proposal')} signed${signed.length ? ': ' + signed.map(e => e.title).join('; ') : ''}`,
    `  • ${plural(held.length, 'event')} held, ${usd(held.reduce((n, e) => n + T(e).total, 0))} in event revenue`,
    `  • ${usd(pays.reduce((n, p) => n + p.amt, 0))} in payments received${pays.length ? ` (${plural(pays.length, 'payment')})` : ''}`);
  const week = evs.filter(e => inThis(e.date) && BOOKED.includes(e.status)).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  L.push('', 'This week:');
  if (week.length) week.forEach(e => { const t = T(e); L.push(`  • ${day(e.date)} ${t12(e.start)} · ${e.title || 'Untitled'} · ${e.guests || '?'} guests · ${(e.spaceIds || []).map(spaceName).filter(Boolean).join(', ') || 'no space set'}${e.status === 'Tentative' ? ' · TENTATIVE' : ''}${t.balance > 0.5 ? ` · balance ${usd(t.balance)}` : ''}`); });
  else L.push('  • No private events booked.');
  const dueDays = Number(cfg.balanceDueDays) || 7;
  const dueSoon = evs.filter(e => ['Tentative', 'Definite'].includes(e.status) && e.date > thisSun && addDays(e.date, -dueDays) <= addDays(today, 7) && T(e).balance > 0.5).sort((a, b) => a.date.localeCompare(b.date));
  if (dueSoon.length) { L.push('', 'Balances coming due (next 7 days):'); dueSoon.slice(0, 8).forEach(e => L.push(`  • ${e.title} (${day(e.date)}): ${usd(T(e).balance)} due ${day(addDays(e.date, -dueDays))}`)); }
  const open = evs.filter(e => ['Lead', 'Proposal Sent'].includes(e.status) && (!e.date || e.date >= today));
  const followUps = open.filter(e => e.followUp && e.followUp <= today);
  L.push('', `Pipeline: ${plural(open.length, 'open lead')}/proposals${followUps.length ? `, ${plural(followUps.length, 'follow-up')} due now` : ''}.`);
  const house = (data.house || []).filter(h => inThis(String(h.date).slice(0, 10))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (house.length) { L.push('', 'House events this week:'); house.forEach(h => L.push(`  • ${day(String(h.date).slice(0, 10))} ${h.all_day || !h.start_time ? 'all day' : t12(h.start_time)} · ${h.title}${h.whole_building ? ' · whole building' : (h.space_ids || []).length ? ' · ' + h.space_ids.map(spaceName).filter(Boolean).join(', ') : ''}`)); }

  // ---------- Live music ----------
  head('LIVE MUSIC');
  const music = (data.music || []).map(m => Object.assign({}, m, { date: String(m.date).slice(0, 10) })).filter(m => m.status !== 'cancelled');
  const lastShows = music.filter(m => inLast(m.date));
  L.push(`Last week: ${plural(lastShows.length, 'show')}, ${usd(lastShows.reduce((n, m) => n + (Number(m.fee) || 0), 0))} in band fees.`);
  const lineup = music.filter(m => inThis(m.date));
  L.push('', 'This week:');
  if (lineup.length) lineup.forEach(m => L.push(`  • ${day(m.date)} ${t12(m.start)}${m.end ? '–' + t12(m.end) : ''} · ${m.artist}${m.status !== 'confirmed' && m.status !== 'completed' ? ' (' + m.status + ')' : ''}`));
  else L.push('  • No shows booked.');
  const owed = music.filter(m => m.date < today && m.payment !== 'paid');
  if (owed.length) { L.push('', `Bands not marked paid (${usd(owed.reduce((n, m) => n + (Number(m.fee) || 0), 0))}):`); owed.slice(0, 8).forEach(m => L.push(`  • ${day(m.date)} · ${m.artist} · ${usd(m.fee)}`)); }
  const booked = new Set(music.map(m => m.date)), noMusic = new Set((data.noMusic || []).map(d => String(d).slice(0, 10)));
  const gaps = []; for (let d = addDays(today, 1); d <= addDays(today, 28); d = addDays(d, 1)) if ([5, 6, 0].includes(dow(d)) && !booked.has(d) && !noMusic.has(d)) gaps.push(d);
  L.push('', gaps.length ? `Open weekend dates, next 4 weeks (${gaps.length}): ${gaps.map(day).join(', ')}` : 'Every Friday–Sunday in the next 4 weeks has music booked or is marked No Music.');

  // ---------- Distribution ----------
  head('DISTRIBUTION');
  if (dist && !dist.error) {
    const lw = dist.lastWeek || {};
    const vs = lw.avg4wSales ? ` (4-week average ${usd(lw.avg4wSales)})` : '';
    L.push(`Last week: ${usd(lw.sales)} in sales${vs}, ${plural(lw.orders || 0, 'order')}, ${plural(lw.kegs || 0, 'keg')} to ${plural(lw.accounts || 0, 'account')}.`);
    if ((lw.top || []).length) L.push(`Top accounts: ${lw.top.map(t => `${t.account} ${usd(t.sales)}`).join(', ')}.`);
    L.push('', 'Deliveries this week:');
    if ((dist.thisWeek || []).length) dist.thisWeek.forEach(o => L.push(`  • ${day(o.date)} · ${o.account} · ${plural(o.kegs, 'keg')} · ${usd(o.total)}`));
    else L.push('  • None scheduled.');
    if (dist.overdueDeliveries) L.push(`  ! ${plural(dist.overdueDeliveries, 'delivery')} past the scheduled date and not marked delivered.`.replace('deliverys', 'deliveries'));
    L.push('', `Unpaid QuickBooks invoices: ${plural((dist.openAR || {}).count || 0, 'invoice')}, ${usd((dist.openAR || {}).total)}.`);
    const k = dist.kegsOut || {};
    L.push(k.count ? `Kegs out ${k.thresholdDays}+ days at ${plural(k.count, 'account')}: ${(k.accounts || []).map(a => `${a.account} (${a.out}, ${a.days} days)`).join(', ')}.` : `No accounts with kegs out ${k.thresholdDays || 30}+ days.`);
  } else L.push(`Distribution numbers weren't available this week (${(dist && dist.error) || 'no response'}).`);

  L.push('', '—', `Events: ${APP_URL}`, `Distribution: ${DIST_URL}`, `Memberships & Live Music: ${MEMBERS_URL}/members`,
    '', 'Sent every Monday morning. Change who gets it in the Events app under Settings → Weekly summary.');
  return { subject: `Bandstand weekly summary – week of ${day(thisMon)}`, text: L.join('\n'), week: thisMon };
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
    const C = await loadCore();
    const hook = req.headers['x-hook-secret'];

    if (hook) {
      if (!safeEq(hook, process.env.LEAD_HOOK_SECRET)) return res.status(401).json({ error: 'Not allowed' });
      const data = await rpc('pe_weekly_summary_data', { p_secret: hook });
      if ((data.settings || {}).weeklySummaryOn === false) return res.status(200).json({ skipped: 'off' });
      const mail = build(data, await distributionNumbers(), C);
      if (!(await rpc('pe_weekly_summary_claim', { p_secret: hook, p_week: mail.week }))) return res.status(200).json({ skipped: 'already sent' });
      const m = await pickMailer();
      const to = splitList((data.settings || {}).weeklySummaryTo || DEFAULT_TO);
      const ok = [], bad = [];
      for (const addr of to) { try { if (!m) throw new Error('email not set up'); await send({ to: addr, subject: mail.subject, text: mail.text }, m); ok.push(addr); } catch (e) { bad.push(`${addr} (${e.message})`); } }
      const lines = [ok.length ? `Sent to ${ok.join(', ')}` : 'Not sent', ...bad.map(b => 'Failed: ' + b)];
      await rpc('pe_weekly_summary_done', { p_secret: hook, p_week: mail.week, p_status: ok.length ? 'sent' : 'failed', p_lines: lines });
      return res.status(ok.length ? 200 : 502).json({ sent: ok.length, lines });
    }

    // Test from Settings: an administrator gets the summary sent to themselves.
    const auth = String(req.headers.authorization || ''), token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in first' });
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
    const user = u.ok ? await u.json() : null;
    if (!user || !user.email) return res.status(401).json({ error: 'Sign in first' });
    const data = await rpc('pe_weekly_summary_data', {}, token).catch(() => null);
    if (!data) return res.status(403).json({ error: 'Only administrators can send a test summary' });
    const body = await readBody(req);
    const mail = build(data, await distributionNumbers(), C);
    if (body.preview) return res.status(200).json({ subject: mail.subject, text: mail.text });
    const m = await pickMailer();
    if (!m) return res.status(400).json({ error: 'Email sending is not set up yet' });
    await send({ to: user.email, subject: '[Test] ' + mail.subject, text: mail.text }, m);
    return res.status(200).json({ ok: true, to: user.email });
  } catch (e) {
    console.error('weekly summary', e);
    return res.status(500).json({ error: e.message });
  }
};
