// ══════════════════════════════════════════════════════════════════
// pidlane-fuel.js
// Brandstofanalyse
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// FUEL ANALYSIS
// ════════════════════════════════════════
// → FUEL_PIDS verplaatst naar pidlane-data.js
async function runFuelAnalysis(){
  if(!(await plVraagMeting('rit','de verbruiksanalyse','brandstof'))) return;
  activateAIPane();
  // Elektrisch voertuig heeft geen brandstof — brandstofefficiëntie-analyse
  // is niet van toepassing. Toon een passende melding i.p.v. een AI-call die
  // over benzineverbruik zou praten.
  if(vehicleFuelType()==='elektrisch'){
    document.getElementById('fuelResults').innerHTML=
      `<div style="background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.35);border-radius:9px;padding:14px;font-size:13px;color:var(--tx);line-height:1.6">
        ⚡ <b>Elektrisch voertuig</b> — brandstofefficiëntie-analyse is niet van toepassing.<br>
        <span style="font-size:12px;color:var(--tx3)">Een EV verbruikt geen brandstof, dus er is geen brandstoftrim, lambda of verbruik in liters te analyseren. Energieverbruik (kWh/100km) en accugezondheid vereisen merk-specifieke data die nog niet in PidLane zit.</span>
      </div>`;
    return;
  }
  await ensurePIDsActive('brandstof');
  const btn=document.getElementById('btnFuel'); btn.disabled=true;
  document.getElementById('fuelResults').innerHTML='<div class="ai-ld"><div class="spin"></div> Brandstofdata analyseren...</div>';
  const curatedFuel=FUEL_PIDS.map(f=>f.pid);
  const fuelMeta=Object.fromEntries(FUEL_PIDS.map(f=>[f.pid,f]));
  // Wens = relevante gezonde sensoren v/d auto ∪ gecureerde fuel-PIDs.
  // Vul ontbrekende verse waarden (demo of live poll) zodat de centrale
  // selectie ze kan meenemen — niets relevants wordt overgeslagen.
  const wensFuel=[...new Set([...relevantSupportedPIDs('brandstof'),...curatedFuel])]
    .filter(pid=>demoMode||(typeof supportedPIDs==='undefined')||!supportedPIDs.size||supportedPIDs.has(pid)||getPidDef(pid));
  for(const pid of wensFuel){
    if(pidVals[pid]===undefined){
      const val=demoMode?demo(pid):validateAndSmooth(pid,parsePID(pid,await withBus('brandstof',()=>sendCmd((typeof pidCmd==='function')?pidCmd(pid):('01'+pid.slice(2))))));
      if(val!==null&&val!==undefined) updPID(pid,val);
    }
  }
  // Centrale PID-check: relevant ∩ aanwezig ∩ niet-onzin/nodata + kwaliteitsblok.
  const fd=analysisPidData('brandstof',curatedFuel);
  const q=fd.quality;
  const measurements=fd.pairs.map(([pid,val])=>{
    const d=getPidDef(pid), meta=fuelMeta[pid];
    const ok=meta?meta.ok:null;
    let status='ok';
    if(ok) status=(val>=ok[0]&&val<=ok[1])?'ok':'bad';
    return {pid,name:(meta&&meta.name)||(d&&d.name)||pid,unit:(meta&&meta.unit)||(d&&d.unit)||'',desc:(meta&&meta.desc)||'',ok,val,status};
  });
  renderFuelGauges(measurements);
  const prijs=parseFloat(document.getElementById('fuelPrice').value)||2.05;
  const jaarKm=parseInt(document.getElementById('yearKm').value)||15000;
  const v=getVehicle();
  const mData=measurements.filter(m=>m.val!==null&&m.val!==undefined).map(m=>`• ${m.name}: ${fv(m.val)} ${m.unit} [${m.status.toUpperCase()}] — ${m.desc}`).join('\n');
  const prompt=`Je bent brandstofefficiëntie specialist. Analyseer deze OBD2 data en geef besparingsadvies in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}\nBrandstofprijs: €${prijs}/liter | Jaarkilometers: ${jaarKm.toLocaleString('nl')} km\nDTC: ${formatDtcCodes(dtcCodes)}\n\nLIVE METINGEN:\n${mData||'(geen data)'}${q.promptBlok}\n\nGeef: HUIDIGE SITUATIE, GEVONDEN INEFFICIËNTIES, BESPAARTIPS (€/jaar), TOTALE BESPARING, RIJSTIJL TIPS`;
  try{
    const text=await apiFetch(prompt,1400);
    const secs=[{k:'HUIDIGE SITUATIE',i:'📊',c:'blue'},{k:'GEVONDEN INEFFICIËNTIES',i:'🔍',c:'orange'},{k:'BESPAARTIPS',i:'💡',c:'green'},{k:'TOTALE BESPARING',i:'💶',c:'purple'},{k:'RIJSTIJL TIPS',i:'🚗',c:'blue'}];
    const found=[];
    secs.forEach(s=>{if(text.toLowerCase().includes(s.k.toLowerCase()))found.push({...s,idx:text.toLowerCase().indexOf(s.k.toLowerCase())});});
    found.sort((a,b)=>a.idx-b.idx);
    let html='<div class="ai-res">';
    found.forEach((s,i)=>{const next=found[i+1];const re=new RegExp(`${s.k}\\s*([\\s\\S]*?)${next?`(?=${next.k})`:'$'}`,'i');const m=text.match(re);if(!m)return;const body=m[1].trim();if(!body)return;html+=`<div class="ai-sec ${s.c}"><div class="ai-sh ${s.c}">${_titleCase(s.k)}</div><div class="ai-sb">${_fmtReportBody(body)}</div></div>`;});
    if(!found.length)html+=`<div class="ai-sec blue"><div class="ai-sh blue">💡 Analyse</div><div class="ai-sb">${_fmtReportBody(text)}</div></div>`;
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
    c.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${m.name}</div><div style="font-family:var(--m);font-size:18px;font-weight:500;color:${color};line-height:1">${hasVal?fv(m.val):'—'} <span style="font-size:11px;color:var(--tx3)">${m.unit}</span></div><div style="font-size:11px;margin-top:3px">${icon} ${m.status==='ok'?'Normaal':m.status==='bad'?'Afwijking':'Geen data'}</div>`;
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
// ── GLOBALE AI-BEZIG STATUSBALK ──
// Eén indicator die over élk scherm zichtbaar blijft zolang er een AI-call
// loopt (ook als je naar live-data of de logs kijkt of tussen live-modes
// wisselt). Maakt expliciet dat je moet wachten én dat het proces doorloopt.
// De AI-call wordt nergens afgebroken door navigeren — dit is puur zichtbaarheid.
let _aiBusy=0, _aiBusyTimer=null, _aiBusyT0=0, _aiBusySafety=null;
function aiBusyBegin(){
  _aiBusy++;
  if(_aiBusy>1) return;
  _aiBusyT0=Date.now();
  let bar=document.getElementById('aiBusyBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='aiBusyBar';
    bar.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:9700;display:flex;align-items:center;gap:11px;padding:10px 14px;background:linear-gradient(135deg,#161b2b,#0c111c);border-top:1px solid rgba(167,139,250,.45);color:#cbd5e1;font-family:var(--f);font-size:13px;box-shadow:0 -4px 20px rgba(0,0,0,.4)';
    bar.innerHTML='<div class="spin" style="flex-shrink:0"></div>'
      +'<div style="flex:1;min-width:0"><b style="color:#a78bfa">AI analyseert…</b> <span id="aiBusyTime" style="color:var(--tx3)"></span>'
      +'<div style="font-size:12px;color:var(--tx3);line-height:1.4">Even geduld — dit proces loopt door, ook terwijl je live-data of logs bekijkt.</div></div>';
    document.body.appendChild(bar);
  }
  bar.style.display='flex';
  const tick=()=>{ const el=document.getElementById('aiBusyTime'); if(el) el.textContent='('+Math.round((Date.now()-_aiBusyT0)/1000)+'s)'; };
  tick();
  _aiBusyTimer=setInterval(tick,1000);
  if(_aiBusySafety) clearTimeout(_aiBusySafety);
  _aiBusySafety=setTimeout(function(){ _aiBusy=0; aiBusyEnd(); },300000); // fail-safe: nooit langer dan 5 min blijven hangen
}
function aiBusyEnd(){
  _aiBusy=Math.max(0,_aiBusy-1);
  if(_aiBusy>0) return;
  if(_aiBusyTimer){ clearInterval(_aiBusyTimer); _aiBusyTimer=null; }
  if(_aiBusySafety){ clearTimeout(_aiBusySafety); _aiBusySafety=null; }
  const bar=document.getElementById('aiBusyBar'); if(bar) bar.style.display='none';
}

// ── Token-/kostenteller per sessie (admin) ──
// Prijzen per model (EUR/MTok, koers ~0,92 €/$). Fix 15-07: de teller rekende
// altijd Haiku-tarief terwijl standaard Sonnet 5 draait → kosten ~3x te laag.
// Sonnet 5: introprijs $2/$10 t/m 31-08-2026, daarna $3/$15 (geverifieerd
// 15-07-2026, platform.claude.com). NB: Sonnet 5 heeft een nieuwe tokenizer
// (~30% meer tokens voor dezelfde tekst) — usage-velden zijn dus hoger dan
// bij Sonnet 4.6, de prijs per token is gelijk.
/* Tarieven per miljoen tokens, in DOLLAR — zoals Anthropic ze publiceert.
   Nagekeken bij de bron op 28-08-2026 (platform.claude.com, models/overview).

   Waarom in dollar en niet meer in euro: hiervoor stonden hier omgerekende
   euro's met de koers onzichtbaar in de getallen gebakken ($15 → €13,80). Dan
   is niet te zien of een getal verouderd is omdat de prijs veranderde of omdat
   de koers dat deed. Nu staat de koers apart, mét de datum waarop hij gold.

   Wat hier op 28-08-2026 fout stond (#48):
   - Opus op $15/$75. Dat is de Opus 3-generatie; elke huidige Opus (5, 4.8,
     4.7, 4.6) kost $5/$25. De app toonde dus drie keer te sombere kosten,
     precies op het getal waarop je besluit om Opus níét te gebruiken.
   - Een "introductieprijs" voor Sonnet 5 die niet bestaat: de code sprong op
     01-09-2026 van $2/$10 naar $3/$15. Sonnet 5 is gewoon $2/$10; $3/$15 is
     het tarief van Sonnet 4.6, een ander model. Zonder deze fix was de teller
     drie dagen later 50% gaan overdrijven zonder dat er iets veranderde.

   NIET meegerekend, allebei in ons voordeel: cache-reads kosten 10% van het
   invoertarief en de Batch API is 50% goedkoper. Deze schatting is dus een
   bovengrens, en dat is de veilige kant. */
const USD_EUR = 0.92;              // koers van 28-08-2026, met de hand gezet
const MODEL_USD = {
  haiku:  { inp: 1,  out: 5  },    // Haiku 4.5
  opus:   { inp: 5,  out: 25 },    // Opus 5 / 4.8 / 4.7 / 4.6
  sonnet: { inp: 2,  out: 10 }     // Sonnet 5  (Sonnet 4.6 was $3/$15)
};
function _modelPriceEur(mdl){
  const m=String(mdl||'').toLowerCase();
  const t = m.includes('haiku') ? MODEL_USD.haiku
          : m.includes('opus')  ? MODEL_USD.opus
          : MODEL_USD.sonnet;
  return { inp: t.inp * USD_EUR, out: t.out * USD_EUR };
}
let _sessTokIn=0,_sessTokOut=0,_sessCalls=0,_sessCostEur=0;
function trackTokens(u, mdl){
  const i=u.input_tokens||0,o=u.output_tokens||0;
  try{ PidLaneEvalLog.log('ai','tokens',{tokensIn:i,tokensOut:o}); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  const P=_modelPriceEur(mdl);
  _sessTokIn+=i; _sessTokOut+=o; _sessCalls++;
  _sessCostEur += i/1e6*P.inp + o/1e6*P.out;
  updateTokenPill(true);
}
function updateTokenPill(flash){
  if(!isAdmin()) return;
  let p=document.getElementById('tokPill');
  if(!p){
    p=document.createElement('div'); p.id='tokPill';
    p.style.cssText='position:fixed;left:8px;bottom:72px;z-index:var(--z-zwevend,9400);background:var(--sur2,#1a1f2e);border:1px solid var(--bd,#2a3142);color:var(--tx2,#cbd5e1);font:700 10px/1 var(--f,sans-serif);padding:6px 9px;border-radius:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);transition:background .25s,border-color .25s';
    p.onclick=showTokenDetail; document.body.appendChild(p);
  }
  const tot=_sessTokIn+_sessTokOut;
  p.innerHTML='\ud83e\ude99 '+tot.toLocaleString('nl')+' tok \u00b7 \u20ac'+_sessCostEur.toFixed(_sessCostEur<1?3:2);
  if(flash){ p.style.background='rgba(0,180,204,.28)'; p.style.borderColor='#00b4cc'; setTimeout(()=>{ if(p){ p.style.background='var(--sur2,#1a1f2e)'; p.style.borderColor='var(--bd,#2a3142)'; } },650); }
}
function showTokenDetail(){
  showToast?.('\ud83e\ude99 Sessie: '+_sessCalls+' AI-calls \u00b7 '+_sessTokIn.toLocaleString('nl')+' in / '+_sessTokOut.toLocaleString('nl')+' uit \u00b7 \u20ac'+_sessCostEur.toFixed(3));
}
// ── REMOTE CONFIG: ophalen + toepassen ─────────────────────────────
// Best-effort: faalt nooit hardop. Bij geen verbinding draait de app op de
// hardcoded fallback (+ evt. localStorage-cache).
function _cfgBool(v, def){
  if(v===undefined||v===null||v==='') return def;
  return (v===true||v==='true'||v==='1');
}
// GET /api/config vereist een geldig sessietoken. Deze functie draait op twee
// momenten: bij boot (DOMContentLoaded) en opnieuw in finishLogin(). Bij boot
// is window.APP_TOKEN nog leeg — dat wordt pas gezet bij login of bij herstel
// van een onthouden sessie. Daarom pakken we het token hier desnoods zelf uit
// tokLoad(): is er een onthouden, nog geldige sessie, dan slaagt de fetch al
// bij boot. Is die er niet, dan faalt hij netjes en haalt finishLogin() de
// config alsnog op zodra er wel een token is.
//
// LET OP bij toekomstig sleutelwerk: faalt dit stil, dan lijkt admin.html
// kapot terwijl de config gewoon in Airtable staat. Daarom loggen we hier
// altijd de uitkomst — zichtbaar in het logcentrum.
async function loadRemoteConfig(){
  let _tok='';
  try{ _tok = window.APP_TOKEN || (tokLoad()?.token) || ''; }catch(e){ _tok = window.APP_TOKEN || ''; }
  try{
    if(!_tok){ try{ log('Config: nog geen sessietoken — wordt na login opgehaald','info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } return false; }
    const r=await plFetch('/api/config',{ headers:{ 'X-App-Token':_tok } });
    if(!r.ok){
      try{ log('Config niet geladen — HTTP '+r.status+' (app draait op standaardinstellingen)','warn'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
      return false;
    }
    const cfg=await r.json();
    if(cfg&&typeof cfg==='object'){
      window.PID_CONFIG={...window.PID_CONFIG,...cfg};
      try{ localStorage.setItem('pl_remote_config',JSON.stringify(window.PID_CONFIG)); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
      try{ applyConfigToUI(); }catch(e){ log('Config binnen, maar niet op het scherm toegepast — deuren/banner/featureflags kunnen verouderd staan: '+(e.message||e),'warn'); }
      try{
        const _uit=Object.keys(FEATURE_TOGGLES||{}).filter(k=>!featOn(k));
        log('Config geladen: '+Object.keys(cfg).length+' sleutels'+(_uit.length?' — uit: '+_uit.join(', '):' — alles aan'),'ok');
      }catch(e){ console.warn('Samenvattingsregel na config-load niet getoond', e); }
      return true;
    }
    return false;
  }catch(e){
    // offline / Worker onbereikbaar → fallback blijft actief
    try{ log('Config niet bereikbaar — app draait op standaardinstellingen','warn'); }catch(_e){ /* stil: melding mag nooit de stroom breken */ }
    return false;
  }
}
// ════════════════════════════════════════════════════════════════
//  FEATURE-FLAGS — alle functies op afstand aan/uit via admin.html.
//  Config-keys (feat_*) komen uit Airtable via de Worker; ontbrekend of
//  onbekend = AAN. Basisfuncties (login, verbinden, live-tegels, onderbalk-
//  kern, topbar, deur 1 zelf, log-centrum) hebben bewust GEEN flag.
// ════════════════════════════════════════════════════════════════
const FEATURE_TOGGLES = {
  feat_ai_monteur:   ['#wc-diag'],
  feat_deepdiag:     ['#wc-deepdiag'],
  feat_pidrecorder:  ['#wc-pidrec'],
  feat_conditiecheck:['#wc-check'],
  feat_foutcodes:    ['#wc-dtc'],
  feat_rijtest:      ['#wc-rit10','#wc-rit10b'],
  feat_onderhoud:    ['#wc-onderhoud'],
  feat_koopcheck:    ['#wc-koop'],
  feat_proefrit:     ['#wc-proefrit'],
  feat_verbruik:     ['#wc-fuel'],
  feat_basiccheck:   ['#wc-basiccheck'],
  feat_monitor:      ['#wc-monitor'],
  feat_caravan:      ['#wc-caravan'],
  feat_langerit:     ['#wc-langerit'],
  feat_seizoen:      ['#wc-seizoen'],
  feat_ev:           ['#wc-ev'],
  feat_live_spec:    ['#wc-live'],
  feat_grafiek:      ['#tabGraph'],
  feat_pid_keuze:    ['.tabs .tab-action'],   // was '#bnPids' (onderbalk verwijderd)
  feat_dossier:      ['#vtagPct','#vehOverview'],
  feat_situatie:     ['#situatieBtn','#sitBlok','#vtagSit','#situatieSheet'],
  feat_pdf:          ['button[onclick^="exportAIReportPDF"]','#pdfReadyModal'],
  feat_ai_reply:     ['#aiReplyWrap'],
  // BEIDE demoknoppen, en dat is geen dubbelop. #btnDemo staat in het
  // verbindscherm, #btnDemoLogin op het loginscherm — die tweede kwam er bij
  // de Play Store-ronde van 21-08 bij, maar niet hier. Gevolg: met
  // feat_demo=false verdween de ene knop en bleef de andere staan als dode
  // knop die alleen "uitgeschakeld door beheerder" toonde. Precies de knop
  // waar de reviewnotitie naar verwijst.
  feat_demo:         ['[id="btnDemo"]','[id="btnDemoLogin"]'],
  feat_tokens:       ['#tokPill']
};
function featOn(key){ try{ return _cfgBool((window.PID_CONFIG||{})[key], true); }catch(e){ return true; } }
function applyFeatureToggles(){
  let css='';
  for(const k in FEATURE_TOGGLES){
    if(!featOn(k)) css += FEATURE_TOGGLES[k].join(',') + '{display:none !important}\n';
  }
  let st=document.getElementById('featCss');
  if(!st){ st=document.createElement('style'); st.id='featCss'; document.head.appendChild(st); }
  st.textContent=css;
}

function applyConfigToUI(){
  const c=window.PID_CONFIG||{};
  // Deuren tonen/verbergen op de hub
  const setDoor=(cls,on)=>{ const el=document.querySelector('.wm-door.'+cls); if(el) el.style.display=on?'':'none'; };
  setDoor('dr-saving', _cfgBool(c.door_saving_active,true));
  setDoor('dr-deal',   _cfgBool(c.door_deal_active,true));
  setDoor('dr-prep',   _cfgBool(c.door_prep_active,true));
  // Banner bovenin de hub
  try{
    let b=document.getElementById('cfgBanner');
    const show=_cfgBool(c.banner_active,false) && (c.banner_text||'').trim();
    if(show){
      if(!b){
        b=document.createElement('div'); b.id='cfgBanner';
        b.style.cssText='position:relative;z-index:9560;margin:0 12px 10px;padding:9px 12px;border-radius:10px;background:rgba(242,130,12,.12);border:1px solid rgba(242,130,12,.5);color:#ffd0a0;font-size:12.5px;font-weight:600;line-height:1.4';
        const host=document.getElementById('wmDoors');
        if(host&&host.parentNode) host.parentNode.insertBefore(b,host);
      }
      b.textContent='📢 '+c.banner_text;
      b.style.display='';
    } else if(b){ b.style.display='none'; }
  }catch(e){ console.warn('Configbanner niet getekend', e); }
  try{ applyFeatureToggles(); }catch(e){ log('Featureflags niet toegepast — schermdelen die uit zouden moeten staan, kunnen zichtbaar blijven: '+(e.message||e),'warn'); }
}
// Ook bij boot toepassen (gecachte config), niet alleen na verse fetch.
document.addEventListener('DOMContentLoaded', function(){ try{ applyConfigToUI(); }catch(e){ console.warn('Gecachte config niet toegepast bij het opstarten', e); } });

// ── Gedeelde basisregels voor alle PidLane-AI-rollen ───────────────
// Eén bron van waarheid voor de harde regels (geen aannames, zekerheid
// benoemen, brandstof-check, geen ECU-acties). Specialistische prompts
// (onderhoud/inkoop/prijs/lease/APK/EV/lange-rit/auto-expert) plakken hier
// hun eigen rol-zin vóór, i.p.v. een losse complete persona te schrijven.
function pidlaneBasisRegels(){
  let _vi={}; try{ if(typeof vehicleInfo!=='undefined'&&vehicleInfo) _vi=vehicleInfo; }catch(e){ console.warn('vehicleInfo niet leesbaar voor de brandstofregel, valt terug op ONBEKEND', e); }
  const _bf=(_vi.brandstof||'').toString().toLowerCase();
  let _bfRegel;
  if(/diesel/.test(_bf)) _bfRegel='Dit is een DIESEL: roetfilter (DPF), AdBlue/SCR en NOx zijn relevant; brandstoftrim-logica wijkt af.';
  else if(/benzine|petrol/.test(_bf)) _bfRegel='Dit is een BENZINEauto: noem GEEN diesel-, DPF/roetfilter-, AdBlue/SCR- of NOx-onderwerpen.';
  else if(/hybr/.test(_bf)) _bfRegel='Dit is een HYBRIDE: combineer verbrandings- en elektrische logica; geen diesel/DPF tenzij expliciet diesel-hybride.';
  else if(/elektr/.test(_bf)) _bfRegel='Dit is VOLLEDIG ELEKTRISCH: geen brandstoftrim, lambda/O2, MAF of uitlaat; richt je op accu en aandrijving.';
  else _bfRegel='Brandstoftype is ONBEKEND: doe GEEN aannames over diesel, turbo, hybride of uitlaatnabehandeling.';
  return _bfRegel+'\n'+
    'HARDE REGELS:\n'+
    '1. Onderbouw bevindingen met concrete gemeten waarden (met eenheid) waar beschikbaar. Geen standaardriedels.\n'+
    '2. Geef bij twijfel aan dat een meetfout/dode sensor/net-over-de-grens-waarde NOOIT als hard defect mag worden gepresenteerd — adviseer eerst verifiëren, zodat de klant niet onnodig op kosten wordt gejaagd.\n'+
    '3. Geef per bevinding een zekerheid waar relevant: zeker / waarschijnlijk / mogelijk. Speculatie benoem je als speculatie.\n'+
    '4. Gebruik merk/model/bouwjaar-specifieke kennis als aandachtspunt, niet als vaststaand feit.\n'+
    '5. Geen ECU-acties adviseren (read-only diagnose). Schrijf bondig en concreet in helder Nederlands.';
}

// Haalt de zichtbare tekst uit een Anthropic-response. Sonnet 5 kan een
// thinking-block op content[0] zetten; we zoeken daarom het eerste text-block
// i.p.v. blind content[0] te pakken. Robuust voor alle modellen.
function extractAIText(data){
  try{
    const blocks = (data && data.content) || [];
    for(const b of blocks){ if(b && b.type==='text' && typeof b.text==='string') return b.text; }
    // fallback: oud formaat of onverwachte structuur
    if(blocks[0] && typeof blocks[0].text==='string') return blocks[0].text;
  }catch(e){ console.warn('AI-antwoord niet uit te lezen uit de responsestructuur', e); }
  return '';
}

async function apiFetch(prompt, maxTokens=4000, systemPrompt=null, model=null){
  // Key ophalen — prioriteit: login account → window → localStorage
  let key = '';
  try{
    if(currentUser && typeof USERS!=='undefined' && USERS[currentUser?.name||currentUser]?.apiKey?.startsWith('sk-ant-')){
      key = USERS[currentUser?.name||currentUser].apiKey;
    }
  }catch(e){ console.warn('Accountsleutel niet uitgelezen, val terug op window.anthropicKey', e); }
  if(!key) key = window.anthropicKey||'';
  if(!key) try{ key=localStorage.getItem('ns_api_key')||''; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }

  log(`apiFetch: key ${key?'aanwezig ('+key.length+' tekens)':'LEEG'}`,'info');

  // Proxy-modus: de Worker levert de sleutel server-side, dus geen sk-ant- in de app nodig.

  // System prompt als losse parameter — NIET in messages array
  // Sterke, dynamische monteur-instructie. Injecteert het bevestigde brandstoftype
  // zodat de AI geen diesel/AdBlue/turbo verzint op een benzineauto, en dwingt
  // onderbouwing met gemeten waarden + onderscheid koud/warm af.
  let _vi={}; try{ if(typeof vehicleInfo!=='undefined'&&vehicleInfo) _vi=vehicleInfo; }catch(e){ console.warn('vehicleInfo niet leesbaar voor de AI-prompt', e); }
  const _vTxt=[_vi.merk,_vi.model,_vi.year,_vi.motor].filter(Boolean).join(' ')||'onbekend voertuig';
  const _bf=(_vi.brandstof||'').toString().toLowerCase();
  // Live toestand meegeven zodat referenties VOORWAARDELIJK beoordeeld worden.
  // Zonder dit toetste de AI tegen statische banden (bijv. accuspanning 13,0 V
  // "normaal" tegen 12,6-14,4 V terwijl de motor draaide — dan hoort er
  // laadspanning 13,5-14,8 V te staan en is 13,0 V juist verdacht).
  let _stTxt='onbekend';
  try{
    const _st=(window.PLMon&&window.PLMon._state)?window.PLMon._state():null;
    const _rpm=(typeof pidVals!=='undefined')?pidVals['010C']:undefined;
    const _spd=(typeof pidVals!=='undefined')?pidVals['010D']:undefined;
    _stTxt=[_st?('rij-fase '+_st.fase+', motor '+_st.temp):null,
            (typeof _rpm==='number')?(Math.round(_rpm)+' rpm — motor '+(_rpm>400?'DRAAIT':'uit')):null,
            (typeof _spd==='number')?(Math.round(_spd)+' km/u'):null
           ].filter(Boolean).join(', ')||'onbekend';
  }catch(e){ console.warn('Live toestand niet uit te lezen voor de AI-prompt, valt terug op ONBEKEND (AI gaat dan voorzichtiger beoordelen)', e); }
  const _defaultSys =
    'Jij bent PidLane AI-Monteur: een ervaren, kritische autotechnicus die OBD2-sensordata interpreteert voor Nederlandse autobedrijven.\n'+
    'VOERTUIG: '+_vTxt+(_bf?(' \u2014 brandstof: '+_bf):'')+'.'+_dossierPromptLine()+'\n'+
    pidlaneBasisRegels()+'\n'+
    '6. Houd rekening met de toestand. Bij een KOUDE start zijn een hoge korte-termijn brandstoftrim, langzame opwarming, hoger stationair toerental en een rijker mengsel NORMAAL. Markeer dat alleen als probleem wanneer de data laat zien dat het bij bedrijfstemperatuur aanhoudt. Benoem expliciet wanneer iets normaal is voor deze situatie.\n'+
    '7. VOORWAARDELIJKE REFERENTIES \u2014 GEMETEN TOESTAND NU: '+_stTxt+'. Toets elke sensorwaarde tegen de referentie die bij deze toestand hoort, niet tegen een statische band. Concreet: accuspanning bij DRAAIENDE motor is laadspanning, referentie 13,5-14,8 V (12,6-14,4 V geldt alleen bij motor uit; 13,0 V bij draaiende motor duidt op een laadprobleem). Het stationair-toerentalbereik geldt alleen bij stilstand. Inlaatdruk 20-35 kPa geldt alleen stationair bij benzine. Uitlaatgastemperatuur beoordeel je naar belasting. Brandstoftrims beoordeel je alleen bedrijfswarm. Kun je de voor een oordeel benodigde toestand niet vaststellen, gebruik dan status "niet beoordeelbaar" \u2014 nooit "normaal" bij een niet-passende referentie.';
  // Admin-override (remote config) heeft voorrang als die gezet is en er geen
  // expliciete per-call systemPrompt is meegegeven.
  let _override=''; try{ _override=(window.PID_CONFIG&&window.PID_CONFIG.ai_system_override||'').trim(); }catch(e){ console.warn('Admin-override niet leesbaar, systeemprompt blijft op de standaard', e); }
  let sys = systemPrompt || (_override || _defaultSys);
  // Rijsituatie geldt voor ELKE AI-rol — ook bij een eigen systemPrompt of een
  // admin-override. Zonder dit beoordeelt de AI een caravanrit als een zieke
  // auto: hoog verbruik, hoge belasting en warm koelwater zijn dan juist normaal.
  try{ sys += _situatiePromptLine(); }catch(e){ console.warn('Rijsituatie niet aan de AI-prompt toegevoegd — een caravanrit of hoge belasting kan dan onterecht als probleem beoordeeld worden', e); }
  // Vóór de analyse: één venster met de meetcontext-vragen (start/stop, deed
  // de klacht zich voor, liep de meting door) en — als er eerdere rapporten
  // in deze sessie zijn — de vraag of die mee mogen. Valt er niets meer te
  // vragen omdat alles al beantwoord is, dan verschijnt er geen venster.
  // De keuze over rapporten staat in window._srUseContext en is aanpasbaar
  // via het 📄 Rapporten-overzicht; daar staat ook de meetcontext.
  try{
    const _srBlok=_sessionReportsPromptBlock(String(prompt||''));
    const _ant=await plVoorAnalyse(!!_srBlok);
    if(_srBlok && _ant && _ant.rapporten) sys += _srBlok;
  }catch(e){ console.warn('Eerdere rapporten niet meegestuurd als context', e); }
  // De meetcontext geldt voor ELKE AI-rol, net als de rijsituatie hierboven —
  // ook bij een eigen systemPrompt of een admin-override. Zonder deze regel
  // leest de AI een start/stop-motor als een motor die afslaat.
  try{ sys += plMeetcontextPromptLine(); }
  catch(e){ console.warn('Meetcontext niet aan de AI-prompt toegevoegd — start/stop kan dan als afslaan gelezen worden', e); }

  const mdl = model || 'claude-sonnet-5';

  // ── Tegoed + kostenpreview (pidlane-credits.js) ────────────────────
  // Eén haak voor ALLE AI-calls: op dit punt zijn prompt en sys volledig
  // samengesteld, dus meten we wat er echt over de lijn gaat — inclusief
  // het contextblok met eerdere rapporten, de dossier- en situatieregel.
  // De module is fail-open: ontbreekt hij of gaat er iets mis, dan draait
  // de analyse gewoon door zonder afboeking. Annuleren door de gebruiker
  // gooit een fout met .plAfgebroken zodat callers dat kunnen herkennen.
  let _plCred=null;
  try{
    if(window.PLCredits && typeof window.PLCredits.preflight==='function'){
      _plCred = await window.PLCredits.preflight(prompt, sys, maxTokens, mdl);
    }
  }catch(e){
    if(e && e.plAfgebroken) throw e;                 // bewuste keuze van de gebruiker
    log('Tegoedcontrole overgeslagen: '+(e&&e.message||e),'warn');
  }

  aiBusyBegin();
  const _plT0=Date.now();
  try{
    // Rapport in delen ophalen als het tegen het tokenplafond loopt
    // (stop_reason 'max_tokens'). Voorheen werd een half rapport stilletjes
    // getoond, midden in een woord afgekapt. Nu: max 2 vervolgcalls met
    // "ga verder", daarna nette melding in de tekst zelf.
    let msgs=[{role:'user', content: prompt}];
    let full='';
    for(let part=0; part<3; part++){
      const body = {
        model: mdl,
        max_tokens: maxTokens,
        system: sys,
        messages: msgs
      };
      // Extended thinking bewust UIT: voor OBD2-rapporten met vaste structuur
      // geen meerwaarde, wel trager/duurder en vreet uit het token-budget.
      // thinking:{type:'disabled'} is geldig op Sonnet 5 (geverifieerd 15-07-2026
      // op platform.claude.com; alleen type:'enabled'+budget_tokens geeft 400).
      // Haiku 4.5 kent het type 'disabled' niet → daar het veld weglaten
      // (zonder thinking-veld draait Haiku sowieso zonder thinking).
      if(!/haiku/i.test(mdl)) body.thinking = { type: 'disabled' };
      const resp = await plFetch('/v1/messages',{ method: 'POST', json: body });

      if(!resp.ok){
        const err=await resp.json().catch(()=>({}));
        const msg=err?.error?.message||`HTTP ${resp.status}`;
        // Ook een weigering draagt het saldo: bij 402 (onvoldoende_tegoed) staat
        // het echte getal in de body. Zonder deze regel blijft de teller op het
        // te hoge lokale getal staan en probeert de app het gewoon opnieuw.
        try{ window.PLCredits?.volgServer?.(resp.headers, err); }catch(e){ console.warn('Serversaldo uit de weigering niet overgenomen', e); }
        if(resp.status===401) throw new Error('Proxy weigert (401): sessie verlopen of ongeldig — log uit en opnieuw in.');
        if(resp.status===400) throw new Error(`API fout (400): ${msg}`);
        throw new Error(msg);
      }
      const data=await resp.json();
      try{ if(data.usage) trackTokens(data.usage, mdl); }catch(e){ console.warn('Tokengebruik niet geregistreerd voor deze call', e); }
      // Afboeken op het EERSTE geslaagde antwoord — vervolgdelen bij
      // max_tokens rekenen niet nog eens. boek() kalibreert meteen de
      // tekens→tokens-schatting bij op de echte usage.
      try{ if(_plCred && !_plCred.geboekt) window.PLCredits.boek(_plCred, data.usage); }catch(e){ console.warn('Lokale saldoteller niet bijgewerkt — de server heeft al afgeboekt, alleen de weergave kan achterlopen', e); }
      // En daarna het echte saldo van de server erover heen. boek() rekent met
      // de schatting; de Worker stuurt in X-PidLane-Saldo wat er werkelijk van
      // het account af ging. Deze volgorde is het hele punt: de laatste die
      // schrijft is de bron, en dat hoort de server te zijn (§8 PIDLANE.md).
      // Bij een vervolgcall op max_tokens komt de header opnieuw mee — ook dat
      // deel is afgeboekt, dus ook dat getal telt.
      try{ window.PLCredits?.volgServer?.(resp.headers, data); }catch(e){ console.warn('Serversaldo niet overgenomen — de teller loopt op de schatting', e); }
      try{ PidLaneEvalLog.log('ai','api-call',{model:mdl,latencyMs:Date.now()-_plT0,part:part+1,stop:data.stop_reason||''}); }catch(e){ /* stil: melding mag nooit de stroom breken */ }

      const txt=extractAIText(data)||'';
      full+=txt;

      if(data.stop_reason!=='max_tokens') return full;      // klaar (end_turn e.d.)
      if(!txt.trim()) return full;                          // niets nieuws — stop veilig

      if(part===2){
        // Nog steeds afgekapt na 2 vervolgcalls — eerlijk melden in het rapport
        log('AI-rapport na 3 delen nog niet compleet (max_tokens)','warn');
        return full+'\n\n[Rapport ingekort — de analyse was langer dan het maximum. Vraag desnoods een beknoptere versie.]';
      }
      log('AI-antwoord raakte tokenplafond — vervolg wordt opgehaald (deel '+(part+2)+')','warn');
      // Let op: assistant-content mag niet eindigen op witruimte (API-eis)
      msgs=[...msgs,
        {role:'assistant', content: txt.replace(/\s+$/,'')},
        {role:'user', content:'Ga exact verder waar je stopte. Herhaal niets van wat er al staat en begin niet opnieuw met een inleiding of sectiekop die al af is.'}
      ];
    }
    return full;
  } finally {
    aiBusyEnd();
  }
}
function aiVerdict(text){
  var scan=String(text);
  function hit(words){
    var rx=new RegExp(words,'gi'), m;
    while((m=rx.exec(scan))!==null){
      var before=scan.slice(Math.max(0,m.index-26), m.index).toLowerCase();
      if(/\b(geen|niet|zonder|nergens|niets)\b[^.!?\n]*$/.test(before)) continue; // ontkend in dezelfde zin -> negeren
      return true;
    }
    return false;
  }
  let vc='green', vi='🟢', vt='Geen urgente problemen gevonden';
  if(hit('🔴|niet rijden|kritiek|gevaarlijk|direct naar de garage|onveilig|levensgevaar')){ vc='red'; vi='🔴'; vt='Aandacht vereist — laat dit nakijken'; }
  else if(hit('🟡|let op|binnenkort|aanbevolen|op termijn|aandacht')){ vc='amber'; vi='🟡'; vt='Let op — niet direct kritiek'; }
  try{ if(scan.length>200){ PidLaneEvalLog.log('ai','verdict',{stoplicht:{green:'groen',amber:'oranje',red:'rood'}[vc]}); } }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  return { vc, vi, vt, clr:{green:'var(--gn)',amber:'var(--or)',red:'var(--rd)'}[vc], bg:{green:'var(--gns)',amber:'var(--ors)',red:'var(--rds)'}[vc] };
}
// Volledig gesectioneerd rapport (voor in de sheet).
function _fmtReportBody(body){
  var esc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var euro=function(s){return s.replace(/(€\s?\d[\d.,]*)/g,'<span class="ai-cost">$1</span>');};
  var clean=function(s){return String(s).replace(/\*\*/g,'').replace(/[\u2705\u274C\u26A0\uFE0F\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/^#{1,6}\s*/,'').trim();};
  var statusCls=function(t){t=String(t).toLowerCase();
    if(/(direct|kritiek|defect|vervang|ernstig|gevaar|onveilig)/.test(t))return 'r';
    if(/(controle|aanbevolen|let op|afwijk|verhoogd|te (hoog|laag)|aandacht|mogelijk)/.test(t))return 'y';
    if(/(normaal|correct|goed|prima|binnen|\bok\b)/.test(t))return 'g';
    return '';};
  var raw=String(body).split('\n');
  var out=''; var i=0;
  while(i<raw.length){
    var line=clean(raw[i]);
    if(!line){ i++; continue; }
    if(line.indexOf('|')>=0){
      var rows=[];
      while(i<raw.length){
        var lr=clean(raw[i]);
        if(!lr||lr.indexOf('|')<0) break;
        if(/^[\s:|-]+$/.test(lr)&&/--/.test(lr)){ i++; continue; }
        rows.push(lr.replace(/^\||\|$/g,'').split('|').map(function(c){return c.trim();}));
        i++;
      }
      if(rows.length){
        var head=rows[0], bd=rows.slice(1);
        var scol=-1; head.forEach(function(c,ci){ if(/status/i.test(c)) scol=ci; });
        out+='<table class="ai-tbl"><thead><tr>';
        head.forEach(function(c){ out+='<th>'+euro(esc(c))+'</th>'; });
        out+='</tr></thead><tbody>';
        bd.forEach(function(r){
          var sc=scol>=0&&r[scol]?statusCls(r[scol]):'';
          out+='<tr>';
          r.forEach(function(c,ci){
            var cc=(ci===scol&&sc)?(' class="st '+sc+'"'):'';
            out+='<td'+cc+'>'+euro(esc(c))+'</td>';
          });
          out+='</tr>';
        });
        out+='</tbody></table>';
      }
      continue;
    }
    var lm=line.replace(/^[-•*]\s*/,'');
    var kv=lm.match(/^([^:]{2,46}):\s+(.{1,120})$/);
    if(kv && !/[.!?]$/.test(kv[1])){
      var sc2=statusCls(kv[2]);
      out+='<div class="ai-row'+(sc2?' '+sc2:'')+'"><span class="k">'+esc(kv[1])+'</span><span class="v">'+euro(esc(kv[2]))+'</span></div>';
      i++; continue;
    }
    if(/^[-•*]\s+/.test(clean(raw[i]))){
      out+='<div class="ai-li">'+euro(esc(lm))+'</div>'; i++; continue;
    }
    out+='<p>'+euro(esc(lm))+'</p>'; i++;
  }
  return out;
}
function _titleCase(k){ var s=String(k).toLowerCase(); return s.charAt(0).toUpperCase()+s.slice(1); }
function _scoreHeader(text){
  var g=function(re){ var m=String(text).match(re); return m?m[1]:null; };
  var score=g(/voertuigscore[:\s]+(\d{1,3})/i), conf=g(/betrouwbaarheid[:\s]+(\d{1,3})/i);
  var stor=g(/actieve\s+storingen[:\s]+(\d{1,3})/i), att=g(/aandachtspunten[:\s]+(\d{1,3})/i);
  if(!score&&!conf&&stor==null&&att==null) return '';
  var cells='';
  function c(l,v,s){ return '<div class="sc-cell"><div class="sc-val">'+v+(s?'<small>'+s+'</small>':'')+'</div><div class="sc-lbl">'+l+'</div></div>'; }
  if(score) cells+=c('Voertuigscore',score,'/100');
  if(conf) cells+=c('Betrouwbaarheid',conf,'%');
  if(stor!=null) cells+=c('Actieve storingen',stor,'');
  if(att!=null) cells+=c('Aandachtspunten',att,'');
  var bar='';
  if(score){ var n=Math.max(3,Math.min(100,parseInt(score,10))); var col=n>=80?'var(--gn)':n>=60?'var(--or)':'var(--rd)'; bar='<div class="sc-bar"><span style="width:'+n+'%;background:'+col+'"></span></div>'; }
  return '<div class="sc-card"><div class="sc-h">Technische voertuigstatus</div>'+bar+'<div class="sc-grid">'+cells+'</div></div>';
}
function _systemBars(text){
  var m=String(text).match(/systeem(?:gezondheid|scores|overzicht)[:\s]*\n([\s\S]*?)(?:\n\s*\n|\n[A-Z]{4,}|$)/i);
  if(!m) return '';
  var bars=''; var any=false;
  m[1].split('\n').forEach(function(l){
    var mm=l.replace(/^[\s\-•*]+/,'').replace(/\*\*/g,'').match(/^([A-Za-zÀ-ÿ\/ ]{3,28}?)[:\s]+(\d{1,3})\s*%?\s*$/);
    if(!mm) return; any=true;
    var n=Math.max(0,Math.min(100,parseInt(mm[2],10)));
    var col=n>=80?'var(--gn)':n>=60?'var(--or)':'var(--rd)';
    bars+='<div class="sysb"><span class="sysb-n">'+mm[1].trim()+'</span><div class="sysb-t"><span style="width:'+n+'%;background:'+col+'"></span></div><span class="sysb-v">'+n+'%</span></div>';
  });
  return any?('<div class="ai-sec sys"><div class="ai-sh">AI Diagnose-overzicht</div><div class="ai-sb"><div class="sysb-wrap">'+bars+'</div></div></div>'):'';
}
function _aiReportHtml(text){
  const secs=[{k:'VOERTUIGGEGEVENS',i:'',c:'blue'},{k:'SYSTEEMSTATUS',i:'',c:'blue'},{k:'FOUTCODES',i:'',c:'orange'},{k:'SENSORANALYSE',i:'',c:'blue'},{k:'WAARSCHIJNLIJKE OORZAAK',i:'',c:'red'},{k:'KOSTENINDICATIE',i:'',c:'purple'},{k:'AANBEVOLEN VERVOLGONDERZOEK',i:'',c:'green'},{k:'SAMENVATTING',i:'📋',c:'blue'},{k:'BEVINDINGEN',i:'🔍',c:'orange'},{k:'PRIORITEIT ACTIES',i:'⚡',c:'red'},{k:'REPARATIE STAPPEN',i:'🔧',c:'orange'},{k:'KAN IK HET ZELF?',i:'🛠️',c:'green'},{k:'KOSTEN SCHATTING',i:'💶',c:'purple'},{k:'GESCHATTE KOSTEN',i:'💶',c:'purple'},{k:'URGENTIE',i:'🚨',c:'red'},{k:'HUIDIGE SITUATIE',i:'📊',c:'blue'},{k:'ONDERHOUDSADVIES',i:'🔧',c:'green'},{k:'MOGELIJKE OORZAAK',i:'🎯',c:'red'},{k:'DATA-OORDEEL',i:'📊',c:'blue'},{k:'ADVIES',i:'💡',c:'green'},{k:'REPRODUCEER',i:'🔁',c:'orange'}];
  const found=[];
  secs.forEach(s=>{if(text.toLowerCase().includes(s.k.toLowerCase()))found.push({...s,idx:text.toLowerCase().indexOf(s.k.toLowerCase())});});
  found.sort((a,b)=>a.idx-b.idx);
  const v=aiVerdict(text);
  // Sectie-keys regex-escapen: 'KAN IK HET ZELF?' bevat een regex-metateken
  // ('?'); zonder escapen matcht dat verkeerd en een key met '(' zou zelfs
  // een exception gooien waardoor het hele rapport niet rendert.
  const _reEsc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let html='<div class="ai-res">';html+=_scoreHeader(text)+_systemBars(text);
  html+=`<div class="ai-verdict" style="background:${v.bg};border:1px solid ${v.clr}55"><b style="color:${v.clr};font-size:14px">${v.vt}</b></div>`;
  found.forEach((s,i)=>{const next=found[i+1];const re=new RegExp(`${_reEsc(s.k)}\\s*([\\s\\S]*?)${next?`(?=${_reEsc(next.k)})`:'$'}`,'i');const m=text.match(re);if(!m)return;const body=m[1].replace(/^\s*:\s*/,'').trim();if(!body)return;html+=`<div class="ai-sec ${s.c}"><div class="ai-sh ${s.c}">${_titleCase(s.k)}</div><div class="ai-sb">${_fmtReportBody(body)}</div></div>`;});
  if(!found.length)html+=`<div class="ai-sec blue"><div class="ai-sh blue">📋 Analyse</div><div class="ai-sb">${_fmtReportBody(text)}</div></div>`;
  html+='</div>';
  return html;
}
// Inline tonen we alleen het verdict + acties; het volledige rapport opent in een sheet.
function renderAIText(text,contentEl){
  text=_withDisclaimer(text);   // garantie: disclaimer op elk getoond/gedeeld/geëxporteerd rapport (fix 15-07: _withDisclaimer werd nergens aangeroepen)
  const fullHtml=_aiReportHtml(text);
  window._lastAIReport={ text, html:fullHtml, ts:new Date() };
  const v=aiVerdict(text);
  contentEl.innerHTML=`<div class="ai-res">
    <div class="ai-verdict" style="background:${v.bg};border:1px solid ${v.clr}55"><span style="font-size:20px;line-height:1">${v.vi}</span><b style="color:${v.clr};font-size:14px">${v.vt}</b></div>
    <div class="ai-acts">
      <button class="ai-act pri" onclick="openAIReportSheet()">📄 Open rapport — bekijk, deel &amp; download</button>
    </div>
  </div>`;
}
function openAIReportSheet(){
  const r=window._lastAIReport; if(!r||!r.html){ showToast?.('Nog geen rapport beschikbaar'); return; }
  try{ resetDataStream(true); }catch(e){ console.warn('Datastroom niet gereset na analyse', e); }   // analyse klaar → datastroom vers
  let ov=document.getElementById('aiReportSheet');
  if(!ov){ ov=document.createElement('div'); ov.id='aiReportSheet'; ov.className='ai-sheet-ov'; document.body.appendChild(ov); }
  ov.innerHTML=`<div class="ai-sheet">
    <div class="ai-sheet-h"><b>🔬 AI-rapport</b><button class="ai-sheet-x" onclick="closeAIReportSheet()">✕</button></div>
    <div class="ai-sheet-b">${r.html}${_aiReplyBox()}</div>
    <div class="ai-sheet-f"><button class="ai-act" onclick="shareAIReport()">↗ Deel</button><button class="ai-act pri" onclick="exportAIReportPDF(this)">⬇ Download PDF</button></div>
  </div>`;
  ov.style.display='flex';
}
function closeAIReportSheet(){ const o=document.getElementById('aiReportSheet'); if(o) o.style.display='none'; }
function _aiReplyBox(){
  return '<div id="aiReplyWrap" style="margin-top:14px;border-top:1px solid var(--bd);padding-top:12px">'+
    '<div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:4px">💬 Reageer op dit rapport</div>'+
    '<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">Geef extra context of een correctie (bijv. \'motor was al op temperatuur\'). De AI herziet het rapport.</div>'+
    '<textarea id="aiReplyTxt" rows="2" style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:12px;padding:8px 10px;resize:vertical" placeholder="Typ je aanvulling of correctie"></textarea>'+
    '<div style="display:flex;gap:6px;margin-top:8px">'+
      '<button type="button" id="aiMdlFast" onclick="setAiReplyModel(\'fast\')" style="flex:1;padding:7px;border-radius:8px;border:1px solid var(--bl);background:rgba(26,111,255,.12);color:var(--bl);font-size:11px;font-weight:800;cursor:pointer">⚡ Snel</button>'+
      '<button type="button" id="aiMdlDeep" onclick="setAiReplyModel(\'deep\')" style="flex:1;padding:7px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx3);font-size:11px;font-weight:800;cursor:pointer">🔬 Diep (grondiger)</button>'+
    '</div>'+
    '<div style="font-size:11px;color:var(--tx3);margin:4px 0 0">Snel = direct antwoord. Diep = grondiger model, iets trager.</div>'+
    '<button id="aiReplyBtn" class="ai-act pri" style="margin-top:8px;width:100%" onclick="aiReplyRevise()">🔄 Herzie rapport</button>'+
  '</div>';
}
window._aiReplyModel='fast';
window._connDetails=false;
function toggleConnDetails(){
  var b=document.getElementById('btDiagBox'), btn=document.getElementById('connDetailsBtn');
  window._connDetails=!window._connDetails;
  if(b) b.style.display=window._connDetails?'block':'none';
  if(btn) btn.textContent=window._connDetails?'📡 Verbindingsdetails verbergen':'📡 Verbindingsdetails tonen';
}
function setAiReplyModel(m){
  window._aiReplyModel=(m==='deep')?'deep':'fast';
  var f=document.getElementById('aiMdlFast'), d=document.getElementById('aiMdlDeep');
  if(f&&d){
    var on='flex:1;padding:7px;border-radius:8px;border:1px solid var(--bl);background:rgba(26,111,255,.12);color:var(--bl);font-size:11px;font-weight:800;cursor:pointer';
    var off='flex:1;padding:7px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx3);font-size:11px;font-weight:800;cursor:pointer';
    f.style.cssText=(window._aiReplyModel==='fast')?on:off;
    d.style.cssText=(window._aiReplyModel==='deep')?on:off;
  }
}
async function aiReplyRevise(){
  var r=window._lastAIReport; if(!r||!r.text){ showToast?.('Geen rapport'); return; }
  var reply=(document.getElementById('aiReplyTxt')||{}).value||'';
  if(!reply.trim()){ showToast?.('Typ eerst je aanvulling'); return; }
  var btn=document.getElementById('aiReplyBtn'); if(btn){ btn.disabled=true; btn.textContent='⏳ Herzien'; }
  var p='Hieronder staat een eerder AI-rapport over een voertuig. De gebruiker geeft aanvullende informatie of een correctie. Herzie het rapport en houd rekening met deze nieuwe input. Behoud dezelfde sectiekoppen en stijl als het origineel; pas alleen de inhoud aan waar de nieuwe info dat rechtvaardigt.\n\nEERDER RAPPORT:\n'+r.text+'\n\nAANVULLING/CORRECTIE VAN GEBRUIKER:\n'+reply+'\n\nGeef het volledige herziene rapport.';
  var body=document.querySelector('#aiReportSheet .ai-sheet-b');
  if(body) body.innerHTML='<div class="ai-ld"><span class="spin"></span> Rapport wordt herzien op basis van je input</div>';
  try{
    // Snel = Haiku 4.5 (vlot/goedkoop), Diep = standaardmodel (Sonnet 5).
    // Fix 15-07: voorheen wezen béide knoppen naar hetzelfde model — de keuze deed niets.
    var _mdl=(window._aiReplyModel==='deep')?null:'claude-haiku-4-5-20251001';
    var txt=await apiFetch(p,1600,null,_mdl);
    txt=_withDisclaimer(txt);
    window._lastAIReport={ text:txt, html:_aiReportHtml(txt), ts:new Date() };
    openAIReportSheet();
    showToast?.('Rapport herzien');
  }catch(e){
    if(body) body.innerHTML='<div class="ai-sec red"><div class="ai-sh red">⚠ Fout</div><div class="ai-sb">'+((e&&e.message)||e)+'</div></div>';
    if(btn){ btn.disabled=false; btn.textContent='🔄 Herzie rapport'; }
  }
}
async function shareAIReport(){
  const r=window._lastAIReport; const txt=r&&r.text?r.text:''; if(!txt){ showToast?.('Nog geen rapport'); return; }
  // Eerst de native route (Capacitor Filesystem+Share) — dezelfde die bij
  // PDF-delen bewezen werkt. Web-API's alleen als fallback (browser).
  try{
    const blob=new Blob([txt],{type:'text/plain'});
    const fname=(typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport.txt';
    const ok=await nativeShareFile(blob,fname);
    if(ok) return;
  }catch(e){ /* stil: val door naar de web-fallback hieronder */ }
  try{
    if(navigator.share){ await navigator.share({title:'PidLane AI-rapport', text:txt}); }
    else if(navigator.clipboard){ await navigator.clipboard.writeText(txt); showToast?.('Rapport naar klembord gekopieerd'); }
    else { showToast?.('Delen niet ondersteund op dit toestel'); }
  }catch(e){ if(!/abort|cancel/i.test(String(e?.name||e?.message||e))) showToast?.('Delen mislukt — probeer 📋 Kopieer'); }
}
// ── PDF RAPPORT EXPORT ──────────────────────────────────────────
async function loadJsPDF(){
  if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=res; s.onerror=()=>rej(new Error('PDF-bibliotheek laden mislukt — internet nodig'));
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

async function exportAIReportPDF(btn){
  if(!featOn('feat_pdf')){ showToast?.('Functie uitgeschakeld door beheerder'); return; }
  if(!window._lastAIReport){ showToast?.('Geen rapport beschikbaar'); return; }
  const orig=btn?btn.textContent:''; if(btn){btn.textContent='⏳ PDF maken...'; btn.disabled=true;}
  try{
    const jsPDF=await loadJsPDF();
    if(!jsPDF) throw new Error('jsPDF niet geladen');
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const W=210, M=15, CW=W-2*M;
    const BLUE=[26,111,255], DARK=[26,32,44], GREY=[113,128,150], LIGHT=[237,242,247];
    let y=0;

    const clean=t=>String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2100}-\u{214F}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,'').replace(/\*\*/g,'').trim();
    const footer=()=>{
      const n=doc.getNumberOfPages();
      for(let i=1;i<=n;i++){
        doc.setPage(i);
        doc.setDrawColor(...LIGHT); doc.line(M,285,W-M,285);
        doc.setFontSize(8); doc.setTextColor(...GREY); doc.setFont('helvetica','normal');
        doc.text(`Gegenereerd door PidLane — ${new Date(window._lastAIReport.ts).toLocaleString('nl-NL')}`,M,290);
        doc.text(`Pagina ${i} van ${n}`,W-M,290,{align:'right'});
      }
    };
    const pageBreak=need=>{ if(y+need>278){ doc.addPage(); y=M+5; } };

    // ── Kopband ──
    doc.setFillColor(...BLUE); doc.rect(0,0,W,30,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(20);
    doc.text('PidLane',M,13);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text('Your car talks. We translate.',M,19);
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('VOERTUIG DIAGNOSERAPPORT',W-M,13,{align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(new Date(window._lastAIReport.ts).toLocaleString('nl-NL'),W-M,19,{align:'right'});
    y=38;

    // ── Voertuiggegevens blok ──
    const kent=localStorage.getItem('pl_kenteken')||'';
    const meta=[
      ['Voertuig',`${vehicleInfo.merk||'Onbekend'} ${vehicleInfo.model||''} ${vehicleInfo.year?'('+vehicleInfo.year+')':''}`.trim()],
      kent?['Kenteken',kent]:null,
      vehicleInfo.vin?['VIN',vehicleInfo.vin]:null,
      selectedNetwork?['Protocol',clean(selectedNetwork.name||selectedNetwork.id||'')]:null,
      ['Sensoren',`${activePIDs.size} actief, ${supportedPIDs.size||discoveredPIDDefs.length} beschikbaar`]
    ].filter(Boolean);
    doc.setFillColor(...LIGHT); doc.roundedRect(M,y,CW,8+meta.length*6,2,2,'F');
    let my=y+7;
    meta.forEach(([k,v])=>{
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...GREY);
      doc.text(k.toUpperCase(),M+5,my);
      doc.setFont('helvetica','normal'); doc.setTextColor(...DARK);
      doc.text(clean(v),M+45,my); my+=6;
    });
    y=my+6;

    // ── Rapportinhoud ──
    const lines=clean(window._lastAIReport.text).split('\n');
    for(let raw of lines){
      const line=raw.trim();
      if(!line){ y+=2; continue; }
      if(/^#{1,3}\s/.test(line)){
        pageBreak(12); y+=4;
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...BLUE);
        doc.text(line.replace(/^#{1,3}\s*/,''),M,y); y+=2;
        doc.setDrawColor(...BLUE); doc.setLineWidth(0.4); doc.line(M,y,M+40,y); y+=5;
      } else if(/^[-•*]\s/.test(line)){
        const txt=doc.splitTextToSize(line.replace(/^[-•*]\s*/,''),CW-8);
        pageBreak(txt.length*5+2);
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...DARK);
        doc.text('•',M+2,y); doc.text(txt,M+8,y); y+=txt.length*5+1;
      } else {
        const txt=doc.splitTextToSize(line,CW);
        pageBreak(txt.length*5+2);
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...DARK);
        doc.text(txt,M,y); y+=txt.length*5+1.5;
      }
    }

    // ── Sensorwaarden bijlage ──
    const snap=[...activePIDs].filter(isReportableSensor).map(pid=>{
      const d=getPidDef(pid); const v=pidVals[pid];
      return [clean(d.name),`${typeof v==='number'?v.toFixed(d.unit==='V'||d.unit==='λ'?2:0):v} ${d.unit||''}`];
    });
    if(snap.length){
      pageBreak(20); y+=5;
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...BLUE);
      doc.text('Sensorwaarden (momentopname)',M,y); y+=2;
      doc.setDrawColor(...BLUE); doc.line(M,y,M+40,y); y+=6;
      doc.setFontSize(9);
      const colW=CW/2;
      snap.forEach((row,i)=>{
        const col=i%2, x=M+col*colW;
        if(col===0) pageBreak(6);
        doc.setFont('helvetica','normal'); doc.setTextColor(...GREY); doc.text(row[0],x,y);
        doc.setFont('helvetica','bold'); doc.setTextColor(...DARK); doc.text(row[1],x+colW-6,y,{align:'right'});
        if(col===1||i===snap.length-1) y+=5.5;
      });
    }

    footer();

    // ── PDF klaar: dialoog met deel/download-knoppen tonen ──
    // (navigator.share vereist een VERSE gebruikersactie — direct delen na
    // het asynchrone genereren wordt door Android stil geweigerd)
    const fname=_niceReportName('pdf');
    window._lastPdf={blob:doc.output('blob'), fname};
    // PDF bewaren in het sessie-rapportarchief zodat hij later opnieuw
    // gedeeld/gedownload kan worden zonder opnieuw te genereren.
    try{ registerSessionReport({type:'pdf', title:fname, text:(window._lastAIReport&&window._lastAIReport.text)||'', blob:window._lastPdf.blob, fname}); }catch(e){ console.warn('PDF niet in het rapportarchief gezet — later opnieuw delen/downloaden zonder opnieuw te genereren lukt dan niet', e); }
    showPdfReadyModal();
  }catch(e){
    log('PDF export fout: '+e.message+' — TXT-fallback','err');
    showToast?.('PDF mislukt — tekstbestand wordt gedownload');
    // TXT-fallback zodat de gebruiker altijd het rapport heeft
    try{
      const r=window._lastAIReport;
      const v=vehicleInfo||{};
      const txt=[
        'PidLane — Voertuig diagnoserapport',
        `Gegenereerd: ${new Date(r.ts).toLocaleString('nl-NL')}`,
        `Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}`.trim(),
        v.vin?`VIN: ${v.vin}`:'',
        '='.repeat(50), '',
        String(r.text).replace(/\*\*/g,'')
      ].filter(Boolean).join('\n');
      download(`PidLane-rapport-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.txt`, txt);
    }catch(_){ log('Ook de TXT-fallback is mislukt — er is geen rapportbestand beschikbaar','err'); }
  }finally{
    if(btn){btn.textContent=orig; btn.disabled=false;}
  }
}

function showPdfReadyModal(){
  let m=document.getElementById('pdfReadyModal');
  if(!m){
    // FIX: z-index MOET in de cssText zelf — cssText overschrijft alle eerder
    // gezette inline styles, dus een losse m.style.zIndex vooraf ging verloren
    // en de modal (9600) verdween achter de AI-rapport-sheet (.ai-sheet-ov, 9900).
    m=document.createElement('div'); m.id='pdfReadyModal';
    m.style.cssText='position:fixed;inset:0;z-index:9950;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:24px';
    m.innerHTML=`<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:300px;width:100%;text-align:center">
      <div style="font-size:34px;margin-bottom:8px">📄</div>
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">PDF-rapport klaar</div>
      <div id="pdfFname" style="font-size:12px;color:var(--tx3);margin-bottom:14px;word-break:break-all"></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="sharePdf()" style="padding:11px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer">💾 Delen / Downloaden</button>
        <button onclick="savePdfToFolder(this)" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer">📁 Opslaan in map</button>
        <button onclick="document.getElementById('pdfReadyModal').style.display='none'" style="padding:9px;border-radius:9px;border:none;background:none;color:var(--tx3);font-family:var(--f);font-size:13px;cursor:pointer">Sluiten</button>
      </div></div>`;
    m.addEventListener('click',e=>{if(e.target===m)m.style.display='none';});
    document.body.appendChild(m);
  }
  document.getElementById('pdfFname').textContent=window._lastPdf?.fname||'';
  // Delen-knop tonen als native plugins óf web file-sharing beschikbaar is
  try{
    const native=!!(window.Capacitor?.Plugins?.Filesystem&&window.Capacitor?.Plugins?.Share);
    const dummy=new File(['x'],'x.pdf',{type:'application/pdf'});
    const canShare=native||!!(navigator.canShare&&navigator.canShare({files:[dummy]}));
    const sb=m.querySelector('button[onclick="sharePdf()"]');
    if(sb) sb.style.display=canShare?'block':'none';
  }catch(_){
    const sb=m.querySelector('button[onclick="sharePdf()"]');
    if(sb) sb.style.display='none';
  }
  m.style.display='flex';
}

// Nette bestandsnaam: PidLane_Mazda-CX5_2026-07-01.pdf i.p.v. UUID.
function _niceReportName(ext){
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)?vehicleInfo:{};
  const parts=[v.merk,v.model].filter(Boolean).join('-').replace(/[^A-Za-z0-9-]/g,'') || 'rapport';
  const d=new Date().toISOString().slice(0,10);
  return `PidLane_${parts}_${d}.${ext}`;
}

// Slaat de PDF rechtstreeks op in Documents/PidLane/ — vindbaar in de
// bestandsbeheerder, zonder deelmenu of e-mail. Valt terug op het deelmenu
// als de Filesystem-plugin ontbreekt of het schrijven faalt.
async function savePdfToFolder(btn){
  if(!window._lastPdf){ showToast?.('Geen rapport beschikbaar'); return; }
  const {blob}=window._lastPdf;
  const fname=_niceReportName('pdf');
  const orig=btn?btn.textContent:''; if(btn){ btn.textContent='⏳ Opslaan...'; btn.disabled=true; }
  const restore=()=>{ if(btn){ btn.textContent=orig; btn.disabled=false; } };
  const FS=window.Capacitor?.Plugins?.Filesystem;
  if(!FS){
    // Geen plugin → gebruik de bestaande (werkende) deel/download-route
    restore();
    const m=document.getElementById('pdfReadyModal'); if(m) m.style.display='none';
    showToast?.('Opslaan-in-map vereist de app — deelmenu geopend');
    return downloadPdf();
  }
  try{
    const b64=await new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(String(r.result).split(',')[1]);
      r.onerror=()=>rej(new Error('Lezen mislukt'));
      r.readAsDataURL(blob);
    });
    // recursive:true maakt de map PidLane aan als die nog niet bestaat
    await FS.writeFile({ path:`PidLane/${fname}`, data:b64, directory:'DOCUMENTS', recursive:true });
    restore();
    const m=document.getElementById('pdfReadyModal'); if(m) m.style.display='none';
    showToast?.(`✅ Opgeslagen in Documenten/PidLane/\n${fname}`);
    try{ log(`Rapport opgeslagen: Documents/PidLane/${fname}`,'ok'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
  }catch(e){
    restore();
    // Val terug op het deelmenu (met "Opslaan in Bestanden") als schrijven faalt
    log('Opslaan in map mislukt ('+(e.message||e)+') — deelmenu als terugval','warn');
    showToast?.('Direct opslaan lukt niet — deelmenu geopend');
    return downloadPdf();
  }
}

async function sharePdf(){
  if(!window._lastPdf) return;
  const {blob,fname}=window._lastPdf;
  // Sluit het venster METEEN — anders blijft de donkere overlay hangen als
  // het Android-deelmenu de promise niet (op tijd) resolvet bij terugkeer.
  const modal=document.getElementById('pdfReadyModal');
  if(modal) modal.style.display='none';
  // Eerst de native route (Capacitor-plugins) — werkt altijd in de app
  if(await nativeShareFile(blob,fname)) return;
  try{
    const file=new File([blob],fname,{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'PidLane rapport'});
      return;
    }
    throw new Error('Delen niet ondersteund');
  }catch(e){
    if(e.name!=='AbortError'){ log('Delen mislukt ('+e.message+') — probeer Downloaden','warn'); showToast?.('Delen lukt niet — probeer 💾 Downloaden'); }
  }
}

async function downloadPdf(){
  if(!window._lastPdf) return;
  const {blob,fname}=window._lastPdf;
  // Sluit het venster METEEN — voorkomt dat de donkere overlay blijft staan
  // wanneer je vanuit "Opslaan in Bestanden" terugkeert naar de app.
  const modal=document.getElementById('pdfReadyModal');
  if(modal) modal.style.display='none';
  // Native route: Android-deelmenu bevat ook "Opslaan in Bestanden/Drive"
  if(await nativeShareFile(blob,fname)) return;
  // In de Android-app zonder plugins werkt een blob-download NOOIT
  // (WebView krijgt de bytes niet) — wees daar eerlijk over.
  if(window.Capacitor?.isNativePlatform?.()){ showNeedsUpdate(); return; }
  try{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    showToast?.('💾 Download gestart');
  }catch(e){
    log('Download mislukt: '+e.message,'err');
  }
}

// ── AI-FALLBACK (degraded mode) ──
// Als de AI niet beschikbaar is (geen sleutel / netwerkfout), tóch een
// bruikbare regelgebaseerde diagnose: foutcodes-lookup, datakwaliteit en
// een duidelijke melding. Output in hetzelfde sectie-formaat zodat het
// verdict + de rapport-sheet gewoon werken.
function buildFallbackReport(err){
  const L=[];
  L.push('SAMENVATTING');
  L.push('⚠️ AI is nu niet beschikbaar ('+((err&&err.message)||'onbekende reden')+'). Hieronder een regelgebaseerde analyse op basis van foutcodes en datakwaliteit. Stel een geldige API-sleutel in (🤖 rechtsboven) voor een volledige AI-uitleg in gewone taal.');
  L.push('');
  L.push('BEVINDINGEN');
  const codes=Array.isArray(dtcCodes)?dtcCodes:[];
  if(codes.length){
    codes.forEach(c=>{
      let info; try{ info=dtcInfo(c); }catch(e){ info={desc:'onbekende code',sev:'med'}; }
      const mark=/high|bad/.test(info.sev)?'🔴':(/warn|med/.test(info.sev)?'🟡':'🟢');
      L.push(`${mark} ${c} — ${info.desc}`);
    });
  } else {
    L.push('🟢 Geen actieve foutcodes opgeslagen.');
  }
  L.push('');
  L.push('HUIDIGE SITUATIE');
  const tot=(typeof supportedPIDs!=='undefined'&&supportedPIDs.size)?supportedPIDs.size:0;
  const act=(typeof activePIDs!=='undefined'&&activePIDs.size)?activePIDs.size:0;
  L.push(`Beschikbare sensoren (PIDs): ${tot} · actief gemonitord: ${act}.`);
  try{ if(window._deadPIDs && window._deadPIDs.size) L.push(`🟡 ${window._deadPIDs.size} PID(s) gaven herhaald geen data — mogelijk niet ondersteund of een sensorprobleem.`); }catch(e){ console.warn('Regel over dode PIDs niet toegevoegd aan het tekstrapport', e); }
  if(typeof vehicleInfo!=='undefined' && (vehicleInfo.merk||vehicleInfo.brandstof)) L.push(`Voertuig: ${[vehicleInfo.merk,vehicleInfo.model,vehicleInfo.year].filter(Boolean).join(' ')||'onbekend'}${vehicleInfo.brandstof?' ('+vehicleInfo.brandstof+')':''}.`);
  L.push('');
  L.push('PRIORITEIT ACTIES');
  if(codes.length) L.push('Laat de gevonden foutcodes door een monteur bevestigen. Voor uitleg per code in gewone taal + reparatieadvies: stel een API-sleutel in en draai de analyse opnieuw.');
  else L.push('Geen directe actie op basis van foutcodes. Voor een volledige AI-analyse: stel een API-sleutel in.');
  return L.join('\n');
}
/* ── 🔍 VERIFICATIE-KNOPPEN (PLVerify) — app-brede focus-hertest ──
   Bij ernstige bevindingen (Direct aandacht in AI-rapport, kritieke DTC,
   twijfel in basic check) verschijnt een knop die alléén de betrokken PIDs
   kort hermeet en de conclusie bevestigt/ontkracht (pidlane-verify.js). */
const PL_SENSOR_PIDS=[
  [/(koelwater|koelvloeistof|coolant)/i,'0105'],
  [/(accuspanning|laadspanning|boordspanning)/i,'0142'],
  [/(trim.*kort|korte.*trim|stft)/i,'0106'],
  [/(trim.*lang|lange.*trim|ltft)/i,'0107'],
  [/(maf|luchtmassa)/i,'0110'],
  [/(toerental|\brpm\b)/i,'010C'],
  [/(motorbelasting|belasting)/i,'0104'],
  [/(inlaatdruk|\bmap\b)/i,'010B'],
  [/inlaatlucht/i,'010F'],
  [/(gasklep|throttle)/i,'0111'],
  [/(lambda|zuurstof|\bo2\b)/i,'0114']
];
function plPidsUitTekst(txt){
  const out=[];
  for(const [rx,pid] of PL_SENSOR_PIDS){ if(rx.test(txt)&&!out.includes(pid)) out.push(pid); }
  return out;
}
// DTC-familie → meest relevante PIDs voor de focusmeting (RPM als referentie).
function dtcVerifyPids(code){
  const c=String(code).toUpperCase();
  if(/^P010[0-4]/.test(c)) return ['0110','010C'];          // MAF-circuit
  if(/^P010[5-9]/.test(c)) return ['010B','010C'];          // MAP-circuit
  if(/^P011[0-4]/.test(c)) return ['010F','010C'];          // inlaatlucht temp
  if(/^P011[5-9]|^P0128|^P0217/.test(c)) return ['0105','010C']; // koelwater/thermostaat
  if(/^P01[3-6]\d/.test(c)) return ['0114','0106','0107'];  // lambdasondes
  if(/^P017\d/.test(c)) return ['0106','0107','0105'];      // mengsel te arm/rijk
  if(/^P02/.test(c)) return ['0106','0107','010C'];         // injectie
  if(/^P030/.test(c)) return ['010C','0104','0105'];        // overslaan
  if(/^P040/.test(c)) return ['010B','0106','0107'];        // EGR/emissie
  if(/^P050\d/.test(c)) return ['010D','010C','0111'];      // snelheid/stationairregeling
  if(/^P056\d|^P06/.test(c)) return ['0142','010C'];        // spanning/ECU
  return ['010C','0104','0105'];                            // generiek motorbeeld
}
// Gedeelde knop-runner: meet, toon uitkomst in de knop + één regel toelichting.
async function plRunVerify(btn, opts){
  if(!window.PLVerify){ showToast?.('Verificatiemodule niet geladen'); return; }
  if(!connected||demoMode){ showToast?.('Verbind eerst met de auto voor een focusmeting'); return; }
  const oud=btn.textContent; btn.disabled=true; btn.textContent='🔍 meet… (±12s)';
  try{
    const res=await window.PLVerify.start(opts);
    if(!res){ btn.textContent=oud; btn.disabled=false; return; }
    btn.textContent=(res.status==='bevestigd'?'❗ Bevestigd':res.status==='meetprobleem'?'⚠️ Meetprobleem':'✅ Niet gereproduceerd');
    const d=document.createElement('div');
    d.style.cssText='font-size:12px;opacity:.78;margin-top:4px;line-height:1.4';
    d.textContent=res.tekst;
    btn.insertAdjacentElement('afterend', d);
  }catch(e){ btn.textContent=oud; btn.disabled=false; }
}
function plVerifyBscRow(id,pid,btn){ plRunVerify(btn,{sig:'TEST:'+id, titel:'Basic check '+id, pids:[pid,'010C']}); }
// Scan een gerenderd AI-rapport op "Direct aandacht"-regels en hang er knoppen onder.
function plVerifyAugment(el){
  try{
    if(!window.PLVerify||!el||!connected||demoMode) return;
    if(el.querySelector('.pl-verify-blok')) return;         // niet dubbel
    const punten=[]; const gezien=new Set();
    el.querySelectorAll('tr').forEach(tr=>{
      const txt=tr.textContent||'';
      if(!/direct aandacht/i.test(txt)) return;
      const pids=plPidsUitTekst(txt);
      if(!pids.length) return;
      const naam=(tr.querySelector('td')?.textContent||pids[0]).trim().slice(0,40);
      const key=pids.join(',');
      if(gezien.has(key)) return; gezien.add(key);
      punten.push({naam, pids});
    });
    if(!punten.length) return;
    const blok=document.createElement('div');
    blok.className='ai-sec pl-verify-blok';
    blok.innerHTML=`<div class="ai-sh orange">🔍 Verifiëren</div>
      <div class="ai-sb">Deze punten kregen "Direct aandacht". Een focusmeting (±12s, alleen deze sensoren) bevestigt of de meting klopt.</div>`;
    for(const p of punten){
      const b=document.createElement('button');
      b.className='btn'; b.style.cssText='margin:6px 6px 0 0;padding:7px 12px;font-size:13px';
      b.textContent='🔍 '+p.naam;
      b.onclick=()=>plRunVerify(b,{sig:'RAPPORT:'+p.pids[0], titel:p.naam, pids:[...p.pids,'010C']});
      blok.appendChild(b);
    }
    el.appendChild(blok);
  }catch(e){ console.warn('Verifiëer-knoppen niet toegevoegd aan het rapport', e); }
}

async function callAI(prompt,contentEl){
  contentEl.innerHTML='<div class="ai-ld"><div class="spin"></div> AI analyseert...</div>';
  try{
    if(!dataStable&&connected&&!demoMode&&activePIDs.size>0){
      contentEl.innerHTML=`<div class="ai-sec"><div class="ai-sh orange">⏳ Data stabiliseert</div><div class="ai-sb">Even geduld — app valideert sensorwaarden voor betrouwbare analyse.</div></div>`;
      return;
    }
    const text=await apiFetch(prompt);
    renderAIText(text,contentEl);   // toont verdict + View/Share/Download
    try{ plVerifyAugment(contentEl); }catch(e){ console.warn('Verifiëer-knoppen niet toegevoegd aan het AI-rapport', e); }   // 🔍 knoppen bij Direct aandacht
    log('AI analyse klaar','ok');
  }catch(e){
    // Degraded mode: AI niet beschikbaar → regelgebaseerde fallback i.p.v. kale fout
    try{
      renderAIText(buildFallbackReport(e),contentEl);
      try{ plVerifyAugment(contentEl); }catch(e2){ console.warn('Verifiëer-knoppen niet toegevoegd aan de fallback-analyse', e2); }
      log('AI niet beschikbaar — regelgebaseerde fallback getoond ('+e.message+')','warn');
      return;
    }catch(_){ /* stil: valt door naar de kale foutmelding hieronder */ }
    contentEl.innerHTML=`<div class="ai-sec"><div class="ai-sh red">⚠ Fout</div><div class="ai-sb">${e.message}</div></div>`;
    log('AI fout: '+e.message,'err');
  }
}
/* ══ MEETFASE-POORT (27-07-2026) ══════════════════════════════════════
   Meerdere analyses sprongen direct naar het AI-rapport. Ze namen daarbij
   één momentopname van pidVals mee — de waarden van dat ene moment. Voor de
   AI ziet dat er compleet uit, maar er zit geen tijd in: geen opwarming,
   geen belasting, geen variatie. Een trim die wegloopt onder belasting of
   een thermostaat die niet opent is in één momentopname per definitie
   onzichtbaar, en het rapport klinkt vervolgens even stellig als een
   rapport dat wél op tien minuten meetdata rust.

   Deze poort staat vóór elke analyse en kijkt naar drie dingen:
     dekking  — van hoeveel sensoren hebben we genoeg monsters?
     tijdsduur— over hoeveel seconden lopen die monsters?
     rijtijd  — hoeveel daarvan is gereden in plaats van stationair?
   Is dat te mager, dan vraagt hij eerst om data in plaats van door te gaan.
   Doorgaan mag altijd, maar dan bewust en met de beperking in het rapport.

   De rij-eis is er bij gekomen omdat de poort anders alleen HOEVEELHEID mat.
   Elf minuten stationair haalde daarmee moeiteloos het zwaarste niveau, dus
   een rapport dat om belasting vroeg draaide alsnog op stilstand — precies
   het geval van 01-08-2026. `rij` is het aantal seconden meetdata mét
   beweging; 0 betekent dat stilstaand meten volstaat. */
const MEET_EIS = {
  snel:   {sec:20,  n:6,  dekking:0.5, rij:0,  naam:'stilstaande momentopname'},
  normaal:{sec:60,  n:15, dekking:0.6, rij:0,  naam:'stilstaande meting'},
  kortrit:{sec:90,  n:25, dekking:0.6, rij:30, naam:'korte rit'},
  rit:    {sec:180, n:40, dekking:0.6, rij:90, naam:'meting onder belasting'}
};
// Snelheid waarboven een monster als "rijdend" telt. Onder deze waarde zit
// stapvoets manoeuvreren en meetruis van de snelheidssensor.
const MEET_RIJ_KMH = 15;
// Gat tussen twee snelheidsmonsters dat nog als aaneengesloten rijtijd telt.
// Groter gat = de app lag stil (achtergrondtab, verbinding weg); dat mag niet
// als gereden tijd meetellen.
const MEET_RIJ_GAT_MS = 5000;
function plMeetStatus(){
  let sensoren=0, genoeg=0, oudste=null, nieuwste=null, maxN=0;
  try{
    [...activePIDs].filter(isReportableSensor).forEach(pid=>{
      const h=(typeof pidHist!=='undefined'&&pidHist[pid])||[];
      sensoren++;
      if(h.length>maxN) maxN=h.length;
      if(h.length>=3) genoeg++;
      if(h.length){
        const t0=h[0].t, t1=h[h.length-1].t;
        if(oudste===null||t0<oudste) oudste=t0;
        if(nieuwste===null||t1>nieuwste) nieuwste=t1;
      }
    });
  }catch(e){ console.warn('Dekking niet volledig berekend voor de meetfase-poort — de poort kan hierdoor onterecht \'te weinig data\' concluderen', e); }
  const sec = (oudste&&nieuwste) ? Math.round((nieuwste-oudste)/1000) : 0;
  return {sensoren, genoeg, sec, maxN, dekking: sensoren? genoeg/sensoren : 0,
          rijSec: plMeetRijSec()};
}
/* Hoeveel seconden meetdata zijn er MET beweging? Loopt de snelheids-
   geschiedenis langs en telt alleen aaneengesloten stukken boven de drempel.
   Geeft null terug als er geen snelheidsgeschiedenis is: geen bewijs is geen
   oordeel, en dan mag de rij-eis niet blokkeren op een voertuig dat 010D
   simpelweg niet levert. */
function plMeetRijSec(){
  try{
    const h=(typeof pidHist!=='undefined'&&pidHist['010D'])||null;
    if(!Array.isArray(h)||!h.length) return null;
    let ms=0;
    for(let i=1;i<h.length;i++){
      const gat=h[i].t-h[i-1].t;
      if(gat<=0||gat>MEET_RIJ_GAT_MS) continue;
      if(h[i].v>=MEET_RIJ_KMH && h[i-1].v>=MEET_RIJ_KMH) ms+=gat;
    }
    return Math.round(ms/1000);
  }catch(e){ return null; }
}
/* Welk niveau geldt er écht? De aanroeper noemt een ondergrens, maar als de
   wizard een rit in het plan heeft gezet, wint die. Voorheen stond in elke
   aanroep een vaste letterlijke ('normaal'), waardoor een plan met "Rit onder
   belasting, ±10 min" alsnog op stilstaande data werd afgerekend. Alleen
   OPHOGEN: een aanroeper die zwaarder vraagt dan het plan houdt zijn eis. */
function plMeetNiveau(gevraagd){
  const rang={snel:0, normaal:1, kortrit:2, rit:3};
  let niveau = MEET_EIS[gevraagd] ? gevraagd : 'normaal';
  try{
    const m=(window._wizJob||{}).meting;
    const uitPlan = (m==='rit10') ? 'rit' : ((m==='rit2') ? 'kortrit' : null);
    if(uitPlan && rang[uitPlan]>rang[niveau]) niveau=uitPlan;
  }catch(e){ console.warn('Wizardplan-niveau niet uitgelezen, meeteis blijft op het gevraagde niveau', e); }
  return niveau;
}
function plMeetTekort(niveau){
  const eis = MEET_EIS[niveau] || MEET_EIS.normaal;
  const st  = plMeetStatus();
  const tekort=[];
  if(st.sec < eis.sec)          tekort.push('gemeten over '+st.sec+' s, nodig '+eis.sec+' s');
  if(st.maxN < eis.n)           tekort.push('hoogstens '+st.maxN+' monsters per sensor, nodig '+eis.n);
  if(st.dekking < eis.dekking)  tekort.push('slechts '+Math.round(st.dekking*100)+'% van de sensoren heeft data, nodig '+Math.round(eis.dekking*100)+'%');
  // rijSec===null: dit voertuig levert geen snelheid, dus geen oordeel.
  const rijTekort = !!(eis.rij && st.rijSec!==null && st.rijSec<eis.rij);
  if(rijTekort) tekort.push('maar '+st.rijSec+' s gereden boven '+MEET_RIJ_KMH+' km/h, nodig '+eis.rij+' s onder belasting');
  return {ok:!tekort.length, tekort, st, eis, rijTekort};
}
/* ── DE DRIE-FASENPOORT ────────────────────────────────────────────────
   Besluit van 02-08-2026. De poort vroeg tot nu toe om GENOEG data, niet om
   de JUISTE data. Twee gaten, allebei zichtbaar in de log van die ochtend:

     08:31:16  Analyse: 12 sensoren aangezet
     08:31:20  apiFetch                        <- vier seconden later

   ensurePIDListActive() wacht hooguit 5 s en dan alleen op PIDs die sneller
   dan 1000 ms pollen. Van de 30 sensoren vielen er 8 binnen die grens; de 13
   op 3318 ms kregen hooguit één monster, de 9 op 33-199 s nul. En plMeetStatus
   rekent met maxN, het MAXIMUM aantal monsters over alle sensoren, dus één PID
   die al tien minuten meeloopt haalt de eis in zijn eentje.

   Nu in drie fasen: aanzetten en testen -> registreren -> pas dan analyseren.

   DE EIS HANGT AF VAN DE AARD VAN DE SENSOR. Zou elke kern-PID drie monsters
   moeten hebben, dan kost dat op de CX-5 300 s en voor profiel 'brandstof'
   zelfs 600 s — onwerkbaar, en zinloos: drie metingen brandstofpeil zeggen
   niets meer dan één. Dynamische sensoren hebben een REEKS nodig, trage
   signalen genoeg aan één geldige waarde. Die traag-lijst bestaat al als
   FILTERED_PIDS in pidlane-datalog.js; die hergebruiken we in plaats van een
   tweede kopie aan te leggen. Zo wordt de traagste DYNAMISCHE kern-PID
   maatgevend: 10 x 3318 ms is ongeveer 33 s.                              */
const KERN_REEKS_MIN    = 10;      // monsters voor een dynamische sensor
const KERN_MAX_WACHT_MS = 45000;   // standaard registratievenster
const KERN_VERLENG_MS   = 30000;   // wat de verlengknop erbij geeft
const KERN_MIN_PCT      = 0.6;     // onder deze kern-dekking: geen diagnose

/* De ENIGE plek die beoordeelt hoe de kernsensoren ervoor staan. Zowel de
   registratiefase, de blokkade als het promptblok lezen hieruit — één vraag,
   één antwoord. */
function plKernStatus(profile){
  try{
    const prof = profile || window._laatstProfiel;
    if(!prof) return null;
    // Beide lijsten staan in pidlane-data.js als window.X, maar een classic
    // script ziet ze ook kaal. Allebei proberen: valt de laadvolgorde ooit
    // anders uit, dan mist de kernlijst stil de helft — en dan meldt dit blok
    // "alles gemeten" terwijl de basis er niet eens in zat.
    const basis=(typeof BASIS_PIDS!=='undefined'&&BASIS_PIDS)||window.BASIS_PIDS||[];
    const tabel=(typeof ANALYSE_PIDS!=='undefined'&&ANALYSE_PIDS)||window.ANALYSE_PIDS||{};
    if(!tabel[prof]) return null;
    const kern=[...new Set([...basis, ...(tabel[prof]||[])])];
    if(!kern.length) return null;
    const traagSet=(typeof FILTERED_PIDS!=='undefined')?FILTERED_PIDS:new Set();
    const demo=(typeof demoMode!=='undefined'&&demoMode);
    const heeftDiscovery=(typeof supportedPIDs!=='undefined'&&supportedPIDs&&supportedPIDs.size>0);

    const items=kern.map(pid=>{
      const traag=traagSet.has(pid.slice(2).toUpperCase());
      const n=((typeof pidHist!=='undefined'&&pidHist[pid])||[]).length;
      // Zonder discovery weten we niet wat de auto kan; dan niets uitsluiten.
      const ondersteund = demo || !heeftDiscovery || supportedPIDs.has(pid);
      const geweerd = (typeof pidGate==='function') ? !pidGate(pid,'kiesbaar') : false;
      return { pid, naam:((typeof getPidDef==='function'&&getPidDef(pid)?.name)||pid),
               traag, quota: traag?1:KERN_REEKS_MIN, n,
               haalbaar: ondersteund && !geweerd, gereed: n>=(traag?1:KERN_REEKS_MIN) };
    });

    const haalbaar=items.filter(i=>i.haalbaar);
    const gereed  =items.filter(i=>i.gereed);
    // "stil" = de auto zou het moeten kunnen, maar er komt niets. Dat is een
    // bevinding, geen ruis — nu verdween het stilzwijgend uit de prompt.
    const stil    =haalbaar.filter(i=>i.n===0);
    const mager   =haalbaar.filter(i=>i.n>0 && !i.gereed);
    const nvt     =items.filter(i=>!i.haalbaar);
    return { prof, kern, items, haalbaar, gereed, mager, stil, nvt,
             totaal:kern.length,
             // Registratie mikt op wat haalbaar is; de blokkade kijkt naar de
             // hele kernset, want een ontbrekende sensor maakt de analyse net
             // zo goed onbruikbaar als een ongemeten sensor.
             pctHaalbaar: haalbaar.length ? gereed.length/haalbaar.length : 1,
             pctKern: gereed.length/kern.length,
             compleet: haalbaar.every(i=>i.gereed) };
  }catch(e){ return null; }
}

/* Het promptblok leest dezelfde status, zodat rapport en poort nooit een
   ander verhaal vertellen. */
function plKernDekking(profile){
  const k=plKernStatus(profile);
  if(!k) return null;
  const toon=i=>i.naam+' ('+i.n+')';
  return { prof:k.prof, totaal:k.totaal,
           goed:k.gereed.map(toon), mager:k.mager.map(toon),
           stil:[...k.stil, ...k.nvt].map(i=>i.naam) };
}

/* FASE 2 — registreren. Draait op de bestaande geschiedenis: is die al
   toereikend, dan is dit meteen klaar en wacht niemand voor niets. */
function plRegistreer(profiel, watVoor){
  return new Promise(resolve=>{
    let k=plKernStatus(profiel);
    if(!k || k.compleet){ resolve(true); return; }

    let ov=document.getElementById('meetGateOv');
    if(!ov){
      ov=document.createElement('div'); ov.id='meetGateOv'; ov.className='mg-ov';
      document.body.appendChild(ov);
    }
    ov.style.display='flex';

    let eind=Date.now()+KERN_MAX_WACHT_MS, weg=0, tik=null, klaar=false;
    const sluit=(uitkomst)=>{
      if(klaar) return; klaar=true;
      if(tik) clearInterval(tik);
      document.removeEventListener('visibilitychange', zicht);
      ov.style.display='none'; ov.innerHTML='';
      resolve(uitkomst);
    };
    // Zelfde les als de ritanalyse (§16): een tab op de achtergrond levert
    // geen data, dus die tijd mag niet van het venster af.
    const zicht=()=>{
      if(document.visibilityState==='hidden'){ weg=Date.now(); }
      else if(weg){ eind+=Date.now()-weg; weg=0; }
    };
    document.addEventListener('visibilitychange', zicht);

    const teken=()=>{
      k=plKernStatus(profiel);
      if(!k){ sluit(true); return; }
      const over=Math.max(0,Math.round((eind-Date.now())/1000));
      const wacht=[...k.mager,...k.stil]
        .sort((a,b)=>(a.n/a.quota)-(b.n/b.quota)).slice(0,6);
      ov.innerHTML=
        '<div class="mg-kaart">'+
          '<div class="mg-t">📡 Sensoren registreren</div>'+
          '<div class="mg-s">Voor '+(watFor(watVoor))+' meet ik eerst de sensoren die deze analyse nodig heeft. '+
            '<b>'+k.gereed.length+' van '+k.haalbaar.length+'</b> zijn klaar'+
            (over?' — nog '+over+' s':'')+'.</div>'+
          '<ul class="mg-lijst">'+
            wacht.map(i=>'<li>'+i.naam+' — '+i.n+'/'+i.quota+(i.n?'':' (nog geen data)')+'</li>').join('')+
            (k.nvt.length?'<li>'+k.nvt.length+' sensor(en) heeft deze auto niet</li>':'')+
          '</ul>'+
          '<div class="mg-knoppen">'+
            (over?'':'<button class="mg-sec" id="kdVerleng">⏳ Nog '+Math.round(KERN_VERLENG_MS/1000)+' s meten</button>')+
            '<button class="mg-ter" id="kdNu">Nu analyseren met wat er is</button>'+
          '</div>'+
        '</div>';
      const v=document.getElementById('kdVerleng');
      if(v) v.onclick=()=>{ eind=Date.now()+KERN_VERLENG_MS; teken(); };
      const nu=document.getElementById('kdNu');
      if(nu) nu.onclick=()=>{ window._meetBeperkt='registratie afgebroken'; sluit(true); };

      if(k.compleet){ sluit(true); return; }
      // Verbinding weg tijdens registreren: doorwachten heeft geen zin, er
      // komt niets meer binnen.
      if(typeof connected!=='undefined' && !connected && !(typeof demoMode!=='undefined'&&demoMode)){
        try{ log('Verbinding weg tijdens registreren — analyse gaat door met wat er is.','warn'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
        window._meetBeperkt='verbinding verbroken tijdens registreren';
        sluit(true);
      }
    };
    teken();
    tik=setInterval(teken,500);
  });
}

/* Blokkade onder KERN_MIN_PCT. Geen harde stop: de gebruiker mag door, maar
   dan bewust en met de beperking in het rapport. */
function plKernTeMager(k, watVoor){
  return new Promise(resolve=>{
    let ov=document.getElementById('meetGateOv');
    if(!ov){
      ov=document.createElement('div'); ov.id='meetGateOv'; ov.className='mg-ov';
      document.body.appendChild(ov);
    }
    ov.style.display='flex';
    const sluit=(u)=>{ ov.style.display='none'; ov.innerHTML=''; resolve(u); };
    ov.innerHTML=
      '<div class="mg-kaart">'+
        '<div class="mg-t">🔌 Te weinig kernsensoren</div>'+
        '<div class="mg-s">Voor '+(watFor(watVoor))+' zijn '+k.totaal+' sensoren nodig; '+
          'daarvan zijn er '+k.gereed.length+' bruikbaar gemeten ('+Math.round(k.pctKern*100)+'%). '+
          'Een rapport hierop is een gok, geen diagnose.</div>'+
        '<ul class="mg-lijst">'+
          (k.stil.length?'<li>Geen data ondanks aanvraag: '+k.stil.map(i=>i.naam).join(', ')+'</li>':'')+
          (k.nvt.length?'<li>Niet aanwezig op dit voertuig: '+k.nvt.map(i=>i.naam).join(', ')+'</li>':'')+
          (k.mager.length?'<li>Te weinig monsters: '+k.mager.map(i=>i.naam+' ('+i.n+')').join(', ')+'</li>':'')+
        '</ul>'+
        '<div class="mg-knoppen">'+
          '<button class="mg-pri" id="kmStop">Afbreken</button>'+
          '<button class="mg-ter" id="kmToch">Toch doorgaan — als indicatie</button>'+
        '</div>'+
      '</div>';
    document.getElementById('kmStop').onclick=()=>sluit(false);
    document.getElementById('kmToch').onclick=()=>{
      window._meetBeperkt='slechts '+Math.round(k.pctKern*100)+'% van de kernsensoren gemeten';
      sluit(true);
    };
  });
}

/* De poort zelf: eerst de juiste sensoren aan en testen, dan registreren, dan
   pas de hoeveelheid/rijtijd-eis uit §16. Zonder profiel (bijvoorbeeld een
   wizardmodule die er geen heeft) blijft het gedrag exact als voorheen. */
async function plVraagMeting(niveau, watVoor, profiel){
  // profiel === false betekent expliciet "deze aanroep heeft geen kern-set".
  // Onderscheid dat van "niet meegegeven", want dan mag de laatst gebruikte
  // set nog dienen; terugvallen op een vórig profiel zou anders de verkeerde
  // sensoren afdwingen.
  const prof = (profiel===false) ? null : (profiel || window._laatstProfiel);
  // FASE 1 — aanzetten en testen
  if(prof && typeof ensurePIDsActive==='function'){
    // 23-08: dit is FASE 1 van de meetpoort — de juiste sensoren aanzetten
    // vóórdat er gemeten wordt. Faalde dit stil, dan toetste de poort op de
    // verkeerde set en concludeerde 'te weinig data' zonder reden. De poort
    // krijgt nu te horen dat de set onbetrouwbaar is, zodat hij de gebruiker
    // niet ten onrechte een rijtest laat doen.
    try{ await ensurePIDsActive(prof); }
    catch(e){
      console.warn('Kernprofiel niet geactiveerd vóór de meting — de poort kan hierdoor op de verkeerde sensorset toetsen', e);
      log('Sensoren voor de meting niet aangezet ('+(e.message||e)+') — de meetcontrole hieronder kan onterecht \'te weinig data\' zeggen','warn');
    }
  }
  const k0=plKernStatus(prof);
  if(k0){
    // FASE 2 — registreren (slaat zichzelf over als de historie al volstaat)
    if(!k0.compleet){
      if(!(await plRegistreer(prof, watVoor))) return false;
    }
    const k1=plKernStatus(prof);
    if(k1 && k1.pctKern < KERN_MIN_PCT){
      if(!(await plKernTeMager(k1, watVoor))) return false;
    }
  }
  // FASE 3 — de bestaande hoeveelheid- en rijtijd-poort
  return plMeetPoortVraag(niveau, watVoor);
}

/* Toont het meetscherm en geeft een belofte terug: true = doorgaan. */
function plMeetPoortVraag(niveau, watVoor){
  return new Promise(resolve=>{
    const r=plMeetTekort(plMeetNiveau(niveau));
    // Poort schoon gehaald? Dan geldt een eerdere "toch doorgaan" niet meer.
    // Bleef die staan, dan bleef elk volgend rapport zijn eigen data
    // diskwalificeren met een beperking die al lang was ingelopen.
    if(r.ok){ try{ delete window._meetBeperkt; }catch(e){ console.warn('Oude meetbeperking niet opgeruimd — een volgend rapport kan zichzelf onterecht blijven beperken', e); } resolve(true); return; }
    let ov=document.getElementById('meetGateOv');
    if(!ov){
      ov=document.createElement('div'); ov.id='meetGateOv'; ov.className='mg-ov';
      document.body.appendChild(ov);
    }
    const kanRijden = (typeof openRitAnalyse==='function');
    // Welke rit hoort bij dit niveau? Bij 'kortrit' is tien minuten rijden
    // meer dan gevraagd; bij 'rit' is twee minuten te weinig.
    const ritModus = (r.eis===MEET_EIS.kortrit) ? '2min' : '10min';
    const ritLabel = (ritModus==='2min') ? '🚗 Korte rijtest starten (2 min)'
                                         : '🚗 Rijtest starten (10 min)';
    // Stilstaand wachten helpt alleen als het tekort óók stilstaand in te
    // lopen is. Ontbreekt er rijtijd, dan is die knop een doodlopende weg:
    // je wacht 180 s uit en de eis staat er daarna nog steeds.
    const kanWachten = !r.rijTekort;
    ov.innerHTML =
      '<div class="mg-kaart">'+
        '<div class="mg-t">⏱️ Nog te weinig meetdata</div>'+
        '<div class="mg-s">Voor '+(watFor(watVoor))+' heb ik '+r.eis.naam+' nodig. '+
          (r.rijTekort ? 'Wat ik nu heb is stilstaand gemeten, en daarin is belasting per definitie onzichtbaar.'
                       : 'Nu heb ik alleen een momentopname, en daar kan ik geen betrouwbaar oordeel op bouwen.')+
        '</div>'+
        '<ul class="mg-lijst">'+r.tekort.map(t=>'<li>'+t+'</li>').join('')+'</ul>'+
        '<div class="mg-knoppen">'+
          (kanRijden?'<button class="mg-pri" id="mgRit">'+ritLabel+'</button>':'')+
          (kanWachten?'<button class="mg-sec" id="mgWacht">⏳ Stilstaand meten ('+r.eis.sec+' s)</button>':'')+
          '<button class="mg-ter" id="mgToch">Toch doorgaan met wat er is</button>'+
        '</div>'+
      '</div>';
    ov.style.display='flex';
    const sluit=()=>{ ov.style.display='none'; };
    const rit=document.getElementById('mgRit');
    if(rit) rit.onclick=()=>{ sluit(); resolve(false); try{ openRitAnalyse(ritModus); }catch(e){ log('Rijtest niet gestart: '+(e.message||e),'err'); } };
    const wacht=document.getElementById('mgWacht');
    if(wacht) wacht.onclick=()=>{
      const eind=Date.now()+r.eis.sec*1000;
      const knop=document.getElementById('mgWacht');
      knop.disabled=true;
      const tik=setInterval(()=>{
        const over=Math.max(0,Math.round((eind-Date.now())/1000));
        knop.textContent='⏳ Meten… nog '+over+' s';
        if(over<=0){ clearInterval(tik); sluit(); resolve(true); }
      },250);
    };
    document.getElementById('mgToch').onclick=()=>{
      window._meetBeperkt = r.tekort.join('; ');   // gaat mee in de prompt
      sluit(); resolve(true);
    };
  });
}
function watFor(w){ return w||'deze analyse'; }
/* Regel voor in de AI-prompt, zodat het rapport zelf zijn beperking noemt. */
function plMeetPromptBlok(){
  const st=plMeetStatus();
  let s='\n\nMeetdekking: '+st.sec+' s gemeten, tot '+st.maxN+' monsters per sensor, '+
        Math.round(st.dekking*100)+'% van de sensoren met data.';
  // Zonder dit kan het rapport niet weten dat het over stilstand gaat, en
  // schrijft het net zo stellig over gedrag onder belasting.
  if(st.rijSec===null)     s+='\nDit voertuig levert geen snelheid; of er gereden is, is niet vast te stellen.';
  else if(st.rijSec<10)    s+='\nAlles is STILSTAAND gemeten (geen rijdata). Doe geen uitspraken over gedrag onder belasting, koppeling, overbrenging of verbruik onderweg.';
  else                     s+='\nWaarvan '+st.rijSec+' s rijdend gemeten (boven 15 km/h).';
  // Opgeruimde sensoren (besluit 23-08-2026). Zonder deze regel leest het
  // rapport een verkorte sensorlijst als "deze auto heeft dat niet", terwijl
  // de app hem zelf uit de ronde heeft gehaald. Dat is een ander verhaal en
  // de lezer hoort het verschil te kennen.
  try{
    const op=(typeof pidOpgeruimdLijst==='function')?pidOpgeruimdLijst():[];
    if(op.length) s+='\n\nTIJDENS DEZE SESSIE OPGERUIMD ('+op.length+'): '+
      op.map(o=>o.naam+' ('+o.pid+')').join(', ')+
      '. Deze sensoren stonden in de selectie maar bleven na herhaalde pogingen '+
      'zonder antwoord en zijn daarom uit de meetronde gehaald. Behandel ze NIET '+
      'als afwezig op dit voertuig en niet als defect onderdeel — er is alleen '+
      'geen meting. Noem ze in je conclusie als niet-gemeten.';
  }catch(e){ console.warn('plMeetPromptBlok: opgeruimde sensoren niet opgehaald — '+(e.message||e)); }
  const k=plKernDekking();
  if(k){
    s+='\n\nKernsensoren voor analyse "'+k.prof+'" ('+k.totaal+' stuks): '+
       k.goed.length+' voldoende gemeten.';
    if(k.mager.length) s+='\nTe weinig monsters (naam + aantal): '+k.mager.join(', ')+
       '. Gebruik deze hooguit als momentopname, niet voor uitspraken over verloop.';
    if(k.stil.length)  s+='\nGEVRAAGD MAAR NIETS GELEVERD: '+k.stil.join(', ')+
       '. Deze auto gaf hierop geen data. Noem dit in je conclusie en doe geen '+
       'uitspraken over de systemen die deze sensoren afdekken — ook niet impliciet.';
    if(k.goed.length < Math.ceil(k.totaal*0.6))
      s+='\nLET OP: minder dan 60% van de kernsensoren is bruikbaar gemeten. '+
         'Dit rapport is een indicatie, geen diagnose.';
  }
  if(window._meetBeperkt){
    s+='\nLET OP: de gebruiker is doorgegaan met beperkte data ('+window._meetBeperkt+'). '+
       'Noem dit expliciet in je conclusie en matig je stelligheid navenant.';
  }
  return s;
}

async function runQuickAI(){
  if(!(await plVraagMeting('normaal','een AI-rapport','basis'))) return;
  activateAIPane();
  await ensurePIDsActive('basis');
  const v=getVehicle();
  const liveLines=[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!==undefined?`• ${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean);
  const corr=correlationLines();
  const corrBlock=corr.length?`\nAutomatische bevindingen (correlatie-engine):\n${corr.join('\n')}`:'';
  const qBlok=_qualityBlokFor([...activePIDs].filter(isReportableSensor)); // zelfde gate als Totaalcheck
  const prompt=`${plMeetPromptBlok()}\nAnalyseer dit voertuig in het Nederlands als expert automonteur.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.motor||''}\nSensordata:\n${liveLines.join('\n')||'(geen)'}\nDTC: ${formatDtcCodes(dtcCodes)}${corrBlock}${qBlok}\n\nGeef: Structureer je antwoord EXACT in onderstaande volgorde. Gebruik nergens sterretjes, emoji of woorden in hoofdletters in de lopende tekst; zet elke sectienaam op een eigen regel.

Voertuigscore: <0-100>/100
Diagnosebetrouwbaarheid: <0-100>%
Actieve storingen: <aantal>
Aandachtspunten: <aantal>

Systeemgezondheid:
Motor: <0-100>
Brandstofsysteem: <0-100>
Ontsteking: <0-100>
Emissies: <0-100>
Koeling: <0-100>
Elektrisch systeem: <0-100>
Transmissie: <0-100>

VOERTUIGGEGEVENS
Merk, model, bouwjaar, brandstof en motor — kort.

SYSTEEMSTATUS
Een of twee regels over de algehele staat op dit moment.

FOUTCODES
De actieve DTC-codes met korte uitleg, of: Geen actieve foutcodes.

SENSORANALYSE
Een tabel met exact deze kolommen: Sensor | Waarde | Referentie | Status. Status is precies een van: Normaal, Controle aanbevolen, Direct aandacht. Neem alleen sensoren op waarvoor meetdata beschikbaar is.

BEVINDINGEN
Korte, feitelijke punten; koppel elk punt aan een gemeten waarde.

WAARSCHIJNLIJKE OORZAAK
Een tabel met kolommen: Diagnose | Kans | Vertrouwen. Kans is Hoog, Gemiddeld of Laag; Vertrouwen is een percentage. Daarna een korte alinea van maximaal vier zinnen met de meest waarschijnlijke oorzaak en of er aanwijzingen voor ernstige schade zijn.

KOSTENINDICATIE
Een tabel met kolommen: Handeling | Kans | Indicatie. Indicatie is een prijsbereik in euro.

AANBEVOLEN VERVOLGONDERZOEK
Een korte lijst met concrete meet- of controlestappen om de diagnose te bevestigen.`;
  const btn=document.getElementById('aiBtn'); btn.disabled=true;
  await callAI(prompt,document.getElementById('aiContent'));
  btn.disabled=false;
}
