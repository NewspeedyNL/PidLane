/* ═══════════════════════════════════════════════════════════════════
   pidlane-rondgang.js — vierde live-weergave: categorie-rondgang
   ───────────────────────────────────────────────────────────────────
   WAT HET DOET

   Trends / Getallen / Puntjes tonen alle drie dezelfde selectie, alleen
   anders getekend. Rondgang verandert de SELECTIE zelf: elke 100 seconden
   staat één motoronderdeel op het scherm — alle temperatuursensoren, dan
   alle brandstofsensoren, enzovoort — óók de PIDs die niet handmatig
   waren aangevinkt. Daarna gaan ze weer uit en komt de volgende groep.

   De basis (BASIS_PIDS: toerental, koelwater, motorbelasting, inlaatlucht,
   snelheid) blijft de hele rondgang staan. Zonder die context is een
   losse sensorwaarde niet te duiden: 92 °C olie zegt niets als je niet
   weet of de motor stationair draait of 3000 toeren maakt. Handmatig
   aangevinkte PIDs (manualPIDs) blijven om dezelfde reden ook staan —
   wie iets bewust volgt wil dat niet elke 100 seconden kwijtraken.

   WELKE CATEGORIEËN WORDEN OVERGESLAGEN

   Drie filters, in deze volgorde:

   1. Niet ondersteund door dit voertuig → weg. De PID-tabel kent 32
      temperatuursensoren; een doorsnee auto levert er zes.
   2. `pidIsTekst(pid)` → weg. Brandstoftype, OBD-norm, O2-bezetting:
      dat zijn codes, geen metingen. Honderd seconden naar "Benzine"
      staren heeft geen enkele waarde — precies het geval dat hier
      overgeslagen moet worden.
   3. Blijven er na 1 en 2 minder dan MIN_PIDS sensoren over die niet al
      in de basis zitten, dan wordt de hele categorie overgeslagen. Eén
      extra tegel rechtvaardigt geen eigen scherm van bijna twee minuten.

   WAAROM EEN MAXIMUM PER SCHERM

   Emissie telt op een goed uitgeruste auto zo twintig PIDs. Die in één
   ronde aanzetten verdubbelt de pollronde en dan zakt de verversing van
   álles in — ook van de basis. Boven MAX_PIDS wordt de categorie daarom
   over meerdere beurten verdeeld ("Emissie 1/2", "Emissie 2/2"), zodat
   de busbelasting per scherm ongeveer gelijk blijft.

   VERHOUDING TOT DE REST

   Toevoegen loopt via pidGate('kiesbaar'), net als elke andere deur naar
   activePIDs — anders slaat het vangnet in renderGauges() alarm. De
   PIDs gaan er met `handmatig:false` in, zodat ze niet in manualPIDs
   belanden en dus weer netjes verdwijnen. Bij stoppen wordt de selectie
   van vóór de rondgang exact teruggezet.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const INTERVAL_MS = 100000;   // 100 s per categorie
  const MIN_PIDS    = 2;        // minder dan dit → categorie overslaan
  const MAX_PIDS    = 12;       // meer dan dit → over meerdere beurten

  // Vaste volgorde: van "waar kijk je meestal naar" naar specialistisch.
  // Categorieën die het voertuig niet heeft vallen vanzelf weg.
  const VOLGORDE = ['Temp', 'Motor', 'Brandstof', 'Emissie', 'Electrisch', 'Rijden', 'Mazda', 'Overig'];

  // 'Temperatuur' komt een paar keer voor in de PID-tabel waar 'Temp'
  // bedoeld is. Hier gelijktrekken i.p.v. de tabel aanpassen: die wordt
  // op meer plaatsen gelezen en een rename daar is een groter risico.
  const ALIAS = { 'Temperatuur': 'Temp', 'Elektrisch': 'Electrisch' };
  function catVan(pid) {
    try {
      const d = getPidDef(pid);
      const c = (d && d.cat) || 'Overig';
      return ALIAS[c] || c;
    } catch (e) { return 'Overig'; }
  }

  let _aan = false;
  let _timer = null, _tick = null;
  let _beurten = [];       // [{cat, label, pids:[...]}]
  let _idx = -1;
  let _tot = 0;            // timestamp waarop de volgende wissel valt
  let _vorigeActieve = null;
  let _vorigeMode = 'full';

  // ── Basis die altijd blijft staan ─────────────────────────────────
  function basisSet() {
    const uit = new Set();
    const kern = (window.BASIS_PIDS || []);
    kern.forEach(p => {
      try {
        if (demoMode || (typeof supportedPIDs !== 'undefined' && supportedPIDs.has && supportedPIDs.has(p))) {
          if (typeof pidGate !== 'function' || pidGate(p, 'kiesbaar')) uit.add(p);
        }
      } catch (e) {}
    });
    try { manualPIDs.forEach(p => uit.add(p)); } catch (e) {}
    return uit;
  }

  // ── Beurtenlijst opbouwen ─────────────────────────────────────────
  function bouwBeurten() {
    const basis = basisSet();
    const bron = [];
    try {
      if (typeof supportedPIDs !== 'undefined' && supportedPIDs.size) bron.push(...supportedPIDs);
      else (window.discoveredPIDDefs || []).forEach(d => bron.push(d.pid));
    } catch (e) {}

    const perCat = {};
    bron.forEach(pid => {
      if (basis.has(pid)) return;                                   // zit al vast op het scherm
      try { if (typeof pidIsTekst === 'function' && pidIsTekst(pid)) return; }  // code, geen meting
      catch (e) {}
      try { if (typeof pidGate === 'function' && !pidGate(pid, 'kiesbaar')) return; } catch (e) {}
      if (typeof getPidDef === 'function' && !getPidDef(pid)) return;
      const c = catVan(pid);
      (perCat[c] || (perCat[c] = [])).push(pid);
    });

    const beurten = [];
    const cats = VOLGORDE.filter(c => perCat[c]).concat(
      Object.keys(perCat).filter(c => VOLGORDE.indexOf(c) < 0).sort()
    );

    cats.forEach(c => {
      const lijst = perCat[c];
      if (lijst.length < MIN_PIDS) return;                          // te mager voor een eigen scherm
      if (lijst.length <= MAX_PIDS) {
        beurten.push({ cat: c, label: c, pids: lijst });
        return;
      }
      const n = Math.ceil(lijst.length / MAX_PIDS);
      for (let i = 0; i < n; i++) {
        beurten.push({
          cat: c,
          label: `${c} ${i + 1}/${n}`,
          pids: lijst.slice(i * MAX_PIDS, (i + 1) * MAX_PIDS)
        });
      }
    });
    return beurten;
  }

  // ── Selectie zetten ───────────────────────────────────────────────
  function pasToe(beurt) {
    const nieuw = basisSet();
    if (beurt) {
      // Via pidGate, net als elk ander toevoegpad. Niet via pidToevoegen()
      // met handmatig:true — dan zouden ze in manualPIDs blijven plakken en
      // nooit meer verdwijnen, wat precies het tegenovergestelde is van wat
      // een rondgang hoort te doen.
      beurt.pids.forEach(p => {
        try { if (typeof pidGate !== 'function' || pidGate(p, 'kiesbaar')) nieuw.add(p); } catch (e) {}
      });
    }

    const verdwenen = [...activePIDs].filter(p => !nieuw.has(p));
    activePIDs = nieuw;
    // Oude waarden van afgevallen PIDs wissen, anders staat er straks een
    // waarde van drie categorieën geleden in een rapport. Zelfde opruiming
    // als ensurePIDListActive() doet.
    verdwenen.forEach(p => {
      try { delete pidVals[p]; delete _pidLastUpd[p]; delete _pidLastUpdPause[p]; } catch (e) {}
    });

    try { buildPIDList(document.getElementById('psrch')?.value || ''); } catch (e) {}
    try { document.getElementById('pidCnt').textContent = activePIDs.size; } catch (e) {}
    try { renderGauges(); rebuildGSel(); } catch (e) {}
  }

  // ── Balk met categorie + aftelling ────────────────────────────────
  function balk() {
    let b = document.getElementById('rondgangBar');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'rondgangBar';
    b.innerHTML =
      '<span id="rondgangCat"></span>' +
      '<span id="rondgangTel"></span>' +
      '<button type="button" id="rondgangNu">Volgende ›</button>' +
      '<button type="button" id="rondgangUit">Stop</button>';
    const g = document.getElementById('gGrid');
    if (g && g.parentNode) g.parentNode.insertBefore(b, g);
    else document.body.appendChild(b);
    b.querySelector('#rondgangNu').onclick = () => volgende();
    b.querySelector('#rondgangUit').onclick = () => { try { setPidView('full'); } catch (e) { stop(); } };
    return b;
  }
  function balkWeg() { const b = document.getElementById('rondgangBar'); if (b) b.remove(); }

  function tekenBalk() {
    if (!_aan) return;
    const b = balk();
    const beurt = _beurten[_idx];
    const c = b.querySelector('#rondgangCat');
    const t = b.querySelector('#rondgangTel');
    if (c) c.textContent = beurt ? `🔄 ${beurt.label} — ${beurt.pids.length} sensoren` : '🔄 Rondgang';
    if (t) {
      const rest = Math.max(0, Math.ceil((_tot - Date.now()) / 1000));
      t.textContent = `${rest}s · ${_idx + 1}/${_beurten.length}`;
    }
  }

  // ── Beurtwissel ───────────────────────────────────────────────────
  function volgende() {
    if (!_aan || !_beurten.length) return;
    _idx = (_idx + 1) % _beurten.length;
    _tot = Date.now() + INTERVAL_MS;
    pasToe(_beurten[_idx]);
    tekenBalk();
    try { log(`🔄 Rondgang: ${_beurten[_idx].label} (${_beurten[_idx].pids.length} sensoren)`, 'info'); } catch (e) {}
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(volgende, INTERVAL_MS);
  }

  // ── Start / stop ──────────────────────────────────────────────────
  function start() {
    if (_aan) return true;
    _beurten = bouwBeurten();
    if (_beurten.length < 2) {
      try {
        log(`🔄 Rondgang niet gestart — te weinig bruikbare categorieën (${_beurten.length})`, 'warn');
        showToast?.('Te weinig sensoren voor een rondgang');
      } catch (e) {}
      return false;
    }
    _vorigeActieve = new Set(activePIDs);
    _vorigeMode = (typeof pidViewMode !== 'undefined' && pidViewMode) ? pidViewMode : 'full';
    _aan = true; _idx = -1;
    balk();
    if (_tick) clearInterval(_tick);
    _tick = setInterval(tekenBalk, 1000);
    try {
      const n = _beurten.reduce((s, b) => s + b.pids.length, 0);
      log(`🔄 Rondgang gestart — ${_beurten.length} schermen, ${n} sensoren, ${INTERVAL_MS / 1000}s per scherm`, 'ok');
    } catch (e) {}
    volgende();
    return true;
  }

  function stop(herstel) {
    if (!_aan) return;
    _aan = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (_tick) { clearInterval(_tick); _tick = null; }
    balkWeg();
    if (herstel !== false && _vorigeActieve) {
      const nieuw = new Set(_vorigeActieve);
      const verdwenen = [...activePIDs].filter(p => !nieuw.has(p));
      activePIDs = nieuw;
      verdwenen.forEach(p => {
        try { delete pidVals[p]; delete _pidLastUpd[p]; delete _pidLastUpdPause[p]; } catch (e) {}
      });
      try { buildPIDList(document.getElementById('psrch')?.value || ''); } catch (e) {}
      try { document.getElementById('pidCnt').textContent = activePIDs.size; } catch (e) {}
      try { renderGauges(); rebuildGSel(); } catch (e) {}
    }
    _vorigeActieve = null;
    try { log('🔄 Rondgang gestopt — vorige selectie hersteld', 'info'); } catch (e) {}
  }

  // ── Inhaken op de weergaveknoppen ─────────────────────────────────
  // setPidView() is een gewone functiedeclaratie in pidlane-pids.js en dus
  // window.setPidView. De inline onclick="setPidView(...)" in index.html
  // zoekt hem pas bij de klik op, dus deze wrapper vangt ook die knoppen.
  const _orig = window.setPidView;
  window.setPidView = function (mode) {
    if (mode === 'rondgang') {
      // Tekenen gebeurt als Trends; alleen de selectie roteert.
      try { if (typeof _orig === 'function') _orig('full'); } catch (e) {}
      // 'rondgang' bewust NIET in localStorage: het is een sessiestand die
      // een levende verbinding nodig heeft. Bij de volgende start zou de
      // app anders uit zichzelf sensoren gaan aan- en uitzetten.
      try { localStorage.setItem('pl_pidview', 'full'); } catch (e) {}
      const gelukt = start();
      document.querySelectorAll('.pidview-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === (gelukt ? 'rondgang' : 'full')));
      return;
    }
    stop();
    try { if (typeof _orig === 'function') _orig(mode); } catch (e) {}
  };

  // Verbinding weg → rondgang heeft geen zin meer.
  try {
    const _oz = window.setConn;
    if (typeof _oz === 'function') {
      window.setConn = function (v) {
        if (!v && _aan) { try { setPidView('full'); } catch (e) { stop(); } }
        return _oz.apply(this, arguments);
      };
    }
  } catch (e) {}

  window.PLRondgang = {
    start, stop, volgende,
    actief: () => _aan,
    beurten: () => _beurten.map(b => ({ label: b.label, n: b.pids.length })),
    _bouwBeurten: bouwBeurten
  };
})();
