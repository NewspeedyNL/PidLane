// ══════════════════════════════════════════════════════════════════
// test-kaart.js — toetst pidlane-kaart.js (PLKaart)
// ──────────────────────────────────────────────────────────────────
// WAT HIER TE BEWIJZEN VALT
//
// De kaartmaker bestaat omdat élke vorige scan misging, en de oorzaken
// zaten niet in de adressen maar in de laag eronder. Een test die alleen
// het parsen toetst, zou dus precies langs het probleem heen meten. Daarom
// draait hier een nagebouwde ELM327 met een nagebouwde CAN-bus: meerdere
// stuurapparaten, headers die aan of uit kunnen, een ontvangstfilter,
// negatieve antwoorden, en 250 adressen die niets teruggeven.
//
// De vier toetsen die er het meest toe doen:
//
//   · een module wordt gevonden op het id dat ÉCHT antwoordde, ook als dat
//     niet zender+8 is (blok 9 nam +8 aan en kon dus niets bevestigen)
//   · 255 stille adressen op rij breken de scan niet af (de oude
//     dode-socket-detectie deed dat na zes)
//   · de adapter staat na afloop weer op ATH0/7DF, óók als de scan klapt
//   · niets wat schrijft komt door de poort, ook niet als je het erin duwt
//
// De module wordt GELADEN, niet nagebouwd.
//
// Draaien vanuit public/:  node test-kaart.js     (exit 0 = goed)
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

// ══════════════════════════════════════════════════════════════════
// EEN NAGEBOUWDE ELM327 MET EEN NAGEBOUWDE BUS ERACHTER
// ──────────────────────────────────────────────────────────────────
// Vervangt sendCmd — het laagste punt waar één commando één antwoord
// krijgt. Alles daarboven (de fasen, de poort, het herstel) blijft echte
// code. De adapter gedraagt zich zoals een ELM327 dat doet: ATH bepaalt of
// het CAN-id meegestuurd wordt, ATCRA filtert, ATSH kiest de ontvanger, en
// een adres waar niemand zit geeft NIETS terug — geen 'NO DATA', maar een
// lege string, want dát is wat de dode-socket-detectie op scherp zette.
// ══════════════════════════════════════════════════════════════════
/* ISO-TP-framing, zoals een CAN-bus het over de draad zet. Los van de
   simulator gezet zodat de losse toets in deel 2 dezelfde invoer krijgt als
   de scan in deel 4 — en zodat er geen hexreeksen met de hand geteld worden.
   Dit is INVOER, geen kopie van de parser: hier wordt opgeknipt, daar
   aaneengezet. */
function isotp(kop, payloadHex) {
  const n = payloadHex.length / 2;
  const h2 = v => v.toString(16).toUpperCase().padStart(2, '0');
  if (n <= 7) return [kop + h2(n) + payloadHex];
  const uit = [kop + '1' + n.toString(16).toUpperCase().padStart(3, '0') + payloadHex.slice(0, 12)];
  let i = 12, tel = 1;
  while (i < payloadHex.length) {
    uit.push(kop + h2(0x20 | (tel & 0x0F)) + payloadHex.slice(i, i + 14));
    i += 14; tel++;
  }
  return uit;
}

