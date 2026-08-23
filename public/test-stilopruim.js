// test-stilopruim.js — de opruimregel voor stille sensoren (besluit 23-08-2026)
//
// De regel: vijf mislukte pogingen achter elkaar snoeien de PID uit de
// pollronde, daarna krijgt hij vijf herkansingen van één per minuut, en pas
// als die ook alle vijf falen gaat hij via `pidOpruimen()` uit `activePIDs`.
// Binnen dezelfde sessie komt hij niet meer terug.
//
// Knippad: deze test laadt `pidlane-plload.js` en het opruimblok uit
// `pidlane-pidgate.js` in een vm-context. Het pidgate-deel wordt geknipt
// tussen `// ── DE UITGANGSDEUR` en `// ── einde gate-blok`. Verplaats je die
// ankers, verplaats dan ook deze test.
//
// Draaien vanuit public/:  node test-stilopruim.js
'use strict';
const fs = require('fs');
const vm = require('vm');

const gate = fs.readFileSync(__dirname + '/pidlane-pidgate.js', 'utf8');
const a = gate.indexOf('// ── DE UITGANGSDEUR');
const b = gate.indexOf('// ── einde gate-blok');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden in pidlane-pidgate.js'); process.exit(1); }
const deur = gate.slice(a, b);

let NU = 1785600000000;
const gelogd = [];
const ctx = {
  console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
  connected: true, demoMode: false,
  btDiag: (m) => gelogd.push(String(m)),
  log: (m) => gelogd.push(String(m)),
  activePIDs: new Set(['010C', '015C', '0110']),
  manualPIDs: new Set(),
  getPidDef: (p) => ({ pid: p, name: 'Sensor ' + p, unit: '%' }),
  markeerHerijking: () => {},
  plHerijkTick: () => {},
  PID_POLL_CLASS: {}, _focusPIDs: new Set(), _pollMult: 1,
  POLL_PROFIELEN: { basis: { mult: 1, ovr: {} } },
  actiefPollProfiel: () => 'basis',
  detectEngineType: () => 'benzine',
  PLBus: { stats: () => ({ foutPct: 0, belasting: 40, venGemMs: 105, perSec: 6 }) },
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  performance: { now: () => NU }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(deur, ctx, { filename: 'uitgangsdeur' });
// Top-level `const` in een classic script wordt GEEN eigenschap van het
// globale object, dus de drempels zijn van buiten niet leesbaar. Zelfde
// truc als in test-ritpauze.js: een accessor-blok achter de bron plakken.
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plload.js', 'utf8') +
  '\n;window._drempels={t:PID_DEAD_THRESHOLD,r:PID_REPROBE_MS,o:PID_OPRUIM_NA};',
  ctx, { filename: 'pidlane-plload.js' });

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}
// Een herkansing kost een minuut wachten; zonder die sprong telt de
// scheduler hem niet als herkansing maar slaat hij de PID over.
function mislukteHerkansing(pid) { NU += 61000; ctx.markPidNoData(pid); }

/* LET OP — de vijf uit het besluit is een ONDERGRENS, geen exacte waarde.
   Snoeien vereist vier dingen tegelijk (zie pidlane-plload.js): een reeks
   missers, een kwaliteitsscore onder 35, een reeks die ook in echte tijd lang
   genoeg duurt, en een bus die zelf gezond is. Die kwaliteitsscore begint op
   100 en zakt 12 per misser, dus hij passeert de 35 pas bij de zesde. Vijf
   missers snoeien dus nog niet; zes wel. Dat is bewuste bestaande veiligheid
   en niet stilzwijgend aangepast — zie de leesmij. */
console.log('\n— vijf pogingen snoeien uit de pollronde, meer niet —');
{
  for (let i = 0; i < 5; i++) { NU += 1000; ctx.markPidNoData('015C'); }
  toets('na 5 missers nog niet gesnoeid (kwaliteitspoort)', ctx.PLSched.dood('015C'), false);
  NU += 1000; ctx.markPidNoData('015C');
  toets('na de zesde wel gesnoeid', ctx.PLSched.dood('015C'), true);
  toets('maar nog NIET opgeruimd', ctx.PLSched.opgeruimd().length, 0);
  toets('en nog steeds in de selectie', ctx.activePIDs.has('015C'), true);
}

console.log('\n— vier mislukte herkansingen is nog niet genoeg —');
{
  for (let i = 0; i < 4; i++) mislukteHerkansing('015C');
  toets('teller staat op 4', ctx.PLSched.herkansingen('015C'), 4);
  toets('nog niet opgeruimd', ctx.PLSched.opgeruimd().length, 0);
  toets('nog in de selectie', ctx.activePIDs.has('015C'), true);
}

console.log('\n— de vijfde is de laatste —');
{
  mislukteHerkansing('015C');
  toets('opgeruimd', ctx.PLSched.opgeruimd().map(o => o.pid), ['015C']);
  toets('uit de selectie', ctx.activePIDs.has('015C'), false);
  toets('reden staat erbij', /zonder antwoord/.test(ctx.PLSched.opgeruimd()[0].reden), true);
  toets('melding in het log', gelogd.some(m => /015C.*opgeruimd/.test(m)), true);
  toets('melding zegt dat een nieuwe sessie opnieuw probeert',
        gelogd.some(m => /nieuwe sessie/.test(m)), true);
}

console.log('\n— geen terugweg binnen deze sessie —');
{
  ctx.markPidData('015C');                       // hij antwoordt alsnog
  toets('blijft opgeruimd', ctx.PLSched.opgeruimd().length, 1);
  toets('komt niet terug in de selectie', ctx.activePIDs.has('015C'), false);
  // Tweede keer opruimen mag geen tweede regel opleveren.
  toets('opruimen is eenmalig', ctx.pidOpruimen('015C', 'nogmaals'), false);
}

console.log('\n— een sensor die tussendoor antwoordt overleeft het —');
{
  for (let i = 0; i < 6; i++) { NU += 1000; ctx.markPidNoData('0110'); }
  toets('0110 gesnoeid', ctx.PLSched.dood('0110'), true);
  for (let i = 0; i < 4; i++) mislukteHerkansing('0110');
  NU += 61000; ctx.markPidData('0110');          // vijfde herkansing lukt WEL
  toets('teller gewist na een geslaagde herkansing', ctx.PLSched.herkansingen('0110'), 0);
  toets('niet meer dood', ctx.PLSched.dood('0110'), false);
  for (let i = 0; i < 4; i++) mislukteHerkansing('0110');
  toets('en dus nog niet opgeruimd na 4 nieuwe missers', ctx.activePIDs.has('0110'), true);
}

console.log('\n— een gezonde sensor wordt met rust gelaten —');
{
  for (let i = 0; i < 50; i++) { NU += 1000; ctx.markPidData('010C'); }
  toets('010C nooit gesnoeid', ctx.PLSched.dood('010C'), false);
  toets('010C nog in de selectie', ctx.activePIDs.has('010C'), true);
  toets('in totaal precies één opgeruimde sensor', ctx.PLSched.opgeruimd().length, 1);
}

console.log('\n— de drempels staan waar het besluit ze zet —');
{
  // Tegenproef op de test zelf: zou iemand PID_OPRUIM_NA op 1 zetten, dan
  // valt het scenario "vier herkansingen is nog niet genoeg" om.
  toets('vijf pogingen', ctx._drempels.t, 5);
  toets('herkansing per minuut', ctx._drempels.r, 60000);
  toets('vijf herkansingen', ctx._drempels.o, 5);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
