// ══════════════════════════════════════════════════════════════════
// pidlane-graph.js
// Grafieken: één baan per sensor, op één tijdas
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

/* ── GRAFIEK: één baan per sensor (herbouwd 26-09-2026) ─────────────────
   WAT ER WAS. Tot vier knoppenrijen, een losse keuzelijst, een chiprij en
   een legendablok boven één canvas waarop tot zes lijnen door elkaar liepen,
   elk genormaliseerd op zijn eigen min–max. Daardoor zei de as niets (twee
   lijnen op dezelfde hoogte konden 12 V en 90 °C zijn), en een groep werd
   alleen hertekend als er toevallig ook één losse sensor gekozen was: de
   live-update hing aan `graphPID===pid` en een groep zette graphPID op null.

   WAT HET NU IS. Hoogstens GR_MAX sensoren, elk in een eigen baan met een
   eigen as in zijn eigen eenheid, onder elkaar op dezelfde tijdas. Per baan:
   de waarde van nu, het normaalbereik uit de PID-definitie (wL–wH) als
   groene band, stukken buiten dat bereik in rood, en één zin eronder die zegt
   hoe de sensor zich de afgelopen minuten gedroeg. Hertekenen gaat op een
   eigen klok zolang het tabblad open staat, niet meer op een toevallige PID. */
const GR_MAX = 3;
const GR_VENSTER_MS = 120000;       // de tijdas: de laatste twee minuten
let grKeuze = [];                   // de pids in beeld, in volgorde
let activeTrendGroup = null;        // blijft bestaan: de HUD-presets delen TREND_GROUPS
let trendPIDs = [];                 // idem, voor de resize-luisteraar in theme.js
let _grKlok = null;

function _grDef(pid){
  return (typeof getPidDef==='function' && getPidDef(pid)) ||
         discoveredPIDDefs.find(d=>d.pid===pid) || ALL_PID_DEFS[pid] || null;
}
function _grNaam(pid){ const d=_grDef(pid); return (d && d.name) || pid; }
function _grEenheid(pid){ const d=_grDef(pid); return (d && d.unit) || ''; }
// Het normaalbereik: alleen de waarschuwingsgrenzen die de definitie echt
// heeft. Geen verzonnen band als er geen grens bekend is.
function _grNormaal(pid){
  const d=_grDef(pid) || {};
  const lo = (typeof d.wL==='number') ? d.wL : null, hi = (typeof d.wH==='number') ? d.wH : null;
  return (lo===null && hi===null) ? null : { lo, hi };
}
function _grBinnen(n, v){ return !n || ((n.lo===null || v>n.lo) && (n.hi===null || v<n.hi)); }
function _grLevert(pid){
  try{
    if(typeof demoMode!=='undefined' && demoMode) return true;
    if(pidHist[pid] && pidHist[pid].length) return true;
    return (typeof supportedPIDs!=='undefined' && supportedPIDs && supportedPIDs.size) ? supportedPIDs.has(pid) : true;
  }catch(e){ console.warn('grafiek: kan niet nagaan of de auto '+pid+' levert', e); return true; }
}

// Samenvatting in één zin — dit is wat een grafiek waardevol maakt: niet de
// lijn zelf, maar wat je eraan kunt aflezen zonder hem te interpreteren.
function grSamenvatting(pid, nu){
  const t1 = nu || Date.now();
  const data = (pidHist[pid]||[]).filter(x=>x.t>=t1-GR_VENSTER_MS && typeof x.v==='number');
  if(data.length<2) return { tekst:'Wacht op meetwaarden…', buiten:0, n:data.length };
  const vals=data.map(x=>x.v), n=_grNormaal(pid), eh=_grEenheid(pid);
  const min=Math.min(...vals), max=Math.max(...vals);
  const buiten=data.filter(x=>!_grBinnen(n, x.v)).length;
  const pct=Math.round(buiten/data.length*100);
  const sec=Math.round((data[data.length-1].t-data[0].t)/1000);
  const bereik=fv(min)+'–'+fv(max)+(eh?' '+eh:'');
  let tekst;
  if(!n) tekst='Bereik '+bereik+' in '+sec+' s · geen normaalbereik bekend voor deze sensor';
  else if(!buiten) tekst='Binnen normaal · '+bereik+' in '+sec+' s';
  else tekst=pct+'% van de tijd buiten normaal · '+bereik+' in '+sec+' s';
  return { tekst, buiten, n:data.length, pct };
}

