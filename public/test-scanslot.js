// ══════════════════════════════════════════════════════════════════
// test-scanslot.js — mag een scan de bewakers stilzetten? (#191)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT, EN HET IS TWEE KANTEN OP.
//
// Een scan vraagt met opzet naar dingen die er niet zijn. De lege antwoorden
// die dat oplevert zijn het meetresultaat. Zonder `window._plScanActief` telt
// PLBus.note() ze als fout (foutPct → ~100%, PLBusGate dicht, waakronde meldt
// gezonde sensoren als uitgevallen) en leest trackBtQuality() ze als een dode
// socket. Dat is #191, gemeld uit het gebruik: het diep zoeken gaf een dip met
// valse waarschuwingen in de rapporten.
//
// MAAR DIE VLAG ZET HET VANGNET UIT. Wie hem aanzet en verder niets doet,
// ruilt valse waarschuwingen in voor een scan die stilletjes doorploetert op
// een verbinding die al weg is — dezelfde fout in spiegelbeeld, en stiller.
//
// De onderscheidende vraag bij elke toets hieronder is dus niet "gaat de vlag
// aan" maar: **wat zou er misgaan als hij aan bleef staan, of als het vangnet
// er niet was?** Vandaar dat er van allebei de kanten een geval staat:
//
//   de vlag gaat aan tijdens het werk        (anders: valse waarschuwingen)
//   de vlag gaat ALTIJD weer uit             (anders: de bewakers blijven doof)
//   een nesteling zet hem niet te vroeg uit  (anders: sloopt een andere scan)
//   een dode verbinding breekt de scan af    (anders: doorploeteren in stilte)
//   het busslot wordt aangetikt én vrijgegeven
//
// Alles draait op een nagemaakte sendCmd en een nagemaakte PLBus — dat is de
// grens waar de app met de adapter praat. De module zelf is echt, en de
// drempels komen eruit in plaats van hier te staan.
//
// Draaien vanuit public/:  node test-scanslot.js       (exit 0 = goed)
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
  else { fout++; console.log('  FOUT  ' + naam + '\n        "' + stuk + '" staat niet in: ' + tekst); }
}

function bouw(o) {
  o = o || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.Promise = Promise;
  s.tx = [];            // alles wat er de bus op ging
  s.vlagTijdens = [];   // de stand van _plScanActief bij elk commando
  s.btlog = [];
  s.btDiag = function (m, niv) { s.btlog.push({ m: String(m), niveau: niv || 'info' }); };
  s.setTimeout = function (fn) { return setTimeout(fn, 0); };
  s.setInterval = function (fn, ms) { s.raak = { ms: ms, fn: fn, gestopt: false }; return 77; };
  s.clearInterval = function (id) { if (s.raak && id === 77) s.raak.gestopt = true; };

  /* De nep-adapter. `leeg` bepaalt welke commando's niets teruggeven; ATI
     antwoordt standaard wél, want een levende adapter is het normale geval. */
  s.sendCmd = function (cmd, t) {
    s.tx.push(cmd);
    s.vlagTijdens.push(!!s.window._plScanActief);
    if (/^ATI/i.test(cmd)) return Promise.resolve(o.atiDood ? '' : 'ELM327 v1.4b');
    if (o.allesLeeg) return Promise.resolve('');
    return Promise.resolve('41' + cmd.slice(2) + '00');
  };

  if (o.plbus !== false) {
    s.bus = { claims: 0, raak: 0, release: 0, laatsteNaam: null };
    s.PLBus = {
      wait: function (naam) { s.bus.claims++; s.bus.laatsteNaam = naam; return Promise.resolve(o.slotBezet ? 0 : 42); },
      raak: function () { s.bus.raak++; },
      release: function () { s.bus.release++; }
    };
  }
  if (o.vlagStondAl) s._plScanActief = true;

  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-scanslot.js', 'utf8'), s, { filename: 'pidlane-scanslot.js' });
  if (!s.PLScanSlot) { console.error('FOUT: PLScanSlot niet geladen'); process.exit(1); }
  return s;
}

