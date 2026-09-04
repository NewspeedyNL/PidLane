/* ═══════════════════════════════════════════════════════════════════
   pidlane-kaart.js — PLKaart: de volledige datapuntenkaart
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Elke poging tot nu toe was raden. Blok 9 gokte 256 identifiers in de
   11xx-reeks op 7E0 en vond niets; de km-check gokt Ford-nummers op
   Mazda-adressen. Raden werkt niet, en het gekke is: het hoeft ook
   niet. Een auto VERTELT wat hij kan, als je het goed vraagt:

     · elk stuurapparaat dat antwoordt, noemt zijn eigen adres — mits
       de headers aanstaan
     · mode 01 heeft een bitmap van precies de PIDs die bestaan
     · mode 06 en 09 idem
     · mode 22 antwoordt met 7F 22 31 op wat niet bestaat, en met 62 op
       wat wél bestaat

   Deze module raadt daarom niets. Hij vraagt, en schrijft op wat er
   terugkomt — mét de ruwe bytes, zodat het achteraf te herlezen is.

   ═══════════════════════════════════════════════════════════════════
   WAT ER STRUCTUREEL MIS WAS, EN WAAROM ELKE VORIGE SCAN STUKLIEP

   Vijf dingen, en geen ervan zat in de scan zelf. Ze zaten eronder.

   1. DE HEADERS STONDEN UIT. `ATH0` staat in beide init-reeksen van
      pidlane-bt.js. Zonder headers is een antwoord anoniem: je weet
      niet wélk stuurapparaat het gaf. Blok 9 kon dus principieel niet
      vaststellen dat 7E0 antwoordde — alleen dát er iets antwoordde.
      Een kaart zonder adressen is geen kaart. Deze module zet `ATH1`
      aan voor de duur van de scan en in een finally weer uit.

   2. HET BUSSLOT BRAK DE SCAN AF NA DRIE MINUTEN. `PLBus.MAX_HOLD_MS`
      is 180 s: daarna geldt de houder als vastgelopen en pakt de
      volgende aanvrager het slot af. Een scan die legitiem tien
      minuten duurt, werd dus halverwege onteigend — met de adapter op
      een gezet header, en zonder dat de scan het merkte. `PLBus.raak()`
      is daarvoor toegevoegd: wie zich blijft melden, hangt niet.

   3. DE SCAN SLOOPTE ZIJN EIGEN VERBINDING. `trackBtQuality()` telt
      écht lege responses; zes op rij betekent "socket dood" en start
      een volledige herverbinding. Een sweep over 256 adressen waarvan
      er 250 niet bestaan, levert die zes moeiteloos. De scan verbrak
      dus zichzelf, en `sppReconnectGuard()` deed op elke lege buffer
      hetzelfde nog eens. Beide slaan `window._plScanActief` nu over —
      en in ruil daarvoor bewaakt DEZE module de verbinding zelf, met
      een ATI-hartslag (zie _hartslag()).

   4. DE SCAN VERGIFTIGDE DE GEZONDHEIDSMETING. `PLBus.note()` telt
      elke NO DATA als fout. Tijdens een sweep schiet foutPct naar
      ~100%, PLBusGate gaat dicht, en de waakronde meldt sensoren als
      uitgevallen terwijl er niets uitgevallen is. Ook dat kijkt nu
      naar de scanvlag.

   5. ELKE MISSER KOSTTE 400 ms. `ATST64` plus `ATAT1` staat in de
      init. Bij 65.536 identifiers is dat 7 uur aan wachten op niets.
      De scan zet `ATAT0` en een korte `ATST`, en zet beide terug.

   Punt 1 t/m 4 zijn de reden dat "het altijd misging". Het waren geen
   verkeerde adressen — het was een omgeving waarin geen enkele lange
   scan kón overleven.

   WAT ER NIET GEREPAREERD IS. De SPP-transportlaag pollt elke 50 ms op
   een prompt. Daarmee ligt de bodem van één commando rond de 60-110 ms,
   hoe snel de adapter ook is. Dat is een verbouwing van _sendBTOnce()
   en die hoort niet in dezelfde commit als deze module. Reken voorlopig
   met ~12 commando's per seconde; de tijdschatting hieronder doet dat.

   ═══════════════════════════════════════════════════════════════════
   ALLES IS LEESBAAR EN NIETS SCHRIJFT

   `magVerzenden()` is één doorlaatpunt met een allowlist. Services die
   iets veranderen — 10 sessie, 11 reset, 14 wissen, 27 beveiliging,
   28 communicatie, 2E schrijven, 31 routine, 34-37 overdracht, 85
   DTC-registratie — komen er niet doorheen, ook niet als iemand ze in
   een reeks zet. Dat is een poort en geen afspraak: `test-kaart.js`
   voert de zwarte lijst er echt doorheen.

   TesterPresent (3E 00) is de probe voor "leeft hier een stuurapparaat".
   Die verandert niets: subfunctie 00 vraagt alleen om een antwoord.

   ═══════════════════════════════════════════════════════════════════
   BRONNEN VOOR DE ADRESSEN (niet verzonnen, opgezocht)

   · ISO 15765-4: 7DF functioneel, 7E0-7E7 fysiek verzoek, 7E8-7EF
     antwoord. Alles buiten die reeks — dashboard, ABS, carrosserie —
     is NIET genormeerd, en daarom sweept deze module 700-7FF en kijkt
     wie er antwoordt in plaats van een lijstje te geloven.
   · 29-bit (protocol 7/9): verzoek 18DA<doel>F1, antwoord 18DAF1<bron>,
     functioneel 18DB33F1. Een auto met 29-bit adressering geeft op
     7E0 per definitie niets terug — dat alleen al verklaart een deel
     van de mislukte pogingen op andere voertuigen.
   · ISO 14229 (UDS): identifiers 0000-FFFF. F180-F1FF is het
     identificatieblok (VIN, onderdeelnummers, softwareversies) en
     F400-F8FF spiegelt OBD-gegevens naar DID's. Die blokken staan
     vooraan in de trap, want ze zijn genormeerd; de OEM-blokken erna
     zijn waarnemingen uit het veld en staan als zodanig gemarkeerd.

   Laadvolgorde: ná pidlane-bt.js (sendCmd) en pidlane-data.js (PLBus).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = {
    // Korte timeout tijdens de scan: een adres dat niet bestaat mag geen
    // 400 ms kosten. ATST is in eenheden van 4 ms; 0x0C = 48 ms.
    stScan: '0C',
    stHerstel: '64',
    cmdTimeoutMs: 1200,
    atTimeoutMs: 1500,
    pauzeMs: 8,
    slotWachtMs: 15000,
    raakElkeMs: 20000,        // busslot verversen — ruim binnen MAX_HOLD_MS
    hartslagElke: 60,         // om de hoeveel commando's een ATI
    leegAchtereen: 25,        // zoveel lege responses op rij → hartslag afdwingen
    // Schatting voor de tijdopgave vooraf. Gemeten bodem van de SPP-laag:
    // ~50 ms polltik plus de adaptertijd. Bewust pessimistisch.
    msPerCmd: 85
  };

  var _stop = false;
  var _bezig = false;
  var _voortgang = { fase: '', gedaan: 0, totaal: 0, tekst: '' };
  var _laatsteKaart = null;

  // ── De poort: wat mag er de bus op ────────────────────────────────
  // Allowlist op service-niveau. Alles wat de auto verandert staat er
  // NIET in, en de zwarte lijst staat er apart bij zodat de bedoeling
  // leesbaar blijft en test-kaart.js hem echt kan uitproberen.
  var LEZEND = ['01', '02', '03', '06', '07', '09', '0A', '19', '21', '22', '3E'];
  var SCHRIJVEND = {
    '10': 'DiagnosticSessionControl — verandert de sessie',
    '11': 'ECUReset — herstart een stuurapparaat',
    '14': 'ClearDiagnosticInformation — wist foutcodes',
    '2E': 'WriteDataByIdentifier — schrijft',
    '2F': 'InputOutputControl — stuurt actuatoren aan',
    '27': 'SecurityAccess — beveiliging',
    '28': 'CommunicationControl — legt bussen stil',
    '31': 'RoutineControl — start routines',
    '34': 'RequestDownload', '35': 'RequestUpload', '36': 'TransferData',
    '37': 'RequestTransferExit', '38': 'RequestFileTransfer',
    '83': 'AccessTimingParameter', '84': 'SecuredDataTransmission',
    '85': 'ControlDTCSetting', '86': 'ResponseOnEvent', '87': 'LinkControl',
    '04': 'ClearDTC (mode 04) — wist foutcodes en gereedheid'
  };

  /* Eén doorlaatpunt. AT-commando's mogen (die praten met de adapter,
     niet met de auto); alles daarbuiten moet met een lezende service
     beginnen. 3E00 is de enige subfunctie van TesterPresent die hier
     langs mag: 3E80 onderdrukt het antwoord en is dus zinloos als probe. */
  function magVerzenden(cmd) {
    var c = String(cmd || '').replace(/\s+/g, '').toUpperCase();
    if (!c) return { mag: false, reden: 'leeg commando' };
    if (/^AT/.test(c)) return { mag: true, reden: 'adaptercommando' };
    if (!/^[0-9A-F]+$/.test(c)) return { mag: false, reden: 'geen hex' };
    if (c.length < 2) return { mag: false, reden: 'te kort' };
    var sid = c.slice(0, 2);
    if (SCHRIJVEND[sid]) return { mag: false, reden: 'service ' + sid + ': ' + SCHRIJVEND[sid] };
    if (LEZEND.indexOf(sid) < 0) return { mag: false, reden: 'service ' + sid + ' staat niet op de leeslijst' };
    if (sid === '3E' && c.slice(2, 4) !== '00') return { mag: false, reden: 'alleen TesterPresent 3E 00' };
    return { mag: true, reden: 'lezend' };
  }

  // ── Hulp ──────────────────────────────────────────────────────────
  var pauze = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var hex2 = function (n) { return (n & 0xFF).toString(16).toUpperCase().padStart(2, '0'); };
  var hex3 = function (n) { return (n & 0x7FF).toString(16).toUpperCase().padStart(3, '0'); };
  var esc = function (x) {
    return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  function diag(m, l) {
    try { if (typeof btDiag === 'function') btDiag(m, l || 'info'); }
    catch (e) { console.warn('PLKaart: melden mislukt', e); }
  }

  /* REGELS UIT EEN ANTWOORD MET HEADERS AAN, INCLUSIEF HERSAMENSTELLING.

     Met ATH1 en ATS0 is elke regel één CAN-FRAME: eerst het id, dan de
     ISO-TP-stuurbyte, dan bytes. Bij 11-bit is dat id drie tekens (7E8),
     bij 29-bit acht (18DAF110). Sommige adapters schrijven het 11-bit id
     met een voorloopnul; dat is aan de pariteit te zien, want databytes
     zijn altijd hele bytes: met een id van drie tekens is de reeks oneven,
     met vier tekens even.

     WAAROM HIER HERSAMENGESTELD WORDT. Met de headers UIT plakt de adapter
     een lang antwoord zelf aan elkaar en zet er regelnummers voor ("0:",
     "1:"). Met de headers AAN — en dat is de hele reden dat deze module
     bestaat — doet hij dat niet: je krijgt de losse frames, elk met
     hetzelfde id en een eigen stuurbyte. Een VIN is 20 bytes en past
     nooit in één frame. Wie dat niet hersamenstelt, leest van elk lang
     antwoord alleen de eerste zes bytes en houdt de rest voor een tweede
     stuurapparaat. Dat is geen randgeval: F190 is de identifier waar je
     mee begint.

       0N ..        enkelframe, N databytes
       1L LL ..     eerste frame, totale lengte L LL
       2N ..        vervolgframe, N is de teller
       3N ..        stroomregeling van de tester — hoort niet in de data

     Levert het frame géén herkenbare stuurbyte op, dan heeft de adapter
     hem er al afgehaald (auto formatting zonder headers) en gaat alles
     ongewijzigd door. Een SID (41, 62, 7F, 49...) botst niet met 0x00-0x1F,
     dus dat onderscheid is veilig. */
  function splitsRegels(ruw, bits) {
    var regels = String(ruw || '').replace(/\r/g, '\n').split('\n');
    var groepen = [], perId = {};
    var laatsteId = null;

    for (var i = 0; i < regels.length; i++) {
      var r = regels[i].trim();
      if (!r || r === '>') continue;
      if (/^(SEARCHING|BUS INIT|STOPPED|NO DATA|CAN ERROR|UNABLE TO CONNECT|BUFFER FULL|ERROR|\?|OK)/i.test(r)) continue;

      // "0:" / "1:" — de vorm ZONDER headers. Dan is er geen id per regel
      // en hoort de regel bij de vorige.
      var genummerd = /^[0-9A-F]\s*:/i.test(r);
      var h = r.replace(/^[0-9A-F]\s*:\s*/i, '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (!h) continue;

      if (genummerd && laatsteId) { perId[laatsteId].plat += h; continue; }

      var idLen = (bits === 29) ? 8 : ((h.length % 2 === 1) ? 3 : 4);
      if (h.length <= idLen) continue;
      var id = h.slice(0, idLen).replace(/^0(?=[0-9A-F]{3}$)/, '');
      var rest = h.slice(idLen);

      if (!perId[id]) { perId[id] = { id: id, frames: [], plat: '' }; groepen.push(perId[id]); }
      perId[id].frames.push(rest);
      laatsteId = id;
    }

    return groepen.map(function (g) {
      return { id: g.id, frames: g.frames.slice(), data: _hersamenstel(g) };
    });
  }

  function _hersamenstel(g) {
    if (g.plat) return g.frames.join('') + g.plat;   // headers-uit-vorm
    if (!g.frames.length) return '';
    var eerste = g.frames[0];
    var b0 = parseInt(eerste.substr(0, 2), 16);

    // Enkelframe: 0x00-0x07, en de opgegeven lengte moet passen.
    if (b0 >= 0x00 && b0 <= 0x07) {
      var n = b0 * 2;
      var d = eerste.slice(2);
      return d.length >= n ? d.slice(0, n) : d;
    }

    // Eerste frame van een reeks: 1L LL.
    if ((b0 & 0xF0) === 0x10) {
      var totaal = (((b0 & 0x0F) << 8) | parseInt(eerste.substr(2, 2), 16)) * 2;
      var uit = eerste.slice(4);
      for (var f = 1; f < g.frames.length; f++) {
        var fr = g.frames[f];
        var p = parseInt(fr.substr(0, 2), 16);
        if ((p & 0xF0) === 0x20) uit += fr.slice(2);
        else if ((p & 0xF0) === 0x30) continue;      // stroomregeling, geen data
        else uit += fr;
      }
      return uit.length >= totaal ? uit.slice(0, totaal) : uit;
    }

    // Geen herkenbare stuurbyte: de adapter heeft hem er al afgehaald.
    return g.frames.join('');
  }

  /* Hex naar bytes. Meer niet — het uitpakken van de ISO-TP-laag gebeurt
     één niveau hoger, waar de frames nog bij elkaar staan. Stond dat hier,
     dan zou een tweede keer uitpakken de eerste databyte opeten. */
  function ontpak(dataHex) {
    var b = [];
    var h = String(dataHex || '');
    for (var i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
    return { bytes: b };
  }

  /* Wat zegt dit antwoord over de gestelde vraag? Drie uitkomsten, en
     het onderscheid tussen de laatste twee is het halve verhaal: een
     weigering bewijst dat er een stuurapparaat luistert. */
  function duid(bytes, sid) {
    if (!bytes || !bytes.length) return { soort: 'stil' };
    if (bytes[0] === 0x7F) {
      return { soort: 'geweigerd', vraagSid: hex2(bytes[1]), nrc: hex2(bytes[2]), nrcTekst: nrcTekst(hex2(bytes[2])) };
    }
    var verwacht = (parseInt(sid, 16) + 0x40) & 0xFF;
    if (bytes[0] === verwacht) return { soort: 'positief', payload: bytes.slice(1) };
    return { soort: 'anders', payload: bytes.slice() };
  }

  function nrcTekst(rc) {
    return ({
      '10': 'algemene afwijzing', '11': 'service niet ondersteund',
      '12': 'subfunctie onbekend', '13': 'verkeerde lengte',
      '21': 'druk bezig', '22': 'condities niet goed',
      '24': 'verkeerde volgorde', '31': 'identifier bestaat niet',
      '33': 'beveiliging vereist', '35': 'sleutel ongeldig',
      '78': 'antwoord volgt later', '7E': 'subfunctie niet in deze sessie',
      '7F': 'service niet in deze sessie'
    })[rc] || 'reden ' + rc;
  }

  var byteHex = function (b) { return b.map(hex2).join(''); };

  // ═══════════════════════════════════════════════════════════════════
  // DE ADRESPLANNEN
  // ═══════════════════════════════════════════════════════════════════

  /* 11-bit: alles van 700 tot 7FF. Dat is bewust ruimer dan de 7E0-7E7
     uit ISO 15765-4 — juist de modules die de km-stand kennen (720
     dashboard, 726 carrosserie, 760/7B0 ABS) liggen daarbuiten en zijn
     nergens genormeerd. 256 adressen is te doen; raden is dat niet. */
  function adresplan(bits) {
    var uit = [];
    var i;
    if (bits === 29) {
      for (i = 0; i <= 0xFF; i++) uit.push({ tx: '18DA' + hex2(i) + 'F1', doel: hex2(i) });
      return { functioneel: '18DB33F1', adressen: uit };
    }
    for (i = 0x700; i <= 0x7FF; i++) uit.push({ tx: hex3(i), doel: hex3(i) });
    return { functioneel: '7DF', adressen: uit };
  }

  /* DE DID-TRAP. Genormeerd eerst, veldkennis daarna, alles-of-niets
     als laatste. Elke trede zegt waar hij vandaan komt: dat scheelt de
     volgende die hier kijkt het werk om uit te zoeken of een reeks
     ergens op gebaseerd is of ooit door iemand gegokt is. */
  var DID_TRAP = [
    { naam: 'ISO 14229 identificatie', van: 0xF180, tot: 0xF1FF,
      bron: 'genormeerd — VIN, onderdeel- en softwarenummers' },
    { naam: 'OBD-spiegel', van: 0xF400, tot: 0xF6FF,
      bron: 'genormeerd — mode 01/06-gegevens als DID' },
    { naam: 'OBD-info', van: 0xF800, tot: 0xF8FF,
      bron: 'genormeerd' },
    { naam: 'OEM-blok 01xx/02xx', van: 0x0100, tot: 0x02FF,
      bron: 'veldwaarneming — hier zitten afstands- en servicetellers' },
    { naam: 'OEM-blok 10xx/11xx', van: 0x1000, tot: 0x11FF,
      bron: 'veldwaarneming — gedeelde Mazda/Ford-lijsten' },
    { naam: 'OEM-blok 20xx/2Bxx', van: 0x2000, tot: 0x20FF,
      bron: 'veldwaarneming' },
    { naam: 'OEM-blok 2Bxx', van: 0x2B00, tot: 0x2BFF,
      bron: 'veldwaarneming — ABS-afstand' },
    { naam: 'OEM-blok 60xx', van: 0x6000, tot: 0x60FF,
      bron: 'veldwaarneming — dashboardtellers' }
  ];

  function didLijst(trap) {
    var uit = [];
    for (var t = 0; t < trap.length; t++) {
      for (var d = trap[t].van; d <= trap[t].tot; d++) uit.push(d);
    }
    return uit;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DE SCAN
  // ═══════════════════════════════════════════════════════════════════

  function staat() {
    return { bezig: _bezig, gestopt: _stop, voortgang: JSON.parse(JSON.stringify(_voortgang)) };
  }
  function stop() { _stop = true; diag('PLKaart: stopverzoek ontvangen', 'warn'); }

  async function scan(opties) {
    opties = opties || {};
    var onStap = typeof opties.onStap === 'function' ? opties.onStap : function () { };

    if (typeof sendCmd !== 'function') throw new Error('PLKaart: sendCmd niet beschikbaar');
    if (typeof connected !== 'undefined' && !connected) throw new Error('PLKaart: geen verbinding');
    if (typeof demoMode !== 'undefined' && demoMode) throw new Error('PLKaart: demomodus levert geen echte kaart');
    if (_bezig) throw new Error('PLKaart: er loopt al een scan');

    _stop = false; _bezig = true;
    var t0 = Date.now();
    var K = {
      gestart: new Date().toISOString(),
      adapter: '', protocol: '', protocolNaam: '', bits: 11, spanning: '',
      functioneel: '', headersAan: false, breedFilter: null,
      modules: [], commandos: 0, geweigerd: [], afgebroken: null,
      trap: [], duurMs: 0
    };

    function meld(fase, tekst, extra) {
      _voortgang.fase = fase; _voortgang.tekst = tekst;
      var s = { fase: fase, tekst: tekst, gedaan: _voortgang.gedaan, totaal: _voortgang.totaal };
      if (extra) for (var k in extra) s[k] = extra[k];
      try { onStap(s, K); } catch (e) { console.warn('PLKaart: voortgangsmelder gaf een fout', e); }
    }

    // ── de bus overnemen ────────────────────────────────────────────
    var tok = 0;
    try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('kaart', CFG.slotWachtMs) : 0; }
    catch (e) { _bezig = false; throw new Error('PLKaart: het busslot kwam niet vrij — ' + (e.message || e)); }
    if (window.PLBus && PLBus.wait && !tok) { _bezig = false; throw new Error('PLKaart: het busslot is bezet'); }

    window._plScanActief = true;
    var raakTimer = setInterval(function () {
      try { if (tok && window.PLBus && PLBus.raak) PLBus.raak(tok); }
      catch (e) { console.warn('PLKaart: busslot verversen mislukt', e); }
    }, CFG.raakElkeMs);

    var leegReeks = 0, sindsHartslag = 0;

    /* HET ENIGE PUNT WAAR EEN COMMANDO DE BUS OP GAAT.
       Telt mee, bewaakt de verbinding, en weigert alles wat schrijft. */
    async function stuur(cmd, timeout) {
      var poort = magVerzenden(cmd);
      if (!poort.mag) {
        K.geweigerd.push({ cmd: cmd, reden: poort.reden });
        diag('PLKaart WEIGERT "' + cmd + '": ' + poort.reden, 'warn');
        return '';
      }
      var r = '';
      try { r = await sendCmd(cmd, timeout || CFG.cmdTimeoutMs); }
      catch (e) { r = ''; }
      K.commandos++;
      sindsHartslag++;
      if (!String(r || '').trim()) leegReeks++; else leegReeks = 0;
      if (leegReeks >= CFG.leegAchtereen || sindsHartslag >= CFG.hartslagElke) {
        sindsHartslag = 0;
        var levend = await _hartslag();
        if (!levend) throw new Error('verbinding weg: ATI gaf twee keer niets terug');
        leegReeks = 0;
      }
      if (CFG.pauzeMs) await pauze(CFG.pauzeMs);
      return r;
    }

    async function _hartslag() {
      for (var p = 0; p < 2; p++) {
        var r = '';
        try { r = await sendCmd('ATI', CFG.atTimeoutMs); } catch (e) { r = ''; }
        if (String(r || '').trim()) return true;
        await pauze(200);
      }
      return false;
    }

    try {
      // ── FASE 0: de adapter in scanstand ──────────────────────────
      meld('overname', 'adapter in scanstand zetten');
      await stuur('ATE0', CFG.atTimeoutMs);
      await stuur('ATL0', CFG.atTimeoutMs);
      await stuur('ATS0', CFG.atTimeoutMs);
      await stuur('ATH1', CFG.atTimeoutMs);      // DE belangrijkste regel van dit bestand
      await stuur('ATCAF1', CFG.atTimeoutMs);
      await stuur('ATAT0', CFG.atTimeoutMs);
      await stuur('ATST' + CFG.stScan, CFG.atTimeoutMs);

      K.adapter = String(await stuur('ATI', CFG.atTimeoutMs) || '').trim();
      K.spanning = String(await stuur('ATRV', CFG.atTimeoutMs) || '').trim();
      var dpn = String(await stuur('ATDPN', CFG.atTimeoutMs) || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      K.protocol = dpn;
      K.protocolNaam = String(await stuur('ATDP', CFG.atTimeoutMs) || '').trim();
      var nr = dpn.replace(/^A/, '');
      K.bits = (nr === '7' || nr === '9') ? 29 : 11;
      var plan = adresplan(K.bits);
      K.functioneel = plan.functioneel;
      meld('overname', 'protocol ' + (dpn || '?') + ' — ' + K.bits + '-bit adressering, ' +
        plan.adressen.length + ' adressen in het plan');

      // ── FASE 1: staan de headers echt aan? ───────────────────────
      // Niet aannemen dat ATH1 werkte: bewijzen. Een functionele 0100
      // hoort minstens één regel met een herkenbaar id te geven.
      // NIET: "ziet het id er plausibel uit". Met de headers UIT beginnen de
      // regels met de PCI-byte, en '0641' ziet er precies zo plausibel uit
      // als een CAN-id. Het bewijs moet dus uit de INHOUD komen: het antwoord
      // op 0100 hoort met 41 00 te beginnen. Is het id in werkelijkheid data,
      // dan eet de id-knip die twee bytes op en klopt het niet meer.
      var bewijs = await stuur('0100', 4000);
      var regels = splitsRegels(bewijs, K.bits);
      K.headersAan = regels.length
        ? regels.some(function (r) { return /^4100/.test(r.data) && /^[0-9A-F]{3,8}$/.test(r.id); })
        : null;
      if (K.headersAan === null) {
        meld('overname', 'LET OP: geen enkel antwoord op de functionele 0100 — ' +
          'of er staat geen contact op, of dit is geen OBD-bus', { ernst: 'let-op' });
      } else if (!K.headersAan) {
        meld('overname', 'LET OP: geen herkenbare CAN-id\'s in het antwoord op 0100 — ' +
          'de kaart kan antwoorden niet aan een stuurapparaat toewijzen', { ernst: 'let-op' });
      }

      // ── FASE 2: wie luistert er? Waargenomen, niet geraden ───────
      var gezien = {};
      function noteer(id, hoe) {
        if (!id) return;
        if (!gezien[id]) gezien[id] = { rx: id, tx: null, hoe: [], services: {}, pids: [], dids: [], mode21: [] };
        if (gezien[id].hoe.indexOf(hoe) < 0) gezien[id].hoe.push(hoe);
      }
      regels.forEach(function (r) { noteer(r.id, 'functionele 0100'); });

      var extraFunctioneel = ['0900', '0A'];
      for (var f = 0; f < extraFunctioneel.length && !_stop; f++) {
        splitsRegels(await stuur(extraFunctioneel[f], 3000), K.bits)
          .forEach(function (r) { noteer(r.id, 'functionele ' + extraFunctioneel[f]); });
      }
      meld('ontdekking', Object.keys(gezien).length + ' stuurapparaten via de functionele vraag');

      // Fysieke sweep. TesterPresent verandert niets en elke UDS-server
      // hoort erop te antwoorden; wie stil blijft krijgt nog 22F190.
      _voortgang.totaal = plan.adressen.length; _voortgang.gedaan = 0;
      for (var a = 0; a < plan.adressen.length && !_stop; a++) {
        var ad = plan.adressen[a];
        _voortgang.gedaan = a + 1;
        await stuur('ATSH' + ad.tx, CFG.atTimeoutMs);
        var rr = splitsRegels(await stuur('3E00'), K.bits);
        if (!rr.length) rr = splitsRegels(await stuur('22F190'), K.bits);
        for (var q = 0; q < rr.length; q++) {
          noteer(rr[q].id, 'sweep vanaf ' + ad.tx);
          gezien[rr[q].id].tx = gezien[rr[q].id].tx || ad.tx;
        }
        if (a % 16 === 0) meld('ontdekking', 'adres ' + ad.tx + ' — ' +
          Object.keys(gezien).length + ' gevonden', { gedaan: a + 1, totaal: plan.adressen.length });
      }

      // Een module die alleen functioneel antwoordde heeft nog geen
      // zendadres. Bij 11-bit is antwoord = verzoek + 8 de conventie;
      // dat wordt hier AANGENOMEN en als zodanig gemarkeerd.
      Object.keys(gezien).forEach(function (id) {
        var m = gezien[id];
        if (m.tx) return;
        if (K.bits === 11 && /^[0-9A-F]{3}$/.test(id)) {
          m.tx = hex3(parseInt(id, 16) - 8);
          m.txAangenomen = true;
        } else if (K.bits === 29 && /^18DAF1[0-9A-F]{2}$/.test(id)) {
          m.tx = '18DA' + id.slice(6, 8) + 'F1';
          m.txAangenomen = true;
        }
      });

      K.modules = Object.keys(gezien).sort().map(function (id) { return gezien[id]; });
      meld('ontdekking', 'klaar: ' + K.modules.length + ' stuurapparaten',
        { modules: K.modules.map(function (m) { return m.rx; }) });

      // ── FASE 3+4: per module — wat kan hij, en wat heeft hij ─────
      for (var mi = 0; mi < K.modules.length && !_stop; mi++) {
        var mod = K.modules[mi];
        if (!mod.tx) { mod.overgeslagen = 'geen zendadres bekend'; continue; }
        await _richt(stuur, mod.tx, mod.rx, K.bits);

        meld('module', mod.rx + ' — diensten aftasten', { module: mod.rx });
        mod.services = await _diensten(stuur, K.bits, mod.rx);

        if (mod.services['01'] && mod.services['01'].soort === 'positief') {
          meld('module', mod.rx + ' — mode 01 bitmap', { module: mod.rx });
          mod.pids = await _mode01(stuur, K.bits, mod.rx, function () { return _stop; });
        }
        if (mod.services['06'] && mod.services['06'].soort === 'positief') {
          mod.mids = await _bitmapReeks(stuur, K.bits, mod.rx, '06', function () { return _stop; });
        }
        if (mod.services['09'] && mod.services['09'].soort === 'positief') {
          mod.info09 = await _bitmapReeks(stuur, K.bits, mod.rx, '09', function () { return _stop; });
        }
      }

      // ── FASE 5: de DID-trap, BREEDTE VÓÓR DIEPTE ────────────────
      // Gemeten op de CX-5 (04-09-2026, 11:49): achttien stuurapparaten.
      // De eerste opzet liep per module de hele trap af — 2944 identifiers
      // op 70E vóórdat 728 aan de beurt kwam. De scan brak na 171 s af op
      // een weggevallen socket en stond toen op 193 van de 2944, bij de
      // EERSTE module. Zeventien modules waren nooit aangeraakt.
      //
      // Diezelfde tijd, breedtegewijs besteed, levert het complete
      // identificatieblok van álle achttien op. Vandaar de omkering: de
      // buitenste lus is de TREDE, de binnenste de module. Wat er dan
      // afgebroken wordt, is de minst waardevolle trede — niet zeventien
      // stuurapparaten.
      var trap = opties.volledig
        ? [{ naam: 'alles', van: 0x0000, tot: 0xFFFF, bron: 'volledige sweep' }]
        : (opties.trap || DID_TRAP);
      K.trap = trap.map(function (t) { return { naam: t.naam, van: t.van, tot: t.tot, bron: t.bron }; });

      // Welke modules doen mee, en waarom de rest niet. Een 7F 22 11 is
      // "deze service bestaat hier niet"; alles daarboven — ook 7F 22 31 —
      // betekent dat mode 22 leeft en alleen deze identifier onbekend is.
      var udsModules = [];
      K.modules.forEach(function (m) {
        if (!m.tx) { m.didOvergeslagen = 'geen zendadres bekend'; return; }
        var sv = m.services['22'];
        if (!sv || sv.soort === 'stil') { m.didOvergeslagen = 'mode 22 gaf niets terug'; return; }
        if (sv.soort === 'geweigerd' && sv.nrc === '11') { m.didOvergeslagen = 'mode 22 wordt hier niet ondersteund (7F 22 11)'; return; }
        m.trede = {};
        udsModules.push(m);
      });

      // De schatting opnieuw, nu met het ECHTE aantal modules. Vooraf stond
      // er 6 als aanname en dat is op deze auto een factor drie mis: de
      // gebruiker kreeg "27 min" te zien waar het er ~120 zouden worden.
      var perCmd = K.commandos > 40 ? (Date.now() - t0) / K.commandos : CFG.msPerCmd;
      K.msPerCmd = Math.round(perCmd);
      var nogCmds = udsModules.length * didLijst(trap).length;
      K.schattingNa = { commandos: nogCmds, ms: Math.round(nogCmds * perCmd), tekst: _duur(nogCmds * perCmd) };
      meld('dids', 'gemeten ' + K.msPerCmd + ' ms per commando; de volledige trap over ' +
        udsModules.length + ' stuurapparaten kost nog ' + K.schattingNa.tekst +
        ' — de treden gaan van waardevol naar speculatief, dus stoppen mag altijd',
        { schatting: K.schattingNa });

      for (var ti = 0; ti < trap.length && !_stop; ti++) {
        var trede = trap[ti];
        var tredeDids = didLijst([trede]);
        for (var mj = 0; mj < udsModules.length && !_stop; mj++) {
          var m2 = udsModules[mj];
          await _richt(stuur, m2.tx, m2.rx, K.bits);
          _voortgang.totaal = tredeDids.length; _voortgang.gedaan = 0;
          var gedaan = 0;
          for (var di = 0; di < tredeDids.length && !_stop; di++) {
            _voortgang.gedaan = di + 1; gedaan = di + 1;
            var did = tredeDids[di].toString(16).toUpperCase().padStart(4, '0');
            var res = _eersteVoor(splitsRegels(await stuur('22' + did), K.bits), m2.rx);
            if (!res) continue;
            var d = duid(ontpak(res.data).bytes, '22');
            // NRC 78 = "antwoord volgt later". Dat is geen weigering maar een
            // belofte; op 73F kwam hij in de rit van 04-09 op service 19. Eén
            // keer opnieuw lezen is genoeg — blijft het 78, dan pas noteren.
            if (d.soort === 'geweigerd' && d.nrc === '78') {
              await pauze(120);
              var her = _eersteVoor(splitsRegels(await stuur('22' + did), K.bits), m2.rx);
              if (her) d = duid(ontpak(her.data).bytes, '22');
            }
            if (d.soort === 'positief') {
              m2.dids.push({ did: did, trede: trede.naam, bytes: byteHex(d.payload.slice(2)), len: Math.max(0, d.payload.length - 2) });
            } else if (d.soort === 'geweigerd' && d.nrc !== '31' && d.nrc !== '11') {
              m2.dids.push({ did: did, trede: trede.naam, geweigerd: d.nrc, reden: d.nrcTekst });
            }
            if (di % 64 === 0) meld('dids', trede.naam + ' op ' + m2.rx + ' — identifier ' + did +
              ', ' + m2.dids.length + ' treffers', { module: m2.rx, gedaan: di + 1, totaal: tredeDids.length });
          }
          // WAT ER IS GEDAAN, EN WAT NIET. Zonder deze regel meldt het verslag
          // "geen enkele identifier bestaat hier" voor een module die nooit
          // aan de beurt kwam — afwezigheid als bewijs, precies wat deze
          // module hoort uit te bannen.
          m2.trede[trede.naam] = (gedaan >= tredeDids.length) ? 'volledig'
            : (gedaan ? 'afgebroken na ' + gedaan + ' van ' + tredeDids.length : 'niet bereikt');
        }
      }

      // Mode 21 pas ná de hele trap: hij is speculatiever dan de genormeerde
      // identifiers en mag dus als eerste sneuvelen bij een afbreking.
      for (var mk2 = 0; mk2 < udsModules.length && !_stop; mk2++) {
        var m21 = udsModules[mk2];
        if (!(m21.services['21'] && m21.services['21'].soort !== 'stil')) continue;
        if (m21.services['21'].soort === 'geweigerd' && m21.services['21'].nrc === '11') continue;
        await _richt(stuur, m21.tx, m21.rx, K.bits);
        var g21 = 0;
        for (var p21 = 0; p21 <= 0xFF && !_stop; p21++) {
          g21 = p21 + 1;
          var r21 = _eersteVoor(splitsRegels(await stuur('21' + hex2(p21)), K.bits), m21.rx);
          if (!r21) continue;
          var d21 = duid(ontpak(r21.data).bytes, '21');
          if (d21.soort === 'positief') {
            m21.mode21.push({ pid: hex2(p21), bytes: byteHex(d21.payload.slice(1)) });
          }
        }
        m21.mode21Gedaan = g21;
      }

      // ── FASE 6: welke datapunten BEWEGEN? ────────────────────────
      // Eén extra pas over alleen de treffers. Een identifier die
      // verandert is een sensor; een die stilstaat is configuratie. Dat
      // onderscheid is met geen enkele lijst te raden en kost hier één
      // ronde.
      if (opties.tweedePas !== false && !_stop) {
        meld('tweede pas', 'kijken welke datapunten bewegen');
        await pauze(opties.tussenpauzeMs != null ? opties.tussenpauzeMs : 1500);
        for (var mk = 0; mk < K.modules.length && !_stop; mk++) {
          var m3 = K.modules[mk];
          if (!m3.tx) continue;
          await _richt(stuur, m3.tx, m3.rx, K.bits);
          for (var dk = 0; dk < m3.dids.length && !_stop; dk++) {
            var it = m3.dids[dk];
            if (it.geweigerd) continue;
            var r2 = _eersteVoor(splitsRegels(await stuur('22' + it.did), K.bits), m3.rx);
            if (!r2) { it.tweedePas = 'stil'; continue; }
            var d2 = duid(ontpak(r2.data).bytes, '22');
            if (d2.soort !== 'positief') { it.tweedePas = d2.soort; continue; }
            var nu2 = byteHex(d2.payload.slice(2));
            it.beweegt = (nu2 !== it.bytes);
            it.bytes2 = nu2;
          }
        }
      }

    } catch (e) {
      K.afgebroken = e.message || String(e);
      diag('PLKaart afgebroken: ' + K.afgebroken, 'err');
    } finally {
      clearInterval(raakTimer);
      // De adapter ALTIJD terug in de staat waarin de rest van de app hem
      // verwacht. Blijft ATH1 of een gezet header staan, dan krijgt elke
      // andere module vanaf nu antwoorden die hij niet kan parsen.
      // HERSTEL MOET BEWEZEN WORDEN, NIET AANGENOMEN.
      // sendCmd() GOOIT niet als de ELM-poort dicht staat (herinitialisatie
      // na een socketdood) — hij geeft een lege string terug. Een try/catch
      // ving dus niets, en het verslag meldde een geslaagd herstel terwijl er
      // geen enkel commando de adapter bereikt had. Gemeten op 04-09: de
      // socket viel om 11:52:01 weg, de scan brak twee seconden later af, en
      // alle vijf de herstelcommando's zijn stilzwijgend geweigerd. Dat de
      // adapter tóch goed stond, kwam door de ELM-herinitialisatie die
      // toevallig hetzelfde zet — geluk, geen ontwerp.
      var herstel = ['ATSH' + (K.bits === 29 ? '18DB33F1' : '7DF'), 'ATCRA', 'ATH0', 'ATAT1', 'ATST' + CFG.stHerstel];
      var mislukt = [];
      for (var h = 0; h < herstel.length; h++) {
        var antw = '';
        try { antw = String(await sendCmd(herstel[h], CFG.atTimeoutMs) || ''); }
        catch (e2) { antw = ''; }
        // Een ELM327 bevestigt elk AT-commando. Leeg = niet aangekomen;
        // een '?' = niet begrepen. Allebei is "niet hersteld".
        if (!antw.trim() || /\?/.test(antw)) mislukt.push(herstel[h] + (antw.trim() ? ' → "' + antw.trim().slice(0, 12) + '"' : ' → geen antwoord'));
      }
      if (mislukt.length) {
        K.herstelFout = mislukt.join('; ');
        diag('PLKaart: herstel NIET bevestigd (' + K.herstelFout + ') — verbreek en verbind opnieuw', 'err');
      }
      window._plScanActief = false;
      try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); }
      catch (e3) { console.warn('PLKaart: busslot vrijgeven mislukt', e3); }
      _bezig = false;
    }

    K.duurMs = Date.now() - t0;
    K.gestopt = _stop;
    _laatsteKaart = K;
    diag('PLKaart klaar: ' + K.modules.length + ' modules, ' + telDatapunten(K) +
      ' datapunten, ' + K.commandos + ' commando\'s in ' + Math.round(K.duurMs / 1000) + 's',
      K.afgebroken ? 'warn' : 'ok');
    meld('klaar', telDatapunten(K) + ' datapunten in kaart');
    return K;
  }

  /* Richten op één stuurapparaat: zendadres én ontvangstfilter. Het
     filter komt uit de WAARNEMING (het id dat werkelijk antwoordde), niet
     uit de aanname zender+8 — dat is het hele verschil met blok 9. */
  async function _richt(stuur, tx, rx, bits) {
    await stuur('ATSH' + tx, CFG.atTimeoutMs);
    if (rx) await stuur('ATCRA' + rx, CFG.atTimeoutMs);
  }

  function _eersteVoor(regels, rx) {
    for (var i = 0; i < regels.length; i++) if (!rx || regels[i].id === rx) return regels[i];
    return regels.length ? regels[0] : null;
  }

  /* Welke diensten leven er op dit adres? Elk minimaal verzoek is lezend;
     de uitkomst is per service positief / geweigerd / stil, en alle drie
     zeggen iets anders. */
  async function _diensten(stuur, bits, rx) {
    var proeven = {
      '01': '0100', '02': '0200', '03': '03', '06': '0600',
      '07': '07', '09': '0900', '0A': '0A', '19': '1902FF',
      '21': '2100', '22': '22F190'
    };
    var uit = {};
    for (var sid in proeven) {
      var r = _eersteVoor(splitsRegels(await stuur(proeven[sid]), bits), rx);
      if (!r) { uit[sid] = { soort: 'stil' }; continue; }
      var d = duid(ontpak(r.data).bytes, sid);
      uit[sid] = { soort: d.soort, nrc: d.nrc || null, nrcTekst: d.nrcTekst || null };
    }
    return uit;
  }

  /* Mode 01: de bitmap zegt exact welke PIDs bestaan. Daarna elke PID
     één keer ophalen voor de ruwe bytes en de lengte. Geen enkele gok. */
  async function _mode01(stuur, bits, rx, moetStoppen) {
    var steun = await _bitmapReeks(stuur, bits, rx, '01', moetStoppen);
    var uit = [];
    for (var i = 0; i < steun.length; i++) {
      if (moetStoppen()) break;
      var pid = steun[i];
      var r = _eersteVoor(splitsRegels(await stuur('01' + pid), bits), rx);
      if (!r) { uit.push({ pid: pid, stil: true }); continue; }
      var d = duid(ontpak(r.data).bytes, '01');
      if (d.soort === 'positief') uit.push({ pid: pid, bytes: byteHex(d.payload.slice(1)), len: Math.max(0, d.payload.length - 1) });
      else uit.push({ pid: pid, soort: d.soort, nrc: d.nrc || null });
    }
    return uit;
  }

  /* De bitmapketen van mode 01/06/09: 00 vertelt over 01-20, 20 over
     21-40, enzovoort, en bit 0 zegt of de volgende bitmap bestaat. */
  async function _bitmapReeks(stuur, bits, rx, sid, moetStoppen) {
    var uit = [];
    for (var basis = 0x00; basis <= 0xC0; basis += 0x20) {
      if (moetStoppen && moetStoppen()) break;
      var r = _eersteVoor(splitsRegels(await stuur(sid + hex2(basis)), bits), rx);
      if (!r) break;
      var d = duid(ontpak(r.data).bytes, sid);
      if (d.soort !== 'positief' || d.payload.length < 5) break;
      if (d.payload[0] !== basis) break;
      var bm = ((d.payload[1] << 24) | (d.payload[2] << 16) | (d.payload[3] << 8) | d.payload[4]) >>> 0;
      for (var bit = 0; bit < 32; bit++) {
        if (!(bm & (0x80000000 >>> bit))) continue;
        var nr = basis + bit + 1;
        // Het laatste bit van een bitmap zegt "er volgt nog een bitmap".
        // Dat is PID 0x20/0x40/0x60..., en dat is de bitmap zélf — geen
        // meetwaarde. Meetellen levert een datapunt op dat niet bestaat, en
        // dat is precies het soort verzinsel dat deze module moet uitbannen.
        if (nr % 0x20 === 0) continue;
        uit.push(hex2(nr));
      }
      if (!(bm & 1)) break;
    }
    return uit;
  }

  function telDatapunten(K) {
    var n = 0;
    (K.modules || []).forEach(function (m) {
      n += (m.pids || []).length + (m.dids || []).length + (m.mode21 || []).length +
           (m.mids || []).length + (m.info09 || []).length;
    });
    return n;
  }

  /* Tijdschatting vóóraf, zodat niemand een sweep van zeven uur start
     zonder het te weten. Bewust ruim: de SPP-laag is de bodem, niet de
     adapter. */
  function schatting(opties) {
    opties = opties || {};
    var adressen = 256, perAdres = 3;
    var trap = opties.volledig ? [{ van: 0, tot: 0xFFFF }] : (opties.trap || DID_TRAP);
    var dids = 0;
    trap.forEach(function (t) { dids += (t.tot - t.van + 1); });
    var modules = opties.modules || 6;
    var cmds = 12 + adressen * perAdres + modules * (10 + 40) + modules * dids + modules * 30;
    var ms = cmds * CFG.msPerCmd;
    return { commandos: cmds, ms: ms, tekst: _duur(ms) };
  }
  function _duur(ms) {
    var s = Math.round(ms / 1000);
    if (s < 90) return s + ' s';
    var m = Math.round(s / 60);
    if (m < 90) return m + ' min';
    return (Math.round(m / 6) / 10) + ' uur';
  }

  // ── Uitvoer ───────────────────────────────────────────────────────

  function naarTekst(K) {
    K = K || _laatsteKaart;
    if (!K) return 'Nog geen kaart gemaakt.';
    var r = [];
    r.push('DATAPUNTENKAART — ' + K.gestart);
    r.push('adapter: ' + (K.adapter || '?') + '  |  protocol: ' + (K.protocol || '?') +
      ' (' + (K.protocolNaam || '?') + ')  |  ' + K.bits + '-bit  |  accu ' + (K.spanning || '?'));
    r.push('headers aan: ' + (K.headersAan === true ? 'ja — antwoorden zijn toewijsbaar'
      : K.headersAan === null ? 'niet vast te stellen — de functionele 0100 bleef stil'
      : 'NEE — antwoorden zijn NIET aan een stuurapparaat toe te wijzen'));
    r.push(K.commandos + ' commando\'s in ' + Math.round(K.duurMs / 1000) + ' s' +
      (K.msPerCmd ? ' (' + K.msPerCmd + ' ms per commando)' : '') +
      (K.afgebroken ? '  |  AFGEBROKEN: ' + K.afgebroken : '') +
      (K.gestopt ? '  |  met de hand gestopt' : ''));
    if (K.schattingNa) {
      r.push('schatting nà de ontdekking: ' + K.schattingNa.commandos.toLocaleString('nl-NL') +
        ' commando\'s voor de volledige trap over alle stuurapparaten = ' + K.schattingNa.tekst +
        '  (de schatting vooraf rekent met 6 modules en klopt dus alleen op een kleine auto)');
    }
    if (K.herstelFout) r.push('LET OP — adapterherstel: ' + K.herstelFout);
    if (K.geweigerd && K.geweigerd.length) {
      r.push('geweigerd door de leespoort: ' + K.geweigerd.length + ' commando(s) — ' +
        K.geweigerd.slice(0, 3).map(function (g) { return g.cmd + ' (' + g.reden + ')'; }).join(', '));
    }
    r.push('trap: ' + (K.trap || []).map(function (t) { return t.naam; }).join(' → '));
    r.push('');

    (K.modules || []).forEach(function (m) {
      r.push('── ' + m.rx + (m.tx ? '  (zenden op ' + m.tx + (m.txAangenomen ? ', aangenomen' : ', waargenomen') + ')' : '  (geen zendadres)'));
      r.push('   gezien via: ' + m.hoe.join('; '));
      if (m.overgeslagen) { r.push('   overgeslagen: ' + m.overgeslagen); return; }
      var lev = Object.keys(m.services || {}).filter(function (s) { return m.services[s].soort !== 'stil'; });
      r.push('   diensten: ' + (lev.length ? lev.map(function (s) {
        return s + '=' + m.services[s].soort + (m.services[s].nrc ? '(' + m.services[s].nrc + ')' : '');
      }).join(' ') : 'geen'));
      if ((m.pids || []).length) {
        r.push('   mode 01 — ' + m.pids.length + ' PIDs:');
        m.pids.forEach(function (p) {
          r.push('     01' + p.pid + '  ' + (p.bytes != null ? p.bytes + ' (' + p.len + ' bytes)' : (p.stil ? 'stil' : p.soort)));
        });
      }
      if ((m.mids || []).length) r.push('   mode 06 — monitors: ' + m.mids.join(' '));
      if ((m.info09 || []).length) r.push('   mode 09 — info: ' + m.info09.join(' '));
      if ((m.mode21 || []).length) {
        r.push('   mode 21 — ' + m.mode21.length + ' treffers:');
        m.mode21.forEach(function (x) { r.push('     21' + x.pid + '  ' + x.bytes); });
      }
      if (m.didOvergeslagen) r.push('   mode 22: ' + m.didOvergeslagen);
      else {
        // Eerst WAT ER GEDAAN IS, dan pas wat er gevonden is. Een module die
        // nooit aan de beurt kwam mag nooit als "hier bestaat niets" in het
        // verslag komen — dat is afwezigheid als bewijs, en daar is deze hele
        // module tegen. Op 04-09 stond dat er zeventien keer.
        var td = m.trede || {};
        var namen = Object.keys(td);
        var af = namen.filter(function (n) { return td[n] === 'volledig'; });
        var niet = namen.filter(function (n) { return td[n] === 'niet bereikt'; });
        var half = namen.filter(function (n) { return td[n] !== 'volledig' && td[n] !== 'niet bereikt'; });
        (K.trap || []).forEach(function (t) { if (namen.indexOf(t.naam) < 0) niet.push(t.naam); });

        r.push('   mode 22 — afgezocht: ' + (af.length ? af.join(', ') : 'niets volledig') +
          (half.length ? '  |  half: ' + half.map(function (n) { return n + ' (' + td[n] + ')'; }).join(', ') : '') +
          (niet.length ? '  |  NIET BEREIKT: ' + niet.join(', ') : ''));

        if ((m.dids || []).length) {
          var beweegt = m.dids.filter(function (d) { return d.beweegt; });
          r.push('   mode 22 — ' + m.dids.length + ' identifiers, waarvan ' + beweegt.length + ' bewegend:');
          m.dids.forEach(function (d) {
            if (d.geweigerd) { r.push('     22' + d.did + '  geweigerd ' + d.geweigerd + ' — ' + d.reden); return; }
            r.push('     22' + d.did + '  ' + d.bytes + ' (' + d.len + ' bytes)' +
              (d.beweegt ? '   ← BEWEEGT, tweede pas: ' + d.bytes2 : (d.bytes2 != null ? '   (stabiel)' : '')));
          });
        } else if (af.length) {
          r.push('   mode 22 — geen enkele identifier bestaat hier in ' + (af.length === namen.length ? 'de trap' : 'de afgezochte treden'));
        } else {
          r.push('   mode 22 — nog niets afgezocht op dit adres');
        }
      }
      if ((m.mode21 || []).length === 0 && m.mode21Gedaan == null && m.services && m.services['21'] &&
          m.services['21'].soort !== 'stil' && m.services['21'].nrc !== '11') {
        r.push('   mode 21 — niet bereikt');
      }
      r.push('');
    });
    r.push('TOTAAL: ' + telDatapunten(K) + ' datapunten over ' + (K.modules || []).length + ' stuurapparaten.');
    return r.join('\n');
  }

  function render(K) {
    K = K || _laatsteKaart;
    if (!K) return '';
    var kl = K.afgebroken ? 'kritiek' : (K.headersAan === true ? 'ok' : 'let-op');
    var h = '<div class="pl-km pl-km-' + kl + '">';
    h += '<div class="pl-km-kop">🗺️ Datapuntenkaart — ' + telDatapunten(K) + ' datapunten over ' +
      (K.modules || []).length + ' stuurapparaten</div>';
    h += '<pre style="white-space:pre-wrap;word-break:break-word;font:11px ui-monospace,monospace;' +
      'margin:0;padding:9px 10px;max-height:52vh;overflow:auto">' + esc(naarTekst(K)) + '</pre></div>';
    return h;
  }

  window.PLKaart = {
    scan: scan, stop: stop, staat: staat, schatting: schatting,
    kaart: function () { return _laatsteKaart; },
    naarTekst: naarTekst, render: render,
    trap: function () { return DID_TRAP.slice(); },
    magVerzenden: magVerzenden,
    cfg: CFG,
    _intern: {
      splitsRegels: splitsRegels, ontpak: ontpak, duid: duid, adresplan: adresplan,
      didLijst: didLijst, telDatapunten: telDatapunten, nrcTekst: nrcTekst
    }
  };
})();
