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
  // Een PID die uit de selectie is gehaald mag geen verborgen-spook
  // achterlaten: vink je hem later opnieuw aan, dan hoort er een tegel te
  // verschijnen en niet niets. Hier opruimen en niet in togglePID() c.s., want
  // er zijn vier paden die de selectie wijzigen (keuzescherm, standaardset,
  // categorie, preset) en dit is de plek waar ze alle vier langskomen.
  hiddenPIDs.forEach(function(p){ if(!activePIDs.has(p)) hiddenPIDs.delete(p); });
  if(!activePIDs.size){
    if(sw) sw.style.display='none';
    try{ renderVerborgenStrook(); }catch(e){ console.warn('verborgen-strook mislukt:', e); }
    g.innerHTML=`<div class="emp" style="grid-column:1/-1"><div class="ei">📡</div><h3>Geen sensoren geselecteerd</h3><p>Kies sensoren links voor live data</p></div>`;return;
  }
  if(sw) sw.style.display='';   // leeg: de CSS zet hem op grid (één regel, vijf vakken)
  // Slim visueel heeft één vaste meter en geen tegels; de indeling en het
  // tekenen staan in pidlane-visueel.js. Het tekstblok blijft leeg: wat daar
  // staat hoort bij "Slim" en de andere weergaven.
  if(pidViewMode==='visueel' && window.PLVisueel){
    try{ PLVisueel.bouw(g); }catch(e){ console.warn('PLVisueel.bouw mislukt:', e); }
    try{ renderVerborgenStrook(); }catch(e){ console.warn('verborgen-strook mislukt:', e); }
    return;
  }
  // Slim is sinds 07-10-2026 je eigen dashboard (#439): de tegels, hun soort
  // en volgorde staan in pidlane-dashboard.js, per auto bewaard.
  if(pidViewMode==='slim' && window.PLDash){
    try{ PLDash.bouw(g); }catch(e){ console.warn('PLDash.bouw mislukt:', e); }
    return;
  }
  // Zelfde volgorde als de PID-keuzelijst: per motoronderdeel (Motor → Temp →
  // Brandstof → ... → Overig). discoveredPIDDefs is al zo gesorteerd; PIDs
  // die daar niet in staan komen achteraan. Voorheen: Set-invoegvolgorde.
  const _ord={}; (discoveredPIDDefs||[]).forEach((d,i)=>{ _ord[d.pid]=i; });
  let vastAantal=0, getoond=0;
  // ── Slimme weergave: drie vakken in plaats van één lang rooster ──
  // De tegels zelf blijven exact hetzelfde (zelfde ids, zelfde .gc), ze
  // worden alleen in een ander vak gehangen. Dat is bewust: applyG() vindt
  // ze via getElementById en heeft van deze indeling geen weet, dus een
  // weergavekeuze kan de live-verversing niet stukmaken.
  const slim = (pidViewMode==='slim');
  const vak = {};
  // ── Overzicht per categorie (#439): een kaart per categorie, in de volgorde
  // die bij de aandrijving past; de tegels worden rijen. Zelfde ids, dus
  // applyG() en de trendkeuze werken ongewijzigd.
  const ovz = (pidViewMode==='overzicht');
  const ovzVak = {};
  if(ovz){
    const motor=(typeof detectEngineType==='function') ? detectEngineType() : 'benzine';
    const dicht=ovzDichtLees();
    g.classList.toggle('ovz-ruim', dicht==='ruim');
    const bar=document.createElement('div'); bar.className='ovz-balk';
    bar.innerHTML='<span class="ovz-tel" id="ovzTel"></span><div class="ovz-dicht" role="group" aria-label="Dichtheid">'+
      '<button type="button" data-d="compact"'+(dicht==='compact'?' class="aan"':'')+' onclick="ovzDicht(\'compact\')">Compact</button>'+
      '<button type="button" data-d="ruim"'+(dicht==='ruim'?' class="aan"':'')+' onclick="ovzDicht(\'ruim\')">Ruim</button></div>';
    g.appendChild(bar);
    ovzVolgorde(motor).forEach(function(k){
      const sec=document.createElement('section'); sec.className='ovz-cat'; sec.id='ovzCat-'+k; sec.style.display='none';
      sec.innerHTML='<div class="ovz-kop"><h3>'+OVZ_CATS[k]+'</h3><span class="ovz-chip">normaal</span></div>';
      const box=document.createElement('div'); box.className='ovz-vak'; box.id='ovzVak-'+k;
      sec.appendChild(box); g.appendChild(sec);
      ovzVak[k]={sec:sec, box:box};
    });
  }
  if(slim){
    // "Rustig" staat achteraan, en dat is de volgorde van het scherm: eerst
    // wat er op de teller staat, dan wat de bestuurder doet, dan de
    // temperaturen, dan wat beweegt, en als laatste wat stil ligt.
    [['dash','🚘 Dashboard'],['meter','🎛️ Tellerplaat'],['temp','🌡️ Temperaturen'],['rest','📈 Beweegt'],['rustig','💤 Rustig']].forEach(function(p){
      const sec=document.createElement('div');
      sec.className='slim-sec slim-'+p[0];
      sec.id='slimSec-'+p[0];
      const kop=document.createElement('div'); kop.className='slim-kop'; kop.textContent=p[1];
      const box=document.createElement('div'); box.className='slim-vak'; box.id='slimVak-'+p[0];
      sec.appendChild(kop); sec.appendChild(box);
      // Leeg vak = geen kopje. Een lege sectie "Temperaturen" is een belofte
      // die niet wordt ingelost; hij gaat pas aan zodra er een tegel in valt.
      sec.style.display='none';
      g.appendChild(sec);
      vak[p[0]]={sec:sec, box:box};
    });
  }
  // De korte namen voor de tellerplaat in één keer voor het hele rooster: de
  // botsingscontrole kan pas iets zeggen als hij álle meters kent.
  const meterNaam = slim ? slimMeterLabels([...activePIDs]) : {};
  const _sorteer = ovz ? (a,b)=>ovzRang(a,_ord)-ovzRang(b,_ord) : (a,b)=>(_ord[a]??999)-(_ord[b]??999);
  [...activePIDs].sort(_sorteer).forEach(pid=>{
    const d=getPidDef(pid); if(!d) return;
    // Verborgen: geen tegel, geen regel in het tekstblok. Verder verandert er
    // niets — de PID staat nog in activePIDs, dus de pollus vraagt hem, updPID
    // vult de historie, en applyG() vindt straks alleen geen element om bij te
    // werken. Meten en tonen zijn hier twee dingen geworden.
    if(hiddenPIDs.has(pid)) return;
    // Telemetrie (de telefoonsensoren TL01–TL04) hoort alleen in Visueel:
    // daar staat hij op zijn eigen scherm met horizon en G-cirkel. In Overzicht
    // en Slim waren het vier rijen "—" onder Rijden zolang de telefoon niet in
    // de houder zat (07-10-2026, uit het gebruik).
    if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) return;
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
      row.title=(t.vast?'Vast gegeven':'Live status')+' — dubbeltik = verbergen, er wordt dan nog gemeten';
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
      <div class="gn2"${(meterNaam[pid]||(ovz&&OVZ_KORT[pid]))?` title="${d.name.replace(/"/g,'&quot;')}"`:''}>${meterNaam[pid]||(ovz?ovzNaam(pid,d):d.name)}${manTag}${altTag}</div>
      <div class="gval"><span class="gv" id="gv-${pid}">—</span><span class="gunit">${d.unit||''}</span></div>
      <svg class="gspark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline id="gs-${pid}" points=""/></svg>`;
    c.style.cursor='pointer'; c.title='Dubbeltik = tegel verbergen, er wordt dan nog gemeten';
    c.onclick=function(){ pidTileTap(pid); };
    // De 📈-knop (Overzicht): zet de trendlijn van deze tegel vast. Alleen in
    // die weergave zichtbaar; de tik gaat niet door naar de dubbeltik.
    const tk=document.createElement('button');
    tk.type='button'; tk.className='gc-trendknop'; tk.id='gt-'+pid; tk.textContent='📈';
    tk.setAttribute('aria-label','Trendlijn vastzetten');
    tk.title='Trendlijn vastzetten (hoogstens '+TREND_MAX+')';
    tk.onclick=function(ev){ ev.stopPropagation(); trendWissel(pid); };
    c.appendChild(tk);
    if(ovz){
      // De normale band: een vlak (wL…wH) en een streepje voor nu. Het vlak
      // staat vast; applyG() verschuift alleen het streepje.
      const b=ovzBand(d, null);
      const band=document.createElement('div'); band.className='gband'+(b.heeft?'':' geen'); band.id='gb-'+pid;
      band.title=b.heeft ? 'Groen = normaal voor deze sensor' : 'Voor deze sensor is geen normale grens bekend';
      band.innerHTML='<i style="left:'+b.z0.toFixed(1)+'%;width:'+(b.z1-b.z0).toFixed(1)+'%"></i><u></u>';
      // Achteraan in de DOM; de grid zet hem tussen naam en waarde (grid-column).
      c.appendChild(band);
      const noot=document.createElement('div'); noot.className='gnoot'; noot.id='gno-'+pid;
      c.appendChild(noot);
      const v=ovzVak[ovzCat(d, pid)]||ovzVak.overig;
      v.sec.style.display='';
      v.box.appendChild(c);
    } else if(slim){
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
    getoond++;
    if(pidVals[pid]!==undefined) applyG(pid,pidVals[pid]);
  });
  // De maat, twee keer. Nu meteen, want bij een herbouw midden in een rit is
  // de historie er al en hoort een stilliggende sensor niet eerst een halve
  // minuut groot in beeld te staan. En daarna één keer, zodat een verse start
  // — waar nog niets van de historie te zeggen valt — alsnog uitkomt op de
  // indeling die bij de auto past.
  if(slim){
    try{ slimHerweeg(); slimVakkenBij(); }catch(e){ console.warn('slimHerweeg mislukt:', e); }
    try{ slimHerweegPlannen(); }catch(e){ console.warn('slimHerweegPlannen mislukt:', e); }
  }
  // Herstel actieve weergavemodus op de nieuwe grid
  g.classList.add('view-'+pidViewMode);
  if(pidViewMode==='overzicht'){
    try{ trendHerkies(); }catch(e){ console.warn('trendkeuze mislukt:', e); }
    try{ ovzBij(); const t=document.getElementById('ovzTel'); if(t) t.textContent=getoond+' sensor'+(getoond===1?'':'en')+' · per categorie'; }
    catch(e){ console.warn('Overzicht: koppen bijwerken mislukt', e); }
  }
  // Tekstblok alleen tonen als er ook echt code-PIDs geselecteerd zijn
  if(vast) vast.style.display = vastAantal ? 'grid' : 'none';
  const verborgen = renderVerborgenStrook();
  // "Geen sensoren geselecteerd" zou hier liegen: ze zijn wél geselecteerd en
  // ze worden gemeten, je hebt ze alleen allemaal weggeklikt. Een lege staat
  // die de verkeerde oorzaak noemt stuurt je naar het verkeerde scherm.
  if(!getoond && !vastAantal && verborgen)
    g.innerHTML=`<div class="emp" style="grid-column:1/-1"><div class="ei">🙈</div><h3>Alles verborgen</h3><p>${verborgen} sensor${verborgen===1?'':'en'} worden nog gemeten. Dubbeltik onderaan op een naam om hem terug te halen.</p></div>`;
}

