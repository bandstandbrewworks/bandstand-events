/* ---------- house events & live music (information only) ---------- */
// House events are Bandstand's own events (ugly sweater party, beach party...). Live music comes
// from the Live Music schedule. Neither blocks a private event; both are shown on the calendar and
// mentioned on any private event that falls on the same day, so staff can tell the party.
// Depends on app.js (S, sb, esc, render, scheduleRender, toast, go, spaceName, fmtShort, fmtTime, todayISO, pad).

// State lives on S (app.js): S.house (Map of house events), S.music (live music list), S.houseEdit (form).

function houseRowToObj(r){return {id:r.id,title:r.title||'',date:String(r.date||'').slice(0,10),start:r.start_time||'',end:r.end_time||'',allDay:!!r.all_day,spaceIds:r.space_ids||[],whole:!!r.whole_building,notes:r.notes||'',seriesId:r.series_id||null}}
const isoPlus=(iso,n)=>{const d=parseISO(iso);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const hhmm=t=>String(t||'').slice(0,5);

async function loadHouse(){
  const [h,m]=await Promise.all([
    sb.from('house_events').select('*').gte('date',isoPlus(todayISO(),-400)).order('date'),
    sb.rpc('events_music_schedule',{p_from:isoPlus(todayISO(),-120),p_to:isoPlus(todayISO(),540)})]);
  if(!h.error){const map=new Map();(h.data||[]).forEach(r=>map.set(r.id,houseRowToObj(r)));S.house=map}
  else console.warn('house events',h.error.message);
  if(!m.error)S.music=(m.data||[]).map(r=>({id:r.id,date:String(r.performance_date).slice(0,10),start:hhmm(r.start_time),end:hhmm(r.end_time),artist:r.artist||'Live music'}));
  else console.warn('music schedule',m.error.message);
  scheduleRender();
}
function houseRealtime(p){
  if(p.eventType==='DELETE'){if(p.old&&p.old.id)S.house.delete(p.old.id)}
  else if(p.new&&p.new.id)S.house.set(p.new.id,houseRowToObj(p.new));
  scheduleRender();
}
let houseTimer=null;
function houseAfterLoad(){loadHouse();if(!houseTimer)houseTimer=setInterval(loadHouse,10*60*1000)}

const houseOn=date=>[...S.house.values()].filter(h=>h.date===date).sort((a,b)=>(a.allDay?'':a.start).localeCompare(b.allDay?'':b.start));
const musicOn=date=>S.music.filter(m=>m.date===date);
const houseRooms=h=>h.whole?'Whole building':(h.spaceIds||[]).map(spaceName).filter(Boolean).join(', ');
const houseWhen=h=>h.allDay||!h.start?'All day':`${fmtTime(h.start)}${h.end?'–'+fmtTime(h.end):''}`;
const musicWhen=m=>m.start?`${fmtTime(m.start)}${m.end?'–'+fmtTime(m.end):''}`:'time TBD';
function houseSharesRoom(h,ev){
  if(h.whole||!(h.spaceIds||[]).length)return true;
  const ids=ev.spaceIds||[];if(!ids.length)return false;
  if([...ids,...h.spaceIds].some(id=>{const s=spaceById(id);return s&&s.buyout}))return true;
  return ids.some(id=>h.spaceIds.includes(id));
}

// Notice for the event page: what else is happening at Bandstand that day.
function sameDayNotice(ev){
  if(!ev||!ev.date)return '';
  const hs=houseOn(ev.date),ms=musicOn(ev.date);
  if(!hs.length&&!ms.length)return '';
  const items=[
    ...ms.map(m=>`<li>🎵 <b>Live music:</b> ${esc(m.artist)} · ${esc(musicWhen(m))}</li>`),
    ...hs.map(h=>`<li>🏠 <b>House event:</b> <button class="link" data-act="house-open" data-id="${esc(h.id)}">${esc(h.title)}</button> · ${esc(houseWhen(h))}${houseRooms(h)?' · '+esc(houseRooms(h)):''}${houseSharesRoom(h,ev)&&(ev.spaceIds||[]).length?' <span class="flag warn">same room</span>':''}</li>`)];
  return `<div class="banner info day-notice"><b>Also at Bandstand on ${esc(fmtShort(ev.date))}</b> (for your information, doesn't block this booking). Let the party know.<ul>${items.join('')}</ul></div>`;
}
// Small badges for event cards and lists.
function sameDayBadges(date){
  if(!date)return '';
  const m=musicOn(date).length,h=houseOn(date).length;
  return `${m?`<span class="flag music" title="Live music that day: ${esc(musicOn(date).map(x=>x.artist).join(', '))}">🎵 Music</span> `:''}${h?`<span class="flag house" title="House event that day: ${esc(houseOn(date).map(x=>x.title).join(', '))}">🏠 House</span> `:''}`;
}
// Calendar cell lines.
function calendarExtras(iso){
  const ms=musicOn(iso).map(m=>`<div class="cal-info music" title="Live music: ${esc(m.artist)} · ${esc(musicWhen(m))} (information only)">🎵 ${esc(m.start?fmtTime(m.start).replace(':00','').replace(' ',''):'')} ${esc(m.artist)}</div>`);
  const hs=houseOn(iso).map(h=>`<button class="cal-info house" data-act="house-open" data-id="${esc(h.id)}" title="House event: ${esc(h.title)} · ${esc(houseWhen(h))}${houseRooms(h)?' · '+esc(houseRooms(h)):''} (information only)">🏠 ${esc(h.allDay||!h.start?'':fmtTime(h.start).replace(':00','').replace(' ',''))} ${esc(h.title)}</button>`);
  return hs.join('')+ms.join('');
}

/* ----- House events page ----- */
function blankHouse(date){return {id:null,title:'',date:date||todayISO(),start:'19:00',end:'22:00',allDay:false,spaceIds:[],whole:false,notes:'',repeat:'none',until:''}}
function houseForm(){
  const h=S.houseEdit;if(!h)return '';
  const sp=S.config.spaces||[];const isNew=!h.id;
  return `<div class="panel house-form"><h3>${isNew?'New house event':'Edit house event'}</h3>
  <div class="fields house-fields">
    <div class="wide"><label for="hf-title">Name</label><input type="text" id="hf-title" data-house="title" value="${esc(h.title)}" placeholder="Ugly Sweater Party" maxlength="200"></div>
    <div><label for="hf-date">Date</label><input type="date" id="hf-date" data-house="date" value="${esc(h.date)}"></div>
    ${h.allDay?'':`<div><label for="hf-start">Starts</label><input type="time" id="hf-start" data-house="start" value="${esc(h.start)}"></div><div><label for="hf-end">Ends</label><input type="time" id="hf-end" data-house="end" value="${esc(h.end)}"></div>`}
    <div class="house-allday"><label class="check"><input type="checkbox" data-house="allDay" ${h.allDay?'checked':''}> All day</label></div>
  </div>
  <div class="lbl" style="margin-top:12px">Rooms</div>
  <div class="row house-rooms"><label class="check"><input type="checkbox" data-house="whole" ${h.whole?'checked':''}> Whole building</label>${h.whole?'':sp.filter(s=>!s.buyout).map(s=>`<label class="check"><input type="checkbox" data-house-room="${esc(s.id)}" ${(h.spaceIds||[]).includes(s.id)?'checked':''}> ${esc(s.name)}</label>`).join('')}</div>
  <div style="margin-top:12px"><label for="hf-notes">Notes</label><textarea id="hf-notes" data-house="notes" rows="2" placeholder="Anything staff should know when booking around it">${esc(h.notes)}</textarea></div>
  ${isNew?`<div class="fields" style="margin-top:12px;max-width:520px"><div><label for="hf-repeat">Repeat</label><select id="hf-repeat" data-house="repeat">${[['none','Does not repeat'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month (same date)']].map(([v,l])=>`<option value="${v}" ${h.repeat===v?'selected':''}>${l}</option>`).join('')}</select></div>${h.repeat!=='none'?`<div><label for="hf-until">Until</label><input type="date" id="hf-until" data-house="until" value="${esc(h.until)}"></div>`:''}</div>`:''}
  ${h.seriesId&&!isNew?'<p class="muted" style="font-size:13px">Part of a repeating series. Changes here apply to this date only.</p>':''}
  <div class="row" style="gap:8px;margin-top:14px"><button class="btn primary" data-act="house-save">${isNew?'Add to calendar':'Save'}</button><button class="btn" data-act="house-cancel">Cancel</button>
  ${isNew?'':`<span style="flex:1"></span><button class="btn danger" data-act="house-del" data-scope="one">Delete</button>${h.seriesId?'<button class="btn danger" data-act="house-del" data-scope="series">Delete this and later repeats</button>':''}`}</div></div>`;
}
function renderHouse(){
  const today=todayISO();
  const upcoming=[...S.house.values()].filter(h=>h.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||''));
  const music=S.music.filter(m=>m.date>=today&&m.date<=isoPlus(today,90));
  return `${staleBanner()}<div class="page-head"><div><h1>House events &amp; music</h1><p>Bandstand's own events and live music. They show on the calendar and on any private event that day. They never block a booking.</p></div>
    <div class="row">${S.readOnly?'':'<button class="btn primary" data-act="house-new">+ House event</button>'}</div></div>
  ${houseForm()}
  <div class="panel" style="margin-bottom:16px"><h3>Upcoming house events</h3>${upcoming.length?`<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Time</th><th>Rooms</th><th>Notes</th><th>Private events that day</th></tr></thead><tbody>${upcoming.map(h=>{const pe=evList().filter(e=>e.date===h.date&&e.status!=='Lost');return `<tr class="click" data-act="house-open" data-id="${esc(h.id)}"><td>${esc(fmtShort(h.date))}</td><td><b>${esc(h.title)}</b>${h.seriesId?' <span class="muted">↻</span>':''}</td><td>${esc(houseWhen(h))}</td><td>${esc(houseRooms(h)||'—')}</td><td class="muted">${esc(h.notes||'')}</td><td>${pe.length?pe.map(e=>esc(e.title)).join(', '):'<span class="muted">None</span>'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted">None yet. Add things like the Ugly Sweater Party or a beach party so whoever books private events sees them.</p>'}</div>
  <div class="panel"><h3>Live music, next 90 days</h3><p class="muted" style="margin-top:0;font-size:13px">From the Live Music schedule (managed in the Membership Manager). Shown for information only.</p>${music.length?`<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Artist</th><th>Time</th><th>Private events that day</th></tr></thead><tbody>${music.map(m=>{const pe=evList().filter(e=>e.date===m.date&&e.status!=='Lost');return `<tr><td>${esc(fmtShort(m.date))}</td><td>${esc(m.artist)}</td><td>${esc(musicWhen(m))}</td><td>${pe.length?pe.map(e=>`<button class="link" data-act="open-event" data-id="${esc(e.id)}">${esc(e.title)}</button>`).join(', '):'<span class="muted">None</span>'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted">No shows scheduled.</p>'}</div>`;
}

function houseInput(t){
  const h=S.houseEdit;if(!h)return false;
  if(t.dataset.houseRoom){const id=t.dataset.houseRoom;h.spaceIds=t.checked?[...new Set([...(h.spaceIds||[]),id])]:(h.spaceIds||[]).filter(x=>x!==id);return true}
  const k=t.dataset.house;if(!k)return false;
  h[k]=t.type==='checkbox'?t.checked:t.value;
  if(['allDay','whole','repeat'].includes(k))render();
  return true;
}
function houseDates(h){
  if(h.repeat==='none'||!h.until||h.until<=h.date)return [h.date];
  const out=[];const start=parseISO(h.date);const lim=isoPlus(h.date,366);const until=h.until<lim?h.until:lim;
  for(let i=0;i<120;i++){
    const d=new Date(start);
    if(h.repeat==='weekly')d.setDate(d.getDate()+7*i);else if(h.repeat==='biweekly')d.setDate(d.getDate()+14*i);
    else{d.setMonth(start.getMonth()+i);if(d.getDate()!==start.getDate())continue}
    const iso=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;if(iso>until)break;out.push(iso);
  }
  return out;
}
async function houseAction(act,el){
  switch(act){
    case 'house-new':S.houseEdit=blankHouse(el.dataset.date);if(S.view!=='house')go('house');else render();return true;
    case 'house-open':{const h=S.house.get(el.dataset.id);if(!h)return true;S.houseEdit={...h,spaceIds:[...(h.spaceIds||[])],repeat:'none'};if(S.view!=='house')go('house');else render();return true}
    case 'house-cancel':S.houseEdit=null;render();return true;
    case 'house-save':{
      const h=S.houseEdit;if(!h||S.readOnly)return true;
      if(!h.title.trim())return toast('Give the house event a name'),true;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(h.date))return toast('Pick a date'),true;
      const row={title:h.title.trim(),start_time:h.allDay?null:(h.start||null),end_time:h.allDay?null:(h.end||null),all_day:!!h.allDay,space_ids:h.whole?[]:(h.spaceIds||[]),whole_building:!!h.whole,notes:h.notes.trim()||null};
      let res;
      if(h.id)res=await sb.from('house_events').update({...row,date:h.date}).eq('id',h.id).select('*');
      else{const dates=houseDates(h),series=dates.length>1?crypto.randomUUID():null;res=await sb.from('house_events').insert(dates.map(d=>({...row,date:d,series_id:series}))).select('*')}
      if(res.error)return toast('Could not save: '+res.error.message),true;
      (res.data||[]).forEach(r=>S.house.set(r.id,houseRowToObj(r)));
      toast(h.id?'House event saved':(res.data||[]).length>1?`Added ${(res.data||[]).length} dates`:'House event added');
      S.houseEdit=null;render();return true;
    }
    case 'house-del':{
      const h=S.houseEdit;if(!h||!h.id||S.readOnly)return true;
      const series=el.dataset.scope==='series'&&h.seriesId;
      if(!confirm(series?`Delete "${h.title}" on ${fmtShort(h.date)} and every later repeat?`:`Delete "${h.title}" on ${fmtShort(h.date)}?`))return true;
      const q=series?sb.from('house_events').delete().eq('series_id',h.seriesId).gte('date',h.date).select('id'):sb.from('house_events').delete().eq('id',h.id).select('id');
      const res=await q;if(res.error)return toast('Could not delete: '+res.error.message),true;
      (res.data||[]).forEach(r=>S.house.delete(r.id));toast('Deleted');S.houseEdit=null;render();return true;
    }
  }
  return false;
}
