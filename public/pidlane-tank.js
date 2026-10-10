/* ═══════════════════════════════════════════════════════════════════
   pidlane-tank.js — PLTank: tankbeurten, beloofd bereik tegenover echt
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS (#469, 10-10-2026, stap 1)

   De vraag van een klant: "de auto zei 650 km, hoeveel heb ik echt
   gereden?" Niet als losse getallen, maar per tankcyclus — van tanken
   tot tanken.

   Een tankbeurt is wat de klant invult (kp_tank in D1, via PLGarage):
   liters, literprijs of bedrag, de afgelezen km-stand, of de tank vol
   is, en het bereik dat het dashboard gaf vóór en na het tanken. Dat
   dashboardbereik zit niet in standaard OBD; de klant leest het af.

   WAT ERUIT KOMT
     • cycli()     — per paar opeenvolgende tankbeurten: de km (uit de
                     km-standen, anders uit de ritten), het beloofde
                     bereik en hoeveel daarvan gehaald is;
     • volleTank() — het echte verbruik: liters sinds de vorige volle
                     tank ÷ km. De nauwkeurigste meting die er is, want
                     de pomp meet beter dan elke sensor in de auto;
     • samenvatting(), csv() en html().

   HOE "GEHAALD" TELT. De klant tankt zelden een lege tank. Beloofde de
   auto 650 km en stond er bij de volgende tankbeurt nog 90, dan is er
   560 km aan bereik opgemaakt; tegenover 540 gereden is dat 96 %.
   Zonder bereik_voor bij de volgende beurt rekent hij met 650, en zegt
   hij dat erbij (restBekend: false) — dan is het getal te laag.

   PUUR. Alles behalve html() is een pure functie op gewone objecten;
   test-tank.js laadt dit bestand met vm. html() maakt alleen tekst; de
   knoppen roepen PLGarage._tank*() aan, die met de server praten.

   Laadvolgorde: vóór pidlane-garage.js; heeft zelf niets nodig.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    kmMax: 3000,        // meer km tussen twee tankbeurten = een overgeslagen beurt of een tikfout
    kmAfwijking: 0.1    // ritten en km-stand verschillen meer dan 10 % → melden
  };

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function tijd(t) { var d = new Date(t && t.op); return isNaN(d) ? null : d.getTime(); }
  function oplopend(tanken) {
    return (tanken || []).filter(function (t) { return tijd(t) !== null; })
      .slice().sort(function (a, b) { return tijd(a) - tijd(b); });
  }

  /* Bedrag en literprijs vullen elkaar aan; de liters zijn de spil. */
  function bedragVan(t) {
    var l = getal(t.liters), p = getal(t.literprijs), b = getal(t.bedrag);
    if (b === null && l !== null && p !== null) b = Math.round(l * p * 100) / 100;
    if (p === null && l !== null && b !== null && l > 0) p = Math.round(b / l * 1000) / 1000;
    return { bedrag: b, literprijs: p };
  }

  /* De km tussen twee momenten volgens de ritten: ritten die in dat
     venster begonnen. Null als er geen enkele rit in valt — dat is "niet
     gemeten", geen 0 km. */
  function ritKm(ritten, van, tot) {
    var km = 0, n = 0;
    (ritten || []).forEach(function (r) {
      var s = new Date(r.start).getTime();
      if (isNaN(s) || s < van || s >= tot || typeof r.km !== 'number') return;
      km += r.km; n++;
    });
    return n ? { km: Math.round(km * 10) / 10, ritten: n } : null;
  }

  /* De km tussen tankbeurt a en b: de afgelezen km-standen winnen, de
     ritten zijn de terugval. Beide bekend → de afwijking ertussen. */
  function kmTussen(a, b, ritten) {
    var r = ritKm(ritten, tijd(a), tijd(b));
    var ka = getal(a.kmstand), kb = getal(b.kmstand), uit = { km: null, bron: null, ritKm: r ? r.km : null, ritten: r ? r.ritten : 0, afwijking: null };
    if (ka !== null && kb !== null && kb > ka && kb - ka <= CFG.kmMax) { uit.km = kb - ka; uit.bron = 'kmstand'; }
    else if (r && r.km > 0) { uit.km = r.km; uit.bron = 'ritten'; }
    if (uit.bron === 'kmstand' && r && r.km > 0) uit.afwijking = Math.round((r.km - uit.km) / uit.km * 1000) / 10;
    return uit;
  }

  /* Per tankcyclus (van tankbeurt i tot i+1): km, beloofd, gehaald. */
  function cycli(tanken, ritten) {
    var t = oplopend(tanken), uit = [];
    for (var i = 0; i + 1 < t.length; i++) {
      var a = t[i], b = t[i + 1], k = kmTussen(a, b, ritten);
      var c = { van: a.op, tot: b.op, vanId: a.id, totId: b.id, km: k.km, kmBron: k.bron, ritKm: k.ritKm, ritten: k.ritten, kmAfwijking: k.afwijking,
        dagen: Math.round((tijd(b) - tijd(a)) / 864e5 * 10) / 10,
        beloofdDashboard: getal(a.bereik_dashboard), beloofdApp: getal(a.bereik_app), rest: getal(b.bereik_voor),
        opgemaakt: null, gehaaldPct: null, restBekend: getal(b.bereik_voor) !== null };
      var bel = c.beloofdDashboard;
      if (bel !== null && bel > 0 && c.km !== null) {
        c.opgemaakt = c.restBekend ? bel - c.rest : bel;
        if (c.opgemaakt > 0) c.gehaaldPct = Math.round(c.km / c.opgemaakt * 1000) / 10;
      }
      if (c.beloofdApp !== null && c.beloofdApp > 0 && c.km !== null) c.gehaaldAppPct = Math.round(c.km / c.beloofdApp * 1000) / 10;
      uit.push(c);
    }
    return uit;
  }

  /* De volle-tankmethode. Van volle tank tot volle tank: alle liters die
     erna getankt zijn (ook halve beurten tussendoor) gedeeld door de km.
     Een beurt zonder liters in dat stuk maakt het ongeldig: dan ontbreekt
     er brandstof in de som en is het verbruik te laag. */
  function volleTank(tanken, ritten) {
    var t = oplopend(tanken), uit = [], start = -1;
    for (var i = 0; i < t.length; i++) {
      if (!t[i].vol) continue;
      if (start >= 0) {
        var liters = 0, kosten = 0, kostenHeel = true, heel = true;
        for (var j = start + 1; j <= i; j++) {
          var l = getal(t[j].liters);
          if (l === null) { heel = false; break; }
          liters += l;
          var b = bedragVan(t[j]).bedrag;
          if (b === null) kostenHeel = false; else kosten += b;
        }
        var k = kmTussen(t[start], t[i], ritten);
        if (heel && k.km > 0 && k.km <= CFG.kmMax)
          uit.push({ van: t[start].op, tot: t[i].op, totId: t[i].id, km: k.km, kmBron: k.bron, liters: Math.round(liters * 100) / 100,
            l100: Math.round(liters / k.km * 1000) / 10, kosten: kostenHeel ? Math.round(kosten * 100) / 100 : null,
            per100: kostenHeel ? Math.round(kosten / k.km * 10000) / 100 : null, beurten: i - start });
      }
      start = i;
    }
    return uit;
  }

  /* Over alles: gewogen gemiddelden, zodat een korte cyclus niet even
     zwaar telt als een lange. */
  function samenvatting(tanken, ritten) {
    var cs = cycli(tanken, ritten), vt = volleTank(tanken, ritten);
    var kmG = 0, opG = 0, nG = 0, zonderRest = 0;
    cs.forEach(function (c) { if (c.gehaaldPct !== null) { kmG += c.km; opG += c.opgemaakt; nG++; if (!c.restBekend) zonderRest++; } });
    var kmV = 0, lV = 0, kmK = 0, kV = 0;
    vt.forEach(function (v) { kmV += v.km; lV += v.liters; if (v.kosten !== null) { kmK += v.km; kV += v.kosten; } });
    var afw = cs.filter(function (c) { return c.kmAfwijking !== null && Math.abs(c.kmAfwijking) > CFG.kmAfwijking * 100; });
    return {
      beurten: (tanken || []).length, cycli: cs.length,
      gehaaldPct: nG ? Math.round(kmG / opG * 1000) / 10 : null, gehaaldN: nG, zonderRest: zonderRest,
      l100: kmV ? Math.round(lV / kmV * 1000) / 10 : null, l100Km: Math.round(kmV),
      per100: kmK ? Math.round(kV / kmK * 10000) / 100 : null,
      kmAfwijkend: afw.length
    };
  }

  /* CSV voor een Nederlandse spreadsheet (puntkomma, komma als decimaal),
     zoals de ritexport in PLGarage. Eén regel per tankbeurt, oudste eerst;
     de cyclus- en verbruikskolommen horen bij de cyclus die op die beurt
     eindigt. */
  function csv(tanken, ritten) {
    var t = oplopend(tanken), cs = cycli(t, ritten), vt = volleTank(t, ritten);
    var n = function (x, d) { return typeof x === 'number' && isFinite(x) ? x.toFixed(d).replace('.', ',') : ''; };
    var regels = ['datum;tijd;km_stand;liters;literprijs;bedrag_eur;vol;bereik_voor;bereik_na;bereik_app;km_sinds_vorige;km_bron;km_volgens_ritten;opgemaakt_bereik;gehaald_pct;verbruik_l100_volle_tank;eur_per_100km;notitie'];
    t.forEach(function (x) {
      var d = new Date(x.op), b = bedragVan(x);
      var c = cs.filter(function (y) { return y.totId === x.id; })[0] || {};
      var v = vt.filter(function (y) { return y.totId === x.id; })[0] || {};
      regels.push([d.toISOString().slice(0, 10), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        n(getal(x.kmstand), 0), n(getal(x.liters), 2), n(b.literprijs, 3), n(b.bedrag, 2), x.vol ? 'ja' : 'nee',
        n(getal(x.bereik_voor), 0), n(getal(x.bereik_dashboard), 0), n(getal(x.bereik_app), 0),
        n(c.km, 1), c.kmBron || '', n(c.ritKm, 1), n(c.opgemaakt, 0), n(c.gehaaldPct, 1), n(v.l100, 1), n(v.per100, 2),
        String(x.notitie || '').replace(/[;\r\n]/g, ',')].join(';'));
    });
    // Met BOM: zonder opent Excel een CSV als Windows-1252, en wordt € en é rommel.
    return '\uFEFF' + regels.join('\n');
  }

  /* ── Scherm ──────────────────────────────────────────────────────── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(x, d) { return typeof x === 'number' && isFinite(x) ? x.toLocaleString('nl', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : '—'; }
  function datum(s) { var d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('nl', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function lokaal(s) {
    var d = s ? new Date(s) : new Date(); if (isNaN(d)) d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function formulier(t, v) {
    t = t || {};
    var inv = function (id, label, waarde, extra) {
      return '<label class="gr-veld">' + label + '<input id="tk_' + id + '" ' + (extra || 'type="number" inputmode="decimal"') + ' value="' + esc(waarde == null ? '' : waarde) + '"></label>';
    };
    return '<div class="gr-blok"><div class="gr-bh">' + (t.id ? '✏️ Tankbeurt wijzigen' : '⛽ Tankbeurt invullen') + '</div>' +
      inv('op', 'Wanneer', lokaal(t.op), 'type="datetime-local"') +
      '<div class="gr-2">' + inv('liters', 'Liters getankt', t.liters) + inv('kmstand', 'Km-stand (afgelezen)', t.kmstand, 'type="number" inputmode="numeric"') + '</div>' +
      '<div class="gr-2">' + inv('literprijs', 'Literprijs (€)', t.literprijs != null ? t.literprijs : (v && v.brandstofprijs)) + inv('bedrag', 'of: totaal (€)', t.bedrag) + '</div>' +
      '<div class="gr-2">' + inv('bereik_voor', 'Bereik dashboard vóór tanken (km)', t.bereik_voor, 'type="number" inputmode="numeric"') +
        inv('bereik_dashboard', 'Bereik dashboard ná tanken (km)', t.bereik_dashboard, 'type="number" inputmode="numeric"') + '</div>' +
      '<label class="gr-veld" style="flex-direction:row;align-items:center;gap:8px"><input id="tk_vol" type="checkbox"' + (t.id ? (t.vol ? ' checked' : '') : ' checked') + '> Tank helemaal vol (tot de pomp afslaat)</label>' +
      inv('notitie', 'Notitie', t.notitie, 'type="text" maxlength="200" placeholder="bv. winterbanden, aanhanger, andere pomp"') +
      '<div class="gr-klein">Alleen wat je weet. Met "vol" en de liters rekent de app je echte verbruik uit; met het bereik vóór en ná tanken hoeveel van het beloofde bereik je haalt.</div>' +
      '<div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._tankBewaar(' + esc(JSON.stringify(t.id || '')) + ')">Bewaren</button>' +
      '<button class="gr-k" onclick="PLGarage._tankForm(null)">Annuleren</button></div></div>';
  }

  /* Wat het formulier bevat, als object voor tank_opslaan. Leeg = null. */
  function uitFormulier(doc) {
    var w = function (id) { var e = doc.getElementById('tk_' + id); return e ? String(e.value).trim() : ''; };
    var g = function (id) { var x = w(id).replace(',', '.'); return x === '' ? null : Number(x); };
    var op = new Date(w('op'));
    var vol = doc.getElementById('tk_vol');
    return { op: isNaN(op) ? null : op.toISOString(), liters: g('liters'), kmstand: g('kmstand'), literprijs: g('literprijs'), bedrag: g('bedrag'),
      bereik_voor: g('bereik_voor'), bereik_dashboard: g('bereik_dashboard'), vol: !!(vol && vol.checked), notitie: w('notitie') || null };
  }

  /* Het tabblad. `st` = { tanken, ritten, form (null | {} | tankbeurt), fout }. */
  function html(v, st) {
    var tk = st.tanken, h = '';
    if (st.form) return formulier(st.form.id ? st.form : null, v);
    h += '<div class="gr-knoppen" style="margin:0 0 10px"><button class="gr-k hoofd" onclick="PLGarage._tankForm({})">⛽ Tankbeurt invullen</button>' +
      (tk && tk.length ? '<button class="gr-k klein" onclick="PLGarage._tankExport()">⤓ CSV (Excel)</button>' : '') + '</div>';
    if (st.fout) h += '<div class="gr-melding">' + esc(st.fout) + '</div>';
    if (!tk) return h + '<div class="gr-klein">⏳</div>';
    if (!tk.length) return h + '<div class="gr-blok"><div class="gr-klein">Nog geen tankbeurten. Vul bij het tanken in wat je weet — liters, km-stand en het bereik op je dashboard. Vanaf de tweede beurt zie je hier hoeveel km je echt reed tegenover wat de auto beloofde.</div></div>';
    var s = samenvatting(tk, st.ritten), cs = cycli(tk, st.ritten), vt = volleTank(tk, st.ritten);
    h += '<div class="gr-blok"><div class="gr-rij">' +
      '<div>Tankbeurten</div><div><b>' + s.beurten + '</b></div>' +
      '<div>Van het beloofde bereik gehaald</div><div><b>' + (s.gehaaldPct !== null ? nl(s.gehaaldPct, 0) + ' %' : '—') + '</b></div>' +
      '<div>Echt verbruik (volle tank)</div><div><b>' + (s.l100 !== null ? nl(s.l100, 1) + ' l/100 km' : '—') + '</b></div>' +
      '<div>Kosten per 100 km</div><div><b>' + (s.per100 !== null ? '€ ' + nl(s.per100, 2) : '—') + '</b></div></div>' +
      (s.zonderRest ? '<div class="gr-klein" style="margin-top:6px">' + s.zonderRest + '× zonder het bereik vóór tanken: daar telt het hele beloofde bereik, en lijkt het percentage lager dan het is.</div>' : '') +
      (s.kmAfwijkend ? '<div class="gr-klein" style="margin-top:6px">' + s.kmAfwijkend + '× wijken de km uit de ritten meer dan 10 % af van je km-stand. Reed je toen zonder de app, of klopt een afgelezen stand niet?</div>' : '') +
      (v && v.verbruik_opgegeven && s.l100 !== null ? '<div class="gr-klein" style="margin-top:6px">Je gaf ' + nl(v.verbruik_opgegeven, 1) + ' l/100 km op in je profiel.</div>' : '') + '</div>';
    var perTot = {}; cs.forEach(function (c) { perTot[c.totId] = c; });
    var vtTot = {}; vt.forEach(function (x) { vtTot[x.totId] = x; });
    h += '<div class="gr-blok">' + oplopend(tk).reverse().map(function (t) {
      var c = perTot[t.id], x = vtTot[t.id], b = bedragVan(t);
      var regel1 = [t.liters != null ? nl(t.liters, 2) + ' l' : null, b.bedrag != null ? '€ ' + nl(b.bedrag, 2) : null,
        t.kmstand != null ? nl(t.kmstand) + ' km' : null, t.vol ? 'vol' : null].filter(Boolean).join(' · ');
      var regel2 = c ? [c.km !== null ? nl(c.km, 0) + ' km gereden sinds ' + datum(c.van) + (c.kmBron === 'ritten' ? ' (uit ' + c.ritten + ' rit' + (c.ritten === 1 ? '' : 'ten') + ')' : '') : 'km sinds de vorige beurt onbekend',
        c.gehaaldPct !== null ? nl(c.gehaaldPct, 0) + ' % van ' + nl(c.opgemaakt) + ' km beloofd' + (c.restBekend ? '' : ' (rest onbekend)') : null,
        x ? nl(x.l100, 1) + ' l/100 km' : null].filter(Boolean).join(' · ') : 'Eerste beurt — de vergelijking begint bij de volgende.';
      return '<div class="gr-item"><b>' + datum(t.op) + '</b>' + (regel1 ? ' · ' + esc(regel1) : '') +
        (t.bereik_dashboard != null ? '<div class="gr-klein">Dashboard na tanken: ' + nl(t.bereik_dashboard) + ' km' + (t.bereik_voor != null ? ', ervoor ' + nl(t.bereik_voor) + ' km' : '') + '</div>' : '') +
        '<div class="gr-klein">' + esc(regel2) + '</div>' + (t.notitie ? '<div class="gr-klein">📝 ' + esc(t.notitie) + '</div>' : '') +
        '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._tankForm(' + esc(JSON.stringify(t.id)) + ')">Wijzigen</button>' +
        '<button class="gr-k klein gevaar" onclick="PLGarage._tankWeg(' + esc(JSON.stringify(t.id)) + ')">Wissen</button></div></div>';
    }).join('') + '</div>';
    return h;
  }

  window.PLTank = { CFG: CFG, bedragVan: bedragVan, ritKm: ritKm, kmTussen: kmTussen, cycli: cycli, volleTank: volleTank,
    samenvatting: samenvatting, csv: csv, html: html, uitFormulier: uitFormulier };
})();
