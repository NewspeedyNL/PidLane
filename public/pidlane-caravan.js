/* pidlane-caravan.js — LIVE CARAVAN/AANHANGER-RITTRACKER (build 2026-07-19).
   Losse module in de PidLane-splitopzet; laadt als <script src> onderaan de
   body. Top-level declaraties zijn globaal over de klassieke scripts heen,
   dus index.html (wcBind, appBack, openLiveView) kan de functies en
   de vlag caravanActive gewoon zien.

   DOEL: tijdens een lange, zware rit (bergen, caravan) real-time meedenken —
   brandstofgericht. De coach geeft onderweg concrete tips:
     • terugschakelen als de motor zwoegt (hoge belasting, laag toerental)
     • opschakelen als het toerental onnodig hoog is
     • cruise control op ~95 op vlak/gelijkmatig terrein (100→95 met caravan
       scheelt merkbaar: luchtweerstand telt kwadratisch)
     • rustiger/gelijkmatiger op het gas, anticiperen
     • laten uitrollen op de motor bij afdaling (overrun = 0 brandstof)
     • melding als het momentane verbruik piekt op vlak terrein
   Plus veiligheids-/thermische bewaking (koelwater, duurbelasting, boord-
   spanning, snelheidslimiet). Aan het eind: één AI-rapport dat techniek,
   rijgedrag én brandstof combineert, met de gegeven tips als bewijs.

   Alles draait op standaard OBD2 request-response (geen CAN-sniffing). In
   demo werkt het live-beeld direct; boordspanning (0142) en koppel (0162/
   0163) zitten niet in demo → die tonen '—' resp. vermogen als belasting%. */

// ═══════════════════ STATE ═══════════════════
let caravanActive       = false;
let caravanStartTime    = 0;
let caravanTimer        = null;   // 1s UI/timer-tick (handle → clear bij stop)
let caravanTickInterval = null;   // idem, gecombineerd in caravanTimer
let caravanLastTick     = 0;      // voor integratie met échte dt
let caravanHist         = {};     // { pid: [{t,v}] } ring, ~6 min
let caravanCoach        = [];     // gegeven tips (feed + rapportbewijs)
let caravanCooldown     = {};     // per-regel laatste-vuur-timestamp
let caravanSchakelSinds  = { adv:'', t:0 };   // sinds wanneer het schakeladvies hetzelfde is
let caravanKm           = 0;      // geïntegreerde afstand
let caravanLiters       = 0;      // geïntegreerd verbruik
let caravanSpeedLimit   = _carLimietGelezen();   // instelbaar; caravan-snelweglimiet (pl_caravan_limiet)
let caravanAuto         = false;  // gestart door de rijsituatie caravan (19-11-2026)
let caravanHandUit      = false;  // met de hand gestopt terwijl de rijsituatie aanstond: niet meteen weer starten
let caravanStarten      = false;  // startCaravan() loopt (async)
let caravanClimbSecs    = { klim:0, afdaling:0, vlak:0 };
let caravanTerreinBron  = { helling:0, obd:0 };   // seconden per bron van het terreinoordeel
let caravanPeak         = { lkm:0, coolant:0, load:0, power:0 };
let caravanVermogenBron = 'belasting';
let caravanRicht        = { l100:14, bron:'vast' };   // richtverbruik met caravan, bij de start bepaald (#743)
let caravanAtfPid       = null;   // eigen bakoliesensor, als de auto hem heeft

const CARAVAN_PIDS_BASE = ['010D','010C','0104','0105','0111','0142','015E','0110'];
const CARAVAN_HIST_CAP  = 400;    // ~6.5 min bij 1s
/* Terrein uit de helling van de telefoon (TL01). 2,5° is ruim 4% — een
   helling die je met een caravan merkt. Zonder correctie voor versnelling
   wijkt de hoek uit bij optrekken en remmen (1 m/s² ≈ 6°), dus alleen bij
   een vrijwel constante snelheid. Of deze getallen kloppen is een ritvraag. */
const CARAVAN_HELLING   = { drempel:2.5, maxTrend:1 };   // °, km/h per s

// Het niveau van de laadspanning (PLKenmerk.laadLive, #532), of de oude
// grens van 13,0 V als PLKenmerk er niet is.
function _carLaad(volt, rpm){
  if(typeof volt!=='number'||!(volt>0)||typeof rpm!=='number'||rpm<=400) return null;
  if(!window.PLKenmerk) return volt<13.0 ? 'fout' : 'ok';
  try{ const r=PLKenmerk.laadLive(volt, rpm); return r ? r.niveau : null; }
  catch(e){ console.warn('caravan: laadoordeel', e); return volt<13.0 ? 'fout' : 'ok'; }
}

// ═══════════════════ LIMIET (19-11-2026) ═══════════════════
// De keuze stond in een invoerveld van het oude caravandashboard en werd niet
// bewaard. Nu één tik in het trekpaneel van Slim visueel: de volgende stap uit
// CARAVAN_LIMIETEN, bewaard per toestel.
const CARAVAN_LIMIETEN = [80, 90, 100, 110];
const CARAVAN_LIMIET_SLEUTEL = 'pl_caravan_limiet';
function _carLimietGelezen(){
  try{ const n=parseInt(localStorage.getItem('pl_caravan_limiet'), 10); return (n>=50 && n<=140) ? n : 100; }
  catch(e){ console.warn('caravan: limiet niet gelezen — 100', e); return 100; }
}
/* De volgende limiet in de rij. Puur. */
function caravanLimietVolgende(nu){
  const i=CARAVAN_LIMIETEN.indexOf(nu);
  return CARAVAN_LIMIETEN[(i+1)%CARAVAN_LIMIETEN.length];
}
function caravanLimietWissel(){
  caravanSpeedLimit=caravanLimietVolgende(caravanSpeedLimit);
  try{ localStorage.setItem(CARAVAN_LIMIET_SLEUTEL, String(caravanSpeedLimit)); }
  catch(e){ console.warn('caravan: limiet niet bewaard — geldt tot de app sluit', e); }
  return caravanSpeedLimit;
}
window.caravanLimietWissel=caravanLimietWissel;

