/* ══════════════════════════════════════════════════════════════════
   pidlane-help.js — PLHelp: de handleiding in de app
   ──────────────────────────────────────────────────────────────────
   Twee dingen:
   1. Een venster met de handleiding: inhoudsopgave, zoeken, onderwerpen en
      veelgestelde vragen. Openen met PLHelp.open() of PLHelp.open('check').
      Menu: Meer → 📘 Handleiding; ook een link op het inlog- en verbindscherm.
   2. Kleine glazen rondjes met een i op knoppen (tot 30-09-2026 een oranje !). Tik erop voor een korte uitleg;
      de knop zelf wordt niet ingedrukt. Uit te zetten in Meer.

   De tekst staat NIET hier maar in pidlane-help-inhoud.js (PL_HULP). Dit
   bestand weet niets over de app behalve drie knoppen in DOE hieronder.

   CONTACT
   Er is geen eigen formulier. "Meld een bug" opent de bestaande melder
   (openBugReport in pidlane-auth.js). Eén melder, één plek waar meldingen
   binnenkomen.

   HOE DE UITROEPTEKENS AAN HUN KNOP KOMEN
   Elke 1,5 s (alleen als het tabblad zichtbaar is en de tips aanstaan) zoekt
   deze module de ankers uit PL_HULP.tips op en zet er een ! in als die er nog
   niet in zit. Bewust geen MutationObserver: de live meters herschrijven de
   DOM vele keren per seconde, en dan zou elke meterstand hier een ronde
   kosten. Elf querySelectors per 1,5 s kosten niets.
   Een tik op een ! wordt in de capture-fase op document afgevangen. Daardoor
   komt hij nooit bij de onclick van de knop aan.

   TERUGKNOP
   Het venster en de uitleg hebben elk een ✕ in een position:fixed houder;
   appBack() (pidlane-archief.js) vindt die vanzelf.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG_TIPS = 'pl_help_tips';   // '0' = uit; anders aan
  var INTERVAL_MS = 1500;

  /* Wat een knop in de handleiding mag openen. Het venster gaat eerst
     dicht: die vensters liggen niet allemaal boven dit venster. */
  var DOE = {
    bug: function () { if (typeof openBugReport === 'function') openBugReport(); else melding('De bugmelder is niet geladen'); },
    privacy: function () { if (typeof openPrivacy === 'function') openPrivacy(); else melding('Het privacyscherm is niet geladen'); },
    logboek: function () { if (typeof openLogboek === 'function') openLogboek(); else melding('Het logboek is niet geladen'); }
  };

  var _ov = null, _tip = null, _vorigeFocus = null, _timer = null;

  function inhoud() { return window.PL_HULP || null; }

  function melding(t) {
    console.warn('PLHelp: ' + t);
    if (typeof showToast === 'function') showToast(t);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function onderwerp(id) {
    var h = inhoud();
    if (!h) return null;
    for (var i = 0; i < h.onderwerpen.length; i++) if (h.onderwerpen[i].id === id) return h.onderwerpen[i];
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  //  HET VENSTER
  // ════════════════════════════════════════════════════════════════
  function mediaHtml(m) {
    var bij = m.tekst ? '<figcaption>' + esc(m.tekst) + '</figcaption>' : '';
    if (m.soort === 'video') {
      return '<figure class="plh-media"><video src="' + esc(m.src) + '" controls playsinline preload="metadata"></video>' + bij + '</figure>';
    }
    return '<figure class="plh-media"><img src="' + esc(m.src) + '" alt="' + esc(m.tekst || '') + '" loading="lazy">' + bij + '</figure>';
  }

  function onderwerpHtml(o) {
    var zie = (o.zie || []).map(function (id) {
      var z = onderwerp(id);
      return z ? '<a data-hulp="' + esc(id) + '">' + esc(z.titel) + '</a>' : '';
    }).filter(Boolean);
    return '<section class="plh-ond" id="plh-o-' + esc(o.id) + '" data-plh-ond="' + esc(o.id) + '">' +
      '<h3>' + esc(o.titel) + '</h3>' +
      o.tekst +
      (o.media || []).map(mediaHtml).join('') +
      (zie.length ? '<p class="plh-zie">Zie ook: ' + zie.join(' · ') + '</p>' : '') +
      '</section>';
  }

  function bouw() {
    var h = inhoud();
    if (!h) { melding('De handleiding is niet geladen'); return null; }

    var toc = h.groepen.map(function (g) {
      var items = h.onderwerpen.filter(function (o) { return o.groep === g.id; }).map(function (o) {
        return '<li><a data-hulp="' + esc(o.id) + '">' + esc(o.titel) + '</a></li>';
      }).join('');
      return '<div class="plh-toc-g"><div class="plh-toc-k">' + esc(g.titel) + '</div><ul>' + items + '</ul></div>';
    }).join('');

    var body = h.groepen.map(function (g) {
      var ond = h.onderwerpen.filter(function (o) { return o.groep === g.id; });
      if (!ond.length) return '';
      return '<div class="plh-groep" data-plh-groep="' + esc(g.id) + '"><h2>' + esc(g.titel) + '</h2>' +
        ond.map(onderwerpHtml).join('') + '</div>';
    }).join('');

    var faq = '<div class="plh-groep" data-plh-groep="faq" id="plh-o-faq"><h2>Veelgestelde vragen</h2>' +
      h.faq.map(function (f) {
        return '<details class="plh-faq"><summary>' + esc(f.v) + '</summary><p>' + esc(f.a) +
          (f.zie && onderwerp(f.zie) ? ' <a data-hulp="' + esc(f.zie) + '">Meer hierover</a>' : '') + '</p></details>';
      }).join('') + '</div>';

    var versie = (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : '';
    var gc = h.gecontroleerd || {};
    var oud = versie && gc.app && versie !== gc.app;
    var voet = '<p class="plh-voet">Deze handleiding is nagelopen op ' + esc(gc.datum || '?') + ' tegen versie ' + esc(gc.app || '?') + '.' +
      (oud ? ' Je gebruikt versie ' + esc(versie) + ': er kan iets anders zijn dan hier staat.' : '') + '</p>';

    var ov = document.createElement('div');
    ov.id = 'plHelpOv';
    ov.className = 'plh-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'plhTitel');
    ov.innerHTML =
      '<div class="plh-kop">' +
        '<button type="button" class="plh-x" data-plh-sluit aria-label="Sluiten">✕</button>' +
        '<h1 id="plhTitel">📘 Handleiding</h1>' +
      '</div>' +
      '<div class="plh-zoekrij"><input type="search" id="plhZoek" class="plh-zoek" placeholder="Zoek, bijvoorbeeld: wissen, bluetooth, tokens" aria-label="Zoeken in de handleiding" autocomplete="off"></div>' +
      '<div class="plh-body" id="plhBody">' +
        '<nav class="plh-toc" aria-label="Inhoud">' + toc +
          '<div class="plh-toc-g"><div class="plh-toc-k">Vragen</div><ul><li><a data-hulp="faq">Veelgestelde vragen</a></li></ul></div></nav>' +
        '<p class="plh-geen" id="plhGeen" hidden>Niets gevonden. Probeer een ander woord, of <a data-hulp="contact">neem contact op</a>.</p>' +
        body + faq + voet +
      '</div>';

    ov.addEventListener('click', klikInVenster);
    ov.addEventListener('input', function (e) { if (e.target && e.target.id === 'plhZoek') zoek(e.target.value); });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') sluit(); });
    document.body.appendChild(ov);
    return ov;
  }

  function klikInVenster(e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('[data-plh-sluit]')) { sluit(); return; }
    var doe = t.closest('[data-hulp-doe]');
    if (doe) {
      var f = DOE[doe.getAttribute('data-hulp-doe')];
      if (!f) { melding('Onbekende actie: ' + doe.getAttribute('data-hulp-doe')); return; }
      sluit();
      f();
      return;
    }
    var link = t.closest('[data-hulp]');
    if (link) { e.preventDefault(); naar(link.getAttribute('data-hulp')); }
  }

  function naar(id) {
    var z = document.getElementById('plhZoek');
    if (z && z.value) { z.value = ''; zoek(''); }
    var doel = document.getElementById('plh-o-' + id);
    if (!doel) { melding('Onderwerp niet gevonden: ' + id); return; }
    doel.scrollIntoView({ block: 'start' });
    doel.classList.add('plh-flits');
    setTimeout(function () { doel.classList.remove('plh-flits'); }, 1200);
  }

  function zoek(waarde) {
    var v = String(waarde || '').trim().toLowerCase();
    var ov = _ov; if (!ov) return;
    var raak = 0;
    var blokken = ov.querySelectorAll('.plh-ond, .plh-faq');
    for (var i = 0; i < blokken.length; i++) {
      var b = blokken[i];
      var ok = !v || b.textContent.toLowerCase().indexOf(v) !== -1;
      b.hidden = !ok;
      if (ok && v) raak++;
      if (b.tagName === 'DETAILS') b.open = !!(v && ok);
    }
    var groepen = ov.querySelectorAll('.plh-groep');
    for (var g = 0; g < groepen.length; g++) {
      groepen[g].hidden = !!v && !groepen[g].querySelector('.plh-ond:not([hidden]), .plh-faq:not([hidden])');
    }
    var toc = ov.querySelector('.plh-toc'); if (toc) toc.hidden = !!v;
    var geen = document.getElementById('plhGeen'); if (geen) geen.hidden = !(v && !raak);
  }

  function open(id) {
    sluitTip();
    try { if (typeof closeKebab === 'function') closeKebab(); } catch (e) { console.warn('PLHelp: menu niet gesloten', e); }
    if (!_ov) _ov = bouw();
    if (!_ov) return;
    _vorigeFocus = document.activeElement;
    _ov.classList.add('plh-aan');
    var b = document.getElementById('plhBody'); if (b) b.scrollTop = 0;
    if (id) naar(id);
    var x = _ov.querySelector('[data-plh-sluit]'); if (x) x.focus();
  }

  function sluit() {
    if (!_ov || !_ov.classList.contains('plh-aan')) return;
    _ov.classList.remove('plh-aan');
    if (_vorigeFocus && _vorigeFocus.focus && document.contains(_vorigeFocus)) _vorigeFocus.focus();
  }

  function isOpen() { return !!(_ov && _ov.classList.contains('plh-aan')); }

  // ════════════════════════════════════════════════════════════════
  //  DE UITROEPTEKENS
  // ════════════════════════════════════════════════════════════════
  function tipsAan() {
    // Standaard uit sinds 02-10-2026: alleen wie ze zelf aanzet ziet de rondjes.
    try { return localStorage.getItem(OPSLAG_TIPS) === '1'; }
    catch (e) { /* stil: opslag kan geblokkeerd zijn; dan staan ze uit */ return false; }
  }

  function zetTips(aan) {
    try { localStorage.setItem(OPSLAG_TIPS, aan ? '1' : '0'); }
    catch (e) { console.warn('PLHelp: keuze voor de uitroeptekens niet op te slaan', e); }
    if (aan) plaats(); else haalWeg();
    verversSchakelaar();
    if (typeof showToast === 'function') showToast(aan ? 'Uitleg bij knoppen aan' : 'Uitleg bij knoppen uit — de handleiding staat in Meer');
  }

  function wissel() { zetTips(!tipsAan()); }

  function verversSchakelaar() {
    var s = document.getElementById('kbHelpTips');
    if (s) s.setAttribute('aria-checked', tipsAan() ? 'true' : 'false');
  }

  function plaats() {
    var h = inhoud();
    if (!h || !tipsAan()) return 0;
    var n = 0;
    for (var i = 0; i < h.tips.length; i++) {
      var tip = h.tips[i], el = null;
      try { el = document.querySelector(tip.anker); }
      catch (e) { console.warn('PLHelp: ongeldig anker voor tip ' + tip.id, e); continue; }
      if (!el || el.querySelector(':scope > .plh-i')) continue;
      // In een menuregel staat het ! in de tekstregel, vóór een schakelaar;
      // elders klein in de hoek, zodat de knop zijn vorm houdt.
      var inRegel = el.classList.contains('kebab-item');
      if (!inRegel && getComputedStyle(el).position === 'static') el.classList.add('plh-houder');
      var i2 = document.createElement('span');
      i2.className = 'plh-i' + (inRegel ? ' plh-i-regel' : '');
      i2.setAttribute('data-plh-tip', tip.id);
      i2.setAttribute('aria-hidden', 'true');   // de uitleg staat ook in de handleiding
      i2.textContent = 'i';
      var sw = inRegel ? el.querySelector(':scope > .kb-sw') : null;
      if (sw) el.insertBefore(i2, sw); else el.appendChild(i2);
      n++;
    }
    return n;
  }

  function haalWeg() {
    var al = document.querySelectorAll('.plh-i');
    for (var i = 0; i < al.length; i++) al[i].remove();
    sluitTip();
  }

  function tipVan(id) {
    var h = inhoud(); if (!h) return null;
    for (var i = 0; i < h.tips.length; i++) if (h.tips[i].id === id) return h.tips[i];
    return null;
  }

  function toonTip(badge) {
    var tip = tipVan(badge.getAttribute('data-plh-tip'));
    if (!tip) return;
    sluitTip();
    var z = onderwerp(tip.onderwerp);
    var t = document.createElement('div');
    t.id = 'plHelpTip';
    t.className = 'plh-tip';
    t.setAttribute('role', 'dialog');
    t.setAttribute('aria-label', 'Uitleg');
    t.innerHTML =
      '<button type="button" class="plh-tip-x" data-plh-tip-sluit aria-label="Sluiten">✕</button>' +
      '<p>' + esc(tip.tekst) + '</p>' +
      (z ? '<button type="button" class="plh-tip-meer" data-plh-tip-meer="' + esc(z.id) + '">Meer in de handleiding →</button>' : '');
    document.body.appendChild(t);

    // Onder de knop als dat past, anders erboven; nooit buiten beeld.
    var r = badge.getBoundingClientRect();
    var w = t.offsetWidth, hgt = t.offsetHeight, m = 8;
    var x = Math.min(Math.max(m, r.right - w), window.innerWidth - w - m);
    var y = r.bottom + 6;
    if (y + hgt > window.innerHeight - m) y = Math.max(m, r.top - hgt - 6);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    _tip = t;
    var x2 = t.querySelector('.plh-tip-x'); if (x2) x2.focus();
  }

  function sluitTip() {
    if (_tip) { _tip.remove(); _tip = null; }
  }

  /* Capture-fase op document: een tik op een ! bereikt de knop eronder
     nooit. pointerdown en mousedown ook tegenhouden, want sommige knoppen
     reageren op ingedrukt houden. */
  function vang(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var badge = t.closest('.plh-i');
    if (badge) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e.type === 'click') toonTip(badge);
      return;
    }
    if (e.type !== 'click' || !_tip) return;
    if (t.closest('[data-plh-tip-sluit]')) { sluitTip(); return; }
    var meer = t.closest('[data-plh-tip-meer]');
    if (meer) { var id = meer.getAttribute('data-plh-tip-meer'); sluitTip(); open(id); return; }
    if (!_tip.contains(t)) sluitTip();   // tik ernaast sluit de uitleg; die tik gaat gewoon door
  }

  function tik() {
    if (document.hidden) return;
    plaats();
  }

  function start() {
    document.addEventListener('click', vang, true);
    document.addEventListener('pointerdown', vang, true);
    document.addEventListener('mousedown', vang, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _tip) sluitTip(); });
    window.addEventListener('scroll', sluitTip, true);
    verversSchakelaar();
    plaats();
    if (!_timer) _timer = setInterval(tik, INTERVAL_MS);
  }

  window.PLHelp = {
    open: open,
    sluit: sluit,
    isOpen: isOpen,
    wisselTips: wissel,
    zetTips: zetTips,
    tipsAan: tipsAan,
    plaatsTips: plaats,
    _doe: DOE
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
