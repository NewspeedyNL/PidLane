// ══════════════════════════════════════════════════════════════════
// test-klantsporen.js — een verwijderd account neemt zijn logregels en
// veldlabrecords mee (01-10-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Tot 01-10-2026 stond het e-mailadres van een klant als User in elke
// logregel en als Tester in elk veldlabrecord. De nachtelijke opruimer wiste
// Mijn voertuigen en het klantrecord, maar die twee tabellen niet — terwijl
// privacy.html belooft dat het account met bijbehorende gegevens binnen de
// termijn gewist is, en de Play-inzending (§12) "account én gegevens" zegt.
//
// Draait klantSporenWissen() en klantWachtrijOpruimen() uit worker.js op een
// echte SQLite: logregels met de CREATE TABLE uit schema.sql, veldlab_sessies
// via de echte D1-laag (pltest-d1.js). Geen nagebouwde tabellen.
//
// Draaien vanuit public/:  node test-klantsporen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { nieuweD1 } = require('../pltest-d1.js');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok   ' + naam); return; }
  console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : ''));
  fouten++;
}

const wortel = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
function knip(bron, van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden (anker verschoven?)'); process.exit(1); }
  return bron.slice(a, b + tot.length);
}
const blok = knip(src, 'async function klantSporenWissen(db, email) {',
  '__name(klantWachtrijOpruimen, "klantWachtrijOpruimen");', 'klantSporenWissen … klantWachtrijOpruimen');
const schema = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');
const logTabel = knip(schema, 'CREATE TABLE IF NOT EXISTS logregels (', ');', 'logregels in schema.sql');

const ANNA = 'anna@voorbeeld.nl', BOB = 'bob@voorbeeld.nl';

async function opzet() {
  const d = nieuweD1();
  d.db.exec(logTabel);
  const zet = d.db.prepare('INSERT INTO logregels (ontvangen, Message, User) VALUES (?, ?, ?)');
  zet.run('2026-09-01', 'regel van anna', ANNA);
  zet.run('2026-09-01', 'nog een van anna', 'Anna@Voorbeeld.nl');
  zet.run('2026-09-01', 'regel van bob', BOB);
  zet.run('2026-09-01', 'beheer', 'beheer');
  await d.zaai('veldlab', [
    { id: 'recV1', fields: { SessieID: 'VL-1', Tester: ANNA, JSON: '{"tester":"' + ANNA + '"}' } },
    { id: 'recV2', fields: { SessieID: 'VL-2', Tester: '', JSON: '{"errs":["Sessie hersteld: ' + ANNA + '"]}' } },
    { id: 'recV3', fields: { SessieID: 'VL-3', Tester: BOB, JSON: '{}' } }
  ]);
  return d;
}

(async function () {
  console.log('1. klantSporenWissen wist wat bij het adres hoort, en niets anders');
  {
    const d = await opzet();
    const M = new Function('__name', 'kpSchema', 'kpAlleWissen', 'kpKlantId', 'atAlle', 'atWis', 'klantOpruimMoment', 'console',
      blok + '\nreturn { klantSporenWissen, klantWachtrijOpruimen };')(function () {});
    const uit = await M.klantSporenWissen(d.env.LOGDB, ANNA);
    const log = d.db.prepare('SELECT User FROM logregels ORDER BY id').all().map((r) => r.User);
    toets('beide logregels van anna weg, ook met andere hoofdletters', uit.logregels === 2 && log.indexOf(ANNA) < 0 && log.indexOf('Anna@Voorbeeld.nl') < 0, JSON.stringify(log));
    toets('de regels van bob en beheer blijven', log.length === 2 && log.indexOf(BOB) >= 0 && log.indexOf('beheer') >= 0, JSON.stringify(log));
    const vl = d.rijen('veldlab').map((r) => r.SessieID).sort();
    toets('veldlab: haar sessie en die met haar adres in het blob weg, die van bob blijft', uit.veldlab === 2 && vl.join() === 'VL-3', JSON.stringify(vl));
    const leeg = await M.klantSporenWissen(d.env.LOGDB, 'beheer');
    toets('een naam zonder @ wist niets', leeg.logregels === 0 && leeg.veldlab === 0);
  }

  console.log('2. zonder de tabellen maakt de ronde niets aan');
  {
    const d = nieuweD1();
    const M = new Function('__name', blok + '\nreturn { klantSporenWissen };')(function () {});
    const uit = await M.klantSporenWissen(d.env.LOGDB, ANNA);
    const tabellen = d.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    toets('geen fout en niets gewist', uit.logregels === 0 && uit.veldlab === 0);
    toets('er is geen tabel aangemaakt', tabellen.indexOf('logregels') < 0 && tabellen.indexOf('veldlab_sessies') < 0, JSON.stringify(tabellen));
  }

  console.log('3. de opruimronde roept het aan, vóór het account weg is');
  {
    const d = await opzet();
    const volgorde = [];
    const M = new Function('__name', 'kpSchema', 'kpAlleWissen', 'kpKlantId', 'atAlle', 'atWis', 'klantOpruimMoment', 'console',
      blok + '\nreturn { klantWachtrijOpruimen };')(
      function () {},
      async function () {},
      async function () { volgorde.push('platform'); return 0; },
      async function (e) { return 'kid:' + e; },
      async function () { return [{ id: 'recK', fields: { Email: ANNA, Status: 'verwijderd' } }]; },
      async function () { volgorde.push('account (logregels van anna: ' + d.db.prepare('SELECT COUNT(*) AS n FROM logregels WHERE User = ?').get(ANNA).n + ')'); return true; },
      function () { return new Date('2026-01-01'); },
      { log() {}, error() {}, warn() {} });
    const uit = await M.klantWachtrijOpruimen(d.env, new Date('2026-10-01'));
    toets('het account is gewist', uit.verwijderd.indexOf('recK') >= 0, JSON.stringify(uit));
    toets('de logregels waren al weg toen het account gewist werd', volgorde[1] === 'account (logregels van anna: 0)', JSON.stringify(volgorde));
    toets('het resultaat telt de sporen', uit.platform && uit.platform[0].sporen && uit.platform[0].sporen.logregels === 2, JSON.stringify(uit.platform));
  }

  console.log(fouten ? '\n' + fouten + ' fout(en).' : '\nAlles goed.');
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
