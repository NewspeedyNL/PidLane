// ══════════════════════════════════════════════════════════════════
// pidlane-meetkamer.js — de lus in beeld (#246)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS.
// Sinds #241 en #235 loopt er een lus: een meetopdracht komt als DATA uit
// Airtable binnen, de rit meet hem, de uitslagen gaan met naam en al terug de
// logtabel in, en daarbuiten wordt dat gelezen en volgt de volgende opdracht.
// Die lus werkt — op 18-09 is hij voor het eerst helemaal rondgekomen.
//
// Maar hij is ONZICHTBAAR. Wie de testrun opende zag een muur van knoppen en
// daaronder een platte regenlijst van logregels. Dat er een opdracht van
// buiten binnen was gekomen, welke vraag hij stelde, of de meting binnen de
// band viel, en of het antwoord de tabel weer had gehaald: dat stond alleen
// in het verslag, ná afloop, tussen 130 andere regels.
//
// Het gevolg is niet alleen ongemak. Een rit van 18-09 stond stil (0 km/u) en
// dat bleek pas achteraf uit een FOUT-regel — terwijl de opdracht "er is
// werkelijk gereden" als proef draagt en dat tijdens de rit al wist. Een uur
// meten leverde daardoor een antwoord op de vraag "reed je?" in plaats van een
// antwoord op #217.
//
// DIT SCHERM TOONT DE LUS TERWIJL HIJ LOOPT: welke opdracht binnen is, welke
// issues deze ronde open staan, waar elke proef staat ten opzichte van zijn
// band, en of de terugweg naar Airtable het doet.
//
// ── DE HARDE REGEL: DIT SCHERM MEET NIETS ─────────────────────────
// Elke tegel hier leest een bron die er al is — PLOpdracht, PLRit, PLBron,
// plLiveLogStatus(), PLTestrunLive. Er wordt hier geen enkele waarde zélf
// berekend, geen band zelf beoordeeld, en geen lijst issues zelf bijgehouden.
//
// Dat is geen netheid maar noodzaak. Een scherm met een eigen kopie van het
// oordeel gaat uit de pas lopen met het oordeel zelf, en dan wijst het groen
// aan waar het verslag rood zegt. §11 staat vol met die vorm (test-healthgate,
// test-waakronde, de twee lijsten van PIDLANE-WERK.md). De balk die je hier
// ziet en de FOUT-regel in het verslag komen daarom uit dezelfde aanroep:
// PLOpdracht.meet(), die sinds #246 naast `staat` ook de getallen teruggeeft.
//
// Ontbreekt een bron, dan zegt de tegel dát — hij verzint geen stand. "Niet
// gemeten" is hier een uitkomst en geen leegte, precies zoals in blok 5.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var TIK_MS = 1000;        // hoe vaak de live tegels ververst worden
  var _tikker = null;
  var _open = false;
  var _toonAlles = false;   // logfilter: alleen bevindingen, of alles

  /* De vier stations van de lus, in de volgorde waarin ze gebeuren. Eén lijst,
     want de tekening en de toestandsbepaling moeten niet los van elkaar kunnen
     verschuiven. */
  var STATIONS = [
    { sleutel: 'binnen', titel: 'Opdracht binnen', teken: '📥' },
    { sleutel: 'meten',  titel: 'De rit meet',     teken: '📈' },
    { sleutel: 'terug',  titel: 'Naar Airtable',   teken: '📤' },
    { sleutel: 'lezen',  titel: 'Claude leest',    teken: '🤖' }
  ];

  /* De vijf standen die een tegel kan hebben, met hun kleur. Meer standen
     verzinnen betekent hier bijna altijd dat er iets anders mis is: een tegel
     die "misschien" moet kunnen zeggen, leest de verkeerde bron. */
  var KLEUR = {
    'ja':     'var(--gn)',
    'bezig':  'var(--bl)',
    'wacht':  'var(--tx3)',
    'let op': 'var(--or)',
    'fout':   'var(--rd)'
  };

  function _kleur(st) { return KLEUR[st] || KLEUR.wacht; }

  function veilig(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Hoe lang geleden, in mensentaal. Geeft '' terug op onleesbare invoer in
     plaats van "NaN geleden" — een tegel die onzin toont is erger dan een
     tegel die zwijgt. */
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
  /* Zuiver: krijgt een momentopname mee en geeft de vier tegels terug. Geen
     window, geen DOM, geen klok — zodat test-meetkamer.js elke stand kan
     nabouwen zonder browser. Wat hier fout gaat is een redeneerfout en geen
     tekenfout, en die twee horen apart toetsbaar te zijn. */
  function stations(snap) {
    snap = snap || {};
    var nu = snap.nu || Date.now();
    var o = snap.opdracht || null;
    var h = snap.herkomst || null;
    var u = Array.isArray(snap.uitslagen) ? snap.uitslagen : [];
    var live = snap.live || null;
    var uit = {};

    // 1 — kwam er een opdracht binnen, en welke?
    if (snap.toggleAan === false) {
      uit.binnen = { staat: 'wacht', regel: 'het ophalen staat uit in de Config (feat_opdracht) — de rit draait zoals hij in de build staat' };
    } else if (o) {
      uit.binnen = { staat: 'ja', regel: o.naam + (o.reden ? ' · ' + o.reden : ''),
        bij: (h && h.gewijzigd) ? 'klaargezet ' + ouderdom(h.gewijzigd, nu) : '' };
    } else {
      var r = String(snap.reden || 'nog niet opgehaald');
      // Afgekeurd is een fout in wat er klaarstaat en moet opvallen; niets
      // klaarstaan is de normale stand tussen twee rondes in.
      uit.binnen = /afgekeurd/i.test(r)
        ? { staat: 'fout', regel: 'er stond een opdracht klaar en die is AFGEKEURD — ' + r }
        : { staat: 'wacht', regel: r };
    }

    // 2 — meet de rit, en met welke uitkomst tot nu toe?
    var fout = u.filter(function (x) { return x.staat === 'FOUT'; }).length;
    var letop = u.filter(function (x) { return x.staat === 'LET OP'; }).length;
    if (!o) {
      uit.meten = { staat: 'wacht', regel: 'zonder opdracht valt er hier niets te meten' };
    } else if (!u.length) {
      uit.meten = { staat: snap.bezig ? 'bezig' : 'wacht',
        regel: snap.bezig ? 'de run loopt — nog geen proef gemeten' : 'nog niet gemeten; start een meetrit' };
    } else if (fout) {
      uit.meten = { staat: 'fout', regel: fout + ' van de ' + u.length + ' buiten de band' };
    } else if (letop) {
      uit.meten = { staat: 'let op', regel: letop + ' van de ' + u.length + ' niet te meten' };
    } else {
      uit.meten = { staat: 'ja', regel: 'alle ' + u.length + ' binnen de band' };
    }

    // 3 — haalde het antwoord de tabel? Dit is de tegel die #235 opleverde:
    // vóór die meting verdween een mislukte verzending in een console.warn.
    if (!live) {
      uit.terug = { staat: 'wacht', regel: 'nog niets verstuurd naar de logtabel' };
    } else if (live.ok) {
      uit.terug = { staat: 'ja', regel: live.aantal + ' regel(s) aangekomen' + (live.status ? ' (HTTP ' + live.status + ')' : ''),
        bij: ouderdom(live.tijd, nu) };
    } else {
      uit.terug = { staat: 'fout', regel: 'de laatste zending MISLUKTE' + (live.status ? ' (HTTP ' + live.status + ')' : '') +
        (live.fout ? ' — ' + live.fout : ''), bij: ouderdom(live.tijd, nu) };
    }

    // 4 — de terugweg buiten de app. Hier kan het scherm niets meten: of er
    // gelezen is, weet alleen de andere kant. Wat het WEL kan zeggen is of er
    // iets te lezen valt, en dat is precies het nuttige signaal.
    if (u.length && uit.terug.staat === 'ja') {
      uit.lezen = { staat: 'ja', regel: 'de uitslag staat in de tabel — de volgende opdracht kan erop volgen' };
    } else if (o && h && h.gewijzigd) {
      uit.lezen = { staat: 'wacht', regel: 'deze opdracht is ' + (ouderdom(h.gewijzigd, nu) || 'onbekend oud') + ' klaargezet en nog niet beantwoord' };
    } else {
      uit.lezen = { staat: 'wacht', regel: 'wacht op een uitslag om terug te melden' };
    }

    return STATIONS.map(function (s) {
      var d = uit[s.sleutel] || { staat: 'wacht', regel: '' };
      return { sleutel: s.sleutel, titel: s.titel, teken: s.teken, staat: d.staat, regel: d.regel, bij: d.bij || '' };
    });
  }

  // ── DE METER VAN ÉÉN PROEF ────────────────────────────────────────
  /* De balk tekent niet de rauwe waarde maar de POSITIE in het venster
     lo−marge … hi+marge, met marge = een kwart van de band. De band beslaat
     daardoor altijd precies het middelste stuk (20%–80%) van de balk, hoe
     groot of klein hij ook is.

     Dat is met opzet: een vaste bandbreedte maakt twee proeven naast elkaar
     vergelijkbaar zonder de assen te lezen. Een waarde ver buiten de band
     plakt tegen de rand — dat leest als "ver weg", en dat klopt ook.

     Een band met lo === hi (één punt) heeft geen breedte; dan is de marge 1,
     anders wordt er door nul gedeeld en staat er stil NaN op het scherm. */
  var RAND = 0.2;          // waar de band begint en eindigt op de balk

  /* Ontbrekend is iets anders dan nul, en JavaScript vindt van niet:
     `Number(null)` is 0 en `Number('')` ook. Zonder deze poort werd een
     opdracht zonder band stil een band van 0 tot 0, en dan stond de meting
     keurig in het midden van een band die niet bestaat. Gevonden door
     test-meetkamer.js voordat hij een rit kostte. */
  function _getal(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return Number(v);
  }

  function meter(u) {
    u = u || {};
    var lo = _getal(u.lo), hi = _getal(u.hi);
    var basis = { staat: u.staat || 'LET OP', pid: u.pid || '', maat: u.maat || '',
                  waarde: (u.waarde === undefined ? null : u.waarde), lo: u.lo, hi: u.hi, n: u.n || 0, pos: null, bandVan: RAND, bandTot: 1 - RAND };
    if (isNaN(_getal(u.waarde))) return basis;
    if (isNaN(lo) || isNaN(hi)) return basis;

    var span = hi - lo;
    var marge = (span > 0) ? span * (RAND / (1 - 2 * RAND)) : 1;
    var v0 = lo - marge, v1 = hi + marge;
    var pos = (Number(u.waarde) - v0) / (v1 - v0);
    basis.pos = pos < 0 ? 0 : (pos > 1 ? 1 : pos);
    return basis;
  }

  // ── DE ISSUEBAAN ──────────────────────────────────────────────────
  /* Welke issues raakt deze ronde, en wat is er per issue uitgekomen?

     De lijst wordt AFGELEID en niet bijgehouden: hij komt uit PROEVEN_B5 (via
     PLTestrunLive.proeven()) plus de proeven van de opdracht die binnenkwam.
     Dat is dezelfde regel als "BLOK 5 DEKT DEZE RONDE" in CAMPAGNE, en om
     dezelfde reden — een met de hand bijgehouden tweede lijst noemde #65 open
     terwijl hij al gesloten was.

     De uitkomst per issue komt uit de geboekte logregels, gekoppeld op de
     NAAM van de proef. Dat is een exacte koppeling en geen gok: blok 5 boekt
     met `_doe(5, PROEVEN_B5[i].naam, …)`, dus de naam in het log ís de naam
     in de lijst. Verandert die koppeling, dan valt de baan leeg — zichtbaar,
     in plaats van stil verkeerd.

     Draagt één issue meer proeven, dan wint de zwaarste uitkomst: één FOUT
     maakt het issue rood, ook al stonden de andere twee op groen. Een issue
     dat half goed is, is niet af. */
  var RANG = { 'fout': 3, 'let op': 2, 'ja': 1, 'wacht': 0 };

  function issuebaan(snap) {
    snap = snap || {};
    var proeven = Array.isArray(snap.proeven) ? snap.proeven : [];
    var log = Array.isArray(snap.log) ? snap.log : [];
    var o = snap.opdracht || null;

    // naam → staat, uit de geboekte regels van blok 5.
    var geboekt = {};
    log.forEach(function (r) {
      if (!r || r.blok !== 5 || !r.naam) return;
      var st = String(r.staat || '').toUpperCase();
      geboekt[r.naam] = (st === 'FOUT') ? 'fout' : (st === 'LET OP' || st === 'LETOP') ? 'let op' : 'ja';
    });

    var perIssue = {};
    function draag(issue, naam, staat, herkomst) {
      if (!issue || issue === '—') return;
      var b = perIssue[issue] || (perIssue[issue] = { issue: issue, staat: 'wacht', proeven: [], herkomst: herkomst });
      b.proeven.push({ naam: naam, staat: staat });
      if (RANG[staat] > RANG[b.staat]) b.staat = staat;
      // Een issue dat zowel in de vaste lijst als in de opdracht zit, is het
      // interessantst: daar wordt van buiten aan gestuurd.
      if (herkomst === 'opdracht') b.herkomst = 'opdracht';
    }

    proeven.forEach(function (p) { draag(p.issue, p.naam, geboekt[p.naam] || 'wacht', 'blok5'); });
    if (o && Array.isArray(o.proeven)) {
      var uit = {};
      (snap.uitslagen || []).forEach(function (x) { if (x && x.naam) uit[x.naam] = x.staat; });
      o.proeven.forEach(function (p) {
        var st = uit[p.naam];
        draag(p.issue, p.naam, st === 'FOUT' ? 'fout' : st === 'LET OP' ? 'let op' : st === 'ok' ? 'ja' : 'wacht', 'opdracht');
      });
    }

    return Object.keys(perIssue)
      .sort(function (a, b) {
        var v = RANG[perIssue[b].staat] - RANG[perIssue[a].staat];
        return v || a.localeCompare(b);
      })
      .map(function (k) { return perIssue[k]; });
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

    // De proeven van de opdracht NU meten, met dezelfde functie waarmee blok 5
    // ze straks beoordeelt. Dat is de hele reden dat dit scherm tijdens de rit
    // iets waard is: je ziet het oordeel aankomen in plaats van te wachten.
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

  // ══════════════════════════════════════════════════════════════════
  // TEKENEN
  // ══════════════════════════════════════════════════════════════════
  function _tegel(st) {
    var kl = _kleur(st.staat);
    var puls = (st.staat === 'bezig') ? 'animation:plmkPuls 1.4s ease-in-out infinite;' : '';
    return '<div style="flex:1 1 128px;min-width:128px;background:var(--sur);border:1px solid var(--bd);' +
        'border-left:3px solid ' + kl + ';border-radius:9px;padding:8px 10px;' + puls + '">' +
      '<div style="font:800 10px var(--f);letter-spacing:.4px;text-transform:uppercase;color:var(--tx3);margin-bottom:3px">' +
        st.teken + ' ' + veilig(st.titel) + '</div>' +
      '<div style="font:700 11.5px var(--f);color:' + kl + ';line-height:1.35">' + veilig(st.regel) + '</div>' +
      (st.bij ? '<div style="font:500 10px var(--f);color:var(--tx3);margin-top:3px">' + veilig(st.bij) + '</div>' : '') +
    '</div>';
  }

  function _meterRij(m, naam) {
    var kl = m.staat === 'ok' ? 'var(--gn)' : m.staat === 'FOUT' ? 'var(--rd)' : 'var(--or)';
    var h = '<div style="padding:7px 0;border-top:1px solid var(--bd)">' +
      '<div style="display:flex;gap:7px;align-items:baseline;margin-bottom:5px">' +
        '<span style="font:700 11.5px var(--f);color:var(--tx);flex:1">' + veilig(naam) + '</span>' +
        '<span style="font:800 12px var(--f);color:' + kl + '">' +
          (m.waarde === null ? 'niet gemeten' : veilig(m.waarde)) + '</span>' +
      '</div>';

    if (m.pos === null) {
      // Geen balk zonder waarde. Een lege balk tekenen zou suggereren dat de
      // meting op nul staat, en dat is iets heel anders dan niet gemeten.
      h += '<div style="font:500 10.5px var(--f);color:var(--tx3)">' +
        veilig(m.pid + ' ' + m.maat) + ' — nog geen monster in het ritbeeld</div>';
    } else {
      h += '<div style="position:relative;height:9px;border-radius:5px;background:var(--sur2);overflow:hidden">' +
          // de band zelf: het stuk waar de waarde in hoort te vallen
          '<div style="position:absolute;top:0;bottom:0;left:' + (m.bandVan * 100) + '%;right:' + ((1 - m.bandTot) * 100) + '%;' +
            'background:var(--gns);border-left:1px solid var(--gn);border-right:1px solid var(--gn)"></div>' +
          // de meting
          '<div style="position:absolute;top:-2px;bottom:-2px;left:calc(' + (m.pos * 100) + '% - 2px);width:4px;border-radius:2px;background:' + kl + '"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font:500 10px var(--f);color:var(--tx3);margin-top:3px">' +
          '<span>' + veilig(m.lo) + '</span>' +
          '<span>' + veilig(m.pid + ' ' + m.maat + ' · ' + m.n + ' monster(s)') + '</span>' +
          '<span>' + veilig(m.hi) + '</span>' +
        '</div>';
    }
    return h + '</div>';
  }

  function _issueChip(b) {
    var kl = _kleur(b.staat);
    var teken = b.staat === 'ja' ? '✓' : b.staat === 'fout' ? '✕' : b.staat === 'let op' ? '!' : '·';
    var titel = b.proeven.map(function (p) { return p.naam; }).join(' · ');
    return '<span title="' + veilig(titel) + '" style="display:inline-flex;align-items:center;gap:4px;' +
      'background:var(--sur2);border:1px solid ' + kl + ';border-radius:20px;padding:3px 9px;' +
      'font:700 11px var(--f);color:' + kl + '">' +
      teken + ' ' + veilig(b.issue) +
      (b.herkomst === 'opdracht' ? '<span style="font-size:9px;opacity:.75">van buiten</span>' : '') +
      '</span>';
  }

  /* Het hele paneel. Geeft HTML terug in plaats van zelf te schrijven, zodat
     de browserproef hem kan opvragen zonder de testrun te openen. */
  function html(s) {
    s = s || momentopname();
    var h = '<style>@keyframes plmkPuls{0%,100%{opacity:1}50%{opacity:.55}}</style>';

    // ── kop: waar draait dit, en onder welk ritnummer
    h += '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px">' +
      '<span style="font:800 11px var(--f);letter-spacing:.4px;text-transform:uppercase;color:var(--tx3)">De lus</span>' +
      (s.bron ? '<span style="font:600 10.5px var(--f);color:' + (/PREVIEW/.test(s.bron) ? 'var(--or)' : 'var(--tx3)') + '">' + veilig(s.bron) + '</span>' : '') +
      (s.ritId ? '<span style="margin-left:auto;font:600 10.5px var(--f);color:var(--tx3)">rit ' + veilig(s.ritId) + '</span>' : '') +
    '</div>';

    // ── de vier stations
    h += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:11px">' +
      stations(s).map(_tegel).join('') + '</div>';

    // ── de opdracht met zijn meters
    if (s.opdracht) {
      var o = s.opdracht;
      h += '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:11px">' +
        '<div style="font:800 12.5px var(--f);color:var(--tx);margin-bottom:2px">🎯 ' + veilig(o.naam) + '</div>' +
        (o.reden ? '<div style="font:500 11px var(--f);color:var(--tx2);margin-bottom:7px">' + veilig(o.reden) + '</div>' : '') +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">' +
          o.sensoren.map(function (p) {
            return '<span style="background:var(--sur2);border:1px solid var(--bd);border-radius:5px;padding:2px 6px;font:700 10px var(--f);color:var(--tx2)">' + veilig(p) + '</span>';
          }).join('') +
          '<span style="font:500 10px var(--f);color:var(--tx3);align-self:center;margin-left:4px">' +
            Math.round(o.duurS / 60) + ' min · elke ' + o.tikS + ' s</span>' +
        '</div>' +
        s.uitslagen.map(function (u) { return _meterRij(meter(u), u.naam); }).join('') +
      '</div>';
    }

    // ── de issuebaan
    var baan = issuebaan(s);
    if (baan.length) {
      h += '<div style="margin-bottom:11px">' +
        '<div style="font:800 11px var(--f);letter-spacing:.4px;text-transform:uppercase;color:var(--tx3);margin-bottom:5px">' +
          'Waar deze rit aan werkt · ' + baan.length + ' issue(s)</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' + baan.map(_issueChip).join('') + '</div>' +
      '</div>';
    }

    return h;
  }

  // ── de lijm met het testrunscherm ─────────────────────────────────
  /* Het paneel hangt bovenin de bestaande testrunoverlay. Eigen bakje, zodat
     _teken() van de testrun zijn eigen helft kan blijven overschrijven zonder
     dit weg te gooien — twee functies die in hetzelfde element schrijven is
     hier al eerder een bug geweest. */
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

  /* De lus loopt alleen terwijl het scherm open staat. Een tikker die
     doordraait op een gesloten overlay meet niets en kost wél bus- en
     accutijd — en dit is een app die tijdens het rijden aan de lader hangt
     omdat elke milliampère telt. */
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
    meter: meter,
    issuebaan: issuebaan,
    ouderdom: ouderdom,
    momentopname: momentopname,
    html: html,
    teken: teken,
    start: start,
    stop: stop,
    open: function () { return _open; },
    _stations: function () { return STATIONS.map(function (s) { return s.sleutel; }); },
    _rand: function () { return RAND; },
    _tikMs: function () { return TIK_MS; },
    _filter: function (aan) { if (aan !== undefined) _toonAlles = !!aan; return _toonAlles; }
  };
})();