function _grKleur(naam, terug){
  try{ const v=getComputedStyle(document.documentElement).getPropertyValue(naam).trim(); return v||terug; }
  catch(e){ return terug; }
}

function _grBaan(pid){
  const id='grBaan-'+pid;
  let b=document.getElementById(id);
  if(b) return b;
  b=document.createElement('div'); b.id=id; b.className='gr-baan'; b.dataset.pid=pid;
  b.innerHTML=
    '<div class="gr-baan-kop">'+
      '<span class="gr-naam"></span>'+
      '<span class="gr-waarde"></span>'+
      '<button type="button" class="gr-weg" aria-label="Sensor uit de grafiek halen" onclick="grWeg(\''+pid+'\')">✕</button>'+
    '</div>'+
    '<canvas class="gr-doek"></canvas>'+
    '<div class="gr-zin"></div>';
  return b;
}

function _grTekenBaan(b, pid, nu){
  const def=_grDef(pid), eh=_grEenheid(pid), n=_grNormaal(pid);
  const data=(pidHist[pid]||[]).filter(x=>x.t>=nu-GR_VENSTER_MS && typeof x.v==='number');
  const laatste=data.length ? data[data.length-1].v : pidVals[pid];
  const ok = typeof laatste!=='number' || _grBinnen(n, laatste);
  b.querySelector('.gr-naam').textContent=_grNaam(pid);
  const w=b.querySelector('.gr-waarde');
  w.textContent = typeof laatste==='number' ? fv(laatste)+(eh?' '+eh:'') : '—';
  w.classList.toggle('buiten', !ok);
  const s=grSamenvatting(pid, nu);
  const z=b.querySelector('.gr-zin'); z.textContent=s.tekst; z.classList.toggle('buiten', s.buiten>0);

  const c=b.querySelector('canvas'), dpr=window.devicePixelRatio||1;
  const W=c.clientWidth||300, H=c.clientHeight||96;
  c.width=Math.round(W*dpr); c.height=Math.round(H*dpr);
  const g=c.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  const pad={l:40,r:8,t:6,b:16}, gw=W-pad.l-pad.r, gh=H-pad.t-pad.b;
  const tx=_grKleur('--tx3','#8a97a8'), rand=_grKleur('--bd','#2a3347');
  const lijn=_grKleur('--bl','#1a6fff'), rood=_grKleur('--rd','#e53e3e'), groen=_grKleur('--gn','#16a34a');
  // Tijdas: -2 min, -1 min, nu
  g.font='9px DM Mono, monospace'; g.fillStyle=tx; g.textAlign='center';
  [[0,'-2 min'],[0.5,'-1 min'],[1,'nu']].forEach(([f,l])=>{
    const x=pad.l+f*gw; g.fillText(l, Math.min(Math.max(x,pad.l+14), W-pad.r-8), H-3);
    g.strokeStyle=rand; g.lineWidth=1; g.beginPath(); g.moveTo(x,pad.t); g.lineTo(x,pad.t+gh); g.stroke();
  });
  if(data.length<2){
    g.textAlign='left'; g.fillText('nog geen verloop', pad.l+6, pad.t+gh/2+3); return;
  }
  // Y-bereik: de data, plus de normaalband als die er vlakbij ligt, zodat je
  // ziet hoe ver een waarde ervan af zit. Een band op 200 °C bij een waarde
  // van 90 °C zou de lijn plat drukken; die tekenen we dan niet mee.
  let lo=Math.min(...data.map(x=>x.v)), hi=Math.max(...data.map(x=>x.v));
  // Minimale schaal: 4% van het meetbereik van de sensor. Anders vult een
  // schommeling van 0,5 °C de hele baan en ziet ruis eruit als onrust.
  const vol=(def && typeof def.min==='number' && typeof def.max==='number') ? (def.max-def.min)*0.04 : 0;
  const span0=Math.max(hi-lo, vol, Math.abs(hi)*0.02, 0.5);
  if(hi-lo<span0){ const m=(hi+lo)/2; lo=m-span0/2; hi=m+span0/2; }
  if(n){
    if(n.lo!==null && n.lo>=lo-span0*2) lo=Math.min(lo,n.lo);
    if(n.hi!==null && n.hi<=hi+span0*2) hi=Math.max(hi,n.hi);
  }
  const marge=Math.max((hi-lo)*0.12, span0*0.12); lo-=marge; hi+=marge;
  const Y=v=>pad.t+gh-((v-lo)/(hi-lo))*gh, X=t=>pad.l+(1-(nu-t)/GR_VENSTER_MS)*gw;
  // Normaalband
  if(n){
    const y1=Y(n.hi!==null?Math.min(n.hi,hi):hi), y2=Y(n.lo!==null?Math.max(n.lo,lo):lo);
    g.globalAlpha=0.13; g.fillStyle=groen; g.fillRect(pad.l, y1, gw, Math.max(0,y2-y1)); g.globalAlpha=1;
  }
  // Y-labels: boven en onder
  g.fillStyle=tx; g.textAlign='right';
  g.fillText(fv(hi-marge), pad.l-4, pad.t+8); g.fillText(fv(lo+marge), pad.l-4, pad.t+gh);
  // De lijn, per stuk gekleurd: rood waar hij buiten normaal ligt
  g.lineWidth=2; g.lineJoin='round';
  for(let i=1;i<data.length;i++){
    const a=data[i-1], z=data[i];
    g.strokeStyle=(_grBinnen(n,a.v)&&_grBinnen(n,z.v))?lijn:rood;
    g.beginPath(); g.moveTo(X(a.t),Y(a.v)); g.lineTo(X(z.t),Y(z.v)); g.stroke();
  }
  const e=data[data.length-1];
  g.fillStyle=ok?lijn:rood; g.beginPath(); g.arc(X(e.t),Y(e.v),3,0,Math.PI*2); g.fill();
}

