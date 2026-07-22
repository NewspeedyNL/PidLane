/* pidlane-veldlab.js — uitgelicht uit index.html (build 2026-07-19, splitronde 2).
   Laadt als <script src> op exact de oorspronkelijke positie in de
   documentvolgorde; top-level declaraties zijn in klassieke scripts
   globaal over blokgrenzen heen, dus alle bestaande aanroepen blijven
   ongewijzigd werken. Inhoud: Veldlab-sessies, Airtable-cloudsync en de Full Veldlab Survey (v2). */
/* ══════════════════════════════════════════════════════════════════════════
   VELDLAB (vervangt de 25-sessies checklist)
   Principe: elke ECHTE adapterverbinding is automatisch een meetsessie —
   0 handelingen, geen los venster, geen teller. Vragen worden alléén gesteld
   als de auto iets NIEUWS oplevert (nieuwe dekkingscel, nieuw merk of een
   anomalie) — max 3 taps in een bottom sheet. Alles wordt cumulatief lokaal
   opgeslagen; het 🧪 Veldlab-dashboard (admin) destilleert er structurele
   verbeterpunten uit: PID-faal-heatmap per merk, AI-scorebord (verdict vs
   monteur), dekkingsmatrix brandstof×leeftijd, testadvies ("welke auto levert
   nu het meeste op") en een verzadigingssignaal ("stoppen mag").
   Export: JSON voor pidlane-veldlab.html (desktop-analyse) of voor Claude.
   ══════════════════════════════════════════════════════════════════════════ */
window.PidLaneEvalLog = (function(){
  let s=null, subs=[], bound=false;
  const now=()=>Date.now();
  function _log(cat,msg,data){
    if(!s) return;
    s.events.push({t:now(),cat,msg,data:data||null});
    if(s.events.length>800) s.events.splice(0,100);
    subs.forEach(f=>{try{f(s)}catch(e){}});
    if(cat==='ai' && data && data.stoplicht){ try{ setTimeout(function(){ try{ vlMicroCheck(); }catch(e){} }, 1200); }catch(e){} }
  }
  function bindCrash(){
    window.addEventListener('error', ev=>{ if(s) _log('fout','crash: '+(ev.message||'')); });
    window.addEventListener('unhandledrejection', ev=>{ if(s) _log('fout','promise-fout: '+((ev.reason&&ev.reason.message)||ev.reason||'')); });
  }
  return {
    get active(){ return !!s; },
    start(id,meta){ s={id, tester:(meta&&meta.tester)||'', startedAt:now(), events:[], invalid:false, human:{}, asked:false}; if(!bound){bindCrash();bound=true;} _log('sessie','veldsessie gestart'); return id; },
    log:_log,
    onUpdate(f){ subs.push(f); },
    snapshot(){ return s? JSON.parse(JSON.stringify(s)) : null; },
    markInvalid(){ if(s) s.invalid=true; },
    setHuman(k,v){ if(s) s.human[k]=v; },
    setAsked(){ if(s) s.asked=true; },
    get asked(){ return !!(s&&s.asked); },
    stop(){ const c=this.snapshot(); s=null; subs=[]; return c; }
  };
})();

/* ---- opslag & signatuur ---- */
const VL_KEY='pl_veldlab_v1';
function vlLoad(){ try{ const r=JSON.parse(localStorage.getItem(VL_KEY)||'null'); if(r&&Array.isArray(r.sessies)) return r; }catch(e){} return {sessies:[]}; }
function vlSave(st){ try{ while(JSON.stringify(st).length>450000 && st.sessies.length>20) st.sessies.splice(0,10); localStorage.setItem(VL_KEY,JSON.stringify(st)); }catch(e){} }
function vlCaptureOn(){ try{ return localStorage.getItem('pl_veldlab_uit')!=='1'; }catch(e){ return true; } }
function vlAgeBand(y){ y=parseInt(y,10)||0; if(!y) return '?'; return y<2008?'<2008' : y<2016?'2008-15' : y<2021?'2016-20' : '2021+'; }
function vlFuel(b){ b=(b||'').toString().toLowerCase(); if(/benz/.test(b))return 'benzine'; if(/dies/.test(b))return 'diesel'; if(/hybr/.test(b))return 'hybride'; if(/elek|electr|\bev\b/.test(b))return 'ev'; return b?'anders':'?'; }
function vlProtoClass(p){ p=p||''; return /15765|CAN/i.test(p)?'can':(p?'legacy':'?'); }

/* ---- events -> compacte afgeleide (zelfde categorieën als voorheen) ---- */
function vlDerive(ev){
  const g={voertuig:{},adapter:{type:'',connectMs:null,disconnects:0,protocol:'',lat:[]},
    pids:{discovered:null,failed:{}},dtc:{codes:[],freeze:false},
    ai:{stoplicht:'',tokensIn:0,tokensOut:0,latencyMs:0,fallback:false},
    nav:{doors:{},live:0,share:0},pidq:[],fouten:[]};
  for(const e of ev){ const d=e.data||{}; switch(e.cat){
    case 'voertuig': Object.assign(g.voertuig,d); break;
    case 'adapter':
      if(/verbonden|connect/i.test(e.msg)){ if(d.type)g.adapter.type=d.type; if(d.connectMs!=null)g.adapter.connectMs=d.connectMs; if(d.protocol)g.adapter.protocol=d.protocol; }
      if(/disconnect|verbroken/i.test(e.msg)) g.adapter.disconnects++;
      if(/latency/i.test(e.msg)&&d.ms!=null) g.adapter.lat.push(d.ms);
      if(!g.adapter.protocol&&/15765|CAN|ISO|KWP|9141/i.test(e.msg)) g.adapter.protocol=e.msg.slice(0,60);
      break;
    case 'pid': if(d.aantal!=null)g.pids.discovered=d.aantal; if(/faalt|NO DATA/i.test(e.msg)&&d.pid)g.pids.failed[d.pid]=1; break;
    case 'dtc': if(Array.isArray(d.codes))g.dtc.codes=d.codes; if(d.freeze)g.dtc.freeze=true; break;
    case 'ai':
      if(d.stoplicht)g.ai.stoplicht=d.stoplicht; if(d.tokensIn)g.ai.tokensIn+=d.tokensIn; if(d.tokensOut)g.ai.tokensOut+=d.tokensOut;
      if(d.latencyMs)g.ai.latencyMs=d.latencyMs; if(d.fallback)g.ai.fallback=true; break;
    case 'nav': if(d.naam)g.nav.doors[d.naam]=1; if(/live/i.test(e.msg))g.nav.live++; break;
    case 'share': g.nav.share++; break;
    case 'fout': g.fouten.push({t:e.t,msg:e.msg}); break;
    case 'pidq': g.pidq.push(d); break;
  }}
  return g;
}

/* ---- nieuwswaarde t.o.v. wat al verzameld is ---- */
function vlNovelty(g){
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
  const fuel=vlFuel(v.brandstof||g.voertuig.brandstof), band=vlAgeBand(v.year||g.voertuig.bouwjaar), pc=vlProtoClass(g.adapter.protocol);
  const cell=fuel+'|'+band+'|'+pc, merk=((v.merk||g.voertuig.merk||'')+'').toLowerCase();
  const st=vlLoad();
  const newCell=!st.sessies.some(x=>x.cell===cell);
  const newMerk=!!merk && !st.sessies.some(x=>x.merk===merk);
  const anomaly=g.ai.fallback || g.fouten.length>0 || g.pidq.length>0 || g.ai.stoplicht==='rood';
  return { cell, merk, fuel, band, pc, newCell, newMerk, anomaly,
    score: newCell?1 : (newMerk?0.6 : (anomaly?0.3 : 0.05)) };
}

