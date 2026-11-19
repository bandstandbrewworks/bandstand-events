// Shared helpers for the events app's serverless functions (mail transport, Supabase RPC, formatting).
const crypto = require('crypto');
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const APP_URL = (process.env.APP_URL || 'https://bandstand-events.vercel.app').replace(/\/$/, '');

const MEMBERSHIPS_URL = (process.env.MEMBERSHIPS_URL || 'https://bandstand-memberships.vercel.app').replace(/\/$/, '');
let gmailCache = null;
async function gmailAccount() {
  if (!process.env.MEMBERSHIPS_MAIL_SECRET) return null;
  if (gmailCache) return gmailCache;
  try {
    const r = await fetch(`${MEMBERSHIPS_URL}/api/events-email/status`, { headers: { 'x-mail-secret': process.env.MEMBERSHIPS_MAIL_SECRET } });
    const j = await r.json();
    if (r.ok && j.connected && j.email) return (gmailCache = { kind: 'gmail', from: j.email, connectedAt: j.connectedAt });
  } catch (e) { /* fall through */ }
  return null;
}
async function pickMailer() { return (await gmailAccount()) || mailer(); }

function mailer() {
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) return { kind: 'resend', from: process.env.RESEND_FROM };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return { kind: 'smtp', from: process.env.SMTP_USER };
  return null;
}
const fromName = () => process.env.EMAIL_FROM_NAME || 'Bandstand Brew Works Events';

async function send({ to, subject, text, replyTo }, m) {
  m = m || await pickMailer();
  if (!m) throw new Error('Email sending is not set up yet');
  const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
  if (m.kind === 'gmail') {
    const r = await fetch(`${MEMBERSHIPS_URL}/api/events-email/send`, {
      method: 'POST',
      headers: { 'x-mail-secret': process.env.MEMBERSHIPS_MAIL_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: clean(subject), text, replyTo: replyTo || '', fromName: fromName() })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Gmail send failed (' + r.status + ')');
    return;
  }
  if (m.kind === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName()} <${m.from}>`, to: [to], subject: clean(subject), text, reply_to: replyTo || undefined })
    });
    if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return;
  }
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await t.sendMail({ from: { name: fromName(), address: m.from }, to, subject: clean(subject), text, replyTo: replyTo || undefined });
}

async function rpc(name, args, token) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (token || SB_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && body.message) || 'Database error ' + r.status);
  return body;
}

function safeEq(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function fmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'your date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function fmtTime(t) {
  if (!/^\d{2}:\d{2}$/.test(t || '')) return '';
  let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

const splitList = s => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

module.exports = { SB_URL, SB_KEY, APP_URL, MEMBERSHIPS_URL, pickMailer, mailer, fromName, send, rpc, safeEq, fmtDate, fmtTime, splitList };
