// ══════════════════════════════════════════════════════════════════
// test-conditie.js — PLConditie: de conditiescore van een voertuig (#475)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE pidlane-conditie.js met vm; niets overgeschreven.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • een trim die meetelt terwijl de motor nog koud is;
//   • een opwarmtijd zonder koude start (dan is er niets opgewarmd);
//   • een kenmerk met te weinig metingen dat toch in de rit komt;
//   • misfires uit een andere monitor dan A2–A9, of 0 waar er geen
//     misfire-monitor is;
//   • een beurt in de toekomst, zonder onderdelen, of een notitie als HTML;
//   • olie die over het interval is zonder dat de score zakt, of een
//     diesel die op bougies wordt afgerekend;
//   • een score uit te weinig ritten, een verschil binnen de dode zone
//     dat toch punten kost, of verbruik van een andere snelheidsklasse
//     dat als slijtage telt;
//   • een melding bij elke rit in plaats van één per daling;
//   • het logboek van de Worker en dat van de app die uit de pas lopen.
//   • een kaart waarvan de ring niet de score toont, een deel zonder
//     meting als 0, een oorzaak als HTML, of een daling met een plus.
//
// Draaien vanuit public/:  node test-conditie.js     (exit 0 = goed)
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

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-conditie.js'), 'utf8'), ctx, { filename: 'pidlane-conditie.js' });
const C = ctx.window.PLConditie;
if (!C) { console.log('FOUT PLConditie niet gevonden'); process.exit(1); }

const DAG = 864e5;
const NU = Date.parse('2026-10-13T12:00:00Z');
const dag = (d) => new Date(NU - d * DAG).toISOString();

// Een rit; cd = de kenmerken zoals samenvat() ze in rit.extra.cd zet.
function rit(dagenGeleden, cd, x) {
  return Object.assign({ start: dag(dagenGeleden), km: 20, duur_s: 1500, gem_kmh: 50, verbruik_l100: 6.0, max_koelwater: 92, stationair_pct: 10,
    extra: { cd: Object.assign({ tw: 1, sr: 20, vl: 20, lv: 14.2 }, cd || {}) } }, x || {});
}
// n ritten, één per dag, de oudste `van` dagen geleden.
function reeks(van, aantal, cd, x) { const l = []; for (let i = 0; i < aantal; i++) l.push(rit(van - i, cd, x)); return l; }

console.log('\n1. Per rit verzamelen — alleen wat er onder de juiste omstandigheden gemeten is');
{
  let a = null;
  for (let i = 0; i < 20; i++) a = C.tik(a, { koelwater: 50, rpm: 800, kmh: 0, stft: 5, ltft: 5, accu: 14.1 }, 2);
  let s = C.samenvat(a);
  toets('een trim met een koude motor telt niet', !s || s.tw === undefined, JSON.stringify(s));
  toets('stationair met een koude motor telt niet', !s || s.sr === undefined, JSON.stringify(s));
  a = null;
  for (let i = 0; i < 20; i++) a = C.tik(a, { koelwater: 90, rpm: 800 + (i % 2 ? 20 : -20), kmh: 0, stft: 2, ltft: 4 }, 2);
  s = C.samenvat(a);
  toets('warm: trim is kort + lang samen (2 + 4 = 6 %)', s && s.tw === 6, JSON.stringify(s));
  toets('warm stationair: spreiding van het toerental (±20 → ~20 tpm)', s && s.sr >= 19 && s.sr <= 22, JSON.stringify(s));
  toets('warm begonnen = geen koude start, en dus geen opwarmtijd', s && s.kk === 0 && s.ow === undefined, JSON.stringify(s));
  a = null;
  for (let i = 0; i < 5; i++) a = C.tik(a, { koelwater: 90, rpm: 800, kmh: 0, stft: 2 }, 2);
  s = C.samenvat(a);
  toets('te weinig metingen (5 tikken) → geen trim en geen stationair', !s || (s.tw === undefined && s.sr === undefined), JSON.stringify(s));
  a = null;
  let k = 20;
  for (let i = 0; i < 300; i++) { a = C.tik(a, { koelwater: k, rpm: 2000, kmh: 50 }, 2); k = Math.min(90, k + 0.5); }
  s = C.samenvat(a);
  toets('koude start: opwarmtijd tot 80 °C (121 tikken = 242 s)', s && s.kk === 1 && s.ow === 242, JSON.stringify(s));
  a = null;
  for (let i = 0; i < 10; i++) a = C.tik(a, { koelwater: 90, rpm: 2500, kmh: 80, last: 30, vervroeg: 25 }, 2);
  s = C.samenvat(a);
  toets('vervroeging zonder belasting telt niet', !s || s.vl === undefined, JSON.stringify(s));
  for (let i = 0; i < 10; i++) a = C.tik(a, { koelwater: 90, rpm: 2500, kmh: 80, last: 70, vervroeg: 18, raildruk: 40000 }, 2);
  s = C.samenvat(a);
  toets('vervroeging en raildruk bij belasting', s && s.vl === 18 && s.rd === 40000, JSON.stringify(s));
  a = null;
  for (let i = 0; i < 15; i++) a = C.tik(a, { koelwater: 40, rpm: 3500, kmh: 60, accu: 14.0 }, 2);
  s = C.samenvat(a);
  toets('hoge toeren met een koude motor worden geteld (30 s)', s && s.kh === 30, JSON.stringify(s));
  toets('laadspanning bij toeren boven 1200', s && s.lv === 14, JSON.stringify(s));
  toets('een meetgat (dt 0) verandert niets', JSON.stringify(C.tik({ t: 5 }, { koelwater: 90 }, 0)) === JSON.stringify({ t: 5 }));
}

