/* ═══════════════════════════════════════════════════════════════════
   pidlane-zonder.js — PLZonder: de app zonder adapter
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   Wie niet in de auto zat, had aan de app niets. Na het inloggen kwam het
   verbindscherm met twee keuzes: verbinden of een demo. Wat al zonder
   adapter kon — het RDW via de proxy, de foutcodetabellen die gewoon in
   pidlane-data.js staan, de terugroepacties, Mijn voertuigen — zat achter
   een verbinding of in de koopcheck verstopt. Een app die je alleen opent
   als je in de auto zit, open je hoogstens een paar keer per jaar.

   Dit bestand zet die dingen op het startscherm, voor wie niet verbonden is:

     • Kenteken-check (RDW): APK met de dagen die nog over zijn, WAM-
       verzekerd, het tellerstandoordeel, openstaande terugroepacties met
       detail (PLRecall), eerste toelating en import, trekgewicht geremd en
       ongeremd, het verbruik en de CO2 volgens de typekeuring en de
       emissieklasse. Voor je eigen auto, en voor een auto die je wilt kopen.
     • "Dit is mijn auto": het kenteken wordt de auto van de app, en de APK-
       datum komt als regel op het startscherm. Eén keer per dag ververst.
     • Foutcode opzoeken: DTCDB en DTC_MERK staan in de app zelf, dus "wat
       betekent P0301 die de garage noemde" kan zonder net en zonder auto.
     • Simuleer verbinding: de demo, met je eigen auto erin als je die hebt
       (pidlane-demo.js). Niets wordt bewaard.
     • Mijn voertuigen voor een klant: rapporten, ritten en open punten.

   ÉÉN DING, ÉÉN BETEKENIS. Dit is geen tweede koopcheck. De koopcheck is een
   aankoopkeuring mét adapter; dit is een blik op de papieren van een auto.
   De RDW-validatie is die van de koopcheck (validateRdwVehicle), de terug-
   roepacties die van PLRecall, de foutcodeteksten die van dtcInfo(). Hier
   staat alleen wat die drie niet doen: ze zonder verbinding bij elkaar zetten.

   PUUR EN NIET PUUR. normKent(), normCode(), dagenTot(), rdwOverzicht(),
   codeOordeel() en kaartKnoppen() zijn puur; test-zonder.js toetst ze met vm. De rest raakt
   het net of de DOM.

   Laadvolgorde: ná pidlane-nav.js. Gebruikt op het moment van aanroepen
   plFetch, PLRecall, dtcInfo, validateRdwVehicle, PLGarage, PLKlant,
   startDemo en _startDemoCore; niets daarvan bij het laden.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG = { mijn: 'pl_zonder_mijn' };   // { kent, keuring:'YYYYMMDD', merk, model, t }
  var VERS_MS = 24 * 60 * 60 * 1000;         // het RDW ververst dagelijks

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  function normKent(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* Een foutcode zoals hij in de tabellen staat: P0301. Een kale 0301 is een
     motorcode (P); dat is wat iemand bedoelt die hem van een bon overneemt. */
  function normCode(c) {
    var s = String(c || '').toUpperCase().replace(/[\s-]/g, '');
    if (/^[0-9][0-9A-F]{3}$/.test(s)) s = 'P' + s;
    return /^[PCBU][0-3][0-9A-F]{3}$/.test(s) ? s : null;
  }

  // RDW-datum (YYYYMMDD of ISO) → dagen vanaf vandaag; null als het geen datum is.
  function dagenTot(datum, nu) {
    var c = String(datum || '').replace(/\D/g, '').slice(0, 8);
    if (c.length < 8) return null;
    var d = new Date(c.slice(0, 4) + '-' + c.slice(4, 6) + '-' + c.slice(6, 8) + 'T00:00:00');
    if (isNaN(d)) return null;
    var n = new Date(nu || Date.now()); n.setHours(0, 0, 0, 0);
    return Math.round((d - n) / 864e5);
  }
  function datumNl(datum) {
    var c = String(datum || '').replace(/\D/g, '').slice(0, 8);
    return c.length < 8 ? '' : c.slice(6, 8) + '-' + c.slice(4, 6) + '-' + c.slice(0, 4);
  }
  function ja(x) { return /^j/i.test(String(x == null ? '' : x).trim()) || x === true; }
  function nee(x) { return /^n/i.test(String(x == null ? '' : x).trim()) || x === false; }
  function getal(x) { var g = parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(g) ? g : null; }
  function eerste(rij, namen) {
    for (var i = 0; i < namen.length; i++) {
      var v = rij && rij[namen[i]];
      if (v != null && String(v).trim() !== '') return v;
    }
    return null;
  }
  function kg(x) { var g = getal(x); return g != null && g > 0 ? Math.round(g).toLocaleString('nl-NL') + ' kg' : null; }

  function apkRegel(dagen, datum) {
    if (dagen == null) return null;
    var d = datumNl(datum);
    if (dagen < 0) return { ernst: 'rood', tekst: 'verlopen sinds ' + d + ' (' + (-dagen) + ' dag' + (dagen === -1 ? '' : 'en') + ')' };
    if (dagen <= 30) return { ernst: 'oranje', tekst: d + ' — nog ' + dagen + ' dag' + (dagen === 1 ? '' : 'en') };
    if (dagen <= 60) return { ernst: 'info', tekst: d + ' — nog ' + dagen + ' dagen' };
    return { ernst: 'groen', tekst: d + ' — nog ' + dagen + ' dagen' };
  }

  /* Het overzicht van één kenteken. `rij` = de rij uit m9d7-ebf2
     (Gekentekende_voertuigen), `bs` = de rijen uit 8ys7-d773 (brandstof),
     `nu` = tijdstip, `gevalideerd` = de uitkomst van validateRdwVehicle(rij)
     als die er is (merk, model, jaar en kleur komen dan dáár vandaan).
     Geeft { naam, regels:[{ico,label,waarde,ernst}], keuring:{datum,dagen}|null,
     aandacht:n }. Een veld dat het RDW niet geeft, komt er niet in: een
     vraagteken zegt niets en neemt ruimte in. */
  function rdwOverzicht(rij, bs, nu, gevalideerd) {
    rij = rij || {}; bs = Array.isArray(bs) ? bs : [];
    var f = (gevalideerd && gevalideerd.velden) || {};
    var regels = [];
    function r(ico, label, waarde, ernst) { if (waarde != null && String(waarde).trim() !== '') regels.push({ ico: ico, label: label, waarde: String(waarde), ernst: ernst || null }); }

    var merk = f.merk || rij.merk || '';
    var model = f.model || rij.handelsbenaming || '';
    var jaar = f.year || String(rij.datum_eerste_toelating || '').replace(/\D/g, '').slice(0, 4);
    var naam = [merk, model].filter(Boolean).join(' ') + (jaar ? ' (' + jaar + ')' : '');

    // Keuring en papieren
    var apkDatum = eerste(rij, ['vervaldatum_apk', 'vervaldatum_apk_dt']);
    var dagen = dagenTot(apkDatum, nu);
    var apk = apkRegel(dagen, apkDatum);
    if (apk) r('🔧', 'APK geldig tot', apk.tekst, apk.ernst);
    if (ja(rij.wacht_op_keuren)) r('⛔', 'Wacht op keuren', 'ja — de auto mag de weg niet op tot hij gekeurd is', 'rood');
    if (ja(rij.wam_verzekerd)) r('🛡️', 'WAM-verzekerd', 'ja', 'groen');
    else if (nee(rij.wam_verzekerd)) r('🛡️', 'WAM-verzekerd', 'nee — volgens het RDW niet verzekerd', 'rood');
    var teller = rij.tellerstandoordeel;
    if (teller) {
      var onlog = /onlogisch/i.test(teller), logisch = !onlog && /logisch/i.test(teller);
      r('⏱️', 'Tellerstand (NAP)', String(teller) + (rij.jaar_laatste_registratie_tellerstand ? ' · laatst geregistreerd ' + rij.jaar_laatste_registratie_tellerstand : ''), onlog ? 'rood' : (logisch ? 'groen' : null));
    }
    if (ja(rij.openstaande_terugroepactie_indicator)) r('🔔', 'Terugroepactie', 'staat open — details hieronder', 'rood');
    else if (nee(rij.openstaande_terugroepactie_indicator)) r('🔔', 'Terugroepactie', 'geen openstaande', 'groen');
    if (ja(rij.export_indicator)) r('✈️', 'Export', 'gemeld voor export', 'oranje');

    // Geschiedenis
    var eerst = datumNl(rij.datum_eerste_toelating), eerstNl = datumNl(rij.datum_eerste_tenaamstelling_in_nederland);
    r('🏭', 'Eerste toelating', eerst);
    if (eerstNl && eerst && eerstNl.slice(-4) !== eerst.slice(-4)) r('🇳🇱', 'In Nederland sinds', eerstNl + ' — geïmporteerd', 'info');
    r('👤', 'Huidige eigenaar sinds', datumNl(rij.datum_tenaamstelling));

    // Techniek en gebruik
    var brandstof = bs.map(function (b) { return b && b.brandstof_omschrijving; }).filter(Boolean);
    r('⛽', 'Brandstof', brandstof.join(' + '));
    var verbruik = null, co2 = null, euro = null;
    bs.forEach(function (b) {
      if (!b) return;
      if (verbruik == null) verbruik = getal(eerste(b, ['brandstofverbruik_gecombineerd_wltp', 'brandstofverbruik_gecombineerd', 'brandstof_verbruik_gecombineerd']));
      if (co2 == null) co2 = getal(eerste(b, ['co2_uitstoot_gecombineerd_wltp', 'co2_uitstoot_gecombineerd']));
      if (euro == null) euro = eerste(b, ['emissiecode_omschrijving', 'uitlaatemissieniveau']);
    });
    if (verbruik) r('📊', 'Verbruik volgens de typekeuring', String(verbruik).replace('.', ',') + ' l/100 km — in de praktijk meestal hoger');
    if (co2) r('🌫️', 'CO2', Math.round(co2) + ' g/km');
    if (euro) r('🏙️', 'Emissieklasse', /^\d$/.test(String(euro).trim()) ? 'Euro ' + String(euro).trim() : String(euro));
    var geremd = kg(rij.maximum_trekken_massa_geremd), ongeremd = kg(rij.maximum_massa_trekken_ongeremd);
    if (geremd || ongeremd) r('🚐', 'Trekgewicht', [geremd ? geremd + ' geremd' : '', ongeremd ? ongeremd + ' ongeremd' : ''].filter(Boolean).join(' · '));
    r('⚖️', 'Massa rijklaar', kg(rij.massa_rijklaar));
    var cc = f.cilinderinhoud || getal(rij.cilinderinhoud);
    if (cc) r('⚙️', 'Cilinderinhoud', Math.round(cc) + ' cc' + (rij.aantal_cilinders ? ' · ' + rij.aantal_cilinders + ' cilinders' : ''));
    r('🎨', 'Kleur', f.kleur || rij.eerste_kleur);
    var prijs = getal(rij.catalogusprijs);
    if (prijs) r('💶', 'Catalogusprijs', '€ ' + Math.round(prijs).toLocaleString('nl-NL'));

    return {
      naam: naam || 'Onbekend voertuig',
      merk: merk, model: model, jaar: jaar,
      regels: regels,
      keuring: dagen == null ? null : { datum: String(apkDatum).replace(/\D/g, '').slice(0, 8), dagen: dagen },
      aandacht: regels.filter(function (x) { return x.ernst === 'rood' || x.ernst === 'oranje'; }).length
    };
  }

  /* Welke knoppen de kaart op het startscherm toont. Puur. `st` = { verbonden,
     demo, klant, demoMag, mijn }. Verbonden: geen kaart (dan is er iets beters
     te doen). Demo: alleen de melding dat er niets bewaard wordt, met stoppen. */
  function kaartKnoppen(st) {
    st = st || {};
    if (st.verbonden) return [];
    if (st.demo) return ['demoStop'];
    var k = ['kenteken', 'lampje', 'foutcode'];
    if (st.demoMag) k.push('simuleer');
    if (st.klant) k.push('garage');
    return k;
  }

  /* Wat er bij een foutcode te zeggen valt naast de tekst uit dtcInfo().
     Puur. `info` = { desc, body, sev } zoals dtcInfo() hem geeft; sev komt uit
     DTCDB en DTC_MERK (high/med/low) of uit de cilindercontrole (warn). */
  var ERNST = {
    high: { ernst: 'rood', tekst: 'Ernstig — laat dit snel nakijken' },
    med: { ernst: 'oranje', tekst: 'Aandacht — plan een controle' },
    warn: { ernst: 'oranje', tekst: 'Twijfelachtig — mogelijk een uitleesfout' },
    low: { ernst: 'groen', tekst: 'Licht — geen haast' }
  };
  var GROEP = { P: 'aandrijving (motor en versnellingsbak)', C: 'onderstel (remmen, ABS, stuurinrichting)', B: 'carrosserie (airbags, comfort)', U: 'communicatie tussen regeleenheden' };
  function codeOordeel(code, info) {
    info = info || {};
    var onbekend = !info.desc || /^Onbekende code/.test(info.desc);
    var e = onbekend ? null : (ERNST[info.sev] || null);
    var c1 = String(code || '').charAt(1);
    return {
      onbekend: onbekend,
      ernst: e ? e.ernst : null,
      ernstTekst: e ? e.tekst : '',
      groep: GROEP[String(code || '').charAt(0)] || '',
      soort: c1 === '0' ? 'algemene code (voor elk merk gelijk)' : c1 === '1' ? 'fabrikantcode (betekenis kan per merk verschillen)' : 'deels algemeen, deels per merk'
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  TOESTAND
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLZonder: melding', e); } }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLZonder: demoMode onleesbaar', e); return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected && !isDemo(); } catch (e) { console.warn('PLZonder: verbinding onleesbaar', e); return false; } }
  function isKlant() { try { return !!(window.PLKlant && PLKlant.isKlant()); } catch (e) { console.warn('PLZonder: rol onleesbaar', e); return false; } }
  function demoMag() { try { return typeof featOn !== 'function' || featOn('feat_demo'); } catch (e) { console.warn('PLZonder: featureschakelaar onleesbaar', e); return true; } }
  function ingelogd() { try { return !!(window.currentUser && (window.currentUser.user || window.currentUser.name)); } catch (e) { return false; } }
  function lees(k) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
    catch (e) { console.warn('PLZonder: opslag ' + k + ' onleesbaar', e); return null; }
  }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('PLZonder: opslag ' + k + ' niet te schrijven', e); }
  }
  function mijn() {
    var m = lees(OPSLAG.mijn);
    var k = null;
    try { k = localStorage.getItem('pl_kenteken'); } catch (e) { console.warn('PLZonder: kenteken onleesbaar', e); }
    // Het kenteken van de app is de bron; staat er een ander in de cache, dan hoort die er niet meer bij.
    if (m && k && normKent(m.kent) !== normKent(k)) m = null;
    if (!m && k) m = { kent: normKent(k) };
    return m;
  }

  // ════════════════════════════════════════════════════════════════
  //  HET NET
  // ════════════════════════════════════════════════════════════════
  async function rdw(dataset, kent) {
    if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
    var r = await plFetch('/proxy?url=' + encodeURIComponent('https://opendata.rdw.nl/resource/' + dataset + '.json?kenteken=' + kent));
    if (r.status === 401) throw new Error('log eerst in — het RDW loopt via je account');
    if (!r.ok) throw new Error('RDW antwoordde met ' + r.status);
    return r.json();
  }
  async function haal(kent) {
    var rijen = await rdw('m9d7-ebf2', kent);
    var rij = rijen && rijen[0];
    if (!rij) return null;
    var bs = [];
    try { bs = await rdw('8ys7-d773', kent); }
    catch (e) { console.warn('PLZonder: RDW-brandstofgegevens niet opgehaald — verbruik en emissie ontbreken', e); }
    var val = null;
    try { if (typeof validateRdwVehicle === 'function') val = validateRdwVehicle(rij); }
    catch (e) { console.warn('PLZonder: RDW-validatie mislukt — ruwe velden gebruikt', e); }
    return { rij: rij, bs: bs, overzicht: rdwOverzicht(rij, bs, Date.now(), val) };
  }

  /* Eén keer per dag de APK-regel van je eigen auto verversen, stil. */
  var _verversBezig = false;
  async function verversMijn() {
    var m = mijn();
    if (!m || !m.kent || _verversBezig || isDemo() || !ingelogd()) return;
    if (m.t && Date.now() - m.t < VERS_MS) return;
    _verversBezig = true;
    try {
      var d = await haal(m.kent);
      if (d) {
        bewaarMijn(m.kent, d.overzicht); teken(true);
        try { if (window.PLHerinner) PLHerinner.synchroniseer(false); } catch (e) { console.warn('PLZonder: herinneringen niet bijgewerkt', e); }
      }
    } catch (e) { console.warn('PLZonder: APK van je auto niet ververst — de vorige stand blijft staan', e); }
    finally { _verversBezig = false; }
  }
  function bewaarMijn(kent, o) {
    if (isDemo()) return;
    schrijf(OPSLAG.mijn, { kent: normKent(kent), keuring: o.keuring ? o.keuring.datum : null, merk: o.merk, model: o.model, t: Date.now() });
  }

  // ════════════════════════════════════════════════════════════════
  //  DE KAART OP HET STARTSCHERM
  // ════════════════════════════════════════════════════════════════
  var CSS =
    '#plZonderKaart .plz{margin:0 0 12px;padding:12px 13px;border-radius:14px;border:1px solid var(--bd);background:var(--sur2);font-family:var(--f)}' +
    '#plZonderKaart .plz-kop{font-size:13px;font-weight:800;color:var(--tx)}' +
    '#plZonderKaart .plz-sub{font-size:11.5px;color:var(--tx3);margin:2px 0 9px}' +
    '#plZonderKaart .plz-mijn{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tx2);margin:0 0 9px;padding:8px 10px;border-radius:10px;background:var(--sur);border:1px solid var(--bd);cursor:pointer}' +
    '#plZonderKaart .plz-mijn b{color:var(--tx)}' +
    '#plZonderKaart .plz-rij{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '#plZonderKaart .plz-k{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:10px 11px;border-radius:11px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer;min-width:0}' +
    '#plZonderKaart .plz-k small{font-size:11px;font-weight:600;color:var(--tx3);line-height:1.3}' +
    '#plZonderKaart .plz-demo{display:flex;align-items:center;gap:10px;background:var(--pus);border-color:var(--pu)}' +
    '#plZonderKaart .plz-demo .plz-k{flex:0 0 auto;align-items:center}' +
    '.plz-dot{width:10px;height:10px;border-radius:50%;flex:0 0 10px;background:var(--tx3)}' +
    '.plz-dot.rood{background:var(--rd)}.plz-dot.oranje{background:var(--or)}.plz-dot.groen{background:var(--gn)}.plz-dot.info{background:var(--bl)}' +
    '#plZonderOv{position:fixed;inset:0;z-index:9700;background:rgba(8,11,17,.88);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plZonderOv .plz-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx);box-sizing:border-box}' +
    '#plZonderOv .plz-kop2{display:flex;align-items:center;justify-content:space-between;gap:9px;font-size:15px;font-weight:800;margin-bottom:10px}' +
    '#plZonderOv .plz-x{width:32px;height:32px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);cursor:pointer}' +
    '#plZonderOv .plz-in{display:flex;gap:8px;margin-bottom:8px}' +
    '#plZonderOv input{flex:1;min-width:0;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:17px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}' +
    '#plZonderOv .plz-go{padding:0 16px;border-radius:10px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer}' +
    '#plZonderOv .plz-st{font-size:12px;color:var(--tx3);min-height:16px;margin-bottom:8px}' +
    '#plZonderOv .plz-naam{font-size:16px;font-weight:800;margin:4px 0 8px}' +
    '#plZonderOv .plz-regel{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--bd);font-size:12.5px}' +
    '#plZonderOv .plz-regel .plz-l{color:var(--tx3);font-size:11px}' +
    '#plZonderOv .plz-regel .plz-w{font-weight:700;color:var(--tx)}' +
    '#plZonderOv .plz-blok{margin-top:10px;padding:10px 11px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);font-size:12.5px;line-height:1.5}' +
    '#plZonderOv .plz-knoppen{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
    '#plZonderOv .plz-kn{padding:10px 13px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:800;cursor:pointer}' +
    '#plZonderOv .plz-kn.hoofd{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plZonderOv .plz-klein{font-size:11px;color:var(--tx3);line-height:1.5}';
  function zorgCss() {
    if (el('plZonderCss')) return;
    var s = document.createElement('style'); s.id = 'plZonderCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var KNOP = {
    kenteken: { ic: '🔎', t: 'Kenteken-check', d: 'APK, verzekering, NAP, terugroep', on: 'PLZonder.kenteken()' },
    lampje: { ic: '💡', t: 'Lampje brandt?', d: 'Mag ik doorrijden?', on: 'PLLampjes.open()' },
    foutcode: { ic: '🔧', t: 'Foutcode opzoeken', d: 'Wat betekent P0301?', on: 'PLZonder.foutcode()' },
    simuleer: { ic: '▷', t: 'Simuleer verbinding', d: 'Alles proberen, niets bewaard', on: 'PLZonder.simuleer()' },
    garage: { ic: '📄', t: 'Mijn rapporten & ritten', d: 'Mijn voertuigen', on: 'PLGarage.open()' }
  };

  function herinnerRegel() {
    try { return window.PLHerinner ? PLHerinner.regel() : null; }
    catch (e) { console.warn('PLZonder: herinneringsstand onleesbaar', e); return null; }
  }

  var _laatst = '';
  function teken(forceer) {
    var doel = el('plZonderKaart');
    if (!doel) return;
    var st = { verbonden: isVerbonden(), demo: isDemo(), klant: isKlant(), demoMag: demoMag(), mijn: mijn(), herinner: herinnerRegel() };
    var sleutel = JSON.stringify(st);
    if (!forceer && sleutel === _laatst) return;
    _laatst = sleutel;
    var knoppen = kaartKnoppen(st);
    if (!knoppen.length) { doel.innerHTML = ''; return; }
    zorgCss();
    if (st.demo) {
      doel.innerHTML = '<div class="plz plz-demo"><div style="flex:1"><div class="plz-kop">🧪 Gesimuleerde verbinding</div>' +
        '<div class="plz-sub" style="margin:2px 0 0">Alles werkt, er wordt niets bewaard: geen rapport, geen rit, geen instelling. Je eigen voertuigen en rapporten kun je gewoon bekijken.</div></div>' +
        '<button type="button" class="plz-k" onclick="PLZonder.stopDemo()">Stop</button></div>';
      return;
    }
    var h = '<div class="plz"><div class="plz-kop">Niet in de auto?</div><div class="plz-sub">Dit werkt zonder adapter.</div>';
    var m = st.mijn;
    if (m && m.kent) {
      var dagen = m.keuring ? dagenTot(m.keuring) : null, regel = apkRegel(dagen, m.keuring);
      h += '<div class="plz-mijn" onclick="PLZonder.kenteken(\'' + esc(m.kent) + '\')"><span class="plz-dot ' + (regel ? regel.ernst : '') + '"></span>' +
        '<span style="flex:1"><b>' + esc([m.merk, m.model].filter(Boolean).join(' ') || m.kent) + '</b> · ' +
        (regel ? 'APK ' + esc(regel.tekst) : 'tik voor APK, verzekering en terugroepacties') + '</span><span aria-hidden="true">→</span></div>';
    }
    var hr = herinnerRegel();
    if (hr) h += '<div class="plz-mijn" data-plz="herinner" onclick="PLHerinner.zet(' + (hr.aan ? 'false' : 'true') + ')"><span aria-hidden="true">' + (hr.aan ? '🔔' : '🔕') + '</span>' +
      '<span style="flex:1">' + (hr.aan ? '<b>Herinnering aan</b> · APK en onderhoud, 30 en 7 dagen vooraf' : '<b>Herinner me</b> aan de APK en het onderhoud') + '</span><span style="font-weight:800;color:var(--bl)">' + (hr.aan ? 'Uit' : 'Aan') + '</span></div>';
    h += '<div class="plz-rij">' + knoppen.map(function (k) {
      var b = KNOP[k];
      return '<button type="button" class="plz-k" data-plz="' + k + '" onclick="' + b.on + '"><span>' + b.ic + ' ' + esc(b.t) + '</span><small>' + esc(b.d) + '</small></button>';
    }).join('') + '</div></div>';
    doel.innerHTML = h;
  }

  // ════════════════════════════════════════════════════════════════
  //  HET VENSTER
  // ════════════════════════════════════════════════════════════════
  function blad(titel, inhoud) {
    zorgCss();
    var ov = el('plZonderOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plZonderOv';
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div class="plz-doos"><div class="plz-kop2"><span>' + titel + '</span><button type="button" class="plz-x" aria-label="Sluiten" onclick="PLZonder.sluit()">✕</button></div>' + inhoud + '</div>';
    ov.style.display = 'flex';
    return ov;
  }
  function sluit() { var ov = el('plZonderOv'); if (ov) ov.style.display = 'none'; }

  // ── Kenteken-check ─────────────────────────────────────────────────
  function kenteken(voorin) {
    var m = mijn();
    var waarde = normKent(voorin || (m && m.kent) || '');
    blad('🔎 Kenteken-check',
      '<div class="plz-in"><input id="plzKent" placeholder="12-ABC-3" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(waarde) + '">' +
      '<button type="button" class="plz-go" onclick="PLZonder._zoek()">Check</button></div>' +
      '<div class="plz-st" id="plzSt">Open data van het RDW: keuring, verzekering, tellerstand, terugroepacties en techniek.</div><div id="plzUit"></div>');
    var i = el('plzKent');
    if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') zoek(); });
    if (waarde) zoek();
    else if (i) setTimeout(function () { try { i.focus(); } catch (e) { console.warn('PLZonder: focus', e); } }, 60);
  }

  var _laatsteCheck = null;
  async function zoek() {
    var kent = normKent((el('plzKent') || {}).value);
    var st = el('plzSt'), uit = el('plzUit');
    if (kent.length < 4) { if (st) st.textContent = 'Vul een kenteken in, bijvoorbeeld 12-ABC-3.'; return; }
    if (st) st.textContent = '⏳ RDW opzoeken…';
    if (uit) uit.innerHTML = '';
    var d;
    try { d = await haal(kent); }
    catch (e) { console.warn('PLZonder: RDW-opzoeking mislukt', e); if (st) st.textContent = '⚠️ ' + e.message; return; }
    if (!d) { if (st) st.textContent = '❌ ' + kent + ' staat niet bij het RDW — controleer op een typefout.'; return; }
    _laatsteCheck = { kent: kent, overzicht: d.overzicht };
    var o = d.overzicht;
    var m = mijn(), isMijn = !!(m && normKent(m.kent) === kent);
    if (isMijn) bewaarMijn(kent, o);
    if (st) st.textContent = o.aandacht ? '⚠️ ' + o.aandacht + ' punt' + (o.aandacht === 1 ? '' : 'en') + ' die aandacht vragen' : '✅ Niets gevonden dat aandacht vraagt';
    var h = '<div class="plz-naam">' + esc(o.naam) + '</div>' + o.regels.map(function (x) {
      return '<div class="plz-regel"><span class="plz-dot ' + (x.ernst || '') + '" style="margin-top:4px"></span><span style="flex:1"><div class="plz-l">' + x.ico + ' ' + esc(x.label) + '</div><div class="plz-w">' + esc(x.waarde) + '</div></span></div>';
    }).join('');
    h += '<div id="plzRecall"></div>';
    h += '<div class="plz-knoppen">';
    if (!isMijn && !isDemo()) h += '<button type="button" class="plz-kn hoofd" onclick="PLZonder._mijn()">📌 Dit is mijn auto</button>';
    if (isMijn && !isDemo() && window.PLHerinner && !PLHerinner.aan()) h += '<button type="button" class="plz-kn hoofd" onclick="PLHerinner.zet(true)">🔔 Herinner me aan de APK</button>';
    if (demoMag()) h += '<button type="button" class="plz-kn" onclick="PLZonder._simuleerKent()">▷ Simuleer deze auto</button>';
    h += '</div><div class="plz-klein" style="margin-top:10px">Bron: RDW open data. Het verbruik is dat van de typekeuring, geen meting. Een NAP-oordeel zegt iets over de geregistreerde standen, niet over de teller zelf.</div>';
    if (uit) uit.innerHTML = h;
    recall(kent);
  }

  async function recall(kent) {
    var doel = el('plzRecall');
    if (!doel || !window.PLRecall || typeof PLRecall.check !== 'function') return;
    try {
      var r = await PLRecall.check(kent);
      var open = ((r && r.acties) || []).filter(function (a) { return a.open; });
      if (!open.length) return;
      doel.innerHTML = '<div class="plz-blok"><b>🔔 ' + esc(r.samenvatting ? r.samenvatting.tekst : open.length + ' openstaande terugroepactie(s)') + '</b>' +
        open.map(function (a) { return '<div style="margin-top:6px">• ' + esc(a.omschrijving || a.referentiecode) + (a.risico ? '<div class="plz-klein">Risico: ' + esc(a.risico) + '</div>' : '') + '<div class="plz-klein">Status: ' + esc(a.status) + '</div></div>'; }).join('') +
        '<div class="plz-klein" style="margin-top:6px">Een terugroepactie laat je gratis uitvoeren bij een dealer van het merk.</div></div>';
    } catch (e) { console.warn('PLZonder: terugroepacties niet opgehaald — de RDW-vlag hierboven blijft staan', e); }
  }

  function maakMijn() {
    var c = _laatsteCheck; if (!c) return;
    if (isDemo()) { melding('In de demo wordt niets bewaard'); return; }
    try { localStorage.setItem('pl_kenteken', c.kent); } catch (e) { console.warn('PLZonder: kenteken niet bewaard', e); melding('Het kenteken kon niet bewaard worden'); return; }
    bewaarMijn(c.kent, c.overzicht);
    melding('📌 ' + (c.overzicht.naam || c.kent) + ' is nu je auto — de APK staat op het startscherm');
    try { if (window.PLHerinner) PLHerinner.synchroniseer(true); } catch (e) { console.warn('PLZonder: herinneringen niet bijgewerkt', e); }
    teken(true);
    zoek();
  }

  // ── Foutcode opzoeken ──────────────────────────────────────────────
  function foutcode() {
    blad('🔧 Foutcode opzoeken',
      '<div class="plz-in"><input id="plzCode" placeholder="P0301" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
      '<button type="button" class="plz-go" onclick="PLZonder._code()">Zoek</button></div>' +
      '<div class="plz-st" id="plzCodeSt">De foutcodetabellen staan in de app zelf: dit werkt ook zonder internet.</div><div id="plzCodeUit"></div>');
    var i = el('plzCode');
    if (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') code(); });
      setTimeout(function () { try { i.focus(); } catch (e) { console.warn('PLZonder: focus', e); } }, 60);
    }
  }
  function code() {
    var c = normCode((el('plzCode') || {}).value);
    var st = el('plzCodeSt'), uit = el('plzCodeUit');
    if (!c) { if (st) st.textContent = 'Een foutcode is een letter en vier tekens, bijvoorbeeld P0301 of U0100.'; return; }
    var info = null;
    try { info = (typeof dtcInfo === 'function') ? dtcInfo(c) : null; }
    catch (e) { console.warn('PLZonder: dtcInfo mislukt', e); }
    if (!info) { if (st) st.textContent = 'De foutcodetabel is niet geladen.'; return; }
    var o = codeOordeel(c, info), onbekend = o.onbekend, ernst = [o.ernst, o.ernstTekst], groep = o.groep, soort = o.soort;
    if (st) st.textContent = onbekend ? 'Deze code staat niet in de tabellen van de app.' : '';
    if (uit) uit.innerHTML = '<div class="plz-naam">' + esc(c) + '</div>' +
      '<div class="plz-regel"><span class="plz-dot ' + (ernst[0] || '') + '" style="margin-top:4px"></span><span style="flex:1"><div class="plz-w">' + esc(info.desc) + '</div>' +
      (info.body ? '<div class="plz-klein" style="margin-top:4px">' + esc(info.body) + '</div>' : '') + '</span></div>' +
      (ernst[1] && !onbekend ? '<div class="plz-regel"><span style="flex:1"><div class="plz-l">Ernst</div><div class="plz-w">' + esc(ernst[1]) + '</div></span></div>' : '') +
      '<div class="plz-regel"><span style="flex:1"><div class="plz-l">Soort</div><div class="plz-w">' + esc(groep || '') + ' · ' + esc(soort) + '</div></span></div>' +
      '<div class="plz-klein" style="margin-top:10px">Wil je weten of de code nog actief is, en wat de auto er live bij meet? Verbind de adapter en kies <b>Check mijn auto</b>.</div>';
  }

  // ── Naar de demo, en eruit ─────────────────────────────────────────
  function simuleer() {
    sluit();
    try { startDemo(); }
    catch (e) { console.warn('PLZonder: simulatie start niet', e); melding('De simulatie start nu niet — probeer het opnieuw'); }
  }
  function simuleerKent() {
    var c = _laatsteCheck; if (!c) return;
    if (!demoMag()) { melding('Demo-modus is uitgeschakeld door beheerder'); return; }
    sluit();
    try { _startDemoCore(null, c.kent); }
    catch (e) { console.warn('PLZonder: simulatie met kenteken start niet', e); melding('De simulatie start nu niet — probeer het opnieuw'); }
  }
  function stopDemo() {
    try { if (typeof handleConnect === 'function' && isDemo()) handleConnect(); }
    catch (e) { console.warn('PLZonder: demo stoppen mislukt', e); melding('De demo stopt nu niet — gebruik Verbreken in het adapterpaneel'); }
    teken(true);
  }

  /* Vanuit het verbindscherm: niet verbinden, wel de app in. Het startscherm
     is Mijn auto; daar staat deze kaart bovenaan. */
  function verder() {
    try { closeConnOv(); } catch (e) { console.warn('PLZonder: verbindscherm niet gesloten (closeConnOv staat inline in index.html)', e); }
    try { if (typeof goHome === 'function') goHome(); } catch (e) { console.warn('PLZonder: startscherm niet geopend', e); }
    try { if (typeof logUsage === 'function') logUsage('zonder_adapter', 'verder'); } catch (e) { console.warn('PLZonder: logUsage', e); }
    teken(true);
    verversMijn();
  }

  // ════════════════════════════════════════════════════════════════
  //  OPSTART
  // ════════════════════════════════════════════════════════════════
  function start() {
    teken(true);
    var ws = el('welcomeScreen');
    if (ws && window.MutationObserver) {
      try { new MutationObserver(function () { if (!ws.classList.contains('hidden')) { teken(); verversMijn(); } }).observe(ws, { attributes: true, attributeFilter: ['class'] }); }
      catch (e) { console.warn('PLZonder: startscherm niet gevolgd', e); }
    }
    // Verbinden, de demo en inloggen hebben geen gezamenlijk event; teken()
    // doet niets als er niets veranderd is.
    setInterval(function () { try { teken(); } catch (e) { console.warn('PLZonder: kaart niet getekend', e); } }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.PLZonder = {
    verder: verder,
    kenteken: kenteken,
    foutcode: foutcode,
    simuleer: simuleer,
    stopDemo: stopDemo,
    sluit: sluit,
    teken: teken,
    // RDW plus validatie als data, zonder scherm — voor PLWeten (de infokaart in de wizard)
    haal: haal,
    _zoek: zoek,
    _mijn: maakMijn,
    _simuleerKent: simuleerKent,
    _code: code,
    // pure kern — voor test-zonder.js
    _kern: { normKent: normKent, normCode: normCode, dagenTot: dagenTot, apkRegel: apkRegel, rdwOverzicht: rdwOverzicht, kaartKnoppen: kaartKnoppen, codeOordeel: codeOordeel, ERNST: ERNST }
  };
})();
