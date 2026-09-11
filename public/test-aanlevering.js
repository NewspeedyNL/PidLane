// ══════════════════════════════════════════════════════════════════
// test-aanlevering.js — hoort de AI wat er met de meting mis was? (#188)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. pidlane-aanlevering.js is de enige plek die de
// AI vertelt hoe goed de meting was waar hij een oordeel over moet geven. Gaat
// hier iets stil mis, dan merkt niemand dat aan een foutmelding maar aan een
// rapport: een gat in de reeks dat als sensoruitval gelezen wordt, of een
// sensor die nooit uitgevraagd is en waarover "geen afwijkingen" komt te staan.
// Dat tweede is het duurst, want een gemist defect ziet er precies zo uit als
// een goede uitslag.
//
// DE VIER VRAGEN DIE DEZE TEST STELT, en dat zijn stuk voor stuk fouten die in
// dit project al een keer gemaakt zijn:
//
//   1. Wordt "we weten het niet" als zodanig doorgegeven, of stilletjes als
//      nul? Dat is #18 in één zin, en hier gaat het rechtstreeks een
//      klantrapport in.
//   2. Krijgt een ontbrekende sensor de JUISTE reden? Niet-ondersteund,
//      niet-geselecteerd en geen-antwoord leiden tot drie verschillende
//      adviezen; door elkaar halen stuurt een monteur naar de verkeerde knop.
//   3. Krijgt een gat zijn naam? Binnen een achtergrondperiode is het de
//      telefoon, erbuiten de adapter of de bus. Zonder dat onderscheid is de
//      melding een mededeling en geen aanwijzing.
//   4. Gaat het blok mee als het ergens over gaat, en blijft het weg als er
//      niets te melden valt? Promptcaching staat uit, dus elke regel kost geld
//      bij elke analyse.
//
// HOE ER GETOETST WORDT. De module wordt in zijn geheel in een vm-sandbox
// geladen, met de ECHTE tabellen uit pidlane-data.js, de ECHTE
// assessPidQuality/buildQualityReport uit pidlane-kwaliteit.js en de ECHTE
// gatsplitsing uit pidlane-testrun.js erachter. Er wordt niets nagebouwd: een
// analyseset die daar verandert verandert hier mee, en een verdwenen anker
// stopt de test in plaats van hem stilletjes minder te laten toetsen.
//
// Draaien vanuit public/:  node test-aanlevering.js        (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

// Knipt een blok uit een bronbestand op twee ankers. Verdwijnt een anker, dan
// stopt de test met een fout in plaats van minder te toetsen dan zijn naam
// belooft.
function knip(bestand, van, tot) {
  const bron = fs.readFileSync(dir + '/' + bestand, 'utf8');
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker "' + van + '" niet gevonden in ' + bestand); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: anker "' + tot + '" niet gevonden in ' + bestand); process.exit(1); }
  return bron.slice(a, b);
}

// ── De echte tabellen ─────────────────────────────────────────────
const data = {};
data.window = data; data.globalThis = data;
data.console = { log() {}, warn() {}, error() {} };
vm.createContext(data);
vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), data, { filename: 'pidlane-data.js' });
if (!data.ANALYSE_PID_SETS || !data.ANALYSE_PID_SETS.dtc) {
  console.error('FOUT: ANALYSE_PID_SETS niet geladen uit pidlane-data.js'); process.exit(1);
}
// De set waarmee hieronder gemeten wordt komt UIT de app en staat hier niet
// overgeschreven. Verandert hij daar, dan verandert deze test mee.
const SET = 'dtc';
const NODIG = data.ANALYSE_PID_SETS[SET];

