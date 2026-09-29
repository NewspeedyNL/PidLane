/* ═══════════════════════════════════════════════════════════════════
   pidlane-afsluiten.js — PLAfsluiten: "Rit beëindigen", één venster
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   Onderin het menu stonden "Uitloggen" en "Sluit de app". Geen van twee
   wist van de rit. Wie uitstapt wil één ding — klaar — en daar horen
   vier vragen bij die elk hun eigen knop hadden, of geen:

     • de rit afsluiten, met een naam erbij        (had geen knop)
     • wat de rit was: km, duur, verbruik           (alleen achteraf, in de garage)
     • de verbinding verbreken                     (adapterpaneel)
     • uitloggen of de app sluiten                 (het menu)

   Dit venster zet ze onder elkaar, en voert ze in een VASTE volgorde uit.
   De volgorde is niet cosmetisch: de rit moet af vóór de verbinding weg
   is (anders ziet de garage "verbinding weg" en parkeert hij hem), de
   sessie moet bewaard zijn vóór het uitloggen (dat wist de gebruiker),
   en de app gaat pas dicht als de rest klaar is.

     1. rit      PLGarage.ritBeeindig(naam)
     2. verbreek handleConnect(): saveSession, bus vrijgeven (ATPC), socket dicht
     3. uitlog   logout()
     4. sluit    plSluitApp(): meetdienst stoppen, App.exitApp()

   Elke stap krijgt hoogstens AFSLUIT_STAP_MS. Een server of adapter die
   niet antwoordt mag de klant niet in het venster laten staan: de rit
   staat dan in de wachtrij van de garage en gaat later alsnog weg.

   WAT HIER NIET BESLIST WORDT

   Of de rit voorbij is als de klant niets doet, staat in PLGarage
   (ritStand: vijftien minuten zonder beweging). Motor uit is géén einde.
   Dit venster is de handmatige weg ernaast, niet een tweede regel.

   AUTOMATISCH VERBINDEN

   handleConnect() wist pl_autoconn — "bewust verbroken, niet vanzelf
   terug". Dat klopt voor wie in de app blijft: anders verbindt de app
   bij de volgende keer dat hij in beeld komt meteen weer. Maar wie de
   app sluit, wil morgen gewoon verbonden worden. Daarom zet stap 2 de
   vlag terug als stap 4 volgt en er niet uitgelogd wordt. Dezelfde
   sleutel is ook de voorkeur "Automatisch verbinden" (pidlane-voorkeur.js);
   terugzetten betekent dus: laten zoals de klant hem had.

   EEN METING DIE NOG LOOPT

   Een caravanrit en een rit-analyse maken bij het stoppen een rapport,
   en dat rapport heeft de app nodig. Loopt er een, dan staat hij
   bovenaan met een eigen knop om hem af te ronden, en blijft de
   hoofdknop dicht tot dat gebeurd is. Stilletjes meenemen zou een
   rapport weggooien dat de klant nog niet gezien heeft.

   PUUR EN NIET PUUR. opties() en plan() zijn zuiver en worden in
   test-afsluiten.js met vm getoetst; voerUit() praat met de app en
   wordt in bproef-afsluiten.js in de echte app getoetst.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var AFSLUIT_STAP_MS = 4000;
  var KEUZE_SLEUTEL = 'pl_afsluit_keuze';   // de vorige keuze, per toestel

  // ── zuiver ─────────────────────────────────────────────────────────
  /* ctx: { verbonden, rit (er loopt een rit), schil (APK), ingelogd }
     → welke keuzes er zijn, en welke standaard is. */
  function opties(ctx) {
    ctx = ctx || {};
    var na = [];
    if (ctx.verbonden) na.push('blijf', 'verbreek');
    if (ctx.schil) na.push('sluit');
    if (!ctx.verbonden && !ctx.schil) na.push('blijf');   // alleen de rit, of alleen uitloggen
    return { na: na, uitloggen: !!ctx.ingelogd, standaard: ctx.verbonden ? 'verbreek' : na[0] };
  }

  /* keuze: { na: 'blijf'|'verbreek'|'sluit', uitloggen: bool }
     → de stappen, in de enige volgorde die klopt. */
  function plan(keuze, ctx) {
    ctx = ctx || {}; keuze = keuze || {};
    var st = [];
    if (ctx.rit) st.push('rit');
    var sluit = keuze.na === 'sluit' && !!ctx.schil;
    if (ctx.verbonden && (keuze.na === 'verbreek' || sluit || keuze.uitloggen)) st.push('verbreek');
    if (keuze.uitloggen && ctx.ingelogd) st.push('uitlog');
    if (sluit) st.push('sluit');
    return st;
  }

  /* Na het verbreken: pl_autoconn terugzetten? Alleen als de app dicht gaat
     zonder uitloggen, en alleen als hij vóór het verbreken aan stond. */
  function autoconnTerug(stappen, vlagVooraf) {
    return vlagVooraf === '1' && stappen.indexOf('sluit') >= 0 && stappen.indexOf('uitlog') < 0;
  }

  // ── de app lezen ──────────────────────────────────────────────────
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { return false; } }
  function isSchil() { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  // Twee plekken: `let currentUser` in pidlane-auth.js staat niet op window, en
  // PLGarage en de proeven lezen window.currentUser. Eén van beide is genoeg.
  function isIngelogd() { try { return !!window.currentUser || (typeof currentUser !== 'undefined' && !!currentUser); } catch (e) { return false; } }
  function ritNu() { try { return window.PLGarage && typeof PLGarage.ritNu === 'function' ? PLGarage.ritNu() : null; } catch (e) { console.warn('PLAfsluiten: rit niet te lezen', e); return null; } }
  function lopend() {
    var uit = [];
    try {
      if (typeof caravanActive !== 'undefined' && caravanActive) uit.push({ id: 'caravan', naam: 'Caravanrit', stop: 'stopCaravan' });
      if (typeof ritActive !== 'undefined' && ritActive) uit.push({ id: 'rit', naam: 'Rit-analyse', stop: 'stopRitAnalyse' });
    } catch (e) { console.warn('PLAfsluiten: lopende metingen niet te lezen', e); }
    return uit;
  }
  function ctxNu() {
    var r = ritNu();
    return { verbonden: isVerbonden(), rit: !!r, schil: isSchil(), ingelogd: isIngelogd(), ritInfo: r, lopend: lopend() };
  }
  function lees(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function schrijf(k, w) {
    try { if (w == null) localStorage.removeItem(k); else localStorage.setItem(k, w); }
    catch (e) { console.warn('PLAfsluiten: opslag ' + k, e); }
  }

  // ── uitvoeren ─────────────────────────────────────────────────────
  function binnen(p) {
    return Promise.race([Promise.resolve(p), new Promise(function (r) { setTimeout(function () { r('tijd'); }, AFSLUIT_STAP_MS); })]);
  }
  async function voerUit(stappen, label) {
    var gedaan = [];
    for (var i = 0; i < stappen.length; i++) {
      var s = stappen[i];
      try {
        if (s === 'rit') await binnen(PLGarage.ritBeeindig(label || null));
        else if (s === 'verbreek') {
          var vlag = lees('pl_autoconn');
          if (isVerbonden()) await binnen(handleConnect());
          if (autoconnTerug(stappen, vlag)) schrijf('pl_autoconn', '1');
        }
        else if (s === 'uitlog') await binnen(logout());
        else if (s === 'sluit') {
          var dicht = await plSluitApp();
          // Ging de app niet dicht, dan blijft hij open en verbroken: dan mag
          // hij ook niet vanzelf weer gaan verbinden.
          if (!dicht) { schrijf('pl_autoconn', null); gedaan.push('sluit mislukt'); continue; }
        }
        gedaan.push(s);
      } catch (e) { console.warn('PLAfsluiten: stap ' + s + ' mislukt', e); gedaan.push(s + ' mislukt'); }
    }
    return gedaan;
  }

  // ── venster ───────────────────────────────────────────────────────
  var _keuze = null, _label = '', _bezig = false;

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function nl(x, d) { return Number(x).toLocaleString('nl', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function duurTekst(s) {
    var m = Math.round((s || 0) / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' u ' + (m % 60) + ' min';
  }

  var NA_TEKST = {
    blijf: ['Verbonden blijven', 'Alleen de rit afsluiten; de meting loopt door.'],
    verbreek: ['Verbinding verbreken', 'De adapter komt vrij. De app blijft open.'],
    sluit: ['App sluiten', 'Verbreken en de app dichtdoen. Volgende keer verbindt hij weer vanzelf, als dat aan stond.']
  };

  var CSS =
    '#plAfOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plAfOv .af-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:520px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f)}' +
    '#plAfOv .af-kop{display:flex;align-items:center;gap:9px} #plAfOv .af-titel{font:800 16px var(--f);color:var(--tx)}' +
    '#plAfOv .af-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
    '#plAfOv .af-sub{font-size:12px;color:var(--tx3);margin:2px 0 12px}' +
    '#plAfOv .af-blok{background:var(--sur);border:1px solid var(--bd);border-radius:11px;padding:10px 12px;margin-bottom:10px}' +
    '#plAfOv .af-bh{font:800 13px var(--f);color:var(--tx);margin-bottom:6px}' +
    '#plAfOv .af-cijfers{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}' +
    '#plAfOv .af-c{background:var(--sur2);border-radius:8px;padding:6px 8px} #plAfOv .af-cw{font:800 15px var(--f);color:var(--tx)} #plAfOv .af-cl{font-size:10.5px;color:var(--tx3)}' +
    '#plAfOv .af-u{font-size:11.5px;color:var(--tx3);margin-top:6px}' +
    '#plAfOv .af-in{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:600 13px var(--f)}' +
    '#plAfOv .af-labels{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}' +
    '#plAfOv .af-lab{padding:5px 9px;border-radius:14px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font:600 11.5px var(--f);cursor:pointer}' +
    '#plAfOv .af-lab.aan{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plAfOv .af-keuze{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--bd);cursor:pointer} #plAfOv .af-keuze:first-of-type{border-top:0}' +
    '#plAfOv .af-keuze input{margin-top:2px;flex:none} #plAfOv .af-kt{font:700 12.5px var(--f);color:var(--tx)} #plAfOv .af-ku{font-size:11px;color:var(--tx3);margin-top:2px}' +
    '#plAfOv .af-melding{font-size:12px;padding:9px 11px;border-radius:9px;margin-bottom:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.5);color:var(--tx2)}' +
    '#plAfOv .af-knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
    '#plAfOv .af-k{flex:1 1 140px;padding:11px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
    '#plAfOv .af-k.hoofd{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plAfOv .af-k:disabled{opacity:.45;cursor:not-allowed}';

  function open() {
    if (!document.getElementById('plAfCss')) { var s = document.createElement('style'); s.id = 'plAfCss'; s.textContent = CSS; document.head.appendChild(s); }
    var ov = document.getElementById('plAfOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plAfOv';
      ov.innerHTML = '<div class="af-doos"><div class="af-kop"><div class="af-titel" id="plAfTitel"></div>' +
        '<button class="af-x" aria-label="Sluiten" onclick="PLAfsluiten.sluit()">✕</button></div>' +
        '<div id="plAfBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov && !_bezig) sluit(); });
    }
    var ctx = ctxNu(), o = opties(ctx);
    var vorige = null;
    try { vorige = JSON.parse(lees(KEUZE_SLEUTEL) || 'null'); } catch (e) { vorige = null; }
    // Alleen "daarna" wordt onthouden. Uitloggen staat elke keer uit: vanzelf
    // aangevinkt uitloggen is een verrassing die je één keer meemaakt.
    _keuze = { na: vorige && o.na.indexOf(vorige.na) >= 0 ? vorige.na : o.standaard, uitloggen: false };
    _label = (ctx.ritInfo && ctx.ritInfo.voorstel) || '';
    _bezig = false;
    ov.style.display = 'flex';
    teken();
  }
  function sluit() { if (_bezig) return; var ov = document.getElementById('plAfOv'); if (ov) ov.style.display = 'none'; }

  function tekenRit(ri) {
    if (!ri) return '';
    var h = '<div class="af-blok"><div class="af-bh">🚗 Deze rit' + (ri.voertuig ? ' — ' + esc(ri.voertuig) : '') + '</div>';
    var s = ri.sam;
    if (!s) return h + '<div class="af-u">Nog geen rit om te bewaren: korter dan 0,3 km. Afsluiten gooit hem weg.</div></div>';
    var c = [[nl(s.km, 1) + ' km', 'afstand'], [duurTekst(s.duur_s), 'duur']];
    if (s.gem_kmh != null) c.push([nl(s.gem_kmh) + ' km/u', 'gemiddeld rijdend']);
    if (s.verbruik_l100 != null) c.push([nl(s.verbruik_l100, 1) + ' l/100', 'verbruik']);
    if (s.max_koelwater != null) c.push([nl(s.max_koelwater) + ' °C', 'hoogste koelwater']);
    if (s.min_accu != null) c.push([nl(s.min_accu, 1) + ' V', 'laagste accu (motor aan)']);
    if (s.codes && s.codes.length) c.push([s.codes.length + '', 'foutcode' + (s.codes.length === 1 ? '' : 's')]);
    if (s.extra && s.extra.pauzes) c.push([s.extra.pauzes + '×', 'pauze (' + duurTekst(s.extra.pauze_s) + ')']);
    h += '<div class="af-cijfers">' + c.map(function (x) { return '<div class="af-c"><div class="af-cw">' + esc(x[0]) + '</div><div class="af-cl">' + esc(x[1]) + '</div></div>'; }).join('') + '</div>';
    if (ri.stand === 'pauze') h += '<div class="af-u">⏸ Stil sinds ' + ri.stilMin + ' min. Rijd je binnen ' + ri.pauzeMin + ' minuten verder, dan loopt deze rit vanzelf door — afsluiten hoeft dus niet.</div>';
    else h += '<div class="af-u">Doe je niets, dan sluit de app de rit zelf af na ' + ri.pauzeMin + ' minuten stilstand.</div>';
    h += '</div>';
    h += '<div class="af-blok"><div class="af-bh">Naam</div><input class="af-in" id="plAfLabel" maxlength="40" placeholder="bijv. Woon-werk" value="' + esc(_label) + '" oninput="PLAfsluiten._label(this.value, true)">' +
      (ri.voorstel ? '<div class="af-u">💡 Voorstel: eerdere ritten op dit tijdstip met deze afstand heetten <b>' + esc(ri.voorstel) + '</b>.</div>' : '') +
      '<div class="af-labels">' + (ri.labels || []).map(function (l) {
        return '<button class="af-lab' + (l === _label ? ' aan' : '') + '" onclick="PLAfsluiten._label(' + esc(JSON.stringify(l)) + ')">' + esc(l) + '</button>';
      }).join('') + '</div></div>';
    return h;
  }

  function teken() {
    var b = document.getElementById('plAfBody'), t = document.getElementById('plAfTitel');
    if (!b) return;
    var ctx = ctxNu(), o = opties(ctx);
    if (t) t.textContent = ctx.rit ? '🏁 Rit beëindigen' : '⏏ Afsluiten';
    var h = '<div class="af-sub">' + (ctx.rit ? 'Rond de rit af en kies wat er daarna gebeurt.' : 'Er loopt geen rit. Kies wat er gebeurt.') + '</div>';
    ctx.lopend.forEach(function (m) {
      h += '<div class="af-melding">' + esc(m.naam) + ' loopt nog. Rond die eerst af: het rapport heeft de app nodig.' +
        '<div class="af-knoppen"><button class="af-k" onclick="PLAfsluiten._stopMeting(\'' + m.id + '\')">' + esc(m.naam) + ' afronden</button></div></div>';
    });
    h += tekenRit(ctx.ritInfo);
    h += '<div class="af-blok"><div class="af-bh">Daarna</div>';
    o.na.forEach(function (k) {
      var tk = (k === 'blijf' && !ctx.verbonden) ? ['In de app blijven', ctx.rit ? 'Alleen de rit afsluiten.' : 'Niets verbreken, niets sluiten.'] : NA_TEKST[k];
      h += '<label class="af-keuze"><input type="radio" name="plAfNa" value="' + k + '"' + (_keuze.na === k ? ' checked' : '') + ' onchange="PLAfsluiten._na(\'' + k + '\')">' +
        '<span><div class="af-kt">' + tk[0] + '</div><div class="af-ku">' + tk[1] + '</div></span></label>';
    });
    if (o.uitloggen) h += '<label class="af-keuze"><input type="checkbox" id="plAfUit"' + (_keuze.uitloggen ? ' checked' : '') + ' onchange="PLAfsluiten._uit(this.checked)">' +
      '<span><div class="af-kt">Ook uitloggen</div><div class="af-ku">Voor een gedeeld toestel. De volgende gebruiker ziet dan niets van jou.</div></span></label>';
    h += '</div>';
    var stappen = plan(_keuze, ctx);
    var dicht = _bezig || ctx.lopend.length > 0 || !stappen.length;
    h += '<div class="af-knoppen"><button class="af-k" onclick="PLAfsluiten.sluit()"' + (_bezig ? ' disabled' : '') + '>Terug</button>' +
      '<button class="af-k hoofd" id="plAfDoe" onclick="PLAfsluiten._doe()"' + (dicht ? ' disabled' : '') + '>' +
      (_bezig ? 'Bezig…' : (ctx.rit ? 'Rit beëindigen' : 'Afsluiten')) + '</button></div>';
    b.innerHTML = h;
  }

  async function doe() {
    if (_bezig) return;
    var ctx = ctxNu();
    if (ctx.lopend.length) return;
    var stappen = plan(_keuze, ctx);
    if (!stappen.length) return;
    schrijf(KEUZE_SLEUTEL, JSON.stringify({ na: _keuze.na }));
    _bezig = true; teken();
    var gedaan = [];
    try { gedaan = await voerUit(stappen, (_label || '').trim()); }
    finally { _bezig = false; }
    if (typeof btDiag === 'function') btDiag('Afsluiten: ' + gedaan.join(' → '), 'info');
    sluit();
  }

  // Het menu-item zegt wat het doet: "Rit beëindigen" als er een rit loopt.
  // toggleKebab() (pidlane-uihelpers.js) roept dit bij elke keer openen aan.
  function verversMenu() {
    var k = document.getElementById('kbAfsluiten');
    if (k) k.textContent = ritNu() ? '🏁 Rit beëindigen' : '⏏ Afsluiten';
  }

  window.PLAfsluiten = {
    open: open,
    sluit: sluit,
    verversMenu: verversMenu,
    _na: function (k) { _keuze.na = k; teken(); },
    _uit: function (w) { _keuze.uitloggen = !!w; teken(); },
    _label: function (l, getypt) { _label = String(l || '').slice(0, 40); if (!getypt) teken(); },
    _doe: doe,
    _stopMeting: async function (id) {
      var f = id === 'caravan' ? 'stopCaravan' : 'stopRitAnalyse';
      try { if (typeof window[f] === 'function') await window[f](); else console.warn('PLAfsluiten: ' + f + ' ontbreekt'); }
      catch (e) { console.warn('PLAfsluiten: ' + f + ' mislukt', e); }
      // Het rapport verschijnt in zijn eigen venster; dit venster gaat opzij.
      sluit();
    },
    _kern: { opties: opties, plan: plan, autoconnTerug: autoconnTerug, voerUit: voerUit, cfg: { stapMs: AFSLUIT_STAP_MS } }
  };
})();
