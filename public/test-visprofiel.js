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
  if (P.PROFIELEN.length !== 6) uit.push('er zijn ' + P.PROFIELEN.length + ' weergaven, verwacht 6');
  let id = 'basis'; const gezien = [id];
  for (let i = 0; i < 6; i++) { id = P.volgende(id); gezien.push(id); }
  if (gezien.join(',') !== 'basis,temp,emissie,verbruik,motor,telemetrie,basis') uit.push('de rondgang is ' + gezien.join(' → '));
  if (P.volgende('onzin') !== 'temp') uit.push('na een onbekende keuze komt ' + P.volgende('onzin'));
  return uit;
}
const r1 = keurRond(BRON);
waar('basis → temperatuur → emissie → verbruik → motor → telemetrie (één scherm sinds 06-10-2026) → basis', r1.length === 0, r1.join('; '));
waar('tegenproef: zonder de rond-modulo stopt hij na motor',
  keurRond(BRON.replace('% PROFIELEN.length].id', '] ? PROFIELEN[i+1].id : PROFIELEN[PROFIELEN.length-1].id')).length > 0);

const C = laad(BRON), P = C.PLVisProfiel;
waar('zonder opgeslagen keuze: basis', P.lees() === 'basis');
P.bewaar('motor');
waar('een opgeslagen keuze wordt teruggelezen', P.lees() === 'motor');
C.localStorage.setItem(P.SLEUTEL, 'kapot');
waar('rommel in de opslag: basis, geen lege weergave', P.lees() === 'basis');
['tel-horizon', 'tel-offroad', 'tel-g'].forEach(oud => {
  C.localStorage.setItem(P.SLEUTEL, oud);
  waar('een oude keuze ' + oud + ' komt uit op het samengevoegde scherm, niet op Basis', P.lees() === 'telemetrie', P.lees());
});

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
  PP.PROFIELEN.forEach(p => (p.plekken || []).concat(PP.plekkenVan(p, 'diesel') || []).forEach(x => x.keten.forEach(pid => {
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
    // Een getalvak, of — voor de horizon in het samengevoegde telemetriescherm,
    // die zijn getallen deelt met de autootjes — ten minste zijn tekening.
    p.plekken.forEach(x => { if (h.indexOf('id="vpf-w-' + x.rol + '"') < 0 && !(/^hz-/.test(x.rol) && h.indexOf('id="vpf-f-' + x.rol + '"') >= 0)) uit.push(p.id + '/' + x.rol); });
    if (h.indexOf('vpf-' + p.stijl) < 0) uit.push(p.id + ': stijl ' + p.stijl + ' ontbreekt');
  });
  return uit;
}
const vm1 = vakkenMis(P);
waar('elke plek heeft een getalvak, elk profiel zijn stijl', vm1.length === 0, vm1.join(', '));
const vmD = (() => { const uit = []; P.PROFIELEN.filter(p => p.plekken).forEach(p => {
  const i = P.indeling(p.id, () => true, 'diesel'), h = P.html(p.id, i);
  P.plekkenVan(p, 'diesel').forEach(x => { if (h.indexOf('id="vpf-w-' + x.rol + '"') < 0 && !(/^hz-/.test(x.rol) && h.indexOf('id="vpf-f-' + x.rol + '"') >= 0)) uit.push(p.id + '/' + x.rol); });
  const ids = [...h.matchAll(/id="([^"]+)"/g)].map(m => m[1]); if (ids.length !== new Set(ids).size) uit.push(p.id + ': dubbele id');
}); return uit; })();
waar('ook op een diesel heeft elke plek een vak, en geen id twee keer (#393)', vmD.length === 0, vmD.join(', '));
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
  // Sinds 06-10-2026 één scherm: horizon (rollen hz-*), autootjes en G-cirkel.
  const ind = P.indeling('telemetrie', () => true);
  waar('helling en kanteling staan op de horizon én op de autootjes', ind.plekken['hz-helling'] === 'TL01' && ind.plekken.helling === 'TL01' && ind.plekken['hz-kanteling'] === 'TL02' && ind.plekken.kanteling === 'TL02', JSON.stringify(ind.plekken));
  const html = P.html('telemetrie', ind);
  ['vpf-f-hz-helling', 'vpf-f-hz-kanteling', 'vpf-f-helling', 'vpf-f-kanteling', 'vpf-f-gstip', 'vpf-f-gpiek'].forEach(id => {
    waar('het samengevoegde scherm heeft ' + id + ', één keer', (html.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1);
  });
  waar('geen element-id twee keer', (() => { const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]); return ids.length === new Set(ids).size; })());
  P.bij('telemetrie', ind, 'TL01', 10, 'ok');
  P.bij('telemetrie', ind, 'TL02', 5, 'ok');
  waar('horizon: neus 10° omhoog = de horizon 30 px omlaag', els['vpf-f-hz-helling'].attr.transform === 'translate(0 30.0)', els['vpf-f-hz-helling'].attr.transform);
  waar('horizon: rechts 5° omlaag = de horizon draait linksom', els['vpf-f-hz-kanteling'].attr.transform === 'rotate(-5.0 100 100)', els['vpf-f-hz-kanteling'].attr.transform);
  waar('offroad: van opzij gaat de neus (rechts) omhoog = linksom, in hetzelfde scherm', els['vpf-f-helling'].attr.transform === 'rotate(-10.0 100 112)', els['vpf-f-helling'].attr.transform);
  P.bij('telemetrie', ind, 'TL01', 400, 'ok');
  waar('horizon: een onzinwaarde blijft binnen de schaal (30°)', els['vpf-f-hz-helling'].attr.transform === 'translate(0 90.0)', els['vpf-f-hz-helling'].attr.transform);
  const indG = ind;
  P.bij('telemetrie', indG, 'TL03', -0.5, 'ok'); P.bij('telemetrie', indG, 'TL04', 0.25, 'ok');
  const st = els['vpf-f-gstip'].attr;
  // Zij-G volgt het gevoel (#407): rechts sturen (TL04 = +0,25) duwt je naar links.
  waar('G-cirkel: 0,5 g remmen = 40 px omlaag, 0,25 g naar rechts gestuurd = 20 px naar LINKS (#407)', st.cy === '140.0' && st.cx === '80.0', JSON.stringify(st));
  waar('G-cirkel: de getallen staan eronder', els['vpf-w-lengte'] && els['vpf-w-lengte'].textContent === '−0,50', els['vpf-w-lengte'] && els['vpf-w-lengte'].textContent);
  const pk = els['vpf-f-gpiek'];
  let weg = false; pk.classList.toggle = function (c, aan) { if (c === 'weg') weg = !!aan; };
  P.bij('telemetrie', indG, 'TL03', -0.9, 'ok');   // hard remmen
  P.bij('telemetrie', indG, 'TL03', -0.1, 'ok');   // los
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