// ── De dubbeltik één keer uitleggen (#124) ────────────────────────
// De tegels dragen een `title`, en dat is precies de plek waar het op een
// telefoon niet aankomt: er is geen muis, dus er is geen hover. Wie het gebaar
// niet kent, vindt het alleen per ongeluk — en dan met de toast als enige
// uitleg achteraf. Eén keer per toestel de zin tonen is genoeg; vaker is
// bemoeizucht, en een balk die blijft staan kost schermruimte die in een
// rijdende auto duurder is dan de tip.
//
// Bewust gekoppeld aan de eerste keer dat er ook echt tegels staan: een tip
// over een gebaar op een tegel die er niet is, is ruis.
//
// EN AAN DE LIVE VIEW, NIET AAN HET TEKENEN (#145, 11-09-2026). Dit hing aan
// renderGauges(), en die draait al bij het opstarten — de tip kwam dus in
// beeld op het keuzescherm, waar geen enkele tegel te zien is, en juist níét
// op het moment dat je de tegels voor het eerst vóór je hebt. Eén keer per
// toestel betekent dan: één keer op het verkeerde moment, en daarna nooit
// meer. sw('live') is de enige plek waar het middenscherm werkelijk de Live-
// tab wordt — openLiveView(), de tabknop en de deur lopen er alle drie langs.
const TEGELTIP_SLEUTEL = 'pl_tip_dubbeltik';
function _tegelTipEenmalig(){
  // De voorwaarde "er staan tegels" staat nu hier en niet bij de aanroeper:
  // hij hoort bij de tip en niet bij het moment, en zo geldt hij voor elke
  // route naar de Live view.
  var g = document.getElementById('gGrid');
  if(!g || !g.querySelectorAll('.gc').length) return;
  try{
    if(localStorage.getItem(TEGELTIP_SLEUTEL)==='1') return;
    localStorage.setItem(TEGELTIP_SLEUTEL,'1');
  }catch(e){ console.warn('Tip-voorkeur niet op te slaan — de tip komt dan vaker terug:', e); return; }
  // Iets later dan de eerste tekening: tijdens het opbouwen van het scherm
  // staan er al meldingen over verbinden en sensorkeuze, en dan verdwijnt deze
  // ertussen.
  setTimeout(function(){
    try{ showToast?.('💡 Tip: dubbeltik een tegel om hem te verbergen — hij wordt dan nog gewoon gemeten.'); }
    catch(e){ console.warn('Tip tonen mislukt:', e); }
  }, 1500);
}
// ══════════════════════════════════════════════════════════════════
// VERBERGEN IS GEEN UITZETTEN
// ──────────────────────────────────────────────────────────────────
// Tot 02-09-2026 deed een dubbeltik op een tegel twee dingen tegelijk: de PID
// uit `activePIDs` halen (dus stoppen met meten — de pollus vraagt hem niet
// meer, pidHist loopt leeg, de rit-opname en de analyse missen hem) én de
// tegel van het scherm halen. Dat is één handeling met twee betekenissen, en
// dat is in deze codebase al drie keer een bug geweest. Erger nog: de dure
// helft was onzichtbaar. Je haalde een tegel weg omdat hij in de weg stond, en
// je verloor er stilletjes een meting mee.
//
// Nu zijn het twee dingen:
//   VERBERGEN  (dubbeltik op de tegel) raakt alleen het scherm. De PID blijft
//              in activePIDs, wordt gewoon gemeten, blijft in de historie, en
//              telt gewoon mee in de analyse. Alleen de tegel is weg.
//   UITZETTEN  (het kruisje in de verborgen-strook, of het keuzescherm) haalt
//              hem uit de selectie en stopt het meten.
//
// De regel voor de gebruiker is één zin: **dubbeltik wisselt de zichtbaarheid,
// waar je hem ook doet.** Op een tegel verbergt hij, op een naam in de strook
// onderin haalt hij hem terug. Eén gebaar, één betekenis.
//
// BEWUST ALLEEN VOOR DEZE SESSIE. hiddenPIDs staat in het geheugen en wordt
// niet bewaard. Bewaren per auto is #94, en dat is een grotere vraag: waar
// hoort een verborgen PID als je een andere auto aansluit, en wat gebeurt er
// bij een gewiste opslag. Een herstart geeft dus alle tegels terug, en dat is
// hier de veilige kant — een tegel die je een maand geleden hebt weggeklikt en
// niet meer kent, is erger dan een tegel te veel.
const hiddenPIDs = new Set();
function pidVerborgen(pid){ return hiddenPIDs.has(pid); }

