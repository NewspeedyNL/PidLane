// ══════════════════════════════════════════════════════════════════
// test-demo-toegang.js — kan een reviewer zonder account bij de demo?
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Play Store-blokkade 3 gaat over "minimum functionality": een reviewer heeft
// geen auto, geen OBD2-adapter en geen account. Ziet hij alleen een
// loginformulier, dan leest dat als een app die niet te beoordelen valt, en dat
// is een afwijzing waar je weken op wacht.
//
// De reviewnotitie in ANDROID-PLAYSTORE.md belooft letterlijk:
//
//     Op het startscherm staat de knop "Try demo — no adapter needed"
//
// Tot 21-08 stond die knop in het VERBINDSCHERM, dus achter de inlogmuur. De
// notitie en de app vertelden dus twee verschillende verhalen, en juist dat is
// wat een reviewer opmerkt.
//
// Deze test bewaakt drie dingen die samen moeten blijven kloppen: de knop staat
// in het loginscherm, hij roept een functie aan die bestaat, en de tekst is
// woordelijk gelijk aan wat de reviewnotitie belooft.
//
// Draaien vanuit public/:  node test-demo-toegang.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const index = fs.readFileSync('index.html', 'utf8');
const demo = fs.readFileSync('pidlane-demo.js', 'utf8');
const doc = fs.readFileSync('../ANDROID-PLAYSTORE.md', 'utf8');
let fout = 0;

function toets(naam, ok, detail) {
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

console.log('Demo-toegang zonder account\n');

// ── de knop staat vóór de inlogmuur ──
// Het loginscherm is #loginOv. De knop moet daarbinnen staan, niet in het
// verbindscherm dat pas na doLogin() verschijnt.
const a = index.indexOf('id="loginOv"');
const b = index.indexOf('id="connOv"');
const iDemo = index.indexOf('id="btnDemoLogin"');
toets('demoknop bestaat in index.html', iDemo > -1);
toets('demoknop staat binnen het loginscherm', iDemo > a && (b < 0 || iDemo < b),
  'staat hij ná #connOv, dan zit hij weer achter de login');

// ── hij roept iets aan dat bestaat ──
toets('roept plDemoZonderLogin() aan', /onclick="plDemoZonderLogin\(\)"/.test(index));
toets('die functie bestaat en is globaal',
  /function plDemoZonderLogin\s*\(/.test(demo) && /window\.plDemoZonderLogin\s*=/.test(demo));

// ── en zet geen sessie ──
// De demo mag geen inlog nabootsen: geen token, geen rol. AI loopt via de
// worker en die vraagt een geldig sessietoken, dus die blijft dicht.
const fn = demo.slice(demo.indexOf('function plDemoZonderLogin'));
const body = fn.slice(0, fn.indexOf('\nwindow.plDemoZonderLogin'));
toets('zet geen sessietoken', !/APP_TOKEN|tokSave|finishLogin/.test(body),
  'de demo mag geen login nabootsen — dat opent de AI-route');

// ── de tekst is gelijk aan wat de reviewnotitie belooft ──
const belofte = 'Try demo — no adapter needed';
toets('knoptekst staat zo in index.html', index.indexOf(belofte) > -1);
toets('reviewnotitie belooft exact diezelfde tekst', doc.indexOf(belofte) > -1,
  'loopt de tekst uiteen, dan zoekt de reviewer naar een knop die er niet staat');

// ── de beheerdersschakelaar pakt allebei de knoppen ──
// feat_demo komt uit de AppConfig-tabel en verbergt de demo met CSS. Er zijn
// TWEE demoknoppen: #btnDemo in het verbindscherm en #btnDemoLogin op het
// loginscherm. Dekt de schakelaar er maar één, dan zet "demo uit" de ene weg
// en laat de andere staan als dode knop — die toont dan alleen een toast
// "uitgeschakeld door beheerder". Voor een reviewer die de reviewnotitie
// volgt is dat erger dan geen knop: hij ziet wat hem beloofd is en het doet
// niets. Aan of uit mag de beheerder bepalen; half niet.
const fuel = fs.readFileSync('pidlane-fuel.js', 'utf8');
// Let op de vorm van het anker: de selectors zijn attribuutselectors, dus er
// staan blokhaken IN de lijst ('[id="btnDemo"]'). Een regex die tot de eerste
// ] leest, leest maar de helft en meldt een fout die er niet is. Vandaar de
// hele regel.
const mTog = fuel.match(/^\s*feat_demo:\s*(.+)$/m);
toets('feat_demo staat in de featureschakelaars', !!mTog,
  'hernoemd of verdwenen uit FEATURE_TOGGLES?');
if (mTog) {
  toets('feat_demo dekt de knop in het verbindscherm', mTog[1].indexOf('btnDemo"') > -1);
  toets('feat_demo dekt óók de knop op het loginscherm', mTog[1].indexOf('btnDemoLogin') > -1,
    'anders blijft de knop van de reviewnotitie staan terwijl hij niets meer doet');
}

// En de weigering zelf moet er blijven: de knop mag nooit een demo starten
// die de beheerder heeft uitgezet, ook niet als de CSS-regel ooit sneuvelt.
toets('plDemoZonderLogin weigert als feat_demo uit staat', /featOn\(\s*'feat_demo'\s*\)/.test(body),
  'de CSS-regel is de eerste poort, deze controle is de tweede');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
