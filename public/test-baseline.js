// ══════════════════════════════════════════════════════════════════
// test-baseline.js — leren van normaal, op de échte functie
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (02-09-2026)
//
// Deze logica werd tot vandaag "getoetst" in test-waakronde.js, en wel op
// twee manieren fout tegelijk: de functie stond daar in kopie, en hij hoort
// niet eens bij die module — `baselineBevinding()` staat in
// `pidlane-pids.js`. De echte functie werd door geen enkele test genoemd.
//
// Wat er op het spel staat is de vergissing die op 02-08-2026 hersteld is
// en hier vastgelegd hoort te blijven: de vorige versie vergeleek een
// MOMENTWAARDE met de spreiding van SESSIEGEMIDDELDEN. De σ van gemiddelden
// is klein — dat is wat middelen doet — terwijl een momentwaarde alle kanten
// op schiet. Gevolg: élke actieve PID stond als bevinding in de banner, acht
// "afwijkingen" waarvan er nul iets betekende. Een test die de kopie toetst
// kan die terugval niet zien; deze wel.
//
// Drie remmen worden apart nagelopen, want ze doen alle drie iets anders:
//   1. BASE_MIN_N   — te weinig metingen deze rit → geen oordeel
//   2. σ-bodem      — een auto die elke rit identiek rijdt mag niet alles
//                     laten afgaan
//   3. BASE_DREMPEL — 3σ in plaats van 2,5σ
//
// Draaien vanuit public/:  node test-baseline.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van), b = tot ? bron.indexOf(tot) : bron.length;
  if (a < 0 || b < a) { console.error('FOUT: knipbereik "' + naam + '" niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

const VIN = 'JMZKE2W7A00123456';

// `ritten` zijn de sessiegemiddelden uit eerdere ritten (het geleerde
// normaal); `nu` is wat er deze rit gemeten is.
function bouw(pid, ritten, nu) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  const opslag = {};
  s.localStorage = {
    getItem: k => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: k => { delete opslag[k]; }
  };
  s.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() { }, remove() { } } }),
    addEventListener() { }, body: {}
  };
  s.addEventListener = () => { };
  s.setTimeout = () => 0; s.setInterval = () => 0; s.clearInterval = () => { };
  vm.createContext(s);

  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    var _sessionStats={}, vehicleInfo={vin:'${VIN}', merk:'Mazda', year:'2018'};
    var _logs=[];
    function log(m,n){ _logs.push(String(m)); }
    function getPidDef(pid){ return ALL_PID_DEFS[pid]||null; }
    function fv(v){ return Math.round(Number(v)*10)/10; }
  `, s, { filename: 'sandbox-omgeving' });

  vm.runInContext(
    knip(lees('pidlane-pids.js'), 'function feedSessionStat', null, 'baseline'), s, { filename: 'pidlane-pids.js (knip)' });

  // De historie: elke eerdere rit is één opgeslagen sessie met één gemiddelde.
  const sessies = ritten.map(avg => ({ ts: Date.now(), stats: { [pid]: { avg, min: avg, max: avg, n: 100 } } }));
  opslag['pl_sessions_' + VIN] = JSON.stringify(sessies);

  // De lopende rit: `nu.n` metingen met gemiddelde `nu.gem`.
  if (nu) {
    vm.runInContext('_sessionStats[' + JSON.stringify(pid) + ']=' +
      JSON.stringify({ n: nu.n, sum: nu.gem * nu.n, min: nu.gem, max: nu.gem, last: nu.gem }) + ';', s);
  }
  s.lezen = expr => vm.runInContext(expr, s);
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— de drempels staan waar ze horen —');
{
  const s = bouw('010C', [1200, 1240, 1180], null);
  t('BASE_MIN_N is 30', s.lezen('BASE_MIN_N'), 30);
  t('de σ-bodem is 2 %', s.lezen('BASE_SIGMA_MIN'), 0.02);
  t('de drempel is 3σ, niet 2,5', s.lezen('BASE_DREMPEL'), 3);
}

console.log('\n— zonder historie geen normaal —');
{
  t('nul ritten geeft geen baseline', bouw('010C', [], null).vehicleBaseline('010C'), null);
  t('twee ritten is te weinig', bouw('010C', [1200, 1240], null).vehicleBaseline('010C'), null);
  const b = bouw('010C', [1200, 1240, 1180], null).vehicleBaseline('010C');
  t('drie ritten is genoeg', b.n, 3);
  t('en het gemiddelde klopt', Math.round(b.mean), 1207);
}

console.log('\n— gelijk met gelijk: de rit, niet het moment —');
{
  const ritten = [1200, 1240, 1180, 1220, 1210];

  // DE HERSTELDE FOUT. 937 rpm is een doodgewone momentwaarde voor een motor
  // die tussen 700 en 4000 schommelt. Vergeleken met de σ van sessie-
  // gemiddelden (~20 rpm) is dat moeiteloos 13σ. Het mag geen bevinding zijn:
  // er wordt niet op momentwaarden geoordeeld.
  const s = bouw('010C', ritten, { gem: 1215, n: 200 });
  t('een normale rit levert niets op', s.baselineBevinding('010C'), null);
  t('en dus ook geen tekst', s.baselineWarning('010C', 937), '');

  const s2 = bouw('010C', ritten, { gem: 1900, n: 200 });
  const r = s2.baselineBevinding('010C');
  t('een écht afwijkende rit is wel een bevinding', r !== null, true);
  t('de afwijking is uitgerekend', r.dev > 3, true);
  t('het PID staat erbij', r.pid, '010C');
  t('de tekst noemt de sensornaam', /Motortoerental/.test(r.tekst), true);
  t('de tekst zegt dat het over de rit gaat', /deze rit gemiddeld/.test(r.tekst), true);
  t('en noemt over hoeveel ritten', /over 5 ritten/.test(r.tekst), true);
}

console.log('\n— rem 1: te weinig metingen deze rit —');
{
  const ritten = [1200, 1240, 1180, 1220, 1210];
  t('10 metingen is te weinig om te oordelen',
    bouw('010C', ritten, { gem: 1900, n: 10 }).baselineBevinding('010C'), null);
  t('29 ook nog',
    bouw('010C', ritten, { gem: 1900, n: 29 }).baselineBevinding('010C'), null);
  t('vanaf 30 telt hij mee',
    bouw('010C', ritten, { gem: 1900, n: 30 }).baselineBevinding('010C') !== null, true);
  t('zonder lopende rit geen oordeel',
    bouw('010C', ritten, null).baselineBevinding('010C'), null);
}

console.log('\n— rem 2: de σ-bodem tegen te strakke historie —');
{
  // Vijf ritten die vrijwel identiek zijn. Zonder bodem wordt σ minuscuul en
  // is 0,6 °C verschil al tientallen sigma's.
  const strak = [90.0, 90.1, 89.9, 90.0, 90.05];
  t('een klein verschil gaat niet af',
    bouw('0105', strak, { gem: 90.6, n: 200 }).baselineBevinding('0105'), null);
  t('maar een echt verschil komt er wel door',
    bouw('0105', strak, { gem: 104, n: 200 }).baselineBevinding('0105') !== null, true);
}

console.log('\n— rem 3: de drempel ligt op 3σ —');
{
  // Historie met een bekende σ: gemiddelde 100, σ = 10.
  const ritten = [90, 90, 110, 110, 100];
  const b = bouw('0105', ritten, null).vehicleBaseline('0105');
  t('gemiddelde is 100', Math.round(b.mean), 100);
  t('σ is ongeveer 9', Math.round(b.std), 9);

  // σ-bodem is 2 % van 100 = 2, dus de echte σ (≈8,9) wint.
  const sigma = b.std;
  // Bewust 2,7σ en niet precies 2,5σ: op de drempel zelf beslist een
  // afrondingsverschil, en dan toetst deze regel de rekenmachine in plaats
  // van de drempel. 2,7 ligt ondubbelzinnig tussen 2,5 en 3.
  t('2,7σ is nog geen bevinding',
    bouw('0105', ritten, { gem: 100 + 2.7 * sigma, n: 200 }).baselineBevinding('0105'), null);
  t('3,5σ wel',
    bouw('0105', ritten, { gem: 100 + 3.5 * sigma, n: 200 }).baselineBevinding('0105') !== null, true);
}

console.log('\n— het getal om op te sorteren staat los van de zin —');
{
  // Sinds de bevindingenbalk er nog maar twee toont (#60) moet `dev` een eigen
  // veld zijn: de opmaak van de zin mag niet bepalen welke bevinding wint.
  const ritten = [1200, 1240, 1180, 1220, 1210];
  const licht = bouw('010C', ritten, { gem: 1400, n: 200 }).baselineBevinding('010C');
  const zwaar = bouw('010C', ritten, { gem: 1900, n: 200 }).baselineBevinding('010C');
  t('beide zijn bevindingen', !!(licht && zwaar), true);
  t('de zwaarste heeft de hoogste dev', zwaar.dev > licht.dev, true);
  t('dev is een getal, geen tekst', typeof zwaar.dev, 'number');
  t('baselineWarning geeft alleen de zin', typeof zwaar.tekst, 'string');
}

console.log('\n— de sessie-boekhouding eronder —');
{
  const s = bouw('010C', [1200, 1240, 1180], null);
  s.lezen('_sessionStats={};');
  [800, 1200, 1600].forEach(v => s.feedSessionStat('010C', v));
  t('drie metingen geteld', s.lezen("_sessionStats['010C'].n"), 3);
  t('de som klopt', s.lezen("_sessionStats['010C'].sum"), 3600);
  t('min en max kloppen',
    s.lezen("_sessionStats['010C'].min+'/'+_sessionStats['010C'].max"), '800/1600');
  s.feedSessionStat('010C', null);
  s.feedSessionStat('010C', NaN);
  t('null en NaN tellen niet mee', s.lezen("_sessionStats['010C'].n"), 3);
}

console.log('\n─────────────────────────────────────────');
console.log(ok + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