console.log('\n2. Ontstekingsmissers uit mode 06');
{
  const t = (mid, tid, w) => ({ mid, tid, ruw: { waarde: w, min: 0, max: 100 } });
  toets('som over de cilinders, TID 0B gaat voor', C.misfire({ tests: [t(0xA2, 0x0B, 3), t(0xA3, 0x0B, 4), t(0xA2, 0x0C, 50)] }) === 7);
  toets('zonder 0B: de huidige cyclus (0C)', C.misfire({ tests: [t(0xA2, 0x0C, 2), t(0xA5, 0x0C, 1)] }) === 3);
  toets('andere monitors (katalysator 0x21) tellen niet', C.misfire({ tests: [t(0x21, 0x0B, 99)] }) === null);
  toets('geen misfire-monitor = onbekend, niet 0', C.misfire({ tests: [] }) === null && C.misfire(null) === null);
}

console.log('\n3. Een beurt invullen');
{
  let r = C.beurt({ datum: '', wat: ['olie'] }, NU);
  toets('zonder datum geweigerd', !!r.fout);
  r = C.beurt({ datum: '2026-12-01', wat: ['olie'] }, NU);
  toets('een datum in de toekomst geweigerd', !!r.fout);
  r = C.beurt({ datum: '2026-09-01', wat: [] }, NU);
  toets('zonder onderdelen geweigerd', !!r.fout);
  r = C.beurt({ datum: '2026-09-01', km: '135.000', wat: ['olie', 'olie', 'raketmotor', 'luchtfilter'], notitie: '  <b>garage</b>\n  ' }, NU);
  toets('km met punt, dubbele en onbekende onderdelen eruit', r.beurt && r.beurt.km === 135000 && r.beurt.wat.join() === 'olie,luchtfilter', JSON.stringify(r));
  toets('notitie getrimd, zonder regeleinde', r.beurt && r.beurt.notitie === '<b>garage</b>', JSON.stringify(r));
  const log = C.logMet([{ datum: '2025-01-01', wat: ['olie'] }], r.beurt);
  toets('logboek nieuwste eerst', log[0].datum === '2026-09-01' && log[1].datum === '2025-01-01');
  toets('basis = een beurt met olie', C.heeftBasis({ onderhoud_log: log }) && !C.heeftBasis({ onderhoud_log: [{ datum: '2026-01-01', wat: ['remmen'] }] }));
}

