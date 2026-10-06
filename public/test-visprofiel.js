// ══════════════════════════════════════════════════════════════════
// test-visprofiel.js — de vijf weergaven van Slim visueel (02-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-visprofiel.js en pidlane-visueel.js in een vm, met
// de echte pidlane-data.js, en toetst:
//   • "Volgende" loopt rond langs alle vijf, en een onbekende keuze is basis;
//   • per plek komt de eerste BRUIKBARE PID uit de keten, niet de eerste;
//   • elke vulling blijft binnen 0–100, ook met een kapotte waarde;
//   • elke PID in een keten bestaat in de app (ALL_PID_DEFS of PLBerekend),
//     zodat een tikfout in een keten niet stil "niet beschikbaar" wordt;
//   • de profielketens komen in nodigePids() en in gebruiktePids(), zodat
//     ze aangezet en niet geremd worden.
// Met tegenproeven: elke controle wordt rood op de fout die hij moet vangen.
//
// Draaien vanuit public/:  node test-visprofiel.js
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
const BRON = lees('pidlane-visprofiel.js');

function laad(bron) {
  const opslag = {};
  const c = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(bron, c, { filename: 'pidlane-visprofiel.js' });
  return c;
}

console.log('\n1. Volgende loopt rond');
function keurRond(bron) {
  const P = laad(bron).PLVisProfiel, uit = [];
  if (P.PROFIELEN.length !== 8) uit.push('er zijn ' + P.PROFIELEN.length + ' weergaven, verwacht 8');
  let id = 'basis'; const gezien = [id];
  for (let i = 0; i < 8; i++) { id = P.volgende(id); gezien.push(id); }
  if (gezien.join(',') !== 'basis,temp,emissie,verbruik,motor,tel-horizon,tel-offroad,tel-g,basis') uit.push('de rondgang is ' + gezien.join(' → '));
  if (P.volgende('onzin') !== 'temp') uit.push('na een onbekende keuze komt ' + P.volgende('onzin'));
  return uit;
}
const r1 = keurRond(BRON);
waar('basis → temperatuur → emissie → verbruik → motor → drie keer telemetrie → basis', r1.length === 0, r1.join('; '));
waar('tegenproef: zonder de rond-modulo stopt hij na motor',
  keurRond(BRON.replace('% PROFIELEN.length].id', '] ? PROFIELEN[i+1].id : PROFIELEN[PROFIELEN.length-1].id')).length > 0);

const C = laad(BRON), P = C.PLVisProfiel;
waar('zonder opgeslagen keuze: basis', P.lees() === 'basis');
P.bewaar('motor');
waar('een opgeslagen keuze wordt teruggelezen', P.lees() === 'motor');
C.localStorage.setItem(P.SLEUTEL, 'kapot');
waar('rommel in de opslag: basis, geen lege weergave', P.lees() === 'basis');

console.log('\n2. De eerste bruikbare PID uit de keten');
const mag = s => p => s.indexOf(p) >= 0;
let ind = P.indeling('temp', mag(['0167', '015C']));
waar('koelwater valt door naar 0167 als 0105 er niet is', ind.plekken.koel === '0167', JSON.stringify(ind.plekken));
waar('wat de auto niet heeft blijft leeg (null), niet de eerste uit de keten', ind.plekken.inlaat === null && ind.plekken.kat === null);
ind = P.indeling('verbruik', mag(['015E', 'CA03']));
waar('verbruik nu: het berekende l/100 km wint van het debiet', ind.plekken.nu === 'CA03');
waar('de basis heeft geen eigen indeling', P.indeling('basis', () => true) === null);

console.log('\n3. Begrensd: geen vulling buiten 0–100');
waar('onder het bereik → 0', P.deel(-500, 0, 100) === 0);
waar('boven het bereik → 100', P.deel(65535, 0, 100) === 100);
waar('geen getal → null (lege balk, geen 0)', P.deel('NO DATA', 0, 100) === null && P.deel(undefined, 0, 1) === null);
waar('tekst: komma en een echt minteken', P.tekst(-0.62, 1) === '−0,6' && P.tekst(0.98, 2) === '0,98');
waar('tekst: een kapotte waarde duwt het vak niet open', P.tekst(6553500, 0).length <= 5);
waar('tegenproef: zonder ondergrens loopt de balk negatief',
  laad(BRON.replace('Math.max(0, Math.min(100,', 'Math.max(-1e9, Math.min(100,')).PLVisProfiel.deel(-500, 0, 100) < 0);

