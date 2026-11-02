// ══════════════════════════════════════════════════════════════════
// test-hyperlane.js — Hyperlane, de blikvanger van Slim visueel (27-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-hyperlane.js en pidlane-visprofiel.js in een vm en
// toetst wat zonder scherm te toetsen is:
//   • de kleur loopt van ijsblauw naar rood en springt nergens buiten de stops;
//   • de stemming: rustig = 0, een lege plek maakt het scherm niet rood,
//     toeren telt zwaarder dan gas;
//   • de schakellampjes lopen naar het schakelpunt (rustig het ecopunt, hard
//     90% van de rode streep), knipperen daar, en de pijl omhoog verschijnt;
//   • 0–100 meet alleen vanuit stilstand met gas, en stilstaan zet hem terug;
//   • de scène (alarm, begrenzer, remmen, launch, koud, stil, cruise) en hun voorrang;
//   • de rit (afstand, top, rijtijd, beste 0–100) en de tegels van het scorebord;
//   • het profiel kiest de juiste PIDs en een diesel krijgt 6000 rpm;
//   • elke klasse die de tekening gebruikt heeft regels in pidlane.css;
//   • het midden: een getal blijft minstens 6 s staan, een versnelling niet
//     bij elke twijfel weg, en bij vol gas geen verbruik.
// Wat in de echte app gebeurt (WebGL, de lus, het volle scherm): bproef-hyperlane.js.
//
// Draaien vanuit public/:  node test-hyperlane.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const CSS = lees('pidlane.css');
function laad() {
  const opslag = {};
  const c = { console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } } };
  c.window = c;
  vm.createContext(c);
  ['pidlane-toon.js', 'pidlane-hyperlane.js', 'pidlane-visprofiel.js'].forEach(f => vm.runInContext(lees(f), c, { filename: f }));
  return c;
}
const C = laad(), H = C.PLHyperlane, P = C.PLVisProfiel;

console.log('\n1. Kleur volgt het rijgedrag');
const gelijk = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.5);
waar('rustig is ijsblauw, de begrenzer rood', gelijk(H.kleur(0), [90, 200, 255]) && gelijk(H.kleur(1), [255, 40, 70]), JSON.stringify([H.kleur(0), H.kleur(1)]));
waar('buiten 0–1 en onzin: begrensd, geen NaN', gelijk(H.kleur(-3), H.kleur(0)) && gelijk(H.kleur(9), H.kleur(1)) && H.kleur('x').every(isFinite));
const zonderSprong = (() => { for (let m = 0; m < 1; m += 0.01) { const a = H.kleur(m), b = H.kleur(m + 0.01); if (a.some((v, i) => Math.abs(v - b[i]) > 20)) return m.toFixed(2); } return null; })();
waar('het verloop springt nergens (stap van 1% < 20 per kanaal)', zonderSprong === null, 'sprong bij ' + zonderSprong);

console.log('\n2. Stemming');
waar('stationair zonder gas is rustig (< 0,1)', H.stemming(800, 6800, 0) < 0.1, H.stemming(800, 6800, 0));
waar('op de rode streep met vol gas: 1', H.stemming(6800, 6800, 100) === 1);
waar('een lege plek maakt het scherm niet rood', H.stemming(null, 6800, null) === 0 && H.stemming(undefined, 6800, 'x') === 0);
waar('toeren telt zwaarder dan gas', H.stemming(6800, 6800, 0) > H.stemming(0, 6800, 100));
waar('modus loopt ECO → CRUISE → SPORT → MAX', [0, 0.4, 0.7, 0.9].map(H.modus).join(',') === 'ECO,CRUISE,SPORT,MAX');

console.log('\n3. Schakellampjes');
waar('onder 80% van het schakelpunt: niets', H.leds(1900, 2400).aan === 0, JSON.stringify(H.leds(1900, 2400)));
waar('halverwege 80%–100%: de helft', H.leds(2400 * 0.9, 2400).aan === 5, JSON.stringify(H.leds(2400 * 0.9, 2400)));
waar('op het schakelpunt: alle tien en knipperen', H.leds(2400, 2400).aan === 10 && H.leds(2400, 2400).max === true);
waar('net eronder: nog geen knipper', H.leds(2399, 2400).max === false);
waar('geen toerental: niets, geen knipper', H.leds(null, 2400).aan === 0 && !H.leds(null, 2400).max);
waar('geen schakelpunt: niets', H.leds(5000, null).aan === 0 && !H.leds(5000, null).max);
// Het doel: rustig het ecopunt, hard of in de hoogste versnelling de rode streep
waar('rustig: het ecopunt', H.schakelDoel(6800, 2400, false) === 2400);
waar('vol gas of hoge belasting: 90% van de rode streep', H.schakelDoel(6800, 2400, true) === 6800 * H.RACE_FRAC);
waar('geen hogere versnelling bekend: de rode streep', H.schakelDoel(6800, null, false) === 6800 * H.RACE_FRAC);
waar('een ecopunt voorbij de rode streep wordt de rode streep', H.schakelDoel(3000, 4000, false) === 3000 * H.RACE_FRAC);
// Bij gewoon rijden moet je ze zien: tot 31-10 gingen ze pas op 70% van de rode streep aan
waar('rustig optrekken naar 2300 tpm: de lampjes branden al', H.leds(2300, H.schakelDoel(6800, 2400, false)).aan >= 7);
waar('pijl omhoog op het schakelpunt', H.pijlOp(2400, 2400, false) === true);
waar('geen pijl eronder', H.pijlOp(2300, 2400, false) === false);
waar('geen pijl in de hoogste versnelling', H.pijlOp(6500, 6120, true) === false);
waar('geen pijl zonder toerental of punt', H.pijlOp(null, 2400, false) === false && H.pijlOp(3000, null, false) === false);

