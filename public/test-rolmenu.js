// ══════════════════════════════════════════════════════════════════
// test-rolmenu.js — het kebabmenu volgt de rol (#49, losse waarneming)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// pasMenuAan() verborg alleen het adminblok. Het item "👤 Mijn account" bleef
// staan voor iedereen, ook voor een account zonder record in `Klanten`.
//
// Nagemeten wat zo'n account dan te zien kreeg — de waarneming in #49 zei dat
// dat niet nagemeten was. Het scherm brak niet, maar het zei: "Je bent
// ingelogd met een zakelijk account. Daarvoor gelden geen tokens — analyses
// zitten in je abonnement." Dat abonnement bestaat niet. Het besluit bij #49
// zegt wat zo'n account wél is: personeel, dat op de sleutel van de beheerder
// draait.
//
// Twee dingen bewaakt deze test:
//   1. het item is weg voor een niet-klant, net als het adminblok;
//   2. de tekst belooft geen abonnement meer.
//
// Dit is cosmetisch en geen beveiliging — die zit in de Worker, die elk
// beheerverzoek aan X-Admin-Token toetst. Een test die dat verwart zou een
// vals gevoel van veiligheid geven, dus het staat er expliciet bij.
//
// Draaien vanuit public/:  node test-rolmenu.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const bron = fs.readFileSync(__dirname + '/pidlane-klant.js', 'utf8');

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}

// ── pasMenuAan() uit de module knippen en in een nep-DOM draaien ────
function pak(van, tot) {
  const i = bron.indexOf(van);
  if (i < 0) throw new Error('"' + van + '" niet gevonden in pidlane-klant.js');
  const j = bron.indexOf(tot, i);
  if (j < 0) throw new Error('"' + tot + '" niet gevonden na "' + van + '"');
  return bron.slice(i, j + tot.length);
}
const PASMENU = pak('function pasMenuAan() {', '\n  }');

function maakMenu(rol) {
  const el = {};
  ['admGroupBtn', 'admGroup', 'kbAccount'].forEach(function (id) {
    el[id] = { style: { display: '' }, classList: { remove: function () {} } };
  });
  const document_ = { getElementById: function (id) { return el[id] || null; } };
  const isAdmin = function () { return rol === 'admin'; };
  const isKlant = function () { return rol === 'klant'; };
  const fn = new Function('document', 'isAdmin', 'isKlant', 'console',
    PASMENU + '\nreturn pasMenuAan;');
  fn(document_, isAdmin, isKlant, { warn: function () {} })();
  return el;
}
function zichtbaar(el, id) { return el[id].style.display !== 'none'; }

// ══════════════════════════════════════════════════════════════════
console.log('\n1. Een klant ziet zijn account, geen beheer');
{
  const m = maakMenu('klant');
  eis('"Mijn account" staat er', zichtbaar(m, 'kbAccount'));
  eis('het adminblok niet', !zichtbaar(m, 'admGroup') && !zichtbaar(m, 'admGroupBtn'));
}

console.log('\n2. Een beheerder ziet beheer, maar geen tegoedscherm');
{
  const m = maakMenu('admin');
  eis('het adminblok staat er', zichtbaar(m, 'admGroup') && zichtbaar(m, 'admGroupBtn'));
  eis('"Mijn account" is weg  <- dit was de waarneming in #49',
      !zichtbaar(m, 'kbAccount'));
}

console.log('\n3. Een demo-account ziet geen van beide');
{
  const m = maakMenu('demo');
  eis('geen adminblok', !zichtbaar(m, 'admGroup'));
  eis('geen "Mijn account"', !zichtbaar(m, 'kbAccount'));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. De tekst voor een niet-klant klopt weer');
{
  eis('het niet-bestaande abonnement is uit de tekst',
      !/zitten in je abonnement/.test(bron));
  eis('en er staat wat er wél geldt',
      /analyses lopen op de sleutel van de beheerder/.test(bron));
  // De schermtekst hoort achter dezelfde vraag te hangen als het menu-item,
  // anders lopen ze uit de pas zodra er een rol bij komt.
  eis('het scherm gebruikt isKlant(), net als het menu',
      /if \(!isKlant\(\)\) \{/.test(bron));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. TEGENPROEF — zou de oude situatie hier opvallen?');
{
  // De oude pasMenuAan() raakte kbAccount niet aan. Bouw dat na en laat zien
  // dat deel 2 daar rood op staat.
  const oud = 'function pasMenuAan() {\n' +
    '  var admin = isAdmin();\n' +
    "  ['admGroupBtn','admGroup'].forEach(function(id){\n" +
    "    var el=document.getElementById(id); if(el) el.style.display = admin ? '' : 'none';\n" +
    '  });\n' +
    '}';
  const el = {};
  ['admGroupBtn', 'admGroup', 'kbAccount'].forEach(function (id) {
    el[id] = { style: { display: '' } };
  });
  new Function('document', 'isAdmin', oud + '\nreturn pasMenuAan;')(
    { getElementById: function (id) { return el[id] || null; } },
    function () { return true; })();
  eis('de oude vorm liet "Mijn account" staan voor een beheerder',
      zichtbaar(el, 'kbAccount'),
      'dan meet deel 2 niets');

  // En de oude tekst: die zou deel 4 rood maken.
  const oudeTekst = 'Je bent ingelogd met een zakelijk account. Daarvoor gelden geen tokens — analyses zitten in je abonnement.';
  eis('de oude tekst matcht de controle uit deel 4',
      /zitten in je abonnement/.test(oudeTekst));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6. Dit is geen beveiliging, en dat hoort er zo te staan');
{
  // Een test die zou suggereren dat een verborgen menu-item iets afschermt
  // is erger dan geen test. De code zegt zelf dat de poort in de Worker zit;
  // deze controle bewaakt dat die zin blijft staan.
  eis('de code noemt het cosmetisch, niet beveiliging',
      /cosmetisch, geen beveiliging/.test(bron) || /Ook cosmetisch, geen beveiliging/.test(bron));
  eis('en wijst naar de Worker als de echte poort',
      /X-Admin-Token/.test(bron));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
