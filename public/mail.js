/* Bandstand events — client email threads, email templates and the shared document library.
   Emails are sent/read through the connected Gmail account by the memberships app
   (/api/events-email/compose and /sync); rows land in private_event_emails. */

const MAIL={byEvent:new Map(),summary:new Map(),docs:null,docsLoading:false,info:null,infoLoading:false,seen:null};
const MEMBERSHIPS=()=>((S.mailStatus&&S.mailStatus.membershipsUrl)||'https://bandstand-memberships.vercel.app');
const FILLINS=['first_name','name','event_name','event_type','date','start','end','guests','space','proposal_link','total','deposit','balance','event_manager','venue'];

/* ---------- loading ---------- */
async function mailAfterLoad(){
  const since=new Date(Date.now()-180*864e5).toISOString();
  const {data,error}=await sb.from('private_event_emails').select('id,event_id,direction,created_at').gte('created_at',since);
  if(error)return;
  MAIL.summary=new Map();
  (data||[]).forEach(r=>{const s=MAIL.summary.get(r.event_id)||{count:0,inbound:[]};s.count++;if(r.direction==='in')s.inbound.push(r.created_at);MAIL.summary.set(r.event_id,s);});
  loadMailSeen();scheduleRender();
}
async function loadEventEmails(id,force){
  if(MAIL.byEvent.has(id)&&!force)return;
  MAIL.byEvent.set(id,MAIL.byEvent.get(id)||null);
  const {data,error}=await sb.from('private_event_emails').select('*').eq('event_id',id).order('created_at');
  MAIL.byEvent.set(id,error?[]:(data||[]));scheduleRender();
}
async function loadDocs(force){
  if((MAIL.docs&&!force)||MAIL.docsLoading)return;
  MAIL.docsLoading=true;
  const {data,error}=await sb.from('private_event_documents').select('*').order('name');
  MAIL.docs=error?[]:(data||[]);MAIL.docsLoading=false;scheduleRender();
}
async function loadMailInfo(){
  if(MAIL.info||MAIL.infoLoading)return;MAIL.infoLoading=true;
  try{const {data:{session}}=await sb.auth.getSession();
    const r=await fetch(MEMBERSHIPS()+'/api/events-email/status',{headers:{Authorization:'Bearer '+(session&&session.access_token||'')}});
    MAIL.info=r.ok?await r.json():{error:true};
  }catch(e){MAIL.info={error:true};}
  MAIL.infoLoading=false;scheduleRender();
}
function mailRealtime(p){
  const r=p.new; if(!r||!r.event_id)return;
  const list=MAIL.byEvent.get(r.event_id);
  if(Array.isArray(list)&&!list.some(x=>x.id===r.id)){list.push(r);list.sort((a,b)=>a.created_at.localeCompare(b.created_at));}
  const s=MAIL.summary.get(r.event_id)||{count:0,inbound:[]};s.count++;if(r.direction==='in')s.inbound.push(r.created_at);MAIL.summary.set(r.event_id,s);
  if(r.direction==='in'&&!(S.view==='event'&&S.eventId===r.event_id&&S.tab==='emails')){
    const ev=S.events.get(r.event_id);
    S.mailAlert={id:r.event_id,from:nameOf(r.from_addr),title:ev?ev.title:'an event',subject:r.subject||''};
    try{if('Notification' in window&&Notification.permission==='granted'){const n=new Notification('New email reply',{body:`${S.mailAlert.from}: ${S.mailAlert.subject}`,tag:'mail-'+r.id});n.onclick=()=>{window.focus();openEmails(r.event_id);n.close();};}}catch(e){}
  }
  if(S.view==='event'&&S.eventId===r.event_id&&S.tab==='emails')markMailSeen(r.event_id);
  scheduleRender();
}
function docsRealtime(){if(MAIL.docs)loadDocs(true);}

