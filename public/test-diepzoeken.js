// ══════════════════════════════════════════════════════════════════
// test-diepzoeken.js — gaat de diepe poll door het scanslot? (#191)
// ──────────────────────────────────────────────────────────────────
// DE GEMELDE FOUT, IN ÉÉN ZIN. `deepRefreshPIDs()` pollt 96 PIDs waarvan de
// meeste op een gegeven auto niet bestaan. Die lege antwoorden zijn het
// meetresultaat, maar PLBus.note() telde ze als fout (foutPct → ~100% →
// PLBusGate dicht → waakronde meldt gezonde sensoren als uitgevallen) en
// trackBtQuality() las ze als een dode socket. Uit het gebruik, 11-09-2026:
// *"de dip genereert wel meerdere waarschuwingen in rapporten"*.
//
// De reparatie is niet nieuw: `window._plScanActief` bestaat sinds 04-09 en
// houdt allebei die bewakers stil. Hij was alleen op één plek aangesloten
// (PLKaart) en niet hier.
//
// WAT DEZE TEST BEWAAKT is de KOPPELING, en niet wat het slot van binnen doet
// — dat staat in test-scanslot.js. De vraag hier is smal en precies de vraag
// die fout stond: **gaat de sweep door PLScanSlot, of om het slot heen?**
//
// Dat is een onderscheidende vraag. Een test die alleen kijkt of er 96 PIDs
// gevraagd worden, staat groen in allebei de gevallen — vóór en ná de
// reparatie. Vandaar dat hier geteld wordt WELKE weg elk commando nam.
//
// Draaien vanuit public/:  node test-diepzoeken.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

/* De sandbox. pidlane-rijsituatie.js is echt; alles eromheen is het minimale
   dat hij nodig heeft om te laden en die ene functie te draaien.

   PLScanSlot is hier een SPION en niet de echte module: wat het slot van
   binnen doet heeft zijn eigen test, en door hem hier na te maken is te zien
   of de sweep er werkelijk doorheen gaat in plaats van eromheen. */
function bouw(o) {
  o = o || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.Promise = Promise;
  s.connected = true; s.demoMode = false;
  s.supportedPIDs = new Set();
  s.ALL_PID_DEFS = {}; s.SAE_PID_NAMES = {};
  s.viaSlot = []; s.viaSendCmd = [];
  s.slotNaam = null; s.slotRondes = 0;
  s.btlog = [];
  s.log = function () { }; s.btDiag = function (m, niv) { s.btlog.push({ m: String(m), niveau: niv || 'info' }); };
  s.delay = function () { return Promise.resolve(); };
  s.setTimeout = function (fn) { return setTimeout(fn, 0); };
  /* De twee wegen apart tellen, én de VOLGORDE vasthouden. Alleen tellen is
     te grof: discoverPIDsBitmap() en discoverPIDsDirect() draaien hierboven
     echt (de module overschrijft de stubs met zijn eigen functies) en gebruiken
     sendCmd met recht — die vragen tien bekende PIDs en houden hun gewone
     bescherming. Wat deze test moet zien is dat er ná het openen van het slot
     niets meer omheen gaat. */
  s.slotOpen = false;
  s.omheenNaSlot = [];
  s.sendCmd = function (cmd) {
    s.viaSendCmd.push(cmd);
    if (s.slotOpen) s.omheenNaSlot.push(cmd);
    return Promise.resolve('NO DATA');
  };
  s.buildDiscoveredPIDList = function () { };
  s.discoverPIDsBitmap = function () { return Promise.resolve(); };
  s.discoverPIDsDirect = function () { return Promise.resolve(); };
  s.document = { getElementById() { return null; } };

  if (o.slot !== false) {
    s.PLScanSlot = {
      doe: async function (naam, opties, werk) {
        s.slotNaam = naam; s.slotRondes++; s.slotOpen = true;
        try {
        // Een stuur() die precies doorgeeft wat de echte ook doet: het
        // antwoord van de adapter, en verder niets.
          return await werk(function (cmd) { s.viaSlot.push(cmd); return s.sendCmdEcht(cmd); });
        } finally { s.slotOpen = false; }
      },
      drempels: function () { return {}; }
    };
  }
  // Los gehouden zodat wat DOOR het slot gaat niet ook in viaSendCmd belandt:
  // anders is de twee wegen niet uit elkaar te houden en toetst deze test niets.
  s.sendCmdEcht = function (cmd) { return Promise.resolve(o.antwoord ? o.antwoord(cmd) : 'NO DATA'); };

  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8'),
    s, { filename: 'pidlane-rijsituatie.js' });
  if (typeof s.deepRefreshPIDs !== 'function') { console.error('FOUT: deepRefreshPIDs niet geladen'); process.exit(1); }
  return s;
}

async function main() {

  console.log('\n── de sweep gaat door het scanslot ──');
  {
    const s = bouw();
    await s.deepRefreshPIDs();
    // DIT is de reparatie. Vóór #191 stonden deze 96 in viaSendCmd.
    toets('het slot is één keer gebruikt', s.slotRondes, 1);
    toets('op een naam die in een log iets zegt', s.slotNaam, 'diep zoeken');
    toets('alle 96 PIDs gingen erdoorheen', s.viaSlot.length, 96);
    // De bitmap- en directfase hierboven mogen sendCmd gebruiken: die vragen
    // tien bekende PIDs en hebben het probleem niet. Wat niet mag is dat er
    // tijdens de sweep nog iets om het slot heen gaat.
    toets('en tijdens de sweep ging er niets omheen', s.omheenNaSlot, []);
    toets('de eerste is 0101', s.viaSlot[0], '0101');
    toets('en de laatste 0160', s.viaSlot[95], '0160');
  }

  console.log('\n── wat al bekend is wordt overgeslagen ──');
  {
    const s = bouw();
    s.supportedPIDs.add('0105'); s.supportedPIDs.add('010C');
    await s.deepRefreshPIDs();
    toets('twee minder gevraagd', s.viaSlot.length, 94);
    toets('0105 zat er niet bij', s.viaSlot.indexOf('0105'), -1);
  }

  console.log('\n── een gevonden PID komt in de lijst ──');
  {
    // De reparatie mag de uitkomst niet veranderen: wie antwoordt, telt.
    const s = bouw({ antwoord: function (cmd) { return cmd === '0142' ? '41420C80' : 'NO DATA'; } });
    await s.deepRefreshPIDs();
    toets('0142 is toegevoegd', s.supportedPIDs.has('0142'), true);
    toets('en verder niets', s.supportedPIDs.size, 1);
  }

  console.log('\n── zonder slot draait hij door, maar niet stil ──');
  {
    /* Functionaliteit boven discipline: liever een diepe poll zonder slot dan
       geen diepe poll. Maar dit IS de stand waarin de gemelde dip terugkomt,
       en dan hoort er een waarschuwing te staan in plaats van niets. */
    const s = bouw({ slot: false });
    await s.deepRefreshPIDs();
    const staart = s.viaSendCmd.slice(-96);
    toets('de sweep is toch gedraaid', staart.length, 96);
    toets('en het is echt de sweep', [staart[0], staart[95]], ['0101', '0160']);
    toets('er is geen slot aan te pas gekomen', s.viaSlot.length, 0);
    const w = s.btlog.filter(function (x) { return x.niveau === 'warn'; });
    toets('met een waarschuwing erbij', w.length >= 1, true);
    toets('die het issue noemt', /#191/.test(w.map(function (x) { return x.m; }).join(' ')), true);
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}

main().catch(function (e) { console.error('FOUT: de test zelf klapte —', e); process.exit(1); });
