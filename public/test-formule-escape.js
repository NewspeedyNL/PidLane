// ══════════════════════════════════════════════════════════════════
// test-formule-escape.js — een zoekterm mag geen patroon worden
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Tot 01-10-2026 ging deze test over formuleTekst(): op vier plekken zette
// worker.js een tekst als letterlijke waarde in een Airtable-formule, en tot
// #142 kon een zoekterm met een backslash en een quote die string sluiten en
// er formule-syntax achter zetten. Sinds alles in D1 staat (#327) bouwt de
// Worker geen formules meer: elke zoekterm gaat als gebonden parameter mee.
// De naam van dit bestand is gebleven; de vraag erachter ook.
//
// Want ook een gebonden parameter kan te veel vinden. Zoeken in beheer gaat
// met LIKE, en daar zijn % en _ jokers. Zonder ontsnapping vindt de zoekterm
// "%" élke klant, en "_" elk adres van minstens één teken. Dat is geen lek
// naar buiten (alleen beheer zoekt), maar het is een zoekvak dat iets anders
// teruggeeft dan wat je intikte — en bij "wis wat je vindt" is dat duur.
// d1Zoekterm() zet er een backslash voor, en de query zegt ESCAPE '\'.
//
// DE TOETS MOET ONDERSCHEIDEN. Kijken of er een backslash vóór elke % staat
// bewijst niets. Deze test vraagt het aan een echte SQLite, met dezelfde
// LIKE-vorm als adminD1Lees en /admin/klanten: welke rijen komen terug? En
// deel 3 voert de term zónder ontsnapping in, om te laten zien dat die vraag
// dan wél te veel teruggeeft.
//
// Draaien vanuit public/:  node test-formule-escape.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de echte functie uit worker.js knippen ────────────────────────
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('function d1Zoekterm(q) {');
const tot = bron.indexOf('__name(d1Zoekterm, "d1Zoekterm");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: d1Zoekterm() is niet gevonden in worker.js.');
  process.exit(1);
}
const d1Zoekterm = new Function(bron.slice(van, tot) + '\nreturn d1Zoekterm;')();

// Dezelfde LIKE-vorm als in worker.js, en die vorm ook daar nagekeken: staat
// hij er niet meer, dan toetst deze test iets wat de Worker niet doet.
const LIKE = "LOWER(COALESCE(Email,'')) LIKE ? ESCAPE '\\'";
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE k (Email TEXT)');
for (const e of ['anna@voorbeeld.nl', 'bert@voorbeeld.nl', '100%klant@voorbeeld.nl', 'a_b@voorbeeld.nl', 'c\\d@voorbeeld.nl'])
  db.prepare('INSERT INTO k (Email) VALUES (?)').run(e);
const vind = (term) => db.prepare(`SELECT Email FROM k WHERE ${LIKE} ORDER BY Email`).all(term).map((r) => r.Email);

console.log('\n1. Een joker in de zoekterm is een gewoon teken');
{
  toets('"%" vindt alleen het adres met een %', JSON.stringify(vind(d1Zoekterm('%'))) === '["100%klant@voorbeeld.nl"]',
    JSON.stringify(vind(d1Zoekterm('%'))));
  toets('"_" vindt alleen het adres met een _', JSON.stringify(vind(d1Zoekterm('_'))) === '["a_b@voorbeeld.nl"]',
    JSON.stringify(vind(d1Zoekterm('_'))));
  toets('"\\\\" vindt alleen het adres met een backslash', JSON.stringify(vind(d1Zoekterm('\\'))) === '["c\\\\d@voorbeeld.nl"]',
    JSON.stringify(vind(d1Zoekterm('\\'))));
  toets('"%%" vindt niets', vind(d1Zoekterm('%%')).length === 0, JSON.stringify(vind(d1Zoekterm('%%'))));
}

console.log('\n2. Een gewone zoekterm blijft bruikbaar');
{
  toets('"anna" vindt Anna', JSON.stringify(vind(d1Zoekterm('anna'))) === '["anna@voorbeeld.nl"]');
  toets('"voorbeeld" vindt ze alle vijf', vind(d1Zoekterm('voorbeeld')).length === 5);
  toets('een lege zoekterm vindt alles (zoals een leeg zoekvak)', vind(d1Zoekterm('')).length === 5);
}

console.log('\n3. TEGENPROEF — zonder ontsnapping vindt een joker te veel');
{
  const kaal = (q) => '%' + String(q) + '%';
  toets('"%" vindt dan alle vijf', vind(kaal('%')).length === 5, JSON.stringify(vind(kaal('%'))));
  toets('"_" vindt dan ook alle vijf', vind(kaal('_')).length === 5, JSON.stringify(vind(kaal('_'))));
}

console.log('\n4. De Worker zoekt overal zo, en bouwt geen Airtable-formule meer');
{
  // Alleen `LIKE ?`: daar komt een zoekterm binnen. Een vast patroon
  // ('sqlite_%') en commentaar tellen niet mee.
  const metEscape = (bron.match(/LIKE \? ESCAPE '\\\\'/g) || []).length;
  const metParam = (bron.match(/LIKE \?/g) || []).length;
  toets('elke LIKE met een zoekterm heeft ESCAPE erbij', metEscape >= 3 && metParam === metEscape,
    metEscape + ' met ESCAPE, ' + metParam + ' met een parameter');
  toets('geen filterByFormula meer in worker.js', bron.indexOf('filterByFormula') < 0);
  toets('geen formuleTekst meer', bron.indexOf('function formuleTekst(') < 0);
}

console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
process.exit(fouten ? 1 : 0);