// Verbergen en tonen zijn met opzet twee functies en geen toggle: de
// aanroepers weten precies welke kant ze op willen, en een toggle die je
// tweemaal krijgt (dubbeltik!) doet dan niets.
function pidVerberg(pid){
  if(!activePIDs.has(pid) || hiddenPIDs.has(pid)) return false;
  hiddenPIDs.add(pid);
  try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt:', e); }
  const d=getPidDef(pid);
  // De toast zegt er expliciet bij dat er dóórgemeten wordt. Zonder die zin
  // leest "verborgen" als "uit", en dan verwacht iemand een snellere pollus of
  // schrikt hij van een analyse die de sensor toch noemt.
  showToast?.('🙈 '+((d&&d.name)||pid)+' verborgen — wordt nog gemeten. Terug via de strook onderaan.');
  return true;
}
function pidToon(pid){
  if(!hiddenPIDs.delete(pid)) return false;
  try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt:', e); }
  const d=getPidDef(pid);
  showToast?.('👁 '+((d&&d.name)||pid)+' weer in beeld');
  return true;
}
function pidToonAlles(){
  if(!hiddenPIDs.size) return 0;
  const n=hiddenPIDs.size;
  hiddenPIDs.clear();
  try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt:', e); }
  showToast?.('👁 '+n+' tegel'+(n===1?'':'s')+' weer in beeld');
  return n;
}

// De strook onderaan de live view: alles wat je hebt weggeklikt, met een korte
// naam. Bewust een eigen element buiten #gGrid, want dit hoort bij álle vier de
// weergaven en niet alleen bij de slimme — het vak "Rustig" is een indeling van
// wat er wél staat, dit is de lijst van wat er níét staat.
//
// De kop zegt "wordt nog gemeten". Dat is de hele reden dat deze strook er is:
// zonder die zin is "verborgen" niet van "uit" te onderscheiden, en dan is er
// niets opgelost maar alleen verplaatst.
function renderVerborgenStrook(){
  const el=document.getElementById('verborgenStrook');
  if(!el) return 0;
  el.innerHTML='';
  const lijst=[...activePIDs].filter(function(p){ return hiddenPIDs.has(p); });
  if(!lijst.length){ el.style.display='none'; return 0; }
  el.style.display='flex';
  const kop=document.createElement('div'); kop.className='verb-kop';
  kop.textContent='🙈 '+lijst.length+' verborgen — wordt nog gemeten';
  el.appendChild(kop);
  lijst.forEach(function(pid){
    const d=getPidDef(pid);
    const naam=(d&&d.name)||pid;
    let kort=naam;
    try{ if(typeof hudShortLabel==='function') kort=hudShortLabel(naam)||naam; }
    catch(e){ console.warn('hudShortLabel mislukt:', e); }
    const chip=document.createElement('span'); chip.className='verb-chip'; chip.id='vb-'+pid;
    chip.title=naam+' — dubbeltik om hem terug te halen';
    const lbl=document.createElement('span'); lbl.className='verb-naam'; lbl.textContent=kort;
    lbl.onclick=function(){ pidTileTap(pid); };
    // Het kruisje is de ÁNDERE handeling, en die hoort zichtbaar en benoemd te
    // zijn in plaats van achter hetzelfde gebaar te schuilen: hier stop je met
    // meten. Eén tik volstaat — dit is een klein doel met een eigen label, geen
    // tegel waar je met een duim langs veegt.
    const weg=document.createElement('button'); weg.className='verb-weg'; weg.type='button';
    weg.textContent='✕';
    weg.title='Sensor helemaal uitzetten — er wordt dan niet meer gemeten';
    weg.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); pidDeselect(pid); };
    chip.appendChild(lbl); chip.appendChild(weg);
    el.appendChild(chip);
  });
  // Met tien verborgen tegels is tien keer dubbeltikken geen weg terug.
  const alles=document.createElement('button'); alles.className='verb-alles'; alles.type='button';
  alles.id='verbAlles';
  alles.textContent='Alles tonen';
  alles.onclick=function(){ pidToonAlles(); };
  el.appendChild(alles);
  return lijst.length;
}

// ── Dubbeltik = wissel de zichtbaarheid ──
// De dubbeltik-poort zit hier en niet in pidVerberg(): één tik mag niets doen,
// want een tegel is groot en je zit in een rijdende auto.
let _tileTap={pid:null,t:0};
function pidTileTap(pid){
  const now=Date.now();
  if(_tileTap.pid===pid && now-_tileTap.t<420){
    _tileTap={pid:null,t:0};
    if(hiddenPIDs.has(pid)) pidToon(pid); else pidVerberg(pid);
    return;
  }
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
  showToast?.('⏸ '+((d&&d.name)||pid)+' uit — er wordt niet meer gemeten. Aanzetten via sensorkeuze.');
  // De eigen logregel die hier stond ("Sensor uitgezet via dubbeltik: ...")
  // is vervangen door de gedeelde melder. Twee bewoordingen voor dezelfde
  // gebeurtenis was precies de asymmetrie uit #31.
  //
  // De aanleiding heette tot 02-09-2026 'dubbeltik op de tegel'. Dat gebaar
  // verbergt sindsdien alleen nog; écht uitzetten gaat via het kruisje in de
  // verborgen-strook. De melder moet zeggen wat er werkelijk gebeurde, anders
  // staat er straks in het selectielog een handeling die niet bestaat.
  plSelectieMeld(_voor,'kruisje in de verborgen-strook');
}

