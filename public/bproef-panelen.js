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
    console.log('\n1. Mode 06-paneel, met Live open');
    await app.ev(`window.__fouten = []; window.addEventListener('error', function (e) { window.__fouten.push(String(e.message)); }); 1`);
    // De Admin-knop is sinds 15-10-2026 weg (op verzoek); het paneel blijft.
    const k = JSON.parse(await app.ev(`JSON.stringify({ m06: !!(window.PLM06 && PLM06.open) })`));
    toets('PLM06.open bestaat', k.m06, JSON.stringify(k));
    await app.ev(`PLM06.open(); 1`);
    await app.ev(WACHT('plM06Paneel', '/Niet gelezen|monitortest/'));
    let m = JSON.parse(await app.ev(BOVENOP('m06')));
    toets('Sluiten ligt bovenop, niet onder de topbalk of de onderbalk', m.knop && m.bovenop, JSON.stringify(m).slice(0, 200));
    toets('en binnen het scherm', m.binnen, JSON.stringify(m).slice(0, 200));
    toets('zonder verbinding zegt het dat', /Niet gelezen: .*verbinding/.test(m.tekst), m.tekst.slice(0, 200));
    await app.ev(`document.querySelector('[data-m06="sluit"]').click(); 1`);
    toets('Sluiten sluit', await app.ev(`!document.getElementById('plM06Paneel')`) === true);

    console.log('\n1b. De tabel past op een smalle telefoon (360 px), ook de onderkant');
    await app.venster(360, 740);
    // De MIDs en waarden van de Mazda CX-5 (15-10-2026): onbekende UAS,
    // signed grenzen die als 32768 – 1500 in beeld kwamen, en missers.
    const t = JSON.parse(await app.ev(`(function(){
      var R = PLM06._intern.bouwRecord, tests = [];
      [0x80, 0x81, 0x82, 0x83].forEach(function (tid) { tests.push(R(0x35, tid, 0xB0, 14, 0x8000, 0x05DC)); });
      for (var c = 0; c < 4; c++) { tests.push(R(0xA2 + c, 0x0B, 0x24, 0, 0, 0xFFFF)); tests.push(R(0xA2 + c, 0x0C, 0x24, 0, 0, 0xFFFF)); }
      tests.push(R(0x01, 0x80, 0x01, 0, 0, 256));
      PLM06.toon({ mids: [], tests: tests });
      var doos = document.getElementById('plM06Doos'), cel = doos.querySelectorAll('.pl-m06-oordeel');
      var laatste = cel[cel.length - 1].getBoundingClientRect(), d = doos.getBoundingClientRect();
      var sluit = document.querySelector('[data-m06="sluit"]'); sluit.scrollIntoView({ block: 'end' });
      var s = sluit.getBoundingClientRect();
      return JSON.stringify({ rijen: cel.length, breed: doos.scrollWidth - doos.clientWidth, tabelBreed: doos.querySelector('table').scrollWidth - doos.querySelector('table').clientWidth,
        oordeelRechts: Math.round(laatste.right), scherm: window.innerWidth, doosOnder: Math.round(d.bottom), sluitOnder: Math.round(s.bottom), hoogte: window.innerHeight });
    })()`));
    toets('de tabel heeft alle rijen', t.rijen === 13, JSON.stringify(t));
    toets('niets steekt rechts uit: de kolom Oordeel staat in beeld', t.breed <= 0 && t.tabelBreed <= 0 && t.oordeelRechts <= t.scherm, JSON.stringify(t));
    toets('de onderkant past: venster en Sluiten binnen het scherm', t.doosOnder <= t.hoogte && t.sluitOnder <= t.hoogte, JSON.stringify(t));
    await app.ev(`PLM06.sluit(); 1`);
    await app.venster(412, 915);

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
