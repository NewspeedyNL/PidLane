// ══════════════════════════════════════════════════════════════════
// test-rapportaanvraag.js — Rapporten → ➕ Rapport aanvragen (29-10-2026)
// ──────────────────────────────────────────────────────────────────
// Op de echte pidlane-archief.js (vm). De modules erachter zijn hier nep:
// de vraag is of elke knop de juiste test start, niet of die test werkt —
// dat doen hun eigen tests, en bproef-aanvraag.js in de echte app.
//   1. elk rapport heeft titel, uitleg, duur en een start; geen dubbele id's
//   2. elke knop start precies zijn eigen test, met de juiste opties
//   3. niet verbonden: een meetrapport start niet en zegt waarom; een
//      rapport zonder bus (aankoop, brandstof) start wel
//   4. een module die niet geladen is, staat er niet bij
//   5. het scherm: de knop bovenaan, open de lijst met een Start per rapport
//
// Draaien vanuit public/:  node test-rapportaanvraag.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++; console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

const ov = { style: {}, innerHTML: '', addEventListener() { } };
const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { } };
s.localStorage = { getItem: () => null, setItem() { } }; s.sessionStorage = s.localStorage;
s.document = { getElementById: (id) => (id === 'reportsOverviewSheet' ? ov : null), querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() { }, appendChild() { } }), addEventListener() { }, body: { appendChild() { } }, head: { appendChild() { } } };
s.addEventListener = () => { }; s.setTimeout = () => 0; s.navigator = {};
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-archief.js', 'utf8'), s, { filename: 'pidlane-archief.js' });
const LIJST = vm.runInContext('PL_AANVRAAG', s);
if (!Array.isArray(LIJST) || typeof s.srAanvraag !== 'function' || typeof s.plAanvraagLijst !== 'function') { console.log('  FOUT PL_AANVRAAG/srAanvraag/plAanvraagLijst niet gevonden'); process.exit(1); }

// De nepmodules: elke aanroep komt in het logboek.
let log = [], toast = '';
function nep() {
  log = []; toast = '';
  s.showToast = (t) => { toast = t; };
  s.PLFoutcodes = { open: () => log.push('PLFoutcodes.open'), scan: () => log.push('PLFoutcodes.scan') };
  s.PLOnderzoek = { open: (o) => log.push('PLOnderzoek.open ' + JSON.stringify(o)) };
  s.PLAccu = { open: (t) => log.push('PLAccu.open ' + t) };
  s.PLM06 = { open: () => log.push('PLM06.open') };
  s.openRitAnalyse = (m) => log.push('openRitAnalyse ' + m);
  s.runQuickAI = () => log.push('runQuickAI');
  s.PLMon = { report: () => log.push('PLMon.report') };
  s.setKoopMode = (m) => log.push('setKoopMode ' + m);
  s.openAnalysis = (n) => log.push('openAnalysis ' + n);
  s.closeReportsOverview = () => log.push('dicht');
}

console.log('\n1. De lijst');
eis(LIJST.length === 10, 'tien rapporten aan te vragen', LIJST.map((a) => a.id).join(','));
eis(new Set(LIJST.map((a) => a.id)).size === LIJST.length, 'geen dubbele id\'s');
eis(LIJST.every((a) => a.ic && a.titel && a.wat && a.duur && typeof a.bus === 'boolean' && typeof a.kan === 'function' && typeof a.start === 'function'),
  'elk rapport heeft icoon, titel, uitleg, duur, bus, kan en start');
eis(LIJST.every((a) => !/€|\d+ ?(cent|euro)/i.test(a.wat)), 'geen prijzen in de uitleg (die staan bij het tegoed)');