/* ---------- unread replies (per staff member, this browser) ---------- */
function mailSeenKey(){return 'pe_mail_seen_'+(S.uid||'anon')}
function loadMailSeen(){
  if(MAIL.seen)return;
  let raw=null;try{raw=localStorage.getItem(mailSeenKey())}catch(e){}
  if(raw){try{MAIL.seen=JSON.parse(raw)}catch(e){MAIL.seen={}}}
  else{MAIL.seen={_all:new Date().toISOString()};saveMailSeen();} // first visit: older replies count as read
}
function saveMailSeen(){try{localStorage.setItem(mailSeenKey(),JSON.stringify(MAIL.seen))}catch(e){}}
function unreadReplies(id){
  const s=MAIL.summary.get(id);if(!s||!MAIL.seen)return 0;
  const since=MAIL.seen[id]||MAIL.seen._all||'';return s.inbound.filter(t=>t>since).length;
}
function markMailSeen(id){if(!MAIL.seen)return;const now=new Date().toISOString();if(unreadReplies(id)){MAIL.seen[id]=now;saveMailSeen();}else if(!MAIL.seen[id]){MAIL.seen[id]=now;saveMailSeen();}}
function emailTabLabel(ev){const s=MAIL.summary.get(ev.id),u=unreadReplies(ev.id);return `Emails${s&&s.count?` (${s.count})`:''}${u?` <span class="newpill">${u} new</span>`:''}`}
function openEmails(id){S.mailAlert=null;S.tab='emails';go('event',id);}
function mailAlertHtml(){
  const a=S.mailAlert;if(!a||S.auth!=='ok')return '';
  return `<div class="lead-alert" role="alert" style="${S.leadAlert?'top:150px':''}"><div><b>New email reply</b><div>${esc(a.from)} · ${esc(a.title)}</div>${a.subject?`<div class="muted" style="font-size:12px">${esc(a.subject)}</div>`:''}</div>
    <div class="row"><button class="btn sm primary" data-act="mail-alert-open" data-id="${esc(a.id)}">Open</button><button class="btn sm" data-act="mail-alert-close">Dismiss</button></div></div>`;
}

/* ---------- templates ---------- */
function nameOf(addr){const s=String(addr||'');const m=s.match(/^\s*"?([^"<]+?)"?\s*</);return m?m[1].trim():s.replace(/[<>]/g,'').trim()}
function addrOf(addr){const s=String(addr||'');const m=s.match(/<([^>]+)>/);return (m?m[1]:s).trim()}
function fillValues(ev){
  const c=ev.client||{},t=totals(ev);const name=String(c.name||'').trim();
  return {first_name:name.split(/\s+/)[0]||'there',name:name||'there',event_name:ev.title||'your event',event_type:String(ev.type||'event').toLowerCase(),
    date:ev.date?fmtDate(ev.date,true):'your date',start:fmtTime(ev.start),end:fmtTime(ev.end),guests:String(num(ev.guests)||''),
    space:(ev.spaceIds||[]).map(spaceName).join(', ')||'our event spaces',proposal_link:clientLink(ev.id)||'(save the event first)',
    total:money(t.total),deposit:money(t.depositDue),balance:money(t.balance),event_manager:ev.owner||'The Bandstand events team',venue:S.config.venueName||'Bandstand Brew Works'};
}
function fillTemplate(tpl,ev){const v=fillValues(ev);return String(tpl||'').replace(/\{(\w+)\}/g,(m,k)=>(k in v?v[k]:m))}

