// ══════════════════════════════════════════════════════════════════
// test-adminoefen.js — de oefenmodus van de beheerpagina lekt niet
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// De adminpagina beheert echte klanten, echt saldo en echte gebruikers. De
// oefenmodus belooft dat je daar veilig op kunt oefenen: er gaat níéts naar de
// Worker. Die belofte is precies het soort dat stil kan breken — iemand voegt
// een nieuwe knop toe met een eigen fetch(), en vanaf dan wijzigt "oefenen"
// gewoon productie. Er staat geen foutmelding tegenover; het lijkt te werken.
//
// Vandaar dat hier twee dingen bewaakt worden:
//   1. callWorker() onderschept vóórdat hij fetch() aanroept;
//   2. er staat geen fetch() in de pagina die buiten callWorker om gaat,
//      behalve de poorttest — die draait bewust vóór het inloggen en heeft
//      met oefenen niets te maken.
//
// WAAROM DIT BESTAND IN public/ STAAT TERWIJL HET OVER admin/ GAAT
// plcheck.sh draait `test-*.js` vanuit public/. Een test die daarbuiten staat
// draait dus nooit, en een controle die niet draait is geen controle.
//
// SINDS 24-09-2026 OP beheer.html. Tot dan gold dit admin.html; die pagina is
// opgegaan in beheer.html en weg. De belofte is dezelfde gebleven, alleen de
// plek waar hij gehouden moet worden is verhuisd.
//
// Draaien vanuit public/:  node test-adminoefen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bestand = path.join(__dirname, '..', 'admin', 'beheer.html');
if (!fs.existsSync(bestand)) {
  console.error('FOUT: admin/beheer.html niet gevonden.');
  process.exit(1);
}
const bron = fs.readFileSync(bestand, 'utf8');

// ── 1. de afscherming zelf ────────────────────────────────────────
// Broncontrole, met reden: dit gaat over de volgorde van twee regels binnen
// één functie. Een gedragstest zou de hele pagina in een browser moeten
// draaien; dat kan de gate niet, en de eigenschap die telt is puur "komt de
// onderschepping vóór de fetch".
console.log('\n1. Oefenmodus onderschept vóór de fetch');
const iFn    = bron.indexOf('async function callWorker');
const iOefen = bron.indexOf('if(OEFEN)', iFn);
const iFetch = bron.indexOf('await fetch(', iFn);
toets('callWorker() bestaat', iFn >= 0);
toets('er staat een OEFEN-tak in', iOefen > iFn, 'zonder die tak gaat oefenen naar de Worker');
toets('die tak staat vóór de fetch', iOefen > iFn && iOefen < iFetch,
      'de onderschepping staat ná fetch() — dan is het verzoek al verstuurd');

