// ══════════════════════════════════════════════════════════════════
// test-onderdeel.js — mag deze app dit onderdeel aanwijzen? (16-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
//
// Het paneel "Welk onderdeel?" zei op een gezonde auto, met een schermafdruk
// erbij: *"Sensor levert niets meer — STERKE AANWIJZING"*, en noemde
// brandstofpeil (012F) en afstand met MIL aan (0121), allebei met
// "draadbreuk, stekker of sensor". Geen van beide klopte:
//
//   • 012F wordt elke 60 seconden gevraagd, en de module noemde alles wat
//     langer dan 8 seconden zweeg een defect. Elke trage sensor was dus per
//     definitie kapot.
//   • 0121 is een kilometerteller die het stuurapparaat zelf bijhoudt. Daar
//     zit geen draad aan, dus "draadbreuk" kan er niet eens zijn.
//
// Een verdenking die er zó overtuigd uitziet stuurt iemand naar de garage
// voor een onderdeel dat het gewoon doet. Dat is duurder dan zwijgen, en
// daarom toetst dit bestand vooral het ONDERSCHEID: niet of de module iets
// kan vinden, maar of ze het verschil volhoudt tussen
//
//     nog niet aan de beurt   ≠   gevraagd en niets terug
//     motor uit               ≠   motor draait
//     één meting tegen de rand ≠  een reeks die er niet vanaf komt
//     teller van de ECU       ≠   sensor met bedrading
//
// Elke proef hieronder heeft daarom een tegenproef: hetzelfde geval, maar
// dan het geval waarin de melding wél hoort te komen. Een test die alleen
// laat zien dat er niets gemeld wordt, zou ook slagen op een module die
// nooit iets zegt.
//
// De module wordt ECHT geladen (vm), niet nagebouwd — een eigen kopie van
// deze logica kan per definitie niet rood worden.
//
// Draaien vanuit public/:  node test-onderdeel.js        (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const NU = 1758000000000;   // vaste klok; alle tijden hieronder zijn relatief

// De cadans zoals pidPollInterval() hem werkelijk geeft (PID_POLL_CLASS in
// pidlane-data.js): toerental 120 ms, koelwater 10 s, brandstofpeil en de
// MIL-tellers 60 s. Precies de spreiding waar de vaste drempel op stukliep.
const CADANS = { '010C': 120, '010B': 300, '0110': 300, '0142': 30000,
                 '0105': 10000, '012F': 60000, '0121': 60000, '0115': 1000 };

function laad(opt) {
  opt = opt || {};
  const s = {};
  s.window = s;
  s.klok = NU;
  s.Date = { now() { return s.klok; } };
  s.console = { warn() { }, error() { }, log() { } };
  s.pidVals = {}; s.pidHist = {};
  s._pidLastUpd = {}; s._pidLastUpdPause = {};
  s.activePIDs = new Set(); s.supportedPIDs = new Set();
  s.dtcCodes = []; s._didDTCScan = false;
  s._pause = 0;
  s.PLBus = {
    stats() { return { foutPct: 0, onvolPct: 0, totaal: 500 }; },
    pausedTotal() { return s._pause; }
  };
  // Het cadansregister. Zonder dit ding is "nog niet aan de beurt" niet te
  // onderscheiden van "gevraagd en niets terug"; opt.geenSched laat het weg
  // om te toetsen dat de module dan zwijgt.
  s._pog = {}; s._ok = {}; s._dood = new Set();
  if (!opt.geenSched) s.PLSched = {
    interval(pid) { return CADANS[pid] || 1000; },
    laatstePoging(pid) { return s._pog[pid] || 0; },
    laatsteSucces(pid) { return s._ok[pid] || 0; },
    dood(pid) { return s._dood.has(pid); }
  };
  s.getPidDef = function (pid) {
    const t = { '012F': 'Brandstofpeil', '0121': 'Afstand met MIL aan', '0105': 'Koelwater temp' };
    return { name: t[pid] || pid, unit: '' };
  };
  // Een dun DOM-laagje, alleen zo veel dat render() er echt in schrijft. De
  // tekst op het scherm is hier het onderwerp: twee blokken die elkaar
  // tegenspreken zijn geen zichtbare fout in beoordeel(), maar wel op de
  // telefoon.
  s.odBody = { innerHTML: '' };
  s.document = {
    getElementById(id) { return id === 'odBody' ? s.odBody : null; },
    createElement() { return { style: {} }; },
    body: { appendChild() { } }
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-onderdeel.js', 'utf8'), s,
    { filename: 'pidlane-onderdeel.js' });
  if (!s.PLOnderdeel || typeof s.PLOnderdeel.stilteBeeld !== 'function')
    { console.error('FOUT: PLOnderdeel.stilteBeeld() niet gevonden — de module exporteert niets meer'); process.exit(1); }
  return s;
}

