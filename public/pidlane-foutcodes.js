/* ═══════════════════════════════════════════════════════════════════
   pidlane-foutcodes.js — PLFoutcodes: foutcodes en keuringsstatus
   ───────────────────────────────────────────────────────────────────
   WAAROM ER EEN TWEEDE FOUTCODESCHERM IS (26-09-2026)

   Het bestaande DTC-tabblad (scanDTC/clearDTC in pidlane-graph.js) is
   het eerste wat een monteur of klant opent, en het is het dunst
   uitgewerkte scherm van de app:

     • het leest alleen mode 03 — bevestigde codes. Een storing die zich
       aan het opbouwen is (07, pending) en een code die je niet kúnt
       wissen (0A, permanent) ziet de gebruiker niet;
     • het freeze frame — de toestand van de motor op het moment van de
       storing — bestaat alleen in PLMon, en alleen voor codes die tíjdens
       de sessie ontstaan. Voor codes die er al stonden: nooit;
     • de keuringsstatus (readiness) wordt nergens getoond; van 0101 leest
       de app alleen het MIL-bit;
     • "Wis codes" vraagt confirm(), stuurt 04, kijkt NIET of er 44
       terugkomt en maakt de lijst hoe dan ook leeg. Weigert de ECU (motor
       draait), dan ziet de gebruiker toch "geen codes".

   Dit bestand bouwt hoe het wél hoort, als eigen venster naast het oude.
   Er is niets weggehaald: werkt dit, dan kunnen de andere plekken hierop
   overstappen.

   HOE HET WISSEN HOORT

   Wissen is de enige schrijfactie van de app, en de enige die iets
   onherroepelijk weggooit: de codes, het freeze frame, de readiness-
   monitors én de teller "afstand sinds wissen". Daarom:

     1. eerst uitlezen — zonder verse uitlezing is er geen wisknop;
     2. laten zien wat er verloren gaat, met de uitlezing om te bewaren;
     3. poorten die de app zélf kan meten: contact aan, motor uit (010C),
       stilstand (010D), niet op afstand, verbonden;
     4. 04 sturen en het antwoord LEZEN: 44 = gewist, 7F 04 xx = geweigerd
       mét reden, niets = onbekend;
     5. altijd opnieuw uitlezen en voor/na naast elkaar zetten. Een code die
       meteen terugkomt is nog actief; een permanente code blijft staan tot
       de ECU zelf de reparatie heeft bevestigd — dat is geen fout.

   WAT HIER PUUR IS EN WAT NIET

   parseDtc, parseReadiness, oordeelReadiness, wisUitslag, magWissen en
   vergelijk zijn pure functies: test-foutcodes.js laadt dit bestand met
   vm en toetst ze tegen pidlane-data.js. Alles wat de bus raakt loopt
   via één `stuur(cmd, ms)`, zodat de test een nep-ECU kan aanbieden en
   de demomodus een gesimuleerde auto.

   Laadvolgorde: ná pidlane-bt.js (sendCmd, dtcInfo), pidlane-data.js
   (withBus, ALL_PID_DEFS) en pidlane-diagbundel.js (splitBatchResponse).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    cmdTimeoutMs: 6000,     // 03/07/0A: meerdere ECU's, soms multiframe
    pidTimeoutMs: 3000,
    wisTimeoutMs: 8000,     // 04: sommige ECU's doen er seconden over
    naWissenMs: 1500,       // de ECU even laten bijkomen vóór het na-uitlezen
    busWachtMs: 6000,
    scanGeldigMs: 5 * 60 * 1000   // ouder dan dit: eerst opnieuw uitlezen
  };

  var BRONNEN = [
    { mode: '03', kop: '43', soort: 'bevestigd', label: 'Bevestigd',
      uitleg: 'Storing is vastgesteld; zet meestal het motorlampje aan.' },
    { mode: '07', kop: '47', soort: 'pending', label: 'In afwachting',
      uitleg: 'Eén keer gezien. Komt hij bij een volgende rit terug, dan wordt hij bevestigd.' },
    { mode: '0A', kop: '4A', soort: 'permanent', label: 'Permanent',
      uitleg: 'Niet te wissen. Verdwijnt vanzelf als de ECU na de reparatie zelf vaststelt dat het over is.' }
  ];

  // Freeze-frame-PIDs: mode 02 met dezelfde codering als mode 01, dus de
  // parse komt uit ALL_PID_DEFS — hier staat alleen wélke.
  var FF_PIDS = ['0105', '010C', '010D', '0104', '0111', '0106', '0107'];

  // ── Readiness (J1979, PID 0101 bytes B–D) ─────────────────────────
  // B: bit 0-2 ondersteund (misfire/brandstof/onderdelen), bit 3 = diesel,
  //    bit 4-6 NIET klaar. C: ondersteund, D: NIET klaar — per bit.
  var CONTINU = [
    { id: 'misfire', naam: 'Ontstekingsfouten (misfire)' },
    { id: 'brandstof', naam: 'Brandstofsysteem' },
    { id: 'onderdelen', naam: 'Overige onderdelen' }
  ];
  var MON_VONK = ['Katalysator', 'Verwarmde katalysator', 'Verdampingssysteem (EVAP)',
    'Secundaire lucht', 'Airco-koudemiddel', 'Lambdasonde', 'Lambdasondeverwarming', 'EGR / VVT'];
  var MON_DIESEL = ['NMHC-katalysator', 'NOx-nabehandeling (SCR)', null,
    'Laaddruk', null, 'Uitlaatgassensor', 'Roetfilter (DPF)', 'EGR / VVT'];

  var NRC = {
    '11': 'de ECU kent dit commando niet',
    '12': 'niet ondersteund in deze vorm',
    '22': 'voorwaarden niet juist — meestal draait de motor',
    '31': 'buiten bereik',
    '33': 'toegang geweigerd (beveiliging)',
    '78': 'de ECU is nog bezig'
  };

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pauze = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function diag(msg, lvl) {
    try { if (typeof btDiag === 'function') btDiag('[foutcodes] ' + msg, lvl || 'info'); }
    catch (e) { console.warn('PLFoutcodes: btDiag faalde', e); }
  }

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  /* Ruwe ELM-tekst → berichten. Eén bericht = één antwoord van één ECU.
     Multiframe (ISO-TP, meer dan 2 codes op CAN) ziet er zo uit:
        00A
        0: 43 04 01 71 04
        1: 20 01 33 03 00 00 00
     De oude parser las per regel en zocht '43' — bij multiframe mist hij
     dan alles na frame 0. Hier worden de frames eerst aan elkaar gezet en
     op de opgegeven lengte afgekapt. */
  function berichten(raw) {
    var uit = [];
    var huidig = null;
    String(raw || '').split(/[\r\n]+/).forEach(function (r) {
      var l = r.replace(/>/g, '').trim().toUpperCase();
      if (!l || /SEARCHING|BUS INIT|^OK$/.test(l)) return;
      var ff = l.match(/^([0-9A-F]{3})$/);
      if (ff) { huidig = { hex: '', lengte: parseInt(ff[1], 16) }; uit.push(huidig); return; }
      var fr = l.match(/^[0-9A-F]:\s*(.*)$/);
      if (fr && huidig) { huidig.hex += fr[1].replace(/[^0-9A-F]/g, ''); return; }
      huidig = null;
      uit.push({ hex: l.replace(/[^0-9A-F]/g, ''), lengte: null });
    });
    uit.forEach(function (b) { if (b.lengte != null) b.hex = b.hex.slice(0, b.lengte * 2); });
    return uit.filter(function (b) { return b.hex.length; });
  }

  function woordNaarCode(w) {
    return ['P', 'C', 'B', 'U'][(w >> 14) & 3] + ((w >> 12) & 3) +
      ((w >> 8) & 0xF).toString(16).toUpperCase() +
      ('0' + (w & 0xFF).toString(16).toUpperCase()).slice(-2);
  }

  function isFoutTekst(raw) {
    return /ERROR|UNABLE|STOPPED|BUFFER|CAN ERROR|\?/.test(String(raw || '').toUpperCase());
  }

  /* → null  : geen bruikbaar antwoord (leeg, ERROR, ?) — "niet gelezen"
     → []    : NO DATA of een antwoord zonder codes — "gelezen, leeg"
     → [...] : de codes, uniek, in volgorde van binnenkomst
     Het onderscheid tussen null en [] is het hele punt: "niet gelezen" mag
     nooit als "geen foutcodes" in beeld komen (#218). */
  function parseDtc(raw, kop, isCAN) {
    var t = String(raw || '').toUpperCase();
    if (!t.trim()) return null;
    if (/NO DATA/.test(t)) return [];
    if (isFoutTekst(t)) return null;
    var codes = [], gezien = false;
    berichten(t).forEach(function (b) {
      var hex = b.hex, i = -1;
      if (hex.indexOf(kop) === 0) i = 0;
      else if (/^[0-9A-F]{3}/.test(hex) && hex.indexOf(kop, 3) === 3) i = 3;      // header 7E8
      else if (/^[0-9A-F]{3}/.test(hex) && hex.indexOf(kop, 5) === 5) i = 5;      // header + PCI
      if (i < 0) return;
      gezien = true;
      var body = hex.slice(i + 2);
      if (isCAN && body.length >= 2) {
        var n = parseInt(body.slice(0, 2), 16);
        if (n >= 0 && body.length - 2 >= n * 4) body = body.slice(2, 2 + n * 4);
        else body = body.slice(2);
      }
      for (var j = 0; j + 4 <= body.length; j += 4) {
        var w = parseInt(body.slice(j, j + 4), 16);
        if (!w || isNaN(w)) continue;
        var c = woordNaarCode(w);
        if (codes.indexOf(c) < 0) codes.push(c);
      }
    });
    return gezien ? codes : null;
  }

  /* bytesPerEcu: [[A,B,C,D], ...] — elke ECU die op 0101 antwoordde.
     Samengevoegd: een monitor is ondersteund als één ECU hem draagt, en
     niet klaar als één ondersteunende ECU hem niet klaar meldt. */
  function parseReadiness(bytesPerEcu) {
    var lijst = (bytesPerEcu || []).filter(function (b) { return b && b.length >= 4; });
    if (!lijst.length) return null;
    var mil = false, aantal = 0, diesel = false;
    lijst.forEach(function (b) {
      if (b[0] & 0x80) mil = true;
      aantal = Math.max(aantal, b[0] & 0x7F);
      if (b[1] & 0x08) diesel = true;
    });
    var mons = [];
    CONTINU.forEach(function (m, bit) {
      var ond = lijst.some(function (b) { return b[1] & (1 << bit); });
      var niet = lijst.some(function (b) { return (b[1] & (1 << bit)) && (b[1] & (1 << (bit + 4))); });
      mons.push({ id: m.id, naam: m.naam, continu: true, ondersteund: ond, klaar: ond ? !niet : null });
    });
    var namen = diesel ? MON_DIESEL : MON_VONK;
    for (var bit = 0; bit < 8; bit++) {
      if (!namen[bit]) continue;
      var ond = lijst.some(function (b) { return b[2] & (1 << bit); });
      var niet = lijst.some(function (b) { return (b[2] & (1 << bit)) && (b[3] & (1 << bit)); });
      mons.push({ id: 'm' + bit, naam: namen[bit], continu: false, ondersteund: ond, klaar: ond ? !niet : null });
    }
    var periodiek = mons.filter(function (m) { return !m.continu && m.ondersteund; });
    return {
      mil: mil, aantal: aantal, brandstof: diesel ? 'diesel' : 'benzine',
      monitors: mons,
      ondersteund: periodiek.length,
      nietKlaar: periodiek.filter(function (m) { return !m.klaar; }).map(function (m) { return m.naam; })
    };
  }

  /* De zin die de gebruiker leest. `sinds` = {km, warm, min} uit 0131/0130/014E,
     elk mag null zijn. Oordeelt niet over "komt hij door de keuring": dat
     hangt af van de keuring. Zegt wat het betekent. */
  function oordeelReadiness(rd, sinds, zelfGewist) {
    if (!rd) return { niveau: 'onbekend', kop: 'Keuringsstatus niet gelezen',
      tekst: 'De auto gaf geen antwoord op 0101. Dat zegt niets over de monitors, alleen dat ze niet gemeten zijn.' };
    sinds = sinds || {};
    var vers = (sinds.km != null && sinds.km < 100) || (sinds.warm != null && sinds.warm < 5);
    var sindsTekst = [];
    if (sinds.km != null) sindsTekst.push(sinds.km + ' km');
    if (sinds.warm != null) sindsTekst.push(sinds.warm + '× warmgedraaid');
    if (!rd.ondersteund) return { niveau: 'onbekend', kop: 'Geen monitors gemeld',
      tekst: 'De ECU meldt geen periodieke monitors. Bij oudere of niet-Europese auto\'s komt dat voor.' };
    if (!rd.nietKlaar.length) return { niveau: 'ok', kop: 'Alle ' + rd.ondersteund + ' monitors klaar',
      tekst: 'De auto heeft al zijn zelftests afgerond sinds het laatste wissen' +
        (sindsTekst.length ? ' (' + sindsTekst.join(', ') + ' geleden)' : '') + '.' };
    var t = rd.nietKlaar.length + ' van ' + rd.ondersteund + ' niet klaar: ' + rd.nietKlaar.join(', ') + '. ';
    if (zelfGewist) t += 'Dat hoort zo: je hebt net gewist. Na een paar ritten (koude start, stationair, constant rijden) ' +
      'staan ze weer op klaar. Blijft er één hangen, dan kan dat systeem zelf een probleem hebben.';
    else if (vers) t += 'Het geheugen is kort geleden gewist (' + sindsTekst.join(', ') + ' geleden) — ' +
      'dat kan een accuwissel of reparatie zijn, maar ook dat er vlak vóór deze uitlezing codes weggepoetst zijn.';
    else t += 'Na wissen of een losgekoppelde accu duurt het meestal een paar ritten (koude start, stationair, ' +
      'constant rijden) voor alles weer klaar staat. Blijft één monitor hangen, dan kan dat systeem zelf een probleem hebben.';
    return { niveau: 'let-op', kop: rd.nietKlaar.length + ' monitor' + (rd.nietKlaar.length === 1 ? '' : 's') + ' niet klaar', tekst: t, vers: vers };
  }

  /* Antwoord op 04 → wat er gebeurd is. Géén antwoord is NIET "gewist". */
  function wisUitslag(raw) {
    var t = String(raw || '').toUpperCase();
    var bs = berichten(t).map(function (b) { return b.hex; });
    var weiger = null, ok = false;
    bs.forEach(function (h) {
      // optioneel een CAN-header (7E8) en een PCI-byte (01–07) vóór het antwoord
      var m = h.match(/^(?:[0-9A-F]{3})?(?:0[1-7])?(44|7F04([0-9A-F]{2}))/);
      if (!m) return;
      if (m[1] === '44') ok = true;
      else weiger = m[2];
    });
    if (ok && weiger == null) return { staat: 'bevestigd', tekst: 'De ECU bevestigde het wissen (44).' };
    if (ok) return { staat: 'deels', tekst: 'Eén ECU wiste, een andere weigerde: ' + (NRC[weiger] || 'code ' + weiger) + '.' };
    if (weiger != null) return { staat: 'geweigerd', nrc: weiger,
      tekst: 'De ECU weigerde (7F 04 ' + weiger + '): ' + (NRC[weiger] || 'onbekende reden') + '.' };
    return { staat: 'geen-antwoord', tekst: t.trim() ? 'Onverwacht antwoord: ' + t.trim().slice(0, 40) :
      'Geen antwoord op 04. Of er gewist is, weet de app niet — de uitlezing hieronder zegt het.' };
  }

  /* ctx: {verbonden, demo, remote, rpm, snelheid, scanLeeftijdMs, codesGelezen}
     blokkades = de knop gaat niet aan; waarschuwingen = mag, maar lees dit. */
  function magWissen(ctx) {
    ctx = ctx || {};
    var blok = [], waarsch = [];
    if (ctx.remote) blok.push('Op afstand is de app alleen-lezen. Wissen kan alleen op de telefoon die aan de auto hangt.');
    if (!ctx.verbonden && !ctx.demo) blok.push('Niet verbonden met de adapter.');
    if (ctx.scanLeeftijdMs == null) blok.push('Lees eerst uit — dan zie je wat er verloren gaat.');
    else if (ctx.scanLeeftijdMs > CFG.scanGeldigMs) blok.push('De uitlezing is ouder dan 5 minuten. Lees opnieuw uit.');
    if (ctx.codesGelezen === false) blok.push('De foutcodes zijn niet gelezen. Zonder uitlezing is wissen blind.');
    if (typeof ctx.rpm === 'number' && ctx.rpm > 0) blok.push('De motor draait (' + Math.round(ctx.rpm) + ' tpm). Zet de motor uit en het contact aan.');
    if (typeof ctx.snelheid === 'number' && ctx.snelheid > 0) blok.push('De auto rijdt. Wissen alleen bij stilstand.');
    if (ctx.rpm == null && !ctx.remote && (ctx.verbonden || ctx.demo)) waarsch.push('Het toerental is niet te lezen. Controleer zelf: contact aan, motor uit.');
    return { mag: !blok.length, blokkades: blok, waarschuwingen: waarsch };
  }

  function vergelijk(voor, na) {
    var v = voor || {}, n = na || {};
    var alle = function (s) { return [].concat(s.bevestigd || [], s.pending || [], s.permanent || []); };
    var va = alle(v), nb = alle(n);
    return {
      weg: va.filter(function (c) { return nb.indexOf(c) < 0; }),
      terug: (v.bevestigd || []).filter(function (c) { return (n.bevestigd || []).indexOf(c) >= 0 || (n.pending || []).indexOf(c) >= 0; }),
      permanent: (n.permanent || []).slice(),
      nieuw: nb.filter(function (c) { return va.indexOf(c) < 0; })
    };
  }

  /* Wat er verloren gaat, als lijst zinnen — gebouwd uit de uitlezing zelf. */
  function verlies(s) {
    if (!s) return [];
    var r = [];
    var n = (s.codes.bevestigd || []).length + (s.codes.pending || []).length;
    if (n) r.push(n + ' foutcode' + (n === 1 ? '' : 's') + ' (' + [].concat(s.codes.bevestigd || [], s.codes.pending || []).join(', ') + ')');
    if (s.freeze && s.freeze.code) r.push('het freeze frame van ' + s.freeze.code + ' — de enige momentopname van de motor tijdens de storing');
    if (s.readiness && s.readiness.ondersteund) r.push('de keuringsstatus: alle ' + s.readiness.ondersteund + ' monitors gaan naar "niet klaar"');
    if (s.sinds && s.sinds.km != null) r.push('de teller "afstand sinds wissen" (nu ' + s.sinds.km + ' km) gaat naar 0');
    if (s.sinds && s.sinds.milKm) r.push('de teller "gereden met motorlampje aan" (nu ' + s.sinds.milKm + ' km)');
    return r;
  }

  // ════════════════════════════════════════════════════════════════
  //  BUS
  // ════════════════════════════════════════════════════════════════

  function isCanNu() {
    try { return /^[6-9A-C]/i.test(String((typeof selectedNetwork !== 'undefined' && selectedNetwork && selectedNetwork.id) || '6')); }
    catch (e) { console.warn('PLFoutcodes: protocol onbekend, ga uit van CAN', e); return true; }
  }

  function pidBytes(raw, pid) {
    // Alle ECU's die antwoordden, per regel. splitBatchResponse kent de
    // headers en frame-nummers; hij krijgt één bericht tegelijk.
    var uit = [];
    berichten(raw).forEach(function (b) {
      var hex = b.hex, kop = '41' + pid.slice(2);
      var i = hex.indexOf(kop);
      if (i < 0 || i > 5) return;
      var bytes = [];
      for (var j = i + 4; j + 2 <= hex.length; j += 2) bytes.push(parseInt(hex.slice(j, j + 2), 16));
      if (bytes.length) uit.push(bytes);
    });
    return uit;
  }

  function pidWaarde(raw, pid) {
    var b = pidBytes(raw, pid)[0];
    var def = (typeof ALL_PID_DEFS !== 'undefined') ? ALL_PID_DEFS[pid] : null;
    if (!b || !def || typeof def.parse !== 'function') return null;
    try { var v = def.parse(b); return (typeof v === 'number' && isFinite(v)) ? v : null; }
    catch (e) { console.warn('PLFoutcodes: parse ' + pid + ' faalde', e); return null; }
  }

  function ffWaarde(raw, pid) {
    // Mode 02: 42 PP FF data — dezelfde codering als mode 01.
    var hex = berichten(raw).map(function (b) { return b.hex; }).join('');
    var kop = '42' + pid.slice(2) + '00';
    var i = hex.indexOf(kop);
    if (i < 0) return null;
    var bytes = [];
    for (var j = i + 6; j + 2 <= hex.length; j += 2) bytes.push(parseInt(hex.slice(j, j + 2), 16));
    if (pid === '0102') return bytes.length >= 2 ? ((bytes[0] << 8) | bytes[1]) : null;
    var def = (typeof ALL_PID_DEFS !== 'undefined') ? ALL_PID_DEFS[pid] : null;
    if (!bytes.length || !def || typeof def.parse !== 'function') return null;
    try { return def.parse(bytes); } catch (e) { console.warn('PLFoutcodes: ff ' + pid, e); return null; }
  }

  function echteStuur(cmd, ms) {
    if (typeof sendCmd !== 'function') return Promise.reject(new Error('sendCmd niet beschikbaar'));
    return sendCmd(cmd, ms);
  }

  /* Uitlezen. `stuur` is optioneel (test / demo). Geeft een uitlezing
     terug waarin elk onderdeel zegt óf het gelezen is. */
  async function leesUit(stuur, onStap) {
    stuur = stuur || echteStuur;
    onStap = onStap || function () { };
    var isCAN = stuur.isCAN != null ? stuur.isCAN : isCanNu();
    var s = { tijd: Date.now(), codes: {}, gelezen: {}, readiness: null, sinds: {}, freeze: null, fouten: [] };

    async function vraag(cmd, ms) {
      try { return String(await stuur(cmd, ms) || ''); }
      catch (e) { s.fouten.push(cmd + ': ' + (e.message || e)); diag(cmd + ' faalde: ' + (e.message || e), 'warn'); return ''; }
    }

    onStap('Keuringsstatus (0101)');
    var r01 = await vraag('0101', CFG.pidTimeoutMs);
    s.readiness = parseReadiness(pidBytes(r01, '0101'));

    for (var i = 0; i < BRONNEN.length; i++) {
      var b = BRONNEN[i];
      onStap(b.label + ' (' + b.mode + ')');
      var r = await vraag(b.mode, CFG.cmdTimeoutMs);
      var c = parseDtc(r, b.kop, isCAN);
      s.gelezen[b.soort] = c !== null;
      s.codes[b.soort] = c || [];
    }

    onStap('Sinds het laatste wissen');
    s.sinds.km = pidWaarde(await vraag('0131', CFG.pidTimeoutMs), '0131');
    s.sinds.warm = pidWaarde(await vraag('0130', CFG.pidTimeoutMs), '0130');
    s.sinds.min = pidWaarde(await vraag('014E', CFG.pidTimeoutMs), '014E');
    s.sinds.milKm = pidWaarde(await vraag('0121', CFG.pidTimeoutMs), '0121');

    // Freeze frame alleen als er iets opgeslagen kan zijn: het kost een
    // handvol commando's en zonder bevestigde of pending code is er geen.
    if ((s.codes.bevestigd || []).length || (s.codes.pending || []).length) {
      onStap('Freeze frame (mode 02)');
      var w = ffWaarde(await vraag('020200', CFG.pidTimeoutMs), '0102');
      if (w) {
        s.freeze = { code: woordNaarCode(w), waarden: {} };
        for (var k = 0; k < FF_PIDS.length; k++) {
          var p = FF_PIDS[k];
          var v = ffWaarde(await vraag('02' + p.slice(2) + '00', CFG.pidTimeoutMs), p);
          if (typeof v === 'number' && isFinite(v)) s.freeze.waarden[p] = v;
        }
      }
    }

    onStap('Toerental en snelheid');
    s.rpm = pidWaarde(await vraag('010C', CFG.pidTimeoutMs), '010C');
    s.snelheid = pidWaarde(await vraag('010D', CFG.pidTimeoutMs), '010D');
    return s;
  }

  async function wis(stuur) {
    stuur = stuur || echteStuur;
    var raw = '';
    try { raw = String(await stuur('04', CFG.wisTimeoutMs) || ''); }
    catch (e) { diag('04 faalde: ' + (e.message || e), 'warn'); return { staat: 'geen-antwoord', tekst: 'Versturen mislukte: ' + (e.message || e) }; }
    var u = wisUitslag(raw);
    u.ruw = raw.trim().slice(0, 60);
    diag('04 → ' + u.staat + ' (' + u.ruw + ')', u.staat === 'bevestigd' ? 'ok' : 'warn');
    return u;
  }

  // ── demo: een gesimuleerde auto met iets om te laten zien ─────────
  function demoStuur() {
    var gewist = false;
    var f = function (cmd) {
      var A = {
        '0101': gewist ? '41 01 00 07 65 65' : '41 01 82 07 65 04',
        '03': gewist ? '43 00' : '43 02 01 71 04 20',
        '07': gewist ? '47 00' : '47 01 03 01',
        '0A': '4A 01 04 20',
        '0131': gewist ? '41 31 00 00' : '41 31 0B B8',
        '0130': gewist ? '41 30 00' : '41 30 FF',
        '014E': gewist ? '41 4E 00 00' : '41 4E 12 34',
        '0121': gewist ? '41 21 00 00' : '41 21 00 2A',
        '020200': '42 02 00 01 71',
        '020500': '42 05 00 7B', '020C00': '42 0C 00 0C 80', '020D00': '42 0D 00 00',
        '020400': '42 04 00 40', '021100': '42 11 00 22', '020600': '42 06 00 99', '020700': '42 07 00 A0',
        '010C': '41 0C 00 00', '010D': '41 0D 00'
      };
      if (cmd === '04') { gewist = true; return pauze(600).then(function () { return '44'; }); }
      if (gewist && /^02/.test(cmd)) return pauze(80).then(function () { return 'NO DATA'; });
      return pauze(120).then(function () { return A[cmd] || 'NO DATA'; });
    };
    f.isCAN = true;
    return f;
  }

  // ════════════════════════════════════════════════════════════════
  //  VENSTER
  // ════════════════════════════════════════════════════════════════

  var _st = { scan: null, voor: null, na: null, uitslag: null, bezig: false, stap: '', fout: null, akkoord: false, fase: 'lijst' };
  var _demo = null;

  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { return false; } }
  function isRemote() { return !!window._remoteVehicleMode; }
  function stuurNu() { if (isDemo()) { _demo = _demo || demoStuur(); return _demo; } return echteStuur; }

  function info(code) {
    try { if (typeof dtcInfo === 'function') return dtcInfo(code) || {}; }
    catch (e) { console.warn('PLFoutcodes: dtcInfo faalde voor ' + code, e); }
    return {};
  }

  function metBus(werk) {
    if (isDemo()) return werk();
    if (typeof withBus === 'function') return withBus('foutcodes', werk, CFG.busWachtMs);
    return werk();
  }

  function ctxNu() {
    var s = _st.scan;
    return {
      verbonden: isVerbonden(), demo: isDemo(), remote: isRemote(),
      rpm: s ? s.rpm : null, snelheid: s ? s.snelheid : null,
      scanLeeftijdMs: s ? Date.now() - s.tijd : null,
      codesGelezen: s ? !!s.gelezen.bevestigd : null
    };
  }

  var CSS =
    '#plFcOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plFcOv .fc-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:520px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f)}' +
    '#plFcOv .fc-kop{display:flex;align-items:center;gap:9px}' +
    '#plFcOv .fc-t{font:800 16px var(--f);color:var(--tx)}' +
    '#plFcOv .fc-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
    '#plFcOv .fc-sub{font-size:12px;color:var(--tx3);margin:2px 0 12px}' +
    '#plFcOv .fc-blok{background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:11px 12px;margin-bottom:10px}' +
    '#plFcOv .fc-bh{display:flex;align-items:center;gap:8px;font:800 13px var(--f);color:var(--tx);margin-bottom:6px}' +
    '#plFcOv .fc-bh .fc-n{margin-left:auto;font:700 11px var(--f);color:var(--tx3)}' +
    '#plFcOv .fc-uitleg{font-size:11px;color:var(--tx3);margin-bottom:7px}' +
    '#plFcOv .fc-code{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--bd)}' +
    '#plFcOv .fc-code:first-of-type{border-top:0}' +
    '#plFcOv .fc-cc{font:800 14px ui-monospace,monospace;color:var(--tx);min-width:56px}' +
    '#plFcOv .fc-cd{font-size:12px;color:var(--tx2)} #plFcOv .fc-cb{font-size:11px;color:var(--tx3);margin-top:2px}' +
    '#plFcOv .fc-leeg{font-size:12px;color:var(--tx3)} #plFcOv .fc-ok{color:var(--gr,#22c55e)} #plFcOv .fc-let{color:var(--or,#f59e0b)} #plFcOv .fc-rood{color:var(--rd,#ef4444)}' +
    '#plFcOv .fc-mon{display:grid;grid-template-columns:1fr auto;gap:4px 10px;font-size:12px;color:var(--tx2)}' +
    '#plFcOv .fc-mon .fc-nvt{color:var(--tx3)}' +
    '#plFcOv .fc-ff{display:grid;grid-template-columns:1fr auto;gap:3px 10px;font-size:12px;color:var(--tx2)}' +
    '#plFcOv .fc-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}' +
    '#plFcOv .fc-k{flex:1 1 140px;padding:11px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
    '#plFcOv .fc-k.hoofd{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plFcOv .fc-k.gevaar{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.5);color:var(--rd,#ef4444)}' +
    '#plFcOv .fc-k:disabled{opacity:.45;cursor:not-allowed}' +
    '#plFcOv ul{margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--tx2)} #plFcOv li{margin:3px 0}' +
    '#plFcOv .fc-vink{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:var(--tx2);margin:10px 0}' +
    '#plFcOv .fc-vink input{width:18px;height:18px;margin-top:1px}' +
    '#plFcOv .fc-melding{font-size:12px;padding:9px 11px;border-radius:9px;margin-bottom:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);color:var(--tx2)}' +
    '#plFcOv .fc-melding.rood{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.45)}' +
    '#plFcOv .fc-melding.groen{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.45)}';

  function zorgCss() {
    if (document.getElementById('plFcCss')) return;
    var st = document.createElement('style');
    st.id = 'plFcCss';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function open() {
    zorgCss();
    var ov = document.getElementById('plFcOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'plFcOv';
      ov.innerHTML = '<div class="fc-doos"><div class="fc-kop"><div class="fc-t">🩺 Foutcodes &amp; keuringsstatus</div>' +
        '<button class="fc-x" aria-label="Sluiten" onclick="PLFoutcodes.sluit()">✕</button></div>' +
        '<div class="fc-sub">Alle soorten foutcodes, het freeze frame en welke zelftests de auto heeft afgerond.</div>' +
        '<div id="plFcBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.style.display = 'flex';
    _st.fase = 'lijst';
    teken();
    // Verbonden en nog niets gelezen: meteen uitlezen — dat is waarvoor je
    // dit venster opent.
    if (!_st.scan && !_st.bezig && (isVerbonden() || isDemo()) && !isRemote()) scan();
  }

  function sluit() {
    var ov = document.getElementById('plFcOv');
    if (ov) ov.style.display = 'none';
  }

  async function scan() {
    if (_st.bezig) return;
    _st.bezig = true; _st.fout = null; _st.stap = 'verbinden…';
    teken();
    try {
      var s = await metBus(function () {
        return leesUit(stuurNu(), function (t) { _st.stap = t; teken(); });
      });
      _st.scan = s;
      try { if (typeof registerSessionReport === 'function') registerSessionReport({ type: 'dtc', title: 'Foutcodes & keuringsstatus', text: alsTekst(s) }); }
      catch (e) { console.warn('PLFoutcodes: archiveren faalde', e); }
      return s;
    } catch (e) {
      _st.fout = 'Uitlezen mislukt: ' + (e.message || e);
      console.warn('PLFoutcodes.scan', e);
      return null;
    } finally {
      _st.bezig = false; _st.stap = '';
      teken();
    }
  }

  function naarWissen() {
    _st.fase = 'wissen'; _st.akkoord = false; _st.uitslag = null; _st.voor = null; _st.na = null;
    teken();
  }

  async function voerWisUit() {
    var m = magWissen(ctxNu());
    if (!m.mag || !_st.akkoord || _st.bezig) return;
    _st.bezig = true; _st.stap = 'foutcodes wissen (04)…'; _st.voor = _st.scan;
    teken();
    try {
      await metBus(async function () {
        var st = stuurNu();
        // Toerental op het laatste moment opnieuw: de uitlezing kan minuten
        // oud zijn en in de tussentijd kan iemand gestart hebben.
        var rpm = pidWaarde(String(await st('010C', CFG.pidTimeoutMs) || ''), '010C');
        if (typeof rpm === 'number' && rpm > 0) {
          _st.uitslag = { staat: 'geblokkeerd', tekst: 'De motor draait nu (' + Math.round(rpm) + ' tpm). Niets verstuurd.' };
          return;
        }
        _st.uitslag = await wis(st);
        _st.stap = 'opnieuw uitlezen…'; teken();
        await pauze(CFG.naWissenMs);
        _st.na = await leesUit(st, function (t) { _st.stap = 'na het wissen: ' + t; teken(); });
        _st.scan = _st.na;
      });
      try { if (typeof log === 'function') log('Foutcodes wissen: ' + (_st.uitslag && _st.uitslag.staat), _st.uitslag && _st.uitslag.staat === 'bevestigd' ? 'ok' : 'warn'); }
      catch (e) { console.warn('PLFoutcodes: log faalde', e); }
    } catch (e) {
      _st.uitslag = { staat: 'fout', tekst: 'Wissen liep niet af: ' + (e.message || e) };
      console.warn('PLFoutcodes.wis', e);
    } finally {
      _st.bezig = false; _st.stap = ''; _st.fase = 'na';
      teken();
    }
  }

  function bewaar() {
    var s = _st.scan;
    if (!s) return;
    var tekst = alsTekst(s);
    try {
      if (typeof plOpslaan === 'function') { plOpslaan('foutcodes', tekst, { titel: 'Foutcodes & keuringsstatus' }); return; }
      if (typeof download === 'function') { download('foutcodes.txt', tekst); return; }
    } catch (e) { console.warn('PLFoutcodes: opslaan faalde', e); }
    try { if (typeof showToast === 'function') showToast('Opslaan is hier niet beschikbaar'); } catch (e) { console.warn(e); }
  }

  function alsTekst(s) {
    var v = {};
    try { if (typeof getVehicle === 'function') v = getVehicle() || {}; } catch (e) { console.warn('PLFoutcodes: voertuig onbekend', e); }
    var r = ['PidLane — Foutcodes & keuringsstatus', 'Datum: ' + new Date(s.tijd).toLocaleString('nl')];
    if (v.merk) r.push('Voertuig: ' + [v.merk, v.model, v.year].filter(Boolean).join(' '));
    BRONNEN.forEach(function (b) {
      r.push('', '=== ' + b.label.toUpperCase() + ' (mode ' + b.mode + ') ===');
      if (!s.gelezen[b.soort]) { r.push(' niet gelezen'); return; }
      if (!s.codes[b.soort].length) { r.push(' geen'); return; }
      s.codes[b.soort].forEach(function (c) { r.push(' ' + c + ' — ' + (info(c).desc || '?')); });
    });
    r.push('', '=== FREEZE FRAME ===');
    if (s.freeze) {
      r.push(' veroorzaakt door ' + s.freeze.code);
      Object.keys(s.freeze.waarden).forEach(function (p) {
        var d = (typeof ALL_PID_DEFS !== 'undefined' && ALL_PID_DEFS[p]) || {};
        r.push(' ' + (d.name || p) + ': ' + fmt(s.freeze.waarden[p]) + ' ' + (d.unit || ''));
      });
    } else r.push(' geen');
    r.push('', '=== KEURINGSSTATUS ===');
    var o = oordeelReadiness(s.readiness, s.sinds);
    r.push(' ' + o.kop + '. ' + o.tekst);
    if (s.readiness) s.readiness.monitors.filter(function (m) { return m.ondersteund; }).forEach(function (m) {
      r.push(' ' + (m.klaar ? '[klaar]      ' : '[niet klaar] ') + m.naam);
    });
    r.push('', '=== SINDS HET LAATSTE WISSEN ===',
      ' afstand: ' + (s.sinds.km != null ? s.sinds.km + ' km' : 'onbekend'),
      ' warmgedraaid: ' + (s.sinds.warm != null ? s.sinds.warm + '×' : 'onbekend'),
      ' met motorlampje aan: ' + (s.sinds.milKm != null ? s.sinds.milKm + ' km' : 'onbekend'));
    return r.join('\n');
  }

  function fmt(v) { return (Math.round(v * 10) / 10).toLocaleString('nl'); }

  function tekenCodes(s, b) {
    var h = '<div class="fc-blok"><div class="fc-bh">' +
      (b.soort === 'bevestigd' ? '🔴' : b.soort === 'pending' ? '🟠' : '🔒') + ' ' + esc(b.label) +
      '<span class="fc-n">mode ' + b.mode + '</span></div><div class="fc-uitleg">' + esc(b.uitleg) + '</div>';
    if (!s.gelezen[b.soort]) return h + '<div class="fc-leeg fc-let">Niet gelezen — de auto gaf geen bruikbaar antwoord. Dat is níét hetzelfde als "geen codes".</div></div>';
    if (!s.codes[b.soort].length) return h + '<div class="fc-leeg fc-ok">Geen</div></div>';
    s.codes[b.soort].forEach(function (c) {
      var i = info(c);
      h += '<div class="fc-code"><div class="fc-cc">' + esc(c) + '</div><div><div class="fc-cd">' + esc(i.desc || 'Onbekende code') + '</div>' +
        (i.body ? '<div class="fc-cb">' + esc(i.body) + '</div>' : '') + '</div></div>';
    });
    return h + '</div>';
  }

  function tekenFreeze(s) {
    var h = '<div class="fc-blok"><div class="fc-bh">📸 Freeze frame<span class="fc-n">mode 02</span></div>' +
      '<div class="fc-uitleg">De toestand van de motor op het moment dat de storing werd opgeslagen.</div>';
    if (!s.freeze) return h + '<div class="fc-leeg">' + ((s.codes.bevestigd || []).length || (s.codes.pending || []).length ? 'De ECU heeft geen freeze frame opgeslagen.' : 'Niet van toepassing: geen codes.') + '</div></div>';
    h += '<div class="fc-uitleg">Opgeslagen bij <b>' + esc(s.freeze.code) + '</b></div><div class="fc-ff">';
    Object.keys(s.freeze.waarden).forEach(function (p) {
      var d = (typeof ALL_PID_DEFS !== 'undefined' && ALL_PID_DEFS[p]) || {};
      h += '<div>' + esc(d.name || p) + '</div><div><b>' + esc(fmt(s.freeze.waarden[p])) + '</b> ' + esc(d.unit || '') + '</div>';
    });
    return h + '</div></div>';
  }

  function tekenReadiness(s, zelfGewist) {
    var o = oordeelReadiness(s.readiness, s.sinds, zelfGewist);
    var kl = o.niveau === 'ok' ? 'fc-ok' : o.niveau === 'let-op' ? 'fc-let' : '';
    var h = '<div class="fc-blok"><div class="fc-bh">🚦 Keuringsstatus (readiness)<span class="fc-n">0101</span></div>' +
      '<div class="fc-cd ' + kl + '" style="font-weight:700">' + esc(o.kop) + '</div>' +
      '<div class="fc-cb" style="margin-bottom:8px">' + esc(o.tekst) + '</div>';
    if (s.readiness) {
      if (s.readiness.mil) h += '<div class="fc-cd fc-rood" style="margin-bottom:6px">Motorlampje staat AAN (' + s.readiness.aantal + ' code' + (s.readiness.aantal === 1 ? '' : 's') + ' volgens de ECU)</div>';
      h += '<div class="fc-mon">';
      s.readiness.monitors.forEach(function (m) {
        if (!m.ondersteund) return;
        h += '<div>' + esc(m.naam) + (m.continu ? ' <span class="fc-nvt">· doorlopend</span>' : '') + '</div>' +
          '<div class="' + (m.klaar ? 'fc-ok' : 'fc-let') + '">' + (m.klaar ? '✓ klaar' : '… niet klaar') + '</div>';
      });
      h += '</div>';
    }
    var sd = s.sinds || {};
    h += '<div class="fc-uitleg" style="margin:9px 0 0">Sinds het laatste wissen: ' +
      (sd.km != null ? sd.km + ' km' : 'afstand onbekend') + ' · ' +
      (sd.warm != null ? sd.warm + '× warmgedraaid' : 'warmdraaien onbekend') +
      (sd.milKm ? ' · ' + sd.milKm + ' km met motorlampje aan' : '') + '</div>';
    return h + '</div>';
  }

  function tekenLijst() {
    var s = _st.scan;
    var h = '';
    if (isRemote()) h += '<div class="fc-melding">Op afstand: dit venster leest de auto niet uit. Open het op de telefoon die aan de auto hangt.</div>';
    else if (!isVerbonden() && !isDemo()) {
      h += '<div class="fc-melding">Niet verbonden. Steek de adapter in de OBD-poort, zet het contact aan en verbind.</div>' +
        '<div class="fc-knoppen" style="margin-bottom:10px"><button class="fc-k hoofd" onclick="PLFoutcodes.sluit();try{connectSerial()}catch(e){console.warn(e)}">🔌 Verbinden</button></div>';
    }
    if (isDemo()) h += '<div class="fc-melding">Demomodus — een gesimuleerde auto, geen echte uitlezing.</div>';
    if (_st.fout) h += '<div class="fc-melding rood">' + esc(_st.fout) + '</div>';
    if (_st.bezig) h += '<div class="fc-melding">⏳ Bezig: ' + esc(_st.stap) + '</div>';
    if (s) {
      h += '<div class="fc-uitleg">Uitgelezen om ' + new Date(s.tijd).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' }) + '</div>';
      BRONNEN.forEach(function (b) { h += tekenCodes(s, b); });
      h += tekenFreeze(s) + tekenReadiness(s);
    }
    var kan = (isVerbonden() || isDemo()) && !isRemote() && !_st.bezig;
    h += '<div class="fc-knoppen">' +
      '<button class="fc-k hoofd" ' + (kan ? '' : 'disabled') + ' onclick="PLFoutcodes.scan()">' + (s ? '🔄 Opnieuw uitlezen' : '🔍 Uitlezen') + '</button>' +
      (s ? '<button class="fc-k" onclick="PLFoutcodes.bewaar()">💾 Bewaren</button>' : '') +
      '</div>';
    if (s) h += '<div class="fc-knoppen" style="margin-top:8px"><button class="fc-k gevaar" ' + (_st.bezig ? 'disabled' : '') +
      ' onclick="PLFoutcodes.naarWissen()">🗑 Foutcodes wissen…</button></div>';
    return h;
  }

  function tekenWissen() {
    var s = _st.scan;
    var m = magWissen(ctxNu());
    var h = '<div class="fc-blok"><div class="fc-bh">🗑 Foutcodes wissen</div>' +
      '<div class="fc-cd" style="margin-bottom:6px">Wissen repareert niets. Is de oorzaak er nog, dan komt de code terug en gaat het lampje weer aan.</div>' +
      '<div class="fc-cd" style="font-weight:700;margin-top:8px">Wat er verloren gaat</div><ul>';
    var v = verlies(s);
    if (!v.length) h += '<li>Er staat niets dat verloren gaat.</li>';
    v.forEach(function (x) { h += '<li>' + esc(x) + '</li>'; });
    h += '</ul>';
    if ((s && s.codes.permanent || []).length) h += '<div class="fc-cb" style="margin-top:6px">Permanente codes (' + esc(s.codes.permanent.join(', ')) + ') blijven staan — die kun je niet wissen.</div>';
    h += '<div class="fc-cb" style="margin-top:8px">Verkoop of keuring in zicht? Na wissen staan de monitors een paar ritten op "niet klaar", en dat ziet elk uitleesapparaat.</div></div>';

    if (m.blokkades.length) {
      h += '<div class="fc-melding rood"><b>Nu niet mogelijk</b><ul>';
      m.blokkades.forEach(function (b) { h += '<li>' + esc(b) + '</li>'; });
      h += '</ul></div>';
    }
    m.waarschuwingen.forEach(function (w) { h += '<div class="fc-melding">' + esc(w) + '</div>'; });
    if (!m.blokkades.length) h += '<div class="fc-melding groen">✓ Contact aan, motor uit, stilstand — de voorwaarden zijn in orde.</div>';

    h += '<label class="fc-vink"><input type="checkbox" id="plFcAkkoord" ' + (_st.akkoord ? 'checked' : '') +
      ' onchange="PLFoutcodes._akkoord(this.checked)"><span>Ik heb de uitlezing bewaard of heb hem niet meer nodig, en de oorzaak is verholpen.</span></label>';
    if (_st.bezig) h += '<div class="fc-melding">⏳ ' + esc(_st.stap) + '</div>';
    h += '<div class="fc-knoppen"><button class="fc-k" onclick="PLFoutcodes.bewaar()">💾 Eerst bewaren</button>' +
      '<button class="fc-k gevaar" id="plFcWisKnop" ' + (m.mag && _st.akkoord && !_st.bezig ? '' : 'disabled') + ' onclick="PLFoutcodes.voerWisUit()">🗑 Nu wissen</button></div>' +
      '<div class="fc-knoppen" style="margin-top:8px"><button class="fc-k" ' + (_st.bezig ? 'disabled' : '') + ' onclick="PLFoutcodes._terug()">← Terug naar de uitlezing</button></div>';
    return h;
  }

  function tekenNa() {
    var u = _st.uitslag || { staat: 'fout', tekst: 'Geen uitslag.' };
    var kl = u.staat === 'bevestigd' ? 'groen' : (u.staat === 'geweigerd' || u.staat === 'fout' || u.staat === 'geblokkeerd') ? 'rood' : '';
    var h = '<div class="fc-melding ' + kl + '"><b>' +
      ({ bevestigd: '✓ Gewist', deels: 'Deels gewist', geweigerd: '✕ Niet gewist', 'geen-antwoord': '? Onbekend', geblokkeerd: '✕ Niet verstuurd', fout: '✕ Mislukt' }[u.staat] || u.staat) +
      '</b><br>' + esc(u.tekst) + '</div>';
    if (_st.voor && _st.na) {
      var d = vergelijk(_st.voor.codes, _st.na.codes);
      h += '<div class="fc-blok"><div class="fc-bh">Voor en na</div><ul>';
      h += '<li>Weg: ' + (d.weg.length ? esc(d.weg.join(', ')) : 'niets') + '</li>';
      if (d.terug.length) h += '<li class="fc-let">Meteen terug: ' + esc(d.terug.join(', ')) + ' — de storing is nog actief. Zoek de oorzaak.</li>';
      if (d.permanent.length) h += '<li>Blijft staan (permanent): ' + esc(d.permanent.join(', ')) + ' — verdwijnt pas als de ECU de reparatie zelf bevestigt.</li>';
      if (d.nieuw.length) h += '<li class="fc-let">Nieuw verschenen: ' + esc(d.nieuw.join(', ')) + '</li>';
      h += '</ul>';
      if (u.staat === 'geen-antwoord' && !d.weg.length && (_st.voor.codes.bevestigd || []).length) h += '<div class="fc-cb fc-let" style="margin-top:6px">De codes staan er nog: er is waarschijnlijk niet gewist.</div>';
      h += '</div>';
    }
    if (_st.scan) {
      h += tekenReadiness(_st.scan, !!_st.uitslag && (_st.uitslag.staat === 'bevestigd' || _st.uitslag.staat === 'deels'));
      BRONNEN.forEach(function (b) { h += tekenCodes(_st.scan, b); });
    }
    h += '<div class="fc-knoppen"><button class="fc-k hoofd" onclick="PLFoutcodes._terug()">Klaar</button>' +
      '<button class="fc-k" onclick="PLFoutcodes.bewaar()">💾 Bewaren</button></div>';
    return h;
  }

  function teken() {
    var body = document.getElementById('plFcBody');
    if (!body) return;
    body.innerHTML = _st.fase === 'wissen' ? tekenWissen() : _st.fase === 'na' ? tekenNa() : tekenLijst();
  }

  window.PLFoutcodes = {
    open: open,
    sluit: sluit,
    scan: scan,
    bewaar: bewaar,
    naarWissen: naarWissen,
    voerWisUit: voerWisUit,
    staat: function () { return _st; },
    _akkoord: function (v) { _st.akkoord = !!v; teken(); },
    _terug: function () { if (_st.bezig) return; _st.fase = 'lijst'; teken(); },
    // pure kern en bus — voor test-foutcodes.js
    parseDtc: parseDtc,
    parseReadiness: parseReadiness,
    oordeelReadiness: oordeelReadiness,
    wisUitslag: wisUitslag,
    magWissen: magWissen,
    vergelijk: vergelijk,
    verlies: verlies,
    leesUit: leesUit,
    wis: wis,
    alsTekst: alsTekst,
    demoStuur: demoStuur,
    cfg: CFG
  };
})();
