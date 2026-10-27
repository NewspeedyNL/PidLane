/* ══════════════════════════════════════════════════════════════════
   pidlane-opstart.js — PLOpstart: instappen, starten, de rest gaat vanzelf
   ──────────────────────────────────────────────────────────────────
   (27-10-2026) De klant stapt in, start de auto, tikt op PidLane — of
   PidLane opent zelf, als de wekker aan staat — en de rest gaat vanzelf:
   inloggen, verbinden, de check, door naar Live.

   OPSTART OF HERLAAD. Een automatische verbinding na een herlaad (Android
   schoot de WebView af, de app kwam terug uit de achtergrond) liep tot nu
   als hervatting: geen vragen, geen check — de klant zat midden in een rit.
   Maar dezelfde weg werd ook gelopen als de app 's ochtends opnieuw opent,
   en dan hoort er wél een check bij. Het verschil is de tijd sinds de motor
   voor het laatst liep (`pl_laatst_actief`, elke TIK_MS bijgewerkt zolang
   010C vers boven nul staat): langer dan OPSTART_MS — dezelfde 15 minuten
   als de ritgrens in PLGarage — dan is het een nieuwe start (`reden()`).

   Wat een opstart anders doet dan een hervatting (in pidlane-bt.js):
     • geen kentekenvraag en ook geen vorig kenteken: dat kan een andere
       auto zijn. Het kenteken komt uit het voertuigprofiel van deze VIN
       (`kentekenUitProfiel()`), anders vraagt `vraagKenteken()` het ná de
       check, in stilstand;
     • de brandstofpoort vraagt niets;
     • geen protocol herkend: tot HERHAAL_MS stil opnieuw zoeken
       (`herhaalMag()`) in plaats van na één keer te vragen;
     • daarna `PLNav.naVerbinding({ opstart: true })`: de check één keer per
       auto per dag (`checkNodig()`), en bij een schone auto door naar Live,
       ook in de garagemodus.

   DE WEKKER. `wekker()` opent een blad om één Bluetooth-apparaat als
   bijbehorend apparaat te koppelen (native PLWekkerPlugin). Android opent de
   app dan als dat apparaat verschijnt. Een klassieke SPP-adapter verschijnt
   nooit vanzelf; de handsfree van de auto wel. Vandaar de uitleg in het blad.

   PUUR: soort, reden, dag, checkNodig, markeer, herhaalMag,
   kentekenUitProfiel, wekkerTekst. Getoetst in test-opstart.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSTART_MS = 15 * 60 * 1000;
  var TIK_MS = 10000;
  var VERS_MS = 15000;
  var HERHAAL_MS = 60000;
  var HERHAAL_STAP_MS = 5000;
  var MAX_AUTOS = 20;
  var OPSLAG = { actief: 'pl_laatst_actief', dag: 'pl_check_dag' };

  // ── puur ─────────────────────────────────────────────────────────
  function soort(nu, laatst) {
    var l = Number(laatst);
    if (!isFinite(l) || l <= 0) return 'opstart';
    return (nu - l) > OPSTART_MS ? 'opstart' : 'herlaad';
  }
  /* Een dode socket is altijd een hervatting: de verbinding viel midden in
     een sessie weg. De andere redenen worden een opstart als de motor lang
     niet liep. */
  function reden(ruw, nu, laatst) {
    if (ruw === 'dode socket') return ruw;
    return soort(nu, laatst) === 'opstart' ? 'opstart' : ruw;
  }
  function twee(n) { return (n < 10 ? '0' : '') + n; }
  function dag(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate());
  }
  function autoSleutel(vin) {
    var v = String(vin || '').toUpperCase();
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : 'onbekend';
  }
  function checkNodig(kaart, sleutel, vandaag) {
    return !(kaart && kaart[sleutel] === vandaag);
  }
  // Nieuwe kaart terug, de oudste dagen eruit boven MAX_AUTOS.
  function markeer(kaart, sleutel, vandaag) {
    var uit = {};
    var paren = Object.keys(kaart || {}).filter(function (k) { return k !== sleutel; })
      .map(function (k) { return [k, String(kaart[k])]; })
      .sort(function (a, b) { return a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0; })
      .slice(0, MAX_AUTOS - 1);
    paren.forEach(function (p) { uit[p[0]] = p[1]; });
    uit[sleutel] = vandaag;
    return uit;
  }
  function herhaalMag(start, nu) {
    return isFinite(start) && start > 0 && (nu - start) < HERHAAL_MS;
  }
  function kentekenUitProfiel(prof) {
    var k = String((prof && prof.kenteken) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return k.length >= 4 ? k : '';
  }
  /* Wat het blad zegt, uit de staat van de plugin. */
  function wekkerTekst(st) {
    if (!st || !st.beschikbaar) return { kan: false, regel: 'Deze versie van de app kan nog niet gewekt worden. Werk de app bij via de Play Store.' };
    if (!st.ondersteund) return { kan: false, regel: 'Dit toestel kan dat niet: daarvoor is Android 12 of nieuwer nodig.' };
    var n = (st.gekoppeld || []).length;
    if (!n) return { kan: true, aan: false, regel: 'Nog niets gekoppeld.' };
    return { kan: true, aan: !!st.aan, regel: st.aan ? 'Aan — PidLane opent als je auto start.' : 'Gekoppeld, maar uitgezet.' };
  }

  // ── opslag ───────────────────────────────────────────────────────
  function lees(k) {
    try { return localStorage.getItem(k); }
    catch (e) { console.warn('PLOpstart: opslag niet leesbaar (' + k + ')', e); return null; }
  }
  function schrijf(k, v) {
    try { localStorage.setItem(k, v); }
    catch (e) { console.warn('PLOpstart: opslag niet schrijfbaar (' + k + ')', e); }
  }
  function kaart() {
    try { return JSON.parse(lees(OPSLAG.dag) || '{}') || {}; }
    catch (e) { console.warn('PLOpstart: dagkaart onleesbaar — opnieuw begonnen', e); return {}; }
  }
  function vin() {
    try { return (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo.vin : ''; }
    catch (e) { console.warn('PLOpstart: voertuig onbekend', e); return ''; }
  }

  // ── niet puur ────────────────────────────────────────────────────
  function redenNu(ruw) { return reden(ruw, Date.now(), lees(OPSLAG.actief)); }

  function checkVandaag() { return !checkNodig(kaart(), autoSleutel(vin()), dag(Date.now())); }
  function checkGedaan() { schrijf(OPSLAG.dag, JSON.stringify(markeer(kaart(), autoSleutel(vin()), dag(Date.now())))); }
  function checkVergeten() { schrijf(OPSLAG.dag, '{}'); }

  function motorLoopt(nu) {
    try {
      var v = (typeof pidVals !== 'undefined' && pidVals) ? Number(pidVals['010C']) : 0;
      var t = (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) ? (_pidLastUpd['010C'] || 0) : 0;
      return v > 0 && (nu - t) < VERS_MS;
    } catch (e) { console.warn('PLOpstart: toerental niet te lezen', e); return false; }
  }
  function tik() {
    var nu = Date.now();
    var verbonden = false;
    try { verbonden = typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); }
    catch (e) { console.warn('PLOpstart: verbinding onbekend', e); }
    if (verbonden && motorLoopt(nu)) schrijf(OPSLAG.actief, String(nu));
  }

  /* Het kenteken bij een opstart: uit het profiel van deze VIN, en anders
     ná de check vragen — nooit tijdens het rijden. */
  var _vraagOpen = false;
  function naVin(v) {
    var prof = null;
    try { prof = JSON.parse(lees('pl_vinprof_' + String(v || '').toUpperCase()) || 'null'); }
    catch (e) { console.warn('PLOpstart: profiel onleesbaar', e); }
    var k = kentekenUitProfiel(prof);
    if (k && typeof rdwLookup === 'function') {
      try { btDiag('Opstart: kenteken uit het voertuigprofiel van deze VIN', 'info'); } catch (e) { console.warn(e); }
      return Promise.resolve(rdwLookup(false, { kenteken: k })).then(function (r) { return !!(r && r.ok); },
        function (e) { console.warn('PLOpstart: RDW-opzoeking uit profiel mislukt', e); return false; });
    }
    window._plKentNaCheck = true;
    return Promise.resolve(false);
  }
  function stilstand() {
    try {
      var s = (typeof pidVals !== 'undefined' && pidVals) ? Number(pidVals['010D']) : 0;
      return !(s > 2);
    } catch (e) { console.warn('PLOpstart: snelheid niet te lezen', e); return true; }
  }
  function checkOpen() {
    var ov = document.getElementById('plFcOv');
    return !!ov && ov.style.display !== 'none';
  }
  // Wacht tot de check dicht is en de auto stilstaat; hoogstens tien minuten.
  function kentekenLater() {
    if (!window._plKentNaCheck || _vraagOpen) return;
    var tot = Date.now() + 10 * 60 * 1000;
    var kijk = function () {
      if (!window._plKentNaCheck) return;
      if (Date.now() > tot) { window._plKentNaCheck = false; return; }
      if (checkOpen() || !stilstand()) { setTimeout(kijk, 3000); return; }
      vraagKenteken();
    };
    setTimeout(kijk, 1500);
  }
  function vraagKenteken() {
    window._plKentNaCheck = false;
    if (_vraagOpen) return;
    _vraagOpen = true;
    var ov = document.createElement('div');
    ov.id = 'plOpKent';
    ov.className = 'pl-opk';
    ov.innerHTML = '<div class="pl-opk-doos" role="dialog" aria-labelledby="plOpKentT">' +
      '<div class="pl-opk-t" id="plOpKentT">Welke auto is dit?</div>' +
      '<div class="pl-opk-s">PidLane herkent deze auto nog niet. Met het kenteken haalt hij merk, model en brandstof bij de RDW op; de volgende keer weet hij het vanzelf.</div>' +
      '<input id="plOpKentIn" placeholder="Kenteken" maxlength="8" autocomplete="off">' +
      '<div class="pl-opk-st" id="plOpKentSt"></div>' +
      '<button class="pl-opk-ok" id="plOpKentOk" type="button">Opzoeken bij de RDW</button>' +
      '<button class="pl-opk-n" id="plOpKentNee" type="button">Later</button></div>';
    document.body.appendChild(ov);
    var sluit = function () { _vraagOpen = false; try { ov.remove(); } catch (e) { console.warn('PLOpstart: blad niet weg', e); } };
    ov.querySelector('#plOpKentNee').onclick = sluit;
    ov.querySelector('#plOpKentOk').onclick = function () {
      var k = String(ov.querySelector('#plOpKentIn').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      var st = ov.querySelector('#plOpKentSt');
      if (k.length < 4) { st.textContent = 'Voer een geldig kenteken in (minimaal 4 tekens)'; return; }
      if (typeof rdwLookup !== 'function') { st.textContent = 'Opzoeken kan nu niet'; return; }
      Promise.resolve(rdwLookup(false, { kenteken: k, statusEl: st })).then(function (r) {
        if (!(r && r.ok)) return;
        // Het profiel opnieuw bewaren, nu met het kenteken erin.
        try { if (typeof saveVinProfile === 'function' && vin()) saveVinProfile(vin()); }
        catch (e) { console.warn('PLOpstart: profiel niet bijgewerkt', e); }
        sluit();
      }, function (e) { st.textContent = 'Opzoeken mislukt: ' + ((e && e.message) || e); });
    };
    setTimeout(function () { try { ov.querySelector('#plOpKentIn').focus(); } catch (e) { console.warn(e); } }, 50);
  }

  // ── de wekker ────────────────────────────────────────────────────
  function plug() {
    try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PLWekker) || null; }
    catch (e) { console.warn('PLOpstart: Capacitor niet te lezen', e); return null; }
  }
  function wekkerStatus() {
    var p = plug();
    if (!p) return Promise.resolve({ beschikbaar: false });
    return p.status().catch(function (e) { console.warn('PLOpstart: wekkerstatus', e); return { beschikbaar: false }; });
  }
  function tekenWekker(doos, st) {
    var t = wekkerTekst(st);
    var n = (st && st.gekoppeld) ? st.gekoppeld.length : 0;
    var h = '<div class="pl-opk-t">🚗 Open als de auto start</div>' +
      '<div class="pl-opk-s">Koppel één keer een Bluetooth-apparaat dat vanzelf verbindt als je de auto start: ' +
      '<b>de handsfree of het multimediasysteem van je auto</b>. Een adapter werkt alleen als hij Bluetooth Low Energy (BLE) gebruikt; ' +
      'een gewone Bluetooth-adapter meldt zich niet vanzelf. Android toont zijn eigen keuzelijst.</div>' +
      '<div class="pl-opk-st">' + t.regel + '</div>';
    if (t.kan) {
      h += '<button class="pl-opk-ok" type="button" data-w="koppel">' + (n ? 'Ander apparaat kiezen' : 'Apparaat kiezen') + '</button>';
      if (n) h += '<button class="pl-opk-n" type="button" data-w="' + (t.aan ? 'uit' : 'aan') + '">' + (t.aan ? 'Uitzetten' : 'Weer aanzetten') + '</button>' +
        '<button class="pl-opk-n" type="button" data-w="los">Ontkoppelen</button>';
    }
    h += '<button class="pl-opk-n" type="button" data-w="dicht">Sluiten</button>';
    doos.innerHTML = h;
  }
  function wekker() {
    var ov = document.getElementById('plOpWek');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'plOpWek';
      ov.className = 'pl-opk';
      ov.innerHTML = '<div class="pl-opk-doos" role="dialog"></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        var w = e.target && e.target.getAttribute && e.target.getAttribute('data-w');
        if (e.target === ov || w === 'dicht') { ov.style.display = 'none'; return; }
        if (w) doeWekker(w, ov.firstChild);
      });
    }
    ov.style.display = 'flex';
    var doos = ov.firstChild;
    doos.innerHTML = '<div class="pl-opk-s">Even kijken…</div>';
    return wekkerStatus().then(function (st) { tekenWekker(doos, st); return st; });
  }
  function doeWekker(w, doos) {
    var p = plug();
    if (!p) return;
    var stap = w === 'koppel' ? p.koppel() : w === 'los' ? p.ontkoppel() : p.zet({ aan: w === 'aan' });
    try { if (typeof logUsage === 'function') logUsage('wekker', w); } catch (e) { console.warn(e); }
    return stap.then(function (r) {
      if (r && r.ok === false && r.reden && typeof showToast === 'function') showToast('Wekker: ' + r.reden);
      return wekkerStatus().then(function (st) { tekenWekker(doos, st); });
    }, function (e) {
      console.warn('PLOpstart: wekker ' + w, e);
      if (typeof showToast === 'function') showToast('Wekker: ' + ((e && e.message) || e));
    });
  }

  if (typeof setInterval === 'function') setInterval(function () {
    try { tik(); } catch (e) { console.warn('PLOpstart: tik mislukt', e); }
  }, TIK_MS);

  window.PLOpstart = {
    reden: redenNu,
    checkVandaag: checkVandaag,
    checkGedaan: checkGedaan,
    checkVergeten: checkVergeten,
    herhaalMag: function (start) { return herhaalMag(start, Date.now()); },
    HERHAAL_STAP_MS: HERHAAL_STAP_MS,
    naVin: naVin,
    kentekenLater: kentekenLater,
    vraagKenteken: vraagKenteken,
    wekker: wekker,
    tik: tik,
    _kern: { soort: soort, reden: reden, dag: dag, autoSleutel: autoSleutel, checkNodig: checkNodig, markeer: markeer,
      herhaalMag: herhaalMag, kentekenUitProfiel: kentekenUitProfiel, wekkerTekst: wekkerTekst,
      OPSTART_MS: OPSTART_MS, HERHAAL_MS: HERHAAL_MS }
  };
})();
