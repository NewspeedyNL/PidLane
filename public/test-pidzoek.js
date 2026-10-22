// test-pidzoek.js — PLPidZoek: alle sensoren zoeken en op plausibiliteit keuren (22-10-2026)
// Laadt de echte pidlane-pidzoek.js in een vm; de garage-indeling komt uit de
// echte pidlane-garage.js (_kern.sensGroepen, tekenPidZoek).
'use strict';
const fs = require('fs');
const vm = require('vm');
let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  goed  ' + naam); } else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }
const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; vm.createContext(s);
vm.runInContext(lees('pidlane-pidzoek.js'), s, { filename: 'pidlane-pidzoek.js' });
const Z = s.PLPidZoek;
if (!Z) { console.log('FOUT: PLPidZoek niet geladen'); process.exit(1); }

console.log('\n── plausibel ──');
const P = (bytes, waarde, eenheid, naam) => Z.plausibel({ ok: true, bytes, waarde, eenheid }, { naam: naam || 'x' });
waar('olietemperatuur 85 °C: klopt', P([0x21, 0x50], 85, '°C', 'Motorolietemperatuur').ok);
waar('koelwater 600 °C: verkeerde formule', !P([0x02, 0x80], 600, '°C').ok);
waar('−40 °C (A−40 met A=0): ontbrekende sensor', !P([0x00], -40, '°C').ok);
waar('alles FF: niet beschikbaar', !P([0xFF, 0xFF], 65.5, 'V').ok);
waar('formule past niet (null): nee', !P([0x10], null, '%').ok);
waar('NaN: nee', !P([0x10], NaN, '%').ok);
waar('leeg antwoord: nee', !P([], 3, '%').ok);
waar('100 % grillklep: klopt', P([0xFF, 0x00], 100, '%').ok);
waar('140 % : buiten de grens', !P([0x8C], 140, '%').ok);
waar('12V-accu 14,1 V: klopt', P([0x0E, 0x10], 14.1, 'V', '12V battery voltage').ok);
waar('12V-accu 42 V: verkeerde schaal', !P([0x2A], 42, 'V', '12V battery voltage').ok);
waar('HV-pack 380 V: klopt (geen 12V-grens)', P([0x01, 0x7C], 380, 'V', 'HV battery pack voltage').ok);
waar('MAP-spanning 1,2 V: klopt', P([0x04, 0xCC], 1.2, 'V', 'MAP voltage').ok);
waar('bandenspanning 2,4 bar: klopt', P([0xAF], 2.4, 'bar', 'Bandenspanning voor-links').ok);
waar('onbekende eenheid, gewoon getal: klopt', P([0x12], 18, 'xyz').ok);
waar('onbekende eenheid, 4e9: nee', !P([0xEE, 0x6B, 0x28, 0x00], 4e9, '').ok);
waar('reden staat erbij', /buiten/.test(P([0x8C], 140, '%').reden || ''));

console.log('\n── kandidaten ──');
const bib = [
  { id: 'a', code: '221310', ecu: '', naam: 'Olie' },
  { id: 'b', code: '222A05', ecu: '720', naam: 'Band VL' },
  { id: 'c', code: '222A05', ecu: '720', naam: 'Band VL dubbel' },
  { id: 'd', code: '221E1C', ecu: '7E1', naam: 'ATF' },
  { id: 'e', code: '', naam: 'leeg' }
];
const k = Z.kandidaten(bib, [{ code: '221310', ecu: '' }]);
waar('wat al eigen is valt eruit', !k.some((x) => x.id === 'a'));
waar('dubbel op hetzelfde adres één keer', k.filter((x) => x.code === '222A05').length === 1);
waar('zonder code valt eruit', !k.some((x) => x.id === 'e'));
waar('de rest blijft', k.length === 2);
waar('eigen zonder adres dekt dezelfde code mét adres', Z.kandidaten([{ code: '221E1C', ecu: '7E1' }], [{ code: '221E1C' }]).length === 0);