// ── 2. geen tweede route naar buiten ──────────────────────────────
console.log('\n2. Alle verkeer loopt langs callWorker()');
const fetches = (bron.match(/fetch\s*\(/g) || []).length;
// Verwacht: 1 in callWorker + 4 in poortTestKern (die staat bewust buiten de
// oefenmodus: hij test de verbinding vóór het inloggen). De nieuwe schermen
// van 24-09 — Database en Meetopdrachten — gaan allemaal via callWorker.
toets('niet meer fetch-aanroepen dan de bekende vijf', fetches <= 5,
      fetches + ' aanroepen gevonden — een nieuwe fetch() buiten callWorker ' +
      'omzeilt de oefenmodus en schrijft in productie');

// ── 3. de voorbeeldgegevens ───────────────────────────────────────
// oefenAntwoord() uit de pagina knippen en echt draaien. De vraag is niet of
// de data mooi is, maar of hij de vorm heeft die de schermen verwachten —
// anders staat de oefenmodus vol lege lijsten en leer je er niets van.
console.log('\n3. De voorbeeldgegevens hebben de vorm die de schermen verwachten');
const van = bron.indexOf('function oefenLogregels(){');
const tot = bron.lastIndexOf('/*', bron.indexOf('POORT, TABBLADEN EN OPSTART'));
if (van < 0 || tot < 0 || tot < van) {
  toets('oefenblok gevonden', false, 'de markering is verplaatst of hernoemd');
} else {
  const maak = new Function(bron.slice(van, tot) +
    '\nreturn { oefenReset, oefenAntwoord, get D(){ return OEFEN_DATA; } };');
  const O = maak();
  O.oefenReset();

  const kl = O.oefenAntwoord('/admin/klanten', {});
  toets('klantenlijst gevuld', Array.isArray(kl.klanten) && kl.klanten.length >= 3);
  toets('stats kloppen met de lijst',
        kl.stats.aantal === kl.klanten.length &&
        kl.stats.totaalSaldo === kl.klanten.reduce((a, k) => a + k.saldo, 0),
        JSON.stringify(kl.stats));
  toets('elke klant heeft de velden die het scherm leest',
        kl.klanten.every(k => k.id && k.email && k.status !== undefined &&
                              typeof k.saldo === 'number' && typeof k.totaal === 'number'));
  // De lastige gevallen zijn er met opzet: daar wil je juist op oefenen.
  toets('er zit een geblokkeerde klant tussen', kl.klanten.some(k => k.status === 'geblokkeerd'));
  toets('er zit een klant met saldo 0 tussen',  kl.klanten.some(k => k.saldo === 0));
  toets('er staat een wachtwoordherstel open',  kl.klanten.some(k => k.heeftReset));

  const us = O.oefenAntwoord('/admin/users', {});
  toets('gebruikers gevuld', Array.isArray(us.users) && us.users.length >= 2);
  toets('de noodingang staat er apart in', Array.isArray(us.locked) && us.locked.length >= 1,
        'die is niet bewerkbaar en hoort in een eigen lijst');
  toets('er is een geblokkeerde gebruiker om op te oefenen', us.users.some(u => !u.active));

  // De verwijdersleutel verschilt per tabel: gebruikers sturen
  // {action:'delete'} (Engels), klanten {actie:'verwijder'} (Nederlands). Dat
  // verschil zit in de bestaande pagina; de oefenmodus moet het nabootsen,
  // anders doet "Wis" bij een gebruiker daar niets en lijkt de knop stuk.
  const voorUser = us.users.length;
  O.oefenAntwoord('/admin/users', { method:'POST', body: JSON.stringify({ action:'delete', user: us.users[0].user }) });
  toets('gebruiker wissen werkt met {action:delete}',
        O.oefenAntwoord('/admin/users', {}).users.length === voorUser - 1,
        'de oefenmodus kent alleen de klant-sleutel; dan doet Wis bij een gebruiker niets');
  O.oefenReset();

  const co = O.oefenAntwoord('/admin/codes', {});
  toets('codes gevuld', Array.isArray(co.codes) && co.codes.length >= 2);
  toets('open-tokens kloppen',
        co.stats.openCredits === co.codes.filter(c => !c.gebruikt)
                                        .reduce((a, c) => a + c.credits, 0));

  // De database-schermen (24-09-2026). De console voert in oefenmodus
  // niets uit, en dat hoort in het antwoord te staan — anders leest een
  // voorbeeldtabel als de uitkomst van je vraag.
  const d1 = O.oefenAntwoord('/admin/d1?actie=overzicht&dagen=30', {});
  toets('het database-overzicht telt de voorbeeldregels',
        d1.ok === true && d1.log.totaal === O.D.log.length, JSON.stringify(d1.log && d1.log.totaal));
  toets('er zit een regel in het vangnet om op te oefenen', d1.log.metOnbekend >= 1);
  const sql = O.oefenAntwoord('/admin/d1', { method:'POST', body: JSON.stringify({ actie:'sql', sql:'SELECT 1' }) });
  toets('de SQL-console zegt dat hij in oefenmodus niets uitvoert', sql.oefen === true);
  const opd = O.oefenAntwoord('/admin/tabel?bron=opdracht', {}).records;
  toets('er staan meer dan één opdracht aan om op te oefenen',
        opd.filter(o => Number(o.fields.Actief) === 1).length >= 2);
  O.oefenAntwoord('/admin/d1', { method:'POST', body: JSON.stringify({ actie:'opdracht-activeer', id: 1 }) });
  const naOpd = O.oefenAntwoord('/admin/tabel?bron=opdracht', {}).records;
  toets('activeren laat er precies één aan, net als de Worker',
        naOpd.filter(o => Number(o.fields.Actief) === 1).map(o => o.id).join() === '1');
  O.oefenReset();

  // ── 4. wijzigen doet echt iets ──────────────────────────────────
  // Zonder dit is de oefenmodus een plaatje: je drukt op Saldo, er gebeurt
  // niets, en je leert niet wat de knop doet.
  console.log('\n4. Wijzigingen landen in de voorbeeldgegevens');
  const eerste = kl.klanten[0].id;
  O.oefenAntwoord('/admin/klanten', { method:'POST', body: JSON.stringify({ id: eerste, saldo: 999 }) });
  const na = O.oefenAntwoord('/admin/klanten', {});
  toets('saldo aangepast', na.klanten.find(k => k.id === eerste).saldo === 999);
  toets('en het totaal telt mee', na.stats.totaalSaldo !== kl.stats.totaalSaldo);

  const voorVerwijderen = na.klanten.length;
  O.oefenAntwoord('/admin/klanten', { method:'POST', body: JSON.stringify({ id: eerste, actie:'verwijder' }) });
  toets('verwijderen haalt de klant weg',
        O.oefenAntwoord('/admin/klanten', {}).klanten.length === voorVerwijderen - 1);

  const voorCode = O.oefenAntwoord('/admin/codes', {}).codes.length;
  O.oefenAntwoord('/admin/codes', { method:'POST', body: JSON.stringify({ aantal:2, credits:100 }) });
  toets('codes aanmaken werkt',
        O.oefenAntwoord('/admin/codes', {}).codes.length === voorCode + 2);

  // ── 5. tegenproef ───────────────────────────────────────────────
  // Zonder deze stap weet je alleen dat de functies groen kúnnen staan.
  console.log('\n5. Tegenproef — begint een verse oefensessie weer schoon?');
  O.oefenReset();
  const vers = O.oefenAntwoord('/admin/klanten', {});
  toets('de verwijderde klant is terug', vers.klanten.length === kl.klanten.length);
  toets('en het saldo staat weer op de beginwaarde',
        vers.klanten.find(k => k.id === eerste).saldo !== 999,
        'oefenReset() zet de gegevens niet terug — dan werkt de tweede oefensessie ' +
        'op de rommel van de eerste');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
