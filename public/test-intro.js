// ════════════════════════════════════════════════════════════════
// test-intro.js — de opstart-intro houdt de app niet op en dekt hem niet af
// ────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. De vorige splash ging op 26-07-2026 weg omdat
// hij elke start 3,4 s ophield. De nieuwe (24-09) mag er alleen zijn onder
// voorwaarden, en elk van die voorwaarden is een stille fout als hij wegvalt:
// niemand merkt dat de intro bij "minder beweging" toch speelt, of dat hij
// elke keer opnieuw komt in plaats van één keer per sessie.
//
// En er is een ergere fout dan "hij speelt te vaak": het donkere vlak staat
// al in de HTML vóór het script. Blijft het staan, dan is de app onbruikbaar.
// Daarom toetst deze test ook de koppeling tussen de JS-timer en de
// CSS-tijdlijn, en de noodrem in de CSS.
//
// HOE. pidlane-intro.js wordt in zijn geheel geladen in een sandbox met een
// nagemaakt document; timers en DOMContentLoaded worden met de hand
// afgespeeld. pidlane.css en index.html worden gelezen waar het over hun
// onderlinge afspraak gaat — dat is geen gedrag dat in node te draaien is,
// en bproef-intro.js toetst het in de echte browser.
//
// Draaien vanuit public/:  node test-intro.js       (exit 0 = goed)
// ════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-intro.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'pidlane.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// ── de sandbox ─────────────────────────────────────────────────
function bouw(o) {
  o = o || {};
  const s = {};
  s.window = s;
  s.console = { log() {}, warn() {}, info() {}, error() {} };
  const klassen = new Set();
  s.el = {
    hidden: false,
    classList: {
      add(...k) { k.forEach(x => klassen.add(x)); },
      remove(...k) { k.forEach(x => klassen.delete(x)); },
      contains(k) { return klassen.has(k); },
    },
  };
  s.klassen = klassen;
  s.luisteraars = {};
  s.document = {
    readyState: o.readyState || 'loading',
    getElementById(id) { return id === 'plIntro' ? s.el : null; },
    addEventListener(t, f) { (s.luisteraars[t] = s.luisteraars[t] || []).push(f); },
    removeEventListener(t, f) { s.luisteraars[t] = (s.luisteraars[t] || []).filter(x => x !== f); },
  };
  s.navigator = { webdriver: !!o.webdriver };
  s.matchMedia = () => ({ matches: !!o.verminderd });
  const opslag = Object.assign({}, o.opslag || {});
  s.opslag = opslag;
  s.sessionStorage = {
    getItem(k) { return k in opslag ? opslag[k] : null; },
    setItem(k, v) { opslag[k] = String(v); },
  };
  s.klok = 0;
  s.performance = { now() { return s.klok; } };
  s.timers = [];
  s.setTimeout = (f, ms) => { s.timers.push({ f, ms }); return s.timers.length; };
  s.clearTimeout = (id) => { if (id && s.timers[id - 1]) s.timers[id - 1].f = null; };
  s.draai = () => { const t = s.timers.slice(); s.timers.length = 0; t.forEach(x => x.f && x.f()); };
  s.dcl = () => (s.luisteraars.DOMContentLoaded || []).forEach(f => f());
  vm.createContext(s);
  vm.runInContext(BRON, s);
  return s;
}

console.log('\n1. Het besluit — wanneer speelt hij níét');
{
  const s = bouw();
  const R = s.PLIntro.reden;
  toets('gewone koude start: speelt', R({}), '');
  toets('minder beweging: niet', R({ verminderd: true }), 'minder beweging');
  toets('al getoond deze sessie: niet', R({ gezien: true }), 'al getoond deze sessie');
  toets('onder automatisering: niet', R({ webdriver: true }), 'automatisering');
  toets('opstart net op de grens: speelt nog', R({ wachtMs: s.PLIntro.MAX_WACHT_MS }), '');
  toets('opstart trager dan de grens: niet', /^opstart te traag/.test(R({ wachtMs: s.PLIntro.MAX_WACHT_MS + 1 })), true);
}

console.log('\n2. Mag hij niet, dan is het donkere vlak meteen weg — vóór DOMContentLoaded');
for (const [naam, o] of [['minder beweging', { verminderd: true }],
                         ['al gezien', { opslag: { pl_intro_gezien: '1' } }],
                         ['automatisering', { webdriver: true }]]) {
  const s = bouw(o);
  s.PLIntro.start();
  toets(naam + ': vlak verborgen zonder te wachten', s.el.hidden, true);
  toets(naam + ': geen luisteraar op DOMContentLoaded', (s.luisteraars.DOMContentLoaded || []).length, 0);
}

