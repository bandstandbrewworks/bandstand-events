/* ---------- reports (date range, tables, Excel/PDF export) ---------- */
// Depends on core.js (totals, money, money0, pad, todayISO, STATUSES) and app.js (S, evList, spaceName,
// staleBanner, esc, logoSrc). Export uses report-export.js (loaded on demand libraries in /vendor).

const REP_BOOKED=['Definite','Completed'], REP_OPEN=['Lead','Proposal Sent','Tentative'];
const REP_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function reportRange(){
  const t=new Date(),y=t.getFullYear(),m=t.getMonth();
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const p=S.repPreset||'this-year';
  if(/^\d{4}$/.test(p))return {from:`${p}-01-01`,to:`${p}-12-31`,label:p};
  switch(p){
    case 'this-month':return {from:iso(new Date(y,m,1)),to:iso(new Date(y,m+1,0)),label:`${REP_MONTHS[m]} ${y}`};
    case 'last-month':return {from:iso(new Date(y,m-1,1)),to:iso(new Date(y,m,0)),label:`${REP_MONTHS[(m+11)%12]} ${m?y:y-1}`};
    case 'this-quarter':{const q=Math.floor(m/3);return {from:iso(new Date(y,q*3,1)),to:iso(new Date(y,q*3+3,0)),label:`Q${q+1} ${y}`}}
    case 'ytd':return {from:`${y}-01-01`,to:iso(t),label:`${y} year to date`};
    case 'next-90':return {from:iso(t),to:iso(new Date(y,m,t.getDate()+90)),label:'Next 90 days'};
    case 'last-year':return {from:`${y-1}-01-01`,to:`${y-1}-12-31`,label:String(y-1)};
    case 'custom':{const f=S.repFrom||`${y}-01-01`,to=S.repTo||iso(t);return {from:f<=to?f:to,to:f<=to?to:f,label:'Custom range'}}
    default:return {from:`${y}-01-01`,to:`${y}-12-31`,label:String(y)};
  }
}
const longD=iso=>{const d=parseISO(iso);return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''};
const evDate=e=>e.date||(e.createdAt||'').slice(0,10);
const clientOf=e=>(e.client&&(e.client.company||e.client.name))||'';
const spacesOf=e=>(e.spaceIds||[]).map(spaceName).join(', ');

