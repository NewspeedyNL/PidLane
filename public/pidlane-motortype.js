// ══════════════════════════════════════════════════════════════════
// pidlane-motortype.js
// Motortype-splitsing: welke PIDs zijn zinvol voor dit aandrijftype
// ──────────────────────────────────────────────────────────────────
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
//
// Heette tot 21-08-2026 `pidlane-scheduler.js`, en die naam was fout. De
// echte scheduler zit in `pidlane-plload.js` (`PLSched`, `pidPollInterval`,
// `pidsDueNow`); wat hier staat is motortype-splitsing, EV-modus en de
// verbindingssamenvatting. Wie de pollvolgorde zocht kwam eerst hier terecht
// en dat kostte elke keer tien minuten.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// MOTORTYPE-SPLITSING POLL-SCHEDULER
// Hybride/EV-auto's hebben andere prioriteiten dan benzine/diesel.
// EV-modus pauzeert verbrandingsmotor-PIDs als motor uit en rijdend.
// ══════════════════════════════════════════════════════
// PIDs die alleen voor een verbrandingsmotor zinvol zijn
const ICE_PIDS_SUFFIX = new Set([
  '0C','0B','10','0A','0E','06','07','08','09','13','14','15','2C','12',
  '3C','3D','3E','3F','34','35','24','25','28','69','6A'
]);
let _evModeActive = false;

function detectEngineType(){
  const bf = (vehicleInfo?.brandstof || '').toLowerCase();
  const mt = (vehicleInfo?.motortype || '').toLowerCase();
  if(bf.includes('elektr') || mt.includes('elektr') || mt.includes('ev')) return 'ev';
  if(bf.includes('hybr')   || mt.includes('hybr')   || mt.includes('phev')) return 'hybride';
  if(bf.includes('diesel')  || mt.includes('diesel') || mt.includes('tdi') || mt.includes('cdi')) return 'diesel';
  return 'benzine';
}

function updateEVMode(){
  if(!connected || demoMode) return;
  const engineType = detectEngineType();
  if(engineType !== 'hybride' && engineType !== 'ev') {
    _evModeActive = false;
    return;
  }
  const rpm = pidVals['010C'];
  const spd = pidVals['010D'];
  const wasEV = _evModeActive;
  // EV-modus: motor staat stil (RPM < 50) maar auto rijdt (snelheid > 2 km/h)
  _evModeActive = (rpm !== undefined && rpm < 50) && (spd !== undefined && spd > 2);
  if(_evModeActive !== wasEV){
    if(_evModeActive){
      btDiag('🔋 EV-modus — verbrandingsmotor-PIDs gepauzeerd', 'info');
    } else {
      btDiag('🔥 Verbrandingsmotor actief — alle PIDs hervatten', 'info');
    }
  }
}

// (pidPollInterval met motortype-logica is samengevoegd in de hoofddefinitie hierboven)

// ══════════════════════════════════════════════════════
// AI-AUTOMONTEUR — lokale kennisbank + AI-interpretatie
// Combineert voertuiginfo + live PID-data + DTC's + merk-kennis
// ══════════════════════════════════════════════════════
// Compacte merk-kennisbank: bekende zwakke punten per merk, gekoppeld aan
// relevante PIDs en symptomen. Uitbreidbaar. Focus op merken die NL-dealers
// rond Dordrecht het meest binnenkrijgen.
// → AUTO_KENNIS verplaatst naar pidlane-data.js

// merk-lookup + brandstof-filter: laat alleen zwak-punten zien die passen bij
// de bevestigde brandstof (null=geen tag -> altijd tonen). Onbekende brandstof
// -> alles tonen (kunnen we niet uitsluiten).
function autoKennisVoorMerk(merk, brandstof){
  if(!merk) return null;
  const m=merk.toLowerCase().trim();
  let hit=null;
  for(const k in AUTO_KENNIS){ if(m===k||m.includes(k)||k.includes(m)){ hit={merk:k,...AUTO_KENNIS[k]}; break; } }
  if(!hit) return null;
  const bf=(brandstof||'').toLowerCase();
  let fuelClass=null;
  if(/diesel/.test(bf)) fuelClass='diesel';
  else if(/benzine|petrol/.test(bf)) fuelClass='benzine';
  else if(/hybr/.test(bf)) fuelClass='hybride';
  const zwakGefilterd = hit.zwak
    .filter(z=>!fuelClass || !z[1] || z[1]===fuelClass)
    .map(z=>z[0]);
  return {...hit, zwak: zwakGefilterd.length?zwakGefilterd:hit.zwak.map(z=>z[0])};
}

function closeAutoExpert(){ document.getElementById('autoExpertSheet').classList.add('hidden'); }

