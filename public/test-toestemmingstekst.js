// ══════════════════════════════════════════════════════════════════
// test-toestemmingstekst.js — de belofte moet de lading dekken
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Op 25-08-2026 is de ruwe VIN uit de Veldlab-sync gehaald en vervangen door
// SHA-256(zout + VIN). Dat is pseudonimisering: het zout staat in clientcode,
// wie een VIN al kent kan hem toetsen, en het pseudoniem koppelt alle metingen
// van dezelfde auto aan elkaar. Onder de AVG (overweging 26) blijft dat een
// persoonsgegeven.
//
// De teksten bleven twee dagen achter. Het onboardingscherm, privacy.html, de
// BT-disclosure en de foutmelding in worker.js zeiden alle vier
// "geanonimiseerd". Toestemming die op een onjuiste voorstelling van zaken is
// gegeven, is aanvechtbaar — het probleem was dus niet cosmetisch.
//
// Deze test bewaakt precies dat: op de vier plekken waar PidLane de gebruiker
// vertelt wat er met zijn meetdata gebeurt, mag niet het woord "geanonimiseerd"
// staan zolang de verwerking pseudonimisering is. Dit is bewust wél een
// tekstcontrole — test-vin-anoniem.js toetst het gedrag, deze toetst of we er
// eerlijk over zijn. De twee horen bij elkaar en moeten samen groen zijn.
//
// De scan kijkt naar het hele bestand, ook naar commentaar. Dat is grof en
// bewust zo: het betekent dat de claim nergens in deze vier bestanden stilletjes
// terug kan komen, ook niet in een toelichting die later voor waarheid wordt
// aangezien. Wil je over de oude tekst schrijven, omschrijf hem dan.
//
// AANPASSEN MAG. Wordt de verwerking ooit écht anoniem (geen herleidbare
// koppeling meer, ook niet met een bekende VIN), dan mag "geanonimiseerd"
// terug — haal deze test dan weg in dezelfde commit als die verwerking, niet
// eerder en niet los.
//
// Draaien vanuit public/:  node test-toestemmingstekst.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

function lees(rel) {
  const p = path.join(__dirname, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

// De vier plekken waar de gebruiker leest wat er met zijn meetdata gebeurt.
// Pad is relatief aan public/; worker.js staat een map hoger.
const PLEKKEN = [
  ['pidlane-klant.js',   'akkoordscherm bij onboarding'],
  ['privacy.html',       'privacyverklaring'],
  ['pidlane-privacy.js', 'Bluetooth-disclosure'],
  ['../worker.js',       'foutmelding /klant/onboarding']
];

// "anoniem" alleen laten afgaan waar het over de meetdata gaat. worker.js
// gebruikt het woord ook voor een onbekende inwisselaar van een tokencode
// ("door: anoniem") en dat is een terechte toepassing.
const VERBODEN = /geanonimiseerd\w*|anonieme meetdata|anonieme referentiedata/gi;

console.log('\nToestemmingstekst\n');

for (const [rel, wat] of PLEKKEN) {
  const src = lees(rel);
  if (src === null) {
    toets(wat + ' — bestand bestaat', false, rel + ' niet gevonden');
    continue;
  }

  const treffers = src.match(VERBODEN) || [];
  toets(wat + ' — claimt geen anonimisering', treffers.length === 0,
        treffers.length ? 'gevonden: ' + [...new Set(treffers)].join(', ') +
        '\n        Dit is pseudonimisering. Zie de kop van dit bestand.' : '');
}

// De onboarding is de plek waar de toestemming daadwerkelijk wordt gegeven.
// Daar moet het onderscheid ook echt uitgelegd staan, niet alleen het woord
// "geanonimiseerd" ontbreken.
const klant = lees('pidlane-klant.js') || '';
const onb = klant.slice(klant.indexOf('_vink(\'onbAnon\''),
                        klant.indexOf('_vink(\'onbNieuws\''));
toets('akkoordscherm noemt het een pseudoniem', /pseudoniem/i.test(onb),
      'de vinktekst voor onbAnon legt het onderscheid niet uit');
toets('akkoordscherm zegt dat het geen anonimisering is',
      /geen anonimisering/i.test(onb),
      'zeg het met zoveel woorden — de gebruiker moet het verschil kunnen wegen');

// En de privacyverklaring, want die is de naslag waar de disclosure naar
// verwijst. Wijken die twee van elkaar af, dan is dat een tegenstrijdigheid
// die een Play-reviewer opmerkt (zie de kop van privacy.html).
const priv = lees('privacy.html') || '';
toets('privacyverklaring legt de pseudonimisering uit',
      /pseudonimisering/i.test(priv) && /persoonsgegeven/i.test(priv),
      'privacy.html moet benoemen dat het pseudoniem een persoonsgegeven blijft');

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
process.exit(fout ? 1 : 0);
