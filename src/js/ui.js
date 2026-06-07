const TREND_GROUPS={
  fuel:{ name:'Brandstof', icon:'⛽', pids:['0106','0107','0110','015E','012F','010A'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  power:{ name:'Vermogen', icon:'⚡', pids:['010C','0104','0111','010B','010E','0149'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  accu:{ name:'Accu', icon:'🔋', pids:['0142','0104','010C','015B'], colors:['#1a6fff','#f77f00','#00a86b','#7c3aed'] },
  temp:{ name:'Temperatuur', icon:'🌡️', pids:['0105','015C','010F','0146'], colors:['#e53e3e','#f77f00','#1a6fff','#00a86b'] },
};

let activeTrendGroup=null, trendPIDs=[];

function selectTrendGroup(group){
  document.querySelectorAll('.trend-group-btn').forEach(b=>b.classList.remove('active'));
  if(group==='none'||group===activeTrendGroup){
    activeTrendGroup=null; trendPIDs=[];
    updateTrendChips(); drawGraph(); return;
  }
  activeTrendGroup=group;
  const grp=TREND_GROUPS[group];
  // Alleen PIDs tonen die ook data hebben
  trendPIDs=grp.pids.filter(pid=>pidHist[pid]?.length||discoveredPIDDefs.find(d=>d.pid===pid));
  document.getElementById('gsel').value=''; graphPID=null;
  // Markeer actieve knop
  const idx={fuel:0,power:1,accu:2,temp:3}[group];
  document.querySelectorAll('.trend-group-btn')[idx]?.classList.add('active');
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
  const val=pidVals[pid]; if(val===undefined) return true;
  const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid]; if(!def) return true;
  if(def.dH&&val>=def.dH) return false; if(def.dL&&val<=def.dL) return false;
  if(def.wH&&val>=def.wH) return false; if(def.wL&&val<=def.wL) return false;
  return true;
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
  if(v){ activeTrendGroup=null; trendPIDs=[]; document.querySelectorAll('.trend-group-btn').forEach(b=>b.classList.remove('active')); updateTrendChips(); }
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
    item.innerHTML=`<div class="legend-dot" style="background:${lc}${ok?'':';border:1px dashed '+lc}"></div><span style="color:${lc};font-weight:${ok?500:700}">${def?.name||pid}</span><span style="font-family:var(--m);font-size:10px;color:${lc}">${val!==undefined?fv(val)+(def?.unit||''):'—'}</span>${!ok?'<span style="font-size:9px;font-weight:700;color:#e53e3e;background:#fff0f0;padding:1px 4px;border-radius:3px">⚠ AFWIJKING</span>':''}`;
    legend.appendChild(item);
  });
}

// ════════════════════════════════════════
// DTC
// ════════════════════════════════════════
// Graph functions added
async function scanDTC(){
  document.getElementById('bscan').disabled=true;
  document.getElementById('dtcList').innerHTML='<div class="ai-ld"><div class="spin"></div> Foutcodes ophalen...</div>';
  await delay(demoMode?1500:2000);
  if(demoMode) dtcCodes=Math.random()>.5?['P0171','P0420']:[];
  else dtcCodes=await realScanDTC();
  renderDTC();
  document.getElementById('bscan').disabled=false;
  document.getElementById('bclr').disabled=!dtcCodes.length;
  log(`Scan: ${dtcCodes.length} code(s)`,dtcCodes.length?'warn':'ok');
}
async function realScanDTC(){
  const r=await sendCmd('03');const codes=[];
  if(!r||r.includes('NO DATA')) return codes;
  const hex=r.replace(/[^0-9A-Fa-f]/g,'');
  for(let i=2;i<hex.length;i+=4){const w=parseInt(hex.slice(i,i+4),16);if(w===0)continue;const t=['P','C','B','U'][(w>>14)&3];codes.push(t+((w>>12)&3)+((w>>8)&0xF).toString(16).toUpperCase()+('00'+(w&0xFF).toString(16).toUpperCase()).slice(-2));}
  return codes;
}
function renderDTC(){
  const el=document.getElementById('dtcList');el.innerHTML='';
  if(!dtcCodes.length){el.innerHTML=`<div class="emp"><div class="ei">✅</div><h3>Geen foutcodes</h3><p>Alle systemen OK</p></div>`;return;}
  dtcCodes.forEach(code=>{
    const info=DTCDB[code]||{desc:'Onbekende code',body:'Raadpleeg fabrikantdocumentatie.',sev:'med'};
    const card=document.createElement('div');
    card.className=`dtc-card ${info.sev==='med'?'med':info.sev==='low'?'low':''}`;
    const bTxt=info.sev==='high'?'Kritiek':info.sev==='med'?'Matig':'Laag';
    const bCls=info.sev==='high'?'bh':info.sev==='med'?'bm':'bl2';
    card.innerHTML=`<div class="dtcc">${code}</div><div><div class="dtcc-desc">${info.desc}</div><div class="dtcc-body">${info.body}</div></div><div class="dtcbdg ${bCls}">${bTxt}</div>`;
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
  const lines=['PidLane — Rapport',`Datum: ${new Date().toLocaleString('nl')}`,v.merk?`Voertuig: ${v.merk} ${v.model} ${v.year}`:'','=== DTC ===',...(dtcCodes.length?dtcCodes.map(c=>{const i=DTCDB[c];return`${c} — ${i?i.desc:'?'}`;}):[' Geen']),'','=== LIVE DATA ===',...[...activePIDs].map(pid=>{const d=PIDS.find(p=>p.pid===pid);return d&&pidVals[pid]!==undefined?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean)];
  download('rapport.txt',lines.join('\n'));
}

// ════════════════════════════════════════
// FUEL ANALYSIS
// ════════════════════════════════════════
const FUEL_PIDS=[
  {pid:'0106',name:'Brandstoftrim kort B1',unit:'%',ok:[-5,5],desc:'Hoog=vacuümlek/MAF. Laag=injector.'},
  {pid:'0107',name:'Brandstoftrim lang B1',unit:'%',ok:[-5,5],desc:'Langdurige afwijking=structureel probleem.'},
  {pid:'0110',name:'MAF Luchtmassameter',unit:'g/s',ok:null,desc:'Te laag=vuile MAF of luchtfilter.'},
  {pid:'010E',name:'Ontstekingstiming',unit:'°',ok:[5,25],desc:'Afwijking=minder efficiënte verbranding.'},
  {pid:'0105',name:'Koelwater temp',unit:'°C',ok:[80,100],desc:'Te koud=10-20% meer verbruik.'},
  {pid:'0142',name:'Accuspanning',unit:'V',ok:[13.5,14.8],desc:'Laag=alternator belasting verhoogd.'},
  {pid:'015E',name:'Live brandstofverbruik',unit:'L/h',ok:null,desc:'Directe verbruiksmeting.'},
];
// Fuel functions added
async function runFuelAnalysis(){
  const btn=document.getElementById('btnFuel'); btn.disabled=true;
  document.getElementById('fuelResults').innerHTML='<div class="ai-ld"><div class="spin"></div> Brandstofdata analyseren...</div>';
  const measurements=[];
  for(const fp of FUEL_PIDS){
    let val=pidVals[fp.pid];
    if(val===undefined){val=demoMode?demo(fp.pid):validateAndSmooth(fp.pid,parsePID(fp.pid,await sendCmd('01'+fp.pid.slice(2))));}
    if(val!==null&&val!==undefined) updPID(fp.pid,val);
    let status='unknown';
    if(val!==null&&val!==undefined) status=fp.ok?(val>=fp.ok[0]&&val<=fp.ok[1]?'ok':'bad'):'ok';
    measurements.push({...fp,val,status});
  }
  renderFuelGauges(measurements);
  const prijs=parseFloat(document.getElementById('fuelPrice').value)||2.05;
  const jaarKm=parseInt(document.getElementById('yearKm').value)||15000;
  const v=getVehicle();
  const mData=measurements.filter(m=>m.val!==null&&m.val!==undefined).map(m=>`• ${m.name}: ${fv(m.val)} ${m.unit} [${m.status.toUpperCase()}] — ${m.desc}`).join('\n');
  const prompt=`Je bent brandstofefficiëntie specialist. Analyseer deze OBD2 data en geef besparingsadvies in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}\nBrandstofprijs: €${prijs}/liter | Jaarkilometers: ${jaarKm.toLocaleString('nl')} km\nDTC: ${dtcCodes.join(', ')||'geen'}\n\nLIVE METINGEN:\n${mData||'(geen data)'}\n\nGeef: HUIDIGE SITUATIE, GEVONDEN INEFFICIËNTIES, BESPAARTIPS (€/jaar), TOTALE BESPARING, RIJSTIJL TIPS`;
  try{
    const text=await apiFetch(prompt,1400);
    const secs=[{k:'HUIDIGE SITUATIE',i:'📊',c:'blue'},{k:'GEVONDEN INEFFICIËNTIES',i:'🔍',c:'orange'},{k:'BESPAARTIPS',i:'💡',c:'green'},{k:'TOTALE BESPARING',i:'💶',c:'purple'},{k:'RIJSTIJL TIPS',i:'🚗',c:'blue'}];
    const found=[];
    secs.forEach(s=>{if(text.toLowerCase().includes(s.k.toLowerCase()))found.push({...s,idx:text.toLowerCase().indexOf(s.k.toLowerCase())});});
    found.sort((a,b)=>a.idx-b.idx);
    let html='<div class="ai-res">';
    found.forEach((s,i)=>{const next=found[i+1];const re=new RegExp(`${s.k}\\s*([\\s\\S]*?)${next?`(?=${next.k})`:'$'}`,'i');const m=text.match(re);if(!m)return;const body=m[1].trim();if(!body)return;html+=`<div class="ai-sec"><div class="ai-sh ${s.c}">${s.i} ${s.k}</div><div class="ai-sb">${body.replace(/\n/g,'<br>')}</div></div>`;});
    if(!found.length)html+=`<div class="ai-sec"><div class="ai-sh blue">💡 Analyse</div><div class="ai-sb">${text.replace(/\n/g,'<br>')}</div></div>`;
    html+=`<div style="margin-top:8px"><button class="btn" onclick="exportFuelReport()" style="width:100%;justify-content:center">💾 Exporteer rapport</button></div></div>`;
    document.getElementById('fuelResults').innerHTML=html;
    renderAIText(text,document.getElementById('aiContent'));
  }catch(e){document.getElementById('fuelResults').innerHTML=`<div class="ai-sec"><div class="ai-sh red">⚠ Fout</div><div class="ai-sb">${e.message}</div></div>`;}
  btn.disabled=false;
}
function renderFuelGauges(measurements){
  const grid=document.getElementById('fuelGauges'); grid.innerHTML='';
  measurements.forEach(m=>{
    const hasVal=m.val!==null&&m.val!==undefined;
    const color=m.status==='ok'?'var(--gn)':m.status==='bad'?'var(--rd)':'var(--tx3)';
    const bg=m.status==='ok'?'var(--gns)':m.status==='bad'?'var(--rds)':'var(--sur2)';
    const icon=m.status==='ok'?'✅':m.status==='bad'?'🔴':'❓';
    const c=document.createElement('div');
    c.style.cssText=`background:${bg};border:1px solid var(--bd);border-radius:var(--r);padding:9px 11px;border-left:3px solid ${color}`;
    c.title=m.desc;
    c.innerHTML=`<div style="font-size:8px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${m.name}</div><div style="font-family:var(--m);font-size:18px;font-weight:500;color:${color};line-height:1">${hasVal?fv(m.val):'—'} <span style="font-size:9px;color:var(--tx3)">${m.unit}</span></div><div style="font-size:9px;margin-top:3px">${icon} ${m.status==='ok'?'Normaal':m.status==='bad'?'Afwijking':'Geen data'}</div>`;
    grid.appendChild(c);
  });
}
function exportFuelReport(){
  const v=getVehicle();
  const content=document.getElementById('fuelResults').innerText;
  download(`brandstof-${Date.now()}.txt`,['PidLane — Brandstofbesparing',`Datum: ${new Date().toLocaleString('nl')}`,v.merk?`Voertuig: ${v.merk} ${v.model} ${v.year}`:'','',content].join('\n'));
}

// ════════════════════════════════════════
// AI
// ════════════════════════════════════════
// Neon dashboard added

<script>
// ════════════════════════════════════════
// NEON DASHBOARD — RONDE METERS
// ════════════════════════════════════════
let neonBgTimer=null, neonGaugeTimer=null, neonFrame=0;

const NEON_COLORS={
  fuel:  {main:'#00f5ff',glow:'rgba(0,245,255,.5)',  dim:'rgba(0,245,255,.08)',  track:'rgba(0,245,255,.12)'},
  power: {main:'#aaff00',glow:'rgba(170,255,0,.5)',  dim:'rgba(170,255,0,.08)',  track:'rgba(170,255,0,.12)'},
  accu:  {main:'#a78bfa',glow:'rgba(167,139,250,.5)',dim:'rgba(167,139,250,.08)',track:'rgba(167,139,250,.12)'},
  temp:  {main:'#ff6b35',glow:'rgba(255,107,53,.5)', dim:'rgba(255,107,53,.08)', track:'rgba(255,107,53,.12)'},
};

function openNeonDashboard(){
  if(!activeTrendGroup||!trendPIDs.length){log('Kies eerst een groepstrend','warn');return;}
  document.getElementById('neonDash').style.display='block';
  document.getElementById('neonGroupName').textContent=
    TREND_GROUPS[activeTrendGroup].icon+' '+TREND_GROUPS[activeTrendGroup].name.toUpperCase();
  renderNeonGauges();
  startNeonBg();
  neonGaugeTimer=setInterval(()=>{renderNeonGauges();},800);
}

function closeNeonDashboard(){
  document.getElementById('neonDash').style.display='none';
  cancelAnimationFrame(neonBgTimer);
  clearInterval(neonGaugeTimer);
}

// ── Achtergrond animatie ──
function startNeonBg(){
  const canvas=document.getElementById('neonBg');
  const ctx=canvas.getContext('2d');
  const nc=NEON_COLORS[activeTrendGroup]||NEON_COLORS.fuel;

  function bg(){
    canvas.width=window.innerWidth; canvas.height=window.innerHeight;
    const W=canvas.width,H=canvas.height;
    ctx.fillStyle='#020408'; ctx.fillRect(0,0,W,H);

    // Radiale glow in center
    const rg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.6);
    rg.addColorStop(0,nc.dim); rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);

    // Grid
    ctx.strokeStyle='rgba(255,255,255,.025)'; ctx.lineWidth=.5;
    const gs=50;
    for(let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Scan line
    const sy=((neonFrame*1.5)%H);
    const sg=ctx.createLinearGradient(0,sy-30,0,sy+30);
    sg.addColorStop(0,'rgba(0,0,0,0)'); sg.addColorStop(.5,nc.track); sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg; ctx.fillRect(0,sy-30,W,60);

    neonFrame++;
    neonBgTimer=requestAnimationFrame(bg);
  }
  bg();
}

// ── Ronde meters tekenen ──
function renderNeonGauges(){
  const grid=document.getElementById('neonGaugeGrid'); grid.innerHTML='';
  const bar=document.getElementById('neonStatusBar'); bar.innerHTML='';
  const grp=TREND_GROUPS[activeTrendGroup];
  const nc=NEON_COLORS[activeTrendGroup];
  const W=window.innerWidth, H=window.innerHeight-44-80;
  const n=trendPIDs.filter(p=>discoveredPIDDefs.find(d=>d.pid===p)||ALL_PID_DEFS[p]).length;
  // Gauge size based on screen and count
  const maxR=Math.min(W/(n*2.4+.5), H/2.6, 140);
  const R=Math.max(60,maxR);

  trendPIDs.forEach((pid,i)=>{
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid]; if(!def) return;
    const val=pidVals[pid]; const ok=isPIDOk(pid);
    const color=ok?grp.colors[i%grp.colors.length]:'#ff006e';
    const alertColor='#ff006e';
    // Normalize to 0-1
    const minV=def.min??0, maxV=def.max??255;
    const pct=val!==undefined?Math.max(0,Math.min(1,(val-minV)/(maxV-minV))):0;

    // Canvas voor deze meter
    const size=R*2+20;
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:0;';

    const cv=document.createElement('canvas');
    cv.width=size; cv.height=size;
    const ctx=cv.getContext('2d');
    const cx=size/2, cy=size/2, r=R;

    // Start/end angles (270° arc, bottom gap)
    const startA=Math.PI*.75;   // 135°
    const endA=Math.PI*2.25;    // 405° = 45°
    const arcSpan=endA-startA;
    const valA=startA+pct*arcSpan;

    // Track (background arc)
    ctx.beginPath();
    ctx.arc(cx,cy,r,startA,endA);
    ctx.strokeStyle=ok?color+'18':'#ff006e18';
    ctx.lineWidth=R*.14; ctx.lineCap='round'; ctx.stroke();

    // Tick marks
    for(let t=0;t<=10;t++){
      const a=startA+(t/10)*arcSpan;
      const inner=r-(t%5===0?R*.2:R*.12);
      const outer=r;
      const x1=cx+Math.cos(a)*inner, y1=cy+Math.sin(a)*inner;
      const x2=cx+Math.cos(a)*outer, y2=cy+Math.sin(a)*outer;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
      ctx.strokeStyle=t%5===0?color+'55':color+'25';
      ctx.lineWidth=t%5===0?1.5:.7; ctx.stroke();
    }

    // Value arc with gradient
    if(val!==undefined&&pct>0){
      const grad=ctx.createConicalGradient?.(cx,cy,startA)??null;
      ctx.beginPath();
      ctx.arc(cx,cy,r,startA,valA);
      ctx.strokeStyle=color;
      ctx.lineWidth=R*.14; ctx.lineCap='round';
      ctx.shadowColor=color; ctx.shadowBlur=ok?16:24;
      ctx.stroke(); ctx.shadowBlur=0;

      // Warning zone (last 15%)
      if(!ok||pct>.85){
        ctx.beginPath();
        ctx.arc(cx,cy,r,Math.max(valA-.3,startA+arcSpan*.85),valA);
        ctx.strokeStyle=alertColor;
        ctx.lineWidth=R*.14; ctx.lineCap='round';
        ctx.shadowColor=alertColor; ctx.shadowBlur=20;
        ctx.stroke(); ctx.shadowBlur=0;
      }
    }

    // Needle
    const needleA=val!==undefined?valA:startA;
    const nl=r*.75, ns=r*.12;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(needleA);
    ctx.beginPath();
    ctx.moveTo(-ns,0); ctx.lineTo(nl,0); ctx.lineTo(nl*.95,ns*.4); ctx.lineTo(nl*.95,-ns*.4); ctx.closePath();
    ctx.fillStyle=ok?color:'#ff006e';
    ctx.shadowColor=ok?color:'#ff006e'; ctx.shadowBlur=12;
    ctx.fill(); ctx.shadowBlur=0; ctx.restore();

    // Center pivot
    ctx.beginPath(); ctx.arc(cx,cy,R*.06,0,Math.PI*2);
    ctx.fillStyle='#0a0a12';
    ctx.strokeStyle=ok?color:'#ff006e'; ctx.lineWidth=1.5;
    ctx.fill(); ctx.stroke();

    // Center value (compact — links naast de wijzerplaat)
    // Sensor naam — boven de meter
    ctx.font=`bold ${Math.max(8,R*.09)}px DM Mono`;
    ctx.fillStyle=color+'88'; ctx.textAlign='center';
    ctx.fillText(def.name.slice(0,14).toUpperCase(),cx,cy-r*.42);

    // Min/max labels
    ctx.font=`${Math.max(7,R*.07)}px DM Mono`;
    ctx.fillStyle='rgba(255,255,255,.25)'; ctx.textAlign='center';
    const minX=cx+Math.cos(startA)*r*.75, minY=cy+Math.sin(startA)*r*.75;
    const maxX=cx+Math.cos(endA)*r*.75,   maxY=cy+Math.sin(endA)*r*.75;
    ctx.fillText(fv(minV),minX,minY+4);
    ctx.fillText(fv(maxV),maxX,maxY+4);

    wrap.appendChild(cv);

    // Kleine waarde display NAAST de wijzerplaat (compact inline)
    const valRow=document.createElement('div');
    valRow.style.cssText=`display:flex;align-items:baseline;gap:4px;margin-top:-${R*.1}px;`;
    valRow.innerHTML=`
      <span style="font-family:'DM Mono',monospace;font-size:${Math.max(14,R*.18)}px;font-weight:500;color:${ok?color:'#ff006e'};text-shadow:0 0 12px ${ok?color:'#ff006e'};line-height:1">${val!==undefined?fv(val):'—'}</span>
      <span style="font-family:'DM Mono',monospace;font-size:${Math.max(8,R*.09)}px;color:${color}55">${def.unit||''}</span>
      ${!ok?`<span style="font-size:${Math.max(7,R*.08)}px;font-weight:700;color:#ff006e;letter-spacing:1px">⚠</span>`:''}
    `;
    wrap.appendChild(valRow);
    grid.appendChild(wrap);

    // Status bar onderaan
    const si=document.createElement('div');
    si.style.cssText=`display:flex;align-items:center;gap:6px;padding:6px 10px;background:${ok?color+'0d':'#ff006e0d'};border:1px solid ${ok?color+'22':'#ff006e33'};border-radius:7px;`;
    si.innerHTML=`
      <div style="width:6px;height:6px;border-radius:50%;background:${ok?color:'#ff006e'};box-shadow:0 0 8px ${ok?color:'#ff006e'}"></div>
      <span style="font-size:9px;font-weight:700;color:${ok?color:'#ff006e'};letter-spacing:.5px">${def.name.slice(0,10)}</span>
      <span style="font-family:'DM Mono',monospace;font-size:10px;color:${ok?color:'#ff006e'}">${val!==undefined?fv(val)+(def.unit||''):'—'}</span>
    `;
    bar.appendChild(si);
  });
}

// Enable dashboard button when group selected
const _origSelectTrendGroup=selectTrendGroup;
window.selectTrendGroup=function(group){
  _origSelectTrendGroup(group);
  const btn=document.getElementById('dashBtn');
  if(btn) btn.disabled=!activeTrendGroup;
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeNeonDashboard(); closeRitAnalyse(); }
});
window.addEventListener('resize',()=>{
  if(document.getElementById('neonDash').style.display!=='none') renderNeonGauges();
});

