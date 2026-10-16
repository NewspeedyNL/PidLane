// ══════════════════════════════════════════════════════════════════
// pidlane-rondgang.js — PLRond: Slim als rondgang langs de categorieën
// (15-10-2026)
// ──────────────────────────────────────────────────────────────────
// Slim kent twee standen: "Mijn dashboard" (pidlane-dashboard.js, je eigen
// tegels) en de RONDGANG: elke 10 s (instelbaar) een andere categorie —
// motor, temperaturen, brandstof en trims, lucht en turbo, uitlaat,
// elektrisch — zodat in ongeveer een minuut alles in beeld is geweest.
//
// Besluiten met de eigenaar (15-10-2026):
//   • binnen Slim, niet als eigen weergave; de stand staat in pl_slim_modus
//   • snelheid en toerental staan altijd bovenaan, op elke dia
//   • wordt een waarde rood, dan springt de rondgang naar die dia en blijft
//     daar tot hij weer normaal is
//   • per dia een vinkje (pl_rond_uit) en de wisseltijd (pl_rond_ms) — in
//     het ⚙-blad en via Mijn voorkeuren → Op dit toestel
//   • Pauze wordt NIET onthouden: de app start altijd rollend
//
// De tegels zelf tekent PLDash: dezelfde soorten (getal, balk, grafiek,
// meter, duo), dezelfde band, hetzelfde oordeel. Deze module levert alleen
// de indeling, de klok en de rem op de bus.
//
// WAT ER IN BEELD KOMT. Een dia toont de sensoren die AAN staan (Sensoren,
// of de vaste selectie uit Mijn voertuigen). De rondgang zet zelf alleen de
// kop aan, zoals Mijn dashboard dat al deed. Alles aanzetten wat de auto
// voor de rondgang heeft is een knop in het ⚙-blad (alleAan()): de selectie
// is van de klant en het voertuig, niet van een weergave — een rondgang die
// er stil sensoren bij zette, maakte de selectie uit Mijn voertuigen
// ongedaan (bproef-garage.js zag het, 15-10-2026).
//
// DE BUS. Een ELM kan niet alles tegelijk snel vragen. remt() — gelezen in
// pidPollInterval() — zet de SNELLE sensoren van de andere dia's op REM_MS
// (dezelfde regel als Visueel); de
// huidige dia, de kop en vlak vóór de wissel (VOOR_MS) de volgende dia
// houden hun eigen tempo, zodat een nieuwe dia niet met "—" begint.
//
// EIGEN KEUZE PER CATEGORIE (16-10-2026, op verzoek). In het ⚙-blad zet
// je per categorie zelf sensoren erbij (pl_rond_eigen, { cat: [pid] }) —
// ook een eigen PID als 221310 olietemperatuur, die ovzCat nergens
// onderbrengt. Jouw keuze wint: zo'n sensor staat alleen op de laatste
// pagina van die categorie, als rij, en nergens anders. Erbij zetten zet
// hem ook aan; dat is een tik van de klant, geen stille selectie.
//
// Puur en getoetst in test-rondgang.js: indeling(), tik(), stap(),
// voortgang(), alarmDia(), schoonMs(), schoonUit(), schoonEigen(). Het scherm:
// bproef-rondgang.js.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const KEUZES_MS = [5000, 10000, 15000, 20000, 30000];
const STANDAARD_MS = 10000;
const HOLD_MS = 30000;   // na vegen of een tik op de titel blijft de dia zo lang staan
const VOOR_MS = 2500;    // zo lang vóór de wissel wordt de volgende dia al snel gevraagd
const REM_MS = 2000;     // tempo voor de snelle sensoren van de andere dia's
const SNEL_MS = 300;     // wat "snel" is in PID_POLL_CLASS — dezelfde grens als Visueel
const MAX_PER_DIA = 12;
const TIK_MS = 250;

