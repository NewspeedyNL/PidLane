// ══════════════════════════════════════════════════════════════════
// test-gatduiding.js — hoort dit gat bij de achtergrond, of niet? (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER MISGING, EN WAAROM DAT MEER IS DAN EEN ZIN
//
// Blok 14 van de testrun meldde bij elk gat in de meetlus: *"een gat betekent
// dat de meetlus zelf niet liep (Android bevriest WebView-timers op de
// achtergrond)"*. Het eerste deel is waar. Het tweede is een oorzaak, en die
// werd aan élk gat toegekend zonder ernaar te kijken.
//
// Dat maakt het verslag onbruikbaar op precies het moment dat je het nodig
// hebt. Een gat door een dode adapter, een vastgelopen sweep of een bus die
// niet antwoordt las hetzelfde als een achtergrondpauze — en de lezer wordt
// naar #18 gestuurd terwijl er iets anders aan de hand is. Dat is dezelfde
// vorm als de les uit #35: een plausibele verklaring die als waarneming wordt
// opgeschreven.
//
// Sinds 08-09-2026 legt `plGatDuiding()` elk gat naast de perioden die
// PLAchtergrond werkelijk heeft vastgelegd. Wat hier getoetst wordt is de
// toewijzing zelf, en vooral het onderscheid dat hij moet volhouden:
//
//   perioden = null   PLAchtergrond ontbreekt → NIET TE ZEGGEN
//   perioden = []     gemeten, de app was niet weg → het gat is #18 NIET
//
// Die twee als hetzelfde lezen is de fout die dit issue anderhalve week open
// hield, één laag hoger.
//
// De functie is met opzet uit blok 14 gehaald: dat blok heeft een halve
// testrun nodig om te draaien, en een oordeel dat alleen in de auto te toetsen
// is, wordt niet getoetst.
//
// Draaien vanuit public/:  node test-gatduiding.js        (exit 0 = goed)
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

