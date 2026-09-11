// ══════════════════════════════════════════════════════════════════
// test-meetdienst.js — de app-kant van de native meetdienst (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. De meetdienst is tegelijk de kandidaat-oplossing
// voor #18 en het meetinstrument dat moet zeggen of die oplossing werkt. Gaat
// er iets mis in de vertaling van ruwe native getallen naar een oordeel, dan
// levert de eerstvolgende rit een getal op dat nergens over gaat — en juist op
// zo'n getal wordt de keuze tussen foreground service, picture-in-picture en
// een volledig native meetlus gebaseerd.
//
// De drie uitkomsten die uit elkaar gehouden moeten worden:
//
//   native stil, webview stil    het proces was bevroren
//   native liep, webview stil    Chromium kneep de verborgen pagina af
//   niet gemeten                 er was geen native kant, of de dienst liep niet
//
// Die derde is de gevaarlijkste. "Niet gemeten" als nul lezen is precies de
// fout die #18 anderhalve week lang een verkeerd getal liet rapporteren, en
// daarom staat hij hieronder apart voor elke reden waarom hij kan optreden.
//
// HOE ER GETOETST WORDT. pidlane-meetdienst.js wordt in zijn geheel geladen in
// een sandbox met een nagemaakte Capacitor-bridge. Er wordt niets
// overgeschreven: de grenzen, het oordeel en de duiding komen uit de module
// zelf. De native kant is nagemaakt tot precies de grens die in de echte app
// ook de grens is — de plugin-aanroep.
//
// Draaien vanuit public/:  node test-meetdienst.js        (exit 0 = goed)
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
function bevat(naam, tekst, stuk) {
  n++;
  if (String(tekst).indexOf(stuk) !== -1) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam + '\n        "' + stuk + '" staat niet in: ' + tekst);
  }
}

// ── de sandbox ────────────────────────────────────────────────────
// Alleen de bridge en de verbindingsstatus zijn nagemaakt. De module is echt.
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.Promise = Promise;
  s.logs = [];
  s.log = function (m, niveau) { s.logs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.connected = ('connected' in o) ? o.connected : false;
  s.demoMode = !!o.demoMode;
  s.aanroepen = [];
  if (o.setConn !== false) {
    s.echteSetConn = 0;
    s.setConn = function (aan) { s.echteSetConn++; s.connected = !!aan; return 'origineel'; };
  }
  /* De nep-plugin. Hij antwoordt zoals de echte: een belofte met een object.
     `weiger` bootst na wat Android 12+ doet als een foreground service vanuit
     de achtergrond gestart wordt. Dat is geen randgeval maar het geval waarover
     de app een reden moet kunnen melden — anders valt de meting stil uit, en
     dat is de vorm van #18 zelf. */
  if (o.plugin !== false) {
    s.Capacitor = {
      isNativePlatform: function () { return true; },
      Plugins: {
        PLMeetdienst: {
          start: function () {
            s.aanroepen.push('start');
            if (o.startStuk) return Promise.reject(new Error('bridge weg'));
            if (o.weiger) return Promise.resolve({ draait: false, reden: 'geweigerd: ForegroundServiceStartNotAllowedException' });
            return Promise.resolve({ draait: true, reden: 'gestart' });
          },
          stop: function () { s.aanroepen.push('stop'); return Promise.resolve({ draait: false, reden: 'gestopt' }); },
          nulstel: function () { s.aanroepen.push('nulstel'); return Promise.resolve({ draait: true }); },
          vraagMelding: function () { s.aanroepen.push('vraagMelding'); return Promise.resolve({ melding: 'granted' }); },
          status: function () { s.aanroepen.push('status'); return Promise.resolve({ beschikbaar: true, draait: true, hartslagMs: 1000, sdk: 36 }); },
          rapport: function () { s.aanroepen.push('rapport'); return Promise.resolve(o.rapport || null); }
        }
      }
    };
  }
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-meetdienst.js', 'utf8'),
    s, { filename: 'pidlane-meetdienst.js' });
  if (!s.PLMeetdienst) { console.error('FOUT: PLMeetdienst niet geladen'); process.exit(1); }
  return s;
}

/* Een ruw rapport zoals PLMeetdienst.java het levert: alle tijden op de
   elapsedRealtime-klok, in milliseconden. `van` is het moment van nulstellen.
   Er wordt hier bewust met een grote absolute waarde gerekend: de module hoort
   uitsluitend met VERSCHILLEN te werken, en een test die op nul begint zou dat
   niet laten zien. */
const T0 = 1000000;
function rap(x) {
  const r = { draait: true, van: T0, nu: T0, laatste: T0, slagen: 0,
              stilMs: 0, stilVan: T0, hartslagMs: 1000 };
  for (const k in (x || {})) r[k] = x[k];
  return r;
}

