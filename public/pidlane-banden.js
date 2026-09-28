// ══════════════════════════════════════════════════════════════════
// pidlane-banden.js — PLBanden: de vier banden in één venster (28-09-2026)
// ══════════════════════════════════════════════════════════════════
// Een auto die zijn bandenspanning en -temperatuur alleen via een eigen PID
// geeft (Mazda: 222A05…222A0D op ECU-adres 720), krijgt hier een bovenaanzicht:
// per band de druk groot en de temperatuur klein, in de eenheid die de klant
// koos (Mijn voorkeuren → Druk tonen als).
//
// WELKE PID BIJ WELKE BAND. Uit de naam (PLEigen.bandRol: "Bandenspanning
// voor-links", "Tire pressure RR"). De code zegt niets over de plek en
// verschilt per merk; de naam is wat de klant of de bibliotheek meegaf.
//
// HET OORDEEL IS RELATIEF. De app weet niet wat de voorgeschreven druk is
// (die staat op de deurstijl en verschilt per belading). Wat hij wel kan: de
// vier banden met elkaar vergelijken. Een band die 10% onder de mediaan van
// de vier staat is oranje, 20% rood. Dat vangt precies het geval dat telt —
// één band die leegloopt — en zegt niets over vier banden die samen te zacht
// zijn; dat staat onderaan het venster.
//
// TEMPO. De banden worden standaard elke minuut gevraagd (PLEigen: geen tempo
// gekozen + een band = minuut). Een meting ouder dan drie minuten is dof.
//
// Slim visueel toont bovenaan een lampje (PLVisueel → bandenBij) dat dit
// venster opent en kleurt met het oordeel. Tests: test-banden.js (de pure
// functies), bproef-banden.js (venster, lampje, terugknop).
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const POS = ['VL', 'VR', 'AL', 'AR'];
  const POS_NAAM = { VL: 'Voor links', VR: 'Voor rechts', AL: 'Achter links', AR: 'Achter rechts' };
  const OUD_MS = 180000;          // drie keer het standaardtempo van een minuut
  const WARN = 0.10, GEVAAR = 0.20;

  /* Uit de eigen PIDs ({pid, name, unit, band:{pos, soort}}): per band de
     druk- en temperatuur-PID. null als er geen enkele druk bij zit. */
  function indeling(defs) {
    const ind = {};
    let druk = 0;
    POS.forEach(p => { ind[p] = { druk: null, temp: null }; });
    (defs || []).forEach(d => {
      const b = d && d.band;
      if (!b || !ind[b.pos] || (b.soort !== 'druk' && b.soort !== 'temp')) return;
      if (ind[b.pos][b.soort]) return;          // de eerste telt
      ind[b.pos][b.soort] = { pid: d.pid, eenheid: d.unit || '' };
      if (b.soort === 'druk') druk++;
    });
    return druk ? ind : null;
  }

  function mediaan(a) { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  /* Wat er nu staat. vals/laatst zoals pidVals/_pidLastUpd. Geeft per band
     {druk, temp, ernst} en het totaal {ernst, uitleg}. Puur. */
  function stand(ind, vals, laatst, nu) {
    if (!ind) return null;
    vals = vals || {}; laatst = laatst || {};
    const meet = x => {
      if (!x) return null;
      const v = vals[x.pid], t = laatst[x.pid];
      if (typeof v !== 'number' || !isFinite(v)) return { waarde: null, eenheid: x.eenheid, oud: false };
      return { waarde: v, eenheid: x.eenheid, oud: !(typeof t === 'number' && nu - t < OUD_MS) };
    };
    const w = {};
    POS.forEach(p => { w[p] = { druk: meet(ind[p].druk), temp: meet(ind[p].temp), ernst: 'ok', afwijking: null }; });
    const vers = POS.filter(p => w[p].druk && w[p].druk.waarde !== null && !w[p].druk.oud);
    let ernst = 'geen', uitleg = 'Nog geen verse meting van de banden.';
    if (vers.length >= 3) {
      const med = mediaan(vers.map(p => w[p].druk.waarde));
      ernst = 'ok'; uitleg = 'De vier banden staan gelijk.';
      if (med > 0) vers.forEach(p => {
        const a = (w[p].druk.waarde - med) / med;
        w[p].afwijking = Math.round(a * 100);
        if (a <= -GEVAAR) w[p].ernst = 'danger'; else if (a <= -WARN) w[p].ernst = 'warn';
      });
      const slecht = vers.filter(p => w[p].ernst !== 'ok');
      if (slecht.length) {
        ernst = slecht.some(p => w[p].ernst === 'danger') ? 'danger' : 'warn';
        uitleg = slecht.map(p => POS_NAAM[p].toLowerCase() + ' ' + Math.abs(w[p].afwijking) + '% lager').join(', ') + ' dan de andere banden.';
      }
    } else if (vers.length) uitleg = 'Te weinig verse metingen om de banden te vergelijken (' + vers.length + ' van 4).';
    return { wielen: w, ernst, uitleg };
  }

  // ── Lezen uit de app ─────────────────────────────────────────────
  function defs() {
    try { return (window.PLEigen && typeof PLEigen.defs === 'function') ? PLEigen.defs() : []; }
    catch (e) { console.warn('PLBanden: eigen PIDs onleesbaar', e); return []; }
  }
  function nu() {
    const ind = indeling(defs());
    let v = {}, t = {};
    try { if (typeof pidVals !== 'undefined' && pidVals) v = pidVals; } catch (e) { console.warn('PLBanden: pidVals onleesbaar', e); }
    try { if (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) t = _pidLastUpd; } catch (e) { console.warn('PLBanden: tijden onleesbaar', e); }
    return { ind, st: stand(ind, v, t, Date.now()) };
  }

  // ── Het venster ─────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function getal(m, dec) {
    if (!m || m.waarde === null) return '—';
    return m.waarde.toLocaleString('nl', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function drukDec(eenheid) { return /bar/i.test(eenheid) ? 2 : /psi/i.test(eenheid) ? 1 : 0; }
  function tegel(p, x, inr) {
    if (!inr.druk && !inr.temp) return '<div class="plb-tegel geen"><small>' + POS_NAAM[p] + '</small><b>—</b><span>geen sensor</span></div>';
    const d = x.druk, t = x.temp, oud = (d && d.oud) || (t && t.oud);
    return '<div class="plb-tegel ' + x.ernst + (oud ? ' oud' : '') + '" data-pos="' + p + '"><small>' + POS_NAAM[p] + '</small>' +
      '<b>' + getal(d, drukDec(d ? d.eenheid : '')) + (d && d.waarde !== null ? '<i>' + esc(d.eenheid) + '</i>' : '') + '</b>' +
      '<span>' + (t ? getal(t, 0) + (t.waarde !== null ? ' ' + esc(t.eenheid) : '') : '') + (x.afwijking ? ' · ' + (x.afwijking > 0 ? '+' : '') + x.afwijking + '%' : '') + '</span></div>';
  }
  function auto(st) {
    const k = p => st ? st.wielen[p].ernst : 'ok';
    const band = (p, x, y) => '<rect class="plb-band ' + k(p) + '" x="' + x + '" y="' + y + '" width="16" height="36" rx="5"/>';
    return '<svg class="plb-auto" viewBox="0 0 120 220" aria-hidden="true">' +
      '<rect class="plb-romp" x="22" y="10" width="76" height="200" rx="30"/>' +
      '<path class="plb-ruit" d="M34 62q26-12 52 0l-5 22q-21-7-42 0z"/><path class="plb-ruit" d="M38 168q22 7 44 0l3 14q-25 8-50 0z"/>' +
      band('VL', 6, 40) + band('VR', 98, 40) + band('AL', 6, 146) + band('AR', 98, 146) + '</svg>';
  }
  function teken() {
    const ov = document.getElementById('plBandenOv'); if (!ov) return;
    const n = nu();
    let body;
    if (!n.ind) body = '<p class="plb-uitleg">Deze auto heeft geen sensoren voor de banden. Voeg ze toe in Mijn voertuigen → Sensoren, bijvoorbeeld uit "Codes voor dit model".</p>';
    else {
      const w = n.st.wielen;
      body = '<div class="plb-rooster">' + tegel('VL', w.VL, n.ind.VL) + auto(n.st) + tegel('VR', w.VR, n.ind.VR) +
        tegel('AL', w.AL, n.ind.AL) + tegel('AR', w.AR, n.ind.AR) + '</div>' +
        '<p class="plb-oordeel ' + n.st.ernst + '">' + esc(n.st.uitleg) + '</p>' +
        '<p class="plb-uitleg">De app vergelijkt de vier banden met elkaar: 10% lager dan de rest is oranje, 20% rood. Of ze samen op de voorgeschreven druk staan, ' +
        'zie je op de sticker in de deurstijl — die kent de app niet. Gemeten elke minuut; een meting ouder dan drie minuten is dof.</p>';
    }
    ov.innerHTML = '<div class="plb-vel"><div class="plb-kop"><h2 id="plBandenTtl">🛞 Banden</h2>' +
      '<button type="button" class="plb-sluit" aria-label="Sluiten" onclick="PLBanden.sluit()">✕</button></div>' + body + '</div>';
  }
  function open() {
    let ov = document.getElementById('plBandenOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plBandenOv';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'plBandenTtl');
      ov.addEventListener('click', e => { if (e.target === ov) sluit(); });
      document.body.appendChild(ov);
    }
    teken();
    ov.style.display = 'flex';
    if (!ov._ververs) ov._ververs = setInterval(() => { if (ov.style.display !== 'none' && !ov.querySelector(':active')) teken(); }, 2000);
  }
  function sluit() { const ov = document.getElementById('plBandenOv'); if (ov) ov.style.display = 'none'; }

  /* Blok 5: kwamen de vier banden binnen, en wat zeggen ze? Een lekke band
     is geen fout van de app maar wel iets wat de rijder moet weten: LET OP. */
  function oordeel(ind, st) {
    if (!ind) return { staat: 'LET OP', detail: 'geen bandensensoren bij dit voertuig — voeg ze toe in Mijn voertuigen → Sensoren' };
    if (!st || st.ernst === 'geen') return { staat: 'LET OP', detail: st ? st.uitleg : 'niets gemeten' };
    const d = ['VL', 'VR', 'AL', 'AR'].map(p => p + ' ' + (st.wielen[p].druk && st.wielen[p].druk.waarde !== null ? String(st.wielen[p].druk.waarde).replace('.', ',') : '—')).join(', ');
    if (st.ernst === 'ok') return { staat: 'ok', detail: d + ' — ' + st.uitleg };
    return { staat: 'LET OP', detail: d + ' — ' + st.uitleg + ' Controleer de band.' };
  }

  /* Voor het lampje in Slim visueel: {toon, ernst, titel}. */
  function lamp() {
    const n = nu();
    if (!n.ind) return { toon: false };
    return { toon: true, ernst: n.st.ernst, titel: 'Banden — ' + n.st.uitleg };
  }

  window.PLBanden = { POS, OUD_MS, WARN, GEVAAR, indeling, stand, oordeel, open, sluit, lamp, teken,
    nu: function () { return nu(); } };
})();
