// ══════════════════════════════════════════════════════════════════
// test-opstart.js — instappen, starten, de rest gaat vanzelf (27-10-2026)
// ──────────────────────────────────────────────────────────────────
// De echte pidlane-opstart.js in een zandbak. Toetst wanneer een
// automatische verbinding een nieuwe start is (en dus een check krijgt),
// de dagcheck per auto, het kenteken uit het profiel, de minuut opnieuw
// zoeken, en wat het wekkerblad zegt.
//
// Draaien vanuit public/:  node test-opstart.js   (exit 0 = goed)
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

function zandbak(extra) {
  const opslag = {};
  const ctx = Object.assign({
    console: { log() {}, warn() {} },
    localStorage: {
      getItem: (k) => (k in opslag ? opslag[k] : null),
      setItem: (k, v) => { opslag[k] = String(v); },
      removeItem: (k) => { delete opslag[k]; }
    },
    setInterval() { return 1; }, setTimeout() { return 1; },
    document: { getElementById: () => null, createElement: () => ({}), body: { appendChild() {} } },
    Promise, Date, JSON
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-opstart.js', 'utf8'), ctx, { filename: 'pidlane-opstart.js' });
  return { ctx, opslag, O: ctx.PLOpstart, K: ctx.PLOpstart._kern };
}

const { K } = zandbak();
const MIN = 60 * 1000, nu = Date.parse('2026-10-27T07:30:00');

console.log('1. Opstart of herlaad');
toets('nooit eerder gereden → opstart', K.soort(nu, null) === 'opstart' && K.soort(nu, 'rommel') === 'opstart');
toets('motor liep 5 min geleden → herlaad', K.soort(nu, nu - 5 * MIN) === 'herlaad');
toets('motor liep 16 min geleden → opstart (de ritgrens is 15 min)', K.soort(nu, nu - 16 * MIN) === 'opstart');
toets('de grens is dezelfde 15 minuten als de ritgrens', K.OPSTART_MS === 15 * MIN);
toets('herlaad na een nacht wordt een opstart', K.reden('herlaad', nu, nu - 9 * 60 * MIN) === 'opstart');
toets('terugkeer naar de app na een nacht ook', K.reden('terugkeer naar de app', nu, nu - 9 * 60 * MIN) === 'opstart');
toets('herlaad midden in een rit blijft herlaad', K.reden('herlaad', nu, nu - MIN) === 'herlaad');
toets('een dode socket is altijd een hervatting, ook na lang', K.reden('dode socket', nu, null) === 'dode socket');

console.log('\n2. De check één keer per auto per dag');
const A = 'JMZKF6W1A00123456', B = 'WVWZZZ1KZ6W000001';
toets('dag() is de lokale datum', K.dag(nu) === '2026-10-27', K.dag(nu));
toets('autoSleutel: een geldige VIN, anders "onbekend"', K.autoSleutel(A.toLowerCase()) === A && K.autoSleutel('kort') === 'onbekend' && K.autoSleutel(null) === 'onbekend');
let kaart = {};
toets('nog niet gedaan → nodig', K.checkNodig(kaart, A, '2026-10-27'));
kaart = K.markeer(kaart, A, '2026-10-27');
toets('gedaan → vandaag niet meer', !K.checkNodig(kaart, A, '2026-10-27'));
toets('morgen weer', K.checkNodig(kaart, A, '2026-10-28'));
toets('een andere auto dezelfde dag wel', K.checkNodig(kaart, B, '2026-10-27'));
let groot = {};
for (let i = 0; i < 30; i++) groot = K.markeer(groot, 'AUTO' + i, '2026-10-' + String(i % 28 + 1).padStart(2, '0'));
toets('de kaart groeit niet onbeperkt (hoogstens 20 auto\'s)', Object.keys(groot).length === 20, Object.keys(groot).length);
toets('en de laatst gemarkeerde blijft erin', groot.AUTO29 !== undefined);

console.log('\n3. Echte opslag: checkGedaan, checkVandaag, checkVergeten');
{
  const z = zandbak({ vehicleInfo: { vin: A } });
  toets('vers toestel: nog niet gedaan', !z.O.checkVandaag());
  z.O.checkGedaan();
  toets('na checkGedaan: vandaag gedaan', z.O.checkVandaag());
  z.ctx.vehicleInfo.vin = B;
  toets('andere auto: niet gedaan', !z.O.checkVandaag());
  z.ctx.vehicleInfo.vin = A;
  z.O.checkVergeten();
  toets('checkVergeten (schakelaar opnieuw aan): vandaag opnieuw', !z.O.checkVandaag());
  z.opslag.pl_check_dag = '{kapot';
  toets('een kapotte kaart is "niet gedaan", geen crash', !z.O.checkVandaag());
}

console.log('\n4. De motor houdt bij wanneer hij liep');
{
  const t = Date.now();
  const z = zandbak({ connected: true, demoMode: false, pidVals: { '010C': 820 }, _pidLastUpd: { '010C': t } });
  z.O.tik();
  toets('verbonden en motor aan: pl_laatst_actief wordt gezet', Math.abs(Number(z.opslag.pl_laatst_actief) - t) < 5000, z.opslag.pl_laatst_actief);
  toets('en dan is een herlaad meteen erna géén opstart', z.O.reden('herlaad') === 'herlaad');
  const z2 = zandbak({ connected: true, demoMode: false, pidVals: { '010C': 0 }, _pidLastUpd: { '010C': t } });
  z2.O.tik();
  toets('motor uit (contact aan): niets gezet', !('pl_laatst_actief' in z2.opslag));
  const z3 = zandbak({ connected: true, demoMode: false, pidVals: { '010C': 820 }, _pidLastUpd: { '010C': t - 60000 } });
  z3.O.tik();
  toets('een toerental van een minuut oud telt niet', !('pl_laatst_actief' in z3.opslag));
  const z4 = zandbak({ connected: true, demoMode: true, pidVals: { '010C': 820 }, _pidLastUpd: { '010C': t } });
  z4.O.tik();
  toets('de demo telt niet', !('pl_laatst_actief' in z4.opslag));
}

console.log('\n5. Opnieuw zoeken als de app er eerder is dan de motor');
toets('binnen een minuut: nog eens', K.herhaalMag(nu - 30000, nu));
toets('na een minuut: dan pas vragen', !K.herhaalMag(nu - 61000, nu));
toets('de grens is 60 s', K.HERHAAL_MS === 60000);
toets('zonder starttijd: niet', !K.herhaalMag(undefined, nu));

console.log('\n6. Het kenteken uit het profiel van deze VIN');
toets('kenteken uit het profiel, genormaliseerd', K.kentekenUitProfiel({ kenteken: 'r-054-xd' }) === 'R054XD');
toets('geen of te kort kenteken: leeg', K.kentekenUitProfiel({}) === '' && K.kentekenUitProfiel(null) === '' && K.kentekenUitProfiel({ kenteken: 'AB' }) === '');
(async function () {
  {
    const rdw = [];
    const z = zandbak({ btDiag() {}, rdwLookup: (x, o) => { rdw.push(o.kenteken); return Promise.resolve({ ok: true }); } });
    z.opslag['pl_vinprof_' + A] = JSON.stringify({ vin: A, kenteken: 'R054XD' });
    const ok = await z.O.naVin(A);
    toets('bekende VIN: het kenteken uit zijn profiel wordt opgezocht', ok === true && rdw[0] === 'R054XD', JSON.stringify(rdw));
    toets('en er wordt na de check niets gevraagd', !z.ctx._plKentNaCheck);
  }
  {
    const rdw = [];
    const z = zandbak({ btDiag() {}, rdwLookup: (x, o) => { rdw.push(o.kenteken); return Promise.resolve({ ok: true }); } });
    z.opslag.pl_kenteken = 'OUD123';
    const ok = await z.O.naVin(B);
    toets('onbekende VIN: geen opzoeking, ook niet het vorige kenteken', ok === false && rdw.length === 0, JSON.stringify(rdw));
    toets('maar wel de vraag na de check', z.ctx._plKentNaCheck === true);
  }

  console.log('\n7. Wat het wekkerblad zegt');
  toets('oude app zonder plugin: bijwerken', /Werk de app bij/.test(K.wekkerTekst({ beschikbaar: false }).regel) && !K.wekkerTekst(null).kan);
  toets('Android 11: kan niet, met de reden', !K.wekkerTekst({ beschikbaar: true, ondersteund: false }).kan && /Android 12/.test(K.wekkerTekst({ beschikbaar: true, ondersteund: false }).regel));
  toets('kan, niets gekoppeld', K.wekkerTekst({ beschikbaar: true, ondersteund: true, gekoppeld: [] }).kan && /Nog niets/.test(K.wekkerTekst({ beschikbaar: true, ondersteund: true, gekoppeld: [] }).regel));
  const aan = K.wekkerTekst({ beschikbaar: true, ondersteund: true, gekoppeld: ['AA:BB'], aan: true });
  toets('gekoppeld en aan', aan.aan === true && /opent als je auto start/.test(aan.regel));
  toets('gekoppeld maar uit', /uitgezet/.test(K.wekkerTekst({ beschikbaar: true, ondersteund: true, gekoppeld: ['AA:BB'], aan: false }).regel));

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
