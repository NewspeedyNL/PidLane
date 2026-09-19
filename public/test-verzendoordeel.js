// ══════════════════════════════════════════════════════════════════
// test-verzendoordeel.js — de knop die het live oordeel vastlegt (19-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT.
//
// De meetkamer meet de proeven van een opdracht al tijdens de rit, met
// dezelfde functie waarmee blok 5 ze straks beoordeelt. Tot 19-09 bleef dat
// oordeel op het scherm: alleen een volledige testrun schreef iets weg.
//
// Gemeten die dag: dertien opdrachten achter elkaar gekozen, van elk het
// oordeel gelezen, en in de logtabel stond er nul van terug — alleen vijftien
// regels "Nieuwe sessie". De rit is de schaarste in dit project (#257), dus
// een rit waarvan de uitkomst nergens staat is een rit die over moet.
//
// Drie dingen moeten waar zijn, en ze falen alle drie stil:
//
//   1. DE KNOP SCHRIJFT HETZELFDE ALS BLOK 0. Eén regel per proef plus één
//      uitkomstregel, met Outcome en de issues in hun eigen veld. Zou het
//      scherm zijn eigen payload bouwen, dan zegt de tabel op den duur iets
//      anders dan het verslag — dat is de vorm die #246 en #256 al twee keer
//      kostten. Hier wordt daarom getoetst dat beide wegen dezelfde regels
//      opleveren, niet dat er "iets" verstuurd is.
//   2. TWEE KEER DRUKKEN LEVERT GEEN TWEE RIJEN OP. En andersom: verandert
//      het oordeel, dan moet hij wél weer aan. Een knop die na de eerste keer
//      dood blijft, verliest precies de meting waarvoor je nog een rondje
//      reed.
//   3. HET WOORD OP DE KNOP IS DE UITKOMST. GESLOTEN, BEVINDING en NOG NIET
//      moeten alle drie uit elkaar komen. Een knop die bij "nog niet"
//      hetzelfde zegt als bij "gesloten" laat je een lege meting wegschrijven
//      in de veronderstelling dat de vraag beantwoord is.
//
// Beide modules worden ECHT geladen (vm) — geen nagebouwde kopie.
//
// Draaien vanuit public/:  node test-verzendoordeel.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

/* Het ritbeeld dat PLRit.per() teruggeeft. Eén knop eraan draaien verandert
   het oordeel, en dat is precies wat punt 2 nodig heeft. */
function ritbeeld(min) {
  return { '0142': { n: 13, min: min, max: 14.4, laatst: 14.1, veranderingen: 12 } };
}

const OPDRACHT_JSON = {
  schema: 1,
  naam: 'Boordspanning tijdens de rit',
  reden: '#217 - accu of adapter',
  sensoren: ['0142'],
  duurS: 600,
  tikS: 5,
  proeven: [
    { issue: '#217', naam: 'boordspanning blijft binnen bereik', pid: '0142', meet: 'min', tussen: [11.5, 15.2] },
    { issue: '#217', naam: 'de spanning is echt gemeten', pid: '0142', meet: 'veranderingen', tussen: [3, 100000] }
  ]
};

/* De twee echte modules in één sandbox, met een logToSheets() die vangt in
   plaats van verstuurt. pidlane-opdracht.js eerst: de testrun leest
   window.PLOpdracht pas bij het aanroepen, maar zo staat de volgorde gelijk
   aan die in index.html. */