console.log('\n3. Een gewone start: wachten op DOMContentLoaded, spelen, opruimen');
{
  const s = bouw();
  toets('start() geeft geen reden', s.PLIntro.start(), '');
  toets('vóór DOMContentLoaded: vlak staat, speelt nog niet', [s.el.hidden, s.klassen.has('pli-speel')], [false, false]);
  s.klok = 900; s.dcl();
  toets('na DOMContentLoaded: speelt', s.klassen.has('pli-speel'), true);
  toets('onthouden voor deze sessie', s.opslag.pl_intro_gezien, '1');
  toets('timer staat op DUUR_MS', s.timers.map(t => t.ms), [s.PLIntro.DUUR_MS]);
  s.draai();
  toets('na afloop verborgen en klassen weg', [s.el.hidden, s.klassen.has('pli-speel')], [true, false]);
  toets('na afloop geen tikluisteraar meer', (s.luisteraars.pointerdown || []).length, 0);
}

console.log('\n4. Een trage opstart krijgt er geen intro bovenop');
{
  const s = bouw();
  s.PLIntro.start();
  s.klok = s.PLIntro.MAX_WACHT_MS + 500; s.dcl();
  toets('niet gespeeld, meteen verborgen', [s.klassen.has('pli-speel'), s.el.hidden], [false, true]);
}

console.log('\n5. Eén tik en hij is weg — en de tik raakt niets eronder');
{
  const s = bouw();
  s.PLIntro.start(); s.dcl();
  const tik = s.luisteraars.pointerdown && s.luisteraars.pointerdown[0];
  toets('tikluisteraar staat tijdens het spelen', typeof tik, 'function');
  const ev = { type: 'pointerdown', tegen: 0, verder: 0,
    preventDefault() { this.tegen++; }, stopPropagation() { this.verder++; } };
  tik(ev);
  toets('de tik gaat niet door naar de knop eronder', [ev.tegen, ev.verder], [1, 1]);
  toets('uitfaden begonnen', s.klassen.has('pli-weg'), true);
  toets('de lange timer is vervangen door de korte', s.timers.filter(t => t.f).map(t => t.ms), [240]);
  s.draai();
  toets('daarna verborgen', s.el.hidden, true);
}

console.log('\n6. Opnieuw spelen op verzoek (bproef-intro.js) werkt ook na een overslaan');
{
  const s = bouw({ webdriver: true, readyState: 'complete' });
  s.PLIntro.start();
  toets('eerst overgeslagen', s.el.hidden, true);
  toets('forceer: speelt meteen als de pagina al geladen is', s.PLIntro.start({ forceer: true }), '');
  toets('zichtbaar en spelend', [s.el.hidden, s.klassen.has('pli-speel')], [false, true]);
  toets('dubbel starten wordt geweigerd', s.PLIntro.start({ forceer: true }), 'speelt al');
}

console.log('\n7. De afspraak tussen de JS-timer en de CSS-tijdlijn');
{
  // Het einde van de tijdlijn is de regel die #plIntro onzichtbaar maakt.
  const m = /#plIntro\.pli-speel\{\s*animation:(\w+)\s+[\d.]+s\s+\w+\s+([\d.]+)s/.exec(CSS);
  toets('de CSS heeft een eindregel voor .pli-speel', !!m, true);
  const eindMs = m ? Math.round(parseFloat(m[2]) * 1000) : NaN;
  const s = bouw();
  const duur = s.PLIntro.DUUR_MS;
  // Te kort knipt de doorzoom af; veel te lang houdt de tikluisteraar de
  // app bezet terwijl er niets meer te zien is.
  toets('DUUR_MS ligt net ná het CSS-einde (0–300 ms)', duur >= eindMs && duur - eindMs <= 300, true);

  const nood = /#plIntro:not\(\.pli-speel\)\{\s*animation:(\w+)\s+[\d.]+s\s+\w+\s+([\d.]+)s/.exec(CSS);
  toets('er is een noodrem voor het vlak dat niet speelt', !!nood, true);
  toets('noodrem ruim na MAX_WACHT_MS', nood ? parseFloat(nood[2]) * 1000 > s.PLIntro.MAX_WACHT_MS : false, true);
  // Zelfde naam = Chromium herstart de animatie niet bij het wisselen van
  // regel, en telt de 2,85 s vanaf het laden van de pagina.
  toets('noodrem en eindregel hebben elk een eigen keyframe-naam', !!(m && nood && m[1] !== nood[1]), true);
  const verbergt = (naam) => new RegExp('@keyframes ' + naam + '\\{\\s*to\\{\\s*visibility:hidden;').test(CSS);
  toets('beide keyframes maken het vlak onzichtbaar', !!(m && nood && verbergt(m[1]) && verbergt(nood[1])), true);
  toets('[hidden] wint van display', /#plIntro\[hidden\]\{\s*display:none !important;/.test(CSS), true);
}

console.log('\n8. De plek in index.html');
{
  const body = HTML.indexOf('<body>');
  const vlak = HTML.indexOf('<div id="plIntro"');
  const script = HTML.indexOf('<script src="pidlane-intro.js"></script>');
  const eerstVolgend = HTML.indexOf('<script', vlak);
  toets('het vlak staat in de body', body >= 0 && vlak > body, true);
  toets('het script staat direct na het vlak, vóór elk ander script', script > vlak && script === eerstVolgend, true);
  toets('er zit geen ander element tussen <body> en het vlak dan commentaar',
    HTML.slice(body + 6, vlak).replace(/<!--[\s\S]*?-->/g, '').trim(), '');
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
process.exit(fout ? 1 : 0);
