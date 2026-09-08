// ══════════════════════════════════════════════════════════════════
// test-remote-tabel.js — de opnametabel van de expert bouwt geen HTML uit peer-data
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// `_recRowsHtml()` zet de samenvatting van een opname in elkaar en die gaat er
// via `innerHTML` in. De rijen komen niet uit de app maar van de andere kant
// van de remote-sessie: de local stuurt ze op als JSON. Wat daar binnenkomt is
// dus precies zo betrouwbaar als de peer.
//
// Op de tekstvelden stond `esc()` al — `r.name` en `r.unit` waren afgedekt.
// De cijferkolommen niet: `r.n`, `r.mn`, `r.mx` en `r.av` gingen ruw de HTML
// in, met alleen een null-controle ervoor. Een peer die in plaats van een
// meetwaarde een stukje markup stuurt, schreef dat zo in het venster van de
// expert (#142).
//
// DE TOETS MOET ONDERSCHEIDEN, en dat is hier de valkuil. "Er staat geen
// `<` meer in de uitvoer" haal je ook met een fix die de hele kolom leeggooit,
// en dan is de tabel stuk zonder dat iemand het merkt. Daarom staat naast elke
// kwaadaardige invoer een gewone: 13.85 moet er nog steeds als 13.85 staan, en
// een `null` nog steeds als een streepje. Allebei de kanten, of het telt niet.
//
// Draaien vanuit public/:  node test-remote-tabel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de echte functie uit pidlane-remote.js knippen ────────────────
// Twee stukken: de twee wachters bovenaan de module (esc en getal) en de
// tabelbouwer zelf. Ankers en geen kopie — verdwijnt er een, dan stopt deze
// test in plaats van groen te blijven staan op code die niet meer draait.
const bron = fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8');

// `tot` valt er NET buiten. Dat is met opzet: het eindanker mag niet in de
// code zitten die gemuteerd wordt, anders faalt de test bij een mutatie op
// "anker weg" in plaats van op de fout zelf — en dan bewijst hij niets.
function knip(vanAnker, totAnker, wat) {
  const a = bron.indexOf(vanAnker);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + vanAnker); process.exit(1); }
  const b = bron.indexOf(totAnker, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + totAnker); process.exit(1); }
  return bron.slice(a, b);
}

const wachters = knip('const esc=s=>String(s)', 'function hb(){', 'esc/getal');
const tabel = knip('function _recRowsHtml(rows,dur,n){', 'function _csvDone(){', '_recRowsHtml');
const _recRowsHtml = new Function(wachters + '\n' + tabel + '\nreturn _recRowsHtml;')();

// Wat een kwaadwillende peer in een cijferveld zou zetten.
const NASTY = '<img src=x onerror=alert(1)>';
const rij = (extra) => Object.assign({ name: 'Koelwater', unit: '°C', n: 12, mn: 80, mx: 96, av: 88.5 }, extra);

console.log('\n1. Markup in een cijferkolom bereikt de HTML niet');
for (const veld of ['n', 'mn', 'mx', 'av']) {
  const h = _recRowsHtml([rij({ [veld]: NASTY })], 10, 12);
  toets('r.' + veld + ' met markup', h.indexOf('<img') < 0 && h.indexOf('onerror') < 0,
    h.slice(h.indexOf('<tr><td style="padding:3px">Koel')).slice(0, 160));
}
{
  // Ook de twee kopregel-argumenten. Die worden bij de enige aanroep met `|0`
  // afgedwongen, maar een functie hoort niet op zijn aanroeper te leunen: dat
  // is precies het soort aanname dat bij de volgende aanroep sneuvelt.
  const h = _recRowsHtml([rij()], NASTY, NASTY);
  toets('dur en n in de kopregel', h.indexOf('<img') < 0 && h.indexOf('onerror') < 0, h.slice(0, 160));
}