// Bouwt de context-string: voertuig + live PIDs + DTC's + merk-kennis
function buildAutoExpertContext(){
  const v=getVehicle()||{};
  const lines=[];
  const merkModel=[v.merk,v.model,v.year].filter(Boolean).join(' ');
  lines.push(`VOERTUIG: ${merkModel||'onbekend'}${v.brandstof?' ('+v.brandstof+')':''}${v.vin?' VIN '+v.vin:''}`);
  try{ const _sit=situatieKort(); if(_sit) lines.push('RIJSITUATIE NU: '+_sit); }catch(e){}
  // Brandstof-context zodat de monteur geen verbrandingsonderdelen aanhaalt bij een EV
  const _ft=vehicleFuelType();
  if(_ft==='elektrisch') lines.push('AANDRIJVING: volledig elektrisch — geen verbrandingsmotor, brandstof, trim, lambda of uitlaat. Praat niet over brandstofzaken.');
  else if(_ft==='diesel') lines.push('AANDRIJVING: diesel — let op DPF/roetfilter, AdBlue/SCR en NOx waar relevant.');
  // Live PID-waarden
  const pidLines=[...activePIDs].map(pid=>{
    const d=getPidDef(pid);
    if(d && pidVals[pid]!==undefined) return `  ${d.name}: ${fv(pidVals[pid])} ${d.unit||''}`;
    return null;
  }).filter(Boolean);
  if(pidLines.length){ lines.push('LIVE SENSORDATA:'); lines.push(...pidLines); }
  else lines.push('LIVE SENSORDATA: (nog geen actieve sensoren)');
  // DTC's
  if(typeof dtcCodes!=='undefined' && dtcCodes.length){
    lines.push('ACTIEVE FOUTCODES:');
    dtcCodes.forEach(c=>{ const i=(typeof DTCDB!=='undefined')?dtcInfo(c):null; lines.push(`  ${c}${i?' — '+i.desc:''}`); });
  } else lines.push('ACTIEVE FOUTCODES: geen / niet gescand');
  // Lokale merk-kennis
  const know=autoKennisVoorMerk(v.merk, v.brandstof);
  if(know){
    lines.push(`BEKENDE ${know.merk.toUpperCase()}-ZWAKKE PUNTEN: ${know.zwak.join('; ')}`);
    if(know.let_op) lines.push(`LET OP: ${know.let_op}`);
  }
  const pairsAE=[...activePIDs].filter(pid=>pidVals[pid]!==undefined).map(pid=>[pid,pidVals[pid]]);
  if(pairsAE.length){ const q=buildQualityReport(pairsAE); lines.push(q.promptBlok); }
  return lines.join('\n');
}

