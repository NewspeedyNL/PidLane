// ══════════════════════════════════════════════════════════════════
// test-samenhang.js — leest het verzamelscherm een meting als een monteur? (#446)
// ──────────────────────────────────────────────────────────────────
// Geen losse waarden tegen een grens, maar SCENARIO'S: een hele meting van
// begin tot eind, zoals een auto hem levert — elke sensor op zijn eigen
// tempo, met een eigen verschuiving in tijd en met ruis. Per scenario twee
// vragen, zoals bij het evalueren van elke foutdetectie:
//   1. vindt hij de fout die erin zit (detectie)?
//   2. alarmeert hij niet op een gezonde auto of een normale situatie
//      (vals alarm)? Die tweede is de tegenproef van de eerste.
//
// De kennis komt uit de échte pidlane-onderzoek.js en de échte
// pidlane-samenhang.js. Deze test bedenkt geen grenzen; hij bouwt alleen
// auto's na.
//
// Draaien vanuit public/:  node test-samenhang.js   (exit 0 = goed)
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

const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; s.globalThis = s;
s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} } };
s.addEventListener = () => {}; s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; }; s.setInterval = () => 0; s.clearTimeout = () => {}; s.clearInterval = () => {};
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-onderzoek.js', 'pidlane-samenhang.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), s, { filename: f }));
const O = s.PLOnderzoek, S = s.PLSamenhang;
if (!O || !S || !S.lees) { console.log('  FOUT  PLOnderzoek of PLSamenhang niet geladen'); process.exit(1); }

// ── Een auto nabouwen ─────────────────────────────────────────────
// Een rit is een lijst stukken. Per stuk per sensor een waarde of een
// functie van de tijd in dat stuk (u = 0…1). Elke sensor heeft een eigen
// tempo en verschuiving, zoals de pollus ze levert.
let zaad = 7;
function ruis(a) { zaad = (zaad * 16807) % 2147483647; return ((zaad / 2147483647) - 0.5) * 2 * a; }
const TEMPO = { '010C': 1000, '010D': 1000, '0104': 1000, '0105': 2000, '010F': 3000, '0146': 5000, '0142': 1000,
                '0106': 1000, '0107': 2000, '0110': 1000, '0114': 250, '0115': 1000, '0103': 5000, '010B': 1000, '0133': 10000 };
const RUIS = { '010C': 15, '010D': 0.5, '0104': 1, '0105': 0.3, '010F': 0.3, '0146': 0.2, '0142': 0.05,
               '0106': 1, '0107': 0.3, '0110': 0.15, '0114': 0, '0115': 0.02, '0103': 0, '010B': 1, '0133': 0 };
function rit(stukken) {
  const h = {}; let t0 = 1785600000000;
  stukken.forEach((st) => {
    Object.keys(st.v).forEach((pid) => {
      const tempo = TEMPO[pid] || 1000, schuif = (pid.charCodeAt(2) * 37) % tempo;
      for (let t = schuif; t < st.sec * 1000; t += tempo) {
        const u = t / (st.sec * 1000), def = st.v[pid];
        let w = typeof def === 'function' ? def(u, t) : def;
        if (w === null) continue;
        if (pid !== '0103' && pid !== '0114') w += ruis(RUIS[pid] || 0);
        (h[pid] || (h[pid] = [])).push({ t: t0 + t, v: w });
      }
    });
    t0 += st.sec * 1000;
  });
  return h;
}
const lin = (a, b) => (u) => a + (b - a) * u;
// Een voorste lambdasonde die regelt: ~2 wisselingen per seconde tussen 0,1 en 0,85 V.
const regelt = (u, t) => (Math.floor(t / 250) % 2 ? 0.85 : 0.12);
// Een gezonde achterste sonde: rustig rond 0,65 V.
const rustig = 0.65;
// Een achterste sonde achter een versleten katalysator: hij loopt de voorste
// na, trager (elke ~1,5 s om). Sneller dan het meettempo zou hij in een
// meting van 1 Hz niet te zien zijn; dat staat in PIDLANE-ARCHIEF.md.
const meeloper = (u, t) => (Math.floor(t / 1500) % 2 ? 0.8 : 0.15);
const MOTOR = (o) => Object.assign({ '0103': 2, '0133': 101, '0146': 12, '0114': regelt, '0115': rustig }, o);

