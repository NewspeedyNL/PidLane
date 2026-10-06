// ══════════════════════════════════════════════════════════════════
// test-telemetrie.js — helling en kanteling uit pidlane-telemetrie.js (05-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE module in een vm-context, stuurt deviceorientation-events
// in en toetst de hoeken, de nulstand en de keuzelijst-poort.
// De bedrading (keuzelijst, pollus, sendCmd) toetst bproef-telemetrie.js.
//
// Wat hier rood hoort te worden:
//   • helling en kanteling die van plek wisselen, of een omgekeerd teken;
//   • een kompasdraai (alpha, een bocht) die als kanteling leest;
//   • Nulstellen dat de scheve houder niet wegrekent;
//   • de categorie in de keuzelijst op een toestel zonder sensor;
//   • een waarde op de tegel terwijl de sensor al seconden zweeg;
//   • een meting die meetelt (updPID) terwijl het toestel niet vast zit:
//     zonder nulstand, verschoven (op schoot, in een vakje), wiebelend, of
//     nog geen 5 s stil — en een bocht (gieren) die als wiebel telt.
//
// Draaien vanuit public/:  node test-telemetrie.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

let klok = 1000000;
const luisteraars = {}, opslag = {}, updates = [], getoond = [], kaarten = {};
function kaart(id){
  if (!kaarten[id]) { const c = new Set(); kaarten[id] = { title: '', classList: { contains: k => c.has(k), add: k => c.add(k), remove: k => c.delete(k),
    toggle: (k, aan) => { if (aan) c.add(k); else c.delete(k); } }, removeAttribute(){ this.title = ''; } }; }
  return kaarten[id];
}
const ctx = { console: { log(){}, warn(){} }, Math, JSON, Object, Array, String, Number, Set, isFinite, Error,
  Date: { now: () => klok },
  ALL_PID_DEFS: { '010C': { name: 'Toerental' } },
  addEventListener: (t, f) => { luisteraars[t] = f; },
  localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } },
  activePIDs: new Set(['TL01', 'TL02']),
  pidHist: {}, pidVals: {},
  updPID: (pid, v) => updates.push([pid, v]),
  applyG: (pid, v) => getoond.push([pid, v]),
  document: { getElementById: id => kaart(id) } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-telemetrie.js'), 'utf8'), ctx, { filename: 'pidlane-telemetrie.js' });
const T = ctx.PLTelemetrie;
if (!T) throw new Error('PLTelemetrie niet gezet — anker weg?');
const ev = luisteraars.deviceorientation;
if (typeof ev !== 'function') throw new Error('geen deviceorientation-luisteraar — anker weg?');
// Een stilstaande stand: lang genoeg herhalen dat het filter hem bereikt.
function stand(beta, gamma, alpha){ for (let i = 0; i < 100; i++){ klok += 50; ev({ alpha: alpha || 0, beta, gamma }); } }
const bijna = (a, b) => Math.abs(a - b) <= 0.3;

console.log('\n— zonder sensor —');
ok(T.defs().length === 0, 'geen event: geen Telemetrie in de keuzelijst');
ev({ alpha: null, beta: null, gamma: null });
ok(T.defs().length === 0, 'een event zónder beta/gamma telt niet (desktop-Chrome stuurt zo een leeg event)');
T.tik();
ok(updates.length === 0, 'geen meting: geen tegelwaarde (geen 0°)');

console.log('\n— de keuzelijst —');
stand(90, 0);
const d = T.defs();
ok(d.length === 2 && d.every(x => x.cat === 'Telemetrie'), 'met sensor: TL01 en TL02 onder Telemetrie', d.map(x => x.pid + ':' + x.cat));
ok(ctx.ALL_PID_DEFS.TL01 && ctx.ALL_PID_DEFS.TL01.unit === '°', 'TL01 staat in ALL_PID_DEFS (getPidDef, rapport)');
ok(ctx.plIsTelemetrie('tl02') && !ctx.plIsTelemetrie('CA01') && !ctx.plIsTelemetrie('010C'), 'plIsTelemetrie kent alleen TL..');