async function autoExpertAsk(mode){
  const ansEl=document.getElementById('aexAnswer');
  let vraag='';
  if(mode==='vrij'){
    vraag=(document.getElementById('aexQuestion').value||'').trim();
    if(!vraag){ ansEl.innerHTML='<div class="aex-empty">Typ eerst een vraag.</div>'; return; }
  } else if(mode==='problemen'){
    vraag='Wat zijn de meest waarschijnlijke en bekende problemen voor dit specifieke merk/model/bouwjaar? Koppel ze waar mogelijk aan de live sensordata.';
  } else if(mode==='livedata'){
    vraag='Beoordeel de live sensordata. Wat valt op, wat is normaal, en wat wijst mogelijk op een probleem? Wees concreet over welke waarden afwijken en waarom.';
  } else if(mode==='dtc'){
    vraag='Leg de actieve foutcodes uit in begrijpelijke taal, geef per code de waarschijnlijke oorzaak (merk-specifiek waar relevant) en de aanbevolen vervolgstap.';
  }
  ansEl.innerHTML='<div class="ai-ld" style="padding:20px;text-align:center"><div class="spin"></div> Automonteur denkt na...</div>';
  const context=buildAutoExpertContext();
  const sys='Jij bent de PidLane AI-Automonteur: een ervaren, no-nonsense Nederlandse automonteur die OBD2-data leest en merk-specifieke kennis heeft. Antwoord in helder Nederlands, kort en praktisch. Gebruik de meegeleverde live sensordata, foutcodes en merk-kennis. Structureer met korte kopjes waar nuttig. Respecteer de meegeleverde DATAKWALITEIT-sectie strikt.\n'+pidlaneBasisRegels();
  const prompt=`${context}\n\nVRAAG VAN DE DEALER: ${vraag}`;
  try{
    const txt=await apiFetch(prompt, 1100, sys);
    ansEl.innerHTML='';
    if(typeof renderAIText==='function'){ renderAIText(txt, ansEl); }
    else ansEl.textContent=txt;
    logUsage('ai_rapport', 'auto-expert/'+mode);
  }catch(e){
    ansEl.innerHTML=`<div class="aex-empty" style="color:var(--rd)">⚠️ ${e.message||'Er ging iets mis'}<br><br>Stel je AI-sleutel in via 🤖 rechtsboven.</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════
// VERBINDING-WIZARD — 6 stappen na protocol-detectie
// Stap 1: Verbonden · 2: Adapter · 3: PIDs · 4: Voertuig · 5: Check · 6: Klaar
// ══════════════════════════════════════════════════════════════════
let _wizStep=0;

// ══════════════════════════════════════════════════════════════════
// DE WIZARD — teruggebracht tot één scherm (20-08-2026)
// ══════════════════════════════════════════════════════════════════
// Er waren zes stappen, en vier ervan lieten iets zien dat al gebeurd was.
// initConnection() doet ALLES — protocol, VIN, discovery, health-scan,
// snelheidsmeting, profiel opslaan — en roept daarna pas wizShow() aan.
//
//   stap 1  toonde adapter en protocol, en wachtte 2 seconden voor niets.
//           Het startscherm toont de adapter nu zelf, met de cascade live.
//   stap 2  mat de bussnelheid NOG EENS. initConnection deed dat al op
//           regel 1721 van pidlane-bt.js, inclusief applyStrategy. Acht
//           extra metingen op de bus voor een getal dat al bekend was.
//   stap 3  toonde een voortgangsbalk voor een discovery die klaar was.
//   stap 4  vroeg het kenteken in een tweede invoerveld, naast kentInput
//           in de voertuigkaart. De brandstofpoort vraagt het nu al, en
//           alleen wanneer het echt nodig is — zie brandstofPoort() in
//           pidlane-voertuigdata.js.
//   stap 5  toonde een voortgangsbalk voor een health-scan die klaar was.
//           Er zat zelfs een deadline van 4 seconden in om te voorkomen
//           dat de nep-animatie bleef hangen.
//
// Wat overblijft is stap 6: de samenvatting. Die doet echt werk
// (selectStandardSet) en vertelt de gebruiker wat er is gevonden.
//
// De HTML van wizS1 t/m wizS5 blijft in index.html staan maar wordt nooit
// meer getoond. Weghalen raakt de div-balans en is een aparte, mechanische
// opruimstap — niet mengen met een gedragswijziging.
function wizShow(){
  document.getElementById('wizardOv').classList.remove('hidden');
  // Stappenbalk verbergen: met één stap zegt "1 van 6" niets meer.
  try{ const bar=document.getElementById('wizStepBar'); if(bar) bar.style.display='none'; }catch(e){}
  wizGo(6);
}
function wizHide(){
  document.getElementById('wizardOv').classList.add('hidden');
}
function wizFinish(){
  wizHide();
  // Zorg dat PID-lijst bijgewerkt is
  buildPIDList();
  refreshAllReadiness();
}

function wizGo(n){
  _wizStep=n;
  // Er is nog één scherm: de samenvatting. De stappenbalk en wizS1..wizS5 zijn
  // op 21-08 uit index.html gehaald, dus hier valt niets meer te tonen of te
  // markeren. Een aanroep met een ander nummer is een fout die je wilt zien.
  const s6=document.getElementById('wizS6');
  if(s6) s6.classList.remove('hidden');
  if(n===6) _wizStep6();
  else if(typeof btDiag==='function') btDiag('wizGo('+n+') — die stap bestaat niet meer','warn');
}

// wizNext(), wizRdwLookup(), _wizRefreshKnown() en wizToggleDetail() zijn op
// 21-08 verwijderd. Ze hoorden bij wizS4 (kenteken) en wizS5 (sensordetail) en
// werden alleen aangeroepen door onclick-handlers in die HTML. Nu die HTML weg
// is, zijn het dode functies — en dode functies maken de dode-knoppencontrole
// waardeloos, want die kan dan niet meer het verschil zien tussen "bestaat nog
// voor een knop" en "bestaat nog omdat niemand hem opruimde".
//
// Het kenteken vraagt brandstofPoort() nu, en alleen wanneer de brandstof
// anders onbekend blijft (pidlane-voertuigdata.js).

// Hoofdletter aan begin (brandstof-labels netjes weergeven)
function cap(s){ s=String(s||''); return s? s.charAt(0).toUpperCase()+s.slice(1) : s; }

// STAP 6 — Klaar: samenvatting + standaard set selecteren
function _wizStep6(){
  // Selecteer standaard uitgebreide set (geen exotica)
  const n=demoMode?0:selectStandardSet();
  const v=getVehicle()||{};
  const pids=typeof supportedPIDs!=='undefined'?[...supportedPIDs]:[];
  const ok=pids.filter(p=>_pidHealth[p]==='ok').length;
  const strat=typeof _connStrategy!=='undefined'&&_connStrategy?STRATEGIE_INFO[_connStrategy]:null;
  document.getElementById('wizSummary').innerHTML=
    `🚗 <b>${v.merk&&v.merk!=='Onbekend'?v.merk+' '+v.model+(v.year?' '+v.year:''):'Voertuig onbekend'}</b>${v.brandstof?' · '+cap(v.brandstof):''}<br>`+
    (v.motor?`🔧 Motor: <b>${v.motor}</b><br>`:'')+
    `📡 <b>${ok}</b> sensoren actief · <b>${n||activePIDs.size}</b> geselecteerd<br>`+
    (strat?`⚡ Poll-strategie: <b>${strat.emoji} ${strat.label}</b><br>`:'')+
    `✅ Standaard set geladen — pas aan via de PID-lijst`;
}

function openAnalysis(name){
  sw(name,null);
  const tb=document.querySelector('.tb'); if(tb) tb.scrollTop=0;
  document.querySelectorAll('.ai-launch-btn').forEach(b=>b.classList.toggle('active', b.dataset.target===name));
  refreshAllReadiness();
  setLeftPanelForMode(name);
}
function toggleSL(){
  // In vergrendelde modus betekent een tik: tijdelijk de sensoren tonen
  if(_slLocked && slCollapsed){ revealLeftPanel(); updateSLToggleIcon(); return; }
  slCollapsed=!slCollapsed;
  document.getElementById('appGrid').classList.toggle('sl-col',slCollapsed);
  updateSLToggleIcon();
  try{localStorage.setItem('ns_sl',slCollapsed);}catch(e){}
  if(!slCollapsed) armSLAutoHide(); else clearSLAutoHide();
}
function updateSLToggleIcon(){
  const btn=document.getElementById('slToggle');
  if(!btn) return;
  if(_slLocked && slCollapsed){ btn.textContent='📡'; btn.title='Sensoren tonen'; }
  else { btn.textContent=slCollapsed?'▶':'◀'; btn.title='PID-lijst in-/uitklappen'; }
}

// ── PID-scherm auto-verbergen na 15s inactiviteit ──────────────
let _slHideTimer=null;
const SL_HIDE_MS=15000;
function clearSLAutoHide(){ if(_slHideTimer){ clearTimeout(_slHideTimer); _slHideTimer=null; } }
function armSLAutoHide(){
  clearSLAutoHide();
  if(slCollapsed) return;
  _slHideTimer=setTimeout(()=>{
    if(!slCollapsed){
      slCollapsed=true;
      document.getElementById('appGrid').classList.add('sl-col');
      const btn=document.getElementById('slToggle'); if(btn) btn.textContent='▶';
      try{localStorage.setItem('ns_sl','true');}catch(e){}
    }
  }, SL_HIDE_MS);
}
// Reset timer bij elke interactie binnen het PID-paneel
function initSLActivityReset(){
  const panel=document.getElementById('slPanel');
  if(!panel) return;
  ['click','input','scroll','touchstart','mousemove'].forEach(ev=>
    panel.addEventListener(ev,()=>{ if(!slCollapsed) armSLAutoHide(); }, {passive:true}));
}
function toggleSR(){
  srCollapsed=!srCollapsed;
  document.getElementById('appGrid').classList.toggle('sr-col',srCollapsed);
  const btn=document.getElementById('srToggle');
  btn.textContent=srCollapsed?'◀':'▶';
  try{localStorage.setItem('ns_sr',srCollapsed);}catch(e){}
}
// ── Native opslaan/delen via Capacitor (Filesystem + Share plugins) ──
// De Capacitor WebView heeft géén download-afhandeling: blob-links en
// navigator.share met bestanden doen daar niets. Het Android-deelmenu
// (met daarin ook "Opslaan in Bestanden/Drive") is de betrouwbare route.
async function nativeShareFile(blob,fname){
  const C=window.Capacitor;
  const FS=C?.Plugins?.Filesystem, SH=C?.Plugins?.Share;
  if(!FS||!SH) return false; // plugins niet aanwezig → web-fallback
  try{
    const b64=await new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result.split(',')[1]);
      r.onerror=()=>rej(new Error('Lezen mislukt'));
      r.readAsDataURL(blob);
    });
    const w=await FS.writeFile({path:fname,data:b64,directory:'CACHE'});
    await SH.share({title:fname,files:[w.uri]});
    return true;
  }catch(e){
    if(String(e.message||e).toLowerCase().includes('cancel')) return true; // gebruiker sloot deelmenu
    log('Native delen mislukt: '+(e.message||e),'warn');
    return false;
  }
}

async function download(name,content){
  const blob=new Blob([content],{type:'text/plain'});
  if(await nativeShareFile(blob,name)) return;
  if(window.Capacitor?.isNativePlatform?.()){ showNeedsUpdate(); return; }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
