// ══════════════════════════════════════════════════════════════════
// pidlane-toon.js — PLToon: wat een weergave van een sensor laat zien
// ══════════════════════════════════════════════════════════════════
// Een sensor heeft één ruwe waarde (pidVals, pidHist). Die gaat ongewijzigd
// naar de AI, de recorder en elke analyse. Wat een weergave TOONT kan daar
// van afwijken, en dan hoort dat op één plek te staan — niet per scherm.
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

  window.PLToon = { ingedrukt };
})();