async function main() {

  console.log('\n── de drempels komen uit de module ──');
  {
    const s = bouw();
    const d = s.PLScanSlot.drempels();
    toets('het slot wordt binnen MAX_HOLD_MS aangetikt', d.raakElkeMs < 180000, true);
    toets('een ATI na 60 commando\'s', d.hartslagElke, 60);
    toets('en na 25 lege op rij', d.leegAchtereen, 25);
  }

  console.log('\n── tijdens het werk staat de vlag aan, erna uit ──');
  {
    // ZONDER DIT telt PLBus.note() elk leeg antwoord als fout en gaat
    // PLBusGate dicht — precies de dip uit #191.
    const s = bouw();
    toets('vooraf staat hij uit', !!s._plScanActief, false);
    const uit = await s.PLScanSlot.doe('proef', {}, async function (stuur) {
      await stuur('0101');
      await stuur('0102');
      return 'klaar';
    });
    toets('het werk geeft zijn uitkomst door', uit, 'klaar');
    toets('bij élk commando stond de vlag aan', s.vlagTijdens, [true, true]);
    toets('en achteraf staat hij weer uit', !!s._plScanActief, false);
  }

  console.log('\n── ook als het werk klapt gaat de vlag uit ──');
  {
    // Blijft hij aan, dan zijn de bewakers voorgoed doof en meldt de app nooit
    // meer een dode socket. Dat is de duurste variant van deze fout.
    const s = bouw();
    let gevangen = null;
    try { await s.PLScanSlot.doe('proef', {}, async function () { throw new Error('werk klapte'); }); }
    catch (e) { gevangen = e.message; }
    toets('de fout komt naar buiten', gevangen, 'werk klapte');
    toets('en de vlag staat uit', !!s._plScanActief, false);
    toets('het busslot is teruggegeven', s.bus.release, 1);
  }

  console.log('\n── een nesteling zet de vlag niet te vroeg uit ──');
  {
    // Draait er al een scan (PLKaart), dan hoort deze finally de vlag te laten
    // staan. Anders zet de ene scan het vangnet van de andere terug terwijl
    // die nog midden in een adressweep zit.
    const s = bouw({ vlagStondAl: true });
    await s.PLScanSlot.doe('proef', {}, async function (stuur) { await stuur('0101'); });
    toets('de vlag stond al aan en blijft aan', !!s._plScanActief, true);
  }

  console.log('\n── het busslot: claimen, aantikken, teruggeven ──');
  {
    const s = bouw();
    await s.PLScanSlot.doe('diep zoeken', {}, async function (stuur) {
      toets('het slot is geclaimd op naam', s.bus.laatsteNaam, 'diep zoeken');
      // Een lange scan moet het slot blijven aantikken, anders onteigent de
      // noodrem van PLBus hem na drie minuten midden in de rit.
      s.raak.fn();
      toets('en aantikken werkt', s.bus.raak, 1);
      await stuur('0101');
    });
    toets('de raak-timer is gestopt', s.raak.gestopt, true);
    toets('en het slot is teruggegeven', s.bus.release, 1);
  }

  console.log('\n── geen slot? dan meet de scan door, mét melding ──');
  {
    // Functionaliteit boven discipline, net als withBus(). Maar stil mag het
    // niet: dan meet je door andermans verkeer heen zonder het te weten.
    const s = bouw({ slotBezet: true });
    await s.PLScanSlot.doe('proef', {}, async function (stuur) { await stuur('0101'); });
    toets('het werk is toch gedraaid', s.tx.indexOf('0101') !== -1, true);
    toets('er is niets vrijgegeven', s.bus.release, 0);
    const w = s.btlog.filter(function (x) { return x.niveau === 'warn'; });
    toets('en er staat een waarschuwing', w.length >= 1, true);
    bevat('die zegt wat het gevolg is', w[0].m, 'naast het gewone verkeer');
  }

  console.log('\n── DE KERN: een dode verbinding breekt de scan af ──');
  {
    /* De vlag zet trackBtQuality() uit, dus dit is het enige dat nog merkt dat
       de adapter weg is. Zonder deze afbraak ploetert een scan van 96 PIDs
       stilletjes door op een socket die niet meer bestaat, en staat er
       achteraf "0 gevonden" in plaats van een fout. */
    const s = bouw({ allesLeeg: true, atiDood: true });
    let gevangen = null;
    try {
      await s.PLScanSlot.doe('proef', { leegAchtereen: 3 }, async function (stuur) {
        for (let i = 0; i < 40; i++) await stuur('01' + i);
      });
    } catch (e) { gevangen = e.message; }
    bevat('de scan breekt af met een reden', String(gevangen), 'verbinding weg');
    bevat('en die reden noemt het bewijs', String(gevangen), 'ATI gaf twee keer niets terug');
    // Drie lege, dan twee ATI-pogingen: verder komt hij niet.
    toets('hij stopt meteen, niet na 40 commando\'s', s.tx.length, 5);
    toets('de vlag staat daarna uit', !!s._plScanActief, false);
    toets('en het slot is terug', s.bus.release, 1);
  }

  console.log('\n── een levende adapter laat de scan doorgaan ──');
  {
    // De tegenhanger: alles leeg, maar ATI antwoordt. Dat is een auto die deze
    // PIDs niet heeft — geen storing, en de scan hoort gewoon af te maken.
    const s = bouw({ allesLeeg: true });
    let klaar = false;
    await s.PLScanSlot.doe('proef', { leegAchtereen: 3 }, async function (stuur) {
      for (let i = 0; i < 10; i++) await stuur('01' + i);
      klaar = true;
    });
    toets('de scan is afgemaakt', klaar, true);
    toets('alle tien de PIDs zijn gevraagd',
      s.tx.filter(function (c) { return !/^ATI/.test(c); }).length, 10);
    toets('met ATI-hartslagen ertussen',
      s.tx.filter(function (c) { return /^ATI/.test(c); }).length >= 3, true);
  }

  console.log('\n── zonder sendCmd begint hij er niet aan ──');
  {
    const s = bouw();
    delete s.sendCmd;
    let gevangen = null;
    try { await s.PLScanSlot.doe('proef', {}, async function () { return 1; }); }
    catch (e) { gevangen = e.message; }
    bevat('met een reden die ergens naar wijst', String(gevangen), 'sendCmd ontbreekt');
    toets('en de vlag is niet blijven hangen', !!s._plScanActief, false);
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}

main().catch(function (e) { console.error('FOUT: de test zelf klapte —', e); process.exit(1); });