console.log('\n4. 0–100 vanuit stilstand');
function rit(stappen) { let st = { start: null }, tijd = null; stappen.forEach(s => { const r = H.nul100(st, s[0], s[1], s[2]); st = r.st; if (r.tijd !== null) tijd = r.tijd; }); return tijd; }
waar('stilstand, vol gas, 100 na 7,2 s', Math.abs(rit([[0, 0, 0], [0, 90, 1], [12, 100, 1.6], [100, 100, 8.2]]) - 7.2) < 1e-9);
waar('10 metingen per seconde: stil zonder gas, dan al rijdend vol gas — de klok loopt vanaf de stilstand', Math.abs(rit([[0, 5, 0], [3, 70, 0.1], [100, 100, 6.1]]) - 6.1) < 1e-9);
waar('pas na 2 s gas geven is geen launch', rit([[0, 0, 0], [20, 20, 1], [35, 90, 3], [100, 100, 9]]) === null);
waar('wegrijden en na 1,5 s het gas los: geen launch meer', rit([[0, 0, 0], [8, 80, 0.3], [40, 20, 1], [60, 20, 2.6], [100, 90, 9]]) === null);
waar('een schakelmoment (0,4 s van het gas) breekt hem niet af', Math.abs(rit([[0, 0, 0], [8, 90, 0.3], [50, 10, 3], [55, 95, 3.4], [100, 100, 7]]) - 7) < 1e-9);
waar('30 s zonder 100 te halen zet hem terug', rit([[0, 0, 0], [10, 90, 0.5], [99, 60, 31], [100, 60, 40]]) === null);
waar('al rijdend gas geven telt niet', rit([[30, 90, 0], [100, 100, 6]]) === null);
waar('stilstaan zonder gas zet hem terug', rit([[0, 90, 0], [0, 0, 5], [60, 30, 10], [100, 30, 20]]) === null);
waar('een ontbrekende snelheid start niets', rit([[null, 90, 0], [10, 90, 0.5], [100, 90, 4]]) === null);

console.log('\n4b. Scènes: één tegelijk, met een vaste voorrang');
const basis = { koel: 90, koelSt: 'ok', toeren: 2500, rood: 6800, snel: 80, versn: 0, stilS: 0, launch: false, cruiseS: 0 };
const sc = x => H.scene(Object.assign({}, basis, x));
waar('gewoon rijden', sc({}) === 'rijden');
waar('koelwater "danger" of ≥ 118 °C: alarm, boven alles', sc({ koelSt: 'danger', toeren: 6800, launch: true }) === 'alarm' && sc({ koel: 118 }) === 'alarm');
waar('op de rode streep: begrenzer, boven remmen en launch', sc({ toeren: 6700, versn: -12, launch: true }) === 'begrenzer');
waar('hard remmen (≥ 8 km/h/s) is remmen; zacht afremmen niet', sc({ versn: -9 }) === 'remmen' && sc({ versn: -5 }) === 'rijden');
waar('remmen in stilstand bestaat niet', sc({ versn: -20, snel: 2 }) !== 'remmen');
waar('0–100 loopt: launch, ook met koude motor', sc({ launch: true, koel: 40 }) === 'launch');
waar('koelwater onder 60 °C: koud, boven stil en cruise', sc({ koel: 45, stilS: 10, cruiseS: 20 }) === 'koud');
waar('een ontbrekende koelwatersensor is geen koude motor', sc({ koel: null }) === 'rijden');
waar('3 s stilstand: stil; 8 s gelijkmatig: cruise', sc({ stilS: 3.1 }) === 'stil' && sc({ cruiseS: 8.5 }) === 'cruise' && sc({ stilS: 2 }) === 'rijden');
waar('elke scène behalve rijden en remmen heeft een eigen tekst', ['alarm', 'begrenzer', 'launch', 'koud', 'stil', 'cruise'].every(k => typeof H.SCENE_TEKST[k] === 'string'));

console.log('\n4c. Versnelling, opwarming, nacht');
let vs = H.versnelling(null, 100, 0); vs = H.versnelling(vs, 90, 1); vs = H.versnelling(vs, 80, 2);
waar('twee keer 10 km/h per seconde minder: duidelijk remmen (≤ −7)', vs.a <= -7, vs.a);
// Uit de auto (28-10-2026): constant 80 km/h gaf ACCELERATIE en REMMEN van 0,4 g, om de halve
// seconde wisselend. Hele km/h en een onregelmatige tussentijd: 1 km/h in 50 ms is al 20 km/h/s.
function ruisRit() { let st = null, max = 0, tt = 0, k = 0;
  for (let i = 0; i < 100; i++) { tt += (i % 3 === 0) ? 0.05 : 0.125; const v = 80 + ((k++ % 4 === 1) ? 1 : 0) - ((k % 7 === 3) ? 1 : 0);
    st = H.versnelling(st, v, tt); if (tt > 1) max = Math.max(max, Math.abs(st.a)); }
  return max; }
waar('constant 80 km/h met afronding en onregelmatige metingen: onder 1,5 km/h/s (geen ACCELERATIE of REMMEN)', ruisRit() < 1.5, ruisRit());
let opt = null; for (let i = 0; i <= 20; i++) opt = H.versnelling(opt, 40 + i * 1, i * 0.1);
waar('echt optrekken (10 km/h per seconde, 10 Hz): na 2 s rond 10', Math.abs(opt.a - 10) < 1, opt.a);
waar('een gat van meer dan 3 s begint opnieuw', H.versnelling({ v: 0, t: 0, a: 0 }, 100, 10).a === 0);
waar('geen snelheid: geen versnelling', H.versnelling(vs, null, 3) === null);
waar('opwarming: 20 °C leeg, 70 °C vol, onbekend vol', H.warmte(20) === 0 && H.warmte(70) === 1 && H.warmte(null) === 1);
waar('nacht van 21 tot 6 uur', H.nacht(21) && H.nacht(3) && !H.nacht(6) && !H.nacht(20));

