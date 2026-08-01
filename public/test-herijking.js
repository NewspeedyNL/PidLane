// Tijdlijntest voor de herijking (PIDLANE.md §15, ronde 5).
//
// test-pidgate.js toetst of de gate het JUISTE ANTWOORD geeft. Deze test
// toetst of hij op het JUISTE MOMENT wordt gesteld — dat is een andere vraag,
// en precies de vraag die ronde 5 beantwoordt.
//
// De opzet is een tijdlijn: bouw de bronlijst op een moment dat de kennis nog
// onvolledig is, laat de kennis daarna binnendruppelen, en controleer dat de
// lijst meebeweegt. Zonder herijking blijft een fantoomsensor staan; dát was
// de bug.
//
//   node test-herijking.js
//
const fs = require('fs');

// ── Stukken echte code uit de modules halen ──────────────────────────
// Zo test je wat er straks draait, niet een kopie die uit de pas gaat lopen.
function pak(bestand, van, tot){
  const src = fs.readFileSync(__dirname + '/' + bestand, 'utf8');
  const i = src.indexOf(van);
  if(i < 0) throw new Error(`"${van}" niet gevonden in ${bestand}`);
  const j = src.indexOf(tot, i);
  if(j < 0) throw new Error(`"${tot}" niet gevonden in ${bestand}`);
  return src.slice(i, j);
}

const GATE = pak('pidlane-pidgate.js', 'function _engineWarmRunning', '// ── einde gate-blok');

// ── Minimale wereld om die code in te laten draaien ──────────────────
function maakWereld(){
  const W = {
    pidVals: {},
    _pidHealth: {},
    supportedPIDs: new Set(),
    activePIDs: new Set(),
    manualPIDs: new Set(),
    discoveredPIDDefs: [],
    vehicleInfo: { brandstof: '' },
    herbouwd: 0,
    DIESEL_SCR_PIDS: new Set(['017C', '0183', '019A']),   // DPF, NOx, AdBlue
    EV_AFWEZIGE_PIDS: new Set(['0106']),
    GEEN_SENSOR_PIDS: new Set(['0100', '0120']),
    _B1B2_PAIR: {},
    DEFS: {
      '010C': { name: 'Toerental', unit: 'rpm', cat: 'Motor' },
      '010B': { name: 'Inlaatdruk', unit: 'kPa', cat: 'Motor' },
      '0104': { name: 'Motorbelasting', unit: '%', cat: 'Motor' },
      '0111': { name: 'Gasklep', unit: '%', cat: 'Motor' },
      '0105': { name: 'Koelvloeistof', unit: '\u00b0C', cat: 'Temp' },
      '017C': { name: 'DPF temp', unit: '\u00b0C', cat: 'Emissie' },
      '0183': { name: 'NOx sensor', unit: 'ppm', cat: 'Emissie' },
      '019A': { name: 'AdBlue niveau', unit: '%', cat: 'Emissie' },
      '0170': { name: 'Laaddruk', unit: 'kPa', cat: 'Motor' }
    }
  };
  W.vehicleFuelType = () => W.vehicleInfo.brandstof;
  W.ALL_PID_DEFS = W.DEFS;   // echte getPidDef() uit pidlane-pidgate.js kijkt hierin
  W.PIDS = [];
  W.log = () => {}; W.btDiag = () => {};
  W.renderGauges = () => {}; W.rebuildGSel = () => {};
  W.document = { getElementById: () => null };

  // De echte bouwlogica uit buildDiscoveredPIDList(), teruggebracht tot waar
  // het hier om gaat: de lijst komt uit supportedPIDs door de gate op 'bestaat'.
  W.buildDiscoveredPIDList = function(){
    W.herbouwd++;
    W.discoveredPIDDefs.length = 0;
    W.supportedPIDs.forEach(pid => {
      if(!W.pidGate(pid, 'bestaat')) return;
      W.discoveredPIDDefs.push({ pid, ...(W.DEFS[pid] || { name: 'PID ' + pid, unit: 'raw', cat: 'Overig' }) });
    });
  };

  const namen = Object.keys(W);
  const fn = new Function(...namen, GATE + '\nreturn {pidGate,herijkPidGate,pidToevoegen,plHerijkTick,markeerHerijking,_noteMap,_isNaturallyAspirated,vehiclePlausiblePid};');
  Object.assign(W, fn(...namen.map(n => W[n])));

  // updPID() zoals pidlane-pids.js hem aanroept: waarde wegschrijven, MAP
  // noteren bij 010B, nodata opwaarderen, dan de tick.
  W.updPID = function(pid, val){
    W.pidVals[pid] = val;
    if(pid === '010B') W._noteMap();
    if(val !== null && val !== undefined && W._pidHealth[pid] === 'nodata'){
      W._pidHealth[pid] = 'ok';
      W.markeerHerijking();
    }
    W.plHerijkTick();
  };
  return W;
}

