// ══════════════════════════════════════════════════════════════════
// pidlane-datalog.js
// Datalog, validatie/smoothing, API-sleutel, protocolkeuze
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// 3-LAAGS DATA VALIDATIE & FILTERING
// ════════════════════════════════════════
let outlierCount={};

/* DE TRAGE SIGNALEN. Eén lijst, één betekenis: dit zijn de PIDs waarvan de
   waarde van nature langzaam beweegt. Snelle signalen (EVAP-klep 0↔100%,
   O2-sensoren die bewust oscilleren, lambda-doel dat naar 2.0 springt bij
   brandstofafsluiting, gas/pedaal, belasting, toeren) springen van nature.

   HIER STOND EEN SPIKE-FILTER ACHTER, EN DIE IS OP 10-09-2026 WEGGEHAALD.
   ───────────────────────────────────────────────────────────────────
   De lijst droeg suffixen ('05') terwijl `FILTERED_PIDS.has(pid)` de volledige
   pid kreeg ('0105'), vanaf de éérste commit in deze repo. Laag 2 (spike-filter)
   en laag 3 (smoothing) hebben dus nooit één keer gedraaid. Op 09-09 is die
   sleutelvorm gelijkgetrokken (#158) en stonden ze een dag aan; wat dat deed
   staat in §11 van PIDLANE.md. De korte versie:

   - Laag 2 was inert op zeven van de negen. Koelwater vuurt pas bij een sprong
     van 89,3 °C of 26,8 °C van het gemiddelde; de rit van 09-09 bewoog 5 °C in
     tien minuten. In vier minuten over 31 sensoren sloeg hij één keer aan, en
     dat was de testrun die er zelf 200 °C in duwde.
   - Op accuspanning was hij níét inert, en juist daar verkeerd: drempel 0,8 V
     tegen een gemeten ritswing van 2,76 V. Dat gooit echte spanningsdips weg.
   - En weggooien betekent hier iets ergers dan het klinkt. De meetlus doet
     `if(r!=null){...} else markPidNoData(pid)`, dus een gefilterde waarde wordt
     geboekt als NO DATA van de ECU: geen stempel, een gat in de reeks, en via
     de kwaliteitsscore uiteindelijk pidOpruimen(). Een filter dat een echte
     meting weggooit is dan niet te onderscheiden van een dode bus — precies de
     verwarring waar #133 over gaat.
   - Laag 3 middelde over twee metingen. Koelwater komt als hele graden van de
     ECU (A−40); de app sloeg daarna 89,5 op, een waarde die de sensor niet kán
     geven. Dat is meetgetrouwheid inleveren voor ruisonderdrukking die op een
     signaal met 5 °C bereik niets te onderdrukken had.

   Laag 1 en 1b blijven staan: die doen wél iets, en het goede.

   DE LIJST ZELF BLIJFT, want pidlane-fuel.js gebruikt hem los van dit bestand
   om trage van dynamische sensoren te scheiden. Dat is zijn enige lezer nu,
   en de volledige pid is daar de goede vorm — een suffix is dubbelzinnig over
   modes heen ('05' is zowel 0105 als 0205 uit een freeze frame). */
