// ══════════════════════════════════════════════════════════════════
// bproef-inlogscherm.js — het inlogscherm is leeg tot je Geavanceerd opent (10-10-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Het inlogscherm toonde onder de knoppen nog een account-link, versie,
// buildregel, website, handleiding en "Nieuwste versie laden". Nu staat dat
// achter Geavanceerd, naast "Wachtwoord vergeten?". De demoknop blijft wél
// staan: de Play-reviewnotitie belooft hem direct onder Inloggen.
//
// Gemeten in de browser, niet in de bron: of iets zichtbaar is beslist de CSS,
// en die draait alleen in een echte pagina.
//
// TEGENPROEF: plmutate.sh haalt de verbergregel uit pidlane.css; dan staat de
// voet er meteen en wordt deel 1 rood.
//
// Draaien vanuit public/:  node bproef-inlogscherm.js
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
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  // Zichtbaar = er is een vak met hoogte, en geen voorouder op display:none.
  const zie = (sel) => app.ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length>0; })()`);
  try {
    await app.venster(412, 915);
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    await app.ev(`document.getElementById('loginOv').classList.add('open'); document.getElementById('loginOv').style.display=''; true`);

    console.log('\n1. Dicht: alleen wat je nodig hebt om binnen te komen');
    toets('Inloggen staat er', await zie('#loginOv .mbtn.p'));
    toets('Wachtwoord vergeten staat er', await zie('#loginOv .lg-vergeten'));
    toets('Geavanceerd staat ernaast', await zie('#lgMeer'));
    toets('Try demo blijft zichtbaar (Play-reviewnotitie)', await zie('#btnDemoLogin'));
    toets('Nog geen account is weg', !(await zie('#loginOv .lg-nieuw')));
    toets('versie, website en Nieuwste versie laden zijn weg', !(await zie('#loginOv .lg-foot')) && !(await zie('#plFrisBtn')));
    toets('Geavanceerd zegt dat hij dicht is', await app.ev(`document.getElementById('lgMeer').getAttribute('aria-expanded') === 'false'`));

    console.log('\n2. Open');
    await app.ev(`document.getElementById('lgMeer').click(); true`);
    toets('Nog geen account verschijnt', await zie('#loginOv .lg-nieuw'));
    toets('versie en Nieuwste versie laden verschijnen', await zie('#loginVer') && await zie('#plFrisBtn'));
    toets('Geavanceerd zegt dat hij open is', await app.ev(`document.getElementById('lgMeer').getAttribute('aria-expanded') === 'true'`));

    console.log('\n3. Weer dicht');
    await app.ev(`document.getElementById('lgMeer').click(); true`);
    toets('alles weer weg', !(await zie('#loginOv .lg-nieuw')) && !(await zie('#plFrisBtn')));
    toets('het verbindscherm heeft zijn eigen voet nog (geen lg-geav daar)', await app.ev(`!document.querySelector('#connOv .lg-geav')`));
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-inlogscherm: ' + fouten + ' FOUT' : 'bproef-inlogscherm: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e && e.stack || e)); process.exit(1); });
