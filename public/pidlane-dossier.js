// ══════════════════════════════════════════════════════════════════
// pidlane-dossier.js
// Export voertuigdossier
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// IDEE 8 — VOERTUIGDOSSIER EXPORT (volledig PDF)
// Bundelt alle opgeslagen sessies, trends per PID, DTC en de huidige
// momentopname tot één PDF — ideaal bij verkoop of garage-overdracht.
// ══════════════════════════════════════════════════════
async function exportVehicleDossier(btn){
  const vin=vehicleInfo?.vin;
  const sessions=loadSessions(vin);
  if(!sessions.length && !activePIDs.size){
    showToast?.('Nog geen sessiegeschiedenis — rijd eerst een sessie of verbind een voertuig'); return;
  }
  const orig=btn?btn.textContent:''; if(btn){btn.textContent='⏳ PDF maken...'; btn.disabled=true;}
  try{
    const jsPDF=await loadJsPDF(); if(!jsPDF) throw new Error('jsPDF niet geladen');
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const W=210,M=15,CW=W-2*M, PU=[124,58,237],DARK=[26,32,44],GREY=[113,128,150],LIGHT=[237,242,247];
    let y=0;
    const clean=t=>String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2100}-\u{214F}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,'').replace(/\*\*/g,'').trim();
    const pageBreak=need=>{ if(y+need>278){ doc.addPage(); y=M+5; } };

    // Kop
    doc.setFillColor(...PU); doc.rect(0,0,W,30,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.text('PidLane',M,13);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('Voertuigdossier',M,19);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('VOERTUIGDOSSIER',W-M,13,{align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(new Date().toLocaleString('nl-NL'),W-M,19,{align:'right'});
    y=38;

    // Voertuigblok
    const kent=localStorage.getItem('pl_kenteken')||'';
    const meta=[
      ['Voertuig',`${vehicleInfo.merk||'?'} ${vehicleInfo.model||''} ${vehicleInfo.year?'('+vehicleInfo.year+')':''}`.trim()],
      kent?['Kenteken',kent]:null, vin?['VIN',vin]:null,
      ['Sessies in dossier',String(sessions.length)],
    ].filter(Boolean);
    doc.setFillColor(...LIGHT); doc.roundedRect(M,y,CW,8+meta.length*6,2,2,'F');
    let my=y+7;
    meta.forEach(([k,v])=>{ doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...GREY); doc.text(k.toUpperCase(),M+5,my);
      doc.setFont('helvetica','normal'); doc.setTextColor(...DARK); doc.text(clean(v),M+55,my); my+=6; });
    y=my+8;

    // Trendanalyse per PID over de sessies (idee 2/3)
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...PU); doc.text('Trends over sessies',M,y); y+=2;
    doc.setDrawColor(...PU); doc.line(M,y,M+45,y); y+=6;
    // Verzamel alle PIDs die in sessies voorkomen
    const allPids=new Set(); sessions.forEach(s=>Object.keys(s.stats||{}).forEach(p=>allPids.add(p)));
    if(!allPids.size){
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...GREY);
      doc.text('Nog te weinig sessiegeschiedenis voor trends.',M,y); y+=8;
    } else {
      doc.setFontSize(9);
      [...allPids].forEach(pid=>{
        const d=getPidDef(pid); const avgs=sessions.map(s=>s.stats?.[pid]?.avg).filter(v=>typeof v==='number');
        if(avgs.length<2) return;
        const first=avgs[0], last=avgs[avgs.length-1];
        const trend=last>first*1.05?'stijgend':last<first*0.95?'dalend':'stabiel';
        pageBreak(6);
        doc.setFont('helvetica','bold'); doc.setTextColor(...DARK); doc.text(clean(d?.name||pid),M,y);
        doc.setFont('helvetica','normal'); doc.setTextColor(...GREY);
        doc.text(`${fv(first)} → ${fv(last)} ${d?.unit||''}  (${trend}, ${avgs.length} sessies)`,M+70,y);
        y+=5.5;
      });
      y+=3;
    }

    // Huidige DTC
    pageBreak(16);
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...PU); doc.text('Foutcodes (huidig)',M,y); y+=2;
    doc.setDrawColor(...PU); doc.line(M,y,M+45,y); y+=6;
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...DARK);
    if(dtcCodes.length){ dtcCodes.forEach(c=>{ const i=dtcInfo(c); pageBreak(6); doc.text(`${c} — ${clean(i?.desc||'onbekend')}`,M,y); y+=5.5; }); }
    else { doc.setTextColor(...GREY); doc.text('Geen actieve foutcodes.',M,y); y+=6; }
    y+=2;

    // Momentopname
    const snap=[...activePIDs].filter(isReportableSensor).map(pid=>{ const d=getPidDef(pid), v=pidVals[pid];
      return [clean(d.name),`${fv(v)} ${d.unit||''}`]; });
    if(snap.length){
      pageBreak(16);
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...PU); doc.text('Momentopname sensoren',M,y); y+=2;
      doc.setDrawColor(...PU); doc.line(M,y,M+45,y); y+=6; doc.setFontSize(9);
      const colW=CW/2;
      snap.forEach((row,i)=>{ const col=i%2,x=M+col*colW; if(col===0) pageBreak(6);
        doc.setFont('helvetica','normal'); doc.setTextColor(...GREY); doc.text(row[0],x,y);
        doc.setFont('helvetica','bold'); doc.setTextColor(...DARK); doc.text(row[1],x+colW-6,y,{align:'right'});
        if(col===1||i===snap.length-1) y+=5.5; });
    }

    // Footer
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(...LIGHT); doc.line(M,285,W-M,285);
      doc.setFontSize(8); doc.setTextColor(...GREY); doc.setFont('helvetica','normal');
      doc.text(`PidLane voertuigdossier — ${new Date().toLocaleString('nl-NL')}`,M,290);
      doc.text(`Pagina ${i} van ${n}`,W-M,290,{align:'right'}); }

    const fname=`PidLane-voertuigdossier-${(kent||vin||'auto')}-${new Date().toISOString().slice(0,10)}.pdf`;
    window._lastPdf={blob:doc.output('blob'), fname};
    try{ registerSessionReport({type:'pdf', title:fname, text:'', blob:window._lastPdf.blob, fname}); }catch(e){}
    showPdfReadyModal();
  }catch(e){
    log('Dossier PDF fout: '+e.message,'err');
    showToast?.('Dossier-PDF mislukt: '+e.message);
  }finally{ if(btn){btn.textContent=orig; btn.disabled=false;} }
}

// IDEE 7 (achtergrond-monitoring met drempel-alerts) — VERWIJDERD 21-07-2026.
// Dubbelop met de 🛡️ Rit-monitor (deur 1, pidlane-monitor.js + watchers).