console.log('\n— rechtop in de houder, scherm naar de bestuurder —');
let h = T.nu();
ok(h && bijna(h.helling, 0) && bijna(h.kanteling, 0), 'recht: 0° en 0°', h);
stand(100, 0);                     // bovenkant naar de bestuurder = neus omhoog
h = T.nu();
ok(bijna(h.helling, 10) && bijna(h.kanteling, 0), 'neus 10° omhoog: helling +10, kanteling 0', h);
stand(90, 0);
stand(90, 0, 90);                  // een bocht van 90°: alleen het kompas draait
h = T.nu();
ok(bijna(h.helling, 0) && bijna(h.kanteling, 0), 'een bocht (alpha) is geen kanteling', h);

console.log('\n— plat op de console, bovenkant vooruit —');
stand(0, 10);                      // rechterkant van het toestel omlaag
h = T.nu();
ok(bijna(h.kanteling, 10) && bijna(h.helling, 0), 'rechts 10° omlaag: kanteling +10, helling 0', h);
stand(10, 0);                      // bovenkant omhoog = neus omhoog
h = T.nu();
ok(bijna(h.helling, 10) && bijna(h.kanteling, 0), 'plat, neus 10° omhoog: helling +10', h);

console.log('\n— nulstellen: een scheve houder —');
stand(70, 5);                      // houder staat 20° achterover en 5° scheef
h = T.nu();
ok(!bijna(h.helling, 0), 'vóór nulstellen: de scheve houder is zichtbaar', h);
ok(T.nulstellen() === true && T.genuld(), 'nulstellen lukt met een verse meting');
ok(opslag.pl_telemetrie_nul && JSON.parse(opslag.pl_telemetrie_nul).length === 3, 'de nulstand is bewaard');
h = T.nu();
ok(bijna(h.helling, 0) && bijna(h.kanteling, 0), 'na nulstellen: 0° en 0°', h);
stand(80, 5);
h = T.nu();
ok(Math.abs(h.helling - 10) < 0.5 && Math.abs(h.kanteling) < 1, 'daarna 10° naar de bestuurder: helling ≈ +10', h);

console.log('\n— de tik: alleen meetellen als hij vast zit —');
updates.length = 0; getoond.length = 0;
T.tik();
ok(updates.length === 0 && getoond.length === 2, 'net verdraaid (80° na een nulstand op 70°): nog geen 5 s stil, dus alleen tonen', { updates, getoond, h: T.houderNu() });
ok(T.houderNu().reden === 'wacht' && kaart('gc-TL01').classList.contains('los'), 'reden "wacht", en de tegel is dof (los)', T.houderNu());
stand(80, 5);
updates.length = 0; getoond.length = 0;
T.tik();
ok(updates.length === 2 && updates[0][0] === 'TL01' && updates[1][0] === 'TL02', 'na 5 s stil in de houder: TL01 en TL02 tellen mee', { updates, h: T.houderNu() });
ok(!kaart('gc-TL01').classList.contains('los') && kaart('gc-TL01').title === '', 'en de tegel is niet meer dof, zonder tooltip');
updates.length = 0;
klok += 5000;
T.tik();
ok(updates.length === 0 && T.nu() === null, 'sensor 5 s stil: geen waarde meer (de tegel wordt oud, niet fout)', updates);
ok(T.nulstellen() === false, 'nulstellen zonder verse meting weigert');

console.log('\n— op schoot of in een vakje: telt niet mee —');
stand(90, 0); T.nulstellen(); stand(90, 0); stand(90, 0);
ok(T.houderNu().vast, 'rechtop genuld en 5 s stil: vast', T.houderNu());
stand(30, 10);                     // plat op schoot: 60° anders dan de nulstand
updates.length = 0; getoond.length = 0;
T.tik();
ok(T.houderNu().reden === 'verschoven' && updates.length === 0 && getoond.length === 2, 'verschoven: geen updPID, wel dof getoond', { h: T.houderNu(), updates });
ok(/Telt niet mee/.test(kaart('gc-TL02').title), 'de tooltip zegt waarom', kaart('gc-TL02').title);
stand(90, 0); stand(90, 0);
ok(T.houderNu().vast, 'terug in de houder en 5 s stil: telt weer mee', T.houderNu());
// Wiebelen binnen de 15°: een telefoon op schoot die met de benen meebeweegt.
updates.length = 0;
let ooitVast = false, wiebelMax = 0;
for (let i = 0; i < 200; i++){
  klok += 50; ev({ alpha: 0, beta: 90 + 8 * Math.sin(i / 8), gamma: 0 }); T.tik();
  if (i === 19) updates.length = 0;     // de eerste seconde: het filter moet de wiebel nog zien
  const hz = T.houderNu(); if (i >= 20 && hz.vast) ooitVast = true; wiebelMax = Math.max(wiebelMax, hz.wiebel || 0);
}
ok(!ooitVast && updates.length === 0, 'een schommeling van ±8° in 2,5 s (op schoot): na de eerste seconde 9 s lang niet vast, niets telt mee', { wiebelMax, updates: updates.length });
ok(T.stats().houder.geweerd >= 6, 'het sessiebewijs telt de geweerde metingen', T.stats().houder);

