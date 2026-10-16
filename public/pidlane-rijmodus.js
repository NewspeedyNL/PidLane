// ══════════════════════════════════════════════════════════════════
// pidlane-rijmodus.js — PLRijmodus: het advies van de monitor in beeld
// ──────────────────────────────────────────────────────────────────
// HET GEBRUIKSGEVAL. Android split-screen: Google Maps in de ene helft,
// PidLane in de andere. In split-screen blijft de WebView zichtbaar en loopt
// de meetlus door (17-09-2026, zie pidlane-pip.js). Wat ontbrak is een
// scherm dat in een half venster met één blik te lezen is.
//
// EEN KEUZE, GEEN AUTOMAAT (14-10-2026, op verzoek). De rijmodus staat
// standaard UIT en gaat alleen aan via Meer → Mijn voorkeuren → 🚗 Rijmodus.
// De app raadt niet uit de vensterafmeting of hij "zou moeten": dat raden gaf
// een vol scherm op een smalle telefoon al de rijweergave.
//
// WAT ER STAAT, VAN BOVEN NAAR BENEDEN.
//   1. Eén banner met de laatste luide melding van PLMon/PLWatch.
//   2. Een smalle strook: koelwater, toerental, accu als balkje met waarde,
//      en een statusstip (MIL/DTC). Geen grote getallen meer: die namen op
//      het toestel een derde van het scherm in en zeiden niets nieuws.
//   3. De rest van de ruimte is voor het ADVIES van de actieve monitor, als
//      beeld in plaats van tekst:
//        Caravan-monitor  radertje met ↑/↓/✓ (schakelen), snelheidsboog met
//                         het doelstreepje, verbruiksbalk tegen de richtwaarde,
//                         terrein, en de laatste tip van de coach.
//        Rit-monitor      één stip per test (grijs = nog niet aan bod, groen
//                         = getoetst, oranje = melding), de rijfase en de
//                         telling. n.v.t. ≠ geslaagd, net als in het rapport.
//      Draait er geen monitor, dan zegt het paneel dat — en hoe je er een
//      start. Er worden geen knoppen verwacht tijdens het rijden.
//
// KLEUR BETEKENT IETS, EN ALLEEN DAT. Neutraal is normaal. Oranje is buiten
// PID_LET_OP, rood is daar ruim buiten. Buiten PID_HARD_LIMITS is geen rood
// maar grijs met '?': dat is een meetfout. Een waarde die niet meer ververst
// wordt grijs. Het schakel- en verbruiksoordeel komt uit pidlane-caravan.js
// zelf (caravanSchakelAdvies, caravanVerbruikNiveau): één bron.
//
// HERTEKENEN ALLEEN BIJ VERANDERING. Elke tekst, elk attribuut en elke
// breedte onthoudt zijn laatste waarde en schrijft pas als die verschilt.
// De hartslag is updPID en caravanRenderLive; een tik van 1 s loopt alleen
// zolang de rijweergave staat, voor de ouderdom en de testdekking.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SLEUTEL = 'pl_rijmodus';            // 'aan' | 'uit' (standaard uit)
  // De vorm volgt de ruimte (compact = half scherm), niet de aan/uit-keuze.
  // w is 340 en niet 420: een telefoon is in vol portret 393-412 CSS-px breed.
  var GRENS = { h: 480, w: 340, marge: 24 };
  var OUD_MS = 5000;                      // waarde ouder dan dit = grijs
  var BANNER_MS = 30000;                  // hoe lang een melding blijft staan
  var TIP_MS = 120000;                    // hoe lang een coachtip blijft staan
  var ROOD_FRACTIE = 0.1;                 // >10% van de LET_OP-band erbuiten = rood
  var KMH_MAX = 140;                      // einde van de snelheidsboog

  var STROOK = [
    { id: 'koel', pid: '0105', label: 'koelwater', eenheid: '°', cijfers: 0, schaal: [40, 130] },
    { id: 'rpm',  pid: '010C', label: 'toerental', eenheid: '',  cijfers: 0, schaal: [0, 7000] },
    { id: 'accu', pid: '0142', label: 'accu',      eenheid: 'V', cijfers: 1, schaal: [11, 15.5] }
  ];

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('Rijmodus: melding niet in de app-log gezet', e); }
  }

  // ── Zuivere functies (getoetst in test-rijmodus.js) ───────────────

  /* De vorm van de weergave uit het venster: 'compact' in een half scherm,
     'ruim' daarbuiten. Met hysterese, zodat slepen aan de deler niet
     klappert. Bepaalt alleen de indeling, nooit óf de rijmodus aan staat. */
  function kiesVorm(w, h, vorige) {
    if (!(w > 0) || !(h > 0)) return vorige === 'compact' ? 'compact' : 'ruim';
    if (h < GRENS.h || w < GRENS.w) return 'compact';
    if (vorige === 'compact' && (h < GRENS.h + GRENS.marge || w < GRENS.w + GRENS.marge)) return 'compact';
    return 'ruim';
  }

  function normStand(s) { return s === 'aan' ? 'aan' : 'uit'; }

  /* Het besluit uit alle feiten. Volgorde is de rangorde. */
  function besluit(f) {
    f = f || {};
    if (f.inPip) return { modus: 'normaal', reden: 'PiP heeft een eigen venster' };
    if (normStand(f.stand) !== 'aan') return { modus: 'normaal', reden: 'rijmodus staat uit' };
    if (f.sessieUit) return { modus: 'normaal', reden: 'weggetikt tot de volgende verbinding' };
    return { modus: 'rij', reden: 'rijmodus staat aan' };
  }

  /* Kleurklasse van één meting. Leest de tabellen bij elke aanroep. */
  function klasse(pid, v, ouderdomMs) {
    if (v === null || v === undefined || typeof v !== 'number' || isNaN(v)) return 'leeg';
    var hard = (typeof PID_HARD_LIMITS !== 'undefined' && PID_HARD_LIMITS) ? PID_HARD_LIMITS[pid] : null;
    if (hard && (v < hard.min || v > hard.max)) return 'meetfout';
    if (typeof ouderdomMs === 'number' && ouderdomMs > OUD_MS) return 'oud';
    // Het bereik voor déze auto (PLKenmerk.letOp, #532).
    var lo = window.PLKenmerk ? PLKenmerk.letOpLive(pid) : ((typeof PID_LET_OP !== 'undefined' && PID_LET_OP) ? PID_LET_OP[pid] : null);
    if (!lo) return 'ok';
    var buiten = v > lo.max ? v - lo.max : (v < lo.min ? lo.min - v : 0);
    if (buiten <= 0) return 'ok';
    return buiten >= ROOD_FRACTIE * (lo.max - lo.min) ? 'alarm' : 'letop';
  }

  function statusStaat(mil, aantal) {
    if (mil === true) return { tekst: (aantal > 0 ? aantal + ' DTC' : 'MIL'), klasse: 'alarm' };
    if (typeof aantal !== 'number' || isNaN(aantal)) return { tekst: '—', klasse: 'leeg' };
    if (aantal > 0) return { tekst: aantal + ' DTC', klasse: 'letop' };
    return { tekst: 'OK', klasse: 'ok' };
  }

  /* Waar op een schaal, 0..1. null zonder meting. */
  function fractie(v, min, max) {
    if (typeof v !== 'number' || isNaN(v) || !(max > min)) return null;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  }

  /* Welk paneel de ruimte krijgt. Caravan wint: wie hem start, rijdt ermee. */
  function paneel(f) {
    f = f || {};
    if (f.caravan) return 'caravan';
    if (f.rit) return 'rit';
    return 'geen';
  }

  /* Eén stip per test van PLWatch. Niet gedraaid is iets anders dan goed. */
  function ritStippen(tests, dekking) {
    dekking = dekking || {};
    return (tests || []).map(function (t) {
      var d = dekking[t.id];
      var s = !d || !d.runs ? 'wacht' : (d.hits > 0 ? 'hit' : 'ok');
      return { id: t.id, naam: t.naam || t.id, staat: s };
    });
  }

  /* De snelheidsboog: waar de wijzer staat, waar het doelstreepje staat en
     welke kleur. Boven de ingestelde limiet rood, boven het doel oranje. */
  function snelheidBoog(kmh, doel, limiet) {
    var f = fractie(kmh, 0, KMH_MAX);
    var k = f === null ? 'leeg' : (typeof limiet === 'number' && kmh > limiet) ? 'alarm' : (typeof doel === 'number' && kmh > doel) ? 'letop' : 'ok';
    return { frac: f, doelFrac: fractie(doel, 0, KMH_MAX), klasse: k };
  }

  // ── Toestand ───────────────────────────────────────────────────────
  var _vorm = 'ruim';
  var _sessieUit = false;
  var _laatste = { modus: 'normaal', reden: 'nog niet bepaald' };
  var _el = null;
  var _cache = {};                // 'id|soort' → laatste waarde
  var _schrijf = 0;               // aantal DOM-schrijfacties (voor de toets)
  var _banner = null;             // { tekst, t }
  var _carCtx = null;             // laatste ctx uit caravanRenderLive
  var _stippenSleutel = '';       // welke tests er als stip staan
  var _tik = null;
  var _rafGepland = false;
  var _wake = null;
  var _wakeNodig = false;
  var _wakeOnbeschikbaarGemeld = false;

  function stand() {
    try { return normStand(localStorage.getItem(SLEUTEL)); }
    catch (e) { console.warn('Rijmodus: stand niet gelezen', e); return 'uit'; }
  }
  function zetStand(s) {
    s = normStand(s);
    try { localStorage.setItem(SLEUTEL, s); }
    catch (e) { console.warn('Rijmodus: stand niet bewaard', e); }
    _sessieUit = false;
    _menuLabel();
    meet();
    return s;
  }
  function wissel() { return zetStand(stand() === 'aan' ? 'uit' : 'aan'); }

  function _verbonden() {
    try { return typeof connected !== 'undefined' && !!connected; }
    catch (e) { console.warn('Rijmodus: verbinding niet gelezen', e); return false; }
  }
  function _inPip() {
    try { return !!(document.body && document.body.classList && document.body.classList.contains('pl-pip')); }
    catch (e) { console.warn('Rijmodus: PiP-stand niet gelezen', e); return false; }
  }
  function _caravanAan() {
    try { return typeof caravanActive !== 'undefined' && !!caravanActive; }
    catch (e) { console.warn('Rijmodus: caravanstand niet gelezen', e); return false; }
  }
  function _ritAan() {
    var m = window.PLMon;
    return !!(m && (m.active || m.userAan));
  }

  function feiten() {
    return { stand: stand(), verbonden: _verbonden(), inPip: _inPip(), sessieUit: _sessieUit };
  }

  // ── Schrijven alleen bij verandering ───────────────────────────────
  function _el_(id) { return document.getElementById(id); }
  function _wijzig(id, soort, waarde, doe) {
    var k = id + '|' + soort;
    if (_cache[k] === waarde) return false;
    var el = _el_(id);
    if (!el) return false;
    _cache[k] = waarde;
    doe(el, waarde);
    _schrijf++;
    return true;
  }
  function _tekst(id, t) { return _wijzig(id, 't', String(t), function (el, w) { el.textContent = w; }); }
  function _attr(id, naam, w) { return _wijzig(id, 'a:' + naam, String(w), function (el, v) { el.setAttribute(naam, v); }); }
  function _breedte(id, frac) {
    var w = frac === null ? '0%' : Math.round(frac * 1000) / 10 + '%';
    return _wijzig(id, 'w', w, function (el, v) { el.style.width = v; });
  }

  // ── De weergave ────────────────────────────────────────────────────
  // Het radertje: een cirkel met een gestippelde rand is een tandwiel, en dat
  // kost geen pad van honderd punten.
  var RAD_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle class="rij-tand" cx="50" cy="50" r="38"/><circle class="rij-naaf" cx="50" cy="50" r="27"/>' +
    '<text id="rijRadPijl" x="50" y="62" text-anchor="middle">·</text></svg>';
  // De boog: een halve cirkel met pathLength 100, dus de vulling is gewoon
  // een percentage. Het doelstreepje draait om het middelpunt.
  var BOOG_SVG = '<svg viewBox="0 0 120 72" aria-hidden="true">' +
    '<path class="rij-boog-bg" d="M10 62 A50 50 0 0 1 110 62" pathLength="100"/>' +
    '<path id="rijBoog" class="rij-boog" d="M10 62 A50 50 0 0 1 110 62" pathLength="100" stroke-dasharray="0 100"/>' +
    '<line id="rijDoel" class="rij-doelstreep" x1="60" y1="4" x2="60" y2="20" transform="rotate(0 60 62)"/>' +
    '<text id="rijKmh" x="60" y="60" text-anchor="middle">—</text></svg>';

  function _maak() {
    if (_el) return _el;
    if (typeof document === 'undefined' || !document.body) return null;
    var d = document.createElement('div');
    d.id = 'rijModus';
    d.setAttribute('aria-live', 'polite');
    var h = '<div class="rij-banner" id="rijBanner" hidden></div><div class="rij-strook">';
    STROOK.forEach(function (t) {
      h += '<div class="rij-mini" id="rijT_' + t.id + '" data-k="leeg"><span>' + t.label + '</span>' +
        '<div class="rij-balk"><i id="rijB_' + t.id + '"></i></div><b id="rijV_' + t.id + '">—</b></div>';
    });
    h += '<div class="rij-mini rij-status" id="rijT_status" data-k="leeg"><span>motor</span><i class="rij-stip"></i><b id="rijV_status">—</b></div></div>' +
      '<div class="rij-paneel" id="rijPaneel" data-paneel="geen">' +
        '<section class="rij-p-caravan">' +
          '<div class="rij-rad" id="rijRad" data-advies="leeg">' + RAD_SVG + '<span id="rijRadTekst">schakelen</span></div>' +
          '<div class="rij-meter" id="rijMeter" data-k="leeg">' + BOOG_SVG + '<span>km/u · doel <b id="rijDoelTxt">—</b></span></div>' +
          '<div class="rij-verbruik" id="rijVerbruik" data-k="leeg"><span>verbruik</span>' +
            '<div class="rij-balk groot"><i id="rijB_lkm"></i><em id="rijRicht"></em></div>' +
            '<b><span id="rijV_lkm">—</span> L/100</b></div>' +
          '<div class="rij-terrein" id="rijTerrein" data-t="">—</div>' +
          '<div class="rij-tip" id="rijTip"></div>' +
        '</section>' +
        '<section class="rij-p-rit">' +
          '<div class="rij-fase" id="rijFase">—</div>' +
          '<div class="rij-stippen" id="rijStippen"></div>' +
          '<div class="rij-telling" id="rijTelling">—</div>' +
          '<div class="rij-gezien" id="rijGezien"></div>' +
          '<div class="rij-legenda"><span><i class="ok"></i>getoetst</span><span><i class="hit"></i>iets gezien</span><span><i></i>nog niet aan bod</span></div>' +
        '</section>' +
        '<section class="rij-p-geen"><p>Geen monitor actief</p>' +
          '<p class="rij-klein">Start de Rit-monitor (Live) of de Caravan-monitor. Hun advies verschijnt dan hier, in beeld.</p></section>' +
      '</div>' +
      '<button type="button" class="rij-uit" id="rijUit">volledige app ›</button>';
    d.innerHTML = h;
    document.body.appendChild(d);
    var uit = _el_('rijUit');
    if (uit) uit.onclick = function () { _sessieUit = true; toepassen(); };
    _el = d;
    _cache = {};
    _stippenSleutel = '';
    return d;
  }

  function _ouderdom(pid, nu) {
    try {
      var h = (typeof pidHist !== 'undefined' && pidHist) ? pidHist[pid] : null;
      var laatste = h && h.length ? h[h.length - 1] : null;
      return laatste && typeof laatste.t === 'number' ? nu - laatste.t : null;
    } catch (e) { console.warn('Rijmodus: ouderdom niet gelezen', e); return null; }
  }

  function strookStaat(t, nu) {
    var v = (typeof pidVals !== 'undefined' && pidVals) ? pidVals[t.pid] : undefined;
    var k = klasse(t.pid, v, _ouderdom(t.pid, nu));
    if (k === 'leeg') return { tekst: '—', klasse: k, frac: null };
    if (k === 'meetfout') return { tekst: '?', klasse: k, frac: null };
    return { tekst: Number(v).toFixed(t.cijfers) + t.eenheid, klasse: k, frac: fractie(v, t.schaal[0], t.schaal[1]) };
  }

  function _status() {
    var mil = null, aantal = null;
    try {
      var p = window.PLMon && window.PLMon.prev;
      if (p) { mil = p.mil; aantal = p.count; }
      if ((aantal === null || aantal === undefined) && typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes) && typeof window._dtcFound === 'number')
        aantal = dtcCodes.length;
    } catch (e) { console.warn('Rijmodus: status niet gelezen', e); }
    return statusStaat(mil, aantal);
  }

  var RAD = { terug: { pijl: '↓', tekst: 'schakel terug' }, op: { pijl: '↑', tekst: 'schakel op' }, ok: { pijl: '✓', tekst: 'versnelling goed' } };
  var TERREIN = { klim: '⛰ klim', afdaling: '↘ afdaling', vlak: '— vlak' };

  function _caravanPaneel(nu) {
    var c = _carCtx || {};
    var adv = null;
    try { if (typeof caravanSchakelAdvies === 'function') adv = caravanSchakelAdvies(c); }
    catch (e) { console.warn('Rijmodus: schakeladvies niet gelezen', e); }
    var r = RAD[adv] || { pijl: '·', tekst: 'schakelen: wacht op toerental en belasting' };
    _attr('rijRad', 'data-advies', adv || 'leeg');
    _tekst('rijRadPijl', r.pijl);
    _tekst('rijRadTekst', r.tekst);

    var b = snelheidBoog(c.speed, c.cruiseTarget, c.limit);
    _attr('rijMeter', 'data-k', b.klasse);
    _attr('rijBoog', 'stroke-dasharray', (b.frac === null ? 0 : Math.round(b.frac * 100)) + ' 100');
    _attr('rijDoel', 'transform', 'rotate(' + (b.doelFrac === null ? 0 : Math.round(b.doelFrac * 180 - 90)) + ' 60 62)');
    _tekst('rijKmh', typeof c.speed === 'number' ? Math.round(c.speed) : '—');
    _tekst('rijDoelTxt', typeof c.cruiseTarget === 'number' ? c.cruiseTarget : '—');

    var niveau = null, richt = null;
    try {
      if (typeof caravanVerbruikNiveau === 'function') niveau = caravanVerbruikNiveau(c.lkm, c.fuelType);
      if (typeof caravanRichtverbruik === 'function') richt = caravanRichtverbruik(c.fuelType);
    } catch (e) { console.warn('Rijmodus: verbruiksoordeel niet gelezen', e); }
    var max = richt ? richt * 2 : 30;
    _attr('rijVerbruik', 'data-k', niveau || 'leeg');
    _breedte('rijB_lkm', fractie(c.lkm, 0, max));
    _wijzig('rijRicht', 'l', richt ? '50%' : '0%', function (el, v) { el.style.left = v; });
    _tekst('rijV_lkm', typeof c.lkm === 'number' ? c.lkm.toFixed(1) : '—');

    var ter = TERREIN[c.climb] || '—';
    if (c.terreinBron === 'helling' && typeof c.helling === 'number') ter += ' ' + (c.helling > 0 ? '+' : '') + c.helling.toFixed(1) + '°';
    _attr('rijTerrein', 'data-t', c.climb || '');
    _tekst('rijTerrein', ter);

    var tip = '';
    try {
      var lijst = (typeof caravanCoach !== 'undefined' && Array.isArray(caravanCoach)) ? caravanCoach : [];
      var laatst = lijst[lijst.length - 1];
      if (laatst && nu - laatst.t < TIP_MS) tip = laatst.msg;
    } catch (e) { console.warn('Rijmodus: coachtip niet gelezen', e); }
    _tekst('rijTip', tip);
  }

  function _ritPaneel() {
    var w = window.PLWatch, m = window.PLMon;
    var stippen = ritStippen(w && w.tests, w && w._dekking);
    var sleutel = stippen.map(function (s) { return s.id; }).join(',');
    if (sleutel !== _stippenSleutel) {
      var box = _el_('rijStippen');
      if (box) {
        box.innerHTML = stippen.map(function (s) {
          return '<i id="rijS_' + s.id + '" data-s="wacht" title="' + String(s.naam).replace(/"/g, '') + '"></i>';
        }).join('');
        _stippenSleutel = sleutel;
        Object.keys(_cache).forEach(function (k) { if (k.indexOf('rijS_') === 0) delete _cache[k]; });
        _schrijf++;
      }
    }
    var tel = { ok: 0, hit: 0, wacht: 0 };
    stippen.forEach(function (s) { tel[s.staat]++; _attr('rijS_' + s.id, 'data-s', s.staat); });
    var fase = '—';
    try { if (m && typeof m._state === 'function') fase = m._state().fase; }
    catch (e) { console.warn('Rijmodus: rijfase niet gelezen', e); }
    _tekst('rijFase', fase);
    var meldingen = (m && m._order) ? m._order.length : 0;
    // Het advies zelf: wélke controle iets zag, niet alleen dát.
    _tekst('rijGezien', stippen.filter(function (x) { return x.staat === 'hit'; }).map(function (x) { return x.naam; }).join(' · '));
    _tekst('rijTelling', (tel.ok + tel.hit) + '/' + stippen.length + ' getoetst · ' + meldingen + (meldingen === 1 ? ' melding' : ' meldingen'));
  }

  function ververs() {
    _rafGepland = false;
    if (_laatste.modus !== 'rij' || !_maak()) return;
    var nu = Date.now();
    STROOK.forEach(function (t) {
      var s = strookStaat(t, nu);
      _tekst('rijV_' + t.id, s.tekst);
      _attr('rijT_' + t.id, 'data-k', s.klasse);
      _breedte('rijB_' + t.id, s.frac);
    });
    var st = _status();
    _tekst('rijV_status', st.tekst);
    _attr('rijT_status', 'data-k', st.klasse);

    var p = paneel({ caravan: _caravanAan(), rit: _ritAan() });
    _attr('rijPaneel', 'data-paneel', p);
    if (p === 'caravan') _caravanPaneel(nu);
    else if (p === 'rit') _ritPaneel();

    var tonen = _banner && nu - _banner.t < BANNER_MS ? _banner.tekst : '';
    _wijzig('rijBanner', 'b', tonen, function (el, v) { el.textContent = v; el.hidden = !v; });
  }

  function _plan() {
    if (_rafGepland || _laatste.modus !== 'rij') return;
    _rafGepland = true;
    requestAnimationFrame(ververs);
  }

  // ── Scherm aan ─────────────────────────────────────────────────────
  function _wakeZet(nodig) {
    _wakeNodig = nodig;
    try {
      var c = window.Capacitor, kp = c && c.Plugins && c.Plugins.KeepAwake;
      if (nodig && !_wake) {
        if (kp && typeof kp.keepAwake === 'function') {
          _wake = 'plugin';
          kp.keepAwake().catch(function (e) { _wake = null; console.warn('Rijmodus: KeepAwake geweigerd', e); });
        } else if (typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
          _wake = 'vraagt';
          navigator.wakeLock.request('screen').then(function (s) {
            if (!_wakeNodig) { _wake = null; s.release().catch(function (e) { console.warn('Rijmodus: late scherm-aan niet losgelaten', e); }); return; }
            _wake = s;
            s.addEventListener('release', function () { if (_wake === s) _wake = null; });
          }).catch(function (e) { _wake = null; console.warn('Rijmodus: scherm-aan geweigerd', e); });
        } else if (!_wakeOnbeschikbaarGemeld) {
          _wakeOnbeschikbaarGemeld = true;
          _log('Rijmodus: deze WebView kan het scherm niet aan houden — zet de schermtime-out zelf ruimer', 'warn');
        }
      } else if (!nodig && _wake) {
        var w = _wake; _wake = null;
        if (w === 'vraagt') { /* de belofte ziet _wakeNodig=false en laat zelf los */ }
        else if (w === 'plugin') { if (kp && typeof kp.allowSleep === 'function') kp.allowSleep().catch(function (e) { console.warn('Rijmodus: allowSleep mislukt', e); }); }
        else if (w && typeof w.release === 'function') w.release().catch(function (e) { console.warn('Rijmodus: scherm-aan niet losgelaten', e); });
      }
    } catch (e) { console.warn('Rijmodus: scherm-aan niet gezet', e); }
  }

  // ── Toepassen ──────────────────────────────────────────────────────
  function toepassen() {
    var b = besluit(feiten());
    var was = _laatste.modus;
    _laatste = b;
    try {
      if (document.body) {
        document.body.setAttribute('data-modus', b.modus);
        document.body.setAttribute('data-rijvorm', _vorm);
      }
    } catch (e) { console.warn('Rijmodus: data-modus niet gezet', e); }
    if (b.modus !== was) _log('Rijmodus ' + (b.modus === 'rij' ? 'aan' : 'uit') + ' — ' + b.reden);
    if (b.modus === 'rij') {
      _maak();
      if (!_tik) _tik = setInterval(ververs, 1000);
      ververs();
    } else if (_tik) { clearInterval(_tik); _tik = null; }
    _wakeZet(b.modus === 'rij' && _verbonden());
    return b;
  }

  function meet() {
    try { _vorm = kiesVorm(window.innerWidth, window.innerHeight, _vorm); }
    catch (e) { console.warn('Rijmodus: venster niet gemeten', e); }
    return toepassen();
  }

  function _menuLabel() {
    try {
      var el = _el_('kbRijmodus');
      if (el) el.setAttribute('aria-checked', stand() === 'aan' ? 'true' : 'false');
    } catch (e) { console.warn('Rijmodus: menuschakelaar niet bijgewerkt', e); }
  }

  // ── Haken ──────────────────────────────────────────────────────────
  try {
    if (typeof updPID === 'function') {
      var _u = updPID;
      updPID = function (pid) {
        var r = _u.apply(this, arguments);
        if (_laatste.modus === 'rij' && (pid === '0105' || pid === '010C' || pid === '0142')) _plan();
        return r;
      };
      window.updPID = updPID;
    } else console.warn('Rijmodus: updPID ontbreekt — de strook volgt alleen de tik van 1 s');
  } catch (e) { console.warn('Rijmodus: kon updPID niet volgen', e); }

  try {
    if (typeof setConn === 'function') {
      var _s = setConn;
      setConn = function (on) {
        var r = _s.apply(this, arguments);
        if (on) _sessieUit = false;
        try { toepassen(); } catch (e) { console.warn('Rijmodus: toepassen na setConn mislukt', e); }
        return r;
      };
      window.setConn = setConn;
    } else console.warn('Rijmodus: setConn ontbreekt — scherm-aan volgt de verbinding niet');
  } catch (e) { console.warn('Rijmodus: kon setConn niet volgen', e); }

  /* De caravancoach rekent elke seconde een ctx uit; die lezen we mee waar
     hij toch al langskomt, in plaats van hem na te rekenen. */
  try {
    if (typeof caravanRenderLive === 'function') {
      var _c = caravanRenderLive;
      caravanRenderLive = function (ctx) {
        var r = _c.apply(this, arguments);
        _carCtx = ctx || null;
        _plan();
        return r;
      };
      window.caravanRenderLive = caravanRenderLive;
    } else console.warn('Rijmodus: caravanRenderLive ontbreekt — het caravanpaneel blijft leeg');
  } catch (e) { console.warn('Rijmodus: kon de caravancoach niet volgen', e); }

  /* De laatste luide melding van PLMon (en dus PLWatch) wordt de banner. */
  function _haakMonitor() {
    try {
      var m = window.PLMon;
      if (!m || typeof m._event !== 'function' || m._rijGehaakt) return !!(m && m._rijGehaakt);
      var orig = m._event;
      m._event = function (code, bron, reden, ff, meldLuid) {
        var r = orig.apply(this, arguments);
        if (meldLuid && reden) { _banner = { tekst: String(reden), t: Date.now() }; _plan(); }
        return r;
      };
      m._rijGehaakt = true;
      return true;
    } catch (e) { console.warn('Rijmodus: kon PLMon niet volgen', e); return false; }
  }
  _haakMonitor();

  try {
    var _deb = null;
    window.addEventListener('resize', function () {
      if (_deb) clearTimeout(_deb);
      _deb = setTimeout(function () { _deb = null; meet(); }, 250);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && _laatste.modus === 'rij') { _wake = null; _wakeZet(_verbonden()); }
    });
    document.addEventListener('DOMContentLoaded', function () { _menuLabel(); meet(); });
  } catch (e) { console.warn('Rijmodus: luisteraars niet gezet', e); }

  window.PLRijmodus = {
    kiesVorm: kiesVorm, besluit: besluit, klasse: klasse, statusStaat: statusStaat,
    fractie: fractie, paneel: paneel, ritStippen: ritStippen, snelheidBoog: snelheidBoog,
    strookStaat: strookStaat,
    stand: stand, zetStand: zetStand, wissel: wissel, meet: meet, toepassen: toepassen, ververs: ververs,
    melding: function (tekst) { _banner = { tekst: String(tekst), t: Date.now() }; _plan(); },
    nu: function () { return Object.assign({ vorm: _vorm, schrijfacties: _schrijf, wake: _wake ? (_wake === 'plugin' ? 'plugin' : 'wakelock') : null }, _laatste); },
    GRENS: GRENS, OUD_MS: OUD_MS, STROOK: STROOK
  };
})();
