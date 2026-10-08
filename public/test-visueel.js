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
      interval: function (p) { return (c.__tempo && c.__tempo[p]) || 120; },
      laatstePoging: function (p) { return (c.__poging && c.__poging[p]) || 0; }
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
  vm.runInContext(lees('pidlane-toon.js'), c, { filename: 'pidlane-toon.js' });   // vraagUit rekent via PLToon
  // Met een eigen keuze: de echte PLVisProfiel, met de keuze in zijn opslag.
  if (opties.keuze) {
    const opslag = { pl_vis_keuze: JSON.stringify(opties.keuze) };
    c.localStorage = { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } };
    vm.runInContext(lees('pidlane-visprofiel.js'), c, { filename: 'pidlane-visprofiel.js' });
  }
  vm.runInContext(lees('pidlane-visueel.js'), c, { filename: 'pidlane-visueel.js' });
  // De echte regel voor "oud" (pidlane-plload.js), niet een kopie: isOud() is er een doorgeefluik naar.
  vm.runInContext(knip(lees('pidlane-plload.js'), '// ── WANNEER IS EEN METING OUD?', 'function pidsDueNow(){', 'plOud'), c, { filename: 'pidlane-plload.js' });
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
    // De versnelling staat op de plek van het embleem (nooit samen): op zijn breedste.
    tekstVak('versnelling', G.C, G.Y_LOGO, G.FS_GEAR, '10'),
    tekstVak('snelheid', G.C, G.Y_SNEL, G.FS_SNEL, '999'),
    tekstVak('km/h', G.C, G.Y_KMH, G.FS_EENHEID, 'km/h'),
    { naam: 'naaf', x0: G.C - G.R_NAAF, x1: G.C + G.R_NAAF, y0: G.C - G.R_NAAF, y1: G.C + G.R_NAAF }
  ])
  // De plekken (08-10-2026): per boog icoon en waarde, en het getal in het
  // midden met zijn eenheid — uit de TEKENING gelezen, niet uit G overgenomen,
  // zodat een plek die ergens anders getekend wordt dan G zegt hier meetelt.
  .concat(plekVakken(plaat));
function plekVakken(pl) {
  const uit = [];
  [...pl.matchAll(/<g id="visp-(links|rechts)" class="vis-plek vis-boog[^"]*"[^>]*>([\s\S]*?)<\/g>/g)].forEach(m => {
    const rol = m[1], b = m[2];
    const ic = /<svg id="visi-\w+" class="vis-icoon" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/.exec(b);
    const nm = /<text id="visn-\w+" class="vis-plek-naam" x="([-\d.]+)" y="([-\d.]+)" style="font-size:([-\d.]+)px"/.exec(b);
    const tx = /<text id="visv-\w+" class="vis-klein" x="([-\d.]+)" y="([-\d.]+)" style="font-size:([-\d.]+)px"/.exec(b);
    if (!ic || !nm || !tx) throw new Error('boog ' + rol + ' is niet te lezen — is de tekening veranderd?');
    uit.push({ naam: rol + '-icoon', x0: +ic[1], y0: +ic[2], x1: +ic[1] + +ic[3], y1: +ic[2] + +ic[4] });
    // Het korte woord staat op de plek van het icoon (nooit samen): op zijn breedste, zes tekens.
    uit.push(tekstVak(rol + '-woord', +nm[1], +nm[2], +nm[3], 'Inlaat'));
    // Op zijn breedste: vier tekens, "118°", "100%" of "13,9" (plekGetal begrenst).
    uit.push(tekstVak(rol + '-waarde', +tx[1], +tx[2], +tx[3], '118°'));
  });
  const mid = /<g id="visp-midden"[^>]*>([\s\S]*?)<\/g>/.exec(pl);
  if (!mid) throw new Error('het getal in het midden is niet te lezen — is de tekening veranderd?');
  const mg = /<text id="visv-midden" class="vis-mid" x="([-\d.]+)" y="([-\d.]+)" style="font-size:([-\d.]+)px"/.exec(mid[1]);
  const me = /<text id="vise-midden" class="vis-eenheid" x="([-\d.]+)" y="([-\d.]+)" style="font-size:([-\d.]+)px"/.exec(mid[1]);
  if (!mg || !me) throw new Error('getal of eenheid in het midden ontbreekt');
  // Vijf tekens ("9999+") en tien tekens eenheid: de grenzen van plekGetal en plekOpbouw.
  uit.push(tekstVak('midden-getal', +mg[1], +mg[2], +mg[3], '9999+'));
  uit.push(tekstVak('midden-eenheid', +me[1], +me[2], +me[3], 'l/100 km  '));
  return uit;
}
waar('vier plekken: links, rechts, midden en het vak (08-10-2026)', V.PLEKKEN.map(x => x.rol).join(',') === 'links,rechts,midden,vak');
waar('twee bogen en het getal staan in de tekening',
  vakken.filter(v => /-waarde$/.test(v.naam)).map(v => v.naam).join(',') === 'links-waarde,rechts-waarde' && vakken.some(v => v.naam === 'midden-getal'),
  vakken.map(v => v.naam).join(','));
waar('geen rijtjes meer onder de snelheid, en geen accu', !/vis-rij|vis-balk|visv-accu|visp-accu/.test(plaat));
waar('het getal staat onder km/h', G.Y_MID - 0.6 * G.FS_MID > G.Y_KMH + 0.6 * G.FS_EENHEID, G.Y_MID + ' tegen ' + G.Y_KMH);
function raakt(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
// Embleem en versnelling wisselen elkaar af (gearBij), en icoon en woord van
// een boog ook (plekOpbouw): die paren mogen dezelfde plek hebben.
function samen(a, b) {
  const n = [a.naam, b.naam].sort().join('|');
  return n === 'embleem|versnelling' || n === 'links-icoon|links-woord' || n === 'rechts-icoon|rechts-woord';
}
const botsing = [];
for (let i = 0; i < vakken.length; i++)
  for (let j = i + 1; j < vakken.length; j++)
    if (raakt(vakken[i], vakken[j]) && !samen(vakken[i], vakken[j])) botsing.push(vakken[i].naam + ' × ' + vakken[j].naam);
waar('geen tekstvak of icoon raakt een ander (' + vakken.length + ' vakken)', botsing.length === 0, botsing.join(', '));

function hoeken(v) { return [[v.x0, v.y0], [v.x1, v.y0], [v.x0, v.y1], [v.x1, v.y1]]; }
const naBuiten = vakken.filter(v => hoeken(v).some(p => afstand(p[0], p[1]) > G.R_RING - 4));
waar('elk vak valt binnen de ring', naBuiten.length === 0, naBuiten.map(v => v.naam).join(', '));
waar('de tekening is zo hoog als de cirkel: niets staat er meer onder', G.VB === 320 && !/visg-onder|vis-ondertekst/.test(plaat));

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
  ['boog links', G.R_BOOG, G.B_BOOG, G.L0, G.L1],
  ['boog rechts', G.R_BOOG, G.B_BOOG, G.R0, G.R1]
];
const overBoog = [];
vakken.forEach(v => bogen.forEach(b => { if (vakRaaktBoog(v, b[1], b[2], b[3], b[4])) overBoog.push(v.naam + ' × ' + b[0]); }));
waar('geen tekstvak of icoon ligt op een boog of op de streepjes', overBoog.length === 0, overBoog.join(', '));
// De twee bogen liggen in het gat dat de toerenboog openlaat (120°…240°),
// met lucht ertussen: een boog die de toerenboog raakt leest als één boog.
waar('de bogen onderin raken de toerenboog niet en elkaar niet',
  G.R1 > G.A1 + 4 && G.L1 < 360 + G.A0 - 4 && G.L0 - G.R0 >= 10 && G.L0 < G.L1 && G.R0 > G.R1,
  [G.R1, G.R0, G.L0, G.L1].join(' '));
waar('links vult van onder naar boven, rechts ook (koud en leeg onderaan)',
  V.hoekPlek('links', 0) === G.L0 && V.hoekPlek('links', 100) === G.L1 && V.hoekPlek('rechts', 0) === G.R0 && V.hoekPlek('rechts', 100) === G.R1);

