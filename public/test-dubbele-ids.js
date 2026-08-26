// ══════════════════════════════════════════════════════════════════
// test-dubbele-ids.js — geen twee plekken die hetzelfde element-id maken
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// `document.getElementById()` geeft er ééntje terug: de eerste in het document.
// Bestaat een id op twee plekken, dan werkt de code op het verkeerde element en
// faalt dat stil — het element bestaat immers, er is geen fout om te vangen.
//
// Dit project is er drie keer op gestruikeld:
//
//   #btnConnect / #btnDemo  staan zowel in index.html als in de template van
//                           resetToStep1(). getElementById pakte de hub-versie
//                           en liet de wizardknoppen dood. Opgelost met een
//                           scoped querySelector, niet door de dubbele id weg
//                           te halen — vandaar dat ze hieronder als BEKEND
//                           staan.
//   kentInput               pidlane-motortype.js documenteert het letterlijk:
//                           "stap 4 vroeg het kenteken in een tweede
//                           invoerveld, naast kentInput".
//   #waakBtn                dezelfde vorm, maar met een klasse in plaats van
//                           een id (zie 'Eén patroon dat drie keer terugkwam').
//
// De kentekenstap van 26-08 zette precies dezelfde val opnieuw klaar: een
// tweede kentekenveld in de verbindwizard, naast dat op de voertuigkaart. Het
// heet daarom kentWizInput, en rdwLookup() krijgt de waarde meegegeven in
// plaats van 'm uit de DOM te vissen.
//
// Deze test is een RATEL: de twee bekende gevallen zijn vastgelegd met hun
// reden, en elk NIEUW dubbel id laat 'm falen. Los een bekend geval op, dan
// haal je 'm hier weg en kan hij niet terugkomen.
//
// Het scant index.html én elke pidlane-*.js, want de helft van de UI wordt in
// template literals opgebouwd — daar staan de id's die je in de HTML niet ziet.
//
// Draaien vanuit public/:  node test-dubbele-ids.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');

// Bekende, bewust geaccepteerde dubbele id's — met de reden erbij, net als
// GEEN_GLOBALE in pidlane-bedrading.js. Zonder reden hoort hij hier niet.
const BEKEND = {
  btnConnect: 'staat op de hub (index.html) en in de wizardtemplate van resetToStep1(); ' +
              'die laatste bedraadt scoped via connActions.querySelector, niet via getElementById',
  btnDemo:    'zelfde geval als btnConnect, zelfde scoped bedrading'
};

// id="..." in HTML, en id="..." / id=\"...\" in template literals in JS.
const ID_PATROON = /\sid=\\?["'`]([A-Za-z][A-Za-z0-9_-]*)\\?["'`]/g;

function scanBestand(pad, uit) {
  const tekst = fs.readFileSync(pad, 'utf8');
  let m;
  ID_PATROON.lastIndex = 0;
  while ((m = ID_PATROON.exec(tekst)) !== null) {
    if (!uit[m[1]]) uit[m[1]] = new Set();
    uit[m[1]].add(pad);
  }
  return uit;
}

function verzamelIds() {
  const uit = {};
  scanBestand('index.html', uit);
  fs.readdirSync('.').filter(function (f) { return /^pidlane-.*\.js$/.test(f); })
    .sort()
    .forEach(function (f) { scanBestand(f, uit); });
  return uit;
}

// ── de controles ─────────────────────────────────────────────────

// Een id dat in meer dan één bestand wordt gemaakt, is een dubbel id — tenzij
// het als bekend geval met reden is vastgelegd.
function keurGeenNieuweDubbele(ids, bekend) {
  return Object.keys(ids).sort()
    .filter(function (id) { return ids[id].size > 1 && !bekend[id]; })
    .map(function (id) {
      return id + ' staat in ' + ids[id].size + ' bestanden: ' + Array.from(ids[id]).join(', ') +
             '  — getElementById pakt er één en de andere faalt stil';
    });
}

// Een bekend geval dat opgelost is, hoort uit de lijst. Anders groeit die
// alleen maar en bewaakt hij op den duur niets meer.
function keurBekendNogSteedsDubbel(ids, bekend) {
  return Object.keys(bekend).sort()
    .filter(function (id) { return !ids[id] || ids[id].size <= 1; })
    .map(function (id) {
      return id + ' staat als bekend dubbel id in de lijst, maar is dat niet meer — haal hem uit BEKEND';
    });
}

// Elke reden moet iets zeggen. Een lege reden is een dubbel id zonder besluit.
function keurRedenGevuld(bekend) {
  return Object.keys(bekend).sort()
    .filter(function (id) { return String(bekend[id] || '').trim().length < 20; })
    .map(function (id) { return id + ' heeft geen (bruikbare) reden in BEKEND'; });
}

// De kentekenvelden specifiek: het veld in de wizard en dat op de voertuigkaart
// moeten verschillende id's houden. Dit is de val van 26-08, apart vastgelegd
// zodat de melding uitlegt wat er misgaat in plaats van alleen "dubbel id".
function keurKentekenVeldenGescheiden(ids) {
  const uit = [];
  const wiz = ids['kentWizInput'];
  const kaart = ids['kentInput'];
  if (!wiz) uit.push('kentWizInput bestaat niet meer — is de kentekenstap in de wizard weggehaald of hernoemd?');
  if (!kaart) uit.push('kentInput bestaat niet meer — is het kentekenveld op de voertuigkaart weggehaald of hernoemd?');
  if (wiz && wiz.size > 1) uit.push('kentWizInput wordt op meer dan één plek gemaakt: ' + Array.from(wiz).join(', '));
  if (kaart && kaart.size > 1) uit.push('kentInput wordt op meer dan één plek gemaakt: ' + Array.from(kaart).join(', '));
  return uit;
}

// ── toetshulpjes ─────────────────────────────────────────────────
let fout = 0;

function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}