console.log('\n4d. De rit en het scorebord bij stilstand');
function rijd(stappen, rit) { stappen.forEach(x => { rit = H.ritBij(rit, x[0], x[1], x[2]); }); return rit; }
const minuut = []; for (let t = 0; t <= 60; t += 0.1) minuut.push([60, 2400, Math.round(t * 10) / 10]);
let r1 = rijd(minuut, null);
waar('een minuut 60 km/h is 1 km, en 60 s rijtijd', Math.abs(r1.km - 1) < 0.01 && Math.abs(r1.rijS - 60) < 0.2, JSON.stringify(r1));
const gat = H.ritBij(H.ritBij(null, 100, null, 0), 100, null, 10);
waar('een gat van 10 s zonder meting verzint geen kilometers', gat.km === 0, JSON.stringify(gat));
let rlos = null; for (let t = 0; t <= 60; t += 0.1) { const tt = Math.round(t * 10) / 10; rlos = H.ritBij(rlos, null, 2400, tt); rlos = H.ritBij(rlos, 60, null, tt + 0.05); }
waar('toeren en snelheid in losse metingen (zoals de bus ze geeft): toch 1 km', Math.abs(rlos.km - 1) < 0.02, JSON.stringify(rlos));
waar('top en max toeren', rijd([[40, 3000, 0], [130, 6100, 1], [90, 2500, 2]], null).top === 130 && rijd([[40, 3000, 0], [130, 6100, 1]], null).maxT === 6100);
waar('een ontbrekende snelheid of toeren telt niet als 0', rijd([[50, 2000, 0], [null, null, 0.1]], null).top === 50 && rijd([[50, 2000, 0], [null, null, 0.1]], null).maxT === 2000);
waar('na 15 min zonder meting begint een nieuwe rit', H.ritBij(r1, 0, 800, 60 + H.RIT_PAUZE_S + 1).km === 0);
waar('binnen 15 min (een stoplicht, een herbouw) telt hij door', H.ritBij(r1, 0, 800, 60.1).km > 0.99);
waar('stilstaan telt niet als rijtijd', H.ritBij(H.ritBij(r1, 0, 800, 60.1), 0, 800, 61).rijS - r1.rijS < 0.15);
waar('beste 0–100 is de snelste', H.ritNul100(H.ritNul100(r1, 7.4), 6.8).beste === 6.8 && H.ritNul100(H.ritNul100(r1, 6.8), 7.4).beste === 6.8);
waar('onder 0,3 km: geen scorebord (elke parkeermanoeuvre zou er een geven)', H.scorebord(rijd([[20, 1500, 0], [20, 1500, 1]], null)) === null && H.scorebord(null) === null);
const sb = H.scorebord(H.ritNul100(r1, 6.8)), sl = sb.map(x => x.sleutel).join(',');
waar('zes tegels: top, 0–100, max toeren, gemiddeld, afstand, rijtijd', sl === 'top,nul100,maxt,gem,km,tijd', sl);
waar('gemiddeld = afstand / rijtijd (60 km/h)', Math.abs(sb[3].waarde - 60) < 1, sb[3].waarde);
waar('zonder 0–100 geen lege tegel', H.scorebord(r1).every(x => x.sleutel !== 'nul100'));
waar('rijtijd als m:ss en u:mm:ss', H.duur(65) === '1:05' && H.duur(3725) === '1:02:05' && sb[5].tekst === '1:00');
waar('optellen begint op 0, eindigt op 1, en schiet niet door', H.telOp(0) === 0 && H.telOp(1) === 1 && H.telOp(2) === 1 && H.telOp(0.5) > 0.5);

console.log('\n4e. Verbruik in de rit');
const rv = []; for (let t = 0; t <= 60; t += 0.1) rv.push(Math.round(t * 10) / 10);
let rr = null; rv.forEach((t, i) => { rr = H.ritBij(rr, 60, 2400, t, i < 300 ? 5 : 9); });
waar('half om half 5 en 9 L/100: gemiddeld 7', Math.abs(H.scorebord(rr).filter(x => x.sleutel === 'verbruik')[0].waarde - 7) < 0.1);
let rz = null; rv.forEach(t => { rz = H.ritBij(rz, 60, 2400, t, null); });
waar('zonder verbruiksmeting geen verbruikstegel (en geen 0 L/100)', H.scorebord(rz).every(x => x.sleutel !== 'verbruik'));

