// ════════════════════════════════════════════════════════════════
// test-kosten.js — toetst PLKosten (pidlane-kosten.js), de koppeling met
// DTC_PLAN (pidlane-data.js), de OBDex-koppeling (pidlane-kostencodes.js,
// plkostencodes.js) en de kostentabellen in PLRapport en PLAankoop.
// ────────────────────────────────────────────────────────────────
// WAT HIER TE BEWIJZEN VALT
//   1. elk onderdeel dat PLOnderdeel kan aanwijzen heeft een prijsregel, en
//      elke regel is heel: bandbreedtes oplopend, rijadvies, plek, uitleg, bron;
//   2. het prijspeil is niet ouder dan zes maanden — dit is een poort, zoals
//      test-changelogsnede.js: wie hem rood ziet, zoekt de prijzen opnieuw op;
//   3. het rekenwerk: onderdeel + uren × tarief × 1,21, afgerond op € 5, en
//      een eigen tarief buiten 30–250 valt terug op universeel;
//   4. één bron per code: het familie-onderdeel wint van OBDex, OBDex van het
//      familiebedrag, en dtcPlan().kost is exact PLKosten.kostCode();
//   5. merkcodes en hybride krijgen nooit een bedrag;
//   6. de kaart escapet, de deeltekst draagt geen VIN of kenteken;
//   7. de rapporten: dubbelen samen, tabel in §7 van PLRapport en §3 van
//      PLAankoop, en zonder kosten géén tabel;
//   8. de generator koppelt verwarmingscodes aan de verwarming en schrijft
//      alleen P0/P2 met bestaande onderdelen.
// Draaien vanuit public/:  node test-kosten.js     (exit 0 = goed)
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = __dirname;

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

function sandbox(opslag) {
  const mem = opslag || {};
  const s = { console: { log() { }, warn() { }, error() { } } };
  s.window = s; s.globalThis = s;
  s.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { } };
  s.navigator = {};
  vm.createContext(s);
  ['pidlane-data.js', 'pidlane-kostencodes.js', 'pidlane-kosten.js', 'pidlane-rapport.js', 'pidlane-aankooprapport.js']
    .forEach(f => vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), s, { filename: f }));
  return { s, mem };
}
const { s, mem } = sandbox();
const K = s.PLKosten;
eis(K && typeof K.schat === 'function', 'PLKosten geladen');
if (!K) process.exit(1);
const UNI = { soort: 'universeel' };

console.log('\n1. Elk aanwijsbaar onderdeel heeft een hele prijsregel');
{
  // De id's van PLOnderdeel uit de bron: die module laden vraagt de hele
  // live-laag (pidVals, PLSched, PLWatch). Het anker is de vorm van REGELS;
  // verdwijnt die, dan stopt de test in plaats van niets te vinden.
  const od = fs.readFileSync(dir + '/pidlane-onderdeel.js', 'utf8');
  const ids = [...od.matchAll(/^\s+id:'([a-z_]+)', naam:/gm)].map(m => m[1]);
  eis(ids.length >= 25, 'REGELS van PLOnderdeel gevonden (' + ids.length + ')');
  const mist = ids.filter(id => !K.KOSTEN[id]);
  eis(!mist.length, 'elk onderdeel van PLOnderdeel staat in KOSTEN', mist.join(', '));
  const PLEK = /fill="#38bdf8" fill-opacity=".25"/;
  Object.keys(K.KOSTEN).forEach(id => {
    const k = K.KOSTEN[id];
    const paar = (a, max) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite) && a[0] >= 0 && a[0] <= a[1] && a[1] <= max;
    const fout = [];
    if (!paar(k.onderdeel, 5000)) fout.push('onderdeel');
    if (!paar(k.uren, 20)) fout.push('uren');
    if (k.alt && !(paar(k.alt.onderdeel, 5000) && paar(k.alt.uren, 20) && k.alt.tekst)) fout.push('alt');
    if (!K.RIJDEN[k.rijden]) fout.push('rijden');
    if (!PLEK.test(K.schemaSvg(id))) fout.push('plek licht niet op');
    if (!(k.wat && k.wat.length > 20 && k.gevolg && k.gevolg.length > 20)) fout.push('uitleg');
    if (!(Array.isArray(k.bron) && k.bron.length)) fout.push('bron');
    if (fout.length) eis(false, 'regel ' + id, fout.join(', '));
  });
  eis(true, Object.keys(K.KOSTEN).length + ' regels nagelopen');
  eis(!PLEK.test(K.schemaSvg('bestaatniet')), 'onbekend onderdeel: schema zonder oplichtend element');
}

