// ══════════════════════════════════════════════════════════════════
// pidlane-btflow.js
// Bluetooth-verbindingsflow + diagnostiek-log
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// BLUETOOTH CONNECTION — MULTI STEP FLOW
// ════════════════════════════════════════
let btBuffer='';
let discoveredNetworks=[], selectedNetwork=null;
let discoveredPIDDefs=[];
let supportedPIDs=new Set();
let vehicleInfo={merk:'',model:'',year:'',vin:'',brandstof:'',motor:''};

// ── Detecteer beschikbare Bluetooth plugins ──
// ════════════════════════════════════════
// BLUETOOTH DIAGNOSTIEK LOG
// ════════════════════════════════════════
const _btLog=[], _btDevices=[];

// ── SESSIESTAAT PERSISTENT (overleeft Android WebView proces-kill bij scherm-uit) ──
// Android schiet het WebView-proces soms af als het scherm uit gaat; de app
// herlaadt dan kaal van server.url. Login en autoconnect werden al hersteld;
// hier bewaren we óók de voertuig-identiteit, ontdekte PIDs en DTC-codes zodat
// de lopende diagnose niet verdwijnt. Live PID-waarden zijn vluchtig en vullen
// zich vanzelf weer bij herverbinden.
function persistAppState(){
  try{
    if(!currentUser) return;
    const st={
      v:   vehicleInfo,
      pids:(typeof supportedPIDs!=='undefined')?[...supportedPIDs]:[],
      dtc: Array.isArray(dtcCodes)?dtcCodes:[],
      ts:  Date.now()
    };
    localStorage.setItem('pl_appstate', JSON.stringify(st));
  }catch(e){ console.warn('Sessiestaat niet bewaard — na een herlaad is de lopende diagnose weg', e); }
}
function restoreAppState(){
  try{
    const raw=localStorage.getItem('pl_appstate'); if(!raw) return false;
    const st=JSON.parse(raw);
    // Ouder dan 6 uur? Dan niet meer relevant — opruimen.
    if(!st || (Date.now()-(st.ts||0)) > 6*3600*1000){ localStorage.removeItem('pl_appstate'); return false; }
    if(Array.isArray(st.pids) && st.pids.length) supportedPIDs=new Set(st.pids);
    if(st.v && (st.v.vin||st.v.merk)){
      vehicleInfo=Object.assign({merk:'',model:'',year:'',vin:'',brandstof:'',motor:''}, st.v);
      try{ updateVehicleCard(vehicleInfo); }catch(e){ btDiag('Voertuigkaart niet bijgewerkt na herstel — de kop toont mogelijk nog het oude voertuig: '+(e.message||e),'warn'); }
    }
    if(Array.isArray(st.dtc)){ dtcCodes=st.dtc.slice(); try{ renderDTC(); }catch(e){ btDiag('Foutcodelijst niet opnieuw getekend na herstel — het scherm kan achterlopen: '+(e.message||e),'warn'); } }
    log('Sessiestaat hersteld na herlaad','ok');
    return true;
  }catch(e){ return false; }
}

// Log van vorige sessie terugzetten (overleeft herladen/demo-overstap)
function restoreBtLog(){
  try{
    let saved=JSON.parse(sessionStorage.getItem('pl_btlog')||'[]');
    // sessionStorage overleeft een Android WebView proces-kill NIET; val dan
    // terug op de localStorage-spiegel zodat de BT-log toch behouden blijft.
    if(!saved.length){ try{ saved=JSON.parse(localStorage.getItem('pl_btlog')||'[]'); }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ } }
    if(!saved.length) return;
    const logEl=document.getElementById('btLog'); if(!logEl) return;
    logEl.innerHTML='';
    const colors={info:'var(--tx2)',ok:'var(--gn)',warn:'var(--or)',err:'var(--rd)',proto:'#a78bfa',device:'#00f5ff'};
    const icons={info:'·',ok:'✓',warn:'⚠',err:'✗',proto:'⚡',device:'📱'};
    saved.forEach(e=>{
      _btLog.push(e);
      const line=document.createElement('div'); line.style.cssText=`color:${colors[e.type]||'var(--tx2)'};display:flex;gap:5px;`;
      const tsEl=document.createElement('span'); tsEl.style.cssText='color:var(--tx3);flex-shrink:0'; tsEl.textContent=e.ts;
      const icEl=document.createElement('span'); icEl.style.color=colors[e.type]||'var(--tx2)'; icEl.textContent=icons[e.type]||'·';
      const msgEl=document.createElement('span'); msgEl.textContent=e.msg;
      line.appendChild(tsEl); line.appendChild(icEl); line.appendChild(msgEl);
      logEl.appendChild(line);
    });
    logEl.scrollTop=logEl.scrollHeight;
    const box=document.getElementById('btDiagBox'); if(box) box.style.display=(window._connDetails?'block':'none');
  }catch(e){ console.warn('BT-log van de vorige sessie niet teruggezet', e); }
}
document.addEventListener('DOMContentLoaded', restoreBtLog);