console.log('\n4m. De mooie run: geen scorebord bij elk stoplicht');
{
  const stad = []; for (let t = 0; t <= 90; t += 0.1) stad.push([40, 2000, Math.round(t * 10) / 10]);   // 1 km in anderhalve minuut
  const rs = rijd(stad, null);
  waar('van stoplicht tot stoplicht (1 km, 90 s) is geen mooie run', !H.mooieRun(rs) && H.scorebord(rs) !== null, rs.km.toFixed(2) + ' km');
  const weg = []; for (let t = 0; t <= 200; t += 0.1) weg.push([90, 2600, Math.round(t * 10) / 10]);       // 5 km in ruim drie minuten
  waar('5 km in drie minuten wel', H.mooieRun(rijd(weg, null)));
  const kort = []; for (let t = 0; t <= 60; t += 0.1) kort.push([200, 5000, Math.round(t * 10) / 10]);     // 3,3 km maar één minuut
  waar('genoeg km maar te kort gereden: niet (beide drempels tellen)', !H.mooieRun(rijd(kort, null)));
  waar('een gemeten 0–100 maakt een korte run wel mooi', H.mooieRun(H.ritNul100(rs, 7.1)));
  waar('geen run: niet', !H.mooieRun(null));
  // Het verloop
  let p = null; for (let t = 0; t <= 10; t += 0.1) p = H.profielBij(p, 50, Math.round(t * 10) / 10);
  waar('elke 2 s één punt', p.pts.length === 6, p.pts.length);
  let lang = null; for (let t = 0; t <= 3600; t += 1) lang = H.profielBij(lang, t % 600 < 300 ? 50 : 100, t);
  waar('een uur past erin: nooit meer dan PROF_N punten, de stap groeit', lang.pts.length <= H.PROF_N && lang.dt > H.PROF_DT, lang.pts.length + ' punten, ' + lang.dt + ' s');
  waar('een ontbrekende snelheid is geen punt', H.profielBij(p, null, 99).pts.length === p.pts.length);
  const pad = H.profielPad([0, 50, 100], 200, 40).split(' ');
  waar('het pad loopt van links naar rechts, de top op 90% van de hoogte', pad[0] === '0.0,40.0' && pad[2] === '200.0,4.0', pad.join(' '));
  // De trend
  const teg = [{ sleutel: 'gem', waarde: 70, dec: 0 }, { sleutel: 'verbruik', waarde: 5, dec: 1 }, { sleutel: 'km', waarde: 9, dec: 1 }];
  const hist = [{ gem: 60, verbruik: 6 }, { gem: 60, verbruik: 6 }];
  const tr = H.trend(teg, hist);
  waar('sneller gemiddeld = beter, zuiniger = beter', tr.gem.stand === 'beter' && Math.abs(tr.gem.delta - 10) < 1e-9 && tr.verbruik.stand === 'beter' && tr.verbruik.delta < 0, JSON.stringify(tr));
  waar('meer verbruik = slechter', H.trend([{ sleutel: 'verbruik', waarde: 7 }], hist).verbruik.stand === 'slechter');
  waar('afstand krijgt geen trend (geen prestatie)', !tr.km);
  waar('één vorige run is geen gemiddelde: geen trend', Object.keys(H.trend(teg, hist.slice(0, 1))).length === 0);
  waar('binnen 2% heet gelijk', H.trend([{ sleutel: 'gem', waarde: 60.5 }], hist).gem.stand === 'gelijk');
  waar('runSamen bewaart alleen de vergelijkbare tegels', JSON.stringify(H.runSamen(teg)) === '{"gem":70,"verbruik":5}');
}

console.log('\n4f. Tank, power-up, G-spoor, merk');
waar('tank: vol, laag onder 25%, leeg onder 10%, onbekend null', H.tankStand(60) === 'vol' && H.tankStand(20) === 'laag' && H.tankStand(8) === 'leeg' && H.tankStand(null) === null);
function start(stappen) { let st = null, ev = null; stappen.forEach(x => { const r = H.accuStart(st, x[0], x[1], x[2]); st = r.st; if (r.start) ev = r.start; }); return ev; }
const ev = start([[12.6, 0, 0], [12.5, 0, 0.5], [10.2, 150, 1], [11.0, 250, 1.2], [13.9, 900, 1.5]]);
waar('starten: rust 12,6, dip 10,2, nu 13,9', ev && ev.rust === 12.6 && ev.dip === 10.2 && ev.nu === 13.9, JSON.stringify(ev));
waar('motor liep al: geen power-up', start([[14.1, 850, 0], [14.2, 870, 1]]) === null);
waar('zonder accuspanning geen power-up', start([[null, 0, 0], [null, 900, 1]]) === null);
waar('spanning van meer dan 4 s terug telt niet als dip', start([[9.5, 0, 0], [12.4, 0, 5], [12.0, 900, 6]]).dip === 12.0);
const gs = H.gSpoor([1, 0.5]);
waar('G-spoor: 24 punten, rechts sturen trekt het spoor naar links, verder weg naar het midden', gs.length === 48 && gs[0] < 0 && Math.abs(gs[2]) < Math.abs(gs[0]) && gs[47] > gs[1] && gs[46] === 0);
waar('G-spoor begrensd en zonder NaN', H.gSpoor([99, 'x', null]).every(isFinite) && H.gSpoor([99])[0] === H.gSpoor([1.2])[0]);
waar('BMW, Mercedes-Benz en VW worden herkend', H.merkThema('BMW').id === 'bmw' && H.merkThema('Mercedes-Benz').id === 'mercedes' && H.merkThema('VW').id === 'vw');
waar('onbekend of leeg merk: standaardkleuren', H.merkThema('Onbekend') === null && H.merkThema('') === null);
const th = H.merkThema('Ferrari');
waar('een merkpalet heeft dezelfde posities als STOPS en kleurt anders', th.stops.length === H.STOPS.length && th.stops.every((x, i) => x[0] === H.STOPS[i][0]) && !gelijk(H.kleur(0, th.stops), H.kleur(0)));
waar('elk merk heeft vijf kleuren', H.MERKEN.every(m => m.kl.length === 5 && m.kl.every(c => c.length === 3)));

console.log('\n4g. Het hoofdgetal: per scène wat er toe doet');
const tk = (v, dec) => P.tekst(v, dec);
const hx = x => Object.assign({ koel: 90, verbruik: 6.4, gas: 20, versn: 0, launchS: null, klok: '20:47' }, x);
waar('gewoon rijden: verbruik nu', JSON.stringify(H.held('rijden', hx({}), tk)) === JSON.stringify({ w: '6,4', e: 'L/100', l: 'VERBRUIK NU' }));
waar('cruise ook verbruik', H.held('cruise', hx({}), tk).l === 'VERBRUIK NU');
waar('hard optrekken (≥ 4 km/h/s): acceleratie in g', H.held('rijden', hx({ versn: 10 }), tk).l === 'ACCELERATIE' && H.held('rijden', hx({ versn: 10 }), tk).w === '0,28');
waar('rustig optrekken (2 km/h/s): gewoon verbruik', H.held('rijden', hx({ versn: 2 }), tk).l === 'VERBRUIK NU');
waar('zacht afremmen (−6 km/h/s, nog geen remscène) is geen acceleratie', H.held('rijden', hx({ versn: -6 }), tk).l === 'VERBRUIK NU');
waar('remmen: vertraging in g, positief', H.held('remmen', hx({ versn: -12 }), tk).w === '0,34' && H.held('remmen', hx({ versn: -12 }), tk).l === 'REMMEN');
waar('launch: de 0–100-timer', H.held('launch', hx({ launchS: 3.27, versn: 20 }), tk).w === '3,3');
waar('koude motor: koelwater met OPWARMEN', H.held('koud', hx({ koel: 41 }), tk).l === 'OPWARMEN' && H.held('koud', hx({ koel: 41 }), tk).w === '41');
waar('alarm gaat voor alles: koelwater', H.held('alarm', hx({ koel: 121, versn: 20 }), tk).l === 'KOELWATER');
waar('stilstand: de klok', H.held('stil', hx({}), tk).w === '20:47');
waar('geen verbruik: het gaspedaal; niets: een streepje', H.held('rijden', hx({ verbruik: null }), tk).l === 'GAS' && H.held('rijden', hx({ verbruik: null, gas: null }), tk).w === '—');