// pidlane-testrun.js in zijn geheel, net als test-blok5lijst.js. De functie
// wordt dus geladen en niet overgeschreven: verdwijnt hij, dan stopt deze test
// meteen in plaats van een eigen kopie te toetsen.
function laad() {
  const s = {};
  s.window = s;
  s.connected = false; s.demoMode = false;
  s.pidVals = {}; s._pidLastUpd = {}; s.activePIDs = new Set();
  s.console = { warn() { }, error() { }, log() { } };
  s.localStorage = { getItem() { return null; }, setItem() { }, key() { return null; }, length: 0 };
  s.document = {
    getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
    querySelectorAll() { return []; },
    addEventListener() { },
    body: { appendChild() { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats() { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat() { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (typeof s.plGatDuiding !== 'function')
    { console.error('FOUT: plGatDuiding() niet gevonden — blok 14 duidt zijn gaten niet meer'); process.exit(1); }
  return s;
}

const s = laad();
const D = s.plGatDuiding;

// Een gat en een achtergrondperiode, op dezelfde tijdas. t=0 is willekeurig;
// alleen de verhoudingen tellen.
const T = 1788000000000;
function gat(vanS, sS) { return { van: T + vanS * 1000, tot: T + (vanS + sS) * 1000, s: sS }; }
function weg(vanS, sS) { return { van: T + vanS * 1000, tot: T + (vanS + sS) * 1000, s: sS }; }

console.log('\n── een gat binnen een achtergrondperiode is #18 ──');
{
  // De app was van 100 tot 220 weg; de meetlus lag van 136 tot 220 stil. Dat
  // gat valt er ruim binnen en hoort dus aan #18 toegewezen te worden.
  const r = D([gat(136, 84)], [weg(100, 120)]);
  toets('geen enkel gat valt buiten', r.buiten.length === 0, JSON.stringify(r.buiten));
  toets('de duiding wijst naar #18', /dat is #18 en niet de bus/.test(r.duiding), r.duiding);
  toets('en de stiltelijst zegt erbij dat de app weg was', /84 s \(app weg\)/.test(r.lijst), r.lijst);
}

console.log('\n── een gat terwijl de app in beeld stond is #18 NIET ──');
{
  /* DIT IS DE HELE REDEN DAT DE FUNCTIE BESTAAT. Het gat van 90 s ligt volledig
     buiten de achtergrondperiode: de lus lag stil terwijl de app zichtbaar
     was. Dat is geen bevriezing maar een adapter, een bus of een vastgelopen
     sweep — en de oude tekst stuurde de lezer daar juist vandaan. */
  const r = D([gat(400, 90)], [weg(100, 120)]);
  toets('het gat valt buiten elke achtergrondperiode', r.buiten.length === 1, JSON.stringify(r.buiten));
  toets('en de duiding zegt dat het #18 niet is', /dat is #18 niet/.test(r.duiding), r.duiding);
  toets('met een verwijzing naar adapter, bus of sweep', /adapter, de bus of een vastgelopen sweep/.test(r.duiding), r.duiding);
  toets('de stiltelijst plakt er geen "app weg" op', !/app weg/.test(r.lijst), r.lijst);
}

console.log('\n── door elkaar: het verslag noemt de verdeling ──');
{
  const r = D([gat(136, 84), gat(400, 90), gat(600, 30)], [weg(100, 120)]);
  toets('twee van de drie vielen erbuiten', r.buiten.length === 2, JSON.stringify(r.buiten.map(x => x.s)));
  toets('de duiding telt ze', /2 van de 3 gaten vielen BUITEN/.test(r.duiding), r.duiding);
  toets('en noemt het grootste ervan', /grootste 90 s/.test(r.duiding), r.duiding);
}

console.log('\n── de randen mogen schuiven, maar niet oneindig ──');
{
  /* PLRit meet van tik tot tik (om de vijf seconden), PLAchtergrond van
     gebeurtenis tot gebeurtenis. Die randen vallen nooit precies samen, dus er
     staat speling op. Zonder die speling zou bijna élk echt gat als "buiten"
     gelden en meldde blok 14 voortaan het tegenovergestelde van de waarheid. */
  const krap = D([gat(95, 130)], [weg(100, 120)]);   // 5 s vóór en 5 s ná de periode
  toets('een gat dat een paar seconden buiten de randen valt, telt nog mee',
    krap.buiten.length === 0, JSON.stringify(krap.buiten));
  // En de tegenkant: de speling mag geen gat opslokken dat er echt naast ligt.
  const ruim = D([gat(60, 200)], [weg(100, 120)]);   // 40 s ervóór, 40 s erna
  toets('maar een gat dat er ver omheen loopt niet', ruim.buiten.length === 1, JSON.stringify(ruim.buiten));
}

console.log('\n── ontbreekt de module, dan is dat "niet te zeggen" ──');
{
  /* null en [] zijn hier niet hetzelfde, en dat is het punt. Zonder
     PLAchtergrond weet blok 14 het niet; mét PLAchtergrond en een lege lijst
     wéét hij dat de app niet weg was. Wie null als lege lijst leest, meldt
     "dat is #18 niet" over een meting die nooit gedaan is. */
  const geen = D([gat(400, 90)], null);
  toets('null geeft "niet te zeggen"', /PLAchtergrond ontbreekt/.test(geen.duiding), geen.duiding);
  toets('en trekt geen conclusie over #18', !/dat is #18/.test(geen.duiding), geen.duiding);
  toets('en plakt ook geen "app weg" op de stiltes', !/app weg/.test(geen.lijst), geen.lijst);

  const leeg = D([gat(400, 90)], []);
  toets('een lege lijst is wél een uitspraak', /dat is #18 niet/.test(leeg.duiding), leeg.duiding);
}

console.log('\n── geen gaten, geen duiding ──');
{
  // Blok 14 komt hier alleen langs als er iets te melden is; staat er toch een
  // lege lijst, dan hoort er geen zin over gaten in het verslag te komen.
  const r = D([], [weg(100, 120)]);
  toets('lege gatenlijst geeft een lege duiding', r.duiding === '', JSON.stringify(r.duiding));
  toets('en een lege stiltelijst', r.lijst === '', JSON.stringify(r.lijst));
}

// ── #170 — HET MEETGAT KRIJGT DEZELFDE BEHANDELING ───────────────
// Loopgaten werden sinds 08-09 tegen PLAchtergrond gelegd; meetgaten droegen
// tot 10-09 alleen een duur. Op de rit van die dag stond er `Meetgaten: 15 s,
// 35 s, 75 s` en was niet te zien welke daarvan de adapter was.
//
// En de kanten betekenen hier het OMGEKEERDE van bij een loopgat. Een loopgat
// in de achtergrond is de bevriezing; een MEETGAT in de achtergrond is de
// afknijping — de lus tikt door, maar de data staat stil. Buiten de
// achtergrond is het juist wél de adapter of de bus.
const M = s.plMeetgatDuiding;
if (typeof M !== 'function') {
  console.error('FOUT: plMeetgatDuiding() niet gevonden — meetgaten krijgen geen duiding (#170)');
  process.exit(1);
}

console.log('\n── een meetgat binnen een achtergrondperiode is de afknijping ──');
{
  const r = M([gat(136, 84)], [weg(100, 120)]);
  toets('geen enkel meetgat valt buiten', r.buiten.length === 0, JSON.stringify(r.buiten));
  toets('de duiding wijst naar de afgeknepen achtergrond',
    /afgeknepen achtergrond \(#18\) en niet de bus/.test(r.duiding), r.duiding);
  toets('en NIET naar de adapter of de bus', !/dat is de adapter of de bus/.test(r.duiding), r.duiding);
  toets('de lijst zegt erbij dat de app weg was', /84 s \(app weg\)/.test(r.lijst), r.lijst);
}

console.log('\n── een meetgat buiten elke achtergrondperiode is de adapter of de bus ──');
{
  const r = M([gat(400, 35)], [weg(100, 120)]);
  toets('het meetgat valt buiten', r.buiten.length === 1, JSON.stringify(r.buiten));
  toets('de duiding wijst naar de adapter of de bus', /dat is de adapter of de bus \(#133\)/.test(r.duiding), r.duiding);
  toets('en niet naar #18 als oorzaak', !/afgeknepen achtergrond/.test(r.duiding), r.duiding);
}

console.log('\n── de twee soorten spreken elkaar niet na ──');
{
  // Het geval dat ONDERSCHEIDT: hetzelfde gat, dezelfde periode, twee soorten.
  // Zonder deze toets zou plMeetgatDuiding() een kopie van plGatDuiding()
  // kunnen zijn en toch groen staan.
  const binnen = gat(136, 84), periode = [weg(100, 120)];
  const loop = D([binnen], periode), meet = M([binnen], periode);
  toets('het loopgat noemt de bevriezing', /dat is #18 en niet de bus/.test(loop.duiding), loop.duiding);
  toets('het meetgat noemt de afknijping', /afgeknepen achtergrond/.test(meet.duiding), meet.duiding);
  toets('en ze zeggen niet hetzelfde', loop.duiding !== meet.duiding,
    'beide duidingen zijn identiek — dan is er één van de twee overbodig');
}

console.log('\n── zonder PLAchtergrond zegt ook het meetgat niets ──');
{
  const r = M([gat(400, 35)], null);
  toets('null geeft "niet te zeggen"', /PLAchtergrond ontbreekt/.test(r.duiding), r.duiding);
  toets('en trekt geen conclusie', !/adapter of de bus/.test(r.duiding), r.duiding);
  const leeg = M([], [weg(100, 120)]);
  toets('geen meetgaten geeft een lege duiding', leeg.duiding === '', JSON.stringify(leeg.duiding));
}

console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
process.exit(fout ? 1 : 0);