/* ---- afsluiten & opslaan (automatisch bij disconnect / app-sluiten) ---- */
function vlFinalize(){
  if(!window.PidLaneEvalLog || !PidLaneEvalLog.active) return;
  const snap=PidLaneEvalLog.stop(); if(!snap) return;
  try{ const el=document.getElementById('vlSheet'); if(el) el.remove(); }catch(e){}
  if(snap.invalid){ try{ log('🧪 Veldlab: sessie ongeldig (demo actief) — niet opgeslagen','warn'); }catch(e){} return; }
  if((snap.events||[]).length<4) return; // te weinig gebeurd om iets van te leren
  const g=vlDerive(snap.events||[]);
  const nv=vlNovelty(g);
  const lat=g.adapter.lat.length? Math.round(g.adapter.lat.reduce((a,b)=>a+b,0)/g.adapter.lat.length) : null;
  const rec={ id:snap.id, t:snap.startedAt, dur:Math.max(1,Math.round((Date.now()-snap.startedAt)/60000)), tester:snap.tester||'',
    merk:nv.merk, cell:nv.cell, fuel:nv.fuel, band:nv.band, pc:nv.pc,
    veh:{merk:(typeof vehicleInfo!=='undefined'&&vehicleInfo.merk)||'', model:(typeof vehicleInfo!=='undefined'&&vehicleInfo.model)||'', jaar:(typeof vehicleInfo!=='undefined'&&vehicleInfo.year)||''},
    adp:{type:g.adapter.type, connectMs:g.adapter.connectMs, lat:lat, disc:g.adapter.disconnects, proto:g.adapter.protocol},
    pids:{n:g.pids.discovered, fail:Object.keys(g.pids.failed), q:g.pidq.slice(0,12)},
    dtc:g.dtc.codes, ai:{verdict:g.ai.stoplicht, ms:g.ai.latencyMs, fb:g.ai.fallback, tok:(g.ai.tokensIn+g.ai.tokensOut)},
    nav:{doors:Object.keys(g.nav.doors), live:g.nav.live, share:g.nav.share},
    errs:g.fouten.slice(0,10).map(f=>String(f.msg||'').slice(0,140)),
    human:snap.human||{}, novel:nv.score };
  const st=vlLoad(); st.sessies.push(rec); vlSave(st);
  try{ vlAtPush(rec); }catch(e){}
  try{ log('🧪 Veldlab: sessie #'+st.sessies.length+' vastgelegd ('+nv.cell+(nv.newCell?' — NIEUW terrein':nv.newMerk?' — nieuw merk':'')+')','ok'); }catch(e){}
  vlEnsureBtn(true);
}
window.addEventListener('pagehide', function(){ try{ vlFinalize(); }catch(e){} });

/* ════════════════════════════════════════
   VELDLAB → AIRTABLE CLOUD-SYNC (via Cloudflare Worker)
   Centrale opslag over alle testdevices (telefoon/tablet/laptop).
   De app kent GEEN Airtable-token; records gaan naar de eigen Worker
   (pidlane-veldlab-worker.js) die het token als secret bewaart en
   doorstuurt naar base "PidLane Veldlab". Zonder bereik → offline-
   wachtrij in localStorage, automatisch geflusht bij online/opstarten.
   Endpoint: PROXY_URL + '/airtable/veldlab' (bestaande pidlane-proxy),
   met X-App-Token; overschrijfbaar via const VELDLAB_ENDPOINT in config.js.
   Geen endpoint geconfigureerd = stil overslaan, lokaal blijft leidend.
   ════════════════════════════════════════ */
const VL_AT={qKey:'pl_veldlab_atq'};
function vlAtEndpoint(){ try{
  if(typeof VELDLAB_ENDPOINT!=='undefined'&&VELDLAB_ENDPOINT) return VELDLAB_ENDPOINT;
  const ls=localStorage.getItem('pl_vl_endpoint'); if(ls) return ls;
  if(typeof PROXY_URL!=='undefined'&&PROXY_URL) return PROXY_URL.replace(/\/$/,'')+'/airtable/veldlab';
  return '';
}catch(e){ return ''; } }
function vlAtQueue(f){ try{
  const q=JSON.parse(localStorage.getItem(VL_AT.qKey)||'[]'); q.push(f);
  while(q.length>60)q.shift();
  // Byte-cap: 60 records × max 95KB JSON kon de ~5MB localStorage-quota
  // overschrijden → stille QuotaExceeded → onzichtbaar dataverlies. Oudste
  // records eruit tot de wachtrij onder ~2MB blijft.
  let s=JSON.stringify(q);
  while(s.length>2000000 && q.length>1){ q.shift(); s=JSON.stringify(q); }
  localStorage.setItem(VL_AT.qKey,s);
}catch(e){} }
// Identiteit van een queue-record (voor veilig verwijderen na verzenden)
function _vlAtRecId(f){ return String((f&&f.SessieID)||'')+'|'+String((f&&f.Datum)||''); }
let _vlAtBusy=false;
async function vlAtFlush(){
  if(_vlAtBusy) return; const ep=vlAtEndpoint(); if(!ep) return;
  _vlAtBusy=true;
  try{
    // RACE-FIX: niet een in-memory snapshot terugschrijven (dat overschreef
    // records die tíjdens de flush via vlAtQueue binnenkwamen), maar per batch
    // de wachtrij VERS herlezen en alleen de zojuist verzonden records eruit
    // filteren op identiteit.
    for(let guard=0; guard<20; guard++){
      let q=[]; try{ q=JSON.parse(localStorage.getItem(VL_AT.qKey)||'[]'); }catch(e){}
      if(!q.length){ if(guard>0){ try{ log('☁ Veldlab → Airtable gesynchroniseerd','ok'); }catch(e){} } return; }
      const batch=q.slice(0,10);
      const res=await fetch(ep,{
        method:'POST', headers:{'Content-Type':'application/json','X-App-Token':(typeof APP_TOKEN!=='undefined'&&APP_TOKEN)||''},
        body:JSON.stringify({records:batch.map(f=>({fields:f}))})});
      if(!res.ok) throw new Error('sync HTTP '+res.status);
      const sent=new Set(batch.map(_vlAtRecId));
      let fresh=[]; try{ fresh=JSON.parse(localStorage.getItem(VL_AT.qKey)||'[]'); }catch(e){}
      const remaining=fresh.filter(f=>{ const id=_vlAtRecId(f); if(sent.has(id)){ sent.delete(id); return false; } return true; });
      localStorage.setItem(VL_AT.qKey, JSON.stringify(remaining));
    }
  }catch(e){ try{ btDiag('☁ Veldlab-sync wacht ('+(e.message||e)+') — blijft in wachtrij','warn'); }catch(_){} }
  finally{ _vlAtBusy=false; }
}
function vlAtPush(rec){
  const ua=navigator.userAgent||'';
  const dev=/Android.*Mobile|iPhone/i.test(ua)?'telefoon':(/Android|iPad|Tablet/i.test(ua)?'tablet':'laptop');
  vlAtQueue({ 'SessieID':String(rec.id||('s-'+(rec.t||Date.now()))),
    'Datum':new Date(rec.t||Date.now()).toISOString(),
    'Type':rec.survey?'survey':'sessie', 'Tester':rec.tester||'', 'Device':dev,
    'Merk':(rec.veh&&rec.veh.merk)||'', 'Model':(rec.veh&&rec.veh.model)||'', 'Jaar':String((rec.veh&&rec.veh.jaar)||''),
    'Cell':rec.cell||'', 'Verdict':(rec.ai&&rec.ai.verdict)||'',
    'PidsOk':(rec.survey&&rec.survey.pids&&rec.survey.pids.ok)||((rec.pids&&rec.pids.n)||0),
    'PidsFail':(rec.pids&&rec.pids.fail&&rec.pids.fail.length)||0,
    'AvgMs':(rec.adp&&rec.adp.lat)||0,
    'DTC':(rec.dtc||[]).slice(0,8).join(' '),
    'JSON':JSON.stringify(rec).slice(0,95000) });
  vlAtFlush();
}
window.addEventListener('online', function(){ try{ vlAtFlush(); }catch(e){} });
setTimeout(function(){ try{ vlAtFlush(); }catch(e){} }, 6000);

