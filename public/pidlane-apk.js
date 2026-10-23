/* ═══════════════════════════════════════════════════════════════════
   pidlane-apk.js — PLApk: de APK-geschiedenis van een kenteken (23-10-2026)
   ───────────────────────────────────────────────────────────────────
   WAT ER AL WAS

   De kenteken-check en de koopcheck lezen uit de RDW-basistabel wanneer
   de APK verloopt. Wat er bij de vorige keuringen gevonden is, stond er
   niet bij — terwijl dat voor een koper het eerste is wat hij wil weten:
   werd hij afgekeurd, waarop, en komt dat steeds terug?

   DRIE RDW-TABELLEN, op kenteken en gebrekcode aan elkaar geknoopt:

     sgfe-77wx  Meldingen keuringsinstantie → elke keuring: datum, tijd,
                soort melding, nieuwe vervaldatum
     a34c-vvps  Geconstateerde gebreken     → per keuring (zelfde datum en
                tijd): gebrekcode en aantal
     hx2c-gt7k  Gebreken                    → gebrekcode → omschrijving, met
                een geldigheidsperiode (een code kan van tekst veranderen)

   Veldnamen nagemeten op 23-10-2026 tegen een echt kenteken (twee keuringen,
   kentekenplaatverlichting twee keer).

   ADVIES OF GEBREK. Codes die met AC beginnen zijn adviespunten (bandprofiel
   1,6–2,5 mm, beginnende slijtage): de auto is daarop níét afgekeurd, maar
   het komt eraan. De rest is een gebrek dat hersteld moest worden.

   TE LAAT GEKEURD (23-10-2026). Elke melding draagt de nieuwe vervaldatum.
   Valt een keuring ná de vervaldatum van de keuring ervoor, dan reed de
   auto zo lang zonder geldige APK — of stond hij geschorst of in het
   buitenland, dat ziet deze tabel niet. Daarom zegt de tekst allebei, en
   telt pas een gat van meer dan GAT_DAGEN als "let op".

   NETWERK: dezelfde proxy als PLRecall (opendata.rdw.nl staat al in
   PROXY_ALLOWED_HOSTS). bouw() is puur en los getoetst (test-apk.js).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DS = { meldingen: 'sgfe-77wx', gebreken: 'a34c-vvps', omschrijving: 'hx2c-gt7k' };
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const MAX_KEURINGEN = 12;
  const GAT_DAGEN = 30;
  const _cache = new Map();

  const normKent = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const datumNl = d => /^\d{8}$/.test(String(d || '')) ? String(d).slice(6, 8) + '-' + String(d).slice(4, 6) + '-' + String(d).slice(0, 4) : '?';
  const isAdvies = id => /^AC/i.test(String(id || ''));

  async function rdw(dataset, query) {
    const doel = `https://opendata.rdw.nl/resource/${dataset}.json?${query}`;
    const r = await plFetch('/proxy?url=' + encodeURIComponent(doel));
    if (!r.ok) throw new Error(`RDW ${dataset}: HTTP ${r.status}`);
    return r.json();
  }

  /* De omschrijving die gold op de dag van de keuring. */
  function omschrijvingOp(rijen, id, datum) {
    const kand = (rijen || []).filter(r => r.gebrek_identificatie === id);
    const geldig = kand.filter(r => (!r.ingangsdatum_gebrek || r.ingangsdatum_gebrek <= datum) && (!r.einddatum_gebrek || r.einddatum_gebrek >= datum));
    const r = geldig[0] || kand[0];
    return r ? String(r.gebrek_omschrijving || '').trim() : '';
  }

  const dagenTussen = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))) / 864e5);

  /* Puur: meldingen → elke keuring die ná de vorige vervaldatum viel.
     Een herkeuring op dezelfde dag telt niet als "vorige". */
  function teLaat(meldingen) {
    // Alleen de APK zelf: een tachograaf-inbouw draagt een eigen vervaldatum.
    const m = (meldingen || []).filter(x => !x.soort_melding_ki_omschrijving || /periodiek/i.test(x.soort_melding_ki_omschrijving)).map(x => ({ datum: String(x.meld_datum_door_keuringsinstantie || ''), verval: String(x.vervaldatum_keuring || '') }))
      .filter(x => /^\d{8}$/.test(x.datum)).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    const uit = [];
    m.forEach((k, i) => {
      const eerder = m.slice(0, i).filter(v => v.datum < k.datum && /^\d{8}$/.test(v.verval)).map(v => v.verval);
      if (!eerder.length) return;
      const verval = eerder.reduce((a, b) => (b > a ? b : a));
      if (k.datum > verval) uit.push({ datum: k.datum, verlopen: verval, dagen: dagenTussen(verval, k.datum) });
    });
    return uit.sort((a, b) => (a.datum < b.datum ? 1 : -1));
  }

  /* Puur: drie RDW-antwoorden → keuringen met hun gebreken, nieuwste eerst,
     en een samenvatting. Een gebrek zonder bijpassende melding krijgt een
     eigen keuring op zijn datum: weggooien zou informatie kosten. */
  function bouw(meldingen, gebreken, omschrijvingen) {
    const sleutel = x => String(x.meld_datum_door_keuringsinstantie || '') + '|' + String(x.meld_tijd_door_keuringsinstantie || '');
    const per = new Map();
    (meldingen || []).forEach(m => {
      per.set(sleutel(m), { datum: String(m.meld_datum_door_keuringsinstantie || ''), soort: m.soort_melding_ki_omschrijving || '',
        keuring: m.soort_erkenning_omschrijving || '', vervaldatum: m.vervaldatum_keuring || '', gebreken: [] });
    });
    (gebreken || []).forEach(g => {
      const k = sleutel(g);
      if (!per.has(k)) per.set(k, { datum: String(g.meld_datum_door_keuringsinstantie || ''), soort: '', keuring: g.soort_erkenning_omschrijving || '', vervaldatum: '', gebreken: [] });
      const id = String(g.gebrek_identificatie || '').trim();
      per.get(k).gebreken.push({ id, aantal: parseInt(g.aantal_gebreken_geconstateerd, 10) || 1, advies: isAdvies(id),
        omschrijving: omschrijvingOp(omschrijvingen, id, per.get(k).datum) || 'gebrek ' + id });
    });
    const keuringen = [...per.values()].sort((a, b) => (b.datum > a.datum ? 1 : b.datum < a.datum ? -1 : 0)).slice(0, MAX_KEURINGEN);
    // Een gebrek (geen advies) dat bij twee of meer keuringen terugkomt.
    const tel = {};
    keuringen.forEach(k => new Set(k.gebreken.filter(g => !g.advies).map(g => g.omschrijving)).forEach(o => { tel[o] = (tel[o] || 0) + 1; }));
    const terugkerend = Object.keys(tel).filter(o => tel[o] >= 2);
    const laatste = keuringen[0] || null;
    const lg = laatste ? laatste.gebreken.filter(g => !g.advies).length : 0;
    const la = laatste ? laatste.gebreken.filter(g => g.advies).length : 0;
    const laat = teLaat(meldingen);
    const gaten = laat.filter(l => l.dagen > GAT_DAGEN);
    let tekst = 'Geen APK-keuringen bekend bij het RDW';
    if (laatste) tekst = 'Laatste keuring ' + datumNl(laatste.datum) + ': ' +
      (lg ? lg + ' gebrek' + (lg === 1 ? '' : 'en') : 'geen gebreken') + (la ? ', ' + la + ' adviespunt' + (la === 1 ? '' : 'en') : '');
    return { keuringen, samenvatting: { aantalKeuringen: keuringen.length, gebrekenLaatste: lg, adviesLaatste: la, terugkerend,
      teLaat: laat, gaten: gaten.length, niveau: terugkerend.length || gaten.length ? 'letop' : lg || laat.length ? 'info' : 'ok', tekst } };
  }

  async function check(kenteken, opties) {
    const kt = normKent(kenteken);
    if (kt.length < 4) throw new Error('Ongeldig kenteken');
    const c = _cache.get(kt);
    if (c && !(opties && opties.negeerCache) && Date.now() - c.t < CACHE_TTL) return c.res;
    const q = 'kenteken=' + encodeURIComponent(kt) + '&$limit=200';
    const [meldingen, gebreken] = await Promise.all([rdw(DS.meldingen, q), rdw(DS.gebreken, q)]);
    const ids = [...new Set((gebreken || []).map(g => String(g.gebrek_identificatie || '').replace(/[^0-9A-Za-z]/g, '')).filter(Boolean))];
    let oms = [];
    if (ids.length) {
      try { oms = await rdw(DS.omschrijving, '$where=' + encodeURIComponent('gebrek_identificatie in(' + ids.map(i => "'" + i + "'").join(',') + ')') + '&$limit=500'); }
      catch (e) { console.warn('PLApk: omschrijvingen niet opgehaald — de codes blijven staan', e); }
    }
    const res = Object.assign({ kenteken: kt }, bouw(meldingen, gebreken, oms));
    _cache.set(kt, { t: Date.now(), res });
    return res;
  }

  function html(res) {
    if (!res || !res.keuringen || !res.keuringen.length) return '';
    const s = res.samenvatting;
    let h = '<div class="plz-blok"><b>🔧 APK-geschiedenis</b><div class="plz-klein">' + esc(s.tekst) + '</div>';
    (s.teLaat || []).slice(0, 3).forEach(l => {
      h += '<div style="margin-top:6px">' + (l.dagen > GAT_DAGEN ? '⚠️ ' : '') + 'Gekeurd op ' + esc(datumNl(l.datum)) + ', ' + l.dagen + ' dag' + (l.dagen === 1 ? '' : 'en') +
        ' na de vervaldatum (' + esc(datumNl(l.verlopen)) + '). In die tijd had de auto geen geldige APK, of stond hij geschorst of in het buitenland.</div>';
    });
    if (s.terugkerend.length) h += '<div style="margin-top:6px">⚠️ Komt terug bij meerdere keuringen: ' + esc(s.terugkerend.join('; ')) + '</div>';
    res.keuringen.slice(0, 5).forEach(k => {
      h += '<div style="margin-top:6px"><b>' + esc(datumNl(k.datum)) + '</b>' + (k.soort ? ' <span class="plz-klein">' + esc(k.soort) + '</span>' : '');
      if (!k.gebreken.length) h += '<div class="plz-klein">Geen gebreken</div>';
      k.gebreken.forEach(g => { h += '<div class="plz-klein">' + (g.advies ? 'advies: ' : '• ') + esc(g.omschrijving) + (g.aantal > 1 ? ' (' + g.aantal + '×)' : '') + '</div>'; });
      h += '</div>';
    });
    return h + '<div class="plz-klein" style="margin-top:6px">Een adviespunt is geen afkeur: het mocht nog, maar is bijna aan vervanging toe.</div></div>';
  }

  function naarPromptRegel(res) {
    if (!res || !res.samenvatting) return '';
    const s = res.samenvatting;
    let r = 'APK-geschiedenis (RDW): ' + s.tekst + '.';
    const l = res.keuringen[0];
    if (l && l.gebreken.length) r += ' Gevonden: ' + l.gebreken.map(g => (g.advies ? 'advies ' : '') + g.omschrijving).join('; ') + '.';
    (s.teLaat || []).forEach(l => { r += ' Gekeurd ' + l.dagen + ' dagen na de vervaldatum (' + datumNl(l.datum) + '; geen geldige APK, of geschorst/buitenland).'; });
    if (s.terugkerend.length) r += ' Terugkerend: ' + s.terugkerend.join('; ') + '.';
    return r;
  }

  window.PLApk = { check, bouw, teLaat, html, naarPromptRegel, isAdvies, wisCache: () => _cache.clear(), DS };

  // De koopcheck meldt een kenteken; de APK-geschiedenis gaat dan mee de
  // AI-prompt in (window._plApk), net als de terugroepacties.
  window.addEventListener('pl:kenteken-geladen', ev => {
    const kt = ev && ev.detail && ev.detail.kenteken;
    if (!kt) return;
    check(kt).then(res => { window._plApk = res; })
      .catch(e => console.warn('PLApk: APK-geschiedenis niet opgehaald voor de koopcheck', e));
  });
})();
