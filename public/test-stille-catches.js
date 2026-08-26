// ══════════════════════════════════════════════════════════════════
// test-stille-catches.js — geen lege catches, nul is de norm
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
//
// Er stonden ooit 821 lege catches in deze codebase. Drie mechanismen zijn er
// maandenlang dood door geweest: purgeImplausiblePids() bestond niet meer,
// _noteMap() en plHerijkTick() werden nooit aangeroepen, en
// rebuildPidDefsCache() heeft nooit bestaan. Alle drie stil weggeslikt.
// probeUitgebreid() stond in PLAN.md als "wordt nergens opgevraagd" terwijl
// het gewoon gebeurde — in een lege catch.
//
// Van 22-08 tot 25-08-2026 draaide hier een RATEL: per module stond
// vastgelegd hoeveel lege catches er nu waren, meer mocht niet, minder mocht
// altijd. Een test die eist dat het er nul zijn zou dag één al rood hebben
// gestaan, en een rood-startende test wordt genegeerd — precies de
// failliete controle waar dit project al eerder tegenaan liep.
//
// Op 25-08-2026 is de laatste module opgeruimd (394 lege catches over 38
// bestanden, in één ronde vervangen door een melding of een reden). Nul is
// nu het startpunt, dus de ratel is overbodig: deze test eist voortaan
// gewoon nul, overal.
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
// zet er een reden in als hij bewust stil is. Er is geen grens meer om te
// verlagen — nul is de enige geldige waarde.
//
// Draaien vanuit public/:  node test-stille-catches.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');

// 26-08: verbreed. De oude vorm eiste een simpele naam tussen de haakjes en
// miste daardoor twee lege catches die wel degelijk stil zijn:
//   catch {}            bindingloos (ES2019) — 13x in worker.js, alle gevuld
//   catch({message}){}  destructurerend
// De variant die in blok 5 stond (`catch\s*\([^)]*\)`) ving die eerste ook
// niet, en sloeg bovendien vals alarm op `.catch(function(){})` — een
// promise-afhandelaar met een lege functie is geen lege catch. Vandaar de
// eis dat `catch` niet voorafgegaan wordt door een punt of een woordteken.
const RE = /(^|[^.\w$])catch\s*(?:\(\s*(?:[a-zA-Z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*\))?\s*\{\s*\}/g;
let fout = 0, totaal = 0;

const modules = fs.readdirSync('.').filter(function (f) {
  return /^pidlane-.*\.js$/.test(f);
}).sort();

console.log('Stille catches — nul is de norm\n');

modules.forEach(function (f) {
  const n = (fs.readFileSync(f, 'utf8').match(RE) || []).length;
  totaal += n;
  if (n > 0) {
    console.log('  FOUT  ' + f + ': ' + n + ' lege catch(es)');
    console.log('        Vul hem met een melding, of zet er een reden in:');
    console.log('        catch(e){ /* stil: waarom dit mag */ }');
    fout++;
  }
});

if (!fout) console.log('  ok    ' + modules.length + ' modules, 0 lege catches');

console.log('\n' + (fout ? fout + ' probleem(en)' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
