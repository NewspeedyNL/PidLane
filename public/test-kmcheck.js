// ══════════════════════════════════════════════════════════════════
// test-kmcheck.js — toetst pidlane-kmcheck.js (PLKm)
// ──────────────────────────────────────────────────────────────────
// WAT HIER TE BEWIJZEN VALT
//
// De km-check doet twee dingen die allebei stil fout kunnen gaan:
//
//   1. van vier bytes een kilometerstand maken zonder de schaal te gokken
//   2. uit meerdere stuurapparaten één oordeel trekken zonder afwezigheid
//      als bewijs te gebruiken
//
// De eerste is de gevaarlijkste: een factor 10 ernaast en de app meldt
// 21.400 km op een auto die er 214.000 liep. De tweede is de duurste: een
// vals alarm bij een koper is een afgeketste koop.
//
// DE TOETSEN ONDERSCHEIDEN, ZE KLOPPEN NIET ALLEEN
// Elke toets hieronder is zo gekozen dat er een aanwijsbare fout bestaat
// die hem rood maakt; die fouten staan als mutatie in plmutate.sh. Waar
// een scenario ook groen zou blijven bij een kapotte regel, staat er een
// tweede scenario naast dat het onderscheid wél maakt — vooral bij de
// schaalkeuze, want dáár is "toevallig het goede antwoord" het makkelijkst.
//
// De module wordt GELADEN, niet nagebouwd: sendCmd en withBus zijn stubs,
// alles daarboven is de echte code, inclusief de finally die de adapter
// terugzet.
//
// Draaien vanuit public/:  node test-kmcheck.js     (exit 0 = goed)
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

// ── De module in een sandbox, met een gestuurde adapter ────────────
function laad(adapter) {
  const s = {
    console: { warn() { }, error() { }, log() { } },
    setTimeout: (fn) => { fn(); return 0; },          // geen echte pauzes in een test
    clearTimeout: () => { },
    connected: true,
    demoMode: false,
    btDiag: () => { },
    _vlVinPseudoniem: async (vin) => 'pd' + String(vin).split('').reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7).toString(16)
  };
  s.window = s;
  s.sendCmd = adapter ? adapter.sendCmd : undefined;
  s.withBus = async (naam, fn) => { if (adapter) adapter.slot.push(naam); return await fn(); };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-kmcheck.js', 'utf8'),
    s, { filename: 'pidlane-kmcheck.js' });
  if (!s.PLKm) throw new Error('PLKm niet gevonden — de module hangt niet meer naar buiten');
  return s.PLKm;
}

