// ══════════════════════════════════════════════════════════════════
// test-winterrit.js — korte ritten (#557) en de thermostaat (#558)
// ──────────────────────────────────────────────────────────────────
// WAT HIER ROOD HOORT TE WORDEN
//   • een rit die nooit warm werd, maar niet zo telt — of andersom;
//   • korte ritten in de zomer die toch een winteradvies geven;
//   • een diesel zonder het roetfilter in de tekst, een benzine mét;
//   • een koelwater dat op de snelweg terugzakt zonder thermostaatadvies;
//   • een gezonde kenveldthermostaat (105 °C stad, 90 °C snelweg), of een
//     rit die in de vrieskou lang over opwarmen deed, die wél een advies
//     krijgt;
//   • PLConditie.tik() die de buitentemperatuur, de tijd op temperatuur of
//     het snelwegkoelwater niet (of verkeerd) vastlegt.
//
// Laadt de echte pidlane-winterrit.js en pidlane-conditie.js (vm).
// Draaien vanuit public/:  node test-winterrit.js     (exit 0 = goed)
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

const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-winterrit.js'), 'utf8'), ctx, { filename: 'pidlane-winterrit.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-conditie.js'), 'utf8'), ctx, { filename: 'pidlane-conditie.js' });
const WR = ctx.PLWinterRit, C = ctx.PLConditie;
if (!WR || !C || typeof C.tik !== 'function') { console.log('FOUT PLWinterRit of PLConditie.tik ontbreekt'); process.exit(1); }

const NU = Date.parse('2026-11-20T12:00:00Z');
let nr = 0;
function rit(o) {
  nr++;
  return Object.assign({ start: new Date(NU - nr * 36e5).toISOString(), duur_s: 600, km: 4, max_koelwater: 70, codes: [] }, o, { extra: { cd: Object.assign({}, o && o.cd) } });
}
const kort = (bt) => rit({ duur_s: 480, max_koelwater: 68, cd: { kk: 1, wt: 0, bt } });
const lang = (bt) => rit({ duur_s: 2400, km: 40, max_koelwater: 90, cd: { kk: 1, ow: 420, wt: 1800, bt, kz: 86 } });

console.log('1. Korte ritten in de kou');
let rs = [kort(3), kort(2), kort(4), kort(1), kort(3), lang(2), kort(5), kort(2)];
let a = WR.korteRitten(rs, { nu: NU, diesel: false });
toets('7 van de 8 nooit warm, 3 °C buiten: advies', !!a && a.soort === 'korteritten', JSON.stringify(a));
toets('de titel telt de ritten', a && /^7 van je laatste 8 ritten/.test(a.titel));
toets('benzine: olie en accu, geen roetfilter', a && /olie/.test(a.tekst) && !/roetfilter/.test(a.tekst));
toets('de buitentemperatuur staat erin, en in de bron', a && /gemiddeld 3 °C buiten/.test(a.tekst) && /buitentemperatuur/.test(a.bron));
const d = WR.korteRitten(rs, { nu: NU, diesel: true });
toets('diesel: het roetfilter', d && /roetfilter/.test(d.tekst));
toets('zomer (18 °C buiten): geen winteradvies', WR.korteRitten([kort(18), kort(17), kort(19), kort(18), kort(20), kort(18)], { nu: NU }) === null);
toets('vooral lange ritten: geen advies', WR.korteRitten([lang(2), lang(3), lang(1), lang(2), kort(2), kort(3)], { nu: NU }) === null);
toets('te weinig ritten: geen oordeel', WR.korteRitten([kort(2), kort(2), kort(3)], { nu: NU }) === null);
const oud = [kort(2), kort(2), kort(3), kort(1), kort(2), kort(3)].map((r) => Object.assign(r, { start: '2026-09-01T08:00:00Z' }));
toets('ritten van twee maanden geleden tellen niet', WR.korteRitten(oud, { nu: NU }) === null);
// Ritten van vóór wt: dan beslist het hoogste koelwater.
const zonderWt = [1, 2, 3, 4, 5, 6].map(() => rit({ max_koelwater: 62, cd: { bt: 4 } }));
toets('oude ritten zonder wt: het hoogste koelwater beslist', !!WR.korteRitten(zonderWt, { nu: NU }));
toets('zonder buitentemperatuur in november: het seizoen telt', !!WR.korteRitten([1, 2, 3, 4, 5, 6].map(() => rit({ max_koelwater: 62 })), { nu: NU }));