function toetsMeldt(naam, gemeten, moetNoemen) {
  const raak = gemeten.some(function (r) { return r.indexOf(moetNoemen) > -1; });
  if (raak) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  console.log('        de controle bleef stil terwijl hij ' + moetNoemen + ' had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Element-ids — geen twee plekken die hetzelfde id maken\n');

const IDS = verzamelIds();

// De scanner zelf vastpinnen. Vindt hij niets, dan slaagt alles hieronder
// omdat er niets te vinden valt.
toetsSchoon('de scanner vindt de id\'s',
  Object.keys(IDS).length > 300 ? [] :
    ['maar ' + Object.keys(IDS).length + ' id\'s gevonden — klopt het patroon nog?']);

toetsSchoon('geen NIEUWE dubbele id\'s', keurGeenNieuweDubbele(IDS, BEKEND));
toetsSchoon('elk bekend geval is nog steeds dubbel', keurBekendNogSteedsDubbel(IDS, BEKEND));
toetsSchoon('elk bekend geval heeft een reden', keurRedenGevuld(BEKEND));
toetsSchoon('de twee kentekenvelden hebben verschillende id\'s (de val van 26-08)',
  keurKentekenVeldenGescheiden(IDS));

// ── tegenproef ───────────────────────────────────────────────────
// Een nagebootst tweede kentekenveld, precies de fout uit pidlane-motortype.js.
function metExtra(ids, id, bestand) {
  const kopie = {};
  Object.keys(ids).forEach(function (k) { kopie[k] = new Set(ids[k]); });
  if (!kopie[id]) kopie[id] = new Set();
  kopie[id].add(bestand);
  return kopie;
}

toetsMeldt('een tweede kentekenveld wordt gezien (de fout uit pidlane-motortype.js)',
  keurGeenNieuweDubbele(metExtra(IDS, 'kentInput', 'pidlane-verzonnen.js'), BEKEND), 'kentInput');

toetsMeldt('de kentekencontrole noemt het apart, met uitleg',
  keurKentekenVeldenGescheiden(metExtra(IDS, 'kentInput', 'pidlane-verzonnen.js')), 'kentInput wordt op meer dan één plek gemaakt');

toetsMeldt('een willekeurig nieuw dubbel id wordt gezien',
  keurGeenNieuweDubbele(metExtra(IDS, 'step2Title', 'pidlane-verzonnen.js'), BEKEND), 'step2Title');

toetsMeldt('een bekend geval dat is opgelost wordt gemeld',
  keurBekendNogSteedsDubbel({ btnDemo: IDS.btnDemo }, BEKEND), 'btnConnect');

toetsMeldt('een bekend geval zonder reden wordt gemeld',
  keurRedenGevuld({ ietsNieuws: '' }), 'ietsNieuws');

// En het geval dat NIET mag afgaan: de bekende twee zoals ze nu zijn.
toetsSchoon('de twee bekende gevallen zelf geven geen vals alarm',
  keurGeenNieuweDubbele(IDS, BEKEND));

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