// ── Toetsen ──────────────────────────────────────────────────────────
let fouten = 0, gedaan = 0;
function eis(wat, voorwaarde){
  gedaan++;
  if(voorwaarde){ console.log('  ok    ' + wat); }
  else { fouten++; console.log('  FAAL  ' + wat); }
}
function inLijst(W, pid){ return W.discoveredPIDDefs.some(d => d.pid === pid); }

console.log('\n1. Fantoomsensor verdwijnt uit de bronlijst zodra de brandstof bekend wordt');
{
  const W = maakWereld();
  // Verbinden: brandstof nog onbekend, dus alles mag mee.
  ['010C', '010B', '0104', '0111', '0105', '017C', '0183', '019A'].forEach(p => W.supportedPIDs.add(p));
  W.buildDiscoveredPIDList();
  ['017C', '0183', '019A'].forEach(p => { W.activePIDs.add(p); W.manualPIDs.add(p); });
  eis('AdBlue staat in de lijst zolang de brandstof onbekend is', inLijst(W, '019A'));
  eis('AdBlue staat in de selectie', W.activePIDs.has('019A'));

  // RDW antwoordt: benzine.
  W.vehicleInfo.brandstof = 'benzine';
  const weg = W.herijkPidGate('brandstoftype: benzine');

  eis('AdBlue is uit de SELECTIE verwijderd', !W.activePIDs.has('019A'));
  eis('AdBlue is uit de BRONLIJST verdwenen  <- dit was de bug', !inLijst(W, '019A'));
  eis('NOx en DPF ook weg', !inLijst(W, '0183') && !inLijst(W, '017C'));
  eis('echte sensoren blijven staan', inLijst(W, '010C') && inLijst(W, '0105'));
  eis('drie stuks gemeld', weg === 3);
  eis('manualPIDs is meegeschoond', !W.manualPIDs.has('019A'));
}

console.log('\n2. Volgorde: bronlijst eerst, dan pas de selectie');
{
  const W = maakWereld();
  ['010C', '019A'].forEach(p => W.supportedPIDs.add(p));
  W.buildDiscoveredPIDList();
  W.activePIDs.add('019A');
  const voor = W.herbouwd;
  W.vehicleInfo.brandstof = 'benzine';
  W.herijkPidGate('test');
  eis('bronlijst is opnieuw gebouwd', W.herbouwd === voor + 1);
  eis('lijst en selectie zijn het eens', !inLijst(W, '019A') && !W.activePIDs.has('019A'));
}

console.log('\n3. Turbo-oordeel: lage inlaatdruk mag niets bewijzen');
{
  const W = maakWereld();
  W.supportedPIDs.add('0170'); W.buildDiscoveredPIDList();
  // Turbomotor, stationair: 60 metingen, MAP laag, geen belasting.
  W.updPID('010C', 750); W.updPID('0104', 15); W.updPID('0111', 10);
  for(let i = 0; i < 60; i++) W.updPID('010B', 38);
  eis('60x lage druk levert GEEN "atmosferisch"-oordeel', W._isNaturallyAspirated() === false);
  eis('laaddruk-PID staat er nog', inLijst(W, '0170'));
}

console.log('\n4. Turbo-oordeel: hoge inlaatdruk bewijst wel iets');
{
  const W = maakWereld();
  W.supportedPIDs.add('0170'); W.buildDiscoveredPIDList();
  W.activePIDs.add('0170');
  // Atmosferische motor onder belasting: MAP blijft onder omgevingsdruk.
  W.updPID('010C', 3200); W.updPID('0104', 82); W.updPID('0111', 70);
  for(let i = 0; i < 20; i++) W.updPID('010B', 96);
  eis('20x hoge druk levert wel een oordeel', W._isNaturallyAspirated() === true);
  eis('laaddruk-PID is uit de bronlijst gehaald', !inLijst(W, '0170'));
  eis('en uit de selectie', !W.activePIDs.has('0170'));
}

