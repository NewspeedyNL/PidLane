// ══════════════════════════════════════════════════════════════════
// pidlane-opdracht.js — een meetopdracht van buiten, als DATA (#241)
// ──────────────────────────────────────────────────────────────────
// WAT DIT IS, EN WAAROM HET GEEN SCRIPT IS.
//
// De lus die dit sluit: de testrun schrijft tijdens de rit naar de logtabel,
// die tabel wordt buiten de app gelezen, en op grond daarvan hoort er een
// volgende meting te komen — zonder dat daar een deploy tussen zit. De vraag
// was of dat met een SCRIPT uit Airtable moest. Het antwoord is nee, en de
// reden staat in issue #238: elke andere weg naar de app loopt langs
// plcheck.sh, plmutate.sh, de browserproeven en het label `klaar`. Een rij
// met JavaScript erin is een tweede deploy zonder één van die poorten, en hij
// draait met alle rechten van de pagina: het klanttegoed, de sessie, het
// VIN-zout.
//
// Wat er werkelijk verstuurd moet worden is ook geen code. Het is een
// OPDRACHT: meet deze sensoren, zo lang, vraag dit aan de bestuurder, en
// meld het als deze waarde buiten die grens valt. Dat is data. De uitvoering
// staat in de app en is door de poort gegaan.
//
// DE VALIDATIE IS DE GRENS, EN HIJ SLUIT BIJ TWIJFEL.
// `keur()` hieronder is het enige wat tussen een rij in Airtable en de meting
// staat. Daarom: een witte lijst van sleutels (een onbekende sleutel is een
// afwijzing en geen waarschuwing), harde grenzen op aantallen en lengtes, en
// PID-codes die aan de vorm moeten voldoen. Alles wat hij doorlaat wordt
// straks door de testrun uitgevoerd, dus wat hier doorheen glipt is geen
// tikfout maar een gedragsverandering op een rijdende auto.
//
// WAT EEN OPDRACHT NIET KAN. Hij kan geen code laten draaien, geen endpoint
// aanroepen, geen scherm bouwen en niets naar de ECU schrijven. Hij kan
// alleen: sensoren aanzetten, een duur en een tempo voorstellen, vragen
// stellen die als tekst in het verslag komen, en drempels benoemen waarop de
// testrun een bevinding meldt. Dat is met opzet de hele lijst.
//
// WAAR HIJ GEBRUIKT WORDT. Alleen door de testrun, en die zit achter
// isAdmin(). Een klant die de app opent haalt deze opdracht nooit op.
//
// EN DE UITZETKNOP: `feat_opdracht` in de Config (Airtable → beheer.html).
// Uit betekent dat de app de opdracht niet ophaalt en de testrun draait zoals
// hij in de build staat.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SLEUTEL = 'feat_opdracht';   // de Config-schakelaar
  var SCHEMA = 2;                  // welke vorm deze app SCHRIJFT
  /* WELKE VORMEN HIJ LEEST (#257). Schema 1 kent geen `voorwaarden`. Die
     rijen blijven gewoon draaien, en dat is geen coulance maar noodzaak: er
     staat een voorraad van in de tabel, en een opdracht afkeuren op zijn
     versienummer kost een rit — de schaarste in dit project.

     Een nieuwe sleutel is dus additief: bekend in 2, afwezig in 1, geldig in
     allebei. Wordt een sleutel ooit VERPLICHT of verandert zijn betekenis,
     dan is dat wél een nieuw schema dat oude rijen afwijst. */
  var SCHEMAS = [1, 2];

  /* De grenzen op één plek, zodat de test ze kan opvragen in plaats van ze
     over te schrijven. Een test met zijn eigen kopie van de grenzen kan per
     definitie niet rood worden als de grens verandert. */
  var GRENZEN = {
    jsonMax: 8192,        // de hele opdracht, in tekens
    naamMax: 80,
    redenMax: 200,
    sensorenMax: 12,
    duurMin: 30, duurMax: 1800,
    tikMin: 1, tikMax: 60,
    vragenMax: 5, vraagTekstMax: 160, optiesMax: 5, optieMax: 40,
    drempelsMax: 8, meldingMax: 120,
    proevenMax: 6, proefNaamMax: 80, issueMax: 12,
    voorwaardenMax: 6, watMax: 60, stapMax: 40
  };

  // Wat `meet` mag zijn. Precies de velden die PLRit.per() werkelijk bijhoudt —
  // geen 'gemiddelde', want dat houdt de ritwaarnemer niet bij en dan zou deze
  // lijst iets beloven wat de app niet heeft.
  var MATEN = ['min', 'max', 'laatst', 'aantal', 'veranderingen'];

  // Een PID zoals de rest van de app hem schrijft: mode + code, hex.
  var PID_VORM = /^0[1-9A-F][0-9A-F]{2}$/i;

  var _actief = null;      // de laatst goedgekeurde opdracht
  var _herkomst = null;    // waar hij vandaan kwam: id, naam, hash
  var _laatsteFout = null; // waarom er geen opdracht is

  /* ── MEER DAN ÉÉN VRAAG PER RIT (#248, 18-09-2026) ───────────────
     Een rit is hier de schaarste, niet de rekentijd. Tot nu toe beantwoordde
     één rit één vraag: de actieve rij uit Airtable. Wie #217 én #19 wilde
     weten reed twee keer, en dat is vier keer zo duur als het klinkt — je
     moet ook twee keer de goede omstandigheden treffen.

     Deze lijst maakt dat één rit meerdere vragen kan beantwoorden. Hij wordt
     NIET automatisch geladen: de gewone haal() blijft de actieve rij pakken,
     precies zoals hij deed. Pas als iemand op de keuzeknop drukt komt de
     lijst binnen, en dan kiest een mens welke vraag er nu gemeten wordt.

     `_gedaan` onthoudt per opdracht wat de uitslag was in DEZE app-sessie.
     Dat is wat de knoppen laten zien: welke vragen zijn beantwoord en welke
     wachten nog. Het staat in het geheugen en niet in localStorage — een
     uitslag van twee ritten geleden zegt niets over nu, en dat is precies de
     vergissing die de waakronde-historie bewust ook niet maakt. */
  var _opdrachten = null;  // alle opdrachten uit de tabel, of null als ze niet opgehaald zijn
  var _gedaan = {};        // id -> { staat, tijd, aantal, goed }

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('Opdrachtmelding niet in de app-log gezet', e); }
  }

  function toggleAan() {
    try {
      if (typeof featOn === 'function') return !!featOn(SLEUTEL);
      var v = (window.PID_CONFIG || {})[SLEUTEL];
      if (v === undefined || v === null || v === '') return true;
      return (v === true || v === 'true' || v === '1' || v === 1);
    } catch (e) {
      console.warn('Opdracht: Config niet leesbaar — de functie blijft aan (#241)', e);
      return true;
    }
  }

  // ── kleine keurders, zodat keur() leesbaar blijft ─────────────────
  function _tekst(w, max) { return typeof w === 'string' && w.length > 0 && w.length <= max; }
  function _getal(w, min, max) { return typeof w === 'number' && isFinite(w) && w >= min && w <= max; }
  function _lijst(w, max) { return Array.isArray(w) && w.length > 0 && w.length <= max; }

  /* Bestaat deze PID in de app? getPidDef() is de bestaande ingang naar alle
     drie de tabellen (ontdekte PIDs, ALL_PID_DEFS en de basislijst) — hier een
     eigen tabel naast zetten zou dezelfde fout zijn als in test-waakronde.js:
     een lijst die naast de echte loopt en er langzaam vanaf gaat wijken.

     Ontbreekt die functie (een losse test zonder de app eromheen), dan blijft
     de vormcontrole over en is de uitkomst `null` — niet stil doorlaten én
     niet stil weigeren, want het verschil hoort in de fouttekst te staan. */
  function _pidBekend(pid) {
    try {
      if (typeof getPidDef !== 'function') return null;
      return !!getPidDef(String(pid).toUpperCase());
    } catch (e) {
      console.warn('Opdracht: PID-tabel niet leesbaar (#241)', e);
      return null;
    }
  }

  /* DE GRENS. Ruwe invoer erin, of een opdracht eruit óf een lijst met redenen.
     Geen halve uitkomst: een opdracht waarvan één onderdeel niet deugt wordt
     in zijn geheel afgewezen. Half uitvoeren is hier het gevaarlijkst — dan
     meet de rit iets anders dan er op papier staat en klopt de conclusie
     eronder niet meer. */
  function keur(ruw) {
    var fouten = [];
    var o = ruw;

    if (typeof o === 'string') {
      if (o.length > GRENZEN.jsonMax)
        return { ok: false, fouten: ['de opdracht is ' + o.length + ' tekens; meer dan ' + GRENZEN.jsonMax + ' wordt niet gelezen'] };
      try { o = JSON.parse(o); }
      catch (e) { return { ok: false, fouten: ['geen geldige JSON: ' + (e.message || e)] }; }
    }
    if (!o || typeof o !== 'object' || Array.isArray(o))
      return { ok: false, fouten: ['de opdracht is geen object'] };

    // DE WITTE LIJST. Een onbekende sleutel is een afwijzing: hij betekent dat
    // de schrijver iets bedoelde wat deze app niet kent, en dan is doorgaan
    // met de rest een meting die iets anders doet dan er staat.
    var TOEGESTAAN = ['schema', 'naam', 'reden', 'sensoren', 'duurS', 'tikS', 'vragen', 'drempels', 'proeven', 'voorwaarden'];
    Object.keys(o).forEach(function (k) {
      if (TOEGESTAAN.indexOf(k) === -1) fouten.push('onbekende sleutel `' + k + '`');
    });

    if (SCHEMAS.indexOf(o.schema) === -1)
      fouten.push('schema is ' + JSON.stringify(o.schema) + ', deze app leest schema ' + SCHEMAS.join(' en '));
    if (!_tekst(o.naam, GRENZEN.naamMax)) fouten.push('naam ontbreekt of is langer dan ' + GRENZEN.naamMax);
    if (o.reden !== undefined && !_tekst(o.reden, GRENZEN.redenMax)) fouten.push('reden is langer dan ' + GRENZEN.redenMax);

    if (!_lijst(o.sensoren, GRENZEN.sensorenMax)) {
      fouten.push('sensoren ontbreekt of telt meer dan ' + GRENZEN.sensorenMax);
    } else {
      o.sensoren.forEach(function (p) {
        if (!PID_VORM.test(String(p))) { fouten.push('`' + p + '` is geen PID-code'); return; }
        if (_pidBekend(p) === false) fouten.push('PID ' + p + ' kent deze app niet');
      });
    }

    if (!_getal(o.duurS, GRENZEN.duurMin, GRENZEN.duurMax))
      fouten.push('duurS moet tussen ' + GRENZEN.duurMin + ' en ' + GRENZEN.duurMax + ' seconden liggen');
    if (o.tikS !== undefined && !_getal(o.tikS, GRENZEN.tikMin, GRENZEN.tikMax))
      fouten.push('tikS moet tussen ' + GRENZEN.tikMin + ' en ' + GRENZEN.tikMax + ' seconden liggen');

    if (o.vragen !== undefined) {
      if (!Array.isArray(o.vragen) || o.vragen.length > GRENZEN.vragenMax) {
        fouten.push('vragen is geen lijst van hoogstens ' + GRENZEN.vragenMax);
      } else {
        o.vragen.forEach(function (v, i) {
          if (!v || typeof v !== 'object') { fouten.push('vraag ' + i + ' is geen object'); return; }
          if (!/^[a-z0-9_]{1,24}$/.test(String(v.id || ''))) fouten.push('vraag ' + i + ': id moet a-z, 0-9 of _ zijn');
          if (!_tekst(v.tekst, GRENZEN.vraagTekstMax)) fouten.push('vraag ' + i + ': tekst ontbreekt of is te lang');
          if (v.opties !== undefined) {
            if (!_lijst(v.opties, GRENZEN.optiesMax)) fouten.push('vraag ' + i + ': opties is geen lijst van hoogstens ' + GRENZEN.optiesMax);
            else v.opties.forEach(function (w) { if (!_tekst(w, GRENZEN.optieMax)) fouten.push('vraag ' + i + ': een optie is leeg of te lang'); });
          }
        });
      }
    }

    if (o.drempels !== undefined) {
      if (!Array.isArray(o.drempels) || o.drempels.length > GRENZEN.drempelsMax) {
        fouten.push('drempels is geen lijst van hoogstens ' + GRENZEN.drempelsMax);
      } else {
        o.drempels.forEach(function (d, i) {
          if (!d || typeof d !== 'object') { fouten.push('drempel ' + i + ' is geen object'); return; }
          if (!PID_VORM.test(String(d.pid))) fouten.push('drempel ' + i + ': `' + d.pid + '` is geen PID-code');
          var heeft = (typeof d.onder === 'number') || (typeof d.boven === 'number');
          if (!heeft) fouten.push('drempel ' + i + ': geen `onder` of `boven` opgegeven');
          if (!_tekst(d.melding, GRENZEN.meldingMax)) fouten.push('drempel ' + i + ': melding ontbreekt of is te lang');
        });
      }
    }

    if (o.proeven !== undefined) {
      if (!Array.isArray(o.proeven) || o.proeven.length > GRENZEN.proevenMax) {
        fouten.push('proeven is geen lijst van hoogstens ' + GRENZEN.proevenMax);
      } else {
        o.proeven.forEach(function (p, i) {
          if (!p || typeof p !== 'object') { fouten.push('proef ' + i + ' is geen object'); return; }
          if (p.issue !== undefined && !_tekst(p.issue, GRENZEN.issueMax)) fouten.push('proef ' + i + ': issue is te lang');
          if (!_tekst(p.naam, GRENZEN.proefNaamMax)) fouten.push('proef ' + i + ': naam ontbreekt of is te lang');
          if (!PID_VORM.test(String(p.pid))) fouten.push('proef ' + i + ': `' + p.pid + '` is geen PID-code');
          if (MATEN.indexOf(String(p.meet)) === -1)
            fouten.push('proef ' + i + ': meet moet een van ' + MATEN.join(', ') + ' zijn');
          if (!Array.isArray(p.tussen) || p.tussen.length !== 2 ||
              typeof p.tussen[0] !== 'number' || typeof p.tussen[1] !== 'number' ||
              !(p.tussen[0] <= p.tussen[1]))
            fouten.push('proef ' + i + ': tussen moet [laag, hoog] zijn met laag <= hoog');
        });
      }
    }

    /* ── DE VOORWAARDEN (#257) ────────────────────────────────────
       Een voorwaarde is meetbaar en geen proza, in dezelfde vorm als een
       proef. Twee soorten, en meer worden het er niet zonder besluit:

         { wat, pid, meet, tussen }   de AUTO moet iets gedaan hebben
         { wat, stap }                de BESTUURDER moet iets gedaan hebben

       `wat` is de naam die de bestuurder vóór de rit te zien krijgt, dus hij
       is verplicht — een vinkje zonder naam is een vinkje waar niemand iets
       aan heeft. */
    if (o.voorwaarden !== undefined) {
      if (!Array.isArray(o.voorwaarden) || o.voorwaarden.length > GRENZEN.voorwaardenMax) {
        fouten.push('voorwaarden is geen lijst van hoogstens ' + GRENZEN.voorwaardenMax);
      } else {
        o.voorwaarden.forEach(function (v, i) {
          if (!v || typeof v !== 'object') { fouten.push('voorwaarde ' + i + ' is geen object'); return; }
          if (!_tekst(v.wat, GRENZEN.watMax)) fouten.push('voorwaarde ' + i + ': wat ontbreekt of is langer dan ' + GRENZEN.watMax);
          var isStap = (v.stap !== undefined);
          var isMeting = (v.pid !== undefined);
          if (isStap === isMeting) {
            fouten.push('voorwaarde ' + i + ': geef óf `stap` óf `pid`, niet allebei en niet geen van beide');
            return;
          }
          if (isStap) {
            if (!_tekst(v.stap, GRENZEN.stapMax)) fouten.push('voorwaarde ' + i + ': stap ontbreekt of is te lang');
            return;
          }
          if (!PID_VORM.test(String(v.pid))) fouten.push('voorwaarde ' + i + ': `' + v.pid + '` is geen PID-code');
          if (MATEN.indexOf(String(v.meet)) === -1)
            fouten.push('voorwaarde ' + i + ': meet moet een van ' + MATEN.join(', ') + ' zijn');
          if (!Array.isArray(v.tussen) || v.tussen.length !== 2 ||
              typeof v.tussen[0] !== 'number' || typeof v.tussen[1] !== 'number' ||
              !(v.tussen[0] <= v.tussen[1]))
            fouten.push('voorwaarde ' + i + ': tussen moet [laag, hoog] zijn met laag <= hoog');
        });
      }
    }

    if (fouten.length) return { ok: false, fouten: fouten };

    // Alleen wat hierboven is goedgekeurd gaat mee. Een kopie, en met opzet
    // veld voor veld: dan kan er niets meeliften wat niet gekeurd is.
    return {
      ok: true,
      opdracht: {
        // Het schema van de RIJ en niet van deze app: een rij van schema 1
        // die hier als 2 terugkomt, liegt over wat er in de tabel staat.
        schema: o.schema,
        naam: o.naam,
        reden: o.reden || '',
        sensoren: o.sensoren.map(function (p) { return String(p).toUpperCase(); }),
        duurS: o.duurS,
        tikS: o.tikS === undefined ? 5 : o.tikS,
        vragen: (o.vragen || []).map(function (v) {
          return { id: v.id, tekst: v.tekst, opties: (v.opties || []).slice() };
        }),
        drempels: (o.drempels || []).map(function (d) {
          return { pid: String(d.pid).toUpperCase(), onder: d.onder, boven: d.boven, melding: d.melding };
        }),
        proeven: (o.proeven || []).map(function (p) {
          return { issue: p.issue || '—', naam: p.naam, pid: String(p.pid).toUpperCase(),
                   meet: String(p.meet), tussen: [p.tussen[0], p.tussen[1]] };
        }),
        voorwaarden: (o.voorwaarden || []).map(function (v) {
          return (v.stap !== undefined)
            ? { wat: v.wat, stap: String(v.stap) }
            : { wat: v.wat, pid: String(v.pid).toUpperCase(),
                meet: String(v.meet), tussen: [v.tussen[0], v.tussen[1]] };
        })
      }
    };
  }

  /* De opdracht ophalen. Via de Worker en niet rechtstreeks bij Airtable: de
     token hoort server-side, en de Worker kan de grootte begrenzen vóórdat er
     iets in deze app komt. */
  function haal() {
    _laatsteFout = null;
    if (!toggleAan()) {
      _laatsteFout = 'uitgezet in de Config (`' + SLEUTEL + '`)';
      return Promise.resolve(null);
    }
    if (typeof PROXY_URL === 'undefined' || !PROXY_URL) {
      _laatsteFout = 'geen PROXY_URL — de app weet niet waar hij moet vragen';
      return Promise.resolve(null);
    }
    // plFetch woont in pidlane-fuel.js en zet de tokenkop erop. Ontbreekt hij,
    // dan is dat geen netwerkfout maar een bedradingsfout, en die hoort zo te
    // heten -- vandaar de guard én de regel in pidlane-bedrading.js.
    if (typeof plFetch !== 'function') {
      _laatsteFout = 'plFetch ontbreekt — de opdracht kan niet opgehaald worden';
      return Promise.resolve(null);
    }
    return Promise.resolve(plFetch(PROXY_URL + '/airtable/opdracht', { method: 'GET' }))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        d = d || {};
        if (!d.opdracht) {
          _laatsteFout = 'er staat geen actieve opdracht klaar';
          _actief = null; _herkomst = null;
          return null;
        }
        var k = keur(d.opdracht);
        if (!k.ok) {
          // NIET stil terugvallen op de vorige opdracht: dan meet de rit iets
          // anders dan er in Airtable staat en is het verschil onzichtbaar.
          _actief = null; _herkomst = null;
          _laatsteFout = 'afgekeurd: ' + k.fouten.join('; ');
          _log('Meetopdracht afgekeurd — ' + _laatsteFout, 'warn');
          return null;
        }
        _actief = k.opdracht;
        _herkomst = { id: d.id || '', naam: d.naam || k.opdracht.naam, gewijzigd: d.gewijzigd || '' };
        _log('Meetopdracht geladen: ' + _actief.naam + ' (' + _actief.sensoren.length + ' sensoren, ' +
             Math.round(_actief.duurS / 60) + ' min)', 'ok');
        return _actief;
      })
      .catch(function (e) {
        _actief = null; _herkomst = null;
        _laatsteFout = 'niet opgehaald: ' + ((e && e.message) || e);
        console.warn('Opdracht: ophalen mislukt (#241)', e);
        return null;
      });
  }

  /* ── DE LIJST OPHALEN ─────────────────────────────────────────────
     Zelfde route, zelfde token, zelfde keuring — alleen `?alle=1` erbij. Elke
     rij loopt door keur(), en een afgekeurde rij blijft in de lijst staan MET
     de reden. Dat is met opzet: een opdracht die je in Airtable ziet staan en
     die op je telefoon ontbreekt is een half uur zoeken, en de reden staat
     dan nergens. Nu staat hij op de knop. */
  function lijst() {
    _laatsteFout = null;
    if (!toggleAan()) {
      _laatsteFout = 'uitgezet in de Config (`' + SLEUTEL + '`)';
      return Promise.resolve([]);
    }
    if (typeof PROXY_URL === 'undefined' || !PROXY_URL) {
      _laatsteFout = 'geen PROXY_URL — de app weet niet waar hij moet vragen';
      return Promise.resolve([]);
    }
    if (typeof plFetch !== 'function') {
      _laatsteFout = 'plFetch ontbreekt — de lijst kan niet opgehaald worden';
      return Promise.resolve([]);
    }
    return Promise.resolve(plFetch(PROXY_URL + '/airtable/opdracht?alle=1', { method: 'GET' }))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var rijen = (d && Array.isArray(d.opdrachten)) ? d.opdrachten : [];
        _opdrachten = rijen.map(function (rij) {
          var uit = { id: rij.id || '', naam: rij.naam || '', reden: rij.reden || '',
                      actief: !!rij.actief, gewijzigd: rij.gewijzigd || '', opdracht: null, fout: '' };
          if (rij.weg) { uit.fout = String(rij.weg); return uit; }
          var k = keur(rij.opdracht);
          if (!k.ok) { uit.fout = 'afgekeurd: ' + k.fouten.join('; '); return uit; }
          uit.opdracht = k.opdracht;
          if (!uit.naam) uit.naam = k.opdracht.naam;
          if (!uit.reden) uit.reden = k.opdracht.reden || '';
          return uit;
        });
        _log(_opdrachten.length + ' meetopdracht(en) opgehaald', 'ok');
        return _opdrachten.slice();
      })
      .catch(function (e) {
        _laatsteFout = 'lijst niet opgehaald: ' + ((e && e.message) || e);
        console.warn('Opdracht: de lijst ophalen mislukt (#248)', e);
        return [];
      });
  }

  /* Eén opdracht uit de lijst als de actieve zetten. Geen netwerkverkeer: hij
     is al opgehaald én gekeurd. Een id dat niet bestaat of een rij die
     afgekeurd is, verandert NIETS — stil de vorige laten staan terwijl de
     gebruiker denkt dat hij gewisseld heeft, is precies de verwarring die
     #241 met zijn "niet stil terugvallen" al uitsloot. */
  function kies(id) {
    if (!_opdrachten) { _laatsteFout = 'de lijst is nog niet opgehaald'; return null; }
    var rij = null;
    for (var i = 0; i < _opdrachten.length; i++) if (_opdrachten[i].id === id) { rij = _opdrachten[i]; break; }
    if (!rij) { _laatsteFout = 'geen opdracht met id ' + id; return null; }
    if (!rij.opdracht) { _laatsteFout = rij.fout || 'die opdracht is niet bruikbaar'; return null; }
    _actief = rij.opdracht;
    _herkomst = { id: rij.id, naam: rij.naam, gewijzigd: rij.gewijzigd };
    _laatsteFout = null;
    _log('Meetopdracht gekozen: ' + _actief.naam + ' (' + _actief.sensoren.length + ' sensoren, ' +
         Math.round(_actief.duurS / 60) + ' min)', 'ok');
    return _actief;
  }

  /* Wat er van een opdracht terechtkwam, voor de knoppen. Wordt door de
     testrun aangeroepen zodra blok 5 zijn uitslagen heeft — één plek die het
     opschrijft, zodat het scherm niet zelf gaat tellen. */
  function noteer(id, uitslagen) {
    if (!id) return null;
    var u = Array.isArray(uitslagen) ? uitslagen : [];
    var fout = u.filter(function (x) { return x && x.staat === 'FOUT'; }).length;
    var letop = u.filter(function (x) { return x && x.staat === 'LET OP'; }).length;
    var goed = u.filter(function (x) { return x && x.staat === 'ok'; }).length;
    _gedaan[id] = {
      staat: fout ? 'fout' : (letop ? 'let op' : (u.length ? 'ja' : 'wacht')),
      tijd: Date.now(), aantal: u.length, goed: goed
    };
    return _gedaan[id];
  }

  function gedaan(id) {
    if (id) return _gedaan[id] ? Object.assign({}, _gedaan[id]) : null;
    return JSON.parse(JSON.stringify(_gedaan));
  }

  /* De sensoren van de opdracht aanzetten. Apart van haal(), want ophalen is
     iets anders dan ingrijpen in wat er gemeten wordt — en de testrun bepaalt
     zelf wanneer dat mag. Geeft terug wat er werkelijk bijkwam. */
  function zetSensoren() {
    if (!_actief) return [];
    var erbij = [];
    try {
      if (typeof activePIDs === 'undefined' || !activePIDs) return [];
      _actief.sensoren.forEach(function (p) {
        if (!activePIDs.has(p)) { activePIDs.add(p); erbij.push(p); }
      });
    } catch (e) {
      console.warn('Opdracht: sensoren niet aangezet (#241)', e);
    }
    return erbij;
  }

  /* Eén proef uit de opdracht uitvoeren tegen wat de ritwaarnemer heeft
     gezien. Geen eigen boekhouding: PLRit.per() is de bron die er al is.

     DE UITSLAG DRAAGT SINDS 18-09 OOK DE GETALLEN (#246). `staat` en `detail`
     zijn voor het verslag; `waarde`, `lo`, `hi` en `n` zijn voor het scherm,
     dat tijdens de rit een balk tekent van waar de meting in de band staat.

     Waarom niet uit `detail` terugparsen: dat is een tweede plek die dezelfde
     betekenis draagt, en die lopen hier uit de pas — precies waar §11 vol mee
     staat. Eén oordeel, één bron, twee uitgangen. Een tekening die iets
     anders zegt dan het verslag is dan onmogelijk in plaats van onwaarschijnlijk.

     `waarde` is null als er niets te meten viel; dat is iets anders dan 0 en
     het scherm hoort dat verschil te tonen. */
  function meet(proef) {
    var per = null;
    try { per = (window.PLRit && typeof PLRit.per === 'function') ? PLRit.per() : null; }
    catch (e) { console.warn('Opdracht: ritbeeld onleesbaar (#241)', e); }
    if (!per) return _uit('LET OP', 'geen ritbeeld — PLRit draait niet, dus deze opdracht is niet te meten', proef, null, 0);

    var r = per[proef.pid];
    if (!r || !r.n) return _uit('LET OP', proef.pid + ' is deze rit niet gemeten — niet-gemeten is geen waarde', proef, null, 0);

    var w = (proef.meet === 'aantal') ? r.n
          : (proef.meet === 'veranderingen') ? r.veranderingen
          : (proef.meet === 'laatst') ? r.laatst
          : (proef.meet === 'min') ? r.min : r.max;
    if (w === undefined || w === null)
      return _uit('LET OP', proef.pid + ': "' + proef.meet + '" staat niet in het ritbeeld', proef, null, r.n);

    var lo = proef.tussen[0], hi = proef.tussen[1];
    var binnen = (w >= lo && w <= hi);
    var staart = proef.pid + ' ' + proef.meet + ' = ' + w + ' (verwacht ' + lo + '–' + hi + ', ' + r.n + ' monster(s))';
    return binnen ? _uit('ok', staart, proef, w, r.n)
                  : _uit('FOUT', staart + ' — buiten de band die de opdracht noemt', proef, w, r.n);
  }

  /* De uitslagvorm op één plek. Elke uitgang van meet() loopt hierlangs, zodat
     `waarde`, `lo`, `hi` en `n` er altijd op zitten — ook op de "niet gemeten"
     paden. Een scherm dat moet controleren óf de velden er zijn, gaat ze op
     den duur zelf invullen. */
  function _uit(staat, detail, proef, waarde, n) {
    var band = (proef && Array.isArray(proef.tussen)) ? proef.tussen : [null, null];
    return {
      staat: staat,
      detail: detail,
      pid: (proef && proef.pid) || '',
      maat: (proef && proef.meet) || '',
      waarde: (waarde === undefined ? null : waarde),
      lo: band[0],
      hi: band[1],
      n: Number(n) || 0
    };
  }

  /* ── ZIJN DE VOORWAARDEN VERVULD? (#257) ──────────────────────────
     Op de rit van 18-09 gingen negen van de twintig LET OP-regels niet over
     de auto maar over omstandigheden die er niet waren: geen stilstand, geen
     warme motor, geen achtergrondstap. Ze stonden pas ná de rit in het
     verslag, en toen was de rit voorbij.

     De stap-voorwaarden kan deze module niet zelf beantwoorden — markeringen
     staan in de testrun — dus komt die vraag als functie binnen. Ontbreekt hij
     of gooit hij, dan is het antwoord `null` en niet `false`: niet-na-te-gaan
     is iets anders dan niet-gedaan, en dat verschil is precies waar #227 over
     gaat. Een scherm dat dat onderscheid moet raden, vult het zelf in. */
  function voorwaarden(o, stapGezien) {
    var lijst = (o && Array.isArray(o.voorwaarden)) ? o.voorwaarden : [];
    return lijst.map(function (v) {
      if (v.stap !== undefined) {
        var gezien = null;
        if (stapGezien) {
          /* Met opzet géén typeof-guard. Wie hier iets meegeeft dat geen
             functie is, hoort `null` te krijgen — niet na te gaan — en niet
             stil `false`. De aanroep gooit dan, en dat is precies wat de
             catch hieronder omzet. Een typeof-guard zou hetzelfde geval stil
             als "niet gedaan" boeken, en dat is de fout uit #227. */
          try { gezien = !!stapGezien(v.stap); }
          catch (e) { console.warn('Opdracht: de stapcontrole gaf een fout (#257)', e); gezien = null; }
        }
        return { wat: v.wat, soort: 'stap', stap: v.stap, vervuld: gezien, waarde: null,
                 detail: gezien === null ? 'niet na te gaan — er is niets dat de stappen bijhoudt'
                       : gezien ? 'de stap "' + v.stap + '" is gezet'
                                : 'de stap "' + v.stap + '" is in deze sessie niet gezet' };
      }
      var u = meet({ pid: v.pid, meet: v.meet, tussen: v.tussen });
      return { wat: v.wat, soort: 'meting', pid: v.pid, vervuld: (u.staat === 'ok'),
               waarde: u.waarde, detail: u.detail };
    });
  }

  /* ── HET DRIEWAARDIGE OORDEEL (#257) ──────────────────────────────
     Tweewaardig was het probleem: "niet gemeten" en "gemeten en buiten de
     band" kwamen allebei als één regel in het verslag en waren daar niet uit
     elkaar te houden.

       nog niet   — de omstandigheden waren er niet. Geen bevinding, wel een
                    instructie voor de volgende rit.
       bevinding  — gemeten, en buiten de band die de opdracht noemt.
       gesloten   — gemeten, binnen de band, voorwaarden vervuld.

     `bevinding` is óók een antwoord: een spanning onder 11,5 V sluit #217 net
     zo goed als een spanning erboven. Het verschil met `gesloten` is dat er
     iemand naar moet kijken. */
  function oordeel(o, stapGezien) {
    if (!o) return { staat: 'nog niet', reden: 'er is geen opdracht geladen', voorwaarden: [], uitslagen: [] };

    var vw = voorwaarden(o, stapGezien);
    var uit = (o.proeven || []).map(meet);
    var uitkomst = function (staat, reden) { return { staat: staat, reden: reden, voorwaarden: vw, uitslagen: uit }; };

    var mist = vw.filter(function (v) { return v.vervuld !== true; });
    if (mist.length)
      return uitkomst('nog niet', mist.length + ' van de ' + vw.length + ' voorwaarden niet vervuld: ' +
        mist.map(function (v) { return v.wat + ' (' + v.detail + ')'; }).join(' | '));

    var stil = uit.filter(function (u) { return u.staat === 'LET OP'; });
    if (stil.length)
      return uitkomst('nog niet', stil.length + ' van de ' + uit.length + ' proeven zijn niet gemeten: ' +
        stil.map(function (u) { return u.detail; }).join(' | '));

    var raak = uit.filter(function (u) { return u.staat === 'FOUT'; });
    if (raak.length)
      return uitkomst('bevinding', raak.length + ' van de ' + uit.length + ' metingen vielen buiten de band: ' +
        raak.map(function (u) { return u.detail; }).join(' | '));

    return uitkomst('gesloten', uit.length + ' meting(en) binnen de band' +
      (vw.length ? ', alle ' + vw.length + ' voorwaarden vervuld' : ''));
  }

  window.PLOpdracht = {
    keur: keur,
    voorwaarden: voorwaarden,
    oordeel: oordeel,
    haal: haal,
    lijst: lijst,
    kies: kies,
    noteer: noteer,
    gedaan: gedaan,
    gelijst: function () { return _opdrachten ? JSON.parse(JSON.stringify(_opdrachten)) : null; },
    zetSensoren: zetSensoren,
    meet: meet,
    toggleAan: toggleAan,
    actief: function () { return _actief ? JSON.parse(JSON.stringify(_actief)) : null; },
    herkomst: function () { return _herkomst ? Object.assign({}, _herkomst) : null; },
    reden: function () { return _laatsteFout; },
    _grenzen: function () { return JSON.parse(JSON.stringify(GRENZEN)); },
    _maten: function () { return MATEN.slice(); },
    _schemas: function () { return SCHEMAS.slice(); },
    _sleutel: function () { return SLEUTEL; },
    _schema: function () { return SCHEMA; }
  };
})();