// ── De sandbox ────────────────────────────────────────────────────
// Alles wat de module van buiten gebruikt komt uit de echte bestanden; alleen
// de meettoestand (welke PID staat aan, welke waarde staat er) wordt per geval
// gezet — dat is immers wat er te variëren valt.
function bouw(t) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() {}, warn() {}, error() {} };
  s.Object = Object; s.Array = Array; s.Math = Math; s.Number = Number;
  s.JSON = JSON; s.String = String; s.Date = Date;

  // De echte tabellen
  s.ANALYSE_PID_SETS = data.ANALYSE_PID_SETS;
  s.ANALYSE_PIDS = data.ANALYSE_PIDS;
  s.ALL_PID_DEFS = data.ALL_PID_DEFS;
  s.PID_HARD_LIMITS = data.PID_HARD_LIMITS;
  s.PID_NUL_NORMAAL = data.PID_NUL_NORMAAL;

  // De meettoestand
  s.supportedPIDs = t.supported ? new Set(t.supported) : new Set();
  s.activePIDs = t.active ? new Set(t.active) : new Set();
  s.pidVals = t.vals || {};
  s.pidHist = t.hist || {};
  s._pidHealth = t.health || {};

  s.getPidDef = function (pid) { return data.ALL_PID_DEFS[pid]; };
  s.fv = function (v) { return (typeof v === 'number') ? String(Math.round(v * 100) / 100) : String(v); };

  vm.createContext(s);
  // De echte kwaliteitsregel: assessPidQuality en buildQualityReport zoals ze
  // in de app staan. Een nagemaakte versie zou precies de vraag wegnemen of
  // de dekking en het kwaliteitsblok hetzelfde oordeel vellen.
  vm.runInContext(knip('pidlane-kwaliteit.js', 'function assessPidQuality', '// Standaard disclaimer'),
    s, { filename: 'pidlane-kwaliteit.js' });
  // De echte gatsplitsing: welk gat binnen een achtergrondperiode valt en welk
  // erbuiten. De speling van 12 s staat daar en niet hier.
  vm.runInContext(knip('pidlane-testrun.js', 'function _plGatenSplits', '/* IS DE ONDERRAND BEREIKBAAR'),
    s, { filename: 'pidlane-testrun.js' });
  s.plGatDuiding = s.plGatDuiding; s.plMeetgatDuiding = s.plMeetgatDuiding;
  vm.runInContext('window.plGatDuiding=plGatDuiding;window.plMeetgatDuiding=plMeetgatDuiding;', s);

  if (t.correlaties) s.correlationLines = function () { return t.correlaties; };
  if (t.rit) s.PLRit = t.rit;
  if (t.achtergrond) s.PLAchtergrond = t.achtergrond;

  vm.runInContext(fs.readFileSync(dir + '/pidlane-aanlevering.js', 'utf8'), s,
    { filename: 'pidlane-aanlevering.js' });
  if (!s.PLAanlevering) { console.error('FOUT: PLAanlevering is niet op window gezet'); process.exit(1); }
  return s.PLAanlevering;
}