console.log('\n4. Elke PID in een keten bestaat in de app');
const D = { console: { log() {}, warn() {} } }; D.window = D; vm.createContext(D);
vm.runInContext(lees('pidlane-data.js'), D, { filename: 'pidlane-data.js' });
const berekend = lees('pidlane-berekend.js');
const telemetrie = lees('pidlane-telemetrie.js');
function onbekend(PP) {
  const uit = [];
  PP.PROFIELEN.forEach(p => (p.plekken || []).forEach(x => x.keten.forEach(pid => {
    const b = /^CA/.test(pid) ? new RegExp('\\b' + pid + ':\\{').test(berekend)
      : /^TL/.test(pid) ? new RegExp('\\b' + pid + ':\\{').test(telemetrie) : !!D.ALL_PID_DEFS[pid];
    if (!b) uit.push(p.id + '/' + x.rol + ': ' + pid);
  })));
  return uit;
}
const ob = onbekend(P);
waar('geen tikfouten in de ketens', ob.length === 0, ob.join(', '));
waar('tegenproef: een verzonnen PID wordt gezien',
  onbekend(laad(BRON.replace("keten:['0146']", "keten:['01ZZ']")).PLVisProfiel).indexOf('temp/buiten: 01ZZ') >= 0);

console.log('\n5. De tekening heeft voor elke plek een vak');
function vakkenMis(PP) {
  const uit = [];
  PP.PROFIELEN.filter(p => p.plekken).forEach(p => {
    const i = PP.indeling(p.id, () => true), h = PP.html(p.id, i);
    p.plekken.forEach(x => { if (h.indexOf('id="vpf-w-' + x.rol + '"') < 0) uit.push(p.id + '/' + x.rol); });
    if (h.indexOf('vpf-' + p.stijl) < 0) uit.push(p.id + ': stijl ' + p.stijl + ' ontbreekt');
  });
  return uit;
}
const vm1 = vakkenMis(P);
waar('elke plek heeft een getalvak, elk profiel zijn stijl', vm1.length === 0, vm1.join(', '));
const leegH = P.html('emissie', P.indeling('emissie', () => false));
waar('een auto zonder één van de sensoren krijgt een uitleg, geen lege kaart', /vpf-geen/.test(leegH));

console.log('\n6. Gekoppeld aan Slim visueel');
function maakV() {
  const c = {
    console: { log() {}, warn() {}, error() {} },
    Date: Date, setInterval: () => 1, clearInterval: () => {},
    activePIDs: new Set(['010C', '010D']), hiddenPIDs: new Set(), pidVals: {}, pidHist: {}, _pidLastUpd: {}, _pidLastUpdPause: {},
    PLSched: { dood: () => false, interval: () => 120 }, PLGate: { stats: () => ({ turbo: false }) },
    detectEngineType: () => 'benzine',
    localStorage: { getItem: () => 'motor', setItem() {} }
  };
  c.window = c; vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  c.getPidDef = p => c.ALL_PID_DEFS[p] || null;
  c.PLBus = { pausedTotal: () => 0 };
  vm.runInContext(BRON, c, { filename: 'pidlane-visprofiel.js' });
  vm.runInContext(lees('pidlane-visueel.js'), c, { filename: 'pidlane-visueel.js' });
  return c;
}
const V = maakV();
V.PLVisueel.start();
waar('de opgeslagen keuze geldt na het openen', V.PLVisueel.profiel() === 'motor');
const nodig = V.PLVisueel.nodigePids(new Set(['010C', '010D', '0104', '0111', '010B']), new Set(['010C', '010D']), new Set(), false, P.ketens('motor'));
waar('nodigePids zet de sensoren van het profiel erbij', ['0104', '0111', '010B'].every(p => nodig.indexOf(p) >= 0), JSON.stringify(nodig));
['0104', '0111'].forEach(p => V.activePIDs.add(p));
const indV = V.PLVisueel.indeling();
waar('de indeling kent het profiel', indV.profiel && indV.profiel.plekken.last === '0104', JSON.stringify(indV.profiel));
waar('de PIDs van het profiel worden niet geremd', V.PLVisueel.gebruiktePids(indV).has('0111'));
V.PLVisueel.stop();

