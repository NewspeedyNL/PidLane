// test-pompprijs.js — PLPompprijs: de standaardprijs uit de CBS-pompprijs (23-10-2026)
//
// Laadt de echte pidlane-pompprijs.js in een vm. De CBS-rijen zijn echt,
// opgehaald op 23-10-2026 uit 80416ned (de tabel liep toen tot 19-10-2026).
// Daarna twee rijen zoals ze mis kunnen gaan: een dag zonder LPG, en een
// komma op de verkeerde plek.
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
const ECHT = [
  { Perioden: '20261016', BenzineEuro95_1: 2.414, Diesel_2: 2.462, Lpg_3: 0.977 },
  { Perioden: '20261017', BenzineEuro95_1: 2.39, Diesel_2: 2.451, Lpg_3: 0.985 },
  { Perioden: '20261019', BenzineEuro95_1: 2.391, Diesel_2: 2.456, Lpg_3: 0.984 },
  { Perioden: '20261018', BenzineEuro95_1: 2.391, Diesel_2: 2.451, Lpg_3: 0.977 }];
const GAT = { Perioden: '20261020', BenzineEuro95_1: 2.38, Diesel_2: 2.44, Lpg_3: null };
const KOMMA = { Perioden: '20261021', BenzineEuro95_1: 23.8, Diesel_2: 2.44, Lpg_3: 0.98 };

const opslag = {}, gevraagd = [];
function sandbox(antwoord) {
  const s = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Object, Promise, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } },
    PLBerekend: { PRIJS_STANDAARD: { benzine: 2.64, diesel: 2.69, lpg: 1.29, hybride: 2.64, 'plug-in hybride': 2.64 } },
    PLWijzer: { _kern: { PRIJS: { benzine: 2.64, diesel: 2.69, lpg: 1.29, stroom: 0.35 } } },
    plFetch: async (url) => { gevraagd.push(decodeURIComponent(url.split('url=')[1])); return { ok: true, status: 200, json: async () => ({ value: antwoord }) }; } };
  s.window = s; vm.createContext(s); return s;
}
const BRON = fs.readFileSync(__dirname + '/pidlane-pompprijs.js', 'utf8');

(async () => {
  console.log('\n1. Echte CBS-rijen, bij het opstarten');
  const s = sandbox(ECHT.concat([GAT, KOMMA]));
  vm.runInContext(BRON, s, { filename: 'pidlane-pompprijs.js' });
  const P = s.PLPompprijs;
  await new Promise((r) => setTimeout(r, 20));
  toets('de laatste volledige dag: 19-10-2026', P.actueel && P.actueel.datum === '20261019', JSON.stringify(P.actueel));
  toets('een dag zonder LPG telt niet', P.verwerk([GAT]) === null);
  toets('een komma-fout (23,8) telt niet', P.verwerk([KOMMA]) === null);
  toets('PRIJS_STANDAARD: benzine 2,391, diesel 2,456, LPG 0,984', s.PLBerekend.PRIJS_STANDAARD.benzine === 2.391 && s.PLBerekend.PRIJS_STANDAARD.diesel === 2.456 && s.PLBerekend.PRIJS_STANDAARD.lpg === 0.984, JSON.stringify(s.PLBerekend.PRIJS_STANDAARD));
  toets('hybride en plug-in tanken benzine', s.PLBerekend.PRIJS_STANDAARD.hybride === 2.391 && s.PLBerekend.PRIJS_STANDAARD['plug-in hybride'] === 2.391);
  toets('de wijzer rekent met dezelfde prijs, stroom blijft staan', s.PLWijzer._kern.PRIJS.diesel === 2.456 && s.PLWijzer._kern.PRIJS.stroom === 0.35);
  toets('de bron staat erbij', P.bronTekst() === 'Pompprijs: CBS-gemiddelde van 19-10-2026', P.bronTekst());
  toets('de vraag gaat naar 80416ned met een datumfilter', /80416ned\/TypedDataSet\?\$filter=/.test(gevraagd[0]) && /Perioden ge '\d{8}'/.test(decodeURIComponent(gevraagd[0])), gevraagd[0]);

  console.log('\n2. Cache en falen');
  const s2 = sandbox([]); vm.runInContext(BRON, s2); await new Promise((r) => setTimeout(r, 20));
  toets('tweede start binnen 12 uur: uit de cache, geen nieuwe vraag', gevraagd.length === 1 && s2.PLPompprijs.actueel && s2.PLPompprijs.actueel.datum === '20261019');
  let melding = '';
  try { await s2.PLPompprijs.haal({ negeerCache: true }); } catch (e) { melding = e.message; }
  toets('geen bruikbare dag: een fout met reden', /geen volledige dag/.test(melding), melding);
  const s3 = sandbox([]); delete opslag.pl_pompprijs_cbs; vm.runInContext(BRON, s3); await new Promise((r) => setTimeout(r, 20));
  toets('…en dan blijft de standaardprijs uit de code staan', s3.PLBerekend.PRIJS_STANDAARD.benzine === 2.64 && !s3.PLPompprijs.actueel);

  console.log('\n3. Hetzelfde getal als in de code');
  const wz = fs.readFileSync(__dirname + '/pidlane-wijzer.js', 'utf8');
  const bk = fs.readFileSync(__dirname + '/pidlane-berekend.js', 'utf8');
  toets('pidlane-berekend.js heeft PRIJS_STANDAARD', /const PRIJS_STANDAARD = \{/.test(bk));
  toets('pidlane-wijzer.js geeft PRIJS door in _kern', /_kern: \{[^}]*PRIJS: PRIJS/.test(wz));
  const idx = fs.readFileSync(__dirname + '/index.html', 'utf8');
  toets('index.html laadt hem ná berekend en wijzer', idx.indexOf('pidlane-pompprijs.js') > idx.indexOf('pidlane-wijzer.js') && idx.indexOf('pidlane-pompprijs.js') > idx.indexOf('pidlane-berekend.js'));
  toets('worker.js laat opendata.cbs.nl door de proxy', /PROXY_ALLOWED_HOSTS = \[[^\]]*"opendata\.cbs\.nl"/.test(fs.readFileSync(__dirname + '/../worker.js', 'utf8')));

  console.log('\n4. TEGENPROEF — zonder de plausibiliteitsgrens');
  const s4 = sandbox([]); vm.runInContext(BRON.replace('v >= PLAUSIBEL[k][0] && v <= PLAUSIBEL[k][1]', 'true'), s4);
  toets('dan wordt 23,8 euro per liter de standaard', s4.PLPompprijs.verwerk([KOMMA]) && s4.PLPompprijs.verwerk([KOMMA]).benzine === 23.8);

  console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
  process.exit(fout ? 1 : 0);
})();
