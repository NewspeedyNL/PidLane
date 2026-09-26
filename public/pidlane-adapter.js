/* ═══════════════════════════════════════════════════════════════════
   pidlane-adapter.js — PLAdapter: wat doet deze verbinding, en wie regelt hem?
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Op 16-09-2026 is dezelfde Mazda gemeten met een goedkope ELM327-kloon in
   plaats van de MX+. Blok 10 meldde "zonder één misser tot 3.2 verzoeken/s"
   terwijl de app op datzelfde moment op 19% pollbudget stond. Twee getallen
   die elkaar tegenspreken, allebei uit dezelfde app, en nergens een scherm
   waar ze naast elkaar stonden.

   De cijfers wáren er wel. `PLBus.stats()` geeft bezetting, foutgraad,
   responstijd, onvolledige antwoorden en sinds #210 ook het aantal herhaalde
   antwoorden; `PLLoad` weet welk tempo hij koos en waarom. Alleen kwam daar
   niets van op het scherm: de OBD-chip vroeg bij een tik of je de verbinding
   wilde verbreken, en dat was alles.

   Dit paneel is die plek. Het meet niets nieuws — het toont wat de app al
   weet, plus één eigen meting op verzoek.

   DRIE DINGEN DIE HET TOEVOEGT

   1. EEN HANDMATIGE STAND. Tot vandaag was het tempo een meting en geen
      keuze, en dat was de goede keuze zolang niemand de cijfers zag. Met de
      cijfers erbij verandert dat: op een adapter die frames herhaalt regelt
      de automaat op signalen die de verkeerde kant op wijzen, en dan wil je
      hem opzij kunnen zetten. Zie PLLoad.handmatig().

   2. HET ACTIELOGBOEK VAN DE AUTOMAAT. "Waarom staat de app op 17%" was
      alleen te beantwoorden door het hele BT-log door te lezen. PLLoad boekt
      elke stap nu met de reden erbij, en die staan hier onder elkaar.

   3. EEN EIGEN SNELHEIDSTEST, MET BATCHES. Blok 10 in de testrun vraagt één
      PID per verzoek, terwijl de app in groepen van drie polt. Op een
      echoënde adapter is dat precies het verschil tussen "niets aan de hand"
      en "een derde van de batches verliest zijn laatste PID" (#212). Deze
      test doet allebei, in dezelfde omstandigheden, en zegt erbij welke van
      de twee het knelpunt is.

   WAT DIT NIET IS

   Geen tweede regelkring. De automaat blijft PLLoad, de busstatistiek blijft
   PLBus, de batchgrootte blijft PLBus.batchGroep(). Dit bestand leest en
   toont, en zet in de handmatige stand één vlag om. Eén ding, één betekenis.

   Geen vervanging van blok 10. Die proef duurt negen en een halve minuut en
   meet vijf trappen met rust ertussen; deze duurt veertig seconden en meet
   vier. Voor "kan ik nu harder" is dat genoeg; voor "loopt er een buffer vol
   die niet meer leegloopt" niet.

   Draait volledig in JS: er staat geen markup van dit paneel in index.html,
   net als bij pidlane-run.js. Classic script, geen module.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ADAPTER_VERSIE = '1.0 (16-09-2026)';

  // ── de geschiedenis ───────────────────────────────────────────────
  // Eén monster per 3 s, 240 stuks = twaalf minuten. Kost geen buscapaciteit:
  // PLBus.stats() rekent alleen over wat er al geteld is.
  const HIST_MS = 3000, HIST_MAX = 240;
  const _hist = [];
  let _sampler = null, _open = false, _tekenT = null;

  // Uitkomst van de laatste snelheidstest; blijft staan tot de volgende, want
  // een advies dat verdwijnt zodra je het paneel sluit is geen advies.
  let _meting = null, _meetBezig = false, _meetStand = '';

  function _stats() {
    try {
      if (window.PLBus && typeof PLBus.stats === 'function') return PLBus.stats();
    } catch (e) { console.warn('PLBus.stats mislukt — het adapterpaneel toont dan geen cijfers', e); }
    return null;
  }
  function _load() {
    try {
      if (window.PLLoad && typeof PLLoad.staat === 'function') return PLLoad.staat();
    } catch (e) { console.warn('PLLoad.staat mislukt — het adapterpaneel toont dan geen tempo', e); }
    return null;
  }
  function _verbonden() {
    try { return !!((typeof connected !== 'undefined' && connected) || (typeof demoMode !== 'undefined' && demoMode)); }
    catch (e) { return false; }
  }

  function monster() {
    const s = _stats(), l = _load();
    if (!s) return null;
    let groep = 3;
    try { if (window.PLBus && typeof PLBus.batchGroep === 'function') groep = PLBus.batchGroep(); }
    catch (e) { console.warn('PLBus.batchGroep mislukt:', e); }
    const m = {
      t: Date.now(),
      perSec: s.perSec || 0,
      venMs: s.venGemMs || 0,
      bezet: s.belasting || 0,
      fout: s.foutPct || 0,
      onvol: s.onvolPct || 0,
      echo: s.echoTot || 0,
      tempo: l ? l.tempoPct : null,
      groep: groep
    };
    _hist.push(m);
    if (_hist.length > HIST_MAX) _hist.shift();
    return m;
  }

  function historie() { return _hist.slice(); }

  // ══════════════════════════════════════════════════════════════════
  // HET ADVIES — een pure functie, want dit is het enige stuk rekenwerk
  // ══════════════════════════════════════════════════════════════════
  /* Wat er in gaat: de trappen uit de snelheidstest en wat de app op dit
     moment doet. Wat eruit komt: één aanbeveling met de reden erbij.

     Bewust los van de meting zelf, zodat hij zonder adapter te toetsen is.
     Dat is niet academisch: de vorige keer dat een oordeel in de meetlus zat
     (`_snelheidVraag` in blok 10) bleek pas na een rit dat het oordeel over
     ander verkeer ging dan de app stuurt.

     DE REGELS, IN VOLGORDE

     1. Herhaalt de adapter frames op élke trap, dan is snelheid niet het
        probleem en een kleinere groep wel. Dat advies wint, want harder
        pollen maakt een echo alleen maar vaker.
     2. Anders: de snelste trap zonder solo-missers én met hoogstens 5%
        onvolledige batches is wat deze verbinding aankan.
     3. Het tempo-advies is rekenwerk, geen gok: staat de app op T% en haalt
        hij daarbij H verzoeken/s, dan hoort bij V verzoeken/s een tempo van
        T × V / H — afgekapt op 100%. Zonder H (de app polt niet) kan dat niet
        en zegt het advies dat ook. */
  function advies(stappen, huidig) {
    const st = Array.isArray(stappen) ? stappen.filter(function (x) { return x && x.n > 0; }) : [];
    if (!st.length) return { tempoPct: null, kop: 'Geen meting', reden: 'er zijn geen trappen gemeten' };

    const metEcho = st.filter(function (x) { return (x.echo || 0) > 0; });
    if (metEcho.length === st.length) {
      const tot = st.reduce(function (a, x) { return a + (x.echo || 0); }, 0);
      return {
        tempoPct: null,
        groep: 2,
        kop: 'Deze adapter herhaalt frames',
        reden: 'op alle ' + st.length + ' trappen samen ' + tot + ' herhaalde antwoorden. ' +
               'Dat is geen snelheidsprobleem: harder pollen maakt het vaker, niet minder. ' +
               'Een kleinere groep past wél vaker in één frame.'
      };
    }

    const schoon = st.filter(function (x) {
      return (x.soloMisPct || 0) === 0 && (x.batchOnvolPct || 0) <= 5 && (x.echo || 0) === 0;
    });
    if (!schoon.length) {
      const laagste = st[0];
      return {
        tempoPct: null,
        kop: 'Geen enkele trap bleef schoon',
        reden: 'zelfs op de rustigste trap (' + laagste.perSec + '/s) viel er iets weg — ' +
               laagste.soloMisPct + '% solo-missers, ' + laagste.batchOnvolPct + '% onvolledige batches. ' +
               'Dit is geen tempokwestie maar een verbinding die hapert.'
      };
    }
    const best = schoon.reduce(function (a, b) { return b.perSec > a.perSec ? b : a; });

    const h = huidig || {};
    if (!h.perSec || !h.tempoPct) {
      return {
        tempoPct: null, veiligPerSec: best.perSec,
        kop: 'Deze verbinding haalt ' + best.perSec + ' verzoeken/s schoon',
        reden: 'wat dat voor het tempo betekent is nu niet te zeggen: de app polde tijdens de meting zelf niet, ' +
               'dus er is geen ijkpunt om tegen af te zetten.'
      };
    }
    const ruw = h.tempoPct * (best.perSec / h.perSec);
    const pct = Math.max(10, Math.min(100, Math.round(ruw)));
    const zelfde = Math.abs(pct - h.tempoPct) < 8;
    return {
      tempoPct: pct, veiligPerSec: best.perSec,
      kop: zelfde ? 'Het tempo staat ongeveer goed'
                  : (pct > h.tempoPct ? 'Er kan meer bij: ' + pct + '%' : 'Rustiger aan: ' + pct + '%'),
      reden: 'schoon tot ' + best.perSec + ' verzoeken/s (mediaan ' + best.medMs + ' ms). ' +
             'De app doet nu ' + h.perSec + '/s op ' + h.tempoPct + '%, dus bij ' + best.perSec + '/s hoort ' +
             pct + '%.' + (zelfde ? ' Dat is waar hij al staat.' : '')
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // DE SNELHEIDSTEST
  // ══════════════════════════════════════════════════════════════════
  /* Vier trappen van tien seconden. Elke trap stuurt om en om één losse PID
     en één batch van de huidige groepsgrootte, zodat beide paden onder
     dezelfde omstandigheden gemeten worden — dat is het punt van #212.

     Solo telt een MISSER: er kwam geen leesbare waarde terug.
     Batch telt ONVOLLEDIG: er kwam wel iets, maar niet alles wat gevraagd is.
     Dat onderscheid is de hele reden dat deze test bestaat: op de kloon van
     16-09 was het eerste getal nul en het tweede vijfendertig procent. */
  const TRAPPEN = [
    { naam: 'rustig', pauze: 700, sec: 10 },
    { naam: 'normaal', pauze: 300, sec: 10 },
    { naam: 'snel', pauze: 120, sec: 10 },
    { naam: 'vol gas', pauze: 0, sec: 10 }
  ];

  function _wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function _mediaan(a) {
    if (!a.length) return 0;
    const s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }

  // Welke PIDs zijn veilig om mee te meten? Alleen wat de auto aantoonbaar
  // beantwoordt — anders meet je dode sensoren en niet het transport. Dezelfde
  // les als de ijkronde van blok 10.
  function _meetPids() {
    let lijst = [];
    try {
      if (typeof activePIDs !== 'undefined' && activePIDs && activePIDs.size) lijst = Array.from(activePIDs);
      else if (typeof supportedPIDs !== 'undefined' && supportedPIDs && supportedPIDs.size) lijst = Array.from(supportedPIDs);
    } catch (e) { console.warn('Geen PID-lijst voor de snelheidstest — hij valt terug op 010C/010D/0104', e); }
    lijst = lijst.filter(function (p) { return /^01[0-9A-F]{2}$/i.test(String(p)) && !/^01(00|20|40|60|80|A0|C0)$/i.test(String(p)); });
    if (lijst.length < 3) lijst = ['010C', '010D', '0104'];
    return lijst.slice(0, 9);
  }

  async function meet() {
    if (_meetBezig) return null;
    if (!_verbonden()) { _melding('Verbind eerst een adapter'); return null; }
    try { if (typeof demoMode !== 'undefined' && demoMode) { _melding('In demomodus meet dit de app, niet de adapter'); return null; } }
    catch (e) { console.warn('demoMode niet leesbaar — de snelheidstest gaat door alsof er een echte adapter hangt', e); }
    if (typeof sendCmd !== 'function') { _melding('sendCmd ontbreekt — er valt niets te meten'); return null; }

    _meetBezig = true;
    const pids = _meetPids();
    let groep = 3;
    try { if (window.PLBus && typeof PLBus.batchGroep === 'function') groep = PLBus.batchGroep(); }
    catch (e) { console.warn('PLBus.batchGroep mislukt — de test meet met groep 3', e); }

    // Het ijkpunt vóór de test: wat doet de app nu, en op welk tempo. Hierna
    // is de bus door de test zelf bezet en zegt dat getal niets meer.
    const s0 = _stats(), l0 = _load();
    const huidig = { perSec: s0 ? s0.perSec : 0, tempoPct: l0 ? l0.tempoPct : 0 };
    const uit = [];

    try {
      for (let t = 0; t < TRAPPEN.length; t++) {
        const trap = TRAPPEN[t];
        _meetStand = 'trap ' + (t + 1) + ' van ' + TRAPPEN.length + ' (' + trap.naam + ')…';
        _teken();
        const tijden = [];
        let n = 0, soloN = 0, soloMis = 0, batchN = 0, batchOnvol = 0, i = 0;
        const echoVoor = (_stats() || {}).echoTot || 0;
        const eind = Date.now() + trap.sec * 1000;
        while (Date.now() < eind) {
          if (!_verbonden()) break;
          const t0 = Date.now();
          if (i % 2 === 0) {
            const pid = pids[(i / 2 | 0) % pids.length];
            let raw = '';
            try { raw = await sendCmd(pid, 2000); } catch (e) { raw = ''; }
            tijden.push(Date.now() - t0);
            soloN++;
            let w = null;
            try { if (typeof parsePID === 'function') w = parsePID(pid, raw); } catch (e) { w = null; }
            if (w === null || w === undefined || (typeof w === 'number' && isNaN(w))) soloMis++;
          } else {
            const grp = [];
            for (let k = 0; k < groep; k++) grp.push(pids[((i >> 1) * groep + k) % pids.length]);
            const uniek = grp.filter(function (p, k) { return grp.indexOf(p) === k; });
            const cmd = '01' + uniek.map(function (p) { return p.slice(2); }).join('');
            let raw = '';
            try { raw = await sendCmd(cmd, 2000); } catch (e) { raw = ''; }
            tijden.push(Date.now() - t0);
            batchN++;
            let gekregen = {};
            try { if (typeof splitBatchResponse === 'function') gekregen = splitBatchResponse(raw, uniek) || {}; }
            catch (e) { gekregen = {}; }
            if (uniek.filter(function (p) { return !(p in gekregen); }).length) batchOnvol++;
          }
          n++; i++;
          if (trap.pauze) await _wacht(trap.pauze);
        }
        const echoNa = (_stats() || {}).echoTot || 0;
        uit.push({
          naam: trap.naam, n: n,
          perSec: +(n / trap.sec).toFixed(1),
          medMs: _mediaan(tijden),
          soloN: soloN, soloMis: soloMis,
          soloMisPct: soloN ? Math.round(soloMis / soloN * 100) : 0,
          batchN: batchN, batchOnvol: batchOnvol,
          batchOnvolPct: batchN ? Math.round(batchOnvol / batchN * 100) : 0,
          echo: Math.max(0, echoNa - echoVoor)
        });
      }
    } finally {
      _meetBezig = false;
      _meetStand = '';
    }

    _meting = { t: Date.now(), groep: groep, stappen: uit, huidig: huidig, advies: advies(uit, huidig) };
    try {
      if (typeof btDiag === 'function') {
        btDiag('Adaptertest: ' + uit.map(function (x) {
          return x.naam + ' ' + x.perSec + '/s solo ' + x.soloMisPct + '% batch ' + x.batchOnvolPct + '%' +
                 (x.echo ? ' echo ' + x.echo : '');
        }).join(' | '), 'ok');
        btDiag('Adaptertest-advies: ' + _meting.advies.kop + ' — ' + _meting.advies.reden, 'ok');
      }
    } catch (e) { console.warn('De uitkomst van de adaptertest kwam niet in het BT-log:', e); }
    _teken();
    return _meting;
  }

  function laatsteMeting() { return _meting; }

  // ══════════════════════════════════════════════════════════════════
  // WIE HANGT ER AAN DE LIJN
  // ══════════════════════════════════════════════════════════════════
  /* De naam die Android/Chrome aan het apparaat geeft, plus wat de adapter
     zelf op ATI antwoordt. Dat tweede wordt één keer per sessie gevraagd en
     bewaard: ATI kost een commando, en dit paneel mag geen buscapaciteit
     opeten omdat het openstaat. */
  let _ati = null, _atiBezig = false;

  function adapterNaam() {
    try { if (window._sppConn && window._sppConn.name) return String(window._sppConn.name); } catch (e) { /* stil: geen SPP-verbinding */ }
    try { if (window._bleConn && window._bleConn.name) return String(window._bleConn.name); } catch (e) { /* stil: geen BLE-verbinding */ }
    try { const n = localStorage.getItem('spp_name'); if (n) return String(n); } catch (e) { /* stil: opslag kan geblokkeerd zijn */ }
    try { if (typeof demoMode !== 'undefined' && demoMode) return 'Demo (geen adapter)'; } catch (e) { /* stil */ }
    return 'onbekend';
  }

  async function vraagAti() {
    if (_ati !== null || _atiBezig) return _ati;
    if (!_verbonden()) return null;
    try { if (typeof demoMode !== 'undefined' && demoMode) { _ati = 'Demo'; return _ati; } } catch (e) { /* stil */ }
    if (typeof sendCmd !== 'function') return null;
    _atiBezig = true;
    try {
      const doe = function () { return sendCmd('ATI', 2000); };
      // Via de bus, maar zonder erop te wachten: dit is één AT-commando en het
      // mag de pollus niet voor zich uit duwen. Wachttijd 0 = pakken als hij
      // vrij is (zie withBus in pidlane-data.js).
      const r = (typeof withBus === 'function') ? await withBus('adapterpaneel-ati', doe, 0) : await doe();
      _ati = String(r || '').replace(/[\r\n>]+/g, ' ').trim() || 'geen antwoord op ATI';
    } catch (e) {
      _ati = 'ATI mislukt: ' + ((e && e.message) || e);
    } finally {
      _atiBezig = false;
    }
    _teken();
    return _ati;
  }

  function protocol() {
    try { if (typeof _connSpeed !== 'undefined' && _connSpeed && _connSpeed.protocol) return String(_connSpeed.protocol); }
    catch (e) { /* stil: _connSpeed bestaat pas na de eerste snelheidsmeting */ }
    try { if (typeof selectedNetwork !== 'undefined' && selectedNetwork && selectedNetwork.label) return String(selectedNetwork.label); }
    catch (e) { /* stil: er is nog geen protocol gekozen */ }
    return 'onbekend';
  }

  // ══════════════════════════════════════════════════════════════════
  // DE GRAFIEK — twee losse assen, dus twee losse grafieken
  // ══════════════════════════════════════════════════════════════════
  /* Verzoeken per seconde en responstijd in milliseconden zijn twee maten van
     verschillende schaal. Ze in één grafiek met twee y-assen zetten is de
     klassieke manier om een verband te suggereren dat er niet hoeft te zijn —
     welke as bij welke lijn hoort bepaalt dan het beeld. Vandaar twee kleine
     grafieken onder elkaar met dezelfde tijdas: één lijn per grafiek, dus ook
     geen legenda nodig; de kop noemt de lijn.

     De laatste waarde staat als getal in de kop, en de hoogste als label bij
     de bovenrand. Een getal bij elk punt zou de lijn onleesbaar maken en zegt
     niets extra's — de tabel eronder heeft de cijfers. */
  function _grafiek(sleutel, titel, eenheid, kleur) {
    const r = _hist.filter(function (m) { return m && typeof m[sleutel] === 'number'; });
    if (r.length < 2) {
      return '<div style="font:600 11px var(--f);color:var(--tx3);padding:14px 0;text-align:center">' +
             titel + ' — nog te weinig monsters (' + r.length + '/2)</div>';
    }
    const W = 300, H = 54, PAD = 4;
    const waarden = r.map(function (m) { return m[sleutel]; });
    const top = Math.max.apply(null, waarden);
    const bodem = 0;                       // altijd vanaf nul: anders vergroot de grafiek ruis tot een berg
    const schaal = top > bodem ? top : 1;
    const punten = waarden.map(function (v, i) {
      const x = PAD + (W - 2 * PAD) * (r.length === 1 ? 0 : i / (r.length - 1));
      const y = H - PAD - (H - 2 * PAD) * (v / schaal);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const laatste = waarden[waarden.length - 1];
    const spanSec = Math.round((r[r.length - 1].t - r[0].t) / 1000);

    return '<div style="margin-bottom:9px">' +
      '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px">' +
        '<span style="font:700 11px var(--f);color:var(--tx2)">' + titel + '</span>' +
        '<span style="font:800 13px var(--m);color:' + kleur + '">' + laatste + '</span>' +
        '<span style="font:400 10px var(--f);color:var(--tx3)">' + eenheid + '</span>' +
        '<span style="margin-left:auto;font:400 10px var(--f);color:var(--tx3)">piek ' + top + ' · ' + spanSec + ' s</span>' +
      '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
           'aria-label="' + titel + ', laatste waarde ' + laatste + ' ' + eenheid + ', piek ' + top + '" ' +
           'style="width:100%;height:54px;display:block;background:var(--sur);border:1px solid var(--bd);border-radius:8px">' +
        '<line x1="0" y1="' + (H - PAD) + '" x2="' + W + '" y2="' + (H - PAD) + '" stroke="var(--bd2)" stroke-width="1"/>' +
        '<polyline points="' + punten + '" fill="none" stroke="' + kleur + '" stroke-width="2" ' +
                  'stroke-linejoin="round" stroke-linecap="round"/>' +
      '</svg>' +
    '</div>';
  }

  // ══════════════════════════════════════════════════════════════════
  // HET PANEEL
  // ══════════════════════════════════════════════════════════════════
  function _tegel(label, waarde, bij, kleur) {
    return '<div style="flex:1 1 30%;min-width:88px;background:var(--sur);border:1px solid var(--bd);' +
             'border-radius:9px;padding:8px 9px">' +
             '<div style="font:800 15px var(--m);color:' + (kleur || 'var(--tx)') + ';line-height:1.1">' + waarde + '</div>' +
             '<div style="font:600 10px var(--f);color:var(--tx3);margin-top:2px">' + label + '</div>' +
             (bij ? '<div style="font:400 10px var(--f);color:var(--tx3)">' + bij + '</div>' : '') +
           '</div>';
  }

  function _kleurBij(waarde, letOp, slecht) {
    if (waarde >= slecht) return 'var(--rd)';
    if (waarde >= letOp) return 'var(--or)';
    return 'var(--tx)';
  }

  function _tijd(ms) {
    try { return new Date(ms).toTimeString().slice(0, 8); } catch (e) { return '--:--:--'; }
  }

  function _kopBlok() {
    const s = _stats();
    let echoRegel = '';
    if (s && s.echoTot > 0) {
      echoRegel = '<div style="margin-top:8px;background:var(--ors);border:1px solid var(--or);border-radius:9px;padding:9px 10px">' +
        '<div style="font:800 11px var(--f);color:var(--or)">⚠ Deze adapter herhaalt frames</div>' +
        '<div style="font:400 11px var(--f);color:var(--tx2);margin-top:2px">' +
          s.echoTot + ' keer sinds ' + _tijd(s.echoSinds) + ' (' + s.echoPct + '% van de verzoeken). ' +
          'De parser stopt bij het tweede bericht, dus de laatste sensor van zo’n batch ontbreekt dan — ' +
          'dat is een gat in de meting en geen defect aan de auto.' +
        '</div></div>';
    }
    // Twee keer "onbekend" naast elkaar zegt minder dan één keer. Weet de app
    // het protocol niet, dan blijft de rechterkant leeg in plaats van het
    // woord te herhalen dat links al staat.
    const proto = protocol();
    return '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:10px 11px">' +
      '<div style="display:flex;gap:8px;align-items:baseline">' +
        '<span style="font:800 13px var(--f);color:var(--tx)">' + adapterNaam() + '</span>' +
        (proto === 'onbekend' ? '' :
          '<span style="margin-left:auto;font:600 10px var(--f);color:var(--tx3)">' + proto + '</span>') +
      '</div>' +
      '<div style="font:400 11px var(--m);color:var(--tx3);margin-top:3px">' +
        (_ati === null ? 'ATI wordt opgevraagd…' : _ati) + '</div>' +
      echoRegel +
    '</div>';
  }

  function _nuBlok() {
    const s = _stats(), l = _load();
    if (!s) return '<div style="font:600 12px var(--f);color:var(--tx3);padding:10px 0">Geen busstatistiek — is er verbinding?</div>';
    let groep = 3, vast = false;
    try { groep = PLBus.batchGroep(); vast = PLBus.batchVast(); } catch (e) { console.warn('PLBus.batchGroep/batchVast mislukt:', e); }
    return '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      _tegel('verzoeken/s', s.perSec, 'laatste 10 s') +
      _tegel('responstijd', s.venGemMs, 'ms in dat venster', _kleurBij(s.venGemMs, 400, 800)) +
      _tegel('bus bezet', s.belasting + '%', 'van de tijd', _kleurBij(s.belasting, 85, 97)) +
      _tegel('fout', s.foutPct + '%', 'leeg of NO DATA', _kleurBij(s.foutPct, 10, 40)) +
      _tegel('onvolledig', s.onvolPct + '%', 'batch mist een PID', _kleurBij(s.onvolPct, 8, 40)) +
      _tegel('herhaald', s.echoTot, 'tweede bericht', s.echoTot ? 'var(--or)' : 'var(--tx)') +
      _tegel('tempo', (l ? l.tempoPct : '?') + '%', l && l.handmatig ? 'met de hand' : 'automaat') +
      _tegel('groep', groep + ' PID' + (groep === 1 ? '' : 's'), vast ? 'vastgezet' : 'per verzoek') +
      _tegel('staat', l ? l.label : '?', l ? l.uitleg : '') +
    '</div>';
  }

  function _regelingBlok() {
    const l = _load();
    const hand = !!(l && l.handmatig);
    const knop = function (aan, tekst) {
      return '<button onclick="PLAdapter.zetModus(' + (aan ? 'true' : 'false') + ')" ' +
        'style="flex:1;border-radius:8px;padding:9px 6px;font:800 12px var(--f);cursor:pointer;border:1px solid ' +
        ((hand === aan) ? 'var(--bl);background:var(--blv);color:#fff' : 'var(--bd);background:var(--sur);color:var(--tx2)') +
        '">' + tekst + '</button>';
    };
    let stuur = '';
    if (hand) {
      const nu = l ? l.tempoPct : 100;
      const stappen = [17, 25, 33, 50, 70, 100];
      stuur = '<div style="margin-top:9px">' +
        '<div style="font:700 10px var(--f);color:var(--tx3);margin-bottom:4px">TEMPO — hoe vaak de sensoren gevraagd worden</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
          stappen.map(function (p) {
            const aan = Math.abs(p - nu) < 4;
            // 13px boven en onder, niet 8. Gemeten in Chromium op 360px breed:
            // met 8px werden deze knoppen 31px hoog, en dat is te klein voor
            // een duim in een rijdende auto. Nu 41px.
            return '<button onclick="PLAdapter.zetTempo(' + p + ')" style="flex:1;min-width:44px;border-radius:7px;' +
              'padding:13px 4px;font:800 11px var(--m);cursor:pointer;border:1px solid ' +
              (aan ? 'var(--bl);background:var(--blv);color:#fff' : 'var(--bd);background:var(--sur);color:var(--tx2)') +
              '">' + p + '%</button>';
          }).join('') +
        '</div>' +
        '<div style="font:700 10px var(--f);color:var(--tx3);margin:9px 0 4px">PIDS PER VERZOEK — kleiner past vaker in één CAN-frame</div>' +
        '<div style="display:flex;gap:4px">' +
          [1, 2, 3].map(function (g) {
            let nuG = 3; try { nuG = PLBus.batchGroep(); } catch (e) { console.warn('PLBus.batchGroep mislukt:', e); }
            const aan = nuG === g;
            return '<button onclick="PLAdapter.zetGroep(' + g + ')" style="flex:1;border-radius:7px;padding:13px 4px;' +
              'font:800 11px var(--m);cursor:pointer;border:1px solid ' +
              (aan ? 'var(--bl);background:var(--blv);color:#fff' : 'var(--bd);background:var(--sur);color:var(--tx2)') +
              '">' + g + '</button>';
          }).join('') +
        '</div>' +
        '<div style="font:400 10px var(--f);color:var(--tx3);margin-top:6px">' +
          'De automaat meet ondertussen door — je ziet hierboven wat hij van de bus vindt, ' +
          'hij grijpt alleen niet in.</div>' +
      '</div>';
    } else {
      stuur = '<div style="font:400 11px var(--f);color:var(--tx3);margin-top:7px">' +
        'De automaat regelt het tempo op bezetting, foutgraad en responstijd, en verkleint de groep ' +
        'als de adapter frames herhaalt. Wat hij deed en waarom staat hieronder.</div>';
    }
    return '<div style="margin-top:12px">' +
      '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:6px">WIE REGELT HET TEMPO</div>' +
      '<div style="display:flex;gap:5px">' + knop(false, '🤖 Automaat') + knop(true, '✋ Handmatig') + '</div>' +
      stuur +
    '</div>';
  }

  function _meetBlok() {
    if (_meetBezig) {
      return '<div style="margin-top:12px;background:var(--bls);border:1px solid var(--bl);border-radius:9px;padding:11px">' +
        '<div style="font:800 12px var(--f);color:var(--bl)">⏱ Snelheidstest loopt — ' + _meetStand + '</div>' +
        '<div style="font:400 11px var(--f);color:var(--tx2);margin-top:2px">Ongeveer 40 seconden. Laat de app open staan.</div>' +
      '</div>';
    }
    let uitslag = '';
    if (_meting) {
      const a = _meting.advies;
      uitslag = '<div style="margin-top:8px;background:var(--sur);border:1px solid var(--bd);border-radius:9px;padding:10px">' +
        '<div style="font:800 12px var(--f);color:var(--tx)">' + a.kop + '</div>' +
        '<div style="font:400 11px var(--f);color:var(--tx2);margin-top:3px">' + a.reden + '</div>' +
        (a.tempoPct ? '<button onclick="PLAdapter.neemAdviesOver()" style="margin-top:8px;width:100%;border:0;' +
          'background:var(--blv);color:#fff;border-radius:8px;padding:9px;font:800 12px var(--f);cursor:pointer">' +
          'Zet het tempo op ' + a.tempoPct + '% (handmatig)</button>' : '') +
        (a.groep ? '<button onclick="PLAdapter.zetGroep(' + a.groep + ')" style="margin-top:8px;width:100%;border:0;' +
          'background:var(--blv);color:#fff;border-radius:8px;padding:9px;font:800 12px var(--f);cursor:pointer">' +
          'Zet ' + a.groep + ' PIDs per verzoek</button>' : '') +
        '<table style="width:100%;margin-top:9px;border-collapse:collapse;font:600 10px var(--m);color:var(--tx2)">' +
          '<tr style="color:var(--tx3)"><td>trap</td><td>/s</td><td>ms</td><td>solo</td><td>batch</td><td>echo</td></tr>' +
          _meting.stappen.map(function (x) {
            return '<tr><td style="color:var(--tx3)">' + x.naam + '</td><td>' + x.perSec + '</td><td>' + x.medMs + '</td>' +
              '<td style="color:' + (x.soloMisPct ? 'var(--or)' : 'var(--tx2)') + '">' + x.soloMisPct + '%</td>' +
              '<td style="color:' + (x.batchOnvolPct > 5 ? 'var(--or)' : 'var(--tx2)') + '">' + x.batchOnvolPct + '%</td>' +
              '<td style="color:' + (x.echo ? 'var(--or)' : 'var(--tx2)') + '">' + x.echo + '</td></tr>';
          }).join('') +
        '</table>' +
        '<div style="font:400 10px var(--f);color:var(--tx3);margin-top:5px">' +
          'solo = één PID per verzoek · batch = ' + _meting.groep + ' PIDs per verzoek, onvolledig teruggekomen · ' +
          'gemeten om ' + _tijd(_meting.t) + '</div>' +
      '</div>';
    }
    return '<div style="margin-top:12px">' +
      '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:6px">SNELHEIDSTEST</div>' +
      '<button onclick="PLAdapter.meet()" style="width:100%;border:1px solid var(--bd);background:var(--sur);' +
        'color:var(--tx);border-radius:9px;padding:11px;font:800 12px var(--f);cursor:pointer">' +
        '⏱ Meet wat deze verbinding aankan (40 s)</button>' +
      uitslag +
    '</div>';
  }

  function _actieBlok() {
    let acties = [];
    try { if (window.PLLoad && typeof PLLoad.acties === 'function') acties = PLLoad.acties(); }
    catch (e) { console.warn('PLLoad.acties mislukt — het paneel toont dan geen automaatstappen', e); }
    const rijen = acties.slice(-12).reverse().map(function (a) {
      const omhoog = a.naar > a.van;
      const kleur = a.wat === 'groep' ? 'var(--pu)' : (a.van === a.naar ? 'var(--tx3)' : (omhoog ? 'var(--gn)' : 'var(--or)'));
      const stap = a.wat === 'groep' ? (a.van + ' → ' + a.naar + ' PIDs')
                 : (a.van === a.naar ? a.van + '%' : a.van + '% → ' + a.naar + '%');
      return '<div style="display:flex;gap:7px;padding:6px 0;border-top:1px solid var(--bd)">' +
        '<span style="font:600 10px var(--m);color:var(--tx3);flex-shrink:0;width:52px">' + _tijd(a.t) + '</span>' +
        '<span style="font:800 10px var(--m);color:' + kleur + ';flex-shrink:0;width:76px">' + stap + '</span>' +
        '<span style="font:400 10px var(--f);color:var(--tx2);flex:1;min-width:0">' + a.reden + '</span>' +
      '</div>';
    }).join('');
    return '<div style="margin-top:12px">' +
      '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:2px">WAT DE AUTOMAAT DEED, EN WAAROM</div>' +
      (rijen || '<div style="font:400 11px var(--f);color:var(--tx3);padding:6px 0">nog niets — de automaat heeft het tempo niet hoeven verzetten</div>') +
    '</div>';
  }

  function _foutBlok() {
    let regels = [];
    try {
      if (typeof _btLog !== 'undefined' && _btLog) {
        regels = _btLog.filter(function (r) { return r && (r.type === 'warn' || r.type === 'err'); }).slice(-10).reverse();
      }
    } catch (e) { console.warn('_btLog niet leesbaar — het paneel toont dan geen foutregels', e); }
    if (!regels.length) {
      return '<div style="margin-top:12px">' +
        '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px">FOUTEN EN WAARSCHUWINGEN</div>' +
        '<div style="font:400 11px var(--f);color:var(--tx3);padding:6px 0">geen — het verbindingslog is schoon</div></div>';
    }
    return '<div style="margin-top:12px">' +
      '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:2px">FOUTEN EN WAARSCHUWINGEN</div>' +
      regels.map(function (r) {
        return '<div style="display:flex;gap:7px;padding:6px 0;border-top:1px solid var(--bd)">' +
          '<span style="font:600 10px var(--m);color:var(--tx3);flex-shrink:0;width:52px">' + r.ts + '</span>' +
          '<span style="font:400 10px var(--f);color:' + (r.type === 'err' ? 'var(--rd)' : 'var(--or)') + ';flex:1;min-width:0;word-break:break-word">' +
            String(r.msg).slice(0, 160) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function _teken() {
    if (!_open) return;
    const box = document.getElementById('plAdapterBody');
    if (!box) return;
    box.innerHTML =
      _kopBlok() +
      '<div style="margin-top:10px">' + _nuBlok() + '</div>' +
      '<div style="margin-top:12px">' +
        _driftBlok() +
        '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:6px">VERLOOP</div>' +
        _grafiek('perSec', 'Verzoeken per seconde', '/s', 'var(--bl)') +
        _grafiek('venMs', 'Responstijd', 'ms', 'var(--bl)') +
      '</div>' +
      _regelingBlok() +
      _meetBlok() +
      _actieBlok() +
      _foutBlok() +
      '<div style="margin-top:14px;display:flex;gap:6px">' +
        '<button onclick="PLAdapter.reset()" style="flex:1;border:1px solid var(--bd);background:var(--sur);' +
          'color:var(--tx2);border-radius:8px;padding:10px;font:700 11px var(--f);cursor:pointer">↺ Reset meting</button>' +
        '<button onclick="PLAdapter.herverbind()" style="flex:1;border:1px solid var(--bl);background:var(--bls);' +
          'color:var(--bl);border-radius:8px;padding:10px;font:700 11px var(--f);cursor:pointer">🔄 Opnieuw verbinden</button>' +
        '<button onclick="PLAdapter.verbreek()" style="flex:1;border:1px solid var(--rd);background:var(--rds);' +
          'color:var(--rd);border-radius:8px;padding:10px;font:700 11px var(--f);cursor:pointer">Verbreken</button>' +
      '</div>';
  }

  function _melding(t) {
    try { if (typeof showToast === 'function') { showToast(t); return; } } catch (e) { /* stil: toast is niet altijd geladen */ }
    try { if (typeof log === 'function') log(t, 'warn'); } catch (e) { console.warn(t); }
  }

  function open() {
    let ov = document.getElementById('plAdapterOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'plAdapterOv';
      // Onderrand mét de knoppenbalk erbij (#144): dit paneel scrollt, en de
      // laatste knoppen mogen niet achter de drie Android-knoppen eindigen.
      ov.style.cssText = 'position:fixed;inset:0;z-index:9976;background:rgba(8,11,17,.92);' +
        'display:flex;align-items:flex-start;justify-content:center;' +
        'padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto';
      ov.innerHTML =
        '<div style="background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;' +
             'max-width:460px;width:100%;margin-top:34px">' +
          '<div style="display:flex;align-items:center;gap:9px;margin-bottom:3px">' +
            '<div style="font:800 15px var(--f);color:var(--tx)">🔌 De verbinding</div>' +
            '<button onclick="PLAdapter.sluit()" style="margin-left:auto;background:var(--sur);color:var(--tx2);' +
              'border:1px solid var(--bd);border-radius:8px;padding:6px 13px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
          '</div>' +
          '<div style="font:400 11px var(--f);color:var(--tx3);margin-bottom:11px">' +
            'Wat de adapter doet, wie het tempo bepaalt, en waarom.</div>' +
          '<div id="plAdapterBody"></div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.style.display = 'flex';
    _open = true;
    monster();
    _teken();
    // ATI pas ná het tekenen: het paneel staat er dan al, en de regel vult
    // zichzelf aan zodra het antwoord binnen is.
    vraagAti();
    if (!_tekenT) _tekenT = setInterval(function () { try { _teken(); } catch (e) { console.warn('Adapterpaneel tekenen mislukt:', e); } }, 2000);
  }

  function sluit() {
    const ov = document.getElementById('plAdapterOv');
    if (ov) ov.style.display = 'none';
    _open = false;
    if (_tekenT) { clearInterval(_tekenT); _tekenT = null; }
  }

  // ── knoppen ───────────────────────────────────────────────────────
  function zetModus(hand) {
    try {
      if (!window.PLLoad || typeof PLLoad.handmatig !== 'function') { _melding('PLLoad kent de handmatige stand niet'); return; }
      PLLoad.handmatig(!!hand, hand ? 'via het adapterpaneel overgenomen' : 'via het adapterpaneel teruggegeven');
      // De groep hoort bij de stand: in de automaat mag de regelkring er weer
      // aan komen. Anders blijft een handmatige keuze hangen in een stand die
      // "automaat" heet, en dat is precies de dubbele betekenis die hier al
      // drie keer een bug is geweest.
      if (!hand && window.PLBus && typeof PLBus.batchZet === 'function' && PLBus.batchVast()) {
        PLBus.batchZet(PLBus.batchGroep(), false);
      }
    } catch (e) { _melding('Modus wisselen mislukt: ' + ((e && e.message) || e)); }
    _teken();
  }

  function zetTempo(pct) {
    try {
      if (!window.PLLoad || typeof PLLoad.zetTempo !== 'function') { _melding('PLLoad kent zetTempo() niet'); return; }
      if (!PLLoad.isHandmatig()) PLLoad.handmatig(true, 'tempo met de hand gezet');
      PLLoad.zetTempo(pct);
    } catch (e) { _melding('Tempo zetten mislukt: ' + ((e && e.message) || e)); }
    _teken();
  }

  /* De groep vastzetten IS het overnemen van de regeling, dus dat zet ook de
     stand op handmatig. Zonder die koppeling zou het paneel "Automaat" tonen
     boven een groep waar de automaat niet meer aan mag komen — één ding met
     twee betekenissen, en dat is hier al drie keer een bug geweest. */
  function zetGroep(n) {
    try {
      if (!window.PLBus || typeof PLBus.batchZet !== 'function') { _melding('PLBus kent batchZet() niet'); return; }
      let van = 3;
      try { van = PLBus.batchGroep(); } catch (e) { console.warn('PLBus.batchGroep mislukt:', e); }
      if (window.PLLoad && typeof PLLoad.isHandmatig === 'function' && !PLLoad.isHandmatig()) {
        PLLoad.handmatig(true, 'groepsgrootte met de hand gezet');
      }
      PLBus.batchZet(n, true);
      if (window.PLLoad && typeof PLLoad.boekActie === 'function') {
        PLLoad.boekActie('groep', van, n, 'met de hand gezet via het adapterpaneel');
      }
    } catch (e) { _melding('Groepsgrootte zetten mislukt: ' + ((e && e.message) || e)); }
    _teken();
  }

  function neemAdviesOver() {
    if (!_meting || !_meting.advies || !_meting.advies.tempoPct) { _melding('Er is geen tempo-advies om over te nemen'); return; }
    zetTempo(_meting.advies.tempoPct);
  }

  /* Reset wist de MÉTING, niet de verbinding: de busstatistiek, de
     geschiedenis, het actielogboek en de testuitslag. De regelkring gaat terug
     naar automaat, want een handmatige stand die een reset overleeft is een
     stand waarvan je niet meer weet dat hij aan staat. */
  function reset() {
    try { if (window.PLBus && typeof PLBus.resetStats === 'function') PLBus.resetStats(); }
    catch (e) { console.warn('PLBus.resetStats mislukt:', e); }
    try {
      if (window.PLLoad) {
        if (typeof PLLoad.handmatig === 'function') PLLoad.handmatig(false, 'reset via het adapterpaneel');
        if (typeof PLLoad.wisActies === 'function') PLLoad.wisActies();
        if (typeof PLLoad.reset === 'function') PLLoad.reset();
      }
    } catch (e) { console.warn('PLLoad resetten mislukt:', e); }
    try { if (window.PLBus && typeof PLBus.batchZet === 'function') PLBus.batchZet(3, false); }
    catch (e) { console.warn('PLBus.batchZet mislukt:', e); }
    _hist.length = 0; _meting = null; _ati = null;
    try { if (typeof btDiag === 'function') btDiag('Adapterpaneel: meting en regeling teruggezet', 'ok'); }
    catch (e) { console.warn('Resetmelding kwam niet in het BT-log:', e); }
    vraagAti();
    _teken();
  }

  /* ── OPNIEUW VERBINDEN (26-09-2026) ─────────────────────────────────
     Gemeten op de rit van 26-09 met een OBDLink MX+ op een CX-5: in de loop
     van een sessie liep de responstijd in stappen op van ~150 naar 270 ms,
     en de verzoeken per seconde zakten mee naar 3,6. Fout, onvolledig en
     herhaald stonden alle drie op nul, de automaat op 93%: de app remde niet,
     de adapter werd per antwoord trager. Na verbreken en opnieuw verbinden:
     77 ms en 10,9/s, met dezelfde 26 PIDs.

     Waaróm de adapter vertraagt is nog niet bekend. Tot dat bekend is, is
     dit de uitweg die werkt — zonder de app te sluiten, en zonder de
     eerste-keer-flow: dit loopt via de hervatstand (#229), die de vorige
     adapter, het voertuig en de sensorselectie overneemt. Een gewone
     herverbinding met de knop Verbinden zette de standaardset van 26 PIDs
     terug, ook als je er zelf 18 had gekozen. */
  let _herverbindBezig = false;
  async function herverbind() {
    if (_herverbindBezig) return false;
    const demo = (function () { try { return typeof demoMode !== 'undefined' && demoMode; } catch (e) { return false; } })();
    if (demo) { _melding('In de demo is er geen adapter om opnieuw mee te verbinden'); return false; }
    if (!_verbonden()) { _melding('Niet verbonden — tik op Verbinden'); return false; }
    if (typeof handleConnect !== 'function' || typeof connectSerial !== 'function') {
      _melding('Opnieuw verbinden kan hier niet: de verbindingsmodule ontbreekt'); return false;
    }
    _herverbindBezig = true;
    const voor = _hist.length ? _hist[_hist.length - 1] : null;
    // De selectie van NU bewaren, ook als hij na de laatste wijziging niet
    // meer weggeschreven is. De hervatstand leest hem terug.
    try {
      if (typeof activePIDs !== 'undefined' && activePIDs && activePIDs.size)
        localStorage.setItem('pl_selectie', JSON.stringify({ pids: [...activePIDs], t: Date.now() }));
    } catch (e) { console.warn('Opnieuw verbinden: selectie niet bewaard — na het verbinden kan de standaardset terugkomen', e); }
    sluit();
    _melding('🔄 Verbinding opnieuw opzetten…');
    try {
      await handleConnect();
      await new Promise(function (r) { setTimeout(r, 1200); });   // de adapter laat de socket los
      await connectSerial({ hervat: 'opnieuw verbinden (knop)' });
    } catch (e) {
      _melding('Opnieuw verbinden mislukt: ' + ((e && e.message) || e) + ' — tik op Verbinden');
      _herverbindBezig = false;
      return false;
    }
    // De hervatstand loopt na connectSerial() nog even door (kenteken, VIN,
    // selectie terugzetten). Wachten tot er weer een verbinding staat.
    for (let i = 0; i < 90 && !_verbonden(); i++) await new Promise(function (r) { setTimeout(r, 500); });
    _herverbindBezig = false;
    const ok = _verbonden();
    if (ok) {
      reset();   // een schone grafiek: vergelijken met de oude verbinding helpt niet
      let n = 0;
      try { n = (typeof activePIDs !== 'undefined' && activePIDs) ? activePIDs.size : 0; } catch (e) { console.warn(e); }
      _melding('✅ Opnieuw verbonden — ' + n + ' sensoren' + (voor ? ' (was ' + voor.perSec + '/s bij ' + Math.round(voor.venMs) + ' ms)' : ''));
      try { if (typeof btDiag === 'function') btDiag('Opnieuw verbonden via de knop' + (voor ? ' — daarvoor ' + voor.perSec + '/s, ' + Math.round(voor.venMs) + ' ms' : ''), 'ok'); }
      catch (e) { console.warn('Melding kwam niet in het BT-log:', e); }
    } else {
      _melding('Opnieuw verbinden lukte niet — tik op Verbinden');
    }
    return ok;
  }

  /* Loopt de responstijd op tegenover het beste stuk van deze sessie? Dan
     staat er een aanwijzing boven de grafiek. 1,6 keer de laagste gemeten
     waarde (op 26-09 was het 150 → 272 ms, 1,8×), en minstens 150 ms: onder
     die grens is er niets te winnen. */
  function drift(hist) {
    const h = (hist || _hist).filter(function (m) { return m.perSec > 0 && m.venMs > 0; });
    if (h.length < 10) return null;
    let min = Infinity;
    h.forEach(function (m) { if (m.venMs < min) min = m.venMs; });
    const nu = h.slice(-3).reduce(function (a, m) { return a + m.venMs; }, 0) / 3;
    if (nu >= 150 && nu >= min * 1.6) return { van: Math.round(min), naar: Math.round(nu) };
    return null;
  }
  function _driftBlok() {
    const d = drift();
    if (!d) return '';
    return '<div id="plAdDrift" style="margin:0 0 12px;padding:10px 12px;border:1px solid var(--or);background:var(--ors);' +
      'border-radius:10px;font:600 12px/1.45 var(--f);color:var(--tx)">' +
      'De responstijd is opgelopen van ' + d.van + ' naar ' + d.naar + ' ms. Opnieuw verbinden zet dat meestal terug.' +
      '<button onclick="PLAdapter.herverbind()" style="display:block;width:100%;margin-top:8px;border:1px solid var(--bl);' +
      'background:var(--bl);color:#fff;border-radius:8px;padding:10px;font:700 12px var(--f);cursor:pointer">🔄 Opnieuw verbinden</button></div>';
  }

  function verbreek() {
    const demo = (function () { try { return typeof demoMode !== 'undefined' && demoMode; } catch (e) { return false; } })();
    if (!window.confirm(demo ? 'Demo modus stoppen?' : 'OBD-verbinding verbreken?')) return;
    sluit();
    try { if (typeof handleConnect === 'function') handleConnect(); }
    catch (e) { _melding('Verbreken mislukt: ' + ((e && e.message) || e)); }
  }

  // ── de sampler ────────────────────────────────────────────────────
  // Draait altijd, ook met het paneel dicht: anders begint de grafiek leeg op
  // het moment dat je hem wilt zien, en dat is precies het moment waarop je
  // wilt weten wat er de afgelopen minuten gebeurde.
  function start() {
    if (_sampler) return;
    _sampler = setInterval(function () {
      try { if (_verbonden()) monster(); } catch (e) { console.warn('Adaptermonster mislukt:', e); }
    }, HIST_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PLAdapter = {
    open: open,
    sluit: sluit,
    teken: _teken,
    meet: meet,
    advies: advies,
    laatsteMeting: laatsteMeting,
    historie: historie,
    monster: monster,
    zetModus: zetModus,
    zetTempo: zetTempo,
    zetGroep: zetGroep,
    neemAdviesOver: neemAdviesOver,
    reset: reset,
    verbreek: verbreek,
    herverbind: herverbind,
    drift: drift,
    adapterNaam: adapterNaam,
    protocol: protocol,
    ati: function () { return _ati; },
    versie: ADAPTER_VERSIE
  };
  window.openAdapterPaneel = open;

  try { if (typeof btDiag === 'function') btDiag('pidlane-adapter.js geladen — ' + ADAPTER_VERSIE, 'info'); }
  catch (e) { /* stil: melding mag nooit de stroom breken */ }
})();
