// ══════════════════════════════════════════════════════════════════
// pidlane-logimport.js — PLLogImport: een log van buiten inlezen (16-11-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// De app oordeelt op vaste grenzen; de AI hoort daar een oorzaak bij te
// vinden. Of die keten werkt, viel tot nu toe alleen in de auto na te gaan.
// Met een ingelezen log kan dat aan tafel: een eigen opname, een CSV van
// Torque of Car Scanner (logs van anderen), of een verzonnen scenariolog uit
// `scenariolog/` met de verwachting in de kop.
//
// DRIE LAGEN, EEN BETEKENIS PER LAAG
//   - de APP geeft een basisoordeel (`oordeel()`): de echte PLVerzamel-
//     samenvatting per deel (stil/rijdend, PLTotaal.deelHist) en
//     PLTotaal.categorieen. Geen diagnose, geen eigen grenzen.
//   - wat de AI ZIET (`prompt()`): dezelfde blokken als de totaalcheck, plus
//     de samenhang (PLSamenhang). De verwachting uit de kop gaat er NOOIT in:
//     dat zou de toets voorzeggen.
//   - wat de AI ANTWOORDT (laag B: `# AI MOET` / `# AI MAG NIET`) wordt nu
//     alleen gelezen, nog niet gekeurd.
//
// DE KOP van een scenariolog (regels die met # beginnen, alle optioneel):
//   # SCENARIO: <naam>
//   # AUTO: <merk model, brandstof>        (een VIN gaat er bij het lezen uit)
//   # BASIS: <ok|let op|afwijkend|meetfout|twijfel> [/ <categorie>]
//   # SIGNAAL: [stil:|rij:]<pid> <min|max|gem|laatste|n><op><getal>
//   # SIGNAAL: "tekst"   of   !"tekst"      (moet / mag niet in de prompt)
//   # AI MOET: a | b       # AI MAG NIET: c | d
//
// FORMATEN: breed (een kolom per sensor; Torque, eigen export, kolomkop als
// PID-code) en lang (een regel per monster; Car Scanner SECONDS;PID;VALUE;
// UNITS). Eenheden worden omgerekend (°F, mph, psi, inHg, bar, lb/min);
// een sensor met een onbekende eenheid valt weg met een waarschuwing, nooit
// stil. Een kolom met VIN erin wordt niet gelezen (§7).
//
// De kern is puur (tussen de ankers); test-scenariolog.js laadt hem.
// ══════════════════════════════════════════════════════════════════
// ── PLLogImport kern begin ──
window.PLLogImport = (function () {
  'use strict';
  const MAX_MONSTERS = 400000;
  const RANG = { afwijkend: 0, let: 1, meetfout: 2, twijfel: 3, ok: 4, nodata: 5 };
  const getal = v => typeof v === 'number' && isFinite(v);
  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

  /* Namen zoals andere apps ze schrijven → PID. Volgorde telt: de eerste
     treffer wint. GPS-kolommen vallen er bewust buiten (geen OBD). */
  const NAMEN = [
    [/gps|latitude|longitude|bearing|altitude|accuracy|satellite/, null],
    [/short.?term.*(bank ?2|b2)|(bank ?2|b2).*short.?term|stft.?(b?2)/, '0108'],
    [/long.?term.*(bank ?2|b2)|(bank ?2|b2).*long.?term|ltft.?(b?2)/, '0109'],
    [/short.?term|stft|trim kort|korte.?termijn/, '0106'],
    [/long.?term|ltft|trim lang|lange.?termijn/, '0107'],
    [/(o2|lambda|zuurstof).*(sensor ?2|s2)\b|b1s2/, '0115'],
    [/(o2|lambda|zuurstof).*(sensor ?1|s1)\b|b1s1/, '0114'],
    [/coolant|koelwater/, '0105'],
    [/oil temp|olie.?temp|engine oil/, '015C'],
    [/intake air temp|inlaatlucht|^iat$/, '010F'],
    [/ambient|omgevingstemp|buitentemp|outside/, '0146'],
    [/mass air ?flow|^maf|luchtmassa/, '0110'],
    [/throttle|gasklep/, '0111'],
    [/manifold|^map$|inlaatdruk|boost/, '010B'],
    [/barometric|barometer/, '0133'],
    [/control module|module voltage|accuspanning|boordspanning|battery voltage|^voltage$/, '0142'],
    [/^(calculated )?engine load|^load$|motorbelasting|berekende belasting/, '0104'],
    [/timing advance|ontsteking/, '010E'],
    [/fuel level|tankinhoud|brandstofpeil/, '012F'],
    [/rpm|toerental|engine speed/, '010C'],
    [/speed|snelheid/, '010D']
  ];

  /* Eenheid → [genormaliseerd, factor of functie naar de app-eenheid]. */
  function eenheid(u) {
    const s = String(u || '').toLowerCase().replace(/[\s.]/g, '').replace(/^deg/, '°').replace(/^º/, '°');
    if (!s) return '';
    if (/^°?c$|celsius/.test(s)) return 'c';
    if (/^°?f$|fahrenheit/.test(s)) return 'f';
    if (/^(km\/h|kmh|kph|km\/u)$/.test(s)) return 'kmh';
    if (/^mph$/.test(s)) return 'mph';
    if (/^(rpm|tpm|1\/min|omw\/min)$/.test(s)) return 'rpm';
    if (/^kpa$/.test(s)) return 'kpa';
    if (/^psi$/.test(s)) return 'psi';
    if (/^inhg$/.test(s)) return 'inhg';
    if (/^bar$/.test(s)) return 'bar';
    if (/^v(olt)?$/.test(s)) return 'v';
    if (s === '%') return '%';
    if (/^(g\/s|gs|g\/sec)$/.test(s)) return 'gs';
    if (/^(lb\/min|lbs\/min)$/.test(s)) return 'lbmin';
    if (/^(°|°btdc|graden)$/.test(s)) return 'graad';
    return '?' + s;
  }
  const NAAR = {
    'f>c': v => (v - 32) * 5 / 9, 'mph>kmh': v => v * 1.609344, 'psi>kpa': v => v * 6.894757,
    'inhg>kpa': v => v * 3.386389, 'bar>kpa': v => v * 100, 'lbmin>gs': v => v * 7.559873
  };
  /* Een omrekening van `van` naar de eenheid van de PID-definitie, of null
     als die er niet is. Geen eenheid in het bestand = die van de app. */
  function omrekening(van, defUnit) {
    const doel = eenheid(defUnit);
    if (!van || van === doel) return v => v;
    if (doel === 'graad' && van === '') return v => v;
    return NAAR[van + '>' + doel] || null;
  }

  /* Een kolomkop → {pid, eenheid}. Een kop die zelf een PID is (010C, 0x0C,
     0C) gaat voor; anders de naam. Eenheid tussen haakjes achteraan, of
     los meegegeven (`eenh`, het lange formaat): die geldt dan altijd, ook
     als hij onbekend is — dan valt de sensor weg in plaats van stil als
     de eenheid van de app gelezen te worden. */
  function kolom(kop, kent, eenh) {
    const ruw = String(kop || '').trim().replace(/^"|"$/g, '');
    let naam = ruw, u = eenh || '';
    const m = eenh == null && /^(.*?)\s*[([]\s*([^()[\]]*)\s*[)\]]\s*$/.exec(ruw);
    if (m && m[2] && eenheid(m[2]) && eenheid(m[2])[0] !== '?') { naam = m[1]; u = m[2]; }
    const code = /^(?:0x|01)?([0-9a-f]{2})$/i.exec(naam.trim());
    if (code) { const p = '01' + code[1].toUpperCase(); if (!kent || kent(p)) return { pid: p, eenheid: eenheid(u), naam: ruw }; }
    if (/^01[0-9a-f]{2}$/i.test(naam.trim())) return { pid: naam.trim().toUpperCase(), eenheid: eenheid(u), naam: ruw };
    const l = naam.toLowerCase();
    for (const [re, pid] of NAMEN) if (re.test(l)) return pid ? { pid, eenheid: eenheid(u), naam: ruw } : null;
    return null;
  }

  function scheiding(regel) {
    let best = ',', n = -1;
    [',', ';', '\t'].forEach(s => { const k = String(regel).split(s).length; if (k > n) { n = k; best = s; } });
    return best;
  }
  function velden(regel, sep) {
    const uit = []; let cur = '', q = false;
    for (let i = 0; i < regel.length; i++) {
      const c = regel[i];
      if (c === '"') { if (q && regel[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { uit.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    uit.push(cur.trim());
    return uit;
  }
  function getalUit(s, sep) {
    let t = String(s == null ? '' : s).trim();
    if (!t || t === '-' || /^n\/?a$/i.test(t)) return null;
    if (sep !== ',' && /^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    const v = Number(t);
    return isFinite(v) ? v : null;
  }

  const MAAND = { jan: 0, feb: 1, mar: 2, mrt: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11 };
  /* Een tijdstempel → ms (alleen het verschil telt). Getal: ms of s volgens
     de kolomnaam. Tekst: [datum] hh:mm:ss[.sss]. Onleesbaar = null. */
  function tijd(s, soort) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (/^-?\d+([.,]\d+)?$/.test(t)) {
      const v = Number(t.replace(',', '.'));
      return soort === 'ms' ? v : v * 1000;
    }
    const k = /(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/.exec(t);
    if (!k) return null;
    let dag = 0;
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
    const eu = /(\d{1,2})[-/ ]([a-z]{3}|\d{1,2})[-/ ](\d{4})/i.exec(t);
    if (iso) dag = Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    else if (eu) { const mn = isNaN(+eu[2]) ? MAAND[eu[2].toLowerCase()] : +eu[2] - 1; if (mn != null) dag = Date.UTC(+eu[3], mn, +eu[1]); }
    return dag + ((+k[1] * 60 + +k[2]) * 60 + +k[3]) * 1000 + (k[4] ? +k[4].padEnd(3, '0') : 0);
  }
  function tijdKolom(koppen) {
    const l = koppen.map(k => String(k).toLowerCase().replace(/"/g, '').trim());
    const voorkeur = [/^device ?time/, /^t_?ms$|^(time|tijd)[ _(]*ms\)?$/, /^seconds?$|^sec$|^(time|tijd)[ _(]*s\)?$/, /^(time|tijd|timestamp)$/];
    for (const re of voorkeur) { const i = l.findIndex(k => re.test(k)); if (i >= 0) return { i, soort: /ms/.test(l[i]) ? 'ms' : 's' }; }
    return null;
  }

  /* De kop: # SLEUTEL: waarde. Een VIN gaat er hier al uit. */
  function kop(regels) {
    const k = { scenario: null, auto: null, basis: null, signalen: [], moet: [], magNiet: [] };
    regels.forEach(r => {
      const m = /^#\s*([A-Za-z ]+?)\s*:\s*(.*)$/.exec(r);
      if (!m) return;
      // Wat de app toont of de AI meegeeft (SCENARIO, AUTO) verliest een VIN;
      // de verwachtingen gaan nergens heen en blijven letterlijk.
      const sl = m[1].trim().toUpperCase(), w = m[2].trim(), schoon = w.replace(VIN_RE, '[VIN verwijderd]');
      if (sl === 'SCENARIO') k.scenario = schoon;
      else if (sl === 'AUTO') k.auto = schoon;
      else if (sl === 'BASIS') {
        const d = w.split('/').map(x => x.trim());
        const o = d[0].toLowerCase().replace(/^let op$/, 'let');
        k.basis = { oordeel: RANG[o] != null ? o : null, cat: d[1] || null, ruw: w };
      }
      else if (sl === 'SIGNAAL') k.signalen.push(w);
      else if (sl === 'AI MOET') k.moet = k.moet.concat(w.split('|').map(x => x.trim()).filter(Boolean));
      else if (sl === 'AI MAG NIET') k.magNiet = k.magNiet.concat(w.split('|').map(x => x.trim()).filter(Boolean));
    });
    return k;
  }

  /* De log lezen. kent(pid) = bestaat de PID in de app; def(pid) voor de
     eenheid. Geeft {formaat, hist, pids, onbekend, waarschuwingen, kop,
     sec, n}. Puur. */
  function lees(tekst, kent, def) {
    const alle = String(tekst || '').replace(/^﻿/, '').split(/\r?\n/);
    const kopRegels = alle.filter(r => /^\s*#/.test(r));
    const rs = alle.filter(r => r.trim() && !/^\s*#/.test(r));
    const uit = { formaat: null, hist: {}, pids: [], onbekend: [], waarschuwingen: [], kop: kop(kopRegels), sec: 0, n: 0 };
    if (!rs.length) { uit.waarschuwingen.push('het bestand bevat geen regels'); return uit; }
    const sep = scheiding(rs[0]);
    const koppen = velden(rs[0], sep);
    const lk = koppen.map(k => k.toLowerCase().replace(/"/g, ''));
    const tk = tijdKolom(koppen);
    if (!tk) { uit.waarschuwingen.push('geen tijdkolom gevonden (verwacht bv. "Device Time", "SECONDS" of "t_ms")'); return uit; }
    const iPid = lk.findIndex(k => /^(pid|name|naam|parameter|sensor)$/.test(k));
    const iVal = lk.findIndex(k => /^(value|waarde)$/.test(k));
    const iEenh = lk.findIndex(k => /^(units?|eenheid)$/.test(k));
    const omr = {};
    const voeg = (pid, t, v) => {
      if (uit.n >= MAX_MONSTERS) return;
      (uit.hist[pid] || (uit.hist[pid] = [])).push({ t, v }); uit.n++;
    };
    const omzetter = (pid, eenh, naam) => {
      const sl = pid + '|' + eenh;
      if (sl in omr) return omr[sl];
      const d = def ? def(pid) : null;
      const f = omrekening(eenh, d && d.unit);
      if (!f) uit.waarschuwingen.push(naam + ': eenheid "' + eenh.replace(/^\?/, '') + '" niet om te rekenen naar ' + ((d && d.unit) || '?') + ' — weggelaten');
      return (omr[sl] = f);
    };
    let t0 = null, tMax = -Infinity, overgeslagen = 0;
    const tVan = cel => { const t = tijd(cel, tk.soort); if (t == null) return null; if (t0 == null) t0 = t; return t - t0; };
    const onb = {};
    if (iPid >= 0 && iVal >= 0) {
      uit.formaat = 'lang';
      rs.slice(1).forEach(r => {
        const c = velden(r, sep);
        const t = tVan(c[tk.i]), v = getalUit(c[iVal], sep);
        if (t == null || v == null) { overgeslagen++; return; }
        const naam = c[iPid] || '';
        if (/vin/i.test(naam)) return;
        const k = kolom(naam, kent, iEenh >= 0 ? (c[iEenh] || '') : null);
        if (!k || (kent && !kent(k.pid))) { onb[naam] = 1; return; }
        const f = omzetter(k.pid, k.eenheid, naam);
        if (!f) return;
        voeg(k.pid, t, f(v)); tMax = Math.max(tMax, t);
      });
    } else {
      uit.formaat = 'breed';
      const kol = koppen.map((k, i) => {
        if (i === tk.i || /vin/i.test(k)) return null;
        const c = kolom(k, kent);
        if (!c || (kent && !kent(c.pid))) { if (!/time|tijd|^sec|^t_?ms/i.test(k)) onb[k.replace(/"/g, '')] = 1; return null; }
        return c;
      });
      const gezien = {};
      kol.forEach((c, i) => {
        if (!c) return;
        if (gezien[c.pid]) { uit.waarschuwingen.push(koppen[i] + ': tweede kolom voor ' + c.pid + ' — weggelaten'); kol[i] = null; return; }
        gezien[c.pid] = 1;
        c.f = omzetter(c.pid, c.eenheid, koppen[i]);
        if (!c.f) kol[i] = null;
      });
      rs.slice(1).forEach(r => {
        const c = velden(r, sep);
        const t = tVan(c[tk.i]);
        if (t == null) { overgeslagen++; return; }
        tMax = Math.max(tMax, t);
        kol.forEach((k, i) => { if (!k) return; const v = getalUit(c[i], sep); if (v != null) voeg(k.pid, t, k.f(v)); });
      });
    }
    if (uit.n >= MAX_MONSTERS) uit.waarschuwingen.push('meer dan ' + MAX_MONSTERS + ' monsters — de rest is niet gelezen');
    if (overgeslagen) uit.waarschuwingen.push(overgeslagen + ' regel(s) zonder leesbare tijd of waarde overgeslagen');
    Object.keys(uit.hist).forEach(p => uit.hist[p].sort((a, b) => a.t - b.t));
    uit.pids = Object.keys(uit.hist).sort();
    uit.onbekend = Object.keys(onb);
    uit.sec = tMax > 0 ? Math.round(tMax / 1000) : 0;
    return uit;
  }

  /* Het basisoordeel van de app. deps = {V: PLVerzamel, T: PLTotaal, def,
     letOp, toestandRegels, kwal, catVan, volgorde, kmh, gat}. */
  function oordeel(hist, deps) {
    const d = deps, st = {};
    ['stil', 'rij'].forEach(k => {
      const x = d.T.deelHist(hist, k, d.kmh, d.gat);
      const pids = Object.keys(x.hist).filter(p => x.hist[p].length);
      if (!pids.length) return;
      const sam = d.V.samenvatting(pids, { hist: x.hist, def: d.def, letOp: d.letOp, toestandRegels: d.toestandRegels, kwal: d.kwal });
      st[k] = { sam, hist: x.hist, zonderSnelheid: x.zonderSnelheid, sec: duur(x.hist, d.gat), rijSec: k === 'rij' ? d.V.rijSecUit(x.hist['010D']) : 0 };
    });
    const cats = d.T.categorieen({ stil: st.stil && st.stil.sam, rij: st.rij && st.rij.sam }, null, d.catVan, d.volgorde);
    const top = cats.find(c => c.open);
    const hoofd = top ? { oordeel: top.oordeel, cat: top.cat } : { oordeel: cats.length ? 'ok' : 'nodata', cat: null };
    const naam = { afwijkend: 'afwijkend', let: 'let op', meetfout: 'meetfout', twijfel: 'twijfel', ok: 'ok', nodata: 'geen data' };
    const regel = cats.filter(c => c.open).map(c => c.cat + ': ' + naam[c.oordeel]).join('; ') || naam[hoofd.oordeel];
    return { st, cats, hoofd, regel };
  }
  /* De gemeten tijd van een deel: de gaten van de langste reeks opgeteld,
     zonder de gaten groter dan `gat` — anders telt een stilstand aan begin
     en eind als de hele rit. */
  function duur(h, gat) {
    let r = [];
    Object.keys(h).forEach(p => { if (h[p].length > r.length) r = h[p]; });
    let ms = 0;
    for (let i = 1; i < r.length; i++) { const g = r[i].t - r[i - 1].t; if (g > 0 && g <= gat) ms += g; }
    return Math.round(ms / 1000);
  }

  /* Het voertuig van de log, uit de AUTO-regel ("Ford Focus 2.0 benzine
     2008"). Nooit dat van de app: een ingelezen log gaat niet over de auto
     die nu verbonden is. Puur. */
  function voertuig(auto) {
    let t = String(auto || '').replace(/,?\s*VIN\s*\[VIN verwijderd\]|\[VIN verwijderd\]/gi, '').trim();
    const v = {};
    const j = /\b(19[5-9]\d|20\d{2})\b/.exec(t);
    if (j) { v.year = j[1]; t = t.replace(j[0], ' '); }
    const b = /\b(benzine|diesel|lpg|hybride|elektrisch)\b/i.exec(t);
    if (b) { v.brandstof = b[1].toLowerCase(); t = t.replace(b[0], ' '); }
    const w = t.replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
    if (w.length) { v.merk = w[0]; if (w.length > 1) v.model = w.slice(1).join(' '); }
    return v;
  }

  /* Klopt het basisoordeel met de kop? null = de kop zegt niets. */
  function vergelijk(o, k) {
    const b = k && k.basis;
    if (!b || !b.oordeel) return null;
    const okOordeel = o.hoofd.oordeel === b.oordeel;
    const okCat = !b.cat || (o.cats.find(c => c.open && c.oordeel === b.oordeel && c.cat.toLowerCase() === b.cat.toLowerCase()) != null);
    return { klopt: okOordeel && okCat, verwacht: b.ruw, kreeg: o.regel };
  }

  /* Wat de AI krijgt. De verwachting uit de kop (BASIS, SIGNAAL, AI MOET,
     AI MAG NIET) gaat er nooit in; de auto wel, zonder VIN. */
  function prompt(imp, o, deps) {
    const d = deps || {};
    let samenhang = '';
    if (d.samenhang) {
      try { samenhang = d.samenhang(imp.hist, imp.kop.auto) || ''; }
      catch (e) { console.warn('PLLogImport: de samenhang is niet bepaald — de AI krijgt alleen de getallen', e); }
    }
    const blok = (sam, meta) => d.V.promptBlok(sam, meta);
    return 'Je bent expert automonteur. Analyseer deze ingelezen log in het Nederlands.\n\n' +
      'HERKOMST: de log komt van buiten de app (' + (imp.formaat === 'lang' ? 'een regel per monster' : 'een kolom per sensor') +
      ', ' + imp.sec + ' s). Eenheden zijn omgerekend naar die van de app. ' +
      (imp.onbekend.length ? 'Niet herkend en dus weggelaten: ' + imp.onbekend.slice(0, 20).join(', ') + '. ' : '') +
      'Sensoren die niet in de log staan zijn NIET GEMETEN: doe er geen uitspraak over.\n' +
      'Voertuig: ' + (imp.kop.auto || 'onbekend') + '\n' +
      'BASISOORDEEL VAN DE APP (vaste grenzen, nog geen diagnose): ' + o.regel +
      (samenhang ? '\n\n' + samenhang : '') +
      d.T.promptBlok(o.st, o.cats, blok) +
      '\n\nGeef in deze volgorde, zonder sterretjes of emoji: BEVINDING (koppel elk punt aan een gemeten waarde; vergelijk stilstand en rijden), WAARSCHIJNLIJKE OORZAAK (tabel Diagnose | Kans | Vertrouwen), CONTROLE (concrete meet- of controlestappen), WAT DEZE LOG NIET KAN ZEGGEN (ontbrekende sensoren of toestanden).' +
      (d.disclaimer ? '\nSluit af met deze exacte zin op een nieuwe regel: ' + d.disclaimer : '');
  }

  /* Eén SIGNAAL uit de kop toetsen tegen wat de AI ziet. Puur.
     → {ok, uitleg}. */
  function signaal(s, o, tekst) {
    const t = String(s || '').trim();
    const q = /^(!)?"(.*)"$/.exec(t);
    if (q) {
      const zit = tekst.toLowerCase().indexOf(q[2].toLowerCase()) >= 0;
      return { ok: q[1] ? !zit : zit, uitleg: (q[1] ? 'mag niet in de prompt: ' : 'moet in de prompt: ') + q[2] };
    }
    const m = /^(?:(stil|rij):)?\s*(01[0-9A-F]{2})\s+(min|max|gem|laatste|n)\s*(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/i.exec(t);
    if (!m) return { ok: false, uitleg: 'onleesbaar signaal: ' + t };
    const delen = m[1] ? [m[1].toLowerCase()] : ['stil', 'rij'];
    const pid = m[2].toUpperCase(), veld = m[3].toLowerCase(), op = m[4], g = +m[5];
    const rijen = delen.map(k => o.st[k] && o.st[k].sam.rijen.find(r => r.pid === pid)).filter(Boolean);
    if (!rijen.length) return { ok: false, uitleg: pid + ' staat niet in ' + delen.join('/') };
    const w = veld === 'min' ? Math.min.apply(null, rijen.map(r => r.min)) : veld === 'max' ? Math.max.apply(null, rijen.map(r => r.max))
      : veld === 'n' ? rijen.reduce((a, r) => a + r.n, 0) : rijen[rijen.length - 1][veld];
    const ok = getal(w) && (op === '<' ? w < g : op === '>' ? w > g : op === '<=' ? w <= g : op === '>=' ? w >= g : w === g);
    const zichtbaar = rijen.every(r => tekst.indexOf(r.naam + ':') >= 0);
    return { ok: ok && zichtbaar, uitleg: t + ' (gemeten ' + (getal(w) ? Math.round(w * 100) / 100 : w) + (zichtbaar ? '' : '; staat niet in de prompt') + ')' };
  }

  return { RANG, NAMEN, eenheid, omrekening, kolom, scheiding, velden, tijd, kop, lees, oordeel, vergelijk, prompt, signaal, voertuig };
})();
// ── PLLogImport kern eind ──

/* ── De knop in het adminmenu ───────────────────────────────────── */
(function () {
  'use strict';
  const L = window.PLLogImport;

  function appDeps() {
    return {
      V: PLVerzamel, T: PLTotaal, def: getPidDef, letOp: window.PID_LET_OP || {},
      toestandRegels: window.PID_TOESTAND || {}, kwal: assessPidQuality,
      catVan: pid => (getPidDef(pid) || {}).cat, volgorde: window.CHK_CAT_ORDER,
      kmh: MEET_RIJ_KMH, gat: MEET_RIJ_GAT_MS, disclaimer: RAPPORT_DISCLAIMER,
      samenhang: (hist, auto) => {
        const b = /diesel/i.test(auto || '') ? 'diesel' : (/benzine|petrol|gasoline/i.test(auto || '') ? 'benzine' : undefined);
        return PLSamenhang.promptBlok(PLSamenhang.lees(hist, window.PLOnderzoek, { brandstof: b, vorm: PLSamenhang.vormLive() }));
      }
    };
  }

  function open() {
    if (!magOntwikkelen()) { showToast('Alleen voor beheer en ontwikkelaars'); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.txt,.log,text/csv,text/plain';
    inp.style.display = 'none';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) { showToast('Log te groot (meer dan 20 MB)'); return; }
      const r = new FileReader();
      r.onload = () => verwerk(String(r.result || ''), f.name).catch(e => {
        console.error('PLLogImport: verwerken mislukt', e);
        log('Log inlezen mislukt: ' + ((e && e.message) || e), 'err');
        showToast('Log inlezen mislukt — zie het logboek');
      });
      r.onerror = () => { log('Log niet te lezen: ' + f.name, 'err'); showToast('Bestand niet te lezen'); };
      r.readAsText(f);
    };
    document.body.appendChild(inp);
    inp.click();
  }

  async function verwerk(tekst, naam) {
    const imp = L.lees(tekst, pid => !!getPidDef(pid), getPidDef);
    imp.waarschuwingen.forEach(w => log('Log ' + naam + ': ' + w, 'warn'));
    if (!imp.pids.length) {
      showToast('Geen herkende sensoren in ' + naam);
      log('Log ' + naam + ': geen herkende sensoren' + (imp.onbekend.length ? ' (kolommen: ' + imp.onbekend.slice(0, 12).join(', ') + ')' : ''), 'warn');
      return;
    }
    const deps = appDeps();
    const o = L.oordeel(imp.hist, deps);
    const vg = L.vergelijk(o, imp.kop);
    log('Log ' + naam + ' ingelezen (' + imp.formaat + ', ' + imp.pids.length + ' sensoren, ' + imp.sec + ' s) — basisoordeel: ' + o.regel, 'ok');
    if (vg) log('Scenario ' + (imp.kop.scenario || naam) + ': basisoordeel ' + (vg.klopt ? 'klopt' : 'WIJKT AF — verwacht ' + vg.verwacht + ', kreeg ' + vg.kreeg), vg.klopt ? 'ok' : 'warn');
    window._plLogImport = { naam, imp, oordeel: o, vergelijk: vg, ts: Date.now() };
    const uit = await PLVerzamel.meet({
      bron: { naam: 'de ingelezen log (' + naam + ')', hist: imp.hist, sec: imp.sec, rijSec: PLVerzamel.rijSecUit(imp.hist['010D']) },
      watVoor: 'de analyse van de ingelezen log', ritBron: false, profiel: false
    });
    if (!uit || !uit.ai) return;
    // De log gaat niet over de verbonden auto. `extern` gaat mee naar
    // apiFetch (geen voertuig, dossier, live toestand of eerdere rapporten
    // van die auto), naar het rapport (PLRapport.uitApp) en naar het archief
    // (niet in het dossier van het actieve voertuig).
    const extern = { naam, voertuig: L.voertuig(imp.kop.auto) };
    if (window._plVerzameld) window._plVerzameld.extern = extern;
    activateAIPane();
    await callAI(L.prompt(imp, o, deps), document.getElementById('aiContent'),
      Object.assign(PLVerzamel.aanlevering(uit, 'Ingelezen log: wat laat deze reeks zien over de staat van het voertuig?', null), { extern }));
  }

  L.open = open;
  L._verwerk = verwerk;
})();