// TEGENPROEF: de controle hierboven moet een echte fout zien. Zet een cijfer
// op de straal van de streepjes, de snelheid op de naaf, de waarde van een
// boog op de boog zelf, en het getal in het midden twee keer zo breed.
{
  const fout1 = tekstVak('cijfer', G.C, G.C - G.R_STREEP_UIT + 4, G.FS_CIJFER, '4');
  const fout2 = tekstVak('snelheid', G.C, G.C, G.FS_SNEL, '999');
  const pl = V.boogPad(G.R_BOOG, G.L0, G.L1);
  const op = /M([-\d.]+) ([-\d.]+)/.exec(pl);
  const fout3 = tekstVak('waarde', +op[1], +op[2], G.FS_PLEK, '118°');
  waar('tegenproef: een cijfer op de streepjes wordt gezien', bogen.some(b => vakRaaktBoog(fout1, b[1], b[2], b[3], b[4])));
  waar('tegenproef: de snelheid op de naaf wordt gezien', raakt(fout2, vakken.find(v => v.naam === 'naaf')));
  waar('tegenproef: een waarde op de boog links wordt gezien', vakRaaktBoog(fout3, G.R_BOOG, G.B_BOOG, G.L0, G.L1));
  const breed = tekstVak('midden-getal', G.C, G.Y_MID, G.FS_MID, '9999+9999');
  waar('tegenproef: een getal in het midden dat te breed is raakt een boogwaarde',
    vakken.filter(v => /-waarde$/.test(v.naam)).some(v => raakt(v, breed)));
}

// ══ 2. DE AANSTURING ═══════════════════════════════════════════════
console.log('\n── 2. geen enkele invoer duwt de meter buiten zijn grenzen ──');
const raar = [0, 800, 4000, 7999, 8000, 8001, 99999, -1, -50, 1e12, -1e12, NaN, Infinity, -Infinity,
  null, undefined, '', '3000', 'NO DATA', {}, [], 0.0001];
const buitenToeren = [], buitenPlek = [], buitenTekst = [];
raar.forEach(v => {
  const s = V.stand('toeren', v);
  if (!(s.hoek >= G.A0 && s.hoek <= G.A1 && s.deel >= 0 && s.deel <= 100 && typeof s.tekst === 'string' && s.tekst.length <= 4))
    buitenToeren.push(String(v) + ' → ' + JSON.stringify(s));
  // De plekken: nooit langer dan hun vak, voor elke eenheid. Op een boog
  // vier tekens min het ° of %, in het midden en het vak vijf.
  [['°C', 3], ['%', 3], ['V', 4], ['L/100km', 5], ['km', 5], ['', 5]].forEach(x => {
    const t = V.plekGetal(v, x[0], x[1]); if (t.length > x[1]) buitenPlek.push(x[0] + ' ' + String(v) + ' → "' + t + '"');
  });
  // Het lampje en de snelheid.
  [['accu', 4], ['snel', 3]].forEach(x => {
    const t = V.tekst(x[0], v); if (t.length > x[1]) buitenTekst.push(x[0] + ' ' + String(v) + ' → "' + t + '"');
  });
});
waar('toeren: hoek binnen de schaal, vulling 0–100, tekst ≤ 4 tekens', buitenToeren.length === 0, buitenToeren.join(' | '));
waar('het getal van een plek blijft binnen zijn vak, voor elke eenheid', buitenPlek.length === 0, buitenPlek.join(' | '));
waar('de accu en de snelheid blijven binnen hun vak', buitenTekst.length === 0, buitenTekst.join(' | '));

waar('4000 rpm staat midden op de schaal (0°)', Math.abs(V.stand('toeren', 4000).hoek) < 0.01, V.stand('toeren', 4000).hoek);
waar('99999 rpm staat op het laatste streepje, niet erachter', V.stand('toeren', 99999).hoek === G.A1);
waar('−50 rpm staat op het eerste streepje, niet ervoor', V.stand('toeren', -50).hoek === G.A0);
waar('NaN is leeg en de naald blijft op het begin', V.stand('toeren', NaN).leeg && V.stand('toeren', NaN).hoek === G.A0);
waar('"NO DATA" is leeg, geen 0', V.stand('toeren', 'NO DATA').leeg && V.stand('toeren', 'NO DATA').tekst === '—');
waar('een ontbrekende snelheid is een streepje, geen 0', V.tekst('snel', undefined) === '—');
console.log('\n── de getallen en schalen van de plekken (08-10-2026) ──');
waar('verbruik 6,43 l/100 km: "6,4" met een komma', V.plekGetal(6.43, 'L/100km') === '6,4', V.plekGetal(6.43, 'L/100km'));
waar('koelwater 91,6 °C: een heel getal', V.plekGetal(91.6, '°C', 3) === '92');
waar('bereik 312,4 km: een heel getal vanaf 100', V.plekGetal(312.4, 'km') === '312');
waar('accu 13,94 V op een boog: "13,9"', V.plekGetal(13.94, 'V', 4) === '13,9');
waar('te breed: eerst zonder decimaal, dan "999+"', V.plekGetal(1234.5, 'kPa', 4) === '1235' && V.plekGetal(12345.6, 'kPa', 4) === '999+' && V.plekGetal(99.94, 'bar', 3) === '100' && V.plekGetal(-12.34, 'kPa', 4) === '−12');
waar('"NO DATA" is een streepje, geen 0', V.plekGetal('NO DATA', '%') === '—' && V.plekGetal(undefined, 'km') === '—');
waar('de eenheid leesbaar: L/100km wordt l/100 km, L/h wordt l/u', V.plekEenheid('L/100km') === 'l/100 km' && V.plekEenheid('L/h') === 'l/u' && V.plekEenheid('kPa') === 'kPa');
const D = A.ALL_PID_DEFS;
waar('koelwater op een boog: 40…130 (niet −40…215 uit de definitie)', JSON.stringify(V.boogSchaal('0105', D['0105'])) === '[40,130]');
waar('een sensor met een begrensde schaal kan op een boog (inlaatdruk 0…255)', JSON.stringify(V.boogSchaal('010B', D['010B'])) === JSON.stringify([D['010B'].min, D['010B'].max]));
waar('een eigen sensor zonder bereik (1e9) kan niet op een boog, wel als getal',
  V.boogSchaal('221310', { name: 'Olie', unit: '°C', min: -1e9, max: 1e9 }) === null && V.getalKan('221310', { name: 'Olie', unit: '°C', min: -1e9, max: 1e9 }));
waar('een tekst-PID (brandstofsysteem 0103) kan nergens', V.boogSchaal('0103', D['0103']) === null && !V.getalKan('0103', D['0103']));
waar('toerental en snelheid staan al op de meter: niet op een plek', !V.getalKan('010C', D['010C']) && !V.getalKan('010D', D['010D']) && V.boogSchaal('010D', D['010D']) === null);
waar('zonder definitie niets', V.boogSchaal('22ABCD', null) === null && !V.getalKan('22ABCD', null));
// De keten van een plek: de eigen keuze vooraan, maar alleen als hij past.
const PL = (rol) => V.PLEKKEN.find(x => x.rol === rol);
waar('een gekozen sensor gaat vóór de vaste keten', JSON.stringify(V.plekKeten(PL('links'), { 'basis/links': '015C' })) === JSON.stringify(['015C', '0105', '0167']));
waar('een gekozen sensor die niet op een boog past telt niet', JSON.stringify(V.plekKeten(PL('links'), { 'basis/links': '0103' })) === JSON.stringify(['0105', '0167']));
waar('zonder keuze de vaste keten', JSON.stringify(V.plekKeten(PL('midden'), {})) === JSON.stringify(['CA03', 'CA02', '015E']));
waar('een keuze van een profiel geldt niet voor de Basismeter', JSON.stringify(V.plekKeten(PL('rechts'), { 'temp/rechts': '0142' })) === JSON.stringify(['012F']));
waar('het oordeel: koelwater 45 °C is blauw, brandstof 8 % oranje', V.plekStaat('0105', 45, D['0105']) === 'koud' && V.plekStaat('012F', 8, D['012F']) === 'warn');
waar('het oordeel van een andere sensor: de grenzen uit zijn definitie', V.plekStaat('0105', D['0105'].dH, D['0105']) === 'danger' && V.plekStaat('010B', 50, D['010B']) === 'ok');

