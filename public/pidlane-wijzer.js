/* ═══════════════════════════════════════════════════════════════════
   pidlane-wijzer.js — PLWijzer: vier vragen die je zonder adapter stelt
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (13-10-2026)

   Wie de app downloadt heeft meestal nog geen adapter. De kaart "Niet in
   de auto?" (pidlane-zonder.js) gaf al het RDW, de lampjes en de foutcodes.
   Dit bestand voegt vier dingen toe die mensen bij een kenteken willen
   weten, en die de stap naar een adapter klein maken:

     1. Milieuklasse. Brandstof en emissieklasse uit het RDW, met een link
        naar milieuzones.nl. Geen tabel per stad: die regels verschillen per
        gemeente en veranderen te vaak om hier bij te houden.
     2. Wat kost hij per maand? Wegenbelasting als INDICATIE (MRB) plus
        brandstof of stroom uit het verbruik van de typekeuring.
     3. Klachtenwijzer. De klacht- en verdenkingenkern van PLOnderzoek, met
        alleen de vragen die geen sensor nodig hebben. Uitkomst: wat
        waarschijnlijk is, én wat een adapter zou meten om het te scheiden.
     4. Past een adapter? Bouwjaar en brandstof → OBD-plicht, protocol, en
        wat je ermee kunt. PidLane werkt met Bluetooth, niet met WiFi.

   ÉÉN DING, ÉÉN BETEKENIS. Het RDW komt uit PLZonder.haal(), de klachten,
   verdenkingen en vragen uit PLOnderzoek (KLACHTEN, VERDENKINGEN, STAPPEN,
   nieuw, verwerk, conclusie). Hier staat alleen wat nergens anders staat:
   de zonetabel, het belastingmodel en de OBD-plichtdata.

   EERLIJK OVER DE TABELLEN. MRB en PRIJS hebben een peildatum (PEIL). De
   wegenbelasting is een schatting zonder provincie; elke uitkomst zegt dat,
   met de rekenhulp van de Belastingdienst erbij. Een onbekende emissie-
   klasse heet "onbekend", nooit een geschat getal zonder dat erbij.

   Pure kern in _kern (test-wijzer.js); het scherm hangt aan PLZonder
   (blokken onder de kenteken-check, en de knop "Klacht?" op de kaart).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PEIL = '13-10-2026';

  // ── 1. Milieuklasse ─────────────────────────────────────────────────
  // Geen zonetabel per stad: die regels verschillen per gemeente en veranderen
  // vaak (besluit 13-10-2026, #485). De app zegt welke klasse de auto heeft en
  // verwijst voor de regels naar milieuzones.nl, waar je het kenteken invult.
  var MILIEUZONES_URL = 'https://www.milieuzones.nl';

  // ── 2. Wegenbelasting, indicatie ────────────────────────────────────
  // Per kwartaal, gemiddelde provincie, op massa rijklaar (sinds 01-07-2026).
  // Anker: € 126 voor benzine op 1.100 kg rijklaar (voorbeeld Belastingdienst).
  // Diesel: brandstoftoeslag per 100 kg. Elektrisch 2026: 70 % van benzine.
  // Plug-in hybride: vanaf 2026 het volle tarief.
  var MRB = { anker: 126, ankerKg: 1100, per100: 26, diesel100: 12.5, evFactor: 0.7, marge: 0.15 };
  var PRIJS = { benzine: 1.95, diesel: 1.70, lpg: 0.85, stroom: 0.35 };   // € per l of kWh
  var PRAKTIJK = 1.15;   // het verbruik op de weg ligt hoger dan de typekeuring
  var KM_MAAND = 1250;   // 15.000 km per jaar

  // ── 4. OBD-plicht in Europa (EOBD), op datum eerste toelating ───────
  var OBD = { benzine: '20010101', diesel: '20040101', lpg: '20060101', can: '20080101' };

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════
  function datum8(x) { var c = String(x || '').replace(/\D/g, '').slice(0, 8); return c.length === 8 ? c : null; }
  function getal(x) { var g = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(g) ? g : null; }
  function euro(x) { return '€ ' + Math.round(x).toLocaleString('nl-NL'); }
  function lijst(bs) { return Array.isArray(bs) ? bs.filter(Boolean) : []; }

  /* Brandstof uit de RDW-brandstofrijen: benzine, diesel, lpg, elektrisch,
     hybride-benzine, hybride-diesel of onbekend. */
  function soortBrandstof(bs) {
    var s = lijst(bs).map(function (b) { return String(b.brandstof_omschrijving || '').toLowerCase(); }).join(' ');
    var el = /elektri/.test(s), d = /diesel/.test(s), b = /benzine/.test(s), l = /lpg|cng|aardgas/.test(s);
    if (el && d) return 'hybride-diesel';
    if (el && b) return 'hybride-benzine';
    if (el) return 'elektrisch';
    if (d) return 'diesel';
    if (l) return 'lpg';
    if (b) return 'benzine';
    return 'onbekend';
  }

  /* Emissieklasse: uit het RDW, of geschat uit de eerste toelating als het
     RDW hem niet geeft. { klasse, bron:'rdw'|'schatting'|null } */
  function euroKlasse(rij, bs) {
    var k = null;
    lijst(bs).forEach(function (b) {
      if (k != null) return;
      var m = String(b.emissiecode_omschrijving || b.uitlaatemissieniveau || '').match(/(\d)/);
      if (m) k = parseInt(m[1], 10);
    });
    if (k != null) return { klasse: k, bron: 'rdw' };
    var d = datum8(rij && rij.datum_eerste_toelating);
    if (!d) return { klasse: null, bron: null };
    var j = d < '20010101' ? 2 : d < '20060101' ? 3 : d < '20110101' ? 4 : d < '20150901' ? 5 : 6;
    return { klasse: j, bron: 'schatting' };
  }

  /* Welke milieuklasse heeft deze auto? { soort, klasse, bron, kop, uitleg }.
     Geen oordeel over een stad: dat staat op milieuzones.nl. */
  function milieuklasse(rij, bs) {
    rij = rij || {};
    var soort = soortBrandstof(bs), ek = euroKlasse(rij, bs);
    var vs = String(rij.voertuigsoort || 'Personenauto');
    var NAAM = { benzine: 'Benzine', diesel: 'Diesel', lpg: 'LPG', elektrisch: 'Elektrisch', 'hybride-benzine': 'Hybride (benzine)', 'hybride-diesel': 'Hybride (diesel)', onbekend: 'Brandstof onbekend' };
    var kop = NAAM[soort] + (soort === 'elektrisch' ? '' : ', ' + (ek.klasse == null ? 'emissieklasse onbekend' : 'Euro ' + ek.klasse));
    var uitleg = ek.bron === 'schatting' && soort !== 'elektrisch' ? 'Emissieklasse geschat uit de eerste toelating — het RDW geeft hem niet. ' : '';
    if (/bedrijfsauto/i.test(vs)) uitleg += 'Voor bestelauto\'s gelden in veel steden zero-emissiezones.';
    else if (/diesel/.test(soort)) uitleg += 'Milieuzones voor personenauto\'s weren alleen oudere diesels; de grens verschilt per stad.';
    else if (soort !== 'onbekend') uitleg += 'Milieuzones voor personenauto\'s gelden alleen voor diesels.';
    return { soort: soort, klasse: ek.klasse, bron: ek.bron, kop: kop, uitleg: uitleg };
  }

  /* Wegenbelasting per maand, als indicatie. { perMaand, laag, hoog, kwartaal, uitleg } of { onbekend } */
  function mrb(rij, bs) {
    rij = rij || {};
    var soort = soortBrandstof(bs), kg = getal(rij.massa_rijklaar);
    if (!/personenauto/i.test(String(rij.voertuigsoort || 'Personenauto'))) return { onbekend: 'alleen voor personenauto\'s' };
    if (!kg || kg < 400) return { onbekend: 'het gewicht staat niet bij het RDW' };
    if (soort === 'onbekend' || soort === 'lpg') return { onbekend: soort === 'lpg' ? 'LPG heeft een eigen toeslag die hier niet in zit' : 'de brandstof is onbekend' };
    var basis = MRB.anker + (Math.max(kg, 650) - MRB.ankerKg) / 100 * MRB.per100;
    if (soort === 'diesel' || soort === 'hybride-diesel') basis += kg / 100 * MRB.diesel100;
    if (soort === 'elektrisch') basis *= MRB.evFactor;
    basis = Math.max(basis, 15);
    var pm = basis / 3;
    return { perMaand: pm, laag: pm * (1 - MRB.marge), hoog: pm * (1 + MRB.marge), kwartaal: basis,
      uitleg: Math.round(kg) + ' kg rijklaar, ' + soort.replace('-', ' ') + (soort === 'elektrisch' ? ' (2026: 70 % van het tarief)' : '') + ', gemiddelde provincie' };
  }

  /* Brandstof of stroom per maand. opt = { km, prijs:{…} }. { perMaand, uitleg } of { onbekend } */
  function brandstofKosten(bs, opt) {
    opt = opt || {};
    var km = opt.km || KM_MAAND, pr = Object.assign({}, PRIJS, opt.prijs || {});
    var soort = soortBrandstof(bs), l = null, kwh = null;
    lijst(bs).forEach(function (b) {
      if (l == null) l = getal(b.brandstofverbruik_gecombineerd_wltp || b.brandstofverbruik_gecombineerd || b.brandstof_verbruik_gecombineerd);
      if (kwh == null) { var w = getal(b.elektrisch_verbruik_enkel_elektrisch_wltp); if (w) kwh = w / 1000; }   // Wh/km → kWh/km
    });
    if (soort === 'elektrisch') {
      if (!kwh) return { onbekend: 'het stroomverbruik staat niet bij het RDW' };
      var s = kwh * PRAKTIJK * km * pr.stroom;
      return { perMaand: s, uitleg: Math.round(kwh * 1000) + ' Wh/km × ' + km + ' km × € ' + pr.stroom.toFixed(2).replace('.', ',') + '/kWh (thuisladen)' };
    }
    if (!l) return { onbekend: 'het verbruik staat niet bij het RDW' };
    var p = /diesel/.test(soort) ? pr.diesel : soort === 'lpg' ? pr.lpg : pr.benzine;
    var liters = l * PRAKTIJK * km / 100;
    return { perMaand: liters * p, uitleg: String(l).replace('.', ',') + ' l/100 km +15 % praktijk × ' + km + ' km × € ' + p.toFixed(2).replace('.', ',') + '/l' };
  }

  function kosten(rij, bs, opt) {
    var m = mrb(rij, bs), b = brandstofKosten(bs, opt);
    var totaal = (m.perMaand || 0) + (b.perMaand || 0);
    return { mrb: m, brandstof: b, totaal: (m.perMaand != null && b.perMaand != null) ? totaal : null };
  }

  /* Past een adapter? { past:'ja'|'waarschijnlijk'|'beperkt'|'nee'|'onbekend', kop, tekst, kan:[…], tips:[…] } */
  function adapter(rij, bs) {
    rij = rij || {};
    var soort = soortBrandstof(bs), d = datum8(rij.datum_eerste_toelating);
    var vs = String(rij.voertuigsoort || 'Personenauto');
    var tips = ['Kies een Bluetooth-adapter (ELM327 v1.5, Vgate, OBDLink). Een WiFi-adapter werkt niet met PidLane.',
      'De stekker zit bijna altijd onder het dashboard aan de bestuurderskant, binnen 60 cm van het stuur.'];
    var kan = ['Foutcodes uitlezen en uitleggen, ook als het lampje (nog) niet brandt',
      'Live meten: toerental, temperatuur, accu- en laadspanning, verbruik',
      'Een volledig onderzoek bij een klacht, met bewijs per oorzaak',
      'Bij een occasion: de tellerstand in de regeleenheden en de keuringsstatus'];
    if (/motorfiets|bromfiets/i.test(vs)) return { past: 'nee', kop: 'Motoren en brommers: meestal niet', tekst: 'De OBD-plicht geldt voor auto\'s. Sommige motoren hebben een eigen stekker; die ondersteunt PidLane niet.', kan: [], tips: [] };
    if (!d) return { past: 'onbekend', kop: 'Bouwjaar onbekend', tekst: 'Zonder datum van eerste toelating is niet te zeggen of de auto OBD heeft.', kan: kan, tips: tips };
    if (soort === 'elektrisch') return { past: 'beperkt', kop: 'Werkt beperkt bij een volledig elektrische auto',
      tekst: 'De stekker is er wel, maar veel elektrische auto\'s geven weinig standaardwaarden: geen motor, dus geen motorsensoren. Foutcodes en de 12V-accu lukken vaak wel.', kan: kan.slice(0, 1), tips: tips };
    var grens = /diesel/.test(soort) ? OBD.diesel : soort === 'lpg' ? OBD.lpg : OBD.benzine;
    var jaar = d.slice(0, 4);
    if (d >= grens) {
      var can = d >= OBD.can;
      return { past: 'ja', kop: 'Ja — deze auto heeft OBD2 (EOBD)',
        tekst: 'Eerste toelating ' + jaar + '. ' + (can ? 'Hij praat CAN: snel en betrouwbaar met elke goede adapter.' : 'Waarschijnlijk een ouder protocol (K-line of KWP): dat werkt, maar trager, en goedkope klonen haken daar soms op af.'),
        kan: kan, tips: tips };
    }
    var jaarGrens = parseInt(grens.slice(0, 4), 10);
    if (parseInt(jaar, 10) >= jaarGrens - 2) return { past: 'waarschijnlijk', kop: 'Waarschijnlijk wel',
      tekst: 'Eerste toelating ' + jaar + ': net vóór de OBD-plicht (' + jaarGrens + ' voor ' + (/diesel/.test(soort) ? 'diesel' : 'benzine') + '). Veel modellen hadden het al. Kijk of er onder het dashboard een trapeziumvormige stekker met 16 pinnen zit.',
      kan: kan, tips: tips };
    return { past: 'nee', kop: 'Waarschijnlijk niet', tekst: 'Eerste toelating ' + jaar + ': ruim vóór de OBD-plicht. Oudere auto\'s hebben een merkeigen diagnosestekker die een OBD2-adapter niet leest.', kan: [], tips: [] };
  }

  // ── 3. Klachtenwijzer, op de kern van PLOnderzoek ────────────────────
  // Alleen vragen die geen sensor en geen draaiende motor vragen.
  var VRAGEN = ['startgedrag', 'gevoel', 'rookkleur', 'koudstartgeluid', 'schakelen', 'geluid'];
  function oz() { return (typeof window !== 'undefined' && window.PLOnderzoek) || null; }

  function wijzerStart(klachten, merk, brandstof, O) {
    O = O || oz(); if (!O) return null;
    var ks = (klachten || []).filter(function (k) { return O.KLACHTEN[k]; });
    if (!ks.length) return null;
    return O.nieuw({ klachten: ks.slice(), merk: merk || '', brandstof: brandstof || '' });
  }
  function gewicht(st, s) {
    var w = 0;
    Object.keys(s.test || {}).forEach(function (h) { if (st.v[h]) w += s.test[h]; });
    return w;
  }
  /* De vragen die bij deze verdenkingen iets scheiden, nog niet beantwoord, beste eerst. */
  function wijzerVragen(st, O) {
    O = O || oz(); if (!O || !st) return [];
    return O.STAPPEN.filter(function (s) { return s.soort === 'vraag' && VRAGEN.indexOf(s.id) >= 0 && st.gedaan.indexOf(s.id) < 0 && gewicht(st, s) > 0; })
      .sort(function (a, b) { return gewicht(st, b) - gewicht(st, a); });
  }
  function wijzerAntwoord(st, id, w, O) {
    O = O || oz(); if (!O || !st) return st;
    var s = O.STAPPEN.filter(function (x) { return x.id === id; })[0];
    if (s && st.gedaan.indexOf(id) < 0) O.verwerk(st, s, { w: w });
    return st;
  }
  /* { kandidaten:[{naam,status,score,vervolg,bekend}], uitgesloten:[naam], meet:[{titel,waarom,icoon}], nietObd } */
  function wijzerUitkomst(st, O) {
    O = O || oz(); if (!O || !st) return null;
    var c = O.conclusie(st);
    var kand = c.alle.filter(function (x) { return x.status !== 'uitgesloten' && x.status !== 'onwaarschijnlijk' && x.id !== 'niet_obd'; })
      .map(function (x) { return { id: x.id, naam: x.naam, status: x.status, score: x.score, vervolg: x.vervolg, bekend: (st.v[x.id] && st.v[x.id].bekend) || '' }; });
    var open = {}; kand.forEach(function (x) { open[x.id] = 1; });
    var meet = O.STAPPEN.filter(function (s) { return s.soort !== 'vraag'; })
      .map(function (s) { var w = 0; Object.keys(s.test || {}).forEach(function (h) { if (open[h]) w += s.test[h]; }); return { s: s, w: w }; })
      .filter(function (x) { return x.w > 0; })
      .sort(function (a, b) { return b.w - a.w; }).slice(0, 4)
      .map(function (x) { return { titel: x.s.titel, waarom: x.s.waarom, icoon: x.s.icoon || '📈' }; });
    var no = st.v.niet_obd;
    return { kandidaten: kand.slice(0, 5), uitgesloten: c.uitgesloten.map(function (x) { return x.naam; }), meet: meet,
      nietObd: !!(no && no.score >= 1.5) };
  }

  // ════════════════════════════════════════════════════════════════
  //  HET SCHERM
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dot(e) { return '<span class="plz-dot ' + (e || '') + '" style="margin-top:4px"></span>'; }
  function regel(e, label, waarde, klein) {
    return '<div class="plz-regel">' + dot(e) + '<span style="flex:1"><div class="plz-l">' + esc(label) + '</div><div class="plz-w">' + esc(waarde) + '</div>' +
      (klein ? '<div class="plz-klein">' + esc(klein) + '</div>' : '') + '</span></div>';
  }

  var _schemaAuto = null;
  function schema() { if (window.PLSchema && _schemaAuto) PLSchema.open(_schemaAuto, _schemaAuto.kent); }

  /* Blokken onder de kenteken-check: milieuklasse, kosten, onderhoudsschema, adapter. */
  function blokken(rij, bs) {
    var z = milieuklasse(rij, bs), k = kosten(rij, bs), a = adapter(rij, bs);
    var h = '<div class="plz-blok" data-plw="zones"><b>🏙️ Milieuklasse</b>' + regel('info', 'Brandstof en emissieklasse', z.kop, z.uitleg) +
      '<div class="plz-klein" style="margin-top:6px">Mag hij een stad in? Vul het kenteken in op <a href="' + MILIEUZONES_URL + '" target="_blank" rel="noopener" style="color:var(--bl)">milieuzones.nl</a>.</div></div>';

    h += '<div class="plz-blok" data-plw="kosten"><b>💶 Wat kost hij per maand?</b>';
    if (k.mrb.perMaand != null) h += regel('info', 'Wegenbelasting (indicatie)', euro(k.mrb.laag) + ' – ' + euro(k.mrb.hoog) + ' per maand', k.mrb.uitleg);
    else h += regel('', 'Wegenbelasting', 'niet te schatten', k.mrb.onbekend);
    if (k.brandstof.perMaand != null) h += regel('info', 'Brandstof of stroom', '± ' + euro(k.brandstof.perMaand) + ' per maand', k.brandstof.uitleg);
    else h += regel('', 'Brandstof of stroom', 'niet te schatten', k.brandstof.onbekend);
    if (k.totaal != null) h += regel('', 'Samen, zonder verzekering en onderhoud', '± ' + euro(k.totaal) + ' per maand');
    h += '<div class="plz-klein" style="margin-top:6px">Een schatting, geen aanslag: de provincie en de exacte tarieftabel ontbreken. Exact: belastingdienst.nl/mrb-berekenen. Prijzen peil ' + PEIL + '.</div></div>';

    // Het onderhoudsschema (#490): op een tik, via de AI (pidlane-schema.js).
    _schemaAuto = { merk: rij && rij.merk, model: rij && rij.handelsbenaming, jaar: String((rij && rij.datum_eerste_toelating) || '').slice(0, 4), brandstof: z.soort, cc: rij && rij.cilinderinhoud, kent: rij && rij.kenteken };
    if (window.PLSchema) h += '<div class="plz-blok" data-plw="schema"><b>🔧 Onderhoudsschema</b><div class="plz-klein" style="margin-top:4px">Wanneer olie, filters, distributieriem en remvloeistof? De AI zoekt het op voor dit model (kost tegoed, niet geverifieerd).</div>' +
      '<div class="plz-knoppen" style="margin-top:8px"><button type="button" class="plz-kn" onclick="PLWijzer._schema()">🔧 Bekijk het schema</button></div></div>';

    h += '<div class="plz-blok" data-plw="adapter"><b>🔌 Past een adapter?</b>' +
      regel(a.past === 'ja' ? 'groen' : a.past === 'nee' ? 'rood' : 'oranje', a.kop, a.tekst);
    if (a.kan.length) h += '<div class="plz-klein" style="margin-top:6px"><b>Daarmee kun je:</b><br>• ' + a.kan.map(esc).join('<br>• ') + '</div>';
    if (a.tips.length) h += '<div class="plz-klein" style="margin-top:6px">' + a.tips.map(esc).join('<br>') + '</div>';
    return h + '</div>';
  }

  // ── Klachtenwijzer ─────────────────────────────────────────────────
  var _w = { st: null, gekozen: [] };
  function blad(titel, inhoud) {
    if (window.PLZonder && PLZonder._blad) return PLZonder._blad(titel, inhoud);
    return null;
  }
  function mijnAuto() {
    try { var m = JSON.parse(localStorage.getItem('pl_zonder_mijn') || 'null'); return m || {}; }
    catch (e) { console.warn('PLWijzer: eigen auto onleesbaar', e); return {}; }
  }
  function klacht() {
    var O = oz();
    if (!O) { if (typeof showToast === 'function') showToast('De klachtenwijzer is niet geladen'); return; }
    _w = { st: null, gekozen: [] };
    tekenKiezen();
  }
  function tekenKiezen() {
    var O = oz();
    var h = '<div class="plz-st">Wat merk je? Kies één of meer. Je krijgt de waarschijnlijke oorzaken, en wat een adapter zou meten.</div><div class="plz-rij">';
    Object.keys(O.KLACHTEN).forEach(function (k) {
      if (k === 'controle') return;
      var aan = _w.gekozen.indexOf(k) >= 0;
      h += '<button type="button" class="plz-kn' + (aan ? ' hoofd' : '') + '" data-plw-k="' + k + '" onclick="PLWijzer._kies(\'' + k + '\')">' + O.KLACHTEN[k].icoon + ' ' + esc(O.KLACHTEN[k].naam) + '</button>';
    });
    h += '</div><div class="plz-knoppen"><button type="button" class="plz-kn hoofd" onclick="PLWijzer._verder()"' + (_w.gekozen.length ? '' : ' disabled') + '>Verder →</button></div>';
    blad('🩺 Wat is er mis?', h);
  }
  function kies(k) {
    var i = _w.gekozen.indexOf(k);
    if (i >= 0) _w.gekozen.splice(i, 1); else _w.gekozen.push(k);
    tekenKiezen();
  }
  function verder() {
    var m = mijnAuto();
    _w.st = wijzerStart(_w.gekozen, m.merk || '', m.brandstof || '');
    if (!_w.st) return;
    tekenVraag();
  }
  function tekenVraag() {
    var v = wijzerVragen(_w.st)[0];
    if (!v || _w.st.gedaan.length >= 3) { tekenUitkomst(); return; }
    var h = '<div class="plz-st">Vraag ' + (_w.st.gedaan.length + 1) + ' · ' + esc(v.waarom) + '</div><div class="plz-naam">' + v.icoon + ' ' + esc(v.titel) + '</div><div class="plz-knoppen" style="flex-direction:column">';
    v.opties.forEach(function (o) { h += '<button type="button" class="plz-kn" data-plw-a="' + o.w + '" onclick="PLWijzer._antwoord(\'' + v.id + '\',\'' + o.w + '\')">' + esc(o.t) + '</button>'; });
    h += '<button type="button" class="plz-kn" style="opacity:.7" onclick="PLWijzer._uitkomst()">Overslaan — toon wat je nu weet</button></div>';
    blad('🩺 Klachtenwijzer', h);
  }
  function antwoord(id, w) { wijzerAntwoord(_w.st, id, w); tekenVraag(); }
  function tekenUitkomst() {
    var u = wijzerUitkomst(_w.st); if (!u) return;
    var h = '<div class="plz-st">Zonder meting is dit een rangorde, geen diagnose.</div>';
    if (u.nietObd) h += '<div class="plz-blok">👂 Een geluid of trilling van buiten de motor ziet geen sensor. Daarvoor is een proefrit met een monteur de juiste weg.</div>';
    h += '<div class="plz-blok" data-plw="kandidaten"><b>Waarschijnlijke oorzaken</b>' + u.kandidaten.map(function (x) {
      return regel(x.status === 'waarschijnlijk' || x.status === 'bevestigd' ? 'oranje' : 'info', x.status === 'open' ? 'mogelijk' : x.status, x.naam, x.bekend ? 'Bekend bij dit merk: ' + x.bekend : x.vervolg);
    }).join('') + '</div>';
    if (u.uitgesloten.length) h += '<div class="plz-klein" style="margin-top:6px">Minder waarschijnlijk na je antwoorden: ' + esc(u.uitgesloten.join(', ')) + '.</div>';
    if (u.meet.length) h += '<div class="plz-blok" data-plw="meet"><b>🔌 Met een adapter meet PidLane dit</b>' + u.meet.map(function (x) {
      return '<div style="margin-top:6px">' + x.icoon + ' <b>' + esc(x.titel) + '</b><div class="plz-klein">' + esc(x.waarom) + '</div></div>';
    }).join('') + '<div class="plz-klein" style="margin-top:8px">Zo wordt "mogelijk" bevestigd of uitgesloten — met de meetwaarde erbij.</div></div>';
    h += '<div class="plz-knoppen"><button type="button" class="plz-kn" onclick="PLWijzer.klacht()">Opnieuw</button>' +
      '<button type="button" class="plz-kn" onclick="PLLampjes.open()">💡 Brandt er een lampje?</button></div>';
    blad('🩺 Klachtenwijzer', h);
  }

  window.PLWijzer = {
    blokken: blokken,
    klacht: klacht,
    _schema: schema,
    _kies: kies, _verder: verder, _antwoord: antwoord, _uitkomst: tekenUitkomst,
    // pure kern — voor test-wijzer.js
    _kern: { PEIL: PEIL, MILIEUZONES_URL: MILIEUZONES_URL, MRB: MRB, OBD: OBD, VRAGEN: VRAGEN,
      soortBrandstof: soortBrandstof, euroKlasse: euroKlasse, milieuklasse: milieuklasse, mrb: mrb, brandstofKosten: brandstofKosten,
      kosten: kosten, adapter: adapter, wijzerStart: wijzerStart, wijzerVragen: wijzerVragen, wijzerAntwoord: wijzerAntwoord, wijzerUitkomst: wijzerUitkomst }
  };
})();