console.log('\n3b. Ander werk: vervangen onderdelen voor softwareOorzaken (#426)');
{
  let r = C.beurt({ datum: '2026-09-20', wat: [], werk: ['lambdasonde', 'lambdasonde', 'raketmotor', 'gasklep'] }, NU);
  toets('een beurt met alleen ander werk mag; dubbel en onbekend eruit', r.beurt && r.beurt.wat.length === 0 && r.beurt.werk.join() === 'lambdasonde,gasklep', JSON.stringify(r));
  r = C.beurt({ datum: '2026-09-20', wat: ['olie'], werk: ['raketmotor'] }, NU);
  toets('zonder geldig ander werk geen leeg werk-veld', r.beurt && !('werk' in r.beurt), JSON.stringify(r));
  toets('alleen onbekend werk telt als niets gedaan', !!C.beurt({ datum: '2026-09-20', wat: [], werk: ['raketmotor'] }, NU).fout);
  const v = { brandstof: 'benzine', onderhoud_log: [
    { datum: '2026-09-20', wat: [], werk: ['lambdasonde'] },
    { datum: '2026-08-01', wat: ['accu', 'olie'] },
    { datum: '2026-03-01', wat: [], werk: ['gasklep'] } ] };
  const rv = C.recentVervangen(v, NU);
  toets('recent vervangen: lambdasonde en accu binnen 90 dagen, geen olie, geen gasklep van een half jaar terug',
    rv.slice().sort().join() === 'accu,lambdasonde', JSON.stringify(rv));
  toets('zonder logboek een lege lijst', C.recentVervangen({}, NU).length === 0 && C.recentVervangen(null, NU).length === 0);
  toets('logboek en paspoort noemen het werk bij naam', C.gedaan(v.onderhoud_log[0]).join() === 'Lambdasonde' && C.gedaan(v.onderhoud_log[1]).join() === 'Accu,Motorolie');
  toets('heeftBasis struikelt niet over een beurt zonder onderdelen', C.heeftBasis(v) === true && C.heeftBasis({ onderhoud_log: [v.onderhoud_log[0]] }) === false);
}

console.log('\n4. Onderhoudsstand');
{
  const v = (log, x) => Object.assign({ brandstof: 'benzine', onderhoud_log: log }, x || {});
  const olie = (datum, km) => ({ datum, km, wat: ['olie'] });
  let o = C.onderhoudsstand(v([olie('2026-09-13', 100000)]), { nu: NU, km: 101000 });
  toets('net ververst: 100', o.score === 100, JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)]), { nu: NU, km: 115000 });
  toets('precies het interval (15.000 km): 80', o.score === 80, JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)]), { nu: NU, km: 122500 });
  toets('anderhalf keer het interval: 0', o.score === 0, JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2025-04-13', null)]), { nu: NU, km: null });
  toets('alleen tijd bekend: 18 maanden op 12 zakt hem', o.score < 50 && o.delen[0].staat === 'over', JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)], { onderhoud_interval_km: 30000 }), { nu: NU, km: 115000 });
  toets('het interval uit het profiel gaat voor (15.000 van 30.000 = 100)', o.score === 100, JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)]), { nu: NU, km: 112000, olieFactor: 0.7 });
  toets('zwaar rijpatroon verkort het interval (12.000 van 10.500 → onder 80)', o.score < 80 && o.delen[0].intervalKm === 10500, JSON.stringify(o.delen[0]));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)], { brandstof: 'diesel' }), { nu: NU, km: 101000 });
  toets('een diesel heeft geen bougies', !o.delen.some((d) => d.id === 'bougies'));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)], { distributie: 'ketting, niet vervangen' }), { nu: NU, km: 101000 });
  toets('distributieketting: geen riem-interval', !o.delen.some((d) => d.id === 'distributie'));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)]), { nu: NU, km: 101000 });
  toets('niet ingevulde onderdelen tellen niet mee', o.delen.filter((d) => d.staat === 'onbekend').length > 3 && o.score === 100);
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)], { apk_tot: '2026-10-01' }), { nu: NU, km: 101000 });
  toets('verlopen APK kost 15 punten', o.score === 85 && o.apkStaat === 'verlopen', JSON.stringify(o));
  o = C.onderhoudsstand(v([olie('2026-09-13', 100000)], { onderhoud_km: 100500 }), { nu: NU, km: 101000 });
  toets('voorbij het geplande onderhoud uit het profiel telt als over tijd', o.score <= 80, JSON.stringify(o.delen[0]));
  toets('km-stand nu: profiel + ritten erna', C.kmNu({ kmstand: 1000, kmstand_op: dag(10), onderhoud_log: [] }, [rit(5, {}, { km: 30 }), rit(20, {}, { km: 99 })]) === 1030);
}

