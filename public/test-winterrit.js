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

  // ── methode 1: gemeten aan de vier wielen (ABS-module) ──
  const wtiks = (gebeurt) => {
    let a = null, t = 0;
    for (let i = 0; i < 60; i++) {
      t += 2000;
      let w = { VL: 50, VR: 50, AL: 50, AR: 50 }, x = gebeurt(i) || {};
      Object.assign(w, x.w || {});
      const wt = x.wt || {};
      const wielen = {}; Object.keys(w).forEach((k) => { wielen[k] = { v: w[k], t: wt[k] !== undefined ? wt[k] : t - (k === 'AR' ? 900 : 0) }; });
      a = C.tik(a, Object.assign({ kmh: 50, rpm: 2000, pedaal: x.pedaal !== undefined ? x.pedaal : 30, gasklep: 25, pedaalT: t, gasklepT: t, wielen: x.geen ? null : wielen }), 2);
    }
    return C.samenvat(a);
  };
  toets('wielen: rustig rijden is gemeten, nul slip', wtiks(() => null).ts === 0);
  toets('wielen: voor 15 % sneller bij gas, drie tikken lang = één keer slip', wtiks((i) => (i >= 20 && i < 23 ? { w: { VL: 58, VR: 57 } } : null)).ts === 1);
  toets('tegenproef wielen: hetzelfde verschil zonder gas (remmen) telt niet', wtiks((i) => (i >= 20 && i < 23 ? { w: { VL: 58, VR: 57 }, pedaal: 0 } : null)).ts === 0);
  toets('tegenproef wielen: een klein verschil (bocht, bandenmaat, 5 %) is geen slip', wtiks((i) => (i === 20 ? { w: { AL: 45 } } : null)).ts === 0);
  toets('tegenproef wielen: een wiel van 4 s eerder vergelijkt twee momenten', wtiks((i) => (i === 20 ? { w: { VL: 58, VR: 57 }, wt: { AL: 36000 } } : null)).ts === 0);
  toets('zonder wielsnelheden: niet gemeten, geen 0', wtiks(() => ({ geen: true })).ts === undefined);
  const trw = (bt, ts, tc) => rit({ duur_s: 900, km: 10, max_koelwater: 88, cd: { bt, ts, tc } });
  const g = WR.tractie([trw(-1, 1, 3), trw(-1, 1, 3)], { nu: NU }) || {};
  toets('gemeten gaat voor afgeleid: 2× (niet 6×), zonder "mogelijk"', /^2× wielslip bij -1 °C/.test(g.titel || ''), g.titel);
  toets('de bron noemt de vier wielen', /vier wielen/.test(g.bron || ''), g.bron);
  toets('gemengd: de bron zegt hoeveel ritten gemeten zijn', /in 1 van 2 ritten/.test((WR.tractie([trw(-1, 1), tr(-1, 2)], { nu: NU }) || {}).bron || ''));
}

console.log('\n#558 — één oordeel: de wintercheck leest PLWinterRit.opwarming');
{
  const O = WR.opwarming;
  toets('warm in 5 minuten en blijft warm: ok', O({ eind: 90, tijdWarm: 300, minNaWarm: 87 }).niveau === 'ok');
  toets('blijft onder de bedrijfstemperatuur: fout', O({ eind: WR.CFG.bedrijf - 1, tijdWarm: null }).niveau === 'fout');
  toets('op de bedrijfstemperatuur precies: niet afgekeurd', O({ eind: WR.CFG.bedrijf, tijdWarm: 300 }).niveau !== 'fout');
  toets('warm, daarna terug onder de snelweggrens: fout, met de temperatuur',
    O({ eind: 90, tijdWarm: 300, minNaWarm: WR.CFG.kzGrens - 3 }).niveau === 'fout' && /zakt terug tot 72/.test(O({ eind: 90, tijdWarm: 300, minNaWarm: 72 }).tekst));
  toets('traag (8 minuten): let op', O({ eind: 90, tijdWarm: WR.CFG.traagS + 60 }).niveau === 'let');
  toets('geen koelwater gemeten: onbekend, geen vals "open vast"', O({}).niveau === 'onbekend');

  // De echte winterLocalVerdict uit pidlane-koopcheck.js, losgeknipt op zijn
  // naam. Verdwijnt het anker, dan stopt deze toets in plaats van groen te staan.
  const src = fs.readFileSync(__dirname + '/pidlane-koopcheck.js', 'utf8');
  const van = src.indexOf('function winterLocalVerdict(){');
  const tot = src.indexOf('\nfunction ', van + 10);
  if (van < 0 || tot < 0) { console.error('FOUT: winterLocalVerdict niet gevonden in pidlane-koopcheck.js'); process.exit(1); }
  const maak = new Function('window', '_climateData', src.slice(van, tot) + '\nreturn winterLocalVerdict();');
  const ms = function (lijst) { return lijst.map(function (c, i) { return { t: i * 30, coolant: c }; }); };
  const zakt = maak({ PLWinterRit: WR }, { baseline: { coolant: 10, volt: 12.4 }, eind: { coolant: 86 }, samples: ms([20, 50, 80, 89, 92, 74, 70, 86]) });
  toets('wintercheck: terugzakken na het opwarmen wordt nu gezien (oude code zei OK)', /zakt terug/.test(zakt.oordeel) && zakt.kleur === '#ef4444', JSON.stringify(zakt));
  const goed = maak({ PLWinterRit: WR }, { baseline: { coolant: 10 }, eind: { coolant: 90 }, samples: ms([20, 50, 80, 89, 90, 90]) });
  toets('wintercheck: gezonde opwarming is groen, opwarmtijd tot 88 °C = 90 s', goed.kleur === '#22c55e' && goed.tijd88 === 90, JSON.stringify(goed));
  const zonder = maak({}, { baseline: {}, eind: { coolant: 90 }, samples: [] });
  toets('wintercheck zonder PLWinterRit: onbekend, en niet stil', zonder.kleur === '#8b949e');
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
