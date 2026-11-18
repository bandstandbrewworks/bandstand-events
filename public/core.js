/* Shared helpers for the staff app, inquiry form and client proposal page. */
"use strict";
const STATUSES=['Lead','Proposal Sent','Tentative','Definite','Completed','Lost'];
const SKEY={'Lead':'lead','Proposal Sent':'prop','Tentative':'tent','Definite':'def','Completed':'comp','Lost':'lost'};
const FB=['Food','Beverage'];
function clone(o){return JSON.parse(JSON.stringify(o))}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function num(v){const n=parseFloat(v);return isFinite(n)?n:0}
function r2(n){return Math.round(n*100)/100}
function money(n){return USD.format(r2(n||0))}
function money0(n){return USD0.format(Math.round(n||0))}
function pad(n){return String(n).padStart(2,'0')}
function isoOf(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function todayISO(){return isoOf(new Date())}
function parseISO(s){if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function addDays(iso,n){const d=parseISO(iso)||new Date();d.setDate(d.getDate()+n);return isoOf(d)}
function fmtDate(iso,long){const d=parseISO(iso);if(!d)return 'Date TBD';return d.toLocaleDateString('en-US',long?{weekday:'long',month:'long',day:'numeric',year:'numeric'}:{weekday:'short',month:'short',day:'numeric',year:'numeric'})}
function fmtShort(iso){const d=parseISO(iso);if(!d)return 'Date TBD';return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
function fmtTime(t){if(!t)return '';const [h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';const hh=((h+11)%12)+1;return hh+(m?':'+pad(m):'')+' '+ap}
function fmtTS(ts){if(!ts)return '';const d=new Date(ts);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function mins(t){if(!t)return 0;const [h,m]=t.split(':').map(Number);return h*60+(m||0)}
function span(ev){const s=mins(ev.start||'00:00');let e=mins(ev.end||'23:59');if(e<=s)e+=1440;return [s,e]}
function sc(status){return 's-'+(SKEY[status]||'lead')}
function linesFrom(s){return String(s||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean)}
const USD=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const USD0=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
function totals(ev){
  // Events imported from Tripleseat keep Tripleseat's totals until someone adds menu items here.
  if(ev.imported&&ev.imported.grandTotal!=null&&!(ev.items||[]).length){
    const total=r2(num(ev.imported.grandTotal)),actual=r2(num(ev.imported.actual));
    const paid=r2((ev.payments||[]).reduce((a,p)=>a+(p.kind==='refund'?-num(p.amount):num(p.amount)),0));
    const depositDue=r2(num(ev.imported.deposit));
    return {fb:actual,other:0,roomFee:0,fbMin:0,shortfall:0,service:0,tax:r2(total-actual),total,depositDue,paid,balance:r2(total-paid),depositMet:paid>=depositDue-0.005&&total>0,imported:true};
  }
  const items=ev.items||[];
  let fb=0, other=0;
  for(const it of items){const lt=r2(num(it.price)*num(it.qty)); if(FB.includes(it.category)) fb+=lt; else other+=lt;}
  fb=r2(fb); other=r2(other);
  const roomFee=num(ev.roomFee), fbMin=num(ev.fbMinimum);
  const shortfall=r2(Math.max(0,fbMin-fb));
  const service=r2(num(ev.serviceRate)/100*(fb+shortfall));
  const taxable=fb+shortfall+other+roomFee+(ev.taxService?service:0);
  const tax=r2(num(ev.taxRate)/100*taxable);
  const total=r2(fb+shortfall+other+roomFee+service+tax);
  const depositDue=r2(total*num(ev.depositPct)/100);
  const paid=r2((ev.payments||[]).reduce((a,p)=>a+(p.kind==='refund'?-num(p.amount):num(p.amount)),0));
  const balance=r2(total-paid);
  return {fb,other,roomFee,fbMin,shortfall,service,tax,total,depositDue,paid,balance,depositMet:paid>=depositDue-0.005&&total>0};
}

function safeUrl(u){u=String(u||'').trim();return /^https:\/\//i.test(u)?u:''}
function logoUrl(cfg){const l=cfg&&cfg.logo;return /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(l||'')?l:'/logo.webp'}
function supa(){
  const c=window.BANDSTAND_CONFIG||{};
  if(!c.supabaseUrl||!c.supabaseAnonKey||!window.supabase)return null;
  if(!supa._c)supa._c=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  return supa._c;
}
