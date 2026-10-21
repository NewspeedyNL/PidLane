/* ═══════════════════════════════════════════════════════════════════
   pidlane-voorkennis.js — PLVoorkennis: wat de expert weet zodra hij verbindt
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (17-10-2026)
   Een expert die via PLRemote aanhaakt kreeg één momentopname van het NU:
   voertuig, actieve sensoren, foutcodes van dit moment. Wat de app al wist —
   de bekende zwakke plekken van dit merk, wat er eerder op deze auto gezien
   is, de freeze frame van de ECU, gezakte mode 06-testen, eerdere rapporten —
   bleef op de telefoon. De expert begon dus elke keer bij nul.

   EEN KLEIN AANTAL OORZAKEN VERKLAART DE MEESTE KLACHTEN. Daarom is dit geen
   stapel gegevens maar een volgorde: `kansen` zijn de verdenkingen waar
   bewijs voor is (foutcode, mode 06), met de merkkennis als duw bovenop.
   Merkkennis zonder bewijs staat apart onder `bekend` — kennis is geen
   bewijs, dezelfde regel als in PLOnderzoek (KENNIS_GEWICHT).

   GEEN TWEEDE TABEL. De vertaling foutcode → verdenking (CODEREGELS), zwak
   punt → verdenking (kennisNaarVerdenking) en mode 06 → verdenking
   (beoordeelMode06) komt uit PLOnderzoek. Verandert daar een regel, dan
   verandert de volgorde hier mee.

   PRIVACY. Er gaat geen VIN in, geen kenteken en geen rapporttekst: alleen
   titels van rapporten. De tekst van één rapport gaat pas mee als de expert
   erom vraagt (`rapport(id)`, request-rapport in pidlane-remote.js).

   `bouw(ctx)` is puur (test-voorkennis.js); `uitApp()` raapt de globals bij
   elkaar; `html(vk, opties)` tekent het voor de expert, alles door esc().
   Laadvolgorde: na pidlane-onderzoek.js, vóór pidlane-remote.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MAX = { kansen: 8, bekend: 8, codes: 20, rapporten: 5, redenen: 4 };
  // Merkkennis bovenop bewijs: genoeg om bij gelijk bewijs voor te gaan,
  // te weinig om zonder bewijs een kans te worden.
  var KENNIS_DUW = 1.5;
  var DTC_RE = /^[PCBU][0-9A-F]{4}$/;

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function getal(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function iso(t) {
    var d = t instanceof Date ? t : new Date(t);
    return isNaN(d) ? null : d.toISOString();
  }

  /* ctx = { codes, kennis, m06, mon, waarnemingen, rapporten, dtcInfo, onderzoek, t }
     onderzoek is PLOnderzoek (of een stand-in in de test). Zonder onderzoek
     zijn er geen kansen, wel de rest. */
  function bouw(ctx) {
    ctx = ctx || {};
    var O = ctx.onderzoek || null;
    var V = (O && O.VERDENKINGEN) || {};
    var codes = (ctx.codes || []).map(function (c) { return String(c || '').toUpperCase().trim(); })
      .filter(function (c, i, a) { return DTC_RE.test(c) && a.indexOf(c) === i; });

    var vd = {};
    function raak(h, d, t) {
      if (!h || !V[h]) return;
      var v = vd[h] || (vd[h] = { h: h, naam: V[h].naam, vervolg: V[h].vervolg || '', score: 0, bewijs: false, bekend: false, redenen: [] });
      v.score += d;
      if (d > 0) v.bewijs = true;
      if (t && v.redenen.length < MAX.redenen) v.redenen.push(t);
    }

    // 1. foutcodes — de regels van het onderzoek
    if (O && O.CODEREGELS) {
      codes.forEach(function (c) {
        O.CODEREGELS.forEach(function (r) { var m = c.match(r.re); if (m) raak(r.h, r.d, r.t(c, m)); });
      });
    }
    // 2. mode 06 — hetzelfde oordeel als in het onderzoek
    var m06 = null;
    if (ctx.m06 && Array.isArray(ctx.m06.tests)) {
      var tests = ctx.m06.tests;
      var gezakt = tests.filter(function (t) { return !t.geslaagd && t.oordeelZeker; });
      m06 = {
        tekst: (ctx.m06.samenvatting && ctx.m06.samenvatting.tekst) || (tests.length + ' tests'),
        niveau: (ctx.m06.samenvatting && ctx.m06.samenvatting.niveau) || null,
        tests: tests.length,
        gezakt: gezakt.slice(0, 10).map(function (t) { return String(t.midNaam || '') + ' ' + String(t.tidHex || ''); }),
        t: iso(ctx.m06.t || ctx.m06.wanneer || Date.now())
      };
      if (O && typeof O.beoordeelMode06 === 'function') {
        try {
          O.beoordeelMode06({ m06: ctx.m06 }, { metingen: {} }).forEach(function (b) { if (b && b.h) raak(b.h, b.d, b.t); });
        } catch (e) { console.warn('PLVoorkennis: mode 06 niet beoordeeld', e); }
      }
    }
    // 3. merkkennis — duw op bewijs, anders 'bekend'
    var bekend = [], zelf = [];
    var kennis = ctx.kennis || null;
    if (kennis && O && typeof O.kennisNaarVerdenking === 'function') {
      O.kennisNaarVerdenking(kennis).forEach(function (k) {
        if (!k.h.length) { if (zelf.length < MAX.bekend) zelf.push(k.t); return; }
        var raakt = false;
        k.h.forEach(function (h) {
          if (vd[h] && vd[h].bewijs) {
            vd[h].score += KENNIS_DUW; vd[h].bekend = true; raakt = true;
            if (vd[h].redenen.length < MAX.redenen) vd[h].redenen.push('bekend zwak punt bij ' + (kennis.merk || 'dit merk') + ': ' + k.t);
          }
        });
        if (!raakt && bekend.length < MAX.bekend) bekend.push({ t: k.t, h: k.h.slice(), naam: k.h.map(function (h) { return V[h] ? V[h].naam : h; }).join(' / ') });
      });
    }
    var kansen = Object.keys(vd).map(function (h) { return vd[h]; })
      .filter(function (v) { return v.bewijs && v.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (a.h < b.h ? -1 : 1); })
      .slice(0, MAX.kansen)
      .map(function (v) { return { h: v.h, naam: v.naam, score: Math.round(v.score * 10) / 10, bekend: v.bekend, redenen: v.redenen, vervolg: v.vervolg }; });

    // 4. foutcodes met hun geschiedenis uit de rit-monitor
    var mon = {};
    (ctx.mon || []).forEach(function (e) { if (e && DTC_RE.test(String(e.code || '').toUpperCase())) mon[String(e.code).toUpperCase()] = e; });
    var alleCodes = codes.concat(Object.keys(mon).filter(function (c) { return codes.indexOf(c) < 0; })).slice(0, MAX.codes);
    var foutcodes = alleCodes.map(function (c) {
      var info = null;
      try { info = typeof ctx.dtcInfo === 'function' ? ctx.dtcInfo(c) : null; }
      catch (e) { console.warn('PLVoorkennis: dtcInfo ' + c, e); }
      var e = mon[c] || null, ff = null;
      if (e && e.ff && typeof e.ff === 'object') {
        ff = {};
        Object.keys(e.ff).slice(0, 12).forEach(function (k) { var v = getal(e.ff[k]); if (v !== null && /^[0-9A-F]{2}$/i.test(k)) ff[k.toUpperCase()] = v; });
      }
      return {
        code: c, nu: codes.indexOf(c) >= 0,
        desc: info && info.desc ? String(info.desc).slice(0, 160) : '',
        sev: info && info.sev ? String(info.sev) : '',
        aantal: e ? (e.count | 0) : 0,
        eerste: e ? iso(e.eerste) : null, laatste: e ? iso(e.laatste) : null,
        fasen: e && e.fasen ? Object.keys(e.fasen).slice(0, 6) : [],
        temp: e && e.temp ? Object.keys(e.temp).slice(0, 4) : [],
        ff: ff
      };
    });

    // 5. wat er op déze auto gezien is — "onbekend" is geen nee en gaat niet mee
    var waargenomen = (ctx.waarnemingen || []).filter(function (w) { return w && w.status && w.status !== 'onbekend'; })
      .map(function (w) { return { naam: String(w.naam || w.wat || ''), status: String(w.status), wanneer: w.wanneer ? iso(w.wanneer) : null, bron: w.bron ? String(w.bron) : null }; });

    // 6. eerdere rapporten — alleen de titel; de tekst op verzoek
    var rapporten = (ctx.rapporten || []).filter(function (r) { return r && r.id && !r.demo && r.type !== 'pdf'; })
      .slice(-MAX.rapporten).reverse()
      .map(function (r) { return { id: String(r.id), type: String(r.type || ''), title: String(r.title || '').slice(0, 120), ts: iso(r.ts) }; });

    return {
      v: 1, t: ctx.t || Date.now(),
      merk: (kennis && kennis.merk) || '',
      let_op: (kennis && kennis.let_op) ? String(kennis.let_op).slice(0, 300) : '',
      kansen: kansen, bekend: bekend, zelf: zelf,
      foutcodes: foutcodes, mode06: m06, waargenomen: waargenomen, rapporten: rapporten
    };
  }

  // ── de app als bron ───────────────────────────────────────────────
  function uitApp() {
    var v = {}, codes = [], kennis = null, mon = [], wn = [];
    try { v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {}; } catch (e) { console.warn('PLVoorkennis: geen voertuig', e); }
    try { codes = (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes)) ? dtcCodes.slice() : []; } catch (e) { console.warn('PLVoorkennis: geen foutcodes', e); }
    try {
      if (typeof autoKennisVoorMerk === 'function' && v.merk) {
        kennis = autoKennisVoorMerk(v.merk, v.brandstof, { jaar: Number(v.year) || null, cc: Number(v.cc) || null });
      }
    } catch (e) { console.warn('PLVoorkennis: merkkennis niet gelezen', e); }
    try {
      if (window.PLMon && PLMon.events) mon = Object.keys(PLMon.events).map(function (k) { return PLMon.events[k]; });
    } catch (e) { console.warn('PLVoorkennis: rit-monitor niet gelezen', e); }
    try { if (window.PLWaarneming && typeof PLWaarneming.alles === 'function') wn = PLWaarneming.alles(); }
    catch (e) { console.warn('PLVoorkennis: waarnemingen niet gelezen', e); }
    return bouw({
      codes: codes, kennis: kennis, mon: mon, waarnemingen: wn,
      m06: (window.PLM06 && PLM06.laatste) || null,
      rapporten: window._sessionReports || [],
      dtcInfo: typeof dtcInfo === 'function' ? dtcInfo : null,
      onderzoek: window.PLOnderzoek || null
    });
  }

  /* De tekst van één rapport, voor de expert die erom vraagt. Alleen een id
     uit het archief; demo- en PDF-rapporten niet. */
  var RAPPORT_MAX = 12000;
  function rapport(id) {
    var lijst = window._sessionReports || [];
    for (var i = 0; i < lijst.length; i++) {
      var r = lijst[i];
      if (r && r.id === id && !r.demo && r.type !== 'pdf') {
        var t = String(r.text || '');
        return { id: r.id, title: String(r.title || ''), ts: iso(r.ts), text: t.length > RAPPORT_MAX ? t.slice(0, RAPPORT_MAX) + '\n[…ingekort]' : t };
      }
    }
    return null;
  }

  // ── voor de expert ────────────────────────────────────────────────
  // Alles wat hier binnenkomt komt van de peer: elke string door esc(),
  // elk getal door getal(). Zelfde regel als _recRowsHtml (#142).
  function datum(s) {
    var d = s ? new Date(s) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function html(vk, opties) {
    if (!vk || typeof vk !== 'object') return '';
    opties = opties || {};
    var arr = function (x) { return Array.isArray(x) ? x : []; };
    var h = '<div class="pl-vk">';
    var kop = function (t) { return '<div class="rem-lbl" style="margin-top:10px">' + esc(t) + '</div>'; };
    var kansen = arr(vk.kansen), bekend = arr(vk.bekend), codes = arr(vk.foutcodes), wn = arr(vk.waargenomen), rap = arr(vk.rapporten);
    if (kansen.length) {
      h += kop('Eerst kijken naar');
      kansen.forEach(function (k, i) {
        h += '<div class="rem-stat"><b>' + (i + 1) + '. ' + esc(k.naam) + '</b>' + (k.bekend ? ' · bekend bij ' + esc(vk.merk || 'dit merk') : '') +
          ' <span style="opacity:.7">(' + (getal(k.score) === null ? '—' : getal(k.score)) + ')</span>' +
          arr(k.redenen).map(function (r) { return '<div style="opacity:.85">– ' + esc(r) + '</div>'; }).join('') +
          (k.vervolg ? '<div style="opacity:.7">→ ' + esc(k.vervolg) + '</div>' : '') + '</div>';
      });
    }
    if (bekend.length) {
      h += kop('Bekend bij ' + (vk.merk || 'dit merk') + ' — nog geen bewijs op deze auto');
      h += '<div class="rem-stat">' + bekend.map(function (b) { return '• ' + esc(b.t); }).join('<br>') + '</div>';
    }
    if (vk.let_op) h += '<div class="rem-stat">⚠ ' + esc(vk.let_op) + '</div>';
    if (codes.length) {
      h += kop('Foutcodes');
      codes.forEach(function (c) {
        var ff = c.ff && typeof c.ff === 'object' ? Object.keys(c.ff).map(function (k) { var v = getal(c.ff[k]); return esc(k) + '=' + (v === null ? '—' : v); }).join(' ') : '';
        h += '<div class="rem-stat"><b>' + esc(c.code) + '</b>' + (c.nu ? '' : ' (eerder deze rit)') + (c.desc ? ' — ' + esc(c.desc) : '') +
          ((c.aantal | 0) > 0 ? '<div style="opacity:.8">' + (c.aantal | 0) + '× gezien' + (c.eerste ? ', eerst ' + esc(datum(c.eerste)) : '') +
            (arr(c.fasen).length ? ' · ' + arr(c.fasen).map(esc).join('/') : '') + (arr(c.temp).length ? ' · ' + arr(c.temp).map(esc).join('/') : '') + '</div>' : '') +
          (ff ? '<div style="opacity:.8">freeze frame: ' + ff + '</div>' : '') + '</div>';
      });
    }
    if (vk.mode06 && typeof vk.mode06 === 'object') {
      h += kop('Mode 06') + '<div class="rem-stat">' + esc(vk.mode06.tekst) +
        (arr(vk.mode06.gezakt).length ? '<br>' + arr(vk.mode06.gezakt).map(function (g) { return '✖ ' + esc(g); }).join('<br>') : '') + '</div>';
    }
    if (wn.length) {
      h += kop('Waargenomen op deze auto') + '<div class="rem-stat">' +
        wn.map(function (w) { return esc(w.naam) + ': ' + esc(w.status) + (w.wanneer ? ' (' + esc(datum(w.wanneer)) + ')' : ''); }).join('<br>') + '</div>';
    }
    if (rap.length) {
      h += kop('Eerdere rapporten');
      rap.forEach(function (r) {
        var id = String(r.id || '');
        h += '<div class="rem-stat">' + esc(r.title || r.type) + (r.ts ? ' · ' + esc(datum(r.ts)) : '') +
          (opties.knop && /^sr\d+_\d+$/.test(id) ? ' <button class="rem-btn" onclick="PLRemote.reqRapport(\'' + id + '\')">Lees</button>' : '') + '</div>';
      });
    }
    if (h === '<div class="pl-vk">') h += '<div class="rem-stat">Nog geen voorkennis over deze auto.</div>';
    return h + '</div>';
  }

  window.PLVoorkennis = { bouw: bouw, uitApp: uitApp, rapport: rapport, html: html, MAX: MAX, KENNIS_DUW: KENNIS_DUW };
})();
