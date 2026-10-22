// ═════════════════════════════════════════════════════════════════
// pidlane-kenmerk.js — PLKenmerk: geldt deze regel voor DÉZE auto? (#532)
// ─────────────────────────────────────────────────────────────────
// DE DERDE POORT. PIDLANE-CONTRACT.md ontwerpt er twee: is de waarde echt,
// en is de meting compleet. De derde ontbrak: een waarde kan kloppen en de
// meting compleet zijn, terwijl de REGEL uitgaat van een andere auto. 12,8 V
// is "dynamo" op een auto zonder laadregeling en normaal op een Mazda die
// slim laadt (#531); 108 °C is "te heet" met een vaste thermostaat en
// gewoon bij VAG/BMW met een kenveldthermostaat.
//
// HET MODEL KOMT VAN OBD ZELF. Een boordmonitor kent drie standen —
// geslaagd, fout, niet klaar — en heeft INSCHAKELVOORWAARDEN: zolang die
// niet gehaald zijn is de uitkomst "niet klaar", nooit "fout". Hier heet
// dat een voorwaarde op een KENMERK van de auto.
//
// DRIE BESLUITEN (#532, 16-10-2026):
//   1. Alleen BEWEZEN beslist volledig. WAARSCHIJNLIJK mag een fout
//      afzwakken tot "let op", nooit ophogen en nooit wegpoetsen.
//      Harde grenzen (onder 12,2 V laden, boven 112 °C koelwater) gaan
//      nooit door de poort: die zijn op elke auto fout.
//   2. Meten gaat vóór vragen. Wat niet te meten is (LPG, CVT, kenveld)
//      vraagt de app hoogstens één keer per auto, via PLWaarneming.
//   3. Het ontwerp staat als derde laag in PIDLANE-CONTRACT.md (§11).
//
// EEN KENMERK heeft een waarde (true/false/null) en een zekerheid
// ('bewezen' | 'waarschijnlijk' | null) met de bron erbij. Bewezen: een
// meting (de auto vraagt een laadspanning, boost gezien, breedband-PID),
// het RDW/profiel, of een mens. Waarschijnlijk: bouwjaar of merk.
//
// EEN VOORWAARDE is { kenmerk: waarde } of { kenmerk: { is, gangbaar } }.
// `gangbaar: true` zegt: als er NIETS bekend is, geldt het gewone geval (LPG
// en CVT zijn uitzonderingen; een regel zwijgen voor elke auto omdat niemand
// LPG heeft uitgesloten maakt de app nutteloos). Een aanwijzing voor het
// tegendeel maakt hem wél onbeslist, bewijs zet hem uit.
//
// geldt() geeft:  'geldt' | 'waarschijnlijk' | 'onbekend' | 'geldt_niet'
// toepassen(ruw, g):  fout → fout | let op | onbeslist | null
//
// Wat onbeslist is, wordt GENOTEERD (noteer) en gaat als eigen blok naar
// de AI met de instructie daar niets over te concluderen; in het venster
// van de bevindingen staat het met een vraag erbij als die er is.
//
// Puur en getoetst in test-kenmerk.js: profiel, geldt, toepassen,
// laadspanning, koelwater, promptBlok. Het live deel leest vehicleInfo,
// supportedPIDs, PLGate, PLEigen, PLGarage en PLWaarneming — elk met een
// eigen terugval en een waarschuwing, nooit stil.
// ═════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Merken die hun motoren bewust op 105–112 °C laten draaien
  // (kenveldthermostaat). Zelfde lijst als de aanpassing van ECT_HOOG op
  // 04-10-2026; Mercedes wisselt per motor en staat er dus niet in.
  var KENVELD_MERK = /^(volkswagen|vw|audi|skoda|škoda|seat|cupra|bmw|mini)\b/;
  var ECVT_MERK = /^(toyota|lexus|ford|suzuki)\b/;
  var BREEDBAND = ['0124', '0125', '0126', '0127', '0128', '0129', '012A', '012B', '0134', '0135', '0136', '0137', '0138', '0139', '013A', '013B'];

  var NAAM = {
    slimladen: 'gestuurde laadregeling (slim laden)',
    kenveldthermostaat: 'kenveldthermostaat (motor bewust 105–112 °C)',
    turbo: 'turbo',
    diesel: 'dieselmotor',
    hybride: 'hybride aandrijving',
    lpg: 'LPG-installatie',
    cvt: 'traploze automaat (CVT)',
    breedband_b1s1: 'breedbandsonde vóór de katalysator'
  };
  // Wat een mens kan beantwoorden; de rest is te meten of staat in RDW/profiel.
  var VRAAG = {
    lpg: 'Rijdt deze auto (ook) op LPG?',
    cvt: 'Heeft deze auto een traploze automaat (CVT)?',
    kenveldthermostaat: 'Draait de motor normaal rond 105–110 °C (fabrieksopgave)?',
    slimladen: 'Heeft deze auto een slimme laadregeling (accusensor op de minpool, start/stop)?'
  };

  function k(waarde, zeker, bron) { return { waarde: waarde, zeker: zeker, bron: bron }; }
  var ONBEKEND = k(null, null, 'niets bekend');

  /* De bron, als een puur object:
     { merk, jaar, brandstof ('benzine'|'diesel'|'hybride'|'elektrisch'|'lpg'|…),
       transmissie, turboProfiel ('ja'|'nee'|''), turboGezien, supported:[pid],
       laadGevraagd (de auto gaf een gevraagde laadspanning), mens:{id:true|false} }
     `mens` zijn antwoorden en waarnemingen uit PLWaarneming. */
  function profiel(b) {
    b = b || {};
    var mens = b.mens || {};
    var merk = String(b.merk || '').toLowerCase().trim();
    var jaar = parseInt(b.jaar, 10); if (!(jaar > 1980 && jaar < 2100)) jaar = null;
    var bs = String(b.brandstof || '').toLowerCase();
    var sup = Array.isArray(b.supported) ? b.supported : [];
    var p = {};
    var uitMens = function (id) { return typeof mens[id] === 'boolean' ? k(mens[id], 'bewezen', 'opgegeven of waargenomen') : null; };

    p.slimladen = uitMens('slimladen') ||
      (b.laadGevraagd ? k(true, 'bewezen', 'de auto vraagt zelf een laadspanning') :
        jaar >= 2012 ? k(true, 'waarschijnlijk', 'bouwjaar ' + jaar + ' (vrijwel elke auto vanaf 2012)') :
          jaar && jaar < 2005 ? k(false, 'waarschijnlijk', 'bouwjaar ' + jaar) : ONBEKEND);
    p.kenveldthermostaat = uitMens('kenveldthermostaat') ||
      (merk ? (KENVELD_MERK.test(merk) ? k(true, 'waarschijnlijk', 'merk ' + b.merk) :
        /^mercedes/.test(merk) ? ONBEKEND : k(false, 'waarschijnlijk', 'merk ' + b.merk)) : ONBEKEND);
    p.turbo = uitMens('turbo') ||
      (b.turboGezien ? k(true, 'bewezen', 'laaddruk boven de buitenlucht gemeten') :
        b.turboProfiel === 'ja' ? k(true, 'bewezen', 'profiel van de auto') :
          b.turboProfiel === 'nee' ? k(false, 'bewezen', 'profiel van de auto') :
            (/diesel/.test(bs) && jaar >= 2000) ? k(true, 'waarschijnlijk', 'diesel vanaf 2000') : ONBEKEND);
    p.diesel = bs ? k(/diesel/.test(bs), 'bewezen', 'brandstof ' + bs) : ONBEKEND;
    p.hybride = bs ? k(/hybr/.test(bs), 'bewezen', 'brandstof ' + bs) : ONBEKEND;
    p.lpg = uitMens('lpg') || (/lpg|cng/.test(bs) ? k(true, 'bewezen', 'brandstof ' + bs) : ONBEKEND);
    // Hybride ≠ e-CVT (#589). Het planetaire stelsel van Toyota (en Lexus, en
    // Ford, en de Suzuki's die een Toyota zijn) wél; Kia en Hyundai rijden
    // hybride met een DCT, Honda e:HEV met een vaste overbrenging, Renault
    // E-Tech met een klauwbak, VAG met een DSG. Zonder merk: niet te zeggen.
    p.cvt = uitMens('cvt') || (/hybr/.test(bs) ?
      (ECVT_MERK.test(merk) ? k(true, 'waarschijnlijk', 'hybride van ' + b.merk + ' (e-CVT)') :
        /^(kia|hyundai)\b/.test(merk) ? k(false, 'waarschijnlijk', 'hybride van ' + b.merk + ' (DCT)') : ONBEKEND) :
      /hand/.test(String(b.transmissie || '')) ? k(false, 'bewezen', 'handgeschakeld') : ONBEKEND);
    var bb = sup.some(function (x) { return BREEDBAND.indexOf(String(x).toUpperCase()) > -1; });
    p.breedband_b1s1 = bb ? k(true, 'bewezen', 'de auto levert een breedband-lambda') :
      (sup.length && sup.indexOf('0114') > -1) ? k(false, 'waarschijnlijk', 'alleen smalband 0114 aangeboden') : ONBEKEND;
    return p;
  }

  // Eén voorwaarde tegen het profiel: 'waar' | 'onwaar' | 'waarschijnlijk' | 'onbekend'.
  function toets(prof, id, eis) {
    var is = (eis && typeof eis === 'object') ? eis.is : eis;
    var gangbaar = !!(eis && typeof eis === 'object' && eis.gangbaar);
    var km = prof[id] || ONBEKEND;
    if (km.waarde === null || km.waarde === undefined) return gangbaar ? 'waar' : 'onbekend';
    var klopt = km.waarde === is;
    if (km.zeker === 'bewezen') return klopt ? 'waar' : 'onwaar';
    // Een aanwijzing voor het tegendeel maakt het altijd onbekend, ook bij gangbaar.
    return klopt ? 'waarschijnlijk' : 'onbekend';
  }
  /* geldt(voorwaarden, prof) → { uitkomst, redenen:[tekst], open:[kenmerk-id] }
     Eén voorwaarde bewezen onwaar is genoeg om de regel uit te zetten. */
  function geldt(voorwaarden, prof) {
    var ids = Object.keys(voorwaarden || {}), uit = { uitkomst: 'geldt', redenen: [], open: [] };
    var ergste = 0, RANG = { waar: 0, waarschijnlijk: 1, onbekend: 2, onwaar: 3 };
    ids.forEach(function (id) {
      var t = toets(prof || {}, id, voorwaarden[id]), km = (prof || {})[id] || ONBEKEND;
      var is = (voorwaarden[id] && typeof voorwaarden[id] === 'object') ? voorwaarden[id].is : voorwaarden[id];
      if (t !== 'waar') uit.redenen.push((NAAM[id] || id) + ': ' + (km.waarde === null ? 'onbekend' : (km.waarde ? 'ja' : 'nee') + ' (' + (km.zeker || '?') + ', ' + km.bron + ')') + ', de regel gaat uit van ' + (is ? 'ja' : 'nee'));
      if (t === 'onbekend' || t === 'waarschijnlijk') uit.open.push(id);
      ergste = Math.max(ergste, RANG[t]);
    });
    uit.uitkomst = ['geldt', 'waarschijnlijk', 'onbekend', 'geldt_niet'][ergste];
    return uit;
  }
  // Het ruwe oordeel van een regel door de poort.
  function toepassen(ruw, g) {
    if (!ruw || ruw === 'ok') return g && g.uitkomst === 'geldt_niet' ? null : ruw || null;
    var u = g ? g.uitkomst : 'geldt';
    if (u === 'geldt_niet') return null;
    if (u === 'onbekend') return 'onbeslist';
    if (u === 'waarschijnlijk') return 'letop';
    return ruw;
  }

  // ── EÉN GRENS PER GROOTHEID ─────────────────────────────────────
  // Laadspanning bij draaiende motor. laad = PLEigen.laadOordeel()
  // (bewezen via de gevraagde spanning of de laadtoestand) of null.
  var LAAD_HARD_LAAG = 12.2;   // onder een halflege rustende accu: hij ontlaadt, op elke auto
  var LAAD_HARD_HOOG = 15.2;   // regelaar knijpt niet af, op elke auto
  var LAAD_KLASSIEK = 13.2;    // ondergrens van een ongestuurde dynamo
  var nl1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); };
  function laadspanning(u, rpm, ctx) {
    ctx = ctx || {};
    u = Number(u); rpm = Number(rpm);
    if (!isFinite(u) || u < 6 || u > 20 || !(rpm >= 500)) return null;
    var U = nl1(u) + ' V';
    if (u < LAAD_HARD_LAAG) return { niveau: 'fout', tekst: 'laadspanning ' + U + ' bij draaiende motor — lager dan een halflege accu: de dynamo laadt niet', hard: true };
    if (u > LAAD_HARD_HOOG) return { niveau: 'fout', tekst: 'laadspanning ' + U + ' — te hoog, de regelaar knijpt niet af', hard: true };
    var lo = ctx.laad;
    if (lo && lo.staat === 'laadt_niet') return { niveau: 'fout', tekst: lo.tekst };
    if (lo) return { niveau: 'ok', tekst: lo.tekst };
    if (u >= LAAD_KLASSIEK) return { niveau: 'ok', tekst: 'laadspanning ' + U + ' — de dynamo laadt' };
    var g = geldt({ slimladen: false }, ctx.prof || {});
    var n = toepassen('fout', g);
    // Geldt de regel aantoonbaar niet, dan is dit gewoon normaal voor déze auto.
    if (n === null) return { niveau: 'ok', tekst: 'laadspanning ' + U + ' — een slimme laadregeling laadt bij een volle accu bewust zo laag', geldt: g };
    return { niveau: n, tekst: n === 'onbeslist'
      ? 'laadspanning ' + U + ' — niet te beoordelen: een slimme laadregeling laadt bij een volle accu bewust zo laag. Voeg de gevraagde laadspanning toe (Mijn voertuigen → Sensoren) om het zeker te weten'
      : 'laadspanning ' + U + ' bij draaiende motor — onder de ' + nl1(LAAD_KLASSIEK) + ' V van een gewone dynamo' + (n === 'letop' ? ' (niet zeker voor deze auto)' : ''),
      geldt: g };
  }
  /* De band voor een systeemtest (x_laadspanning): wat er voor déze auto
     geldt. Bewezen laadregeling → vanaf de gevraagde spanning min de marge;
     bewezen gewone dynamo → 13,2; anders alleen de harde grens. */
  function laadBand(prof, gevraagd) {
    if (typeof gevraagd === 'number' && gevraagd >= 11 && gevraagd <= 16) return { lo: Math.max(LAAD_HARD_LAAG, gevraagd - 0.5), hi: LAAD_HARD_HOOG, ref: gevraagd };
    return geldt({ slimladen: false }, prof || {}).uitkomst === 'geldt' ? { lo: LAAD_KLASSIEK, hi: LAAD_HARD_HOOG } : { lo: LAAD_HARD_LAAG, hi: LAAD_HARD_HOOG };
  }
  // Koelwater. Boven 112 °C op elke auto fout; 105–112 alleen bij een vaste thermostaat.
  var KOEL_HARD = 112, KOEL_KLASSIEK = 105;
  function koelwater(t, ctx) {
    ctx = ctx || {};
    t = Number(t);
    if (!isFinite(t) || t < -40 || t > 215) return null;
    if (t > KOEL_HARD) return { niveau: 'fout', tekst: 'koelwater ' + Math.round(t) + ' °C — te heet op elke motor', hard: true };
    if (t <= KOEL_KLASSIEK) return { niveau: 'ok', tekst: 'koelwater ' + Math.round(t) + ' °C' };
    var g = geldt({ kenveldthermostaat: false }, ctx.prof || {});
    var n = toepassen('fout', g);
    if (n === null) return { niveau: 'ok', tekst: 'koelwater ' + Math.round(t) + ' °C — normaal voor een motor met kenveldthermostaat', geldt: g };
    return { niveau: n, geldt: g, tekst: n === 'onbeslist'
      ? 'koelwater ' + Math.round(t) + ' °C — niet te beoordelen: deze motor draait mogelijk bewust zo warm (kenveldthermostaat)'
      : 'koelwater ' + Math.round(t) + ' °C — warmer dan een gewone thermostaat toelaat' + (n === 'letop' ? ' (niet zeker voor deze auto)' : '') };
  }

  // ── WAT ONBESLIST IS, VOOR DE AI EN HET SCHERM ──────────────────
  var _onbeslist = {};   // id → { id, naam, reden, open:[kenmerk], t }
  var BEWAAR_MS = 30 * 60 * 1000;
  function noteer(id, naam, g, nu) {
    if (!id) return;
    nu = nu || Date.now();
    _onbeslist[id] = { id: id, naam: naam || id, reden: (g && g.redenen || []).join('; '), open: (g && g.open || []).slice(), t: nu };
  }
  function wisNotitie(id) { delete _onbeslist[id]; }
  function onbeslist(nu) {
    nu = nu || Date.now();
    return Object.keys(_onbeslist).map(function (x) { return _onbeslist[x]; }).filter(function (o) { return nu - o.t < BEWAAR_MS; });
  }
  // De vragen die bij de open kenmerken horen, elk één keer.
  function vragen(lijst) {
    var gezien = {};
    return (lijst || []).reduce(function (a, o) {
      (o.open || []).forEach(function (id) { if (VRAAG[id] && !gezien[id]) { gezien[id] = 1; a.push({ id: id, vraag: VRAAG[id] }); } });
      return a;
    }, []);
  }
  /* Het blok voor de systeemprompt: het profiel (alleen wat bekend is) en
     wat niet te beoordelen was. Leeg als er niets te zeggen is. */
  function promptBlok(prof, lijst) {
    var r = [];
    Object.keys(NAAM).forEach(function (id) {
      var km = (prof || {})[id]; if (!km || km.waarde === null || km.waarde === undefined) return;
      r.push('- ' + NAAM[id] + ': ' + (km.waarde ? 'ja' : 'nee') + ' (' + km.zeker + ': ' + km.bron + ')');
    });
    var o = (lijst || []).map(function (x) { return '- ' + x.naam + (x.reden ? ' — ' + x.reden : ''); });
    if (!r.length && !o.length) return '';
    return '\n\nKENMERKEN VAN DEZE AUTO (bepalen of een regel voor déze auto geldt):\n' + (r.length ? r.join('\n') : '- nog niets bekend') +
      (o.length ? '\n\nNIET TE BEOORDELEN OP DEZE AUTO (de regel gaat uit van een kenmerk dat hier onbekend is):\n' + o.join('\n') +
        '\nTrek over deze onderwerpen GEEN conclusie en noem ze niet als defect. Zeg dat ze niet te beoordelen zijn en wat er nodig is om het te weten.' : '') +
      '\nEen bevinding gemarkeerd met "(niet zeker voor deze auto)" is een aandachtspunt, geen vastgesteld defect.';
  }

  // ── LIVE ────────────────────────────────────────────────────────
  var MENS_IDS = ['slimladen', 'kenveldthermostaat', 'turbo', 'lpg', 'cvt'];
  function mensLive() {
    var uit = {};
    if (!window.PLWaarneming) return uit;
    MENS_IDS.forEach(function (id) {
      try {
        var w = PLWaarneming.lees(id);
        if (w.status === 'gezien') uit[id] = true; else if (w.status === 'weerlegd') uit[id] = false;
      } catch (e) { console.warn('PLKenmerk: waarneming ' + id + ' onleesbaar', e); }
    });
    return uit;
  }
  function bronLive() {
    var b = { mens: mensLive() };
    try {
      var vi = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      b.merk = vi.merk || vi.make || ''; b.jaar = vi.year || ''; b.brandstof = vi.brandstof || '';
    } catch (e) { console.warn('PLKenmerk: vehicleInfo onleesbaar', e); }
    try {
      var g = window.PLGarage && PLGarage.gekoppeld ? PLGarage.gekoppeld() : null;
      if (g) {
        b.merk = b.merk || g.merk || ''; b.jaar = b.jaar || g.bouwjaar || '';
        if (g.brandstof && g.brandstof !== 'onbekend') b.brandstof = g.brandstof;   // de klant weet het beter dan de VIN
        b.transmissie = g.transmissie || ''; b.turboProfiel = g.turbo || '';
      }
    } catch (e) { console.warn('PLKenmerk: gekoppeld voertuig onleesbaar', e); }
    try { b.turboGezien = !!(window.PLGate && PLGate.stats().turbo); } catch (e) { console.warn('PLKenmerk: PLGate onleesbaar', e); }
    try { b.supported = (typeof supportedPIDs !== 'undefined' && supportedPIDs && supportedPIDs.size) ? Array.from(supportedPIDs) : []; }
    catch (e) { console.warn('PLKenmerk: supportedPIDs onleesbaar', e); }
    try { var ln = window.PLEigen && PLEigen.laadNu ? PLEigen.laadNu() : {}; b.laadGevraagd = typeof ln.gevraagd === 'number'; }
    catch (e) { console.warn('PLKenmerk: laadsensoren onleesbaar', e); }
    return b;
  }
  // Het profiel van een opgeslagen voertuig (Mijn voertuigen), zonder verbinding.
  function bronVoertuig(v) {
    v = v || {};
    var g = v.gezondheid || {};
    return { merk: v.merk || '', jaar: v.bouwjaar || '', brandstof: v.brandstof === 'onbekend' ? '' : (v.brandstof || ''), transmissie: v.transmissie || '',
      turboProfiel: v.turbo || '', laadGevraagd: !!g.laadStaat, mens: {} };
  }
  // Het live profiel wordt per seconde hooguit één keer opgebouwd: de
  // datalog vraagt het per meting, en PLWaarneming leest dan de opslag.
  var _cache = null, _cacheT = 0, CACHE_MS = 1000;
  function live() {
    var nu = Date.now();
    if (!_cache || nu - _cacheT > CACHE_MS || nu < _cacheT) { _cache = profiel(bronLive()); _cacheT = nu; }
    return _cache;
  }
  function vergeet() { _cache = null; }
  /* Het "let op"-bereik van een PID voor déze auto (PID_LET_OP): een regel
     met voorwaarden die hier niet (zeker) gelden vervalt; een bovengrens met
     maxVoorwaarden (010B: geen turbo) wordt maxMet als die niet geldt. */
  function letOp(pid, tabel, prof) {
    var e = tabel && tabel[pid];
    if (!e) return null;
    if (e.voorwaarden) {
      var u = geldt(e.voorwaarden, prof).uitkomst;
      if (u === 'geldt_niet' || u === 'onbekend') return null;
    }
    if (e.maxVoorwaarden && geldt(e.maxVoorwaarden, prof).uitkomst !== 'geldt' && typeof e.maxMet === 'number')
      return { min: e.min, max: e.maxMet, waarom: e.waarom };
    return e;
  }
  function laadLive() {
    try { return window.PLEigen && PLEigen.laad ? PLEigen.laad() : null; }
    catch (e) { console.warn('PLKenmerk: laadoordeel', e); return null; }
  }
  // Een mens beantwoordt een vraag: ja = gezien (bron mens), nee = weerlegd.
  function antwoord(id, ja) {
    if (MENS_IDS.indexOf(id) < 0 || !window.PLWaarneming) return false;
    try {
      if (ja) PLWaarneming.meld(id, { bron: 'mens' }); else PLWaarneming.weerleg(id);
      vergeet();
      Object.keys(_onbeslist).forEach(function (x) { if (_onbeslist[x].open.indexOf(id) > -1) delete _onbeslist[x]; });
      return true;
    } catch (e) { console.warn('PLKenmerk: antwoord niet bewaard', e); return false; }
  }

  window.PLKenmerk = {
    NAAM: NAAM, VRAAG: VRAAG, KOEL_HARD: KOEL_HARD, KOEL_KLASSIEK: KOEL_KLASSIEK, LAAD_HARD_LAAG: LAAD_HARD_LAAG, LAAD_KLASSIEK: LAAD_KLASSIEK,
    profiel: profiel, geldt: geldt, toepassen: toepassen, laadspanning: laadspanning, laadBand: laadBand, koelwater: koelwater,
    noteer: noteer, wisNotitie: wisNotitie, onbeslist: onbeslist, vragen: vragen, promptBlok: promptBlok,
    bronLive: bronLive, bronVoertuig: bronVoertuig, live: live, vergeet: vergeet, antwoord: antwoord, letOp: letOp,
    letOpLive: function (pid) {
      var t = (typeof PID_LET_OP !== 'undefined') ? PID_LET_OP : null;
      try { return letOp(pid, t, live()); } catch (e) { console.warn('PLKenmerk: let-op-bereik ' + pid, e); return t ? t[pid] || null : null; }
    },
    // Gemaksvormen voor de aanroepers: live profiel, live laadoordeel.
    laadLive: function (u, rpm) { return laadspanning(u, rpm, { laad: laadLive(), prof: live() }); },
    koelLive: function (t) { return koelwater(t, { prof: live() }); },
    geldtLive: function (voorwaarden) { return geldt(voorwaarden, live()); },
    laadBandLive: function () {
      var g = null;
      try { var ln = window.PLEigen && PLEigen.laadNu ? PLEigen.laadNu() : {}; g = typeof ln.gevraagd === 'number' ? ln.gevraagd : null; }
      catch (e) { console.warn('PLKenmerk: gevraagde laadspanning onleesbaar', e); }
      return laadBand(live(), g);
    },
    blok: function () { try { return promptBlok(live(), onbeslist()); } catch (e) { console.warn('PLKenmerk: promptblok', e); return ''; } }
  };
})();