console.log('\n── de kleuren van de plekken en het acculampje ──');
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
waar('de plekken: koelwater links, brandstof rechts, verbruik in het midden, bereik in het vak',
  r.i.plekken.links === '0105' && r.i.plekken.rechts === '012F' && r.i.plekken.midden === null && r.i.plekken.vak === null &&
  Object.keys(r.i.plekken).join() === 'links,rechts,midden,vak', JSON.stringify(r.i.plekken));
waar('de accuspanning hoort bij het lampje rechtsboven (#371)', r.i.lamp.volt === '0142', JSON.stringify(r.i.lamp));
waar('…en wordt dus niet geremd', r.c.PLVisueel.gebruiktePids(r.i).has('0142'));
waar('geen onderboog meer: olie, pedaal en laaddruk staan niet vanzelf op de meter', !('onder' in r.i) &&
  ['015C', '0149', '010B'].every(p => JSON.stringify(r.i.plekken).indexOf(p) < 0), JSON.stringify(r.i));
waar('luchtmassa staat nergens op de meter', JSON.stringify(r.i).indexOf('0110') < 0);
waar('motorbelasting staat alleen bij het motorlampje (sinds 26-09)', r.i.lamp.belasting === '0104' &&
  JSON.stringify(Object.assign({}, r.i, { lamp: null })).indexOf('0104') < 0, JSON.stringify(r.i));
r = ind({ actief: ['010C', '010D', '0105', '012F', 'CA03', 'CA09'] });
waar('verbruik nu in het midden en het bereik in het vak, als de auto ze heeft', r.i.plekken.midden === 'CA03' && r.i.plekken.vak === 'CA09', JSON.stringify(r.i.plekken));
r = ind({ actief: ['010C', '0167', '015E'] });
waar('zonder 0105 wordt het 0167, zonder berekend verbruik het brandstofdebiet', r.i.plekken.links === '0167' && r.i.plekken.midden === '015E', JSON.stringify(r.i.plekken));
r = ind({ actief: ['010C', '0105', '0167'], dood: ['0105'] });
waar('een dode 0105 valt door naar 0167', r.i.plekken.links === '0167');
r = ind({ actief: ['010C', '0105', '0167'], verborgen: ['0105'] });
waar('een verborgen 0105 valt door naar 0167', r.i.plekken.links === '0167');
// Zelf gekozen (08-10-2026): de echte PLVisProfiel met de keuze in zijn opslag.
r = ind({ actief: ['010C', '010D', '0105', '012F', '015C', '0142', 'CA03', '010B'], keuze: { 'basis/links': '015C', 'basis/rechts': '0142', 'basis/midden': '010B', 'basis/vak': '0105' } });
waar('zelf gekozen: olie links, accu rechts, inlaatdruk in het midden, koelwater in het vak',
  r.i.plekken.links === '015C' && r.i.plekken.rechts === '0142' && r.i.plekken.midden === '010B' && r.i.plekken.vak === '0105', JSON.stringify(r.i.plekken));
waar('…en die worden aangezet en niet geremd', ['015C', '0142', '010B'].every(p => r.c.PLVisueel.gebruiktePids(r.i).has(p)));
r = ind({ actief: ['010C', '0105', '012F'], keuze: { 'basis/links': '015C' } });
waar('een keuze die deze auto niet heeft: terug naar automatisch, nooit leger', r.i.plekken.links === '0105', JSON.stringify(r.i.plekken));
r = ind({ actief: ['010C', '0105', '012F', '0103'], keuze: { 'basis/rechts': '0103' } });
waar('een tekst-PID kan niet op een boog, ook niet als hij gekozen is', r.i.plekken.rechts === '012F', JSON.stringify(r.i.plekken));
r = ind({ actief: ['010D', '0149'] });
waar('zonder toerental: de vermogensnaald op het pedaal (#432)', r.i.naald === '0149' && r.i.naaldSoort === 'vermogen', JSON.stringify(r.i));
r = ind({ actief: ['010D'] });
waar('zonder toerental en zonder pedaal: geen naald, maar wel een indeling', r.i.naald === null && r.i.naaldSoort === null && r.i.midden === '010D');
r = ind({ actief: ['010C'] });
waar('niets voor de plekken of de accu: die blijven leeg', Object.keys(r.i.plekken).every(k => r.i.plekken[k] === null) && !r.i.lamp.volt);

console.log('\n── het gemeten tempo laat een trage vraag onder de vermogensnaald doorvallen ──');
// Sinds 08-10-2026 staat er geen pedaalrij meer; het tempo-oordeel geldt nu
// voor de vraag onder de vermogensnaald (VRAAG_KETEN: 015A → 0149 → 014A).
// Dezelfde proeven, op een hybride met 0149 en 014A.
// Rijdend: sinds #338 oordeelt het tempo alleen tijdens het rijden.
function metTempo(actief, pid, stap, n, voorStart, kmh) {
  const c = maak({ motor: 'hybride', actief: actief });
  c.pidVals['010D'] = kmh === undefined ? 50 : kmh;
  c.PLVisueel.start();
  const t0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist[pid] = [];
  (voorStart || []).forEach(t => c.pidHist[pid].push({ t: c.PLVisueel.staat().start - t, v: 20 }));
  for (let k = 0; k < n; k++) c.pidHist[pid].push({ t: t0 + k * stap, v: 20 });
  c.PLVisueel.beoordeelTempo(pid);
  return c;
}
let c1 = metTempo(['010C', '0149', '014A'], '0149', 1000, 12);
waar('pedaal elke seconde: valt door naar de volgende (0111)', c1.PLVisueel.indeling().naald === '014A', JSON.stringify(c1.PLVisueel.indeling().plekken));
c1 = metTempo(['010C', '0149'], '0149', 1000, 12);
waar('pedaal elke seconde en niets anders: terug naar de toerennaald', c1.PLVisueel.indeling().naald === '010C');
c1 = metTempo(['010C', '0149'], '0149', 250, 12);
waar('pedaal elke 250 ms: blijft staan', c1.PLVisueel.indeling().naald === '0149');
c1 = metTempo(['010C', '0149'], '0149', 1000, 5);
waar('te weinig metingen: nog geen oordeel, blijft staan', c1.PLVisueel.indeling().naald === '0149');
c1 = metTempo(['010C', '0149'], '0149', 250, 3, [9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000]);
waar('trage metingen van vóór het openen tellen niet mee', c1.PLVisueel.indeling().naald === '0149');
c1 = metTempo(['010C', '0149'], '0149', 1000, 12);
c1.pidHist['0149'] = c1.pidHist['0149'].map((x, k) => ({ t: x.t - 1000 * k + 200 * k, v: 20 }));
c1.PLVisueel.beoordeelTempo('0149');
waar('eenmaal te traag, blijft hij eraf (geen heen-en-weer)', c1.PLVisueel.indeling().naald === '010C');
// De tik beoordeelt het pedaal zelf: zonder die aanroep blijft een traag
// pedaal in zijn rij staan, hoe traag het ook binnenkomt.
{
  const c = maak({ motor: 'hybride', actief: ['010C', '0149', '014A'] });
  c.document = { getElementById: function () { return null; }, body: null };
  c.pidVals['010D'] = 50;
  c.PLVisueel.start();
  const t0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist['0149'] = [];
  for (let k = 0; k < 12; k++) c.pidHist['0149'].push({ t: t0 + k * 1000, v: 20 });
  c.PLVisueel.tik();
  waar('de tik beoordeelt het tempo van de vraag onder de vermogensnaald', c.PLVisueel.staat().traag.indexOf('0149') >= 0 && c.PLVisueel.indeling().naald === '014A',
    JSON.stringify(c.PLVisueel.staat().traag));
}

