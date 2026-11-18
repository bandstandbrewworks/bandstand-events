/* Tripleseat "Event Details" CSV export -> Bandstand Events records.
   Pure functions (no DOM) so the same code runs in the browser and in tests. */
"use strict";
const TS_REQUIRED = ['Name', 'Status', 'Date', 'Event Id'];

function tsIsTripleseat(headers) { return TS_REQUIRED.every(h => headers.includes(h)); }
function tsMoney(v) { v = String(v || '').trim(); if (!v) return null; const neg = /^-|\(/.test(v); const n = parseFloat(v.replace(/[^0-9.]/g, '')); return isFinite(n) ? (neg ? -n : n) : null; }
function tsDate(v) { const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${pad(+m[1])}-${pad(+m[2])}` : ''; }
function tsTime(v) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i); if (!m) return '';
  let h = +m[1] % 12; if (m[3].toUpperCase() === 'PM') h += 12; return pad(h) + ':' + m[2];
}
function tsNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
function tsSpace(room, spaces) {
  const n = tsNorm(room); if (!n) return null;
  let s = spaces.find(x => tsNorm(x.name) === n || tsNorm(x.id) === n);
  if (!s && /buyout|fullvenue/.test(n)) s = spaces.find(x => x.buyout);
  if (!s) s = spaces.find(x => n.includes(tsNorm(x.name)) || tsNorm(x.name).includes(n));
  return s ? s.id : null;
}
function tsSource(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s.trim()) return '';
  if (s.includes('web lead') || s.includes('direct book')) return 'Website form';
  if (s.includes('repeat')) return 'Repeat client';
  if (s.includes('walk')) return 'Walk-in';
  if (s.includes('phone')) return 'Phone';
  if (s.includes('email')) return 'Email';
  if (/facebook|instagram|social/.test(s)) return 'Social media';
  if (/friend|family|referr|erin/.test(s)) return 'Referral';
  if (s.includes('eventup')) return 'EventUp';
  return 'Other';
}
function tsStatus(raw, grandTotal) {
  switch (String(raw || '').trim().toUpperCase()) {
    case 'CLOSED': return 'Completed';
    case 'DEFINITE': return 'Definite';
    case 'TENTATIVE': return 'Tentative';
    case 'LOST': return 'Lost';
    case 'PROSPECT': return grandTotal ? 'Proposal Sent' : 'Lead';
    default: return '';
  }
}
function tsFirstName(full) { const f = String(full || '').trim().split(/\s+/)[0] || ''; return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : ''; }

/* rows: array of {header: value}. cfg: current settings. Returns events plus a report. */
function tripleseatToEvents(rows, cfg) {
  const spaces = cfg.spaces || [];
  const out = [], skipped = [], unmatchedRooms = new Set();
  const types = new Set(cfg.eventTypes || []), staff = new Set(cfg.staff || []), sources = new Set(cfg.sources || []);
  const add = { eventTypes: [], staff: [], sources: [] };
  const nowIso = new Date().toISOString();
  for (const r of rows) {
    const name = String(r['Name'] || '').trim();
    const status = tsStatus(r['Status'], tsMoney(r['Event Grand Total']));
    if (!name || name.toLowerCase() === 'grand total' || !String(r['Event Id'] || '').trim()) { if (name && name.toLowerCase() !== 'grand total') skipped.push({ name, why: 'No Tripleseat event id' }); continue; }
    if (String(r['Deleted At'] || '').trim()) { skipped.push({ name, why: 'Deleted in Tripleseat' }); continue; }
    if (!status) { skipped.push({ name, why: 'Unknown status “' + r['Status'] + '”' }); continue; }
    const date = tsDate(r['Date']);
    const start = tsTime(r['Start Time']) || tsTime(r['Setup Time']) || '18:00';
    const end = tsTime(r['End Time']) || tsTime(r['Teardown Time']) || start;
    // spaces
    const spaceIds = [], rawRooms = String(r['Rooms'] || '').split(',').map(x => x.trim()).filter(Boolean);
    rawRooms.forEach(room => { const id = tsSpace(room, spaces); if (id) { if (!spaceIds.includes(id)) spaceIds.push(id); } else unmatchedRooms.add(room); });
    // type
    const style = String(r['Event Style'] || '').trim();
    let type = String(r['Type'] || '').trim() || (style && !/on-premise/i.test(style) ? style : '') || 'Private party';
    if (!types.has(type)) { types.add(type); add.eventTypes.push(type); }
    // people
    const contact = String(r['Contact'] || '').trim() || String(r['Lead'] || '').trim();
    const email = String(r['Contact Email'] || '').trim().split(/[\s,;]+/)[0] || '';
    const phone = String(r['Contact Phone'] || '').trim() || String(r['Contact Mobile'] || '').trim();
    const acct = String(r['Account'] || '').trim();
    const company = acct && !acct.includes('?') && acct.toLowerCase() !== contact.toLowerCase() && acct.toLowerCase() !== String(r['Lead'] || '').trim().toLowerCase() ? acct : '';
    const cityLine = [String(r['Contact City'] || '').trim(), [String(r['Contact State'] || '').trim(), String(r['Contact Zip'] || '').trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const address = [String(r['Contact Street Address'] || '').trim(), cityLine].filter(Boolean).join(', ');
    const secondary = String(r['Secondary Contacts'] || '').trim();
    // money breakdown (newer exports)
    const bk = {}; [['food','Food'],['beverage','Beverage'],['av','Audio/Visual'],['labor','Labor'],['misc','Misc'],['roomRental','Room Rental'],['linens','Linens'],['rentals','Rentals'],['gratuity','Gratuity'],['adminFee','Admin Fee'],['salesTax','Sales Tax'],['discounts','Discounts']].forEach(([k,h]) => { const v = tsMoney(r[h]); if (v) bk[k] = v; });
    const ownerRaw = String(r['Owner'] || r['Lead Owner'] || '').trim();
    const owner = tsFirstName(ownerRaw);
    if (owner && !staff.has(owner)) { staff.add(owner); add.staff.push(owner); }
    let source = tsSource(r['Source']);
    if (source && !sources.has(source)) { sources.add(source); add.sources.push(source); }
    // money
    const actual = tsMoney(r['Event Actual']), grand = tsMoney(r['Event Grand Total']);
    const deposit = tsMoney(r['Deposit']), due = tsMoney(r['Amount Due']), fbMin = tsMoney(r['Event F&B Min']);
    const payments = [];
    if (grand != null && grand > 0) {
      const paid = Math.min(grand, r2(grand - Math.max(0, due == null ? grand : due)));
      if (paid > 0.004) payments.push({ id: 'ts-paid', date: tsDate(r['Closed Date']) || tsDate(r['Definite Date']) || date || todayISO(), amount: r2(paid), method: 'Paid in Tripleseat', kind: 'payment', note: 'Imported total paid' });
    }
    // notes
    const notes = [
      String(r['Additional Information'] || '').trim(),
      style ? 'Event style: ' + style : '',
      String(r['Offsite Address'] || '').trim() ? 'Off-site address: ' + String(r['Offsite Address']).trim() + (String(r['Offsite Venue'] || '').trim() ? ' (' + String(r['Offsite Venue']).trim() + ')' : '') : '',
      String(r['Delivery Instructions'] || '').trim() ? 'Delivery: ' + String(r['Delivery Instructions']).trim() : '',
      rawRooms.length && spaceIds.length < rawRooms.length ? 'Tripleseat room: ' + rawRooms.join(', ') : '',
      String(r['Referred By'] || '').trim() || String(r['Referral Details'] || '').trim() ? 'Referred by: ' + [r['Referred By'], r['Referral Details']].map(x => String(x || '').trim()).filter(Boolean).join(' — ') : '',
      String(r['Source'] || '').trim() ? 'Tripleseat source: ' + String(r['Source']).trim() : '',
      String(r['Lost Reason Details'] || '').trim() ? 'Lost reason: ' + String(r['Lost Reason Details']).trim() : '',
      due != null && due < -0.004 ? 'Tripleseat showed a credit of ' + money(-due) + ' on this event.' : '',
      String(r['Lead'] || '').trim() && String(r['Lead']).trim() !== contact ? 'Lead name in Tripleseat: ' + String(r['Lead']).trim() : '',
      secondary ? 'Secondary contact: ' + secondary : '',
      String(r['Contact Mobile'] || '').trim() && String(r['Contact Phone'] || '').trim() ? 'Mobile: ' + String(r['Contact Mobile']).trim() : ''
    ].filter(Boolean).join('\n');
    const created = tsDate(r['Date Created']) || tsDate(r['Lead Submitted']) || date;
    const definite = tsDate(r['Definite Date']);
    const tsId = String(r['Event Id']).trim();
    const activity = [{ at: nowIso, by: null, text: 'Imported from Tripleseat (event #' + tsId + ')' }];
    if (definite) activity.push({ at: definite + 'T12:00:00Z', by: null, text: 'Booked (Definite) in Tripleseat' });
    out.push({
      id: 'ts' + tsId.replace(/[^0-9A-Za-z]/g, ''),
      status, source: source || 'Other', createdAt: created ? created + 'T12:00:00Z' : nowIso, updatedAt: nowIso,
      title: name, type, date, start, end, spaceIds,
      guests: Math.max(0, parseInt(String(r['Guests'] || r['Guar. Guests'] || '0').replace(/\D/g, ''), 10) || 0),
      owner, followUp: '', lostReason: status === 'Lost' ? (String(r['Lost Reason Details'] || '').trim() || '') : '', notes,
      client: { name: contact, email, phone, company, address },
      items: [], roomFee: 0, fbMinimum: fbMin || 0,
      serviceRate: num(cfg.serviceRate), taxRate: num(cfg.taxRate), depositPct: num(cfg.depositPct), taxService: !!cfg.taxService,
      beo: { timeline: [], setup: '', music: '', bar: '', kitchen: '', staffing: '', allergies: '' },
      contract: { sentAt: '', signedAt: definite && ['Definite', 'Completed'].includes(status) ? definite + 'T12:00:00Z' : '', signedName: definite && ['Definite', 'Completed'].includes(status) ? contact + ' (Tripleseat)' : '' },
      toast: { invoiceNumber: '', invoiceUrl: '' },
      payments, activity,
      imported: { from: 'Tripleseat', eventId: tsId, actual: actual || 0, grandTotal: grand, deposit: deposit || 0, amountDue: due, importedAt: nowIso, breakdown: Object.keys(bk).length ? bk : null, depositDueDate: tsDate(r['Deposit Due Date'] || r['Deposit Due Date_1']), balanceDueDate: tsDate(r['Balance Due Date'] || r['Balance Due Date_1']) }
    });
  }
  return { events: out, skipped, unmatchedRooms: [...unmatchedRooms], add };
}
if (typeof module !== 'undefined') module.exports = { tripleseatToEvents, tsIsTripleseat };
