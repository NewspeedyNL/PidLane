// ══════════════════════════════════════════════════════════════════
// test-afsluiten.js — toetst pidlane-afsluiten.js (PLAfsluiten, "Rit beëindigen")
// ──────────────────────────────────────────────────────────────────
// De module wordt met vm geladen; de app eromheen (handleConnect, logout,
// plSluitApp, PLGarage) is nagebootst, zodat de VOLGORDE te zien is.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • de verbinding die weg is vóór de rit af is (dan parkeert de garage
//     hem als "verbinding weg" in plaats van hem af te sluiten);
//   • de app die dicht gaat vóór er uitgelogd is;
//   • "App sluiten" in de browser, waar afsluiten niet bestaat;
//   • na "App sluiten" geen automatisch verbinden meer de volgende keer;
//   • na een mislukte exitApp() alsnog automatisch verbinden terwijl je
//     net losmaakte;
//   • een adapter of server die niet antwoordt en het venster vasthoudt.
//
// Draaien vanuit public/:  node test-afsluiten.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

function laad(o) {
  o = o || {};
  const opslag = Object.assign({}, o.opslag || {});
  const volgorde = [];
  const s = {
    console: { log() { }, warn() { }, error() { } },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() { } }, body: { appendChild() { } } },
    // Snelle klok: een stap die hangt, geeft na 5 ms op in plaats van na vier seconden.
    setTimeout: (f) => setTimeout(f, 5),
    Promise, JSON, Math, Date,
    connected: o.verbonden !== false,
    currentUser: { user: 'anna@voorbeeld.nl', role: 'klant' },
    handleConnect: () => {
      volgorde.push('verbreek');
      delete opslag.pl_autoconn;                      // zoals de echte: bewust verbroken
      s.connected = false;
      return o.hangt === 'verbreek' ? new Promise(() => { }) : Promise.resolve();
    },
    logout: () => { volgorde.push('uitlog'); delete opslag.pl_autoconn; s.currentUser = null; return Promise.resolve(); },
    plSluitApp: () => { volgorde.push('sluit'); return Promise.resolve(o.sluitLukt !== false); },
    PLGarage: { ritBeeindig: (l) => { volgorde.push('rit:' + (l || '')); return o.hangt === 'rit' ? new Promise(() => { }) : Promise.resolve({ km: 3 }); } }
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-afsluiten.js', 'utf8'), s, { filename: 'pidlane-afsluiten.js' });
  return { K: s.PLAfsluiten._kern, s, opslag, volgorde };
}

// Een stap die nooit terugkomt laat node stil stoppen, met exit 0 en zonder
// dat de laatste regel gedrukt is. Dat mag geen groen zijn.
let klaar = false;
process.on('exit', function (c) {
  if (!klaar && c === 0) { console.log('\n  FOUT de test liep niet af — een stap bleef hangen'); process.exitCode = 1; }
});

