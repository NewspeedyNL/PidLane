// ══════════════════════════════════════════════════════════════════
// bproef-sppproef.js — hangen de SPP-knoppen in de ECHTE app? (#352)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-sppproef.js toetst de proef zelf, met een nagemaakt menu. Wat het niet
// toetst is of de acht knoppen werkelijk in het Admin-menu van de app komen
// (#admGroup bestaat pas na de echte boot), en of een tik erop in de browser
// — waar geen SPP-plugin is — netjes zegt dat er niets te meten valt in
// plaats van een fout in de console te gooien.
//
// En de markering: na een nabootsing zonder patch moet de regel "Bus
// aangetast" in het ECHTE logboek staan, want dat is het logboek dat na de
// rit gedeeld wordt.
//
// Draaien vanuit public/:  node bproef-sppproef.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

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
    console.log('\n1. De knoppen hangen in het echte Admin-menu');
    const k = JSON.parse(await app.ev(`(function(){
      var groep = document.getElementById('admGroup'), regel = document.getElementById('plSppMenu');
      var inGroep = !!(regel && groep && groep.contains(regel));
      if (regel) regel.click();
      var kaart = document.getElementById('plSppProef');
      var ids = ['plSppDraden','plSppRespons','plSppNabootsen','plSppVolle','plSppDode','plSppPatch','plSppSchakel','plSppBeeindig'];
      return JSON.stringify({
        module: !!window.PLSppProef,
        regel: inGroep, regels: groep ? groep.querySelectorAll('[id^="plSpp"]').length : -1,
        inMenu: ids.filter(function (id) { var el = document.getElementById(id); return el && kaart && kaart.contains(el); }).length,
        klasse: !!(regel && /kebab-item/.test(regel.className)),
        uniek: ids.every(function (id) { return document.querySelectorAll('#' + id).length === 1; })
      });
    })()`));
    toets('PLSppProef bestaat na een echte boot', k.module, JSON.stringify(k));
    toets('één regel "SPP-controle" in #admGroup, niet acht (02-10-2026)', k.regel && k.regels === 1, JSON.stringify(k));
    toets('die opent een kaart met alle acht knoppen', k.inMenu === 8, JSON.stringify(k));
    toets('met de opmaak van de andere menuknoppen', k.klasse, JSON.stringify(k));
    toets('en elk één keer', k.uniek, JSON.stringify(k));

    console.log('\n2. In de browser is er geen plugin, en dat zegt hij');
    await app.ev(`window.__fouten = []; window.addEventListener('error', function (e) { window.__fouten.push(String(e.message)); });
      document.getElementById('plSppPatch').click(); 1`);
    // Wachten tot het venster zijn uitkomst toont (of acht seconden).
    await app.ev(`new Promise(function (klaar) { var n = 0; var i = setInterval(function () {
      var v = document.getElementById('plSppProef');
      if ((v && !/bezig/.test(v.textContent)) || ++n > 80) { clearInterval(i); klaar(1); } }, 100); })`);
    const p = JSON.parse(await app.ev(`JSON.stringify({ tekst: (document.getElementById('plSppProef') || {}).textContent || '', fouten: window.__fouten })`));
    toets('de patchstatus zegt dat er geen SPP-plugin is', /geen patch/.test(p.tekst) && /PLDraden: niet in deze APK/.test(p.tekst), p.tekst.slice(0, 200));
    toets('zonder fouten in de console', p.fouten.length === 0, JSON.stringify(p.fouten));

    console.log('\n3. Een nabootsing zonder patch markeert de bus, in het echte logboek');
    const m = JSON.parse(await app.ev(`(async function(){
      try { sessionStorage.removeItem('pl_spp_aangetast'); } catch (e) {}
      var nep = { connect: function () { return Promise.reject(new Error('read failed, socket might closed')); },
                  disconnect: function () { return Promise.resolve(); } };
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.Plugins = Object.assign({}, window.Capacitor.Plugins || {}, { BluetoothSerial: nep });
      var voor = PLSppProef.aangetast();
      var p = await PLSppProef.nabootsen();
      var log = (typeof plLokaalLog === 'function' ? plLokaalLog() : []).map(function (r) { return r && r.msg || ''; });
      return JSON.stringify({ voor: voor, gelukt: p.gelukt, na: PLSppProef.aangetast(),
        inLog: log.some(function (m) { return /Bus aangetast door de SPP-proef/.test(m); }) });
    })()`));
    toets('vóór de proef niet aangetast', m.voor === null, JSON.stringify(m));
    toets('de nep-connect mislukt zoals bedoeld', m.gelukt === false, JSON.stringify(m));
    toets('daarna aangetast', !!(m.na && /zonder patch/.test(m.na.reden)), JSON.stringify(m));
    toets('en dat staat in het logboek dat je deelt', m.inLog, JSON.stringify(m));

    console.log('\nbproef-sppproef: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
