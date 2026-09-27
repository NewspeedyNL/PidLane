// ══════════════════════════════════════════════════════════════════
// test-garage.js — toetst pidlane-garage.js (PLGarage, Mijn voertuigen)
// ──────────────────────────────────────────────────────────────────
// De module wordt geladen met vm; plFetch is een nep-server die onthoudt
// wat er binnenkwam. Alles daarboven is de echte code.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • een issue dat dichtgaat na een uitlezing die niet volledig was
//     ("niet gelezen" is geen "weg", #218);
//   • een meetgat dat als afgelegde weg telt;
//   • een dieselverbruik uit de luchtmassa (een diesel loopt arm);
//   • een verbruik over een stukje van de rit dat als ritverbruik geldt;
//   • een rapport van een niet-klant of zonder akkoord dat toch de server op gaat;
//   • advies zonder genoeg gegevens.
//
// Draaien vanuit public/:  node test-garage.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

function laad(opties) {
  const o = opties || {};
  const verzoeken = [];
  const opslag = {};
  const s = {
    console: { log() { }, warn() { }, error() { } },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: { getElementById: () => null, addEventListener() { }, createElement: () => ({ style: {} }), head: { appendChild() { } }, body: { appendChild() { } } },
    addEventListener() { },
    setInterval: () => 0, setTimeout: (f) => { f(); return 0; },
    Date, JSON, Math, Promise,
    currentUser: o.rol ? { user: 'anna@voorbeeld.nl', role: o.rol } : null,
    plFetch: async (pad, opt) => {
      const body = opt && opt.json;
      verzoeken.push(body);
      const antw = (o.server || {})[body.actie];
      const d = typeof antw === 'function' ? antw(body) : (antw || { ok: true });
      return { ok: d.ok !== false && !d._status, status: d._status || 200, json: async () => d };
    }
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-garage.js', 'utf8'), s, { filename: 'pidlane-garage.js' });
  return { G: s.PLGarage, K: s.PLGarage._kern, verzoeken, opslag, s };
}

(async function () {
  const { K } = laad();

  console.log('\n1. Status per voertuig');
  const nu = new Date('2026-09-27T12:00:00').getTime();
  let st = K.status({ apk_tot: '2026-09-20', laatst_gezien: '2026-09-26T10:00:00Z' }, nu);
  eis(st.kleur === 'rood' && /APK verlopen/.test(st.punten[0].tekst), 'APK verlopen → rood');
  st = K.status({ apk_tot: '2026-10-10', laatst_gezien: '2026-09-26T10:00:00Z' }, nu);
  eis(st.kleur === 'oranje' && /13 dagen/.test(st.punten[0].tekst), 'APK over 13 dagen → oranje', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 11.9 } }, nu);
  eis(st.kleur === 'oranje' && /Accu zwak/.test(st.punten[0].tekst), 'accu 11,9 V in rust → oranje');
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 14.2, maxKoelwater: 92 }, aantal: { openIssues: 0 } }, nu);
  eis(st.kleur === 'groen' && st.punten.length === 0, 'alles normaal → groen zonder punten', JSON.stringify(st));
  st = K.status({}, nu);
  eis(st.kleur === 'groen' && /Nog nooit uitgelezen/.test(st.punten[0].tekst), 'nooit uitgelezen: groen, maar dat staat erbij');
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', kmstand: 90500, onderhoud_km: 90000 }, nu);
  eis(st.kleur === 'oranje' && /500 km over/.test(st.punten[0].tekst), 'onderhoud 500 km over → oranje', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', aantal: { openIssues: 2 }, gezondheid: { hoogOpen: true } }, nu);
  eis(st.kleur === 'rood', 'een open punt met ernst hoog → rood');

  console.log('\n2. Issues uit een uitlezing');
  const info = (c) => ({ P0171: { desc: 'Mager B1', sev: 'med' }, P0300: { desc: 'Misfire', sev: 'high' } }[c] || {});
  let ops = K.issueOps(['dtc:P0420'], { bevestigd: ['P0171'], pending: ['P0300'], permanent: [], gelezen: { bevestigd: true, pending: true } }, info);
  eis(ops.filter((x) => x.actie === 'gezien').length === 2, 'twee codes → twee keer gezien');
  eis(ops.some((x) => x.sleutel === 'dtc:P0300' && x.ernst === 'hoog'), 'ernst uit dtcInfo: misfire is hoog');
  eis(ops.some((x) => x.sleutel === 'dtc:P0420' && x.actie === 'opgelost'), 'volledige uitlezing zonder P0420 → opgelost');
  ops = K.issueOps(['dtc:P0420'], { bevestigd: ['P0171'], gelezen: { bevestigd: true, pending: false } }, info);
  eis(!ops.some((x) => x.actie === 'opgelost'), 'pending niet gelezen → niets sluiten');
  ops = K.issueOps(['dtc:P0420'], { bevestigd: [], pending: [], gelezen: { bevestigd: false, pending: true } }, info);
  eis(!ops.some((x) => x.actie === 'opgelost'), '03 niet gelezen → niets sluiten');
  ops = K.issueOps(['dtc:P0420', 'onderhoud:olie'], { bevestigd: [], pending: [], gelezen: { bevestigd: true, pending: true } }, info);
  eis(ops.length === 1 && ops[0].sleutel === 'dtc:P0420', 'alleen dtc-issues sluiten vanzelf, andere niet');
  ops = K.issueOps([], { bevestigd: ['P0420'], permanent: ['P0420'], gelezen: { bevestigd: true, pending: true } }, info);
  eis(ops.length === 1, 'dezelfde code in twee buffers is één issue');

  console.log('\n3. De ritwaarnemer');
  const t0 = Date.UTC(2026, 8, 27, 8, 0, 0);
  let r = K.ritNieuw(t0);
  for (let i = 1; i <= 360; i++) K.ritTik(r, { kmh: 60, rpm: 2000, koelwater: 88 + (i === 200 ? 10 : 0), accu: 14.1, maf: 10 }, t0 + i * 2000, 'benzine');
  let sam = K.ritKlaar(r);
  eis(Math.abs(sam.km - 12) < 0.05, '12 minuten op 60 km/u = 12 km', String(sam.km));
  eis(sam.max_koelwater === 98 && sam.min_accu === 14.1, 'hoogste koelwater en laagste laadspanning');
  eis(sam.verbruik_l100 > 5 && sam.verbruik_l100 < 7, 'benzine uit de luchtmassa: ' + sam.verbruik_l100 + ' l/100', String(sam.verbruik_l100));
  r = K.ritNieuw(t0);
  K.ritTik(r, { kmh: 60 }, t0 + 2000, 'benzine');
  K.ritTik(r, { kmh: 60 }, t0 + 602000, 'benzine');     // tien minuten gat
  eis(r.km < 0.1, 'een meetgat van tien minuten telt niet als weg', String(r.km));
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 300; i++) K.ritTik(r, { kmh: 80, rpm: 1800, maf: 12 }, t0 + i * 2000, 'diesel');
  eis(K.ritKlaar(r).verbruik_l100 === null, 'diesel zonder 015E: geen verbruik uit de luchtmassa');
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 300; i++) K.ritTik(r, { kmh: 80, rpm: 1800, lph: i < 60 ? 6 : undefined }, t0 + i * 2000, 'diesel');
  eis(K.ritKlaar(r).verbruik_l100 === null, 'verbruik over een vijfde van de rit is geen ritverbruik');
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 300; i++) K.ritTik(r, { kmh: 80, rpm: 1800, lph: 6.4 }, t0 + i * 2000, 'diesel');
  eis(K.ritKlaar(r).verbruik_l100 === 8, 'diesel met 015E: 6,4 l/u op 80 km/u = 8 l/100', String(K.ritKlaar(r).verbruik_l100));
  r = K.ritNieuw(t0);
  K.ritTik(r, { kmh: 5 }, t0 + 2000);
  eis(K.ritKlaar(r) === null, 'een paar meter is geen rit');
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 100; i++) K.ritTik(r, { kmh: i <= 50 ? 0 : 30, rpm: 800 }, t0 + i * 2000);
  eis(K.ritKlaar(r).stationair_pct === 50, 'half stilstaan met draaiende motor = 50% stationair', String(K.ritKlaar(r).stationair_pct));

  console.log('\n4. Advies');
  const ritten = [1, 2, 3, 4, 5, 6].map((i) => ({ km: 10, verbruik_l100: 8.4, max_kmh: 80, max_koelwater: 92, min_accu: 14.0, stationair_pct: 10 }));
  let adv = K.advies({ verbruik_opgegeven: 7, brandstof: 'benzine' }, ritten, nu);
  eis(adv.some((a) => a.soort === 'verbruik' && /20% hoger/.test(a.titel)), '8,4 tegen 7 opgegeven → 20% hoger', JSON.stringify(adv.map((a) => a.titel)));
  adv = K.advies({ verbruik_opgegeven: 7 }, ritten.slice(0, 1), nu);
  eis(!adv.some((a) => a.soort === 'verbruik'), 'één rit van 10 km is te weinig voor een verbruiksoordeel');
  adv = K.advies({ brandstof: 'diesel' }, [1, 2, 3, 4, 5].map(() => ({ km: 4 })), nu);
  eis(adv.some((a) => a.soort === 'rijprofiel' && /roetfilter/.test(a.tekst)), 'diesel met korte ritten → roetfilteradvies');
  adv = K.advies({ brandstof: 'benzine' }, [1, 2, 3, 4, 5].map(() => ({ km: 4 })), nu);
  eis(adv.some((a) => a.soort === 'rijprofiel') && !adv.some((a) => /roetfilter/.test(a.tekst)), 'benzine met korte ritten: geen roetfilter');
  adv = K.advies({}, [{ km: 20, max_koelwater: 109 }], nu);
  eis(adv.some((a) => a.soort === 'koeling'), 'koelwater boven 105 → koeling nakijken');
  adv = K.advies({ apk_tot: '2026-11-01' }, [], nu);
  eis(adv.some((a) => a.soort === 'apk'), 'APK binnen 60 dagen → plannen');
  eis(K.advies({}, [], nu).length === 0, 'geen gegevens → geen advies');

  console.log('\n5. RDW en de verbonden auto');
  let p = K.rdwNaarProfiel({ merk: 'MAZDA', handelsbenaming: 'CX-5', datum_eerste_toelating: '20180315', vervaldatum_apk: '20270314', cilinderinhoud: '1998' },
    [{ brandstof_omschrijving: 'Benzine', nettomaximumvermogen: '121.00' }]);
  eis(p.merk === 'MAZDA' && p.model === 'CX-5' && p.bouwjaar === 2018 && p.apk_tot === '2027-03-14', 'merk, model, bouwjaar en APK', JSON.stringify(p));
  eis(p.brandstof === 'benzine' && p.vermogen_kw === 121 && /2,0 liter, 121 kW \(165 pk\)/.test(p.motor), 'brandstof en motoromschrijving', p.motor);
  p = K.rdwNaarProfiel({}, [{ brandstof_omschrijving: 'Benzine' }, { brandstof_omschrijving: 'Elektriciteit' }]);
  eis(p.brandstof === 'hybride', 'benzine + elektriciteit = hybride');
  p = K.profielUitVerbinding({ merk: 'Mazda', model: 'CX-5', year: '2018', brandstof: 'Benzine' }, false);
  eis(p.bouwjaar === 2018 && p.brandstof === 'benzine' && !('turbo' in p), 'uit de verbinding; geen turbo zonder bewijs');

  console.log('\n6. Rapporten gaan alleen de server op als het mag');
  const rec = { type: 'ai', title: 'AI-monteur', text: 'Mager mengsel.' };
  // Elk geval heeft een actief voertuig: anders zegt "niets verstuurd" alleen
  // dat er geen voertuig was, en niet dat de poort iets deed.
  let L = laad({ rol: 'user' });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  L.G.rapport(rec);
  await new Promise((r2) => setImmediate(r2));
  eis(L.verzoeken.length === 0, 'geen klant → niets verstuurd');
  L = laad({ rol: 'klant' });
  L.G.staat().stand = { akkoord: false, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  L.G.rapport(rec);
  await new Promise((r2) => setImmediate(r2));
  eis(L.verzoeken.length === 0, 'klant zonder akkoord → niets verstuurd');
  L = laad({ rol: 'klant' });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  L.G.rapport({ type: 'pdf', title: 'x', text: 'y' });
  eis(L.verzoeken.length === 0, 'een pdf-kopie gaat niet nog eens mee');
  L.G.rapport(rec);
  await new Promise((r2) => setImmediate(r2));
  eis(L.verzoeken.length === 1 && L.verzoeken[0].actie === 'rapport_opslaan' && L.verzoeken[0].voertuig_id === 'v1', 'klant met akkoord en actief voertuig → bewaard bij dat voertuig');

  L = laad({ rol: 'klant', server: { rapport_opslaan: { ok: false, _status: 503, error: 'weg' } } });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  L.G.rapport(rec);
  await new Promise((r2) => setImmediate(r2));
  const q = JSON.parse(L.opslag.pl_garage_wachtrij || '[]');
  eis(q.length === 1 && q[0].actie === 'rapport_opslaan', 'server onbereikbaar → in de wachtrij op de telefoon');

  console.log('\n7. Een foutcode-uitlezing wordt issues en status');
  L = laad({ rol: 'klant', server: { issues: { ok: true, issues: [{ sleutel: 'dtc:P0420', status: 'open' }] }, stand: { ok: true, akkoord: true, voertuigen: [] } } });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief', gezondheid: { accuRust: 12.5 } }] };
  L.G.staat().actiefId = 'v1';
  await L.G.foutcodes({ bevestigd: ['P0171'], pending: [], permanent: [], gelezen: { bevestigd: true, pending: true }, readiness: { mil: true, nietKlaar: ['Katalysator'] } });
  const bij = L.verzoeken.find((x) => x.actie === 'issues_bijwerken');
  eis(bij && bij.ops.some((o) => o.sleutel === 'dtc:P0171' && o.actie === 'gezien') && bij.ops.some((o) => o.sleutel === 'dtc:P0420' && o.actie === 'opgelost'),
    'P0171 gezien, P0420 opgelost', JSON.stringify(bij));
  const sto = L.verzoeken.find((x) => x.actie === 'status_opslaan');
  eis(sto && sto.gezondheid.milAan === true && sto.gezondheid.readinessNietKlaar[0] === 'Katalysator' && sto.gezondheid.accuRust === 12.5,
    'status: motorlampje en keuringsstatus erbij, accu blijft staan', JSON.stringify(sto));

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
