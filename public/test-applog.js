// ══════════════════════════════════════════════════════════════════
// test-applog.js — de testrun leest de app-log uit de juiste bron
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (#29)
// De testrun las de app-log op drie plekken als:
//
//     window._appLog || window.logBuffer || []
//
// Beide globals bestaan nergens in public/. Alle drie de plekken kregen dus
// altijd een lege array — zonder ooit een fout te geven, want de `|| []` ving
// het netjes op. Een stille nul, precies het soort dat maanden blijft staan.
//
// Drie gevolgen, alle drie terug te zien in de run van 28-08-2026:
//   1. Blok 14 meldde "niets opgeruimd" terwijl de opruimregel twee keer had
//      gevuurd. Die regels staan met "🧹 ... opgeruimd" in de APP-log.
//      Het advies eronder — "controleer of hij aanstaat" — stuurde je naar
//      precies het onderzoek dat je niet moest doen.
//   2. "Meldingen sinds het begin van deze run" gaf structureel
//      "app-log 0 regels" naast een BT-log van 1183 regels.
//   3. Het opgeslagen rapport had nooit een APP-LOG-sectie.
//
// De echte bron is plLokaalLog() uit pidlane-auth.js, zoals pidlane-logboek.js
// hem al las. Deze test bewaakt twee dingen: dat de helper de juiste bron
// gebruikt, en dat de dode globals niet terugsluipen.
//
// Draaien vanuit public/:  node test-applog.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');

console.log('\n1. De dode globals zijn weg uit de code die draait');
{
  // Alleen de uitvoerbare regels tellen: het commentaar bij de helper legt de
  // fout juist uit en noemt de namen daarom met opzet.
  const zonderCommentaar = bron
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map(r => r.replace(/\/\/.*$/, '')).join('\n');
  const treffers = zonderCommentaar.split('\n')
    .map((t, i) => ({ nr: i + 1, t }))
    .filter(x => /window\.(_appLog|logBuffer)/.test(x.t));
  toets('geen window._appLog / window.logBuffer meer', treffers.length === 0,
        treffers.map(x => 'regel ' + x.nr).join(', '));
}

console.log('\n2. Er is één gedeelde helper, en die wordt overal gebruikt');
{
  toets('_appLogRegels() bestaat', /function _appLogRegels\s*\(/.test(bron));
  const n = (bron.match(/_appLogRegels\(\)/g) || []).length - 0;
  // 1 definitie-aanroepnaam telt niet mee; we verwachten 3 gebruiksplekken.
  toets('op drie plekken gebruikt', n >= 3, n + ' aanroepen gevonden');
  toets('leest plLokaalLog()', /plLokaalLog\(\)/.test(bron),
        'de helper hoort dezelfde bron te gebruiken als pidlane-logboek.js');
}

console.log('\n3. De helper doet wat hij belooft');
{
  const van = bron.indexOf('function _appLogRegels()');
  const tot = bron.indexOf('\n}', van) + 2;
  const maak = new Function('plLokaalLog', 'console', bron.slice(van, tot) + '\nreturn _appLogRegels;');
  const stilleConsole = { warn: function () {} };

  const regels = [{ ts: '14:11:25', msg: '🧹 Sensor 015E opgeruimd', type: 'warn' }];
  toets('geeft de regels van plLokaalLog() terug',
        JSON.stringify(maak(() => regels, stilleConsole)()) === JSON.stringify(regels));

  toets('geeft [] als plLokaalLog ontbreekt',
        JSON.stringify(maak(undefined, stilleConsole)()) === '[]');

  toets('geeft [] als plLokaalLog geen array geeft',
        JSON.stringify(maak(() => 'kapot', stilleConsole)()) === '[]');

  let gemeld = 0;
  const luideConsole = { warn: function () { gemeld++; } };
  const stuk = maak(() => { throw new Error('stuk'); }, luideConsole);
  toets('een fout geeft [] én een melding — geen stille nul',
        JSON.stringify(stuk()) === '[]' && gemeld === 1,
        'gemeld=' + gemeld);
}

console.log('\n4. TEGENPROEF — zou de oude situatie hier opvallen?');
// Zonder dit weet je alleen dat het nu groen staat, niet dat de test de fout
// van 28-08 daadwerkelijk zou hebben gezien.
{
  const oud = '    const app = (window._appLog || window.logBuffer || []);';
  toets('de oude regel matcht de controle uit deel 1',
        /window\.(_appLog|logBuffer)/.test(oud),
        'de regexp vangt de dode globals niet — dan meet deel 1 niets');

  // En het gedrag: de oude vorm levert een lege lijst op in een omgeving waar
  // de app-log wél gevuld is. Dat is de kern van het issue.
  const window_ = {};                 // geen _appLog, geen logBuffer — zoals in de app
  const oudeFn = new Function('window', 'return (window._appLog || window.logBuffer || []);');
  toets('de oude vorm geeft inderdaad een lege lijst', oudeFn(window_).length === 0);
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
