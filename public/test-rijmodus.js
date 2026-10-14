// ══════════════════════════════════════════════════════════════════
// test-rijmodus.js — PLRijmodus: keuze, vorm, kleur, panelen, hertekenen
// Laadt de echte pidlane-data.js, pidlane-caravan.js en pidlane-rijmodus.js
// in één vm: drempels en adviesregels komen uit de app, niet uit een kopie.
// Draaien vanuit public/:  node test-rijmodus.js        (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

/* Net genoeg DOM: elk id in een stuk innerHTML wordt een element. */
function laad(extra) {
  const els = {};
  const registreer = function (html) {
    (String(html).match(/id="([^"]+)"/g) || []).forEach(function (m) { const id = m.slice(4, -1); els[id] = maakEl(id); });
  };
  const maakEl = function (id) {
    const e = { id: id, attrs: {}, style: {}, hidden: false, _t: '', _h: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      get textContent() { return this._t; }, set textContent(v) { this._t = String(v); },
      get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; registreer(v); } };
    return e;
  };
  const s = Object.assign({ connected: false, pidVals: {}, pidHist: {}, innerWidth: 412, innerHeight: 430 }, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  const opslag = {};
  s.localStorage = { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } };
  s.haken = {};
  s.document = {
    body: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, classList: { contains: () => !!s.inPip },
      appendChild(d) { registreer(d.innerHTML); } },
    createElement: function () { return { setAttribute() { }, innerHTML: '' }; },
    getElementById: function (id) { return els[id] || null; },
    addEventListener: function (naam, fn) { s.haken[naam] = fn; },
    visibilityState: 'visible'
  };
  s.addEventListener = function (naam, fn) { s.haken['w:' + naam] = fn; };
  s.setTimeout = function (fn) { fn(); return 1; };
  s.clearTimeout = function () { };
  s.setInterval = function () { return 7; };
  s.clearInterval = function () { };
  s.requestAnimationFrame = function (fn) { fn(); };
  s.vehicleFuelType = function () { return 'benzine'; };
  s.els = els;
  vm.createContext(s);
  for (const f of ['pidlane-data.js', 'pidlane-caravan.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), s, { filename: f });
  }
  if (s.voorLaden) s.voorLaden(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-rijmodus.js'), 'utf8'), s, { filename: 'pidlane-rijmodus.js' });
  s.zet = function (code) { return vm.runInContext(code, s); };
  return s;
}

const s = laad();
const R = s.PLRijmodus;
toets('de module laadt en zet PLRijmodus', !!R && typeof R.besluit === 'function');
toets('de drempels komen uit pidlane-data.js', !!s.PID_LET_OP['0105'] && !!s.PID_HARD_LIMITS['0105']);
toets('en het advies uit pidlane-caravan.js', typeof s.caravanSchakelAdvies === 'function' && typeof s.caravanVerbruikNiveau === 'function');

console.log('\n1. een keuze, geen automaat — standaard uit');
const b = (f) => R.besluit(f).modus;
toets('zonder opgeslagen stand: uit', R.stand() === 'uit' && b({ stand: R.stand() }) === 'normaal');
toets('een klein venster zet hem niet vanzelf aan', (R.meet(), s.document.body.attrs['data-modus'] === 'normaal'),
  'modus ' + s.document.body.attrs['data-modus'] + ' bij 412x430');
toets('verbonden zet hem ook niet vanzelf aan', b({ stand: 'uit', verbonden: true }) === 'normaal');
toets('een oude stand "auto" leest als uit', b({ stand: 'auto' }) === 'normaal');
toets('aan → rij, ook in een groot venster', b({ stand: 'aan' }) === 'rij');
toets('weggetikt wint van aan', b({ stand: 'aan', sessieUit: true }) === 'normaal');
toets('PiP wint van alles', b({ stand: 'aan', inPip: true }) === 'normaal');
toets('wissel: uit → aan, bewaard in localStorage', R.wissel() === 'aan' && s.localStorage.getItem('pl_rijmodus') === 'aan');
toets('en de body draagt data-modus="rij"', s.document.body.attrs['data-modus'] === 'rij');
toets('wissel: aan → uit', R.wissel() === 'uit' && s.document.body.attrs['data-modus'] === 'normaal');

console.log('\n2. kiesVorm — alleen de indeling, met grenswaarden');
const kv = R.kiesVorm;
toets('vol portret, Pixel (412x869) → ruim', kv(412, 869) === 'ruim');
toets('vol portret, smalle telefoon (360x740) → ruim', kv(360, 740) === 'ruim');
toets('portret-split (412x430) → compact', kv(412, 430) === 'compact');
toets('landschap-split (430x390) → compact', kv(430, 390) === 'compact');
toets('tablet portret-split (800x620) → ruim', kv(800, 620) === 'ruim');
toets('smal vrij venster (320x800) → compact', kv(320, 800) === 'compact');
toets('op de grens h=480, w=340 → ruim', kv(340, 480) === 'ruim');
toets('één pixel eronder (h=479 / w=339) → compact', kv(340, 479) === 'compact' && kv(339, 480) === 'compact');
toets('hysterese: vanuit compact blijft 350x490 compact', kv(350, 490, 'compact') === 'compact');
toets('hysterese: vanuit ruim is 350x490 ruim', kv(350, 490, 'ruim') === 'ruim');
toets('hysterese: ruim erover (364x504) → ruim', kv(364, 504, 'compact') === 'ruim');
toets('onzin-afmetingen veranderen niets', kv(0, 0, 'compact') === 'compact' && kv(NaN, 500, 'ruim') === 'ruim');

console.log('\n3. kleurklasse per drempel (tabellen uit de app)');
const k = R.klasse, LO = s.PID_LET_OP, HL = s.PID_HARD_LIMITS;
const rood = LO['0105'].max + 0.1 * (LO['0105'].max - LO['0105'].min);
toets('koelwater 90 → ok, op de grens → ok', k('0105', 90) === 'ok' && k('0105', LO['0105'].max) === 'ok');
toets('koelwater net erboven → letop', k('0105', LO['0105'].max + 1) === 'letop');
toets('10% van de band erboven → alarm', k('0105', rood) === 'alarm' && k('0105', rood - 0.5) === 'letop');
toets('boven de harde limiet is meetfout, geen alarm', k('0105', HL['0105'].max + 1) === 'meetfout');
toets('accu 14,1 ok · 11,3 letop · 10,5 alarm · 3 meetfout',
  k('0142', 14.1) === 'ok' && k('0142', 11.3) === 'letop' && k('0142', 10.5) === 'alarm' && k('0142', 3) === 'meetfout');
toets('geen waarde → leeg', k('0105', undefined) === 'leeg' && k('0105', NaN) === 'leeg' && k('0105', null) === 'leeg');
toets('oud → oud, ook bij een alarmwaarde', k('0105', 90, R.OUD_MS + 1) === 'oud' && k('0105', rood, R.OUD_MS + 1) === 'oud');
toets('net niet oud → gewone klasse', k('0105', 90, R.OUD_MS) === 'ok');

console.log('\n4. status, schaal, paneel, stippen, boog');
const st = R.statusStaat;
toets('0 codes → OK; 2 codes → letop; MIL → alarm', st(false, 0).tekst === 'OK' && st(false, 2).klasse === 'letop' && st(true, 0).klasse === 'alarm');
toets('niet uitgelezen → streepje, geen OK', st(null, null).tekst === '—' && st(null, null).klasse === 'leeg');
toets('fractie klemt op 0..1', R.fractie(-5, 0, 10) === 0 && R.fractie(15, 0, 10) === 1 && R.fractie(5, 0, 10) === 0.5 && R.fractie(undefined, 0, 10) === null);
toets('paneel: caravan wint, dan rit, anders geen',
  R.paneel({ caravan: true, rit: true }) === 'caravan' && R.paneel({ rit: true }) === 'rit' && R.paneel({}) === 'geen');
const sp = R.ritStippen([{ id: 'A' }, { id: 'B' }, { id: 'C' }], { A: { runs: 3, hits: 0 }, B: { runs: 2, hits: 1 }, C: { runs: 0, hits: 0 } });
toets('stippen: getoetst groen, melding oranje, niet gedraaid grijs', sp.map(x => x.staat).join() === 'ok,hit,wacht');
toets('een test zonder dekking is wacht, niet ok', R.ritStippen([{ id: 'X' }], {})[0].staat === 'wacht');
toets('boog: onder doel ok, boven doel letop, boven limiet alarm',
  R.snelheidBoog(90, 95, 100).klasse === 'ok' && R.snelheidBoog(97, 95, 100).klasse === 'letop' && R.snelheidBoog(104, 95, 100).klasse === 'alarm');
toets('boog zonder snelheid → leeg', R.snelheidBoog(undefined, 95, 100).klasse === 'leeg' && R.snelheidBoog(undefined, 95, 100).frac === null);

console.log('\n5. de strook en hertekenen alleen bij verandering');
{
  const t = laad({ connected: true });
  const nu = Date.now();
  t.zet(`pidVals = { '0105': 92, '010C': 2100, '0142': 14.2 };
         pidHist = { '0105': [{ t: ${nu}, v: 92 }], '010C': [{ t: ${nu}, v: 2100 }], '0142': [{ t: ${nu}, v: 14.2 }] };`);
  t.PLRijmodus.zetStand('aan');
  toets('aan → rij en compact bij 412x430', t.PLRijmodus.nu().modus === 'rij' && t.document.body.attrs['data-rijvorm'] === 'compact');
  toets('koelwater in de strook: 92°', t.els.rijV_koel && t.els.rijV_koel.textContent === '92°');
  toets('accu met één decimaal: 14.2V', t.els.rijV_accu.textContent === '14.2V');
  toets('het balkje staat op de schaal (koelwater 92 op 40..130 = 57,8%)', t.els.rijB_koel.style.width === '57.8%', t.els.rijB_koel.style.width);
  toets('zonder monitor: paneel "geen"', t.els.rijPaneel.attrs['data-paneel'] === 'geen');
  const voor = t.PLRijmodus.nu().schrijfacties;
  t.PLRijmodus.ververs(); t.PLRijmodus.ververs();
  toets('zelfde waarden → nul schrijfacties', t.PLRijmodus.nu().schrijfacties === voor, 'schreef ' + (t.PLRijmodus.nu().schrijfacties - voor) + ' keer');
  t.zet(`pidVals['010C'] = 2150; pidHist['010C'].push({ t: ${nu}, v: 2150 });`);
  t.PLRijmodus.ververs();
  toets('toerental anders → tekst en balkje, verder niets', t.PLRijmodus.nu().schrijfacties === voor + 2, 'schreef ' + (t.PLRijmodus.nu().schrijfacties - voor) + ' keer');
  t.zet(`pidVals['0105'] = 300;`);
  t.PLRijmodus.ververs();
  toets('meetfout toont een vraagteken en een leeg balkje', t.els.rijV_koel.textContent === '?' && t.els.rijT_koel.attrs['data-k'] === 'meetfout' && t.els.rijB_koel.style.width === '0%');
  t.PLRijmodus.melding('koelwater boven bedrijfstemperatuur');
  toets('een melding verschijnt als banner', t.els.rijBanner.textContent === 'koelwater boven bedrijfstemperatuur' && !t.els.rijBanner.hidden);
}

console.log('\n6. het caravanpaneel volgt de echte coach');
{
  const t = laad({ connected: true });
  t.PLRijmodus.zetStand('aan');
  t.zet(`caravanActive = true; caravanCoach = [{ t: Date.now(), msg: 'Zet cruise op ~95', level: 'tip' }];`);
  t.caravanRenderLive({ speed: 104, rpm: 1600, load: 92, climb: 'klim', fuelType: 'benzine', fuelRate: null, lkm: 25, cruiseTarget: 95, limit: 100, terreinBron: 'helling', helling: 3.2 }, { val: 50, unit: '%' });
  toets('paneel "caravan"', t.els.rijPaneel.attrs['data-paneel'] === 'caravan');
  toets('radertje: terug bij zware belasting en laag toerental', t.els.rijRad.attrs['data-advies'] === 'terug' && t.els.rijRadPijl.textContent === '↓');
  toets('boog: 104 boven de limiet van 100 is rood', t.els.rijMeter.attrs['data-k'] === 'alarm' && t.els.rijKmh.textContent === '104');
  toets('boog: vulling is 104/140', t.els.rijBoog.attrs['stroke-dasharray'] === '74 100', t.els.rijBoog.attrs['stroke-dasharray']);
  toets('doelstreepje op 95: rotate(32 60 62)', t.els.rijDoel.attrs.transform === 'rotate(32 60 62)', t.els.rijDoel.attrs.transform);
  toets('verbruik 25 tegen 14 richt is alarm (caravanVerbruikNiveau)', t.els.rijVerbruik.attrs['data-k'] === 'alarm' && t.els.rijV_lkm.textContent === '25.0');
  toets('terrein met gemeten helling', t.els.rijTerrein.textContent === '⛰ klim +3.2°');
  toets('de laatste coachtip staat erbij', t.els.rijTip.textContent === 'Zet cruise op ~95');
  t.caravanRenderLive({ speed: 80, rpm: 2800, load: 30, climb: 'vlak', fuelType: 'benzine', fuelRate: null, lkm: 12, cruiseTarget: 95, limit: 100 }, { val: 20, unit: '%' });
  toets('radertje: op bij hoog toerental en lichte belasting', t.els.rijRad.attrs['data-advies'] === 'op' && t.els.rijRadPijl.textContent === '↑');
  toets('verbruik onder de richtwaarde is ok', t.els.rijVerbruik.attrs['data-k'] === 'ok');
  t.caravanRenderLive({ speed: 70, rpm: 2800, load: 30, climb: 'klim', fuelType: 'benzine', fuelRate: null, lkm: 12, cruiseTarget: 95, limit: 100 }, { val: 20, unit: '%' });
  toets('op een klim geen opschakeladvies, ook bij hoog toerental', t.els.rijRad.attrs['data-advies'] === 'ok' && t.els.rijRadPijl.textContent === '✓');
}

console.log('\n7. het rit-monitorpaneel en de haken');
{
  let gezet = [];
  const t = laad({ connected: false, voorLaden: function (c) {
    c.updPID = function (p, v) { c.pidVals[p] = v; };
    c.setConn = function (on) { c.connected = on; gezet.push(on); };
    c.PLMon = { active: true, _order: ['X', 'Y'], _state: () => ({ fase: 'constant' }), _event: function () { return 'mon'; } };
    c.PLWatch = { tests: [{ id: 'A', naam: 'a' }, { id: 'B', naam: 'b' }, { id: 'C', naam: 'c' }], _dekking: { A: { runs: 1, hits: 0 }, B: { runs: 1, hits: 1 } } };
  } });
  t.PLRijmodus.zetStand('aan');
  toets('paneel "rit" als PLMon loopt', t.els.rijPaneel.attrs['data-paneel'] === 'rit');
  toets('één stip per test, met de goede staat',
    t.els.rijS_A && t.els.rijS_A.attrs['data-s'] === 'ok' && t.els.rijS_B.attrs['data-s'] === 'hit' && t.els.rijS_C.attrs['data-s'] === 'wacht');
  toets('de naam van de test die iets zag staat erbij', t.els.rijGezien.textContent === 'b', t.els.rijGezien.textContent);
  toets('telling en fase', t.els.rijTelling.textContent === '2/3 getoetst · 2 meldingen' && t.els.rijFase.textContent === 'constant', t.els.rijTelling.textContent);
  t.PLWatch._dekking.C = { runs: 1, hits: 0 };
  const voor = t.PLRijmodus.nu().schrijfacties;
  t.PLRijmodus.ververs();
  toets('een test erbij: alleen die stip en de telling', t.els.rijS_C.attrs['data-s'] === 'ok' && t.PLRijmodus.nu().schrijfacties === voor + 2,
    'schreef ' + (t.PLRijmodus.nu().schrijfacties - voor) + ' keer');
  toets('PLMon._event geeft nog steeds zijn eigen uitkomst', t.PLMon._event('X', 'watcher', 'stil', null, false) === 'mon');
  toets('een stille melding komt niet in de banner', !t.els.rijBanner.textContent);
  t.PLMon._event('UITVAL:0105', 'watcher', 'koelwater levert geen data meer', null, true);
  toets('een luide melding wel', t.els.rijBanner.textContent === 'koelwater levert geen data meer');
  t.setConn(true);
  toets('setConn doet het origineel', gezet[0] === true && t.PLRijmodus.nu().modus === 'rij');
  t.updPID('010C', 3000);
  toets('updPID werkt het origineel én de strook bij', t.pidVals['010C'] === 3000 && t.els.rijV_rpm.textContent === '3000');
  t.els.rijUit.onclick();
  toets('volledige app → normaal tot de volgende verbinding', t.PLRijmodus.nu().modus === 'normaal');
  t.setConn(true);
  toets('na opnieuw verbinden weer rij', t.PLRijmodus.nu().modus === 'rij');
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
