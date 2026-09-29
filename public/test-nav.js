// ══════════════════════════════════════════════════════════════════
// test-nav.js — de regels achter de onderbalk en de garagemodus (PLNav)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// De onderbalk vervangt ☰ en 🏠. Vier regels bepalen wat de klant ziet, en
// elk ervan kan stil verkeerd gaan zonder dat er iets breekt:
//   • welke tab oplicht (een tab die "Mijn auto" zegt terwijl je in een
//     rapport zit, is precies de verwarring die hier weg moest);
//   • wie de garagemodus krijgt zonder erom te vragen (een Play-reviewer
//     in de demo hoort de eenvoudige app te zien);
//   • dat een eigen keuze de standaard verslaat, in beide richtingen;
//   • dat de balk wegblijft zolang er niemand ingelogd is.
// Plus de statustekst die de chip "Systeem" verving (pidlane-uihelpers.js).
//
// Laadt de echte pidlane-nav.js en knipt sysTekst() uit pidlane-uihelpers.js.
// Draaien vanuit public/:  node test-nav.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}

// De module start zichzelf bij DOMContentLoaded; met readyState 'loading'
// en een lege addEventListener draait hij niet — we willen alleen de kern.
const ctx = {
  window: {}, console: console,
  document: { readyState: 'loading', addEventListener: function () {} }
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-nav.js', 'utf8'), ctx, { filename: 'pidlane-nav.js' });
const N = ctx.window.PLNav;
if (!N || !N._kern) { console.log('FAAL PLNav hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = N._kern;

console.log('\n1. Welke tab licht op');
eis('startscherm in beeld → Mijn auto', K.welkeTab({ welkom: true }) === 'auto');
eis('niets erboven → Live', K.welkeTab({}) === 'live');
eis('rapportenoverzicht open, ook boven het startscherm → Rapporten', K.welkeTab({ welkom: true, rapporten: true }) === 'rapporten');
eis('Meer open wint van alles', K.welkeTab({ welkom: true, rapporten: true, meer: true }) === 'meer');

console.log('\n2. Wie krijgt de garagemodus vanzelf');
eis('een klant niet', K.garageStandaard(true, true) === false);
eis('beheer of personeel wel', K.garageStandaard(true, false) === true);
eis('de demo zonder login niet  <- dat ziet een Play-reviewer', K.garageStandaard(false, false) === false);

console.log('\n3. Een eigen keuze wint van de standaard');
eis('klant zet hem aan → aan', K.garageAan('1', false) === true);
eis('beheer zet hem uit → uit', K.garageAan('0', true) === false);
eis('niets gekozen → de standaard', K.garageAan(null, true) === true && K.garageAan(null, false) === false);
eis('rommel in de opslag → de standaard, niet "aan"', K.garageAan('ja', false) === false);

console.log('\n4. Wanneer staat de balk er');
eis('niet ingelogd, geen demo → geen balk', K.balkZichtbaar({}) === false);
eis('ingelogd → balk', K.balkZichtbaar({ ingelogd: true }) === true);
eis('demo zonder login → balk', K.balkZichtbaar({ demo: true }) === true);
eis('een dashboard onder de balk open → geen balk', K.balkZichtbaar({ ingelogd: true, dashboard: true }) === false);

console.log('\n5. De dashboards waarvoor de balk wijkt bestaan echt');
const bronnen = ['pidlane-koopcheck.js'].map(function (f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }).join('\n');
K.ONDER_DE_BALK.forEach(function (id) {
  const m = bronnen.match(new RegExp("ov\\.id='" + id + "'[\\s\\S]{0,200}?z-index:(\\d+)"));
  eis(id + ' bestaat en ligt onder de balk (9550)', !!m && Number(m[1]) < 9550, m ? 'z-index ' + m[1] : 'niet gevonden');
});

console.log('\n6. De statusregel (pidlane-uihelpers.js)');
{
  const bron = fs.readFileSync(__dirname + '/pidlane-uihelpers.js', 'utf8');
  const i = bron.indexOf('function sysTekst(s){');
  if (i < 0) { eis('sysTekst() bestaat', false); }
  else {
    const j = bron.indexOf('\n}', i);
    const sysTekst = new Function(bron.slice(i, j + 2) + '\nreturn sysTekst;')();
    eis('niet verbonden zegt dat', sysTekst({ verbonden: false, ai: true }) === 'Niet verbonden');
    eis('verbonden met een bekende auto → de naam', sysTekst({ verbonden: true, ai: true, naam: 'Mazda CX-5' }) === 'Mazda CX-5');
    eis('verbonden zonder naam → Verbonden', sysTekst({ verbonden: true, ai: true, naam: '' }) === 'Verbonden');
    eis('AI weg gaat vóór de naam: dat is wat er mis is', sysTekst({ verbonden: true, ai: false, naam: 'Mazda CX-5' }) === 'AI niet bereikbaar');
    eis('demo zegt Demo, ook zonder verbinding', sysTekst({ demo: true, verbonden: false }) === 'Demo');
  }
}

console.log('\n6b. Nooit een VIN in de statusregel');
{
  const bron = fs.readFileSync(__dirname + '/pidlane-uihelpers.js', 'utf8');
  const i = bron.indexOf('function sysNaam(tag, merk, model){');
  if (i < 0) { eis('sysNaam() bestaat', false); }
  else {
    const j = bron.indexOf('\n}', i);
    const sysNaam = new Function(bron.slice(i, j + 2) + '\nreturn sysNaam;')();
    eis('een VIN wordt merk en model  <- gezien op 29-09-2026: JMZKF6W7600766507 bovenin',
      sysNaam('JMZKF6W7600766507', 'Mazda', 'CX-5') === 'Mazda CX-5', sysNaam('JMZKF6W7600766507', 'Mazda', 'CX-5'));
    eis('een VIN zonder merk wordt leeg, niet de VIN', sysNaam('JMZKF6W7600766507', '', '') === '');
    eis('een gewone naam blijft staan', sysNaam('DEMO — Mazda CX-5', 'Mazda', 'CX-5') === 'DEMO — Mazda CX-5');
    eis('geen naam → merk en model', sysNaam('', 'Mazda', 'CX-5') === 'Mazda CX-5');
  }
}

console.log('\n7. Elke tab in index.html hoort bij een tab die welkeTab() kan geven');
{
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const tabs = []; html.replace(/class="pl-nav-tab" data-tab="([a-z]+)"/g, function (_, t) { tabs.push(t); });
  eis('vier tabs', tabs.length === 4, tabs.join(','));
  const kan = ['auto', 'live', 'rapporten', 'meer'];
  eis('dezelfde vier als welkeTab() kent', tabs.slice().sort().join() === kan.slice().sort().join(), tabs.join(','));
  eis('de teller van het rapportarchief staat op de tab Rapporten', /data-tab="rapporten"[\s\S]{0,400}id="bnRepCnt"/.test(html));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FAAL' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