console.log('\n── #338: alleen het rijden telt, en de reden van elke herbouw ──');
{
  // Testrun 8.3: stilstand en 157 s op de achtergrond, en het pedaal was de
  // hele rit weg terwijl het rijdend 786 ms haalde.
  let c = metTempo(['010C', '0149', '014A'], '0149', 1000, 12, null, 0);
  waar('stilstaand elke seconde: geen oordeel, het pedaal blijft (stilstand zegt niets over de weg)', c.PLVisueel.indeling().naald === '0149');
  c.pidVals['010D'] = 50; c.PLVisueel.beoordeelTempo('0149');
  waar('TEGENPROEF: dezelfde metingen rijdend: valt door naar 0111', c.PLVisueel.indeling().naald === '014A');

  // De app op de achtergrond: de timers vriezen, de metingen ervóór zijn
  // traag. Na de terugkeer begint het venster opnieuw.
  function achtergrond(sprong) {
    const k = maak({ motor: 'hybride', actief: ['010C', '0149', '014A'] });
    k.document = { getElementById: function () { return null; }, body: null };
    k.pidVals['010D'] = 50;
    k.PLVisueel.start();
    const s0 = k.PLVisueel.staat().start + k.PLVisueel.AANLOOP_MS;
    k.pidHist['0149'] = [];
    // Twintig seconden rijden in beeld, met een tik per seconde en een traag pedaal.
    for (let i = 0; i < 20; i++) { k.pidHist['0149'].push({ t: s0 + i * 1000, v: 20 }); k.T.t = s0 + i * 1000; k.PLVisueel.rijVenster(k.T.t); }
    k.T.t += sprong; k.PLVisueel.rijVenster(k.T.t);                                         // de eerste tik na de sprong
    for (let i = 1; i <= 12; i++) k.pidHist['0149'].push({ t: k.T.t + i * 250, v: 20 });  // daarna vlot
    k.T.t += 2500;
    k.PLVisueel.tik();
    return k;
  }
  // 30 s en niet 157: dat valt binnen het venster van een minuut, zodat
  // alleen de gatdetectie het verschil maakt en niet het venster zelf.
  c = achtergrond(30000);
  waar('na 30 s op de achtergrond telt alleen het stuk erna: het pedaal blijft', c.PLVisueel.indeling().naald === '0149',
    JSON.stringify(c.PLVisueel.staat()));
  c = achtergrond(1000);
  waar('TEGENPROEF: zonder gat (één tik later) tellen de trage metingen wel en valt het pedaal', c.PLVisueel.indeling().naald === '014A');

  // Een andere lezer nam de bus (groepsproef, waakronde): ook dan opnieuw.
  c = maak({ motor: 'hybride', actief: ['010C', '0149', '014A'] });
  c.document = { getElementById: function () { return null; }, body: null };
  c.pidVals['010D'] = 50;
  c.PLVisueel.start();
  let s0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist['0149'] = [];
  for (let i = 0; i < 20; i++) { c.pidHist['0149'].push({ t: s0 + i * 1000, v: 20 }); c.T.t = s0 + i * 1000; c.PLVisueel.rijVenster(c.T.t); }
  c.__pauze = 8000;                                                                     // de bus was twee minuten bezet
  for (let i = 1; i <= 12; i++) c.pidHist['0149'].push({ t: c.T.t + i * 250, v: 20 });
  c.T.t += 1000; c.PLVisueel.rijVenster(c.T.t);
  c.T.t += 2500; c.PLVisueel.tik();
  waar('na een buspauze telt alleen het stuk erna: het pedaal blijft', c.PLVisueel.indeling().naald === '0149');
  // TEGENPROEF: precies hetzelfde zonder pauze, dan tellen de trage metingen.
  c.PLVisueel.stop(); c.__pauze = 8000;
  c.PLVisueel.start(); c.pidHist['0149'] = []; s0 = c.T.t;
  for (let i = 0; i < 20; i++) { c.pidHist['0149'].push({ t: s0 + i * 1000, v: 20 }); c.T.t = s0 + i * 1000; c.PLVisueel.rijVenster(c.T.t); }
  for (let i = 1; i <= 12; i++) c.pidHist['0149'].push({ t: c.T.t + 1000 + i * 250, v: 20 });
  c.T.t += 1000; c.PLVisueel.rijVenster(c.T.t);
  c.T.t += 2500; c.PLVisueel.tik();
  waar('TEGENPROEF: zonder buspauze vallen dezelfde metingen wel van de meter', c.PLVisueel.indeling().naald === '014A');

  // Beeld-in-beeld of achtergrond met de meetdienst aan: geen gat, wel traag.
  for (const [naam, doc] of [['op de achtergrond (document.hidden)', { hidden: true, body: null }],
                             ['in beeld-in-beeld (body.pl-pip)', { hidden: false, body: { classList: { contains: (k) => k === 'pl-pip' } } }]]) {
    const k = maak({ motor: 'hybride', actief: ['010C', '0149', '014A'] });
    k.pidVals['010D'] = 50;
    k.PLVisueel.start();
    k.document = doc;
    const t0k = k.PLVisueel.staat().start + k.PLVisueel.AANLOOP_MS;
    k.pidHist['0149'] = [];
    for (let i = 0; i < 12; i++) k.pidHist['0149'].push({ t: t0k + i * 1000, v: 20 });
    k.PLVisueel.beoordeelTempo('0149');
    waar('rijdend ' + naam + ', elke seconde: geen oordeel, het pedaal blijft', k.PLVisueel.indeling().naald === '0149');
    k.document = { hidden: false, body: null };
    k.PLVisueel.beoordeelTempo('0149');
    waar('TEGENPROEF: dezelfde metingen met de meter in beeld: valt door', k.PLVisueel.indeling().naald === '014A');
  }

  // Het venster is de laatste minuut: een traag stuk van lang geleden telt niet.
  c = maak({ motor: 'hybride', actief: ['010C', '0149', '014A'] });
  c.pidVals['010D'] = 50;
  c.PLVisueel.start();
  s0 = c.PLVisueel.staat().start + c.PLVisueel.AANLOOP_MS;
  c.pidHist['0149'] = [];
  for (let i = 0; i < 12; i++) c.pidHist['0149'].push({ t: s0 + i * 1000, v: 20 });
  for (let i = 1; i <= 240; i++) c.pidHist['0149'].push({ t: s0 + 11000 + i * 250, v: 20 });
  c.T.t = s0 + 11000 + 240 * 250;
  c.PLVisueel.beoordeelTempo('0149');
  waar('een traag stuk van een minuut geleden telt niet mee (venster ' + c.PLVisueel.VENSTER_MS / 1000 + ' s)', c.PLVisueel.indeling().naald === '0149');

  // Herbouwen met een reden.
  const h = maak({ actief: ['010C', '010D', '0149'] });
  h.document = { getElementById: function () { return null; }, body: null };
  h.connected = true; h.demoMode = false;
  const g = { innerHTML: '', querySelector: function () { return null; } };
  h.PLVisueel.start();
  h.PLVisueel.bouw(g);                       // openen
  h.PLVisueel.bouw(g);                       // dezelfde keuze, geen testrun: scherm
  h.activePIDs.add('0105'); h.PLVisueel.bouw(g);   // selectie
  h.PLTestrunLive = { bezig: function () { return true; } }; h.PLVisueel.bouw(g);   // testrun
  delete h.PLTestrunLive;
  h.PLVisueel.bouw(g, 'indeling');
  const R = h.PLVisueel.sessie().herbouwReden;
  waar('elke herbouw heeft een reden: openen, scherm, selectie, testrun, indeling',
    R.openen === 1 && R.scherm === 1 && R.selectie === 1 && R.testrun === 1 && R.indeling === 1, JSON.stringify(R));
  waar('een klant ziet er twee zonder dat hij erom vroeg (scherm en indeling)', h.PLVisueel.herbouwKlant(h.PLVisueel.sessie()) === 2);
  const Sx = (o) => Object.assign({ openMs: 600000, rijdendMs: 600000, dof: 0, herbouw: 10 }, o);
  waar('rust: tien herbouwen door de testrun en de keuze is geen knipperen',
    V.rustOordeel(Sx({ herbouwReden: { openen: 2, selectie: 4, testrun: 4 } })).staat === 'ok');
  waar('TEGENPROEF: tien herbouwen die niemand vroeg wel', V.rustOordeel(Sx({ herbouwReden: { scherm: 6, indeling: 4 } })).staat === 'FOUT');

  // De app-maten: onder drie minuten rijdend niet gemeten (null).
  waar('app-maten zonder rit: van-meter en herbouw null, rijdend 0',
    h.PLVisueel.maat('visueel-van-meter') === null && h.PLVisueel.maat('visueel-herbouw-klant') === null && h.PLVisueel.maat('visueel-rijdend-min') === 0);
}