function maakAdapter(bus, opt) {
  opt = opt || {};
  const log = [];
  const st = { hdr: '7DF', cra: null, h: 0, st: '64', at: '1', caf: '1' };
  let teller = 0;

  const frames = (id, bytesHex) => isotp(st.h === '1' ? id : '', bytesHex);

  function ecusVoor(hdr) {
    const uit = [];
    for (const rx in bus) {
      const e = bus[rx];
      if (hdr === '7DF' || hdr === '18DB33F1') { if (e.functioneel !== false) uit.push([rx, e]); }
      else if (e.tx === hdr) uit.push([rx, e]);
    }
    return uit;
  }

  return {
    log, st,
    sendCmd: async (cmd) => {
      log.push(cmd);
      teller++;
      if (opt.klaptNa && teller === opt.klaptNa) throw new Error('adapter stuk');

      const c = String(cmd).toUpperCase();
      if (/^AT/.test(c)) {
        // Een commando dat de adapter niet bereikt geeft NIETS terug — en de
        // ELM-staat verandert dan ook niet. Dit staat bovenaan de AT-tak,
        // want anders beantwoordt de afhandelaar eronder hem alsnog.
        if (opt.atStil && opt.atStil.indexOf(c) >= 0) return '';
        if (/^ATH([01])$/.test(c)) { st.h = opt.negeertATH ? '0' : RegExp.$1; return 'OK'; }
        if (/^ATSH(.+)$/.test(c)) { st.hdr = RegExp.$1; return 'OK'; }
        if (/^ATCRA$/.test(c)) { st.cra = null; return 'OK'; }
        if (/^ATCRA(.+)$/.test(c)) { st.cra = RegExp.$1; return 'OK'; }
        if (/^ATST(.+)$/.test(c)) { st.st = RegExp.$1; return 'OK'; }
        if (/^ATAT(.+)$/.test(c)) { st.at = RegExp.$1; return 'OK'; }
        if (/^ATCAF(.+)$/.test(c)) { st.caf = RegExp.$1; return 'OK'; }
        if (c === 'ATI') return opt.dood ? '' : 'ELM327 v1.5';
        if (c === 'ATRV') return '14.2V';
        if (c === 'ATDPN') return opt.dpn || '6';
        if (c === 'ATDP') return opt.dp || 'ISO 15765-4 (CAN 11/500)';
        return 'OK';
      }

      const lijnen = [];
      for (const [rx, e] of ecusVoor(st.hdr)) {
        if (st.cra && st.cra !== rx) continue;
        const antw = e.antwoord(c);
        if (antw) frames(rx, antw).forEach(l => lijnen.push(l));
      }
      // Een adres waar niemand zit geeft niets terug. Precies dat leverde
      // vroeger na zes keer een volledige herverbinding op.
      return lijnen.join('\r');
    }
  };
}