// ═══════════════════ STARTEN VIA DE RIJSITUATIE (19-11-2026) ═══════════════════
// Het eigen dashboard met zijn startknop is weg. De rijsituatie "caravan" is
// de schakelaar: aan + adapter klaar = de rit loopt, uit = stoppen met
// rapport. Wie hem met de hand stopt (run-paneel) terwijl de situatie nog
// aanstaat, krijgt hem niet meteen terug; pas na uit en weer aan.
function _carSituatie(){
  try{ return typeof situatieActief==='function' && situatieActief().some(function(x){ return x && x.id==='caravan'; }); }
  catch(e){ console.warn('caravan: rijsituatie onleesbaar', e); return false; }
}
/* Wat de wachter doet. Puur: 'start' | 'stop' | null. */
function caravanAutoBesluit(o){
  if(o.situatie && !o.actief && !o.bezig && o.klaar && !o.handUit) return 'start';
  if(!o.situatie && o.actief && o.auto) return 'stop';
  return null;
}
function caravanWacht(){
  const situatie=_carSituatie();
  if(!situatie) caravanHandUit=false;
  const demo=(typeof demoMode!=='undefined' && demoMode);
  const klaar=demo || ((typeof connected!=='undefined' && connected) && !!window._connReady);
  const b=caravanAutoBesluit({ situatie, actief:caravanActive, bezig:caravanStarten, klaar, handUit:caravanHandUit, auto:caravanAuto });
  if(b==='start'){
    caravanStarten=true;
    Promise.resolve(startCaravan({ auto:true })).catch(function(e){ console.warn('caravan: automatisch starten mislukt', e); })
      .then(function(){ caravanStarten=false; });
  } else if(b==='stop'){
    Promise.resolve(stopCaravan()).catch(function(e){ console.warn('caravan: automatisch stoppen mislukt', e); });
  }
}
(function(){
  const tik=function(){ try{ caravanWacht(); }catch(e){ console.warn('caravan: wachter', e); } };
  // Een meettimer: met Maps ervoor (app uit beeld) loopt hij door zolang er een verbinding is.
  if(typeof window!=='undefined' && window.PLRust) PLRust.meet(2000, tik, 'caravanwachter'); else setInterval(tik, 2000);
})();

/* De oude ingang (wizard, startkaart): naar Slim visueel, met de rijsituatie
   caravan aan. De rit start vanzelf zodra de adapter klaar is. */
function openCaravan(){
  try{ if(!_carSituatie() && typeof toggleSituatie==='function') toggleSituatie('caravan'); }
  catch(e){ console.warn('caravan: rijsituatie niet aangezet', e); }
  try{ if(window.PLNav && PLNav.tab) PLNav.tab('live'); }catch(e){ console.warn('caravan: naar Live mislukt', e); }
  try{ if(typeof setPidView==='function') setPidView('visueel'); }catch(e){ console.warn('caravan: Slim visueel openen mislukt', e); }
  const demo=(typeof demoMode!=='undefined' && demoMode);
  if(!caravanActive && !demo && !(typeof connected!=='undefined' && connected)){
    try{ showToast('🚐 Caravanrit staat klaar — hij start zodra de adapter verbonden is'); }catch(e){ console.warn('caravan: melding', e); }
  }
}
window.openCaravan=openCaravan;

// ═══════════════════ START ═══════════════════
async function startCaravan(o){
  if(caravanActive) return;                       // guard tegen dubbel starten
  window._didCaravan=true;
  if(!connected && !demoMode){ showToast('Verbind eerst een adapter'); return; }
  if(!(await preAnalysisCheck())) return;
  caravanAuto=!!(o && o.auto);
  caravanHandUit=false;

  // PID-set activeren in de bestaande poll-scheduler. Koppel-PIDs alleen als
  // de auto ze ondersteunt → anders vermogen via belasting%.
  let pids=[...CARAVAN_PIDS_BASE];
  const heeftKoppel = (typeof supportedPIDs!=='undefined' && supportedPIDs.has && supportedPIDs.has('0162') && supportedPIDs.has('0163'));
  if(heeftKoppel){ pids.push('0162','0163'); caravanVermogenBron='koppel'; }
  else caravanVermogenBron='belasting';
  caravanAtfPid=_carAtfPid();
  if(caravanAtfPid) pids.push(caravanAtfPid);
  await ensurePIDListActive(pids);
  caravanRicht=_carRicht(vehicleFuelType());

  // reset meters
  caravanActive=true;
  caravanStartTime=Date.now();
  try{ setPollProfile('caravan','caravan-rit gestart'); }catch(e){ console.warn('setPollProfile mislukt:', e); }
  caravanLastTick=Date.now();
  caravanHist={}; caravanCoach=[]; caravanCooldown={}; caravanSchakelSinds={ adv:'', t:0 };
  caravanKm=0; caravanLiters=0;
  caravanClimbSecs={ klim:0, afdaling:0, vlak:0 };
  caravanTerreinBron={ helling:0, obd:0 };
  caravanPeak={ lkm:0, coolant:0, load:0, power:0 };

  log('🚐 Caravan-rittracker gestart'+(caravanAuto?' (rijsituatie caravan)':''),'ok');
  try{ showToast('🚐 Caravanrit loopt — limiet '+caravanSpeedLimit+' km/u'); }catch(e){ console.warn('caravan: melding', e); }

  // één gecombineerde tick per seconde (timer + integratie + coaching + UI)
  caravanTimer=setInterval(caravanTick,1000);
  caravanTickInterval=caravanTimer;
}
window.startCaravan=startCaravan;