function buildEventReport(){
  const R=reportRange(),inR=d=>d&&d>=R.from&&d<=R.to;
  const evs=evList();
  const inRange=evs.filter(e=>inR(evDate(e)));
  const booked=inRange.filter(e=>REP_BOOKED.includes(e.status)).sort((a,b)=>evDate(a).localeCompare(evDate(b)));
  const lost=inRange.filter(e=>e.status==='Lost');
  const open=inRange.filter(e=>REP_OPEN.includes(e.status)).sort((a,b)=>evDate(a).localeCompare(evDate(b)));
  const T=new Map(evs.map(e=>[e.id,totals(e)]));
  const sum=(list,f)=>list.reduce((a,e)=>a+f(e),0);
  const rev=sum(booked,e=>T.get(e.id).total),guests=sum(booked,e=>num(e.guests));
  const decided=booked.length+lost.length;

  // payments by payment date (any event)
  const pays=[];evs.forEach(e=>(e.payments||[]).forEach(p=>{if(inR(String(p.date||'').slice(0,10)))pays.push({date:p.date,event:e.title,client:clientOf(e),kind:p.kind,method:p.method||'',amount:(p.kind==='refund'?-1:1)*num(p.amount)})}));
  pays.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const collected=pays.reduce((a,p)=>a+p.amount,0);

  // months in range
  const months=[];{let [y,m]=R.from.split('-').map(Number);const [ey,em]=R.to.split('-').map(Number);while(y<ey||(y===ey&&m<=em)){months.push(`${y}-${pad(m)}`);m++;if(m>12){m=1;y++}}}
  const byMonth=months.map(k=>{const l=booked.filter(e=>evDate(e).slice(0,7)===k);return {month:`${REP_MONTHS[Number(k.slice(5))-1]} ${k.slice(0,4)}`,events:l.length,guests:sum(l,e=>num(e.guests)),revenue:sum(l,e=>T.get(e.id).total)}});

  const group=(list,keyOf)=>{const m=new Map();list.forEach(e=>{const ks=[].concat(keyOf(e));ks.forEach(k=>{if(!m.has(k))m.set(k,[]);m.get(k).push(e)})});return [...m.entries()]};
  const byType=group(booked,e=>e.type||'Unspecified').map(([type,l])=>({type,events:l.length,guests:sum(l,e=>num(e.guests)),revenue:sum(l,e=>T.get(e.id).total),avg:sum(l,e=>T.get(e.id).total)/l.length})).sort((a,b)=>b.revenue-a.revenue);
  const bySpace=group(booked,e=>(e.spaceIds||[]).length?(e.spaceIds||[]).map(spaceName):['No space set']).map(([space,l])=>({space,events:l.length,guests:sum(l,e=>num(e.guests)),revenue:sum(l,e=>T.get(e.id).total)})).sort((a,b)=>b.events-a.events);
  const bySource=group(inRange,e=>e.source||'Unknown').map(([source,l])=>{const b=l.filter(e=>REP_BOOKED.includes(e.status)).length,lo=l.filter(e=>e.status==='Lost').length;return {source,inquiries:l.length,booked:b,lost:lo,close:b+lo?b/(b+lo):null,revenue:sum(l.filter(e=>REP_BOOKED.includes(e.status)),e=>T.get(e.id).total)}}).sort((a,b)=>b.inquiries-a.inquiries);
  const byLost=group(lost,e=>e.lostReason||'No reason given').map(([reason,l])=>({reason,count:l.length,value:sum(l,e=>T.get(e.id).total)})).sort((a,b)=>b.count-a.count);
  const balances=booked.filter(e=>T.get(e.id).balance>0.005).map(e=>{const t=T.get(e.id);return {date:evDate(e),event:e.title,client:clientOf(e),total:t.total,paid:t.paid,balance:t.balance,deposit:t.depositMet?'Yes':'No'}});

  const evRow=e=>{const t=T.get(e.id);return {date:evDate(e),event:e.title,client:clientOf(e),type:e.type||'',space:spacesOf(e),guests:num(e.guests),status:e.status,owner:e.owner||'',total:t.total,paid:t.paid,balance:t.balance}};
  const bookedRows=booked.map(evRow),openRows=open.map(evRow);
  const tot=(rows,keys)=>Object.fromEntries(keys.map(k=>[k,Math.round(rows.reduce((a,r)=>a+(Number(r[k])||0),0)*100)/100]));

  const C=(key,label,type='text')=>({key,label,type});
  const sections=[
    {id:'booked',title:'Booked events',note:'Definite and Completed events dated in this period.',columns:[C('date','Date','date'),C('event','Event'),C('client','Client'),C('type','Type'),C('space','Space'),C('guests','Guests','int'),C('status','Status'),C('total','Total','money'),C('paid','Paid','money'),C('balance','Balance','money')],rows:bookedRows,totals:tot(bookedRows,['guests','total','paid','balance'])},
    {id:'month',title:'Revenue by month',columns:[C('month','Month'),C('events','Events','int'),C('guests','Guests','int'),C('revenue','Booked revenue','money')],rows:byMonth,totals:tot(byMonth,['events','guests','revenue'])},
    {id:'type',title:'Revenue by event type',columns:[C('type','Event type'),C('events','Events','int'),C('guests','Guests','int'),C('revenue','Revenue','money'),C('avg','Avg per event','money')],rows:byType,totals:tot(byType,['events','guests','revenue'])},
    {id:'payments',title:'Payments received',note:'By payment date, for any event. Refunds show as negative.',columns:[C('date','Date','date'),C('event','Event'),C('client','Client'),C('kind','Kind'),C('method','Method'),C('amount','Amount','money')],rows:pays,totals:{amount:collected}},
    {id:'balances',title:'Balances due',note:'Booked events in this period with money still owed.',columns:[C('date','Event date','date'),C('event','Event'),C('client','Client'),C('total','Total','money'),C('paid','Paid','money'),C('balance','Balance','money'),C('deposit','Deposit paid')],rows:balances,totals:tot(balances,['total','paid','balance'])},
    {id:'pipeline',title:'Open pipeline',note:'Leads, proposals and tentative holds dated in this period.',columns:[C('date','Date','date'),C('event','Event'),C('client','Client'),C('status','Status'),C('guests','Guests','int'),C('owner','Owner'),C('total','Est. total','money')],rows:openRows,totals:tot(openRows,['guests','total'])},
    {id:'sources',title:'Lead sources',columns:[C('source','Source'),C('inquiries','Inquiries','int'),C('booked','Booked','int'),C('lost','Lost','int'),C('close','Close rate','pct'),C('revenue','Booked revenue','money')],rows:bySource,totals:tot(bySource,['inquiries','booked','lost','revenue'])},
    {id:'lost',title:'Why we lost them',columns:[C('reason','Reason'),C('count','Events','int'),C('value','Quoted value','money')],rows:byLost,totals:tot(byLost,['count','value'])},
    {id:'space',title:'Booked by space',note:'An event using two spaces counts in both.',columns:[C('space','Space'),C('events','Events','int'),C('guests','Guests','int'),C('revenue','Revenue','money')],rows:bySpace}
  ];
  const kpis=[
    {label:'Inquiries',value:String(inRange.length)},
    {label:'Booked events',value:String(booked.length)},
    {label:'Close rate',value:decided?Math.round(booked.length/decided*100)+'%':'—'},
    {label:'Booked revenue',value:money0(rev)},
    {label:'Avg event',value:booked.length?money0(rev/booked.length):'—'},
    {label:'Guests (booked)',value:guests.toLocaleString('en-US')},
    {label:'Payments received',value:money0(collected)},
    {label:'Balances due',value:money0(balances.reduce((a,b)=>a+b.balance,0))}
  ];
  return {range:R,byMonth,report:{title:'Private Events Report',subtitle:`${R.label} · ${longD(R.from)} – ${longD(R.to)} · by event date`,org:S.config.venueName||'Bandstand Brew Works',accent:'#a85a26',logoUrl:(typeof logoSrc==='function'&&logoSrc())||'/logo.webp',fileName:`private-events-report-${R.from}-to-${R.to}`,kpis,sections}};
}

