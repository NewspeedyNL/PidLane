/* ══════════════════════════════════════════════════════════════════
   pidlane-review.js — PLReview: om een beoordeling vragen (14-11-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM. Een app zonder beoordelingen wordt in Google Play niet gevonden.
   Wie tevreden is, denkt er niet uit zichzelf aan; wie boos is wel. Dus
   vragen op een moment dat het goed ging, en verder met rust laten.

   WANNEER (magVragen, puur):
     • alleen in de Android-app (daar staat de Play-pagina een tik verder);
     • na een goed moment: een foutcodelezing zonder codes (PLStrook);
     • pas na VAN_DAGEN dagen gebruik en MIN_VERBINDINGEN verbindingen;
     • hoogstens MAX_KEER keer in totaal, en NA_DAGEN dagen na de vorige keer;
     • nooit meer na "Nee, bedankt" of na "Beoordelen";
     • niet tijdens het rijden, niet onder de verbindstrook of de intro:
       dan wacht hij nog even (WACHT_MS) en anders vraagt hij een volgende keer.
   Nooit na een fout: er is geen enkele aanroep vanuit een foutpad.

   HOE. Een kaart onderin (zoals PLVersie): Beoordelen opent de Play-pagina
   van de app (Capacitor stuurt een adres buiten allowNavigation naar buiten:
   de Play Store), Later, of Nee bedankt. Geen plugin nodig.

   Staat in localStorage pl_review: { eerste, verbindingen, laatst, keer,
   klaar }. PUUR (_kern): magVragen, nieuweStaat. Getoetst in test-review.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SLEUTEL = 'pl_review';
  var DAG = 86400000;
  var VAN_DAGEN = 3, MIN_VERBINDINGEN = 3, MAX_KEER = 3, NA_DAGEN = 60;
  var WACHT_MS = 120000, TIK_MS = 3000, KMH_STIL = 2;
  var PLAY = 'https://play.google.com/store/apps/details?id=nl.pidlane.app';

  // ── puur ─────────────────────────────────────────────────────────
  function nieuweStaat(nu) { return { eerste: nu, verbindingen: 0, laatst: 0, keer: 0, klaar: false }; }
  function magVragen(st, nu) {
    if (!st || st.klaar) return false;
    if ((st.keer || 0) >= MAX_KEER) return false;
    if (nu - (st.eerste || nu) < VAN_DAGEN * DAG) return false;
    if ((st.verbindingen || 0) < MIN_VERBINDINGEN) return false;
    if (st.laatst && nu - st.laatst < NA_DAGEN * DAG) return false;
    return true;
  }
  /* Mag de kaart nú in beeld, of even wachten? o = { rijdt, strook, intro } */
  function rustigMoment(o) { return !!o && !o.rijdt && !o.strook && !o.intro; }

  // ── omgeving ─────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function android() {
    try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && (!Capacitor.getPlatform || Capacitor.getPlatform() === 'android')); }
    catch (e) { console.warn('PLReview: platform niet te lezen', e); return false; }
  }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLReview: demoMode niet te lezen', e); return false; } }
  function lees() {
    try { var o = JSON.parse(localStorage.getItem(SLEUTEL) || 'null'); return o && typeof o === 'object' ? o : nieuweStaat(Date.now()); }
    catch (e) { console.warn('PLReview: staat niet te lezen — begint opnieuw', e); return nieuweStaat(Date.now()); }
  }
  function schrijf(st) {
    try { localStorage.setItem(SLEUTEL, JSON.stringify(st)); }
    catch (e) { console.warn('PLReview: staat niet te bewaren', e); }
  }
  function omgeving() {
    var o = { rijdt: false, strook: false, intro: false };
    try { var v = (typeof pidVals !== 'undefined' && pidVals) ? Number(pidVals['010D']) : NaN; o.rijdt = isFinite(v) && v > KMH_STIL; }
    catch (e) { console.warn('PLReview: snelheid niet te lezen', e); }
    try { o.strook = !!(window.PLStrook && PLStrook.actief && PLStrook.actief()); }
    catch (e) { console.warn('PLReview: strook niet te lezen', e); }
    try { o.intro = !!(window.PLIntro && PLIntro.bezig && PLIntro.bezig()); }
    catch (e) { console.warn('PLReview: intro niet te lezen', e); }
    return o;
  }
  function log(wat) { try { if (typeof logUsage === 'function') logUsage('review', wat); } catch (e) { console.warn('PLReview: logUsage', e); } }

  // De eerste keer dat de app deze module laadt telt als het begin van het gebruik.
  (function () { try { if (!localStorage.getItem(SLEUTEL)) schrijf(nieuweStaat(Date.now())); } catch (e) { console.warn('PLReview: begin niet vastgelegd', e); } })();

  /* Een geslaagde verbinding (geen hervatting): telt mee voor "genoeg gebruikt". */
  function verbonden() {
    if (isDemo()) return;
    var st = lees(); st.verbindingen = (st.verbindingen || 0) + 1; schrijf(st);
  }

  var _wacht = null;
  /* Een goed moment. Mag het, dan de kaart zodra het rustig is. */
  function goedMoment(waarom) {
    if (!android() || isDemo() || _wacht) return false;
    if (!magVragen(lees(), Date.now())) return false;
    var tot = Date.now() + WACHT_MS;
    var probeer = function () {
      _wacht = null;
      if (!magVragen(lees(), Date.now())) return;
      if (rustigMoment(omgeving())) { toon(waarom); return; }
      if (Date.now() < tot) _wacht = setTimeout(probeer, TIK_MS);
    };
    _wacht = setTimeout(probeer, TIK_MS);
    return true;
  }
  function toon(waarom) {
    var st = lees(); st.keer = (st.keer || 0) + 1; st.laatst = Date.now(); schrijf(st);
    var k = el('plReview');
    if (!k) {
      k = document.createElement('div');
      k.id = 'plReview'; k.className = 'pl-review';
      k.setAttribute('role', 'dialog'); k.setAttribute('aria-label', 'Beoordeel PidLane');
      k.innerHTML =
        '<div class="pl-review-kop"><b>Bevalt PidLane?</b><span>Een beoordeling in Google Play helpt anderen de app te vinden. Het kost je een minuut.</span></div>' +
        '<div class="pl-review-knoppen">' +
          '<button type="button" class="pl-review-k p" id="plReviewJa" onclick="PLReview.ja()">⭐ Beoordelen</button>' +
          '<button type="button" class="pl-review-k" id="plReviewLater" onclick="PLReview.later()">Later</button>' +
          '<button type="button" class="pl-review-k" id="plReviewNee" onclick="PLReview.nee()">Nee, bedankt</button>' +
        '</div>';
      document.body.appendChild(k);
    }
    k.hidden = false;
    log('gevraagd: ' + (waarom || ''));
  }
  function dicht() { var k = el('plReview'); if (k) k.hidden = true; }
  function ja() {
    var st = lees(); st.klaar = true; schrijf(st); dicht(); log('ja');
    // Een adres buiten server.allowNavigation (capacitor.config.json) opent
    // Capacitor buiten de app; voor play.google.com is dat de Play Store.
    try { location.href = PLAY; }
    catch (e) { console.warn('PLReview: Play-pagina niet geopend', e); try { if (typeof showToast === 'function') showToast('Zoek PidLane in Google Play'); } catch (e2) { console.warn('PLReview: melding', e2); } }
  }
  function later() { dicht(); log('later'); }
  function nee() { var st = lees(); st.klaar = true; schrijf(st); dicht(); log('nee'); }

  window.PLReview = {
    verbonden: verbonden, goedMoment: goedMoment, ja: ja, later: later, nee: nee,
    staat: function () { return lees(); },
    _kern: { magVragen: magVragen, nieuweStaat: nieuweStaat, rustigMoment: rustigMoment, SLEUTEL: SLEUTEL, DAG: DAG,
      VAN_DAGEN: VAN_DAGEN, MIN_VERBINDINGEN: MIN_VERBINDINGEN, MAX_KEER: MAX_KEER, NA_DAGEN: NA_DAGEN, PLAY: PLAY }
  };
})();
