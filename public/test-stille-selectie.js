// ══════════════════════════════════════════════════════════════════
// test-stille-selectie.js — "in je selectie" is die van de GEBRUIKER (#90)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Blok 3 overschrijft activePIDs voor de duur van de PID-sweep en herstelt
// hem pas in het finally van runTestrun() — dus aan het einde van de hele
// run. Alles wat daartussen "in je selectie" zegt, meet de sweep.
//
// Uit de run van 02-09 13:14: de proef meldde 016D en 019D als "NIET-OK maar
// wél in de actieve selectie", terwijl de busstatistiek van diezelfde run
// laat zien dat de pollus er 28 uitvroeg en die twee daar niet bij zaten.
//
// Deze test bewaakt allebei de kanten. Alleen "meldt niets meer" zou ook
// groen geven, en dan is de proef stilgezet in plaats van gerepareerd.
//
// Draaien vanuit public/:  node test-stille-selectie.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');

function knip(vanaf, tot, wat) {
  const a = bron.indexOf(vanaf), b = bron.indexOf(tot);
  if (a < 0 || b < 0) { console.log('FOUT: knippad voor ' + wat + ' niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

// De sandbox levert precies wat de twee functies aanraken. Wat de app-run
// eromheen doet blijft leeg — raken ze dat ooit wél aan, dan klapt deze test,
// en dat is de bedoeling.
const ctx = { console };
ctx.window = ctx;
ctx._trBezig = false;
ctx._trHerstel = null;
ctx.activePIDs = new Set();
ctx._ritGevraagd = [];
vm.createContext(ctx);
vm.runInContext(
  knip('/* ── WAT HAD DE GEBRUIKER AANSTAAN?', 'function _bewaarSelectie() {', 'de selectiebron') +
  knip('// ── STILLE SENSOREN (blok 11)', '// ── einde stille-sensoren-blok', 'stille sensoren') +
  knip('function _waaromNiet(pid)', '\n/* ── BLOK 14', 'waaromNiet') +
  '\nthis._gebruikersSelectie = _gebruikersSelectie;' +
  '\nthis._stilleSensorenStand = _stilleSensorenStand;' +
  '\nthis._waaromNiet = _waaromNiet;', ctx);

const selectie = ctx._gebruikersSelectie;
const stand = ctx._stilleSensorenStand;
const waarom = ctx._waaromNiet;

let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok  ' + naam);
  else { fout++; console.log('  FOUT ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const isLetOp = r => r && typeof r === 'object' && r.staat === 'LET OP';
const tekst  = r => (r && typeof r === 'object') ? String(r.detail || '') : String(r || '');

// De situatie uit de run van 13:14: de gebruiker had 28 PIDs aan, de sweep
// zette er 46 in en 016D/019D zaten alleen in die sweeplijst.
const GEBRUIKER = ['0104', '0105', '010C'];
const SWEEP     = GEBRUIKER.concat(['016D', '019D']);
function midInRun() {
  ctx._trBezig = true;
  ctx._trHerstel = { actief: GEBRUIKER.slice() };
  ctx.activePIDs = new Set(SWEEP);
}
function naDeRun() {
  ctx._trBezig = false;
  ctx._trHerstel = null;
  ctx.activePIDs = new Set(GEBRUIKER);
}

console.log('Stille sensoren — welke selectie telt?\n');

console.log('1. De bron zelf');
{
  midInRun();
  const s = selectie();
  toets('tijdens een run komt de selectie uit het herstelpunt', s.size === 3 && !s.has('016D'),
        Array.from(s).join(', '));
  naDeRun();
  const s2 = selectie();
  toets('daarbuiten uit activePIDs', s2.size === 3 && s2.has('0104'), Array.from(s2).join(', '));

  // Een afgebroken run laat _trHerstel staan; zonder _trBezig mag dat de
  // live selectie niet overrulen.
  ctx._trBezig = false;
  ctx._trHerstel = { actief: ['9999'] };
  ctx.activePIDs = new Set(GEBRUIKER);
  toets('een blijven staan herstelpunt overrulet de live selectie niet',
        !selectie().has('9999'), Array.from(selectie()).join(', '));
}

console.log('\n2. Het geval uit #90 — sweep-PIDs worden niet meer gemeld');
{
  midInRun();
  const health = { '0104': 'ok', '0105': 'ok', '010C': 'ok', '016D': 'onzin', '019D': 'nodata' };
  const r = stand(health, selectie());
  toets('geen LET OP: 016D en 019D staan niet in de selectie van de gebruiker', !isLetOp(r), tekst(r));
  toets('en de verdeling wordt nog steeds gemeld', /onzin: 1/.test(tekst(r)), tekst(r));

  // TEGENPROEF: met de sweep-selectie zou hij ze wél melden. Loopt dat niet
  // uiteen, dan meet de toets hierboven niets.
  const met = stand(health, ctx.activePIDs);
  toets('TEGENPROEF: met de sweep-selectie meldt hij ze wél',
        isLetOp(met) && /016D/.test(tekst(met)), tekst(met));
}

console.log('\n3. TEGENPROEF — een sensor die de gebruiker WEL aan heeft staan');
{
  midInRun();
  const health = { '0104': 'ok', '0105': 'nodata', '016D': 'onzin' };
  const r = stand(health, selectie());
  toets('meldt LET OP voor 0105', isLetOp(r) && /0105/.test(tekst(r)), tekst(r));
  toets('en noemt 016D er niet bij', !/016D/.test(tekst(r)), tekst(r));
}

console.log('\n4. _waaromNiet() gebruikt dezelfde bron');
{
  midInRun();
  ctx._ritGevraagd = [];
  toets('een sweep-PID heet "stond niet in de selectie"',
        /stond niet in de selectie/.test(waarom('016D')), waarom('016D'));
  toets('een PID van de gebruiker heet "staat wél in de selectie"',
        /staat wél in de selectie/.test(waarom('0105')), waarom('0105'));

  ctx._ritGevraagd = ['0105'];
  toets('en uitgevraagd + in de selectie is een bevinding',
        /dát is een bevinding/.test(waarom('0105')), waarom('0105'));
}

console.log('\n5. Geen health-oordelen is LET OP en geen conclusie');
{
  const r = stand({}, selectie());
  toets('zegt dat er nog niet lang genoeg gepolld is',
        isLetOp(r) && /nog niet lang genoeg/.test(tekst(r)), tekst(r));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