// ═══════════════════ STOP → RAPPORT ═══════════════════
async function stopCaravan(){
  if(!caravanActive) return;
  caravanActive=false;
  // Met de hand gestopt terwijl de rijsituatie nog aanstaat: niet meteen weer starten.
  caravanHandUit=_carSituatie();
  caravanAuto=false;
  if(caravanTimer){ clearInterval(caravanTimer); caravanTimer=null; caravanTickInterval=null; }
  log('🚐 Caravan-rit gestopt — rapport genereren','info');
  await generateCaravanRapport();
}
window.stopCaravan=stopCaravan;

// ═══════════════════ RING-HELPERS ═══════════════════
function _carPush(pid,t,v){
  if(v===undefined||v===null||isNaN(v)) return;
  (caravanHist[pid]||(caravanHist[pid]=[])).push({t,v});
  const a=caravanHist[pid];
  if(a.length>CARAVAN_HIST_CAP) a.splice(0,a.length-CARAVAN_HIST_CAP);
}
// waarde van ~sec seconden geleden (dichtstbijzijnde sample); null als de
// historie nog niet zo ver teruggaat
function _carAgo(pid,sec){
  const a=caravanHist[pid]; if(!a||a.length<2) return null;
  const target=Date.now()-sec*1000;
  if(a[0].t>target) return null;                  // onvoldoende historie
  let best=a[0];
  for(const s of a){ if(Math.abs(s.t-target)<Math.abs(best.t-target)) best=s; else if(s.t>target) break; }
  return best.v;
}
function _carStats(pid){
  const a=caravanHist[pid]; if(!a||!a.length) return null;
  let mn=Infinity,mx=-Infinity,sum=0;
  for(const s of a){ if(s.v<mn)mn=s.v; if(s.v>mx)mx=s.v; sum+=s.v; }
  return { min:mn, max:mx, avg:sum/a.length, n:a.length };
}

// ═══════════════════ AFGELEIDE SIGNALEN ═══════════════════
function caravanFuelRate(){
  // direct: PID 015E (L/h). Anders benzine-schatting uit MAF (0110, g/s):
  //   L/h ≈ MAF ÷ (14.7 × 0.745 kg/L) × 3600 s
  const direct=(typeof pidVals!=='undefined')?pidVals['015E']:undefined;
  if(typeof direct==='number'&&direct>=0) return direct;
  const ft=vehicleFuelType();
  const maf=(typeof pidVals!=='undefined')?pidVals['0110']:undefined;
  if(ft!=='diesel'&&ft!=='elektrisch'&&typeof maf==='number'&&maf>0){
    return maf/(14.7*0.745)*3.6;                  // g/s → L/h
  }
  return null;
}

function caravanVermogen(rpm,load){
  // koppel-methode als 0162 (%) én 0163 (Nm) beschikbaar:
  //   kW = (koppel% ÷ 100 × ref-Nm × toeren) ÷ 9550
  if(caravanVermogenBron==='koppel'){
    const pct=(typeof pidVals!=='undefined')?pidVals['0162']:undefined;
    const nm =(typeof pidVals!=='undefined')?pidVals['0163']:undefined;
    if(typeof pct==='number'&&typeof nm==='number'&&typeof rpm==='number'&&rpm>0&&nm>0){
      const kw=(pct/100)*nm*rpm/9550;
      return { val: Math.max(0,kw), unit:'kW', bron:'koppel' };
    }
  }
  // fallback: belasting% als proxy voor hoe hard de motor werkt
  if(typeof load==='number') return { val:load, unit:'%', bron:'belasting' };
  return { val:null, unit:'', bron:'belasting' };
}

function caravanDetectClimb(load,speed,throttle,trend){
  // Zuivere OBD-heuristiek (geen GPS/hoogtemeter) — een inschatting:
  //  • klim:     motor werkt hard maar snelheid loopt niet op
  //  • afdaling: voet van het gas maar snelheid blijft/loopt op
  if(typeof speed==='number'&&speed>15&&typeof load==='number'&&load>=70&&(trend===null||trend<=0.3))
    return 'klim';
  if(typeof speed==='number'&&speed>30&&typeof throttle==='number'&&throttle<=6&&(trend===null||trend>=-0.15))
    return 'afdaling';
  return 'vlak';
}
/* Het terrein: de helling beslist als die er is, anders de OBD-heuristiek.
   Juist het verschil telt: zware belasting op vlakke weg (tegenwind, een
   volle caravan) is voor de motorregel een klim, voor de helling niet.
   helling = null als de telefoon niet vast in de houder zit (hellingVast). */
function caravanTerrein(load,speed,throttle,trend,helling){
  const bruikbaar = Number.isFinite(helling) && (trend===null || Math.abs(trend)<=CARAVAN_HELLING.maxTrend);
  if(!bruikbaar) return { climb:caravanDetectClimb(load,speed,throttle,trend), bron:'obd' };
  const climb = helling>=CARAVAN_HELLING.drempel ? 'klim' : helling<=-CARAVAN_HELLING.drempel ? 'afdaling' : 'vlak';
  return { climb, bron:'helling' };
}
function _carHelling(){
  try{ return (window.PLTelemetrie && PLTelemetrie.hellingVast) ? PLTelemetrie.hellingVast() : null; }
  catch(e){ console.warn('caravan: helling niet gelezen', e); return null; }
}

// ═══════════════════ COACHING ═══════════════════
function _carAlert(key,msg,level,cooldownMs){
  const now=Date.now();
  if(caravanCooldown[key] && now-caravanCooldown[key]<cooldownMs) return;
  caravanCooldown[key]=now;
  caravanCoach.push({ t:now, msg, level, key });
  if(caravanCoach.length>60) caravanCoach.splice(0,caravanCoach.length-60);
  // Veiligheidswaarschuwing → langere toast + korte trilling; gewone tip →
  // korte toast.
  //
  // 31-07-2026 — hier stond fireAlert(msg), maar die functie bestaat nergens
  // in de codebase. Elke warn-melding (koelwater, lang zwaar belast, lage
  // boordspanning) gooide dus een ReferenceError: de melding kwam wél in de
  // coachlijst maar nooit in beeld, caravanCheckRules brak halverwege af en
  // _updateCaravanPill() sloeg over. Juist op een klim met een caravan erachter
  // is dat precies de melding die je wél wilt zien. navigator.vibrate is een
  // gewone web-API — werkt in de APK-webview en in Chrome op Android, en is
  // met de guard onschadelijk waar hij ontbreekt (o.a. iOS).
  if(level==='warn'){
    showToast(msg,8000);
    try{ if(navigator.vibrate) navigator.vibrate([120,80,120]); }catch(e){ /* stil: vibratie werkt niet op elk toestel */ }
  }
  else showToast(msg,4500);
}

