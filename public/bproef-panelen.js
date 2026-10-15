// ══════════════════════════════════════════════════════════════════
// bproef-panelen.js — liggen de panelen van mode 06 en UDS bovenop?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// Op een telefoon (15-10-2026) opende het mode 06-paneel onder de topbalk
// en de onderbalk (z-index 9000), en het stuurapparatenpaneel viel met
// Sluiten achter de systeembalk. Wat er bovenop ligt hangt af van de échte
// stylesheet en de échte vensters die al open staan; dat kan alleen een
// browser zeggen. elementFromPoint op de knop Sluiten is de vraag die de
// duim stelt: raak ik hem, of iets erboven?
//
// Draaien vanuit public/:  node bproef-panelen.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Ligt de knop [data-<sleutel>="sluit"] bovenop, en binnen het scherm?
const BOVENOP = (sleutel) => `(function(){
  var b = document.querySelector('[data-${sleutel}="sluit"]');
  if (!b) return JSON.stringify({ knop: false });
  var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  var raak = document.elementFromPoint(x, y);
  return JSON.stringify({ knop: true, bovenop: raak === b || b.contains(raak), binnen: r.bottom <= window.innerHeight && r.top >= 0,
    raak: raak ? (raak.id || raak.className || raak.tagName) : null, tekst: (b.closest('[id$="Doos"]') || {}).textContent || '' });
})()`;
const WACHT = (id, re) => `new Promise(function (klaar) { var n = 0; var i = setInterval(function () {
  var v = document.getElementById('${id}');
  if ((v && ${re}.test(v.textContent)) || ++n > 80) { clearInterval(i); klaar(1); } }, 100); })`;

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n1. Mode 06 vanuit het Admin-menu, met Live open');
    await app.ev(`window.__fouten = []; window.addEventListener('error', function (e) { window.__fouten.push(String(e.message)); }); 1`);
    const k = JSON.parse(await app.ev(`JSON.stringify({ knop: !!document.getElementById('kbMode06'), m06: !!(window.PLM06 && PLM06.open) })`));
    toets('de knop Mode 06 staat in de app', k.knop && k.m06, JSON.stringify(k));
    await app.ev(`document.getElementById('kbMode06').click(); 1`);
    await app.ev(WACHT('plM06Paneel', '/Niet gelezen|monitortest/'));
    let m = JSON.parse(await app.ev(BOVENOP('m06')));
    toets('Sluiten ligt bovenop, niet onder de topbalk of de onderbalk', m.knop && m.bovenop, JSON.stringify(m).slice(0, 200));
    toets('en binnen het scherm', m.binnen, JSON.stringify(m).slice(0, 200));
    toets('zonder verbinding zegt het dat', /Niet gelezen: .*verbinding/.test(m.tekst), m.tekst.slice(0, 200));
    await app.ev(`document.querySelector('[data-m06="sluit"]').click(); 1`);
    toets('Sluiten sluit', await app.ev(`!document.getElementById('plM06Paneel')`) === true);

    console.log('\n2. Alle stuurapparaten, boven Check mijn auto');
    await app.ev(`PLFoutcodes.open(); PLUds.open(); 1`);
    await app.ev(WACHT('plUdsPaneel', '/Niet gelezen|Geen /'));
    m = JSON.parse(await app.ev(BOVENOP('uds')));
    toets('Sluiten ligt boven het venster Check mijn auto', m.knop && m.bovenop, JSON.stringify(m).slice(0, 200));
    toets('en binnen het scherm', m.binnen, JSON.stringify(m).slice(0, 200));
    await app.ev(`document.querySelector('[data-uds="sluit"]').click(); 1`);
    toets('Sluiten sluit, Check mijn auto blijft', await app.ev(`!document.getElementById('plUdsPaneel') && !!document.getElementById('plFcOv')`) === true);

    const f = JSON.parse(await app.ev(`JSON.stringify(window.__fouten)`));
    toets('zonder fouten in de console', f.length === 0, JSON.stringify(f));
    console.log('\nbproef-panelen: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT proef brak af: ' + (e.stack || e)); process.exit(1); });