const FILTERED_PIDS=new Set([
  '0105', // koelwatertemperatuur
  '010F', // inlaatluchttemperatuur
  '0146', // buitentemperatuur
  '015C', // olietemperatuur
  '012F', // brandstofpeil
  '0142', // accuspanning (ECU)
  '0133', // barometerdruk
  '0107','0109' // brandstoftrim lang B1/B2
]);
function validateAndSmooth(pid,rawVal){
  if(rawVal===null||rawVal===undefined||isNaN(rawVal)) return null;
  // Fix 15-07: centrale getPidDef() (dekt ook PIDS-lijst en 0164+) — zelfde
  // uniformering als isPIDOk/isPIDOkVal, zodat het spike-filter en de
  // bereik-check voor élke PID dezelfde definitie zien.
  const def=(typeof getPidDef==='function'?getPidDef(pid):null)||discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
  const lim=PID_HARD_LIMITS[pid];

  // LAAG 1 — Harde fysieke limieten (geldt voor álle PIDs)
  if(lim&&(rawVal<lim.min||rawVal>lim.max)){
    const msg=`${def?.name||pid}: ${rawVal}${def?.unit||''} buiten fysiek bereik (${lim.min}–${lim.max})`;
    log(`⚠ ${msg}`,'warn');
    logToSheets('outlier',msg,{pid,value:rawVal,reason:'hard_limit'});
    markOutlier(pid,rawVal,'limiet'); return null;
  }

  /* LAAG 1b — OPVALLEND MAAR ECHT.
     Laag 1 gooit weg; deze laag doet dat juist niet. Waarden die buiten het
     gebruikelijke bereik vallen maar binnen de natuurkunde blijven, zijn vaak
     precies de metingen waarvoor je de PID leest — sterke terugregeling van
     de ontsteking bijvoorbeeld. Die weggooien maakt een gemiddelde mooier dan
     de motor is. Dus: melden, onthouden, doorlaten. */
  const letop=(typeof PID_LET_OP!=='undefined')?PID_LET_OP[pid]:null;
  if(letop&&(rawVal<letop.min||rawVal>letop.max)){
    const lo=window._pidLetOp=window._pidLetOp||{};
    const eerder=lo[pid];
    lo[pid]={laatst:rawVal, t:Date.now(), n:((eerder&&eerder.n)||0)+1,
             uiterste: eerder ? (Math.abs(rawVal)>Math.abs(eerder.uiterste)?rawVal:eerder.uiterste) : rawVal,
             waarom: letop.waarom};
    // Hooguit één regel per PID per 30 s — zelfde aanpak als de spike-melding
    // hieronder, anders loopt de log vol tijdens een koude start.
    const lw=window._letOpGelogd=window._letOpGelogd||{};
    if(!lw[pid]||Date.now()-lw[pid]>30000){
      lw[pid]=Date.now();
      const m=`${def?.name||pid}: ${rawVal}${def?.unit||''} buiten het gebruikelijke bereik `+
              `(${letop.min}–${letop.max}) — ${letop.waarom}. Meting blijft staan.`;
      // Ruwe bytes erbij als we ze hebben. Op 16-08 meldde de app vijf keer een
      // diep-negatieve ontstekingstiming, maar het BT-log is een rolbuffer van
      // 300 regels en die momenten waren er allang uit — niet na te trekken of
      // het echte klopregeling was of een verkeerd gesplitste batch. Eén woord
      // extra in deze regel maakt dat verschil voortaan zichtbaar.
      let ruw='';
      try{ const r=(window._pidRuw||{})[pid]; if(r) ruw=`  [ruw: ${r}]`; }catch(e){ /* stil: window._pidRuw kan nog leeg zijn */ }
      log(`ℹ ${m}${ruw}`,'info');
      try{ logToSheets('opvallend',m,{pid,value:rawVal,reason:'let_op'}); }catch(e){ console.warn('logToSheets mislukt:', e); }
    }
    // bewust GEEN markOutlier en GEEN return: de waarde loopt gewoon door.
  }

  /* EN DAT IS ALLES. Hier stond laag 2 (spike-filter met bevestiging) en laag
     3 (gemiddelde over twee metingen); ze zijn op 10-09-2026 weggehaald met de
     reden bij FILTERED_PIDS hierboven en de meting in §11 van PIDLANE.md.

     Wat de app teruggeeft is nu wat de ECU zei, afgerond op twee decimalen.
     Voor een diagnose-app is dat de bedoeling: een meting die de sensor niet
     kán produceren is geen verbetering, en een echte uitschieter is juist het
     signaal waarvoor je de PID leest. Laag 1 houdt tegen wat natuurkundig niet
     kan, laag 1b meldt wat opvalt en laat het staan. */
  return Math.round(rawVal*100)/100;
}

