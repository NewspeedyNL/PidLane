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

  // Het lijnicoon per toestand, uit PL_ICOON (pidlane-data.js).
  var ICOON = {
    DRAAIT_STIL: 'motor', DRAAIT_RIJDT: 'motor', ACCU_RIJDT: 'accu', STARTSTOP: 'startstop',
    UIT_VOOR_START: 'motor', START: 'motor', ONBEKEND: 'motor'
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
    if (!res) { el.style.display = 'none'; el.textContent = ''; el._ab = ''; return false; }

    var kleur = KLEUR[res.toestand] || KLEUR.ONBEKEND;
    // RUSTIGER SINDS 02-10-2026 (uit het gebruik: "te aanwezig"). Tot die datum
    // was dit een gekleurd blok met een 🔥 en vette tekst in de toestandskleur,
    // en dat las bij gewoon rijden als een waarschuwing. Nu een smalle regel in
    // de gewone tekstkleur: een gekleurd stipje en een lijnicoon zeggen de
    // toestand, de tekst zegt wat er gebeurt. Opvallen hoort bij een probleem,
    // en "de motor draait" is er geen.
    el.className = 'ab-regel';
    el.style.cssText = 'display:flex;--ab-kleur:' + kleur + ';';
    var tekst = window.PLAandrijving ? window.PLAandrijving.balkTekst(res) : res.label;
    if (res.emoji && tekst.indexOf(res.emoji + ' ') === 0) tekst = tekst.slice(res.emoji.length + 1);
    var ic = ICOON[res.toestand] || 'motor';
    var svg = (window.PL_ICOON && window.PL_ICOON[ic])
      ? '<svg class="ab-ic" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + window.PL_ICOON[ic] + '</g></svg>'
      : '';
    // Alleen opnieuw opbouwen als er iets veranderde: dit loopt elke pollronde.
    var sleutel = res.toestand + '|' + tekst;
    if (el._ab !== sleutel) {
      el.innerHTML = '<span class="ab-stip" aria-hidden="true"></span>' + svg + '<span class="ab-tx"></span>';
      el.querySelector('.ab-tx').textContent = tekst;
      el._ab = sleutel;
    }
    // De onderbouwing in de tooltip: welke getallen dit oordeel dragen.
    el.title = res.waarom ? ('Aandrijving: ' + res.label + ' — ' + res.waarom) : res.label;
    el.setAttribute('data-toestand', res.toestand);
    el.setAttribute('data-zekerheid', res.zekerheid);
    return true;
  }

  window.PLAandrijfbalk = { ververs: ververs, kleuren: KLEUR };
})();