// Een PLAchtergrond met precies de perioden die het geval vraagt.
function achtergrond(perioden) {
  return {
    perioden: function () { return perioden.slice(); },
    sinds: function (t) { return perioden.filter(function (p) { return p.van >= (t || 0); }); },
    totaalS: function (t) { return this.sinds(t).reduce(function (a, p) { return a + p.s; }, 0); },
    stilsteS: function (t) {
      return this.sinds(t).reduce(function (a, p) {
        return (typeof p.stil === 'number' && p.stil > a) ? p.stil : a;
      }, 0);
    },
    gemeten: function (t) { return this.sinds(t).filter(function (p) { return typeof p.stil === 'number'; }).length; }
  };
}
function rit(o) {
  return {
    duurS: function () { return o.duurS || 0; },
    monsters: function () { return o.monsters || 0; },
    bron: function () { return { stempels: o.stempels !== false, zonderBron: 0 }; },
    gaten: function () { return (o.gaten || []).slice(); },
    meetgaten: function () { return (o.meetgaten || []).slice(); },
    herverbindingen: function () { return o.herverbindingen || 0; }
  };
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. DEKKING — elke ontbrekende sensor krijgt de juiste reden');
// De volgorde van de controles is het punt. 0142 staat noch in supportedPIDs
// noch in activePIDs; leest de module hem als "niet geselecteerd", dan krijgt
// de monteur het advies een sensor aan te zetten die de auto niet heeft.
{
  const A = bouw({
    supported: [NODIG[0], NODIG[1], NODIG[2]],
    active: [NODIG[0], NODIG[1]],
    vals: { [NODIG[0]]: 820 }
  });
  const d = A.dekking({ set: SET });
  const reden = {};
  d.ontbreekt.forEach(function (x) { reden[x.pid] = x.reden; });

  toets('geleverd is alleen de PID met een geldige waarde',
    JSON.stringify(d.geleverd) === JSON.stringify([NODIG[0]]),
    'kreeg ' + JSON.stringify(d.geleverd));
  toets('de niet-ondersteunde sensor heet niet-ondersteund',
    /ondersteunt de sensor niet/.test(reden[NODIG[3]] || ''),
    NODIG[3] + ' kreeg: ' + reden[NODIG[3]]);
  toets('de ondersteunde-maar-niet-gekozen sensor wijst naar de selectie',
    /PID-selectie/.test(reden[NODIG[2]] || ''),
    NODIG[2] + ' kreeg: ' + reden[NODIG[2]]);
  toets('de uitgevraagde sensor zonder antwoord heet zo',
    /geen geldig antwoord/.test(reden[NODIG[1]] || ''),
    NODIG[1] + ' kreeg: ' + reden[NODIG[1]]);
}

console.log('\n2. Onbekende ondersteuning is niet hetzelfde als "de auto kan het niet"');
// supportedPIDs leeg = nog niet gescand. Wie dat als "niet ondersteund" leest,
// verklaart elke ontbrekende sensor weg — de gevaarlijkste kant om op te vallen.
{
  const A = bouw({ supported: [], active: [NODIG[0]], vals: { [NODIG[0]]: 820 } });
  const d = A.dekking({ set: SET });
  const reden = {};
  d.ontbreekt.forEach(function (x) { reden[x.pid] = x.reden; });

  toets('ondersteuningBekend is null en niet false',
    d.ondersteuningBekend === null, 'kreeg ' + JSON.stringify(d.ondersteuningBekend));
  toets('geen enkele sensor wordt als niet-ondersteund afgeschreven',
    !Object.keys(reden).some(function (p) { return /ondersteunt de sensor niet/.test(reden[p]); }),
    JSON.stringify(reden));
  toets('het blok waarschuwt dat de ondersteuning niet vastgesteld is',
    /niet vastgesteld/.test(A.blok({ set: SET })));
}

console.log('\n3. Een fysiek onmogelijke waarde telt niet als geleverde dekking');
// Anders zegt de dekking "geleverd" over een waarde die het kwaliteitsblok drie
// regels verderop uitsluit — twee oordelen over dezelfde waarde in één prompt.
{
  const koel = '0105';   // koelvloeistoftemperatuur, hard begrensd in pidlane-data.js
  const lim = data.PID_HARD_LIMITS[koel];
  if (!lim) { console.error('FOUT: PID_HARD_LIMITS[' + koel + '] ontbreekt'); process.exit(1); }
  const onmogelijk = lim.max + 500;
  const A = bouw({
    supported: [koel], active: [koel], vals: { [koel]: onmogelijk }
  });
  const d = A.dekking({ pids: [koel] });
  toets('hij staat bij ontbreekt, niet bij geleverd',
    d.geleverd.length === 0 && d.ontbreekt.length === 1,
    JSON.stringify(d));
  toets('en de reden noemt dat hij uitgesloten is',
    /uitgesloten/.test((d.ontbreekt[0] || {}).reden || ''),
    (d.ontbreekt[0] || {}).reden);

  // De tegenproef: een waarde BINNEN het bereik hoort gewoon geleverd te zijn.
  // Zonder deze regel zou een module die alles afkeurt deze toets ook halen.
  const B = bouw({ supported: [koel], active: [koel], vals: { [koel]: 90 } });
  toets('een normale waarde telt wél als geleverd',
    B.dekking({ pids: [koel] }).geleverd.length === 1);
}

console.log('\n4. NIET GEMETEN IS GEEN NUL');
{
  // Geen waarnemers: dan valt er niets over onderbrekingen te zeggen, en dat
  // is iets anders dan "er waren er geen".
  const A = bouw({ active: [NODIG[0]], vals: { [NODIG[0]]: 820 } });
  toets('zonder PLRit en PLAchtergrond is onderbreking null',
    A.onderbrekingen() === null);
  toets('en het blok beweert dan niet dat de meting aaneengesloten liep',
    !/ONDERBREKINGEN: geen/.test(A.blok({ set: SET })));

  // De hartslag liep niet: stil is null. Dat als 0 lezen maakt van
  // "niet gemeten" stilletjes "niets aan de hand" — de fout van #18.
  const B = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    achtergrond: achtergrond([{ van: 1000, tot: 121000, s: 120, stil: null }]),
    rit: rit({ duurS: 300, monsters: 40 })
  });
  const ob = B.onderbrekingen();
  toets('stilsteS blijft null als geen enkele periode de stilte mat',
    ob.stilsteS === null, 'kreeg ' + JSON.stringify(ob.stilsteS));
  toets('de app was wél aantoonbaar 120 s weg, en dat staat er',
    ob.perioden === 1 && ob.wegS === 120);
  toets('het blok zegt dat de stilte NIET gemeten is',
    /NIET gemeten/.test(B.blok({ set: SET })), B.blok({ set: SET }));

  // En wél gemeten: dan hoort het getal er te staan.
  const C = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    achtergrond: achtergrond([{ van: 1000, tot: 121000, s: 120, stil: 84 }]),
    rit: rit({ duurS: 300, monsters: 40 })
  });
  toets('een gemeten stilte komt als getal in het blok',
    /84 s aaneengesloten stil/.test(C.blok({ set: SET })));

  // Zonder versheidsbron zegt het aantal monsters niets (#74).
  const D = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    rit: rit({ duurS: 300, monsters: 56, stempels: false })
  });
  toets('zonder versheidsbron waarschuwt het blok over het aantal metingen',
    /NIET vast te stellen/.test(D.blok({ set: SET })), D.blok({ set: SET }));
}

