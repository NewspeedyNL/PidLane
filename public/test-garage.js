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
  // De conditiescore (#475) hangt in de app vóór de garage; alleen als de toets erom vraagt.
  if (o.conditie) vm.runInContext(fs.readFileSync(__dirname + '/pidlane-conditie.js', 'utf8'), s, { filename: 'pidlane-conditie.js' });
  // De derde poort (#532) hoort bij de echte app; zonder hem rekent de garage met de oude grenzen.
  if (o.kenmerk !== false) vm.runInContext(fs.readFileSync(__dirname + '/pidlane-kenmerk.js', 'utf8'), s, { filename: 'pidlane-kenmerk.js' });
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
  // Onderhoud bijhouden aan of uit (31-10-2026): leeg = aan, uit = geen onderhoudspunt.
  const ond = { laatst_gezien: '2026-09-26T10:00:00Z', kmstand: 151000, onderhoud_km: 150000, onderhoud_datum: '2026-09-01' };
  eis(K.status(ond, nu).punten.filter((p) => /Onderhoud/.test(p.tekst)).length === 2, 'onderhoud niet ingesteld = aan: km en datum over tijd geven een punt', JSON.stringify(K.status(ond, nu)));
  eis(K.status(Object.assign({ onderhoud: 'uit' }, ond), nu).punten.every((p) => !/Onderhoud/.test(p.tekst)), 'onderhoud bijhouden uit: geen onderhoudspunt');
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 11.9 } }, nu);
  eis(st.kleur === 'oranje' && /Accu zwak/.test(st.punten[0].tekst), 'accu 11,9 V in rust → oranje');
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 14.2, maxKoelwater: 92 }, aantal: { openIssues: 0 } }, nu);
  eis(st.kleur === 'groen' && st.punten.length === 0, 'alles normaal → groen zonder punten', JSON.stringify(st));
  // 16-10-2026: weet de auto wat hij vroeg, dan beslist dat (PLEigen.laadOordeel).
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 12.7, laadStaat: 'bewust_laag' } }, nu);
  eis(st.kleur === 'groen', 'laadspanning 12,7 V die de auto zelf vroeg → groen', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', merk: 'Opel', bouwjaar: 2001, gezondheid: { accuRust: 12.6, accuLopend: 12.7 } }, nu);
  eis(st.kleur === 'oranje' && /12,7 V \(niet zeker voor deze auto\)/.test(st.punten[0].tekst), 'tegenproef: Opel uit 2001 (waarschijnlijk gewone dynamo), 12,7 V → oranje, met "niet zeker"', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 12.7 } }, nu);
  eis(st.kleur === 'groen', 'van de auto niets bekend, 12,7 V: niet te beoordelen, dus geen oranje (#532)', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 11.9 } }, nu);
  eis(st.kleur === 'oranje', 'tegenproef: 11,9 V bij draaiende motor is op elke auto oranje (harde grens)', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuRust: 12.6, accuLopend: 13.6, laadStaat: 'laadt_niet' } }, nu);
  eis(st.kleur === 'oranje' && /haalt niet wat/.test(st.punten[0].tekst), '13,6 V terwijl er meer gevraagd wordt → oranje', JSON.stringify(st));
  st = K.status({ laatst_gezien: '2026-09-26T10:00:00Z', gezondheid: { accuLopend: 15.3, laadStaat: 'laadt' } }, nu);
  eis(st.kleur === 'oranje', 'te hoog (15,3 V) blijft oranje, ook als de auto het vroeg', JSON.stringify(st));
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

  console.log('\n3a. De conditiekenmerken gaan met de rit mee (#475)');
  {
    const L = laad({ conditie: true });
    const K2 = L.K;
    let rc = K2.ritNieuw(t0);
    for (let i = 1; i <= 200; i++) K2.ritTik(rc, { kmh: i <= 30 ? 0 : 60, rpm: i <= 30 ? 800 + (i % 2 ? 15 : -15) : 2200, koelwater: 90, accu: 14.1, trim: 3, ltft: 3, stft: 1.5 }, t0 + i * 2000, 'benzine');
    const sc = K2.ritKlaar(rc);
    eis(sc && sc.extra && sc.extra.cd && sc.extra.cd.tw === 4.5, 'trim warm (lang 3 + kort 1,5) in rit.extra.cd', JSON.stringify(sc && sc.extra));
    eis(sc && sc.extra.cd.sr >= 14 && sc.extra.cd.sr <= 17, 'onrust stationair in rit.extra.cd', JSON.stringify(sc && sc.extra));
    eis(sc && sc.extra.cd.lv === 14.1, 'laadspanning in rit.extra.cd', JSON.stringify(sc && sc.extra));
    eis(JSON.stringify(sc.extra).length < 3800, 'past in de ruimte voor extra', String(JSON.stringify(sc.extra).length));
    L.G.staat().rit = rc;
    const mf = L.G.mode06({ tests: [{ mid: 0xA2, tid: 0x0B, ruw: { waarde: 4 } }, { mid: 0xA3, tid: 0x0B, ruw: { waarde: 1 } }] });
    eis(mf === 5 && K2.ritKlaar(rc).extra.cd.mf === 5, 'een mode 06-scan tijdens de rit geeft de misfires mee', JSON.stringify(K2.ritKlaar(rc).extra));
    L.G.staat().rit = null;
    eis(L.G.mode06({ tests: [{ mid: 0xA2, tid: 0x0B, ruw: { waarde: 4 } }] }) === null, 'zonder rit gaat er niets mee');
    rc = K.ritNieuw(t0);
    for (let i = 1; i <= 200; i++) K.ritTik(rc, { kmh: 60, rpm: 2200, koelwater: 90, trim: 3 }, t0 + i * 2000, 'benzine');
    eis(!(K.ritKlaar(rc).extra && K.ritKlaar(rc).extra.cd), 'zonder pidlane-conditie.js: de rit gewoon, zonder kenmerken');
  }

  console.log('\n3b. Pauze of einde (29-09-2026)');
  // Motor uit, drie minuten later weer rijden: dat is één rit, geen twee.
  const P = K.cfg.ritPauzeMs, M = K.cfg.pauzeMinMs;
  eis(P === 15 * 60 * 1000, 'de pauzegrens is vijftien minuten', String(P));
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 150; i++) K.ritTik(r, { kmh: 50, rpm: 1800 }, t0 + i * 2000);   // 5 min rijden
  const stop = r.tBeweeg;
  eis(K.ritStand(r, stop + 2000, true) === 'rijdt', 'net gestopt, verbonden: rijdt nog');
  eis(K.ritStand(r, stop + 3 * 60000, true) === 'pauze', 'drie minuten stil: pauze, geen einde');
  eis(K.ritStand(r, stop + 3 * 60000, false) === 'pauze', 'drie minuten zonder verbinding: ook pauze');
  eis(K.ritStand(r, stop + 10000, false) === 'pauze', 'verbinding weg is meteen pauze, nooit meteen einde');
  eis(K.ritStand(r, stop + P - 1000, false) === 'pauze', 'net onder de grens: nog pauze');
  eis(K.ritStand(r, stop + P + 1000, true) === 'af', 'na vijftien minuten stil: af');
  eis(K.ritStand(null, stop, true) === null, 'geen rit: geen stand');
  // Weer rijden na drie minuten: de pauze telt, de weg niet.
  const kmVoor = r.km;
  for (let i = 1; i <= 150; i++) K.ritTik(r, { kmh: 50, rpm: 1800 }, stop + 3 * 60000 + i * 2000);
  sam = K.ritKlaar(r);
  eis(sam.extra && sam.extra.pauzes === 1 && Math.abs(sam.extra.pauze_s - 180) <= 2, 'één pauze van drie minuten in de samenvatting', JSON.stringify(sam.extra));
  eis(Math.abs(sam.km - 2 * kmVoor) < 0.1, 'de pauze is geen afgelegde weg', sam.km + ' km, vóór de pauze ' + kmVoor);
  // Een stoplicht (korter dan pauzeMinMs) is geen pauze.
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 100; i++) K.ritTik(r, { kmh: (i > 40 && i <= 60) ? 0 : 40, rpm: 800 }, t0 + i * 2000);   // 40 s stil
  eis(!(K.ritKlaar(r).extra && K.ritKlaar(r).extra.pauzes), 'veertig seconden voor een stoplicht is geen pauze', JSON.stringify(K.ritKlaar(r).extra));
  // Het einde ligt bij de laatste beweging, niet een kwartier later.
  r = K.ritNieuw(t0);
  for (let i = 1; i <= 150; i++) K.ritTik(r, { kmh: 50, rpm: 1800, maf: 8 }, t0 + i * 2000);
  const eindEcht = r.tBeweeg, duurEcht = K.ritKlaar(r).duur_s, litersEcht = K.ritKlaar(r).liters;
  for (let i = 1; i <= 400; i++) K.ritTik(r, { kmh: 0, rpm: 800, maf: 3 }, eindEcht + i * 2000);   // 13 min stationair na aankomst
  sam = K.ritKlaar(r);
  eis(sam.eind === new Date(eindEcht).toISOString(), 'de eindtijd is de laatste beweging', sam.eind);
  eis(sam.duur_s === duurEcht && sam.liters === litersEcht, 'de staart na aankomst telt niet mee in duur en liters', sam.duur_s + ' s, ' + sam.liters + ' l');

  console.log('\n3c. Rit beëindigen met een naam');
  {
    const L = laad({ rol: 'klant' });
    L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief', naam: 'Blauwe Mazda' }] };
    L.G.staat().actiefId = 'v1';
    eis(L.G.ritNu() === null, 'zonder lopende rit: niets te beëindigen');
    const nu0 = Date.now() - 10 * 60000;
    const rr = L.K.ritNieuw(nu0); rr.vid = 'v1';
    for (let i = 1; i <= 150; i++) L.K.ritTik(rr, { kmh: 60, rpm: 2000 }, nu0 + i * 2000);
    L.G.staat().rit = rr;
    const nu = L.G.ritNu();
    eis(nu && nu.sam && nu.sam.km === 5 && nu.voertuig === 'Blauwe Mazda' && nu.pauzeMin === 15, 'ritNu() toont de rit zoals hij bewaard zou worden', JSON.stringify(nu && { km: nu.sam && nu.sam.km, v: nu.voertuig, p: nu.pauzeMin }));
    eis(nu.stand === 'pauze' && nu.stilMin === 5, 'vijf minuten stil en niet verbonden: pauze sinds 5 min', nu.stand + ' / ' + nu.stilMin);
    eis(Array.isArray(nu.labels) && nu.labels.indexOf('Woon-werk') >= 0, 'met de vaste labels om uit te kiezen');
    eis(L.G.staat().rit === rr, 'ritNu() sluit de rit niet af');
    const uit = await L.G.ritBeeindig('Naar de bakker');
    const opgeslagen = L.verzoeken.filter((b) => b.actie === 'rit_opslaan')[0];
    eis(uit && opgeslagen && opgeslagen.rit.label === 'Naar de bakker' && opgeslagen.rit.extra.einde === 'handmatig', 'de rit gaat met naam en reden de server op', JSON.stringify(opgeslagen && opgeslagen.rit.extra));
    eis(L.G.staat().rit === null && L.G.ritNu() === null, 'en is daarna weg');
  }

  console.log('\n3d. Verbinding weg, app dicht: de rit wacht');
  {
    const L = laad({ rol: 'klant' });
    L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
    L.G.staat().actiefId = 'v1';
    L.s.pidVals = { '010D': 50, '010C': 1800 };
    L.s.connected = true; L.s.demoMode = false;
    L.G._ritTikNu();
    const rr = L.G.staat().rit;
    eis(!!rr, 'rijden met verbinding start een rit');
    rr.km = 4; rr.tBeweeg = Date.now() - 3 * 60000;          // vier km gereden, drie minuten geleden gestopt
    L.s.connected = false;
    L.G._ritTikNu();
    eis(L.G.staat().rit === rr && !L.verzoeken.some((b) => b.actie === 'rit_opslaan'), 'verbinding weg na drie minuten stil: de rit loopt nog, er is niets opgeslagen');
    eis(JSON.parse(L.opslag.pl_garage_rit || 'null') !== null, 'en hij staat veilig op het toestel');
    L.s.connected = true;
    L.G._ritTikNu();
    eis(L.G.staat().rit === rr, 'weer verbonden en rijden: dezelfde rit loopt door');
    rr.tBeweeg = Date.now() - 16 * 60000;
    L.s.pidVals = { '010D': 0, '010C': 0 };
    L.G._ritTikNu();
    eis(L.G.staat().rit === null && L.verzoeken.some((b) => b.actie === 'rit_opslaan' && b.rit.extra.einde === 'stil'), 'na zestien minuten stil: af, met reden "stil"');
  }
  {
    // App dicht bij de pomp, drie minuten later weer open.
    const L = laad({ rol: 'klant' });
    L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
    const oud = L.K.ritNieuw(Date.now() - 20 * 60000); oud.vid = 'v1'; oud.km = 12; oud.tBeweeg = oud.tLaatst = Date.now() - 3 * 60000;
    L.opslag.pl_garage_rit = JSON.stringify(oud);
    L.G._ritHerstel();
    eis(L.G.staat().rit && L.G.staat().rit.km === 12 && !L.verzoeken.some((b) => b.actie === 'rit_opslaan'), 'app drie minuten dicht: bij de start loopt de rit door');
  }
  {
    const L = laad({ rol: 'klant' });
    L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
    const oud = L.K.ritNieuw(Date.now() - 60 * 60000); oud.vid = 'v1'; oud.km = 12; oud.tBeweeg = oud.tLaatst = Date.now() - 40 * 60000;
    L.opslag.pl_garage_rit = JSON.stringify(oud);
    L.G._ritHerstel();
    await new Promise((r) => setImmediate(r));
    eis(L.G.staat().rit === null && L.verzoeken.some((b) => b.actie === 'rit_opslaan' && b.rit.extra.einde === 'app gesloten tijdens de rit'), 'app veertig minuten dicht: bij de start afgerond');
  }
  {
    // Een ander voertuig actief: de geparkeerde rit van het vorige is voorbij.
    const L = laad({ rol: 'klant' });
    L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }, { id: 'v2', status: 'actief' }] };
    L.G.staat().actiefId = 'v2';
    const oud = L.K.ritNieuw(Date.now() - 20 * 60000); oud.vid = 'v1'; oud.km = 8; oud.tBeweeg = oud.tLaatst = Date.now() - 2 * 60000;
    L.G.staat().rit = oud;
    L.s.connected = true; L.s.demoMode = false; L.s.pidVals = {};
    L.G._ritTikNu();
    await new Promise((r) => setImmediate(r));
    eis(L.verzoeken.some((b) => b.actie === 'rit_opslaan' && b.voertuig_id === 'v1' && b.rit.extra.einde === 'ander voertuig'), 'een ander voertuig actief: de rit van het vorige wordt afgerond');
  }

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
  adv = K.advies({ merk: 'Mazda' }, [{ km: 20, max_koelwater: 109 }], nu);
  eis(adv.some((a) => a.soort === 'koeling'), 'koelwater 109 °C op een Mazda (vaste thermostaat waarschijnlijk) → koeling nakijken');
  adv = K.advies({ merk: 'Volkswagen' }, [{ km: 20, max_koelwater: 109 }], nu);
  eis(!adv.some((a) => a.soort === 'koeling'), '109 °C op een Volkswagen (kenveldthermostaat waarschijnlijk): niet te beoordelen, geen advies (#532)');
  adv = K.advies({ merk: 'Volkswagen' }, [{ km: 20, max_koelwater: 115 }], nu);
  eis(adv.some((a) => a.soort === 'koeling'), 'tegenproef: 115 °C is op elke motor te heet, ook op een Volkswagen');
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

  console.log('\n8. De waakronde bij het voertuig');
  const hist = [
    { pid: '0105', n: 12, ok: 10, let: 2, stil: 0, waarde: 121, reden: 'boven verwacht bereik', min: 88, max: 121 },
    { pid: '0133', n: 5, ok: 0, let: 0, stil: 5 },
    { pid: '0142', n: 8, ok: 8, let: 0, stil: 0, waarde: 14.1, min: 13.9, max: 14.3 },
    { pid: '0146', n: 0, ok: 0, let: 0, stil: 0 }
  ];
  const nm = (p2) => ({ naam: { '0105': 'Koelwater', '0133': 'Luchtdruk', '0142': 'Accu' }[p2] || p2, eenheid: { '0105': '°C', '0142': 'V' }[p2] || '' });
  const wt = K.waakTekst(hist, nm, Date.UTC(2026, 8, 27));
  eis(/3 sensoren buiten je selectie/.test(wt), 'een sensor zonder metingen telt niet mee', wt.split('\n')[2]);
  eis(/BEVINDINGEN \(1\)[\s\S]*Koelwater: boven verwacht bereik — 2 van 12 metingen, laatst 121 °C/.test(wt), 'bevinding met reden, aantal en waarde');
  eis(/ZONDER ANTWOORD \(1\) ===\n Luchtdruk/.test(wt), 'stil apart');
  eis(/NORMAAL ===\n Accu: 14,1 V/.test(wt), 'normaal met komma');
  eis(K.waakTekst([{ pid: 'x', n: 0 }], nm) === null, 'niets gemeten → geen rapport');

  L = laad({ rol: 'klant' });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  L.G.waakBevinding('0105', 'Koelwater: boven verwacht bereik (121 °C)');
  L.G.waakBevinding('0105', 'nog eens');
  await new Promise((r2) => setImmediate(r2));
  const wb = L.verzoeken.filter((x) => x.actie === 'issues_bijwerken');
  eis(wb.length === 1 && wb[0].ops[0].sleutel === 'waak:0105' && wb[0].ops[0].soort === 'bevinding', 'een waakbevinding wordt één open punt, één keer per sessie', JSON.stringify(wb));
  L.G.waakKlaar(hist, nm);
  await new Promise((r2) => setImmediate(r2));
  const wr = L.verzoeken.find((x) => x.actie === 'rapport_opslaan');
  eis(wr && wr.soort === 'waak' && wr.titel === 'Waakronde — 1 bevinding' && /Koelwater/.test(wr.tekst), 'de waakronde stopt → rapport bij het voertuig', JSON.stringify(wr && wr.titel));
  L = laad({ rol: 'klant' });
  L.G.staat().stand = { akkoord: true, voertuigen: [] };
  L.G.waakBevinding('0105', 'x'); L.G.waakKlaar(hist, nm);
  await new Promise((r2) => setImmediate(r2));
  eis(L.verzoeken.length === 0, 'zonder actief voertuig gaat er niets de server op');

  console.log('\n9. Het Voertuigoverzicht leest en schrijft Mijn voertuigen');
  L = laad({ rol: 'klant', server: { voertuig_opslaan: (b2) => ({ ok: true, voertuig: b2.voertuig }), stand: { ok: true, akkoord: true, voertuigen: [] } } });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief', naam: 'Blauwe Mazda', kmstand: 84210, onderhoud_laatst: '03-2026', distributie: 'ketting', notities: 'nieuwe accu', merk: 'Mazda', bouwjaar: 2018 }] };
  L.G.staat().actiefId = 'v1';
  const dd = L.G.dossier();
  eis(dd && dd.km === '84210' && dd.beurt === '03-2026' && dd.distributie === 'ketting' && dd.bijz === 'nieuwe accu' && dd.year === '2018', 'dossier uit het actieve voertuig', JSON.stringify(dd));
  await L.G.dossierBewaar({ km: '142.500', beurt: '09-2026', distributie: '', bijz: 'x', merk: 'Mazda', model: 'CX-5', year: '2018', brandstof: 'Benzine' });
  const vo = L.verzoeken.find((x) => x.actie === 'voertuig_opslaan');
  eis(vo && vo.voertuig.id === 'v1' && vo.voertuig.kmstand === 142500 && vo.voertuig.brandstof === 'benzine' && vo.voertuig.distributie === null && vo.voertuig.bouwjaar === 2018,
    '"142.500" → 142500, "Benzine" → benzine, leeg → wissen', JSON.stringify(vo && vo.voertuig));
  L = laad({ rol: 'klant' });
  L.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief' }] };
  L.G.staat().actiefId = 'v1';
  await L.G.dossierBewaar({ brandstof: 'benzine / diesel', year: 'onbekend' });
  const vo2 = L.verzoeken.find((x) => x.actie === 'voertuig_opslaan');
  eis(vo2 && !('brandstof' in vo2.voertuig) && !('bouwjaar' in vo2.voertuig), 'onzin in brandstof of bouwjaar wordt niet meegestuurd');
  L = laad({ rol: 'user' });
  eis(L.G.dossier() === null, 'geen klant → geen koppeling, het overzicht werkt zoals voorheen');

  // Een demo is een verzonnen auto, en de klant heeft intussen een echt
  // voertuig actief staan. Elk geval draait twee keer met exact dezelfde
  // opzet: eerst in demo (niets naar de server), dan zonder (wél). Zonder die
  // tweede helft zegt "niets verstuurd" alleen dat de opzet niets deed.
  console.log('\n9b. Een demo schrijft niets bij het echte voertuig (28-09-2026)');
  {
    const klaar = () => new Promise((r2) => setImmediate(r2));
    const opzet = () => {
      const X = laad({ rol: 'klant', server: { issues: { ok: true, issues: [] }, stand: { ok: true, akkoord: true, voertuigen: [] }, voertuig_opslaan: (b2) => ({ ok: true, voertuig: b2.voertuig }) } });
      X.G.staat().stand = { akkoord: true, voertuigen: [{ id: 'v1', status: 'actief', naam: 'Echte auto', kmstand: 84210 }] };
      X.G.staat().actiefId = 'v1';
      return X;
    };
    const gevallen = [
      ['een AI-rapport', (X) => { X.G.rapport({ type: 'ai', title: 'AI-monteur', text: 'Mager mengsel.' }); }],
      ['een foutcode-uitlezing', (X) => X.G.foutcodes({ bevestigd: ['P0171'], pending: [], permanent: [], gelezen: { bevestigd: true, pending: true } })],
      ['een waakbevinding', (X) => { X.G.waakBevinding('0105', 'Koelwater te warm'); }],
      ['een waakrapport', (X) => { X.G.waakKlaar(hist, nm); }],
      ['het voertuigdossier bewaren', (X) => X.G.dossierBewaar({ km: '1000', merk: 'Mazda', model: 'CX-5', year: '2018', brandstof: 'benzine' })]
    ];
    for (const [wat, doe] of gevallen) {
      const D = opzet(); D.s.demoMode = true;
      await doe(D); await klaar();
      const E = opzet(); E.s.demoMode = false;
      await doe(E); await klaar();
      const schrijft = (x) => x.actie !== 'issues' && x.actie !== 'rapporten' && x.actie !== 'rapport' && x.actie !== 'stand';
      eis(D.verzoeken.filter(schrijft).length === 0 && E.verzoeken.filter(schrijft).length > 0,
        wat + ': in demo niets naar de server, zonder demo wel',
        'demo: ' + JSON.stringify(D.verzoeken.map((x) => x.actie)) + ' · echt: ' + JSON.stringify(E.verzoeken.map((x) => x.actie)));
    }
    const D = opzet(); D.s.demoMode = true;
    eis(D.G.dossier() === null, 'in demo geeft het voertuigoverzicht het dossier van de echte auto niet');
  }

  console.log('\n10. Een bewaard waakrapport wordt weer een overzicht (27-09-2026)');
  {
    const K = laad({ rol: 'klant' }).G._kern;
    const hist2 = [
      { pid: '0105', n: 12, ok: 9, let: 3, stil: 0, waarde: 112.4, min: 88, max: 112.4, reden: 'boven het bereik' },
      { pid: '0142', n: 8, ok: 8, let: 0, stil: 0, waarde: 14.1, min: 13.9, max: 14.3 },
      { pid: '015C', n: 4, ok: 0, let: 0, stil: 4 }
    ];
    const nm2 = (p) => ({ '0105': { naam: 'Koelwater', eenheid: '°C' }, '0142': { naam: 'Accuspanning', eenheid: 'V' }, '015C': { naam: 'Motorolie', eenheid: '°C' } }[p]);
    const w = K.waakDelen(K.waakTekst(hist2, nm2, Date.UTC(2026, 8, 27)));
    eis(w && w.bevindingen.length === 1 && w.bevindingen[0].naam === 'Koelwater' && w.bevindingen[0].let === 3 && w.bevindingen[0].n === 12 && w.bevindingen[0].eenheid === '°C',
      'de bevinding komt terug met naam, telling en eenheid', JSON.stringify(w && w.bevindingen));
    eis(w && w.normaal.length === 1 && w.normaal[0].naam === 'Accuspanning' && w.normaal[0].n === 8 && w.normaal[0].min === '13,9',
      'de normale sensor komt terug met bereik', JSON.stringify(w && w.normaal));
    eis(w && w.stil.length === 1 && w.stil[0] === 'Motorolie', 'zonder antwoord komt terug', JSON.stringify(w && w.stil));
    eis(w && w.overig.length === 0, 'geen regel blijft onherkend over — anders past de lezer niet meer bij de schrijver', JSON.stringify(w && w.overig));
    eis(K.waakDelen('PidLane — Rapport\nwat anders') === null, 'een ander rapport is geen waakrapport');
    const w2 = K.waakDelen('PidLane — Waakronde\n=== NORMAAL ===\n een regel die anders is');
    eis(w2 && w2.overig.length === 1, 'een onbekende regel gaat niet verloren maar komt onder overig');

    console.log('\n11. Ritlabels');
    const som = K.labelSom([{ label: 'Woon-werk', km: 20.5 }, { label: 'Caravan', km: 310 }, { label: 'Woon-werk', km: 19.5 }, { km: 3 }]);
    eis(som.length === 2 && som[0].label === 'Caravan' && som[1].ritten === 2 && som[1].km === 40, 'per label opgeteld, grootste eerst, zonder label telt niet mee', JSON.stringify(som));

    console.log('\n12. Verbruik en kosten per label, voorstel, export, vergelijken');
    const rs = [
      { id: 'a', start: '2026-09-21T07:40:00', km: 21, liters: 1.26, verbruik_l100: 6, label: 'Woon-werk' },
      { id: 'b', start: '2026-09-22T07:55:00', km: 20, liters: 1.2, verbruik_l100: 6, label: 'Woon-werk' },
      { id: 'c', start: '2026-09-20T10:00:00', km: 310, liters: 31, verbruik_l100: 10, label: 'Caravan' },
      { id: 'd', start: '2026-09-23T08:10:00', km: 20.5 },
      { id: 'e', start: '2026-09-27T08:05:00', km: 20 }                  // zaterdag
    ];
    const s2 = K.labelSom(rs, 2);
    const ww = s2.find((x) => x.label === 'Woon-werk'), cv = s2.find((x) => x.label === 'Caravan');
    eis(ww.verbruik === 6 && ww.kosten === 4.92 && cv.verbruik === 10 && cv.kosten === 62, 'verbruik (gewogen) en kosten per label', JSON.stringify(s2));
    eis(K.labelSom([{ label: 'Kort', km: 5, liters: 1, verbruik_l100: 20 }], 2)[0].verbruik === null, 'onder 20 km geen verbruiksoordeel per label');
    eis(K.labelSuggestie(rs[3], rs) === 'Woon-werk', 'dinsdag 08:10, 20,5 km: voorstel Woon-werk (twee gelijkende ritten)');
    eis(K.labelSuggestie(rs[4], rs) === null, 'zaterdag op hetzelfde tijdstip: geen voorstel (andere soort dag)');
    eis(K.labelSuggestie({ id: 'x', start: '2026-09-24T07:50:00', km: 80 }, rs) === null, 'zelfde tijd maar 80 km: geen voorstel');
    eis(K.labelSuggestie({ id: 'x', start: '2026-09-24T07:50:00', km: 20 }, rs.slice(0, 1)) === null, 'één gelijkende rit is geen patroon');
    const ex = K.ritExport(rs, 'Woon-werk', 2);
    const r = ex.csv.split('\n');
    eis(r.length === 3 && /^datum;vertrek;km/.test(r[0]) && /;21,0;/.test(r[1]) && /;2,52;Woon-werk$/.test(r[1]), 'CSV: puntkomma, komma als decimaal, kosten per rit', ex.csv);
    eis(/Totaal: 2 ritten, 41,0 km/.test(ex.tekst) && /€ 4,92/.test(ex.tekst), 'de tekst (voor de PDF) telt op', ex.tekst);
    eis(K.ritExport(rs, null, null).n === 5 && !/€/.test(K.ritExport(rs, null, null).tekst), 'zonder label alle ritten; zonder prijs geen bedragen');
    eis(!/;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;/.test(K.ritExport([{ start: '2026-09-21T07:40:00', km: 1, label: 'a;b' }], null, 1).csv.split('\n')[1]), 'een puntkomma in een label breekt de CSV niet');
    const w1 = K.waakDelen(K.waakTekst(hist2, nm2));
    const hist3 = hist2.map((h) => h.pid === '0105' ? Object.assign({}, h, { let: 0, ok: 12, waarde: 91 }) : h);
    const w2b = K.waakDelen(K.waakTekst(hist3, nm2));
    const vg = K.waakVergelijk(w1, w2b);
    eis(vg[0].naam === 'Koelwater' && vg[0].veranderd && vg[0].a.staat === 'let' && vg[0].b.staat === 'ok', 'vergelijken: wat veranderde staat bovenaan (koelwater: bevinding → normaal)', JSON.stringify(vg[0]));
    eis(vg.filter((x) => !x.veranderd).length === 2, 'wat gelijk bleef staat eronder');

  }

  console.log('\nBlok 5: staan de vaste sensoren aan na het verbinden? (28-09-2026)');
  {
    const O = laad().G.selectieOordeel;
    const v = { naam: 'CX-5', pid_selectie: ['222A05', '221310', 'CA01', '229999'] };
    eis(O(null, [], []).staat === 'LET OP', 'geen gekoppeld voertuig: LET OP');
    eis(O({ naam: 'x', pid_selectie: [] }, [], []).staat === 'LET OP', 'niets vastgelegd: LET OP');
    const ok = O(v, ['010C', '222A05', '221310', 'CA01'], ['010C', '222A05', '221310', 'CA01']);
    eis(ok.staat === 'ok' && /3 van de 4/.test(ok.detail), 'drie die kunnen, drie aan: ok (een onbekende code telt niet mee)', ok.detail);
    const fout = O(v, ['010C'], ['010C', '222A05', '221310', 'CA01']);
    eis(fout.staat === 'FOUT' && /222A05, 221310, CA01/.test(fout.detail), 'de bug van 28-09 (alleen de standaardset): FOUT met de namen', fout.detail);
    // 09-10-2026: 221E1C (ATF) opgeruimd omdat de auto niet antwoordde. Dat
    // is de poort die zijn werk doet, geen selectie die kwijt is.
    const weg = O(v, ['010C', '222A05', 'CA01'], ['010C', '222A05', '221310', 'CA01'], ['221310']);
    eis(weg.staat === 'LET OP' && /opgeruimd\): 221310/.test(weg.detail), 'een opgeruimde vaste sensor: LET OP, geen FOUT', weg.detail);
    const beide = O(v, ['010C', 'CA01'], ['010C', '222A05', '221310', 'CA01'], ['221310']);
    eis(beide.staat === 'FOUT' && /niet aan: 222A05$/.test(beide.detail), 'wat niet opgeruimd is en toch uit staat blijft FOUT', beide.detail);
  }

  console.log('\n#476. Voertuig toevoegen kent het kenteken van de verbinding al');
  {
    const V = laad({ rol: 'klant' }).G._kern.voorinvulNieuw;
    eis(V(null, 'r-054-xd', []).kenteken === 'R054XD', 'het kenteken uit de verbindingsstap staat al ingevuld');
    eis(V(null, 'R054XD', [{ kenteken: 'R-054-XD' }]).kenteken === undefined, 'een kenteken dat al bij een voertuig staat niet nog eens');
    eis(V(null, '', []).kenteken === undefined && V(null, 'AB', []).kenteken === undefined, 'leeg of te kort: niets');
    const vb = V({ pseudo: 'ps1', profiel: { merk: 'Mazda' } }, 'R054XD', []);
    eis(vb.vin_pseudo === 'ps1' && vb.merk === 'Mazda' && vb.kenteken === 'R054XD', 'vanaf de verbonden auto: VIN-pseudoniem, profiel én kenteken', JSON.stringify(vb));
    eis(V(null, 'R054XD', []).vin_pseudo === undefined, 'zonder verbonden auto geen VIN-koppeling');
  }

  console.log('\nToestemming meteen na inloggen, niet pas bij Mijn voertuigen');
  {
    const A = laad({ rol: 'klant' }).G._kern.akkoordVragen;
    const st = { akkoord: false, akkoordVersie: 3 };
    eis(A(st, false, null, 'anna') === true, 'nog geen akkoord na inloggen: meteen vragen');
    eis(A({ akkoord: true, akkoordVersie: 3 }, false, null, 'anna') === false, 'al akkoord: niet vragen');
    eis(A(null, false, null, 'anna') === false, 'stand niet opgehaald (offline): niet vragen');
    eis(A(st, true, null, 'anna') === false, 'demo: niet vragen');
    eis(A(st, false, 'anna|3', 'anna') === false, '"Nu niet" voor deze tekst: niet opnieuw');
    eis(A({ akkoord: false, akkoordVersie: 4 }, false, 'anna|3', 'anna') === true, 'nieuwe tekstversie: opnieuw vragen');
    eis(A(st, false, 'bert|3', 'anna') === true, '"Nu niet" van een ander account telt niet');
  }
  {
    // De koppeling in lus(): na inloggen zonder akkoord gaat het venster open.
    const { G, s } = laad({ rol: 'klant', server: { stand: { ok: true, akkoord: false, akkoordVersie: 3, voertuigen: [] } } });
    let geopend = 0; const echt = s.document.getElementById;
    s.document.getElementById = (id) => (id === 'plGarOv' ? { style: { set display(v) { if (v === 'flex') geopend++; } } } : echt(id));
    await G._lus();
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    eis(geopend === 1, 'lus() opent de toestemming na het inloggen', 'geopend: ' + geopend);
  }

  console.log('\nSensoren: de bibliotheek toont niet nog eens wat al bij de eigen sensoren staat');
  {
    const B = laad({ rol: 'klant' }).G._kern.bibSplits;
    const lijst = [{ id: 'a', code: '220202', werkt: 0, werkt_niet: 2 }, { id: 'b', code: '221E1C', werkt: 3 }, { id: 'c', code: '220404', werkt: 5, werkt_niet: 1 }, { id: 'd', code: '220505' }];
    const d = B(lijst, [{ code: '221E1C' }]);
    eis(!d.nieuw.some((b) => b.code === '221E1C') && d.al['221E1C'] && d.al['221E1C'].id === 'b', 'een toegevoegde code staat bij de eigen sensoren, niet in de bibliotheek', JSON.stringify(d));
    eis(d.nieuw.map((b) => b.id).join('') === 'cda', 'de rest: wat het vaakst werkt bovenaan, wat niet werkt onderaan', d.nieuw.map((b) => b.id).join(''));
    eis(B(null, null).nieuw.length === 0, 'zonder bibliotheek (nog laden) geen fout');
  }

  console.log('\nAdvies: lage laadspanning in ritten, tenzij de auto het zelf zo regelt (16-10-2026)');
  {
    const ritten = [{ min_accu: 12.6 }, { min_accu: 12.8 }, { min_accu: 12.7 }];
    const zonder = K.advies({ bouwjaar: 2001, gezondheid: {} }, ritten, Date.now()).some((a) => a.soort === 'laden');
    const met = K.advies({ gezondheid: { laadStaat: 'bewust_laag' } }, ritten, Date.now()).some((a) => a.soort === 'laden');
    const kapot = K.advies({ gezondheid: { laadStaat: 'laadt_niet' } }, ritten, Date.now()).some((a) => a.soort === 'laden');
    eis(zonder && !met && kapot, 'laadadvies: zonder oordeel wel, bij bewust laag niet, bij laadt-niet wel', [zonder, met, kapot].join());
  }

  console.log('\nSensoren: indeling in dubbel, analyse en weergave (16-10-2026, CX-5-lijst)');
  {
    const K2 = laad({ rol: 'klant' }).G._kern;
    const heeft = (p) => ['0104', '0107', '010B', '012E', '0115', '0142', '014C'].indexOf(p) >= 0;
    const soort = (code, naam, eenheid) => K2.sensSoort({ code, naam, eenheid }, heeft);
    let s = soort('22F404', 'Engine load', '%');
    eis(s.groep === 'dubbel' && s.tweeling === '0104', '22F404 is de spiegel van 0104 → dubbel', JSON.stringify(s));
    s = soort('22F470', 'Turbodruk (boost)', 'bar');
    eis(s.groep === 'weergave' && s.tweeling === '0170', '22F470: tweeling 0170, maar de auto geeft die niet → niet dubbel', JSON.stringify(s));
    eis(soort('221166', 'Evaporative purge', '%').groep === 'dubbel', 'evap purge naast 012E → dubbel');
    eis(soort('22402A', '12V battery voltage', 'V').groep === 'dubbel', '12V-accuspanning naast 0142 → dubbel');
    s = soort('22057D', 'Ambient temperature, alternate', '°C');
    eis(s.groep === 'weergave' && s.tweeling === '0146', 'buitentemperatuur zonder 0146 bij de auto → weergave, niet dubbel', JSON.stringify(s));
    eis(K2.sensSoort({ code: '22057D', naam: 'Ambient temperature, alternate' }, (p) => p === '0146').groep === 'dubbel', '… en mét 0146 wél dubbel');
    eis(soort('220301', 'MAP voltage', 'V').groep === 'analyse', 'sensorspanning → analyse');
    eis(soort('2203BA', 'Ambient air temperature sensor voltage', 'V').groep === 'analyse', 'spanning van de buitentempsensor is geen buitentemperatuur → analyse');
    eis(soort('220304', 'Commanded generator voltage', 'V').groep === 'analyse', 'gevraagde laadspanning: regelsignaal → analyse');
    eis(soort('22402B', 'Vehicle battery current', 'A').groep === 'weergave', 'accustroom → weergave');
    eis(soort('222B06', 'Front right wheel speed', 'km/h').groep === 'analyse', 'wielsnelheid → analyse');
    eis(soort('22DD01', 'Totale afstand', 'km').groep === 'analyse', 'teller → analyse');
    const g = K2.sensGroepen([
      { id: 'a', code: '224029', naam: '12V battery temperature', eenheid: '°C', werkt: 9 },
      { id: 'b', code: '221310', naam: 'Motorolietemperatuur', eenheid: '°C', werkt: 2 },
      { id: 'c', code: '22402B', naam: 'Vehicle battery current', eenheid: 'A', mijn: 'werkt' },
      { id: 'd', code: '220519', naam: 'Distance since oil changed', eenheid: 'km', mijn: 'werkt_niet' },
      { id: 'e', code: '22F477', naam: 'Ladeluchttemperatuur', eenheid: '°C', werkt_niet: 2 },
      { id: 'f', code: '22F407', naam: 'Fuel trim, long term', eenheid: '%' }
    ], heeft, true);
    eis(g.weergave.map((r) => r.b.id).join('') === 'cba', 'weergave op waarde: accustroom, olie, accutemp', g.weergave.map((r) => r.b.id).join(''));
    eis(g.weigert.map((r) => r.b.id).sort().join('') === 'de', 'eigen weigering of alleen "niet bij anderen" → werkt niet', g.weigert.map((r) => r.b.id).join(''));
    eis(g.dubbel.length === 1 && g.dubbel[0].b.id === 'f' && g.analyse.length === 0, 'fuel trim long → dubbel');
    eis(K2.sensGroepen([{ code: '220519', naam: 'Distance since oil changed', mijn: 'werkt_niet' }], heeft, false).analyse.length === 1, 'eigen sensoren: geen "werkt niet"-groep');
  }

  console.log('\nSensoren: de banden in één groep, op plek (23-10-2026)');
  {
    // De echte bandRol uit pidlane-uitgebreid.js, niet een kopie.
    const bron = fs.readFileSync(__dirname + '/pidlane-uitgebreid.js', 'utf8');
    const m = /\n  function bandRol\(naam\) \{[\s\S]*?\n  \}\n/.exec(bron);
    if (!m) throw new Error('anker "function bandRol(naam)" niet gevonden in pidlane-uitgebreid.js');
    const L = laad({ rol: 'klant' });
    L.s.PLEigen = { bandRol: new Function(m[0] + '\nreturn bandRol;')() };
    const lijst = [
      { code: '222A07', naam: 'Bandenspanning achter-links', eenheid: 'psi', werkt: 2 },
      { code: '221E1C', naam: 'Temperatuur automaatbak (ATF)', eenheid: '°C', werkt: 9 },
      { code: '222A0B', naam: 'Bandtemperatuur voor-links', eenheid: '°C' },
      { code: '222A05', naam: 'Bandenspanning voor-links', eenheid: 'psi', werkt: 2 },
      { code: '222A06', naam: 'Bandenspanning voor-rechts', eenheid: 'psi', werkt: 2 },
      { code: '222A0E', naam: 'Tire temperature RL', eenheid: '°C', werkt_niet: 3 }
    ];
    const g = L.K.sensGroepen(lijst, () => false, false);
    eis(g.banden.map((r) => r.b.code).join() === '222A05,222A0B,222A06,222A07,222A0E',
      'alle banden in één groep, op plek: VL spanning, VL temp, VR, AL spanning, AL temp', g.banden.map((r) => r.b.code).join());
    eis(g.weergave.map((r) => r.b.code).join() === '221E1C', 'de ATF staat niet meer tussen de banden', g.weergave.map((r) => r.b.code).join());
    const gb = L.K.sensGroepen(lijst, () => false, true);
    eis(gb.weigert.map((r) => r.b.code).join() === '222A0E' && gb.banden.length === 4, 'in de bibliotheek wint "werkt niet" van "band"', gb.weigert.map((r) => r.b.code).join());
  }

  console.log('\nOBDb vanzelf binnenhalen (17-10-2026)');
  {
    let gezocht = 0, gezet = 0;
    const L = laad({ rol: 'klant', server: { pidbib_kandidaten: (b) => { gezet++; return { ok: true, erbij: b.lijst.length }; } } });
    L.s.PLEigen = { zoekObdb: async () => { gezocht++; return { ok: true, repo: 'Kia-Ceed', kandidaten: [{ code: '22ED08' }, { code: '22E004' }], nietBruikbaar: 3 }; } };
    const v = { id: 'v1', merk: 'Kia', model: 'Ceed' };
    let r = await L.K.obdbVanzelf(v, []);
    eis(gezocht === 1 && gezet === 1 && r && r.erbij === 2, 'eerste keer: zoeken en in de bibliotheek zetten', JSON.stringify(r));
    eis(/3 codes uit OBDb gebruiken een adressering die de app nog niet kent/.test(r.tekst), 'de tekst zegt wat niet bruikbaar was', r.tekst);
    r = await L.K.obdbVanzelf(v, []);
    eis(r === null && gezocht === 1, 'binnen dertig dagen niet opnieuw');
    r = await L.K.obdbVanzelf({ id: 'v2', merk: 'Mazda', model: 'CX-5' }, [{ bron: 'obdb' }]);
    eis(r === null && gezocht === 1, 'staat er al iets uit OBDb: niet zoeken');
    r = await L.K.obdbVanzelf({ id: 'v3', merk: 'Mazda' }, []);
    eis(r === null && gezocht === 1, 'zonder model: niet zoeken');
  }

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
