// ══════════════════════════════════════════════════════════════════
// pidlane-berekend.js — PLBerekend: PIDs die de app uitrekent (27-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAT DIT IS
// Een berekende PID ziet eruit als elke andere sensor: hij staat in de
// keuzelijst (onder "Berekend"), krijgt een tegel, een grafiek, een regel in
// het AI-rapport en een plek in de vaste sensorselectie van een voertuig.
// Maar hij wordt NIET bij de auto opgevraagd: de app rekent hem uit uit
// PIDs die al binnenkomen.
//
// DE GRENS: NOOIT DE BUS OP
// Een berekende PID heeft een naam die met CA begint. Dat is geen OBD-mode
// (mode 01 t/m 0A, 21, 22), dus een ECU zou er NO DATA of ERROR op geven, en
// dat telt de app als een dode sensor en uiteindelijk als een dode socket.
// Daarom staat de grens op drie plekken:
//   1. pidsDueNow() (pidlane-plload.js) slaat ze over — de pollus vraagt ze niet;
//   2. sendCmd() (pidlane-bt.js) weigert ze — de vangrail voor elk ander pad,
//      en telt elke weigering (weiger()): blok 5 meldt dan welk pad het was;
//   3. ze komen nooit in supportedPIDs — dus de waakronde, de gezondheids-
//      check en de sweeps (die allemaal supportedPIDs aflopen) zien ze niet.
// test-berekend.js en bproef-berekend.js toetsen alle drie.
//
// BRONNEN
// Elke definitie noemt één of meer ALTERNATIEVE bronsets. De eerste set die
// de auto ondersteunt telt. Kies je een berekende PID, dan zet deze module
// de PIDs uit die set erbij (pidToevoegen, niet handmatig) — zonder bron geen
// uitkomst. Alleen VERSE bronwaarden tellen (≤ VERS_MS oud); een statische
// grootheid (referentiekoppel 0163, omgevingsdruk 0133) mag ouder zijn.
// Sommige hebben ook iets uit het profiel nodig (tankinhoud voor het bereik);
// zonder dat staan ze niet in de keuzelijst, want een tegel die altijd "—"
// zegt leest als een kapotte sensor.
//
// Een uitkomst die niet te berekenen is, is null — nooit 0. Nul is een
// meting ("neutraal", "geen verbruik"), null is "weet ik niet".
//
// SESSIEBEWIJS (voor blok 5)
// stats() telt over de hele sessie: hoe vaak elke PID uitgerekend is, de
// kleinste en grootste waarde, hoe vaak hij buiten zijn bereik viel, het
// grootste vermogen bij vol gas, en elke weigering in sendCmd. Zo oordeelt
// de proef aan het eind van één rit over die hele rit, en niet over het
// moment waarop de testrun toevallig draait.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const VERS_MS = 3000;          // bronwaarde ouder dan dit telt niet
/* …en de bronnen van ÉÉN berekening mogen onderling hoogstens zoveel uit
   elkaar liggen (#337, 01-10-2026). Vers per bron was niet genoeg: bij gas
   loslaten zakt 0110 meteen terwijl 0162 nog het koppel van een seconde
   eerder draagt, en dan stond er 96,7% rendement op de tegel. Statische
   grootheden (STATISCH) tellen hier niet mee: die bewegen niet. */
const SAMEN_MS = 1000;
const STATISCH_MS = 600000;    // …behalve voor grootheden die niet bewegen
const STATISCH = new Set(['0163','0133','012F','0146']);
const TIK_MS = 400;
const BENZINE_G_PER_L = 745, STOICH = 14.7;
const STANDAARD_KPA = 101.3;
// Energie per liter (onderste verbrandingswaarde), voor het rendement.
const KWH_PER_L = { benzine:8.9, diesel:9.9, lpg:6.9, hybride:8.9, 'plug-in hybride':8.9 };
// Zonder eigen prijs in het profiel: een ronde landelijke adviesprijs. De
// tegel zegt dan "standaardprijs", zodat niemand hem voor zijn bon aanziet.
const PRIJS_STANDAARD = { benzine:1.95, diesel:1.70, lpg:0.85, hybride:1.95, 'plug-in hybride':1.95 };
// Het schakeladvies: alleen OPschakelen. Terugschakelen adviseert deze app
// bewust niet — op de top van een klim is dat precies verkeerd, en dat kan
// de app niet zien aankomen (besluit 27-09-2026).
const SCHAKEL = { benzine:{ vanaf:2400, na:1700 }, diesel:{ vanaf:2000, na:1400 }, maxBelasting:75, minKmh:15 };
// Roetfilterregeneratie: zo heet, zo lang. Een schatting — de ECU zegt het niet.
const DPF = { heet:580, minS:90, maxBelasting:80 };