// Bytes van een teller, big-endian, zoals een ECU ze op de bus zet.
const bytes = (n, len) => {
  let h = '';
  for (let i = len - 1; i >= 0; i--) h += ((Math.floor(n / Math.pow(256, i))) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
  return h;
};

/* Nep-adapter. Antwoorden hangen aan het HUIDIGE zendadres, want dat is
   precies wat de module moet regelen: zonder een geslaagde ATSH krijgt hij
   het antwoord van een ander stuurapparaat, en dat mag hij niet stilzwijgend
   voor het goede aanzien. */
function maakAdapter(plan) {
  const log = [];
  const slot = [];
  let header = '7DF';
  return {
    log, slot,
    huidigeHeader: () => header,
    sendCmd: async (cmd) => {
      log.push(cmd);
      if (/^ATSH/i.test(cmd)) {
        if (plan.weigerSH && plan.weigerSH === cmd.slice(4)) throw new Error('geweigerd');
        header = cmd.slice(4);
        return 'OK';
      }
      if (/^ATCRA/i.test(cmd)) return plan.craWeigert ? '?' : 'OK';
      if (/^ATDPN/i.test(cmd)) return plan.dpn === undefined ? '6' : plan.dpn;
      if (plan.klapt && plan.klapt === cmd) throw new Error('adapter stuk');
      const tab = plan.antwoord[header] || {};
      return tab[cmd] || 'NO DATA';
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n— 1. een antwoord uit elkaar halen —');
{
  const K = laad(null)._intern;

  eis(JSON.stringify(K.leesDid('7E8 06 62 02 01 00 03 44 A2', '620201', 4).bytes) === '[0,3,68,162]',
    'de vier databytes achter 62 02 01 komen er ongeschonden uit');
  eis(K.naarWaarde([0, 3, 68, 162]) === 214178,
    'big-endian: 00 03 44 A2 = 214178');

  // Onderscheidend: 'NO DATA' bevat geen kop, dus élke poort keurt dat af.
  // Een geweigerde identifier ziet er wél uit als data en moet toch als
  // "bestaat niet" herkend worden — anders leest de module 7F 22 31 als
  // een tellerstand van 0x2231 km.
  const w = K.leesDid('7E8 03 7F 22 31', '620201', 4);
  eis(w.bytes === null && w.reden === 'geweigerd' && w.nrc === '31',
    'een 7F 22 31 is een weigering, geen meting', JSON.stringify(w));
  eis(K.leesDid('NO DATA', '620201', 4).reden === 'stil',
    'NO DATA levert stilte op');
  eis(K.leesDid('7E8 06 62 02 00 11 22 33 44', '620201', 4).reden === 'stil',
    'het antwoord op een ÁNDERE identifier telt niet als antwoord op deze');
  eis(K.leesDid('7E8 62 02 01 00 03', '620201', 4).reden === 'te kort',
    'een afgekapt antwoord wordt niet met nullen aangevuld');
  eis(K.isVulling([255, 255, 255, 255]) && K.isVulling([0, 0, 0, 0]) && !K.isVulling([0, 3, 68, 162]),
    'FF-vulling en nul-vulling zijn geen meting, een echte stand wel');
  eis(K.rxVan('720') === '728' && K.rxVan('726') === '72E' && K.rxVan('7E0') === '7E8',
    'ontvangstadres is zendadres + 8, ook over een nibble heen');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n— 2. de schaal: kiezen of niet kiezen —');
{
  const K = laad(null)._intern;
  const kies = (waarde, schalen, anker) => K.kiesSchaal(K.kandidaten(waarde, schalen), anker);

  // 2140000 × 0,1 = 214.000 km; × 1 zou 2,14 miljoen zijn en dat bestaat niet.
  let r = kies(2140000, [1, 0.1], null);
  eis(r.zeker === true && r.km === 214000,
    'één fysiek mogelijke lezing → schaal staat vast zonder anker');

  // Zonder anker mág er niet gekozen worden: beide lezingen kunnen.
  r = kies(214050, [1, 0.1], null);
  eis(r.zeker === false,
    'twee mogelijke lezingen en geen anker → geen vaste schaal');

  // Met anker: 214.050 ligt binnen een factor 5 van 214.000, 21.405 niet.
  r = kies(214050, [1, 0.1], 214000);
  eis(r.zeker === true && r.viaAnker === true && r.km === 214050,
    'het anker wijst de orde van grootte aan');

  // DE TOETS DIE ERTOE DOET. Een teruggedraaide teller ligt vér van het
  // anker maar wél binnen dezelfde orde van grootte. Wordt hij hier niet
  // vastgezet, dan valt hij uit het oordeel en wordt de fraude niet gezien.
  r = kies(118000, [1, 0.1], 214000);
  eis(r.zeker === true && r.km === 118000,
    'een stand die 96.000 km lager ligt houdt zijn schaal — anders verdwijnt juist de fraude',
    JSON.stringify(r));

  // En de tegenkant: liggen beide lezingen binnen het venster, dan kiest
  // het anker niet. 100.000 en 10.000 tegen een anker van 30.000.
  r = kies(100000, [1, 0.1], 30000);
  eis(r.zeker === false,
    'beide lezingen binnen een factor 5 → het anker beslist niet');

  // Geen enkele lezing in de buurt: ook geen keuze.
  r = kies(214050, [1, 0.1], 900);
  eis(r.zeker === false,
    'geen enkele lezing binnen een factor 5 van het anker → geen keuze');

  // Een anker mag zichzelf niet bevestigen.
  eis(K.kiesAnker([{ rol: 'odo', km: 12345, zeker: true, viaAnker: true }], 250000) === 250000,
    'een via het anker gekozen schaal wordt zelf geen anker');
  eis(K.kiesAnker([{ rol: 'odo', km: 214000, zeker: true }], 250000) === 214000,
    'een schaal die zonder hulp vaststond is wél anker');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n— 3. het oordeel —');
{
  const PLKm = laad(null);
  const meting = (groep, km, extra) => Object.assign(
    { rol: 'odo', groep, module: 'module ' + groep, cmd: '220201', km, zeker: true }, extra || {});

  let o = PLKm.oordeel([], null);
  eis(o.niveau === 'onbekend' && !o.bevindingen.length,
    'niets gelezen → geen oordeel, geen bevinding (afwezigheid is geen bewijs)');

  o = PLKm.oordeel([meting('7E0', 214050)], null);
  eis(o.niveau === 'onbevestigd',
    'één stuurapparaat → gelezen maar niet bevestigd');

  o = PLKm.oordeel([meting('broadcast', 214000), meting('7E0', 214050)], null);
  eis(o.niveau === 'onbevestigd',
    '01A6 en 7E0 kunnen dezelfde doos zijn — samen nog geen bevestiging');

  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000)], null);
  eis(o.niveau === 'ok' && o.onafhankelijkeBronnen === 2 && o.km === 214050,
    'twee adressen die het eens zijn → bevestigd, hoogste stand gerapporteerd');

  // Twee identifiers uit hetzelfde motorblok bevestigen elkaar niet.
  o = PLKm.oordeel([meting('7E0', 214050), Object.assign(meting('7E0', 214050), { cmd: '220200' })], null);
  eis(o.niveau === 'onbevestigd' && o.onafhankelijkeBronnen === 1,
    'twee identifiers op hetzelfde adres tellen als één bron');

  // De kern: dashboard lager dan de rekenende module.
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 118000)], null);
  eis(o.niveau === 'kritiek' && o.bevindingen[0].patroon === 'teller-lager',
    'teller lager dan het motorblok → kritiek, met het patroon benoemd',
    JSON.stringify(o.bevindingen[0] || {}));

  // Spiegelbeeld: de teller staat juist hóger. Ook een verschil, maar niet
  // het patroon van terugdraaien — en dat onderscheid moet in de tekst zitten.
  o = PLKm.oordeel([meting('7E0', 118000), meting('720', 214050)], null);
  eis(o.niveau === 'kritiek' && !o.bevindingen[0].patroon,
    'teller hóger dan het motorblok is een verschil, maar niet dát patroon');

  // Speling: 1% of 500 km, wat groter is. 214.050 vs 213.000 = 1050 < 2141.
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 213000)], null);
  eis(o.niveau === 'ok',
    '1050 km verschil op 214.000 valt binnen de speling van twee rekenwijzen');
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 208000)], null);
  eis(o.niveau === 'kritiek',
    '6050 km verschil op 214.000 valt er buiten');

  // Een onzekere schaal telt niet mee — ook niet als hij alarm zou slaan.
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 11800, { zeker: false })], null);
  eis(o.niveau === 'onbevestigd',
    'een meting zonder vaste schaal levert geen bevinding op');
  eis(o.onzeker.length === 1 && o.bevindingen.some(b => /vaste schaal/.test(b.kop)),
    'maar hij wordt wel genoemd, met zijn reden');

  // De overgetypte stand van de teller.
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000)], 118000);
  eis(o.niveau === 'kritiek' && /lager/.test(o.bevindingen[0].kop),
    'opgegeven stand ver onder de auto → kritiek');
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000)], 300000);
  eis(o.niveau === 'let-op',
    'opgegeven stand hóger dan alle modules → let op, geen beschuldiging');
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000)], 214100);
  eis(o.niveau === 'ok',
    'een overgetypte stand binnen de speling verandert niets');

  // Afstand sinds het wissen van storingen.
  const sinds = km => ({ rol: 'sinds', groep: 'broadcast', module: 'sinds wissen', cmd: '0131', km, zeker: true });
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000), sinds(40)], null);
  eis(o.niveau === 'let-op' && /gewist/.test(o.bevindingen[0].kop),
    '40 km sinds het wissen op een auto van 214.000 → aandachtspunt');
  o = PLKm.oordeel([meting('7E0', 214050), meting('720', 214000), sinds(9000)], null);
  eis(o.niveau === 'ok',
    '9000 km sinds het wissen is gewoon een auto die gereden heeft');
  o = PLKm.oordeel([meting('7E0', 3000), meting('720', 3000), sinds(40000)], null);
  eis(o.niveau === 'kritiek' && /Onmogelijk/.test(o.bevindingen[0].kop),
    'meer gereden sinds het wissen dan in totaal → onmogelijk, dus kritiek');
  o = PLKm.oordeel([meting('7E0', 3000), meting('720', 3000), sinds(65535)], null);
  eis(o.niveau === 'ok',
    'een teller op zijn maximum (65535) levert geen conclusie op');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n— 3b. de VIN per stuurapparaat —');
{
  const PLKm = laad(null);
  const bron = (groep, vinId, staart) => ({ rol: 'vin', module: 'module ' + groep, groep, vinId, vinStaart: staart });
  const blanco = groep => ({ rol: 'vin', module: 'module ' + groep, groep, vinId: null, vinBlanco: true });

  let v = PLKm.vinConsistentie([]);
  eis(v.niveau === 'onbekend' && !v.bevindingen.length,
    'geen enkele VIN gelezen → geen oordeel, geen bevinding');

  v = PLKm.vinConsistentie([bron('7E0', 'pdaaa', '…766507')]);
  eis(v.niveau === 'onbevestigd',
    'één VIN is niets om tegen af te zetten');

  v = PLKm.vinConsistentie([bron('7E0', 'pdaaa', '…766507'), bron('720', 'pdaaa', '…766507')]);
  eis(v.niveau === 'ok' && !v.bevindingen.length,
    'twee stuurapparaten met hetzelfde voertuignummer → in orde');

  // DE TOETS DIE ERTOE DOET. Twee verschillende nummers in één auto kan maar
  // op één manier: één stuurapparaat komt ergens anders vandaan.
  v = PLKm.vinConsistentie([bron('7E0', 'pdaaa', '…766507'), bron('720', 'pdbbb', '…999999')]);
  eis(v.niveau === 'kritiek' && /dezelfde auto/.test(v.bevindingen[0].kop),
    'twee VERSCHILLENDE voertuignummers → kritiek, met de reden erbij',
    JSON.stringify(v.bevindingen[0] || {}));
  eis(/766507/.test(v.bevindingen[0].tekst) && /999999/.test(v.bevindingen[0].tekst),
    'en beide staarten staan erin zodat je ziet wélke module afwijkt');

  // Een blanco VIN is een aandachtspunt, geen beschuldiging — dat onderscheid
  // is het verschil tussen een bruikbaar signaal en een vals alarm.
  v = PLKm.vinConsistentie([bron('7E0', 'pdaaa', '…766507'), bron('720', 'pdaaa', '…766507'), blanco('726')]);
  eis(v.niveau === 'let-op' && /geen bewijs|Dat is géén bewijs/.test(v.bevindingen[0].tekst),
    'een blanco voertuignummer is let op, en het verslag zegt er zelf bij dat het geen bewijs is',
    v.niveau + ' / ' + JSON.stringify(v.bevindingen[0] || {}));

  // En de VIN kan een oordeel dragen zónder één kilometer.
  const o = PLKm.oordeel([bron('7E0', 'pdaaa', '…766507'), bron('720', 'pdbbb', '…999999')], null);
  eis(o.niveau === 'kritiek',
    'op een auto die geen tellerstand vrijgeeft is de VIN-controle het enige oordeel dat er is',
    o.niveau);

  // De maskering: nooit de ruwe VIN vasthouden.
  const K = laad(null)._intern;
  eis(K.isVin('JMZKF6W7600766507') && !K.isVin('B61L-67XK6-B') && !K.isVin('JMZKF6W76007665O7'),
    'een VIN herkennen: 17 tekens uit de ISO-3779-set, dus geen O en geen streepje');
  eis(K.bytesNaarTekst([0x4A, 0x4D, 0x5A, 0x00, 0x00]) === 'JMZ',
    'nulopvulling telt niet mee in de tekst');
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n— 4. de hele rit, met een echte adapter eronder —');
{
  // Een auto met 214.000 km volgens motor en ABS, en 118.000 op de teller.
  const plan = {
    antwoord: {
      '7DF': { '01A6': '41 A6 ' + bytes(2140000, 4), '0131': '41 31 ' + bytes(40, 2) },
      '7E0': { '220201': '62 02 01 ' + bytes(214050, 4) },
      '720': { '226001': '62 60 01 ' + bytes(118000, 4) },
      '7B0': { '222B0B': '62 2B 0B ' + bytes(214100, 4) }
    }
  };
  const ad = maakAdapter(plan);
  const PLKm = laad(ad);

  return PLKm.check({ opgegeven: null }).then(res => {
    const o = res.oordeel;

    eis(ad.slot[0] === 'kmcheck',
      'de check neemt het busslot over voordat hij headers omzet');
    eis(ad.log.indexOf('ATSH7E0') >= 0 && ad.log.indexOf('ATSH720') >= 0 && ad.log.indexOf('ATCRA728') >= 0,
      'elk stuurapparaat wordt met zijn eigen zend- én ontvangstadres benaderd');
    eis(ad.log[ad.log.length - 1] === 'ATCRA' && ad.log.indexOf('ATSH7DF') >= 0,
      'de adapter staat aan het eind weer op broadcast, met het filter gewist',
      ad.log.slice(-4).join(' '));
    eis(ad.huidigeHeader() === '7DF',
      'en dat is niet alleen verstuurd maar ook aangekomen');

    const per = {};
    res.metingen.forEach(m => { if (m.km != null) per[m.id] = m; });
    eis(per['01A6'] && per['01A6'].km === 214000 && per['01A6'].zeker,
      '01A6 heeft één vaste schaal en levert het anker');
    eis(per['7E0-0201'] && per['7E0-0201'].km === 214050 && per['7E0-0201'].viaAnker,
      'het motorblok wordt via dat anker op de goede orde van grootte gezet');
    eis(per['720-6001'] && per['720-6001'].km === 118000 && per['720-6001'].zeker,
      'de teruggedraaide teller houdt zijn schaal en blijft meetellen');
    eis(!per['760-6001'] && !per['726-0202'],
      'stuurapparaten die niet antwoorden leveren geen meting op');

    eis(o.niveau === 'kritiek' && o.bevindingen[0].patroon === 'teller-lager',
      'de hele keten komt uit op: de teller staat lager dan de rest van de auto',
      o.niveau + ' / ' + JSON.stringify(o.bevindingen[0] || {}));
    eis(/118/.test(PLKm.naarPromptRegels(res)) && /214/.test(PLKm.naarPromptRegels(res)),
      'beide standen staan in de regels die naar de AI gaan');
    eis(/pl-km-kritiek/.test(PLKm.render(res)),
      'de weergave draagt het oordeel als klasse');

    // ── Een gezonde auto mag geen alarm geven ──
    const ad2 = maakAdapter({
      antwoord: {
        '7DF': { '01A6': '41 A6 ' + bytes(892340, 4), '0131': '41 31 ' + bytes(9000, 2) },
        '7E0': { '220201': '62 02 01 ' + bytes(89240, 4) },
        '720': { '226001': '62 60 01 ' + bytes(89230, 4) }
      }
    });
    const PL2 = laad(ad2);
    return PL2.check({}).then(r2 => {
      eis(r2.oordeel.niveau === 'ok' && r2.oordeel.km === 89240,
        'drie bronnen die het eens zijn → geen bevinding, 89.240 km',
        r2.oordeel.niveau + ' / ' + r2.oordeel.km);

      // ── De adapter klapt halverwege ──
      const ad3 = maakAdapter({
        antwoord: { '7DF': { '01A6': '41 A6 ' + bytes(892340, 4) } },
        klapt: '220201'
      });
      const PL3 = laad(ad3);
      return PL3.check({}).then(r3 => {
        eis(ad3.huidigeHeader() === '7DF',
          'ook als een commando klapt, staat de adapter daarna weer op broadcast');
        eis(r3.oordeel.niveau === 'onbevestigd',
          'en er komt geen oordeel uit dat er niet in zit');

        // ── Geen 11-bit CAN: geen headers, dus niets te kruisen ──
        const ad4 = maakAdapter({
          dpn: '3', antwoord: { '7DF': { '01A6': 'NO DATA', '0131': 'NO DATA' } }
        });
        const PL4 = laad(ad4);
        return PL4.check({}).then(r4 => {
          eis(ad4.log.every(c => !/^ATSH7E0/.test(c)),
            'zonder 11-bit CAN wordt er geen stuurapparaat aangesproken');
          eis(r4.oordeel.niveau === 'onbekend',
            'en een stille bus levert onbekend op, geen verdenking');
          klaar();
        });
      });
    });
  });
}

function klaar() {
  console.log('\n' + (fouten ? '  ' + fouten + ' van de ' + aantal + ' toetsen FOUT'
    : '  alle ' + aantal + ' toetsen goed'));
  process.exit(fouten ? 1 : 0);
}
