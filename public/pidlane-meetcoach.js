// ══════════════════════════════════════════════════════════════════
// pidlane-meetcoach.js — PLMeetcoach: meetproeven zonder meetkamer (24-10-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Een paar weken geleden werden meerdere meetproeven na tien minuten
// rijden vanzelf groen. Op 24-10 lukte dat niet meer, en de reden zat niet in
// de proeven maar in vier handstappen die er sindsdien tussen kwamen: de
// lijst laadde pas als je in de meetkamer koos, alleen de sensoren van de
// gekozen opdracht werden gelezen, een uitkomst telde pas na ✓ Opstelling OK
// (#594), en verzenden was een knop. Op de weg lees je geen opdrachttekst.
//
// WAT DEZE MODULE DOET (alleen voor admin/ontwikkelaar, alleen verbonden):
//   1. automatiek — bij verbinden alle opdrachten laden, hun sensoren erbij
//      (hoogstens CFG.sensorMax), en verzenden aan het eind van de rit:
//      bij verbreken, na een minuut contact uit, en elke tien minuten
//   2. één vraag — "Tijd voor meetproeven?": hoe lang je rijdt en welke
//      situaties deze rit kan (stoplicht, snelweg, helling, stilstaan)
//   3. de balk in Live — één actie tegelijk, in gewone taal, afgeleid uit
//      wat de open opdrachten nog missen. De toeschouwer ziet zelf of het
//      gelukt is; afvinken hoeft niet. Sinds 25-10: voortgang (proeven,
//      ritklok, hoe lang nog), "stap x van y", Volgende, kies uit de lijst,
//      Niet deze rit, en de rit onderweg aanpassen
//   4. de bus overnemen — staat de auto stil, dan vraagt de balk of hij de
//      bus even mag hebben voor proeven die dat nodig hebben (meeluisteren,
//      mode 06). Altijd eerst vragen: live-data valt dan weg
//
// De keuring telt nu automatisch (PLOpdracht.opstelling): ongekeurd = auto.
// Afkeuren blijft kunnen, in Second opinion.
//
// plan(), actieVoor(), stappen(), vraagHtml() en balkHtml() zijn puur; test-meetcoach.js
// laadt dit bestand met vm.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CFG = {
    tikMs: 5000,
    sensorMax: 12,
    verzendMs: 600000,      // elke tien minuten, voor het geval de rit niet netjes eindigt
    contactUitS: 60,        // zo lang contact uit = einde van een rit
    stilVraagS: 8,          // zo lang stil voor de bus-vraag
    laterMs: 300000         // "Later" bij de bus-vraag: vijf minuten rust
  };
  var DUUR = { kort: 600, middel: 1800, lang: 3600 };
  var SITUATIES = [
    { id: 'stoplicht', ic: '🚦', naam: 'Stoplichten' },
    { id: 'snelweg', ic: '🛣', naam: 'Snelweg' },
    { id: 'helling', ic: '⛰', naam: 'Helling of oprit' },
    { id: 'stilstaan', ic: '🅿', naam: 'Stilstaan, motor aan' }
  ];

  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ── WAT EEN VOORWAARDE VAN DE BESTUURDER VRAAGT (puur) ─────────
     `actief`: de bestuurder moet iets doen. Niet actief: het gebeurt vanzelf
     als je rijdt, en dan staat het niet in de balk als opdracht maar als
     voortgang. `sit`: welke situatie het nodig heeft (null = elke rit). */
  function actieVoor(v) {
    v = v || {};
    if (v.toestand === 'contact-uit') {
      var tel = Math.max(v.minS || 20, Math.min((v.minS || 20) + 10, (v.maxS || 999) - 10));
      return { soort: 'contact', sit: 'stoplicht', actief: true, tekst: '🚦 Bij stilstand: contact uit, tel tot ' + tel + ', weer aan' };
    }
    if (v.toestand === 'stil') return { soort: 'stil', sit: 'stilstaan', actief: true, tekst: '⏸ Sta ' + (v.minS || 30) + ' s stil met de motor aan' };
    if (v.toestand === 'helling') return { soort: 'helling', sit: 'helling', actief: true, tekst: '⛰ Rij een helling of oprit op' };
    if (v.toestand === 'rijden') return { soort: 'rijden', sit: null, actief: false, tekst: '🚗 Rij ' + Math.round((v.minS || 300) / 60) + ' min' };
    if (v.pid === '0105') return { soort: 'warm', sit: null, actief: false, tekst: '🌡 Motor warm rijden' };
    if (v.pid === '010C' && v.tussen && v.tussen[0] >= 1500)
      return { soort: 'toeren', sit: 'snelweg', actief: true, tekst: '↗ Trek één keer door tot boven ' + v.tussen[0] + ' tpm' };
    if (v.app && /^onderzoek/.test(v.app)) return { soort: 'onderzoek', sit: 'stilstaan', actief: true, tekst: '🔧 Na de rit, stilstaand: Er is iets mis → onderzoek' };
    if (v.app && /^wiel-/.test(v.app)) return { soort: 'wielen', sit: null, actief: false, tekst: '🛞 Gewoon rijden met de vier wielsnelheden aan' };
    return { soort: 'anders:' + (v.wat || ''), sit: null, actief: true, tekst: '• ' + (v.wat || 'onbekende voorwaarde') };
  }

  /* ── HET PLAN (puur) ────────────────────────────────────────────
     alle: [{ id, naam, opdracht, vonnis }] (PLOpdracht.oordeelAlle).
     keuze: { duurS, sit: {stoplicht:true,…} } of null (nog niet gevraagd).
     Geeft { acties: [...], klaar, open, uitgesloten, uitNamen }: per soort
     één actie, met hoeveel opdrachten hij verder helpt en — bij een toestand
     die optelt — `frac` (0..1) en `nogS`. Actief eerst, dan op aantal. */
  function plan(alle, keuze) {
    var per = {}, klaar = 0, open = 0, uit = 0, uitNamen = [];
    (alle || []).forEach(function (r) {
      var o = r && r.opdracht, v = r && r.vonnis;
      if (!o) return;
      if (v && (v.staat === 'gesloten' || v.staat === 'bevinding')) { klaar++; return; }
      // Te lang voor deze rit: een voorwaarde "rijden" die meer vraagt dan de rit duurt.
      var lang = (o.voorwaarden || []).some(function (w) { return w.toestand === 'rijden' && keuze && keuze.duurS && w.minS > keuze.duurS; });
      if (lang) { uit++; uitNamen.push(r.naam); return; }
      var mist = (o.voorwaarden || []).filter(function (w, i) {
        var g = v && v.voorwaarden && v.voorwaarden[i];
        return !(g && g.vervuld === true);
      });
      var acties = mist.map(function (w) {
        var a = actieVoor(w);
        // Voortgang (25-10-2026): een toestand zonder bovengrens telt op naar minS.
        var i = (o.voorwaarden || []).indexOf(w), g = v && v.voorwaarden && v.voorwaarden[i];
        if (w.toestand && w.maxS === undefined && g && typeof g.waarde === 'number') {
          var nodig = w.minS || 5;
          a.frac = Math.min(1, g.waarde / nodig); a.nogS = Math.max(0, nodig - g.waarde);
        }
        return a;
      });
      if (keuze && keuze.sit && acties.some(function (a) { return a.sit && !keuze.sit[a.sit]; })) { uit++; uitNamen.push(r.naam); return; }
      open++;
      acties.forEach(function (a) {
        var x = per[a.soort] || (per[a.soort] = { soort: a.soort, tekst: a.tekst, actief: a.actief, sit: a.sit, opdrachten: [] });
        if (x.opdrachten.indexOf(r.naam) < 0) x.opdrachten.push(r.naam);
        // Het verst gevorderde telt: dat is de eerste die klaar komt.
        if (typeof a.frac === 'number' && !(x.frac >= a.frac)) { x.frac = a.frac; x.nogS = a.nogS; }
      });
    });
    var acties = Object.keys(per).map(function (k) { return per[k]; });
    acties.sort(function (a, b) { return (b.actief - a.actief) || (b.opdrachten.length - a.opdrachten.length) || (a.soort < b.soort ? -1 : 1); });
    return { acties: acties, klaar: klaar, open: open, uitgesloten: uit, uitNamen: uitNamen };
  }

  /* ── HTML (puur) ───────────────────────────────────────────────── */
  function vraagHtml(keuze) {
    var k = keuze || { duurS: 0, sit: {} };
    var d = function (id, t) { return '<button type="button" class="mc-k' + (k.duurS === DUUR[id] ? ' aan' : '') + '" onclick="PLMeetcoach.kiesDuur(\'' + id + '\')">' + t + '</button>'; };
    return '<div class="mc-vraag"><div class="mc-kop">🧪 Tijd voor meetproeven?</div>' +
      '<div class="mc-rij">' + d('kort', 'Kort, &lt; 10 min') + d('middel', '10–30 min') + d('lang', 'Langer') + '</div>' +
      '<div class="mc-rij">' + SITUATIES.map(function (s) {
        return '<button type="button" class="mc-k' + (k.sit && k.sit[s.id] ? ' aan' : '') + '" onclick="PLMeetcoach.kiesSit(\'' + s.id + '\')">' + s.ic + ' ' + esc(s.naam) + '</button>';
      }).join('') + '</div>' +
      '<div class="mc-rij"><button type="button" class="mc-go"' + (k.duurS ? '' : ' disabled') + ' onclick="PLMeetcoach.start()">Start</button>' +
      '<button type="button" class="mc-k" onclick="PLMeetcoach.nietNu()">Niet nu</button></div></div>';
  }

  /* De stappen die de bestuurder nu kan doen: actief, en niet weggezet
     met "Niet deze rit". `i` is de gekozen stap (Volgende of de lijst),
     anders de eerste. */
  function stappen(p, st) {
    st = st || {};
    var weg = st.overslaan || [];
    var act = p && p.acties ? p.acties.filter(function (x) { return x.actief && weg.indexOf(x.soort) < 0; }) : [];
    var i = 0;
    act.forEach(function (x, j) { if (x.soort === st.huidig) i = j; });
    return { act: act, i: i };
  }

  function _bar(f) { return '<span class="mc-bar"><i style="width:' + Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + '%"></i></span>'; }
  function _mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function _knop(fn, soort, tekst, kl) {
    return '<button type="button" class="' + (kl || 'mc-k') + '"' + (soort !== null ? ' data-soort="' + esc(soort) + '"' : '') +
      ' onclick="PLMeetcoach.' + fn + '(' + (soort !== null ? 'this.dataset.soort' : '') + ')">' + tekst + '</button>';
  }

  /* De balk (25-10-2026): bovenaan hoeveel proeven klaar zijn en hoe ver
     de rit is; dan de stap van nu met "stap x van y", Volgende, de lijst en
     Niet deze rit; daaronder wat vanzelf meet, met hoe lang nog. */
  function balkHtml(p, st) {
    st = st || {};
    if (st.bus === 'bezig') return '<div class="mc-balk mc-bus">⏳ ' + esc(st.busTekst || 'De bus is even van de meetproef') + '</div>';
    if (st.bus === 'vraag') return '<div class="mc-balk mc-bus">⏱ Je staat stil — mag ik de bus ' + esc(st.busDuur || '1 min') + '? ' +
      '<button type="button" class="mc-go" onclick="PLMeetcoach.busJa()">Ja</button> <button type="button" class="mc-k" onclick="PLMeetcoach.busLater()">Later</button></div>';
    var sp = stappen(p, st), act = sp.act, a = act[sp.i] || null;
    var klaar = p ? p.klaar : 0, tot = p ? p.klaar + p.open : 0;
    var kop = '<div class="mc-kopregel"><span class="mc-voort">✓ ' + klaar + ' van ' + tot + ' klaar</span>' + _bar(tot ? klaar / tot : 0) +
      (st.duurS ? '<span class="mc-voort">⏱ ' + Math.floor((st.ritS || 0) / 60) + ' van ' + Math.round(st.duurS / 60) + ' min</span>' + _bar((st.ritS || 0) / st.duurS) : '') +
      (p && p.uitgesloten ? '<span class="mc-voort mc-los">' + p.uitgesloten + ' niet voor deze rit</span>' : '') +
      (st.verzonden ? '<span class="mc-voort mc-los">' + st.verzonden + ' verzonden</span>' : '') + '</div>';
    var lijstKnop = _knop('lijst', null, st.lijst ? '▴ Lijst' : '☰ Kies uit lijst');
    var nu = a
      ? '<div class="mc-nu"><span class="mc-stap">Stap ' + (sp.i + 1) + ' van ' + act.length + '</span><span class="mc-actie">' + esc(a.tekst) + '</span>' +
        (typeof a.frac === 'number' ? _bar(a.frac) + '<span class="mc-voort">nog ' + _mmss(a.nogS) + '</span>' : '') +
        '<span class="mc-voort">helpt ' + a.opdrachten.length + ' proef' + (a.opdrachten.length === 1 ? '' : 'en') + '</span></div>' +
        '<div class="mc-rij">' + (act.length > 1 ? _knop('volgende', null, 'Volgende ›', 'mc-go') : '') + lijstKnop + _knop('overslaan', a.soort, '✕ Niet deze rit') + '</div>'
      : '<div class="mc-nu"><span class="mc-actie">' + (p && p.open ? '🚗 Gewoon doorrijden — de rest meet vanzelf' : '✓ Alles wat deze rit kan, is gemeten') + '</span></div>' +
        '<div class="mc-rij">' + lijstKnop + '</div>';
    var vanzelf = (p && p.acties ? p.acties : []).filter(function (x) { return !x.actief; }).map(function (x) {
      return '<div class="mc-vz"><span>' + esc(x.tekst) + '</span>' +
        (typeof x.frac === 'number' ? _bar(x.frac) + '<span class="mc-voort">' + (x.nogS > 0 ? 'nog ' + _mmss(x.nogS) : '✓') + '</span>' : '<span class="mc-voort">meet vanzelf</span>') + '</div>';
    }).join('');
    var weg = st.overslaan || [];
    var lijst = !st.lijst ? '' : '<div class="mc-lijst">' + act.map(function (x, j) {
        return _knop('kies', x.soort, esc(x.tekst) + ' · ' + x.opdrachten.length, 'mc-k' + (j === sp.i ? ' aan' : ''));
      }).join('') +
      (weg.length ? _knop('terug', null, '↺ ' + weg.length + ' weggezet terugzetten') : '') +
      (p && p.uitNamen && p.uitNamen.length ? '<div class="mc-voort">Niet voor deze rit: ' + esc(p.uitNamen.join(', ')) + '</div>' : '') +
      _knop('aanpassen', null, '✎ Rit aanpassen') + '</div>';
    return '<div class="mc-balk">' + kop + nu + vanzelf + lijst + '</div>';
  }

  // ── de staat van deze sessie ───────────────────────────────────────
  var S = { geladen: false, laden: false, keuze: null, uit: false, overslaan: [], verzondenN: 0,
            laatsteVerzend: 0, wasVerbonden: false, contactVerzonden: false,
            bus: null, busLaterTot: 0, busGedaan: {}, timer: null, huidig: null, lijst: false, ritStart: 0 };

  function _diag(m, n) {
    try { if (typeof log === 'function') log(m, n || 'info'); }
    catch (e) { console.warn('meetcoach: melding niet in het log', e); }
  }
  function _mag() {
    try {
      return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode) &&
        typeof magOntwikkelen === 'function' && magOntwikkelen();
    } catch (e) { console.warn('meetcoach: rol of verbinding onleesbaar', e); return false; }
  }
  function _alle() {
    try { return (window.PLOpdracht && typeof PLOpdracht.oordeelAlle === 'function') ? PLOpdracht.oordeelAlle() : []; }
    catch (e) { console.warn('meetcoach: oordeel over de opdrachten mislukt', e); return []; }
  }

  function verzend(waarom) {
    if (!window.PLTestrunLive || typeof PLTestrunLive.verzendAlle !== 'function') return null;
    S.laatsteVerzend = Date.now();
    var r = null;
    try { r = PLTestrunLive.verzendAlle(); }
    catch (e) { console.warn('meetcoach: verzenden mislukt', e); return null; }
    if (r && r.aantal) { S.verzondenN += r.aantal; _diag('🧪 Meetcoach: ' + r.aantal + ' uitkomst(en) verzonden (' + waarom + ')', 'ok'); }
    return r;
  }

  function laad() {
    if (S.geladen || S.laden || !window.PLOpdracht || typeof PLOpdracht.lijst !== 'function') return;
    S.laden = true;
    Promise.resolve(PLOpdracht.lijst()).then(function () {
      S.geladen = true;
      var erbij = typeof PLOpdracht.zetSensorenAlle === 'function' ? PLOpdracht.zetSensorenAlle(CFG.sensorMax) : [];
      if (erbij.length) _diag('🧪 Meetcoach: ' + erbij.length + ' sensor(en) erbij voor de meetproeven (' + erbij.join(', ') + ')', 'info');
      teken();
    }, function (e) { console.warn('meetcoach: lijst niet geladen', e); }).then(function () { S.laden = false; });
  }

  /* Bus-proeven: alleen wat er is, en elk hoogstens één keer per sessie. */
  function _busProeven() {
    var p = [];
    try {
      if (!S.busGedaan.meeluister && window.PLMeeluister && window.PLWaarneming && PLWaarneming.lees('canopen').status !== 'gezien')
        p.push({ id: 'meeluister', tekst: 'meeluisteren op de CAN-bus', doe: function () { return PLMeeluister.proef(); } });
      if (!S.busGedaan.mode06 && window.PLM06 && typeof PLM06.scan === 'function')
        p.push({ id: 'mode06', tekst: 'zelftests van de motor lezen (mode 06)', doe: function () { return PLM06.scan(); } });
    } catch (e) { console.warn('meetcoach: bus-proeven onleesbaar', e); }
    return p;
  }

  function tik() {
    var mag = _mag();
    if (!mag) {
      // Verbreken = einde van de rit: wat er is, gaat weg.
      if (S.wasVerbonden) { S.wasVerbonden = false; verzend('verbinding verbroken'); }
      teken(); return;
    }
    S.wasVerbonden = true;
    laad();
    var nu = Date.now();
    var st = null;
    try { st = window.PLToeschouwer ? PLToeschouwer.stand() : null; }
    catch (e) { console.warn('meetcoach: toeschouwer onleesbaar', e); }
    // Contact een minuut uit: ook een einde, maar één keer per stilte.
    var cu = st && st.toestand === 'contact-uit' && st.sinds && nu - st.sinds >= CFG.contactUitS * 1000;
    if (cu && !S.contactVerzonden) { S.contactVerzonden = true; verzend('contact uit'); }
    if (!cu) S.contactVerzonden = false;
    if (S.laatsteVerzend && nu - S.laatsteVerzend >= CFG.verzendMs) verzend('tien minuten');
    if (!S.laatsteVerzend) S.laatsteVerzend = nu;
    // De bus-vraag: stilstand met motor aan, niet te vaak.
    if (!S.bus && S.keuze && !S.uit && st && st.toestand === 'stil' && st.sinds && nu - st.sinds >= CFG.stilVraagS * 1000 &&
        nu >= S.busLaterTot && _busProeven().length) S.bus = 'vraag';
    if (S.bus === 'vraag' && st && st.toestand !== 'stil') S.bus = null;
    teken();
  }

  // ── tekenen ─────────────────────────────────────────────────────────
  function _el() {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    var el = document.getElementById('mcBalk');
    if (el) return el;
    var pane = document.getElementById('pane-live');
    if (!pane || !document.createElement) return null;
    el = document.createElement('div'); el.id = 'mcBalk';
    pane.insertBefore(el, pane.firstChild);
    return el;
  }
  function teken() {
    var el = _el();
    if (!el) return;
    if (!_mag() || S.uit) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    if (!S.keuze) { el.innerHTML = vraagHtml(S.vraag); return; }
    el.innerHTML = balkHtml(plan(_alle(), S.keuze), { overslaan: S.overslaan, verzonden: S.verzondenN, bus: S.bus, busTekst: S.busTekst,
      busDuur: _busProeven().length > 1 ? '2 min' : '1 min', huidig: S.huidig, lijst: S.lijst,
      duurS: S.keuze.duurS, ritS: S.ritStart ? (Date.now() - S.ritStart) / 1000 : 0 });
  }

  // ── knoppen ─────────────────────────────────────────────────────────
  function _vraag() { return S.vraag || (S.vraag = { duurS: 0, sit: {} }); }
  function kiesDuur(id) { _vraag().duurS = DUUR[id] || 0; teken(); }
  function kiesSit(id) { var v = _vraag(); v.sit[id] = !v.sit[id]; teken(); }
  function start() {
    var v = _vraag(); if (!v.duurS) return;
    S.keuze = { duurS: v.duurS, sit: Object.assign({}, v.sit) };
    if (!S.ritStart) S.ritStart = Date.now();   // aanpassen onderweg zet de ritklok niet terug
    _diag('🧪 Meetcoach: rit van ' + Math.round(v.duurS / 60) + ' min, situaties: ' + (Object.keys(v.sit).filter(function (k) { return v.sit[k]; }).join(', ') || 'geen'), 'info');
    teken();
  }
  function nietNu() { S.uit = true; teken(); }
  function overslaan(soort) { if (S.overslaan.indexOf(soort) < 0) S.overslaan.push(soort); teken(); }
  function _stappen() { return stappen(plan(_alle(), S.keuze), { overslaan: S.overslaan, huidig: S.huidig }); }
  function volgende() {
    var sp = _stappen();
    if (sp.act.length) S.huidig = sp.act[(sp.i + 1) % sp.act.length].soort;
    teken();
  }
  function kies(soort) { S.huidig = soort; S.lijst = false; teken(); }
  function lijst() { S.lijst = !S.lijst; teken(); }
  function terug() { S.overslaan = []; teken(); }
  function aanpassen() { S.keuze = null; S.lijst = false; teken(); }
  function busLater() { S.bus = null; S.busLaterTot = Date.now() + CFG.laterMs; teken(); }
  function busJa() {
    var lijst = _busProeven();
    if (!lijst.length) { S.bus = null; teken(); return Promise.resolve([]); }
    S.bus = 'bezig';
    var uit = [];
    var stap = function (i) {
      if (i >= lijst.length) return Promise.resolve();
      var p = lijst[i];
      S.busTekst = (i + 1) + '/' + lijst.length + ': ' + p.tekst + '…'; teken();
      return Promise.resolve().then(p.doe).then(function (r) { uit.push({ id: p.id, ok: !(r && r.fout), r: r }); },
        function (e) { console.warn('meetcoach: bus-proef ' + p.id + ' mislukt', e); uit.push({ id: p.id, ok: false, fout: (e && e.message) || String(e) }); })
        .then(function () { S.busGedaan[p.id] = true; return stap(i + 1); });
    };
    return stap(0).then(function () {
      S.bus = null; S.busTekst = '';
      _diag('🧪 Meetcoach: bus terug — ' + uit.map(function (u) { return u.id + (u.ok ? ' ✓' : ' ✗'); }).join(', '), 'ok');
      teken(); return uit;
    });
  }

  function aan() {
    if (S.timer !== null) return;
    try { S.timer = setInterval(tik, CFG.tikMs); }
    catch (e) { console.warn('meetcoach: geen klok — de automatiek staat stil', e); }
  }
  aan();

  window.PLMeetcoach = {
    plan: plan, actieVoor: actieVoor, vraagHtml: vraagHtml, balkHtml: balkHtml, stappen: stappen,
    tik: tik, teken: teken, verzend: verzend,
    kiesDuur: kiesDuur, kiesSit: kiesSit, start: start, nietNu: nietNu, overslaan: overslaan,
    volgende: volgende, kies: kies, lijst: lijst, terug: terug, aanpassen: aanpassen,
    busJa: busJa, busLater: busLater,
    CFG: CFG, DUUR: DUUR, SITUATIES: SITUATIES,
    _staat: function () { return S; }
  };
})();