// ════════════════════════════════════════
// RIT ANALYSE
// ════════════════════════════════════════
const RIT_FASEN=[
  {naam:'Motor & Vermogen',    icon:'⚡', duur:120, pids:['010C','0104','0111','010B','010E'], desc:'RPM, belasting, gasklep, inlaatdruk, timing'},
  {naam:'Brandstof & Emissie', icon:'⛽', duur:120, pids:['0106','0107','0110','0113','0115'], desc:'Brandstoftrim, MAF, O2 sensoren'},
  {naam:'Temperatuur',         icon:'🌡️', duur:60,  pids:['0105','015C','010F','0146'],       desc:'Koelwater, olie, inlaatlucht, omgevingstemperatuur'},
  {naam:'Accu & Electrisch',   icon:'🔋', duur:60,  pids:['0142','0104','010C'],              desc:'Spanning, belasting onder belasting'},
  {naam:'Rijgedrag',           icon:'🚗', duur:120, pids:['010D','0149','010C','0104'],       desc:'Snelheid, gaspedaal, acceleratie patronen'},
  {naam:'Alles tegelijk',      icon:'📊', duur:120, pids:['010C','010D','0105','0142','0106','0107','0110'], desc:'Combinatie overzicht voor correlaties'},
];
const RIT_TOTAAL=RIT_FASEN.reduce((a,f)=>a+f.duur,0); // 10 minuten

