"use strict";

/* ---------- constants & defaults ---------- */
const ACTIVE=['Lead','Proposal Sent','Tentative','Definite'];
const BLOCKING=['Tentative','Definite'];
const CATS=['Food','Beverage','Rental / AV','Entertainment','Other'];
const UNITS=['per person','per person per hour','each','per hour','flat'];
const METHODS=['Toast invoice (paid online)','Toast POS (card in person)','Cash','Check','ACH / bank transfer'];
const DEFAULT_CONFIG={
  venueName:'Bandstand Brew Works',
  tagline:'Where Community Gathers',
  logo:'',
  spaces:[
    {id:'beerhall',name:'Beerhall',seated:0,standing:0,roomFee:0,fbMin:0,buyout:false},
    {id:'eventwing',name:'Event Wing',seated:0,standing:0,roomFee:0,fbMin:0,buyout:false},
    {id:'patio',name:'Patio',seated:0,standing:0,roomFee:0,fbMin:0,buyout:false},
    {id:'taproom',name:'Taproom',seated:0,standing:0,roomFee:0,fbMin:0,buyout:false},
    {id:'full',name:'Full Buyout',seated:0,standing:0,roomFee:0,fbMin:0,buyout:true}
  ],
  catalog:[
    {id:'plan1',name:'Plan 1 dinner',category:'Food',unit:'per person',price:30,desc:'Chicken: Piccata, Marsala or Francese · Meat: Short Rib or Steak Tips · Vegetarian: Pasta Primavera or Penne alla Vodka · Dessert: Cookie Platter or Cake'},
    {id:'plan2',name:'Plan 2 dinner',category:'Food',unit:'per person',price:45,desc:'Choice of 2 appetizers · Chicken: Roasted Airline Chicken Breast, Chicken Cordon Bleu or Chicken Kiev · Meat: Filet Medallions, Sirloin Steak or Pork Osso Bucco · Vegetarian/Fish: Butternut Squash Ravioli, Tuscan Buttered Gnocchi, Stuffed Sole or Stuffed Shrimp · Dessert: Cupcake Tower or Cheesecake'},
    {id:'plan3',name:'Plan 3 dinner',category:'Food',unit:'per person',price:65,desc:'Choice of 3–4 appetizers · Includes linen package · Chicken: Saltimbocca, Scarpiello or Paprikash · Meat: Filet, Prime Rib, Duck Breast or Rack of Lamb · Vegetarian/Fish: Veggie Lasagna, Truffle Mushroom Ravioli, Diver Scallops or Chilean Sea Bass · Dessert: Cupcake Tower, Viennese Table or Crème Brûlée'},
    {id:'bw',name:'Beer & Wine package',category:'Beverage',unit:'per person per hour',price:20,desc:'Discounted pricing available if offered for the entire event'},
    {id:'bwm',name:'Beer, Wine & Mixed Drinks package',category:'Beverage',unit:'per person per hour',price:28,desc:'Discounted pricing available if offered for the entire event'},
    {id:'fullbar',name:'Full Bar package',category:'Beverage',unit:'per person per hour',price:36,desc:'Customized cocktails available on request · Discounted pricing available if offered for the entire event'},
    {id:'veg',name:'Vegetable Crudité Platter',category:'Food',unit:'per person',price:5,desc:''},
    {id:'cheese',name:'Cheeseboard Package',category:'Food',unit:'per person',price:7,desc:'Locally sourced cheeses, assorted fruits & pickled vegetables with crostini'},
    {id:'charc30',name:'Charcuterie Platter (25–30 people)',category:'Food',unit:'each',price:150,desc:'Locally sourced cheeses, assorted fruits & pickled vegetables with crostini'},
    {id:'charc50',name:'Charcuterie Platter (50+ people)',category:'Food',unit:'each',price:400,desc:'Locally sourced cheeses, assorted fruits & pickled vegetables with crostini'},
    {id:'linen',name:'Linen package',category:'Rental / AV',unit:'flat',price:40,desc:'Linens for tables (included with Plan 3)'}
  ],
  taxRate:7, serviceRate:22, adminFeeRate:5, depositPct:25, balanceDueDays:7, taxService:true,
  defaultStart:'18:00', defaultEnd:'22:00', defaultGuests:50,
  autoReplyOn:true,
  autoReplySubject:'Thanks for reaching out to Bandstand Brew Works!',
  autoReplyBody:"Hi {first_name},\n\nThank you for reaching out to Bandstand Brew Works about your {event_type} on {date}! We received your request for {guests} guests, and our events team will be in touch within one business day to talk through spaces, menus and availability.\n\nIf you have questions in the meantime, just reply to this email.\n\nCheers,\nThe Bandstand Brew Works events team\n3922 Main St, Warrensburg, NY\nWhere Community Gathers",
  leadAlertTo:'erin@bandstandbrewworks.com', replyTo:'erin@bandstandbrewworks.com',
  beoReminderOn:true, beoReminderHours:36,
  beoReminderTo:'erin@bandstandbrewworks.com, deane@bandstandbrewworks.com, adam@bandstandbrewworks.com, laurie@bandstandbrewworks.com, darby@bandstandbrewworks.com',
  staff:['Laurie','Darby','Adam'],
  eventTypes:['Private party','Corporate','Wedding / rehearsal','Birthday','Fundraiser','Holiday party','Ticketed show','Other'],
  sources:['Website form','Phone','Email','Walk-in','Repeat client','Referral','Social media'],
  lostReasons:['Date unavailable','Budget','Chose another venue','No response','Event cancelled','Group size'],
  terms:"1. Deposit. A 25% deposit is due to book your event date.\n2. Final count. The final guest count is due 7 days before the event. You will be billed for the final count or actual attendance, whichever is higher.\n3. Room fee and minimums. A room fee may apply based on event date and size. If food and beverage spending is below the minimum for your space, the difference is charged as a room minimum fee.\n4. Service charge, admin fee and tax. A service charge and an administrative fee apply to food and beverage. Sales tax applies as required by law.\n5. Balance. The remaining balance is due before the event date shown on this proposal.\n6. Cancellation. With at least 14 days’ notice of cancellation, 50% of the deposit is refunded. With less than 14 days’ notice, the deposit is not refunded.\n7. Outside food and drink. No outside food or alcohol, except a celebration cake.\n8. Damages. The client is responsible for damage to the venue caused by guests or vendors they hire."
};

/* ---------- state ---------- */
const now0=new Date();
const S={
  config:clone(DEFAULT_CONFIG), events:new Map(), view:'pipeline', eventId:null, tab:'details',
  calMonth:new Date(now0.getFullYear(),now0.getMonth(),1), calSpace:'all',
  listQ:'', listStatus:'open', reportYear:now0.getFullYear(),
  mode:'db', loaded:false, stale:false, dbError:null, readOnly:false,
  uid:null, email:'', tokens:{}, auth:'checking', authMsg:'', delArm:false, inquiryDone:null, draft:null, beoText:null, addItemSel:'', toastText:null
};
let sb=null;

/* ---------- helpers ---------- */
function spaceById(id){return S.config.spaces.find(s=>s.id===id)}
function spaceName(id){const s=spaceById(id);return s?s.name:'(removed space)'}
function evList(){return [...S.events.values()]}
function byDate(a,b){return (a.date||'9999').localeCompare(b.date||'9999')||(a.start||'').localeCompare(b.start||'')}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),3500)}
function logoSrc(){return logoUrl(S.config)}
function docBrand(sub){const l=logoSrc();return `${l?`<img class="doc-logo" src="${l}" alt="${esc(S.config.venueName)}">`:`<div class="venue">${esc(S.config.venueName)}</div>`}${S.config.tagline?`<div class="tagline">${esc(S.config.tagline)}</div>`:''}<div class="muted">${sub}</div>`}

/* ---------- business logic ---------- */
function capacity(ev){
  const sp=(ev.spaceIds||[]).map(spaceById).filter(Boolean);
  if(!sp.length) return null;
  const b=sp.find(s=>s.buyout);
  const c=b?{seated:num(b.seated),standing:num(b.standing)}:{seated:sp.reduce((a,s)=>a+num(s.seated),0),standing:sp.reduce((a,s)=>a+num(s.standing),0)};
  return c.standing>0?c:null;
}
function spacesClash(a,b){
  const A=a.spaceIds||[], B=b.spaceIds||[];
  if(!A.length||!B.length) return false;
  const anyBuyout=[...A,...B].some(id=>{const s=spaceById(id);return s&&s.buyout});
  if(anyBuyout) return true;
  return A.some(id=>B.includes(id));
}
function conflicts(ev){
  if(!ev.date||ev.status==='Lost'||ev.status==='Completed') return [];
  const [s1,e1]=span(ev); const out=[];
  for(const o of S.events.values()){
    if(o.id===ev.id||o.date!==ev.date||o.status==='Lost'||o.status==='Completed') continue;
    const [s2,e2]=span(o);
    if(s1<e2&&s2<e1&&spacesClash(ev,o)) out.push({ev:o,hard:BLOCKING.includes(o.status)&&BLOCKING.includes(ev.status),hold:BLOCKING.includes(o.status)});
  }
  return out;
}
function balanceDueDate(ev){if(ev.imported&&ev.imported.balanceDueDate&&!(ev.items||[]).length)return ev.imported.balanceDueDate;return ev.date?addDays(ev.date,-num(S.config.balanceDueDays)):''}

/* ---------- persistence (Supabase) ---------- */
const chains={};
function queueWrite(key,fn){
  chains[key]=(chains[key]||Promise.resolve()).then(fn).then(r=>{if(r&&r.error)throw r.error;return r}).catch(e=>{
    console.error(e);
    const m=String(e&&(e.message||e.code)||'');
    if(/row-level security|permission|42501/i.test(m)){S.readOnly=true;toast('Your account can’t save events. Ask an admin to turn on events access.');}
    else toast('Could not save. Check your connection and try again.');
    scheduleRender();
  });
  return chains[key];
}
function persistEvent(ev){
  ev.updatedAt=new Date().toISOString();
  S.events.set(ev.id,ev);
  const body=clone(ev);delete body.id;
  queueWrite('ev:'+ev.id,()=>sb.from('private_events').upsert({id:ev.id,data:body}).select('client_token').single().then(r=>{if(r.data&&r.data.client_token){S.tokens[ev.id]=r.data.client_token;}return r}));
}
function removeEvent(id){
  S.events.delete(id);
  queueWrite('ev:'+id,()=>sb.from('private_events').delete().eq('id',id));
}
function persistConfig(cfg){
  S.config=cfg;
  queueWrite('config',()=>sb.from('private_event_settings').upsert({id:'main',data:clone(cfg)}));
}
function clientLink(id){const t=S.tokens[id];return t?location.origin+'/proposal?t='+t:''}
function staffName(by){if(!by)return 'Website / client';const s=String(by);if(!s.includes('@'))return 'Team member';const n=s.split('@')[0].split(/[._-]/)[0];return n.charAt(0).toUpperCase()+n.slice(1)}
function logAct(ev,text){ev.activity=ev.activity||[];ev.activity.unshift({at:new Date().toISOString(),by:S.email||null,text});if(ev.activity.length>200)ev.activity.length=200}
function mutate(id,fn,act){
  const cur=S.events.get(id); if(!cur) return;
  const ev=clone(cur); fn(ev);
  if(act) logAct(ev,act);
  persistEvent(ev); scheduleRender();
}
function newEvent(partial){
  const c=S.config, n=new Date().toISOString();
  const ev=Object.assign({
    id:uid(),status:'Lead',source:c.sources[1]||'Phone',createdAt:n,updatedAt:n,title:'New inquiry',type:c.eventTypes[0]||'',
    date:'',start:c.defaultStart||'18:00',end:c.defaultEnd||'22:00',spaceIds:[],guests:num(c.defaultGuests)||50,owner:c.staff[0]||'',followUp:addDays(todayISO(),2),lostReason:'',notes:'',
    client:{name:'',email:'',phone:'',company:''},items:[],roomFee:0,fbMinimum:0,
    serviceRate:c.serviceRate,adminFeeRate:num(c.adminFeeRate),taxRate:c.taxRate,depositPct:c.depositPct,taxService:!!c.taxService,
    beo:{timeline:[],setup:'',music:'',bar:'',kitchen:'',staffing:'',allergies:''},
    contract:{sentAt:'',signedAt:'',signedName:''},toast:{invoiceNumber:'',invoiceUrl:''},payments:[],activity:[]
  },partial||{});
  return ev;
}
function toastOf(ev){return ev.toast||{invoiceNumber:'',invoiceUrl:''}}
function toastInvoiceText(ev,t){
  const L=[`Customer: ${ev.client.name}${ev.client.company?' ('+ev.client.company+')':''}`,`Email: ${ev.client.email}  Phone: ${ev.client.phone}`,`Event: ${ev.title} · ${fmtDate(ev.date,true)} · ${fmtTime(ev.start)}–${fmtTime(ev.end)} · ${num(ev.guests)} guests`,'','Line items:'];
  (ev.items||[]).forEach(i=>L.push(`  ${num(i.qty)} × ${i.name} @ ${money(i.price)} ${i.unit} = ${money(num(i.qty)*num(i.price))}${i.desc?'\n      '+i.desc:''}`));
  if(t.shortfall)L.push(`  1 × F&B minimum shortfall @ ${money(t.shortfall)}`);
  if(t.roomFee)L.push(`  1 × Room fee (${(ev.spaceIds||[]).map(spaceName).join(', ')}) @ ${money(t.roomFee)}`);
  L.push(`  Service charge ${num(ev.serviceRate)}% = ${money(t.service)}`);
  if(t.adminFee)L.push(`  Admin fee ${num(ev.adminFeeRate)}% = ${money(t.adminFee)}`);
  L.push('',`Total ${money(t.total)}`,`Deposit request: ${money(t.depositDue)} (${num(ev.depositPct)}%)`,`Due date for balance: ${fmtDate(balanceDueDate(ev))}`);
  return L.join('\n');
}
function setStatus(ev,s){ if(ev.status===s) return; logAct(ev,'Status changed: '+ev.status+' → '+s); ev.status=s; if(s==='Lost'&&!ev.lostReason) ev.lostReason=''; }
function autoAdvance(ev){
  const t=totals(ev);
  if(ev.contract&&ev.contract.signedAt&&t.depositMet&&['Lead','Proposal Sent','Tentative'].includes(ev.status)) setStatus(ev,'Definite');
}
function eventHours(ev){return Math.max(1,Math.round((span(ev)[1]-span(ev)[0])/30)/2)}
function defaultQty(ev,unit){return unit==='per person'?num(ev.guests):unit==='per hour'?eventHours(ev):unit==='per person per hour'?num(ev.guests)*eventHours(ev):1}
function applySpacePricing(ev){
  const sp=(ev.spaceIds||[]).map(spaceById).filter(Boolean);
  const b=sp.find(s=>s.buyout);
  const use=b?[b]:sp;
  ev.roomFee=use.reduce((a,s)=>a+num(s.roomFee),0);
  ev.fbMinimum=use.reduce((a,s)=>a+num(s.fbMin),0);
}
function setPath(obj,path,val){const ks=path.split('.');let o=obj;for(let i=0;i<ks.length-1;i++){const k=ks[i];if(o[k]==null)o[k]=/^\d+$/.test(ks[i+1])?[]:{};o=o[k];}o[ks[ks.length-1]]=val}
function getPath(obj,path){return path.split('.').reduce((o,k)=>o==null?undefined:o[k],obj)}

