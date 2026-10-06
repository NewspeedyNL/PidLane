// ══════════════════════════════════════════════════════════════════
// test-koopcheck-kenteken.js — de koopcheck laat jouw kenteken staan (#331)
// ──────────────────────────────────────────────────────────────────
// `pl_kenteken` is de sleutel die de app als JOUW auto leest: _uvKey() in
// pidlane-voertuigdata.js valt er zonder VIN op terug, en het dossier dat
// daaronder staat gaat mee de AI-prompt in. Tot 06-10-2026 schreef
// koopRdwLookup() het kenteken van de auto die je overweegt daarin. Na één
// koopcheck hoorde je km-stand en onderhoud dus bij een vreemde auto.
//
// Deze test draait de échte koopRdwLookup() uit pidlane-koopcheck.js,
// geknipt op zijn eigen kop en de sectie die erna komt, met een nep-RDW.
// De hulpfuncties voor datums en validatie zijn stubs: die zijn hier niet
// het onderwerp. Verdwijnt een anker, dan stopt de test.
//
// Draaien vanuit public/:  node test-koopcheck-kenteken.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync('pidlane-koopcheck.js', 'utf8');
const KOP = 'async function koopRdwLookup(){';
const STAART = '\n// RDW-DATAVALIDATIE';
const van = bron.indexOf(KOP), tot = bron.indexOf(STAART, van);
if (van < 0 || tot < van) {
  console.log('  FOUT  koopRdwLookup() niet gevonden in pidlane-koopcheck.js — het anker is weg, deze test toetst niets meer');
  process.exit(1);
}
const fnBron = bron.slice(van, tot);

function laad(eigen) {
  const opslag = eigen ? { pl_kenteken: eigen } : {};
  const el = {};
  const s = {
    events: [], geschreven: [],
    localStorage: {
      getItem: (k) => (k in opslag ? opslag[k] : null),
      setItem: (k, v) => { s.geschreven.push(k); opslag[k] = String(v); },
      removeItem: (k) => { delete opslag[k]; }
    },
    document: {
      getElementById: (id) => el[id] || (el[id] = { id, value: id === 'koopKentInput' ? 'xx-123-y' : '', style: {}, textContent: '', innerHTML: '', disabled: false })
    },
    plFetch: async () => ({ ok: true, json: async () => [{ kenteken: 'XX123Y', merk: 'VOLKSWAGEN', handelsbenaming: 'TRANSPORTER' }] }),
    validateRdwVehicle: () => ({ velden: { merk: 'VOLKSWAGEN', model: 'TRANSPORTER', year: '2017' }, weggelaten: [] }),
    _rdwPlausibleDate: () => false, _rdwPlausibleName: () => false,
    formatRdwDate: (d) => String(d), maandenTotAPK: () => null, cap: (t) => t,
    scanLogAdd() {}, log() {},
    vehicleInfo: {},
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    console: { warn() {}, log() {}, error() {} }
  };
  s.window = s;
  s.dispatchEvent = (e) => { s.events.push(e); };
  vm.createContext(s);
  vm.runInContext('var _koopRdwData = null;\n' + fnBron, s);
  return { s, opslag, el };
}

(async function () {
  console.log('1. Een koopcheck laat het kenteken van je eigen auto staan');
  {
    const { s, opslag, el } = laad('EIGEN1');
    await s.koopRdwLookup();
    // Eerst: is de functie echt tot het eind gekomen? Anders bewijst een
    // onaangeroerd pl_kenteken niets — dan stopte hij al vóór die regel.
    toets('de koopcheck liep tot het eind (status ✅)', /^✅/.test(el.koopRdwStatus.textContent), el.koopRdwStatus.textContent);
    toets('pl_kenteken is nog steeds dat van je eigen auto', opslag.pl_kenteken === 'EIGEN1', 'pl_kenteken = ' + opslag.pl_kenteken);
    toets('en er is niets onder pl_kenteken geschreven', s.geschreven.indexOf('pl_kenteken') < 0, 'geschreven: ' + s.geschreven.join(', '));
    const d = vm.runInContext('_koopRdwData', s);
    toets('het gecheckte kenteken staat waar het rapport het leest (_koopRdwData._kent)', d && d._kent === 'XX123Y', JSON.stringify(d && d._kent));
    const ev = s.events.find((e) => e.type === 'pl:kenteken-geladen');
    toets('de terugroepcheck krijgt het gecheckte kenteken via het event', ev && ev.detail && ev.detail.kenteken === 'XX123Y',
      JSON.stringify(ev && ev.detail));
  }

  console.log('\n2. Zonder eigen auto blijft pl_kenteken ook leeg');
  {
    const { s, opslag } = laad(null);
    await s.koopRdwLookup();
    toets('een koopcheck maakt de gecheckte auto niet tot jouw auto', !('pl_kenteken' in opslag), 'pl_kenteken = ' + opslag.pl_kenteken);
  }

  console.log('\n3. TEGENPROEF: de echte kentekenopzoek van je eigen auto zet hem wél');
  {
    const bt = fs.readFileSync('pidlane-bt.js', 'utf8');
    const i = bt.indexOf('async function rdwLookup(showOverview, opties){');
    const j = i < 0 ? -1 : bt.indexOf("localStorage.setItem('pl_kenteken',kent)", i);
    toets('rdwLookup() in pidlane-bt.js schrijft pl_kenteken (gelezen in de bron: die functie heeft een verbonden auto nodig)',
      i >= 0 && j > i && j - i < 6000, 'zonder dat is pl_kenteken van niemand, en dan zegt deze test niets');
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
