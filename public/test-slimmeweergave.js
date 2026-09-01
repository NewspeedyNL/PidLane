// ══════════════════════════════════════════════════════════════════
// test-slimmeweergave.js — de vierde weergave doet wat hij belooft
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Issue #61 (30-08-2026): de live view toonde alles op één hoop en met één
// opmaak. Elke tegel kreeg dezelfde trendlijn, ook een brandstofmeter — waar
// die lijn per definitie een rechte streep is. De vraag was één nieuwe
// weergave-optie met drie dingen erin:
//
//   1. dashboard-achtige waardes bij elkaar en groot (snelheid, brandstof),
//      en NADRUKKELIJK zonder toerental, pedaalstand en motorbelasting —
//      die variëren te veel om als tellerstand te lezen;
//   2. alle temperaturen samen in één balkdiagram in plaats van tien losse
//      tegels;
//   3. geen trendlijn waar er niets te trenden valt.
//
// Alle drie zijn hier gedragstoetsen: slimGroep() draait echt uit
// pidlane-data.js, en renderGauges()/slimBij() draaien echt uit
// pidlane-pids.js tegen een minimale DOM-nabootsing. De regels staan dus
// nergens in dit bestand nagebouwd — een kopie zou meelopen met de code in
// plaats van hem te controleren.
//
// Draaien vanuit public/:  node test-slimmeweergave.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0;
function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}
function toetsMeldt(naam, gemeten, moetNoemen) {
  const raak = gemeten.some(function (r) { return r.indexOf(moetNoemen) > -1; });
  if (raak) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  console.log('        de controle bleef stil terwijl hij "' + moetNoemen + '" had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// ── pidlane-data.js: de indeling ─────────────────────────────────
function laadData() {
  const s = {}; s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  if (typeof s.slimGroep !== 'function') throw new Error('slimGroep() niet gevonden in pidlane-data.js');
  return s;
}
const D = laadData();

// ── pidlane-pids.js: de twee stukken die we los kunnen draaien ───
const PIDS_BRON = fs.readFileSync('pidlane-pids.js', 'utf8');

function knip(bron, van, tot, wat) {
  const i = bron.indexOf(van), j = bron.indexOf(tot);
  if (i < 0 || j < 0 || j <= i) throw new Error(wat + ' niet uit pidlane-pids.js te knippen — is het hernoemd?');
  return bron.slice(i, j);
}
const SLIM_BRON = knip(PIDS_BRON, 'const SLIM_BEWEEG_DEEL', '\nfunction updPID(', 'het slim-blok');
const RENDER_BRON = knip(PIDS_BRON, 'function renderGauges(){', '// ── Dubbeltik op een tegel', 'renderGauges()');

// ── DOM-nabootsing ───────────────────────────────────────────────
function Element(tag) {
  this.tagName = tag; this.id = ''; this.className = ''; this.title = '';
  this.textContent = ''; this.innerHTML = ''; this.children = [];
  this.style = { cssText: '', display: '', width: '' };
  this.onclick = null;
  const zelf = this;
  Object.defineProperty(this, 'classList', {
    get: function () {
      return {
        add: function (c) { if (!zelf.className.split(/\s+/).includes(c)) zelf.className = (zelf.className + ' ' + c).trim(); },
        remove: function () {
          const weg = Array.prototype.slice.call(arguments);
          zelf.className = zelf.className.split(/\s+/).filter(function (x) { return x && weg.indexOf(x) < 0; }).join(' ');
        },
        toggle: function (c, aan) {
          const heeft = zelf.className.split(/\s+/).includes(c);
          if (aan === undefined) aan = !heeft;
          if (aan && !heeft) zelf.className = (zelf.className + ' ' + c).trim();
          if (!aan && heeft) zelf.className = zelf.className.split(/\s+/).filter(function (x) { return x && x !== c; }).join(' ');
        },
        contains: function (c) { return zelf.className.split(/\s+/).includes(c); }
      };
    }
  });
}
Element.prototype.appendChild = function (k) { this.children.push(k); return k; };
Element.prototype.removeAttribute = function () {};
Element.prototype.setAttribute = function () {};

// Alle PIDs die deze test gebruikt, met hun echte definitie uit pidlane-data.js.
const DEFS = D.ALL_PID_DEFS;

function maakOmgeving(actief, renderBron) {
  const reg = {};
  ['gGrid', 'vasteData', 'pidViewSwitch'].forEach(function (id) {
    reg[id] = new Element('div'); reg[id].id = id;
  });
  const onthoud = function (k) { if (k && k.id) reg[k.id] = k; return k; };
  const basis = Element.prototype.appendChild;
  Element.prototype.appendChild = function (k) { return onthoud(basis.call(this, k)); };

  const ctx = {
    document: {
      getElementById: function (id) { return reg[id] || null; },
      createElement: function (t) { return new Element(t); },
      querySelectorAll: function () { return []; }
    },
    console: { warn: function () {}, log: function () {} },
    activePIDs: new Set(actief),
    pidVals: {},
    pidHist: {},
    pidViewMode: 'slim',
    discoveredPIDDefs: actief.map(function (p) { return { pid: p }; }),
    _scenario: { enabled: false, pids: {} },
    LEEG_TIP: 'leeg',
    getPidDef: function (pid) { return DEFS[pid] || null; },
    pidIsTekst: function () { return false; },
    pidTegelLeeg: function () { return false; },
    pidTileTap: function () {},
    slimGroep: D.slimGroep,
    fv: function (v) { return String(v); },
    applyG: function () {},
    PID_ALT_KANAAL: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SLIM_BRON + '\n' + (renderBron || RENDER_BRON), ctx, { filename: 'pidlane-pids.js (slim)' });
  ctx.reg = reg;
  return ctx;
}

function vakVan(ctx, groep) {
  const sec = ctx.reg['slimSec-' + groep];
  return sec ? sec.children[1] : null;      // [0] = kopje, [1] = het vak
}
function pidsIn(ctx, groep) {
  const v = vakVan(ctx, groep);
  return v ? v.children.map(function (c) { return String(c.id).slice(3); }) : [];
}

// ── 1. de indeling ───────────────────────────────────────────────
function keurIndeling() {
  const uit = [];
  const verwacht = {
    '010D': 'dash',  // snelheid — staat letterlijk in het issue
    '012F': 'dash',  // brandstofpeil
    '015E': 'dash',  // brandstofverbruik
    '0142': 'dash',  // accuspanning
    '0105': 'temp',  // koelwater
    '015C': 'temp',  // motorolie
    '010F': 'temp',  // inlaatlucht
    '013C': 'temp',  // katalysator
    '010C': 'rest',  // toerental — "die variëren te veel"
    '0104': 'rest',  // motorbelasting — idem
    '0111': 'rest'   // gasklep/pedaalstand — idem
  };
  Object.keys(verwacht).forEach(function (pid) {
    const g = D.slimGroep(pid);
    if (g !== verwacht[pid])
      uit.push(pid + ' (' + (DEFS[pid] ? DEFS[pid].name : '?') + ') valt in "' + g + '", verwacht "' + verwacht[pid] + '"');
  });
  // Elke °C-PID hoort in de balken, zonder uitzondering — anders staat er
  // straks tóch weer een losse temperatuurtegel tussen.
  Object.keys(DEFS).forEach(function (pid) {
    if (DEFS[pid].unit === '°C' && D.slimGroep(pid) !== 'temp')
      uit.push(pid + ' heeft eenheid °C maar valt niet in het temperatuurvak');
  });
  return uit;
}

// ── 2. de opbouw van het scherm ──────────────────────────────────
function keurDrieVakken(renderBron) {
  const ctx = maakOmgeving(['010D', '012F', '0105', '015C', '010F', '010C', '0104'], renderBron);
  ctx.renderGauges();
  const uit = [];
  if (pidsIn(ctx, 'dash').sort().join(',') !== '010D,012F')
    uit.push('dashboardvak bevat ' + pidsIn(ctx, 'dash').join(',') + ', verwacht 010D,012F');
  if (pidsIn(ctx, 'temp').sort().join(',') !== '0105,010F,015C')
    uit.push('temperatuurvak bevat ' + pidsIn(ctx, 'temp').join(',') + ', verwacht 0105,010F,015C');
  if (pidsIn(ctx, 'rest').sort().join(',') !== '0104,010C')
    uit.push('restvak bevat ' + pidsIn(ctx, 'rest').join(',') + ', verwacht 0104,010C');
  // Alle drie de vakken zijn gevuld, dus alle drie moeten zichtbaar staan.
  ['dash', 'temp', 'rest'].forEach(function (g) {
    const sec = ctx.reg['slimSec-' + g];
    if (!sec) { uit.push('vak ' + g + ' is helemaal niet opgebouwd'); return; }
    if (sec.style.display === 'none') uit.push('vak ' + g + ' staat op display:none terwijl er tegels in zitten');
  });
  return uit;
}

function keurLeegVakVerborgen() {
  // Alleen temperaturen geselecteerd: dan hoort er geen leeg kopje
  // "Dashboard" boven een leeg vak te staan.
  const ctx = maakOmgeving(['0105', '015C']);
  ctx.renderGauges();
  const uit = [];
  if (ctx.reg['slimSec-dash'].style.display !== 'none') uit.push('een leeg dashboardvak staat toch in beeld');
  if (ctx.reg['slimSec-rest'].style.display !== 'none') uit.push('een leeg restvak staat toch in beeld');
  if (ctx.reg['slimSec-temp'].style.display === 'none') uit.push('het gevulde temperatuurvak staat op display:none');
  return uit;
}

function keurTempBalk() {
  const ctx = maakOmgeving(['0105', '010C']);
  ctx.renderGauges();
  const uit = [];
  if (!ctx.reg['sb-0105']) uit.push('de koelwatertegel heeft geen balk gekregen');
  if (ctx.reg['sb-010C']) uit.push('het toerental heeft een temperatuurbalk gekregen');
  return uit;
}

// ── 3. de balk staat voor "hoe dicht bij de grens", niet voor "hoe warm" ──
function keurBalkSchaal() {
  const ctx = maakOmgeving(['0105', '015C']);
  ctx.renderGauges();
  const uit = [];
  // Koelwater: dH = 110 °C. 88 °C is dus 80% van de weg naar gevaar.
  ctx.slimBij('0105', 88, DEFS['0105'], 'ok', ctx.reg['gc-0105']);
  const b = ctx.reg['sb-0105'];
  if (Math.abs(parseFloat(b.style.width) - 80) > 0.6)
    uit.push('koelwater 88 °C geeft balk ' + b.style.width + ', verwacht ~80% (grens 110 °C)');
  // Boven de gevarengrens loopt hij vol en wordt hij rood.
  ctx.slimBij('0105', 140, DEFS['0105'], 'danger', ctx.reg['gc-0105']);
  if (parseFloat(b.style.width) !== 100) uit.push('boven de gevarengrens loopt de balk niet vol (' + b.style.width + ')');
  if (b.className !== 'rd') uit.push('boven de gevarengrens is de balk niet rood maar "' + b.className + '"');
  // Onder nul blijft hij leeg in plaats van negatief te worden.
  ctx.slimBij('0105', -12, DEFS['0105'], 'ok', ctx.reg['gc-0105']);
  if (parseFloat(b.style.width) !== 0) uit.push('een negatieve temperatuur geeft balk ' + b.style.width);
  // En de kern: olie op 140 °C (grens 150) staat HOGER dan koelwater op
  // 88 °C (grens 110) — een gedeelde absolute schaal zou dat omdraaien.
  ctx.slimBij('0105', 88, DEFS['0105'], 'ok', ctx.reg['gc-0105']);
  ctx.slimBij('015C', 140, DEFS['015C'], 'warn', ctx.reg['gc-015C']);
  if (parseFloat(ctx.reg['sb-015C'].style.width) <= parseFloat(b.style.width))
    uit.push('olie 140/150 °C staat niet hoger dan koelwater 88/110 °C — de balk meet dan graden en geen marge');
  return uit;
}

// ── 4. geen trendlijn waar niets beweegt ─────────────────────────
function metHistorie(ctx, pid, waarden) {
  ctx.pidHist[pid] = waarden.map(function (v) { return { v: v }; });
}
function keurVlakkeLijn() {
  const ctx = maakOmgeving(['010C', '012F']);
  ctx.renderGauges();
  const uit = [];
  // Brandstofpeil: 62,0 → 61,8 over acht metingen. Bereik van het PID is
  // 0-100%, dus 0,2% beweging — een rechte streep.
  metHistorie(ctx, '012F', [62, 62, 61.9, 61.9, 61.9, 61.8, 61.8, 61.8]);
  if (ctx.slimBeweegt('012F', DEFS['012F']))
    uit.push('een brandstofpeil dat 0,2% zakt telt als "beweegt"');
  // Toerental: 800 → 3200 op een bereik van 0-8000. Dat beweegt.
  metHistorie(ctx, '010C', [800, 900, 1400, 2200, 3200, 2600, 1800, 1200]);
  if (!ctx.slimBeweegt('010C', DEFS['010C']))
    uit.push('een toerental van 800 tot 3200 telt niet als "beweegt"');
  // En de tegel krijgt de klasse ook echt.
  ctx.slimBij('012F', 61.8, DEFS['012F'], 'ok', ctx.reg['gc-012F']);
  ctx.slimBij('010C', 1200, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (!ctx.reg['gc-012F'].classList.contains('vlak')) uit.push('de vlakke tegel krijgt de klasse "vlak" niet');
  if (ctx.reg['gc-010C'].classList.contains('vlak')) uit.push('de bewegende tegel krijgt tóch de klasse "vlak"');
  // Te weinig metingen = nog geen oordeel; dan geen trendlijn beloven.
  metHistorie(ctx, '010C', [800, 3200]);
  if (ctx.slimBeweegt('010C', DEFS['010C']))
    uit.push('met twee metingen wordt er al een oordeel over beweging geveld');
  return uit;
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Slimme weergave — dashboard, temperatuurbalken, trend waar het beweegt (issue #61)\n');

toetsSchoon('de indeling klopt, en toeren/belasting/gasklep zitten NIET in het dashboard', keurIndeling());
toetsSchoon('de tegels belanden in het juiste vak', keurDrieVakken());
toetsSchoon('een leeg vak blijft verborgen', keurLeegVakVerborgen());
toetsSchoon('alleen temperaturen krijgen een balk', keurTempBalk());
toetsSchoon('de balk meet de marge tot de grens, niet het aantal graden', keurBalkSchaal());
toetsSchoon('een vlak signaal krijgt geen trendlijn', keurVlakkeLijn());

// ── tegenproef ───────────────────────────────────────────────────
console.log('');
// De oude toestand: één rooster, geen vakken. Dezelfde controle als hierboven,
// nu tegen die versie — staat hij groen, dan meet hij niets.
const RENDER_OUD = RENDER_BRON.replace("const slim = (pidViewMode==='slim');", 'const slim = false;');
if (RENDER_OUD === RENDER_BRON) throw new Error('de tegenproef kon de slim-schakelaar niet uitzetten — is de regel hernoemd?');
toetsMeldt('zonder vakken valt de opbouw door de mand (tegenproef)',
  keurDrieVakken(RENDER_OUD), 'dashboardvak bevat');

// En een balk die tegen het PID-maximum wordt afgezet in plaats van tegen de
// gevarengrens: dan is koelwater 88 °C ineens 34% en niet 80%.
toetsMeldt('een balk op de max-schaal valt door de mand (tegenproef)', (function () {
  const d = DEFS['0105'];
  const opMax = (88 / d.max) * 100;                       // -40..215 → ~41%
  return Math.abs(opMax - 80) > 0.6
    ? ['koelwater 88 °C geeft balk ' + opMax.toFixed(1) + '%, verwacht ~80% (grens 110 °C)']
    : [];
})(), 'verwacht ~80%');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