// PERF-FIX: voorheen deed élke btDiag-regel synchroon 2× JSON.stringify van
// 300 entries naar sessionStorage én localStorage — tijdens polling meerdere
// keren per seconde op de main thread van een telefoon. Nu gedebounced (2s);
// pagehide flusht direct zodat een WebView proces-kill niets verliest.
let _btPersistT=null;
function _btPersistNow(){
  _btPersistT=null;
  try{ const snap=JSON.stringify(_btLog.slice(-300)); sessionStorage.setItem('pl_btlog',snap); localStorage.setItem('pl_btlog',snap); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
try{ window.addEventListener('pagehide',_btPersistNow); document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') _btPersistNow(); }); }catch(e){ console.warn('pagehide/visibilitychange niet gekoppeld — de BT-log wordt niet geflusht bij een proces-kill', e); }
function btDiag(msg, type='info'){
  const box=document.getElementById('btDiagBox'); if(box) box.style.display=(window._connDetails?'block':'none');
  const ts=new Date().toTimeString().slice(0,8);
  // `t` is de epoch-tijd erbij (#75, 02-09-2026). `ts` is alleen "HH:MM:SS" en
  // dus niet te vergelijken met een starttijd; de testrun telde daardoor de
  // hele ringbuffer als "meldingen sinds het begin van deze run" — inclusief
  // het polverkeer van ná de run, want dat rapport wordt later opgeslagen.
  // Regels die uit de opslag zijn teruggezet (restoreBtLog) hebben geen `t`;
  // die zijn per definitie van een vorige sessie.
  _btLog.push({ts,t:Date.now(),msg,type});
  // Geheugen-cap MET ANKER: de eerste regels van een sessie (protocol, VIN,
  // discovery) blijven altijd staan. Die rolden er vroeger binnen een minuut
  // uit — daardoor was de VIN-poging bij het exporteren telkens al weg en
  // kostte dezelfde vraag drie extra rondes. De staart rolt gewoon door.
  if(_btLog.length>1400){
    const kop=_btLog.slice(0,300), staart=_btLog.slice(-800);
    const weg=_btLog.length-kop.length-staart.length;
    _btLog.length=0;
    _btLog.push(...kop,{ts,t:Date.now(),msg:`… ${weg} regels weggelaten (geheugen-cap) …`,type:'info'},...staart);
  }
  try{ liveLogWrite(`[BT][${ts}] [${(type||'info').toUpperCase()}] ${msg}`); }catch(e){ console.warn('liveLogWrite() faalde — deze regel ontbreekt in het live logbestand', e); }
  if(!_btPersistT) _btPersistT=setTimeout(_btPersistNow,2000);
  const colors={info:'var(--tx2)',ok:'var(--gn)',warn:'var(--or)',err:'var(--rd)',proto:'#a78bfa',device:'#00f5ff'};
  const icons={info:'·',ok:'✓',warn:'⚠',err:'✗',proto:'⚡',device:'📱'};
  const logEl=document.getElementById('btLog'); if(!logEl) return;
  if(_btLog.length===1) logEl.innerHTML='';
  const line=document.createElement('div'); line.style.cssText=`color:${colors[type]||'var(--tx2)'};display:flex;gap:5px;`;
  const tsEl=document.createElement('span'); tsEl.style.cssText='color:var(--tx3);flex-shrink:0'; tsEl.textContent=ts;
  const icEl=document.createElement('span'); icEl.style.color=colors[type]||'var(--tx2)'; icEl.textContent=icons[type]||'·';
  const msgEl=document.createElement('span'); msgEl.textContent=msg;
  line.appendChild(tsEl); line.appendChild(icEl); line.appendChild(msgEl);
  logEl.appendChild(line); logEl.scrollTop=logEl.scrollHeight;
  // Badge in statusrij
  const row=document.getElementById('btStatusRow'); if(!row) return;
  const badge=document.createElement('div');
  badge.style.cssText=`font-size:11px;font-weight:600;padding:1px 6px;border-radius:3px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(${type==='ok'?'0,168,107':type==='err'?'229,62,62':type==='warn'?'247,127,0':type==='proto'?'124,58,237':type==='device'?'0,245,255':'100,100,100'},.12);color:${colors[type]||'var(--tx3)'}`;
  badge.textContent=msg.slice(0,24)+(msg.length>24?'…':''); badge.title=msg;
  row.appendChild(badge);
  // Max 6 badges
  while(row.children.length>6) row.removeChild(row.firstChild);
}

// ── BT LOG MODAL — altijd bereikbaar via topbar, ook ná verbinden ──
// ── AANBEVOLEN VOLGENDE STAP (OBDLink-stijl begeleiding) ──────────
// Eén duidelijke suggestie op het Live-scherm, op basis van de situatie.
function updateReco(){
  // Aanbevolen-banner verwijderd op verzoek — altijd verbergen.
}
// Fix 19-07: handle + guard zodat een herstart (bv. na opnieuw verbinden
// tijdens een lange rit) geen tweede interval bovenop het eerste zet.
if(!window._recoTimer) window._recoTimer=setInterval(updateReco,4000);

// Eerlijke melding als opslaan native plugins vereist die er nog niet zijn
function pluginStatus(){
  const P=window.Capacitor?.Plugins||{};
  return {native:!!window.Capacitor?.isNativePlatform?.(), fs:!!P.Filesystem, sh:!!P.Share};
}
function showNeedsUpdate(){
  const p=pluginStatus();
  showOptResult('💾 Opslaan vereist een app-update',
    'Het Android-systeem laat web-apps geen bestanden opslaan zonder native hulp. '+
    'Een nieuwe APK-build (met Filesystem- en Share-plugins) lost dit definitief op.<br><br>'+
    `<span style="font-family:var(--m);font-size:12px;color:var(--tx3)">Status in deze app:<br>`+
    `Filesystem-plugin: ${p.fs?'✅ aanwezig':'❌ ontbreekt'}<br>`+
    `Share-plugin: ${p.sh?'✅ aanwezig':'❌ ontbreekt'}</span><br>`+
    '<span style="color:var(--tx3);font-size:12px">Tot die tijd: maak een screenshot van het rapport.</span>');
}

// ── AI VERBINDINGSOPTIMALISATIE ─────────────────────────────────
// De AI mag ALLEEN kiezen uit deze veilige, omkeerbare ELM-instellingen.
// Geen vrije commando's richting de auto — uitsluitend adapter-tuning.
const SAFE_AT=/^AT(ST[0-9A-F]{2}|AT[0-2]|H[01]|S[01]|L[01]|E0|CAF[01]|FCSM[01])$/i;
// → ELM_BASELINE verplaatst naar pidlane-data.js

async function measureLatency(n=3){
  // Onder één busslot: anders meet je de wachttijd achter de poll-loop
  // in plaats van de werkelijke adaptersnelheid.
  return await withBus('latentiemeting', async()=>{
    const times=[];
    for(let i=0;i<n;i++){
      const t0=Date.now();
      const r=await sendCmd('010C1',2500);
      if(r&&!r.includes('NO DATA')&&!r.includes('ERROR')) times.push(Date.now()-t0);
    }
    return times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null;
  }, 6000);
}

async function optimizeConnectionAI(btn){
  if(!connected){ showToast?.('Verbind eerst een adapter'); return; }
  if(demoMode){
    const o=btn?btn.textContent:''; if(btn){ btn.textContent='🤖 Bezig...'; btn.disabled=true; }
    log('AI-optimalisatie (demo) — gesimuleerd, geen echte adapter','info');
    setTimeout(()=>{ if(btn){ btn.textContent=o||'🛠 Optimaliseer'; btn.disabled=false; } showToast?.('Demo: verbinding optimaal (gesimuleerd) ✓',3000); }, 1100);
    return;
  }
  const orig=btn?btn.textContent:''; if(btn){btn.textContent='🤖 Bezig...'; btn.disabled=true;}
  try{
    log('AI optimalisatie: situatie analyseren...','info');
    // Nulmeting vóór alles
    const before=await measureLatency();
    if(before===null){ log('Geen meting mogelijk — verbinding instabiel','warn'); return; }

    // Context verzamelen: logstaart, fouten, voertuig, instellingen
    const tail=_btLog.slice(-80).map(l=>`${l.ts} [${l.type}] ${l.msg}`).join('\n');
    const errs=_btLog.filter(l=>l.type==='err'||l.type==='warn').slice(-15).map(l=>l.msg).join('\n');
    const ctx={
      adapter:'OBDLink MX+ (STN-chip, ELM327 v1.4b compatibel)',
      protocol:String(selectedNetwork?.name||selectedNetwork?.id||'onbekend'),
      voertuig:`${vehicleInfo.merk||'?'} ${vehicleInfo.model||''} ${vehicleInfo.year||''}`.trim(),
      vin:vehicleInfo.vin||'onbekend',
      pids_actief:activePIDs.size, pids_beschikbaar:supportedPIDs.size,
      batch:window._batchSupported===false?'uitgeschakeld (onbetrouwbaar)':'actief',
      gemiddelde_responstijd_ms:before
    };
    const prompt=`Je bent een ELM327/STN OBD2-verbindingsexpert. Analyseer deze situatie en bepaal of de adapter-instellingen geoptimaliseerd kunnen worden.

CONTEXT: ${JSON.stringify(ctx)}

RECENTE FOUTEN/WAARSCHUWINGEN:
${errs||'(geen)'}

LOG (laatste regels):
${tail.slice(-3000)}

Je mag UITSLUITEND deze AT-commando's voorstellen (max 4): ATSTxx (timeout, hex 10-FF), ATAT0/1/2 (adaptive timing), ATH0/1, ATS0/1, ATL0/1, ATCAF0/1, ATFCSM0/1.
Antwoord met ALLEEN geldige JSON, geen andere tekst:
{"optimize":true/false,"reason":"korte uitleg in het Nederlands","commands":[{"cmd":"ATxx","why":"reden"}]}
Als de verbinding al goed loopt (responstijden onder ~150ms, weinig fouten): {"optimize":false,"reason":"..."}`;

    const raw=await apiFetch(prompt,600);
    // Robuuste JSON-extractie: pak alles tussen eerste { en laatste }
    // (AI zet er soms tekst of ```fences omheen)
    let plan;
    try{
      const i0=raw.indexOf('{'), i1=raw.lastIndexOf('}');
      if(i0===-1||i1<=i0) throw new Error('geen JSON');
      plan=JSON.parse(raw.slice(i0,i1+1));
    }catch(e){
      log('AI gaf geen geldig antwoord — geen wijzigingen','warn');
      showOptResult('🤖 Optimalisatie','De AI gaf geen bruikbaar antwoord terug. Er is niets gewijzigd aan de verbinding. Probeer het later opnieuw.');
      return;
    }

    if(!plan.optimize){
      log(`🤖 AI: geen optimalisatie nodig — ${plan.reason||'verbinding loopt goed'} (${before}ms gem.)`,'ok');
      showOptResult('✓ Verbinding is al optimaal',`${plan.reason||'De verbinding loopt goed.'}<br><br>Gemeten responstijd: <b>${before} ms</b> gemiddeld.`);
      return;
    }

    // Whitelist-filter: alles buiten de veilige set wordt geweigerd
    const cmds=(plan.commands||[]).map(c=>String(c.cmd||'').toUpperCase().replace(/\s/g,'')).filter(c=>SAFE_AT.test(c)).slice(0,4);
    if(!cmds.length){
      log('AI stelde geen toegestane commando\'s voor — geen wijzigingen','warn');
      showOptResult('🤖 Optimalisatie',`De AI adviseerde wijzigingen die buiten de veilige instellingen vallen — die zijn geweigerd. Er is niets aangepast.<br><br><span style="color:var(--tx3);font-size:12px">${plan.reason||''}</span>`);
      return;
    }

    log(`🤖 AI: ${plan.reason}`,'info');
    log(`Toepassen: ${cmds.join(', ')}`,'info');
    for(const c of cmds) await sendCmd(c,1500);

    // Nameting + automatische rollback bij verslechtering
    const after=await measureLatency();
    if(after===null||after>before*1.15){
      log(`Resultaat slechter (${before}→${after??'?'}ms) — instellingen teruggedraaid`,'warn');
      for(const c of ELM_BASELINE) await sendCmd(c,1500);
      showOptResult('↩️ Teruggedraaid',`De aanpassingen maakten de verbinding niet sneller (${before} → ${after??'?'} ms), dus alles is teruggezet naar de standaardinstellingen.<br><br><span style="color:var(--tx3);font-size:12px">Geprobeerd: ${cmds.join(', ')}</span>`);
      logUsage('connectie_kpi', `protocol=${selectedNetwork?.name||'?'} voor=${before}ms na=${after??'?'}ms toegepast=nee(rollback)`);
    } else {
      const pct=Math.round((1-after/before)*100);
      log(`✅ Optimalisatie geslaagd: ${before}ms → ${after}ms (${pct>0?pct+'% sneller':'gelijk'})`,'ok');
      showOptResult(pct>2?`⚡ Verbinding ${pct}% sneller`:'✓ Instellingen bijgewerkt',`<b>${plan.reason}</b><br><br>Responstijd: ${before} ms → <b style="color:var(--gn)">${after} ms</b><br><br><span style="color:var(--tx3);font-size:12px">Toegepast: ${cmds.join(', ')}</span>`);
      logUsage('connectie_kpi', `protocol=${selectedNetwork?.name||'?'} voor=${before}ms na=${after}ms verbetering=${pct}% toegepast=ja`);
    }
  }catch(e){
    log('Optimalisatie fout: '+e.message+' — baseline hersteld','err');
    showOptResult('⚠ Optimalisatie mislukt',`${e.message}<br><br>De standaardinstellingen zijn voor de zekerheid hersteld.`);
    try{ for(const c of ELM_BASELINE) await sendCmd(c,1500); }catch(_){ log('Herstel naar de standaardinstellingen mislukt: '+(_.message||_)+' — de adapter staat mogelijk nog op de geprobeerde instellingen, verbreek en verbind opnieuw','err'); }
  }finally{
    if(btn){btn.textContent=orig; btn.disabled=false;}
  }
}

// Resultaatvenster — de uitkomst moet áltijd zichtbaar zijn, niet alleen in het log
function showOptResult(title,html){
  let m=document.getElementById('optResultModal');
  if(!m){
    m=document.createElement('div'); m.id='optResultModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:24px';
    m.innerHTML=`<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:320px;width:100%">
      <div id="optResTitle" style="font-weight:800;font-size:15px;margin-bottom:10px"></div>
      <div id="optResBody" style="font-size:14px;color:var(--tx2);line-height:1.55"></div>
      <button onclick="document.getElementById('optResultModal').style.display='none'" style="margin-top:16px;width:100%;padding:10px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer">Sluiten</button>
    </div>`;
    m.addEventListener('click',e=>{if(e.target===m)m.style.display='none';});
    document.body.appendChild(m);
  }
  document.getElementById('optResTitle').innerHTML=title;
  document.getElementById('optResBody').innerHTML=html;
  m.style.display='flex';
}


async function copyBtLog(btn){
  let txt='';
  try{ txt=(_btLog||[]).map(e=>`${e.ts} [${e.type}] ${e.msg}`).join('\n'); }catch(e){ txt=''; }
  const done=ok=>{ try{ if(btn){btn.textContent=ok?'✓ Gekopieerd':'✗ Mislukt'; setTimeout(()=>{try{btn.textContent='📋 Kopieer';}catch(_){ /* stil: de knop kan al weg zijn */ }} ,1500);} }catch(_){ /* stil: de knop kan al weg zijn */ } };

  // 1. Web clipboard API — dit is wat "Kopiëren" hoort te doen
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(txt);
      done(true); return;
    }
  }catch(e){ /* val door naar fallback */ }

  // 2. execCommand-fallback (oudere WebView) — synchroon, geen native call
  try{
    if(fallbackCopyBtLog(txt)){ done(true); return; }
  }catch(e){ /* val door */ }

  // 3. Laatste optie: native deelmenu. Volledig afgeschermd zodat een
  //    afgewezen/onbruikbare Share-plugin de app NOOIT kan laten crashen.
  try{
    const SH=window.Capacitor?.Plugins?.Share;
    if(SH){
      let canShare=true;
      try{ if(SH.canShare){ const r=await SH.canShare(); canShare=(r?.value!==false); } }catch(_){ /* stil: sonde — een Share-plugin die canShare niet kent mag geen fout zijn, we proberen daarna gewoon te delen */ }
      if(canShare){
        await SH.share({title:'PidLane BT-log', text:txt, dialogTitle:'BT-log delen'});
        done(true); return;
      }
    }
  }catch(e){
    // "cancel" = gebruiker sloot het deelmenu → geen fout
    if(String(e?.message||e).toLowerCase().includes('cancel')){ done(true); return; }
  }

  done(false);
  try{ showToast?.('Kopiëren niet ondersteund op dit toestel — gebruik 📦 Exporteer alle logs',4000); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
}
function fallbackCopyBtLog(txt){
  let ta=null, ok=false;
  try{
    ta=document.createElement('textarea');
    ta.value=txt||'';
    ta.style.cssText='position:fixed;top:0;left:0;width:2em;height:2em;opacity:0;border:none;padding:0';
    ta.setAttribute('readonly','');
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try{ ta.setSelectionRange(0,(txt||'').length); }catch(e){ /* stil: niet elke WebView kent setSelectionRange op een verborgen textarea; select() erboven is genoeg */ }
    try{ ok=document.execCommand('copy'); }catch(e){ ok=false; }
  }catch(e){ ok=false; }
  finally{ try{ if(ta) ta.remove(); }catch(_){ /* stil: element kan al weg zijn */ } }
  return ok;
}

// ══════════════════════════════════════════════════════
// TEST-SCENARIO (admin, demo-modus)
// Laat de admin PID-waarden, DTC's en voertuiggegevens handmatig zetten om
// te zien hoe de beoordeling, het rapport, de HUD en aanbevelingen reageren.
// Alles wat hier gezet wordt, telt als MANUEEL en wordt zo gelabeld.
// ══════════════════════════════════════════════════════
function openScenarioModal(){
  if(!isAdmin()){ showToast?.('Alleen voor admin'); return; }
  if(!demoMode){ showToast?.('Start eerst de demo-modus om een scenario te testen'); return; }
  let ov=document.getElementById('scenarioModal');
  if(!ov){
    ov=document.createElement('div');
    ov.id='scenarioModal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9650;display:flex;align-items:center;justify-content:center;padding:14px';
    ov.innerHTML=`
      <div style="background:var(--sur);border:1px solid var(--bd);border-radius:12px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--bd)">
          <strong style="font-size:14px">🧪 Test-scenario <span style="font-size:11px;font-weight:700;background:#7c3aed;color:#fff;padding:1px 6px;border-radius:4px;vertical-align:middle">DEMO</span></strong>
          <button onclick="document.getElementById('scenarioModal').style.display='none'" style="padding:5px 10px;border-radius:6px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer">✕ Sluit</button>
        </div>
        <div style="padding:8px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer">
            <input type="checkbox" id="scenEnabled" onchange="scenarioToggle(this.checked)" style="width:16px;height:16px"> Scenario actief
          </label>
          <span style="font-size:12px;color:var(--tx3)">overschrijft demo-waarden met jouw invoer</span>
          <div style="flex:1"></div>
          <button onclick="scenarioReset()" style="padding:4px 9px;border-radius:6px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer">↺ Reset alles</button>
        </div>
        <div id="scenarioBody" style="overflow-y:auto;padding:12px 14px"></div>
        <div style="padding:10px 14px;border-top:1px solid var(--bd);display:flex;gap:8px">
          <button onclick="scenarioApply()" style="flex:1;padding:9px;border-radius:8px;border:none;background:linear-gradient(135deg,#7c3aed,#1a6fff);color:#fff;font-size:13px;font-weight:700;cursor:pointer">✓ Toepassen & beoordelen</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  scenarioRenderBody();
  document.getElementById('scenEnabled').checked=_scenario.enabled;
  ov.style.display='flex';
}

// Veelgebruikte PIDs die je typisch wilt forceren om beoordeling te testen
// → SCENARIO_PID_SUGGEST verplaatst naar pidlane-data.js

// ── SNEL-SCENARIO PRESETS (1 klik) — vullen defect-waarden + DTC's ──
// Per preset: welke PID's + welke waarden + bijbehorende foutcodes. 'fuels'
// (optioneel) beperkt de preset tot bepaalde brandstoftypes.
// → SCENARIO_PRESETS verplaatst naar pidlane-data.js

// Brandstoftype zoals nu in het scenario gekozen (val terug op vehicleInfo/OBD).
function _scenarioFuelType(){
  const b=(((_scenario.vehicle&&_scenario.vehicle.brandstof))||(typeof vehicleInfo!=='undefined'&&vehicleInfo.brandstof)||'').toString().toLowerCase();
  if(/hybr|phev|hev/.test(b)) return 'benzine';            // hybride heeft verbrandingsmotor
  if(/elektr|electric|\bev\b|bev/.test(b)) return 'elektrisch';
  if(/diesel|gasolie/.test(b)) return 'diesel';
  if(/benzine|petrol|gasoline|lpg|cng|ethanol|waterstof/.test(b)) return 'benzine';
  try{ return vehicleFuelType(); }catch(e){ return 'onbekend'; }
}
// Past PID bij dit brandstoftype? (zonder de globale vehicleInfo te gebruiken)
function _scenarioPlausible(pid,ft){
  if(ft==='benzine' && DIESEL_SCR_PIDS.has(pid)) return false;
  if(ft==='elektrisch' && EV_AFWEZIGE_PIDS.has(pid)) return false;
  return true;
}
// PID's van de HUIDIGE scan (supported/discovered) + presets + suggesties,
// ontdubbeld en gesorteerd op categorie. Dit is wat in het scenario verschijnt.
function scenarioRelevantPids(ft){
  const set=new Set();
  try{ if(typeof supportedPIDs!=='undefined'&&supportedPIDs.size) supportedPIDs.forEach(p=>set.add(p)); }catch(e){ console.warn('supportedPIDs niet leesbaar — de scenariolijst mist de PIDs van de huidige scan', e); }
  try{ if(Array.isArray(discoveredPIDDefs)) discoveredPIDDefs.forEach(d=>{ if(d&&d.pid) set.add(d.pid); }); }catch(e){ console.warn('discoveredPIDDefs niet leesbaar — de scenariolijst mist de ontdekte PIDs', e); }
  SCENARIO_PID_SUGGEST.forEach(p=>set.add(p));
  SCENARIO_PRESETS.forEach(s=>Object.keys(s.pids||{}).forEach(p=>set.add(p)));
  const catOrder={Motor:0,Temp:1,Brandstof:2,Rijden:3,Electrisch:4,Emissie:5,Overig:9};
  return [...set].filter(p=>getPidDef(p)).sort((a,b)=>{
    const da=getPidDef(a)||{}, db=getPidDef(b)||{};
    return (catOrder[da.cat]??9)-(catOrder[db.cat]??9) || String(da.name||a).localeCompare(String(db.name||b));
  });
}
// Eén klik: vul de defect-waarden + DTC's van een preset in.
function scenarioPreset(id){
  const s=SCENARIO_PRESETS.find(x=>x.id===id); if(!s) return;
  Object.entries(s.pids||{}).forEach(([pid,val])=>{ _scenario.pids[pid]=val; });
  if(s.dtcs&&s.dtcs.length) _scenario.dtcs=[...new Set([...(_scenario.dtcs||[]),...s.dtcs])];
  scenarioRenderBody();
  try{ log('🧪 Scenario-preset: '+s.label,'info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  try{ showToast?.('Preset geladen: '+s.label,2500); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}
function scenarioClearPids(){ _scenario.pids={}; scenarioRenderBody(); try{ showToast?.('PID-waarden leeg'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }
// Ververs het scenario-venster als het openstaat (bv. na kenteken-lookup).
function scenarioRefreshIfOpen(){
  const ov=document.getElementById('scenarioModal');
  if(ov && ov.style.display==='flex'){ try{ scenarioRenderBody(); }catch(e){ /* stil: element kan al weg zijn */ } }
}

function scenarioRenderBody(){
  const body=document.getElementById('scenarioBody'); if(!body) return;
  const ft=_scenarioFuelType();

  // ── Snel-scenario presets (1 klik), gefilterd op brandstoftype ──
  const presets=SCENARIO_PRESETS.filter(s=>!s.fuels || s.fuels.includes(ft) || ft==='onbekend');
  const presetBtns=presets.map(s=>
    `<button onclick="scenarioPreset('${s.id}')" title="${String(s.desc||'').replace(/"/g,'&quot;')}"
       style="text-align:left;padding:7px 9px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;line-height:1.3">
       ${s.label}${s.dtcs&&s.dtcs.length?`<span style="display:block;font-size:11px;color:var(--tx3);font-weight:500">${s.dtcs.join(', ')}</span>`:''}
     </button>`).join('');

  // ── PID-rijen uit de HUIDIGE scan + presets, gefilterd op brandstoftype ──
  const pids=scenarioRelevantPids(ft);
  let pidRows=pids.map(pid=>{
    const d=getPidDef(pid); if(!d) return '';
    const cur=_scenario.pids[pid];
    const ph=`${d.min}–${d.max}`;
    if(!_scenarioPlausible(pid,ft)){
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;opacity:.45">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name||pid}</div>
          <div style="font-size:11px;color:var(--tx3)">${pid} · n.v.t. bij ${ft}</div>
        </div>
        <span style="font-size:11px;font-weight:800;background:#475569;color:#fff;padding:2px 5px;border-radius:4px">UIT</span>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name||pid}</div>
        <div style="font-size:11px;color:var(--tx3)">${pid} · ${d.unit||''} · normaal ${ph}</div>
      </div>
      <input type="number" step="any" value="${cur!==undefined?cur:''}" placeholder="auto"
        oninput="scenarioSetPid('${pid}',this.value)"
        style="width:84px;padding:6px 8px;border-radius:7px;border:1px solid ${cur!==undefined?'#7c3aed':'var(--bd)'};background:var(--sur2);color:var(--tx);font-family:var(--m);font-size:13px;text-align:right">
      ${cur!==undefined?'<span style="font-size:11px;font-weight:800;background:#7c3aed;color:#fff;padding:2px 5px;border-radius:4px">MAN</span>':'<span style="width:30px"></span>'}
    </div>`;
  }).join('');

  const dtcVal=_scenario.dtcs.join(', ');
  const veh=_scenario.vehicle||{};

  body.innerHTML=`
    <div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:7px">⚡ Snel-scenario's <span style="font-weight:500;color:var(--tx3)">— 1 klik</span></div>
    <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Vult de juiste PID's met defect-waarden + foutcodes. Daarna handmatig bij te stellen.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">${presetBtns||'<div style="font-size:12px;color:var(--tx3)">Geen presets voor dit brandstoftype</div>'}</div>
    <button onclick="scenarioClearPids()" style="width:100%;padding:6px;border-radius:7px;border:1px solid var(--bd);background:transparent;color:var(--tx3);font-size:12px;font-weight:700;cursor:pointer;margin-bottom:12px">↺ PID-waarden leegmaken</button>
    <div style="height:1px;background:var(--bd);margin:0 0 12px"></div>
    <div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:7px">📡 Sensorwaarden — huidige scan (${pids.length})</div>
    <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">PID's van de actieve scan${ft!=='onbekend'?` voor <b>${ft}</b>`:''}. Leeg = automatische demo-waarde. Ingevuld = MANUEEL (met lichte ruis).</div>
    ${pidRows}
    <div style="height:1px;background:var(--bd);margin:12px 0"></div>
    <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:7px">⚠️ Foutcodes (DTC's)</div>
    <input type="text" value="${dtcVal}" placeholder="bijv. P0171, P0420, P0301"
      oninput="scenarioSetDtcs(this.value)"
      style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid ${_scenario.dtcs.length?'#f59e0b':'var(--bd)'};background:var(--sur2);color:var(--tx);font-family:var(--m);font-size:13px;text-transform:uppercase">
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">Komma-gescheiden. Leeg = geen (of willekeurige demo-codes).</div>
    <div style="height:1px;background:var(--bd);margin:12px 0"></div>
    <div style="font-size:12px;font-weight:800;color:#22d3ee;margin-bottom:7px">🚗 Voertuig</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
      <input type="text" value="${veh.merk||''}" placeholder="Merk (bijv. Mazda)" oninput="scenarioSetVeh('merk',this.value)" style="padding:7px 9px;border-radius:7px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:13px">
      <input type="text" value="${veh.model||''}" placeholder="Model (bijv. CX-5)" oninput="scenarioSetVeh('model',this.value)" style="padding:7px 9px;border-radius:7px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:13px">
      <input type="text" value="${veh.year||''}" placeholder="Bouwjaar" oninput="scenarioSetVeh('year',this.value)" style="padding:7px 9px;border-radius:7px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:13px">
      <select onchange="scenarioSetVeh('brandstof',this.value)" style="padding:7px 9px;border-radius:7px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:13px">
        <option value="">Brandstof…</option>
        ${['benzine','diesel','hybride','elektrisch','lpg'].map(b=>`<option value="${b}"${veh.brandstof===b?' selected':''}>${cap(b)}</option>`).join('')}
      </select>
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:5px">Brandstof wijzigen ververst de PID-lijst hierboven. Leeg = standaard demo-auto.</div>`;
}
function scenarioSetPid(pid,v){
  const s=String(v).trim();
  if(s===''){ delete _scenario.pids[pid]; }
  else { const n=parseFloat(s); if(!isNaN(n)) _scenario.pids[pid]=n; }
}
function scenarioSetDtcs(v){
  _scenario.dtcs=String(v).toUpperCase().split(',').map(x=>x.trim()).filter(x=>/^[PCBU][0-9A-F]{4}$/.test(x));
}
function scenarioSetVeh(key,v){
  if(!_scenario.vehicle) _scenario.vehicle={};
  _scenario.vehicle[key]=String(v).trim();
  // Brandstof bepaalt of trim/lambda relevant zijn → venster live bijwerken
  if(key==='brandstof'){ try{ scenarioRenderBody(); }catch(e){ console.warn('Scenariovenster niet ververst na brandstofwijziging — trim/lambda staan mogelijk verkeerd', e); } }
}
function scenarioToggle(on){ _scenario.enabled=!!on; }
function scenarioReset(){
  _scenario={ enabled:false, pids:{}, dtcs:[], vehicle:null };
  scenarioRenderBody();
  const cb=document.getElementById('scenEnabled'); if(cb) cb.checked=false;
  showToast?.('Scenario gewist');
}