console.log('\n5. Conditie uit de ritten');
{
  const v = { brandstof: 'benzine', onderhoud_log: [{ datum: dag(200).slice(0, 10), km: 100000, wat: ['olie'] }] };
  let c = C.conditie(reeks(30, 8), v, NU);
  toets('8 ritten: nog niet klaar, nog 2 nodig', !c.klaar && c.nodig === 2, JSON.stringify(c));
  c = C.conditie(reeks(30, 4).concat(reeks(26, 6, {}, { km: 1 })), v, NU);
  toets('ritten onder 3 km tellen niet', !c.klaar && c.nodig === 6, JSON.stringify(c));
  c = C.conditie(reeks(30, 10), v, NU);
  toets('10 gelijke ritten: alles 100', c.klaar && c.deel.motor === 100 && c.deel.brandstof === 100 && c.deel.accu === 100, JSON.stringify(c.deel));
  c = C.conditie(reeks(30, 5).concat(reeks(20, 5, { tw: 2.5 })), v, NU);
  toets('trim +1,5 % binnen de dode zone: geen punten', c.deel.brandstof === 100, JSON.stringify(c.kenmerken.filter((k) => k.id === 'tw')));
  c = C.conditie(reeks(30, 5).concat(reeks(20, 5, { tw: 7 })), v, NU);
  const tw = c.kenmerken.filter((k) => k.id === 'tw')[0];
  toets('trim van +1 naar +7 %: brandstof zakt', c.deel.brandstof < 90 && tw && tw.verlies > 0.5, JSON.stringify(tw));
  c = C.conditie(reeks(30, 5).concat(reeks(20, 5, { tw: -7 })), v, NU);
  toets('ook een negatieve trim telt (afwijking, niet richting)', c.deel.brandstof < 90, JSON.stringify(c.deel));
  // Verbruik: recent alleen stadsritten met een hoger verbruik — dat is file, geen slijtage.
  c = C.conditie(reeks(30, 5, {}, { gem_kmh: 80, verbruik_l100: 5 }).concat(reeks(20, 5, {}, { gem_kmh: 25, verbruik_l100: 9 })), v, NU);
  toets('meer verbruik in een andere snelheidsklasse telt niet', !c.kenmerken.some((k) => k.id === 'verbruik'), JSON.stringify(c.kenmerken.map((k) => k.id)));
  c = C.conditie(reeks(30, 5, {}, { gem_kmh: 80, verbruik_l100: 5 }).concat(reeks(20, 5, {}, { gem_kmh: 80, verbruik_l100: 6 })), v, NU);
  const vb = c.kenmerken.filter((k) => k.id === 'verbruik')[0];
  toets('20 % meer op dezelfde soort rit: verbruik kost punten', vb && vb.d === 20 && vb.verlies > 0.99, JSON.stringify(vb));
  c = C.conditie(reeks(30, 5, { vl: undefined }).concat(reeks(20, 5, { vl: 10 })), v, NU);
  toets('een kenmerk zonder nulmeting telt niet', !c.kenmerken.some((k) => k.id === 'vl'), JSON.stringify(c.kenmerken.map((k) => k.id)));
  c = C.conditie(reeks(30, 5).concat(reeks(20, 5, { lv: 13.0 })), v, NU);
  toets('laadspanning 14,2 → 13,0 V: accu zakt hard', c.deel.accu <= 10, JSON.stringify(c.deel));
  // Slim laden (#452/#475): de vloer geldt niet, en 0,9 V schommeling over vijf ritten is ruis.
  ctx.PLKenmerk = ctx.window.PLKenmerk = { geldt: () => ({ uitkomst: 'geldt_niet' }), profiel: () => ({}), bronVoertuig: () => ({}) };
  c = C.conditie(reeks(30, 5, { lv: 13.99 }).concat(reeks(20, 5, { lv: 13.1 })), v, NU);
  const lvSlim = c.kenmerken.filter((k) => k.id === 'lv')[0];
  toets('slim laden: 13,99 → 13,1 V (CX-5, gezond) kost geen punten', lvSlim && lvSlim.verlies === 0, JSON.stringify(lvSlim));
  c = C.conditie(reeks(30, 5, { lv: 14.0 }).concat(reeks(20, 5, { lv: 12.0 })), v, NU);
  toets('slim laden: 14,0 → 12,0 V kost wél punten (dynamo laadt niet meer)', c.deel.accu < 100, JSON.stringify(c.deel));
  delete ctx.window.PLKenmerk; delete ctx.PLKenmerk;
  c = C.conditie(reeks(30, 5, { rd: 13500 }).concat(reeks(20, 5, { rd: 11000 })), v, NU);
  const rdK = c.kenmerken.filter((k) => k.id === 'rd')[0];
  toets('raildruk 19 % lager over tien ritten: binnen de gemeten spreiding', !rdK || rdK.verlies === 0, JSON.stringify(rdK));
  c = C.conditie(reeks(30, 10), Object.assign({}, v, { gezondheid: { accuRust: 12.1 } }), NU);
  toets('accu in rust 12,1 V telt ook zonder nulmeting', c.deel.accu < 100, JSON.stringify(c.deel));
  // De nulmeting na een beurt: oud slecht, beurt, daarna tien goede ritten.
  const vb2 = { onderhoud_log: [{ datum: dag(15).slice(0, 10), km: 100000, wat: ['olie'] }] };
  c = C.conditie(reeks(40, 10, { tw: 9 }).concat(reeks(14, 10)), vb2, NU);
  toets('genoeg ritten na de beurt: die zijn de nulmeting', c.klaar && /na de beurt/.test(c.bron) && c.deel.brandstof === 100, c.bron + ' ' + JSON.stringify(c.deel));
}