console.log('\n9. Diesel: andere sensoren op dezelfde weergaven (#393)');
{
  const T = laad(BRON), els = {};
  T.document = { getElementById: id => (els[id] = els[id] || { attr: {}, classList: { remove() {}, add() {}, toggle() {} }, style: {},
    setAttribute(k, v) { this.attr[k] = String(v); }, getAttribute(k) { return this.attr[k]; } }) };
  const P = T.PLVisProfiel, alles = () => true;
  const eB = P.indeling('emissie', alles, 'benzine'), eD = P.indeling('emissie', alles, 'diesel');
  waar('benzine: emissie blijft lambda en de trims', eB.plekken.lambda === '0124' && eB.plekken.kort === '0106', JSON.stringify(eB.plekken));
  waar('diesel: emissie toont roetfilter, NOx, AdBlue en regeneratie, geen lambda of trims',
    eD.plekken.dpf === '017A' && eD.plekken.nox === '0183' && eD.plekken.adblue === '0185' && eD.plekken.regen === '018B'
    && !('lambda' in eD.plekken) && !('kort' in eD.plekken) && eD.plekken.egr === '012C', JSON.stringify(eD.plekken));
  const hD = P.html('emissie', eD);
  waar('diesel: geen lambdaschaal "1,00 is de ideale verbranding" op het scherm', !/vpf-lambda|ideale verbranding/.test(hD));
  const mD = P.indeling('motor', alles, 'diesel');
  waar('diesel: motor toont laaddruk en injectie, niet de ontsteking', mD.plekken.map === '0170' && mD.plekken.timing === '015D', JSON.stringify(mD.plekken));
  waar('diesel: de gasring volgt het pedaal, niet de gasklep', mD.plekken.gasklep === '0149', mD.plekken.gasklep);
  waar('diesel: verbruik toont laaddruk in plaats van luchtmassa', P.indeling('verbruik', alles, 'diesel').plekken.laad === '0170');
  waar('diesel: temperatuur toont het uitlaatgas', P.indeling('temp', alles, 'diesel').plekken.uitlaat === '0178');
  P.html('motor', mD); P.bij('motor', mD, '010C', 3000, 'ok');
  waar('diesel: 3000 tpm is de helft van de ring (schaal 6000)', els['vpf-f-toeren'].attr['stroke-dasharray'] === '37.5 100', els['vpf-f-toeren'].attr['stroke-dasharray']);
  waar('diesel: de neonring zegt "Gaspedaal"', /Gaspedaal/.test(P.html('motor', mD)));
  waar('zonder motorsoort (onbekend) is het de benzinekaart', P.indeling('emissie', alles).plekken.lambda === '0124');
  const Tm = laad(BRON.replace("  if(motor!=='diesel') return p.plekken;", "  return p.plekken;")).PLVisProfiel;
  waar('tegenproef: zonder dieselplekken staat er weer lambda op een diesel', 'lambda' in Tm.indeling('emissie', alles, 'diesel').plekken);
  const Tk = laad(BRON.replace("function ketens(id, motor, opts){\n  const p=voor(id, motor);", "function ketens(id, motor, opts){\n  const p=zoek(id);")).PLVisProfiel;
  waar('tegenproef: ketens zonder motor zetten de roetfilter-PIDs niet aan', !Tk.ketens('emissie', 'diesel').some(k => k.indexOf('017A') >= 0)
    && P.ketens('emissie', 'diesel').some(k => k.indexOf('017A') >= 0));
}
{
  // Gekoppeld: Slim visueel geeft de motorsoort door.
  const c = {
    console: { log() {}, warn() {}, error() {} }, Date: Date, setInterval: () => 1, clearInterval: () => {},
    activePIDs: new Set(['010C', '010D', '017A', '0124']), hiddenPIDs: new Set(), pidVals: {}, pidHist: {}, _pidLastUpd: {}, _pidLastUpdPause: {},
    PLSched: { dood: () => false, interval: () => 120 }, PLGate: { stats: () => ({ turbo: false }) },
    detectEngineType: () => 'diesel', localStorage: { getItem: () => 'emissie', setItem() {} }
  };
  c.window = c; vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  c.getPidDef = p => c.ALL_PID_DEFS[p] || null; c.PLBus = { pausedTotal: () => 0 };
  vm.runInContext(BRON, c, { filename: 'pidlane-visprofiel.js' });
  vm.runInContext(lees('pidlane-visueel.js'), c, { filename: 'pidlane-visueel.js' });
  c.PLVisueel.start();
  const i = c.PLVisueel.indeling();
  waar('Slim visueel geeft "diesel" door: het emissiescherm kiest het roetfilter', i.profiel && i.profiel.motor === 'diesel' && i.profiel.plekken.dpf === '017A', JSON.stringify(i.profiel));
  c.PLVisueel.stop();
}