let ritActive=false, ritFaseIdx=0, ritFaseTimer=null, ritTotalTimer=null;
let ritStartTime=null, ritLogs=[], ritFaseData={};

function openRitAnalyse(){
  document.getElementById('ritDash').style.display='block';
  resetRitUI();
}
function closeRitAnalyse(){
  if(ritActive) stopRitAnalyse();
  document.getElementById('ritDash').style.display='none';
}

function resetRitUI(){
  document.getElementById('ritProgress').style.width='0%';
  document.getElementById('ritTimer').textContent='0:00';
  document.getElementById('ritStatus').textContent='Start rijden — minimaal 10 minuten';
  document.getElementById('ritPhaseName').textContent='Wachten op start...';
  document.getElementById('ritPhaseDesc').textContent='';
  document.getElementById('ritPhaseResults').innerHTML='';
  document.getElementById('ritStartBtn').style.display='block';
  document.getElementById('ritStopBtn').style.display='none';
  ritLogs=[]; ritFaseData={}; ritFaseIdx=0;
}

function startRitAnalyse(){
  if(!connected){log('Verbind eerst een adapter','warn');return;}
  ritActive=true; ritStartTime=Date.now(); ritFaseIdx=0; ritLogs=[]; ritFaseData={};
  document.getElementById('ritStartBtn').style.display='none';
  document.getElementById('ritStopBtn').style.display='block';
  document.getElementById('ritStatus').textContent='Rit analyse actief — rij normaal';
  log('🚗 Rit analyse gestart','ok');
  startRitFase(0);

  // Total timer + progress bar
  ritTotalTimer=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-ritStartTime)/1000);
    const mins=Math.floor(elapsed/60), secs=elapsed%60;
    document.getElementById('ritTimer').textContent=`${mins}:${secs.toString().padStart(2,'0')}`;
    const pct=Math.min(100,(elapsed/RIT_TOTAAL)*100);
    document.getElementById('ritProgress').style.width=pct+'%';
    if(elapsed>=RIT_TOTAAL) stopRitAnalyse();
  },1000);
}