const hy = (x, vorig) => H.held('rijden', hx(x), tk, vorig).l;
waar('hysterese: boven 4 wordt het ACCELERATIE, op 3 blijft het staan, onder 2,5 terug naar verbruik',
  hy({ versn: 4.5 }) === 'ACCELERATIE' && hy({ versn: 3 }, 'ACCELERATIE') === 'ACCELERATIE' && hy({ versn: 3 }) === 'VERBRUIK NU' && hy({ versn: 2 }, 'ACCELERATIE') === 'VERBRUIK NU');

console.log('\n4j. Het midden: slim getal of de versnelling groot');
const slim = { w: '6,4', e: 'L/100', l: 'VERBRUIK NU' };
waar('stand Slim: het slimme getal', H.middenHeld('slim', 'rijden', '4', slim) === slim);
waar('stand Versnelling: de versnelling groot', JSON.stringify(H.middenHeld('versnelling', 'rijden', '4', slim)) === JSON.stringify({ w: '4', e: '', l: 'VERSNELLING' }));
waar('te heet koelwater gaat altijd voor', H.middenHeld('versnelling', 'alarm', '4', slim) === slim);
waar('versnelling onbekend: het slimme getal in plaats van een leeg midden', H.middenHeld('versnelling', 'rijden', '', slim) === slim);
waar('N in stilstand wordt groot getoond', H.middenHeld('versnelling', 'stil', 'N', slim).w === 'N');
waar('standaard Slim, onbekende opslag Slim', H.leesMidden() === 'slim');

console.log('\n4h. Achtergrond: Auto, rustige vormen, het knopje');
// Sinds 28-10-2026 geen Auto meer: "tunnel blijft actief bij selectie andere visual"
waar('de gekozen vorm is de vorm, ook in stilstand (geen tunnel uit zichzelf)', ['aurora', 'hartslag', 'pulsen', 'sterren', 'stil', 'tunnel'].every(v => H.actieveVorm(v) === v));
waar('onbekende keuze: Aurora', H.actieveVorm('kapot') === 'aurora' && H.actieveVorm(null) === 'aurora');
let vv = 'aurora', rond = [vv]; for (let i = 0; i < H.VORMEN.length; i++) { vv = H.volgendeVorm(vv); rond.push(vv); }
waar('het knopje gaat rond: aurora → hartslag → pulsen → sterren → stil → tunnel → aurora', rond.join(',') === 'aurora,hartslag,pulsen,sterren,stil,tunnel,aurora', rond.join(','));
waar('elke vorm heeft een tekst voor het knopje', H.VORMEN.every(v => typeof H.VORM_TEKST[v] === 'string'));
const rs = H.ringSchaal(-20, 60);
waar('ringschaal van een eigen sensor: vijf vakken van lo tot hi', rs.n === 5 && rs.lab(0) === -20 && rs.lab(5) === 60 && rs.dec === 0 && H.ringSchaal(0, 1.2).dec === 1);

console.log('\n4i. Een zelfgekozen sensor: eigen label, en geen gas of koelwater in de logica');
const keuzeInd = P.indeling('hyperlane', q => ['010C', '010D', '0105', '0149', '010E', '0142'].indexOf(q) >= 0, null,
  { keuze: { 'hyperlane/gas': '010E' }, defs: [{ pid: '010E', name: 'Ontstekingstijdstip', unit: '°', min: -64, max: 63.5 }] });
const kh = P.html('hyperlane', keuzeInd);
waar('ontsteking op de gasplek: het label zegt ONTSTEKIN… °, niet GAS %', /ONTSTEKIN… °/.test(kh) && !/GAS %/.test(kh), (kh.match(/<span>[^<]*<\/span>/g) || []).join(' '));
waar('de andere labels komen ook van de plek', /KOELW °C/.test(kh) && /ACCU V/.test(kh));
const e1 = H.echt({ doel: { gas: 12, koel: 90, snel: 50 }, verv: { gas: true } });
waar('echt(): een vervangen plek is null voor de logica, de rest blijft', e1.gas === null && e1.koel === 90 && e1.snel === 50);

console.log('\n4k. De Hyperlane-schil om Temperatuur en Emissie');
waar('toeren, snelheid, koelwater, accu, tank en verbruik krijgen hun rol', H.voedRol('010C') === 'toeren' && H.voedRol('010D') === 'snel' && H.voedRol('0105') === 'koel' && H.voedRol('0142') === 'accu' && H.voedRol('012F') === 'tank' && H.voedRol('CA03') === 'verbruik');
waar('een PID zonder rol in de schil doet niets', H.voedRol('0124') === null);
waar('gaspedaal gaat vóór gasklep: de klep vervangt het pedaal niet, andersom wel', H.voedRol('0111', '0149') === null && H.voedRol('0149', '0111') === 'gas' && H.voedRol('0111', undefined) === 'gas');
const schilInd = id => P.indeling(id, () => true);
waar('elk profiel behalve Hyperlane zelf draagt de schil (achtergrond en knopje)',
  ['temp', 'emissie', 'verbruik', 'motor', 'telemetrie'].every(id => /vhl-schil/.test(P.html(id, schilInd(id))) && /class="vhl-bg"/.test(P.html(id, schilInd(id))) && /class="vhl-vorm"/.test(P.html(id, schilInd(id)))) &&
  !/vhl-schil/.test(P.html('hyperlane', schilInd('hyperlane'))));
