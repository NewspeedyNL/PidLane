/* ═══════════════════════════════════════════════════════════════════
   pidlane-sppproef.js — PLSppProef: laat de SPP-plugin draden achter? (#352)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Op 30-09-2026 werd na een herverbinding bij een dode socket de héle
   verbinding 10 tot 25 keer trager — ook een kaal ATH0, dat de auto nooit
   raakt — en de telefoon werd warm. Alleen de app afsluiten hielp. Het
   vermoeden: de SPP-plugin start bij elke MISLUKTE connect() toch een
   leesdraad, en die draait dan leeg rond tot het proces stopt. In een JVM is
   dat nagebouwd (public/test-spppatch.js); plspppatch.js patcht het in de
   APK. Deze module is de proef op een echte telefoon, met knoppen in het
   Admin-menu, zodat een paar ritten genoeg data geven om het te beslissen.

   WAT DE KNOPPEN DOEN
     🧵 draden meten      PLDraden: processortijd per draad, en welke draden
                          in de leeslus van de plugin zitten
     ⏱ responstijd meten 15× ATRV (alleen de adapter) en 15× 010C1 (de ECU)
     💥 nabootsen          één connect() naar een adres dat niet bestaat — de
                          mislukte poging waar het om draait
     🔬 volle proef        meten → nabootsen → meten, met een oordeel
     🔁 dode socket        herverbinden langs precies het pad van 01:11
     ℹ️ patchstatus        zit plspppatch.js in deze APK?
     🔀 patch aan/uit      zet het oude gedrag terug tot de app herstart, zodat
                          dezelfde APK beide kanten meet (A/B op één toestel)

   DE BUS WORDT BEWERKT, EN DE APP WEET DAT
   1. Tijdens een proef: alles via PLScanSlot.doe(). Die pauzeert de pollus,
      zet _plScanActief aan — dan tellen PLBus.note() en de dode-socket-
      detectie niet mee, en zegt busBetrouwbaar() dat er niets te oordelen
      valt — en houdt een eigen ATI-hartslag bij.
   2. Ná een nabootsing zonder patch: de draad die achterblijft maakt de rest
      van de sessie trager, en dat is geen eigenschap van de auto. De proef
      zet daarom een markering in sessionStorage. Die overleeft een herlaad
      van de pagina en geen proceskill — precies zo lang als zo'n draad.
      PLAdapter leest hem: het drift-oordeel van #302 wordt LET OP in plaats
      van FOUT, en de aanwijzing in het paneel zegt "herstart de app" in
      plaats van "opnieuw verbinden".

   Alle uitkomsten gaan naar log() en btDiag(), dus ze staan in het logboek
   dat je deelt. Eén regel per proef, met de getallen erin.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const VERSIE = '1.0 (30-09-2026)';
  // Het bit "lokaal beheerd" staat aan: geen fabrikant geeft zo'n adres uit,
  // dus hier antwoordt nooit een echt apparaat.
  const NEP_ADRES = '02:00:00:35:20:01';
  const SLEUTEL = 'pl_spp_aangetast';
  const N_RESPONS = 15;

  let _bezig = false, _laatste = null;
  const _uitslagen = [];
  /* Wat een meetopdracht kan opvragen (#352): de laatste patchstand, de
     laatste draadmeting, en per volle proef hoeveel draden erbij kwamen. In
     het geheugen: een uitslag van een vorige app-sessie zegt niets over nu. */
  let _patchNu = null, _dradenNu = null;
  const _volle = [];

  function _diag(m, n) {
    try { if (typeof btDiag === 'function') btDiag(m, n || 'info'); }
    catch (e) { console.warn('SPP-proef: BT-log onbereikbaar', e); }
  }
  function _log(m, n) {
    try { if (typeof log === 'function') log(m, n || 'info'); }
    catch (e) { console.warn('SPP-proef: app-log onbereikbaar', e); }
  }
  function _spp() {
    try { return (typeof getSPP === 'function') ? getSPP() : null; }
    catch (e) { console.warn('SPP-proef: getSPP faalt', e); return null; }
  }
  function _plDraden() {
    const C = window.Capacitor;
    return (C && C.Plugins && C.Plugins.PLDraden) || null;
  }
  function _verbonden() {
    try { return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); }
    catch (e) { return false; }
  }
  function _demo() {
    try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; }
  }
  function _wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function _nu() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ── de markering ──────────────────────────────────────────────────
  function aangetast() {
    try {
      const r = sessionStorage.getItem(SLEUTEL);
      return r ? JSON.parse(r) : null;
    } catch (e) { console.warn('SPP-proef: markering onleesbaar', e); return null; }
  }
  function _markeer(reden) {
    const a = { t: Date.now(), reden: reden };
    try { sessionStorage.setItem(SLEUTEL, JSON.stringify(a)); }
    catch (e) { console.warn('SPP-proef: markering niet bewaard — een herlaad vergeet dat de bus aangetast is', e); }
    _log('⚠ Bus aangetast door de SPP-proef (' + reden + ') — responstijden zijn tot een herstart van de app geen meting van de auto (#352)', 'warn');
    return a;
  }

  // ── statistiek, puur ──────────────────────────────────────────────
  function stat(ms) {
    const a = (ms || []).filter(function (x) { return typeof x === 'number' && x >= 0; }).sort(function (x, y) { return x - y; });
    if (!a.length) return { n: 0, mediaan: null, p90: null, max: null };
    const m = a.length >> 1;
    return {
      n: a.length,
      mediaan: Math.round(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2),
      p90: Math.round(a[Math.min(a.length - 1, Math.ceil(a.length * 0.9) - 1)]),
      max: Math.round(a[a.length - 1])
    };
  }

  /* Het oordeel over een volle proef, puur. `voor` en `na` zijn
     { draden, respons }; `patch` is de uitkomst van patchStatus(). */
  function oordeel(voor, na, patch) {
    const r = { staat: 'LET OP', kop: '', regels: [] };
    // Een patch die voor de proef uit staat, telt als geen patch.
    const heeftPatch = !!(patch && patch.patch && patch.aan !== false);
    const dv = voor && voor.draden, dn = na && na.draden;
    const erbij = (dv && dn && typeof dv.sppDraait === 'number' && typeof dn.sppDraait === 'number') ? dn.sppDraait - dv.sppDraait : null;
    const av = voor && voor.respons && voor.respons.at, an = na && na.respons && na.respons.at;
    const factor = (av && an && av.mediaan > 0 && an.mediaan != null) ? Math.round(an.mediaan / av.mediaan * 10) / 10 : null;

    if (erbij !== null) r.regels.push('draaiende leesdraden: ' + dv.sppDraait + ' → ' + dn.sppDraait);
    if (dv && dn && typeof dv.totaalPct === 'number') r.regels.push('processor van de app: ' + dv.totaalPct + '% → ' + dn.totaalPct + '% (van één kern)');
    if (factor !== null) r.regels.push('ATRV mediaan: ' + av.mediaan + ' → ' + an.mediaan + ' ms (×' + String(factor).replace('.', ',') + ')');
    const ev = voor && voor.respons && voor.respons.ecu, en = na && na.respons && na.respons.ecu;
    if (ev && en && ev.mediaan != null && en.mediaan != null) r.regels.push('010C1 mediaan: ' + ev.mediaan + ' → ' + en.mediaan + ' ms');

    if (heeftPatch) {
      if (erbij !== null && erbij > 0) { r.staat = 'FOUT'; r.kop = 'Ondanks de patch (' + patch.patch + ') bleef er een draaiende draad achter'; }
      else if (erbij === 0) { r.staat = 'OK'; r.kop = 'De patch houdt stand: de mislukte poging liet geen draad achter'; }
      else if (factor !== null && factor >= 1.3) { r.staat = 'FOUT'; r.kop = 'Met patch toch ×' + String(factor).replace('.', ',') + ' trager na de mislukte poging (draden niet gemeten)'; }
      else { r.staat = 'OK'; r.kop = 'Met patch geen vertraging na de mislukte poging (draden niet gemeten)'; }
    } else {
      if (erbij !== null && erbij > 0) { r.staat = 'OK'; r.kop = 'Fout nagebouwd: +' + erbij + ' draaiende leesdraad na één mislukte poging — dit is #352'; }
      else if (erbij === 0) { r.staat = 'LET OP'; r.kop = 'Zonder patch toch geen draad erbij — het vermoeden van #352 klopt op dit toestel niet'; }
      else if (factor !== null && factor >= 1.3) { r.staat = 'LET OP'; r.kop = '×' + String(factor).replace('.', ',') + ' trager na één mislukte poging — past bij #352 (deze APK meet geen draden)'; }
      else { r.staat = 'LET OP'; r.kop = 'Geen verschil gemeten, en deze APK meet geen draden'; }
    }
    return r;
  }

  // ── de losse metingen ─────────────────────────────────────────────
  async function patchStatus() {
    const spp = _spp();
    if (!spp) return { patch: null, reden: 'geen SPP-plugin (browser of BLE)' };
    if (typeof spp.plPatch !== 'function') { _patchNu = { patch: null, reden: 'deze APK heeft de patch van #352 niet' }; return _patchNu; }
    try {
      const r = await spp.plPatch();
      _patchNu = { patch: r && r.patch || null, aan: !(r && r.aan === false), leesdraden: r && r.leesdraden, verbindingen: r && r.verbindingen };
      return _patchNu;
    } catch (e) {
      console.warn('SPP-proef: plPatch faalt', e);
      return { patch: null, reden: 'plPatch faalt: ' + ((e && e.message) || e) };
    }
  }

  async function meetDraden(ms) {
    const p = _plDraden();
    if (!p || typeof p.meet !== 'function') return null;
    try { const d = await p.meet({ ms: ms || 1000 }); if (d) _dradenNu = d; return d; }
    catch (e) { console.warn('SPP-proef: draadmeting faalt', e); _diag('SPP-proef: draadmeting faalt — ' + ((e && e.message) || e), 'warn'); return null; }
  }

  /* Via PLScanSlot: de pollus staat stil, dus de tijd is de tijd van de
     adapter en niet die van de wachtrij. */
  async function _meetMet(stuur) {
    const at = [], ecu = [];
    let leeg = 0;
    for (let i = 0; i < N_RESPONS; i++) {
      let t = _nu(); const a = await stuur('ATRV', 1500); at.push(_nu() - t);
      if (!String(a || '').trim()) leeg++;
      t = _nu(); const b = await stuur('010C1', 1500); ecu.push(_nu() - t);
      if (!String(b || '').trim()) leeg++;
    }
    let modus = null;
    try { if (typeof plSppModus === 'function') modus = plSppModus().modus; }
    catch (e) { console.warn('SPP-proef: SPP-modus onleesbaar', e); }
    return { at: stat(at), ecu: stat(ecu), leeg: leeg, modus: modus };
  }
  async function meetRespons() {
    if (!_verbonden()) return null;
    if (!window.PLScanSlot) throw new Error('PLScanSlot ontbreekt — zonder busslot meet dit door het gewone verkeer heen');
    return window.PLScanSlot.doe('spp-proef: responstijd', { hartslagElke: 1000 }, _meetMet);
  }

  async function _poging() {
    const spp = _spp();
    if (!spp) throw new Error('geen SPP-plugin in deze schil');
    const t0 = Date.now();
    let uitkomst = '', gelukt = false;
    try {
      await spp.connect({ address: NEP_ADRES });
      gelukt = true;
      uitkomst = 'verbonden?! — er antwoordde iets op ' + NEP_ADRES;
    } catch (e) {
      uitkomst = 'mislukt zoals bedoeld (' + ((e && e.message) || e) + ')';
    }
    // Opruimen. Zonder patch haalt dit de verbinding uit de lijst, maar de
    // draad draait door: interrupt() is het enige wat disconnect() hem doet.
    try { await spp.disconnect({ address: NEP_ADRES }); }
    catch (e) { console.warn('SPP-proef: opruimen van het nepadres gaf een fout', e); }
    return { ms: Date.now() - t0, gelukt: gelukt, uitkomst: uitkomst };
  }
  async function nabootsen() {
    const patch = await patchStatus();
    let p;
    if (_verbonden() && window.PLScanSlot) {
      // De mislukte connect() blokkeert de plugindraad een paar seconden, en
      // daarmee elke read/write van de echte verbinding. Buiten het busslot
      // zou de pollus dat als zes lege antwoorden zien — een dode socket.
      p = await window.PLScanSlot.doe('spp-proef: nabootsen', { hartslagElke: 1000 }, function () { return _poging(); });
    } else {
      p = await _poging();
    }
    p.patch = patch.patch && patch.aan ? patch.patch : null;
    if (!p.patch) _markeer('mislukte verbindpoging nagebootst, zonder patch' + (patch.patch ? ' (voor de proef uitgezet)' : ''));
    _diag('SPP-proef: nabootsen — ' + p.uitkomst + ' in ' + p.ms + ' ms, patch: ' + _patchTekst(patch), p.gelukt ? 'warn' : 'info');
    return p;
  }

  function _patchTekst(p) {
    if (!p || !p.patch) return 'nee';
    return p.patch + (p.aan === false ? ' (uit voor de proef)' : '');
  }

  /* Zet de patch aan of uit voor de rest van dit proces. Alleen de patch-APK
     kent dit; daarbuiten valt er niets te schakelen. */
  async function zetPatch(aan) {
    const spp = _spp();
    if (!spp || typeof spp.plPatch !== 'function') throw new Error('deze APK heeft de patch van #352 niet — er valt niets te schakelen');
    const r = await spp.plPatch({ aan: !!aan });
    return { patch: r && r.patch || null, aan: !(r && r.aan === false) };
  }

  // ── de knoppen ────────────────────────────────────────────────────
  function _regelDraden(d) {
    if (!d) return 'draden: niet gemeten (deze APK heeft PLDraden niet)';
    const top = (d.draden || []).slice(0, 4).map(function (x) { return x.naam + ' ' + x.pct + '%'; }).join(', ');
    return 'draden: app ' + d.totaalPct + '% van één kern (' + d.kernen + ' kernen), SPP-leesdraden ' + d.sppLevend +
      ' waarvan ' + d.sppDraait + ' draaiend' + (top ? '; drukst: ' + top : '');
  }
  function _regelRespons(r) {
    if (!r) return 'responstijd: niet gemeten (niet verbonden)';
    return 'responstijd (' + (r.modus || '?') + '): ATRV ' + r.at.mediaan + ' ms (p90 ' + r.at.p90 + ', max ' + r.at.max + '), ' +
      '010C1 ' + r.ecu.mediaan + ' ms (p90 ' + r.ecu.p90 + ')' + (r.leeg ? ', ' + r.leeg + ' leeg' : '');
  }

  function _noteerAdapter(soort) {
    try { if (window.PLAdapter && typeof window.PLAdapter.noteer === 'function') window.PLAdapter.noteer(soort); }
    catch (e) { console.warn('SPP-proef: gebeurtenis niet bij PLAdapter genoteerd', e); }
  }

  async function _doe(naam, fn) {
    if (_bezig) { _toon(naam, ['Er loopt al een SPP-proef — wacht tot die klaar is.']); return null; }
    if (_demo()) { _toon(naam, ['In de demo is er geen adapter om te beproeven.']); return null; }
    _bezig = true;
    _toon(naam, ['bezig…']);
    const t = Date.now();
    try {
      const u = await fn();
      u.naam = naam; u.t = t; u.duurS = Math.round((Date.now() - t) / 1000);
      _laatste = u; _uitslagen.push(u);
      if (_uitslagen.length > 20) _uitslagen.shift();
      const a = aangetast();
      const regels = u.regels.concat(a ? ['⚠ bus aangetast sinds ' + new Date(a.t).toTimeString().slice(0, 8) + ' (' + a.reden + ') — herstart de app om dat op te heffen'] : []);
      _log('🧪 SPP-proef ' + naam + ': ' + (u.kop ? u.kop + ' — ' : '') + u.regels.join('; '), u.staat === 'FOUT' ? 'warn' : 'ok');
      _toon(naam, (u.kop ? [u.kop] : []).concat(regels));
      return u;
    } catch (e) {
      console.warn('SPP-proef ' + naam + ' faalde', e);
      _log('🧪 SPP-proef ' + naam + ' faalde: ' + ((e && e.message) || e), 'warn');
      _toon(naam, ['Mislukt: ' + ((e && e.message) || e)]);
      return null;
    } finally {
      _bezig = false;
    }
  }

  function knopDraden() {
    return _doe('draden meten', async function () {
      const d = await meetDraden(1500);
      return { staat: d ? 'OK' : 'LET OP', regels: [_regelDraden(d)], draden: d };
    });
  }
  function knopRespons() {
    return _doe('responstijd meten', async function () {
      const r = await meetRespons();
      return { staat: r ? 'OK' : 'LET OP', regels: [_regelRespons(r)], respons: r };
    });
  }
  function knopNabootsen() {
    return _doe('nabootsen', async function () {
      _noteerAdapter('spp-proef');
      const p = await nabootsen();
      await _wacht(1000);
      const d = await meetDraden(1000);
      return { staat: p.gelukt ? 'LET OP' : 'OK', regels: ['connect naar ' + NEP_ADRES + ': ' + p.uitkomst + ' in ' + p.ms + ' ms', 'patch: ' + (p.patch || 'nee (of uit voor de proef)'), _regelDraden(d)], poging: p, draden: d };
    });
  }
  function knopVolle() {
    return _doe('volle proef', async function () {
      const patch = await patchStatus();
      const voor = { draden: await meetDraden(1000), respons: await meetRespons() };
      _noteerAdapter('spp-proef');
      const p = await nabootsen();
      await _wacht(1500);
      const na = { draden: await meetDraden(1000), respons: await meetRespons() };
      const o = oordeel(voor, na, patch);
      _volle.push({ t: Date.now(), patch: !!patch.patch, aan: !!(patch.patch && patch.aan !== false),
                    erbij: (voor.draden && na.draden) ? na.draden.sppDraait - voor.draden.sppDraait : null });
      if (patch.patch && na.draden && na.draden.sppDraait > 0) _markeer('draaiende leesdraad ondanks de patch');
      if (patch.patch && patch.aan === false && na.draden && na.draden.sppDraait > 0) _markeer('patch voor de proef uitgezet');
      o.regels.push('nabootsen: ' + p.uitkomst + ' in ' + p.ms + ' ms; patch: ' + _patchTekst(patch));
      o.voor = voor; o.na = na; o.patch = patch; o.poging = p;
      return o;
    });
  }
  function knopDodeSocket() {
    return _doe('herverbinden als bij een dode socket', async function () {
      if (!_verbonden()) throw new Error('niet verbonden');
      if (typeof connectSerial !== 'function' || typeof setConn !== 'function') throw new Error('de verbindingsmodule ontbreekt');
      const voor = { draden: await meetDraden(1000), respons: await meetRespons() };
      _noteerAdapter('spp-proef-herverbind');
      const t = Date.now();
      /* Precies wat trackBtQuality() doet na zes lege antwoorden
         (pidlane-bt.js): de vlag om, en connectSerial met de hervatstand —
         ZONDER de oude socket eerst te sluiten. Dat laatste is het punt: zo
         ging het om 01:11:40. */
      connected = false; setConn(false);
      await connectSerial({ hervat: 'dode socket (SPP-proef)' });
      const duur = Math.round((Date.now() - t) / 1000);
      if (!_verbonden()) return { staat: 'FOUT', kop: 'Herverbinden lukte niet binnen de keten', regels: ['na ' + duur + ' s niet verbonden — tik op Verbinden'] };
      await _wacht(3000);
      const na = { draden: await meetDraden(1000), respons: await meetRespons() };
      const patch = await patchStatus();
      const o = oordeel(voor, na, patch);
      o.kop = 'Herverbonden in ' + duur + ' s — ' + o.kop.charAt(0).toLowerCase() + o.kop.slice(1);
      if (!patch.patch && na.draden && voor.draden && na.draden.sppDraait > voor.draden.sppDraait) _markeer('herverbinding liet een draaiende draad achter');
      o.voor = voor; o.na = na; o.patch = patch;
      return o;
    });
  }
  function knopPatch() {
    return _doe('patchstatus', async function () {
      const p = await patchStatus();
      const d = await meetDraden(500);
      return {
        staat: p.patch ? 'OK' : 'LET OP',
        regels: [p.patch ? 'patch ' + _patchTekst(p) + ' zit in deze APK; leesdraden volgens de plugin: ' + p.leesdraden + ', verbindingen: ' + p.verbindingen : 'geen patch: ' + p.reden,
                 'PLDraden: ' + (_plDraden() ? 'aanwezig' : 'niet in deze APK'), _regelDraden(d)],
        patch: p, draden: d
      };
    });
  }

  function knopSchakel() {
    return _doe('patch aan/uit', async function () {
      const nu = await patchStatus();
      if (!nu.patch) throw new Error(nu.reden || 'geen patch in deze APK');
      const r = await zetPatch(!nu.aan);
      _log('🧪 SPP-proef: patch ' + (r.aan ? 'weer AAN' : 'UIT — het oude gedrag geldt tot de app herstart (#352)'), 'warn');
      return {
        staat: 'OK',
        regels: [r.aan ? 'De patch staat weer aan. Draden die al rondliepen, blijven tot een herstart.'
                       : 'De patch staat UIT tot de app herstart. Een mislukte poging laat nu weer een draad achter — doe de volle proef, en herstart daarna de app.'],
        patch: r
      };
    });
  }

  /* De app-maten voor PLOpdracht (#352). Null = niet gemeten, en dat is geen 0:
     een meetopdracht maakt daar "nog niet" van in plaats van een oordeel. */
  function maat(naam) {
    const erbij = function (aan) {
      const l = _volle.filter(function (v) { return v.patch && v.aan === aan && typeof v.erbij === 'number'; });
      return l.length ? Math.max.apply(null, l.map(function (v) { return v.erbij; })) : null;
    };
    switch (naam) {
      case 'spp-patch': return _patchNu ? (_patchNu.patch ? 1 : 0) : null;
      case 'spp-draaiend': return _dradenNu ? _dradenNu.sppDraait : null;
      case 'spp-proeven-aan': return _volle.filter(function (v) { return v.patch && v.aan; }).length;
      case 'spp-proeven-uit': return _volle.filter(function (v) { return v.patch && !v.aan; }).length;
      case 'spp-erbij-aan': return erbij(true);
      case 'spp-erbij-uit': return erbij(false);
      default: return null;
    }
  }

  // ── het venster ───────────────────────────────────────────────────
  function _toon(titel, regels) {
    try {
      let v = document.getElementById('plSppProef');
      if (!v) {
        v = document.createElement('div');
        v.id = 'plSppProef';
        v.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;max-height:60vh;overflow:auto;' +
          'background:var(--sur);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;' +
          'box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 12px/1.5 var(--f)';
        document.body.appendChild(v);
      }
      v.innerHTML = '';
      const kop = document.createElement('div');
      kop.style.cssText = 'font-weight:800;margin-bottom:6px';
      kop.textContent = '🧵 SPP-proef (#352) — ' + titel;
      v.appendChild(kop);
      regels.forEach(function (r) {
        const d = document.createElement('div');
        d.textContent = r;
        v.appendChild(d);
      });
      const dicht = document.createElement('button');
      dicht.type = 'button';
      dicht.textContent = 'Sluiten';
      dicht.style.cssText = 'margin-top:10px;width:100%;padding:9px;border-radius:8px;border:1px solid var(--bd);' +
        'background:var(--sur2);color:var(--tx);font:700 12px var(--f);cursor:pointer';
      dicht.addEventListener('click', function () { v.remove(); });
      v.appendChild(dicht);
    } catch (e) { console.warn('SPP-proef: venster niet getekend — de uitkomst staat wel in het logboek', e); }
  }

  const KNOPPEN = [
    ['plSppDraden', '🧵 SPP: draden meten', knopDraden],
    ['plSppRespons', '⏱ SPP: responstijd meten', knopRespons],
    ['plSppNabootsen', '💥 SPP: mislukte verbinding nabootsen', knopNabootsen],
    ['plSppVolle', '🔬 SPP: volle proef', knopVolle],
    ['plSppDode', '🔁 SPP: herverbinden als bij dode socket', knopDodeSocket],
    ['plSppPatch', 'ℹ️ SPP: patchstatus', knopPatch],
    ['plSppSchakel', '🔀 SPP: patch aan/uit (proef)', knopSchakel]
  ];
  function menu() {
    const groep = document.getElementById('admGroup');
    if (!groep) return 0;
    let n = 0;
    KNOPPEN.forEach(function (k) {
      if (document.getElementById(k[0])) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kebab-item';
      b.id = k[0];
      b.textContent = k[1];
      b.addEventListener('click', function () {
        try { if (typeof closeKebab === 'function') closeKebab(); }
        catch (e) { console.warn('SPP-proef: kebabmenu niet gesloten', e); }
        k[2]();
      });
      groep.appendChild(b);
      n++;
    });
    return n;
  }

  try {
    document.addEventListener('DOMContentLoaded', function () {
      menu();
      // De patchstand één keer opvragen, zodat een meetopdracht meteen weet of
      // de patch in deze APK zit — zonder dat eerst iemand op een knop drukt.
      patchStatus().catch(function (e) { console.warn('SPP-proef: patchstand bij het opstarten niet opgevraagd', e); });
    });
  }
  catch (e) { console.warn('SPP-proef: menuknoppen niet ingehaakt', e); }

  window.PLSppProef = {
    versie: VERSIE,
    NEP_ADRES: NEP_ADRES,
    aangetast: aangetast,
    stat: stat,
    oordeel: oordeel,
    patchStatus: patchStatus,
    meetDraden: meetDraden,
    meetRespons: meetRespons,
    nabootsen: nabootsen,
    zetPatch: zetPatch,
    schakel: knopSchakel,
    volle: knopVolle,
    dodeSocket: knopDodeSocket,
    menu: menu,
    maat: maat,
    laatste: function () { return _laatste; },
    uitslagen: function () { return _uitslagen.slice(); }
  };

  _diag('pidlane-sppproef.js geladen — ' + VERSIE);
})();