function drawGraph(){
  const vak=document.getElementById('grBanen'); if(!vak) return;
  const leeg=document.getElementById('grLeeg');
  // Banen die niet meer gekozen zijn weg, nieuwe erbij, volgorde = grKeuze.
  [...vak.children].forEach(k=>{ if(grKeuze.indexOf(k.dataset.pid)<0) k.remove(); });
  grKeuze.forEach(pid=>vak.appendChild(_grBaan(pid)));
  if(leeg) leeg.style.display=grKeuze.length?'none':'';
  const nu=Date.now();
  grKeuze.forEach(pid=>{
    try{ _grTekenBaan(document.getElementById('grBaan-'+pid), pid, nu); }
    catch(e){ console.warn('grafiek: baan '+pid+' niet getekend', e); }
  });
  _grKnoppenBij();
  trendPIDs=grKeuze.slice();
}

function _grKnoppenBij(){
  document.querySelectorAll('.gr-groep').forEach(k=>k.classList.toggle('active', k.dataset.groep===activeTrendGroup));
  const sel=document.getElementById('gsel');
  if(sel) sel.disabled = false;
  const tel=document.getElementById('grTel'); if(tel) tel.textContent=grKeuze.length+'/'+GR_MAX;
}

function grKiesGroep(groep){
  const grp=TREND_GROUPS[groep]; if(!grp) return;
  if(activeTrendGroup===groep){ activeTrendGroup=null; grKeuze=[]; drawGraph(); return; }
  activeTrendGroup=groep;
  grKeuze=grp.pids.filter(_grLevert).slice(0,GR_MAX);
  if(!grKeuze.length) showToast?.('Deze auto levert geen van de sensoren uit "'+grp.name+'"');
  drawGraph();
  ensurePIDListActive(grKeuze.slice()).then(drawGraph).catch(e=>console.warn('grafiek: sensoren niet aangezet', e));
  try{ log('Grafiek: '+grp.name,'info'); }catch(e){ console.warn('log mislukt:', e); }
}

