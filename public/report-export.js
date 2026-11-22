// Report export: turns a report description into a styled Excel workbook or a PDF.
// Shared by the Bandstand Events and Bandstand Distribution apps.
//
// report = {
//   title, subtitle, org, accent:'#1f6b4f', logoUrl, fileName,
//   kpis:[{label, value}],                       // value already formatted for display
//   sections:[{ title, note,
//     columns:[{key, label, type:'text'|'money'|'int'|'num'|'pct'|'date'}],
//     rows:[{key:value}],                         // raw values: numbers for money/int/num, 0..1 for pct, 'YYYY-MM-DD' for date
//     totals:{key:value} }]                       // optional totals row
// }
function makeReportExporter(libs){
  const hex=c=>String(c||'#333333').replace('#','').toUpperCase();
  const rgb=c=>{const h=hex(c);return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};
  const isDate=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''));
  const toDate=v=>{const [y,m,d]=String(v).slice(0,10).split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
  const money=n=>(Number(n)<0?'-':'')+'$'+Math.abs(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const shortDate=v=>isDate(v)?toDate(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):String(v??'');
  function display(v,type){
    if(v===null||v===undefined||v==='')return '';
    if(type==='money')return money(v);
    if(type==='int')return Math.round(Number(v)||0).toLocaleString('en-US');
    if(type==='num')return (Number(v)||0).toLocaleString('en-US',{maximumFractionDigits:2});
    if(type==='pct')return Math.round((Number(v)||0)*1000)/10+'%';
    if(type==='date')return shortDate(v);
    return String(v);
  }
  const numeric=t=>['money','int','num','pct'].includes(t);
  const safeName=s=>String(s||'report').replace(/[^\w\- ]+/g,'').replace(/\s+/g,'-').toLowerCase().slice(0,80)||'report';
  function sheetName(title,used){
    let base=String(title||'Sheet').replace(/[\[\]:*?\/\\]/g,' ').trim().slice(0,31)||'Sheet',n=base,i=2;
    while(used.has(n.toLowerCase())){const suf=` (${i++})`;n=base.slice(0,31-suf.length)+suf}
    used.add(n.toLowerCase());return n;
  }
  function download(blob,name){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  }
  async function logoPng(url){
    if(!url)return null;
    try{
      const img=await new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url});
      const c=document.createElement('canvas'),s=240;c.width=s;c.height=Math.round(s*img.height/img.width)||s;
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);return {data:c.toDataURL('image/png'),w:c.width,h:c.height};
    }catch(e){return null}
  }
  const generatedAt=()=>new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

  async function toExcel(report,{sections}={}){
    const ExcelJS=await libs.excel();
    const list=sections||report.sections;
    const wb=new ExcelJS.Workbook();wb.creator=report.org||'Bandstand Brew Works';wb.created=new Date();
    const accent='FF'+hex(report.accent),used=new Set();
    const head=(ws,cols)=>{
      ws.getCell('A1').value=report.title;ws.getCell('A1').font={bold:true,size:16,color:{argb:accent}};
      ws.getCell('A2').value=[report.subtitle,`Generated ${generatedAt()}`].filter(Boolean).join(' · ');ws.getCell('A2').font={italic:true,color:{argb:'FF666666'}};
      if(cols>1){ws.mergeCells(1,1,1,Math.max(cols,4));ws.mergeCells(2,1,2,Math.max(cols,4))}
    };
    if(report.kpis?.length&&!sections){
      const ws=wb.addWorksheet(sheetName('Summary',used),{views:[{showGridLines:false}]});
      head(ws,2);
      ws.getRow(4).values=['Measure','Value'];
      ws.getRow(4).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:accent}}});
      report.kpis.forEach((k,i)=>{const r=ws.getRow(5+i);r.values=[k.label,k.value];r.getCell(2).alignment={horizontal:'right'}});
      ws.getColumn(1).width=34;ws.getColumn(2).width=22;
    }
    for(const sec of list){
      const ws=wb.addWorksheet(sheetName(sec.title,used),{views:[{state:'frozen',ySplit:sec.note?5:4}]});
      const cols=sec.columns;head(ws,cols.length);
      let r=3;
      if(sec.note){ws.getCell(`A${r}`).value=sec.note;ws.getCell(`A${r}`).font={color:{argb:'FF666666'}};r++}
      r++;const headerRow=r;
      ws.getRow(r).values=cols.map(c=>c.label);
      ws.getRow(r).eachCell((c,i)=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:accent}};c.alignment={vertical:'middle',horizontal:numeric(cols[i-1].type)?'right':'left',wrapText:true}});
      ws.getRow(r).height=20;
      const fmt={money:'$#,##0.00;[Red]-$#,##0.00',int:'#,##0',num:'#,##0.##',pct:'0.0%',date:'mmm d, yyyy'};
      const cellVal=(v,t)=>{if(v===null||v===undefined||v==='')return null;if(t==='date')return isDate(v)?toDate(v):String(v);if(numeric(t)){const n=Number(v);return Number.isFinite(n)?n:null}return String(v)};
      for(const row of sec.rows){r++;const xr=ws.getRow(r);xr.values=cols.map(c=>cellVal(row[c.key],c.type));cols.forEach((c,i)=>{if(fmt[c.type])xr.getCell(i+1).numFmt=fmt[c.type]});if((r-headerRow)%2===0)xr.eachCell({includeEmpty:true},c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF6F4EF'}}})}
      if(!sec.rows.length){r++;ws.getCell(`A${r}`).value='No data for this period.';ws.getCell(`A${r}`).font={italic:true,color:{argb:'FF888888'}}}
      else if(sec.totals){r++;const xr=ws.getRow(r);xr.values=cols.map((c,i)=>i===0&&sec.totals[c.key]==null?'Total':cellVal(sec.totals[c.key],c.type));cols.forEach((c,i)=>{if(fmt[c.type])xr.getCell(i+1).numFmt=fmt[c.type]});xr.eachCell({includeEmpty:true},c=>{c.font={bold:true};c.border={top:{style:'thin',color:{argb:'FF333333'}}}})}
      if(sec.rows.length)ws.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow+sec.rows.length,column:cols.length}};
      cols.forEach((c,i)=>{const lens=[c.label,...sec.rows.slice(0,500).map(x=>display(x[c.key],c.type))].map(s=>String(s).length);ws.getColumn(i+1).width=Math.min(48,Math.max(c.type==='date'?13:10,...lens)+2)});
    }
    const buf=await wb.xlsx.writeBuffer();
    download(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${safeName(report.fileName||report.title)}.xlsx`);
  }

  async function toPdf(report,{sections}={}){
    const {jsPDF,autoTable}=await libs.pdf();
    const list=sections||report.sections;
    const wide=list.some(s=>s.columns.length>6);
    const doc=new jsPDF({orientation:wide?'landscape':'portrait',unit:'pt',format:'letter'});
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=40,accent=rgb(report.accent);
    const logo=await logoPng(report.logoUrl);
    let y=M;
    if(logo){const h=52,w=h*logo.w/logo.h;doc.addImage(logo.data,'PNG',W-M-w,y-6,w,h)}
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(120);doc.text(String(report.org||'Bandstand Brew Works').toUpperCase(),M,y+4);
    doc.setFontSize(20);doc.setTextColor(30);doc.text(String(report.title),M,y+28);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(100);
    doc.text([report.subtitle,`Generated ${generatedAt()}`].filter(Boolean).join('  ·  '),M,y+46);
    doc.setDrawColor(...accent);doc.setLineWidth(2);doc.line(M,y+58,W-M,y+58);
    y+=78;
    if(report.kpis?.length&&!sections){
      const per=wide?6:4,bw=(W-2*M-(per-1)*8)/per,bh=44;
      report.kpis.forEach((k,i)=>{
        const cx=M+(i%per)*(bw+8),cy=y+Math.floor(i/per)*(bh+8);
        doc.setFillColor(246,244,239);doc.roundedRect(cx,cy,bw,bh,4,4,'F');
        doc.setFontSize(7.5);doc.setTextColor(110);doc.text(String(k.label).toUpperCase(),cx+8,cy+14,{maxWidth:bw-16});
        doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(30);doc.text(String(k.value),cx+8,cy+34,{maxWidth:bw-16});doc.setFont('helvetica','normal');
      });
      y+=Math.ceil(report.kpis.length/per)*(bh+8)+10;
    }
    for(const sec of list){
      if(y>H-120){doc.addPage();y=M}
      doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(30);doc.text(String(sec.title),M,y+10);y+=16;
      if(sec.note){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(110);const lines=doc.splitTextToSize(String(sec.note),W-2*M);doc.text(lines,M,y+8);y+=lines.length*11+2}
      const cols=sec.columns;
      const body=sec.rows.length?sec.rows.map(r=>cols.map(c=>display(r[c.key],c.type))):[[{content:'No data for this period.',colSpan:cols.length,styles:{fontStyle:'italic',textColor:140}}]];
      const foot=sec.rows.length&&sec.totals?[cols.map((c,i)=>i===0&&sec.totals[c.key]==null?'Total':display(sec.totals[c.key],c.type))]:undefined;
      autoTable(doc,{startY:y+4,head:[cols.map(c=>c.label)],body,foot,showFoot:'lastPage',margin:{left:M,right:M,bottom:44},
        styles:{fontSize:8.5,cellPadding:4,overflow:'linebreak',textColor:30},
        headStyles:{fillColor:accent,textColor:255,fontStyle:'bold'},footStyles:{fillColor:[236,232,223],textColor:20,fontStyle:'bold'},
        alternateRowStyles:{fillColor:[248,246,242]},
        columnStyles:Object.fromEntries(cols.map((c,i)=>[i,numeric(c.type)?{halign:'right'}:c.type==='date'?{minCellWidth:64}:{}])),
        didParseCell:d=>{if((d.section==='head'||d.section==='foot')&&numeric(cols[d.column.index]?.type))d.cell.styles.halign='right'}});
      y=doc.lastAutoTable.finalY+22;
    }
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(140);doc.text(`${report.org||'Bandstand Brew Works'} · ${report.title}`,M,H-20);doc.text(`Page ${i} of ${n}`,W-M,H-20,{align:'right'})}
    download(doc.output('blob'),`${safeName(report.fileName||report.title)}.pdf`);
  }
  return {toExcel,toPdf,display};
}

// Events app: libraries live in /vendor and load the first time someone downloads a report.
const loadScriptOnce=(()=>{const seen={};return src=>seen[src]||(seen[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>{delete seen[src];rej(new Error('Could not load '+src))};document.head.appendChild(s)}))})();
window.ReportExport=makeReportExporter({
  excel:async()=>{await loadScriptOnce('/vendor/exceljs.min.js');return window.ExcelJS},
  pdf:async()=>{await loadScriptOnce('/vendor/jspdf.umd.min.js');await loadScriptOnce('/vendor/jspdf.plugin.autotable.min.js');
    const at=window.jspdf_autotable||{};const fn=at.autoTable||at.default||((doc,o)=>doc.autoTable(o));return {jsPDF:window.jspdf.jsPDF,autoTable:fn}}
});
