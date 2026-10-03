// ══════════════════════════════════════════════════════════════════
// test-opdrachtappmaat.js — een meetopdracht over de app zelf (#352)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De SPP-proef van #352 stond als lap tekst in CAMPAGNE. De wens (30-09-2026)
// was een meetopdracht, zoals de rest: een kaart met voorwaarden, proeven en
// een oordeel. Een opdracht kon alleen PID's beoordelen; sindsdien kent hij
// ook een witte lijst van APP-MATEN, getallen die een module van de app zelf
// bijhoudt.
//
// Wat hier getoetst wordt, met de echte pidlane-opdracht.js én de echte
// pidlane-sppproef.js in één vm:
//
//   1. keur(): een app-maat mag in een proef en in een voorwaarde; een naam
//      buiten de lijst, `pid` én `app` samen, of een andere maat dan `laatst`
//      wordt afgewezen — de witte lijst is de grens
//   2. elke naam op de lijst geeft in de maat() van zijn module (PLSppProef,
//      PLPip) een getal of null, en geen module kent een naam die de lijst
//      niet heeft
//   4. de opdracht van #319 op de PiP-maten: nog niet, gesloten, bevinding
//   3. het oordeel: niet gemeten is "nog niet" en geen bevinding; binnen de
//      band is gesloten; buiten de band is een bevinding
//
// Draaien vanuit public/:  node test-opdrachtappmaat.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

function laad() {
  const s = {
    console: { warn: function () {}, log: function () {} },
    Promise: Promise, Date: Date, JSON: JSON, Math: Math,
    setTimeout: function (f) { setImmediate(f); return 1; }, clearTimeout: function () {},
    setInterval: function () { return 1; }, clearInterval: function () {},
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: { userAgent: 'node' },
    document: { readyState: 'complete', getElementById: function () { return null; }, addEventListener: function () {},
                querySelector: function () { return null; }, head: { appendChild: function () {} }, body: { appendChild: function () {} } },
    btDiag: function () {}, log: function () {}
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-opdracht.js'), 'utf8'), s, { filename: 'pidlane-opdracht.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-sppproef.js'), 'utf8'), s, { filename: 'pidlane-sppproef.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-pip.js'), 'utf8'), s, { filename: 'pidlane-pip.js' });
  // De meetrit van 01-10-2026: #302 en #333 (PLAdapter), #337 (PLBerekend),
  // #338 (PLVisueel), #376 (PLFoutcodes).
  ['pidlane-adapter.js', 'pidlane-berekend.js', 'pidlane-visueel.js', 'pidlane-foutcodes.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), s, { filename: f });
  });
  return s;
}

// De opdracht zoals hij in D1 staat (30-09-2026), op één waarde na die per
// toets verschilt.
function opdracht() {
  return {
    schema: 2,
    naam: 'Laat een mislukte verbindpoging een draad achter? (#352)',
    sensoren: ['010C'],
    duurS: 60,
    voorwaarden: [
      { wat: 'de patch zit in deze APK', app: 'spp-patch', tussen: [1, 1] },
      { wat: 'volle proef met de patch aan', app: 'spp-proeven-aan', tussen: [1, 99] },
      { wat: 'patch uit, en nog eens', app: 'spp-proeven-uit', tussen: [1, 99] }
    ],
    proeven: [
      { issue: '#352', naam: 'patch aan: geen draad erbij', app: 'spp-erbij-aan', tussen: [0, 0] },
      { issue: '#352', naam: 'patch uit: de fout is na te bouwen', app: 'spp-erbij-uit', tussen: [1, 9] }
    ]
  };
}

console.log('── 1. de witte lijst ──');
{
  const O = laad().PLOpdracht;
  const k = O.keur(opdracht());
  eis(k.ok, 'de opdracht van #352 wordt goedgekeurd' + (k.ok ? '' : ' — ' + k.fouten.join('; ')));
  eis(k.ok && k.opdracht.proeven[0].app === 'spp-erbij-aan' && k.opdracht.proeven[0].meet === 'laatst' && k.opdracht.proeven[0].pid === undefined,
      'de gekeurde kopie draagt de app-maat, meet `laatst`, en geen pid');
  eis(k.ok && k.opdracht.voorwaarden[0].app === 'spp-patch', 'en de voorwaarde draagt hem ook');

  const onbekend = opdracht(); onbekend.proeven[0].app = 'window.alert';
  eis(!O.keur(onbekend).ok, 'een naam buiten de witte lijst wordt afgewezen');
  const dubbel = opdracht(); dubbel.proeven[0].pid = '010C';
  eis(!O.keur(dubbel).ok, '`pid` én `app` in één proef wordt afgewezen');
  const maat = opdracht(); maat.proeven[0].meet = 'max';
  eis(!O.keur(maat).ok, 'een app-maat met een andere maat dan `laatst` wordt afgewezen');
  const band = opdracht(); band.voorwaarden[1].tussen = [5, 1];
  eis(!O.keur(band).ok, 'een omgekeerde band in een app-voorwaarde wordt afgewezen');
  const vw = opdracht(); vw.voorwaarden[0] = { wat: 'onbekend', app: 'fetch' };
  eis(!O.keur(vw).ok, 'een onbekende app-voorwaarde wordt afgewezen');
}