console.log('\n6. Samen: de score, de lijn en de melding');
{
  const v = { brandstof: 'benzine', kmstand: 110000, kmstand_op: dag(0), onderhoud_log: [{ datum: dag(60).slice(0, 10), km: 105000, wat: ['olie', 'oliefilter'] }] };
  let m = C.beoordeel(v, reeks(50, 10), { nu: NU });
  toets('alles in orde: hoog cijfer', m.score >= 95 && m.basis, JSON.stringify(m.deel));
  const slecht = reeks(50, 10).concat(reeks(12, 10, { tw: 9, sr: 60 }));
  m = C.beoordeel(v, slecht, { nu: NU });
  toets('trim en stationair verslechteren: score zakt', m.score < 85, JSON.stringify(m.deel));
  toets('oorzaken, de zwaarste eerst', m.oorzaken.length >= 2 && m.oorzaken[0].punten >= m.oorzaken[1].punten, JSON.stringify(m.oorzaken.map((x) => x.id + ':' + x.punten)));
  toets('de lijn kijkt niet vooruit: het begin is hoog, het eind laag', m.lijn.length >= 2 && m.lijn[0].score > m.lijn[m.lijn.length - 1].score, JSON.stringify(m.lijn.map((p) => p.score)));
  toets('een daling van de laatste weken wordt gezien', m.daling && m.daling.van - m.daling.naar >= 8, JSON.stringify(m.daling));
  let b = C.meldBesluit(m.daling, null, m.score);
  toets('eerste keer: melden', b.meld && b.gemeld === m.score);
  b = C.meldBesluit(m.daling, b.gemeld, m.score);
  toets('dezelfde daling bij de volgende rit: niet nog eens', !b.meld);
  b = C.meldBesluit(m.daling, 80, 70);
  toets('nog eens 8 punten lager: wel weer', b.meld && b.gemeld === 70);
  b = C.meldBesluit(null, 60, 90);
  toets('score weer boven de vorige melding: de volgende daling mag weer', b.gemeld === null);
  toets('zonder daling geen melding', !C.meldBesluit(null, null, 50).meld);
  m = C.beoordeel(Object.assign({}, v, { onderhoud_log: [] }), reeks(50, 10), { nu: NU });
  toets('zonder beurt geen basis, maar wel een rijmeting', !m.basis && m.deel.onderhoud === null && m.score !== null);
}

