/* pidlane-aandrijfbalk.js — het scherm bij pidlane-aandrijving.js (17-09-2026)
   ═══════════════════════════════════════════════════════════════════════
   Eén regel bovenin de Live-weergave die zegt wat de aandrijving nu doet.
   Dit bestand beslist niets: het toont wat `PLAandrijving.bepaal()` heeft
   vastgesteld. Dezelfde splitsing als pidlane-waakronde.js (meten) en
   pidlane-waakvenster.js (tonen) — een oordeel en zijn weergave horen niet in
   één bestand, want dan is het oordeel niet meer los te toetsen.

   WAAROM ÉÉN REGEL EN GEEN PANEEL
   De vraag is "wat doet de auto nu", en die hoort in één oogopslag te lezen
   zijn terwijl je rijdt. De onderbouwing (`waarom`) hangt in de tooltip: wie
   het wil nazien kan dat, wie rijdt wordt er niet mee lastiggevallen.

   DE ZEKERHEID STAAT ERBIJ, EN DAT IS GEEN VERSIERING
   "Motor uit" met een lage zekerheid betekent dat de app niet weet of de motor
   al gelopen heeft — bijvoorbeeld omdat 011F niet aangevinkt is. Die twee
   gevallen apart tonen was een expliciet besluit: samenvatten tot "motor uit"
   leest als een feit, en dat is het dan niet.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Per toestand één kleur. De achtergrond is dezelfde kleur op ~13%, zoals de
  // chips elders in de app (zie pidlane-graph.js) — dat werkt in beide thema's
  // zonder een eigen regel in pidlane.css.
  var KLEUR = {
    DRAAIT_STIL: '#f59e0b',
    DRAAIT_RIJDT: '#f97316',
    ACCU_RIJDT: '#22c55e',
    STARTSTOP: '#5e7cff',
    UIT_VOOR_START: '#94a3b8',
    START: '#eab308',
    ONBEKEND: '#64748b'
  };

  function _el() {
    try { return document.getElementById('aandrijfBalk'); } catch (e) { return null; }
  }

  /* ververs(res) — res is de uitkomst van PLAandrijving.tik(), of null als er
     geen verbinding is. null verbergt de balk: een toestandsregel zonder
     meting eronder hoort er niet te staan. */
  function ververs(res) {
    var el = _el();
    if (!el) return false;
    if (!res) { el.style.display = 'none'; el.textContent = ''; return false; }

    var kleur = KLEUR[res.toestand] || KLEUR.ONBEKEND;
    el.style.cssText =
      'display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:7px 10px;' +
      'border-radius:8px;font-size:13px;font-weight:800;line-height:1.25;' +
      'background:' + kleur + '22;border:1px solid ' + kleur + ';color:' + kleur + ';';
    el.textContent = window.PLAandrijving ? window.PLAandrijving.balkTekst(res) : res.label;
    // De onderbouwing in de tooltip: welke getallen dit oordeel dragen.
    el.title = res.waarom ? ('Aandrijving: ' + res.label + ' — ' + res.waarom) : res.label;
    el.setAttribute('data-toestand', res.toestand);
    el.setAttribute('data-zekerheid', res.zekerheid);
    return true;
  }

  window.PLAandrijfbalk = { ververs: ververs, kleuren: KLEUR };
})();