console.log('\n2. Elke knop start zijn eigen test (verbonden)');
const VERWACHT = {
  foutcodes: ['PLFoutcodes.open', 'PLFoutcodes.scan'],
  onderzoek: ['PLOnderzoek.open {}'],
  controle: ['PLOnderzoek.open {"controle":true}'],
  accu: ['PLAccu.open test'],
  mode06: ['PLM06.open'],
  rit: ['openRitAnalyse 10min'],
  ai: ['runQuickAI'],
  monitor: ['PLMon.report'],
  aankoop: ['setKoopMode koop', 'openAnalysis koop'],
  brandstof: ['openAnalysis fuel']
};
s.connected = true; s.demoMode = false;
Object.keys(VERWACHT).forEach((id) => {
  nep();
  const r = s.srAanvraag(id);
  eis(r === true && JSON.stringify(log) === JSON.stringify(['dicht'].concat(VERWACHT[id])), id + ': Rapporten dicht, dan ' + VERWACHT[id].join(' + '), JSON.stringify(log));
});
nep(); eis(s.srAanvraag('bestaat-niet') === false && !log.length, 'een onbekend rapport doet niets');

console.log('\n3. Niet verbonden');
s.connected = false; s.demoMode = false;
nep();
eis(s.srAanvraag('onderzoek') === false && !log.length && /Verbind eerst/.test(toast), 'een meetrapport start niet en zegt waarom', JSON.stringify(log) + ' ' + toast);
nep();
eis(s.srAanvraag('aankoop') === true && log.indexOf('openAnalysis koop') >= 0, 'het aankooprapport (geen bus) start wel');
const l = s.plAanvraagLijst();
eis(l.filter((a) => !a.nu).every((a) => a.reden === 'Verbind eerst de adapter') && l.some((a) => !a.nu) && l.some((a) => a.nu), 'de lijst zegt per rapport of het nu kan', JSON.stringify(l.map((a) => [a.id, a.nu])));
s.demoMode = true; nep();
eis(s.srAanvraag('accu') === true && log.indexOf('PLAccu.open test') >= 0, 'in demo telt de nep-auto als verbonden');
s.demoMode = false;

console.log('\n4. Wat niet geladen is, staat er niet bij');
nep(); delete s.PLM06; delete s.runQuickAI;
const ids = s.plAanvraagLijst().map((a) => a.id);
eis(ids.indexOf('mode06') < 0 && ids.indexOf('ai') < 0 && ids.indexOf('foutcodes') >= 0, 'zonder PLM06 en runQuickAI: geen mode 06 en geen AI', ids.join(','));
nep(); s.PLAccu = { open: () => { throw new Error('kapot'); } }; s.connected = true;
eis(s.srAanvraag('accu') === false && /Starten lukte niet: kapot/.test(toast), 'een test die bij het starten breekt, zegt dat (geen stille fout)', toast);

console.log('\n5. Het scherm');
nep(); s.connected = false; s._srAanvraagOpen = false; s._sessionReports = [];
s.openReportsOverview();
eis(/id="srAanvraagKnop"/.test(ov.innerHTML) && /Rapport aanvragen/.test(ov.innerHTML) && !/srAanvraagLijst/.test(ov.innerHTML), 'dicht: alleen de knop');
eis(ov.innerHTML.indexOf('srAanvraagKnop') < ov.innerHTML.indexOf('Nog geen rapporten'), 'de knop staat boven de rapporten van deze sessie');
s.srAanvraagWissel();
const h = ov.innerHTML;
eis(/id="srAanvraagLijst"/.test(h), 'open: de lijst staat er');
eis(s.plAanvraagLijst().every((a) => h.indexOf('data-id="' + a.id + '"') >= 0 && h.indexOf("srAanvraag('" + a.id + "')") >= 0), 'elk rapport met een eigen Start-knop');
eis(/Verbind eerst de adapter/.test(h) && /aria-disabled="true"/.test(h), 'niet verbonden: dat staat bij de meetrapporten');
s.srAanvraagWissel();
eis(!/srAanvraagLijst/.test(ov.innerHTML), 'nog een tik: weer dicht');

console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
process.exit(fouten ? 1 : 0);
