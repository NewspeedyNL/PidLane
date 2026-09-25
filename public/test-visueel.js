// ══════════════════════════════════════════════════════════════════
// test-visueel.js — Slim visueel: een vaste meter die de getallen niet
// kunnen laten ontsporen
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Een eerdere poging tekende de meter opnieuw uit de meetwaarden. Dan vallen
// streepjes buiten de ring en staan cijfers scheef zodra er iets onverwachts
// binnenkomt. pidlane-visueel.js draait dat om: een vaste wijzerplaat uit de
// constanten in G, en de meetwaarden sturen alleen nog een hoek, een
// vulling (0–100) en een tekst in een vast vak. Deze test bewaakt beide
// helften:
//
//   1. DE TEKENING — rekent op de getallen in G na dat elke laag zijn eigen
//      ring heeft, dat alle streepjes en cijfers binnen de ring blijven en dat
//      geen enkel tekstvak of icoon een ander raakt.
//   2. DE AANSTURING — stand() komt voor geen enkele invoer buiten zijn
//      grenzen: niet voor 99999 rpm, niet voor −50, niet voor NaN of tekst.
//   3. DE KEUZE — welke PID waar staat, de terugval bij een dode of verborgen
//      PID, de turbo die één kant op beslist, het gemeten tempo dat een trage
//      PID naar de rand stuurt, en het oud-worden van een antwoord.
//   4. HET TEMPO — pidPollInterval() uit de echte bron remt de snelle PIDs die
//      niet op de meter staan, en niet de PIDs die er wél op staan.
//
// In de browser meet bproef-visueel.js hetzelfde nog eens met de echte
// lettertypes; hier gaat het om de getallen, want die bepalen de tekening.
//
// Draaien vanuit public/:  node test-visueel.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
function lees(f) { return fs.readFileSync(f, 'utf8'); }
function knip(bron, van, tot, wat) {
  const i = bron.indexOf(van), j = bron.indexOf(tot, i);
  if (i < 0 || j < 0) throw new Error(wat + ' niet te knippen — is het anker hernoemd?');
  return bron.slice(i, j);
}

// ── de omgeving: de echte data, de echte module, nep alleen wat eromheen hoort ──
function maak(opties) {
  opties = opties || {};
  const T = { t: 1000000 };
  const c = {
    console: { log() {}, warn() {}, error() {} },
    Date: { now: function () { return T.t; } },
    setInterval: function () { return 1; }, clearInterval: function () {},
    activePIDs: new Set(opties.actief || []),
    hiddenPIDs: new Set(opties.verborgen || []),
    pidVals: {}, pidHist: {}, _pidLastUpd: {}, _pidLastUpdPause: {},
    PLSched: {
      dood: function (p) { return (opties.dood || []).indexOf(p) > -1; },
      interval: function () { return 120; }
    },
    PLGate: { stats: function () { return { turbo: !!c.__turbo, omgevingsdruk: c.__baro === undefined ? null : c.__baro }; } },
    detectEngineType: function () { return opties.motor || 'benzine'; },
    __turbo: !!opties.turbo
  };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  c.getPidDef = function (p) { return c.ALL_PID_DEFS[p] || null; };
  // Ná pidlane-data.js: dat bestand zet zelf een echte PLBus neer, en die zou
  // een eerder gezette nep overschrijven — dan meet de pauzeproef niets.
  c.PLBus = { pausedTotal: function () { return c.__pauze || 0; } };
  vm.runInContext(lees('pidlane-visueel.js'), c, { filename: 'pidlane-visueel.js' });
  c.T = T;
  return c;
}

const A = maak();
const V = A.PLVisueel, G = V.G;
if (!V || typeof V.stand !== 'function') { console.error('FOUT: PLVisueel niet geladen'); process.exit(1); }
waar('de klok van de sandbox is de nepklok (anders toetsen de tijdproeven niets)', A.Date.now() === 1000000);

// ══ 1. DE TEKENING ═════════════════════════════════════════════════
console.log('\n── 1. de wijzerplaat blijft binnen zijn ring ──');
const plaat = V.wijzerplaat(6000);
function afstand(x, y) { return Math.hypot(x - G.C, y - G.C); }
function hoekVan(x, y) { return Math.atan2(x - G.C, -(y - G.C)) * 180 / Math.PI; }

