// ══════════════════════════════════════════════════════════════════
// pidlane-pids.js
// PID-paneel, gauges, breedband-lambda-fix
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// PID PANEL
// ════════════════════════════════════════
function filterPIDs(v){buildPIDList(v);}
function togglePID(pid){
  const _voor=plSelectieVoor();                 // #31: melden gaat via één plek
  if(activePIDs.has(pid)){ activePIDs.delete(pid); manualPIDs.delete(pid); }
  else {
    // Toevoegpoort (§15, ronde 6). De keuzelijst maakt een afgekeurde regel
    // niet klikbaar, dus via de UI komt hier normaal niets langs — deze deur
    // staat er voor alles wat togglePID() buiten de lijst om aanroept.
    // force volgt "Toon alles", dezelfde noodklep als in selectCategoryPIDs.
    const r=pidToevoegen(pid,{force:(typeof _showAllPIDs!=='undefined'&&_showAllPIDs)});
    if(!r.ok.length){
      const d=getPidDef(pid);
      showToast?.('⛔ '+((d&&d.name)||pid)+' — niet bruikbaar op dit voertuig; zet "Toon alles" aan om hem tóch te kiezen');
      return;
    }
  }
  buildPIDList(document.getElementById('psrch').value);
  document.getElementById('pidCnt').textContent=activePIDs.size;
  renderGauges(); rebuildGSel();
  plSelectieMeld(_voor,'sensorkeuze');
}

// ── ANALYSE-PROFIELEN: elke analyse zet zelf de benodigde PIDs aan ──
// Vaste basis-set: deze sensoren lopen bij ELKE functie mee, zodat er altijd
// motorcontext is (toerental, koelwater, belasting, inlaatlucht, accuspanning).
// Een functie voegt zijn eigen relevante PID's hieroverheen toe; de basis blijft.
// → BASIS_PIDS verplaatst naar pidlane-data.js

// → ANALYSE_PIDS verplaatst naar pidlane-data.js

// ── SLIMME SENSOR-SELECTIE ──────────────────────────────────────────
// Elke analyse start met een basis-profiel, maar breidt dat uit met ALLE
// sensoren die de auto daadwerkelijk ondersteunt (supportedPIDs) en die
// relevant zijn voor dat analysetype. Zo gebruikt elke analyse de volle
// beschikbare data i.p.v. een vast, smal lijstje.
//
// Per analyse: welke PID-categorieën zijn relevant? (cat uit getPidDef)
// → ANALYSE_CATS verplaatst naar pidlane-data.js

function relevantSupportedPIDs(profile){
  // Welk profiel is als laatste opgevraagd? Puur een notitie voor het
  // meetdekking-blok in het rapport, dat anders niet weet wélke kern-set aan
  // de orde was. Verandert niets aan het gedrag hieronder.
  try{ window._laatstProfiel = profile; }catch(e){ /* stil: schrijfactie, geen vervolgstap hangt hiervan af */ }
  // Elke analyse die z'n PID-set opvraagt, zet meteen het bijpassende
  // POLLPROFIEL (fase 3). Zo hoeft geen enkele analysefunctie dit apart te
  // regelen: accu-check gaat vanzelf naar het accuprofiel, rit naar monitor.
  try{
    const np=(window.ANALYSE2POLL||{})[profile];
    if(np) setPollProfile(np, 'analyse '+profile);
  }catch(e){ console.warn('setPollProfile mislukt:', e); }
  // BASIS_PIDS loopt bij elke functie mee (motorcontext); profiel eroverheen.
  const base = [...new Set([...BASIS_PIDS, ...(ANALYSE_PIDS[profile] || [])])];
  // In demo of zonder discovery: gewoon het basisprofiel
  if(demoMode || typeof supportedPIDs==='undefined' || !supportedPIDs.size) return base.filter(p=>pidGate(p,'plausibel'));
  const cats = ANALYSE_CATS[profile] || [];
  const extra = [];
  supportedPIDs.forEach(pid=>{
    if(base.includes(pid)) return;
    // Trede 'kiesbaar': fantoom eruit, NO DATA en onzin eruit. Twijfel mag
    // wél mee in analyses — de betrouwbaarheidscheck filtert daar verder.
    if(!pidGate(pid,'kiesbaar')) return;
    const d = getPidDef(pid);
    if(d && cats.includes(d.cat)) extra.push(pid);
  });
  // Basis eerst (gegarandeerde kern), daarna de relevante gezonde extra
  return [...base, ...extra].filter(p=>pidGate(p,'plausibel'));
}

// ── P7: readiness-rapport — hoeveel van een profiel kan deze auto leveren? ──
// Geeft {pct, beschikbaar[], ontbrekend[]} terug. supportedPIDs leeg betekent
// "discovery mislukt" → dat melden we expliciet i.p.v. stilletjes alles toestaan.
function pidReadiness(pidList){
  const list=pidList||[];
  const discoveryOk=(typeof supportedPIDs!=='undefined'&&supportedPIDs.size>0);
  const beschikbaar=[], ontbrekend=[];
  list.forEach(pid=>{
    const ok = discoveryOk ? supportedPIDs.has(pid) : !!getPidDef(pid);
    (ok?beschikbaar:ontbrekend).push(pid);
  });
  const pct=list.length?Math.round((beschikbaar.length/list.length)*100):100;
  return {pct, beschikbaar, ontbrekend, discoveryOk};
}

// ── CENTRALE PID-SELECTIE VOOR ELKE ANALYSE ─────────────────────────
// Single source of truth: bepaalt welke PIDs + verse waarden een analyse
// MAG gebruiken, en levert meteen het kwaliteitsblok voor de AI-prompt.
//   relevant  = relevantSupportedPIDs(profile): basisprofiel + alle gezonde
//               ondersteunde sensoren in de relevante categorieën
//   beschikbaar = heeft een verse waarde (pidVals) en is niet 'onzin'/'nodata'
//   onzin/nodata = fysiek onmogelijk of niet-aanwezige sensor → UITSLUITEN
//   twijfel    = blijft meedoen, maar buildQualityReport waarschuwt erover
// Zo gebruikt ELKE analyse precies de beschikbare relevante data — geen
// onzin-PIDs, niets relevants overgeslagen.
function analysisPidData(profile, extraPids){
  // 1. Relevante set voor dit profiel + eventuele analyse-specifieke extra's
  const relevant = relevantSupportedPIDs(profile) || [];
  const wens = [...new Set([...relevant, ...(extraPids||[])])];
  // 2. Alleen wat de auto echt levert: verse waarde + niet onzin/nodata.
  //    In demo is _pidHealth leeg → daar alles met een waarde toelaten.
  // Trede 'meetbaar': past bij het voertuig, levert iets, heeft een echte naam
  // en eenheid, en heeft nú een waarde. Analyse en rapport stellen daarmee
  // dezelfde eis — wat niet in het rapport mag, hoort ook niet in de prompt.
  const pids = wens.filter(pid=>pidGate(pid,'meetbaar'));
  const pairs = pids.map(pid=>[pid, pidVals[pid]]);
  // 3. Kwaliteitsgate: sluit fysiek-onmogelijke uit, waarschuw bij twijfel.
  const quality = buildQualityReport(pairs);
  // pairs ontdaan van wat de gate als 'onzin' bestempelt (dubbele zekerheid)
  const onzinSet = new Set(quality.onzin.map(q=>q.name));
  const schoon = pairs.filter(([pid])=>{ const d=getPidDef(pid); return !onzinSet.has((d&&d.name)||pid); });
  return { pids: schoon.map(p=>p[0]), pairs: schoon, quality };
}