console.log('\n7. Telemetrie: de tekening draait mee (05-10-2026)');
{
  const T = laad(BRON), els = {};
  const nep = id => (els[id] = els[id] || { attr: {}, classList: { remove() {}, add() {}, toggle() {} }, style: {},
    setAttribute(k, v) { this.attr[k] = String(v); }, getAttribute(k) { return this.attr[k]; } });
  T.document = { getElementById: nep };
  const P = T.PLVisProfiel;
  const ind = P.indeling('tel-horizon', () => true);
  P.bij('tel-horizon', ind, 'TL01', 10, 'ok');
  P.bij('tel-horizon', ind, 'TL02', 5, 'ok');
  waar('horizon: neus 10° omhoog = de horizon 30 px omlaag', els['vpf-f-helling'].attr.transform === 'translate(0 30.0)', els['vpf-f-helling'].attr.transform);
  waar('horizon: rechts 5° omlaag = de horizon draait linksom', els['vpf-f-kanteling'].attr.transform === 'rotate(-5.0 100 100)', els['vpf-f-kanteling'].attr.transform);
  P.bij('tel-horizon', ind, 'TL01', 400, 'ok');
  waar('horizon: een onzinwaarde blijft binnen de schaal (30°)', els['vpf-f-helling'].attr.transform === 'translate(0 90.0)', els['vpf-f-helling'].attr.transform);
  const indO = P.indeling('tel-offroad', () => true);
  P.bij('tel-offroad', indO, 'TL01', 12, 'ok');
  waar('offroad: van opzij gaat de neus (rechts) omhoog = linksom', els['vpf-f-helling'].attr.transform === 'rotate(-12.0 100 112)', els['vpf-f-helling'].attr.transform);
  const indG = P.indeling('tel-g', () => true);
  P.bij('tel-g', indG, 'TL03', -0.5, 'ok'); P.bij('tel-g', indG, 'TL04', 0.25, 'ok');
  const st = els['vpf-f-gstip'].attr;
  // Zij-G volgt het gevoel (#407): rechts sturen (TL04 = +0,25) duwt je naar links.
  waar('G-cirkel: 0,5 g remmen = 40 px omlaag, 0,25 g naar rechts gestuurd = 20 px naar LINKS (#407)', st.cy === '140.0' && st.cx === '80.0', JSON.stringify(st));
  waar('G-cirkel: de getallen staan eronder', els['vpf-w-lengte'] && els['vpf-w-lengte'].textContent === '−0,50', els['vpf-w-lengte'] && els['vpf-w-lengte'].textContent);
  const pk = els['vpf-f-gpiek'];
  let weg = false; pk.classList.toggle = function (c, aan) { if (c === 'weg') weg = !!aan; };
  P.bij('tel-g', indG, 'TL03', -0.9, 'ok');   // hard remmen
  P.bij('tel-g', indG, 'TL03', -0.1, 'ok');   // los
  waar('piekballetje: blijft op de hardste rem staan (0,9 g = 72 px omlaag) terwijl de stip terugveert',
    pk.attr.cy === '172.0' && st.cy === '108.0' && weg === false, JSON.stringify({ piek: pk.attr, stip: st, weg }));
  T.PLVisProfiel.gWis();
  waar('piekballetje: Nulstellen wist hem', weg === true && st.cx === '100.0' && st.cy === '100.0', JSON.stringify({ stip: st, weg }));
  const G = T.PLVisProfiel.gPiek;
  let p1 = G(null, 0.1, -0.8, 0);
  p1 = G(p1, 0, -0.2, 1000);
  waar('gPiek: binnen 3 s wint de grootste uitslag', p1.y === -0.8, JSON.stringify(p1));
  p1 = G(p1, 0, -0.2, 3500);
  waar('gPiek: na 3 s valt hij terug naar de huidige stand', p1.y === -0.2 && p1.t === 3500, JSON.stringify(p1));
  waar('gPiek: lengte en zij tellen samen (0,6 bij 0,6 is groter dan 0,8)', G({ x: 0, y: -0.8, t: 0 }, 0.6, 0.6, 100).x === 0.6);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'goed: ' + ok + ' ok, 0 fout'));
process.exit(fout ? 1 : 0);