console.log('\n5. Turbo die boost ziet blijft turbo');
{
  const W = maakWereld();
  W.supportedPIDs.add('0170'); W.buildDiscoveredPIDList();
  W.updPID('010C', 3400); W.updPID('0104', 88); W.updPID('0111', 75);
  for(let i = 0; i < 20; i++) W.updPID('010B', 180);   // ruim boven 106 kPa
  eis('piek boven omgevingsdruk = geen "atmosferisch"', W._isNaturallyAspirated() === false);
  eis('laaddruk-PID blijft staan', inLijst(W, '0170'));
}

console.log('\n6. nodata is herzienbaar');
{
  const W = maakWereld();
  W.supportedPIDs.add('0105'); W.buildDiscoveredPIDList();
  W._pidHealth['0105'] = 'nodata';                 // gezondheidscheck kreeg niets
  eis('nodata-PID is niet kiesbaar', W.pidGate('0105', 'kiesbaar') === false);
  W.updPID('0105', 87);                            // maar later komt er wel data
  eis('geldige waarde waardeert nodata op naar ok', W._pidHealth['0105'] === 'ok');
  eis('en de PID is weer kiesbaar', W.pidGate('0105', 'kiesbaar') === true);
}

console.log('\n7. Herijken gebeurt niet bij elke meting');
{
  const W = maakWereld();
  ['010C', '0105'].forEach(p => W.supportedPIDs.add(p));
  W.buildDiscoveredPIDList();
  W.updPID('010C', 800);                 // eerste tick: alleen stempel vastleggen
  const na1 = W.herbouwd;
  for(let i = 0; i < 200; i++) W.updPID('010C', 800 + (i % 5));
  eis('200 metingen zonder kennisverandering = 0 herbouwen', W.herbouwd === na1);
  W.vehicleInfo.brandstof = 'diesel';    // nu verandert er wel iets
  W.updPID('010C', 820);
  eis('kennisverandering leidt tot precies 1 herbouw', W.herbouwd === na1 + 1);
}

console.log('\n8. Warm-grendel klapt niet heen en weer');
{
  const W = maakWereld();
  W.supportedPIDs.add('0105'); W.buildDiscoveredPIDList();
  W.updPID('010C', 800);
  const start = W.herbouwd;
  W.updPID('0105', 90); W.updPID('010C', 900);   // motor warm en draaiend
  const naWarm = W.herbouwd;
  eis('warm worden herijkt eenmalig', naWarm === start + 1);
  W.updPID('010C', 0);                            // motor uit
  W.updPID('010C', 0);
  eis('motor uit geeft GEEN nieuwe herbouw', W.herbouwd === naWarm);
}

// CX-5 2018, rit 01-08-2026 13:14-13:18, stadsverkeer 0-65 km/h.
// Paren [inlaatdruk kPa, toerental] in meetvolgorde, uit de diagnose-export.
const RIT_CX5 = [
  [22,0], [31,586], [32,566], [32,560], [34,550], [36,555], [31,562], [34,560],
  [41,531], [32,655], [33,635], [34,571], [36,544], [54,599], [67,1037], [58,914],
  [72,887], [89,1546], [70,2105], [46,1179], [59,1280], [42,1329], [52,1342], [100,1629],
  [98,1982], [23,2258], [22,2200], [20,2071], [21,1984], [21,1697], [20,1450], [25,1012],
  [21,1215], [99,2294], [19,2788], [56,2454], [39,2297], [67,2540], [89,1877], [23,1819],
  [22,1787], [20,1760], [20,1729], [20,1664], [19,1599], [20,1501], [20,1390], [21,1296],
  [20,1200], [20,1082], [20,994], [21,838], [28,640], [27,635], [28,642], [29,647],
];
// 56 MAP-metingen, piek 100 kPa

