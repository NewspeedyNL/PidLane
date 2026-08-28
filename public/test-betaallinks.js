// ══════════════════════════════════════════════════════════════════
// test-betaallinks.js — welke betaallink laat de app toe?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT MEER IS DAN NETTE-INVOER-CONTROLE
// De Tikkie-links stonden tot 28-08-2026 hardcoded in pidlane-klant.js (#24).
// Ze komen nu uit de Config-tabel in Airtable, via /api/config, en belanden in
// een href. Dat verplaatst een risico: een waarde die eerst in de code stond en
// door de gate kwam, komt nu uit een database die je vanuit admin.html vult.
//
// Zet iemand met schrijfrechten daar `javascript:alert(1)` neer, dan voert een
// klik op "tokens kopen" dat uit. _esc() dekt dat NIET af — die ontsnapt HTML,
// niet het schema van een URL. De toets op https://tikkie.me/ is dus de
// eigenlijke grens, en die hoort een test te hebben die roder wordt als iemand
// hem oprekt.
//
// De tweede helft is net zo belangrijk: leeg hoort GEEN kapot scherm te geven
// maar de bestaande mailknop. Anders is "link even weghalen" een storing.
//
// Draaien vanuit public/:  node test-betaallinks.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── _betaallink() uit de module knippen ───────────────────────────
const bron = fs.readFileSync(__dirname + '/pidlane-klant.js', 'utf8');
const van = bron.indexOf('function _betaallink(');
if (van < 0) {
  console.error('FOUT: _betaallink() niet gevonden in pidlane-klant.js.');
  process.exit(1);
}
const tot = bron.indexOf('\n  }', van) + 4;
const maak = new Function('window', bron.slice(van, tot) + '\nreturn _betaallink;');

function link(waarde) {
  const w = { PID_CONFIG: waarde === undefined ? {} : { tikkie_kopen: waarde } };
  return maak(w)('tikkie_kopen');
}

console.log('\n1. Een echte Tikkie-link komt erdoor');
toets('gewone link', link('https://tikkie.me/pay/vtvn3r3neuqj16r3429n')
      === 'https://tikkie.me/pay/vtvn3r3neuqj16r3429n');
toets('met spaties eromheen', link('  https://tikkie.me/pay/abc  ') === 'https://tikkie.me/pay/abc');

console.log('\n2. Leeg geeft leeg — en dus de mailknop, geen kapot scherm');
toets('sleutel ontbreekt', link(undefined) === '');
toets('lege string', link('') === '');
toets('alleen spaties', link('   ') === '');
toets('null', link(null) === '');
toets('geen PID_CONFIG', maak({})('tikkie_kopen') === '');

console.log('\n3. DE GRENS — wat er niet in een href mag belanden');
// Dit is de tegenproef. Rekt iemand de toets op tot bijvoorbeeld /tikkie\.me/
// of laat hij het schema los, dan komt een van deze regels erdoor en wordt de
// test rood. Zonder deze regels is de toets een gebaar.
const kwaad = [
  ['javascript:',            'javascript:alert(1)'],
  ['javascript met opmaak',  'javascript:alert(1)//https://tikkie.me/'],
  ['data-URL',               'data:text/html,<script>alert(1)</script>'],
  ['http in plaats van https', 'http://tikkie.me/pay/abc'],
  ['lookalike-domein',       'https://tikkie.me.kwaadaardig.nl/pay/abc'],
  ['subdomeintruc',          'https://nottikkie.me/pay/abc'],
  ['host in de padnaam',     'https://kwaad.nl/https://tikkie.me/pay/abc'],
  ['gebruikersnaam-truc',    'https://tikkie.me@kwaad.nl/pay'],
  ['aanhalingsteken erin',   'https://tikkie.me/pay/a" onclick="alert(1)'],
  ['spatie plus tweede url', 'https://tikkie.me/pay/a https://kwaad.nl'],
  ['protocol-relatief',      '//tikkie.me/pay/abc'],
  ['hoofdletterschema',      'JAVASCRIPT:alert(1)']
];
for (const [naam, waarde] of kwaad) {
  toets('geweigerd: ' + naam, link(waarde) === '', 'liet door: ' + JSON.stringify(link(waarde)));
}

console.log('\n4. De links staan niet meer in de broncode');
// Het punt van #24. Een hardcoded tikkie.me-URL in public/ betekent dat de
// waarde weer buiten de config om gaat, en dan is dit alles voor niets.
const bestanden = fs.readdirSync(__dirname).filter(f => /\.(js|html)$/.test(f) && !/^test-/.test(f));
const gevonden = [];
for (const f of bestanden) {
  const t = fs.readFileSync(__dirname + '/' + f, 'utf8');
  // Een echte link, niet de regexp die hem toetst of een voorbeeld in een tekst.
  const m = t.match(/https:\/\/tikkie\.me\/pay\/[A-Za-z0-9]{8,}/g);
  if (m) gevonden.push(f + ': ' + m[0]);
}
toets('geen echte Tikkie-link in public/', gevonden.length === 0, gevonden.join('; '));

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