const DEFS = {
  CA01:{ name:'Versnelling (berekend)', unit:'versn.', cat:'Berekend', min:-1, max:10,
         bronnen:[['010D','010C']],
         uitleg:'Uit snelheid en toerental, zelflerend per voertuig (versnellingsindicator). 0 = neutraal of koppeling in, -1 = achteruit.' },
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
         uitleg:'Actueel koppel (0162 × referentiekoppel 0163) maal toerental. Een schatting van de motorregeling, geen rollenbank.' },
  CA07:{ name:'Motorkoppel (berekend)', unit:'Nm', cat:'Berekend', min:-300, max:2000,
         bronnen:[['0162','0163']],
         uitleg:'Actueel koppel in procenten (0162) maal het referentiekoppel (0163). Negatief = motorremmen.' },
  CA08:{ name:'Brandstofkosten nu (berekend)', unit:'€/u', cat:'Berekend', min:0, max:200,
         bronnen:[['015E'],['0110']],
         uitleg:'Brandstofdebiet maal de literprijs uit je profiel (anders een standaardprijs).' },
  CA09:{ name:'Bereik met deze tank (berekend)', unit:'km', cat:'Berekend', min:0, max:3000, vereist:'tank',
         bronnen:[['012F']],
         uitleg:'Tankpercentage maal de tankinhoud uit je profiel, gedeeld door het verbruik van deze rit (na 5 km) of je gemiddelde.' },
  CA10:{ name:'Rendement (berekend)', unit:'%', cat:'Berekend', min:0, max:60,
         bronnen:[['0162','0163','010C','015E'],['0162','0163','010C','0110']],
         uitleg:'Vermogen gedeeld door de energie in de brandstof die er op dat moment in gaat. Een benzinemotor haalt hoogstens rond 35%, een diesel rond 40%.' },
  CA11:{ name:'Schakeladvies (berekend)', unit:'versn.', cat:'Berekend', min:1, max:10, handbak:true,
         bronnen:[['010D','010C']],
         uitleg:'De versnelling waarin de motor op dit moment zuiniger draait. Alleen opschakelen: terugschakelen adviseert de app niet.' },
  CA12:{ name:'Km sinds roetfilterregeneratie (berekend)', unit:'km', cat:'Berekend', min:0, max:5000, diesel:true,
         bronnen:[['017C','010D'],['0178','010D']],
         uitleg:'Geschat: een regeneratie is ' + DPF.minS + ' s boven ' + DPF.heet + ' °C bij lage belasting. Tot de eerste gezien is: geen waarde.' },
  CA13:{ name:'Koelwater min buitentemperatuur (berekend)', unit:'°C', cat:'Berekend', min:-60, max:200,
         bronnen:[['0105','0146']],
         uitleg:'Hoeveel warmer het koelwater is dan de buitenlucht: zegt iets over de koelcapaciteit bij trekken of warm weer.' },
  CA14:{ name:'Brandstoftrim totaal B2 (berekend)', unit:'%', cat:'Berekend', min:-50, max:50,
         bronnen:[['0108','0109']],
         uitleg:'Korte plus lange trim van bank 2 (V-motor of boxer).' },
  CA15:{ name:'Trimverschil B1 − B2 (berekend)', unit:'%', cat:'Berekend', min:-100, max:100,
         bronnen:[['0106','0107','0108','0109']],
         uitleg:'Verschil tussen de banken. Meer dan ±5% structureel wijst op iets aan één kant: een lek of een injector.' },
  CA16:{ name:'Koppelomvormer-slip (berekend)', unit:'%', cat:'Berekend', min:0, max:100, automaat:true,
         bronnen:[['010D','010C']],
         uitleg:'Hoeveel sneller de motor draait dan de wielen in deze versnelling vragen. Alleen bij een automaat; 0 = omvormer vergrendeld.' },
  CA17:{ name:'Brandstofkosten deze rit (berekend)', unit:'€', cat:'Berekend', min:0, max:1000,
         bronnen:[['015E'],['0110']],
         uitleg:'Opgeteld brandstofdebiet sinds het verbinden, maal de literprijs.' }
};

