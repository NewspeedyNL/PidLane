// ══════════════════════════════════════════════════════════════════
// pidlane-demo.js
// Demo-modus
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// DEMO MODE
// ════════════════════════════════════════
// ── DEMO-VOERTUIGEN (benzine / diesel / hybride / elektrisch) ──
// Laat in demo-modus van brandstoftype wisselen zodat de PID-lijst én het
// gedrag (verbranding vs EV) realistisch meeverandert. Zo kun je brandstof-
// én EV-flows testen zonder echte adapter.
function demoPIDsForFuel(brandstof){
  const b=String(brandstof||'').toLowerCase();
  const benzine=['010C','010D','0104','0111','0149','010E','010B','010F','0110',
    '0105','015C','0146','012F','015E','0106','0107','010A',
    '0114','0124','0134','0115','0142','0143','0133','012C'];
  if(/elektr|electric|\bev\b|bev/.test(b)){
    // EV: geen verbrandings-PIDs. Snelheid, temps, 12V-spanning, accupakket.
    return ['010D','0146','0142','015B','0105','0143','0133'];
  }
  if(/hybr|phev|hev/.test(b)) return [...benzine,'015B']; // verbrandingsmotor + accupakket
  if(/diesel|gasolie/.test(b)) return benzine.filter(p=>!['0114','0124','0134','0115'].includes(p)); // geen breedband-lambda/O2
  return benzine; // benzine / lpg / cng / default
}
// → DEMO_VEHICLES verplaatst naar pidlane-data.js
function loadDemoVehicle(key){
  const dv=DEMO_VEHICLES[key]||DEMO_VEHICLES.benzine;
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) log('🚫 DEMO geactiveerd tijdens evaluatie — deze sessiedata is ongeldig','err'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  demoMode=true; connected=true; dataStable=true;
  plDemoAan();
  const pids=demoPIDsForFuel(dv.brandstof);
  supportedPIDs=new Set(pids);
  activePIDs.clear(); manualPIDs.clear();
  pids.slice(0,16).forEach(p=>{ activePIDs.add(p); manualPIDs.add(p); });
  buildDiscoveredPIDList();
  updateVehicleCard({merk:dv.merk,model:dv.model,year:dv.year,vin:dv.vin||''});
  vehicleInfo.brandstof=dv.brandstof; vehicleInfo.motor=dv.motor||'';
  buildPIDList();
  const cntEl=document.getElementById('pidCnt'); if(cntEl) cntEl.textContent=discoveredPIDDefs.length;
  try{ renderGauges(); rebuildGSel(); }catch(e){ console.warn('rebuildGSel mislukt:', e); }
  showVtag('DEMO — '+dv.merk+' '+dv.model);
  log('Demo-voertuig: '+dv.merk+' '+dv.model+' ('+dv.brandstof+') — '+pids.length+' PIDs','warn');
  startPoll();
  try{ initialHealthScan(); }catch(e){ console.warn('initialHealthScan mislukt:', e); }
  renderDemoBar();
}
/* De demo stopt (Verbreken, of een echte verbinding terwijl de demo nog
   liep): de demo-auto moet dan uit vehicleInfo. Anders loopt een echte auto
   die geen VIN geeft door als "Mazda CX-5" met de demo-VIN, en bewaart alles
   wat per auto bewaard wordt het onder die verzonnen auto. Aanroepen vóór
   demoMode=false, en alleen als demoMode aan stond. */
function plDemoStop(){
  vehicleInfo={ merk:'Onbekend', model:'', year:'', vin:'', brandstof:'', motor:'' };
  try{ resetVehicleSources(); }catch(e){ console.warn('Demo stoppen: voertuigbronnen niet geleegd — de demo-auto kan blijven doorwerken', e); }
  // De zandbak dicht: wat de demo schreef is weg, demorapporten ook.
  try{ if(window.PLDemo) PLDemo.stop(); }catch(e){ console.warn('Demo stoppen: zandbak niet gesloten — demowaarden kunnen tot het herladen blijven staan', e); }
  // Een demo zonder login (Play-reviewer, of wie nog geen account heeft)
  // eindigt op het loginscherm, niet op een verbindscherm achter de login.
  try{
    const ingelogd=!!(window.currentUser && (window.currentUser.user || window.currentUser.name));
    if(!ingelogd) setTimeout(()=>{ try{
      const c=document.getElementById('connOv'); if(c) c.classList.add('hidden');
      const lo=document.getElementById('loginOv'); if(lo) lo.classList.remove('hidden');
    }catch(e){ console.warn('Loginscherm niet teruggezet na de demo', e); } }, 50);
  }catch(e){ console.warn('Loginstand onleesbaar na de demo', e); }
}
/* Het ene punt waar elke demo begint: direct ná demoMode=true. Zet de
   zandbak aan en zegt één keer wat dat betekent. */
