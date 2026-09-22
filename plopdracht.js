#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// plopdracht.js — keur één meetopdracht, en verder niets
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT APART STAAT EN GEEN `test-*.js` HEET.
//
// Een meetopdracht is DATA en geen code. Hij staat in D1, hij verandert
// tussen twee ritten door, en er zit geen deploy aan vast. Zou de keuring
// ervan in de test-reeks zitten, dan kost het bijstellen van één band de
// hele poort: 128 tests, de browserproeven en 415 mutaties — minuten werk
// voor een getal dat je in tien seconden wilt kunnen corrigeren.
//
// Daarom heet dit bestand met opzet niet `test-…` en niet `bproef-…`:
//   plcheck.sh   draait `test-*.js`
//   plbrowser.sh draait `bproef-*.js`
//   plmutate.sh  draait zijn eigen tabel
// Dit valt buiten alle drie, en dat is de hele bedoeling.
//
// WAT HIJ WÉL DOET, en dat is meer dan de app zelf kan. De keurder in
// pidlane-opdracht.js zegt of de VORM klopt. Hij zegt niet of de opdracht
// iets kán meten — en dat is precies waar elke ronde tot nu toe op
// stukliep: "GESLOTEN" op een proef die niet kon falen, of op een PID die
// niet eens uitgevraagd werd. Die twee controles staan hieronder.
//
// GEBRUIK
//   node plopdracht.js opdracht.json      één opdracht of een lijst
//   node plopdracht.js -                  van stdin
//   cat rijen.json | node plopdracht.js - ook de D1-rijvorm [{Opdracht:…}]
//
// exit 0 = bruikbaar (waarschuwingen mogen), exit 1 = zo sluit hij niets.
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORTEL = __dirname;
const ROOD = '\x1b[31m', GEEL = '\x1b[33m', GROEN = '\x1b[32m', GRIJS = '\x1b[90m', UIT = '\x1b[0m';

// ── de echte PID-tabel, niet nagebouwd ────────────────────────────
const win = { console };
vm.createContext(win);
vm.runInContext('var window=this;' + fs.readFileSync(path.join(WORTEL, 'public/pidlane-data.js'), 'utf8'), win);
const DEFS = win.ALL_PID_DEFS || {};
if (!Object.keys(DEFS).length) {
  console.error('FOUT: ALL_PID_DEFS is niet geladen uit public/pidlane-data.js');
  process.exit(1);
}

// ── de echte keurder, uit de bron geknipt ─────────────────────────
// Met een anker, zodat dit stopt in plaats van groen te blijven als de
// module verbouwd wordt.
const R = fs.readFileSync(path.join(WORTEL, 'public/pidlane-opdracht.js'), 'utf8').split('\n');
const van = R.findIndex((r) => r.startsWith('  var SCHEMAS = '));
const tot = R.findIndex((r) => r.startsWith('  function haal()'));
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: keur() is niet te vinden in pidlane-opdracht.js — hernoemd of verbouwd.');
  process.exit(1);
}
const keur = new Function('getPidDef', 'console', R.slice(van, tot).join('\n') + '\nreturn keur;')(
  (p) => DEFS[String(p).toUpperCase()] || null, console);

// ── inlezen ───────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg) {
  console.error('Gebruik: node plopdracht.js <bestand.json|->');
  process.exit(2);
}
const ruw = arg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(arg, 'utf8');

let ingang;
try { ingang = JSON.parse(ruw); }
catch (e) { console.error('FOUT: geen geldige JSON — ' + (e.message || e)); process.exit(1); }

/* Drie vormen worden geslikt: één opdracht, een lijst opdrachten, of de
   rijvorm die D1 teruggeeft ([{Naam, Opdracht: "<json>"}]). Soepel op de
   verpakking, streng op de inhoud. */