console.log('\n── een oud antwoord ──');
const o = maak({ actief: ['010C'] });
o._pidLastUpd['010C'] = 1000000;
waar('net binnen: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 500));
// Sinds 28-09-2026 is de ondergrens 5 s: een hapering van 3 à 4 s (acht
// banden via een ander ECU-adres) gaf een flits op het toerental.
o.__poging = { '010C': 1000000 + 2000 };
waar('3,5 s zonder antwoord bij een 120 ms-PID, wel gevraagd: nog niet oud (geen flits bij een korte hapering)', !o.PLVisueel.isOud('010C', 1000000 + 3500));
waar('5,5 s stil terwijl hij wel gevraagd is: oud', o.PLVisueel.isOud('010C', 1000000 + 5500));
o.__poging = {};
waar('5,5 s stil en niet meer gevraagd: nog niet oud — hij was niet aan de beurt (07-10-2026)', !o.PLVisueel.isOud('010C', 1000000 + 5500));
o.__poging = { '010C': 1000000 + 2000 };
o.__pauze = 5000; o._pidLastUpdPause['010C'] = 0;
waar('dezelfde 5,5 s maar de bus was bezet door een andere lezer: niet oud', !o.PLVisueel.isOud('010C', 1000000 + 5500));
waar('nog nooit iets binnen is leeg, niet oud', !o.PLVisueel.isOud('010D', 1000000 + 99999));
o.__pauze = 0; o.__poging = {};
waar('niet gevraagd, maar een minuut stil: toch oud — het getal is geen "nu" meer', o.PLVisueel.isOud('010C', 1000000 + 61000));
{
  // De klacht van 07-10-2026: een trage sensor (10 s) die achteraan de pollus
  // staat en pas na 40 s weer gevraagd wordt, ging grijs.
  const tr = maak({ actief: ['0105'] });
  tr.__tempo = { '0105': 10000 };
  tr._pidLastUpd['0105'] = 1000000;
  waar('trage sensor, 40 s stil en nog niet aan de beurt: niet grijs', !tr.PLVisueel.isOud('0105', 1000000 + 40000));
  tr.__poging = { '0105': 1000000 + 35000 };
  waar('TEGENPROEF: dezelfde 40 s, maar gevraagd zonder antwoord: wel grijs', tr.PLVisueel.isOud('0105', 1000000 + 40000));
  tr.__poging = {};
  [0, 20000, 40000, 60000, 80000].forEach(function (t, i) { (tr.pidHist['0105'] = tr.pidHist['0105'] || []).push({ t: 1000000 - 80000 + t, v: 90 }); });
  tr.__poging = { '0105': 1000000 + 1000 };
  waar('gemeten elke 20 s (trager dan zijn 10 s): 50 s stil en gevraagd is nog binnen 3× het gemeten tempo', !tr.PLVisueel.isOud('0105', 1000000 + 50000));
  waar('maar 65 s wel', tr.PLVisueel.isOud('0105', 1000000 + 65000));
  tr.__tempo = { '0105': 999999 };
  waar('op verzoek (999999): stilte is bedoeld, nooit grijs', !tr.PLVisueel.isOud('0105', 1000000 + 9999999));
}

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
waar('de snelkoppelingen voor een beheerder: rit-monitor, bulk-recorder en waakronde (caravanrit niet meer, 27-09)',
  m.snel.map(s => s.id).join(',') === 'monitor,bulk,waak', m.snel.map(s => s.id).join(','));
m = V.meldingen(run(), [], false);
waar('voor een gewone gebruiker geen bulk-recorder (die weigert daar toch)',
  m.snel.map(s => s.id).join(',') === 'monitor,waak', m.snel.map(s => s.id).join(','));
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
const plaatD = V.wijzerplaat(4500, 6000);
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
waar('geen aandrijfoordeel en geen spanning: beide lampjes uit', !L(null, 'benzine').motor && !L(null, 'benzine').accu);
waar('onbekend: geen motorlampje', !L({ toestand: 'ONBEKEND' }, 'benzine').motor);
let l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine');
waar('benzine, motor draait, geen spanning: links "Motor aan", rechts niets', l.motor && l.motor.soort === 'aan' && !l.accu, JSON.stringify(l));
l = L({ toestand: 'STARTSTOP', zekerheid: 'hoog' }, 'benzine');
waar('start/stop-stop: links "Start/stop actief"', l.motor && l.motor.kop === 'Start/stop' && l.motor.waarde === 'actief', JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine', { belasting: 34.4 });
waar('motor draait met belasting: "Motor aan" als kop, 34% als waarde, balkje op 34',
  l.motor.kop === 'Motor aan' && l.motor.waarde === '34%' && l.motor.balk === 34, JSON.stringify(l));
l = L({ toestand: 'STARTSTOP', zekerheid: 'hoog' }, 'benzine', { belasting: 34 });
waar('in een start/stop-stop geen belasting (de motor staat stil)', l.motor.waarde === 'actief' && l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine', { belasting: 'NO DATA' });
waar('onleesbare belasting: gewoon "aan", geen balkje', l.motor.waarde === 'aan' && l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'UIT_VOOR_START', zekerheid: 'laag' }, 'benzine');
waar('lage zekerheid staat op het lampje (twijfel), niet als feit', l.motor && l.motor.twijfel, JSON.stringify(l));

// De accu rechtsboven (#371): een gewone auto één accu met de spanning.
l = L({ toestand: 'STARTSTOP', zekerheid: 'hoog' }, 'benzine', { volt: 12.2, rpm: 0 });
waar('benzine: rechts één accu met "12,2 V", icoon accu, net als het motorlampje een kop en een balkje',
  l.accu && !l.accu.dubbel && l.accu.icoon === 'accu' && l.accu.kop === 'Accu' && l.accu.waarde === '12,2 V' && l.accu.balk === 30, JSON.stringify(l.accu));
waar('…groen: 12,2 V bij een stilstaande motor is goed', /\bok\b/.test(l.accu.soort), l.accu.soort);
l = L({ toestand: 'DRAAIT_STIL', zekerheid: 'hoog' }, 'benzine', { volt: 12.4, rpm: 800 });
waar('12,4 V met draaiende motor: oranje, de dynamo laadt niet', /\bwarn\b/.test(l.accu.soort), JSON.stringify(l.accu));
l = L(null, 'benzine', { volt: 11.2 });
waar('de accu brandt ook zonder oordeel over de motor — en 11,2 V is rood', !l.motor && l.accu && /\bdanger\b/.test(l.accu.soort), JSON.stringify(l));
l = L(null, 'benzine', { volt: 99 });
waar('een spanning buiten de schaal: balkje hooguit vol, tekst in zijn vak', l.accu.balk === 100 && l.accu.waarde.length <= 6, JSON.stringify(l.accu));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'benzine', { volt: 'NO DATA' });
waar('onleesbare spanning op een benzineauto: geen acculampje', !l.accu, JSON.stringify(l));

// Het acculampje flitste weg (06-10-2026): een oude spanning gaf null, en dan
// verdween het hele lampje tot de volgende meting van 0142.
l = L(null, 'benzine', { volt: 12.6, voltOud: true });
waar('een oude spanning: het acculampje blijft staan, dof', l.accu && /\boud\b/.test(l.accu.soort) && l.accu.waarde === '12,6 V', JSON.stringify(l.accu));
waar('TEGENPROEF: een verse spanning is niet dof', !/\boud\b/.test(L(null, 'benzine', { volt: 12.6 }).accu.soort));
{
  const Ac = maak({ actief: ['010C', '0142'] });
  const nu = Date.now();
  Ac.pidVals['0142'] = 12.6;
  Ac._pidLastUpd['0142'] = nu - 8000;   // ruim boven 3× het tempo en de 5 s-grens
  Ac.__poging = { '0142': nu - 3000 };  // en gevraagd zonder antwoord (plOud, 07-10-2026)
  const g = Ac.PLVisueel.accuGetal('0142', nu);
  waar('accuGetal: 8 s oud geeft de waarde terug, gemerkt als oud', g && g.v === 12.6 && g.oud === true, JSON.stringify(g));
  waar('TEGENPROEF: lampGetal gooit dezelfde waarde weg — dáárom verdween het lampje', Ac.PLVisueel.isOud('0142', nu) === true);
  Ac._pidLastUpd['0142'] = nu - Ac.PLVisueel.VIS_ACCU_VERGEET_MS - 1000;
  waar('accuGetal: na een minuut zonder antwoord pas weg', Ac.PLVisueel.accuGetal('0142', nu) === null);
}

// Een hybride: twee accu's in één lampje.
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog', bewijstHybride: true }, 'benzine', { accu: 61.7, volt: 14.1 });
waar('rijden met stille motor bewijst een hybride, ook met "benzine" op het kenteken: twee accu\'s',
  l.accu && l.accu.dubbel && l.accu.icoon === 'accudubbel' && l.accu.soort === 'ev' && l.accu.kop === 'Elektrisch' && l.motor.soort === 'uit', JSON.stringify(l));
waar('…aandrijfaccu 62% met het balkje, 12V-net 14,1 V', l.accu.hv === '62%' && l.accu.balk === 62 && l.accu.volt === '14,1 V', JSON.stringify(l.accu));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'hybride', { belasting: 48, accu: 55, volt: 12.5, rpm: 1800 });
waar('hybride, samen aan: links de belasting, rechts "Hybride actief" met 55% en de 12 V oranje (laadt niet)',
  l.motor.waarde === '48%' && l.accu.kop === 'Hybride actief' && l.accu.soort === 'hyb' && l.accu.hv === '55%' && l.accu.ernst12 === 'warn', JSON.stringify(l));
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog' }, 'hybride', { belasting: 20, accu: 61.7 });
waar('elektrisch rijden: links geen belasting', l.motor.balk === null, JSON.stringify(l));
l = L({ toestand: 'DRAAIT_RIJDT', zekerheid: 'hoog' }, 'hybride', { accu: 180 });
waar('een accupercentage buiten 0–100 blijft binnen zijn vak', l.accu.hv === '100%' && l.accu.balk === 100, JSON.stringify(l));
l = L(null, 'hybride', {});
waar('hybride zonder getallen: toch het dubbele lampje, met streepjes in plaats van nullen',
  l.accu && l.accu.dubbel && l.accu.hv === '—' && l.accu.volt === '—' && l.accu.balk === null, JSON.stringify(l.accu));
