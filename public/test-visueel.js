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
// raakte). Gecentreerd, of links uitgelijnd voor de twee rijen in het midden.
function tekstVak(naam, x, y, fs, tekst, links) {
  const b = 0.62 * fs * tekst.length, h = 1.2 * fs;
  const x0 = links ? x : x - b / 2;
  return { naam, x0: x0, x1: x0 + b, y0: y - h / 2, y1: y + h / 2 };
}
// Het embleem: breedte LOGO_B, hoogte volgens zijn eigen viewBox — uit de
// tekening gelezen, niet overgenomen, zodat een andere uitsnede hier meetelt.
function logoVak() {
  const m = /<svg class="vis-logo" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/.exec(plaat);
  if (!m) throw new Error('het embleem staat niet in de wijzerplaat');
  return { naam: 'embleem', x0: +m[1], y0: +m[2], x1: +m[1] + +m[3], y1: +m[2] + +m[4] };
}
function icoonVak(naam, x, y, s) { return { naam, x0: x - s / 2, x1: x + s / 2, y0: y - s / 2, y1: y + s / 2 }; }
// Elke tekst op zijn breedste inhoud: een "past net" met een smal getal zegt niets.
const vakken = cijfers.map(c => tekstVak('cijfer ' + c.t, c.x, c.y, G.FS_CIJFER, c.t))
  .concat([
    logoVak(),
    tekstVak('snelheid', G.C, G.Y_SNEL, G.FS_SNEL, '999'),
    tekstVak('km/h', G.C, G.Y_KMH, G.FS_EENHEID, 'km/h'),
    icoonVak('koelwatericoon', G.X_LINKS, G.Y_ICOON, G.ICOON),
    tekstVak('koelwatergetal', G.X_LINKS, G.Y_WAARDE, G.FS_KLEIN, '118°'),
    icoonVak('accu-icoon', G.X_MIDDEN, G.Y_ICOON, G.ICOON),
    tekstVak('accugetal', G.X_MIDDEN, G.Y_WAARDE, G.FS_KLEIN, '14,8 V'),
    icoonVak('brandstoficoon', G.X_RECHTS, G.Y_ICOON, G.ICOON),
    tekstVak('brandstofgetal', G.X_RECHTS, G.Y_WAARDE, G.FS_KLEIN, '100%'),
    { naam: 'naaf', x0: G.C - G.R_NAAF, x1: G.C + G.R_NAAF, y0: G.C - G.R_NAAF, y1: G.C + G.R_NAAF }
  ]);
// Het getal van de onderboog staat met opzet BUITEN de cirkel, eronder. Voor
// die twee vakken geldt dus een andere regel: helemaal onder de ring (met zijn
// lijndikte), en binnen de tekening zelf.
const onderVakken = [
  icoonVak('onderboogicoon', G.X_ONDER_ICOON, G.Y_ONDER, G.ICOON_ONDER),
  tekstVak('onderbooggetal', G.X_ONDER_TEKST, G.Y_ONDER, G.FS_KLEIN, '≈+1,5 bar', true)
];
function raakt(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
const botsing = [];
for (let i = 0; i < vakken.length; i++)
  for (let j = i + 1; j < vakken.length; j++)
    if (raakt(vakken[i], vakken[j])) botsing.push(vakken[i].naam + ' × ' + vakken[j].naam);
waar('geen tekstvak of icoon raakt een ander (' + vakken.length + ' vakken)', botsing.length === 0, botsing.join(', '));

function hoeken(v) { return [[v.x0, v.y0], [v.x1, v.y0], [v.x0, v.y1], [v.x1, v.y1]]; }
const naBuiten = vakken.filter(v => hoeken(v).some(p => afstand(p[0], p[1]) > G.R_RING - 4));
waar('elk vak valt binnen de ring', naBuiten.length === 0, naBuiten.map(v => v.naam).join(', '));
const onderMis = onderVakken.filter(v => v.y0 <= G.C + G.R_RING + 1 || v.y1 > G.VB_H || v.x0 < 0 || v.x1 > 320);
waar('het getal van de onderboog staat onder de ring en binnen de tekening', onderMis.length === 0,
  onderMis.map(v => v.naam + ' ' + JSON.stringify(v)).join(', '));
const onderBotst = raakt(onderVakken[0], onderVakken[1]);
waar('icoon en getal onder de cirkel raken elkaar niet', !onderBotst);
waar('het getal onder de cirkel staat onder de oliebalk (tussen 17 en 19 uur)',
  onderVakken[0].x0 > P0(G.O0)[0] && onderVakken[1].x1 < P0(G.O1)[0]);
function P0(a) { const t = (a - 90) * Math.PI / 180; return [G.C + G.R_BOOG * Math.cos(t), G.C + G.R_BOOG * Math.sin(t)]; }

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
  ['onderboog', G.R_BOOG, G.B_BOOG, G.O0, G.O1]
];
const overBoog = [];
vakken.forEach(v => bogen.forEach(b => { if (vakRaaktBoog(v, b[1], b[2], b[3], b[4])) overBoog.push(v.naam + ' × ' + b[0]); }));
waar('geen tekstvak of icoon ligt op een boog of op de streepjes', overBoog.length === 0, overBoog.join(', '));
waar('de onderboog ligt tussen vijf en zeven uur', G.O0 === 210 && G.O1 === 150);
waar('de onderboog raakt de toerenboog niet (tussen 120° en 240° is het gat)',
  Math.min(G.O0, G.O1) > G.A1 && Math.max(G.O0, G.O1) < 360 + G.A0);