console.log('\n2. Prijspeil');
{
  const peil = new Date(K.PEIL + 'T12:00:00Z').getTime();
  const dagen = (Date.now() - peil) / 864e5;
  eis(isFinite(peil) && dagen > -1, 'PEIL is een datum en ligt niet in de toekomst (' + K.PEIL + ')');
  eis(dagen <= 183, 'PEIL is hoogstens zes maanden oud', 'zoek de prijzen opnieuw op en zet PEIL op vandaag (' + Math.round(dagen) + ' dagen)');
}

console.log('\n3. Rekenen');
{
  // thermostaat: onderdeel 25–180, 1–3 uur à 85 × 1,21 = 102,85
  const t = K.schat('thermostaat', UNI);
  eis(t.totaal[0] === 130 && t.totaal[1] === 490, 'thermostaat universeel = € 130–490', JSON.stringify(t.totaal));
  eis(t.uurInclBtw === 103, 'uurtarief incl. btw = 103');
  const d = K.schat('thermostaat', { soort: 'dealer' });
  eis(d.totaal[0] > t.totaal[0] && d.totaal[1] > t.totaal[1], 'dealer is duurder dan universeel');
  const e = K.schat('thermostaat', { soort: 'eigen', exBtw: 50 });
  eis(e.totaal[0] === 85 && e.totaal[1] === 360, 'eigen tarief 50 = € 85–360', JSON.stringify(e.totaal));
  eis(K.schat('thermostaat', { soort: 'eigen', exBtw: 5000 }).tarief.soort === 'universeel', 'eigen tarief 5000 (tikfout) → universeel');
  eis(K.schat('thermostaat', { soort: 'eigen', exBtw: 'x' }).tarief.soort === 'universeel', 'eigen tarief geen getal → universeel');
  eis(K.schat('bestaatniet') === null, 'onbekend onderdeel → null');
  eis(Object.keys(K.KOSTEN).every(id => { const x = K.schat(id, UNI); return x.totaal[0] % 5 === 0 && x.totaal[1] % 5 === 0 && x.totaal[0] <= x.totaal[1]; }),
    'elk totaal afgerond op € 5 en oplopend');
  // het gekozen tarief wordt onthouden, en een rommelige opslag valt terug
  K.zetTarief('eigen', 70);
  eis(K.tarief().soort === 'eigen' && K.tarief().exBtw === 70, 'zetTarief(eigen, 70) blijft staan');
  mem.pl_kosten_tarief = '{kapot';
  eis(K.tarief().soort === 'universeel', 'onleesbare opslag → universeel');
  delete mem.pl_kosten_tarief;
}

