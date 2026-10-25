/* ═══════════════════════════════════════════════════════════════════
   pidlane-accutest.js — PLAccu: een echte accu- en dynamotest op een auto
   met slimme laadregeling, en de poort die een losse meting geen melding
   laat worden (25-10-2026)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Een Mazda (en vrijwel elke auto van na ~2010) stuurt de dynamo: bij een
   volle accu bewust 12,5–13 V, bij remmen 14–15 V, in de kou tot ruim
   15 V. "Te laag / te hoog" op één spanning zegt dan weinig, en de app
   meldde "dynamo" op een gezonde auto. Drie gaten, gemeten in de code:

     1. LAADSPANNING middelde 0142 over 30 s zodra het toerental NU boven
        500 lag. Na een i-stop zitten in dat venster 20 s motor-uit met
        verlichting en blower aan (12,0 V) plus de startdip: gemiddeld
        onder 12,2 V, "de dynamo laadt niet". Nu moet de motor het hele
        venster draaien (pidlane-watchers.js).
     2. De harde bovengrens 15,2 V gold ook bij vorst. Een regelaar
        compenseert de temperatuur (≈ −18 mV/°C over zes cellen): bij
        −10 °C is 15,3–15,5 V juist goed. Zie PLKenmerk.laadHoog().
     3. Eén meting werd één melding. Nu niet meer: zie DE POORT.

   DE POORT — TWEE BEWIJZEN (besluit 25-10-2026)
   Een bevinding "accu" of "dynamo" wordt pas een melding als er TWEE
   onafhankelijke soorten bewijs zijn (rustspanning + startdip, gevraagde
   spanning + belastingproef), of dezelfde soort op TWEE verschillende
   dagen, binnen VENSTER_DAGEN. Tot die tijd is het een aanwijzing die in
   het paneel staat, geen melding. Een geslaagde belastingproef is
   tegenbewijs en wist de oude dynamo-aanwijzingen; "nieuwe accu" wist
   alles van de accu, ook de trend.

   WAT DE TEST MEET — EN WAAROM DAT GEEN 99 % IS
   Een werkplaatstester belast de accu met ~100 A of meet de inwendige
   weerstand met wisselstroom. Over OBD kan dat niet; wat wél kan:

     rust     ATRV/0142 met de motor uit, na ≥ 2 uur stilstand (anders
              meet je de oppervlaktelading na het rijden). OCV → laadtoestand,
              met temperatuurcorrectie. Bewijs onder RUST_LAAG.
     start    de spanning tijdens het starten. Het oordeel gaat over het
              PLATEAU (mediaan van de dip), niet over de inschakelpiek van de
              eerste milliseconden: de BCI-grens van 9,6 V bij 21 °C (lager
              bij kou, BCI-tabel) is een grens onder aanhoudende last. Te
              weinig monsters in de dip = niet te beoordelen, geen oordeel.
     trend    de dip per koude start, omgerekend naar 20 °C, tegen de
              eigen eerste starts van deze accu. Het betrouwbaarste van de
              vier: de auto tegen zichzelf.
     belast   motor aan, grootlicht + achterruitverwarming + blower vol,
              60 s. Blijft de spanning onder de rustspanning, dan ontlaadt
              de accu terwijl de motor draait: dat is natuurkunde, geen
              grens die per merk verschilt.
     winter   de dip bij de koudste nacht uit de weersverwachting:
              inwendige weerstand +1,2 %/°C onder 20 °C (KOU_K).

   Bronnen en de afweging: PIDLANE-ARCHIEF.md, 25-10-2026.

   De kern is puur (_kern) en wordt los getoetst: test-accutest.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const VERSIE = '1.0 (25-10-2026)';
  const SLEUTEL = 'pl_accu';
  const VENSTER_DAGEN = 30;
  const RUST_MIN = 120;          // minuten stilstand vóór een rustmeting telt
  const RUST_LAAG = 12.2;        // V — onder ~50 %: bewijs
  const RUST_MATIG = 12.4;       // V — onder ~75 %: alleen info
  const DIP_MIN_MONSTERS = 3;    // zo veel monsters moet de startdip hebben
  const DIP_MAX_GAT = 250;       // ms tussen twee monsters rond de dip
  const DIP_DIEPTE = 0.8;        // V onder rust = de startmotor trekt
  const KOU_K = 0.012;           // relatieve toename van de dip per °C onder 20
  const TREND_FACTOR = 1.35, TREND_ABS = 0.4;
  const BELAST_MIN_S = 45, BELAST_MIN_MONSTERS = 10;
  const MAX_STARTS = 60;

  // BCI: minimale spanning onder last (15 s op halve CCA) per temperatuur.
  const BCI = [[-18, 8.5], [-12, 8.7], [-7, 8.9], [-1, 9.1], [4, 9.3], [10, 9.4], [16, 9.5], [21, 9.6]];
  // Rustspanning → laadtoestand bij 25 °C (natte/EFB-accu; AGM ligt ~0,1 V hoger).
  const OCV = [[11.9, 0], [12.0, 25], [12.2, 50], [12.4, 75], [12.65, 100]];

  const getal = (x) => (x === null || x === undefined || x === '' ? null : (isFinite(Number(x)) ? Number(x) : null));
  const nl1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
  const mediaan = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function tussen(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return tab[tab.length - 1][1];
  }
  const dag = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ── de kern: puur ─────────────────────────────────────────────────
  function startGrens(temp) { return Math.round(tussen(BCI, getal(temp) === null ? 21 : Number(temp)) * 100) / 100; }
  function ocvSoc(u, temp) {
    u = getal(u); if (u === null || u < 10 || u > 14) return null;
    const t = getal(temp);
    const u25 = t === null ? u : u + 0.003 * (25 - Math.max(-30, Math.min(45, t)));
    return Math.round(tussen(OCV, u25));
  }
  // De dip naar 20 °C: bij kou groeit de inwendige weerstand, en dus de dip.
  function kouFactor(temp) { const t = getal(temp); return t === null ? 1 : 1 + KOU_K * Math.max(0, 20 - Math.max(-30, t)); }

  function rustOordeel(o) {
    o = o || {};
    const u = getal(o.u), min = getal(o.rustMin);
    if (u === null) return { staat: 'onbekend', tekst: 'geen rustspanning gemeten' };
    if (min === null || min < RUST_MIN) return { staat: 'onbekend', tekst: 'rustspanning ' + nl1(u) + ' V — de auto stond korter dan 2 uur stil (of onbekend hoe lang): na het rijden zit er oppervlaktelading op, dat zegt niets' };
    const soc = ocvSoc(u, o.temp);
    if (u <= RUST_LAAG) return { staat: 'laag', bewijs: 'rust', soc, tekst: 'rustspanning ' + nl1(u) + ' V na ' + Math.round(min / 60) + ' uur stilstand — accu ongeveer ' + soc + ' % vol' };
    if (u < RUST_MATIG) return { staat: 'matig', soc, tekst: 'rustspanning ' + nl1(u) + ' V — accu ongeveer ' + soc + ' % vol: korte ritten laden hem niet vol' };
    return { staat: 'goed', soc, tekst: 'rustspanning ' + nl1(u) + ' V — accu ongeveer ' + soc + ' % vol' };
  }

  /* Uit een reeks {t, v} rond het starten: de dip. rust = de spanning vlak
     ervóór (of null). Geeft { ok, reden } of { ok:true, plateau, min, dU, n }. */
  function startUitMonsters(monsters, rust) {
    const m = (monsters || []).filter((x) => x && getal(x.t) !== null && getal(x.v) !== null).sort((a, b) => a.t - b.t);
    if (m.length < 4) return { ok: false, reden: 'te weinig metingen rond het starten' };
    let r = getal(rust);
    if (r === null) r = mediaan(m.slice(0, 3).map((x) => x.v));
    const drempel = r - DIP_DIEPTE;
    const iDip = m.map((x, i) => (x.v < drempel ? i : -1)).filter((i) => i >= 0);
    if (!iDip.length) return { ok: false, reden: 'geen startdip gezien (de meting was te traag of de motor is niet gestart)' };
    const a = iDip[0], b = iDip[iDip.length - 1];
    if (iDip.length < DIP_MIN_MONSTERS) return { ok: false, reden: 'maar ' + iDip.length + ' meting(en) tijdens het starten — te weinig om de accu te beoordelen' };
    for (let i = Math.max(1, a); i <= Math.min(m.length - 1, b + 1); i++)
      if (m[i].t - m[i - 1].t > DIP_MAX_GAT) return { ok: false, reden: 'gat van ' + (m[i].t - m[i - 1].t) + ' ms in de meting tijdens het starten — het diepste punt kan gemist zijn' };
    const dip = iDip.map((i) => m[i].v);
    const plateau = mediaan(dip);
    return { ok: true, plateau: Math.round(plateau * 100) / 100, min: Math.min.apply(null, dip), rust: Math.round(r * 100) / 100, dU: Math.round((r - plateau) * 100) / 100, n: dip.length, duurMs: m[b].t - m[a].t };
  }
  function startOordeel(s, temp) {
    if (!s || !s.ok) return { staat: 'onbekend', tekst: 'startdip niet te beoordelen: ' + ((s && s.reden) || 'geen meting') };
    const g = startGrens(temp), t = getal(temp);
    const bij = t === null ? '' : ' bij ' + Math.round(t) + ' °C';
    if (s.plateau < g) return { staat: 'zwak', bewijs: 'start', tekst: 'tijdens het starten zakt de accu naar ' + nl1(s.plateau) + ' V — onder de ' + nl1(g) + ' V die een gezonde accu' + bij + ' haalt' };
    if (s.plateau < g + 0.3) return { staat: 'krap', tekst: 'startdip ' + nl1(s.plateau) + ' V — net boven de grens van ' + nl1(g) + ' V' + bij };
    return { staat: 'goed', tekst: 'startdip ' + nl1(s.plateau) + ' V — ruim boven de ' + nl1(g) + ' V' + bij };
  }

  // Starts die samen een trend mogen vormen: koud, gemeten, één bron.
  function bruikbaar(starts, bron) { return (starts || []).filter((s) => s && s.ok && !s.herstart && getal(s.dU) !== null && s.dU > 0 && (!bron || s.bron === bron)); }
  const dU20 = (s) => s.dU / kouFactor(s.temp);
  function trend(starts) {
    const bron = (starts || []).filter((s) => s && s.ok).map((s) => s.bron).pop();
    const b = bruikbaar(starts, bron);
    if (b.length < 8) return { staat: 'onbekend', n: b.length, tekst: 'trend: ' + b.length + ' van de 8 koude starts gemeten' };
    const basis = mediaan(b.slice(0, 5).map(dU20)), nu = mediaan(b.slice(-3).map(dU20));
    if (nu >= basis * TREND_FACTOR && nu - basis >= TREND_ABS)
      return { staat: 'achteruit', bewijs: 'trend', basis, nu, tekst: 'de startdip is gegroeid van ' + nl1(basis) + ' naar ' + nl1(nu) + ' V (omgerekend naar 20 °C) — de accu gaat achteruit' };
    return { staat: 'stabiel', basis, nu, tekst: 'startdip stabiel: ' + nl1(nu) + ' V tegen ' + nl1(basis) + ' V bij de eerste starts (20 °C)' };
  }
  /* Haalt de accu de koudste nacht? tMin uit de weersverwachting. */
  function winter(starts, tMin) {
    const t = getal(tMin);
    if (t === null) return { staat: 'onbekend', tekst: 'geen weersverwachting — kies je plaats in het winterprofiel' };
    if (t >= 8) return { staat: 'geen', tekst: 'geen kou op komst (laagste ' + Math.round(t) + ' °C)' };
    const b = bruikbaar(starts);
    if (b.length < 3) return { staat: 'onbekend', tekst: 'voorspelling na 3 gemeten koude starts (nu ' + b.length + ')' };
    const r = b.slice(-3), d = mediaan(r.map(dU20)), rust = mediaan(r.map((s) => s.rust));
    const verwacht = rust - d * kouFactor(t), g = startGrens(t), marge = verwacht - g;
    const kop = 'bij ' + Math.round(t) + ' °C verwacht ' + nl1(verwacht) + ' V tijdens het starten (grens ' + nl1(g) + ' V)';
    if (marge < 0) return { staat: 'waarschuw', verwacht, grens: g, tekst: kop + ' — grote kans op startproblemen. Laad de accu een nacht bij of laat hem testen vóór het vriest' };
    if (marge < 0.4) return { staat: 'krap', verwacht, grens: g, tekst: kop + ' — krap. Rij een langere rit of laad hem bij' };
    return { staat: 'goed', verwacht, grens: g, tekst: kop + ' — ruim voldoende' };
  }

  /* Belastingproef: monsters {t, u, rpm}. rust = rustspanning vooraf of null. */
  function belastOordeel(monsters, rust, temp) {
    const m = (monsters || []).filter((x) => x && getal(x.u) !== null && getal(x.rpm) !== null && x.rpm >= 600).sort((a, b) => a.t - b.t);
    if (m.length < BELAST_MIN_MONSTERS || (m[m.length - 1].t - m[0].t) / 1000 < BELAST_MIN_S)
      return { staat: 'onbekend', tekst: 'belastingproef te kort of de motor draaide niet (' + m.length + ' metingen)' };
    const u = m.map((x) => x.u), hoog = window.PLKenmerk && PLKenmerk.laadHoog ? PLKenmerk.laadHoog(temp) : 15.2;
    const r = getal(rust), plafond = Math.min(12.5, r === null ? 12.5 : r - 0.1);
    if (u.every((x) => x < plafond))
      return { staat: 'ontlaadt', bewijs: 'belasting', tekst: 'met de motor aan en verbruikers aan bleef de spanning ' + nl1(Math.max.apply(null, u)) + ' V of lager — de accu ontlaadt terwijl de motor draait: de dynamo levert te weinig' };
    if (u.filter((x) => x > hoog).length >= 0.8 * u.length)
      return { staat: 'te_hoog', bewijs: 'overspanning', tekst: 'laadspanning ' + nl1(mediaan(u)) + ' V onder belasting — boven ' + nl1(hoog) + ' V: de regelaar knijpt niet af' };
    return { staat: 'goed', tegenbewijs: 'dynamo', tekst: 'onder belasting ' + nl1(Math.min.apply(null, u)) + '–' + nl1(Math.max.apply(null, u)) + ' V — de dynamo houdt het bij' };
  }

  // ── de poort: twee bewijzen ───────────────────────────────────────
  function bewijsErbij(lijst, b, nu) {
    nu = nu || Date.now();
    const d = dag(nu), oud = nu - 2 * VENSTER_DAGEN * 864e5;
    const uit = (lijst || []).filter((x) => x.t >= oud);
    if (!uit.some((x) => x.soort_van === b.soort_van && x.soort === b.soort && x.dag === d))
      uit.push({ soort_van: b.soort_van, soort: b.soort, dag: d, t: nu, tekst: String(b.tekst || '').slice(0, 200) });
    return uit;
  }
  function bevestigd(lijst, soortVan, nu) {
    nu = nu || Date.now();
    const b = (lijst || []).filter((x) => x.soort_van === soortVan && nu - x.t <= VENSTER_DAGEN * 864e5);
    const soorten = Array.from(new Set(b.map((x) => x.soort)));
    if (soorten.length >= 2) return { ja: true, reden: 'twee soorten bewijs: ' + soorten.join(' + '), bewijs: b };
    const dagen = Array.from(new Set(b.map((x) => x.dag)));
    if (dagen.length >= 2) return { ja: true, reden: soorten[0] + ' op ' + dagen.length + ' verschillende dagen', bewijs: b };
    return { ja: false, reden: b.length ? 'één aanwijzing (' + soorten[0] + ', ' + b[0].dag + ') — wacht op een tweede' : 'geen aanwijzingen', bewijs: b };
  }

  // ── de opslag, per voertuig ───────────────────────────────────────
  function autoId() {
    try { const v = window.PLGarage && PLGarage.actief && PLGarage.actief(); return (v && v.id) || 'los'; }
    catch (e) { console.warn('PLAccu: actief voertuig niet gelezen', e); return 'los'; }
  }
  function leesAlles() {
    try { return JSON.parse(localStorage.getItem(SLEUTEL) || '{}') || {}; }
    catch (e) { console.warn('PLAccu: opslag onleesbaar — begint leeg', e); return {}; }
  }
  function stand(id) {
    const a = leesAlles()[id || autoId()] || {};
    return { starts: a.starts || [], bewijs: a.bewijs || [], motorUit: a.motorUit || null, laatste: a.laatste || null };
  }
  function bewaar(st, id) {
    try { const a = leesAlles(); a[id || autoId()] = st; localStorage.setItem(SLEUTEL, JSON.stringify(a)); }
    catch (e) { console.warn('PLAccu: niet bewaard', e); }
  }

  const SOORT_VAN = { rust: 'accu', start: 'accu', trend: 'accu', soc: 'accu', belasting: 'dynamo', overspanning: 'dynamo', gevraagd: 'dynamo', laadspanning: 'dynamo', hard: 'dynamo' };
  function bewijs(soort, tekst, nu) {
    const sv = SOORT_VAN[soort]; if (!sv) { console.warn('PLAccu: onbekende soort bewijs ' + soort); return null; }
    const st = stand();
    st.bewijs = bewijsErbij(st.bewijs, { soort_van: sv, soort, tekst }, nu);
    bewaar(st);
    return bevestigd(st.bewijs, sv, nu);
  }
  function isBevestigd(soortVan, nu) { return bevestigd(stand().bewijs, soortVan, nu).ja; }
  function tegenbewijs(soortVan) { const st = stand(); st.bewijs = st.bewijs.filter((x) => x.soort_van !== soortVan); bewaar(st); }
  function nieuweAccu() { const st = stand(); st.starts = []; st.bewijs = st.bewijs.filter((x) => x.soort_van !== 'accu'); bewaar(st); }
  function startErbij(s) {
    const st = stand();
    st.starts.push(s); if (st.starts.length > MAX_STARTS) st.starts.splice(0, st.starts.length - MAX_STARTS);
    bewaar(st);
    return st;
  }
  // Een oordeel met een bewijs erin: noteren. Geeft het oordeel terug.
  function verwerk(o) { if (o && o.bewijs) bewijs(o.bewijs, o.tekst); if (o && o.tegenbewijs) tegenbewijs(o.tegenbewijs); return o; }

  function buitenTemp() {
    const v = typeof pidVals !== 'undefined' ? pidVals : {};
    return getal(v['0146']);
  }
  function verwachtMin() {
    try {
      if (!window.PLWinter || !window.PLWeer) return null;
      const p = PLWinter.profiel(); if (!p || !p.plaats) return null;
      const c = PLWeer.laatst(p.plaats); if (!c) return null;
      const s = PLWeer._kern.samenvat(c.dagen, Date.now());
      return s ? s.min : null;
    } catch (e) { console.warn('PLAccu: weersverwachting niet gelezen', e); return null; }
  }

  // ── stil meten bij elke start (alleen pidVals/pidHist, geen bus) ─────
  let _vorigRpm = null, _wacht = null, _timer = null;
  function _tik() {
    if (typeof pidVals === 'undefined' || typeof pidHist === 'undefined') return;
    if (typeof demoMode !== 'undefined' && demoMode) return;
    const rpm = getal(pidVals['010C']), nu = Date.now();
    if (rpm === null) return;
    const st = stand();
    if (_vorigRpm !== null && _vorigRpm >= 400 && rpm < 100) { st.motorUit = nu; bewaar(st); }
    if (_vorigRpm !== null && _vorigRpm < 300 && rpm >= 400 && !_wacht) _wacht = { t: nu, stil: st.motorUit ? (nu - st.motorUit) / 60000 : null };
    _vorigRpm = rpm;
    if (_wacht && nu - _wacht.t >= 4000) { const w = _wacht; _wacht = null; _startKlaar(w); }
  }
  function _startKlaar(w) {
    const h = (pidHist['0142'] || []).filter((x) => x.t >= w.t - 12000 && x.t <= w.t + 4000);
    const voor = h.filter((x) => x.t < w.t - 1500 && x.t >= w.t - 12000).map((x) => x.v);
    const s = startUitMonsters(h.map((x) => ({ t: x.t, v: x.v })), voor.length ? mediaan(voor) : null);
    const temp = buitenTemp();
    s.t = w.t; s.temp = temp; s.bron = '0142'; s.herstart = w.stil !== null && w.stil < 30;
    if (!s.ok) { console.info('PLAccu: start niet te beoordelen — ' + s.reden); return; }
    const st = startErbij(s);
    if (!s.herstart) verwerk(startOordeel(s, temp));
    if (!s.herstart && w.stil !== null && voor.length) verwerk(rustOordeel({ u: s.rust, rustMin: w.stil, temp }));
    verwerk(trend(st.starts));
  }
  function boot() { if (_timer) return; _timer = setInterval(() => { try { _tik(); } catch (e) { console.warn('PLAccu: tik mislukt', e); } }, 500); }

  // ── de begeleide test (bus via PLScanSlot) ───────────────────────────
  const volt = (r) => { const m = /(\d{1,2}(?:[.,]\d+)?)\s*V/i.exec(String(r || '')); return m ? Number(m[1].replace(',', '.')) : null; };
  const toeren = (r) => { const m = /41\s*0C\s*([0-9A-F]{2})\s*([0-9A-F]{2})/i.exec(String(r || '')); return m ? (parseInt(m[1], 16) * 256 + parseInt(m[2], 16)) / 4 : null; };
  const _nu = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  let _t = { stap: 0, stilMin: null, rust: null, start: null, belast: null, bezig: false, melding: '' };
  async function _bus(naam, werk) {
    if (typeof demoMode !== 'undefined' && demoMode) throw new Error('in de demo is er geen accu om te meten');
    if (!window.PLScanSlot) throw new Error('geen bus');
    return PLScanSlot.doe('accutest: ' + naam, { hartslagElke: 1000, pauzeMs: 0 }, werk);
  }
  async function meetRust() {
    const u = await _bus('rust', async (stuur) => { const a = []; for (let i = 0; i < 8; i++) { const v = volt(await stuur('ATRV', 1500)); if (v !== null) a.push(v); } return mediaan(a); });
    _t.rust = rustOordeel({ u, rustMin: _t.stilMin, temp: buitenTemp() }); _t.rust.u = u;
    verwerk(_t.rust); return _t.rust;
  }
  async function meetStart() {
    const m = await _bus('start', async (stuur) => {
      const uit = [], t0 = _nu(); let dipT = null, mis = 0;
      while (_nu() - t0 < 20000) {
        let v = null;
        try { v = volt(await stuur('ATRV', 800)); } catch (e) { console.warn('PLAccu: verbinding weg tijdens het starten', e); mis = 99; break; }
        if (v === null) { if (++mis > 5) break; continue; }
        const t = Date.now(); uit.push({ t, v });
        const r = uit.length > 3 ? mediaan(uit.slice(0, 3).map((x) => x.v)) : null;
        if (r !== null && v < r - DIP_DIEPTE && dipT === null) dipT = t;
        if (dipT !== null && v > r + 0.4 && t - dipT > 1500) break;   // motor loopt en laadt
      }
      return { uit, mis };
    });
    const r = _t.rust && _t.rust.u != null ? _t.rust.u : null;
    const s = startUitMonsters(m.uit, r);
    if (!s.ok && m.mis > 5) s.reden += ' — de adapter viel tijdens het starten weg (de spanning zakte dieper dan hij aankan)';
    s.t = Date.now(); s.temp = buitenTemp(); s.bron = 'atrv'; s.herstart = false;
    if (s.ok) startErbij(s);
    _t.start = verwerk(startOordeel(s, s.temp)); _t.start.s = s;
    return _t.start;
  }
  async function meetBelast() {
    const m = await _bus('belasting', async (stuur) => {
      const uit = [], t0 = _nu();
      while (_nu() - t0 < 60000) { const u = volt(await stuur('ATRV', 1500)), rpm = toeren(await stuur('010C', 1500)); uit.push({ t: Date.now(), u, rpm }); }
      return uit;
    });
    _t.belast = verwerk(belastOordeel(m, _t.rust && _t.rust.u, buitenTemp()));
    return _t.belast;
  }
  function uitslag(id) {
    const st = stand(id), a = bevestigd(st.bewijs, 'accu'), d = bevestigd(st.bewijs, 'dynamo');
    return { accu: a, dynamo: d, trend: trend(st.starts), winter: winter(st.starts, verwachtMin()) };
  }

  // ── het paneel ────────────────────────────────────────────────────
  const STAPPEN = [
    { kop: 'Hoe lang stond de auto stil?', doe: 'Een rustmeting telt pas na 2 uur: daarvoor zit er nog lading van de rit op.' },
    { kop: 'Contact aan, motor uit', doe: 'Alles uit: licht, blower, radio. Dan meten.' },
    { kop: 'Start de motor', doe: 'Druk op Meten en start binnen 15 seconden. Niet gas geven.' },
    { kop: 'Belastingproef (60 s)', doe: 'Motor stationair. Zet aan: grootlicht, achterruitverwarming, blower vol, stoelverwarming. Dan meten.' }
  ];
  function _el(tag, css, tekst) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (tekst != null) e.textContent = tekst; return e; }
  const KNOP = 'padding:9px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f)';
  async function _doe(fn) {
    if (_t.bezig) return;
    _t.bezig = true; _t.melding = 'bezig…'; _teken();
    try { await fn(); _t.stap++; _t.melding = ''; }
    catch (e) { console.warn('PLAccu: stap mislukt', e); _t.melding = 'Mislukt: ' + ((e && e.message) || e); }
    finally { _t.bezig = false; _teken(); }
  }
  let _open = false;
  function _regel(v, o) { if (o) v.appendChild(_el('div', 'margin:2px 0 6px;color:' + ({ laag: 'var(--rd)', zwak: 'var(--rd)', ontlaadt: 'var(--rd)', te_hoog: 'var(--rd)', matig: 'var(--or)', krap: 'var(--or)', goed: 'var(--gn)' }[o.staat] || 'var(--tx2)'), o.tekst)); }
  function _teken() {
    if (!_open) return;
    try {
      let v = document.getElementById('plAccuTest');
      if (!v) {
        v = _el('div', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;max-height:80vh;overflow:auto;background:var(--sur);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 13px/1.45 var(--f)');
        v.id = 'plAccuTest'; document.body.appendChild(v);
      }
      v.textContent = '';
      v.appendChild(_el('div', 'font-weight:800;font-size:15px', '🔋 Accu- en dynamotest'));
      STAPPEN.forEach((x, i) => {
        v.appendChild(_el('div', 'font-weight:700;margin-top:8px;opacity:' + (i <= _t.stap ? 1 : 0.45), (i + 1) + '. ' + x.kop));
        if (i === _t.stap) v.appendChild(_el('div', 'color:var(--tx2)', x.doe));
        if (i === 0 && _t.stilMin !== null) v.appendChild(_el('div', 'color:var(--tx2)', _t.stilMin >= RUST_MIN ? 'langer dan 2 uur' : 'korter dan 2 uur — de rustmeting telt niet mee'));
        if (i === 1) _regel(v, _t.rust);
        if (i === 2) _regel(v, _t.start);
        if (i === 3) _regel(v, _t.belast);
      });
      const k = _el('div', 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px');
      const knop = (t, f) => { const b = _el('button', KNOP, t); b.type = 'button'; b.disabled = _t.bezig; b.addEventListener('click', f); k.appendChild(b); };
      if (_t.stap === 0) { knop('Korter dan 2 uur', () => { _t.stilMin = 30; _t.stap = 1; _teken(); }); knop('Langer dan 2 uur', () => { _t.stilMin = 240; _t.stap = 1; _teken(); }); }
      else if (_t.stap === 1) knop('Meten', () => _doe(meetRust));
      else if (_t.stap === 2) knop('Meten — nu starten', () => _doe(meetStart));
      else if (_t.stap === 3) knop('Meten (60 s)', () => _doe(meetBelast));
      v.appendChild(k);
      if (_t.melding) v.appendChild(_el('div', 'margin-top:6px;font-weight:700;color:var(--or)', _t.melding));
      const u = uitslag();
      const vak = _el('div', 'margin-top:10px;padding:10px;border-radius:10px;background:var(--sur2)');
      vak.appendChild(_el('div', 'font-weight:800', 'Oordeel'));
      vak.appendChild(_el('div', '', 'Accu: ' + (u.accu.ja ? '⚠ bevestigd probleem — ' : '') + u.accu.reden));
      vak.appendChild(_el('div', '', 'Dynamo: ' + (u.dynamo.ja ? '⚠ bevestigd probleem — ' : '') + u.dynamo.reden));
      _regel(vak, u.trend); _regel(vak, Object.assign({}, u.winter, { tekst: '❄ ' + u.winter.tekst }));
      vak.appendChild(_el('div', 'color:var(--tx2);font-size:12px', 'Een melding komt pas bij twee bewijzen, of hetzelfde bewijs op twee dagen. Dit vervangt geen werkplaatstester (belasting- of weerstandsmeting).'));
      v.appendChild(vak);
      const k2 = _el('div', 'display:flex;gap:8px;margin-top:10px');
      const nieuw = _el('button', KNOP + ';flex:1', 'Nieuwe accu geplaatst'); nieuw.type = 'button';
      nieuw.addEventListener('click', () => { if (confirm('Trend en aanwijzingen van de oude accu wissen?')) { nieuweAccu(); _teken(); } });
      const dicht = _el('button', KNOP + ';flex:1', 'Sluiten'); dicht.type = 'button'; dicht.addEventListener('click', sluit);
      k2.appendChild(nieuw); k2.appendChild(dicht); v.appendChild(k2);
    } catch (e) { console.warn('PLAccu: paneel niet getekend', e); }
  }
  function open() {
    _open = true;
    const st = stand();
    _t = { stap: 0, stilMin: st.motorUit ? (Date.now() - st.motorUit) / 60000 : null, rust: null, start: null, belast: null, bezig: false, melding: '' };
    if (_t.stilMin !== null) _t.stap = 1;
    _teken();
  }
  function sluit() { _open = false; try { const v = document.getElementById('plAccuTest'); if (v) v.remove(); } catch (e) { console.warn('PLAccu: paneel niet gesloten', e); } }

  window.PLAccu = {
    versie: VERSIE,
    bewijs, bevestigd: isBevestigd, tegenbewijs, nieuweAccu, stand, uitslag,
    meetRust, meetStart, meetBelast, open, sluit, boot,
    _kern: { startGrens, ocvSoc, kouFactor, rustOordeel, startUitMonsters, startOordeel, trend, winter, belastOordeel, bewijsErbij, bevestigd, volt, toeren,
      CFG: { VENSTER_DAGEN, RUST_MIN, RUST_LAAG, DIP_MIN_MONSTERS, DIP_MAX_GAT, KOU_K } }
  };
  if (typeof document !== 'undefined') boot();
})();
