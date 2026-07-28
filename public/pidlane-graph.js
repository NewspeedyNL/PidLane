// ══════════════════════════════════════════════════════════════════
// pidlane-graph.js
// Grafieken: multi-line groepstrends
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// GRAPH — MULTI-LINE GROEPSTRENDS
// ════════════════════════════════════════

const TREND_GROUPS={
  fuel:{ name:'Brandstof', icon:'⛽', pids:['0106','0107','0110','015E','012F','010A'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  power:{ name:'Vermogen', icon:'⚡', pids:['010C','0104','0111','010B','010E','0149'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  accu:{ name:'Accu', icon:'🔋', pids:['0142','0104','010C','015B'], colors:['#1a6fff','#f77f00','#00a86b','#7c3aed'] },
  temp:{ name:'Temperatuur', icon:'🌡️', pids:['0105','015C','010F','0146'], colors:['#e53e3e','#f77f00','#1a6fff','#00a86b'] },
};

// HUD presets — gedeelde bron met de trendgroepen hierboven.
// center = grote centrale wijzerplaat, corners = de 4 hoekmeters.
// Zo gebruiken de meters exact dezelfde PID-verzamelingen als de trends.
const HUD_PRESETS={
  rijden:   { name:'Rijden',     center:'010D', corners:['0142','010C','0105','0111'] }, // snelheid + accu/toeren/temp/gasklep
  vermogen: { name:'Vermogen',   center:'010C', corners:TREND_GROUPS.power.pids.slice(0,4) },
  brandstof:{ name:'Brandstof',  center:'010C', corners:TREND_GROUPS.fuel.pids.slice(0,4) },
  accu:     { name:'Accu',       center:'0142', corners:TREND_GROUPS.accu.pids.slice(0,4) },
  temp:     { name:'Temperatuur',center:'0105', corners:TREND_GROUPS.temp.pids.slice(0,4) },
};
let hudPreset='rijden';
let hudCorners=[...HUD_PRESETS.rijden.corners]; // door gebruiker per hoek aanpasbaar
let hudCenter=HUD_PRESETS.rijden.center;

let activeTrendGroup=null, trendPIDs=[];

function selectTrendGroup(group){
  document.querySelectorAll('.trend-group-btn').forEach(b=>b.classList.remove('active'));
  if(group==='none'||group===activeTrendGroup){
    activeTrendGroup=null; trendPIDs=[];
    const btn=document.getElementById('dashBtn'); if(btn) btn.disabled=true;
    updateTrendChips(); drawGraph(); return;
  }
  activeTrendGroup=group;
  const grp=TREND_GROUPS[group];
  // Sensoren van deze grafiekgroep automatisch aanzetten — grafiek vult
  // zichzelf zodra de data binnenkomt
  ensurePIDListActive(grp.pids).then(()=>{
    if(activeTrendGroup===group){
      trendPIDs=grp.pids.filter(pid=>pidHist[pid]?.length||discoveredPIDDefs.find(d=>d.pid===pid));
      updateTrendChips(); drawGraph();
    }
  });
  trendPIDs=grp.pids.filter(pid=>pidHist[pid]?.length||discoveredPIDDefs.find(d=>d.pid===pid));
  document.getElementById('gsel').value=''; graphPID=null;
  const idx={fuel:0,power:1,accu:2,temp:3}[group];
  document.querySelectorAll('.trend-group-btn')[idx]?.classList.add('active');
  const btn=document.getElementById('dashBtn'); if(btn) btn.disabled=false;
  updateTrendChips(); drawGraph();
  log(`Groepstrend: ${grp.name}`,'info');
}

function updateTrendChips(){
  const el=document.getElementById('activeTrendPIDs'); el.innerHTML='';
  if(!trendPIDs.length) return;
  const grp=activeTrendGroup?TREND_GROUPS[activeTrendGroup]:null;
  trendPIDs.forEach((pid,i)=>{
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const color=grp?grp.colors[i%grp.colors.length]:'#1a6fff';
    const ok=isPIDOk(pid);
    const chip=document.createElement('div'); chip.className='trend-pid-chip';
    chip.style.cssText=`background:${ok?color+'22':'#e53e3e22'};border:1px solid ${ok?color:'#e53e3e'};color:${ok?color:'#e53e3e'}`;
    chip.innerHTML=`<span style="width:7px;height:7px;border-radius:50%;background:${ok?color:'#e53e3e'};flex-shrink:0"></span>${def?.name||pid}${def?.unit?' ('+def.unit+')':''}${!ok?' ⚠':''}`;
    el.appendChild(chip);
  });
}

function isPIDOk(pid){
  // Fix 19-07: één bron van waarheid — deze functie toetst simpelweg de
  // actuele waarde via isPIDOkVal(), zodat de drempellogica (FIX C: centrale
  // getPidDef, dekt 0164+ en de klassieke PIDS-lijst) maar op één plek staat.
  const val=pidVals[pid]; if(val===undefined) return true;
  return (typeof isPIDOkVal==='function') ? isPIDOkVal(pid,val) : true;
}

function rebuildGSel(){
  const sel=document.getElementById('gsel'); const cur=sel.value;
  sel.innerHTML='<option value="">— Of kies individuele sensor —</option>';
  const source=discoveredPIDDefs.length>0?discoveredPIDDefs:PIDS;
  source.forEach(p=>{
    const o=document.createElement('option');
    o.value=p.pid; o.textContent=p.name+(p.unit?' ('+p.unit+')':'');
    if(p.pid===cur) o.selected=true; sel.appendChild(o);
  });
  graphPID=(cur&&source.find(d=>d.pid===cur))?cur:null;
}

function changeGraph(v){
  graphPID=v||null;
  if(v){
    activeTrendGroup=null; trendPIDs=[]; document.querySelectorAll('.trend-group-btn').forEach(b=>b.classList.remove('active')); updateTrendChips();
    // Gekozen sensor automatisch aanzetten zodat de grafiek data krijgt
    ensurePIDListActive([v]).then(()=>{ if(graphPID===v) drawGraph(); });
  }
  drawGraph();
}

function drawGraph(){
  const canvas=document.getElementById('graphCanvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||560, H=280;
  canvas.width=W; canvas.height=H;
  ctx.fillStyle=isDark?'#161b25':'#fff'; ctx.fillRect(0,0,W,H);

  const pad={t:16,r:16,b:28,l:48}, gW=W-pad.l-pad.r, gH=H-pad.t-pad.b;

  // Bepaal welke PIDs tekenen
  const pidsToShow=[];
  if(activeTrendGroup&&trendPIDs.length){
    const grp=TREND_GROUPS[activeTrendGroup];
    trendPIDs.forEach((pid,i)=>{
      if(pidHist[pid]?.length>=2) pidsToShow.push({pid,color:grp.colors[i%grp.colors.length],ok:isPIDOk(pid)});
    });
  } else if(graphPID&&pidHist[graphPID]?.length>=2){
    pidsToShow.push({pid:graphPID,color:'#1a6fff',ok:isPIDOk(graphPID)});
  }

  if(!pidsToShow.length){
    ctx.fillStyle='#8a97a8'; ctx.font='12px DM Sans'; ctx.textAlign='center';
    ctx.fillText('Kies een groepstrend of individuele sensor',W/2,H/2);
    document.getElementById('graphLegend').innerHTML=''; return;
  }

  // Grid
  const gridC=isDark?'#2a3347':'#e2e6ed';
  for(let i=0;i<=4;i++){
    const y=pad.t+(i/4)*gH;
    ctx.strokeStyle=gridC; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
  }

  // Teken elke PID als eigen lijn (genormaliseerd 0-100% van zijn bereik)
  pidsToShow.forEach(({pid,color,ok})=>{
    const data=pidHist[pid];
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const vals=data.map(x=>x.v);
    const minV=Math.min(...vals), maxV=Math.max(...vals)+.001, range=maxV-minV||1;
    const lineColor=ok?color:'#e53e3e';

    ctx.strokeStyle=lineColor; ctx.lineWidth=ok?2:2.5;
    if(!ok) ctx.setLineDash([5,3]); else ctx.setLineDash([]);
    if(!ok){ ctx.shadowColor='#e53e3e'; ctx.shadowBlur=4; }

    ctx.beginPath();
    data.forEach((x,i)=>{
      const px=pad.l+(i/(data.length-1))*gW;
      const py=pad.t+gH-((x.v-minV)/range)*gH;
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    });
    ctx.stroke(); ctx.shadowBlur=0; ctx.setLineDash([]);

    // Eindpunt + waarde label
    const lx=pad.l+gW;
    const lastV=vals[vals.length-1];
    const ly=pad.t+gH-((lastV-minV)/range)*gH;
    ctx.fillStyle=lineColor;
    ctx.beginPath(); ctx.arc(lx,ly,3.5,0,Math.PI*2); ctx.fill();
    if(pidsToShow.length>1){
      ctx.font='9px DM Mono'; ctx.textAlign='right';
      ctx.fillText(`${fv(lastV)}${def?.unit||''}`,lx-6,ly-4);
    }
  });

  // Y-as voor single PID
  if(pidsToShow.length===1){
    const {pid}=pidsToShow[0];
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const vals=pidHist[pid].map(x=>x.v);
    const minV=Math.min(...vals), maxV=Math.max(...vals)+.001;
    for(let i=0;i<=4;i++){
      const y=pad.t+(i/4)*gH; const v=maxV-(i/4)*(maxV-minV);
      ctx.fillStyle='#8a97a8'; ctx.font='9px DM Mono'; ctx.textAlign='right';
      ctx.fillText(fv(v),pad.l-3,y+3);
    }
    ctx.fillStyle='#8a97a8'; ctx.font='10px DM Sans'; ctx.textAlign='center';
    ctx.fillText(`${def?.name||pid}${def?.unit?' ('+def.unit+')':''}`,W/2,H-4);
  }

  // Legenda onderaan
  const legend=document.getElementById('graphLegend'); legend.innerHTML='';
  pidsToShow.forEach(({pid,color,ok})=>{
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const val=pidVals[pid]; const lc=ok?color:'#e53e3e';
    const item=document.createElement('div'); item.className='legend-item';
    item.innerHTML=`<div class="legend-dot" style="background:${lc}${ok?'':';border:1px dashed '+lc}"></div><span style="color:${lc};font-weight:${ok?500:700}">${def?.name||pid}</span><span style="font-family:var(--m);font-size:12px;color:${lc}">${val!==undefined?fv(val)+(def?.unit||''):'—'}</span>${!ok?'<span style="font-size:11px;font-weight:700;color:#e53e3e;background:#fff0f0;padding:1px 4px;border-radius:3px">⚠ AFWIJKING</span>':''}`;
    legend.appendChild(item);
  });
}

// ════════════════════════════════════════
// DTC
// ════════════════════════════════════════
async function scanDTC(){
  window._didDTCScan=true;
  document.getElementById('bscan').disabled=true;
  document.getElementById('dtcList').innerHTML='<div class="ai-ld"><div class="spin"></div> Foutcodes ophalen...</div>';
  await delay(demoMode?1500:2000);
  if(demoMode){
    // Scenario-override: gebruik handmatig gezette DTC's als die er zijn.
    if(_scenario.enabled && _scenario.dtcs.length) dtcCodes=[..._scenario.dtcs];
    else dtcCodes=Math.random()>.5?['P0171','P0420']:[];
  }
  else dtcCodes=await realScanDTC();
  renderDTC();
  document.getElementById('bscan').disabled=false;
  document.getElementById('bclr').disabled=!dtcCodes.length;
  log(`Scan: ${dtcCodes.length} code(s)`,dtcCodes.length?'warn':'ok');
  try{ PidLaneEvalLog.log('dtc','uitgelezen',{codes:[...dtcCodes]}); }catch(e){}
  // Uitlezing bewaren in het sessie-rapportarchief (📄 Rapporten-knop + AI-context)
  try{ registerSessionReport({type:'dtc', title:'Foutcode-uitlezing — '+(dtcCodes.length?dtcCodes.length+' code'+(dtcCodes.length===1?'':'s'):'geen codes'), text:_srDtcText()}); }catch(e){}
}
async function realScanDTC(){
  const r=await sendCmd('03');const codes=[];
  if(!r||r.includes('NO DATA')) return codes;
  // Per regel parsen — meerdere ECU's kunnen elk een 43-respons sturen
  const lines=r.split(/[\r\n]+/).filter(l=>l.trim());
  for(const line of lines){
    const hex=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    const idx=hex.indexOf('43');
    if(idx<0) continue;
    let body=hex.slice(idx+2);
    // CAN (protocol 6-9/A-C): eerste byte na 43 is het AANTAL codes.
    // K-line/J1850 (protocol 1-5): codes volgen direct, geen count byte.
    const isCAN=/^[6-9A-Ca-c]/.test(String(selectedNetwork?.id||'6'));
    if(isCAN&&body.length>=2){
      const cnt=parseInt(body.slice(0,2),16);
      if(cnt>=0&&cnt<=20&&body.length-2>=cnt*4){
        body=body.slice(2,2+cnt*4);
      }
    }
    for(let i=0;i+4<=body.length;i+=4){
      const w=parseInt(body.slice(i,i+4),16);
      if(w===0||isNaN(w))continue;
      const t=['P','C','B','U'][(w>>14)&3];
      const code=t+((w>>12)&3)+((w>>8)&0xF).toString(16).toUpperCase()+('00'+(w&0xFF).toString(16).toUpperCase()).slice(-2);
      if(!codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}
function renderDTC(){
  const el=document.getElementById('dtcList');el.innerHTML='';
  window._dtcFound=dtcCodes.length;
  if(!dtcCodes.length){el.innerHTML=`<div class="emp"><div class="ei">✅</div><h3>Geen foutcodes</h3><p>Alle systemen OK</p></div>`;return;}
  dtcCodes.forEach(code=>{
    const info=dtcInfo(code)||{desc:'Onbekende code',body:'Raadpleeg fabrikantdocumentatie.',sev:'med'};
    const card=document.createElement('div');
    card.className=`dtc-card ${info.sev==='med'?'med':info.sev==='low'?'low':''}`;
    const bTxt=info.sev==='high'?'Kritiek':info.sev==='med'?'Matig':'Laag';
    const bCls=info.sev==='high'?'bh':info.sev==='med'?'bm':'bl2';
    const vBtn=(info.sev==='high'&&window.PLVerify&&connected&&!demoMode)
      ?`<button class="btn" style="margin-top:7px;padding:6px 11px;font-size:12px" onclick="plRunVerify(this,{sig:'DTC:${code}',titel:'DTC ${code}',pids:dtcVerifyPids('${code}')})">🔍 Verifieer met focusmeting</button>`:'';
    card.innerHTML=`<div class="dtcc">${code}</div><div><div class="dtcc-desc">${info.desc}</div><div class="dtcc-body">${info.body}</div>${vBtn}</div><div class="dtcbdg ${bCls}">${bTxt}</div>`;
    el.appendChild(card);
  });
}
async function clearDTC(){
  if(!confirm('Wis alle DTC-codes?')) return;
  if(!demoMode) await sendCmd('04');
  await delay(800);dtcCodes=[];renderDTC();
  document.getElementById('bclr').disabled=true;
}
function exportReport(){
  const v=getVehicle();
  const lines=['PidLane — Rapport',`Datum: ${new Date().toLocaleString('nl')}`,v.merk?`Voertuig: ${v.merk} ${v.model} ${v.year}`:'','=== DTC ===',...(dtcCodes.length?dtcCodes.map(c=>{const i=dtcInfo(c);return`${c} — ${i?i.desc:'?'}`;}):[' Geen']),'','=== LIVE DATA ===',...[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!==undefined?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean)];
  download('rapport.txt',lines.join('\n'));
}