console.log('\n7. Wat een beurt opleverde, en wat uitstel kost');
{
  const beurt = dag(10).slice(0, 10);
  const v = { onderhoud_log: [{ datum: beurt, km: 100000, wat: ['olie', 'bougies'] }] };
  const rs = reeks(30, 5, { sr: 60, tw: 6 }).concat(reeks(9, 5, { sr: 20, tw: 1 }));
  const e = C.effect(rs, v.onderhoud_log);
  toets('voor/na: stationair en trim verbeterd', e && e.veranderd.some((x) => x.id === 'sr' && x.beter) && e.veranderd.some((x) => x.id === 'tw' && x.beter), JSON.stringify(e));
  const e2 = C.effect(reeks(30, 5).concat(reeks(9, 2)), v.onderhoud_log);
  toets('te weinig ritten erna: nog geen uitspraak', e2 && !e2.veranderd.length && e2.na === 2);
  const v2 = { onderhoud_log: [{ datum: dag(200).slice(0, 10), km: 100000, wat: ['olie'] }] };
  const rk = reeks(80, 5, {}, { gem_kmh: 80, verbruik_l100: 5 }).concat(reeks(40, 40, {}, { gem_kmh: 80, verbruik_l100: 6, km: 40 }));
  const m = C.beoordeel(v2, rk, { nu: NU, prijs: 2 });
  toets('meerverbruik in euro per jaar', m.kosten && m.kosten.euroJaar > 0 && m.kosten.pct === 20, JSON.stringify(m.kosten));
  toets('zonder literprijs geen bedrag', C.beoordeel(v2, rk, { nu: NU }).kosten === null);
}

console.log('\n8. Belasting voor de olie');
{
  const log = [{ datum: dag(100).slice(0, 10), wat: ['olie'] }];
  let o = C.olieBelasting(reeks(50, 20, { kk: 1, kh: 60 }, { km: 4, duur_s: 600, stationair_pct: 30 }), log);
  toets('korte koude ritten met hoge toeren: korter interval', o.bekend && o.factor < 0.8 && o.redenen.length >= 2, JSON.stringify(o));
  o = C.olieBelasting(reeks(50, 20, { kk: 0 }, { km: 40, stationair_pct: 5 }), log);
  toets('lange warme ritten: normaal interval', o.factor === 1, JSON.stringify(o));
  o = C.olieBelasting(reeks(50, 3), log);
  toets('minder dan vijf ritten: geen uitspraak', !o.bekend && o.factor === 1);
  o = C.olieBelasting(reeks(150, 20, { kk: 1 }, { km: 4 }).concat(reeks(50, 10, { kk: 0 }, { km: 40 })), log);
  toets('alleen de ritten sinds de laatste olie tellen', o.factor === 1 && o.n === 10, JSON.stringify(o));
}

console.log('\n9. Scherm en paspoort');
{
  const v = { naam: 'Blauwe', onderhoud_log: [] , onderhoud_laatst: '<img src=x>' };
  let h = C.html(v, { ritten: [] });
  toets('zonder beurt: eerst het startformulier', /Conditiescore starten/.test(h) && /_condStart/.test(h));
  toets('een oude notitie komt niet als HTML op het scherm', h.indexOf('<img') < 0 && h.indexOf('&lt;img') >= 0);
  const v2 = { naam: 'Blauwe', onderhoud_log: [{ datum: '2026-09-01', km: 1000, wat: ['olie'], notitie: '<script>x</script>' }] };
  h = C.html(v2, { ritten: null });
  toets('ritten nog onderweg: wachten', /⏳/.test(h));
  h = C.html(v2, { ritten: reeks(30, 3), nu: NU });
  toets('weinig ritten: zegt hoeveel er nog nodig zijn', /start na 7 ritten/.test(h), h.slice(0, 600));
  toets('notitie in het logboek ge-escaped', h.indexOf('<script>') < 0 && h.indexOf('&lt;script&gt;') >= 0);
  toets('de score is niet opdringerig: waarom staat dicht', /<details class="gr-blok"><summary/.test(h) || !/Waarom/.test(h));
  const m = C.beoordeel(v2, reeks(30, 10), { nu: NU });
  const p = C.paspoort(v2, m);
  toets('paspoort: score, logboek en de kanttekening', /Conditiescore: \d+ \/ 100/.test(p) && /2026-09-01/.test(p) && /geen keuring/.test(p), p);
  toets('paspoort noemt zich nergens anoniem', !/anoniem/i.test(p));
}

console.log('\n10. App en Worker: hetzelfde logboek');
{
  const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  const m = /var KP_ONDERHOUD_WAT = (\[[^\]]*\]);/.exec(w);
  const wat = m ? JSON.parse(m[1]) : null;
  toets('KP_ONDERHOUD_WAT gevonden in worker.js', !!wat);
  const app = C.ONDERDELEN.map((o) => o.id);
  toets('de Worker kent precies de onderdelen van de app', wat && wat.join() === app.join(), (wat || []).join() + ' ≠ ' + app.join());
  const mx = /onderhoud_log: \{ soort: "onderhoudlog", max: (\d+) \}/.exec(w);
  toets('even lang logboek in app en Worker', mx && Number(mx[1]) === C.CFG.logMax, mx && mx[1]);
}