console.log('\n2. En de tekstkolommen blijven afgedekt');
{
  const h = _recRowsHtml([rij({ name: NASTY, unit: NASTY })], 10, 12);
  // Let op het verschil met deel 1: daar verdwijnt de invoer (een cijferveld
  // dat geen cijfer is wordt een streepje), hier blijft hij staan maar dan
  // ontmand. Het woord "onerror" hoort er dus nog te zijn — als tekst. Wat er
  // niet mag staan is een tag die de browser als tag leest.
  toets('r.name en r.unit met markup', h.indexOf('<img') < 0);
  toets('maar de tekst is wel te zien, geëscaped', h.indexOf('&lt;img') > 0, h.slice(0, 200));
  toets('de punthaken zijn allebei om', h.indexOf('&gt;') > 0);
}

console.log('\n3. Gewone meetwaarden veranderen niet');
{
  // Zonder dit deel haalt een fix die alles wegveegt de test ook.
  const h = _recRowsHtml([rij()], 10, 12);
  toets('het gemiddelde staat er als 88.5', h.indexOf('>88.5 ') > 0, h);
  toets('de min staat er als 80', h.indexOf('>80<') > 0);
  toets('de max staat er als 96', h.indexOf('>96<') > 0);
  toets('het aantal staat er als 12', h.indexOf('>12<') > 0);
  toets('de kopregel noemt 10s en 12 metingen', h.indexOf('10s · 12 metingen') > 0, h.slice(0, 120));
  toets('de sensornaam staat er gewoon', h.indexOf('>Koelwater<') > 0);
  toets('de eenheid staat er gewoon', h.indexOf('°C') > 0);
  toets('een negatieve waarde overleeft het', _recRowsHtml([rij({ mn: -40 })], 1, 1).indexOf('>-40<') > 0);
  toets('een waarde van nul ook', _recRowsHtml([rij({ mn: 0 })], 1, 1).indexOf('>0<') > 0);
}

console.log('\n4. Ontbrekende waarden blijven een streepje');
{
  const h = _recRowsHtml([rij({ mn: null, mx: null, av: null })], 10, 12);
  const streepjes = (h.match(/—/g) || []).length;
  toets('drie lege kolommen geven drie streepjes', streepjes === 3, streepjes + ' gevonden');
  toets('en niet het woord "null"', h.indexOf('null') < 0, h);
}

console.log('\n5. Onzin die op een getal lijkt, glipt er niet doorheen');
{
  // Het discriminerende geval: begint met een cijfer, dus een controle die
  // alleen naar het eerste teken kijkt laat dit door.
  const h = _recRowsHtml([rij({ mn: '1<img src=x onerror=alert(1)>' })], 1, 1);
  toets('"1<img …>" wordt een streepje', h.indexOf('<img') < 0 && h.indexOf('&lt;img') < 0,
    h.slice(h.indexOf('Koel')).slice(0, 160));
  // Een getal als tekst is wél gewoon een getal en hoort te blijven staan.
  toets('"73" als tekst blijft 73', _recRowsHtml([rij({ mn: '73' })], 1, 1).indexOf('>73<') > 0);
}

console.log('\n6. Een lege of ontbrekende rijenlijst valt niet om');
{
  toets('geen rijen', typeof _recRowsHtml([], 0, 0) === 'string');
  toets('undefined in plaats van een lijst', typeof _recRowsHtml(undefined, 0, 0) === 'string');
  {
    // Een rij zonder velden hoort niet om te vallen en alle vier de
    // cijferkolommen horen een streepje te geven.
    const h = _recRowsHtml([{}], 0, 0);
    toets('een rij zonder velden geeft vier streepjes', (h.match(/—/g) || []).length === 4,
      h.slice(h.indexOf('<tr><td style="padding:3px">')));
    // BUITEN #142, met opzet niet meegenomen: `esc(r.name)` maakt van een
    // ontbrekende naam nog steeds het woord "undefined" in de naamkolom. Dat
    // is een weergavenetheid in de tekstkolom, geen injectiepad, en het hoort
    // dus niet in dezelfde wijziging. Hier vastgelegd zodat het niet zoekraakt.
    toets('de naamkolom blijft voorlopig "undefined" tonen (bekend, buiten scope)',
      h.indexOf('undefined') > 0);
  }
}

console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
process.exit(fouten ? 1 : 0);
