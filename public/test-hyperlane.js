// ══════════════════════════════════════════════════════════════════
// test-hyperlane.js — Hyperlane, de blikvanger van Slim visueel (27-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-hyperlane.js en pidlane-visprofiel.js in een vm en
// toetst wat zonder scherm te toetsen is:
//   • de kleur loopt van ijsblauw naar rood en springt nergens buiten de stops;
//   • de stemming: rustig = 0, een lege plek maakt het scherm niet rood,
//     toeren telt zwaarder dan gas;
//   • de schakellampjes beginnen op 70% van de rode streep, de begrenzer knippert;
//   • 0–100 meet alleen vanuit stilstand met gas, en stilstaan zet hem terug;
//   • de scène (alarm, begrenzer, remmen, launch, koud, stil, cruise) en hun voorrang;
//   • de rit (afstand, top, rijtijd, beste 0–100) en de tegels van het scorebord;
//   • het profiel kiest de juiste PIDs en een diesel krijgt 6000 rpm;
//   • elke klasse die de tekening gebruikt heeft regels in pidlane.css.
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
waar('onder 70% van de rode streep: niets', H.leds(4000, 6800).aan === 0, JSON.stringify(H.leds(4000, 6800)));
waar('halverwege 70%–100%: de helft', H.leds(6800 * 0.85, 6800).aan === 5, JSON.stringify(H.leds(6800 * 0.85, 6800)));
waar('op de begrenzer: alle tien en knipperen', H.leds(6800, 6800).aan === 10 && H.leds(6800, 6800).max === true);
waar('geen toerental: niets, geen knipper', H.leds(null, 6800).aan === 0 && !H.leds(null, 6800).max);

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

console.log('\n4h. Achtergrond: Auto, rustige vormen, het knopje');
waar('Auto: in stilstand en tot 10 km/h de tunnel, rijdend de gekozen vorm', H.actieveVorm('aurora', 0) === 'tunnel' && H.actieveVorm('aurora', 9) === 'tunnel' && H.actieveVorm('aurora', 50) === 'aurora' && H.actieveVorm('hartslag', 80) === 'hartslag');
waar('onbekende snelheid telt als rijden: geen stromende tunnel op de snelweg', H.actieveVorm('sterren', null) === 'sterren');
waar('Tunnel is altijd tunnel, Stil nooit iets', H.actieveVorm('tunnel', 120) === 'tunnel' && H.actieveVorm('stil', 0) === 'stil');
waar('onbekende keuze: Aurora', H.actieveVorm('kapot', 80) === 'aurora');
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

console.log('\n7. Elke klasse heeft CSS');
const klassen = [...new Set([...h.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(k => /^vhl-/.test(k)))];
const mist = klassen.filter(k => CSS.indexOf('.' + k) < 0);
waar('alle vhl-klassen uit html() staan in pidlane.css', mist.length === 0, mist.join(', '));
waar('het volle scherm vult het scherm met de tunnel', /body\.pl-vis-vol \.vpf-hyper \{[^}]*position:fixed/.test(CSS));

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'ok: ' + ok + ' van ' + ok));
process.exit(fout ? 1 : 0);
