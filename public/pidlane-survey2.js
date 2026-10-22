// pidlane-survey2.js — PLSurvey2: Full survey V2, schema 3 (22-10-2026)
//
// De rittencampagne (#541) begint: vier à vijf merken die ver van de CX-5
// afstaan. Per auto vraagt het issue acht stappen en een tabel met ✓/✗.
// Schema 2 (vlFullSurvey in pidlane-veldlab.js) meet stap 1–3 en een deel
// van 6; dit bestand vult de rest aan en zet de tabelregel erbij, zodat een
// ritdag niet op losse notities draait.
//
// Wat er bij komt, en waarom:
//   mode09    0900-bitmap, ECU-namen (090A), IUPR (0908 benzine, 090B
//             diesel): hoe vaak elke monitor echt gedraaid heeft. Een
//             monitor die 0 keer van de N ritten liep is een vraag voor de
//             garage, niet voor de sensor.
//   obdOnUds  SAE J1979-2 (OBDonUDS): auto's vanaf ~2024 (verplicht in de VS
//             vanaf MY2027, in de EU als WWH-OBD) geven de PIDs als
//             service 22 F4xx in plaats van mode 01. 22F400 is daar de
//             bitmap. Antwoordt een auto daarop en niet op 0100, dan is
//             "geen PIDs" een protocolvraag en geen dode auto.
//   dood      plaatshouders: een PID die "ok" antwoordt met precies de
//             grens van één byte (−40/215 °C, 1,275 V, 255 kPa…) is vaak
//             een sensor die er niet is (#541 stap 2).
//   mode06    PLM06.scan() + samenvat() (#540, stap 5).
//   uds       PLUds.scan(): foutcodes van alle stuurapparaten (stap 6).
//   kenmerk   het profiel van de derde poort (#532, stap 4).
//   eigen     hoeveel eigen sensoren, en de laatste ronde van PLPidZoek
//             (stap 7).
//   campagne  de acht stappen als rijen, en tabelRegel() voor #541.
//
// Puur en los getoetst (test-survey2.js): doodePids, obdOnUds, iupr,
// ecuNamen, campagne, tabelRegel. meet() doet de bus, met io van buiten.
(function () {
  'use strict';
  const SCHEMA = 3;

  function hexVan(raw) {
    // Zelfde normalisatie als _svNormHex in veldlab: per regel, headers weg.
    let uit = '';
    String(raw || '').split(/[\r\n]+/).forEach(function (l) {
      l = l.trim();
      const genummerd = /^\d+:\s*/.test(l);
      l = l.replace(/^\d+:\s*/, '');
      let h = l.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (!h || (!genummerd && h.length <= 3)) return;
      if (!genummerd) {
        if (/^18DA/.test(h)) h = h.slice(8);
        else if (/^7E[89A-F]/.test(h)) h = h.slice(3);
        if (/^1[0-9A-F]/.test(h)) h = h.slice(4);
        else if (/^[23][0-9A-F]/.test(h)) h = h.slice(2);
      }
      uit += h;
    });
    return uit;
  }
  function bytesNa(raw, marker) {
    const h = hexVan(raw), i = h.indexOf(marker);
    if (i < 0) return null;
    const b = [];
    for (let k = i + marker.length; k + 1 < h.length; k += 2) b.push(parseInt(h.slice(k, k + 2), 16));
    return b;
  }

  /* Plaatshouders: de grens van één byte, per eenheid. Alleen "verdacht":
     een koude motor in Lapland meet ook −40. */
  const GRENSWAARDE = { '°C': [-40, 215], 'V': [1.275], 'kPa': [255], 'km/h': [255], 'rpm': [16383.75] };
  function doodePids(detail) {
    return (detail || []).filter(function (d) {
      if (!d || d.st !== 'ok' || typeof d.val !== 'number') return false;
      const g = GRENSWAARDE[String(d.unit || '').trim()];
      return !!g && g.some(function (x) { return Math.abs(d.val - x) < 1e-6; });
    }).map(function (d) { return { pid: d.pid, naam: d.naam || '', val: d.val, unit: d.unit || '' }; });
  }

  // 22F400 → 62F400 + vier bytes bitmap: de auto spreekt OBDonUDS (J1979-2).
  function obdOnUds(raw) {
    const b = bytesNa(raw, '62F400');
    if (!b || b.length < 4) return { ja: false, raw: String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    const bits = b.slice(0, 4), aan = [];
    bits.forEach(function (x, i) { for (let j = 0; j < 8; j++) if (x & (0x80 >> j)) aan.push('F4' + (i * 8 + j + 1).toString(16).toUpperCase().padStart(2, '0')); });
    return { ja: true, n: aan.length, dids: aan };
  }

  /* IUPR (0908/090B): eerst eventueel een telbyte (NODI), dan paren van twee
     bytes. Paar 0 = OBDCOND (ritten die meetellen), paar 1 = IGNCNTR
     (contactbeurten), daarna per monitor teller/noemer. Met NODI klopt
     het aantal bytes precies; zonder niet. */
  const IUPR_NAAM = { '4908': ['kat B1', 'kat B2', 'O2 B1', 'O2 B2', 'EGR/VVT', 'lucht', 'EVAP', 'O2 achter B1', 'O2 achter B2'],
    '490B': ['NMHC-kat', 'NOx-kat', 'NOx-sensor', 'PM-filter', 'uitlaatsensor', 'EGR/VVT', 'laaddruk'] };
  function iupr(raw, marker) {
    let b = bytesNa(raw, marker);
    if (!b || b.length < 4) return null;
    if (b[0] * 2 === b.length - 1) b = b.slice(1);
    const w = function (i) { return b[i] * 256 + b[i + 1]; };
    const namen = IUPR_NAAM[marker] || [];
    const uit = { ritten: w(0), contact: w(2), monitors: [] };
    for (let i = 4, m = 0; i + 3 < b.length; i += 4, m++) {
      const teller = w(i), noemer = w(i + 2);
      uit.monitors.push({ naam: namen[m] || 'monitor ' + (m + 1), teller: teller, noemer: noemer, ratio: noemer ? Math.round(teller / noemer * 100) / 100 : null });
    }
    // Een monitor die er wel is (noemer > 0) maar nooit draaide (teller 0).
    uit.nooit = uit.monitors.filter(function (m) { return m.noemer > 0 && m.teller === 0; }).map(function (m) { return m.naam; });
    return uit;
  }

  // 090A: per ECU een telbyte (01) en 20 tekens ASCII ("ECM-EngineControl").
  function ecuNamen(raw) {
    return hexVan(raw).split('490A').slice(1).map(function (h) {
      const b = [];
      for (let k = 0; k + 1 < h.length; k += 2) b.push(parseInt(h.slice(k, k + 2), 16));
      return b.slice(b[0] === 1 ? 1 : 0, (b[0] === 1 ? 1 : 0) + 20).map(function (x) { return x >= 32 && x < 127 ? String.fromCharCode(x) : ''; }).join('').trim();
    }).filter(Boolean);
  }

  /* De acht stappen van #541. staat: ✓ goed, ~ let op, ✗ fout, — niet gemeten. */
  function rij(stap, staat, detail) { return { stap: stap, staat: staat, detail: detail }; }
  function campagne(sv) {
    sv = sv || {};
    const v2 = sv.v2 || {}, p = sv.pids || {}, r = [];
    r.push(p.total ? rij('Verbinden', p.ok > 0 ? '✓' : '✗', (sv.adapter && sv.adapter.proto || 'protocol ?') + (sv.timing && sv.timing.avgMs ? ', ' + sv.timing.avgMs + ' ms per vraag' : ''))
      : rij('Verbinden', v2.obdOnUds && v2.obdOnUds.ja ? '~' : '✗', v2.obdOnUds && v2.obdOnUds.ja ? 'geen mode 01, wel OBDonUDS (J1979-2)' : 'geen PIDs'));
    const dood = (v2.dood || []).length;
    r.push(rij('Sensoren', !p.ok ? '✗' : (dood || p.invalid) ? '~' : '✓', (p.ok || 0) + ' ok, ' + (p.invalid || 0) + ' ongeldig, ' + dood + ' plaatshouder(s)' + (p.transport ? ', ' + p.transport + ' transportfout' : '')));
    const ft = sv.functietest;
    r.push(ft && typeof ft.cijfer === 'number' ? rij('Uitgebreide test', ft.cijfer >= 7 ? '✓' : ft.cijfer >= 5 ? '~' : '✗', 'cijfer ' + ft.cijfer) : rij('Uitgebreide test', '—', 'geen oordeel'));
    const km = v2.kenmerk;
    if (km) {
      const ks = Object.keys(km), onb = ks.filter(function (k) { return !km[k]; });
      r.push(rij('Derde poort', onb.length > ks.length / 2 ? '~' : '✓', (ks.length - onb.length) + ' van ' + ks.length + ' kenmerken bekend' + (onb.length ? ' (onbekend: ' + onb.join(', ') + ')' : '')));
    } else r.push(rij('Derde poort', '—', 'geen profiel'));
    const m6 = v2.mode06;
    r.push(!m6 ? rij('Mode 06', '—', 'niet gelezen') : m6.fout ? rij('Mode 06', '✗', m6.fout)
      : rij('Mode 06', !m6.aantalTests ? '✗' : m6.aantalGezakt ? '~' : '✓', m6.tekst + (m6.aantalOnzeker ? ', ' + m6.aantalOnzeker + ' onzeker' : '')));
    const d = sv.dtc, u = v2.uds;
    const dtcTekst = d ? (d.actief || []).length + ' actief, ' + (d.pending || []).length + ' pending' : 'mode 03 niet gelezen';
    r.push(rij('Foutcodes', !d ? '✗' : u && u.fout ? '~' : '✓', dtcTekst + (u ? (u.fout ? ' · UDS: ' + u.fout : ' · UDS: ' + u.antwoord + ' van ' + u.gevraagd + ' stuurapparaten, ' + u.codes + ' code(s)') : ' · UDS niet gelezen')));
    const e = v2.eigen;
    r.push(!e || !e.zoek ? rij('OBDb', '—', (e ? e.n + ' eigen sensor(en)' : '') + (e && e.n ? '; ' : '') + 'Alle sensoren zoeken niet gedraaid')
      : rij('OBDb', e.zoek.past ? '✓' : '✗', e.zoek.past + ' van ' + e.zoek.gedaan + ' codes plausibel, ' + e.zoek.vreemd + ' vreemd, ' + e.zoek.nee + ' geweigerd'));
    r.push(rij('AI-analyse', '—', 'met de hand: één analyse draaien en lezen'));
    return r;
  }
  // Eén regel voor de tabel in #541: merk | model | jaar | stap 1…8.
  function tabelRegel(sv, rijen) {
    const v = (sv && sv.veh) || {};
    const cel = function (x) { return String(x || '?').replace(/\|/g, '/'); };
    return '| ' + [cel(v.merk), cel(v.model), cel(v.jaar)].concat((rijen || campagne(sv)).map(function (r) { return r.staat; })).join(' | ') + ' |';
  }
  function tabelKop() { return '| merk | model | jaar | ' + campagne({}).map(function (r) { return r.stap; }).join(' | ') + ' |\n|' + new Array(12).join('---|'); }

  /* De meting. io = { bus(fn) — één busbeurt, stuur(cmd, ms), ui(tekst),
     stop() → true om te stoppen, isCan }. Elk onderdeel apart: een fout in
     één stap kost die stap, niet de survey. */
  async function meet(sv, io) {
    io = io || {};
    const v2 = sv.v2 = { versie: 2 };
    sv.schema = SCHEMA;
    const ui = function (t) { try { if (io.ui) io.ui(t); } catch (e) { console.warn('PLSurvey2: ui', e); } };
    const stop = function () { return !!(io.stop && io.stop()); };
    const stap = async function (naam, fn) {
      if (stop()) throw new Error('afgebroken door gebruiker');
      try { await fn(); }
      catch (e) { v2.fouten = v2.fouten || []; v2.fouten.push(naam + ': ' + ((e && e.message) || e)); console.warn('PLSurvey2: ' + naam, e); }
    };
    const stuur = io.stuur;
    const bus = io.bus || function (fn) { return fn(); };

    v2.dood = doodePids(sv.pids && sv.pids.detail);

    await stap('mode09', async function () {
      ui('V2: mode 09 (ECU-namen, IUPR)…');
      await bus(async function () {
        const m = v2.mode09 = {};
        const r0 = await stuur('0900', 2500); m.bitmap = String(r0 || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        m.ecuNamen = ecuNamen(await stuur('090A', 4000));
        m.iupr = iupr(await stuur('0908', 4000), '4908');
        if (/diesel/i.test((sv.veh && sv.veh.brandstof) || '') || (sv.ecuFuel && /diesel/i.test(sv.ecuFuel.naam || ''))) m.iuprDiesel = iupr(await stuur('090B', 4000), '490B');
      });
    });
    if (io.isCan) {
      await stap('obdOnUds', async function () {
        ui('V2: OBDonUDS (22F400)…');
        await bus(async function () { v2.obdOnUds = obdOnUds(await stuur('22F400', 2500)); });
      });
    }
    await stap('mode06', async function () {
      if (!io.m06 || typeof io.m06.scan !== 'function') return;
      ui('V2: mode 06 monitortests…');
      try { v2.mode06 = io.m06.samenvat(await io.m06.scan()); }
      catch (e) { v2.mode06 = { fout: String((e && e.message) || e).slice(0, 80) }; }
    });
    await stap('uds', async function () {
      if (!io.uds || typeof io.uds.scan !== 'function' || !io.isCan) return;
      ui('V2: foutcodes van alle stuurapparaten (UDS)…');
      try {
        const res = await io.uds.scan();
        const mods = (res && res.modules) || [];
        v2.uds = { gevraagd: mods.length, antwoord: mods.filter(function (m) { return m.staat !== 'stil'; }).length,
          codes: mods.reduce(function (s, m) { return s + ((m.codes || []).length); }, 0),
          modules: mods.map(function (m) { return { hdr: m.hdr, naam: m.naam, staat: m.staat, n: (m.codes || []).length }; }) };
        if (res && res.nietCan) v2.uds.fout = 'geen CAN';
      } catch (e) { v2.uds = { fout: String((e && e.message) || e).slice(0, 80), gevraagd: 0, antwoord: 0, codes: 0 }; }
    });
    await stap('kenmerk', async function () {
      if (!io.kenmerk) return;
      const p = io.kenmerk() || {}, k = {};
      Object.keys(p).forEach(function (id) { const x = p[id]; k[id] = x && x.zeker ? (x.waarde ? 'ja' : 'nee') + ' (' + x.zeker + ')' : null; });
      v2.kenmerk = k;
    });
    await stap('eigen', async function () {
      if (!io.eigen) return;
      const e = io.eigen();
      const z = e.zoek;
      v2.eigen = { n: e.n || 0, zoek: z ? { gedaan: z.gedaan, past: z.past.length, vreemd: z.vreemd.length, nee: z.nee.length } : null };
    });
    v2.campagne = campagne(sv);
    v2.tabelRegel = tabelRegel(sv, v2.campagne);
    return v2;
  }

  function html(sv) {
    const v2 = sv && sv.v2;
    if (!v2 || !v2.campagne) return '';
    const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    return '<div style="margin-top:10px;text-align:left;font-size:13px"><b>Campagne #541 — survey V2</b>' +
      v2.campagne.map(function (r) { return '<div>' + esc(r.staat) + ' <b>' + esc(r.stap) + '</b> — ' + esc(r.detail) + '</div>'; }).join('') +
      '<div style="margin-top:6px;font-family:monospace;font-size:11px;word-break:break-all;user-select:all">' + esc(v2.tabelRegel) + '</div></div>';
  }

  window.PLSurvey2 = { SCHEMA: SCHEMA, doodePids: doodePids, obdOnUds: obdOnUds, iupr: iupr, ecuNamen: ecuNamen,
    campagne: campagne, tabelRegel: tabelRegel, tabelKop: tabelKop, meet: meet, html: html, _hexVan: hexVan };
})();
