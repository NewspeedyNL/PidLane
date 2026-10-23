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

console.log('\n7. de bovengrens: één periode te lang is buiten de opstelling (#599)');
{
  const s = laad();
  const O = s.PLOpdracht, T = s.PLToeschouwer;
  const opdr = { schema: 2, naam: 'Contact uit', sensoren: ['010D'], duurS: 600,
    voorwaarden: [{ wat: 'Contact 20 s tot 1 min uit', toestand: 'contact-uit', minS: 20, maxS: 60 }],
    proeven: [{ issue: '#487', naam: 'aantal keer uit', app: 'toestand-contact-uit-n', tussen: [0, 99] }] };
  const k = O.keur(opdr);
  toets('keur() neemt maxS mee', k.ok && k.opdracht.voorwaarden[0].maxS === 60, JSON.stringify(k.fouten || k.opdracht.voorwaarden));
  toets('maxS onder minS wordt afgekeurd', !O.keur(Object.assign({}, opdr, { voorwaarden: [{ wat: 'x', toestand: 'stil', minS: 30, maxS: 10 }] })).ok);
  toets('zonder maxS geen veld maxS (de oude voorwaarde blijft wat hij was)',
    O.keur(Object.assign({}, opdr, { voorwaarden: [{ wat: 'x', toestand: 'stil', minS: 30 }] })).opdracht.voorwaarden[0].maxS === undefined);

  // 10 s rijden, 95 s contact uit, weer aan: de bediening, niet de auto.
  let t = rij(s, 1e6, [].concat(herhaal([40], 10), herhaal([0, true], 95), herhaal([0], 6)));
  const v1 = O.voorwaarden(k.opdracht)[0];
  // De periode loopt tot de toeschouwer de nieuwe toestand aanneemt: ± 3 s hysterese.
  toets('95 s aan één stuk: niet vervuld en buiten de opstelling', v1.vervuld === false && v1.buiten === true && v1.waarde >= 95 && v1.waarde <= 99 && /aan één stuk — hoogstens 1:00/.test(v1.detail), JSON.stringify(v1));
  const o1 = O.oordeel(k.opdracht);
  toets('het oordeel is "nog niet" met BUITEN DE OPSTELLING, geen bevinding', o1.staat === 'nog niet' && o1.buiten === true && /^BUITEN DE OPSTELLING/.test(o1.reden), JSON.stringify(o1.reden));

  // Een nieuwe poging: de te lange periode telt niet meer mee, de som wel.
  T.nieuwePoging(t);
  t = rij(s, t, [].concat(herhaal([0], 3), herhaal([0, true], 10), herhaal([0], 6)));
  const v2 = O.voorwaarden(k.opdracht)[0];
  toets('na een nieuwe poging: 10 s is te kort maar niet buiten', v2.vervuld === false && !v2.buiten && /nodig 0:20 tot 1:00/.test(v2.detail), JSON.stringify(v2));
  t = rij(s, t, [].concat(herhaal([0, true], 30), herhaal([0], 6)));
  const v3 = O.voorwaarden(k.opdracht)[0];
  toets('30 s aan één stuk: vervuld', v3.vervuld === true && v3.waarde >= 30 && v3.waarde <= 34, JSON.stringify(v3));
  toets('en het oordeel sluit', O.oordeel(k.opdracht).staat === 'gesloten', O.oordeel(k.opdracht).reden);
  toets('de som is niet nulgezet: 95 + 10 + 30 s contact uit', T.duurS('contact-uit') >= 135 && T.duurS('contact-uit') <= 146, String(T.duurS('contact-uit')));

  // Twee korte perioden zijn geen lange: 2× 40 s past onder maxS 60.
  const s2 = laad();
  rij(s2, 1e6, [].concat(herhaal([0, true], 40), herhaal([0], 6), herhaal([0, true], 40), herhaal([0], 6)));
  toets('twee keer 40 s is geen periode van 80 s', (function (p) { return p.length === 2 && p.every(function (x) { return x >= 40 && x < 50; }); })(s2.PLToeschouwer.periodenS('contact-uit')), JSON.stringify(s2.PLToeschouwer.periodenS('contact-uit')));
  const s3 = laad();
  rij(s3, 1e6, [].concat(herhaal([0, false, 5], 20), herhaal([0, false, 0], 6), herhaal([0, false, 5], 8)));
  toets('de helling heeft eigen perioden, de lopende erbij', (function (p) { return p.length === 2 && p[0] >= 17 && p[0] <= 23 && p[1] >= 3 && p[1] <= 8; })(s3.PLToeschouwer.periodenS('helling')), JSON.stringify(s3.PLToeschouwer.periodenS('helling')));
}

console.log('\n8. het bewijs voor de second opinion (#599)');
{
  const s = laad();
  const O = s.PLOpdracht;
  const k = O.keur({ schema: 2, naam: 'Contact uit', sensoren: ['010D'], duurS: 600,
    voorwaarden: [{ wat: 'Contact 20 s tot 1,5 min uit', toestand: 'contact-uit', minS: 20, maxS: 90 }],
    proeven: [{ issue: '#487', naam: 'aantal keer uit', app: 'toestand-contact-uit-n', tussen: [0, 99] }] });
  rij(s, 1e6, [].concat(herhaal([40], 10), herhaal([0, true], 95), herhaal([0], 6)));
  const v = O.oordeel(k.opdracht);
  const b = O.bewijs(k.opdracht, v);
  toets('het bewijs draagt de voorwaarde met waarde en BUITEN', b.voorwaarden.length === 1 && b.voorwaarden[0].buiten === true && b.voorwaarden[0].waarde >= 95, JSON.stringify(b.voorwaarden));
  toets('de uitslag met de naam van de proef', b.uitslagen[0].naam === 'aantal keer uit' && !!b.uitslagen[0].detail, JSON.stringify(b.uitslagen));
  const p = b.toeschouwer && b.toeschouwer.perioden.filter(function (x) { return x.toestand === 'contact-uit'; })[0];
  toets('de perioden van de toeschouwer, in seconden', !!p && p.s >= 95 && p.s <= 99, JSON.stringify(b.toeschouwer));
  toets('en de gebeurtenissen', b.toeschouwer.gebeurtenissen.some(function (e) { return e.soort === 'contact-uit'; }));
  for (let i = 0; i < 400; i++) rij(s, 2e6 + i * 20000, [].concat(herhaal([40], 5), herhaal([0], 5)));
  const groot = O.bewijs(k.opdracht, O.oordeel(k.opdracht));
  toets('een lange rit blijft onder de grens van de worker', JSON.stringify(groot).length <= 15000 && groot.voorwaarden.length === 1, String(JSON.stringify(groot).length));
  let gestuurd = 0;
  s.PROXY_URL = 'https://x'; s.plFetch = function () { gestuurd++; return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ ok: true, id: '1' }); } }); };
  O.stuurUitkomst('41', 'rit', { staat: 'nog niet', reden: 'x' }, 'groen', b);
  toets('"nog niet" gaat niet naar de second opinion', gestuurd === 0);
  O.stuurUitkomst('41', 'rit', { staat: 'bevinding', reden: 'x' }, 'groen', b);
  toets('een bevinding wel', gestuurd === 1);
}

console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