console.log('── 2. de lijst en de module lopen gelijk ──');
{
  const s = laad();
  const namen = s.PLOpdracht.appMaten();
  eis(namen.length > 0, 'de witte lijst is niet leeg (' + namen.join(', ') + ')');
  // Per naam de module die de lijst noemt, niet één vaste module: sinds #319
  // levert ook PLPip maten.
  const kapot = namen.filter(function (n) {
    const mod = s[s.PLOpdracht.appMaatModule(n)];
    const w = mod && typeof mod.maat === 'function' ? mod.maat(n) : undefined;
    return !(w === null || typeof w === 'number');
  });
  eis(kapot.length === 0, 'elke naam geeft een getal of null in de maat() van zijn module' + (kapot.length ? ' — niet: ' + kapot.join(', ') : ''));
  // Andersom: een naam die een module wel kent maar de lijst niet, is een maat
  // die geen opdracht ooit kan vragen. Afgelezen uit de switch in de bron.
  [['pidlane-sppproef.js', 'PLSppProef', /case '(spp-[a-z-]+)'/g], ['pidlane-pip.js', 'PLPip', /case '(pip-[a-z-]+)'/g],
   ['pidlane-adapter.js', 'PLAdapter', /case '((?:adapter|groep|verbind|antwoordtal)-[a-z-]+)'/g],
   ['pidlane-berekend.js', 'PLBerekend', /case '(berekend-[a-z-]+)'/g],
   ['pidlane-visueel.js', 'PLVisueel', /case '(visueel-[a-z-]+)'/g],
   ['pidlane-foutcodes.js', 'PLFoutcodes', /case '(check-[a-z-]+)'/g]].forEach(function (m) {
    const bron = fs.readFileSync(path.join(__dirname, m[0]), 'utf8');
    const inModule = (bron.match(m[2]) || []).map(function (x) { return x.slice(6, -1); });
    const vergeten = inModule.filter(function (n) { return namen.indexOf(n) < 0 || s.PLOpdracht.appMaatModule(n) !== m[1]; });
    eis(inModule.length > 0 && vergeten.length === 0, m[1] + ' kent geen maat die de lijst niet (bij hem) heeft' + (vergeten.length ? ' — wel: ' + vergeten.join(', ') : ''));
  });
}

console.log('── 2b. het verbindprofiel als maat (#394) ──');
{
  const s = laad();
  const vm_ = s.PLAdapter.verbindMaat;
  eis(typeof vm_ === 'function', 'PLAdapter.verbindMaat bestaat');
  const V = { profiel: { st: { bron: 'gemeten', ms: 48, traagstMs: 17 }, groep: { start: 3, plafond: null } } };
  const bus = { batchGroep: () => 2, stats: () => ({ totaal: 200, bad: 3, reqTot: 50, onvolPct: 4 }) };
  const at = { stand: () => ({ msMet: 30, msZonder: 50, blokkades: 1 }) };
  const elm = { weigeringen: () => 0 };
  const m = (n) => vm_(n, V, bus, at, elm);
  eis(m('verbind-st-ms') === 48 && m('verbind-traagst-ms') === 17 && m('verbind-gemeten') === 1, 'ATST, traagste antwoord en gemeten komen uit het profiel');
  eis(m('verbind-groep') === 3 && m('verbind-groep-nu') === 2, 'groep bij verbinden 3, nu 2 — een krimp is zichtbaar');
  eis(m('verbind-fout-pct') === 2, 'foutpercentage over de hele sessie: 3 van 200 = 2 (' + m('verbind-fout-pct') + ')');
  eis(m('verbind-onvol-pct') === 4, 'onvolledige groepen uit PLBus');
  eis(m('antwoordtal-winst-pct') === 40, 'antwoordcijfer: 30 ms met tegen 50 zonder = 40% winst (' + m('antwoordtal-winst-pct') + ')');
  eis(vm_('antwoordtal-winst-pct', V, bus, { stand: () => ({ msMet: 50, msZonder: 48, blokkades: 0 }) }, elm) <= 0, 'cijfer bespaart niets: winst 0 of minder');
  eis(vm_('verbind-st-ms', { profiel: { st: { bron: 'standaard' }, groep: null } }, bus, at, elm) === 400, 'niet gemeten: de standaard 400 ms');
  eis(vm_('verbind-groep', { profiel: { st: { bron: 'gemeten', ms: 100 }, groep: null } }, bus, at, elm) === 0, 'geen groepsproef (geen CAN): 0');
  eis(vm_('verbind-st-ms', null, bus, at, elm) === null && vm_('verbind-fout-pct', V, null, at, elm) === null, 'geen verbinding of geen PLBus: null, geen 0');
  eis(vm_('verbind-fout-pct', V, { stats: () => ({ totaal: 0, bad: 0 }) }, at, elm) === null, 'nog niets verstuurd: null');
}

