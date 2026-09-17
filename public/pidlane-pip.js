// ══════════════════════════════════════════════════════════════════
// pidlane-pip.js — de meting in beeld houden (#228)
// ──────────────────────────────────────────────────────────────────
// WAT DIT OPLOST, EN WAAROM DIT DE JUISTE KANDIDAAT IS.
// De WebView-renderer wordt stilgezet zodra hij niet meer zichtbaar is. Dat
// is op 11-09-2026 drie keer gemeten (59, 59 en 60 s aanloop, daarna 18, 251
// en 426 s stilte) en op 17-09 met de split-screenproef uit elkaar getrokken:
//
//   op de achtergrond   verborgen   én niet vooraan  → de lus valt stil
//   in split-screen     ZICHTBAAR   én niet vooraan  → 99 s, nul gaten
//
// Eén verschil tussen die twee, en dat verschil is zichtbaarheid. In
// picture-in-picture blijft de WebView zichtbaar, dus blijft de renderer
// voorgrond en loopt de meetlus door. Dat is kandidaat 2 uit #228, en sinds
// die meting geen gok meer.
//
// WAT DEZE MODULE WEL EN NIET DOET. Android laat PiP alleen aanzetten zolang
// de activiteit nog vooraan staat — in de praktijk vanuit onUserLeaveHint(),
// het moment waarop de gebruiker wegschakelt. Vragen vanuit JS ná
// `visibilitychange` is te laat: dan is de app al weg en weigert het systeem.
//
// Daarom staat het BESLUIT hier en de UITVOERING daar. Deze module rekent uit
// of PiP nu gewenst is en zet die uitkomst als vlag in de native kant; die
// leest de vlag op het moment dat het mag. Native interpreteert niets — zelfde
// scheiding als bij de meetdienst (#18), en daarmee is de beslisregel hier in
// node te toetsen zonder toestel.
//
// DE UITZETKNOP IS EEN HARDE EIS, EN HIJ STAAT BOVENAAN.
// `feat_pip` in de Config (Airtable → beheer.html) zet deze functie uit, en
// die poort valt vóór alle andere. Een venster dat over de navigatie heen
// gaat staan is precies het bezwaar dat in #228 zelf staat: het gebruiksgeval
// ís de kaart op het scherm. Gaat dat in de weg zitten, dan moet het uit
// kunnen zonder een nieuwe build — vandaar de Config en niet een constante.
//
// EN ALS ER GEEN NATIVE KANT IS. In de browser, in de PWA en in elke APK van
// vóór deze ronde bestaat de plugin niet. Dan doet deze module niets en zegt
// hij dat ook: `beschikbaar()` is false en het besluit draagt die reden.
// Niet-beschikbaar stil als "staat uit" lezen is de fout die #18 anderhalve
// week een verkeerd getal liet rapporteren.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // De sleutel in de Config. Eén plek: beheer.html toont hem onder deze naam,
  // featOn() leest hem, en test-pip.js toetst dat ze hetzelfde lezen.
  var SLEUTEL = 'feat_pip';

  var _inPip = false;          // wat de native kant het laatst meldde
  var _laatsteVlag = null;     // wat we het laatst naar native stuurden
  var _laatsteBesluit = null;  // en waarom — voor blok 5 en het verslag
  var _mini = null;            // het kleine venster, pas gemaakt als het moet

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('PiP-melding niet in de app-log gezet', e); }
  }

  // De plugin, of null. Elke aanroep haalt hem opnieuw op: de Capacitor-bridge
  // is er niet noodzakelijk al als dit bestand laadt, en een eenmalig
  // opgeslagen null zou PiP voorgoed uitzetten.
  function _plug() {
    try {
      var c = window.Capacitor;
      if (!c || !c.Plugins) return null;
      return c.Plugins.PLPip || null;
    } catch (e) {
      console.warn('PiP: Capacitor-bridge niet leesbaar (#228)', e);
      return null;
    }
  }

  function beschikbaar() { return !!_plug(); }

  /* Staat de functie aan in de Config? featOn() woont in pidlane-fuel.js en
     geeft TRUE als de sleutel er niet is — dat is de afspraak in dit project:
     een functie die nooit is uitgezet, staat aan. Ontbreekt featOn zelf (een
     oude schil, of deze module los in een test), dan lezen we de Config
     rechtstreeks met dezelfde regel. Niet stil "uit" aannemen: dan zou een
     ontbrekende functie eruitzien als een beheerdersbesluit. */
  function toggleAan() {
    try {
      if (typeof featOn === 'function') return !!featOn(SLEUTEL);
      var v = (window.PID_CONFIG || {})[SLEUTEL];
      if (v === undefined || v === null || v === '') return true;
      return (v === true || v === 'true' || v === '1' || v === 1);
    } catch (e) {
      console.warn('PiP: Config niet leesbaar — de functie blijft aan (#228)', e);
      return true;
    }
  }

  /* Wat de app op dit moment over zichzelf weet. Apart van besluit(), zodat
     dat besluit een pure functie blijft die in node te draaien is. */
  function feiten() {
    var f = { toggleAan: toggleAan(), beschikbaar: beschikbaar(), verbonden: false, demo: false, sensoren: 0 };
    try { f.verbonden = (typeof connected !== 'undefined') && !!connected; }
    catch (e) { console.warn('PiP: verbindingsstatus onleesbaar (#228)', e); }
    try { f.demo = (typeof demoMode !== 'undefined') && !!demoMode; }
    catch (e) { console.warn('PiP: demostand onleesbaar (#228)', e); }
    try { f.sensoren = (typeof activePIDs !== 'undefined' && activePIDs) ? activePIDs.size : 0; }
    catch (e) { console.warn('PiP: sensorselectie onleesbaar (#228)', e); }
    return f;
  }

  /* HET BESLUIT. Feiten erin, ja/nee eruit, met de reden erbij — en de reden
     is hier geen versiering: "PiP staat niet aan" heeft vijf oorzaken die elk
     iets anders betekenen, en zonder dat onderscheid gaat iemand de verkeerde
     zoeken.

     De volgorde is een keuze. De Config staat bovenaan omdat dat de knop van
     de beheerder is: staat hij uit, dan hoort daar "uitgezet" te staan en niet
     "geen native schil", ook al is dat laatste óók waar. */
  function besluit(f) {
    f = f || {};
    if (!f.toggleAan)
      return { aan: false, sleutel: 'uit', reden: 'uitgezet in de Config (`' + SLEUTEL + '`)' };
    if (!f.beschikbaar)
      return { aan: false, sleutel: 'geen-schil', reden: 'deze schil heeft geen picture-in-picture (browser, PWA of een APK van vóór deze ronde)' };
    if (!f.verbonden)
      return { aan: false, sleutel: 'los', reden: 'geen adapter verbonden — er is niets om door te laten lopen' };
    if (f.demo)
      return { aan: false, sleutel: 'demo', reden: 'demomodus — er loopt geen echte meting die stil kan vallen' };
    if (!f.sensoren)
      return { aan: false, sleutel: 'geen-selectie', reden: 'geen sensoren geselecteerd — de meetlus draait niet' };
    return { aan: true, sleutel: 'ja', reden: 'meting loopt; het venster blijft in beeld zodra je wegschakelt' };
  }

  /* De vlag naar de native kant. Wordt aangeroepen bij elke verandering die
     het besluit kan kantelen, en stuurt alleen als er werkelijk iets wijzigt —
     anders staat er bij elke pollronde een bridge-aanroep. */
  function sync() {
    var b = besluit(feiten());
    _laatsteBesluit = b;
    // Nog niet aan de moduswissel gekoppeld? Dan nu, zolang de bridge er is.
    try { koppel(); } catch (e) { console.warn('PiP: koppelen tijdens sync mislukt (#228)', e); }
    var p = _plug();
    if (!p) { _laatsteVlag = null; return Promise.resolve(b); }
    if (_laatsteVlag === b.aan) return Promise.resolve(b);
    _laatsteVlag = b.aan;
    return Promise.resolve(p.zetGewenst({ aan: b.aan }))
      .then(function () { return b; })
      .catch(function (e) {
        // Niet stil: gaat dit mis, dan blijft de oude vlag in native staan en
        // gedraagt de app zich anders dan dit besluit zegt.
        console.warn('PiP: de vlag is niet bij de native kant aangekomen (#228)', e);
        _laatsteVlag = null;
        return b;
      });
  }

  /* Nu meteen naar PiP. Alleen voor de begeleide run en het beheerscherm: in
     het gewone gebruik gaat het via de vlag, want alleen native weet wanneer
     het mag. */
  function nu() {
    var p = _plug();
    if (!p) return Promise.resolve({ ok: false, reden: 'geen native picture-in-picture in deze schil' });
    return Promise.resolve(p.nu())
      .then(function (r) { return r || { ok: true }; })
      .catch(function (e) { return { ok: false, reden: (e && e.message) || String(e) }; });
  }

  function status() {
    var p = _plug();
    if (!p) return Promise.resolve({ beschikbaar: false, ondersteund: false, gewenst: false, inPip: false });
    return Promise.resolve(p.status())
      .then(function (r) { r = r || {}; _inPip = !!r.inPip; return r; })
      .catch(function (e) {
        console.warn('PiP: status onbereikbaar (#228)', e);
        return { beschikbaar: true, ondersteund: false, gewenst: !!_laatsteVlag, inPip: _inPip, reden: 'status onbereikbaar' };
      });
  }

  /* ── HET KLEINE VENSTER ──────────────────────────────────────────
     Een PiP-venster is ongeveer 240x135 dp. De gewone Live-weergave past daar
     niet in: je ziet dan een uitsnede van een tegel en niets dat zegt dát er
     gemeten wordt. Daarom een eigen, kale weergave — drie waarden en een
     hartslagstip.

     Hij wordt pas gemaakt als hij nodig is, en hij hangt niet in index.html:
     dit is één ding met één betekenis, en het hoort bij deze module. */
  function _maakMini() {
    if (_mini) return _mini;
    var d = document.createElement('div');
    d.id = 'pipMini';
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML =
      '<div class="pip-kop"><span class="pip-stip"></span><span>PidLane meet door</span></div>' +
      '<div class="pip-rij"><b id="pipRpm">—</b><span>tpm</span></div>' +
      '<div class="pip-rij"><b id="pipKmh">—</b><span>km/u</span></div>' +
      '<div class="pip-rij"><b id="pipTemp">—</b><span>°C</span></div>';
    var st = document.createElement('style');
    st.id = 'pipMiniCss';
    st.textContent =
      '#pipMini{display:none;position:fixed;inset:0;z-index:9800;background:#0d1117;color:#e6edf3;' +
      'font-family:var(--f,system-ui);padding:10px 12px;flex-direction:column;justify-content:center;gap:2px}' +
      'body.pl-pip #pipMini{display:flex}' +
      'body.pl-pip>*:not(#pipMini):not(script):not(style){display:none !important}' +
      '#pipMini .pip-kop{display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;margin-bottom:4px}' +
      '#pipMini .pip-stip{width:7px;height:7px;border-radius:50%;background:#00ff88;animation:pipTik 1s infinite}' +
      '#pipMini .pip-rij{display:flex;align-items:baseline;gap:5px;line-height:1.1}' +
      '#pipMini .pip-rij b{font-size:20px;font-weight:800}' +
      '#pipMini .pip-rij span{font-size:11px;color:#8b949e}' +
      '@keyframes pipTik{0%,100%{opacity:1}50%{opacity:.25}}';
    try {
      document.head.appendChild(st);
      document.body.appendChild(d);
    } catch (e) {
      console.warn('PiP: het kleine venster kon niet opgebouwd worden (#228)', e);
      return null;
    }
    _mini = d;
    return d;
  }

  // De drie waarden bijwerken. Geen eigen timer: hij hangt aan de tik die er
  // al is (zie de haak onderaan), want een tweede klok naast de meetlus is
  // precies het soort dubbele bron dat hier al drie keer een bug was.
  function ververs() {
    if (!_inPip || !_mini) return;
    try {
      var v = (typeof pidVals !== 'undefined' && pidVals) ? pidVals : {};
      var zet = function (id, pid, cijfers) {
        var el = document.getElementById(id);
        if (!el) return;
        var w = v[pid];
        el.textContent = (w === undefined || w === null || isNaN(w)) ? '—' : Number(w).toFixed(cijfers || 0);
      };
      zet('pipRpm', '010C', 0);
      zet('pipKmh', '010D', 0);
      zet('pipTemp', '0105', 0);
    } catch (e) {
      console.warn('PiP: het kleine venster is niet bijgewerkt (#228)', e);
    }
  }

  /* De modus is gewijzigd — dit komt van native, via de gebeurtenis of via de
     begeleide run. Twee dingen gebeuren hier, en allebei zijn ze zichtbaar:
     het scherm wisselt van vorm en de app-log zegt het. Zonder die logregel is
     achteraf niet na te gaan of PiP überhaupt aanging tijdens een rit. */
  function modus(inPip) {
    _inPip = !!inPip;
    try {
      if (_inPip) _maakMini();
      if (document.body) document.body.classList[_inPip ? 'add' : 'remove']('pl-pip');
    } catch (e) {
      console.warn('PiP: de schermvorm is niet omgezet (#228)', e);
    }
    ververs();
    _log(_inPip ? 'Picture-in-picture aan — de meting blijft zichtbaar en loopt door (#228)'
                : 'Picture-in-picture uit — het scherm is weer volledig (#228)', 'ok');
    try { if (typeof btDiag === 'function') btDiag('PiP ' + (_inPip ? 'aan' : 'uit'), 'ok'); }
    catch (e) { console.warn('PiP: de busmelding is niet weggeschreven (#228)', e); }
  }

  // ── Aanhaken op wat het besluit kan kantelen ──────────────────────
  // setConn is de plek waar verbinden en verbreken langskomen; dezelfde haak
  // als de meetdienst gebruikt, en om dezelfde reden: er is geen gebeurtenis.
  try {
    if (typeof setConn === 'function') {
      var _s = setConn;
      setConn = function () {
        var r = _s.apply(this, arguments);
        try { sync(); } catch (e) { console.warn('PiP: sync na setConn mislukt (#228)', e); }
        return r;
      };
      window.setConn = setConn;
    } else {
      console.warn('PiP: setConn ontbreekt — de vlag volgt de verbinding niet (#228)');
    }
  } catch (e) {
    console.warn('PiP: kon setConn niet volgen (#228)', e);
  }

  /* De hartslag van het kleine venster is de meetlus zelf. updPID() is de plek
     waar élke binnengekomen waarde langskomt; daar één booleaanse test bij
     zetten is goedkoper dan een tweede klok, en belangrijker: het venster kan
     dan niet "vers" blijven staan terwijl er niets meer binnenkomt. Precies
     dat verschil — doorlopen of stilstaan — is waar #228 over gaat. */
  try {
    if (typeof updPID === 'function') {
      var _u = updPID;
      updPID = function () {
        var r = _u.apply(this, arguments);
        if (_inPip) { try { ververs(); } catch (e) { console.warn('PiP: venster niet ververst (#228)', e); } }
        return r;
      };
      window.updPID = updPID;
    } else {
      console.warn('PiP: updPID ontbreekt — het kleine venster blijft op streepjes staan (#228)');
    }
  } catch (e) {
    console.warn('PiP: kon de meetlus niet volgen (#228)', e);
  }

  /* De gebeurtenis uit de native kant. addListener/removeAllListeners zijn van
     Capacitor zelf en horen niet in PLPipPlugin.java te staan —
     test-nativeschil.js weet dat en slaat ze over bij de vergelijking.

     WAAROM DIT NIET ÉÉN KEER BIJ HET LADEN GEBEURT. De Capacitor-bridge staat
     er niet noodzakelijk al als dit bestand draait. Koppelden we alleen dan,
     dan zou de app in een venster van 240x135 kunnen belanden met de VOLLEDIGE
     weergave erin — de wissel komt binnen, niemand luistert, en er is geen weg
     terug behalve de app opnieuw openen. Daarom elke sync opnieuw proberen,
     tot het één keer gelukt is. */
  var _gekoppeld = false;
  function koppel() {
    if (_gekoppeld) return true;
    try {
      var p = _plug();
      if (!p || typeof p.addListener !== 'function') return false;
      p.addListener('pipModus', function (ev) { modus(!!(ev && ev.in)); });
      _gekoppeld = true;
      return true;
    } catch (e) {
      console.warn('PiP: kon niet naar de moduswissel luisteren (#228)', e);
      return false;
    }
  }
  koppel();

  // Bij het opstarten één keer de stand doorgeven, zodat native niet met een
  // lege vlag begint terwijl er al een meting loopt (herstart tijdens een rit).
  try {
    document.addEventListener('DOMContentLoaded', function () {
      try { sync(); } catch (e) { console.warn('PiP: eerste sync mislukt (#228)', e); }
    });
  } catch (e) {
    console.warn('PiP: kon niet op het opstarten wachten (#228)', e);
  }

  window.PLPip = {
    beschikbaar: beschikbaar,
    toggleAan: toggleAan,
    feiten: feiten,
    besluit: besluit,
    sync: sync,
    status: status,
    nu: nu,
    modus: modus,
    ververs: ververs,
    inPip: function () { return _inPip; },
    laatste: function () { return _laatsteBesluit; },
    _sleutel: function () { return SLEUTEL; }
  };
})();