// TEGENPROEF: de controle hierboven moet een echte fout zien. Zet een cijfer
// op de straal van de streepjes, de snelheid op de naaf, en het onderbooggetal
// een regel lager, op de boog.
{
  const fout1 = tekstVak('cijfer', G.C, G.C - G.R_STREEP_UIT + 4, G.FS_CIJFER, '4');
  const fout2 = tekstVak('snelheid', G.C, G.C, G.FS_SNEL, '999');
  const fout3 = tekstVak('onderbooggetal', G.X_ONDER_TEKST, G.C + G.R_BOOG, G.FS_KLEIN, '≈+1,5 bar', true);
  waar('tegenproef: een cijfer op de streepjes wordt gezien', bogen.some(b => vakRaaktBoog(fout1, b[1], b[2], b[3], b[4])));
  waar('tegenproef: de snelheid op de naaf wordt gezien', raakt(fout2, vakken.find(v => v.naam === 'naaf')));
  waar('tegenproef: een getal op de onderboog wordt gezien', vakRaaktBoog(fout3, G.R_BOOG, G.B_BOOG, G.O0, G.O1));
}

// ══ 2. DE AANSTURING ═══════════════════════════════════════════════
console.log('\n── 2. geen enkele invoer duwt de meter buiten zijn grenzen ──');
const raar = [0, 800, 4000, 7999, 8000, 8001, 99999, -1, -50, 1e12, -1e12, NaN, Infinity, -Infinity,
  null, undefined, '', '3000', 'NO DATA', {}, [], 0.0001];
const buitenToeren = [], buitenPedaal = [], buitenOlie = [], buitenLaad = [], buitenTekst = [];
raar.forEach(v => {
  const s = V.stand('toeren', v);
  if (!(s.hoek >= G.A0 && s.hoek <= G.A1 && s.deel >= 0 && s.deel <= 100 && typeof s.tekst === 'string' && s.tekst.length <= 4))
    buitenToeren.push(String(v) + ' → ' + JSON.stringify(s));
  const p = V.stand('pedaal', v);
  if (!(p.deel >= 0 && p.deel <= 100 && p.tekst.length <= 3)) buitenPedaal.push(String(v) + ' → ' + JSON.stringify(p));
  const o = V.stand('olie', v);
  if (!(o.deel >= 0 && o.deel <= 100 && o.tekst.length <= 3)) buitenOlie.push(String(v) + ' → ' + JSON.stringify(o));
  const l = V.stand('laaddruk', v);
  if (!(l.vac >= 0 && l.vac <= 100 && l.boost >= 0 && l.boost <= 100 && (l.vac === 0 || l.boost === 0) && l.tekst.length <= 4))
    buitenLaad.push(String(v) + ' → ' + JSON.stringify(l));
  // De plekjes: nooit langer dan hun vak (koel 3, tank 3, accu 4 tekens).
  [['koel', 3], ['tank', 3], ['accu', 4], ['snel', 3]].forEach(x => {
    const t = V.tekst(x[0], v); if (t.length > x[1]) buitenTekst.push(x[0] + ' ' + String(v) + ' → "' + t + '"');
  });
});
waar('toeren: hoek binnen de schaal, vulling 0–100, tekst ≤ 4 tekens', buitenToeren.length === 0, buitenToeren.join(' | '));
waar('pedaal: vulling 0–100, tekst ≤ 3 tekens', buitenPedaal.length === 0, buitenPedaal.join(' | '));
waar('olie: vulling 0–100, tekst ≤ 3 tekens', buitenOlie.length === 0, buitenOlie.join(' | '));
waar('laaddruk: vacuüm óf druk, nooit allebei, elk 0–100', buitenLaad.length === 0, buitenLaad.join(' | '));
waar('de plekjes en de snelheid blijven binnen hun vak', buitenTekst.length === 0, buitenTekst.join(' | '));

