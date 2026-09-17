// ══════════════════════════════════════════════════════════════════
// test-bron.js — weet de app op welke bron hij draait? (#242)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT.
//
// Een preview draait dezelfde app met andere code. Van buiten zie je geen
// verschil — en dat is precies hoe je een rit weggooit: een uur meten, het
// verslag lezen, en dan pas merken dat je op de verkeerde bron zat. Dat is op
// 26-08 gebeurd met een versienummer (toestel draaide 4.8, de vraag ging over
// 4.9) en dat is de reden dat de versie nu op het inlogscherm staat.
//
// Twee dingen moeten daarom waar zijn, en allebei falen ze stil:
//
//   1. WAT TELT ALS PRODUCTIE. Een adres dat er bijna hetzelfde uitziet is
//      geen productie. Een vergelijking die te soepel is, laat de banner
//      wegblijven op precies het moment dat hij nodig is.
//   2. WAT ER IN DE CONFIG MAG STAAN. `bron_preview` wordt een navigatie. Een
//      half adres, http in plaats van https, of iets dat geen adres is, hoort
//      genegeerd te worden — niet uitgevoerd.
//
// Draaien vanuit public/:  node test-bron.js        (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

function laad(origin, extra) {
  const s = Object.assign({ PID_CONFIG: {} }, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  s.location = { origin: origin, href: origin };
  s.gemaakt = [];
  s.geplakt = [];
  const maak = function () {
    const el = {
      id: '', className: '', type: '', textContent: '', style: { cssText: '' },
      offsetHeight: 24, klikkers: [],
      addEventListener: function (e, fn) { if (e === 'click') el.klikkers.push(fn); },
      appendChild: function (k) { s.geplakt.push(k); }
    };
    s.gemaakt.push(el);
    return el;
  };
  s.document = {
    createElement: maak,
    getElementById: function (id) { return s.elems && s.elems[id] ? s.elems[id] : null; },
    addEventListener: function (naam, fn) { (s.haken = s.haken || {})[naam] = fn; },
    body: { appendChild: function (e) { s.geplakt.push(e); }, style: {} }
  };
  s.setTimeout = function () { return 0; };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-bron.js', 'utf8'), s, { filename: 'pidlane-bron.js' });
  if (!s.PLBron) { console.error('FOUT: PLBron hangt niet naar buiten'); process.exit(1); }
  return s;
}

const LIVE = laad('https://app.pidlane.nl').PLBron._productie();

// ══════════════════════════════════════════════════════════════════
console.log('\n1. wat telt als productie, en wat niet');
// ══════════════════════════════════════════════════════════════════
{
  toets('de echte bron is productie', laad(LIVE).PLBron.isProductie() === true);

  // Adressen die er bijna hetzelfde uitzien. Elk van deze moet de banner
  // opleveren; een soepele vergelijking laat hem juist hier weg.
  const bijna = [
    'https://app.pidlane.nl.kwaad.example',
    'https://app-pidlane.nl',
    'http://app.pidlane.nl',
    'https://tak-pidlane-proxy.voorbeeld.workers.dev',
    'https://newspeedynl.github.io',
    'https://app.pidlane.nl:8443'
  ];
  bijna.forEach(function (o) {
    toets('geen productie: ' + o, laad(o).PLBron.isProductie() === false);
  });

  const s = laad('https://tak.workers.dev');
  toets('de stempel noemt PREVIEW én het adres',
    /PREVIEW/.test(s.PLBron.stempel()) && /tak\.workers\.dev/.test(s.PLBron.stempel()), s.PLBron.stempel());
  toets('en op productie zegt hij productie',
    /productie/.test(laad(LIVE).PLBron.stempel()), laad(LIVE).PLBron.stempel());
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. wat er uit de Config als adres geaccepteerd wordt');
// ══════════════════════════════════════════════════════════════════
{
  function metUrl(u) { return laad(LIVE, { PID_CONFIG: { bron_preview: u } }).PLBron.preview(); }

  toets('een volledig https-adres komt door',
    metUrl('https://tak-pidlane-proxy.voorbeeld.workers.dev') === 'https://tak-pidlane-proxy.voorbeeld.workers.dev');
  toets('een afsluitende schuine streep gaat eraf',
    metUrl('https://tak.workers.dev/') === 'https://tak.workers.dev');
  toets('spaties eromheen storen niet', metUrl('  https://tak.workers.dev  ') === 'https://tak.workers.dev');

  // Alles hieronder zou een navigatie worden naar iets wat niemand bedoelde.
  [
    ['leeg', ''],
    ['http in plaats van https', 'http://tak.workers.dev'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<h1>hoi'],
    ['alleen een hostnaam', 'tak.workers.dev'],
    ['een halve URL', 'https://'],
    ['iets dat geen adres is', 'zet hem maar aan']
  ].forEach(function (g) {
    toets('genegeerd: ' + g[0], metUrl(g[1]) === '', 'gaf: ' + JSON.stringify(metUrl(g[1])));
  });
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. wie er mag wisselen');
// ══════════════════════════════════════════════════════════════════
{
  const url = 'https://tak.workers.dev';
  toets('geen beheerder: nee',
    laad(LIVE, { isAdmin: () => false, PID_CONFIG: { bron_preview: url } }).PLBron.magWisselen() === false);
  toets('beheerder zonder adres: nee',
    laad(LIVE, { isAdmin: () => true }).PLBron.magWisselen() === false);
  toets('beheerder mét adres: ja',
    laad(LIVE, { isAdmin: () => true, PID_CONFIG: { bron_preview: url } }).PLBron.magWisselen() === true);
  // En de weg terug moet er ALTIJD zijn: zit je op een preview, dan mag je
  // terug ook zonder dat er een adres in de Config staat. Anders kun je op
  // een tak stranden zodra iemand het veld leegmaakt.
  toets('op een preview mag je altijd terug',
    laad(url, { isAdmin: () => true }).PLBron.magWisselen() === true);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. wisselen gaat naar de andere kant, en nergens anders heen');
// ══════════════════════════════════════════════════════════════════
{
  const url = 'https://tak.workers.dev';
  const van = laad(LIVE, { isAdmin: () => true, PID_CONFIG: { bron_preview: url } });
  toets('vanaf productie ga je naar de preview',
    van.PLBron.wissel() === true && van.location.href === url, van.location.href);

  const terug = laad(url, { isAdmin: () => true, PID_CONFIG: { bron_preview: url } });
  toets('vanaf de preview ga je terug naar productie',
    terug.PLBron.wissel() === true && terug.location.href === LIVE, terug.location.href);

  const zonder = laad(LIVE, { isAdmin: () => true });
  toets('zonder adres gebeurt er niets', zonder.PLBron.wissel() === false && zonder.location.href === LIVE,
    zonder.location.href);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. de banner: alleen buiten productie, en niet weg te klikken');
// ══════════════════════════════════════════════════════════════════
{
  const live = laad(LIVE);
  toets('op productie komt er geen banner', live.PLBron.teken() === undefined && live.geplakt.length === 0,
    'een banner die er altijd staat wordt genegeerd, en dan mist hij zijn doel');

  const prev = laad('https://tak.workers.dev');
  prev.PLBron.teken();
  const b = prev.geplakt.filter(function (e) { return e.id === 'bronBanner'; })[0];
  toets('op een preview staat hij er wél', !!b, JSON.stringify(prev.geplakt.map(e => e.id)));
  toets('en hij noemt het adres', b && /tak\.workers\.dev/.test(b.textContent), b && b.textContent);
  toets('met een knop terug naar live',
    prev.gemaakt.some(function (e) { return /terug naar live/.test(e.textContent); }),
    JSON.stringify(prev.gemaakt.map(e => e.textContent)));
  toets('de app schuift eronder in plaats van eroverheen',
    /px$/.test(String(prev.document.body.style.paddingTop || '')), prev.document.body.style.paddingTop);

  // TEGENPROEF: twee keer tekenen levert geen tweede banner op. Anders staat
  // er na een paar rondes een stapel balken en verdwijnt het scherm.
  const voor = prev.geplakt.filter(function (e) { return e.id === 'bronBanner'; }).length;
  prev.elems = { bronBanner: b };
  prev.PLBron.teken();
  toets('TEGENPROEF: twee keer tekenen geeft één banner',
    prev.geplakt.filter(function (e) { return e.id === 'bronBanner'; }).length === voor);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                          : 'goed: alle ' + n + ' controles') + '\n');
process.exit(fout ? 1 : 0);
