// ══════════════════════════════════════════════════════════════════
// test-logvelden.js — wat er in de logtabel terechtkomt (#256)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT.
//
// Sinds #241 is de logtabel geen archief meer maar de bron waarop de volgende
// meetopdracht gebouwd wordt. Wie hem van buiten leest, heeft de app er niet
// omheen staan — en dat legde op 18-09-2026 drie dingen bloot die binnen de
// app niet opvallen:
//
//   1. Blok 5 voedt met opzet 300 °C in om te zien of laag 1 hem tegenhoudt.
//      Die waarde belandde als ECHTE uitschieter in de tabel, op een auto die
//      91–93 °C loopt. `_zonderSporen()` zette er een markering omheen, maar
//      die ging via log(..., 'info') en reisde dus niet mee.
//   2. Dezelfde gebeurtenis kwam twee keer binnen: één keer uit de expliciete
//      logToSheets('outlier', …) en één keer uit de doorgifte in log().
//   3. `RecordType` en `SessionId` werden alleen door de testrun gevuld.
//      Gemeten: 61 rijen in drie dagen zonder sessienummer — de conclusie en
//      het bewijs eronder waren niet aan elkaar te knopen.
//
// DE TOETS DRAAIT OP DE ECHTE FUNCTIES. Ze worden uit pidlane-auth.js
// geknipt met ankers die de test laten stoppen als ze verdwijnen; een kopie
// van de logica zou per definitie niet rood kunnen worden.
//
// Draaien vanuit public/:  node test-logvelden.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

const bron = fs.readFileSync('pidlane-auth.js', 'utf8');

// Een aaneengesloten stuk uit de bron, met ankers die hard stoppen als ze
// niet meer passen. Zo kan deze test niet stil op een verouderde kopie draaien.
function knip(van, tot, waar) {
  const a = bron.indexOf(van);
  if (a === -1) throw new Error('anker weg in pidlane-auth.js (' + waar + '): ' + van.slice(0, 60));
  const b = bron.indexOf(tot, a);
  if (b === -1) throw new Error('eindanker weg in pidlane-auth.js (' + waar + '): ' + tot.slice(0, 60));
  return bron.slice(a, b + tot.length);
}

const stukLog = knip('async function _plVinVoorLog(vin){',
  "}catch(e){ console.warn('Logregel niet in de Airtable-buffer gezet — deze regel gaat niet mee naar Airtable', e); }\n}",
  'logToSheets en zijn helpers');
const stukRegel = knip("function log(msg,type='',opties){",
  "if(type==='warn'&&(msg.includes('buiten')||msg.includes('sprong')||msg.includes('outlier'))) logToSheets('outlier',msg);\n}",
  'log()');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

// De omgeving die logToSheets nodig heeft. Alleen stubs voor wat buiten dit
// bestand woont; de logica zelf komt uit de bron.
function omgeving(opties) {
  opties = opties || {};
  const s = {};
  s.window = s;
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.AIRTABLE_URL = 'https://voorbeeld.invalid/log';
  s.vehicleInfo = { merk: 'Mazda', year: '2018', vin: '' };   // lege VIN: geen pseudoniem nodig
  s.selectedNetwork = { name: 'ISO 15765-4 CAN' };
  s.activePIDs = new Set(['010C']);
  s.APP_VERSION = '3.0.0';
  s.currentUser = { name: 'tester', role: 'admin' };
  s._atBuffer = [];
  s._atTimer = 0;
  s.setTimeout = function () { return 0; };
  s.clearTimeout = function () { };
  s.flushAirtable = function () { };
  s._vlVinPseudoniem = null;
  s.PLAdapter = opties.adapter === null ? null : { adapterNaam: function () { return opties.adapter || 'OBDLink MX+'; } };
  s.PLTestrunLive = opties.rit === undefined ? null : { huidigeRit: function () { return opties.rit; } };
  vm.createContext(s);
  vm.runInContext(stukLog, s, { filename: 'auth-logToSheets' });
  return s;
}

/* log() knipt uit de bron en leunt op de ringbuffer en de logbalk eromheen.
   Die twee horen niet bij wat hier getoetst wordt — de vraag is alleen WAT er
   naar Airtable gaat — dus staan ze hier als stub. `localLog` en de cap-getallen
   komen uit de regels boven de functie en zijn daarom niet mee geknipt. */
function metRegel(s, gestuurd) {
  s.logToSheets = function (t, m) { gestuurd.push(t + ': ' + m); };
  s.liveLogWrite = function () { };
  s.localLog = [];
  s.APPLOG_CAP = 1200; s.APPLOG_KOP = 300; s.APPLOG_STAART = 700;
  s.document = {
    getElementById: function () {
      return { appendChild: function () { }, children: [], removeChild: function () { },
               firstChild: null, scrollHeight: 0, scrollTop: 0 };
    },
    createElement: function () { return { className: '', innerHTML: '' }; }
  };
  vm.runInContext(stukRegel, s, { filename: 'auth-log' });
}

async function eersteRij(s, roep) {
  await roep();
  return (s._atBuffer[0] || {}).fields || {};
}