// Zet één sensor neer: actief, ondersteund, met een reeks metingen.
// `laatst` = hoeveel ms geleden hij voor het laatst ANTWOORDDE.
function sensor(s, pid, waarde, laatst, opt) {
  opt = opt || {};
  s.activePIDs.add(pid); s.supportedPIDs.add(pid);
  s.pidVals[pid] = waarde;
  s._pidLastUpd[pid] = s.klok - laatst;
  s._pidLastUpdPause[pid] = opt.pauze === undefined ? s._pause : opt.pauze;
  s._ok[pid] = s.klok - laatst;
  // laatstePoging: standaard even oud als het antwoord (dus: niets gevraagd
  // sinds het laatste antwoord). opt.gevraagd zet hem op "net gevraagd".
  s._pog[pid] = opt.gevraagd ? s.klok - 200 : s.klok - laatst;
  const iv = CADANS[pid] || 1000;
  const aantal = opt.n === undefined ? 6 : opt.n;
  s.pidHist[pid] = [];
  for (let i = aantal - 1; i >= 0; i--)
    s.pidHist[pid].push({ t: s.klok - laatst - i * iv, v: opt.reeks ? opt.reeks(i) : waarde });
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. De melding uit de schermafdruk: een trage sensor is niet stuk');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  // Precies het geval van de melding: brandstofpeil ververst elke 60 s en is
  // nu 30 s oud. Dat is binnen zijn eigen tempo. Daarnaast een toerental dat
  // wel snel loopt, zodat er iets "levends" naast staat.
  sensor(s, '012F', 71, 30000);
  sensor(s, '010C', 820, 300);
  const b = s.PLOnderdeel.stilteBeeld();
  toets('brandstofpeil (60 s cadans, 30 s oud) is niet "stil"',
    b.stil.length === 0,
    'stil bevat: ' + JSON.stringify(b.stil) + ' — dit is de valse melding van 16-09');
  toets('... en telt wél als levende sensor', b.levend.indexOf('012F') >= 0);

  // TEGENPROEF: dezelfde sensor, maar nu 200 s stil ÉN net gevraagd zonder
  // antwoord. Nu is het wél uitval, en dan hoort hij er wel te staan.
  const t = laad();
  sensor(t, '012F', 71, 200000, { gevraagd: true });
  sensor(t, '010C', 820, 300);
  const bt = t.PLOnderdeel.stilteBeeld();
  toets('TEGENPROEF: 200 s stil én gevraagd zonder antwoord is wél uitval',
    bt.stil.length === 1 && bt.stil[0].pid === '012F',
    'stil: ' + JSON.stringify(bt.stil) + ' — als dit leeg is meldt de module nooit meer iets');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. Stilte is geen uitval: niet gevraagd ≠ niets teruggekregen');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  // Koelwater: cadans 10 s, drempel dus 30 s. Hij is 90 s stil — maar er is
  // sinds dat antwoord niet meer naar gevraagd (de bus was bezet met iets
  // anders). Dat is geen bewijs van uitval.
  sensor(s, '0105', 89, 90000);
  sensor(s, '010C', 820, 300);
  const b = s.PLOnderdeel.stilteBeeld();
  toets('90 s stil maar sinds het laatste antwoord niet meer gevraagd → geen uitval',
    b.stil.length === 0 && b.wacht.indexOf('0105') >= 0,
    'stil: ' + JSON.stringify(b.stil) + ' / wacht: ' + JSON.stringify(b.wacht));

  const t = laad();
  sensor(t, '0105', 89, 90000, { gevraagd: true });
  sensor(t, '010C', 820, 300);
  toets('TEGENPROEF: zelfde stilte mét een verse vraag → wél uitval',
    t.PLOnderdeel.stilteBeeld().stil.length === 1);

  // Gesnoeid door de scheduler = vijf keer gevraagd, vijf keer niets terug,
  // en dat gebeurt alleen bij een gezonde bus. Het hardste bewijs dat er is.
  const g = laad();
  sensor(g, '0105', 89, 90000);
  g._dood.add('0105');
  sensor(g, '010C', 820, 300);
  const bg = g.PLOnderdeel.stilteBeeld();
  toets('een door de scheduler gesnoeide sensor telt als uitval, met reden',
    bg.stil.length === 1 && bg.stil[0].gesnoeid === true);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. Een teller van de ECU heeft geen draad om te breken');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  // 0121 = afstand met MIL aan. Zelfs als hij écht niets meer teruggeeft,
  // valt er geen onderdeel aan te wijzen.
  sensor(s, '0121', 0, 200000, { gevraagd: true });
  sensor(s, '010C', 820, 300);
  const b = s.PLOnderdeel.stilteBeeld();
  toets('0121 komt niet als kapot onderdeel op het scherm',
    b.stil.length === 0 && b.tellers.indexOf('0121') >= 0,
    'stil: ' + JSON.stringify(b.stil) + ' — dit was de tweede regel in de schermafdruk');
  toets('de tellerlijst kent 0121, 011F en 0131 en niet 012F',
    s.PLOnderdeel.tellers.has('0121') && s.PLOnderdeel.tellers.has('011F') &&
    s.PLOnderdeel.tellers.has('0131') && !s.PLOnderdeel.tellers.has('012F'),
    'brandstofpeil is wél een sensor met bedrading en hoort niet in deze lijst');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. Zonder cadansregister geen uitspraak, en zonder gezonde bus ook niet');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad({ geenSched: true });
  sensor(s, '012F', 71, 200000, { gevraagd: true });
  const b = s.PLOnderdeel.stilteBeeld();
  toets('geen PLSched → register false en geen enkele verdenking',
    b.register === false && b.stil.length === 0,
    'zonder register is "nog niet aan de beurt" niet te onderscheiden van uitval');

  const t = laad();
  sensor(t, '012F', 71, 200000, { gevraagd: true });
  toets('TEGENPROEF: mét register komt dezelfde sensor er wél uit',
    t.PLOnderdeel.stilteBeeld().register === true &&
    t.PLOnderdeel.stilteBeeld().stil.length === 1);

  // Bus ziek → de hele uitspraak vervalt.
  const z = laad();
  z.PLBus.stats = function () { return { foutPct: 21, onvolPct: 0, totaal: 500 }; };
  toets('een bus met 21% fouten is niet betrouwbaar genoeg voor een oordeel',
    z.PLOnderdeel.busBetrouwbaar().ok === false);
  const scan = laad();
  scan._plScanActief = true;
  toets('tijdens een diepe scan (die de bus vasthoudt) ook niet',
    scan.PLOnderdeel.busBetrouwbaar().ok === false);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. Bus-pauze is geen stilte van de sensor');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  // Koelwater 60 s stil (drempel 30 s), maar 50 s daarvan hield een sweep de
  // bus vast. Dan blijft er 10 s over en is er niets aan de hand.
  sensor(s, '0105', 89, 60000, { gevraagd: true, pauze: 0 });
  s._pause = 50000;
  sensor(s, '010C', 820, 300, { pauze: 50000 });
  toets('50 s bus-pauze wordt van de stilte afgetrokken',
    s.PLOnderdeel.stilteBeeld().stil.length === 0);

  const t = laad();
  sensor(t, '0105', 89, 60000, { gevraagd: true, pauze: 0 });
  t._pause = 0;
  sensor(t, '010C', 820, 300);
  toets('TEGENPROEF: zonder pauze is diezelfde stilte wél uitval',
    t.PLOnderdeel.stilteBeeld().stil.length === 1);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6. De foutcodes worden werkelijk gelezen');
// ══════════════════════════════════════════════════════════════════
{
  // Tot 16-09 las deze module window._laatsteDTC en window.lastDTCs. Geen van
  // beide bestaat; de lijst heet dtcCodes. Elke DTC-voorwaarde stond dus
  // permanent op "onbekend" en de halve module deed niets.
  const s = laad();
  s.dtcCodes = ['P0420']; s._didDTCScan = true;
  const b = s.PLOnderdeel.dtcBron();
  toets('dtcCodes wordt gevonden', b.codes.length === 1 && b.codes[0] === 'P0420');
  toets('en leidt tot een kandidaat',
    s.PLOnderdeel.beoordeel().some(r => r.id === 'kat'),
    'beoordeel(): ' + JSON.stringify(s.PLOnderdeel.beoordeel().map(r => r.id)));

  const leeg = laad();
  leeg._didDTCScan = true;
  toets('TEGENPROEF: uitgelezen zonder codes levert geen enkele kandidaat op',
    leeg.PLOnderdeel.beoordeel().length === 0);
  toets('niet uitgelezen is iets anders dan uitgelezen-en-leeg',
    laad().PLOnderdeel.dtcBron().gescand === false && leeg.PLOnderdeel.dtcBron().gescand === true);

  // Elke code hoort bij één onderdeel, en de drie lambda-regels moeten uit
  // elkaar blijven: de regelsonde, de verwarming en de achterste sonde zijn
  // drie verschillende reparaties.
  const paren = [
    ['P0135', 'lambdaverwarming'], ['P0136', 'lambdaachter'], ['P0131', 'lambdavoor'],
    ['P0455', 'evap'], ['P0521', 'oliedruk'], ['P0011', 'vvt'], ['P0015', 'vvt'],
    ['P0016', 'distributie'], ['P0340', 'krukas_nok'],
    ['U0100', 'communicatie'], ['P0700', 'automaat'], ['P2004', 'swirl'], ['P0380', 'gloeibougie']
  ];
  paren.forEach(function (p) {
    const c = laad();
    c.dtcCodes = [p[0]]; c._didDTCScan = true;
    const ids = c.PLOnderdeel.beoordeel().map(r => r.id);
    toets(p[0] + ' wijst naar "' + p[1] + '"', ids.indexOf(p[1]) >= 0, 'gevonden: ' + ids.join(', '));
    // En naar niets anders. Een code die twee onderdelen aanwijst maakt de
    // keuze voor de lezer niet kleiner maar groter, en dat is het enige dat
    // dit paneel te bieden heeft. P0340 stond tot 16-09 zowel onder de
    // nokkenassensor als onder de distributieketting.
    toets(p[0] + ' wijst nergens anders naar', ids.length === 1, 'gevonden: ' + ids.join(', '));
  });
}

// ══════════════════════════════════════════════════════════════════
console.log('\n7. Contact aan, motor uit — de stand waarin je foutcodes leest');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  s._didDTCScan = true;
  // Wat een stilstaande motor met contact aan werkelijk teruggeeft:
  // inlaatdruk = buitenluchtdruk, luchtmassa 0, koelwater koud, gasklep dicht.
  sensor(s, '010C', 0, 300);
  sensor(s, '010B', 101, 300);
  sensor(s, '0110', 0, 300);
  sensor(s, '0105', 18, 5000);
  sensor(s, '0111', 0, 300);
  s.pidVals['011F'] = 0;
  const r = s.PLOnderdeel.beoordeel();
  toets('geen enkele verdenking op een stilstaande motor',
    r.length === 0,
    'gevonden: ' + JSON.stringify(r.map(x => x.id + ' (' + x.voor.join(' + ') + ')')));
  toets('... en ook geen railtreffer op 0 g/s luchtmassa',
    s.PLOnderdeel.railTreffers().length === 0,
    '0 g/s is bij een stilstaande motor het goede antwoord');

  // TEGENPROEF: dezelfde inlaatdruk, maar nu stationair draaiend. 101 kPa bij
  // 800 toeren betekent dat er geen vacuüm staat, en dat is wél een lek.
  const t = laad();
  t._didDTCScan = true;
  sensor(t, '010C', 800, 300);
  sensor(t, '010B', 101, 300);
  sensor(t, '0107', 18, 1000);
  const ids = t.PLOnderdeel.beoordeel().map(x => x.id);
  toets('TEGENPROEF: 101 kPa bij 800 toeren is wél een vacuümlek',
    ids.indexOf('vacuumlek') >= 0, 'gevonden: ' + ids.join(', '));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n8. Koud is pas koud als de motor lang genoeg gedraaid heeft');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  s._didDTCScan = true;
  sensor(s, '010C', 850, 300);
  sensor(s, '0105', 40, 5000);
  s.pidVals['011F'] = 120;                 // twee minuten na een koude start
  toets('koelwater 40 °C na 2 minuten is geen thermostaat',
    s.PLOnderdeel.beoordeel().every(r => r.id !== 'thermostaat'),
    'elke koude start was hiervoor een kapotte thermostaat');

  const t = laad();
  t._didDTCScan = true;
  sensor(t, '010C', 850, 300);
  sensor(t, '0105', 60, 5000);
  t.pidVals['011F'] = 1800;                // een half uur onderweg
  const th = t.PLOnderdeel.beoordeel().filter(r => r.id === 'thermostaat');
  toets('TEGENPROEF: 60 °C na een half uur is dat wél', th.length === 1,
    'gevonden: ' + JSON.stringify(t.PLOnderdeel.beoordeel().map(x => x.id)));
  // ZONDER 011F. Motorlooptijd is een sensor die je kunt uitvinken, en dan
  // zou deze regel nooit meer aanslaan. De meetgeschiedenis van het koelwater
  // zelf is de tweede bron: tien minuten onafgebroken onder de 75 °C.
  const geen = laad();
  geen._didDTCScan = true;
  sensor(geen, '010C', 850, 300);
  sensor(geen, '0105', 60, 5000, { n: 80 });     // 80 × 10 s = ruim 13 minuten
  toets('zonder motorlooptijd doet de meetgeschiedenis het werk',
    geen.PLOnderdeel.beoordeel().some(r => r.id === 'thermostaat'),
    'gevonden: ' + JSON.stringify(geen.PLOnderdeel.beoordeel().map(x => x.id)));

  const kort = laad();
  kort._didDTCScan = true;
  sensor(kort, '010C', 850, 300);
  sensor(kort, '0105', 60, 5000, { n: 8 });      // 8 × 10 s = ruim een minuut
  toets('TEGENPROEF: met één minuut geschiedenis zegt hij nog niets',
    kort.PLOnderdeel.beoordeel().every(r => r.id !== 'thermostaat'),
    'te weinig gemeten is geen oordeel');

  // De twee temperatuurvoorwaarden sluiten elkaar uit; zonder xor trok de ene
  // de andere altijd omlaag en haalde deze regel de ondergrens nooit.
  toets('... en "te koud" en "te warm" tellen samen voor één keer in het maximum',
    th.length === 1 && th[0].max === 9,
    'max was ' + (th[0] && th[0].max) + ', verwacht 9 (5 code + 4 temperatuur)');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n9. Een railwaarde moet aanhouden, en op de juiste schaal');
// ══════════════════════════════════════════════════════════════════
{
  // Koelwater op -40: dat is de elektrische eindwaarde, geen temperatuur.
  const s = laad();
  sensor(s, '0105', -40, 1000, { n: 6 });
  toets('zes metingen op -40 °C is een railtreffer',
    s.PLOnderdeel.railTreffers().length === 1);

  const een = laad();
  sensor(een, '0105', -40, 1000, { n: 6, reeks: i => (i === 0 ? -40 : 88) });
  toets('TEGENPROEF: één losse -40 tussen gezonde metingen niet',
    een.PLOnderdeel.railTreffers().length === 0,
    'een misgelezen frame (#210) mag geen diagnose worden');

  // Lambdaspanning loopt van 0 tot 1,275 V. Met de standaardspeling van 0,6
  // zou een doodnormale vette meting van 0,8 V al "tegen de bovengrens"
  // heten. Warm, draaiend, onder last.
  const l = laad();
  sensor(l, '010C', 2000, 300);
  sensor(l, '0105', 90, 5000);
  sensor(l, '0104', 45, 300);
  sensor(l, '0114', 0.8, 300, { n: 40 });
  toets('0,8 V op de lambdasonde is geen eindwaarde',
    l.PLOnderdeel.railTreffers().length === 0);

  const dood = laad();
  sensor(dood, '010C', 2000, 300);
  sensor(dood, '0105', 90, 5000);
  sensor(dood, '0104', 45, 300);
  sensor(dood, '0114', 1.275, 300, { n: 40 });
  toets('TEGENPROEF: 1,275 V dat blijft staan wél',
    dood.PLOnderdeel.railTreffers().length === 1);

  // Uitrollen van een heuvel: de inspuiting sluit af en de sonde leest bijna
  // nul. Dat is geen defect maar natuurkunde.
  const rol = laad();
  sensor(rol, '010C', 2000, 300);
  sensor(rol, '0105', 90, 5000);
  sensor(rol, '0104', 4, 300);
  sensor(rol, '0114', 0, 300, { n: 40 });
  toets('0 V tijdens brandstofafsluiting (belasting 4%) is geen defect',
    rol.PLOnderdeel.railTreffers().length === 0);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n10. De laadspanning wordt aan een reeks afgelezen, niet aan één dip');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  s._didDTCScan = true;
  sensor(s, '010C', 1500, 300);
  sensor(s, '0142', 12.3, 500, { n: 5, reeks: i => (i === 0 ? 12.3 : 14.1) });
  toets('één dip naar 12,3 V is geen dynamo',
    s.PLOnderdeel.beoordeel().every(r => r.id !== 'dynamo'));

  const t = laad();
  t._didDTCScan = true;
  sensor(t, '010C', 1500, 300);
  sensor(t, '0142', 12.3, 500, { n: 5 });
  toets('TEGENPROEF: vijf metingen lang onder 13,2 V wél',
    t.PLOnderdeel.beoordeel().some(r => r.id === 'dynamo'));

  // Met de motor uit is dezelfde spanning een accu-oordeel en geen dynamo.
  const a = laad();
  a._didDTCScan = true;
  sensor(a, '010C', 0, 300);
  sensor(a, '0142', 11.9, 500, { n: 5 });
  const ids = a.PLOnderdeel.beoordeel().map(r => r.id);
  toets('11,9 V met de motor uit wijst naar de accu, niet naar de dynamo',
    ids.indexOf('accu') >= 0 && ids.indexOf('dynamo') < 0, 'gevonden: ' + ids.join(', '));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n11. De cadansregels komen uit PLWatch en niet uit een tweede kopie');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  s.PLWatch = { cfg: { stilMinMs: 20000, stilFactor: 9 } };
  const r = s.PLOnderdeel.cadansRegels();
  toets('PLWatch.cfg is de bron zodra hij er is', r.min === 20000 && r.factor === 9);
  toets('en zonder PLWatch is er een eigen terugval',
    laad().PLOnderdeel.cadansRegels().factor === 3);

  // De drempel moet die factor ook echt gebruiken: 0105 (10 s cadans) is met
  // factor 9 pas na 90 s verdacht, met factor 3 al na 30 s.
  const ruim = laad();
  ruim.PLWatch = { cfg: { stilMinMs: 8000, stilFactor: 9 } };
  sensor(ruim, '0105', 89, 60000, { gevraagd: true });
  sensor(ruim, '010C', 820, 300);
  toets('een ruimere factor uit PLWatch werkt door in het oordeel',
    ruim.PLOnderdeel.stilteBeeld().stil.length === 0,
    '60 s stilte bij factor 9 (drempel 90 s) is geen uitval');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n12. Eén losse hint is een vermoeden, geen verdachte');
// ══════════════════════════════════════════════════════════════════
{
  // Gemeten in bproef-onderdeel.js op de demo-auto, die niets mankeert: daar
  // stond "EGR-klep — zwakke aanwijzing" op het scherm, gedragen door precies
  // één voorwaarde van gewicht 2 (inlaatdruk stationair verhoogd). Twee
  // gedeeld door zeven is 29% en dus boven de kwartgrens — de grens keek naar
  // het aandeel en niet naar wat eronder lag.
  const s = laad();
  s._didDTCScan = true;
  sensor(s, '010C', 800, 300);
  sensor(s, '010B', 50, 300);
  const ids = s.PLOnderdeel.beoordeel().map(r => r.id);
  toets('een verhoogde inlaatdruk alléén maakt de EGR-klep geen verdachte',
    ids.indexOf('egr') < 0, 'gevonden: ' + ids.join(', '));

  // TEGENPROEF 1: mét de bijbehorende foutcode draagt het wel.
  const met = laad();
  met._didDTCScan = true; met.dtcCodes = ['P0401'];
  sensor(met, '010C', 800, 300);
  sensor(met, '010B', 50, 300);
  const idsMet = met.PLOnderdeel.beoordeel().map(r => r.id);
  toets('TEGENPROEF: met P0401 erbij wél', idsMet.indexOf('egr') >= 0, 'gevonden: ' + idsMet.join(', '));

  // TEGENPROEF 2: één voorwaarde die op zichzelf zwaar genoeg is (gewicht 3
  // of meer) mag nog steeds alleen staan — anders zou deze grens juist de
  // zware aanwijzingen wegnemen.
  const zwaar = laad();
  zwaar._didDTCScan = true;
  sensor(zwaar, '010C', 800, 300);
  sensor(zwaar, '0107', 18, 1000);
  const idsZwaar = zwaar.PLOnderdeel.beoordeel().map(r => r.id);
  toets('TEGENPROEF: een trim van +18% draagt op zijn eentje wel (gewicht 4)',
    idsZwaar.indexOf('vacuumlek') >= 0, 'gevonden: ' + idsZwaar.join(', '));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n13. Het scherm spreekt zichzelf niet tegen');
// ══════════════════════════════════════════════════════════════════
{
  // In de schermafdruk van 16-09 stond bovenaan "Geen enkel onderdeel aan te
  // wijzen" en daaronder een rode kaart met "Sensor levert niets meer —
  // sterke aanwijzing". Allebei getekend door dezelfde functie, in dezelfde
  // seconde. Het lege-melding-blok werd berekend vóórdat de sensorkant aan
  // bod kwam en kon er dus niets van weten.
  const s = laad();
  s._didDTCScan = true;
  sensor(s, '012F', 71, 200000, { gevraagd: true });
  // Vier sensoren die wél doorlopen: onder de 30% uitval blijft het een
  // sensorprobleem, daarboven noemt de module het een busprobleem. Met één
  // levende sensor ernaast zou dit dus de andere kaart geven, en dan toetst
  // deze proef iets anders dan hij zegt.
  ['010C', '0105', '010B', '0104'].forEach(function (p) { sensor(s, p, 50, 300); });
  s.openOnderdeelCheck();
  const t = s.odBody.innerHTML;
  toets('bij een echte uitvaller staat de kaart er', /levert niets meer/.test(t));
  toets('... en dan NIET ook "geen enkel onderdeel aan te wijzen"',
    !/Geen enkel onderdeel/.test(t),
    'het scherm zei allebei — precies de schermafdruk van 16-09');

  // TEGENPROEF: is er werkelijk niets, dan hoort die zin er juist wél te staan.
  const leeg = laad();
  leeg._didDTCScan = true;
  sensor(leeg, '010C', 820, 300);
  leeg.openOnderdeelCheck();
  toets('TEGENPROEF: zonder enige bevinding staat de zin er wel',
    /Geen enkel onderdeel/.test(leeg.odBody.innerHTML));
}

// ══════════════════════════════════════════════════════════════════
// GEMETEN OP 23-09-2026 — een gezonde CX-5 2.0 SkyActiv-G (#232, #231, #233)
// De getallen hieronder zijn de metingen uit D1, niet bedacht.
function regel(s, id, tekstBegin) {
  const r = s.PLOnderdeel._regels.filter(function (x) { return x.id === id; })[0];
  const v = r && r.vc.filter(function (x) { return x.tekst.indexOf(tekstBegin) === 0; })[0];
  if (!v) { toets('regel ' + id + ' / ' + tekstBegin + ' bestaat', false); return function () { return 'ontbreekt'; }; }
  return function () { return v.test(s.PLOnderdeel.context()); };
}
function motor(s, rpm, ect, snelheid) {
  s.pidVals['010C'] = rpm; s.pidVals['0105'] = ect;
  if (snelheid !== undefined) s.pidVals['010D'] = snelheid;
}

console.log('\n14. De MAF-regel keurt een gezonde motor niet af (#232)');
{
  const s = laad();
  s.getVehicle = function () { return s.voertuig; };
  s.voertuig = { merk: 'Mazda', model: 'CX-5', motor: '2.0 SkyActiv-G 165pk' };
  const maf = regel(s, 'maf', 'Luchtmassa stationair');
  toets('de motorinhoud komt uit de motornaam', s.PLOnderdeel.motorLiters() === 2);
  s.voertuig = { cilinderinhoud: '1998' };
  toets('of uit de cilinderinhoud in cc', s.PLOnderdeel.motorLiters() === 1.998);
  s.voertuig = { motor: 'SkyActiv-G' };
  toets('en is onbekend als er geen getal staat', s.PLOnderdeel.motorLiters() === null);

  s.voertuig = { motor: '2.0 SkyActiv-G 165pk' };
  motor(s, 650, 90, 0);
  s.pidVals['0110'] = 0.81;
  toets('stationair 0,81 g/s op 2,0 liter: geen kandidaat (de oude regel zei wél)', maf() === false, String(maf()));
  s.pidVals['0110'] = 1.67;
  toets('stationair 1,67 g/s: ook niet', maf() === false);
  s.pidVals['0110'] = 0.3;
  toets('stationair 0,3 g/s: wél — dat is een MAF die te weinig meet', maf() === true, String(maf()));
  motor(s, 4540, 92, 80);
  s.pidVals['0110'] = 91.3;
  toets('vol gas 91 g/s bij 4540 tpm: geen oordeel (de oude regel zei "past niet")', maf() === null, String(maf()));
  motor(s, 650, 90, 0);
  s.pidVals['0110'] = 0.3;
  s.voertuig = { motor: 'onbekend' };
  toets('onbekende motor: geen oordeel, ook bij een lage waarde', maf() === null, String(maf()));
  s.voertuig = { motor: '2.0' };
  motor(s, 650, 40, 0);
  toets('koude motor: geen oordeel', maf() === null, String(maf()));
}

console.log('\n15. De ontstekingsgrens volgt een gezonde motor (#231)');
{
  const s = laad();
  const ketting = regel(s, 'distributie', 'Ontstekingsvervroeging springt');
  motor(s, 1800, 90, 60);
  s.pidVals['010E'] = -20;
  toets('warm, −20° (gemeten op 23-09): geen kandidaat', ketting() === false, String(ketting()));
  s.pidVals['010E'] = -30;
  toets('warm, −30°: wél', ketting() === true, String(ketting()));
  motor(s, 1800, 40, 60);
  toets('koud, −30° (katalysator-opwarming): geen oordeel', ketting() === null, String(ketting()));
  toets('het gebruikelijke bereik in de datatabel volgt mee',
    (function () { const t = {}; vm.createContext(t); t.window = t;
      vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), t);
      return t.PID_LET_OP && t.PID_LET_OP['010E'] && t.PID_LET_OP['010E'].min <= -20; })());
}

(async function () {
  console.log('\n16. Foutcodes uitlezen vanuit het paneel (#233)');
  {
    const s = laad();
    s.connected = false; s.demoMode = false;
    s.scanDTC = function () { s.dtcCodes = ['P0420']; s._didDTCScan = true; return Promise.resolve(); };
    // eerst zonder verbinding
    s.openOnderdeelCheck();
    toets('zonder verbinding: geen knop, wel de reden', !/id="odScan"/.test(s.odBody.innerHTML) && /Verbind eerst de adapter/.test(s.odBody.innerHTML));
    s.connected = true;
    s.openOnderdeelCheck();
    toets('verbonden en niet gescand: de knop staat onder de zin', /id="odScan"/.test(s.odBody.innerHTML));
    const knop = { disabled: false, textContent: '' };
    const p = s.PLOnderdeel.scan(knop);
    toets('tijdens de scan staat de knop uit, met een leesbare stand', knop.disabled === true && /uitlezen/.test(knop.textContent));
    await p;
    toets('daarna tekent het paneel opnieuw: de oude zin is weg', !/nog niet uitgelezen/.test(s.odBody.innerHTML), s.odBody.innerHTML.slice(0, 160));
    toets('en de gelezen code staat erin', /1 foutcode/.test(s.odBody.innerHTML));
  }
  {
    const s = laad();
    s.connected = true;
    s.scanDTC = function () { return Promise.reject(new Error('adapter weg')); };
    s.openOnderdeelCheck();
    const ok = await s.PLOnderdeel.scan({ disabled: false, textContent: '' });
    toets('een mislukte scan zegt dat, en de knop komt terug', ok === false && /Uitlezen mislukt/.test(s.odBody.innerHTML), s.odBody.innerHTML.slice(0, 200));
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                          : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
})();
