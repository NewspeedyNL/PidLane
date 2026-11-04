/* ═══════════════════════════════════════════════════════════════════
   pidlane-inrichten.js — PLInrichten: de setup-wizard (04-11-2026)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT
   Een nieuwe klant downloadt de app, maakt een account, verbindt zijn
   adapter, kiest het protocol, en dan? De functies die de app bruikbaar
   maken bestonden allemaal al, maar elk achter zijn eigen knop: het
   akkoord van Mijn voertuigen, het kenteken, de brandstof, onderhoud,
   tankbeurten, de conditiescore, de foto, sensoren zoeken, de weergave.
   Wie ze niet vond, had een app die half werkte. Deze wizard loopt ze één
   keer per voertuig af en roept de bestaande functies aan. Hij bouwt niets
   na wat er al is.

   BESLUITEN VAN DE EIGENAAR (04-11-2026)
     • vanzelf alleen bij de eerste verbinding van een voertuig: daarna via
       Meer → Setup-wizard, Mijn voorkeuren of Mijn voertuigen;
     • halverwege sluiten bewaart de voortgang: openen gaat verder op de stap
       waar de klant bleef;
     • na de protocolkeuze één venster met twee keuzes: inrichten of meteen
       rijden;
     • Leer de auto gebeurt stilstaand. De leerrit wordt pas gevraagd als de
       rest staat, en gebeurt bij de eerste rit (leerTik());
     • kenteken: sterk aangeraden, maar overslaan mag;
     • km-stand: uit de ECU (01A6), anders vragen;
     • drie schakelaars, standaard aan: onderhoud (laatste beurt + schema),
       tankbeurten (nulpunt "is de tank nu vol?"), conditie;
     • foto van de auto, alleen op de telefoon;
     • sensoren: de klant kiest tussen snel en grondig;
     • snelheid = de adaptersnelheid;
     • gevonden sensoren → een voorstel voor Mijn dashboard.

   VOLGORDE: METEN EERST
   Toestemming → Leer de auto → Adapter → Sensoren → Weergave → Bijhouden
   → Foto → Klaar. De stappen op de bus zitten vooraan, zodat de klant
   daarna in stilstand vragen beantwoordt.

   PER VOERTUIG
   De sleutel is het chassisnummer van de verbinding, anders het kenteken.
   Een auto zonder beide krijgt één gedeelde sleutel ('onbekend').

   PUUR EN LOS TE TOETSEN (_kern): sleutelVan, nieuweStaat, normaliseer,
   moetVragen, toepasbaar, volgende, markeer, voortgang, kmUitEcu,
   beurtTekst, volgendeBeurt, leerTik, WEERGAVEN. test-inrichten.js laadt
   dit bestand; bproef-inrichten.js draait de echte app ertegenaan.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var VERSIE = 1;
  var OPSLAG = 'pl_inricht_';
  var LEER = 'pl_inricht_leerrit';
  var LEER_MS = 5 * 60 * 1000;      // vijf minuten echt rijden is een leerrit
  var LEER_DT_MAX = 15000;          // langer zonder tik = geen rijtijd erbij tellen

  var STAPPEN = [
    { id: 'toestemming', titel: 'Toestemming', icoon: '🔒' },
    { id: 'auto', titel: 'Leer de auto', icoon: '🚗' },
    { id: 'adapter', titel: 'Adaptersnelheid', icoon: '⚡' },
    { id: 'sensoren', titel: 'Sensoren zoeken', icoon: '📡' },
    { id: 'weergave', titel: 'Dashboard en weergave', icoon: '📊' },
    { id: 'bijhouden', titel: 'Bijhouden', icoon: '🧾' },
    { id: 'foto', titel: 'Foto van de auto', icoon: '📷' },
    { id: 'klaar', titel: 'Klaar', icoon: '✅' }
  ];
  var IDS = STAPPEN.map(function (s) { return s.id; });

  /* De weergaven waaruit de klant kiest. `pidview` is de modus van
     setPidView(), `slim` de stand van PLRond, `visprofiel` die van PLVisProfiel. */
  var WEERGAVEN = [
    { id: 'dash', naam: 'Mijn dashboard', uitleg: 'Tegels met de beste sensoren voor deze auto: een voorstel dat je zelf aanpast.', pidview: 'slim', slim: 'dash' },
    { id: 'rond', naam: 'Slim, als rondgang', uitleg: 'De app wisselt zelf tussen motor, temperatuur, brandstof en uitstoot.', pidview: 'slim', slim: 'rond' },
    { id: 'visueel', naam: 'Slim visueel', uitleg: 'Eén grote meter met toerental en snelheid, rustig tijdens het rijden.', pidview: 'visueel', visprofiel: 'basis' },
    { id: 'hyperlane', naam: 'Hyperlane', uitleg: 'De neon-tunnel: de blikvanger van Slim visueel.', pidview: 'visueel', visprofiel: 'hyperlane' },
    { id: 'overzicht', naam: 'Overzicht', uitleg: 'Alle geselecteerde sensoren tegelijk, met trendlijnen.', pidview: 'overzicht' }
  ];

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════
  function schoonVin(v) { var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 17 ? s : ''; }
  function schoonKent(k) { var s = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length >= 4 ? s : ''; }
  /* Eén sleutel per voertuig. De VIN gaat niet de telefoon uit (alleen
     localStorage, zoals pl_vinprof_); het kenteken is de terugval. */
  function sleutelVan(o) {
    o = o || {};
    var v = schoonVin(o.vin); if (v) return OPSLAG + 'v' + v;
    var k = schoonKent(o.kenteken); if (k) return OPSLAG + 'k' + k;
    return OPSLAG + 'onbekend';
  }
  function nieuweStaat() { return { v: VERSIE, keuze: null, stap: null, stappen: {}, t: 0 }; }
  // Wat uit localStorage komt kan van een oude versie of kapot zijn.
  function normaliseer(st) {
    var n = nieuweStaat();
    if (!st || typeof st !== 'object') return n;
    if (st.keuze === 'wizard' || st.keuze === 'rijden' || st.keuze === 'klaar') n.keuze = st.keuze;
    if (IDS.indexOf(st.stap) >= 0) n.stap = st.stap;
    var s = st.stappen && typeof st.stappen === 'object' ? st.stappen : {};
    IDS.forEach(function (id) { if (s[id] === 'klaar' || s[id] === 'over') n.stappen[id] = s[id]; });
    n.t = typeof st.t === 'number' && isFinite(st.t) ? st.t : 0;
    return n;
  }
  /* Vanzelf vragen alleen als er voor dit voertuig nog niets gekozen is.
     Niet in de demo (daar wordt niets bewaard) en niet bij een hervatting:
     die is per definitie geen eerste keer. */
  function moetVragen(st, ctx) {
    ctx = ctx || {};
    if (ctx.demo || ctx.hervat) return false;
    return !normaliseer(st).keuze;
  }
  /* Geldt een stap nu? ctx = { platform, akkoord, verbonden }. Een stap die
     niet geldt, wordt overgeslagen zonder hem als 'over' te markeren: komt
     de voorwaarde later wel (verbonden, akkoord), dan vraagt hij hem alsnog. */
  function toepasbaar(id, ctx) {
    ctx = ctx || {};
    if (id === 'toestemming') return !!ctx.platform && !ctx.akkoord;
    if (id === 'adapter' || id === 'sensoren') return !!ctx.verbonden;
    if (id === 'bijhouden') return !!ctx.platform && !!ctx.akkoord;
    return IDS.indexOf(id) >= 0;
  }
  // De eerste stap die geldt en nog niet gedaan of overgeslagen is.
  function volgende(st, ctx) {
    st = normaliseer(st);
    for (var i = 0; i < IDS.length; i++) {
      var id = IDS[i];
      if (id === 'klaar') return 'klaar';
      if (!st.stappen[id] && toepasbaar(id, ctx)) return id;
    }
    return 'klaar';
  }
  function markeer(st, id, uitkomst, ctx, nu) {
    var n = normaliseer(st);
    if (IDS.indexOf(id) < 0) return n;
    n.stappen[id] = uitkomst === 'over' ? 'over' : 'klaar';
    n.keuze = id === 'klaar' ? 'klaar' : 'wizard';
    n.stap = id === 'klaar' ? 'klaar' : volgende(n, ctx);
    n.t = typeof nu === 'number' ? nu : Date.now();
    return n;
  }
  function voortgang(st, ctx) {
    st = normaliseer(st);
    var l = IDS.filter(function (id) { return id !== 'klaar' && toepasbaar(id, ctx); });
    return { gedaan: l.filter(function (id) { return !!st.stappen[id]; }).length, totaal: l.length,
      over: l.filter(function (id) { return st.stappen[id] === 'over'; }) };
  }
  /* PID 01A6 (kilometerteller, J1979): 4 bytes / 10 km. Hier alleen de
     omgerekende waarde uit pidVals keuren: een getal binnen wat een auto
     haalt. Nul is bij veel ECU's "niet ondersteund", geen nieuwe auto. */
  function kmUitEcu(pv) {
    var w = pv ? pv['01A6'] : null;
    if (typeof w !== 'number' || !isFinite(w) || w <= 0 || w > 2000000) return null;
    return Math.round(w);
  }
  function nlKm(km) { return String(km).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /* De laatste beurt als tekst voor onderhoud_laatst (max 80 tekens).
     datum = 'jjjj-mm-dd' of leeg, km = getal of null. */
  function beurtTekst(datum, km) {
    var d = /^\d{4}-\d{2}-\d{2}$/.test(String(datum || '')) ? String(datum).split('-').reverse().join('-') : '';
    var k = typeof km === 'number' && isFinite(km) && km >= 0 ? nlKm(Math.round(km)) + ' km' : '';
    var t = [d, k].filter(Boolean).join(' bij ');
    return t ? t.slice(0, 80) : null;
  }
  /* De volgende beurt uit de laatste en het interval. Alleen wat te
     berekenen is komt erin: zonder interval geen gok. */
  function volgendeBeurt(laatst, interval) {
    laatst = laatst || {}; interval = interval || {};
    var uit = {};
    if (typeof laatst.km === 'number' && laatst.km >= 0 && typeof interval.km === 'number' && interval.km > 0) uit.onderhoud_km = Math.round(laatst.km + interval.km);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(laatst.datum || '')) && typeof interval.mnd === 'number' && interval.mnd > 0) {
      var p = laatst.datum.split('-').map(Number);
      var d = new Date(Date.UTC(p[0], p[1] - 1 + interval.mnd, p[2]));
      uit.onderhoud_datum = d.toISOString().slice(0, 10);
    }
    return uit;
  }
  /* De leerrit bij de eerste rit. st = { rijMs, tLaatst }; s = { kmh }.
     Telt de tijd dat de auto rijdt (> 5 km/u); een gat van meer dan
     LEER_DT_MAX telt niet (app op de achtergrond, verbinding weg).
     klaar = vijf minuten gereden. */
  function leerTik(st, s, nu) {
    st = st && typeof st === 'object' ? { rijMs: Number(st.rijMs) || 0, tLaatst: Number(st.tLaatst) || 0 } : { rijMs: 0, tLaatst: 0 };
    var kmh = s && typeof s.kmh === 'number' ? s.kmh : null;
    if (kmh !== null && kmh > 5 && st.tLaatst) {
      var dt = nu - st.tLaatst;
      if (dt > 0 && dt <= LEER_DT_MAX) st.rijMs += dt;
    }
    st.tLaatst = nu;
    return { st: st, klaar: st.rijMs >= LEER_MS };
  }

  // ════════════════════════════════════════════════════════════════
  //  DE APP
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function lees(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { console.warn('PLInrichten: ' + k + ' onleesbaar', e); return null; } }
  function schrijf(k, w) { try { if (w === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(w)); } catch (e) { console.warn('PLInrichten: ' + k + ' niet bewaard', e); } }
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLInrichten: melding', e); } }
  function vi() { return (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {}; }
  function isDemo() { return typeof demoMode !== 'undefined' && !!demoMode; }
  function isVerbonden() { return typeof connected !== 'undefined' && !!connected && !isDemo(); }
  function kentNu() { try { return localStorage.getItem('pl_kenteken') || ''; } catch (e) { console.warn('PLInrichten: kenteken onleesbaar', e); return ''; } }
  function platform() { return !isDemo() && !!window.PLGarage && typeof PLGarage.inrichtVoertuig === 'function' && !!(window.currentUser && window.currentUser.user); }
  function akkoord() { return !!(window.PLGarage && PLGarage.akkoordNu && PLGarage.akkoordNu()); }
  function ctx() { return { platform: platform(), akkoord: akkoord(), verbonden: isVerbonden() }; }
  function sleutelNu() { return sleutelVan({ vin: vi().vin, kenteken: kentNu() }); }

  var _st = null, _sl = null, _pauze = false, _veh = null, _bezig = false, _form = {};

  function laad() { _sl = sleutelNu(); _st = normaliseer(lees(_sl)); return _st; }
  function bewaar() { if (_sl) schrijf(_sl, _st); }

  function stijl() {
    if (el('plInCss')) return;
    var s = document.createElement('style'); s.id = 'plInCss';
    s.textContent =
      '#plInOv{position:fixed;inset:0;z-index:9600;background:rgba(8,11,17,.88);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
      '#plInOv .in-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:520px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx)}' +
      '#plInOv .in-kop{display:flex;align-items:center;gap:9px}#plInOv .in-t{font:800 16px var(--f)}' +
      '#plInOv .in-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
      '#plInOv .in-balk{height:5px;border-radius:3px;background:var(--sur);margin:10px 0 12px;overflow:hidden}#plInOv .in-balk i{display:block;height:100%;background:var(--acc,#22c55e)}' +
      '#plInOv .in-sub{font-size:12px;color:var(--tx3);margin:2px 0 10px}#plInOv p{font-size:13px;line-height:1.45;margin:0 0 10px;color:var(--tx2)}' +
      '#plInOv .in-blok{background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:11px 12px;margin-bottom:10px}' +
      '#plInOv .in-kaart{display:block;width:100%;text-align:left;background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:12px;margin-bottom:8px;color:var(--tx);font:600 13px var(--f);cursor:pointer}' +
      '#plInOv .in-kaart.aan{border-color:var(--acc,#22c55e);box-shadow:0 0 0 1px var(--acc,#22c55e) inset}#plInOv .in-kaart b{display:block;font-size:14px;margin-bottom:3px}#plInOv .in-kaart span{color:var(--tx3);font-weight:500;font-size:12px}' +
      '#plInOv .in-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#plInOv .in-k{flex:1 1 auto;padding:11px 14px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
      '#plInOv .in-k.hoofd{background:var(--acc,#22c55e);color:#06110a;border-color:transparent}#plInOv .in-k:disabled{opacity:.5}' +
      '#plInOv label.in-veld{display:block;font-size:12px;color:var(--tx3);margin:8px 0 2px}#plInOv .in-veld input,#plInOv .in-veld select{width:100%;box-sizing:border-box;margin-top:3px;padding:9px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:600 14px var(--f)}' +
      '#plInOv .in-sw{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--bd);font:700 13px var(--f)}#plInOv .in-sw:first-child{border-top:0}#plInOv .in-sw input{width:20px;height:20px}' +
      '#plInOv .in-let{font-size:12px;color:#f59e0b;margin-top:6px}#plInOv .in-foto{width:100%;max-height:180px;object-fit:contain;border-radius:9px;background:var(--sur2)}';
    document.head.appendChild(s);
  }
  function overlay() {
    stijl();
    var ov = el('plInOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plInOv';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Setup-wizard');
      ov.innerHTML = '<div class="in-doos" id="plInDoos"></div>';
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    return el('plInDoos');
  }
  function verberg() { var ov = el('plInOv'); if (ov) ov.style.display = 'none'; }
  function kader(titel, sub, body, metBalk) {
    var vg = voortgang(_st, ctx());
    return '<div class="in-kop"><div class="in-t">' + titel + '</div><button class="in-x" aria-label="Sluiten" onclick="PLInrichten.sluit()">✕</button></div>' +
      (sub ? '<div class="in-sub">' + sub + '</div>' : '') +
      (metBalk ? '<div class="in-balk"><i style="width:' + (vg.totaal ? Math.round(100 * vg.gedaan / vg.totaal) : 0) + '%"></i></div>' : '') + body;
  }
  function knoppen(l) {
    return '<div class="in-knoppen">' + l.map(function (k) {
      return '<button class="in-k' + (k.hoofd ? ' hoofd' : '') + '"' + (k.id ? ' id="' + k.id + '"' : '') + (k.uit ? ' disabled' : '') + ' onclick="' + k.doe + '">' + k.t + '</button>';
    }).join('') + '</div>';
  }
  function over() { return { t: 'Overslaan', doe: 'PLInrichten._over()' }; }

  // ── Het keuzevenster ─────────────────────────────────────────────
  function tekenKeuze() {
    var v = vi(), naam = [v.merk && v.merk !== 'Onbekend' ? v.merk : '', v.model, v.year].filter(Boolean).join(' ') || 'je auto';
    overlay().innerHTML = kader('🚗 Verbonden met ' + esc(naam), 'Hoe wil je beginnen?',
      '<button class="in-kaart" id="plInKiesWizard" onclick="PLInrichten._start()"><b>🧭 Inrichten (aanbevolen)</b><span>De app leert je auto kennen, zoekt de sensoren, stelt je dashboard voor en zet onderhoud en tanken klaar. Een paar minuten, één keer.</span></button>' +
      '<button class="in-kaart" id="plInKiesRijden" onclick="PLInrichten._rijden()"><b>⚡ Meteen rijden</b><span>De standaardset sensoren staat aan. Inrichten kan later: Meer → Setup-wizard.</span></button>', false);
  }

  // ── De stappen ───────────────────────────────────────────────────
  function teken() {
    if (!_st) laad();
    var id = _st.stap && _st.stap !== 'klaar' && toepasbaar(_st.stap, ctx()) && !_st.stappen[_st.stap] ? _st.stap : volgende(_st, ctx());
    _st.stap = id; bewaar();
    var i = IDS.indexOf(id), s = STAPPEN[i];
    var sub = id === 'klaar' ? '' : 'Stap ' + (voortgang(_st, ctx()).gedaan + 1) + ' van ' + voortgang(_st, ctx()).totaal;
    var body = ({ toestemming: stapToestemming, auto: stapAuto, adapter: stapAdapter, sensoren: stapSensoren, weergave: stapWeergave, bijhouden: stapBijhouden, foto: stapFoto, klaar: stapKlaar })[id]();
    overlay().innerHTML = kader(s.icoon + ' ' + s.titel, sub, body, id !== 'klaar');
  }

  function stapToestemming() {
    return '<p>Met <b>Mijn voertuigen</b> bewaart de app je auto, je ritten, je onderhoud en je tankbeurten op je account, zodat ze op elk toestel terugkomen. Daar is eerst je akkoord voor nodig.</p>' +
      '<p>Lees in het volgende scherm wat er bewaard wordt en tik daar op <b>Akkoord</b>. Daarna gaat de wizard hier verder.</p>' +
      '<p class="in-sub">Zonder akkoord werkt de app ook, maar onderhoud en tanken bijhouden niet.</p>' +
      knoppen([over(), { t: 'Lees en geef akkoord', hoofd: true, id: 'plInAkkoord', doe: 'PLInrichten._akkoord()' }]);
  }

  function stapAuto() {
    var v = vi(), ken = _form.kenteken != null ? _form.kenteken : kentNu();
    var ecuKm = kmUitEcu(typeof pidVals !== 'undefined' ? pidVals : null);
    var b = String(_form.brandstof != null ? _form.brandstof : (v.brandstof || '')).toLowerCase();
    var keuzes = ['', 'benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng'];
    if (keuzes.indexOf(b) < 0) b = /diesel/.test(b) ? 'diesel' : /elektr/.test(b) ? 'elektrisch' : /hybr/.test(b) ? 'hybride' : /benzine/.test(b) ? 'benzine' : '';
    var turbo = _form.turbo || ((_veh && _veh.v && _veh.v.turbo) || 'onbekend');
    var kent = [v.merk && v.merk !== 'Onbekend' ? v.merk : '', v.model, v.year].filter(Boolean).join(' ');
    return '<div class="in-blok"><b>' + (kent ? esc(kent) : 'Merk en model nog onbekend') + '</b><div class="in-sub">' +
      (v.vin ? 'Chassisnummer gelezen uit de auto' : 'De auto gaf geen chassisnummer') + (v.motor ? ' · ' + esc(v.motor) : '') + '</div></div>' +
      '<label class="in-veld">Kenteken<input id="plInKent" value="' + esc(ken) + '" autocapitalize="characters" placeholder="bv. AB-123-C" oninput="PLInrichten._zet(\'kenteken\',this.value)"></label>' +
      (schoonKent(ken) ? '' : '<div class="in-let">Sterk aangeraden: met het kenteken haalt de app merk, brandstof, APK en het onderhoudsschema op bij de RDW. Zonder kenteken werken die niet.</div>') +
      '<div class="in-sub" id="plInRdw"></div>' +
      '<label class="in-veld">Brandstof<select id="plInBrandstof" onchange="PLInrichten._zet(\'brandstof\',this.value)">' + keuzes.map(function (k) { return '<option value="' + k + '"' + (k === b ? ' selected' : '') + '>' + (k || 'weet ik niet') + '</option>'; }).join('') + '</select></label>' +
      '<label class="in-veld">Turbo<select id="plInTurbo" onchange="PLInrichten._zet(\'turbo\',this.value)">' + ['onbekend', 'ja', 'nee'].map(function (k) { return '<option' + (k === turbo ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></label>' +
      (ecuKm ? '<label class="in-veld">Kilometerstand (uit de auto)<input id="plInKm" inputmode="numeric" value="' + ecuKm + '" oninput="PLInrichten._zet(\'km\',this.value)"></label>'
        : '<label class="in-veld">Kilometerstand (de auto geeft hem niet — lees hem af op je dashboard)<input id="plInKm" inputmode="numeric" value="' + esc(_form.km || '') + '" placeholder="bv. 123456" oninput="PLInrichten._zet(\'km\',this.value)"></label>') +
      knoppen([over(), { t: 'Bewaren en verder', hoofd: true, id: 'plInAutoOk', uit: _bezig, doe: 'PLInrichten._auto()' }]);
  }

  function stapAdapter() {
    var sp = typeof _connSpeed !== 'undefined' ? _connSpeed : null;
    var str = typeof _connStrategy !== 'undefined' && _connStrategy && window.STRATEGIE_INFO ? STRATEGIE_INFO[_connStrategy] : null;
    return '<p>Hoe snel je adapter antwoordt, bepaalt hoeveel sensoren de app tegelijk kan volgen. De app heeft dit bij het verbinden al gemeten; een tweede meting met meer vragen is nauwkeuriger.</p>' +
      '<div class="in-blok" id="plInSnelheid">' + (sp ? '<b>' + String(sp.readsPerSec).replace('.', ',') + ' metingen per seconde</b><div class="in-sub">gemiddeld ' + sp.avgMs + ' ms per antwoord' + (sp.protocol && sp.protocol !== '?' ? ' · ' + esc(sp.protocol) : '') + '</div>' : '<b>Nog niet gemeten</b>') +
      (str ? '<div class="in-sub">Tempo: ' + str.emoji + ' ' + esc(str.label) + ' — ' + esc(str.desc) + '</div>' : '') + '</div>' +
      knoppen([{ t: _bezig ? '⏳ Meten…' : 'Opnieuw meten', id: 'plInMeet', uit: _bezig, doe: 'PLInrichten._meet()' }, { t: 'Verder', hoofd: true, uit: _bezig, doe: 'PLInrichten._klaar()' }]);
  }

  function stapSensoren() {
    var n = typeof supportedPIDs !== 'undefined' && supportedPIDs ? supportedPIDs.size : 0;
    var ok = 0;
    try { if (typeof _pidHealth !== 'undefined') ok = Object.keys(_pidHealth).filter(function (p) { return _pidHealth[p] === 'ok'; }).length; }
    catch (e) { console.warn('PLInrichten: sensorgezondheid onleesbaar', e); }
    var grondig = !!(_veh && _veh.soort === 'voertuig' && window.PLPidZoek);
    return '<p>Bij het verbinden vond de app <b>' + n + '</b> sensoren, waarvan <b>' + ok + '</b> een geldige waarde gaven.</p>' +
      '<button class="in-kaart" id="plInSnel" onclick="PLInrichten._klaar()"><b>⚡ Snel — klaar</b><span>Gebruik wat bij het verbinden gevonden is. De app controleert de rest later stil op de achtergrond.</span></button>' +
      '<button class="in-kaart" id="plInGrondig" onclick="PLInrichten._grondig()"' + (grondig ? '' : ' disabled') + '><b>🔍 Grondig — 1 à 2 minuten</b><span>' +
      (grondig ? 'Probeert ook de fabriekssensoren van dit model (uit de bibliotheek) één voor één, en stelt voor wat een geldige waarde geeft. Laat het contact aan.' : 'Kan pas als de auto in Mijn voertuigen staat (stap Leer de auto, met akkoord).') + '</span></button>';
  }

  function stapWeergave() {
    var k = _form.weergave || 'dash';
    return '<p>Hoe wil je de metingen zien? Je kunt dit altijd wisselen in Live.</p>' +
      WEERGAVEN.map(function (w) {
        return '<button class="in-kaart' + (w.id === k ? ' aan' : '') + '" id="plInW_' + w.id + '" onclick="PLInrichten._zet(\'weergave\',\'' + w.id + '\')"><b>' + esc(w.naam) + '</b><span>' + esc(w.uitleg) + '</span></button>';
      }).join('') +
      knoppen([over(), { t: 'Kies deze', hoofd: true, id: 'plInWeergaveOk', doe: 'PLInrichten._weergave()' }]);
  }

  function stapBijhouden() {
    var f = _form;
    if (f.onderhoud == null) { f.onderhoud = true; f.tanken = true; f.score = true; }
    var sw = function (k, t, u) {
      return '<label class="in-sw"><input type="checkbox" id="plInSw_' + k + '"' + (f[k] ? ' checked' : '') + ' onchange="PLInrichten._zet(\'' + k + '\',this.checked)"><span>' + t + '<div class="in-sub" style="margin:2px 0 0;font-weight:500">' + u + '</div></span></label>';
    };
    var h = '<div class="in-blok">' +
      sw('onderhoud', '🔧 Onderhoud bijhouden', 'Een herinnering als de volgende beurt eraan komt.') +
      sw('tanken', '⛽ Tankbeurten bijhouden', 'Echt verbruik en echte actieradius, uit je tankbeurten.') +
      sw('score', '📈 Conditie bijhouden', 'Een score uit je onderhoud en je ritten, die je zelf opent.') + '</div>';
    if (f.onderhoud) {
      h += '<div class="in-blok"><b>Je laatste onderhoudsbeurt</b>' +
        '<label class="in-veld">Datum<input type="date" id="plInBeurtDatum" value="' + esc(f.beurtDatum || '') + '" oninput="PLInrichten._zet(\'beurtDatum\',this.value)"></label>' +
        '<label class="in-veld">Kilometerstand toen<input inputmode="numeric" id="plInBeurtKm" value="' + esc(f.beurtKm || '') + '" placeholder="bv. 110000" oninput="PLInrichten._zet(\'beurtKm\',this.value)"></label>' +
        '<div class="in-sub">Weet je het niet? Laat leeg. Met <b>Onderhoudsschema</b> zoekt de AI daarna op hoe vaak dit model een beurt nodig heeft (kost tegoed).</div></div>';
    }
    if (f.tanken) {
      h += '<div class="in-blok"><b>Is de tank nu vol?</b><div class="in-sub">Dan is dit het nulpunt: vanaf de volgende keer tanken klopt het verbruik.</div>' +
        '<label class="in-sw"><input type="checkbox" id="plInVol"' + (f.vol ? ' checked' : '') + ' onchange="PLInrichten._zet(\'vol\',this.checked)"><span>Ja, ik heb net volgetankt</span></label></div>';
    }
    return h + knoppen([over(), { t: _bezig ? '⏳ Bewaren…' : 'Bewaren en verder', hoofd: true, id: 'plInBijOk', uit: _bezig, doe: 'PLInrichten._bijhouden()' }]);
  }

  function stapFoto() {
    var ken = schoonKent(kentNu()), f = ken && window.PLGarage && PLGarage.foto ? PLGarage.foto(ken) : null;
    if (!ken) return '<p>Een foto hoort bij het kenteken, en dat staat nog niet in de app. Vul het in bij <b>Leer de auto</b> (Meer → Setup-wizard), dan kan dit later.</p>' + knoppen([{ t: 'Verder', hoofd: true, doe: 'PLInrichten._over()' }]);
    return '<p>Een foto van je auto voor het startscherm en Mijn voertuigen. Hij blijft op deze telefoon en gaat niet naar de server.</p>' +
      (f ? '<img class="in-foto" alt="Foto van je auto" src="' + esc(f) + '">' : '') +
      knoppen([over(), { t: f ? '📷 Andere foto' : '📷 Maak of kies een foto', id: 'plInFoto', doe: 'PLInrichten._foto()' }].concat(f ? [{ t: 'Verder', hoofd: true, doe: 'PLInrichten._klaar()' }] : []));
  }

  function stapKlaar() {
    var vg = voortgang(_st, ctx());
    var naam = function (id) { return STAPPEN[IDS.indexOf(id)].titel; };
    return '<p><b>Je auto is ingericht.</b> ' + (vg.over.length ? 'Overgeslagen: ' + vg.over.map(naam).join(', ') + '. Dat kan later via Meer → Setup-wizard.' : 'Alles staat klaar.') + '</p>' +
      '<div class="in-blok"><b>🎓 De leerrit</b><div class="in-sub" style="margin:4px 0 0">Bij je volgende rit leert de app je auto rijdend kennen: de versnellingen, de normale temperaturen en de laadspanning. Je hoeft niets te doen; na een paar minuten rijden zie je een melding.</div></div>' +
      knoppen([{ t: 'Klaar — naar de app', hoofd: true, id: 'plInKlaar', doe: 'PLInrichten._afronden()' }]);
  }

  // ── Handelingen ──────────────────────────────────────────────────
  function stapKlaarMarkeren(uitkomst) {
    _st = markeer(_st, _st.stap, uitkomst, ctx(), Date.now());
    bewaar(); _form = {}; teken();
  }
  async function veh() {
    if (!platform()) { _veh = { soort: 'geen' }; return _veh; }
    try { _veh = await PLGarage.inrichtVoertuig(); }
    catch (e) { console.warn('PLInrichten: voertuig niet bepaald', e); _veh = { soort: 'geen' }; }
    return _veh;
  }
  function getal(t) { var s = String(t == null ? '' : t).replace(/[^0-9]/g, ''); return s ? parseInt(s, 10) : null; }

  async function auto() {
    if (_bezig) return;
    var v = vi(), ken = schoonKent(_form.kenteken != null ? _form.kenteken : kentNu());
    var b = _form.brandstof != null ? _form.brandstof : null;
    var km = _form.km != null ? getal(_form.km) : kmUitEcu(typeof pidVals !== 'undefined' ? pidVals : null);
    _bezig = true; teken();
    try {
      if (ken) {
        try { localStorage.setItem('pl_kenteken', ken); } catch (e) { console.warn('PLInrichten: kenteken niet bewaard', e); }
        if (ken !== schoonKent(v.kenteken || '') && typeof rdwLookup === 'function') {
          try { await rdwLookup(false, { kenteken: ken, statusEl: el('plInRdw') }); }
          catch (e) { console.warn('PLInrichten: RDW-opzoeking mislukt', e); }
        }
      }
      // Wat de klant kiest is de sterkste bron (user, pidlane-voertuigdata.js),
      // en de PID-gate moet het meteen weten: anders blijven fantomen staan.
      if (b && typeof mergeVehicleData === 'function') {
        mergeVehicleData('user', { brandstof: b });
        if (typeof herijkPidGate === 'function') herijkPidGate('setup-wizard: brandstof');
      }
      // Een sleutel op het kenteken wordt een sleutel op hetzelfde kenteken:
      // pas na het kenteken weet de wizard welk voertuig dit is.
      var nieuw = sleutelNu();
      if (nieuw !== _sl) { schrijf(_sl, null); _sl = nieuw; }
      await veh();
      if (_veh.soort === 'voertuig' || _veh.soort === 'nieuw') {
        var w = {};
        if (ken) w.kenteken = ken;
        var bs = b || String(vi().brandstof || '').toLowerCase();
        if (['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng'].indexOf(bs) >= 0) w.brandstof = bs;
        if (_form.turbo) w.turbo = _form.turbo;
        if (km) w.kmstand = km;
        var x = vi();
        if (x.merk && x.merk !== 'Onbekend') w.merk = String(x.merk).slice(0, 40);
        if (x.model) w.model = String(x.model).slice(0, 60);
        if (/^\d{4}$/.test(String(x.year || ''))) w.bouwjaar = parseInt(x.year, 10);
        if (_veh.soort === 'nieuw') w.naam = [w.merk, w.model].filter(Boolean).join(' ').slice(0, 40) || 'Mijn auto';
        try { var nv = await PLGarage.inrichtBewaar(w); _veh = { soort: 'voertuig', v: nv }; }
        catch (e) { console.warn('PLInrichten: voertuig niet bewaard', e); melding('⚠️ Niet bewaard in Mijn voertuigen: ' + (e && e.message ? e.message : e)); }
      }
    } finally { _bezig = false; }
    stapKlaarMarkeren('klaar');
  }

  async function meet() {
    if (_bezig || typeof measureConnSpeed !== 'function') return;
    _bezig = true; teken();
    try {
      var sp = await measureConnSpeed(16);
      if (sp && typeof suggestStrategy === 'function' && typeof applyStrategy === 'function') applyStrategy(suggestStrategy(sp));
    } catch (e) { console.warn('PLInrichten: snelheidsmeting mislukt', e); melding('⚠️ Meten lukte niet: ' + (e && e.message ? e.message : e)); }
    finally { _bezig = false; }
    teken();
  }

  function weergave() {
    var w = WEERGAVEN.filter(function (x) { return x.id === (_form.weergave || 'dash'); })[0] || WEERGAVEN[0];
    try {
      if (w.id === 'dash' && window.PLDash && PLDash.herstel) PLDash.herstel();   // het voorstel uit motor en gevonden sensoren
      if (w.slim && window.PLRond && PLRond.modus) PLRond.modus(w.slim);
      if (w.visprofiel && window.PLVisProfiel && PLVisProfiel.bewaar) PLVisProfiel.bewaar(w.visprofiel);
      if (typeof setPidView === 'function') setPidView(w.pidview);
    } catch (e) { console.warn('PLInrichten: weergave niet gezet', e); melding('⚠️ De weergave kon niet gezet worden — kies hem in Live'); }
    stapKlaarMarkeren('klaar');
  }

  async function bijhouden() {
    if (_bezig) return;
    var f = _form;
    if (f.onderhoud == null) { f.onderhoud = true; f.tanken = true; f.score = true; }
    _bezig = true; teken();
    try {
      if (!_veh || _veh.soort !== 'voertuig') await veh();
      if (!_veh || _veh.soort !== 'voertuig') throw new Error('de auto staat nog niet in Mijn voertuigen — doe eerst Leer de auto');
      var v = _veh.v;
      var w = { onderhoud: f.onderhoud ? 'aan' : 'uit', tanken: f.tanken ? 'aan' : 'uit', score: f.score ? 'aan' : 'uit' };
      var bkm = getal(f.beurtKm), bd = /^\d{4}-\d{2}-\d{2}$/.test(String(f.beurtDatum || '')) ? f.beurtDatum : null;
      if (f.onderhoud) {
        var t = beurtTekst(bd, bkm); if (t) w.onderhoud_laatst = t;
        Object.assign(w, volgendeBeurt({ datum: bd, km: bkm }, { km: v.onderhoud_interval_km, mnd: v.onderhoud_interval_mnd }));
      }
      var nv = await PLGarage.inrichtBewaar(w); _veh = { soort: 'voertuig', v: nv };
      if (f.tanken && f.vol) {
        var peil = typeof pidVals !== 'undefined' && typeof pidVals['012F'] === 'number' ? Math.round(pidVals['012F']) : 100;
        var km = kmUitEcu(typeof pidVals !== 'undefined' ? pidVals : null) || nv.kmstand || null;
        await PLGarage.inrichtTank(nv.id, { op: new Date().toISOString(), vol: true, tank_na: Math.max(0, Math.min(100, peil)), kmstand: km, bron: 'app', notitie: 'Nulpunt uit de setup-wizard' });
      }
    } catch (e) {
      _bezig = false;
      console.warn('PLInrichten: bijhouden niet bewaard', e);
      melding('⚠️ Niet bewaard: ' + (e && e.message ? e.message : e));
      teken(); return;
    }
    _bezig = false;
    var schema = f.onderhoud && window.PLSchema && PLSchema.open;
    var auto = { merk: vi().merk, model: vi().model, jaar: vi().year, brandstof: vi().brandstof };
    stapKlaarMarkeren('klaar');
    // Het schema na het bewaren: het kost tegoed, dus de klant tikt zelf op
    // "Vraag het schema op". De wizard staat er zolang onder en komt terug.
    if (schema && typeof plBevestig === 'function') {
      var ja = false;
      try { ja = await plBevestig('Wil je het onderhoudsschema van dit model opvragen? De AI zoekt op wanneer olie, filters en distributieriem aan de beurt zijn. Dit kost tegoed.', 'Ja, opvragen', 'Nee, later', '🔧 Onderhoudsschema'); }
      catch (e) { console.warn('PLInrichten: schemavraag', e); }
      if (ja) {
        try { _pauze = true; verberg(); PLSchema.open(auto, kentNu()); wachtOpSchema(); }
        catch (e) { _pauze = false; console.warn('PLInrichten: schema niet geopend', e); teken(); }
      }
    }
  }
  // PLSchema toont een blad van PLZonder; zodra dat dicht is, gaat de wizard verder.
  function wachtOpSchema() {
    var t = setInterval(function () {
      var ov = el('plZonderOv');
      if (ov && ov.style.display !== 'none' && !ov.classList.contains('hidden')) return;
      clearInterval(t); hervat();
    }, 700);
  }
  function hervat() { if (!_pauze) return; _pauze = false; teken(); }

  function afronden() {
    _st = markeer(_st, 'klaar', 'klaar', ctx(), Date.now()); bewaar();
    schrijf(LEER, { rijMs: 0, tLaatst: 0, sl: _sl });
    verberg();
    melding('✅ Ingericht — goede rit');
    naVerbinding();
  }
  function naVerbinding() {
    try { if (window.PLNav) PLNav.naVerbinding(); }
    catch (e) { console.warn('PLInrichten: automatische check niet gestart', e); }
  }

  // ── De leerrit bij de eerste rit ─────────────────────────────────
  function leerKlok() {
    var l = lees(LEER);
    if (!l || !isVerbonden()) return;
    var kmh = typeof pidVals !== 'undefined' ? pidVals['010D'] : null;
    var r = leerTik(l, { kmh: typeof kmh === 'number' ? kmh : null }, Date.now());
    if (!r.klaar) { r.st.sl = l.sl; schrijf(LEER, r.st); return; }
    schrijf(LEER, null);
    var g = null;
    try { if (window.PLGear && PLGear.status) g = PLGear.status(); } catch (e) { console.warn('PLInrichten: versnellingen onleesbaar', e); }
    var gtekst = g && g.versnellingen && g.versnellingen.length ? g.versnellingen.length + ' versnellingen herkend' : (g && g.leren ? 'de versnellingen leert hij nog' : '');
    melding('🎓 Leerrit klaar — PidLane kent je auto nu ook rijdend' + (gtekst ? ' (' + gtekst + ')' : ''));
  }

  // ════════════════════════════════════════════════════════════════
  //  INGANGEN
  // ════════════════════════════════════════════════════════════════
  /* Vanuit pidlane-bt.js, na de protocolkeuze en de scan. true = het
     keuzevenster staat; false = niets gedaan (al eens gekozen, demo). */
  function vraagNaVerbinding(opties) {
    opties = opties || {};
    var st = laad();
    if (!moetVragen(st, { demo: isDemo(), hervat: !!opties.hervat })) return false;
    _form = {}; _veh = null;
    tekenKeuze();
    return true;
  }
  // Op aanvraag: Meer, Mijn voorkeuren, Mijn voertuigen. Gaat verder waar de klant bleef.
  function open(opties) {
    opties = opties || {};
    laad(); _form = {}; _pauze = false;
    if (opties.opnieuw || _st.keuze === 'klaar' || _st.keuze === 'rijden') { _st = nieuweStaat(); _st.keuze = 'wizard'; bewaar(); }
    veh().then(function () { if (!_pauze && el('plInOv') && el('plInOv').style.display !== 'none') teken(); });
    teken();
  }
  function sluit() {
    verberg();
    if (_st && _st.keuze !== 'klaar') {
      if (!_st.keuze) _st.keuze = 'wizard';
      bewaar();
      melding('Je kunt later verder via Meer → Setup-wizard');
    }
  }

  setInterval(function () {
    try { leerKlok(); } catch (e) { console.warn('PLInrichten: leerrit', e); }
  }, 5000);

  window.PLInrichten = {
    vraagNaVerbinding: vraagNaVerbinding,
    open: open,
    sluit: sluit,
    naGarage: function () {
      if (!_pauze) return;
      _pauze = false;
      // Kwam de klant terug van het akkoord, dan geldt die stap als klaar als hij gegeven is.
      if (_st && _st.stap === 'toestemming') { _st = markeer(_st, 'toestemming', akkoord() ? 'klaar' : 'over', ctx(), Date.now()); bewaar(); }
      else if (_st && _st.stap === 'sensoren') { _st = markeer(_st, 'sensoren', 'klaar', ctx(), Date.now()); bewaar(); }
      veh().then(teken);
    },
    staat: function () { return _st; },
    _start: function () { _st = normaliseer(_st); _st.keuze = 'wizard'; bewaar(); veh().then(teken); teken(); },
    _rijden: function () { _st = normaliseer(_st); _st.keuze = 'rijden'; bewaar(); verberg(); melding('Inrichten kan later via Meer → Setup-wizard'); naVerbinding(); },
    _zet: function (k, w) { _form[k] = w; if (k === 'weergave' || k === 'onderhoud' || k === 'tanken' || k === 'score') teken(); },
    _over: function () { stapKlaarMarkeren('over'); },
    _klaar: function () { stapKlaarMarkeren('klaar'); },
    _akkoord: function () { if (!window.PLGarage) return; _pauze = true; verberg(); PLGarage.open(); },
    _auto: auto,
    _meet: meet,
    _grondig: function () {
      if (!window.PLGarage || !PLGarage.openSensoren) return;
      _pauze = true; verberg(); PLGarage.openSensoren();
      // Meteen de zoekronde starten: dezelfde knop als 🚀 in het tabblad Sensoren.
      setTimeout(function () { try { if (PLGarage._pzStart) PLGarage._pzStart(); } catch (e) { console.warn('PLInrichten: grondig zoeken niet gestart', e); } }, 400);
    },
    _weergave: weergave,
    _bijhouden: bijhouden,
    _foto: function () {
      var ken = schoonKent(kentNu());
      if (!ken || !window.PLGarage || !PLGarage.fotoKiesVoor) return;
      PLGarage.fotoKiesVoor(ken).then(function (ok) { if (ok) teken(); });
    },
    _afronden: afronden,
    // pure kern — voor test-inrichten.js
    _kern: { VERSIE: VERSIE, STAPPEN: STAPPEN, WEERGAVEN: WEERGAVEN, LEER_MS: LEER_MS, sleutelVan: sleutelVan, nieuweStaat: nieuweStaat, normaliseer: normaliseer,
      moetVragen: moetVragen, toepasbaar: toepasbaar, volgende: volgende, markeer: markeer, voortgang: voortgang,
      kmUitEcu: kmUitEcu, beurtTekst: beurtTekst, volgendeBeurt: volgendeBeurt, leerTik: leerTik }
  };
})();
