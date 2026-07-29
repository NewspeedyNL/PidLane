#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   genereer-codes.js — activatiecodes maken voor de PidLane-tegoedmodule
   ───────────────────────────────────────────────────────────────────────
   Maakt een CSV die je rechtstreeks in de Airtable-tabel TokenCodes
   importeert (base appUAuyRxK18T7ImK). Daarna verkoop je de codes buiten
   de app om — Tikkie, iDEAL, contant, wat je wilt. De app kent alleen de
   code, niet de betaling.

   GEBRUIK
     node tools/genereer-codes.js --aantal 50 --credits 100 --prijs 4.99 \
          --batch 2026-08-tikkie-5euro

   OPTIES
     --aantal   hoeveel codes           (standaard 25)
     --credits  tokens per code         (standaard 100)
     --prijs    verkoopprijs in euro    (standaard 0 = leeg laten)
     --batch    naam van de uitgifte    (standaard datum + "-batch")
     --vervalt  YYYY-MM-DD              (standaard leeg = geen vervaldatum)
     --uit      pad van het CSV-bestand (standaard codes-<batch>.csv)

   WAAROM DEZE TEKENSET
     De letters I, L, O en de cijfers 0 en 1 zitten er niet in. Die worden
     structureel verkeerd overgetypt vanaf papier of een schermfoto, en dat
     levert jou supportvragen op over codes die "niet werken".

   LET OP
     - Codes zijn niets waard zolang ze niet in Airtable staan: importeer
       eerst, verkoop daarna.
     - Bewaar de CSV niet in de repo. Hij staat gelijk aan contant geld.
     - Gebruik per verkoopkanaal een eigen --batch, dan kun je bij misbruik
       gericht één partij intrekken in plaats van alles.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Argumenten ───────────────────────────────────────────────────────
function arg(naam, standaard) {
  const i = process.argv.indexOf('--' + naam);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standaard;
}

const vandaag = new Date().toISOString().slice(0, 10);
const AANTAL = Math.max(1, Math.min(5000, parseInt(arg('aantal', '25'), 10) || 25));
const CREDITS = Math.max(1, parseInt(arg('credits', '100'), 10) || 100);
const PRIJS = parseFloat(arg('prijs', '0')) || 0;
const BATCH = arg('batch', vandaag + '-batch');
const VERVALT = arg('vervalt', '');
const UIT = arg('uit', path.join(process.cwd(), 'codes-' + BATCH + '.csv'));

// ── Codegenerator ────────────────────────────────────────────────────
// Zonder I, L, O, 0 en 1 — die worden verkeerd overgenomen.
const TEKENS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function blok(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += TEKENS[b[i] % TEKENS.length];
  return s;
}

function maakCode() {
  return 'PIDL-' + blok(4) + '-' + blok(6);
}

// ── CSV ──────────────────────────────────────────────────────────────
function csvVeld(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const gezien = new Set();
const rijen = [];
let pogingen = 0;

while (rijen.length < AANTAL && pogingen < AANTAL * 50) {
  pogingen++;
  const c = maakCode();
  if (gezien.has(c)) continue;      // botsing is astronomisch onwaarschijnlijk, maar gratis af te vangen
  gezien.add(c);
  rijen.push(c);
}

if (rijen.length < AANTAL) {
  console.error('Kon niet genoeg unieke codes maken — dit hoort niet te gebeuren.');
  process.exit(1);
}

// Kolomnamen komen exact overeen met de velden in de Airtable-tabel TokenCodes.
const kop = ['Code', 'Credits', 'Gebruikt', 'Batch', 'Waarde', 'Aangemaakt', 'Vervalt'];
const nu = new Date().toISOString().slice(0, 16).replace('T', ' ');

const csv = [kop.join(',')].concat(
  rijen.map((c) => [
    c,
    CREDITS,
    'false',
    BATCH,
    PRIJS > 0 ? PRIJS.toFixed(2) : '',
    nu,
    VERVALT
  ].map(csvVeld).join(','))
).join('\n') + '\n';

fs.writeFileSync(UIT, csv, 'utf8');

// ── Samenvatting ─────────────────────────────────────────────────────
const totaalCredits = AANTAL * CREDITS;
const totaalEuro = AANTAL * PRIJS;

console.log('');
console.log('  ' + AANTAL + ' codes gegenereerd');
console.log('  batch      : ' + BATCH);
console.log('  per code   : ' + CREDITS + ' tokens' + (PRIJS ? ' \u00e0 \u20ac' + PRIJS.toFixed(2) : ''));
console.log('  totaal     : ' + totaalCredits + ' tokens' + (PRIJS ? ' / \u20ac' + totaalEuro.toFixed(2) : ''));
if (VERVALT) console.log('  vervalt    : ' + VERVALT);
console.log('  bestand    : ' + UIT);
console.log('');
console.log('  Voorbeeld  : ' + rijen[0]);
console.log('');
console.log('  Volgende stap: importeer dit bestand in de Airtable-tabel');
console.log('  TokenCodes (base appUAuyRxK18T7ImK) voordat je codes uitgeeft.');
console.log('  Verwijder de CSV daarna \u2014 het is contant geld.');
console.log('');