/* De coachregels (#743, 19-11-2026). Wat er tot deze datum anders was:
   - "gas" was de gasklep (0111). Op een diesel staat die vrijwel altijd open,
     dus afdaling en "rustiger op het gas" deden daar niets. Nu het pedaal
     vanaf zijn geleerde rust (caravanPedaal), de gasklep alleen als terugval
     op een benzinemotor.
   - koelwater waarschuwde boven vast 100 °C. Veel motoren lopen normaal
     105 °C; het oordeel komt nu uit PLKenmerk.koelLive (dezelfde grens als de
     rit-monitor), plus een snelle stijging vanaf 95 °C.
   - het richtverbruik was vast 11/14 l/100; nu uit je eigen ritten zonder
     caravan, keer CARAVAN_FACTOR (caravanRichtBepaal).
   - de teksten waren 25–40 woorden in een toast van 4,5 s. Nu hooguit acht
     woorden; de uitleg staat in het rapport (tipLabels).
   - bakolie (eigen sensor, als de auto hem heeft) telt mee. */
const CARAVAN_KOEL = { stijgVanaf:95, stijgGraden:3 };   // °C, en °C per minuut
const CARAVAN_ATF  = { letop:110, heet:120 };            // °C bakolie
function caravanCheckRules(ctx){
  const { speed,rpm,load,coolant,gas,volt,lkm,climb,cruiseTarget,limit,richt,atf } = ctx;

  // 1/2) SCHAKELEN — uit caravanSchakel(), pas als het advies 3 s staat
  //      (geen geflapper bij een kuil in de weg).
  const sch=ctx.schakel;
  if(sch&&ctx.schakelStabiel&&sch.advies==='terug'&&speed>10){
    _carAlert('terug',sch.doel?`⬇️ Terug naar ${sch.doel} — motor trekt het niet`:'⬇️ Schakel terug — motor zwoegt','tip',45000);
  }
  else if(sch&&ctx.schakelStabiel&&sch.advies==='op'&&speed>25){
    _carAlert('op',sch.doel?`⬆️ Naar ${sch.doel} — zuiniger`:'⬆️ Schakel op — zuiniger','tip',120000);
  }

  // 3) CRUISE — vlak en gelijkmatig, boven het zuinige punt
  if(climb!=='klim'&&typeof speed==='number'&&speed>cruiseTarget+3&&Math.abs(ctx.trend??0)<0.4)
    _carAlert('cruise',`🎯 Cruise op ${cruiseTarget} km/u`,'tip',180000);

  // 4) RUSTIGER GAS — een sprong in het pedaal van meer dan 25 punten in 2 s
  if(typeof gas==='number'&&climb!=='klim'){
    const gasAgo=_carAgo('GAS',2);
    if(gasAgo!==null && gas-gasAgo>25) _carAlert('gas','🪶 Rustiger gas geven','tip',120000);
  }

  // 5) AFDALING — voet los: geen brandstof, en de motor remt mee
  if(climb==='afdaling'&&typeof gas==='number'&&gas<5&&speed>40)
    _carAlert('afdaling','🛞 Gas los — laten uitrollen','tip',90000);

  // 6) VERBRUIK PIEKT op vlak terrein (op een klim is hoog verbruik normaal)
  if(typeof lkm==='number'&&typeof richt==='number'&&lkm>richt*1.6&&climb!=='klim'&&speed>25)
    _carAlert('verbruik',`⛽ ${lkm.toFixed(1).replace('.',',')} l/100 — gas iets terug`,'tip',150000);

  // ── VEILIGHEID / THERMISCH (warn → trilling) ──
  // 7) Koelwater: het oordeel voor déze motor, of een snelle stijging
  const koel=caravanKoelOordeel(coolant, _carAgo('0105',60));
  if(koel) _carAlert('koel',koel,'warn',90000);
  // 7b) Bakolie, als de auto hem geeft
  if(typeof atf==='number'&&atf>=CARAVAN_ATF.letop)
    _carAlert('atf',`⚙️ Bakolie ${Math.round(atf)}° — ${atf>=CARAVAN_ATF.heet?'stop en laat afkoelen':'rustiger aan'}`,'warn',120000);
  // 8) Duurbelasting — >60% van de laatste 5 min zwaar belast
  {
    const a=caravanHist['0104'];
    if(a&&a.length>30){
      const since=Date.now()-300000; let hi=0,tot=0;
      for(const s of a){ if(s.t>=since){ tot++; if(s.v>=85) hi++; } }
      if(tot>20 && hi/tot>0.60)
        _carAlert('duur','🔥 Lang zwaar belast — plan een pauze','warn',300000);
    }
  }
  // 9) Laadspanning laag terwijl de motor draait (PLKenmerk, #532)
  const _ls=_carLaad(volt, rpm);
  if(_ls==='fout'||_ls==='letop')
    _carAlert('volt',`🔋 Laadspanning laag: ${volt.toFixed(1).replace('.',',')} V${_ls==='letop'?' (niet zeker)':''}`,'warn',180000);
  // 10) Boven de ingestelde caravanlimiet
  if(typeof speed==='number'&&speed>limit+4)
    _carAlert('limiet',`⚠️ ${Math.round(speed)} km/u — limiet is ${limit}`,'tip',120000);
}
/* Koelwater voor déze motor, of null. ago = de waarde van een minuut
   geleden (null als die er niet is). Puur, op PLKenmerk na. */