// De omhulsel-gegevens (rijnaam, het vinkje) blijven NAAST de opdracht en
// gaan er niet in. De keurder heeft een witte lijst en wijst elke sleutel af
// die hij niet kent — terecht, en dat is precies waar mijn eerste versie van
// dit bestand op struikelde.
function uitpakken(x) {
  if (Array.isArray(x)) return x.flatMap(uitpakken);
  if (x && typeof x === 'object' && Array.isArray(x.results)) return uitpakken(x.results);
  if (x && typeof x === 'object' && typeof x.Opdracht === 'string') {
    let o;
    try { o = JSON.parse(x.Opdracht); }
    catch (e) { return [{ stuk: x.Naam || '?', reden: e.message || String(e) }]; }
    return [{ o: o, rij: x.Naam || '', actief: !!x.Actief }];
  }
  return [{ o: x, rij: '', actief: false }];
}
const lijst = uitpakken(ingang);

// ── de twee controles die de app zelf niet doet ───────────────────

/* 1. Meet hij wat hij uitvraagt? Een proef of voorwaarde op een PID die
      niet in `sensoren` staat, wordt nooit gemeten. De app maakt daar
      LET OP van — "niet gemeten is geen waarde" — en dat is netjes, maar
      het betekent wel dat die rit de vraag niet beantwoordt. Vóór de rit
      is dat te zien; erna heb je een lege middag. */
function pidsBuitenSelectie(o) {
  const sensoren = new Set((o.sensoren || []).map((s) => String(s).toUpperCase()));
  const mist = [];
  const kijk = (waar, lijstje) => (lijstje || []).forEach((p, i) => {
    if (!p || !p.pid) return;                       // een voorwaarde met `stap` heeft geen pid
    const pid = String(p.pid).toUpperCase();
    if (!sensoren.has(pid)) mist.push(waar + ' ' + i + ' (' + (p.naam || p.wat || '') + ') vraagt ' + pid);
  });
  kijk('proef', o.proeven);
  kijk('voorwaarde', o.voorwaarden);
  kijk('drempel', o.drempels);
  return mist;
}

/* 2. Kan hij rood worden? Een band die het hele fysieke bereik van de PID
      dekt, kan per definitie niet FOUT worden — dan staat er straks
      GESLOTEN op een proef die niets heeft uitgesloten. Dat is de vorm die
      #255, #256 en #257 duur hebben gemaakt.

      Andersom telt ook: een band die volledig BUITEN het bereik ligt staat
      altijd rood en wordt dus genegeerd. */
function bandProblemen(o) {
  const uit = [];
  (o.proeven || []).forEach((p, i) => {
    if (!p || !p.pid || !Array.isArray(p.tussen)) return;
    const d = DEFS[String(p.pid).toUpperCase()];
    if (!d || typeof d.min !== 'number' || typeof d.max !== 'number') return;
    const [lo, hi] = p.tussen;
    const naam = 'proef ' + i + ' (' + (p.naam || '') + ')';
    // `aantal` en `veranderingen` zijn tellingen, geen meetwaarden: hun
    // bereik is niet dat van de sensor. Die slaan we over.
    if (p.meet === 'aantal' || p.meet === 'veranderingen') return;
    if (lo <= d.min && hi >= d.max)
      uit.push({ ernst: 'FOUT', tekst: naam + ': band ' + lo + '–' + hi + ' dekt het hele bereik van ' +
        p.pid + ' (' + d.min + '–' + d.max + ' ' + (d.unit || '') + ') — deze proef kan niet rood worden' });
    else if (hi < d.min || lo > d.max)
      uit.push({ ernst: 'FOUT', tekst: naam + ': band ' + lo + '–' + hi + ' ligt buiten het bereik van ' +
        p.pid + ' (' + d.min + '–' + d.max + ') — deze proef staat altijd rood' });
  });
  return uit;
}

/* 3. Sluit hij iets? Een proef zonder `issue` levert wel een uitkomst op,
      maar die is van buiten de app niet aan een vraag te knopen — en dat
      was nou net de reden dat `Repro` bestaat (#257). */
