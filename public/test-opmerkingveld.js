// ══════════════════════════════════════════════════════════════════
// test-opmerkingveld.js — komt de opmerking in het opgeslagen bestand?
// ──────────────────────────────────────────────────────────────────
// plOpslaan() zet een opmerkingveld boven de twee opslagknoppen. De melding
// van 23-08 (issue #23) was dat de ingetypte tekst niet in het bestand
// terechtkwam. Dat is met het blote oog niet te zien: je moet het bestand
// openen om te weten of het misging, en dan is de rit al voorbij.
//
// Daarom hier het gedrag, niet de broncode: draai plOpslaan(), tik iets in het
// veld, druk op een knop, en kijk wat er de Blob in gaat. Beide routes komen
// langs — tekst en PDF — want ze bouwen de inhoud ieder op hun eigen manier op.
//
// Draaien vanuit public/:  node test-opmerkingveld.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── nagemaakte omgeving ───────────────────────────────────────────
// Geen echte DOM: plOpslaan zoekt zijn vier knoppen via getElementById, dus
// dat is genoeg. De Blob onthoudt wat erin gestopt wordt — dát is het bestand.
const blobs = [];
const pdfAanroepen = [];

function bouwOmgeving() {
  blobs.length = 0;
  pdfAanroepen.length = 0;
  const veld = { value: '' };
  const knoppen = { plExpOpm: veld, plExpTxt: {}, plExpPdf: {}, plExpAf: {} };

  global.window = global.window || {};
  global.document = {
    createElement: function () {
      return { style: {}, setAttribute() {}, appendChild() {}, click() {},
               addEventListener() {}, remove() {}, set innerHTML(v) { this._h = v; },
               get innerHTML() { return this._h || ''; } };
    },
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById: function (id) { return knoppen[id] || null; }
  };
  global.Blob = function (delen) { blobs.push(String(delen[0])); this.delen = delen; };
  global.URL = { createObjectURL: () => '', revokeObjectURL() {} };
  return { veld, knoppen };
}

// ── module laden ──────────────────────────────────────────────────
// pidlane-export.js staat op 'use strict', dus houdt eval zijn functies bij
// zich. Ze zijn te bereiken via window, want dat is precies wat de module
// zelf onderaan doet — dezelfde weg als in de browser.
const bron = fs.readFileSync(path.join(__dirname, 'pidlane-export.js'), 'utf8');
bouwOmgeving();
eval(bron);
const plOpslaan = global.window.plOpslaan;

const TEKST = 'PIDLANE LOGBOEK\nregel 1\nregel 2';
const OPM = 'Stationair op de oprit, koelwater bleef hangen op 92.';

// ── 1. tekstbestand ───────────────────────────────────────────────
console.log('\n1. Tekst — opmerking hoort in het bestand');
(function () {
  const omg = bouwOmgeving();
  plOpslaan('PidLane-logboek', TEKST, { titel: 'Logboek' });
  omg.veld.value = OPM;
  omg.knoppen.plExpTxt.onclick();
  const bestand = blobs.join('\n');
  toets('de opmerking staat in het bestand', bestand.indexOf(OPM) >= 0,
        'opgeslagen inhoud: ' + JSON.stringify(bestand.slice(0, 120)));
  toets('de oorspronkelijke inhoud staat er nog', bestand.indexOf('regel 2') >= 0);
  toets('de opmerking staat vóór de inhoud',
        bestand.indexOf(OPM) < bestand.indexOf('PIDLANE LOGBOEK'));
})();

// ── 2. tegenproef ─────────────────────────────────────────────────
// Zonder deze stap weet je alleen dat de test groen kán staan. De fout uit
// issue #23 zou zijn dat het veld bij het ópenen wordt uitgelezen in plaats
// van bij de klik: alles wat je daarna intikt mist dan. Hier staat het veld
// bij het openen aantoonbaar leeg en komt de tekst er tóch in — die fout kan
// deze test dus niet over het hoofd zien.
console.log('\n2. Tegenproef — leest de test wel echt mee?');
(function () {
  const omg = bouwOmgeving();
  plOpslaan('PidLane-logboek', TEKST, { titel: 'Logboek' });
  const teVroeg = omg.veld.value;
  omg.veld.value = OPM;
  omg.knoppen.plExpTxt.onclick();
  const bestand = blobs.join('\n');
  toets('bij het openen was het veld leeg', teVroeg === '');
  toets('en de opmerking staat er tóch in — dus per klik uitgelezen',
        teVroeg === '' && bestand.indexOf(OPM) >= 0);
})();

// ── 3. leeg veld verandert niets ──────────────────────────────────
console.log('\n3. Leeg laten mag — dan blijft het bestand ongewijzigd');
(function () {
  const omg = bouwOmgeving();
  plOpslaan('PidLane-logboek', TEKST, { titel: 'Logboek' });
  omg.veld.value = '   ';                  // alleen spaties telt als leeg
  omg.knoppen.plExpTxt.onclick();
  const bestand = blobs.join('\n');
  toets('geen OPMERKING-kader in het bestand', bestand.indexOf('OPMERKING') < 0);
  toets('inhoud onaangeroerd', bestand.trim() === TEKST.trim(),
        JSON.stringify(bestand.slice(0, 80)));
})();

// ── 4. PDF ────────────────────────────────────────────────────────
// Niet plMaakPdf nabootsen maar jsPDF: dan loopt de hele route van klik tot
// tekenopdracht door de echte code. De optie doorgeven is niets waard als er
// verderop niets mee gebeurt, en dat verschil is hier zichtbaar.
console.log('\n4. PDF — de opmerking wordt in het document getekend');
(function () {
  const getekend = [];
  function NepDoc() {}
  NepDoc.prototype.setFillColor = function () {};
  NepDoc.prototype.rect = function () {};
  NepDoc.prototype.roundedRect = function () { getekend.push(['kader', '']); };
  NepDoc.prototype.setTextColor = function () {};
  NepDoc.prototype.setDrawColor = function () {};
  NepDoc.prototype.line = function () {};
  NepDoc.prototype.setFont = function () {};
  NepDoc.prototype.setFontSize = function () {};
  NepDoc.prototype.text = function (t) { getekend.push(['tekst', String(t)]); };
  NepDoc.prototype.addPage = function () {};
  NepDoc.prototype.setPage = function () {};
  NepDoc.prototype.getNumberOfPages = function () { return 1; };
  NepDoc.prototype.splitTextToSize = function (t) { return [String(t)]; };
  NepDoc.prototype.output = function () { return { nep: true }; };

  const omg = bouwOmgeving();
  global.window.jspdf = { jsPDF: function () { return new NepDoc(); } };
  global.localStorage = { getItem: () => null };

  plOpslaan('PidLane-logboek', TEKST, { titel: 'Logboek' });
  omg.veld.value = OPM;
  return omg.knoppen.plExpPdf.onclick.call({ disabled: false, innerHTML: '' })
    .then(function () {
      const teksten = getekend.filter(r => r[0] === 'tekst').map(r => r[1]);
      toets('kopje OPMERKING getekend', teksten.indexOf('OPMERKING') >= 0,
            'getekend: ' + JSON.stringify(teksten.slice(0, 10)));
      toets('de opmerking zelf getekend', teksten.some(t => t.indexOf(OPM) >= 0));
      toets('de inhoud staat er ook nog in', teksten.some(t => t.indexOf('regel 2') >= 0));
    });
})().then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + e.message);
  process.exit(1);
});