function scenarioApply(){
  _scenario.enabled=true;
  const cb=document.getElementById('scenEnabled'); if(cb) cb.checked=true;

  // Voertuig toepassen (alleen als iets ingevuld). Onthoud of brandstof/merk
  // wijzigde, want dan moet de PID-check opnieuw (andere sensoren passen).
  const v=_scenario.vehicle;
  let voertuigGewijzigd=false;
  if(v && (v.merk||v.model||v.year||v.brandstof)){
    const oudeBrandstof=(vehicleInfo.brandstof||'').toLowerCase();
    const nieuweBrandstof=(v.brandstof||'').toLowerCase();
    voertuigGewijzigd = (nieuweBrandstof && nieuweBrandstof!==oudeBrandstof) ||
                        (v.merk && v.merk!==vehicleInfo.merk);
    vehicleInfo={
      merk:v.merk||'Onbekend', model:v.model||'', year:v.year||'',
      vin:vehicleInfo.vin||'', brandstof:nieuweBrandstof,
      motor:vehicleInfo.motor||'', _manueel:true
    };
    try{ updateVehicleCard(vehicleInfo); }catch(e){ log('Voertuigkaart niet bijgewerkt — de kop toont nog het vorige voertuig: '+(e.message||e),'warn'); }
    try{ showVtag(`${vehicleInfo.merk} ${vehicleInfo.model}`.trim()+' · MANUEEL'); }catch(e){ log('MANUEEL-label niet getoond — het scherm zegt niet dat dit een scenario is: '+(e.message||e),'warn'); }
  }

  // DTC's direct toepassen + lijst verversen
  if(_scenario.dtcs.length){ dtcCodes=[..._scenario.dtcs]; try{ renderDTC(); }catch(e){ log('Foutcodelijst niet ververst — de DTC-lijst toont nog de oude codes: '+(e.message||e),'warn'); } }

  // Na een voertuig-/brandstofwijziging: PID-check opnieuw draaien zodat de
  // sensorlijst klopt met het nieuwe brandstoftype (elektrisch = geen trim/
  // lambda/MAF; diesel/benzine = eigen filters).
  if(voertuigGewijzigd){ scenarioRecheckPids(); }

  // PID-waarden worden automatisch opgepikt door demo() bij de volgende poll.
  try{ renderGauges(); }catch(e){ log('Meters niet opnieuw getekend — de scenariowaarden verschijnen pas bij de volgende poll: '+(e.message||e),'warn'); }
  const nPid=Object.keys(_scenario.pids).length;
  log(`🧪 Scenario toegepast — ${nPid} PID(s), ${_scenario.dtcs.length} DTC(s)${v&&v.merk?', voertuig '+v.merk:''}${voertuigGewijzigd?' (PID-check opnieuw gedaan)':''} (MANUEEL)`,'warn');
  try{ updateScenarioBadge(); }catch(e){ log('MANUEEL-badge niet bijgewerkt — het scherm zegt niet dat het scenario aan staat: '+(e.message||e),'warn'); }
  document.getElementById('scenarioModal').style.display='none';
  showToast?.(`Scenario actief — ${nPid} PID(s) + ${_scenario.dtcs.length} DTC(s) gelabeld als MANUEEL`,3500);
}