function repCell(v,type){
  if(v===null||v===undefined||v==='')return '';
  if(type==='money')return money(v);
  if(type==='int')return Math.round(num(v)).toLocaleString('en-US');
  if(type==='pct')return Math.round(num(v)*100)+'%';
  if(type==='date')return esc(longD(v));
  return esc(v);
}
function repTable(sec){
  const isNum=t=>['money','int','num','pct'].includes(t);
  const limit=S.repExpand===sec.id?Infinity:12,rows=sec.rows.slice(0,limit);
  const head=sec.columns.map(c=>`<th${isNum(c.type)?' class="num"':''}>${esc(c.label)}</th>`).join('');
  const body=rows.length?rows.map(r=>`<tr>${sec.columns.map(c=>`<td${isNum(c.type)?' class="num"':''}>${repCell(r[c.key],c.type)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${sec.columns.length}" class="empty">Nothing in this period.</td></tr>`;
  const foot=sec.totals&&sec.rows.length?`<tr class="rep-total">${sec.columns.map((c,i)=>`<td${isNum(c.type)?' class="num"':''}>${i===0&&sec.totals[c.key]==null?'Total':repCell(sec.totals[c.key],c.type)}</td>`).join('')}</tr>`:'';
  const more=sec.rows.length>12?`<button class="link" data-act="rep-more" data-sec="${sec.id}">${S.repExpand===sec.id?'Show fewer':`Show all ${sec.rows.length}`}</button>`:'';
  return `<div class="panel rep-sec"><div class="rep-head"><div><h3>${esc(sec.title)}</h3>${sec.note?`<p class="muted">${esc(sec.note)}</p>`:''}</div>
    <div class="rep-dl"><button class="btn sm" data-act="rep-xlsx" data-sec="${sec.id}" title="Download this table as Excel">Excel</button><button class="btn sm" data-act="rep-pdf" data-sec="${sec.id}" title="Download this table as PDF">PDF</button></div></div>
    <div class="tbl-wrap"><table class="rep-tbl"><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table></div>${more}</div>`;
}

function renderReports(){
  const built=buildEventReport();S.lastReport=built.report;
  const {report,range,byMonth}=built;
  const p=S.repPreset||'this-year',y=new Date().getFullYear();
  const years=[...new Set(evList().map(e=>evDate(e).slice(0,4)).filter(v=>/^\d{4}$/.test(v)&&Number(v)<y-1))].sort().reverse();
  const opts=[['this-year',`This year (${y})`],['ytd','Year to date'],['this-quarter','This quarter'],['this-month','This month'],['last-month','Last month'],['next-90','Next 90 days'],['last-year',`Last year (${y-1})`],...years.map(v=>[v,v]),['custom','Custom dates…']];
  const maxM=Math.max(...byMonth.map(m=>m.revenue),1);
  const short=byMonth.length<=24;
  return `${staleBanner()}<div class="page-head"><div><h1>Reports</h1><p>${esc(report.subtitle)}. Booked means Definite or Completed.</p></div>
    <div class="row rep-controls"><select id="rep-preset" data-ui="repPreset" style="width:auto" aria-label="Date range">${opts.map(([v,l])=>`<option value="${v}" ${v===p?'selected':''}>${esc(l)}</option>`).join('')}</select>
    ${p==='custom'?`<input type="date" data-ui="repFrom" value="${esc(range.from)}" aria-label="From" style="width:auto"><span class="muted">to</span><input type="date" data-ui="repTo" value="${esc(range.to)}" aria-label="To" style="width:auto">`:''}
    <button class="btn" data-act="rep-xlsx" data-sec="all">Download Excel</button><button class="btn primary" data-act="rep-pdf" data-sec="all">Download PDF</button></div></div>
  <div class="tiles rep-tiles">${report.kpis.map(k=>`<div class="tile"><div class="k">${esc(k.label)}</div><div class="v">${esc(k.value)}</div></div>`).join('')}</div>
  ${short?`<div class="panel" style="margin-bottom:16px"><h3>Booked revenue by month</h3>
    <div class="bars" style="margin-top:22px;grid-template-columns:repeat(${byMonth.length},minmax(0,1fr))">${byMonth.map(m=>`<div class="bar" style="height:${m.revenue/maxM*100}%" title="${esc(m.month)}: ${money0(m.revenue)}">${m.revenue?`<b>${m.revenue>=1000?'$'+(m.revenue/1000).toFixed(m.revenue>=10000?0:1)+'k':money0(m.revenue)}</b>`:''}</div>`).join('')}</div>
    <div class="bar-labels" style="grid-template-columns:repeat(${byMonth.length},minmax(0,1fr))">${byMonth.map(m=>`<span>${esc(byMonth.length>12?m.month.replace(' 20',"'"):m.month.slice(0,3))}</span>`).join('')}</div></div>`:''}
  ${report.sections.map(repTable).join('')}`;
}

async function reportDownload(kind,secId){
  const r=S.lastReport;if(!r)return;
  const sections=secId&&secId!=='all'?r.sections.filter(s=>s.id===secId):undefined;
  const rep=sections?{...r,fileName:`${r.fileName}-${secId}`}:r;
  toast(kind==='pdf'?'Preparing PDF…':'Preparing Excel file…');
  try{await (kind==='pdf'?ReportExport.toPdf(rep,{sections}):ReportExport.toExcel(rep,{sections}));toast('Downloaded')}
  catch(e){console.error(e);toast('Could not create the file: '+(e.message||e))}
}