(async function () {

  console.log('1. elke gewone logregel draagt zijn sessienummer en zijn adapter');
  {
    const s = omgeving({ rit: null });
    const f = await eersteRij(s, function () { return s.logToSheets('connect', 'SPP verbonden: OBDLink MX+ 90011'); });
    eis(typeof f.SessionId === 'string' && f.SessionId.length > 0,
      'SessionId is gevuld (' + f.SessionId + ') — 61 rijen in drie dagen hadden er geen');
    eis(/^app-/.test(f.SessionId), 'zonder lopende testrun is het een app-sessie');
    eis(f.RecordType === 'app', 'RecordType is "app" (' + f.RecordType + ')');
    eis(f.Adapter === 'OBDLink MX+', 'Adapter is gevuld (' + f.Adapter + ') — hij stond in AT_KOLOMMEN en bleef leeg');
  }

  console.log('2. loopt er een testrun, dan staat de logregel onder DAT nummer');
  {
    const s = omgeving({ rit: '2026-09-18-1953' });
    const f = await eersteRij(s, function () { return s.logToSheets('outlier', 'iets opvallends'); });
    eis(f.SessionId === '2026-09-18-1953',
      'de app-regel deelt het ritnummer met de testrun — conclusie en bewijs onder één sessie');
  }

  console.log('3. een sessienummer wordt niet verzonnen als de testrun er geen heeft');
  {
    let aanroepen = 0;
    const s = omgeving({ rit: null });
    s.PLTestrunLive = { huidigeRit: function () { aanroepen++; return null; },
                        ritId: function () { throw new Error('ritId() mag hier NIET aangeroepen worden — die maakt een nummer aan'); } };
    const f = await eersteRij(s, function () { return s.logToSheets('info', 'gewone regel'); });
    eis(aanroepen === 1, 'huidigeRit() is gevraagd');
    eis(/^app-/.test(f.SessionId), 'en er is teruggevallen op het app-nummer');
  }

  console.log('4. DE KERN — een proefwaarde is als proefwaarde te herkennen');
  {
    const s = omgeving({ rit: '2026-09-18-1953' });
    s._plProefWaarden = true;
    const f = await eersteRij(s, function () {
      return s.logToSheets('outlier', 'Koelwater temp: 300°C buiten fysiek bereik (-40–215)', { pid: '0105', value: 300, reason: 'hard_limit' });
    });
    eis(f.RecordType === 'proefwaarde',
      'RecordType is "proefwaarde" (' + f.RecordType + ') — dit is de regel die 18-09 als echte meting in de tabel stond');
    eis(/300/.test(f.Message), 'de regel zelf blijft staan: de proef heeft echt gedraaid');
  }

  console.log('5. de vlag wordt vóór de await gelezen, niet erna');
  {
    // _zonderSporen zet de vlag maar een paar milliseconden aan. Wordt hij pas
    // ná het pseudonimiseren gelezen, dan staat hij alweer uit en komt de
    // proefwaarde alsnog als echte meting binnen.
    const s = omgeving({ rit: null });
    s.vehicleInfo = { merk: 'Mazda', year: '2018', vin: 'JMZKE1W7A00123456' };
    s._vlVinPseudoniem = function () { return Promise.resolve('abcdef0123456789'); };
    s._plProefWaarden = true;
    const p = s.logToSheets('outlier', 'Koelwater temp: 300°C buiten fysiek bereik');
    s._plProefWaarden = false;             // de proef is klaar vóórdat de await terug is
    await p;
    const f = (s._atBuffer[0] || {}).fields || {};
    eis(f.RecordType === 'proefwaarde',
      'de soort is van het moment van loggen en niet van het moment van wegschrijven (' + f.RecordType + ')');
  }

  console.log('6. wie het anders wil, geeft het in extra mee — en dat wint');
  {
    const s = omgeving({ rit: null });
    s._plProefWaarden = true;
    const f = await eersteRij(s, function () {
      return s.logToSheets('info', 'blok 5 klaar', { RecordType: 'testrun', SessionId: '2026-09-18-1953' });
    });
    eis(f.RecordType === 'testrun', 'de testrun houdt zijn eigen soort (' + f.RecordType + ')');
    eis(f.SessionId === '2026-09-18-1953', 'en zijn eigen sessienummer');
  }

  console.log('7. log() stuurt niet nog een keer wat de aanroeper zelf al stuurt');
  {
    const s = omgeving({ rit: null });
    const gestuurd = [];
    metRegel(s, gestuurd);

    s.log('⚠ Koelwater temp: 300°C buiten fysiek bereik (-40–215)', 'warn', { geenAirtable: true });
    eis(gestuurd.length === 0,
      'met geenAirtable gaat de regel niet nog een keer mee (' + gestuurd.length + ' verstuurd) — 18-09 stond elke uitschieter dubbel');

    s.log('⚠ Koelwater temp: 300°C buiten fysiek bereik (-40–215)', 'warn');
    eis(gestuurd.length === 1, 'zonder die vlag gaat hij wél mee — de doorgifte is niet zomaar weg');
  }

  console.log('8. DE HAAKJES — "oorsprong" is geen uitschieter');
  {
    const s = omgeving({ rit: null });
    const gestuurd = [];
    metRegel(s, gestuurd);

    // Hier stond `type==='warn'&&a||b||c`, en && bindt sterker dan ||. Elke
    // regel met "sprong" of "outlier" ging dus mee, ongeacht het niveau.
    s.log('Protocol van andere oorsprong gekozen', 'info');
    eis(gestuurd.length === 0, 'een info-regel met "oorsprong" erin gaat NIET als uitschieter mee');

    s.log('outlierteller teruggezet', 'ok');
    eis(gestuurd.length === 0, 'een ok-regel met "outlier" erin ook niet');

    s.log('Toerental: 9000 buiten het gebruikelijke bereik', 'warn');
    eis(gestuurd.length === 1, 'een echte warn met "buiten" erin gaat wél mee');

    s.log('iets ergs', 'err');
    eis(gestuurd.length === 2 && /^error/.test(gestuurd[1]), 'en een err-regel blijft gewoon gaan');
  }

  console.log(fouten === 0 ? '\nAlles goed.' : '\n' + fouten + ' fout(en).');
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
