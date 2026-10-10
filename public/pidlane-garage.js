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
    ritPauzeMs: 15 * 60 * 1000, // zo lang geen beweging (stilstand, motor uit of geen verbinding) = rit voorbij
    pauzeMinMs: 60 * 1000,     // korter stil is verkeer, langer is een pauze in de rit
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

  /* En terug: de tekst van waakTekst() in delen, zodat het venster er een
     overzicht van kan maken in plaats van de kale tekst (27-09-2026: "als je
     op waakronde klikt krijg je een lelijk data-overzicht"). Leest alleen de
     vorm die waakTekst() schrijft; past een regel niet, dan komt hij onder
     `overig` en gaat er niets verloren. null = dit is geen waakrapport. */
  function waakDelen(tekst) {
    var regels = String(tekst || '').split('\n');
    if (!/^PidLane — Waakronde/.test(regels[0] || '')) return null;
    var uit = { datum: '', kop: '', bevindingen: [], stil: [], normaal: [], overig: [] };
    var deel = null;
    regels.slice(1).forEach(function (r) {
      var m;
      if (/^Datum: /.test(r)) { uit.datum = r.slice(7); return; }
      if ((m = /^=== (BEVINDINGEN|ZONDER ANTWOORD|NORMAAL)/.exec(r))) { deel = m[1]; return; }
      if (!r.trim()) return;
      if (!deel) { uit.kop = uit.kop ? uit.kop + ' ' + r : r; return; }
      if (r.trim() === 'geen') return;
      if (deel === 'BEVINDINGEN' && (m = /^ (.+?): (.*) — (\d+) van (\d+) metingen, laatst (\S+) ?(.*?)\s*\(min (.+?), max (.+?)\)$/.exec(r))) {
        uit.bevindingen.push({ naam: m[1], reden: m[2], let: +m[3], n: +m[4], waarde: m[5], eenheid: m[6], min: m[7], max: m[8] }); return;
      }
      if (deel === 'ZONDER ANTWOORD') { r.trim().split(/,\s*/).forEach(function (x) { if (x) uit.stil.push(x); }); return; }
      if (deel === 'NORMAAL' && (m = /^ (.+?): (\S+) ?(.*?)\s*\((\d+)×, (.+?)–(.+?)\)$/.exec(r))) {
        uit.normaal.push({ naam: m[1], waarde: m[2], eenheid: m[3], n: +m[4], min: m[5], max: m[6] }); return;
      }
      uit.overig.push(r.trim());
    });
    return uit;
  }

  /* Ritlabels. De klant geeft een rit een naam; `labelSom` telt per label de
     ritten en kilometers op, zodat "woon-werk" en "caravan" los te zien zijn. */
  var LABEL_VOORSTEL = ['Woon-werk', 'Zakelijk', 'Vakantie', 'Caravan', 'Beladen', 'Boodschappen', 'Proefrit'];
  /* Per label: ritten, km, liters, verbruik (gewogen, alleen met genoeg
     km — zie gewogenVerbruik) en kosten. `prijs` = € per liter of null. */
  function labelSom(ritten, prijs) {
    var som = {}, lijst = {};
    (ritten || []).forEach(function (r) {
      var l = r && r.label ? String(r.label) : null;
      if (!l) return;
      var s = som[l] = som[l] || { label: l, ritten: 0, km: 0, liters: 0 };
      (lijst[l] = lijst[l] || []).push(r);
      s.ritten++; if (typeof r.km === 'number') s.km += r.km;
      if (typeof r.liters === 'number') s.liters += r.liters;
    });
    return Object.keys(som).map(function (k) {
      var s = som[k];
      s.km = Math.round(s.km * 10) / 10; s.liters = Math.round(s.liters * 100) / 100;
      var v = gewogenVerbruik(lijst[k]);
      s.verbruik = v ? v.l100 : null;
      s.kosten = (prijs > 0 && s.liters > 0) ? Math.round(s.liters * prijs * 100) / 100 : null;
      return s;
    }).sort(function (a, b) { return b.km - a.km; });
  }

  /* Een labelvoorstel voor een rit zonder label: het label van eerdere ritten
     die er op lijken — zelfde soort dag (werkdag of weekend), vertrek binnen
     anderhalf uur, afstand binnen 25% (of 3 km). Pas bij twee gelijkende
     ritten met hetzelfde label; één toevalstreffer is geen patroon. */
  function labelSuggestie(rit, ritten) {
    if (!rit || !rit.start) return null;
    var d = new Date(rit.start); if (isNaN(d)) return null;
    var uur = d.getHours() + d.getMinutes() / 60, weekend = d.getDay() === 0 || d.getDay() === 6;
    var tel = {};
    (ritten || []).forEach(function (r) {
      if (!r || !r.label || r.id === rit.id || !r.start) return;
      var e = new Date(r.start); if (isNaN(e)) return;
      var u2 = e.getHours() + e.getMinutes() / 60, w2 = e.getDay() === 0 || e.getDay() === 6;
      var du = Math.abs(uur - u2); du = Math.min(du, 24 - du);
      if (w2 !== weekend || du > 1.5) return;
      if (typeof rit.km === 'number' && typeof r.km === 'number' && Math.abs(rit.km - r.km) > Math.max(3, 0.25 * r.km)) return;
      tel[r.label] = (tel[r.label] || 0) + 1;
    });
    var beste = null;
    Object.keys(tel).forEach(function (l) { if (tel[l] >= 2 && (!beste || tel[l] > tel[beste])) beste = l; });
    return beste;
  }

  /* De ritten van één label (of alle) als CSV en als tekst. De CSV volgt een
     Nederlandse spreadsheet: puntkomma tussen de velden, komma als decimaal. */
  function ritExport(ritten, label, prijs) {
    var rs = (ritten || []).filter(function (r) { return !label || r.label === label; });
    var getal = function (x, d) { return typeof x === 'number' && isFinite(x) ? x.toFixed(d).replace('.', ',') : ''; };
    var csv = ['datum;vertrek;km;duur_min;liters;verbruik_l100;kosten_eur;label'];
    var tekst = ['PidLane — Ritten' + (label ? ' met label "' + label + '"' : ''), ''];
    var km = 0, l = 0;
    rs.forEach(function (r) {
      var d = new Date(r.start), kost = (prijs > 0 && typeof r.liters === 'number') ? r.liters * prijs : null;
      var dat = isNaN(d) ? '' : d.toISOString().slice(0, 10), tijd = isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      csv.push([dat, tijd, getal(r.km, 1), r.duur_s ? Math.round(r.duur_s / 60) : '', getal(r.liters, 2), getal(r.verbruik_l100, 1), getal(kost, 2), String(r.label || '').replace(/;/g, ',')].join(';'));
      tekst.push(dat + ' ' + tijd + '  ' + getal(r.km, 1) + ' km' + (r.verbruik_l100 != null ? '  ' + getal(r.verbruik_l100, 1) + ' l/100 km' : '') + (kost != null ? '  € ' + getal(kost, 2) : '') + (r.label ? '  [' + r.label + ']' : ''));
      if (typeof r.km === 'number') km += r.km;
      if (typeof r.liters === 'number') l += r.liters;
    });
    tekst.push('', 'Totaal: ' + rs.length + ' ritten, ' + getal(km, 1) + ' km' + (l ? ', ' + getal(l, 1) + ' liter' : '') + (prijs > 0 && l ? ', € ' + getal(l * prijs, 2) : ''));
    return { csv: csv.join('\n'), tekst: tekst.join('\n'), n: rs.length };
  }

  /* Twee waakrapporten naast elkaar: per sensor de waarde in A en in B, en of
     het oordeel veranderde (normaal ↔ bevinding ↔ geen antwoord). */
  function waakVergelijk(a, b) {
    var rij = {};
    var zet = function (w, kant) {
      (w.bevindingen || []).forEach(function (x) { (rij[x.naam] = rij[x.naam] || { naam: x.naam })[kant] = { staat: 'let', waarde: x.waarde, eenheid: x.eenheid }; });
      (w.normaal || []).forEach(function (x) { (rij[x.naam] = rij[x.naam] || { naam: x.naam })[kant] = { staat: 'ok', waarde: x.waarde, eenheid: x.eenheid }; });
      (w.stil || []).forEach(function (n) { (rij[n] = rij[n] || { naam: n })[kant] = { staat: 'stil' }; });
    };
    zet(a || {}, 'a'); zet(b || {}, 'b');
    return Object.keys(rij).map(function (k) {
      var r = rij[k];
      r.veranderd = !r.a || !r.b || r.a.staat !== r.b.staat;
      return r;
    }).sort(function (x, y) { return (y.veranderd - x.veranderd) || (x.naam < y.naam ? -1 : 1); });
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
      if (kmh >= 2) {
        // Weer rijden na een pauze (tanken, motor uit, even weg): dezelfde
        // rit, met de pauze erin geteld. Of het een pauze wás, weet je pas nu.
        if (t - r.tBeweeg > CFG.pauzeMinMs && r.sBeweeg > 0) { r.pauzes = (r.pauzes || 0) + 1; r.pauzeS = (r.pauzeS || 0) + (t - r.tBeweeg) / 1000; }
        r.sBeweeg += dt; r.tBeweeg = t;
      }
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
    // De stand bij de laatste beweging. Een rit eindigt waar de auto stilviel,
    // niet een kwartier later toen de app dat pas zeker wist: ritKlaar() knipt
    // de staart eraf.
    if (kmh != null && kmh >= 2) r.bij = { t: t, s: r.s, sStat: r.sStat, liters: r.liters, sLiters: r.sLiters };
    return r;
  }

  /* Waar staat een lopende rit? Eén vraag, drie antwoorden, en de enige plek
     die hem beantwoordt:
       'rijdt'  er was beweging in de laatste pauzeMinMs, en er is verbinding;
       'pauze'  stil of geen verbinding, maar korter dan ritPauzeMs: rijdt de
                auto daarna weer, dan is het dezelfde rit;
       'af'     ritPauzeMs geen beweging: voorbij.
     Motor uit is dus géén einde. Stilvallen en eindigen zijn op het moment
     zelf niet te onderscheiden; pas het wegrijden (of het uitblijven ervan)
     zegt welke van de twee het was. */
  function ritStand(r, nu, verbonden) {
    if (!r) return null;
    var stil = nu - (r.tBeweeg || r.t0 || nu);
    if (stil > CFG.ritPauzeMs) return 'af';
    if (!verbonden || stil > CFG.pauzeMinMs) return 'pauze';
    return 'rijdt';
  }

  function nl1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }

  function rond(x, d) { var f = Math.pow(10, d || 1); return Math.round(x * f) / f; }

  /* Klaar → de samenvatting die naar de server gaat, of null als het geen
     rit was. Verbruik alleen als het over het grootste deel van de rit
     gemeten is — anders is het een getal over een stukje. */
  function ritKlaar(r) {
    if (!r || r.km < CFG.ritMinKm) return null;
    // Tot de laatste beweging; zie r.bij in ritTik(). Een rit van vóór die
    // regel heeft hem niet, en loopt dan tot de laatste tik zoals voorheen.
    var b = r.bij || { t: r.tLaatst, s: r.s, sStat: r.sStat, liters: r.liters, sLiters: r.sLiters };
    var extra = {};
    if (r.trimN) extra.trimLang = rond(r.trimSom / r.trimN, 1);
    if (r.pauzes) { extra.pauzes = r.pauzes; extra.pauze_s = Math.round(r.pauzeS || 0); }
    var uit = {
      start: r.start, eind: new Date(b.t).toISOString(), duur_s: Math.round(b.s), km: rond(r.km, 1),
      gem_kmh: r.sBeweeg > 0 ? rond(r.km / (r.sBeweeg / 3600), 1) : null, max_kmh: rond(r.maxKmh, 0),
      max_koelwater: r.maxKoel, min_accu: r.minAccu != null ? rond(r.minAccu, 2) : null,
      stationair_pct: b.s > 0 ? rond(b.sStat / b.s * 100, 0) : null,
      liters: null, verbruik_l100: null, codes: r.codes.slice(0, 20),
      extra: Object.keys(extra).length ? extra : null
    };
    if (b.sLiters >= b.s * 0.7 && r.km >= 1) { uit.liters = rond(b.liters, 2); uit.verbruik_l100 = rond(b.liters / r.km * 100, 1); }
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

  /* Wie Mijn voertuigen heeft: een klant, en sinds 10-10-2026 ook een
     beheerder, voor zijn eigen auto's (de server geeft hem een eigen ruimte,
     platformAuth in worker.js). Een monteur niet. */
  function magPlatform() {
    try { var u = window.currentUser, r = u && String(u.role || '').toLowerCase(); return r === 'klant' || r === 'admin'; }
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
    if (_legen || !magPlatform()) return;
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
    if (!magPlatform()) return null;
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
      if (!rec || !magBewaren()) return;
      if (rec.type !== 'ai' && rec.type !== 'dtc') return;
      var v = actief();
      if (!rec.text) return;
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
      if (!u || !magBewaren()) return;
      var v = actief();
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
  function eerderBlok() { var v = actief(); return (v && !isDemo() && _eerder.vid === v.id) ? _eerder.blok : ''; }
  function eerderAantal() { var v = actief(); return (v && !isDemo() && _eerder.vid === v.id) ? _eerder.n : 0; }

  /* Een demo is een verzonnen auto. Wat daar gemeten, uitgelezen of
     geanalyseerd wordt, hoort nooit bij het actieve (echte) voertuig: geen
     rapport, geen open punt, geen gezondheid, geen dossier, en ook geen
     eerdere rapporten van de echte auto als context voor een demo-analyse. */
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function magBewaren() { return !isDemo() && magPlatform() && !!(_st.stand && _st.stand.akkoord) && !!actief(); }

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
  var _vinGezien = null, _selPogingen = 0;
  /* Klaar met verbinden? Pas dan staan de PID-lijst en de standaardset, en
     pas dan past de vaste selectie. Tot 28-09-2026 herkende deze functie de
     auto al op de VIN die de app bij het opstarten uit de vorige sessie
     terugzette — vóór de PID-lijst er was. Er paste niets, en omdat de VIN
     als "gezien" gold, werd het nooit opnieuw geprobeerd. */
  function verbindingKlaar() {
    try {
      var k = window._plVerbindingKlaar;
      if (typeof k === 'number' && k > 0) return true;
      // Een verbindingsweg die de vlag niet zet (remote): na een minuut met
      // een PID-lijst is het verbinden hoe dan ook voorbij.
      return typeof supportedPIDs !== 'undefined' && supportedPIDs.size > 0 && _st.verbondenSinds && Date.now() - _st.verbondenSinds > 60000;
    } catch (e) { console.warn('PLGarage: verbindingsstand onleesbaar', e); return false; }
  }
  /* De sensoren van dit voertuig aanzetten. Eigen en berekende PIDs komen
     ERBIJ (bovenop de standaardset of wat er stond); staan er ook gewone PIDs
     in de vaste selectie (Mijn voorkeuren → Vastleggen), dan vervangt die de
     rest, met de eigen en berekende erbij. Geeft het aantal. */
  function pasSelectieToe(v) {
    try { if (window.PLEigen) PLEigen.zet(v.eigen_pids, v.naam); } catch (e) { console.warn('PLGarage: eigen PIDs niet gezet', e); }
    var sel = Array.isArray(v.pid_selectie) ? v.pid_selectie : [];
    if (!sel.length || !window.PLVoorkeur) return 0;
    var extra = function (p) {
      try { return (window.PLEigen && PLEigen.is(p)) || (typeof plIsBerekend === 'function' && plIsBerekend(p)) || (typeof plIsTelemetrie === 'function' && plIsTelemetrie(p)); }
      catch (e) { console.warn('PLGarage: soort sensor onbekend', e); return false; }
    };
    var basis = sel.filter(function (p) { return !extra(p); });
    return PLVoorkeur.selectieToepassen(sel, v.naam || v.merk, { erbij: !basis.length }) || 0;
  }
  /* Blok 5 (28-09-2026): staan de vaste sensoren van het gekoppelde voertuig
     aan na het verbinden? Alleen wat in de keuzelijst staat telt (een code die
     de auto niet heeft, kan niet aan). Puur: test-garage.js toetst hem.
     `opgeruimd` (09-10-2026): wat de PID-poort onderweg uitzette omdat de
     auto niet antwoordde. Die staat terecht uit; op 09-10 gaf 221E1C (ATF)
     daarvoor een FOUT terwijl blok 14 in dezelfde run de opruiming zag. */
  function selectieOordeel(v, actief, lijst, opgeruimd) {
    if (!v) return { staat: 'LET OP', detail: 'geen voertuig uit Mijn voertuigen gekoppeld (niet herkend op het chassisnummer, of geen klant)' };
    var sel = Array.isArray(v.pid_selectie) ? v.pid_selectie : [];
    if (!sel.length) return { staat: 'LET OP', detail: 'bij ' + (v.naam || 'dit voertuig') + ' zijn geen vaste sensoren vastgelegd' };
    var weg = Array.isArray(opgeruimd) ? opgeruimd : [];
    var kan = sel.filter(function (p) { return lijst.indexOf(p) >= 0; });
    var uit = kan.filter(function (p) { return actief.indexOf(p) < 0; });
    var mist = uit.filter(function (p) { return weg.indexOf(p) < 0; });
    var stil = uit.filter(function (p) { return weg.indexOf(p) >= 0; });
    var d = kan.length + ' van de ' + sel.length + ' vaste sensoren van ' + (v.naam || 'dit voertuig') + ' kan deze verbinding leveren';
    if (mist.length) return { staat: 'FOUT', detail: d + ', maar niet aan: ' + mist.join(', ') };
    if (stil.length) return { staat: 'LET OP', detail: d + '; uit omdat de auto niet antwoordde (opgeruimd): ' + stil.join(', ') };
    if (!kan.length) return { staat: 'LET OP', detail: d + ' — de keuzelijst kent er geen van (eigen PIDs gezet?)' };
    return { staat: 'ok', detail: d + ', en ze staan alle ' + kan.length + ' aan' };
  }
  async function herkenAuto() {
    var vi = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
    if (!vi.vin || vi.vin === _vinGezien || !(_st.stand && _st.stand.akkoord)) return;
    if (!verbindingKlaar()) return;
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
      var n = 0;
      try { n = pasSelectieToe(hit); } catch (e) { console.warn('PLGarage: vaste sensorselectie niet toegepast', e); }
      // Paste er niets terwijl er wel iets vastligt: nog eens proberen (de
      // keuzelijst kan nog in opbouw zijn), hoogstens vijf keer.
      if (!n && Array.isArray(hit.pid_selectie) && hit.pid_selectie.length && ++_selPogingen < 5) _vinGezien = null;
      else _selPogingen = 0;
      return;
    }
    _st.onbekend = { pseudo: ps, profiel: profielUitVerbinding(vi) };
    melding('🚗 Deze auto staat nog niet in Mijn voertuigen — ☰ → Mijn voertuigen');
    teken();
  }

  /* De versnellingsindicator hoort bij het voertuig (27-09-2026): wat hij
     leert, bewaart hij bij dít voertuig op de server, en het profiel zegt
     hoeveel versnellingen er zijn en of het een automaat is. Gekoppeld wordt
     het voertuig dat aan de adapter hangt: herkend op het chassisnummer, of —
     zonder chassisnummer in beeld — het actieve voertuig. Een auto die op het
     chassisnummer níét herkend is, krijgt niets: dan leert PLGear onder zijn
     eigen sleutel, zoals voor iedereen zonder Mijn voertuigen. */
  function versnellingsVoertuig() {
    if (!magBewaren() || _st.onbekend) return null;
    return voertuig(_st.gekoppeld) || actief();
  }
  var _gearSleutel = '';
  function gearKoppel() {
    try {
      if (!window.PLGear || typeof PLGear.koppel !== 'function') return;
      var v = versnellingsVoertuig();
      var sleutel = v ? [v.id, v.versnellingen || '', v.transmissie || '', v.naam || '', v.tankinhoud || '', v.brandstofprijs || '', v.verbruik_opgegeven || '', v.vermogen_kw || '', v.brandstof || '', JSON.stringify(v.eigen_pids || [])].join('|') : '';
      if (sleutel === _gearSleutel) return;
      _gearSleutel = sleutel;
      // De eigen PIDs van dit voertuig (dealercodes) horen bij deze auto en
      // bij geen andere: bij ontkoppelen gaan ze weer weg.
      try { if (window.PLEigen) PLEigen.zet(v ? v.eigen_pids : null, v && v.naam); } catch (e) { console.warn('PLGarage: eigen PIDs niet gezet', e); }
      // De berekende PIDs krijgen uit hetzelfde voertuig de literprijs, de
      // tankinhoud, het opgegeven verbruik en het vermogen (voor blok 5).
      try {
        if (window.PLBerekend) PLBerekend.voertuig(v ? { prijs: v.brandstofprijs, tank: v.tankinhoud, verbruik: v.verbruik_opgegeven,
          vermogen: v.vermogen_kw, brandstof: v.brandstof, naam: v.naam || [v.merk, v.model].filter(Boolean).join(' ') } : null);
      } catch (e) { console.warn('PLGarage: berekende PIDs niet aan het voertuig gekoppeld', e); }
      if (!v) { PLGear.koppel(null); return; }
      var vid = v.id;
      PLGear.koppel({ id: vid, naam: v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'je voertuig',
        versnellingen: v.versnellingen, transmissie: v.transmissie, model: v.gear_model || null,
        bewaar: function (model) { return api('versnelling_opslaan', { voertuig_id: vid, model: model }).then(function () { var x = voertuig(vid); if (x) x.gear_model = model; }); } });
    } catch (e) { console.warn('PLGarage: versnellingsindicator niet gekoppeld', e); }
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
    if (!magPlatform() || !(_st.stand && _st.stand.akkoord) || !v) return;
    var verbonden = isVerbonden();
    var r = _st.rit;
    // Een geparkeerde rit hoort bij het voertuig waarmee hij begon. Een ander
    // voertuig actief = die rit is voorbij, hoe kort de pauze ook was.
    if (r && r.vid !== v.id) { ritAf('ander voertuig'); r = null; }
    if (r && ritStand(r, nu, verbonden) === 'af') { ritAf('stil'); r = null; }
    if (verbonden) {
      var kmh = pv('010D');
      if (!r && typeof kmh === 'number' && kmh >= CFG.ritStartKmh) {
        r = _st.rit = ritNieuw(nu); r.vid = v.id;
        // Een nieuwe rit: het rit-histogram van de versnellingsindicator leeg.
        try { if (window.PLGear) PLGear.ritHist(true); } catch (e) { console.warn('PLGarage: rit-histogram niet geleegd', e); }
      }
      if (r) {
        ritTik(r, { kmh: kmh, rpm: pv('010C'), koelwater: pv('0105'), accu: pv('0142'), lph: pv('015E'), maf: pv('0110'), trim: pv('0107') }, nu, v.brandstof);
        try { (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes) ? dtcCodes : []).forEach(function (c) { if (r.codes.indexOf(c) < 0) r.codes.push(c); }); }
        catch (e) { console.warn('PLGarage: codes van de rit', e); }
        r._weg = false;
        if (!r._bewaard || nu - r._bewaard > CFG.ritBewaarMs) { r._bewaard = nu; schrijf(OPSLAG.rit, r); }
      }
      // Rust- en laadspanning voor de status, ook zonder rit.
      var rpm = pv('010C'), accu = pv('0142');
      if (typeof accu === 'number') {
        var g = (v.gezondheid = v.gezondheid || {});
        if (typeof rpm === 'number' && rpm < 100) g.accuRust = accu; else if (typeof rpm === 'number' && rpm > 600) g.accuLopend = accu;
      }
    } else if (r && !r._weg) {
      // Verbinding weg is géén einde (tot 29-09-2026 wel, en dan werd één rit
      // met een tankstop er twee). De rit blijft staan, veilig op het toestel;
      // ritStand() beslist hierboven wanneer het wachten voorbij is.
      r._weg = true; schrijf(OPSLAG.rit, r);
    }
  }

  /* Rondt de lopende rit af. `label` (optioneel) is de naam die de klant hem
     bij "Rit beëindigen" gaf. Geeft de samenvatting terug, of null als er
     geen rit was of hij te kort was om te bewaren. */
  async function ritAf(reden, label) {
    var r = _st.rit; _st.rit = null; schrijf(OPSLAG.rit, null);
    if (!r) return null;
    var sam = ritKlaar(r);
    // Wat er deze sessie met ritten gebeurde, voor blok 5 (#341): ook de ritten
    // die te kort waren om te bewaren.
    (_st.ritVerslag = _st.ritVerslag || []).push({ einde: reden, km: sam ? sam.km : rond(r.km, 1), pauzes: r.pauzes || 0, bewaard: !!sam });
    if (!sam) return null;
    sam.extra = Object.assign({}, sam.extra || {}, { einde: reden });
    if (label) sam.label = String(label).slice(0, 40);
    // Wat de versnellingsindicator deze rit zag, zodat het model later uit de
    // ritten opnieuw op te bouwen is. Past het niet in de ruimte voor `extra`
    // (4 kB op de server), dan niet: de rit zelf gaat altijd voor.
    try {
      var gh = window.PLGear ? PLGear.ritHist(true) : null;
      if (gh && JSON.stringify(Object.assign({}, sam.extra, { gear: gh })).length <= 3800) sam.extra.gear = gh;
    } catch (e) { console.warn('PLGarage: rit-histogram niet meegegeven', e); }
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
    return sam;
  }

  /* Een rit die bij het afsluiten van de app nog liep. Tot 29-09-2026 werd
     die bij de start altijd afgerond, ook na twee minuten: app dicht bij de
     pomp, weer open, en de rit stond in tweeën. Nu beslist ritStand(): nog
     binnen de pauze = hij loopt door, anders af met de laatste beweging als
     eindtijd. */
  function ritHerstel() {
    var r = lees(OPSLAG.rit, null);
    if (!(r && r.vid && r.tLaatst)) return;
    _st.rit = r;
    if (ritStand(r, Date.now(), false) === 'af') ritAf('app gesloten tijdens de rit');
    else r._weg = true;
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
    // max-width + normale regelafbreking: met flex:0 0 auto nam een lange
    // knoptekst ("Dieper zoeken (9 werkende codes als aanwijzing)") zijn eigen
    // breedte en liep hij de kaart uit (30-09-2026). Nu breekt hij af.
    '#plGarOv .gr-k.klein{flex:0 1 auto;max-width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere;text-align:left;padding:6px 10px;font-size:12px}' +
    '#plGarOv .gr-k.gevaar{color:#ef4444;border-color:rgba(239,68,68,.5)}' +
    '#plGarOv .gr-k:disabled{opacity:.45;cursor:not-allowed}' +
    '#plGarOv label.gr-veld{display:block;font-size:11px;color:var(--tx3);margin:8px 0 3px}' +
    '#plGarOv .gr-veld input,#plGarOv .gr-veld select,#plGarOv .gr-veld textarea{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:500 14px var(--f)}' +
    '#plGarOv .gr-2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}' +
    '#plGarOv .gr-melding{font-size:12px;padding:9px 11px;border-radius:9px;margin-bottom:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);color:var(--tx2)}' +
    '#plGarOv .gr-melding.rood{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.45)}' +
    '#plGarOv .gr-meekijkcode{font:800 28px ui-monospace,monospace;letter-spacing:.18em;color:var(--tx);text-align:center;padding:8px 0 4px;user-select:all}' +
    '#plGarOv .gr-melding.blauw{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.45)}' +
    '#plGarOv pre.gr-tekst{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;color:var(--tx2);margin:0}' +
    '#plGarOv ul{margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--tx2)} #plGarOv li{margin:4px 0}' +
    '#plGarOv .gr-rapport{display:flex;align-items:center;gap:8px}' +
    '#plGarOv .gr-rapport .klik{cursor:pointer}' +
    '#plGarOv .gr-tegels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}' +
    '#plGarOv .gr-tegel{background:var(--sur2);border:1px solid var(--bd);border-radius:10px;padding:9px;text-align:center}' +
    '#plGarOv .gr-tegel b{display:block;font:800 20px var(--f);color:var(--tx)} #plGarOv .gr-tegel span{font-size:11px;color:var(--tx3)}' +
    '#plGarOv .gr-tegel.let b{color:#f59e0b} #plGarOv .gr-tegel.ok b{color:#22c55e}' +
    '#plGarOv .gr-sec{font:800 11px var(--f);letter-spacing:.04em;text-transform:uppercase;color:var(--tx3);margin:12px 0 6px}' +
    '#plGarOv .gr-vind{border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);border-radius:9px;padding:8px 10px;margin-bottom:6px;font-size:13px;color:var(--tx)}' +
    '#plGarOv .gr-vind .gr-waarde{float:right}' +
    '#plGarOv .gr-wrij{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--bd);font-size:13px;color:var(--tx)}' +
    '#plGarOv .gr-wrij .nm{flex:1;min-width:0} #plGarOv .gr-waarde{font:800 14px var(--f);font-variant-numeric:tabular-nums}' +
    '#plGarOv .gr-wbereik{flex:0 0 auto;text-align:right;min-width:92px}' +
    '#plGarOv .gr-stip{width:8px;height:8px;border-radius:50%;flex:0 0 8px} #plGarOv .gr-stip.ok{background:#22c55e}' +
    '#plGarOv .gr-labels{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
    '#plGarOv .gr-lab{padding:6px 10px;border-radius:999px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font:700 12px var(--f);cursor:pointer}' +
    '#plGarOv .gr-lab.aan{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plGarOv .gr-lab small{font-weight:600;opacity:.8}' +
    '#plGarOv .gr-lab.klein{padding:2px 8px;font-size:11px;cursor:default}' +
    '#plGarOv .gr-labin{margin-top:6px}' +
    '#plGarOv .gr-sens{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--bd);font-size:13px;color:var(--tx);cursor:pointer}' +
    '#plGarOv .gr-sens input{width:20px;height:20px;flex:0 0 20px;margin-top:1px;accent-color:var(--bl,#3b82f6)}' +
    '#plGarOv .gr-sens small{color:var(--tx3);font-size:11px}' +
    '#plGarOv .gr-bib small{color:var(--tx3);font-size:11px}#plGarOv .gr-bib a{color:var(--bl,#3b82f6)}' +
    '#plGarOv .gr-tempo{display:flex;align-items:center;gap:8px;margin:6px 0 0;font-size:12px}#plGarOv .gr-tempo select{width:auto;padding:5px 8px;font-size:13px}' +
    '#plGarOv .gr-kies{width:20px;height:20px;flex:0 0 20px;accent-color:var(--bl,#3b82f6)}' +
    '#plGarOv .gr-vgl{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;padding:6px 0;border-top:1px solid var(--bd);font-size:12px;color:var(--tx2)}' +
    '#plGarOv .gr-vgl-kop{border-top:0;font-weight:800;color:var(--tx3)} #plGarOv .gr-vgl.anders{color:var(--tx)}' +
    '#plGarOv .gr-vgl .w{font-weight:700} #plGarOv .gr-vgl .w.let{color:#f59e0b} #plGarOv .gr-vgl .w.stil{color:var(--tx3);font-weight:500}' +
    '#plGarOv .gr-vgl2{display:grid;grid-template-columns:1fr;gap:0}' +
    '@media (min-width:900px){#plGarOv .gr-doos{max-width:980px}#plGarOv .gr-vgl2{grid-template-columns:1fr 1fr;gap:10px}}' +
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
    if (!magPlatform()) { melding('Mijn voertuigen is er voor klant- en beheeraccounts'); return; }
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
    _st.meekijk = undefined;   // elke keer vers: "bekeken" kan intussen veranderd zijn
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
    else if (_st.view === 'vergelijk') { if (titel) titel.textContent = '⇄ Vergelijken'; body.innerHTML = h + tekenVergelijk(); }
    else { if (titel) titel.textContent = '🚗 Mijn voertuigen'; body.innerHTML = h + tekenLijst(); }
  }

  function tekenAkkoord(st) {
    return '<div class="gr-sub">Bewaar je auto’s, rapporten en ritten in je account — op elk toestel en in de browser.</div>' +
      '<div class="gr-blok"><div class="gr-bh">Wat we bewaren</div><ul>' +
      '<li><b>Per voertuig</b> het profiel dat je invult: naam, kenteken, merk, model, motor, brandstof, rijprofiel, verbruik, tankinhoud, literprijs, handbak of automaat, kilometerstand, APK en onderhoud.</li>' +
      '<li><b>Je kenteken versleuteld.</b> Het chassisnummer (VIN) alleen als een uit dat nummer berekende code, zoals elders in de app. Dat is pseudonimisering: wie je VIN kent, kan die code narekenen.</li>' +
      '<li><b>Rapporten</b> die de app voor dit voertuig maakt (AI-rapporten en foutcode-uitlezingen).</li>' +
      '<li><b>Ritten als samenvatting:</b> datum, duur, afstand, snelheid, verbruik, temperatuur en accuspanning, en het label dat je er zelf aan geeft. Geen locatie, geen route. De meting per seconde blijft op je telefoon.</li>' +
      '<li><b>Tankbeurten die je zelf invult:</b> datum, liters, literprijs of bedrag, de afgelezen kilometerstand, of de tank vol was, het bereik op je dashboard en je notitie. Geen locatie, geen tankstation tenzij je het zelf in de notitie zet.</li>' +
      '<li><b>Wat de versnellingsindicator over je auto leert:</b> de verhouding tussen snelheid en toerental per versnelling, en je correcties. Geen locatie, geen tijdstippen van ritten.</li>' +
      '<li><b>De techniek volgt de auto.</b> Heeft een ander account dezelfde auto (hetzelfde chassisnummer), dan delen jullie de technische gegevens: merk, model, bouwjaar, motor, brandstof, vermogen, handbak of automaat, versnellingen, tankinhoud, de eigen sensoren en wat de versnellingsindicator leerde. Ritten, rapporten, kilometerstand, onderhoud, notities, kenteken en APK blijven van jou. Het andere account ziet niet wie jij bent, en jij niet wie het is.</li>' +
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
    h += tekenMeekijk();
    h += '<div class="gr-knoppen" style="margin-top:14px"><button class="gr-k klein gevaar" onclick="PLGarage._allesWissen()">Alles wissen</button></div>';
    return h;
  }

  /* Meekijken door PidLane (10-10-2026). De klant maakt zelf een code; zolang
     die geldt (7 dagen, intrekbaar) kan beheer zijn voertuigen inzien en eigen
     sensoren toevoegen — niets wijzigen of verwijderen. Zonder code ziet
     beheer niets. Wat er met de code gebeurde (bekeken, sensoren erbij) staat
     hier, zodat de klant het kan nagaan. */
  function tekenMeekijk() {
    var m = _st.meekijk;
    if (m === undefined) { laadMeekijk(); return ''; }
    var h = '<div class="gr-blok" id="grMeekijk" style="margin-top:12px"><div class="gr-bh">🔭 Meekijken door PidLane</div>';
    if (!m) return h + '<div class="gr-klein">Hulp nodig? Met een meekijkcode kan PidLane zeven dagen je voertuigen, open punten en eigen sensoren inzien, en sensoren (PIDs) voor je auto toevoegen. Wijzigen of verwijderen kan PidLane niet, en je trekt de code in wanneer je wilt.</div>' +
      '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._meekijkAan()">Laat PidLane meekijken</button></div></div>';
    return h + '<div class="gr-meekijkcode" aria-label="Meekijkcode">' + esc(m.code) + '</div>' +
      '<div class="gr-klein">Geef deze code aan PidLane. Geldig tot ' + datumNl(m.verloopt, true) + '. ' +
      (m.aantal ? 'Bekeken: ' + m.aantal + '×, laatst ' + datumNl(m.bekeken_op, true) + '.' : 'Nog niet bekeken.') +
      (m.erbij ? ' Sensoren toegevoegd: ' + m.erbij + '.' : '') + '</div>' +
      '<div class="gr-knoppen"><button class="gr-k klein gevaar" onclick="PLGarage._meekijkUit()">Intrekken</button></div></div>';
  }
  var _meekijkLaadt = false;
  async function laadMeekijk() {
    if (_meekijkLaadt) return;
    _meekijkLaadt = true;
    try { _st.meekijk = (await api('meekijk')).meekijk || null; }
    catch (e) { console.warn('PLGarage: meekijkcode niet op te halen', e); _st.meekijk = null; }
    finally { _meekijkLaadt = false; }
    teken();
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
    var tabs = [['overzicht', 'Overzicht'], ['issues', 'Open punten'], ['ritten', 'Ritten'], ['tanken', 'Tankbeurten'], ['rapporten', 'Rapporten'], ['sensoren', 'Sensoren'], ['profiel', 'Profiel']];
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
      h += tekenVersnellingen(v);
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
      var pr = literprijs(v);
      var som = labelSom(rs, pr.prijs);
      if (som.length) h += '<div class="gr-blok"><div class="gr-bh">🏷 Per label</div><div class="gr-labels">' +
        '<button class="gr-lab' + (!_st.labelFilter ? ' aan' : '') + '" onclick="PLGarage._labelFilter(\'\')">Alle</button>' +
        som.map(function (x) {
          return '<button class="gr-lab' + (_st.labelFilter === x.label ? ' aan' : '') + '" onclick="PLGarage._labelFilter(' + esc(JSON.stringify(x.label)) + ')">' +
            esc(x.label) + ' <small>' + x.ritten + '× · ' + Math.round(x.km).toLocaleString('nl') + ' km</small></button>';
        }).join('') + '</div>' +
        (som.length >= 1 ? '<div class="gr-rij" style="margin-top:8px">' + som.map(function (x) {
          return '<div>' + esc(x.label) + '</div><div><b>' + (x.verbruik != null ? verbruikNl(x.verbruik) : '—') + (x.kosten != null ? ' · € ' + x.kosten.toLocaleString('nl', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') + '</b></div>';
        }).join('') + '</div><div class="gr-klein" style="margin-top:4px">Verbruik alleen als het over minstens 20 km gemeten is.' + (pr.standaard ? ' Kosten met een standaardprijs van € ' + String(pr.prijs).replace('.', ',') + ' per liter — vul je eigen prijs in bij Profiel.' : '') + '</div>' : '') +
        '</div>';
      if (rs.length) h += '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._ritExport(\'csv\')">⤓ CSV' + (_st.labelFilter ? ' (' + esc(_st.labelFilter) + ')' : '') + '</button>' +
        '<button class="gr-k klein" onclick="PLGarage._ritExport(\'pdf\')">📕 PDF' + (_st.labelFilter ? ' (' + esc(_st.labelFilter) + ')' : '') + '</button></div>';
      var zicht = _st.labelFilter ? rs.filter(function (r) { return r.label === _st.labelFilter; }) : rs;
      h += '<div class="gr-blok">' + (c.ritten ? (zicht.length ? zicht.map(function (r) {
        return '<div class="gr-item"><b>' + datumNl(r.start, true) + '</b> · ' + (r.km != null ? r.km.toLocaleString('nl') + ' km' : '') + (r.duur_s ? ' · ' + Math.round(r.duur_s / 60) + ' min' : '') +
          (r.label ? ' <span class="gr-lab klein">🏷 ' + esc(r.label) + '</span>' : '') +
          '<div class="gr-klein">' + [r.verbruik_l100 != null ? verbruikNl(r.verbruik_l100) : null,
            (typeof r.liters === 'number' && pr.prijs) ? '€ ' + (r.liters * pr.prijs).toLocaleString('nl', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null,
            r.max_kmh != null ? 'max ' + r.max_kmh + ' km/u' : null,
            r.max_koelwater != null ? 'koelwater ' + Math.round(r.max_koelwater) + ' °C' : null, r.min_accu != null ? 'accu ≥ ' + nl1(r.min_accu) + ' V' : null,
            (r.codes && r.codes.length) ? 'codes: ' + r.codes.join(', ') : null].filter(Boolean).map(esc).join(' · ') + '</div>' +
          (_st.labelRit === r.id ? tekenLabelInvoer(r, rs) :
            '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._labelOpen(\'' + esc(r.id) + '\')">🏷 ' + (r.label ? 'Label wijzigen' : 'Label geven') + '</button></div>') + '</div>';
      }).join('') : '<div class="gr-klein">' + (rs.length ? 'Geen ritten met dit label.' : 'Nog geen ritten. Een rit wordt vanzelf vastgelegd zodra je rijdt met dit voertuig actief en de adapter verbonden.') + '</div>') : '<div class="gr-klein">⏳</div>') + '</div>';
    } else if (_st.tab === 'tanken') {
      // Tankbeurten (#469): de rekensom en het scherm staan in PLTank; de
      // ritten zijn er voor de km als de klant geen km-stand invulde.
      if (!c.tanken) laad(v.id, 'tanken');
      if (!c.ritten) laad(v.id, 'ritten');
      h += window.PLTank ? PLTank.html(v, { tanken: c.tanken || (c.tankenFout ? [] : null), ritten: c.ritten || [], form: _st.tankForm, fout: c.tankenFout || null })
        : '<div class="gr-melding">Tankbeurten niet geladen (pidlane-tank.js).</div>';
    } else if (_st.tab === 'rapporten') {
      if (!c.rapporten) laad(v.id, 'rapporten');
      var rp = c.rapporten || [];
      var kies = _st.kies || {}, nKies = Object.keys(kies).length;
      if (rp.length > 1) h += '<div class="gr-knoppen" style="margin:0 0 8px">' + (_st.kiesModus
        ? '<button class="gr-k klein hoofd" ' + (nKies === 2 ? '' : 'disabled') + ' onclick="PLGarage._vergelijk()">⇄ Vergelijk (' + nKies + '/2)</button>' +
          '<button class="gr-k klein gevaar" ' + (nKies ? '' : 'disabled') + ' onclick="PLGarage._rapportWegKeuze()">🗑 Wis (' + nKies + ')</button>' +
          '<button class="gr-k klein" onclick="PLGarage._kiesModus(false)">Klaar</button>'
        : '<button class="gr-k klein" onclick="PLGarage._kiesModus(true)">☑ Selecteren — vergelijken of meerdere wissen</button>') + '</div>';
      h += '<div class="gr-blok">' + (c.rapporten ? (rp.length ? rp.map(function (r) {
        return '<div class="gr-item gr-rapport">' + (_st.kiesModus ? '<input type="checkbox" class="gr-kies" aria-label="Kies dit rapport" ' + (kies[r.id] ? 'checked ' : '') + 'onchange="PLGarage._kies(\'' + esc(r.id) + '\',this.checked)">' : '') +
          '<div class="klik" style="flex:1;min-width:0" onclick="' + (_st.kiesModus ? 'PLGarage._kies(\'' + esc(r.id) + '\')' : 'PLGarage._rapport(\'' + esc(r.id) + '\')') + '"><b>' + (r.soort === 'ai' ? '🔬 ' : r.soort === 'dtc' ? '🔴 ' : r.soort === 'waak' ? '👁 ' : '📄 ') + esc(r.titel || r.soort) + '</b><div class="gr-klein">' + datumNl(r.aangemaakt, true) + '</div></div>' +
          '<button class="gr-k klein gevaar" aria-label="Rapport wissen" title="Rapport wissen" onclick="PLGarage._rapportWegId(\'' + esc(r.id) + '\')">🗑</button></div>';
      }).join('') : '<div class="gr-klein">Nog geen rapporten. Elk AI-rapport, elke foutcode-uitlezing en elke waakronde met dit voertuig actief komt hier vanzelf terecht.</div>') : '<div class="gr-klein">⏳</div>') + '</div>';
    } else if (_st.tab === 'sensoren') {
      h += tekenSensoren(v);
    } else if (_st.tab === 'profiel') {
      var rijProf = function (l, w) { return '<div>' + l + '</div><div><b>' + (w == null || w === '' ? '—' : esc(w)) + '</b></div>'; };
      h += '<div class="gr-blok"><div class="gr-rij">' +
        rijProf('Kenteken', v.kenteken ? kentekenNl(v.kenteken) : (v.kentekenLeesbaar === false ? 'onleesbaar' : null)) +
        rijProf('Merk en model', [v.merk, v.model].filter(Boolean).join(' ')) + rijProf('Bouwjaar', v.bouwjaar) +
        rijProf('Motor', v.motor) + rijProf('Brandstof', v.brandstof) + rijProf('Turbo', v.turbo) + rijProf('Handbak of automaat', v.transmissie) + rijProf('Aantal versnellingen', v.versnellingen) +
        rijProf('Rijprofiel', v.rijprofiel) + rijProf('Verbruik (opgegeven)', v.verbruik_opgegeven ? v.verbruik_opgegeven.toLocaleString('nl') + ' l/100 km' : null) +
        rijProf('Tankinhoud', v.tankinhoud ? v.tankinhoud + ' liter' : null) + rijProf('Literprijs', v.brandstofprijs ? '€ ' + String(v.brandstofprijs).replace('.', ',') : null) +
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
    turbo: ['onbekend', 'ja', 'nee'], transmissie: ['handgeschakeld', 'automaat', 'onbekend'],
    versnellingen: ['4', '5', '6', '7', '8', '9', '10'],
    rijprofiel: ['gemengd', 'stad', 'snelweg', 'korte ritten', 'aanhanger of caravan']
  };
  function tekenFormulier(v) {
    v = v || {};
    var inv = function (id, label, w, type, extra) {
      return '<label class="gr-veld">' + label + '<input id="grf_' + id + '" type="' + (type || 'text') + '" value="' + esc(w == null ? '' : w) + '" ' + (extra || '') + '></label>';
    };
    var kies = function (id, label, w) {
      return '<label class="gr-veld">' + label + '<select id="grf_' + id + '">' + ['<option value="">—</option>'].concat(KEUZES[id].map(function (k) {
        return '<option' + (k === String(w == null ? '' : w) ? ' selected' : '') + '>' + k + '</option>';
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
      '<div class="gr-2">' + kies('transmissie', 'Handbak of automaat?', v.transmissie) + kies('versnellingen', 'Hoeveel versnellingen?', v.versnellingen) + '</div>' +
      '<div class="gr-klein">Voor de versnellingsindicator: met het aantal weet hij zeker welke de 1e is. Achteruit telt niet mee.</div>' +
      kies('rijprofiel', 'Hoe rijd je meestal?', v.rijprofiel) +
      '<div class="gr-2">' + inv('verbruik_opgegeven', 'Verbruik (l/100 km)', v.verbruik_opgegeven, 'number', 'step="0.1" min="0" max="50"') + inv('kmstand', 'Kilometerstand', v.kmstand, 'number', 'min="0"') + '</div>' +
      '<div class="gr-2">' + inv('tankinhoud', 'Tankinhoud (liter)', v.tankinhoud, 'number', 'min="10" max="200"') + inv('brandstofprijs', 'Literprijs (€)', v.brandstofprijs, 'number', 'step="0.001" min="0.1" max="5"') + '</div>' +
      '<div class="gr-klein">Tankinhoud geeft het bereik met de tank die erin zit; de literprijs de kosten per rit en per uur.</div>' +
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
      '<button class="gr-k klein" onclick="PLGarage._rapportPdf()">📕 PDF</button>' +
      '<button class="gr-k klein" onclick="PLGarage._rapportBewaar()">💾 Opslaan</button><button class="gr-k klein gevaar" onclick="PLGarage._rapportWeg()">Verwijderen</button></div>' +
      '<div class="gr-blok"><div class="gr-bh">' + esc(r.titel || r.soort) + '<span class="gr-r">' + datumNl(r.aangemaakt, true) + '</span></div>' + rapportInhoud(r) + '</div>';
  }

  function tekenVergelijk() {
    var p = _st.vergelijk;
    if (!p) return '<div class="gr-klein">⏳</div>';
    var a = p[0], b = p[1];
    var kop = '<div class="gr-knoppen" style="margin:0 0 10px"><button class="gr-k klein" onclick="PLGarage._terugNaar(\'rapporten\')">← Rapporten</button></div>';
    var wa = a.soort === 'waak' ? waakDelen(a.tekst) : null, wb = b.soort === 'waak' ? waakDelen(b.tekst) : null;
    if (wa && wb) {
      var tel = function (x) { return x ? (x.staat === 'stil' ? 'geen antwoord' : esc(x.waarde) + ' ' + esc(x.eenheid || '')) : '—'; };
      var kl = function (x) { return x ? (x.staat === 'let' ? ' let' : x.staat === 'stil' ? ' stil' : '') : ' stil'; };
      var rijen = waakVergelijk(wa, wb);
      return kop + '<div class="gr-blok"><div class="gr-vgl gr-vgl-kop"><span>Sensor</span><span>' + datumNl(a.aangemaakt, true) + '</span><span>' + datumNl(b.aangemaakt, true) + '</span></div>' +
        rijen.map(function (r) {
          return '<div class="gr-vgl' + (r.veranderd ? ' anders' : '') + '"><span>' + esc(r.naam) + '</span><span class="w' + kl(r.a) + '">' + tel(r.a) + '</span><span class="w' + kl(r.b) + '">' + tel(r.b) + '</span></div>';
        }).join('') + '<div class="gr-klein" style="margin-top:8px">Bovenaan wat er veranderde: een sensor die normaal was en nu een bevinding is, of andersom.</div></div>';
    }
    return kop + '<div class="gr-vgl2">' + [a, b].map(function (r) {
      return '<div class="gr-blok"><div class="gr-bh">' + esc(r.titel || r.soort) + '<span class="gr-r">' + datumNl(r.aangemaakt, true) + '</span></div>' + rapportInhoud(r) + '</div>';
    }).join('') + '</div>';
  }

  /* Een bewaard rapport zoals de app het ook elders toont: een AI-rapport met
     de secties en kleuren van het AI-venster (_aiReportHtml), een waakronde als
     overzicht zoals het waakvenster. Alleen als dat niet lukt de kale tekst. */
  function rapportInhoud(r) {
    try {
      if (r.soort === 'ai' && typeof _aiReportHtml === 'function') return '<div class="gr-ai">' + _aiReportHtml(String(r.tekst || '')) + '</div>';
      if (r.soort === 'waak') { var w = waakDelen(r.tekst); if (w) return tekenWaak(w); }
    } catch (e) { console.warn('PLGarage: rapport niet op te maken, de tekst staat eronder', e); }
    return '<pre class="gr-tekst">' + esc(r.tekst) + '</pre>';
  }
  function tekenWaak(w) {
    var tegel = function (n, l, k) { return '<div class="gr-tegel' + (k ? ' ' + k : '') + '"><b>' + n + '</b><span>' + l + '</span></div>'; };
    var h = '<div class="gr-klein" style="margin-bottom:8px">' + esc(w.kop) + '</div>' +
      '<div class="gr-tegels">' + tegel(w.bevindingen.length, 'bevinding' + (w.bevindingen.length === 1 ? '' : 'en'), w.bevindingen.length ? 'let' : '') +
      tegel(w.normaal.length, 'normaal', 'ok') + tegel(w.stil.length, 'zonder antwoord', 'stil') + '</div>';
    h += '<div class="gr-sec">Bevindingen</div>' + (w.bevindingen.length ? w.bevindingen.map(function (b) {
      return '<div class="gr-vind"><b>' + esc(b.naam) + '</b><span class="gr-waarde">' + esc(b.waarde) + ' ' + esc(b.eenheid) + '</span>' +
        '<div class="gr-klein">' + esc(b.reden) + ' — ' + b.let + ' van ' + b.n + ' metingen · min ' + esc(b.min) + ', max ' + esc(b.max) + '</div></div>';
    }).join('') : '<div class="gr-klein">Niets buiten bereik gezien.</div>');
    if (w.normaal.length) h += '<div class="gr-sec">Normaal</div>' + w.normaal.map(function (x) {
      return '<div class="gr-wrij"><span class="gr-stip ok"></span><span class="nm">' + esc(x.naam) + '</span><span class="gr-waarde">' + esc(x.waarde) + ' ' + esc(x.eenheid) + '</span>' +
        '<span class="gr-klein gr-wbereik">' + esc(x.min) + '–' + esc(x.max) + ' · ' + x.n + '×</span></div>';
    }).join('');
    if (w.stil.length) h += '<div class="gr-sec">Zonder antwoord</div><div class="gr-klein">' + w.stil.map(esc).join(', ') +
      '</div><div class="gr-klein" style="margin-top:4px">Deze sensoren gaven geen antwoord. Dat is meestal een sensor die deze auto niet heeft, geen defect.</div>';
    if (w.overig.length) h += '<pre class="gr-tekst" style="margin-top:8px">' + esc(w.overig.join('\n')) + '</pre>';
    return h;
  }

  /* ── Sensoren per voertuig (27-09-2026) ─────────────────────────────
     De vaste selectie van dit voertuig (kp_voertuig.pid_selectie), met twee
     dingen die elders niet kunnen: berekende PIDs per voertuig aanzetten, en
     eigen PIDs toevoegen — een code van de dealer of uit een forum, met een
     formule. Wat hier staat wordt toegepast zodra de auto op zijn
     chassisnummer herkend wordt (herkenAuto → selectieToepassen). */
  function sensState(v) {
    if (!_st.sens || _st.sens.vid !== v.id) {
      _st.sens = { vid: v.id, sel: (v.pid_selectie || []).slice(), eigen: JSON.parse(JSON.stringify(v.eigen_pids || [])), test: {}, ok: {}, fout: '', gewijzigd: false, bib: null, zoek: '' };
    }
    return _st.sens;
  }
  function tekenSensoren(v) {
    var S = sensState(v);
    // Wat er in het toevoegformulier stond blijft staan na elke herteken
    // (een foutmelding, een vinkje elders, een test).
    var F = function (k) { var x = S.form && S.form[k]; return x ? ' value="' + esc(x) + '"' : ''; };
    var B = (window.PLBerekend && PLBerekend.DEFS) || {};
    var koppel = versnellingsVoertuig(), nu = koppel && koppel.id === v.id && isVerbonden();
    var h = '<div class="gr-sub">Wat hier aan staat, zet de app aan zodra deze auto verbonden en herkend is.</div>';
    h += '<div class="gr-blok"><div class="gr-bh">🧮 Berekende sensoren<span class="gr-r">rekent de app uit</span></div>' +
      Object.keys(B).map(function (pid) {
        var aan = S.sel.indexOf(pid) >= 0;
        return '<label class="gr-sens"><input type="checkbox" ' + (aan ? 'checked ' : '') + 'onchange="PLGarage._sensKies(\'' + pid + '\',this.checked)">' +
          '<span><b>' + esc(String(B[pid].name).replace(' (berekend)', '')) + '</b> <small>' + esc(B[pid].unit) + '</small><br><small>' + esc(B[pid].uitleg || '') + '</small></span></label>';
      }).join('') + '<div class="gr-klein" style="margin-top:6px">Een berekende sensor verschijnt alleen als de auto de bronnen ervoor geeft.</div></div>';
    h += '<div class="gr-blok"><div class="gr-bh">🔧 Eigen sensoren<span class="gr-r">' + S.eigen.length + ' / ' + ((window.PLEigen && PLEigen.MAX) || 20) + '</span></div>' +
      (S.eigen.length ? S.eigen.map(function (e, i) {
        var t = S.test[e.code];
        return '<div class="gr-item"><label class="gr-sens" style="padding:0"><input type="checkbox" ' + (S.sel.indexOf(e.code) >= 0 ? 'checked ' : '') + 'onchange="PLGarage._sensKies(\'' + esc(e.code) + '\',this.checked)">' +
          '<span><b>' + esc(e.naam) + '</b> <small>' + esc(e.eenheid || '') + '</small><br><small>' + sensRegel(e) + '</small></span></label>' +
          (t ? '<div class="gr-klein" style="margin-top:4px">' + esc(t) + '</div>' : '') +
          (isBand(e) ? '<div class="gr-klein" style="margin-top:4px">Hoe vaak: in het bandenvenster, samen met de andere banden</div>'
            : '<label class="gr-veld gr-tempo">Hoe vaak' + tempoKeuze('onchange="PLGarage._sensTempo(' + i + ',this.value)"', e.tempo) + '</label>') +
          '<div class="gr-knoppen">' + (nu ? '<button class="gr-k klein" onclick="PLGarage._sensTest(' + i + ')">▶ Test</button>' : '') +
          (S.ok[e.code] ? '<button class="gr-k klein" onclick="PLGarage._sensDeel(' + i + ')">📤 Deel met rijders van dit model</button>' : '') +
          '<button class="gr-k klein gevaar" onclick="PLGarage._sensWeg(' + i + ')">Weghalen</button></div></div>';
      }).join('') : '<div class="gr-klein">Nog geen eigen sensoren.</div>') +
      (window.PLBanden && window.PLEigen && S.eigen.some(function (e) { return PLEigen.bandRol(e.naam); })
        ? '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLBanden.open()">🛞 Banden bekijken</button></div>' : '') +
      '<div class="gr-labin" style="margin-top:10px"><div class="gr-bh" style="margin:0">Toevoegen</div>' +
      '<div class="gr-2"><label class="gr-veld">Naam<input id="grsNaam" maxlength="40" placeholder="bijv. Temperatuur automaat"' + F('naam') + '></label>' +
      '<label class="gr-veld">Code<input id="grsCode" maxlength="6" autocapitalize="characters" placeholder="bijv. 221E1C"' + F('code') + '></label></div>' +
      '<div class="gr-2"><label class="gr-veld">Formule<input id="grsFormule" maxlength="80" placeholder="A-40  of  (A*256+B)/10"' + F('formule') + '></label>' +
      '<label class="gr-veld">Eenheid<input id="grsEenheid" maxlength="12" placeholder="°C"' + F('eenheid') + '></label></div>' +
      '<div class="gr-2"><label class="gr-veld">Minimum (mag leeg)<input id="grsMin" type="number"' + F('min') + '></label><label class="gr-veld">Maximum (mag leeg)<input id="grsMax" type="number"' + F('max') + '></label></div>' +
      '<div class="gr-2"><label class="gr-veld">ECU-adres (mag leeg)<input id="grsEcu" maxlength="8" autocapitalize="characters" placeholder="bijv. 7E1"' + F('ecu') + '></label>' +
      '<label class="gr-veld">Hoe vaak' + tempoKeuze('id="grsTempo"', S.form && S.form.tempo) + '</label></div>' +
      '<div class="gr-klein" style="margin-top:4px">Alleen leescodes: 21xx of 22xxxx. A is het eerste antwoordbyte, B het tweede, enzovoort. Codes die iets aansturen of wissen weigert de app. ' +
      'Het ECU-adres is nodig als de code bij één regeleenheid hoort (7E1 is meestal de automaat); leeg = alle regeleenheden.</div>' +
      '<div class="gr-knoppen">' + (nu ? '<button class="gr-k klein" onclick="PLGarage._sensTest(-1)">▶ Test op de auto</button>' : '<span class="gr-klein">Testen kan als deze auto verbonden is.</span>') +
      '<button class="gr-k klein hoofd" onclick="PLGarage._sensErbij()">➕ Toevoegen</button></div>' +
      (S.test.nieuw ? '<div class="gr-klein" style="margin-top:4px">' + esc(S.test.nieuw) + '</div>' : '') + '</div></div>';
    h += tekenBib(v, S, nu);
    var standaard = S.sel.filter(function (p) { return !(B[p]) && !S.eigen.some(function (e) { return e.code === p; }); });
    h += '<div class="gr-blok"><div class="gr-bh">🎛️ Vaste selectie<span class="gr-r">' + standaard.length + ' sensoren van de auto</span></div>' +
      '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._sensLive()">Neem de huidige live-selectie over</button></div></div>';
    if (S.fout) h += '<div class="gr-melding rood">' + esc(S.fout) + '</div>';
    h += '<div class="gr-knoppen"><button class="gr-k hoofd" ' + (S.gewijzigd ? '' : 'disabled') + ' onclick="PLGarage._sensBewaar()">Bewaren</button></div>';
    return h;
  }
  function sensNieuw() {
    var w = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var e = { naam: w('grsNaam'), code: String(w('grsCode')).toUpperCase().replace(/\s+/g, ''), formule: w('grsFormule') || 'A', eenheid: w('grsEenheid'), min: w('grsMin'), max: w('grsMax'),
      ecu: String(w('grsEcu')).toUpperCase().replace(/\s+/g, ''), tempo: w('grsTempo') || '' };
    if (_st.sens && document.getElementById('grsNaam')) _st.sens.form = { naam: e.naam, code: e.code, formule: w('grsFormule'), eenheid: e.eenheid, min: e.min, max: e.max, ecu: e.ecu, tempo: e.tempo };
    return e;
  }
  // '' = de app kiest: elke 2 s (PLEigen). Een band heeft geen keuze: die
  // vraagt het bandenvenster (#396, 08-10-2026).
  var SENS_TEMPO = { '': 'Standaard', snel: 'Elke seconde', normaal: 'Elke 2 s', traag: 'Elke 10 s', minuut: 'Elke minuut' };
  function isBand(e) {
    try { return !!(window.PLEigen && PLEigen.bandRol && PLEigen.bandRol(e.naam)); }
    catch (x) { console.warn('PLGarage: bandRol', x); return false; }
  }
  function tempoKeuze(attr, nu) {
    return '<select ' + attr + '>' + Object.keys(SENS_TEMPO).map(function (k) {
      return '<option value="' + k + '"' + ((nu || '') === k ? ' selected' : '') + '>' + SENS_TEMPO[k] + '</option>'; }).join('') + '</select>';
  }
  function sensRegel(e) {
    return esc(e.code) + (e.ecu ? ' @ ' + esc(e.ecu) : '') + ' · ' + esc(e.formule || 'A');
  }

  /* De bibliotheek per merk en model: codes die andere klanten bewezen
     hebben, en kandidaten die online gevonden zijn. Testen op de eigen auto
     telt als stem (werkt / werkt niet) — anoniem, alleen merk en model. */
  function tekenBib(v, S, nu) {
    if (S.bib === null) { S.bib = 'laden'; sensBibLaad(v.id); }
    var titel = [v.merk, (v.model || '').split(/\s+/)[0]].filter(Boolean).join(' ') || 'dit model';
    var h = '<div class="gr-blok"><div class="gr-bh">📚 Codes voor ' + esc(titel) + '<span class="gr-r">gedeeld door rijders</span></div>';
    if (!v.merk || !v.model) return h + '<div class="gr-klein">Vul merk en model in bij het profiel; dan zie je hier wat anderen met dezelfde auto gevonden hebben.</div></div>';
    if (S.bib === 'laden') h += '<div class="gr-klein">⏳ Laden…</div>';
    else if (S.bib && S.bib.fout) h += '<div class="gr-melding rood">' + esc(S.bib.fout) + '</div>';
    else if (S.bib && S.bib.lijst) {
      if (!S.bib.lijst.length) h += '<div class="gr-klein">Nog niets voor dit model. Zoek online, of deel een code die bij jou werkt.</div>';
      S.bib.lijst.forEach(function (b) {
        var al = S.eigen.some(function (e) { return e.code === b.code; });
        var t = S.test['bib:' + b.id];
        var stand = (b.werkt ? '✓ werkt bij ' + b.werkt : '') + (b.werkt_niet ? (b.werkt ? ' · ' : '') + '✗ niet bij ' + b.werkt_niet : '') +
          (!b.werkt && !b.werkt_niet ? (b.bron === 'online' ? 'online gevonden, nog door niemand getest' : 'nog niet getest') : '') +
          (b.mijn ? ' · jij: ' + (b.mijn === 'werkt' ? 'werkt' : 'werkt niet') : '');
        h += '<div class="gr-item gr-bib"><b>' + esc(b.naam) + '</b> <small>' + esc(b.eenheid || '') + '</small><br><small>' + sensRegel(b) + '</small>' +
          '<div class="gr-klein">' + esc(stand) + (b.url ? ' · <a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">bron</a>' : '') + '</div>' +
          (t ? '<div class="gr-klein" style="margin-top:4px">' + esc(t) + '</div>' : '') +
          '<div class="gr-knoppen">' + (nu ? '<button class="gr-k klein" onclick="PLGarage._bibTest(\'' + esc(b.id) + '\')">▶ Test</button>' : '') +
          (al ? '<span class="gr-klein">staat bij je sensoren</span>' : '<button class="gr-k klein" onclick="PLGarage._bibErbij(\'' + esc(b.id) + '\')">➕ Toevoegen</button>') + '</div></div>';
      });
    }
    var bew = bewezen(S);
    h += '<div class="gr-knoppen"><button class="gr-k klein" ' + (S.zoek === 'bezig' ? 'disabled' : '') + ' onclick="PLGarage._bibZoek()">' +
      (S.zoek === 'bezig' ? '⏳ Zoeken…' : '🔎 Zoek online naar codes voor dit model') + '</button>' +
      (bew.length ? '<button class="gr-k klein" ' + (S.zoek === 'bezig' ? 'disabled' : '') + ' onclick="PLGarage._bibZoek(true)">🔎 Dieper zoeken (' + bew.length + ' werkende codes als aanwijzing)</button>' : '') + '</div>' +
      (S.zoek && S.zoek !== 'bezig' ? '<div class="gr-klein">' + esc(S.zoek) + '</div>' : '') +
      '<div class="gr-klein" style="margin-top:4px">Zoeken gebruikt AI-tegoed. Wat gevonden wordt komt in deze lijst, voor iedereen met dit model, met de bron erbij. ' +
      'Een test op je auto telt mee als "werkt" of "werkt niet" — zonder naam, kenteken of VIN, alleen merk en model.' +
      (nu ? '' : ' Testen kan als deze auto verbonden is.') + '</div></div>';
    h += tekenScan(S, bew, nu);
    return h;
  }
  /* Wat op deze auto bewezen werkt: uit de bibliotheek (een "werkt"-stem)
     en de eigen sensoren die deze sessie een geslaagde test hadden. */
  function bewezen(S) {
    var uit = [], gezien = {};
    var erbij = function (b) { var k = b.code + '@' + (b.ecu || ''); if (!gezien[k]) { gezien[k] = 1; uit.push({ code: b.code, ecu: b.ecu || '', naam: b.naam }); } };
    ((S.bib && S.bib.lijst) || []).forEach(function (b) { if (b.werkt > 0 || b.mijn === 'werkt') erbij(b); });
    S.eigen.forEach(function (e) { if (S.ok[e.code]) erbij(e); });
    return uit;
  }
  /* De buurscan: per blok rond werkende codes elke code één keer vragen. */
  function tekenScan(S, bew, nu) {
    if (!window.PLEigen || !PLEigen.scanBlokken) return '';
    var blokken = PLEigen.scanBlokken(bew), sc = S.scan || {};
    if (!blokken.length && !sc.gevonden) return '';
    var h = '<div class="gr-blok"><div class="gr-bh">📡 Buurscan op de auto<span class="gr-r">rond codes die werken</span></div>' +
      '<div class="gr-klein">Rond een werkende code liggen vaak meer (222A05 is voor-links, 222A06–08 de andere banden). De scan vraagt elke code in het blok één keer op — alleen lezen, ongeveer een halve minuut per blok. De meting loopt ertussendoor.</div>';
    if (sc.bezig) h += '<div class="gr-klein" style="margin-top:6px">⏳ ' + esc(sc.blok) + ': ' + sc.gedaan + ' / 256 · ' + sc.n + ' antwoorden</div>' +
      '<div class="gr-knoppen"><button class="gr-k klein gevaar" onclick="PLGarage._scanStop()">■ Stop</button></div>';
    else h += '<div class="gr-knoppen">' + blokken.map(function (b, i) {
      return '<button class="gr-k klein" ' + (nu ? '' : 'disabled ') + 'onclick="PLGarage._scan(' + i + ')">Scan ' + esc(b.prefix) + 'xx' + (b.ecu ? ' @ ' + esc(b.ecu) : '') + '</button>'; }).join('') +
      (nu ? '' : '<span class="gr-klein">Scannen kan als deze auto verbonden is.</span>') + '</div>';
    if (sc.fout) h += '<div class="gr-melding rood">' + esc(sc.fout) + '</div>';
    if (sc.gevonden) {
      var al = function (c) { return S.eigen.some(function (e) { return e.code === c; }) || bew.some(function (b) { return b.code === c; }); };
      var nieuw = sc.gevonden.filter(function (g) { return !al(g.code); });
      h += '<div class="gr-klein" style="margin-top:6px">' + esc(sc.blok) + ': ' + sc.gevonden.length + ' codes antwoorden, ' + nieuw.length + ' daarvan nieuw' + (sc.gestopt ? ' (gestopt)' : '') + '.</div>';
      nieuw.slice(0, 60).forEach(function (g) {
        h += '<div class="gr-item gr-bib"><b>' + esc(g.code) + '</b>' + (g.ecu ? ' <small>@ ' + esc(g.ecu) + '</small>' : '') +
          '<br><small>' + g.bytes.length + ' byte(s): ' + esc(g.bytes.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16).toUpperCase(); }).join(' ')) + ' — betekenis onbekend</small>' +
          '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._scanErbij(\'' + esc(g.code) + '\')">➕ In het formulier</button></div></div>';
      });
      if (nieuw.length) h += '<div class="gr-klein">Tip: kijk wat er verandert als je iets doet (gas geven, stuur draaien, een deur open). Geef hem daarna in het formulier een naam en een formule.</div>';
    }
    return h + '</div>';
  }
  async function sensBibLaad(vid) {
    var S = _st.sens;
    try { var d = await api('pidbib_lijst', { voertuig_id: vid }); if (_st.sens === S) S.bib = { lijst: d.lijst || [] }; }
    catch (x) { if (_st.sens === S) S.bib = { fout: 'Bibliotheek niet te laden: ' + x.message }; }
    if (_st.sens === S) teken();
  }
  function bibItem(id) { var S = _st.sens; return S && S.bib && S.bib.lijst ? S.bib.lijst.find(function (b) { return b.id === id; }) : null; }

  // De literprijs uit het profiel, anders de standaardprijs van PLBerekend.
  function literprijs(v) {
    if (v && Number(v.brandstofprijs) > 0) return { prijs: Number(v.brandstofprijs), standaard: false };
    try {
      var t = window.PLBerekend && PLBerekend.PRIJS_STANDAARD;
      var b = (v && v.brandstof) || 'benzine';
      if (t && t[b]) return { prijs: t[b], standaard: true };
    } catch (e) { console.warn('PLGarage: standaardprijs', e); }
    return { prijs: null, standaard: true };
  }

  function tekenVersnellingen(v) {
    var m = v.gear_model || null;
    var gears = (m && Array.isArray(m.gears)) ? m.gears : [];
    var koppel = versnellingsVoertuig();
    var nu = koppel && koppel.id === v.id;
    var st = null;
    try { if (nu && window.PLGear) st = PLGear.status(); } catch (e) { console.warn('PLGarage: status versnellingsindicator', e); }
    var geleerd = st ? st.versnellingen.length : gears.length;
    var metingen = st ? st.metingen : (m && m.totaal) || 0;
    var n = v.versnellingen;
    var h = '<div class="gr-blok"><div class="gr-bh">⚙️ Versnellingen<span class="gr-r">' + (v.transmissie ? esc(v.transmissie) : 'transmissie onbekend') + '</span></div><div class="gr-rij">' +
      '<div>Aantal (profiel)</div><div><b>' + (n ? n : '—') + '</b></div>' +
      '<div>Geleerd</div><div><b>' + geleerd + (n ? ' van ' + n : '') + '</b></div>' +
      '<div>Metingen</div><div><b>' + metingen.toLocaleString('nl') + '</b></div>' +
      '<div>Correcties</div><div><b>' + ((st ? st.ankers : (m && m.ankers ? m.ankers.length : 0)) || 0) + '</b></div></div>' +
      '<div class="gr-klein" style="margin-top:6px">' + (nu ? 'De indicator leert nu voor dit voertuig en bewaart het hier, ook voor een ander toestel.'
        : 'Leert zodra je met dit voertuig verbonden rijdt. Wat hij leert blijft bij dit voertuig bewaard.') +
      (!n || !v.transmissie ? ' Vul bij Profiel in of het een handbak of automaat is en hoeveel versnellingen hij heeft.' : '') + '</div>' +
      tekenRijstijl(nu, m) +
      '<div class="gr-knoppen"><button class="gr-k klein" onclick="PLGarage._versnelling()">⚙️ Versnellingsindicator</button>' +
      (!n || !v.transmissie ? '<button class="gr-k klein" onclick="PLGarage._bewerk(\'' + esc(v.id) + '\')">✏️ Handbak/automaat invullen</button>' : '') +
      (nu ? '<button class="gr-k klein" onclick="PLGarage._versnellingUitRitten(\'' + esc(v.id) + '\')">↻ Opnieuw opbouwen uit ritten</button>' : '') +
      ((m || nu) ? '<button class="gr-k klein gevaar" onclick="PLGarage._versnellingWis(\'' + esc(v.id) + '\')">Opnieuw laten leren</button>' : '') + '</div></div>';
    return h;
  }

  // Tijd per versnelling en het rijstijladvies van PLGear (live als dit
  // voertuig gekoppeld is, anders uit het bewaarde model).
  function tekenRijstijl(nu, m) {
    var rs = null;
    try {
      if (window.PLGear) rs = nu ? PLGear.rijstijl() : (m && m.tijd ? PLGear._rijstijl(m.tijd, 'benzine') : null);
    } catch (e) { console.warn('PLGarage: rijstijl', e); }
    if (!rs || !rs.verdeling.length) return '';
    return '<div class="gr-klein" style="margin-top:8px">Tijd per versnelling (' + Math.round(rs.totaalS / 60) + ' min): ' +
      rs.verdeling.map(function (x) { return x.k + 'e ' + x.pct + '%'; }).join(' · ') + '</div>' +
      rs.advies.map(function (a) { return '<div class="gr-klein" style="margin-top:4px">💡 ' + esc(a) + '</div>'; }).join('');
  }

  // De labels om uit te kiezen: eerst wat de klant zelf al gebruikte, dan de vaste voorstellen.
  function labelKeuzes(rs) {
    return labelSom(rs).map(function (x) { return x.label; }).filter(function (l) { return LABEL_VOORSTEL.indexOf(l) < 0; }).concat(LABEL_VOORSTEL);
  }

  function tekenLabelInvoer(r, rs) {
    var voorstel = r.label ? null : labelSuggestie(r, rs);
    return '<div class="gr-labin"><label class="gr-veld">Label voor deze rit<input id="grLabel" maxlength="40" value="' + esc(r.label || voorstel || '') + '" placeholder="bijv. Woon-werk"></label>' +
      (voorstel ? '<div class="gr-klein">💡 Voorstel: <b>' + esc(voorstel) + '</b> — eerdere ritten op dit tijdstip met deze afstand hadden dit label.</div>' : '') +
      '<div class="gr-labels">' + labelKeuzes(rs).map(function (l) {
        return '<button class="gr-lab" onclick="document.getElementById(\'grLabel\').value=' + esc(JSON.stringify(l)) + '">' + esc(l) + '</button>';
      }).join('') + '</div>' +
      '<div class="gr-knoppen"><button class="gr-k klein hoofd" onclick="PLGarage._labelBewaar(\'' + esc(r.id) + '\')">Bewaren</button>' +
      (r.label ? '<button class="gr-k klein gevaar" onclick="PLGarage._labelBewaar(\'' + esc(r.id) + '\',true)">Label weghalen</button>' : '') +
      '<button class="gr-k klein" onclick="PLGarage._labelOpen(null)">Annuleren</button></div></div>';
  }

  // Het kaartje op het startscherm, boven de deuren.
  function tekenKaart() {
    var el = document.getElementById('plGarageKaart');
    if (!el) return;
    if (!magPlatform()) { el.innerHTML = ''; return; }
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
    var velden = ['naam', 'kenteken', 'merk', 'model', 'bouwjaar', 'motor', 'brandstof', 'turbo', 'transmissie', 'versnellingen', 'rijprofiel', 'verbruik_opgegeven', 'kmstand', 'tankinhoud', 'brandstofprijs', 'apk_tot', 'onderhoud_datum', 'onderhoud_km', 'onderhoud_laatst', 'distributie', 'notities', 'cilinderinhoud', 'vermogen_kw', 'vin_pseudo'];
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
    gekoppeld: function () { return versnellingsVoertuig(); },
    selectieOordeel: selectieOordeel,
    staat: function () { return _st; },
    /* Voor "Rit beëindigen" (pidlane-afsluiten.js): de lopende rit zoals hij
       nu zou worden vastgelegd, zonder hem af te sluiten. null = geen rit. */
    ritNu: function () {
      var r = _st.rit;
      if (!r || !magPlatform()) return null;
      var c = cacheVan(r.vid);
      if (!c.ritten) laad(r.vid, 'ritten');   // voor het labelvoorstel; komt er later bij
      var rs = c.ritten || [];
      var sam = ritKlaar(r), v = voertuig(r.vid), nu = Date.now();
      return {
        stand: ritStand(r, nu, isVerbonden()), sam: sam, voertuig: v ? (v.naam || v.merk || '') : '',
        stilMin: Math.floor((nu - (r.tBeweeg || nu)) / 60000), pauzeMin: Math.round(CFG.ritPauzeMs / 60000),
        voorstel: sam ? labelSuggestie({ id: null, start: r.start, km: sam.km }, rs) : null, labels: labelKeuzes(rs)
      };
    },
    ritBeeindig: function (label) { return ritAf('handmatig', label); },
    ritVerslag: function () { return (_st.ritVerslag || []).slice(); },
    // Voor test-garage.js: de tik en het herstel bij de start, met de echte staat.
    /* De lopende rit in het kort, voor het vak linksonder van Slim visueel
       (08-10-2026): kilometers en minuten tot nu. null zonder rit. */
    ritKort: function () {
      var r = _st.rit;
      if (!r || typeof r.km !== 'number') return null;
      return { km: rond(r.km, 1), min: Math.max(0, Math.round(((r.tLaatst || r.t0) - r.t0) / 60000)) };
    },
    _ritTikNu: function () { return ritTikNu(); },
    _ritHerstel: function () { return ritHerstel(); },
    tekenKaart: tekenKaart,
    _akkoord: function () { doe(function () { return api('akkoord', { versie: _st.stand && _st.stand.akkoordVersie }); }, 'Mijn voertuigen staat aan'); },
    _open: function (id) { _st.view = 'voertuig'; _st.vid = id; _st.tab = 'overzicht'; teken(); },
    _tab: function (t) { _st.tab = t; _st.labelRit = null; _st.tankForm = null; _st.kiesModus = false; _st.kies = {}; // Sensoren opnieuw openen = verse stand uit het voertuig en de bibliotheek,
      // behalve als er nog iets onbewaards staat.
      if (t !== 'sensoren' || !(_st.sens && _st.sens.gewijzigd)) _st.sens = null; teken(); },
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
      doe(async function () { await api('alles_wissen'); schrijf(OPSLAG.actief, null); _st.actiefId = null; _st.cache = {}; _st.meekijk = undefined; }, 'Alles gewist');
    },
    _meekijkAan: function () {
      doe(async function () { _st.meekijk = (await api('meekijk_aan')).meekijk || null; }, 'Meekijkcode gemaakt — geef hem aan PidLane');
    },
    _meekijkUit: function () {
      if (!confirm('Meekijkcode intrekken? PidLane kan daarna niet meer bij je voertuigen.')) return;
      doe(async function () { await api('meekijk_uit'); _st.meekijk = null; }, 'Meekijkcode ingetrokken');
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
      try { if (typeof plOpslaan === 'function') plOpslaan((typeof plBestandsnaam === 'function') ? plBestandsnaam('rapport', '', Date.parse(r.aangemaakt) || undefined) : 'rapport-' + String(r.aangemaakt).slice(0, 10), r.tekst, { titel: r.titel || 'Rapport' }); }
      catch (e) { console.warn('PLGarage: opslaan', e); }
    },
    _rapportWegId: function (id) {
      if (!id || !confirm('Dit rapport wissen? Dat kan niet ongedaan gemaakt worden.')) return;
      var vid = _st.vid;
      doe(function () { return api('rapport_verwijder', { id: id }); }, 'Rapport gewist').then(function () { delete cacheVan(vid).rapporten; teken(); });
    },
    _sensKies: function (pid, aan) {
      var S = _st.sens; if (!S) return;
      sensNieuw();
      var i = S.sel.indexOf(pid);
      if (aan && i < 0) S.sel.push(pid); else if (!aan && i >= 0) S.sel.splice(i, 1);
      S.gewijzigd = true; teken();
    },
    _sensErbij: function () {
      var S = _st.sens; if (!S) return;
      var e = sensNieuw();
      var r = window.PLEigen ? PLEigen.controleer(e) : { ok: false, fout: 'module ontbreekt' };
      if (!r.ok) { S.test.nieuw = '⚠️ ' + r.fout; teken(); return; }
      if (S.eigen.some(function (x) { return x.code === r.code; })) { S.test.nieuw = '⚠️ ' + r.code + ' staat er al'; teken(); return; }
      if (S.eigen.length >= PLEigen.MAX) { S.test.nieuw = '⚠️ Hoogstens ' + PLEigen.MAX + ' eigen sensoren'; teken(); return; }
      e.code = r.code;
      S.eigen.push(e); if (S.sel.indexOf(r.code) < 0) S.sel.push(r.code);
      S.test.nieuw = ''; S.form = null; S.gewijzigd = true; teken();
    },
    _sensWeg: function (i) {
      var S = _st.sens; if (!S || !S.eigen[i]) return;
      sensNieuw();
      var c = S.eigen[i].code;
      S.eigen.splice(i, 1); S.sel = S.sel.filter(function (p) { return p !== c; });
      S.gewijzigd = true; teken();
    },
    _sensTest: async function (i) {
      var S = _st.sens; if (!S || !window.PLEigen) return;
      var nieuw = sensNieuw(), e = i < 0 ? nieuw : S.eigen[i];
      var sleutel = i < 0 ? 'nieuw' : e.code;
      S.test[sleutel] = '⏳ Vragen aan de auto…'; teken();
      try {
        var r = await PLEigen.test(e);
        if (i >= 0) S.ok[e.code] = !!(r.ok && r.waarde !== null);
        S.test[sleutel] = r.ok ? '✓ Antwoord ' + r.raw + ' → ' + (r.waarde === null ? 'formule past niet op ' + r.bytes.length + ' byte(s)' : String(r.waarde).replace('.', ',') + ' ' + (r.eenheid || ''))
          : '✗ ' + r.fout + (r.raw ? ' (' + r.raw + ')' : '');
      } catch (x) { S.test[sleutel] = '✗ ' + x.message; }
      teken();
    },
    _sensTempo: function (i, t) {
      var S = _st.sens; if (!S || !S.eigen[i]) return;
      sensNieuw();
      if (t && SENS_TEMPO[t]) S.eigen[i].tempo = t; else delete S.eigen[i].tempo;
      S.gewijzigd = true; teken();
    },
    _sensDeel: async function (i) {
      var S = _st.sens; if (!S || !S.eigen[i]) return;
      var e = S.eigen[i];
      if (S.gewijzigd) { S.test[e.code] = '⚠️ Bewaar eerst; delen gaat uit wat er bij het voertuig staat.'; teken(); return; }
      try {
        await api('pidbib_deel', { voertuig_id: S.vid, code: e.code, ecu: e.ecu || '' });
        S.test[e.code] = '📤 Gedeeld — rijders van dit model zien hem nu in de bibliotheek.';
        S.bib = null;
      } catch (x) { S.test[e.code] = '✗ ' + x.message; }
      teken();
    },
    _bibErbij: function (id) {
      var S = _st.sens, b = bibItem(id); if (!S || !b) return;
      sensNieuw();
      if (S.eigen.some(function (e) { return e.code === b.code; })) return;
      if (S.eigen.length >= PLEigen.MAX) { S.test['bib:' + id] = '⚠️ Hoogstens ' + PLEigen.MAX + ' eigen sensoren'; teken(); return; }
      var e = { code: b.code, naam: b.naam, formule: b.formule, eenheid: b.eenheid || '', ecu: b.ecu || '' };
      S.eigen.push(e); if (S.sel.indexOf(b.code) < 0) S.sel.push(b.code);
      S.gewijzigd = true; teken();
    },
    _bibTest: async function (id) {
      var S = _st.sens, b = bibItem(id); if (!S || !b || !window.PLEigen) return;
      sensNieuw();
      S.test['bib:' + id] = '⏳ Vragen aan de auto…'; teken();
      var r;
      try { r = await PLEigen.test({ code: b.code, naam: b.naam, formule: b.formule, eenheid: b.eenheid, ecu: b.ecu }); }
      catch (x) { r = { ok: false, fout: x.message }; }
      S.test['bib:' + id] = r.ok ? '✓ Antwoord ' + r.raw + ' → ' + (r.waarde === null ? 'formule past niet op ' + r.bytes.length + ' byte(s)' : String(r.waarde).replace('.', ',') + ' ' + (r.eenheid || ''))
        : '✗ ' + r.fout + (r.raw ? ' (' + r.raw + ')' : '');
      // Alleen een echte uitkomst telt: antwoord met een waarde, of de auto
      // weigert / zwijgt. Niet verbonden of een busprobleem is geen stem.
      var uitkomst = (r.ok && r.waarde !== null) ? 'werkt' : (/weigert|Geen antwoord/.test(r.fout || '') ? 'werkt_niet' : null);
      if (uitkomst) {
        try { await api('pidbib_stem', { voertuig_id: S.vid, id: id, uitkomst: uitkomst }); b.mijn = uitkomst; }
        catch (x) { console.warn('PLGarage: stem niet bewaard', x); }
      }
      teken();
    },
    _scan: async function (i) {
      var S = _st.sens; if (!S || !window.PLEigen) return;
      sensNieuw();
      var b = PLEigen.scanBlokken(bewezen(S))[i]; if (!b) return;
      var naam = b.prefix + 'xx' + (b.ecu ? ' @ ' + b.ecu : '');
      S.scan = { bezig: true, blok: naam, gedaan: 0, n: 0 }; teken();
      var laatst = 0;
      var r = await PLEigen.buurScan(b, { voortgang: function (st) {
        if (_st.sens !== S) return;
        S.scan.gedaan = st.gedaan; S.scan.n = st.gevonden.length;
        if (Date.now() - laatst > 700) { laatst = Date.now(); teken(); }
      } });
      if (_st.sens !== S) return;
      S.scan = r.ok ? { blok: naam, gevonden: r.gevonden, gestopt: r.gestopt } : { blok: naam, fout: r.fout };
      teken();
    },
    _scanStop: function () { try { if (window.PLEigen) PLEigen.buurScanStop(); } catch (e) { console.warn('PLGarage: scan stoppen', e); } },
    _scanErbij: function (code) {
      var S = _st.sens; if (!S || !S.scan || !S.scan.gevonden) return;
      var g = S.scan.gevonden.find(function (x) { return x.code === code; }); if (!g) return;
      S.form = { naam: '', code: g.code, formule: 'A', eenheid: '', min: '', max: '', ecu: g.ecu || '', tempo: '' };
      S.test.nieuw = 'Code ' + g.code + ' staat in het formulier. Geef hem een naam en een formule, test hem, en voeg hem toe.';
      teken();
      setTimeout(function () { var el = document.getElementById('grsNaam'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }, 50);
    },
    _bibZoek: async function (dieper) {
      var S = _st.sens, v = S && voertuig(S.vid); if (!S || !v || S.zoek === 'bezig' || !window.PLEigen) return;
      sensNieuw();
      S.zoek = 'bezig'; teken();
      var r = await PLEigen.zoekOnline(v, dieper ? bewezen(S) : null);
      if (!r.ok) S.zoek = '✗ ' + r.fout;
      else if (!r.kandidaten.length) S.zoek = 'Niets gevonden dat door de controle komt (alleen leescodes met een bron).';
      else {
        try {
          var d = await api('pidbib_kandidaten', { voertuig_id: S.vid, lijst: r.kandidaten });
          S.zoek = '✓ ' + d.erbij + ' nieuwe kandidaat' + (d.erbij === 1 ? '' : 'en') + ' in de lijst' + (r.kandidaten.length > d.erbij ? ' (' + (r.kandidaten.length - d.erbij) + ' stonden er al of vielen af)' : '') + '. Test ze op je auto.';
          S.bib = null;
        } catch (x) { S.zoek = '✗ ' + x.message; }
      }
      teken();
    },
    _pasSelectieToe: function (v) { return pasSelectieToe(v); },
    _sensLive: function () {
      var S = _st.sens; if (!S) return;
      sensNieuw();
      var live = [];
      try { live = Array.from(activePIDs || []); } catch (x) { console.warn('PLGarage: live-selectie onleesbaar', x); }
      var B = (window.PLBerekend && PLBerekend.DEFS) || {};
      var houd = S.sel.filter(function (p) { return B[p] || S.eigen.some(function (e) { return e.code === p; }); });
      S.sel = houd.concat(live.filter(function (p) { return houd.indexOf(p) < 0 && /^[0-9A-F]{4,6}$/.test(p); }));
      S.gewijzigd = true; melding(live.length + ' sensoren overgenomen — druk op Bewaren'); teken();
    },
    _sensBewaar: async function () {
      var S = _st.sens; if (!S) return;
      try {
        var d = await api('voertuig_opslaan', { voertuig: { id: S.vid, pid_selectie: S.sel, eigen_pids: S.eigen } });
        var v = voertuig(S.vid); if (v && d.voertuig) { v.pid_selectie = d.voertuig.pid_selectie; v.eigen_pids = d.voertuig.eigen_pids; }
        S.gewijzigd = false; S.fout = '';
        // Hangt deze auto nu aan de adapter, dan meteen toepassen.
        var k = versnellingsVoertuig();
        if (k && k.id === S.vid && isVerbonden()) {
          try { pasSelectieToe(v); } catch (x) { console.warn('PLGarage: selectie', x); }
        }
        melding('🎛️ Sensoren van ' + (v && v.naam || 'dit voertuig') + ' bewaard');
      } catch (x) { S.fout = x.message; }
      teken();
    },
    _kiesModus: function (aan) { _st.kiesModus = !!aan; _st.kies = {}; teken(); },
    _kies: function (id, aan) {
      _st.kies = _st.kies || {};
      if (aan === undefined) aan = !_st.kies[id];
      if (aan) _st.kies[id] = true; else delete _st.kies[id];
      teken();
    },
    _vergelijk: async function () {
      var ids = Object.keys(_st.kies || {});
      if (ids.length !== 2) return;
      _st.view = 'vergelijk'; _st.vergelijk = null; teken();
      try {
        var r = await Promise.all(ids.map(function (id) { return api('rapport', { id: id }); }));
        var p = r.map(function (x) { return x.rapport; }).sort(function (a, b) { return String(a.aangemaakt) < String(b.aangemaakt) ? -1 : 1; });
        _st.vergelijk = p;
      } catch (e) { melding('⚠️ ' + e.message); _st.view = 'voertuig'; _st.tab = 'rapporten'; }
      teken();
    },
    _rapportWegKeuze: function () {
      var ids = Object.keys(_st.kies || {});
      if (!ids.length || !confirm(ids.length + ' rapport' + (ids.length === 1 ? '' : 'en') + ' wissen? Dat kan niet ongedaan gemaakt worden.')) return;
      var vid = _st.vid;
      doe(async function () { var d = await api('rapport_verwijder', { ids: ids }); melding('🗑 ' + (d.gewist || 0) + ' gewist'); }, null)
        .then(function () { delete cacheVan(vid).rapporten; _st.kies = {}; _st.kiesModus = false; teken(); });
    },
    _ritExport: function (soort) {
      var v = voertuig(_st.vid), rs = cacheVan(_st.vid).ritten || [];
      var x = ritExport(rs, _st.labelFilter || null, literprijs(v).prijs);
      var naam = 'ritten-' + String((v && (v.naam || v.merk)) || 'voertuig').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + (_st.labelFilter ? '-' + String(_st.labelFilter).replace(/[^a-z0-9]+/gi, '-').toLowerCase() : '');
      try {
        if (soort === 'csv') { if (typeof download === 'function') download(naam + '.csv', x.csv); }
        else if (typeof plOpslaanPdf === 'function') plOpslaanPdf(naam, x.tekst, { titel: 'Ritten' + (_st.labelFilter ? ' — ' + _st.labelFilter : '') });
      } catch (e) { melding('⚠️ Exporteren mislukt: ' + e.message); console.warn('PLGarage: export', e); }
    },
    // ── Tankbeurten (#469) ──
    _tankForm: function (x) {
      if (x === null) _st.tankForm = null;
      else if (typeof x === 'string') _st.tankForm = (cacheVan(_st.vid).tanken || []).filter(function (t) { return t.id === x; })[0] || null;
      else _st.tankForm = {};
      teken();
    },
    _tankBewaar: async function (id) {
      var t = PLTank.uitFormulier(document);
      if (!t.op) { melding('⚠️ Vul in wanneer je tankte'); return; }
      if (id) t.id = id;
      try {
        // Nieuw mag later (de server ontdubbelt op het tijdstip), wijzigen niet.
        var d = id ? await api('tank_opslaan', { voertuig_id: _st.vid, tank: t }) : await schrijfOfWacht('tank_opslaan', { voertuig_id: _st.vid, tank: t });
        melding(d && d.inWachtrij ? '⛽ Offline — de tankbeurt gaat mee zodra er weer verbinding is' : '⛽ Tankbeurt bewaard');
        _st.tankForm = null; delete cacheVan(_st.vid).tanken;
      } catch (e) { melding('⚠️ ' + e.message); console.warn('PLGarage: tankbeurt bewaren', e); }
      teken();
    },
    _tankWeg: function (id) {
      if (!confirm('Deze tankbeurt wissen?')) return;
      doe(function () { return api('tank_verwijder', { id: id }); }, 'Tankbeurt gewist').then(function () { delete cacheVan(_st.vid).tanken; teken(); });
    },
    _tankExport: function () {
      var v = voertuig(_st.vid), c = cacheVan(_st.vid);
      var naam = 'tankbeurten-' + String((v && (v.naam || v.merk)) || 'voertuig').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      try { if (typeof download === 'function') download(naam + '.csv', PLTank.csv(c.tanken || [], c.ritten || [])); }
      catch (e) { melding('⚠️ Exporteren mislukt: ' + e.message); console.warn('PLGarage: tankexport', e); }
    },
    _rapportPdf: function () {
      var r = _st.rapport; if (!r) return;
      try { if (typeof plOpslaanPdf === 'function') plOpslaanPdf('rapport-' + String(r.aangemaakt).slice(0, 10), r.tekst, { titel: r.titel || 'Rapport' }); }
      catch (e) { melding('⚠️ PDF mislukt: ' + e.message); console.warn('PLGarage: pdf', e); }
    },
    _labelOpen: function (id) { _st.labelRit = id; teken(); setTimeout(function () { var el = document.getElementById('grLabel'); if (el) el.focus(); }, 30); },
    _labelFilter: function (l) { _st.labelFilter = l || null; teken(); },
    _labelBewaar: async function (id, weg) {
      var el = document.getElementById('grLabel');
      var label = weg ? '' : String((el && el.value) || '').trim().slice(0, 40);
      try {
        var d = await api('rit_label', { id: id, label: label });
        var rs = cacheVan(_st.vid).ritten || [];
        rs.forEach(function (r) { if (r.id === id) r.label = d.label || null; });
        _st.labelRit = null;
        if (_st.labelFilter && !rs.some(function (r) { return r.label === _st.labelFilter; })) _st.labelFilter = null;
        melding(d.label ? '🏷 Label bewaard' : 'Label weggehaald');
      } catch (e) { melding('⚠️ ' + e.message); console.warn('PLGarage: label', e); }
      teken();
    },
    _versnelling: function () {
      sluit();
      try { if (typeof openGearInstellingen === 'function') openGearInstellingen(); }
      catch (e) { console.warn('PLGarage: versnellingsindicator openen', e); }
    },
    _versnellingUitRitten: async function (id) {
      try {
        var rs = (await api('ritten', { voertuig_id: id, limiet: 100 })).ritten || [];
        var met = rs.filter(function (r) { return r.extra && r.extra.gear && r.extra.gear.n; }).map(function (r) { return { id: 'rit:' + r.id, h: r.extra.gear }; });
        if (!met.length) { melding('Nog geen ritten met versnellingsgegevens — die komen er vanaf nu bij elke rit bij'); return; }
        if (!confirm('Het geleerde model vervangen door wat ' + met.length + ' eerdere rit' + (met.length === 1 ? '' : 'ten') + ' lieten zien? Je correcties blijven staan.')) return;
        var r = PLGear.bouwUitRitten(met);
        melding('⚙️ Opgebouwd uit ' + r.ritten + ' ritten: ' + r.versnellingen + ' versnellingen');
      } catch (e) { melding('⚠️ ' + e.message); console.warn('PLGarage: opbouwen uit ritten', e); }
      teken();
    },
    _versnellingWis: function (id) {
      if (!confirm('De geleerde versnellingen van dit voertuig wissen en opnieuw laten leren?')) return;
      doe(async function () {
        await api('versnelling_opslaan', { voertuig_id: id, model: null });
        var v = voertuig(id); if (v) v.gear_model = null;
        var k = versnellingsVoertuig();
        if (k && k.id === id && window.PLGear) PLGear.leerOpnieuw();
      }, 'Versnellingen worden opnieuw geleerd');
    },
    _rapportWeg: function () {
      var r = _st.rapport; if (!r || !confirm('Dit rapport verwijderen?')) return;
      doe(function () { return api('rapport_verwijder', { id: r.id }); }, 'Rapport verwijderd').then(function () { delete cacheVan(_st.vid).rapporten; _st.view = 'voertuig'; _st.tab = 'rapporten'; teken(); });
    },
    // pure kern — voor test-garage.js
    _kern: { status: status, advies: advies, issueOps: issueOps, ritNieuw: ritNieuw, ritTik: ritTik, ritKlaar: ritKlaar, ritStand: ritStand,
      rdwNaarProfiel: rdwNaarProfiel, profielUitVerbinding: profielUitVerbinding, gewogenVerbruik: gewogenVerbruik, dagenTot: dagenTot, waakTekst: waakTekst,
      waakDelen: waakDelen, labelSom: labelSom, labelSuggestie: labelSuggestie, ritExport: ritExport, waakVergelijk: waakVergelijk, cfg: CFG }
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
  var _wasKlant = false, _wasWie = '', _bootKlaar = false;
  function lus() {
    try {
      var k = magPlatform();
      var item = document.getElementById('kbGarage');
      if (item) item.style.display = k ? '' : 'none';
      // Ook bij een wissel van gebruiker zonder uitloggen ertussen (beheer →
      // klant): sinds beheer ook Mijn voertuigen heeft, mogen ze allebei.
      if (k && (!_wasKlant || wie() !== _wasWie)) {
        // Een kopie van een andere klant op dit toestel: weg, vóór er iets getekend wordt.
        if (_st.stand && _st.stand.__u !== wie()) { _st.stand = null; _st.actiefId = null; schrijf(OPSLAG.stand, null); schrijf(OPSLAG.actief, null); schrijf(OPSLAG.wachtrij, null); schrijf(OPSLAG.rit, null); }
        ververs(); if (!_bootKlaar) { _bootKlaar = true; ritHerstel(); } }
      if (!k && _wasKlant) { _st.stand = null; schrijf(OPSLAG.stand, null); _st.cache = {}; tekenKaart(); gearKoppel(); }
      _wasKlant = k; _wasWie = wie();
      if (!k) return;
      ritTikNu();
      if (isVerbonden()) { if (!_st.verbondenSinds) _st.verbondenSinds = Date.now(); herkenAuto(); }
      else { _vinGezien = null; _st.verbondenSinds = 0; _selPogingen = 0; }
      gearKoppel();
      eerderHalen();
      apkMelding();
    } catch (e) { console.warn('PLGarage: lus', e); }
  }
  setInterval(lus, CFG.tikMs);
  try { document.addEventListener('DOMContentLoaded', function () { tekenKaart(); lus(); }); } catch (e) { console.warn('PLGarage: DOMContentLoaded', e); }
  try { window.addEventListener('online', function () { wachtrijLegen(); }); } catch (e) { console.warn('PLGarage: online-luisteraar', e); }
})();