// De kop: altijd in beeld, klein, op één regel met ⏸ en ⚙. Een EV zonder
// toerental krijgt de aandrijfaccu.
const KOP = [
  { keten:['010D'], soort:'kop' },
  { keten:['010C','015B'], soort:'kop' }
];
// Per dia een keten per sensor (de eerste PID die de auto heeft telt), met
// de vorm waarin hij getoond wordt. Sensoren met dezelfde vorm en groep
// staan samen in één paneel (groepen()):
//   held   groot getal met een lijn van de laatste minuut, over de hele breedte
//   staaf  rechtop naast elkaar, zoals de meters op een tellerplaat
//   mid    een balk vanuit het midden (trims rond 0 %, lambda rond 1,00)
//   meter  een boog, twee naast elkaar
//   rij    naam, getal en de normale band (de band uit Overzicht)
// Een categorie (CATS) heeft één of meer PAGINA'S in DIAS, elk met een
// eigen onderwerp: sensoren die bij elkaar horen staan samen, zodat je ze
// tegen elkaar afleest (gevraagd tegen werkelijk koppel, pedaal tegen
// gasklep, bank 1 tegen bank 2). Een pagina waarvan de auto niets heeft
// valt weg. Het vinkje (pl_rond_uit) gaat per categorie, niet per pagina.
// `vul`: de categorieën uit Overzicht (ovzCat) waarmee de laatste pagina
// van een categorie wordt aangevuld met sensoren die je zelf aan hebt
// staan — als rij.
const CATS = [
  { id:'motor', naam:'Motor en rijden', ico:'⚙️', vul:['rijden','motor'] },
  { id:'temp', naam:'Temperaturen', ico:'🌡️', vul:['temp'] },
  { id:'brandstof', naam:'Brandstof en mengsel', ico:'⛽', vul:['brandstof'] },
  { id:'lucht', naam:'Lucht en turbo', ico:'🌀', vul:[] },
  { id:'uitlaat', naam:'Uitlaat en emissie', ico:'💨', vul:['uitlaat'] },
  { id:'elektrisch', naam:'Elektrisch', ico:'🔋', vul:['elektrisch'] }
];
// Een pagina vertelt één VERHAAL (15-10-2026, tweede ronde): niet "alles
// van één soort", maar de keten die je tegen elkaar afleest — pedaal →
// gasklep → belasting, inlaatdruk tegen buitendruk, sonde → correctie.
// `duid`: de regel "wat dit zegt" onder de titel (duiding(), puur), uit de
// waarden van nu. `lo`/`hi`: een gedeelde schaal binnen één paneel, zodat
// de staven tegen elkaar kloppen (abs. belasting loopt tot 400 %, maar
// naast de gewone belasting hoort hij op 0–100). `label`: de korte naam
// onder een staaf, waar de gewone naam afgekapt zou worden.
const DIAS = [
  { id:'motor-gas', cat:'motor', naam:'Van pedaal tot motor', duid:'gas', tegels:[
    { keten:['0149','015A','014A','014B'], soort:'staaf', groep:'Pedaal → gasklep → belasting', label:'Pedaal' },
    { keten:['0111','0145','0147','014C'], soort:'staaf', groep:'Pedaal → gasklep → belasting', label:'Gasklep' },
    { keten:['0104'], soort:'staaf', groep:'Pedaal → gasklep → belasting', label:'Belasting' },
    { keten:['0143'], soort:'staaf', groep:'Pedaal → gasklep → belasting', label:'Abs.', lo:0, hi:100 },
    { keten:['CA01'], soort:'rij' },
    { keten:['015A','014A','014B'], soort:'rij' },
    { keten:['014C','0145','0147'], soort:'rij' },
    { keten:['016C','018D'], soort:'rij' } ] },
  { id:'motor', cat:'motor', naam:'Vermogen en koppel', tegels:[
    { keten:['CA06'], soort:'held' },
    { keten:['0161'], soort:'staaf', groep:'Koppel' },
    { keten:['0162'], soort:'staaf', groep:'Koppel' },
    { keten:['0164'], soort:'staaf', groep:'Koppel' },
    { keten:['018E'], soort:'staaf', groep:'Koppel' },
    { keten:['CA07'], soort:'rij' },
    { keten:['0163'], soort:'rij' },
    { keten:['CA10'], soort:'rij' } ] },
  { id:'motor-ontsteking', cat:'motor', naam:'Ontsteking en looptijd', tegels:[
    { keten:['010E'], soort:'held' },
    { keten:['015D'], soort:'rij' },
    { keten:['01A2'], soort:'rij' },
    { keten:['011F'], soort:'rij' },
    { keten:['017F'], soort:'rij' },
    { keten:['01A6'], soort:'rij' },
    { keten:['0131'], soort:'rij' } ] },
  { id:'temp', cat:'temp', naam:'Motor en lucht', duid:'warmte', tegels:[
    { keten:['0105','0167'], soort:'rij' },
    { keten:['CA13'], soort:'rij' },
    { keten:['015C'], soort:'rij' },
    { keten:['010F','0168'], soort:'rij' },
    { keten:['0184'], soort:'rij' },
    { keten:['0146'], soort:'rij' },
    { keten:['0177'], soort:'rij' },
    { keten:['0175'], soort:'rij' },
    { keten:['0176'], soort:'rij' },
    { keten:['016B'], soort:'rij' } ] },
  { id:'temp-uitlaat', cat:'temp', naam:'Uitlaatgas', tegels:[
    { keten:['0178'], soort:'staaf', groep:'Uitlaatgas' },
    { keten:['0179'], soort:'staaf', groep:'Uitlaatgas' },
    { keten:['017C'], soort:'rij' } ] },
  { id:'brandstof', cat:'brandstof', naam:'Verbruik en kosten', tegels:[
    { keten:['CA03','015E','CA02'], soort:'held' },
    { keten:['015E','CA02'], soort:'rij' },
    { keten:['CA08'], soort:'rij' },
    { keten:['CA17'], soort:'rij' },
    { keten:['012F'], soort:'rij' },
    { keten:['CA09'], soort:'rij' },
    { keten:['0152'], soort:'rij' } ] },
  { id:'mengsel', cat:'brandstof', naam:'Sonde en correctie', duid:'mengsel', tegels:[
    { keten:['0144'], soort:'mid', groep:'Lambda: gevraagd en gemeten', midden:1, span:0.25 },
    { keten:['0124','0134'], soort:'mid', groep:'Lambda: gevraagd en gemeten', midden:1, span:0.25 },
    { keten:['0125','0135'], soort:'mid', groep:'Lambda: gevraagd en gemeten', midden:1, span:0.25 },
    { keten:['0128','0138'], soort:'mid', groep:'Lambda: gevraagd en gemeten', midden:1, span:0.25 },
    { keten:['0106'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['0107'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['0108'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['0109'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['0155'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['0156'], soort:'mid', groep:'Brandstoftrims', midden:0, span:25 },
    { keten:['CA05'], soort:'rij' },
    { keten:['CA15'], soort:'rij' } ] },
  { id:'brandstof-druk', cat:'brandstof', naam:'Brandstofdruk', tegels:[
    { keten:['010A'], soort:'rij' },
    { keten:['0123','0159','016D','0122'], soort:'rij' },
    { keten:['016E'], soort:'rij' },
    { keten:['CA14'], soort:'rij' } ] },
  { id:'lucht', cat:'lucht', naam:'Luchtmassa en druk', duid:'druk', tegels:[
    { keten:['0110','0166'], soort:'held' },
    { keten:['010B','0187'], soort:'staaf', groep:'Druk: inlaat tegen buiten', label:'Inlaat', lo:0, hi:250 },
    { keten:['0133'], soort:'staaf', groep:'Druk: inlaat tegen buiten', label:'Buiten', lo:0, hi:250 },
    { keten:['CA04','0170'], soort:'rij' },
    { keten:['0171'], soort:'staaf', groep:'Turbo en kleppen' },
    { keten:['0172'], soort:'staaf', groep:'Turbo en kleppen' },
    { keten:['016A'], soort:'staaf', groep:'Turbo en kleppen' },
    { keten:['016F'], soort:'rij' },
    { keten:['0166'], soort:'rij' } ] },
  { id:'uitlaat', cat:'uitlaat', naam:'Sondes en katalysator', duid:'kat', tegels:[
    { keten:['0114'], soort:'staaf', groep:'Sondes bank 1', ref:0.45, label:'Vóór' },
    { keten:['0115'], soort:'staaf', groep:'Sondes bank 1', ref:0.45, label:'Ná' },
    { keten:['0116'], soort:'staaf', groep:'Sondes bank 1', ref:0.45 },
    { keten:['0117'], soort:'staaf', groep:'Sondes bank 1', ref:0.45 },
    { keten:['0118'], soort:'staaf', groep:'Sondes bank 2', ref:0.45 },
    { keten:['0119'], soort:'staaf', groep:'Sondes bank 2', ref:0.45 },
    { keten:['011A'], soort:'staaf', groep:'Sondes bank 2', ref:0.45 },
    { keten:['011B'], soort:'staaf', groep:'Sondes bank 2', ref:0.45 },
    { keten:['013C'], soort:'staaf', groep:'Katalysator' },
    { keten:['013E'], soort:'staaf', groep:'Katalysator' },
    { keten:['013D'], soort:'staaf', groep:'Katalysator' },
    { keten:['013F'], soort:'staaf', groep:'Katalysator' } ] },
  { id:'uitlaat-nabeh', cat:'uitlaat', naam:'EGR, roetfilter en AdBlue', tegels:[
    { keten:['012C','0169'], soort:'staaf', groep:'EGR en verdamping' },
    { keten:['012E'], soort:'staaf', groep:'EGR en verdamping' },
    { keten:['017A'], soort:'staaf', groep:'Roetfilter' },
    { keten:['017B'], soort:'staaf', groep:'Roetfilter' },
    { keten:['018B'], soort:'staaf', groep:'Roetfilter' },
    { keten:['012D'], soort:'rij' },
    { keten:['0132'], soort:'rij' },
    { keten:['0186'], soort:'rij' },
    { keten:['0183'], soort:'rij' },
    { keten:['0185'], soort:'rij' },
    { keten:['0173'], soort:'rij' },
    { keten:['019E'], soort:'rij' } ] },
  { id:'elektrisch', cat:'elektrisch', naam:'Accu en laden', duid:'laden', tegels:[
    { keten:['015B'], soort:'rij' },
    { keten:['0142'], soort:'rij' } ] }
];
const CAT_IDS = CATS.map(function(c){ return c.id; });
function catDef(id){ return CATS.filter(function(c){ return c.id===id; })[0]; }

// ── DE INDELING — puur ──────────────────────────────────────────────
// o.heeft(pid): staat aan op deze auto; o.heeftKop(pid): kan de kop hem
// tonen (standaard o.heeft); o.extra: PIDs die aan staan (voor het
// aanvullen); o.cat(pid): de Overzicht-categorie, of null = niet aanvullen;
// o.uit: dia-ids met het vinkje uit; o.eigen: { cat: [pid] } met de hand
// erbij gezet — die wint van elke andere plek. Eén sensor staat op één plek.
function indeling(motor, o){
  o=o||{};
  const heeft=o.heeft || function(){ return false; };
  const heeftKop=o.heeftKop || heeft;
  const cat=o.cat || function(){ return null; };
  const uit=schoonUit(o.uit);
  const eigen=schoonEigen(o.eigen);
  const gebruikt={};
  // Eerst de eigen keuze reserveren, zodat geen keten hem elders pakt.
  const handmatig=[];
  Object.keys(eigen).forEach(function(c){
    if(uit.indexOf(c)>-1) return;
    eigen[c].forEach(function(p){ if(!gebruikt[p] && heeft(p)){ gebruikt[p]=1; handmatig.push({ p:p, c:c }); } });
  });
  function tegel(s, kop){
    const h=kop ? heeftKop : heeft;
    const p=s.keten.filter(function(x){ return !gebruikt[x] && h(x); })[0];
    if(!p) return null;
    gebruikt[p]=1;
    const t={ id:'r-'+p, soort:s.soort, pids:[p] };
    if(s.groep) t.groep=s.groep;
    if(typeof s.midden==='number'){ t.midden=s.midden; t.span=s.span; }
    if(typeof s.ref==='number') t.ref=s.ref;
    if(typeof s.lo==='number' && typeof s.hi==='number' && s.hi>s.lo){ t.lo=s.lo; t.hi=s.hi; }
    if(s.label) t.label=s.label;
    return t;
  }
  const kop=KOP.map(function(s){ return tegel(s, true); }).filter(Boolean);
  let volg=DIAS.slice();
  if(motor==='hybride' || motor==='ev'){
    const e=volg.filter(function(d){ return d.cat==='elektrisch'; });
    volg=e.concat(volg.filter(function(d){ return d.cat!=='elektrisch'; }));
  }
  const aan=volg.filter(function(d){ return uit.indexOf(d.cat)<0; });
  let dias=aan.map(function(d){
    const c=catDef(d.cat);
    return { id:d.id, cat:d.cat, naam:c.naam+' · '+d.naam, cnaam:c.naam, ico:c.ico, duid:d.duid ? [d.duid] : [], tegels:d.tegels.map(function(s){ return tegel(s, false); }).filter(Boolean) };
  });
  handmatig.forEach(function(h){
    const d=dias.filter(function(x){ return x.cat===h.c; }).pop();
    if(d) d.tegels.push({ id:'r-'+h.p, soort:'rij', pids:[h.p] });
  });
  // Aanvullen met wat je zelf aan hebt staan, op de laatste pagina van zijn categorie.
  (o.extra||[]).forEach(function(p){
    if(gebruikt[p] || !heeft(p)) return;
    const c=cat(p); if(!c) return;
    const bron=CATS.filter(function(k){ return k.vul.indexOf(c)>-1 && uit.indexOf(k.id)<0; })[0]; if(!bron) return;
    const d=dias.filter(function(x){ return x.cat===bron.id; }).pop(); if(!d) return;
    gebruikt[p]=1;
    d.tegels.push({ id:'r-'+p, soort:'rij', pids:[p] });
  });
  dias=dias.filter(function(d){ return d.tegels.length; });
  // Eén tegel is geen dia: hij gaat bij de vorige als daar plaats is.
  const samen=[];
  dias.forEach(function(d){
    const vorig=samen[samen.length-1];
    if(d.tegels.length===1 && vorig && vorig.tegels.length<MAX_PER_DIA){
      vorig.tegels=vorig.tegels.concat(d.tegels);
      vorig.duid=vorig.duid.concat(d.duid.filter(function(k){ return vorig.duid.indexOf(k)<0; }));
      // Dezelfde categorie: de pagina erbij; een andere: alleen de categorienamen.
      if(d.cat===vorig.cat) vorig.naam+=' · '+d.naam.slice(d.cnaam.length+3);
      else { vorig.cats=(vorig.cats||[vorig.cnaam]).concat(d.cnaam); vorig.naam=vorig.cats.join(' · '); }
      return;
    }
    samen.push(d);
  });
  // Te vol: in delen van hoogstens MAX_PER_DIA.
  const uitL=[];
  samen.forEach(function(d){
    const n=Math.ceil(d.tegels.length/MAX_PER_DIA);
    for(let i=0;i<n;i++) uitL.push({ id:d.id+(i?'#'+(i+1):''), cat:d.cat, naam:d.naam+(n>1?' ('+(i+1)+'/'+n+')':''), ico:d.ico, duid:d.duid,
      tegels:d.tegels.slice(i*MAX_PER_DIA, (i+1)*MAX_PER_DIA) });
  });
  return { kop:kop, dias:uitL };
}
// De panelen van één dia: sensoren met dezelfde vorm en groep samen, in de
// volgorde waarin de eerste van elk paneel voorkomt. Een held staat alleen.
// Een staaf-, mid- of meterpaneel met één sensor wordt een rij: een losse
// balk zonder buren om mee te vergelijken zegt minder dan een rij met band,
// en een losse boog vulde maar de helft van zijn paneel.
function groepen(tegels){
  const uit=[], bij={}, tel={}, sleutel=function(t){ return t.soort==='held' ? 'held:'+t.id : t.soort+':'+(t.groep||''); };
  (tegels||[]).forEach(function(t){ tel[sleutel(t)]=(tel[sleutel(t)]||0)+1; });
  (tegels||[]).forEach(function(t){
    if((t.soort==='staaf' || t.soort==='mid' || t.soort==='meter') && tel[sleutel(t)]===1) t={ id:t.id, soort:'rij', pids:t.pids };
    const k=sleutel(t);
    if(!bij[k]){ bij[k]={ soort:t.soort, titel:t.groep||'', tegels:[] }; uit.push(bij[k]); }
    bij[k].tegels.push(t);
  });
  return uit;
}
function pidsVan(tegels){ return (tegels||[]).reduce(function(a,t){ return a.concat(t.pids); }, []); }

// ── DE KLOK — puur ──────────────────────────────────────────────────
// st = { i, start, pauze, alarm }. o = { n, ms, alarm: dia-index of -1 }.
function tik(st, nu, o){
  const n=o.n|0; if(n<1) return st;
  const s={ i:(st.i>=0 && st.i<n) ? st.i : 0, start:st.start, pauze:!!st.pauze, alarm:(typeof st.alarm==='number') ? st.alarm : -1 };
  const a=(typeof o.alarm==='number' && o.alarm>=0 && o.alarm<n) ? o.alarm : -1;
  if(a>=0){
    if(a!==s.alarm){ s.i=a; s.alarm=a; }
    s.start=nu; return s;           // blijft staan zolang het alarm er is
  }
  if(s.alarm>=0){ s.alarm=-1; s.start=nu; return s; }
  if(s.pauze){ s.start=Math.max(s.start, nu); return s; }
  if(nu-s.start>=o.ms){ s.i=(s.i+1)%n; s.start=nu; }
  return s;
}
// Met de hand een dia verder of terug: die blijft HOLD_MS staan.
function stap(st, r, nu, n){
  if(n<1) return st;
  const i=(((st.i|0)+r)%n+n)%n;
  return { i:i, start:nu+HOLD_MS, pauze:!!st.pauze, alarm:st.alarm };
}
function voortgang(st, nu, ms){ return Math.max(0, Math.min(1, (nu-st.start)/(ms||STANDAARD_MS))); }
// De eerste dia met een sensor in rood; -1 = geen.
function alarmDia(dias, oordeel){
  for(let i=0;i<(dias||[]).length;i++){
    if(pidsVan(dias[i].tegels).some(function(p){ return oordeel(p)==='danger'; })) return i;
  }
  return -1;
}
function schoonMs(v){ const n=Number(v); return KEUZES_MS.indexOf(n)>-1 ? n : STANDAARD_MS; }
function schoonUit(l){
  const u=(Array.isArray(l) ? l : []).filter(function(x, i, a){ return CAT_IDS.indexOf(x)>-1 && a.indexOf(x)===i; });
  return u.length>=CAT_IDS.length ? [] : u;   // alles uit = niets uit
}
// { cat: [pid] } zonder onbekende categorieën, rommel of dubbelen; een
// PID in twee categorieën blijft bij de eerste.
function schoonEigen(o){
  const uit={}, gezien={};
  if(!o || typeof o!=='object' || Array.isArray(o)) return uit;
  CAT_IDS.forEach(function(c){
    const l=(Array.isArray(o[c]) ? o[c] : []).filter(function(p){
      if(typeof p!=='string' || !/^[0-9A-Za-z_:.-]{2,24}$/.test(p) || gezien[p]) return false;
      gezien[p]=1; return true;
    });
    if(l.length) uit[c]=l;
  });
  return uit;
}

// ── WAT DIT ZEGT — puur ─────────────────────────────────────────────
// Eén regel per pagina die de getallen aan elkaar knoopt: wat de klant er
// zonder vakkennis uit leest. v = { pid: getal } met alleen verse waarden
// (pedaal al als "ingedrukt", zie PLToon); o.zwaai(pid) = hoeveel hij de
// laatste 30 s op en neer ging, o.diesel. null = geen uitspraak: liever
// niets dan een zin die bij deze auto of dit moment niet klopt.
function getal(x){ return typeof x==='number' && isFinite(x); }
function nl(x, d){ return x.toFixed(d).replace('.', ','); }
function duiding(k, v, o){
  v=v||{}; o=o||{};
  const koel=getal(v['0105']) ? v['0105'] : v['0167'];
  if(k==='gas'){
    const b=v['0104'], rpm=v['010C'], kmh=v['010D'], ped=v.pedaal;
    if(getal(ped) && ped<1 && getal(rpm) && rpm>1300 && getal(kmh) && kmh>20) return 'Gas los: de motor remt mee — de meeste motoren spuiten dan niets in';
    if(!getal(b)) return null;
    const r=Math.round(b);
    if(r>=85) return 'Belasting '+r+' %: de motor geeft bijna alles wat hij bij dit toerental kan';
    return 'Belasting '+r+' %: de motor geeft '+r+' % van wat hij bij dit toerental kan';
  }
  if(k==='druk'){
    const map=getal(v['010B']) ? v['010B'] : v['0187'], baro=v['0133'];
    if(!getal(map) || !getal(baro) || baro<50) return null;
    const d=(map-baro)/100;
    if(d>0.05) return 'Inlaat '+nl(d,2)+' bar boven de buitenlucht: de turbo perst lucht de motor in';
    if(o.diesel) return 'Inlaat op buitendruk: de turbo blaast nu niet bij';
    if(d<-0.3) return 'Inlaat '+nl(-d,2)+' bar onder de buitenlucht: de gasklep knijpt af (stationair, rustig rijden of gas los)';
    return 'Inlaat bijna op buitendruk: de gasklep staat ver open';
  }
  if(k==='mengsel'){
    const a=v['0106'], b=v['0107'];
    if(!getal(a) || !getal(b)) return null;
    if(getal(koel) && koel<70) return 'Motor nog koud: de trims zeggen pas iets vanaf zo\'n 70 °C';
    const t=a+b;
    if(t>10) return 'De ECU spuit '+nl(t,1)+' % extra in: de motor loopt van zichzelf arm — denk aan valse lucht, brandstofdruk of de luchtmassameter';
    if(t<-10) return 'De ECU spuit '+nl(-t,1)+' % minder in: de motor loopt van zichzelf rijk — denk aan een lekkende injector of de luchtmassameter';
    return 'Mengsel in orde: de ECU corrigeert '+(t<0?'−':'+')+nl(Math.abs(t),1)+' % (binnen ±10 %)';
  }
  if(k==='warmte'){
    if(!getal(koel)) return null;
    const bu=v['0146'], plus=getal(bu) ? ' — '+Math.round(koel-bu)+' °C warmer dan buiten' : '';
    if(koel<60) return 'Motor warmt op: koud verbruikt en slijt hij meer, dus nog even rustig aan'+plus;
    if(koel<80) return 'Motor bijna op temperatuur'+plus;
    if(koel<=105) return 'Motor op temperatuur'+plus;
    // 105–112 °C: één grens (PLKenmerk.koelwater, #532) — bij een
    // kenveldthermostaat normaal, dan zegt de rondgang dat niet als "heet".
    if(koel<=112 && o && o.koel && o.koel.niveau==='onbeslist') return 'Motor warm: deze motor draait mogelijk bewust zo warm'+plus;
    return 'Motor heet: houd de temperatuur in de gaten'+plus;
  }
  if(k==='laden'){
    const u=v['0142'], rpm=v['010C'];
    if(!getal(u)) return null;
    const U=nl(u,1)+' V';
    if(getal(rpm) && rpm>400){
      // o.laad = PLKenmerk.laadspanning() (#532): één grens, met de
      // gevraagde laadspanning als de auto die geeft.
      const L=o && o.laad;
      if(L && L.niveau==='onbeslist') return 'Laadspanning '+U+': met een slimme laadregeling normaal — de gevraagde laadspanning maakt het zeker';
      if(L && L.niveau==='fout') return 'Motor draait maar de accu krijgt '+U+': blijft dat zo, laat de dynamo nakijken';
      if(L && L.tekst) return L.tekst.charAt(0).toUpperCase()+L.tekst.slice(1);
      if(u>=13.2) return 'De dynamo laadt de accu ('+U+')';
      if(u>=12.2) return 'Laadspanning '+U+': met een slimme laadregeling normaal — de gevraagde laadspanning maakt het zeker';
      return 'Motor draait maar de accu krijgt '+U+': blijft dat zo, laat de dynamo nakijken';
    }
    if(getal(rpm)){
      if(u>=12.6) return 'Accu in rust '+U+': vol';
      if(u>=12.2) return 'Accu in rust '+U+': half vol';
      return 'Accu in rust '+U+': zwak — laat hem nakijken';
    }
    return u>=13.2 ? 'De accu wordt geladen ('+U+')' : null;
  }
  if(k==='kat'){
    const z=o.zwaai || function(){ return null; }, voor=z('0114'), na=z('0115');
    if(!getal(voor) || !getal(na) || voor<0.4) return null;   // voor schakelt niet: geen regelkring, geen uitspraak
    if(getal(koel) && koel<70) return null;
    if(na<0.25) return 'De voorste sonde schakelt, de achterste blijft rustig: de katalysator doet zijn werk';
    if(na>=0.5) return 'De achterste sonde schakelt mee met de voorste — bij een warme motor kan dat op een vermoeide katalysator wijzen';
    return null;
  }
  return null;
}

// ══ HET SCHERM ═══════════════════════════════════════════════════════
let _st={ i:0, start:Date.now(), pauze:false, alarm:-1 };
let _ind={ kop:[], dias:[] }, _klok=null, _blad=null, _vorigeI=-1;

function lees(k){ try{ return localStorage.getItem(k); }catch(e){ console.warn('PLRond: '+k+' niet leesbaar', e); return null; } }
function schrijf(k, v){ try{ localStorage.setItem(k, v); }catch(e){ console.warn('PLRond: '+k+' niet bewaard', e); } }
function ms(){ return schoonMs(lees('pl_rond_ms')); }
function uitLijst(){ try{ return schoonUit(JSON.parse(lees('pl_rond_uit')||'[]')); }catch(e){ console.warn('PLRond: pl_rond_uit onleesbaar', e); return []; } }
function eigenLijst(){ try{ return schoonEigen(JSON.parse(lees('pl_rond_eigen')||'{}')); }catch(e){ console.warn('PLRond: pl_rond_eigen onleesbaar', e); return {}; } }
function aan(){ return lees('pl_slim_modus')!=='dash'; }
function laadNu(){
  try{ return (window.PLKenmerk && typeof pidVals!=='undefined') ? PLKenmerk.laadLive(pidVals['0142'], pidVals['010C']) : null; }
  catch(e){ console.warn('PLRond: laadoordeel', e); return null; }
}
function koelNu(){
  try{ return (window.PLKenmerk && typeof pidVals!=='undefined' && typeof pidVals['0105']==='number') ? PLKenmerk.koelLive(pidVals['0105']) : null; }
  catch(e){ console.warn('PLRond: koelwateroordeel', e); return null; }
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function def(pid){ try{ return (typeof getPidDef==='function') ? getPidDef(pid) : null; }catch(e){ console.warn('PLRond: getPidDef('+pid+')', e); return null; } }
function motor(){ try{ return (typeof detectEngineType==='function') ? (detectEngineType() || 'benzine') : 'benzine'; }catch(e){ console.warn('PLRond: motorsoort onleesbaar', e); return 'benzine'; } }
function inLijst(){ try{ return (typeof discoveredPIDDefs!=='undefined' && Array.isArray(discoveredPIDDefs)) ? discoveredPIDDefs : []; }catch(e){ console.warn('PLRond: keuzelijst onleesbaar', e); return []; } }
function actief(pid){
  try{ return typeof activePIDs!=='undefined' && activePIDs.has(pid) && levert(pid); }
  catch(e){ console.warn('PLRond: activePIDs onleesbaar', e); return false; }
}
function levert(pid){
  const l=inLijst();
  if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) return false;
  if(typeof pidIsTekst==='function' && pidIsTekst(pid)) return false;
  return l.length ? l.some(function(d){ return d.pid===pid; }) : !!def(pid);
}
function catVan(pid){
  const d=def(pid); if(!d) return null;
  if(d.unit==='°C') return 'temp';
  return (typeof ovzCat==='function') ? ovzCat(d, pid) : null;
}
function opbouw(){
  let extra=[];
  try{ if(typeof activePIDs!=='undefined') extra=Array.from(activePIDs); }catch(e){ console.warn('PLRond: activePIDs onleesbaar', e); }
  _ind=indeling(motor(), { heeft:actief, heeftKop:levert, extra:extra, cat:catVan, uit:uitLijst(), eigen:eigenLijst() });
  if(_st.i>=_ind.dias.length) _st.i=0;
  return _ind;
}
function oordeel(pid){
  const v=(typeof pidVals!=='undefined') ? pidVals[pid] : undefined;
  if(v===undefined || v===null || typeof pidOordeel!=='function') return 'ok';
  try{ if(typeof plOud==='function' && plOud(pid, Date.now())) return 'ok'; }catch(e){ console.warn('PLRond: plOud('+pid+')', e); }
  return pidOordeel(def(pid), v, pid);
}
// Alleen de kop: snelheid en toerental horen altijd in beeld.
function zorgPids(){
  const nodig=pidsVan(_ind.kop)
    .filter(function(p){ return !(typeof activePIDs!=='undefined' && activePIDs.has(p)); });
  if(!nodig.length || typeof pidToevoegen!=='function') return;
  try{ pidToevoegen(nodig, { handmatig:false }); }catch(e){ console.warn('PLRond: sensoren aanzetten mislukt', e); }
}
function draait(){
  return aan() && typeof pidViewMode!=='undefined' && pidViewMode==='slim' && !!document.getElementById('rondVoort');
}
// Live in beeld? Zo niet, dan wisselt de rondgang niet en remt hij niets.
function inBeeld(){
  const v=document.getElementById('rondVoort');
  return !!v && v.getClientRects().length>0 && !document.hidden;
}

function naam(pid){ const d=def(pid); return (typeof ovzNaam==='function') ? ovzNaam(pid, d) : ((d && d.name) || pid); }
function eenheid(pid){ const d=def(pid); return (d && d.unit) || ''; }
function schaal(pid){
  const d=def(pid)||{}, lo=(typeof d.min==='number') ? d.min : 0;
  let hi=(typeof d.max==='number' && d.max>lo) ? d.max : lo+100;
  return { lo:lo, hi:hi };
}
function deel(pid, v, eigen){
  const s=(eigen && eigen.hi>eigen.lo) ? eigen : schaal(pid), n=Number(v);
  return isFinite(n) ? Math.max(0, Math.min(100, (n-s.lo)/(s.hi-s.lo)*100)) : 0;
}
// Puur: de vulling van een balk vanuit het midden, als links/breedte in %.
function midVulling(v, midden, span){
  const n=Number(v); if(!isFinite(n) || !(span>0)) return { links:50, breed:0 };
  const f=Math.max(-1, Math.min(1, (n-midden)/span));
  return f<0 ? { links:50+f*50, breed:-f*50 } : { links:50, breed:f*50 };
}

// ── Eén paneel als HTML ──
function wHtml(pid){ return '<b id="rv-'+pid+'">—</b><i>'+esc(eenheid(pid))+'</i>'; }
function paneelHtml(g){
  const kop=g.titel ? '<h4>'+esc(g.titel)+'</h4>' : '';
  if(g.soort==='held'){
    const p=g.tegels[0].pids[0];
    return '<div class="rk rk-held" id="rt-'+p+'" data-s="held"><h4>'+esc(naam(p))+'</h4><div class="rk-w">'+wHtml(p)+'</div>'+
      '<svg class="rk-lijn" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline id="rl-'+p+'" points=""/></svg></div>';
  }
  if(g.soort==='staaf') return '<div class="rk rk-staven">'+kop+'<div class="rs">'+g.tegels.map(function(t){
    const p=t.pids[0], sch=(typeof t.hi==='number') ? { lo:t.lo, hi:t.hi } : null;
    const ref=(typeof t.ref==='number') ? '<u style="bottom:'+deel(p, t.ref, sch).toFixed(1)+'%"></u>' : '';
    return '<div class="rs-s" id="rt-'+p+'" data-s="staaf"'+(sch ? ' data-lo="'+sch.lo+'" data-hi="'+sch.hi+'"' : '')+'><div class="rs-w">'+wHtml(p)+'</div><div class="rs-buis"><i id="rf-'+p+'"></i>'+ref+'</div><span>'+esc(t.label || naam(p))+'</span></div>';
  }).join('')+'</div></div>';
  if(g.soort==='mid') return '<div class="rk rk-mid">'+kop+g.tegels.map(function(t){
    const p=t.pids[0];
    return '<div class="rm" id="rt-'+p+'" data-s="mid" data-m="'+t.midden+'" data-span="'+t.span+'"><span>'+esc(t.label || naam(p))+'</span>'+
      '<div class="rm-baan"><em></em><i id="rf-'+p+'"></i></div><div class="rm-w">'+wHtml(p)+'</div></div>';
  }).join('')+'<div class="rm-as"><span>'+(g.tegels[0].midden-g.tegels[0].span)+'</span><span>'+g.tegels[0].midden+'</span><span>+'+(g.tegels[0].midden+g.tegels[0].span)+'</span></div></div>';
  if(g.soort==='meter') return '<div class="rk rk-meters">'+g.tegels.map(function(t){
    const p=t.pids[0];
    return '<div class="rmtr" id="rt-'+p+'" data-s="meter"><span>'+esc(naam(p))+'</span><svg viewBox="0 0 120 66" aria-hidden="true">'+
      '<path class="dt-meter-bak" d="M12 60A48 48 0 0 1 108 60" pathLength="100"/>'+
      '<path class="dt-meter-vul" id="rf-'+p+'" d="M12 60A48 48 0 0 1 108 60" pathLength="100" stroke-dasharray="0 200"/></svg><div class="rk-w">'+wHtml(p)+'</div></div>';
  }).join('')+'</div>';
  return '<div class="rk rk-rijen">'+kop+g.tegels.map(function(t){
    const p=t.pids[0], d=def(p), b=(typeof ovzBand==='function') ? ovzBand(d, null) : { heeft:false, z0:0, z1:100 };
    return '<div class="rr" id="rt-'+p+'" data-s="rij"><span>'+esc(naam(p))+'</span><div class="rr-w">'+wHtml(p)+'</div>'+
      '<div class="gband rr-band'+(b.heeft?'':' geen')+'" id="rb-'+p+'"><i style="left:'+b.z0.toFixed(1)+'%;width:'+(b.z1-b.z0).toFixed(1)+'%"></i><u></u></div></div>';
  }).join('')+'</div>';
}
// Een knop onder de dia als deze categorie sensoren heeft die uit staan.
// Aanzetten blijft een keuze (alleAan()): de selectie is van het voertuig.
function mistHtml(d){
  const c=d ? d.cat : null, n=nogUit(c).length;
  if(!n) return '';
  return '<button type="button" class="rond-mist" id="rondMist" onclick="PLRond.alleAan()">+ '+n+' sensoren '+(c ? 'van '+esc(catDef(c).naam.toLowerCase())+' ' : '')+'staan uit — zet ze aan</button>';
}
function kopHtml(){
  return _ind.kop.map(function(t){ const p=t.pids[0]; return '<span class="rond-kv" id="rt-'+p+'" data-s="kop">'+wHtml(p)+'</span>'; }).join('');
}

// Het hele scherm, in de plek van PLDash (pidlane-dashboard.js).
function bouw(g){
  opbouw(); zorgPids();
  const n=_ind.dias.length, d=_ind.dias[_st.i];
  const alarmPid=(_st.alarm>=0 && d) ? pidsVan(d.tegels).filter(function(p){ return oordeel(p)==='danger'; })[0] : null;
  const ad=alarmPid ? def(alarmPid) : null;
  g.innerHTML='<div class="rond-boven">'+
      '<div class="rond-kop">'+kopHtml()+
        '<button type="button" class="rond-k'+(_st.pauze?' aan':'')+'" id="rondPauze" onclick="PLRond.pauze()" aria-label="'+(_st.pauze?'Verder':'Pauze')+'">'+(_st.pauze?'▶':'⏸')+'</button>'+
        '<button type="button" class="rond-k" onclick="PLRond.instellingen()" aria-label="Rondgang instellen">⚙</button></div>'+
      '<div class="rond-voort'+(_st.alarm>=0?' alarm':'')+(_st.pauze?' stil':'')+'" id="rondVoort"><i></i></div></div>'+
    (alarmPid ? '<div class="rond-alarm" id="rondAlarm">⚠ '+esc((ad && ad.name) || alarmPid)+' buiten de grens — de rondgang blijft hier staan</div>' : '')+
    '<div class="rond-dia" id="rondDia">'+
      '<button type="button" class="rond-titel" id="rondTitel" onclick="PLRond.stap(1)" aria-label="Volgende categorie">'+
        (d ? esc(d.ico+' '+d.naam) : 'Nog geen sensoren aan — ⚙ zet ze aan')+'<small>'+(n ? (_st.i+1)+' / '+n : '')+'</small></button>'+
      (d && d.duid.length ? '<p class="rond-duid" id="rondDuid" hidden></p>' : '')+
      (d ? groepen(d.tegels).map(paneelHtml).join('') : '')+
      mistHtml(d)+
    '</div>';
  _ind.kop.concat(d ? d.tegels : []).forEach(function(t){ t.pids.forEach(function(p){
    if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); }); });
  duidBij();
  na();
}

// ── Eén binnenkomende waarde ──
const _lijnVuil={}; let _lijnGepland=false;
function bij(pid, val){
  const el=document.getElementById('rt-'+pid); if(!el) return;
  const v=(window.PLToon) ? PLToon.waarde(pid, val) : val, d=def(pid);
  const st=(typeof pidOordeel==='function') ? pidOordeel(d, v, pid) : 'ok';
  const w=document.getElementById('rv-'+pid);
  if(w){
    const t=((window.PLToon && PLToon.tekst(pid, v)) || ((typeof fv==='function') ? fv(v, d) : String(v)));
    if(w.textContent!==t) w.textContent=t;
  }
  el.classList.toggle('warn', st==='warn'); el.classList.toggle('danger', st==='danger');
  const f=document.getElementById('rf-'+pid), s=el.getAttribute('data-s');
  if(f && s==='staaf') f.style.height=deel(pid, v, el.hasAttribute('data-hi') ? { lo:Number(el.getAttribute('data-lo')), hi:Number(el.getAttribute('data-hi')) } : null).toFixed(1)+'%';
  if(f && s==='mid'){ const m=midVulling(v, Number(el.getAttribute('data-m')), Number(el.getAttribute('data-span'))); f.style.left=m.links.toFixed(1)+'%'; f.style.width=m.breed.toFixed(1)+'%'; }
  if(f && s==='meter') f.setAttribute('stroke-dasharray', deel(pid, v).toFixed(1)+' 200');
  const b=document.getElementById('rb-'+pid);
  if(b && typeof ovzBand==='function'){
    const r=ovzBand(d, v), u=b.lastChild;
    if(u && r.pos!==null) u.style.left='calc('+r.pos.toFixed(1)+'% - 1.5px)';
    b.classList.toggle('warn', st==='warn'); b.classList.toggle('danger', st==='danger');
  }
  if(s==='held') _lijnVuil[pid]=1;
  if(!_lijnGepland){ _lijnGepland=true; setTimeout(function(){ _lijnGepland=false; Object.keys(_lijnVuil).forEach(lijn); duidBij(); }, 400); }
}
// De regel "wat dit zegt": de verse waarden die duiding() leest.
const DUID_PIDS=['0104','010C','010D','010B','0187','0133','0106','0107','0105','0167','0146','0142'];
function vers(pid){
  const v=(typeof pidVals!=='undefined') ? pidVals[pid] : undefined;
  if(!getal(v)) return undefined;
  try{ if(typeof plOud==='function' && plOud(pid, Date.now())) return undefined; }catch(e){ console.warn('PLRond: plOud('+pid+')', e); }
  return v;
}
function zwaai(pid){
  const h=(typeof pidHist!=='undefined') ? pidHist[pid] : null, van=Date.now()-30000;
  if(!h) return null;
  const v=h.filter(function(x){ return x && x.t>=van && getal(x.v); }).map(function(x){ return x.v; });
  return v.length<8 ? null : Math.max.apply(null, v)-Math.min.apply(null, v);
}
function duidBij(){
  const el=document.getElementById('rondDuid'), d=_ind.dias[_st.i];
  if(!el || !d) return;
  const v={};
  DUID_PIDS.forEach(function(p){ const x=vers(p); if(x!==undefined) v[p]=x; });
  const ped=['0149','015A','014A','014B'].filter(function(p){ return vers(p)!==undefined; })[0];
  if(ped) v.pedaal=(window.PLToon) ? PLToon.waarde(ped, vers(ped)) : vers(ped);
  const regels=d.duid.map(function(k){ return duiding(k, v, { zwaai:zwaai, diesel:motor()==='diesel', laad:laadNu(), koel:koelNu() }); }).filter(Boolean);
  const t=regels.join('\n');
  if(el.textContent!==t) el.textContent=t;
  el.hidden=!t;
}
function lijn(pid){
  delete _lijnVuil[pid];
  const l=document.getElementById('rl-'+pid), h=(typeof pidHist!=='undefined') ? pidHist[pid] : null;
  if(!l || !h || h.length<2) return;
  const v=h.slice(-60).map(function(x){ return x && x.v; }).filter(function(x){ return typeof x==='number' && isFinite(x); });
  if(v.length<2) return;
  const mn=Math.min.apply(null,v), mx=Math.max.apply(null,v), rg=(mx-mn)||1;
  l.setAttribute('points', v.map(function(y,i){ return (i/(v.length-1)*100).toFixed(1)+','+(28-(y-mn)/rg*26).toFixed(1); }).join(' '));
}
function voortBij(){
  const v=document.getElementById('rondVoort'); if(!v || !v.firstChild) return;
  v.firstChild.style.width=(_st.alarm>=0 ? 100 : voortgang(_st, Date.now(), ms())*100).toFixed(1)+'%';
}
function herbouw(){ if(window.PLDash) PLDash.bouw(); }
function klokTik(){
  if(!draait()){ stopKlok(); return; }
  if(!inBeeld()) return;
  const nu=Date.now(), was=_st.i, wasAlarm=_st.alarm;
  _st=tik(_st, nu, { n:_ind.dias.length, ms:ms(), alarm:alarmDia(_ind.dias, oordeel) });
  if(_st.i!==was || _st.alarm!==wasAlarm) herbouw(); else voortBij();
}
function startKlok(){ if(!_klok) _klok=setInterval(klokTik, TIK_MS); }
function stopKlok(){ if(_klok){ clearInterval(_klok); _klok=null; } }
// Na het tekenen: vegen, de klok en de overgang.
function na(){
  const r=document.getElementById('rondDia');
  if(r){
    if(_vorigeI!==_st.i) r.classList.add('rond-in');
    _vorigeI=_st.i;
    let x0=null, y0=null;
    r.addEventListener('touchstart', function(e){ const t=e.touches[0]; x0=t.clientX; y0=t.clientY; }, { passive:true });
    r.addEventListener('touchend', function(e){
      if(x0===null) return;
      const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0; x0=null;
      if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5) api.stap(dx<0 ? 1 : -1);
    }, { passive:true });
  }
  voortBij(); startKlok();
}

// ── Remmen op de bus — gelezen in pidPollInterval() ──
function remt(pid){
  if(!pid || !draait() || !inBeeld()) return false;
  // Alleen snelle PIDs, net als Visueel: een trage sensor staat al ver
  // boven REM_MS, en alles remmen houdt de groepsregelaar in de pollus te
  // weinig verzoeken over om een kloon te herkennen (bproef-groepsproef.js).
  if(!/^01/i.test(String(pid))) return false;
  const klasse=(window.PID_POLL_CLASS||{})[String(pid).slice(2).toUpperCase()];
  if(!(typeof klasse==='number' && klasse<=SNEL_MS)) return false;
  if(pidsVan(_ind.kop).indexOf(pid)>-1) return false;
  const n=_ind.dias.length; if(n<2) return false;
  const iDia=_ind.dias.findIndex(function(d){ return pidsVan(d.tegels).indexOf(pid)>-1; });
  if(iDia<0 || iDia===_st.i) return false;
  if(_st.alarm<0 && !_st.pauze && iDia===(_st.i+1)%n && ms()*(1-voortgang(_st, Date.now(), ms()))<=VOOR_MS) return false;
  return true;
}

// Wat de auto voor de rondgang heeft maar nog uit staat; met c alleen die categorie.
function nogUit(c){
  const vol=indeling(motor(), { heeft:levert, uit:uitLijst(), eigen:eigenLijst() });
  return vol.dias.filter(function(d){ return !c || d.cat===c; }).reduce(function(a,d){ return a.concat(pidsVan(d.tegels)); }, [])
    .filter(function(p){ return !actief(p); });
}
function alleAan(){
  const n=nogUit();
  if(n.length && typeof pidToevoegen==='function'){
    try{ pidToevoegen(n, { handmatig:true }); }catch(e){ console.warn('PLRond: sensoren aanzetten mislukt', e); }
  }
  return n.length;
}

// ── Het ⚙-blad: wisseltijd en vinkjes ──
function sluitBlad(){ if(_blad && _blad.parentNode) _blad.parentNode.removeChild(_blad); _blad=null; }
function instellingen(){
  sluitBlad();
  const nu=ms(), uit=uitLijst(), mist=nogUit().length, eigen=eigenLijst();
  _blad=document.createElement('div'); _blad.className='dash-blad-ov'; _blad.id='rondBlad'; _blad.style.zIndex='9900';
  _blad.onclick=function(e){ if(e.target===_blad) sluitBlad(); };
  _blad.innerHTML='<div class="dash-blad"><h5>Rondgang in Slim</h5><p>Elke categorie blijft zo lang in beeld</p>'+
    '<div class="dash-keus rond-tijd">'+KEUZES_MS.map(function(m){ return '<button type="button"'+(m===nu?' class="aan"':'')+' onclick="PLRond.zetMs('+m+')">'+(m/1000)+' s</button>'; }).join('')+'</div>'+
    '<p>Welke categorieën meedoen — met ＋ zet je er zelf een sensor bij</p>'+CATS.map(function(d){
      const op=uit.indexOf(d.id)<0, mijn=eigen[d.id]||[];
      return '<button type="button" class="dash-regel" role="switch" aria-checked="'+op+'" data-dia="'+d.id+'" onclick="PLRond.zetDia(\''+d.id+'\')">'+esc(d.ico+' '+d.naam)+'<small>'+(op?'☑':'☐')+'</small></button>'+
        '<div class="rond-eigen" data-cat="'+d.id+'">'+mijn.map(function(p){
          return '<button type="button" class="rond-chip" title="Weghalen" onclick="PLRond.eigenWeg(\''+d.id+'\',\''+esc(p)+'\')">'+esc(naamVan(p))+' ✕</button>';
        }).join('')+'<button type="button" class="rond-chip plus" onclick="PLRond.kies(\''+d.id+'\')">＋ Sensor</button></div>';
    }).join('')+
    '<p>De rondgang toont de sensoren die aan staan. '+(mist ? mist+' sensoren van deze auto horen erbij maar staan uit.' : 'Alles wat deze auto ervoor heeft staat aan.')+'</p>'+
    (mist ? '<div class="dash-keus twee" style="grid-template-columns:1fr"><button type="button" id="rondAlleAan" onclick="PLRond.alleAan()">Zet ze aan ('+mist+')</button></div>' : '')+
    '<p>Snelheid en toerental staan altijd bovenaan. Een sensor in het rood houdt de rondgang op zijn categorie vast.</p>'+
    '<div class="dash-keus twee"><button type="button" onclick="PLRond.modus(\'dash\');PLRond.sluit()">Mijn dashboard</button><button type="button" class="hoofd" onclick="PLRond.sluit()">Klaar</button></div></div>';
  document.body.appendChild(_blad);
}

function naamVan(p){ const d=def(p)||inLijst().filter(function(x){ return x.pid===p; })[0]; return (d && d.name) ? d.name : p; }
// Wat je bij een categorie kunt zetten: alles wat deze auto levert, op naam,
// zonder wat er al met de hand in deze categorie staat.
function kandidaten(c, zoek){
  const al=eigenLijst()[c]||[], q=String(zoek||'').toLowerCase().trim();
  return inLijst().map(function(d){ return d.pid; })
    .filter(function(p, i, a){ return a.indexOf(p)===i && al.indexOf(p)<0 && levert(p); })
    .map(function(p){ return { pid:p, naam:naamVan(p), aan:actief(p) }; })
    .filter(function(k){ return !q || k.naam.toLowerCase().indexOf(q)>-1 || k.pid.toLowerCase().indexOf(q)>-1; })
    .sort(function(a, b){ return (b.aan-a.aan) || a.naam.localeCompare(b.naam, 'nl'); });
}
let _kiesCat=null;
function kiesLijst(){
  const el=document.getElementById('rondKiesLijst'), z=document.getElementById('rondKiesZoek'); if(!el) return;
  const k=kandidaten(_kiesCat, z ? z.value : '');
  el.innerHTML=k.length ? k.slice(0, 80).map(function(x){
    return '<button type="button" class="dash-regel" data-pid="'+esc(x.pid)+'" onclick="PLRond.eigenErbij(\''+_kiesCat+'\',\''+esc(x.pid)+'\')">'+esc(x.naam)+'<small>'+(x.aan ? 'aan' : 'uit · gaat aan')+'</small></button>';
  }).join('') : '<p>Niets gevonden. Een sensor die de auto niet geeft, staat hier niet.</p>';
}
function kies(c){
  if(CAT_IDS.indexOf(c)<0) return;
  sluitBlad(); _kiesCat=c;
  const d=catDef(c);
  _blad=document.createElement('div'); _blad.className='dash-blad-ov'; _blad.id='rondBlad'; _blad.style.zIndex='9900';
  _blad.onclick=function(e){ if(e.target===_blad) instellingen(); };
  _blad.innerHTML='<div class="dash-blad"><h5>'+esc(d.ico+' '+d.naam)+': sensor erbij</h5>'+
    '<p>Komt op de laatste pagina van deze categorie, en nergens anders meer.</p>'+
    '<input id="rondKiesZoek" type="search" placeholder="Zoek op naam of PID…" oninput="PLRond.kiesZoek()" style="width:100%;box-sizing:border-box;margin:0 0 8px">'+
    '<div id="rondKiesLijst" style="max-height:50vh;overflow:auto"></div>'+
    '<div class="dash-keus twee" style="grid-template-columns:1fr"><button type="button" onclick="PLRond.instellingen()">Terug</button></div></div>';
  document.body.appendChild(_blad);
  kiesLijst();
}
function eigenZet(c, p, erbij){
  const e=eigenLijst();
  CAT_IDS.forEach(function(k){ if(e[k]) e[k]=e[k].filter(function(x){ return x!==p; }); });
  if(erbij) e[c]=(e[c]||[]).concat(p);
  schrijf('pl_rond_eigen', JSON.stringify(schoonEigen(e)));
  if(erbij && !actief(p) && typeof pidToevoegen==='function'){
    try{ pidToevoegen([p], { handmatig:true }); }catch(x){ console.warn('PLRond: '+p+' aanzetten mislukt', x); }
  }
  instellingen(); herbouw();
}

const api = {
  // de pure kern — voor test-rondgang.js
  DIAS:DIAS, CATS:CATS, KOP:KOP, KEUZES_MS:KEUZES_MS, STANDAARD_MS:STANDAARD_MS, HOLD_MS:HOLD_MS, VOOR_MS:VOOR_MS, REM_MS:REM_MS, SNEL_MS:SNEL_MS, MAX_PER_DIA:MAX_PER_DIA,
  indeling:indeling, groepen:groepen, midVulling:midVulling, duiding:duiding, tik:tik, stapPuur:stap, voortgang:voortgang, alarmDia:alarmDia, schoonMs:schoonMs, schoonUit:schoonUit, schoonEigen:schoonEigen,
  // het scherm
  aan:aan, bouw:bouw, bij:bij, nogUit:nogUit, kandidaten:kandidaten,
  kies:kies, kiesZoek:kiesLijst, eigenErbij:function(c, p){ eigenZet(c, p, true); }, eigenWeg:function(c, p){ eigenZet(c, p, false); },
  alleAan:function(){ const n=alleAan(); if(n && typeof showToast==='function') showToast(n+' sensoren aangezet voor de rondgang'); if(_blad) instellingen(); herbouw(); return n; }, remt:remt, instellingen:instellingen, sluit:sluitBlad,
  staat:function(){ return { i:_st.i, pauze:_st.pauze, alarm:_st.alarm, ms:ms(), dias:_ind.dias.map(function(d){ return { id:d.id, naam:d.naam, duid:d.duid, pids:pidsVan(d.tegels) }; }), kop:pidsVan(_ind.kop) }; },
  modus:function(m){ schrijf('pl_slim_modus', m==='dash' ? 'dash' : 'rond'); if(m==='dash') stopKlok(); _vorigeI=-1; herbouw(); },
  stap:function(r){ _st=stap(_st, r, Date.now(), _ind.dias.length); herbouw(); },
  pauze:function(){ _st.pauze=!_st.pauze; _st.start=Date.now(); herbouw(); },
  zetMs:function(m){ schrijf('pl_rond_ms', String(schoonMs(m))); _st.start=Date.now(); instellingen(); herbouw(); },
  zetDia:function(id){
    const u=uitLijst(), i=u.indexOf(id);
    if(i>-1) u.splice(i,1); else u.push(id);
    if(schoonUit(u).length!==u.length){ if(typeof showToast==='function') showToast('Er moet minstens één categorie meedoen'); return; }
    schrijf('pl_rond_uit', JSON.stringify(u)); _st.i=0; _st.start=Date.now(); instellingen(); herbouw();
  }
};
window.PLRond = api;
})();