waar('4000 rpm staat midden op de schaal (0°)', Math.abs(V.stand('toeren', 4000).hoek) < 0.01, V.stand('toeren', 4000).hoek);
waar('99999 rpm staat op het laatste streepje, niet erachter', V.stand('toeren', 99999).hoek === G.A1);
waar('−50 rpm staat op het eerste streepje, niet ervoor', V.stand('toeren', -50).hoek === G.A0);
waar('NaN is leeg en de naald blijft op het begin', V.stand('toeren', NaN).leeg && V.stand('toeren', NaN).hoek === G.A0);
waar('"NO DATA" is leeg, geen 0', V.stand('toeren', 'NO DATA').leeg && V.stand('toeren', 'NO DATA').tekst === '—');
waar('een ontbrekende snelheid is een streepje, geen 0', V.tekst('snel', undefined) === '—');
waar('olie 95 °C vult de onderboog half (40…150)', Math.abs(V.stand('olie', 95).deel - 50) < 0.01, V.stand('olie', 95).deel);
waar('laaddruk +0,75 bar vult de drukkant half', Math.abs(V.stand('laaddruk', 0.75).boost - 50) < 0.01 && V.stand('laaddruk', 0.75).vac === 0);
waar('laaddruk −0,5 bar vult de vacuümkant half', Math.abs(V.stand('laaddruk', -0.5).vac - 50) < 0.01 && V.stand('laaddruk', -0.5).boost === 0);
waar('laaddruk krijgt een + als hij drukt', V.tekst('laaddruk', 0.8) === '+0,8', V.tekst('laaddruk', 0.8));
waar('laaddruk met gemeten omgevingsdruk: 180 − 100 kPa = 0,8 bar', Math.abs(V.laaddrukNu(180, 100) - 0.8) < 1e-9);
waar('laaddruk zonder omgevingsdruk: tegen 101,3 kPa', Math.abs(V.laaddrukNu(180, null) - 0.787) < 1e-9);
waar('zonder inlaatdruk geen laaddruk', V.laaddrukNu(undefined, 100) === null);

console.log('\n── de kleuren van de plekjes ──');
const DK = A.ALL_PID_DEFS['0105'];
waar('koelwater 45 °C is blauw (koud)', V.plekOordeel('koel', 45, DK) === 'koud');
waar('koelwater 90 °C is gewoon', V.plekOordeel('koel', 90, DK) === 'ok');
waar('koelwater op de waarschuwingsgrens uit de definitie (' + DK.wH + ') is oranje', V.plekOordeel('koel', DK.wH, DK) === 'warn');
waar('koelwater op de gevarengrens (' + DK.dH + ') is rood', V.plekOordeel('koel', DK.dH, DK) === 'danger');
waar('accu 12,5 V bij een stilstaande motor is goed', V.plekOordeel('accu', 12.5, null, 0) === 'ok');
waar('accu 12,5 V bij een draaiende motor is oranje: de dynamo laadt niet', V.plekOordeel('accu', 12.5, null, 1800) === 'warn');
waar('accu 14,1 V bij een draaiende motor is goed', V.plekOordeel('accu', 14.1, null, 1800) === 'ok');
waar('accu onder 12,0 V is rood', V.plekOordeel('accu', 11.8, null, 0) === 'danger');
waar('accu boven 15,0 V is rood', V.plekOordeel('accu', 15.4, null, 2000) === 'danger');
waar('accu zonder toerental: geen uitspraak over laden', V.plekOordeel('accu', 12.5, null, undefined) === 'ok');
waar('tank 8 % is oranje (reserve)', V.plekOordeel('tank', 8) === 'warn');
waar('geen waarde is "geen", geen kleur en geen 0', V.plekOordeel('tank', undefined) === 'geen' && V.plekOordeel('koel', 'NO DATA', DK) === 'geen');

