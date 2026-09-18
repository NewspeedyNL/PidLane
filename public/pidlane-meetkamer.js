// ══════════════════════════════════════════════════════════════════
// pidlane-meetkamer.js — de vraag van deze rit, in beeld (#246)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS.
// Sinds #241 en #235 loopt er een lus: een meetopdracht komt als DATA uit
// Airtable binnen, de rit meet hem, de uitslagen gaan met naam en al terug de
// logtabel in, en daarbuiten wordt dat gelezen. Op 18-09 kwam die lus voor het
// eerst helemaal rond — en leverde tóch geen antwoord op: de auto stond stil,
// `010D max = 0`, en dat bleek pas achteraf uit een FOUT-regel tussen 130
// andere regels in een verslag dat op een telefoon gelezen wordt.
//
// De opdracht wíst dat al tijdens de rit. Er was alleen niets dat het liet zien.
//
// ── DE EERSTE VERSIE WAS ONLEESBAAR, EN DAT IS LEERZAAM ───────────
// Die zette vier even grote tegels naast elkaar en daaronder élk issue dat
// blok 5 dekt: 43 chips, waaronder §11, §21, §4, §7 en §8 — hoofdstukken uit
// PIDLANE.md, geen issues. Het scherm toonde WAT BLOK 5 ALLEMAAL DEKT in
// plaats van WAAR DEZE RIT OVER GAAT.
//
// Dat is geen opmaakfout maar een denkfout, en hij heeft een naam die in dit
// project vaker terugkomt: alles even zwaar tonen is hetzelfde als niets
// tonen. Vier gelijkwaardige kaarten geven geen rangorde, dus je leest ze
// geen van alle.
//
// DE REGEL DIE DAARUIT VOLGT: rustig als er niets aan de hand is, luid als er
// wél iets is. Eén ding is groot — de vraag die deze rit moet beantwoorden —
// en de rest krimpt tot het iets te melden heeft. De lus is vier stipjes
// zolang hij loopt en wordt pas een blok zodra er iets stukgaat.
//
// ── WAT "DEZE RONDE" IS, EN WAAROM HET AFGELEID WORDT ─────────────
// De issues die hier staan komen uit twee bronnen die allebei al de waarheid
// zijn: de proeven van de Airtable-opdracht (dat is per definitie de vraag
// van deze rit), en de issues waar blok 5 déze run werkelijk iets over te
// melden had. De andere veertig lopen mee als bewaking en staan achter één
// regel met een telling.
//
// De verleiding was om `CAMPAGNE` te gebruiken — daar staat al "wat één run
// deze ronde moet sluiten". Maar die lijst wordt met de hand bijgehouden, en
// dat is precies de vorm die §11 en PIDLANE-WERK.md de kop kostte: een tweede
// lijst die uit de pas loopt. Afgeleid is smaller maar altijd waar.
//
// ── DE HARDE REGEL: DIT SCHERM MEET NIETS ─────────────────────────
// Elke tegel leest een bron die er al is — PLOpdracht, PLRit, PLBron,
// plLiveLogStatus(), PLTestrunLive, getPidDef(). Er wordt hier geen waarde
// zelf berekend, geen band zelf beoordeeld en geen lijst zelf bijgehouden.
//
// Een scherm met een eigen kopie van het oordeel loopt uit de pas met het
// oordeel zelf, en wijst dan groen aan waar het verslag rood zegt — en dan
// stop je met het verslag lezen. De balk en de FOUT-regel komen daarom uit
// dezelfde aanroep: PLOpdracht.meet(), die sinds #246 ook de getallen draagt.
// Blok 5 legt de twee elke run naast elkaar.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var TIK_MS = 1000;        // hoe vaak de live tegels ververst worden
  var _tikker = null;
  var _open = false;
  var _uit = {};            // welke secties de gebruiker heeft opengeklapt
  var _kiezen = false;      // staat de opdrachtkiezer open?
  var _bezigLaden = false;  // haalt hij de lijst nu op?

  /* WAT ALS ISSUE TELT. `#123` wel, `§11` niet: dat laatste is een hoofdstuk
     uit PIDLANE.md dat als herkomst in het `issue`-veld van PROEVEN_B5 staat.
     Ze als issuechip tonen leverde vijf chips op die naar niets verwijzen.

     Hier wordt dat gefilterd en niet in PROEVEN_B5 omgedoopt: dat veld heet
     `issue` en draagt twee soorten verwijzingen, en dat rechtzetten is een
     mechanische wijziging over 54 regels — een eigen commit, en niet deze.
     Tot dan is dit de plek waar het onderscheid gemaakt wordt. */
  var ISSUE_VORM = /^#\d+$/;
  var DEEL_VORM = /^§/;

  /* De vier stations van de lus, in de volgorde waarin ze gebeuren. */
  var STATIONS = [
    { sleutel: 'binnen', titel: 'Opdracht' },
    { sleutel: 'meten',  titel: 'Meten' },
    { sleutel: 'terug',  titel: 'Airtable' },
    { sleutel: 'lezen',  titel: 'Claude' }
  ];

  var KLEUR = {
    'ja':     'var(--gn)',
    'bezig':  'var(--bl)',
    'wacht':  'var(--tx3)',
    'let op': 'var(--or)',
    'fout':   'var(--rd)'
  };
  var RANG = { 'fout': 3, 'let op': 2, 'ja': 1, 'wacht': 0 };

  function _kleur(st) { return KLEUR[st] || KLEUR.wacht; }

  /* Een waarde die in een JavaScript-tekenreeks BINNEN een HTML-attribuut
     terechtkomt. `veilig()` alleen is hier niet genoeg: die maakt van < en "
     iets onschuldigs, maar laat de apostrof staan — en precies die sluit de
     aanroep vroegtijdig af. Airtable-ids zijn alfanumeriek, dus "dat kan niet
     voorkomen"; dat is hier nooit een argument geweest, en test-meetkamer.js
     wees het meteen aan. */
  function jsTekst(v) {
    return veilig(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  }

  function veilig(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Een getal zoals een Nederlander het leest, en zonder een precisie te
     suggereren die er niet is: 13.77 wordt 13,77 maar 100000 blijft 100000. */
  function getal(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    var s = (Math.abs(n) < 1000 && Math.round(n) !== n) ? n.toFixed(2).replace(/0$/, '') : String(n);
    return s.replace('.', ',');
  }

  function ouderdom(tijd, nu) {
    var t = (typeof tijd === 'number') ? tijd : Date.parse(tijd);
    if (!t || isNaN(t)) return '';
    var s = Math.round(((nu || Date.now()) - t) / 1000);
    if (s < 0) return 'zojuist';
    if (s < 60) return s + ' s geleden';
    if (s < 3600) return Math.round(s / 60) + ' min geleden';
    if (s < 86400) return Math.round(s / 3600) + ' u geleden';
    return Math.round(s / 86400) + ' dag(en) geleden';
  }

  // ── DE VIER STATIONS ──────────────────────────────────────────────
  /* Zuiver: krijgt een momentopname mee en geeft de vier standen terug. Geen
     window, geen DOM, geen klok — zodat test-meetkamer.js elke stand kan
     nabouwen zonder browser. */
  function stations(snap) {
    snap = snap || {};
    var nu = snap.nu || Date.now();
    var o = snap.opdracht || null;
    var h = snap.herkomst || null;
    var u = Array.isArray(snap.uitslagen) ? snap.uitslagen : [];
    var live = snap.live || null;
    var uit = {};

    if (snap.toggleAan === false) {
      uit.binnen = { staat: 'wacht', regel: 'het ophalen staat uit in de Config (feat_opdracht)' };
    } else if (o) {
      uit.binnen = { staat: 'ja', regel: o.naam,
        bij: (h && h.gewijzigd) ? 'klaargezet ' + ouderdom(h.gewijzigd, nu) : '' };
    } else {
      var r = String(snap.reden || 'nog niet opgehaald');
      uit.binnen = /afgekeurd/i.test(r)
        ? { staat: 'fout', regel: 'er stond een opdracht klaar en die is AFGEKEURD — ' + r }
        : { staat: 'wacht', regel: r };
    }

    var fout = u.filter(function (x) { return x.staat === 'FOUT'; }).length;
    var letop = u.filter(function (x) { return x.staat === 'LET OP'; }).length;
    if (!o) {
      uit.meten = { staat: 'wacht', regel: 'zonder opdracht valt er niets te meten' };
    } else if (!u.length) {
      uit.meten = { staat: snap.bezig ? 'bezig' : 'wacht',
        regel: snap.bezig ? 'de run loopt' : 'nog niet gemeten' };
    } else if (fout) {
      uit.meten = { staat: 'fout', regel: fout + ' van de ' + u.length + ' buiten de band' };
    } else if (letop) {
      uit.meten = { staat: 'let op', regel: letop + ' van de ' + u.length + ' niet te meten' };
    } else {
      uit.meten = { staat: 'ja', regel: 'alle ' + u.length + ' binnen de band' };
    }

    if (!live) {
      uit.terug = { staat: 'wacht', regel: 'nog niets verstuurd' };
    } else if (live.ok) {
      uit.terug = { staat: 'ja', regel: live.aantal + ' regel(s) aangekomen', bij: ouderdom(live.tijd, nu) };
    } else {
      uit.terug = { staat: 'fout',
        regel: 'de laatste zending MISLUKTE' + (live.status ? ' (HTTP ' + live.status + ')' : '') +
               (live.fout ? ' — ' + live.fout : ''),
        bij: ouderdom(live.tijd, nu) };
    }

    if (u.length && uit.terug.staat === 'ja') {
      uit.lezen = { staat: 'ja', regel: 'de uitslag staat in de tabel' };
    } else if (o && h && h.gewijzigd) {
      uit.lezen = { staat: 'wacht', regel: 'nog niet beantwoord' };
    } else {
      uit.lezen = { staat: 'wacht', regel: 'wacht op een uitslag' };
    }

    return STATIONS.map(function (s) {
      var d = uit[s.sleutel] || { staat: 'wacht', regel: '' };
      return { sleutel: s.sleutel, titel: s.titel, staat: d.staat, regel: d.regel, bij: d.bij || '' };
    });
  }

  // ── HET OORDEEL: ÉÉN GETAL BOVENAAN ───────────────────────────────
  /* Wat je tijdens het rijden wilt weten is niet "hoe staat station 3" maar
     "gaat deze rit iets opleveren". Dat is één breuk plus één zin eronder die
     zegt wat er nog ontbreekt.

     De zin komt uit de zwaarste uitslag zelf, niet uit een eigen tekst: de
     opdracht schrijft de naam van zijn proeven, en die naam is wat een mens
     moet lezen. Hier iets eigens verzinnen zou een tweede beschrijving zijn
     van hetzelfde. */
  function oordeel(snap) {
    snap = snap || {};
    var u = Array.isArray(snap.uitslagen) ? snap.uitslagen : [];
    if (!snap.opdracht) return { staat: 'wacht', goed: 0, totaal: 0, kop: '', regel: '' };
    if (!u.length) {
      return { staat: snap.bezig ? 'bezig' : 'wacht', goed: 0, totaal: snap.opdracht.proeven.length,
        kop: snap.bezig ? 'meten…' : 'nog niet gemeten',
        regel: snap.bezig ? 'de eerste monsters komen binnen' : 'start een meetrit om deze vraag te beantwoorden' };
    }

    var goed = u.filter(function (x) { return x.staat === 'ok'; }).length;
    var fout = u.filter(function (x) { return x.staat === 'FOUT'; });
    var letop = u.filter(function (x) { return x.staat === 'LET OP'; });
    var staat = fout.length ? 'fout' : (letop.length ? 'let op' : 'ja');

    var regel;
    if (fout.length) regel = fout[0].detail || fout[0].naam;
    else if (letop.length) regel = letop.length === 1
      ? letop[0].naam + ' — nog niet te meten'
      : letop.length + ' proeven zijn nog niet te meten';
    else regel = 'deze rit beantwoordt de vraag';

    return { staat: staat, goed: goed, totaal: u.length, kop: 'binnen bereik', regel: regel };
  }

  // ── DE METER VAN ÉÉN PROEF ────────────────────────────────────────
  /* De balk tekent de POSITIE in het venster lo−marge … hi+marge, met marge
     een kwart van de band. De band beslaat daardoor altijd het middelste stuk
     (20%–80%), hoe groot of klein hij ook is — zodat twee proeven naast
     elkaar te lezen zijn zonder de assen erbij.

     Een waarde ver buiten de band plakt tegen de rand: dat leest als "ver
     weg", en dat klopt ook. */
  var RAND = 0.2;

  /* Ontbrekend is iets anders dan nul, en JavaScript vindt van niet:
     `Number(null)` is 0 en `Number('')` ook. Zonder deze poort werd een
     opdracht zonder band stil een band van 0 tot 0, en dan stond de meting
     keurig in het midden van een band die niet bestaat. */
  function _g(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return Number(v);
  }

  function meter(u) {
    u = u || {};
    var lo = _g(u.lo), hi = _g(u.hi);
    var basis = { staat: u.staat || 'LET OP', pid: u.pid || '', maat: u.maat || '',
                  waarde: (u.waarde === undefined ? null : u.waarde),
                  lo: u.lo, hi: u.hi, n: u.n || 0, pos: null, bandVan: RAND, bandTot: 1 - RAND };
    if (isNaN(_g(u.waarde))) return basis;
    if (isNaN(lo) || isNaN(hi)) return basis;

    var span = hi - lo;
    var marge = (span > 0) ? span * (RAND / (1 - 2 * RAND)) : 1;
    var v0 = lo - marge, v1 = hi + marge;
    var pos = (Number(u.waarde) - v0) / (v1 - v0);
    basis.pos = pos < 0 ? 0 : (pos > 1 ? 1 : pos);
    return basis;
  }

  // ── WAT DEZE RONDE MOET SLUITEN ───────────────────────────────────
  /* Afgeleid uit twee bronnen die allebei al de waarheid zijn:

       1. de proeven van de Airtable-opdracht — dat ÍS de vraag van deze rit;
       2. de issues waar blok 5 déze run iets over meldde (FOUT of LET OP) —
          want dat is wat er nu aandacht vraagt.

     Alles wat blok 5 verder dekt loopt mee als bewaking en wordt geteld, niet
     opgesomd. Dat is de correctie op de eerste versie: 43 chips waren geen
     overzicht maar een muur.

     Groen uit de vaste lijst komt er NIET bij. Een proef die het gewoon doet
     is geen nieuws — die hoort bij de veertig die meelopen. Rood en oranje
     wel: daar moet je naar kijken.

     De uitkomst per issue is de ZWAARSTE van zijn proeven. Een issue dat half
     goed is, is niet af. */
  function ronde(snap) {
    snap = snap || {};
    var proeven = Array.isArray(snap.proeven) ? snap.proeven : [];
    var log = Array.isArray(snap.log) ? snap.log : [];
    var o = snap.opdracht || null;

    var geboekt = {};
    log.forEach(function (r) {
      if (!r || r.blok !== 5 || !r.naam) return;
      var st = String(r.staat || '').toUpperCase();
      geboekt[r.naam] = (st === 'FOUT') ? 'fout' : (st === 'LET OP' || st === 'LETOP') ? 'let op' : 'ja';
    });

    var deze = {};
    function draag(issue, naam, staat, herkomst) {
      var b = deze[issue] || (deze[issue] = { issue: issue, staat: 'wacht', proeven: [], herkomst: herkomst });
      b.proeven.push({ naam: naam, staat: staat });
      if (RANG[staat] > RANG[b.staat]) b.staat = staat;
      if (herkomst === 'opdracht') b.herkomst = 'opdracht';
    }

    // 1 — de opdracht van buiten
    if (o && Array.isArray(o.proeven)) {
      var uit = {};
      (snap.uitslagen || []).forEach(function (x) { if (x && x.naam) uit[x.naam] = x.staat; });
      o.proeven.forEach(function (p) {
        if (!ISSUE_VORM.test(String(p.issue || ''))) return;
        var st = uit[p.naam];
        draag(p.issue, p.naam,
          st === 'FOUT' ? 'fout' : st === 'LET OP' ? 'let op' : st === 'ok' ? 'ja' : 'wacht', 'opdracht');
      });
    }

    // 2 — wat blok 5 deze run te melden had, plus de telling van de rest
    var bewaking = 0, delen = 0, stil = {};
    proeven.forEach(function (p) {
      var q = String(p.issue || '');
      if (DEEL_VORM.test(q)) { delen++; return; }
      if (!ISSUE_VORM.test(q)) return;          // '—' en wat er verder niet als issue leest
      var st = geboekt[p.naam];
      if (st === 'fout' || st === 'let op') { draag(q, p.naam, st, 'blok5'); return; }
      if (!deze[q]) stil[q] = 1;
    });
    bewaking = Object.keys(stil).length;

    var lijst = Object.keys(deze)
      .sort(function (a, b) {
        var v = RANG[deze[b].staat] - RANG[deze[a].staat];
        return v || a.localeCompare(b);
      })
      .map(function (k) { return deze[k]; });

    return { deze: lijst, bewaking: bewaking, delen: delen };
  }

  // ── HET LOGBOEK IN ÉÉN REGEL ──────────────────────────────────────
  function logtelling(log) {
    var t = { n: 0, ok: 0, fout: 0, letop: 0 };
    (Array.isArray(log) ? log : []).forEach(function (r) {
      if (!r) return;
      t.n++;
      var st = String(r.staat || '').toUpperCase();
      if (st === 'FOUT') t.fout++;
      else if (st === 'LET OP' || st === 'LETOP') t.letop++;
      else if (st === 'OK') t.ok++;
    });
    return t;
  }

  // ══════════════════════════════════════════════════════════════════
  // DE BRONNEN OPHALEN
  // ══════════════════════════════════════════════════════════════════
  /* Alles wat het scherm nodig heeft, in één keer, met een vangnet per bron.
     Valt er één module weg, dan blijft de rest staan en zegt die ene tegel
     wat er ontbreekt. Een scherm dat in zijn geheel zwart wordt omdat één
     optionele module mist, is een scherm dat je niet meer opent. */
  function momentopname() {
    var s = { nu: Date.now(), opdracht: null, herkomst: null, reden: '', toggleAan: true,
              uitslagen: [], live: null, log: [], proeven: [], bezig: false, bron: '', ritId: '' };

    try {
      if (window.PLOpdracht) {
        s.opdracht = PLOpdracht.actief();
        s.herkomst = PLOpdracht.herkomst();
        s.reden = PLOpdracht.reden() || '';
        s.toggleAan = PLOpdracht.toggleAan();
      } else {
        s.reden = 'PLOpdracht ontbreekt — pidlane-opdracht.js hangt niet in index.html';
      }
    } catch (e) { console.warn('Meetkamer: de opdracht is niet te lezen (#246)', e); s.reden = 'de opdracht is niet te lezen'; }

    // De proeven NU meten, met dezelfde functie waarmee blok 5 ze straks
    // beoordeelt. Dat is de hele reden dat dit scherm tijdens de rit iets
    // waard is: je ziet het oordeel aankomen in plaats van te wachten.
    try {
      if (s.opdracht && window.PLOpdracht && typeof PLOpdracht.meet === 'function') {
        s.uitslagen = s.opdracht.proeven.map(function (p) {
          var u = PLOpdracht.meet(p);
          u.naam = p.naam; u.issue = p.issue;
          return u;
        });
      }
    } catch (e) { console.warn('Meetkamer: de proeven zijn niet te meten (#246)', e); }

    try { if (typeof plLiveLogStatus === 'function') s.live = plLiveLogStatus(); }
    catch (e) { console.warn('Meetkamer: de live-logstand is niet te lezen (#246)', e); }

    try {
      if (window.PLTestrunLive) {
        s.log = PLTestrunLive.log();
        s.proeven = PLTestrunLive.proeven();
        s.bezig = PLTestrunLive.bezig();
        s.ritId = PLTestrunLive.ritId();
      }
    } catch (e) { console.warn('Meetkamer: de testrunstand is niet te lezen (#246)', e); }

    try { if (window.PLBron && typeof PLBron.stempel === 'function') s.bron = PLBron.stempel(); }
    catch (e) { console.warn('Meetkamer: de bron is niet te lezen (#246)', e); }

    return s;
  }

  /* De eenheid bij een PID uit de echte PID-tabel. Niet zelf bijhouden: dat
     zou een tweede tabel zijn naast pidlane-data.js, en die loopt uit de pas
     (zie test-waakronde.js in CLAUDE.md, dat met een eigen HARD-tabel een
     geval bewees dat niet bestond). Onbekend geeft leeg terug. */
  function eenheid(pid) {
    try {
      if (typeof getPidDef !== 'function') return '';
      var d = getPidDef(pid);
      return (d && d.unit) ? String(d.unit) : '';
    } catch (e) { console.warn('Meetkamer: eenheid van ' + pid + ' niet op te halen (#246)', e); return ''; }
  }

  // ══════════════════════════════════════════════════════════════════
  // TEKENEN
  // ══════════════════════════════════════════════════════════════════
  /* DE STIJL GAAT ÉÉN KEER IN DE <head> EN NIET IN ELKE TEKENRONDE.
     Hij stond eerst vooraan de innerHTML, en die wordt elke seconde opnieuw
     gezet: dan parseert de browser 60 keer per minuut hetzelfde stijlblok.
     Erger nog voor het toetsen — `textContent` van het paneel begon met 3 kB
     CSS, dus een proef die op een woord zocht las de opmaak in plaats van het
     scherm. */
  var STIJL =
    '<style id="plmkStijl">' +
    '#meetkamerBox .mk-v{background:linear-gradient(160deg,var(--sur) 0%,rgba(0,0,0,.14) 100%);' +
      'border:1px solid var(--bd2);border-radius:13px;padding:13px;margin-bottom:10px}' +
    '#meetkamerBox .mk-v.rust{border-style:dashed;border-color:var(--bd);background:var(--sur)}' +
    '#meetkamerBox .mk-bron{display:flex;gap:6px;align-items:center;font:700 9.5px var(--f);' +
      'letter-spacing:.5px;text-transform:uppercase;color:var(--tx3);margin-bottom:6px}' +
    '#meetkamerBox .mk-bron em{font-style:normal;background:var(--bls);color:var(--bl);border-radius:4px;padding:1px 5px}' +
    '#meetkamerBox .mk-v h2{font:800 16.5px/1.25 var(--f);margin:0 0 3px;color:var(--tx)}' +
    '#meetkamerBox .mk-sub{font:500 12px var(--f);color:var(--tx2);margin-bottom:11px}' +
    '#meetkamerBox .mk-oor{display:flex;align-items:baseline;gap:9px;padding-top:10px;border-top:1px solid var(--bd)}' +
    '#meetkamerBox .mk-cijfer{font:800 29px/1 var(--f)}' +
    '#meetkamerBox .mk-cijfer i{font:600 15px var(--f);color:var(--tx3);font-style:normal}' +
    '#meetkamerBox .mk-wat{font:700 12.5px/1.35 var(--f);color:var(--tx2)}' +
    '#meetkamerBox .mk-wat u{text-decoration:none;display:block;font-weight:500;font-size:11px;color:var(--tx3);margin-top:2px}' +
    '#meetkamerBox .mk-lus{display:flex;margin:11px 0 1px;padding:9px 2px 0;border-top:1px solid var(--bd)}' +
    '#meetkamerBox .mk-stap{flex:1;text-align:center;position:relative}' +
    '#meetkamerBox .mk-bol{width:11px;height:11px;border-radius:50%;margin:0 auto 5px;background:var(--sur2);' +
      'border:2px solid var(--bd2);position:relative;z-index:2}' +
    '#meetkamerBox .mk-stap b{font:700 9px var(--f);letter-spacing:.3px;text-transform:uppercase;' +
      'color:var(--tx3);display:block;line-height:1.3}' +
    '#meetkamerBox .mk-stap:not(:last-child):after{content:"";position:absolute;top:5px;left:calc(50% + 8px);' +
      'right:calc(-50% + 8px);height:2px;background:var(--bd);z-index:1}' +
    '#meetkamerBox .mk-stap.s-ja .mk-bol{background:var(--gn);border-color:var(--gn)}' +
    '#meetkamerBox .mk-stap.s-ja:not(:last-child):after{background:var(--gn)}' +
    '#meetkamerBox .mk-stap.s-bezig .mk-bol{background:var(--bl);border-color:var(--bl);animation:mkPols 1.3s ease-in-out infinite}' +
    '#meetkamerBox .mk-stap.s-fout .mk-bol{background:var(--rd);border-color:var(--rd)}' +
    '#meetkamerBox .mk-stap.s-ja b,#meetkamerBox .mk-stap.s-bezig b{color:var(--tx2)}' +
    '#meetkamerBox .mk-stap.s-fout b{color:var(--rd)}' +
    '@keyframes mkPols{0%,100%{box-shadow:0 0 0 0 rgba(77,130,255,.5)}50%{box-shadow:0 0 0 5px rgba(77,130,255,0)}}' +
    '#meetkamerBox .mk-kaart{background:var(--sur);border:1px solid var(--bd);border-radius:13px;padding:4px 13px 10px;margin-bottom:10px}' +
    '#meetkamerBox .mk-k{font:800 10px var(--f);letter-spacing:.5px;text-transform:uppercase;color:var(--tx3);padding:11px 0 3px}' +
    '#meetkamerBox .mk-m{padding:9px 0;border-top:1px solid var(--bd)}' +
    '#meetkamerBox .mk-m:first-of-type{border-top:0}' +
    '#meetkamerBox .mk-r1{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}' +
    '#meetkamerBox .mk-nm{font:600 12.5px/1.3 var(--f);color:var(--tx);flex:1}' +
    '#meetkamerBox .mk-w{font:800 15px var(--f);font-variant-numeric:tabular-nums}' +
    '#meetkamerBox .mk-eh{font:600 10px var(--f);color:var(--tx3);margin-left:-4px}' +
    '#meetkamerBox .mk-baan{position:relative;height:7px;border-radius:4px;background:var(--sur2);border:1px solid var(--bd)}' +
    '#meetkamerBox .mk-band{position:absolute;top:0;bottom:0;background:var(--gns);' +
      'border-left:1px solid var(--gn);border-right:1px solid var(--gn)}' +
    '#meetkamerBox .mk-dot{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px}' +
    '#meetkamerBox .mk-r2{display:flex;justify-content:space-between;gap:6px;font:500 9.5px var(--f);color:var(--tx3);margin-top:4px}' +
    '#meetkamerBox .mk-m.leeg .mk-w{color:var(--tx3);font-size:11.5px;font-weight:600}' +
    '#meetkamerBox .mk-m.leeg .mk-baan{opacity:.3}' +
    '#meetkamerBox .mk-chips{display:flex;gap:6px;flex-wrap:wrap}' +
    '#meetkamerBox .mk-chip{display:inline-flex;align-items:center;gap:5px;background:var(--sur2);' +
      'border:1px solid var(--bd2);border-radius:8px;padding:6px 10px;font:700 11.5px var(--f);color:var(--tx2)}' +
    '#meetkamerBox .mk-chip s{width:6px;height:6px;border-radius:50%;background:var(--tx3);text-decoration:none}' +
    '#meetkamerBox .mk-chip em{font-style:normal;font-weight:500;font-size:10px;opacity:.75}' +
    '#meetkamerBox .mk-rest{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:9px;' +
      'border-top:1px solid var(--bd);font:500 11px var(--f);color:var(--tx3);cursor:pointer}' +
    '#meetkamerBox .mk-rest b{color:var(--tx2);font-weight:700}' +
    '#meetkamerBox .mk-rest i{margin-left:auto;font-style:normal}' +
    '#meetkamerBox .mk-alarm{background:var(--rds);border:1px solid var(--rd);border-radius:13px;padding:11px 13px;margin-bottom:10px}' +
    '#meetkamerBox .mk-alarm b{display:block;font:800 10px var(--f);letter-spacing:.5px;' +
      'text-transform:uppercase;color:var(--rd);margin-bottom:5px}' +
    '#meetkamerBox .mk-alarm span{font:600 12.5px/1.45 var(--f);color:var(--tx2)}' +
    '#meetkamerBox .mk-alarm u{text-decoration:none;display:block;font-weight:500;color:var(--tx3);margin-top:4px}' +
    '#meetkamerBox .mk-kies{width:100%;text-align:left;background:var(--sur2);border:1px solid var(--bd2);' +
      'border-radius:10px;padding:9px 11px;margin-top:6px;font:inherit;cursor:pointer;display:flex;align-items:center;gap:9px}' +
    '#meetkamerBox .mk-kies[disabled]{opacity:.5;cursor:default}' +
    '#meetkamerBox .mk-kies.nu{border-color:var(--bl);background:var(--bls)}' +
    '#meetkamerBox .mk-kies s{width:8px;height:8px;border-radius:50%;flex-shrink:0;text-decoration:none;background:var(--tx3)}' +
    '#meetkamerBox .mk-kies div{flex:1;min-width:0}' +
    '#meetkamerBox .mk-kies b{display:block;font:700 12.5px/1.3 var(--f);color:var(--tx)}' +
    '#meetkamerBox .mk-kies u{display:block;text-decoration:none;font:500 10.5px/1.35 var(--f);color:var(--tx3);margin-top:2px}' +
    '#meetkamerBox .mk-kies i{font-style:normal;font:700 10px var(--f);flex-shrink:0}' +
    '#meetkamerBox .mk-knop{background:var(--sur2);border:1px solid var(--bd);border-radius:9px;' +
      'padding:8px 12px;font:700 11.5px var(--f);color:var(--tx2);cursor:pointer}' +
    '</style>';

  /* Eén keer inhangen, en nooit meer. Ontbreekt de <head> (kan niet in een
     browser, wel in een sandbox), dan blijft de stijl weg en staat het paneel
     er kaal bij — leesbaar, alleen niet mooi. Dat is beter dan klappen. */
  function stijlErin() {
    try {
      if (!document.head || document.getElementById('plmkStijl')) return false;
      var d = document.createElement('div');
      d.innerHTML = STIJL;
      var el = d.firstChild;
      if (el) document.head.appendChild(el);
      return true;
    } catch (e) { console.warn('Meetkamer: het stijlblok kon niet ingehangen worden (#246)', e); return false; }
  }

  function _lus(st) {
    return '<div class="mk-lus">' + st.map(function (s) {
      return '<div class="mk-stap s-' + s.staat.replace(' ', '') + '" title="' + veilig(s.regel) + '">' +
        '<span class="mk-bol"></span><b>' + veilig(s.titel) + '</b></div>';
    }).join('') + '</div>';
  }

  /* DE VRAAG. Het enige grote element op dit scherm, en dat is de hele
     ordening: je kijkt tijdens het rijden naar één ding — gaat deze rit iets
     opleveren. */
  function _vraag(s, st, oor) {
    if (!s.opdracht) {
      var r = stations(s)[0];
      return '<div class="mk-v rust">' +
        '<div class="mk-bron">Deze rit beantwoordt' +
          (s.ritId ? '<span style="margin-left:auto;font-weight:600">rit ' + veilig(s.ritId) + '</span>' : '') + '</div>' +
        '<h2 style="color:var(--tx3)">' + (r.staat === 'fout' ? 'De opdracht is afgekeurd' : 'Nog geen meetopdracht') + '</h2>' +
        '<div class="mk-sub">' + veilig(r.regel) + '</div>' +
        _lus(st) + '</div>';
    }

    var kl = _kleur(oor.staat);
    return '<div class="mk-v"' + (oor.staat === 'fout' ? ' style="border-color:var(--rd)"' : '') + '>' +
      '<div class="mk-bron">Deze rit beantwoordt' +
        (s.opdracht.reden ? '<em>' + veilig(String(s.opdracht.reden).split(' ')[0]) + '</em>' : '') +
        (s.ritId ? '<span style="margin-left:auto;font-weight:600">rit ' + veilig(s.ritId) + '</span>' : '') + '</div>' +
      '<h2>' + veilig(s.opdracht.naam) + '</h2>' +
      (s.opdracht.reden ? '<div class="mk-sub">' + veilig(s.opdracht.reden) + '</div>' : '') +
      '<div class="mk-oor">' +
        (oor.totaal
          ? '<span class="mk-cijfer" style="color:' + kl + '">' + oor.goed + '<i>/' + oor.totaal + '</i></span>'
          : '<span class="mk-cijfer" style="color:var(--tx3);font-size:20px">—</span>') +
        '<span class="mk-wat">' + veilig(oor.kop) + '<u>' + veilig(oor.regel) + '</u></span>' +
      '</div>' +
      _lus(st) + '</div>';
  }

  function _meterRij(m, naam) {
    var kl = m.staat === 'ok' ? 'var(--gn)' : m.staat === 'FOUT' ? 'var(--rd)' : 'var(--or)';
    var eh = eenheid(m.pid);
    var h = '<div class="mk-m' + (m.pos === null ? ' leeg' : '') + '">' +
      '<div class="mk-r1"><span class="mk-nm">' + veilig(naam) + '</span>';

    if (m.pos === null) h += '<span class="mk-w">niet gemeten</span>';
    else h += '<span class="mk-w" style="color:' + kl + '">' + veilig(getal(m.waarde)) + '</span>' +
              (eh ? '<span class="mk-eh">' + veilig(eh) + '</span>' : '');
    h += '</div>';

    h += '<div class="mk-baan"><div class="mk-band" style="left:' + (m.bandVan * 100) + '%;right:' +
           ((1 - m.bandTot) * 100) + '%"></div>' +
         // Geen stip zonder waarde. Een stip op nul zou "ver buiten de band"
         // zeggen, en dat is iets heel anders dan "er is niets gemeten".
         (m.pos === null ? '' : '<div class="mk-dot" style="left:calc(' + (m.pos * 100) + '% - 1.5px);background:' + kl + '"></div>') +
         '</div>';

    h += '<div class="mk-r2"><span>' + veilig(getal(m.lo)) + '</span>' +
      '<span>' + veilig(m.pid + ' · ' + m.maat + (m.n ? ' · ' + m.n + ' monster(s)' : ' · niet in de selectie')) + '</span>' +
      '<span>' + veilig(getal(m.hi)) + '</span></div>';
    return h + '</div>';
  }

  function _chip(b) {
    var kl = _kleur(b.staat);
    var kort = b.proeven.length === 1 ? b.proeven[0].naam : b.proeven.length + ' proeven';
    return '<span class="mk-chip" title="' + veilig(b.proeven.map(function (p) { return p.naam; }).join(' · ')) + '"' +
      ' style="border-color:' + kl + ';color:' + kl + '">' +
      '<s style="background:' + kl + '"></s>' + veilig(b.issue) +
      '<em>' + veilig(kort.length > 26 ? kort.slice(0, 24) + '…' : kort) + '</em></span>';
  }

  // ── DE OPDRACHTKIEZER (#248) ──────────────────────────────────────
  /* Een rit is de schaarste. Tot nu toe beantwoordde één rit één vraag — de
     actieve rij uit Airtable — en wie #217 én #19 wilde weten reed twee keer.

     Deze knoppen maken dat één rit meerdere vragen afwerkt: kies een opdracht,
     de app begint een NIEUWE sessie (eigen ritnummer in de logtabel), meet,
     en je kiest de volgende. Buiten de app zijn de uitslagen daardoor per
     vraag te lezen in plaats van door elkaar onder één nummer.

     Wat elke knop toont is wat er deze app-sessie mee gebeurd is: nog niet
     gemeten, of de uitslag. Dat komt uit PLOpdracht.gedaan() — de testrun
     schrijft het daar weg zodra blok 5 klaar is. Het scherm telt niet zelf.

     Een afgekeurde rij blijft in de lijst staan MET zijn reden en is niet
     aanklikbaar. Verdwijnen zou betekenen dat je in Airtable naar een
     opdracht zit te kijken die op je telefoon nergens te bekennen is, zonder
     dat iets zegt waarom. */
  function _kiezer(s) {
    var rijen = null, gedaan = {};
    try {
      if (window.PLOpdracht) {
        rijen = (typeof PLOpdracht.gelijst === 'function') ? PLOpdracht.gelijst() : null;
        gedaan = (typeof PLOpdracht.gedaan === 'function') ? (PLOpdracht.gedaan() || {}) : {};
      }
    } catch (e) { console.warn('Meetkamer: de opdrachtlijst is niet te lezen (#248)', e); }

    var h = '<div class="mk-kaart" style="padding:11px 13px">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="mk-k" style="padding:0;flex:1">Meetopdrachten</span>' +
        '<button class="mk-knop" onclick="PLMeetkamer.laad()">' +
          (_bezigLaden ? 'bezig…' : (rijen ? '↻ Verversen' : '📥 Ophalen')) + '</button>' +
      '</div>';

    if (!rijen) {
      h += '<div style="font:500 11px/1.6 var(--f);color:var(--tx3);margin-top:7px">' +
        'Haal de lijst op om tijdens deze rit meerdere vragen te beantwoorden. ' +
        'Elke keuze begint een eigen sessie in de logtabel.</div>';
      return h + '</div>';
    }
    if (!rijen.length) {
      h += '<div style="font:500 11px var(--f);color:var(--tx3);margin-top:7px">' +
        'Er staat geen enkele opdracht in de tabel.</div>';
      return h + '</div>';
    }

    var nuId = (s.herkomst && s.herkomst.id) || '';
    rijen.forEach(function (r) {
      var g = gedaan[r.id];
      var kl = r.fout ? 'var(--rd)' : g ? _kleur(g.staat) : 'var(--tx3)';
      // De reden (meestal een issuenummer) EN de stand, niet het een óf het
      // ander. De reden zegt waaróm deze meting bestaat, de stand of hij deze
      // sessie al gedaan is — en dat is precies wat je tijdens een rit wilt
      // weten: welke vraag is nog open.
      var stand = r.fout ? r.fout
        : g ? (g.goed + '/' + g.aantal + ' binnen bereik · ' + ouderdom(g.tijd, s.nu))
        : 'nog niet gemeten deze sessie';
      var staart = (r.reden && !r.fout) ? (r.reden + ' · ' + stand) : stand;
      h += '<button class="mk-kies' + (r.id === nuId ? ' nu' : '') + '"' +
        (r.fout ? ' disabled' : ' onclick="PLMeetkamer.pak(\'' + jsTekst(r.id) + '\')"') + '>' +
        '<s style="background:' + kl + '"></s>' +
        '<div><b>' + veilig(r.naam || '(zonder naam)') + '</b><u>' + veilig(staart) + '</u></div>' +
        '<i style="color:' + kl + '">' + (r.fout ? 'x' : r.id === nuId ? 'nu' : g ? '\u21bb' : '\u203a') + '</i>' +
        '</button>';
    });
    return h + '</div>';
  }

  /* Het hele paneel. Geeft HTML terug in plaats van zelf te schrijven, zodat
     de browserproef hem kan opvragen zonder de testrun te openen. */
  function html(s) {
    s = s || momentopname();
    var st = stations(s);
    var oor = oordeel(s);
    stijlErin();
    var h = '';

    // 1 — de vraag: het enige grote element
    h += _vraag(s, st, oor);

    // 2 — luid worden als er iets stuk is. Dit blok verschijnt alleen als de
    // terugweg het niet doet: dan wordt er wél gemeten maar niets teruggemeld,
    // en dan is de hele rit buiten de app onzichtbaar.
    var terug = st[2];
    if (terug.staat === 'fout') {
      h += '<div class="mk-alarm"><b>⚠ De uitslag komt niet aan</b><span>' + veilig(terug.regel) +
        '<u>Deze rit wordt wel gemeten maar niet teruggemeld — buiten de app is er dus niets van te lezen.</u></span></div>';
    }

    // 3 — de meters: de hoofdinhoud
    if (s.opdracht && s.uitslagen.length) {
      h += '<div class="mk-kaart"><div class="mk-k">De ' + s.uitslagen.length + ' proeven van deze opdracht</div>' +
        s.uitslagen.map(function (u) { return _meterRij(meter(u), u.naam); }).join('') + '</div>';
    }

    // 4 — wat deze ronde moet sluiten: drie chips, geen drieënveertig
    var r = ronde(s);
    if (r.deze.length || r.bewaking) {
      h += '<div class="mk-kaart" style="padding:11px 13px">' +
        '<div class="mk-k" style="padding:0 0 8px">' +
          (r.deze.length ? 'Wat deze rit moet sluiten' : 'Deze rit heeft nog geen bevinding') + '</div>';
      if (r.deze.length) h += '<div class="mk-chips">' + r.deze.map(_chip).join('') + '</div>';
      if (r.bewaking) {
        h += '<div class="mk-rest" onclick="PLMeetkamer.klap(\'bewaking\')">' +
          '<b>' + r.bewaking + '</b> andere proeven lopen mee als bewaking' +
          (r.delen ? ' · <b>' + r.delen + '</b> hoofdstukcontroles' : '') +
          '<i>' + (_uit.bewaking ? '▾' : '›') + '</i></div>';
        if (_uit.bewaking) {
          h += '<div style="font:500 11px/1.7 var(--f);color:var(--tx3);margin-top:7px">' +
            'Ze staan groen of zijn deze run nog niet geboekt. Wordt er één rood, dan schuift hij vanzelf ' +
            'naar boven — daar hoef je dus niet op te wachten.</div>';
        }
      }
      h += '</div>';
    }

    // 4b — de opdrachtkiezer: meerdere vragen per rit (#248)
    h += _kiezer(s);

    // 5 — het logboek als één regel met een telling
    var t = logtelling(s.log);
    if (t.n) {
      h += '<div class="mk-kaart" style="padding:10px 13px;margin-bottom:0;cursor:pointer" ' +
             'onclick="PLMeetkamer.klap(\'log\')">' +
        '<div style="display:flex;align-items:center;gap:7px;font:600 11.5px var(--f);color:var(--tx3)">' +
          '📋 <b style="color:var(--tx2)">' + t.n + '</b> regels geboekt' +
          ' · <b style="color:' + (t.fout ? 'var(--rd)' : 'var(--tx2)') + '">' + t.fout + ' fout</b>' +
          ' · <b style="color:' + (t.letop ? 'var(--or)' : 'var(--tx2)') + '">' + t.letop + ' let op</b>' +
          '<i style="margin-left:auto;font-style:normal">' + (_uit.log ? '▾' : '›') + '</i></div></div>';
    }

    return h;
  }

  // ── de lijm met het testrunscherm ─────────────────────────────────
  /* Het paneel hangt bovenin de bestaande testrunoverlay, in een EIGEN
     element. _teken() van de testrun zet innerHTML op #testrunBody bij elke
     geboekte regel; zaten ze in hetzelfde element, dan knipperde het paneel
     weg zodra er iets gemeten wordt — precies op het moment dat je kijkt. */
  function bak() {
    var ov = document.getElementById('testrunOv');
    if (!ov) return null;
    var b = document.getElementById('meetkamerBox');
    if (b) return b;
    try {
      b = document.createElement('div');
      b.id = 'meetkamerBox';
      b.style.cssText = 'flex-shrink:0';
      var body = document.getElementById('testrunBody');
      if (body && body.parentNode) body.parentNode.insertBefore(b, body);
      else ov.appendChild(b);
    } catch (e) { console.warn('Meetkamer: het paneel kon niet ingehangen worden (#246)', e); return null; }
    return b;
  }

  function teken() {
    var b = bak();
    if (!b) return false;
    try { b.innerHTML = html(); return true; }
    catch (e) { console.warn('Meetkamer: het paneel kon niet getekend worden (#246)', e); return false; }
  }

  /* Een sectie open- of dichtklappen. De stand overleeft de verversing van
     elke seconde, want hij staat hier en niet in de DOM — anders klapte een
     opengezette sectie na één tik weer dicht. */
  function klap(wat) {
    _uit[wat] = !_uit[wat];
    // Het logboek zelf staat in de testrun; die kent zijn eigen filter niet,
    // dus voorlopig klapt dit alleen de eigen uitleg open. Het volle logboek
    // staat eronder in #testrunBody.
    teken();
    return !!_uit[wat];
  }

  /* De lijst ophalen. Eén keer tegelijk: twee verzoeken tegelijk leveren twee
     lijsten op waarvan de laatste wint, en welke dat is hangt af van het
     netwerk. */
  function laad() {
    if (_bezigLaden) return Promise.resolve(null);
    if (!window.PLOpdracht || typeof PLOpdracht.lijst !== 'function') {
      console.warn('Meetkamer: PLOpdracht.lijst ontbreekt — de kiezer kan niets ophalen (#248)');
      return Promise.resolve(null);
    }
    _bezigLaden = true;
    teken();
    return Promise.resolve(PLOpdracht.lijst())
      .then(function (r) { return r; })
      .catch(function (e) { console.warn('Meetkamer: de lijst ophalen mislukt (#248)', e); return null; })
      .then(function (r) { _bezigLaden = false; teken(); return r; });
  }

  /* Een opdracht kiezen. Twee dingen gebeuren er, en de tweede is de reden dat
     dit een knop is en geen instelling: er begint een NIEUWE sessie. Alles wat
     daarna de logtabel in gaat hoort bij déze vraag, en niet bij de vorige. */
  function pak(id) {
    if (!window.PLOpdracht || typeof PLOpdracht.kies !== 'function') return null;
    var o = null;
    try { o = PLOpdracht.kies(id); }
    catch (e) { console.warn('Meetkamer: de opdracht kon niet gekozen worden (#248)', e); }
    if (!o) {
      // Niet stil falen: de reden staat in PLOpdracht.reden() en hoort gezien
      // te worden, anders druk je drie keer op dezelfde knop.
      try {
        var r = (typeof PLOpdracht.reden === 'function') ? PLOpdracht.reden() : '';
        if (typeof showToast === 'function') showToast('Die opdracht gaat niet: ' + (r || 'onbekende reden'));
      } catch (e) { console.warn('Meetkamer: de afwijzing kon niet gemeld worden (#248)', e); }
      teken();
      return null;
    }
    try {
      if (window.PLTestrunLive && typeof PLTestrunLive.nieuweSessie === 'function')
        PLTestrunLive.nieuweSessie('opdracht gewisseld naar "' + o.naam + '"');
    } catch (e) { console.warn('Meetkamer: er kon geen nieuwe sessie beginnen (#248)', e); }
    try { if (typeof showToast === 'function') showToast('Nu: ' + o.naam); }
    catch (e) { console.warn('Meetkamer: melding niet getoond (#248)', e); }
    teken();
    return o;
  }

  /* De lus loopt alleen terwijl het scherm open staat. Een tikker die
     doordraait op een gesloten overlay meet niets en kost wél accutijd — en
     dit is een app die tijdens het rijden aan de lader hangt. */
  function start() {
    if (_tikker) return;
    _open = true;
    teken();
    try { _tikker = setInterval(teken, TIK_MS); }
    catch (e) { console.warn('Meetkamer: de verversing kon niet starten — het paneel blijft op de stand van nu staan (#246)', e); }
  }

  function stop() {
    _open = false;
    if (!_tikker) return;
    try { clearInterval(_tikker); }
    catch (e) { console.warn('Meetkamer: de verversing kon niet gestopt worden (#246)', e); }
    _tikker = null;
  }

  window.PLMeetkamer = {
    stations: stations,
    oordeel: oordeel,
    meter: meter,
    ronde: ronde,
    logtelling: logtelling,
    ouderdom: ouderdom,
    getal: getal,
    momentopname: momentopname,
    html: html,
    stijlErin: stijlErin,
    teken: teken,
    klap: klap,
    laad: laad,
    pak: pak,
    _kiezer: _kiezer,
    start: start,
    stop: stop,
    open: function () { return _open; },
    _stations: function () { return STATIONS.map(function (s) { return s.sleutel; }); },
    _rand: function () { return RAND; },
    _tikMs: function () { return TIK_MS; },
    _issueVorm: function () { return ISSUE_VORM.source; }
  };
})();