// Zet de PIDs van een profiel aan (alleen die de auto ondersteunt) en wacht
// tot er verse data binnen is, zodat de analyse niet met lege waardes draait.
async function ensurePIDsActive(profile){
  // Slim: basis-profiel + alle relevante ondersteunde sensoren van de auto
  return ensurePIDListActive(relevantSupportedPIDs(profile));
}

// P4 + P1 + P7: zet activePIDs naar precies dit profiel (+ behoud handmatige
// keuzes), werkt óók in demo, en waarschuwt als discovery faalde.
async function ensurePIDListActive(pidList){
  const kandidaat=(pidList||[]).filter(pid=>
    demoMode || (typeof supportedPIDs!=='undefined'&&supportedPIDs.has&&supportedPIDs.has(pid))||getPidDef(pid));

  // Toevoegpoort (§15, ronde 6). Dit is de drukste deur naar activePIDs:
  // caravan, grafiek, koopcheck, rit, totaalcheck en remote komen hier alle
  // zes binnen met een eigen lijst. Die lijsten waren ongefilterd, dus een
  // analyseprofiel kon een AdBlue-sensor op een benzineauto aanzetten — ook
  // vlak ná een herijking. 'kiesbaar': hetzelfde niveau dat
  // relevantSupportedPIDs() zelf al hanteert.
  const wanted=kandidaat.filter(pid=>pidGate(pid,'kiesbaar'));
  const geweigerd=kandidaat.length-wanted.length;

  // P4: nieuwe set = profiel ∪ handmatige keuzes. Sensoren uit een vórige
  // analyse die de gebruiker niet zelf koos, vallen weg → geen onbeperkte groei,
  // geen oude irrelevante PIDs die de ronde vertragen of oude waarden leveren.
  const nieuw=new Set([...wanted, ...manualPIDs]);
  const added=[...nieuw].filter(p=>!activePIDs.has(p));
  const removed=[...activePIDs].filter(p=>!nieuw.has(p));

  activePIDs=nieuw;
  // Verwijderde PIDs: schoon hun verouderde waarde op zodat ze nooit meer in
  // een rapport belanden (P3 — geen oude pidVals blijven hangen).
  removed.forEach(p=>{ delete pidVals[p]; delete _pidLastUpd[p]; delete _pidLastUpdPause[p]; });

  if(added.length||removed.length){
    buildPIDList(document.getElementById('psrch')?.value||'');
    document.getElementById('pidCnt').textContent=activePIDs.size;
    renderGauges(); rebuildGSel();
    if(added.length){ log(`Analyse: ${added.length} sensoren aangezet`,'info'); showToast?.(`📡 ${added.length} sensoren voor deze analyse`); }
  }
  // Stil overslaan zou de vorige bug terugbrengen in omgekeerde vorm: dan
  // mist een analyse sensoren zonder dat iemand weet waarom.
  if(geweigerd){ try{ log(`Analyse: ${geweigerd} sensor(en) overgeslagen — niet op dit voertuig of geen data`,'info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }

  // P7: readiness tonen wanneer de auto (een deel van) het profiel niet heeft
  const rd=pidReadiness(pidList);
  if(!rd.discoveryOk){
    showToast?.('⚠ PID-discovery onvolledig — analyse draait op standaardset, waarden kunnen ontbreken',5000);
  } else if(rd.pct<60){
    showToast?.(`⚠ Deze auto levert ${rd.pct}% van de sensoren voor deze analyse`,4500);
  }

  // Wachten tot nieuwe PIDs data hebben — maar alleen op de SNELLE PIDs.
  // Trage sensoren (temp 10s, niveau/tellers 30-60s) laten we niet de start
  // ophouden; die druppelen vanzelf binnen tijdens de analyse.
  if(added.length&&connected&&!demoMode){
    const snel=added.filter(pid=>pidPollInterval(pid)<=1000);
    const wachtOp=snel.length?snel:added;
    const t0=Date.now();
    while(Date.now()-t0<5000){
      if(wachtOp.every(pid=>pidVals[pid]!==undefined)) break;
      await delay(250);
    }
  }
}

// ════════════════════════════════════════
// GAUGES
// ════════════════════════════════════════
function renderGauges(){
  const g=document.getElementById('gGrid'); g.innerHTML='';
  const vast=document.getElementById('vasteData');
  if(vast){ vast.innerHTML=''; vast.style.display='none'; }
  const sw=document.getElementById('pidViewSwitch');
  if(!activePIDs.size){
    if(sw) sw.style.display='none';
    g.innerHTML=`<div class="emp" style="grid-column:1/-1"><div class="ei">📡</div><h3>Geen sensoren geselecteerd</h3><p>Kies sensoren links voor live data</p></div>`;return;
  }
  if(sw) sw.style.display='flex';
  // Zelfde volgorde als de PID-keuzelijst: per motoronderdeel (Motor → Temp →
  // Brandstof → ... → Overig). discoveredPIDDefs is al zo gesorteerd; PIDs
  // die daar niet in staan komen achteraan. Voorheen: Set-invoegvolgorde.
  const _ord={}; (discoveredPIDDefs||[]).forEach((d,i)=>{ _ord[d.pid]=i; });
  let vastAantal=0;
  // ── Slimme weergave: drie vakken in plaats van één lang rooster ──
  // De tegels zelf blijven exact hetzelfde (zelfde ids, zelfde .gc), ze
  // worden alleen in een ander vak gehangen. Dat is bewust: applyG() vindt
  // ze via getElementById en heeft van deze indeling geen weet, dus een
  // weergavekeuze kan de live-verversing niet stukmaken.
  const slim = (pidViewMode==='slim');
  const vak = {};
  if(slim){
    [['dash','🚘 Dashboard'],['meter','🎛️ Tellerplaat'],['temp','🌡️ Temperaturen'],['rest','📈 Beweegt']].forEach(function(p){
      const sec=document.createElement('div');
      sec.className='slim-sec slim-'+p[0];
      sec.id='slimSec-'+p[0];
      const kop=document.createElement('div'); kop.className='slim-kop'; kop.textContent=p[1];
      const box=document.createElement('div'); box.className='slim-vak';
      sec.appendChild(kop); sec.appendChild(box);
      // Leeg vak = geen kopje. Een lege sectie "Temperaturen" is een belofte
      // die niet wordt ingelost; hij gaat pas aan zodra er een tegel in valt.
      sec.style.display='none';
      g.appendChild(sec);
      vak[p[0]]={sec:sec, box:box};
    });
  }
  [...activePIDs].sort((a,b)=>(_ord[a]??999)-(_ord[b]??999)).forEach(pid=>{
    const d=getPidDef(pid); if(!d) return;
    // Het vangnet dat hier stond is op 21-08-2026 verwijderd (§15, ronde 6 →
    // afgerond). Het riep pidGate(pid,'plausibel') aan en meldde via btDiag
    // zodra er iets langskwam, om te ontdekken of er nog een toevoegpad was
    // dat pidToevoegen() oversloeg. Het heeft in de ritten sinds de
    // steunbitcontrole en de geactiveerde herijking niets meer gemeld.
    //
    // Bewust wég in plaats van laten staan: een controle die nooit meer
    // aanslaat wordt niet gelezen, en een zeef in de tekenlus filtert stil —
    // precies wat de bug destijds drie rondes lang verborgen hield. De poorten
    // staan nu bij binnenkomst (pidToevoegen, magToevoegen) en herijkPidGate()
    // ruimt op als de kennis verandert. Komt er ooit toch weer een implausibele
    // PID in een tegel, dan is dat een open deur en hoort die dáár gedicht te
    // worden, niet hier weggemoffeld.

    // ── Code-/vlag-PIDs: gewone woorden in het compacte blok, geen tegel ──
    // Brandstoftype, OBD-norm, brandstofsysteem-status enz. hebben geen
    // meetverloop; een sparkline of 32px-cijfer is daar verspilde ruimte.
    if(vast && typeof pidIsTekst==='function' && pidIsTekst(pid)){
      const t=(window.PID_TEKST||{})[pid]||{};
      const row=document.createElement('div');
      row.className='vast-item'+(t.vast?'':' live');
      row.id='vt-'+pid;
      row.title=(t.vast?'Vast gegeven':'Live status')+' — dubbeltik = sensor uitzetten';
      const lbl=document.createElement('span'); lbl.className='vast-lbl'; lbl.textContent=d.name;
      const val=document.createElement('span'); val.className='vast-val'; val.id='vv-'+pid;
      val.textContent=(pidVals[pid]!==undefined)?pidTekstWaarde(pid,pidVals[pid]):'—';
      row.appendChild(lbl); row.appendChild(val);
      row.onclick=function(){ pidTileTap(pid); };
      vast.appendChild(row); vastAantal++;
      return;
    }

    const isMan=_scenario.enabled && _scenario.pids[pid]!==undefined;
    const leeg=pidTegelLeeg(pid);
    const c=document.createElement('div'); c.className='gc'+(isMan?' gc-manueel':'')+(leeg?' leeg':''); c.id='gc-'+pid;
    const manTag=isMan?' <span style="font-size:7px;font-weight:800;background:#7c3aed;color:#fff;padding:1px 4px;border-radius:3px;vertical-align:middle">MAN</span>':'';
    // Zelfde markering als in de keuzelijst: dit PID meet hetzelfde als een
    // standaard-PID maar komt uit een ander kanaal.
    const _alt=(window.PID_ALT_KANAAL||{})[pid];
    const altTag=_alt?` <span class="gc-alt" title="${(window.pidAltKanaalTip?pidAltKanaalTip(pid):'').replace(/"/g,'&quot;')}">⇄ ${_alt}</span>`:'';
    c.innerHTML=`<div class="gdot${leeg?' leeg':''}" id="gd-${pid}"${leeg?` title="${LEEG_TIP}"`:''}></div>
      <div class="gn2">${d.name}${manTag}${altTag}</div>
      <div class="gval"><span class="gv" id="gv-${pid}">—</span><span class="gunit">${d.unit||''}</span></div>
      <svg class="gspark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline id="gs-${pid}" points=""/></svg>`;
    c.style.cursor='pointer'; c.title='Dubbeltik = sensor uitzetten';
    c.onclick=function(){ pidTileTap(pid); };
    if(slim){
      const groep=(typeof slimGroep==='function')?slimGroep(pid,d):'rest';
      // Een temperatuur krijgt er een liggende balk bij, een meter een
      // staande; de rest houdt zijn sparkline.
      if(groep==='temp'){
        const bar=document.createElement('div'); bar.className='sbar';
        // GROVE SCHAAL ZICHTBAAR MAKEN (issue #66). slimTempSchaal() zet de
        // balk af tegen dH, anders wH×1,2, anders het maximum uit de
        // definitie. Die laatste terugval is de zwakke plek: omgevingslucht
        // (−40…85 °C) komt dan nooit ver, en dat leest als "koud" terwijl
        // het "onbekende grens" betekent. De balk zegt nu zelf welke van de
        // twee het is, in plaats van dat het alleen in een issue staat.
        if(!(d && (typeof d.dH==='number' || typeof d.wH==='number'))){
          bar.className='sbar grof';
          bar.title='Grove schaal: deze sensor heeft geen bekende waarschuwings- of gevarengrens, '
                   +'dus loopt de balk pas vol op het maximum uit de PID-definitie.';
        }
        const vul=document.createElement('i'); vul.id='sb-'+pid;
        bar.appendChild(vul);
        c.appendChild(bar);
      } else if(groep==='meter'){
        c.appendChild(slimMeterBouw(pid,d));
      }
      const v=vak[groep]||vak.rest;
      v.sec.style.display='';
      v.box.appendChild(c);
    } else {
      g.appendChild(c);
    }
    if(pidVals[pid]!==undefined) applyG(pid,pidVals[pid]);
  });
  // Herstel actieve weergavemodus op de nieuwe grid
  if(pidViewMode!=='full'){ g.classList.add('view-'+pidViewMode); }
  // Tekstblok alleen tonen als er ook echt code-PIDs geselecteerd zijn
  if(vast) vast.style.display = vastAantal ? 'grid' : 'none';
}
// ── Dubbeltik op een tegel/waarde/puntje = PID uitzetten ──
// Alleen deselecteren; weer aanzetten gaat via het sensorkeuze-scherm.
let _tileTap={pid:null,t:0};
function pidTileTap(pid){
  const now=Date.now();
  if(_tileTap.pid===pid && now-_tileTap.t<420){ _tileTap={pid:null,t:0}; pidDeselect(pid); return; }
  _tileTap={pid:pid,t:now};
}
function pidDeselect(pid){
  if(!activePIDs.has(pid)) return;
  const _voor=plSelectieVoor();                 // #31
  activePIDs.delete(pid); manualPIDs.delete(pid);
  try{ const cb=document.querySelector('input[type=checkbox][data-pid="'+pid+'"]'); if(cb) cb.checked=false; }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt:', e); }
  try{ rebuildGSel(); }catch(e){ console.warn('rebuildGSel mislukt:', e); }
  const d=getPidDef(pid);
  showToast?.('⏸ '+((d&&d.name)||pid)+' uit — aanzetten via sensorkeuze');
  // De eigen logregel die hier stond ("Sensor uitgezet via dubbeltik: ...")
  // is vervangen door de gedeelde melder. Twee bewoordingen voor dezelfde
  // gebeurtenis was precies de asymmetrie uit #31.
  plSelectieMeld(_voor,'dubbeltik op de tegel');
}

// ── Datastroom-reset: achterstand/drukte wegwerken zodat een volgende
//    meting vers start. Automatisch na elke analyse + handmatig via log-centrum. ──
function resetDataStream(auto){
  try{
    Object.keys(pidHist||{}).forEach(k=>{ if(Array.isArray(pidHist[k])) pidHist[k]=pidHist[k].slice(-5); });
    stabilityCount={}; outlierCount={}; dataStable=false; window._stabilityT0=null;
    _pidLastUpd={}; _pidLastUpdPause={}; pidSmooth={};
    try{ if(typeof window._rxBuf==='string') window._rxBuf=''; }catch(e){ /* stil: buffer-reset; ontbreekt hij dan is er ook niets te wissen */ }
    try{ if(typeof window._sppBuf==='string') window._sppBuf=''; }catch(e){ /* stil: buffer-reset; ontbreekt hij dan is er ook niets te wissen */ }
    try{ if(typeof btBuffer==='string') btBuffer=''; }catch(e){ /* stil: buffer-reset; ontbreekt hij dan is er ook niets te wissen */ }
    if(!auto) showToast?.('🔄 Datastroom gereset — meting start vers');
    log('Datastroom gereset'+(auto?' (automatisch na analyse)':''),'info');
  }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}

/* 27-07-2026 — fv() rondde ALLES boven de 10 af op hele eenheden. Voor
   toerental of temperatuur is dat prima, maar voor accuspanning sloopt het de
   meting: 12,4 V (leeg) · 13,4 V (laadt) · 14,6 V (laadt hard) · 15,1 V
   (regelaar stuk) werden op het scherm allemaal 12, 13, 15, 15. De hele
   diagnostische betekenis van dat PID zit in de tienden.
   Nu bepaalt de EENHEID het aantal decimalen, met de oude regel als terugval
   voor alles waar geen eenheid bij bekend is. */
const _FV_DEC={'V':2,'λ':3,'MPa':2,'bar':2,'A':2,'g/s':2,'L/100':1,'L/uur':1,'L/h':1,'mA':1};
function fvDec(unit,v){
  if(unit && _FV_DEC[unit]!=null) return _FV_DEC[unit];
  return Math.abs(v)<10 ? 2 : 0;
}
function fv(v, pidOfDef){
  if(v===undefined||v===null) return '—';
  let unit='';
  try{
    if(typeof pidOfDef==='string'){ const d=getPidDef(pidOfDef); unit=(d&&d.unit)||''; }
    else if(pidOfDef && pidOfDef.unit) unit=pidOfDef.unit;
  }catch(e){ console.warn('getPidDef mislukt:', e); }
  return Number(v).toFixed(fvDec(unit,v));
}

// ── PID weergavemodus: 'full' | 'numbers' | 'dots' | 'slim' ──
//
// DE STANDAARD IS 'slim' (01-09-2026, na #61 en #68). Daarvoor stond hier
// 'dots' en werd de opgeslagen voorkeur bij het opstarten OVERSCHREVEN — de
// regel in pidlane-theme.js zei dat er zelfs bij: "genegeerde voorkeur".
// setPidView() schreef dus wél naar pl_pidview, en niemand las het ooit
// terug. Een instelling die je kiest, die wordt opgeslagen en die de app bij
// de volgende start weggooit is geen instelling maar een knop die doet alsof.
//
// Er waren drie plekken die hier iets over zeiden en die het alle drie
// anders zeiden: deze regel ('dots'), de active-klasse in index.html
// ('full') en de aanroep in pidlane-theme.js ('dots'). Nu is er één bron:
// PID_VIEW_STANDAARD, met plPidViewHerstel() als enige die hem toepast.
const PID_VIEW_MODI = ['full','numbers','dots','slim'];
const PID_VIEW_STANDAARD = 'slim';
let pidViewMode=PID_VIEW_STANDAARD;
let _pidLastUpd={};          // pid -> laatste update-tijd (ms)
let _pidLastUpdPause={};     // pid -> PLBus.pausedTotal() ten tijde van die update
let _staleWatchdog=null;
const PID_STALE_MS=4000;     // geen verse waarde binnen 4s = "stale"
function setPidView(mode){
  if(mode==='correlate') mode='dots';   // correlatie-weergave verwijderd; oude opgeslagen voorkeur netjes opvangen
  // De slimme weergave is de enige modus met een ANDERE DOM (drie vakken in
  // plaats van één rooster). Klassen wisselen is daar niet genoeg: het
  // rooster moet opnieuw opgebouwd worden. Alleen bij een echte overgang,
  // want renderGauges() gooit alle tegels weg en bouwt ze terug.
  const herbouw = (mode==='slim') !== (pidViewMode==='slim');
  pidViewMode=mode;
  const g=document.getElementById('gGrid');
  if(g){ g.style.display=''; g.classList.remove('view-numbers','view-dots','view-slim'); if(mode!=='full') g.classList.add('view-'+mode); }
  if(herbouw){ try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt bij het wisselen van weergave:', e); } }
  // Alleen de knoppen MET een data-mode zijn weergaveknoppen. #waakBtn draagt
  // dezelfde klasse (hij staat in dezelfde rij) maar heeft geen data-mode, dus
  // `b.dataset.mode===mode` was daar altijd false en elke wissel van weergave
  // haalde zijn `active` eraf. De waakronde liep gewoon door — _aan bleef true,
  // de strook bleef staan, de bus werd nog geclaimd — maar de knop zag eruit
  // als uit. PLWaak.schakel() beheert die klasse zelf; die twee liepen elkaar
  // in de weg. De attribuutselector zet de grens bij "heeft een modus".
  document.querySelectorAll('.pidview-btn[data-mode]').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  try{ localStorage.setItem('pl_pidview', mode); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  // Stale-watchdog alleen nodig in puntjes-modus
  if(mode==='dots') startStaleWatchdog(); else stopStaleWatchdog();
}

// Bij het opstarten: de opgeslagen voorkeur, anders de standaard. Eén plek,
// zodat "waarmee start de live view" niet opnieuw over drie bestanden
// verspreid raakt. Een onbekende of beschadigde waarde valt terug op de
// standaard in plaats van de app in een modus te zetten die niet bestaat.
function plPidViewHerstel(){
  let m=null;
  try{ m=localStorage.getItem('pl_pidview'); }catch(e){ console.warn('pl_pidview lezen mislukt:', e); }
  setPidView(PID_VIEW_MODI.indexOf(m)>-1 ? m : PID_VIEW_STANDAARD);
  return pidViewMode;
}

// (Correlatie-weergave verwijderd; de deterministische correlatie-ENGINE
//  — runCorrelationEngine/correlationLines voor AI-bevindingen — blijft.)
function startStaleWatchdog(){
  stopStaleWatchdog();
  _staleWatchdog=setInterval(()=>{
    if(pidViewMode!=='dots') return;
    const now=Date.now();
    activePIDs.forEach(pid=>{
      const card=document.getElementById('gc-'+pid); if(!card) return;
      const last=_pidLastUpd[pid]||0;
      // Stale-drempel per PID: trage sensoren (temp/niveau, 10-60s interval)
      // mogen NIET rood knipperen zolang ze binnen hun eigen ritme verversen.
      // Drempel = 3× het poll-interval, met een ruime ondergrens van 5s.
      const interval=(typeof pidPollInterval==='function')?pidPollInterval(pid):1000;
      const drempel=Math.max(interval*3, 5000);
      // Trek de tijd eraf dat de bus door een ANDERE lezer bezet was
      // (gezondheidscheck, rit-sweep, veldlab-survey, verificatie, monitor).
      // Zonder deze correctie kleurde tijdens elke sweep de hele live view
      // rood, terwijl er niets mis was met de sensoren.
      let krediet=0;
      try{ krediet=Math.max(0, PLBus.pausedTotal()-(_pidLastUpdPause[pid]||0)); }catch(e){ console.warn('PLBus.pausedTotal mislukt:', e); }
      const stale=(now-last-krediet)>drempel;
      card.classList.toggle('stale', stale);
    });
  },1000);
}
function stopStaleWatchdog(){ if(_staleWatchdog){ clearInterval(_staleWatchdog); _staleWatchdog=null; } }
// ── Tegelstand: heeft deze sensor iets te melden? ───────────────────
// Drie standen, bewust eerlijk over wat we wél en niet weten:
//   groen   auto meldt ondersteuning én levert een plausibele waarde
//   grijs   auto meldt ondersteuning maar levert niets of onzin
//   (weg)   staat niet in de bitmap — komt hier niet eens langs
//
// 31-07-2026 — hiervoor was het bolletje groen tenzij een drempel werd
// overschreden. Een PID die nóóit een waarde gaf bleef dus groen, want applyG
// draait alleen als er data binnenkomt. Op de CX-5 stonden motorolietemperatuur,
// omgevingstemperatuur en brandstofverbruik alle drie op groen met een streepje
// als waarde. Die middelste stand is precies de kennis die de auto je gratis
// geeft: hij claimt de sensor en zwijgt.
const LEEG_TIP='Deze auto meldt dat hij deze sensor ondersteunt, maar levert er geen bruikbare waarde voor.';

function pidTegelLeeg(pid){
  const val=(typeof pidVals!=='undefined')?pidVals[pid]:undefined;
  if(val===undefined||val===null) return true;
  const h=(typeof _pidHealth!=='undefined')?_pidHealth[pid]:undefined;
  return h==='nodata'||h==='onzin';
}

// Loopt de bestaande tegels langs en zet de lege stand bij. Nodig omdat een
// sensor pas tijdens de gezondheidsscan 'nodata' kan worden, ná het opbouwen
// van het rooster.
function refreshLegeTegels(){
  try{
    document.querySelectorAll('.gc[id^="gc-"]').forEach(card=>{
      const pid=card.id.slice(3);
      const leeg=pidTegelLeeg(pid);
      card.classList.toggle('leeg', leeg);
      const dot=document.getElementById('gd-'+pid);
      if(!dot) return;
      dot.classList.toggle('leeg', leeg);
      if(leeg) dot.title=LEEG_TIP; else dot.removeAttribute('title');
    });
  }catch(e){ console.warn('pidTegelLeeg mislukt:', e); }
}

function applyG(pid,val){
  const d=getPidDef(pid); if(!d) return;
  // Code-/vlag-PIDs staan in het tekstblok, niet in een tegel: daar alleen de
  // vertaalde tekst bijwerken. Zonder deze afslag zou de rest hieronder op een
  // niet-bestaande #gc-… kaart stuklopen en de waarde nooit updaten.
  if(typeof pidIsTekst==='function' && pidIsTekst(pid)){
    const row=document.getElementById('vt-'+pid);
    const el=document.getElementById('vv-'+pid);
    if(el) el.textContent=pidTekstWaarde(pid,val);
    if(row){
      let st='ok';
      if((d.dH&&val>=d.dH)||(d.dL&&val<=d.dL)) st='danger';
      else if((d.wH&&val>=d.wH)||(d.wL&&val<=d.wL)) st='warn';
      // Motorlampje aan is altijd rood, ongeacht drempels
      if(pid==='0101' && Math.round(val)===1) st='danger';
      row.classList.toggle('warn', st==='warn');
      row.classList.toggle('danger', st==='danger');
    }
    return;
  }
  const card=document.getElementById('gc-'+pid); if(!card) return;
  let st='ok';
  if((d.dH&&val>=d.dH)||(d.dL&&val<=d.dL)) st='danger';
  else if((d.wH&&val>=d.wH)||(d.wL&&val<=d.wL)) st='warn';
  // Er is een waarde binnen, dus de lege stand is voorbij. Via classList in
  // plaats van een className-toewijzing: die overschreef ook gc-manueel,
  // waardoor de paarse rand van een handmatig gezette sensor bij de eerste
  // meting stilletjes verdween.
  card.classList.remove('warn','danger','leeg','stale');
  if(st!=='ok') card.classList.add(st);
  const dot=document.getElementById('gd-'+pid);
  if(dot){
    dot.classList.remove('warn','danger','leeg');
    if(st!=='ok') dot.classList.add(st);
    dot.removeAttribute('title');
  }
  // Puntjes-modus: laat het puntje knipperen bij elke nieuwe waarde
  if(pidViewMode==='dots' && dot && st==='ok'){
    dot.classList.remove('flash'); void dot.offsetWidth; dot.classList.add('flash');
  }
  const gv=document.getElementById('gv-'+pid); if(gv) gv.textContent=fv(val);
  // Sparkline uit de laatste ~24 metingen
  const sl=document.getElementById('gs-'+pid);
  if(sl&&pidHist[pid]&&pidHist[pid].length>1){
    const h=pidHist[pid].slice(-24).map(x=>x.v);
    const mn=Math.min(...h), mx=Math.max(...h), rg=(mx-mn)||1;
    sl.setAttribute('points',h.map((y,i)=>`${(i/(h.length-1))*100},${26-((y-mn)/rg)*24}`).join(' '));
    sl.style.stroke=st==='danger'?'var(--rd)':st==='warn'?'var(--or)':'var(--bl)';
  }
  if(pidViewMode==='slim'){ try{ slimBij(pid,val,d,st,card); }catch(e){ console.warn('slimBij mislukt:', e); } }
}

// ══════════════════════════════════════════════════════════════════
// SLIMME WEERGAVE (#61, #68) — wat er per meting nog bij moet
// ──────────────────────────────────────────────────────────────────
// De indeling in vakken zit in renderGauges(); hier staat alleen wat per
// binnenkomende waarde moet meebewegen. Drie dingen:
//
//   • de temperatuurbalk. Die staat NIET voor "hoe warm is het" maar voor
//     "hoe dicht zit deze temperatuur bij zijn eigen grens". Anders is het
//     diagram onleesbaar: koelwater op 90 °C naast uitlaatgas op 600 °C
//     zou een streepje naast een volle balk zijn, terwijl het eerste
//     alarmerend is en het tweede volstrekt normaal.
//   • de trendlijn wegzetten als er niets te trenden valt. Dat is de
//     "lineaire lijnen onnodig" uit het issue: een rechte streep kost een
//     halve tegel en zegt niets. De grens ligt op 2% van het bereik van het
//     PID zelf, dus 160 rpm voor het toerental en 5,6 km/u voor de snelheid.
//   • de tellerplaat (issue #68). Toerental, gaspedaal, gasklep en
//     motorbelasting stonden als losse tegels tussen de rest. Ze horen naast
//     elkaar: het gaat om de VERHOUDING (pedaal in, klep dicht, belasting
//     laag — dat is een verhaal, drie losse getallen niet). Dezelfde vorm
//     als het temperatuurdiagram, een kwartslag gedraaid, zodat de ene
//     balkengroep de andere niet nadoet met een andere betekenis.
// ══════════════════════════════════════════════════════════════════
const SLIM_BEWEEG_DEEL = 0.02;   // 2% van het bereik telt als "beweegt"
const SLIM_BEWEEG_MIN  = 4;      // minder metingen = nog niets te zeggen
// De sleepwijzer op de tellerplaat kijkt verder terug dan de sparkline (24):
// een gaspedaal is een halve seconde ingedrukt en dan weer los, en juist die
// piek wil je nog zien als je na het optrekken naar het scherm kijkt. 60
// metingen is ruim binnen de 120 die pidHist bewaart.
const SLIM_PIEK_N = 60;

// Waar loopt de balk vol? De gevarengrens als die bekend is, anders de
// waarschuwingsgrens met 20% marge, anders het maximum uit de PID-definitie.
function slimTempSchaal(d){
  const top = (d && typeof d.dH==='number') ? d.dH
            : (d && typeof d.wH==='number') ? d.wH*1.2
            : (d && typeof d.max==='number') ? d.max : 100;
  return (isFinite(top) && top>0) ? top : 100;
}
function slimBeweegt(pid,d){
  const h=pidHist[pid];
  if(!h || h.length<SLIM_BEWEEG_MIN) return false;
  const v=h.slice(-24).map(x=>x.v).filter(x=>typeof x==='number' && isFinite(x));
  if(v.length<SLIM_BEWEEG_MIN) return false;
  const rg=Math.max(...v)-Math.min(...v);
  const span=(d && typeof d.max==='number' && typeof d.min==='number') ? (d.max-d.min) : 0;
  const gem=v.reduce((a,b)=>a+b,0)/v.length;
  const drempel = span>0 ? span*SLIM_BEWEEG_DEEL : Math.abs(gem)*SLIM_BEWEEG_DEEL;
  return rg > Math.max(drempel, 1e-9);
}
// ── DE TELLERPLAAT (issue #68) ────────────────────────────────────
// Waar de temperatuurbalk de MARGE TOT DE GRENS toont, toont de meter het
// BEREIK VAN HET SIGNAAL: 0-100% voor een pedaal, 0-8000 voor het toerental.
// Dat verschil is met opzet, en het is ook precies waarom deze twee niet in
// één diagram kunnen. Een gaspedaal HEEFT geen gevarengrens — vol gas is geen
// storing — dus "hoe dicht bij de grens" is daar een vraag zonder antwoord.
// Wat je er wél van wilt weten is hoe ver hij open staat en hoe dat zich
// verhoudt tot de meter ernaast.
function slimMeterSchaal(d){
  const lo=(d && typeof d.min==='number' && isFinite(d.min)) ? d.min : 0;
  const hi=(d && typeof d.max==='number' && isFinite(d.max)) ? d.max : 100;
  return (hi>lo) ? {lo:lo,hi:hi} : {lo:0,hi:100};
}
function slimDeel(val,lo,hi){
  const v=Number(val);
  if(!isFinite(v)) return 0;
  return Math.max(0, Math.min(100, ((v-lo)/(hi-lo))*100));
}
// De sleepwijzer: de hoogste waarde uit de laatste SLIM_PIEK_N metingen.
// Bewust AFGELEID uit pidHist en niet in een eigen teller bijgehouden. Dan
// hoeft er ook niets gereset te worden bij resetDataStream(), bij een andere
// auto of bij een wissel van weergave — en een piek die na de rit blijft
// hangen is erger dan geen piek, want die leest als een meting die zojuist
// gedaan is.
function slimPiek(pid){
  const h=pidHist[pid];
  if(!h || !h.length) return null;
  const v=h.slice(-SLIM_PIEK_N).map(x=>x.v).filter(x=>typeof x==='number' && isFinite(x));
  return v.length ? Math.max.apply(null,v) : null;
}
// De meter zelf: drie lagen in één koker. De vulling, het streepje op de
// waarschuwingsgrens — alleen als die bekend is, anders belooft het een
// nauwkeurigheid die er niet is — en de sleepwijzer.
function slimMeterBouw(pid,d){
  const koker=document.createElement('div'); koker.className='smtr';
  const vul=document.createElement('i'); vul.id='sm-'+pid;
  koker.appendChild(vul);
  if(d && typeof d.wH==='number' && isFinite(d.wH)){
    const s=slimMeterSchaal(d);
    const g=document.createElement('div'); g.className='smtr-grens'; g.id='sg-'+pid;
    g.style.bottom=slimDeel(d.wH,s.lo,s.hi).toFixed(1)+'%';
    g.title='Waarschuwingsgrens '+d.wH+(d.unit?(' '+d.unit):'');
    koker.appendChild(g);
  }
  const piek=document.createElement('div'); piek.className='smtr-piek'; piek.id='sp-'+pid;
  piek.title='Hoogste waarde van de laatste '+SLIM_PIEK_N+' metingen';
  piek.style.display='none';           // pas tonen zodra er historie is
  koker.appendChild(piek);
  return koker;
}

function slimBij(pid,val,d,st,card){
  const bar=document.getElementById('sb-'+pid);
  if(bar){
    const pct=Math.max(0, Math.min(100, (val/slimTempSchaal(d))*100));
    bar.style.width=pct.toFixed(1)+'%';
    bar.className = st==='danger' ? 'rd' : st==='warn' ? 'or' : '';
    return;   // een temperatuur heeft geen sparkline om te verbergen
  }
  const mtr=document.getElementById('sm-'+pid);
  if(mtr){
    const s=slimMeterSchaal(d);
    const deel=slimDeel(val,s.lo,s.hi);
    mtr.style.height=deel.toFixed(1)+'%';
    mtr.className = st==='danger' ? 'rd' : st==='warn' ? 'or' : '';
    const pk=document.getElementById('sp-'+pid);
    if(pk){
      const p=slimPiek(pid);
      const pd=(p===null)?null:slimDeel(p,s.lo,s.hi);
      // Alleen tonen als de piek merkbaar bóven de huidige stand ligt. Een
      // wijzer die op de vulling zelf ligt voegt niets toe en leest als een
      // tweede, tegenstrijdige waarde.
      if(pd===null || pd-deel<1.5){ pk.style.display='none'; }
      else { pk.style.display=''; pk.style.bottom=pd.toFixed(1)+'%'; }
    }
    return;   // een meter heeft ook geen sparkline om te verbergen
  }
  if(card) card.classList.toggle('vlak', !slimBeweegt(pid,d));
}
function updPID(pid,val){
  pidVals[pid]=val;
  try{ _plCheckPid(pid,val); }catch(e){ console.warn('_plCheckPid mislukt:', e); }
  // ── De twee haken van ronde 5 (§15) ──────────────────────────────
  // Deze stonden in PIDLANE.md als gelegd (5a-2 en 5b, beide ✅) en
  // test-herijking.js toetst ze, maar ze werden nergens aangeroepen: de test
  // riep ze zelf aan. Gevolg: `_mapSamples` bleef op 0 (turbo-detectie dus
  // permanent dode code, precies de fout die 5a-1 had moeten verhelpen) en de
  // herijking draaide nooit (de bronlijst werd nooit herbouwd bij nieuwe
  // kennis). Beide zijn goedkoop: _noteMap() is twee vergelijkingen,
  // plHerijkTick() maakt één stempel en vergelijkt één string.
  try{ if(typeof _noteMap==='function') _noteMap(); }catch(e){ console.warn('_noteMap mislukt:', e); }
  try{ if(typeof plHerijkTick==='function') plHerijkTick(); }catch(e){ console.warn('plHerijkTick mislukt:', e); }
  _pidLastUpd[pid]=Date.now();
  // Een geslaagde meting spreekt een 'nodata'/'onzin'-oordeel tegen (#78). De
  // beslissing zelf staat in pidlane-rijsituatie.js, bij _pidHealth — hier
  // alleen de aanleiding, want dit is de plek die wéét dat er een geldige
  // waarde binnenkwam. Tijdens de gezondheidscheck zelf is dit een no-op: die
  // zet zijn eigen oordeel vlak na deze aanroep.
  try{ if(typeof plHealthHerzien==='function') plHealthHerzien(pid,val); }
  catch(e){ console.warn('plHealthHerzien mislukt:', e); }
  // Pauzekrediet (fase 1): leg vast hoeveel bus-pauzetijd er tot nu toe was.
  // De stale-watchdog trekt de pauze die ná deze meting kwam eraf, zodat een
  // sweep zijn eigen tegels niet rood laat knipperen.
  try{ _pidLastUpdPause[pid]=PLBus.pausedTotal(); }catch(e){ _pidLastUpdPause[pid]=0; }
  if(!pidHist[pid]) pidHist[pid]=[];
  pidHist[pid].push({t:Date.now(),v:val});
  if(pidHist[pid].length>120) pidHist[pid].shift();
  applyG(pid,val);
  if(graphPID===pid) drawGraph();
}

// ══════════════════════════════════════════════════════
// B1S1 BREEDBAND-LAMBDA FIX
// Moderne auto's hebben op bank-1-sensor-1 een BREEDBAND lambda-sensor die
// je uitleest via PID 0124 of 0134 (waarde in λ, ~1.00 = stoichiometrisch),
// niet via de smalband 0113 (spanning 0–1.3V). Op zulke auto's staat 0113
// dood op ~0.02V. Deze helper kiest de juiste bron en presentatie.
// ══════════════════════════════════════════════════════
// Leeft een breedband-PID? (heeft een zinnige, niet-nul λ-waarde)
function _wideAlive(pid){
  const v=pidVals[pid];
  return v!==undefined && v>0.05 && v<3;   // λ ligt realistisch rond 0.7–1.5
}
// Staat de smalband B1S1 "dood"? Vaste, lage, niet-oscillerende waarde over de
// laatste metingen (een gezonde smalband swingt tussen ~0.1 en ~0.9V).
// LET OP: B1S1-spanning is PID 0114 — NIET 0113. 0113 is de "O2-sensoren
// aanwezig"-bitmap; die als spanning lezen gaf de beruchte vaste ~0.02V.
function _narrowB1S1Dead(){
  const h=pidHist['0114'];
  if(!h||h.length<6) return false;
  const recent=h.slice(-8).map(x=>x.v);
  const mx=Math.max(...recent), mn=Math.min(...recent);
  return mx<0.1 && (mx-mn)<0.03;   // blijft plat onderaan = dood/niet aanwezig
}
// Bepaalt de beste B1S1-bron. Voorrang: levende breedband (0124/0134) > smalband 0114.
// Geeft {pid, val, unit, isLambda, name} of null als er niets bruikbaars is.
function b1s1Source(){
  // 1) Breedband heeft voorrang zodra die leeft
  for(const wb of ['0124','0134']){
    if(_wideAlive(wb)){
      const d=getPidDef(wb);
      return {pid:wb, val:pidVals[wb], unit:'λ', isLambda:true, name:'Lambda B1S1 (breedband)', def:d};
    }
  }
  // 2) Anders smalband B1S1 = PID 0114 (de echte spanning), mits niet dood
  if(pidVals['0114']!==undefined && !_narrowB1S1Dead()){
    return {pid:'0114', val:pidVals['0114'], unit:'V', isLambda:false, name:'O2 sensor B1S1', def:getPidDef('0114')};
  }
  // 3) Smalband dood én geen levende breedband: meld dat expliciet
  if(pidVals['0114']!==undefined && _narrowB1S1Dead()){
    return {pid:'0114', val:pidVals['0114'], unit:'V', isLambda:false, name:'O2 sensor B1S1', def:getPidDef('0114'), dead:true};
  }
  return null;
}
// Korte leesbare tekst van de B1S1-bron, voor AI-prompts en rapporten.
function b1s1Line(){
  const s=b1s1Source(); if(!s) return null;
  if(s.dead){
    // Smalband dood en geen breedband-data → eerlijk melden i.p.v. "te laag"
    return `B1S1 lambda: smalband (0114) reageert niet (${fv(s.val)}V vast). `+
           `Mogelijk breedband-sensor — lees 0124/0134 uit; geen betrouwbare smalband-waarde.`;
  }
  return s.isLambda
    ? `B1S1 lambda (breedband ${s.pid}): ${fv(s.val)} λ ${Math.abs(s.val-1)<0.05?'(≈ stoichiometrisch)':s.val>1?'(arm)':'(rijk)'}`
    : `B1S1 lambda (smalband 0114): ${fv(s.val)} V`;
}

// ══════════════════════════════════════════════════════
// IDEE 1 — ADAPTIEF VIN-PROFIEL (localStorage per voertuig)
// Onthoudt welke PIDs een VIN ondersteunt → snelle herverbinding,
// discovery overslaan bij een bekend voertuig.
// ══════════════════════════════════════════════════════
function vinProfileKey(vin){ return 'pl_vinprof_'+String(vin||'').toUpperCase(); }

function saveVinProfile(vin){
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(vin||''))) return;
  try{
    const prof={
      vin, pids:[...supportedPIDs],
      merk:vehicleInfo.merk||'', model:vehicleInfo.model||'',
      year:vehicleInfo.year||'', brandstof:vehicleInfo.brandstof||'',
      motor:vehicleInfo.motor||'',
      // Gezondheidsoordeel meebewaren. Zonder dit moest initialHealthScan()
      // bij ELKE verbinding opnieuw elke PID aftasten om te weten welke
      // sensoren de auto echt levert — 30-60s bus, terwijl het antwoord al
      // bekend was. Met dit veld kan die scan bij een bekend voertuig
      // worden overgeslagen zonder dat _pidHealth leeg blijft (waar
      // pidGate('kiesbaar') en autoSelectHealthyKern() aan hangen).
      health:(typeof _pidHealth!=='undefined'&&_pidHealth)?Object.assign({},_pidHealth):null,
      ts:Date.now()
    };
    const sleutel=vinProfileKey(vin);
    localStorage.setItem(sleutel, JSON.stringify(prof));
    // Terugleescontrole. "Opgeslagen" in het log betekende tot nu toe alleen
    // dat setItem niet gooide — niet dat er iets stond. Op Android kan een
    // WebView de opslag onder druk opruimen zonder een fout te geven, en dan
    // ziet een geslaagde opslag er precies zo uit als een mislukte.
    const terug=localStorage.getItem(sleutel);
    if(!terug){
      log('⚠️ Voertuigprofiel NIET bewaard — opslag weigerde stil','warn');
      try{ btDiag('setItem('+sleutel+') gooide niet, maar getItem geeft null','err'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
      return;
    }
    log(`💾 Voertuigprofiel opgeslagen (${prof.pids.length} PIDs) voor ${vin}`,'ok');
  }catch(e){
    // Quota vol is een verwachte fout; hem stil opeten is dat niet.
    try{ log('⚠️ Voertuigprofiel opslaan mislukt: '+(e.message||e),'warn'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
  }
}

// Gezondheidsoordeel uit het laatst geladen profiel; null als er geen was.
// Wordt gezet door applyVinProfileIfKnown() en gelezen door de connectieflow
// in pidlane-bt.js om de gezondheidscheck te kunnen overslaan.
let _profielHealth=null;
function profielHealth(){ return _profielHealth; }
window.profielHealth=profielHealth;

// Laadt opgeslagen PID-set; geeft true terug als een bruikbaar profiel bestond.
function applyVinProfileIfKnown(vin){
  // Deze functie gaf tot 20-08 alleen false terug, ongeacht de reden. Drie
  // verbindingen op rij sloegen een profiel op en laadden het de keer erna
  // niet, en uit het log was niet te zien waaróm: ontbrekende sleutel, stukke
  // JSON en een leeg pids-veld zagen er alle drie identiek uit. Omdat
  // profielTegenSteunbits() alléén in dit pad zit, bleef PLAN.md punt 1
  // daardoor onbevestigd hangen.
  const sleutel=vinProfileKey(vin);
  try{
    const raw=localStorage.getItem(sleutel);
    if(!raw){ btDiag('Geen profiel onder '+sleutel+' — volle discovery','warn'); return false; }
    const prof=JSON.parse(raw);
    if(!prof?.pids?.length){ btDiag('Profiel '+sleutel+' bevat geen PIDs — volle discovery','warn'); return false; }
    supportedPIDs=new Set(prof.pids);
    if(prof.brandstof) vehicleInfo.brandstof=prof.brandstof;
    if(prof.motor) vehicleInfo.motor=prof.motor;
    // Health apart parkeren, NIET meteen in _pidHealth zetten: de gebruiker
    // moet eerst bevestigen dat de scan mag worden overgeslagen. Zegt hij
    // nee, dan wint de verse meting en blijft dit ongebruikt.
    _profielHealth = (prof.health && typeof prof.health==='object') ? prof.health : null;
    log(`⚡ Bekend voertuig — ${prof.pids.length} PIDs uit profiel geladen`,'ok');
    return true;
  }catch(e){
    // Nooit stil: dit is een aanroep van eigen opslag, geen verwachte fout.
    try{ btDiag('Profiel '+sleutel+' onbruikbaar: '+(e.message||e),'err'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
    return false;
  }
}

// ══════════════════════════════════════════════════════
// IDEE 2 — SESSIEGEHEUGEN & TRENDANALYSE (per VIN)
// Elke sessie wordt compact bewaard (gem/min/max per PID). Over meerdere
// sessies kan PidLane trends tonen ("koelwater was 87°C, nu 96°C").
// ══════════════════════════════════════════════════════
function feedSessionStat(pid,val){
  if(val===null||val===undefined||isNaN(val)) return;
  const s=_sessionStats[pid]||(_sessionStats[pid]={n:0,sum:0,min:val,max:val,last:val});
  s.n++; s.sum+=val; s.last=val;
  if(val<s.min) s.min=val; if(val>s.max) s.max=val;
}
function sessionsKey(vin){ return 'pl_sessions_'+String(vin||'').toUpperCase(); }

function saveSession(){
  const vin=vehicleInfo?.vin;
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(vin||''))) return; // alleen per bekend VIN
  if(!Object.keys(_sessionStats).length) return;
  try{
    const arr=JSON.parse(localStorage.getItem(sessionsKey(vin))||'[]');
    const compact={};
    Object.entries(_sessionStats).forEach(([pid,s])=>{
      if(s.n<3) return; // te weinig metingen — overslaan
      compact[pid]={avg:Math.round(s.sum/s.n*100)/100,min:s.min,max:s.max,n:s.n};
    });
    if(!Object.keys(compact).length) return;
    arr.push({ts:Date.now(), merk:vehicleInfo.merk||'', year:vehicleInfo.year||'', stats:compact});
    while(arr.length>20) arr.shift(); // max 20 sessies per voertuig
    localStorage.setItem(sessionsKey(vin), JSON.stringify(arr));
    log(`💾 Sessie opgeslagen (${Object.keys(compact).length} PIDs) in voertuigdossier`,'ok');
  }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
function loadSessions(vin){
  try{ return JSON.parse(localStorage.getItem(sessionsKey(vin||vehicleInfo?.vin))||'[]'); }
  catch(e){ return []; }
}

// ══════════════════════════════════════════════════════
// IDEE 3 — LEREN VAN NORMAAL (drempel op basis van eigen historie)
// Bepaalt het normale gemiddelde + spreiding voor dit voertuig over de
// laatste sessies. Een waarde die daar statistisch buiten valt is verdacht,
// óók als die nog binnen de harde fabrieksgrens ligt.
// ══════════════════════════════════════════════════════
function vehicleBaseline(pid){
  const sessions=loadSessions();
  const avgs=sessions.map(s=>s.stats?.[pid]?.avg).filter(v=>typeof v==='number');
  if(avgs.length<3) return null; // te weinig historie voor betrouwbaar normaal
  const mean=avgs.reduce((a,b)=>a+b,0)/avgs.length;
  const std=Math.sqrt(avgs.reduce((a,b)=>a+(b-mean)**2,0)/avgs.length);
  return {mean, std, n:avgs.length};
}
// ── LEREN-VAN-NORMAAL — HERZIEN 02-08-2026 ──────────────────────────
// De vorige versie vergeleek een MOMENTWAARDE met de spreiding van
// SESSIEGEMIDDELDEN. Dat is een appels-en-perenfout met een voorspelbaar
// gevolg: de standaardafwijking van gemiddelden is klein (dat is precies
// wat middelen doet), terwijl een momentwaarde alle kanten op schiet.
// Toerental schommelt tussen 700 en 4000, maar het sessiegemiddelde ligt
// elke rit rond dezelfde 1200. Gevolg: |937-1233| gedeeld door een σ van
// een paar tientallen gaf moeiteloos 2,5σ, en dus stond ELKE actieve PID
// als bevinding in de banner. Acht "afwijkingen" waarvan er nul iets
// betekenden — precies het soort ruis dat een echte bevinding onzichtbaar
// maakt.
//
// Nu wordt gelijk met gelijk vergeleken: het gemiddelde van DEZE rit tegen
// de gemiddelden van eerdere ritten. Dat is dezelfde grootheid, dus de σ
// klopt, en de zin "afwijkend t.o.v. normaal voor deze auto" betekent nu
// werkelijk wat er staat — een uitspraak over de rit, niet over dit
// moment.
//
// Drie remmen tegen terugkerende ruis:
//  1. MIN_N metingen in deze rit voordat er geoordeeld wordt. Een gemiddelde
//     over vier metingen is geen gemiddelde.
//  2. σ krijgt een bodem van 2 % van het normaal. Rijdt een auto elke rit
//     bijna identiek, dan wordt σ minuscuul en is alles weer 3σ. Deze
//     variantiebodem is standaardpraktijk en voorkomt precies dat.
//  3. Drempel op 3σ i.p.v. 2,5σ. Bij tien PIDs levert 2,5σ statistisch al
//     bijna gegarandeerd een valse melding per rit.
const BASE_MIN_N   = 30;    // metingen in deze rit voordat we oordelen
const BASE_SIGMA_MIN = 0.02; // σ-bodem als fractie van het normaal
const BASE_DREMPEL = 3;     // hoeveel σ voordat het een bevinding is

// Gemiddelde van de LOPENDE rit; null als er nog te weinig gemeten is.
function huidigSessieGem(pid){
  const s=_sessionStats&&_sessionStats[pid];
  if(!s||!s.n||s.n<BASE_MIN_N) return null;
  return s.sum/s.n;
}

// Geeft een waarschuwingstekst als het gemiddelde van DEZE rit afwijkt van
// het geleerde normaal voor dit voertuig. Anders ''.
// De parameter `val` wordt niet meer gebruikt maar blijft staan zodat
// bestaande aanroepen (correlatie-engine, rapportregels) ongewijzigd werken.
// Eén berekening, twee uitkomsten: de zin voor het scherm én het getal om op
// te sorteren. Dat getal is nodig sinds de bevindingenbalk er maar twee toont
// (issue #60, 30-08-2026) — en het uit de zin terugparsen zou betekenen dat
// de opmaak bepaalt welke bevinding de belangrijkste is.
function baselineBevinding(pid){
  const b=vehicleBaseline(pid);
  if(!b) return null;
  const cur=huidigSessieGem(pid);
  if(cur===null) return null;
  const sigma=Math.max(b.std, Math.abs(b.mean)*BASE_SIGMA_MIN, 1e-9);
  const dev=Math.abs(cur-b.mean)/sigma;
  if(dev<BASE_DREMPEL) return null;
  const d=getPidDef(pid);
  const e=d?.unit||'';
  return { pid:pid, dev:dev,
    tekst:`${d?.name||pid}: deze rit gemiddeld ${fv(cur,pid)}${e} — normaal ${fv(b.mean,pid)}${e} `+
          `voor deze auto (${dev.toFixed(1)}\u03C3 over ${b.n} ritten)` };
}
function baselineWarning(pid,val){
  const r=baselineBevinding(pid);
  return r?r.tekst:'';
}
