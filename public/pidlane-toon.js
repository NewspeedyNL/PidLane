// ══════════════════════════════════════════════════════════════════
// pidlane-toon.js — PLToon: wat een weergave van een sensor laat zien
// ══════════════════════════════════════════════════════════════════
// Een sensor heeft één ruwe waarde (pidVals, pidHist). Die gaat ongewijzigd
// naar de AI, de recorder en elke analyse. Wat een weergave TOONT kan daar
// van afwijken, en dan hoort dat op één plek te staan — niet per scherm.
//
// Tests: test-toon.js.
//
// ingedrukt() — een gaspedaal staat in rust niet op 0. De absolute
// pedaalsensoren (0149, 014A) zitten ruwweg rond de 15 %, en het vloerniveau
// verschilt per auto. De rust wordt daarom per sessie geleerd: `leer` =
// {min, max}, bijgewerkt bij elke aanroep. Was vraagUit() in
// pidlane-visueel.js (de vermogensnaald), en is hierheen verhuisd zonder
// verandering.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* 0–100 vanaf de geleerde rust. bereikMin: het kleinste bereik waarmee
     gedeeld wordt, zodat een sessie die nog weinig gezien heeft niet bij een
     klein tikje al 100 % zegt. Geen getal: null, en het geleerde blijft. */
  function ingedrukt(v, leer, bereikMin) {
    const n = Number(v);
    if (v === null || v === undefined || v === '' || !isFinite(n) || !leer) return null;
    if (leer.min === null || leer.min === undefined || n < leer.min) leer.min = n;
    if (leer.max === null || leer.max === undefined || n > leer.max) leer.max = n;
    const bereik = Math.max(bereikMin, leer.max - leer.min);
    return Math.max(0, Math.min(100, (n - leer.min) / bereik * 100));
  }

  /* ── waarde(): het getal dat Overzicht, Slim en Visueel tonen ──────
     Op 07-10-2026 in de auto: het gaspedaal "stond vast op 20" en het
     tankniveau verschilde per scherm (6 tegen 8 %). Twee oorzaken, en geen
     van beide was een kapotte sensor:
       - 0149 is het ABSOLUTE pedaal. Met de voet los (constant rijden,
         cruise control) staat hij op zijn ruststand, op deze Mazda rond de
         20 %. Dat leest als een pedaal dat blijft hangen. Getoond wordt nu
         hoeveel hij ingedrukt is, vanaf de geleerde rust; 015A (relatief)
         gaat door dezelfde regel en staat in rust dus ook op 0.
       - 012F wordt eens per minuut gevraagd, en de ruwe tankwaarde klotst
         bij optrekken en in bochten een paar procent. Elk scherm ving een
         ander moment. Getoond wordt nu de mediaan van de laatste TANK_N
         metingen — wat de meter in de auto ook doet: dempen.
     De ruwe waarde blijft in pidVals/pidHist; de AI en de analyses krijgen
     die. Alleen het getal op het scherm verandert. */
  const PEDAAL = ['0149', '014A', '014B', '015A'];
  // Een ABSOLUUT pedaal staat nooit op 0: de sensor heeft een offset. Een 0
  // (of bijna) is een verminkt antwoord, en zou de geleerde rust omlaag
  // trekken — dan staat een losgelaten pedaal ineens op 20 %. Die tellen
  // dus niet mee bij het leren. 015A (relatief) mag wél 0 zijn: dat is zijn rust.
  const ABSOLUUT = ['0149', '014A', '014B'];
  const ABS_ONDER = 5;
  // Het kleinste bereik vanaf de rust: hetzelfde als de vermogensnaald
  // (VERMOGEN.BEREIK in pidlane-visueel.js), zodat pedaalrij en naald gelijk lopen.
  const PEDAAL_BEREIK = 60;
  const TANK = '012F';
  const TANK_N = 3;

  const getal = v => typeof v === 'number' && isFinite(v);
  let _leer = {}, _sleutel = null;

  // Per auto leren: een andere auto in dezelfde sessie heeft een andere rust.
  function autoSleutel() {
    try {
      const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      return String(v.vin || [v.merk, v.model, v.year].filter(Boolean).join('|') || '');
    } catch (e) { console.warn('PLToon: voertuig onbekend, de pedaalrust wordt per sessie geleerd', e); return ''; }
  }
  function leer(pid, hist) {
    const s = autoSleutel();
    if (s !== _sleutel) { _leer = {}; _sleutel = s; }
    if (!_leer[pid]) {
      // Beginnen bij wat er al gemeten is, zodat het eerste getal niet
      // "0 %" zegt omdat de app de rust nog niet kent.
      const a = (hist || []).map(m => (m && typeof m === 'object') ? m.v : m).filter(getal)
        .filter(v => ABSOLUUT.indexOf(pid) < 0 || v >= ABS_ONDER);
      _leer[pid] = { min: a.length ? Math.min.apply(null, a) : null, max: a.length ? Math.max.apply(null, a) : null };
    }
    return _leer[pid];
  }
  function mediaan(a) {
    const b = a.slice().sort((x, y) => x - y), m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  /* hist: de historie van deze PID (standaard pidHist[pid]). */
  function waarde(pid, val, hist) {
    if (!getal(val)) return val;
    const h = hist !== undefined ? hist : ((typeof pidHist !== 'undefined' && pidHist) ? pidHist[pid] : null);
    if (PEDAAL.indexOf(pid) >= 0) {
      const l = leer(pid, h);
      // Een verminkt antwoord van een absoluut pedaal: niet leren, en tonen
      // als losgelaten in plaats van het geleerde te verpesten.
      if (ABSOLUUT.indexOf(pid) >= 0 && val < ABS_ONDER) return 0;
      const r = ingedrukt(val, l, PEDAAL_BEREIK);
      return r === null ? val : r;
    }
    if (pid === TANK) {
      const a = (h || []).slice(-TANK_N).map(m => (m && typeof m === 'object') ? m.v : m).filter(getal);
      return a.length >= TANK_N ? mediaan(a) : val;
    }
    return val;
  }

  /* Het getal als tekst, of null als de gewone opmaak (fv) geldt. Pedaal en
     tank in hele procenten, in élke weergave: Overzicht toonde onder de 10 %
     twee decimalen ("7.80", "0.67") waar Visueel "8%" en "1%" zei, en dat
     leest als twee verschillende getallen. Beide sensoren meten in stapjes
     van 0,4 %; een tweede decimaal is schijnprecisie. */
  const HEEL = PEDAAL.concat([TANK]);
  function tekst(pid, val) {
    if (HEEL.indexOf(pid) < 0 || !getal(val)) return null;
    return String(Math.round(val));
  }

  window.PLToon = { ingedrukt, waarde, tekst, PEDAAL, ABSOLUUT, ABS_ONDER, PEDAAL_BEREIK, TANK, TANK_N,
    _wis: function () { _leer = {}; _sleutel = null; } };
})();