function caravanKoelOordeel(t, ago){
  if(typeof t!=='number'||!isFinite(t)) return null;
  let r=null;
  try{ r=(window.PLKenmerk && PLKenmerk.koelLive) ? PLKenmerk.koelLive(t) : null; }
  catch(e){ console.warn('caravan: koelwateroordeel', e); }
  if(r&&r.niveau==='fout') return `🌡️ Koelwater ${Math.round(t)}° — te heet, rustig aan`;
  if(r&&r.niveau==='letop') return `🌡️ Koelwater ${Math.round(t)}° — warm voor deze motor`;
  if(t>=CARAVAN_KOEL.stijgVanaf&&typeof ago==='number'&&t-ago>=CARAVAN_KOEL.stijgGraden)
    return `🌡️ Koelwater stijgt snel (${Math.round(t)}°)`;
  return null;
}
/* Het pedaal, 0–100 vanaf zijn geleerde rust (PLToon), of de gasklep op een
   benzinemotor als er geen pedaal is. null op een diesel zonder pedaal: daar
   zegt de gasklep niets. */
function caravanPedaal(g, diesel){
  for(const p of ['015A','0149']){
    const v=g(p);
    if(typeof v==='number'&&isFinite(v)){
      try{ return (window.PLToon && PLToon.waarde) ? PLToon.waarde(p, v) : v; }
      catch(e){ console.warn('caravan: pedaal', e); return v; }
    }
  }
  const t=g('0111');
  return (!diesel && typeof t==='number' && isFinite(t)) ? t : null;
}
/* Het richtverbruik met caravan: je eigen verbruik zonder caravan keer
   CARAVAN_FACTOR. Bron in volgorde: gewogen ritten zonder caravanlabel
   (minstens 50 km), het opgegeven verbruik van het voertuig, de vaste waarde.
   Puur: ritten = PLGarage.rittenVan(), opgegeven = voertuig.verbruik_opgegeven. */
const CARAVAN_FACTOR = 1.4;
const CARAVAN_LABEL = /caravan|aanhang|trek/i;
function caravanRichtBepaal(ritten, opgegeven, fuelType){
  let km=0, l=0;
  (ritten||[]).forEach(function(r){
    if(r && typeof r.verbruik_l100==='number' && typeof r.km==='number' && r.km>=2 && !CARAVAN_LABEL.test(String(r.label||''))){ km+=r.km; l+=r.verbruik_l100*r.km/100; }
  });
  if(km>=50) return { l100:Math.round(l/km*100*CARAVAN_FACTOR*10)/10, bron:'ritten' };
  const o=Number(opgegeven);
  if(o>0) return { l100:Math.round(o*CARAVAN_FACTOR*10)/10, bron:'opgegeven' };
  return { l100:caravanRichtverbruik(fuelType), bron:'vast' };
}
function _carRicht(fuelType){
  try{
    const G=window.PLGarage, v=G&&G.actief&&G.actief();
    const ritten=(v && G.rittenVan) ? G.rittenVan(v.id) : null;
    return caravanRichtBepaal(ritten, v&&v.verbruik_opgegeven, fuelType);
  }catch(e){ console.warn('caravan: richtverbruik uit de ritten niet te lezen — vaste waarde', e); return { l100:caravanRichtverbruik(fuelType), bron:'vast' }; }
}
/* De bakoliesensor: een eigen sensor met die naam (dezelfde zoekregel als
   het trekpaneel, PLVisueel.TREK). null als de auto hem niet heeft. */
function _carAtfPid(){
  try{
    const r=(window.PLVisueel && PLVisueel.TREK || []).filter(function(t){ return t.rol==='atf'; })[0];
    const defs=(typeof discoveredPIDDefs!=='undefined' && discoveredPIDDefs) ? discoveredPIDDefs : [];
    const d=r && r.zoek ? defs.filter(function(x){ return x && r.zoek.test(String(x.name||'')); })[0] : null;
    return d ? d.pid : null;
  }catch(e){ console.warn('caravan: bakoliesensor zoeken mislukt', e); return null; }
}