// ══ 3. DE KEUZE ════════════════════════════════════════════════════
console.log('\n── 3. welke PID waar staat ──');
function ind(o) { const c = maak(o); return { c: c, i: c.PLVisueel.indeling() }; }
let r = ind({ actief: ['010C', '010D', '0149', '015A', '0111', '0104', '0105', '015C', '012F', '0142', '0110', '010B'] });
waar('de basis: toerental en snelheid', r.i.naald === '010C' && r.i.midden === '010D', JSON.stringify(r.i));
waar('de plekjes: koelwater, accu, brandstof', r.i.plekken.koel === '0105' && r.i.plekken.accu === '0142' && r.i.plekken.tank === '012F', JSON.stringify(r.i.plekken));
waar('met olie staat olie op de onderboog', r.i.onder && r.i.onder.soort === 'olie' && r.i.onder.pid === '015C', JSON.stringify(r.i.onder));
waar('luchtmassa staat nergens op de meter', JSON.stringify(r.i).indexOf('0110') < 0);
waar('motorbelasting staat alleen bij het motorlampje (sinds 26-09)', r.i.lamp.belasting === '0104' &&
  JSON.stringify(Object.assign({}, r.i, { lamp: null })).indexOf('0104') < 0, JSON.stringify(r.i));
r = ind({ actief: ['010C', '0149', '010B'] });
waar('zonder olie en zonder bewezen turbo: het gaspedaal', r.i.onder && r.i.onder.soort === 'pedaal' && r.i.onder.pid === '0149', JSON.stringify(r.i.onder));
r = ind({ actief: ['010C', '0149', '010B'], turbo: true });
waar('zonder olie met bewezen turbo: laaddruk', r.i.onder && r.i.onder.soort === 'laaddruk', JSON.stringify(r.i.onder));
r.c.__turbo = false;
waar('eenmaal turbo, altijd turbo (de boog wisselt niet van betekenis)', r.c.PLVisueel.indeling().onder.soort === 'laaddruk');
r = ind({ actief: ['010C', '015C', '0149', '010B'], turbo: true });
waar('olie gaat ook bij een turbo vóór', r.i.onder.soort === 'olie');
r = ind({ actief: ['010C', '015A', '0111'] });
waar('zonder 0149 wordt het 015A', r.i.onder && r.i.onder.pid === '015A', JSON.stringify(r.i.onder));
r = ind({ actief: ['010C', '0149', '015A'], dood: ['0149'] });
waar('een dode 0149 valt door naar 015A', r.i.onder && r.i.onder.pid === '015A');
r = ind({ actief: ['010C', '0149', '015A'], verborgen: ['0149'] });
waar('een verborgen 0149 valt door naar 015A', r.i.onder && r.i.onder.pid === '015A');
r = ind({ actief: ['010C', '015C', '0149'], dood: ['015C'] });
waar('een dode olie valt door naar het pedaal', r.i.onder && r.i.onder.pid === '0149');
r = ind({ actief: ['010D', '0149'] });
waar('zonder toerental geen naald (het scherm zegt dat dan)', r.i.naald === null);
r = ind({ actief: ['010C'] });
waar('niets voor onderboog of plekjes: die blijven leeg', r.i.onder === null && !r.i.plekken.koel && !r.i.plekken.accu && !r.i.plekken.tank);

