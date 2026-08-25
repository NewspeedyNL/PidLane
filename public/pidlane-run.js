/* ═══════════════════════════════════════════════════════════════════
   pidlane-run.js — vierde chip in de topbar: wat draait er nu?
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Er lopen vijf dingen op de achtergrond die de gebruiker aan of uit kan
   zetten, en geen van vijf is van buiten te zien:

     rit-monitor     PLMon         merkt afwijkingen op tijdens het rijden
     bulk-recorder   PLBulk        neemt alles op, 1 Hz
     waakronde       PLWaak        loopt sensoren langs op stille storingen
     caravan-modus   caravanActive gewichts- en vermogensmeting
     rit-analyse     ritActive     fasenmeting van tien minuten

   De waakronde kon aanstaan zonder dat er ergens iets van bleek. De
   bulk-recorder had een eigen scherm, de rit-monitor een knop op zijn
   eigen pane, caravan en rit-analyse zaten in hun sheet. Vijf plekken
   voor één vraag: draait er nu iets, en wat?

   Deze chip beantwoordt die vraag met een kleur. Groen = er loopt iets.

   SCHAKELAARS TEGENOVER SESSIES

   De eerste drie zijn echte schakelaars: aan, uit, klaar. De laatste
   twee zijn sessies met fasen. stopCaravan() maakt meteen het rapport en
   stopRitAnalyse() breekt de fasenreeks af — halverwege uitzetten gooit
   een lopende meting weg. Vandaar de bevestiging bij het stoppen, en
   alleen daar; aanzetten mag zonder.

   HOE DE STAAT WORDT GELEZEN — LET OP

   caravanActive en ritActive zijn top-level `let` in een klassiek script
   zonder IIFE. Die staan in script-scope, niet op window:

     typeof caravanActive !== 'undefined'   werkt
     window.caravanActive                   is ALTIJD undefined

   Wie het paneel op die tweede vorm bouwt, krijgt vijf schakelaars die
   permanent op uit staan en merkt dat pas in de auto. Alle leesfuncties
   hieronder gebruiken daarom de bare naam in een try.

   Dit scherm stuurt alleen bestaande functies aan. Het wrapt niets en
   houdt geen eigen staat bij: wat je ziet is uit de bron gelezen op het
   moment van tekenen.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const RUN_VERSIE = '1.0 (21-08-2026)';

  let _tikker = null;      // ververst de dot terwijl de app openstaat
  let _open = false;

  // ── staat lezen ───────────────────────────────────────────────────
  // Elke lezer geeft {aan, uit, detail} of null als de module ontbreekt.
  // null is iets anders dan uit: een ontbrekende module hoort niet als
  // "staat uit" getoond te worden, want dan lijkt hij aanzetbaar.

  function _monitor() {
    if (typeof PLMon === 'undefined' || !PLMon) return null;
    const gewenst = !!PLMon.userAan;
    const draait = !!PLMon.active;
    return {
      aan: gewenst,
      draait: draait,
      detail: gewenst
        ? (draait ? 'kijkt mee' : 'aan, maar wacht op een verbinding')
        : 'uit'
    };
  }

  function _bulk() {
    if (typeof PLBulk === 'undefined' || !PLBulk || typeof PLBulk.status !== 'function') return null;
    let s = {};
    try { s = PLBulk.status() || {}; } catch (e) { return null; }
    return {
      aan: !!s.actief,
      draait: !!s.actief && !s.gepauzeerd,
      detail: !s.actief ? 'uit'
        : (s.gepauzeerd ? 'gepauzeerd — ' + (s.regels || 0) + ' regels'
                        : 'neemt op — ' + (s.regels || 0) + ' regels')
    };
  }

  function _waak() {
    if (typeof PLWaak === 'undefined' || !PLWaak || typeof PLWaak.actief !== 'function') return null;
    let aan = false, bevindingen = 0;
    try { aan = !!PLWaak.actief(); } catch (e) { return null; }
    try { bevindingen = (PLWaak.bevindingen() || []).length; } catch(e){ console.warn('PLWaak.bevindingen mislukt:', e); }
    return {
      aan: aan,
      draait: aan,
      detail: !aan ? 'uit' : (bevindingen ? bevindingen + ' sensor(en) om in de gaten te houden' : 'loopt rond, niets bijzonders')
    };
  }

  function _caravan() {
    let aan;
    try { aan = (typeof caravanActive !== 'undefined') ? !!caravanActive : undefined; } catch (e) { aan = undefined; }
    if (aan === undefined) return null;
    return { aan: aan, draait: aan, detail: aan ? 'rit loopt' : 'uit', sessie: true };
  }

  function _rit() {
    let aan;
    try { aan = (typeof ritActive !== 'undefined') ? !!ritActive : undefined; } catch (e) { aan = undefined; }
    if (aan === undefined) return null;
    return { aan: aan, draait: aan, detail: aan ? 'fasenmeting loopt' : 'uit', sessie: true };
  }

  // De volgorde hier is de volgorde in het paneel: eerst wat je tijdens
  // een gewone rit aanzet, dan de twee die een meting starten.
  const ITEMS = [
    { id: 'monitor', icoon: '🔔', naam: 'Rit-monitor',   uitleg: 'let tijdens het rijden op afwijkingen',      lees: _monitor,  schakel: _schakelMonitor },
    { id: 'bulk',    icoon: '⏺',  naam: 'Bulk-recorder', uitleg: 'neemt elke seconde alle sensoren op',        lees: _bulk,     schakel: _schakelBulk },
    { id: 'waak',    icoon: '👁', naam: 'Waakronde',      uitleg: 'loopt stille sensoren langs op storingen',   lees: _waak,     schakel: _schakelWaak },
    { id: 'caravan', icoon: '🚐', naam: 'Caravan-modus',  uitleg: 'meet trekgewicht en vermogen — hele rit',    lees: _caravan,  schakel: _schakelCaravan },
    { id: 'rit',     icoon: '🎒', naam: 'Rit-analyse',    uitleg: 'fasenmeting van ongeveer tien minuten',      lees: _rit,      schakel: _schakelRit }
  ];

  // ── schakelen ─────────────────────────────────────────────────────
  // Elke schakelfunctie roept alleen bestaande app-functies aan. Er wordt
  // hier niets nagebouwd: gaat er iets mis in de onderliggende module, dan
  // hoort die zijn eigen melding te geven.

  function _schakelMonitor() {
    if (typeof toggleRitMonitor !== 'function') return 'Rit-monitor is niet beschikbaar';
    toggleRitMonitor();
    return null;
  }

  function _schakelBulk() {
    const s = _bulk();
    if (!s) return 'Bulk-recorder is niet beschikbaar';
    try {
      if (s.aan) PLBulk.stop(); else PLBulk.start();
    } catch (e) { return 'Bulk-recorder: ' + (e.message || e); }
    return null;
  }

  function _schakelWaak() {
    if (typeof PLWaak === 'undefined' || typeof PLWaak.schakel !== 'function') return 'Waakronde is niet beschikbaar';
    try { PLWaak.schakel(); } catch (e) { return 'Waakronde: ' + (e.message || e); }
    return null;
  }

  function _schakelCaravan() {
    const s = _caravan();
    if (!s) return 'Caravan-modus is niet beschikbaar';
    if (s.aan) {
      if (typeof stopCaravan !== 'function') return 'stopCaravan ontbreekt';
      try { stopCaravan(); } catch (e) { return 'Caravan: ' + (e.message || e); }
    } else {
      if (typeof startCaravan !== 'function') return 'startCaravan ontbreekt';
      try { startCaravan(); } catch (e) { return 'Caravan: ' + (e.message || e); }
    }
    return null;
  }

  function _schakelRit() {
    const s = _rit();
    if (!s) return 'Rit-analyse is niet beschikbaar';
    if (s.aan) {
      if (typeof stopRitAnalyse !== 'function') return 'stopRitAnalyse ontbreekt';
      try { stopRitAnalyse(); } catch (e) { return 'Rit-analyse: ' + (e.message || e); }
    } else {
      if (typeof startRitAnalyse !== 'function') return 'startRitAnalyse ontbreekt';
      try { startRitAnalyse(); } catch (e) { return 'Rit-analyse: ' + (e.message || e); }
    }
    return null;
  }

  // ── verbinding ────────────────────────────────────────────────────
  // Caravan en rit-analyse starten zelf niet zonder adapter (allebei via
  // preAnalysisCheck). Dat vooraf tonen scheelt een toast die niets uitlegt.
  function _verbonden() {
    try {
      const c = (typeof connected !== 'undefined') && connected;
      const d = (typeof demoMode !== 'undefined') && demoMode;
      return !!(c || d);
    } catch (e) { return false; }
  }

  // ── de dot ────────────────────────────────────────────────────────
  function _telDraaiend() {
    let n = 0;
    ITEMS.forEach(function (it) {
      let s = null;
      try { s = it.lees(); } catch(e){ console.warn('it.lees mislukt:', e); }
      if (s && s.draait) n++;
    });
    return n;
  }

  function verversDot() {
    const dot = document.getElementById('rdot');
    if (!dot) return;
    const n = _telDraaiend();
    dot.className = 'tdot' + (n ? ' g' : '');
    const chip = document.getElementById('runChip');
    if (chip) chip.title = n ? n + ' achtergrondtaak/taken actief' : 'Niets actief op de achtergrond';
    const tel = document.getElementById('runTel');
    if (tel) tel.textContent = n ? String(n) : '';
  }

  // ── het paneel ────────────────────────────────────────────────────
  function _regel(it) {
    let s = null;
    try { s = it.lees(); } catch(e){ console.warn('it.lees mislukt:', e); }
    const ontbreekt = !s;
    const aan = !!(s && s.aan);
    const geblokkeerd = !!(s && s.sessie && !aan && !_verbonden());
    const kleur = aan ? 'var(--gn)' : 'var(--bd)';
    const knopTekst = ontbreekt ? 'n.v.t.' : (aan ? 'AAN' : 'UIT');
    const knopStijl = ontbreekt
      ? 'background:var(--sur2);color:var(--tx3);border:1px solid var(--bd);cursor:default'
      : (aan ? 'background:var(--gn);color:#fff;border:0;cursor:pointer'
             : 'background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);cursor:pointer');
    const detail = ontbreekt ? 'module niet geladen'
      : (geblokkeerd ? 'verbind eerst een adapter' : (s.detail || ''));

    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 12px;background:var(--sur);' +
             'border:1px solid ' + kleur + ';border-radius:10px;opacity:' + (ontbreekt || geblokkeerd ? '.55' : '1') + '">' +
             '<span style="font-size:17px;flex-shrink:0">' + it.icoon + '</span>' +
             '<div style="flex:1;min-width:0">' +
               '<div style="font:700 13px var(--f);color:var(--tx)">' + it.naam + '</div>' +
               '<div style="font:400 11px var(--f);color:var(--tx3);margin-top:1px">' + it.uitleg + '</div>' +
               '<div style="font:600 11px var(--f);color:' + (aan ? 'var(--gn)' : 'var(--tx3)') + ';margin-top:3px">' + detail + '</div>' +
             '</div>' +
             '<button ' + (ontbreekt || geblokkeerd ? 'disabled ' : 'onclick="PLRun.schakel(\'' + it.id + '\')" ') +
               'style="' + knopStijl + ';border-radius:8px;padding:8px 13px;font:800 11px var(--f);flex-shrink:0;min-width:52px">' +
               knopTekst + '</button>' +
           '</div>';
  }

  function teken() {
    const box = document.getElementById('runLijst');
    if (!box) return;
    box.innerHTML = ITEMS.map(_regel).join('');
    verversDot();
  }

  function open() {
    let ov = document.getElementById('runOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'runOv';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9976;background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
      ov.innerHTML =
        '<div style="background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:420px;width:100%;margin-top:44px">' +
          '<div style="display:flex;align-items:center;gap:9px;margin-bottom:4px">' +
            '<div style="font:800 15px var(--f);color:var(--tx)">▶ Wat draait er nu</div>' +
            '<button onclick="PLRun.sluit()" style="margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:6px 13px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
          '</div>' +
          '<div style="font:400 11px var(--f);color:var(--tx3);margin-bottom:11px">Alles hieronder loopt op de achtergrond en kost buscapaciteit. Wat uit staat, meet niet mee.</div>' +
          '<div id="runLijst" style="display:flex;flex-direction:column;gap:8px"></div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.style.display = 'flex';
    _open = true;
    teken();
  }

  function sluit() {
    const ov = document.getElementById('runOv');
    if (ov) ov.style.display = 'none';
    _open = false;
    verversDot();
  }

  function schakel(id) {
    const it = ITEMS.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    let s = null;
    try { s = it.lees(); } catch(e){ console.warn('it.lees mislukt:', e); }

    // Een sessie afbreken gooit een lopende meting weg — daar hoort een
    // vraag bij. Aanzetten niet: dat kost hooguit buscapaciteit.
    if (s && s.sessie && s.aan) {
      const ok = window.confirm(it.naam + ' nu stoppen?\n\nDe meting die loopt wordt afgebroken en telt niet meer mee.');
      if (!ok) return;
    }

    let fout = null;
    try { fout = it.schakel(); } catch (e) { fout = it.naam + ': ' + (e.message || e); }
    if (fout) { try { showToast(fout); } catch(e){ /* stil: melding mag nooit de stroom breken */ } }

    // De onderliggende modules doen hun werk soms asynchroon (caravan doet
    // een preAnalysisCheck met een dialoog). Twee keer tekenen vangt dat op
    // zonder een eigen wachtlus te bouwen.
    teken();
    setTimeout(teken, 700);
  }

  function tikker() {
    if (_tikker) return;
    _tikker = setInterval(function () {
      try {
        verversDot();
        if (_open) teken();
      } catch(e){ console.warn('teken mislukt:', e); }
    }, 4000);
  }

  // De chip zelf zit in index.html, naast de andere drie. Zodra de DOM er
  // staat kleuren we hem voor het eerst.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { verversDot(); tikker(); });
  } else {
    verversDot(); tikker();
  }

  window.openRunPaneel = open;
  window.PLRun = {
    open: open,
    sluit: sluit,
    schakel: schakel,
    teken: teken,
    verversDot: verversDot,
    staat: function () {
      const uit = {};
      ITEMS.forEach(function (it) {
        let s = null;
        try { s = it.lees(); } catch(e){ console.warn('it.lees mislukt:', e); }
        uit[it.id] = s ? { aan: !!s.aan, draait: !!s.draait, detail: s.detail } : null;
      });
      return uit;
    },
    versie: RUN_VERSIE
  };

  try { if (typeof btDiag === 'function') btDiag('pidlane-run.js geladen — ' + RUN_VERSIE, 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
})();
