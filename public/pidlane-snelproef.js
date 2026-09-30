/* ═══════════════════════════════════════════════════════════════════
   pidlane-snelproef.js — PLSnelProef: welke ingreep maakt de verbinding
   weer snel? (#352, #302)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Op 30-09-2026 om 08:53 was de verbinding weer traag — ATRV 152 ms in
   plaats van 30 — terwijl de patch van #352 aan stond en er geen enkele
   draad ronddraaide. De losse knoppen van de SPP-proef konden dat meten,
   maar niet zeggen wat het oplost, en de volgorde was te ingewikkeld om
   in de auto goed te doen. Deze proef is één paneel met genummerde knoppen:
   druk 1, dan 2, dan 3. Elke stap is één ingreep die de traagheid zou kunnen
   opheffen, met ervoor en erna dezelfde meting. Het doel is wat de app op
   een goede dag haalt: 10 verzoeken per seconde of meer.

   DE STAPPEN, VAN LICHT NAAR ZWAAR
     1  nulmeting                 niets veranderen
     2  verse verbinding          de app sluit de socket netjes en opent hem
     3  andere leesmanier         events ↔ pollen, één keer, daarna terug
     4  Bluetooth van de auto uit de telefoon deelt zijn radio niet meer
     5  adapter los en weer vast  de adapter zelf opnieuw opgestart
     6  app herstarten            alles in de app vers

   Stap 4, 5 en 6 vragen iets van de bestuurder; 2 en 3 doet de app zelf.
   Wat een stap oplevert, wordt vergeleken met de stap ervóór: als stap 2 het
   al oplost, zegt stap 3 "geen verschil", en dat is dan ook zo.

   DE METING
   15 s gewoon pollen, en dan PLBus.stats(): verzoeken per seconde over de
   laatste 10 s, precies wat het adapterpaneel ook toont. Daarna de
   responstijd van de adapter (ATRV) en de ECU (010C1), en de draden, via
   PLSppProef als die er is. De stand staat in localStorage, zodat stap 6 een
   herstart van de app overleeft.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const VERSIE = '1.0 (30-09-2026)';
  const SLEUTEL = 'pl_snelproef';
  // Staat in sessionStorage zolang dit proces leeft. Een herstart van de app
  // (proces weg) wist hem; een herlaad van de pagina niet. Zo ziet stap 6 of
  // de app echt herstart is.
  const PROCES = 'pl_snelproef_proces';
  const DOEL = 10;            // verzoeken per seconde
  const WACHT_MS = 15000;     // gewoon pollen vóór de meting: het venster is 10 s

  const STAPPEN = [
    { nr: 1, kop: 'Nulmeting', actie: 'meet',
      doe: 'Motor aan, stilstaan, adapter verbonden. Druk op 1 en laat de app open.' },
    { nr: 2, kop: 'Verse verbinding', actie: 'vers',
      doe: 'Niets doen: de app sluit de Bluetooth-verbinding met de adapter netjes en maakt hem opnieuw.' },
    { nr: 3, kop: 'Andere leesmanier', actie: 'modus',
      doe: 'Niets doen: de app leest de adapter één keer op de andere manier (events of pollen) en zet het daarna terug.' },
    { nr: 4, kop: 'Bluetooth van de auto uit', actie: 'meet',
      doe: 'Zet op de telefoon de Bluetooth-verbinding met de AUTO uit (muziek, bellen) — niet die met de adapter. Laat hem uit tot de proef klaar is. Druk dan op 4.' },
    { nr: 5, kop: 'Adapter los en weer vast', actie: 'vers',
      doe: 'Trek de adapter uit de auto, tel tot 10 en steek hem terug. Wacht tot het lampje weer knippert en druk op 5.' },
    { nr: 6, kop: 'App helemaal herstarten', actie: 'herstart',
      doe: 'Veeg de app weg bij "recente apps", open hem opnieuw en laat hem verbinden. Open deze proef weer via het menu en druk op 6.' }
  ];

  /* Wat een stap betekent als hij het was. Dit is het antwoord waar de
     proef om draait, dus in woorden die zonder de code te volgen zijn. */
  const BETEKENIS = {
    2: 'De verbinding zelf raakt na een tijd traag, en een verse socket lost het op. Dat kan de app zelf doen zodra hij het merkt.',
    3: 'De andere leesmanier is op dit toestel sneller. Die kan de standaard worden.',
    4: 'De Bluetooth van de auto deelt de radio van de telefoon met de adapter. Tijdens het meten de auto-Bluetooth uit laten, of de radio anders verdelen.',
    5: 'De adapter zelf raakt vast, en opnieuw opstarten helpt. Dan is een reset van de adapter vanuit de app de oplossing.',
    6: 'Er blijft iets in de app hangen tot een herstart. Dat is dan verder te zoeken in de app, niet in de auto of de adapter.'
  };

  let _bezig = false, _stand = '';

  // ── kleine hulpen ─────────────────────────────────────────────────
  function _log(m, n) {
    try { if (typeof log === 'function') log(m, n || 'info'); }
    catch (e) { console.warn('Snelheidsproef: app-log onbereikbaar', e); }
  }
  function _wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function _verbonden() {
    try { return typeof connected !== 'undefined' && !!connected && !(typeof demoMode !== 'undefined' && demoMode); }
    catch (e) { return false; }
  }
  function _komma(x) { return String(x).replace('.', ','); }

  // ── de stand ──────────────────────────────────────────────────────
  function stand() {
    try {
      const r = localStorage.getItem(SLEUTEL);
      const s = r ? JSON.parse(r) : null;
      if (s && s.stappen) return s;
    } catch (e) { console.warn('Snelheidsproef: bewaarde stand onleesbaar — begint opnieuw', e); }
    return { begon: null, stappen: {} };
  }
  function _bewaar(s) {
    try { localStorage.setItem(SLEUTEL, JSON.stringify(s)); }
    catch (e) { console.warn('Snelheidsproef: stand niet bewaard — stap 6 na een herstart weet de eerdere stappen niet', e); }
  }
  function volgende(s) {
    for (let i = 0; i < STAPPEN.length; i++) if (!s.stappen[STAPPEN[i].nr]) return STAPPEN[i].nr;
    return null;
  }
  function reset() {
    _bewaar({ begon: null, stappen: {} });
    _teken();
  }

  // ── het oordeel, puur ─────────────────────────────────────────────
  /* m, basis en vorige zijn metingen { perSec, atrv, … }. basis is stap 1,
     vorige de stap ervóór. Het oordeel gaat over de stap ervóór: dat is wat
     déze ingreep veranderde. */
  function oordeelStap(m, basis, vorige) {
    if (!m || typeof m.perSec !== 'number') return { staat: 'LET OP', tekst: 'niet gemeten' };
    const haalt = m.perSec >= DOEL;
    if (!basis || !vorige) {
      return haalt ? { staat: 'OK', tekst: 'haalt het doel al (' + DOEL + '/s of meer)' }
                   : { staat: 'LET OP', tekst: 'onder het doel van ' + DOEL + '/s — dit is het vertrekpunt' };
    }
    const fv = vorige.perSec > 0 ? Math.round(m.perSec / vorige.perSec * 10) / 10 : null;
    if (haalt && vorige.perSec < DOEL) return { staat: 'OK', tekst: '✅ dit hielp: nu boven de ' + DOEL + '/s', hielp: true };
    if (haalt) return { staat: 'OK', tekst: 'boven het doel, net als de stap ervoor' };
    if (fv !== null && fv >= 1.3) return { staat: 'LET OP', tekst: 'sneller dan de stap ervoor (×' + _komma(fv) + '), maar nog onder ' + DOEL + '/s', beter: true };
    if (fv !== null && fv <= 0.8) return { staat: 'LET OP', tekst: 'trager dan de stap ervoor (×' + _komma(fv) + ')' };
    return { staat: 'LET OP', tekst: 'geen duidelijk verschil met de stap ervoor' };
  }

  /* De conclusie over alle gedane stappen, puur. */
  function uitslag(s) {
    const st = (s && s.stappen) || {};
    const b = st[1] && st[1].m;
    if (!b) return 'Nog niets gemeten. Begin met stap 1.';
    if (b.perSec >= DOEL) {
      return 'Bij het begin haalde de verbinding al ' + _komma(b.perSec) + ' verzoeken/s. Er valt nu niets op te lossen: ' +
             'doe de proef opnieuw op een moment dat het traag is.';
    }
    let hielp = null, beste = null;
    STAPPEN.forEach(function (x) {
      const r = st[x.nr];
      if (!r || x.nr === 1) return;
      if (!hielp && r.oordeel && r.oordeel.hielp) hielp = x;
      if (r.m && (!beste || r.m.perSec > st[beste.nr].m.perSec)) beste = x;
    });
    if (hielp) {
      const m = st[hielp.nr].m;
      let t = 'Gevonden: stap ' + hielp.nr + ' (' + hielp.kop.toLowerCase() + ') bracht het van ' + _komma(b.perSec) +
              ' naar ' + _komma(m.perSec) + ' verzoeken/s. ' + BETEKENIS[hielp.nr];
      if (hielp.nr === 3 && m.modus) t += ' Gemeten in de stand "' + m.modus + '"; de app staat weer op de oude stand.';
      return t;
    }
    const n = Object.keys(st).length;
    if (n < STAPPEN.length) return 'Nog niet gevonden na ' + n + ' van de ' + STAPPEN.length + ' stappen. Ga door met stap ' + volgende(s) + '.';
    return 'Geen enkele stap bracht het boven de ' + DOEL + '/s (begin ' + _komma(b.perSec) + '/s' +
           (beste ? ', beste stap ' + beste.nr + ' met ' + _komma(st[beste.nr].m.perSec) + '/s' : '') +
           '). Stuur het logboek op: dan zit de oorzaak ergens anders.';
  }

  function _regel(m) {
    if (!m) return '';
    return _komma(m.perSec) + ' verzoeken/s' +
      (m.atrv != null ? ' · adapter ' + m.atrv + ' ms' : '') +
      (m.ecu != null ? ' · ECU ' + m.ecu + ' ms' : '') +
      (m.draait ? ' · ' + m.draait + ' draaiende draad' : '');
  }

  // ── de ingrepen ───────────────────────────────────────────────────
  async function meet() {
    if (!_verbonden()) throw new Error('niet verbonden — verbind eerst met de adapter en druk dan nog eens');
    for (let s = Math.round(WACHT_MS / 1000); s > 0; s--) { _zetStand('meten… nog ' + s + ' s — laat de app open'); await _wacht(1000); }
    let st = null;
    try { st = window.PLBus && typeof PLBus.stats === 'function' ? PLBus.stats() : null; }
    catch (e) { console.warn('Snelheidsproef: PLBus.stats faalt', e); }
    if (!st) throw new Error('de bustelling is niet te lezen (PLBus.stats ontbreekt)');
    if (!(st.perSec > 0)) throw new Error('de meetlus stuurt niets — staan er sensoren aan?');
    const m = { t: Date.now(), perSec: st.perSec, ms: st.venGemMs, bezet: st.belasting, fout: st.foutPct,
                atrv: null, ecu: null, modus: null, draait: null, cpu: null };
    const p = window.PLSppProef;
    if (p && typeof p.meetRespons === 'function') {
      _zetStand('responstijd van de adapter meten…');
      try {
        const r = await p.meetRespons();
        if (r) { m.atrv = r.at && r.at.mediaan; m.ecu = r.ecu && r.ecu.mediaan; m.modus = r.modus || null; }
      } catch (e) { console.warn('Snelheidsproef: responstijd niet gemeten', e); }
    }
    if (p && typeof p.meetDraden === 'function') {
      try {
        const d = await p.meetDraden(1000);
        if (d) { m.draait = d.sppDraait; m.cpu = d.totaalPct; }
      } catch (e) { console.warn('Snelheidsproef: draden niet gemeten', e); }
    }
    return m;
  }

  /* De socket netjes dicht en opnieuw open, langs de gewone hervatting. De
     bewaker in sppReconnectGuard() houdt zich 10 s koest na een herverbinding;
     dat stempel zetten we zelf, anders begint hij ook te herverbinden zodra de
     pollus een leeg antwoord ziet. */
  async function vers() {
    if (typeof connectSerial !== 'function' || typeof setConn !== 'function') throw new Error('de verbindingsmodule ontbreekt');
    _zetStand('verbinding verversen…');
    let spp = null, adres = null;
    try { spp = typeof getSPP === 'function' ? getSPP() : null; } catch (e) { console.warn('Snelheidsproef: getSPP faalt', e); }
    try { adres = localStorage.getItem('spp_address'); } catch (e) { console.warn('Snelheidsproef: adapteradres onleesbaar', e); }
    window._lastSppReconnect = Date.now();
    connected = false; setConn(false);
    if (spp && adres) {
      try { await spp.disconnect({ address: adres }); }
      catch (e) { console.warn('Snelheidsproef: oude socket was al dicht', e); }
    }
    await _wacht(1500);
    _zetStand('opnieuw verbinden… (±20 s)');
    await connectSerial({ hervat: 'snelheidsproef' });
    if (!_verbonden()) throw new Error('opnieuw verbinden lukte niet — tik op Verbinden en druk dan nog eens op deze stap');
  }

  function _pollStaatAan() {
    try { return localStorage.getItem('pl_spp_poll') === '1'; }
    catch (e) { console.warn('Snelheidsproef: pl_spp_poll onleesbaar', e); return false; }
  }
  function _zetPoll(aan) {
    try { if (aan) localStorage.setItem('pl_spp_poll', '1'); else localStorage.removeItem('pl_spp_poll'); }
    catch (e) { throw new Error('de leesmanier is niet om te zetten: ' + ((e && e.message) || e)); }
  }
  /* Events ↔ pollen geldt per socket, dus: omzetten, verse socket, meten, en
     ALTIJD terugzetten met nog een verse socket — ook als de meting faalt.
     Anders blijft een proef de app voorgoed anders laten lezen. */
  async function andereModus() {
    const was = _pollStaatAan();
    _zetPoll(!was);
    let m;
    try {
      await vers();
      m = await meet();
    } finally {
      _zetPoll(was);
      _zetStand('leesmanier terugzetten…');
      try { await vers(); }
      catch (e) { _log('🚦 Snelheidsproef: na stap 3 niet opnieuw verbonden — tik op Verbinden (' + ((e && e.message) || e) + ')', 'warn'); }
    }
    m.proefStand = was ? 'event' : 'poll';
    return m;
  }

  function _herstartGezien() {
    try { return sessionStorage.getItem(PROCES) !== '1'; }
    catch (e) { console.warn('Snelheidsproef: procesmarkering onleesbaar', e); return true; }
  }
  function _markeerProces() {
    try { sessionStorage.setItem(PROCES, '1'); }
    catch (e) { console.warn('Snelheidsproef: procesmarkering niet gezet — stap 6 kan een herstart niet vaststellen', e); }
  }

  async function doeStap(nr) {
    if (_bezig) return null;
    const s = stand();
    const verwacht = volgende(s);
    if (nr !== verwacht) { _zetStand(verwacht ? 'Druk eerst op ' + verwacht + '.' : 'De proef is klaar — begin opnieuw als je wilt.'); return null; }
    const stap = STAPPEN[nr - 1];
    if (stap.actie === 'herstart' && !_herstartGezien()) {
      _zetStand('De app is nog niet herstart. Veeg hem weg bij "recente apps", open hem opnieuw en druk dan op 6.');
      return null;
    }
    _bezig = true; _teken();
    try {
      let m;
      if (stap.actie === 'vers') { await vers(); m = await meet(); }
      else if (stap.actie === 'modus') m = await andereModus();
      else m = await meet();
      const vorigeNr = nr - 1;
      const o = oordeelStap(m, s.stappen[1] && s.stappen[1].m, vorigeNr >= 1 && s.stappen[vorigeNr] ? s.stappen[vorigeNr].m : null);
      if (!s.begon) s.begon = Date.now();
      s.stappen[nr] = { m: m, oordeel: o };
      _bewaar(s);
      _markeerProces();
      _log('🚦 Snelheidsproef stap ' + nr + ' (' + stap.kop.toLowerCase() + '): ' + _regel(m) + ' — ' + o.tekst,
           o.staat === 'OK' ? 'ok' : 'info');
      if (o.hielp || !volgende(s)) _log('🚦 Snelheidsproef: ' + uitslag(s), 'ok');
      _stand = '';
      return s.stappen[nr];
    } catch (e) {
      console.warn('Snelheidsproef stap ' + nr + ' faalde', e);
      _log('🚦 Snelheidsproef stap ' + nr + ' lukte niet: ' + ((e && e.message) || e), 'warn');
      _stand = 'Lukte niet: ' + ((e && e.message) || e);
      return null;
    } finally {
      _bezig = false; _teken();
    }
  }

  // ── het paneel ────────────────────────────────────────────────────
  function _zetStand(t) { _stand = t; _teken(); }

  function _el(tag, css, tekst) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  let _open = false;
  function _teken() {
    if (!_open) return;
    try {
      let v = document.getElementById('plSnelProef');
      if (!v) {
        v = _el('div', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;max-height:80vh;overflow:auto;' +
          'background:var(--sur);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;' +
          'box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 13px/1.45 var(--f)');
        v.id = 'plSnelProef';
        document.body.appendChild(v);
      }
      v.innerHTML = '';
      v.appendChild(_el('div', 'font-weight:800;font-size:15px;margin-bottom:2px', '🚦 Snelheidsproef'));
      v.appendChild(_el('div', 'color:var(--tx2);margin-bottom:10px',
        'Doel: ' + DOEL + ' verzoeken per seconde of meer. Druk de knoppen op volgorde; elke stap duurt ±20 s.'));
      const s = stand(), nu = volgende(s);
      STAPPEN.forEach(function (x) {
        const r = s.stappen[x.nr];
        const rij = _el('div', 'display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--bd)');
        const k = _el('button', 'flex:0 0 44px;height:44px;border-radius:10px;border:1px solid var(--bd);font:800 18px var(--f);' +
          (x.nr === nu && !_bezig ? 'background:var(--ac,#3b82f6);color:#fff;cursor:pointer' : 'background:var(--sur2);color:var(--tx3)'),
          r ? '✓' : String(x.nr));
        k.type = 'button';
        k.id = 'plSnel' + x.nr;
        k.disabled = !(x.nr === nu && !_bezig);
        k.addEventListener('click', function () { doeStap(x.nr); });
        const tekst = _el('div', 'flex:1;min-width:0');
        tekst.appendChild(_el('div', 'font-weight:700', x.nr + '. ' + x.kop));
        if (!r) tekst.appendChild(_el('div', 'color:var(--tx2)', x.doe));
        else {
          tekst.appendChild(_el('div', '', _regel(r.m)));
          tekst.appendChild(_el('div', 'color:' + (r.oordeel.staat === 'OK' ? 'var(--gn)' : 'var(--tx2)'), r.oordeel.tekst));
        }
        rij.appendChild(k); rij.appendChild(tekst);
        v.appendChild(rij);
      });
      if (_stand) v.appendChild(_el('div', 'margin-top:8px;font-weight:700;color:var(--or)', _stand));
      const u = _el('div', 'margin-top:10px;padding:10px;border-radius:10px;background:var(--sur2)');
      u.appendChild(_el('div', 'font-weight:800;margin-bottom:2px', 'Uitslag'));
      u.appendChild(_el('div', '', uitslag(s)));
      v.appendChild(u);
      const knoppen = _el('div', 'display:flex;gap:8px;margin-top:10px');
      const opnieuw = _el('button', 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f)', 'Opnieuw beginnen');
      opnieuw.type = 'button'; opnieuw.id = 'plSnelOpnieuw'; opnieuw.disabled = _bezig;
      opnieuw.addEventListener('click', reset);
      const dicht = _el('button', 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f)', 'Sluiten');
      dicht.type = 'button'; dicht.id = 'plSnelDicht';
      dicht.addEventListener('click', sluit);
      knoppen.appendChild(opnieuw); knoppen.appendChild(dicht);
      v.appendChild(knoppen);
    } catch (e) { console.warn('Snelheidsproef: paneel niet getekend — de uitkomsten staan wel in het logboek', e); }
  }

  function open() { _open = true; _teken(); }
  function sluit() {
    _open = false;
    try { const v = document.getElementById('plSnelProef'); if (v) v.remove(); }
    catch (e) { console.warn('Snelheidsproef: paneel niet gesloten', e); }
  }

  function menu() {
    const groep = document.getElementById('admGroup');
    if (!groep || document.getElementById('plSnelMenu')) return 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kebab-item';
    b.id = 'plSnelMenu';
    b.textContent = '🚦 Snelheidsproef (stap 1, 2, 3…)';
    b.addEventListener('click', function () {
      try { if (typeof closeKebab === 'function') closeKebab(); }
      catch (e) { console.warn('Snelheidsproef: kebabmenu niet gesloten', e); }
      open();
    });
    groep.appendChild(b);
    return 1;
  }

  try { document.addEventListener('DOMContentLoaded', menu); }
  catch (e) { console.warn('Snelheidsproef: menuknop niet ingehaakt', e); }

  window.PLSnelProef = {
    versie: VERSIE,
    DOEL: DOEL,
    STAPPEN: STAPPEN,
    oordeelStap: oordeelStap,
    uitslag: uitslag,
    stand: stand,
    volgende: volgende,
    doeStap: doeStap,
    reset: reset,
    open: open,
    sluit: sluit,
    menu: menu
  };
})();
