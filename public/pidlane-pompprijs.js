/* ═══════════════════════════════════════════════════════════════════
   pidlane-pompprijs.js — PLPompprijs: de pompprijs van het CBS (23-10-2026)
   ───────────────────────────────────────────────────────────────────
   De standaardprijs (PLBerekend.PRIJS_STANDAARD, PLWijzer PRIJS) stond met
   de hand in de code en veroudert vanaf de dag dat hij erin gezet wordt.
   Het CBS publiceert per dag de gemiddelde pompprijs van Euro95, diesel en
   LPG (tabel 80416ned), gemeten aan de pomp en niet de adviesprijs. De
   tabel wordt wekelijks bijgewerkt: nagemeten op 23-10-2026 liep hij tot
   19-10-2026, vier dagen achter.

   WAT ER GEBEURT. Bij het opstarten haalt dit bestand de laatste 30 dagen
   op (via /proxy, opendata.cbs.nl staat in PROXY_ALLOWED_HOSTS) en zet de
   laatste volledige dag in beide tabellen. Lukt dat niet, dan blijven de
   getallen uit de code staan en zegt de console waarom. Een eigen prijs in
   het profiel wint altijd; dit raakt alleen de standaard.

   Een dag geldt alleen als alle drie de prijzen er zijn en binnen
   PLAUSIBEL vallen: een CBS-regel met een gat of een komma-fout (24,1 in
   plaats van 2,41) zet geen onzin in een kostenberekening.

   verwerk() is puur en los getoetst (test-pompprijs.js).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const TABEL = '80416ned';
  const DAGEN_TERUG = 30;
  const CACHE_SLEUTEL = 'pl_pompprijs_cbs';
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const PLAUSIBEL = { benzine: [1, 4], diesel: [1, 4], lpg: [0.3, 2.5] };
  const VELD = { benzine: 'BenzineEuro95_1', diesel: 'Diesel_2', lpg: 'Lpg_3' };

  const datumNl = d => String(d).slice(6, 8) + '-' + String(d).slice(4, 6) + '-' + String(d).slice(0, 4);
  const yyyymmdd = t => { const d = new Date(t); return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); };

  /* Puur: CBS-rijen → de laatste volledige, plausibele dag, of null. */
  function verwerk(rijen) {
    const goed = (rijen || []).filter(r => /^\d{8}$/.test(String(r && r.Perioden || '').trim()) && Object.keys(VELD).every(k => {
      const v = r[VELD[k]];
      return typeof v === 'number' && v >= PLAUSIBEL[k][0] && v <= PLAUSIBEL[k][1];
    }));
    if (!goed.length) return null;
    const r = goed.reduce((a, b) => (String(b.Perioden).trim() > String(a.Perioden).trim() ? b : a));
    const d = String(r.Perioden).trim();
    return { datum: d, datumNl: datumNl(d), benzine: r[VELD.benzine], diesel: r[VELD.diesel], lpg: r[VELD.lpg] };
  }

  let actueel = null;

  /* Zet de prijzen in de tabellen die de app al gebruikt. Hybride en
     plug-in tanken benzine; stroom komt niet van het CBS en blijft staan. */
  function pas(p) {
    if (!p) return false;
    const B = window.PLBerekend && PLBerekend.PRIJS_STANDAARD;
    if (B) Object.assign(B, { benzine: p.benzine, diesel: p.diesel, lpg: p.lpg, hybride: p.benzine, 'plug-in hybride': p.benzine });
    const W = window.PLWijzer && PLWijzer._kern && PLWijzer._kern.PRIJS;
    if (W) Object.assign(W, { benzine: p.benzine, diesel: p.diesel, lpg: p.lpg });
    actueel = p;
    api.actueel = p;
    return !!(B || W);
  }

  function uitCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_SLEUTEL) || 'null');
      return c && Date.now() - c.t < CACHE_TTL ? c.p : null;
    } catch (e) { console.warn('PLPompprijs: cache niet leesbaar', e); return null; }
  }
  function naarCache(p) {
    try { localStorage.setItem(CACHE_SLEUTEL, JSON.stringify({ t: Date.now(), p })); }
    catch (e) { console.warn('PLPompprijs: cache niet schrijfbaar', e); }
  }

  async function haal(opties) {
    const c = !(opties && opties.negeerCache) && uitCache();
    if (c) { pas(c); return c; }
    if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
    const vanaf = yyyymmdd(Date.now() - DAGEN_TERUG * 864e5);
    const doel = `https://opendata.cbs.nl/ODataApi/odata/${TABEL}/TypedDataSet?$filter=` +
      encodeURIComponent(`Perioden ge '${vanaf}'`) + '&$select=Perioden,' + Object.values(VELD).join(',');
    const r = await plFetch('/proxy?url=' + encodeURIComponent(doel));
    if (!r.ok) throw new Error('CBS ' + TABEL + ': HTTP ' + r.status);
    const p = verwerk(((await r.json()) || {}).value);
    if (!p) throw new Error('CBS ' + TABEL + ': geen volledige dag in de laatste ' + DAGEN_TERUG + ' dagen');
    naarCache(p);
    pas(p);
    return p;
  }

  /* Eén zin voor onder een kostenberekening. */
  function bronTekst() {
    return actueel ? 'Pompprijs: CBS-gemiddelde van ' + actueel.datumNl : '';
  }

  const api = { verwerk, pas, haal, bronTekst, actueel: null, PLAUSIBEL, TABEL };
  window.PLPompprijs = api;

  if (typeof plFetch === 'function') {
    haal().catch(e => console.warn('PLPompprijs: CBS-pompprijs niet opgehaald — de standaardprijs uit de code blijft staan', e));
  }
})();
