/* ══════════════════════════════════════════════════════════════════
   pidlane-strook.js — PLStrook: verbinden zonder vensters (08-11-2026)
   ──────────────────────────────────────────────────────────────────
   WAAROM. Verbinden was venster na venster: adapter kiezen, kenteken,
   protocol, "voertuig bekend, overslaan?", de keuze Inrichten of Meteen
   rijden, de samenvatting en daarna het Check-venster. Voor iemand die
   alleen wil rijden zijn dat zes tikken op vragen waarvan de app het
   antwoord meestal al weet. Wens van de eigenaar: bijna alles onzichtbaar,
   alleen een paar stappen die een vinkje krijgen.

   WAT HET IS. Een smalle strook bovenin met vijf regels:
       Adapter → Protocol → Auto → Klaarzetten → Foutcodes
   Elke regel is wacht / bezig / ok / let / fout. De app blijft eronder
   gewoon bruikbaar, maar zolang het verbinden loopt ligt er een doek
   achter (#plStrookDoek, afdekken()): de schermen eronder springen dan
   heen en weer. Staat alles op ok, dan verdwijnt hij na KLAAR_MS.
   Alleen een regel die iets van de klant nodig heeft houdt hem open:
     • Auto zonder kenteken  → invoerveld in de strook, alleen in stilstand,
                               voorgevuld met het laatst bevestigde kenteken
                               en "controleer" (PLIdentiteit, nooit blind);
     • Nieuwe auto           → knop Inrichten / Niet nu (PLInrichten.nodig());
     • Foutcodes rood/oranje → tik opent Check mijn auto;
     • een fout              → uitleg plus Opnieuw.

   DE STILLE STAND. De stappen zelf draaien in pidlane-bt.js. Daar is
   `_plHervat.stil` de vlag die zegt: niets vragen (zie connectSerial()).
   Kan een stap niet zonder vraag — geen protocol herkend, adapter stil —
   dan valt hij terug op het gewone verbindscherm (`_snelUit()`), en zegt
   de strook dat.

   AFTELLEN. Bij het openen van de app met een bekende adapter: "Verbinden
   met je auto" met een balk die in AFTEL_MS volloopt, Annuleren en een
   vinkje "altijd automatisch" (`pl_verbind_altijd`). Met dat vinkje begint
   het verbinden meteen.

   PUUR (_kern): nieuw, zet, inklappen, afdekken, foutcodeRegel, aftelDeel,
   magKentekenVragen, bekendeAdapter. Getoetst in test-strook.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STAPPEN = [
    { id: 'adapter', naam: 'Adapter' },
    { id: 'protocol', naam: 'Protocol' },
    { id: 'auto', naam: 'Auto' },
    { id: 'klaar', naam: 'Klaarzetten' },
    { id: 'codes', naam: 'Foutcodes' }
  ];
  var STATUS = ['wacht', 'bezig', 'ok', 'let', 'fout', 'over'];
  var AFTEL_MS = 5000;
  var KLAAR_MS = 4000;
  var STIL_KMH = 2;
  var OPSLAG = { altijd: 'pl_verbind_altijd' };

  // ── puur ─────────────────────────────────────────────────────────
  function nieuw() {
    return { stappen: STAPPEN.map(function (s) { return { id: s.id, naam: s.naam, status: 'wacht', tekst: '' }; }), fout: null, vraag: null };
  }
  function zet(st, id, status, tekst) {
    if (STATUS.indexOf(status) < 0) throw new Error('PLStrook: onbekende status ' + status);
    var gevonden = false;
    st.stappen.forEach(function (s) {
      if (s.id !== id) return;
      gevonden = true; s.status = status;
      if (tekst != null) s.tekst = String(tekst);
    });
    if (!gevonden) throw new Error('PLStrook: onbekende stap ' + id);
    return st;
  }
  /* Mag de strook dicht? Alleen als niets nog loopt of iets vraagt. Een
     "let" bij Foutcodes of Auto houdt hem open: daar moet de klant iets zien.
     Net zo de knop Inrichten bij een nieuwe auto: ingeklapt zie je hem niet. */
  function inklappen(st) {
    if (!st || st.fout || st.vraag || st.inricht) return false;
    return st.stappen.every(function (s) { return s.status === 'ok' || s.status === 'over'; });
  }
  /* Het stoplicht van PLFoutcodes → een regel. Grijs is "niet gelezen", en
     dat is nooit ok: dezelfde regel als in stoplicht() zelf. */
  function foutcodeRegel(sl) {
    if (!sl || !sl.kleur) return { status: 'let', tekst: 'Niet gelezen' };
    if (sl.kleur === 'groen') return { status: 'ok', tekst: sl.kop || 'Geen foutcodes' };
    if (sl.kleur === 'rood') return { status: 'fout', tekst: sl.kop || 'Storing gevonden' };
    if (sl.kleur === 'oranje') return { status: 'let', tekst: sl.kop || 'Let op' };
    return { status: 'let', tekst: sl.kop || 'Niet gelezen' };
  }
  /* Moet de app achter de strook afgedekt? Alleen zolang het verbinden
     loopt: de schermen eronder springen dan heen en weer (wens eigenaar,
     09-11-2026). Een fout, een vraag of een "let" (het verbindscherm neemt
     over) haalt het doek weg: dan moet de klant de app kunnen zien. */
  function afdekken(st) {
    if (!st || st.fout || st.vraag) return false;
    if (st.stappen.some(function (s) { return s.status === 'let'; })) return false;
    return st.stappen.some(function (s) { return s.status === 'wacht' || s.status === 'bezig'; });
  }
  function aftelDeel(start, nu, ms) {
    var d = (Number(nu) - Number(start)) / (ms || AFTEL_MS);
    if (!isFinite(d) || d < 0) return 0;
    return d > 1 ? 1 : d;
  }
  /* Nooit een invoerveld tijdens het rijden. Geen snelheid bekend = stilstand,
     zoals stilstand() in PLOpstart. */
  function magKentekenVragen(kmh) {
    var s = Number(kmh);
    return !(isFinite(s) && s > STIL_KMH);
  }
  /* Een adapter die al eens verbond: dan hoeft het verbindscherm niet open.
     Alleen in de app (SPP met een bewaard adres); in de browser vraagt Chrome
     de poort bij elke verbinding, en dat moet op een tik. */
  function bekendeAdapter(lees, native) {
    return !!native && !!lees('spp_address');
  }

  // ── omgeving ─────────────────────────────────────────────────────
  function lees(k) { try { return localStorage.getItem(k); } catch (e) { console.warn('PLStrook: opslag niet te lezen', e); return null; } }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
    catch (e) { console.warn('PLStrook: opslag niet te schrijven', e); }
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function diag(t, soort) { try { if (typeof btDiag === 'function') btDiag('Strook: ' + t, soort || 'info'); } catch (e) { console.warn('PLStrook: diag', e); } }
  function native() { try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) { console.warn('PLStrook: platform niet te lezen', e); return false; } }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLStrook: demoMode niet te lezen', e); return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { console.warn('PLStrook: connected niet te lezen', e); return false; } }
  function snelheid() {
    try { return (typeof pidVals !== 'undefined' && pidVals) ? pidVals['010D'] : null; }
    catch (e) { console.warn('PLStrook: snelheid niet te lezen', e); return null; }
  }
  function altijd() { return lees(OPSLAG.altijd) === '1'; }
  // vehicleInfo staat met let in pidlane-btflow.js: dus niet op window.
  function veh() {
    try { return (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo : {}; }
    catch (e) { console.warn('PLStrook: vehicleInfo niet te lezen', e); return {}; }
  }

  // ── staat ────────────────────────────────────────────────────────
  var _st = null, _open = false, _ingeklapt = false, _dichtT = null, _aftel = null, _kentT = null;

  function wortel() {
    var w = el('plStrook');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'plStrook';
    w.className = 'pl-strook';
    w.setAttribute('role', 'status');
    w.setAttribute('aria-live', 'polite');
    w.hidden = true;
    document.body.appendChild(w);
    return w;
  }

  var TEKEN = { wacht: '·', bezig: '◌', ok: '✓', let: '!', fout: '✕', over: '–' };

  function doek(aan) {
    var d = el('plStrookDoek');
    if (!d && !aan) return;
    if (!d) {
      d = document.createElement('div');
      d.id = 'plStrookDoek';
      d.className = 'pl-strook-doek';
      d.setAttribute('aria-hidden', 'true');
      document.body.appendChild(d);
    }
    d.hidden = !aan;
  }

  function teken() {
    var w = wortel();
    doek(!!(_open && !_aftel && afdekken(_st)));
    // Een herteken (een stap die klaar is) mag getypte invoer niet wissen.
    var inv = el('plStrookKent'), getypt = inv ? inv.value : null, focus = !!inv && document.activeElement === inv;
    if (!_open) { w.hidden = true; return; }
    w.hidden = false;
    w.classList.toggle('in', _ingeklapt);
    var h = '';
    if (_aftel) {
      var d = aftelDeel(_aftel.start, Date.now(), _aftel.ms);
      var rest = Math.max(0, Math.ceil((_aftel.ms - (Date.now() - _aftel.start)) / 1000));
      h += '<div class="pl-strook-kop"><b>Verbinden met je auto</b><span>over ' + rest + ' s</span></div>' +
        '<div class="pl-strook-balk"><i style="width:' + Math.round(d * 100) + '%"></i></div>' +
        '<div class="pl-strook-knoppen">' +
          '<button type="button" class="pl-strook-k p" id="plStrookNu" onclick="PLStrook._nu()">Nu verbinden</button>' +
          '<button type="button" class="pl-strook-k" id="plStrookAnnuleer" onclick="PLStrook._annuleer()">Annuleren</button>' +
          '<label class="pl-strook-vink"><input type="checkbox" id="plStrookAltijd" onchange="PLStrook._altijd(this.checked)"' + (altijd() ? ' checked' : '') + '> altijd automatisch</label>' +
        '</div>';
      w.innerHTML = h;
      return;
    }
    if (!_st) { w.hidden = true; return; }
    var lopend = _st.stappen.filter(function (s) { return s.status === 'bezig'; })[0];
    var kop = _st.fout ? 'Verbinden lukte niet' : (inklappen(_st) ? 'Verbonden' : (lopend ? lopend.naam + '…' : 'Verbinden'));
    h += '<button type="button" class="pl-strook-kop" id="plStrookKop" onclick="PLStrook._wissel()" aria-expanded="' + (!_ingeklapt) + '">' +
      '<b>' + esc(kop) + '</b><span>' + (_ingeklapt ? '▾' : '▴') + '</span></button>';
    if (!_ingeklapt) {
      h += '<div class="pl-strook-lijst">';
      _st.stappen.forEach(function (s) {
        var tik = (s.id === 'codes' && (s.status === 'let' || s.status === 'fout' || s.status === 'ok')) ? ' onclick="PLStrook._codes()" role="button" tabindex="0"' : '';
        h += '<div class="pl-strook-r s-' + s.status + '" data-stap="' + s.id + '"' + tik + '>' +
          '<span class="pl-strook-i" aria-hidden="true">' + TEKEN[s.status] + '</span>' +
          '<span class="pl-strook-n">' + esc(s.naam) + '</span>' +
          '<span class="pl-strook-t">' + esc(s.tekst) + '</span></div>';
        if (s.id === 'auto' && _st.vraag === 'kenteken') h += kentekenVeld();
      });
      h += '</div>';
      if (_st.fout) {
        h += '<div class="pl-strook-fout">' + esc(_st.fout).replace(/\n/g, '<br>') + '</div>' +
          '<div class="pl-strook-knoppen">' +
            '<button type="button" class="pl-strook-k p" id="plStrookOpnieuw" onclick="PLStrook._opnieuw()">Opnieuw</button>' +
            '<button type="button" class="pl-strook-k" onclick="PLStrook._details()">Details</button>' +
            '<button type="button" class="pl-strook-k" onclick="PLStrook.sluit()">Sluiten</button>' +
          '</div>';
      }
      if (_st.inricht && !_st.fout) {
        h += '<div class="pl-strook-knoppen" id="plStrookInricht"><span class="pl-strook-t">Nieuwe auto — even inrichten?</span>' +
          '<button type="button" class="pl-strook-k p" onclick="PLStrook._inrichten()">Inrichten</button>' +
          '<button type="button" class="pl-strook-k" onclick="PLStrook._nietNu()">Niet nu</button></div>';
      }
    }
    w.innerHTML = h;
    var na = el('plStrookKent');
    if (na && getypt !== null) { na.value = getypt; if (focus) try { na.focus(); } catch (e) { console.warn('PLStrook: focus', e); } }
  }
  function kentekenVeld() {
    if (!magKentekenVragen(snelheid())) {
      return '<div class="pl-strook-kent"><span class="pl-strook-t">Kenteken invullen kan zodra de auto stilstaat</span></div>';
    }
    // Het laatst bevestigde kenteken als voorinvulling: één tik als het
    // dezelfde auto is, maar altijd met "controleer" — nooit stil overnemen.
    var sug = laatst();
    return '<div class="pl-strook-kent">' +
      (sug ? '<span class="pl-strook-t">Laatst gebruikt: ' + esc(sug) + ' — controleer of dit deze auto is</span>' : '') +
      '<input id="plStrookKent" placeholder="Kenteken" maxlength="8" autocomplete="off" aria-label="Kenteken" value="' + esc(sug) + '">' +
      '<button type="button" class="pl-strook-k p" id="plStrookKentOk" onclick="PLStrook._kenteken()">Opzoeken</button>' +
      '<button type="button" class="pl-strook-k" onclick="PLStrook._kentLater()">Later</button>' +
      '<div class="pl-strook-t" id="plStrookKentSt"></div></div>';
  }
  function plan() {
    clearTimeout(_dichtT);
    // Alles klaar: de strook verdwijnt helemaal (wens eigenaar, 09-11-2026).
    // _st blijft staan: blok 5 leest de laatste verbinding uit staat().
    if (_st && inklappen(_st)) _dichtT = setTimeout(function () { _open = false; _ingeklapt = false; teken(); }, KLAAR_MS);
  }

  // ── openbaar: de stappen ─────────────────────────────────────────
  function start() {
    if (isDemo()) return;
    stopAftel();
    _st = nieuw(); _open = true; _ingeklapt = false;
    zet(_st, 'adapter', 'bezig', 'zoeken');
    teken();
  }
  function stap(id, status, tekst) {
    if (!_st) return;
    try { zet(_st, id, status, tekst); }
    catch (e) { console.warn(e); return; }
    if (status === 'bezig') _st.fout = null;
    teken(); plan();
  }
  /* Na een fout: wat nog niet klaar was, wordt "over"; de stap die bezig
     was, krijgt het kruis. Zonder lopende stap: de adapter. */
  function fout(msg) {
    if (!_st) start();
    if (!_st) return;
    var bezig = _st.stappen.filter(function (s) { return s.status === 'bezig'; })[0];
    _st.stappen.forEach(function (s) {
      if (s === bezig) s.status = 'fout';
      else if (s.status === 'wacht') s.status = 'over';
    });
    if (!bezig) zet(_st, 'adapter', 'fout');
    _st.fout = String(msg || 'Onbekende fout');
    _open = true; _ingeklapt = false;
    clearTimeout(_dichtT);
    teken();
  }
  /* Een stap kan niet zonder vraag: het gewone verbindscherm neemt over.
     De strook blijft staan en zegt waar de vraag is. */
  function naarVenster(id, tekst) {
    stap(id, 'let', tekst || 'kies in het verbindscherm');
  }
  function sluit() {
    clearTimeout(_dichtT); stopAftel();
    _open = false; _st = null;
    teken();
  }
  function actief() { return !!(_open && _st && !inklappen(_st)); }

  // ── de kentekenregel ─────────────────────────────────────────────
  function vraagKenteken() {
    if (!_st) return;
    _st.vraag = 'kenteken';
    zet(_st, 'auto', 'let', 'kenteken nodig');
    _open = true; _ingeklapt = false;
    teken();
    // Rijdt de auto, dan elke 3 s kijken of hij stilstaat; dan pas het veld.
    clearInterval(_kentT);
    _kentT = setInterval(function () {
      if (!_st || _st.vraag !== 'kenteken') { clearInterval(_kentT); return; }
      var heeftVeld = !!el('plStrookKent');
      if (heeftVeld !== magKentekenVragen(snelheid())) teken();
    }, 3000);
  }
  function kentekenOk(tekst) {
    if (!_st) return;
    _st.vraag = null; clearInterval(_kentT);
    zet(_st, 'auto', 'ok', tekst || '');
    // Zonder VIN is het kenteken nu de herkenning: de lus van PLGarage
    // (herkenAuto → selectieZonderVin) zet de selectie bij de volgende tik.
    inrichtVraag();
    teken(); plan();
  }
  function _kenteken() {
    var inp = el('plStrookKent'), st = el('plStrookKentSt');
    var k = String((inp && inp.value) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (k.length < 4) { if (st) st.textContent = 'Minimaal 4 tekens'; return Promise.resolve(false); }
    if (typeof rdwLookup !== 'function') { if (st) st.textContent = 'Opzoeken kan nu niet'; return Promise.resolve(false); }
    if (st) st.textContent = 'Opzoeken bij de RDW…';
    return Promise.resolve(rdwLookup(false, { kenteken: k, statusEl: st })).then(function (r) {
      if (!(r && r.ok)) return false;
      // Brandstof is nu bekend: de zeef opnieuw, en het profiel met kenteken bewaren.
      try { if (typeof herijkPidGate === 'function') herijkPidGate('kenteken uit de strook'); }
      catch (e) { diag('herijking na kenteken mislukt: ' + (e.message || e), 'warn'); }
      try { var v = veh().vin; if (v && typeof saveVinProfile === 'function') saveVinProfile(v); }
      catch (e) { diag('profiel niet bijgewerkt met kenteken: ' + (e.message || e), 'warn'); }
      kentekenOk(autoTekst());
      return true;
    }, function (e) { if (st) st.textContent = 'Opzoeken mislukt: ' + ((e && e.message) || e); return false; });
  }
  function _kentLater() {
    if (!_st) return;
    _st.vraag = null; clearInterval(_kentT);
    zet(_st, 'auto', 'let', 'zonder kenteken — later via Mijn auto');
    teken();
  }
  function kentekenNu() { return window.PLIdentiteit ? PLIdentiteit.kenteken() : ''; }
  function kentekenBekend() { return !!(window.PLIdentiteit && PLIdentiteit.bekend()); }
  function laatst() { return window.PLIdentiteit ? PLIdentiteit.laatst() : ''; }
  /* De wizard bij een nieuwe auto: geen venster (besluit 08-11), wel een
     knop. Alleen als de auto herkend is (VIN of bevestigd kenteken): anders
     zou hij onder de gedeelde sleutel 'onbekend' bewaren. */
  var _hervatNu = false;
  function inrichtVraag() {
    if (!_st) return;
    var v = veh();
    if (!(v.vin || kentekenBekend())) { _st.inricht = false; return; }
    try { _st.inricht = !!(window.PLInrichten && PLInrichten.nodig && PLInrichten.nodig({ hervat: _hervatNu })); }
    catch (e) { diag('setup-wizard niet te beoordelen: ' + (e.message || e), 'warn'); _st.inricht = false; }
  }
  function _inrichten() {
    if (_st) _st.inricht = false; teken();
    try { if (window.PLInrichten) PLInrichten.open(); } catch (e) { diag('setup-wizard opent niet: ' + (e.message || e), 'warn'); }
  }
  function _nietNu() {
    if (_st) _st.inricht = false; teken(); plan();
    try { if (window.PLInrichten && PLInrichten.rijdenStil) PLInrichten.rijdenStil(); } catch (e) { diag('keuze niet bewaard: ' + (e.message || e), 'warn'); }
  }
  function autoTekst() {
    var v = veh();
    var k = kentekenNu();
    var naam = [v.merk, v.model].filter(Boolean).join(' ');
    return [naam, k].filter(Boolean).join(' · ') || (v.vin ? 'VIN herkend' : 'herkend');
  }

  // ── na het verbinden: auto, kenteken en foutcodes ───────────────
  /* Vanuit startDiscovery(), als alles klaarstaat. opties: { hervat, opstart }.
     Vervangt de vensters die daar stonden (samenvatting, keuze Inrichten,
     Check mijn auto). */
  function naVerbinding(opties) {
    opties = opties || {};
    if (!_st) { _st = nieuw(); _open = true; }
    ['adapter', 'protocol'].forEach(function (id) {
      var s = _st.stappen.filter(function (x) { return x.id === id; })[0];
      if (s && s.status !== 'ok') s.status = 'ok';
    });
    _hervatNu = !!opties.hervat;
    if (!kentekenBekend()) vraagKenteken();
    else if (_st.stappen[2].status !== 'ok') zet(_st, 'auto', 'ok', autoTekst());
    inrichtVraag();
    teken();
    return codes(opties).then(function () { plan(); });
  }
  /* Foutcodes: één keer per auto per dag, stil. Een hervatting midden in de
     rit leest niet opnieuw; meekijken op afstand ook niet. Heeft de klant
     "Check na verbinden" aan, dan opent PLNav het venster zoals altijd. */
  function codes(opties) {
    var nee = function (t) { stap('codes', 'over', t); return Promise.resolve(null); };
    if (opties.hervat && !opties.opstart) return nee('hervat — niet opnieuw gelezen');
    if (window._remoteVehicleMode) return nee('meekijken op afstand');
    if (!window.PLFoutcodes || typeof PLFoutcodes.scanStil !== 'function') return nee('niet beschikbaar');
    try {
      if (window.PLNav && PLNav.autoCheck && PLNav.autoCheck() && PLNav.naVerbinding(opties)) {
        stap('codes', 'ok', 'Check mijn auto geopend');
        return Promise.resolve(null);
      }
    } catch (e) { diag('Check na verbinden niet geopend: ' + (e.message || e), 'warn'); }
    var vandaag = false;
    try { vandaag = !!(window.PLOpstart && PLOpstart.checkVandaag()); }
    catch (e) { diag('dagcheck niet te lezen — toch lezen: ' + (e.message || e), 'warn'); }
    if (vandaag) {
      var vorig = (PLFoutcodes.staat && PLFoutcodes.staat().scan) || null;
      var r0 = vorig ? foutcodeRegel(PLFoutcodes.stoplicht(vorig)) : { status: 'ok', tekst: '' };
      stap('codes', r0.status, (r0.tekst ? r0.tekst + ' · ' : '') + 'vandaag al gelezen');
      return Promise.resolve(vorig);
    }
    stap('codes', 'bezig', 'uitlezen');
    return Promise.resolve(PLFoutcodes.scanStil()).then(function (s) {
      if (!s) { stap('codes', 'let', 'uitlezen lukte niet — tik om opnieuw te proberen'); return null; }
      try { if (window.PLOpstart) PLOpstart.checkGedaan(); }
      catch (e) { diag('dagcheck niet bewaard: ' + (e.message || e), 'warn'); }
      var r = foutcodeRegel(PLFoutcodes.stoplicht(s));
      stap('codes', r.status, r.tekst);
      return s;
    }, function (e) {
      stap('codes', 'let', 'uitlezen mislukt: ' + ((e && e.message) || e));
      return null;
    });
  }

  // ── aftellen bij het openen ──────────────────────────────────────
  function stopAftel() {
    if (!_aftel) return;
    clearInterval(_aftel.tik); _aftel = null;
  }
  /* fn = het verbinden. Met "altijd automatisch" meteen; anders na AFTEL_MS,
     tenzij Annuleren. Geeft true als er (meteen of straks) verbonden wordt. */
  function aftellen(fn, opties) {
    opties = opties || {};
    if (typeof fn !== 'function') return false;
    stopAftel();
    if (altijd()) { fn(); return true; }
    var ms = opties.ms || AFTEL_MS;
    _open = true; _st = null; _ingeklapt = false;
    _aftel = { start: Date.now(), ms: ms, fn: fn, tik: null };
    _aftel.tik = setInterval(function () {
      if (!_aftel) return;
      if (Date.now() - _aftel.start >= _aftel.ms) { var f = _aftel.fn; stopAftel(); f(); return; }
      teken();
    }, 200);
    teken();
    return true;
  }
  function _nu() { if (!_aftel) return; var f = _aftel.fn; stopAftel(); f(); }
  function _annuleer() {
    stopAftel(); _open = false; teken();
    try { if (typeof logUsage === 'function') logUsage('strook', 'annuleer'); } catch (e) { console.warn('PLStrook: logUsage', e); }
  }
  function _altijd(aan) { schrijf(OPSLAG.altijd, aan ? '1' : null); }

  // ── de ingang: één knop "Verbind met je auto" ────────────────────
  /* Bekende adapter in de app: meteen verbinden, het verbindscherm blijft
     dicht. Anders het verbindscherm (eerste keer: adaptertype en de
     Bluetooth-keuze van Android). */
  function verbind() {
    if (isVerbonden() || isDemo()) return false;
    if (bekendeAdapter(lees, native()) && typeof connectSerial === 'function') {
      start();
      Promise.resolve(connectSerial()).catch(function (e) { fout('Verbinden mislukt: ' + ((e && e.message) || e)); });
      return true;
    }
    try { el('connOv').classList.remove('hidden'); }
    catch (e) { console.warn('PLStrook: verbindscherm opent niet', e); }
    return false;
  }
  function _opnieuw() {
    var w = _st; sluit();
    if (w && typeof connectSerial === 'function') { start(); Promise.resolve(connectSerial()).catch(function (e) { fout('Verbinden mislukt: ' + ((e && e.message) || e)); }); }
  }
  function _details() {
    try { el('connOv').classList.remove('hidden', 'pl-stil', 'pl-snel'); }
    catch (e) { console.warn('PLStrook: verbindscherm opent niet', e); }
  }
  function _codes() {
    try { if (window.PLFoutcodes) PLFoutcodes.open(); }
    catch (e) { console.warn('PLStrook: Check mijn auto opent niet', e); }
  }
  function _wissel() {
    _ingeklapt = !_ingeklapt;
    if (!_ingeklapt) clearTimeout(_dichtT);
    teken();
    if (!_ingeklapt) plan();
  }

  /* Mag er na het inloggen afgeteld worden? Alleen met een bekende adapter,
     niet verbonden, niet in de demo. */
  function verbindMag() { return !isVerbonden() && !isDemo() && bekendeAdapter(lees, native()); }

  window.plVerbindOpen = verbind;
  window.PLStrook = {
    start: start, stap: stap, fout: fout, naarVenster: naarVenster, sluit: sluit, actief: actief,
    vraagKenteken: vraagKenteken, naVerbinding: naVerbinding, aftellen: aftellen, verbind: verbind, verbindMag: verbindMag,
    altijd: altijd, autoTekst: autoTekst,
    staat: function () { return { st: _st, open: _open, ingeklapt: _ingeklapt, aftel: !!_aftel }; },
    _nu: _nu, _annuleer: _annuleer, _altijd: _altijd, _opnieuw: _opnieuw, _details: _details,
    _codes: _codes, _wissel: _wissel, _kenteken: _kenteken, _kentLater: _kentLater, _inrichten: _inrichten, _nietNu: _nietNu,
    _kern: { STAPPEN: STAPPEN, AFTEL_MS: AFTEL_MS, KLAAR_MS: KLAAR_MS, nieuw: nieuw, zet: zet, inklappen: inklappen, afdekken: afdekken,
      foutcodeRegel: foutcodeRegel, aftelDeel: aftelDeel, magKentekenVragen: magKentekenVragen, bekendeAdapter: bekendeAdapter }
  };
})();
