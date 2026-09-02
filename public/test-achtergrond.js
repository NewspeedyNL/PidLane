// ══════════════════════════════════════════════════════════════════
// test-achtergrond.js — weet de app dat hij weg is geweest? (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. Android bevriest de timers van een WebView zodra
// de app naar de achtergrond gaat; pollus, recorder en logger stoppen dan
// tegelijk. Dat is niet te repareren vanuit JavaScript — wél te WETEN. En daar
// hangt meer aan dan een regel in het logboek: bij terugkomst is de SPP-socket
// vaak door Android opgeruimd, en tot 02-09-2026 bleek dat pas als de pollus er
// een commando in probeerde te schrijven. Zestien seconden rommel, met de
// ELM-interpreter in een andere staat dan de app dacht.
//
// HOE ER GETOETST WORDT. pidlane-achtergrond.js wordt in zijn geheel geladen in
// een sandbox met een nagemaakte document/window, en daarna worden de twee
// overgangen aangeroepen die de echte luisteraar ook aanroept. Er wordt niets
// overgeschreven: de drempels, de lijst en de socketbeslissing komen uit de
// module zelf. Verandert daar een drempel, dan verandert deze test mee.
//
// Draaien vanuit public/:  node test-achtergrond.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

// ── de sandbox ────────────────────────────────────────────────────
// Alleen het scherm en de adapter zijn nagemaakt. De module zelf is echt.
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.logs = []; s.btlogs = []; s.guard = [];
  s.log = function (m, niveau) { s.logs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.btDiag = function (m, niveau) { s.btlogs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.connected = ('connected' in o) ? o.connected : true;
  if (o.spp !== false) s._sppConn = { spp: { naam: 'nep' }, address: 'AA:BB' };
  // De guard geeft een belofte terug, net als de echte. Wat hij MEEKRIJGT is
  // wat deze test wil weten: dat er niet met force=true gesloopt wordt.
  if (o.guard !== false) {
    s.sppReconnectGuard = function (spp, address, cmd, force) {
      s.guard.push({ address: address, cmd: String(cmd), force: force });
      return Promise.resolve();
    };
  }
  s.document = {
    _luisteraars: {},
    addEventListener: function (naam, fn) { this._luisteraars[naam] = fn; },
    visibilityState: 'visible'
  };
  vm.createContext(s);
  // Een stuurbare klok, vóór de module. Zonder dit hangt de test aan de echte
  // tijd: twee overgangen vlak na elkaar landen dan in dezelfde milliseconde en
  // knipt sinds() op ruis. Een test die soms groen is, is geen test.
  vm.runInContext('window.__nu = 1788000000000; Date.now = function () { return window.__nu; };', s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-achtergrond.js', 'utf8'),
    s, { filename: 'pidlane-achtergrond.js' });
  if (!s.PLAchtergrond) { console.error('FOUT: PLAchtergrond niet geladen'); process.exit(1); }
  return s;
}

// De klok een stuk vooruit zetten. Alles in deze test loopt hierop, dus de
// uitkomst hangt niet af van hoe snel de machine is.
function verstrijk(s, ms) { vm.runInContext('window.__nu += ' + ms + ';', s); }

// Weg en terug, met een gekozen duur. De module blijft echt; alleen de klok
// wordt gestuurd, en dat is precies de as waar deze module over gaat.
function wegGeweest(s, ms) {
  const lijstVoor = s.PLAchtergrond.perioden().length;
  s.PLAchtergrond._heen();
  verstrijk(s, ms);
  const p = s.PLAchtergrond._terug();
  return { p: p, nieuw: s.PLAchtergrond.perioden().length - lijstVoor };
}

console.log('\n── de drempels komen uit de module ──');
{
  const s = bouw();
  const d = s.PLAchtergrond._drempels();
  toets('melden vanaf 3 s', d.melden, 3000);
  toets('socket nakijken vanaf 10 s', d.socket, 10000);
}

console.log('\n── een korte vensterwissel is geen bevriezing ──');
{
  // Zonder deze helft zou "leg alles vast" ook groen geven, en dan staat de
  // lijst vol met de bestandskiezer en de meldingenbalk.
  const s = bouw();
  const r = wegGeweest(s, 1500);
  toets('1,5 s levert geen periode op', r.nieuw, 0);
  toets('en geen regel in het logboek', s.logs.length, 0);
  toets('en de socket wordt met rust gelaten', s.guard.length, 0);
}

console.log('\n── weg, maar te kort voor de socket ──');
{
  const s = bouw();
  const r = wegGeweest(s, 5000);
  toets('5 s wordt wél vastgelegd', r.nieuw, 1);
  toets('met de duur erbij', r.p.s, 5);
  toets('het staat als waarschuwing in het logboek', s.logs.length && s.logs[0].niveau, 'warn');
  toets('de melding noemt het issue', /#18/.test(s.logs[0].m), true);
  toets('maar de socket wordt nog niet nagekeken', s.guard.length, 0);
  toets('en dat staat ook zo in de periode', r.p.socket, null);
}

console.log('\n── lang weg: de socket wordt nagekeken vóór het volgende commando ──');
{
  const s = bouw();
  const r = wegGeweest(s, 190000);
  toets('190 s wordt vastgelegd', r.p.s, 190);
  toets('de guard is aangeroepen', s.guard.length, 1);
  toets('op het adres van de verbinding', s.guard[0].address, 'AA:BB');
  // DIT is de kern. force=true sloopt de socket zonder te kijken; dat hoort
  // hier niet, want een gezonde verbinding mag een achtergrondpauze overleven.
  toets('met force UIT — eerst kijken, dan pas ingrijpen', !s.guard[0].force, true);
  toets('en de reden staat erbij', /achtergrond/.test(s.guard[0].cmd), true);
  toets('de periode meldt wat er gebeurd is', r.p.socket, 'socket nagekeken');
}

console.log('\n── zonder verbinding valt er niets na te kijken ──');
{
  const s = bouw({ connected: false });
  const r = wegGeweest(s, 190000);
  toets('de periode wordt nog steeds vastgelegd', r.p.s, 190);
  toets('maar de guard blijft ongemoeid', s.guard.length, 0);
  toets('en de reden staat in de periode', r.p.socket, 'niet verbonden');
}

console.log('\n── een ontbrekende guard faalt niet stil ──');
{
  // De bedradingscontrole bewaakt dit ook (sppReconnectGuard staat in KRITIEK),
  // maar hier is te zien wat er dan in het verslag komt.
  const s = bouw({ guard: false });
  const r = wegGeweest(s, 190000);
  toets('de periode blijft', r.p.s, 190);
  toets('en de periode zegt wat er ontbreekt', r.p.socket, 'sppReconnectGuard ontbreekt');
}

console.log('\n── de lijst is per rit te bevragen ──');
{
  const s = bouw();
  wegGeweest(s, 5000);
  verstrijk(s, 60000);          // een minuut rijden tussen de twee onderbrekingen
  const tweede = wegGeweest(s, 8000).p;
  // Het knippunt komt uit de tweede periode zelf. Een eigen Date.now() ernaast
  // zetten werkt hier niet: de twee _heen()-aanroepen liggen microseconden uit
  // elkaar, en dan knipt de test op ruis in plaats van op een moment.
  toets('twee perioden vastgelegd', s.PLAchtergrond.perioden().length, 2);
  toets('sinds() knipt op het moment van nulstellen', s.PLAchtergrond.sinds(tweede.van).length, 1);
  toets('totaalS telt alleen wat daarna kwam', s.PLAchtergrond.totaalS(tweede.van), 8);
  toets('laatste() geeft de jongste', s.PLAchtergrond.laatste().s, 8);
  s.PLAchtergrond.wis();
  toets('wis() maakt de lijst leeg', s.PLAchtergrond.perioden().length, 0);
}

console.log('\n── de luisteraar hangt aan visibilitychange ──');
{
  const s = bouw();
  const fn = s.document._luisteraars['visibilitychange'];
  toets('er is een luisteraar', typeof fn, 'function');
  s.document.visibilityState = 'hidden';
  fn();
  toets('hidden zet de klok aan', s.PLAchtergrond.weg(), true);
  s.document.visibilityState = 'visible';
  fn();
  toets('visible zet hem uit', s.PLAchtergrond.weg(), false);
}

console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
process.exit(fout ? 1 : 0);
