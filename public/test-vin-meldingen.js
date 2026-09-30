// ══════════════════════════════════════════════════════════════════
// test-vin-meldingen.js — geen melding over het voertuigprofiel draagt de VIN
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Op 30-09-2026 stond in een gedeeld logboek:
//
//   [BT] [WARN] Geen profiel onder pl_vinprof_JMZ…(voluit) — volle discovery
//
// De opslagsleutel van het voertuigprofiel bevat de ruwe VIN, en vier
// btDiag-meldingen zetten die sleutel erin. #102 had de log()-regels
// gemaskeerd; deze vielen erbuiten. De BT-log komt in het logboek dat je
// deelt, in de live-log op schijf en in het testrunverslag — dus de VIN ging
// de telefoon uit, en dat is de regel die niet buigt (CLAUDE.md, Privacy).
//
// Deze test knipt het profielstuk uit pidlane-pids.js en voert elk pad uit
// dat een melding geeft: geen profiel, een profiel zonder PIDs, een kapot
// profiel, en opslag die stil weigert. Geen enkele melding mag de VIN
// bevatten, in welke hoofdletters ook.
//
// Draaien vanuit public/:  node test-vin-meldingen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-pids.js'), 'utf8');
const van = bron.indexOf('function vinProfileKey(vin)');
const tot = bron.indexOf('\n}\n', bron.indexOf('function applyVinProfileIfKnown(vin)'));
if (van < 0 || tot < 0) {
  console.error('FOUT: het profielstuk van pidlane-pids.js is niet gevonden (vinProfileKey … applyVinProfileIfKnown).');
  process.exit(1);
}
const stuk = bron.slice(van, tot + 3);

const VIN = 'JMZKF6W7600766507';

function draai(opslag, faalSchrijven) {
  const meldingen = [];
  const s = {
    console: { warn() {}, log() {} }, JSON, Object, String, Date, Set, Promise,
    btDiag: (m) => meldingen.push(String(m)),
    log: (m) => meldingen.push(String(m)),
    supportedPIDs: new Set(['010C']),
    vehicleInfo: { merk: 'Mazda', model: 'CX-5' },
    _pidHealth: null,
    _plVinVoorLog: async () => 'JMZ:92be076377a1a6bb',
    localStorage: {
      getItem: (k) => (faalSchrijven ? null : (Object.prototype.hasOwnProperty.call(opslag, k) ? opslag[k] : null)),
      setItem: (k, v) => { if (!faalSchrijven) opslag[k] = v; }
    }
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(stuk + '\nthis.__api = { vinProfileKey, saveVinProfile, applyVinProfileIfKnown };', s);
  return { api: s.__api, meldingen };
}

(async () => {
  const key = 'pl_vinprof_' + VIN;
  const gevallen = [
    ['geen profiel', {}, false, (a) => a.applyVinProfileIfKnown(VIN)],
    ['een profiel zonder PIDs', { [key]: JSON.stringify({ pids: [] }) }, false, (a) => a.applyVinProfileIfKnown(VIN)],
    ['een kapot profiel', { [key]: '{kapot' }, false, (a) => a.applyVinProfileIfKnown(VIN)],
    ['opslag die stil weigert', {}, true, (a) => a.saveVinProfile(VIN)],
    ['een geslaagde opslag en lading', {}, false, async (a) => { await a.saveVinProfile(VIN); a.applyVinProfileIfKnown(VIN); }]
  ];
  for (const [naam, opslag, faal, doe] of gevallen) {
    const r = draai(opslag, faal);
    await doe(r.api);
    const alles = r.meldingen.join(' | ');
    eis(r.meldingen.length > 0, naam + ': er is een melding (' + r.meldingen.length + ')');
    eis(alles.toUpperCase().indexOf(VIN) < 0, naam + ': geen melding bevat de VIN' + (alles.toUpperCase().indexOf(VIN) >= 0 ? ' — ' + alles : ''));
  }
  // De melding moet nog wel zeggen WELK voertuig: de staart, zoals overal.
  const r = draai({}, false);
  r.api.applyVinProfileIfKnown(VIN);
  eis(/…766507/.test(r.meldingen.join(' ')), 'de melding noemt de staart …766507, zodat hij nog te volgen is');
  // En de sleutel zelf blijft wat hij was: daar staat opgeslagen data onder.
  eis(r.api.vinProfileKey(VIN.toLowerCase()) === key, 'de opslagsleutel is ongewijzigd (bestaande profielen blijven vindbaar)');

  if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
  console.log('Alles goed — geen profielmelding draagt de VIN');
})();