console.log('\n── het gemeten tempo laat een trage onderboog doorvallen ──');
function metTempo(actief, pid, stap, n, voorStart) {
  const c = maak({ actief: actief });
  c.PLVisueel.start();
  const t0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist[pid] = [];
  (voorStart || []).forEach(t => c.pidHist[pid].push({ t: c.PLVisueel.staat().start - t, v: 20 }));
  for (let k = 0; k < n; k++) c.pidHist[pid].push({ t: t0 + k * stap, v: 20 });
  c.PLVisueel.beoordeelTempo(pid);
  return c;
}
let c1 = metTempo(['010C', '0149', '0111'], '0149', 1000, 12);
waar('pedaal elke seconde: valt door naar de volgende (0111)', c1.PLVisueel.indeling().onder.pid === '0111', JSON.stringify(c1.PLVisueel.indeling().onder));
c1 = metTempo(['010C', '0149'], '0149', 1000, 12);
waar('pedaal elke seconde en niets anders: de onderboog blijft leeg', c1.PLVisueel.indeling().onder === null);
c1 = metTempo(['010C', '0149'], '0149', 250, 12);
waar('pedaal elke 250 ms: blijft staan', c1.PLVisueel.indeling().onder.pid === '0149');
c1 = metTempo(['010C', '0149'], '0149', 1000, 5);
waar('te weinig metingen: nog geen oordeel, blijft staan', c1.PLVisueel.indeling().onder.pid === '0149');
c1 = metTempo(['010C', '0149'], '0149', 250, 3, [9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000]);
waar('trage metingen van vóór het openen tellen niet mee', c1.PLVisueel.indeling().onder.pid === '0149');
c1 = metTempo(['010C', '015C'], '015C', 10000, 12);
waar('olie om de 10 s blijft staan: die is van nature traag', c1.PLVisueel.indeling().onder.pid === '015C');
c1 = metTempo(['010C', '0149'], '0149', 1000, 12);
c1.pidHist['0149'] = c1.pidHist['0149'].map((x, k) => ({ t: x.t - 1000 * k + 200 * k, v: 20 }));
c1.PLVisueel.beoordeelTempo('0149');
waar('eenmaal te traag, blijft hij eraf (geen heen-en-weer)', c1.PLVisueel.indeling().onder === null);

