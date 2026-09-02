// ══════════════════════════════════════════════════════════════════
// test-selectielog.js — een selectiewijziging laat een spoor na (#31)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Het log van de rit van 27-08-2026 had dertien regels "Sensor uitgezet via
// dubbeltik" en geen enkele regel over een sensor die erbij kwam. Er waren er
// wél bij gekomen. Die asymmetrie is misleidend en niet alleen onvolledig:
// wie dertien keer "uitgezet" leest en nul keer "aangezet", concludeert dat
// de selectie alleen kleiner is geworden.
//
// Wat het kostte: bij het nakijken van die rit was niet te beantwoorden of de
// vijftien niet-bewegende sensoren uit blok 14 het gedrag van de auto waren
// of handmatig aangezette PIDs die de ECU niet kent — het verschil tussen een
// bevinding en ruis.
//
// Deze test bewaakt drie dingen:
//   1. beide richtingen melden, in dezelfde bewoording en op hetzelfde niveau;
//   2. de melder rekent het verschil zelf uit tegen de echte activePIDs, dus
//      een aanroeper kan niets anders melden dan wat er gebeurd is;
//   3. veertig sensoren in één handeling geven één regel, geen veertig.
//
// Draaien vanuit public/:  node test-selectielog.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-pidgate.js', 'utf8');
const a = src.indexOf('function _engineWarmRunning');
const b = src.indexOf('// ── einde gate-blok');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden in pidlane-pidgate.js'); process.exit(1); }
const GATE = src.slice(a, b);

function maakWereld() {
  const W = {
    regels: [],
    pidVals: {}, _pidHealth: {},
    activePIDs: new Set(), manualPIDs: new Set(),
    supportedPIDs: new Set(), discoveredPIDDefs: [],
    vehicleInfo: { brandstof: 'benzine' },
    DIESEL_SCR_PIDS: new Set(), EV_AFWEZIGE_PIDS: new Set(),
    GEEN_SENSOR_PIDS: new Set(), _B1B2_PAIR: {},
    ALL_PID_DEFS: {
      '010C': { name: 'Toerental', unit: 'rpm', cat: 'Motor' },
      '0105': { name: 'Koelvloeistof', unit: '°C', cat: 'Temp' },
      '010D': { name: 'Snelheid', unit: 'km/h', cat: 'Motor' },
      '0110': { name: 'Massaluchtstroom', unit: 'g/s', cat: 'Motor' },
      '0104': { name: 'Motorbelasting', unit: '%', cat: 'Motor' }
    },
    // getPidDef() valt terug op PIDS als een pid niet in ALL_PID_DEFS staat.
    // Leeg is genoeg, maar hij moet er zijn — deel 2 gebruikt veertig
    // verzonnen pids en liep zonder deze regel op een ReferenceError.
    PIDS: [],
    console: { warn: function () {}, log: function () {} },
    renderGauges: function () {}, rebuildGSel: function () {},
    document: { getElementById: function () { return null; } },
    buildDiscoveredPIDList: function () {},
    Date: { now: function () { return 1785600000000; } }
  };
  W.vehicleFuelType = function () { return W.vehicleInfo.brandstof; };
  W.log = function (m, niveau) { W.regels.push({ m: String(m), niveau: niveau }); };
  W.btDiag = function () {};
  const namen = Object.keys(W);
  const fn = new Function(...namen, GATE +
    '\nreturn {plSelectieVoor,plSelectieMeld,pidGate,pidToevoegen};');
  Object.assign(W, fn(...namen.map(n => W[n])));
  return W;
}

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}
function laatste(W) { return W.regels.length ? W.regels[W.regels.length - 1] : null; }

