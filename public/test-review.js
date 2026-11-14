// ══════════════════════════════════════════════════════════════════
// test-review.js — PLReview: om een Play-beoordeling vragen (14-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-review.js in een vm. Toetst wanneer hij vraagt
// (genoeg gebruikt, na een goed moment, niet te vaak, nooit na "nee"), dat
// hij wacht tot het rustig is (niet rijdend, geen strook, geen intro), dat
// hij alleen in de Android-app vraagt, en de haken in pidlane-strook.js.
//
// Draaien vanuit public/:  node test-review.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const DAG = 86400000;
function laad(o) {
  o = o || {};
  const opslag = Object.assign({}, o.opslag);
  const elementen = {};
  const s = {
    console: { warn() {}, log() {}, info() {} },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: {
      getElementById: (id) => elementen[id] || null,
      createElement: () => ({ hidden: false, setAttribute() {}, innerHTML: '' }),
      body: { appendChild: (e) => { elementen[e.id] = e; } }
    },
    Capacitor: o.web ? undefined : { isNativePlatform: () => true, getPlatform: () => o.platform || 'android' },
    pidVals: {}, demoMode: !!o.demo, location: { href: '' },
    timers: [], setTimeout(f) { s.timers.push(f); return s.timers.length; },
    JSON, Date, Number, isFinite
  };
  s.window = s; s.opslag = opslag; s.elementen = elementen;
  vm.createContext(s);
  vm.runInContext(lees('pidlane-review.js'), s);
  return s;
}
const oud = (extra) => JSON.stringify(Object.assign({ eerste: Date.now() - 10 * DAG, verbindingen: 5, laatst: 0, keer: 0, klaar: false }, extra));
const kaart = (s) => !!(s.elementen.plReview && !s.elementen.plReview.hidden);
const draai = (s) => { const t = s.timers.splice(0); t.forEach((f) => f()); };

console.log('\n1. De pure kern');
const K = laad()._kern || laad().PLReview._kern;
const nu = Date.now();
const st = (x) => Object.assign({ eerste: nu - 10 * DAG, verbindingen: 5, laatst: 0, keer: 0, klaar: false }, x);
toets('genoeg gebruikt: vragen', K.magVragen(st({}), nu));
toets('te kort in gebruik: niet', !K.magVragen(st({ eerste: nu - 1 * DAG }), nu));
toets('te weinig verbindingen: niet', !K.magVragen(st({ verbindingen: 2 }), nu));
toets('kort geleden gevraagd: niet', !K.magVragen(st({ laatst: nu - 10 * DAG, keer: 1 }), nu));
toets('lang geleden gevraagd: weer wel', K.magVragen(st({ laatst: nu - 70 * DAG, keer: 1 }), nu));
toets('al drie keer gevraagd: nooit meer', !K.magVragen(st({ keer: 3 }), nu));
toets('na ja of nee: nooit meer', !K.magVragen(st({ klaar: true }), nu));
toets('rustig: niet rijdend, geen strook, geen intro', K.magVragen && K.rustigMoment({}) && !K.rustigMoment({ rijdt: true }) && !K.rustigMoment({ strook: true }) && !K.rustigMoment({ intro: true }));

console.log('\n2. Het gedrag');
{
  const s = laad();
  const b = JSON.parse(s.opslag.pl_review);
  toets('de eerste keer laden legt het begin vast', b.eerste > 0 && b.verbindingen === 0);
  s.PLReview.verbonden(); s.PLReview.verbonden();
  toets('verbindingen tellen', JSON.parse(s.opslag.pl_review).verbindingen === 2);
  toets('nieuw in gebruik: geen vraag', s.PLReview.goedMoment('x') === false && !kaart(s));
}
{
  const s = laad({ opslag: { pl_review: oud() } });
  toets('goed moment: hij gaat vragen', s.PLReview.goedMoment('foutcodes groen') === true);
  toets('…maar niet meteen (eerst de strook weg)', !kaart(s));
  s.pidVals['010D'] = 80;
  draai(s);
  toets('rijdend: nog niet', !kaart(s) && s.timers.length === 1);
  s.pidVals['010D'] = 0;
  draai(s);
  toets('stil: de kaart', kaart(s) && /plReviewJa/.test(s.elementen.plReview.innerHTML) && /plReviewNee/.test(s.elementen.plReview.innerHTML));
  toets('geteld als gevraagd', JSON.parse(s.opslag.pl_review).keer === 1);
  s.PLReview.ja();
  toets('Beoordelen: de Play-pagina van de app, en nooit meer vragen', s.location.href === K.PLAY && /id=nl\.pidlane\.app/.test(K.PLAY) && JSON.parse(s.opslag.pl_review).klaar === true && !kaart(s));
}
{
  const s = laad({ opslag: { pl_review: oud() } });
  s.PLReview.goedMoment(); draai(s);
  s.PLReview.nee();
  toets('Nee, bedankt: nooit meer', JSON.parse(s.opslag.pl_review).klaar === true && s.PLReview.goedMoment() === false);
}
{
  const s = laad({ opslag: { pl_review: oud() } });
  s.PLReview.goedMoment(); draai(s); s.PLReview.later();
  toets('Later: weg, en niet de volgende dag opnieuw', !kaart(s) && s.PLReview.goedMoment() === false);
}
{
  const s = laad({ opslag: { pl_review: oud() } });
  s.PLStrook = { actief: () => true };
  s.PLReview.goedMoment();
  for (let i = 0; i < 60; i++) draai(s);
  toets('de strook blijft open: na het wachten geen kaart (volgende keer)', !kaart(s));
}
toets('in de browser: nooit', laad({ web: true, opslag: { pl_review: oud() } }).PLReview.goedMoment() === false);
toets('op iOS: nooit (Play-pagina)', laad({ platform: 'ios', opslag: { pl_review: oud() } }).PLReview.goedMoment() === false);
toets('in de demo: nooit', laad({ demo: true, opslag: { pl_review: oud() } }).PLReview.goedMoment() === false);

console.log('\n3. De haken');
const strook = lees('pidlane-strook.js');
toets('een echte verbinding telt (geen hervatting)', /if \(!opties\.hervat\) \{ try \{ if \(window\.PLReview\) PLReview\.verbonden\(\);/.test(strook));
toets('foutcodes groen is het goede moment', /if \(r\.status === 'ok'\) \{ try \{ if \(window\.PLReview\) PLReview\.goedMoment\('foutcodes groen'\)/.test(strook));
toets('geen goedMoment vanuit een foutpad', (strook.match(/PLReview\.goedMoment\(/g) || []).length === 1);
toets('het script staat in index.html', lees('index.html').indexOf('<script src="pidlane-review.js"></script>') > 0);

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
process.exit(fout ? 1 : 0);
