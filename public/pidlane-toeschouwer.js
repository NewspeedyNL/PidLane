// ══════════════════════════════════════════════════════════════════
// pidlane-toeschouwer.js — de rit zelf als gebeurtenissen (PLToeschouwer)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS (23-10-2026).
// Een meetproef met de voorwaarde "stilgestaan" of "contact uit" wachtte op
// een markering die een mens met de hand moest zetten. Werd die vergeten,
// dan bleef de proef op NOG NIET staan terwijl de auto wél had stilgestaan —
// geen fout van de auto, een fout in de opstelling van de proef.
//
// Deze module kijkt mee en zegt het zelf: stilstand, rijden, contact uit,
// contact aan, helling. Elke overgang wordt een gebeurtenis, met een
// markering in de testrun (alleen voor de beheerder), zodat een stap-
// voorwaarde vanzelf vervuld raakt en de proef doorstapt. Daarnaast telt hij
// hoe lang elke toestand duurde; dat leest PLOpdracht als `toestand`-
// voorwaarde en als app-maat `toestand-*`.
//
// HIJ MEET NIETS ZELF. Snelheid uit pidHist (alleen vers), contact uit
// PLContact.stil(), helling uit PLTelemetrie.hellingVast(). Geen eigen
// verzoeken aan de adapter, geen eigen grenzen voor de auto.
//
// ONBEKEND IS GEEN TOESTAND. Zonder verse snelheid weet hij het niet, en dan
// telt die tijd als gat (`toestand-gat-s`) en verandert er niets. Anders
// zou een meetgat midden op de snelweg als stilstand tellen.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CFG = {
    tikMs: 1000,
    versMs: 5000,        // ouder dan dit is geen snelheid meer
    stilKmh: 1,          // tot en met: stil
    rijKmh: 5,           // vanaf: rijden; ertussen blijft de vorige toestand staan
    minS: 3,             // zo lang moet een nieuwe toestand aanhouden
    hellingGraden: 2.5,  // dezelfde drempel als de caravanrit (#463)
    dtMaxMs: 5000,       // een bevroren timer (achtergrond) telt niet als uren
    maxGebeurtenissen: 200
  };
  var TOESTANDEN = ['stil', 'rijden', 'contact-uit', 'helling'];
  var NAAM = { stil: 'stilstand', rijden: 'rijden', 'contact-uit': 'contact uit', 'contact-aan': 'contact aan', helling: 'helling' };

  /* Puur: welke toestand hoort bij deze waarneming. `vorige` is de hysterese:
     tussen stilKmh en rijKmh blijft staan wat er stond. null = niet aan het
     waarnemen (geen verbinding), 'onbekend' = verbonden maar geen verse snelheid. */
  function toestandVan(w, vorige) {
    if (!w || !w.verbonden) return null;
    if (w.contactStil) return 'contact-uit';
    if (typeof w.kmh !== 'number' || !isFinite(w.kmh)) return 'onbekend';
    if (w.kmh <= CFG.stilKmh) return 'stil';
    if (w.kmh >= CFG.rijKmh) return 'rijden';
    return (vorige === 'stil' || vorige === 'rijden') ? vorige : 'onbekend';
  }

  function maak() {
    var duur = {};
    TOESTANDEN.forEach(function (t) { duur[t] = 0; });
    duur.onbekend = 0;
    return { toestand: null, sinds: 0, kand: null, kandSinds: 0, laatst: 0,
             helling: false, hKand: null, hKandSinds: 0,
             gat: 0, gatMax: 0, duur: duur, aantal: {}, gebeurtenissen: [],
             // Elke periode apart (#599): een bovengrens gaat over één stuk,
             // niet over de som. ep/hEp is de lopende periode in ms.
             ep: 0, hEp: 0, hSinds: 0, perioden: [] };
  }

  function _ev(k, soort, van, t) {
    var e = { soort: soort, naam: NAAM[soort] || soort, van: van, t: t,
              naS: (van && k.sinds) ? Math.round((t - k.sinds) / 1000) : null };
    k.aantal[soort] = (k.aantal[soort] || 0) + 1;
    k.gebeurtenissen.push(e);
    if (k.gebeurtenissen.length > CFG.maxGebeurtenissen) k.gebeurtenissen.shift();
    return e;
  }

  function _sluit(k, toestand, van, ms) {
    k.perioden.push({ toestand: toestand, van: van, ms: ms });
    if (k.perioden.length > CFG.maxGebeurtenissen) k.perioden.shift();
  }

  /* Puur: één waarneming verwerken. Geeft de nieuwe gebeurtenissen terug. */
  function stap(k, w, nu) {
    var nieuw = [];
    var t = toestandVan(w, k.toestand);
    if (t === null) { k.laatst = 0; k.kand = null; k.gat = 0; return nieuw; }
    var dt = k.laatst ? Math.max(0, Math.min(nu - k.laatst, CFG.dtMaxMs)) : 0;
    k.laatst = nu;

    if (t === 'onbekend') {
      k.duur.onbekend += dt;
      k.gat += dt;
      if (k.gat > k.gatMax) k.gatMax = k.gat;
      k.kand = null;
    } else {
      k.gat = 0;
      if (k.toestand) { k.duur[k.toestand] += dt; k.ep += dt; }
      if (t === k.toestand) k.kand = null;
      else {
        // Contact uit heeft PLContact al nagewogen; dat wacht hier niet nog eens.
        var wacht = (t === 'contact-uit' || k.toestand === null) ? 0 : CFG.minS * 1000;
        if (k.kand !== t) { k.kand = t; k.kandSinds = nu; }
        if (nu - k.kandSinds >= wacht) {
          var van = k.toestand;
          if (van) _sluit(k, van, k.sinds, k.ep);
          k.ep = 0;
          if (van === 'contact-uit') nieuw.push(_ev(k, 'contact-aan', van, k.kandSinds));
          nieuw.push(_ev(k, t, van, k.kandSinds));
          k.toestand = t; k.sinds = k.kandSinds; k.kand = null;
        }
      }
    }

    // De helling staat los van stil/rijden: je kunt op een helling stilstaan.
    var h = (w && typeof w.helling === 'number' && isFinite(w.helling)) ? Math.abs(w.helling) >= CFG.hellingGraden : null;
    if (h === null) k.hKand = null;
    else {
      if (k.helling) { k.duur.helling += dt; k.hEp += dt; }
      if (h === k.helling) k.hKand = null;
      else {
        if (k.hKand !== h) { k.hKand = h; k.hKandSinds = nu; }
        if (nu - k.hKandSinds >= CFG.minS * 1000) {
          if (k.helling) _sluit(k, 'helling', k.hSinds, k.hEp);
          k.helling = h; k.hKand = null; k.hEp = 0; k.hSinds = k.hKandSinds;
          if (h) nieuw.push(_ev(k, 'helling', k.toestand, k.hKandSinds));
        }
      }
    }
    return nieuw;
  }

  /* Puur: de perioden van één toestand die op of na `vanaf` begonnen, in
     seconden, de lopende erbij. */
  function perioden(k, t, vanaf) {
    var uit = k.perioden.filter(function (p) { return p.toestand === t && p.van >= vanaf; })
      .map(function (p) { return Math.round(p.ms / 1000); });
    if (t === 'helling' ? (k.helling && k.hSinds >= vanaf) : (k.toestand === t && k.sinds >= vanaf))
      uit.push(Math.round((t === 'helling' ? k.hEp : k.ep) / 1000));
    return uit;
  }

  // ── de app eromheen ──────────────────────────────────────────────
  var _k = maak();
  /* Een nieuwe poging (#599): wie een opdracht opnieuw kiest, begint de
     bovengrens opnieuw. De sommen blijven staan; die horen bij de rit. */
  var _poging = 0;
  function nieuwePoging(nu) { _poging = nu || Date.now(); return _poging; }
  function periodenS(t) { return perioden(_k, t, _poging); }

  function _vers(pid, nu) {
    try {
      var h = (typeof pidHist !== 'undefined' && pidHist) ? pidHist[pid] : null;
      var l = (h && h.length) ? h[h.length - 1] : null;
      return (l && typeof l.v === 'number' && nu - l.t <= CFG.versMs) ? l.v : null;
    } catch (e) { console.warn('Toeschouwer: pidHist onleesbaar', e); return null; }
  }

  function waarneming(nu) {
    var w = { verbonden: false, kmh: null, contactStil: false, helling: null };
    try { w.verbonden = (typeof connected !== 'undefined' && !!connected) || (typeof demoMode !== 'undefined' && !!demoMode); }
    catch (e) { console.warn('Toeschouwer: verbindingsstand onleesbaar', e); }
    w.kmh = _vers('010D', nu);
    try { w.contactStil = !!(window.PLContact && typeof PLContact.stil === 'function' && PLContact.stil()); }
    catch (e) { console.warn('Toeschouwer: PLContact onleesbaar', e); }
    try { w.helling = (window.PLTelemetrie && typeof PLTelemetrie.hellingVast === 'function') ? PLTelemetrie.hellingVast() : null; }
    catch (e) { console.warn('Toeschouwer: helling onleesbaar', e); }
    return w;
  }

  function _beheerder() {
    try { return typeof isAdmin === 'function' && !!isAdmin(); }
    catch (e) { console.warn('Toeschouwer: isAdmin onleesbaar', e); return false; }
  }

  /* Een gebeurtenis naar buiten: als markering voor de beheerder (dan zien de
     stap-voorwaarden hem), en als event voor wie wil luisteren. Een klant
     krijgt geen logregels van een testmiddel. */
  function _meld(e) {
    var tekst = 'toestand: ' + e.naam;
    var opm = 'automatisch' + (e.naS !== null ? ' — na ' + e.naS + ' s ' + (NAAM[e.van] || e.van) : '');
    if (_beheerder()) {
      try { if (typeof plMarkeer === 'function') plMarkeer(tekst, opm); }
      catch (err) { console.warn('Toeschouwer: markering mislukt', err); }
    }
    try { window.dispatchEvent(new CustomEvent('pl-toestand', { detail: e })); }
    catch (err) { console.warn('Toeschouwer: event mislukt', err); }
  }

  function tik(nu) {
    nu = nu || Date.now();
    var nieuw = stap(_k, waarneming(nu), nu);
    nieuw.forEach(_meld);
    return nieuw;
  }

  function duurS(t) { return _k.duur[t] === undefined ? null : Math.round(_k.duur[t] / 1000); }
  function gezien() { return _k.toestand !== null || _k.duur.onbekend > 0; }

  /* App-maten voor PLOpdracht. null = niets waargenomen, en dat is geen 0. */
  function maat(naam) {
    if (!gezien()) return null;
    switch (naam) {
      case 'toestand-stil-s': return duurS('stil');
      case 'toestand-rijden-s': return duurS('rijden');
      case 'toestand-contact-uit-s': return duurS('contact-uit');
      case 'toestand-helling-s': return duurS('helling');
      case 'toestand-contact-uit-n': return _k.aantal['contact-uit'] || 0;
      case 'toestand-stops': return _k.gebeurtenissen.filter(function (e) { return e.soort === 'stil' && e.van; }).length;
      case 'toestand-wissels': return _k.gebeurtenissen.length;
      case 'toestand-gat-s': return Math.round(_k.gatMax / 1000);
      default: return null;
    }
  }

  function stand() {
    return { toestand: _k.toestand, sinds: _k.sinds, helling: _k.helling,
             duur: Object.assign({}, _k.duur), aantal: Object.assign({}, _k.aantal),
             gebeurtenissen: _k.gebeurtenissen.slice() };
  }

  function reset() { _k = maak(); _poging = 0; }

  var _timer = null;
  function start() {
    if (_timer || typeof setInterval !== 'function') return;
    _timer = setInterval(function () {
      try { tik(); } catch (e) { console.warn('Toeschouwer: tik mislukt', e); }
    }, CFG.tikMs);
  }
  function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }

  window.PLToeschouwer = {
    tik: tik, stand: stand, duurS: duurS, gezien: gezien, maat: maat,
    reset: reset, start: start, stop: stop, nieuwePoging: nieuwePoging, periodenS: periodenS,
    gebeurtenissen: function () { return _k.gebeurtenissen.slice(); },
    CFG: CFG, TOESTANDEN: TOESTANDEN.slice(),
    _kern: { maak: maak, stap: stap, toestandVan: toestandVan, perioden: perioden }
  };
  start();
})();