// ── Datastroom-reset: achterstand/drukte wegwerken zodat een volgende
//    meting vers start. Automatisch na elke analyse + handmatig via log-centrum. ──
function resetDataStream(auto){
  try{
    Object.keys(pidHist||{}).forEach(k=>{ if(Array.isArray(pidHist[k])) pidHist[k]=pidHist[k].slice(-5); });
    stabilityCount={}; outlierCount={}; dataStable=false; window._stabilityT0=null;
    _pidLastUpd={}; _pidLastUpdPause={};
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

// ── PID weergavemodus: 'overzicht' | 'slim' | 'visueel' ──
//
// OVERZICHT (01-10-2026, #302). Trends, Getallen en Puntjes waren drie
// weergaven van hetzelfde rooster. Trends hertekende bij elke meetwaarde een
// trendlijn voor élke tegel, en op de telefoon liep de responstijd daarop in
// tien minuten op van 43 naar 120 ms. De meeste sensoren liggen stil; een lijn
// die recht loopt zegt niets. Nu één weergave: getal plus statuspuntje per
// sensor, en hoogstens TREND_MAX trendlijnen — vastgezet met 📈, de vrije
// plekken voor wat het meest beweegt. Een oude voorkeur (full/numbers/dots)
// komt via PID_VIEW_OUD vanzelf hier uit.
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
const PID_VIEW_MODI = ['overzicht','slim','visueel'];
const PID_VIEW_OUD = { full:'overzicht', numbers:'overzicht', dots:'overzicht' };
// Weergaven met een EIGEN opbouw van het rooster: wisselen van of naar zo'n
// modus vraagt een herbouw, klassen wisselen is dan niet genoeg.
const PID_VIEW_EIGEN = ['overzicht','slim','visueel'];
const PID_VIEW_STANDAARD = 'slim';
let pidViewMode=PID_VIEW_STANDAARD;
let _pidLastUpd={};          // pid -> laatste update-tijd (ms)
let _pidLastUpdPause={};     // pid -> PLBus.pausedTotal() ten tijde van die update
let _staleWatchdog=null;
const PID_STALE_MS=4000;     // geen verse waarde binnen 4s = "stale"
function setPidView(mode){
  if(mode==='correlate') mode='overzicht';          // correlatie-weergave verwijderd; een directe aanroeper komt op Overzicht
  if(PID_VIEW_OUD[mode]) mode=PID_VIEW_OUD[mode];   // Trends/Getallen/Puntjes zijn Overzicht geworden
  // De slimme weergave is de enige modus met een ANDERE DOM (drie vakken in
  // plaats van één rooster). Klassen wisselen is daar niet genoeg: het
  // rooster moet opnieuw opgebouwd worden. Alleen bij een echte overgang,
  // want renderGauges() gooit alle tegels weg en bouwt ze terug.
  const herbouw = mode!==pidViewMode && (PID_VIEW_EIGEN.indexOf(mode)>-1 || PID_VIEW_EIGEN.indexOf(pidViewMode)>-1);
  pidViewMode=mode;
  // Slim visueel remt de snelle PIDs die er niet op staan (PLVisueel.remt);
  // die rem hoort precies zo lang te duren als de weergave open staat.
  try{ if(window.PLVisueel){ if(mode==='visueel') PLVisueel.start(); else PLVisueel.stop(); } }
  catch(e){ console.warn('PLVisueel starten/stoppen mislukt:', e); }
  const g=document.getElementById('gGrid');
  if(g){ g.style.display=''; g.classList.remove('view-overzicht','view-slim','view-visueel'); g.classList.add('view-'+mode); }
  if(herbouw){ try{ renderGauges(); }catch(e){ console.warn('renderGauges mislukt bij het wisselen van weergave:', e); } }
  // Alleen de knoppen MET een data-mode zijn weergaveknoppen. #waakBtn droeg
  // tot 26-09-2026 dezelfde klasse (hij stond in dezelfde rij) zonder data-mode, dus
  // `b.dataset.mode===mode` was daar altijd false en elke wissel van weergave
  // haalde zijn `active` eraf. De waakronde liep gewoon door — _aan bleef true,
  // de strook bleef staan, de bus werd nog geclaimd — maar de knop zag eruit
  // als uit. PLWaak.schakel() beheert die klasse zelf; die twee liepen elkaar
  // in de weg. De attribuutselector zet de grens bij "heeft een modus".
  document.querySelectorAll('.pidview-btn[data-mode]').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  try{ localStorage.setItem('pl_pidview', mode); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  // Stale-watchdog en trendkeuze alleen in het overzicht
  if(mode==='overzicht'){ startStaleWatchdog(); trendStart(); } else { stopStaleWatchdog(); trendStop(); }
}

// Bij het opstarten: de opgeslagen voorkeur, anders de standaard. Eén plek,
// zodat "waarmee start de live view" niet opnieuw over drie bestanden
// verspreid raakt. Een onbekende of beschadigde waarde valt terug op de
// standaard in plaats van de app in een modus te zetten die niet bestaat.
function plPidViewHerstel(){
  let m=null;
  try{ m=localStorage.getItem('pl_pidview'); }catch(e){ console.warn('pl_pidview lezen mislukt:', e); }
  if(m && PID_VIEW_OUD[m]) m=PID_VIEW_OUD[m];
  setPidView(PID_VIEW_MODI.indexOf(m)>-1 ? m : PID_VIEW_STANDAARD);
  return pidViewMode;
}

// (Correlatie-weergave verwijderd; de deterministische correlatie-ENGINE
//  — runCorrelationEngine/correlationLines voor AI-bevindingen — blijft.)
function startStaleWatchdog(){
  stopStaleWatchdog();
  _staleWatchdog=setInterval(()=>{
    if(pidViewMode!=='overzicht') return;
    const now=Date.now();
    activePIDs.forEach(pid=>{
      const card=document.getElementById('gc-'+pid); if(!card) return;
      // Een telefoonsensor die niet vast zit is al dof (pidlane-telemetrie.js);
      // hij krijgt bewust geen updPID, dus 'stale' zou hier elke seconde knipperen.
      if(card.classList.contains('los')){ card.classList.remove('stale'); return; }
      // Wanneer een waarde oud is staat op één plek: plOud() in
      // pidlane-plload.js, dezelfde regel als Visueel (07-10-2026).
      const stale=plOud(pid, now);
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

// Het oordeel over één meting: 'ok', 'warn' of 'danger'. Deze drempelregel
// stond twee keer letterlijk in applyG() — één keer voor het tekstblok en één
// keer voor de tegel — en slimMaat() heeft hem als derde nodig. Drie kopieën
// van dezelfde grens is precies de vorm waarin er hier al eerder eentje
// stilletjes uit de pas liep.
//
// De regel voor het motorlampje stond alleen in de tekstblok-kopie. Hij hoort
// bij het oordeel en niet bij de plek waar het getoond wordt, dus hij staat
// hier voor allebei. Voor de tegels verandert dat niets: 0101 staat in
// PID_TEKST en komt daar nooit langs.
function pidOordeel(d,val,pid){
  if(!d) return 'ok';
  let st='ok';
  if((d.dH&&val>=d.dH)||(d.dL&&val<=d.dL)) st='danger';
  else if((d.wH&&val>=d.wH)||(d.wL&&val<=d.wL)) st='warn';
  if(pid==='0101' && Math.round(val)===1) st='danger';
  return st;
}

// ══ OVERZICHT PER CATEGORIE (07-10-2026, #439) ══════════════════════
// Overzicht was een rooster van tegels in de volgorde van de keuzelijst,
// met wisselende breedtes, afgekapte namen en een statusbolletje dat altijd
// groen stond. Nu is het het naslagwerk: per categorie een kaart, per sensor
// één rij met de normale band erin. Slim wordt het eigen dashboard (volgende
// stap), Visueel blijft de meter achter het stuur.
//
// Alles hieronder tot applyG() is puur — test-overzicht.js knipt het los.
const OVZ_CATS = {
  rijden:'Rijden', motor:'Motor', temp:'Temperaturen', brandstof:'Brandstof',
  uitlaat:'Uitlaat en emissie', elektrisch:'Elektrisch', berekend:'Berekend', overig:'Overig'
};
const OVZ_VAN_CAT = { Rijden:'rijden', Motor:'motor', Temp:'temp', Brandstof:'brandstof', Emissie:'uitlaat',
  Electrisch:'elektrisch', Berekend:'berekend', Telemetrie:'rijden', Status:'overig', Overig:'overig' };
// Een paar PIDs staan in de definitie onder een categorie die voor een lezer
// niet klopt: inlaatlucht is een temperatuur, ook al is het motorlucht.
const OVZ_PID_CAT = { '010F':'temp' };
function ovzCat(d, pid){ return OVZ_PID_CAT[pid] || (d && OVZ_VAN_CAT[d.cat]) || 'overig'; }
// De volgorde van de kaarten hangt aan de aandrijving. Een hybride of EV
// wordt eerst elektrisch gelezen: de aandrijfaccu staat dan bovenaan, de
// motor eronder. Een EV heeft geen brandstof en geen uitlaat; staan die er
// tóch (een PID die de ECU meldt), dan komen ze achteraan.
function ovzVolgorde(motor){
  if(motor==='hybride') return ['rijden','elektrisch','motor','temp','brandstof','uitlaat','berekend','overig'];
  if(motor==='ev') return ['rijden','elektrisch','temp','motor','berekend','overig','brandstof','uitlaat'];
  return ['rijden','motor','temp','brandstof','uitlaat','elektrisch','berekend','overig'];
}
// De belangrijkste eerst, vast per categorie: wat een monteur als eerste
// wil zien. Wat hier niet staat volgt de keuzelijst.
const OVZ_RANG = ['010D','010C','0104','0149','015A','0111','010B','0105','015C','010F','0146',
  '012F','015E','CA03','0106','0107','0108','0109','0110','0124','0134','0114','0115','015B','0142'];
function ovzRang(pid, ord){ const i=OVZ_RANG.indexOf(pid); return i>-1 ? i : 100+((ord && ord[pid]!==undefined) ? ord[pid] : 900); }
// De schaal van het balkje en het groene vlak erin. Het vlak loopt van wL
// tot wH; ontbreekt er één, dan tot de rand van de schaal; ontbreken ze
// allebei, dan is er geen vlak (heeft:false) — dan is er geen grens bekend en
// beweert het balkje niets over normaal. De bovenkant zoals slimTempSchaal()
// hem kiest (gevarengrens, of bij een temperatuur 1,3× de waarschuwingsgrens),
// zodat 87 °C koelwater niet tegen de rand van een schaal tot 215 °C plakt.
function ovzSchaal(d){
  if(!d) return { lo:0, hi:100 };
  const lo = (typeof d.min==='number') ? d.min : 0;
  let hi = (typeof d.balkVol==='number') ? d.balkVol : (typeof d.dH==='number') ? d.dH
         : (d.cat==='Temp' && typeof d.wH==='number') ? d.wH*1.3 : (typeof d.max==='number' ? d.max : 100);
  if(!(hi>lo)) hi=lo+1;
  return { lo:lo, hi:hi };
}
function ovzBand(d, val){
  const s=ovzSchaal(d), p=function(x){ return Math.max(0, Math.min(100, (x-s.lo)/(s.hi-s.lo)*100)); };
  const heeft=!!d && (typeof d.wL==='number' || typeof d.wH==='number');
  const n=Number(val);
  return { heeft:heeft, z0: heeft && typeof d.wL==='number' ? p(d.wL) : 0, z1: heeft && typeof d.wH==='number' ? p(d.wH) : 100,
           pos: (val===null || val===undefined || !isFinite(n)) ? null : p(n) };
}
// Eén regel onder een rij die buiten zijn band valt: wat de grens is, zodat
// "oranje" niet alleen een kleur blijft. Leeg bij ok.
function ovzNoot(d, val, st){
  if(st==='ok' || !d) return '';
  const n=Number(val), e=d.unit ? ' '+d.unit : '', f=function(x){ return (typeof fv==='function') ? fv(x, d) : String(x); };
  const hoog=(typeof d.dH==='number' && n>=d.dH) ? d.dH : (typeof d.wH==='number' && n>=d.wH) ? d.wH : null;
  const laag=(typeof d.dL==='number' && n<=d.dL) ? d.dL : (typeof d.wL==='number' && n<=d.wL) ? d.wL : null;
  const ernst = st==='danger' ? 'gevarengrens' : 'waarschuwingsgrens';
  if(hoog!==null) return 'Boven de '+ernst+' van '+f(hoog)+e;
  if(laag!==null) return 'Onder de '+ernst+' van '+f(laag)+e;
  return st==='danger' ? 'Buiten het veilige bereik' : 'Buiten het normale bereik';
}
// De chip in de kop van een categorie.
function ovzKop(warn, danger){
  if(danger) return { tekst: danger+' gevaar', kl:'rd' };
  if(warn) return { tekst: warn+' let op', kl:'or' };
  return { tekst:'normaal', kl:'' };
}
// Binnen een categorie: afwijkend bovenaan, daarna de vaste rang. `st` per
// pid ('ok'|'warn'|'danger'). Puur; geeft de nieuwe volgorde.
function ovzSorteer(pids, st, ord){
  const w={ danger:0, warn:1 };
  return pids.slice().sort(function(a,b){
    const sa=(st && w[st[a]]!==undefined) ? w[st[a]] : 2, sb=(st && w[st[b]]!==undefined) ? w[st[b]] : 2;
    return sa!==sb ? sa-sb : ovzRang(a, ord)-ovzRang(b, ord);
  });
}
// Korte namen voor de rij: in Compact is de naamkolom zo'n 100 px, en drie
// rijen "Brandsto…" onder elkaar zeggen niets. De volle naam blijft in de
// title. Wat hier niet staat houdt zijn eigen naam en wordt afgekapt.
const OVZ_KORT = { '010D':'Snelheid', '010C':'Toerental', '0104':'Belasting', '0111':'Gasklep', '0149':'Gaspedaal',
  '015A':'Gaspedaal', '010B':'Inlaatdruk', '0110':'Luchtmassa', '0105':'Koelwater', '015C':'Motorolie', '010F':'Inlaatlucht',
  '0146':'Buiten', '012F':'Brandstofpeil', '015E':'Verbruik', '0106':'Trim kort B1', '0107':'Trim lang B1',
  '0108':'Trim kort B2', '0109':'Trim lang B2', '0124':'Lambda B1S1', '0134':'Lambda B1S1', '0114':'O₂ B1S1',
  '0115':'O₂ B1S2', '0142':'Accu 12V', '015B':'Aandrijfaccu', '0133':'Luchtdruk', '011F':'Looptijd',
  'CA02':'Brandstofdebiet', 'CA03':'Verbruik nu', 'CA04':'Laaddruk' };
function ovzNaam(pid, d){ return OVZ_KORT[pid] || (d && d.name) || pid; }
const OVZ_DICHT_SLEUTEL='pl_ovz_dicht';
function ovzDichtLees(){
  try{ return localStorage.getItem(OVZ_DICHT_SLEUTEL)==='ruim' ? 'ruim' : 'compact'; }
  catch(e){ console.warn('Overzicht: dichtheid onleesbaar, compact', e); return 'compact'; }
}
function ovzDicht(stand){
  const s=stand==='ruim' ? 'ruim' : 'compact';
  try{ localStorage.setItem(OVZ_DICHT_SLEUTEL, s); }catch(e){ console.warn('Overzicht: dichtheid niet opgeslagen', e); }
  const g=document.getElementById('gGrid'); if(g) g.classList.toggle('ovz-ruim', s==='ruim');
  document.querySelectorAll('.ovz-dicht button').forEach(function(b){ b.classList.toggle('aan', b.dataset.d===s); });
  return s;
}
// De koppen bijwerken en de afwijkende rijen omhoog halen. Draait op de
// trendklok (3 s), niet per meting: een rij die bij elke meetwaarde van plek
// wisselt is niet te lezen. Alleen verplaatsen als de volgorde verandert.
function ovzBij(){
  if(pidViewMode!=='overzicht') return;
  const ord={}; (discoveredPIDDefs||[]).forEach(function(d,i){ ord[d.pid]=i; });
  document.querySelectorAll('.ovz-cat').forEach(function(sec){
    const box=sec.querySelector('.ovz-vak'); if(!box) return;
    const kaarten=[].slice.call(box.querySelectorAll(':scope > .gc'));
    const st={}; let warn=0, danger=0;
    kaarten.forEach(function(c){ const p=c.id.slice(3); st[p]=c.classList.contains('danger')?'danger':c.classList.contains('warn')?'warn':'ok';
      if(st[p]==='danger') danger++; else if(st[p]==='warn') warn++; });
    const k=ovzKop(warn, danger), chip=sec.querySelector('.ovz-chip');
    if(chip && chip.textContent!==k.tekst){ chip.textContent=k.tekst; chip.className='ovz-chip'+(k.kl?' '+k.kl:''); }
    const nu=kaarten.map(function(c){ return c.id.slice(3); }), nieuw=ovzSorteer(nu, st, ord);
    if(nieuw.join()!==nu.join()) nieuw.forEach(function(p){ const c=document.getElementById('gc-'+p); if(c) box.appendChild(c); });
  });
}

function applyG(pid,val){
  const d=getPidDef(pid); if(!d) return;
  if(pidViewMode==='visueel' && window.PLVisueel){
    try{ PLVisueel.bij(pid,val); }catch(e){ console.warn('PLVisueel.bij mislukt:', e); }
    return;
  }
  if(pidViewMode==='slim' && window.PLDash){
    try{ PLDash.bij(pid,val); }catch(e){ console.warn('PLDash.bij mislukt:', e); }
    return;
  }
  // Code-/vlag-PIDs staan in het tekstblok, niet in een tegel: daar alleen de
  // vertaalde tekst bijwerken. Zonder deze afslag zou de rest hieronder op een
  // niet-bestaande #gc-… kaart stuklopen en de waarde nooit updaten.
  if(typeof pidIsTekst==='function' && pidIsTekst(pid)){
    const row=document.getElementById('vt-'+pid);
    const el=document.getElementById('vv-'+pid);
    if(el) el.textContent=pidTekstWaarde(pid,val);
    if(row){
      const st=pidOordeel(d,val,pid);
      row.classList.toggle('warn', st==='warn');
      row.classList.toggle('danger', st==='danger');
    }
    return;
  }
  const card=document.getElementById('gc-'+pid); if(!card) return;
  const st=pidOordeel(d,val,pid);
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
  // In Overzicht met de eenheid erbij (#439): dan geldt de decimalenregel van
  // fvDec(), en staat de accu op 14.10 V in plaats van 14 V.
  const gv=document.getElementById('gv-'+pid); if(gv) gv.textContent=(pidViewMode==='overzicht') ? fv(val, d) : fv(val);
  const gb=document.getElementById('gb-'+pid);
  if(gb){
    const b=ovzBand(d, val), u=gb.lastChild;
    if(u && b.pos!==null) u.style.left='calc('+b.pos.toFixed(1)+'% - 1.5px)';
    gb.classList.toggle('warn', st==='warn'); gb.classList.toggle('danger', st==='danger');
    const no=document.getElementById('gno-'+pid), t=ovzNoot(d, val, st);
    if(no && no.textContent!==t) no.textContent=t;
  }
  // Sparkline: niet hier tekenen maar aanmelden. sparkTeken() tekent ze
  // gebundeld, hoogstens SPARK_MS per keer en alleen als ze in beeld zijn.
  sparkVraag(pid, st);
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

// Waar loopt de balk vol? Een eigen `balkVol` als de definitie die geeft
// (bandtemperatuur: rood vanaf 65, balk tot 80 — #370), anders de
// gevarengrens, anders de waarschuwingsgrens met 20% marge, anders het
// maximum uit de PID-definitie.
function slimTempSchaal(d){
  const top = (d && typeof d.balkVol==='number') ? d.balkVol
            : (d && typeof d.dH==='number') ? d.dH
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
// ══ OVERZICHT: WELKE TRENDLIJNEN, EN RUSTIG TEKENEN (01-10-2026, #302) ══
// Twee dingen die samen de tekenlast omlaag brengen:
//   • hoogstens TREND_MAX tegels krijgen een trendlijn: eerst wat je zelf
//     met 📈 vastzet, de vrije plekken voor wat het hardst beweegt. Een
//     gekozen lijn houdt zijn plek tot een andere TREND_HOUD keer zo hard
//     beweegt, anders springt de indeling bij elke herkeuze.
//   • een trendlijn wordt niet bij elke meetwaarde getekend maar aangemeld;
//     sparkTeken() tekent alles wat klaarstaat in één keer, hoogstens elke
//     SPARK_MS, en slaat lijnen over die niet in beeld zijn.
// Gemeten op de telefoon vóór deze wijziging: RenderThread 31% en de GPU-draad
// 15–24% van één kern, en de responstijd van 43 naar 120 ms in tien minuten
// Trends. trendKies() is puur, zodat test-overzicht.js hem los kan toetsen.
const TREND_MAX = 4;
const TREND_HERKIES_MS = 3000;
const TREND_HOUD = 1.5;
const SPARK_MS = 250;
let _trendVast = trendVastLees();
let _trendAuto = [];
let _trendTimer = null;

function trendVastLees(){
  try{
    const v=JSON.parse(localStorage.getItem('pl_trendvast')||'[]');
    return Array.isArray(v) ? v.filter(x=>typeof x==='string').slice(0,TREND_MAX) : [];
  }catch(e){ console.warn('pl_trendvast lezen mislukt:', e); return []; }
}
// Hoeveel beweegt een sensor, als deel van zijn eigen bereik. Over de laatste
// 60 metingen: een gaspedaal dat net los is, telt nog even mee.
function trendBeweging(pid){
  const h=pidHist[pid];
  if(!h || h.length<SLIM_BEWEEG_MIN) return 0;
  const v=h.slice(-60).map(x=>x.v).filter(x=>typeof x==='number' && isFinite(x));
  if(v.length<SLIM_BEWEEG_MIN) return 0;
  const d=getPidDef(pid);
  const span=(d && typeof d.max==='number' && typeof d.min==='number' && d.max>d.min) ? (d.max-d.min) : 0;
  const gem=Math.abs(v.reduce((a,b)=>a+b,0)/v.length);
  return (Math.max(...v)-Math.min(...v)) / (span>0 ? span : (gem||1));
}
// Puur: kandidaten [{pid, score}], de vastgezette pids, de vorige automatische
// keuze en het maximum. Vast gaat voor; daarna wat beweegt (boven dezelfde 2%
// als Slim), met een voorsprong voor wat er al stond.
function trendKies(kand, vast, huidig, max){
  const actief=kand.map(k=>k.pid);
  const uit=vast.filter(p=>actief.indexOf(p)>-1).slice(0,max);
  const vrij=max-uit.length;
  if(vrij<=0) return uit;
  const pool=kand.filter(k=>uit.indexOf(k.pid)<0 && k.score>SLIM_BEWEEG_DEEL)
    .map(k=>({pid:k.pid, w:k.score*(huidig.indexOf(k.pid)>-1 ? TREND_HOUD : 1)}))
    .sort((a,b)=>b.w-a.w);
  return uit.concat(pool.slice(0,vrij).map(k=>k.pid));
}
function trendHerkies(){
  if(pidViewMode!=='overzicht') return [];
  const kand=[...activePIDs]
    .filter(p=>!hiddenPIDs.has(p) && !(typeof pidIsTekst==='function' && pidIsTekst(p)) && document.getElementById('gc-'+p))
    .map(p=>({pid:p, score:trendBeweging(p)}));
  const keuze=trendKies(kand, _trendVast, _trendAuto, TREND_MAX);
  _trendAuto=keuze.filter(p=>_trendVast.indexOf(p)<0);
  kand.forEach(function(k){
    const c=document.getElementById('gc-'+k.pid); if(!c) return;
    const aan=keuze.indexOf(k.pid)>-1, vast=_trendVast.indexOf(k.pid)>-1;
    // Alleen bij een echte wissel aanraken: een klasse zetten die er al
    // staat kost niets, maar een span-wissel kost een herindeling.
    if(c.classList.contains('gc-trend')!==aan){ c.classList.toggle('gc-trend', aan); if(aan) sparkVraag(k.pid, null, true); }
    if(c.classList.contains('gc-trend-vast')!==vast) c.classList.toggle('gc-trend-vast', vast);
    const knop=document.getElementById('gt-'+k.pid);
    if(knop) knop.setAttribute('aria-pressed', vast ? 'true' : 'false');
  });
  return keuze;
}
function trendStart(){
  trendStop();
  _trendTimer=setInterval(function(){
    try{ trendHerkies(); }catch(e){ console.warn('trendkeuze mislukt:', e); }
    try{ ovzBij(); }catch(e){ console.warn('Overzicht: koppen bijwerken mislukt', e); }
  }, TREND_HERKIES_MS);
}
function trendStop(){ if(_trendTimer){ clearInterval(_trendTimer); _trendTimer=null; } }
function trendWissel(pid){
  const i=_trendVast.indexOf(pid);
  if(i>-1) _trendVast.splice(i,1);
  else if(_trendVast.length>=TREND_MAX){
    showToast?.('📈 Hoogstens '+TREND_MAX+' trendlijnen vast — zet er eerst één los');
    return false;
  } else _trendVast.push(pid);
  try{ localStorage.setItem('pl_trendvast', JSON.stringify(_trendVast)); }catch(e){ console.warn('pl_trendvast opslaan mislukt:', e); }
  try{ trendHerkies(); }catch(e){ console.warn('trendkeuze mislukt:', e); }
  return _trendVast.indexOf(pid)>-1;
}

// De planner. sparkVraag() meldt een lijn aan; de eerste aanmelding plant één
// tekenbeurt, de rest wacht daarop mee.
const _sparkVuil={};
let _sparkGepland=false, _sparkLaatst=0, _sparkGetekend=0;
function sparkVraag(pid, st, meteen){
  _sparkVuil[pid] = (st===null || st===undefined) ? (_sparkVuil[pid]||'ok') : st;
  if(_sparkGepland) return;
  _sparkGepland=true;
  const wacht = meteen ? 0 : Math.max(0, SPARK_MS-(Date.now()-_sparkLaatst));
  setTimeout(function(){ requestAnimationFrame(sparkTeken); }, wacht);
}
function sparkTeken(){
  _sparkGepland=false; _sparkLaatst=Date.now();
  Object.keys(_sparkVuil).forEach(function(pid){
    const st=_sparkVuil[pid]; delete _sparkVuil[pid];
    const sl=document.getElementById('gs-'+pid);
    if(!sl || !pidHist[pid] || pidHist[pid].length<2) return;
    // Niet in beeld (een tegel zonder trend, een verborgen vak): niet tekenen.
    const svg=sl.ownerSVGElement || sl.parentNode;
    if(!svg || !svg.getClientRects || svg.getClientRects().length===0) return;
    const h=pidHist[pid].slice(-24).map(x=>x.v);
    const mn=Math.min(...h), mx=Math.max(...h), rg=(mx-mn)||1;
    sl.setAttribute('points', h.map((y,i)=>`${(i/(h.length-1))*100},${26-((y-mn)/rg)*24}`).join(' '));
    const kl = st==='danger' ? 'var(--rd)' : st==='warn' ? 'var(--or)' : 'var(--bl)';
    if(sl.getAttribute('data-kl')!==kl){ sl.style.stroke=kl; sl.setAttribute('data-kl', kl); }
    _sparkGetekend++;
  });
}
window.PLTrend = {
  MAX: TREND_MAX, SPARK_MS: SPARK_MS,
  kies: trendKies, beweging: trendBeweging, herkies: trendHerkies, wissel: trendWissel,
  vast: function(){ return _trendVast.slice(); },
  getekend: function(){ return _sparkGetekend; }
};

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

// ── DE MAAT ───────────────────────────────────────────────────────
// slimGroep() bepaalt de VORM van een tegel: een balk, een meter, een tegel
// met een trendlijn. Wat eraan ontbrak is de MAAT — hoevéél ruimte een meting
// verdient. Die zat aan de soort vast, en daardoor kreeg een brandstofpeil
// dat een uur lang 68% aanwijst het grootste cijfer van het scherm terwijl
// het niets nieuws zegt, en stond een MAF die op 2,00 g/s vastligt er even
// opgewekt bij als een koelwater dat klimt.
//
// De maat volgt daarom het gedrag, met drie uitkomsten:
//   'groot'    het oordeel staat op warn of danger: dit vraagt aandacht.
//   'regel'    het signaal ligt stil — één regel in het vak "Rustig".
//   'normaal'  de rest, en alles waar nog geen uitspraak over te doen is.
//
// De VOLGORDE is het punt. Een waarde die vastligt MAAR op oranje of rood
// staat — een brandstoftrim die op +25% blijft plakken, een koelwater dat op
// 118 °C blijft hangen — is juist het gevaarlijkste geval. Dat mag nooit naar
// één regel zakken omdát het niet beweegt, dus het oordeel komt eerst.
//
// 'temp' en 'meter' krijgen geen maat en blijven waar ze zijn: die hebben hun
// eigen vorm (een regel in het balkdiagram, een meter op de plaat) en die is
// al compact. Een koelwater dat te warm wordt kleurt daar rood; het hoeft
// niet ook nog van plaats te veranderen.
//
// SLIM_MAAT_MIN is bewust hoger dan SLIM_BEWEEG_MIN (4). "Beweegt hij?" is na
// vier metingen te beantwoorden; "ligt hij stil?" niet — dat is een uitspraak
// over wat er níét gebeurde, en die is pas iets waard als er lang genoeg
// gekeken is. Tot die tijd is de maat 'normaal', de veilige kant.
const SLIM_MAAT_MIN = 24;       // metingen voordat "ligt stil" een uitspraak is
const SLIM_HERWEEG_MS = 30000;  // één herweging per opbouw, zie slimHerweegPlannen()
let _slimHerweegT = null;

function slimMaat(pid,d,val){
  const groep=(typeof slimGroep==='function')?slimGroep(pid,d):'rest';
  if(groep==='temp' || groep==='meter') return null;
  const v=(val===undefined)?pidVals[pid]:val;
  if(v!==undefined && v!==null && pidOordeel(d,v,pid)!=='ok') return 'groot';
  const h=pidHist[pid];
  if(!h || h.length<SLIM_MAAT_MIN) return 'normaal';
  return slimBeweegt(pid,d) ? 'normaal' : 'regel';
}

// Een leeg vak toont geen kopje. Dezelfde regel als bij het opbouwen, maar nu
// ook nádat een tegel verhuisd is — anders blijft de kop "Rustig" boven een
// leeg vak staan zodra de laatste tegel daar weer uit omhoog gaat.
function slimVakkenBij(){
  ['dash','meter','temp','rest','rustig'].forEach(function(g){
    const sec=document.getElementById('slimSec-'+g);
    const box=document.getElementById('slimVak-'+g);
    if(sec&&box) sec.style.display = box.children.length ? '' : 'none';
  });
}

// Zet één tegel in het vak waar hij hoort. VERPLAATST het bestaande element
// in plaats van het rooster opnieuw op te bouwen: de tegel houdt zijn id, zijn
// balk, zijn sparkline en zijn plek in de historie, en applyG() merkt er niets
// van. Geeft true terug als er echt iets verhuisd is.
function slimPlaats(pid){
  const card=document.getElementById('gc-'+pid); if(!card) return false;
  const d=getPidDef(pid); if(!d) return false;
  const maat=slimMaat(pid,d);
  if(maat===null) return false;                    // temp en meter blijven staan
  card.classList.toggle('slim-groot', maat==='groot');
  const doel=(maat==='regel')?'rustig':((typeof slimGroep==='function')?slimGroep(pid,d):'rest');
  const box=document.getElementById('slimVak-'+doel);
  if(!box || card.parentNode===box) return false;
  box.appendChild(card);
  slimVakkenBij();
  return true;
}

// Eén herweging per opbouw, en daarna niet meer. Tegels die tijdens het rijden
// van plaats en formaat wisselen zijn onleesbaarder dan een tegel met het
// verkeerde formaat, dus de indeling wordt NIET doorlopend herrekend. Bij het
// opbouwen is er nog geen historie — dan is alles 'normaal' — en na
// SLIM_HERWEEG_MS is er genoeg gezien om te weten wat er stil ligt.
function slimHerweeg(){
  if(pidViewMode!=='slim') return 0;
  let n=0;
  activePIDs.forEach(function(pid){ if(slimPlaats(pid)) n++; });
  return n;
}
function slimHerweegPlannen(){
  if(_slimHerweegT){ clearTimeout(_slimHerweegT); _slimHerweegT=null; }
  if(pidViewMode!=='slim') return;
  _slimHerweegT=setTimeout(function(){
    _slimHerweegT=null;
    try{ slimHerweeg(); }catch(e){ console.warn('slimHerweeg mislukt:', e); }
  }, SLIM_HERWEEG_MS);
}

// ── NAMEN OP DE TELLERPLAAT ───────────────────────────────────────
// Vijf meters naast elkaar op een telefoon laten geen "Gaspedaal positie D"
// toe: die naam werd afgekapt tot "GASPEDAAL…" en dan wijst de plaat een
// signaal aan zonder te zeggen wélk. Afkorten doet hudShortLabel() al voor de
// HUD — op betekenis en niet op tekenaantal — dus dat is hier hergebruik en
// geen tweede lijst.
//
// Wat er wél bij moet is de garantie die de HUD niet nodig heeft: op één plaat
// mogen twee meters nooit dezelfde naam dragen. "Gaspedaal positie D" en
// "... E" korten allebei af tot "GASPED POS", en twee meters met één naam is
// precies wat #68 wilde oplossen. Bij een botsing valt de hele groep terug op
// de volledige naam: langer en lelijker, maar leesbaar verkeerd is erger dan
// lang. Dat de terugval de hele groep raakt en niet alleen de tweede is met
// opzet — twee meters waarvan er één afgekort is en één niet, lezen als twee
// verschillende soorten.
// De grens voor de plaat, gemeten en niet geraden (03-09-2026, #95). Bij zeven
// meters is een kolom 54px breed en staat de naam op 8,5px; de CSS geeft hem
// twee regels (-webkit-line-clamp:2). Alle 146 namen zijn in de draaiende app
// door hudShortLabel() gehaald en daarna opgemeten: tot en met dertien tekens
// past élke uitkomst binnen die twee regels, vanaf veertien vallen de eerste
// eruit (LAM DOELWAARDE, ETH PERCENTAGE, NOX DOSEERPOMP). Dertien is dus de
// ruimste grens die de plaat draagt — en dat is de helft meer dan de elf van
// de HUD-hoekmeter, die maar één regel heeft.
const SLIM_METER_MAX = 13;

function slimMeterLabels(pids){
  const uit={}, tel={};
  (pids||[]).forEach(function(pid){
    const d=getPidDef(pid); if(!d) return;
    if(((typeof slimGroep==='function')?slimGroep(pid,d):'rest')!=='meter') return;
    const naam=d.name||pid;
    let kort=naam;
    try{ if(typeof hudShortLabel==='function') kort=hudShortLabel(naam, SLIM_METER_MAX)||naam; }
    catch(e){ console.warn('hudShortLabel mislukt:', e); }
    uit[pid]=kort;
    (tel[kort]=tel[kort]||[]).push(pid);
  });
  Object.keys(tel).forEach(function(kort){
    if(tel[kort].length<2) return;
    tel[kort].forEach(function(pid){ const d=getPidDef(pid); uit[pid]=(d&&d.name)||pid; });
  });
  return uit;
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
  // OMHOOG MAG ALTIJD, OMLAAG ALLEEN BIJ DE HERWEGING. Die asymmetrie is met
  // opzet. Dat een signaal gáát bewegen, of op oranje springt, is nieuws en
  // hoort meteen zichtbaar te zijn: een auto die stilstond en nu rijdt heeft
  // een snelheid die niet in de rustige strook thuishoort, en die had daar bij
  // de herweging wél terechtkunnen komen. Andersom is het alleen opmaak, en
  // dan is een indeling die stilstaat meer waard. Zonder deze asymmetrie zou
  // een tegel die op de grens van "beweegt" balanceert heen en weer springen
  // tussen twee vakken, en dat is precies wat een scherm onleesbaar maakt.
  if(card && card.parentNode && card.parentNode.id==='slimVak-rustig'
     && (st!=='ok' || slimBeweegt(pid,d))) slimPlaats(pid);
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
  // De grafiek tekent zichzelf op een eigen klok (pidlane-graph.js, _grTik).
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
// De opslagsleutel bevát de ruwe VIN, dus hij hoort in geen enkele melding.
// Op 30-09-2026 stond "Geen profiel onder pl_vinprof_JMZ…507" voluit in een
// gedeeld logboek: #102 maskeerde de log()-regels, maar vier btDiag-regels
// met de sleutel erin vielen erbuiten. In een melding dus alleen de staart —
// dezelfde zes tekens die de app overal laat zien.
function _vinSleutelVoorLog(vin){ return 'pl_vinprof_…'+String(vin||'').toUpperCase().slice(-6); }

// async sinds 03-09-2026 (#102): de slotregel maskeert de VIN via
// _plVinVoorLog(), en dat is een SHA-256 en dus asynchroon. Alle opslag hierin
// gebeurt vóór de eerste await, dus de twee aanroepers — die het resultaat
// negeren — merken er niets van: een async functie loopt synchroon door tot
// het eerste await.
async function saveVinProfile(vin){
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
      try{ btDiag('setItem('+_vinSleutelVoorLog(vin)+') gooide niet, maar getItem geeft null','err'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
      return;
    }
    // Niet de ruwe VIN (#102) — deze regel belandt in de logbuffer en die
    // wordt integraal in het testrunverslag geëxporteerd. Zie pidlane-bt.js.
    log(`💾 Voertuigprofiel opgeslagen (${prof.pids.length} PIDs) voor …${String(vin).slice(-6)} (${await _plVinVoorLog(vin)})`,'ok');
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
    if(!raw){ btDiag('Geen profiel onder '+_vinSleutelVoorLog(vin)+' — volle discovery','warn'); return false; }
    const prof=JSON.parse(raw);
    if(!prof?.pids?.length){ btDiag('Profiel '+_vinSleutelVoorLog(vin)+' bevat geen PIDs — volle discovery','warn'); return false; }
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
    try{ btDiag('Profiel '+_vinSleutelVoorLog(vin)+' onbruikbaar: '+(e.message||e),'err'); }catch(_){ /* stil: melding mag nooit de stroom breken */ }
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
  if(typeof demoMode!=='undefined' && demoMode) return; // een demo-auto heeft geen dossier
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
