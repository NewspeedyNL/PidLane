// ══════════════════════════════════════════════════════════════════
// test-bevindingen.js — de balk met automatische bevindingen loopt niet vol
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Issue #60 (30-08-2026): in demostand liep de balk "🔗 Automatische
// bevindingen" door tot voorbij de onderkant van het scherm. Niet door de
// vijf regels in CORRELATION_RULES, maar door het tweede deel van de engine:
// "leren-van-normaal" levert één bevinding per actief PID dat van zijn eigen
// historie afwijkt. Met veertig aangevinkte sensoren zijn dat veertig regels,
// en gesimuleerde demodata wijkt per definitie overal af.
//
// De reparatie is een plafond in de weergave, geen zeef op de bevindingen
// zelf: er staan er hoogstens BEV_MAX in de balk, de rest zit achter één
// regel die een venster opent, en de AI krijgt via correlationLines() nog
// steeds álles. Die drie dingen horen bij elkaar — zonder de derde zou een
// schermkeuze stilletjes de diagnose veranderen.
//
// GEDRAGSTEST, GEEN BRONCONTROLE
// pidlane-correlatie.js draait hier echt, tegen een minimale DOM- en
// opslagnabootsing. De module gebruikt alleen getElementById, createElement,
// insertBefore, appendChild en addEventListener; komt daar ooit een echte
// DOM-API bij, dan klapt deze test en dat is precies de bedoeling.
//
// Draaien vanuit public/:  node test-bevindingen.js     (exit 0 = goed)
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