async function laad(min) {
  const s = {};
  s.window = s;
  s.connected = true;
  s.demoMode = false;
  s.pidVals = {};
  s._pidLastUpd = {};
  s.activePIDs = new Set();
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { }, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    querySelectorAll: function () { return []; },
    body: { appendChild: function () { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };

  // Wat er naar Airtable zou gaan, blijft hier staan.
  s.verstuurd = [];
  s.logToSheets = function (type, bericht, extra) {
    s.verstuurd.push({ type: type, bericht: bericht, extra: extra || {} });
  };

  /* De opdracht binnenhalen langs de echte weg: plFetch → lijst() → kies().
     Er zit hier met opzet geen zijdeur naar `_actief`: dan zou deze test op
     een opdracht draaien die de keuring nooit gezien heeft, en juist die
     keuring bepaalt welke velden er straks in handen van meet() komen. */
  s.PROXY_URL = 'https://voorbeeld';
  s.plFetch = function () {
    return Promise.resolve({
      ok: true, status: 200,
      json: function () {
        return Promise.resolve({ opdrachten: [
          { id: 'recPROEF', naam: OPDRACHT_JSON.naam, reden: OPDRACHT_JSON.reden,
            actief: true, gewijzigd: '', opdracht: OPDRACHT_JSON }
        ] });
      }
    });
  };

  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-opdracht.js', 'utf8'), s, { filename: 'pidlane-opdracht.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });

  if (!s.PLOpdracht) throw new Error('PLOpdracht ontbreekt — is pidlane-opdracht.js hernoemd?');
  if (!s.PLTestrunLive) throw new Error('PLTestrunLive ontbreekt — is pidlane-testrun.js hernoemd?');
  if (typeof s.PLTestrunLive.verzend !== 'function')
    throw new Error('PLTestrunLive.verzend() ontbreekt — de knop heeft geen ingang meer');
  if (typeof s.PLTestrunLive.oordeelNu !== 'function')
    throw new Error('PLTestrunLive.oordeelNu() ontbreekt — de knop weet niet meer wat hij moet tekenen');

  /* HET RITBEELD PAS NÁ HET LADEN (en dat is geen detail). pidlane-testrun.js
     hangt zijn EIGEN PLRit aan window — de echte ritwaarnemer — en die heeft
     in een sandbox nul monsters gezien. Zetten we de stub ervóór, dan wordt
     hij overschreven en oordeelt elke proef "niet gemeten": de test staat dan
     groen op een uitkomst die niets met verzenden te maken heeft.

     Wat hier gestubt wordt is dus bewust alleen het ritbeeld. Of PLRit zelf
     goed telt, is de vraag van test-rit.js; hier gaat het om de weg van een
     oordeel naar de tabel. */
  s.PLRit = { per: function () { return ritbeeld(min); } };

  const rijen = await s.PLOpdracht.lijst();
  if (!rijen.length) throw new Error('de proeflijst kwam leeg binnen: ' + s.PLOpdracht.reden());
  if (rijen[0].fout) throw new Error('de proefopdracht wordt afgekeurd: ' + rijen[0].fout);
  if (!s.PLOpdracht.kies('recPROEF')) throw new Error('kies() weigerde de proefopdracht: ' + s.PLOpdracht.reden());
  return s;
}