function grVoegToe(pid){
  const sel=document.getElementById('gsel'); if(sel) sel.value='';
  if(!pid || grKeuze.indexOf(pid)>=0) return;
  activeTrendGroup=null;
  if(grKeuze.length>=GR_MAX){
    showToast?.('Hoogstens '+GR_MAX+' sensoren tegelijk — '+_grNaam(grKeuze[0])+' is eruit gehaald');
    grKeuze.shift();
  }
  grKeuze.push(pid);
  drawGraph();
  ensurePIDListActive([pid]).then(drawGraph).catch(e=>console.warn('grafiek: sensor niet aangezet', e));
}

function grWeg(pid){
  grKeuze=grKeuze.filter(p=>p!==pid);
  activeTrendGroup=null;
  drawGraph();
}

// De keuzelijst: alleen sensoren die deze auto levert. Naam wordt nog op
// veel plekken aangeroepen na een PID-scan, vandaar de oude naam.
function rebuildGSel(){
  const sel=document.getElementById('gsel'); if(!sel) return;
  sel.innerHTML='<option value="">＋ Sensor toevoegen…</option>';
  const bron=discoveredPIDDefs.length>0?discoveredPIDDefs:PIDS;
  bron.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'nl')).forEach(p=>{
    const o=document.createElement('option');
    o.value=p.pid; o.textContent=p.name+(p.unit?' ('+p.unit+')':'');
    sel.appendChild(o);
  });
  grKeuze=grKeuze.filter(pid=>bron.some(d=>d.pid===pid) || pidHist[pid]);
}

// Eigen klok: één keer per seconde, en alleen als het tabblad in beeld is.
function _grTik(){
  const pane=document.getElementById('pane-graph');
  if(!pane || !pane.classList.contains('active') || document.hidden || !grKeuze.length) return;
  drawGraph();
}
if(typeof setInterval==='function' && !_grKlok) _grKlok=setInterval(()=>{
  try{ _grTik(); }catch(e){ console.warn('grafiek: tik mislukt', e); }
}, 1000);

// Oude ingangen die nog in opgeslagen HTML of andere modules kunnen staan.
function selectTrendGroup(g){ if(g==='none'){ activeTrendGroup=null; grKeuze=[]; drawGraph(); } else grKiesGroep(g); }
function changeGraph(v){ grVoegToe(v); }
function isPIDOk(pid){
  const val=pidVals[pid]; if(val===undefined) return true;
  return (typeof isPIDOkVal==='function') ? isPIDOkVal(pid,val) : true;
}

// ════════════════════════════════════════
// DTC
// ════════════════════════════════════════
async function scanDTC(){
  document.getElementById('bscan').disabled=true;
  document.getElementById('dtcList').innerHTML='<div class="ai-ld"><div class="spin"></div> Foutcodes ophalen...</div>';
  await delay(demoMode?1500:2000);
  if(demoMode){
    // Scenario-override: gebruik handmatig gezette DTC's als die er zijn.
    if(_scenario.enabled && _scenario.dtcs.length) dtcCodes=[..._scenario.dtcs];
    else dtcCodes=Math.random()>.5?['P0171','P0420']:[];
  }
  else dtcCodes=await realScanDTC();
  // "Er is gekeken" (#218): pas ná het antwoord. Stond eerst bovenaan, dan zei
  // het onderdeelpaneel tijdens de scan en na een fout "geen foutcodes".
  window._didDTCScan=true;
  renderDTC();
  document.getElementById('bscan').disabled=false;
  document.getElementById('bclr').disabled=!dtcCodes.length;
  log(`Scan: ${dtcCodes.length} code(s)`,dtcCodes.length?'warn':'ok');
  try{ PidLaneEvalLog.log('dtc','uitgelezen',{codes:[...dtcCodes]}); }catch(e){ /* stil: eigen telemetrielog (PidLaneEvalLog) — mag de scan nooit blokkeren */ }
  // Uitlezing bewaren in het sessie-rapportarchief (📄 Rapporten-knop + AI-context)
  try{ registerSessionReport({type:'dtc', title:'Foutcode-uitlezing — '+(dtcCodes.length?dtcCodes.length+' code'+(dtcCodes.length===1?'':'s'):'geen codes'), text:_srDtcText()}); }catch(e){ console.warn('_srDtcText mislukt:', e); }
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