// Herhaal de PID-check na een brandstof-/voertuigwijziging in het scenario.
// Bouwt de sensorlijst opnieuw op (past het brandstoffilter toe) en verwijdert
// actieve sensoren die niet meer bij het nieuwe brandstoftype passen.
function scenarioRecheckPids(){
  const ft=vehicleFuelType();
  // 1) Sensorlijst opnieuw opbouwen met het nieuwe brandstoffilter
  try{ buildDiscoveredPIDList(); }catch(e){ log('Sensorlijst niet opnieuw opgebouwd — het nieuwe brandstoffilter is niet toegepast: '+(e.message||e),'warn'); }
  // 2) Actieve PID's die nu niet meer plausibel zijn, eruit halen
  let verwijderd=0;
  [...activePIDs].forEach(pid=>{
    if(!vehiclePlausiblePid(pid)){
      activePIDs.delete(pid); manualPIDs.delete(pid);
      delete _scenario.pids[pid];   // ook een handmatige waarde vervalt
      verwijderd++;
    }
  });
  // 3) Bij elektrisch: meld expliciet dat trim/lambda uit staan
  if(ft==='elektrisch'){
    log(`⚡ Elektrisch voertuig — brandstoftrim, lambda/O2, MAF en EGR uitgeschakeld (${verwijderd} sensor(en) verwijderd)`,'info');
  } else if(verwijderd){
    log(`🔧 PID-check opnieuw: ${verwijderd} sensor(en) verwijderd die niet bij ${ft} passen`,'info');
  } else {
    log(`🔧 PID-check opnieuw gedaan voor ${ft}`,'info');
  }
  try{ buildPIDList(); renderGauges(); rebuildGSel?.(); }catch(e){ log('PID-lijst en meters niet ververst na de PID-check — het scherm loopt achter op de sensorset: '+(e.message||e),'warn'); }
}

