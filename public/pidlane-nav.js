/* ═══════════════════════════════════════════════════════════════════
   pidlane-nav.js — PLNav: onderbalk, startscherm en garagemodus
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   Een evaluatie van de app zei: te veel wegen naar dezelfde functies, en
   juist de belangrijke zitten verstopt. Nageteld waren het 59 ingangen op
   tien plekken, met vijf wegen naar foutcodes en het rapport — waar de
   klant voor betaalt — alleen achter ☰. Het voorstel dat daaruit kwam, en
   dat dit bestand uitvoert:

     • vier bestemmingen die altijd zichtbaar zijn: Mijn auto · Live ·
       Rapporten · Meer (onderzoek NN/g: zichtbare navigatie wordt op
       mobiel anderhalf keer zo vaak gebruikt als een hamburgermenu;
       Material en Apple adviseren allebei 3–5 tabs);
     • één hoofdknop, Check mijn auto, die na een verbinding vanzelf
       draait: nul keuzes vóór de eerste uitkomst;
     • vier "Ik wil…"-tegels die de wizard op zijn eigen tak openen, zodat
       varianten van één vraag stappen worden in plaats van losse kaarten;
     • een garagemodus voor wie de vakgereedschappen wél wil zien. Een
       expert heeft geen last van veel keuzes, een leek met een brandend
       lampje wel — dezelfde plekken, alleen meer knoppen erop.

   WAT HIER NIET IN ZIT

   Er is geen functie verhuisd of verdwenen. De kaarten van de oude deuren
   (wc-…) staan nog in index.html, onder "Alle functies": hun id's dragen de
   featureflags (FEATURE_TOGGLES in pidlane-fuel.js), de favorieten en de
   tests. Het ☰-menu is het venster achter Meer geworden; zijn items houden
   hun id's, want pasMenuAan(), PLAfsluiten en de testrun zoeken ze op.

   ÉÉN DING, ÉÉN BETEKENIS

   De tab is een bestemming, geen actie (Apple HIG). Welke tab oplicht
   volgt dus uit wat er in beeld stáát (welkeTab), niet uit waar het laatst
   op getikt is: wie via een vervolgknop in de live view belandt, ziet Live
   oplichten.

   PUUR EN NIET PUUR. garageStandaard(), garageAan(), welkeTab() en
   balkZichtbaar() zijn puur; test-nav.js toetst ze met vm. De rest raakt
   de DOM.

   Laadvolgorde: ná pidlane-datalog.js (goHome, openLiveView, reportNav),
   pidlane-archief.js (openReportsOverview), pidlane-uihelpers.js
   (toggleKebab), pidlane-wizard.js en pidlane-foutcodes.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG = { garage: 'pl_garagemodus', autocheck: 'pl_autocheck' };

  /* Volledig-schermige dashboards die ónder de balk liggen (z-index 9000) en
     hun eigen knoppen onderaan hebben. Daarover hoort de balk niet te staan.
     Alles op 9600 en hoger ligt er vanzelf al boven. */
  var ONDER_DE_BALK = ['climateDash', 'evDash', 'langeRitDash'];

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  /* Wie krijgt de garagemodus zonder erom te vragen? Een ingelogd account dat
     geen consument is: beheer en personeel van een garage (#49). Een klant en
     de demo zonder login — die een Play-reviewer ziet — beginnen eenvoudig. */
  function garageStandaard(ingelogd, isKlant) {
    return !!ingelogd && !isKlant;
  }

  // Een eigen keuze wint altijd van de standaard, in beide richtingen.
  function garageAan(opgeslagen, standaard) {
    if (opgeslagen === '1') return true;
    if (opgeslagen === '0') return false;
    return !!standaard;
  }

  /* Welke tab licht op. Wat bovenop ligt wint: het Meer-venster, dan het
     rapportenoverzicht, dan het startscherm. Is geen van drieën in beeld,
     dan kijk je naar de app zelf — en dat is Live. */
  function welkeTab(st) {
    st = st || {};
    if (st.meer) return 'meer';
    if (st.rapporten) return 'rapporten';
    if (st.welkom) return 'auto';
    return 'live';
  }

  /* De balk hoort bij de app, niet bij het inloggen: wie niet ingelogd is en
     ook geen demo draait, ziet hem niet. En hij wijkt voor de dashboards die
     onder hem zouden verdwijnen. */
  function balkZichtbaar(st) {
    st = st || {};
    return !!(st.ingelogd || st.demo) && !st.dashboard;
  }

  // ════════════════════════════════════════════════════════════════
  //  TOESTAND
  // ════════════════════════════════════════════════════════════════
  function lees(k) {
    try { return localStorage.getItem(k); }
    catch (e) { console.warn('PLNav: opslag niet leesbaar (' + k + ')', e); return null; }
  }
  function schrijf(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    catch (e) { console.warn('PLNav: opslag niet schrijfbaar (' + k + ')', e); }
  }
  function el(id) { return document.getElementById(id); }
  function zichtbaar(e) {
    if (!e) return false;
    if (e.classList && e.classList.contains('hidden')) return false;
    return getComputedStyle(e).display !== 'none';
  }
  function ingelogd() {
    try { return !!(window.currentUser && (window.currentUser.user || window.currentUser.name)); }
    catch (e) { console.warn('PLNav: gebruiker onbekend', e); return false; }
  }
  function isKlant() {
    try { return !!(window.PLKlant && PLKlant.isKlant()); }
    catch (e) { console.warn('PLNav: rol onbekend', e); return false; }
  }
  function isDemo() {
    try { return typeof demoMode !== 'undefined' && !!demoMode; }
    catch (e) { console.warn('PLNav: demomodus onbekend', e); return false; }
  }

  function garage() { return garageAan(lees(OPSLAG.garage), garageStandaard(ingelogd(), isKlant())); }
  function autoCheck() { return lees(OPSLAG.autocheck) !== '0'; }

  function logGebruik(wat, detail) {
    try { logUsage(wat, detail); }
    catch (e) { console.warn('PLNav: logUsage mislukt', e); }
  }

  // ════════════════════════════════════════════════════════════════
  //  ONDERBALK
  // ════════════════════════════════════════════════════════════════
  function staat() {
    var ws = el('welcomeScreen'), ro = el('reportsOverviewSheet'), km = el('kebabMenu');
    var dash = ONDER_DE_BALK.some(function (id) { return zichtbaar(el(id)); });
    return {
      welkom: !!ws && !ws.classList.contains('hidden'),
      rapporten: zichtbaar(ro),
      meer: !!km && km.classList.contains('open'),
      ingelogd: ingelogd(),
      demo: isDemo(),
      dashboard: dash
    };
  }

  function ververs() {
    var st = staat();
    var aan = balkZichtbaar(st);
    document.body.classList.toggle('pl-nav-aan', aan);
    document.body.classList.toggle('pl-garage', garage());
    var nav = el('plNav'); if (!nav) return;
    var tab = welkeTab(st);
    nav.querySelectorAll('.pl-nav-tab').forEach(function (b) {
      var op = b.getAttribute('data-tab') === tab;
      b.classList.toggle('aan', op);
      if (op) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    verversSchakelaars();
  }

  function sluitBovenop() {
    try { if (typeof closeKebab === 'function') closeKebab(); } catch (e) { console.warn('PLNav: closeKebab mislukt', e); }
    try { if (typeof closeReportsOverview === 'function') closeReportsOverview(); } catch (e) { console.warn('PLNav: closeReportsOverview mislukt', e); }
  }

  function tab(naam, ev) {
    if (naam === 'meer') {
      // Zelfde knop, zelfde gedrag als het oude ☰: nog eens tikken sluit.
      try { closeReportsOverview(); } catch (e) { console.warn('PLNav: closeReportsOverview mislukt', e); }
      try { toggleKebab(ev); } catch (e) { console.warn('PLNav: Meer opent niet', e); }
    } else {
      sluitBovenop();
      try {
        if (naam === 'auto') goHome();
        else if (naam === 'live') openLiveView();
        else if (naam === 'rapporten') openReportsOverview();
      } catch (e) { console.warn('PLNav: tab ' + naam + ' opent niet', e); }
    }
    logGebruik('tab', naam);
    ververs();
  }

  // ════════════════════════════════════════════════════════════════
  //  STARTSCHERM
  // ════════════════════════════════════════════════════════════════
  function check() {
    logGebruik('check', 'knop');
    try { PLFoutcodes.open(); }
    catch (e) { console.warn('PLNav: Check mijn auto opent niet', e); if (typeof showToast === 'function') showToast('De check opent nu niet — probeer het opnieuw'); }
  }

  function tegel(t) {
    logGebruik('tegel', t);
    try { PLWizard.open(t); }
    catch (e) { console.warn('PLNav: tegel ' + t + ' opent niet', e); if (typeof showToast === 'function') showToast('Dit opent nu niet — probeer het opnieuw'); }
  }

  /* Na een verbinding de check vanzelf laten lopen. Aangeroepen vanuit
     wizFinish(), het ene punt waar elke verbinding langskomt: zonder
     samenvatting direct, met samenvatting pas als de klant hem wegtikt — twee
     vensters over elkaar is precies de drukte die hier weg moet. Niet bij
     hervatten (de klant zat midden in iets anders), niet op afstand, niet in
     de demo (daar kiest de reviewer zelf) en niet als het is uitgezet. */
  var _gecheckt = false;
  function naVerbinding(opties) {
    opties = opties || {};
    if (opties.hervat || _gecheckt || !autoCheck() || isDemo()) return false;
    if (window._remoteVehicleMode) return false;   // meekijken: deze telefoon hangt niet aan de auto
    _gecheckt = true;       // één keer per sessie; opnieuw verbinden is geen nieuwe vraag
    logGebruik('check', 'na_verbinden');
    setTimeout(function () { try { PLFoutcodes.open({ auto: true }); } catch (e) { console.warn('PLNav: automatische check opent niet', e); } }, 350);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  //  SCHAKELAARS IN MEER
  // ════════════════════════════════════════════════════════════════
  function zetGarage(aan) {
    schrijf(OPSLAG.garage, aan ? '1' : '0');
    logGebruik('garagemodus', aan ? 'aan' : 'uit');
    ververs();
    if (typeof showToast === 'function') showToast(aan ? 'Garagemodus aan — alle vakgereedschappen staan erbij' : 'Garagemodus uit');
  }
  function zetAutoCheck(aan) {
    schrijf(OPSLAG.autocheck, aan ? null : '0');
    ververs();
  }
  function verversSchakelaars() {
    var g = el('kbGarageModus'); if (g) g.setAttribute('aria-checked', garage() ? 'true' : 'false');
    var a = el('kbAutoCheck'); if (a) a.setAttribute('aria-checked', autoCheck() ? 'true' : 'false');
    // Een kopje zonder zichtbare regels eronder weg (Account voor een beheerder).
    document.querySelectorAll('#kebabMenu .kebab-kop').forEach(function (k) {
      var n = k.nextElementSibling, iets = false;
      while (n && !n.classList.contains('kebab-kop') && !n.classList.contains('kebab-sep')) {
        if (n.style.display !== 'none' && getComputedStyle(n).display !== 'none') { iets = true; break; }
        n = n.nextElementSibling;
      }
      k.style.display = iets ? '' : 'none';
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  OPSTART
  // ════════════════════════════════════════════════════════════════
  function start() {
    ververs();
    // Er is geen event voor "het startscherm ging dicht" of "een rapport werd
    // geopend" — die komen uit twintig modules. Een lichte rondgang is
    // eerlijker dan twintig haakjes waarvan er één vergeten wordt.
    setInterval(ververs, 700);
    var ws = el('welcomeScreen');
    if (ws && window.MutationObserver) {
      try { new MutationObserver(ververs).observe(ws, { attributes: true, attributeFilter: ['class'] }); }
      catch (e) { console.warn('PLNav: startscherm niet gevolgd', e); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.PLNav = {
    tab: tab,
    check: check,
    tegel: tegel,
    naVerbinding: naVerbinding,
    garage: garage,
    zetGarage: zetGarage,
    wisselGarage: function () { zetGarage(!garage()); },
    autoCheck: autoCheck,
    wisselAutoCheck: function () { zetAutoCheck(!autoCheck()); },
    ververs: ververs,
    // pure kern — voor test-nav.js
    _kern: { garageStandaard: garageStandaard, garageAan: garageAan, welkeTab: welkeTab, balkZichtbaar: balkZichtbaar, ONDER_DE_BALK: ONDER_DE_BALK }
  };
})();