console.log('\n── de ronde ──');
(async function () {
  const lijst = [
    { id: '1', code: '221310', naam: 'Motorolietemperatuur', eenheid: '°C' },
    { id: '2', code: '221E1C', ecu: '7E1', naam: 'ATF', eenheid: '°C' },
    { id: '3', code: '222A05', ecu: '720', naam: 'Band', eenheid: 'bar' },
    { id: '4', code: '220580', naam: 'Grill shutter', eenheid: '%' }
  ];
  const antw = {
    '221310': { ok: true, bytes: [0x21, 0x50], waarde: 85, eenheid: '°C' },
    '221E1C': { ok: false, fout: 'De auto weigert deze code (7F)' },
    '222A05': { ok: true, bytes: [0xFF], waarde: 350, eenheid: 'bar' },
    '220580': { ok: true, bytes: [0x80], waarde: 50.2, eenheid: '%' }
  };
  const stemmen = [];
  let stappen = 0;
  const r = await Z.zoek(lijst, { test: async (c) => antw[c.code], stem: async (c, u) => { stemmen.push(c.code + ':' + u); }, voortgang: () => { stappen++; } });
  waar('alles getest', r.gedaan === 4 && r.totaal === 4);
  waar('twee plausibel', r.past.length === 2 && r.past.map((p) => p.c.code).join() === '221310,220580');
  waar('de waarde gaat mee', r.past[0].waarde === 85);
  waar('FF-band is vreemd, niet voorgesteld', r.vreemd.length === 1 && r.vreemd[0].c.code === '222A05');
  waar('weigering apart', r.nee.length === 1 && r.nee[0].c.code === '221E1C');
  waar('stem: werkt alleen voor plausibel, werkt_niet voor weigering', stemmen.join() === '221310:werkt,221E1C:werkt_niet,220580:werkt', stemmen.join());
  waar('voortgang na elke code', stappen === 4);

  let n = 0;
  const r2 = await Z.zoek(lijst, { test: async () => { n++; return { ok: false, fout: 'Niet verbonden met een auto' }; } });
  waar('niet verbonden: de ronde stopt na de eerste', n === 1 && r2.afgebroken && r2.fout.length === 1);
  let m = 0;
  const r3 = await Z.zoek(lijst, { test: async (c) => { m++; return antw[c.code]; }, stop: () => m >= 2 });
  waar('stop houdt de ronde aan', m === 2 && r3.gestopt);
  const r4 = await Z.zoek([lijst[0]], { test: async () => { throw new Error('bus kwijt'); } });
  waar('een gegooide fout telt als busfout, geen crash', r4.fout.length === 1 && /bus kwijt/.test(r4.fout[0].reden));

  console.log('\n── indeling en vinkjes (echte pidlane-garage.js) ──');
  const g = { console: s.console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} } },
    addEventListener() {}, setInterval: () => 0, setTimeout: () => 0, Date, JSON, Math, Promise, plFetch: async () => ({ ok: true, json: async () => ({}) }) };
  g.window = g; vm.createContext(g);
  vm.runInContext(lees('pidlane-pidzoek.js'), g);
  vm.runInContext(lees('pidlane-garage.js'), g, { filename: 'pidlane-garage.js' });
  const K = g.PLGarage._kern;
  const gevonden = [
    { code: '221310', naam: 'Motorolietemperatuur', eenheid: '°C' },
    { code: '220301', naam: 'MAP voltage', eenheid: 'V' },
    { code: '222A05', ecu: '720', naam: 'Bandenspanning voor-links', eenheid: 'bar' },
    { code: '224028', ecu: '726', naam: '12V battery state of charge', eenheid: '%' }
  ];
  const gr = K.sensGroepen(gevonden, () => false, false);
  const vk = Z.voorkeus(gr, 2);
  waar('vooraf aangevinkt: de sterkste twee uit weergave (olie, accu), niet de band', vk.length === 2 && vk.includes('221310@') && vk.includes('224028@726') && !vk.includes('222A05@720'), JSON.stringify(vk));
  waar('analyse (sensorspanning) staat niet vooraf aan', !Z.voorkeus(gr, 20).includes('220301@'));
  waar('geen plek vrij: niets aangevinkt', Z.voorkeus(gr, 0).length === 0);

  g.PLEigen = { MAX: 20 };
  const S = { sel: [], eigen: [], pz: { res: { gedaan: 4, totaal: 4, past: gevonden.map((c) => ({ c, waarde: 1, eenheid: c.eenheid })), vreemd: [{ c: { naam: 'Band', code: '222A06' }, reden: 'alleen FF' }], nee: [], fout: [] }, kies: { '221310@': true } } };
  const html = K.tekenPidZoek(S, true);
  waar('overzicht toont de groepen', /Voor weergave/.test(html) && /Voor analyse/.test(html));
  waar('vreemde waarden ingeklapt erbij', /Vreemde waarde \(1\)/.test(html));
  waar('de knop telt wat gekozen is', /Neem 1 op in mijn sensoren/.test(html));
  waar('niet verbonden: geen zoekknop', !/Zoek alle sensoren<\/button>/.test(K.tekenPidZoek({ sel: [], eigen: [] }, false)));
  waar('verbonden: wel een zoekknop', /Zoek alle sensoren<\/button>/.test(K.tekenPidZoek({ sel: [], eigen: [] }, true)));

  console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
  process.exit(fout ? 1 : 0);
})();