// Een gezonde auto, koude start na een nacht buiten.
function gezond(extra) {
  const e = extra || {};
  return [
    { sec: 20, v: { '010C': 0, '010D': 0, '0104': 0, '0105': 12, '010F': 12, '0146': 12, '0142': 12.6, '0133': 101 } },
    { sec: 240, v: MOTOR({ '010C': 900, '010D': 0, '0104': 22, '0105': lin(12, 60), '010F': 14, '0142': 14.3, '0106': 1, '0107': 2, '0110': 3.2, '0103': 1, '0114': null, '0115': null }) },
    { sec: 480, v: MOTOR({ '010C': lin(1800, 2400), '010D': lin(50, 80), '0104': 40, '0105': lin(60, 90), '010F': 18,
      // slim laden: dipjes bij optrekken naar 12,7 V — dat hoort normaal te lezen
      '0142': (u, t) => (Math.floor(t / 20000) % 3 === 0 ? 12.7 : 14.2), '0106': 0, '0107': 2, '0110': 18 }) },
    { sec: 60, v: MOTOR({ '010C': 780, '010D': 0, '0104': 20, '0105': 91, '010F': 25, '0142': 14.1,
      '0106': e.stStat !== undefined ? e.stStat : 1, '0107': e.ltStat !== undefined ? e.ltStat : 2, '0110': e.mafStat || 3.0,
      '0115': e.achter || rustig }) },
    { sec: 25, v: MOTOR({ '010C': 2500, '010D': 0, '0104': 25, '0105': 91, '010F': 25, '0142': 14.1,
      '0106': e.st2500 !== undefined ? e.st2500 : 0, '0107': e.lt2500 !== undefined ? e.lt2500 : 2, '0110': 9 }) }
  ];
}
const CTX = { brandstof: 'benzine', liters: 2.0 };
const lees = (stukken) => S.lees(rit(stukken), O, CTX);
const top = (r) => r.conclusie.top.map((x) => x.id);
const status = (r, h) => { const x = r.conclusie.alle.filter((y) => y.id === h)[0]; return x ? x.status : 'niet in spel'; };
const uit = (r, h) => ['uitgesloten', 'onwaarschijnlijk'].indexOf(status(r, h)) >= 0;
const beeld = (r) => r.conclusie.alle.map((x) => x.id + ':' + Math.round(x.score * 10) / 10).join(' ') + ' | niet: ' + r.niet.map((x) => x.id).join(',');