function plDemoAan(){
  const al=!!(window.PLDemo && PLDemo.stand().aan);
  try{ if(window.PLDemo) PLDemo.start(); }catch(e){ console.warn('Demo: zandbak niet aangezet — de losse demopoorten blijven de enige bescherming', e); }
  if(!al) try{ showToast?.('🧪 Demo — gesimuleerde verbinding. Er wordt niets bewaard.',3600); }catch(e){ console.warn('Demomelding niet getoond', e); }
}
function demoRefresh(){
  const sel=document.getElementById('demoVehSel');
  loadDemoVehicle(sel?sel.value:'benzine');
  showToast?.('PID-lijst ververst (demo) ✓',2200);
}
function renderDemoBar(){
  const bar=document.getElementById('demoBar'); if(!bar) return;
  bar.style.display=demoMode?'block':'none';
  const sel=document.getElementById('demoVehSel'); if(!sel) return;
  const b=String(vehicleInfo.brandstof||'').toLowerCase();
  let key='benzine';
  if(/elektr|electric|\bev\b|bev/.test(b)) key='elektrisch';
  else if(/hybr|phev|hev/.test(b)) key='hybride';
  else if(/diesel|gasolie/.test(b)) key='diesel';
  sel.value=key;
}

// ── Demo-garage: gezonde demo-auto's om uit te kiezen (of eigen kenteken) ──
// → DEMO_CARS verplaatst naar pidlane-data.js
function startDemo(){
  if(!featOn('feat_demo')){ showToast?.('Demo-modus is uitgeschakeld door beheerder'); return; }
  const apiVal=document.getElementById('startApiKey').value.trim();
  if(apiVal&&apiVal.startsWith('sk-ant-')){window.anthropicKey=apiVal;try{localStorage.setItem('ns_api_key',apiVal);}catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }updateApiPill();}
  openDemoCarChooser();   // eerst kiezen — niet automatisch één vaste auto
}
/* Je eigen auto('s) als demo-auto (29-09-2026). Een klant die niet in de
   auto zit, wil zíjn auto zien — met zijn rapporten, ritten en open punten
   ernaast — niet een Mazda van iemand anders. Bron: de actieve voertuigen uit
   Mijn voertuigen; zonder die het kenteken dat de app als "jouw auto" kent.
   Alleen lezen: in de demo gaat er niets terug naar het account. */