console.log('\n── een oud antwoord ──');
const o = maak({ actief: ['010C'] });
o._pidLastUpd['010C'] = 1000000;
waar('net binnen: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 500));
waar('3,5 s zonder antwoord bij een 120 ms-PID: oud', o.PLVisueel.isOud('010C', 1000000 + 3500));
o.__pauze = 5000; o._pidLastUpdPause['010C'] = 0;
waar('dezelfde 3,5 s maar de bus was bezet door een andere lezer: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 3500));
waar('nog nooit iets binnen is leeg, niet oud', !o.PLVisueel.isOud('010D', 1000000 + 99999));

// ══ 4. HET MELDINGENVAK ════════════════════════════════════════════
console.log('\n── 4. het meldingenvak ──');
const UIT = { aan: false, draait: false, detail: 'uit' };
function run(over) {
  const r = { monitor: UIT, bulk: UIT, waak: UIT, caravan: UIT, rit: UIT };
  Object.keys(over || {}).forEach(k => { r[k] = over[k]; });
  return r;
}
let m = V.meldingen(run(), [], true);
waar('niets actief: geen chips, geen regels, wel snelkoppelingen', m.lopend.length === 0 && m.regels.length === 0 && m.snel.length > 0);
waar('de snelkoppelingen voor een beheerder: rit-monitor, caravanrit, bulk-recorder en waakronde',
  m.snel.map(s => s.id).join(',') === 'monitor,caravan,bulk,waak', m.snel.map(s => s.id).join(','));
m = V.meldingen(run(), [], false);
waar('voor een gewone gebruiker geen bulk-recorder (die weigert daar toch)',
  m.snel.map(s => s.id).join(',') === 'monitor,caravan,waak', m.snel.map(s => s.id).join(','));
m = V.meldingen(run({ caravan: { aan: true, draait: true, detail: 'rit loopt' } }), [], true);
waar('caravanrit loopt: die staat op de rail, met de status uit PLRun', m.lopend[0] && m.lopend[0].id === 'caravan' && m.lopend[0].kort === 'rit loopt');
waar('caravanrit loopt: geen snelkoppeling naar rit-monitor of bulk-recorder (één tegelijk)',
  !m.snel.some(s => s.id === 'monitor' || s.id === 'bulk' || s.id === 'caravan'), m.snel.map(s => s.id).join(','));
waar('caravanrit loopt: de waakronde kan er nog bij', m.snel.some(s => s.id === 'waak'));
m = V.meldingen(run({ bulk: { aan: true, detail: 'neemt op — 40 regels' }, waak: { aan: true, detail: 'loopt rond, niets bijzonders' } }), []);
waar('bulk-recorder en waakronde samen: twee chips, geen kaarten, geen snelkoppelingen',
  m.lopend.length === 2 && m.regels.length === 0 && m.snel.length === 0, JSON.stringify(m));
// De schermafdruk van 25-09: rit-monitor én recorder liepen, en het vak liet
// alleen de rit-monitor zien — de recorder stond als zwevende pil ernaast.
const T0 = 1000000;
m = V.meldingen(run({
  monitor: { aan: true, draait: true, detail: 'kijkt mee', tel: 0 },
  bulk: { aan: true, draait: true, detail: 'neemt op — 673 regels', sinds: T0 - 674000, regels: 673, pauze: false },
  waak: { aan: true, draait: true, detail: 'loopt rond', totaal: 13, gelezen: 4, let: 0 }
}), [], true, T0);
waar('rit-monitor, recorder en waakronde lopen samen: drie chips, in die volgorde',
  m.lopend.map(c => c.id).join(',') === 'monitor,bulk,waak', m.lopend.map(c => c.id).join(','));
const cb = m.lopend.find(c => c.id === 'bulk');
waar('de recorder-chip draagt opnametijd en regels, zoals de pil die hij vervangt',
  cb && cb.kort === '11 min · 673 r' && cb.opname, JSON.stringify(cb));
waar('de waakronde-chip draagt de ronde', m.lopend[2].kort === '4/13', m.lopend[2].kort);
m = V.meldingen(run({
  monitor: { aan: true, draait: true, detail: 'kijkt mee', tel: 2, ernstig: true },
  waak: { aan: true, draait: true, detail: '', totaal: 13, gelezen: 13, let: 1 }
}), [], true, T0);
waar('twee monitormeldingen, waarvan één ernstig: dat staat op de chip',
  m.lopend[0].kort === '2 meldingen' && m.lopend[0].let === 2 && m.lopend[0].ernstig, JSON.stringify(m.lopend[0]));
waar('een waakronde met een bevinding kleurt haar chip', m.lopend[1].kort === '1 let op' && m.lopend[1].let === 1, JSON.stringify(m.lopend[1]));
m = V.meldingen(run({ bulk: { aan: true, draait: false, detail: 'gepauzeerd', pauze: true, sinds: T0 - 60000, regels: 5 } }), [], true, T0);
waar('een gepauzeerde recorder zegt dat, en ademt niet', m.lopend[0].kort === 'gepauzeerd' && !m.lopend[0].opname, JSON.stringify(m.lopend[0]));
const BEV = [{ id: 'a', naam: 'Regel A', uitleg: 'x', ernst: 2 }, { id: 'b', naam: 'Afwijkend', uitleg: 'y', ernst: 1 }, { id: 'c', naam: 'C', uitleg: 'z', ernst: 1 }];
m = V.meldingen(run(), BEV);
waar('drie bevindingen: de eerste twee, en een regel "nog 1 bevinding"',
  m.regels.filter(x => x.soort === 'bevinding').length === 2 && m.regels.some(x => x.soort === 'meer' && /nog 1 bevinding$/.test(x.naam)),
  JSON.stringify(m.regels));
waar('bevindingen komen er in de volgorde van de engine in (ernstigste eerst)', m.regels[0].naam === 'Regel A');
m = V.meldingen(run(), null);
waar('bevindingen uitgezet in ☰: ook hier geen bevindingen', !m.regels.some(x => x.soort === 'bevinding'));
m = V.meldingen(null, BEV);
waar('zonder PLRun geen vak (en geen snelkoppelingen die niets kunnen)', m.regels.length === 0 && m.snel.length === 0);

// ══ 4b. DE SCHAAL PER MOTOR EN DE LAMPJES ══════════════════════════
console.log('\n── 4b. een diesel heeft een eigen schaal; de lampjes boven de meter ──');
const sd = V.schaalVoor('diesel', 6000), sb = V.schaalVoor('benzine', 6000);
waar('diesel: schaal tot 6000, oranje vanaf 4500', sd.max === 6000 && sd.rood === 4500, JSON.stringify(sd));
waar('benzine: schaal tot 8000, oranje vanaf de wH van 010C', sb.max === 8000 && sb.rood === 6000, JSON.stringify(sb));
waar('onbekende motor is de benzineplaat', V.schaalVoor(undefined, 6000).max === 8000);
const Ad = maak({ motor: 'diesel', actief: ['010C'] });
waar('een diesel krijgt die schaal ook in de indeling', Ad.PLVisueel.indeling().schaal.max === 6000);
const plaatD = V.wijzerplaat(4500, null, null, 6000);
const streepD = [...plaatD.matchAll(/<line class="vis-streep([^"]*)"/g)].map(x => x[1]);
waar('diesel: 13 streepjes, 0 tot 6000 per 500', streepD.length === 13, 'gevonden: ' + streepD.length);
waar('diesel: vier oranje streepjes (4500–6000)', streepD.filter(c => /rood/.test(c)).length === 4, streepD.join('|'));
const cijfD = [...plaatD.matchAll(/<text class="vis-cijfer[^"]*" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)</g)].map(x => ({ x: +x[1], y: +x[2], t: x[3] }));
waar('diesel: cijfers 0 tot 6', cijfD.map(c => c.t).join('') === '0123456', cijfD.map(c => c.t).join(''));
const vakD = cijfD.map(c => tekstVak('cijfer ' + c.t, c.x, c.y, G.FS_CIJFER, c.t));
const rest = vakken.filter(v => !/^cijfer/.test(v.naam));
const botsD = [];
vakD.forEach(a => rest.forEach(b => { if (raakt(a, b)) botsD.push(a.naam + ' × ' + b.naam); }));
vakD.forEach(a => bogen.forEach(b => { if (vakRaaktBoog(a, b[1], b[2], b[3], b[4])) botsD.push(a.naam + ' × ' + b[0]); }));
waar('diesel: geen cijfer raakt een ander vak of een boog', botsD.length === 0, botsD.join(', '));
waar('diesel: 6000 rpm staat op het laatste streepje', V.stand('toeren', 6000, 6000).hoek === G.A1);
waar('diesel: 3000 rpm staat midden op de schaal', Math.abs(V.stand('toeren', 3000, 6000).hoek) < 0.01);
waar('diesel: 9000 rpm blijft op het laatste streepje', V.stand('toeren', 9000, 6000).hoek === G.A1);

const L = V.aandrijfLampjes;
waar('het embleem staat in het midden, boven de naaf', /class="vis-logo"/.test(plaat) && !/×1000|vis-rpm/.test(plaat));
waar('geen aandrijfoordeel: beide lampjes uit', !L(null, 'benzine').motor && !L(null, 'benzine').hybride);
waar('onbekend: beide lampjes uit', !L({ toestand: 'ONBEKEND' }, 'benzine').motor);
let l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine');
waar('benzine, motor draait: links "Motor aan", rechts niets', l.motor && l.motor.soort === 'aan' && !l.hybride, JSON.stringify(l));
l = L({ toestand: 'STARTSTOP', zekerheid: 'hoog' }, 'benzine');
waar('start/stop-stop: links "Start/stop actief"', l.motor && l.motor.kop === 'Start/stop' && l.motor.waarde === 'actief' && !l.hybride, JSON.stringify(l));
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog', bewijstHybride: true }, 'benzine');
waar('rijden met stille motor bewijst een hybride, ook met "benzine" op het kenteken',
  l.hybride && l.hybride.soort === 'ev' && l.hybride.waarde === 'elektrisch' && l.motor.soort === 'uit', JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'hybride');
waar('hybride met draaiende motor: rechts "Hybride actief"', l.hybride && l.hybride.soort === 'hyb', JSON.stringify(l));
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog' }, 'ev');
waar('een volledig elektrische auto krijgt geen motorlampje', !l.motor && l.hybride, JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine', { belasting: 34.4 });
waar('motor draait met belasting: "Motor aan" als kop, 34% als waarde, balkje op 34',
  l.motor.kop === 'Motor aan' && l.motor.waarde === '34%' && l.motor.balk === 34, JSON.stringify(l));
l = L({ toestand: 'STARTSTOP', zekerheid: 'hoog' }, 'benzine', { belasting: 34 });
waar('in een start/stop-stop geen belasting (de motor staat stil)', l.motor.waarde === 'actief' && l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine', { belasting: 'NO DATA' });
waar('onleesbare belasting: gewoon "aan", geen balkje', l.motor.waarde === 'aan' && l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog' }, 'hybride', { belasting: 20, accu: 61.7 });
waar('elektrisch rijden: rechts "Elektrisch" met 62% accu, links geen belasting',
  l.hybride.kop === 'Elektrisch' && l.hybride.waarde === '62%' && l.hybride.balk === 62 && l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'hybride', { belasting: 48, accu: 55 });
waar('samen aan: links de belasting, rechts de accu',
  l.motor.waarde === '48%' && l.hybride.kop === 'Hybride actief' && l.hybride.waarde === '55%', JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'hybride', { accu: 180 });
waar('een accupercentage buiten 0–100 blijft binnen zijn vak', l.hybride.waarde === '100%' && l.hybride.balk === 100, JSON.stringify(l));
const Al = maak({ actief: ['010C', '0104', '015B'] });
const indL = Al.PLVisueel.indeling();
waar('belasting en accu horen bij de indeling', indL.lamp.belasting === '0104' && indL.lamp.accu === '015B', JSON.stringify(indL.lamp));
waar('…en worden dus niet geremd', Al.PLVisueel.gebruiktePids(indL).has('0104') && Al.PLVisueel.gebruiktePids(indL).has('015B'));
l = L({ toestand: 'UIT_VOOR_START', zekerheid: 'laag' }, 'benzine');
waar('lage zekerheid staat op het lampje (twijfel), niet als feit', l.motor && l.motor.twijfel, JSON.stringify(l));

// ══ 5. HET TEMPO ═══════════════════════════════════════════════════
console.log('\n── 5. trager opvragen wat niet op de meter staat ──');
const R = maak({ actief: ['010C', '010D', '0149', '015A', '0111', '0104', '010E', '0105', '0110', '015C'] });
R._focusPIDs = new Set(); R._pollMult = 1;
R.actiefPollProfiel = () => 'monitor';
R.PLLoad = { mult: () => 1, cfg: {} };
vm.runInContext([
  knip(lees('pidlane-plload.js'), 'function pidPollInterval(pid){', '// Welke PIDs zijn NU "due"', 'pidPollInterval'),
  'window.pidPollInterval = pidPollInterval;'
].join('\n'), R, { filename: 'pollronde-knip.js' });
const ALLE = ['010C', '010D', '0149', '015A', '0111', '0104', '010E', '0105', '0110', '015C'];
const voor = {};
ALLE.forEach(p => { voor[p] = R.pidPollInterval(p); });
waar('dicht: niets geremd', ['0104', '0111', '015A', '010E', '0149', '0110'].every(p => voor[p] < R.PLVisueel.REM_MS), JSON.stringify(voor));
R.PLVisueel.start();
const na = {};
ALLE.forEach(p => { na[p] = R.pidPollInterval(p); });
waar('open met olie: gasklep, pedalen, ontsteking en luchtmassa geremd',
  ['0111', '015A', '010E', '0149', '0110'].every(p => na[p] >= R.PLVisueel.REM_MS), JSON.stringify(na));
waar('open: de motorbelasting staat bij het lampje en blijft op tempo', na['0104'] === voor['0104'], JSON.stringify(na));
waar('open: toerental en snelheid ongemoeid', ['010C', '010D'].every(p => na[p] === voor[p]), JSON.stringify(na));
waar('open: koelwater en olie waren al traag en blijven zoals ze waren', na['0105'] === voor['0105'] && na['015C'] === voor['015C']);
R.PLVisueel.stop();
waar('weer dicht: alles terug op het oude tempo', ALLE.every(p => R.pidPollInterval(p) === voor[p]));
const R2 = maak({ actief: ['010C', '0149', '0111'] });
R2._focusPIDs = new Set(); R2._pollMult = 1; R2.actiefPollProfiel = () => 'monitor'; R2.PLLoad = { mult: () => 1, cfg: {} };
vm.runInContext(knip(lees('pidlane-plload.js'), 'function pidPollInterval(pid){', '// Welke PIDs zijn NU "due"', 'pidPollInterval') + '\nwindow.pidPollInterval = pidPollInterval;', R2);
R2.PLVisueel.start();
waar('zonder olie staat het pedaal op de onderboog en wordt het níét geremd', R2.pidPollInterval('0149') < R2.PLVisueel.REM_MS && R2.pidPollInterval('0111') >= R2.PLVisueel.REM_MS);

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
