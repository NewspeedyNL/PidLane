/* ══════════════════════════════════════════════════════════════════
   pidlane-vriend.js — PLVriend: nodig een vriend uit (14-11-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM. Uit het gebruik: "nodig een vriend uit, inruil voor AI-credits na
   succesvolle registratie vriend". Mond-tot-mondreclame is voor een app
   naast een baan de goedkoopste manier om bekend te worden.

   HOE. Meer → Nodig een vriend uit opent een venster met je eigen code
   (PL-XXXXXX) en een link (app.pidlane.nl/?u=CODE), te delen via het
   deelmenu (WhatsApp e.d.) of te kopiëren. De vriend vult de code in bij
   "Gratis account" — de link vult hem vanzelf in (bewaardeCode()).

   WANNEER ER CREDITS KOMEN. Niet bij het registreren: e-mail wordt niet
   geverifieerd. Pas als de vriend een auto verbindt die nog niet eerder bij
   PidLane bekend was, en die in Mijn voertuigen zet. Dat beslist de worker
   (uitnodigBeloon in worker.js); hier staat alleen wat de klant ziet. De
   bedragen komen van de server, niet uit deze code.

   PUUR (_kern): codeNorm, codeUitUrl, deelTekst, voortgang. Getoetst in
   test-vriend.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SLEUTEL = 'pl_uitnodiging';

  // ── puur ─────────────────────────────────────────────────────────
  // Dezelfde regel als uitnodigCodeNorm() in worker.js: geen O, 0, I, 1 of L.
  function codeNorm(v) {
    var c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length === 8 && c.slice(0, 2) === 'PL') c = c.slice(2);
    return /^[A-HJKMNP-Z2-9]{6}$/.test(c) ? 'PL-' + c : '';
  }
  function codeUitUrl(search) {
    var m = /[?&]u=([^&#]*)/.exec(String(search || ''));
    if (!m) return '';
    try { return codeNorm(decodeURIComponent(m[1])); }
    catch (e) { console.warn('PLVriend: code in de link niet te lezen', e); return ''; }
  }
  function deelTekst(d) {
    return 'Ik gebruik PidLane om mijn auto uit te lezen: foutcodes, live meten en AI-uitleg in gewone taal. ' +
      'Maak een gratis account met mijn code ' + d.mijnCode + ' en je krijgt ' + d.voorVriend +
      ' extra AI-credits zodra je je auto verbindt: ' + d.link;
  }
  function voortgang(d) {
    var r = [];
    r.push(d.beloond === 1 ? '1 vriend beloond' : d.beloond + ' vrienden beloond');
    if (d.verdiend) r.push(d.verdiend + ' credits verdiend');
    if (d.wacht) r.push(d.wacht + ' wacht' + (d.wacht === 1 ? '' : 'en') + ' nog op de eerste verbinding');
    var rest = Math.max(0, Number(d.max || 0) - Number(d.beloond || 0));
    r.push(rest ? 'nog ' + rest + ' te gaan' : 'het maximum is bereikt — je vrienden krijgen hun bonus nog wel');
    return r.join(' · ');
  }

  // ── omgeving ─────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t, ms) { try { if (typeof showToast === 'function') showToast(t, ms || 3500); } catch (e) { console.warn('PLVriend: melding', e); } }
  function lees() { try { return localStorage.getItem(SLEUTEL) || ''; } catch (e) { console.warn('PLVriend: opslag niet te lezen', e); return ''; } }
  function schrijf(v) {
    try { if (v) localStorage.setItem(SLEUTEL, v); else localStorage.removeItem(SLEUTEL); }
    catch (e) { console.warn('PLVriend: opslag niet te schrijven', e); }
  }

  /* Een link met ?u=CODE: de code bewaren tot de registratie (die komt vaak
     pas na de intro en een paar schermen), en de link schoonmaken. */
  function vangLink() {
    try {
      var c = codeUitUrl(location.search);
      if (!c) return '';
      schrijf(c);
      if (window.history && history.replaceState) {
        var u = new URL(location.href); u.searchParams.delete('u');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      return c;
    } catch (e) { console.warn('PLVriend: uitnodigingslink niet verwerkt', e); return ''; }
  }

  var _d = null;

  function venster() {
    var o = el('plVriendOv');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'plVriendOv';
    o.className = 'ov hidden';
    o.style.zIndex = '9960';
    o.addEventListener('click', function (e) { if (e.target === o) sluit(); });
    document.body.appendChild(o);
    return o;
  }
  function teken(inhoud) {
    venster().innerHTML =
      '<div class="modal pl-vriend" role="dialog" aria-label="Nodig een vriend uit"><div class="modal-scroll">' +
        '<div class="mh"><div class="mttl">🎁 Nodig een vriend uit</div></div>' + inhoud +
      '</div><div class="mact"><button class="mbtn" id="plVriendSluit" onclick="PLVriend.sluit()">Sluiten</button></div></div>';
  }
  function open() {
    teken('<div class="pl-vriend-uitleg">Even je code ophalen…</div>');
    venster().classList.remove('hidden');
    if (!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant())) {
      teken('<div class="pl-vriend-uitleg">Uitnodigen kan met een gratis klantaccount. Log uit en kies op het inlogscherm <b>Gratis account</b>.</div>');
      return Promise.resolve(null);
    }
    if (typeof plFetch !== 'function') { teken('<div class="pl-vriend-uitleg">Geen verbinding met de server.</div>'); return Promise.resolve(null); }
    return Promise.resolve(plFetch('/klant/platform', { method: 'POST', json: { actie: 'uitnodiging' } })).then(function (r) {
      return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || ('server gaf ' + r.status)); return d; });
    }).then(function (d) {
      _d = d;
      if (d.beloning && d.beloning.beloond) beloond(d.beloning);
      teken(
        '<div class="pl-vriend-uitleg">Jij krijgt <b>' + esc(d.voorJou) + ' AI-credits</b>, je vriend <b>' + esc(d.voorVriend) + ' extra</b> bovenop het welkomsttegoed. ' +
          'Dat gaat vanzelf zodra je vriend een account maakt met jouw code en daarna voor het eerst een auto verbindt en in Mijn voertuigen zet.</div>' +
        '<div class="pl-vriend-code" id="plVriendCode">' + esc(d.mijnCode) + '</div>' +
        '<div class="pl-vriend-knoppen">' +
          '<button class="mbtn p" id="plVriendDeel" onclick="PLVriend.deel()">📤 Delen</button>' +
          '<button class="mbtn" id="plVriendKopie" onclick="PLVriend.kopieer()">Link kopiëren</button>' +
        '</div>' +
        '<div class="pl-vriend-stand" id="plVriendStand">' + esc(voortgang(d)) + '</div>');
      return d;
    }).catch(function (e) {
      teken('<div class="pl-vriend-uitleg">Je code kon niet worden opgehaald: ' + esc((e && e.message) || e) + '</div>');
      return null;
    });
  }
  function sluit() { var o = el('plVriendOv'); if (o) o.classList.add('hidden'); }
  function deel() {
    if (!_d) return Promise.resolve(false);
    var t = deelTekst(_d);
    try { if (typeof logUsage === 'function') logUsage('vriend', 'deel'); } catch (e) { console.warn('PLVriend: logUsage', e); }
    if (navigator.share) {
      return navigator.share({ title: 'PidLane', text: t }).then(function () { return true; }, function (e) {
        if (e && e.name === 'AbortError') return false;   // de klant sloot het deelmenu
        console.warn('PLVriend: delen mislukt — dan kopiëren', e);
        return kopieer();
      });
    }
    return kopieer();
  }
  function kopieer() {
    if (!_d) return Promise.resolve(false);
    var t = deelTekst(_d);
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(t).then(function () { toast('Gekopieerd — plak het in een bericht'); return true; },
        function (e) { console.warn('PLVriend: kopiëren mislukt', e); toast('Kopiëren lukte niet. Je code: ' + _d.mijnCode, 6000); return false; });
    toast('Je code: ' + _d.mijnCode, 6000);
    return Promise.resolve(false);
  }
  function bewaardeCode() { return codeNorm(lees()); }
  function naRegistratie(u, ingevuld) {
    schrijf('');
    if (u && u.gekoppeld) toast('🎁 Uitnodiging gekoppeld: je krijgt extra AI-credits zodra je je auto verbindt en in Mijn voertuigen zet', 6000);
    else if (ingevuld) toast('Die uitnodigingscode werd niet herkend. Je account is wel aangemaakt.', 6000);
  }
  function beloond(b) {
    toast('🎁 ' + b.credits + ' AI-credits erbij: welkom via een uitnodiging', 6000);
    try { if (window.PLKlant && PLKlant.verversSaldo) PLKlant.verversSaldo(); }
    catch (e) { console.warn('PLVriend: saldo niet ververst', e); }
  }

  window.PLVriend = {
    open: open, sluit: sluit, deel: deel, kopieer: kopieer, bewaardeCode: bewaardeCode,
    naRegistratie: naRegistratie, beloond: beloond, vangLink: vangLink,
    _kern: { codeNorm: codeNorm, codeUitUrl: codeUitUrl, deelTekst: deelTekst, voortgang: voortgang, SLEUTEL: SLEUTEL }
  };
  vangLink();
})();
