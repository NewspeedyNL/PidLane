// ══════════════════════════════════════════════════════════════════
// pidlane-berekend.js — PLBerekend: PIDs die de app uitrekent (27-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAT DIT IS
// Een berekende PID ziet eruit als elke andere sensor: hij staat in de
// keuzelijst (onder "Berekend"), krijgt een tegel, een grafiek, een regel in
// het AI-rapport en een plek in de vaste sensorselectie van een voertuig.
// Maar hij wordt NIET bij de auto opgevraagd: de app rekent hem uit uit
// PIDs die al binnenkomen. De eerste is de versnelling (CA01) uit PLGear;
// de rest volgt uit het onderzoek "welke PIDs zijn nog meer te berekenen".
//
// DE GRENS: NOOIT DE BUS OP
// Een berekende PID heeft een naam die met CA begint. Dat is geen OBD-mode
// (mode 01 t/m 0A, 21, 22), dus een ECU zou er NO DATA of ERROR op geven, en
// dat telt de app als een dode sensor en uiteindelijk als een dode socket.
// Daarom staat de grens op drie plekken:
//   1. pidsDueNow() (pidlane-plload.js) slaat ze over — de pollus vraagt ze niet;
//   2. sendCmd() (pidlane-bt.js) weigert ze — de vangrail voor elk ander pad;
//   3. ze komen nooit in supportedPIDs — dus de waakronde, de gezondheids-
//      check en de sweeps (die allemaal supportedPIDs aflopen) zien ze niet.
// test-berekend.js toetst alle drie.
//
// BRONNEN
// Elke definitie noemt één of meer ALTERNATIEVE bronsets. De eerste set die
// de auto ondersteunt telt. Kies je een berekende PID, dan zet deze module
// de PIDs uit die set erbij (pidToevoegen, niet handmatig) — zonder bron geen
// uitkomst. Alleen VERSE bronwaarden tellen (≤ VERS_MS oud); een statische
// grootheid (referentiekoppel 0163, omgevingsdruk 0133) mag ouder zijn.
//
// Een uitkomst die niet te berekenen is, is null — nooit 0. Nul is een
// meting ("neutraal", "geen verbruik"), null is "weet ik niet".
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const VERS_MS = 3000;          // bronwaarde ouder dan dit telt niet
const STATISCH_MS = 600000;    // …behalve voor grootheden die niet bewegen
const STATISCH = new Set(['0163','0133']);
const TIK_MS = 400;
const BENZINE_G_PER_L = 745, STOICH = 14.7;
const STANDAARD_KPA = 101.3;

const DEFS = {
  CA01:{ name:'Versnelling (berekend)', unit:'versn.', cat:'Berekend', min:0, max:10,
         bronnen:[['010D','010C']],
         uitleg:'Uit snelheid en toerental, zelflerend per voertuig (versnellingsindicator). 0 = neutraal of koppeling in.' },
  CA02:{ name:'Brandstofdebiet (berekend)', unit:'L/h', cat:'Berekend', min:0, max:60,
         bronnen:[['015E'],['0110']],
         uitleg:'Direct uit 015E; anders uit de luchtmassa bij λ=1 (alleen benzine — een diesel loopt arm).' },
  CA03:{ name:'Verbruik nu (berekend)', unit:'L/100km', cat:'Berekend', min:0, max:50,
         bronnen:[['015E','010D'],['0110','010D']],
         uitleg:'Brandstofdebiet gedeeld door de snelheid. Onder 5 km/u geen waarde: dan is liters per 100 km geen getal.' },
  CA04:{ name:'Laaddruk (berekend)', unit:'bar', cat:'Berekend', min:-1, max:3,
         bronnen:[['010B']],
         uitleg:'Inlaatdruk min omgevingsdruk (0133, anders 101,3 kPa). Negatief = onderdruk.' },
  CA05:{ name:'Brandstoftrim totaal B1 (berekend)', unit:'%', cat:'Berekend', min:-50, max:50,
         bronnen:[['0106','0107']],
         uitleg:'Korte plus lange trim. Boven ±10% structureel: lek, luchtmassameter of injectoren laten nakijken.' },
  CA06:{ name:'Motorvermogen (berekend)', unit:'kW', cat:'Berekend', min:0, max:600,
         bronnen:[['0162','0163','010C']],
         uitleg:'Actueel koppel (0162 × referentiekoppel 0163) maal toerental. Een schatting van de motorregeling, geen rollenbank.' }
};

