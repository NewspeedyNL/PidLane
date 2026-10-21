/* ═══════════════════════════════════════════════════════════════════
   pidlane-expertwerk.js — PLExpertWerk: de werkplek van de expert op een laptop
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (18-10-2026)
   Uit het gebruik: "Een expert logt niet voor niets in en wil informatie op
   het eerste gezicht." Het meekijkvenster (#remExpertOv) was een smal blad
   onderin, gemaakt voor een telefoon: de voorkennis stond onder de live
   tegels, in één lange kolom. Op een laptop is er ruimte voor alles tegelijk.

   WAT HET DOET
   • Meet of dit een laptop is (`isLaptop(omgeving)`, puur): geen Capacitor,
     een muis (pointer:fine + hover), minstens LAPTOP_BREED pixels breed en
     geen mobiele user-agent. Chrome of Edge staat erbij als bron, maar is
     geen voorwaarde. De meting is te overrulen: `pl_expertweergave` =
     'auto' (standaard) | 'aan' | 'uit', met de knop in de kop van het venster.
   • Op een laptop opent het meekijkvenster na het inloggen vanzelf (niet voor
     een klant), en wordt het schermvullend met vier kaarten: de auto, wat nu
     afwijkt, wat er al gedaan is, en procedures voor déze auto.
   • Zet de garagemodus aan zodra de werkplek opent, één keer per sessie.

   PROCEDURES — GEEN TWEEDE TABEL
   `procedures(vk, onderzoek, plan)` is puur. De bronnen bestaan al:
   - de verdenkingen met bewijs (vk.kansen) en de bekende zwakke punten van
     dit merk, motor en bouwjaar (vk.bekend, uit autoKennisVoorMerk) dragen
     hun hypothesen `h`;
   - per hypothese komen de meetstappen uit PLOnderzoek.STAPPEN die hem het
     zwaarst toetsen (`test[h]`), en de werkplaatsactie uit VERDENKINGEN[h];
   - per foutcode het controleplan uit dtcPlan() (DTC_PLAN, pidlane-data.js).
   Verandert daar iets, dan verandert de procedure hier mee.

   Alles wat binnenkomt komt van de peer (vstate van de telefoon): elke string
   door esc(), elk getal door getal() — dezelfde regel als PLVoorkennis (#142).
   Laadt ná pidlane-voorkennis.js, vóór pidlane-remote.js. Geen bus-I/O.
   Tests: test-expertwerk.js, bproef-expertwerk.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SLEUTEL = 'pl_expertweergave';
  var STANDEN = ['auto', 'aan', 'uit'];
  var LAPTOP_BREED = 1024;
  var STAP_MIN = 1.5;          // een meetstap telt pas als hij de hypothese stevig toetst
  var MAX = { stappen: 3, procedures: 12 };

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function getal(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function arr(x) { return Array.isArray(x) ? x : []; }

  // ── meten: is dit een laptop? ──────────────────────────────────────
  /* omg = { ua, breed, fijn, hover, capacitor }. Puur. */
  function isLaptop(omg) {
    omg = omg || {};
    var ua = String(omg.ua || '');
    var redenen = [];
    if (omg.capacitor) redenen.push('app op een toestel');
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) redenen.push('mobiele browser');
    if (!omg.fijn || !omg.hover) redenen.push('geen muis');
    if (!(getal(omg.breed) >= LAPTOP_BREED)) redenen.push('scherm smaller dan ' + LAPTOP_BREED + ' px');
    var browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
    return { laptop: redenen.length === 0, browser: browser, redenen: redenen };
  }
  function geldigeStand(s) { return STANDEN.indexOf(s) >= 0 ? s : 'auto'; }
  /* Puur: de stand wint van de meting, in beide richtingen. */
  function actiefVoor(stand, meting) {
    stand = geldigeStand(stand);
    if (stand === 'aan') return true;
    if (stand === 'uit') return false;
    return !!(meting && meting.laptop);
  }
  function standTekst(stand, meting) {
    stand = geldigeStand(stand);
    if (stand === 'aan') return 'Expertweergave: aan';
    if (stand === 'uit') return 'Expertweergave: uit';
    return 'Expertweergave: automatisch — ' + (meting && meting.laptop ? 'laptop gemeten (' + meting.browser + ')' : 'geen laptop (' + arr(meting && meting.redenen).join(', ') + ')');
  }
  function volgendeStand(s) { var i = STANDEN.indexOf(geldigeStand(s)); return STANDEN[(i + 1) % STANDEN.length]; }

  function omgeving() {
    var mm = function (q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { console.warn('PLExpertWerk: matchMedia ' + q, e); return false; } };
    var cap = false;
    try { cap = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()); }
    catch (e) { console.warn('PLExpertWerk: Capacitor onbekend', e); }
    return { ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '', breed: window.innerWidth || 0,
             fijn: mm('(pointer: fine)'), hover: mm('(hover: hover)'), capacitor: cap };
  }
  function stand() {
    try { return geldigeStand(localStorage.getItem(SLEUTEL)); }
    catch (e) { console.warn('PLExpertWerk: stand onleesbaar — automatisch', e); return 'auto'; }
  }
  function zetStand(s) {
    try { localStorage.setItem(SLEUTEL, geldigeStand(s)); }
    catch (e) { console.warn('PLExpertWerk: stand niet bewaard', e); }
  }
  function actief() { return actiefVoor(stand(), isLaptop(omgeving())); }

  // ── procedures voor déze auto (puur) ───────────────────────────────
  function stappenVoor(h, O) {
    if (!O || !Array.isArray(O.STAPPEN)) return [];
    return O.STAPPEN
      // De snelle scan (altijdEerst) hoort bij elke klacht en zegt dus niets
      // over déze; hij staat al bovenaan als foutcodes en freeze frame.
      .filter(function (s) { return s && !s.altijdEerst && s.test && (s.test[h] || 0) >= STAP_MIN; })
      .sort(function (a, b) { return (b.test[h] || 0) - (a.test[h] || 0); })
      .slice(0, MAX.stappen)
      .map(function (s) { return { soort: 'meten', tekst: s.titel, toelichting: s.opdracht || s.waarom || '', id: s.id }; });
  }
  function voorHypothesen(hs, O) {
    var V = (O && O.VERDENKINGEN) || {}, uit = [], gezien = {};
    arr(hs).forEach(function (h) {
      if (gezien[h] || !V[h]) return; gezien[h] = true;
      stappenVoor(h, O).forEach(function (s) { if (!uit.some(function (u) { return u.id === s.id; })) uit.push(s); });
    });
    arr(hs).forEach(function (h) { if (V[h] && V[h].vervolg) uit.push({ soort: 'werkplaats', tekst: V[h].vervolg, h: h }); });
    return uit;
  }
  /* vk = voorkennis (PLVoorkennis.bouw), O = PLOnderzoek, plan = dtcPlan. */
  function procedures(vk, O, plan) {
    vk = vk || {};
    var uit = [];
    arr(vk.kansen).forEach(function (k) {
      if (!k || !k.h) return;
      uit.push({ bron: 'kans', titel: String(k.naam || k.h), waarom: arr(k.redenen).slice(0, 2).join(' · '), stappen: voorHypothesen([k.h], O) });
    });
    arr(vk.bekend).forEach(function (b) {
      if (!b || !b.t) return;
      uit.push({ bron: 'bekend', titel: String(b.t), waarom: 'Bekend zwak punt bij ' + (vk.merk || 'dit merk') + (b.naam ? ' — toetst ' + b.naam : ''), stappen: voorHypothesen(b.h, O) });
    });
    arr(vk.zelf).forEach(function (t) {
      uit.push({ bron: 'bekend', titel: String(t), waarom: 'Bekend zwak punt bij ' + (vk.merk || 'dit merk'),
                 stappen: [{ soort: 'werkplaats', tekst: 'Nog geen meetregel in PidLane — leg de klacht voor aan de AI-analyse onderaan.' }] });
    });
    if (plan) {                       // een parameter, geen global: de try hieronder vangt een niet-functie
      arr(vk.foutcodes).forEach(function (c) {
        var p = null;
        try { p = plan(c && c.code); } catch (e) { console.warn('PLExpertWerk: dtcPlan ' + (c && c.code), e); }
        if (!p || !arr(p.stappen).length) return;
        uit.push({ bron: 'code', titel: String(c.code) + (c.desc ? ' — ' + c.desc : ''),
                   waarom: (p.kost ? 'indicatie €' + p.kost[0] + '–' + p.kost[1] : '') + (p.wie ? (p.kost ? ' · ' : '') + (p.wie === 'garage' ? 'werk voor de garage' : 'ook zelf te doen') : ''),
                   stappen: p.stappen.map(function (t) { return { soort: 'werkplaats', tekst: t }; }) });
      });
    }
    return uit.filter(function (p) { return p.stappen.length; }).slice(0, MAX.procedures);
  }

  /* Wat nu afwijkt (puur): sensoren die niet gezond zijn, foutcodes van nu,
     gezakte mode 06-testen en de verdenkingen met bewijs. */
  var GEZOND = { nodata: 'geeft geen antwoord (NO DATA)', onzin: 'onwaarschijnlijke waarde' };   // de waarden van _pidHealth
  function afwijkingen(vs) {
    vs = vs || {}; var vk = vs.voorkennis || {}, uit = [];
    arr(vk.foutcodes).filter(function (c) { return c && c.nu; }).forEach(function (c) {
      uit.push({ ernst: 'rood', tekst: String(c.code) + (c.desc ? ' — ' + c.desc : ''), detail: (c.aantal | 0) > 1 ? (c.aantal | 0) + '× gezien' : '' });
    });
    arr(vs.dtc).forEach(function (c) {
      if (!uit.some(function (u) { return u.tekst.indexOf(String(c)) === 0; })) uit.push({ ernst: 'rood', tekst: String(c), detail: '' });
    });
    if (vk.mode06) arr(vk.mode06.gezakt).forEach(function (g) { uit.push({ ernst: 'oranje', tekst: 'Mode 06 gezakt: ' + g, detail: '' }); });
    var h = vs.health && typeof vs.health === 'object' ? vs.health : {};
    Object.keys(h).slice(0, 12).forEach(function (p) {
      uit.push({ ernst: 'oranje', tekst: 'Sensor ' + p + ': ' + (GEZOND[h[p]] || String(h[p])), detail: '' });
    });
    return uit;
  }

  // ── tekenen ────────────────────────────────────────────────────────
  function datum(s) {
    var d = s ? new Date(s) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function kaart(titel, inhoud, cls) { return '<section class="ew-kaart' + (cls ? ' ' + cls : '') + '"><h4>' + esc(titel) + '</h4>' + inhoud + '</section>'; }
  function leeg(t) { return '<div class="ew-leeg">' + esc(t) + '</div>'; }

  function html(vs, meta, O, plan) {
    vs = vs || null;
    if (!vs) {
      return '<div class="ew"><section class="ew-kaart ew-breed"><h4>Expertwerkplek</h4>' +
        leeg('Nog geen auto. Verbind hierboven met de meekijk-code van de klant; dan staan hier de auto, de afwijkingen, wat er al gedaan is en de procedures voor deze auto.') + '</section></div>';
    }
    var vk = vs.voorkennis || {}, v = vs.veh || {};
    // 1. de auto
    var rij = function (k, w) { return w ? '<div class="ew-rij"><span>' + esc(k) + '</span><b>' + esc(w) + '</b></div>' : ''; };
    var auto = '<div class="ew-auto">' + esc(((v.merk || '') + ' ' + (v.model || '')).trim() || (meta && meta.vehicle) || 'Voertuig onbekend') + '</div>' +
      rij('Bouwjaar', v.year) + rij('Brandstof', v.brandstof) + rij('Motor', v.motor) + rij('Fabrikantcode', v.wmi) +
      rij('Sensoren', (arr(vs.pids).length || 0) + ' ondersteund · ' + (arr(vs.active).length || 0) + ' actief') +
      rij('Leessnelheid', getal(vs.rps) === null ? '' : '~' + getal(vs.rps) + ' per seconde') +
      rij('Gedeeld door', meta ? (meta.ownerLabel || meta.owner || '') : '') +
      (vs.demo ? '<div class="ew-let">⚠ De klant draait demo-data — geen echte auto.</div>' : '') +
      (vk.let_op ? '<div class="ew-let">⚠ ' + esc(vk.let_op) + '</div>' : '');
    // 2. wat nu afwijkt
    var af = afwijkingen(vs), kansen = arr(vk.kansen);
    var afHtml = (af.length ? '<ul class="ew-lijst">' + af.map(function (a) {
      return '<li class="ew-' + a.ernst + '">' + esc(a.tekst) + (a.detail ? '<small>' + esc(a.detail) + '</small>' : '') + '</li>';
    }).join('') + '</ul>' : leeg('Geen foutcodes, gezakte zelftests of zieke sensoren gemeld.')) +
      (kansen.length ? '<div class="ew-sub">Eerst kijken naar</div><ol class="ew-lijst">' + kansen.map(function (k) {
        return '<li><b>' + esc(k.naam) + '</b>' + (k.bekend ? ' <span class="ew-tag">bekend bij ' + esc(vk.merk || 'dit merk') + '</span>' : '') +
          '<small>' + arr(k.redenen).map(esc).join(' · ') + '</small></li>';
      }).join('') + '</ol>' : '');
    // 3. al gedaan: rapporten, mode 06, waarnemingen, codegeschiedenis
    var rap = arr(vk.rapporten), wn = arr(vk.waargenomen), hist = arr(vk.foutcodes).filter(function (c) { return c && !c.nu; });
    var gedaan = '';
    if (rap.length) gedaan += '<div class="ew-sub">Rapporten</div><ul class="ew-lijst">' + rap.map(function (r) {
      var id = String(r.id || '');
      return '<li>' + esc(r.title || r.type) + '<small>' + esc(datum(r.ts)) + '</small>' +
        (/^sr\d+_\d+$/.test(id) ? '<button class="rem-btn" onclick="PLRemote.reqRapport(\'' + id + '\')">Lees</button>' : '') + '</li>';
    }).join('') + '</ul>';
    if (vk.mode06) gedaan += '<div class="ew-sub">Zelftests (mode 06)</div><ul class="ew-lijst"><li>' + esc(vk.mode06.tekst) + '<small>' + esc(datum(vk.mode06.t)) + '</small></li></ul>';
    if (wn.length) gedaan += '<div class="ew-sub">Waargenomen op deze auto</div><ul class="ew-lijst">' + wn.map(function (w) {
      return '<li>' + esc(w.naam) + ': <b>' + esc(w.status) + '</b><small>' + esc(datum(w.wanneer)) + '</small></li>';
    }).join('') + '</ul>';
    if (hist.length) gedaan += '<div class="ew-sub">Eerder gezien</div><ul class="ew-lijst">' + hist.map(function (c) {
      return '<li>' + esc(c.code) + (c.desc ? ' — ' + esc(c.desc) : '') + '<small>' + ((c.aantal | 0) ? (c.aantal | 0) + '× · ' : '') + esc(datum(c.laatste || c.eerste)) + '</small></li>';
    }).join('') + '</ul>';
    if (!gedaan) gedaan = leeg('Op deze auto is nog niets uitgelezen of bewaard.');
    // 4. procedures
    var pr = procedures(vk, O, plan);
    var BRON = { kans: 'verdenking', bekend: 'bekend zwak punt', code: 'foutcode' };
    var prHtml = pr.length ? pr.map(function (p, i) {
      return '<details class="ew-proc"' + (i < 2 ? ' open' : '') + '><summary><span class="ew-tag ew-' + p.bron + '">' + BRON[p.bron] + '</span>' + esc(p.titel) + '</summary>' +
        (p.waarom ? '<div class="ew-waarom">' + esc(p.waarom) + '</div>' : '') +
        '<ol>' + p.stappen.map(function (s) {
          return '<li class="ew-st-' + s.soort + '">' + (s.soort === 'meten' ? '<b>In PidLane:</b> ' : '') + esc(s.tekst) +
            (s.toelichting ? '<small>' + esc(s.toelichting) + '</small>' : '') + '</li>';
        }).join('') + '</ol></details>';
    }).join('') : leeg('Geen bekende problemen of foutcodes voor deze auto — begin met de AI-analyse onderaan.');

    return '<div class="ew">' +
      '<div class="ew-kol">' + kaart('Auto', auto) + kaart('Wijkt nu af', afHtml, af.length ? 'ew-alarm' : '') + '</div>' +
      '<div class="ew-kol">' + kaart('Al gedaan en gevonden', gedaan) + '</div>' +
      '<div class="ew-kol">' + kaart('Procedures voor deze auto', prHtml) + '</div>' +
      '</div>';
  }

  // ── de koppeling met het meekijkvenster ────────────────────────────
  var _st = { garageGezet: false };
  function el(id) { return document.getElementById(id); }
  function knopBij() {
    var k = el('remWerkKnop');
    if (k) { k.textContent = standTekst(stand(), isLaptop(omgeving())); k.setAttribute('aria-pressed', String(actief())); }
  }
  function isKlant() {
    try { return !!(window.PLKlant && PLKlant.isKlant()); }
    catch (e) { console.warn('PLExpertWerk: rol onbekend', e); return false; }
  }
  /* Vanuit PLRemote: bij elke vstate en meta, en bij het openen van het
     venster (vs mag dan null zijn). */
  function toon(vs, meta) {
    var ov = el('remExpertOv'), doel = el('remWerkplek');
    knopBij();
    if (!ov || !doel) return false;
    var aan = actief();
    ov.classList.toggle('pl-expertwerk', aan);
    if (!aan) { doel.innerHTML = ''; return false; }
    doel.innerHTML = html(vs, meta, window.PLOnderzoek || null, typeof window.dtcPlan === 'function' ? window.dtcPlan : null);
    if (!_st.garageGezet && !isKlant()) {
      _st.garageGezet = true;
      try { if (window.PLNav && !PLNav.garage()) PLNav.zetGarage(true); }
      catch (e) { console.warn('PLExpertWerk: garagemodus niet aangezet', e); }
    }
    return true;
  }
  function wissel() {
    zetStand(volgendeStand(stand()));
    var S = (window.PLRemote && PLRemote._staat) ? PLRemote._staat() : {};
    toon(S.vstate || null, S.expMeta || null);
  }
  /* Na het inloggen: op een laptop gaat een expert meteen naar het
     meekijkvenster. Niet voor een klant, en niet als er al een sessie loopt. */
  function naLogin() {
    if (!actief() || isKlant()) return false;
    try { if (window.PLRemote) { PLRemote.openExpert(); return true; } }
    catch (e) { console.warn('PLExpertWerk: meekijkvenster opent niet na het inloggen', e); }
    return false;
  }

  window.PLExpertWerk = {
    SLEUTEL: SLEUTEL, STANDEN: STANDEN, LAPTOP_BREED: LAPTOP_BREED,
    isLaptop: isLaptop, actiefVoor: actiefVoor, standTekst: standTekst, volgendeStand: volgendeStand,
    procedures: procedures, afwijkingen: afwijkingen, html: html,
    omgeving: omgeving, stand: stand, zetStand: zetStand, actief: actief,
    toon: toon, wissel: wissel, naLogin: naLogin
  };
})();
