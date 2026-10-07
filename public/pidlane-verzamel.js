// ══════════════════════════════════════════════════════════════════
// pidlane-verzamel.js — PLVerzamel: het verzamelscherm vóór een AI-rapport (#443)
// (07-10-2026)
// ══════════════════════════════════════════════════════════════════
// Eén scherm in plaats van drie vragen. Wie op AI-monteur of het AI-rapport
// tikte, kreeg tot nu toe achter elkaar "📡 Sensoren registreren" (een lijst
// van wat nog ontbrak), "Gebruik de meting van zojuist of nog even meten?"
// (een vraag over data die niemand had gezien) en dan de AI. Hier ziet de
// klant wat er binnenkomt, per sensor met waarde en verloop, en daarna wat er
// opviel. Pas dán de vraag of de AI het moet onderzoeken.
//
// DE POORT IS DEZELFDE. Wanneer er genoeg gemeten is, beslist niet dit
// bestand maar plMeetTekort() en plKernStatus() in pidlane-fuel.js — de
// drie-fasenpoort van §16. Dit scherm is er de zichtbare vorm van: dezelfde
// eisen, dezelfde `_meetBeperkt` in de prompt als je eerder stopt.
//
// HET OORDEEL PER SENSOR komt uit tabellen die de app al heeft (geen eigen
// grenzen, zie CLAUDE.md "Verzin geen tabellen"):
//   meetfout   assessPidQuality() zegt `onzin` — fysiek onmogelijk
//   afwijkend  over de alarmgrens van de PID-definitie (dH/dL)
//   let op     over de waarschuwingsgrens (wH/wL) of buiten PID_LET_OP
//   twijfel    assessPidQuality() zegt `twijfel` — vastzittend, te weinig
// en dat over het hele meetvenster (min en max), niet over de laatste waarde.
// "Opvallend" is daarmee een vlag op vaste grenzen, geen diagnose: 13,0 V is
// met draaiende motor verdacht en met de motor uit gewoon. Dat weegt de AI,
// en het scherm zegt dat erbij.
//
// WAT DE AI KRIJGT. promptBlok() zet precies deze samenvatting in de prompt:
// per sensor min–max, gemiddelde en aantal metingen, de opvallende eerst.
// Tot nu toe ging er bij het AI-rapport en de AI-monteur alleen de laatste
// waarde per sensor mee, na een poort die wel een minuut historie eiste.
//
// Tests: test-verzamel.js (samenvatting, fase, promptBlok), bproef-verzamel.js
// (het scherm in de echte app), blok 5.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const TIK_MS = 500;
  // Ook met genoeg historie loopt het scherm even: de klant ziet de waarden
  // binnenkomen en het rapport krijgt de toestand van nú, niet die van een
  // kwartier geleden.
  const MIN_MS = 10000;
  const SPARK_N = 40;
  const RANG = { afwijkend: 0, let: 1, meetfout: 2, twijfel: 3, ok: 4, nodata: 5 };

  const getal = v => typeof v === 'number' && isFinite(v);
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function fmt(v) {
    if (!getal(v)) return '–';
    if (typeof fv === 'function') return fv(v);
    const a = Math.abs(v);
    return String(a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
  }

  /* Eén sensor over het meetvenster. Puur: alles wat hij weet zit in de
     argumenten. `kwal(pid, waarde)` is assessPidQuality in de app. */
  function beoordeel(pid, reeks, def, letOp, kwal) {
    const d = def || {};
    const vals = (reeks || []).map(h => (h && typeof h === 'object') ? h.v : h).filter(getal);
    const r = { pid, naam: d.name || pid, eenheid: d.unit || '', n: vals.length,
                min: null, max: null, gem: null, laatste: null, oordeel: 'nodata', reden: '', buiten: 0,
                reeks: vals.slice(-SPARK_N) };
    if (!vals.length) { r.reden = 'nog geen meting'; return r; }
    r.min = Math.min.apply(null, vals); r.max = Math.max.apply(null, vals);
    r.gem = vals.reduce((a, b) => a + b, 0) / vals.length;
    r.laatste = vals[vals.length - 1];
    const tel = f => vals.filter(f).length;
    const zet = (oordeel, reden, buiten) => { r.oordeel = oordeel; r.reden = reden; r.buiten = buiten || 0; return r; };

    // 1. Fysiek onmogelijk: geen afwijking maar een meetfout. Gaat vóór alles,
    //    anders leest een parse- of schaalfout als "koelwater 300 °C".
    if (kwal) {
      for (const v of [r.laatste, r.min, r.max]) {
        let q = null;
        try { q = kwal(pid, v); } catch (e) { console.warn('PLVerzamel: kwaliteitsoordeel faalde voor ' + pid, e); }
        if (q && q.status === 'onzin') return zet('meetfout', q.reden || 'fysiek onmogelijke waarde');
      }
    }
    // 2. Alarmgrens uit de PID-definitie.
    if (getal(d.dH) && r.max >= d.dH) return zet('afwijkend', 'hoogste waarde ' + fmt(r.max) + ' ' + r.eenheid + ' boven de alarmgrens ' + fmt(d.dH), tel(v => v >= d.dH));
    if (getal(d.dL) && r.min <= d.dL) return zet('afwijkend', 'laagste waarde ' + fmt(r.min) + ' ' + r.eenheid + ' onder de alarmgrens ' + fmt(d.dL), tel(v => v <= d.dL));
    // 3. Waarschuwingsgrens.
    if (getal(d.wH) && r.max >= d.wH) return zet('let', 'hoogste waarde ' + fmt(r.max) + ' ' + r.eenheid + ' boven de waarschuwingsgrens ' + fmt(d.wH), tel(v => v >= d.wH));
    if (getal(d.wL) && r.min <= d.wL) return zet('let', 'laagste waarde ' + fmt(r.min) + ' ' + r.eenheid + ' onder de waarschuwingsgrens ' + fmt(d.wL), tel(v => v <= d.wL));
    // 4. Buiten het gebruikelijke bereik (PID_LET_OP, laag 1b).
    const lo = letOp && letOp[pid];
    if (lo && getal(lo.max) && r.max > lo.max) return zet('let', lo.waarom || 'boven het gebruikelijke bereik', tel(v => v > lo.max));
    if (lo && getal(lo.min) && r.min < lo.min) return zet('let', lo.waarom || 'onder het gebruikelijke bereik', tel(v => v < lo.min));
    // 5. Twijfel over de meting zelf.
    if (kwal) {
      let q = null;
      try { q = kwal(pid, r.laatste); } catch (e) { console.warn('PLVerzamel: kwaliteitsoordeel faalde voor ' + pid, e); }
      if (q && q.status === 'twijfel') return zet('twijfel', q.reden || 'meting twijfelachtig');
    }
    return zet('ok', '');
  }

  /* De hele set. `bron` = {hist, def(pid), letOp, kwal}; zonder bron leest
     hij de app (pidHist, getPidDef, PID_LET_OP, assessPidQuality). */
  function samenvatting(pids, bron) {
    const b = bron || appBron();
    const rijen = (pids || []).map(pid => beoordeel(pid, (b.hist || {})[pid], b.def ? b.def(pid) : null, b.letOp, b.kwal));
    rijen.sort((x, y) => (RANG[x.oordeel] - RANG[y.oordeel]) || String(x.naam).localeCompare(String(y.naam)));
    const tel = { afwijkend: 0, let: 0, meetfout: 0, twijfel: 0, ok: 0, nodata: 0 };
    rijen.forEach(r => { tel[r.oordeel]++; });
    return { rijen, tel, opvallend: tel.afwijkend + tel.let };
  }

  function appBron() {
    return {
      hist: (typeof pidHist !== 'undefined' && pidHist) || {},
      def: pid => (typeof getPidDef === 'function' ? getPidDef(pid) : null),
      letOp: window.PID_LET_OP || {},
      kwal: (typeof assessPidQuality === 'function') ? assessPidQuality : null
    };
  }

  /* Wat de AI krijgt: dezelfde samenvatting als het scherm, in tekst. */
  function promptBlok(sam, meta) {
    if (!sam || !sam.rijen || !sam.rijen.length) return '';
    const m = meta || {};
    const regel = r => '- ' + r.naam + ': ' + fmt(r.min) + '–' + fmt(r.max) + ' ' + r.eenheid +
      ', gem ' + fmt(r.gem) + ', laatste ' + fmt(r.laatste) + ' (' + r.n + ' metingen' +
      (r.buiten ? '; ' + r.buiten + ' daarvan buiten de grens' : '') + ')' + (r.reden ? ' — ' + r.reden : '');
    const groep = (titel, filter) => {
      const g = sam.rijen.filter(filter);
      return g.length ? '\n' + titel + ':\n' + g.map(regel).join('\n') : '';
    };
    let s = '\n\nGEMETEN OVER HET MEETVENSTER (' + (getal(m.sec) ? m.sec + ' s' : 'duur onbekend') +
      (getal(m.rijSec) && m.rijSec > 0 ? ', waarvan ' + m.rijSec + ' s rijdend' : '') +
      '; dezelfde samenvatting die de gebruiker op het scherm zag — per sensor min–max, gemiddelde, laatste waarde en aantal metingen):';
    s += groep('OPVALLEND (vlag van de app op vaste grenzen — nog geen diagnose)', r => r.oordeel === 'afwijkend' || r.oordeel === 'let');
    s += groep('MEETKWALITEIT TWIJFELACHTIG (eerst de meting of de sensor verifiëren, niet als defect rapporteren)', r => r.oordeel === 'meetfout' || r.oordeel === 'twijfel');
    s += groep('BINNEN HET GEBRUIKELIJKE BEREIK', r => r.oordeel === 'ok');
    const leeg = sam.rijen.filter(r => r.oordeel === 'nodata');
    if (leeg.length) s += '\nGEEN DATA ONTVANGEN: ' + leeg.map(r => r.naam).join(', ') + '. Doe geen uitspraken over wat deze sensoren afdekken.';
    s += '\nREGEL: toets elke opvallende waarde tegen de toestand van de motor (koud/warm, stationair/rijdend, motor aan/uit) voordat je hem een bevinding noemt; een vlag op een vaste grens kan in deze toestand normaal zijn. Een waarde die alleen even buiten de grens kwam (weinig metingen buiten de grens) weegt minder dan een die er bleef.';
    return s;
  }

  /* Waar staat het scherm? Puur, zodat de overgangen te toetsen zijn.
     t = {verbonden, ok, kernCompleet (true/false/null), verstreken, minMs, maxMs} */
  function fase(t) {
    if (!t.verbonden) return 'los';
    if (t.verstreken < t.minMs) return 'meten';
    if (t.ok && t.kernCompleet !== false) return 'klaar';
    if (t.verstreken >= t.maxMs) return 'tijd';
    return 'meten';
  }

  // ── Het scherm ──────────────────────────────────────────────────
  let lopend = null;     // één tegelijk; een tweede aanroep krijgt dezelfde belofte

  function sensorPids() {
    try { return [...activePIDs].filter(isReportableSensor); }
    catch (e) { console.warn('PLVerzamel: sensorlijst niet leesbaar', e); return []; }
  }

  function spark(reeks) {
    if (!reeks || reeks.length < 2) return '<svg class="vz-spark" viewBox="0 0 60 16" aria-hidden="true"></svg>';
    const mn = Math.min.apply(null, reeks), mx = Math.max.apply(null, reeks), sp = (mx - mn) || 1;
    const pt = reeks.map((v, i) => (i * 60 / (reeks.length - 1)).toFixed(1) + ',' + (15 - (v - mn) / sp * 14).toFixed(1)).join(' ');
    return '<svg class="vz-spark" viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pt + '"/></svg>';
  }
  const LABEL = { afwijkend: 'afwijkend', let: 'let op', meetfout: 'meetfout', twijfel: 'twijfel', ok: '', nodata: 'geen data' };

  function rijHtml(r, quotaVan, uitslag) {
    const quota = quotaVan(r.pid);
    const klaar = r.n >= quota;
    const status = uitslag ? (LABEL[r.oordeel] ? '<span class="vz-tag">' + LABEL[r.oordeel] + '</span>' : '')
                           : '<span class="vz-n">' + (klaar ? '✓' : r.n + '/' + quota) + '</span>';
    const waarde = uitslag && r.n ? fmt(r.min) + '–' + fmt(r.max) + ' ' + esc(r.eenheid) : (r.n ? fmt(r.laatste) + ' ' + esc(r.eenheid) : '…');
    return '<div class="vz-rij vz-' + r.oordeel + (klaar ? ' klaar' : '') + '" data-pid="' + esc(r.pid) + '">' +
      '<span class="vz-nm">' + esc(r.naam) + '</span>' + spark(r.reeks) +
      '<span class="vz-w">' + waarde + '</span>' + status +
      (uitslag && r.reden && r.oordeel !== 'ok' ? '<span class="vz-reden">' + esc(r.reden) + (r.buiten ? ' · ' + r.buiten + ' van ' + r.n + ' metingen' : '') + '</span>' : '') +
    '</div>';
  }

  /* Hoeveel monsters een sensor nodig heeft: dezelfde maat als de kop
     ("3 van 8 klaar"), dus uit plKernStatus — een trage sensor heeft er één
     nodig. Buiten de kernset de gewone maat. */
  function quotaFn(k, standaard) {
    const per = {};
    ((k && k.items) || []).forEach(i => { per[i.pid] = i.quota; });
    return pid => per[pid] || standaard;
  }

  /* ── Wat dit scherm zelf bijhoudt, voor de meetproef (#443) ──────
     De vraag voor de rit: geven de vaste grenzen op een gezonde auto te vaak
     oranje of rood? Dat is alleen te beantwoorden met getallen, dus elke
     uitslag telt mee en krijgt een logregel met de toestand erbij. maat()
     geeft ze aan een meetopdracht (APPMATEN in pidlane-opdracht.js). */
  const tel = { uitslagen: 0, opvallend: 0, maxOpvallend: 0, afwijkend: 0, ai: 0, besloten: 0,
                hergebruik: 0, rit: 0, langsteMs: null, pid: {} };
  function noteer(sam, info) {
    tel.uitslagen++;
    tel.opvallend += sam.opvallend;
    tel.afwijkend += sam.tel.afwijkend;
    tel.maxOpvallend = Math.max(tel.maxOpvallend, sam.opvallend);
    if (info.hergebruik) tel.hergebruik++;
    if (info.rit) tel.rit++;
    if (getal(info.ms)) tel.langsteMs = Math.max(tel.langsteMs || 0, info.ms);
    sam.rijen.forEach(r => { if (r.oordeel === 'afwijkend' || r.oordeel === 'let') tel.pid[r.pid] = (tel.pid[r.pid] || 0) + 1; });
    const opv = sam.rijen.filter(r => r.oordeel === 'afwijkend' || r.oordeel === 'let')
      .map(r => r.naam + ' ' + fmt(r.min) + '–' + fmt(r.max) + ' ' + r.eenheid + ' (' + LABEL[r.oordeel] + ', ' + r.buiten + '/' + r.n + ')');
    const kw = sam.rijen.find(r => r.pid === '0105' && r.n);
    try {
      log('Verzamelscherm — ' + (info.watVoor || 'analyse') + ': uitslag ' + (info.reden || '') +
          (info.bron ? ' uit ' + info.bron : (getal(info.ms) ? ' na ' + Math.round(info.ms / 1000) + ' s' : '')) +
          ', ' + (sam.rijen.length - sam.tel.nodata) + ' sensoren, ' +
          (opv.length ? 'valt op: ' + opv.join('; ') : 'niets opvallend') +
          ' — toestand: ' + (getal(info.rijSec) ? info.rijSec + ' s rijdend' : 'rijden onbekend') +
          (kw ? ', koelwater laatste ' + fmt(kw.laatste) + ' °C' : ''), opv.length ? 'warn' : 'info');
    } catch (e) { console.warn('PLVerzamel: logregel niet geschreven', e); }
  }
  function maat(naam) {
    const n = tel.uitslagen;
    switch (naam) {
      case 'verzamel-uitslagen':     return n || null;
      case 'verzamel-opvallend-max': return n ? tel.maxOpvallend : null;
      case 'verzamel-afwijkend':     return n ? tel.afwijkend : null;
      case 'verzamel-koelwater':     return n ? (tel.pid['0105'] || 0) : null;
      case 'verzamel-accu':          return n ? (tel.pid['0142'] || 0) : null;
      case 'verzamel-wacht-s':       return tel.langsteMs === null ? null : Math.round(tel.langsteMs / 1000);
      // Deze twee zijn null tot het geval zich voordeed: geen plan of geen rit
      // gedaan is "niet gemeten", geen 0 die als bevinding leest.
      case 'verzamel-hergebruik':    return tel.hergebruik || null;
      case 'verzamel-na-rit':        return tel.rit || null;
      case 'verzamel-ai-pct':        return tel.besloten ? Math.round(tel.ai * 100 / tel.besloten) : null;
      default: return null;
    }
  }

  /* ── De rit van zojuist als meting ─────────────────────────────────
     Een rit bewaart elke fase volledig (ritFaseData); pidHist houdt maar 120
     monsters per sensor, op een rit een paar minuten. Is er net gereden, dan
     ís die rit de meting: de uitslag komt uit de rit, en de poort hoeft niet
     nog eens over de laatste paar minuten. Hoe vers is vers: een kwartier. */
  const RIT_GELDIG_MS = 15 * 60 * 1000;
  function ritVanZojuist(eis) {
    let b = null;
    try { b = plRitBron(); } catch (e) { console.warn('PLVerzamel: de rit van zojuist is niet leesbaar', e); return null; }
    if (!b || !getal(b.eind) || Date.now() - b.eind > RIT_GELDIG_MS) return null;
    if (eis && eis.rij && !(getal(b.rijSec) && b.rijSec >= eis.rij)) return null;
    return b;
  }

  // Na "🚗 Rijtest starten" weet de rit niet waar hij vandaan kwam. Dit wel:
  // stopRitAnalyse() vraagt het hier op (naRit) en de analyse begint opnieuw.
  let naRitVervolg = null;
  function naRit() {
    if (!naRitVervolg) return false;
    const f = naRitVervolg; naRitVervolg = null;
    setTimeout(() => { try { f(); } catch (e) { console.warn('PLVerzamel: de analyse na de rit startte niet', e); try { log('Analyse na de rijtest niet gestart: ' + ((e && e.message) || e), 'err'); } catch (e2) { console.warn(e2); } } }, 300);
    return true;
  }

  /* Opent het scherm en lost op met {door, ai, sam, sec, rijSec}.
     opts: {niveau, profiel, watVoor, ai:false (geen AI-knop), aiTekst,
            naRit (functie die na een rijtest opnieuw begint),
            bron: {naam, hist, pids?, sec, rijSec} — een meting die er al is
            (een datalog, de ritfases): dan meteen de uitslag, zonder poort} */
  function meet(opts) {
    if (lopend) return lopend;
    const o = opts || {};
    const niveau = plMeetNiveau(o.niveau || 'normaal');
    const prof = (o.profiel === false) ? null : (o.profiel || window._laatstProfiel || null);
    const quota = KERN_REEKS_MIN;
    const eis = MEET_EIS[niveau] || MEET_EIS.normaal;
    // Een gegeven bron, of anders de rit van zojuist. Die laatste mag de klant
    // vervangen door opnieuw te meten; een datalog niet, die ís de vraag.
    let bron = o.bron || null;
    let ritBron = false;
    if (!bron && o.ritBron !== false) { bron = ritVanZojuist(eis); ritBron = !!bron; }
    // Net verzameld (binnen de bevestigingstermijn van de oude poort)? Dan
    // geen tien seconden opnieuw: één meting voor een heel plan.
    const vers = !bron && window._plVerzameld && (Date.now() - window._plVerzameld.ts) < MEET_BEVESTIGD_MS;

    lopend = new Promise(resolve => {
      // FASE 1 van de poort — de juiste sensoren aan. Zelfde stap als
      // plVraagMeting; faalt hij, dan meten we wat er aanstaat en zegt de
      // samenvatting welke sensoren niets gaven.
      const aan = (!bron && prof && typeof ensurePIDsActive === 'function')
        ? Promise.resolve().then(() => ensurePIDsActive(prof)).catch(e => {
            console.warn('PLVerzamel: kernprofiel niet geactiveerd', e);
            try { log('Sensoren voor de meting niet aangezet (' + ((e && e.message) || e) + ') — het verzamelscherm meet wat er aanstaat', 'warn'); } catch (e2) { console.warn(e2); }
          })
        : Promise.resolve();

      let ov = document.getElementById('plVzOv');
      if (!ov) { ov = document.createElement('div'); ov.id = 'plVzOv'; ov.className = 'mg-ov'; document.body.appendChild(ov); }
      ov.innerHTML =
        '<div class="mg-kaart vz-kaart">' +
          '<div class="vz-kop"><div class="mg-t" id="plVzKop">📡 Data verzamelen</div>' +
            '<button class="vz-x" data-a="annuleer" aria-label="Sluiten">✕</button></div>' +
          '<div class="mg-s" id="plVzSub"></div>' +
          '<div class="vz-balk"><i id="plVzBalk"></i></div>' +
          '<div class="vz-lijst" id="plVzLijst"></div>' +
          '<div class="mg-knoppen" id="plVzKnoppen"></div>' +
        '</div>';
      ov.style.display = 'flex';

      let verstreken = 0, laatsteTik = Date.now(), minMs = vers ? 0 : MIN_MS;
      let maxMs = eis.sec * 1000 + KERN_MAX_WACHT_MS;
      let staat = 'meten', tik = null, klaar = false, laatste = null, getekend = '', uitslagSam = null;

      const meting = () => {
        const r = plMeetTekort(niveau);
        const k = prof ? plKernStatus(prof) : null;
        return { r, k };
      };
      const quotaVan = k => quotaFn(k, quota);
      const verbonden = () => (typeof connected !== 'undefined' && connected) || (typeof demoMode !== 'undefined' && demoMode);
      const samNu = () => bron ? vanBron(bron) : samenvatting(sensorPids());

      const sluit = (uit) => {
        if (klaar) return; klaar = true;
        if (tik) clearInterval(tik);
        ov.style.display = 'none'; ov.innerHTML = ''; ov.onclick = null;
        lopend = null;
        resolve(uit);
      };
      const uitkomst = (ai) => {
        const sam = uitslagSam || samNu();
        let sec, rijSec;
        if (bron) { sec = bron.sec; rijSec = bron.rijSec; }
        else { const m = laatste || meting(); sec = m.r.st.sec; rijSec = m.r.st.rijSec; }
        const res = { door: true, ai: !!ai, sam, sec, rijSec, bron: bron ? bron.naam : null, beperkt: window._meetBeperkt || '' };
        window._plVerzameld = { sam, sec, rijSec, beperkt: res.beperkt, bron: res.bron, ts: Date.now() };
        window._plMeetBevestigd = Date.now();
        tel.besloten++; if (ai) tel.ai++;
        return res;
      };

      const knoppen = (html) => {
        if (getekend === html) return;
        getekend = html;
        document.getElementById('plVzKnoppen').innerHTML = html;
      };
      const tekenMeten = (m, sam) => {
        const st = m.r.st;
        const frac = Math.max(0, Math.min(1, Math.min(
          eis.sec ? st.sec / eis.sec : 1,
          m.k ? m.k.pctHaalbaar : 1,
          minMs ? Math.max(verstreken / minMs, 0) : 1 )));
        const over = Math.max(0, Math.ceil((Math.max(eis.sec - st.sec, (minMs - verstreken) / 1000))));
        document.getElementById('plVzBalk').style.width = Math.round(frac * 100) + '%';
        document.getElementById('plVzSub').innerHTML = 'Voor ' + esc(o.watVoor || 'deze analyse') + ' haal ik de sensoren binnen' +
          (m.k ? ': <b>' + m.k.gereed.length + ' van ' + m.k.haalbaar.length + '</b> zijn klaar' : '') +
          (over ? ' — nog zo’n ' + over + ' s.' : '.') +
          (sam.opvallend ? ' <b class="vz-opval">' + sam.opvallend + ' waarde' + (sam.opvallend === 1 ? ' valt' : 'n vallen') + ' nu al op.</b>' : '') +
          (m.r.rijTekort ? '<br>Voor een ' + esc(eis.naam) + ' is rijden nodig; stilstaand loopt dat niet in.' : '');
        // Tijdens het meten op naam: een lijst die elke halve seconde herschikt
        // is niet te lezen. De kleur zegt al wat er opvalt.
        document.getElementById('plVzLijst').innerHTML = sam.rijen.slice()
          .sort((x, y) => String(x.naam).localeCompare(String(y.naam)))
          .map(r => rijHtml(r, quotaVan(m.k), false)).join('');
        const rit = m.r.rijTekort && typeof openRitAnalyse === 'function';
        knoppen((rit ? '<button class="mg-pri" data-a="rit">🚗 Rijtest starten</button>' : '') +
                '<button class="mg-sec" data-a="nu">Nu bekijken met wat er is</button>' +
                '<button class="mg-ter" data-a="annuleer">Annuleren</button>');
      };
      const tekenUitslag = (st, k, sam, rijTekort) => {
        const sec = getal(st.sec) ? Math.round(st.sec) : 0, min = Math.floor(sec / 60), s = sec % 60;
        const duur = min ? min + ':' + String(s).padStart(2, '0') + ' min' : sec + ' s';
        const gemeten = sam.rijen.length - sam.tel.nodata;
        const beperkt = !bron && window._meetBeperkt;
        document.getElementById('plVzKop').textContent = beperkt ? '⚠ Data verzameld, met beperking' : '✓ Data verzameld';
        document.getElementById('plVzBalk').style.width = '100%';
        document.getElementById('plVzSub').innerHTML =
          '<b>' + gemeten + '</b> sensor' + (gemeten === 1 ? '' : 'en') + ' gemeten over <b>' + duur + '</b>' +
          (st.rijSec ? ', waarvan ' + Math.round(st.rijSec) + ' s gereden' : '') +
          (bron ? ' — ' + esc(bron.naam || 'een eerdere meting') : '') + '. ' +
          (sam.opvallend ? '<b class="vz-opval">' + sam.opvallend + ' waarde' + (sam.opvallend === 1 ? ' valt' : 'n vallen') + ' op</b> — die staan bovenaan.'
                         : 'Geen waarde buiten het gebruikelijke bereik.') +
          (beperkt ? '<ul class="mg-lijst vz-beperkt"><li>' + esc(window._meetBeperkt) + '</li></ul>' : '');
        const sectie = (titel, filter, open) => {
          const g = sam.rijen.filter(filter);
          if (!g.length) return '';
          const inhoud = g.map(r => rijHtml(r, quotaVan(k), true)).join('');
          return open ? '<div class="vz-sectie">' + titel + ' (' + g.length + ')</div>' + inhoud
                      : '<details class="vz-meer"><summary>' + titel + ' (' + g.length + ')</summary>' + inhoud + '</details>';
        };
        document.getElementById('plVzLijst').innerHTML =
          sectie('Valt op', r => r.oordeel === 'afwijkend' || r.oordeel === 'let', true) +
          (sam.opvallend ? '<div class="vz-noot">Opvallend is een vlag op vaste grenzen, nog geen defect. Of het in deze toestand van de motor normaal is, weegt de AI.</div>' : '') +
          sectie('Meting twijfelachtig', r => r.oordeel === 'meetfout' || r.oordeel === 'twijfel', true) +
          sectie('Binnen het gebruikelijke bereik', r => r.oordeel === 'ok', false) +
          sectie('Geen data', r => r.oordeel === 'nodata', false);
        const rit = rijTekort && typeof openRitAnalyse === 'function';
        // Langer meten kan alleen live. De rit van zojuist mag de klant
        // vervangen door een verse meting; een datalog of ritrapport niet.
        const verder = !bron ? '<button class="mg-sec" data-a="langer">⏳ Langer meten</button>'
                     : (ritBron ? '<button class="mg-sec" data-a="opnieuw">📡 Opnieuw meten</button>' : '');
        knoppen((o.ai === false ? '<button class="mg-pri" data-a="door">Verder</button>'
                                : '<button class="mg-pri" data-a="ai">' + esc(o.aiTekst || '🤖 Laat de AI dit onderzoeken') + '</button>') +
                (rit ? '<button class="mg-sec" data-a="rit">🚗 Rijtest starten</button>' : '') +
                verder +
                '<button class="mg-ter" data-a="annuleer">' + (o.ai === false ? 'Annuleren' : 'Sluiten zonder AI') + '</button>');
      };

      const naarUitslag = (reden) => {
        staat = 'uitslag';
        if (bron) {
          // De bron ís de meting; een beperking van een vórige live meting
          // hoort niet in dit rapport.
          try { delete window._meetBeperkt; } catch (e) { console.warn('Oude meetbeperking niet opgeruimd', e); }
          uitslagSam = samNu();
          tekenUitslag({ sec: bron.sec, rijSec: bron.rijSec }, null, uitslagSam, false);
          noteer(uitslagSam, { watVoor: o.watVoor, reden: 'klaar', bron: bron.naam, rit: ritBron || !!bron.rit, rijSec: bron.rijSec });
          return;
        }
        const m = laatste || meting();
        // "Nu bekijken" terwijl de poort al gehaald is, is gewoon klaar.
        if (reden === 'nu' && m.r.ok && !(m.k && m.k.compleet === false)) reden = 'klaar';
        if (reden === 'klaar') { try { delete window._meetBeperkt; } catch (e) { console.warn('Oude meetbeperking niet opgeruimd', e); } }
        else if (reden === 'los') window._meetBeperkt = 'verbinding verbroken tijdens het verzamelen';
        else {
          const t = (m.r.tekort || []).slice();
          if (m.k && m.k.stil && m.k.stil.length) t.push('geen data van ' + m.k.stil.map(i => i.naam).join(', '));
          window._meetBeperkt = t.length ? t.join('; ') : 'meting vroegtijdig gestopt';
        }
        uitslagSam = samNu();
        tekenUitslag(m.r.st, m.k, uitslagSam, m.r.rijTekort);
        noteer(uitslagSam, { watVoor: o.watVoor, reden, ms: verstreken, hergebruik: vers && verstreken < MIN_MS, rijSec: m.r.st.rijSec });
      };

      const start = () => {
        laatsteTik = Date.now();
        if (bron) { naarUitslag('klaar'); return; }
        stap();
        tik = setInterval(stap, TIK_MS);
      };

      ov.onclick = (e) => {
        const b = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
        if (!b) return;
        const a = b.getAttribute('data-a');
        if (a === 'annuleer') {
          if (staat === 'uitslag') tel.besloten++;
          try { log('Verzamelscherm gesloten zonder analyse', 'info'); } catch (e2) { console.warn(e2); }
          sluit({ door: false, ai: false });
        }
        else if (a === 'ai') sluit(uitkomst(true));
        else if (a === 'door') sluit(uitkomst(false));
        else if (a === 'nu') naarUitslag('nu');
        else if (a === 'langer') {
          staat = 'meten'; getekend = '';
          document.getElementById('plVzKop').textContent = '📡 Data verzamelen';
          minMs = verstreken + KERN_VERLENG_MS; maxMs = Math.max(maxMs, minMs);
        }
        else if (a === 'opnieuw') {
          // Van de rit van zojuist naar een verse, live meting.
          bron = null; ritBron = false; staat = 'meten'; getekend = ''; uitslagSam = null;
          verstreken = 0; minMs = MIN_MS;
          document.getElementById('plVzKop').textContent = '📡 Data verzamelen';
          const go = (prof && typeof ensurePIDsActive === 'function') ? Promise.resolve().then(() => ensurePIDsActive(prof)).catch(e2 => console.warn('PLVerzamel: kernprofiel niet geactiveerd', e2)) : Promise.resolve();
          go.then(() => { if (!klaar) start(); });
        }
        else if (a === 'rit') {
          naRitVervolg = (typeof o.naRit === 'function') ? o.naRit : null;
          sluit({ door: false, ai: false, rit: true });
          try { openRitAnalyse(eis === MEET_EIS.kortrit ? '2min' : '10min'); }
          catch (e2) { naRitVervolg = null; try { log('Rijtest niet gestart: ' + ((e2 && e2.message) || e2), 'err'); } catch (e3) { console.warn(e3); } }
        }
      };

      const stap = () => {
        if (klaar) return;
        const nu = Date.now();
        // Alleen zichtbare tijd telt: een app op de achtergrond meet niet (§16).
        if (typeof document.visibilityState === 'undefined' || document.visibilityState !== 'hidden') verstreken += nu - laatsteTik;
        laatsteTik = nu;
        if (staat !== 'meten') return;
        laatste = meting();
        const f = fase({ verbonden: verbonden(), ok: laatste.r.ok, kernCompleet: laatste.k ? laatste.k.compleet : null,
                         verstreken, minMs, maxMs });
        if (f === 'meten') tekenMeten(laatste, samNu());
        else naarUitslag(f);
      };
      aan.then(() => { if (!klaar) start(); });
    });
    return lopend;
  }

  /* Seconden rijdend in een snelheidsreeks [{t, v}], met dezelfde drempels
     als de meetpoort (MEET_RIJ_KMH, MEET_RIJ_GAT_MS in pidlane-fuel.js). Geen
     reeks = null: niet gemeten is geen 0. Voor elke bron dezelfde maat. */
  function rijSecUit(reeks) {
    if (!reeks || !reeks.length) return null;
    let ms = 0;
    for (let i = 1; i < reeks.length; i++) {
      const gat = reeks[i].t - reeks[i - 1].t;
      if (gat <= 0 || gat > MEET_RIJ_GAT_MS) continue;
      if (reeks[i].v >= MEET_RIJ_KMH && reeks[i - 1].v >= MEET_RIJ_KMH) ms += gat;
    }
    return Math.round(ms / 1000);
  }

  /* De samenvatting van een gegeven bron ({hist, pids?}), zoals het scherm
     hem toont. Voor een rapport dat de bron zelf heeft (het ritrapport). */
  function vanBron(b) {
    if (!b) return null;
    const pids = (b.pids && b.pids.length) ? b.pids
      : Object.keys(b.hist || {}).filter(p => (b.hist[p] || []).length && isReportableSensor(p));
    return samenvatting(pids, Object.assign(appBron(), { hist: b.hist || {} }));
  }

  /* Reeksen per PID uit een lijst van momentopnames, zoals de klimaatcheck
     en de caravan die bijhouden: [{t, rpm, coolant, …}] met een sleutel→PID-
     tabel. Puur. */
  function histUit(monsters, sleutels) {
    const h = {};
    (monsters || []).forEach(m => {
      Object.keys(sleutels).forEach(k => {
        const v = m && m[k];
        if (getal(v)) (h[sleutels[k]] || (h[sleutels[k]] = [])).push({ t: m.t, v });
      });
    });
    return h;
  }

  window.PLVerzamel = { MIN_MS, RIT_GELDIG_MS, beoordeel, samenvatting, promptBlok, fase, meet, naRit, maat, histUit, vanBron, rijSecUit,
    open: function () { return !!lopend; } };
})();