console.log('\n9. Echte ritdata — CX-5 2018, stadsverkeer');
{
  const W = maakWereld();
  W.supportedPIDs.add('0170'); W.buildDiscoveredPIDList();
  W.activePIDs.add('0170');
  RIT_CX5.forEach(([map, rpm]) => { W.updPID('010C', rpm); W.updPID('010B', map); });
  const bewijs = RIT_CX5.filter(([m, r]) => m >= 85 && r > 300).length;
  console.log(`       ${RIT_CX5.length} metingen, piek ${Math.max(...RIT_CX5.map(p => p[0]))} kPa, ${bewijs} bruikbaar als bewijs`);
  // Dit venster is ~een kwart van de sessie (238 MAP-metingen in totaal).
  // Het haalt de drempel dus net niet, en dat is precies de bedoeling:
  // te weinig bewijs -> geen oordeel -> geen filter -> geen tegel kwijt.
  eis('piek blijft onder de atmosferisch-grens', Math.max(...RIT_CX5.map(p => p[0])) <= 106);
  eis('te weinig bewijs in dit venster => geen oordeel', W._isNaturallyAspirated() === false);
  eis('dus laaddruk-PID blijft gewoon staan', W.activePIDs.has('0170'));

  // Zelfde rit, maar dan vier keer zo lang (de volledige sessie).
  const W2 = maakWereld();
  W2.supportedPIDs.add('0170'); W2.buildDiscoveredPIDList();
  W2.activePIDs.add('0170');
  for(let ronde = 0; ronde < 4; ronde++){
    RIT_CX5.forEach(([map, rpm]) => { W2.updPID('010C', rpm); W2.updPID('010B', map); });
  }
  eis('volledige sessie levert wel een oordeel', W2._isNaturallyAspirated() === true);
  eis('en de laaddruk-PID verdwijnt', !W2.activePIDs.has('0170'));
}

console.log('\n10. Toevoegpoort — wat er niet doorheen komt, komt er niet in');
{
  const W = maakWereld();
  W.vehicleInfo.brandstof = 'benzine';
  ['010C', '0105', '019A', '0100'].forEach(p => W.supportedPIDs.add(p));
  W.buildDiscoveredPIDList();

  const r1 = W.pidToevoegen('019A');            // AdBlue op benzine
  eis('AdBlue wordt geweigerd op een benzineauto', r1.weg.length === 1 && !r1.ok.length);
  eis('en staat dus niet in activePIDs', !W.activePIDs.has('019A'));
  eis('en ook niet in manualPIDs', !W.manualPIDs.has('019A'));

  const r2 = W.pidToevoegen(['010C', '0105']);  // gewone sensoren
  eis('gewone sensoren komen er wel in', r2.ok.length === 2 && W.activePIDs.has('010C'));
  eis('en gelden als eigen keuze', W.manualPIDs.has('010C'));

  const r3 = W.pidToevoegen('0100');            // ondersteuningsbitmap
  eis('een bitmap komt er niet in', !r3.ok.length && !W.activePIDs.has('0100'));

  // Health: 'nodata' houdt hem tegen, tenzij "Toon alles" aan staat.
  W._pidHealth['0105'] = 'nodata'; W.activePIDs.delete('0105'); W.manualPIDs.delete('0105');
  eis('een dode sensor komt er niet in', !W.pidToevoegen('0105').ok.length);
  eis('met force wel — dat is de noodklep', W.pidToevoegen('0105', {force: true}).ok.length === 1);

  // handmatig:false — remote zet de keuze van de local, niet die van deze gebruiker.
  W.pidToevoegen('010B', {handmatig: false});
  eis('handmatig:false laat manualPIDs met rust', W.activePIDs.has('010B') && !W.manualPIDs.has('010B'));
}

console.log('\n11. Deur en herijking samen — het gat waar de zeef voor stond');
{
  const W = maakWereld();
  // Brandstof nog onbekend: de deur laat de AdBlue-sensor door, terecht.
  ['010C', '0105', '019A'].forEach(p => W.supportedPIDs.add(p));
  W.buildDiscoveredPIDList();
  eis('AdBlue mag erin zolang de brandstof onbekend is', W.pidToevoegen('019A').ok.length === 1);

  // Motor draait al even: de eerste tick legt alleen de stempel vast.
  W.updPID('010C', 800);

  // RDW antwoordt: benzine. De eerstvolgende tick moet hem eruit halen.
  W.vehicleInfo.brandstof = 'benzine';
  W.updPID('010C', 810);
  eis('herijking haalt hem alsnog weg', !W.activePIDs.has('019A'));

  // En de deur laat hem daarna niet opnieuw binnen — dít is wat er vóór
  // ronde 6 misging: herijken hielp niet als een toevoegpad er direct
  // daarna weer iets in schreef.
  eis('de deur laat hem niet terugkomen', !W.pidToevoegen('019A').ok.length);
  eis('ook niet via een analyseprofiel', !W.pidGate('019A', 'kiesbaar'));
}

console.log(`\n${gedaan} toetsen, ${fouten} fout.`);
console.log(fouten ? 'FAAL — herijking gedraagt zich niet zoals bedoeld.'
                   : 'OK — de gate wordt op de juiste momenten opnieuw gesteld.');
process.exit(fouten ? 1 : 0);