console.log('── 3. het oordeel ──');
{
  const s = laad();
  const O = s.PLOpdracht;
  const k = O.keur(opdracht());
  // Niets gemeten: geen patchstand, geen volle proef.
  const leeg = O.oordeel(k.opdracht);
  eis(leeg.staat === 'nog niet', 'niets gemeten: nog niet, geen bevinding (' + leeg.staat + ')');
  eis(leeg.voorwaarden[0].vervuld === null, 'een niet-gemeten app-voorwaarde is "niet na te gaan" (null), niet "niet vervuld"');

  // De uitslagen nabootsen via de echte maat(): een nagemaakte maat per naam.
  let waarden = { 'spp-patch': 1, 'spp-proeven-aan': 1, 'spp-proeven-uit': 1, 'spp-erbij-aan': 0, 'spp-erbij-uit': 1 };
  s.PLSppProef.maat = function (n) { return Object.prototype.hasOwnProperty.call(waarden, n) ? waarden[n] : null; };
  const goed = O.oordeel(k.opdracht);
  eis(goed.staat === 'gesloten', 'patch aan zonder draad, patch uit met draad: gesloten (' + goed.staat + ' — ' + goed.reden + ')');
  eis(goed.uitslagen[0].pid === 'spp-erbij-aan' && goed.uitslagen[0].waarde === 0 && goed.uitslagen[0].n === 1,
      'de uitslag heeft de vorm van een PID-proef, zodat het scherm dezelfde balk tekent');

  waarden['spp-erbij-aan'] = 1;
  const raak = O.oordeel(k.opdracht);
  eis(raak.staat === 'bevinding', 'TEGENPROEF: met de patch aan toch een draad erbij is een bevinding (' + raak.staat + ')');

  waarden = { 'spp-patch': 1, 'spp-proeven-aan': 1, 'spp-proeven-uit': 0, 'spp-erbij-aan': 0, 'spp-erbij-uit': null };
  const half = O.oordeel(k.opdracht);
  eis(half.staat === 'nog niet' && /patch uit/.test(half.reden), 'zonder de tegenproef: nog niet, met de reden erbij (' + half.reden + ')');
}

console.log('── 4. de opdracht van #319 kan nu gesloten worden ──');
{
  // Opdracht 17 vroeg om een stap "PiP 2 min aan" die niets in de app zet:
  // vier ritten bleven op "nog niet". Met de app-maten meet hij het zelf.
  const s = laad();
  const O = s.PLOpdracht;
  const k = O.keur({
    schema: 2, naam: 'Meet de app door in beeld-in-beeld? (#319)', sensoren: ['010C'], duurS: 600,
    voorwaarden: [{ wat: 'minstens 2 minuten in het kleine venster', app: 'pip-langst-s', tussen: [120, 86400] }],
    proeven: [{ issue: '#319', naam: 'de meetlus lag nergens langer dan 5 s stil', app: 'pip-gat-s', tussen: [0, 5] }]
  });
  eis(k.ok, 'de opdracht met de PiP-maten wordt goedgekeurd' + (k.ok ? '' : ' — ' + k.fouten.join('; ')));
  let w = { 'pip-langst-s': 0, 'pip-gat-s': null };
  s.PLPip.maat = function (n) { return Object.prototype.hasOwnProperty.call(w, n) ? w[n] : null; };
  eis(O.oordeel(k.opdracht).staat === 'nog niet', 'geen beeld-in-beeld gehad: nog niet');
  w = { 'pip-langst-s': 180, 'pip-gat-s': 1.2 };
  const goed = O.oordeel(k.opdracht);
  eis(goed.staat === 'gesloten', '3 min PiP, langste gat 1,2 s: gesloten (' + goed.staat + ' — ' + goed.reden + ')');
  w = { 'pip-langst-s': 180, 'pip-gat-s': 40 };
  eis(O.oordeel(k.opdracht).staat === 'bevinding', 'TEGENPROEF: 40 s stil in PiP is een bevinding — dat is #319');
}

