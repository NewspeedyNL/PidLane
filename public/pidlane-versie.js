/* ══════════════════════════════════════════════════════════════════
   pidlane-versie.js — PLVersie: "er is een nieuwe versie" (14-11-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM. De APK laadt de app van app.pidlane.nl. Elke push naar main is een
   deploy, maar een app die op de achtergrond bleef staan draait daarna door
   op de oude code. De knop "Nieuwste versie laden" (plHardReload, in
   index.html) bestond al, maar zat achter Geavanceerd op het inlogscherm:
   wie hem niet zocht, wist niet dat hij nodig was. Uit het gebruik: "kan die
   functie als pop-up in beeld komen na openen app als er een update is?"

   HOE. De worker geeft op /app-versie het id van de deploy die nu live staat
   (Cloudflare version metadata). Bij het laden onthoudt deze module dat id:
   dat is de versie die deze pagina draait. Bij elke terugkeer naar de app
   (visibilitychange) en elk kwartier vraagt hij het opnieuw. Is het anders,
   dan komt er een kaart in beeld met "Nu bijwerken" — dezelfde
   plHardReload() als de knop — en "Later".

   NIET STOREN. Geen kaart zolang er een adapter verbonden is (bijwerken is
   een herlaad, en die verbreekt de verbinding midden in een rit) en niet
   onder de intro; dan komt hij zodra dat voorbij is. "Later" geldt voor díé
   versie: bij de volgende deploy vraagt hij het opnieuw.

   Geen id van de server (oude worker, geen net, lokaal): dan zwijgt hij en
   zegt dat één keer in de console. Er komt nooit een kaart op een gok.

   PUUR (_kern): nieuwer, magTonen. Getoetst in test-versie.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ADRES = '/app-versie';
  var ELKE_MS = 15 * 60 * 1000;
  var TIK_MS = 2000;   // hoe vaak een uitgestelde kaart kijkt of hij al mag

  // ── puur ─────────────────────────────────────────────────────────
  /* Draait deze pagina een oudere versie dan wat er live staat? Alleen een
     uitspraak als beide ids bekend zijn. */
  function nieuwer(geladen, live) {
    return !!geladen && !!live && String(geladen) !== String(live);
  }
  /* Mag de kaart nu in beeld? o = { nieuw, live, later, verbonden, intro, zichtbaar } */
  function magTonen(o) {
    if (!o || !o.nieuw) return false;
    if (o.later && o.later === o.live) return false;
    return !o.verbonden && !o.intro && o.zichtbaar !== false;
  }

  // ── omgeving ─────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { console.warn('PLVersie: connected niet te lezen', e); return false; } }
  function isIntro() { try { return !!(window.PLIntro && typeof PLIntro.bezig === 'function' && PLIntro.bezig()); } catch (e) { console.warn('PLVersie: intro niet te lezen', e); return false; } }
  function zichtbaar() { try { return document.visibilityState !== 'hidden'; } catch (e) { console.warn('PLVersie: zichtbaarheid niet te lezen', e); return true; } }

  var _geladen = null, _live = null, _later = null, _stil = false, _tik = null, _bezig = false;

  function vraag() {
    if (_bezig || typeof window.plFetch !== 'function') return Promise.resolve(null);
    _bezig = true;
    // Via plFetch (één weg naar de server, test-plfetch.js), zonder sessie:
    // het antwoord is voor iedereen gelijk, ook op het inlogscherm.
    return Promise.resolve().then(function () {
      return window.plFetch(ADRES + '?t=' + Date.now(), { cache: 'no-store', geenToken: true });
    }).then(function (r) {
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      return r.json();
    }).then(function (j) {
      _bezig = false;
      var id = j && j.id ? String(j.id) : null;
      if (!id) throw new Error('geen id in het antwoord');
      return id;
    }).catch(function (e) {
      _bezig = false;
      if (!_stil) { _stil = true; console.info('PLVersie: geen versie van de server — de updatemelding zwijgt (' + ((e && e.message) || e) + ')'); }
      return null;
    });
  }

  function staat() {
    return { nieuw: nieuwer(_geladen, _live), live: _live, later: _later, verbonden: isVerbonden(), intro: isIntro(), zichtbaar: zichtbaar() };
  }

  function kaart() {
    var k = el('plVersie');
    if (k) return k;
    k = document.createElement('div');
    k.id = 'plVersie';
    k.className = 'pl-versie';
    k.setAttribute('role', 'dialog');
    k.setAttribute('aria-live', 'polite');
    k.setAttribute('aria-label', 'Nieuwe versie');
    k.innerHTML =
      '<div class="pl-versie-kop"><b>Nieuwe versie van PidLane</b><span>Bijwerken duurt een paar seconden.</span></div>' +
      '<div class="pl-versie-knoppen">' +
        '<button type="button" class="pl-versie-k p" id="plVersieNu" onclick="PLVersie.nu(this)">🔄 Nu bijwerken</button>' +
        '<button type="button" class="pl-versie-k" id="plVersieLater" onclick="PLVersie.later()">Later</button>' +
      '</div>';
    document.body.appendChild(k);
    return k;
  }
  function verberg() { var k = el('plVersie'); if (k) k.hidden = true; }

  /* Kaart tonen als het mag; anders blijft hij wachten tot het wel mag. */
  function beoordeel() {
    var s = staat();
    if (!s.nieuw || (s.later && s.later === s.live)) { stopTik(); verberg(); return false; }
    if (magTonen(s)) { stopTik(); kaart().hidden = false; return true; }
    verberg();
    if (!_tik) _tik = elke(TIK_MS, beoordeel, 'versie-wacht');
    return false;
  }
  function stopTik() { if (_tik) { weg(_tik); _tik = null; } }
  /* Timers via PLRust (#691): uit beeld en zonder verbinding slapen ze, en
     bproef-rust.js telt geen losse setInterval buiten zijn lijst. */
  function elke(ms, fn, naam) {
    if (window.PLRust && typeof PLRust.elke === 'function') return { rust: PLRust.elke(ms, fn, naam) };
    return { iv: setInterval(fn, ms) };
  }
  function weg(t) {
    if (t.rust && window.PLRust) PLRust.weg(t.rust); else if (t.iv) clearInterval(t.iv);
  }

  function controleer() {
    return vraag().then(function (id) {
      if (!id) return false;
      if (!_geladen) { _geladen = id; return false; }   // de eerste keer: dit is wat de pagina draait
      _live = id;
      return beoordeel();
    });
  }

  function nu(btn) {
    stopTik();
    try {
      if (typeof window.plHardReload === 'function') return window.plHardReload(btn);
      location.reload();
    } catch (e) { console.warn('PLVersie: bijwerken mislukt', e); }
  }
  function later() {
    _later = _live; stopTik(); verberg();
    try { if (typeof logUsage === 'function') logUsage('versie', 'later'); } catch (e) { console.warn('PLVersie: logUsage', e); }
  }

  function start() {
    controleer();
    try {
      document.addEventListener('visibilitychange', function () { if (zichtbaar()) controleer(); });
      elke(ELKE_MS, function () { if (zichtbaar()) controleer(); }, 'versie');
    } catch (e) { console.warn('PLVersie: luisteraars niet gezet — alleen de controle bij het laden', e); }
  }

  window.PLVersie = {
    start: start, controleer: controleer, nu: nu, later: later,
    staat: function () { var s = staat(); s.geladen = _geladen; s.kaart = !!(el('plVersie') && !el('plVersie').hidden); return s; },
    _kern: { nieuwer: nieuwer, magTonen: magTonen, ADRES: ADRES }
  };
  if (!window.PLVERSIE_HANDMATIG) start();
})();
