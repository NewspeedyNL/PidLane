// ══════════════════════════════════════════════════════════════════
// test-contact.js — PLContact: contact uit is geen storing (13-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE pidlane-contact.js met vm, en knipt plStilteStand en
// plStilteTerug uit pidlane-plload.js. De reeks hieronder komt uit het
// logboek van 13-10-2026 23:20 (Mazda CX-5, OBDLink MX+).
//
// WAT HIER ROOD HOORT TE WORDEN
//   • één NO DATA, of een hik van een halve seconde, heet al "stil";
//   • NO DATA van een PID die de auto niet heeft telt mee (dan heet elke
//     auto met een paar ontbrekende sensoren na zes rondes "contact uit");
//   • een leeg antwoord (adapter weg) telt als stille ECU;
//   • een stilte bij 80 km/u heet contact uit in plaats van storing;
//   • de busstand van vóór de stilte komt niet terug, of wordt opgevraagd
//   bij het laatste stille antwoord in plaats van het eerste;
//   • een 41-payload maakt de stilte niet af.
//
// Draaien vanuit public/:  node test-contact.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-contact.js'), 'utf8'), ctx, { filename: 'pidlane-contact.js' });
const C = ctx.window.PLContact;
if (!C || !C._kern) { console.log('FOUT PLContact niet gevonden'); process.exit(1); }
const K = C._kern, CFG = C.cfg;

/* Een nep-omgeving: de klok loopt met de hand, de stand is een teller zodat
   te zien is wélke opvraging terugkwam. */
function omg(o) {
  o = o || {};
  const e = { t: 0, standen: 0, terug: [], meld: [], weer: [],
    kortOk: o.kortOk || (() => true),
    laatst: o.laatst || { rpm: 664, kmh: 0, volt: 14.1 } };
  e.api = K.maak({
    nu: () => e.t,
    kortOk: p => e.kortOk(p),
    stand: () => ({ nr: ++e.standen }),
    laatst: () => e.laatst,
    terug: s => e.terug.push(s),
    meld: (soort, l) => e.meld.push(soort),
    weer: (soort, duur) => e.weer.push(duur)
  });
  return e;
}
function stil(e, n, stapMs, cmd) { for (let i = 0; i < n; i++) { e.api.noteAntwoord(cmd || '010C0D492', 'NO DATA'); e.t += stapMs; } }

console.log('\n1. Het logboek van 13-10 23:20');
{
  const e = omg();
  // Laatste antwoord met data: 664 tpm, 0 km/u.
  e.api.noteAntwoord('010C0D492', '008 0:410C0A620D00 1:49270000000000');
  // Daarna wat de app echt vroeg, elk ±230 ms uit elkaar.
  const reeks = ['010443062', '0107344C2', '01471C511', '010C', '010D1', '0149', '01041', '0143', '0106'];
  for (const c of reeks) { e.api.noteAntwoord(c, 'NO DATA'); e.t += 230; }
  toets('na de reeks is het stil', e.api.stil());
  toets('oordeel: contact uit (0 km/u)', e.meld[0] === 'contact_uit', 'meld: ' + JSON.stringify(e.meld));
  toets('één melding, niet bij elk volgend antwoord', e.meld.length === 1, 'meld: ' + e.meld.length);
  toets('de stand van het EERSTE stille antwoord komt terug', e.terug.length === 1 && e.terug[0].nr === 1,
    'terug: ' + JSON.stringify(e.terug));
  e.t += 60000;
  e.api.noteAntwoord('010C1', '410C0BB8');
  toets('een 41-payload maakt de stilte af', !e.api.stil());
  toets('en meldt hoe lang het stil was', e.weer.length === 1 && e.weer[0] > 60000, 'weer: ' + JSON.stringify(e.weer));
}

console.log('\n2. Een hik is geen contact uit');
{
  const e = omg();
  stil(e, CFG.reeks - 1, 300);
  e.api.noteAntwoord('010C0D492', '41 0C 0B B8 41 0D 00');   // met spaties: ook data
  stil(e, CFG.reeks - 1, 300);
  toets('twee keer net te weinig stille antwoorden is niet stil', !e.api.stil() && e.meld.length === 0);
  const f = omg();
  stil(f, CFG.reeks + 4, 50);   // genoeg antwoorden, maar in een halve seconde
  toets('genoeg antwoorden binnen minMs is niet stil', !f.api.stil(), 'reeks over ' + f.t + ' ms');
  f.t += CFG.minMs;
  f.api.noteAntwoord('010C1', 'NO DATA');
  toets('...en wel zodra minMs voorbij is', f.api.stil());
}