function _demoEigenAutos(){
  const uit=[];
  try{
    if(window.PLKlant && PLKlant.isKlant() && window.PLGarage && PLGarage.staat){
      const st=PLGarage.staat()||{};
      ((st.stand && st.stand.voertuigen)||[]).filter(v=>v && v.status==='actief').forEach(v=>uit.push({
        bron:'garage', merk:v.merk||'', model:v.model||'', year:String(v.bouwjaar||''), brandstof:v.brandstof||'',
        motortype:v.motor||'', naam:v.naam||'', kenteken:v.kenteken||'', vin:'', wmi:'', icon:'🚗'
      }));
    }
  }catch(e){ console.warn('Demo: eigen voertuigen niet leesbaar — de kiezer toont alleen de demo-auto\'s', e); }
  if(!uit.length){
    try{ const k=localStorage.getItem('pl_kenteken'); if(k) uit.push({ bron:'kenteken', kenteken:k }); }
    catch(e){ console.warn('Demo: bewaard kenteken onleesbaar', e); }
  }
  return uit;
}
function openDemoCarChooser(){
  let m=document.getElementById('demoCarModal');
  if(!m){
    m=document.createElement('div'); m.id='demoCarModal';
    m.style.cssText='position:fixed;inset:0;z-index:9750;background:rgba(10,14,23,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center';
    m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
    document.body.appendChild(m);
  }
  const knop=(onclick,icon,titel,sub)=>`
    <button onclick="${onclick}" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);cursor:pointer;margin-bottom:8px">
      <span style="font-size:22px">${icon}</span>
      <span style="flex:1"><b style="font-size:14px">${titel}</b><br><span style="font-size:11px;color:var(--tx3)">${sub}</span></span>
      <span style="color:var(--tx3)">›</span>
    </button>`;
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eigen=_demoEigenAutos();
  window._demoEigen=eigen;
  const eigenKaarten=eigen.map((c,i)=>c.bron==='garage'
    ? knop(`startDemoEigen(${i})`, c.icon, esc(c.naam||[c.merk,c.model].filter(Boolean).join(' ')||'Mijn voertuig'), esc([c.merk,c.model,c.year,c.brandstof].filter(Boolean).join(' · ')||'uit Mijn voertuigen'))
    : knop(`startDemoEigen(${i})`, '🚗', 'Mijn auto — '+esc(c.kenteken), 'Merk, model en brandstof uit het RDW')).join('');
  const cards=DEMO_CARS.map((c,i)=>knop(`startDemoCar(${i})`, c.icon, `${c.merk} ${c.model} ${c.year}`, `${c.motortype} · ${c.brandstof} · gezond ✅`)).join('');
  const kop=t=>`<div style="font-size:11px;font-weight:800;color:var(--tx2);margin:4px 0 6px">${t}</div>`;
  m.innerHTML=`<div style="background:var(--sur);width:100%;max-width:560px;max-height:90vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--bd)">
      <b style="font-size:14px">▷ Simuleer verbinding</b>
      <button onclick="document.getElementById('demoCarModal').style.display='none'" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);cursor:pointer">✕</button>
    </div>
    <div style="overflow-y:auto;padding:14px 16px calc(14px + var(--pl-sab))">
      <div style="font-size:12px;color:var(--tx2);line-height:1.5;margin-bottom:12px;padding:9px 11px;border-radius:10px;background:var(--pus,rgba(123,97,255,.1));border:1px solid var(--pu,#7b61ff)">
        🧪 Alles werkt zoals met een adapter: live meters, foutcodes, rit en rapport. <b>Er wordt niets bewaard</b> — geen rapport, geen rit, geen instelling. Je eigen voertuigen, rapporten en ritten kun je intussen gewoon bekijken.
      </div>
      ${eigen.length?kop('Jouw auto')+eigenKaarten:''}
      ${kop('Of een voorbeeldauto')}
      ${cards}
      <div style="border-top:1px solid var(--bd);margin:12px 0 10px"></div>
      ${kop('Of een ander kenteken (RDW)')}
      <div style="display:flex;gap:8px">
        <input id="demoKentInput" placeholder="bv. KF660K" maxlength="8" style="flex:1;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:9px;color:var(--tx);font-family:var(--f);font-size:14px;padding:10px 12px;text-transform:uppercase">
        <button onclick="startDemoKenteken()" style="padding:10px 16px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer">Start</button>
      </div>
      ${window.PLZonder?`<button onclick="document.getElementById('demoCarModal').style.display='none';PLZonder.verder()" style="margin-top:14px;width:100%;padding:10px;border-radius:10px;border:1px dashed var(--bd);background:none;color:var(--tx2);font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">Liever niets simuleren? Kenteken-check, foutcodes en je gegevens zonder adapter →</button>`:''}
    </div>
  </div>`;
  m.style.display='flex';
}
function startDemoEigen(i){
  const c=(window._demoEigen||[])[i]; if(!c) return;
  const m=document.getElementById('demoCarModal'); if(m) m.style.display='none';
  if(c.bron==='kenteken'){ _startDemoCore(null, String(c.kenteken).toUpperCase().replace(/[^A-Z0-9]/g,'')); return; }
  _startDemoCore(c, null);
}
function startDemoCar(i){
  const m=document.getElementById('demoCarModal'); if(m) m.style.display='none';
  _startDemoCore(DEMO_CARS[i]||DEMO_CARS[0], null);
}
function startDemoKenteken(){
  const kent=((document.getElementById('demoKentInput')||{}).value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!kent){ showToast?.('Vul een kenteken in'); return; }
  const m=document.getElementById('demoCarModal'); if(m) m.style.display='none';
  _startDemoCore(null, kent);
}
function _startDemoCore(car, kent){
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) log('🚫 DEMO geactiveerd tijdens evaluatie — deze sessiedata is ongeldig','err'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  demoMode=true; connected=true; dataStable=true;
  plDemoAan();
  closeConnOv();
  resetToStep1();
  setConn(true);

  const demoVin = car
    ? { merk:car.merk, model:car.model, year:car.year, vin:car.vin, wmi:car.wmi, motortype:car.motortype, brandstof:car.brandstof }
    : { merk:'Onbekend', model:'', year:'', vin:'', wmi:'', motortype:'', brandstof:'' };
  vehicleInfo=demoVin;
  // Merge-laag voeden: normalisatie + fantoomfilter (purge bij brandstof) draaien
  // direct mee — dus een diesel-demo toont diesel-sensoren, benzine niet, enz.
  try{ resetVehicleSources(); mergeVehicleData('vin', { merk:demoVin.merk, model:demoVin.model, year:demoVin.year, brandstof:demoVin.brandstof }); }catch(e){ console.warn('mergeVehicleData mislukt:', e); }

  // De sensoren bij de brandstof van déze demo-auto (29-09-2026). Tot dan
  // kreeg elke auto de lijst van een Mazda CX-5 benzine: een diesel-demo had
  // lambdasondes, een elektrische een toerental. Een kentekendemo kent de
  // brandstof pas na het RDW; tot dan geldt benzine, en het fantoomfilter van
  // mergeVehicleData() haalt weg wat niet past zodra de brandstof binnen is.
  const demoPIDs=demoPIDsForFuel(demoVin.brandstof);
  supportedPIDs=new Set(demoPIDs);
  buildDiscoveredPIDList();

  updateVehicleCard(demoVin);
  const _eigen=!!(car && car.bron==='garage');
  const _dNaam=(_eigen && car.naam) || [demoVin.merk,demoVin.model,demoVin.year].filter(Boolean).join(' ')||'demo-auto';
  showVtag('DEMO — '+_dNaam);
  log('Demo modus — '+_dNaam+(demoVin.motortype?(' '+demoVin.motortype):'')+' gesimuleerd','warn');

  // Toon auto info in welcome title
  document.getElementById('welcomeTitle').textContent = kent ? ('Simulatie met kenteken '+kent) : (_dNaam+(_eigen?' — gesimuleerd':' herkend ✅'));

  // Selecteer een uitgebreide standaard set voor directe weergave
  [
    '010C','010D','0105','0142',  // Motor essentials
    '012F','015E','0104','0111',  // Brandstof & belasting
    '0106','0107','0110','010F',  // Brandstoftrim & MAF
    '015C','0114','0124','010B','0146',  // Temp, O2 smalband+breedband, druk
  ].filter(pid=>supportedPIDs.has(pid)).forEach(pid=>{ activePIDs.add(pid); manualPIDs.add(pid); });

  buildPIDList();
  document.getElementById('pidCnt').textContent=discoveredPIDDefs.length;
  renderGauges(); rebuildGSel();
  startPoll();
  // Demo: markeer alles gezond + toon connectie-status (geen popup nodig)
  initialHealthScan();
  measureConnSpeed().then(sp=>{ applyStrategy(suggestStrategy(sp)); });
  renderDemoBar();
  showWelcome(demoVin);

  // Kenteken als demo-auto: echte RDW-opzoeking vult merk/model/brandstof in
  // en het fantoomfilter draait mee — net als bij een echte verbinding.
  // Het kenteken gaat alleen het invoerveld in, niet in pl_kenteken: dat is
  // de sleutel van je eigen auto (voertuigoverzicht, koopcheck).
  if(kent){
    setTimeout(()=>{ try{
      const i=document.getElementById('kentInput'); if(i) i.value=kent;
      rdwLookup(false);
    }catch(e){ console.warn('rdwLookup mislukt:', e); } }, 300);
  }
}

