/* ═══════════════════════════════════════════════════════════════════
   pidlane-garage.js — PLGarage: "Mijn voertuigen", het klantplatform
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS (27-09-2026)

   Tot nu toe kende de app één auto tegelijk (`vehicleInfo`), en alles wat
   er over die auto gezegd werd — AI-rapporten, foutcodes, ritten — was
   weg zodra de app sloot. Dit bestand maakt er een klantplatform van:

     • één klant, hoogstens drie actieve voertuigen (plus een archief);
     • per voertuig een profiel dat de klant zelf invult of via het RDW
       laat invullen: kenteken, motor, brandstof, turbo, rijprofiel,
       verbruik, kilometerstand, APK en onderhoud;
     • een status per voertuig: open issues, APK, onderhoud, accu,
       koelwater, keuringsstatus — de laatst gemeten stand;
     • rapporten die bewaard blijven (elk rapport dat de app maakt komt
       via registerSessionReport() vanzelf hierheen);
     • ritten die vanzelf worden vastgelegd zolang er een voertuig actief
       is en de auto rijdt — een samenvatting, geen ruwe meting;
     • issues: een foutcode wordt een issue, en gaat vanzelf dicht als hij
       bij een volledige uitlezing niet meer terugkomt;
     • advies dat uit het profiel en de ritten volgt, zonder AI en dus
       zonder tokens.

   WAAR HET STAAT. De bron van waarheid is D1, via POST /klant/platform
   (worker.js, KLANTPLATFORM). De telefoon houdt een kopie van de stand in
   localStorage, zodat het scherm meteen iets toont en ook zonder netwerk
   opent, en een wachtrij voor wat er onderweg niet weg kon. De ruwe
   meting per seconde blijft waar hij al stond: in PLBulk op de telefoon.

   VOOR WIE. Alleen klantaccounts (role 'klant'). Beheer en monteurs
   werken zoals voorheen; voor hen verschijnt er niets.

   PRIVACY. Eerst een eigen akkoord (de Worker weigert zonder). Het
   kenteken staat op de server versleuteld; de VIN gaat alleen als het
   pseudoniem uit _vlVinPseudoniem() de telefoon uit, net als elders.

   PUUR EN NIET PUUR. status(), advies(), issueOps(), ritNieuw()/ritTik()/
   ritKlaar(), rdwNaarProfiel() en profielUitVerbinding() zijn pure
   functies; test-garage.js toetst ze met vm. De rest praat met de server,
   de DOM of de meetwaarden van de app.

   Laadvolgorde: ná pidlane-plfetch.js (plFetch), pidlane-veldlab.js
   (_vlVinPseudoniem) en pidlane-archief.js (registerSessionReport).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    tikMs: 2000,               // hoe vaak de ritwaarnemer pidVals leest
    ritStartKmh: 3,            // een rit begint bij de eerste echte beweging
    ritStilMs: 3 * 60 * 1000,  // zo lang stil (motor uit of stilstand) = rit voorbij
    ritMinKm: 0.3,             // korter is geen rit maar verplaatsen op de oprit
    ritGatMaxS: 10,            // een gat in de meting telt niet als afgelegde weg
    ritBewaarMs: 30000,        // lopende rit zo vaak veilig stellen
    wachtrijMax: 50
  };
  var OPSLAG = { stand: 'pl_garage_stand', actief: 'pl_garage_actief', rit: 'pl_garage_rit', wachtrij: 'pl_garage_wachtrij' };

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  function dagenTot(datum, nu) {
    if (!datum) return null;
    var d = new Date(String(datum).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return null;
    var n = new Date(nu || Date.now()); n.setHours(0, 0, 0, 0);
    return Math.round((d - n) / 864e5);
  }

  /* De status van één voertuig: een kleur en de punten die hem bepalen.
     Rood = nu iets aan doen, oranje = binnenkort of laten nakijken,
     groen = niets bekend. "Niets bekend" is iets anders dan "gezond":
     een voertuig dat nooit is uitgelezen krijgt dat er ook bij. */
  function status(v, nu) {
    v = v || {};
    var p = [];
    var g = v.gezondheid || {};
    var n = v.aantal || {};
    var apk = dagenTot(v.apk_tot, nu);
    if (apk != null && apk < 0) p.push({ ernst: 'rood', tekst: 'APK verlopen sinds ' + (-apk) + ' dag' + (apk === -1 ? '' : 'en') });
    else if (apk != null && apk <= 30) p.push({ ernst: 'oranje', tekst: 'APK verloopt over ' + apk + ' dag' + (apk === 1 ? '' : 'en') });
    if (n.openIssues) p.push({ ernst: g.hoogOpen ? 'rood' : 'oranje', tekst: n.openIssues + ' open punt' + (n.openIssues === 1 ? '' : 'en') });
    if (g.milAan) p.push({ ernst: 'rood', tekst: 'Motorlampje brandt' });
    var od = dagenTot(v.onderhoud_datum, nu);
    if (od != null && od < 0) p.push({ ernst: 'oranje', tekst: 'Onderhoud was gepland ' + (-od) + ' dagen geleden' });
    if (v.onderhoud_km && v.kmstand && v.kmstand >= v.onderhoud_km) p.push({ ernst: 'oranje', tekst: 'Onderhoud: ' + (v.kmstand - v.onderhoud_km).toLocaleString('nl') + ' km over de geplande stand' });
    else if (v.onderhoud_km && v.kmstand && v.onderhoud_km - v.kmstand <= 1000) p.push({ ernst: 'info', tekst: 'Onderhoud over ' + (v.onderhoud_km - v.kmstand).toLocaleString('nl') + ' km' });
    if (typeof g.accuRust === 'number' && g.accuRust < 12.2) p.push({ ernst: 'oranje', tekst: 'Accu zwak in rust (' + nl1(g.accuRust) + ' V)' });
    if (typeof g.accuLopend === 'number' && (g.accuLopend < 13.2 || g.accuLopend > 14.9)) p.push({ ernst: 'oranje', tekst: 'Laadspanning ' + nl1(g.accuLopend) + ' V (normaal 13,2–14,8)' });
    if (typeof g.maxKoelwater === 'number' && g.maxKoelwater >= 108) p.push({ ernst: 'rood', tekst: 'Koelwater liep op tot ' + Math.round(g.maxKoelwater) + ' °C' });
    if (Array.isArray(g.readinessNietKlaar) && g.readinessNietKlaar.length) p.push({ ernst: 'info', tekst: g.readinessNietKlaar.length + ' zelftest' + (g.readinessNietKlaar.length === 1 ? '' : 's') + ' nog niet klaar' });
    var gezien = v.laatst_gezien ? Math.round(((nu || Date.now()) - new Date(v.laatst_gezien)) / 864e5) : null;
    if (gezien == null) p.push({ ernst: 'info', tekst: 'Nog nooit uitgelezen' });
    else if (gezien > 60) p.push({ ernst: 'info', tekst: gezien + ' dagen niet uitgelezen' });
    var kleur = p.some(function (x) { return x.ernst === 'rood'; }) ? 'rood' : p.some(function (x) { return x.ernst === 'oranje'; }) ? 'oranje' : 'groen';
    return { kleur: kleur, punten: p };
  }

  function gewogenVerbruik(ritten) {
    var km = 0, l = 0;
    (ritten || []).forEach(function (r) {
      if (typeof r.verbruik_l100 === 'number' && typeof r.km === 'number' && r.km >= 2) { km += r.km; l += r.verbruik_l100 * r.km / 100; }
    });
    return km >= 20 ? { l100: Math.round(l / km * 1000) / 10, km: Math.round(km) } : null;
  }

  function mediaan(lijst) {
    var a = lijst.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* Advies dat uit het profiel en de ritten volgt — geen AI, geen tokens.
     Elk advies zegt waar het op gebaseerd is; zonder genoeg gegevens komt
     er geen advies, want een gok die eruitziet als een meting is erger dan
     niets. */
  function advies(v, ritten, nu) {
    v = v || {};
    ritten = ritten || [];
    var uit = [];
    var brandstof = String(v.brandstof || '');
    var diesel = brandstof === 'diesel';
    var verb = gewogenVerbruik(ritten);
    if (verb && v.verbruik_opgegeven) {
      var afw = (verb.l100 - v.verbruik_opgegeven) / v.verbruik_opgegeven;
      if (afw > 0.15) uit.push({ soort: 'verbruik', titel: 'Verbruik ' + Math.round(afw * 100) + '% hoger dan je opgaf',
        tekst: 'Gemeten ' + verb.l100.toLocaleString('nl') + ' l/100 km over ' + verb.km + ' km, tegen ' + v.verbruik_opgegeven.toLocaleString('nl') +
          ' opgegeven. Kijk eerst naar de bandenspanning en of er iets meegesleept wordt (dakkoffer, aanhanger). Blijft het hoog, laat dan de brandstoftrims en het luchtfilter nakijken.' });
      else if (afw < -0.1) uit.push({ soort: 'verbruik', titel: 'Zuiniger dan opgegeven',
        tekst: 'Gemeten ' + verb.l100.toLocaleString('nl') + ' l/100 km over ' + verb.km + ' km. Pas je opgave aan als dit je normale rijpatroon is.' });
    } else if (verb && !v.verbruik_opgegeven) {
      uit.push({ soort: 'verbruik', titel: 'Gemeten verbruik: ' + verb.l100.toLocaleString('nl') + ' l/100 km',
        tekst: 'Over ' + verb.km + ' km. Vul in je profiel in wat je normaal verbruikt, dan meldt de app het als dat gaat afwijken.' });
    }
    var kms = ritten.map(function (r) { return r.km; }).filter(function (x) { return typeof x === 'number'; });
    var mk = kms.length >= 5 ? mediaan(kms) : null;
    if (v.rijprofiel === 'korte ritten' || (mk != null && mk < 8)) {
      uit.push({ soort: 'rijprofiel', titel: 'Veel korte ritten',
        tekst: (mk != null ? 'De helft van je ritten is korter dan ' + mk.toLocaleString('nl') + ' km. ' : '') +
          (diesel ? 'Een roetfilter regenereert pas na zo’n 15–20 minuten doorrijden. Rij af en toe een stuk snelweg, anders loopt het filter vol.'
                  : 'De motor wordt dan zelden goed warm en de accu laadt nauwelijks bij. Een langere rit per week helpt allebei.') });
    }
    if (v.turbo === 'ja') {
      var snelweg = ritten.some(function (r) { return typeof r.max_kmh === 'number' && r.max_kmh >= 100; });
      uit.push({ soort: 'turbo', titel: 'Turbo sparen',
        tekst: 'Geef pas vol gas als het koelwater boven de 80 °C is, en laat na een snelwegrit de motor even stationair lopen voor je hem uitzet.' + (snelweg ? '' : '') });
    }
    if (v.rijprofiel === 'aanhanger of caravan') {
      uit.push({ soort: 'aanhanger', titel: 'Met aanhanger of caravan',
        tekst: 'Houd onderweg het koelwater in de gaten: de Caravanrit-coach in de app waarschuwt bij oplopende temperatuur en schakeladvies.' });
    }
    var heet = ritten.filter(function (r) { return typeof r.max_koelwater === 'number' && r.max_koelwater >= 105; });
    if (heet.length) uit.push({ soort: 'koeling', titel: 'Koelwater liep ' + heet.length + '× boven 105 °C',
      tekst: 'Laat het koelvloeistofpeil, de thermostaat en de koelventilator nakijken. Een motor die te heet wordt, kost snel veel geld.' });
    var laag = ritten.filter(function (r) { return typeof r.min_accu === 'number' && r.min_accu > 5 && r.min_accu < 13.0; });
    if (laag.length >= 2) uit.push({ soort: 'laden', titel: 'Laadspanning onder 13 V tijdens het rijden',
      tekst: 'In ' + laag.length + ' ritten. Dat wijst op een dynamo of accu die het niet bijhoudt; laat de laadspanning meten.' });
    var stat = ritten.map(function (r) { return r.stationair_pct; }).filter(function (x) { return typeof x === 'number'; });
    if (stat.length >= 3 && mediaan(stat) > 30) uit.push({ soort: 'stationair', titel: 'Veel stationair draaien',
      tekst: 'Ongeveer ' + Math.round(mediaan(stat)) + '% van de rijtijd staat de motor stil te draaien. Dat kost brandstof zonder dat je opschiet.' });
    var apk = dagenTot(v.apk_tot, nu);
    if (apk != null && apk >= 0 && apk <= 60) uit.push({ soort: 'apk', titel: 'APK over ' + apk + ' dagen',
      tekst: 'Plan de keuring op tijd. Lees vooraf de foutcodes en de keuringsstatus uit, dan weet je of er iets openstaat.' });
    return uit;
  }

  /* Van een uitlezing naar issue-bewerkingen. `open` = de sleutels van de
     issues die nu open staan. Een code die gezien is → 'gezien'. Een open
     dtc-issue dat bij een VOLLEDIGE uitlezing (bevestigd én pending
     gelezen) nergens meer staat → 'opgelost'. Niet volledig gelezen =
     niets sluiten: "niet gelezen" is geen "weg" (#218). */
  function issueOps(open, u, info) {
    u = u || {};
    info = info || function () { return {}; };
    var ops = [], gezien = {};
    var sev = { high: 'hoog', med: 'midden', low: 'laag', warn: 'laag' };
    [['bevestigd', ''], ['pending', ' (in afwachting)'], ['permanent', ' (permanent)']].forEach(function (s) {
      (u[s[0]] || []).forEach(function (code) {
        if (gezien[code]) return;
        gezien[code] = true;
        var i = info(code) || {};
        ops.push({ sleutel: 'dtc:' + code, soort: 'dtc', titel: code + ' — ' + (i.desc || 'onbekende code') + s[1], ernst: sev[i.sev] || 'midden', actie: 'gezien' });
      });
    });
    var volledig = u.gelezen ? (u.gelezen.bevestigd && u.gelezen.pending !== false) : !!u.volledig;
    if (volledig) (open || []).forEach(function (sl) {
      if (/^dtc:/.test(sl) && !gezien[sl.slice(4)]) ops.push({ sleutel: sl, actie: 'opgelost' });
    });
    return ops;
  }

  /* De waakronde van één sessie als tekst voor het voertuigarchief. `hist`
     = PLWaak.historie(); `info(pid)` = { naam, eenheid }. Null als er niets
     gemeten is: een leeg rapport is geen rapport. */
  function waakTekst(hist, info, t) {
    hist = (hist || []).filter(function (h) { return h && h.n > 0; });
    if (!hist.length) return null;
    info = info || function (p) { return { naam: p, eenheid: '' }; };
    var getal = function (v) { return typeof v === 'number' && isFinite(v) ? (Math.round(v * 10) / 10).toLocaleString('nl') : '—'; };
    var bev = hist.filter(function (h) { return h.let > 0; });
    var stil = hist.filter(function (h) { return h.let === 0 && h.ok === 0 && h.stil > 0; });
    var r = ['PidLane — Waakronde', 'Datum: ' + new Date(t || Date.now()).toLocaleString('nl'),
      hist.length + ' sensoren buiten je selectie bewaakt, ' + hist.reduce(function (a, h) { return a + h.n; }, 0) + ' metingen.', ''];
    r.push('=== BEVINDINGEN (' + bev.length + ') ===');
    if (!bev.length) r.push(' geen');
    bev.forEach(function (h) {
      var i = info(h.pid) || {};
      r.push(' ' + (i.naam || h.pid) + ': ' + (h.reden || 'buiten bereik') + ' — ' + h.let + ' van ' + h.n + ' metingen, laatst ' + getal(h.waarde) + ' ' + (i.eenheid || '') +
        ' (min ' + getal(h.min) + ', max ' + getal(h.max) + ')');
    });
    r.push('', '=== ZONDER ANTWOORD (' + stil.length + ') ===');
    r.push(stil.length ? ' ' + stil.map(function (h) { return (info(h.pid) || {}).naam || h.pid; }).join(', ') : ' geen');
    r.push('', '=== NORMAAL ===');
    hist.filter(function (h) { return h.let === 0 && h.ok > 0; }).forEach(function (h) {
      var i = info(h.pid) || {};
      r.push(' ' + (i.naam || h.pid) + ': ' + getal(h.waarde) + ' ' + (i.eenheid || '') + ' (' + h.n + '×, ' + getal(h.min) + '–' + getal(h.max) + ')');
    });
    return r.join('\n');
  }

  // ── De ritwaarnemer: een rit als optelsom van monsters ─────────────
  function ritNieuw(t) {
    return { start: new Date(t).toISOString(), t0: t, tLaatst: t, tBeweeg: t, km: 0, s: 0, sStat: 0, sBeweeg: 0,
      maxKmh: 0, maxKoel: null, minAccu: null, liters: 0, sLiters: 0, trimSom: 0, trimN: 0, codes: [] };
  }

  /* m: { kmh, rpm, koelwater, accu, lph, maf } — elk mag ontbreken.
     brandstof: 'diesel' rekent niet met de luchtmassa (een diesel loopt
     arm, dan is λ=1 fout); zonder 015E blijft het verbruik daar leeg. */
  function ritTik(r, m, t, brandstof) {
    var dt = (t - r.tLaatst) / 1000;
    r.tLaatst = t;
    if (!(dt > 0)) return r;
    if (dt > CFG.ritGatMaxS) dt = 0;               // een meetgat is geen afgelegde weg
    var kmh = typeof m.kmh === 'number' ? m.kmh : null;
    if (kmh != null) {
      r.km += kmh * dt / 3600;
      r.maxKmh = Math.max(r.maxKmh, kmh);
      if (kmh >= 2) { r.sBeweeg += dt; r.tBeweeg = t; }
      else if (typeof m.rpm === 'number' && m.rpm > 300) r.sStat += dt;
    }
    r.s += dt;
    if (typeof m.koelwater === 'number') r.maxKoel = r.maxKoel == null ? m.koelwater : Math.max(r.maxKoel, m.koelwater);
    if (typeof m.accu === 'number' && typeof m.rpm === 'number' && m.rpm > 300) r.minAccu = r.minAccu == null ? m.accu : Math.min(r.minAccu, m.accu);
    var lph = null;
    if (typeof m.lph === 'number') lph = m.lph;
    else if (typeof m.maf === 'number' && brandstof !== 'diesel') lph = m.maf * 3600 / (14.7 * 745);
    if (lph != null && dt > 0) { r.liters += lph * dt / 3600; r.sLiters += dt; }
    if (typeof m.trim === 'number') { r.trimSom += m.trim; r.trimN++; }
    return r;
  }

  function nl1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }

  function rond(x, d) { var f = Math.pow(10, d || 1); return Math.round(x * f) / f; }

  /* Klaar → de samenvatting die naar de server gaat, of null als het geen
     rit was. Verbruik alleen als het over het grootste deel van de rit
     gemeten is — anders is het een getal over een stukje. */
  function ritKlaar(r) {
    if (!r || r.km < CFG.ritMinKm) return null;
    var uit = {
      start: r.start, eind: new Date(r.tLaatst).toISOString(), duur_s: Math.round(r.s), km: rond(r.km, 1),
      gem_kmh: r.sBeweeg > 0 ? rond(r.km / (r.sBeweeg / 3600), 1) : null, max_kmh: rond(r.maxKmh, 0),
      max_koelwater: r.maxKoel, min_accu: r.minAccu != null ? rond(r.minAccu, 2) : null,
      stationair_pct: r.s > 0 ? rond(r.sStat / r.s * 100, 0) : null,
      liters: null, verbruik_l100: null, codes: r.codes.slice(0, 20),
      extra: r.trimN ? { trimLang: rond(r.trimSom / r.trimN, 1) } : null
    };
    if (r.sLiters >= r.s * 0.7 && r.km >= 1) { uit.liters = rond(r.liters, 2); uit.verbruik_l100 = rond(r.liters / r.km * 100, 1); }
    return uit;
  }

  /* RDW open data → profielvelden. `rij` uit m9d7-ebf2 (gekentekende
     voertuigen), `brandstoffen` uit 8ys7-d773. */
  function rdwNaarProfiel(rij, brandstoffen) {
    rij = rij || {};
    var p = {};
    var dat = function (s) { s = String(s || ''); return /^\d{8}$/.test(s) ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : null; };
    if (rij.merk) p.merk = String(rij.merk).trim();
    if (rij.handelsbenaming) p.model = String(rij.handelsbenaming).trim();
    var eerste = dat(rij.datum_eerste_toelating);
    if (eerste) p.bouwjaar = parseInt(eerste.slice(0, 4), 10);
    var apk = dat(rij.vervaldatum_apk);
    if (apk) p.apk_tot = apk;
    if (rij.cilinderinhoud) p.cilinderinhoud = parseInt(rij.cilinderinhoud, 10) || null;
    var oms = (brandstoffen || []).map(function (b) { return String(b.brandstof_omschrijving || '').toLowerCase(); });
    var kw = (brandstoffen || []).map(function (b) { return parseFloat(b.nettomaximumvermogen); }).filter(function (x) { return x > 0; });
    if (kw.length) p.vermogen_kw = Math.round(Math.max.apply(null, kw));
    var el = oms.indexOf('elektriciteit') >= 0;
    var fos = oms.filter(function (o) { return o && o !== 'elektriciteit'; })[0];
    if (el && fos) p.brandstof = 'hybride';
    else if (el) p.brandstof = 'elektrisch';
    else if (fos === 'benzine' || fos === 'diesel' || fos === 'lpg' || fos === 'cng') p.brandstof = fos;
    if (p.cilinderinhoud) p.motor = (Math.round(p.cilinderinhoud / 100) / 10).toFixed(1).replace('.', ',') + ' liter' + (p.vermogen_kw ? ', ' + p.vermogen_kw + ' kW (' + Math.round(p.vermogen_kw * 1.36) + ' pk)' : '');
    return p;
  }

  /* Wat de verbonden auto zelf over zijn profiel zegt: merk/model/jaar uit
     vehicleInfo, turbo uit de PID-gate (alleen als het bewijs er is). */
  function profielUitVerbinding(vi, turboBewezen) {
    vi = vi || {};
    var p = {};
    if (vi.merk) p.merk = vi.merk;
    if (vi.model) p.model = vi.model;
    if (vi.year && /^\d{4}$/.test(String(vi.year))) p.bouwjaar = parseInt(vi.year, 10);
    var b = String(vi.brandstof || '').toLowerCase();
    if (/diesel/.test(b)) p.brandstof = 'diesel'; else if (/benzine|gasoline|petrol/.test(b)) p.brandstof = 'benzine';
    if (turboBewezen === true) p.turbo = 'ja';
    return p;
  }

  // ════════════════════════════════════════════════════════════════
  //  OPSLAG, SERVER, WACHTRIJ
  // ════════════════════════════════════════════════════════════════

  function lees(k, standaard) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : standaard; }
    catch (e) { console.warn('PLGarage: lokale opslag ' + k + ' onleesbaar', e); return standaard; }
  }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('PLGarage: lokale opslag ' + k + ' niet te schrijven', e); }
  }

  function wie() { try { return String((window.currentUser && window.currentUser.user) || '').toLowerCase(); } catch (e) { return ''; } }

  function isKlant() {
    try { var u = window.currentUser; return !!(u && String(u.role || '').toLowerCase() === 'klant'); }
    catch (e) { return false; }
  }

  async function api(actie, data) {
    if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
    var r = await plFetch('/klant/platform', { method: 'POST', json: Object.assign({ actie: actie }, data || {}) });
    var d = {};
    try { d = await r.json(); } catch (e) { throw new Error('Onleesbaar antwoord van de server (' + r.status + ')'); }
    if (!r.ok || !d.ok) {
      var f = new Error(d.error || ('Serverfout ' + r.status));
      f.status = r.status; f.data = d;
      throw f;
    }
    return d;
  }

  // Wat onderweg niet weg kon, gaat later. Alleen schrijfacties die veilig
  // twee keer kunnen (rit en rapport ontdubbelt de server zelf).
  function inWachtrij(actie, data) {
    var q = lees(OPSLAG.wachtrij, []);
    q.push({ actie: actie, data: data, t: Date.now() });
    while (q.length > CFG.wachtrijMax) q.shift();
    schrijf(OPSLAG.wachtrij, q);
  }
  var _legen = false;
  async function wachtrijLegen() {
    if (_legen || !isKlant()) return;
    var q = lees(OPSLAG.wachtrij, []);
    if (!q.length) return;
    _legen = true;
    try {
      var rest = [];
      for (var i = 0; i < q.length; i++) {
        try { await api(q[i].actie, q[i].data); }
        catch (e) {
          // 4xx behalve 401/403/429 = dit wordt nooit iets; weggooien en zeggen.
          if (e.status && e.status >= 400 && e.status < 500 && [401, 403, 429].indexOf(e.status) < 0) console.warn('PLGarage: wachtrij-item geweigerd, weggegooid: ' + q[i].actie + ' — ' + e.message);
          else rest.push(q[i]);
        }
      }
      schrijf(OPSLAG.wachtrij, rest);
    } finally { _legen = false; }
  }

  async function schrijfOfWacht(actie, data) {
    try { return await api(actie, data); }
    catch (e) {
      if (!e.status || e.status >= 500 || e.status === 429) { inWachtrij(actie, data); return { ok: false, inWachtrij: true }; }
      throw e;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  STAND
  // ════════════════════════════════════════════════════════════════

  var _st = { stand: lees(OPSLAG.stand, null), actiefId: lees(OPSLAG.actief, null), fout: null, bezig: false,
    view: 'lijst', vid: null, tab: 'overzicht', cache: {}, onbekend: null, gekoppeld: null, rit: null };

  function voertuigen(alleActief) {
    var l = (_st.stand && _st.stand.voertuigen) || [];
    return alleActief ? l.filter(function (v) { return v.status === 'actief'; }) : l;
  }
  function voertuig(id) { return voertuigen().filter(function (v) { return v.id === id; })[0] || null; }
  function actief() {
    var v = voertuig(_st.actiefId);
    return v && v.status === 'actief' ? v : null;
  }
  function zetActief(id) {
    _st.actiefId = id; schrijf(OPSLAG.actief, id);
    tekenKaart();
  }

  async function ververs() {
    if (!isKlant()) return null;
    _st.bezig = true; _st.fout = null;
    try {
      var d = await api('stand');
      d.__u = wie();                                   // van wie deze kopie is
      _st.stand = d; schrijf(OPSLAG.stand, d);
      var act = voertuigen(true);
      if (!actief() && act.length) zetActief(act[0].id);
      wachtrijLegen();
      return d;
    } catch (e) {
      _st.fout = e.message;
      console.warn('PLGarage: stand ophalen mislukt — de bewaarde kopie blijft staan', e);
      return null;
    } finally { _st.bezig = false; teken(); tekenKaart(); }
  }

  // ════════════════════════════════════════════════════════════════
  //  KOPPELINGEN MET DE REST VAN DE APP
  // ════════════════════════════════════════════════════════════════

  /* Elk rapport dat registerSessionReport() ziet. AI-rapporten en
     foutcode-uitlezingen; txt/pdf zijn een ander jasje om hetzelfde. */
  function rapport(rec) {
    try {
      if (!rec || !isKlant() || !(_st.stand && _st.stand.akkoord)) return;
      if (rec.type !== 'ai' && rec.type !== 'dtc') return;
      var v = actief();
      if (!v || !rec.text) return;
      schrijfOfWacht('rapport_opslaan', { voertuig_id: v.id, soort: rec.type, titel: rec.title || '', tekst: String(rec.text).slice(0, 120000) })
        .then(function () { if (_st.cache[v.id]) delete _st.cache[v.id].rapporten; })
        .catch(function (e) { console.warn('PLGarage: rapport niet bewaard', e); });
    } catch (e) { console.warn('PLGarage.rapport', e); }
  }

  /* Na een uitlezing (PLFoutcodes of het oude tabblad): issues bijwerken en
     de gezondheid meenemen. `u` = { bevestigd, pending, permanent, gelezen,
     readiness? } */
  async function foutcodes(u) {
    try {
      if (!u || !isKlant() || !(_st.stand && _st.stand.akkoord)) return;
      var v = actief();
      if (!v) return;
      var info = function (c) { try { return (typeof dtcInfo === 'function') ? dtcInfo(c) : {}; } catch (e) { return {}; } };
      var bestaand = [];
      try { bestaand = ((await api('issues', { voertuig_id: v.id })).issues || []).filter(function (i) { return i.status === 'open'; }).map(function (i) { return i.sleutel; }); }
      catch (e) { console.warn('PLGarage: open issues niet opgehaald — alleen toevoegen, niets sluiten', e); }
      var ops = issueOps(bestaand, u, info);
      var nieuw = ops.filter(function (o) { return o.actie === 'gezien' && bestaand.indexOf(o.sleutel) < 0; });
      if (nieuw.length && voorkeurMelding('meldingPunten', false)) melding('🔴 ' + nieuw.length + ' nieuw open punt' + (nieuw.length === 1 ? '' : 'en') + ' bij ' + (v.naam || 'je voertuig'));
      if (ops.length) await schrijfOfWacht('issues_bijwerken', { voertuig_id: v.id, ops: ops });
      var g = Object.assign({}, v.gezondheid || {});
      g.codes = (u.bevestigd || []).length + (u.pending || []).length;
      g.hoogOpen = ops.some(function (o) { return o.actie === 'gezien' && o.ernst === 'hoog'; });
      if (u.readiness) { g.milAan = !!u.readiness.mil; g.readinessNietKlaar = u.readiness.nietKlaar || []; }
      g.gemeten = new Date().toISOString();
      await schrijfOfWacht('status_opslaan', { voertuig_id: v.id, gezondheid: g });
      delete _st.cache[v.id];
      ververs();
    } catch (e) { console.warn('PLGarage.foutcodes', e); }
  }

  /* Eerdere rapporten van het actieve voertuig als context voor een analyse
     ("oude data meenemen", Mijn voorkeuren). Opgehaald zodra het voertuig
     bekend is, want de analyse zelf wacht niet op het netwerk. Hoogstens drie,
     elk hoogstens 1.300 tekens. */
  var _eerder = { vid: null, blok: '', n: 0, bezig: false };
  async function eerderHalen() {
    var v = actief();
    if (!magBewaren() || !v || _eerder.bezig || _eerder.vid === v.id) return;
    _eerder.bezig = true;
    try {
      var lijst = ((await api('rapporten', { voertuig_id: v.id, limiet: 3 })).rapporten || []).slice(0, 3);
      var delen = [];
      for (var i = 0; i < lijst.length; i++) {
        var r = (await api('rapport', { id: lijst[i].id })).rapport;
        if (r && r.tekst) delen.push('--- ' + (r.titel || r.soort) + ' (' + String(r.aangemaakt).slice(0, 10) + ') ---\n' + String(r.tekst).slice(0, 1300));
      }
      _eerder = { vid: v.id, n: delen.length, bezig: false,
        blok: delen.length ? '\n\nEERDERE RAPPORTEN VAN DIT VOERTUIG (uit eerdere sessies, nieuwste eerst — vergelijk: wat is verbeterd, verslechterd of nieuw; herhaal ze niet):\n' + delen.join('\n') : '' };
    } catch (e) { _eerder.bezig = false; console.warn('PLGarage: eerdere rapporten niet opgehaald', e); }
  }
  function eerderBlok() { var v = actief(); return (v && _eerder.vid === v.id) ? _eerder.blok : ''; }
  function eerderAantal() { var v = actief(); return (v && _eerder.vid === v.id) ? _eerder.n : 0; }

  function magBewaren() { return isKlant() && !!(_st.stand && _st.stand.akkoord) && !!actief(); }

  /* De waakronde vond iets buiten bereik → een open punt bij het voertuig.
     Eén keer per sensor per sessie: een volgende sessie met dezelfde
     bevinding telt de server op via "gezien". */
  var _waakGemeld = {};
  function waakBevinding(pid, titel) {
    try {
      if (!magBewaren() || !pid || _waakGemeld[pid]) return;
      _waakGemeld[pid] = true;
      var v = actief();
      if (voorkeurMelding('meldingPunten', false)) melding('👁 Nieuw open punt bij ' + (v.naam || 'je voertuig') + ': ' + String(titel || pid).slice(0, 80));
      schrijfOfWacht('issues_bijwerken', { voertuig_id: v.id, ops: [{ sleutel: 'waak:' + pid, soort: 'bevinding', titel: String(titel || pid).slice(0, 160), ernst: 'midden', actie: 'gezien' }] })
        .then(function () { if (_st.cache[v.id]) delete _st.cache[v.id].issues; })
        .catch(function (e) { console.warn('PLGarage: waakbevinding niet bewaard', e); });
    } catch (e) { console.warn('PLGarage.waakBevinding', e); }
  }

  // De waakronde stopt → het resultaat als rapport bij het voertuig.
  function waakKlaar(hist, info) {
    try {
      if (!magBewaren()) return;
      var tekst = waakTekst(hist, info);
      if (!tekst) return;
      var v = actief();
      var n = (hist || []).filter(function (h) { return h && h.let > 0; }).length;
      schrijfOfWacht('rapport_opslaan', { voertuig_id: v.id, soort: 'waak', titel: 'Waakronde — ' + (n ? n + ' bevinding' + (n === 1 ? '' : 'en') : 'geen bevindingen'), tekst: tekst })
        .then(function () { if (_st.cache[v.id]) delete _st.cache[v.id].rapporten; })
        .catch(function (e) { console.warn('PLGarage: waakrapport niet bewaard', e); });
    } catch (e) { console.warn('PLGarage.waakKlaar', e); }
  }

  /* Het Voertuigoverzicht (openVehicleOverview in pidlane-voertuigdata.js)
     leest en schrijft voor een klant het actieve voertuig hier, in plaats
     van een tweede lijst in localStorage die met Mijn voertuigen uit de pas
     loopt. */
  function dossier() {
    if (!magBewaren()) return null;
    var v = actief();
    return { id: v.id, naam: v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'je voertuig',
      km: v.kmstand != null ? String(v.kmstand) : '', beurt: v.onderhoud_laatst || '', distributie: v.distributie || '', bijz: v.notities || '',
      merk: v.merk || '', model: v.model || '', year: v.bouwjaar != null ? String(v.bouwjaar) : '', brandstof: v.brandstof || '' };
  }
  async function dossierBewaar(d) {
    if (!magBewaren()) return null;
    var v = actief();
    var km = String(d.km || '').replace(/[^0-9]/g, '');
    var b = String(d.brandstof || '').toLowerCase().trim();
    var jaar = String(d.year || '').replace(/[^0-9]/g, '');
    var w = { id: v.id, kmstand: km ? parseInt(km, 10) : null, onderhoud_laatst: d.beurt || null, distributie: d.distributie || null,
      notities: d.bijz || null, merk: d.merk || null, model: d.model || null };
    if (/^\d{4}$/.test(jaar)) w.bouwjaar = parseInt(jaar, 10);
    if (['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng'].indexOf(b) >= 0) w.brandstof = b;
    var r = await api('voertuig_opslaan', { voertuig: w });
    delete _st.cache[v.id];
    await ververs();
    return r.voertuig;
  }

  function pv(pid) {
    try { var x = (typeof pidVals !== 'undefined') ? pidVals[pid] : undefined; return typeof x === 'number' && isFinite(x) ? x : undefined; }
    catch (e) { return undefined; }
  }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); } catch (e) { return false; } }

  // Welke auto hangt er aan? Pseudoniem van de VIN tegen de voertuigen.
  var _vinGezien = null;
  async function herkenAuto() {
    var vi = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
    if (!vi.vin || vi.vin === _vinGezien || !(_st.stand && _st.stand.akkoord)) return;
    _vinGezien = vi.vin;
    var ps = null;
    try { ps = (typeof _vlVinPseudoniem === 'function') ? await _vlVinPseudoniem(vi.vin) : null; }
    catch (e) { console.warn('PLGarage: pseudoniem niet te maken', e); }
    if (!ps) return;
    var hit = voertuigen(true).filter(function (v) { return v.vin_pseudo === ps; })[0];
    if (hit) {
      _st.onbekend = null;
      if (_st.actiefId !== hit.id) { zetActief(hit.id); melding('🚗 Verbonden met ' + (hit.naam || hit.merk || 'je voertuig')); }
      _st.gekoppeld = hit.id;
      // De vaste sensorselectie van deze auto (Mijn voorkeuren). Alleen na een
      // herkenning op het chassisnummer: de set van een diesel hoort niet op
      // een andere auto terecht te komen.
      try { if (Array.isArray(hit.pid_selectie) && hit.pid_selectie.length && window.PLVoorkeur) PLVoorkeur.selectieToepassen(hit.pid_selectie, hit.naam || hit.merk); }
      catch (e) { console.warn('PLGarage: vaste sensorselectie niet toegepast', e); }
      return;
    }
    _st.onbekend = { pseudo: ps, profiel: profielUitVerbinding(vi) };
    melding('🚗 Deze auto staat nog niet in Mijn voertuigen — ☰ → Mijn voertuigen');
    teken();
  }

  // Mijn voorkeuren: of een melding mag (met de standaard van vóór de
  // voorkeuren als die niets zegt) en hoe verbruik getoond wordt.
  function voorkeurMelding(soort, standaard) {
    try { var p = window.PLVoorkeur && PLVoorkeur.huidig(); return p && typeof p[soort] === 'boolean' ? p[soort] : standaard; }
    catch (e) { return standaard; }
  }
  function verbruikNl(l100) {
    try { if (window.PLVoorkeur && PLVoorkeur.verbruik) return PLVoorkeur.verbruik(l100); } catch (e) { console.warn('PLGarage: verbruikseenheid', e); }
    return (Math.round(l100 * 10) / 10).toLocaleString('nl') + ' l/100 km';
  }

  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLGarage: melding', e); } }

  // ── De rit: elke tik pidVals lezen, niets op de bus zetten ─────────
  function ritTikNu() {
    var v = actief();
    var nu = Date.now();
    if (!isKlant() || !(_st.stand && _st.stand.akkoord) || !v) return;
    var verbonden = isVerbonden();
    var r = _st.rit;
    if (verbonden) {
      var kmh = pv('010D');
      if (!r && typeof kmh === 'number' && kmh >= CFG.ritStartKmh) {
        r = _st.rit = ritNieuw(nu); r.vid = v.id;
      }
      if (r) {
        ritTik(r, { kmh: kmh, rpm: pv('010C'), koelwater: pv('0105'), accu: pv('0142'), lph: pv('015E'), maf: pv('0110'), trim: pv('0107') }, nu, v.brandstof);
        try { (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes) ? dtcCodes : []).forEach(function (c) { if (r.codes.indexOf(c) < 0) r.codes.push(c); }); }
        catch (e) { console.warn('PLGarage: codes van de rit', e); }
        if (nu - r.tBeweeg > CFG.ritStilMs) return ritAf('stil');
        if (!r._bewaard || nu - r._bewaard > CFG.ritBewaarMs) { r._bewaard = nu; schrijf(OPSLAG.rit, r); }
      }
      // Rust- en laadspanning voor de status, ook zonder rit.
      var rpm = pv('010C'), accu = pv('0142');
      if (typeof accu === 'number') {
        var g = (v.gezondheid = v.gezondheid || {});
        if (typeof rpm === 'number' && rpm < 100) g.accuRust = accu; else if (typeof rpm === 'number' && rpm > 600) g.accuLopend = accu;
      }
    } else if (r) ritAf('verbinding weg');
  }

  async function ritAf(reden) {
    var r = _st.rit; _st.rit = null; schrijf(OPSLAG.rit, null);
    if (!r) return;
    var sam = ritKlaar(r);
    if (!sam) return;
    sam.extra = Object.assign({}, sam.extra || {}, { einde: reden });
    var v = voertuig(r.vid);
    try {
      await schrijfOfWacht('rit_opslaan', { voertuig_id: r.vid, rit: sam });
      var g = Object.assign({}, (v && v.gezondheid) || {});
      if (sam.max_koelwater != null) g.maxKoelwater = sam.max_koelwater;
      if (sam.extra && sam.extra.trimLang != null) g.trimLang = sam.extra.trimLang;
      g.gemeten = new Date().toISOString();
      var km = pv('01A6');
      await schrijfOfWacht('status_opslaan', { voertuig_id: r.vid, gezondheid: g, kmstand: typeof km === 'number' ? Math.round(km) : undefined });
      if (voorkeurMelding('meldingRit', true)) melding('🚗 Rit vastgelegd: ' + sam.km.toLocaleString('nl') + ' km' + (sam.verbruik_l100 ? ' · ' + verbruikNl(sam.verbruik_l100) : ''));
      if (_st.cache[r.vid]) delete _st.cache[r.vid];
      ververs();
    } catch (e) { console.warn('PLGarage: rit niet bewaard', e); }
  }

  // Een rit die bij het afsluiten van de app nog liep: afronden bij de start.
  function ritHerstel() {
    var r = lees(OPSLAG.rit, null);
    if (r && r.vid && r.tLaatst) { _st.rit = r; ritAf('app gesloten tijdens de rit'); }
  }

  // ════════════════════════════════════════════════════════════════
  //  VENSTER
  // ════════════════════════════════════════════════════════════════

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function datumNl(s, metTijd) {
    if (!s) return '—';
    var d = new Date(s); if (isNaN(d)) return esc(s);
    return d.toLocaleDateString('nl', { day: 'numeric', month: 'short', year: 'numeric' }) + (metTijd ? ' ' + d.toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  function kentekenNl(k) {
    k = String(k || '');
    if (!k) return '';
    // Sidecode-streepjes: tussen cijfers en letters.
    return k.replace(/([A-Z]+)(\d)/g, '$1-$2').replace(/(\d)([A-Z])/g, '$1-$2');
  }

  var CSS =
    '#plGarOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plGarOv .gr-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f)}' +
    '#plGarOv .gr-kop{display:flex;align-items:center;gap:9px}' +
    '#plGarOv .gr-t{font:800 16px var(--f);color:var(--tx)}' +
    '#plGarOv .gr-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
    '#plGarOv .gr-sub{font-size:12px;color:var(--tx3);margin:2px 0 12px}' +
    '#plGarOv .gr-blok{background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:11px 12px;margin-bottom:10px}' +
    '#plGarOv .gr-bh{display:flex;align-items:center;gap:8px;font:800 13px var(--f);color:var(--tx);margin-bottom:6px}' +
    '#plGarOv .gr-bh .gr-r{margin-left:auto;font:600 11px var(--f);color:var(--tx3)}' +
    '#plGarOv .gr-auto{display:flex;gap:11px;align-items:center;cursor:pointer}' +
    '#plGarOv .gr-dot{width:12px;height:12px;border-radius:50%;flex:0 0 12px}' +
    '.gr-dot.groen{background:#22c55e}.gr-dot.oranje{background:#f59e0b}.gr-dot.rood{background:#ef4444}' +
    '#plGarOv .gr-naam{font:800 14px var(--f);color:var(--tx)} #plGarOv .gr-klein{font-size:12px;color:var(--tx3)}' +
    '#plGarOv .gr-kent{display:inline-block;background:#f5c518;color:#111;font:800 12px ui-monospace,monospace;padding:2px 7px;border-radius:4px;border-left:6px solid #1d4ed8;letter-spacing:.5px}' +
    '#plGarOv .gr-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px}' +
    '#plGarOv .gr-tab{flex:0 0 auto;padding:7px 11px;border-radius:8px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);font:700 12px var(--f);cursor:pointer}' +
    '#plGarOv .gr-tab.aan{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plGarOv .gr-punt{font-size:12px;color:var(--tx2);padding:3px 0}' +
    '#plGarOv .gr-punt.rood{color:#ef4444}#plGarOv .gr-punt.oranje{color:#f59e0b}' +
    '#plGarOv .gr-rij{display:grid;grid-template-columns:1fr auto;gap:3px 10px;font-size:12px;color:var(--tx2)}' +
    '#plGarOv .gr-item{padding:8px 0;border-top:1px solid var(--bd);font-size:12px;color:var(--tx2);cursor:default}' +
    '#plGarOv .gr-item:first-of-type{border-top:0}' +
    '#plGarOv .gr-item.klik{cursor:pointer}' +
    '#plGarOv .gr-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
    '#plGarOv .gr-k{flex:1 1 130px;padding:10px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
    '#plGarOv .gr-k.hoofd{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plGarOv .gr-k.klein{flex:0 0 auto;padding:6px 10px;font-size:12px}' +
    '#plGarOv .gr-k.gevaar{color:#ef4444;border-color:rgba(239,68,68,.5)}' +
    '#plGarOv .gr-k:disabled{opacity:.45;cursor:not-allowed}' +
    '#plGarOv label.gr-veld{display:block;font-size:11px;color:var(--tx3);margin:8px 0 3px}' +
    '#plGarOv .gr-veld input,#plGarOv .gr-veld select,#plGarOv .gr-veld textarea{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:500 14px var(--f)}' +
    '#plGarOv .gr-2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}' +
    '#plGarOv .gr-melding{font-size:12px;padding:9px 11px;border-radius:9px;margin-bottom:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);color:var(--tx2)}' +
    '#plGarOv .gr-melding.rood{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.45)}' +
    '#plGarOv .gr-melding.blauw{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.45)}' +
    '#plGarOv pre.gr-tekst{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;color:var(--tx2);margin:0}' +
    '#plGarOv ul{margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--tx2)} #plGarOv li{margin:4px 0}' +
    '#plGarageKaart{margin:0 0 12px}' +
    '#plGarageKaart .gk{display:flex;align-items:center;gap:12px;background:#11151f;border:1px solid #232c40;border-radius:14px;padding:13px 14px;cursor:pointer;color:#fff}' +
    '#plGarageKaart .gk-t{font:800 14px var(--f)} #plGarageKaart .gk-d{font-size:12px;opacity:.8;margin-top:2px}' +
    '#plGarageKaart .gk-pijl{margin-left:auto;opacity:.6}';

  function zorgCss() {
    if (document.getElementById('plGarCss')) return;
    var s = document.createElement('style'); s.id = 'plGarCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function open(vid) {
    if (!isKlant()) { melding('Mijn voertuigen is er voor klantaccounts'); return; }
    zorgCss();
    var ov = document.getElementById('plGarOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'plGarOv';
      ov.innerHTML = '<div class="gr-doos"><div class="gr-kop"><div class="gr-t" id="plGarTitel">🚗 Mijn voertuigen</div>' +
        '<button class="gr-x" aria-label="Sluiten" onclick="PLGarage.sluit()">✕</button></div><div id="plGarBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.style.display = 'flex';
    _st.view = vid ? 'voertuig' : 'lijst'; _st.vid = vid || null; _st.tab = 'overzicht';
    teken();
    ververs();
  }
  function sluit() { var ov = document.getElementById('plGarOv'); if (ov) ov.style.display = 'none'; }

  function teken() {
    var body = document.getElementById('plGarBody');
    if (!body) return;
    var st = _st.stand;
    var h = '';
    if (_st.fout && !st) h += '<div class="gr-melding rood">Kon je voertuigen niet ophalen: ' + esc(_st.fout) + '</div>';
    else if (_st.fout) h += '<div class="gr-melding">Offline — je ziet de laatst bewaarde stand. (' + esc(_st.fout) + ')</div>';
    if (!st) { body.innerHTML = h + '<div class="gr-klein">⏳ Ophalen…</div>'; return; }
    if (!st.akkoord) { body.innerHTML = h + tekenAkkoord(st); return; }
    var titel = document.getElementById('plGarTitel');
    if (_st.view === 'voertuig' && voertuig(_st.vid)) { if (titel) titel.textContent = '🚗 ' + (voertuig(_st.vid).naam || 'Voertuig'); body.innerHTML = h + tekenVoertuig(voertuig(_st.vid)); }
    else if (_st.view === 'formulier') { if (titel) titel.textContent = _st.vid ? '✏️ Profiel' : '➕ Nieuw voertuig'; body.innerHTML = h + tekenFormulier(_st.vid ? voertuig(_st.vid) : (_st.voorinvul || {})); }
    else if (_st.view === 'rapport') { if (titel) titel.textContent = '📄 Rapport'; body.innerHTML = h + tekenRapport(); }
    else { if (titel) titel.textContent = '🚗 Mijn voertuigen'; body.innerHTML = h + tekenLijst(); }
  }

  function tekenAkkoord(st) {
    return '<div class="gr-sub">Bewaar je auto’s, rapporten en ritten in je account — op elk toestel en in de browser.</div>' +
      '<div class="gr-blok"><div class="gr-bh">Wat we bewaren</div><ul>' +
      '<li><b>Per voertuig</b> het profiel dat je invult: naam, kenteken, merk, model, motor, brandstof, rijprofiel, verbruik, kilometerstand, APK en onderhoud.</li>' +
      '<li><b>Je kenteken versleuteld.</b> Het chassisnummer (VIN) alleen als een uit dat nummer berekende code, zoals elders in de app. Dat is pseudonimisering: wie je VIN kent, kan die code narekenen.</li>' +
      '<li><b>Rapporten</b> die de app voor dit voertuig maakt (AI-rapporten en foutcode-uitlezingen).</li>' +
      '<li><b>Ritten als samenvatting:</b> datum, duur, afstand, snelheid, verbruik, temperatuur en accuspanning. Geen locatie, geen route. De meting per seconde blijft op je telefoon.</li>' +
      '<li><b>Open punten</b>: foutcodes en wat de app opvalt, tot ze opgelost zijn.</li></ul></div>' +
      '<div class="gr-blok"><div class="gr-bh">Wat we er níét mee doen</div><ul>' +
      '<li>Niet delen met derden, niet verkopen.</li><li>Niet gebruiken voor de referentiedata onder een pseudoniem — dat is een aparte keuze die je al gemaakt hebt.</li></ul></div>' +
      '<div class="gr-blok"><div class="gr-bh">Wissen</div><div class="gr-klein">Een voertuig verwijder je zelf, met alles erbij. "Alles wissen" onderaan Mijn voertuigen haalt al deze gegevens in één keer weg. Verwijder je je account, dan gaan ze binnen 30 dagen mee.</div></div>' +
      (st.eerderAkkoord ? '<div class="gr-melding">De tekst is gewijzigd sinds je eerder akkoord gaf. Je gegevens staan er nog; lees en bevestig opnieuw.</div>' : '') +
      '<div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._akkoord()">Akkoord — bewaar mijn voertuigen</button></div>' +
      '<div class="gr-knoppen"><button class="gr-k" onclick="PLGarage.sluit()">Nu niet</button></div>';
  }

  function tekenKentekenEnNaam(v) {
    return '<div class="gr-naam">' + esc(v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'Voertuig') + '</div>' +
      '<div class="gr-klein">' + (v.kenteken ? '<span class="gr-kent">' + esc(kentekenNl(v.kenteken)) + '</span> ' : '') +
      esc([v.merk, v.model, v.bouwjaar].filter(Boolean).join(' ')) + '</div>';
  }

  function tekenLijst() {
    var st = _st.stand, act = voertuigen(true), arch = voertuigen().filter(function (v) { return v.status === 'archief'; });
    var h = '<div class="gr-sub">Hoogstens ' + (st.maxActief || 3) + ' voertuigen. Het actieve voertuig krijgt de rapporten en ritten van nu.</div>';
    if (_st.onbekend) {
      h += '<div class="gr-melding blauw"><b>Verbonden auto hoort nog bij geen voertuig</b>' +
        (_st.onbekend.profiel.merk ? ' (' + esc([_st.onbekend.profiel.merk, _st.onbekend.profiel.model, _st.onbekend.profiel.bouwjaar].filter(Boolean).join(' ')) + ')' : '') +
        '<div class="gr-knoppen">' + act.filter(function (v) { return !v.vin_pseudo; }).map(function (v) {
          return '<button class="gr-k klein" onclick="PLGarage._koppel(\'' + esc(v.id) + '\')">Is mijn ' + esc(v.naam || v.merk || 'voertuig') + '</button>';
        }).join('') + (act.length < (st.maxActief || 3) ? '<button class="gr-k klein hoofd" onclick="PLGarage._nieuw(true)">➕ Nieuw voertuig</button>' : '') + '</div></div>';
    }
    if (!act.length) h += '<div class="gr-blok"><div class="gr-klein">Nog geen voertuigen. Voeg je auto toe — met het kenteken vult de app de rest in.</div></div>';
    act.forEach(function (v) {
      var s = status(v);
      var rit = v.laatsteRit;
      h += '<div class="gr-blok"><div class="gr-auto" onclick="PLGarage._open(\'' + esc(v.id) + '\')">' +
        '<span class="gr-dot ' + s.kleur + '"></span><div style="flex:1">' + tekenKentekenEnNaam(v) +
        '<div class="gr-klein" style="margin-top:3px">' + esc(s.punten.length ? s.punten[0].tekst : 'Niets bekend dat aandacht vraagt') + '</div>' +
        '<div class="gr-klein">' + (v.aantal ? v.aantal.rapporten + ' rapporten · ' + v.aantal.ritten + ' ritten' : '') + (rit ? ' · laatste rit ' + datumNl(rit.start) : '') + '</div></div>' +
        (v.id === _st.actiefId ? '<span class="gr-klein" style="color:#22c55e;font-weight:800">ACTIEF</span>' : '') + '</div>' +
        (v.id !== _st.actiefId ? '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._actief(\'' + esc(v.id) + '\')">Maak actief</button></div>' : '') + '</div>';
    });
    h += '<div class="gr-knoppen"><button class="gr-k hoofd" ' + (act.length >= (st.maxActief || 3) ? 'disabled' : '') + ' onclick="PLGarage._nieuw()">➕ Voertuig toevoegen</button></div>';
    if (act.length >= (st.maxActief || 3)) h += '<div class="gr-klein" style="margin-top:6px">Je hebt er ' + act.length + '. Archiveer er een om ruimte te maken — de rapporten blijven bewaard.</div>';
    if (arch.length) {
      h += '<div class="gr-blok" style="margin-top:12px"><div class="gr-bh">Archief<span class="gr-r">' + arch.length + '</span></div>';
      arch.forEach(function (v) {
        h += '<div class="gr-item">' + tekenKentekenEnNaam(v) + '<div class="gr-knoppen">' +
          '<button class="gr-k klein" onclick="PLGarage._open(\'' + esc(v.id) + '\')">Bekijken</button>' +
          '<button class="gr-k klein" onclick="PLGarage._herstel(\'' + esc(v.id) + '\')">Terugzetten</button>' +
          '<button class="gr-k klein gevaar" onclick="PLGarage._verwijder(\'' + esc(v.id) + '\')">Verwijderen</button></div></div>';
      });
      h += '</div>';
    }
    if (st.kentekenBewaarbaar === false) h += '<div class="gr-melding">Kentekens kunnen op dit moment niet versleuteld bewaard worden en worden daarom niet opgeslagen.</div>';
    h += '<div class="gr-knoppen" style="margin-top:14px"><button class="gr-k klein gevaar" onclick="PLGarage._allesWissen()">Alles wissen</button></div>';
    return h;
  }

  function cacheVan(vid) { return (_st.cache[vid] = _st.cache[vid] || {}); }
  async function laad(vid, wat) {
    var c = cacheVan(vid);
    if (c[wat] || c['_' + wat]) return;
    c['_' + wat] = true;
    try {
      var d = await api(wat, { voertuig_id: vid, limiet: wat === 'ritten' ? 100 : 100 });
      c[wat] = d[wat] || [];
    } catch (e) { c[wat + 'Fout'] = e.message; console.warn('PLGarage: ' + wat + ' ophalen', e); }
    finally { c['_' + wat] = false; teken(); }
  }

  function tekenVoertuig(v) {
    var tabs = [['overzicht', 'Overzicht'], ['issues', 'Open punten'], ['ritten', 'Ritten'], ['rapporten', 'Rapporten'], ['profiel', 'Profiel']];
    var h = '<div class="gr-knoppen" style="margin:0 0 10px"><button class="gr-k klein" onclick="PLGarage._terug()">← Alle voertuigen</button>' +
      (v.status === 'actief' && v.id !== _st.actiefId ? '<button class="gr-k klein" onclick="PLGarage._actief(\'' + esc(v.id) + '\')">Maak actief</button>' : '') + '</div>';
    h += '<div class="gr-blok">' + tekenKentekenEnNaam(v) + '</div>';
    h += '<div class="gr-tabs">' + tabs.map(function (t) {
      return '<button class="gr-tab' + (_st.tab === t[0] ? ' aan' : '') + '" onclick="PLGarage._tab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>';
    var c = cacheVan(v.id);
    if (_st.tab === 'overzicht') {
      if (!c.ritten) laad(v.id, 'ritten');
      var s = status(v);
      h += '<div class="gr-blok"><div class="gr-bh"><span class="gr-dot ' + s.kleur + '"></span> Status<span class="gr-r">' + (v.laatst_gezien ? 'gemeten ' + datumNl(v.laatst_gezien, true) : '') + '</span></div>' +
        (s.punten.length ? s.punten.map(function (p) { return '<div class="gr-punt ' + p.ernst + '">• ' + esc(p.tekst) + '</div>'; }).join('') : '<div class="gr-punt">Niets bekend dat aandacht vraagt.</div>') + '</div>';
      var g = v.gezondheid || {};
      h += '<div class="gr-blok"><div class="gr-bh">Condities</div><div class="gr-rij">' +
        '<div>Kilometerstand</div><div><b>' + (v.kmstand != null ? v.kmstand.toLocaleString('nl') + ' km' : '—') + '</b></div>' +
        '<div>APK tot</div><div><b>' + datumNl(v.apk_tot) + '</b></div>' +
        '<div>Accu in rust</div><div><b>' + (g.accuRust != null ? nl1(g.accuRust) + ' V' : '—') + '</b></div>' +
        '<div>Laadspanning</div><div><b>' + (g.accuLopend != null ? nl1(g.accuLopend) + ' V' : '—') + '</b></div>' +
        '<div>Hoogste koelwater laatste rit</div><div><b>' + (g.maxKoelwater != null ? Math.round(g.maxKoelwater) + ' °C' : '—') + '</b></div>' +
        '<div>Brandstoftrim lang</div><div><b>' + (g.trimLang != null ? g.trimLang.toLocaleString('nl') + ' %' : '—') + '</b></div>' +
        '<div>Zelftests niet klaar</div><div><b>' + (Array.isArray(g.readinessNietKlaar) ? g.readinessNietKlaar.length : '—') + '</b></div>' +
        '</div><div class="gr-klein" style="margin-top:6px">Bijgewerkt na elke rit en elke foutcode-uitlezing met dit voertuig actief.</div></div>';
      var adv = advies(v, c.ritten || []);
      h += '<div class="gr-blok"><div class="gr-bh">💡 Advies</div>' + (adv.length ? adv.map(function (a) {
        return '<div class="gr-item"><b>' + esc(a.titel) + '</b><div class="gr-klein" style="margin-top:2px">' + esc(a.tekst) + '</div></div>';
      }).join('') : '<div class="gr-klein">' + (c.ritten ? 'Nog geen advies. Rij een paar ritten met dit voertuig actief en vul je profiel aan.' : '⏳') + '</div>') + '</div>';
      h += '<div class="gr-knoppen"><button class="gr-k" onclick="PLGarage.sluit();try{PLFoutcodes.open()}catch(e){console.warn(e)}">🩺 Foutcodes uitlezen</button></div>';
    } else if (_st.tab === 'issues') {
      if (!c.issues) laad(v.id, 'issues');
      var is = c.issues || [];
      var open = is.filter(function (i) { return i.status === 'open'; }), dicht = is.filter(function (i) { return i.status !== 'open'; });
      h += '<div class="gr-blok"><div class="gr-bh">Open<span class="gr-r">' + open.length + '</span></div>' +
        (c.issues ? (open.length ? open.map(function (i) {
          return '<div class="gr-item"><b class="' + (i.ernst === 'hoog' ? 'gr-punt rood' : '') + '">' + esc(i.titel) + '</b><div class="gr-klein">Eerst ' + datumNl(i.eerst_gezien) + ' · laatst ' + datumNl(i.laatst_gezien) + ' · ' + i.aantal + '× gezien</div>' +
            '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._issue(\'' + esc(i.sleutel) + '\',\'opgelost\')">✓ Opgelost</button><button class="gr-k klein" onclick="PLGarage._issue(\'' + esc(i.sleutel) + '\',\'genegeerd\')">Negeren</button></div></div>';
        }).join('') : '<div class="gr-klein">Geen open punten.</div>') : '<div class="gr-klein">⏳</div>') + '</div>';
      if (dicht.length) h += '<div class="gr-blok"><div class="gr-bh">Gesloten<span class="gr-r">' + dicht.length + '</span></div>' + dicht.map(function (i) {
        return '<div class="gr-item">' + esc(i.titel) + '<div class="gr-klein">' + (i.status === 'opgelost' ? 'Opgelost' : 'Genegeerd') + ' ' + datumNl(i.gesloten_op) + '</div>' +
          '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._issue(\'' + esc(i.sleutel) + '\',\'heropend\')">Heropenen</button></div></div>';
      }).join('') + '</div>';
      h += '<div class="gr-klein">Een foutcode die bij een volledige uitlezing niet meer terugkomt, zet de app zelf op opgelost.</div>';
    } else if (_st.tab === 'ritten') {
      if (!c.ritten) laad(v.id, 'ritten');
      var rs = c.ritten || [];
      var verb = gewogenVerbruik(rs);
      var totKm = rs.reduce(function (a, r) { return a + (r.km || 0); }, 0);
      h += '<div class="gr-blok"><div class="gr-rij"><div>Ritten</div><div><b>' + rs.length + '</b></div><div>Samen</div><div><b>' + Math.round(totKm).toLocaleString('nl') + ' km</b></div>' +
        '<div>Gemiddeld verbruik</div><div><b>' + (verb ? verbruikNl(verb.l100) : '—') + '</b></div>' +
        '<div>Opgegeven</div><div><b>' + (v.verbruik_opgegeven ? verbruikNl(v.verbruik_opgegeven) : '—') + '</b></div></div></div>';
      h += '<div class="gr-blok">' + (c.ritten ? (rs.length ? rs.map(function (r) {
        return '<div class="gr-item"><b>' + datumNl(r.start, true) + '</b> · ' + (r.km != null ? r.km.toLocaleString('nl') + ' km' : '') + (r.duur_s ? ' · ' + Math.round(r.duur_s / 60) + ' min' : '') +
          '<div class="gr-klein">' + [r.verbruik_l100 != null ? verbruikNl(r.verbruik_l100) : null, r.max_kmh != null ? 'max ' + r.max_kmh + ' km/u' : null,
            r.max_koelwater != null ? 'koelwater ' + Math.round(r.max_koelwater) + ' °C' : null, r.min_accu != null ? 'accu ≥ ' + nl1(r.min_accu) + ' V' : null,
            (r.codes && r.codes.length) ? 'codes: ' + r.codes.join(', ') : null].filter(Boolean).map(esc).join(' · ') + '</div></div>';
      }).join('') : '<div class="gr-klein">Nog geen ritten. Een rit wordt vanzelf vastgelegd zodra je rijdt met dit voertuig actief en de adapter verbonden.</div>') : '<div class="gr-klein">⏳</div>') + '</div>';
    } else if (_st.tab === 'rapporten') {
      if (!c.rapporten) laad(v.id, 'rapporten');
      var rp = c.rapporten || [];
      h += '<div class="gr-blok">' + (c.rapporten ? (rp.length ? rp.map(function (r) {
        return '<div class="gr-item klik" onclick="PLGarage._rapport(\'' + esc(r.id) + '\')"><b>' + (r.soort === 'ai' ? '🔬 ' : r.soort === 'dtc' ? '🔴 ' : r.soort === 'waak' ? '👁 ' : '📄 ') + esc(r.titel || r.soort) + '</b><div class="gr-klein">' + datumNl(r.aangemaakt, true) + '</div></div>';
      }).join('') : '<div class="gr-klein">Nog geen rapporten. Elk AI-rapport, elke foutcode-uitlezing en elke waakronde met dit voertuig actief komt hier vanzelf terecht.</div>') : '<div class="gr-klein">⏳</div>') + '</div>';
    } else if (_st.tab === 'profiel') {
      var rijProf = function (l, w) { return '<div>' + l + '</div><div><b>' + (w == null || w === '' ? '—' : esc(w)) + '</b></div>'; };
      h += '<div class="gr-blok"><div class="gr-rij">' +
        rijProf('Kenteken', v.kenteken ? kentekenNl(v.kenteken) : (v.kentekenLeesbaar === false ? 'onleesbaar' : null)) +
        rijProf('Merk en model', [v.merk, v.model].filter(Boolean).join(' ')) + rijProf('Bouwjaar', v.bouwjaar) +
        rijProf('Motor', v.motor) + rijProf('Brandstof', v.brandstof) + rijProf('Turbo', v.turbo) + rijProf('Transmissie', v.transmissie) +
        rijProf('Rijprofiel', v.rijprofiel) + rijProf('Verbruik (opgegeven)', v.verbruik_opgegeven ? v.verbruik_opgegeven.toLocaleString('nl') + ' l/100 km' : null) +
        rijProf('Kilometerstand', v.kmstand != null ? v.kmstand.toLocaleString('nl') + ' km' : null) + rijProf('APK tot', v.apk_tot ? datumNl(v.apk_tot) : null) +
        rijProf('Laatste onderhoudsbeurt', v.onderhoud_laatst) + rijProf('Distributieriem/-ketting', v.distributie) +
        rijProf('Volgend onderhoud', [v.onderhoud_km ? v.onderhoud_km.toLocaleString('nl') + ' km' : null, v.onderhoud_datum ? datumNl(v.onderhoud_datum) : null].filter(Boolean).join(' of ')) +
        rijProf('Gekoppeld aan de auto', v.vin_pseudo ? 'ja (via het chassisnummer)' : 'nog niet') +
        '</div>' + (v.notities ? '<div class="gr-klein" style="margin-top:8px">' + esc(v.notities) + '</div>' : '') + '</div>' +
        '<div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._bewerk(\'' + esc(v.id) + '\')">✏️ Profiel aanpassen</button></div>' +
        (v.status === 'actief' ? '<div class="gr-knoppen"><button class="gr-k" onclick="PLGarage._archiveer(\'' + esc(v.id) + '\')">Archiveren (verkocht of weg)</button></div>' : '');
    }
    return h;
  }

  var KEUZES = {
    brandstof: ['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng', 'onbekend'],
    turbo: ['onbekend', 'ja', 'nee'], transmissie: ['onbekend', 'handgeschakeld', 'automaat'],
    rijprofiel: ['gemengd', 'stad', 'snelweg', 'korte ritten', 'aanhanger of caravan']
  };
  function tekenFormulier(v) {
    v = v || {};
    var inv = function (id, label, w, type, extra) {
      return '<label class="gr-veld">' + label + '<input id="grf_' + id + '" type="' + (type || 'text') + '" value="' + esc(w == null ? '' : w) + '" ' + (extra || '') + '></label>';
    };
    var kies = function (id, label, w) {
      return '<label class="gr-veld">' + label + '<select id="grf_' + id + '">' + ['<option value="">—</option>'].concat(KEUZES[id].map(function (k) {
        return '<option' + (k === w ? ' selected' : '') + '>' + k + '</option>';
      })).join('') + '</select></label>';
    };
    return '<div class="gr-sub">Vul in wat je weet. Met het kenteken haalt de app merk, model, bouwjaar, motor, brandstof en APK bij het RDW.</div>' +
      '<div class="gr-blok">' + inv('naam', 'Naam (zoals jij hem noemt)', v.naam, 'text', 'maxlength="40" placeholder="bijv. Blauwe Mazda"') +
      '<div class="gr-2">' + inv('kenteken', 'Kenteken', v.kenteken ? kentekenNl(v.kenteken) : '', 'text', 'maxlength="10" autocapitalize="characters"') +
      '<label class="gr-veld">&nbsp;<button class="gr-k" style="width:100%" onclick="PLGarage._rdw()">🔎 Haal op bij RDW</button></label></div>' +
      '<div id="grfRdw" class="gr-klein"></div>' +
      '<div class="gr-2">' + inv('merk', 'Merk', v.merk) + inv('model', 'Model', v.model) + '</div>' +
      '<div class="gr-2">' + inv('bouwjaar', 'Bouwjaar', v.bouwjaar, 'number', 'min="1950" max="2100"') + inv('motor', 'Motor', v.motor, 'text', 'placeholder="bijv. 2,0 liter, 121 kW"') + '</div>' +
      '<div class="gr-2">' + kies('brandstof', 'Brandstof', v.brandstof) + kies('turbo', 'Turbo', v.turbo) + '</div>' +
      '<div class="gr-2">' + kies('transmissie', 'Transmissie', v.transmissie) + kies('rijprofiel', 'Hoe rijd je meestal?', v.rijprofiel) + '</div>' +
      '<div class="gr-2">' + inv('verbruik_opgegeven', 'Verbruik (l/100 km)', v.verbruik_opgegeven, 'number', 'step="0.1" min="0" max="50"') + inv('kmstand', 'Kilometerstand', v.kmstand, 'number', 'min="0"') + '</div>' +
      '<div class="gr-2">' + inv('apk_tot', 'APK geldig tot', v.apk_tot, 'date') + inv('onderhoud_datum', 'Volgend onderhoud (datum)', v.onderhoud_datum, 'date') + '</div>' +
      inv('onderhoud_km', 'Volgend onderhoud (km-stand)', v.onderhoud_km, 'number', 'min="0"') +
      '<div class="gr-2">' + inv('onderhoud_laatst', 'Laatste onderhoudsbeurt', v.onderhoud_laatst, 'text', 'maxlength="80" placeholder="bv. 03-2026 / 135.000 km"') +
      inv('distributie', 'Distributieriem/-ketting', v.distributie, 'text', 'maxlength="80" placeholder="bv. vervangen bij 120.000 km"') + '</div>' +
      '<label class="gr-veld">Notities<textarea id="grf_notities" rows="3" maxlength="1000">' + esc(v.notities || '') + '</textarea></label>' +
      (v.cilinderinhoud ? '<input type="hidden" id="grf_cilinderinhoud" value="' + esc(v.cilinderinhoud) + '">' : '') +
      (v.vermogen_kw ? '<input type="hidden" id="grf_vermogen_kw" value="' + esc(v.vermogen_kw) + '">' : '') +
      (v.vin_pseudo ? '<input type="hidden" id="grf_vin_pseudo" value="' + esc(v.vin_pseudo) + '">' : '') +
      '</div><div id="grfFout"></div><div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._bewaar()">Bewaren</button><button class="gr-k" onclick="PLGarage._terug()">Annuleren</button></div>';
  }

  function tekenRapport() {
    var r = _st.rapport;
    if (!r) return '<div class="gr-klein">⏳</div>';
    return '<div class="gr-knoppen" style="margin:0 0 10px"><button class="gr-k klein" onclick="PLGarage._terugNaar(\'rapporten\')">← Rapporten</button>' +
      '<button class="gr-k klein" onclick="PLGarage._rapportBewaar()">💾 Opslaan</button><button class="gr-k klein gevaar" onclick="PLGarage._rapportWeg()">Verwijderen</button></div>' +
      '<div class="gr-blok"><div class="gr-bh">' + esc(r.titel || r.soort) + '<span class="gr-r">' + datumNl(r.aangemaakt, true) + '</span></div><pre class="gr-tekst">' + esc(r.tekst) + '</pre></div>';
  }

  // Het kaartje op het startscherm, boven de deuren.
  function tekenKaart() {
    var el = document.getElementById('plGarageKaart');
    if (!el) return;
    if (!isKlant()) { el.innerHTML = ''; return; }
    zorgCss();
    var st = _st.stand, v = actief();
    var t, d, kleur = null;
    if (!st || !st.akkoord) { t = '🚗 Mijn voertuigen'; d = 'Bewaar je auto’s, rapporten en ritten in je account.'; }
    else if (!v) { t = '🚗 Mijn voertuigen'; d = 'Voeg je eerste voertuig toe.'; }
    else { var s = status(v); kleur = s.kleur; t = v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'Mijn voertuig'; d = s.punten.length ? s.punten[0].tekst : 'Niets bekend dat aandacht vraagt'; }
    el.innerHTML = '<div class="gk" onclick="PLGarage.open(' + (v ? '\'' + esc(v.id) + '\'' : '') + ')">' +
      (kleur ? '<span class="gr-dot ' + kleur + '" style="width:12px;height:12px;border-radius:50%;flex:0 0 12px"></span>' : '') +
      '<div><div class="gk-t">' + esc(t) + '</div><div class="gk-d">' + esc(d) + '</div></div><span class="gk-pijl">→</span></div>';
  }

  // ── handelingen vanuit het venster ─────────────────────────────────
  async function doe(werk, klaarTekst) {
    try { await werk(); if (klaarTekst) melding(klaarTekst); }
    catch (e) { melding('⚠️ ' + e.message); console.warn('PLGarage', e); }
    finally { await ververs(); }
  }

  function formWaarden() {
    var velden = ['naam', 'kenteken', 'merk', 'model', 'bouwjaar', 'motor', 'brandstof', 'turbo', 'transmissie', 'rijprofiel', 'verbruik_opgegeven', 'kmstand', 'apk_tot', 'onderhoud_datum', 'onderhoud_km', 'onderhoud_laatst', 'distributie', 'notities', 'cilinderinhoud', 'vermogen_kw', 'vin_pseudo'];
    var uit = {};
    velden.forEach(function (k) { var el = document.getElementById('grf_' + k); if (el) uit[k] = el.value === '' ? null : el.value; });
    return uit;
  }

  async function rdw() {
    var el = document.getElementById('grf_kenteken'), st = document.getElementById('grfRdw');
    var k = String(el && el.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (k.length < 4) { if (st) st.textContent = 'Vul eerst een kenteken in.'; return; }
    if (st) st.textContent = '⏳ RDW…';
    try {
      var q = function (res) { return plFetch('/proxy?url=' + encodeURIComponent('https://opendata.rdw.nl/resource/' + res + '.json?kenteken=' + k)).then(function (r) { if (!r.ok) throw new Error('RDW ' + r.status); return r.json(); }); };
      var rij = (await q('m9d7-ebf2'))[0];
      if (!rij) { if (st) st.textContent = 'Dit kenteken staat niet bij het RDW.'; return; }
      var bs = [];
      try { bs = await q('8ys7-d773'); } catch (e) { console.warn('PLGarage: RDW brandstof', e); }
      var p = rdwNaarProfiel(rij, bs);
      Object.keys(p).forEach(function (key) {
        var f = document.getElementById('grf_' + key);
        if (f) f.value = p[key];
        else if (key === 'cilinderinhoud' || key === 'vermogen_kw') {
          var hid = document.createElement('input'); hid.type = 'hidden'; hid.id = 'grf_' + key; hid.value = p[key];
          el.parentNode.appendChild(hid);
        }
      });
      if (st) st.textContent = '✓ Ingevuld vanuit het RDW: ' + [p.merk, p.model, p.bouwjaar].filter(Boolean).join(' ');
    } catch (e) { if (st) st.textContent = 'RDW niet bereikbaar: ' + e.message; console.warn('PLGarage.rdw', e); }
  }

  async function bewaarFormulier() {
    var w = formWaarden();
    var fout = document.getElementById('grfFout');
    if (_st.vid) w.id = _st.vid;
    try {
      var d = await api('voertuig_opslaan', { voertuig: w });
      if (d.kentekenOpgeslagen === false && w.kenteken) melding('Het kenteken kon niet versleuteld bewaard worden en is niet opgeslagen');
      if (!_st.vid) { zetActief(d.voertuig.id); if (_st.onbekend && _st.voorinvul && _st.voorinvul.vin_pseudo) { _st.onbekend = null; } }
      delete _st.cache[d.voertuig.id];
      _st.voorinvul = null;
      _st.view = 'voertuig'; _st.vid = d.voertuig.id; _st.tab = 'overzicht';
      await ververs();
    } catch (e) {
      if (fout) fout.innerHTML = '<div class="gr-melding rood">' + esc(e.message) + '</div>';
    }
  }

  window.PLGarage = {
    open: open,
    sluit: sluit,
    ververs: ververs,
    rapport: rapport,
    foutcodes: foutcodes,
    waakBevinding: waakBevinding,
    waakKlaar: waakKlaar,
    eerderBlok: eerderBlok,
    eerderAantal: eerderAantal,
    dossier: dossier,
    dossierBewaar: dossierBewaar,
    actief: actief,
    staat: function () { return _st; },
    tekenKaart: tekenKaart,
    _akkoord: function () { doe(function () { return api('akkoord', { versie: _st.stand && _st.stand.akkoordVersie }); }, 'Mijn voertuigen staat aan'); },
    _open: function (id) { _st.view = 'voertuig'; _st.vid = id; _st.tab = 'overzicht'; teken(); },
    _tab: function (t) { _st.tab = t; teken(); },
    _terug: function () { _st.view = _st.view === 'formulier' && _st.vid ? 'voertuig' : 'lijst'; if (_st.view === 'lijst') _st.vid = null; teken(); },
    _terugNaar: function (t) { _st.view = 'voertuig'; _st.tab = t; teken(); },
    _actief: function (id) { zetActief(id); melding('Actief voertuig gewijzigd'); teken(); },
    _nieuw: function (vanVerbinding) {
      _st.view = 'formulier'; _st.vid = null;
      _st.voorinvul = vanVerbinding && _st.onbekend ? Object.assign({ vin_pseudo: _st.onbekend.pseudo }, _st.onbekend.profiel) : {};
      teken();
    },
    _bewerk: function (id) { _st.view = 'formulier'; _st.vid = id; teken(); },
    _bewaar: bewaarFormulier,
    _rdw: rdw,
    _koppel: function (id) {
      var ps = _st.onbekend && _st.onbekend.pseudo;
      if (!ps) return;
      doe(async function () { await api('voertuig_opslaan', { voertuig: { id: id, vin_pseudo: ps } }); _st.onbekend = null; zetActief(id); }, 'Gekoppeld aan de verbonden auto');
    },
    _archiveer: function (id) {
      if (!confirm('Dit voertuig archiveren? De rapporten en ritten blijven bewaard en het telt niet meer mee voor je drie.')) return;
      doe(function () { return api('voertuig_archiveer', { id: id }); }, 'Gearchiveerd').then(function () { _st.view = 'lijst'; _st.vid = null; teken(); });
    },
    _herstel: function (id) { doe(function () { return api('voertuig_herstel', { id: id }); }, 'Teruggezet'); },
    _verwijder: function (id) {
      if (!confirm('Dit voertuig definitief verwijderen, met al zijn rapporten, ritten en open punten? Dit kan niet ongedaan gemaakt worden.')) return;
      doe(function () { return api('voertuig_verwijder', { id: id }); }, 'Verwijderd');
    },
    _allesWissen: function () {
      if (!confirm('Alle voertuigen, rapporten, ritten en open punten uit je account wissen? Je account en tokens blijven bestaan.')) return;
      doe(async function () { await api('alles_wissen'); schrijf(OPSLAG.actief, null); _st.actiefId = null; _st.cache = {}; }, 'Alles gewist');
    },
    _issue: function (sleutel, actie) {
      var vid = _st.vid;
      doe(async function () { await api('issues_bijwerken', { voertuig_id: vid, ops: [{ sleutel: sleutel, actie: actie }] }); delete cacheVan(vid).issues; });
    },
    _rapport: async function (id) {
      _st.view = 'rapport'; _st.rapport = null; teken();
      try { _st.rapport = (await api('rapport', { id: id })).rapport; }
      catch (e) { melding('⚠️ ' + e.message); _st.view = 'voertuig'; }
      teken();
    },
    _rapportBewaar: function () {
      var r = _st.rapport; if (!r) return;
      try { if (typeof plOpslaan === 'function') plOpslaan('rapport-' + String(r.aangemaakt).slice(0, 10), r.tekst, { titel: r.titel || 'Rapport' }); }
      catch (e) { console.warn('PLGarage: opslaan', e); }
    },
    _rapportWeg: function () {
      var r = _st.rapport; if (!r || !confirm('Dit rapport verwijderen?')) return;
      doe(function () { return api('rapport_verwijder', { id: r.id }); }, 'Rapport verwijderd').then(function () { delete cacheVan(_st.vid).rapporten; _st.view = 'voertuig'; _st.tab = 'rapporten'; teken(); });
    },
    // pure kern — voor test-garage.js
    _kern: { status: status, advies: advies, issueOps: issueOps, ritNieuw: ritNieuw, ritTik: ritTik, ritKlaar: ritKlaar,
      rdwNaarProfiel: rdwNaarProfiel, profielUitVerbinding: profielUitVerbinding, gewogenVerbruik: gewogenVerbruik, dagenTot: dagenTot, waakTekst: waakTekst, cfg: CFG }
  };

  // Eén keer per sessie: APK of onderhoud dat eraan komt of verlopen is.
  var _apkGemeld = false;
  function apkMelding() {
    if (_apkGemeld || !_st.stand || !_st.stand.akkoord || _st.bezig || !voorkeurMelding('meldingApk', true)) return;
    _apkGemeld = true;
    voertuigen(true).forEach(function (v) {
      var d = dagenTot(v.apk_tot);
      if (d != null && d <= 30) melding('📅 ' + (v.naam || v.merk || 'Je voertuig') + ': APK ' + (d < 0 ? 'verlopen' : 'over ' + d + ' dag' + (d === 1 ? '' : 'en')));
      else if (v.onderhoud_km && v.kmstand && v.kmstand >= v.onderhoud_km) melding('🔧 ' + (v.naam || v.merk || 'Je voertuig') + ': onderhoud is aan de beurt');
    });
  }

  // ── De lus: rollen bijhouden, rit meten, auto herkennen ────────────
  var _wasKlant = false, _bootKlaar = false;
  function lus() {
    try {
      var k = isKlant();
      var item = document.getElementById('kbGarage');
      if (item) item.style.display = k ? '' : 'none';
      if (k && !_wasKlant) {
        // Een kopie van een andere klant op dit toestel: weg, vóór er iets getekend wordt.
        if (_st.stand && _st.stand.__u !== wie()) { _st.stand = null; _st.actiefId = null; schrijf(OPSLAG.stand, null); schrijf(OPSLAG.actief, null); schrijf(OPSLAG.wachtrij, null); schrijf(OPSLAG.rit, null); }
        ververs(); if (!_bootKlaar) { _bootKlaar = true; ritHerstel(); } }
      if (!k && _wasKlant) { _st.stand = null; schrijf(OPSLAG.stand, null); _st.cache = {}; tekenKaart(); }
      _wasKlant = k;
      if (!k) return;
      ritTikNu();
      if (isVerbonden()) herkenAuto(); else _vinGezien = null;
      eerderHalen();
      apkMelding();
    } catch (e) { console.warn('PLGarage: lus', e); }
  }
  setInterval(lus, CFG.tikMs);
  try { document.addEventListener('DOMContentLoaded', function () { tekenKaart(); lus(); }); } catch (e) { console.warn('PLGarage: DOMContentLoaded', e); }
  try { window.addEventListener('online', function () { wachtrijLegen(); }); } catch (e) { console.warn('PLGarage: online-luisteraar', e); }
})();