function markOutlier(pid,val,reason){
  if(!outlierCount[pid]) outlierCount[pid]=0;
  outlierCount[pid]++;
  const card=document.getElementById('gc-'+pid);
  if(card){
    let ob=card.querySelector('.outlier-badge');
    if(!ob){ob=document.createElement('div');ob.style.cssText='position:absolute;bottom:5px;right:5px;font-size:7px;font-weight:700;background:var(--ors);color:var(--or);padding:1px 4px;border-radius:3px;';card.appendChild(ob);}
    ob.textContent=`⚠ ${outlierCount[pid]}x`;
    ob.title=`Laatste gefilterd: ${fv(val)} — reden: ${reason}`;
  }
}

function checkStability(pid,val){
  if(!stabilityCount[pid]) stabilityCount[pid]=0;
  stabilityCount[pid]++;
  if(!dataStable){
    // FIX B: niet meer "ALLE PIDs ≥5" (bleef hangen op trage temp-PIDs),
    // maar ≥70% van de actieve PIDs stabiel. Plus harde timeout-fallback
    // van 12s (_stabilityT0) zodat de UI nooit eeuwig op "stabiliseert" blijft.
    const act=[...activePIDs];
    if(act.length){
      if(!window._stabilityT0) window._stabilityT0=Date.now();
      const stabielN=act.filter(p=>(stabilityCount[p]||0)>=5).length;
      const ratio=stabielN/act.length;
      const timedOut=(Date.now()-window._stabilityT0)>12000;
      if((ratio>=0.7 || timedOut) && activePIDs.size>0){
        dataStable=true;
        const stEl=document.getElementById('stxt'); if(stEl) stEl.textContent='Verbonden ✅';
        log(timedOut
          ? `✅ Data stabiel (timeout, ${stabielN}/${act.length} PIDs) — AI analyse beschikbaar`
          : `✅ Data stabiel (${stabielN}/${act.length} PIDs) — AI analyse beschikbaar`,'ok');
        logToSheets('info','Data stabiel',{pidCount:activePIDs.size,stabiel:stabielN,timeout:timedOut});
        const c=document.getElementById('aiContent');
        if(c&&c.querySelector('.ai-ph')) c.innerHTML=`<div class="ai-ph"><div class="pi">✅</div><p>Data stabiel en gevalideerd.<br><br>Druk op <strong>📊 AI Datalog</strong> voor een diepgaande analyse op basis van 20 seconden meting.<br>Of gebruik <strong>Snelle AI analyse</strong> voor directe momentopname.</p></div>`;
      }
    }
  }
}

// ════════════════════════════════════════
// DATALOG — 20 seconden opnemen voor AI
// ════════════════════════════════════════
let datalogActive=false,datalogBuffer={},datalogStart=null;
const DATALOG_DURATION=20000;
let datalogCountdownTimer=null, datalogStopTimer=null;

function startDatalog(){
  if(!connected){log('Verbind eerst een adapter','warn');return;}
  if(datalogActive) return;
  ensurePIDsActive('rit'); // async: zet rit-sensoren aan, buffer vult vanzelf
  if(!activePIDs.size){log('Selecteer eerst sensoren links','warn');return;}
  datalogActive=true; datalogBuffer={}; datalogStart=Date.now();
  activePIDs.forEach(pid=>{datalogBuffer[pid]=[];});
  log('📊 Datalog gestart — 20 seconden meten...','info');
  const btn=document.getElementById('aiBtn');
  btn.textContent='⏺ Opnemen... 20s';
  btn.style.background='linear-gradient(135deg,#e53e3e,#c53030)';
  // Countdown
  let sec=20;
  if(datalogCountdownTimer) clearInterval(datalogCountdownTimer);
  datalogCountdownTimer=setInterval(()=>{
    sec--;
    if(sec<=0){clearInterval(datalogCountdownTimer);datalogCountdownTimer=null;return;}
    const b=document.getElementById('aiBtn');
    if(b) b.textContent=`⏺ Opnemen... ${sec}s`;
  },1000);
  if(datalogStopTimer) clearTimeout(datalogStopTimer);
  datalogStopTimer=setTimeout(()=>{datalogStopTimer=null;if(datalogCountdownTimer){clearInterval(datalogCountdownTimer);datalogCountdownTimer=null;}stopDatalog();},DATALOG_DURATION);
}

