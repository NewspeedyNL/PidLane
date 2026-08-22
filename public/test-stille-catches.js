// ══════════════════════════════════════════════════════════════════
// test-stille-catches.js — het aantal mag alleen omlaag
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT EEN RATEL IS EN GEEN CONTROLE
//
// Er stonden 821 lege catches in deze codebase. Drie mechanismen zijn er
// maandenlang dood door geweest: purgeImplausiblePids() bestond niet meer,
// _noteMap() en plHerijkTick() werden nooit aangeroepen, en
// rebuildPidDefsCache() heeft nooit bestaan. Alle drie stil weggeslikt.
// probeUitgebreid() stond in PLAN.md als "wordt nergens opgevraagd" terwijl
// het gewoon gebeurde — in een lege catch.
//
// Dat opruimen is werk van maanden, niet van één sessie. Een test die eist
// dat het er nul zijn zou dus vanaf dag één rood staan, en een test die
// altijd rood staat wordt genegeerd — precies de failliete controle waar dit
// project al eerder tegenaan liep.
//
// Daarom een RATEL: per module staat hieronder hoeveel er nu zijn. Meer mag
// niet, minder mag altijd. Nieuwe code kan er dus geen bij smokkelen, en elke
// opgeruimde module verlaagt zijn eigen grens. Zo wordt het een gewoonte in
// plaats van een project.
//
// WAT NIET MEETELT
// Een catch met een reden erin — `catch(e){ /* stil: opslag kan vol zijn */ }`
// — is beoordeeld en telt niet mee. Dat onderscheid is het hele punt: de
// werkregel is dat een catch stil MAG zijn bij een verwachte externe fout
// (opslag vol, element weg, een sonde die juist test óf iets antwoordt), maar
// nooit rond een aanroep van eigen code.
//
// ALS DEZE TEST ROOD STAAT
// Je hebt een lege catch toegevoegd. Twee opties: vul hem met een melding
// (btDiag voor iets dat in het logboek hoort, console.warn voor de rest), of
// zet er een reden in als hij bewust stil is. Verlaag de grens NOOIT door het
// getal hieronder op te hogen.
//
// Draaien vanuit public/:  node test-stille-catches.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');

// Stand op 21-08-2026, na het opruimen van pidlane-bt.js en
// pidlane-veldlab.js (allebei van 54 naar 0).
const GRENS = {
  "pidlane-archief.js": 23,
  "pidlane-auth.js": 39,
  "pidlane-bedrading.js": 5,
  "pidlane-btflow.js": 30,
  "pidlane-bulk.js": 19,
  "pidlane-busgate.js": 2,
  "pidlane-caravan.js": 8,
  "pidlane-correlatie.js": 1,
  "pidlane-credits.js": 11,
  "pidlane-data.js": 6,
  "pidlane-datalog.js": 25,
  "pidlane-demo.js": 11,
  "pidlane-diagbundel.js": 11,
  "pidlane-diagnose.js": 7,
  "pidlane-dossier.js": 1,
  "pidlane-export.js": 11,
  "pidlane-fuel.js": 40,
  "pidlane-graph.js": 2,
  "pidlane-klant.js": 12,
  "pidlane-koopcheck.js": 42,
  "pidlane-logboek.js": 11,
  "pidlane-mode06.js": 1,
  "pidlane-monitor.js": 10,
  "pidlane-motortype.js": 5,
  "pidlane-onderdeel.js": 1,
  "pidlane-pidgate.js": 13,
  "pidlane-pids.js": 22,
  "pidlane-plload.js": 8,
  "pidlane-privacy.js": 6,
  "pidlane-recall.js": 3,
  "pidlane-remote.js": 105,
  "pidlane-rijsituatie.js": 23,
  "pidlane-rit.js": 3,
  "pidlane-run.js": 8,
  "pidlane-start.js": 5,
  "pidlane-testrun.js": 66,
  "pidlane-theme.js": 24,
  "pidlane-totalcheck.js": 18,
  "pidlane-uihelpers.js": 20,
  "pidlane-uitgebreid.js": 9,
  "pidlane-verify.js": 5,
  "pidlane-voertuigdata.js": 22,
  "pidlane-waakronde.js": 13,
  "pidlane-watchers.js": 9,
};

const RE = /catch\s*\(\s*[a-zA-Z_$][\w$]*\s*\)\s*\{\s*\}/g;
let fout = 0, totaal = 0, gedaald = [];

const modules = fs.readdirSync('.').filter(function (f) {
  return /^pidlane-.*\.js$/.test(f);
}).sort();

console.log('Stille catches — het aantal mag alleen omlaag\n');

modules.forEach(function (f) {
  const n = (fs.readFileSync(f, 'utf8').match(RE) || []).length;
  totaal += n;
  const grens = Object.prototype.hasOwnProperty.call(GRENS, f) ? GRENS[f] : 0;
  if (n > grens) {
    console.log('  FOUT  ' + f + ': ' + n + ' lege catches, grens is ' + grens);
    console.log('        Vul hem met een melding, of zet er een reden in:');
    console.log('        catch(e){ /* stil: waarom dit mag */ }');
    fout++;
  } else if (n < grens) {
    gedaald.push(f + ' ' + grens + ' → ' + n);
  }
});

// Een module die van de lijst verdwenen is (hernoemd of weg) hoort niet stil
// te blijven staan: dan zakt de grens nooit meer en dekt de ratel minder dan
// je denkt.
Object.keys(GRENS).forEach(function (f) {
  if (modules.indexOf(f) < 0) {
    console.log('  FOUT  ' + f + ' staat in de lijst maar bestaat niet meer — haal de regel weg');
    fout++;
  }
});

if (gedaald.length) {
  console.log('  ok    ' + gedaald.length + ' module(s) opgeruimd sinds de laatste stand:');
  gedaald.forEach(function (r) { console.log('        ' + r); });
  console.log('        Verlaag de grenzen hierboven, dan kan het niet terugkruipen.');
}

if (!fout) console.log('  ok    ' + modules.length + ' modules, ' + totaal + ' stille catches — geen enkele erbij');

console.log('\n' + (fout ? fout + ' probleem(en)' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