console.log('── 5. de meetrit van 01-10-2026: #333 en #302 kunnen dicht, en rood ──');
{
  const s = laad();
  const O = s.PLOpdracht;
  // De opdracht voor #333 zoals hij in D1 komt, op de adapternaam na: die
  // voorwaarde leest _plLogAdapter() uit de app en is hier niet het onderwerp.
  const k = O.keur({
    schema: 2, naam: 'Meetrit 1 · groepsproef A (koud) en B (warm), stilstaand (#333)', sensoren: ['010D', '0105'], duurS: 1800,
    voorwaarden: [{ wat: 'proef A liep zonder drift', app: 'groep-a-drift', tussen: [0, 0] },
                  { wat: 'proef B liep zonder drift', app: 'groep-b-drift', tussen: [0, 0] }],
    proeven: [{ issue: '#333', naam: 'A advies', app: 'groep-a-advies', tussen: [4, 6] },
              { issue: '#333', naam: 'A winst', app: 'groep-a-winst', tussen: [15, 1000] },
              { issue: '#333', naam: 'B advies', app: 'groep-b-advies', tussen: [4, 6] },
              { issue: '#333', naam: 'B winst', app: 'groep-b-winst', tussen: [15, 1000] }]
  });
  eis(k.ok, 'de opdracht voor #333 keurt' + (k.ok ? '' : ' — ' + k.fouten.join('; ')));
  let w = { 'groep-a-drift': 0, 'groep-a-advies': 6, 'groep-a-winst': 79 };
  s.PLAdapter.maat = function (n) { return Object.prototype.hasOwnProperty.call(w, n) ? w[n] : null; };
  const half = O.oordeel(k.opdracht);
  eis(half.staat === 'nog niet' && /proef B/.test(half.reden), 'alleen A gedaan: nog niet, en de reden noemt B (' + half.reden + ')');
  w = { 'groep-a-drift': 0, 'groep-a-advies': 6, 'groep-a-winst': 79, 'groep-b-drift': 0, 'groep-b-advies': 6, 'groep-b-winst': 70 };
  eis(O.oordeel(k.opdracht).staat === 'gesloten', 'A en B allebei groep 6 met ruim 15% winst: gesloten');
  w['groep-b-advies'] = 3; w['groep-b-winst'] = 0;
  eis(O.oordeel(k.opdracht).staat === 'bevinding', 'TEGENPROEF: warm adviseert de proef 3 — een bevinding, de automaat blijft op 3');
  w['groep-b-drift'] = 1;
  eis(O.oordeel(k.opdracht).staat === 'nog niet', 'een proef met drift telt niet: nog niet, herhalen');

  const k2 = O.keur({
    schema: 2, naam: 'Meetrit 1 · blijft de responstijd vlak over een half uur? (#302)', sensoren: ['010C'], duurS: 1800,
    voorwaarden: [{ wat: '25 min', app: 'adapter-sessie-min', tussen: [25, 100000] },
                  { wat: 'Slim visueel', app: 'adapter-visueel-pct', tussen: [80, 100] },
                  { wat: 'geen SPP-proef', app: 'adapter-proef', tussen: [0, 0] }],
    proeven: [{ issue: '#302', naam: 'hoogstens ×1,3', app: 'adapter-drift-pct', tussen: [0, 129] }]
  });
  eis(k2.ok, 'de opdracht voor #302 keurt');
  // De maten komen hier uit de echte sessieMaat(), met de reeks van 26-09:
  // 150 → 270 ms in Slim visueel. Dat moet een bevinding zijn.
  const t0 = 1e12, m = (i, ms) => ({ t: t0 + i * 30000, nr: 1, ms: ms, rps: 5, bezet: 90, pids: 26, weergave: 'visueel', modules: [], koel: 90 });
  const reeks = [];
  for (let i = 0; i < 70; i++) reeks.push(m(i, i < 35 ? 150 : 270));
  const echt = s.PLAdapter.sessieMaat;
  s.PLAdapter.maat = function (n) { return echt(n, reeks, []); };
  eis(O.oordeel(k2.opdracht).staat === 'bevinding', 'de drift van 26-09 (150 → 270 ms, 35 min in Slim visueel): bevinding');
  for (let i = 35; i < 70; i++) reeks[i].ms = 155;
  eis(O.oordeel(k2.opdracht).staat === 'gesloten', 'dezelfde 35 minuten vlak: gesloten — #302 kan dicht');
  reeks.length = 30;
  eis(O.oordeel(k2.opdracht).staat === 'nog niet', 'een kwartier verbonden: nog niet, geen uitspraak');
}

if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — een meetopdracht kan over de app zelf gaan');