async function main() {

  console.log('\n── de grenzen komen uit de module ──');
  {
    const s = bouw({ plugin: false });
    const g = s.PLMeetdienst._grenzen();
    toets('de hartslag telt op één seconde', g.hartslag, 1000);
    toets('en onder twee slagen heet het geen stilte', g.slagenMinimaal, 2);
  }

  console.log('\n── zonder native kant doet de module niets, en zegt dat ──');
  {
    const s = bouw({ plugin: false });
    toets('beschikbaar() is false', s.PLMeetdienst.beschikbaar(), false);
    // DIT is de kern van deze helft: geen plugin betekent GEEN METING, en dat
    // is iets anders dan een meting die nul opleverde.
    const o = s.PLMeetdienst.oordeel(null);
    toets('het oordeel is niet-gemeten', o.gemeten, false);
    toets('stil blijft null en wordt geen 0', o.stil, null);
    toets('door blijft null', o.door, null);
    bevat('met de reden erbij', o.reden, 'geen native meetdienst');
    toets('starten levert false op', await s.PLMeetdienst.start(), false);
    toets('en de reden staat klaar voor het verslag',
      /geen native meetdienst/.test(s.PLMeetdienst.reden()), true);
  }

  console.log('\n── de meldingpermissie wordt één keer gevraagd, niet elke verbinding ──');
  {
    /* De dienst start bij ELKE verbinding, en #18 laat zelf zien dat er
       onderweg herverbonden wordt — de rit van 02-09 deed een volledige
       herverbinding mét ELM-init midden in een afwezigheid. Zonder de vlag
       krijgt de bestuurder dat dialoog dus tijdens het rijden opnieuw. */
    const s = bouw();
    await s.PLMeetdienst.start();
    await s.PLMeetdienst.start();
    await s.PLMeetdienst.start();
    const vragen = s.aanroepen.filter(function (a) { return a === 'vraagMelding'; });
    toets('drie keer starten, één keer vragen', vragen.length, 1);
    toets('en er is wel drie keer gestart',
      s.aanroepen.filter(function (a) { return a === 'start'; }).length, 3);
  }

  console.log('\n── de dienst volgt de verbinding ──');
  {
    const s = bouw();
    toets('de module heeft setConn overgenomen', typeof s.setConn, 'function');
    toets('en geeft door wat de echte setConn teruggaf', s.setConn(true), 'origineel');
    toets('de echte setConn is één keer gedraaid', s.echteSetConn, 1);
    await null; await null;
    // Alleen de levensloop telt hier; de meldingvraag is hierboven al getoetst.
    const loop = function () { return s.aanroepen.filter(function (a) { return a === 'start' || a === 'stop'; }); };
    toets('verbinden start de dienst', loop(), ['start']);
    toets('en dat staat in het logboek', s.logs.length, 1);
    bevat('met het issue erbij', s.logs[0].m, '#18');
    s.setConn(false);
    await null; await null;
    toets('verbreken stopt hem', loop(), ['start', 'stop']);
  }

  console.log('\n── in demo draait er niets ──');
  {
    // Geen socket die Android kan opruimen, geen meting die doorloopt: dan is
    // een melding in de statusbalk een belofte zonder iets eronder.
    const s = bouw({ demoMode: true });
    s.setConn(true);
    await null; await null;
    toets('demo start geen dienst',
      s.aanroepen.filter(function (a) { return a === 'start' || a === 'stop'; }), ['stop']);
    toets('nodig() zegt nee', s.PLMeetdienst.nodig(), false);
  }

  console.log('\n── een geweigerde start is een melding, geen stilte ──');
  {
    // Android 12+ weigert een foreground service die vanuit de achtergrond
    // start. Zou dat stil wegvallen, dan draait de app zonder meetdienst en
    // merkt niemand het — precies de vorm van #18.
    const s = bouw({ weiger: true });
    s.setConn(true);
    await null; await null; await null;
    toets('de dienst draait niet', s.PLMeetdienst.draait(), false);
    bevat('de reden is bewaard', s.PLMeetdienst.reden(), 'ForegroundServiceStartNotAllowedException');
    toets('en het is een waarschuwing in het logboek', s.logs[0].niveau, 'warn');
    bevat('die zegt wat het gevolg is', s.logs[0].m, 'op de achtergrond valt de meting stil');
  }

  console.log('\n── een kapotte bridge valt ook niet stil weg ──');
  {
    const s = bouw({ startStuk: true });
    toets('start() levert false', await s.PLMeetdienst.start(), false);
    bevat('met de fout erbij', s.PLMeetdienst.reden(), 'bridge weg');
    toets('en een waarschuwing in het logboek', s.logs[0].niveau, 'warn');
  }

  console.log('\n── het oordeel: niet gemeten blijft niet gemeten ──');
  {
    const s = bouw({ plugin: false });
    const O = s.PLMeetdienst.oordeel;
    let o = O(rap({ draait: false }));
    toets('dienst draaide niet → gemeten false', o.gemeten, false);
    toets('en stil is null, geen 0', o.stil, null);
    bevat('met de reden erbij', o.reden, 'draaide niet');

    o = O(rap({ van: 0, laatste: 0 }));
    toets('nooit op nul gezet → gemeten false', o.gemeten, false);
    bevat('met de reden erbij', o.reden, 'niet op nul gezet');
  }

  console.log('\n── het oordeel: het proces liep gewoon door ──');
  {
    const s = bouw({ plugin: false });
    // 120 s weg, elke seconde een slag, de laatste vlak voor het uitlezen.
    const o = s.PLMeetdienst.oordeel(rap({ nu: T0 + 120000, laatste: T0 + 119500, slagen: 120 }));
    toets('gemeten', o.gemeten, true);
    toets('niets stil', o.stil, 0);
    toets('de hele periode doorgelopen', o.door, 120);
    toets('en niets na', o.na, 0);
    toets('met het aantal slagen erbij', o.slagen, 120);
  }

  console.log('\n── het oordeel: het proces is bevroren, met de staart erin ──');
  {
    /* DE STAARTREGEL, EN DE REDEN DAT HIJ ER IS. De hartslag stopt niet uit
       zichzelf op het moment dat de app terugkomt. Ontdooit het proces niet
       vóór het uitlezen, dan staat de bevriezing NIET in stilMs maar in de
       afstand tussen de laatste slag en nu. Zonder de staart meet deze module
       dan nul terwijl het proces twee minuten stil stond. */
    const s = bouw({ plugin: false });
    const o = s.PLMeetdienst.oordeel(rap({ nu: T0 + 182000, laatste: T0 + 50000, slagen: 50 }));
    toets('gemeten', o.gemeten, true);
    toets('50 s doorgelopen', o.door, 50);
    toets('en daarna 132 s stil — de meting van 09-09', o.stil, 132);
    toets('niets erna', o.na, 0);
  }

  console.log('\n── het oordeel: afgeknepen, niet bevroren ──');
  {
    // Stilte in het midden, daarna liep hij uit zichzelf weer. Dat is een
    // ANDER mechanisme met een andere oplossing, en het mag niet als
    // bevriezing in het verslag komen.
    const s = bouw({ plugin: false });
    const o = s.PLMeetdienst.oordeel(
      rap({ nu: T0 + 120000, laatste: T0 + 119000, slagen: 40, stilMs: 60000, stilVan: T0 + 30000 }));
    toets('30 s doorgelopen', o.door, 30);
    toets('60 s stil', o.stil, 60);
    toets('en daarna liep hij nog 30 s zelf', o.na, 30);
  }

  console.log('\n── het oordeel: één seconde speling is geen stilte ──');
  {
    const s = bouw({ plugin: false });
    const o = s.PLMeetdienst.oordeel(rap({ nu: T0 + 10000, laatste: T0 + 8500, slagen: 9 }));
    toets('1,5 s staart telt niet als stilte', o.stil, 0);
    toets('en de hele periode geldt als doorgelopen', o.door, 10);
  }

  console.log('\n── de duiding: de drie uitkomsten uit elkaar ──');
  {
    const s = bouw({ plugin: false });
    const D = s.PLMeetdienst.duiding, O = s.PLMeetdienst.oordeel;

    const beide = O(rap({ nu: T0 + 120000, laatste: T0 + 119500, slagen: 120 }));
    bevat('beide door → de meting overleeft het wegschakelen',
      D(beide, { stil: 0 }), 'overleeft het wegschakelen');

    // DE UITKOMST WAAR DEZE HELE RONDE OM DRAAIT. Het proces leefde, de
    // webview lag stil: dan is een foreground service niet genoeg.
    bevat('proces door, webview stil → richting C',
      D(beide, { stil: 132 }), 'WEBVIEW lag stil');
    bevat('en de vervolgstap staat erbij',
      D(beide, { stil: 132 }), 'picture-in-picture');

    const bevroren = O(rap({ nu: T0 + 182000, laatste: T0 + 50000, slagen: 50 }));
    bevat('allebei stil → het hele proces was bevroren',
      D(bevroren, { stil: 132 }), 'hele proces is bevroren');

    bevat('webview gemeten op null → geen vergelijking',
      D(beide, { stil: null }), 'niets naast te leggen');
    bevat('niet gemeten → dat staat er, zonder oordeel',
      D(O(null), { stil: 12 }), 'native niet gemeten');
  }

  console.log('\n── de brug naar de plugin gebruikt de echte namen ──');
  {
    // Een typefout in een methodenaam levert een belofte op die nooit iets
    // doet. Dan draait de dienst niet en staat er niets in het logboek dat
    // daarnaar wijst.
    const s = bouw({ rapport: rap({ nu: T0 + 5000, laatste: T0 + 4500, slagen: 5 }) });
    await s.PLMeetdienst.nulstel();
    const r = await s.PLMeetdienst.rapport();
    toets('nulstel() en rapport() bereiken de plugin', s.aanroepen, ['nulstel', 'rapport']);
    toets('en het rapport komt ongewijzigd terug', r.slagen, 5);
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}

main().catch(function (e) { console.error('FOUT: de test zelf klapte —', e); process.exit(1); });
