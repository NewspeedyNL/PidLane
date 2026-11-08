/* ══════════════════════════════════════════════════════════════════
   pidlane-identiteit.js — PLIdentiteit: welk kenteken hoort bij de auto
   aan de adapter (08-11-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM. Tot 08-11 bevestigde bij elke verbinding met de knop een mens
   het kenteken (de kentekenstap, voorgevuld met "controleer of dit de auto
   is waar je nu in zit"). `pl_kenteken` betekende daardoor "de auto aan de
   adapter", en minstens zes plekken leunden daarop zonder het te zeggen.
   Stil verbinden haalde de mens weg en liet `pl_kenteken` staan als
   globale waarheid. Gevolg, nagebouwd: een nieuwe Mazda werd "Peugeot 208,
   diesel" met het kenteken van de vorige auto, en dat kenteken kwam blijvend
   in het profiel van de Mazda-VIN (PIDLANE-ARCHIEF.md, 08-11-2026 avond).

   DE REGEL. Het kenteken van de verbonden auto is een eigen gegeven met een
   herkomst, en het hangt aan de VIN:
     • elke nieuwe verbinding begint met "onbekend" — alleen een hervatting
       (dezelfde auto, minuten later) houdt het;
     • een VIN met een profiel geeft zijn eigen bevestigde kenteken;
     • een VIN zonder profiel, of geen VIN: onbekend, tot de klant het
       bevestigt (strook, kentekenstap, voertuigkaart, wizard);
     • een andere VIN dan die waarbij het kenteken bevestigd werd: onbekend.
   Het laatst bevestigde kenteken (`pl_kenteken`) blijft bestaan, maar alleen
   als *suggestie* en als "mijn auto" zonder verbinding — nooit meer als
   waarheid over de auto die nu aan de adapter hangt.

   OPSLAG. `pl_id_nu` = { vin, kenteken, bron, t } overleeft een herlaad,
   zodat een hervatting na een rendercrash hetzelfde weet. `pl_kenteken` =
   het laatst bevestigde kenteken (bestaande sleutel, zelfde betekenis voor
   PLZonder, PLWeten en de koopcheck).

   PUUR (_kern): norm, begin, metVin, bevestig, kentekenVoor. Getoetst in
   test-identiteit.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG = { nu: 'pl_id_nu', laatst: 'pl_kenteken' };
  var VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

  // ── puur ─────────────────────────────────────────────────────────
  function norm(k) { return String(k == null ? '' : k).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function normVin(v) { var s = String(v == null ? '' : v).trim().toUpperCase(); return VIN_RE.test(s) ? s : ''; }
  function leeg() { return { vin: '', kenteken: '', bron: '' }; }

  /* Een nieuwe verbinding. Alleen een hervatting (herlaad, dode socket,
     terug in de app — niet een opstart na lang stilstaan) houdt wat er was. */
  function begin(oud, hervat) {
    return hervat && oud ? { vin: oud.vin || '', kenteken: oud.kenteken || '', bron: oud.bron || '' } : leeg();
  }
  /* De VIN is gelezen. Een kenteken dat bij een andere VIN bevestigd werd,
     vervalt. Een kenteken zonder VIN (kentekenstap vóór het protocol) gaat
     naar deze VIN. Daarna: het kenteken uit het profiel van deze VIN. */
  function metVin(id, vin, profielKent) {
    var v = normVin(vin), uit = { vin: id.vin || '', kenteken: id.kenteken || '', bron: id.bron || '' };
    if (!v) return uit;
    if (uit.vin && uit.vin !== v) { uit.kenteken = ''; uit.bron = ''; }
    uit.vin = v;
    if (!uit.kenteken && norm(profielKent).length >= 4) { uit.kenteken = norm(profielKent); uit.bron = 'profiel'; }
    return uit;
  }
  function bevestig(id, kent, bron) {
    var k = norm(kent);
    if (k.length < 4) return id;
    return { vin: id.vin || '', kenteken: k, bron: bron || 'klant' };
  }
  /* Het kenteken dat bij deze VIN in een profiel mag. Alleen als het bij
     déze VIN bevestigd is, of bevestigd werd voordat de VIN bekend was. */
  function kentekenVoor(id, vin) {
    var v = normVin(vin);
    if (!id || !id.kenteken) return '';
    if (!v) return id.vin ? '' : id.kenteken;
    return (!id.vin || id.vin === v) ? id.kenteken : '';
  }

  // ── omgeving ─────────────────────────────────────────────────────
  function lees(k) { try { return localStorage.getItem(k); } catch (e) { console.warn('PLIdentiteit: opslag niet te lezen', e); return null; } }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    catch (e) { console.warn('PLIdentiteit: opslag niet te schrijven', e); }
  }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLIdentiteit: demoMode niet te lezen', e); return false; } }
  function diag(t, soort) { try { if (typeof btDiag === 'function') btDiag('Identiteit: ' + t, soort || 'info'); } catch (e) { console.warn('PLIdentiteit: diag', e); } }

  var _id = null;   // null = sinds de installatie nooit verbonden
  (function laad() {
    try { var o = JSON.parse(lees(OPSLAG.nu) || 'null'); if (o && typeof o === 'object') _id = { vin: o.vin || '', kenteken: o.kenteken || '', bron: o.bron || '' }; }
    catch (e) { console.warn('PLIdentiteit: pl_id_nu onleesbaar — opnieuw begonnen', e); _id = null; }
  })();
  function bewaar() { schrijf(OPSLAG.nu, _id ? JSON.stringify({ vin: _id.vin, kenteken: _id.kenteken, bron: _id.bron, t: Date.now() }) : null); }
  function profielKenteken(vin) {
    var v = normVin(vin); if (!v) return '';
    try { var p = JSON.parse(lees('pl_vinprof_' + v) || 'null'); return norm(p && p.kenteken); }
    catch (e) { console.warn('PLIdentiteit: profiel onleesbaar', e); return ''; }
  }

  // ── wat de app ermee doet ────────────────────────────────────────
  var api = {
    /* connectSerial(): elke verbinding. hervat = true alleen voor een echte
       hervatting (zelfde auto). */
    begin: function (hervat) {
      if (isDemo()) return;
      _id = begin(_id, !!hervat); bewaar();
      diag(hervat && _id.kenteken ? 'hervat — kenteken ' + _id.kenteken + ' blijft' : 'nieuwe verbinding — kenteken onbekend tot de VIN of de klant het zegt');
    },
    /* De VIN is gelezen. Geeft het kenteken dat nu bij de auto hoort, of ''. */
    naVin: function (vin) {
      if (isDemo()) return '';
      _id = metVin(_id || leeg(), vin, profielKenteken(vin)); bewaar();
      if (_id.bron === 'profiel') diag('kenteken ' + _id.kenteken + ' uit het profiel van deze VIN');
      return _id.kenteken;
    },
    /* De klant (of een profiel) zegt welk kenteken het is. Ook het laatst
       bevestigde kenteken, voor PLZonder en als suggestie. */
    bevestig: function (kent, bron) {
      if (isDemo()) return '';
      var k = norm(kent); if (k.length < 4) return '';
      _id = bevestig(_id || leeg(), k, bron); bewaar();
      schrijf(OPSLAG.laatst, k);
      return k;
    },
    /* Het kenteken van de auto waar de data over gaat: de verbonden (of
       laatst verbonden) auto. Is er sinds de installatie nooit verbonden,
       dan "mijn auto" van PLZonder. Onbevestigd = ''. */
    kenteken: function () { return _id ? _id.kenteken : norm(lees(OPSLAG.laatst)); },
    bekend: function () { return !!(_id && _id.kenteken); },
    /* Het kenteken dat in een profiel van deze VIN mag (saveVinProfile). */
    kentekenVoor: function (vin) { return kentekenVoor(_id, vin); },
    /* Het laatst bevestigde kenteken: alleen als voorinvulling met
       "controleer", nooit als antwoord. */
    laatst: function () { return norm(lees(OPSLAG.laatst)); },
    staat: function () { return _id ? { vin: _id.vin, kenteken: _id.kenteken, bron: _id.bron } : null; },
    _kern: { norm: norm, normVin: normVin, begin: begin, metVin: metVin, bevestig: bevestig, kentekenVoor: kentekenVoor, OPSLAG: OPSLAG }
  };
  window.PLIdentiteit = api;
})();
