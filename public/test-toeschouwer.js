// ══════════════════════════════════════════════════════════════════
// test-toeschouwer.js — PLToeschouwer ziet stilstand, rijden, contact uit
// en helling, en een meetproef stapt daardoor vanzelf door (23-10-2026)
// ──────────────────────────────────────────────────────────────────
// De echte module en de echte PLOpdracht, met vm geladen. Wat hier rood moet
// worden: een meetgat dat als stilstand telt, een korte dip die als stop
// telt, een bevroren timer die uren rijden boekt, een `toestand`-voorwaarde
// die zonder waarneming "niet vervuld" zegt in plaats van "niet na te gaan",
// en een klant die markeringen van een testmiddel in zijn log krijgt.
//
// Draaien vanuit public/:  node test-toeschouwer.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

function laad(o) {
  o = o || {};
  const s = {
    console, Date, Math, JSON, Object, Array, String, Number, isFinite,
    pidHist: {}, connected: true, demoMode: false,
    gemarkeerd: [],
    plMarkeer: function (t, opm) { s.gemarkeerd.push(t + ' | ' + opm); },
    isAdmin: function () { return o.admin !== false; },
    CustomEvent: function (n, d) { this.type = n; this.detail = d && d.detail; },
    dispatchEvent: function () { },
    log: function () { }, btDiag: function () { }
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-opdracht.js'), 'utf8'), s, { filename: 'pidlane-opdracht.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-toeschouwer.js'), 'utf8'), s, { filename: 'pidlane-toeschouwer.js' });
  if (!s.PLToeschouwer || !s.PLOpdracht) throw new Error('PLToeschouwer of PLOpdracht ontbreekt');
  return s;
}

/* Een rit als reeks seconden: [kmh|null, contactStil, helling]. */
function rij(s, t0, reeks) {
  let t = t0;
  reeks.forEach(function (r) {
    s.pidHist['010D'] = r[0] === null ? [] : [{ t: t, v: r[0] }];
    s.PLContact = { stil: function () { return !!r[1]; } };
    s.PLTelemetrie = { hellingVast: function () { return r[2] === undefined ? null : r[2]; } };
    s.PLToeschouwer.tik(t);
    t += 1000;
  });
  return t;
}
function herhaal(x, k) { const u = []; for (let i = 0; i < k; i++) u.push(x); return u; }

console.log('\n1. de pure kern: toestandVan');
{
  const s = laad();
  const tv = s.PLToeschouwer._kern.toestandVan;
  toets('niet verbonden is geen toestand (null)', tv({ verbonden: false, kmh: 0 }) === null);
  toets('contact uit wint van de snelheid', tv({ verbonden: true, kmh: 50, contactStil: true }) === 'contact-uit');
  toets('geen snelheid is onbekend, geen stilstand', tv({ verbonden: true, kmh: null }) === 'onbekend');
  toets('0 km/h is stil', tv({ verbonden: true, kmh: 0 }) === 'stil');
  toets('30 km/h is rijden', tv({ verbonden: true, kmh: 30 }) === 'rijden');
  toets('3 km/h na rijden blijft rijden (hysterese)', tv({ verbonden: true, kmh: 3 }, 'rijden') === 'rijden');
  toets('3 km/h zonder vorige is onbekend', tv({ verbonden: true, kmh: 3 }, null) === 'onbekend');
}

console.log('\n2. een rit: stil → rijden → stil → contact uit → aan');
{
  const s = laad();
  const T = s.PLToeschouwer;
  rij(s, 1e6, [].concat(herhaal([0], 10), herhaal([40], 60), herhaal([0], 20), herhaal([0, true], 15), herhaal([0], 10)));
  const ev = T.gebeurtenissen().map(function (e) { return e.soort; });
  toets('de volgorde klopt', ev.join(',') === 'stil,rijden,stil,contact-uit,contact-aan,stil', ev.join(','));
  toets('rijden telt ± 60 s', Math.abs(T.duurS('rijden') - 60) <= 4, String(T.duurS('rijden')));
  toets('stilstand telt ± 40 s', Math.abs(T.duurS('stil') - 40) <= 6, String(T.duurS('stil')));
  toets('contact uit telt ± 15 s', Math.abs(T.duurS('contact-uit') - 15) <= 4, String(T.duurS('contact-uit')));
  toets('app-maat toestand-stops = 2 (de eerste stilstand is geen stop)', T.maat('toestand-stops') === 2, String(T.maat('toestand-stops')));
  toets('app-maat toestand-contact-uit-n = 1', T.maat('toestand-contact-uit-n') === 1);
  toets('elke overgang werd een markering', s.gemarkeerd.length === 6 && /^toestand: stilstand/.test(s.gemarkeerd[0]), s.gemarkeerd.join(' // '));
  toets('de markering zegt dat hij automatisch is', s.gemarkeerd.every(function (m) { return /automatisch/.test(m); }));
}

console.log('\n3. wat niet als toestand mag tellen');
{
  const s = laad();
  const T = s.PLToeschouwer;
  rij(s, 1e6, [].concat(herhaal([50], 20), herhaal([null], 30), herhaal([50], 10)));
  toets('een meetgat midden in het rijden is geen stilstand', T.duurS('stil') === 0 && (T.stand().aantal.stil || 0) === 0, JSON.stringify(T.stand().duur));
  toets('het gat staat als toestand-gat-s (± 30)', Math.abs(T.maat('toestand-gat-s') - 30) <= 2, String(T.maat('toestand-gat-s')));
  toets('en rijden is één keer begonnen', T.stand().aantal.rijden === 1, JSON.stringify(T.stand().aantal));

  const s2 = laad();
  rij(s2, 1e6, [].concat(herhaal([50], 20), herhaal([0], 2), herhaal([50], 20)));
  toets('twee seconden 0 km/h is nog geen stop', (s2.PLToeschouwer.stand().aantal.stil || 0) === 0, JSON.stringify(s2.PLToeschouwer.stand().aantal));

  const s3 = laad();
  s3.pidHist['010D'] = [{ t: 1e6, v: 50 }];
  s3.PLToeschouwer.tik(1e6);
  s3.pidHist['010D'] = [{ t: 1e6 + 3600e3, v: 50 }];
  s3.PLToeschouwer.tik(1e6 + 3600e3);
  toets('een bevroren timer boekt geen uur rijden', s3.PLToeschouwer.duurS('rijden') <= 5, String(s3.PLToeschouwer.duurS('rijden')));

  const s4 = laad();
  s4.pidHist['010D'] = [{ t: 1e6 - 60e3, v: 0 }];
  s4.PLToeschouwer.tik(1e6);
  toets('een oude snelheid is geen snelheid', s4.PLToeschouwer.stand().toestand === null);

  const s5 = laad();
  toets('zonder waarneming geeft een maat null, geen 0', s5.PLToeschouwer.maat('toestand-stil-s') === null);
}

console.log('\n4. helling');
{
  const s = laad();
  const T = s.PLToeschouwer;
  rij(s, 1e6, [].concat(herhaal([40, false, 0.5], 10), herhaal([40, false, 4], 20), herhaal([0, false, 4], 10), herhaal([0, false, 0], 5)));
  toets('helling is één gebeurtenis', (T.stand().aantal.helling || 0) === 1, JSON.stringify(T.stand().aantal));
  toets('helling telt ± 30 s, ook stilstaand', Math.abs(T.duurS('helling') - 30) <= 4, String(T.duurS('helling')));
  const s2 = laad();
  rij(s2, 1e6, herhaal([40, false, null], 20));
  toets('zonder telefoon in de houder: geen helling', s2.PLToeschouwer.duurS('helling') === 0);
}

console.log('\n5. een klant krijgt geen markeringen');
{
  const s = laad({ admin: false });
  rij(s, 1e6, [].concat(herhaal([0], 5), herhaal([40], 10)));
  toets('wel gebeurtenissen', s.PLToeschouwer.gebeurtenissen().length === 2);
  toets('geen markeringen', s.gemarkeerd.length === 0, s.gemarkeerd.join(' // '));
}

console.log('\n6. de meetproef stapt door: voorwaarde `toestand` in PLOpdracht');
{
  const s = laad();
  const O = s.PLOpdracht;
  const opdr = { schema: 2, naam: 'Stilstand en rijden', sensoren: ['010D'], duurS: 600,
    voorwaarden: [{ wat: 'Stilgestaan', toestand: 'stil', minS: 20 }, { wat: 'Gereden', toestand: 'rijden', minS: 30 }],
    proeven: [{ issue: '#1', naam: 'stops', app: 'toestand-stops', tussen: [0, 99] }] };
  const k = O.keur(opdr);
  toets('keur() kent de toestand-voorwaarde', k.ok, JSON.stringify(k.fouten));
  toets('minS gaat mee', k.ok && k.opdracht.voorwaarden[0].minS === 20 && k.opdracht.voorwaarden[0].toestand === 'stil');
  toets('een onbekende toestand wordt afgekeurd', !O.keur(Object.assign({}, opdr, { voorwaarden: [{ wat: 'x', toestand: 'vliegen' }] })).ok);
  toets('minS boven de grens wordt afgekeurd', !O.keur(Object.assign({}, opdr, { voorwaarden: [{ wat: 'x', toestand: 'stil', minS: 99999 }] })).ok);
  toets('toestand naast pid in één voorwaarde wordt afgekeurd',
    !O.keur(Object.assign({}, opdr, { voorwaarden: [{ wat: 'x', toestand: 'stil', pid: '010D', meet: 'max', tussen: [0, 1] }] })).ok);

  const vw0 = O.voorwaarden(k.opdracht);
  toets('nog niets gezien → niet na te gaan (null), niet "niet vervuld"', vw0.every(function (v) { return v.vervuld === null; }), JSON.stringify(vw0));

  rij(s, 1e6, [].concat(herhaal([0], 25), herhaal([40], 10)));
  const vw1 = O.voorwaarden(k.opdracht);
  toets('na 25 s stil: stilstand vervuld', vw1[0].vervuld === true, JSON.stringify(vw1[0]));
  toets('na 10 s rijden: rijden nog niet', vw1[1].vervuld === false && /nodig/.test(vw1[1].detail), JSON.stringify(vw1[1]));
  rij(s, 1e6 + 35e3, herhaal([40], 30));
  const vw2 = O.voorwaarden(k.opdracht);
  toets('na nog 30 s rijden: allebei vervuld, zonder één handmatige stap', vw2.every(function (v) { return v.vervuld === true; }), JSON.stringify(vw2));
  toets('reset() begint opnieuw', (s.PLToeschouwer.reset(), s.PLToeschouwer.gezien() === false));
}

console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