// ── DOM-nabootsing ───────────────────────────────────────────────
function Element(tag) {
  this.tagName = tag; this.id = ''; this.className = '';
  this.children = []; this.innerHTML = '';
  this.style = { cssText: '', display: '' };
  const zelf = this;
  Object.defineProperty(this, 'firstChild', {
    get: function () { return zelf.children[0] || null; }
  });
  Object.defineProperty(this, 'classList', {
    get: function () {
      return {
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
Element.prototype.addEventListener = function () {};
Element.prototype.insertBefore = function (k) { this.children.unshift(k); return k; };

function maakOmgeving(bron) {
  const reg = {};
  // Deze twee bestaan in de echte app al vóór de module iets doet.
  ['pane-live', 'bevAanBtn', 'bevUitBtn'].forEach(function (id) {
    reg[id] = new Element('div'); reg[id].id = id;
  });
  const body = new Element('body');
  const doc = {
    body: body,
    getElementById: function (id) { return reg[id] || null; },
    createElement: function (t) { return new Element(t); },
    addEventListener: function () {}
  };
  // Elk element dat de module in de boom hangt is daarna vindbaar op zijn id —
  // net als in een echte DOM.
  const onthoud = function (k) { if (k && k.id) reg[k.id] = k; return k; };
  const wrapAppend = Element.prototype.appendChild, wrapInsert = Element.prototype.insertBefore;
  body.appendChild = function (k) { return onthoud(wrapAppend.call(this, k)); };
  reg['pane-live'].insertBefore = function (k) { return onthoud(wrapInsert.call(this, k)); };

  const opslag = {};
  const ctx = {
    document: doc,
    console: { warn: function () {}, log: function () {} },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(opslag, k) ? opslag[k] : null; },
      setItem: function (k, v) { opslag[k] = String(v); }
    },
    logUsage: function () {},
    CORRELATION_RULES: [],
    activePIDs: new Set(),
    pidVals: {},
    baselineBevinding: function () { return null; },
    baselineWarning: function () { return ''; },
    b1s1Line: function () { return ''; },
    _opslag: opslag
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(bron, ctx, { filename: 'pidlane-correlatie.js' });
  ctx.reg = reg;
  return ctx;
}

const BRON = fs.readFileSync('pidlane-correlatie.js', 'utf8');

// ── Een situatie met zes bevindingen: één regelvondst en vijf statistische ──
// De uitleg-teksten zijn herkenbare merktekens, zodat we kunnen tellen WELKE
// er in beeld staan en niet alleen hoeveel.
function vulZesBevindingen(ctx) {
  ctx.CORRELATION_RULES = [
    { id: 'regel1', naam: 'Regelvondst', uitleg: 'MERK-REGEL', test: function () { return true; } },
    { id: 'regelstil', naam: 'Slaat niet aan', uitleg: 'MERK-STIL', test: function () { return false; } },
    { id: 'regelklapt', naam: 'Klapt', uitleg: 'MERK-KLAPT', test: function () { throw new Error('sonde'); } }
  ];
  const sigma = { p1: 9.0, p2: 7.0, p3: 5.0, p4: 3.5, p5: 3.1 };
  ctx.activePIDs = new Set(Object.keys(sigma));
  ctx.pidVals = {}; Object.keys(sigma).forEach(function (p) { ctx.pidVals[p] = 1; });
  ctx.baselineBevinding = function (pid) {
    return sigma[pid] ? { pid: pid, dev: sigma[pid], tekst: 'MERK-' + pid } : null;
  };
  ctx.baselineWarning = function (pid) { return sigma[pid] ? 'MERK-' + pid : ''; };
}

function banner(ctx) { return ctx.reg.corrBanner || null; }
function merkenIn(html) {
  return (String(html || '').match(/MERK-[A-Za-z0-9]+/g) || []);
}

// ── de controles ─────────────────────────────────────────────────
function keurPlafond(bron) {
  const ctx = maakOmgeving(bron || BRON);
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  const uit = [];
  const b = banner(ctx);
  if (!b) return ['er is helemaal geen balk getekend'];
  const zichtbaar = merkenIn(b.innerHTML);
  if (zichtbaar.length !== 2)
    uit.push('er staan ' + zichtbaar.length + ' bevindingen in de balk (' + zichtbaar.join(', ') + '), verwacht 2');
  if (b.innerHTML.indexOf('(6)') < 0)
    uit.push('de kop noemt niet dat het er in totaal 6 zijn');
  if (b.innerHTML.indexOf('nog 4 bevindingen') < 0)
    uit.push('er is geen regel die de overige 4 bevindingen aanbiedt');
  return uit;
}

function keurVolgorde() {
  const ctx = maakOmgeving(BRON);
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  const zichtbaar = merkenIn(banner(ctx).innerHTML);
  const uit = [];
  if (zichtbaar[0] !== 'MERK-REGEL')
    uit.push('bovenaan staat ' + zichtbaar[0] + ' — een regelvondst hoort vóór een statistische afwijking');
  if (zichtbaar[1] !== 'MERK-p1')
    uit.push('op plek twee staat ' + zichtbaar[1] + ' — verwacht de grootste sigma (MERK-p1, 9,0σ)');
  return uit;
}

function keurUitzetten() {
  const ctx = maakOmgeving(BRON);
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  const uit = [];
  if (!banner(ctx) || banner(ctx).style.display !== 'block') uit.push('de balk stond niet eens aan om uit te kunnen zetten');
  ctx.bevindingenZet(false);
  if (banner(ctx).style.display !== 'none') uit.push('na uitzetten staat de balk nog in beeld');
  if (ctx._opslag['pl_bevindingen'] !== '0') uit.push('de keuze is niet opgeslagen');
  // En weer aan, want een schakelaar die maar één kant op werkt is geen schakelaar.
  ctx.bevindingenZet(true);
  if (banner(ctx).style.display !== 'block') uit.push('na weer aanzetten blijft de balk weg');
  if (ctx._opslag['pl_bevindingen'] !== '1') uit.push('het weer aanzetten is niet opgeslagen');
  return uit;
}

function keurStartUit() {
  // Aparte omgeving waarin de voorkeur al op "uit" staat vóór de module laadt.
  const ctx = maakOmgeving('/* leeg */');
  ctx.localStorage.setItem('pl_bevindingen', '0');
  vm.runInContext(BRON, ctx, { filename: 'pidlane-correlatie.js' });
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  const b = banner(ctx);
  return (b && b.style.display !== 'none')
    ? ['de opgeslagen keuze "uit" wordt bij het laden genegeerd']
    : [];
}

function keurVensterToontAlles() {
  const ctx = maakOmgeving(BRON);
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  ctx.openBevindingen();
  const ov = ctx.reg.bevSheet;
  const uit = [];
  if (!ov) return ['het venster is niet aangemaakt'];
  const inVenster = merkenIn(ov.innerHTML);
  if (inVenster.length !== 6)
    uit.push('het venster toont ' + inVenster.length + ' van de 6 bevindingen');
  if (ov.style.display !== 'flex') uit.push('het venster staat niet open');
  return uit;
}

// De kern van de reparatie: het plafond is een SCHERMkeuze. Wat de AI krijgt
// mag er niet door veranderen, anders verandert een weergave-instelling
// stilletjes de diagnose.
function keurAiKrijgtAlles() {
  const ctx = maakOmgeving(BRON);
  vulZesBevindingen(ctx);
  ctx.runCorrelationEngine();
  ctx.bevindingenZet(false);           // balk uit — het strengste geval
  const regels = ctx.correlationLines();
  const uit = [];
  const merken = merkenIn(regels.join('\n'));
  if (merken.length !== 6)
    uit.push('correlationLines() geeft ' + merken.length + ' van de 6 bevindingen door aan de AI');
  return uit;
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Automatische bevindingen — hoogstens twee in beeld (issue #60)\n');

toetsSchoon('van zes bevindingen staan er twee in de balk', keurPlafond());
toetsSchoon('de ernstigste staan bovenaan', keurVolgorde());
toetsSchoon('de balk gaat uit en weer aan, en dat wordt onthouden', keurUitzetten());
toetsSchoon('een opgeslagen "uit" geldt meteen bij het laden', keurStartUit());
toetsSchoon('het venster toont wél alle zes', keurVensterToontAlles());
toetsSchoon('de AI krijgt alle zes, ook met de balk uit', keurAiKrijgtAlles());

// ── tegenproef ───────────────────────────────────────────────────
// Zonder plafond moet de eerste controle rood worden. Zo niet, dan telt hij
// iets anders dan wat er in de balk staat.
console.log('');
toetsMeldt('zonder plafond loopt de balk weer vol (tegenproef)',
  keurPlafond(BRON.replace('const BEV_MAX = 2;', 'const BEV_MAX = 999;')),
  'er staan 6 bevindingen in de balk');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
