// ══════════════════════════════════════════════════════════════════
// test-logschema.js — staat de D1-logtabel nog gelijk aan wat de app
//                     verstuurt? (#262)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT.
//
// Sinds de logtabel van Airtable naar D1 ging, staat dezelfde lijst
// veldnamen op twee plekken: in schema.sql en in de code die de regels
// bouwt (logToSheets() in pidlane-auth.js). Twee lijsten van hetzelfde
// lopen uit de pas — dat is in dit project de fout die PIDLANE-WERK.md
// en §11 de kop kostte, en bij een logtabel merk je het pas als een
// kolom die je nodig hebt leeg blijkt te zijn.
//
// Airtable maakte een onbekend veld vanzelf aan; SQLite niet. Een veld
// erbij zetten in de app zonder kolom in D1 betekent dus stil verlies
// naar de `onbekend`-kolom. Deze test maakt dat luidruchtig.
//
// WAT HIJ TOETST: geen van beide lijsten wordt hier overgeschreven.
// AT_KOLOMMEN en het _atBuffer.push()-blok worden met een anker uit de
// échte bron geknipt, en het schema wordt écht uitgevoerd in SQLite.
// Verdwijnt een anker, dan stopt de test in plaats van groen te blijven
// op code die niet meer draait.
//
// Draaien vanuit public/:  node test-logschema.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const wortel = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(__dirname, 'pidlane-auth.js'), 'utf8');
const schemaTekst = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');