function isBerekend(pid){ return Object.prototype.hasOwnProperty.call(DEFS, String(pid||'').toUpperCase()); }

function diesel(){
  try{ return (typeof detectEngineType==='function') && detectEngineType()==='diesel'; }
  catch(e){ console.warn('PLBerekend: detectEngineType() mislukt', e); return false; }
}

// ── PUUR: de rekenregels. v = { pid: getal } met alleen verse waarden. ──
function lph(v, isDiesel){
  if (typeof v['015E']==='number') return v['015E'];
  if (typeof v['0110']==='number' && !isDiesel) return v['0110']*3600/(STOICH*BENZINE_G_PER_L);
  return null;
}
function bereken(pid, v, o){
  v = v || {}; o = o || {};
  const r2 = x => Math.round(x*100)/100, r1 = x => Math.round(x*10)/10;
  switch(String(pid).toUpperCase()){
    case 'CA01': {
      const g=o.gear;
      return (typeof g==='number' && g>=0 && g<=10) ? g : null;
    }
    case 'CA02': { const l=lph(v, o.diesel); return l===null ? null : r2(Math.max(0,l)); }
    case 'CA03': {
      const l=lph(v, o.diesel), kmh=v['010D'];
      if (l===null || typeof kmh!=='number' || kmh<5) return null;
      return r1(Math.min(99, Math.max(0, l/kmh*100)));
    }
    case 'CA04': {
      const map=v['010B'];
      if (typeof map!=='number') return null;
      const baro=(typeof v['0133']==='number' && v['0133']>0) ? v['0133'] : (typeof o.baro==='number' && o.baro>0 ? o.baro : STANDAARD_KPA);
      return r2((map-baro)/100);
    }
    case 'CA05': {
      const a=v['0106'], b=v['0107'];
      return (typeof a==='number' && typeof b==='number') ? r1(a+b) : null;
    }
    case 'CA06': {
      const pct=v['0162'], ref=v['0163'], rpm=v['010C'];
      if (typeof pct!=='number' || typeof ref!=='number' || typeof rpm!=='number' || ref<=0) return null;
      return r1(Math.max(0, pct/100*ref*rpm*2*Math.PI/60/1000));
    }
  }
  return null;
}

/* Welke bronset geldt op deze auto? De eerste waarvan elke PID ondersteund
   wordt. Diesel: geen luchtmassa-route voor het verbruik. `heeft(pid)` =
   ondersteunt de auto hem. null = niet te berekenen op deze auto. */
function bronset(pid, heeft, isDiesel){
  const d=DEFS[String(pid).toUpperCase()]; if (!d) return null;
  for (const set of d.bronnen){
    if (isDiesel && set.indexOf('0110')>=0 && (pid==='CA02' || pid==='CA03')) continue;
    if (set.every(heeft)) return set;
  }
  return null;
}

// ── DE APP ────────────────────────────────────────────────────────
function heeft(pid){
  try{ return typeof supportedPIDs!=='undefined' && supportedPIDs && supportedPIDs.has(pid); }
  catch(e){ console.warn('PLBerekend: supportedPIDs onleesbaar', e); return false; }
}
// Voor buildDiscoveredPIDList(): de berekende PIDs die op deze auto kunnen.
function defs(){
  const d=diesel(), uit=[];
  Object.keys(DEFS).forEach(pid=>{
    if (bronset(pid, heeft, d)) uit.push(Object.assign({ pid, berekend:true }, DEFS[pid]));
  });
  return uit;
}
function vers(pid, nu){
  const h=(typeof pidHist!=='undefined' && pidHist) ? pidHist[pid] : null;
  const x=h && h.length ? h[h.length-1] : null;
  if (!x || typeof x.v!=='number' || !isFinite(x.v)) return undefined;
  const max=STATISCH.has(pid) ? STATISCH_MS : VERS_MS;
  return (nu-(x.t||0))<=max ? x.v : undefined;
}
function gearNu(){
  try{ return (window.PLGear && typeof window.PLGear.waarde==='function') ? window.PLGear.waarde() : null; }
  catch(e){ console.warn('PLBerekend: PLGear.waarde() mislukt', e); return null; }
}
function baroNu(){
  try{ const s=window.PLGate ? window.PLGate.stats() : null; return (s && typeof s.omgevingsdruk==='number') ? s.omgevingsdruk : null; }
  catch(e){ console.warn('PLBerekend: omgevingsdruk onleesbaar', e); return null; }
}