console.log('\n— de pure regel —');
const H = o => T.houder(Object.assign({ vers: true, genuld: true, afwijking: 3, wiebel: 2, okMs: 6000 }, o));
ok(H({}).vast, 'alles goed: vast');
ok(H({ genuld: false }).reden === 'geen-nulstand', 'zonder nulstand nooit vast — ook niet als de rest klopt');
ok(H({ afwijking: 16 }).reden === 'verschoven' && H({ afwijking: 15 }).vast, 'afwijking: 15° mag, 16° niet');
ok(H({ wiebel: 9 }).reden === 'wiebelt' && H({ wiebel: 8 }).vast && H({ wiebel: null }).reden === 'wiebelt', 'wiebel boven 8°/s of onbekend: niet vast');
ok(H({ okMs: 4999 }).reden === 'wacht' && H({ okMs: 5000 }).vast, 'rust: 5 s');
ok(H({ vers: false }).reden === 'geen-sensor', 'zonder verse meting: niet vast');
ok(T.houder({ vers: true, genuld: true, afwijking: null, wiebel: 2, okMs: 9000 }).vast === false, 'afwijking onbekend telt niet als goed');

console.log('\n— trillingen —');
stand(90, 0);
T.nulstellen();
for (let i = 0; i < 40; i++){ klok += 50; ev({ alpha: 0, beta: 90 + (i % 2 ? 6 : -6), gamma: 0 }); }
h = T.nu();
ok(Math.abs(h.helling) < 2, 'een trilling van ±6° middelt uit tot onder 2°', h);

