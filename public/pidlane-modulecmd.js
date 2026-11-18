// ══════════════════════════════════════════════════════════════════
// pidlane-modulecmd.js — PLModuleCmd: een commando naar één stuurapparaat
// (17-11-2026, alleen admin)
// ──────────────────────────────────────────────────────────────────
// WAT. Een console in het adminmenu: kies het adres van een stuurapparaat
// (bv. 7D0, de airbagmodule van veel Hyundai/Kia), typ de bytes (bv. 10 03)
// en de app stuurt precies dat, met het antwoord en de vertaalde weigering
// erbij. Daaronder een receptenlijst: een reeks stappen per merk, model en
// module die je zelf bewaart nadat je hem geverifieerd hebt.
//
// SJABLONEN (18-11-2026). Een sjabloon vult alleen het formulier "Recept
// bewaren" in; het draait niet en staat niet in de lijst. Je past het aan
// en bewaart het zelf. Een bewaard recept kun je met ✎ terug in het
// formulier zetten en bijwerken (zelfde id = vervangen).
//
// AI ZOEKT, DE AUTO BEWIJST (18-11-2026). zoekAi() vraagt met merk, model,
// bouwjaar, motor en de idents van de module om recepten die de AI uit een
// benoembare bron kent. Kenteken en VIN gaan niet mee. leesAiRecepten() keurt
// het antwoord: zonder bron, met zekerheid "laag" of met een dienst buiten
// AI_DIENSTEN (dus geen 27, 2E, 31, 34–3D) valt een voorstel weg. Een
// voorstel is nooit "bewezen": dat wordt een recept pas als het op een auto
// van begin tot eind positief beantwoord is (bewijs(), bij elke ▶).
//
// WAT HET NIET IS. De app levert geen kant-en-klare recepten mee. Een reset van een
// airbagmodule vraagt bijna altijd een beveiligingssleutel van de fabrikant
// (0x27 seed/key); die zit hier niet in en wordt niet verzonnen. Alles
// hiervoor was lezend (pidlane-uds.js: "Alles hier is lezend"); dit is de
// eerste plek die naar een stuurapparaat kán schrijven, en daarom staan er
// drie remmen voor, op verzoek van de eigenaar (17-11-2026):
//   1. bevestiging: vóór het versturen staat elk schrijvend commando met
//      zijn betekenis in één venster; één "Ja, stuur" voor de hele reeks,
//      want een diagnosesessie (10 03) verloopt na ~5 s en een vraag per
//      stap zou hem tussendoor laten vallen
//   2. stilstand en motor uit: vlak vóór een schrijvend commando leest hij
//      zelf 010D en 010C; alleen 0 km/u en 0 tpm gaat door, en "niet te
//      lezen" is nee
//   3. alles in het logboek: elk commando met antwoord, adres en oordeel
//
// keur(), dienst(), schrijft(), oordeel(), poortOordeel() en recepten-
// bewerkingen zijn puur; test-modulecmd.js laadt dit bestand met vm.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CFG = { atMs: 1500, cmdMs: 4000, busWachtMs: 8000, maxStappen: 8, maxBytes: 7, opslag: 'pl_modrecepten' };

  /* Diensten (ISO 14229 / SAE J1979). `lees: true` verandert niets in het
     stuurapparaat; al het andere — ook een onbekende dienst — telt als
     schrijvend en gaat langs de remmen. 0x04 wist foutcodes: schrijvend. */
  var DIENSTEN = {
    '01': ['OBD live-data', true], '02': ['OBD freeze frame', true], '03': ['OBD foutcodes', true],
    '04': ['OBD foutcodes WISSEN', false], '06': ['OBD zelftests', true], '07': ['OBD wachtende codes', true],
    '09': ['OBD voertuiginfo', true], '0A': ['OBD permanente codes', true],
    '10': ['Diagnosesessie wisselen', false], '11': ['Stuurapparaat RESETTEN', false],
    '14': ['Foutgeheugen WISSEN', false], '19': ['Foutcodes lezen', true], '22': ['Gegevens lezen (DID)', true],
    '23': ['Geheugen lezen', true], '27': ['Beveiligingstoegang', false], '28': ['Communicatie aan/uit', false],
    '2E': ['Gegevens SCHRIJVEN (DID)', false], '2F': ['Uitgang aansturen', false], '31': ['Routine starten', false],
    '34': ['Download vragen', false], '35': ['Upload vragen', false], '36': ['Data overdragen', false], '37': ['Overdracht stoppen', false],
    '3B': ['Gegevens SCHRIJVEN (lokaal)', false], '3D': ['Geheugen SCHRIJVEN', false], '3E': ['Tester aanwezig', true],
    '85': ['Foutopslag aan/uit', false], '87': ['Verbindingssnelheid', false]
  };
  var NRC = {
    '10': 'algemeen geweigerd', '11': 'dienst niet ondersteund', '12': 'subfunctie niet ondersteund',
    '13': 'verkeerde lengte of vorm', '14': 'antwoord te lang', '21': 'bezet, probeer opnieuw',
    '22': 'voorwaarden niet goed (sessie, snelheid, motor?)', '24': 'verkeerde volgorde', '31': 'buiten bereik',
    '33': 'beveiliging vereist (0x27)', '35': 'verkeerde sleutel', '36': 'te veel pogingen', '37': 'wachttijd nog niet om',
    '72': 'programmeren mislukt', '78': 'bezig (wacht)', '7E': 'subfunctie niet in deze sessie', '7F': 'dienst niet in deze sessie'
  };

  function hexSchoon(s) { return String(s || '').toUpperCase().replace(/[\s:,]/g, ''); }

  /* ── Invoer keuren (puur) ──────────────────────────────────────────
     hdr: drie hextekens (11-bit CAN, 700–7FF). bytes: 1–7 bytes hex. Geen
     AT-commando's: alleen hex komt door, dus "ATZ" of "AT MA" kan niet. */
  function keurAdres(hdr) {
    var h = hexSchoon(hdr);
    if (!/^[0-7][0-9A-F]{2}$/.test(h)) return { ok: false, fout: 'adres moet drie hextekens zijn, bv. 7D0 (11-bit CAN)' };
    return { ok: true, hdr: h };
  }
  function keur(hdr, bytes) {
    var a = keurAdres(hdr);
    if (!a.ok) return a;
    var b = hexSchoon(bytes);
    if (!b) return { ok: false, fout: 'geen bytes' };
    if (!/^[0-9A-F]+$/.test(b)) return { ok: false, fout: 'alleen hex (0–9, A–F) — AT-commando\'s kunnen hier niet' };
    if (b.length % 2) return { ok: false, fout: 'oneven aantal hextekens: elk byte is twee tekens' };
    if (b.length / 2 > CFG.maxBytes) return { ok: false, fout: 'hoogstens ' + CFG.maxBytes + ' bytes per commando (één CAN-frame)' };
    return { ok: true, hdr: a.hdr, bytes: b };
  }

  function dienst(bytes) {
    var sid = hexSchoon(bytes).slice(0, 2);
    var d = DIENSTEN[sid];
    return { sid: sid, naam: d ? d[0] : 'onbekende dienst 0x' + sid, lees: !!(d && d[1]) };
  }
  function schrijft(bytes) { return !dienst(bytes).lees; }

  function rx(hdr) { return (parseInt(hdr, 16) + 8).toString(16).toUpperCase(); }

  /* ── Het antwoord lezen (puur) ─────────────────────────────────────
     Positief = SID + 0x40. Negatief = 7F SID NRC; 7F .. 78 betekent "bezig"
     en wordt overgeslagen (het echte antwoord volgt). Meerdere frames
     ("0: … 1: …") worden aan elkaar geplakt. */
  function berichten(raw) {
    var uit = [], huidig = null;
    String(raw || '').split(/[\r\n]+/).forEach(function (r) {
      var l = r.replace(/>/g, '').trim().toUpperCase();
      if (!l || /SEARCHING|BUS INIT|^OK$/.test(l)) return;
      if (/^[0-9A-F]{3}$/.test(l)) { huidig = { hex: '' }; uit.push(huidig); return; }
      var fr = l.match(/^[0-9A-F]:\s*(.*)$/);
      if (fr && huidig) { huidig.hex += fr[1].replace(/[^0-9A-F]/g, ''); return; }
      huidig = null;
      uit.push({ hex: l.replace(/[^0-9A-F]/g, ''), tekst: l });
    });
    return uit;
  }
  function oordeel(bytes, raw) {
    var sid = hexSchoon(bytes).slice(0, 2), pos = (parseInt(sid, 16) + 0x40).toString(16).toUpperCase();
    var t = String(raw || '').toUpperCase();
    if (!t.trim() || /NO DATA|UNABLE|STOPPED|BUFFER|CAN ERROR|\?/.test(t)) return { staat: 'stil', tekst: 'geen antwoord (' + (t.trim() || 'leeg') + ')' };
    var uit = null;
    berichten(t).some(function (m) {
      if (m.hex.indexOf(pos) === 0) { uit = { staat: 'ok', data: m.hex.slice(2), tekst: 'positief antwoord' + (m.hex.length > 2 ? ': ' + m.hex.slice(2).replace(/(..)/g, '$1 ').trim() : '') }; return true; }
      if (m.hex.indexOf('7F' + sid) === 0) {
        var nrc = m.hex.substr(4, 2);
        if (nrc === '78') return false;
        uit = { staat: 'geweigerd', nrc: nrc, tekst: 'geweigerd: ' + (NRC[nrc] || 'reden 0x' + nrc) + ' (7F ' + sid + ' ' + nrc + ')' };
        return true;
      }
      return false;
    });
    return uit || { staat: 'onbekend', tekst: 'onverwacht antwoord: ' + t.replace(/\s+/g, ' ').trim().slice(0, 120) };
  }

  /* ── De poort: stilstand en motor uit (puur) ───────────────────────
     raw010D/raw010C: het ruwe antwoord. Alleen 0 en 0 gaat door; een
     antwoord dat niet te lezen is, is een nee. */
  function waardeUit(raw, pid) {
    var hex = String(raw || '').toUpperCase().replace(/[^0-9A-F\r\n]/g, ' ');
    var m = hex.replace(/\s+/g, '').match(new RegExp('41' + pid + '([0-9A-F]{2})([0-9A-F]{2})?'));
    if (!m) return null;
    return pid === '0C' ? ((parseInt(m[1], 16) * 256 + parseInt(m[2] || '00', 16)) / 4) : parseInt(m[1], 16);
  }
  function poortOordeel(raw010D, raw010C) {
    var kmh = waardeUit(raw010D, '0D'), rpm = waardeUit(raw010C, '0C');
    if (kmh === null) return { ok: false, tekst: 'snelheid niet te lezen — contact aan?' };
    if (rpm === null) return { ok: false, tekst: 'toerental niet te lezen — contact aan?' };
    if (kmh !== 0) return { ok: false, tekst: 'de auto rijdt (' + kmh + ' km/u) — alleen bij stilstand' };
    if (rpm >= 50) return { ok: false, tekst: 'de motor draait (' + Math.round(rpm) + ' tpm) — zet de motor uit, contact aan' };
    return { ok: true, tekst: 'stilstand, motor uit' };
  }

  /* De tekst van het bevestigingsvenster: elk schrijvend commando apart. */
  function bevestigTekst(hdr, stappen) {
    var w = stappen.filter(schrijft);
    return 'Naar stuurapparaat ' + hdr + ' gaan ' + w.length + ' schrijvende commando(\'s):\n\n' +
      w.map(function (b) { return '• ' + b.replace(/(..)/g, '$1 ').trim() + ' — ' + dienst(b).naam; }).join('\n') +
      '\n\nDit kan instellingen of het geheugen van de module veranderen. Een verkeerd commando kan de module ' +
      'onbruikbaar maken; controleer na afloop zelf de waarschuwingslampjes. Versturen?';
  }

  /* ── Sjablonen: vullen het formulier, draaien nooit zelf ───────────────
     Ongeverifieerd: elk sjabloon zegt dat in zijn notitie. Hyundai i20 (PB,
     SRS 95910-1J400): KWP2000 of UDS is per module niet zeker, dus twee. */
  var SJABLONEN = [
    { naam: 'Airbag foutcodes wissen (UDS)', merk: 'Hyundai', model: 'i20 (PB) 2009', module: 'Airbag (SRS) 95910-1J400', hdr: '7D0',
      stappen: ['10 03', '14 FF FF FF', '19 02 FF'],
      notitie: 'SJABLOON, ongeverifieerd. Wist alleen opgeslagen codes; eerst de oorzaak herstellen. Crashdata gaat niet via OBD. 7F 14 33 = sleutel nodig (0x27).' },
    { naam: 'Airbag foutcodes wissen (KWP)', merk: 'Hyundai', model: 'i20 (PB) 2009', module: 'Airbag (SRS) 95910-1J400', hdr: '7D0',
      stappen: ['10 81', '14 FF 00', '18 00 FF 00'],
      notitie: 'SJABLOON, ongeverifieerd. KWP2000-variant voor als 10 03 geweigerd wordt. Crashdata gaat niet via OBD.' },
    { naam: '', merk: '', model: '', module: '', hdr: '', stappen: [], notitie: '', leeg: true }
  ];
  function sjabloon(i) {
    var t = SJABLONEN[i];
    if (!t) return null;
    return { id: '', naam: t.naam, merk: t.merk, model: t.model, module: t.module, hdr: t.hdr, stappen: t.stappen.join('\n'), notitie: t.notitie };
  }

  /* ── Recepten (puur op een lijst; opslag apart) ────────────────────── */
  function receptKeur(r) {
    r = r || {};
    var naam = String(r.naam || '').trim();
    if (!naam || naam.length > 80) return { ok: false, fout: 'naam ontbreekt of is langer dan 80 tekens' };
    var a = keurAdres(r.hdr);
    if (!a.ok) return a;
    var regels = (Array.isArray(r.stappen) ? r.stappen : String(r.stappen || '').split(/[\r\n;]+/)).map(hexSchoon).filter(Boolean);
    if (!regels.length || regels.length > CFG.maxStappen) return { ok: false, fout: '1 tot ' + CFG.maxStappen + ' stappen' };
    for (var i = 0; i < regels.length; i++) {
      var k = keur(a.hdr, regels[i]);
      if (!k.ok) return { ok: false, fout: 'stap ' + (i + 1) + ': ' + k.fout };
    }
    var kort = function (x) { return String(x || '').trim().slice(0, 60); };
    return { ok: true, recept: { id: String(r.id || ('r' + Date.now().toString(36))), naam: naam, merk: kort(r.merk), model: kort(r.model),
      module: kort(r.module), hdr: a.hdr, stappen: regels, notitie: String(r.notitie || '').trim().slice(0, 300),
      ai: !!r.ai, bron: String(r.bron || '').trim().slice(0, 120), bewezen: r.bewezen || null, laatst: r.laatst || null } };
  }
  function receptBij(lijst, r) {
    var k = receptKeur(r);
    if (!k.ok) return { ok: false, fout: k.fout, lijst: lijst };
    var uit = (lijst || []).filter(function (x) { return x.id !== k.recept.id; }).concat([k.recept]);
    uit.sort(function (a, b) { return (a.merk + a.model + a.naam).localeCompare(b.merk + b.model + b.naam); });
    return { ok: true, lijst: uit, recept: k.recept };
  }
  /* bewijs(lijst, id, uitkomst, wanneer) → nieuwe lijst. Alleen een reeks die
     van begin tot eind positief beantwoord is (staat 'ok') maakt een recept
     bewezen; elke uitkomst komt in `laatst`. Afgebroken vóór het versturen
     telt niet: er is niets gemeten. Een latere weigering haalt "bewezen" niet
     weg — het werkte ooit — maar `laatst` laat de weigering zien. */
  function bewijs(lijst, id, res, wanneer) {
    if (!res || res.staat === 'afgebroken') return lijst || [];
    return (lijst || []).map(function (x) {
      if (x.id !== id) return x;
      var y = {}; for (var k in x) y[k] = x[k];
      y.laatst = { staat: res.staat, tekst: String(res.tekst || '').slice(0, 120), datum: wanneer };
      if (res.staat === 'ok') y.bewezen = { datum: wanneer };
      return y;
    });
  }

  /* ── AI-zoektocht (puur, behalve zoekAi) ─────────────────────────── */
  var AI_DIENSTEN = { '03': 1, '04': 1, '10': 1, '11': 1, '14': 1, '18': 1, '19': 1, '1A': 1, '21': 1, '22': 1, '3E': 1 };
  var AI_SYSTEEM = 'Je bent een specialist in voertuigdiagnose (ISO 14229 UDS en KWP2000 op CAN). ' +
    'Geef alleen diagnoserecepten die je kent uit een benoembare bron: werkplaatshandboek, documentatie van een diagnosetool, OBDb, of een forumdraad waarin het resultaat bevestigd is. ' +
    'Verzin niets; ken je niets, geef dan een lege lijst. Geen beveiligingstoegang (27), geen schrijven (2E, 3B, 3D), geen routines (31), geen programmeren (34–37). ' +
    'Antwoord uitsluitend met JSON: {"recepten":[{"naam":"","module":"","hdr":"7D0","stappen":["10 03","14 FF FF FF"],"bron":"","zekerheid":"hoog|middel|laag","uitleg":""}]}. ' +
    'hdr is het 11-bit CAN-adres van de module; elke stap hoogstens 7 bytes hex; hoogstens 8 stappen.';
  function zoekPrompt(v, idents, vraag) {
    v = v || {};
    var r = function (l, w) { return w == null || w === '' ? '' : l + ': ' + String(w).slice(0, 80) + '\n'; };
    return 'Voertuig\n' + r('Merk', v.merk) + r('Model', v.model) + r('Bouwjaar', v.bouwjaar) + r('Motor', v.motor) + r('Brandstof', v.brandstof) + r('Transmissie', v.transmissie) +
      r('Idents van de module', idents) + '\nGezocht: ' + (String(vraag || '').trim().slice(0, 200) || 'recepten om foutcodes te lezen en te wissen per module') + '\n';
  }
  function leesAiRecepten(tekst, v) {
    v = v || {};
    var t = String(tekst || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
    var j;
    try { j = JSON.parse(t.slice(a, b + 1)); }
    catch (e) { console.warn('PLModuleCmd: AI-antwoord is geen JSON', e); return { ok: false, fout: 'het AI-antwoord was geen leesbare lijst', recepten: [], weg: [] }; }
    var uit = [], weg = [];
    ((j && Array.isArray(j.recepten)) ? j.recepten : []).slice(0, 12).forEach(function (x, i) {
      x = x || {};
      var naam = String(x.naam || ('voorstel ' + (i + 1))).slice(0, 80);
      var zeker = String(x.zekerheid || '').toLowerCase();
      if (!String(x.bron || '').trim()) { weg.push({ naam: naam, reden: 'geen bron' }); return; }
      if (zeker !== 'hoog' && zeker !== 'middel') { weg.push({ naam: naam, reden: 'zekerheid ' + (zeker || 'onbekend') }); return; }
      var stappen = (Array.isArray(x.stappen) ? x.stappen : []).map(hexSchoon);
      var buiten = stappen.filter(function (st) { return !AI_DIENSTEN[st.slice(0, 2)]; });
      if (buiten.length) { weg.push({ naam: naam, reden: 'dienst ' + buiten[0].slice(0, 2) + ' niet toegestaan' }); return; }
      var k = receptKeur({ id: 'ai' + i + '-' + Date.now().toString(36), naam: naam, merk: v.merk, model: [v.model, v.bouwjaar].filter(Boolean).join(' '),
        module: x.module, hdr: x.hdr, stappen: stappen, ai: true, bron: x.bron,
        notitie: 'AI-voorstel, niet bewezen (' + zeker + '). Bron: ' + String(x.bron).trim() + (x.uitleg ? '. ' + String(x.uitleg).trim() : '') });
      if (!k.ok) { weg.push({ naam: naam, reden: k.fout }); return; }
      uit.push(k.recept);
    });
    return { ok: true, recepten: uit, weg: weg };
  }
  /* zoekAi(v, idents, vraag, opt) → Promise<leesAiRecepten-uitkomst>.
     opt.ai(prompt, systeem) vervangt apiFetch (test). */
  async function zoekAi(v, idents, vraag, opt) {
    opt = opt || {};
    var ai = opt.ai || (typeof apiFetch === 'function' ? function (p, sys) { return apiFetch(p, 1500, sys, null, { meet: false }); } : null);
    if (!ai) return { ok: false, fout: 'AI niet beschikbaar', recepten: [], weg: [] };
    var u = leesAiRecepten(await ai(zoekPrompt(v, idents, vraag), AI_SYSTEEM), v);
    log('🧰 AI-receptzoektocht ' + [v && v.merk, v && v.model].filter(Boolean).join(' ') + ': ' + u.recepten.length + ' voorstel(len), ' + u.weg.length + ' afgekeurd', 'info');
    return u;
  }
  /* Een voorstel bewaren of het bewijs bijwerken: één plek die opslaat. */
  function bewaarRecept(r) { var u = receptBij(leesRecepten(), r); if (u.ok && !schrijfRecepten(u.lijst)) return { ok: false, fout: 'opslag weigert' }; return u; }

  function receptWeg(lijst, id) { return (lijst || []).filter(function (x) { return x.id !== id; }); }

  function leesRecepten() {
    try { var v = JSON.parse(localStorage.getItem(CFG.opslag) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { console.warn('PLModuleCmd: recepten onleesbaar', e); return []; }
  }
  function schrijfRecepten(l) {
    try { localStorage.setItem(CFG.opslag, JSON.stringify(l)); return true; }
    catch (e) { console.warn('PLModuleCmd: recepten niet bewaard', e); return false; }
  }

  // ── Uitvoeren ─────────────────────────────────────────────────────
  function log(m, n) {
    try { if (typeof window.log === 'function') window.log(m, n || 'info'); } catch (e) { console.warn('PLModuleCmd: log', e); }
    try { if (typeof window.btDiag === 'function') window.btDiag(m, n || 'info'); } catch (e) { console.warn('PLModuleCmd: btDiag', e); }
  }

  /* voerUit(hdr, stappen, opt) → Promise<{ staat, tekst, regels }>
     opt.stuur(cmd, ms) → Promise<string>   (standaard sendCmd)
     opt.vraag(tekst)  → Promise<boolean>   (standaard window.confirm)
     opt.bus(naam, fn) → Promise            (standaard withBus) */
  async function voerUit(hdr, stappen, opt) {
    opt = opt || {};
    var a = keurAdres(hdr);
    if (!a.ok) return { staat: 'fout', tekst: a.fout, regels: [] };
    var lijst = [];
    for (var i = 0; i < (stappen || []).length; i++) {
      var k = keur(a.hdr, stappen[i]);
      if (!k.ok) return { staat: 'fout', tekst: 'stap ' + (i + 1) + ': ' + k.fout, regels: [] };
      lijst.push(k.bytes);
    }
    if (!lijst.length) return { staat: 'fout', tekst: 'geen stappen', regels: [] };
    var stuur = opt.stuur;
    if (!stuur) {
      if (typeof demoMode !== 'undefined' && demoMode) return { staat: 'fout', tekst: 'niet in de demo: er hangt geen auto aan', regels: [] };
      if (typeof connected !== 'undefined' && !connected) return { staat: 'fout', tekst: 'niet verbonden', regels: [] };
      if (typeof sendCmd !== 'function') return { staat: 'fout', tekst: 'sendCmd ontbreekt', regels: [] };
      stuur = function (c, ms) { return sendCmd(c, ms); };
    }
    var vraag = opt.vraag || function (t) { return Promise.resolve(typeof confirm === 'function' ? confirm(t) : false); };
    var bus = opt.bus || (typeof withBus === 'function' ? function (n, f) { return withBus(n, f, CFG.busWachtMs); } : function (n, f) { return f(); });
    var schrijvend = lijst.some(schrijft);
    // Eerst de vraag, buiten de bus: een mens die leest houdt de meting niet op.
    if (schrijvend && !(await vraag(bevestigTekst(a.hdr, lijst)))) {
      log('🧰 Modulecommando ' + a.hdr + ': afgebroken vóór het versturen (' + lijst.join(' ') + ')', 'info');
      return { staat: 'afgebroken', tekst: 'niet verstuurd', regels: [] };
    }
    var res = { staat: 'ok', tekst: '', regels: [] };
    await bus('modulecmd', async function () {
      try {
        if (schrijvend) {
          await stuur('ATSH7DF', CFG.atMs);
          await stuur('ATCRA', CFG.atMs);
          var p = poortOordeel(await stuur('010D', CFG.cmdMs), await stuur('010C', CFG.cmdMs));
          if (!p.ok) { res.staat = 'geweigerd'; res.tekst = 'niet verstuurd: ' + p.tekst; return; }
        }
        await stuur('ATSH' + a.hdr, CFG.atMs);
        await stuur('ATCRA' + rx(a.hdr), CFG.atMs);
        for (var j = 0; j < lijst.length; j++) {
          var ruw = await stuur(lijst[j], CFG.cmdMs);
          var o = oordeel(lijst[j], ruw);
          var r = { tx: lijst[j], rx: String(ruw || '').replace(/\s+/g, ' ').trim().slice(0, 200), dienst: dienst(lijst[j]).naam, oordeel: o };
          res.regels.push(r);
          log('🧰 ' + a.hdr + ' TX ' + r.tx + ' (' + r.dienst + ') → ' + o.tekst + ' · RX ' + r.rx, o.staat === 'ok' ? 'ok' : 'warn');
          if (o.staat !== 'ok') { res.staat = o.staat; res.tekst = 'gestopt bij stap ' + (j + 1) + ': ' + o.tekst; return; }
        }
        res.tekst = lijst.length + ' stap(pen) positief beantwoord';
      } catch (e) {
        console.warn('PLModuleCmd: versturen mislukt', e);
        res.staat = 'fout'; res.tekst = 'versturen mislukt: ' + ((e && e.message) || e);
      } finally {
        try { await stuur('ATSH7DF', CFG.atMs); } catch (e) { console.warn('PLModuleCmd: ATSH7DF mislukt', e); log('🧰 adapter niet teruggezet op 7DF — verbind opnieuw', 'warn'); }
        try { await stuur('ATCRA', CFG.atMs); } catch (e) { console.warn('PLModuleCmd: ATCRA (wissen) mislukt', e); }
      }
    });
    log('🧰 Modulecommando ' + a.hdr + ': ' + res.staat + ' — ' + res.tekst, res.staat === 'ok' ? 'ok' : 'warn');
    return res;
  }

  // ── Het venster ───────────────────────────────────────────────────
  var _v = { bezig: false, uit: [], fout: '' };
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function waarde(id) { var e = document.getElementById(id); return e ? e.value : ''; }

  function html() {
    var veld = 'style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:monospace"';
    var knop = function (fn, t, extra) { return '<button type="button" ' + (_v.bezig ? 'disabled ' : '') + 'onclick="' + fn + '" style="padding:8px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-weight:700' + (extra || '') + '">' + t + '</button>'; };
    var recepten = leesRecepten();
    return '<div style="display:flex;justify-content:space-between;align-items:center"><b>🧰 Modulecommando\'s</b>' +
      '<button type="button" onclick="PLModuleCmd.sluit()" style="background:none;border:0;color:var(--tx);font-size:20px">✕</button></div>' +
      '<p style="font-size:12px;color:var(--tx2)">Schrijvende commando\'s gaan alleen bij stilstand met de motor uit, na bevestiging. Alles komt in het logboek. ' +
      'De app levert geen kant-en-klare recepten mee: een sjabloon vult alleen het formulier, jij past het aan en bewaart het. Een airbag-reset vraagt meestal een fabriekssleutel (0x27).</p>' +
      '<div style="display:grid;grid-template-columns:80px 1fr;gap:6px">' +
      '<input id="mcHdr" ' + veld + ' placeholder="7D0" maxlength="3">' +
      '<input id="mcBytes" ' + veld + ' placeholder="bytes, bv. 22 F1 90">' + '</div>' +
      '<div style="margin:6px 0">' + knop('PLModuleCmd.stuurVeld()', _v.bezig ? 'Bezig…' : 'Stuur') + '</div>' +
      (_v.fout ? '<div style="color:var(--rd)">' + esc(_v.fout) + '</div>' : '') +
      '<div id="mcUit" style="font-family:monospace;font-size:11px;white-space:pre-wrap;max-height:30vh;overflow:auto">' +
      _v.uit.map(function (r) { return esc(r); }).join('\n') + '</div>' +
      '<hr style="border-color:var(--bd)"><b>Recepten</b>' +
      (recepten.length ? recepten.map(function (r) {
        return '<div style="display:flex;gap:6px;align-items:center;margin:4px 0;flex-wrap:wrap"><span style="flex:1;min-width:0">' +
          esc([r.merk, r.model, r.module].filter(Boolean).join(' · ')) + ' — <b>' + esc(r.naam) + '</b> <code>' + esc(r.hdr) + ': ' + esc(r.stappen.join(' | ')) + '</code>' +
          (r.notitie ? '<br><small>' + esc(r.notitie) + '</small>' : '') + '</span>' +
          (r.bewezen ? '<span title="positief beantwoord op ' + esc(r.bewezen.datum) + '">✅</span>' : '<span title="nog niet bewezen">⚪</span>') +
          knop('PLModuleCmd.receptDraai(this.dataset.id)', '▶', '" data-id="' + esc(r.id)) +
          knop('PLModuleCmd.receptVul(this.dataset.id)', '✎', '" data-id="' + esc(r.id)) +
          knop('PLModuleCmd.receptWis(this.dataset.id)', '🗑', '" data-id="' + esc(r.id)) + '</div>';
      }).join('') : '<p style="font-size:12px;color:var(--tx2)">Nog geen recepten.</p>') +
      '<details id="mcRForm"><summary>Recept bewaren</summary><div style="display:grid;gap:6px;margin-top:6px">' +
      '<div style="display:flex;gap:6px"><select id="mcSjabloon" ' + veld + '>' +
      SJABLONEN.map(function (t, i) { return '<option value="' + i + '">' + esc(t.leeg ? 'Leeg formulier' : t.merk + ' ' + t.model + ' — ' + t.naam) + '</option>'; }).join('') +
      '</select>' + knop('PLModuleCmd.sjabloonVul(document.getElementById(\'mcSjabloon\').value)', 'Vul in') + '</div>' +
      '<input id="mcRId" type="hidden">' +
      ['mcRNaam|naam, bv. Airbag reset', 'mcRMerk|merk, bv. Hyundai', 'mcRModel|model, bv. i20 2011', 'mcRModule|module, bv. Airbag (SRS)', 'mcRHdr|adres, bv. 7D0']
        .map(function (x) { var p = x.split('|'); return '<input id="' + p[0] + '" ' + veld + ' placeholder="' + p[1] + '">'; }).join('') +
      '<textarea id="mcRStappen" ' + veld + ' rows="3" placeholder="één stap per regel, bv.&#10;10 03&#10;11 01"></textarea>' +
      '<input id="mcRNotitie" ' + veld + ' placeholder="bron / notitie">' +
      knop('PLModuleCmd.receptBewaar()', 'Bewaar recept') + '</div></details>';
  }
  function teken() {
    if (typeof document === 'undefined') return;
    var v = document.getElementById('plModCmd');
    if (!v) return;
    var hdr = waarde('mcHdr'), b = waarde('mcBytes');
    v.firstChild.innerHTML = html();
    var h = document.getElementById('mcHdr'), y = document.getElementById('mcBytes');
    if (h) h.value = hdr; if (y) y.value = b;
  }
  function open() {
    if (typeof document === 'undefined') return;
    if (typeof isAdmin === 'function' && !isAdmin()) { log('🧰 Modulecommando\'s: alleen voor admin', 'warn'); return; }
    var v = document.getElementById('plModCmd');
    if (!v) {
      v = document.createElement('div'); v.id = 'plModCmd';
      v.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal-hoog,9800);background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
      v.innerHTML = '<div style="width:100%;max-width:640px;max-height:100%;overflow:auto;box-sizing:border-box;background:var(--sur);color:var(--tx);border-radius:14px 14px 0 0;padding:14px 16px calc(14px + env(safe-area-inset-bottom))"></div>';
      document.body.appendChild(v);
    }
    teken();
  }
  function sluit() { var v = typeof document !== 'undefined' && document.getElementById('plModCmd'); if (v) v.remove(); }

  async function draai(hdr, stappen) {
    if (_v.bezig) return null;
    _v.bezig = true; _v.fout = ''; teken();
    var r = null;
    try {
      r = await voerUit(hdr, stappen);
      var t = new Date().toLocaleTimeString('nl-NL');
      r.regels.forEach(function (x) { _v.uit.push('[' + t + '] ' + hdr + ' TX ' + x.tx + ' → ' + x.oordeel.tekst); });
      _v.uit.push('[' + t + '] ' + r.staat + ' — ' + r.tekst);
      if (r.staat === 'fout' || r.staat === 'geweigerd') _v.fout = r.tekst;
    } catch (e) { console.warn('PLModuleCmd: draaien mislukt', e); _v.fout = String((e && e.message) || e); }
    _v.bezig = false; teken();
    return r;
  }
  function stuurVeld() { return draai(hexSchoon(waarde('mcHdr')), [waarde('mcBytes')]); }
  function receptDraai(id) {
    var r = leesRecepten().filter(function (x) { return x.id === id; })[0];
    if (!r) { _v.fout = 'recept niet gevonden'; teken(); return null; }
    _v.uit.push('— recept: ' + r.naam + ' (' + r.hdr + ')');
    return draai(r.hdr, r.stappen).then(function (res) {
      if (res && !schrijfRecepten(bewijs(leesRecepten(), id, res, new Date().toISOString()))) log('🧰 uitkomst van het recept niet bewaard', 'warn');
      teken();
      return res;
    });
  }
  function receptBewaar() {
    var u = receptBij(leesRecepten(), { naam: waarde('mcRNaam'), merk: waarde('mcRMerk'), model: waarde('mcRModel'), module: waarde('mcRModule'),
      hdr: waarde('mcRHdr'), stappen: waarde('mcRStappen'), notitie: waarde('mcRNotitie'), id: waarde('mcRId') });
    if (!u.ok) { _v.fout = 'recept niet bewaard: ' + u.fout; teken(); return false; }
    _v.fout = schrijfRecepten(u.lijst) ? '' : 'recept niet bewaard: opslag weigert';
    if (!_v.fout) log('🧰 Recept bewaard: ' + u.recept.naam + ' (' + u.recept.hdr + ': ' + u.recept.stappen.join(' | ') + ')', 'info');
    teken();
    return !_v.fout;
  }
  /* Zet een recept (sjabloon of bewaard) in het formulier; draait niets. */
  function vulFormulier(r) {
    if (typeof document === 'undefined' || !r) return false;
    var f = document.getElementById('mcRForm');
    if (f) f.open = true;
    [['mcRId', r.id], ['mcRNaam', r.naam], ['mcRMerk', r.merk], ['mcRModel', r.model], ['mcRModule', r.module], ['mcRHdr', r.hdr],
      ['mcRStappen', Array.isArray(r.stappen) ? r.stappen.map(function (b) { return b.replace(/(..)/g, '$1 ').trim(); }).join('\n') : r.stappen],
      ['mcRNotitie', r.notitie]].forEach(function (x) { var e = document.getElementById(x[0]); if (e) e.value = x[1] || ''; });
    return true;
  }
  function sjabloonVul(i) { return vulFormulier(sjabloon(parseInt(i, 10))); }
  function receptVul(id) { return vulFormulier(leesRecepten().filter(function (x) { return x.id === id; })[0]); }
  function receptWis(id) {
    if (typeof confirm === 'function' && !confirm('Dit recept weghalen?')) return;
    schrijfRecepten(receptWeg(leesRecepten(), id)); teken();
  }

  window.PLModuleCmd = {
    CFG: CFG, DIENSTEN: DIENSTEN, NRC: NRC, AI_DIENSTEN: AI_DIENSTEN, AI_SYSTEEM: AI_SYSTEEM, bewijs: bewijs, zoekPrompt: zoekPrompt,
    leesAiRecepten: leesAiRecepten, zoekAi: zoekAi, bewaarRecept: bewaarRecept, leesRecepten: leesRecepten, SJABLONEN: SJABLONEN, sjabloon: sjabloon, sjabloonVul: sjabloonVul, receptVul: receptVul,
    keur: keur, keurAdres: keurAdres, dienst: dienst, schrijft: schrijft, oordeel: oordeel, poortOordeel: poortOordeel,
    bevestigTekst: bevestigTekst, receptKeur: receptKeur, receptBij: receptBij, receptWeg: receptWeg, voerUit: voerUit,
    open: open, sluit: sluit, stuurVeld: stuurVeld, receptDraai: receptDraai, receptBewaar: receptBewaar, receptWis: receptWis
  };
})();