console.log('\n2. De thermostaat');
const zakt = (kz) => rit({ duur_s: 2400, km: 45, max_koelwater: 84, cd: { kk: 1, ow: 600, wt: 900, bt: 2, kz } });
let th = WR.thermostaat([zakt(68), zakt(71), lang(3), lang(2)], { nu: NU });
toets('twee keer op de snelweg onder 75 °C gezakt: advies', !!th && th.soort === 'thermostaat', JSON.stringify(th));
toets('de laagste waarde staat erin', th && /tot 68 °C/.test(th.tekst));
toets('één keer gezakt: nog geen oordeel', WR.thermostaat([zakt(70), lang(2), lang(3)], { nu: NU }) === null);
const kenveld = (k) => rit({ duur_s: 2400, km: 45, max_koelwater: 108, cd: { kk: 1, ow: 500, wt: 2000, bt: 4, kz: k } });
toets('een kenveldthermostaat (105 °C, op de snelweg 90 °C): geen advies', WR.thermostaat([kenveld(90), kenveld(88), kenveld(91), kenveld(89)], { nu: NU }) === null);
const nooit = () => rit({ duur_s: 1800, km: 30, max_koelwater: 66, cd: { kk: 1, wt: 0, bt: 1 } });
th = WR.thermostaat([nooit(), nooit(), lang(2)], { nu: NU });
toets('twee ritten van 30 minuten nooit warm: advies', !!th && /2 ritten van 20 minuten of langer/.test(th.tekst));
const traag = () => rit({ duur_s: 1500, km: 25, max_koelwater: 84, cd: { kk: 1, ow: 780, wt: 420, bt: -12 } });
toets('vrieskou, lang over opwarmen maar wél warm: geen advies', WR.thermostaat([traag(), traag(), traag()], { nu: NU }) === null);
th = WR.thermostaat([zakt(70), lang(2), Object.assign(lang(3), { codes: ['P0128'] })], { nu: NU });
toets('één keer gezakt plus P0128: advies', !!th && /P0128/.test(th.tekst));
toets('P0128 alleen, zonder enig teken uit de ritten: geen advies (niet raden)', WR.thermostaat([Object.assign(lang(3), { codes: ['P0128'] }), lang(2)], { nu: NU }) === null);
toets('de bron noemt het aantal ritten', /afgeleid uit \d+ ritten/.test(WR.thermostaat([zakt(68), zakt(71)], { nu: NU }).bron));

console.log('\n3. PLConditie legt het vast');
// 60 s koude start bij 2 °C, opwarmen, dan snelweg met een koelwater dat terugzakt.
let acc = null;
for (let s = 0; s < 60; s++) acc = C.tik(acc, { kmh: 30, rpm: 1800, koelwater: 20 + s * 0.3, inlaat: 2 }, 1);
for (let s = 0; s < 400; s++) acc = C.tik(acc, { kmh: 60, rpm: 2000, koelwater: Math.min(85, 38 + s * 0.2), inlaat: 15 }, 1);
for (let s = 0; s < 120; s++) acc = C.tik(acc, { kmh: 110, rpm: 2600, koelwater: 85 - s * 0.12, inlaat: 12 }, 1);
const sv = C.samenvat(acc);
toets('zonder 0146: de inlaatlucht van de eerste minuut van een koude start', sv.bt === 2, JSON.stringify(sv));
toets('de tijd op temperatuur (≥ 80 °C) in seconden', sv.wt > 100 && sv.wt < 300, String(sv.wt));
toets('het laagste koelwater op de snelweg ná het opwarmen', sv.kz === 71, String(sv.kz));
let a2 = null;
for (let s = 0; s < 30; s++) a2 = C.tik(a2, { kmh: 40, rpm: 1800, koelwater: 90, buiten: -3, inlaat: 25 }, 2);
const sv2 = C.samenvat(a2);
toets('met 0146: de buitentemperatuur zelf', sv2.bt === -3, JSON.stringify(sv2));
toets('een warme start telt de inlaatlucht niet als buiten', (() => { let x = null; for (let s = 0; s < 30; s++) x = C.tik(x, { kmh: 40, rpm: 1800, koelwater: 85, inlaat: 30 }, 1); return C.samenvat(x).bt === undefined; })());
toets('stadsverkeer na het opwarmen geeft geen snelwegwaarde', (() => { let x = null; for (let s = 0; s < 200; s++) x = C.tik(x, { kmh: 45, rpm: 1700, koelwater: 88 }, 1); return C.samenvat(x).kz === undefined; })());
toets('een halve minuut snelweg is te kort voor kz', (() => { let x = null; for (let s = 0; s < 20; s++) x = C.tik(x, { kmh: 110, rpm: 2600, koelwater: 70 }, 1); for (let s = 0; s < 20; s++) x = C.tik(x, { kmh: 110, rpm: 2600, koelwater: 85 }, 1); return C.samenvat(x).kz === undefined; })());