// Eén stuurapparaat: welke services, welke mode 01-PIDs, welke DIDs.
function ecu(spec) {
  const bitmapVan = (pids, basis) => {
    let bm = 0;
    pids.forEach(p => {
      const n = parseInt(p, 16);
      if (n > basis && n <= basis + 0x20) bm |= (0x80000000 >>> (n - basis - 1));
    });
    if (pids.some(p => parseInt(p, 16) > basis + 0x20)) bm |= 1;
    return (bm >>> 0).toString(16).toUpperCase().padStart(8, '0');
  };
  return {
    tx: spec.tx,
    functioneel: spec.functioneel !== false,
    antwoord(c) {
      const sid = c.slice(0, 2);
      if (spec.diensten.indexOf(sid) < 0) {
        return spec.stilBijOnbekend ? null : '7F' + sid + '11';
      }
      if (sid === '3E') return '7E00';
      if (sid === '01') {
        const pid = c.slice(2, 4);
        if (/^(00|20|40|60|80|A0|C0|E0)$/.test(pid)) {
          const basis = parseInt(pid, 16);
          if (!spec.pids.some(p => parseInt(p, 16) > basis)) return null;
          return '41' + pid + bitmapVan(spec.pids, basis);
        }
        const w = spec.pidData && spec.pidData[pid];
        return w ? '41' + pid + w : null;
      }
      if (sid === '09') return c.slice(2, 4) === '00' ? '4900' + bitmapVan(spec.info09 || [], 0) : null;
      if (sid === '06') return c.slice(2, 4) === '00' ? '4600' + bitmapVan(spec.mids || [], 0) : null;
      if (sid === '22') {
        const did = c.slice(2, 6);
        const w = spec.dids && spec.dids[did];
        if (w == null) return '7F2231';
        if (w === 'LOCKED') return '7F2233';
        if (w === 'PENDING') { spec._pending = (spec._pending || 0) + 1; return spec._pending === 1 ? '7F2278' : '62' + did + 'C0FFEE'; }
        return '6222' === '' ? null : '62' + did + (typeof w === 'function' ? w() : w);
      }
      if (sid === '21') {
        const p = c.slice(2, 4);
        const w = spec.mode21 && spec.mode21[p];
        return w ? '61' + p + w : '7F2131';
      }
      if (sid === '03' || sid === '07' || sid === '0A') return (parseInt(sid, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0') + '00';
      if (sid === '19') return '5902';
      if (sid === '02') return '420000';
      return null;
    }
  };
}

function laad(adapter, plbus) {
  const s = {
    console: { warn() { }, error() { }, log() { } },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => { }, setInterval: () => 1, clearInterval: () => { },
    connected: true, demoMode: false, btDiag: () => { },
    JSON: JSON, Date: Date, Math: Math
  };
  s.window = s;
  s.sendCmd = adapter ? adapter.sendCmd : undefined;
  s.PLBus = plbus || null;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-kaart.js', 'utf8'), s, { filename: 'pidlane-kaart.js' });
  if (!s.PLKaart) throw new Error('PLKaart niet gevonden — de module hangt niet meer naar buiten');
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— 1. de leespoort: niets mag de auto veranderen —');
{
  const P = laad(null).PLKaart;
  const blok = ['1001', '1101', '14FFFFFF', '2EF19012', '2F0301', '2703', '2803',
                '31010203', '3400', '3501', '3601', '3701', '8501', '8703', '04'];
  const door = blok.filter(c => P.magVerzenden(c).mag);
  eis(door.length === 0, 'geen enkele schrijvende service komt door de poort',
    'doorgelaten: ' + door.join(', '));

  const lezen = ['0100', '03', '0600', '0900', '0A', '1902FF', '2100', '22F190', '3E00', 'ATSH7E0'];
  const geweerd = lezen.filter(c => !P.magVerzenden(c).mag);
  eis(geweerd.length === 0, 'alle lezende services en AT-commando\'s mogen wél',
    'geweerd: ' + geweerd.join(', '));

  eis(!P.magVerzenden('3E80').mag,
    '3E80 onderdrukt het antwoord en is dus geen probe — geweerd');
  eis(!P.magVerzenden('ZZ').mag && !P.magVerzenden('').mag,
    'rommel komt er niet doorheen');
  // De leeslijst is de BESLISSENDE lijst: wat er niet op staat mag niet, ook
  // een service die niemand kent. De zwarte lijst eronder bestaat om te zeggen
  // WAAROM iets niet mag; hij is met opzet de tweede grendel en niet de eerste.
  eis(!P.magVerzenden('5A00').mag && !P.magVerzenden('BF01').mag,
    'een onbekende service komt er ook niet doorheen — de leeslijst beslist');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— 2. een antwoord met headers uit elkaar halen —');
{
  const K = laad(null).PLKaart._intern;

  let r = K.splitsRegels('7E80641 00BE3FA813', 11);
  eis(r.length === 1 && r[0].id === '7E8', 'een 11-bit id van drie tekens (oneven reeks)');
  r = K.splitsRegels('07E8064100BE3FA813', 11);
  eis(r.length === 1 && r[0].id === '7E8', 'en met voorloopnul (even reeks) levert hetzelfde id');
  r = K.splitsRegels('18DAF110064100BE3FA813', 29);
  eis(r.length === 1 && r[0].id === '18DAF110', 'een 29-bit id van acht tekens');

  r = K.splitsRegels('7E8064100BE3FA813\r728064111223344', 11);
  eis(r.length === 2 && r[0].id === '7E8' && r[1].id === '728',
    'twee stuurapparaten in één antwoord blijven uit elkaar',
    JSON.stringify(r.map(x => x.id)));
  eis(r[0].data === '4100BE3FA813',
    'en de enkelframe-stuurbyte gaat eraf');

  // DE TOETS DIE ERTOE DOET. Met de headers AAN plakt de adapter een lang
  // antwoord NIET zelf aan elkaar: je krijgt losse frames met hetzelfde id.
  // Een VIN is 20 bytes. Wie dat niet hersamenstelt, leest er zes van.
  const vinPayload = '62F190' + '5746' + '30'.repeat(14) + '31';   // 62 F1 90 + 17 VIN-bytes
  const vinFrames = isotp('7E8', vinPayload);
  eis(vinFrames.length === 3, 'twintig bytes gaan als drie CAN-frames de bus op', vinFrames.join(' '));
  r = K.splitsRegels(vinFrames.join('\r'), 11);
  eis(r.length === 1 && r[0].id === '7E8',
    'drie frames met hetzelfde id zijn één antwoord, geen drie stuurapparaten',
    JSON.stringify(r.map(x => x.id)));
  eis(r[0].data === vinPayload,
    'en de VIN komt er byte voor byte weer uit', r[0].data + ' vs ' + vinPayload);
  eis(r[0].data.length === 0x14 * 2,
    'precies de opgegeven lengte, niet de opvulling van het laatste frame',
    r[0].data.length + ' tekens');

  // De vorm ZONDER headers, die de rest van de app gebruikt, blijft werken.
  r = K.splitsRegels('7E81014490201314D\r0:5A4E31323334\r1:353637383930', 11);
  eis(r.length === 1 && /353637383930$/.test(r[0].data),
    'de genummerde vervolgvorm (headers uit) hoort ook bij de regel ervóór', JSON.stringify(r));

  eis(K.splitsRegels('NO DATA\r>\rSEARCHING...', 11).length === 0,
    'statusregels zijn geen data');

  eis(K.ontpak('4100BE3FA813').bytes.length === 6,
    'ontpak() zet alleen hex om in bytes — het uitpakken zit één laag hoger');

  eis(K.duid([0x41, 0x00, 0xBE], '01').soort === 'positief', 'een 41 op een 01 is positief');
  const w = K.duid([0x7F, 0x22, 0x31], '22');
  eis(w.soort === 'geweigerd' && w.nrc === '31' && /bestaat niet/.test(w.nrcTekst),
    'een 7F 22 31 is een weigering met een leesbare reden');
  eis(K.duid([0x62, 0xF1, 0x90], '22').soort === 'positief', 'en een 62 is een treffer');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— 3. het adresplan —');
{
  const K = laad(null).PLKaart._intern;
  const p11 = K.adresplan(11), p29 = K.adresplan(29);
  eis(p11.adressen.length === 256 && p11.adressen[0].tx === '700' && p11.adressen[255].tx === '7FF',
    '11-bit: 700 t/m 7FF, dus óók de modules buiten 7E0-7E7');
  eis(p11.functioneel === '7DF', 'met 7DF als functioneel adres');
  eis(p29.adressen.length === 256 && p29.adressen[0].tx === '18DA00F1' && p29.functioneel === '18DB33F1',
    '29-bit: 18DAxxF1 met 18DB33F1 functioneel — een auto die daar zit gaf op 7E0 nooit iets');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— 4. de hele scan op een nagebouwde auto —');
{
  // Drie stuurapparaten. Let op de tweede: die antwoordt op 768 terwijl het
  // verzoek naar 720 ging — NIET zender+8. Precies het geval waarin een
  // aangenomen antwoordadres de module onzichtbaar maakt.
  let tik = 0;
  const bus = {
    '7E8': ecu({
      tx: '7E0', diensten: ['01', '03', '06', '07', '09', '0A', '22', '3E'],
      pids: ['01', '05', '0C', '0D', '21'],
      pidData: { '01': '00070000', '05': '5A', '0C': '0FA0', '0D': '32', '21': '0000' },
      info09: ['02'], mids: ['01'],
      dids: { 'F190': '574630303030303030303030303030303031', 'F1A0': '0102030405',
              '0201': () => '000344' + (0xA0 + (tik++ % 3)).toString(16).toUpperCase().padStart(2, '0'),
              '2B0B': 'LOCKED' }
    }),
    '768': ecu({
      tx: '720', functioneel: false, diensten: ['22', '3E'],
      pids: [], dids: { '6001': '0001CD90', 'F190': '574630303030303030303030303030303031' }
    }),
    '72E': ecu({
      tx: '726', functioneel: false, diensten: ['22', '3E', '21'],
      pids: [], dids: { '0202': 'ABCDEF' }, mode21: { '02': '1234' }
    })
  };

  // Kleine trap: dit toetst de mechaniek, niet het uithoudingsvermogen.
  const trap = [
    { naam: 'proef-identificatie', van: 0xF190, tot: 0xF1A0, bron: 'test' },
    { naam: 'proef-OEM', van: 0x0200, tot: 0x0202, bron: 'test' },
    { naam: 'proef-teller', van: 0x6001, tot: 0x6001, bron: 'test' },
    { naam: 'proef-abs', van: 0x2B0B, tot: 0x2B0B, bron: 'test' }
  ];

  const slot = { gepakt: 0, vrij: 0, geraakt: 0 };
  const plbus = {
    wait: async () => { slot.gepakt++; return 77; },
    release: t => { slot.vrij++; return t === 77; },
    raak: () => { slot.geraakt++; return true; }
  };

  const ad = maakAdapter(bus);
  const s = laad(ad, plbus);

  s.PLKaart.scan({ trap, tussenpauzeMs: 0 }).then(K => {
    eis(slot.gepakt === 1 && slot.vrij === 1,
      'de scan pakt het busslot en geeft het weer terug');
    eis(ad.log.indexOf('ATH1') >= 0 && ad.log.indexOf('ATAT0') >= 0 && ad.log.indexOf('ATST0C') >= 0,
      'de adapter gaat in scanstand: headers aan, adaptief timen uit, korte timeout');
    eis(K.headersAan === true,
      'en de scan CONTROLEERT dat de headers werkelijk aanstaan');

    const ids = K.modules.map(m => m.rx).sort();
    eis(JSON.stringify(ids) === '["728","72E","768","7E8"]' || JSON.stringify(ids) === '["72E","768","7E8"]',
      'alle drie de stuurapparaten gevonden', JSON.stringify(ids));

    const m768 = K.modules.filter(m => m.rx === '768')[0];
    eis(!!m768 && m768.tx === '720' && !m768.txAangenomen,
      'de module die op 768 antwoordt op een verzoek naar 720 is WAARGENOMEN, niet aangenomen',
      m768 ? m768.tx + ' aangenomen=' + !!m768.txAangenomen : 'niet gevonden');

    const m7E8 = K.modules.filter(m => m.rx === '7E8')[0];
    eis(m7E8.pids.map(p => p.pid).join(',') === '01,05,0C,0D,21',
      'mode 01 levert exact de PIDs die de ECU declareert — 0x20 is de bitmap zelf, geen datapunt',
      JSON.stringify(m7E8.pids.map(p => p.pid)));
    eis(m7E8.pids.filter(p => p.pid === '0C')[0].bytes === '0FA0',
      'met de ruwe bytes erbij, ongeschonden');

    const dids = m7E8.dids.filter(d => !d.geweigerd).map(d => d.did).sort();
    eis(JSON.stringify(dids) === '["0201","F190","F1A0"]',
      'de DID-trap vindt precies wat bestaat — een 7F 22 31 wordt geen datapunt',
      JSON.stringify(dids));
    eis(m7E8.dids.some(d => d.did === '2B0B' && d.geweigerd === '33'),
      'een identifier die achter beveiliging zit wordt apart genoteerd, niet weggegooid');

    eis(m7E8.dids.filter(d => d.did === '0201')[0].beweegt === true &&
        m7E8.dids.filter(d => d.did === 'F190')[0].beweegt === false,
      'de tweede pas scheidt bewegende datapunten van vaste configuratie');

    const m72E = K.modules.filter(m => m.rx === '72E')[0];
    eis(m72E.mode21.length === 1 && m72E.mode21[0].pid === '02' && m72E.mode21[0].bytes === '1234',
      'mode 21 wordt ook afgezocht waar die dienst leeft');

    eis(K.geweigerd.length === 0, 'de scan zelf stuurt niets wat de poort tegenhoudt');

    // Het herstel. Dit is wat de rest van de app kapotmaakt als het mist.
    const staart = ad.log.slice(-5);
    eis(staart.indexOf('ATH0') >= 0 && staart.indexOf('ATSH7DF') >= 0 &&
        staart.indexOf('ATCRA') >= 0 && staart.indexOf('ATST64') >= 0 && staart.indexOf('ATAT1') >= 0,
      'de adapter staat na afloop weer precies zoals de rest van de app hem verwacht',
      staart.join(' '));
    eis(ad.st.h === '0' && ad.st.hdr === '7DF' && ad.st.cra === null,
      'en dat is niet alleen verstuurd maar ook aangekomen');
    eis(s.window._plScanActief === false, 'de scanvlag staat na afloop weer uit');

    const tekst = s.PLKaart.naarTekst(K);
    eis(/0FA0/.test(tekst) && /BEWEEGT/.test(tekst) && /768/.test(tekst),
      'het verslag draagt de ruwe bytes, het bewegen en de adressen');

    deel5();
  }).catch(e => { console.log('  FOUT scan gooide: ' + e.stack); fouten++; klaar(); });

  // ══════════════════════════════════════════════════════════════════
  function deel5() {
    console.log('\n— 5. de vier structurele blokkades —');

    // (a) 255 stille adressen mogen de scan niet afbreken.
    const eenzaam = { '7E8': ecu({ tx: '7E0', diensten: ['01', '22', '3E'], pids: ['0C'], pidData: { '0C': '0FA0' }, dids: { 'F190': 'AA' } }) };
    const ad2 = maakAdapter(eenzaam);
    const s2 = laad(ad2, plbus);
    s2.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
      .then(K2 => {
        eis(!K2.afgebroken && K2.modules.length === 1,
          '255 adressen zonder antwoord breken de scan niet af — vroeger deed zes dat al',
          K2.afgebroken || '');
        eis(ad2.log.filter(c => c === 'ATI').length >= 2,
          'in ruil daarvoor bewaakt de scan de verbinding zelf met een ATI-hartslag');

        // (b) een adapter die écht dood is, moet wél afbreken.
        const ad3 = maakAdapter(eenzaam, { dood: true });
        const s3 = laad(ad3, plbus);
        return s3.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
          .then(K3 => {
            eis(/verbinding weg/.test(K3.afgebroken || ''),
              'en een adapter die op ATI ook niets zegt, is wél weg — dan stopt de scan',
              K3.afgebroken || 'niet afgebroken');
            eis(ad3.st.hdr === '7DF' && ad3.st.h === '0',
              'ook dán staat de adapter daarna weer goed');

            // (c) een adapter die ATH1 negeert: melden, niet stilzwijgend doorgaan.
            const ad4 = maakAdapter(eenzaam, { negeertATH: true });
            const s4 = laad(ad4, plbus);
            return s4.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
              .then(K4 => {
                eis(K4.headersAan === false,
                  'een adapter die ATH1 negeert wordt betrapt — zonder id is een antwoord anoniem');
                eis(/NIET aan een stuurapparaat/.test(s4.PLKaart.naarTekst(K4)),
                  'en dat staat met zoveel woorden in het verslag');

                // (d) klapt de adapter halverwege, dan nog steeds herstel.
                const ad5 = maakAdapter(eenzaam, { klaptNa: 40 });
                const s5 = laad(ad5, plbus);
                return s5.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
                  .then(K5 => {
                    eis(ad5.st.hdr === '7DF' && ad5.st.h === '0' && ad5.st.st === '64',
                      'een scan die halverwege klapt laat de adapter niet op een gezet header staan');
                    eis(s5.window._plScanActief === false,
                      'en de scanvlag blijft niet hangen — anders blijft de dode-socket-detectie uit');
                    deel5b();
                  });
              });
          });
      }).catch(e => { console.log('  FOUT deel 5: ' + e.stack); fouten++; klaar(); });
  }

  function deel5b() {
    console.log('\n— 5b. breedte vóór diepte (de rit van 04-09) —');
    // Op de CX-5 stonden er achttien stuurapparaten. De eerste opzet liep per
    // module de hele trap af en brak af bij 193 van de 2944 op de EERSTE —
    // zeventien modules waren nooit aangeraakt, en het verslag zei van elk
    // "geen enkele identifier bestaat hier". Dat is afwezigheid als bewijs.
    const drie = {
      '7E8': ecu({ tx: '7E0', diensten: ['01', '22', '3E'], pids: ['0C'], pidData: { '0C': '0FA0' },
                   dids: { 'F190': 'AA', '0201': 'BB' } }),
      '728': ecu({ tx: '720', functioneel: false, diensten: ['22', '3E'], pids: [],
                   dids: { 'F190': 'CC', '0201': 'DD' } }),
      '72E': ecu({ tx: '726', functioneel: false, diensten: ['22', '3E'], pids: [],
                   dids: { 'F190': 'EE', '0202': 'PENDING' } })
    };
    const trapTwee = [
      { naam: 'identificatie', van: 0xF190, tot: 0xF190, bron: 'genormeerd' },
      { naam: 'oem', van: 0x0201, tot: 0x0202, bron: 'veldwaarneming' }
    ];
    const ad7 = maakAdapter(drie);
    const s7 = laad(ad7, plbus);
    let gezien = 0;
    s7.PLKaart.scan({
      trap: trapTwee, tussenpauzeMs: 0,
      // Stoppen zodra de EERSTE trede rond is: dat is precies het geval dat op
      // de auto gebeurde, alleen daar deed een weggevallen socket het.
      onStap: st => { if (st.fase === 'dids' && /^oem/.test(st.tekst)) { gezien++; if (gezien === 1) s7.PLKaart.stop(); } }
    }).then(K7 => {
      const per = {};
      K7.modules.forEach(m => { per[m.rx] = m; });
      const idTreffers = ['7E8', '728', '72E'].filter(rx => (per[rx].dids || []).some(d => d.did === 'F190'));
      eis(idTreffers.length === 3,
        'de identificatie is op ALLE drie de stuurapparaten gelezen vóórdat de tweede trede begon',
        JSON.stringify(idTreffers));

      eis(['7E8', '728', '72E'].every(rx => per[rx].trede['identificatie'] === 'volledig'),
        'en elke module weet dat die trede volledig is afgezocht',
        JSON.stringify(['7E8', '728', '72E'].map(rx => per[rx].trede)));

      // Drie toestanden die uit elkaar moeten blijven, want ze betekenen alle
      // drie iets anders: volledig afgezocht, halverwege gestopt, en nooit
      // aangeraakt. De middelste is de gevaarlijkste — die zag er in het
      // verslag van 04-09 uit als de eerste.
      // De modules worden op adres afgelopen, dus welk adres als eerste aan de
      // tweede trede begint hangt van de sortering af. Wat vaststaat is dat er
      // precies ÉÉN halverwege stopt en de rest die trede nooit krijgt.
      const halve = ['7E8', '728', '72E'].filter(rx => per[rx].trede['oem'] !== undefined);
      eis(halve.length === 1 && /^afgebroken na 1 van 2$/.test(per[halve[0]].trede['oem']),
        'een trede die halverwege stopte meldt zich als afgebroken, met het aantal erbij',
        JSON.stringify(['7E8', '728', '72E'].map(rx => [rx, per[rx].trede])));
      eis(['7E8', '728', '72E'].filter(rx => per[rx].trede['oem'] === undefined).length === 2,
        'en de twee die daarna kwamen hebben die trede helemaal niet gehad');

      const tekst = s7.PLKaart.naarTekst(K7);
      eis(/NIET BEREIKT: oem/.test(tekst),
        'het verslag zegt van de niet-afgezochte trede dat hij NIET BEREIKT is');
      eis(/oem \(afgebroken na 1 van 2\)/.test(tekst),
        'en van de halve trede dat hij half is', tekst.split('\n').filter(l => /mode 22 — afgezocht/.test(l)).join(' | '));
      eis(!/geen enkele identifier bestaat hier in de trap/.test(tekst),
        'en nergens "geen enkele identifier bestaat hier" voor iets dat niet is afgezocht');

      eis(K7.schattingNa && K7.schattingNa.commandos === 3 * 3,
        'de schatting wordt na de ontdekking herrekend met het ECHTE aantal stuurapparaten',
        JSON.stringify(K7.schattingNa));
      // In deze sandbox kost een commando bijna niets, dus de gemeten waarde
      // ligt ver onder de 85 ms die de schatting vóóraf aanneemt. Precies dát
      // maakt de toets onderscheidend: bij een teruggevallen aanname zou hier
      // 85 staan.
      eis(K7.msPerCmd < 50 && K7.msPerCmd < s7.PLKaart.cfg.msPerCmd,
        'en met de GEMETEN snelheid, niet met de aanname vooraf', 'gemeten ' + K7.msPerCmd + ' ms');

      deel5c();
    }).catch(e => { console.log('  FOUT deel 5b: ' + e.stack); fouten++; klaar(); });
  }

  function deel5c() {
    console.log('\n— 5c. herstel moet bewezen worden —');
    // sendCmd() gooit niet als de ELM-poort dicht staat; hij geeft een lege
    // string. Een try/catch ving dus niets en het verslag meldde een geslaagd
    // herstel terwijl er niets was aangekomen. Precies wat er op 04-09 om
    // 11:52:01 gebeurde toen de socket wegviel.
    const een = { '7E8': ecu({ tx: '7E0', diensten: ['22', '3E'], pids: [], dids: { 'F190': 'AA' } }) };
    const ad8 = maakAdapter(een, { atStil: ['ATH0', 'ATSH7DF'] });
    const s8 = laad(ad8, plbus);
    s8.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
      .then(K8 => {
        eis(/ATH0/.test(K8.herstelFout || '') && /ATSH7DF/.test(K8.herstelFout || ''),
          'een herstelcommando dat niet wordt bevestigd, telt als mislukt',
          K8.herstelFout || 'geen herstelFout gemeld');
        eis(/LET OP — adapterherstel/.test(s8.PLKaart.naarTekst(K8)),
          'en dat staat boven in het verslag, niet alleen in de console');

        // Tegenproef: een adapter die alles bevestigt geeft géén herstelfout.
        const ad9 = maakAdapter(een);
        const s9 = laad(ad9, plbus);
        return s9.PLKaart.scan({ trap: [{ naam: 't', van: 0xF190, tot: 0xF190, bron: 'test' }], tussenpauzeMs: 0 })
          .then(K9 => {
            eis(!K9.herstelFout, 'en een adapter die netjes bevestigt levert geen valse alarmering op');

            // NRC 78 = "antwoord volgt later", geen weigering.
            const laat = { '7E8': ecu({ tx: '7E0', diensten: ['22', '3E'], pids: [], dids: { '0202': 'PENDING' } }) };
            const adA = maakAdapter(laat);
            const sA = laad(adA, plbus);
            return sA.PLKaart.scan({ trap: [{ naam: 't', van: 0x0202, tot: 0x0202, bron: 'test' }], tussenpauzeMs: 0 })
              .then(KA => {
                const d = (KA.modules[0].dids || [])[0];
                eis(d && d.bytes === 'C0FFEE',
                  '7F 22 78 betekent "antwoord volgt later" — één keer opnieuw lezen levert het datapunt alsnog',
                  JSON.stringify(d || null));
                deel6();
              });
          });
      }).catch(e => { console.log('  FOUT deel 5c: ' + e.stack); fouten++; klaar(); });
  }

  function deel6() {
    console.log('\n— 6. stoppen en schatten —');
    const P = laad(null, plbus).PLKaart;

    const kort = P.schatting({ modules: 3, trap: [{ van: 0, tot: 100 }] });
    const alles = P.schatting({ volledig: true, modules: 6 });
    eis(kort.ms < alles.ms && alles.ms > 3600e3,
      'een volledige sweep wordt vooraf als uren opgegeven, niet stilzwijgend gestart',
      kort.tekst + ' vs ' + alles.tekst);
    eis(/uur/.test(alles.tekst), 'en dat staat er in woorden bij: ' + alles.tekst);

    const trapNamen = P.trap().map(t => t.naam);
    eis(P.trap().every(t => t.bron && /genormeerd|veldwaarneming/.test(t.bron)),
      'elke trede van de DID-trap zegt of hij genormeerd is of veldwaarneming',
      JSON.stringify(trapNamen));

    // Stoppen midden in een lange sweep.
    const bus2 = { '7E8': ecu({ tx: '7E0', diensten: ['01', '22', '3E'], pids: ['0C'], pidData: { '0C': '0FA0' }, dids: {} }) };
    const ad6 = maakAdapter(bus2);
    const s6 = laad(ad6, plbus);
    let gestopt = false;
    s6.PLKaart.scan({
      trap: [{ naam: 'lang', van: 0x0000, tot: 0x0FFF, bron: 'test' }], tussenpauzeMs: 0,
      onStap: st => { if (!gestopt && st.fase === 'dids') { gestopt = true; s6.PLKaart.stop(); } }
    }).then(K6 => {
      eis(gestopt && K6.gestopt === true, 'stop() breekt een lopende sweep af');
      eis(K6.commandos < 4096, 'en dat scheelt echt werk: ' + K6.commandos + ' commando\'s in plaats van 4096+');
      eis(ad6.st.hdr === '7DF' && ad6.st.h === '0', 'ook na stoppen staat de adapter goed');
      eis(s6.PLKaart.staat().bezig === false, 'en de module weet dat hij niet meer bezig is');
      klaar();
    }).catch(e => { console.log('  FOUT deel 6: ' + e.stack); fouten++; klaar(); });
  }
}

function klaar() {
  console.log('\n' + (fouten ? '  ' + fouten + ' van de ' + aantal + ' toetsen FOUT'
    : '  alle ' + aantal + ' toetsen goed'));
  process.exit(fouten ? 1 : 0);
}
