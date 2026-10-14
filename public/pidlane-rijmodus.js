// ══════════════════════════════════════════════════════════════════
// pidlane-rijmodus.js — PLRijmodus: rijden met PidLane naast de kaart
// ──────────────────────────────────────────────────────────────────
// HET GEBRUIKSGEVAL. Android split-screen: Google Maps boven of links,
// PidLane in de andere helft. Op 17-09-2026 gemeten (zie pidlane-pip.js):
// in split-screen blijft de WebView zichtbaar en loopt de meetlus door —
// 99 s, nul gaten. Het meten werkt dus al; wat ontbreekt is een scherm dat
// in een half venster en met één blik te lezen is.
//
// WAT DEZE MODULE DOET.
//   1. Het venster opmeten (geen UA-sniffing) en kiezen: 'rij' of 'normaal'.
//      Met hysterese: een half venster waarvan de deler een paar pixel
//      versleept wordt, mag niet heen en weer klapperen.
//   2. Pas naar de rij-weergave als er ook iets te tonen is: klein venster
//      ÉN verbonden. Een klein venster zonder adapter is gewoon de app, klein.
//   3. Vier tegels — koelwater, toerental, accu, status — uit pidVals,
//      pidHist en PLMon.prev. Nooit zelf de bus op.
//   4. Eén banner bovenaan met de laatste luide melding uit PLMon/PLWatch.
//      Geen modals, geen knoppen die je tijdens het rijden nodig hebt.
//   5. Het scherm aan houden zolang de rij-weergave staat én er een
//      verbinding is.
//
// KLEUR BETEKENT IETS, EN ALLEEN DAT. Neutraal is normaal. Oranje is buiten
// PID_LET_OP (laag 1b: opvallend maar echt), rood is daar ruim buiten. Buiten
// PID_HARD_LIMITS is géén rood: dat is laag 1, een meetfout, en die krijgt
// grijs met een vraagteken. Een sensor die vastloopt mag de bestuurder niet
// laten schrikken. En een waarde die niet meer ververst wordt grijs: een
// oud getal als actueel tonen is precies wat #228 bij PiP moest voorkomen.
//
// HERTEKENEN ALLEEN BIJ VERANDERING. Elke tegel onthoudt zijn laatste tekst
// en klasse en schrijft pas als die verschillen. De waakronde verving ooit de
// hele DOM per seconde; dat gebeurt hier niet.
//
// GEEN EIGEN KLOK VOOR DE WAARDEN. De hartslag is updPID (zelfde haak als
// PiP). Alleen de ouderdom van een waarde heeft een tik van 1 s nodig — want
// juist als er niets binnenkomt moet de tegel grijs worden — en die tik
// loopt alleen zolang de rij-weergave staat.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SLEUTEL = 'pl_rijmodus';            // 'auto' | 'aan' | 'uit'
  var STANDEN = ['auto', 'aan', 'uit'];
  // w is 340 en niet 420: een Pixel of Galaxy is in vol portret 393-412 CSS-px
  // breed. Met 420 ging elke telefoon op vol scherm al in rijmodus. De split
  // zelf vangt h; w vangt alleen een smal vrij venster.
  var GRENS = { h: 480, w: 340, marge: 24 };
  var OUD_MS = 5000;                      // waarde ouder dan dit = grijs
  var BANNER_MS = 30000;                  // hoe lang een melding blijft staan
  var ROOD_FRACTIE = 0.1;                 // >10% van de LET_OP-band erbuiten = rood

  var TEGELS = [
    { id: 'koel', pid: '0105', label: 'koelwater', eenheid: '°C', cijfers: 0 },
    { id: 'rpm',  pid: '010C', label: 'toerental', eenheid: 'tpm', cijfers: 0 },
    { id: 'accu', pid: '0142', label: 'accu',      eenheid: 'V',   cijfers: 1 }
  ];

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('Rijmodus: melding niet in de app-log gezet', e); }
  }

  // ── Zuivere functies (getoetst in test-rijmodus.js) ───────────────

  /* Het venster in CSS-pixels → 'rij' of 'normaal'. Portret-split op een
     telefoon is ~410x430, landschap-split ~430x390: allebei lager dan 480.
     Vol portret (~410x870) is normaal. Terug naar 'normaal' pas als het venster `marge` pixels
     over de grens is, zodat slepen aan de deler niet klappert. */
  function kiesModus(w, h, vorige) {
    if (!(w > 0) || !(h > 0)) return vorige === 'rij' ? 'rij' : 'normaal';
    if (h < GRENS.h || w < GRENS.w) return 'rij';
    if (vorige === 'rij' && (h < GRENS.h + GRENS.marge || w < GRENS.w + GRENS.marge)) return 'rij';
    return 'normaal';
  }

  /* Het besluit uit alle feiten. Volgorde is de rangorde. */
  function besluit(f) {
    f = f || {};
    if (f.inPip) return { modus: 'normaal', reden: 'PiP heeft een eigen venster' };
    if (f.stand === 'uit') return { modus: 'normaal', reden: 'handmatig uit' };
    if (f.sessieUit) return { modus: 'normaal', reden: 'weggetikt tot de volgende verbinding' };
    if (f.stand === 'aan') return { modus: 'rij', reden: 'handmatig aan' };
    if (f.venster !== 'rij') return { modus: 'normaal', reden: 'venster groot genoeg' };
    if (!f.verbonden) return { modus: 'normaal', reden: 'klein venster, maar niet verbonden' };
    return { modus: 'rij', reden: 'klein venster en verbonden' };
  }

  function normStand(s) { return STANDEN.indexOf(s) >= 0 ? s : 'auto'; }
  function volgendeStand(s) { return STANDEN[(STANDEN.indexOf(normStand(s)) + 1) % STANDEN.length]; }

  /* Kleurklasse van één meting. Leest de tabellen bij elke aanroep, zodat
     een bijgestelde drempel in pidlane-data.js meteen hier geldt. */
  function klasse(pid, v, ouderdomMs) {
    if (v === null || v === undefined || typeof v !== 'number' || isNaN(v)) return 'leeg';
    var hard = (typeof PID_HARD_LIMITS !== 'undefined' && PID_HARD_LIMITS) ? PID_HARD_LIMITS[pid] : null;
    if (hard && (v < hard.min || v > hard.max)) return 'meetfout';
    if (typeof ouderdomMs === 'number' && ouderdomMs > OUD_MS) return 'oud';
    var lo = (typeof PID_LET_OP !== 'undefined' && PID_LET_OP) ? PID_LET_OP[pid] : null;
    if (!lo) return 'ok';
    var buiten = v > lo.max ? v - lo.max : (v < lo.min ? lo.min - v : 0);
    if (buiten <= 0) return 'ok';
    return buiten >= ROOD_FRACTIE * (lo.max - lo.min) ? 'alarm' : 'letop';
  }

  /* De statustegel: MIL en het aantal opgeslagen codes. PLMon leest die al
     elke 20 s (0101); anders wat er bij het uitlezen gevonden is. */
  function statusStaat(mil, aantal) {
    if (mil === true) return { tekst: (aantal > 0 ? aantal + ' DTC' : 'MIL'), klasse: 'alarm' };
    if (typeof aantal !== 'number' || isNaN(aantal)) return { tekst: '—', klasse: 'leeg' };
    if (aantal > 0) return { tekst: aantal + ' DTC', klasse: 'letop' };
    return { tekst: 'OK', klasse: 'ok' };
  }

  // ── Toestand ───────────────────────────────────────────────────────
  var _venster = 'normaal';
  var _sessieUit = false;
  var _laatste = { modus: 'normaal', reden: 'nog niet bepaald' };
  var _el = null;                 // #rijModus
  var _cache = {};                // tegel-id → 'tekst|klasse'
  var _schrijf = 0;               // aantal DOM-schrijfacties (voor de toets)
  var _banner = null;             // { tekst, t }
  var _tik = null;
  var _rafGepland = false;
  var _wake = null;               // WakeLockSentinel, of 'plugin'
  var _wakeOnbeschikbaarGemeld = false;
  var _wakeNodig = false;         // wat het laatste besluit vroeg — een late belofte toetst hierop

  function stand() {
    try { return normStand(localStorage.getItem(SLEUTEL)); }
    catch (e) { console.warn('Rijmodus: stand niet gelezen', e); return 'auto'; }
  }
  function zetStand(s) {
    s = normStand(s);
    try { localStorage.setItem(SLEUTEL, s); }
    catch (e) { console.warn('Rijmodus: stand niet bewaard', e); }
    if (s !== 'uit') _sessieUit = false;
    _menuLabel();
    toepassen();
    return s;
  }
  function wissel() { return zetStand(volgendeStand(stand())); }

  function _verbonden() {
    try { return typeof connected !== 'undefined' && !!connected; }
    catch (e) { console.warn('Rijmodus: verbinding niet gelezen', e); return false; }
  }
  function _inPip() {
    try { return !!(document.body && document.body.classList && document.body.classList.contains('pl-pip')); }
    catch (e) { console.warn('Rijmodus: PiP-stand niet gelezen', e); return false; }
  }

  function feiten() {
    return { stand: stand(), venster: _venster, verbonden: _verbonden(), inPip: _inPip(), sessieUit: _sessieUit };
  }

  // ── De weergave ────────────────────────────────────────────────────
  function _maak() {
    if (_el) return _el;
    if (typeof document === 'undefined' || !document.body) return null;
    var d = document.createElement('div');
    d.id = 'rijModus';
    d.setAttribute('aria-live', 'polite');
    var h = '<div class="rij-banner" id="rijBanner" hidden></div><div class="rij-tegels">';
    TEGELS.forEach(function (t) {
      h += '<div class="rij-tegel" id="rijT_' + t.id + '" data-k="leeg"><b id="rijV_' + t.id + '">—</b>' +
        '<span>' + t.label + ' · ' + t.eenheid + '</span></div>';
    });
    h += '<div class="rij-tegel" id="rijT_status" data-k="leeg"><b id="rijV_status">—</b><span>motorstatus</span></div>' +
      '</div><button type="button" class="rij-uit" id="rijUit">volledige app ›</button>';
    d.innerHTML = h;
    document.body.appendChild(d);
    var uit = document.getElementById('rijUit');
    if (uit) uit.onclick = function () { _sessieUit = true; toepassen(); };
    _el = d;
    _cache = {};
    return d;
  }

  /* Schrijft alleen als tekst of klasse anders is dan de vorige keer. */
  function _zet(id, tekst, kl) {
    var sleutel = tekst + '|' + kl;
    if (_cache[id] === sleutel) return false;
    var v = document.getElementById('rijV_' + id), t = document.getElementById('rijT_' + id);
    if (!v || !t) return false;
    _cache[id] = sleutel;
    v.textContent = tekst;
    t.setAttribute('data-k', kl);
    _schrijf++;
    return true;
  }

  function _ouderdom(pid, nu) {
    try {
      var h = (typeof pidHist !== 'undefined' && pidHist) ? pidHist[pid] : null;
      var laatste = h && h.length ? h[h.length - 1] : null;
      return laatste && typeof laatste.t === 'number' ? nu - laatste.t : null;
    } catch (e) { console.warn('Rijmodus: ouderdom niet gelezen', e); return null; }
  }

  function tegelStaat(t, nu) {
    var v = (typeof pidVals !== 'undefined' && pidVals) ? pidVals[t.pid] : undefined;
    var k = klasse(t.pid, v, _ouderdom(t.pid, nu));
    if (k === 'leeg') return { tekst: '—', klasse: k };
    var tekst = Number(v).toFixed(t.cijfers);
    if (k === 'meetfout') tekst = '?';
    return { tekst: tekst, klasse: k };
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

  function ververs() {
    _rafGepland = false;
    if (_laatste.modus !== 'rij' || !_maak()) return;
    var nu = Date.now();
    TEGELS.forEach(function (t) { var s = tegelStaat(t, nu); _zet(t.id, s.tekst, s.klasse); });
    var st = _status(); _zet('status', st.tekst, st.klasse);
    var b = document.getElementById('rijBanner');
    if (b) {
      var tonen = _banner && nu - _banner.t < BANNER_MS ? _banner.tekst : '';
      if (b.textContent !== tonen) { b.textContent = tonen; b.hidden = !tonen; _schrijf++; }
    }
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
    try { if (document.body) document.body.setAttribute('data-modus', b.modus); }
    catch (e) { console.warn('Rijmodus: data-modus niet gezet', e); }
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
    try {
      var w = window.innerWidth, h = window.innerHeight;
      _venster = kiesModus(w, h, _venster);
    } catch (e) { console.warn('Rijmodus: venster niet gemeten', e); }
    return toepassen();
  }

  function _menuLabel() {
    try {
      var el = document.getElementById('kbRijStand');
      if (el) el.textContent = stand();
    } catch (e) { console.warn('Rijmodus: menulabel niet bijgewerkt', e); }
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
    } else console.warn('Rijmodus: updPID ontbreekt — de tegels volgen alleen de tik van 1 s');
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
    } else console.warn('Rijmodus: setConn ontbreekt — de modus volgt de verbinding niet');
  } catch (e) { console.warn('Rijmodus: kon setConn niet volgen', e); }

  /* De laatste luide melding van PLMon (en dus PLWatch) wordt de banner.
     Alleen meldLuid: wat PLMon zelf niet luid vindt, hoort niet in beeld. */
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
    kiesModus: kiesModus, besluit: besluit, klasse: klasse, statusStaat: statusStaat,
    volgendeStand: volgendeStand, tegelStaat: tegelStaat,
    stand: stand, zetStand: zetStand, wissel: wissel, meet: meet, toepassen: toepassen, ververs: ververs,
    melding: function (tekst) { _banner = { tekst: String(tekst), t: Date.now() }; _plan(); },
    nu: function () { return Object.assign({ schrijfacties: _schrijf, wake: _wake ? (_wake === 'plugin' ? 'plugin' : 'wakelock') : null }, _laatste); },
    GRENS: GRENS, OUD_MS: OUD_MS, TEGELS: TEGELS
  };
})();