const streepjes = [...plaat.matchAll(/<line class="vis-streep[^"]*" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)]
  .map(m => m.slice(1).map(Number));
waar('17 streepjes: 0 tot 8000 per 500', streepjes.length === 17, 'gevonden: ' + streepjes.length);
const buiten = streepjes.filter(s => {
  const r1 = afstand(s[0], s[1]), r2 = afstand(s[2], s[3]);
  return Math.min(r1, r2) < G.R_STREEP_GROOT - 0.05 || Math.max(r1, r2) > G.R_STREEP_UIT + 0.05;
});
waar('elk streepje ligt tussen straal ' + G.R_STREEP_GROOT + ' en ' + G.R_STREEP_UIT, buiten.length === 0,
  buiten.length + ' streepje(s) erbuiten: ' + JSON.stringify(buiten[0]));
const scheef = streepjes.filter(s => {
  const a1 = hoekVan(s[0], s[1]), a2 = hoekVan(s[2], s[3]);
  return Math.abs(a1 - a2) > 0.05 || a1 < G.A0 - 0.05 || a1 > G.A1 + 0.05;
});
waar('elk streepje wijst naar het midden en ligt binnen de schaal ' + G.A0 + '…' + G.A1 + '°', scheef.length === 0,
  JSON.stringify(scheef[0]));
waar('de streepjes eindigen binnen de toerenboog', G.R_STREEP_UIT < G.R_BOOG - G.B_BOOG / 2,
  G.R_STREEP_UIT + ' tegen binnenkant boog ' + (G.R_BOOG - G.B_BOOG / 2));
waar('de toerenboog blijft binnen de ring', G.R_BOOG + G.B_BOOG / 2 < G.R_RING - 1);
waar('de sleepwijzer blijft binnen de ring', G.R_PIEK_UIT < G.R_RING - 1 && G.R_PIEK_IN > G.R_STREEP_UIT);
waar('de naald reikt niet verder dan de streepjes', G.NAALD <= G.R_STREEP_UIT);

const cijfers = [...plaat.matchAll(/<text class="vis-cijfer[^"]*" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)</g)]
  .map(m => ({ x: +m[1], y: +m[2], t: m[3] }));
waar('9 cijfers, 0 tot 8', cijfers.map(c => c.t).join('') === '012345678', 'kreeg ' + cijfers.map(c => c.t).join(''));
waar('alle cijfers op dezelfde straal ' + G.R_CIJFER,
  cijfers.every(c => Math.abs(afstand(c.x, c.y) - G.R_CIJFER) < 0.05),
  cijfers.map(c => afstand(c.x, c.y).toFixed(2)).join(' '));

// Een tekstvak zoals de browser hem ongeveer tekent: breedte 0,62 × corps per
// teken, hoogte 1,2 × corps (de regelhoogte die getBBox() ook meet — met één
// corps stond hier "L/100km" groen terwijl hij in de browser het getal erboven
// raakte), gecentreerd (text-anchor middle, baseline central).
function tekstVak(naam, x, y, fs, tekst) {
  const b = 0.62 * fs * tekst.length, h = 1.2 * fs;
  return { naam, x0: x - b / 2, x1: x + b / 2, y0: y - h / 2, y1: y + h / 2 };
}
const vakken = cijfers.map(c => tekstVak('cijfer ' + c.t, c.x, c.y, G.FS_CIJFER, c.t))
  .concat([
    tekstVak('×1000 /min', G.C, G.Y_SCHAAL, G.FS_SCHAAL, '×1000 /min'),
    tekstVak('toerengetal', G.C, G.Y_RPM, G.FS_EENHEID, '9990 rpm'),
    tekstVak('snelheid', G.C, G.Y_SNEL, G.FS_SNEL, '999'),
    tekstVak('km/h', G.C, G.Y_KMH, G.FS_EENHEID, 'km/h'),
    tekstVak('pedaalgetal', G.X_LINKS, G.Y_KLEIN, G.FS_KLEIN, '100%'),
    tekstVak('vierde getal', G.X_RECHTS, G.Y_KLEIN, G.FS_KLEIN, '≈99+'),
    tekstVak('vierde eenheid', G.X_RECHTS, G.Y_KLEIN_EENHEID, G.FS_EENHEID, 'L/100km'),
    { naam: 'pedaalicoon', x0: G.X_LINKS - G.ICOON / 2, x1: G.X_LINKS + G.ICOON / 2, y0: G.Y_ICOON - G.ICOON / 2, y1: G.Y_ICOON + G.ICOON / 2 },
    { naam: 'vierde icoon', x0: G.X_RECHTS - G.ICOON / 2, x1: G.X_RECHTS + G.ICOON / 2, y0: G.Y_ICOON - G.ICOON / 2, y1: G.Y_ICOON + G.ICOON / 2 },
    { naam: 'naaf', x0: G.C - G.R_NAAF, x1: G.C + G.R_NAAF, y0: G.C - G.R_NAAF, y1: G.C + G.R_NAAF }
  ]);
function raakt(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
const botsing = [];
for (let i = 0; i < vakken.length; i++)
  for (let j = i + 1; j < vakken.length; j++)
    if (raakt(vakken[i], vakken[j])) botsing.push(vakken[i].naam + ' × ' + vakken[j].naam);
waar('geen tekstvak of icoon raakt een ander (' + vakken.length + ' vakken)', botsing.length === 0, botsing.join(', '));

function hoeken(v) { return [[v.x0, v.y0], [v.x1, v.y0], [v.x0, v.y1], [v.x1, v.y1]]; }
const naBuiten = vakken.filter(v => hoeken(v).some(p => afstand(p[0], p[1]) > G.R_RING - 4));
waar('elk vak valt binnen de ring', naBuiten.length === 0, naBuiten.map(v => v.naam).join(', '));

// Ringen: een vak mag niet over een boog of de streepjes vallen. Getoetst op
// punten langs elke boog, met de lijndikte erbij.
function boogPunten(r, a0, a1) {
  const uit = [];
  for (let k = 0; k <= 60; k++) {
    const a = (a0 + (a1 - a0) * k / 60 - 90) * Math.PI / 180;
    uit.push([G.C + r * Math.cos(a), G.C + r * Math.sin(a)]);
  }
  return uit;
}
function vakRaaktBoog(v, r, b, a0, a1) {
  const m = b / 2 + 1;
  return boogPunten(r, a0, a1).some(p => p[0] > v.x0 - m && p[0] < v.x1 + m && p[1] > v.y0 - m && p[1] < v.y1 + m);
}
const bogen = [
  ['toerenboog', G.R_BOOG, G.B_BOOG, G.A0, G.A1],
  ['streepjes', (G.R_STREEP_GROOT + G.R_STREEP_UIT) / 2, G.R_STREEP_UIT - G.R_STREEP_GROOT, G.A0, G.A1],
  ['pedaalboog', G.R_KLEIN, G.B_KLEIN, G.L0, G.L1],
  ['vierde boog', G.R_KLEIN, G.B_KLEIN, G.R0, G.R1]
];
const overBoog = [];
vakken.forEach(v => bogen.forEach(b => { if (vakRaaktBoog(v, b[1], b[2], b[3], b[4])) overBoog.push(v.naam + ' × ' + b[0]); }));
waar('geen tekstvak of icoon ligt op een boog of op de streepjes', overBoog.length === 0, overBoog.join(', '));

// TEGENPROEF: de controle hierboven moet een echte fout zien. Zet de cijfers
// op de straal van de streepjes, en de snelheid in het midden van de naaf.
{
  const fout1 = tekstVak('cijfer', G.C, G.C - G.R_STREEP_UIT + 4, G.FS_CIJFER, '4');
  const fout2 = tekstVak('snelheid', G.C, G.C, G.FS_SNEL, '999');
  waar('tegenproef: een cijfer op de streepjes wordt gezien', bogen.some(b => vakRaaktBoog(fout1, b[1], b[2], b[3], b[4])));
  waar('tegenproef: de snelheid op de naaf wordt gezien',
    raakt(fout2, vakken.find(v => v.naam === 'naaf')));
}

// ══ 2. DE AANSTURING ═══════════════════════════════════════════════
console.log('\n── 2. geen enkele invoer duwt de meter buiten zijn grenzen ──');
const raar = [0, 800, 4000, 7999, 8000, 8001, 99999, -1, -50, 1e12, -1e12, NaN, Infinity, -Infinity,
  null, undefined, '', '3000', 'NO DATA', {}, [], 0.0001];
const buitenToeren = [], buitenPedaal = [], buitenLaad = [], buitenVerbruik = [];
raar.forEach(v => {
  const s = V.stand('toeren', v);
  if (!(s.hoek >= G.A0 && s.hoek <= G.A1 && s.deel >= 0 && s.deel <= 100 && typeof s.tekst === 'string' && s.tekst.length <= 4))
    buitenToeren.push(String(v) + ' → ' + JSON.stringify(s));
  const p = V.stand('pedaal', v);
  if (!(p.deel >= 0 && p.deel <= 100 && p.tekst.length <= 3)) buitenPedaal.push(String(v) + ' → ' + JSON.stringify(p));
  const l = V.stand('laaddruk', v);
  if (!(l.vac >= 0 && l.vac <= 100 && l.boost >= 0 && l.boost <= 100 && (l.vac === 0 || l.boost === 0) && l.tekst.length <= 4))
    buitenLaad.push(String(v) + ' → ' + JSON.stringify(l));
  ['L/100', 'L/h'].forEach(e => {
    const w = V.stand('verbruik', v, e);
    if (!(w.deel >= 0 && w.deel <= 100 && w.tekst.length <= 3)) buitenVerbruik.push(String(v) + ' ' + e + ' → ' + JSON.stringify(w));
  });
});
waar('toeren: hoek binnen de schaal, vulling 0–100, tekst ≤ 4 tekens', buitenToeren.length === 0, buitenToeren.join(' | '));
waar('pedaal: vulling 0–100, tekst ≤ 3 tekens', buitenPedaal.length === 0, buitenPedaal.join(' | '));
waar('laaddruk: vacuüm óf druk, nooit allebei, elk 0–100', buitenLaad.length === 0, buitenLaad.join(' | '));
waar('verbruik: vulling 0–100, tekst ≤ 3 tekens ("99+")', buitenVerbruik.length === 0, buitenVerbruik.join(' | '));

waar('4000 rpm staat midden op de schaal (0°)', Math.abs(V.stand('toeren', 4000).hoek) < 0.01, V.stand('toeren', 4000).hoek);
waar('99999 rpm staat op het laatste streepje, niet erachter', V.stand('toeren', 99999).hoek === G.A1);
waar('−50 rpm staat op het eerste streepje, niet ervoor', V.stand('toeren', -50).hoek === G.A0);
waar('NaN is leeg en de naald blijft op het begin', V.stand('toeren', NaN).leeg && V.stand('toeren', NaN).hoek === G.A0);
waar('"NO DATA" is leeg, geen 0', V.stand('toeren', 'NO DATA').leeg && V.stand('toeren', 'NO DATA').tekst === '—');
waar('een ontbrekende snelheid is een streepje, geen 0', V.tekst('snel', undefined) === '—');
waar('laaddruk +0,75 bar vult de drukkant half', Math.abs(V.stand('laaddruk', 0.75).boost - 50) < 0.01 && V.stand('laaddruk', 0.75).vac === 0);
waar('laaddruk −0,5 bar vult de vacuümkant half', Math.abs(V.stand('laaddruk', -0.5).vac - 50) < 0.01 && V.stand('laaddruk', -0.5).boost === 0);
waar('laaddruk krijgt een + als hij drukt', V.tekst('laaddruk', 0.8) === '+0,8', V.tekst('laaddruk', 0.8));

console.log('\n── de afgeleide waarden ──');
const stat = V.verbruikNu(2.5, 0);
waar('stationair: 2,5 g/s lucht is ≈ 0,82 L/h, in L/h', stat.eenheid === 'L/h' && Math.abs(stat.waarde - 0.822) < 0.01, JSON.stringify(stat));
const rijd = V.verbruikNu(10, 50);
waar('10 g/s bij 50 km/h is ≈ 6,6 L/100 km', rijd.eenheid === 'L/100' && Math.abs(rijd.waarde - 6.58) < 0.05, JSON.stringify(rijd));
waar('onder 5 km/h geen L/100 km (deling door bijna nul)', V.verbruikNu(10, 4).eenheid === 'L/h');
waar('zonder luchtmassa geen verbruik', V.verbruikNu(undefined, 50) === null);
waar('laaddruk met gemeten omgevingsdruk: 180 − 100 kPa = 0,8 bar', Math.abs(V.laaddrukNu(180, 100) - 0.8) < 1e-9);
waar('laaddruk zonder omgevingsdruk: tegen 101,3 kPa', Math.abs(V.laaddrukNu(180, null) - 0.787) < 1e-9);
waar('zonder inlaatdruk geen laaddruk', V.laaddrukNu(undefined, 100) === null);

// ══ 3. DE KEUZE ════════════════════════════════════════════════════
console.log('\n── 3. welke PID waar staat ──');
function ind(o) { const c = maak(o); return { c: c, i: c.PLVisueel.indeling() }; }
let r = ind({ actief: ['010C', '010D', '0149', '015A', '0111', '0104', '0105', '015C', '012F', '0142', '0110'] });
waar('de basis: toerental, snelheid, gaspedaal 0149', r.i.naald === '010C' && r.i.midden === '010D' && r.i.pedaal === '0149', JSON.stringify(r.i));
waar('benzine met luchtmassameter en geen bewezen turbo: verbruik', r.i.vierde && r.i.vierde.soort === 'verbruik' && r.i.vierde.pid === '0110', JSON.stringify(r.i.vierde));
waar('de rand in vaste volgorde: koel, olie, tank, accu', r.i.rand.map(x => x.rol).join(',') === 'koel,olie,tank,accu', r.i.rand.map(x => x.rol).join(','));
waar('motorbelasting staat nergens op de meter', JSON.stringify(r.i).indexOf('0104') < 0);
r = ind({ actief: ['010C', '015A', '0111'] });
waar('zonder 0149 wordt het 015A', r.i.pedaal === '015A', r.i.pedaal);
r = ind({ actief: ['010C', '0149', '015A'], dood: ['0149'] });
waar('een dode 0149 valt door naar 015A', r.i.pedaal === '015A', r.i.pedaal);
r = ind({ actief: ['010C', '0149', '015A'], verborgen: ['0149'] });
waar('een verborgen 0149 valt door naar 015A', r.i.pedaal === '015A', r.i.pedaal);
r = ind({ actief: ['010C', '0111'] });
waar('alleen een gasklep: dan de gasklep, met het gasklepicoon zodra hij naar de rand gaat', r.i.pedaal === '0111');
r = ind({ actief: ['010D', '0149'] });
waar('zonder toerental geen naald (het scherm zegt dat dan)', r.i.naald === null);
r = ind({ actief: ['010C'] });
waar('niets voor pedaal of vierde: die plekken blijven leeg', r.i.pedaal === null && r.i.vierde === null && r.i.rand.length === 0);
r = ind({ actief: ['010C', '010B', '0110'], motor: 'diesel' });
waar('diesel zonder bewezen turbo: de vierde plek blijft leeg (luchtmassa ≠ verbruik bij diesel)', r.i.vierde === null, JSON.stringify(r.i.vierde));
r = ind({ actief: ['010C', '010B', '0110'], turbo: true });
waar('bewezen turbo: laaddruk', r.i.vierde && r.i.vierde.soort === 'laaddruk', JSON.stringify(r.i.vierde));
r.c.__turbo = false;
waar('eenmaal laaddruk, altijd laaddruk (de boog wisselt niet van betekenis)', r.c.PLVisueel.indeling().vierde.soort === 'laaddruk');
r = ind({ actief: ['010C', '0110'], turbo: true });
waar('bewezen turbo maar geen inlaatdruk: dan verbruik', r.i.vierde && r.i.vierde.soort === 'verbruik', JSON.stringify(r.i.vierde));

console.log('\n── het gemeten tempo stuurt een trage PID naar de rand ──');
function metTempo(stap, n, voorStart) {
  const c = maak({ actief: ['010C', '0149'] });
  c.PLVisueel.start();
  const t0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist['0149'] = [];
  (voorStart || []).forEach(t => c.pidHist['0149'].push({ t: c.PLVisueel.staat().start - t, v: 20 }));
  for (let k = 0; k < n; k++) c.pidHist['0149'].push({ t: t0 + k * stap, v: 20 });
  c.PLVisueel.beoordeelTempo('0149');
  return c;
}
let c1 = metTempo(1000, 12);
waar('elke seconde een meting: naar de rand', c1.PLVisueel.indeling().pedaal === null &&
  c1.PLVisueel.indeling().traag.some(x => x.pid === '0149'), JSON.stringify(c1.PLVisueel.indeling()));
c1 = metTempo(250, 12);
waar('elke 250 ms: blijft op de meter', c1.PLVisueel.indeling().pedaal === '0149');
c1 = metTempo(1000, 5);
waar('te weinig metingen: nog geen oordeel, blijft staan', c1.PLVisueel.indeling().pedaal === '0149');
// Metingen van vóór het openen tellen niet: toen gold een ander tempo.
c1 = metTempo(250, 3, [9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000]);
waar('trage metingen van vóór het openen tellen niet mee', c1.PLVisueel.indeling().pedaal === '0149');
c1 = metTempo(1000, 12);
c1.pidHist['0149'] = c1.pidHist['0149'].map((x, k) => ({ t: x.t - 1000 * k + 200 * k, v: 20 }));
c1.PLVisueel.beoordeelTempo('0149');
waar('eenmaal naar de rand, blijft hij daar (geen heen-en-weer)', c1.PLVisueel.indeling().pedaal === null);

console.log('\n── een oud antwoord ──');
const o = maak({ actief: ['010C'] });
o._pidLastUpd['010C'] = 1000000;
waar('net binnen: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 500));
waar('3 s zonder antwoord bij een 120 ms-PID: oud', o.PLVisueel.isOud('010C', 1000000 + 3500));
o.__pauze = 5000; o._pidLastUpdPause['010C'] = 0;
waar('dezelfde 3,5 s maar de bus was bezet door een andere lezer: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 3500));
waar('nog nooit iets binnen is leeg, niet oud', !o.PLVisueel.isOud('010D', 1000000 + 99999));

// ══ 4. HET TEMPO ═══════════════════════════════════════════════════
console.log('\n── 4. trager opvragen wat niet op de meter staat ──');
const R = maak({ actief: ['010C', '010D', '0149', '015A', '0111', '0104', '010E', '0105', '0110'] });
R._focusPIDs = new Set(); R._pollMult = 1;
R.actiefPollProfiel = () => 'monitor';
R.PLLoad = { mult: () => 1, cfg: {} };
vm.runInContext([
  knip(lees('pidlane-plload.js'), 'function pidPollInterval(pid){', '// Welke PIDs zijn NU "due"', 'pidPollInterval'),
  'window.pidPollInterval = pidPollInterval;'
].join('\n'), R, { filename: 'pollronde-knip.js' });
const voor = {};
['010C', '010D', '0149', '015A', '0111', '0104', '010E', '0105', '0110'].forEach(p => { voor[p] = R.pidPollInterval(p); });
waar('dicht: niets geremd', ['0104', '0111', '015A', '010E'].every(p => voor[p] < R.PLVisueel.REM_MS), JSON.stringify(voor));
R.PLVisueel.start();
const na = {};
Object.keys(voor).forEach(p => { na[p] = R.pidPollInterval(p); });
waar('open: motorbelasting, gasklep, tweede pedaal en ontsteking geremd',
  ['0104', '0111', '015A', '010E'].every(p => na[p] >= R.PLVisueel.REM_MS), JSON.stringify(na));
waar('open: toerental, snelheid en het gekozen pedaal ongemoeid',
  ['010C', '010D', '0149'].every(p => na[p] === voor[p]), JSON.stringify(na));
waar('open: de luchtmassa staat op de meter (verbruik) en wordt niet geremd', na['0110'] === voor['0110']);
waar('open: koelwater was al traag en blijft zoals hij was', na['0105'] === voor['0105']);
R.PLVisueel.stop();
waar('weer dicht: alles terug op het oude tempo', Object.keys(voor).every(p => R.pidPollInterval(p) === voor[p]));

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