console.log('\n3. Wat niet meetelt');
{
  const e = omg({ kortOk: p => p === '010C' });
  stil(e, 20, 300, '015E1');   // brandstofdebiet: deze auto heeft hem niet
  toets('NO DATA van een PID die nooit antwoordde telt niet', !e.api.stil() && e.standen === 0);
  stil(e, CFG.reeks, 300, '010C015E2'.slice(0, 7));   // '010C5E2' bevat 010C
  toets('een verzoek met een PID die wél antwoordde telt', e.api.stil());

  const f = omg();
  for (let i = 0; i < 20; i++) { f.api.noteAntwoord('010C1', ''); f.t += 300; }
  toets('een leeg antwoord (adapter weg) telt niet als stille ECU', !f.api.stil() && f.standen === 0);
}

console.log('\n4. Het oordeel');
toets('80 km/u en dan stil: storing', K.oordeel({ rpm: 2100, kmh: 80 }) === 'storing');
toets('net onder rijdtKmh: contact uit', K.oordeel({ rpm: 700, kmh: CFG.rijdtKmh - 1 }) === 'contact_uit');
toets('geen snelheid, motor al uit: contact uit', K.oordeel({ rpm: 0, kmh: null }) === 'contact_uit');
toets('geen snelheid, motor draait: onbekend', K.oordeel({ rpm: 800 }) === 'onbekend');
toets('niets bekend: onbekend', K.oordeel(null) === 'onbekend');
toets('pidsUit leest het antwoordcijfer niet als PID',
  JSON.stringify(K.pidsUit('010C0D492')) === '["010C","010D","0149"]' && JSON.stringify(K.pidsUit('010C1')) === '["010C"]',
  JSON.stringify(K.pidsUit('010C0D492')));
toets('pidsUit negeert AT-commando’s', K.pidsUit('ATST32').length === 0);

console.log('\n5. plStilteStand en plStilteTerug uit pidlane-plload.js');
{
  const src = fs.readFileSync(path.join(__dirname, 'pidlane-plload.js'), 'utf8');
  const a = src.indexOf('function plStilteStand(){'), b = src.indexOf('function _plNoteVerbind(mist){');
  if (a < 0 || b < 0 || b < a) { console.log('  FOUT  anker plStilteStand/_plNoteVerbind niet gevonden'); process.exit(1); }
  const S = { groep: 3, vast: false, zet: [] }, L = { _mult: 1.0 }, V = { st: '1C', terug: [] };
  const w = { _batchSupported: true };
  const mk = new Function('PLBus', 'PLLoad', 'window', '_noDataStreak', '_streakSince',
    'let _batchDips=0, _batchOffSince=0;\n' + src.slice(a, b) +
    '\nreturn { stand: plStilteStand, terug: plStilteTerug, dips: () => _batchDips, uit: () => _batchOffSince };');
  w.PLVerbind = { nu: () => ({ st: V.st }), stTerug: h => { V.terug.push(h); V.st = h; } };
  const streak = { '010C': 0, '0104': 0 }, sinds = {};
  const f = mk({ batchGroep: () => S.groep, batchVast: () => S.vast, batchZet: (g, v) => { S.zet.push(g); S.groep = g; } },
    L, w, streak, sinds);
  const snap = f.stand();
  // Wat de app op 13-10 in die eerste seconde deed:
  S.groep = 1; w._batchSupported = false; L._mult = 1.35; V.st = '32'; streak['010C'] = 4; sinds['010C'] = 123;
  f.terug(snap);
  toets('de groep gaat terug naar 3', S.groep === 3 && S.zet.length === 1);
  toets('multi-PID gaat weer aan', w._batchSupported === true);
  toets('het pollbudget gaat terug', L._mult === 1.0);
  toets('de ATST gaat terug naar 0x1C', V.terug[0] === '1C', 'stTerug: ' + JSON.stringify(V.terug));
  toets('de NO DATA-reeksen per PID zijn leeg', streak['010C'] === 0 && !('010C' in sinds));
  S.vast = true; S.zet = []; S.groep = 5;
  f.terug(Object.assign({}, snap, { vast: true }));
  toets('een met de hand vastgezette groep blijft staan', S.groep === 5 && S.zet.length === 0);
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