let gevoed = [];
C.PLHyperlane = Object.assign({}, H, { voed: (pid, v) => gevoed.push(pid + '=' + v), zet: () => {} });
P.bij('temp', schilInd('temp'), '010C', 2400, 'ok');
waar('bij() voedt de schil ook met een PID die niet op het scherm staat (toeren op Temperatuur)', gevoed.join(',') === '010C=2400', gevoed.join(','));
gevoed = []; P.bij('hyperlane', schilInd('hyperlane'), '0124', 1, 'ok');
waar('…en Hyperlane zelf voedt niet via de schil (die zet zijn plekken zelf)', gevoed.length === 0, gevoed.join(','));
C.PLHyperlane = H;

console.log('\n5. Het profiel');
const ind = P.indeling('hyperlane', q => ['010C', '010D', '0105', '0149'].indexOf(q) >= 0);
waar('toeren, snelheid, koelwater en gaspedaal uit de eigen keten', ind && ind.plekken.toeren === '010C' && ind.plekken.snel === '010D' && ind.plekken.koel === '0105' && ind.plekken.gas === '0149', JSON.stringify(ind && ind.plekken));
const dz = P.voor('hyperlane', 'diesel').plekken.filter(x => x.rol === 'toeren')[0];
waar('een diesel krijgt 6000 rpm, net als de basismeter (#393)', dz && dz.hi === 6000, dz && dz.hi);
waar('elke plek is soort hyper: bij() tekent niets zelf', P.zoek('hyperlane').plekken.every(x => x.soort === 'hyper'));
const h = P.html('hyperlane', ind);
waar('het vak is de Hyperlane-tekening', h.indexOf('vpf-hyper') >= 0 && h.indexOf('class="vhl-bg"') >= 0 && (h.match(/class="vhl-ring"/g) || []).length === 2);

console.log('\n6. bij() geeft de waarde door aan de lus');
let gezet = [];
C.PLHyperlane = Object.assign({}, H, { zet: (r, v, st, vv) => gezet.push(r + '=' + v + (st === 'danger' ? '!' : '') + (vv ? '*' : '')) });
C.document = { getElementById: () => null };
P.bij('hyperlane', ind, '010C', 3200, 'ok');
P.bij('hyperlane', ind, '010D', 88, 'ok');
waar('toeren en snelheid komen bij PLHyperlane.zet aan', gezet.join(',') === 'toeren=3200,snel=88', gezet.join(','));
P.bij('hyperlane', ind, '0105', 121, 'danger');
waar('het oordeel van het koelwater gaat mee (alarm)', gezet[2] === 'koel=121!', gezet.join(','));
gezet = [];
P.bij('hyperlane', keuzeInd, '010E', 12.5, 'ok');
waar('een zelfgekozen sensor gaat als vervangen naar de lus (alleen tonen)', gezet.join(',') === 'gas=12.5*', gezet.join(','));

console.log('\n4l. Hartslag: een ECG die niet stottert');
{
  // Na tien minuten rijden met een toerental dat elke 0,1 s een beetje
  // verspringt: elke slag die in beeld blijft schuift precies het papier mee.
  // Tot 28-10-2026 sprong de hele lijn bij elke meting (fase = T·v).
  let st = null, sprong = 0, maxDx = 0, t = 0;
  for (let i = 0; i < 36000; i++) {
    const hr = .3 + (Math.floor(i / 6) % 2 ? .05 : -.05);   // 10 Hz ruis van ±5%
    const voor = st ? st.x.slice() : [];
    st = H.polsBij(st, hr, 1 / 60, 1.1); t += 1 / 60;
    if (t > 600 && voor.length && st.x.length >= voor.length - 1) {
      const n = Math.min(voor.length, st.x.length);
      // vergelijk dezelfde slag: als er links een verdween, schuift de index één op
      const off = voor.length - n > 0 || voor[0] - st.x[0] > .5 ? 1 : 0;
      for (let k = 0; k + off < voor.length && k < st.x.length; k++) {
        const dx = voor[k + off] - st.x[k];
        if (Math.abs(dx - H.POLS_PAPIER / 60) > 1e-9) sprong++;
        maxDx = Math.max(maxDx, Math.abs(dx));
      }
    }
  }
  waar('na tien minuten met toerenruis schuift elke slag alleen met het papier mee', sprong === 0, sprong + ' sprongen, grootste stap ' + maxDx.toFixed(4));
  let p = H.polsBij(null, 0, 1 / 60, 1.1);
  waar('in rust een rustpols', Math.abs(p.bpm - H.POLS_RUST) < .01, p.bpm);
  for (let i = 0; i < 6; i++) p = H.polsBij(p, 1, 1 / 60, 1.1);
  waar('vol gas springt de pols niet: na 0,1 s nog geen 5 slagen erbij', p.bpm < H.POLS_RUST + 5, p.bpm.toFixed(1));
  for (let i = 0; i < 1200; i++) p = H.polsBij(p, 1, 1 / 60, 1.1);
  waar('na 20 s vol gas bijna de hoogste pols', p.bpm > H.POLS_MAX - 3, p.bpm.toFixed(1));
  const tel = hr => { let q = null; for (let i = 0; i < 3000; i++) q = H.polsBij(q, hr, 1 / 60, 1.1); return q.x.length; };
  waar('hogere toeren: de slagen liggen dichter op elkaar (meer in beeld)', tel(1) > tel(0), tel(0) + ' → ' + tel(1));
  waar('onbekend toerental telt als rust, geen NaN', H.polsBij(null, null, 1 / 60, 1).bpm === H.POLS_RUST && H.polsBij(null, NaN, 1 / 60, 1).bpm === H.POLS_RUST);
  const u = H.polsUniform(p);
  waar('de uniform heeft altijd POLS_N plekken, lege op -99', u.length === H.POLS_N && Array.from(u).slice(p.x.length).every(v => v === -99));
}