function startRitFase(idx){
  if(idx>=RIT_FASEN.length){stopRitAnalyse();return;}
  const fase=RIT_FASEN[idx];
  document.getElementById('ritPhaseName').textContent=`${fase.icon} ${fase.naam}`;
  document.getElementById('ritPhaseDesc').textContent=fase.desc+` — ${fase.duur} seconden`;
  log(`Fase ${idx+1}: ${fase.naam}`,'info');

  // Init data buffer voor deze fase
  ritFaseData[idx]={fase, data:{}, startTime:Date.now()};
  fase.pids.forEach(pid=>{ritFaseData[idx].data[pid]=[];});

  // Verzamel data gedurende de fase
  const collectInterval=setInterval(()=>{
    if(!ritActive){clearInterval(collectInterval);return;}
    fase.pids.forEach(pid=>{
      if(pidVals[pid]!==undefined) ritFaseData[idx].data[pid].push({t:Date.now(),v:pidVals[pid]});
    });
  },500);

  // Fase timer
  ritFaseTimer=setTimeout(async()=>{
    clearInterval(collectInterval);
    await analyseRitFase(idx);
    if(ritActive) startRitFase(idx+1);
  },fase.duur*1000);
}

async function analyseRitFase(idx){
  const {fase,data}=ritFaseData[idx];

  // Bereken statistieken per PID
  const stats={};
  Object.entries(data).forEach(([pid,readings])=>{
    if(!readings.length) return;
    const vals=readings.map(r=>r.v);
    const min=Math.min(...vals),max=Math.max(...vals),avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const first=vals.slice(0,3).reduce((a,b)=>a+b,0)/3;
    const last=vals.slice(-3).reduce((a,b)=>a+b,0)/3;
    const trend=((last-first)/Math.max(Math.abs(first),.001))*100;
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const ok=isPIDOkVal(pid,avg);
    stats[pid]={name:def?.name||pid,unit:def?.unit||'',min,max,avg,trend,ok,count:vals.length};
  });

  ritLogs.push({fase:fase.naam,duur:fase.duur,stats});

  // Toon fase kaart
  const card=document.createElement('div');
  card.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:12px;';
  const hasProbleem=Object.values(stats).some(s=>!s.ok);
  card.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:#fff">${fase.icon} ${fase.naam}</div>
      <div style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hasProbleem?'rgba(255,0,110,.15)':'rgba(0,255,200,.1)'};color:${hasProbleem?'#ff6464':'#00ffc8'}">${hasProbleem?'⚠ AFWIJKING':'✅ OK'}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      ${Object.values(stats).map(s=>`
        <div style="font-size:10px;padding:3px 8px;border-radius:5px;background:${s.ok?'rgba(255,255,255,.05)':'rgba(255,0,110,.1)'};color:${s.ok?'rgba(255,255,255,.6)':'#ff6464'}">
          ${s.name}: ${fv(s.avg)} ${s.unit} ${s.trend>5?'↑':s.trend<-5?'↓':'→'}
        </div>`).join('')}
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,.3);font-style:italic" id="rit-ai-${idx}">AI analyseert...</div>
  `;
  document.getElementById('ritPhaseResults').prepend(card);

  // AI analyse voor deze fase
  const v=getVehicle();
  const statLines=Object.values(stats).map(s=>
    `• ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}, trend=${s.trend>5?'↑ stijgend':s.trend<-5?'↓ dalend':'stabiel'}`
  ).join('\n');

  try{
    const text=await apiFetch(`Rit fase analyse — ${fase.naam} (${fase.duur}s)\nVoertuig: ${v.merk||'?'} ${v.year||''}\n\nData:\n${statLines}\n\nGeef in 2-3 zinnen: wat valt op, is er een probleem, wat betekent dit voor de motor?`,400);
    const el=document.getElementById('rit-ai-'+idx);
    if(el) el.textContent=text.replace(/\n/g,' ').slice(0,200);
    ritLogs[ritLogs.length-1].aiAnalyse=text;
  }catch(e){}
}