console.log('\n4. Eén bron per code');
{
  const P = s.DTC_PLAN;
  eis(Object.keys(P).every(k => !(P[k].onderdeel && P[k].kost !== undefined)), 'geen familie heeft zowel een onderdeel als een eigen bedrag');
  eis(Object.keys(P).every(k => !P[k].onderdeel || K.KOSTEN[P[k].onderdeel]), 'elk familie-onderdeel staat in KOSTEN');
  // P0171: OBDex zegt lambdasonde, de familie zegt vacuümlek — de familie wint.
  eis(s.PL_KOSTEN_CODES.lambdavoor.split(' ').includes('P0171'), 'OBDex koppelt P0171 aan de lambdasonde (voorwaarde voor de volgende toets)');
  const a = K.voorCode('P0171');
  eis(a && a.onderdeel === 'vacuumlek' && a.via === 'familie', 'P0171 → vacuümlek via de familie, niet de lambdasonde van OBDex', JSON.stringify(a));
  const b = K.voorCode('P0137');
  eis(b && b.onderdeel === 'lambdaachter' && b.via === 'obdex', 'P0137 (familie zonder onderdeel) → achterste sonde via OBDex', JSON.stringify(b));
  const c = K.voorCode('P0217');
  eis(c && c.onderdeel === null && c.via === 'familie' && c.kost[0] === 50, 'P0217 (geen onderdeel, niet in OBDex) → familiebedrag', JSON.stringify(c));
  // dtcPlan geeft exact het bedrag van PLKosten, voor élke code in DTCDB
  const codes = Object.keys(s.DTCDB || {}).filter(x => /^[PBCU][0-9A-F]{4}$/.test(x));
  const anders = codes.filter(x => { const p = s.dtcPlan(x); return p && JSON.stringify(p.kost) !== JSON.stringify(K.kostCode(x)); });
  eis(codes.length > 20 && !anders.length, 'dtcPlan().kost = PLKosten.kostCode() voor ' + codes.length + ' codes', anders.join(', '));
  // en dat bedrag volgt het tarief
  K.zetTarief('dealer');
  const dl = s.dtcPlan('P0128').kost;
  K.zetTarief('universeel');
  eis(dl[1] > s.dtcPlan('P0128').kost[1], 'dtcPlan volgt het gekozen uurtarief');
}

console.log('\n5. Merkcodes en hybride: geen bedrag');
{
  eis(K.voorCode('P1234') === null && K.kostCode('P3000') === null, 'P1/P3 → geen bedrag');
  eis(K.kostCode('P0A80') === null && s.dtcPlan('P0A80').kost === null, 'P0A80 (hybride) → geen bedrag, ook niet via dtcPlan');
  eis(K.voorCode('onzin') === null && K.voorCode('') === null, 'onzin → null');
  // De wachter zelf: ook als een nieuwe OBDex-generatie toch een merk- of
  // hybridecode koppelt, krijgt die geen bedrag.
  const echt = s.PL_KOSTEN_CODES;
  s.PL_KOSTEN_CODES = Object.assign({}, echt, { egr: echt.egr + ' P1400 P3401', sensor: echt.sensor + ' P0A80' });
  K._reset();
  eis(K.voorCode('P1400') === null && K.voorCode('P3401') === null && K.kostCode('P0A80') === null, 'een gekoppelde merk- of hybridecode krijgt toch geen bedrag');
  s.PL_KOSTEN_CODES = echt; K._reset();
  const gen = Object.keys(s.PL_KOSTEN_CODES).every(id => s.PL_KOSTEN_CODES[id].split(' ').every(c => /^P[02][0-9A-F]{3}$/.test(c)));
  eis(gen, 'het gegenereerde bestand bevat alleen P0- en P2-codes');
  eis(Object.keys(s.PL_KOSTEN_CODES).every(id => K.KOSTEN[id]), 'elk onderdeel in het gegenereerde bestand staat in KOSTEN');
}

