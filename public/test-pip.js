// ══════════════════════════════════════════════════════════════════
// test-pip.js — blijft de meting in beeld, en gaat hij uit als je dat zegt?
// (#228, 17-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT, EN WAAROM JUIST DIT.
//
// Picture-in-picture is de kandidaat die op 17-09 met de split-screenproef
// overbleef: zichtbaar en niet vooraan liep de meetlus 99 s door zonder één
// gat, verborgen viel hij na ~60 s stil. Het VENSTER zelf is native en kan
// hier niet draaien. Wat hier wél draait is de helft die bepaalt of het
// venster gevraagd wordt — en dat is precies de helft die stil fout kan gaan:
//
//   1. DE UITZETKNOP. `feat_pip` in de Config moet de functie uit kunnen
//      zetten zonder nieuwe build. Dat is een harde eis: het venster staat
//      over de navigatie heen, en dat bezwaar staat in #228 zelf. Een
//      schakelaar die niet schakelt is erger dan geen schakelaar.
//
//   2. HET ONDERSCHEID. "PiP staat niet aan" heeft vijf oorzaken die elk iets
//      anders betekenen: uitgezet, geen native schil, niet verbonden, demo,
//      geen sensoren. Vallen die samen, dan zoekt de volgende het verkeerde
//      na — en dat is precies hoe #18 anderhalve week de verkeerde kant op
//      keek.
//
//   3. DE VLAG. Native beslist niets; het leest wat hier wordt neergezet. Komt
//      die vlag niet aan, of blijft er een oude staan, dan gedraagt de app
//      zich anders dan dit besluit zegt — en dat is van buiten onzichtbaar.
//
// De echte module wordt geladen (vm), geen kopie.
//
// Draaien vanuit public/:  node test-pip.js        (exit 0 = goed)
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

/* Een sandbox met net genoeg DOM om de module te laten laden. Wat hij niet
   vindt (setConn, updPID) hoort hij te melden en te overleven — dat is zelf
   een van de toetsen hieronder. */