console.log('\n— devicemotion: de versnelling van de auto eraf (#404) —');
const M = luisteraars.devicemotion;
ok(typeof M === 'function', 'er luistert iets naar devicemotion');
ok(Math.abs(T.lengteA([{ t: 0, v: 36 }, { t: 1000, v: 54 }], 1000) - 5) < 1e-9, 'lengteA: 36 → 54 km/u in 1 s = 5 m/s²');
ok(T.lengteA([{ t: 0, v: 36 }, { t: 200, v: 54 }], 200) === null, 'lengteA: korter dan 0,5 s is geen afgeleide');
// rijden: n stappen van 50 ms; ag in toestelassen; snelheid verandert met a m/s²; gier in rad/s om de y-as
function rij(n, ag, kmh, a, gier, wiebel){
  ctx.pidHist['010D'] = [];
  const t0 = klok;
  for (let i = 0; i < n; i++){
    klok += 50;
    const v = kmh + a * 3.6 * (klok - t0) / 1000;
    if (i % 5 === 0) ctx.pidHist['010D'].push({ t: klok, v });
    M({ accelerationIncludingGravity: { x: ag[0], y: ag[1], z: ag[2] }, rotationRate: { alpha: 0, beta: (wiebel || 0) * (i % 40 < 20 ? 1 : -1), gamma: (gier || 0) * 180 / Math.PI } });
  }
}
const G = 9.81;
rij(300, [0, G, 0], 0, 0);
const sitVoor = T.stats().situatie.hardRemmen;
rij(300, [0, G, 4], 80, -4, 0, 40);
ok(T.stats().situatie.hardRemmen === sitVoor, 'hard remmen met een telefoon die los wiebelt: telt niet als rijsituatie', T.stats().situatie);
rij(300, [0, G, 0], 0, 0);
T.nulstellen();
rij(100, [0, G, 0], 0, 0);
h = T.nu();
ok(bijna(h.helling, 0) && bijna(h.kanteling, 0), 'rechtop en stil, genuld: 0° en 0°', h);
rij(300, [0, G, 4], 80, -4);                  // remmen met 4 m/s², vooruit = −z
h = T.nu();
ok(Math.abs(h.helling) < 1 && Math.abs(h.kanteling) < 1, 'hard remmen op vlakke weg: geen helling (zonder correctie −22°)', h);
const gr = T.gNu();
ok(gr && Math.abs(gr.lengte + 0.41) < 0.03 && Math.abs(gr.dwars) < 0.03, 'Lengte-G bij 4 m/s² remmen: −0,41 g (G-cirkel)', gr);
ok(T.defs().length === 4, 'met devicemotion ook TL03/TL04 in de keuzelijst', T.defs().map(x => x.pid));
ok(T.stats().situatie.hardRemmen >= 1, 'en het telt als hard remmen', T.stats().situatie);
// 0,21 en niet 0,2: precies 4 m/s² ligt op de drempel en kantelt op een afrondingsfout van de nulstand.
rij(300, [-4.2, G, 0], 72, 0, 0.21);           // linksaf, 20 m/s × 0,21 rad/s = 4,2 m/s² naar links
h = T.nu();
ok(Math.abs(h.kanteling) < 1 && Math.abs(h.helling) < 1, 'een bocht op vlakke weg: geen kanteling (zonder correctie +22°)', h);
const gb = T.gNu();
ok(gb && Math.abs(gb.dwars + 0.43) < 0.03, 'Zij-G linksaf: −0,43 g (naar links)', gb);
ok(T.stats().situatie.scherpeBocht >= 1, 'en het telt als een scherpe bocht', T.stats().situatie);
rij(200, [-3.9, G, 0], 20, 0, 0.7);
ok(T.houderNu().vast, 'een rotonde (20 km/u, 0,7 rad/s gieren = 40°/s): de houder blijft vast — gieren is geen wiebel', T.houderNu());
rij(200, [0, G, 0], 72, 0, 0, 40);
ok(T.houderNu().reden === 'wiebelt', 'maar 40°/s om de dwarsas, een seconde heen en terug: wiebelt', T.houderNu());
rij(20, [0, G, 0], 72, 0, 0, 0);
ok(!T.houderNu().vast, 'en vlak daarna nog niet vast: eerst 5 s rust', T.houderNu());
const hel = 6 * Math.PI / 180;
rij(300, [0, G * Math.cos(hel), -G * Math.sin(hel)], 50, 0);   // 6° klim, constante snelheid
h = T.nu();
ok(Math.abs(h.helling - 6) < 1, 'een echte klim van 6° blijft 6°', h);

console.log('\n— vooruit leren: een houder die 30° gedraaid staat —');
const voor = [-Math.sin(Math.PI / 6), 0, -Math.cos(Math.PI / 6)];
ok(T.stats().voorGeleerd, 'het rechtuit remmen hierboven heeft vooruit al geleerd');
rij(300, [0, G, 0], 0, 0);
T.nulstellen();
ok(!T.stats().voorGeleerd, 'nulstellen (nieuwe houder) leert vooruit opnieuw');
for (let k = 0; k < 6; k++){
  const a = k % 2 ? 2.5 : -2.5;
  rij(60, [a * voor[0], G, a * voor[2]], 60, a);
}
ok(T.stats().voorGeleerd, 'na zes keer optrekken en remmen: geleerd', T.stats());
rij(300, [-3 * voor[0], G, -3 * voor[2]], 80, -3);
h = T.nu();
ok(Math.abs(h.helling) < 1 && Math.abs(h.kanteling) < 1, 'remmen in de gedraaide houder: geen helling en geen kanteling', h);

console.log('\n— rijsituatie (pure regel) —');
ok(T.situatie({ helling: 6, belasting: 70, aLang: 0 }).indexOf('klim') >= 0, 'helling omhoog, belasting hoog, geen snelheidswinst: klim');
ok(T.situatie({ helling: 6, belasting: 70, aLang: 1.5 }).indexOf('klim') < 0, 'maar met snelheidswinst is het optrekken, geen klim');
ok(T.situatie({ helling: -6, belasting: 10, aLang: 0.3 }).indexOf('daal') >= 0, 'helling omlaag zonder belasting: dalen');
ok(T.situatie({ helling: -6, aLang: 0.3 }).indexOf('daal') < 0, 'zonder belasting gemeten: geen oordeel over dalen');

console.log('\n' + (fouten ? 'test-telemetrie: ' + fouten + ' van ' + n + ' FOUT' : 'test-telemetrie: ' + n + ' ok'));
process.exit(fouten ? 1 : 0);
