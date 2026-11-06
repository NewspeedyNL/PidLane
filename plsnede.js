#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// plsnede.js — de changelog-snede als handeling in plaats van afspraak
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT. "CHANGELOG.md bewaart de laatste vier weken" stond
// er sinds 22-09-2026 als regel, en werd twee keer niet gehaald: op 16-10
// stond het bestand op 363 KB, op 06-11 op 313 KB. Een regel die je moet
// blijven onthouden wordt niet onthouden (#265). Nu zegt
// test-changelogsnede.js het op de PR die de grens overschrijdt, en dit
// script doet de snede.
//
// GEBRUIK
//   node plsnede.js            laat zien wat er zou verhuizen (niets schrijven)
//   node plsnede.js --schrijf  verhuist het naar CHANGELOG-ARCHIEF.md
//
// DE REGEL. Een blok is de kop van drie regels (═══ / "DD-MM-JJJJ — titel"
// / ═══) plus alles tot de volgende kop. Bewaard blijft vier weken terug
// vanaf het NIEUWSTE blok — niet vanaf vandaag, zodat de test niet vanzelf
// rood wordt op een dag waarop niemand iets veranderde. De volgorde in het
// bestand is niet streng (een bijgeschreven blok staat soms een plek te
// laag); de snede valt daarom bij het eerste blok vanaf waar álles ouder
// is dan de grens.
'use strict';
const fs = require('fs');
const path = require('path');

const BEWAAR_DAGEN = 28;   // wat er na een snede blijft staan
const MAX_DAGEN = 42;      // wanneer de test rood wordt: twee weken speling

const RAND = /^ *═{20,}/;
const DATUM = /^\s*(\d{2})-(\d{2})-(\d{4})\b/;

function dagNr(d, m, j) { return Date.UTC(j, m - 1, d) / 864e5; }
function alsTekst(n) {
  const t = new Date(n * 864e5);
  const p = x => String(x).padStart(2, '0');
  return p(t.getUTCDate()) + '-' + p(t.getUTCMonth() + 1) + '-' + t.getUTCFullYear();
}

// Alle koppen: { regel (index van de bovenste ═), titel, dag | null }.
function koppen(tekst) {
  const r = tekst.split('\n'), uit = [];
  for (let i = 0; i + 2 < r.length; i++) {
    if (!RAND.test(r[i]) || RAND.test(r[i + 1]) || !RAND.test(r[i + 2])) continue;
    const m = DATUM.exec(r[i + 1]);
    uit.push({ regel: i, titel: r[i + 1].trim(), dag: m ? dagNr(+m[1], +m[2], +m[3]) : null });
    i += 2;
  }
  return uit;
}

// Wat er moet gebeuren. Geeft { nieuwste, oudste, grens, spanne, vanRegel }
// terug; vanRegel is null als er niets hoeft te verhuizen.
function snede(tekst, bewaar = BEWAAR_DAGEN) {
  const k = koppen(tekst).filter(x => x.dag !== null);
  if (!k.length) return null;
  const nieuwste = Math.max(...k.map(x => x.dag));
  const oudste = Math.min(...k.map(x => x.dag));
  const grens = nieuwste - bewaar;
  let van = null;
  for (let i = k.length - 1; i >= 0 && k[i].dag < grens; i--) van = k[i].regel;
  // De lege regel boven de kop gaat mee: anders houdt CHANGELOG.md een
  // staart van witregels en begint het archiefblok zonder.
  const r = tekst.split('\n');
  if (van !== null && van > 0 && r[van - 1].trim() === '') van--;
  return { nieuwste, oudste, grens, spanne: nieuwste - oudste, vanRegel: van };
}

// Het archief begint met een inleiding; de verhuisde blokken komen direct
// daaronder, vóór het eerste blok dat er al stond (nieuwste boven).
function voegIn(archief, blokken) {
  const r = archief.split('\n');
  let i = r.findIndex(x => RAND.test(x));
  if (i < 0) throw new Error('CHANGELOG-ARCHIEF.md heeft geen enkel blok; waar begint de inhoud?');
  if (i > 0 && r[i - 1].trim() === '') i--;
  return r.slice(0, i).concat(blokken.split('\n'), r.slice(i)).join('\n');
}

function voerUit(map, schrijf) {
  const pc = path.join(map, 'CHANGELOG.md'), pa = path.join(map, 'CHANGELOG-ARCHIEF.md');
  const cl = fs.readFileSync(pc, 'utf8');
  const s = snede(cl);
  if (!s) { console.error('Geen enkele gedateerde kop in CHANGELOG.md.'); return 1; }
  if (s.vanRegel === null) {
    console.log('Niets te verhuizen: oudste blok ' + alsTekst(s.oudste) + ', grens ' + alsTekst(s.grens) + '.');
    return 0;
  }
  const r = cl.split('\n');
  const blijft = r.slice(0, s.vanRegel).join('\n') + '\n';
  const weg = r.slice(s.vanRegel).join('\n').replace(/\n+$/, '');
  console.log('Verhuist alles van vóór ' + alsTekst(s.grens) + ': ' +
    Math.round(weg.length / 1024) + ' KB, ' + (r.length - s.vanRegel) + ' regels.');
  if (!schrijf) { console.log('Proefdraai — met --schrijf gebeurt het echt.'); return 0; }
  fs.writeFileSync(pa, voegIn(fs.readFileSync(pa, 'utf8'), weg));
  fs.writeFileSync(pc, blijft);
  console.log('Gedaan. Dit is mechanisch werk: commit het los van al het andere.');
  return 0;
}

module.exports = { koppen, snede, voegIn, BEWAAR_DAGEN, MAX_DAGEN, alsTekst };

if (require.main === module) {
  process.exit(voerUit(__dirname, process.argv.includes('--schrijf')));
}