l = L({ toestand: 'ACCU_RIJDT', zekerheid: 'hoog' }, 'ev', { accu: 80 });
waar('een volledig elektrische auto: geen motorlampje, wel de twee accu\'s', !l.motor && l.accu && l.accu.dubbel, JSON.stringify(l));
const Al = maak({ actief: ['010C', '0104', '015B', '0142'] });
const indL = Al.PLVisueel.indeling();
waar('belasting, aandrijfaccu en spanning horen bij de indeling', indL.lamp.belasting === '0104' && indL.lamp.accu === '015B' && indL.lamp.volt === '0142', JSON.stringify(indL.lamp));
waar('…en worden dus niet geremd', ['0104', '015B', '0142'].every(p => Al.PLVisueel.gebruiktePids(indL).has(p)));

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
waar('open: gasklep, tweede pedaalsensor, ontsteking en luchtmassa geremd',
  ['0111', '015A', '010E', '0110'].every(p => na[p] >= R.PLVisueel.REM_MS), JSON.stringify(na));
// Sinds 08-10-2026 staat het pedaal niet meer vanzelf op de Basismeter, dus
// wordt het net als de rest geremd; wie het op een plek zet houdt het snel.
waar('open: het pedaal staat niet meer vanzelf op de meter en wordt dus geremd', na['0149'] >= R.PLVisueel.REM_MS, JSON.stringify(na));
waar('open: de motorbelasting staat bij het lampje en blijft op tempo', na['0104'] === voor['0104'], JSON.stringify(na));
waar('open: toerental en snelheid ongemoeid', ['010C', '010D'].every(p => na[p] === voor[p]), JSON.stringify(na));
waar('open: koelwater en olie waren al traag en blijven zoals ze waren', na['0105'] === voor['0105'] && na['015C'] === voor['015C']);
R.PLVisueel.stop();
waar('weer dicht: alles terug op het oude tempo', ALLE.every(p => R.pidPollInterval(p) === voor[p]));
const R2 = maak({ actief: ['010C', '0149', '0111'], keuze: { 'basis/midden': '0149' } });
R2._focusPIDs = new Set(); R2._pollMult = 1; R2.actiefPollProfiel = () => 'monitor'; R2.PLLoad = { mult: () => 1, cfg: {} };
vm.runInContext(knip(lees('pidlane-plload.js'), 'function pidPollInterval(pid){', '// Welke PIDs zijn NU "due"', 'pidPollInterval') + '\nwindow.pidPollInterval = pidPollInterval;', R2);
R2.PLVisueel.start();
waar('het pedaal zelf op een plek gezet: niet geremd, de gasklep wel', R2.pidPollInterval('0149') < R2.PLVisueel.REM_MS && R2.pidPollInterval('0111') >= R2.PLVisueel.REM_MS,
  R2.pidPollInterval('0149') + ' / ' + R2.pidPollInterval('0111'));

console.log('\n— trekmodus: caravan of beladen (27-09-2026) —');
{
  const V = maak({ actief: ['010C', '010D', '0105'] }).PLVisueel;
  const t0 = 1e9;
  const stijg = Array.from({ length: 13 }, (_, i) => ({ t: t0 + i * 5000, v: 95 + i * 0.25 }));   // 3 °C/min
  const tr = V.koelTrend(stijg, t0 + 60000);
  waar('koelTrend: 0,25 °C per 5 s is 3 °C per minuut', tr === 3, String(tr));
  waar('koelTrend: vlak is 0', V.koelTrend(stijg.map(x => ({ t: x.t, v: 90 })), t0 + 60000) === 0);
  waar('koelTrend: vier metingen is te weinig (null, geen 0)', V.koelTrend(stijg.slice(-4), t0 + 60000) === null);
  waar('koelTrend: vijf metingen binnen 16 s is te kort', V.koelTrend(stijg.slice(0, 5).map((x, i) => ({ t: t0 + i * 4000, v: x.v })), t0 + 16000) === null);
  waar('koelTrend: oude metingen buiten het venster tellen niet',
    V.koelTrend(stijg.map(x => ({ t: x.t - 120000, v: x.v })), t0 + 60000) === null);
  const heeft = new Set(['0105', '0104', '010F', 'CA03']);
  const ind = V.trekIndeling(p => heeft.has(p), false);
  const rol = r => ind.find(x => x.rol === r);
  waar('trekstrook: geen versnellingstegel meer — die staat in het midden van de meter', !rol('gear'), JSON.stringify(ind.map(x => x.rol)));
  waar('trekstrook: koelwater met trend, belasting 0104, verbruik uit CA03',
    rol('koel').pid === '0105' && rol('koel').trend && rol('last').pid === '0104' && rol('verbruik').pid === 'CA03', JSON.stringify(ind));
  waar('trekstrook: olie die de auto niet geeft blijft leeg (null, geen andere PID)', rol('olie').pid === null);
  waar('trekstrook: laaddruk alleen met bewezen turbo', !rol('laaddruk') && V.trekIndeling(p => heeft.has(p), true).some(x => x.rol === 'laaddruk'));
}