/* ---------- new-lead alerts ---------- */
let seen=null;
function seenKey(){return 'pe_seen_leads_'+(S.uid||'anon')}
function isWebLead(e){return !!(e&&e.notify&&e.source==='Website form')}
function loadSeen(){
  let raw=null;try{raw=localStorage.getItem(seenKey())}catch(e){}
  if(raw){try{seen=new Set(JSON.parse(raw))}catch(e){seen=new Set()}return false;}
  seen=new Set(evList().filter(isWebLead).map(e=>e.id));saveSeen();return true; // first visit: nothing is "new"
}
function saveSeen(){try{localStorage.setItem(seenKey(),JSON.stringify([...seen].slice(-2000)))}catch(e){}}
function isNewLead(e){return !!seen&&isWebLead(e)&&e.status==='Lead'&&!seen.has(e.id)}
function newLeads(){return evList().filter(isNewLead).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
function markSeen(id){if(seen&&id&&!seen.has(id)){seen.add(id);saveSeen();if(S.leadAlert&&S.leadAlert.id===id)S.leadAlert=null;}}
function announceLead(ev){
  const c=ev.client||{};
  S.leadAlert={id:ev.id,name:c.name||'Someone',what:[ev.type,fmtShort(ev.date),ev.guests?ev.guests+' guests':''].filter(Boolean).join(' · ')};
  try{if('Notification' in window&&Notification.permission==='granted'){const n=new Notification('New event inquiry',{body:`${S.leadAlert.name}: ${S.leadAlert.what}`,tag:'lead-'+ev.id});n.onclick=()=>{window.focus();markSeen(ev.id);S.tab='details';go('event',ev.id);n.close()};}}catch(e){}
}
function leadAlertHtml(){
  const a=S.leadAlert;if(!a||S.auth!=='ok')return '';
  const more=newLeads().length-1;
  return `<div class="lead-alert" role="alert"><div><b>New website inquiry</b><div>${esc(a.name)} · ${esc(a.what)}</div>${more>0?`<div class="muted" style="font-size:12px">+${more} more new on the pipeline</div>`:''}</div>
    <div class="row"><button class="btn sm primary" data-act="lead-alert-open" data-id="${esc(a.id)}">Open</button><button class="btn sm" data-act="lead-alert-close" aria-label="Dismiss">Dismiss</button></div></div>`;
}

/* ---------- routing ---------- */
function go(view,id){
  S.view=view; S.eventId=id||null; S.delArm=false; if(view==='event')markSeen(id); S.beoText=null; S.toastText=null;
  if(view==='settings') S.draft=clone(S.config);
  if(view==='inquiry') S.inquiryDone=null;
  const h=view==='event'?'event-'+id:view==='customer'?'customer-'+encodeURIComponent(id):view;
  try{ if(location.hash.slice(1)!==h) location.hash=h; }catch(e){}
  render(); document.getElementById('main').scrollTop=0;
}
function fromHash(){
  let h='';try{h=location.hash.slice(1)}catch(e){}
  if(h.startsWith('event-')){S.view='event';S.eventId=h.slice(6);markSeen(S.eventId);}
  else if(h.startsWith('customer-')){S.view='customer';try{S.eventId=decodeURIComponent(h.slice(9))}catch(e){S.eventId=h.slice(9)}}
  else if(['pipeline','calendar','events','customers','reports','import','inquiry','settings'].includes(h)){S.view=h;if(h==='settings')S.draft=clone(S.config);}
}
window.addEventListener('hashchange',()=>{fromHash();render()});

/* ---------- render core ---------- */
let rq=false;
function scheduleRender(){if(rq)return;rq=true;setTimeout(()=>{rq=false;render()},0)}
function render(){
  const main=document.getElementById('main');
  const a=document.activeElement; let keep=null;
  if(a&&a.id&&main.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) keep={id:a.id,value:a.value,s:a.selectionStart,e:a.selectionEnd,dirty:a.dataset.dirty==='1'};
  const st=main.scrollTop;
  document.getElementById('app').classList.toggle('noside',S.auth!=='ok');
  document.getElementById('side').innerHTML=S.auth==='ok'?renderSide():'';
  main.innerHTML=renderMain()+leadAlertHtml();
  main.scrollTop=st;
  if(keep){const el=document.getElementById(keep.id);if(el){if(keep.dirty&&el.type!=='checkbox'){el.value=keep.value;el.dataset.dirty='1';}el.focus({preventScroll:true});try{el.setSelectionRange(keep.s,keep.e)}catch(e){}}}
}
function renderSide(){
  const evs=evList();
  const open=evs.filter(e=>e.status==='Lead'||e.status==='Proposal Sent').length;
  const nav=[['pipeline','Pipeline',open],['calendar','Calendar',''],['events','All events',evs.length||''],['customers','Customers',customers().length||''],['reports','Reports',''],['import','Import',''],['inquiry','Website form',''],['settings','Settings','']];
  const on=S.view==='event'?'':S.view==='customer'?'customers':S.view;
  const nl=newLeads().length;
  let status;
  status=S.stale?'<span class="dotline"><i class="off"></i>Can’t reach the database</span>':'<span class="dotline"><i></i>Live · saved to Supabase</span>';
  if(S.email) status+=`<span>${esc(S.email)}</span><button class="link" data-act="sign-out" style="text-align:left;color:var(--gold)">Sign out</button>`;
  const l=logoSrc();
  return `${l?`<div class="brand-logo"><img src="${l}" alt="${esc(S.config.venueName)}"></div>`:`<div class="brand">${esc(S.config.venueName)}</div>`}<div style="padding:0 8px;margin-top:-6px"><div class="tagline">${esc(S.config.tagline||'')}</div><div class="brand"><small>PRIVATE EVENTS</small></div></div>
  <button class="side-new" data-act="new-event">+ New event</button>
  <nav aria-label="Sections">${nav.map(([v,l,n])=>`<button class="nav-btn ${on===v?'on':''}" data-act="nav" data-view="${v}"><span>${l}${v==='pipeline'&&nl?` <span class="newpill">${nl} new</span>`:''}</span><span class="n">${n}</span></button>`).join('')}</nav>
  <div class="side-foot">${status}${S.readOnly?'<span>View-only access</span>':''}</div>`;
}
function renderMain(){
  if(S.auth!=='ok') return renderAuth();
  if(!S.loaded) return '<div class="loading">Loading events…</div>';
  switch(S.view){
    case 'calendar':return renderCalendar();
    case 'events':return renderEvents();
    case 'customers':return renderCustomers();
    case 'import':return renderImport();
    case 'customer':return renderCustomer();
    case 'reports':return renderReports();
    case 'inquiry':return renderInquiry();
    case 'settings':return renderSettings();
    case 'event':return renderDetail();
    default:return renderPipeline();
  }
}
function staleBanner(){
  if(S.dbError) return `<div class="banner bad">Events could not be loaded (${esc(S.dbError)}). Reload the page to try again.</div>`;
  if(S.stale) return '<div class="banner warn">Can’t reach saved data yet. What you see may be out of date.</div>';
  return '';
}

/* ---------- pipeline ---------- */
function card(e){
  const t=totals(e), conf=conflicts(e).some(c=>c.hold);
  const due=e.followUp&&ACTIVE.includes(e.status)&&e.status!=='Definite'&&e.followUp<=todayISO();
  return `<article class="card ${sc(e.status)}" draggable="true" data-drag="${esc(e.id)}" data-act="open-event" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="Open ${esc(e.title)}">
    <div class="row between"><span class="meta">${esc(fmtShort(e.date))}${e.start?' · '+esc(fmtTime(e.start)):''}</span><span>${isNewLead(e)?'<span class="flag ok">New</span> ':''}${conf?'<span class="flag">Conflict</span>':''}</span></div>
    <h4>${esc(e.title||'Untitled event')}</h4>
    <div class="meta">${esc(e.client&&e.client.name||'No contact yet')} · ${num(e.guests)} guests</div>
    ${(e.spaceIds||[]).length?`<div class="chips">${e.spaceIds.map(id=>`<span class="chip">${esc(spaceName(id))}</span>`).join('')}</div>`:''}
    <div class="foot"><span>${t.total?money0(t.total):'<span class="muted">No proposal</span>'}</span>${due?`<span class="flag warn">Follow up ${e.followUp===todayISO()?'today':'overdue'}</span>`:''}</div>
  </article>`;
}
function renderPipeline(){
  const evs=evList(), today=todayISO();
  const newLeads=evs.filter(e=>e.createdAt&&(Date.now()-new Date(e.createdAt).getTime())<30*864e5).length;
  const fu=evs.filter(e=>['Lead','Proposal Sent','Tentative'].includes(e.status)&&e.followUp&&e.followUp<=today).length;
  const m=today.slice(0,7);
  const bookedMonth=evs.filter(e=>(e.status==='Definite'||e.status==='Completed')&&(e.date||'').startsWith(m)).reduce((a,e)=>a+totals(e).total,0);
  const in30=evs.filter(e=>e.status==='Definite'&&e.date>=today&&e.date<=addDays(today,30)).length;
  const pipeVal=evs.filter(e=>['Proposal Sent','Tentative'].includes(e.status)).reduce((a,e)=>a+totals(e).total,0);
  return `${staleBanner()}<div class="page-head"><div><h1>Pipeline</h1><p>Drag a card to change its status. Lost and completed events are under All events.</p></div>
    <button class="btn" data-act="nav" data-view="inquiry">Preview website inquiry form</button></div>
  <div class="tiles">
    <div class="tile"><div class="k">New inquiries</div><div class="v">${newLeads}</div><div class="s">Last 30 days</div></div>
    <div class="tile ${fu?'alert':''}"><div class="k">Follow-ups due</div><div class="v">${fu}</div><div class="s">Today or overdue</div></div>
    <div class="tile"><div class="k">Proposals out</div><div class="v">${money0(pipeVal)}</div><div class="s">Sent + tentative</div></div>
    <div class="tile"><div class="k">Booked this month</div><div class="v">${money0(bookedMonth)}</div><div class="s">${in30} definite in next 30 days</div></div>
  </div>
  <div class="board">${ACTIVE.map(s=>{const list=evs.filter(e=>e.status===s).sort(byDate);const sum=list.reduce((a,e)=>a+totals(e).total,0);
    return `<section class="col ${sc(s)}" data-drop="${s}" aria-label="${s}"><header><b>${s}</b><span class="n">${list.length}</span><span class="muted">${sum?money0(sum):''}</span></header>
    ${list.length?list.map(card).join(''):'<div class="empty">Nothing here yet.</div>'}</section>`}).join('')}</div>`;
}

/* ---------- calendar ---------- */
function renderCalendar(){
  const m=S.calMonth, y=m.getFullYear(), mo=m.getMonth();
  const start=new Date(y,mo,1); start.setDate(1-start.getDay());
  const end=new Date(y,mo+1,0); end.setDate(end.getDate()+(6-end.getDay()));
  const today=todayISO();
  const evs=evList().filter(e=>e.date&&e.status!=='Lost'&&(S.calSpace==='all'||(e.spaceIds||[]).includes(S.calSpace)||(e.spaceIds||[]).some(id=>{const s=spaceById(id);return s&&s.buyout})));
  const byDay={}; evs.forEach(e=>{(byDay[e.date]=byDay[e.date]||[]).push(e)});
  let cells='';
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const iso=isoOf(d), list=(byDay[iso]||[]).sort(byDate);
    const hasConf=list.some(e=>conflicts(e).some(c=>c.hard||(c.hold&&BLOCKING.includes(e.status))));
    cells+=`<div class="day ${d.getMonth()!==mo?'out':''} ${iso===today?'today':''} ${hasConf?'has-conf':''}" data-act="cal-new" data-date="${iso}" title="${hasConf?'Double-booked: two holds overlap in the same space':'Add event on '+esc(fmtShort(iso))}">
      <span class="dn">${d.getDate()}</span>
      ${list.slice(0,4).map(e=>`<button class="ev-chip ${sc(e.status)}" data-act="open-event" data-id="${esc(e.id)}" title="${esc(e.status+': '+e.title+' · '+(e.spaceIds||[]).map(spaceName).join(', '))}">${esc(fmtTime(e.start).replace(':00','').replace(' ',''))} ${esc(e.title)}</button>`).join('')}
      ${list.length>4?`<span class="muted" style="font-size:11px">+${list.length-4} more</span>`:''}
    </div>`;
  }
  const monthEvs=evList().filter(e=>e.date&&e.date.startsWith(y+'-'+pad(mo+1)));
  const clashes=[]; const seen=new Set();
  monthEvs.forEach(e=>conflicts(e).forEach(c=>{if(!c.hold)return;const k=[e.id,c.ev.id].sort().join('|');if(seen.has(k))return;seen.add(k);clashes.push([e,c.ev])}));
  return `${staleBanner()}<div class="page-head"><div><h1>${m.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h1><p>Click an empty part of a day to start an event on that date.</p></div>
    <div class="row"><label for="cal-space" class="lbl">Space</label><select id="cal-space" data-ui="calSpace" style="width:auto"><option value="all">All spaces</option>${S.config.spaces.map(s=>`<option value="${esc(s.id)}" ${S.calSpace===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
    <button class="btn" data-act="cal-move" data-n="-1" aria-label="Previous month">‹ Prev</button><button class="btn" data-act="cal-today">Today</button><button class="btn" data-act="cal-move" data-n="1" aria-label="Next month">Next ›</button></div></div>
  <div class="legend" style="margin-bottom:10px">${STATUSES.filter(s=>s!=='Lost').map(s=>`<span class="pill ${sc(s)}">${s}</span>`).join('')}<span class="flag">Red outline = double-booked</span></div>
  <div class="cal">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="dow">${d}</div>`).join('')}${cells}</div>
  <div class="panel" style="margin-top:16px"><h3>Space conflicts this month</h3>${clashes.length?`<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Overlaps with</th><th>Shared space</th></tr></thead><tbody>${clashes.map(([a,b])=>`<tr><td>${esc(fmtShort(a.date))}</td><td><button class="link" data-act="open-event" data-id="${esc(a.id)}">${esc(a.title)}</button> <span class="pill ${sc(a.status)}">${a.status}</span></td><td><button class="link" data-act="open-event" data-id="${esc(b.id)}">${esc(b.title)}</button> <span class="pill ${sc(b.status)}">${b.status}</span></td><td>${esc([...new Set([...(a.spaceIds||[]),...(b.spaceIds||[])])].map(spaceName).join(', '))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No overlapping holds this month.</p>'}</div>`;
}

/* ---------- all events ---------- */
/* ---------- import (Tripleseat CSV) ---------- */
function renderImport(){
  const im=S.imp||{};
  let body='';
  if(im.error) body=`<div class="banner bad">${esc(im.error)}</div>`;
  if(im.result){
    const r=im.result,evs=r.events;
    const existing=evs.filter(e=>S.events.has(e.id)).length;
    const byStatus={};evs.forEach(e=>byStatus[e.status]=(byStatus[e.status]||0)+1);
    const tot=evs.reduce((a,e)=>a+totals(e).total,0);
    const upcoming=evs.filter(e=>e.date>=todayISO()&&e.status!=='Lost').length;
    const clients=new Set(evs.map(e=>custKey(e.client)).filter(Boolean)).size;
    body+=`<div class="tiles"><div class="tile"><div class="k">${r.kind==='leads'?'Leads to import':'Events to import'}</div><div class="v">${evs.length}</div><div class="s">${existing?existing+' already here (will be updated)':'all new'}${r.kind==='leads'?` · ${r.matched} already here as events`:''}</div></div><div class="tile"><div class="k">Upcoming</div><div class="v">${upcoming}</div><div class="s">Will appear in Pipeline &amp; Calendar</div></div><div class="tile"><div class="k">Customers</div><div class="v">${clients}</div><div class="s">${evs.filter(e=>e.client.email).length} events with an email</div></div>${r.kind==='leads'?`<div class="tile"><div class="k">Lost inquiries</div><div class="v">${evs.filter(e=>e.status==='Lost').length}</div><div class="s">Go to Reports › Why we lost them</div></div>`:`<div class="tile"><div class="k">Event totals</div><div class="v">${money0(tot)}</div><div class="s">Tripleseat grand totals</div></div>`}</div>
    <div class="panel" style="margin-bottom:16px"><div class="row between"><div class="legend">${Object.entries(byStatus).map(([k,v])=>`<span class="pill ${sc(k)}">${esc(k)} · ${v}</span>`).join('')}</div>
      <div class="row">${im.done?`<span class="flag ok">Imported ${im.done} ${r.kind==='leads'?'leads':'events'}</span><button class="btn" data-act="nav" data-view="customers">View customers</button>`:`<button class="btn" data-act="imp-clear">Cancel</button><button class="btn primary" data-act="imp-run" ${S.readOnly||im.running?'disabled':''}>${im.running?`Importing ${im.progress||0} of ${evs.length}…`:`Import ${evs.length} ${r.kind==='leads'?'leads':'events'}`}</button>`}</div></div>
      ${r.skipped.length?`<p class="muted" style="font-size:13px;margin:12px 0 0">Skipping ${r.skipped.length}: ${r.skipped.map(x=>esc(x.name)+' ('+esc(x.why)+')').join('; ')}</p>`:''}
      ${r.unmatchedRooms.length?`<p class="flag warn" style="display:inline-block;margin-top:10px">Rooms with no matching space: ${r.unmatchedRooms.map(esc).join(', ')}. Those events keep the room name in their notes.</p>`:''}
      ${(r.add.eventTypes.length||r.add.staff.length||r.add.sources.length)?`<p class="muted" style="font-size:13px;margin:10px 0 0">Will also add to Settings lists: ${[r.add.eventTypes.length?'event types ('+r.add.eventTypes.map(esc).join(', ')+')':'',r.add.staff.length?'event managers ('+r.add.staff.map(esc).join(', ')+')':'',r.add.sources.length?'lead sources ('+r.add.sources.map(esc).join(', ')+')':''].filter(Boolean).join('; ')}.</p>`:''}
    </div>
    <div class="panel" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Client</th><th>Space</th><th class="num">Guests</th><th>Status</th><th class="num">Total</th><th class="num">Paid</th></tr></thead><tbody>
    ${evs.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>{const t=totals(e);return `<tr><td>${esc(fmtDate(e.date))}</td><td>${esc(e.title)}<div class="muted" style="font-size:12px">${esc(e.type)}</div></td><td>${esc(e.client.name)}</td><td>${esc(e.spaceIds.map(spaceName).join(', ')||'—')}</td><td class="num">${e.guests||'—'}</td><td><span class="pill ${sc(e.status)}">${e.status}</span></td><td class="num">${t.total?money(t.total):'—'}</td><td class="num">${t.paid?money(t.paid):'—'}</td></tr>`}).join('')}
    </tbody></table></div></div>`;
  }
  return `<div class="page-head"><div><h1>Import past events</h1><p>Upload a Tripleseat <b>Event Details</b> or <b>Lead Details</b> report exported as CSV. Leads that already became events are skipped. You’ll see a preview before anything is saved. Importing the same file again updates those events instead of duplicating them.</p></div></div>
  ${im.result?'':`<div class="panel" style="margin-bottom:16px"><label class="btn primary" for="imp-file" style="color:var(--accent-ink);display:inline-block">Choose CSV file…</label><input type="file" id="imp-file" data-import accept=".csv,text/csv" style="display:none" ${S.readOnly?'disabled':''}> <span class="muted" style="margin-left:8px">${im.fileName?esc(im.fileName):'No file chosen'}</span></div>`}
  ${body}`;
}
function readImportFile(file){
  S.imp={fileName:file.name};
  if(!window.Papa){S.imp.error='The CSV reader didn’t load. Check your connection and reload the page.';render();return;}
  window.Papa.parse(file,{header:true,skipEmptyLines:'greedy',complete:res=>{
    const headers=res.meta.fields||[];
    if(tsIsTripleseat(headers))S.imp.result=tripleseatToEvents(res.data,S.config);
    else if(tsIsLeads(headers))S.imp.result=tripleseatLeadsToEvents(res.data,S.config,evList());
    else{S.imp.error='This doesn’t look like a Tripleseat Event Details or Lead Details export.';render();return;}
    if(!S.imp.result.events.length)S.imp.error=S.imp.result.kind==='leads'?`Nothing new to import: ${S.imp.result.matched} leads are already here as events${S.imp.result.skipped.length?', and '+S.imp.result.skipped.length+' were skipped':''}.`:'No events found to import in this file.';
    render();
  },error:err=>{S.imp.error='Couldn’t read that file: '+(err&&err.message||'unknown error');render();}});
}
async function runImport(){
  const im=S.imp;if(!im||!im.result||im.running)return;
  im.running=true;im.progress=0;render();
  const r=im.result;
  // extend settings lists first
  if(r.add.eventTypes.length||r.add.staff.length||r.add.sources.length||(r.add.lostReasons||[]).length){
    const c=clone(S.config);
    c.eventTypes=[...c.eventTypes,...r.add.eventTypes.filter(x=>!c.eventTypes.includes(x))];
    c.staff=[...c.staff,...r.add.staff.filter(x=>!c.staff.includes(x))];
    c.sources=[...c.sources,...r.add.sources.filter(x=>!c.sources.includes(x))];
    if(r.add.lostReasons)c.lostReasons=[...c.lostReasons,...r.add.lostReasons.filter(x=>!c.lostReasons.includes(x))];
    persistConfig(c);
  }
  const rows=r.events.map(e=>{const prev=S.events.get(e.id);const ev=clone(e);
    if(prev){
      const edited=prev.imported&&prev.updatedAt&&prev.imported.importedAt&&prev.updatedAt>prev.imported.importedAt;
      const cl={};['name','email','phone','company','address'].forEach(f=>{cl[f]=(prev.client&&prev.client[f])||(ev.client&&ev.client[f])||''});
      if(edited){ // changed in this app since the last import: keep those changes, only fill in what's missing
        const keep=clone(prev);delete keep.id;keep.client=cl;
        keep.imported=Object.assign({},ev.imported,prev.imported||{},{breakdown:(prev.imported&&prev.imported.breakdown)||ev.imported.breakdown,depositDueDate:(prev.imported&&prev.imported.depositDueDate)||ev.imported.depositDueDate,balanceDueDate:(prev.imported&&prev.imported.balanceDueDate)||ev.imported.balanceDueDate});
        if(!keep.notes&&ev.notes)keep.notes=ev.notes;
        return {id:ev.id,data:keep};
      }
      ev.client=cl;
      ev.items=prev.items&&prev.items.length?prev.items:ev.items;ev.beo=prev.beo||ev.beo;ev.toast=prev.toast||ev.toast;
      const extra=(prev.payments||[]).filter(p=>p.id!=='ts-paid');ev.payments=[...ev.payments,...extra];
      ev.activity=[...ev.activity.slice(0,1),...(prev.activity||[])].slice(0,200);
    }
    const body=clone(ev);delete body.id;return {id:ev.id,data:body};});
  let failed=0;
  for(let i=0;i<rows.length;i+=50){
    const chunk=rows.slice(i,i+50);
    const {data,error}=await sb.from('private_events').upsert(chunk).select('id,data,client_token');
    if(error){failed+=chunk.length;console.error(error);}
    else (data||[]).forEach(row=>S.events.set(row.id,rowToEvent(row)));
    im.progress=Math.min(rows.length,i+50);render();
  }
  im.running=false;
  if(failed){im.error=`${failed} events couldn’t be saved. Check your connection and import again; it won’t create duplicates.`;}
  im.done=rows.length-failed;render();
}
/* ---------- customers (built from events) ---------- */
function custKey(c){
  c=c||{};const em=String(c.email||'').trim().toLowerCase();
  if(em)return em;
  const ph=String(c.phone||'').replace(/\D/g,'');
  if(ph.length>=7)return 'tel:'+ph.slice(-10);
  const nm=String(c.name||'').trim().toLowerCase().replace(/\s+/g,' ');
  return nm?'name:'+nm:'';
}
const BOOKED=['Definite','Completed'];
function customers(){
  const map=new Map();
  for(const e of S.events.values()){
    const k=custKey(e.client);if(!k)continue;
    let c=map.get(k);
    if(!c){c={key:k,name:'',company:'',email:'',phone:'',address:'',events:[],booked:0,spend:0,last:'',next:'',updated:''};map.set(k,c);}
    c.events.push(e);
    // newest non-empty contact details win
    const u=e.updatedAt||e.createdAt||'';
    ['name','company','email','phone','address'].forEach(f=>{const v=e.client&&e.client[f];if(v&&(!c[f]||u>=c['_'+f])){c[f]=v;c['_'+f]=u}});
    if(BOOKED.includes(e.status)){c.booked++;c.spend+=totals(e).total;}
    const t=todayISO();
    if(e.date&&e.date<t&&e.status!=='Lost'&&e.date>c.last)c.last=e.date;
    if(e.date&&e.date>=t&&e.status!=='Lost'&&(!c.next||e.date<c.next))c.next=e.date;
  }
  return [...map.values()];
}
function customerOf(ev){const k=custKey(ev.client);return k?customers().find(c=>c.key===k):null}
function renderCustomers(){
  const q=(S.custQ||'').trim().toLowerCase();
  let list=customers();
  const all=list.length,repeat=list.filter(c=>c.booked>1).length,spend=list.reduce((a,c)=>a+c.spend,0);
  if(q)list=list.filter(c=>[c.name,c.company,c.email,c.phone].join(' ').toLowerCase().includes(q));
  const sort=S.custSort||'recent';
  list.sort(sort==='spend'?(a,b)=>b.spend-a.spend:sort==='name'?(a,b)=>(a.name||'').localeCompare(b.name||''):(a,b)=>((b.next||b.last||'')).localeCompare(a.next||a.last||''));
  return `${staleBanner()}<div class="page-head"><div><h1>Customers</h1><p>Built from your events and matched by email, so each client shows up once with their full history.</p></div>
   <div class="row"><input type="text" id="cust-q" data-ui="custQ" placeholder="Search name, company, email, phone" value="${esc(S.custQ||'')}" style="width:260px">
   <select id="cust-sort" data-ui="custSort" style="width:auto" aria-label="Sort"><option value="recent" ${sort==='recent'?'selected':''}>Most recent</option><option value="spend" ${sort==='spend'?'selected':''}>Highest spend</option><option value="name" ${sort==='name'?'selected':''}>Name A–Z</option></select></div></div>
  <div class="tiles"><div class="tile"><div class="k">Customers</div><div class="v">${all}</div></div><div class="tile"><div class="k">Repeat clients</div><div class="v">${repeat}</div><div class="s">Booked 2+ events</div></div><div class="tile"><div class="k">Lifetime booked</div><div class="v">${money0(spend)}</div></div></div>
  <div class="panel" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th class="num">Events</th><th class="num">Booked</th><th class="num">Spend</th><th>Last event</th><th>Next event</th></tr></thead><tbody>
  ${list.length?list.map(c=>`<tr class="click" data-act="open-customer" data-key="${esc(c.key)}"><td><b>${esc(c.name||'(no name)')}</b>${c.company?`<div class="muted" style="font-size:12px">${esc(c.company)}</div>`:''}${c.booked>1?' <span class="flag ok">Repeat</span>':''}</td><td style="font-size:13px">${esc(c.email)}${c.phone?`<div class="muted">${esc(c.phone)}</div>`:''}</td><td class="num">${c.events.length}</td><td class="num">${c.booked}</td><td class="num">${c.spend?money0(c.spend):'—'}</td><td>${c.last?esc(fmtDate(c.last)):'—'}</td><td>${c.next?esc(fmtDate(c.next)):'—'}</td></tr>`).join(''):`<tr><td colspan="7" class="empty">${all?'No customers match.':'No customers yet. They appear here as soon as an event has a client name, email or phone.'}</td></tr>`}
  </tbody></table></div></div>`;
}
function custEditForm(c){
  const d=S.custEdit,t=todayISO();
  const upcoming=c.events.filter(e=>(e.date||'9999')>=t).length;
  const nk=custKey({name:d.name,email:d.email,phone:d.phone});
  const other=nk&&nk!==c.key?customers().find(x=>x.key===nk):null;
  const f=(k,l,type)=>`<div class="f ${k==='address'?'wide':''}"><label for="ce-${k}">${l}</label><input type="${type||'text'}" id="ce-${k}" data-cedit="${k}" value="${esc(d[k]||'')}"></div>`;
  return `<form class="panel" data-form="cust-edit" style="margin-bottom:16px;border-left:3px solid var(--accent)"><h3 style="margin-bottom:12px">Edit contact</h3>
    <div class="fields">${f('name','Name')}${f('company','Company / organization')}${f('email','Email','email')}${f('phone','Phone','tel')}${f('address','Address')}</div>
    <div class="row" style="margin-top:14px;gap:18px">
      <label class="check" for="ce-scope-all"><input type="radio" id="ce-scope-all" name="scope" value="all" ${d.scope!=='upcoming'?'checked':''} data-cedit="scope"> Update all ${c.events.length} event${c.events.length>1?'s':''}</label>
      <label class="check" for="ce-scope-up"><input type="radio" id="ce-scope-up" name="scope" value="upcoming" ${d.scope==='upcoming'?'checked':''} data-cedit="scope" ${upcoming?'':'disabled'}> Only upcoming events (${upcoming})</label>
    </div>
    ${other?`<p class="flag warn" style="display:inline-block;margin-top:10px">${esc(other.name||'Another customer')} already uses this ${d.email&&String(d.email).trim().toLowerCase()===other.key?'email':'contact info'}. Saving will combine the two customers.</p>`:''}
    <div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Save contact</button><button class="btn" type="button" data-act="cust-edit-cancel">Cancel</button></div></form>`;
}
function saveCustomerEdit(){
  const d=S.custEdit;if(!d)return;
  const c=customers().find(x=>x.key===d.key);if(!c){S.custEdit=null;render();return;}
  const vals={name:String(d.name||'').trim(),company:String(d.company||'').trim(),email:String(d.email||'').trim(),phone:String(d.phone||'').trim(),address:String(d.address||'').trim()};
  if(!vals.name&&!vals.email&&!vals.phone){toast('Enter at least a name, email or phone.');return;}
  if(vals.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(vals.email)){toast('That email address doesn’t look right.');return;}
  const t=todayISO();
  const targets=c.events.filter(e=>d.scope==='upcoming'?(e.date||'9999')>=t:true);
  let n=0;
  targets.forEach(e=>{
    const ev=clone(S.events.get(e.id));const before=ev.client||{};
    const changed=Object.keys(vals).filter(k=>(before[k]||'')!==vals[k]);
    if(!changed.length)return;
    ev.client=Object.assign({},before,vals);
    logAct(ev,'Contact updated from customer profile ('+changed.join(', ')+')');
    persistEvent(ev);n++;
  });
  S.custEdit=null;
  const nk=custKey(vals)||d.key;
  toast(n?`Contact updated on ${n} event${n>1?'s':''}`:'Nothing changed');
  go('customer',d.scope==='upcoming'&&targets.length<c.events.length?d.key:nk);
}
function renderCustomer(){
  const c=customers().find(x=>x.key===S.eventId);
  if(!c)return `<div class="page-head"><div><h1>Customer not found</h1><p>Their events may have been deleted or their email changed.</p></div></div><button class="btn" data-act="nav" data-view="customers">Back to customers</button>`;
  const evs=c.events.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const avg=c.booked?c.spend/c.booked:0;
  return `${staleBanner()}<button class="link" data-act="nav" data-view="customers" style="margin-bottom:10px">‹ Customers</button>
  <div class="det-head"><div><div class="row"><h1>${esc(c.name||'(no name)')}</h1>${c.booked>1?'<span class="flag ok">Repeat client</span>':''}</div>
    <div class="meta">${[c.company,c.email,c.phone].filter(Boolean).map(esc).join(' · ')||'No contact details'}</div>${c.address?`<div class="meta" style="margin-top:2px">${esc(c.address)}</div>`:''}</div>
    <div class="row"><button class="btn" data-act="cust-edit" data-key="${esc(c.key)}" ${S.readOnly?'disabled':''}>Edit contact</button><button class="btn primary" data-act="new-for-customer" data-key="${esc(c.key)}" ${S.readOnly?'disabled':''}>+ New event for this client</button></div></div>
  ${S.custEdit&&S.custEdit.key===c.key?custEditForm(c):''}
  <div class="tiles"><div class="tile"><div class="k">Events</div><div class="v">${c.events.length}</div><div class="s">${c.booked} booked</div></div><div class="tile"><div class="k">Lifetime spend</div><div class="v">${money0(c.spend)}</div><div class="s">Definite + completed</div></div><div class="tile"><div class="k">Avg event</div><div class="v">${avg?money0(avg):'—'}</div></div><div class="tile"><div class="k">Last / next</div><div class="v" style="font-size:20px">${c.last?esc(fmtDate(c.last)):'—'}</div><div class="s">Next: ${c.next?esc(fmtDate(c.next)):'none'}</div></div></div>
  <div class="panel" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Space</th><th class="num">Guests</th><th>Status</th><th class="num">Total</th><th class="num">Balance</th></tr></thead><tbody>
  ${evs.map(e=>{const t=totals(e);return `<tr class="click" data-act="open-event" data-id="${esc(e.id)}"><td>${esc(fmtDate(e.date))}</td><td><b>${esc(e.title)}</b><div class="muted" style="font-size:12px">${esc(e.type||'')}${e.imported?' · from Tripleseat':''}</div></td><td>${esc((e.spaceIds||[]).map(spaceName).join(', '))}</td><td class="num">${num(e.guests)}</td><td><span class="pill ${sc(e.status)}">${esc(e.status)}</span></td><td class="num">${t.total?money0(t.total):'—'}</td><td class="num">${t.total?money0(t.balance):'—'}</td></tr>`}).join('')}
  </tbody></table></div></div>
  ${S.custEdit&&S.custEdit.key===c.key?'':`<p class="muted" style="font-size:12px;margin-top:10px">Use Edit contact to update this client’s details on all of their events at once.</p>`}`;
}
function renderEvents(){
  const q=S.listQ.trim().toLowerCase();
  let list=evList().filter(e=>{
    if(S.listStatus==='open'&&!ACTIVE.includes(e.status))return false;
    if(S.listStatus!=='open'&&S.listStatus!=='all'&&e.status!==S.listStatus)return false;
    if(!q)return true;
    return [e.title,e.client&&e.client.name,e.client&&e.client.company,e.client&&e.client.email,e.type].join(' ').toLowerCase().includes(q);
  }).sort(byDate);
  return `${staleBanner()}<div class="page-head"><div><h1>All events</h1><p>${list.length} shown</p></div>
   <div class="row"><input type="text" id="list-q" data-ui="listQ" placeholder="Search name, client, email" value="${esc(S.listQ)}" style="width:240px">
   <select id="list-status" data-ui="listStatus" style="width:auto"><option value="open" ${S.listStatus==='open'?'selected':''}>Open (not lost or completed)</option><option value="all" ${S.listStatus==='all'?'selected':''}>All statuses</option>${STATUSES.map(s=>`<option ${S.listStatus===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
  <div class="panel" style="padding:0"><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Client</th><th>Space</th><th class="num">Guests</th><th>Status</th><th class="num">Total</th><th class="num">Balance</th></tr></thead><tbody>
  ${list.length?list.map(e=>{const t=totals(e);return `<tr class="click" data-act="open-event" data-id="${esc(e.id)}"><td>${esc(fmtShort(e.date))}</td><td><b>${esc(e.title)}</b><div class="muted" style="font-size:12px">${esc(e.type)}</div></td><td>${esc(e.client&&e.client.name)}</td><td>${esc((e.spaceIds||[]).map(spaceName).join(', '))}</td><td class="num">${num(e.guests)}</td><td><span class="pill ${sc(e.status)}">${e.status}</span>${e.status==='Lost'&&e.lostReason?`<div class="muted" style="font-size:12px">${esc(e.lostReason)}</div>`:''}</td><td class="num">${t.total?money0(t.total):'—'}</td><td class="num">${t.total?money0(t.balance):'—'}</td></tr>`}).join(''):'<tr><td colspan="8" class="empty">No events match.</td></tr>'}
  </tbody></table></div></div>`;
}

/* ---------- event detail ---------- */
function fid(path){return 'f-'+path.replace(/\./g,'-')}
function inp(ev,label,path,type,extra){
  const v=getPath(ev,path); const dis=S.readOnly?'disabled':'';
  return `<div class="f ${extra&&extra.wide?'wide':''}"><label for="${fid(path)}">${label}</label><input id="${fid(path)}" type="${type||'text'}" data-bind="${path}" ${type==='number'?'data-type="num" step="any" min="0"':''} value="${esc(v==null?'':v)}" ${dis}></div>`;
}
function sel(ev,label,path,opts,blank){
  const v=getPath(ev,path)||'';
  const all=opts.includes(v)||!v?opts:[v,...opts];
  return `<div class="f"><label for="${fid(path)}">${label}</label><select id="${fid(path)}" data-bind="${path}" ${S.readOnly?'disabled':''}>${blank?`<option value="">${blank}</option>`:''}${all.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
}
function txt(ev,label,path,ph){
  return `<div class="f wide"><label for="${fid(path)}">${label}</label><textarea id="${fid(path)}" data-bind="${path}" placeholder="${esc(ph||'')}" ${S.readOnly?'disabled':''}>${esc(getPath(ev,path)||'')}</textarea></div>`;
}
function renderDetail(){
  const ev=S.events.get(S.eventId);
  if(!ev) return `<div class="page-head"><div><h1>Event not found</h1><p>It may have been deleted.</p></div></div><button class="btn" data-act="nav" data-view="pipeline">Back to pipeline</button>`;
  const t=totals(ev), conf=conflicts(ev);
  const tabs=[['details','Details'],['proposal','Proposal'],['beo','BEO'],['contract','Contract & payments'],['client','Client view'],['activity','Activity']];
  let banner='';
  if(conf.length){
    const hard=conf.filter(c=>c.hold);
    banner=`<div class="banner ${hard.length?'bad':'warn'}"><b>${hard.length?'Space is already held':'Another inquiry wants this space'}</b> on ${esc(fmtShort(ev.date))}:<ul>${conf.map(c=>`<li><button class="link" data-act="open-event" data-id="${esc(c.ev.id)}">${esc(c.ev.title)}</button> · ${esc(c.ev.status)} · ${esc(fmtTime(c.ev.start))}–${esc(fmtTime(c.ev.end))} · ${esc((c.ev.spaceIds||[]).map(spaceName).join(', '))}</li>`).join('')}</ul></div>`;
  }
  const cap=capacity(ev);
  if(cap&&num(ev.guests)>cap.standing) banner+=`<div class="banner warn">${num(ev.guests)} guests is over the standing capacity of the selected space (${cap.standing}).</div>`;
  let body='';
  switch(S.tab){
    case 'proposal':body=tabProposal(ev,t);break;
    case 'beo':body=tabBEO(ev,t);break;
    case 'contract':body=tabContract(ev,t);break;
    case 'client':body=tabClient(ev,t);break;
    case 'activity':body=tabActivity(ev);break;
    default:body=tabDetails(ev,cap);
  }
  return `${staleBanner()}<button class="link" data-act="back" style="margin-bottom:10px">‹ Back</button>
  <div class="det-head"><div><div class="row"><h1>${esc(ev.title||'Untitled event')}</h1>
    <select id="f-status" data-status aria-label="Status" style="width:auto" ${S.readOnly?'disabled':''}>${STATUSES.map(s=>`<option ${s===ev.status?'selected':''}>${s}</option>`).join('')}</select><span class="pill ${sc(ev.status)}">${ev.status}</span></div>
    <div class="meta">${esc(fmtDate(ev.date))}${ev.start?' · '+esc(fmtTime(ev.start))+'–'+esc(fmtTime(ev.end)):''} · ${num(ev.guests)} guests · ${esc((ev.spaceIds||[]).map(spaceName).join(', ')||'No space chosen')} · ${esc(ev.client&&ev.client.name||'No contact')}</div></div>
    <div class="det-money"><div class="tile"><div class="k">Total</div><div class="v">${money0(t.total)}</div></div><div class="tile"><div class="k">Balance</div><div class="v">${money0(t.balance)}</div><div class="s">${money0(t.paid)} paid</div></div></div></div>
  ${banner}
  <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button class="tab ${S.tab===k?'on':''}" role="tab" aria-selected="${S.tab===k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
  ${body}`;
}
function tabDetails(ev,cap){
  const c=S.config;
  return `<div class="grid2">
  <div class="panel"><div class="row between" style="margin-bottom:12px"><h3>Contact</h3>${(()=>{const cu=customerOf(ev);const others=cu?cu.events.length-1:0;return cu?`<button class="link" data-act="open-customer" data-key="${esc(cu.key)}">${others?`Repeat client · ${others} other event${others>1?'s':''}`:'Customer profile'} ›</button>`:''})()}</div><div class="fields">
    ${inp(ev,'Name','client.name')}${inp(ev,'Company / organization','client.company')}${inp(ev,'Email','client.email','email')}${inp(ev,'Phone','client.phone','tel')}${inp(ev,'Address','client.address','text',{wide:true})}
  </div></div>
  <div class="panel"><h3>Booking</h3><div class="fields">
    ${inp(ev,'Event name','title','text',{wide:true})}${sel(ev,'Event type','type',c.eventTypes)}${inp(ev,'Guests','guests','number')}
    ${inp(ev,'Date','date','date')}${inp(ev,'Start','start','time')}${inp(ev,'End','end','time')}
    ${sel(ev,'Lead source','source',c.sources)}${sel(ev,'Event manager','owner',c.staff,'Unassigned')}${inp(ev,'Next follow-up','followUp','date')}
    ${ev.status==='Lost'?sel(ev,'Lost reason','lostReason',c.lostReasons,'Choose a reason'):''}
  </div></div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="row between" style="margin-bottom:12px"><h3>Spaces</h3>${cap?`<span class="muted">Capacity: ${cap.seated} seated · ${cap.standing} standing</span>`:''}</div>
    <div class="spaces-pick">${c.spaces.map(s=>{const on=(ev.spaceIds||[]).includes(s.id);return `<label class="space-opt ${on?'on':''}" for="sp-${esc(s.id)}"><input type="checkbox" id="sp-${esc(s.id)}" data-space="${esc(s.id)}" ${on?'checked':''} ${S.readOnly?'disabled':''}><span><b>${esc(s.name)}</b><small>${num(s.standing)?num(s.seated)+' seated · '+num(s.standing)+' standing':'Capacity not set yet'}</small><small>Room fee ${money0(s.roomFee)} · F&amp;B min ${money0(s.fbMin)}${s.buyout?' · blocks all spaces':''}</small></span></label>`}).join('')}</div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="fields">${txt(ev,'Internal notes','notes','What the client asked for, budget, anything the team should know')}</div></div>
  <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn danger ${S.delArm?'armed':''}" data-act="delete-event" ${S.readOnly?'disabled':''}>${S.delArm?'Click again to delete for good':'Delete event'}</button></div>`;
}
function descRows(t){t=String(t||'');return Math.max(1,Math.min(8,Math.ceil(t.length/55)+(t.match(/\n/g)||[]).length))}
function catalogOptions(){
  // Event packages are grouped by category; regular-menu dishes by their menu section ("group").
  const map={},order=[];
  S.config.catalog.forEach(i=>{const g=i.group||i.category;if(!map[g]){map[g]=[];order.push(g)}map[g].push(i)});
  const groups=[...CATS.filter(c=>map[c]),...order.filter(g=>!CATS.includes(g))];
  return groups.map(g=>`<optgroup label="${esc(g)}">${map[g].map(i=>`<option value="${esc(i.id)}" ${S.addItemSel===i.id?'selected':''}>${esc(i.name)} — ${money(i.price)} ${esc(i.unit)}</option>`).join('')}</optgroup>`).join('');
}
function importedLines(ev,t){
  const b=ev.imported&&ev.imported.breakdown;
  if(!b)return `<span>Event subtotal (from Tripleseat)</span><span>${money(t.fb)}</span><span>Service charge, tax &amp; fees</span><span>${money(t.tax)}</span>`;
  const L=[['food','Food'],['beverage','Beverage'],['av','Audio / visual'],['labor','Labor'],['roomRental','Room rental'],['linens','Linens'],['rentals','Rentals'],['misc','Misc'],['discounts','Discounts'],['gratuity','Gratuity'],['adminFee','Admin fee'],['salesTax','Sales tax']];
  let sum=0;const rows=L.filter(([k])=>b[k]).map(([k,l])=>{sum+=k==='discounts'?-Math.abs(b[k]):b[k];return `<span>${l}</span><span>${k==='discounts'?'−'+money(Math.abs(b[k])):money(b[k])}</span>`});
  const other=r2(t.total-sum);
  if(Math.abs(other)>0.01)rows.push(`<span>Other charges</span><span>${money(other)}</span>`);
  return rows.join('');
}
function totalsBlock(t,ev){
  if(t.imported) return `<div class="totals">
    ${importedLines(ev,t)}
    <span class="t">Total</span><span class="t">${money(t.total)}</span>
    <span>Deposit</span><span>${money(t.depositDue)}</span>
  </div><p class="muted" style="font-size:12px;text-align:right;margin:6px 0 0">Imported from Tripleseat. Adding a menu item here switches this event to Bandstand pricing.</p>`;
  return `<div class="totals">
    <span>Food &amp; beverage</span><span>${money(t.fb)}</span>
    ${t.shortfall?`<span>F&amp;B minimum shortfall (min ${money0(t.fbMin)})</span><span>${money(t.shortfall)}</span>`:''}
    ${t.other?`<span>Rentals, AV &amp; entertainment</span><span>${money(t.other)}</span>`:''}
    ${t.roomFee?`<span>Room fee</span><span>${money(t.roomFee)}</span>`:''}
    <span>Service charge (${num(ev.serviceRate)}%)</span><span>${money(t.service)}</span>
    ${t.adminFee?`<span>Admin fee (${num(ev.adminFeeRate)}%)</span><span>${money(t.adminFee)}</span>`:''}
    <span>Sales tax (${num(ev.taxRate)}%)</span><span>${money(t.tax)}</span>
    <span class="t">Total</span><span class="t">${money(t.total)}</span>
    <span>Deposit due at signing (${num(ev.depositPct)}%)</span><span>${money(t.depositDue)}</span>
  </div>`;
}
function tabProposal(ev,t){
  const ro=S.readOnly?'disabled':'';
  const rows=(ev.items||[]).map((it,i)=>`<tr>
    <td><input class="cell-in" type="text" id="it-${i}-name" data-bind="items.${i}.name" value="${esc(it.name)}" aria-label="Item name" ${ro}><textarea class="cell-in desc-box" id="it-${i}-desc" data-bind="items.${i}.desc" rows="${descRows(it.desc)}" title="${esc(it.desc||'')}" placeholder="Choices / details (shown to client)" aria-label="Item details" ${ro}>${esc(it.desc||'')}</textarea>${it.unit==='per person per hour'?`<div class="muted" style="font-size:11px;margin-top:2px">Qty = guests × hours</div>`:''}</td>
    <td><select class="cell-in" id="it-${i}-cat" data-bind="items.${i}.category" aria-label="Category" style="min-width:120px" ${ro}>${CATS.map(c=>`<option ${c===it.category?'selected':''}>${c}</option>`).join('')}</select></td>
    <td><select class="cell-in" id="it-${i}-unit" data-bind="items.${i}.unit" aria-label="Unit" style="min-width:170px" ${ro}>${UNITS.map(u=>`<option ${u===it.unit?'selected':''}>${u}</option>`).join('')}</select></td>
    <td class="num"><input class="cell-in" type="number" step="any" min="0" id="it-${i}-price" data-type="num" data-bind="items.${i}.price" value="${num(it.price)}" style="width:90px" aria-label="Price" ${ro}></td>
    <td class="num"><input class="cell-in" type="number" step="any" min="0" id="it-${i}-qty" data-type="num" data-bind="items.${i}.qty" value="${num(it.qty)}" style="width:72px" aria-label="Quantity" ${ro}></td>
    <td class="num">${money(num(it.price)*num(it.qty))}</td>
    <td class="num" style="white-space:nowrap">${(it.unit==='per person'||it.unit==='per person per hour')&&num(it.qty)!==defaultQty(ev,it.unit)?`<button class="btn sm" data-act="sync-qty" data-i="${i}" title="Reset quantity from guest count${it.unit==='per person per hour'?' and event length':''}" ${ro}>= ${it.unit==='per person'?num(ev.guests)+' guests':num(ev.guests)+' × '+eventHours(ev)+' hrs'}</button> `:''}<button class="btn sm danger" data-act="del-item" data-i="${i}" aria-label="Remove line" ${ro}>Remove</button></td></tr>`).join('');
  return `<div class="panel"><div class="row between" style="margin-bottom:12px"><h3>Menu, packages &amp; rentals</h3>
    <div class="row"><select id="add-cat-item" data-ui="addItemSel" aria-label="Choose from menu" style="width:auto;max-width:340px" ${ro}>${catalogOptions()}</select><button class="btn primary" data-act="add-item" ${ro}>Add</button><button class="btn" data-act="add-custom" ${ro}>Custom line</button></div></div>
    ${(()=>{const c=S.config.catalog.find(x=>x.id===(S.addItemSel||(S.config.catalog[0]||{}).id));return c?`<div class="pick-preview"><b>${esc(c.name)}</b> · ${money(c.price)} ${esc(c.unit)}${c.desc?`<div>${esc(c.desc)}</div>`:''}</div>`:''})()}
    <div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Unit</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Line total</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">No items yet. Pick from the menu above. Per-person items start at the guest count.</td></tr>'}</tbody></table></div>
  </div>
  <div class="grid2" style="margin-top:16px">
    <div class="panel"><div class="row between" style="margin-bottom:12px"><h3>Pricing terms</h3><button class="btn sm" data-act="space-pricing" ${ro}>Use space pricing</button></div><div class="fields">
      ${inp(ev,'Room fee ($)','roomFee','number')}${inp(ev,'F&amp;B minimum ($)','fbMinimum','number')}${inp(ev,'Service charge (%)','serviceRate','number')}${inp(ev,'Admin fee (%)','adminFeeRate','number')}${inp(ev,'Sales tax (%)','taxRate','number')}${inp(ev,'Deposit (%)','depositPct','number')}
      <div class="f"><span class="lbl">Tax on service charge &amp; admin fee</span><label class="check" for="f-taxService"><input type="checkbox" id="f-taxService" data-bind="taxService" data-type="bool" ${ev.taxService?'checked':''} ${ro}> Taxable</label></div>
    </div><p class="muted" style="font-size:12px;margin:12px 0 0">The F&amp;B minimum counts only Food and Beverage lines. If spending is short, the difference is added as a room minimum fee.</p></div>
    <div class="panel"><h3>Totals</h3>${totalsBlock(t,ev)}</div>
  </div>`;
}
function beoText(ev,t){
  const L=[];
  L.push(`BANQUET EVENT ORDER — ${S.config.venueName}`,`${ev.title} (${ev.status})`,`${fmtDate(ev.date,true)} · ${fmtTime(ev.start)}–${fmtTime(ev.end)}`,`Guests: ${num(ev.guests)} · Space: ${(ev.spaceIds||[]).map(spaceName).join(', ')}`,`Contact: ${ev.client.name} ${ev.client.phone} ${ev.client.email}`,`Event manager: ${ev.owner||'—'}`,'');
  L.push('TIMELINE');(ev.beo.timeline||[]).forEach(r=>L.push(`  ${fmtTime(r.time)}  ${r.desc}`));L.push('');
  L.push('FOOD & BEVERAGE');(ev.items||[]).forEach(i=>L.push(`  ${num(i.qty)} × ${i.name} [${i.category}]${i.desc?'\n      '+i.desc:''}`));L.push('');
  [['SETUP / FLOOR PLAN','setup'],['MUSIC / STAGE / AV','music'],['BAR','bar'],['KITCHEN','kitchen'],['ALLERGIES & DIETARY','allergies'],['STAFFING','staffing']].forEach(([h,k])=>{if(ev.beo[k]){L.push(h,'  '+ev.beo[k].replace(/\n/g,'\n  '),'')}});
  L.push(`Est. total ${money(t.total)} · Paid ${money(t.paid)} · Balance ${money(t.balance)}`);
  return L.join('\n');
}
function tabBEO(ev,t){
  const ro=S.readOnly?'disabled':'';
  const tl=(ev.beo.timeline||[]).map((r,i)=>`<tr><td style="width:130px"><input class="cell-in" type="time" id="tl-${i}-time" data-bind="beo.timeline.${i}.time" value="${esc(r.time)}" aria-label="Time" ${ro}></td><td><input class="cell-in" type="text" id="tl-${i}-desc" data-bind="beo.timeline.${i}.desc" value="${esc(r.desc)}" aria-label="What happens" ${ro}></td><td class="num" style="width:80px"><button class="btn sm danger" data-act="del-tl" data-i="${i}" ${ro}>Remove</button></td></tr>`).join('');
  const fb=(ev.items||[]);
  return `<div class="row between" style="margin-bottom:12px"><p class="muted" style="margin:0">The BEO is the run sheet for the kitchen, bar and stage crew. Edit it here; it uses the proposal's menu automatically.</p>
    <div class="row"><button class="btn" data-act="tl-template" ${ro}>Fill standard timeline</button><button class="btn" data-act="email-beo" ${S.beoSending?'disabled':''}>${S.beoSending?'Sending…':'Email BEO to team'}</button><button class="btn primary" data-act="copy-beo">Copy BEO as text</button></div></div>
  ${ev.beoReminder&&ev.beoReminder.status==='sent'?`<p class="muted" style="margin:-4px 0 12px;font-size:12px">Automatic reminder sent ${esc(fmtTS(ev.beoReminder.at))}.</p>`:''}
  ${S.beoText!=null?`<div class="panel" style="margin-bottom:12px"><label for="beo-text">Copy didn’t work here. Select all and copy:</label><textarea id="beo-text" readonly style="min-height:200px;font-family:ui-monospace,monospace;font-size:12px">${esc(S.beoText)}</textarea></div>`:''}
  <div class="sheet">
    <div class="sheet-head"><div>${docBrand('Banquet Event Order')}</div><div style="text-align:right"><b>${esc(ev.title)}</b><div><span class="pill ${sc(ev.status)}">${ev.status}</span></div></div></div>
    <div class="kv"><div><span>Date</span>${esc(fmtDate(ev.date,true))}</div><div><span>Time</span>${esc(fmtTime(ev.start))}–${esc(fmtTime(ev.end))}</div><div><span>Guests</span>${num(ev.guests)}</div><div><span>Space</span>${esc((ev.spaceIds||[]).map(spaceName).join(', ')||'—')}</div><div><span>Contact</span>${esc(ev.client.name||'—')}<br><span style="text-transform:none;letter-spacing:0;font-weight:400">${esc(ev.client.phone)}</span></div><div><span>Event manager</span>${esc(ev.owner||'—')}</div></div>
    <section><div class="row between"><h3 style="flex:1">Timeline</h3><button class="btn sm" data-act="add-tl" ${ro}>Add row</button></div><table><tbody>${tl||'<tr><td class="empty">No timeline yet. Use “Fill standard timeline” or add rows.</td></tr>'}</tbody></table></section>
    <section><h3>Food &amp; beverage</h3>${fb.length?`<table><tbody>${fb.map(i=>`<tr><td class="num" style="width:60px">${num(i.qty)}</td><td>${esc(i.name)}${i.desc?`<div class="muted" style="font-size:12px;white-space:pre-line">${esc(i.desc)}</div>`:''}</td><td class="muted">${esc(i.category)}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">Add items on the Proposal tab.</p>'}</section>
    <div class="fields">
      ${txt(ev,'Setup / floor plan','beo.setup','Tables, linens, stage layout, coat check')}
      ${txt(ev,'Music / stage / AV','beo.music','Band or DJ, load-in time, sound check, mics, projector')}
      ${txt(ev,'Bar','beo.bar','Package, kegs to tap, cut-off time, tab instructions')}
      ${txt(ev,'Kitchen','beo.kitchen','Service style, timing, plating notes')}
      ${txt(ev,'Allergies &amp; dietary','beo.allergies','Count of vegetarian, gluten-free, allergies')}
      ${txt(ev,'Staffing','beo.staffing','Bartenders, servers, door, sound engineer')}
    </div>
  </div>`;
}
function tabContract(ev,t){
  const ro=S.readOnly?'disabled':'';
  const c=ev.contract||{};
  const steps=[
    [!!c.sentAt,'Proposal sent',c.sentAt?fmtTS(c.sentAt):'Not sent yet'],
    [!!c.signedAt,'Contract signed',c.signedAt?`${esc(c.signedName)} · ${fmtTS(c.signedAt)}`:'Waiting for client signature'],
    [t.depositMet,'Deposit paid',t.depositMet?`${money(t.paid)} received`:`${money(t.depositDue)} due at signing`],
    [t.total>0&&t.balance<=0.005,'Paid in full',t.balance>0.005?`${money(t.balance)} due by ${esc(fmtShort(balanceDueDate(ev)))}`:'No balance']
  ];
  const pays=(ev.payments||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const email=`Hi ${(ev.client.name||'').split(' ')[0]||'there'},\n\nThanks for thinking of ${S.config.venueName} for ${ev.title}. Your proposal for ${fmtDate(ev.date,true)} (${num(ev.guests)} guests) is ready. The total is ${money(t.total)}, and a ${money(t.depositDue)} deposit holds the date.\n\nYou can review and sign your proposal here: ${clientLink(ev.id)||'[proposal link]'}${safeUrl(toastOf(ev).invoiceUrl)?`\n\nPay the deposit securely through our Toast invoice: ${safeUrl(toastOf(ev).invoiceUrl)}`:''}\n\nWe're holding the date for you for 7 days. Let me know if you have any questions.\n\n${ev.owner||''}\n${S.config.venueName} · ${S.config.tagline||''}`;
  return `<div class="grid2">
  <div class="panel"><h3>Booking progress</h3><ol class="steps">${steps.map(([d,l,s],i)=>`<li class="${d?'done':''}"><span class="mark">${d?'✓':i+1}</span><span><b>${l}</b><div class="muted" style="font-size:13px">${s}</div></span></li>`).join('')}</ol>
    <div class="row" style="margin-top:16px"><button class="btn primary" data-act="mark-sent" ${ro}>${c.sentAt?'Mark sent again':'Mark proposal sent'}</button><button class="btn" data-act="tab" data-tab="client">Preview client view</button>${c.signedAt?`<button class="btn" data-act="unsign" ${ro}>Clear signature</button>`:''}</div>
    <div class="f" style="margin-top:16px"><label for="client-link">Client proposal link (they review, sign and pay here)</label><div class="row"><input type="text" id="client-link" readonly value="${esc(clientLink(ev.id)||'Saving… reload in a moment')}" style="flex:1;min-width:200px"><button class="btn sm" data-act="copy-link">Copy</button>${clientLink(ev.id)?`<a class="btn sm" href="${esc(clientLink(ev.id))}" target="_blank" rel="noopener">Open</a>`:''}</div></div>
    <div class="f" style="margin-top:16px"><label for="prop-email">Proposal email (copy into your email)</label><textarea id="prop-email" readonly style="min-height:150px">${esc(email)}</textarea><div><button class="btn sm" data-act="copy-email">Copy email</button></div></div>
  </div>
  <div class="panel"><h3>Toast invoice</h3>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Cards are charged through Toast, so the money and the reporting stay in your POS. In Toast Web, go to <b>Payments › Payment methods › Customer invoices</b>, create the invoice and add a deposit request. Paste its link here and the client’s Pay button opens it.</p>
    <div class="fields">
      <div class="f"><label for="f-toast-invoiceNumber">Invoice #</label><input type="text" id="f-toast-invoiceNumber" data-bind="toast.invoiceNumber" value="${esc(toastOf(ev).invoiceNumber)}" ${ro}></div>
      <div class="f" style="grid-column:span 2"><label for="f-toast-invoiceUrl">Invoice payment link</label><input type="text" id="f-toast-invoiceUrl" data-bind="toast.invoiceUrl" placeholder="https://…" value="${esc(toastOf(ev).invoiceUrl)}" ${ro}></div>
    </div>
    ${toastOf(ev).invoiceUrl&&!safeUrl(toastOf(ev).invoiceUrl)?'<p class="flag" style="display:inline-block">The link must start with https://</p>':''}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="copy-toast">Copy details for the Toast invoice</button>${safeUrl(toastOf(ev).invoiceUrl)?`<a class="btn" href="${esc(safeUrl(toastOf(ev).invoiceUrl))}" target="_blank" rel="noopener">Open invoice</a>`:''}</div>
    ${S.toastText!=null?`<textarea readonly style="margin-top:10px;min-height:180px;font-family:ui-monospace,monospace;font-size:12px" aria-label="Invoice details">${esc(S.toastText)}</textarea>`:''}
    <p class="muted" style="margin:12px 0 0;font-size:12px">When Toast shows a payment, record it below as “Toast invoice (paid online)” so the balance and status update.</p>
  </div>
  <div class="panel" style="grid-column:1/-1"><h3>Payments</h3>
    <div class="totals" style="margin:0 0 14px;max-width:none"><span>Total</span><span>${money(t.total)}</span><span>Deposit due (${num(ev.depositPct)}%)</span><span>${money(t.depositDue)}</span><span>Received</span><span>${money(t.paid)}</span><span class="t">Balance</span><span class="t">${money(t.balance)}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Method</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${pays.length?pays.map(p=>`<tr><td>${esc(fmtShort(p.date))}</td><td>${esc(p.kind)}${p.note?`<div class="muted" style="font-size:12px">${esc(p.note)}</div>`:''}</td><td>${esc(p.method)}</td><td class="num">${p.kind==='refund'?'−':''}${money(p.amount)}</td><td class="num"><button class="btn sm danger" data-act="del-pay" data-pid="${esc(p.id)}" ${ro}>Remove</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">No payments recorded.</td></tr>'}
    </tbody></table></div>
    <form id="pay-form" data-form="pay" style="margin-top:14px"><div class="fields">
      <div class="f"><label for="pay-date">Date</label><input type="date" id="pay-date" name="date" value="${todayISO()}" required ${ro}></div>
      <div class="f"><label for="pay-amt">Amount ($)</label><input type="number" id="pay-amt" name="amount" step="0.01" min="0.01" value="${t.depositMet?Math.max(0,t.balance).toFixed(2):Math.max(0,r2(t.depositDue-t.paid)).toFixed(2)}" required ${ro}></div>
      <div class="f"><label for="pay-kind">Type</label><select id="pay-kind" name="kind" ${ro}><option value="deposit" ${t.depositMet?'':'selected'}>deposit</option><option value="payment" ${t.depositMet?'selected':''}>payment</option><option value="refund">refund</option></select></div>
      <div class="f"><label for="pay-method">Method</label><select id="pay-method" name="method" ${ro}>${METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div>
      <div class="f wide"><label for="pay-note">Note</label><input type="text" id="pay-note" name="note" placeholder="Toast invoice #, check #, POS check #" ${ro}></div>
    </div><button class="btn primary" type="submit" style="margin-top:10px" ${ro}>Record payment</button></form>
  </div></div>`;
}
function tabClient(ev,t){
  const c=ev.contract||{};
  const lines=(ev.items||[]);
  const payNeeded=t.total>0&&!t.depositMet?r2(t.depositDue-t.paid):(t.total>0&&t.balance>0.005?t.balance:0);
  return `<div class="banner info">This is what the client sees at their proposal link (Contract &amp; payments tab). They can sign without logging in, and the Pay button opens your Toast invoice. Use the form below only to record a contract signed on paper.</div>
  <div class="sheet">
    <div class="sheet-head"><div>${docBrand('Event proposal &amp; agreement')}</div><div style="text-align:right">Prepared for<br><b>${esc(ev.client.name||'Client')}</b>${ev.client.company?`<div class="muted">${esc(ev.client.company)}</div>`:''}</div></div>
    <div class="kv"><div><span>Event</span>${esc(ev.title)}</div><div><span>Date</span>${esc(fmtDate(ev.date,true))}</div><div><span>Time</span>${esc(fmtTime(ev.start))}–${esc(fmtTime(ev.end))}</div><div><span>Guests</span>${num(ev.guests)}</div><div><span>Space</span>${esc((ev.spaceIds||[]).map(spaceName).join(', ')||'—')}</div><div><span>Your contact</span>${esc(ev.owner||S.config.venueName)}</div></div>
    <section><h3>What’s included</h3>${lines.length?`<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${lines.map(i=>`<tr><td>${esc(i.name)}${i.desc?`<div class="muted" style="font-size:12px;white-space:pre-line">${esc(i.desc)}</div>`:''}</td><td class="num">${num(i.qty)}</td><td class="num">${money(i.price)} <span class="muted" style="font-size:11px">${esc(i.unit)}</span></td><td class="num">${money(num(i.price)*num(i.qty))}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">Menu to be confirmed.</p>'}
      <div style="margin-top:14px">${totalsBlock(t,ev)}</div></section>
    <section><h3>Terms</h3><div class="terms">${esc(S.config.terms)}</div></section>
    <section><h3>Signature</h3>${c.signedAt?`<div class="sign-box"><div class="signed">${esc(c.signedName)}</div><div class="muted">Signed electronically ${esc(fmtTS(c.signedAt))}</div></div>`:
      `<form class="sign-box" data-form="sign"><div class="fields"><div class="f"><label for="sign-name">Signed on paper? Record the signer’s name</label><input type="text" id="sign-name" name="name" required value="${esc(ev.client.name)}" ${S.readOnly?'disabled':''}></div></div>
      <label class="check" for="sign-agree" style="margin:12px 0"><input type="checkbox" id="sign-agree" name="agree" required ${S.readOnly?'disabled':''}> The client signed a paper copy of this proposal.</label>
      <button class="btn primary" type="submit" ${S.readOnly?'disabled':''}>Record signature</button></form>`}</section>
    <section><h3>Payment</h3>${payNeeded>0?`<p>${t.depositMet?'Remaining balance':'Deposit to hold your date'}: <b>${money(payNeeded)}</b></p>${safeUrl(toastOf(ev).invoiceUrl)?`<a class="btn primary" href="${esc(safeUrl(toastOf(ev).invoiceUrl))}" target="_blank" rel="noopener">Pay ${money(payNeeded)} securely with Toast</a><p class="muted" style="font-size:12px">Opens your Toast invoice${toastOf(ev).invoiceNumber?' #'+esc(toastOf(ev).invoiceNumber):''} in a new tab.</p>`:'<p class="muted">Your event manager will send a secure Toast payment link.</p>'}`:
      (t.total>0?`<p class="flag ok" style="display:inline-block">Paid in full. Thank you!</p>`:'<p class="muted">Pricing to be confirmed.</p>')}</section>
  </div>`;
}
function tabActivity(ev){
  const acts=ev.activity||[];
  return `<div class="panel"><form data-form="note" class="row" style="margin-bottom:14px"><input type="text" id="note-text" name="text" placeholder="Log a call, email or note" style="flex:1;min-width:200px" required ${S.readOnly?'disabled':''}><button class="btn primary" type="submit" ${S.readOnly?'disabled':''}>Add note</button></form>
  ${acts.length?`<table><tbody>${acts.map(a=>`<tr><td style="width:190px" class="muted">${esc(fmtTS(a.at))}</td><td>${esc(a.text)}</td><td class="muted" style="width:140px">${esc(staffName(a.by))}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No activity yet.</p>'}</div>`;
}

/* ---------- inquiry form ---------- */
function renderInquiry(){
  const url=location.origin+'/inquiry';
  const embed=`<iframe src="${url}" title="Private event inquiry" style="width:100%;max-width:760px;height:1250px;border:0"></iframe>`;
  return `<div class="page-head"><div><h1>Website inquiry form</h1><p>Anyone can fill this in. Each submission lands in the Pipeline as a Lead with a follow-up for tomorrow.</p></div><a class="btn primary" href="/inquiry" target="_blank" rel="noopener">Open the form</a></div>
  <div class="grid2"><div class="panel"><h3>Link</h3><p class="muted" style="margin-top:0">Use this for a “Book a private event” button on the website or social media.</p><div class="row"><input type="text" id="inq-url" readonly value="${esc(url)}" style="flex:1"><button class="btn sm" data-act="copy-field" data-field="inq-url">Copy</button></div></div>
  <div class="panel"><h3>Embed on the website</h3><p class="muted" style="margin-top:0">Paste this code into an HTML or embed block on the events page.</p><textarea id="inq-embed" readonly style="font-family:ui-monospace,monospace;font-size:12px">${esc(embed)}</textarea><button class="btn sm" data-act="copy-field" data-field="inq-embed" style="margin-top:8px">Copy code</button></div></div>`;
}
/* ---------- reports ---------- */
function renderReports(){
  const Y=String(S.reportYear);
  const evs=evList();
  const years=[...new Set([String(new Date().getFullYear()),...evs.map(e=>(e.date||'').slice(0,4)).filter(Boolean)])].sort();
  const inYear=evs.filter(e=>(e.date||(e.createdAt||'').slice(0,10)).startsWith(Y));
  const booked=inYear.filter(e=>e.status==='Definite'||e.status==='Completed');
  const lost=inYear.filter(e=>e.status==='Lost');
  const decided=booked.length+lost.length;
  const rev=booked.reduce((a,e)=>a+totals(e).total,0);
  const months=Array.from({length:12},(_,i)=>booked.filter(e=>(e.date||'').slice(5,7)===pad(i+1)).reduce((a,e)=>a+totals(e).total,0));
  const maxM=Math.max(...months,1);
  const src={}; inYear.forEach(e=>{const s=e.source||'Unknown';src[s]=src[s]||{n:0,b:0};src[s].n++;if(e.status==='Definite'||e.status==='Completed')src[s].b++;});
  const srcRows=Object.entries(src).sort((a,b)=>b[1].n-a[1].n); const maxS=Math.max(1,...srcRows.map(r=>r[1].n));
  const lr={}; lost.forEach(e=>{const r=e.lostReason||'No reason given';lr[r]=(lr[r]||0)+1}); const lrRows=Object.entries(lr).sort((a,b)=>b[1]-a[1]); const maxL=Math.max(1,...lrRows.map(r=>r[1]));
  const sp={}; booked.forEach(e=>(e.spaceIds||[]).forEach(id=>{sp[id]=(sp[id]||0)+1})); const spRows=Object.entries(sp).sort((a,b)=>b[1]-a[1]); const maxSp=Math.max(1,...spRows.map(r=>r[1]));
  return `${staleBanner()}<div class="page-head"><div><h1>Reports · ${Y}</h1><p>By event date. Booked means Definite or Completed.</p></div>
    <select id="rep-year" data-ui="reportYear" style="width:auto" aria-label="Year">${years.map(y=>`<option ${y===Y?'selected':''}>${y}</option>`).join('')}</select></div>
  <div class="tiles">
    <div class="tile"><div class="k">Inquiries</div><div class="v">${inYear.length}</div></div>
    <div class="tile"><div class="k">Booked events</div><div class="v">${booked.length}</div></div>
    <div class="tile"><div class="k">Close rate</div><div class="v">${decided?Math.round(booked.length/decided*100)+'%':'—'}</div><div class="s">Booked ÷ (booked + lost)</div></div>
    <div class="tile"><div class="k">Booked revenue</div><div class="v">${money0(rev)}</div></div>
    <div class="tile"><div class="k">Avg event</div><div class="v">${booked.length?money0(rev/booked.length):'—'}</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px"><h3>Booked revenue by month</h3>
    <div class="bars" style="margin-top:22px">${months.map((v,i)=>`<div class="bar" style="height:${v/maxM*100}%" title="${money0(v)}">${v?`<b>${v>=1000?'$'+(v/1000).toFixed(v>=10000?0:1)+'k':money0(v)}</b>`:''}</div>`).join('')}</div>
    <div class="bar-labels">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m=>`<span>${m}</span>`).join('')}</div></div>
  <div class="grid2">
    <div class="panel"><h3>Lead sources</h3>${srcRows.length?srcRows.map(([s,v])=>`<div class="hbar"><span>${esc(s)}</span><span class="track"><span class="fill" style="display:block;width:${v.n/maxS*100}%"></span></span><span class="num">${v.n} · ${v.b} booked</span></div>`).join(''):'<p class="muted">No inquiries yet.</p>'}</div>
    <div class="panel"><h3>Why we lost them</h3>${lrRows.length?lrRows.map(([s,v])=>`<div class="hbar"><span>${esc(s)}</span><span class="track"><span class="fill" style="display:block;width:${v/maxL*100}%;background:var(--s-lost)"></span></span><span class="num">${v}</span></div>`).join(''):'<p class="muted">No lost events.</p>'}</div>
    <div class="panel"><h3>Booked by space</h3>${spRows.length?spRows.map(([s,v])=>`<div class="hbar"><span>${esc(spaceName(s))}</span><span class="track"><span class="fill" style="display:block;width:${v/maxSp*100}%;background:var(--s-def)"></span></span><span class="num">${v}</span></div>`).join(''):'<p class="muted">No booked events.</p>'}</div>
  </div>`;
}

/* ---------- settings ---------- */
function renderEmailSettings(d,ro){
  const ms=S.mailStatus;
  if(!ms&&!S.mailStatusLoading)loadMailStatus();
  const status=!ms?'<span class="muted">Checking…</span>':ms.error?`<span class="flag warn">Can’t check right now</span>`:ms.configured?`<span class="flag ok">Sending from ${esc(ms.from)}</span>`:'<span class="flag warn">Not set up yet: connect a Gmail account below</span>';
  const gm=ms&&!ms.error&&ms.gmailBridge;
  const gmail=!gm?'':ms.via==='gmail'?`<div class="row" style="gap:8px;flex-wrap:wrap"><span>Emails send from <b>${esc(ms.from)}</b> through Gmail.</span><button class="btn sm" data-act="gmail-connect" ${S.gmailBusy?'disabled':''}>Connect a different account</button><button class="btn sm danger" data-act="gmail-disconnect" ${S.gmailBusy?'disabled':''}>Disconnect</button></div>`
    :`<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="gmail-connect" ${S.gmailBusy?'disabled':''}>Connect Gmail (${esc(S.email)})</button><span class="muted" style="font-size:12px">Emails send from the account of whoever connects it. Erin should sign in here and click this.</span></div>`;
  const perm=('Notification' in window)?Notification.permission:'unsupported';
  return `<div class="panel" style="margin-bottom:16px"><div class="row between" style="margin-bottom:10px"><h3>New-lead emails &amp; alerts</h3>${status}</div>
  <p class="muted" style="margin-top:0;font-size:13px">When someone submits the website inquiry form, they get the reply below and the alert addresses get an email with the details. Everyone with events access also sees an alert in this app.</p>
  ${gmail?`<div style="margin-bottom:12px">${gmail}</div>`:''}
  <div class="fields">
    <div class="f"><span class="lbl">Customer auto-reply</span><label class="check" for="s-autoReplyOn"><input type="checkbox" id="s-autoReplyOn" data-sbind="autoReplyOn" data-type="bool" ${d.autoReplyOn!==false?'checked':''} ${ro}> Send automatically</label></div>
    <div class="f"><label for="s-leadAlertTo">Email new-lead alerts to</label><input class="cell-in" id="s-leadAlertTo" style="width:100%" data-sbind="leadAlertTo" value="${esc(d.leadAlertTo||'')}" placeholder="erin@bandstandbrewworks.com" ${ro}></div>
    <div class="f"><label for="s-replyTo">Customer replies go to</label><input class="cell-in" id="s-replyTo" type="email" style="width:100%" data-sbind="replyTo" value="${esc(d.replyTo||'')}" placeholder="erin@bandstandbrewworks.com" ${ro}></div>
    <div class="f wide"><label for="s-autoReplySubject">Auto-reply subject</label><input class="cell-in" id="s-autoReplySubject" data-sbind="autoReplySubject" value="${esc(d.autoReplySubject||'')}" ${ro}></div>
    <div class="f wide"><label for="s-autoReplyBody">Auto-reply message</label><textarea id="s-autoReplyBody" data-sbind="autoReplyBody" style="min-height:220px" ${ro}>${esc(d.autoReplyBody||'')}</textarea>
      <span class="muted" style="font-size:12px">Fill-ins: {first_name} {name} {event_type} {date} {guests} {space} {start} {end}</span></div>
  </div>
  <div class="row" style="margin-top:10px;flex-wrap:wrap">
    <button class="btn" data-act="mail-test" ${S.mailTesting?'disabled':''}>${S.mailTesting?'Sending…':'Send me a test auto-reply'}</button>
    ${perm==='default'?'<button class="btn" data-act="notif-on">Turn on desktop alerts on this computer</button>':perm==='granted'?'<span class="flag ok">Desktop alerts on for this computer</span>':''}
  </div></div>
  <div class="panel" style="margin-bottom:16px"><h3>Pre-event BEO email</h3>
  <p class="muted" style="margin-top:0;font-size:13px">Before each Tentative or Definite event, the team gets an email with the event details and the latest BEO. It goes out once, from the same Gmail account as the lead emails. To resend after changes, use <b>Email BEO to team</b> on the event’s BEO tab.</p>
  <div class="fields">
    <div class="f"><span class="lbl">Reminder</span><label class="check" for="s-beoReminderOn"><input type="checkbox" id="s-beoReminderOn" data-sbind="beoReminderOn" data-type="bool" ${d.beoReminderOn!==false?'checked':''} ${ro}> Send automatically</label></div>
    <div class="f"><label for="s-beoReminderHours">Hours before the event</label><input class="cell-in" id="s-beoReminderHours" type="number" min="1" max="336" step="1" data-type="num" data-sbind="beoReminderHours" value="${esc(d.beoReminderHours==null?36:d.beoReminderHours)}" ${ro}></div>
    <div class="f wide"><label for="s-beoReminderTo">Send to (separate with commas)</label><textarea id="s-beoReminderTo" data-sbind="beoReminderTo" style="min-height:60px" ${ro}>${esc(d.beoReminderTo||'')}</textarea></div>
  </div></div>`;
}
async function loadMailStatus(){
  S.mailStatusLoading=true;
  try{const r=await fetch('/api/lead-notify?status=1',{cache:'no-store'});S.mailStatus=r.ok?await r.json():{error:true};}
  catch(e){S.mailStatus={error:true};}
  S.mailStatusLoading=false;scheduleRender();
}
async function gmailCall(method,path){
  const {data:{session}}=await sb.auth.getSession();
  const base=(S.mailStatus&&S.mailStatus.membershipsUrl)||'https://bandstand-memberships.vercel.app';
  const r=await fetch(base+'/api/events-email/'+path,{method,headers:{Authorization:'Bearer '+(session&&session.access_token||'')}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Error '+r.status));return j;
}
async function gmailConnect(){S.gmailBusy=true;render();try{const j=await gmailCall('POST','connect');location.href=j.url;}catch(e){S.gmailBusy=false;toast('Couldn’t start Gmail connection: '+e.message);render();}}
async function gmailDisconnect(){S.gmailBusy=true;render();try{await gmailCall('DELETE','status');toast('Gmail disconnected');}catch(e){toast('Couldn’t disconnect: '+e.message);}S.gmailBusy=false;S.mailStatus=null;render();}
function gmailReturnNotice(){
  let q;try{q=new URLSearchParams(location.search)}catch(e){return}
  if(!q.has('gmail')&&!q.has('gmail_error'))return;
  setTimeout(()=>toast(q.has('gmail')?'Gmail connected. New-lead emails will send from it.':'Gmail not connected: '+q.get('gmail_error')),300);
  try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
}
async function emailBeo(id){
  if(S.beoSending)return;
  const ev=S.events.get(id);if(!ev)return;
  S.beoSending=true;render();
  try{
    await (chains['ev:'+id]||Promise.resolve()); // make sure the latest edits are saved first
    const {data:{session}}=await sb.auth.getSession();
    const r=await fetch('/api/beo-reminder',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(session&&session.access_token||'')},body:JSON.stringify({id})});
    const j=await r.json().catch(()=>({}));
    toast(r.ok?(j.lines&&j.lines[0]||'BEO emailed'):'BEO not sent: '+(j.error||(j.lines||[]).join(' ')||r.status));
  }catch(e){toast('BEO not sent: '+e.message);}
  S.beoSending=false;render();
}
async function sendTestMail(){
  S.mailTesting=true;render();
  try{
    const {data:{session}}=await sb.auth.getSession();
    const d=S.draft||S.config;
    const r=await fetch('/api/lead-notify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(session&&session.access_token||'')},
      body:JSON.stringify({test:true,settings:{autoReplySubject:d.autoReplySubject,autoReplyBody:d.autoReplyBody,replyTo:d.replyTo}})});
    const j=await r.json().catch(()=>({}));
    toast(r.ok?`Test email sent to ${j.to}`:`Test email not sent: ${j.error||r.status}`);
  }catch(e){toast('Test email not sent: '+e.message);}
  S.mailTesting=false;render();
}
function renderSettings(){
  const d=S.draft||(S.draft=clone(S.config)); const ro=S.readOnly?'disabled':'';
  const sIn=(path,type,w)=>`<input class="cell-in" id="${'s-'+path.replace(/\./g,'-')}" type="${type||'text'}" data-sbind="${path}" ${type==='number'?'data-type="num" step="any" min="0"':''} value="${esc(getPath(d,path))}" ${w?`style="width:${w}"`:''} aria-label="${esc(path)}" ${ro}>`;
  const dirty=JSON.stringify(d)!==JSON.stringify(S.config);
  return `<div class="page-head"><div><h1>Settings</h1><p>Spaces, menu and default terms used for new events. The spaces and prices below are examples. Replace them with Bandstand’s real ones.</p></div>
   <div class="row">${dirty?'<span class="flag warn">Unsaved changes</span>':''}<button class="btn" data-act="settings-discard" ${dirty?'':'disabled'}>Discard</button><button class="btn primary" data-act="settings-save" ${dirty&&!S.readOnly?'':'disabled'}>Save settings</button></div></div>
  <div class="panel" style="margin-bottom:16px"><h3>Venue &amp; defaults</h3><div class="fields">
    <div class="f"><label for="s-venueName">Venue name</label>${sIn('venueName')}</div>
    <div class="f"><label for="s-tagline">Motto</label>${sIn('tagline')}</div>
    <div class="f wide"><span class="lbl">Logo (shown on the sidebar, inquiry form, proposals and BEOs)</span><div class="row"><span class="logo-prev">${/^data:image\//.test(d.logo||'')?`<img src="${d.logo}" alt="Logo preview">`:'<span class="muted">No logo yet</span>'}</span><label class="btn" for="s-logo-file" style="color:var(--ink)">Upload logo…</label><input type="file" id="s-logo-file" data-logo accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none" ${ro}>${d.logo?`<button class="btn danger" data-act="s-del-logo" ${ro}>Remove</button>`:''}</div><span class="muted" style="font-size:12px">PNG with a transparent background works best. Then click Save settings.</span></div>
    <div class="f"><label for="s-taxRate">Sales tax (%)</label>${sIn('taxRate','number')}</div>
    <div class="f"><label for="s-serviceRate">Service charge (%)</label>${sIn('serviceRate','number')}</div>
    <div class="f"><label for="s-adminFeeRate">Admin fee (%)</label>${sIn('adminFeeRate','number')}</div>
    <div class="f"><label for="s-depositPct">Deposit (%)</label>${sIn('depositPct','number')}</div>
    <div class="f"><label for="s-balanceDueDays">Balance due (days before)</label>${sIn('balanceDueDays','number')}</div>
    <div class="f"><label for="s-defaultStart">Default start time</label>${sIn('defaultStart','time')}</div>
    <div class="f"><label for="s-defaultEnd">Default end time</label>${sIn('defaultEnd','time')}</div>
    <div class="f"><label for="s-defaultGuests">Default guest count</label>${sIn('defaultGuests','number')}</div>
    <div class="f wide"><span class="muted" style="font-size:12px">The three defaults above fill in new events and the website inquiry form. Guests can still change them on the form.</span></div>
    <div class="f"><span class="lbl">Service charge &amp; admin fee</span><label class="check" for="s-taxService"><input type="checkbox" id="s-taxService" data-sbind="taxService" data-type="bool" ${d.taxService?'checked':''} ${ro}> Is taxable</label></div>
  </div></div>
  <div class="panel" style="margin-bottom:16px"><div class="row between" style="margin-bottom:10px"><h3>Spaces</h3><button class="btn sm" data-act="s-add-space" ${ro}>Add space</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th class="num">Seated</th><th class="num">Standing</th><th class="num">Room fee</th><th class="num">F&amp;B min</th><th>Blocks all spaces</th><th></th></tr></thead><tbody>
    ${d.spaces.map((s,i)=>`<tr><td>${sIn(`spaces.${i}.name`)}</td><td class="num">${sIn(`spaces.${i}.seated`,'number','80px')}</td><td class="num">${sIn(`spaces.${i}.standing`,'number','80px')}</td><td class="num">${sIn(`spaces.${i}.roomFee`,'number','100px')}</td><td class="num">${sIn(`spaces.${i}.fbMin`,'number','100px')}</td><td><label class="check" for="s-spaces-${i}-buyout"><input type="checkbox" id="s-spaces-${i}-buyout" data-sbind="spaces.${i}.buyout" data-type="bool" ${s.buyout?'checked':''} ${ro}> Buyout</label></td><td class="num"><button class="btn sm danger" data-act="s-del-space" data-i="${i}" ${ro}>Remove</button></td></tr>`).join('')}
    </tbody></table></div></div>
  <div class="panel" style="margin-bottom:16px"><div class="row between" style="margin-bottom:10px"><h3>Menu, packages &amp; rentals</h3><button class="btn sm" data-act="s-add-item" ${ro}>Add item</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Name &amp; details</th><th>Menu section</th><th>Category</th><th>Unit</th><th class="num">Price</th><th></th></tr></thead><tbody>
    ${d.catalog.map((c,i)=>`<tr><td>${sIn(`catalog.${i}.name`)}<textarea class="cell-in desc-box" id="s-catalog-${i}-desc" data-sbind="catalog.${i}.desc" rows="${descRows(c.desc)}" title="${esc(c.desc||'')}" placeholder="Choices / details shown to clients" aria-label="Details" ${ro}>${esc(c.desc||'')}</textarea></td><td>${sIn(`catalog.${i}.group`,'text','150px')}</td><td><select class="cell-in" id="s-catalog-${i}-category" data-sbind="catalog.${i}.category" aria-label="Category" ${ro}>${CATS.map(x=>`<option ${x===c.category?'selected':''}>${x}</option>`).join('')}</select></td><td><select class="cell-in" id="s-catalog-${i}-unit" data-sbind="catalog.${i}.unit" aria-label="Unit" ${ro}>${UNITS.map(x=>`<option ${x===c.unit?'selected':''}>${x}</option>`).join('')}</select></td><td class="num">${sIn(`catalog.${i}.price`,'number','100px')}</td><td class="num"><button class="btn sm danger" data-act="s-del-item" data-i="${i}" ${ro}>Remove</button></td></tr>`).join('')}
    </tbody></table></div></div>
  ${renderEmailSettings(d,ro)}
  <div class="panel" style="margin-bottom:16px"><h3>Lists (one per line)</h3><div class="fields">
    ${[['staff','Event managers'],['eventTypes','Event types'],['sources','Lead sources'],['lostReasons','Lost reasons']].map(([k,l])=>`<div class="f"><label for="s-list-${k}">${l}</label><textarea id="s-list-${k}" data-slist="${k}" style="min-height:130px" ${ro}>${esc(d[k].join('\n'))}</textarea></div>`).join('')}
  </div></div>
  <div class="panel"><h3>Contract terms</h3><div class="f"><label for="s-terms">Shown on every proposal the client signs</label><textarea id="s-terms" data-sbind="terms" style="min-height:240px" ${ro}>${esc(d.terms)}</textarea></div></div>`;
}

/* ---------- events: clicks ---------- */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  if(el.dataset.act==='cal-new'&&e.target.closest('.ev-chip')) return;
  const act=el.dataset.act, ev=S.events.get(S.eventId);
  switch(act){
    case 'nav':go(el.dataset.view);break;
    case 'mail-test':sendTestMail();break;
    case 'email-beo':emailBeo(S.eventId);break;
    case 'gmail-connect':gmailConnect();break;
    case 'gmail-disconnect':gmailDisconnect();break;
    case 'notif-on':if('Notification' in window)Notification.requestPermission().then(()=>render());break;
    case 'lead-alert-close':S.leadAlert=null;render();break;
    case 'lead-alert-open':{const id=el.dataset.id;S.leadAlert=null;S.tab='details';go('event',id);break;}
    case 'sign-out':sb.auth.signOut().then(()=>location.reload());break;
    case 'copy-link':{const f=document.getElementById('client-link');if(!clientLink(S.eventId))return toast('The link appears once the event is saved.');copyText(f.value,()=>{f.select();toast('Select the link and copy it')},'Client link copied');break;}
    case 'copy-field':{const f=document.getElementById(el.dataset.field);copyText(f.value,()=>{f.select();toast('Select the text and copy it')},'Copied');break;}
    case 'back':history.length>1?history.back():go('pipeline');break;
    case 'new-event':{if(S.readOnly)return toast('You have view-only access.');const n=newEvent();logAct(n,'Event created');persistEvent(n);S.tab='details';go('event',n.id);setTimeout(()=>{const f=document.getElementById('f-title');if(f){f.focus();f.select()}},30);break;}
    case 'open-event':S.tab='details';go('event',el.dataset.id);break;
    case 'open-customer':S.custEdit=null;go('customer',el.dataset.key);break;
    case 'cust-edit':{const c=customers().find(x=>x.key===el.dataset.key);if(!c)return;S.custEdit={key:c.key,name:c.name,company:c.company,email:c.email,phone:c.phone,address:c.address,scope:'all'};render();setTimeout(()=>{const f=document.getElementById('ce-name');if(f)f.focus()},20);break;}
    case 'cust-edit-cancel':S.custEdit=null;render();break;
    case 'imp-clear':S.imp=null;render();break;
    case 'imp-run':runImport();break;
    case 'new-for-customer':{if(S.readOnly)return;const cu=customers().find(x=>x.key===el.dataset.key);if(!cu)return;const n=newEvent({client:{name:cu.name,email:cu.email,phone:cu.phone,company:cu.company},source:'Repeat client',title:(cu.company||cu.name||'New')+' event'});logAct(n,'Event created for repeat client');persistEvent(n);S.tab='details';go('event',n.id);break;}
    case 'tab':S.tab=el.dataset.tab;S.delArm=false;S.beoText=null;S.toastText=null;render();break;
    case 'copy-toast':{const text=toastInvoiceText(ev,totals(ev));S.toastText=text;copyText(text,()=>render(),'Invoice details copied');render();break;}
    case 'cal-move':S.calMonth=new Date(S.calMonth.getFullYear(),S.calMonth.getMonth()+Number(el.dataset.n),1);render();break;
    case 'cal-today':S.calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();break;
    case 'cal-new':{if(S.readOnly)return;const sp=S.calSpace!=='all'?[S.calSpace]:[];const n=newEvent({date:el.dataset.date,spaceIds:sp});if(sp.length)applySpacePricing(n);logAct(n,'Event created from calendar');persistEvent(n);S.tab='details';go('event',n.id);break;}
    case 'delete-event':if(!S.delArm){S.delArm=true;render();}else{removeEvent(S.eventId);toast('Event deleted');go('pipeline');}break;
    case 'add-item':{const id=document.getElementById('add-cat-item').value||S.addItemSel;const c=S.config.catalog.find(x=>x.id===id);if(!c)return;mutate(ev.id,x=>{x.items.push({id:uid(),name:c.name,category:c.category,unit:c.unit,price:num(c.price),desc:c.desc||'',qty:defaultQty(x,c.unit)})},'Added '+c.name);break;}
    case 'add-custom':mutate(ev.id,x=>x.items.push({id:uid(),name:'Custom item',category:'Other',unit:'flat',price:0,qty:1}));setTimeout(()=>{const f=document.getElementById('it-'+(ev.items.length)+'-name');if(f){f.focus();f.select()}},30);break;
    case 'del-item':{const i=+el.dataset.i;const nm=ev.items[i]&&ev.items[i].name;mutate(ev.id,x=>x.items.splice(i,1),'Removed '+nm);break;}
    case 'sync-qty':{const i=+el.dataset.i;mutate(ev.id,x=>{x.items[i].qty=defaultQty(x,x.items[i].unit)});break;}
    case 'space-pricing':mutate(ev.id,x=>applySpacePricing(x),'Applied space pricing');break;
    case 'add-tl':mutate(ev.id,x=>{x.beo.timeline=x.beo.timeline||[];x.beo.timeline.push({time:'',desc:''})});break;
    case 'del-tl':{const i=+el.dataset.i;mutate(ev.id,x=>x.beo.timeline.splice(i,1));break;}
    case 'tl-template':mutate(ev.id,x=>{const s=mins(x.start||'18:00'),f=m=>{m=((m%1440)+1440)%1440;return pad(Math.floor(m/60))+':'+pad(m%60)};const e=span(x)[1];x.beo.timeline=[{time:f(s-180),desc:'Band / DJ load-in'},{time:f(s-120),desc:'Sound check'},{time:f(s-60),desc:'Room set, staff briefing'},{time:f(s),desc:'Doors open, bar opens'},{time:f(s+30),desc:'Food service begins'},{time:f(s+90),desc:'Live music set 1'},{time:f(e-30),desc:'Last call'},{time:f(e),desc:'Event ends'}]},'Filled standard timeline');break;
    case 'copy-beo':{const text=beoText(ev,totals(ev));copyText(text,()=>{S.beoText=text;render()},'BEO copied');break;}
    case 'copy-email':{const ta=document.getElementById('prop-email');copyText(ta.value,()=>{ta.select();toast('Select the text and copy it')},'Email copied');break;}
    case 'mark-sent':mutate(ev.id,x=>{x.contract.sentAt=new Date().toISOString();if(x.status==='Lead')setStatus(x,'Proposal Sent');if(!x.followUp||x.followUp<todayISO())x.followUp=addDays(todayISO(),3)},'Proposal marked as sent');toast('Marked as sent');break;
    case 'unsign':mutate(ev.id,x=>{x.contract.signedAt='';x.contract.signedName=''},'Signature cleared');break;
    case 'del-pay':{const p=ev.payments.find(p=>p.id===el.dataset.pid);mutate(ev.id,x=>{x.payments=x.payments.filter(q=>q.id!==el.dataset.pid)},p?`Removed ${p.kind} of ${money(p.amount)}`:'Removed payment');break;}
    case 'inquiry-again':S.inquiryDone=null;render();break;
    case 'settings-save':{const d=clone(S.draft);d.spaces=d.spaces.filter(s=>String(s.name).trim());d.catalog=d.catalog.filter(c=>String(c.name).trim());persistConfig(d);S.draft=clone(d);toast('Settings saved');render();break;}
    case 'settings-discard':S.draft=clone(S.config);render();break;
    case 's-del-logo':S.draft.logo='';render();break;
    case 's-add-space':S.draft.spaces.push({id:uid(),name:'New space',seated:0,standing:0,roomFee:0,fbMin:0,buyout:false});render();break;
    case 's-del-space':S.draft.spaces.splice(+el.dataset.i,1);render();break;
    case 's-add-item':S.draft.catalog.push({id:uid(),name:'New item',category:'Food',unit:'per person',price:0,desc:'',group:''});render();break;
    case 's-del-item':S.draft.catalog.splice(+el.dataset.i,1);render();break;
  }
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card[data-act]')){e.preventDefault();e.target.click()}});
function copyText(text,fallback,ok){
  try{navigator.clipboard.writeText(text).then(()=>toast(ok),fallback)}catch(err){fallback()}
}

function readLogo(file){
  if(file.size>5e6)return toast('That image is over 5 MB. Choose a smaller file.');
  const fr=new FileReader();
  fr.onload=()=>{const img=new Image();img.onload=()=>{
    const max=600,sc=Math.min(1,max/Math.max(img.naturalWidth||max,img.naturalHeight||1));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||max)*sc));c.height=Math.max(1,Math.round((img.naturalHeight||200)*sc));
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    let url=c.toDataURL('image/png');if(url.length>180000)url=c.toDataURL('image/webp',0.9);
    if(url.length>200000)return toast('That logo is too detailed to store. Try a smaller PNG.');
    S.draft.logo=url;render();toast('Logo added. Click Save settings to keep it.');
  };img.onerror=()=>toast('Couldn’t read that image. Try a PNG or JPG.');img.src=fr.result;};
  fr.readAsDataURL(file);
}
/* ---------- events: inputs ---------- */
document.addEventListener('input',e=>{if(e.target.classList&&e.target.classList.contains('desc-box'))e.target.rows=descRows(e.target.value);if(e.target.matches('[data-bind],[data-sbind],[data-slist]'))e.target.dataset.dirty='1';
  if(e.target.dataset.ui==='listQ'){S.listQ=e.target.value;scheduleRender();}
  if(e.target.dataset.ui==='custQ'){S.custQ=e.target.value;scheduleRender();}
  if(e.target.dataset.cedit&&S.custEdit&&e.target.type!=='radio'){S.custEdit[e.target.dataset.cedit]=e.target.value;}});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.hasAttribute('data-logo')&&t.files&&t.files[0]&&S.draft){readLogo(t.files[0]);return;}
  if(t.hasAttribute('data-import')&&t.files&&t.files[0]){readImportFile(t.files[0]);return;}
  if(t.dataset.cedit&&S.custEdit){S.custEdit[t.dataset.cedit]=t.value;scheduleRender();return;}
  if(t.dataset.ui){const k=t.dataset.ui;S[k]=k==='reportYear'?Number(t.value):t.value;render();return;}
  if(t.hasAttribute('data-status')){const v=t.value;mutate(S.eventId,x=>{setStatus(x,v)});return;}
  if(t.dataset.space){const id=t.dataset.space,on=t.checked;mutate(S.eventId,x=>{x.spaceIds=x.spaceIds||[];x.spaceIds=on?[...new Set([...x.spaceIds,id])]:x.spaceIds.filter(s=>s!==id);if(!num(x.roomFee)&&!num(x.fbMinimum)||!x.items.length)applySpacePricing(x)},(on?'Added space: ':'Removed space: ')+spaceName(id));return;}
  if(t.dataset.bind){
    delete t.dataset.dirty;
    const path=t.dataset.bind; let v=t.type==='checkbox'?t.checked:t.value;
    if(t.dataset.type==='num')v=num(v);
    const before=getPath(S.events.get(S.eventId),path);
    if(before===v)return;
    const labels={'date':'Date','start':'Start time','end':'End time','guests':'Guest count','title':'Event name','owner':'Event manager','lostReason':'Lost reason','roomFee':'Room fee','fbMinimum':'F&B minimum'};
    mutate(S.eventId,x=>setPath(x,path,v),labels[path]?`${labels[path]} changed to ${v||'(blank)'}`:null);
    return;
  }
  if(t.dataset.sbind&&S.draft){delete t.dataset.dirty;let v=t.type==='checkbox'?t.checked:t.value;if(t.dataset.type==='num')v=num(v);setPath(S.draft,t.dataset.sbind,v);scheduleRender();return;}
  if(t.dataset.slist&&S.draft){delete t.dataset.dirty;S.draft[t.dataset.slist]=linesFrom(t.value);scheduleRender();return;}
});
document.addEventListener('submit',e=>{
  const f=e.target; e.preventDefault(); if(S.readOnly&&f.dataset.form!=='login')return;
  const fd=Object.fromEntries(new FormData(f).entries());
  switch(f.dataset.form){
    case 'pay':{const amt=r2(num(fd.amount));if(amt<=0)return toast('Enter an amount above $0.');mutate(S.eventId,x=>{x.payments.push({id:uid(),date:fd.date||todayISO(),amount:amt,method:fd.method,kind:fd.kind,note:fd.note||''});autoAdvance(x)},`Recorded ${fd.kind} of ${money(amt)} (${fd.method})`);toast('Payment recorded');break;}
    case 'sign':{const nm=String(fd.name||'').trim();if(!nm||!fd.agree)return;mutate(S.eventId,x=>{x.contract.signedAt=new Date().toISOString();x.contract.signedName=nm;if(['Lead','Proposal Sent'].includes(x.status))setStatus(x,'Tentative');autoAdvance(x)},`Paper contract signed by ${nm} (recorded by staff)`);toast('Signature recorded');break;}
    case 'cust-edit':saveCustomerEdit();break;
    case 'note':{const tx=String(fd.text||'').trim();if(!tx)return;mutate(S.eventId,x=>{},'Note: '+tx);break;}
    case 'login':{S.authMsg='';S.loginEmail=String(fd.email||'').trim();sb.auth.signInWithPassword({email:String(fd.email||'').trim(),password:String(fd.password||'')}).then(({error})=>{if(error){S.authMsg=error.message||'Sign-in failed.';render();}else afterLogin();});break;}
  }
});
/* drag & drop on the pipeline */
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('[data-drag]');if(c){e.dataTransfer.setData('text/plain',c.dataset.drag);e.dataTransfer.effectAllowed='move'}});
document.addEventListener('dragover',e=>{const col=e.target.closest&&e.target.closest('[data-drop]');if(col&&!S.readOnly){e.preventDefault();document.querySelectorAll('.drag-over').forEach(x=>x!==col&&x.classList.remove('drag-over'));col.classList.add('drag-over')}});
document.addEventListener('dragleave',e=>{const col=e.target.closest&&e.target.closest('[data-drop]');if(col&&!col.contains(e.relatedTarget))col.classList.remove('drag-over')});
document.addEventListener('drop',e=>{const col=e.target.closest&&e.target.closest('[data-drop]');if(!col)return;e.preventDefault();col.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain'),s=col.dataset.drop;const ev=S.events.get(id);if(ev&&ev.status!==s)mutate(id,x=>setStatus(x,s))});

/* ---------- auth & startup ---------- */
function renderAuth(){
  const l=logoSrc();
  const box=(inner)=>`<div class="public" style="max-width:440px;margin:6vh auto"><div class="public-top"><div class="brand-logo" style="margin-bottom:10px"><img src="${l}" alt="${esc(S.config.venueName)}"></div><div class="tagline" style="font-size:18px">${esc(S.config.tagline||'')}</div><div>Private events · staff sign-in</div></div><div style="padding:22px 26px">${inner}</div></div>`;
  if(S.auth==='checking') return box('<p class="muted">Checking your sign-in…</p>');
  if(S.auth==='config') return box('<p><b>Setup needed.</b> This deployment is missing its Supabase settings. In Vercel, add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.</p>');
  if(S.auth==='denied') return box(`<p>You’re signed in as <b>${esc(S.email)}</b>, but this account doesn’t have events access yet. Ask an admin to turn it on.</p><button class="btn" data-act="sign-out">Sign out</button>`);
  return box(`<form data-form="login" class="stack" style="gap:12px">
    <p class="muted" style="margin:0">Use the same email and password as the Bandstand memberships app.</p>
    <div class="f"><label for="login-email">Email</label><input type="email" id="login-email" name="email" autocomplete="username" required value="${esc(S.loginEmail||'')}"></div>
    <div class="f"><label for="login-pass">Password</label><input type="password" id="login-pass" name="password" autocomplete="current-password" required style="width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface)"></div>
    ${S.authMsg?`<p class="flag" style="margin:0">${esc(S.authMsg)}</p>`:''}
    <button class="btn primary" type="submit">Sign in</button>
    <p class="muted" style="font-size:12px;margin:0">Forgot your password? Reset it from the memberships app’s sign-in page.</p></form>`);
}
function mergeConfig(d){const c=Object.assign(clone(DEFAULT_CONFIG),d||{});['spaces','catalog','staff','eventTypes','sources','lostReasons'].forEach(k=>{if(!Array.isArray(c[k]))c[k]=clone(DEFAULT_CONFIG[k])});return c}
function rowToEvent(r){S.tokens[r.id]=r.client_token;return Object.assign(clone(r.data||{}),{id:r.id})}
async function loadAll(){
  const [ev,st]=await Promise.all([sb.from('private_events').select('id,data,client_token'),sb.from('private_event_settings').select('data').eq('id','main').maybeSingle()]);
  if(ev.error){S.dbError=ev.error.message;S.loaded=true;render();return;}
  const m=new Map();(ev.data||[]).forEach(r=>m.set(r.id,rowToEvent(r)));S.events=m;
  if(st.data&&st.data.data&&Object.keys(st.data.data).length)S.config=mergeConfig(st.data.data);
  if(S.view==='settings')S.draft=clone(S.config);
  if(!seen){loadSeen();const nl=newLeads();if(nl.length&&!S.leadAlert)announceLead(nl[0]);}
  S.loaded=true;S.stale=false;scheduleRender();
}
let channel=null;
function subscribe(){
  if(channel)return;
  channel=sb.channel('private-events')
    .on('postgres_changes',{event:'*',schema:'public',table:'private_events'},p=>{
      if(p.eventType==='DELETE'){const id=p.old&&p.old.id;if(id)S.events.delete(id);}
      else if(p.new&&p.new.id){const ev=rowToEvent(p.new);S.events.set(p.new.id,ev);if(p.eventType==='INSERT'&&seen&&isNewLead(ev)&&!(S.view==='event'&&S.eventId===ev.id))announceLead(ev);}
      scheduleRender();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'private_event_settings'},p=>{
      if(p.new&&p.new.data){S.config=mergeConfig(p.new.data);if(S.view==='settings'&&S.draft&&JSON.stringify(S.draft)===JSON.stringify(S.config))S.draft=clone(S.config);scheduleRender();}
    })
    .subscribe(st=>{S.stale=(st==='CHANNEL_ERROR'||st==='TIMED_OUT');scheduleRender();});
}
async function afterLogin(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){S.auth='login';render();return;}
  S.email=session.user.email||'';S.uid=session.user.id;
  const {data:ok,error}=await sb.rpc('has_events_access');
  if(error||!ok){S.auth='denied';render();return;}
  S.auth='ok';fromHash();render();
  await loadAll();subscribe();
}
window.addEventListener('focus',()=>{if(S.auth==='ok'&&S.loaded)loadAll()});
async function init(){
  gmailReturnNotice();
  fromHash();
  sb=supa();
  if(!sb){S.auth='config';render();return;}
  render();
  sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT'){S.auth='login';S.email='';render();}});
  await afterLogin();
}
init();