function isPIDOkVal(pid,val){
  const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid]; if(!def) return true;
  if(def.dH&&val>=def.dH) return false; if(def.dL&&val<=def.dL) return false;
  if(def.wH&&val>=def.wH) return false; if(def.wL&&val<=def.wL) return false;
  return true;
}

async function stopRitAnalyse(){
  if(!ritActive) return;
  ritActive=false;
  clearTimeout(ritFaseTimer); clearInterval(ritTotalTimer);
  document.getElementById('ritStatus').textContent='Analyse klaar — rapport wordt gegenereerd...';
  document.getElementById('ritStopBtn').style.display='none';
  log('Rit analyse gestopt — rapport genereren','info');
  await generateRitRapport();
}

async function generateRitRapport(){
  const v=getVehicle();
  const elapsed=Math.floor((Date.now()-ritStartTime)/1000);
  const mins=Math.floor(elapsed/60), secs=elapsed%60;

  // Bouw rapport tekst
  const lines=[
    `NEWSPEEDY AI OBD — RIT ANALYSE RAPPORT`,
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.year||''} ${v.vin||''}`,
    `Rit duur: ${mins}:${secs.toString().padStart(2,'0')} minuten`,
    `Fases geanalyseerd: ${ritLogs.length}`,
    '',
    '═══════════════════════════════════',
    'FASE RESULTATEN:',
    '',
  ];

  ritLogs.forEach((log,i)=>{
    lines.push(`FASE ${i+1}: ${log.fase} (${log.duur}s)`);
    Object.values(log.stats).forEach(s=>{
      lines.push(`  • ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}${!s.ok?' ⚠ AFWIJKING':''}`);
    });
    if(log.aiAnalyse) lines.push(`  → AI: ${log.aiAnalyse.slice(0,200)}`);
    lines.push('');
  });

  // Totaalanalyse via AI
  document.getElementById('ritStatus').textContent='AI totaalanalyse...';
  const allStats=ritLogs.map(l=>`${l.fase}: ${Object.values(l.stats).map(s=>`${s.name}=${fv(s.avg)}${s.unit}${!s.ok?' (!)':''}`).join(', ')}`).join('\n');

  try{
    const totalAnalysis=await apiFetch(
      `Analyseer deze complete rit van ${mins} minuten voor een ${v.merk||'auto'} in het Nederlands.\n\nFase data:\n${allStats}\n\nGeef: SAMENVATTING, BEVINDINGEN, PRIORITEIT ACTIES (🔴/🟡/🟢), AANBEVELINGEN`,
      1200
    );
    lines.push('═══════════════════════════════════');
    lines.push('TOTAAL AI ANALYSE:');
    lines.push(totalAnalysis);
    document.getElementById('ritStatus').textContent=`✅ Rit rapport klaar — ${mins}:${secs.toString().padStart(2,'0')} min geanalyseerd`;

    // Toon in AI paneel
    closeRitAnalyse();
    renderAIText(totalAnalysis,document.getElementById('aiContent'));
  }catch(e){
    document.getElementById('ritStatus').textContent='Rapport klaar (geen AI beschikbaar)';
  }

  // Download rapport
  download(`rit-analyse-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
  log('🚗 Rit rapport gedownload','ok');
}

function openRitAnalyse(){
  document.getElementById('ritDash').style.display='block';
  resetRitUI();
}
</script>