console.log('\n#560 — tractie-ingrijpen, afgeleid');
{
  // Een rit van ~2 min op 50 km/h in de 3e (rpm/kmh 40), gaspedaal 30 %, gasklep 25 %.
  // Elke tik is 2 s en een vers monster (de updatetijd loopt mee).
  const tiks = (gebeurt) => {
    let a = null, t = 0;
    for (let i = 0; i < 60; i++) {
      let m = { kmh: 50, rpm: 2000, pedaal: 30, gasklep: 25 };
      m = Object.assign(m, gebeurt(i) || {});
      t += 2000; m.pedaalT = m.pedaalT === undefined ? t : m.pedaalT; m.gasklepT = m.gasklepT === undefined ? t : m.gasklepT;
      a = C.tik(a, m, 2);
    }
    return C.samenvat(a);
  };
  toets('rustig rijden: gemeten, en nul ingrepen', tiks(() => null).tc === 0);
  toets('koppelreductie: pedaal blijft, gasklep zakt, zelfde versnelling', tiks((i) => (i === 20 ? { gasklep: 12 } : null)).tc === 1);
  toets('tegenproef: een opschakeling (verhouding zakt de tik erna) telt niet', tiks((i) => (i === 20 ? { gasklep: 12 } : i > 20 ? { rpm: 1500 } : null)).tc === 0);
  toets('tegenproef: gas los (pedaal zakt mee) telt niet', tiks((i) => (i === 20 ? { gasklep: 12, pedaal: 5 } : null)).tc === 0);
  toets('wielspin: toeren springen omhoog bij vast pedaal en vallen terug', tiks((i) => (i === 30 ? { rpm: 2600 } : null)).tc === 1);
  toets('tegenproef: een terugschakeling (verhouding blijft hoog) telt niet', tiks((i) => (i >= 30 ? { rpm: 2600 } : null)).tc === 0);
  toets('tegenproef: een gaspedaal dat niet ververst wordt, telt niet', tiks((i) => (i === 20 ? { pedaalT: 40000, gasklep: 12 } : null)).tc === 0);
  toets('zonder gaspedaal-PID: niet gemeten, geen 0', (tiks(() => ({ pedaal: undefined })) || {}).tc === undefined);

  const tr = (bt, tc) => rit({ duur_s: 900, km: 10, max_koelwater: 88, cd: { bt, tc } });
  toets('twee keer in de kou: een advies, met de temperatuur', /2× mogelijk wielslip bij -1 °C/.test((WR.tractie([tr(-1, 1), tr(-1, 1), tr(-1, 0)], { nu: NU }) || {}).titel || ''));
  toets('… en met zomerbanden het bandenadvies', /zomerbanden/.test((WR.tractie([tr(-1, 2)], { nu: NU, banden: 'zomer' }) || {}).tekst || ''));
  toets('twee keer zonder vorst: nog geen advies (hogere drempel)', WR.tractie([tr(12, 1), tr(12, 1)], { nu: NU }) === null);
  toets('ritten zonder meting tellen niet als nul ingrepen', WR.tractie([rit({ duur_s: 900, cd: { bt: -2 } })], { nu: NU }) === null);
  toets('de bron zegt dat remingrepen niet te zien zijn', /remingrepen zijn niet te zien/.test((WR.tractie([tr(-1, 3)], { nu: NU }) || {}).bron || ''));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