// ══════════════════════════════════════════════════════════════════
console.log('\n1. Beide richtingen melden, in dezelfde vorm');
{
  const W = maakWereld();
  const voorAan = W.plSelectieVoor();
  W.activePIDs.add('010C');
  W.plSelectieMeld(voorAan, 'sensorkeuze');
  const aan = laatste(W);
  eis('aanzetten geeft een regel', !!aan, 'geen enkele regel');
  eis('met de naam van de sensor', /Toerental/.test(aan.m), aan.m);
  eis('en het woord erbij', /1 erbij/.test(aan.m), aan.m);

  const voorUit = W.plSelectieVoor();
  W.activePIDs.delete('010C');
  W.plSelectieMeld(voorUit, 'dubbeltik op de tegel');
  const uit = laatste(W);
  eis('uitzetten geeft er ook een', W.regels.length === 2);
  eis('en het woord eraf', /1 eraf/.test(uit.m), uit.m);

  // De kern van #31: het was niet zo dat er één richting ontbrak omdat er
  // geen code voor was, maar dat de twee richtingen los van elkaar waren
  // geschreven. Zelfde niveau en zelfde aanhef horen daarbij.
  eis('hetzelfde niveau in beide richtingen',
      aan.niveau === uit.niveau && aan.niveau === 'info',
      aan.niveau + ' vs ' + uit.niveau);
  eis('dezelfde aanhef in beide richtingen',
      /^Sensorselectie via /.test(aan.m) && /^Sensorselectie via /.test(uit.m));
  eis('de aanleiding staat erin', /sensorkeuze/.test(aan.m) && /dubbeltik/.test(uit.m));
  eis('en hoeveel er nu aanstaan', /nu 1 actief/.test(aan.m) && /nu 0 actief/.test(uit.m),
      aan.m + ' | ' + uit.m);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. Eén handeling die veertig sensoren zet geeft één regel');
{
  const W = maakWereld();
  const voor = W.plSelectieVoor();
  for (let i = 0; i < 40; i++) W.activePIDs.add('01' + (0x20 + i).toString(16).toUpperCase().padStart(2, '0'));
  const r = W.plSelectieMeld(voor, 'preset Lange rit');
  eis('precies één regel, geen veertig', W.regels.length === 1, W.regels.length + ' regels');
  eis('het aantal staat erin', /40 erbij/.test(laatste(W).m), laatste(W).m);
  eis('twee voorbeelden en een rest', /en 38 andere/.test(laatste(W).m), laatste(W).m);
  eis('de melder geeft het verschil ook terug', r.erbij.length === 40 && r.eraf.length === 0);

  // Onder de drempel juist wél alle namen: bij drie sensoren is "3 erbij"
  // zonder namen minder bruikbaar dan de namen zelf.
  const W2 = maakWereld();
  const v2 = W2.plSelectieVoor();
  ['010C', '0105', '010D'].forEach(function (p) { W2.activePIDs.add(p); });
  W2.plSelectieMeld(v2, 'sensorkeuze');
  eis('drie sensoren worden bij naam genoemd',
      /Koelvloeistof/.test(laatste(W2).m) && /Snelheid/.test(laatste(W2).m) &&
      /Toerental/.test(laatste(W2).m) && !/andere/.test(laatste(W2).m),
      laatste(W2).m);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. Beide richtingen in één handeling, in één regel');
{
  const W = maakWereld();
  ['010C', '0105'].forEach(function (p) { W.activePIDs.add(p); });
  const voor = W.plSelectieVoor();
  W.activePIDs.clear();
  ['010D', '0110'].forEach(function (p) { W.activePIDs.add(p); });
  W.plSelectieMeld(voor, 'preset Zuinig rijden');
  eis('één regel voor een preset die alles vervangt', W.regels.length === 1);
  eis('erbij én eraf staan er allebei in',
      /2 erbij/.test(laatste(W).m) && /2 eraf/.test(laatste(W).m), laatste(W).m);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. Geen wijziging, geen regel');
{
  const W = maakWereld();
  W.activePIDs.add('010C');
  const voor = W.plSelectieVoor();
  const r = W.plSelectieMeld(voor, 'sensorkeuze');
  eis('een klik die niets verandert schrijft niets', W.regels.length === 0);
  eis('en meldt dat netjes terug', r && r.erbij.length === 0 && r.eraf.length === 0);

  // Zelfde PID opnieuw toevoegen is geen wijziging: een Set is een Set.
  const voor2 = W.plSelectieVoor();
  W.activePIDs.add('010C');
  W.plSelectieMeld(voor2, 'sensorkeuze');
  eis('dubbel toevoegen ook niet', W.regels.length === 0);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. De melder kan niet iets anders melden dan er gebeurd is');
{
  // Dit is de reden dat plSelectieMeld() een MOMENTOPNAME krijgt en geen
  // lijst van wat er zou veranderen. Een aanroeper die denkt drie sensoren
  // aan te zetten maar er door de gate maar één doorkrijgt, meldt er één.
  const W = maakWereld();
  W._pidHealth['0105'] = 'nodata';               // deze weigert de gate
  W._pidHealth['010D'] = 'onzin';                // deze ook
  const voor = W.plSelectieVoor();
  const r = W.pidToevoegen(['010C', '0105', '010D'], { handmatig: false });
  W.plSelectieMeld(voor, 'sensorkeuze');
  eis('de aanroeper wilde er drie', r.ok.length + r.weg.length === 3);
  eis('er kwam er één door', r.ok.length === 1, JSON.stringify(r));
  eis('en het log meldt er één, niet drie', /1 erbij/.test(laatste(W).m), laatste(W).m);
  eis('met de sensor die er echt bij kwam', /Toerental/.test(laatste(W).m), laatste(W).m);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6. Een ontbrekende momentopname zwijgt, maar breekt niets');
{
  const W = maakWereld();
  W.activePIDs.add('010C');
  const r = W.plSelectieMeld(null, 'sensorkeuze');
  eis('null geeft null terug', r === null);
  eis('en schrijft niets', W.regels.length === 0);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n7. Alle vijf de gebruikershandelingen lopen langs de melder');
// Broncontrole, met reden: deze vijf functies zitten aan de DOM en aan het
// keuzescherm vast, en dat is in node niet na te bouwen zonder de halve app
// te stubben. Wat hier telt is niet wat ze doen maar DAT ze langs één plek
// gaan — en dat is aan de bron te zien. Blok 5 van de testrun meet het gedrag
// in de app zelf.
{
  const paren = [
    ['pidlane-pids.js', 'togglePID', 'sensorkeuze'],
    // Tot 02-09-2026 heette de aanleiding hier 'dubbeltik op de tegel'. Dat
    // gebaar VERBERGT sindsdien alleen nog (pidVerberg) en raakt de selectie
    // niet; uitzetten gaat via het kruisje in de verborgen-strook. Zou de oude
    // naam blijven staan, dan meldt het selectielog een handeling die niet
    // meer bestaat — en dat is precies het soort scheve boekhouding waar deze
    // test voor gemaakt is. test-verbergen.js toetst de andere kant: dat
    // verbergen hier júist niet langskomt.
    ['pidlane-pids.js', 'pidDeselect', 'kruisje'],
    ['pidlane-rijsituatie.js', 'selectStandardSet', 'standaardset'],
    ['pidlane-rijsituatie.js', 'selectCategoryPIDs', 'categorie'],
    ['pidlane-rijsituatie.js', 'applyPidPreset', 'preset']
  ];
  paren.forEach(function (p) {
    const [bestand, fnNaam, aanleiding] = p;
    const tekst = fs.readFileSync(__dirname + '/' + bestand, 'utf8');
    const van = tekst.indexOf('function ' + fnNaam + '(');
    const tot = tekst.indexOf('\n}', van);
    const lijf = van < 0 ? '' : tekst.slice(van, tot);
    eis(fnNaam + '() meldt via de gedeelde melder',
        /plSelectieVoor\(\)/.test(lijf) && new RegExp("plSelectieMeld\\(_voor,\\s*'?" + aanleiding).test(lijf),
        van < 0 ? 'functie niet gevonden' : 'geen aanroep in het lijf');
  });

  // De oude, losse regel hoort weg te zijn: twee bewoordingen voor dezelfde
  // gebeurtenis is precies waar #31 over gaat.
  const pids = fs.readFileSync(__dirname + '/pidlane-pids.js', 'utf8');
  const zonderCommentaar = pids.split('\n').map(function (r) { return r.replace(/\/\/.*$/, ''); }).join('\n');
  eis('de losse regel "Sensor uitgezet via dubbeltik" is weg uit de code',
      !/log\(\s*'Sensor uitgezet via dubbeltik/.test(zonderCommentaar));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n8. TEGENPROEF — zou de toestand van vóór #31 hier opvallen?');
{
  // (a) De asymmetrie zelf. Bouw hem na: alleen bij het uitzetten loggen.
  //     Deel 1 hoort dat te zien.
  const W = maakWereld();
  const oudeDeselect = function (pid) {          // de code zoals hij was
    W.activePIDs.delete(pid);
    W.log('Sensor uitgezet via dubbeltik: ' + W.ALL_PID_DEFS[pid].name, 'info');
  };
  const oudeToggleAan = function (pid) { W.activePIDs.add(pid); };   // meldde niets
  oudeToggleAan('010C');
  oudeDeselect('010C');
  eis('de oude vorm gaf inderdaad nul regels bij aanzetten en één bij uitzetten',
      W.regels.length === 1 && /uitgezet/.test(W.regels[0].m));

  // En de controle uit deel 1 zou daarop rood staan: er is geen tweede regel
  // en de aanhef verschilt.
  eis('deel 1 zou die vorm afkeuren',
      !/^Sensorselectie via /.test(W.regels[0].m));

  // (b) De muur van regels. Zonder samenvatting geeft een preset van veertig
  //     sensoren veertig regels — de reden dat het issue daar expliciet voor
  //     waarschuwt. Deel 2 hoort dat verschil te zien.
  const W2 = maakWereld();
  for (let i = 0; i < 40; i++) W2.log('Sensor aangezet: 01' + i, 'info');
  eis('een regel per sensor geeft er veertig, en deel 2 eist er één',
      W2.regels.length === 40);

  // (c) De momentopname. Zou de melder een LIJST accepteren in plaats van een
  //     snapshot, dan zou deel 5 niet kunnen bestaan: de aanroeper bepaalt
  //     dan wat er in het log komt. Toon dat het verschil echt bestaat.
  const W3 = maakWereld();
  W3._pidHealth['0105'] = 'nodata';
  const voor = W3.plSelectieVoor();
  W3.pidToevoegen(['010C', '0105'], { handmatig: false });
  const gemeten = W3.plSelectieMeld(voor, 'sensorkeuze');
  eis('de melder telt de werkelijkheid (1), niet de bedoeling (2)',
      gemeten.erbij.length === 1, JSON.stringify(gemeten.erbij));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