/* ---------- compose ---------- */
function startCompose(ev,reply){
  const c=ev.client||{};
  if(reply){
    const lastIn=[...reply.thread].reverse().find(m=>m.direction==='in');
    const subj=reply.thread[0].subject||'';
    S.compose={eventId:ev.id,replyTo:reply.thread[reply.thread.length-1].id,threadKey:reply.key,to:lastIn?addrOf(lastIn.from_addr):(c.email||''),cc:'',subject:/^re:/i.test(subj)?subj:'Re: '+subj,body:'',docIds:[],tpl:''};
  }else S.compose={eventId:ev.id,replyTo:null,to:c.email||'',cc:'',subject:'',body:'',docIds:[],tpl:''};
  loadDocs();render();
  setTimeout(()=>{const f=document.getElementById(reply?'mc-body':'mc-to');if(f)f.focus();},50);
}
function applyTemplate(id){
  const C=S.compose;if(!C)return;const ev=S.events.get(C.eventId);const t=(S.config.emailTemplates||[]).find(x=>x.id===id);
  C.tpl=id;if(!t||!ev){render();return;}
  if(!C.replyTo||!C.subject)C.subject=fillTemplate(t.subject,ev);
  C.body=fillTemplate(t.body,ev);
  (t.docIds||[]).forEach(d=>{if(!C.docIds.includes(d))C.docIds.push(d)});
  render();
}
async function sendCompose(){
  const C=S.compose;if(!C||C.sending)return;
  if(!C.to.trim())return toast('Add who it’s going to');
  if(!C.subject.trim())return toast('Add a subject');
  if(!C.body.trim())return toast('Write a message');
  if(/\{(\w+)\}/.test(C.subject+C.body)){const m=(C.subject+C.body).match(/\{(\w+)\}/);if(FILLINS.includes(m[1]))return toast('Fill in '+m[0]+' before sending');}
  C.sending=true;render();
  try{
    const {data:{session}}=await sb.auth.getSession();
    const me=(S.config.staff||[]).find(n=>S.email&&S.email.toLowerCase().startsWith(n.toLowerCase()))||'';
    const r=await fetch(MEMBERSHIPS()+'/api/events-email/compose',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(session&&session.access_token||'')},
      body:JSON.stringify({eventId:C.eventId,to:C.to,cc:C.cc,subject:C.subject,text:C.body,docIds:C.docIds,replyTo:C.replyTo,senderName:me||S.email})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||('Error '+r.status));
    const ev=S.events.get(C.eventId);
    if(ev)mutate(ev.id,()=>{},`Emailed ${C.to}: ${C.subject}${C.docIds.length?` (${C.docIds.length} attachment${C.docIds.length>1?'s':''})`:''}`);
    S.compose=null;toast('Email sent');loadEventEmails(C.eventId,true);
  }catch(e){C.sending=false;toast('Not sent: '+e.message);render();}
}
function fmtSize(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B'}
function gmailLink(threadId){const em=MAIL.info&&MAIL.info.email;return threadId?`https://mail.google.com/mail/u/${encodeURIComponent(em||'0')}/#all/${encodeURIComponent(threadId)}`:''}

function threadsOf(list){
  const by=new Map();
  (list||[]).forEach(m=>{const k=m.thread_id||('solo-'+m.id);if(!by.has(k))by.set(k,[]);by.get(k).push(m);});
  return [...by.entries()].map(([key,thread])=>({key,thread})).sort((a,b)=>b.thread[b.thread.length-1].created_at.localeCompare(a.thread[a.thread.length-1].created_at));
}
function composerHtml(ev){
  const C=S.compose;const tpls=S.config.emailTemplates||[];const docs=MAIL.docs;const ro=C.sending?'disabled':'';
  const picked=(docs||[]).filter(d=>C.docIds.includes(d.id));const total=picked.reduce((a,d)=>a+Number(d.size||0),0);
  return `<div class="panel compose" style="margin-bottom:16px"><div class="row between" style="margin-bottom:10px"><h3>${C.replyTo?'Reply':'New email'}</h3>
    <label class="row" style="gap:6px;font-size:13px" for="mc-tpl">Template <select id="mc-tpl" data-mc-tpl style="width:auto" ${ro}><option value="">Choose…</option>${tpls.map(t=>`<option value="${esc(t.id)}" ${C.tpl===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label></div>
    <div class="fields">
      <div class="f wide"><label for="mc-to">To</label><input id="mc-to" type="text" data-mc="to" value="${esc(C.to)}" placeholder="client@example.com" ${ro}></div>
      <div class="f wide"><label for="mc-cc">CC (optional)</label><input id="mc-cc" type="text" data-mc="cc" value="${esc(C.cc)}" ${ro}></div>
      <div class="f wide"><label for="mc-subject">Subject</label><input id="mc-subject" type="text" data-mc="subject" value="${esc(C.subject)}" ${ro}></div>
      <div class="f wide"><label for="mc-body">Message</label><textarea id="mc-body" data-mc="body" style="min-height:240px" ${ro}>${esc(C.body)}</textarea></div>
    </div>
    <div style="margin-top:10px"><div class="lbl" style="margin-bottom:6px">Attach from the document library ${picked.length?`<span class="muted">· ${picked.length} selected, ${fmtSize(total)}</span>`:''}</div>
      ${docs===null?'<p class="muted">Loading documents…</p>':docs.length?`<div class="doc-pick">${docs.map(d=>`<label class="check" for="mc-doc-${esc(d.id)}"><input type="checkbox" id="mc-doc-${esc(d.id)}" data-mc-doc="${esc(d.id)}" ${C.docIds.includes(d.id)?'checked':''} ${ro}> ${esc(d.name)} <span class="muted">${fmtSize(d.size)}</span></label>`).join('')}</div>`
        :`<p class="muted" style="margin:0">No documents yet. Add menus, floor plans and policies on the <a href="#library">Templates &amp; docs</a> page.</p>`}
      ${total>24*1048576?'<p class="flag warn">Attachments are over 24 MB together. Gmail will refuse this.</p>':''}</div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="mc-send" ${ro}>${C.sending?'Sending…':'Send'}</button><button class="btn" data-act="mc-cancel" ${ro}>Cancel</button>
      <span class="muted" style="font-size:12px">Sends from ${esc((MAIL.info&&MAIL.info.email)||(S.mailStatus&&S.mailStatus.from)||'the connected Gmail account')}${MAIL.info&&MAIL.info.email?'':''}</span></div></div>`;
}
function tabEmails(ev){
  loadEventEmails(ev.id);loadMailInfo();markMailSeen(ev.id);
  const list=MAIL.byEvent.get(ev.id);const info=MAIL.info;
  const c=ev.client||{};
  let note='';
  if(info&&!info.error&&!info.connected)note=`<div class="banner warn">No Gmail account is connected yet. Connect one in <a href="#settings">Settings → New-lead emails</a> to send from here.</div>`;
  else if(info&&info.connected&&!info.canRead)note=`<div class="banner warn">Emails send from ${esc(info.email)}, but replies won’t show here until Gmail is reconnected with permission to read replies. In <a href="#settings">Settings</a>, click <b>Connect a different account</b> and approve again${S.email&&info.email&&S.email.toLowerCase()!==info.email?` (signed in as ${esc(info.email)})`:''}.</div>`;
  const composing=S.compose&&S.compose.eventId===ev.id;
  const threads=threadsOf(list);
  return `${note}
  ${composing&&!S.compose.replyTo?composerHtml(ev):`<div class="row between" style="margin-bottom:12px"><span class="muted">${c.email?`Client: ${esc(c.name||'')} &lt;${esc(c.email)}&gt;`:'No client email on this event yet (add it on Details).'}</span>
    <button class="btn primary" data-act="mc-new" ${S.readOnly?'disabled':''}>New email</button></div>`}
  ${list===undefined||list===null?'<p class="muted">Loading emails…</p>':threads.length?threads.map(({key,thread})=>{
    const last=thread[thread.length-1];const tid=last.thread_id;
    return `<div class="panel thread" style="margin-bottom:14px"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">${esc(thread[0].subject||'(no subject)')}</h3>
      <span class="muted" style="font-size:12px">${thread.length} message${thread.length>1?'s':''}${tid&&info&&info.email?` · <a href="${esc(gmailLink(tid))}" target="_blank" rel="noopener">Open in Gmail</a>`:''}</span></div>
      ${thread.map(m=>`<div class="msg ${m.direction}"><div class="row between"><div><b>${m.direction==='in'?esc(nameOf(m.from_addr)||'Client'):esc(m.sent_by_name||'Bandstand')}</b> <span class="muted">${m.direction==='in'?'replied':'to '+esc(m.to_addr||'')}${m.cc?' · cc '+esc(m.cc):''}</span></div><span class="muted" style="font-size:12px">${esc(fmtTS(m.created_at))}</span></div>
        <div class="msg-body">${esc(m.body||'')}</div>
        ${(m.attachments||[]).length?`<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${m.attachments.map(a=>`<span class="chip">📎 ${esc(a.name)}${a.size?` · ${fmtSize(a.size)}`:''}</span>`).join('')}</div>`:''}</div>`).join('')}
      ${composing&&S.compose.threadKey===key?composerHtml(ev):`<div class="row" style="margin-top:10px"><button class="btn sm" data-act="mc-reply" data-key="${esc(key)}" ${S.readOnly?'disabled':''}>Reply</button></div>`}
    </div>`;}).join(''):`<div class="empty" style="padding:28px">No emails yet. ${c.email?'Start one with <b>New email</b>; templates can fill in the details for you.':''}</div>`}`;
}

/* ---------- Templates & docs page ---------- */
function renderLibrary(){
  loadDocs();
  const d=S.draft||(S.draft=clone(S.config));const ro=S.readOnly?'disabled':'';
  d.emailTemplates=d.emailTemplates||[];
  const dirty=JSON.stringify(d)!==JSON.stringify(S.config);
  const docs=MAIL.docs;
  return `<div class="page-head"><div><h1>Templates &amp; docs</h1><p>Email templates for writing to clients, and the shared library of files you attach (menus, floor plans, policies).</p></div>
    <div class="row">${dirty?'<span class="flag warn">Unsaved changes</span>':''}<button class="btn" data-act="settings-discard" ${dirty?'':'disabled'}>Discard</button><button class="btn primary" data-act="settings-save" ${dirty&&!S.readOnly?'':'disabled'}>Save templates</button></div></div>
  <div class="panel" style="margin-bottom:16px"><div class="row between" style="margin-bottom:6px"><h3>Email templates</h3><button class="btn sm" data-act="tpl-add" ${ro}>Add template</button></div>
    <p class="muted" style="margin-top:0;font-size:13px">Fill-ins are replaced with the event’s details when you pick the template: ${FILLINS.map(f=>`<code>{${f}}</code>`).join(' ')}</p>
    ${d.emailTemplates.length?d.emailTemplates.map((t,i)=>`<div class="tpl-card"><div class="fields">
      <div class="f"><label for="tpl-${i}-name">Template name</label><input id="tpl-${i}-name" data-sbind="emailTemplates.${i}.name" value="${esc(t.name||'')}" ${ro}></div>
      <div class="f wide"><label for="tpl-${i}-subject">Subject</label><input id="tpl-${i}-subject" data-sbind="emailTemplates.${i}.subject" value="${esc(t.subject||'')}" ${ro}></div>
      <div class="f wide"><label for="tpl-${i}-body">Message</label><textarea id="tpl-${i}-body" data-sbind="emailTemplates.${i}.body" style="min-height:170px" ${ro}>${esc(t.body||'')}</textarea></div>
      ${docs&&docs.length?`<div class="f wide"><span class="lbl">Attach automatically</span><div class="doc-pick">${docs.map(doc=>`<label class="check" for="tpl-${i}-doc-${esc(doc.id)}"><input type="checkbox" id="tpl-${i}-doc-${esc(doc.id)}" data-tpl-doc="${i}" value="${esc(doc.id)}" ${(t.docIds||[]).includes(doc.id)?'checked':''} ${ro}> ${esc(doc.name)}</label>`).join('')}</div></div>`:''}
    </div><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm danger" data-act="tpl-del" data-i="${i}" ${ro}>${S.tplDelArm===i?'Click again to delete':'Delete template'}</button></div></div>`).join(''):'<p class="muted">No templates yet.</p>'}
  </div>
  <div class="panel"><div class="row between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><h3>Document library</h3>
    <label class="btn sm ${S.docUploading?'disabled':''}" for="doc-upload">${S.docUploading?'Uploading…':'Upload files'}<input type="file" id="doc-upload" data-doc-upload multiple hidden ${ro||S.docUploading?'disabled':''}></label></div>
    <p class="muted" style="margin-top:0;font-size:13px">Up to 20 MB per file. Attach these to any email from an event’s Emails tab; together, attachments can be up to 24 MB per email.</p>
    ${docs===null?'<p class="muted">Loading…</p>':docs.length?`<div class="tbl-wrap"><table><thead><tr><th>Name</th><th class="num">Size</th><th>Added</th><th></th></tr></thead><tbody>
      ${docs.map(doc=>`<tr><td><b>${esc(doc.name)}</b></td><td class="num">${fmtSize(doc.size)}</td><td class="muted">${esc(fmtShort(String(doc.created_at).slice(0,10)))}</td>
        <td class="num" style="white-space:nowrap"><button class="btn sm" data-act="doc-open" data-id="${esc(doc.id)}">Open</button> <button class="btn sm danger" data-act="doc-del" data-id="${esc(doc.id)}" ${ro}>${S.docDelArm===doc.id?'Click again to delete':'Delete'}</button></td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty" style="padding:24px">No documents yet. Upload your event menu, packages PDF or floor plan to get started.</div>'}
  </div>`;
}
async function uploadDocs(files){
  if(!files||!files.length)return;
  S.docUploading=true;render();let ok=0;
  for(const f of files){
    if(f.size>20*1048576){toast(f.name+' is over 20 MB');continue;}
    const safe=f.name.replace(/[^\w.\- ()]+/g,'_').slice(-120)||'file';
    const path=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36))+'/'+safe;
    const up=await sb.storage.from('event-docs').upload(path,f,{contentType:f.type||'application/octet-stream',upsert:false});
    if(up.error){toast('Couldn’t upload '+f.name+': '+up.error.message);continue;}
    const ins=await sb.from('private_event_documents').insert({name:f.name,path,size:f.size,mime:f.type||'application/octet-stream'});
    if(ins.error){await sb.storage.from('event-docs').remove([path]);toast('Couldn’t save '+f.name+': '+ins.error.message);continue;}
    ok++;
  }
  S.docUploading=false;if(ok)toast(ok===1?'File added':ok+' files added');loadDocs(true);
}
async function openDoc(id){
  const d=(MAIL.docs||[]).find(x=>x.id===id);if(!d)return;
  const w=window.open('about:blank','_blank');
  const {data,error}=await sb.storage.from('event-docs').createSignedUrl(d.path,300);
  if(error||!data){if(w)w.close();return toast('Couldn’t open: '+(error&&error.message||''));}
  if(w)w.location.href=data.signedUrl;else location.href=data.signedUrl;
}
async function deleteDoc(id){
  const d=(MAIL.docs||[]).find(x=>x.id===id);if(!d)return;
  if(S.docDelArm!==id){S.docDelArm=id;render();return;}
  S.docDelArm=null;
  const del=await sb.from('private_event_documents').delete().eq('id',id);
  if(del.error)return toast('Couldn’t delete: '+del.error.message);
  await sb.storage.from('event-docs').remove([d.path]);
  toast('Deleted '+d.name);loadDocs(true);
}

/* ---------- actions & inputs ---------- */
function mailAct(act,el,ev){
  switch(act){
    case 'mc-new':if(ev)startCompose(ev,null);return true;
    case 'mc-reply':{if(!ev)return true;const th=threadsOf(MAIL.byEvent.get(ev.id)).find(t=>t.key===el.dataset.key);if(th)startCompose(ev,th);return true;}
    case 'mc-cancel':S.compose=null;render();return true;
    case 'mc-send':sendCompose();return true;
    case 'mail-alert-open':openEmails(el.dataset.id);return true;
    case 'mail-alert-close':S.mailAlert=null;render();return true;
    case 'tpl-add':S.draft.emailTemplates=S.draft.emailTemplates||[];S.draft.emailTemplates.push({id:'t'+Date.now().toString(36),name:'New template',subject:'',body:'Hi {first_name},\n\n\n\nCheers,\n{event_manager}\nBandstand Brew Works',docIds:[]});render();return true;
    case 'tpl-del':{const i=+el.dataset.i;if(S.tplDelArm!==i){S.tplDelArm=i;render();return true;}S.tplDelArm=null;S.draft.emailTemplates.splice(i,1);render();return true;}
    case 'doc-open':openDoc(el.dataset.id);return true;
    case 'doc-del':deleteDoc(el.dataset.id);return true;
  }
  return false;
}
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.mc&&S.compose)S.compose[t.dataset.mc]=t.value;});
document.addEventListener('change',e=>{
  const t=e.target;if(!t.dataset)return;
  if(t.hasAttribute('data-mc-tpl')){applyTemplate(t.value);return;}
  if(t.dataset.mcDoc&&S.compose){const id=t.dataset.mcDoc;S.compose.docIds=t.checked?[...new Set([...S.compose.docIds,id])]:S.compose.docIds.filter(x=>x!==id);render();return;}
  if(t.dataset.tplDoc!==undefined&&S.draft){const tp=S.draft.emailTemplates[+t.dataset.tplDoc];tp.docIds=tp.docIds||[];tp.docIds=t.checked?[...new Set([...tp.docIds,t.value])]:tp.docIds.filter(x=>x!==t.value);render();return;}
  if(t.hasAttribute('data-doc-upload')&&t.files){uploadDocs([...t.files]);t.value='';return;}
});