// Toon een blijvende MANUEEL-badge in de UI zolang het scenario actief is
function updateScenarioBadge(){
  let b=document.getElementById('scenarioBadge');
  if(_scenario.enabled){
    if(!b){
      b=document.createElement('div');
      b.id='scenarioBadge';
      b.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:900;background:#7c3aed;color:#fff;font-size:12px;font-weight:800;padding:4px 12px;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.4);cursor:pointer;letter-spacing:.3px';
      b.textContent='🧪 SCENARIO ACTIEF — data is MANUEEL';
      b.onclick=openScenarioModal;
      document.body.appendChild(b);
    }
    b.style.display='block';
  } else if(b){ b.style.display='none'; }
}

function btDiagDevice(name, address, rssi){
  const devEl=document.getElementById('btDevices');
  const listEl=document.getElementById('btDeviceList');
  if(!devEl||!listEl) return;
  listEl.style.display='block';
  const key=(address||name||'?').replace(/[^a-z0-9]/gi,'_');
  if(devEl.querySelector(`[data-key="${key}"]`)) return; // al toegevoegd
  const isOBD=!!(name||'').toLowerCase().match(/obd|elm|vgate|icar|mx\+|obdlink|link|scan/);
  const dev=document.createElement('div');
  dev.setAttribute('data-key',key);
  dev.style.cssText=`display:flex;align-items:center;gap:6px;padding:3px 7px;background:var(--bg);border:1px solid ${isOBD?'var(--gn)':'var(--bd)'};border-radius:5px;font-size:12px;`;
  dev.innerHTML=`<div style="width:7px;height:7px;border-radius:50%;background:${isOBD?'var(--gn)':'var(--tx3)'}"></div><span style="flex:1;font-weight:${isOBD?700:400};color:${isOBD?'var(--gn)':'var(--tx2)'}">${name||'Onbekend'}</span><span style="color:var(--tx3);font-size:11px">${address||''}</span>${rssi?`<span style="color:var(--tx3);font-size:11px">${rssi}dBm</span>`:''} ${isOBD?'<span style="font-size:11px;font-weight:700;background:var(--gns);color:var(--gn);padding:1px 5px;border-radius:3px">OBD2 ✓</span>':''}`;
  devEl.appendChild(dev);
  btDiag(`${isOBD?'OBD2 adapter':'Apparaat'}: ${name||address}${rssi?` (${rssi}dBm)`:''}`, isOBD?'device':'info');
}

function clearBtLog(){
  _btLog.length=0; _btDevices.length=0;
  // 23-08: _btPersistNow() schrijft naar sessionStorage ÉN een localStorage-
  // spiegel (sessionStorage overleeft een WebView proces-kill niet, en
  // restoreBtLog() valt op de spiegel terug). Alleen de sessionStorage-kant
  // wissen betekende: log wissen, herladen, en hij staat er weer — precies
  // wanneer je een schone log voor een bugmelding wilde.
  try{ sessionStorage.removeItem('pl_btlog'); }catch(e){ /* stil: opslag kan geblokkeerd zijn */ }
  try{ localStorage.removeItem('pl_btlog'); }catch(e){ /* stil: opslag kan geblokkeerd zijn */ }
  const logEl=document.getElementById('btLog');
  if(logEl) logEl.innerHTML='<span style="color:var(--tx3);font-style:italic">Klik Verbinden om te starten...</span>';
  const row=document.getElementById('btStatusRow'); if(row) row.innerHTML='';
  const devEl=document.getElementById('btDevices'); if(devEl) devEl.innerHTML='';
  const listEl=document.getElementById('btDeviceList'); if(listEl) listEl.style.display='none';
  document.getElementById('btDiagBox').style.display='none';
}
