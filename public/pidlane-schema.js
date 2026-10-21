/* ═══════════════════════════════════════════════════════════════════
   pidlane-schema.js — PLSchema: het onderhoudsschema van dit model (#490)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (14-10-2026)

   "Wanneer moet de distributieriem?" is een vraag die iemand zonder adapter
   stelt, en waar de app geen eigen tabel voor heeft. De intervallen in
   PLConditie.ONDERDELEN zijn algemene standaarden, geen fabrieksopgave.

   Dit vraagt het de AI per merk, model, bouwjaar, brandstof en cilinder-
   inhoud — op een tik, en gelabeld als NIET GEVERIFIEERD. Besloten:
     • alleen met tegoed (apiFetch rekent; de demo en een leeg tegoed niet);
     • lokaal bewaard per auto (sleutel()), zodat een tweede keer niets kost;
     • het olie-interval is over te nemen in Mijn voertuigen
       (onderhoud_interval_km/mnd, dezelfde velden als de conditiescore).

   ÉÉN DING, ÉÉN BETEKENIS. De onderdelen zijn die van PLConditie.ONDERDELEN
   (zelfde id's); wat de AI met een ander id terugstuurt valt weg.

   Puur: sleutel(), prompt(), lees(). test-schema.js toetst ze.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG = 'pl_schema_';
  // Terugval als PLConditie (nog) niet geladen is; dezelfde id's.
  var STD = ['olie', 'oliefilter', 'luchtfilter', 'bougies', 'brandstoffilter', 'distributie', 'remvloeistof', 'koelvloeistof', 'remmen', 'accu'];
  function onderdelen() {
    try { if (window.PLConditie && PLConditie.ONDERDELEN) return PLConditie.ONDERDELEN.map(function (o) { return { id: o.id, naam: o.naam }; }); }
    catch (e) { console.warn('PLSchema: PLConditie onleesbaar', e); }
    return STD.map(function (id) { return { id: id, naam: id }; });
  }

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════
  /* auto = { merk, model, jaar, brandstof, cc }. Eén sleutel per motor en
     bouwjaar: een Golf 1.4 van 2011 en een van 2016 zijn twee schema's. */
  function sleutel(auto) {
    auto = auto || {};
    return [auto.merk, auto.model, auto.jaar, auto.brandstof, auto.cc].map(function (x) {
      return String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9.]+/g, '');
    }).join('|');
  }

  function prompt(auto, lijst) {
    auto = auto || {};
    var wie = [auto.merk, auto.model, auto.jaar].filter(Boolean).join(' ') + (auto.brandstof ? ', ' + auto.brandstof : '') + (auto.cc ? ', ' + auto.cc + ' cc' : '');
    return 'Geef het onderhoudsschema volgens de fabrikant voor deze auto: ' + wie + '.\n' +
      'Antwoord met precies één blok <schema>…</schema> met JSON: een lijst van { "id", "km", "mnd", "toelichting" }.\n' +
      'Gebruik alleen deze id\'s: ' + lijst.map(function (o) { return o.id + ' (' + o.naam + ')'; }).join(', ') + '.\n' +
      'km = interval in kilometers of null, mnd = interval in maanden of null. Laat een onderdeel weg dat deze auto niet heeft ' +
      '(geen bougies bij een diesel; een distributieketting zonder vast interval: km en mnd null, met dat in de toelichting). ' +
      'Toelichting: hoogstens één korte zin, in het Nederlands. Weet je het niet zeker, zeg dat in de toelichting; verzin geen getal.';
  }

  function geheel(x, min, max) {
    var g = Math.round(Number(x));
    return isFinite(g) && g >= min && g <= max ? g : null;
  }
  /* Het blok uit het AI-antwoord. { items:[{id,naam,km,mnd,toelichting}], fout } */
  function lees(tekst, lijst) {
    lijst = lijst || onderdelen();
    var naam = {}; lijst.forEach(function (o) { naam[o.id] = o.naam; });
    var m = String(tekst == null ? '' : tekst).match(/<schema>([\s\S]*?)<\/schema>/i);
    if (!m) return { items: [], fout: 'de AI gaf geen schemablok' };
    var ruw;
    try { ruw = JSON.parse(m[1].replace(/^[^\[]*/, '').replace(/[^\]]*$/, '')); }
    catch (e) { return { items: [], fout: 'het schemablok was geen geldige JSON' }; }
    if (!Array.isArray(ruw)) return { items: [], fout: 'het schemablok was geen lijst' };
    var gehad = {}, items = [];
    ruw.forEach(function (r) {
      if (!r || !naam[r.id] || gehad[r.id]) return;
      gehad[r.id] = true;
      items.push({ id: r.id, naam: naam[r.id], km: geheel(r.km, 1000, 400000), mnd: geheel(r.mnd, 1, 240),
        toelichting: String(r.toelichting == null ? '' : r.toelichting).replace(/[<>]/g, '').slice(0, 200) });
    });
    items.sort(function (a, b) { return lijst.findIndex(function (o) { return o.id === a.id; }) - lijst.findIndex(function (o) { return o.id === b.id; }); });
    return { items: items, fout: items.length ? null : 'het schema bevatte geen bekend onderdeel' };
  }

  // Wat er over te nemen is in Mijn voertuigen: het olie-interval, binnen
  // de grenzen van dat formulier (1.000–100.000 km, 1–60 maanden).
  function olieInterval(items) {
    var o = (items || []).filter(function (x) { return x.id === 'olie'; })[0];
    if (!o) return null;
    var km = o.km && o.km <= 100000 ? o.km : null, mnd = o.mnd && o.mnd <= 60 ? o.mnd : null;
    return km || mnd ? { km: km, mnd: mnd } : null;
  }

  // ════════════════════════════════════════════════════════════════
  //  HET SCHERM
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLSchema: melding', e); } }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function lees_(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { console.warn('PLSchema: opslag onleesbaar', e); return null; } }
  function schrijf(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('PLSchema: niet bewaard', e); } }
  function blad(inhoud) { if (window.PLZonder && PLZonder._blad) PLZonder._blad('🔧 Onderhoudsschema', inhoud); }

  /* Waarom het nu niet kan, of null. Tegoed: alleen als het saldo bekend
     is en op is; anders beslist apiFetch (dat rekent en weigert zelf). */
  function geenToegang() {
    if (isDemo()) return 'In de demo vraagt de app de AI niets: dit kost tegoed en wordt bewaard.';
    try { var u = window.currentUser; if (!(u && (u.user || u.name))) return 'Log in om het schema op te vragen: het loopt via de AI en kost tegoed.'; }
    catch (e) { return 'Log in om het schema op te vragen.'; }
    if (typeof apiFetch !== 'function') return 'De AI is in deze versie niet beschikbaar.';
    try {
      if (window.PLCredits && PLCredits.saldoBekend && PLCredits.saldoBekend() && PLCredits.saldo() <= 0 && !(typeof isAdmin === 'function' && isAdmin()))
        return 'Je tegoed is op. Het schema kost tegoed; vul het aan om het op te vragen.';
    } catch (e) { console.warn('PLSchema: tegoed onleesbaar — apiFetch beslist', e); }
    return null;
  }

  var _auto = null, _kent = '';
  /* Vanuit de kenteken-check: rij/bs zijn de RDW-rijen, kent het kenteken. */
  function open(auto, kent) {
    _auto = auto || {}; _kent = String(kent || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var bewaard = lees_(OPSLAG + sleutel(_auto));
    if (bewaard && bewaard.items && bewaard.items.length) { toon(bewaard.items, bewaard.t); return; }
    var nee = geenToegang();
    blad('<div class="plz-naam">' + esc([_auto.merk, _auto.model, _auto.jaar].filter(Boolean).join(' ')) + '</div>' +
      '<div class="plz-st">De AI zoekt het onderhoudsschema van dit model op: olie, filters, distributieriem, remvloeistof. Dit kost tegoed; het antwoord wordt op deze telefoon bewaard.</div>' +
      (nee ? '<div class="plz-blok">' + esc(nee) + '</div>' : '<div class="plz-knoppen"><button type="button" class="plz-kn hoofd" id="plsVraag" onclick="PLSchema._vraag()">🤖 Vraag het schema op</button></div>'));
  }

  async function vraag() {
    var nee = geenToegang(); if (nee) { melding(nee); return; }
    var knop = el('plsVraag'); if (knop) { knop.disabled = true; knop.textContent = '⏳ De AI zoekt het op…'; }
    var lijst = onderdelen(), r;
    try {
      var t = await apiFetch(prompt(_auto, lijst), 900, null, AI_LICHT, { meet: false });
      r = lees(t, lijst);
    } catch (e) {
      console.warn('PLSchema: AI-vraag mislukt', e);
      blad('<div class="plz-blok">De AI is nu niet bereikbaar: ' + esc(e && e.message ? e.message : e) + '</div>');
      return;
    }
    if (r.fout) { console.warn('PLSchema: ' + r.fout); blad('<div class="plz-blok">Het schema kwam niet goed door (' + esc(r.fout) + '). Probeer het later opnieuw.</div>'); return; }
    var nu = Date.now();
    schrijf(OPSLAG + sleutel(_auto), { items: r.items, t: nu });
    toon(r.items, nu);
  }

  function garageVoertuig() {
    try {
      var st = window.PLGarage && PLGarage.staat ? PLGarage.staat() : null;
      var vt = (st && st.stand && st.stand.akkoord && st.stand.voertuigen) || [];
      return vt.filter(function (v) { return v.status === 'actief' && _kent && String(v.kenteken || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === _kent; })[0] || null;
    } catch (e) { console.warn('PLSchema: Mijn voertuigen onleesbaar', e); return null; }
  }

  function toon(items, t) {
    var r = function (x) {
      var w = [x.km ? x.km.toLocaleString('nl-NL') + ' km' : null, x.mnd ? (x.mnd % 12 === 0 ? (x.mnd / 12) + ' jaar' : x.mnd + ' maanden') : null].filter(Boolean).join(' of ') || 'geen vast interval';
      return '<div class="plz-regel"><span style="flex:1"><div class="plz-l">' + esc(x.naam) + '</div><div class="plz-w">' + esc(w) + '</div>' +
        (x.toelichting ? '<div class="plz-klein">' + esc(x.toelichting) + '</div>' : '') + '</span></div>';
    };
    var h = '<div class="plz-naam">' + esc([_auto.merk, _auto.model, _auto.jaar].filter(Boolean).join(' ')) + '</div>' +
      '<div class="plz-blok"><b>Volgens de AI — niet geverifieerd.</b> Het onderhoudsboekje of de dealer heeft het laatste woord.</div>' +
      items.map(r).join('');
    var oi = olieInterval(items), v = garageVoertuig();
    if (oi && v) h += '<div class="plz-knoppen"><button type="button" class="plz-kn hoofd" onclick="PLSchema._neemOver()">📌 Olie-interval overnemen in Mijn voertuigen</button></div>';
    h += '<div class="plz-klein" style="margin-top:10px">Opgevraagd ' + esc(new Date(t || Date.now()).toLocaleDateString('nl-NL')) + ' · bewaard op deze telefoon.</div>';
    blad(h);
  }

  async function neemOver() {
    var b = lees_(OPSLAG + sleutel(_auto)), oi = olieInterval(b && b.items), v = garageVoertuig();
    if (!oi || !v || !window.PLGarage || typeof PLGarage.zetInterval !== 'function') return;
    try { await PLGarage.zetInterval(v.id, oi.km, oi.mnd); melding('📌 Olie-interval overgenomen voor ' + (v.naam || v.merk || 'je voertuig')); }
    catch (e) { console.warn('PLSchema: interval niet bewaard', e); melding('Het interval kon niet bewaard worden: ' + (e && e.message ? e.message : e)); }
  }

  window.PLSchema = {
    open: open,
    _vraag: vraag,
    _neemOver: neemOver,
    // pure kern — voor test-schema.js
    _kern: { sleutel: sleutel, prompt: prompt, lees: lees, olieInterval: olieInterval, STD: STD }
  };
})();