console.log('\n11. De conditiekaart (30-10-2026)');
{
  // Een m zoals beoordeel() hem geeft, met de velden die kaart() leest.
  const T0 = NU - 30 * 864e5;
  const mk = (o) => Object.assign({ score: 82, deel: { onderhoud: 74, motor: 88, brandstof: 91, accu: null },
    conditie: { klaar: true, nodig: 0, bron: 'de eerste 5 na de beurt van 2026-09-01' },
    lijn: [{ t: T0, score: 86 }, { t: T0 + 10 * 864e5, score: 85 }, { t: NU, score: 82 }],
    oorzaken: [{ tekst: 'Remvloeistof is bijna aan de beurt.', punten: 3.24 }] }, o);
  let h = C.kaart(mk());
  const ring = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(h);
  toets('de ring is precies zo vol als de score', ring && Math.abs(Number(ring[1]) / Number(ring[2]) - 0.82) < 0.002, ring && ring[0]);
  toets('het cijfer staat in de ring', /class="cdk-getal">82</.test(h));
  toets('oordeel bij 82: redelijk, in oranje', /redelijk/.test(h) && /data-kleur="oranje"/.test(h));
  toets('alle vier de delen, met hun getal', ['Onderhoud', 'Motor', 'Brandstof', 'Accu'].every((d) => h.indexOf('<span>' + d + '</span>') >= 0) && /<b>74<\/b>/.test(h) && /<b>91<\/b>/.test(h));
  toets('een deel zonder meting krijgt een streep en een lege balk, geen 0', /width:0%[^>]*><\/i><\/u><b>—<\/b>/.test(h) && !/<b>0<\/b>/.test(h), h.slice(h.indexOf('Accu'), h.indexOf('Accu') + 160));
  toets('het verloop zegt hoeveel hij zakte: −4', /Verloop · 3 metingen<\/span><b class="neer">−4<\/b>/.test(h));
  toets('omhoog is groen en met een plus', /<b class="op">\+5<\/b>/.test(C.kaart(mk({ lijn: [{ t: T0, score: 77 }, { t: NU, score: 82 }] }))));
  toets('de grootste oorzaak met zijn punten', /Grootste oorzaak<\/span><b class="neer">−3,2<\/b>/.test(h) && /Remvloeistof is bijna/.test(h));
  toets('een oorzaak komt niet als HTML op het scherm', C.kaart(mk({ oorzaken: [{ tekst: '<img src=x>', punten: 1 }] })).indexOf('<img') < 0);
  h = C.kaart(mk({ conditie: { klaar: false, nodig: 7 }, deel: { onderhoud: 90, motor: null, brandstof: null, accu: null }, score: 90, lijn: [], oorzaken: [] }));
  toets('nog geen ritmeting: per deel hoeveel ritten nog, en geen verloop', (h.match(/<b>nog 7<\/b>/g) || []).length === 3 && !/Verloop/.test(h) && /start na 7 ritten/.test(h));
  toets('90: goed, in groen', /data-kleur="groen"/.test(h) && />goed</.test(h));
  h = C.kaart(mk({ score: null, deel: { onderhoud: null, motor: null, brandstof: null, accu: null }, lijn: [], oorzaken: [] }));
  toets('zonder score: geen NaN, een streep en "nog geen score"', !/NaN|undefined/.test(h) && /class="cdk-getal">—</.test(h) && /nog geen score/.test(h) && /stroke-dasharray="0 /.test(h));
  const v2 = { naam: 'Blauwe', onderhoud_log: [{ datum: '2026-09-01', km: 1000, wat: ['olie'] }] };
  h = C.html(v2, { ritten: reeks(30, 3), nu: NU });
  toets('het tabblad opent met de kaart', h.indexOf('<div class="cdk"') === 0, h.slice(0, 80));
  toets('de kaart brengt zijn eigen vorm mee', typeof C.CSS === 'string' && /\.cdk-ring\{/.test(C.CSS) && /\.cdk-deel\{/.test(C.CSS));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
