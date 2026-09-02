// ══════════════════════════════════════════════════════════════════
// test-slimmeweergave.js — de STANDAARDWEERGAVE doet wat hij belooft
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
// Issue #68 (01-09-2026) ging een stap verder, en #61 was daar zelf de
// aanleiding voor: door toerental, pedaalstand en motorbelasting bewust
// NIET in het dashboard te zetten, kwamen ze als losse tegels in het vak
// "Beweegt" terecht — netjes, maar niet met elkaar te vergelijken. Ze
// zitten nu in een vierde vak, de tellerplaat, met verticale meters:
//
//   4. slimGroep() kent de groep 'meter' en zet de gaspad-PIDs daarin;
//   5. de meter staat voor de STAND BINNEN HET EIGEN BEREIK (0-8000 rpm) en
//      niet voor de marge tot een grens zoals de temperatuurbalk — een
//      gaspedaal heeft geen gevarengrens;
//   6. er is een sleepwijzer voor de hoogste waarde van de laatste 60
//      metingen, en die verdwijnt als de vulling hem inhaalt;
//   7. de slimme weergave is de STANDAARD, en de opgeslagen voorkeur wordt
//      eindelijk teruggelezen — pl_pidview werd wel geschreven en nooit
//      gebruikt.
//
// En het stuk van #66 dat zonder auto te doen is: een temperatuurbalk zonder
// bekende grens (terugval op het PID-maximum) is nu als grof gemarkeerd, zodat
// een lage balk niet als "koud" leest terwijl hij "grens onbekend" betekent.
//
// Alles hier is een gedragstoets: slimGroep() draait echt uit
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
function laadData(vervang) {
  const s = {}; s.window = s;
  vm.createContext(s);
  let bron = fs.readFileSync('pidlane-data.js', 'utf8');
  if (vervang) {
    if (bron.indexOf(vervang[0]) < 0) throw new Error('tegenproef kon "' + vervang[0] + '" niet vinden in pidlane-data.js');
    bron = bron.replace(vervang[0], vervang[1]);
  }
  vm.runInContext(bron, s, { filename: 'pidlane-data.js' });
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
// Het oordeel ok/warn/danger. slimMaat() leunt erop en de volgorde van die
// twee is de kern van de maat, dus dit moet de echte functie zijn en niet een
// nagebouwde drempelregel — die zou meelopen in plaats van te controleren.
const OORDEEL_BRON = knip(PIDS_BRON, 'function pidOordeel(', '\nfunction applyG(', 'pidOordeel()');
const RENDER_BRON = knip(PIDS_BRON, 'function renderGauges(){', '// ── Dubbeltik op een tegel', 'renderGauges()');
// De weergavekeuze zelf: standaard, herstel uit localStorage en setPidView().
const VIEW_BRON = knip(PIDS_BRON, 'const PID_VIEW_MODI', 'function startStaleWatchdog(){', 'het weergavemodus-blok');

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
// Een echte appendChild HAALT het element eerst bij zijn vorige ouder weg.
// Zonder die stap zou een tegel die naar het vak "Rustig" verhuist in twee
// vakken tegelijk staan, en dan bewijst een groene test iets wat de browser
// nooit doet.
Element.prototype.appendChild = function (k) {
  if (k.parentNode && k.parentNode !== this) {
    const i = k.parentNode.children.indexOf(k);
    if (i > -1) k.parentNode.children.splice(i, 1);
  }
  this.children.push(k); k.parentNode = this; return k;
};
Element.prototype.removeAttribute = function () {};
Element.prototype.setAttribute = function () {};

// Alle PIDs die deze test gebruikt, met hun echte definitie uit pidlane-data.js.
const DEFS = D.ALL_PID_DEFS;

function maakOmgeving(actief, renderBron, slimBron, oordeelBron) {
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
  // De geplande herweging (SLIM_HERWEEG_MS). Niet meteen laten lopen: dat er
  // een tijd tussen zit is juist de afspraak. De test vuurt hem zelf af via
  // __herweging(), zodat de echte timerweg gebruikt wordt en niet
  // slimHerweeg() met de hand.
  let gepland = null;
  ctx.setTimeout = function (fn) { gepland = fn; return 1; };
  ctx.clearTimeout = function () { gepland = null; };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext((oordeelBron || OORDEEL_BRON) + '\n' + (slimBron || SLIM_BRON) + '\n' + (renderBron || RENDER_BRON),
    ctx, { filename: 'pidlane-pids.js (slim)' });
  ctx.reg = reg;
  ctx.__herweging = function () { if (!gepland) return false; gepland(); return true; };
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
function keurIndeling(Dx) {
  Dx = Dx || D;
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
    '010C': 'meter', // toerental — de tellerplaat (#68)
    '0104': 'meter', // motorbelasting — idem
    '0111': 'meter', // gasklep — idem
    '0149': 'meter', // gaspedaal — idem
    '0143': 'meter', // absolute motorbelasting — idem
    '012C': 'rest',  // EGR-klep: ook een kleppositie in %, maar emissie en
    '012E': 'rest'   // geen gaspad — bewust NIET op de tellerplaat
  };
  Object.keys(verwacht).forEach(function (pid) {
    const g = Dx.slimGroep(pid);
    if (g !== verwacht[pid])
      uit.push(pid + ' (' + (DEFS[pid] ? DEFS[pid].name : '?') + ') valt in "' + g + '", verwacht "' + verwacht[pid] + '"');
  });
  // De regel uit #61 blijft gelden: geen enkel gaspad-signaal komt in het
  // dashboard terecht. #68 verplaatst ze naar de tellerplaat, niet naar de
  // tellerstanden — dat was de reden dat ze daar destijds uit bleven.
  Dx.SLIM_METER.forEach(function (pid) {
    if (Dx.slimGroep(pid) === 'dash')
      uit.push(pid + ' staat op de tellerplaat én in het dashboard — dat was juist de fout van vóór #61');
  });
  // Elke °C-PID hoort in de balken, zonder uitzondering — anders staat er
  // straks tóch weer een losse temperatuurtegel tussen.
  Object.keys(DEFS).forEach(function (pid) {
    if (DEFS[pid].unit === '°C' && Dx.slimGroep(pid) !== 'temp')
      uit.push(pid + ' heeft eenheid °C maar valt niet in het temperatuurvak');
  });
  return uit;
}

// ── 2. de opbouw van het scherm ──────────────────────────────────
function keurVierVakken(renderBron) {
  const ctx = maakOmgeving(['010D', '012F', '0105', '015C', '010F', '010C', '0104', '012C'], renderBron);
  ctx.renderGauges();
  const uit = [];
  if (pidsIn(ctx, 'dash').sort().join(',') !== '010D,012F')
    uit.push('dashboardvak bevat ' + pidsIn(ctx, 'dash').join(',') + ', verwacht 010D,012F');
  if (pidsIn(ctx, 'meter').sort().join(',') !== '0104,010C')
    uit.push('tellerplaat bevat ' + pidsIn(ctx, 'meter').join(',') + ', verwacht 0104,010C');
  if (pidsIn(ctx, 'temp').sort().join(',') !== '0105,010F,015C')
    uit.push('temperatuurvak bevat ' + pidsIn(ctx, 'temp').join(',') + ', verwacht 0105,010F,015C');
  if (pidsIn(ctx, 'rest').sort().join(',') !== '012C')
    uit.push('restvak bevat ' + pidsIn(ctx, 'rest').join(',') + ', verwacht 012C');
  // Alle vier de vakken zijn gevuld, dus alle vier moeten zichtbaar staan.
  ['dash', 'meter', 'temp', 'rest'].forEach(function (g) {
    const sec = ctx.reg['slimSec-' + g];
    if (!sec) { uit.push('vak ' + g + ' is helemaal niet opgebouwd'); return; }
    if (sec.style.display === 'none') uit.push('vak ' + g + ' staat op display:none terwijl er tegels in zitten');
  });
  // De volgorde op het scherm is een keuze: eerst wat er op de teller staat,
  // dan wat de bestuurder doet, dan de temperaturen, dan de rest. Een vak dat
  // stilletjes van plaats wisselt is voor de gebruiker een ander scherm.
  const volgorde = ctx.reg.gGrid.children.map(function (c) { return String(c.id).replace('slimSec-', ''); });
  if (volgorde.join(',') !== 'dash,meter,temp,rest,rustig')
    uit.push('de vakken staan in de volgorde ' + volgorde.join(',') + ', verwacht dash,meter,temp,rest,rustig');
  return uit;
}

function keurLeegVakVerborgen() {
  // Alleen temperaturen geselecteerd: dan hoort er geen leeg kopje
  // "Dashboard" boven een leeg vak te staan.
  const ctx = maakOmgeving(['0105', '015C']);
  ctx.renderGauges();
  const uit = [];
  if (ctx.reg['slimSec-dash'].style.display !== 'none') uit.push('een leeg dashboardvak staat toch in beeld');
  if (ctx.reg['slimSec-meter'].style.display !== 'none') uit.push('een lege tellerplaat staat toch in beeld');
  if (ctx.reg['slimSec-rest'].style.display !== 'none') uit.push('een leeg restvak staat toch in beeld');
  if (ctx.reg['slimSec-rustig'].style.display !== 'none') uit.push('een leeg vak "Rustig" staat toch in beeld');
  if (ctx.reg['slimSec-temp'].style.display === 'none') uit.push('het gevulde temperatuurvak staat op display:none');
  return uit;
}

function keurTempBalk() {
  const ctx = maakOmgeving(['0105', '010C', '012C']);
  ctx.renderGauges();
  const uit = [];
  if (!ctx.reg['sb-0105']) uit.push('de koelwatertegel heeft geen balk gekregen');
  if (ctx.reg['sb-010C']) uit.push('het toerental heeft een temperatuurbalk gekregen');
  // En andersom: een liggende balk en een staande meter zijn twee vormen met
  // twee betekenissen. Belanden ze op dezelfde tegel, dan is dat niet mooier
  // maar dubbelzinnig.
  if (!ctx.reg['sm-010C']) uit.push('het toerental heeft geen meter gekregen');
  if (ctx.reg['sm-0105']) uit.push('de koelwatertegel heeft óók een meter gekregen');
  if (ctx.reg['sm-012C'] || ctx.reg['sb-012C']) uit.push('een rest-PID heeft een balk of meter gekregen');
  return uit;
}

// ── de tellerplaat (#68) ─────────────────────────────────────────
function keurMeter(slimBron) {
  const ctx = maakOmgeving(['010C', '0104', '0111'], null, slimBron);
  ctx.renderGauges();
  const uit = [];
  // Toerental: bereik 0-8000, dus 4000 rpm is de halve meter. NIET de marge
  // tot de waarschuwingsgrens van 6000 — dat is wat de temperatuurbalk doet.
  ctx.slimBij('010C', 4000, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  const m = ctx.reg['sm-010C'];
  if (Math.abs(parseFloat(m.style.height) - 50) > 0.6)
    uit.push('4000 rpm geeft meter ' + m.style.height + ', verwacht ~50% (bereik 0-8000)');
  // Boven het bereik loopt hij vol en wordt hij rood; eronder blijft hij leeg.
  ctx.slimBij('010C', 9500, DEFS['010C'], 'danger', ctx.reg['gc-010C']);
  if (parseFloat(m.style.height) !== 100) uit.push('boven het bereik loopt de meter niet vol (' + m.style.height + ')');
  if (m.className !== 'rd') uit.push('boven het bereik is de meter niet rood maar "' + m.className + '"');
  ctx.slimBij('010C', -50, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (parseFloat(m.style.height) !== 0) uit.push('een negatief toerental geeft meter ' + m.style.height);
  // Een pedaal op 30% staat op 30% van zijn meter — dezelfde vorm, dezelfde
  // regel, ook al is het een heel ander soort signaal.
  ctx.slimBij('0111', 30, DEFS['0111'], 'ok', ctx.reg['gc-0111']);
  if (Math.abs(parseFloat(ctx.reg['sm-0111'].style.height) - 30) > 0.6)
    uit.push('gasklep 30% geeft meter ' + ctx.reg['sm-0111'].style.height + ', verwacht ~30%');
  // Het grensstreepje staat er alleen als de grens bekend is. 010C heeft
  // wH 6000 (= 75% van 8000), 0111 heeft er geen.
  const g = ctx.reg['sg-010C'];
  if (!g) uit.push('het toerental heeft een waarschuwingsgrens (6000) maar geen streepje op de meter');
  else if (Math.abs(parseFloat(g.style.bottom) - 75) > 0.6)
    uit.push('het grensstreepje staat op ' + g.style.bottom + ', verwacht ~75% (6000 van 8000)');
  if (ctx.reg['sg-0111'])
    uit.push('de gasklep heeft geen bekende grens maar krijgt tóch een streepje — dat belooft een nauwkeurigheid die er niet is');
  return uit;
}

function keurSleepwijzer(slimBron) {
  const ctx = maakOmgeving(['010C'], null, slimBron);
  ctx.renderGauges();
  const uit = [];
  const pk = ctx.reg['sp-010C'];
  // Zonder historie is er niets om te slepen; dan hoort hij weg te blijven.
  ctx.slimBij('010C', 800, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (pk.style.display !== 'none') uit.push('zonder historie staat er tóch een sleepwijzer');
  // Opgetrokken tot 6000 en weer terug naar 800: de wijzer blijft op 75%
  // staan terwijl de vulling op 10% zit.
  metHistorie(ctx, '010C', [800, 2400, 4200, 6000, 3000, 800]);
  ctx.slimBij('010C', 800, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (pk.style.display === 'none') uit.push('na een piek van 6000 rpm staat er geen sleepwijzer');
  else if (Math.abs(parseFloat(pk.style.bottom) - 75) > 0.6)
    uit.push('de sleepwijzer staat op ' + pk.style.bottom + ', verwacht ~75% (6000 van 8000)');
  // Haalt de vulling hem in, dan verdwijnt hij: twee wijzers op dezelfde
  // hoogte lezen als twee verschillende waarden.
  ctx.slimBij('010C', 6000, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (pk.style.display !== 'none') uit.push('de sleepwijzer blijft staan terwijl de vulling hem heeft ingehaald');
  // En hij zakt weer mee: alleen de laatste 60 metingen tellen, dus een piek
  // van een kwartier geleden mag niet blijven hangen.
  const lang = [];
  for (let i = 0; i < 70; i++) lang.push(i === 0 ? 7000 : 900);
  metHistorie(ctx, '010C', lang);
  ctx.slimBij('010C', 900, DEFS['010C'], 'ok', ctx.reg['gc-010C']);
  if (pk.style.display !== 'none')
    uit.push('een piek van 70 metingen geleden staat er nog steeds (' + pk.style.bottom + ')');
  return uit;
}

// ── #66: een balk zonder bekende grens zegt dat zelf ──────────────
function keurGroveSchaal(renderBron) {
  const ctx = maakOmgeving(['0105', '0146'], renderBron);
  ctx.renderGauges();
  const uit = [];
  // Koelwater heeft dH 110: gewone balk.
  const koel = ctx.reg['sb-0105'].parentNode;
  // Omgevingstemperatuur (−40…85) heeft geen dH en geen wH: terugval op max.
  const omg = ctx.reg['sb-0146'].parentNode;
  if (koel && koel.classList.contains('grof'))
    uit.push('koelwater heeft een gevarengrens maar wordt tóch als grove schaal gemarkeerd');
  if (!omg || !omg.classList.contains('grof'))
    uit.push('omgevingstemperatuur valt terug op het PID-maximum maar de balk zegt dat nergens (issue #66)');
  else if (!/grens/i.test(omg.title))
    uit.push('de grove balk heeft geen uitleg in de tooltip: "' + omg.title + '"');
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

// ── 5. de slimme weergave is de standaard, en de voorkeur wordt gelezen ──
// Draait het echte weergavemodus-blok uit pidlane-pids.js, met een
// nagebootste localStorage. De verleiding is om hier PID_VIEW_STANDAARD uit
// de bron te lezen — dat toetst niets: dan meet je of de constante zichzelf
// gelijk is. Wat er gemeten moet worden is waar plPidViewHerstel() de app
// in zet.
function maakViewOmgeving(opgeslagen, bron) {
  const geschreven = {};
  const ctx = {
    document: {
      getElementById: function () { return null; },
      querySelectorAll: function () { return []; }
    },
    console: { warn: function () {}, log: function () {} },
    localStorage: {
      getItem: function (k) { return (opgeslagen && k in opgeslagen) ? opgeslagen[k] : null; },
      setItem: function (k, v) { geschreven[k] = v; }
    },
    renderGauges: function () {},
    startStaleWatchdog: function () {},
    stopStaleWatchdog: function () {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // pidViewMode is een `let` op scriptniveau en dus GEEN eigenschap van het
  // globale object — vanuit de test niet direct af te lezen. Deze regel geeft
  // er een luikje op, zonder de bron te veranderen.
  vm.runInContext((bron || VIEW_BRON) + '\nwindow.__mode=function(){ return pidViewMode; };',
    ctx, { filename: 'pidlane-pids.js (weergave)' });
  ctx.geschreven = geschreven;
  return ctx;
}
function keurStandaardWeergave(bron) {
  const uit = [];
  const mk = function (opgeslagen) { return maakViewOmgeving(opgeslagen, bron); };
  // Niets opgeslagen: de app start in de slimme weergave.
  let ctx = mk(null);
  if (ctx.__mode() !== 'slim')
    uit.push('zonder opgeslagen voorkeur start de live view in "' + ctx.__mode() + '", verwacht "slim"');
  if (ctx.plPidViewHerstel() !== 'slim')
    uit.push('plPidViewHerstel() zet de app in "' + ctx.__mode() + '" in plaats van in de standaard');
  // Wél iets opgeslagen: dan wint die keuze. Dit is de kern van #68 — tot nu
  // toe werd pl_pidview geschreven en nooit teruggelezen.
  ctx = mk({ pl_pidview: 'dots' });
  if (ctx.plPidViewHerstel() !== 'dots')
    uit.push('een opgeslagen voorkeur "dots" wordt genegeerd; de app start in "' + ctx.__mode() + '"');
  // Rommel in de opslag zet de app niet in een modus die niet bestaat.
  ctx = mk({ pl_pidview: 'kleuren' });
  if (ctx.plPidViewHerstel() !== 'slim')
    uit.push('een onbekende opgeslagen waarde zet de app in "' + ctx.__mode() + '" in plaats van in de standaard');
  // De verwijderde correlatie-weergave is precies zo'n onbekende waarde. Hij
  // komt bij het herstellen dus op de standaard uit en niet op de 'dots' waar
  // setPidView() hem heen stuurt — dat vangnet is er voor een aanroeper die
  // nú om die modus vraagt, en dit is een voorkeur van maanden geleden die
  // over een weergave gaat die niet meer bestaat.
  ctx = mk({ pl_pidview: 'correlate' });
  ctx.plPidViewHerstel();
  if (ctx.__mode() !== 'slim')
    uit.push('een opgeslagen "correlate" (verwijderde weergave) geeft "' + ctx.__mode() + '"');
  // Het vangnet in setPidView() zelf staat er nog wél, voor een directe
  // aanroeper. Verdwijnt dat, dan krijgt het rooster de klasse
  // view-correlate en is er geen enkele opmaak die daarbij hoort.
  ctx = mk(null);
  ctx.setPidView('correlate');
  if (ctx.__mode() !== 'dots')
    uit.push('setPidView("correlate") geeft "' + ctx.__mode() + '" in plaats van "dots"');
  // Een keuze wordt ook echt bewaard, anders valt er de volgende keer niets
  // te herstellen.
  ctx = mk(null);
  ctx.setPidView('numbers');
  if (ctx.geschreven.pl_pidview !== 'numbers')
    uit.push('een gekozen weergave wordt niet opgeslagen (pl_pidview = ' + ctx.geschreven.pl_pidview + ')');
  return uit;
}

// De knop in index.html moet dezelfde weergave aanwijzen als de code, anders
// staat er bij het openen een andere knop actief dan de weergave die je ziet.
// Dat is broncontrole, en dat mag hier: een gedragstoets zou de hele pagina
// moeten laden, en juist de losse waarheid in de HTML was het probleem.
function keurKnopStaatGoed() {
  const html = fs.readFileSync('index.html', 'utf8');
  const uit = [];
  const rij = html.match(/<button class="pidview-btn[^>]*data-mode="[a-z]+"[^>]*>/g) || [];
  if (!rij.length) return ['geen enkele weergaveknop gevonden in index.html'];
  const actief = rij.filter(function (b) { return /class="pidview-btn active"/.test(b); });
  if (actief.length !== 1)
    return [actief.length + ' knoppen staan als actief gemarkeerd; er hoort er precies één te zijn'];
  const mode = (actief[0].match(/data-mode="([a-z]+)"/) || [])[1];
  const ctx = maakViewOmgeving(null);
  if (mode !== ctx.__mode())
    uit.push('in index.html staat de knop "' + mode + '" actief terwijl de app in "' + ctx.__mode() + '" start');
  return uit;
}

// ── 6. de maat volgt het gedrag, niet de soort ───────────────────
// De vorm van een tegel hangt aan slimGroep(); de MAAT hangt aan wat het
// signaal doet. Drie uitkomsten, en de volgorde waarin ze getoetst worden is
// het hele punt: een waarde die vastligt maar op oranje staat is juist het
// gevaarlijkste geval en mag niet naar één regel zakken.
function vlakkeHistorie(n, v) {
  const r = []; for (let i = 0; i < n; i++) r.push({ v: v }); return r;
}
function keurMaat(slimBron) {
  const ctx = maakOmgeving(['012F', '010D', '0106', '0105', '010C'], null, slimBron);
  ctx.renderGauges();
  const uit = [];
  // Nog te weinig gezien: geen uitspraak, dus de veilige kant.
  ctx.pidHist['012F'] = vlakkeHistorie(8, 68);
  if (ctx.slimMaat('012F', DEFS['012F']) !== 'normaal')
    uit.push('met 8 metingen wordt een brandstofpeil al "' + ctx.slimMaat('012F', DEFS['012F']) + '" genoemd');
  // Lang genoeg gezien en het beweegt niet: één regel.
  ctx.pidHist['012F'] = vlakkeHistorie(30, 68);
  if (ctx.slimMaat('012F', DEFS['012F']) !== 'regel')
    uit.push('een brandstofpeil dat 30 metingen op 68% staat krijgt maat "' + ctx.slimMaat('012F', DEFS['012F']) + '", verwacht "regel"');
  // Het beweegt wél: gewone maat.
  ctx.pidHist['010D'] = [];
  for (let i = 0; i < 30; i++) ctx.pidHist['010D'].push({ v: 20 + i * 3 });
  if (ctx.slimMaat('010D', DEFS['010D']) !== 'normaal')
    uit.push('een snelheid van 20 naar 107 km/u krijgt maat "' + ctx.slimMaat('010D', DEFS['010D']) + '", verwacht "normaal"');
  // DE VOLGORDE. Brandstoftrim kort (0106) heeft grenzen; een waarde die
  // vastligt op +25% is precies de storing die je wilt zien, en die mag niet
  // naar de rustige strook zakken omdát hij stilligt.
  const trim = DEFS['0106'];
  if (!trim || typeof trim.wH !== 'number')
    uit.push('0106 heeft geen waarschuwingsgrens meer in pidlane-data.js — deze toets meet dan niets');
  else {
    ctx.pidHist['0106'] = vlakkeHistorie(30, trim.wH + 5);
    ctx.pidVals['0106'] = trim.wH + 5;
    const m = ctx.slimMaat('0106', trim);
    if (m !== 'groot')
      uit.push('een brandstoftrim die vastligt op ' + (trim.wH + 5) + '% krijgt maat "' + m + '", verwacht "groot" — stilstand mag een waarschuwing nooit wegstoppen');
  }
  // Temperaturen en meters hebben hun eigen vorm en krijgen geen maat.
  if (ctx.slimMaat('0105', DEFS['0105']) !== null)
    uit.push('een temperatuur krijgt een maat (' + ctx.slimMaat('0105', DEFS['0105']) + ') terwijl hij in het balkdiagram hoort');
  if (ctx.slimMaat('010C', DEFS['010C']) !== null)
    uit.push('een meter krijgt een maat (' + ctx.slimMaat('010C', DEFS['010C']) + ') terwijl hij op de tellerplaat hoort');
  return uit;
}

// De herweging verhuist de tegels ook echt, en pas ná de wachttijd.
function keurHerweging(slimBron, renderBron) {
  const ctx = maakOmgeving(['012F', '010D', '0105'], renderBron, slimBron);
  ctx.pidHist['012F'] = vlakkeHistorie(30, 68);
  ctx.pidHist['010D'] = [];
  for (let i = 0; i < 30; i++) ctx.pidHist['010D'].push({ v: 20 + i * 3 });
  ctx.renderGauges();
  const uit = [];
  // Bij het opbouwen is de historie er al, dus dan hoort het meteen goed te
  // staan: een herbouw midden in een rit mag een stilliggende sensor niet
  // eerst een halve minuut groot in beeld zetten.
  if (pidsIn(ctx, 'rustig').join(',') !== '012F')
    uit.push('vak Rustig bevat ' + (pidsIn(ctx, 'rustig').join(',') || '(niets)') + ', verwacht 012F');
  if (pidsIn(ctx, 'dash').join(',') !== '010D')
    uit.push('dashboardvak bevat ' + pidsIn(ctx, 'dash').join(',') + ', verwacht alleen 010D');
  if (ctx.reg['slimSec-rustig'].style.display === 'none')
    uit.push('vak Rustig staat op display:none terwijl er een tegel in zit');
  // Een tegel staat nooit in twee vakken tegelijk.
  const overal = ['dash', 'meter', 'temp', 'rest', 'rustig'].reduce(function (a, g) { return a.concat(pidsIn(ctx, g)); }, []);
  if (overal.length !== new Set(overal).size)
    uit.push('een tegel staat in meer dan één vak: ' + overal.join(','));
  // En de geplande herweging: een verse start heeft nog geen historie, dus
  // dan staat alles nog op zijn eigen vak. Pas de herweging deelt opnieuw in.
  const vers = maakOmgeving(['012F', '010D'], renderBron, slimBron);
  vers.renderGauges();
  if (pidsIn(vers, 'rustig').length)
    uit.push('zonder historie belandt er meteen iets in Rustig: ' + pidsIn(vers, 'rustig').join(','));
  vers.pidHist['012F'] = vlakkeHistorie(30, 68);
  vers.pidHist['010D'] = [];
  for (let i = 0; i < 30; i++) vers.pidHist['010D'].push({ v: 20 + i * 3 });
  if (!vers.__herweging()) uit.push('er is helemaal geen herweging ingepland na het opbouwen');
  if (pidsIn(vers, 'rustig').join(',') !== '012F')
    uit.push('na de herweging bevat Rustig ' + (pidsIn(vers, 'rustig').join(',') || '(niets)') + ', verwacht 012F');
  return uit;
}

// Omhoog mag altijd, omlaag alleen bij de herweging.
function keurAsymmetrie(slimBron) {
  const ctx = maakOmgeving(['012F', '010D'], null, slimBron);
  ctx.pidHist['010D'] = vlakkeHistorie(30, 0);      // stilstaande auto
  ctx.pidHist['012F'] = vlakkeHistorie(30, 68);
  ctx.renderGauges();
  const uit = [];
  if (pidsIn(ctx, 'rustig').sort().join(',') !== '010D,012F')
    uit.push('een stilstaande auto zet niet beide tegels in Rustig, maar ' + pidsIn(ctx, 'rustig').join(','));
  // De auto trekt op: de snelheid hoort meteen terug omhoog, zonder op de
  // volgende herweging te wachten — die komt er namelijk niet meer.
  const rijdt = [];
  for (let i = 0; i < 30; i++) rijdt.push({ v: i * 3 });
  ctx.pidHist['010D'] = rijdt;
  ctx.slimBij('010D', 87, DEFS['010D'], 'ok', ctx.reg['gc-010D']);
  if (pidsIn(ctx, 'dash').indexOf('010D') < 0)
    uit.push('de snelheid gaat rijden maar blijft in Rustig staan');
  // En andersom: een tegel die net stil is komen te liggen zakt NIET tijdens
  // het rijden weg. Anders springt een tegel op de grens heen en weer.
  ctx.pidHist['010D'] = vlakkeHistorie(30, 87);
  ctx.slimBij('010D', 87, DEFS['010D'], 'ok', ctx.reg['gc-010D']);
  if (pidsIn(ctx, 'dash').indexOf('010D') < 0)
    uit.push('een tegel zakt tijdens het rijden alsnog weg naar Rustig — dan verspringt de indeling onder je ogen');
  return uit;
}

// ── 7. de namen op de tellerplaat ────────────────────────────────
// Hier hoort de ECHTE hudShortLabel() te draaien, met het echte
// HUD_LABEL_DICT uit pidlane-data.js. Een nagebouwde afkorter zou precies de
// botsing wegnemen die getoetst moet worden: dat "Gaspedaal positie D" en
// "... E" allebei op "GASPED POS" uitkomen is geen bedachte fout maar wat die
// functie vandaag doet.
const NEON_BRON = (function () {
  const bron = fs.readFileSync('pidlane-neon.js', 'utf8');
  const i = bron.indexOf('function hudShortLabel(name){');
  if (i < 0) throw new Error('hudShortLabel() niet gevonden in pidlane-neon.js — hernoemd?');
  const j = bron.indexOf('\nfunction ', i + 10);
  if (j < 0) throw new Error('het einde van hudShortLabel() is niet te vinden');
  return bron.slice(i, j);
})();
function metKorteNamen(actief, slimBron) {
  const ctx = maakOmgeving(actief, null, slimBron);
  ctx.HUD_LABEL_DICT = D.HUD_LABEL_DICT;
  vm.runInContext(NEON_BRON, ctx, { filename: 'pidlane-neon.js (labels)' });
  return ctx;
}
function keurMeterNamen(slimBron) {
  // De vijf van de tellerplaat uit de schermafdruk, inclusief de twee
  // pedaalsensoren die vandaag op dezelfde afkorting uitkomen.
  const plaat = ['010C', '0104', '0143', '014A', '014B'];
  const ctx = metKorteNamen(plaat, slimBron);
  const uit = [];
  if (typeof ctx.hudShortLabel !== 'function') return ['hudShortLabel() is niet geladen; deze toets meet niets'];
  const namen = ctx.slimMeterLabels(plaat);
  // 1. Elke meter heeft een naam, en die is korter dan de volle naam of gelijk.
  plaat.forEach(function (pid) {
    if (!namen[pid]) uit.push(pid + ' krijgt geen naam op de tellerplaat');
  });
  // 2. En de kern: nooit twee meters met dezelfde naam.
  const gezien = {};
  Object.keys(namen).forEach(function (pid) {
    const n = String(namen[pid]).toUpperCase();
    if (gezien[n]) uit.push('"' + n + '" staat op twee meters tegelijk: ' + gezien[n] + ' en ' + pid);
    gezien[n] = pid;
  });
  // 3. Dat de afkorting überhaupt iets doet: het toerental is korter dan
  //    "Motortoerental", anders is de hele stap zinloos.
  if (namen['010C'] && namen['010C'].length >= DEFS['010C'].name.length)
    uit.push('het toerental wordt niet afgekort: "' + namen['010C'] + '"');
  // 4. Alleen de tellerplaat. Een tegel in "Beweegt" heeft de ruimte en houdt
  //    zijn volledige naam — afkorten waar het niet hoeft is verlies.
  const ruim = metKorteNamen(['010C', '012C'], slimBron).slimMeterLabels(['010C', '012C']);
  if (ruim['012C']) uit.push('een tegel buiten de tellerplaat krijgt tóch een korte naam');
  return uit;
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Slimme weergave — standaard, tellerplaat, temperatuurbalken, trend waar het beweegt (#61, #66, #68)\n');

toetsSchoon('de indeling klopt, en toeren/belasting/gasklep zitten NIET in het dashboard', keurIndeling());
toetsSchoon('de tegels belanden in het juiste vak, in de juiste volgorde', keurVierVakken());
toetsSchoon('een leeg vak blijft verborgen', keurLeegVakVerborgen());
toetsSchoon('balk en meter komen nooit op dezelfde tegel', keurTempBalk());
toetsSchoon('de balk meet de marge tot de grens, niet het aantal graden', keurBalkSchaal());
toetsSchoon('de meter meet de stand binnen het eigen bereik', keurMeter());
toetsSchoon('de sleepwijzer houdt de piek vast en laat hem weer los', keurSleepwijzer());
toetsSchoon('een balk zonder bekende grens zegt dat zelf (#66)', keurGroveSchaal());
toetsSchoon('de slimme weergave is de standaard en de voorkeur wordt gelezen', keurStandaardWeergave());
toetsSchoon('de actieve knop in index.html wijst dezelfde weergave aan', keurKnopStaatGoed());
toetsSchoon('de maat volgt het gedrag, en een waarschuwing wint van stilstand', keurMaat());
toetsSchoon('de herweging verhuist de tegels, en een tegel staat nooit in twee vakken', keurHerweging());
toetsSchoon('omhoog mag altijd, omlaag alleen bij de herweging', keurAsymmetrie());
toetsSchoon('elke meter op de tellerplaat heeft een eigen, korte naam', keurMeterNamen());

// ── tegenproef ───────────────────────────────────────────────────
console.log('');
// De oude toestand: één rooster, geen vakken. Dezelfde controle als hierboven,
// nu tegen die versie — staat hij groen, dan meet hij niets.
const RENDER_OUD = RENDER_BRON.replace("const slim = (pidViewMode==='slim');", 'const slim = false;');
if (RENDER_OUD === RENDER_BRON) throw new Error('de tegenproef kon de slim-schakelaar niet uitzetten — is de regel hernoemd?');
toetsMeldt('zonder vakken valt de opbouw door de mand (tegenproef)',
  keurVierVakken(RENDER_OUD), 'dashboardvak bevat');

// Vijf nagebouwde fouten voor wat er deze ronde bij kwam. Elke controle
// hierboven moet er één van rood worden — anders weet je alleen dat hij
// groen kán staan.
function bouw(bron, van, naar, wat) {
  if (bron.indexOf(van) < 0) throw new Error('tegenproef "' + wat + '" kon "' + van + '" niet vinden — hernoemd?');
  return bron.replace(van, naar);
}

// 1. De tellerplaat weer weg uit de indeling: dan vallen toerental en
//    belasting terug in "Beweegt", precies de toestand van vóór #68.
toetsMeldt('zonder de groep "meter" valt de indeling door de mand (tegenproef)',
  keurIndeling(laadData(["if(window.SLIM_METER.indexOf(pid) > -1) return 'meter';", ''])),
  'verwacht "meter"');

// 2. De meter op de temperatuurschaal (marge tot de grens) in plaats van op
//    zijn eigen bereik: 4000 rpm wordt dan 56% van 7200 en geen halve meter.
toetsMeldt('een meter op de grens-schaal valt door de mand (tegenproef)',
  keurMeter(bouw(SLIM_BRON,
    "  const hi=(d && typeof d.max==='number' && isFinite(d.max)) ? d.max : 100;",
    '  const hi=slimTempSchaal(d);', 'meterschaal')),
  'verwacht ~50%');

// 3. Een sleepwijzer die blijft staan zodra er historie is. Hij staat dan
//    bovenop de vulling en leest als een tweede, tegenstrijdige waarde.
toetsMeldt('een sleepwijzer die nooit wijkt valt door de mand (tegenproef)',
  keurSleepwijzer(bouw(SLIM_BRON,
    'if(pd===null || pd-deel<1.5){ pk.style.display=\'none\'; }',
    'if(pd===null){ pk.style.display=\'none\'; }', 'sleepwijzer')),
  'ingehaald');

// 4. De markering van een grove schaal weghalen (#66): de balk van de
//    omgevingstemperatuur ziet er dan uit als elke andere.
toetsMeldt('een ongemarkeerde grove schaal valt door de mand (tegenproef)',
  keurGroveSchaal(bouw(RENDER_BRON, "bar.className='sbar grof';", '', 'grove schaal')),
  'zegt dat nergens');

// 5. En de kern van deze ronde, twee keer: de standaard terug op puntjes, en
//    de opgeslagen voorkeur weer genegeerd zoals hij dat maandenlang was.
toetsMeldt('een andere standaardweergave valt door de mand (tegenproef)',
  keurStandaardWeergave(bouw(VIEW_BRON,
    "const PID_VIEW_STANDAARD = 'slim';", "const PID_VIEW_STANDAARD = 'dots';", 'standaard')),
  'verwacht "slim"');

toetsMeldt('een genegeerde voorkeur valt door de mand (tegenproef)',
  keurStandaardWeergave(bouw(VIEW_BRON,
    "try{ m=localStorage.getItem('pl_pidview'); }", 'try{ m=null; }', 'voorkeur lezen')),
  'wordt genegeerd');

// 6. De maat: het oordeel ná de stilstandcontrole in plaats van ervoor. Dit is
//    de fout die je écht maakt — de regels lezen los van elkaar allemaal goed,
//    en pas de volgorde bepaalt of een storing die vastligt zichtbaar blijft.
toetsMeldt('een waarschuwing die van stilstand verliest valt door de mand (tegenproef)',
  keurMaat(bouw(SLIM_BRON,
    "  if(v!==undefined && v!==null && pidOordeel(d,v,pid)!=='ok') return 'groot';\n" +
    "  const h=pidHist[pid];\n" +
    "  if(!h || h.length<SLIM_MAAT_MIN) return 'normaal';\n" +
    "  return slimBeweegt(pid,d) ? 'normaal' : 'regel';",
    "  const h=pidHist[pid];\n" +
    "  if(!h || h.length<SLIM_MAAT_MIN) return 'normaal';\n" +
    "  if(!slimBeweegt(pid,d)) return 'regel';\n" +
    "  if(v!==undefined && v!==null && pidOordeel(d,v,pid)!=='ok') return 'groot';\n" +
    "  return 'normaal';", 'volgorde in slimMaat')),
  'verwacht "groot"');

// 7. Dezelfde drempel voor "beweegt hij?" en "ligt hij stil?". Vier metingen
//    zijn genoeg voor het eerste en veel te weinig voor het tweede: dan wordt
//    een sensor tot Rustig veroordeeld voordat er iets gezien is.
toetsMeldt('een te lage drempel voor stilstand valt door de mand (tegenproef)',
  keurMaat(bouw(SLIM_BRON, 'const SLIM_MAAT_MIN = 24;', 'const SLIM_MAAT_MIN = 4;', 'maatdrempel')),
  'met 8 metingen');

// 8. De promotie uit Rustig weg: een auto die gaat rijden houdt dan een
//    snelheid op één regeltje, tot de volgende keer dat het scherm opnieuw
//    wordt opgebouwd — en dat kan een hele rit duren.
toetsMeldt('een tegel die niet terug omhoog kan valt door de mand (tegenproef)',
  keurAsymmetrie(bouw(SLIM_BRON,
    "     && (st!=='ok' || slimBeweegt(pid,d))) slimPlaats(pid);",
    '     && false) slimPlaats(pid);', 'promotie')),
  'blijft in Rustig staan');

// 9. En de andere helft: elke tegel bij elke meting opnieuw indelen. Dan zakt
//    een signaal dat even stil ligt middenin de rit weg, en springt het er bij
//    de eerstvolgende beweging weer uit.
toetsMeldt('een indeling die onder je ogen verspringt valt door de mand (tegenproef)',
  keurAsymmetrie(bouw(SLIM_BRON,
    "  if(card && card.parentNode && card.parentNode.id==='slimVak-rustig'\n" +
    "     && (st!=='ok' || slimBeweegt(pid,d))) slimPlaats(pid);",
    '  if(card) slimPlaats(pid);', 'degradatie')),
  'verspringt');

// 10. De herweging uit renderGauges: het vak Rustig blijft dan leeg, ook als
//     de historie er allang is.
toetsMeldt('een opbouw zonder herweging valt door de mand (tegenproef)',
  keurHerweging(null, bouw(RENDER_BRON, 'slimHerweeg(); slimVakkenBij();', '', 'herweging bij opbouw')),
  'verwacht 012F');

// 11. De botsingscontrole weg: dan dragen gaspedaal D en E dezelfde naam en
//     wijst de plaat twee signalen aan zonder te zeggen welk.
toetsMeldt('twee meters met dezelfde naam vallen door de mand (tegenproef)',
  keurMeterNamen(bouw(SLIM_BRON,
    'if(tel[kort].length<2) return;', 'return;', 'botsingscontrole')),
  'staat op twee meters tegelijk');

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