function feedDatalog(pid,val){
  if(!datalogActive||!datalogBuffer[pid]) return;
  datalogBuffer[pid].push({t:Date.now()-datalogStart,v:val});
}

function stopDatalog(){
  datalogActive=false;
  if(datalogCountdownTimer){ clearInterval(datalogCountdownTimer); datalogCountdownTimer=null; }
  if(datalogStopTimer){ clearTimeout(datalogStopTimer); datalogStopTimer=null; }
  const btn=document.getElementById('aiBtn');
  btn.textContent='🔬 Snelle AI analyse';
  btn.style.background='';
  log(`📊 Datalog klaar — analyseren...`,'ok');
  runDatalogAI();
}

function getDatalogStats(){
  const stats={};
  Object.entries(datalogBuffer).forEach(([pid,readings])=>{
    if(!readings.length) return;
    const vals=readings.map(r=>r.v);
    const min=Math.min(...vals),max=Math.max(...vals);
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const first=vals.slice(0,Math.ceil(vals.length/4)).reduce((a,b)=>a+b,0)/Math.ceil(vals.length/4);
    const last=vals.slice(-Math.ceil(vals.length/4)).reduce((a,b)=>a+b,0)/Math.ceil(vals.length/4);
    const trendPct=((last-first)/Math.max(Math.abs(first),.001))*100;
    const trend=trendPct>8?'↑ stijgend':trendPct<-8?'↓ dalend':'→ stabiel';
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    stats[pid]={name:def?.name||pid,unit:def?.unit||'',min,max,avg,trend,count:vals.length,trendPct};
  });
  return stats;
}