(async function () {
  const { K } = laad();
  const alles = { verbonden: true, rit: true, schil: true, ingelogd: true };

  console.log('\n1. Welke keuzes er zijn');
  let o = K.opties(alles);
  eis(o.na.join(',') === 'blijf,verbreek,sluit' && o.standaard === 'verbreek', 'in de APK, verbonden: blijven, verbreken, app sluiten — standaard verbreken', JSON.stringify(o));
  o = K.opties({ verbonden: true, schil: false, ingelogd: true });
  eis(o.na.indexOf('sluit') < 0, 'in de browser geen "App sluiten": daar bestaat afsluiten niet');
  o = K.opties({ verbonden: false, schil: false, ingelogd: true });
  eis(o.na.join(',') === 'blijf' && o.uitloggen, 'niet verbonden in de browser: alleen blijven, en uitloggen kan');
  o = K.opties({ verbonden: false, schil: true, ingelogd: false });
  eis(!o.uitloggen, 'niet ingelogd: geen uitlogkeuze');

  console.log('\n2. De volgorde');
  eis(K.plan({ na: 'sluit', uitloggen: true }, alles).join(',') === 'rit,verbreek,uitlog,sluit', 'alles: rit, verbreken, uitloggen, dan pas sluiten', K.plan({ na: 'sluit', uitloggen: true }, alles).join(','));
  eis(K.plan({ na: 'blijf' }, alles).join(',') === 'rit', 'verbonden blijven: alleen de rit');
  eis(K.plan({ na: 'verbreek' }, alles).join(',') === 'rit,verbreek', 'verbreken: eerst de rit, dan de verbinding');
  eis(K.plan({ na: 'sluit' }, Object.assign({}, alles, { schil: false })).indexOf('sluit') < 0, 'in de browser nooit sluiten, ook niet als dat gekozen was');
  eis(K.plan({ na: 'blijf', uitloggen: true }, alles).join(',') === 'rit,verbreek,uitlog', 'uitloggen verbreekt ook als "verbonden blijven" gekozen was');
  eis(K.plan({ na: 'verbreek' }, Object.assign({}, alles, { verbonden: false, rit: false })).length === 0, 'niets te verbreken en geen rit: niets te doen');

  console.log('\n3. Automatisch verbinden na afsluiten');
  eis(K.autoconnTerug(['rit', 'verbreek', 'sluit'], '1') === true, 'app sluiten zonder uitloggen: de vlag komt terug');
  eis(K.autoconnTerug(['rit', 'verbreek', 'uitlog', 'sluit'], '1') === false, 'met uitloggen niet: gedeeld toestel');
  eis(K.autoconnTerug(['rit', 'verbreek'], '1') === false, 'in de app blijven: niet, anders verbindt hij meteen weer');
  eis(K.autoconnTerug(['rit', 'verbreek', 'sluit'], null) === false, 'stond hij uit, dan blijft hij uit');

  console.log('\n4. Uitvoeren');
  {
    const L = laad({ opslag: { pl_autoconn: '1' } });
    const gedaan = await L.K.voerUit(['rit', 'verbreek', 'sluit'], 'Naar de bakker');
    eis(L.volgorde.join(',') === 'rit:Naar de bakker,verbreek,sluit', 'de rit gaat met naam af vóór de verbinding weg is', L.volgorde.join(','));
    eis(L.opslag.pl_autoconn === '1', 'na "App sluiten" verbindt de app de volgende keer weer vanzelf');
    eis(gedaan.join(',') === 'rit,verbreek,sluit', 'en het verslag zegt wat er gebeurde', gedaan.join(','));
  }
  {
    const L = laad({ opslag: { pl_autoconn: '1' }, sluitLukt: false });
    const gedaan = await L.K.voerUit(['rit', 'verbreek', 'sluit'], '');
    eis(!('pl_autoconn' in L.opslag), 'ging de app niet dicht, dan verbindt hij ook niet vanzelf weer');
    eis(gedaan.indexOf('sluit mislukt') >= 0, 'en dat staat in het verslag', gedaan.join(','));
  }
  {
    const L = laad({ opslag: { pl_autoconn: '1' } });
    await L.K.voerUit(['rit', 'verbreek', 'uitlog', 'sluit'], '');
    eis(L.volgorde.join(',') === 'rit:,verbreek,uitlog,sluit' && !('pl_autoconn' in L.opslag), 'met uitloggen: in volgorde, en de vlag blijft weg', L.volgorde.join(',') + ' / ' + L.opslag.pl_autoconn);
  }
  {
    const L = laad({ hangt: 'verbreek' });
    const t = Date.now();
    await L.K.voerUit(['rit', 'verbreek', 'sluit'], '');
    eis(L.volgorde.join(',') === 'rit:,verbreek,sluit' && Date.now() - t < 1000, 'een adapter die niet antwoordt houdt het afsluiten niet tegen', L.volgorde.join(','));
  }
  {
    const L = laad({ hangt: 'rit' });
    await L.K.voerUit(['rit', 'verbreek'], '');
    eis(L.volgorde.join(',') === 'rit:,verbreek', 'een server die niet antwoordt ook niet (de rit staat dan in de wachtrij)');
  }
  eis(K.cfg.stapMs <= 5000, 'een stap duurt hoogstens vijf seconden', String(K.cfg.stapMs));

  klaar = true;
  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})();