// ═══════════════════ TICK (de motor) ═══════════════════
function caravanTick(){
  if(!caravanActive) return;
  const now=Date.now();
  let dt=(now-caravanLastTick)/1000; caravanLastTick=now;
  if(dt<0) dt=0; if(dt>5) dt=5;                    // na pauze/lag niet wegdrijven

  const g=pid=> (typeof pidVals!=='undefined')?pidVals[pid]:undefined;
  const speed=g('010D'), rpm=g('010C'), load=g('0104'),
        coolant=g('0105'), throttle=g('0111'), volt=g('0142');
  const fuelRate=caravanFuelRate();
  const fuelType=vehicleFuelType();
  const gas=caravanPedaal(g, fuelType==='diesel');

  // historie bijhouden
  _carPush('010D',now,speed); _carPush('010C',now,rpm); _carPush('0104',now,load);
  _carPush('0105',now,coolant); _carPush('0111',now,throttle);
  if(gas!==null) _carPush('GAS',now,gas);
  if(volt!==undefined) _carPush('0142',now,volt);
  if(fuelRate!==null)  _carPush('015E',now,fuelRate);
  const helling=_carHelling();
  if(helling!==null)   _carPush('TL01',now,helling);

  // integreren met échte dt
  if(typeof speed==='number'&&speed>0) caravanKm    += speed*dt/3600;
  if(fuelRate!==null&&fuelRate>0)       caravanLiters+= fuelRate*dt/3600;

  // momentaan L/100km
  let lkm=null;
  if(fuelRate!==null&&typeof speed==='number'&&speed>3) lkm=fuelRate/speed*100;

  // afgeleiden
  const spdAgo=_carAgo('010D',5);
  const trend = (spdAgo!==null)?(speed-spdAgo)/5:null;   // km/h per s
  const terrein = caravanTerrein(load,speed,gas,trend,helling);
  const climb = terrein.climb;
  caravanClimbSecs[climb]=(caravanClimbSecs[climb]||0)+dt;
  caravanTerreinBron[terrein.bron]+=dt;
  const pw=caravanVermogen(rpm,load);
  const cruiseTarget=Math.max(80,caravanSpeedLimit-5);

  // pieken
  if(lkm!==null&&lkm>caravanPeak.lkm&&speed>5) caravanPeak.lkm=lkm;
  if(typeof coolant==='number'&&coolant>caravanPeak.coolant) caravanPeak.coolant=coolant;
  if(typeof load==='number'&&load>caravanPeak.load) caravanPeak.load=load;
  if(pw.unit==='kW'&&pw.val>caravanPeak.power) caravanPeak.power=pw.val;

  let sb={ gear:null, ratios:null };
  try{ if(window.PLBerekend&&PLBerekend.schakelBron) sb=PLBerekend.schakelBron(); }
  catch(e){ console.warn('caravan: versnelling niet gelezen', e); }
  const atf=caravanAtfPid ? g(caravanAtfPid) : undefined;
  if(typeof atf==='number'&&(caravanPeak.atf===undefined||atf>caravanPeak.atf)) caravanPeak.atf=atf;
  const ctx={ speed,rpm,load,coolant,throttle,gas,pedaal:gas,volt,fuelRate,lkm,climb,trend,helling,terreinBron:terrein.bron,
              fuelType,cruiseTarget,limit:caravanSpeedLimit, gear:sb.gear, ratios:sb.ratios,
              richt:caravanRicht.l100, atf:typeof atf==='number'?atf:null };
  ctx.schakel=caravanSchakel(ctx);
  const adv=ctx.schakel?ctx.schakel.advies+'|'+ctx.schakel.doel:'';
  if(adv!==caravanSchakelSinds.adv) caravanSchakelSinds={ adv, t:now };
  ctx.schakelStabiel=now-caravanSchakelSinds.t>=3000;

  caravanRenderLive(ctx,pw);
  caravanCheckRules(ctx);
}

// ═══════════════════ ADVIES ALS WAARDE ═══════════════════
// Eén bron voor het schakel- en verbruiksoordeel van het live-beeld, zodat de
// rijmodus (pidlane-rijmodus.js) hetzelfde toont als het caravandashboard.
function caravanRichtverbruik(fuelType){ return fuelType==='diesel'?11:14; }   // L/100km met caravan
// { advies:'terug'|'op'|'ok', doel:versnelling|null }, of null zonder toerental.
// Met een bekende versnelling beslist PLBerekend.schakelTrek() (18-11-2026):
// dezelfde rekensom als CA11, maar op een klim die snelheid verliest ook
// omlaag. Zonder versnelling de toerentalregels hieronder.
function caravanSchakel(ctx){
  if(!ctx||typeof ctx.rpm!=='number') return null;
  const B=(typeof window!=='undefined')?window.PLBerekend:null;
  if(B&&typeof B.schakelTrek==='function'&&typeof ctx.gear==='number'&&ctx.ratios){
    const d=B.schakelTrek({ kmh:ctx.speed, rpm:ctx.rpm, gear:ctx.gear, ratios:ctx.ratios, diesel:ctx.fuelType==='diesel',
                            belasting:ctx.load, pedaal:ctx.pedaal, trend:ctx.trend, klim:ctx.climb==='klim' });
    if(d!==null) return { advies:d<ctx.gear?'terug':d>ctx.gear?'op':'ok', doel:d };
  }
  if(typeof ctx.load!=='number') return null;
  const dsl=ctx.fuelType==='diesel';
  const lugRpm=dsl?1500:1900, upRpm=dsl?2000:2400, klimRpm=dsl?2600:3300;   // klimRpm ≈ max na terugschakelen ÷ 1,35
  if(ctx.load>=85&&ctx.rpm<lugRpm) return { advies:'terug', doel:null };
  if(ctx.climb==='klim'&&ctx.load>=80&&typeof ctx.trend==='number'&&ctx.trend<=-0.3&&ctx.rpm<klimRpm) return { advies:'terug', doel:null };
  if(ctx.rpm>upRpm&&ctx.load<45&&ctx.climb!=='klim') return { advies:'op', doel:null };
  return { advies:'ok', doel:null };
}
// 'terug' | 'op' | 'ok', of null — voor de rijmodus.
function caravanSchakelAdvies(ctx){ const s=caravanSchakel(ctx); return s?s.advies:null; }
// 'ok' | 'letop' | 'alarm' t.o.v. het richtverbruik, of null zonder meting.
function caravanVerbruikNiveau(lkm,fuelType,richt){
  if(typeof lkm!=='number'||isNaN(lkm)) return null;
  const baseL=(typeof richt==='number'&&richt>0) ? richt : caravanRichtverbruik(fuelType);
  return lkm>baseL*1.5?'alarm':lkm>baseL*1.15?'letop':'ok';
}

// ═══════════════════ LIVE-WEERGAVE ═══════════════════
/* De haak voor de rijmodus (pidlane-rijmodus.js wikkelt deze functie om de
   ctx van elke tik te lezen). Tot 19-11-2026 tekende hij hier het eigen
   caravandashboard; dat is weg, het beeld staat in het trekpaneel van Slim
   visueel. Leeg laten, niet weghalen: de rijmodus hangt eraan. */
function caravanRenderLive(ctx,pw){ return ctx; }