(async () => {
  console.log('A. De tijdlijn en de toestanden');
  {
    const h = rit(gezond());
    const tl = S.tijdlijn(h);
    toets('één moment per toerentalmonster, en op elk moment alle sensoren', tl && tl.t.length === h['010C'].length && tl.kol['0105'].length === tl.t.length);
    const g = O.cfg.grens;
    const toest = tl.t.map((_, i) => S.toestandOp(tl, i, g));
    const tel = {}; toest.forEach((x) => { tel[x] = (tel[x] || 0) + 1; });
    toets('de koude start, het warm worden, rijden, stationair warm en de 2500 tpm worden allemaal herkend',
      tel.uit > 0 && tel.stationair_koud > 0 && tel.rijden_koud > 0 && tel.rijden_warm > 0 && tel.stationair_warm > 0 && tel.toeren2500 > 0, JSON.stringify(tel));
    toets('de grenzen zijn die van het onderzoek (CFG.grens), niet eigen', g && g.warmC === 70 && g.aanRpm === 400);
    toets('zonder toerental: geen tijdlijn, en lees() zegt waarom', S.tijdlijn({ '0105': h['0105'] }) === null && /toerental/.test(S.lees({ '0105': h['0105'] }, O, CTX).geen || ''));
  }

  console.log('\nB. Een gezonde auto: geen vals alarm');
  const r0 = lees(gezond());
  toets('geen verdenking boven de drempel', r0.conclusie.top.length === 0, beeld(r0));
  toets('de dynamo is tegengesproken, ondanks de dipjes naar 12,7 V tijdens het rijden (slim laden)', uit(r0, 'laad'), beeld(r0));
  toets('valse lucht is tegengesproken: trims rond nul, stationair warm', uit(r0, 'valselucht'), beeld(r0));
  toets('de katalysator is tegengesproken: achterste sonde rustig', uit(r0, 'kat'), beeld(r0));
  toets('de thermostaat sluit: koelwater haalt 90 °C', status(r0, 'thermostaat') !== 'waarschijnlijk' && status(r0, 'thermostaat') !== 'bevestigd', beeld(r0));
  toets('de koude motor is uit de meting zelf vastgesteld, en de koelwatersensor klopt', uit(r0, 'koelsensor'), beeld(r0));
  toets('toestanden staan in de samenvatting', /stationair warm/.test(r0.regel) && /rijden warm/.test(r0.regel), r0.regel);

  console.log('\nC. Valse lucht: trim hoog stationair, normaal bij 2500 tpm');
  const r1 = lees(gezond({ stStat: 6, ltStat: 10, st2500: 0, lt2500: 3 }));
  toets('valse lucht komt bovenaan', top(r1)[0] === 'valselucht', beeld(r1));
  toets('de luchtmassameter is tegengesproken: de trim herstelt bij meer lucht', uit(r1, 'maf') || status(r1, 'maf') === 'open', beeld(r1));
  toets('de 2500-tpm-stap is gelezen (en niet overgeslagen)', r1.gelezen.some((x) => x.id === 'toeren2500'), beeld(r1));

  console.log('\nD. Luchtmassameter: trim hoog over het hele bereik, weinig lucht stationair');
  const r2 = lees(gezond({ stStat: 7, ltStat: 9, st2500: 6, lt2500: 9, mafStat: 1.4 }));
  toets('de luchtmassameter is een aanwijzing', top(r2).indexOf('maf') >= 0, beeld(r2));
  toets('valse lucht is niet de uitkomst: de trim herstelt niet bij meer lucht', top(r2)[0] !== 'valselucht', beeld(r2));

  console.log('\nE. Dynamo laadt niet');
  const dyn = gezond(); dyn[1].v['0142'] = 12.5; dyn[3].v['0142'] = 12.6; dyn[4].v['0142'] = 12.6;
  const r3 = lees(dyn);
  toets('het laadsysteem komt bovenaan', top(r3)[0] === 'laad', beeld(r3));

  console.log('\nF. Liegende koelwatersensor bij een koude motor');
  const leugen = gezond(); leugen[0].v['0105'] = 31;
  const r4 = lees(leugen);
  toets('de koelwatersensor is een aanwijzing (31 °C bij 12 °C lucht na een nacht)', top(r4).indexOf('koelsensor') >= 0, beeld(r4));
  const zonder = (stukken, pid) => stukken.map((x) => ({ sec: x.sec, v: Object.fromEntries(Object.entries(x.v).filter(([k]) => k !== pid)) }));
  const r4b = S.lees(rit(zonder(leugen, '0146')), O, CTX);
  toets('TEGENPROEF: zonder buitentemperatuur is "lang stilgestaan" niet vast te stellen, en zegt hij dat', r4b.niet.some((x) => x.id === 'koudstart' && /buitentemperatuur/.test(x.reden)), beeld(r4b));

  console.log('\nG. Katalysator versleten: de achterste sonde wisselt mee');
  const r5 = lees(gezond({ achter: meeloper }));
  toets('de katalysator komt bovenaan', top(r5)[0] === 'kat', beeld(r5));

  console.log('\nH. Een warme dag in de file: 104 °C met de ventilator aan');
  const file = gezond(); file[3].sec = 300; file[3].v['0105'] = (u) => 101 + 3 * Math.sin(u * 12);
  const r6 = lees(file);
  toets('geen koelprobleem: 104 °C stationair is binnen de norm van het onderzoek (≥ 106)', status(r6, 'koeling') !== 'waarschijnlijk' && status(r6, 'koeling') !== 'bevestigd', beeld(r6));
  toets('en geen enkele verdenking boven de drempel', r6.conclusie.top.length === 0, beeld(r6));

  console.log('\nI. Open lus: trims tellen niet');
  const open = gezond({ stStat: 18, ltStat: 10 }); open[3].v['0103'] = 4; open[4].v['0103'] = 4;
  const r7 = lees(open);
  toets('met 0103 = open lus wordt het stationaire stuk niet op trims gelezen', r7.niet.some((x) => x.id === 'stationair' && /gesloten lus/.test(x.reden)), beeld(r7));
  toets('en is er dus geen valse lucht, hoe hoog de trim ook is', top(r7).indexOf('valselucht') < 0, beeld(r7));
  const r7b = S.lees(rit(zonder(gezond({ stStat: 6, ltStat: 10 }), '0103')), O, CTX);
  toets('TEGENPROEF: zonder 0103 valt hij terug op "warm", en leest hij de trims wel', r7b.gelezen.some((x) => x.id === 'stationair') && top(r7b).indexOf('valselucht') >= 0, beeld(r7b));

  console.log('\nJ. Een korte meting: eerlijk over wat niet kon');
  const kort = [{ sec: 25, v: MOTOR({ '010C': 850, '010D': 0, '0104': 20, '0105': 45, '010F': 15, '0142': 14.2, '0106': 15, '0107': 10, '0110': 3, '0103': 1 }) }];
  const r8 = lees(kort);
  toets('geen conclusie op 25 s koud stationair', r8.conclusie.top.length === 0, beeld(r8));
  toets('de trims zijn niet beoordeeld, met de reden erbij', r8.niet.some((x) => x.id === 'stationair' && /stationair warm/.test(x.reden)), beeld(r8));
  toets('de thermostaat ook niet: te kort', r8.niet.some((x) => x.id === 'temperatuur'), beeld(r8));

  console.log('\nK. Stilstaand gas geven is geen stationair');
  const gas = gezond(); gas[3].v['010C'] = (u, t) => (Math.floor(t / 4000) % 3 === 0 ? 1600 : 780);
  const r9 = lees(gas);
  toets('tikken op het gas bij stilstand leest niet als overslaan', status(r9, 'misfire') !== 'waarschijnlijk' && status(r9, 'misfire') !== 'bevestigd', beeld(r9));

  console.log('\nK2. Een lambdasonde die exact stilstaat is een meetvraag, geen defect');
  const dood = gezond(); dood.forEach((x) => { if ('0114' in x.v) x.v['0114'] = 0.45; });
  const r10 = lees(dood);
  toets('geen "lambdasonde defect" op een vaste waarde (vaak een breedbandsonde)', status(r10, 'lambda') !== 'waarschijnlijk' && status(r10, 'lambda') !== 'bevestigd', beeld(r10));
  toets('de lambdastap is niet beoordeeld, en zegt waarom', r10.niet.some((x) => x.id === 'lambda' && /staat exact stil/.test(x.reden)), beeld(r10));
  const traag = gezond(); traag.forEach((x) => { if ('0114' in x.v) x.v['0114'] = (u, t) => 0.42 + (Math.floor(t / 250) % 2 ? 0.08 : 0); });
  const r11 = lees(traag);
  toets('TEGENPROEF: een sonde die wél beweegt maar te weinig, blijft een aanwijzing', top(r11).indexOf('lambda') >= 0, beeld(r11));

  console.log('\nL. Wat de AI krijgt');
  {
    const p = S.promptBlok(r1);
    toets('een SAMENHANG-blok met toestanden, aanwijzingen en bewijs met de meetwaarde', /SAMENHANG/.test(p) && /Toestanden in de meting:/.test(p) && /AANWIJZINGEN:\n- Valse lucht[^\n]*▲ brandstoftrim \+/.test(p), p.slice(0, 400));
    toets('ook wat niet beoordeeld is', /NIET BEOORDEELD/.test(S.promptBlok(r8)));
    const r12 = lees([{ sec: 8, v: MOTOR({ '010C': 850, '010D': 0, '0104': 20, '0105': 45, '010F': 15, '0142': 14.2, '0103': 1 }) }]);
    toets('niets gelezen (8 s stationair): geen schijn van "alles in orde"', r12.gelezen.length === 0 && /Niets in samenhang beoordeeld[^\n]*geen conclusie dat alles in orde is/.test(S.promptBlok(r12)) && !/Geen verdenking komt boven/.test(S.promptBlok(r12)), beeld(r12));
    toets('TEGENPROEF: in 25 s koud stationair is de laadspanning wél gelezen', r8.gelezen.some((x) => x.id === 'laden') && !/Niets in samenhang/.test(S.promptBlok(r8)));
    toets('en een eerlijke regel als er niets te lezen viel', /niet bepaald — zonder toerental/.test(S.promptBlok({ geen: 'zonder toerental is niet vast te stellen of de motor draaide' })));
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