function isBerekend(pid){ return Object.prototype.hasOwnProperty.call(DEFS, String(pid||'').toUpperCase()); }

function motor(){
  try{ return (typeof detectEngineType==='function') ? (detectEngineType() || 'benzine') : 'benzine'; }
  catch(e){ console.warn('PLBerekend: detectEngineType() mislukt', e); return 'benzine'; }
}

// ── PUUR: de rekenregels. v = { pid: getal } met alleen verse waarden. ──
function lph(v, isDiesel){
  if (typeof v['015E']==='number') return v['015E'];
  if (typeof v['0110']==='number' && !isDiesel) return v['0110']*3600/(STOICH*BENZINE_G_PER_L);
  return null;
}
function kw(v){
  const pct=v['0162'], ref=v['0163'], rpm=v['010C'];
  if (typeof pct!=='number' || typeof ref!=='number' || typeof rpm!=='number' || ref<=0) return null;
  return Math.max(0, pct/100*ref*rpm*2*Math.PI/60/1000);
}
/* Het schakeladvies. `ratios` = { versnelling: km/u per 1000 tpm } uit
   PLGear. Geeft de versnelling waarin je nu beter zou rijden: dezelfde als nu
   als er niets te winnen is. Alleen omhoog. null = geen uitspraak (geen
   versnelling bekend, stilstand, of te zwaar belast). */