// ── 1. de velden die de app stuurt, uit de bron geknipt ────────────
const mSet = auth.match(/const AT_KOLOMMEN = new Set\(\[([\s\S]*?)\]\)/);
if (!mSet) {
  console.error('FOUT: AT_KOLOMMEN is niet gevonden in pidlane-auth.js — hernoemd of weg.');
  process.exit(1);
}
const extra = (mSet[1].match(/'([A-Za-z]+)'/g) || []).map((s) => s.replace(/'/g, ''));

const p = auth.indexOf('_atBuffer.push({');
if (p < 0) {
  console.error('FOUT: het _atBuffer.push()-blok is niet gevonden — logToSheets() is verbouwd.');
  process.exit(1);
}
const blok = auth.slice(p, auth.indexOf('});', p));
const vast = [...blok.matchAll(/^\s{8}([A-Za-z]+):/gm)].map((x) => x[1]);

toets('AT_KOLOMMEN levert velden op', extra.length > 5, 'kreeg er ' + extra.length);
toets('het vaste blok levert velden op', vast.length > 5, 'kreeg er ' + vast.length);

const appVelden = [...new Set([...vast, ...extra])].sort();

// ── 2. het schema echt uitvoeren, niet lezen ───────────────────────
const db = new DatabaseSync(':memory:');
// NIET onafgevangen laten klappen. Een schema dat niet uitvoert is een
// bevinding en hoort als bevinding te lezen — een stacktrace boven de eerste
// toets vertelt je alleen dát er iets stuk is, niet wat. Nagemeten: haal je
// de kolom Outcome weg, dan valt de partiële index erover en verdween de
// regel die zegt dat de app dat veld wél stuurt.
let kolommen = [];
try {
  db.exec(schemaTekst);
  kolommen = db.prepare("SELECT name FROM pragma_table_info('logregels')").all().map((r) => r.name);
} catch (e) {
  toets('schema.sql voert uit', false, 'SQLite weigert het schema: ' + ((e && e.message) || e));
}

toets('schema.sql maakt de tabel logregels aan', kolommen.length > 0,
  'geen kolommen gevonden — heet de tabel nog logregels?');

// `id`, `ontvangen` en `onbekend` zijn van de Worker, niet van de app.
const EIGEN = new Set(['id', 'ontvangen', 'onbekend']);

const mist = appVelden.filter((k) => !kolommen.includes(k));
toets('elk veld dat de app stuurt heeft een kolom', mist.length === 0,
  'zonder kolom belandt dit stil in `onbekend`: ' + mist.join(', '));

const teveel = kolommen.filter((k) => !EIGEN.has(k) && !appVelden.includes(k));
toets('geen kolom die door niemand gevuld wordt', teveel.length === 0,
  'niets in de app schrijft hier ooit iets in: ' + teveel.join(', '));

// ── 3. de vangnetkolom moet er zijn ────────────────────────────────
// Zonder `onbekend` is een veld dat hier nog niet bekend is gewoon weg,
// en dan is bovenstaande toets de enige die het ooit had kunnen zien.
toets('de vangnetkolom `onbekend` bestaat', kolommen.includes('onbekend'),
  'zonder die kolom raakt een nieuw veld stil verloren');

// ── 4. een echte regel moet erin en er weer uit kunnen ─────────────
// Het schema kan kloppen en tóch niet werken: een verkeerd type of een
// NOT NULL op een veld dat de app leeg laat valt pas hier om.
const rij = {
  Timestamp: '2026-09-20T19:57:11.000Z', Type: 'opvallend',
  Message: 'opdracht MAF stationair — uitkomst: bevinding',
  RecordType: 'testrun', SessionId: '2026-09-20-2157-1',
  Outcome: 'bevinding', Repro: '#232', Demo: 0
};
const kol = Object.keys(rij);
db.prepare('INSERT INTO logregels (ontvangen,' + kol.join(',') + ') VALUES (?,' +
  kol.map(() => '?').join(',') + ')').run(new Date().toISOString(), ...kol.map((k) => rij[k]));

const terug = db.prepare('SELECT SessionId, Outcome, Repro FROM logregels WHERE Outcome IS NOT NULL').get();
toets('een testrunregel gaat erin en komt er gelijk weer uit',
  terug && terug.SessionId === rij.SessionId && terug.Outcome === 'bevinding' && terug.Repro === '#232',
  'kreeg terug: ' + JSON.stringify(terug));

// ── 5. de indexen die de leesvragen dragen ─────────────────────────
const idx = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='logregels'").all().map((r) => r.name);
['idx_log_sessie', 'idx_log_ontvangen', 'idx_log_soort', 'idx_log_outcome'].forEach(function (naam) {
  toets('index ' + naam + ' staat er', idx.includes(naam),
    'zonder deze index wordt de vraag die hij draagt een volledige tabelscan');
});

// ── 6. de meetopdrachten en de afgeleide views ─────────────────────
// De opdrachttabel stond tot #262 in dezelfde volle Airtable-base als de log,
// en lag daardoor tegelijk plat. Staat hij er niet, dan kan de app geen
// opdracht meer ophalen en is de lus van #241 alsnog doorgeknipt.
const opdrachtKol = db.prepare("SELECT name FROM pragma_table_info('meetopdrachten')").all().map((r) => r.name);
['Naam', 'Reden', 'Actief', 'Gewijzigd', 'Opdracht'].forEach(function (k) {
  toets('meetopdrachten heeft de kolom ' + k, opdrachtKol.indexOf(k) >= 0,
    'handleOpdracht() leest dit veld; zonder kolom komt er niets terug');
});

// De views bewaren niets en kunnen dus niet uit de pas lopen met de regels
// eronder. Dat is precies waarom ze views zijn en geen tweede tabel — maar
// dan moeten ze er wel zijn, en moeten ze rekenen wat ze beloven.
db.prepare('INSERT INTO logregels (ontvangen,Type,Message,SessionId,Outcome,Repro) VALUES (?,?,?,?,?,?)')
  .run('2026-09-20T10:00:00Z', 'error', 'stuk', 'rit-X', null, null);
db.prepare('INSERT INTO logregels (ontvangen,Type,Message,SessionId,Outcome,Repro) VALUES (?,?,?,?,?,?)')
  .run('2026-09-20T10:01:00Z', 'info', 'gewoon', 'rit-X', 'gesloten', '#217');

const sess = db.prepare("SELECT * FROM sessies WHERE SessionId='rit-X'").get();
toets('de view sessies vat een rit samen',
  sess && sess.regels === 2 && sess.fouten === 1 && sess.uitkomsten === 1,
  JSON.stringify(sess));
toets('en noemt de issues die een antwoord kregen', sess && sess.issues === '#217',
  JSON.stringify(sess && sess.issues));

// Onderscheidend maken in plaats van tellen: een getal hangt af van wat er
// eerder in deze test is ingevoegd, en dan meet je je eigen opstelling.
db.prepare('INSERT INTO logregels (ontvangen,Type,Message,SessionId) VALUES (?,?,?,?)')
  .run('2026-09-20T10:02:00Z', 'info', 'niets aan de hand', 'rit-X');
const bevMsg = db.prepare('SELECT Message FROM bevindingen').all().map((r) => r.Message);
toets('een gewone info-regel zonder uitkomst valt buiten bevindingen',
  bevMsg.indexOf('niets aan de hand') < 0, JSON.stringify(bevMsg));
toets('maar een fout staat er wél in', bevMsg.indexOf('stuk') >= 0, JSON.stringify(bevMsg));
toets('en een info-regel mét een uitkomst ook — die is het antwoord op een issue',
  bevMsg.indexOf('gewoon') >= 0, JSON.stringify(bevMsg));

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
