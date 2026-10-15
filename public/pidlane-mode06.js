/* ═══════════════════════════════════════════════════════════════════
   pidlane-mode06.js — PLM06: on-board monitortests (SAE J1979 mode 06)
   ───────────────────────────────────────────────────────────────────
   WAT DIT LEEST DAT NIETS ANDERS LEEST

   Mode 03 geeft je foutcodes: dingen die al mis zijn. Mode 06 geeft je
   de meetwaarden waarop de ECU die beslissing baseert — per monitor de
   gemeten waarde plus de min/max die de fabrikant hanteert.

   Daar zit het verschil tussen reageren en voorspellen. Een katalysator
   die op 0,72 zit waar de grens 0,75 is, geeft geen enkele foutcode. Hij
   is goed. Maar hij is bijna niet goed meer, en dát is wat een klant wil
   horen vóórdat de MIL aangaat, niet erna.

   WAAROM HET OORDEEL BETROUWBAAR IS EN DE EENHEID SOMS NIET

   Elk testrecord bevat waarde, min en max in dezelfde ruwe eenheid. Voor
   geslaagd/gezakt hoef je die eenheid dus helemaal niet te kennen — een
   vergelijking tussen drie getallen op dezelfde schaal klopt ongeacht de
   schaal. Het enige dat telt is of ze signed of unsigned zijn.

   De UAS-tabel (Unit And Scaling) hieronder is daarom bewust kort: alleen
   waarden waarvan ik het teken en de factor zeker weet. Bij een onbekende
   UAS-ID haalt bouwRecord() het teken uit de grenzen zelf: min ≤ max moet
   kloppen. Liggen min en max in verschillende helften (0x8000…0x05DC), dan
   kan maar één lezing; liggen ze in dezelfde helft, dan geven beide
   lezingen hetzelfde oordeel (15-10-2026, #515). Alleen een record dat in
   geen lezing klopt krijgt 'onzeker'. De schaalfactor blijft onbekend: de
   tabel toont dan ruwe getallen. Nooit een gok die eruit ziet als een
   meting — dat is precies de fout die pidlane-uitgebreid.js beschrijft bij
   de mode 21-PIDs.

   Onbekende UAS-IDs worden verzameld in PLM06.onbekendeUas(). Na een paar
   echte auto's kun je de tabel aanvullen, in dezelfde geest als het
   PLPidLen-lengtesysteem.

   PROTOCOL (CAN, ISO 15765-4)
     verzoek : 06 <MID>       MID 00/20/40/60/80/A0 = bitmap ondersteunde MIDs
     antwoord: 46 <MID> <TID> <UAS> <val_hi><val_lo> <min_hi><min_lo> <max_hi><max_lo>

   Laadvolgorde: ná pidlane-bt.js (sendCmd) en pidlane-data.js (PLBus/withBus).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CFG = {
    cmdTimeoutMs: 4000,
    pauzeMs: 60,        // adempauze — op een trage dongle voorkomt dit STOPPED
    maxMids: 64,
    busWachtMs: 8000
  };

  // ── MID-namen ─────────────────────────────────────────────────────────
  // De indeling van SAE J1979 (OBDMID-tabel), niet per blok van zestien:
  // tot 15-10-2026 stond hier 0x31–0x3F als "EGR", en een Mazda CX-5 toonde
  // daardoor "EGR-systeem bank 5" voor wat de kleptiming (VVT) is (#515).
  // Een onbekende MID krijgt 'Monitor 0xNN' — geen verzonnen naam.
  //
  // `h` is de verdenking in pidlane-onderzoek.js waar deze test iets over
  // zegt; `sluitUit` = een ruim geslaagde test mag die verdenking ook
  // wegstrepen. Dit is de enige plek waar die koppeling staat.
  //   soort 'sonde': 4 per bank (B1S1…B4S4) · 'bank': bank 1…4 · 'nr': 1…n

  const FAMILIE = [
    { van: 0x01, tot: 0x10, naam: 'Lambdasonde',                soort: 'sonde', h: 'lambda',      kort: 'lambdasonde', sluitUit: true },
    { van: 0x21, tot: 0x24, naam: 'Katalysator',                soort: 'bank',  h: 'kat',         kort: 'katalysator', sluitUit: true },
    { van: 0x31, tot: 0x34, naam: 'EGR-systeem',                soort: 'bank',  h: 'egr',         kort: 'EGR',         sluitUit: true },
    { van: 0x35, tot: 0x38, naam: 'Variabele kleptiming (VVT)', soort: 'bank',  h: 'distributie', kort: 'kleptiming' },
    { van: 0x39, tot: 0x3D, naam: 'EVAP-systeem',               soort: 'los' },
    { van: 0x41, tot: 0x50, naam: 'Lambdasondeverwarming',      soort: 'sonde', h: 'lambda',      kort: 'lambdasonde', sluitUit: true },
    { van: 0x61, tot: 0x64, naam: 'Verwarmde katalysator',      soort: 'bank',  h: 'kat',         kort: 'katalysator', sluitUit: true },
    { van: 0x71, tot: 0x74, naam: 'Secundaire luchtinjectie',   soort: 'nr' },
    { van: 0x81, tot: 0x84, naam: 'Brandstofsysteem',           soort: 'bank' },
    { van: 0x85, tot: 0x88, naam: 'Laaddrukregeling',           soort: 'bank',  h: 'turbo',       kort: 'laaddruk' },
    { van: 0x90, tot: 0x91, naam: 'NOx-opslagkatalysator',      soort: 'bank' },
    { van: 0x98, tot: 0x99, naam: 'NOx-katalysator (SCR)',      soort: 'bank' },
    { van: 0xA1, tot: 0xAD, naam: 'Ontstekingsmissers',         soort: 'los',   h: 'misfire',     kort: 'ontstekingsmissers', sluitUit: true },
    { van: 0xB0, tot: 0xB1, naam: 'Roetfilter',                 soort: 'bank',  h: 'dpf',         kort: 'roetfilter', sluitUit: true }
  ];

  const SPECIFIEK = {
    0x39: 'EVAP-systeem — groot lek of tankdop open',
    0x3A: 'EVAP-systeem — lek 0,090″',
    0x3B: 'EVAP-systeem — lek 0,040″',
    0x3C: 'EVAP-systeem — lek 0,020″',
    0x3D: 'EVAP-systeem — spoelstroom',
    0xA1: 'Ontstekingsmissers — algemeen'
  };
  for (let c = 1; c <= 12; c++) SPECIFIEK[0xA1 + c] = 'Ontstekingsmissers — cilinder ' + c;

  function familieVan(mid) {
    for (const f of FAMILIE) if (mid >= f.van && mid <= f.tot) return f;
    return null;
  }

  // ── UAS: alleen wat zeker is ──────────────────────────────────────────
  const UAS = {
    0x01: { f: 1,     e: '',          signed: false },
    0x02: { f: 0.1,   e: '',          signed: false },
    0x03: { f: 0.01,  e: '',          signed: false },
    0x04: { f: 0.001, e: '',          signed: false },
    0x24: { f: 1,     e: 'tellingen', signed: false },
    0x81: { f: 1,     e: '',          signed: true  },
    0x82: { f: 0.1,   e: '',          signed: true  },
    0x83: { f: 0.01,  e: '',          signed: true  },
    0x84: { f: 0.001, e: '',          signed: true  }
  };

  const _onbekendeUas = {};

  // ── Hulp ──────────────────────────────────────────────────────────────

  const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
  const u16 = (hi, lo) => ((hi & 0xFF) << 8) | (lo & 0xFF);
  const teken = v => v > 0x7FFF ? v - 0x10000 : v;
  const pauze = ms => new Promise(r => setTimeout(r, ms));

  function diag(msg, lvl) {
    try { if (typeof btDiag === 'function') btDiag(msg, lvl || 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }

  function midNaam(mid) {
    if (SPECIFIEK[mid]) return SPECIFIEK[mid];
    const f = familieVan(mid);
    if (!f) return `Monitor 0x${hex2(mid)}`;
    const i = mid - f.van;
    if (f.soort === 'sonde') return `${f.naam} bank ${Math.floor(i / 4) + 1} sonde ${i % 4 + 1}`;
    if (f.soort === 'bank') return `${f.naam} bank ${i + 1}`;
    if (f.soort === 'nr') return `${f.naam} ${i + 1}`;
    return `${f.naam} (0x${hex2(mid)})`;
  }

  // ── Responsparser ─────────────────────────────────────────────────────
  // ELM327-responses zijn rommelig: echo, meerdere regels, ISO-TP
  // regelnummers ("0:", "1:"), statusregels. Alles eruit, dan knippen op
  // het antwoord-SID.

  function naarBytes(ruw, sid) {
    if (!ruw) return [];
    const regels = String(ruw).replace(/\r/g, '\n').split('\n')
      .map(r => r.trim())
      .filter(r => r && r !== '>' &&
        !/^(SEARCHING|BUS INIT|STOPPED|NO DATA|CAN ERROR|UNABLE TO CONNECT|\?)/i.test(r));

    const bytes = [];
    for (let regel of regels) {
      regel = regel.replace(/^[0-9A-F]\s*:\s*/i, '');       // ISO-TP regelnummer
      const m = regel.match(/[0-9A-Fa-f]{2}/g);
      if (m) for (const h of m) bytes.push(parseInt(h, 16));
    }

    const start = bytes.indexOf(sid);
    return start === -1 ? [] : bytes.slice(start + 1);
  }

  function bouwRecord(mid, tid, uasId, waarde, min, max) {
    const def = UAS[uasId] || null;

    // Oordeel op ruwe getallen — schaalfactor niet nodig, teken wel
    const oordeelMet = s => {
      const w = s ? teken(waarde) : waarde;
      const lo = s ? teken(min) : min;
      const hi = s ? teken(max) : max;
      return w >= lo && w <= hi;
    };

    // Welke lezing? Bekende UAS: die van de tabel. Onbekend: een grens
    // moet min ≤ max zijn, en kan er maar één lezing dat, dan staat het
    // teken vast. De Mazda gaf 14 met grenzen 0x8000…0x05DC: unsigned is
    // dat 32768 – 1500 (onmogelijk), signed −32768 – 1500 (#515).
    let geslaagd, zeker, signed = null;
    if (def) {
      signed = def.signed;
      geslaagd = oordeelMet(signed);
      zeker = true;
    } else {
      const kan = s => (s ? teken(min) : min) <= (s ? teken(max) : max);
      const ku = kan(false), ks = kan(true);
      if (ku !== ks) signed = ks;
      const a = oordeelMet(false), b = oordeelMet(true);
      // Liggen min en max in dezelfde helft, dan ordenen beide lezingen ze
      // gelijk en geven ze hetzelfde oordeel; liggen ze in verschillende
      // helften, dan kan er maar één. Alleen een record dat in géén lezing
      // klopt (min > max) blijft zonder oordeel.
      if (signed !== null) { geslaagd = signed ? b : a; zeker = true; }
      else { geslaagd = a; zeker = ku && a === b; }
      if (!_onbekendeUas[uasId]) {
        _onbekendeUas[uasId] = { mid, tid, voorbeeld: [waarde, min, max], eensgezind: a === b, teken: signed === null ? 'onbekend' : (signed ? 'signed' : 'unsigned') };
      }
    }

    // Marge: 0 = precies op de grens, 0.5 = midden in het venster — in de
    // lezing die het oordeel gaf.
    const lees = v => signed ? teken(v) : v;
    const span = lees(max) - lees(min);
    const marge = span > 0
      ? Math.max(0, Math.min(lees(waarde) - lees(min), lees(max) - lees(waarde)) / span)
      : null;

    return {
      mid, midNaam: midNaam(mid), tid, tidHex: '0x' + hex2(tid),
      uasId, uasHex: '0x' + hex2(uasId),
      ruw: { waarde, min, max },
      // Wat de tabel toont als de schaal onbekend is: de ruwe getallen in
      // de lezing waarvan het teken vaststaat, anders zoals ontvangen.
      getoond: { waarde: lees(waarde), min: lees(min), max: lees(max), teken: signed === null ? null : (signed ? 'signed' : 'unsigned') },
      geschaald: def ? {
        waarde: (def.signed ? teken(waarde) : waarde) * def.f,
        min: (def.signed ? teken(min) : min) * def.f,
        max: (def.signed ? teken(max) : max) * def.f,
        eenheid: def.e
      } : null,
      geslaagd, oordeelZeker: zeker, marge,
      krap: marge !== null && marge < 0.15 && geslaagd
    };
  }

  function parseRecords(mid, bytes) {
    const uit = [];
    let i = 0;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== mid) { i++; continue; }   // hersynchroniseren op de MID
      uit.push(bouwRecord(
        mid, bytes[i + 1], bytes[i + 2],
        u16(bytes[i + 3], bytes[i + 4]),
        u16(bytes[i + 5], bytes[i + 6]),
        u16(bytes[i + 7], bytes[i + 8])
      ));
      i += 9;
    }
    return uit;
  }

  // ── Scan ──────────────────────────────────────────────────────────────

  async function ondersteundeMids() {
    const basis = [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0];
    const gevonden = [];

    for (const b of basis) {
      let ruw = '';
      try { ruw = await sendCmd('06' + hex2(b), CFG.cmdTimeoutMs); } catch (e) { break; }
      const by = naarBytes(ruw, 0x46);
      if (by.length < 5 || by[0] !== b) break;

      const bitmap = (by[1] << 24) | (by[2] << 16) | (by[3] << 8) | by[4];
      for (let bit = 0; bit < 32; bit++) {
        if (bitmap & (1 << (31 - bit))) {
          const mid = b + bit + 1;
          if (mid % 0x20 !== 0) gevonden.push(mid);   // veelvouden van 0x20 zijn zelf bitmaps
        }
      }
      if (!(bitmap & 1)) break;                       // laatste bit = volgende bitmap bestaat
      await pauze(CFG.pauzeMs);
    }
    return gevonden.slice(0, CFG.maxMids);
  }

  // Gezakt eerst, dan krap, dan op marge — het probleem bovenaan. Eén
  // volgorde voor de tabel en de tekst, zodat die twee hetzelfde zeggen.
  function volgorde(res) {
    return ((res && res.tests) || []).slice().sort((a, b) => {
      const p = t => t.geslaagd ? (t.krap ? 1 : 2) : 0;
      return p(a) - p(b) || (a.marge ?? 1) - (b.marge ?? 1);
    });
  }
  const klasse = t => !t.oordeelZeker ? 'onzeker' : !t.geslaagd ? 'gezakt' : t.krap ? 'krap' : 'ok';
  const LABEL = { onzeker: 'onzeker', gezakt: 'GEZAKT', krap: 'krap', ok: 'ok' };

  // ── Los paneel (Admin-menu): scan + tabel, zonder het onderzoek ─────
  let _paneel = { open: false, bezig: false, res: null, fout: '' };
  function paneel() {
    if (!_paneel.open) return;
    let v = document.getElementById('plM06Paneel');
    if (!v) {
      // Een venster over alles heen (--z-modal-hoog: ook boven Check mijn
      // auto), met de veilige rand onderaan — los onderin op z-index 9000
      // viel hij onder de topbalk en de onderbalk (15-10-2026).
      v = document.createElement('div');
      v.id = 'plM06Paneel';
      v.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal-hoog,9800);background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;' +
        'padding:calc(12px + var(--pl-sat,0px)) 12px calc(12px + var(--pl-sab,0px))';
      v.innerHTML = '<div id="plM06Doos" style="width:100%;max-width:640px;max-height:100%;overflow:auto;background:var(--sur);color:var(--tx);' +
        'border:1px solid var(--bd);border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 13px/1.45 var(--f)"></div>';
      v.addEventListener('click', e => {
        if (e.target === v) return PLM06.sluit();
        const a = e.target && e.target.getAttribute && e.target.getAttribute('data-m06');
        if (a === 'scan') PLM06.open();
        else if (a === 'sluit') PLM06.sluit();
      });
      document.body.appendChild(v);
    }
    const doos = document.getElementById('plM06Doos');
    const knop = 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f)';
    const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let h = '<div style="font-weight:800;font-size:15px;margin-bottom:6px">🔬 Mode 06 — monitortests</div>';
    if (_paneel.bezig) h += '<div style="color:var(--tx2)">Bezig met uitlezen…</div>';
    else if (_paneel.fout) h += '<div style="color:var(--or)">' + esc(_paneel.fout) + '</div>';
    else if (_paneel.res) h += '<div style="overflow-x:auto">' + PLM06.render(_paneel.res) + '</div>';
    h += '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button type="button" data-m06="scan" style="' + knop + '"' + (_paneel.bezig ? ' disabled' : '') + '>Opnieuw lezen</button>' +
      '<button type="button" data-m06="sluit" style="' + knop + '">Sluiten</button></div>';
    doos.innerHTML = h;
  }

  const PLM06 = {

    /**
     * Volledige mode 06 scan. Claimt het busslot via withBus, net als
     * pidlane-verify.js, zodat de achtergrondpoll er niet doorheen praat.
     */
    async scan() {
      if (typeof sendCmd !== 'function') throw new Error('PLM06: sendCmd niet beschikbaar');
      if (typeof connected !== 'undefined' && !connected) throw new Error('PLM06: geen verbinding');

      const t0 = Date.now();
      const res = { mids: [], tests: [], onbekendeUas: null, duurMs: 0 };

      const werk = async () => {
        res.mids = await ondersteundeMids();
        diag(`Mode 06: ${res.mids.length} monitors gemeld`, 'info');

        for (const mid of res.mids) {
          try {
            const ruw = await sendCmd('06' + hex2(mid), CFG.cmdTimeoutMs);
            const by = naarBytes(ruw, 0x46);
            if (by.length) res.tests.push(...parseRecords(mid, by));
          } catch (e) { /* één MID mag falen zonder de scan te slopen */ }
          await pauze(CFG.pauzeMs);
        }
      };

      if (typeof withBus === 'function') await withBus('mode06', werk, CFG.busWachtMs);
      else await werk();

      res.duurMs = Date.now() - t0;
      res.onbekendeUas = Object.keys(_onbekendeUas).length ? _onbekendeUas : null;
      res.samenvatting = PLM06.samenvat(res);
      // Tijdens een rit gaan de ontstekingsmissers mee naar de conditiescore
      // (#475). Passief: dit is de scan die de klant zelf startte.
      try { if (window.PLGarage && typeof PLGarage.mode06 === 'function') PLGarage.mode06(res); }
      catch (e) { console.warn('PLM06: misfires naar PLGarage', e); }
      diag(`Mode 06 klaar: ${res.tests.length} tests in ${(res.duurMs / 1000).toFixed(1)}s — ${res.samenvatting.tekst}`,
           res.samenvatting.niveau === 'kritiek' ? 'warn' : 'ok');
      return res;
    },

    samenvat(res) {
      const tests = (res && res.tests) || [];
      const gezakt = tests.filter(t => !t.geslaagd && t.oordeelZeker);
      const krap = tests.filter(t => t.krap);
      const onzeker = tests.filter(t => !t.oordeelZeker);

      let niveau = 'ok';
      let tekst = `${tests.length} monitortest${tests.length === 1 ? '' : 'en'} gelezen, alles binnen de grenzen`;

      if (!tests.length) { niveau = 'onbekend'; tekst = 'Geen mode 06 gegevens op dit voertuig'; }
      else if (gezakt.length) { niveau = 'kritiek'; tekst = `${gezakt.length} test${gezakt.length === 1 ? '' : 'en'} buiten de fabrieksgrenzen`; }
      else if (krap.length) { niveau = 'let-op'; tekst = `${krap.length} test${krap.length === 1 ? ' zit' : 'en zitten'} krap binnen de grens`; }

      return {
        niveau, tekst,
        aantalTests: tests.length,
        aantalGezakt: gezakt.length,
        aantalKrap: krap.length,
        aantalOnzeker: onzeker.length
      };
    },

    render(res) {
      if (!res) return '';
      const s = res.samenvatting || PLM06.samenvat(res);
      const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const rijen = volgorde(res);

      let h = `<div class="pl-m06 pl-m06-${s.niveau}">`;
      h += `<div class="pl-m06-kop">🔬 Monitortests (mode 06) — ${esc(s.tekst)}</div>`;

      if (rijen.length) {
        // Drie kolommen, niet vijf: op een telefoon (360–412 px, grote
        // systeemletter) vielen Grenzen en Oordeel buiten beeld (15-10-2026).
        // De test-ID staat klein onder de monitor, de grens onder de waarde.
        h += '<table class="pl-m06-tbl"><thead><tr>' +
             '<th>Monitor</th><th>Waarde · grens</th><th>Oordeel</th>' +
             '</tr></thead><tbody>';
        for (const t of rijen) {
          const g = t.geschaald;
          const rond = v => Math.round(v * 1000) / 1000;
          const w = g ? `${rond(g.waarde)}${g.eenheid ? ' ' + g.eenheid : ''}`
                      : `${t.getoond.waarde} <span class="pl-m06-ruw">ruw</span>`;
          const gr = g ? `${rond(g.min)} – ${rond(g.max)}` : `${t.getoond.min} – ${t.getoond.max}`;

          const kl = klasse(t);
          const lbl = LABEL[kl];

          h += `<tr class="pl-m06-${kl}"><td>${esc(t.midNaam)}<div class="pl-m06-tid">test ${esc(t.tidHex)}</div></td>` +
               `<td>${w}<div class="pl-m06-gr">${gr}</div></td>` +
               `<td class="pl-m06-oordeel">${lbl}</td></tr>`;
        }
        h += '</tbody></table>';

        if (s.aantalOnzeker) {
          h += `<div class="pl-m06-note">${s.aantalOnzeker} test(s) met een onbekende schaal-ID — ` +
               `daar kloppen de grenzen in geen enkele lezing (min boven max), dus geen oordeel.</div>`;
        }
      }
      return h + '</div>';
    },

    // Alleen wat diagnostisch iets betekent. Zestig regels "ok" in de prompt
    // kost tokens (zie pidlane-credits.js) zonder het antwoord te verbeteren.
    /** Alle tests als platte tekst, in dezelfde volgorde als render() —
     *  voor het bewaarde onderzoeksrapport. */
    alsTekst(res) {
      const tests = volgorde(res);
      if (!tests.length) return ['Geen mode 06-gegevens op dit voertuig.'];
      const rond = v => Math.round(v * 1000) / 1000;
      const r = [PLM06.samenvat(res).tekst + '.'];
      for (const t of tests) {
        const g = t.geschaald;
        const w = g ? `${rond(g.waarde)}${g.eenheid ? ' ' + g.eenheid : ''}` : `${t.getoond.waarde} ruw`;
        const gr = g ? `${rond(g.min)}–${rond(g.max)}` : `${t.getoond.min}–${t.getoond.max}`;
        r.push(`[${LABEL[klasse(t)]}] ${t.midNaam} (test ${t.tidHex}): ${w}, grens ${gr}`);
      }
      return r;
    },

    /** Admin: scan direct en toon de tabel in een eigen paneel. */
    async open() {
      _paneel.open = true;
      if (_paneel.bezig) return paneel();
      _paneel.bezig = true; _paneel.fout = ''; paneel();
      try {
        _paneel.res = await PLM06.scan();
        PLM06.bewaarInSessie(_paneel.res);
      }
      catch (e) { console.warn('PLM06: scan vanuit het paneel faalde', e); _paneel.res = null; _paneel.fout = 'Niet gelezen: ' + (e.message || e); }
      _paneel.bezig = false; paneel();
    },
    /** In Rapporten, zoals een foutcode-uitlezing: anders is de tabel weg
     *  zodra het venster dicht gaat. */
    bewaarInSessie(res) {
      if (!res) return false;
      try {
        if (typeof registerSessionReport !== 'function') return false;
        registerSessionReport({ type: 'm06', title: 'Monitortests (mode 06)',
          text: ['PidLane — Monitortests (mode 06)', 'Datum: ' + new Date().toLocaleString('nl'), ''].concat(PLM06.alsTekst(res)).join('\n') });
        return true;
      } catch (e) { console.warn('PLM06: niet in het sessiearchief gezet', e); return false; }
    },

    /** Een uitlezing tonen zonder te scannen (onderzoek, browserproef). */
    toon(res) {
      _paneel.open = true; _paneel.bezig = false; _paneel.fout = ''; _paneel.res = res; paneel();
    },
    sluit() {
      _paneel.open = false;
      const v = document.getElementById('plM06Paneel');
      if (v) v.remove();
    },

    naarPromptRegels(res) {
      if (!res || !res.tests || !res.tests.length) return 'Mode 06: geen gegevens.';
      const r = ['Mode 06 monitortests:'];
      const rond = v => Math.round(v * 1000) / 1000;

      for (const t of res.tests) {
        if (!t.oordeelZeker || (t.geslaagd && !t.krap)) continue;
        const g = t.geschaald;
        r.push(`- ${t.midNaam} (test ${t.tidHex}): ` +
          (g ? `${rond(g.waarde)}${g.eenheid}` : `${t.getoond.waarde} ruw`) +
          `, grens ${g ? `${rond(g.min)}–${rond(g.max)}` : `${t.getoond.min}–${t.getoond.max}`}` +
          ` → ${t.geslaagd ? 'krap binnen grens' : 'BUITEN grens'}`);
      }
      if (r.length === 1) r.push('- alle tests ruim binnen de fabrieksgrenzen');
      return r.join('\n');
    },

    onbekendeUas() { return _onbekendeUas; },
    FAMILIE, familieVan,
    _intern: { naarBytes, parseRecords, bouwRecord, midNaam }
  };

  window.PLM06 = PLM06;
})();
