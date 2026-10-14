// ══════════════════════════════════════════════════════════════════
// test-rijmodus.js — PLRijmodus: venster, besluit, kleur, hertekenen
// Laadt de echte pidlane-rijmodus.js en de echte pidlane-data.js in een vm:
// de drempels komen uit de tabellen van de app, niet uit een kopie.
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

/* Net genoeg DOM: elementen op id, met een teller per schrijfactie. */
function laad(extra) {
  const els = {};
  const maakEl = function (id) {
    const e = { id: id, attrs: {}, schrijf: 0, hidden: false, _t: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      get textContent() { return this._t; }, set textContent(v) { this._t = String(v); this.schrijf++; } };
    return e;
  };
  const s = Object.assign({
    connected: false, pidVals: {}, pidHist: {},
    innerWidth: 1080, innerHeight: 2200
  }, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  const opslag = {};
  s.localStorage = { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } };
  s.haken = {};
  s.document = {
    body: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, classList: { contains: () => !!s.inPip },
      appendChild(d) {
        // innerHTML uitlezen: elk id wordt een element.
        (d.innerHTML.match(/id="([^"]+)"/g) || []).forEach(function (m) { const id = m.slice(4, -1); els[id] = maakEl(id); });
      } },
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
  s.Date = Date;
  s.els = els;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-data.js'), 'utf8'), s, { filename: 'pidlane-data.js' });
  if (s.voorLaden) s.voorLaden(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-rijmodus.js'), 'utf8'), s, { filename: 'pidlane-rijmodus.js' });
  return s;
}

const s = laad();
const R = s.PLRijmodus;
toets('de module laadt en zet PLRijmodus', !!R && typeof R.kiesModus === 'function');
toets('de drempels komen uit pidlane-data.js', !!s.PID_LET_OP['0105'] && !!s.PID_HARD_LIMITS['0105']);

console.log('\n1. kiesModus — grenswaarden');
const km = R.kiesModus;
toets('vol scherm portret, Pixel (412x869) → normaal', km(412, 869) === 'normaal');
toets('vol scherm portret, smalle telefoon (360x740) → normaal', km(360, 740) === 'normaal');
toets('portret-split, onderste helft (412x430) → rij', km(412, 430) === 'rij');
toets('landschap-split, halve breedte (430x390) → rij', km(430, 390) === 'rij');
toets('landschap vol scherm telefoon (869x412) → rij: lager dan 480', km(869, 412) === 'rij');
toets('tablet vol scherm (1280x800) → normaal', km(1280, 800) === 'normaal');
toets('tablet portret-split (800x620) → normaal: groot genoeg', km(800, 620) === 'normaal');
toets('smal vrij venster (320x800) → rij', km(320, 800) === 'rij');
toets('precies op de grens h=480, w=340 → normaal', km(340, 480) === 'normaal');
toets('één pixel eronder h=479 → rij', km(340, 479) === 'rij');
toets('één pixel eronder w=339 → rij', km(339, 480) === 'rij');
toets('hysterese: vanuit rij blijft 350x490 rij', km(350, 490, 'rij') === 'rij');
toets('hysterese: vanuit normaal is 350x490 normaal', km(350, 490, 'normaal') === 'normaal');
toets('hysterese: vanuit rij ruim erover (364x504) → normaal', km(364, 504, 'rij') === 'normaal');
toets('onzin-afmetingen veranderen de vorige stand niet', km(0, 0, 'rij') === 'rij' && km(NaN, 500, 'normaal') === 'normaal');

console.log('\n2. besluit en handmatige stand');
const b = (f) => R.besluit(f).modus;
toets('auto + klein + verbonden → rij', b({ stand: 'auto', venster: 'rij', verbonden: true }) === 'rij');
toets('auto + klein + niet verbonden → normaal', b({ stand: 'auto', venster: 'rij', verbonden: false }) === 'normaal');
toets('auto + groot + verbonden → normaal', b({ stand: 'auto', venster: 'normaal', verbonden: true }) === 'normaal');
toets('aan wint van een groot venster', b({ stand: 'aan', venster: 'normaal', verbonden: false }) === 'rij');
toets('uit wint van klein + verbonden', b({ stand: 'uit', venster: 'rij', verbonden: true }) === 'normaal');
toets('weggetikt wint van aan', b({ stand: 'aan', sessieUit: true }) === 'normaal');
toets('PiP wint van alles', b({ stand: 'aan', venster: 'rij', verbonden: true, inPip: true }) === 'normaal');
toets('volgorde van de schakelaar: auto → aan → uit → auto',
  R.volgendeStand('auto') === 'aan' && R.volgendeStand('aan') === 'uit' && R.volgendeStand('uit') === 'auto');
toets('onbekende opgeslagen stand leest als auto', R.volgendeStand('rommel') === 'aan');
toets('zetStand bewaart in localStorage', R.zetStand('aan') === 'aan' && s.localStorage.getItem('pl_rijmodus') === 'aan' && R.stand() === 'aan');
toets('en de body draagt data-modus="rij"', s.document.body.attrs['data-modus'] === 'rij');
R.zetStand('uit');
toets('uit zet data-modus terug op normaal', s.document.body.attrs['data-modus'] === 'normaal');
R.zetStand('auto');

console.log('\n3. kleurklasse per drempel (tabellen uit de app)');
const k = R.klasse, LO = s.PID_LET_OP, HL = s.PID_HARD_LIMITS;
toets('koelwater 90 → ok', k('0105', 90) === 'ok');
toets('koelwater op de LET_OP-grens → ok', k('0105', LO['0105'].max) === 'ok');
toets('koelwater net erboven → letop', k('0105', LO['0105'].max + 1) === 'letop');
const rood = LO['0105'].max + 0.1 * (LO['0105'].max - LO['0105'].min);
toets('koelwater 10% van de band erboven → alarm', k('0105', rood) === 'alarm' && k('0105', rood - 0.5) === 'letop');
toets('boven de harde limiet is meetfout, geen alarm', k('0105', HL['0105'].max + 1) === 'meetfout');
toets('accu 14,1 V → ok', k('0142', 14.1) === 'ok');
toets('accu 11,3 V → letop', k('0142', 11.3) === 'letop');
toets('accu 10,5 V → alarm', k('0142', 10.5) === 'alarm');
toets('accu 3 V (onder harde limiet) → meetfout', k('0142', 3) === 'meetfout');
toets('toerental 6500 → ok, 7300 → letop, 8000 → alarm', k('010C', 6500) === 'ok' && k('010C', 7300) === 'letop' && k('010C', 8000) === 'alarm');
toets('geen waarde → leeg', k('0105', undefined) === 'leeg' && k('0105', NaN) === 'leeg' && k('0105', null) === 'leeg');
toets('oud (> OUD_MS) → oud, ook bij een alarmwaarde', k('0105', 90, R.OUD_MS + 1) === 'oud' && k('0105', rood, R.OUD_MS + 1) === 'oud');
toets('net niet oud → gewone klasse', k('0105', 90, R.OUD_MS) === 'ok');
toets('PID zonder LET_OP-regel → ok', k('010D', 120) === 'ok');

console.log('\n4. statustegel');
const st = R.statusStaat;
toets('0 codes, MIL uit → OK', st(false, 0).tekst === 'OK' && st(false, 0).klasse === 'ok');
toets('2 codes, MIL uit → 2 DTC letop', st(false, 2).tekst === '2 DTC' && st(false, 2).klasse === 'letop');
toets('MIL aan → alarm', st(true, 1).klasse === 'alarm' && st(true, 0).tekst === 'MIL');
toets('onbekend → streepje, geen OK', st(null, null).tekst === '—' && st(null, null).klasse === 'leeg');

console.log('\n5. tegels en hertekenen alleen bij verandering');
{
  const t = laad({ connected: true, innerWidth: 432, innerHeight: 400 });
  const nu = Date.now();
  t.pidVals = { '0105': 92, '010C': 2100, '0142': 14.2 };
  t.pidHist = { '0105': [{ t: nu, v: 92 }], '010C': [{ t: nu, v: 2100 }], '0142': [{ t: nu, v: 14.2 }] };
  t.PLRijmodus.meet();
  toets('klein venster + verbonden → rij', t.PLRijmodus.nu().modus === 'rij' && t.document.body.attrs['data-modus'] === 'rij');
  toets('koelwatertegel toont 92', t.els.rijV_koel && t.els.rijV_koel.textContent === '92');
  toets('accu met één decimaal', t.els.rijV_accu.textContent === '14.2');
  const voor = t.PLRijmodus.nu().schrijfacties;
  t.PLRijmodus.ververs(); t.PLRijmodus.ververs();
  toets('zelfde waarden → nul schrijfacties', t.PLRijmodus.nu().schrijfacties === voor,
    'schreef ' + (t.PLRijmodus.nu().schrijfacties - voor) + ' keer');
  t.pidVals['010C'] = 2150; t.pidHist['010C'].push({ t: nu, v: 2150 });
  t.PLRijmodus.ververs();
  toets('één waarde anders → precies één schrijfactie', t.PLRijmodus.nu().schrijfacties === voor + 1);
  t.pidVals['0105'] = 300;
  t.PLRijmodus.ververs();
  toets('meetfout toont een vraagteken', t.els.rijV_koel.textContent === '?' && t.els.rijT_koel.attrs['data-k'] === 'meetfout');
  t.PLRijmodus.melding('koelwater boven bedrijfstemperatuur');
  toets('een melding verschijnt als banner', t.els.rijBanner.textContent === 'koelwater boven bedrijfstemperatuur' && !t.els.rijBanner.hidden);
}

console.log('\n6. haken op de echte app');
{
  let gezet = [];
  const t = laad({ connected: false, innerWidth: 432, innerHeight: 400, voorLaden: function (c) {
    c.updPID = function (p, v) { c.pidVals[p] = v; };
    c.setConn = function (on) { c.connected = on; gezet.push(on); };
    c.PLMon = { _event: function () { return 'mon'; } };
  } });
  t.PLRijmodus.meet();
  toets('klein venster zonder verbinding → normaal', t.PLRijmodus.nu().modus === 'normaal');
  t.setConn(true);
  toets('setConn(true) doet het origineel én schakelt naar rij', gezet[0] === true && t.PLRijmodus.nu().modus === 'rij');
  toets('PLMon._event geeft nog steeds zijn eigen uitkomst', t.PLMon._event('X', 'watcher', 'stil', null, false) === 'mon');
  toets('een stille melding komt niet in de banner', !t.els.rijBanner.textContent);
  t.PLMon._event('UITVAL:0105', 'watcher', 'koelwater levert geen data meer', null, true);
  toets('een luide melding wel', t.els.rijBanner.textContent === 'koelwater levert geen data meer');
  t.updPID('010C', 3000);
  toets('updPID werkt het origineel én de tegel bij', t.pidVals['010C'] === 3000 && t.els.rijV_rpm.textContent === '3000');
  t.setConn(false);
  toets('verbreken → terug naar normaal (auto)', t.PLRijmodus.nu().modus === 'normaal');
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