/* ════════════════════════════════════════
   FULL VELDLAB SURVEY (admin, ⋯-menu)
   Eén klik op een aangesloten auto → geautomatiseerde diepe meting van
   alles wat handmatig niet te testen valt: adapter-info, ALLE ondersteunde
   PIDs (waarde + responstijd + kwaliteitsoordeel), multi-PID batchtest,
   DTC actief+pending, en timing-profiel. Resultaat gaat als rijke sessie
   de veldlab-database in (JSON-export pikt hem automatisch mee) én wordt
   direct als los survey-JSON gedownload. Normale werkwijze blijft intact.
   ════════════════════════════════════════ */
/* ── Survey v2 parsing-helpers ──
   Delen dezelfde normalisatie-aanpak als extractVIN: per regel CAN-headers
   (7E8/18DAxx) en ISO-TP PCI-bytes strippen, daarna markers zoeken. */
function _svNormHex(raw){
  let out='';
  for(let line of String(raw||'').split(/[\r\n]+/)){
    line=line.trim();
    // ELM multi-frame formattering "0:", "1:" — headers/PCI zijn dan al
    // door de ELM verwerkt, dus NIET nogmaals strippen (byte 0x34 = '4'
    // zou anders als Consecutive-Frame PCI worden aangezien).
    const numbered=/^\d+:\s*/.test(line);
    line=line.replace(/^\d+:\s*/,'');
    let hex=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    if(!hex || (!numbered && hex.length<=3)) continue;   // leeg of losse lengte "008"
    if(!numbered){
      if(/^18DA/.test(hex)) hex=hex.slice(8);             // 29-bit CAN header
      else if(/^7E[89A-F]/.test(hex)) hex=hex.slice(3);   // 11-bit CAN header
      if(/^1[0-9A-F]/.test(hex)) hex=hex.slice(4);        // ISO-TP First Frame
      else if(/^[23][0-9A-F]/.test(hex)) hex=hex.slice(2);// Consecutive/Flow
    }
    out+=hex;
  }
  return out;
}
// ASCII na een mode-09 marker (bv. '4904' → Calibration ID)
function _svAsciiAfter(raw, marker){
  try{
    const h=_svNormHex(raw); const i=h.indexOf(marker);
    if(i===-1) return '';
    let body=h.slice(i+marker.length);
    if(/^0[0-9A-F]/.test(body)) body=body.slice(2);     // telbyte (aantal records)
    let s='';
    for(let k=0;k+2<=body.length && s.length<64;k+=2){
      const c=parseInt(body.slice(k,k+2),16);
      if(c>=32&&c<=126) s+=String.fromCharCode(c);
    }
    return s.replace(/\s+/g,' ').trim();
  }catch(e){ return ''; }
}
// Hex-records na een mode-09 marker (bv. '4906' → CVN, 4 bytes per record)
function _svHexRecs(raw, marker, recLen){
  try{
    const h=_svNormHex(raw); const i=h.indexOf(marker);
    if(i===-1) return [];
    let body=h.slice(i+marker.length);
    if(/^0[0-9A-F]/.test(body)) body=body.slice(2);     // telbyte
    const recs=[];
    for(let k=0;k+recLen<=body.length && recs.length<4;k+=recLen) recs.push(body.slice(k,k+recLen));
    return recs;
  }catch(e){ return []; }
}
// DTC-codes uit een mode 07/0A respons (hdr '47' of '4A')
function _svDtc(raw, hdr){
  const codes=[];
  try{
    const h=_svNormHex(raw);
    let i=h.indexOf(hdr);
    while(i!==-1 && codes.length<16){
      let body=h.slice(i+2);
      const cnt=parseInt(body.slice(0,2),16);
      if(!isNaN(cnt)&&cnt>=0&&cnt<=10&&body.length>=2+cnt*4) body=body.slice(2,2+cnt*4);
      for(let k=0;k+4<=body.length&&k<40;k+=4){
        const w=parseInt(body.slice(k,k+4),16);
        if(!w||isNaN(w)) continue;
        const t=['P','C','B','U'][(w>>14)&3];
        const c=t+((w>>12)&3)+((w>>8)&0xF).toString(16).toUpperCase()+('00'+(w&0xFF).toString(16).toUpperCase()).slice(-2);
        if(!codes.includes(c)) codes.push(c);
      }
      i=h.indexOf(hdr,i+2);
    }
  }catch(e){}
  return codes;
}
// Readiness-monitors decoderen uit een ruwe 0101-respons (J1979 bytes A-D)
function _svReadiness(raw){
  try{
    const h=_svNormHex(raw); const i=h.indexOf('4101');
    if(i===-1||h.length<i+12) return null;
    const A=parseInt(h.slice(i+4,i+6),16), B=parseInt(h.slice(i+6,i+8),16),
          C=parseInt(h.slice(i+8,i+10),16), D=parseInt(h.slice(i+10,i+12),16);
    if([A,B,C,D].some(isNaN)) return null;
    const diesel=!!(B&0x08);
    const mons=[];
    [['Misfire',0],['Brandstofsysteem',1],['Componenten',2]].forEach(([n,b])=>{
      if(B&(1<<b)) mons.push({monitor:n, gereed:!(B&(1<<(b+4)))});
    });
    const N=diesel
      ?['NMHC-katalysator','NOx/SCR','','Boostdruk','','Roetfilter (DPF)','Uitlaatgassensor','EGR/VVT']
      :['Katalysator','Katalysator (verwarmd)','EVAP','Secundaire lucht','Airco','O2-sensor','O2-verwarming','EGR/VVT'];
    for(let b=0;b<8;b++){
      if(!N[b] || !(C&(1<<b))) continue;
      mons.push({monitor:N[b], gereed:!(D&(1<<b))});
    }
    return { mil:!!(A&0x80), dtcCount:A&0x7F,
      ontsteking:diesel?'compressie (diesel)':'vonk (benzine)',
      monitors:mons, nietGereed:mons.filter(m=>!m.gereed).map(m=>m.monitor) };
  }catch(e){ return null; }
}
// Brandstoftype-codes volgens SAE J1979 PID 0151
const _SV_FUELTYPES={1:'benzine',2:'methanol',3:'ethanol',4:'diesel',5:'LPG',6:'CNG',7:'propaan',8:'elektrisch',9:'benzine/E85 (flex)',17:'hybride benzine',18:'hybride E85',19:'hybride diesel',20:'hybride elektrisch',21:'hybride verbrandingsmotor',22:'hybride regeneratief',23:'plug-in hybride benzine',24:'plug-in hybride diesel'};
// PIDs waar 0 een volkomen geldige waarde is (MIL uit, 0 km met MIL, etc.) —
// de nul-als-dummy heuristiek van assessPidQuality geldt hier niet.
const _SV_NUL_GELDIG=new Set(['0101','0102','011E','011F','0121','0130','0131','014D','014E','0161']);
let _vlSvBusy=false, _vlSvAbort=false;
function _vlSvUI(msg, done){
  let ov=document.getElementById('vlSvOv');
  if(!ov){
    ov=document.createElement('div'); ov.id='vlSvOv';
    ov.style.cssText='position:fixed;inset:0;z-index:9960;background:rgba(10,14,20,.92);color:#eaf0f6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:600 15px system-ui;padding:24px;text-align:center';
    ov.innerHTML='<div style="font-size:28px">📋</div><div id="vlSvMsg"></div><button id="vlSvBtn" style="background:#1b2735;color:#eaf0f6;border:1px solid #33475c;border-radius:10px;padding:10px 18px;font:600 14px system-ui;cursor:pointer">Afbreken</button>';
    document.body.appendChild(ov);
    document.getElementById('vlSvBtn').onclick=()=>{ if(_vlSvBusy){ _vlSvAbort=true; } else ov.remove(); };
  }
  document.getElementById('vlSvMsg').innerHTML=msg;
  document.getElementById('vlSvBtn').textContent=done?'Sluiten':'Afbreken';
}
async function vlFullSurvey(){
  if(!isAdmin()){ showToast('Alleen voor admin'); return; }
  if(!connected || demoMode){ showToast('Eerst verbinden met een echte auto (geen demo)'); return; }
  if(_vlSvBusy) return;
  _vlSvBusy=true; _vlSvAbort=false;
  // De survey leest élke ondersteunde PID (soms 2×) plus bitmaps, DTC-modes en
  // batchtrappen. Zonder busslot vecht dat de hele tijd met de poll-loop: de
  // survey duurt dan twee keer zo lang én de live view valt om. Slot pakken,
  // en pas in de finally weer teruggeven.
  try{ setPollProfile('expert','full survey'); }catch(e){}
  let _svBusTok=0;
  try{ _svBusTok=await PLBus.wait('full-survey', 8000); }catch(_){}
  try{showBusyPill('📋 Full Survey — bus tijdelijk zwaar belast…',15000);}catch(_){}
  const clean=s=>String(s||'').replace(/[\r\n>]+/g,' ').replace(/\s+/g,' ').trim();
  const t0=Date.now();
  const sv={type:'survey', t:t0, tester:(window.currentUser&&currentUser.name)||''};
  try{
    _vlSvUI('Adapter-info uitlezen…');
    sv.schema=2;                                             // survey-formaat versie
    sv.app=(typeof APP_VERSION!=='undefined')?String(APP_VERSION):'?';
    sv.adapter={ id:clean(await sendCmd('ATI',1500)), volt:clean(await sendCmd('ATRV',1500)),
      protoNum:clean(await sendCmd('ATDPN',1500)),
      proto:(selectedNetwork&&(selectedNetwork.name||selectedNetwork.desc||selectedNetwork.id))||'' };
    // STI: echte STN-chip identiteit (OBDLink e.d.); kloon-ELM antwoordt '?'
    try{ sv.adapter.sti=clean(await sendCmd('STI',1500)); }catch(e){ sv.adapter.sti=''; }
    sv.adapter.stn=/STN[0-9]/i.test(sv.adapter.sti||'');
    sv.veh={merk:vehicleInfo.merk||'',model:vehicleInfo.model||'',jaar:vehicleInfo.year||'',vin:vehicleInfo.vin||'',brandstof:vehicleInfo.brandstof||''};

    // ── ECU-software identiteit: CALID (0904) + CVN (0906) ──
    // CVN = checksum van de kalibratie → afwijkende CVN t.o.v. eerdere survey
    // van hetzelfde CALID duidt op chiptuning/remap. Goud voor de Koopcheck.
    _vlSvUI('ECU-software (CALID/CVN)…');
    try{ const r=await sendCmd('0904',4000); sv.calid={ascii:_svAsciiAfter(r,'4904'), raw:clean(r).slice(0,160)}; }catch(e){ sv.calid=null; }
    try{ const r=await sendCmd('0906',4000); sv.cvn={hex:_svHexRecs(r,'4906',8), raw:clean(r).slice(0,160)}; }catch(e){ sv.cvn=null; }

    // ── Readiness-monitors (0101, volledig gedecodeerd) ──
    _vlSvUI('Readiness-monitors (0101)…');
    try{ sv.readiness=_svReadiness(await sendCmd('01011',2000)); }catch(e){ sv.readiness=null; }

    // ── Ruwe supported-PID bitmaps: exacte dekkings-vingerafdruk ──
    _vlSvUI('Supported-PID bitmaps…');
    sv.bitmaps={};
    for(const bp of ['0100','0120','0140','0160','0180']){
      if(_vlSvAbort) throw new Error('afgebroken door gebruiker');
      try{ const r=await sendCmd(bp,2000); if(r&&!/NO DATA|ERROR|UNABLE/i.test(r)) sv.bitmaps[bp]=clean(r).slice(0,120); }catch(e){}
    }

    const pids=[...supportedPIDs];
    sv.pids={total:pids.length, ok:0, nodata:0, invalid:0, detail:[]};
    for(let i=0;i<pids.length;i++){
      if(_vlSvAbort) throw new Error('afgebroken door gebruiker');
      const pid=pids[i];
      _vlSvUI('PID-sweep '+(i+1)+'/'+pids.length+'<br><span style="font-weight:400;font-size:13px;opacity:.8">'+pid+'</span>');
      const s0=performance.now();
      let raw=''; try{ raw=await sendCmd('01'+pid.slice(2)+'1',1800); }catch(e){}
      const ms=Math.round(performance.now()-s0);
      const def=getPidDef(pid)||{};
      let st='nodata', val=null, q='', flaky=false;
      if(raw && !/NO DATA|UNABLE|ERROR|STOPPED/i.test(raw)){
        val=parsePID(pid,raw);
        if(val==null){ st='invalid'; }
        else{ try{ q=assessPidQuality(pid,val,true).status; }catch(e){ q='ok'; } st=(q==='ok')?'ok':'invalid'; }
        // Nul-geldig whitelist: bij status/teller-PIDs (MIL uit, 0 km met MIL
        // aan, etc.) is 0 een correcte waarde — geen dummy-detectie toepassen.
        if(st==='invalid' && val!==null && _SV_NUL_GELDIG.has(pid)){ st='ok'; q='ok'; }
      }
      // Flaky vs. echt afwezig: nodata krijgt één herkansing na korte pauze.
      // Slaagt die, dan telt de PID als ok maar met flaky-vlag → het veldlab
      // weet dan dat deze PID een retry-strategie nodig heeft i.p.v. pruning.
      if(st==='nodata' && !_vlSvAbort){
        await delay(150);
        let raw2=''; try{ raw2=await sendCmd('01'+pid.slice(2)+'1',1800); }catch(e){}
        if(raw2 && !/NO DATA|UNABLE|ERROR|STOPPED/i.test(raw2)){
          const v2=parsePID(pid,raw2);
          if(v2!=null){ val=v2; st='ok'; q='ok'; flaky=true; }
        }
      }
      sv.pids[st]++;
      const _d={pid, naam:(def.name||def.naam||'').slice(0,40), val, unit:def.unit||'', ms, st, q};
      if(flaky) _d.flaky=true;
      sv.pids.detail.push(_d);
    }

    _vlSvUI('Multi-PID batchtrap (2→4→6)…');
    const isCAN=/^[6-9A-C]/i.test(String(selectedNetwork?.id||''));
    if(isCAN){
      // Oplopend testen hoeveel PIDs deze auto per request aankan — voedt de
      // startwaarde van de adaptieve batch sizing per voertuigcel.
      const cand=['010C','010D','0105','0104','010B','010F','0111','010E'].filter(p=>pids.includes(p));
      sv.batch={ladder:[], maxPids:0, ok:false, req:''};
      for(const n of [2,4,6]){
        if(_vlSvAbort) throw new Error('afgebroken door gebruiker');
        if(cand.length<n) break;
        const req='01'+cand.slice(0,n).map(p=>p.slice(2)).join('');
        let braw=''; try{ braw=await sendCmd(req,3000); }catch(e){}
        const ok=!!braw && /41/i.test(braw) && !/NO DATA|ERROR|UNABLE/i.test(braw);
        sv.batch.ladder.push({n, req, ok, raw:clean(braw).slice(0,140)});
        if(ok){ sv.batch.maxPids=n; sv.batch.ok=true; sv.batch.req=req; }
        else break;
      }
    } else sv.batch={ok:false, reden:'geen CAN-protocol'};

    // ── Multi-ECU detectie: welke modules antwoorden op de bus? ──
    // Headers tijdelijk aan; 7E8 = motor-ECU, 7E9 = vaak transmissie, etc.
    // Onthult of er een TCU meeluistert — relevant voor Service $22 later.
    _vlSvUI('ECU-detectie (headers)…');
    sv.ecus={n:0, headers:[]};
    try{
      await sendCmd('ATH1',1500);
      const hr=await sendCmd('0100',3000);
      const hset=new Set();
      String(hr||'').split(/[\r\n]+/).forEach(l=>{
        const m=l.trim().replace(/\s+/g,'').toUpperCase().match(/^(18DAF1[0-9A-F]{2}|7E[89A-F])/);
        if(m) hset.add(m[1]);
      });
      sv.ecus={n:hset.size, headers:[...hset]};
    }catch(e){}
    finally{ try{ await sendCmd('ATH0',1500); }catch(e){} }

    _vlSvUI('DTC uitlezen (actief + pending + permanent)…');
    let d03=[]; try{ d03=await realScanDTC()||[]; }catch(e){}
    let d07=''; try{ d07=clean(await sendCmd('07',2500)); }catch(e){}
    // Mode 0A: permanente DTC's — NIET wisbaar, blijven staan tot de monitor
    // zelf opnieuw slaagt. Dé schoonpoets-detector voor de Koopcheck:
    // 0 km sinds wissen + permanente code = rode vlag.
    let d0A=''; try{ d0A=clean(await sendCmd('0A',2500)); }catch(e){}
    sv.dtc={ actief:d03,
      pending:_svDtc(d07,'47'),   pendingRaw:d07.slice(0,120),
      permanent:_svDtc(d0A,'4A'), permanentRaw:d0A.slice(0,120) };

    // ── Extra identiteits-PIDs (buiten supportedPIDs om proberen) ──
    _vlSvUI('Extra PIDs (brandstoftype, odometer)…');
    // 0151: brandstoftype volgens de ECU zelf — kruischeck tegen RDW/gebruiker
    try{
      const r=await sendCmd('01511',2000); const h=_svNormHex(r); const i=h.indexOf('4151');
      if(i!==-1&&h.length>=i+6){ const c=parseInt(h.slice(i+4,i+6),16); if(!isNaN(c)) sv.ecuFuel={code:c, naam:_SV_FUELTYPES[c]||'onbekend ('+c+')'}; }
    }catch(e){}
    // 01A6: echte odometer via OBD (veel voertuigen 2019+; oudere geven NO DATA)
    try{
      const r=await sendCmd('01A61',2500); const h=_svNormHex(r); const i=h.indexOf('41A6');
      if(i!==-1&&h.length>=i+12){ const v=parseInt(h.slice(i+4,i+12),16); if(!isNaN(v)&&v>0) sv.odoKm=Math.round(v/10); }
    }catch(e){}

    // ── Variantie-sampling: ruisprofiel van dynamische sensoren ──
    // 4 snelle herhaalmetingen per PID → spreiding voedt de EWMA-tuning en
    // laat zien hoe "levendig" O2/load op dit voertuig zijn bij stationair.
    _vlSvUI('Variantie-sampling…');
    sv.variantie={};
    for(const vp of ['0104','010C','0114','010B'].filter(p=>pids.includes(p)).slice(0,4)){
      if(_vlSvAbort) throw new Error('afgebroken door gebruiker');
      const vals=[];
      for(let k=0;k<4;k++){
        try{ const r=await sendCmd('01'+vp.slice(2)+'1',1500); const v=parsePID(vp,r); if(v!=null&&!isNaN(v)) vals.push(v); }catch(e){}
      }
      if(vals.length>=2){
        const mn=Math.min(...vals), mx=Math.max(...vals);
        sv.variantie[vp]={n:vals.length, vals:vals.map(v=>+(+v).toFixed(2)), min:+mn.toFixed(2), max:+mx.toFixed(2), spreiding:+(mx-mn).toFixed(2)};
      }
    }

    _vlSvUI('Timing-profiel (010C ×5)…');
    const times=[];
    for(let k=0;k<5 && !_vlSvAbort;k++){
      const a=performance.now(); try{ await sendCmd('010C1',1500); }catch(e){}
      times.push(Math.round(performance.now()-a));
    }
    sv.timing={rpm5:times, avgMs:times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null};
    sv.durS=Math.round((Date.now()-t0)/1000);

    // → veldlab-database (JSON-export pikt survey automatisch mee)
    const fuel=vlFuel(sv.veh.brandstof), band=vlAgeBand(sv.veh.jaar), pc=vlProtoClass(sv.adapter.proto);
    const st2=vlLoad();
    st2.sessies.push({ id:'survey-'+t0, t:t0, dur:Math.max(1,Math.round(sv.durS/60)), tester:sv.tester,
      merk:(sv.veh.merk||'').toLowerCase(), cell:fuel+'|'+band+'|'+pc, fuel, band, pc,
      veh:{merk:sv.veh.merk,model:sv.veh.model,jaar:sv.veh.jaar},
      adp:{type:'📋 survey', proto:sv.adapter.proto, lat:sv.timing.avgMs},
      pids:{n:sv.pids.total, fail:sv.pids.detail.filter(x=>x.st!=='ok').map(x=>x.pid).slice(0,40)},
      dtc:sv.dtc.actief, ai:{}, nav:{doors:['survey']}, errs:[], human:{}, novel:0.8, survey:sv });
    vlSave(st2); try{ vlEnsureBtn(true); }catch(e){}
    try{ vlAtPush(st2.sessies[st2.sessies.length-1]); }catch(e){}

    // → direct los survey-JSON downloaden
    try{
      const blob=new Blob([JSON.stringify(sv,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='pidlane-survey-'+new Date(t0).toISOString().slice(0,10)+'.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    }catch(e){}

    try{ log('📋 Full survey v2: '+sv.pids.ok+' ok / '+sv.pids.nodata+' nodata / '+sv.pids.invalid+' ongeldig · gem. '+sv.timing.avgMs+'ms · batch max '+(sv.batch.maxPids||0)+' · DTC '+sv.dtc.actief.length+' actief / '+(sv.dtc.pending||[]).length+' pending / '+(sv.dtc.permanent||[]).length+' permanent · '+(sv.ecus?sv.ecus.n:0)+' ECU(s) — opgeslagen als veldlab-sessie #'+st2.sessies.length,'ok'); }catch(e){}
    const _flaky=sv.pids.detail.filter(x=>x.flaky).length;
    const _rdy=sv.readiness?(sv.readiness.nietGereed.length?sv.readiness.nietGereed.length+' monitor(s) niet gereed':'alle monitors gereed'):'readiness onbekend';
    _vlSvUI('✅ Survey klaar in '+sv.durS+'s<br><span style="font-weight:400;font-size:13px;opacity:.85">'+
      sv.pids.ok+' PIDs ok ('+_flaky+' flaky) · '+sv.pids.nodata+' niet aanwezig · '+sv.pids.invalid+' ongeldig<br>'+
      'Gem. '+sv.timing.avgMs+' ms · batch max '+(sv.batch.maxPids||0)+' PIDs · '+(sv.ecus?sv.ecus.n:0)+' ECU(s)<br>'+
      'DTC: '+sv.dtc.actief.length+' actief · '+(sv.dtc.pending||[]).length+' pending · '+(sv.dtc.permanent||[]).length+' permanent · '+_rdy+'<br>'+
      'CALID '+(sv.calid&&sv.calid.ascii?'✓':'—')+' · CVN '+(sv.cvn&&sv.cvn.hex&&sv.cvn.hex.length?'✓':'—')+' · odometer '+(sv.odoKm?sv.odoKm+' km':'—')+'<br>'+
      'Opgeslagen in Veldlab + JSON gedownload</span>', true);
  }catch(e){
    _vlSvUI('⏹ Survey gestopt: '+(e.message||e)+'<br><span style="font-weight:400;font-size:13px;opacity:.8">Deels gemeten data is niet opgeslagen.</span>', true);
  }finally{
    _vlSvBusy=false;
    try{ if(_svBusTok){ PLBus.release(_svBusTok); _svBusTok=0; } }catch(_){}
    // Bus is weer vrij: BT-strategie HERIJKEN op de echte pid-snelheid, zodat
    // analyses hierna op de juiste timing draaien. Eerdere metingen (tijdens
    // of vóór de survey/discovery) kunnen vertekend zijn.
    if(connected&&!demoMode){
      setTimeout(()=>{try{
        measureConnSpeed(6).then(sp=>{
          if(sp){applyStrategy(suggestStrategy(sp));
            try{btDiag('BT-strategie herijkt na Full Survey: '+sp.avgMs+'ms/read → '+_connStrategy,'ok');}catch(_){}}
        });
      }catch(_){}},1200);
    }
  }
}

/* ---- logvanger: auto-start bij echte verbinding, auto-stop bij verbroken ---- */
var _plPidFlagged={};
function _plEvalCapture(msg,type){
  try{
    var m=String(msg).replace(/<[^>]+>/g,'').trim(); if(!m) return;
    if(/^apiFetch: key/.test(m)) return;
    var t=(type||'').toLowerCase();
    if(!PidLaneEvalLog.active && vlCaptureOn() && t==='ok' && /verbonden/i.test(m) && !(typeof demoMode!=='undefined'&&demoMode)){
      _plPidFlagged={};
      var who=''; try{ who=(window.currentUser&&currentUser.name)||''; }catch(e){}
      PidLaneEvalLog.start('VL-'+Date.now().toString(36).toUpperCase(),{tester:who});
    }
    if(!PidLaneEvalLog.active) return;
    if(/demo geactiveerd|🚫 DEMO/i.test(m)) PidLaneEvalLog.markInvalid();
    var cat='app';
    if(t==='err') cat='fout';
    else if(/verbroken/i.test(m)){ PidLaneEvalLog.log('adapter','disconnect');
      setTimeout(function(){ try{ if(typeof connected==='undefined'||!connected) vlFinalize(); }catch(e){} }, 2500); return; }
    else if(/fallback/i.test(m)){ PidLaneEvalLog.log('ai','fallback',{fallback:true}); return; }
    else if(/verbind|verbonden|connect|adapter|\bSPP\b|\bBLE\b|latency|gekoppeld|ELM|protocol/i.test(m)) cat='adapter';
    else if(/RDW|kenteken|VIN/i.test(m)) cat='voertuig';
    else if(/foutcode|\bDTC\b|\bP0|\bP1|gewist|scan/i.test(m)) cat='dtc';
    else if(/analyse|rapport|monteur|datalog|token|\bAI\b/i.test(m)) cat='ai';
    else if(/deel|share|export/i.test(m)) cat='share';
    PidLaneEvalLog.log(cat, m);
  }catch(e){}
}
try{ if(typeof log==='function'){ var _plOrigLog=log; log=function(msg,type){ _plOrigLog(msg,type); _plEvalCapture(msg,type); }; } }catch(e){}

/* ---- verdachte PID's blijven gemeld (kennisbank-kandidaten) ---- */
function _plCheckPid(pid,val){
  try{
    if(!window.PidLaneEvalLog || !PidLaneEvalLog.active) return;
    if(_plPidFlagged[pid]) return;
    var def=null; try{ def=(typeof getPidDef==='function')?getPidDef(pid):null; }catch(e){}
    var reden='';
    if(!def || !def.name) reden='onbekende PID (geen naam)';
    else if(typeof val!=='number' || !isFinite(val)) reden='onzin-waarde (geen getal)';
    else if(def.min!=null && def.max!=null && (val < def.min-0.001 || val > def.max+0.001)) reden='buiten bereik ('+def.min+'…'+def.max+' '+(def.unit||'')+')';
    if(reden){ _plPidFlagged[pid]=1; PidLaneEvalLog.log('pidq','verdacht',{pid:pid,naam:(def&&def.name)||'',waarde:val,reden:reden}); }
  }catch(e){}
}

/* ---- adaptieve micro-check: alleen vragen als er iets te leren valt ---- */
function vlMicroCheck(){
  if(!PidLaneEvalLog.active || PidLaneEvalLog.asked) return;
  const snap=PidLaneEvalLog.snapshot(); if(!snap||snap.invalid) return;
  const g=vlDerive(snap.events||[]);
  const nv=vlNovelty(g);
  if(!(nv.newCell||nv.newMerk||nv.anomaly)) { try{ log('🧪 Veldlab: bekend terrein — geen vragen nodig','info'); }catch(e){} PidLaneEvalLog.setAsked(); return; }
  PidLaneEvalLog.setAsked();
  const why = nv.newCell?'Nieuw terrein: '+nv.fuel+' · '+nv.band+' · '+nv.pc : nv.newMerk?'Nieuw merk: '+(nv.merk||'?') : 'Afwijking gezien (fout/fallback/verdachte PID)';
  let el=document.getElementById('vlSheet'); if(el) el.remove();
  el=document.createElement('div'); el.id='vlSheet';
  el.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:9600;background:#141b23;border-top:1px solid #2a3644;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,.55);font-family:system-ui,sans-serif;color:#eaf0f6;max-height:70vh;overflow-y:auto';
  el.innerHTML=
    '<div style="font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px">🧪 Veldlab — 20 seconden <span style="margin-left:auto;font-weight:600;font-size:11px;color:#6b7d92">'+why.replace(/</g,'&lt;')+'</span></div>'+
    '<div style="font-size:12.5px;color:#9db0c4;margin:4px 0 12px">Alleen deze auto levert nieuwe kennis op — daarom nu wél 3 korte vragen.</div>'+
    '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Klopte het AI-oordeel'+(g.ai.stoplicht?' ('+g.ai.stoplicht.toUpperCase()+')':'')+'?</div>'+
    '<div id="vlSeg" style="display:flex;gap:8px;margin-bottom:12px">'+['Ja','Deels','Nee'].map(function(o){return '<button data-v="'+o+'" style="flex:1;background:#1f2a35;border:1px solid #2a3644;color:#9db0c4;padding:11px 6px;border-radius:10px;font:600 14px system-ui;cursor:pointer">'+o+'</button>';}).join('')+'</div>'+
    '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Wat was er werkelijk mis? (monteur — mag leeg)</div>'+
    '<textarea id="vlEcht" placeholder="bv. bobine cilinder 3" style="width:100%;box-sizing:border-box;background:#1f2a35;border:1px solid #2a3644;border-radius:10px;color:#eaf0f6;padding:10px;font:14px system-ui;min-height:52px;margin-bottom:12px"></textarea>'+
    '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Liep je ergens op vast? (mag leeg)</div>'+
    '<textarea id="vlBlok" placeholder="bv. delen-knop deed niets" style="width:100%;box-sizing:border-box;background:#1f2a35;border:1px solid #2a3644;border-radius:10px;color:#eaf0f6;padding:10px;font:14px system-ui;min-height:44px;margin-bottom:14px"></textarea>'+
    '<div style="display:flex;gap:10px"><button id="vlOk" style="flex:2;background:#2fd0d6;color:#052225;border:none;border-radius:11px;padding:13px;font:700 14px system-ui;cursor:pointer">Klaar</button>'+
    '<button id="vlSkip" style="flex:1;background:#1f2a35;border:1px solid #2a3644;color:#9db0c4;border-radius:11px;padding:13px;font:600 14px system-ui;cursor:pointer">Overslaan</button></div>';
  document.body.appendChild(el);
  el.querySelectorAll('#vlSeg button').forEach(function(b){ b.onclick=function(){
    el.querySelectorAll('#vlSeg button').forEach(function(x){ x.style.background='#1f2a35'; x.style.borderColor='#2a3644'; x.style.color='#9db0c4'; });
    var v=b.dataset.v;
    b.style.background = v==='Ja'?'#123322' : v==='Nee'?'#3a1414' : '#1c6f74';
    b.style.borderColor = v==='Ja'?'#3fd07a' : v==='Nee'?'#ff5b5b' : '#2fd0d6';
    b.style.color='#eaf0f6';
    PidLaneEvalLog.setHuman('correct', v);
  };});
  document.getElementById('vlOk').onclick=function(){
    PidLaneEvalLog.setHuman('echt', (document.getElementById('vlEcht').value||'').trim());
    PidLaneEvalLog.setHuman('blocker', (document.getElementById('vlBlok').value||'').trim());
    el.remove();
    try{ log('🧪 Veldlab: monteur-input vastgelegd','ok'); }catch(e){}
  };
  document.getElementById('vlSkip').onclick=function(){ el.remove(); };
}

/* ---- structurele analyse over ALLE sessies ---- */
function vlAnalyse(st){
  const S=st.sessies, out={findings:[], advies:[], sat:''};
  if(!S.length) return out;
  const cnt=function(map,k,item){ (map[k]=map[k]||{n:0,items:[]}).n++; if(item&&map[k].items.length<6&&map[k].items.indexOf(item)<0) map[k].items.push(item); };
  const pidFail={}, pidQ={}, errNorm={}, shareErr={n:0}; let fbN=0, overConf=0, humanJa=0, humanDeels=0, humanNee=0, humanTot=0, slowConn=0, connN=0; const lats=[];
  for(const s of S){
    (s.pids&&s.pids.fail||[]).forEach(function(p){ cnt(pidFail,p,s.merk||'?'); });
    (s.pids&&s.pids.q||[]).forEach(function(q){ cnt(pidQ,(q.pid||'?')+' '+(q.reden||''),s.merk||'?'); });
    (s.errs||[]).forEach(function(m){ var k=String(m).toLowerCase().replace(/\d+/g,'#').slice(0,80); cnt(errNorm,k,s.merk||'?'); if(/share|deel|export/.test(k)) shareErr.n++; });
    if(s.ai&&s.ai.fb) fbN++;
    var hc=s.human&&s.human.correct;
    if(hc){ humanTot++; if(hc==='Ja')humanJa++; else if(hc==='Deels')humanDeels++; else humanNee++;
      if(hc==='Nee'&&s.ai&&s.ai.verdict==='groen') overConf++; }
    if(s.adp){ if(s.adp.connectMs!=null){ connN++; if(s.adp.connectMs>4000) slowConn++; } if(s.adp.lat!=null) lats.push(s.adp.lat); }
  }
  const top=function(map){ return Object.entries(map).sort(function(a,b){return b[1].n-a[1].n;}); };
  top(pidFail).forEach(function(kv){ if(kv[1].n>=2) out.findings.push({p:kv[1].n*3,txt:'PID '+kv[0]+' faalt in '+kv[1].n+' sessies ('+kv[1].items.join(', ')+') → kandidaat voor profiel-filter / dead-PID-lijst.'}); });
  top(pidQ).forEach(function(kv){ out.findings.push({p:kv[1].n*2+1,txt:'Verdachte PID: '+kv[0]+' bij '+kv[1].items.join(', ')+' ('+kv[1].n+'×) → kennisbank/PID-definitie bijwerken.'}); });
  top(errNorm).forEach(function(kv){ if(kv[1].n>=2) out.findings.push({p:kv[1].n*4,txt:'Terugkerende fout ('+kv[1].n+'×): "'+kv[0]+'" → structurele bug, niet incidenteel.'}); });
  if(shareErr.n) out.findings.push({p:shareErr.n*4,txt:shareErr.n+'× deel/export-fout → raakt direct "klant-klaar" (B2B-kern).'});
  if(fbN) out.findings.push({p:fbN*5,txt:fbN+'× AI-fallback → rapport kwam niet van de echte AI; proxy/quota controleren.'});
  if(overConf) out.findings.push({p:overConf*6,txt:overConf+'× monteur zei NEE terwijl app GROEN gaf → over-confidence, prompt/verdict-drempels aanscherpen.'});
  if(connN && slowConn/connN>0.3) out.findings.push({p:4,txt:Math.round(100*slowConn/connN)+'% van verbindingen >4s → connect-flow optimaliseren.'});
  if(lats.length>=3){ var sr=lats.slice().sort(function(a,b){return a-b;}); var p90=sr[Math.min(sr.length-1,Math.floor(sr.length*0.9))]; if(p90>150) out.findings.push({p:3,txt:'Latency p90 = '+p90+'ms → pollingdruk of adapterkeuze bekijken.'}); }
  out.findings.sort(function(a,b){return b.p-a.p;});
  out.ai={tot:humanTot,ja:humanJa,deels:humanDeels,nee:humanNee};
  /* dekkingsadvies */
  const fuels=['benzine','diesel','hybride','ev'], bands=['<2008','2008-15','2016-20','2021+'];
  const have={}; S.forEach(function(s){ have[s.fuel+'|'+s.band]=(have[s.fuel+'|'+s.band]||0)+1; });
  const prio={'diesel|<2008':9,'benzine|<2008':8,'ev|2021+':8,'ev|2016-20':7,'hybride|2008-15':6,'hybride|2016-20':6,'diesel|2008-15':5};
  const missing=[];
  fuels.forEach(function(f){ bands.forEach(function(b){ if(!have[f+'|'+b]) missing.push({k:f+' · '+b,p:prio[f+'|'+b]||3}); }); });
  missing.sort(function(a,b){return b.p-a.p;});
  out.advies=missing.slice(0,5).map(function(m){ return m.k + (m.p>=8?'  ← grootste kennissprong':''); });
  out.have=have; out.fuels=fuels; out.bands=bands;
  /* verzadiging */
  const last=S.slice(-5), mean=last.reduce(function(a,s){return a+(s.novel||0);},0)/last.length;
  out.sat = S.length>=5 && mean<0.15
    ? '📉 Laatste 5 sessies leverden vrijwel niets nieuws (novelty '+mean.toFixed(2)+'). Zelfde soort auto\'s inpluggen is tijdverspilling — pak gericht een auto uit het advies, of stop: dekking is nu de bottleneck, niet aantal.'
    : '📈 Nieuwe sessies leveren nog kennis op (novelty laatste 5: '+(S.length?mean.toFixed(2):'—')+').';
  return out;
}

/* ---- dashboard (in-app, admin) ---- */
function vlOpenDash(){
  if(!isAdmin()){ showToast?.('Alleen voor admin'); return; }
  const st=vlLoad(), A=vlAnalyse(st), S=st.sessies;
  let ov=document.getElementById('vlDash'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='vlDash';
  ov.style.cssText='position:fixed;inset:0;z-index:9550;background:#0e1218;color:#eaf0f6;font-family:system-ui,sans-serif;overflow-y:auto;padding:16px 16px calc(24px + env(safe-area-inset-bottom))';
  const esc=function(x){return String(x==null?'':x).replace(/</g,'&lt;');};
  const uniqMerk={}; S.forEach(function(s){ if(s.merk) uniqMerk[s.merk]=1; });
  const cells=Object.keys(A.have||{}).length;
  let matrix='';
  if(S.length){
    matrix='<table style="border-collapse:collapse;width:100%;font-size:11.5px;margin:8px 0 4px"><tr><td></td>'+A.bands.map(function(b){return '<td style="padding:4px;color:#6b7d92;text-align:center">'+b+'</td>';}).join('')+'</tr>'+
      A.fuels.map(function(f){ return '<tr><td style="padding:4px;color:#6b7d92">'+f+'</td>'+A.bands.map(function(b){ var n=(A.have[f+'|'+b]||0);
        return '<td style="padding:4px;text-align:center"><span style="display:inline-block;min-width:30px;padding:5px 0;border-radius:7px;font-weight:700;background:'+(n?'#123322':'#1a222c')+';color:'+(n?'#3fd07a':'#3a4a5c')+';border:1px solid '+(n?'#1f4d33':'#242f3b')+'">'+(n||'·')+'</span></td>'; }).join('')+'</tr>'; }).join('')+'</table>';
  }
  ov.innerHTML=
    '<div style="max-width:640px;margin:0 auto">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><b style="font-size:17px">🧪 Veldlab</b><span style="font:600 11px ui-monospace,monospace;color:#6b7d92">'+S.length+' sessies · '+Object.keys(uniqMerk).length+' merken · '+cells+'/16 cellen</span><button id="vlX" style="margin-left:auto;background:#1f2a35;border:1px solid #2a3644;color:#9db0c4;border-radius:9px;padding:7px 13px;font:700 13px system-ui;cursor:pointer">Sluiten</button></div>'+
    '<div style="font-size:12.5px;color:#9db0c4;margin-bottom:14px">Elke echte verbinding wordt automatisch vastgelegd. Hieronder wat álle sessies samen zeggen.</div>'+
    (S.length? '' : '<div style="background:#241f0f;border:1px solid #4a3d17;color:#f5a623;border-radius:11px;padding:12px;font-size:13px">Nog geen sessies. Verbind met een echte auto — vastleggen gaat vanzelf.</div>')+
    (S.length? '<div style="font:600 11px ui-monospace,monospace;letter-spacing:1.5px;color:#2fd0d6;margin:16px 0 4px">DEKKING (brandstof × leeftijd)</div>'+matrix : '')+
    (S.length? '<div style="font-size:11.5px;color:#6b7d92;margin-bottom:12px">Test-advies (grootste kennissprong eerst): '+(A.advies.length? esc(A.advies.join('  ·  ')) : 'alle hoofdcellen gedekt ✓')+'</div>' : '')+
    (S.length? '<div style="background:'+(A.sat.indexOf('📉')===0?'#241f0f':'#0f2418')+';border:1px solid '+(A.sat.indexOf('📉')===0?'#4a3d17':'#1f4d33')+';border-radius:11px;padding:11px 13px;font-size:12.5px;line-height:1.5;margin-bottom:14px">'+esc(A.sat)+'</div>' : '')+
    (A.ai&&A.ai.tot? '<div style="font:600 11px ui-monospace,monospace;letter-spacing:1.5px;color:#2fd0d6;margin:14px 0 6px">AI-SCOREBORD (monteur-oordeel, n='+A.ai.tot+')</div><div style="display:flex;gap:8px;margin-bottom:14px">'+
      [['Ja',A.ai.ja,'#3fd07a'],['Deels',A.ai.deels,'#f5a623'],['Nee',A.ai.nee,'#ff5b5b']].map(function(x){return '<div style="flex:1;background:#182029;border:1px solid #2a3644;border-radius:11px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:800;color:'+x[2]+'">'+x[1]+'</div><div style="font-size:11px;color:#6b7d92">'+x[0]+'</div></div>';}).join('')+'</div>' : '')+
    (S.length? '<div style="font:600 11px ui-monospace,monospace;letter-spacing:1.5px;color:#2fd0d6;margin:14px 0 6px">STRUCTURELE VERBETERPUNTEN</div>'+
      (A.findings.length? A.findings.slice(0,10).map(function(f){return '<div style="background:#182029;border:1px solid #2a3644;border-radius:11px;padding:10px 13px;font-size:12.5px;line-height:1.5;margin-bottom:8px">'+esc(f.txt)+'</div>';}).join('') : '<div style="font-size:12.5px;color:#6b7d92">Nog geen terugkerende patronen — dat komt vanzelf met meer variatie.</div>') : '')+
    '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">'+
    '<button id="vlExp" style="flex:1;min-width:150px;background:#2fd0d6;color:#052225;border:none;border-radius:11px;padding:13px;font:700 13.5px system-ui;cursor:pointer">📄 Export JSON (analyse)</button>'+
    '<button id="vlTgl" style="flex:1;min-width:150px;background:#1f2a35;border:1px solid #2a3644;color:#9db0c4;border-radius:11px;padding:13px;font:600 13.5px system-ui;cursor:pointer">'+(vlCaptureOn()?'⏸ Vastleggen uitzetten':'▶ Vastleggen aanzetten')+'</button>'+
    '<button id="vlDel" style="flex:0 0 auto;background:#2a1417;border:1px solid #4a2226;color:#ffb9b9;border-radius:11px;padding:13px;font:600 13.5px system-ui;cursor:pointer">Wissen</button>'+
    '</div></div>';
  document.body.appendChild(ov);
  document.getElementById('vlX').onclick=function(){ ov.remove(); };
  document.getElementById('vlExp').onclick=function(){
    var name='pidlane-veldlab-export-'+new Date().toISOString().slice(0,10)+'.json';
    var body=JSON.stringify({export:'pidlane-veldlab',v:1,t:Date.now(),sessies:S},null,1);
    try{ if(typeof download==='function'){ download(name,body); return; } }catch(e){}
    try{ var b=new Blob([body],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},2000);}catch(e){}
  };
  document.getElementById('vlTgl').onclick=function(){ try{ localStorage.setItem('pl_veldlab_uit', vlCaptureOn()?'1':'0'); }catch(e){} vlOpenDash(); };
  document.getElementById('vlDel').onclick=function(){ if(confirm('Alle veldlab-sessies wissen?')){ try{ localStorage.removeItem(VL_KEY); }catch(e){} vlOpenDash(); } };
}

/* ---- knop rechtsonder (alleen admin) ---- */
function vlEnsureBtn(force){
  // Zwevende Veldlab-knop UITGEZET op verzoek — hij hing over de content heen.
  // Veldlab blijft bereikbaar via ☰-menu → 🧪 Veldlab. Deze functie ruimt nu
  // alleen een eventueel nog bestaande knop op (en blijft aanroepbaar voor
  // bestaande callsites).
  try{ var b=document.getElementById('plEvalBtn'); if(b) b.remove(); }catch(e){}
}
