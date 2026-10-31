/* ════════════════════════════════════════════════════════════════════
   pidlane-rr.js — PLRR: RR, het Random Rapport (request) (31-10-2026)
   ────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   De bulkrecorder neemt alles op. Sommige klanten willen dat niet: ze
   willen drie getallen, in hun eigen eenheid, alleen als de motor warm is,
   als spreadsheet voor hun eigen doel — een trekhaakproef, een vraag van
   de garage, een vergelijking tussen twee soorten brandstof. Een RR is
   zo'n eigen meetopdracht, per voertuig bewaard (kolom `rr` van
   kp_voertuig, hoogstens tien).

   WAT EEN RR VASTLEGT — de zes vragen
     1. doel      waarvoor meet je dit (komt bovenaan elke export);
     2. welke     1 tot 12 sensoren uit de keuzelijst van deze auto;
     3. eenheid   per sensor: zoals de auto hem geeft, of omgerekend
                  (°C/°F, km/h/mph, bar/psi/kPa, l/100 km/km/l, g/s/kg/h);
     4. hoe vaak  elke 1, 2, 5, 10, 30 of 60 seconden;
     5. venster   wanneer er gemeten wordt: met de knop of vanzelf bij elke
                  verbinding, alleen tussen twee kloktijden, alleen zolang
                  tot drie voorwaarden gelden ("koelwater > 80 en snelheid
                  > 50"), en hoogstens zoveel minuten per keer;
     6. opbouw en export
                  een tijdreeks (een rij per meting), een samenvatting
                  (min, gemiddeld, max per sensor), of allebei; als CSV
                  voor Excel (puntkomma, komma als decimaal), als CSV
                  internationaal (komma, punt) of als JSON; en desgewenst
                  vanzelf als rapport in Rapporten.

   PUUR EN NIET PUUR. normaliseer(), omreken(), vensterOpen(), tik(),
   samenvatting(), csv(), json(), tekst() en uitFormulier() zijn puur;
   test-rr.js toetst ze met vm. De lus (starten, stoppen, elke seconde
   pidVals lezen) zit in PLRR.start()/stop() en wordt door PLGarage
   aangeroepen. Een RR zet niets op de bus: hij leest pidVals, en zet bij
   het starten zijn sensoren aan (PLVoorkeur.selectieToepassen, erbij).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    max: 10,                 // RR's per voertuig (worker.js: KP_VELDEN.rr.max)
    maxSensoren: 12,
    maxVoorwaarden: 3,
    maxRijen: 20000,         // daarna stopt de tijdreeks; de samenvatting loopt door
    tempo: [1, 2, 5, 10, 30, 60],
    opbouw: ['tijdreeks', 'samenvatting', 'beide'],
    export: ['csv', 'csv-int', 'json'],
    start: ['knop', 'verbinden'],
    ops: ['>', '>=', '<', '<=']
  };

  /* Eenheden: per basiseenheid (zoals de PID-definitie hem noemt) de
     andere die je mag kiezen, met de omrekening. */
  var OMREKEN = {
    '°c': { '°F': function (x) { return x * 9 / 5 + 32; } },
    'km/h': { 'mph': function (x) { return x / 1.609344; }, 'm/s': function (x) { return x / 3.6; } },
    'kpa': { 'bar': function (x) { return x / 100; }, 'psi': function (x) { return x / 6.894757; } },
    'bar': { 'kPa': function (x) { return x * 100; }, 'psi': function (x) { return x * 14.503774; } },
    'psi': { 'bar': function (x) { return x / 14.503774; }, 'kPa': function (x) { return x * 6.894757; } },
    'l/100km': { 'km/l': function (x) { return x > 0 ? 100 / x : null; }, 'mpg (UK)': function (x) { return x > 0 ? 282.481 / x : null; } },
    'g/s': { 'kg/h': function (x) { return x * 3.6; } },
    'km': { 'mijl': function (x) { return x / 1.609344; } }
  };
  function basisSleutel(u) { return String(u || '').trim().toLowerCase().replace(/\s+/g, ''); }
  /* De eenheden die bij `basis` horen: eerst de basis zelf. */
  function eenheden(basis) {
    var o = OMREKEN[basisSleutel(basis)] || {};
    return [String(basis || '')].concat(Object.keys(o));
  }
  function omreken(x, basis, doel) {
    if (typeof x !== 'number' || !isFinite(x)) return null;
    if (!doel || doel === basis) return x;
    var f = (OMREKEN[basisSleutel(basis)] || {})[doel];
    if (!f) return x;
    var y = f(x);
    return typeof y === 'number' && isFinite(y) ? y : null;
  }

  function tekst(x, max) { return String(x == null ? '' : x).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max); }
  function getal(x) { var n = Number(String(x == null ? '' : x).replace(',', '.')); return x === '' || x == null || !isFinite(n) ? null : n; }
  var PID_RE = /^[A-Za-z0-9_.:@-]{2,24}$/;
  var KLOK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /* Eén RR uit wat de klant invulde → { ok, rr } of { fout }. Dezelfde
     regels als kpRrOpdracht() in worker.js; test-rr.js vergelijkt ze. */
  function normaliseer(o) {
    o = o || {};
    var naam = tekst(o.naam, 40);
    if (!naam) return { fout: 'geef de RR een naam' };
    var sens = (Array.isArray(o.sensoren) ? o.sensoren : []).filter(function (s) { return s && PID_RE.test(String(s.pid || '')); });
    var gezien = {};
    sens = sens.filter(function (s) { if (gezien[s.pid]) return false; gezien[s.pid] = 1; return true; })
      .map(function (s) { var e = tekst(s.eenheid, 12); return e ? { pid: String(s.pid), eenheid: e } : { pid: String(s.pid) }; });
    if (!sens.length) return { fout: 'kies minstens één sensor' };
    if (sens.length > CFG.maxSensoren) return { fout: 'hoogstens ' + CFG.maxSensoren + ' sensoren per RR' };
    var tempo = Number(o.tempo);
    if (CFG.tempo.indexOf(tempo) < 0) return { fout: 'hoe vaak: elke ' + CFG.tempo.join(', ') + ' seconden' };
    var v = o.venster || {};
    var start = CFG.start.indexOf(v.start) >= 0 ? v.start : 'knop';
    var van = KLOK_RE.test(String(v.van || '')) ? v.van : '', tot = KLOK_RE.test(String(v.tot || '')) ? v.tot : '';
    if ((van && !tot) || (!van && tot)) return { fout: 'het tijdvak heeft een begin én een eind nodig' };
    var maxMin = getal(v.maxMin);
    if (maxMin !== null && (maxMin < 1 || maxMin > 1440)) return { fout: 'hoogstens 1 tot 1440 minuten per keer' };
    var voorw = (Array.isArray(v.voorwaarden) ? v.voorwaarden : []).filter(function (w) { return w && String(w.pid || '') !== ''; });
    if (voorw.length > CFG.maxVoorwaarden) return { fout: 'hoogstens ' + CFG.maxVoorwaarden + ' voorwaarden' };
    for (var i = 0; i < voorw.length; i++) {
      var w = voorw[i];
      if (!PID_RE.test(String(w.pid)) || CFG.ops.indexOf(w.op) < 0 || getal(w.waarde) === null) return { fout: 'voorwaarde ' + (i + 1) + ' is niet compleet (sensor, vergelijking, getal)' };
      voorw[i] = { pid: String(w.pid), op: w.op, waarde: getal(w.waarde) };
    }
    var rr = {
      id: /^[a-z0-9]{6,20}$/.test(String(o.id || '')) ? String(o.id) : nieuwId(),
      naam: naam, doel: tekst(o.doel, 200), sensoren: sens, tempo: tempo,
      venster: { start: start, van: van, tot: tot, maxMin: maxMin === null ? null : Math.round(maxMin), voorwaarden: voorw },
      opbouw: CFG.opbouw.indexOf(o.opbouw) >= 0 ? o.opbouw : 'tijdreeks',
      export: CFG.export.indexOf(o.export) >= 0 ? o.export : 'csv',
      rapport: !!o.rapport
    };
    return { ok: true, rr: rr };
  }
  function nieuwId() { return 'rr' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  /* Is het venster nu open? `waarden` = pidVals (ruwe eenheid), `st` de
     lopende meting (voor maxMin). Geeft { open, reden }. */
  function klokMin(s) { var p = String(s).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function vensterOpen(rr, waarden, nu, st) {
    var v = rr.venster || {};
    if (v.maxMin && st && st.start && nu - st.start >= v.maxMin * 60e3) return { open: false, klaar: true, reden: 'de ' + v.maxMin + ' minuten zijn om' };
    if (v.van && v.tot) {
      var d = new Date(nu), m = d.getHours() * 60 + d.getMinutes(), a = klokMin(v.van), b = klokMin(v.tot);
      var binnen = a <= b ? (m >= a && m < b) : (m >= a || m < b);   // over middernacht: 22:00–06:00
      if (!binnen) return { open: false, reden: 'buiten ' + v.van + '–' + v.tot };
    }
    var w = v.voorwaarden || [];
    for (var i = 0; i < w.length; i++) {
      var x = waarden ? waarden[w[i].pid] : undefined;
      if (typeof x !== 'number' || !isFinite(x)) return { open: false, reden: w[i].pid + ' heeft (nog) geen waarde' };
      var ok = w[i].op === '>' ? x > w[i].waarde : w[i].op === '>=' ? x >= w[i].waarde : w[i].op === '<' ? x < w[i].waarde : x <= w[i].waarde;
      if (!ok) return { open: false, reden: w[i].pid + ' ' + w[i].op + ' ' + w[i].waarde + ' nog niet (' + Math.round(x * 10) / 10 + ')' };
    }
    return { open: true, reden: '' };
  }

  /* Eén tik van de meting. `st` = { start, laatst, rijen, sam, n, vensters,
     open, klaar, vol }; begin met nieuw(nu). Geeft een nieuwe st. Een rij
     komt er alleen als het venster open is én het tempo om is. Een sensor
     zonder waarde is een lege cel, geen nul. */
  function nieuw(nu) { return { start: nu, laatst: 0, rijen: [], sam: {}, n: 0, vensters: 0, open: false, klaar: false, vol: false, reden: '' }; }
  function tik(st, rr, waarden, nu) {
    st = Object.assign({}, st || nieuw(nu));
    if (st.klaar) return st;
    var vo = vensterOpen(rr, waarden, nu, st);
    st.reden = vo.reden;
    if (vo.klaar) { st.klaar = true; st.open = false; return st; }
    if (!vo.open) { st.open = false; return st; }
    if (!st.open) { st.open = true; st.vensters++; }
    if (st.laatst && nu - st.laatst < rr.tempo * 1000 - 50) return st;
    st.laatst = nu;
    var rij = [nu];
    var sam = Object.assign({}, st.sam);
    rr.sensoren.forEach(function (s) {
      var basis = s.basis || '';
      var x = omreken(waarden ? waarden[s.pid] : undefined, basis, s.eenheid);
      rij.push(x === null ? null : Math.round(x * 1000) / 1000);
      if (x !== null) {
        var a = sam[s.pid] ? Object.assign({}, sam[s.pid]) : { n: 0, som: 0, min: x, max: x };
        a.n++; a.som += x; if (x < a.min) a.min = x; if (x > a.max) a.max = x;
        sam[s.pid] = a;
      }
    });
    st.sam = sam; st.n++;
    if (rr.opbouw !== 'samenvatting') {
      if (st.rijen.length < CFG.maxRijen) st.rijen = st.rijen.concat([rij]);
      else st.vol = true;
    }
    return st;
  }

  /* De sensoren met naam, basiseenheid en gekozen eenheid. `defs`:
     { pid: {name, unit} } (ALL_PID_DEFS of de keuzelijst). */
  function kolommen(rr, defs) {
    return rr.sensoren.map(function (s) {
      var d = (defs && defs[s.pid]) || {};
      var basis = s.basis || d.unit || '';
      return { pid: s.pid, naam: d.name || s.pid, eenheid: s.eenheid || basis };
    });
  }
  function samenvatting(rr, st, defs) {
    return kolommen(rr, defs).map(function (k) {
      var a = st && st.sam ? st.sam[k.pid] : null;
      return { pid: k.pid, naam: k.naam, eenheid: k.eenheid, n: a ? a.n : 0, min: a ? a.min : null, gem: a && a.n ? a.som / a.n : null, max: a ? a.max : null };
    });
  }
  function rond(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null; }
  function stempel(ms) {
    var d = new Date(ms), p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function vensterTekst(rr) {
    var v = rr.venster || {}, d = [];
    d.push(v.start === 'verbinden' ? 'vanzelf bij elke verbinding' : 'met de knop');
    if (v.van) d.push('tussen ' + v.van + ' en ' + v.tot);
    (v.voorwaarden || []).forEach(function (w) { d.push(w.pid + ' ' + w.op + ' ' + w.waarde); });
    if (v.maxMin) d.push('hoogstens ' + v.maxMin + ' min');
    return d.join(' · ');
  }

  /* CSV. `int` = internationaal (komma, punt); anders Excel-NL (puntkomma,
     komma). Kop: doel, venster en tempo als commentaarregels met #. */
  function csv(rr, st, defs, int) {
    var sep = int ? ',' : ';';
    var n = function (x) { if (x === null || x === undefined) return ''; var s = String(rond(x)); return int ? s : s.replace('.', ','); };
    var q = function (s) { s = String(s == null ? '' : s); return /[;,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var k = kolommen(rr, defs), uit = [];
    uit.push('# RR: ' + rr.naam);
    if (rr.doel) uit.push('# doel: ' + rr.doel);
    uit.push('# elke ' + rr.tempo + ' s · ' + vensterTekst(rr));
    if (rr.opbouw !== 'samenvatting') {
      uit.push(['tijd', 'sec'].concat(k.map(function (c) { return q(c.naam + ' (' + c.eenheid + ')'); })).join(sep));
      (st.rijen || []).forEach(function (r) {
        uit.push([stempel(r[0]), n((r[0] - st.start) / 1000)].concat(r.slice(1).map(n)).join(sep));
      });
      if (st.vol) uit.push('# de tijdreeks stopte bij ' + CFG.maxRijen + ' rijen; de samenvatting telt alles');
    }
    if (rr.opbouw !== 'tijdreeks') {
      if (rr.opbouw === 'beide') uit.push('');
      uit.push(['sensor', 'eenheid', 'metingen', 'min', 'gemiddeld', 'max'].join(sep));
      samenvatting(rr, st, defs).forEach(function (s) { uit.push([q(s.naam), q(s.eenheid), s.n, n(s.min), n(s.gem), n(s.max)].join(sep)); });
    }
    return uit.join('\n') + '\n';
  }
  function json(rr, st, defs) {
    var k = kolommen(rr, defs), o = { rr: rr.naam, doel: rr.doel || '', tempo_s: rr.tempo, venster: vensterTekst(rr), start: new Date(st.start).toISOString(), sensoren: k };
    if (rr.opbouw !== 'samenvatting') o.metingen = (st.rijen || []).map(function (r) { var m = { tijd: new Date(r[0]).toISOString() }; k.forEach(function (c, i) { m[c.pid] = r[i + 1]; }); return m; });
    if (rr.opbouw !== 'tijdreeks') o.samenvatting = samenvatting(rr, st, defs).map(function (s) { return { pid: s.pid, naam: s.naam, eenheid: s.eenheid, n: s.n, min: rond(s.min), gem: rond(s.gem), max: rond(s.max) }; });
    if (st.vol) o.afgekapt = CFG.maxRijen;
    return JSON.stringify(o, null, 1);
  }
  /* Het rapport voor Rapporten: leesbare tekst met de samenvatting, en de
     tijdreeks erachter (afgekapt op wat een rapport mag dragen). */
  function rapportTekst(rr, st, defs, nu) {
    var r = ['RR — ' + rr.naam, ''];
    if (rr.doel) r.push('Doel: ' + rr.doel);
    r.push('Gemeten: ' + stempel(st.start) + ' tot ' + stempel(nu || st.laatst || st.start) + ' · ' + st.n + ' metingen in ' + st.vensters + ' venster' + (st.vensters === 1 ? '' : 's'));
    r.push('Elke ' + rr.tempo + ' s · ' + vensterTekst(rr), '', 'Samenvatting:');
    samenvatting(rr, st, defs).forEach(function (s) {
      r.push('- ' + s.naam + ' (' + s.eenheid + '): ' + (s.n ? 'min ' + rond(s.min) + ' · gem ' + rond(s.gem) + ' · max ' + rond(s.max) + ' (' + s.n + ')' : 'geen waarde gemeten'));
    });
    var t = r.join('\n');
    if (rr.opbouw !== 'samenvatting' && st.rijen && st.rijen.length) {
      var reeks = csv(Object.assign({}, rr, { opbouw: 'tijdreeks' }), st, defs, false);
      t += '\n\nTijdreeks (CSV):\n' + (reeks.length > 100000 ? reeks.slice(0, 100000) + '\n… afgekapt; exporteer voor alles' : reeks);
    }
    return t;
  }

  // ── Formulier ───────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* `lijst` = [{pid, name, unit}] — wat deze auto kan (de keuzelijst). */
  function formHtml(rr, lijst) {
    rr = rr || { tempo: 2, venster: { start: 'knop', voorwaarden: [] }, opbouw: 'tijdreeks', export: 'csv', sensoren: [] };
    var v = rr.venster || {}, gekozen = {};
    (rr.sensoren || []).forEach(function (s) { gekozen[s.pid] = s; });
    var opt = function (w, lijstje, lab) { return lijstje.map(function (x, i) { return '<option value="' + esc(x) + '"' + (String(x) === String(w) ? ' selected' : '') + '>' + esc(lab ? lab[i] : x) + '</option>'; }).join(''); };
    var pidOpt = function (w) { return '<option value="">—</option>' + (lijst || []).map(function (d) { return '<option value="' + esc(d.pid) + '"' + (d.pid === w ? ' selected' : '') + '>' + esc(d.name || d.pid) + (d.unit ? ' (' + esc(d.unit) + ')' : '') + '</option>'; }).join(''); };
    var h = '<div class="gr-blok"><div class="gr-bh">🎯 ' + (rr.id ? 'RR bewerken' : 'Nieuwe RR') + '</div>' +
      '<div class="gr-klein">Een eigen meetopdracht: alleen de sensoren die jij wilt, in jouw eenheid, op jouw momenten.</div>' +
      (rr.id ? '<input type="hidden" id="rr_id" value="' + esc(rr.id) + '">' : '') +
      '<label class="gr-veld">Naam<input id="rr_naam" maxlength="40" value="' + esc(rr.naam || '') + '" placeholder="bv. Trekhaakproef A2"></label>' +
      '<label class="gr-veld">Doel — waarvoor meet je dit?<input id="rr_doel" maxlength="200" value="' + esc(rr.doel || '') + '" placeholder="bv. koelwater en olie bij 1500 kg aanhanger"></label>' +
      '<div class="gr-gk">1. Welke sensoren en in welke eenheid</div>';
    if (!(lijst || []).length) h += '<div class="gr-melding">Verbind eerst met de auto: dan weet de app welke sensoren er zijn.</div>';
    h += (lijst || []).map(function (d, i) {
      var g = gekozen[d.pid], e = eenheden(d.unit);
      return '<div class="gr-2 rr-sens"><label class="gr-chk"><input type="checkbox" id="rr_s' + i + '" data-pid="' + esc(d.pid) + '" data-basis="' + esc(d.unit || '') + '"' + (g ? ' checked' : '') + '> ' + esc(d.name || d.pid) + '</label>' +
        (e.length > 1 ? '<select id="rr_e' + i + '" aria-label="Eenheid">' + opt(g && g.eenheid || d.unit || '', e) + '</select>' : '<span class="gr-klein">' + esc(d.unit || '') + '</span>') + '</div>';
    }).join('');
    h += '<div class="gr-gk">2. Hoe vaak</div><label class="gr-veld">Elke<select id="rr_tempo">' + opt(rr.tempo, CFG.tempo, CFG.tempo.map(function (t) { return t + ' s'; })) + '</select></label>' +
      '<div class="gr-gk">3. Wanneer — het venster</div>' +
      '<label class="gr-veld">Starten<select id="rr_start">' + opt(v.start || 'knop', CFG.start, ['met de knop', 'vanzelf bij elke verbinding']) + '</select></label>' +
      '<div class="gr-2"><label class="gr-veld">Alleen tussen (klok)<input id="rr_van" type="time" value="' + esc(v.van || '') + '"></label><label class="gr-veld">en<input id="rr_tot" type="time" value="' + esc(v.tot || '') + '"></label></div>' +
      '<label class="gr-veld">Hoogstens (minuten per keer, leeg = tot stoppen)<input id="rr_max" type="number" min="1" max="1440" value="' + esc(v.maxMin == null ? '' : v.maxMin) + '"></label>' +
      '<div class="gr-klein">Alleen meten zolang (alle) voorwaarden gelden — leeg = altijd:</div>';
    for (var j = 0; j < CFG.maxVoorwaarden; j++) {
      var w = (v.voorwaarden || [])[j] || {};
      h += '<div class="gr-2"><select id="rr_wp' + j + '" aria-label="Sensor van voorwaarde ' + (j + 1) + '">' + pidOpt(w.pid) + '</select>' +
        '<span style="display:flex;gap:6px"><select id="rr_wo' + j + '" aria-label="Vergelijking">' + opt(w.op || '>', CFG.ops) + '</select>' +
        '<input id="rr_ww' + j + '" type="number" step="any" aria-label="Waarde" value="' + esc(w.waarde == null ? '' : w.waarde) + '"></span></div>';
    }
    h += '<div class="gr-gk">4. Opbouw en export</div>' +
      '<div class="gr-2"><label class="gr-veld">Opbouw<select id="rr_opbouw">' + opt(rr.opbouw, CFG.opbouw, ['tijdreeks (een rij per meting)', 'samenvatting (min, gem, max)', 'allebei']) + '</select></label>' +
      '<label class="gr-veld">Export<select id="rr_export">' + opt(rr.export, CFG.export, ['CSV voor Excel (NL)', 'CSV internationaal', 'JSON']) + '</select></label></div>' +
      '<label class="gr-chk"><input type="checkbox" id="rr_rapport"' + (rr.rapport ? ' checked' : '') + '> Na het stoppen ook bewaren in Rapporten</label>' +
      '<div class="gr-klein">De waarden in de eenheid van de auto staan in de voorwaarden; de export gebruikt jouw eenheid.</div></div>' +
      '<div id="rrFout"></div><div class="gr-knoppen"><button class="gr-k hoofd" onclick="PLGarage._rrBewaar()">Bewaren</button><button class="gr-k" onclick="PLGarage._rrAnnuleer()">Annuleren</button></div>';
    return h;
  }
  /* Leest het formulier terug (puur op `doc`) en geeft wat normaliseer() wil. */
  function uitFormulier(doc, n) {
    var el = function (id) { return doc.getElementById(id); };
    var w = function (id) { var e = el(id); return e ? String(e.value) : ''; };
    var sens = [];
    for (var i = 0; i < (n || 0); i++) {
      var c = el('rr_s' + i); if (!c || !c.checked) continue;
      var pid = c.getAttribute ? c.getAttribute('data-pid') : c.dataset.pid, basis = c.getAttribute ? c.getAttribute('data-basis') : c.dataset.basis;
      var e = el('rr_e' + i), eh = e ? String(e.value) : '';
      sens.push(eh && eh !== basis ? { pid: pid, eenheid: eh } : { pid: pid });
    }
    var voorw = [];
    for (var j = 0; j < CFG.maxVoorwaarden; j++) { if (w('rr_wp' + j)) voorw.push({ pid: w('rr_wp' + j), op: w('rr_wo' + j), waarde: w('rr_ww' + j) }); }
    var r = el('rr_rapport');
    return { id: w('rr_id'), naam: w('rr_naam'), doel: w('rr_doel'), sensoren: sens, tempo: Number(w('rr_tempo')),
      venster: { start: w('rr_start'), van: w('rr_van'), tot: w('rr_tot'), maxMin: w('rr_max'), voorwaarden: voorw },
      opbouw: w('rr_opbouw'), export: w('rr_export'), rapport: !!(r && r.checked) };
  }

  // ── De lus ──────────────────────────────────────────────────────────
  // Per RR-id één lopende meting. PLGarage roept start/stop en leest stand().
  var _lopend = {}, _timer = null;
  function defsNu() { try { return (typeof window !== 'undefined' && window.ALL_PID_DEFS) || {}; } catch (e) { return {}; } }
  function basisVan(rr) {
    var d = defsNu();
    return Object.assign({}, rr, { sensoren: rr.sensoren.map(function (s) { return Object.assign({ basis: (d[s.pid] && d[s.pid].unit) || '' }, s); }) });
  }
  function lusTik() {
    var nu = Date.now(), w = {};
    try { w = typeof pidVals !== 'undefined' ? pidVals : {}; } catch (e) { console.warn('PLRR: pidVals onleesbaar', e); }
    Object.keys(_lopend).forEach(function (id) {
      var L = _lopend[id];
      try { L.st = tik(L.st, L.rr, w, nu); if (L.st.klaar && L.bijKlaar) { var f = L.bijKlaar; L.bijKlaar = null; f(id); } }
      catch (e) { console.warn('PLRR: tik van ' + L.rr.naam + ' mislukt', e); }
    });
    if (!Object.keys(_lopend).length && _timer) { clearInterval(_timer); _timer = null; }
  }
  /* Begint een RR. `bijKlaar(id)`: als de maximale duur om is. */
  function start(rr, vnaam, bijKlaar) {
    if (_lopend[rr.id]) return false;
    var r = basisVan(rr);
    var pids = r.sensoren.map(function (s) { return s.pid; }).concat((r.venster.voorwaarden || []).map(function (w) { return w.pid; }));
    try { if (window.PLVoorkeur && PLVoorkeur.selectieToepassen) PLVoorkeur.selectieToepassen(pids, 'RR ' + r.naam + (vnaam ? ' (' + vnaam + ')' : ''), { erbij: true }); }
    catch (e) { console.warn('PLRR: sensoren niet aangezet — de RR meet wat er al aanstaat', e); }
    _lopend[rr.id] = { rr: r, st: nieuw(Date.now()), bijKlaar: bijKlaar || null };
    if (!_timer) _timer = setInterval(lusTik, 1000);
    return true;
  }
  /* Stopt een RR en geeft { rr, st } terug (of null). */
  function stop(id) { var L = _lopend[id]; if (!L) return null; delete _lopend[id]; lusTik(); return { rr: L.rr, st: L.st }; }
  function stand(id) { var L = _lopend[id]; return L ? L.st : null; }
  function loopt() { return Object.keys(_lopend); }

  window.PLRR = {
    CFG: CFG, normaliseer: normaliseer, formHtml: formHtml, uitFormulier: uitFormulier,
    start: start, stop: stop, stand: stand, loopt: loopt, vensterTekst: vensterTekst,
    csv: csv, json: json, rapportTekst: rapportTekst, samenvatting: samenvatting,
    _kern: { eenheden: eenheden, omreken: omreken, vensterOpen: vensterOpen, tik: tik, nieuw: nieuw, kolommen: kolommen, basisVan: basisVan }
  };
})();
