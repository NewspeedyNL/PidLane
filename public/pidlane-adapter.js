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

  /* ── SESSIEBEWIJS (#302, 27-09-2026) ─────────────────────────────────
     _hist bewaart twaalf minuten en wordt bij opnieuw verbinden gewist. Voor
     #302 is dat precies te kort: de vraag is of de responstijd over een half
     uur oploopt, in stappen of geleidelijk, bij welke gebeurtenis, en of een
     nieuwe verbinding hem terugzet. Daarom een tweede, grove reeks: elke 30 s
     één monster met de context erbij (weergave, aantal sensoren, lopende
     modules, koelwater, verbindingsnummer), tot acht uur lang. driftAnalyse()
     maakt er een oordeel van; de blok-5-proef leest dat aan het eind van de rit. */
  const SESSIE_MS = 30000, SESSIE_MAX = 960;
  const _sessie = [], _gebeurt = [];
  let _verbNr = 0, _wasVerbonden = false, _sessieT = 0;
  function _echt() {
    try { return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); }
    catch (e) { return false; }
  }
  function _context() {
    const c = { pids: 0, weergave: '', modules: [], koel: null };
    try { c.pids = (typeof activePIDs !== 'undefined' && activePIDs) ? activePIDs.size : 0; } catch (e) { console.warn('adapter-sessie: selectie onleesbaar', e); }
    try { c.weergave = (typeof pidViewMode !== 'undefined') ? String(pidViewMode) : ''; } catch (e) { console.warn('adapter-sessie: weergave onleesbaar', e); }
    try {
      const r = (window.PLRun && typeof PLRun.staat === 'function') ? (PLRun.staat() || {}) : {};
      c.modules = Object.keys(r).filter(function (k) { return r[k] && r[k].aan; }).sort();
    } catch (e) { console.warn('adapter-sessie: lopende modules onleesbaar', e); }
    try { const k = (typeof pidVals !== 'undefined') ? pidVals['0105'] : undefined; c.koel = typeof k === 'number' ? Math.round(k) : null; }
    catch (e) { console.warn('adapter-sessie: koelwater onleesbaar', e); }
    // De SPP-proef (#352) kan een draad achterlaten die de rest van de sessie
    // trager maakt. Dat is geen eigenschap van de auto of de adapter, en het
    // oordeel over #302 hoort het te weten.
    try { c.proef = !!(window.PLSppProef && typeof PLSppProef.aangetast === 'function' && PLSppProef.aangetast()); }
    catch (e) { console.warn('adapter-sessie: SPP-proefmarkering onleesbaar', e); c.proef = false; }
    return c;
  }
  function _sessieTik() {
    const nu = Date.now(), echt = _echt();
    if (echt && !_wasVerbonden) { _verbNr++; _gebeurt.push({ t: nu, soort: 'verbonden', nr: _verbNr }); }
    if (!echt && _wasVerbonden) _gebeurt.push({ t: nu, soort: 'verbroken', nr: _verbNr });
    _wasVerbonden = echt;
    if (!echt || nu - _sessieT < SESSIE_MS) return;
    const s = _stats();
    if (!s || !(s.perSec > 0) || !(s.venGemMs > 0)) return;
    _sessieT = nu;
    _sessie.push(Object.assign({ t: nu, nr: _verbNr, ms: Math.round(s.venGemMs), rps: Math.round((s.perSec || 0) * 10) / 10, bezet: s.belasting || 0 }, _context()));
    if (_sessie.length > SESSIE_MAX) _sessie.shift();
  }
  function _sesMediaan(a) {
    const b = a.slice().sort(function (x, y) { return x - y; });
    if (!b.length) return null;
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  /* Puur: de sessiereeks → per verbinding begin, eind, factor en de stappen
     met wat er rond elke stap veranderde; en tussen twee verbindingen wat de
     nieuwe verbinding deed. test-adaptersessie.js toetst hem los. */
  /* Het oordeel voor blok 5 (#302), puur. Kijkt naar de langste verbinding:
     korter dan `minMin` minuten is geen uitspraak; onder ×1,3 is de drift er
     deze rit niet; daarboven een bevinding met het patroon erbij. */
  function driftOordeel(a, minMin) {
    minMin = minMin || 25;
    const g = (a && a.groepen || []).slice().sort(function (x, y) { return y.minuten - x.minuten; })[0];
    if (!g || g.minuten < minMin)
      return { staat: 'LET OP', drift: false, detail: 'langste onafgebroken verbinding ' + (g ? g.minuten : 0) + ' min; nodig: ' + minMin + ' min zonder verbreken' };
    const kop = g.minuten + ' min verbonden: responstijd ' + g.begin + ' → ' + g.eind + ' ms (×' + String(g.factor).replace('.', ',') + ')';
    if (!(g.factor >= 1.3)) return { staat: 'ok', drift: false, groep: g, detail: kop + ' — de drift van #302 trad deze rit niet op' };
    // Een oploop op een verbinding die de SPP-proef (#352) met opzet aantastte,
    // is de proef en niet #302. Geen FOUT dus, en geen uitspraak.
    if (g.proef) return { staat: 'LET OP', drift: false, groep: g, detail: kop + ' — maar de SPP-proef (#352) tastte deze verbinding aan; geen uitspraak over #302' };
    const patroon = g.stappen.length
      ? 'stapsgewijs: ' + g.stappen.map(function (s) { return 'min ' + s.minuut + ' ' + s.van + '→' + s.naar + ' ms' + (s.wat.length ? ' bij ' + s.wat.join(', ') : ' zonder gebeurtenis'); }).join('; ')
      : 'geleidelijk, zonder stap';
    const h = (a.herstel || []).filter(function (x) { return x.nr === g.nr + 1; })[0];
    return { staat: 'FOUT', drift: true, groep: g, detail: kop + ' — ' + patroon +
      (h && h.van && h.naar ? '. Opnieuw verbinden' + (h.knop ? ' (knop)' : '') + ': ' + Math.round(h.van) + ' → ' + Math.round(h.naar) + ' ms' : '') };
  }

  function driftAnalyse(sessie, gebeurt) {
    const groepen = [];
    (sessie || []).forEach(function (m) {
      let g = groepen[groepen.length - 1];
      if (!g || g.nr !== m.nr) { g = { nr: m.nr, monsters: [] }; groepen.push(g); }
      g.monsters.push(m);
    });
    groepen.forEach(function (g) {
      const ms = g.monsters, t0 = ms[0].t, t1 = ms[ms.length - 1].t;
      g.van = t0; g.tot = t1; g.minuten = Math.round((t1 - t0) / 60000);
      g.proef = ms.some(function (m) { return !!m.proef; });
      const eerste = ms.filter(function (m) { return m.t - t0 <= 5 * 60000; }).map(function (m) { return m.ms; });
      const laatste = ms.filter(function (m) { return t1 - m.t <= 5 * 60000; }).map(function (m) { return m.ms; });
      g.begin = _sesMediaan(eerste); g.eind = _sesMediaan(laatste);
      g.factor = (g.begin && g.eind) ? Math.round(g.eind / g.begin * 100) / 100 : null;
      g.stappen = [];
      for (let i = 4; i + 4 <= ms.length; i++) {
        const voor = _sesMediaan(ms.slice(i - 4, i).map(function (m) { return m.ms; }));
        const na = _sesMediaan(ms.slice(i, i + 4).map(function (m) { return m.ms; }));
        if (!(voor > 0) || na / voor < 1.25 || na - voor < 30) continue;
        // De medianen zien de stap al een paar monsters vóór hij er is. De
        // gebeurtenis hoort bij de werkelijke sprong: het grootste verschil
        // tussen twee opeenvolgende monsters binnen dit venster.
        let k = i;
        for (let j = i - 3; j <= i + 3; j++) if (j > 0 && j < ms.length && ms[j].ms - ms[j - 1].ms > ms[k].ms - ms[k - 1].ms) k = j;
        const a = ms[k - 1], b = ms[k], wat = [];
        if (a.weergave !== b.weergave) wat.push('weergave ' + a.weergave + ' → ' + b.weergave);
        if (a.pids !== b.pids) wat.push('sensoren ' + a.pids + ' → ' + b.pids);
        const bij = b.modules.filter(function (x) { return a.modules.indexOf(x) < 0; });
        const af = a.modules.filter(function (x) { return b.modules.indexOf(x) < 0; });
        if (bij.length) wat.push('gestart: ' + bij.join(', '));
        if (af.length) wat.push('gestopt: ' + af.join(', '));
        if (typeof a.koel === 'number' && typeof b.koel === 'number' && a.koel < 80 && b.koel >= 80) wat.push('motor warm (koelwater ' + b.koel + ' °C)');
        if (b.proef && !a.proef) wat.push('SPP-proef (#352)');
        const vorige = g.stappen[g.stappen.length - 1];
        if (vorige && b.t - vorige.t < 3 * 60000) continue;       // dezelfde stap, een monster later
        g.stappen.push({ t: b.t, minuut: Math.round((b.t - t0) / 60000), van: Math.round(voor), naar: Math.round(na), wat: wat });
      }
    });
    const herstel = [];
    for (let i = 1; i < groepen.length; i++) {
      const a = groepen[i - 1], b = groepen[i];
      const voor = _sesMediaan(a.monsters.filter(function (m) { return a.tot - m.t <= 3 * 60000; }).map(function (m) { return m.ms; }));
      const na = _sesMediaan(b.monsters.filter(function (m) { return m.t - b.van <= 3 * 60000; }).map(function (m) { return m.ms; }));
      const knop = (gebeurt || []).some(function (e) { return e.soort === 'herverbind-knop' && e.t >= a.tot - 60000 && e.t <= b.van + 60000; });
      herstel.push({ van: voor, naar: na, knop: knop, nr: b.nr });
    }
    return { groepen: groepen.map(function (g) { const x = Object.assign({}, g); delete x.monsters; x.n = g.monsters.length; return x; }), herstel: herstel };
  }

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
    if (_meetBezig || _gpBezig) return null;
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
  // DE GROEPSPROEF — hoeveel PIDs per verzoek (28-09-2026)
  // ══════════════════════════════════════════════════════════════════
  /* DE VRAAG. De app vraagt tot 3 PIDs per verzoek; J1979 staat op CAN tot 6
     toe. De bus zat bij 10,9 verzoeken/s op zo'n 84% bezet, en de vaste kosten
     per verzoek (Bluetooth heen en terug, de adapter) wegen zwaarder dan een
     paar extra CAN-frames. Groter kan dus meer PIDs per seconde opleveren —
     of meer verlies, want boven de 3 is elk antwoord multiframe, en precies
     daarop struikelt een goedkope kloon (#211). Dat is een vraag voor een
     echte auto, en deze proef is de meting.

     WAT HIJ DOET
       1. De bus vasthouden. Lukt dat niet binnen 8 s, dan stopt hij: een
          meting dwars door de pollus heen meet twee dingen tegelijk.
       2. IJkronde: elke kandidaat-PID één keer solo. Alleen wat antwoordt
          doet mee, zodat "onvolledig" betekent: een BEWEZEN PID ontbrak —
          niet: deze auto heeft hem niet.
       3. Groep 1 t/m 6 en weer terug (6 t/m 1), 8 s per stap, verzoeken
          direct achter elkaar. Heen én terug omdat de responstijd binnen een
          sessie kan oplopen (#302): zo middelt die drift uit, en het verschil
          tussen heen en terug laat zien of hij er was.
       4. Per stap: verzoeken/s, PIDs/s die werkelijk binnenkwamen, mediaan en
          90e percentiel van de responstijd, onvolledige en lege antwoorden, en
          herhaalde frames (echo).
       5. Een advies (groepAdvies, puur) en de ruwe stappen als logregels met
          RecordType 'groepsproef' naar de logtabel, zodat de meting ook zonder
          dit toestel terug te lezen is.

     WAT HIJ NIET IS. Geen regelkring: hij zet niets. Een advies boven de 3
     neem je met de hand over; de automaat blijft op hoogstens 3 tot er genoeg
     ritten zijn die het bewijzen. */
  const GP_VERSIE = 'groepsproef 1 (28-09-2026)';
  const GP_GROEPEN = [1, 2, 3, 4, 5, 6];
  const GP_STAP_SEC = 8;
  const GP_BUS_WACHT_MS = 8000;
  let _gp = null, _gpBezig = false, _gpStand = '';

  function _p90(a) {
    if (!a.length) return 0;
    const s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
  }

  // Kandidaten: mode 01, geen bitmap, eerst de actieve selectie, aangevuld
  // met wat de auto ondersteunt. Twaalf is genoeg om een groep van zes twee
  // keer te vullen zonder dat dezelfde PID erin herhaald wordt.
  function _gpKandidaten() {
    const uit = [];
    const erbij = function (bron) {
      try {
        if (!bron || !bron.size) return;
        Array.from(bron).forEach(function (p) {
          const s = String(p).toUpperCase();
          if (/^01[0-9A-F]{2}$/.test(s) && !/^01(00|20|40|60|80|A0|C0)$/.test(s) && uit.indexOf(s) < 0) uit.push(s);
        });
      } catch (e) { console.warn('Groepsproef: PID-lijst niet leesbaar', e); }
    };
    try { erbij(typeof activePIDs !== 'undefined' ? activePIDs : null); } catch (e) { console.warn('Groepsproef: activePIDs niet leesbaar', e); }
    try { erbij(typeof supportedPIDs !== 'undefined' ? supportedPIDs : null); } catch (e) { console.warn('Groepsproef: supportedPIDs niet leesbaar', e); }
    return uit.slice(0, 12);
  }

  function _isCAN() {
    try { return /^[6-9A-Ca-c]/.test(String((typeof selectedNetwork !== 'undefined' && selectedNetwork && selectedNetwork.id) || '')); }
    catch (e) { return false; }
  }

  async function _gpStap(g, pids, rit, stapSec) {
    const tijden = [];
    let n = 0, gevraagd = 0, gekregen = 0, onvol = 0, leeg = 0, k = 0;
    const echoVoor = (_stats() || {}).echoTot || 0;
    const t0 = Date.now(), eind = t0 + stapSec * 1000;
    while (Date.now() < eind) {
      if (!_echt()) break;
      const grp = [];
      for (let j = 0; j < g; j++) grp.push(pids[(k + j) % pids.length]);
      k = (k + g) % pids.length;
      const uniek = grp.filter(function (p, i) { return grp.indexOf(p) === i; });
      // Dezelfde vorm als de pollus: '01' + de PID-nummers achter elkaar, ook
      // bij een groep van één — zo meet stap 1 wat de pollus bij groep 1 doet.
      const cmd = '01' + uniek.map(function (p) { return p.slice(2); }).join('');
      const ts = Date.now();
      let raw = '';
      try { raw = await sendCmd(cmd, 2500); } catch (e) { raw = ''; }
      tijden.push(Date.now() - ts);
      n++; gevraagd += uniek.length;
      let got = {};
      try { got = splitBatchResponse(raw, uniek) || {}; } catch (e) { got = {}; }
      const mist = uniek.filter(function (p) { return !Object.prototype.hasOwnProperty.call(got, p); }).length;
      gekregen += uniek.length - mist;
      if (mist === uniek.length) leeg++;
      else if (mist) onvol++;
    }
    const sec = Math.max(0.001, (Date.now() - t0) / 1000);
    return {
      groep: g, rit: rit, n: n, sec: +sec.toFixed(1),
      perSec: +(n / sec).toFixed(1), pidsPerSec: +(gekregen / sec).toFixed(1),
      gevraagd: gevraagd, gekregen: gekregen,
      medMs: _mediaan(tijden), p90Ms: _p90(tijden),
      onvol: onvol, leeg: leeg,
      onvolPct: n ? Math.round(onvol / n * 100) : 0,
      leegPct: n ? Math.round(leeg / n * 100) : 0,
      echo: Math.max(0, ((_stats() || {}).echoTot || 0) - echoVoor)
    };
  }

  /* HET ADVIES — puur, dus zonder adapter te toetsen (test-groepsgrootte.js).

     1. Heen en terug per groep samenvoegen tot één cijfer.
     2. Schoon = hoogstens 2% onvolledig, geen lege antwoorden, geen echo.
        Onvolledig telt alleen bewezen PIDs (zie de ijkronde), dus dit is
        verlies en geen "deze auto heeft hem niet".
     3. Van klein naar groot: een grotere schone groep wint alleen bij minstens
        5% meer PIDs/s. Bij een gelijkspel blijft de kleinere groep staan,
        want die past vaker in één frame en heeft minder te verliezen.
     4. Drift: verschilt de mediane responstijd van één groep heen en terug
        meer dan 25%, dan veranderde de verbinding tijdens de proef en staat
        dat erbij — het advies geldt dan onder voorbehoud. */
  function groepAdvies(stappen) {
    const st = (Array.isArray(stappen) ? stappen : []).filter(function (x) { return x && !x.overgeslagen && x.n > 0; });
    if (!st.length) return { groep: null, groepen: [], drift: null, kop: 'Geen meting', reden: 'er is geen enkele stap gemeten' };
    const per = {};
    st.forEach(function (x) {
      const p = per[x.groep] || (per[x.groep] = { groep: x.groep, n: 0, sec: 0, gekregen: 0, onvol: 0, leeg: 0, echo: 0, med: [] });
      p.n += x.n; p.sec += x.sec; p.gekregen += x.gekregen;
      p.onvol += x.onvol || 0; p.leeg += x.leeg || 0; p.echo += x.echo || 0;
      p.med.push({ rit: x.rit, ms: x.medMs });
    });
    const groepen = Object.keys(per).map(Number).sort(function (a, b) { return a - b; }).map(function (g) {
      const p = per[g];
      const onvolPct = p.n ? Math.round(p.onvol / p.n * 100) : 0;
      const leegPct = p.n ? Math.round(p.leeg / p.n * 100) : 0;
      return {
        groep: g, n: p.n,
        pidsPerSec: p.sec ? +(p.gekregen / p.sec).toFixed(1) : 0,
        perSec: p.sec ? +(p.n / p.sec).toFixed(1) : 0,
        medMs: Math.round(p.med.reduce(function (a, m) { return a + m.ms; }, 0) / p.med.length),
        onvolPct: onvolPct, leegPct: leegPct, echo: p.echo,
        schoon: onvolPct <= 2 && leegPct === 0 && p.echo === 0,
        heenTerug: p.med
      };
    });

    let drift = null;
    groepen.forEach(function (x) {
      const h = x.heenTerug.filter(function (m) { return m.rit === 'heen'; })[0];
      const t = x.heenTerug.filter(function (m) { return m.rit === 'terug'; })[0];
      if (!h || !t || !(h.ms > 0) || !(t.ms > 0)) return;
      const r = Math.max(h.ms, t.ms) / Math.min(h.ms, t.ms);
      if (r > 1.25 && (!drift || r > drift.factor)) drift = { groep: x.groep, heenMs: h.ms, terugMs: t.ms, factor: +r.toFixed(2) };
    });
    const driftTekst = drift
      ? ' Let op: bij groep ' + drift.groep + ' was de responstijd heen ' + drift.heenMs + ' ms en terug ' + drift.terugMs +
        ' ms — de verbinding veranderde tijdens de proef. Herhaal hem voordat je hier iets op zet.'
      : '';

    const ref = groepen.filter(function (x) { return x.groep === 3; })[0] || null;
    const schoon = groepen.filter(function (x) { return x.schoon; });
    if (!schoon.length) {
      const g1 = groepen[0];
      return {
        groep: null, groepen: groepen, drift: drift, winstPct: null,
        kop: 'Geen enkele groepsgrootte bleef schoon',
        reden: 'ook groep ' + g1.groep + ' verloor ' + g1.onvolPct + '% (onvolledig) en ' + g1.leegPct + '% (leeg)' +
               (g1.echo ? ', met ' + g1.echo + ' herhaalde frames' : '') + '. Dat is geen groepskwestie maar een verbinding die hapert.' + driftTekst
      };
    }
    let best = schoon[0];
    for (let i = 1; i < schoon.length; i++) if (schoon[i].pidsPerSec >= best.pidsPerSec * 1.05) best = schoon[i];
    const winst = (ref && ref.pidsPerSec > 0) ? Math.round((best.pidsPerSec / ref.pidsPerSec - 1) * 100) : null;
    let kop;
    if (best.groep > 3) kop = 'Groep ' + best.groep + ' haalt ' + (winst === null ? 'meer' : winst + '% meer') + ' PIDs/s dan groep 3';
    else if (best.groep === 3) kop = 'Groep 3 is hier het beste';
    else kop = 'Kleiner is hier beter: groep ' + best.groep;
    const reden = 'groep ' + best.groep + ': ' + best.pidsPerSec + ' PIDs/s bij ' + best.medMs + ' ms, ' + best.onvolPct + '% onvolledig' +
      (ref ? '; groep 3: ' + ref.pidsPerSec + ' PIDs/s bij ' + ref.medMs + ' ms, ' + ref.onvolPct + '% onvolledig' + (ref.echo ? ', ' + ref.echo + ' echo' : '') : '') +
      '.' + driftTekst;
    return { groep: best.groep, winstPct: winst, groepen: groepen, drift: drift, kop: kop, reden: reden };
  }

  // Elke stap als eigen logregel, plus de uitslag. Asynchroon en zonder erop
  // te wachten: de proef is klaar, of de log er nu of over drie seconden is.
  function _gpNaarLog(uit) {
    if (typeof logToSheets !== 'function') return;
    const extra = {
      RecordType: 'groepsproef',
      Adapter: String(uit.adapter || '').slice(0, 80),
      PIDs: uit.ijk ? uit.ijk.bewezen.join(' ') : ''
    };
    const stuur = function (tekst) {
      try { Promise.resolve(logToSheets('groepsproef', tekst, extra)).catch(function (e) { console.warn('Groepsproef: logregel niet verstuurd', e); }); }
      catch (e) { console.warn('Groepsproef: logregel niet verstuurd', e); }
    };
    uit.stappen.forEach(function (x, i) {
      stuur('stap ' + (i + 1) + ' ' + x.rit + ' groep ' + x.groep + (x.overgeslagen ? ' overgeslagen: ' + x.overgeslagen :
        ': ' + x.n + ' verzoeken in ' + x.sec + ' s, ' + x.perSec + ' verz/s, ' + x.pidsPerSec + ' PIDs/s, ' +
        'med ' + x.medMs + ' ms, p90 ' + x.p90Ms + ' ms, onvolledig ' + x.onvol + ' (' + x.onvolPct + '%), leeg ' + x.leeg +
        ' (' + x.leegPct + '%), echo ' + x.echo));
    });
    const a = uit.advies || {};
    stuur(GP_VERSIE + ' · ' + (uit.afgebroken ? 'AFGEBROKEN: ' + uit.afgebroken + ' · ' : '') +
      'protocol ' + uit.protocol + ' · ijk ' + (uit.ijk ? uit.ijk.bewezen.length + '/' + uit.ijk.kandidaten : '?') +
      ' · advies groep ' + (a.groep === null || a.groep === undefined ? '-' : a.groep) + ': ' + (a.kop || '') + ' — ' + (a.reden || ''));
  }

  function _gpKlaar(uit) {
    uit.advies = groepAdvies(uit.stappen);
    _gp = uit;
    try {
      if (typeof btDiag === 'function') {
        if (uit.afgebroken) btDiag('Groepsproef afgebroken: ' + uit.afgebroken, 'warn');
        uit.advies.groepen.forEach(function (x) {
          btDiag('Groepsproef groep ' + x.groep + ': ' + x.pidsPerSec + ' PIDs/s, ' + x.perSec + ' verz/s, ' + x.medMs +
                 ' ms, onvolledig ' + x.onvolPct + '%, leeg ' + x.leegPct + '%, echo ' + x.echo, x.schoon ? 'ok' : 'warn');
        });
        btDiag('Groepsproef-advies: ' + uit.advies.kop + ' — ' + uit.advies.reden, 'ok');
      }
    } catch (e) { console.warn('De uitkomst van de groepsproef kwam niet in het BT-log:', e); }
    _gpNaarLog(uit);
    // DE STAP VOOR DE MEETOPDRACHT (#333). Een meetopdracht kan niet zien of
    // er een groepsproef gedraaid heeft; een markering wel. Alleen een proef
    // die helemaal doorliep telt: een afgebroken proef heeft geen advies.
    if (!uit.afgebroken) {
      try {
        if (typeof plMarkeer === 'function') plMarkeer('groepsproef klaar', uit.advies.kop + ' (' + (uit.adapter || 'adapter onbekend') + ')');
        else console.warn('Groepsproef: plMarkeer ontbreekt — de meetopdracht voor #333 ziet deze proef niet');
      } catch (e) { console.warn('Groepsproef: de markering is niet gezet', e); }
    }
    _teken();
    return uit;
  }

  // `opties.stapSec` bestaat voor de browserproef: twaalf stappen van 8 s is
  // anderhalve minuut CI per run. Op het toestel is het altijd 8.
  async function groepsproef(opties) {
    const stapSec = (opties && opties.stapSec > 0 && opties.stapSec <= GP_STAP_SEC) ? opties.stapSec : GP_STAP_SEC;
    if (_gpBezig || _meetBezig) return null;
    if (!_echt()) { _melding('Groepsproef: verbind eerst een echte auto (niet in demo)'); return null; }
    if (typeof sendCmd !== 'function' || typeof splitBatchResponse !== 'function' || typeof parsePID !== 'function') {
      _melding('Groepsproef: de meetketen is niet geladen — er valt niets te meten'); return null;
    }
    if (!window.PLBus || typeof PLBus.wait !== 'function') { _melding('Groepsproef: PLBus ontbreekt'); return null; }
    if (!_isCAN()) { _melding('Groepsproef: alleen op CAN — dit protocol kent geen meervoudige verzoeken'); return null; }

    _gpBezig = true; _gpStand = 'wachten tot de bus vrij is…'; _teken();
    const uit = { t: Date.now(), versie: GP_VERSIE, adapter: adapterNaam(), protocol: protocol(), stappen: [], ijk: null, afgebroken: null };
    let tok = 0;
    try {
      tok = await PLBus.wait('groepsproef', GP_BUS_WACHT_MS);
      if (!tok) uit.afgebroken = 'de bus kwam niet vrij binnen ' + (GP_BUS_WACHT_MS / 1000) + ' s';
      else {
        _gpStand = 'ijkronde — welke PIDs antwoorden solo…'; _teken();
        const kand = _gpKandidaten(), bewezen = [];
        for (let i = 0; i < kand.length; i++) {
          if (!_echt()) break;
          let raw = '';
          try { raw = await sendCmd(kand[i], 2000); } catch (e) { raw = ''; }
          let w = null;
          try { w = parsePID(kand[i], raw); } catch (e) { w = null; }
          if (w !== null && w !== undefined && !(typeof w === 'number' && isNaN(w))) bewezen.push(kand[i]);
        }
        uit.ijk = { kandidaten: kand.length, bewezen: bewezen };
        if (bewezen.length < 2) uit.afgebroken = 'maar ' + bewezen.length + ' van ' + kand.length + ' PIDs antwoorden solo — daar valt geen groep mee te maken';
        else {
          const volgorde = GP_GROEPEN.concat(GP_GROEPEN.slice().reverse());
          for (let s = 0; s < volgorde.length; s++) {
            const g = volgorde[s], rit = s < GP_GROEPEN.length ? 'heen' : 'terug';
            if (!_echt()) { uit.afgebroken = 'de verbinding viel weg bij stap ' + (s + 1); break; }
            if (g > bewezen.length) { uit.stappen.push({ groep: g, rit: rit, overgeslagen: 'maar ' + bewezen.length + ' PIDs antwoorden solo' }); continue; }
            try { PLBus.raak(tok); } catch (e) { console.warn('PLBus.raak mislukt — bij een lange proef kan het slot worden afgebroken', e); }
            _gpStand = 'stap ' + (s + 1) + ' van ' + volgorde.length + ' (' + rit + ') — ' + g + ' PID' + (g === 1 ? '' : 's') + ' per verzoek';
            _teken();
            uit.stappen.push(await _gpStap(g, bewezen, rit, stapSec));
            await _wacht(300);
          }
        }
      }
    } catch (e) {
      uit.afgebroken = 'fout tijdens de proef: ' + ((e && e.message) || e);
    } finally {
      if (tok) { try { PLBus.release(tok); } catch (e) { console.warn('PLBus.release mislukt na de groepsproef', e); } }
      try { if (window.PLLoad && typeof PLLoad.echoBijwerken === 'function') PLLoad.echoBijwerken(); }
      catch (e) { console.warn('PLLoad.echoBijwerken mislukt — de automaat kan op echo\'s van de proef krimpen', e); }
      _gpBezig = false; _gpStand = '';
    }
    return _gpKlaar(uit);
  }

  function laatsteGroepsproef() { return _gp; }

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
          [1, 2, 3, 4, 5, 6].map(function (g) {
            let nuG = 3; try { nuG = PLBus.batchGroep(); } catch (e) { console.warn('PLBus.batchGroep mislukt:', e); }
            const aan = nuG === g;
            return '<button onclick="PLAdapter.zetGroep(' + g + ')" style="flex:1;border-radius:7px;padding:13px 4px;' +
              'font:800 11px var(--m);cursor:pointer;border:1px solid ' +
              (aan ? 'var(--bl);background:var(--blv);color:#fff' : 'var(--bd);background:var(--sur);color:var(--tx2)') +
              '">' + g + '</button>';
          }).join('') +
        '</div>' +
        '<div style="font:400 10px var(--f);color:var(--tx3);margin-top:6px">' +
          '4–6 is om te meten: de automaat gaat niet boven 3 tot een rit laat zien dat meer goed gaat ' +
          '(groepsproef hieronder). Terug naar 🤖 Automaat zet de groep weer op hoogstens 3.</div>' +
        '<div style="font:400 10px var(--f);color:var(--tx3);margin-top:4px">' +
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

  function _groepsproefBlok() {
    const kop = '<div style="font:800 11px var(--f);color:var(--tx3);letter-spacing:.4px;margin-bottom:6px">GROEPSPROEF — HOEVEEL PIDS PER VERZOEK</div>';
    if (_gpBezig) {
      return '<div style="margin-top:12px">' + kop +
        '<div style="background:var(--bls);border:1px solid var(--bl);border-radius:9px;padding:11px">' +
          '<div style="font:800 12px var(--f);color:var(--bl)">📦 Groepsproef loopt — ' + _gpStand + '</div>' +
          '<div style="font:400 11px var(--f);color:var(--tx2);margin-top:2px">Ongeveer twee minuten. De meters staan zolang stil; ' +
            'laat de app open staan en de motor draaien.</div>' +
        '</div></div>';
    }
    let uitslag = '';
    if (_gp) {
      const a = _gp.advies || {};
      let nuG = 3; try { nuG = PLBus.batchGroep(); } catch (e) { console.warn('PLBus.batchGroep mislukt:', e); }
      uitslag = '<div style="margin-top:8px;background:var(--sur);border:1px solid var(--bd);border-radius:9px;padding:10px">' +
        (_gp.afgebroken ? '<div style="font:700 11px var(--f);color:var(--or);margin-bottom:4px">⚠ ' + _gp.afgebroken + '</div>' : '') +
        '<div style="font:800 12px var(--f);color:var(--tx)">' + (a.kop || '') + '</div>' +
        '<div style="font:400 11px var(--f);color:var(--tx2);margin-top:3px">' + (a.reden || '') + '</div>' +
        (a.groep && a.groep !== nuG ? '<button onclick="PLAdapter.zetGroep(' + a.groep + ')" style="margin-top:8px;width:100%;border:0;' +
          'background:var(--blv);color:#fff;border-radius:8px;padding:9px;font:800 12px var(--f);cursor:pointer">' +
          'Zet ' + a.groep + ' PIDs per verzoek (handmatig)</button>' : '') +
        '<table style="width:100%;margin-top:9px;border-collapse:collapse;font:600 10px var(--m);color:var(--tx2)">' +
          '<tr style="color:var(--tx3)"><td>groep</td><td>PIDs/s</td><td>verz/s</td><td>ms</td><td>onvol</td><td>leeg</td><td>echo</td></tr>' +
          (a.groepen || []).map(function (x) {
            const kl = function (slecht) { return slecht ? 'var(--or)' : 'var(--tx2)'; };
            return '<tr style="' + (x.groep === a.groep ? 'font-weight:800;color:var(--tx)' : '') + '"><td>' + x.groep + '</td><td>' + x.pidsPerSec + '</td>' +
              '<td>' + x.perSec + '</td><td>' + x.medMs + '</td>' +
              '<td style="color:' + kl(x.onvolPct > 2) + '">' + x.onvolPct + '%</td>' +
              '<td style="color:' + kl(x.leegPct > 0) + '">' + x.leegPct + '%</td>' +
              '<td style="color:' + kl(x.echo > 0) + '">' + x.echo + '</td></tr>';
          }).join('') +
        '</table>' +
        '<div style="font:400 10px var(--f);color:var(--tx3);margin-top:5px">' +
          'heen en terug samengevoegd · ' + (_gp.ijk ? _gp.ijk.bewezen.length + ' PIDs die solo antwoorden' : '') +
          ' · gemeten om ' + _tijd(_gp.t) + ' · staat ook in de logtabel (groepsproef)</div>' +
      '</div>';
    }
    return '<div style="margin-top:12px">' + kop +
      '<div style="font:400 11px var(--f);color:var(--tx2);margin-bottom:7px">' +
        'Meet groep 1 t/m 6 en weer terug op deze auto en deze adapter. Motor aan, auto stil, geen andere meting open. ' +
        'Onderweg alleen als iemand anders de telefoon bedient. Zie de campagne in de testrun voor de volledige rit.</div>' +
      '<button onclick="PLAdapter.groepsproef()" style="width:100%;border:1px solid var(--bd);background:var(--sur);' +
        'color:var(--tx);border-radius:9px;padding:11px;font:800 12px var(--f);cursor:pointer">' +
        '📦 Start de groepsproef (± 2 min)</button>' +
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
      _groepsproefBlok() +
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
      const naar = PLBus.batchZet(n, true);
      if (window.PLLoad && typeof PLLoad.boekActie === 'function') {
        PLLoad.boekActie('groep', van, naar, 'met de hand gezet via het adapterpaneel');
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
    _gebeurt.push({ t: Date.now(), soort: 'herverbind-knop' });
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
    // Na de SPP-proef (#352) zit de vertraging in een draad van dit proces:
    // opnieuw verbinden haalt die niet weg, en wegvegen ook niet (de meetdienst
    // houdt het proces in leven) — alleen het proces beëindigen.
    let proef = null;
    try { proef = window.PLSppProef && typeof PLSppProef.aangetast === 'function' ? PLSppProef.aangetast() : null; }
    catch (e) { console.warn('adapterpaneel: SPP-proefmarkering onleesbaar', e); }
    if (proef) return '<div id="plAdDrift" style="margin:0 0 12px;padding:10px 12px;border:1px solid var(--or);background:var(--ors);' +
      'border-radius:10px;font:600 12px/1.45 var(--f);color:var(--tx)">' +
      'De responstijd is opgelopen van ' + d.van + ' naar ' + d.naar + ' ms, maar de SPP-proef (#352) heeft deze sessie aangetast. ' +
      'Opnieuw verbinden en wegvegen helpen dan niet — Admin → 🧹 SPP: proces beëindigen.</div>';
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
      try { _sessieTik(); } catch (e) { console.warn('Adapter-sessiemonster mislukt (#302):', e); }
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
    groepsproef: groepsproef,
    groepAdvies: groepAdvies,
    laatsteGroepsproef: laatsteGroepsproef,
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
    sessie: function () { return _sessie.slice(); },
    gebeurtenissen: function () { return _gebeurt.slice(); },
    // Een gebeurtenis van buiten dit paneel, voor de sessiereeks (#352).
    noteer: function (soort) { _gebeurt.push({ t: Date.now(), soort: String(soort || '') }); },
    driftAnalyse: driftAnalyse,
    sessieOordeel: function () { return driftAnalyse(_sessie, _gebeurt); },
    driftOordeel: driftOordeel,
    adapterNaam: adapterNaam,
    protocol: protocol,
    ati: function () { return _ati; },
    versie: ADAPTER_VERSIE
  };
  window.openAdapterPaneel = open;

  try { if (typeof btDiag === 'function') btDiag('pidlane-adapter.js geladen — ' + ADAPTER_VERSIE, 'info'); }
  catch (e) { /* stil: melding mag nooit de stroom breken */ }
})();