function schakelAdvies(kmh, rpm, gear, ratios, isDiesel, belasting){
  if (typeof gear!=='number' || gear<1 || !ratios || !ratios[gear]) return null;
  if (typeof kmh!=='number' || typeof rpm!=='number' || kmh<SCHAKEL.minKmh) return null;
  if (typeof belasting==='number' && belasting>SCHAKEL.maxBelasting) return gear;   // hij werkt hard: laten
  const g=isDiesel ? SCHAKEL.diesel : SCHAKEL.benzine;
  if (rpm<g.vanaf) return gear;
  let beste=gear;
  for (let k=gear+1; ratios[k]; k++){
    const na=rpm*ratios[gear]/ratios[k];
    if (na>=g.na) beste=k; else break;
  }
  return beste;
}
function bereken(pid, v, o){
  v = v || {}; o = o || {};
  const r2 = x => Math.round(x*100)/100, r1 = x => Math.round(x*10)/10;
  switch(String(pid).toUpperCase()){
    case 'CA01': {
      const g=o.gear;
      return (typeof g==='number' && g>=-1 && g<=10) ? g : null;
    }
    case 'CA02': { const l=lph(v, o.diesel); return l===null ? null : r2(Math.max(0,l)); }
    case 'CA03': {
      const l=lph(v, o.diesel), kmh=v['010D'];
      if (l===null || typeof kmh!=='number' || kmh<5) return null;
      // Geklemd op het bereik van de tegel (#337). Bij 5–10 km/u is 60 l/100 km
      // echt, maar het zegt niets; tot 01-10 stond hier 99, en dan telde elk
      // optrekken als "buiten bereik" terwijl de rekensom klopte.
      return r1(Math.min(DEFS.CA03.max, Math.max(0, l/kmh*100)));
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
    case 'CA06': { const k=kw(v); return k===null ? null : r1(k); }
    case 'CA07': {
      const pct=v['0162'], ref=v['0163'];
      return (typeof pct==='number' && typeof ref==='number' && ref>0) ? Math.round(pct/100*ref) : null;
    }
    case 'CA08': {
      const l=lph(v, o.diesel);
      return (l===null || !(o.prijs>0)) ? null : r2(Math.max(0,l)*o.prijs);
    }
    case 'CA09': {
      const pct=v['012F'], tank=o.tank, verb=o.verbruikGem;
      if (typeof pct!=='number' || !(tank>0) || !(verb>0)) return null;
      return Math.round(Math.max(0,pct)/100*tank/verb*100);
    }
    case 'CA10': {
      const k=kw(v), l=lph(v, o.diesel), e=o.kwhPerL;
      if (k===null || l===null || !(e>0) || l<0.5 || k<=0) return null;
      return r1(Math.min(99, k/(l*e)*100));
    }
    case 'CA11': return schakelAdvies(v['010D'], v['010C'], o.gear, o.ratios, o.diesel, v['0104']);
    case 'CA12': return (typeof o.dpfKm==='number') ? r1(o.dpfKm) : null;
    case 'CA13': {
      const a=v['0105'], b=v['0146'];
      return (typeof a==='number' && typeof b==='number') ? Math.round(a-b) : null;
    }
    case 'CA14': {
      const a=v['0108'], b=v['0109'];
      return (typeof a==='number' && typeof b==='number') ? r1(a+b) : null;
    }
    case 'CA15': {
      const a=v['0106'], b=v['0107'], c=v['0108'], d=v['0109'];
      return [a,b,c,d].every(x=>typeof x==='number') ? r1((a+b)-(c+d)) : null;
    }
    case 'CA16': return (typeof o.slip==='number') ? r1(o.slip) : null;
    case 'CA17': return (typeof o.kosten==='number' && o.prijs>0) ? r2(o.kosten) : null;
  }
  return null;
}

/* Welke bronset geldt op deze auto? De eerste waarvan elke PID ondersteund
   wordt. Diesel: geen luchtmassa-route voor brandstof. `heeft(pid)` = de
   auto ondersteunt hem. `o` = { diesel, automaat, handbak, tank }: sommige
   berekeningen horen alleen bij een soort auto of vragen iets uit het
   profiel. null = niet te berekenen op deze auto. */
function bronset(pid, heeft, isDiesel, o){
  o = o || {};
  const d=DEFS[String(pid).toUpperCase()]; if (!d) return null;
  if (d.diesel && !isDiesel) return null;
  if (d.automaat && !o.automaat) return null;
  if (d.handbak && o.automaat) return null;
  if (d.vereist==='tank' && !(o.tank>0)) return null;
  for (const set of d.bronnen){
    if (isDiesel && set.indexOf('0110')>=0) continue;
    if (set.every(heeft)) return set;
  }
  return null;
}

/* De roetfilterteller, puur: één tik bijwerken. s = { kmSinds, laatste,
   heetSinds }, m = { temp, belasting, km (afgelegd in deze tik), t }. Een
   regeneratie telt als de temperatuur DPF.minS lang boven DPF.heet blijft
   bij hoogstens DPF.maxBelasting% belasting — onder zware last wordt een
   filter ook heet zonder dat hij regenereert. Geeft true bij een nieuwe
   regeneratie. */
function dpfTik(s, m){
  if (typeof m.km==='number' && m.km>0 && typeof s.kmSinds==='number') s.kmSinds+=m.km;
  const heet=typeof m.temp==='number' && m.temp>=DPF.heet && !(typeof m.belasting==='number' && m.belasting>DPF.maxBelasting);
  if (!heet){ s.heetSinds=null; return false; }
  if (!s.heetSinds){ s.heetSinds=m.t; return false; }
  if (m.t-s.heetSinds>=DPF.minS*1000 && (!s.laatste || m.t-s.laatste>30*60000)){
    s.laatste=m.t; s.kmSinds=0; s.heetSinds=null;
    return true;
  }
  return false;
}

// ── DE APP ────────────────────────────────────────────────────────
let _voertuig = null;          // { prijs, tank, verbruik, vermogen, brandstof, naam } uit PLGarage
function voertuig(v){ _voertuig = v || null; }
function brandstof(){
  const b=_voertuig && _voertuig.brandstof;
  if (b && KWH_PER_L[b]) return b;
  const m=motor();
  return m==='diesel' ? 'diesel' : m==='hybride' ? 'hybride' : 'benzine';
}
function prijs(){
  const p=_voertuig && Number(_voertuig.prijs);
  if (p>0) return { prijs:p, standaard:false };
  const s=PRIJS_STANDAARD[brandstof()];
  return { prijs:s||null, standaard:true };
}
function gearInfo(){
  try{
    const G=window.PLGear;
    if (!G) return { gear:null, ratios:null, automaat:false, slip:null };
    const st=G.status();
    const ratios={};
    (st.versnellingen||[]).forEach((r,i)=>{ const k=G.nummer(i); if (k>=1) ratios[k]=r; });
    return { gear:G.waarde(), ratios, automaat:!!st.automaat, slip:(typeof G.slip==='function') ? G.slip() : null };
  }catch(e){ console.warn('PLBerekend: PLGear onleesbaar', e); return { gear:null, ratios:null, automaat:false, slip:null }; }
}
function heeft(pid){
  try{ return typeof supportedPIDs!=='undefined' && supportedPIDs && supportedPIDs.has(pid); }
  catch(e){ console.warn('PLBerekend: supportedPIDs onleesbaar', e); return false; }
}
function voorwaarden(){
  const gi=gearInfo();
  return { automaat:gi.automaat, tank:_voertuig && Number(_voertuig.tank) };
}
// Voor buildDiscoveredPIDList(): de berekende PIDs die op deze auto kunnen.
function defs(){
  const d=motor()==='diesel', o=voorwaarden(), uit=[];
  Object.keys(DEFS).forEach(pid=>{
    if (bronset(pid, heeft, d, o)) uit.push(Object.assign({ pid, berekend:true }, DEFS[pid]));
  });
  return uit;
}
/* De laatste verse meting van een bron, met zijn tijd erbij: { v, t } of
   undefined. De tijd is voor samen() hieronder. */
function versMeting(pid, nu){
  const h=(typeof pidHist!=='undefined' && pidHist) ? pidHist[pid] : null;
  const x=h && h.length ? h[h.length-1] : null;
  if (!x || typeof x.v!=='number' || !isFinite(x.v)) return undefined;
  const max=STATISCH.has(pid) ? STATISCH_MS : VERS_MS;
  return (nu-(x.t||0))<=max ? { v:x.v, t:x.t||0 } : undefined;
}
function vers(pid, nu){ const m=versMeting(pid, nu); return m ? m.v : undefined; }
/* Puur (#337): liggen de meettijden van de bewegende bronnen van één
   berekening dicht genoeg bij elkaar? Eén bron of geen: altijd ja. */
function samen(tijden){
  const t=(tijden||[]).filter(x=>typeof x==='number' && isFinite(x));
  if (t.length<2) return true;
  return Math.max.apply(null, t)-Math.min.apply(null, t)<=SAMEN_MS;
}
function baroNu(){
  try{ const s=window.PLGate ? window.PLGate.stats() : null; return (s && typeof s.omgevingsdruk==='number') ? s.omgevingsdruk : null; }
  catch(e){ console.warn('PLBerekend: omgevingsdruk onleesbaar', e); return null; }
}
function echtVerbonden(){
  return (typeof connected!=='undefined' && connected) && !(typeof demoMode!=='undefined' && demoMode);
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

// ── de sessie: liters en km van deze verbinding, en het bewijs voor blok 5 ──
function leegSessie(){
  return { sinds:Date.now(), liters:0, km:0, sBrandstof:0, laatsteT:0,
           pids:{}, geweigerd:[], vermogen:{ max:null, volgas:null, volgasN:0 }, dpfRegens:0, scheef:{} };
}
let _s = leegSessie();
function boek(pid, v){
  const d=DEFS[pid], p=_s.pids[pid]=_s.pids[pid]||{ n:0, min:null, max:null, buiten:0, laatste:null };
  p.n++; p.laatste=v;
  p.min=p.min===null ? v : Math.min(p.min, v);
  p.max=p.max===null ? v : Math.max(p.max, v);
  if (d && (v<d.min-1e-9 || v>d.max+1e-9)) p.buiten++;
}
function weiger(cmd){
  try{
    const stapel=String((new Error()).stack||'').split('\n').slice(2,5).map(x=>x.trim()).join(' ← ');
    _s.geweigerd.push({ t:Date.now(), cmd:String(cmd), waar:stapel.slice(0,300) });
    if (_s.geweigerd.length>50) _s.geweigerd.shift();
  }catch(e){ console.warn('PLBerekend: weigering niet geteld', e); }
}

const DPF_LS='pl_dpf_';
function dpfSleutel(){ try{ return (window.PLGear && PLGear.sleutel) || 'onbekend'; }catch(e){ return 'onbekend'; } }
function dpfLees(k){
  try{ const r=localStorage.getItem(DPF_LS+k); return r ? JSON.parse(r) : { kmSinds:null, laatste:null, heetSinds:null }; }
  catch(e){ console.warn('PLBerekend: roetfilterteller onleesbaar', e); return { kmSinds:null, laatste:null, heetSinds:null }; }
}
function dpfSchrijf(k, s){
  if (typeof demoMode!=='undefined' && demoMode) return;   // demo: de teller loopt mee op het scherm, niet in de opslag
  try{ localStorage.setItem(DPF_LS+k, JSON.stringify(s)); }catch(e){ console.warn('PLBerekend: roetfilterteller niet bewaard', e); }
}
let _dpfK=null, _dpf=null, _dpfOpgeslagen=0;

let _tikFout='', _wasAan=false;
function tik(){
  try{
    const nu=Date.now();
    const aan=(typeof connected!=='undefined' && connected) || (typeof demoMode!=='undefined' && demoMode);
    if (!aan){ _s.laatsteT=0; _wasAan=false; return; }
    // Een nieuwe verbinding is een nieuwe rit voor de kosten en het bereik.
    // Het bewijs voor blok 5 blijft staan: een herverbinding midden in de rit
    // (#302) mag niet wissen wat er daarvoor gemeten is.
    if (!_wasAan){ _wasAan=true; _s.liters=0; _s.km=0; _s.sBrandstof=0; }
    const m=motor(), d=m==='diesel', gi=gearInfo();
    const cache={};
    const meting=p=>{ if(!(p in cache)) cache[p]=versMeting(p, nu); return cache[p]; };
    const waarde=p=>{ const m=meting(p); return m ? m.v : undefined; };

    // Liters en km van deze sessie, ook als geen enkele berekende PID gekozen
    // is: de kosten per rit en het bereik hebben ze nodig.
    const dt=_s.laatsteT ? (nu-_s.laatsteT)/1000 : 0;
    _s.laatsteT=nu;
    const kmh=waarde('010D');
    const l=lph({ '015E':waarde('015E'), '0110':waarde('0110') }, d);
    let kmTik=0;
    if (dt>0 && dt<10){
      if (typeof kmh==='number'){ kmTik=kmh*dt/3600; _s.km+=kmTik; }
      if (l!==null){ _s.liters+=l*dt/3600; _s.sBrandstof+=dt; }
    }
    // De roetfilterteller loopt per voertuig, over sessies heen.
    if (d){
      const k=dpfSleutel();
      if (k!==_dpfK){ _dpfK=k; _dpf=dpfLees(k); }
      const temp=waarde('017C')!==undefined ? waarde('017C') : waarde('0178');
      if (dpfTik(_dpf, { temp, belasting:waarde('0104'), km:kmTik, t:nu })){
        _s.dpfRegens++;
        try{ log('🔥 Roetfilterregeneratie gezien — de teller staat weer op 0 km','info'); }catch(e){ console.warn('PLBerekend: logregel', e); }
        dpfSchrijf(k, _dpf); _dpfOpgeslagen=nu;
      } else if (nu-_dpfOpgeslagen>30000){ dpfSchrijf(k, _dpf); _dpfOpgeslagen=nu; }
    }

    const actief=(typeof activePIDs!=='undefined' && activePIDs) ? activePIDs : new Set();
    const pr=prijs();
    const verbGem = (_s.km>=5 && _s.liters>0) ? _s.liters/_s.km*100 : (_voertuig && Number(_voertuig.verbruik)>0 ? Number(_voertuig.verbruik) : null);
    const o={ diesel:d, gear:gi.gear, ratios:gi.ratios, slip:gi.slip, baro:baroNu(), prijs:pr.prijs,
              tank:_voertuig && Number(_voertuig.tank), verbruikGem:verbGem, kwhPerL:KWH_PER_L[brandstof()],
              kosten:_s.liters*(pr.prijs||0), dpfKm:_dpf && typeof _dpf.kmSinds==='number' ? _dpf.kmSinds : null };
    const heeftNu=p=>heeft(p) || (typeof demoMode!=='undefined' && demoMode);
    const vw={ automaat:gi.automaat, tank:o.tank };
    // ALLE berekende PIDs waarvan de bronnen binnenkomen, ook als ze niet
    // gekozen zijn: dan telt het sessiebewijs ze toch, en hoeft niemand voor
    // blok 5 eerst de juiste tegels aan te zetten. Alleen een gekozen PID
    // krijgt een tegel (updPID) en zet ontbrekende bronnen erbij.
    Object.keys(DEFS).forEach(pid=>{
      const gekozen=actief.has(pid);
      const set=bronset(pid, heeftNu, d, vw);
      if (!set) return;
      if (gekozen) bronnenErbij(pid, set);
      const v={};
      set.concat(['0133','0104']).forEach(p=>{ const x=waarde(p); if (x!==undefined) v[p]=x; });
      // Bronnen van verschillende momenten: deze tik niet rekenen, en tellen
      // hoe vaak (#337). De tegel houdt zijn vorige waarde en wordt vanzelf
      // oud; een verkeerde waarde tonen is erger dan een seconde wachten.
      const tijden=set.filter(p=>!STATISCH.has(p)).map(p=>{ const m=meting(p); return m ? m.t : null; });
      if (!samen(tijden)){ if (echtVerbonden()) _s.scheef[pid]=(_s.scheef[pid]||0)+1; return; }
      const uit=bereken(pid, v, o);
      if (uit===null || !isFinite(uit)) return;
      if (echtVerbonden()){
        boek(pid, uit);
        if (pid==='CA06'){
          const vol=[waarde('0149'), waarde('0111')].some(x=>typeof x==='number' && x>=80) || (typeof v['0104']==='number' && v['0104']>=90);
          _s.vermogen.max=Math.max(_s.vermogen.max||0, uit);
          if (vol){ _s.vermogen.volgas=Math.max(_s.vermogen.volgas||0, uit); _s.vermogen.volgasN++; }
        }
      }
      if (gekozen && typeof updPID==='function') updPID(pid, uit);
    });
  }catch(e){
    const k=String(e && e.message);
    if (k!==_tikFout){ _tikFout=k; console.warn('PLBerekend: tik mislukt', e); }
  }
}

/* Het oordeel voor blok 5, puur. FOUT bij elke weigering in sendCmd (dan
   probeerde een module een CA-PID bij de auto op te vragen), bij een waarde
   buiten het bereik, bij een rendement boven 45% en bij een vermogen boven
   1,15× wat het profiel zegt. LET OP als het bewijs voor een vraag ontbreekt,
   met wat er nodig is. */
function oordeel(s){
  s=s||{};
  const pids=Object.keys(s.pids||{}).sort();
  const fout=[], let_=[];
  if ((s.geweigerd||[]).length) fout.push((s.geweigerd.length)+'× een berekende PID naar de adapter gestuurd, o.a. "'+s.geweigerd[0].cmd+'" via '+s.geweigerd[0].waar);
  pids.forEach(p=>{ if (s.pids[p].buiten) fout.push(p+' '+s.pids[p].buiten+'× buiten bereik ('+s.pids[p].min+'…'+s.pids[p].max+')'); });
  if (s.pids && s.pids.CA10 && s.pids.CA10.max>45) fout.push('rendement tot '+s.pids.CA10.max+'% — hoger dan een motor haalt, dus het koppel of het debiet klopt niet');
  const vm=s.voertuig && Number(s.voertuig.vermogen), vg=s.vermogen && s.vermogen.volgas;
  if (s.pids && s.pids.CA06){
    if (!(s.vermogen && s.vermogen.volgasN>0)) let_.push('vermogen: geen vol gas gezien (nodig: één keer ≥80% gas in de 2e of 3e)');
    else if (vm>0 && vg>vm*1.15) fout.push('vermogen bij vol gas '+vg+' kW, profiel zegt '+vm+' kW');
    else if (!(vm>0)) let_.push('vermogen: '+vg+' kW bij vol gas, maar geen vermogen in het profiel om het mee te vergelijken');
  }
  if (!pids.length) return { staat:'LET OP', detail:'geen enkele berekende PID kon rekenen; nodig: verbonden rijden met toerental, snelheid en de brandstoftrims aan (dan rekent hij ook de rest die deze auto kan)' };
  const kop=pids.map(p=>p+' '+s.pids[p].n+'× ('+s.pids[p].min+'…'+s.pids[p].max+')').join(', ')+
    (s.dpf && s.dpf.laatste ? '; roetfilter: laatste regeneratie gezien, '+Math.round(s.dpf.kmSinds||0)+' km geleden' : '')+
    (s.dpfRegens ? '; '+s.dpfRegens+' regeneratie(s) deze rit' : '');
  if (fout.length) return { staat:'FOUT', detail:fout.join(' · ')+' — '+kop };
  if (let_.length) return { staat:'LET OP', detail:let_.join(' · ')+' — '+kop };
  return { staat:'ok', detail:kop };
}

/* De app-maten voor PLOpdracht (#337, 01-10-2026). De meetopdracht kan geen
   CA-code noemen (PID_VORM laat alleen 01.. toe), en "zag je een rendement
   boven 50%?" als vraag gaf op 29-09 "niet gekeken": een gesloten opdracht
   die niets over de berekende waarden zei. Null = niets gerekend, geen 0. */
function maat(naam){
  const p=_s.pids, namen=Object.keys(p);
  switch(naam){
    case 'berekend-n':
      return namen.length ? namen.reduce((a,k)=>a+p[k].n, 0) : null;
    case 'berekend-buiten':
      return namen.length ? namen.reduce((a,k)=>a+p[k].buiten, 0) : null;
    case 'berekend-rendement-max':
      return (p.CA10 && typeof p.CA10.max==='number') ? p.CA10.max : null;
    default: return null;
  }
}

/* Wat blok 5 leest. Een kopie: wie hem leest kan de teller niet veranderen. */
function stats(){
  const s=JSON.parse(JSON.stringify(_s));
  s.prijs=prijs(); s.voertuig=_voertuig ? { vermogen:_voertuig.vermogen||null, tank:_voertuig.tank||null, naam:_voertuig.naam||null } : null;
  s.dpf=_dpf ? { kmSinds:_dpf.kmSinds, laatste:_dpf.laatste } : null;
  return s;
}

// Registreren in ALL_PID_DEFS, zodat getPidDef() en de rapporten ze kennen.
// Bestaande sleutels nooit overschrijven.
try{
  if (window.ALL_PID_DEFS) Object.keys(DEFS).forEach(pid=>{
    if (!window.ALL_PID_DEFS[pid]) window.ALL_PID_DEFS[pid]=Object.assign({ berekend:true }, DEFS[pid]);
  });
}catch(e){ console.warn('PLBerekend: ALL_PID_DEFS aanvullen mislukt', e); }

window.PLBerekend = { DEFS, SCHAKEL, DPF, PRIJS_STANDAARD, KWH_PER_L, bereken, bronset, schakelAdvies, dpfTik, defs, isBerekend,
  tik, stats, oordeel, weiger, voertuig, prijs, VERS_MS, SAMEN_MS, samen, maat, _nieuweSessie:function(){ _s=leegSessie(); } };
window.plIsBerekend = isBerekend;
window.plBerekendDefs = defs;
if (typeof setInterval==='function') setInterval(tik, TIK_MS);
})();
