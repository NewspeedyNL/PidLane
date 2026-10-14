/* ═══════════════════════════════════════════════════════════════════
   pidlane-conditie.js — PLConditie: de conditiescore van een voertuig
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS (#475, 13-10-2026)

   De vraag van de klant: "laat zien dat mijn auto slechter gaat rijden
   als ik onderhoud uitstel". Geen grote getallen en geen alarm, maar
   een score die langzaam zakt en zegt waaróm.

   TWEE PIJLERS
     • Onderhoudsstand — uit het onderhoudslogboek (kp_voertuig.
       onderhoud_log): per onderdeel hoeveel van het interval op is, in
       km of maanden. Werkt zonder adapter.
     • Conditie — uit de ritten. De auto wordt met ZICHZELF vergeleken:
       de eerste ritten (na de laatste beurt, als dat er genoeg zijn)
       zijn de nulmeting, de laatste ritten de stand nu. Kenmerken die
       per rit in `rit.extra.cd` staan (zie tik()/samenvat()): trim bij
       warme motor, onrust stationair, opwarmtijd, ontstekings-
       vervroeging en raildruk bij belasting, laadspanning, misfires
       (alleen als de klant zelf mode 06 las). Plus het verbruik, maar
       alleen tegen ritten van dezelfde snelheidsklasse.

   EERLIJK OVER RUIS. Mediaan van vijf ritten tegen mediaan van vijf,
   een dode zone per kenmerk, en minstens drie waarden aan elke kant —
   anders zegt een kenmerk niets. Te weinig ritten = "nog N ritten
   nodig", nooit een verzonnen getal. Een kenmerk dat deze auto niet
   meet (de PID staat niet aan) telt gewoon niet mee.

   WAT HET NIET IS. Geen diagnose en geen keuring. De intervallen zijn
   algemene richtwaarden; het onderhoudsboekje van de auto gaat voor.

   PUUR. Alles behalve html() is een pure functie op gewone objecten;
   test-conditie.js laadt dit bestand met vm. html() maakt alleen tekst;
   de knoppen roepen PLGarage._cond*() aan, die met de server praten.

   Laadvolgorde: vóór pidlane-garage.js; heeft zelf niets nodig.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    nBasis: 5,            // ritten in de nulmeting
    nRecent: 5,           // ritten in "de stand nu"
    minWaarden: 3,        // per kenmerk minstens zoveel waarden aan elke kant
    ritMinKm: 3,          // korter zegt niets over de conditie
    ritMinS: 300,
    warm: 75,             // °C: vanaf hier is de motor warm genoeg voor trim, stationair, last
    koudStart: 40,        // °C bij het begin van de rit: een koude start
    opgewarmd: 80,        // °C: einde van de opwarmtijd
    koudHoogRpm: 3000,    // toeren met een koude motor (< koudGrens) belasten de olie
    koudGrens: 60,
    lastMin: 50,          // % berekende belasting (0104) voor "bij belasting"
    minTik: { tw: 15, sr: 15, vl: 5, rd: 5, lv: 10 },   // tikken van 2 s per kenmerk
    lijnMax: 40,          // punten in de scorelijn
    dalingDagen: 21,
    dalingPunten: 8,
    gewicht: { onderhoud: 35, motor: 25, brandstof: 25, accu: 15 },
    logMax: 60
  };

  // ── Het onderhoudslogboek ─────────────────────────────────────────
  // Algemene richtwaarden. olie/oliefilter volgen het interval uit het
  // profiel als dat er is, en daarna de belasting van het rijpatroon.
  var ONDERDELEN = [
    { id: 'olie', naam: 'Motorolie', km: 15000, mnd: 12, gewicht: 30 },
    { id: 'oliefilter', naam: 'Oliefilter', km: 15000, mnd: 12, gewicht: 8 },
    { id: 'luchtfilter', naam: 'Luchtfilter', km: 30000, mnd: 24, gewicht: 8 },
    { id: 'bougies', naam: 'Bougies', km: 60000, mnd: 48, gewicht: 8, niet: ['diesel', 'elektrisch'] },
    { id: 'brandstoffilter', naam: 'Brandstoffilter', km: 60000, mnd: 48, gewicht: 6, niet: ['elektrisch'] },
    { id: 'distributie', naam: 'Distributieriem', km: 120000, mnd: 72, gewicht: 20, niet: ['elektrisch'] },
    { id: 'remvloeistof', naam: 'Remvloeistof', km: null, mnd: 24, gewicht: 8 },
    { id: 'koelvloeistof', naam: 'Koelvloeistof', km: null, mnd: 60, gewicht: 4 },
    { id: 'remmen', naam: 'Remmen', km: 50000, mnd: null, gewicht: 5 },
    { id: 'accu', naam: 'Accu', km: null, mnd: 72, gewicht: 4 }
  ];
  var ONDERDEEL = {}; ONDERDELEN.forEach(function (o) { ONDERDEEL[o.id] = o; });

  // ── De kenmerken uit de ritten ────────────────────────────────────
  // soort: hoe een verandering een verlies wordt (zie verlies()).
  // dood: tot hier is het ruis; vol: hier is het hele gewicht weg.
  var KENMERKEN = [
    { id: 'tw', deel: 'brandstof', naam: 'Brandstoftrim (warm)', eenheid: '%', soort: 'abs', dood: 2, vol: 8, gewicht: 3,
      uitleg: 'De motorregeling spuit meer of minder in dan hij verwacht: valse lucht, een vuile luchtmassameter of slijtende injectoren.' },
    { id: 'verbruik', deel: 'brandstof', naam: 'Verbruik (vergelijkbare ritten)', eenheid: '%', soort: 'verbruik', dood: 4, vol: 20, gewicht: 3,
      uitleg: 'Meer brandstof voor hetzelfde soort rit: filters, bougies, bandenspanning of een sensor die verloopt.' },
    { id: 'rd', deel: 'brandstof', naam: 'Brandstofdruk bij belasting', eenheid: 'kPa', soort: 'daling_pct', dood: 5, vol: 25, gewicht: 1,
      uitleg: 'Lagere druk bij dezelfde belasting: brandstoffilter of pomp.' },
    { id: 'sr', deel: 'motor', naam: 'Onrust stationair', eenheid: 'tpm', soort: 'stijging_pct', dood: 30, vol: 150, gewicht: 2,
      uitleg: 'Het stationair toerental schommelt meer: bougies, bobines, een vuil gasklephuis of valse lucht.' },
    { id: 'vl', deel: 'motor', naam: 'Ontstekingsvervroeging bij belasting', eenheid: '°', soort: 'daling', dood: 2, vol: 8, gewicht: 2,
      uitleg: 'De klopregeling neemt vervroeging terug: koolaanslag, slechte brandstof of te warme motor.' },
    { id: 'mf', deel: 'motor', naam: 'Ontstekingsmissers (mode 06)', eenheid: '', soort: 'stijging', dood: 2, vol: 20, gewicht: 3,
      uitleg: 'Meer missers per cilinder: bougies of bobines.' },
    { id: 'ow', deel: 'motor', naam: 'Opwarmtijd', eenheid: 's', soort: 'stijging_pct', dood: 30, vol: 150, gewicht: 1,
      uitleg: 'De motor doet langer over warm worden: vaak een thermostaat die openblijft.' },
    { id: 'koel', deel: 'motor', naam: 'Hoogste koelwatertemperatuur', eenheid: '°C', soort: 'stijging', dood: 5, vol: 15, gewicht: 1,
      uitleg: 'De motor wordt warmer dan eerst: koelvloeistof, thermostaat, waterpomp of radiateur.' },
    { id: 'lv', deel: 'accu', naam: 'Laadspanning', eenheid: 'V', soort: 'daling', dood: 0.2, vol: 1.0, gewicht: 2, vloer: 13.2, vloerVol: 0.8,
      uitleg: 'De dynamo laadt minder: dynamo, spanningsregelaar of een accu die stroom blijft vragen.' }
  ];
  var KENMERK = {}; KENMERKEN.forEach(function (k) { KENMERK[k.id] = k; });
  var DELEN = [['onderhoud', 'Onderhoud'], ['motor', 'Motor'], ['brandstof', 'Brandstof'], ['accu', 'Accu']];

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function rond(x, d) { var f = Math.pow(10, d == null ? 1 : d); return Math.round(x * f) / f; }
  function klem(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function tijd(s) { var d = new Date(s); return isNaN(d) ? null : d.getTime(); }
  function mediaan(l) {
    var a = (l || []).filter(function (x) { return getal(x) !== null; }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // ════════════════════════════════════════════════════════════════
  //  PER RIT: verzamelen (tik) en samenvatten
  // ════════════════════════════════════════════════════════════════
  /* m: { kmh, rpm, koelwater, accu, stft, ltft, vervroeg, last, raildruk }
     — elk mag ontbreken. dt in seconden. Leest alleen wat er al gemeten
     wordt: geen busverkeer. */
  function tik(a, m, dt) {
    a = a || {};
    if (!(dt > 0)) return a;
    m = m || {};
    var k = getal(m.koelwater), rpm = getal(m.rpm), kmh = getal(m.kmh), last = getal(m.last);
    a.t = (a.t || 0) + dt;
    if (k !== null && a.k0 === undefined) a.k0 = k;
    if (a.k0 !== undefined && a.k0 < CFG.koudStart && a.ow === undefined && k !== null && k >= CFG.opgewarmd) a.ow = a.t;
    var warm = k !== null && k >= CFG.warm;
    var stft = getal(m.stft), ltft = getal(m.ltft);
    if (warm && (stft !== null || ltft !== null)) { a.twS = (a.twS || 0) + (stft || 0) + (ltft || 0); a.twN = (a.twN || 0) + 1; }
    if (warm && kmh !== null && kmh < 2 && rpm !== null && rpm > 300 && rpm < 1500) {
      // Welford: gemiddelde en spreiding zonder de monsters te bewaren.
      a.srN = (a.srN || 0) + 1;
      var d = rpm - (a.srM || 0);
      a.srM = (a.srM || 0) + d / a.srN;
      a.srQ = (a.srQ || 0) + d * (rpm - a.srM);
    }
    if (warm && last !== null && last >= CFG.lastMin && kmh !== null && kmh > 30 && rpm !== null && rpm >= 1500 && rpm <= 3500) {
      var vv = getal(m.vervroeg), rd = getal(m.raildruk);
      if (vv !== null) { a.vlS = (a.vlS || 0) + vv; a.vlN = (a.vlN || 0) + 1; }
      if (rd !== null) { a.rdS = (a.rdS || 0) + rd; a.rdN = (a.rdN || 0) + 1; }
    }
    var acc = getal(m.accu);
    if (acc !== null && rpm !== null && rpm > 1200) { a.lvS = (a.lvS || 0) + acc; a.lvN = (a.lvN || 0) + 1; }
    if (k !== null && k < CFG.koudGrens && rpm !== null && rpm > CFG.koudHoogRpm) a.kh = (a.kh || 0) + dt;
    return a;
  }

  /* De kenmerken van één rit, klein genoeg voor rit.extra.cd. Alleen wat
     lang genoeg gemeten is; de rest ontbreekt (en telt dan niet mee). */
  function samenvat(a) {
    if (!a) return null;
    var o = {}, n = CFG.minTik;
    if ((a.twN || 0) >= n.tw) o.tw = rond(a.twS / a.twN, 1);
    if ((a.srN || 0) >= n.sr) { o.sr = rond(Math.sqrt(a.srQ / (a.srN - 1)), 0); o.sm = rond(a.srM, 0); }
    if ((a.vlN || 0) >= n.vl) o.vl = rond(a.vlS / a.vlN, 1);
    if ((a.rdN || 0) >= n.rd) o.rd = rond(a.rdS / a.rdN, 0);
    if ((a.lvN || 0) >= n.lv) o.lv = rond(a.lvS / a.lvN, 2);
    if (a.k0 !== undefined) o.kk = a.k0 < CFG.koudStart ? 1 : 0;
    if (a.ow !== undefined) o.ow = Math.round(a.ow);
    if (a.kh) o.kh = Math.round(a.kh);
    if (getal(a.mf) !== null) o.mf = a.mf;
    return Object.keys(o).length ? o : null;
  }

  /* Ontstekingsmissers uit een mode 06-uitlezing (PLM06.scan): de som
     over de cilinders (MID A2–A9). TID 0B is het gemiddelde over de
     laatste tien cycli, 0C de huidige cyclus; 0B gaat voor. Geen
     misfire-monitor = null, niet 0. */
  function misfire(res) {
    var tests = (res && res.tests) || [], som = { 11: 0, 12: 0 }, n = { 11: 0, 12: 0 };
    tests.forEach(function (t) {
      if (!t || t.mid < 0xA2 || t.mid > 0xA9 || !(t.tid === 0x0B || t.tid === 0x0C)) return;
      var w = getal(t.ruw && t.ruw.waarde);
      if (w === null) return;
      som[t.tid] += w; n[t.tid]++;
    });
    if (n[11]) return som[11];
    if (n[12]) return som[12];
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  //  ONDERHOUD
  // ════════════════════════════════════════════════════════════════
  function logOplopend(log) {
    return (Array.isArray(log) ? log : []).filter(function (b) { return b && tijd(b.datum) !== null; })
      .slice().sort(function (a, b) { return tijd(a.datum) - tijd(b.datum); });
  }

  /* Eén beurt uit wat de klant invulde. Zelfde regels als de Worker
     (kpOnderhoudBeurt): een datum, een km-stand of niets, alleen
     bekende onderdelen, een korte notitie. */
  function beurt(w, nu) {
    w = w || {};
    var dat = String(w.datum || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dat) || tijd(dat) === null) return { fout: 'Vul de datum van de beurt in.' };
    if (tijd(dat) > (nu || Date.now()) + 864e5) return { fout: 'Die datum ligt in de toekomst.' };
    var km = w.km === '' || w.km == null ? null : Number(String(w.km).replace(/[.\s]/g, ''));
    if (km !== null && !(isFinite(km) && km >= 0 && km <= 2000000)) return { fout: 'De km-stand klopt niet.' };
    var wat = (Array.isArray(w.wat) ? w.wat : []).filter(function (x, i, l) { return ONDERDEEL[x] && l.indexOf(x) === i; });
    if (!wat.length) return { fout: 'Vink aan wat er gedaan is.' };
    var b = { datum: dat, km: km === null ? null : Math.round(km), wat: wat };
    var not = String(w.notitie || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if (not) b.notitie = not;
    return { beurt: b };
  }

  /* Het logboek met deze beurt erbij (nieuwste eerst, hoogstens logMax). */
  function logMet(log, b) {
    return logOplopend((Array.isArray(log) ? log : []).concat([b])).reverse().slice(0, CFG.logMax);
  }

  function heeftBasis(v) { return logOplopend(v && v.onderhoud_log).some(function (b) { return b.wat.indexOf('olie') >= 0; }); }

  /* De km-stand nu: de hoogste die bekend is, plus de ritten die erna
     gereden zijn. */
  function kmNu(v, ritten) {
    v = v || {};
    var km = getal(v.kmstand), op = tijd(v.kmstand_op);
    logOplopend(v.onderhoud_log).forEach(function (b) { if (getal(b.km) !== null && (km === null || b.km > km)) { km = b.km; op = tijd(b.datum); } });
    if (km === null) return null;
    if (op !== null) (ritten || []).forEach(function (r) { var s = tijd(r.start); if (s !== null && s > op && getal(r.km) !== null) km += r.km; });
    return Math.round(km);
  }
  /* De km-stand op een eerder moment: de stand nu min wat er daarna reed. */
  function kmOp(kmNuW, ritten, t) {
    if (kmNuW === null) return null;
    var km = kmNuW;
    (ritten || []).forEach(function (r) { var s = tijd(r.start); if (s !== null && s > t && getal(r.km) !== null) km -= r.km; });
    return Math.round(km);
  }

  function telt(o, v) {
    var bs = String((v && v.brandstof) || '').toLowerCase();
    if (o.niet && o.niet.some(function (x) { return bs.indexOf(x) >= 0; })) return false;
    if (o.id === 'bougies' && /diesel/.test(bs)) return false;
    if (o.id === 'distributie' && /ketting/i.test(String((v && v.distributie) || ''))) return false;
    return true;
  }

  /* 100 tot 85 % van het interval, dan zakt het naar 80 bij 100 %, en
     naar 0 bij anderhalf keer het interval. */
  function onderdeelScore(f) {
    if (f <= 0.85) return 100;
    if (f <= 1) return 100 - (f - 0.85) / 0.15 * 20;
    return Math.max(0, 80 - (f - 1) / 0.5 * 80);
  }

  /* o: { nu, km (stand op dat moment), olieFactor } */
  function onderhoudsstand(v, o) {
    v = v || {}; o = o || {};
    var nu = o.nu || Date.now(), km = getal(o.km);
    var log = logOplopend(v.onderhoud_log).filter(function (b) { return tijd(b.datum) <= nu; });
    var delen = [], som = 0, gew = 0;
    ONDERDELEN.forEach(function (od) {
      if (!telt(od, v)) return;
      var laatst = null;
      log.forEach(function (b) { if (b.wat.indexOf(od.id) >= 0) laatst = b; });
      var ikm = od.km, imnd = od.mnd;
      if (od.id === 'olie' || od.id === 'oliefilter') {
        if (getal(v.onderhoud_interval_km)) ikm = v.onderhoud_interval_km;
        if (getal(v.onderhoud_interval_mnd)) imnd = v.onderhoud_interval_mnd;
        if (ikm && getal(o.olieFactor) !== null) ikm = Math.round(ikm * o.olieFactor / 500) * 500;
      }
      var d = { id: od.id, naam: od.naam, intervalKm: ikm, intervalMnd: imnd, laatst: laatst ? laatst.datum : null };
      if (!laatst) { d.staat = 'onbekend'; delen.push(d); return; }
      var f = 0;
      if (imnd) { d.mnd = rond((nu - tijd(laatst.datum)) / (30.44 * 864e5), 1); f = Math.max(f, d.mnd / imnd); }
      if (ikm && getal(laatst.km) !== null && km !== null) { d.km = Math.max(0, km - laatst.km); f = Math.max(f, d.km / ikm); }
      // Het geplande volgende onderhoud uit het profiel telt voor de olie.
      if (od.id === 'olie' && getal(v.onderhoud_km) && km !== null && km >= v.onderhoud_km) f = Math.max(f, 1 + (km - v.onderhoud_km) / (ikm || 15000));
      if (od.id === 'olie' && v.onderhoud_datum && tijd(v.onderhoud_datum) !== null && nu > tijd(v.onderhoud_datum)) f = Math.max(f, 1 + (nu - tijd(v.onderhoud_datum)) / (30.44 * 864e5) / (imnd || 12));
      d.f = rond(f, 2);
      d.score = Math.round(onderdeelScore(f));
      d.staat = f > 1 ? 'over' : f > 0.85 ? 'bijna' : 'ok';
      som += d.score * od.gewicht; gew += od.gewicht;
      delen.push(d);
    });
    var uit = { klaar: gew > 0, delen: delen, score: gew > 0 ? Math.round(som / gew) : null, apkStaat: null };
    if (v.apk_tot && tijd(v.apk_tot) !== null) {
      var dag = Math.floor((tijd(v.apk_tot) - nu) / 864e5);
      uit.apkStaat = dag < 0 ? 'verlopen' : dag <= 30 ? 'bijna' : 'ok';
      if (dag < 0 && uit.score !== null) uit.score = Math.max(0, uit.score - 15);
    }
    return uit;
  }

  // ════════════════════════════════════════════════════════════════
  //  CONDITIE UIT DE RITTEN
  // ════════════════════════════════════════════════════════════════
  function bruikbaar(r) { return r && getal(r.km) !== null && r.km >= CFG.ritMinKm && getal(r.duur_s) !== null && r.duur_s >= CFG.ritMinS && tijd(r.start) !== null; }
  function oplopend(ritten) { return (ritten || []).filter(bruikbaar).slice().sort(function (a, b) { return tijd(a.start) - tijd(b.start); }); }
  function cd(r) { return (r && r.extra && r.extra.cd) || {}; }
  function waarde(r, id) {
    if (id === 'koel') return getal(r.max_koelwater);
    if (id === 'ow') { var c = cd(r); return c.kk ? getal(c.ow) : null; }
    return getal(cd(r)[id]);
  }
  function klasse(r) { var g = getal(r.gem_kmh); return g === null ? null : g < 40 ? 'stad' : g < 70 ? 'gemengd' : 'snelweg'; }

  /* Welke ritten zijn de nulmeting, welke de stand nu? */
  function vensters(rs, log, nu) {
    var N = CFG.nBasis, R = CFG.nRecent;
    var beurten = logOplopend(log).filter(function (b) { return tijd(b.datum) <= nu; });
    var lb = beurten.length ? beurten[beurten.length - 1] : null;
    var basis = null, bron = 'je eerste ritten';
    if (lb) {
      var na = rs.filter(function (r) { return tijd(r.start) > tijd(lb.datum); });
      if (na.length >= N + R) { basis = na.slice(0, N); bron = 'de ritten na de beurt van ' + lb.datum; }
    }
    if (!basis) basis = rs.slice(0, N);
    if (rs.length < N + R) return { klaar: false, nodig: N + R - rs.length, basis: basis, recent: [], bron: bron };
    return { klaar: true, nodig: 0, basis: basis, recent: rs.slice(-R), bron: bron };
  }

  /* Hoeveel van het gewicht van een kenmerk is weg: 0 (ruis) tot 1. */
  function verlies(k, b, r) {
    if (b === null || r === null) return null;
    var d;
    if (k.soort === 'abs') d = Math.abs(r) - Math.abs(b);
    else if (k.soort === 'stijging') d = r - b;
    else if (k.soort === 'daling') d = b - r;
    else if (k.soort === 'stijging_pct') { if (!(b > 0)) return null; d = (r / b - 1) * 100; }
    else if (k.soort === 'daling_pct') { if (!(b > 0)) return null; d = (1 - r / b) * 100; }
    else return null;
    var l = klem((d - k.dood) / (k.vol - k.dood), 0, 1);
    if (k.vloer && r < k.vloer) l = Math.max(l, klem((k.vloer - r) / k.vloerVol, 0, 1));
    return { d: d, verlies: l };
  }

  /* Verbruik alleen tegen ritten van dezelfde snelheidsklasse: een week
     file is geen slijtage. Per klasse met ≥ 2 ritten aan elke kant de
     verhouding van de medianen, gewogen naar de recente ritten. */
  function verbruikVerschil(basis, recent) {
    var per = {};
    var zet = function (lijst, kant) {
      lijst.forEach(function (r) { var k = klasse(r), l = getal(r.verbruik_l100); if (!k || l === null || l <= 0) return; ((per[k] = per[k] || { b: [], r: [] })[kant]).push(l); });
    };
    zet(basis, 'b'); zet(recent, 'r');
    var som = 0, n = 0, bl = 0;
    Object.keys(per).forEach(function (k) {
      var p = per[k];
      if (p.b.length < 2 || p.r.length < 2) return;
      var mb = mediaan(p.b), mr = mediaan(p.r);
      som += (mr / mb - 1) * 100 * p.r.length; bl += mb * p.r.length; n += p.r.length;
    });
    return n ? { pct: som / n, basisL100: bl / n, n: n } : null;
  }

  function conditie(ritten, v, nu) {
    var rs = oplopend(ritten);
    var vs = vensters(rs, v && v.onderhoud_log, nu);
    var uit = { klaar: vs.klaar, nodig: vs.nodig, bron: vs.bron, ritten: rs.length, kenmerken: [], deel: {} };
    if (!vs.klaar) return uit;
    KENMERKEN.forEach(function (k) {
      var x = { id: k.id, naam: k.naam, deel: k.deel, eenheid: k.eenheid, uitleg: k.uitleg, gewicht: k.gewicht };
      if (k.soort === 'verbruik') {
        var vv = verbruikVerschil(vs.basis, vs.recent);
        if (!vv) return;
        x.basis = rond(vv.basisL100, 1); x.nu = rond(vv.basisL100 * (1 + vv.pct / 100), 1); x.d = rond(vv.pct, 1);
        x.verlies = klem((vv.pct - k.dood) / (k.vol - k.dood), 0, 1);
      } else {
        var b = vs.basis.map(function (r) { return waarde(r, k.id); }).filter(function (w) { return w !== null; });
        var r = vs.recent.map(function (rr) { return waarde(rr, k.id); }).filter(function (w) { return w !== null; });
        if (b.length < CFG.minWaarden || r.length < CFG.minWaarden) return;
        var l = verlies(k, mediaan(b), mediaan(r));
        if (!l) return;
        x.basis = rond(mediaan(b), 2); x.nu = rond(mediaan(r), 2); x.d = rond(l.d, 1); x.verlies = l.verlies;
      }
      uit.kenmerken.push(x);
    });
    // De accu in rust telt zonder nulmeting: onder 12,5 V is hij niet vol.
    var rust = getal(v && v.gezondheid && v.gezondheid.accuRust);
    if (rust !== null) uit.kenmerken.push({ id: 'rust', naam: 'Accu in rust', deel: 'accu', eenheid: 'V', gewicht: 1, nu: rond(rust, 2), basis: null,
      verlies: klem((12.5 - rust) / 0.5, 0, 1), uitleg: 'Een volle accu staat in rust op 12,6 V of meer. Lager: hij wordt niet meer vol geladen, of loopt leeg als de auto stilstaat.' });
    ['motor', 'brandstof', 'accu'].forEach(function (dl) {
      var ks = uit.kenmerken.filter(function (k) { return k.deel === dl; });
      if (!ks.length) { uit.deel[dl] = null; return; }
      var g = ks.reduce(function (a, k) { return a + k.gewicht; }, 0);
      uit.deel[dl] = Math.round(100 - ks.reduce(function (a, k) { return a + k.verlies * k.gewicht; }, 0) / g * 100);
    });
    return uit;
  }

  // ════════════════════════════════════════════════════════════════
  //  BELASTING VOOR DE OLIE
  // ════════════════════════════════════════════════════════════════
  /* Koude starts met korte ritten, veel stationair en hoge toeren met een
     koude motor verkorten de levensduur van de olie. Een factor op het
     interval: 1 = normaal, 0,6 = het kortst. Over de ritten sinds de
     laatste olie, anders de laatste dertig. */
  function olieBelasting(ritten, log) {
    var lo = logOplopend(log).filter(function (b) { return b.wat.indexOf('olie') >= 0; });
    var sinds = lo.length ? tijd(lo[lo.length - 1].datum) : null;
    var rs = (ritten || []).filter(function (r) { return tijd(r.start) !== null && getal(r.km) !== null && (sinds === null || tijd(r.start) > sinds); })
      .sort(function (a, b) { return tijd(a.start) - tijd(b.start); });
    if (sinds === null) rs = rs.slice(-30);
    if (rs.length < 5) return { factor: 1, n: rs.length, redenen: [], bekend: false };
    var n = rs.length, kort = 0, koudKort = 0, s = 0, kh = 0, stat = 0, statS = 0;
    rs.forEach(function (r) {
      var c = cd(r), dur = getal(r.duur_s) || 0;
      if (r.km < 8) { kort++; if (c.kk) koudKort++; }
      s += dur; kh += getal(c.kh) || 0;
      if (getal(r.stationair_pct) !== null) { stat += r.stationair_pct * dur; statS += dur; }
    });
    var aKort = kort / n, aKoud = koudKort / n, aKh = s ? kh / s : 0, aStat = statS ? stat / statS : 0;
    var bel = 0.5 * aKoud + 0.3 * aKort + Math.min(0.3, aKh * 10) + Math.max(0, (aStat - 15) / 100);
    var redenen = [];
    if (aKoud >= 0.25) redenen.push(Math.round(aKoud * 100) + ' % van je ritten is een korte rit met een koude motor');
    else if (aKort >= 0.4) redenen.push(Math.round(aKort * 100) + ' % van je ritten is korter dan 8 km');
    if (aKh >= 0.01) redenen.push('je geeft regelmatig hoge toeren terwijl de motor nog koud is');
    if (aStat >= 25) redenen.push('de motor staat ' + Math.round(aStat) + ' % van de tijd stationair te draaien');
    return { factor: rond(klem(1 - bel * 0.5, 0.6, 1), 2), n: n, redenen: redenen, bekend: true };
  }

  // ════════════════════════════════════════════════════════════════
  //  SAMEN: de score
  // ════════════════════════════════════════════════════════════════
  function totaal(deel) {
    var som = 0, g = 0;
    Object.keys(CFG.gewicht).forEach(function (k) { if (getal(deel[k]) !== null) { som += deel[k] * CFG.gewicht[k]; g += CFG.gewicht[k]; } });
    return g ? Math.round(som / g) : null;
  }

  /* Eén moment: de score met wat er tot `nu` bekend was. */
  function opMoment(v, ritten, nu, kmNuW) {
    var tot = (ritten || []).filter(function (r) { var s = tijd(r.start); return s !== null && s <= nu; });
    // Alleen de beurten die er toen al waren: de lijn mag niet terugkijken.
    v = Object.assign({}, v || {}, { onderhoud_log: logOplopend(v && v.onderhoud_log).filter(function (b) { return tijd(b.datum) <= nu; }) });
    var olie = olieBelasting(tot, v && v.onderhoud_log);
    var od = onderhoudsstand(v, { nu: nu, km: kmOp(kmNuW, ritten, nu), olieFactor: olie.bekend ? olie.factor : null });
    var cn = conditie(tot, v, nu);
    var deel = { onderhoud: od.score, motor: cn.deel.motor, brandstof: cn.deel.brandstof, accu: cn.deel.accu };
    return { onderhoud: od, conditie: cn, olie: olie, deel: deel, score: totaal(deel) };
  }

  /* Waar komt het verlies vandaan? Kenmerken en onderdelen samen, het
     zwaarste eerst, met wat het kost in punten van het eindcijfer. */
  function oorzaken(m) {
    var uit = [];
    var gTot = 0; Object.keys(CFG.gewicht).forEach(function (k) { if (getal(m.deel[k]) !== null) gTot += CFG.gewicht[k]; });
    if (!gTot) return uit;
    ['motor', 'brandstof', 'accu'].forEach(function (dl) {
      var ks = m.conditie.kenmerken.filter(function (k) { return k.deel === dl; });
      var g = ks.reduce(function (a, k) { return a + k.gewicht; }, 0);
      ks.forEach(function (k) {
        if (!(k.verlies > 0)) return;
        uit.push({ soort: 'kenmerk', id: k.id, naam: k.naam, punten: rond(k.verlies * k.gewicht / g * 100 * CFG.gewicht[dl] / gTot, 1),
          tekst: tekstKenmerk(k), uitleg: k.uitleg });
      });
    });
    var od = m.onderhoud, og = 0;
    ONDERDELEN.forEach(function (o) { if (od.delen.some(function (d) { return d.id === o.id && d.score != null; })) og += o.gewicht; });
    od.delen.forEach(function (d) {
      if (d.score == null || d.score >= 100) return;
      uit.push({ soort: 'onderhoud', id: d.id, naam: d.naam, punten: rond((100 - d.score) * ONDERDEEL[d.id].gewicht / og * CFG.gewicht.onderhoud / gTot, 1),
        tekst: tekstOnderdeel(d), uitleg: d.staat === 'over' ? 'Over het interval. Hoe langer, hoe meer slijtage — en het gaat vaak eerst ten koste van het verbruik.' : 'Bijna aan de beurt.' });
    });
    if (od.apkStaat === 'verlopen') uit.push({ soort: 'apk', id: 'apk', naam: 'APK', punten: rond(15 * CFG.gewicht.onderhoud / gTot, 1), tekst: 'De APK is verlopen.', uitleg: 'Zonder geldige APK mag je niet de weg op.' });
    return uit.sort(function (a, b) { return b.punten - a.punten; });
  }

  function nl(x, d) { return getal(x) === null ? '—' : rond(x, d == null ? 1 : d).toLocaleString('nl', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 1 : d }); }
  function tekstKenmerk(k) {
    if (k.id === 'verbruik') return 'Verbruik op vergelijkbare ritten ' + (k.d > 0 ? '+' : '') + nl(k.d, 1) + ' % (' + nl(k.basis, 1) + ' → ' + nl(k.nu, 1) + ' l/100 km)';
    if (k.id === 'rust') return 'Accu in rust ' + nl(k.nu, 2) + ' V';
    var e = k.eenheid ? ' ' + k.eenheid : '';
    var w = function (x) { return k.id === 'tw' ? (x > 0 ? '+' : '') + nl(x, 1) + ' %' : k.id === 'ow' ? nl(x / 60, 1) + ' min' : nl(x, k.id === 'lv' ? 2 : k.id === 'sr' || k.id === 'rd' || k.id === 'mf' ? 0 : 1) + e; };
    return k.naam + ': ' + w(k.basis) + ' → ' + w(k.nu);
  }
  function tekstOnderdeel(d) {
    var w = [];
    if (d.km != null && d.intervalKm) w.push(nl(d.km, 0) + ' van ' + nl(d.intervalKm, 0) + ' km');
    if (d.mnd != null && d.intervalMnd) w.push(nl(d.mnd, 0) + ' van ' + d.intervalMnd + ' maanden');
    return d.naam + (d.staat === 'over' ? ' over tijd' : ' bijna aan de beurt') + (w.length ? ' (' + w.join(', ') + ')' : '');
  }

  /* Wat leverde de laatste beurt op? Mediaan van tot vijf ritten ervóór
     tegen tot vijf erna, per kenmerk; alleen wat buiten de dode zone
     bewoog. */
  function effect(ritten, log) {
    var lb = logOplopend(log); lb = lb.length ? lb[lb.length - 1] : null;
    if (!lb) return null;
    var t = tijd(lb.datum), rs = oplopend(ritten);
    var voor = rs.filter(function (r) { return tijd(r.start) <= t; }).slice(-CFG.nRecent);
    var na = rs.filter(function (r) { return tijd(r.start) > t; }).slice(0, CFG.nBasis);
    var uit = { beurt: lb, voor: voor.length, na: na.length, veranderd: [] };
    if (voor.length < CFG.minWaarden || na.length < CFG.minWaarden) return uit;
    KENMERKEN.forEach(function (k) {
      if (k.soort === 'verbruik') {
        var vv = verbruikVerschil(voor, na);
        if (vv && Math.abs(vv.pct) > k.dood) uit.veranderd.push({ id: k.id, naam: k.naam, beter: vv.pct < 0, tekst: 'Verbruik op vergelijkbare ritten ' + (vv.pct > 0 ? '+' : '') + nl(vv.pct, 1) + ' %' });
        return;
      }
      var b = voor.map(function (r) { return waarde(r, k.id); }).filter(function (w) { return w !== null; });
      var a = na.map(function (r) { return waarde(r, k.id); }).filter(function (w) { return w !== null; });
      if (b.length < CFG.minWaarden || a.length < CFG.minWaarden) return;
      var l = verlies(Object.assign({}, k, { vloer: null }), mediaan(b), mediaan(a));
      if (!l || Math.abs(l.d) <= k.dood) return;
      uit.veranderd.push({ id: k.id, naam: k.naam, beter: l.d < 0, tekst: tekstKenmerk({ id: k.id, naam: k.naam, eenheid: k.eenheid, basis: mediaan(b), nu: mediaan(a) }) });
    });
    return uit;
  }

  /* Wat kost het meerverbruik per jaar? Extra l/100 km × km per jaar (uit
     de ritten van de laatste 90 dagen, minstens twee weken gemeten) ×
     literprijs. */
  function kosten(m, ritten, prijs, nu) {
    var k = m.conditie.kenmerken.filter(function (x) { return x.id === 'verbruik'; })[0];
    if (!k || !(k.d > KENMERK.verbruik.dood) || !(prijs > 0)) return null;
    var van = nu - 90 * 864e5, km = 0, eerst = null;
    (ritten || []).forEach(function (r) { var s = tijd(r.start); if (s !== null && s >= van && s <= nu && getal(r.km) !== null) { km += r.km; if (eerst === null || s < eerst) eerst = s; } });
    if (eerst === null || nu - eerst < 14 * 864e5) return null;
    var kmJaar = km / ((nu - eerst) / 864e5) * 365;
    var extraL = (k.nu - k.basis) / 100 * kmJaar;
    return { euroJaar: Math.round(extraL * prijs), literJaar: Math.round(extraL), kmJaar: Math.round(kmJaar / 100) * 100, pct: k.d };
  }

  /* De score door de tijd: één punt per bruikbare rit (de laatste
     lijnMax), elk met alleen wat er toen bekend was. */
  function lijn(v, ritten, nu) {
    var rs = oplopend(ritten), kn = kmNu(v, ritten);
    var momenten = rs.slice(-CFG.lijnMax).map(function (r) { return tijd(r.start) + 1; });
    if (!momenten.length || momenten[momenten.length - 1] < nu) momenten.push(nu);
    return momenten.map(function (t) { var m = opMoment(v, ritten, t, kn); return { t: t, score: m.score }; })
      .filter(function (p) { return p.score !== null; });
  }

  /* Zakte de score de laatste weken duidelijk? Vergelijkt het hoogste
     punt van de laatste dalingDagen met het laatste. */
  function daling(l) {
    if (!l || l.length < 2) return null;
    var laatst = l[l.length - 1], van = laatst.t - CFG.dalingDagen * 864e5, hoog = null;
    l.forEach(function (p) { if (p.t >= van && p.t < laatst.t && (hoog === null || p.score > hoog.score)) hoog = p; });
    if (!hoog || hoog.score - laatst.score < CFG.dalingPunten) return null;
    return { van: hoog.score, naar: laatst.score, sinds: hoog.t };
  }

  /* Melden of niet. `gemeld` is de score waarbij we de vorige keer
     meldden (of null). Eén melding per daling; komt de score terug boven
     wat we meldden, dan mag de volgende daling weer. */
  function meldBesluit(dal, gemeld, score) {
    if (getal(score) === null) return { meld: false, gemeld: gemeld };
    if (getal(gemeld) !== null && score > gemeld) gemeld = null;
    if (!dal) return { meld: false, gemeld: gemeld };
    if (getal(gemeld) !== null && score > gemeld - CFG.dalingPunten) return { meld: false, gemeld: gemeld };
    return { meld: true, gemeld: score };
  }

  /* Alles voor één voertuig. o: { nu, prijs } */
  function beoordeel(v, ritten, o) {
    o = o || {};
    var nu = o.nu || Date.now();
    var m = opMoment(v, ritten, nu, kmNu(v, ritten));
    m.basis = heeftBasis(v);
    m.kmNu = kmNu(v, ritten);
    m.oorzaken = oorzaken(m);
    m.effect = effect(ritten, v && v.onderhoud_log);
    m.kosten = kosten(m, ritten, o.prijs, nu);
    m.lijn = lijn(v, ritten, nu);
    m.daling = daling(m.lijn);
    return m;
  }

  function oordeel(s) { return s === null ? '' : s >= 85 ? 'goed' : s >= 70 ? 'redelijk' : s >= 50 ? 'aandacht' : 'slecht'; }

  /* Het gezondheidspaspoort als tekst: voor de PDF en voor bij verkoop. */
  function paspoort(v, m) {
    v = v || {};
    var r = ['PidLane — Gezondheidspaspoort', (v.naam || '') + (v.merk ? ' · ' + [v.merk, v.model, v.bouwjaar].filter(Boolean).join(' ') : ''), ''];
    r.push('Conditiescore: ' + (m.score === null ? 'nog niet bekend' : m.score + ' / 100 (' + oordeel(m.score) + ')'));
    DELEN.forEach(function (d) { r.push('  ' + d[1] + ': ' + (getal(m.deel[d[0]]) === null ? '—' : m.deel[d[0]])); });
    if (!m.conditie.klaar) r.push('  (de meting uit de ritten heeft nog ' + m.conditie.nodig + ' rit' + (m.conditie.nodig === 1 ? '' : 'ten') + ' nodig)');
    if (m.kmNu !== null) r.push('Kilometerstand: ' + nl(m.kmNu, 0) + ' km');
    if (m.lijn.length >= 2) {
      r.push('', 'Verloop');
      var per = {};
      m.lijn.forEach(function (p) { per[new Date(p.t).toISOString().slice(0, 7)] = p.score; });
      Object.keys(per).sort().forEach(function (k) { r.push('  ' + k + ': ' + per[k]); });
    }
    var log = logOplopend(v.onderhoud_log).reverse();
    r.push('', 'Onderhoudslogboek (' + log.length + ')');
    log.forEach(function (b) {
      r.push('  ' + b.datum + (b.km != null ? ' · ' + nl(b.km, 0) + ' km' : '') + ' · ' + b.wat.map(function (w) { return ONDERDEEL[w].naam.toLowerCase(); }).join(', ') + (b.notitie ? ' · ' + b.notitie : ''));
    });
    if (!log.length) r.push('  (leeg)');
    if (m.oorzaken.length) { r.push('', 'Aandachtspunten'); m.oorzaken.slice(0, 6).forEach(function (x) { r.push('  • ' + x.tekst); }); }
    r.push('', 'De score vergelijkt deze auto met zichzelf over de tijd; het is geen keuring. Intervallen zijn algemene richtwaarden — het onderhoudsboekje gaat voor.');
    return r.join('\n');
  }

  // ════════════════════════════════════════════════════════════════
  //  HET SCHERM (tabblad Conditie in Mijn voertuigen)
  // ════════════════════════════════════════════════════════════════
  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  function kleur(s) { return s === null ? '' : s >= 85 ? 'groen' : s >= 70 ? 'oranje' : 'rood'; }

  function vinkjes(v, aan) {
    return '<div class="gr-labels">' + ONDERDELEN.filter(function (o) { return telt(o, v); }).map(function (o) {
      return '<label class="gr-lab"><input type="checkbox" name="cdWat" value="' + o.id + '"' + (aan.indexOf(o.id) >= 0 ? ' checked' : '') + '> ' + esc(o.naam) + '</label>';
    }).join('') + '</div>';
  }

  /* De basis: zonder één beurt met olie is er geen onderhoudsstand. Eén
     kort formulier, de rest kan later. */
  function basisHtml(v, fout) {
    var vandaag = new Date().toISOString().slice(0, 10);
    return '<div class="gr-blok"><div class="gr-bh">📊 Conditiescore starten</div>' +
      '<div class="gr-klein">Eén keer invullen: wanneer was de laatste beurt? Daarna houdt de app de score zelf bij uit je ritten. Je hoeft niets bij te houden; een nieuwe beurt voeg je toe wanneer je wilt.</div>' +
      (v.onderhoud_laatst ? '<div class="gr-klein" style="margin-top:6px">Eerder genoteerd: <b>' + esc(v.onderhoud_laatst) + '</b></div>' : '') +
      '<div class="gr-2"><label class="gr-veld">Datum laatste beurt<input id="cd_datum" type="date" max="' + vandaag + '"></label>' +
      '<label class="gr-veld">Km-stand toen<input id="cd_km" type="number" min="0" value="' + esc(v.kmstand != null ? v.kmstand : '') + '"></label></div>' +
      '<div class="gr-klein">Wat is er toen gedaan?</div>' + vinkjes(v, ['olie', 'oliefilter']) +
      '<div class="gr-2"><label class="gr-veld">Interval (km)<input id="cd_ikm" type="number" min="1000" max="100000" value="' + esc(v.onderhoud_interval_km || 15000) + '"></label>' +
      '<label class="gr-veld">of (maanden)<input id="cd_imnd" type="number" min="1" max="60" value="' + esc(v.onderhoud_interval_mnd || 12) + '"></label></div>' +
      '<div class="gr-klein">Staat in je onderhoudsboekje; 15.000 km of 12 maanden is een gangbare richtwaarde.</div>' +
      (fout ? '<div class="gr-melding rood">' + esc(fout) + '</div>' : '') +
      '<div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._condStart()">Start</button></div></div>';
  }

  function beurtFormHtml(v, fout) {
    return '<div class="gr-blok"><div class="gr-bh">🔧 Beurt toevoegen</div>' +
      '<div class="gr-2"><label class="gr-veld">Datum<input id="cd_datum" type="date" max="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<label class="gr-veld">Km-stand<input id="cd_km" type="number" min="0" value="' + esc(v.kmstand != null ? v.kmstand : '') + '"></label></div>' +
      vinkjes(v, ['olie', 'oliefilter']) +
      '<label class="gr-veld">Notitie<input id="cd_notitie" type="text" maxlength="80" placeholder="bv. garage, olie 5W-30"></label>' +
      (fout ? '<div class="gr-melding rood">' + esc(fout) + '</div>' : '') +
      '<div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._condBeurt()">Bewaren</button><button class="gr-k" onclick="PLGarage._condForm(false)">Annuleren</button></div></div>';
  }

  function lijnSvg(l) {
    if (!l || l.length < 2) return '';
    var w = 300, h = 60, t0 = l[0].t, t1 = l[l.length - 1].t, dt = (t1 - t0) || 1;
    var x = function (t) { return rond((t - t0) / dt * (w - 8) + 4, 1); }, y = function (s) { return rond(h - 4 - s / 100 * (h - 8), 1); };
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img" aria-label="Verloop van de score">' +
      '<line x1="4" x2="' + (w - 4) + '" y1="' + y(70) + '" y2="' + y(70) + '" stroke="currentColor" stroke-opacity=".2" stroke-dasharray="3 3"/>' +
      '<polyline fill="none" stroke="currentColor" stroke-width="2" points="' + l.map(function (p) { return x(p.t) + ',' + y(p.score); }).join(' ') + '"/></svg>';
  }

  /* st: { ritten (null = laden), form, fout, prijs, nu } */
  function html(v, st) {
    st = st || {};
    v = v || {};
    if (!heeftBasis(v)) return basisHtml(v, st.fout);
    if (!st.ritten) return '<div class="gr-klein">⏳</div>';
    var m = beoordeel(v, st.ritten, { nu: st.nu, prijs: st.prijs });
    var h = '<div class="gr-blok"><div class="gr-bh"><span class="gr-dot ' + kleur(m.score) + '"></span> Conditiescore<span class="gr-r">' + (m.score === null ? '—' : '<b style="font-size:1.4em">' + m.score + '</b> / 100') + '</span></div>' +
      '<div class="gr-rij">' + DELEN.map(function (d) { var s = m.deel[d[0]]; return '<div>' + d[1] + '</div><div><b>' + (getal(s) === null ? '—' : s) + '</b></div>'; }).join('') + '</div>' +
      (!m.conditie.klaar ? '<div class="gr-klein" style="margin-top:6px">De meting uit je ritten start na ' + m.conditie.nodig + ' rit' + (m.conditie.nodig === 1 ? '' : 'ten') + ' van minstens ' + CFG.ritMinKm + ' km. Tot die tijd telt alleen het onderhoud.</div>'
        : '<div class="gr-klein" style="margin-top:6px">Je laatste ' + CFG.nRecent + ' ritten tegen ' + esc(m.conditie.bron) + '.</div>') + lijnSvg(m.lijn) + '</div>';
    if (m.oorzaken.length) h += '<details class="gr-blok"><summary class="gr-bh">Waarom deze score (' + m.oorzaken.length + ')</summary>' + m.oorzaken.map(function (x) {
      return '<div class="gr-item"><b>' + esc(x.tekst) + '</b> <span class="gr-klein">−' + nl(x.punten, 1) + '</span><div class="gr-klein">' + esc(x.uitleg) + '</div></div>';
    }).join('') + '</details>';
    if (m.kosten) h += '<div class="gr-blok"><div class="gr-klein">💶 Het meerverbruik kost je bij ' + nl(m.kosten.kmJaar, 0) + ' km per jaar ongeveer <b>€ ' + nl(m.kosten.euroJaar, 0) + ' per jaar</b> (' + nl(m.kosten.literJaar, 0) + ' liter).</div></div>';
    if (m.effect && m.effect.veranderd.length) h += '<div class="gr-blok"><div class="gr-bh">Wat de beurt van ' + esc(m.effect.beurt.datum) + ' opleverde</div>' + m.effect.veranderd.map(function (x) {
      return '<div class="gr-punt">' + (x.beter ? '✓ ' : '• ') + esc(x.tekst) + '</div>';
    }).join('') + '</div>';
    else if (m.effect && (m.effect.na < CFG.minWaarden)) h += '<div class="gr-klein" style="margin:6px 0">Wat de laatste beurt opleverde, zie je na ' + (CFG.minWaarden - m.effect.na) + ' rit' + (CFG.minWaarden - m.effect.na === 1 ? '' : 'ten') + '.</div>';
    if (m.olie.bekend && m.olie.factor < 0.95) {
      var ol = m.onderhoud.delen.filter(function (d) { return d.id === 'olie'; })[0];
      h += '<div class="gr-blok"><div class="gr-klein">🛢 Je rijpatroon is zwaar voor de olie: ' + esc(m.olie.redenen.join('; ') || 'veel korte, koude ritten') + '. Ververs liever na ongeveer <b>' + nl(ol && ol.intervalKm, 0) + ' km</b>.</div></div>';
    }
    var log = logOplopend(v.onderhoud_log).reverse();   // dezelfde volgorde als PLGarage._condWeg(i)
    h += st.form ? beurtFormHtml(v, st.fout) : '';
    h += '<details class="gr-blok"' + (st.logOpen ? ' open' : '') + '><summary class="gr-bh">Onderhoud (' + log.length + ')</summary>' +
      m.onderhoud.delen.map(function (d) {
        return '<div class="gr-punt' + (d.staat === 'over' ? ' oranje' : '') + '">' + esc(d.naam) + ': ' + (d.staat === 'onbekend' ? '<span class="gr-klein">niet ingevuld</span>' :
          esc([d.laatst, d.km != null ? nl(d.km, 0) + ' km geleden' : null].filter(Boolean).join(' · ')) + (d.staat === 'over' ? ' — over tijd' : d.staat === 'bijna' ? ' — bijna' : '')) + '</div>';
      }).join('') +
      '<div class="gr-sec">Logboek</div>' + log.map(function (b, i) {
        return '<div class="gr-item"><b>' + esc(b.datum) + '</b>' + (b.km != null ? ' · ' + nl(b.km, 0) + ' km' : '') + '<div class="gr-klein">' +
          esc(b.wat.map(function (w) { return ONDERDEEL[w].naam; }).join(', ')) + (b.notitie ? ' · ' + esc(b.notitie) : '') + '</div>' +
          '<div class="gr-knoppen"><button class="gr-k klein gevaar" onclick="PLGarage._condWeg(' + i + ')">Wissen</button></div></div>';
      }).join('') + '</details>';
    h += '<div class="gr-knoppen">' + (st.form ? '' : '<button class="gr-k" onclick="PLGarage._condForm(true)">🔧 Beurt toevoegen</button>') +
      '<button class="gr-k klein" onclick="PLGarage._condPaspoort()">📕 Gezondheidspaspoort</button></div>';
    h += '<div class="gr-klein">Deze score vergelijkt je auto met zichzelf; het is geen keuring. Intervallen zijn richtwaarden — je onderhoudsboekje gaat voor.</div>';
    return h;
  }

  window.PLConditie = {
    CFG: CFG, ONDERDELEN: ONDERDELEN, KENMERKEN: KENMERKEN,
    tik: tik, samenvat: samenvat, misfire: misfire,
    beurt: beurt, logMet: logMet, heeftBasis: heeftBasis, kmNu: kmNu,
    onderhoudsstand: onderhoudsstand, conditie: conditie, olieBelasting: olieBelasting,
    beoordeel: beoordeel, effect: effect, kosten: kosten, lijn: lijn, daling: daling, meldBesluit: meldBesluit,
    paspoort: paspoort, oordeel: oordeel, html: html, mediaan: mediaan, verlies: verlies,
    logboek: function (log) { return logOplopend(log).reverse(); }
  };
})();