async function runDatalogAI(){
  if(!(await plVraagMeting('normaal','de datalog-analyse','basis'))) return;
  activateAIPane();
  const stats=getDatalogStats();
  if(!Object.keys(stats).length){
    log('Geen datalog data beschikbaar','warn');
    document.getElementById('aiBtn').disabled=false;
    return;
  }
  const v=getVehicle();
  const statLines=Object.values(stats).map(s=>
    `• ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}, trend=${s.trend} (${s.count} metingen)`
  ).join('\n');
  // Datalog is al 3-laags gefilterd (validateAndSmooth vult de buffer),
  // maar 'twijfel'-vlaggen (bevroren sensor, net-over-drempel) horen er
  // óók bij — zelfde kwaliteitscontext als de andere analyses.
  const qBlok=_qualityBlokFor(Object.keys(stats));
  const prompt=`Je bent expert automonteur. Analyseer deze 20-seconden datalog in het Nederlands.

Voertuig: ${v.merk||'?'} ${v.year||''}
DTC codes: ${formatDtcCodes(dtcCodes)}

DATALOG — 20 seconden live meting:
${statLines}${qBlok}

Let specifiek op:
- Correlaties (spanning daalt als RPM stijgt = alternator)
- Stijgende brandstoftrim = vacuümlek of injector
- Temperatuur trends
- Afwijkingen van normale waarden

Geef: Structureer je antwoord EXACT in onderstaande volgorde. Gebruik nergens sterretjes, emoji of woorden in hoofdletters in de lopende tekst; zet elke sectienaam op een eigen regel.

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
  await callAI(prompt,document.getElementById('aiContent'),{
    vraag:'Datalog-analyse: wat laat de opgenomen reeks zien over de staat van het voertuig?',
    profiel:'rit'});
  btn.disabled=false;
  log('Datalog AI analyse klaar','ok');
}

// ════════════════════════════════════════
// API KEY
// ════════════════════════════════════════
function saveApiKey(){
  let val=document.getElementById('apiKeyInput').value.trim();
  if(val==='••••••••••••••••') val=window.anthropicKey;
  if(val&&!val.startsWith('sk-ant-')){
    document.getElementById('apiStatus').innerHTML='<span style="color:var(--rd)">⚠ Moet beginnen met sk-ant-</span>';
    return;
  }
  window.anthropicKey=val;
  try{val?localStorage.setItem('ns_api_key',val):localStorage.removeItem('ns_api_key');}catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  updateApiPill(); closeApiDialog();
  log(val?'API key opgeslagen':'API key verwijderd',val?'ok':'warn');
}
function clearApiKey(){
  window.anthropicKey='';
  try{localStorage.removeItem('ns_api_key');}catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  updateApiPill(); closeApiDialog();
}
function openApiDialog(){
  if(typeof PROXY_URL!=='undefined' && PROXY_URL){
    showToast('🤖 AI ✓ Actief via proxy\n\nDe sleutel staat veilig server-side in de Cloudflare Worker.');
    return;
  }
  // Als ingelogd als admin met geldige key — toon info ipv edit dialog
  if(currentUser?.role==='admin' && window.anthropicKey?.startsWith('sk-ant-')){
    showToast(`🤖 AI ✓ Actief\n\nKey: ${window.anthropicKey.slice(0,20)}...\nGebruiker: ${currentUser.name}\n\nKey beheren via src/config.js`);
    return;
  }
  const hasKey=window.anthropicKey?.startsWith('sk-ant-');
  document.getElementById('apiKeyInput').value=hasKey?'••••••••••••••••':'';
  document.getElementById('apiStatus').innerHTML=hasKey?'<span style="color:var(--gn)">✅ Key actief</span>':'<span style="color:var(--or)">Geen key</span>';
  document.getElementById('apiDialog').classList.add('open');
}
function closeApiDialog(){document.getElementById('apiDialog').classList.remove('open');}

// ════════════════════════════════════════
// VEHICLE
// ════════════════════════════════════════

// ════════════════════════════════════════
// WELCOME SCREEN
// ════════════════════════════════════════
// 3 tabs vervangen door 4 intent-deuren
function openDoor(key){
  const d=document.getElementById('wmDoors'); if(d) d.style.display='none';
  document.querySelectorAll('.wm-door-panel').forEach(p=>p.style.display='none');
  const p=document.getElementById('dp-'+key); if(p) p.style.display='block';
  try{ document.querySelector('.welcome-scroll')?.scrollTo(0,0); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  logUsage('deur_open', key);
}
function backToDoors(){
  document.querySelectorAll('.wm-door-panel').forEach(p=>p.style.display='none');
  const d=document.getElementById('wmDoors'); if(d) d.style.display='block';
}

// ══════════════════════════════════════════════════════════════════
// ⭐ FAVORIETEN — klant markeert functies met het sterretje rechtsboven;
// ze verschijnen dan als chips in een dun balkje onderaan het startscherm,
// om snel te starten. Geen aparte deur. Opslag: localStorage 'pl_favorites'
// = array van kaart-id's (wc-…). De actie wordt NIET gedupliceerd — een
// favoriet klikt gewoon de originele kaart aan, dus alle bestaande
// wcBind-handlers blijven de bron.
// ══════════════════════════════════════════════════════════════════
const FAV_KEY='pl_favorites';
function favGet(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY)||'[]'); }catch(e){ return []; } }
function favSet(a){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(a)); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ } }
function favHas(id){ return favGet().indexOf(id)!==-1; }
function favToggle(id){
  const a=favGet(); const i=a.indexOf(id);
  if(i===-1) a.push(id); else a.splice(i,1);
  favSet(a);
  // Sterretje op de kaart bijwerken
  const st=document.querySelector('.fav-star[data-fav="'+id+'"]');
  if(st){ const on=i===-1; st.classList.toggle('on',on); st.textContent=on?'★':'☆';
    st.title=on?'Uit favorieten halen':'Aan favorieten toevoegen';
    st.setAttribute('aria-pressed',on?'true':'false'); }
  try{ favBarSync(); }catch(e){ console.warn('favBarSync mislukt:', e); }
  try{ logUsage('favoriet_'+(i===-1?'aan':'uit'), id); }catch(e){ console.warn('logUsage mislukt:', e); }
}
// Sterknop op elke functiekaart (wc-…) prikken. Idempotent.
function injectFavStars(){
  document.querySelectorAll('.choice-card[id^="wc-"]').forEach(card=>{
    if(card.querySelector(':scope > .fav-star')) return; // al gedaan
    const id=card.id;
    card.classList.add('has-fav');
    const on=favHas(id);
    const b=document.createElement('button');
    b.className='fav-star'+(on?' on':'');
    b.dataset.fav=id;
    b.type='button';
    b.textContent=on?'★':'☆';
    b.title=on?'Uit favorieten halen':'Aan favorieten toevoegen';
    b.setAttribute('aria-label','Favoriet');
    b.setAttribute('aria-pressed',on?'true':'false');
    b.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); favToggle(id); });
    card.appendChild(b);
  });
}
// Titel/icoon van een kaart uitlezen voor de chip.
function _favMeta(id){
  const c=document.getElementById(id); if(!c) return null;
  const t=(c.querySelector('.choice-title')?.textContent||'').trim();
  const ic=(c.querySelector('.choice-icon')?.textContent||'⭐').trim();
  return {t,ic};
}
// ── ⭐ Favorieten-knop in de welkom-header + eigen overlay-venster ──
// Het oorspronkelijke balkje stond fixed op bottom:0 met z-index 9450 onder
// #welcomeScreen (z-index 9500). De opvolger — een absolute uitklap binnen
// .welcome-header met z-index 40 — had hetzelfde soort probleem: die
// stapelcontext ligt ónder de deurkaarten, dus het paneel werd half achter en
// half buiten beeld getekend. Sinds 2026-07-26 is het een echt overlay-venster
// (#favOv) dat aan <body> hangt, met een wazige achtergrond eroverheen.
function favPopClose(){
  const p=document.getElementById('favOv'), b=document.getElementById('favBtn');
  if(p) p.classList.remove('open');
  if(b) b.setAttribute('aria-expanded','false');
}
function favPopOpen(){
  const p=document.getElementById('favOv'), b=document.getElementById('favBtn');
  if(!p) return;
  favPopRender();
  p.classList.add('open');
  if(b) b.setAttribute('aria-expanded','true');
}
function favPopRender(){
  const host=document.getElementById('favPopList'); if(!host) return;
  const ids=favGet().filter(id=>document.getElementById(id));   // dode id's overslaan
  host.innerHTML='';
  ids.forEach(id=>{
    const m=_favMeta(id); if(!m) return;
    const chip=document.createElement('button');
    chip.className='favchip'; chip.type='button'; chip.setAttribute('role','menuitem');
    chip.innerHTML='<span class="fc-ic"></span><span class="fc-t"></span>';
    chip.querySelector('.fc-ic').textContent=m.ic;
    chip.querySelector('.fc-t').textContent=m.t;
    chip.title=m.t;
    chip.addEventListener('click',ev=>{
      ev.preventDefault(); ev.stopPropagation();
      favPopClose();
      const orig=document.getElementById(id); if(orig) orig.click();
    });
    host.appendChild(chip);
  });
}
// Knop tonen/verbergen + teller bijwerken. Heet nog favBarSync() zodat alle
// bestaande aanroepen (favToggle, observer) blijven werken.
function favBarSync(){
  const btn=document.getElementById('favBtn'); if(!btn) return;
  const wrap=btn.closest('.fav-wrap');
  const n=favGet().filter(id=>document.getElementById(id)).length;
  const num=document.getElementById('favBtnN'); if(num) num.textContent=n;
  if(wrap) wrap.classList.toggle('show', n>0);
  if(n===0) favPopClose(); else favPopRender();
}
function favBarInit(){
  // Venster naar <body> verplaatsen: binnen #welcomeScreen zou het opnieuw in
  // een vreemde stapelcontext belanden zodra daar iets aan verandert.
  try{
    const ov=document.getElementById('favOv');
    if(ov && ov.parentElement!==document.body) document.body.appendChild(ov);
  }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  const btn=document.getElementById('favBtn');
  if(btn && !btn._plBound){
    btn._plBound=true;
    btn.addEventListener('click',ev=>{
      ev.preventDefault(); ev.stopPropagation();
      const p=document.getElementById('favOv'); if(!p) return;
      if(p.classList.contains('open')) favPopClose(); else favPopOpen();
    });
    // Klik op de wazige achtergrond of op ✕ sluit; klik ín het venster niet.
    const ov=document.getElementById('favOv');
    if(ov) ov.addEventListener('click',ev=>{ if(ev.target===ov) favPopClose(); });
    const x=document.getElementById('favCloseBtn');
    if(x) x.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); favPopClose(); });
    document.addEventListener('keydown',ev=>{ if(ev.key==='Escape') favPopClose(); });
  }
  const ws=document.getElementById('welcomeScreen');
  if(ws && window.MutationObserver){
    try{ new MutationObserver(()=>{ favPopClose(); favBarSync(); }).observe(ws,{attributes:true,attributeFilter:['class']}); }catch(e){ console.warn('favBarSync mislukt:', e); }
  }
  favBarSync();
}
function showWelcome(vinInfo){
  const ws=document.getElementById('welcomeScreen');
  ws.classList.remove('hidden');
  try{ backToDoors(); }catch(e){ console.warn('backToDoors mislukt:', e); }  // altijd starten op het deuren-keuzescherm
  if(vinInfo&&vinInfo.merk){
    document.getElementById('welcomeTitle').textContent=`${vinInfo.merk} ${vinInfo.model||''} ${vinInfo.year||''} herkend`;
  } else if(demoMode){
    document.getElementById('welcomeTitle').textContent='Demo modus — kies een optie';
  }
}
// ── Startscherm als navigatiehub ──────────────────────────────────
// 🏠 opent het welkomstscherm weer. De analyses blijven in het midden;
// home ligt er als overlay overheen.
function goHome(){
  // Home = keuzescherm als overlay BOVENOP; lopende analyses blijven draaien
  // (stopt niets). Transiente popups sluiten, en sinds 2026-07-26 óók de
  // volledig-schermige modus-dashboards: die bleven anders achter het
  // welkomstscherm staan en sprongen bij de volgende functie weer in beeld.
  plCloseModeOverlays();
  showWelcome(vehicleInfo&&vehicleInfo.merk?vehicleInfo:null);
}
function openPidChoice(){
  var w=document.getElementById('welcomeScreen'); if(w) w.classList.add('hidden');
  window._pidLadeUserTs=Date.now();         // bewust geopend — monitor-guard 2 min met rust
  try{ toggleLade('slPanel'); }catch(e){ console.warn('toggleLade mislukt:', e); }   // toggle: opent én sluit
}
function confirmPidLive(){
  window._pidLadeUserTs=0;                  // bewust verlaten — guard weer scherp
  try{ closeLades(); }catch(e){ console.warn('closeLades mislukt:', e); }
}
function pidChoiceBackHome(){
  window._pidLadeUserTs=0;                  // bewust verlaten — guard weer scherp
  try{ closeLades(); }catch(e){ console.warn('closeLades mislukt:', e); }
  try{ goHome(); }catch(e){ console.warn('goHome mislukt:', e); }
}
// ── Alle volledig-schermige modus-overlays opruimen ───────────────────
// 2026-07-26 — deze logica zat alleen ín openLiveView(). Gevolg: startte je een
// Wintercheck en ging je daarna via 🏠 of een andere functiekaart verder, dan
// bleef #climateDash (position:fixed, z-index 9000) gewoon staan. Het
// welkomstscherm (z-index 9500) dekte hem af, dus je merkte niets — tot dat
// scherm sloot en de Wintercheck ineens weer bovenop stond. Nu één functie die
// vanuit goHome(), openLiveView() én elke functiekaart wordt aangeroepen.
// Lopende metingen worden GEMINIMALISEERD, niet gestopt.
function plCloseModeOverlays(){
  // 1) Transiente popups dicht
  for(const id of ['pdfReadyModal','optResultModal','scenarioModal','btLogModal','ritFocusModal','apiDialog','hudPicker','bandenInfoModal','proefritKeuzeModal','logCenter','vehOverview','demoCarModal']){
    const el=document.getElementById(id); if(el) el.style.display='none';
  }
  // 2) Modus-dashboards opzij — nette close-functies waar die bestaan
  try{ closeDeepDiag(); }catch(e){ console.warn('closeDeepDiag mislukt:', e); }
  try{ closeClimateCheck(); }catch(e){ console.warn('closeClimateCheck mislukt:', e); }          // ruimt óók z'n timer op
  try{ closeNeonDashboard(); }catch(e){ console.warn('closeNeonDashboard mislukt:', e); }         // ruimt hudTimer op
  try{
    const rd=document.getElementById('ritDash');
    if(rd && rd.style.display!=='none'){
      if(typeof ritActive!=='undefined' && ritActive) minimizeRitAnalyse();  // meting loopt door + pill
      else rd.style.display='none';
    }
  }catch(e){ console.warn('minimizeRitAnalyse mislukt:', e); }
  try{
    const cd=document.getElementById('caravanDash');
    if(cd && cd.style.display!=='none'){
      if(typeof caravanActive!=='undefined' && caravanActive) minimizeCaravanDash();  // rit loopt door + pill
      else cd.style.display='none';
    }
  }catch(e){ console.warn('minimizeCaravanDash mislukt:', e); }
  for(const id of ['pidRecOv','onderhoudDash','evDash','langeRitDash','vlDash','vlSheet','vlSvOv','reportsOverviewSheet','aiReportSheet','srTextSheet']){
    const el=document.getElementById(id); if(el) el.style.display='none';
  }
}
window.plCloseModeOverlays=plCloseModeOverlays;
function openLiveView(){
  try{ setPollProfile('live','live view geopend'); }catch(e){ console.warn('setPollProfile mislukt:', e); }
  // Eén betrouwbare route naar de live view — óók vanuit een analysepaneel
  // (Conditiecheck e.d.). Voorheen bleef de live view "achteraan": deze
  // functie verborg alleen het welkomstscherm en liet zowel de actieve
  // analyse-pane als alle modus-overlays gewoon bovenop staan.
  // Metingen blijven lopen: Rit Analyse wordt GEMINIMALISEERD (pill) i.p.v.
  // gestopt; een lopende PID-opname loopt door (overlay heropenen via deur 1).
  plCloseModeOverlays();
  // 3) Welkomstscherm en lades weg, en het midden ECHT naar de Live-tab
  var w=document.getElementById('welcomeScreen'); if(w) w.classList.add('hidden');
  try{ closeLades(); }catch(e){ console.warn('closeLades mislukt:', e); }
  try{ sw('live', document.querySelector('.tabs .tab')); }catch(e){ console.warn('sw mislukt:', e); }
}
window.openLiveView=openLiveView;
function reportNav(){
  // Rapporten-knop opent nu altijd het sessie-overzicht (alle rapporten van
  // deze sessie). Zonder rapporten: dezelfde vriendelijke melding als voorheen.
  if((window._sessionReports||[]).length){ try{ openReportsOverview(); }catch(e){ console.warn('openReportsOverview mislukt:', e); } }
  else { try{ showToast('Nog geen rapport — start eerst een analyse'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }
}
