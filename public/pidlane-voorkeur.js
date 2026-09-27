/* ═══════════════════════════════════════════════════════════════════
   pidlane-voorkeur.js — PLVoorkeur: "Mijn voorkeuren" per klantaccount
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS (27-09-2026)

   De app onthield al van alles, maar per TOESTEL: de weergave in
   pl_pidview, de tekstgrootte in pl_uiscale, de
   favorieten in pl_favorites, de waakronde in pl_waak. Een klant die op
   een andere telefoon of in de browser inlogt, begint daardoor elke keer
   opnieuw. Dit bestand hangt die keuzes aan het account.

   HOE HET WERKT — besluiten van 27-09-2026 met de eigenaar:
     • Vastleggen gebeurt in één scherm, "Mijn voorkeuren". Wat je onderweg
       even omzet, verandert je standaard niet. De knop "Huidige stand
       overnemen" vult het scherm met wat het toestel nu doet.
     • Bij het inloggen wint het account: de standaard wordt toegepast.
     • Alleen voor klantaccounts.
     • De sensorselectie hoort bij het VOERTUIG, niet bij de klant: elke
       auto meldt andere sensoren. Die staat in Mijn voertuigen
       (kp_voertuig.pid_selectie) en gaat aan zodra die auto herkend is.

   EEN SLEUTEL DIE ONTBREEKT BETEKENT: HET TOESTEL BEPAALT. Zo kan een
   klant alleen de tekstgrootte vastleggen zonder dat de rest van zijn
   toestel omgegooid wordt.

   PUUR EN NIET PUUR. schoon(), toepassen(pref, doe) en achtergrond(pref,
   staat) zijn pure functies die een tabel met handelingen krijgen;
   test-voorkeur.js toetst ze zonder DOM. VOORKEUR_SPEC staat ook in
   worker.js (KP_VOORKEUR); de test eist dat die twee gelijk zijn.

   Laadvolgorde: ná pidlane-garage.js (PLGarage) en pidlane-run.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VOORKEUR_SPEC = {
    weergave: { soort: 'keuze', uit: ['full', 'numbers', 'dots', 'slim', 'visueel'] },
    tekst: { soort: 'keuze', uit: ['s', 'm', 'l'] },
    letter: { soort: 'geheel', min: 10, max: 18 },
    waakronde: { soort: 'janee' },
    ritmonitor: { soort: 'janee' },
    bulk: { soort: 'janee' },
    autoVerbinden: { soort: 'janee' },
    favorieten: { soort: 'lijst' },
    start: { soort: 'keuze', uit: ['start', 'live'] },
    foutcodesNaVerbinden: { soort: 'janee' },
    meldingApk: { soort: 'janee' },
    meldingRit: { soort: 'janee' },
    meldingPunten: { soort: 'janee' },
    rapport: { soort: 'keuze', uit: ['kort', 'normaal', 'uitgebreid'] },
    verbruik: { soort: 'keuze', uit: ['l100', 'kml'] },
    adapterType: { soort: 'keuze', uit: ['mxplus', 'elm327', 'ble', 'onbekend'] },
    adapterNaam: { soort: 'tekst' },
    adapterAdres: { soort: 'tekst' },
    scanBekend: { soort: 'keuze', uit: ['vragen', 'overslaan', 'altijd'] },
    samenvatting: { soort: 'janee' },
    oudeData: { soort: 'keuze', uit: ['vragen', 'ja', 'nee'] }
  };

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  /* Alleen wat de spec kent en een geldige waarde heeft. De server keurt
     hetzelfde nog eens; dit is er zodat een kapotte lokale kopie niet
     toegepast wordt. */
  function schoon(p) {
    var uit = {};
    Object.keys(p || {}).forEach(function (k) {
      var d = VOORKEUR_SPEC[k], w = p[k];
      if (!d || w === null || w === undefined || w === '') return;
      if (d.soort === 'keuze' && d.uit.indexOf(w) >= 0) uit[k] = w;
      else if (d.soort === 'janee' && (w === true || w === false)) uit[k] = w;
      else if (d.soort === 'geheel' && Number.isInteger(w) && w >= d.min && w <= d.max) uit[k] = w;
      else if (d.soort === 'tekst' && typeof w === 'string') uit[k] = w;
      else if (d.soort === 'lijst' && Array.isArray(w)) uit[k] = w.filter(function (x) { return /^wc-[a-z0-9-]{1,40}$/.test(String(x)); });
    });
    return uit;
  }

  /* Bij het inloggen: pas toe wat bij het uiterlijk en het toestel hoort.
     `doe` is een tabel met handelingen (in de app de echte functies, in de
     test een opnemer). Geeft de lijst van wat er toegepast is. Wat pas bij
     een verbinding hoort (achtergrondfuncties, foutcodes) staat in
     achtergrond(). Het adres van de adapter wordt alleen gezet als het
     toestel er zelf nog geen heeft: een gekoppelde adapter overschrijven kan
     een werkende verbinding breken. */
  function toepassen(p, doe, toestel) {
    p = schoon(p);
    toestel = toestel || {};
    var gedaan = [];
    var zet = function (sleutel, fn, w) {
      if (!(sleutel in p) || typeof fn !== 'function') return;
      try { fn(w !== undefined ? w : p[sleutel]); gedaan.push(sleutel); }
      catch (e) { console.warn('PLVoorkeur: ' + sleutel + ' niet toegepast', e); }
    };
    zet('tekst', doe.tekst);
    zet('letter', doe.letter);
    zet('weergave', doe.weergave);
    zet('favorieten', doe.favorieten);
    zet('autoVerbinden', doe.autoVerbinden);
    zet('adapterType', doe.adapterType);
    if (p.adapterAdres && !toestel.adapterAdres) zet('adapterAdres', doe.adapter, { adres: p.adapterAdres, naam: p.adapterNaam || '' });
    zet('oudeData', doe.oudeData);
    return gedaan;
  }

  /* Bij een verbinding: welke achtergrondfuncties moeten er aan, gegeven
     wat er nu draait. `staat` = PLRun.staat() → { monitor:{aan}, bulk:{aan},
     waak:{aan} }. Alleen AANzetten: een voorkeur "uit" zet niets uit wat de
     klant zelf net aanzette. */
  function achtergrond(p, staat) {
    p = schoon(p);
    staat = staat || {};
    var uit = [];
    [['waakronde', 'waak'], ['ritmonitor', 'monitor'], ['bulk', 'bulk']].forEach(function (x) {
      var s = staat[x[1]];
      if (p[x[0]] === true && s && !s.aan) uit.push(x[1]);
    });
    return uit;
  }

  function verbruikTekst(l100, eenheid) {
    if (typeof l100 !== 'number' || !isFinite(l100) || l100 <= 0) return '—';
    if (eenheid === 'kml') return (Math.round(1000 / l100) / 10).toLocaleString('nl') + ' km/l';
    return (Math.round(l100 * 10) / 10).toLocaleString('nl') + ' l/100 km';
  }

  function promptRegel(p) {
    p = schoon(p);
    if (p.rapport === 'kort') return '\nRAPPORTVORM (voorkeur van de klant): kort — hoogstens tien regels, alleen wat aandacht vraagt en wat de klant moet doen.';
    if (p.rapport === 'uitgebreid') return '\nRAPPORTVORM (voorkeur van de klant): uitgebreid — licht per bevinding de meetwaarden en de redenering toe.';
    return '';
  }

  // ════════════════════════════════════════════════════════════════
  //  DE APP
  // ════════════════════════════════════════════════════════════════

  var OPSLAG = 'pl_voorkeur';
  var _pref = null, _bron = null;

  function lees(k) { try { return localStorage.getItem(k); } catch (e) { console.warn('PLVoorkeur: ' + k + ' niet leesbaar', e); return null; } }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    catch (e) { console.warn('PLVoorkeur: ' + k + ' niet te schrijven', e); }
  }
  function wie() { try { return String((window.currentUser && window.currentUser.user) || '').toLowerCase(); } catch (e) { return ''; } }
  function isKlant() {
    try { var u = window.currentUser; return !!(u && String(u.role || '').toLowerCase() === 'klant'); }
    catch (e) { return false; }
  }
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLVoorkeur: melding', e); } }

  async function api(actie, data) {
    if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
    var r = await plFetch('/klant/platform', { method: 'POST', json: Object.assign({ actie: actie }, data || {}) });
    var d = {};
    try { d = await r.json(); } catch (e) { throw new Error('Onleesbaar antwoord van de server (' + r.status + ')'); }
    if (!r.ok || !d.ok) throw new Error(d.error || ('Serverfout ' + r.status));
    return d;
  }

  // De echte handelingen bij toepassen().
  var DOE = {
    tekst: function (w) { if (typeof setUiScale === 'function') setUiScale(w); },
    letter: function (w) {
      if (typeof fontSize !== 'function' || typeof currentFont === 'undefined') return;
      fontSize(w - currentFont);
    },
    weergave: function (w) {
      schrijf('pl_pidview', w);
      if (typeof setPidView === 'function') setPidView(w);
    },
    favorieten: function (w) {
      if (typeof favSet !== 'function') return;
      favSet(w.slice());
      try { if (typeof favBarSync === 'function') favBarSync(); } catch (e) { console.warn('PLVoorkeur: favorietenbalk', e); }
      try { document.querySelectorAll('.fav-star').forEach(function (s) { var on = w.indexOf(s.dataset.fav) >= 0; s.classList.toggle('on', on); s.textContent = on ? '★' : '☆'; }); }
      catch (e) { console.warn('PLVoorkeur: sterren', e); }
    },
    autoVerbinden: function (w) { schrijf('pl_autoconn', w ? '1' : null); },
    adapterType: function (w) { schrijf('pl_adaptertype', w); },
    adapter: function (a) { schrijf('spp_address', a.adres); if (a.naam) schrijf('spp_name', a.naam); },
    oudeData: function (w) { window._srUseContext = w === 'ja' ? true : w === 'nee' ? false : null; }
  };

  function toestelNu() {
    var st = {};
    try { st = (window.PLRun && PLRun.staat) ? (PLRun.staat() || {}) : {}; } catch (e) { console.warn('PLVoorkeur: PLRun.staat', e); }
    var favs = [];
    try { favs = (typeof favGet === 'function') ? favGet() : []; } catch (e) { console.warn('PLVoorkeur: favorieten', e); }
    var weergave = null;
    try { weergave = (typeof pidViewMode !== 'undefined') ? pidViewMode : lees('pl_pidview'); } catch (e) { weergave = lees('pl_pidview'); }
    var letter = null;
    try { letter = (typeof currentFont !== 'undefined') ? currentFont : null; } catch (e) { letter = null; }
    return schoon({
      weergave: weergave,
      tekst: lees('pl_uiscale') || 'm',
      letter: letter,
      waakronde: !!(st.waak && st.waak.aan),
      ritmonitor: !!(st.monitor && st.monitor.aan),
      bulk: !!(st.bulk && st.bulk.aan),
      autoVerbinden: lees('pl_autoconn') === '1',
      favorieten: favs,
      adapterType: lees('pl_adaptertype') || null,
      adapterNaam: lees('spp_name') || null,
      adapterAdres: lees('spp_address') || null,
      oudeData: window._srUseContext === true ? 'ja' : window._srUseContext === false ? 'nee' : 'vragen'
    });
  }

  async function laadEnPas() {
    try {
      var d = await api('voorkeuren');
      _pref = schoon(d.voorkeur || {});
      _bron = 'account';
      schrijf(OPSLAG, JSON.stringify({ u: wie(), p: _pref }));
    } catch (e) {
      // Offline: de laatst bekende kopie van DEZE klant, anders niets.
      var k = null;
      try { k = JSON.parse(lees(OPSLAG) || 'null'); } catch (x) { k = null; }
      if (k && k.u === wie()) { _pref = schoon(k.p); _bron = 'kopie'; }
      console.warn('PLVoorkeur: voorkeuren niet opgehaald' + (_pref ? ' — de bewaarde kopie wordt gebruikt' : ''), e);
    }
    if (!_pref) return [];
    var gedaan = toepassen(_pref, DOE, { adapterAdres: lees('spp_address') });
    if (gedaan.length) try { if (typeof log === 'function') log('Voorkeuren uit je account toegepast: ' + gedaan.join(', '), 'info'); } catch (e) { console.warn(e); }
    return gedaan;
  }

  // Na het verbinden: achtergrondfuncties, foutcodes, en eventueel meteen Live.
  function naVerbinden() {
    if (!_pref) return;
    try {
      var st = (window.PLRun && PLRun.staat) ? PLRun.staat() : {};
      achtergrond(_pref, st).forEach(function (id) { try { PLRun.schakel(id); } catch (e) { console.warn('PLVoorkeur: ' + id + ' niet gestart', e); } });
    } catch (e) { console.warn('PLVoorkeur: achtergrondfuncties', e); }
    if (_pref.foutcodesNaVerbinden && window.PLFoutcodes && PLFoutcodes.scan) {
      // Even wachten: de verbindingsflow en de eerste pollronde gaan voor.
      setTimeout(function () { try { PLFoutcodes.scan(); } catch (e) { console.warn('PLVoorkeur: foutcodes na verbinden', e); } }, 8000);
    }
    if (_pref.start === 'live' && typeof openLiveView === 'function') {
      setTimeout(function () { try { openLiveView(); } catch (e) { console.warn('PLVoorkeur: Live openen', e); } }, 1500);
    }
  }

  /* De sensorselectie van een voertuig aanzetten (vanuit PLGarage zodra de
     verbonden auto herkend is). Alleen wat deze auto meldt en de poort
     kiesbaar vindt, net als elke andere manier van toevoegen. */
  function selectieToepassen(pids, naam) {
    if (!Array.isArray(pids) || !pids.length) return 0;
    if (typeof activePIDs === 'undefined' || typeof supportedPIDs === 'undefined') return 0;
    // Eerst bepalen wat er past, dán pas wissen: past er niets (andere auto,
    // andere firmware), dan blijft de huidige selectie staan in plaats van leeg.
    var passend = pids.filter(function (pid) {
      return supportedPIDs.has(pid) && !(typeof pidGate === 'function' && !pidGate(pid, 'kiesbaar'));
    });
    if (!passend.length) return 0;
    var voor = (typeof plSelectieVoor === 'function') ? plSelectieVoor() : null;
    activePIDs.clear();
    try { if (typeof manualPIDs !== 'undefined') manualPIDs.clear(); } catch (e) { console.warn('PLVoorkeur: manualPIDs', e); }
    passend.forEach(function (pid) {
      activePIDs.add(pid);
      try { if (typeof manualPIDs !== 'undefined') manualPIDs.add(pid); } catch (e) { console.warn(e); }
    });
    var n = passend.length;
    try { if (voor && typeof plSelectieMeld === 'function') plSelectieMeld(voor, 'de vaste selectie van ' + (naam || 'dit voertuig')); } catch (e) { console.warn(e); }
    try { if (typeof buildPIDList === 'function') buildPIDList(); if (typeof renderGauges === 'function') renderGauges(); if (typeof rebuildGSel === 'function') rebuildGSel(); }
    catch (e) { console.warn('PLVoorkeur: weergave na selectie', e); }
    melding('🎛️ ' + n + ' sensoren van ' + (naam || 'je voertuig') + ' aangezet');
    return n;
  }

  // ── Het scherm ─────────────────────────────────────────────────────
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var _form = null;

  var LABELS = {
    weergave: { full: 'Trends', numbers: 'Getallen', dots: 'Puntjes', slim: 'Slim', visueel: 'Visueel' },
    tekst: { s: 'Klein', m: 'Normaal', l: 'Groot' },
    start: { start: 'Startscherm', live: 'Meteen Live' },
    rapport: { kort: 'Kort', normaal: 'Normaal', uitgebreid: 'Uitgebreid' },
    verbruik: { l100: 'l/100 km', kml: 'km/l' },
    adapterType: { mxplus: 'OBDLink MX+', elm327: 'ELM327 (Bluetooth)', ble: 'Bluetooth LE', onbekend: 'Weet ik niet' },
    scanBekend: { vragen: 'Vragen', overslaan: 'Overslaan (snel)', altijd: 'Altijd scannen' },
    oudeData: { vragen: 'Vragen', ja: 'Ja, altijd', nee: 'Nee, alleen deze meting' }
  };

  function keuzeRij(k, titel, uitleg) {
    var w = _form[k];
    return '<div class="vk-rij"><div class="vk-t">' + titel + '</div>' + (uitleg ? '<div class="vk-u">' + uitleg + '</div>' : '') +
      '<div class="vk-kn">' + ['<button class="vk-b' + (w === undefined ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'' + k + '\',null)">Geen voorkeur</button>']
        .concat(VOORKEUR_SPEC[k].uit.map(function (o) {
          return '<button class="vk-b' + (w === o ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'' + k + '\',\'' + o + '\')">' + esc((LABELS[k] || {})[o] || o) + '</button>';
        })).join('') + '</div></div>';
  }
  function janeeRij(k, titel, uitleg) {
    var w = _form[k];
    return '<div class="vk-rij"><div class="vk-t">' + titel + '</div>' + (uitleg ? '<div class="vk-u">' + uitleg + '</div>' : '') +
      '<div class="vk-kn"><button class="vk-b' + (w === undefined ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'' + k + '\',null)">Geen voorkeur</button>' +
      '<button class="vk-b' + (w === true ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'' + k + '\',true)">Aan</button>' +
      '<button class="vk-b' + (w === false ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'' + k + '\',false)">Uit</button></div></div>';
  }

  var CSS =
    '#plVkOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plVkOv .vk-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f)}' +
    '#plVkOv .vk-kop{display:flex;align-items:center;gap:9px} #plVkOv .vk-titel{font:800 16px var(--f);color:var(--tx)}' +
    '#plVkOv .vk-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
    '#plVkOv .vk-sub{font-size:12px;color:var(--tx3);margin:2px 0 12px}' +
    '#plVkOv .vk-blok{background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:10px 12px;margin-bottom:10px}' +
    '#plVkOv .vk-bh{font:800 13px var(--f);color:var(--tx);margin-bottom:4px}' +
    '#plVkOv .vk-rij{padding:8px 0;border-top:1px solid var(--bd)} #plVkOv .vk-rij:first-of-type{border-top:0}' +
    '#plVkOv .vk-t{font:700 12.5px var(--f);color:var(--tx)} #plVkOv .vk-u{font-size:11px;color:var(--tx3);margin-top:2px}' +
    '#plVkOv .vk-kn{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}' +
    '#plVkOv .vk-b{padding:6px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font:600 12px var(--f);cursor:pointer}' +
    '#plVkOv .vk-b.aan{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plVkOv .vk-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
    '#plVkOv .vk-k{flex:1 1 140px;padding:11px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
    '#plVkOv .vk-k.hoofd{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plVkOv .vk-k:disabled{opacity:.45;cursor:not-allowed}' +
    '#plVkOv .vk-melding{font-size:12px;padding:9px 11px;border-radius:9px;margin-bottom:10px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.45);color:var(--tx2)}';

  function open() {
    if (!isKlant()) { melding('Voorkeuren zijn er voor klantaccounts'); return; }
    if (!document.getElementById('plVkCss')) { var s = document.createElement('style'); s.id = 'plVkCss'; s.textContent = CSS; document.head.appendChild(s); }
    var ov = document.getElementById('plVkOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plVkOv';
      ov.innerHTML = '<div class="vk-doos"><div class="vk-kop"><div class="vk-titel">⚙️ Mijn voorkeuren</div>' +
        '<button class="vk-x" aria-label="Sluiten" onclick="PLVoorkeur.sluit()">✕</button></div>' +
        '<div class="vk-sub">Wat de app standaard doet als je inlogt — op elk toestel en in de browser. Bij "Geen voorkeur" verandert de app niets aan hoe dit toestel nu staat.</div>' +
        '<div id="plVkBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    _form = Object.assign({}, _pref || {});
    ov.style.display = 'flex';
    teken();
  }
  function sluit() { var ov = document.getElementById('plVkOv'); if (ov) ov.style.display = 'none'; }

  function teken() {
    var b = document.getElementById('plVkBody');
    if (!b || !_form) return;
    var v = (window.PLGarage && PLGarage.actief) ? PLGarage.actief() : null;
    var nPids = 0;
    try { nPids = (typeof activePIDs !== 'undefined') ? activePIDs.size : 0; } catch (e) { nPids = 0; }
    var favs = (_form.favorieten || []).map(function (id) {
      var el = document.getElementById(id);
      return (el && (el.querySelector('.choice-title') || {}).textContent) || id;
    });
    b.innerHTML =
      (_bron === 'kopie' ? '<div class="vk-melding">Offline — je ziet de laatst bewaarde voorkeuren.</div>' : '') +
      '<div class="vk-knoppen" style="margin:0 0 10px"><button class="vk-k" onclick="PLVoorkeur._overnemen()">📥 Huidige stand overnemen</button></div>' +
      '<div class="vk-blok"><div class="vk-bh">Weergave</div>' +
        keuzeRij('weergave', 'Live-weergave bij het openen') + keuzeRij('tekst', 'Tekstgrootte') +
        '<div class="vk-rij"><div class="vk-t">Lettergrootte</div><div class="vk-kn">' +
          '<button class="vk-b' + (_form.letter === undefined ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'letter\',null)">Geen voorkeur</button>' +
          [11, 13, 15, 17].map(function (n) { return '<button class="vk-b' + (_form.letter === n ? ' aan' : '') + '" onclick="PLVoorkeur._zet(\'letter\',' + n + ')">' + n + '</button>'; }).join('') +
        '</div></div>' +
        keuzeRij('verbruik', 'Verbruik tonen als') + '</div>' +
      '<div class="vk-blok"><div class="vk-bh">Na het inloggen en verbinden</div>' +
        keuzeRij('start', 'Waar je landt na het verbinden') +
        janeeRij('autoVerbinden', 'Automatisch opnieuw verbinden', 'Met de laatst gebruikte adapter, zodra de app opent.') +
        janeeRij('foutcodesNaVerbinden', 'Foutcodes uitlezen na verbinden', 'Leest stil uit; codes komen als open punt bij je voertuig.') +
        janeeRij('waakronde', 'Waakronde standaard aan') + janeeRij('ritmonitor', 'Rit-monitor standaard aan') + janeeRij('bulk', 'Bulk-recorder standaard aan') +
        '<div class="vk-rij"><div class="vk-t">Favorieten op het startscherm</div><div class="vk-u">' +
          (_form.favorieten ? (favs.length ? esc(favs.join(', ')) : 'geen') : 'geen voorkeur') +
          ' — kies ze met het ☆ op de kaarten en druk dan op "Huidige stand overnemen".</div></div>' +
      '</div>' +
      '<div class="vk-blok"><div class="vk-bh">Adapter en snelverbinden</div>' +
        keuzeRij('adapterType', 'Mijn adapter') +
        '<div class="vk-rij"><div class="vk-t">Vaste adapter</div><div class="vk-u">' + (_form.adapterNaam || _form.adapterAdres ? esc(_form.adapterNaam || '') + ' ' + esc(_form.adapterAdres || '') : 'niet vastgelegd') +
          ' — "Huidige stand overnemen" pakt de laatst verbonden adapter. Op een toestel met een eigen gekoppelde adapter blijft die staan.</div></div>' +
        keuzeRij('scanBekend', 'Bekende auto: sensorscan', 'Bij een auto die al eerder verbonden is: de halve minuut sensorcontrole overslaan, altijd doen of vragen.') +
        janeeRij('samenvatting', 'Samenvatting na verbinden tonen', 'Uit = meteen door, zonder "Klaar voor gebruik".') +
      '</div>' +
      '<div class="vk-blok"><div class="vk-bh">Analyse en meldingen</div>' +
        keuzeRij('oudeData', 'Eerdere rapporten meenemen in een analyse', 'Rapporten van deze sessie én de laatste rapporten van je actieve voertuig.') +
        keuzeRij('rapport', 'AI-rapport') +
        janeeRij('meldingApk', 'Melding APK en onderhoud') + janeeRij('meldingRit', 'Melding na een vastgelegde rit') + janeeRij('meldingPunten', 'Melding bij een nieuw open punt') +
      '</div>' +
      '<div class="vk-blok"><div class="vk-bh">Sensoren per voertuig</div><div class="vk-u">' +
        (v ? 'De sensoren die nu aan staan (' + nPids + ') vastleggen voor <b>' + esc(v.naam || v.merk || 'je voertuig') + '</b>. Ze gaan dan aan zodra deze auto verbonden en herkend is.' +
          (Array.isArray(v.pid_selectie) && v.pid_selectie.length ? ' Nu vastgelegd: ' + v.pid_selectie.length + ' sensoren.' : '')
           : 'Kies eerst een actief voertuig in Mijn voertuigen.') + '</div>' +
        '<div class="vk-knoppen"><button class="vk-k" ' + (v && nPids ? '' : 'disabled') + ' onclick="PLVoorkeur._selectieVast()">🎛️ Vastleggen</button>' +
        (v && Array.isArray(v.pid_selectie) && v.pid_selectie.length ? '<button class="vk-k" onclick="PLVoorkeur._selectieWeg()">Weghalen</button>' : '') + '</div></div>' +
      '<div class="vk-knoppen"><button class="vk-k hoofd" onclick="PLVoorkeur._bewaar()">Bewaren en toepassen</button><button class="vk-k" onclick="PLVoorkeur.sluit()">Annuleren</button></div>';
  }

  async function bewaar() {
    try {
      var d = await api('voorkeuren_opslaan', { voorkeur: schoon(_form) });
      _pref = schoon(d.voorkeur); _bron = 'account';
      schrijf(OPSLAG, JSON.stringify({ u: wie(), p: _pref }));
      toepassen(_pref, DOE, { adapterAdres: lees('spp_address') });
      melding('✓ Voorkeuren bewaard in je account');
      sluit();
    } catch (e) { melding('⚠️ ' + e.message); console.warn('PLVoorkeur.bewaar', e); }
  }

  async function selectieVast(weg) {
    var v = (window.PLGarage && PLGarage.actief) ? PLGarage.actief() : null;
    if (!v) return;
    var pids = weg ? [] : Array.from(activePIDs);
    try {
      await api('voertuig_opslaan', { voertuig: { id: v.id, pid_selectie: pids.length ? pids : null } });
      if (PLGarage.ververs) await PLGarage.ververs();
      melding(weg ? 'Vaste selectie weggehaald' : '✓ ' + pids.length + ' sensoren vastgelegd voor ' + (v.naam || 'je voertuig'));
      teken();
    } catch (e) { melding('⚠️ ' + e.message); console.warn('PLVoorkeur.selectieVast', e); }
  }

  window.PLVoorkeur = {
    open: open,
    sluit: sluit,
    huidig: function () { return _pref; },
    selectieToepassen: selectieToepassen,
    // Haken voor de rest van de app. Zonder voorkeur (geen klant, niets
    // vastgelegd) geven ze het oude gedrag terug.
    scanBekend: function () { return (_pref && _pref.scanBekend) || 'vragen'; },
    samenvatting: function () { return !(_pref && _pref.samenvatting === false); },
    verbruik: function (l100) { return verbruikTekst(l100, _pref && _pref.verbruik); },
    melding: function (soort) { return !(_pref && _pref[soort] === false); },
    promptRegel: function () { return _pref ? promptRegel(_pref) : ''; },
    _zet: function (k, w) { if (w === null) delete _form[k]; else _form[k] = w; teken(); },
    _overnemen: function () { var t = toestelNu(); Object.keys(t).forEach(function (k) { _form[k] = t[k]; }); teken(); melding('Overgenomen van dit toestel — druk op Bewaren'); },
    _bewaar: bewaar,
    _selectieVast: function () { selectieVast(false); },
    _selectieWeg: function () { selectieVast(true); },
    _kern: { schoon: schoon, toepassen: toepassen, achtergrond: achtergrond, verbruikTekst: verbruikTekst, promptRegel: promptRegel, SPEC: VOORKEUR_SPEC }
  };

  // ── De lus: inloggen en verbinden merken ───────────────────────────
  var _wasKlant = false, _wasVerbonden = false;
  function verbonden() { try { return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); } catch (e) { return false; } }
  function lus() {
    try {
      var k = isKlant();
      var item = document.getElementById('kbVoorkeur');
      if (item) item.style.display = k ? '' : 'none';
      if (k && !_wasKlant) laadEnPas();
      if (!k && _wasKlant) { _pref = null; _bron = null; schrijf(OPSLAG, null); }
      _wasKlant = k;
      var v = k && verbonden();
      if (v && !_wasVerbonden) naVerbinden();
      _wasVerbonden = v;
    } catch (e) { console.warn('PLVoorkeur: lus', e); }
  }
  setInterval(lus, 2000);
})();
