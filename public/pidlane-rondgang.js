/* ═══════════════════════════════════════════════════════════════════
   pidlane-rondgang.js — PLRondgang: categorie-rondgang op vol scherm
   ───────────────────────────────────────────────────────────────────
   WAT HET DOET

   Elke 100 seconden staat één motoronderdeel op het scherm — alle
   temperatuursensoren, dan alle brandstofsensoren, enzovoort — óók de
   PIDs die niet handmatig waren aangevinkt. Daarna komt de volgende.

   WAAROM VOL SCHERM EN ÉÉN GRAFIEK (ronde 2)

   De eerste versie hergebruikte het gewone tegelraster. Dat werkte, maar
   je zag niets: twaalf losse sparklines van 40 pixels hoog, elk met een
   eigen tijdas, en de rondgang viel weg tussen de tegels. Wat je wilt
   zien is juist het VERBAND — draait koelwater mee met belasting, loopt
   de kat-temperatuur achter op toerental — en dat kan alleen als de
   lijnen over dezelfde tijdas heen liggen.

     ┌──────────────────────────────────────────┐
     │ 🔄 Emissie 2/2        89s · 2/2  ‹ › ✕   │  kop
     ├──────────────────────────────────────────┤
     │ 1686 rpm · 49 % · 38 % · 111 kPa · 93 °C │  basis, klein
     ├──────────────────────────────────────────┤
     │                                          │
     │   alle categorie-PIDs in één grafiek     │  20 s venster
     │                                          │
     ├──────────────────────────────────────────┤
     │ ● Lambda 0,99   ● O2 B1S1 0,45 V         │  waarden + legenda
     └──────────────────────────────────────────┘

   De basis (BASIS_PIDS) staat bewust bovenaan als klein GETAL en niet in
   de grafiek. Toerental van 800 tot 4000 naast een lambda van 0,98 tot
   1,02 in dezelfde grafiek maakt van die lambda een rechte streep. De
   basis is context, geen meetlijn.

   PER LIJN EIGEN SCHAAL

   Elke lijn wordt genormaliseerd over zijn EIGEN min/max binnen het
   venster van 20 s. Je leest er dus geen absolute waarde uit — die staat
   eronder in cijfers — maar wel de VORM: stijgt hij, zakt hij, schommelt
   hij, loopt hij synchroon met een andere lijn. Precies wat bij een
   rondgang telt en wat in twaalf losse tegels onzichtbaar is.

   VENSTER VAN 20 SECONDEN

   Kort genoeg om beweging te zien, lang genoeg voor een patroon. Het
   venster schuift mee. `pidHist` bewaart 120 metingen per PID, dus voor
   1 Hz-PIDs ruim voldoende; een PID die elke 10 s ververst heeft in 20 s
   maar twee punten — vandaar MIN_PUNTEN en filteren op TIJD, niet op
   aantal. Op aantal filteren zou de trage PID een venster van drie
   minuten geven en de snelle van twintig seconden.

   WELKE CATEGORIEËN WORDEN OVERGESLAGEN

   1. Niet ondersteund door dit voertuig → weg.
   2. `pidIsTekst(pid)` → weg. Brandstoftype, OBD-norm, O2-bezetting zijn
      codes, geen metingen. Honderd seconden naar "Benzine" staren heeft
      geen waarde.
   3. Blijven er minder dan MIN_PIDS over die niet al in de basis zitten,
      dan wordt de hele categorie overgeslagen.

   Boven MAX_PIDS wordt een categorie over meerdere beurten verdeeld
   ("Emissie 1/2"), zodat de pollronde per scherm ongeveer gelijk blijft.

   VERHOUDING TOT DE REST

   Toevoegen loopt via pidGate('kiesbaar'), net als elk ander pad naar
   activePIDs. PIDs gaan er met handmatig:false in zodat ze niet in
   manualPIDs blijven plakken. Bij stoppen wordt de selectie van vóór de
   rondgang exact teruggezet. Terwijl het volle scherm aan staat wordt
   renderGauges() overgeslagen — die tegels zijn toch niet zichtbaar en
   twaalf kaarten herbouwen per beurt is op een telefoon zonde.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const INTERVAL_MS = 100000;   // 100 s per categorie
  const VENSTER_MS  = 20000;    // 20 s zichtbare trend
  const TEKEN_MS    = 250;      // 4 Hz hertekenen
  const MIN_PIDS    = 2;        // minder dan dit -> categorie overslaan
  const MAX_PIDS    = 12;       // meer dan dit -> over meerdere beurten
  const MIN_PUNTEN  = 2;        // minder punten in het venster -> niet tekenen

  const VOLGORDE = ['Temp', 'Motor', 'Brandstof', 'Emissie', 'Electrisch', 'Rijden', 'Mazda', 'Overig'];
  const ALIAS = { 'Temperatuur': 'Temp', 'Elektrisch': 'Electrisch' };

  // Naast de kleur verschilt ook de positie in de legenda en staat de
  // waarde er in cijfers bij — kleur is nooit de enige drager.
  const PALET = ['#5fd4d6', '#7cc96b', '#e8a33d', '#5b8def', '#e56b6b',
                 '#b98ce8', '#e8d44d', '#4dd4a0', '#f08bb4', '#8fb8e8',
                 '#d4a373', '#9ae6b4'];

  let _aan = false;
  let _timer = null, _tick = null, _teken = null;
  let _beurten = [];
  let _idx = -1;
  let _tot = 0;
  let _vorigeActieve = null;

  function catVan(pid) {
    try { const d = getPidDef(pid); const c = (d && d.cat) || 'Overig'; return ALIAS[c] || c; }
    catch (e) { return 'Overig'; }
  }
  function naamVan(pid) {
    try { const d = getPidDef(pid); return (d && d.name) || pid; } catch (e) { return pid; }
  }
  function eenheidVan(pid) {
    try { const d = getPidDef(pid); return (d && d.unit) || ''; } catch (e) { return ''; }
  }
  function waardeVan(pid) {
    try { return (typeof pidVals !== 'undefined' && pidVals) ? pidVals[pid] : undefined; } catch (e) { return undefined; }
  }
  function toon(pid) {
    const v = waardeVan(pid);
    if (v === undefined || v === null) return '—';
    try { return (typeof fv === 'function') ? fv(v, pid) : String(v); } catch (e) { return String(v); }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Basis die altijd blijft staan ─────────────────────────────────
  function basisSet() {
    const uit = new Set();
    (window.BASIS_PIDS || []).forEach(p => {
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
      if (basis.has(pid)) return;
      try { if (typeof pidIsTekst === 'function' && pidIsTekst(pid)) return; } catch (e) {}
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
      if (lijst.length < MIN_PIDS) return;
      if (lijst.length <= MAX_PIDS) { beurten.push({ cat: c, label: c, pids: lijst }); return; }
      const n = Math.ceil(lijst.length / MAX_PIDS);
      for (let i = 0; i < n; i++) {
        beurten.push({ cat: c, label: c + ' ' + (i + 1) + '/' + n,
                       pids: lijst.slice(i * MAX_PIDS, (i + 1) * MAX_PIDS) });
      }
    });
    return beurten;
  }

  // ── Selectie zetten ───────────────────────────────────────────────
  function pasToe(beurt) {
    const nieuw = basisSet();
    if (beurt) beurt.pids.forEach(p => {
      try { if (typeof pidGate !== 'function' || pidGate(p, 'kiesbaar')) nieuw.add(p); } catch (e) {}
    });
    const verdwenen = [...activePIDs].filter(p => !nieuw.has(p));
    activePIDs = nieuw;
    verdwenen.forEach(p => {
      try { delete pidVals[p]; delete _pidLastUpd[p]; delete _pidLastUpdPause[p]; } catch (e) {}
    });
    try { buildPIDList(document.getElementById('psrch')?.value || ''); } catch (e) {}
    try { document.getElementById('pidCnt').textContent = activePIDs.size; } catch (e) {}
    try { rebuildGSel(); } catch (e) {}
  }

  /* ═══════════════════ VOL SCHERM ═══════════════════ */

  function schermMaak() {
    let s = document.getElementById('rgScherm');
    if (s) return s;
    s = document.createElement('div');
    s.id = 'rgScherm';
    s.innerHTML =
      '<div id="rgKop">' +
        '<span id="rgTitel"></span>' +
        '<span id="rgTel"></span>' +
        '<button type="button" id="rgVorig" aria-label="Vorige categorie">&lsaquo;</button>' +
        '<button type="button" id="rgVolg" aria-label="Volgende categorie">&rsaquo;</button>' +
        '<button type="button" id="rgUit" aria-label="Rondgang sluiten">&#10005;</button>' +
      '</div>' +
      '<div id="rgBasis"></div>' +
      '<div id="rgVlak"><canvas id="rgCanvas"></canvas></div>' +
      '<div id="rgWaarden"></div>';
    document.body.appendChild(s);
    s.querySelector('#rgVolg').onclick  = function () { volgende(1); };
    s.querySelector('#rgVorig').onclick = function () { volgende(-1); };
    s.querySelector('#rgUit').onclick   = function () {
      try { setPidView('full'); } catch (e) { stop(); }
    };
    return s;
  }
  function schermWeg() { const s = document.getElementById('rgScherm'); if (s) s.remove(); }

  // Punten binnen het venster; filteren op TIJD, niet op aantal.
  function punten(pid, vanaf) {
    try {
      const h = (typeof pidHist !== 'undefined' && pidHist) ? pidHist[pid] : null;
      if (!h || !h.length) return [];
      const uit = [];
      for (let i = 0; i < h.length; i++) {
        const p = h[i];
        if (p && p.t >= vanaf && typeof p.v === 'number' && isFinite(p.v)) uit.push(p);
      }
      return uit;
    } catch (e) { return []; }
  }

  function tekenBasis() {
    const el = document.getElementById('rgBasis'); if (!el) return;
    const basis = [...basisSet()];
    if (!basis.length) { el.innerHTML = '<span class="rgLeeg">geen basissensoren</span>'; return; }
    el.innerHTML = basis.map(function (pid) {
      return '<span class="rgB"><b>' + esc(toon(pid)) + '</b>' +
             '<i>' + esc(eenheidVan(pid)) + '</i>' +
             '<u>' + esc(naamVan(pid)) + '</u></span>';
    }).join('');
  }

  function tekenGrafiek() {
    const c = document.getElementById('rgCanvas');
    const vlak = document.getElementById('rgVlak');
    if (!c || !vlak) return;
    const beurt = _beurten[_idx]; if (!beurt) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = vlak.clientWidth || 320, H = vlak.clientHeight || 200;
    if (W < 2 || H < 2) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const pad = { t: 8, r: 8, b: 8, l: 8 };
    const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;

    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * gH;
      g.beginPath(); g.moveTo(pad.l, y + .5); g.lineTo(W - pad.r, y + .5); g.stroke();
      const x = pad.l + (i / 4) * gW;
      g.beginPath(); g.moveTo(x + .5, pad.t); g.lineTo(x + .5, H - pad.b); g.stroke();
    }

    const vanaf = Date.now() - VENSTER_MS;
    let getekend = 0;

    beurt.pids.forEach(function (pid, i) {
      const pts = punten(pid, vanaf);
      if (pts.length < MIN_PUNTEN) return;
      let mn = Infinity, mx = -Infinity;
      for (let j = 0; j < pts.length; j++) { if (pts[j].v < mn) mn = pts[j].v; if (pts[j].v > mx) mx = pts[j].v; }
      // Vlakke lijn: midden in beeld i.p.v. een deling door nul.
      if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
      const bereik = mx - mn;
      const kleur = PALET[i % PALET.length];

      g.strokeStyle = kleur; g.lineWidth = 1.8;
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      for (let j = 0; j < pts.length; j++) {
        const x = pad.l + ((pts[j].t - vanaf) / VENSTER_MS) * gW;
        const y = pad.t + gH - ((pts[j].v - mn) / bereik) * gH;
        j === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();

      const l = pts[pts.length - 1];
      const lx = pad.l + ((l.t - vanaf) / VENSTER_MS) * gW;
      const ly = pad.t + gH - ((l.v - mn) / bereik) * gH;
      g.fillStyle = kleur;
      g.beginPath(); g.arc(lx, ly, 2.8, 0, Math.PI * 2); g.fill();
      getekend++;
    });

    if (!getekend) {
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.font = '12px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('trend vult zich\u2026', W / 2, H / 2);
    }
  }

  function tekenWaarden() {
    const el = document.getElementById('rgWaarden'); if (!el) return;
    const beurt = _beurten[_idx]; if (!beurt) { el.innerHTML = ''; return; }
    el.innerHTML = beurt.pids.map(function (pid, i) {
      return '<span class="rgW"><i style="background:' + PALET[i % PALET.length] + '"></i>' +
             '<span class="rgWn">' + esc(naamVan(pid)) + '</span>' +
             '<b>' + esc(toon(pid)) + '</b>' +
             '<u>' + esc(eenheidVan(pid)) + '</u></span>';
    }).join('');
  }

  function tekenKop() {
    const beurt = _beurten[_idx];
    const t = document.getElementById('rgTitel');
    const n = document.getElementById('rgTel');
    if (t) t.textContent = beurt ? '\uD83D\uDD04 ' + beurt.label : '\uD83D\uDD04 Rondgang';
    if (n) {
      const rest = Math.max(0, Math.ceil((_tot - Date.now()) / 1000));
      n.textContent = rest + 's \u00B7 ' + (_idx + 1) + '/' + _beurten.length;
    }
  }

  function tekenAlles() {
    if (!_aan) return;
    tekenKop(); tekenBasis(); tekenGrafiek(); tekenWaarden();
  }

  /* ═══════════════════ BEURTWISSEL ═══════════════════ */

  function volgende(richting) {
    if (!_aan || !_beurten.length) return;
    const stap = (richting === -1) ? -1 : 1;
    _idx = (_idx + stap + _beurten.length) % _beurten.length;
    _tot = Date.now() + INTERVAL_MS;
    pasToe(_beurten[_idx]);
    tekenAlles();
    try { log('\uD83D\uDD04 Rondgang: ' + _beurten[_idx].label +
              ' (' + _beurten[_idx].pids.length + ' sensoren)', 'info'); } catch (e) {}
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () { volgende(1); }, INTERVAL_MS);
  }

  /* ═══════════════════ START / STOP ═══════════════════ */

  function start() {
    if (_aan) return true;
    _beurten = bouwBeurten();
    if (_beurten.length < 2) {
      try {
        log('\uD83D\uDD04 Rondgang niet gestart \u2014 te weinig bruikbare categorie\u00EBn (' +
            _beurten.length + ')', 'warn');
        if (typeof showToast === 'function') showToast('Te weinig sensoren voor een rondgang');
      } catch (e) {}
      return false;
    }
    _vorigeActieve = new Set(activePIDs);
    _aan = true; _idx = -1;
    schermMaak();
    if (_tick)  clearInterval(_tick);
    if (_teken) clearInterval(_teken);
    _tick  = setInterval(tekenKop, 1000);
    _teken = setInterval(tekenAlles, TEKEN_MS);
    try {
      let n = 0; _beurten.forEach(function (b) { n += b.pids.length; });
      log('\uD83D\uDD04 Rondgang gestart \u2014 ' + _beurten.length + ' schermen, ' + n +
          ' sensoren, ' + (INTERVAL_MS / 1000) + 's per scherm', 'ok');
    } catch (e) {}
    volgende(1);
    return true;
  }

  function stop(herstel) {
    if (!_aan) return;
    _aan = false;
    if (_timer) { clearTimeout(_timer);  _timer = null; }
    if (_tick)  { clearInterval(_tick);  _tick = null; }
    if (_teken) { clearInterval(_teken); _teken = null; }
    schermWeg();
    if (herstel !== false && _vorigeActieve) {
      const nieuw = new Set(_vorigeActieve);
      const verdwenen = [...activePIDs].filter(function (p) { return !nieuw.has(p); });
      activePIDs = nieuw;
      verdwenen.forEach(function (p) {
        try { delete pidVals[p]; delete _pidLastUpd[p]; delete _pidLastUpdPause[p]; } catch (e) {}
      });
      try { buildPIDList(document.getElementById('psrch')?.value || ''); } catch (e) {}
      try { document.getElementById('pidCnt').textContent = activePIDs.size; } catch (e) {}
    }
    // Hier wél: het raster is weer zichtbaar en moet kloppen.
    try { renderGauges(); rebuildGSel(); } catch (e) {}
    _vorigeActieve = null;
    try { log('\uD83D\uDD04 Rondgang gestopt \u2014 vorige selectie hersteld', 'info'); } catch (e) {}
  }

  /* ═══════════════════ INHAKEN ═══════════════════ */

  const _orig = window.setPidView;
  window.setPidView = function (mode) {
    if (mode === 'rondgang') {
      try { if (typeof _orig === 'function') _orig('full'); } catch (e) {}
      // 'rondgang' bewust NIET bewaren: het is een sessiestand die een
      // levende verbinding nodig heeft. Anders begint de app bij de
      // volgende start uit zichzelf sensoren aan en uit te zetten.
      try { localStorage.setItem('pl_pidview', 'full'); } catch (e) {}
      const gelukt = start();
      document.querySelectorAll('.pidview-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mode === (gelukt ? 'rondgang' : 'full'));
      });
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

  // Terugknop van de telefoon sluit het volle scherm i.p.v. de app.
  try {
    window.addEventListener('popstate', function () {
      if (_aan) { try { setPidView('full'); } catch (e) { stop(); } }
    });
  } catch (e) {}

  window.PLRondgang = {
    start: start, stop: stop, volgende: volgende,
    actief: function () { return _aan; },
    beurten: function () { return _beurten.map(function (b) { return { label: b.label, n: b.pids.length }; }); },
    _bouwBeurten: bouwBeurten,
    _punten: punten
  };
})();