// Een gekozen berekende PID heeft zijn bronnen nodig. Eén keer per PID per
// sessie erbij zetten, met een logregel: een selectie die stil groeit is
// precies wat #31 onleesbaar maakte.
const _bronGezet = {};
function bronnenErbij(pid, set){
  if (_bronGezet[pid] || typeof activePIDs==='undefined') return;
  _bronGezet[pid]=true;
  const mist=set.filter(p=>!activePIDs.has(p));
  if (!mist.length) return;
  let r={ok:[]};
  try{ r=(typeof pidToevoegen==='function') ? pidToevoegen(mist, { handmatig:false, niveau:'bestaat' }) : r; }
  catch(e){ console.warn('PLBerekend: bronnen niet toegevoegd', e); }
  if (r.ok && r.ok.length){
    try{ log(`🧮 ${DEFS[pid].name}: bron${r.ok.length===1?'':'nen'} ${r.ok.join(', ')} erbij gezet`,'info'); }
    catch(e){ console.warn('PLBerekend: logregel', e); }
    try{ if (typeof renderGauges==='function') renderGauges(); }catch(e){ console.warn('PLBerekend: renderGauges', e); }
  }
}

let _tikFout='';
function tik(){
  try{
    if (typeof activePIDs==='undefined' || !activePIDs || !activePIDs.size) return;
    const aan=(typeof connected!=='undefined' && connected) || (typeof demoMode!=='undefined' && demoMode);
    if (!aan) return;
    const nu=Date.now(), d=diesel();
    const o={ diesel:d, gear:gearNu(), baro:baroNu() };
    const cache={};
    const waarde=p=>{ if(!(p in cache)) cache[p]=vers(p, nu); return cache[p]; };
    activePIDs.forEach(pid=>{
      if (!isBerekend(pid)) return;
      const set=bronset(pid, p=>heeft(p) || (typeof demoMode!=='undefined' && demoMode), d);
      if (!set) return;
      bronnenErbij(pid, set);
      const v={};
      set.concat(['0133']).forEach(p=>{ const x=waarde(p); if (x!==undefined) v[p]=x; });
      const uit=bereken(pid, v, o);
      if (uit===null || !isFinite(uit)) return;
      if (typeof updPID==='function') updPID(pid, uit);
    });
  }catch(e){
    const k=String(e && e.message);
    if (k!==_tikFout){ _tikFout=k; console.warn('PLBerekend: tik mislukt', e); }
  }
}

// Registreren in ALL_PID_DEFS, zodat getPidDef() en de rapporten ze kennen.
// Bestaande sleutels nooit overschrijven.
try{
  if (window.ALL_PID_DEFS) Object.keys(DEFS).forEach(pid=>{
    if (!window.ALL_PID_DEFS[pid]) window.ALL_PID_DEFS[pid]=Object.assign({ berekend:true }, DEFS[pid]);
  });
}catch(e){ console.warn('PLBerekend: ALL_PID_DEFS aanvullen mislukt', e); }

window.PLBerekend = { DEFS, bereken, bronset, defs, isBerekend, tik, VERS_MS };
window.plIsBerekend = isBerekend;
window.plBerekendDefs = defs;
if (typeof setInterval==='function') setInterval(tik, TIK_MS);
})();