console.log('\n5. Een gat krijgt zijn naam: de telefoon of de bus');
{
  // Binnen de achtergrondperiode (de speling van 12 s zit in _plGatenSplits).
  const binnen = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    achtergrond: achtergrond([{ van: 100000, tot: 220000, s: 120, stil: 84 }]),
    rit: rit({ duurS: 400, monsters: 50, gaten: [{ van: 110000, tot: 200000, s: 90 }] })
  });
  const tb = binnen.blok({ set: SET });
  toets('een gat binnen een achtergrondperiode wijst naar de telefoon',
    /dit is de telefoon en niet de auto/.test(tb), tb);
  toets('en de module telt het als 0 buiten',
    binnen.onderbrekingen().loopgatenBuiten === 0);

  // Ruim buiten elke periode: de app stond in beeld en de lus lag tóch stil.
  const buiten = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    achtergrond: achtergrond([{ van: 100000, tot: 220000, s: 120, stil: 84 }]),
    rit: rit({ duurS: 400, monsters: 50, gaten: [{ van: 400000, tot: 490000, s: 90 }] })
  });
  const tbu = buiten.blok({ set: SET });
  toets('een gat buiten elke periode wijst naar de verbinding of de adapter',
    /terwijl de app gewoon in beeld stond/.test(tbu), tbu);
  toets('en de module telt het als 1 buiten',
    buiten.onderbrekingen().loopgatenBuiten === 1);

  // Een meetgat is de andere vraag: de lus tikte, er kwam niets terug.
  const mg = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    achtergrond: achtergrond([{ van: 100000, tot: 220000, s: 120, stil: 84 }]),
    rit: rit({ duurS: 400, monsters: 50, meetgaten: [{ van: 400000, tot: 450000, s: 50 }] })
  });
  toets('een meetgat met de app in beeld wijst naar adapter of bus',
    /adapter of de bus, niet op een sensor/.test(mg.blok({ set: SET })), mg.blok({ set: SET }));

  // Een herverbinding is de reden dat een sprong geen defect is.
  const hv = bouw({
    active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    rit: rit({ duurS: 400, monsters: 50, herverbindingen: 2 })
  });
  toets('een herverbinding komt met het woord MEETARTEFACT mee',
    /2×.*MEETARTEFACT/s.test(hv.blok({ set: SET })), hv.blok({ set: SET }));
}