console.log('\n6. De kaart en de deeltekst');
{
  const h = K.kaartHtml('kat', { code: '<b>P0420</b>', bewijs: ['<img src=x>'], t: UNI });
  eis(h.indexOf('<b>P0420') < 0 && h.indexOf('<img') < 0 && h.indexOf('&lt;img') >= 0, 'code en bewijs worden geëscaped');
  eis(h.indexOf('€ 305 – 1.155') >= 0, 'het bedrag staat op de kaart', h.match(/pk-bedrag">[^<]*/));
  eis(h.indexOf(K.RIJDEN.plannen.tekst) >= 0 && h.indexOf('Vaak volstaat') >= 0, 'rijadvies en goedkopere route staan erop');
  eis(K.kaartHtml('bestaatniet') === '', 'onbekend onderdeel → lege kaart');
  s.vehicleInfo = { vin: 'WVWZZZ1JZXW000001', merk: 'VW' };
  const t = K.kaartTekst('kat', { code: 'P0420', auto: 'VW Golf', t: UNI });
  eis(t.indexOf('WVWZZZ') < 0 && !/kenteken/i.test(t), 'de deeltekst draagt geen VIN of kenteken');
  eis(/EUR 305 – 1\.155/.test(t) && /Indicatie, geen offerte/.test(t), 'de deeltekst noemt bedrag en dat het geen offerte is');
}

console.log('\n7. Rapporten');
{
  const r = K.rapportRijen([{ code: 'P0420' }, { code: 'P0430' }, { id: 'kat' }, { code: 'P0217' }, { code: 'P1234' }], UNI);
  const kat = r.find(x => x.id === 'kat');
  eis(r.length === 2 && kat && kat.codes.join() === 'P0420,P0430', 'P0420, P0430 en de aanwijzer vallen samen tot één katalysatorrij; P1234 valt weg', JSON.stringify(r.map(x => [x.id, x.codes])));
  eis(r.some(x => x.id === null && x.codes[0] === 'P0217' && x.totaal[0] === 50), 'een familiebedrag krijgt zijn eigen rij');

  const R = s.PLRapport;
  const kosten = { rijen: r, tarief: 'universele garage (EUR 85 excl. btw per uur)', peil: 'november 2026' };
  const s7 = m => m.secties.find(x => x.titel === 'Conclusie en aanbevelingen');
  const tab = m => s7(m).blokken.find(b => b.soort === 'tabel' && /kosten/.test(b.titel || ''));
  const met = R.model({ kosten });
  eis(!!tab(met) && tab(met).rijen.length === 2, 'PLRapport §7 heeft de kostentabel met twee rijen');
  eis(tab(met) && /EUR 305–1\.155/.test(tab(met).rijen[0].cellen[1]) && tab(met).rijen[0].kleur === 'groen', 'bedrag in EUR (jsPDF kent € niet) en de kleur van het rijadvies', JSON.stringify(tab(met) && tab(met).rijen[0]));
  eis(!tab(R.model({})), 'zonder kosten geen tabel');

  const A = s.PLAankoop;
  const inv = { kenteken: 'XX-11-YY', ts: Date.UTC(2026, 10, 25), obd: { verbonden: true, dtc: { actief: ['P0420'], pending: [], permanent: [] } }, kosten };
  const s3 = A.model(inv).secties.find(x => x.nr === 3);
  const at = s3.blokken.find(b => b.soort === 'tabel');
  eis(!!at && at.rijen.length === 2, 'PLAankoop §3 heeft de kostentabel');
  const som = s3.blokken.find(b => b.soort === 'tekst' && /Samen/.test(b.tekst));
  eis(som && /Samen EUR 355–1\.955/.test(som.tekst), 'en de som van onder- en bovenkant', som && som.tekst);
  eis(!A.model(Object.assign({}, inv, { kosten: null })).secties.find(x => x.nr === 3).blokken.some(b => b.soort === 'tabel'), 'zonder kosten geen tabel in het aankooprapport');
}

console.log('\n8. De generator');
{
  const G = require(path.join(dir, '..', 'plkostencodes.js'));
  eis(G.onderdeelVan(['oxygen_sensor_upstream', 'oxygen_sensor_heater']) === 'lambdaverwarming', 'sonde vooraan, verwarming op twee → verwarming');
  eis(G.onderdeelVan(['oxygen_sensor_bank1_sensor2', 'catalytic_converter']) === 'lambdaachter', 'sensor 2 → achterste sonde');
  eis(G.onderdeelVan(['catalytic_converter', 'downstream_oxygen_sensor']) === 'kat', 'de eerste component beslist');
  eis(G.onderdeelVan(['hv_battery']) === null && G.onderdeelVan([]) === null, 'hoogspanningsaccu en leeg → niets');
  const b = G.bouw([{ code: 'P1234', affected_components: ['egr_valve'] }, { code: 'P0401', affected_components: ['egr_valve'] }, { code: 'P0A80', affected_components: ['hv_battery'] }]);
  eis(b.n === 1 && b.per.egr.join() === 'P0401', 'bouw() neemt alleen P0/P2 mee', JSON.stringify(b));
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'Alles goed') + ' — ' + aantal + ' toetsen');
process.exit(fouten ? 1 : 0);
