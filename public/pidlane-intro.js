// ══════════════════════════════════════════════════════════════════
// pidlane-intro.js
// DE OPSTART-INTRO — neon rijbaan, logo komt overeind, doorzoom naar login
// ──────────────────────────────────────────────────────────────────
// WAT HET IS
// Bij het openen van de app: donker scherm, een neon rijbaan tekent zich
// naar de horizon, op het verdwijnpunt tekent het logo zich en komt het in
// 3D overeind uit het wegdek, en daarna zoom je dóór het logo heen naar wat
// eronder klaarstaat — het inlogscherm, of de app als de sessie hersteld is.
// Gekozen uit drie voorbeelden op 24-09-2026: variant A ("Lane") met de
// uittrede van variant B ("Signaal").
//
// WAAROM ER WEER EEN INTRO IS, TERWIJL DE VORIGE OP 26-07 WEG MOEST
// De vorige splash hield elke start 3,4 s op. Deze is met opzet anders
// gebouwd, en dat is de reden dat de regels hieronder er staan:
//
//   - hooguit één keer per sessie (sessionStorage). Een koude start van de
//     APK is een nieuwe sessie, "Nieuwste versie laden" is dat niet;
//   - één tik of toets en hij is weg;
//   - niet bij "minder beweging" in het besturingssysteem;
//   - niet als de opstart zelf al traag was (MAX_WACHT_MS): dan heeft de
//     gebruiker lang genoeg gewacht en komt er niets bovenop;
//   - niet onder automatisering (navigator.webdriver): de browserproeven
//     meten de app, niet de intro. bproef-intro.js start hem daar gericht.
//
// De app laadt er gewoon onder door. De intro speelt pas vanaf
// DOMContentLoaded, dus hij ligt over de opstart heen en niet ernaast.
//
// DE NOODREM
// Het donkere vlak staat al in de HTML, vóór dit script. Loopt dit script
// om welke reden ook niet, dan zou dat vlak de app blijvend afdekken. Daarom
// regelt de CSS het verdwijnen zelf ook (zie pidlane.css): zonder .pli-speel
// is het vlak na 8 s weg, en mét eindigt de laatste animatie onzichtbaar en
// onaanraakbaar. De timer hier ruimt alleen op.
// ══════════════════════════════════════════════════════════════════
window.PLIntro = (function () {
  var SLEUTEL = 'pl_intro_gezien';
  var DUUR_MS = 2900;       // tot en met de doorzoom; zie de tijdlijn in pidlane.css
  var WEG_MS = 240;         // uitfaden na een tik
  var MAX_WACHT_MS = 6000;  // trager dan dit tot DOMContentLoaded: geen intro meer

  var el = null, t0 = 0, timer = null, bezig = false;

  // Het besluit, los van de omgeving — zodat het in node te toetsen is.
  // Geeft de reden terug waarom hij níét speelt, of '' als hij wél speelt.
  function reden(o) {
    if (o.verminderd) return 'minder beweging';
    if (o.gezien) return 'al getoond deze sessie';
    if (o.webdriver) return 'automatisering';
    if (o.wachtMs > MAX_WACHT_MS) return 'opstart te traag (' + Math.round(o.wachtMs) + ' ms)';
    return '';
  }

  function omgeving() {
    var o = { verminderd: false, gezien: false, webdriver: !!navigator.webdriver, wachtMs: 0 };
    try { o.verminderd = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { console.warn('PLIntro: prefers-reduced-motion niet leesbaar', e); }
    try { o.gezien = sessionStorage.getItem(SLEUTEL) === '1'; }
    catch (e) { console.warn('PLIntro: sessionStorage niet leesbaar — intro speelt gewoon', e); }
    return o;
  }

  function onthoud() {
    try { sessionStorage.setItem(SLEUTEL, '1'); }
    catch (e) { console.warn('PLIntro: sessionStorage niet schrijfbaar — intro kan opnieuw spelen', e); }
  }

  function weg() {
    clearTimeout(timer); timer = null;
    document.removeEventListener('pointerdown', overslaan, true);
    document.removeEventListener('keydown', overslaan, true);
    // Verbergen, niet weghalen: bproef-intro.js speelt hem daarna nog eens
    // met start({forceer:true}). Wat blijft staan is een paar KB aan SVG.
    if (el) { el.hidden = true; el.classList.remove('pli-speel', 'pli-weg'); }
    el = null; bezig = false;
  }

  function overslaan(ev) {
    if (!el) return;
    // De tik is voor de intro, niet voor de knop die eronder ligt.
    if (ev && ev.type === 'pointerdown') { ev.preventDefault(); ev.stopPropagation(); }
    clearTimeout(timer);
    el.classList.add('pli-weg');
    timer = setTimeout(weg, WEG_MS);
  }

  function speel() {
    if (!el) return;
    bezig = true;
    onthoud();
    el.classList.add('pli-speel');
    document.addEventListener('pointerdown', overslaan, true);
    document.addEventListener('keydown', overslaan, true);
    timer = setTimeout(weg, DUUR_MS);
  }

  // Aangeroepen direct na de markup in index.html. Beslist meteen of het
  // donkere vlak mag blijven staan, zodat er niets knippert als het niet mag.
  function start(opties) {
    var forceer = !!(opties && opties.forceer);
    el = document.getElementById('plIntro');
    if (!el) return 'geen #plIntro';
    if (bezig) return 'speelt al';
    el.hidden = false;
    t0 = (window.performance && performance.now) ? performance.now() : Date.now();

    var r = forceer ? '' : reden(omgeving());
    if (r) { weg(); return r; }

    var opDcl = function () {
      var nu = (window.performance && performance.now) ? performance.now() : Date.now();
      var r2 = forceer ? '' : reden({ wachtMs: nu - t0 });
      if (r2) { console.info('PLIntro: overgeslagen — ' + r2); weg(); return; }
      speel();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', opDcl, { once: true });
    else opDcl();
    return '';
  }

  return {
    start: start, reden: reden, overslaan: overslaan,
    bezig: function () { return bezig; },
    SLEUTEL: SLEUTEL, DUUR_MS: DUUR_MS, MAX_WACHT_MS: MAX_WACHT_MS
  };
})();