console.log('\n8. Het emissiescherm is donker (06-10-2026)');
{
  // Tot 06-10 een witte kaart, ook in het donkere thema; 's avonds in de auto
  // verblindde hij. Getoetst op de helderheid van de achtergrond en de tekst.
  const css = lees('pidlane.css');
  const m = css.match(/\.vpf-licht \{[^}]*background:(#[0-9a-f]{6});[^}]*color:(#[0-9a-f]{6});/i);
  const lum = h => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  waar('.vpf-licht heeft een achtergrond en een tekstkleur', !!m);
  if (m) {
    waar('de achtergrond is donker (helderheid < 0,2)', lum(m[1]) < 0.2, m[1] + ' = ' + lum(m[1]).toFixed(2));
    waar('…en de tekst licht, dus leesbaar', lum(m[2]) > 0.7, m[2]);
  }
}

console.log('\n10. Telefoon niet vast in de houder: heel dof (06-10-2026)');
{
  function keurLos(bron) {
    const els = {};
    const mk = () => { const k = new Set(); return { classList: { toggle: (n, aan) => { if (aan) k.add(n); else k.delete(n); }, contains: n => k.has(n) } }; };
    const c = laad(bron);
    c.document = { getElementById: id => (els[id] = els[id] || mk()) };
    let vast = false;
    c.PLTelemetrie = { los: pid => /^TL/.test(pid) && !vast };
    const ind = { motor: 'benzine', plekken: { helling: 'TL01', kanteling: 'TL02', lengte: 'TL03', dwars: 'TL04', 'hz-helling': 'TL01', 'hz-kanteling': 'TL02' } };
    c.PLVisProfiel.dof('telemetrie', ind, () => false);
    const losNu = ['helling', 'lengte'].every(r => els['vpf-p-' + r] && els['vpf-p-' + r].classList.contains('los'));
    vast = true;
    c.PLVisProfiel.dof('telemetrie', ind, () => false);
    const losDaarna = ['helling', 'lengte'].some(r => els['vpf-p-' + r].classList.contains('los'));
    return { losNu, losDaarna };
  }
  const r = keurLos(BRON);
  waar('niet vast: helling en G-cirkel krijgen de klasse los', r.losNu, JSON.stringify(r));
  waar('weer vast: de klasse gaat eraf', !r.losDaarna, JSON.stringify(r));
  waar('tegenproef: zonder de regel blijft alles helder',
    !keurLos(BRON.replace("    e.classList.toggle('los', l);", '')).losNu);
  const css = lees('pidlane.css');
  const m = css.match(/\.vpf \.los[^{]*\{[^}]*opacity:\s*([0-9.]+)/), o = css.match(/\.vpf \.oud \{[^}]*opacity:\s*([0-9.]+)/);
  waar('los is doffer dan oud', m && o && parseFloat(m[1]) < parseFloat(o[1]), (m && m[1]) + ' tegen ' + (o && o[1]));
}

// ── een plek zelf invullen (06-10-2026) ──
console.log('\n— een plek zelf invullen: op naam, met de hand, nooit dubbel —');
{
  // Wat de CX-5 op 06-10 gaf: geen 015C en geen 0146, wel een eigen
  // motorolietemperatuur en de accuspanning.
  const cx5 = ['0105', '010F', '013C', '221310', '0142'];
  const defs = [
    { pid: '0105', name: 'Koelvloeistof', unit: '°C' }, { pid: '010F', name: 'Inlaatlucht', unit: '°C' },
    { pid: '013C', name: 'Katalysator B1S1', unit: '°C' }, { pid: '221310', name: 'Motorolietemperatuur', unit: '°C', min: -40, max: 200 },
    { pid: '0142', name: 'Accuspanning', unit: 'V', min: 0, max: 20 }];
  let i = P.indeling('temp', mag(cx5), 'benzine', { keuze: {}, defs });
  waar('automatisch: de eigen motorolietemperatuur vult OLIE', i.plekken.olie === '221310', JSON.stringify(i.plekken));
  waar('…met het label en de schaal van de plek (geen vervanging)', !i.vervang.olie, JSON.stringify(i.vervang));
  waar('BUITEN blijft leeg: er is geen sensor die zo heet', i.plekken.buiten === null, JSON.stringify(i.plekken));
  waar('de ketens zetten 221310 erbij, zodat Slim visueel hem aanzet',
    JSON.stringify(P.ketens('temp', 'benzine', { keuze: {}, defs })[1]) === JSON.stringify(['015C', '221310']), JSON.stringify(P.ketens('temp', 'benzine', { keuze: {}, defs })));
  waar('zonder opts: de indeling van vóór 06-10 (OLIE leeg op de CX-5)', P.indeling('temp', mag(cx5)).plekken.olie === null);

  i = P.indeling('temp', mag(cx5), 'benzine', { keuze: { 'temp/buiten': '0142' }, defs });
  waar('met de hand: de accuspanning op BUITEN', i.plekken.buiten === '0142', JSON.stringify(i.plekken));
  waar('…met zijn eigen naam, eenheid en schaal', i.vervang.buiten && i.vervang.buiten.eenheid === 'V' && i.vervang.buiten.lo === 0 && i.vervang.buiten.hi === 20 && i.vervang.buiten.kort === 'Accuspann…',
    JSON.stringify(i.vervang));
  const h = P.html('temp', i);
  waar('de tekening toont het label van de gekozen sensor', /<small>Accuspann…<\/small>/.test(h), h.slice(0, 200));
  i = P.indeling('temp', mag(cx5), 'benzine', { keuze: { 'temp/buiten': '0105' }, defs });
  waar('nooit dubbel: koelwater gekozen voor BUITEN staat al op KOEL; KOEL houdt hem, BUITEN blijft leeg',
    i.plekken.koel === '0105' && i.plekken.buiten === null, JSON.stringify(i.plekken));
  i = P.indeling('temp', mag(cx5), 'benzine', { keuze: { 'temp/olie': '0146' }, defs });
  waar('een keuze die deze auto niet geeft: terug naar automatisch, niet leeg', i.plekken.olie === '221310', JSON.stringify(i.plekken));

  P.zetKeuze('temp', 'buiten', '0142');
  waar('zetKeuze bewaart per profiel en plek', P.keuzes()['temp/buiten'] === '0142', JSON.stringify(P.keuzes()));
  P.zetKeuze('temp', 'buiten', '');
  waar('…en "Automatisch" haalt hem weg', !('temp/buiten' in P.keuzes()), JSON.stringify(P.keuzes()));
  const tel = P.html('telemetrie', P.indeling('telemetrie', () => true));
  waar('het telemetriescherm heeft een knop Nulstellen', /class="vpf-tel-nul"[^>]*onclick="PLVisProfiel\.nulstellen\(\)"/.test(tel));
  C.PLTelemetrie = { nulstellen: () => true }; C.showToast = () => {};
  waar('Nulstellen roept PLTelemetrie.nulstellen() aan', P.nulstellen() === true);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'goed: ' + ok + ' ok, 0 fout'));
process.exit(fout ? 1 : 0);