console.log('\n— 27-09-2026: trekmodus vanzelf, versnelling, staafjes, sensoren aanzetten —');
{
  const c = maak({ actief: ['010C', '010D'] }), V = c.PLVisueel;
  c.userVehicleData = { sit: [] };
  c.situatieActief = function () { return c.userVehicleData.sit.map(id => c.SITUATIES.find(s => s.id === id)).filter(Boolean); };
  waar('geen rijsituatie en geen Caravanrit: geen trekmodus', V.trekAan() === false);
  c.userVehicleData.sit = ['bergachtig'];
  waar('een andere rijsituatie (bergachtig) zet hem niet aan', V.trekAan() === false);
  c.userVehicleData.sit = ['beladen'];
  waar('rijsituatie beladen zet de trekmodus aan', V.trekAan() === true);
  c.userVehicleData.sit = ['caravan'];
  waar('rijsituatie caravan zet de trekmodus aan', V.trekAan() === true);
  waar('de situaties bestaan echt in SITUATIES', V.TREK_SITUATIES.every(id => c.SITUATIES.some(s => s.id === id)));
  c.userVehicleData.sit = [];
  c.PLRun = { staat: function () { return { caravan: { aan: true } }; } };
  waar('een lopende Caravanrit zet hem aan, ook zonder rijsituatie', V.trekAan() === true);
  waar('het oude handmatige vinkje (pl_vis_trek) bestaat niet meer', typeof V.trek === 'undefined' && typeof V.trekSensoren === 'undefined');
  waar('de caravanrit heeft geen snelkoppeling meer', !V.meldingen({ monitor: { aan: false }, caravan: { aan: false }, waak: { aan: false } }, [], true).snel.some(s => s.id === 'caravan'));

  waar('versnelling: 3 → "3", 0 → "N", −1 → "R", onbekend → ""',
    V.gearTekst(3) === '3' && V.gearTekst(0) === 'N' && V.gearTekst(-1) === 'R' && V.gearTekst(null) === '' && V.gearTekst(undefined) === '');
  const GG = V.G;
  waar('het icoon van een boog staat boven zijn waarde', GG.DY_ICOON_PLEK + GG.ICOON_PLEK / 2 < -0.6 * GG.FS_PLEK);

  const N = (heeft, actief, verb, trek) => V.nodigePids(new Set(heeft), new Set(actief || []), new Set(verb || []), trek);
  let k = N(['010C', '010D', '0105', '0167', '0142', '012F', '015C', '0149', '0104', '010F'], [], [], false);
  waar('sensoren aanzetten: per keten de eerste die de auto heeft — koelwater, brandstof en de accuspanning voor het lampje; geen olie of pedaal meer vanzelf',
    JSON.stringify(k) === JSON.stringify(['010C', '010D', '0105', '012F', '0142']), JSON.stringify(k));
  k = N(['010C', '010D', '0167', '0149', 'CA03'], ['010C', '010D'], [], false);
  waar('zonder 0105 wordt het 0167, en het verbruik komt erbij', JSON.stringify(k) === JSON.stringify(['0167', 'CA03']), JSON.stringify(k));
  k = N(['010C', '010D', '0105', '0167'], ['0167'], [], false);
  waar('staat er al een uit de keten aan, dan komt er niets bij', k.indexOf('0105') < 0, JSON.stringify(k));
  k = N(['010C', '010D', '0105'], [], ['0105'], false);
  waar('een verborgen sensor zet hij nooit terug', k.indexOf('0105') < 0, JSON.stringify(k));
  k = N(['010C', '0104', '010F', 'CA04'], ['010C'], [], true);
  waar('trekmodus: belasting en inlaatlucht erbij, laaddruk niet (pas na bewezen turbo)',
    k.indexOf('0104') >= 0 && k.indexOf('010F') >= 0 && k.indexOf('CA04') < 0, JSON.stringify(k));
  waar('zonder trekmodus geen treksensoren', N(['010C', '0104', '010F'], ['010C'], [], false).indexOf('0104') < 0);
  // De echte aanroep: via pidToevoegen, niet handmatig.
  let gevraagd = null;
  c.discoveredPIDDefs = [{ pid: '010C' }, { pid: '010D' }, { pid: '0105' }];
  c.pidToevoegen = function (p, o) { gevraagd = { p: p, o: o }; p.forEach(x => c.activePIDs.add(x)); return { ok: p, weg: [] }; };
  c.PLRun = null;
  const r = V.zorgPids();
  waar('zorgPids: vraagt 0105 aan via pidToevoegen, als geen handmatige keuze',
    JSON.stringify(r) === '["0105"]' && gevraagd.o.handmatig === false, JSON.stringify(gevraagd));
  waar('zorgPids: een tweede keer komt er niets meer bij', V.zorgPids().length === 0);
}