/* ── Demo starten vanaf het LOGINSCHERM ──────────────────────────────
   Toegevoegd 21-08-2026 voor Play Store-blokkade 3 ("minimum
   functionality"). Een reviewer heeft geen auto, geen OBD2-adapter en
   geen account. Zag hij alleen een loginformulier, dan las dat als een
   app die niet te beoordelen valt — en dat is een afwijzing waar je
   weken op wacht.

   Wat deze functie NIET doet: inloggen. Er wordt geen sessie gezet, geen
   token bewaard, geen rol toegekend. AI-analyse loopt via de worker en
   die vraagt een geldig sessietoken, dus die blijft dicht. Wat er open
   gaat is precies wat de demo altijd al was: gesimuleerde sensordata en
   de schermen eromheen.

   De volgorde is bewust. Eerst het loginscherm wegdoen met dezelfde
   overgang als finishLogin() gebruikt (de golfachtergrond blijft staan,
   anders knippert het), en pas daarna de auto-kiezer openen. Andersom
   verschijnt de kiezer óver het loginformulier en zie je het formulier
   er nog doorheen staan. */
function plDemoZonderLogin(){
  if(typeof featOn==='function' && !featOn('feat_demo')){
    showToast?.('Demo-modus is uitgeschakeld door beheerder'); return;
  }
  try{
    const lo=document.getElementById('loginOv');
    if(lo){
      lo.classList.add('lg-leave');
      setTimeout(()=>{ try{ lo.classList.add('hidden'); lo.classList.remove('lg-leave'); }catch(e){ /* stil: element kan al weg zijn of ondersteunt dit niet */ } }, 260);
    }
  }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  try{ btDiag('Demo gestart vanaf het loginscherm (geen sessie)','info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  setTimeout(()=>{ try{ openDemoCarChooser(); }catch(e){ showToast?.('Demo kon niet starten'); } }, 300);
}
window.plDemoZonderLogin = plDemoZonderLogin;

/* ══════════════════════════════════════════════════════════════════
   PLDemo — DE ZANDBAK: in de demo wordt niets bewaard (29-09-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM EEN MECHANISME EN GEEN LIJST
   test-demoopslag.js telt negen plekken die op 28-09 elk een eigen
   `if(demoMode) return` kregen: dossier, profiel, roetfilterteller,
   voertuigoverzicht, diagnosecache, selectie, versnellingsmodel, logregels,
   vehicleInfo. Die negen kloppen. Maar de tiende module die iets bewaart,
   weet niet dat ze bestaan — en dat is precies de vorm waarin het oude §11
   en PIDLANE-WERK.md de kop kostten: een lijst die bijgehouden moet worden.

   De zandbak doet het op het ene punt waar alles langskomt:
     • localStorage — setItem/removeItem/clear gaan tijdens de demo naar een
       laag in het geheugen. Lezen ziet eerst die laag, dan de echte opslag.
       De demo WERKT dus (wat je instelt blijft staan zolang de demo loopt),
       en bij het stoppen is de laag weg. Alleen DOORLAAT gaat echt: inloggen
       hoort bij het account, niet bij de demo-auto.
     • het net — plFetch() vraagt netBesluit(). Het klantplatform mag in de
       demo LEZEN (je eigen voertuigen, rapporten, ritten en open punten
       bekijken is juist het punt), niet schrijven. De AI, het inwisselen van
       tegoed en de referentiemetingen gaan niet de deur uit.
     • de AI — apiFetch() geeft een voorbeeldrapport terug uit de gesimuleerde
       waarden: zo ziet een rapport eruit, zonder tegoed en zonder dat er een
       rapport over een verzonnen auto ergens terechtkomt.
     • bestanden — plBewaarBestand() weigert in de demo.
     • het rapportenoverzicht — een demorapport draagt `demo` en verdwijnt
       bij het stoppen.

   De negen losse poorten blijven staan: ze zijn de eerste lijn, en ze
   houden de demo ook uit sessionStorage, IndexedDB en de server. Dit is de
   tweede lijn, die de volgende vergeten poort vangt.

   ALLEEN TUSSEN aan() EN uit(), EN ALLEEN ALS demoMode AAN STAAT
   Beide voorwaarden, met opzet. Zet iets demoMode uit zonder plDemoStop()
   (een pad dat nog niemand kent), dan gaat de opslag gewoon weer door naar
   het echte toestel: liever een demowaarde te veel bewaard dan een echte
   instelling stil in een laag die straks weggegooid wordt. En een browser-
   proef die demoMode met de hand aanzet, merkt van de zandbak niets.

   Test: test-demozandbak.js (laadt dit bestand, niet een kopie).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Gaat ook in de demo echt naar het toestel: de sessie en de sleutel van
  // wie er inlogt. Niets dat over een auto gaat.
  // pl_tok (TOK_KEY) en pl_uitloggen (UITLOG_KEY) in pidlane-auth.js stonden
  // hier tot 01-10-2026 niet bij: uitloggen tijdens de demo wiste het
  // sessietoken alleen in de laag, plDemoStop() gooide die weg, en bij de
  // volgende start was je weer ingelogd. test-demozandbak.js legt deze lijst
  // naast de sleutels die pidlane-auth.js echt gebruikt.
  var DOORLAAT = ['pl_session', 'pl_sessie', 'pl_tok', 'pl_uitloggen', 'ns_api_key'];

  // /klant/platform: de acties die alleen lezen. worker.js (KP_ACTIES) is de
  // bron; test-demozandbak.js legt deze lijst ernaast en eist dat geen van
  // deze acties INSERT, UPDATE of DELETE bevat.
  var LEES_ACTIES = ['stand', 'rapporten', 'rapport', 'ritten', 'issues', 'pidbib_lijst', 'voorkeuren'];

  // Paden die in de demo nooit de deur uit gaan, met de reden erbij.
  var WEIGER = [
    { re: /^\/v1\/messages\b/, reden: 'de AI rekent niet op een verzonnen auto' },
    { re: /^\/credits\//, reden: 'tegoed inwisselen hoort niet bij een demo' },
    { re: /\/airtable\/veldlab\b/, reden: 'een demo is geen referentiemeting' },
    { re: /\/airtable\/log\b/, reden: 'de logregels van een verzonnen auto horen niet tussen echte ritten (#360)' }
  ];

  function isDemo() {
    try { return typeof demoMode !== 'undefined' && !!demoMode; }
    catch (e) { console.warn('PLDemo: demoMode onleesbaar — de zandbak laat alles door', e); return false; }
  }

  /* Puur. Mag dit verzoek in de demo naar buiten? 'door' of de reden van nee.
     `pad` zoals plFetch hem krijgt (relatief of absoluut), `opties` met json
     of body. */
  function netBesluit(pad, opties) {
    var p = String(pad || '');
    try { p = p.replace(/^https?:\/\/[^/]+/i, ''); } catch (e) { console.warn('PLDemo: pad niet te ontleden', e); }
    for (var i = 0; i < WEIGER.length; i++) if (WEIGER[i].re.test(p)) return WEIGER[i].reden;
    if (/^\/klant\/platform\b/.test(p)) {
      var o = opties || {}, actie = '';
      if (o.json && typeof o.json === 'object') actie = String(o.json.actie || '');
      else if (typeof o.body === 'string') { try { actie = String((JSON.parse(o.body) || {}).actie || ''); } catch (e) { actie = ''; } }
      return LEES_ACTIES.indexOf(actie) >= 0 ? 'door' : 'in de demo wordt niets in je account bewaard (' + (actie || 'onbekende actie') + ')';
    }
    return 'door';
  }

  function doorlaat(k) { return DOORLAAT.indexOf(String(k)) >= 0; }

  /* De laag. `echt` = de originele Storage-methoden, `opslag` = het object
     waarvoor de laag geldt (localStorage), `actief()` = mag hij nu vangen.
     Geeft de vier vervangers terug; puur genoeg om met een nep-Storage te
     toetsen. */
  function maakLaag(echt, opslag, actief) {
    var laag = new Map();   // sleutel → tekst, of null = in de demo verwijderd
    var telling = { geschreven: 0 };
    function vangt(self, k) { return self === opslag && actief() && (k === undefined || !doorlaat(k)); }
    return {
      laag: laag, telling: telling,
      getItem: function (k) {
        if (vangt(this, k) && laag.has(String(k))) return laag.get(String(k));
        return echt.getItem.apply(this, arguments);
      },
      setItem: function (k, v) {
        if (vangt(this, k)) { laag.set(String(k), String(v)); telling.geschreven++; return; }
        return echt.setItem.apply(this, arguments);
      },
      removeItem: function (k) {
        if (vangt(this, k)) { laag.set(String(k), null); return; }
        return echt.removeItem.apply(this, arguments);
      },
      clear: function () {
        if (!vangt(this)) return echt.clear.apply(this, arguments);
        // Alles als verwijderd markeren, behalve wat door mag.
        var n = 0;
        try { n = this.length; } catch (e) { console.warn('PLDemo: opslaglengte onleesbaar', e); }
        for (var i = 0; i < n; i++) {
          var k = echt.key ? echt.key.call(this, i) : null;
          if (k != null && !doorlaat(k)) laag.set(k, null);
        }
        laag.forEach(function (v, k) { laag.set(k, null); });
      }
    };
  }

  var _zb = null;   // { proto, echt, laag }
  var METHODEN = ['getItem', 'setItem', 'removeItem', 'clear'];

  function aan() {
    if (_zb) return true;   // wisselen van demo-auto: dezelfde demo, dezelfde laag
    var P, ls;
    try { P = window.Storage && window.Storage.prototype; ls = window.localStorage; }
    catch (e) { console.warn('PLDemo: geen localStorage — de zandbak staat niet aan (en er valt ook niets te bewaren)', e); return false; }
    if (!P || !ls) { console.warn('PLDemo: Storage ontbreekt — de zandbak staat niet aan'); return false; }
    var echt = { key: P.key };
    METHODEN.forEach(function (m) { echt[m] = P[m]; });
    var laag = maakLaag(echt, ls, isDemo);
    METHODEN.forEach(function (m) { P[m] = laag[m]; });
    _zb = { proto: P, echt: echt, laag: laag };
    return true;
  }

  function uit() {
    if (!_zb) return 0;
    var n = _zb.laag.telling.geschreven;
    var P = _zb.proto, echt = _zb.echt;
    METHODEN.forEach(function (m) { P[m] = echt[m]; });
    _zb = null;
    return n;
  }

  function stand() {
    return { aan: !!_zb, demo: isDemo(), inLaag: _zb ? _zb.laag.laag.size : 0, geschreven: _zb ? _zb.laag.telling.geschreven : 0 };
  }

  function naam(p) {
    try { var d = (typeof getPidDef === 'function') ? getPidDef(p) : null; return (d && (d.naam || d.name || d.n)) || p; }
    catch (e) { return p; }
  }
  function eenheid(p) {
    try { var d = (typeof getPidDef === 'function') ? getPidDef(p) : null; return (d && (d.unit || d.eenheid || d.u)) || ''; }
    catch (e) { return ''; }
  }

  /* Puur. Het voorbeeldrapport uit wat de demo op dit moment meet. */
  function voorbeeldTekst(vi, waarden, metZoektool) {
    vi = vi || {};
    var auto = [vi.merk, vi.model, vi.year].filter(function (x) { return x && x !== 'Onbekend'; }).join(' ') || 'de demo-auto';
    var L = [
      '🧪 VOORBEELDRAPPORT — DEMO',
      '',
      'Dit is geen echte analyse. In de demo gaat er niets naar de AI, kost het geen tegoed en wordt dit rapport nergens bewaard.',
      '',
      'Voertuig: ' + auto + (vi.brandstof ? ' (' + vi.brandstof + ')' : '') + ' — gesimuleerd'
    ];
    if (metZoektool) {
      L.push('', 'Online zoeken naar leescodes gebeurt alleen in een echte sessie, met je eigen auto aan de adapter.');
      return L.join('\n');
    }
    var regels = (waarden || []).filter(function (w) { return typeof w.waarde === 'number' && isFinite(w.waarde); }).slice(0, 12);
    if (regels.length) {
      L.push('', 'Gemeten waarden (gesimuleerd):');
      regels.forEach(function (w) {
        var v = Math.abs(w.waarde) >= 100 ? Math.round(w.waarde) : Math.round(w.waarde * 10) / 10;
        L.push('• ' + w.naam + ': ' + String(v).replace('.', ',') + (w.eenheid ? ' ' + w.eenheid : ''));
      });
    }
    L.push('',
      'Oordeel: 🟢 Geen urgente problemen gevonden — de demo-auto is gezond.',
      '',
      'Zo werkt het in een echte sessie: de AI-monteur legt elke sensor naast de referentie die bij de toestand hoort (koud of warm, stationair of rijdend), noemt wat opvalt met de gemeten waarde erbij, geeft mogelijke oorzaken en een concreet advies. Het rapport komt bij je voertuig in Mijn voertuigen.');
    return L.join('\n');
  }

  async function aiVoorbeeld(prompt, extra) {
    var vi = {}, w = [];
    try { if (typeof vehicleInfo !== 'undefined' && vehicleInfo) vi = vehicleInfo; } catch (e) { console.warn('PLDemo: voertuig onleesbaar voor het voorbeeldrapport', e); }
    try {
      if (typeof pidVals !== 'undefined' && pidVals) Object.keys(pidVals).forEach(function (p) { w.push({ pid: p, naam: naam(p), eenheid: eenheid(p), waarde: pidVals[p] }); });
    } catch (e) { console.warn('PLDemo: meetwaarden onleesbaar voor het voorbeeldrapport', e); }
    try { if (typeof aiBusyBegin === 'function') aiBusyBegin(); } catch (e) { console.warn('PLDemo: bezig-teken niet gezet', e); }
    try {
      await new Promise(function (r) { setTimeout(r, 900); });   // een rapport dat er meteen staat, leest als een fout
      return voorbeeldTekst(vi, w, !!(extra && Array.isArray(extra.tools) && extra.tools.length));
    } finally {
      try { if (typeof aiBusyEnd === 'function') aiBusyEnd(); } catch (e) { console.warn('PLDemo: bezig-teken niet weggehaald', e); }
    }
  }

  function weigerAntwoord(reden) {
    var tekst = 'Demo: ' + reden;
    try { if (typeof btDiag === 'function') btDiag('Demo-zandbak: verzoek niet verstuurd — ' + reden, 'info'); } catch (e) { console.warn('PLDemo: melding niet gelogd', e); }
    return new Response(JSON.stringify({ ok: false, demo: true, error: tekst }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  /* Bij het begin en het eind van elke demo. start() vanuit plDemoAan(),
     stop() vanuit plDemoStop() — de twee plekken waar elke demo langskomt. */
  function start() {
    var ok = aan();
    try { if (typeof btDiag === 'function') btDiag('Demo-zandbak ' + (ok ? 'aan: er wordt niets bewaard' : 'NIET aan — opslag onbereikbaar'), ok ? 'info' : 'warn'); }
    catch (e) { console.warn('PLDemo: melding niet gelogd', e); }
    return ok;
  }
  function stop() {
    var n = uit();
    // Demorapporten uit het overzicht: ze gingen over een verzonnen auto.
    try {
      var l = window._sessionReports;
      if (Array.isArray(l)) for (var i = l.length - 1; i >= 0; i--) if (l[i] && l[i].demo) l.splice(i, 1);
      if (typeof _srUpdateBadge === 'function') _srUpdateBadge();
    } catch (e) { console.warn('PLDemo: demorapporten niet uit het overzicht gehaald', e); }
    try { if (typeof btDiag === 'function') btDiag('Demo-zandbak uit: ' + n + ' schrijfactie(s) weggegooid', 'info'); }
    catch (e) { console.warn('PLDemo: melding niet gelogd', e); }
    return n;
  }

  window.PLDemo = {
    actief: isDemo,
    start: start,
    stop: stop,
    stand: stand,
    netBesluit: netBesluit,
    weigerAntwoord: weigerAntwoord,
    aiVoorbeeld: aiVoorbeeld,
    _kern: { netBesluit: netBesluit, maakLaag: maakLaag, voorbeeldTekst: voorbeeldTekst, aan: aan, uit: uit, DOORLAAT: DOORLAAT, LEES_ACTIES: LEES_ACTIES }
  };
})();
