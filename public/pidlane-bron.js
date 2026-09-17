// ══════════════════════════════════════════════════════════════════
// pidlane-bron.js — op welke bron draait deze app? (#242)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS.
// De app is een WebView op `app.pidlane.nl` en haalt zijn code élke start op
// afstand. Dat betekent dat een nieuwe testrun pas te rijden is als hij op
// `main` staat — en elke push naar `main` is een deploy naar 100% van het
// verkeer. Een proef die alleen in de auto te beantwoorden is, kost daarmee
// een deploy voordat de vraag überhaupt gesteld kan worden.
//
// Cloudflare zet voor een niet-productietak een eigen preview-adres neer
// (`wrangler versions upload`). Daar draait dezelfde app, met dezelfde
// Worker-routes, maar zonder dat er iets live gaat. Deze module maakt dat
// adres bereikbaar vanuit de app — en, belangrijker, maakt ZICHTBAAR waar je
// zit zodra het niet de productiebron is.
//
// DE BANNER IS HET PUNT, NIET DE KNOP.
// Een app die er precies hetzelfde uitziet maar andere code draait is een
// uitstekende manier om een rit weg te gooien: je meet een uur, je leest het
// verslag, en pas dan blijkt dat je op de oude versie zat. Dat is op 26-08
// gebeurd (toestel draaide 4.8 terwijl de vraag over 4.9 ging) en dat is de
// reden dat het versienummer nu op het inlogscherm staat. Deze module doet
// hetzelfde voor de BRON: staat er iets anders dan productie, dan staat dat
// boven in beeld, de hele sessie, en het gaat niet weg tot je terug bent.
//
// WAT DIT NIET IS. Geen tweede deploy-route: het preview-adres komt van
// Cloudflare en draait de code van een tak die de volledige gate heeft gehad
// (plcheck, plmutate, de browserproeven). Er wordt hier niets geladen dat niet
// getoetst is — er wordt alleen ergens ánders naartoe genavigeerd.
//
// WIE HET KAN. Alleen een beheerder, en alleen als er een preview-adres in de
// Config staat (`bron_preview`). Geen adres betekent geen knop: de aanwezigheid
// van dat adres ÍS de schakelaar, en dat scheelt een tweede vlag die hetzelfde
// zegt.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // De bron die als "live" telt. Alles wat hier niet gelijk aan is, krijgt de
  // banner — ook een adres dat er onschuldig uitziet.
  var PRODUCTIE = 'https://app.pidlane.nl';
  var SLEUTEL = 'bron_preview';

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('Bronmelding niet in de app-log gezet', e); }
  }

  function huidige() {
    try { return String(location.origin || ''); }
    catch (e) { console.warn('Bron: origin niet leesbaar (#242)', e); return ''; }
  }

  function isProductie() { return huidige() === PRODUCTIE; }

  /* Het preview-adres uit de Config. Alleen https, en alleen een heel adres —
     een half adres levert een navigatie op naar iets wat niemand bedoelde. */
  function preview() {
    var ruw = '';
    try { ruw = String((window.PID_CONFIG || {})[SLEUTEL] || '').trim(); }
    catch (e) { console.warn('Bron: Config niet leesbaar (#242)', e); return ''; }
    if (!ruw) return '';
    if (!/^https:\/\/[a-z0-9.-]+(\/|$)/i.test(ruw)) {
      console.warn('Bron: `' + SLEUTEL + '` is geen volledig https-adres — genegeerd (#242)');
      return '';
    }
    return ruw.replace(/\/+$/, '');
  }

  function magWisselen() {
    try { if (typeof isAdmin === 'function' && !isAdmin()) return false; }
    catch (e) { console.warn('Bron: isAdmin niet leesbaar (#242)', e); return false; }
    return !!preview() || !isProductie();
  }

  /* Waar de app NU draait, in één regel. De testrun zet dit in zijn kop en in
     de live-log: wie het verslag later leest moet kunnen zien of het over de
     productiebron ging of over een tak. Zonder die regel is een verslag van
     een preview niet van een verslag van productie te onderscheiden. */
  function stempel() {
    var o = huidige();
    if (!o) return 'bron onbekend';
    return isProductie() ? 'productie (' + o + ')' : 'PREVIEW (' + o + ')';
  }

  /* Naar de andere bron. Geen kunstje met localStorage: een ander adres is een
     andere oorsprong, met een eigen opslag — dus gewoon navigeren, en het
     ergens anders vandaan halen dan waar we nu zijn. */
  function wissel() {
    var doel = isProductie() ? preview() : PRODUCTIE;
    if (!doel) { _log('Geen preview-adres ingesteld (`' + SLEUTEL + '`) — er is niets om naartoe te gaan', 'warn'); return false; }
    _log('Bron wisselen: ' + huidige() + ' → ' + doel, 'ok');
    try { location.href = doel; return true; }
    catch (e) { console.warn('Bron: navigeren mislukt (#242)', e); return false; }
  }

  /* DE BANNER. Hij staat er de hele sessie, hij is niet weg te klikken, en hij
     zegt waar je zit plus hoe je terugkomt. Wegklikbaar maken zou precies het
     geval terugbrengen dat hij moet voorkomen. */
  function banner() {
    if (isProductie()) return null;
    var b = document.getElementById('bronBanner');
    if (b) return b;
    try {
      b = document.createElement('div');
      b.id = 'bronBanner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9990;background:#f2820c;color:#1b1b1b;' +
        'font:700 12px/1.35 var(--f,system-ui);padding:5px 10px;text-align:center;letter-spacing:.2px';
      b.textContent = '⚠ PREVIEW — ' + huidige() + ' · dit is niet de live app';
      var knop = document.createElement('button');
      knop.type = 'button';
      knop.textContent = 'terug naar live';
      knop.style.cssText = 'margin-left:8px;border:none;border-radius:6px;padding:2px 8px;font:inherit;cursor:pointer;background:#1b1b1b;color:#fff';
      knop.addEventListener('click', function () { location.href = PRODUCTIE; });
      b.appendChild(knop);
      document.body.appendChild(b);
      // De banner dekt de bovenrand af; de app schuift eronder in plaats van
      // eroverheen. Anders valt de eerste regel van het scherm weg en is dat
      // een bug die op een preview ontstaat en op productie niet.
      document.body.style.paddingTop = (b.offsetHeight || 24) + 'px';
    } catch (e) {
      console.warn('Bron: de previewbanner kon niet getekend worden (#242)', e);
      return null;
    }
    return b;
  }

  /* De knop in het Admin-menu. Alleen aanmaken als hij ook iets kan doen —
     een knop die "niets ingesteld" meldt is een knop die je één keer indrukt
     en daarna negeert. */
  function menu() {
    if (!magWisselen()) return null;
    var groep = document.getElementById('admGroup');
    if (!groep) return null;
    var bestaand = document.getElementById('bronBtn');
    if (bestaand) return bestaand;
    try {
      var k = document.createElement('button');
      k.className = 'kebab-item';
      k.id = 'bronBtn';
      k.type = 'button';
      k.textContent = isProductie() ? '🧪 Preview-bron laden' : '🏠 Terug naar de live-bron';
      k.addEventListener('click', function () {
        try { if (typeof closeKebab === 'function') closeKebab(); }
        catch (e) { console.warn('Bron: kebabmenu niet gesloten (#242)', e); }
        wissel();
      });
      groep.appendChild(k);
      return k;
    } catch (e) {
      console.warn('Bron: de menuknop kon niet toegevoegd worden (#242)', e);
      return null;
    }
  }

  function teken() {
    try { banner(); } catch (e) { console.warn('Bron: banner overgeslagen (#242)', e); }
    try { menu(); } catch (e) { console.warn('Bron: menuknop overgeslagen (#242)', e); }
  }

  try {
    document.addEventListener('DOMContentLoaded', function () {
      teken();
      // De Config komt ná het opstarten binnen (/api/config), en dáár staat het
      // preview-adres in. Eén keer later nogmaals kijken is genoeg; een lus die
      // blijft draaien zou hier niets toevoegen.
      try { setTimeout(teken, 4000); } catch (e) { console.warn('Bron: tweede tekenronde niet ingepland (#242)', e); }
    });
  } catch (e) {
    console.warn('Bron: kon niet op het opstarten wachten (#242)', e);
  }

  window.PLBron = {
    huidige: huidige,
    isProductie: isProductie,
    preview: preview,
    magWisselen: magWisselen,
    stempel: stempel,
    wissel: wissel,
    teken: teken,
    _productie: function () { return PRODUCTIE; },
    _sleutel: function () { return SLEUTEL; }
  };
})();