console.log('\n7. Elke klasse heeft CSS');
const klassen = [...new Set([...h.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(k => /^vhl-/.test(k)))];
const mist = klassen.filter(k => CSS.indexOf('.' + k) < 0);
waar('alle vhl-klassen uit html() staan in pidlane.css', mist.length === 0, mist.join(', '));
waar('het volle scherm vult het scherm met de tunnel', /body\.pl-vis-vol \.vpf-hyper \{[^}]*position:fixed/.test(CSS));

console.log('\n4n. Rustig in het midden (30-10-2026): niet zes keer per seconde wisselen');
{
  waar('vol gas: geen verbruik maar de acceleratie in g', H.held('rijden', hx({ gas: 95, versn: 3 }), tk).l === 'ACCELERATIE');
  waar('vol gas zonder versnellingsmeting: het gaspedaal, geen verbruik', H.held('rijden', hx({ gas: 95, versn: null }), tk).l === 'GAS');
  waar('net onder vol gas: gewoon verbruik', H.held('rijden', hx({ gas: H.VOLGAS - 1 }), tk).l === 'VERBRUIK NU');
  waar('een verbruik dat er al stond gaat bij vol gas meteen weg', H.heldWaarde('VERBRUIK NU', 'rijden', hx({ gas: 95 }), tk) === null && H.heldWaarde('VERBRUIK NU', 'rijden', hx({}), tk).w === '6,4');
  // Een rit in tikken van 0,15 s: de echte held() kiest, heldRustig() beslist.
  const DT = 0.15;
  const rij = (st, x, sc, sec) => { for (let t = 0; t < sec - 1e-9; t += DT) st = H.heldRustig(st, H.held(sc || 'rijden', hx(x), tk, st && st.l), st ? H.heldWaarde(st.l, sc || 'rijden', hx(x), tk) : null, DT); return st; };
  let st = rij(null, {}, 'rijden', 1);
  waar('begint met verbruik', st.l === 'VERBRUIK NU');
  st = rij(st, { versn: 6 }, 'rijden', 2);
  waar('twee seconden optrekken na een seconde verbruik: verbruik blijft staan', st.l === 'VERBRUIK NU', st.l);
  st = rij(st, { versn: 6 }, 'rijden', 3.2);
  waar('na zes seconden mag hij wisselen naar acceleratie', st.l === 'ACCELERATIE', st.l + ' na ' + st.t);
  st = rij(st, { versn: 1 }, 'rijden', 2);
  waar('en blijft daarna ook weer even op acceleratie', st.l === 'ACCELERATIE');
  waar('te heet koelwater wacht niet', rij(st, { koel: 121 }, 'alarm', DT).l === 'KOELWATER');
  waar('de 0–100-timer wacht niet', rij(rij(null, {}, 'rijden', 1), { launchS: 0.4, versn: 15 }, 'launch', DT).l === '0–100');
  let v = rij(null, {}, 'rijden', 0.3), w0 = v.w;
  v = H.heldRustig(v, H.held('rijden', hx({ verbruik: 9.9 }), tk), H.heldWaarde(v.l, 'rijden', hx({ verbruik: 9.9 }), tk), DT);
  waar('het verbruik krijgt niet elke tik een nieuw getal', v.w === w0, v.w + ' na ' + v.wt);
  v = rij(v, { verbruik: 9.9 }, 'rijden', 1);
  waar('wel binnen een seconde', v.w === '9,9', v.w);
  let a = rij(rij(null, {}, 'rijden', 7), { versn: 8 }, 'rijden', DT);
  a = rij(a, { versn: 12 }, 'rijden', DT);
  waar('de acceleratie loopt wel elke tik mee', a.l === 'ACCELERATIE' && a.w === tk(12 / 3.6 / 9.81, 2), a.l + ' ' + a.w);

  const gr = (st, g, sec) => { for (let t = 0; t < sec - 1e-9; t += DT) st = H.gearRustig(st, g, DT); return st; };
  let g = gr(null, '3', DT);
  waar('de eerste versnelling staat er meteen', g.toon === '3');
  g = gr(g, '4', DT);
  waar('een andere versnelling staat er meteen (PLGear wacht al; 31-10-2026)', g.toon === '4');
  g = gr(g, '', 8);
  waar('acht seconden onbekend: de laatste versnelling blijft staan', g.toon === '4');
  g = gr(g, '', H.GEAR_LEEG_S - 8 + DT);
  waar('na ' + H.GEAR_LEEG_S + ' s onbekend: het slimme getal', g.toon === '');
  g = gr(g, '5', 1);
  waar('één seconde weer bekend: nog niet terug', g.toon === '');
  g = gr(g, '5', H.GEAR_TERUG_S);
  waar('na ' + H.GEAR_TERUG_S + ' s stabiel komt de versnelling terug', g.toon === '5');
}

console.log('\n13. De stand: Auto, Eco, Sport, Cruise (01-11-2026)');
{
  // Een eigen vm: de stand staat in localStorage en in de module.
  const K = laad(), Hk = K.PLHyperlane, Pk = K.PLVisProfiel;
  const heeft = q => ['010C', '010D', '0105', '0149', '0142', '0104', '015C', '010F', '0170'].indexOf(q) >= 0;
  const strook = h => (h.match(/<div class="vhl-strook">([\s\S]*?)<\/div><\/div>/) || [, ''])[1].match(/id="vpf-p-[a-z]+"/g).map(x => x.slice(10, -1)).join(',');
  waar('zonder keuze: Auto, met de strook van altijd (koel, gas, accu)', Hk.stand() === 'auto' && strook(Pk.html('hyperlane', Pk.indeling('hyperlane', heeft))) === 'koel,gas,accu');
  waar('onzin wordt niet bewaard', Hk.zetStand('turbo') === false && Hk.stand() === 'auto');
  const per = {};
  Hk.STANDEN.forEach(st => {
    Hk.zetStand(st);
    const i = Pk.indeling('hyperlane', heeft), d = Pk.indeling('hyperlane', heeft, 'diesel');
    per[st] = { i: i, strook: strook(Pk.html('hyperlane', i)), diesel: strook(Pk.html('hyperlane', d)), ketens: Pk.ketens('hyperlane', null, {}).map(k => k[0]) };
  });
  waar('de keuze wordt bewaard', K.localStorage.getItem(Hk.STAND_SLEUTEL) === 'cruise');
  waar('Eco: gas, belasting, koelwater', per.eco.strook === 'gas,last,koel', per.eco.strook);
  waar('Sport: olie, inlaat, belasting', per.sport.strook === 'olie,inlaat,last', per.sport.strook);
  waar('Sport op een diesel: laaddruk in plaats van inlaat', per.sport.diesel === 'olie,laad,last', per.sport.diesel);
  waar('Cruise: koelwater, olie, accu', per.cruise.strook === 'koel,olie,accu', per.cruise.strook);
  waar('de stand zit in de indeling (de handtekening van Slim visueel ziet hem)', Hk.STANDEN.every(st => per[st].i.stand === st));
  // Veiligheid: alarm, 0–100 en power-up lezen koelwater, gas en accu — in élke stand.
  waar('koelwater, gas en accu staan in elke stand in de indeling', Hk.STANDEN.every(st => per[st].i.plekken.koel === '0105' && per[st].i.plekken.gas === '0149' && per[st].i.plekken.accu === '0142'));
  waar('trage bus: Eco zet de olie niet aan, Sport wel', per.eco.ketens.indexOf('015C') < 0 && per.sport.ketens.indexOf('015C') >= 0, JSON.stringify(per.eco.ketens));
  waar('Auto vraagt niets extra: geen belasting, olie of inlaat', ['0104', '015C', '010F'].every(q => per.auto.ketens.indexOf(q) < 0));
  Hk.zetStand('eco');
  const ruim = Pk.ketens('hyperlane', null, { ruim: true }).map(k => k[0]);
  waar('snelle bus (ruim): de sensoren van álle standen, ook in Eco', ['0104', '015C', '010F'].every(q => ruim.indexOf(q) >= 0), JSON.stringify(ruim));
  waar('het menu kent vier standen en vinkt de gekozen aan', (Pk.html('hyperlane', Pk.indeling('hyperlane', heeft)).match(/data-stand="/g) || []).length === 4
    && /data-stand="eco" aria-checked="true"/.test(Pk.html('hyperlane', Pk.indeling('hyperlane', heeft))));
  // Het label
  waar('Auto: het label van de scène, zoals altijd', Hk.standLabel('stil', 'auto', 'STIL') === 'STIL');
  waar('gekozen stand: het label blijft staan bij stil, remmen, koud en cruise', ['stil', 'remmen', 'koud', 'cruise', 'rijden'].every(sc => Hk.standLabel(sc, 'eco', 'X') === 'ECO'));
  waar('Auto: de rijstijl krijgt AUTO ervoor, zodat hij niet op een gekozen stand lijkt', ['ECO', 'CRUISE', 'SPORT', 'MAX'].every(m => Hk.standLabel('rijden', 'auto', m) === 'AUTO · ' + m)
    && Hk.standLabel('cruise', 'auto', 'CRUISE · ZEN') === 'CRUISE · ZEN');
  waar('alarm, begrenzer en 0–100 gaan altijd voor', ['alarm', 'begrenzer', 'launch'].every(sc => Hk.standLabel(sc, 'sport', 'X') === 'X'));
  // Het midden in Sport: geen verbruik
  const tk = (v, d) => Number(v).toFixed(d).replace('.', ',');
  const x = { koel: 90, verbruik: 6.4, gas: 30, versn: 0, launchS: null, klok: '12:00' };
  waar('Sport: gas in het midden in plaats van verbruik', Hk.held('rijden', x, tk, '', 'sport').l === 'GAS' && Hk.held('rijden', x, tk, '', 'eco').l === 'VERBRUIK NU');
  waar('Sport: een verbruik dat er stond gaat weg', Hk.heldWaarde('VERBRUIK NU', 'rijden', x, tk, 'sport') === null && Hk.heldWaarde('VERBRUIK NU', 'rijden', x, tk, 'eco') !== null);
  // Tegenproeven: de fout die hier gevangen hoort te worden
  const BR = lees('pidlane-visprofiel.js'), BH = lees('pidlane-hyperlane.js');
  const laadMet = (f, bron) => { const c = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {} } }; c.window = c; vm.createContext(c);
    ['pidlane-toon.js', 'pidlane-hyperlane.js', 'pidlane-visprofiel.js'].forEach(n => vm.runInContext(n === f ? bron : lees(n), c, { filename: n })); return c; };
  const T1 = laadMet('pidlane-visprofiel.js', BR.replace("const st=stand || 'auto', hier=p.plekken.filter(function(x){ return inStand(x, st); });", "const hier=p.plekken;")).PLVisProfiel;
  waar('tegenproef: zonder standfilter vraagt Auto ook olie en belasting', ['0104', '015C'].every(q => T1.ketens('hyperlane', null, {}).map(k => k[0]).indexOf(q) >= 0));
  const T2 = laadMet('pidlane-hyperlane.js', BH.replace("  if(STAND_TEKST[st] && !STAND_VOORRANG[sc]) return STAND_TEKST[st];", "  if(STAND_TEKST[st]) return STAND_TEKST[st];")).PLHyperlane;
  waar('tegenproef: zonder voorrang verdwijnt het koelwateralarm achter SPORT', T2.standLabel('alarm', 'sport', 'KOELWATER 120°') === 'SPORT');
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'ok: ' + ok + ' van ' + ok));
process.exit(fout ? 1 : 0);