console.log('\n— sessiebewijs en oordelen voor blok 5 (#294, trekmodus) —');
{
  const V = maak({ actief: ['010C'] }).PLVisueel;
  const S = (o) => Object.assign({ openMs: 0, rijdendMs: 0, trekMs: 0, maxTrend: null, alarmen: 0, tempo: {}, onder: {}, turbo: false, traag: [], constant: { n: 0, som: 0, kmhSom: 0 } }, o);
  waar('#294: twee minuten rijdend is te weinig (LET OP)', V.ritOordeel(S({ rijdendMs: 120000 })).staat === 'LET OP');
  const goed = V.ritOordeel(S({ rijdendMs: 400000, tempo: { '0149': { max: 610 } }, onder: { pedaal: 400000 }, constant: { n: 20, som: 130, kmhSom: 1600 } }));
  waar('#294: pedaal bleef op de meter: ok, met het tempo en het verbruik bij constant rijden', goed.staat === 'ok' && /0149 610 ms/.test(goed.detail) && /6,5 l\/100 km bij constant 80/.test(goed.detail), goed.detail);
  waar('#294: pedaal van de meter gevallen: FOUT, met welke', V.ritOordeel(S({ rijdendMs: 400000, traag: ['0149'] })).staat === 'FOUT');
  waar('#294: olie is van nature traag en telt niet als gevallen', V.ritOordeel(S({ rijdendMs: 400000, traag: ['015C'] })).staat === 'ok');
  waar('#294: zonder constant stuk zegt het dat', /geen 30 s constant/.test(V.ritOordeel(S({ rijdendMs: 400000 })).detail));
  waar('trekmodus: drie minuten is te weinig (LET OP)', V.trekOordeel(S({ trekMs: 180000 })).staat === 'LET OP');
  waar('rust: twee minuten rijden is te weinig (LET OP)', V.rustOordeel(S({ rijdendMs: 120000, openMs: 120000 })).staat === 'LET OP');
  waar('rust: tien minuten, drie keer dof, twee herbouwen: ok', V.rustOordeel(S({ rijdendMs: 600000, openMs: 600000, dof: 3, herbouw: 2 })).staat === 'ok');
  waar('rust: dertig keer dof in tien minuten is knipperen (FOUT)', V.rustOordeel(S({ rijdendMs: 600000, openMs: 600000, dof: 30, herbouw: 2 })).staat === 'FOUT');
  waar('rust: tien herbouwen in tien minuten is knipperen (FOUT)', V.rustOordeel(S({ rijdendMs: 600000, openMs: 600000, dof: 0, herbouw: 10 })).staat === 'FOUT');
  const tr = V.trekOordeel(S({ trekMs: 600000, maxTrend: 2.4, alarmen: 1 }));
  waar('trekmodus: tien minuten, trend en waarschuwing in het verslag', tr.staat === 'ok' && /2,4 °C\/min/.test(tr.detail) && /1 waarschuwing\b/.test(tr.detail), tr.detail);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── de vermogensnaald (#432) ──');
{
  const N = V.VERMOGEN.NUL;
  // Welke naald.
  waar('benzine met toerental: toeren', V.naaldSoort('benzine', false, true, true) === 'toeren');
  waar('diesel met toerental: toeren', V.naaldSoort('diesel', false, true, true) === 'toeren');
  waar('hybride met toerental én pedaal: vermogen', V.naaldSoort('hybride', false, true, true) === 'vermogen');
  waar('EV: vermogen', V.naaldSoort('ev', false, true, true) === 'vermogen');
  waar('"benzine" maar accurijden gezien: vermogen (de meting wint)', V.naaldSoort('benzine', true, true, true) === 'vermogen');
  waar('hybride zonder pedaal maar met toerental: toeren (liever iets dan niets)', V.naaldSoort('hybride', false, true, false) === 'toeren');
  waar('benzine zonder toerental, met pedaal: vermogen', V.naaldSoort('benzine', false, false, true) === 'vermogen');
  waar('niets: geen naald', V.naaldSoort('benzine', false, false, false) === null);
  waar('de gasklep (0111) is geen vermogensvraag', V.VRAAG_KETEN.indexOf('0111') < 0);

  // De vraag uit het pedaal, zelflerend vanaf de rust.
  const leer = { min: null, max: null };
  waar('eerste waarde 15% is de rust: 0', V.vraagUit(15, leer) === 0);
  waar('15 + 30 bij een minimaal bereik van 60: 50%', Math.round(V.vraagUit(45, leer)) === 50);
  waar('vloer (75%): 100', V.vraagUit(75, leer) === 100);
  waar('boven het geleerde bereik: begrensd en het bereik groeit mee', V.vraagUit(95, leer) === 100 && leer.max === 95);
  waar('daarna is 75% geen 100 meer', V.vraagUit(75, leer) < 100);
  waar('geen getal: null, en het geleerde blijft', V.vraagUit('x', leer) === null && leer.min === 15);

  // De laadzone uit de snelheid.
  const h = (paren) => paren.map((p) => ({ t: p[0], v: p[1] }));
  waar('van 60 naar 54 in 1 s (6 km/h/s): 75%', Math.round(V.laadUit(h([[0, 60], [500, 57], [1000, 54]]), 1000)) === 75);
  waar('constant 60: 0', V.laadUit(h([[0, 60], [1000, 60]]), 1000) === 0);
  waar('optrekken: 0', V.laadUit(h([[0, 50], [1000, 56]]), 1000) === 0);
  waar('bijna stil: 0 (daar wint niets meer terug)', V.laadUit(h([[0, 10], [1000, 4]]), 1000) === 0);
  waar('één monster: null', V.laadUit(h([[1000, 60]]), 1000) === null);
  waar('te kort venster: null', V.laadUit(h([[800, 60], [1000, 50]]), 1000) === null);
  waar('oude monsters tellen niet', V.laadUit(h([[0, 90], [1000, 60], [2000, 60]]), 2000) === 0);
  waar('noodstop: begrensd op 100', V.laadUit(h([[0, 80], [1000, 50]]), 1000) === 100);

  // De stand.
  let s = V.vermogenStand(null, null);
  waar('niets: leeg, naald in rust op het nulpunt', s.leeg && s.deel === N && s.tekst === '—');
  s = V.vermogenStand(0, 0);
  waar('pedaal los, niet remmen: op nul', !s.leeg && s.deel === N && s.tekst === '0%');
  s = V.vermogenStand(100, 0);
  waar('vol gas: de naald aan het eind', s.deel === 100 && s.vraag === 100 && Math.abs(s.hoek - G.A1) < 1e-9);
  s = V.vermogenStand(1, 80);
  waar('pedaal los en vertragen: laden, links van nul', s.laden && s.deel < N && s.laad === 80 && s.tekst === 'laden');
  s = V.vermogenStand(40, 80);
  waar('gas geven wint van vertragen (wie gas geeft laadt niet)', !s.laden && s.deel > N && s.laad === 0);
  s = V.vermogenStand(500, -20);
  waar('een gekke waarde blijft binnen de schaal', s.deel <= 100 && s.deel >= 0 && s.hoek <= G.A1 && s.hoek >= G.A0);

  // De tekening: de laadzone en de vraagboog bestaan, de toerenboog niet.
  const plaat = V.wijzerplaat(null, 8000, 'vermogen');
  waar('vermogensplaat: laadboog en vraagboog', /id="vis-laadboog"/.test(plaat) && /id="vis-vraagboog"/.test(plaat));
  waar('vermogensplaat: geen toerenboog en geen 8', !/vis-toerenboog/.test(plaat) && !/>8</.test(plaat));
  waar('vermogensplaat: de naald rust op het nulpunt', new RegExp('rotate\\(' + (G.A0 + (G.A1 - G.A0) * N / 100) + 'deg\\)').test(plaat));
  const toer = V.wijzerplaat(null, 8000);
  waar('zonder soort blijft het de toerenplaat (niets veranderd voor benzine)', /vis-toerenboog/.test(toer) && !/vis-vraagboog/.test(toer));

  // De indeling: een hybride met toerental krijgt de vermogensnaald op het pedaal.
  let r2 = ind({ actief: ['010C', '010D', '0149'], motor: 'hybride' });
  waar('indeling hybride: vermogen op 0149, toerental blijft voor de accu', r2.i.naaldSoort === 'vermogen' && r2.i.naald === '0149' && r2.i.toeren === '010C', JSON.stringify(r2.i));
  r2 = ind({ actief: ['010C', '010D', '015A', '0149'], motor: 'hybride' });
  waar('indeling hybride: 015A (relatief) gaat voor 0149', r2.i.naald === '015A');
  r2 = ind({ actief: ['010C', '010D', '0149'], motor: 'benzine' });
  waar('indeling benzine: toeren op 010C', r2.i.naaldSoort === 'toeren' && r2.i.naald === '010C');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── de tegels van de energieweergave (#437) ──');
{
  const h = (paren) => paren.map((p) => ({ t: p[0], v: p[1] }));
  waar('versnelling: 50 → 56 in 1 s is +6,0', V.versnellingUit(h([[0, 50], [1000, 56]]), 1000) === 6);
  waar('versnelling: remmen is negatief', V.versnellingUit(h([[0, 60], [1000, 54]]), 1000) === -6);
  waar('versnelling: één monster is geen uitspraak', V.versnellingUit(h([[1000, 60]]), 1000) === null);
  waar('versnelling: hetzelfde venster als de laadzone', V.versnellingUit(h([[0, 90], [1000, 60], [2000, 60]]), 2000) === 0);

  // EV-aandeel: alleen rijtijd telt.
  let a = null, t = 0;
  for (let i = 0; i < 20; i++) { t += 1000; a = V.aandeelBij(a, 'ACCU_RIJDT', t); }
  for (let i = 0; i < 20; i++) { t += 1000; a = V.aandeelBij(a, 'DRAAIT_RIJDT', t); }
  waar('40 s gereden: daar is een uitspraak over', V.aandeelUit(a) !== null);
  waar('20 s accu en 20 s motor: 50% EV (het eerste monster telt niet)', V.aandeelUit(a) === Math.round(19000 / 39000 * 100), JSON.stringify(a));
  for (let i = 0; i < 60; i++) { t += 1000; a = V.aandeelBij(a, 'STARTSTOP', t); }
  waar('stilstaan voor het stoplicht telt niet mee', V.aandeelUit(a) === Math.round(19000 / 39000 * 100));
  let k = null; t = 0;
  for (let i = 0; i < 10; i++) { t += 1000; k = V.aandeelBij(k, 'ACCU_RIJDT', t); }
  waar('korter dan 30 s gereden: geen uitspraak', V.aandeelUit(k) === null);
  const gat = V.aandeelBij({ evMs: 0, rijMs: 0, t: 0 }, 'ACCU_RIJDT', 600000);
  waar('een gat van tien minuten (app op de achtergrond) telt hoogstens 5 s', gat.evMs === 5000);

  // Elektrisch bereik: geleerd uit km per procent.
  let l = null; t = 0; let soc = 60;
  for (let i = 0; i < 120; i++) { t += 1000; if (i % 40 === 39) soc -= 1; l = V.accuLeerBij(l, 'ACCU_RIJDT', soc, 36, t); }
  // 119 s × 36 km/h ≈ 1,19 km, 3% gezakt
  waar('geleerd: km en procenten op de accu', Math.abs(l.km - 1.19) < 0.02 && l.pct === 3, JSON.stringify(l));
  waar('elektrisch bereik = soc × km / %', Math.abs(V.elektrischBereik(l, 57) - 57 * l.km / 3) < 1e-9);
  waar('te weinig geleerd: null', V.elektrischBereik({ km: 0.3, pct: 1 }, 57) === null);
  const opladen = V.accuLeerBij({ km: 1, pct: 2, soc: 50, t: 0 }, 'DRAAIT_RIJDT', 55, 50, 1000);
  waar('met de motor aan telt er niets bij (ook niet het opladen)', opladen.km === 1 && opladen.pct === 2 && opladen.soc === 55);

  // Bereik: optellen.
  waar('brandstof + accu', JSON.stringify(V.bereikUit(509.4, 2.6)) === JSON.stringify({ totaal: 512, brandstof: 509, elektrisch: 3 }));
  waar('alleen brandstof', V.bereikUit(420, null).totaal === 420 && V.bereikUit(420, null).elektrisch === null);
  waar('alleen accu', V.bereikUit(null, 4).totaal === 4);
  waar('niets: null', V.bereikUit(null, null) === null && V.bereikUit('x', undefined) === null);
}

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