async function hoofd() {

// ══════════════════════════════════════════════════════════════════
console.log('\n1. de knop schrijft één regel per proef plus de uitkomst');
// ══════════════════════════════════════════════════════════════════
{
  const s = await laad(12.4);            // alles binnen de band → gesloten
  const r = s.PLTestrunLive.verzend();

  toets('verzend() meldt dat het gelukt is', r.ok === true, JSON.stringify(r));
  toets('de uitkomst is "gesloten"', r.staat === 'gesloten', 'kreeg: ' + r.staat);

  const proefregels = s.verstuurd.filter(function (v) { return /— boordspanning|— de spanning/.test(v.bericht); });
  const uitkomst = s.verstuurd.filter(function (v) { return /uitkomst:/.test(v.bericht); });

  toets('er staat een regel per proef (2)', proefregels.length === 2, 'kreeg: ' + proefregels.length);
  toets('er staat precies één uitkomstregel', uitkomst.length === 1, 'kreeg: ' + uitkomst.length);
  toets('de naam van de opdracht staat in elke regel',
    s.verstuurd.every(function (v) { return v.bericht.indexOf('Boordspanning tijdens de rit') !== -1; }),
    s.verstuurd.map(function (v) { return v.bericht; }).join(' // '));

  // Zonder Outcome en Repro is de tabel van buiten alleen met tekst-parsen te
  // lezen, en dat is precies wat #257 punt 3 verbood.
  toets('elke proefregel draagt Outcome',
    proefregels.every(function (v) { return !!v.extra.Outcome; }),
    JSON.stringify(proefregels.map(function (v) { return v.extra; })));
  toets('elke proefregel draagt zijn issue in Repro',
    proefregels.every(function (v) { return v.extra.Repro === '#217'; }),
    JSON.stringify(proefregels.map(function (v) { return v.extra.Repro; })));
  toets('de uitkomstregel draagt de issues van de hele opdracht',
    uitkomst[0].extra.Repro === '#217', JSON.stringify(uitkomst[0].extra));
  toets('de uitkomstregel draagt de staat als Outcome',
    uitkomst[0].extra.Outcome === 'gesloten', JSON.stringify(uitkomst[0].extra));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. twee keer drukken levert geen twee rijen op');
// ══════════════════════════════════════════════════════════════════
{
  const s = await laad(12.4);
  s.PLTestrunLive.verzend();
  const na1 = s.verstuurd.length;

  const r2 = s.PLTestrunLive.verzend();
  toets('de tweede keer wordt geweigerd', r2.ok === false, JSON.stringify(r2));
  toets('en er is geen enkele regel bijgekomen', s.verstuurd.length === na1,
    na1 + ' → ' + s.verstuurd.length);
  toets('de reden zegt dat er niets veranderd is',
    /niets veranderd|staat er al/i.test(r2.reden || ''), r2.reden);

  toets('oordeelNu() weet dat het al verzonden is',
    s.PLTestrunLive.oordeelNu().alVerzonden === true);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. verandert het oordeel, dan mag het opnieuw');
// ══════════════════════════════════════════════════════════════════
{
  const s = await laad(12.4);
  s.PLTestrunLive.verzend();
  const na1 = s.verstuurd.length;

  // De spanning zakt onder de band: gesloten → bevinding. Dat is nieuw nieuws
  // en hoort dus wél verstuurd te worden.
  s.PLRit.per = function () { return ritbeeld(10.9); };

  toets('oordeelNu() ziet het nieuwe oordeel',
    s.PLTestrunLive.oordeelNu().vonnis.staat === 'bevinding',
    'kreeg: ' + s.PLTestrunLive.oordeelNu().vonnis.staat);
  toets('en weet dat dít nog niet verzonden is',
    s.PLTestrunLive.oordeelNu().alVerzonden === false);

  const r = s.PLTestrunLive.verzend();
  toets('verzenden lukt weer', r.ok === true, JSON.stringify(r));
  toets('de uitkomst is nu "bevinding"', r.staat === 'bevinding', 'kreeg: ' + r.staat);
  toets('er zijn regels bijgekomen', s.verstuurd.length > na1, na1 + ' → ' + s.verstuurd.length);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. de knop zegt dezelfde drie woorden als het verslag');
// ══════════════════════════════════════════════════════════════════
{
  /* De meetkamer apart laden: hij hangt niet aan de testrun vast en hoort dat
     ook niet te doen. Wat hier getoetst wordt is de TEKST op de knop, want
     dat is het enige wat een mens in de auto ziet. */
  function knop(verzendStand) {
    const s = { console: { warn: function () { } } };
    s.window = s;
    s.document = {
      getElementById: function () { return null; },
      createElement: function () { return { id: '', innerHTML: '', style: { cssText: '' }, appendChild: function () { }, parentNode: null }; }
    };
    s.setInterval = function () { return 1; };
    s.clearInterval = function () { };
    vm.createContext(s);
    vm.runInContext(fs.readFileSync(__dirname + '/pidlane-meetkamer.js', 'utf8'), s, { filename: 'pidlane-meetkamer.js' });
    if (typeof s.PLMeetkamer._verzendKnop !== 'function')
      throw new Error('PLMeetkamer._verzendKnop() ontbreekt — de knop staat niet meer op het scherm');
    return s.PLMeetkamer._verzendKnop({ verzend: verzendStand });
  }

  const gesloten = knop({ vonnis: { staat: 'gesloten', reden: 'alles binnen de band' }, alVerzonden: false });
  const bevinding = knop({ vonnis: { staat: 'bevinding', reden: '1 buiten de band' }, alVerzonden: false });
  const nogniet = knop({ vonnis: { staat: 'nog niet', reden: 'geen warme motor' }, alVerzonden: false });
  const gedaan = knop({ vonnis: { staat: 'gesloten', reden: 'alles binnen de band' }, alVerzonden: true });

  toets('bij gesloten staat er GESLOTEN', /GESLOTEN/.test(gesloten), gesloten);
  toets('bij bevinding staat er BEVINDING', /BEVINDING/.test(bevinding), bevinding);
  toets('bij nog niet staat er NOG NIET', /NOG NIET/.test(nogniet), nogniet);

  /* DE TOETS MOET ONDERSCHEIDEN, NIET ALLEEN KLOPPEN (CLAUDE.md). Dat er
     ergens "GESLOTEN" staat zegt niets zolang de drie standen dezelfde tekst
     kunnen opleveren. Deze drie regels zijn wat er stukgaat als iemand de
     woorden gelijktrekt. */
  toets('gesloten en bevinding zeggen niet hetzelfde', gesloten !== bevinding);
  toets('bevinding en nog niet zeggen niet hetzelfde', bevinding !== nogniet);
  toets('bij nog niet staat GESLOTEN er juist NIET', !/GESLOTEN/.test(nogniet), nogniet);

  // Een knop die na het verzenden nog steeds "verzenden" zegt, laat je nog
  // vier keer drukken.
  toets('na verzenden is het geen knop meer', gedaan.indexOf('<button') === -1, gedaan);
  toets('en staat er dat het in de logtabel staat', /logtabel/.test(gedaan), gedaan);
  toets('zonder oordeel staat er niets', knop(null) === '' && knop({ vonnis: null }) === '');
}

}

hoofd().then(function () {
  console.log('\n' + (fout ? '\u2717 ' + fout + ' van de ' + n + ' fout' : '\u2713 alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
}).catch(function (e) {
  // Een test die stukloopt vóór hij iets getoetst heeft, mag niet als
  // "geslaagd" eindigen omdat de teller nog op nul staat.
  console.error('\nFOUT: de test liep vast — ' + ((e && e.stack) || e));
  process.exit(1);
});