function laad(extra) {
  const s = Object.assign({
    connected: false,
    demoMode: false,
    activePIDs: new Set(),
    pidVals: {},
    PID_CONFIG: {}
  }, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  s.appended = [];
  s.klassen = new Set();
  const maak = function () {
    return {
      style: {}, dataset: {}, textContent: '', innerHTML: '',
      setAttribute() { }, appendChild() { },
      classList: { add(k) { s.klassen.add(k); }, remove(k) { s.klassen.delete(k); } }
    };
  };
  s.document = {
    createElement: maak,
    getElementById: function () { return null; },
    addEventListener: function (naam, fn) { (s.haken = s.haken || {})[naam] = fn; },
    head: { appendChild: function (e) { s.appended.push(e); } },
    body: {
      appendChild: function (e) { s.appended.push(e); },
      classList: { add(k) { s.klassen.add(k); }, remove(k) { s.klassen.delete(k); } }
    }
  };
  s.setTimeout = function () { return 0; };
  s.clearTimeout = function () { };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-pip.js', 'utf8'), s,
    { filename: 'pidlane-pip.js' });
  if (!s.PLPip) { console.error('FOUT: PLPip hangt niet naar buiten — de module is niet te bereiken'); process.exit(1); }
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. het besluit onderscheidt vijf redenen, en de Config wint');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad();
  const B = s.PLPip.besluit;
  const goed = { toggleAan: true, beschikbaar: true, verbonden: true, demo: false, sensoren: 4 };

  toets('alles op orde → PiP aan',
    B(goed).aan === true, 'gaf: ' + JSON.stringify(B(goed)));

  // DE UITZETKNOP, en hij staat met opzet bovenaan: staat hij uit, dan hoort
  // daar "uitgezet" te staan en niet een andere waarheid die toevallig ook
  // geldt. Anders zoekt de beheerder naar een schil terwijl hij zelf de knop
  // heeft omgezet.
  const uit = Object.assign({}, goed, { toggleAan: false, beschikbaar: false, verbonden: false });
  toets('uitgezet in de Config → nee, en dát is de reden',
    B(uit).aan === false && B(uit).sleutel === 'uit' && /feat_pip/.test(B(uit).reden),
    'gaf: ' + JSON.stringify(B(uit)));

  const gevallen = [
    ['beschikbaar', false, 'geen-schil', 'geen native schil'],
    ['verbonden', false, 'los', 'geen adapter'],
    ['demo', true, 'demo', 'demomodus'],
    ['sensoren', 0, 'geen-selectie', 'geen sensoren']
  ];
  gevallen.forEach(function (g) {
    const f = Object.assign({}, goed); f[g[0]] = g[1];
    const b = B(f);
    toets(g[3] + ' → nee, met een eigen sleutel',
      b.aan === false && b.sleutel === g[2],
      'gaf: ' + JSON.stringify(b));
  });

  // TEGENPROEF OP HET ONDERSCHEID: vijf verschillende oorzaken horen vijf
  // verschillende sleutels te geven. Vallen er twee samen, dan is de melding
  // op de PR-pagina en in blok 5 niet meer terug te voeren op een oorzaak.
  const sleutels = gevallen.map(function (g) {
    const f = Object.assign({}, goed); f[g[0]] = g[1];
    return B(f).sleutel;
  }).concat(B(uit).sleutel);
  toets('elke oorzaak draagt zijn eigen sleutel',
    new Set(sleutels).size === sleutels.length, 'gaf: ' + sleutels.join(', '));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. de schakelaar komt uit de Config, en ontbreken is AAN');
// ══════════════════════════════════════════════════════════════════
{
  // Zoals in de rest van de app: een functie die nooit is uitgezet, staat aan.
  const leeg = laad();
  toets('zonder sleutel in de Config staat de functie aan', leeg.PLPip.toggleAan() === true);

  const aan = laad({ PID_CONFIG: { feat_pip: 'true' } });
  toets("'true' uit Airtable leest als aan", aan.PLPip.toggleAan() === true);

  ['false', '0', false, 0].forEach(function (w) {
    const s = laad({ PID_CONFIG: { feat_pip: w } });
    toets('de Config zet hem uit met ' + JSON.stringify(w), s.PLPip.toggleAan() === false);
  });

  // En als featOn bestaat (de echte app), dan is DAT de bron. Twee plekken die
  // hetzelfde uitrekenen is in dit project al drie keer een bug geweest.
  const metFeat = laad({ featOn: function (k) { return k === 'feat_pip' ? false : true; } });
  toets('featOn() wint als hij bestaat', metFeat.PLPip.toggleAan() === false,
    'anders leest de module de Config langs featOn heen en lopen de twee uit de pas');
  toets('en de module vraagt precies de sleutel die beheer.html toont',
    metFeat.PLPip._sleutel() === 'feat_pip');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. de feiten komen uit de app zelf');
// ══════════════════════════════════════════════════════════════════
{
  const s = laad({ connected: true, demoMode: false, activePIDs: new Set(['010C', '010D']) });
  const f = s.PLPip.feiten();
  toets('verbonden, geen demo, twee sensoren',
    f.verbonden === true && f.demo === false && f.sensoren === 2,
    'gaf: ' + JSON.stringify(f));
  toets('en zonder Capacitor is er geen native kant', f.beschikbaar === false);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. de vlag gaat naar native, en alleen als hij verandert');
// ══════════════════════════════════════════════════════════════════
(async function () {
  const gestuurd = [];
  // De luisteraar wordt tijdens het LADEN geregistreerd, dus hij kan niet in
  // de sandbox-variabele schrijven die op dat moment nog niet bestaat. Vandaar
  // een eigen doosje dat er al is.
  const vangst = {};
  const s = laad({
    connected: true,
    activePIDs: new Set(['010C']),
    Capacitor: {
      Plugins: {
        PLPip: {
          zetGewenst: function (o) { gestuurd.push(!!(o && o.aan)); return Promise.resolve({ gewenst: !!(o && o.aan) }); },
          status: function () { return Promise.resolve({ beschikbaar: true, ondersteund: true, gewenst: true, inPip: false }); },
          nu: function () { return Promise.resolve({ ok: true }); },
          addListener: function (naam, fn) { vangst.naam = naam; vangst.fn = fn; }
        }
      }
    }
  });

  await s.PLPip.sync();
  toets('een lopende meting zet de vlag aan',
    gestuurd.length === 1 && gestuurd[0] === true, 'gaf: ' + JSON.stringify(gestuurd));

  await s.PLPip.sync();
  toets('dezelfde stand stuurt niets opnieuw',
    gestuurd.length === 1, 'gaf: ' + JSON.stringify(gestuurd) + ' — anders staat er bij elke pollronde een bridge-aanroep');

  // Verbinding weg: de vlag MOET uit. Blijft hij staan, dan springt de app in
  // een klein venster terwijl er niets meer gemeten wordt.
  s.connected = false;
  await s.PLPip.sync();
  toets('verbinding weg → de vlag gaat uit',
    gestuurd.length === 2 && gestuurd[1] === false, 'gaf: ' + JSON.stringify(gestuurd));

  toets('het laatste besluit is op te vragen (blok 5 leest dit)',
    s.PLPip.laatste() && s.PLPip.laatste().sleutel === 'los',
    'gaf: ' + JSON.stringify(s.PLPip.laatste()));

  // De module luistert naar de gebeurtenis die PLPipPlugin.java stuurt.
  toets('de module luistert naar pipModus',
    vangst.naam === 'pipModus',
    'zonder die naam komt de moduswissel nooit aan en blijft het volle scherm in een venster van 240x135 staan');

  // ══════════════════════════════════════════════════════════════════
  console.log('\n5. de moduswissel zet het scherm om, en weer terug');
  // ══════════════════════════════════════════════════════════════════
  vangst.fn({ in: true });
  toets('in PiP staat de klasse op body', s.klassen.has('pl-pip'));
  toets('en het kleine venster is opgebouwd',
    s.appended.some(function (e) { return e.id === 'pipMini'; }),
    'gaf: ' + JSON.stringify(s.appended.map(function (e) { return e.id; })));
  toets('PLPip weet dat hij erin zit', s.PLPip.inPip() === true);

  vangst.fn({ in: false });
  toets('eruit → de klasse is weg', !s.klassen.has('pl-pip'),
    'blijft hij staan, dan is de app onbruikbaar: alles behalve het kleine venster staat op display:none');
  toets('en PLPip weet dat ook', s.PLPip.inPip() === false);

  // ══════════════════════════════════════════════════════════════════
  console.log('\n6. zonder native kant valt er niets om');
  // ══════════════════════════════════════════════════════════════════
  const kaal = laad({ connected: true, activePIDs: new Set(['010C']) });
  const b = await kaal.PLPip.sync();
  toets('sync zonder Capacitor levert een besluit met een reden',
    b && b.aan === false && b.sleutel === 'geen-schil', 'gaf: ' + JSON.stringify(b));
  const r = await kaal.PLPip.nu();
  toets('en "nu naar PiP" zegt eerlijk dat het niet kan',
    r && r.ok === false && /schil/.test(r.reden), 'gaf: ' + JSON.stringify(r));
  toets('het ontbreken van setConn wordt gemeld en niet verzwegen',
    kaal.gewaarschuwd.some(function (m) { return /setConn/.test(m); }),
    'een module die stil niets meer volgt is precies de vorm waar de bedradingscontrole voor bestaat');
  toets('en het ontbreken van updPID ook',
    kaal.gewaarschuwd.some(function (m) { return /updPID/.test(m); }));

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                            : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
})();
