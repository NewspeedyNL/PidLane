/* ═══════════════════════════════════════════════════════════════════
   pidlane-waakronde.js — PLWaak: stille controle van wat je NIET volgt
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT DE VOORGANGER VERVANGT

   Rondgang draaide categorieën door het hoofdscherm: elke 100 seconden
   een andere groep sensoren, allemaal tegelijk in beeld. Twee dingen
   klopten daar niet aan.

   Ten eerste: het kaapte het scherm. Je eigen selectie — de sensoren
   waar je juist naar wilde kijken — verdween telkens onder een wisselend
   gezelschap. Rust was er niet bij.

   Ten tweede, en dat is de echte fout: het toonde DATA terwijl je
   AANDACHT nodig hebt. Veertig sensoren langs zien komen betekent niet
   dat je iets ziet. Je kunt niet veertig genormaliseerde lijnen lezen en
   tegelijk rijden. De vraag is nooit "wat doen al mijn sensoren", de
   vraag is "is er iets dat ik zou moeten weten".

   Waakronde beantwoordt die vraag in plaats van de eerste.

   HOE HET WERKT

   Je hoofdscherm blijft precies zoals het is. Trends, Getallen of
   Puntjes: jouw keuze, jouw sensoren, ongestoord. Waakronde is geen
   weergave maar een schakelaar die ernaast staat en er iets bij zet.

   Op de achtergrond loopt een trage ronde langs alle sensoren die je
   NIET hebt aangevinkt. Drie tegelijk, elke twaalf seconden een groepje.
   Hij claimt het busslot netjes voor een fractie van een seconde, leest,
   en geeft het weer terug — hetzelfde patroon als de fabrikant-probe en
   vlFullSurvey(). Een volledige ronde over pakweg dertig sensoren duurt
   zo een kleine twee minuten. Dat is traag met opzet: het mag de
   verversing van jouw eigen sensoren niet merkbaar raken.

   Elke gelezen sensor krijgt een oordeel, geen grafiek:

     ✓ binnen bereik      — niets aan de hand
     ! buiten bereik      — waarde valt buiten PID_HARD_LIMITS of buiten
                            het min/max van de definitie
     · geen antwoord      — sensor meldt zich niet

   WAT JE ZIET

   Eén smalle strook boven het raster. Een rij stipjes, één per sensor,
   die tijdens de ronde inkleurt. De stip die nu gelezen wordt pulseert
   zachtjes. Daaronder één regel met wat er op dit moment onder de naald
   ligt. Rechtsboven het aantal bevindingen.

   Geen grafiek, geen cijferbrij, geen scherm dat zich opdringt. Je kunt
   er de hele rit langs kijken zonder dat het je afleidt — en op het
   moment dat er een stip oranje wordt, weet je precies waar te kijken.
   Tik op de kop en je krijgt alleen de bevindingen, niets anders.

   WAT HET BEWUST NIET DOET

   Bevroren-waardedetectie en sensoruitval zitten al in PLWatch (Laag B)
   en PLMon (Laag A) en die kijken naar veel meer dan één losse meting.
   Waakronde dupliceert dat niet. Hij doet het enige wat die twee niet
   kunnen: hij kijkt naar sensoren die helemaal niet gepollt worden, en
   dus ook geen historie hebben om op te oordelen.

   Bij busdruk slaat hij een ronde over. Bij een druk busslot wacht hij
   tot de volgende tik. Hij dringt nooit voor.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const RONDE_MS   = 12000;   // tijd tussen twee groepjes
  const BATCH      = 3;       // sensoren per groepje
  const PAUZE_MS   = 45000;   // rust tussen twee volledige rondes
  const LEES_MS    = 1800;    // time-out per sensor
  const TOON_MS    = 4000;    // hoe lang een aangetikte stip in beeld blijft

  const STAAT = {
    leeg:  { kleur: 'rgba(255,255,255,.09)', naam: 'nog niet gelezen' },
    ok:    { kleur: '#4f9c5a',               naam: 'binnen bereik' },
    let:   { kleur: '#e0972f',               naam: 'buiten bereik' },
    stil:  { kleur: 'rgba(255,255,255,.22)', naam: 'geen antwoord' }
  };

  let _aan = false;
  let _timer = null, _pols = null;
  let _lijst = [];            // [{pid, staat, waarde, tijd}]
  let _cursor = 0;
  let _ronde = 0;
  let _bezig = null;          // pid die nu gelezen wordt
  let _open = false;          // bevindingenlijst uitgeklapt
  let _pin = null;            // aangetikte stip
  let _rust = '';             // waarom er nu niet gemeten wordt
  let _pinTot = 0;

  /* ═══════════════════ HULP ═══════════════════ */

  function def(pid) { try { return getPidDef(pid) || null; } catch (e) { return null; } }
  function naam(pid) { const d = def(pid); return (d && d.name) || pid; }
  function eenheid(pid) { const d = def(pid); return (d && d.unit) || ''; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toonWaarde(v, pid) {
    if (v === undefined || v === null || !isFinite(v)) return '—';
    try { return (typeof fv === 'function') ? fv(v, pid) : String(v); } catch (e) { return String(v); }
  }

  // Kandidaten: alles wat de auto levert en wat NIET al gepollt wordt.
  // Tekst-PIDs (brandstoftype, OBD-norm) vallen af: daar valt niets aan te
  // bewaken, die waarde verandert nooit.
  function kandidaten() {
    const uit = [];
    try {
      const bron = (typeof supportedPIDs !== 'undefined' && supportedPIDs.size)
        ? [...supportedPIDs]
        : (window.discoveredPIDDefs || []).map(d => d.pid);
      bron.forEach(pid => {
        try { if (activePIDs.has(pid)) return; } catch (e) {}
        try { if (typeof pidIsTekst === 'function' && pidIsTekst(pid)) return; } catch (e) {}
        try { if (typeof pidGate === 'function' && !pidGate(pid, 'kiesbaar')) return; } catch (e) {}
        if (!def(pid)) return;
        uit.push(pid);
      });
    } catch (e) {}
    return uit;
  }

  // Heeft de ECU überhaupt geantwoord? Deze vraag moet APART van het parsen
  // beantwoord worden, en wel hierom: parsePID() → validateAndSmooth() geeft
  // ook `null` terug wanneer de waarde buiten PID_HARD_LIMITS valt. Zou ik
  // alleen op null testen, dan verschijnt een sensor die 300 °C koelwater
  // meldt — een serieuze bevinding — als "geen antwoord". Precies verkeerd om.
  function antwoordHerkend(pid, raw) {
    if (!raw) return false;
    const s = String(raw);
    if (/NO DATA|ERROR|UNABLE|STOPPED|SEARCHING|\?/i.test(s)) return false;
    try {
      const hdr = ((parseInt(pid.slice(0, 2), 16) + 0x40).toString(16).toUpperCase().padStart(2, '0'))
                  + pid.slice(2).toUpperCase();
      return s.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().indexOf(hdr) >= 0;
    } catch (e) { return false; }
  }

  // Oordeel over één meting. Bewust smal: stilte, fysiek onmogelijk, of
  // buiten het bereik van de definitie. Alles wat historie nodig heeft
  // (bevroren, wegvallend, driftend) is het werk van PLWatch en PLMon, die
  // daar veel beter voor uitgerust zijn.
  function beoordeel(pid, raw) {
    if (!antwoordHerkend(pid, raw)) return { staat: 'stil', v: undefined, reden: 'geen antwoord' };

    let v = null;
    try { v = (typeof parsePID === 'function') ? parsePID(pid, raw) : null; } catch (e) { v = null; }

    // Antwoord kwam binnen maar overleefde de validatie niet: dat kan alleen
    // doordat laag 1 hem als fysiek onmogelijk afkeurde. Dat is een van de
    // sterkste bevindingen die er zijn.
    if (v === null || v === undefined || !isFinite(v)) {
      return { staat: 'let', v: undefined, reden: 'buiten fysiek bereik' };
    }

    const d = def(pid);
    if (d && typeof d.min === 'number' && typeof d.max === 'number' && d.max > d.min) {
      // Marge van 2 %: de grenzen in de tabel zijn weergavebereiken, geen
      // alarmdrempels. Precies op de rand is geen bevinding.
      const marge = (d.max - d.min) * 0.02;
      if (v < d.min - marge) return { staat: 'let', v: v, reden: 'onder verwacht bereik' };
      if (v > d.max + marge) return { staat: 'let', v: v, reden: 'boven verwacht bereik' };
    }
    return { staat: 'ok', v: v, reden: '' };
  }

  /* ═══════════════════ DE RONDE ═══════════════════ */

  function nieuweRonde() {
    const k = kandidaten();
    _lijst = k.map(pid => ({ pid, staat: 'leeg', waarde: undefined, reden: '', tijd: 0 }));
    _cursor = 0;
    _ronde++;
    return _lijst.length;
  }

  function busDrukt() {
    try {
      const s = PLLoad && PLLoad.staat ? PLLoad.staat() : null;
      return !!(s && (s.code === 'druk' || s.code === 'zwaar' || s.code === 'dood'));
    } catch (e) { return false; }
  }

  async function tik() {
    if (!_aan) return;
    if (demoMode)      { _rust = 'demo';    plan(RONDE_MS); teken(); return; }
    if (!connected)    { _rust = 'losgekoppeld'; plan(RONDE_MS); teken(); return; }

    // Ronde af? Even rust, dan opnieuw. Zo blijft het een RONDE en geen
    // permanent geroffel op de bus.
    if (_cursor >= _lijst.length) {
      const n = nieuweRonde();
      _rust = n ? 'pauze' : 'niets';
      teken();
      plan(n ? PAUZE_MS : RONDE_MS * 4);
      return;
    }

    // Nooit voordringen: bij druk of een bezet slot gewoon de volgende tik.
    if (busDrukt()) { _rust = 'druk'; plan(RONDE_MS); teken(); return; }
    let tok = 0;
    try { tok = (window.PLBus && PLBus.claim) ? PLBus.claim('waakronde') : 0; } catch (e) { tok = 0; }
    if (!tok) { _rust = 'bezet'; plan(RONDE_MS); teken(); return; }
    _rust = '';

    try {
      const groep = _lijst.slice(_cursor, _cursor + BATCH);
      for (const rij of groep) {
        if (!_aan || !connected) break;
        _bezig = rij.pid; teken();
        let raw = '';
        try {
          const cmd = (typeof pidCmd === 'function') ? pidCmd(rij.pid, true) : ('01' + rij.pid.slice(2) + '1');
          raw = await sendCmd(cmd, LEES_MS);
        } catch (e) { raw = ''; }
        const o = beoordeel(rij.pid, raw);
        rij.waarde = o.v;
        rij.staat  = o.staat;
        rij.reden  = o.reden;
        rij.tijd   = Date.now();
        try { await delay(40); } catch (e) {}
      }
      _cursor += BATCH;
      _bezig = null;
    } finally {
      try { if (window.PLBus && PLBus.release) PLBus.release(tok); } catch (e) {}
    }

    teken();
    plan(RONDE_MS);
  }

  function plan(ms) {
    if (_timer) clearTimeout(_timer);
    if (!_aan) return;
    _timer = setTimeout(tik, ms);
  }

  /* ═══════════════════ WEERGAVE ═══════════════════ */

  function strook() {
    let s = document.getElementById('wkStrook');
    if (s) return s;
    s = document.createElement('div');
    s.id = 'wkStrook';
    s.innerHTML =
      '<div id="wkKop">' +
        '<span id="wkPols"></span>' +
        '<span id="wkTitel">Waakronde</span>' +
        '<span id="wkTel"></span>' +
        '<span id="wkChev">\u203A</span>' +
      '</div>' +
      '<div id="wkStippen"></div>' +
      '<div id="wkRegel"></div>' +
      '<div id="wkLijst"></div>';
    const g = document.getElementById('gGrid');
    if (g && g.parentNode) g.parentNode.insertBefore(s, g);
    else document.body.appendChild(s);
    s.querySelector('#wkKop').onclick = function () { _open = !_open; teken(); };
    return s;
  }
  function strookWeg() { const s = document.getElementById('wkStrook'); if (s) s.remove(); }

  function teken() {
    if (!_aan) return;
    const s = strook();
    const gelezen = _lijst.filter(r => r.staat !== 'leeg').length;
    const bev = _lijst.filter(r => r.staat === 'let');

    const tel = s.querySelector('#wkTel');
    if (tel) {
      tel.innerHTML = '<b>' + gelezen + '</b>/' + _lijst.length +
        (bev.length ? ' <em>' + bev.length + '</em>' : '');
      tel.className = bev.length ? 'wkBev' : '';
    }
    const pols = s.querySelector('#wkPols');
    if (pols) pols.classList.toggle('wkStil', !!_rust);
    const chev = s.querySelector('#wkChev');
    if (chev) chev.style.transform = _open ? 'rotate(90deg)' : '';

    // Stippen
    const st = s.querySelector('#wkStippen');
    if (st) {
      st.innerHTML = _lijst.map(function (r, i) {
        const k = (STAAT[r.staat] || STAAT.leeg).kleur;
        const bezig = (r.pid === _bezig) ? ' wkNu' : '';
        return '<i class="wkS' + bezig + '" data-i="' + i + '" style="background:' + k + '"' +
               ' title="' + esc(naam(r.pid)) + '"></i>';
      }).join('');
      st.onclick = function (e) {
        const i = e.target && e.target.dataset ? +e.target.dataset.i : -1;
        if (i >= 0 && _lijst[i]) { _pin = _lijst[i]; _pinTot = Date.now() + TOON_MS; teken(); }
      };
    }

    // Statusregel: aangetikte stip wint, anders wat er nu gelezen wordt,
    // anders de laatste bevinding, anders rust.
    const reg = s.querySelector('#wkRegel');
    if (reg) {
      let tekst = '', klasse = '';
      if (_pin && Date.now() < _pinTot) {
        tekst = naam(_pin.pid) + ' · ' + toonWaarde(_pin.waarde, _pin.pid) + ' ' + eenheid(_pin.pid) +
                ' · ' + (_pin.reden || (STAAT[_pin.staat] || STAAT.leeg).naam);
        klasse = _pin.staat === 'let' ? 'wkLet' : '';
      } else if (_bezig) {
        tekst = 'meet ' + naam(_bezig) + '\u2026';
      } else if (bev.length) {
        const l = bev[bev.length - 1];
        tekst = l ? naam(l.pid) + ' · ' + toonWaarde(l.waarde, l.pid) + ' ' + eenheid(l.pid) +
                    ' · ' + (l.reden || 'buiten bereik') : '';
        klasse = 'wkLet';
      } else if (_rust) {
        // Eerder stond hier altijd "wacht op ruimte op de bus". Dat was in de
        // meeste gevallen gelogen: in demomodus is er geen bus om op te
        // wachten, en zonder verbinding evenmin. Een melding die de verkeerde
        // oorzaak noemt kost meer tijd dan geen melding.
        const R = {
          demo:         'niet beschikbaar in demomodus',
          losgekoppeld: 'geen verbinding met het voertuig',
          druk:         'bus is druk \u2014 ronde overgeslagen',
          bezet:        'wacht op het busslot\u2026',
          pauze:        'ronde ' + (_ronde - 1) + ' klaar \u2014 niets bijzonders',
          niets:        'alle sensoren staan al in beeld'
        };
        tekst = R[_rust] || '';
      } else if (gelezen >= _lijst.length && _lijst.length) {
        tekst = 'ronde ' + _ronde + ' klaar \u2014 niets bijzonders';
      } else {
        tekst = _lijst.length ? 'ronde start\u2026' : 'alle sensoren staan al in beeld';
      }
      reg.textContent = tekst;
      reg.className = klasse;
    }

    // Bevindingen, alleen als je erom vraagt
    const lst = s.querySelector('#wkLijst');
    if (lst) {
      if (!_open) { lst.innerHTML = ''; lst.style.display = 'none'; }
      else {
        lst.style.display = '';
        if (!bev.length) {
          lst.innerHTML = '<div class="wkGeen">Geen bevindingen in ronde ' + _ronde + '.</div>';
        } else {
          lst.innerHTML = bev.map(function (r) {
            return '<div class="wkRij"><span>' + esc(naam(r.pid)) + '</span>' +
                   '<b>' + esc(toonWaarde(r.waarde, r.pid)) + '</b>' +
                   '<u>' + esc(eenheid(r.pid)) + '</u>' +
                   '<em>' + esc(r.reden || '') + '</em></div>';
          }).join('');
        }
      }
    }
  }

  /* ═══════════════════ AAN / UIT ═══════════════════ */

  function start() {
    if (_aan) return true;
    _aan = true;
    const n = nieuweRonde();
    strook(); teken();
    if (_pols) clearInterval(_pols);
    _pols = setInterval(teken, 1000);
    try { log('\u25C9 Waakronde aan \u2014 ' + n + ' sensoren buiten je selectie, ' +
              Math.round((n / BATCH) * RONDE_MS / 1000) + 's per ronde', 'ok'); } catch (e) {}
    plan(1500);
    return true;
  }

  function stop() {
    if (!_aan) return;
    _aan = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    if (_pols)  { clearInterval(_pols); _pols = null; }
    _bezig = null; _pin = null;
    strookWeg();
    try { log('\u25CB Waakronde uit', 'info'); } catch (e) {}
  }

  function schakel() {
    if (_aan) stop(); else start();
    const b = document.getElementById('waakBtn');
    if (b) b.classList.toggle('active', _aan);
    try { localStorage.setItem('pl_waak', _aan ? '1' : '0'); } catch (e) {}
    return _aan;
  }
  window.toggleWaakronde = schakel;

  // Selectie gewijzigd? De kandidatenlijst klopt dan niet meer: wat je net
  // hebt aangevinkt hoort niet langer bij "wat je niet volgt". Pas bij de
  // volgende ronde herzien, niet halverwege — anders springen de stippen.
  window.addEventListener('pl:pids-gewijzigd', function () { /* volgende ronde pakt het op */ });

  // Verbinding weg → niets te bewaken.
  try {
    const _oz = window.setConn;
    if (typeof _oz === 'function') {
      window.setConn = function (v) {
        if (!v && _aan) schakel();
        return _oz.apply(this, arguments);
      };
    }
  } catch (e) {}

  window.PLWaak = {
    start: start, stop: stop, schakel: schakel,
    actief: function () { return _aan; },
    lijst: function () { return _lijst.map(function (r) { return { pid: r.pid, staat: r.staat, waarde: r.waarde }; }); },
    bevindingen: function () { return _lijst.filter(function (r) { return r.staat === 'let'; }).map(function (r) { return r.pid; }); },
    _kandidaten: kandidaten,
    _beoordeel: beoordeel
  };
})();