// ═══════════════════ AI-EINDRAPPORT ═══════════════════
/* Waar de terreinverdeling vandaan komt. Puur, zodat de test hem kan lezen. */
function caravanTerreinBronTekst(b){
  const tot=(b.helling||0)+(b.obd||0);
  if(!tot || !b.helling) return 'inschatting uit belasting en snelheid — geen helling van de telefoon gemeten';
  const pct=Math.round(b.helling/tot*100);
  return pct>=99 ? 'gemeten met de helling van de telefoon'
       : `${pct}% gemeten met de helling van de telefoon, de rest geschat uit belasting en snelheid`;
}
async function generateCaravanRapport(){
  const v=getVehicle();
  const el=Math.floor((Date.now()-caravanStartTime)/1000);
  const mins=Math.floor(el/60), secs=el%60;
  const price=parseFloat(document.getElementById('fuelPrice')?.value)||2.05;
  const F=fv;
  const avg = caravanKm>0.1 ? (caravanLiters/caravanKm*100) : null;
  const ft  = vehicleFuelType();

  const secToMin=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
  const sp=_carStats('010D'), rp=_carStats('010C'), ld=_carStats('0104'), co=_carStats('0105'), hl=_carStats('TL01');
  const terreinBron=caravanTerreinBronTekst(caravanTerreinBron);

  // uniek gegeven tips + hoe vaak
  const tipCount={};
  caravanCoach.forEach(c=>{ tipCount[c.key]=(tipCount[c.key]||0)+1; });
  const tipLabels={ terug:'Terugschakelen (motor zwoegt)', op:'Opschakelen (toerental te hoog)',
    cruise:`Cruise op ~${Math.max(80,caravanSpeedLimit-5)}`, gas:'Rustiger/gelijkmatiger gas',
    afdaling:'Laten uitrollen bij afdaling', verbruik:'Verbruikspiek op vlak terrein',
    koel:'Koelwater te warm voor deze motor of snel stijgend', atf:'Bakolie warm (boven '+CARAVAN_ATF.letop+' °C)',
    duur:'Duurbelasting — pauze geadviseerd', volt:'Lage laadspanning', limiet:'Boven caravanlimiet' };

  const lines=[
    'PIDLANE — CARAVAN/AANHANGER RIT: BRANDSTOF + TECHNIEK + RIJGEDRAG',
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.vin||''}`.trim(),
    `Duur: ${mins}:${secs.toString().padStart(2,'0')}   Afstand: ${caravanKm.toFixed(1)} km`,
    `Verbruik: ${caravanLiters.toFixed(2)} L   Gemiddeld: ${avg!==null?avg.toFixed(1)+' L/100km':'—'}   Kosten: € ${(caravanLiters*price).toFixed(2)} (à € ${price.toFixed(2)}/L)`,
    `Vermogensbron: ${caravanVermogenBron==='koppel'?'gemeten koppel (PID 0162/0163)':'belasting% (koppel-PID niet beschikbaar)'}`,
    '',
    `TERREINVERDELING (${terreinBron}):`,
    `  ⛰️ Klim: ${secToMin(caravanClimbSecs.klim)}   🛞 Afdaling: ${secToMin(caravanClimbSecs.afdaling)}   ➖ Vlak: ${secToMin(caravanClimbSecs.vlak)}`,
    ...(hl?[`  Helling (telefoon, laatste minuten): ${hl.min.toFixed(1)} / ${hl.avg.toFixed(1)} / ${hl.max.toFixed(1)} °`]:[]),
    '',
    'GEMETEN WAARDEN (min / gem / max):',
    sp?`  Snelheid: ${F(sp.min)} / ${F(sp.avg)} / ${F(sp.max)} km/h`:'  Snelheid: —',
    rp?`  Toerental: ${F(rp.min)} / ${F(rp.avg)} / ${F(rp.max)} tpm`:'  Toerental: —',
    ld?`  Belasting: ${F(ld.min)} / ${F(ld.avg)} / ${F(ld.max)} %`:'  Belasting: —',
    co?`  Koelwater: ${F(co.min)} / ${F(co.avg)} / ${F(co.max)} °C`:'  Koelwater: —',
    `  Piek verbruik: ${caravanPeak.lkm?caravanPeak.lkm.toFixed(1)+' L/100km':'—'}   Piek koelwater: ${caravanPeak.coolant?Math.round(caravanPeak.coolant)+'°C':'—'}`+
      (typeof caravanPeak.atf==='number'?`   Piek bakolie: ${Math.round(caravanPeak.atf)}°C`:''),
    `  Richtverbruik met caravan: ${caravanRicht.l100.toFixed(1)} L/100km (${caravanRicht.bron==='ritten'?'je eigen ritten zonder caravan × '+CARAVAN_FACTOR:caravanRicht.bron==='opgegeven'?'je opgegeven verbruik × '+CARAVAN_FACTOR:'vaste schatting — rij eerst 50 km zonder caravan'})`,
    '',
    'COACHING TIJDENS DE RIT (aantal keer):',
    ...(Object.keys(tipCount).length
        ? Object.entries(tipCount).map(([k,n])=>`  • ${tipLabels[k]||k}: ${n}×`)
        : ['  • Geen tips nodig — rustige, gelijkmatige rit.']),
    '',
  ];


  const coachEvidence = Object.keys(tipCount).length
    ? Object.entries(tipCount).map(([k,n])=>`${tipLabels[k]||k} (${n}×)`).join('; ')
    : 'geen — gelijkmatige rit';
  const fuelNote = ft==='elektrisch'
    ? 'LET OP: elektrisch voertuig — praat over kWh-verbruik en efficiëntie, niet over liters/toerental.'
    : ft==='diesel' ? 'Dit is een diesel — betrek DPF/roetfilter en koeling op lange klimmen waar relevant.' : '';

  // Eerst de uitslag van de rit, dan pas de vraag aan de AI (#443). De bron
  // is de caravanhistorie; die houdt de laatste ±6,5 minuten (CARAVAN_HIST_CAP),
  // en dat zegt het scherm ook. Nee op de AI: het rapport komt er gewoon,
  // zonder AI-deel.
  let ai='', uit=null;
  {
    let t0=Infinity, t1=0;
    Object.keys(caravanHist).forEach(p=>{ const h=caravanHist[p]; if(h&&h.length){ t0=Math.min(t0,h[0].t); t1=Math.max(t1,h[h.length-1].t); } });
    const bron={ naam:'de laatste minuten van de caravanrit', hist:caravanHist, rit:true,
                 sec:t1>t0?Math.round((t1-t0)/1000):0, rijSec:PLVerzamel.rijSecUit(caravanHist['010D']) };
    uit=await PLVerzamel.meet({ bron, watVoor:'het caravanrapport', aiTekst:'🤖 Laat de AI de rit beoordelen' });
  }
  if(!uit || !uit.ai) ai='(Geen AI-analyse gevraagd — hierboven staat de volledige meet- en coachingsamenvatting.)';
  else try{
    ai=await apiFetch(
`Je bent een rij- en techniekcoach. Analyseer één lange rit met CARAVAN/AANHANGER door BERGACHTIG terrein. De focus is BRANDSTOF: hoe kon deze bestuurder zuiniger rijden, gecombineerd met de technische staat en het rijgedrag onder zware belasting.
${fuelNote}

Gebruik de meetdata en vooral de coaching-momenten hieronder als concreet bewijs — verwijs ernaar (bv. hoe vaak de motor zwoeg, of cruise nuttig was). Wees concreet en praktisch, geen algemeenheden.

Rit: ${mins} min, ${caravanKm.toFixed(1)} km, gemiddeld ${avg!==null?avg.toFixed(1)+' L/100km':'onbekend'}, kosten € ${(caravanLiters*price).toFixed(2)}.
Terrein (${terreinBron}): klim ${secToMin(caravanClimbSecs.klim)}, afdaling ${secToMin(caravanClimbSecs.afdaling)}, vlak ${secToMin(caravanClimbSecs.vlak)}.
Meetwaarden min/gem/max — snelheid ${sp?`${F(sp.min)}/${F(sp.avg)}/${F(sp.max)}`:'—'} km/h, toerental ${rp?`${F(rp.min)}/${F(rp.avg)}/${F(rp.max)}`:'—'} tpm, belasting ${ld?`${F(ld.min)}/${F(ld.avg)}/${F(ld.max)}`:'—'}%, koelwater ${co?`${F(co.min)}/${F(co.avg)}/${F(co.max)}`:'—'}°C.
Coaching gegeven: ${coachEvidence}.${PLVerzamel.promptBlok(uit.sam,{sec:uit.sec, rijSec:uit.rijSec})}

Geef in het Nederlands, met kopjes:
SAMENVATTING
BRANDSTOF & ZUINIGER RIJDEN (concrete winst: schakelen, cruise ~${Math.max(80,caravanSpeedLimit-5)}, gasvoet, afdalingen)
TECHNISCHE STAAT ONDER BELASTING (koeling, thermiek, spanning)
RIJGEDRAG MET CARAVAN
TOP 3 ACTIES VOOR DE VOLGENDE BERGRIT (🔴/🟡/🟢)

Sluit af met exact deze zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}${PLRapport.instructie()}`,
      3000, null, null,
      // Een caravanrit is lang en de app gaat onderweg gegarandeerd een keer
      // naar de achtergrond. Juist hier moet de AI weten waar de gaten zaten,
      // anders leest een bevroren koelwatertemperatuur als een defecte sensor.
      PLVerzamel.aanlevering(uit, 'Lange caravanrit door bergachtig terrein: zuiniger rijden plus de technische staat onder zware belasting.', 'rit')
    );
  }catch(e){
    ai='(AI niet beschikbaar — hierboven staat de volledige meet- en coachingsamenvatting.)';
  }

  lines.push('═══════════════════════════════════','AI-ANALYSE:',PLRapport.zonderBlok(ai));

  // tonen in het AI-paneel (renderAIText beheert zelf _lastAIReport + disclaimer)
  try{
    activateAIPane();
    const host=document.getElementById('aiContent');
    if(host){
      host.innerHTML='';
      const header=document.createElement('div');
      header.style.cssText='background:linear-gradient(135deg,rgba(14,159,110,.12),rgba(26,111,255,.12));border:1px solid rgba(14,159,110,.25);border-radius:8px;padding:10px 12px;margin-bottom:10px';
      const ht=document.createElement('div'); ht.style.cssText='font-size:13px;font-weight:700;margin-bottom:3px'; ht.textContent='🚐 Caravan-rit — brandstof & techniek';
      const hs=document.createElement('div'); hs.style.cssText='font-size:12px;color:var(--tx3)';
      hs.textContent=`${caravanKm.toFixed(1)} km · ${mins}:${secs.toString().padStart(2,'0')} · ${avg!==null?avg.toFixed(1)+' L/100km':'—'} · € ${(caravanLiters*price).toFixed(2)}`;
      header.appendChild(ht); header.appendChild(hs); host.appendChild(header);

      const aiDiv=document.createElement('div');
      renderAIText(ai,aiDiv);
      host.appendChild(aiDiv);

      const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px;margin-top:8px';
      const dl=document.createElement('button'); dl.className='btn'; dl.style.cssText='flex:1;justify-content:center'; dl.textContent='💾 Tekst';
      dl.onclick=()=>{ try{ download(`caravan-rit-${plDatumLokaal()}.txt`,lines.join('\n')); }catch(e){ console.warn('download mislukt:', e); } };
      const pdf=document.createElement('button'); pdf.className='btn'; pdf.style.cssText='flex:1;justify-content:center'; pdf.textContent='📄 PDF';
      pdf.onclick=function(){ try{ exportAIReportPDF(this); }catch(e){ console.warn('exportAIReportPDF mislukt:', e); } };
      row.appendChild(dl); row.appendChild(pdf); host.appendChild(row);
    }
  }catch(e){ log('Caravan-rapport tonen mislukt: '+e.message,'warn'); }

  // tekstrapport ook meteen wegschrijven
  try{ download(`caravan-rit-${plDatumLokaal()}.txt`,lines.join('\n')); }catch(e){ console.warn('download mislukt:', e); }
  log('🚐 Caravan-rapport klaar','ok');
  try{ goHome(); }catch(e){ console.warn('goHome mislukt:', e); }
}
window.generateCaravanRapport=generateCaravanRapport;
