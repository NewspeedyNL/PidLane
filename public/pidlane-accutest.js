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

  const VERSIE = '2.0 (26-10-2026)';
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
    // De curve rond de dip, relatief aan het begin ervan, voor de grafiek.
    const curve = m.slice(Math.max(0, a - 8), Math.min(m.length, b + 20)).slice(0, 120).map((x) => [x.t - m[a].t, Math.round(x.v * 100) / 100]);
    return { ok: true, plateau: Math.round(plateau * 100) / 100, min: Math.min.apply(null, dip), rust: Math.round(r * 100) / 100, dU: Math.round((r - plateau) * 100) / 100, n: dip.length, duurMs: m[b].t - m[a].t, curve };
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
    // De bron met de meeste koude starts: 0142 uit de pollus en ATRV uit de
    // test meten niet even snel, en mogen dus geen trend met elkaar vormen.
    const tel = {}; bruikbaar(starts).forEach((s) => { tel[s.bron] = (tel[s.bron] || 0) + 1; });
    const bron = Object.keys(tel).sort((a, b) => tel[b] - tel[a])[0];
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

  /* Belastingproef: monsters {t, u, rpm, g?, i?} — g = gevraagde laadspanning,
     i = accustroom (+ laden, − ontladen), als de auto die geeft. rust =
     rustspanning vooraf of null. De stroom is het sterkste bewijs: die meet
     de accusensor zelf, zonder grens die per merk verschilt. */
  function belastOordeel(monsters, rust, temp) {
    const m = (monsters || []).filter((x) => x && getal(x.u) !== null && getal(x.rpm) !== null && x.rpm >= 600).sort((a, b) => a.t - b.t);
    if (m.length < BELAST_MIN_MONSTERS || (m[m.length - 1].t - m[0].t) / 1000 < BELAST_MIN_S)
      return { staat: 'onbekend', tekst: 'belastingproef te kort of de motor draaide niet (' + m.length + ' metingen)' };
    const u = m.map((x) => x.u), hoog = window.PLKenmerk && PLKenmerk.laadHoog ? PLKenmerk.laadHoog(temp) : 15.2;
    const r = getal(rust), plafond = Math.min(12.5, r === null ? 12.5 : r - 0.1);
    const mi = m.filter((x) => getal(x.i) !== null), mg = m.filter((x) => getal(x.g) !== null && x.g >= 11 && x.g <= 16);
    const iGem = mi.length ? mi.reduce((a, x) => a + x.i, 0) / mi.length : null;
    const afw = mg.length ? mg.reduce((a, x) => a + (x.u - x.g), 0) / mg.length : null;
    const extra = { stroom: iGem, afwijking: afw };
    if (mi.length >= BELAST_MIN_MONSTERS && mi.every((x) => x.i < -2))
      return Object.assign({ staat: 'ontlaadt', bewijs: 'belasting', tekst: 'de accusensor meet gemiddeld ' + nl1(iGem) + ' A uit de accu terwijl de motor draait — de dynamo levert minder dan de auto verbruikt' }, extra);
    if (u.every((x) => x < plafond))
      return Object.assign({ staat: 'ontlaadt', bewijs: 'belasting', tekst: 'met de motor aan en verbruikers aan bleef de spanning ' + nl1(Math.max.apply(null, u)) + ' V of lager — de accu ontlaadt terwijl de motor draait: de dynamo levert te weinig' }, extra);
    if (mg.length >= BELAST_MIN_MONSTERS && mg.filter((x) => x.u < x.g - 0.5).length >= 0.8 * mg.length)
      return Object.assign({ staat: 'achter', bewijs: 'gevraagd', tekst: 'de motorregeling vraagt gemiddeld ' + nl1(mediaan(mg.map((x) => x.g))) + ' V, de accu krijgt ' + nl1(mediaan(mg.map((x) => x.u))) + ' V — de dynamo haalt de vraag niet' }, extra);
    if (u.filter((x) => x > hoog).length >= 0.8 * u.length)
      return Object.assign({ staat: 'te_hoog', bewijs: 'overspanning', tekst: 'laadspanning ' + nl1(mediaan(u)) + ' V onder belasting — boven ' + nl1(hoog) + ' V: de regelaar knijpt niet af' }, extra);
    const bij = [];
    if (afw !== null) bij.push('volgt de gevraagde spanning (gemiddeld ' + (afw >= 0 ? '+' : '') + afw.toFixed(2).replace('.', ',') + ' V)');
    if (iGem !== null) bij.push('accustroom ' + (iGem >= 0 ? '+' : '') + nl1(iGem) + ' A');
    return Object.assign({ staat: 'goed', tegenbewijs: 'dynamo', tekst: 'onder belasting ' + nl1(Math.min.apply(null, u)) + '–' + nl1(Math.max.apply(null, u)) + ' V — de dynamo houdt het bij' + (bij.length ? '; ' + bij.join(', ') : '') }, extra);
  }

  /* Wat het laadsysteem NU doet, uit de PIDs die het slim maken. Puur.
     o = { u, rpm, g (gevraagd), soc, i (stroom) }; elk mag null zijn. */
  function laadStaat(o) {
    o = o || {};
    const u = getal(o.u), rpm = getal(o.rpm), g = getal(o.g), soc = getal(o.soc), i = getal(o.i);
    const uit = { modus: null, volgt: null, stroom: null, afwijking: null };
    if (u === null) return Object.assign(uit, { staat: 'geen', kop: 'Geen spanning', tekst: 'Geen accuspanning (0142) — niet verbonden of de PID staat uit' });
    if (rpm === null || rpm < 400) {
      Object.assign(uit, { staat: 'rust', kop: 'Motor uit', tekst: 'De accu levert alles' + (i !== null ? ' (' + nl1(-i) + ' A eruit)' : '') + (soc !== null ? '; laadtoestand ' + Math.round(soc) + ' %' : '') });
    } else if (g !== null && g >= 11 && g <= 16) {
      const afw = u - g; uit.afwijking = Math.round(afw * 100) / 100;
      uit.modus = g < 13.2 ? 'laag' : g <= 14.2 ? 'normaal' : 'snel';
      uit.volgt = afw >= -0.5;
      const MOD = { laag: 'bewust laag laden — accu vol genoeg, de dynamo ontziet de motor', normaal: 'normaal laden', snel: 'snel laden — remenergie terugwinnen of de accu bijladen' };
      Object.assign(uit, { staat: uit.volgt ? 'volgt' : 'achter', kop: uit.volgt ? 'Dynamo volgt de vraag' : 'Dynamo haalt de vraag niet', tekst: 'Gevraagd ' + nl1(g) + ' V, gemeten ' + nl1(u) + ' V: ' + MOD[uit.modus] });
    } else if (u >= 13.2) {
      Object.assign(uit, { staat: 'laadt', kop: 'Dynamo laadt', tekst: nl1(u) + ' V met draaiende motor' });
    } else {
      Object.assign(uit, { staat: 'onbekend', kop: 'Laag laden — niet te beoordelen', tekst: nl1(u) + ' V. Een slimme laadregeling doet dit bij een volle accu bewust. Met de gevraagde laadspanning weet de app het zeker' });
    }
    if (i !== null) uit.stroom = i > 1 ? 'laden' : i < -1 ? 'ontladen' : 'balans';
    return uit;
  }
  /* De wintercurve: de verwachte startspanning per temperatuur, met de
     BCI-grens ernaast. null zonder 3 gemeten koude starts. */
  function winterCurve(starts) {
    const b = bruikbaar(starts);
    if (b.length < 3) return null;
    const r = b.slice(-3), d = mediaan(r.map(dU20)), rust = mediaan(r.map((s) => s.rust)), uit = [];
    for (let t = -20; t <= 20; t += 2) uit.push({ t, verwacht: Math.round((rust - d * kouFactor(t)) * 100) / 100, grens: startGrens(t) });
    return uit;
  }

  /* Een lijngrafiek als SVG-tekst. Puur, zodat test-accutest.js hem toetst.
     o = { series: [{ p: [[x,y]…], k: kleur, naam, stip, streep }], ref: [{ y, k, naam }],
           yMin, yMax, xFmt, yFmt, h }. */
  function grafiek(o) {
    o = o || {};
    const W = 320, H = o.h || 140, L = 34, R = 8, T = 14, B = 18;
    const reeks = (o.series || []).map((s) => Object.assign({}, s, { p: (s.p || []).filter((q) => q && isFinite(q[0]) && isFinite(q[1])) })).filter((s) => s.p.length);
    const xs = [], ys = [];
    reeks.forEach((s) => s.p.forEach((q) => { xs.push(q[0]); ys.push(q[1]); }));
    (o.ref || []).forEach((r) => { if (isFinite(r.y)) ys.push(r.y); });
    if (!xs.length) return '<div class="pa-leeg">Nog geen meetpunten</div>';
    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    let y0 = o.yMin != null ? o.yMin : Math.min.apply(null, ys), y1 = o.yMax != null ? o.yMax : Math.max.apply(null, ys);
    if (y1 - y0 < 0.2) { y0 -= 0.1; y1 += 0.1; }
    const pad = (y1 - y0) * 0.08; if (o.yMin == null) y0 -= pad; if (o.yMax == null) y1 += pad;
    const X = (x) => L + (x - x0) / (x1 - x0) * (W - L - R), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const f = (n) => Math.round(n * 10) / 10;
    const yF = o.yFmt || ((y) => (Math.round(y * 10) / 10).toString().replace('.', ','));
    const xF = o.xFmt || ((x) => String(Math.round(x)));
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let svg = '<svg class="pa-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'grafiek') + '">';
    for (let k = 0; k <= 3; k++) {
      const y = y0 + (y1 - y0) * k / 3;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + f(Y(y)) + '" y2="' + f(Y(y)) + '" stroke="var(--bd)" stroke-width="0.6"/>' +
        '<text x="' + (L - 4) + '" y="' + f(Y(y) + 3) + '" text-anchor="end" font-size="8.5" fill="var(--tx2)">' + esc(yF(y)) + '</text>';
    }
    svg += '<text x="' + L + '" y="' + (H - 4) + '" font-size="8.5" fill="var(--tx2)">' + esc(xF(x0)) + '</text>' +
      '<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end" font-size="8.5" fill="var(--tx2)">' + esc(xF(x1)) + '</text>';
    (o.ref || []).forEach((r) => {
      if (!isFinite(r.y)) return;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + f(Y(r.y)) + '" y2="' + f(Y(r.y)) + '" stroke="' + (r.k || 'var(--rd)') + '" stroke-width="1" stroke-dasharray="4 3"/>' +
        (r.naam ? '<text x="' + (W - R - 2) + '" y="' + f(Y(r.y) - 3) + '" text-anchor="end" font-size="8.5" fill="' + (r.k || 'var(--rd)') + '">' + esc(r.naam) + '</text>' : '');
    });
    let lx = L;
    reeks.forEach((s) => {
      const k = s.k || 'var(--bl)';
      if (!s.stip || s.lijn) svg += '<polyline fill="none" stroke="' + k + '" stroke-width="' + (s.dik || 1.6) + '"' + (s.streep ? ' stroke-dasharray="3 3"' : '') + ' stroke-linejoin="round" points="' + s.p.map((q) => f(X(q[0])) + ',' + f(Y(q[1]))).join(' ') + '"/>';
      if (s.stip) s.p.forEach((q) => { svg += '<circle cx="' + f(X(q[0])) + '" cy="' + f(Y(q[1])) + '" r="2.6" fill="' + (q[2] || k) + '"/>'; });
      if (s.naam) { svg += '<rect x="' + lx + '" y="3" width="8" height="3" fill="' + k + '"/><text x="' + (lx + 11) + '" y="8" font-size="8.5" fill="var(--tx2)">' + esc(s.naam) + '</text>'; lx += 16 + String(s.naam).length * 4.6; }
    });
    return svg + '</svg>';
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
    return { starts: a.starts || [], rusten: a.rusten || [], bewijs: a.bewijs || [], motorUit: a.motorUit || null, laatste: a.laatste || null };
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
  function nieuweAccu() { const st = stand(); st.starts = []; st.rusten = []; st.bewijs = st.bewijs.filter((x) => x.soort_van !== 'accu'); bewaar(st); }
  function startErbij(s) {
    const st = stand();
    st.starts.push(s); if (st.starts.length > MAX_STARTS) st.starts.splice(0, st.starts.length - MAX_STARTS);
    // De startcurve alleen bij de laatste vijf: localStorage is klein.
    st.starts.slice(0, -5).forEach((x) => { delete x.curve; });
    bewaar(st);
    return st;
  }
  function rustErbij(r) {
    const st = stand();
    st.rusten.push(r); if (st.rusten.length > MAX_STARTS) st.rusten.splice(0, st.rusten.length - MAX_STARTS);
    bewaar(st);
    return st;
  }
  // Een oordeel met een bewijs erin: noteren. Geeft het oordeel terug.
  function verwerk(o) { if (o && o.bewijs) bewijs(o.bewijs, o.tekst); if (o && o.tegenbewijs) tegenbewijs(o.tegenbewijs); return o; }

  function verwachtMin() {
    try {
      if (!window.PLWinter || !window.PLWeer) return null;
      const p = PLWinter.profiel(); if (!p || !p.plaats) return null;
      const c = PLWeer.laatst(p.plaats); if (!c) return null;
      const s = PLWeer._kern.samenvat(c.dagen, Date.now());
      return s ? s.min : null;
    } catch (e) { console.warn('PLAccu: weersverwachting niet gelezen', e); return null; }
  }

  // ── live waarden uit de pollus (geen busverkeer) ─────────────────────
  function rolCodes() {
    try { return (window.PLEigen && PLEigen.laadCodes) ? PLEigen.laadCodes() : {}; }
    catch (e) { console.warn('PLAccu: rollen van de eigen sensoren niet gelezen', e); return {}; }
  }
  function rolDef(code) {
    try { return (window.PLEigen && PLEigen.defs ? PLEigen.defs() : []).filter((d) => d.pid === code)[0] || null; }
    catch (e) { console.warn('PLAccu: definitie van ' + code + ' niet gelezen', e); return null; }
  }
  // Verse waarde: het laatste monster van pid, niet ouder dan maxMs.
  function vers(pid, maxMs) {
    if (!pid || typeof pidVals === 'undefined') return null;
    const h = (typeof pidHist !== 'undefined' && pidHist[pid]) || null, l = h && h.length ? h[h.length - 1] : null;
    if (l && Date.now() - l.t > (maxMs || 15000)) return null;
    return getal(pidVals[pid]);
  }
  function reeksVan(pid, ms) {
    if (!pid || typeof pidHist === 'undefined' || !pidHist[pid]) return [];
    const nu = Date.now();
    return pidHist[pid].filter((x) => nu - x.t <= ms && getal(x.v) !== null).map((x) => [(x.t - nu) / 60000, Number(x.v)]);
  }
  function nuWaarden() {
    const c = rolCodes();
    return { u: vers('0142', 15000), rpm: vers('010C', 15000), g: vers(c.gevraagd, 20000), soc: vers(c.soc, 60000), i: vers(c.stroom, 20000),
      accutemp: vers(c.accutemp, 120000), leeftijd: vers(c.leeftijd, 600000), buiten: vers('0146', 120000), codes: c };
  }
  function buitenTemp() { const w = nuWaarden(); return w.accutemp !== null ? w.accutemp : w.buiten; }

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
    const temp = buitenTemp(), soc = nuWaarden().soc;
    s.t = w.t; s.temp = temp; s.soc = soc; s.bron = '0142'; s.herstart = w.stil !== null && w.stil < 30; s.stil = w.stil;
    if (!s.ok) { console.info('PLAccu: start niet te beoordelen — ' + s.reden); return; }
    const st = startErbij(s);
    if (!s.herstart) verwerk(startOordeel(s, temp));
    if (!s.herstart && w.stil !== null && voor.length) {
      const r = verwerk(rustOordeel({ u: s.rust, rustMin: w.stil, temp }));
      if (r.staat !== 'onbekend') rustErbij({ t: w.t, u: s.rust, min: w.stil, temp, soc, staat: r.staat });
    }
    verwerk(trend(st.starts));
    if (_open) _teken();
  }
  function boot() { if (_timer) return; _timer = setInterval(() => { try { _tik(); } catch (e) { console.warn('PLAccu: tik mislukt', e); } }, 500); }

  // ── de begeleide test ─────────────────────────────────────────────
  const volt = (r) => { const m = /(\d{1,2}(?:[.,]\d+)?)\s*V/i.exec(String(r || '')); return m ? Number(m[1].replace(',', '.')) : null; };
  const toeren = (r) => { const m = /41\s*0C\s*([0-9A-F]{2})\s*([0-9A-F]{2})/i.exec(String(r || '')); return m ? (parseInt(m[1], 16) * 256 + parseInt(m[2], 16)) / 4 : null; };
  const _nu = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const _slaap = (ms) => new Promise((r) => setTimeout(r, ms));
  const echt = () => !(typeof demoMode !== 'undefined' && demoMode) && typeof connected !== 'undefined' && !!connected;

  let _t = null;
  function _nieuweTest() {
    const st = stand();
    const stil = st.motorUit ? (Date.now() - st.motorUit) / 60000 : null;
    return { stap: stil !== null ? 1 : 0, stilMin: stil, rust: null, start: null, belast: null, bezig: false, melding: '', live: [], reeks: [] };
  }
  async function _bus(naam, werk) {
    if (!echt()) throw new Error('niet verbonden met een echte auto (in de demo is er geen accu om te meten)');
    if (!window.PLScanSlot) throw new Error('geen bus');
    return PLScanSlot.doe('accutest: ' + naam, { hartslagElke: 1000, pauzeMs: 0 }, werk);
  }
  async function meetRust() {
    if (!_t) _t = _nieuweTest();
    const u = await _bus('rust', async (stuur) => { const a = []; for (let i = 0; i < 8; i++) { const v = volt(await stuur('ATRV', 1500)); if (v !== null) a.push(v); } return mediaan(a); });
    const temp = buitenTemp();
    _t.rust = verwerk(rustOordeel({ u, rustMin: _t.stilMin, temp })); _t.rust.u = u;
    if (_t.rust.staat !== 'onbekend') rustErbij({ t: Date.now(), u, min: _t.stilMin, temp, soc: nuWaarden().soc, staat: _t.rust.staat, bron: 'atrv' });
    return _t.rust;
  }
  async function meetStart() {
    if (!_t) _t = _nieuweTest();
    _t.live = [];
    const m = await _bus('start', async (stuur) => {
      const uit = _t.live, t0 = _nu(); let dipT = null, mis = 0, getekend = 0;
      while (_nu() - t0 < 20000) {
        let v = null;
        try { v = volt(await stuur('ATRV', 800)); } catch (e) { console.warn('PLAccu: verbinding weg tijdens het starten', e); mis = 99; break; }
        if (v === null) { if (++mis > 5) break; continue; }
        const t = Date.now(); uit.push({ t, v });
        const r = uit.length > 3 ? mediaan(uit.slice(0, 3).map((x) => x.v)) : null;
        if (r !== null && v < r - DIP_DIEPTE && dipT === null) dipT = t;
        if (dipT !== null && v > r + 0.4 && t - dipT > 1500) break;   // motor loopt en laadt
        if (t - getekend > 250) { getekend = t; _tekenTab(); }
      }
      return { uit, mis };
    });
    const r = _t.rust && _t.rust.u != null ? _t.rust.u : null;
    const s = startUitMonsters(m.uit, r);
    if (!s.ok && m.mis > 5) s.reden += ' — de adapter viel tijdens het starten weg (de spanning zakte dieper dan hij aankan)';
    s.t = Date.now(); s.temp = buitenTemp(); s.soc = nuWaarden().soc; s.bron = 'atrv'; s.herstart = false; s.stil = _t.stilMin;
    if (s.ok) startErbij(s);
    _t.start = verwerk(startOordeel(s, s.temp)); _t.start.s = s;
    return _t.start;
  }
  /* De belastingproef leest de pollus mee, zodat de gevraagde laadspanning,
     de laadtoestand en de accustroom erbij zijn — precies wat een slimme
     laadregeling stuurt. Geen busslot nodig: alleen kijken. */
  async function meetBelast() {
    if (!_t) _t = _nieuweTest();
    if (!echt()) throw new Error('niet verbonden met een echte auto');
    const c = rolCodes();
    try { if (typeof pidToevoegen === 'function') pidToevoegen(['0142', '010C'].concat([c.gevraagd, c.soc, c.stroom].filter(Boolean)), { handmatig: false }); }
    catch (e) { console.warn('PLAccu: PIDs voor de belastingproef niet aangezet', e); }
    _t.reeks = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const w = nuWaarden();
      _t.reeks.push({ t: Date.now(), u: w.u, rpm: w.rpm, g: w.g, i: w.i, soc: w.soc });
      _tekenTab();
      await _slaap(500);
    }
    _t.belast = verwerk(belastOordeel(_t.reeks, _t.rust && _t.rust.u, buitenTemp()));
    return _t.belast;
  }
  function uitslag(id) {
    const st = stand(id);
    return { accu: bevestigd(st.bewijs, 'accu'), dynamo: bevestigd(st.bewijs, 'dynamo'), trend: trend(st.starts), winter: winter(st.starts, verwachtMin()), starts: st.starts, rusten: st.rusten };
  }

  // ── de benodigde PIDs zelf aanzetten (toestemming 26-10-2026) ─────────
  /* Tijdens de accutest zet de app wat hij nodig heeft zelf aan: 0142,
     010C en 0146 in de pollus, en voor elke laadrol die ontbreekt de beste
     kandidaat uit de PID-bibliotheek van dit voertuig (OBDb en stemmen). Elke
     kandidaat wordt eerst één keer op de auto gelezen; alleen een antwoord
     binnen het bereik van zijn rol telt. Alles is TIJDELIJK: bij het sluiten
     van de pagina gaan de eigen sensoren terug naar wat het voertuig had.
     Bewaren blijft een keuze van de gebruiker (Mijn voertuigen → Sensoren). */
  const ROL_BEREIK = { gevraagd: [11, 16], soc: [0, 100], stroom: [-400, 400], accutemp: [-40, 90] };
  const BASIS_PIDS = ['0142', '010C', '0146'];
  // Puur: per ontbrekende rol de kandidaat met de beste stemmen. heeft = { rol: code }.
  function kiesKandidaten(lijst, heeft, laadRol) {
    heeft = heeft || {};
    const score = (b) => (b.werkt || 0) - (b.werkt_niet || 0) + (b.mijn === 'werkt' ? 5 : 0);
    const per = {};
    (lijst || []).forEach((b) => {
      if (!b || !b.code || b.mijn === 'werkt_niet') return;
      const rol = laadRol ? laadRol(b.naam) : null;
      if (!rol || !ROL_BEREIK[rol] || heeft[rol]) return;
      if (!per[rol] || score(b) > score(per[rol])) per[rol] = b;
    });
    return Object.keys(ROL_BEREIK).filter((r) => per[r]).map((r) => ({ rol: r, b: per[r] }));
  }
  const inBereik = (rol, v) => { const g = ROL_BEREIK[rol]; return g && typeof v === 'number' && isFinite(v) && v >= g[0] && v <= g[1]; };

  let _act = { bezig: false, klaar: false, regels: [] }, _herstel = null;
  async function activeer() {
    if (_act.bezig || _act.klaar || !echt()) return _act;
    _act = { bezig: true, klaar: false, regels: [] };
    const regel = (t) => { _act.regels.push(t); if (_open) _tekenTab(); };
    try {
      const c = rolCodes(), basis = BASIS_PIDS.concat(Object.keys(c).map((r) => c[r]));
      if (typeof pidToevoegen === 'function') {
        const r = pidToevoegen(basis, { handmatig: false });
        regel('Aangezet in de pollus: ' + (r.ok.length ? r.ok.join(', ') : 'niets') + (r.weg.length ? ' (niet ondersteund: ' + r.weg.join(', ') + ')' : ''));
      }
      const mist = Object.keys(ROL_BEREIK).filter((r) => !c[r]);
      if (!mist.length) { regel('Alle laadsensoren staan al bij dit voertuig.'); return _act; }
      if (!window.PLGarage || !PLGarage.bibLijst || !window.PLEigen || !PLEigen.test) { regel('Ontbrekend: ' + mist.join(', ') + ' — zonder Mijn voertuigen geen bibliotheek om in te zoeken.'); return _act; }
      regel('Zoeken in de PID-bibliotheek van dit voertuig: ' + mist.join(', ') + '…');
      const kand = kiesKandidaten(await PLGarage.bibLijst(), c, PLEigen.laadRol);
      if (!kand.length) { regel('Geen kandidaat in de bibliotheek voor: ' + mist.join(', ') + '.'); return _act; }
      const nieuw = [];
      for (const k of kand) {
        const e = { code: k.b.code, naam: k.b.naam, formule: k.b.formule || 'A', eenheid: k.b.eenheid || '', ecu: k.b.ecu || '' };
        let t = null;
        try { t = await PLEigen.test(e); } catch (x) { console.warn('PLAccu: kandidaat ' + e.code + ' niet te lezen', x); t = { ok: false, fout: (x && x.message) || String(x) }; }
        if (t && t.ok && inBereik(k.rol, t.waarde)) { nieuw.push(e); regel('✓ ' + e.naam + ' (' + e.code + ') = ' + String(Math.round(t.waarde * 100) / 100).replace('.', ',') + ' ' + e.eenheid + ' — tijdelijk aan'); }
        else regel('✗ ' + e.naam + ' (' + e.code + '): ' + (t && t.ok ? 'waarde ' + t.waarde + ' past niet bij ' + k.rol : (t && t.fout) || 'geen antwoord'));
      }
      if (nieuw.length) {
        const v = PLGarage.actief && PLGarage.actief(), oud = (v && Array.isArray(v.eigen_pids)) ? v.eigen_pids : [];
        if (!_herstel) _herstel = { lijst: oud, naam: v && v.naam, codes: [] };
        PLEigen.zet(oud.concat(nieuw), v && v.naam);
        _herstel.codes = _herstel.codes.concat(nieuw.map((e) => e.code));
        if (typeof pidToevoegen === 'function') pidToevoegen(nieuw.map((e) => e.code), { handmatig: false, force: true });
        regel('Tijdelijk tot je deze pagina sluit. Bewaren: Mijn voertuigen → Sensoren.');
      }
    } catch (e) { console.warn('PLAccu: PIDs niet geactiveerd', e); regel('Activeren mislukt: ' + ((e && e.message) || e)); }
    finally { _act.bezig = false; _act.klaar = true; if (_open) _tekenTab(); }
    return _act;
  }
  function herstel() {
    if (!_herstel) return;
    const h = _herstel; _herstel = null;
    try {
      if (window.PLEigen) PLEigen.zet(h.lijst, h.naam);
      if (typeof activePIDs !== 'undefined') h.codes.forEach((c) => activePIDs.delete(c));
    } catch (e) { console.warn('PLAccu: eigen sensoren niet teruggezet', e); }
  }
  function hActiveer() {
    if (!_act.regels.length) return '';
    return '<div class="pa-kaart"><div class="pa-h"><span>Meetvoorbereiding</span>' + chip(_act.bezig ? 'rust' : 'goed', _act.bezig ? 'bezig' : 'klaar') + '</div><ul class="pa-bewijs">' +
      _act.regels.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul></div>';
  }

  // ── de pagina ─────────────────────────────────────────────────────
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KLEUR = { goed: 'gn', volgt: 'gn', laadt: 'gn', stabiel: 'gn', geen: '', matig: 'or', krap: 'or', onbekend: '', rust: 'bl', laag: 'rd', zwak: 'rd', ontlaadt: 'rd', te_hoog: 'rd', achter: 'rd', achteruit: 'rd', waarschuw: 'rd' };
  const LABEL = { goed: 'goed', matig: 'matig', krap: 'krap', onbekend: 'te weinig data', geen: 'geen kou op komst', laag: 'laag', zwak: 'zwak', ontlaadt: 'ontlaadt', te_hoog: 'te hoog',
    achter: 'haalt de vraag niet', stabiel: 'stabiel', achteruit: 'gaat achteruit', waarschuw: 'startrisico' };
  const chip = (staat, tekst) => '<span class="pa-chip ' + (KLEUR[staat] || '') + '">' + esc(tekst == null ? (LABEL[staat] || staat) : tekst) + '</span>';
  const tijdAs = (x) => (x > -0.05 ? 'nu' : x > -1 ? Math.round(x * 60) + ' s' : x.toFixed(1).replace('.', ',') + ' min');
  const fmt = (v, d, een) => (v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toFixed(d).replace('.', ',') + (een ? ' ' + een : ''));
  const datum = (t) => { const d = new Date(t); return d.getDate() + '-' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const ROLLEN = [
    { rol: 'gevraagd', naam: 'Gevraagde laadspanning', een: 'V', d: 2, mazda: '220304', uitleg: 'Wat de motorregeling van de dynamo vraagt. Dít maakt het systeem slim: laag bij een volle accu, hoog bij remmen en in de kou.' },
    { rol: 'soc', naam: 'Laadtoestand 12V-accu', een: '%', d: 0, mazda: '224028', uitleg: 'Uitgerekend door de accusensor op de minpool (stroom × tijd en rustspanning). Een slim systeem houdt hem rond 75–90 %.' },
    { rol: 'stroom', naam: 'Accustroom', een: 'A', d: 1, uitleg: '+ is laden, − is ontladen. Met de motor aan hoort hij niet lang negatief te zijn.' },
    { rol: 'accutemp', naam: 'Accutemperatuur', een: '°C', d: 0, uitleg: 'Bepaalt hoe hoog er geladen mag worden: kou = hoger laden (temperatuurcompensatie).' },
    { rol: 'leeftijd', naam: 'Acculeeftijd', een: 'u', d: 0, uitleg: 'Bedrijfsuren sinds de accu is aangemeld. Wordt na een nieuwe accu gereset (registreren).' }
  ];
  const TABS = [['live', 'Live'], ['test', 'Test'], ['trend', 'Trend'], ['winter', 'Winter'], ['uitleg', 'Methode']];
  let _open = false, _tab = 'live', _ververs = null;

  /* Laag 9990 (26-10-2026): "het venster opent niet op de voorgrond". Mijn
     voertuigen ligt op 9600, en op --z-modal-hoog (9800) bleef de kop van de
     app er bovenaan doorheen steken — bproef-accutest.js meet beide. Onder de
     privacy- en startschermen (10010+), die horen altijd bovenop. */
  function zorgCss() {
    if (document.getElementById('plAccuCss')) return;
    const st = document.createElement('style'); st.id = 'plAccuCss';
    st.textContent =
      '#plAccuTest{position:fixed;inset:0;z-index:9990;display:flex;flex-direction:column;background:var(--bg,#0b0f17);color:var(--tx);font:500 13px/1.45 var(--f,system-ui)}' +
      '#plAccuTest *{box-sizing:border-box}' +
      '.pa-kop{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 16px 8px;background:var(--sur);border-bottom:1px solid var(--bd)}' +
      '.pa-kop h2{margin:0;font:800 16px var(--f,system-ui);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pa-x{width:40px;height:40px;border-radius:10px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 18px var(--f,system-ui)}' +
      '.pa-tabs{display:flex;gap:4px;padding:8px 16px;background:var(--sur);border-bottom:1px solid var(--bd);overflow-x:auto}' +
      '.pa-tabs button{flex:1 0 auto;padding:8px 12px;border-radius:999px;border:1px solid var(--bd);background:transparent;color:var(--tx2);font:700 12px var(--f,system-ui)}' +
      '.pa-tabs button.aan{background:var(--bl);border-color:var(--bl);color:#fff}' +
      '.pa-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px calc(32px + env(safe-area-inset-bottom))}' +
      '.pa-in{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px}' +
      '.pa-kaart{background:var(--sur);border:1px solid var(--bd);border-radius:12px;padding:12px;min-width:0}' +
      '.pa-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;font:800 11px var(--f,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--tx2)}' +
      '.pa-groot{font:800 44px/1 var(--m,ui-monospace,monospace)}.pa-groot small{font-size:18px;color:var(--tx2)}' +
      '.pa-rij{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
      '.pa-sub{color:var(--tx2);font-size:12px}' +
      '.pa-tegels{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
      '.pa-tegel{background:var(--sur2);border-radius:10px;padding:8px 10px;min-width:0}' +
      '.pa-tegel small{display:block;color:var(--tx2);font-size:11px}.pa-tegel b{display:block;font:800 20px var(--m,ui-monospace,monospace)}' +
      '.pa-tegel code{font-size:10px;color:var(--tx3,var(--tx2))}.pa-tegel p{margin:4px 0 0;font-size:11px;color:var(--tx2)}' +
      '.pa-tegel.leeg b{color:var(--tx3,var(--tx2));font:700 13px var(--f,system-ui);padding:4px 0}' +
      '.pa-chip{display:inline-block;padding:3px 9px;border-radius:999px;font-weight:800;font-size:12px;background:var(--sur2);color:var(--tx)}' +
      '.pa-chip.gn{background:var(--gns,rgba(34,197,94,.15));color:var(--gn)}.pa-chip.or{background:var(--ors,rgba(245,158,11,.15));color:var(--or)}' +
      '.pa-chip.rd{background:var(--rds,rgba(239,68,68,.15));color:var(--rd)}.pa-chip.bl{background:var(--bls,rgba(59,130,246,.15));color:var(--bl)}' +
      '.pa-svg{width:100%;height:auto;display:block}.pa-leeg{padding:18px;text-align:center;color:var(--tx2);background:var(--sur2);border-radius:10px}' +
      '.pa-scroll{overflow-x:auto}.pa-tabel{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}' +
      '.pa-tabel th{text-align:left;color:var(--tx2);font-weight:700;padding:4px 6px;border-bottom:1px solid var(--bd)}.pa-tabel td{padding:4px 6px;border-bottom:1px solid var(--bd)}' +
      '.pa-tabel td.n{font-family:var(--m,ui-monospace,monospace);text-align:right}' +
      '.pa-knop{padding:10px 14px;border-radius:10px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f,system-ui)}' +
      '.pa-knop.hoofd{background:var(--bl);border-color:var(--bl);color:#fff}.pa-knop:disabled{opacity:.5}' +
      '.pa-stap{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--bd)}.pa-stap:first-child{border-top:0}' +
      '.pa-nr{flex:0 0 26px;height:26px;border-radius:50%;background:var(--sur2);display:flex;align-items:center;justify-content:center;font-weight:800}' +
      '.pa-stap.aan .pa-nr{background:var(--bl);color:#fff}.pa-stap.klaar .pa-nr{background:var(--gn);color:#fff}' +
      '.pa-stap > div:last-child{flex:1;min-width:0}' +
      '.pa-bewijs{margin:6px 0 0;padding:0;list-style:none;font-size:12px}.pa-bewijs li{padding:4px 0;border-top:1px dashed var(--bd)}' +
      '.pa-metriek{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin-top:8px}' +
      '.pa-metriek div{background:var(--sur2);border-radius:8px;padding:6px 8px}.pa-metriek small{display:block;font-size:10px;color:var(--tx2)}.pa-metriek b{font:800 14px var(--m,ui-monospace,monospace)}' +
      '#plAccuTest details summary{cursor:pointer;font-weight:800}#plAccuTest details p,#plAccuTest details li{color:var(--tx2)}';
    document.head.appendChild(st);
  }

  function hLive() {
    const w = nuWaarden(), ls = laadStaat(w), c = w.codes;
    const kleurU = w.u === null ? '' : (w.rpm !== null && w.rpm >= 400 ? (w.u < 12.2 || w.u > 15.5 ? 'rd' : 'gn') : (w.u < 12.2 ? 'rd' : w.u < 12.4 ? 'or' : 'gn'));
    let h = '<div class="pa-kaart"><div class="pa-h"><span>Laadsysteem nu</span>' + chip(ls.staat, ls.kop) + '</div>' +
      '<div class="pa-rij"><div class="pa-groot" style="color:var(--' + (kleurU || 'tx') + ')">' + fmt(w.u, 2) + '<small> V</small></div>' +
      '<div class="pa-sub" style="flex:1;min-width:160px">' + esc(ls.tekst) +
      (ls.afwijking !== null ? '<br>Regelafwijking: <b>' + (ls.afwijking >= 0 ? '+' : '') + fmt(ls.afwijking, 2, 'V') + '</b>' : '') +
      (ls.stroom ? '<br>Accu: <b>' + ({ laden: 'wordt geladen', ontladen: 'wordt ontladen', balans: 'in balans' })[ls.stroom] + '</b>' : '') + '</div></div>';
    const series = [{ p: reeksVan('0142', 300000), k: 'var(--bl)', naam: 'gemeten (0142)' }];
    if (c.gevraagd) series.push({ p: reeksVan(c.gevraagd, 300000), k: 'var(--or)', naam: 'gevraagd', streep: true });
    h += grafiek({ series, label: 'Accuspanning, laatste 5 minuten', xFmt: tijdAs, ref: [{ y: 12.2, k: 'var(--rd)', naam: '12,2' }] }) + '</div>';
    h += '<div class="pa-kaart"><div class="pa-h"><span>De sensoren die het slim maken</span></div><div class="pa-tegels">';
    ROLLEN.forEach((r) => {
      const code = c[r.rol], d = code ? rolDef(code) : null, v = code ? w[r.rol === 'gevraagd' ? 'g' : r.rol === 'stroom' ? 'i' : r.rol] : null;
      h += '<div class="pa-tegel' + (code ? '' : ' leeg') + '"><small>' + esc(r.naam) + '</small><b>' + (code ? fmt(v, r.d, r.een) : 'niet ingesteld') + '</b>' +
        '<code>' + (code ? esc(code.slice(0, 2) + ' ' + code.slice(2)) + (d && d.ecu ? ' @' + esc(d.ecu) : '') : (r.mazda ? 'Mazda: ' + r.mazda : 'merkspecifiek')) + '</code><p>' + esc(r.uitleg) + '</p></div>';
    });
    h += '<div class="pa-tegel"><small>Toerental</small><b>' + fmt(w.rpm, 0, 'rpm') + '</b><code>01 0C</code></div>' +
      '<div class="pa-tegel"><small>Buitentemperatuur</small><b>' + fmt(w.buiten, 0, '°C') + '</b><code>01 46</code></div></div>';
    if (!c.gevraagd || !c.soc) h += '<div class="pa-rij" style="margin-top:10px"><span class="pa-sub" style="flex:1;min-width:180px">Zonder de gevraagde laadspanning en de laadtoestand kan de app slim laden niet van een zwakke dynamo onderscheiden. Voeg ze toe bij de sensoren van je voertuig (OBDb zoekt ze voor je model).</span><button type="button" class="pa-knop" data-actie="sensoren">Sensoren instellen →</button></div>';
    h += '</div>';
    if (c.stroom || c.soc) {
      const s2 = [];
      if (c.stroom) s2.push({ p: reeksVan(c.stroom, 300000), k: 'var(--gn)', naam: 'stroom (A)' });
      if (c.soc && !c.stroom) s2.push({ p: reeksVan(c.soc, 300000), k: 'var(--gn)', naam: 'laadtoestand (%)' });
      h += '<div class="pa-kaart"><div class="pa-h"><span>' + (c.stroom ? 'Accustroom' : 'Laadtoestand') + ', laatste 5 minuten</span></div>' +
        grafiek({ series: s2, ref: c.stroom ? [{ y: 0, k: 'var(--tx2)', naam: '0 A' }] : [], xFmt: tijdAs }) + '</div>';
    }
    return h;
  }

  function hOordeel() {
    const u = uitslag();
    const blok = (naam, b) => '<div class="pa-kaart" style="flex:1;min-width:220px"><div class="pa-h"><span>' + naam + '</span>' +
      chip(b.ja ? 'zwak' : b.bewijs.length ? 'krap' : 'goed', b.ja ? 'probleem bevestigd' : b.bewijs.length ? b.bewijs.length + ' aanwijzing' + (b.bewijs.length > 1 ? 'en' : '') : 'geen aanwijzingen') + '</div>' +
      '<div class="pa-sub">' + esc(b.reden) + '</div>' +
      (b.bewijs.length ? '<ul class="pa-bewijs">' + b.bewijs.map((x) => '<li><b>' + esc(x.dag) + ' · ' + esc(x.soort) + '</b><br>' + esc(x.tekst) + '</li>').join('') + '</ul>' : '') + '</div>';
    return '<div class="pa-rij" style="align-items:stretch">' + blok('Accu', u.accu) + blok('Dynamo / laden', u.dynamo) + '</div>';
  }

  function hStartcurve(s, live) {
    const pts = live ? live.map((x, i) => [x.t - live[0].t, x.v]) : (s && s.curve ? s.curve : []);
    const ref = [];
    if (s && s.ok) { ref.push({ y: s.plateau, k: 'var(--or)', naam: 'plateau ' + fmt(s.plateau, 2) }); ref.push({ y: startGrens(s.temp), k: 'var(--rd)', naam: 'BCI ' + fmt(startGrens(s.temp), 1) }); }
    let h = grafiek({ series: [{ p: pts, k: 'var(--bl)', naam: 'spanning tijdens starten', stip: true, lijn: true }], ref, xFmt: (x) => Math.round(x) + ' ms', label: 'Startcurve' });
    if (s && s.ok) h += '<div class="pa-metriek">' +
      [['rust', fmt(s.rust, 2, 'V')], ['plateau', fmt(s.plateau, 2, 'V')], ['laagste', fmt(s.min, 2, 'V')], ['dip', fmt(s.dU, 2, 'V')], ['dip @20 °C', fmt(dU20(s), 2, 'V')],
        ['duur', fmt(s.duurMs, 0, 'ms')], ['monsters', s.n], ['temp', fmt(s.temp, 0, '°C')], ['bron', s.bron === 'atrv' ? 'ATRV (snel)' : '0142']].map((x) => '<div><small>' + x[0] + '</small><b>' + esc(x[1]) + '</b></div>').join('') + '</div>';
    return h;
  }

  function hTest() {
    const t = _t || (_t = _nieuweTest());
    const STAP = [
      { kop: 'Hoe lang stond de auto stil?', doe: 'Een rustmeting telt pas na 2 uur: daarvoor zit er nog lading van de rit op (oppervlaktelading).',
        uit: t.stilMin !== null ? chip(t.stilMin >= RUST_MIN ? 'goed' : 'krap', t.stilMin >= RUST_MIN ? Math.round(t.stilMin / 60) + ' uur stil' : 'korter dan 2 uur — rust telt niet') : '',
        knop: '<button type="button" class="pa-knop" data-actie="stil:kort">Korter dan 2 uur</button> <button type="button" class="pa-knop hoofd" data-actie="stil:lang">Langer dan 2 uur</button>' },
      { kop: 'Rustspanning — contact aan, motor uit', doe: 'Alles uit: licht, blower, radio. De adapter meet 8× zijn eigen spanning (ATRV).',
        uit: t.rust ? chip(t.rust.staat, fmt(t.rust.u, 2, 'V') + (t.rust.soc != null ? ' · ' + t.rust.soc + ' %' : '')) + '<div class="pa-sub">' + esc(t.rust.tekst) + '</div>' : '',
        knop: '<button type="button" class="pa-knop hoofd" data-actie="rust">Meten</button>' },
      { kop: 'Startdip — start de motor', doe: 'Druk op Meten en start binnen 15 seconden, zonder gas. De app leest alleen ATRV, zo snel als de adapter kan (20–50 ms).',
        uit: (t.live.length || (t.start && t.start.s) ? hStartcurve(t.start && t.start.s, t.start ? null : t.live) : '') + (t.start ? chip(t.start.staat) + '<div class="pa-sub">' + esc(t.start.tekst) + '</div>' : ''),
        knop: '<button type="button" class="pa-knop hoofd" data-actie="start">Meten — nu starten</button>' },
      { kop: 'Belastingproef — 60 s', doe: 'Motor stationair. Zet aan: grootlicht, achterruitverwarming, blower vol, stoelverwarming. De app leest spanning, toerental en — als ze ingesteld zijn — de gevraagde laadspanning en de accustroom mee.',
        uit: (t.reeks.length ? grafiek({ series: [{ p: t.reeks.map((x) => [(x.t - t.reeks[0].t) / 1000, x.u]), k: 'var(--bl)', naam: 'gemeten' },
          { p: t.reeks.filter((x) => x.g !== null).map((x) => [(x.t - t.reeks[0].t) / 1000, x.g]), k: 'var(--or)', naam: 'gevraagd', streep: true }],
          ref: t.rust && t.rust.u ? [{ y: t.rust.u, k: 'var(--tx2)', naam: 'rust ' + fmt(t.rust.u, 2) }] : [], xFmt: (x) => Math.round(x) + ' s' }) +
          (t.reeks.some((x) => x.i !== null) ? grafiek({ series: [{ p: t.reeks.filter((x) => x.i !== null).map((x) => [(x.t - t.reeks[0].t) / 1000, x.i]), k: 'var(--gn)', naam: 'accustroom (A)' }], ref: [{ y: 0, k: 'var(--tx2)', naam: '0 A' }], xFmt: (x) => Math.round(x) + ' s', h: 100 }) : '') : '') +
          (t.belast ? chip(t.belast.staat) + '<div class="pa-sub">' + esc(t.belast.tekst) + '</div>' : ''),
        knop: '<button type="button" class="pa-knop hoofd" data-actie="belast">Meten (60 s)</button>' }
    ];
    let h = '<div class="pa-kaart"><div class="pa-h"><span>Begeleide accu- en dynamotest</span><button type="button" class="pa-knop" data-actie="opnieuw">Opnieuw</button></div>';
    STAP.forEach((x, i) => {
      h += '<div class="pa-stap ' + (i < t.stap ? 'klaar' : i === t.stap ? 'aan' : '') + '"><div class="pa-nr">' + (i < t.stap ? '✓' : i + 1) + '</div><div><b>' + esc(x.kop) + '</b>' +
        (i === t.stap ? '<div class="pa-sub">' + esc(x.doe) + '</div>' : '') + (x.uit ? '<div style="margin-top:6px">' + x.uit + '</div>' : '') +
        (i === t.stap && !t.bezig ? '<div class="pa-rij" style="margin-top:8px">' + x.knop + '</div>' : '') + '</div></div>';
    });
    if (t.melding) h += '<div class="pa-chip or" style="margin-top:8px">' + esc(t.melding) + '</div>';
    return h + '</div>' + hOordeel();
  }

  function hTrend() {
    const u = uitslag(), b = u.starts.filter((s) => s && s.ok);
    const koud = b.filter((s) => !s.herstart);
    let h = '<div class="pa-kaart"><div class="pa-h"><span>Spanning tijdens het starten</span>' + chip(u.trend.staat) + '</div>';
    h += grafiek({ series: [
      { p: koud.map((s, i) => [i + 1, s.plateau, s.plateau < startGrens(s.temp) ? 'var(--rd)' : s.plateau < startGrens(s.temp) + 0.3 ? 'var(--or)' : 'var(--gn)']), k: 'var(--bl)', naam: 'plateau', stip: true, lijn: true },
      { p: koud.map((s, i) => [i + 1, startGrens(s.temp)]), k: 'var(--rd)', naam: 'BCI-grens bij die temp', streep: true }],
      xFmt: (x) => 'start ' + Math.round(x), label: 'Startplateau per koude start' });
    h += '<div class="pa-sub" style="margin-top:6px">' + esc(u.trend.tekst) + '</div></div>';
    const basis = u.trend.basis;
    h += '<div class="pa-kaart"><div class="pa-h"><span>Startdip omgerekend naar 20 °C</span></div>' +
      grafiek({ series: [{ p: bruikbaar(u.starts).map((s, i) => [i + 1, dU20(s)]), k: 'var(--pu,var(--bl))', naam: 'dip @20 °C (V)', stip: true, lijn: true }],
        ref: basis ? [{ y: basis, k: 'var(--gn)', naam: 'eigen basis ' + fmt(basis, 2) }, { y: Math.max(basis * TREND_FACTOR, basis + TREND_ABS), k: 'var(--rd)', naam: 'achteruit' }] : [],
        xFmt: (x) => 'start ' + Math.round(x) }) +
      '<div class="pa-sub" style="margin-top:6px">Kou maakt de dip dieper (inwendige weerstand +' + Math.round(KOU_K * 1000) / 10 + ' %/°C). Omgerekend naar 20 °C blijft alleen over wat de accu zelf doet. Een stijgende lijn is slijtage.</div></div>';
    if (u.rusten.length) h += '<div class="pa-kaart"><div class="pa-h"><span>Rustspanning na ≥ 2 uur stil</span></div>' +
      grafiek({ series: [{ p: u.rusten.map((r, i) => [i + 1, r.u]), k: 'var(--bl)', naam: 'rust (V)', stip: true, lijn: true }], ref: [{ y: RUST_MATIG, k: 'var(--or)', naam: '75 %' }, { y: RUST_LAAG, k: 'var(--rd)', naam: '50 %' }], xFmt: (x) => 'meting ' + Math.round(x) }) + '</div>';
    const laatst = b.slice().reverse().find((s) => s.curve);
    if (laatst) h += '<div class="pa-kaart"><div class="pa-h"><span>Laatste startcurve · ' + esc(datum(laatst.t)) + '</span></div>' + hStartcurve(laatst) + '</div>';
    if (b.length) h += '<div class="pa-kaart"><div class="pa-h"><span>Starts (' + b.length + ')</span></div><div class="pa-scroll"><table class="pa-tabel"><tr><th>wanneer</th><th>soort</th><th>temp</th><th>rust</th><th>plateau</th><th>dip</th><th>@20°C</th><th>SOC</th><th>n</th></tr>' +
      b.slice(-15).reverse().map((s) => '<tr><td>' + esc(datum(s.t)) + '</td><td>' + (s.herstart ? 'i-stop' : s.bron === 'atrv' ? 'test' : 'koud') + '</td><td class="n">' + fmt(s.temp, 0, '°') + '</td><td class="n">' + fmt(s.rust, 2) +
        '</td><td class="n" style="color:var(--' + (s.plateau < startGrens(s.temp) ? 'rd' : 'tx') + ')">' + fmt(s.plateau, 2) + '</td><td class="n">' + fmt(s.dU, 2) + '</td><td class="n">' + fmt(dU20(s), 2) + '</td><td class="n">' + fmt(s.soc, 0, '%') + '</td><td class="n">' + esc(s.n) + '</td></tr>').join('') +
      '</table></div></div>';
    else h += '<div class="pa-kaart"><div class="pa-leeg">Nog geen start gemeten. De app meet elke start mee als 0142 snel genoeg binnenkomt; de begeleide test (tab Test) meet altijd snel genoeg.</div></div>';
    return h + '<div class="pa-rij"><button type="button" class="pa-knop" data-actie="nieuw">Nieuwe accu geplaatst</button></div>';
  }

  function hWinter() {
    const u = uitslag(), c = winterCurve(u.starts), tMin = verwachtMin();
    let h = '<div class="pa-kaart"><div class="pa-h"><span>Haalt de accu de koudste nacht?</span>' + chip(u.winter.staat) + '</div><div class="pa-sub">' + esc(u.winter.tekst) + '</div>';
    if (c) {
      const ser = [{ p: c.map((x) => [x.t, x.verwacht]), k: 'var(--bl)', naam: 'verwachte startspanning' }, { p: c.map((x) => [x.t, x.grens]), k: 'var(--rd)', naam: 'BCI-grens', streep: true }];
      if (tMin !== null && tMin >= -20 && tMin <= 20) { const v = c.reduce((a, x) => (Math.abs(x.t - tMin) < Math.abs(a.t - tMin) ? x : a)); ser.push({ p: [[v.t, v.verwacht, 'var(--or)']], k: 'var(--or)', naam: 'verwachting ' + Math.round(tMin) + ' °C', stip: true }); }
      h += grafiek({ series: ser, xFmt: (x) => Math.round(x) + ' °C', label: 'Startspanning per temperatuur', h: 160 });
    }
    h += '</div><div class="pa-kaart"><div class="pa-h"><span>Pech voorkomen in de winter</span></div><ul style="margin:0;padding-left:18px">' +
      '<li>Bij 0 °C levert een accu ~20 % minder startvermogen, bij −18 °C ~50 %; de motorolie is stroperiger, dus de startmotor vraagt méér.</li>' +
      '<li>Korte ritten (&lt; 20 min) laden een accu met start-stop niet terug; een slim systeem laadt bewust niet vol. Rij wekelijks één langere rit, of laad een nacht bij met een acculader met AGM/EFB-stand.</li>' +
      '<li>Start-stop (i-stop) die steeds vaker niet werkt, is vaak het eerste teken van een lage laadtoestand — niet van een defect.</li>' +
      '<li>Een nieuwe accu bij start-stop: hetzelfde type (EFB of AGM) en laten aanmelden, anders laadt het systeem met de oude gegevens.</li></ul></div>';
    return h;
  }

  function hUitleg() {
    return '<div class="pa-kaart"><details open><summary>Hoe deze test oordeelt</summary>' +
      '<p><b>Twee bewijzen.</b> Een melding over accu of dynamo komt pas bij twee soorten bewijs, of dezelfde soort op twee dagen (binnen ' + VENSTER_DAGEN + ' dagen). Eén meting kan een i-stop, een inschakelpiek of een wegvallende adapter zijn.</p>' +
      '<p><b>Rust.</b> Rustspanning → laadtoestand (12,65 V ≈ 100 %, 12,4 ≈ 75 %, 12,2 ≈ 50 %), met temperatuurcorrectie, en alleen na ≥ 2 uur stil.</p>' +
      '<p><b>Start.</b> Het plateau (mediaan van de dip) tegen de BCI-grens per temperatuur: 9,6 V bij 21 °C tot 8,5 V bij −18 °C. De inschakelpiek van de eerste milliseconden telt niet mee. Minder dan ' + DIP_MIN_MONSTERS + ' monsters of een gat &gt; ' + DIP_MAX_GAT + ' ms = niet te beoordelen.</p>' +
      '<p><b>Trend.</b> De dip per koude start naar 20 °C omgerekend, tegen de mediaan van de eerste vijf starts van déze accu. Achteruit = ' + Math.round((TREND_FACTOR - 1) * 100) + ' % én ' + fmt(TREND_ABS, 1, 'V') + ' groter.</p>' +
      '<p><b>Laden.</b> Met de gevraagde laadspanning: haalt de dynamo de vraag (marge 0,5 V)? Met de accustroom: ontlaadt de accu terwijl de motor draait? Zonder die twee alleen natuurkunde: onder de rustspanning met de motor aan = ontladen. De bovengrens 15,2 V schuift in de kou tot +0,6 V mee.</p>' +
      '<p><b>Grenzen van OBD.</b> Een werkplaatstester belast de accu met ~100 A of meet de inwendige weerstand (conductantie). Dit is een uitgebreide schatting, geen vervanging.</p></details></div>';
  }

  function _html() {
    const v = (() => { try { return window.PLGarage && PLGarage.actief && PLGarage.actief(); } catch (e) { console.warn('PLAccu: voertuig', e); return null; } })();
    const naam = v ? (v.naam || [v.merk, v.model].filter(Boolean).join(' ')) : '';
    return '<div class="pa-kop"><h2>🔋 Accu & laadsysteem' + (naam ? ' · ' + esc(naam) : '') + '</h2><button type="button" class="pa-x" data-actie="sluit" aria-label="Sluiten">✕</button></div>' +
      '<div class="pa-tabs" role="tablist">' + TABS.map((x) => '<button type="button" role="tab" class="' + (x[0] === _tab ? 'aan' : '') + '" data-actie="tab:' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="pa-body"><div class="pa-in" id="plAccuTab"></div></div>';
  }
  function _tabHtml() {
    if (_tab === 'test') return hActiveer() + hTest();
    if (_tab === 'trend') return hTrend();
    if (_tab === 'winter') return hWinter();
    if (_tab === 'uitleg') return hUitleg();
    return hOordeel() + hActiveer() + hLive();
  }
  function _tekenTab() {
    if (!_open) return;
    try { const e = document.getElementById('plAccuTab'); if (e) e.innerHTML = _tabHtml(); }
    catch (e) { console.warn('PLAccu: tab niet getekend', e); }
  }
  function _teken() {
    if (!_open) return;
    try {
      zorgCss();
      let v = document.getElementById('plAccuTest');
      if (!v) {
        v = document.createElement('div'); v.id = 'plAccuTest'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
        v.addEventListener('click', _klik);
      }
      document.body.appendChild(v);   // altijd als laatste: bovenop alles wat er al hing
      v.innerHTML = _html();
      _tekenTab();
    } catch (e) { console.warn('PLAccu: pagina niet getekend', e); }
  }
  async function _doe(fn) {
    if (!_t) _t = _nieuweTest();
    if (_t.bezig) return;
    _t.bezig = true; _t.melding = ''; _tekenTab();
    try { await fn(); _t.stap++; }
    catch (e) { console.warn('PLAccu: stap mislukt', e); _t.melding = 'Mislukt: ' + ((e && e.message) || e); }
    finally { _t.bezig = false; _tekenTab(); }
  }
  function _klik(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-actie]') : null;
    if (!b) return;
    const a = b.getAttribute('data-actie');
    if (a === 'sluit') return sluit();
    if (a.indexOf('tab:') === 0) { _tab = a.slice(4); return _teken(); }
    if (a === 'stil:kort' || a === 'stil:lang') { _t.stilMin = a === 'stil:lang' ? 240 : 30; _t.stap = 1; return _tekenTab(); }
    if (a === 'rust') return _doe(meetRust);
    if (a === 'start') return _doe(meetStart);
    if (a === 'belast') return _doe(meetBelast);
    if (a === 'opnieuw') { _t = _nieuweTest(); return _tekenTab(); }
    if (a === 'nieuw') { if (confirm('Trend, rustmetingen en aanwijzingen van de oude accu wissen?')) { nieuweAccu(); _tekenTab(); } return; }
    if (a === 'sensoren') {
      sluit();
      try { if (window.PLGarage) { PLGarage.open(); const v = PLGarage.actief && PLGarage.actief(); if (v) { PLGarage._open(v.id); PLGarage._tab('sensoren'); } } }
      catch (x) { console.warn('PLAccu: sensoren niet geopend', x); }
    }
  }
  function open(tab) {
    _open = true;
    if (tab && TABS.some((x) => x[0] === tab)) _tab = tab;
    if (!_t || !_t.bezig) _t = _nieuweTest();
    _teken();
    if (echt()) activeer();
    if (!_ververs) _ververs = setInterval(() => { try { if (_open && (_tab === 'live' || (_tab === 'test' && _t && _t.bezig))) _tekenTab(); } catch (e) { console.warn('PLAccu: verversen', e); } }, 1000);
  }
  function sluit() {
    _open = false;
    herstel(); _act = { bezig: false, klaar: false, regels: [] };
    if (_ververs) { clearInterval(_ververs); _ververs = null; }
    try { const v = document.getElementById('plAccuTest'); if (v) v.remove(); } catch (e) { console.warn('PLAccu: pagina niet gesloten', e); }
  }

  window.PLAccu = {
    versie: VERSIE,
    bewijs, bevestigd: isBevestigd, tegenbewijs, nieuweAccu, stand, uitslag, nu: nuWaarden,
    meetRust, meetStart, meetBelast, activeer, herstel, open, sluit, boot,
    _kern: { kiesKandidaten, startGrens, ocvSoc, kouFactor, rustOordeel, startUitMonsters, startOordeel, trend, winter, winterCurve, belastOordeel, laadStaat, grafiek, bewijsErbij, bevestigd, volt, toeren,
      CFG: { VENSTER_DAGEN, RUST_MIN, RUST_LAAG, DIP_MIN_MONSTERS, DIP_MAX_GAT, KOU_K } }
  };
  if (typeof document !== 'undefined') boot();
})();