console.log('\n6. De poort: het blok gaat mee als het ergens over gaat');
{
  // Niets gemeten en niets gevraagd: geen blok, geen tokens. Dit is de
  // verbindingsvraag uit pidlane-btflow.js.
  const leeg = bouw({});
  toets('zonder meting en zonder vraag blijft het blok leeg',
    leeg.blok() === '', JSON.stringify(leeg.blok().slice(0, 120)));

  // Maar wie een analyse vraagt over een meting die er niet is, hoort juist
  // dát te horen.
  toets('met een vraag komt het blok er wél, ook zonder meting',
    leeg.blok({ vraag: 'Waarom trilt de motor bij stationair?' }).indexOf('VRAAG:') > 0);

  // Uitzetten kan, maar dan met opzet.
  const vol = bouw({
    supported: NODIG, active: NODIG,
    vals: NODIG.reduce(function (o, p, i) { o[p] = 20 + i; return o; }, {})
  });
  toets('meet:false zet het blok uit', vol.blok({ set: SET, meet: false }) === '');
  toets('en zonder die vlag staat het er wel', vol.blok({ set: SET }).length > 200);
}

console.log('\n7. De weegregels staan erbij, want zonder die regels is dit een tabel');
{
  const A = bouw({
    supported: [NODIG[0]], active: [NODIG[0]], vals: { [NODIG[0]]: 820 }
  });
  const t = A.blok({ set: SET, vraag: 'Is de koeling in orde?' });
  toets('regel 1 verbiedt "ontbrekend dus in orde"',
    /afwezige data is geen goed nieuws/.test(t), t);
  toets('regel 2 zet meetartefact vóór defect',
    /eerst een meetartefact en pas daarna een defect/.test(t));
  toets('regel 5 staat een eerlijk "te weinig gemeten" toe',
    /te weinig gemeten/.test(t));
  toets('het DATAKWALITEIT-blok gaat mee zonder dat de aanroeper eraan denkt',
    /DATAKWALITEIT/.test(t), t);
  toets('de ontbrekende sensoren staan met naam en reden in de tekst',
    /ONTBREEKT — hierover is NIETS gemeten/.test(t));
}

console.log('\n8. De bevindingen die de app zelf al berekende gaan mee');
{
  const A = bouw({
    supported: [NODIG[0]], active: [NODIG[0]], vals: { [NODIG[0]]: 820 },
    correlaties: ['• Dynamo: laadspanning blijft onder 13,5 V bij draaiende motor']
  });
  const t = A.blok({ set: SET });
  toets('correlationLines() komt in het blok terecht',
    /laadspanning blijft onder 13,5 V/.test(t), t);
  toets('en staat aangemerkt als door de app berekend, niet als AI-oordeel',
    /geen AI-oordeel/.test(t));
}

console.log('\n─────────────────────────────────');
if (fout) { console.log(fout + ' van de ' + n + ' toetsen FOUT'); process.exit(1); }
console.log('Alle ' + n + ' toetsen goed');