function proevenZonderIssue(o) {
  return (o.proeven || []).map((p, i) => (p && !p.issue) ? ('proef ' + i + ' (' + (p.naam || '') + ')') : null)
    .filter(Boolean);
}

// ── aflopen ───────────────────────────────────────────────────────
let fouten = 0, waarschuwingen = 0;
console.log('');
lijst.forEach(function (item) {
  if (item && item.stuk) {
    fouten++;
    console.log(ROOD + '  FOUT  ' + UIT + item.stuk + '\n        de opdrachttekst is geen geldige JSON: ' + item.reden);
    return;
  }
  const o = item.o;
  const naam = (o && (o.naam || item.rij)) || '(zonder naam)';
  const merk = item.actief ? GROEN + ' [ACTIEF]' + UIT : '';
  const tekst = JSON.stringify(o);

  const k = keur(tekst);
  const regels = [];
  if (!k.ok) k.fouten.forEach((f) => regels.push({ ernst: 'FOUT', tekst: f }));

  pidsBuitenSelectie(o).forEach((m) => regels.push({ ernst: 'FOUT',
    tekst: m + ' — die PID staat niet in `sensoren`, dus hij wordt niet uitgevraagd' }));
  bandProblemen(o).forEach((b) => regels.push(b));
  proevenZonderIssue(o).forEach((p) => regels.push({ ernst: 'LET OP',
    tekst: p + ' draagt geen `issue` — de uitkomst is dan niet aan een vraag te knopen' }));
  if (!(o.proeven || []).length) regels.push({ ernst: 'LET OP',
    tekst: 'geen proeven — deze opdracht kan niets sluiten, alleen sensoren aanzetten' });

  /* Zonder voorwaarden is elke uitkomst onvoorwaardelijk. Dat is letterlijk
     wat er op 19-09 misging: vijf rijen meldden GESLOTEN na zes minuten met
     de waakronde uit, op proeven die over iets anders gingen. Schema 1 kán
     geen voorwaarden dragen — dan is de melding "zet hem over op 2". */
  if (!(o.voorwaarden || []).length) regels.push({ ernst: 'LET OP',
    tekst: o.schema === 1
      ? 'schema 1 kent geen voorwaarden — deze opdracht meldt GESLOTEN zonder dat er iets vervuld hoefde te zijn (#257). Zet hem over op schema 2.'
      : 'geen voorwaarden — deze opdracht meldt GESLOTEN ook als de rit de vraag niet kon beantwoorden (#257)' });
  if (tekst.length > 8192) regels.push({ ernst: 'FOUT',
    tekst: 'de opdracht is ' + tekst.length + ' tekens; boven 8192 gaat hij niet mee' });

  const heeftFout = regels.some((r) => r.ernst === 'FOUT');
  const heeftLetOp = regels.some((r) => r.ernst === 'LET OP');
  if (heeftFout) fouten++; else if (heeftLetOp) waarschuwingen++;

  const kop = heeftFout ? ROOD + '  FOUT  ' + UIT : heeftLetOp ? GEEL + ' LET OP ' + UIT : GROEN + '  ok    ' + UIT;
  console.log(kop + naam + merk + GRIJS + '  (' + tekst.length + ' tekens, ' +
    (o.proeven || []).length + ' proeven, ' + (o.voorwaarden || []).length + ' voorwaarden)' + UIT);
  regels.forEach((r) => console.log('        ' + (r.ernst === 'FOUT' ? ROOD : GEEL) + r.ernst + UIT + '  ' + r.tekst));
});

console.log('');
if (fouten) console.log(ROOD + fouten + ' opdracht(en) sluiten zo niets.' + UIT);
else if (waarschuwingen) console.log(GEEL + 'Bruikbaar, met ' + waarschuwingen + ' kanttekening(en).' + UIT);
else console.log(GROEN + 'Alle ' + lijst.length + ' opdracht(en) kunnen meten wat ze vragen.' + UIT);
console.log('');
process.exit(fouten ? 1 : 0);
