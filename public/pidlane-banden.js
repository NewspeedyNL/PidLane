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
// TEMPO (#396, 06-10-2026). Een band zonder gekozen tempo gaat niet meer de
// pollus in (PLEigen: tempo 'opverzoek'). ververs() vraagt ze alle acht in één
// beurt onder het busslot: één keer per verbinding als Slim visueel opent
// (eenmaal()), elke keer dat je dit venster opent of op ↻ tikt, en — zolang
// het vinkje "🛞 Banden" in de sensorlijst aanstaat — elke vijf minuten
// (AUTO_MS, tik()). Acht banden kosten via adres 720 samen zo'n 1,2 s bus,
// dus 0,4% van vijf minuten. Tot 06-10 was het elke minuut, als acht losse
// PIDs met elk een trend — voor één vraag: staan de banden op spanning, en
// worden ze niet te heet. Een meting is dof na drie gemiste rondes (15 min),
// of na een half uur als de ronde van vijf minuten uit staat.
//
// ÉÉN REGEL IN DE SENSORLIJST. De acht staan daar niet meer los (PLEigen
// houdt ze eruit); lijstRegel() geeft buildPIDList() één regel met het vinkje
// voor de ronde van vijf minuten. Het vinkje is een voorkeur van dit toestel
// (localStorage) en geen PID: het hoort niet in activePIDs, want dan zou elke
// module die activePIDs afloopt een sensor zonder waarde zien.
//
// Slim visueel toont rechtsonder een lampje (PLVisueel → bandenBij) dat dit
// venster opent: het autootje in het klein (mini()), per wiel gekleurd. Tests: test-banden.js (de pure
// functies), bproef-banden.js (venster, lampje, terugknop).
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const POS = ['VL', 'VR', 'AL', 'AR'];
  const POS_NAAM = { VL: 'Voor links', VR: 'Voor rechts', AL: 'Achter links', AR: 'Achter rechts' };
  const OUD_MS = 30 * 60000;      // alleen op verzoek gevraagd: een half uur, daarna dof (#396)
  const AUTO_MS = 5 * 60000;      // de ronde van vijf minuten, zolang het vinkje aanstaat
  // Met die ronde aan is een meting na drie gemiste rondes oud (06-10-2026).
  // Met een half uur bleef het lampje na een gestopte ronde dertig minuten
  // groen op een meting die niemand meer ververste.
  const OUD_AUTO_MS = 3 * AUTO_MS;
  const AUTO_SLEUTEL = 'pl_banden_auto';
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
  function stand(ind, vals, laatst, nu, oudMs) {
    if (!ind) return null;
    const grens = (typeof oudMs === 'number' && oudMs > 0) ? oudMs : OUD_MS;
    vals = vals || {}; laatst = laatst || {};
    const meet = x => {
      if (!x) return null;
      const v = vals[x.pid], t = laatst[x.pid];
      if (typeof v !== 'number' || !isFinite(v)) return { waarde: null, eenheid: x.eenheid, oud: false };
      return { waarde: v, eenheid: x.eenheid, oud: !(typeof t === 'number' && nu - t < grens) };
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
    return { ind, st: stand(ind, v, t, Date.now(), oudNu()) };
  }

  // ── Op verzoek vragen (#396) ─────────────────────────────────────
  /* De PIDs die ververs() vraagt: per band de druk en de temperatuur. Puur. */
  function vraagPids(ind) {
    const uit = [];
    if (!ind) return uit;
    POS.forEach(p => ['druk', 'temp'].forEach(k => { if (ind[p][k] && uit.indexOf(ind[p][k].pid) < 0) uit.push(ind[p][k].pid); }));
    return uit;
  }
  let _bezig = null, _gen = -1, _laatstGevraagd = 0;

  /* Puur. Is het tijd voor de ronde van vijf minuten? Alleen met het vinkje
     aan, een verbinding die klaar is (niet midden in het verbinden, dan heeft
     de koude poort de bus) en banden om te vragen. */
  function moetVragen(nu, laatst, aan, klaar, heeft) {
    return !!(aan && klaar && heeft && nu - (laatst || 0) >= AUTO_MS);
  }
  function leesAan() {
    try { return localStorage.getItem(AUTO_SLEUTEL) !== '0'; }
    catch (e) { console.warn('PLBanden: voorkeur onleesbaar — de ronde van vijf minuten staat aan', e); return true; }
  }
  let _aan = leesAan();
  function aan() { return _aan; }
  /* Wanneer een meting dof wordt: met de ronde van vijf minuten na drie
     gemiste rondes, zonder na een half uur. */
  function oudNu() { return _aan ? OUD_AUTO_MS : OUD_MS; }
  function zetAan(v) {
    _aan = !!v;
    try { localStorage.setItem(AUTO_SLEUTEL, _aan ? '1' : '0'); }
    catch (e) { console.warn('PLBanden: voorkeur niet bewaard — geldt tot de app sluit', e); }
    if (_aan) _laatstGevraagd = 0;     // aangezet: bij de volgende tik meteen vragen
    if (typeof btDiag === 'function') btDiag('🛞 Banden elke 5 minuten: ' + (_aan ? 'aan' : 'uit'), 'info');
    return _aan;
  }
  function tik() {
    let klaar = false;
    try { klaar = typeof connected !== 'undefined' && connected && !(typeof demoMode !== 'undefined' && demoMode) && !!window._plVerbindingKlaar; }
    catch (e) { console.warn('PLBanden: verbindstaat onleesbaar', e); }
    if (!moetVragen(Date.now(), _laatstGevraagd, _aan, klaar, vraagPids(indeling(defs())).length > 0)) return;
    ververs();
  }
  /* De regel in de sensorlijst, of null: geen banden, of het zoekfilter past
     niet. `f` is het filter in kleine letters, zoals buildPIDList() het heeft. */
  function lijstRegel(f) {
    const pids = vraagPids(indeling(defs()));
    if (!pids.length) return null;
    // Zoeken werkt zoals in de rest van de lijst: een stukje van de naam of de code.
    if (f && 'banden bandenspanning bandtemperatuur tpms'.indexOf(f) < 0 && !pids.some(p => p.toLowerCase().indexOf(f) >= 0)) return null;
    return { naam: '🛞 Banden', n: pids.length, aan: _aan, eenheid: pids.length + ' sensoren · elke 5 min' };
  }
  /* Alle banden één keer vragen, onder het busslot. Een tweede aanroep
     terwijl de eerste loopt wacht op dezelfde beurt. */
  function ververs() {
    if (_bezig) return _bezig;
    const pids = vraagPids(indeling(defs()));
    if (!pids.length) return Promise.resolve({ ok: false, reden: 'geen bandensensoren' });
    if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode))
      return Promise.resolve({ ok: false, reden: 'niet verbonden met een auto' });
    if (typeof withBus !== 'function' || typeof parsePID !== 'function' || !window.PLEigen || typeof PLEigen.vraag !== 'function')
      return Promise.resolve({ ok: false, reden: 'busfuncties ontbreken' });
    _gen = window._btGen || 0;
    _laatstGevraagd = Date.now();
    let goed = 0;
    _bezig = (async () => {
      try {
        await withBus('banden', async () => {
          for (const pid of pids) {
            if (!connected) break;
            const r = parsePID(pid, await PLEigen.vraag(pid));
            if (r != null) { goed++; markPidData(pid); updPID(pid, r); }
            else markPidNoData(pid);
          }
        }, 15000);
        if (typeof btDiag === 'function') btDiag('🛞 Banden gevraagd: ' + goed + ' van ' + pids.length + ' gaven antwoord', goed ? 'info' : 'warn');
        return { ok: true, gevraagd: pids.length, goed };
      } catch (e) {
        if (typeof btDiag === 'function') btDiag('🛞 Banden vragen mislukt: ' + (e.message || e), 'warn');
        return { ok: false, reden: e.message || String(e) };
      } finally {
        _bezig = null;
        try { teken(); } catch (e) { console.warn('PLBanden: venster niet bijgewerkt na vragen', e); }
        try { if (window.PLVisueel && PLVisueel.bandenBij) PLVisueel.bandenBij(); } catch (e) { console.warn('PLBanden: lampje niet bijgewerkt na vragen', e); }
      }
    })();
    return _bezig;
  }
  /* Slim visueel opent: één keer per verbinding vragen. */
  function eenmaal() {
    if (_gen === (window._btGen || 0)) return Promise.resolve({ ok: true, al: true });
    return ververs();
  }

  // ── Het venster ─────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function getal(m, dec) {
    if (!m || m.waarde === null) return '—';
    return m.waarde.toLocaleString('nl', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function drukDec(eenheid) { return /bar/i.test(eenheid) ? 2 : /psi/i.test(eenheid) ? 1 : 0; }
  /* Puur. De banden waar een sensor ontbreekt die een andere band wel heeft:
     { temp:['AL'], druk:[] }. Een auto zonder bandtemperatuur mist niets. */
  function ontbreekt(ind) {
    const uit = { druk: [], temp: [] };
    if (!ind) return uit;
    ['druk', 'temp'].forEach(k => {
      if (POS.some(p => ind[p][k])) POS.forEach(p => { if (!ind[p][k]) uit[k].push(p); });
    });
    return uit;
  }
  function tegel(p, x, inr, mist) {
    if (!inr.druk && !inr.temp) return '<div class="plb-tegel geen"><small>' + POS_NAAM[p] + '</small><b>—</b><span>geen sensor</span></div>';
    const d = x.druk, t = x.temp, oud = (d && d.oud) || (t && t.oud);
    // Geen temperatuursensor terwijl de andere banden er wel een hebben: dat
    // zeggen, niet een los "· +3%" laten staan (07-10-2026, CX-5 zonder 222A0C).
    const tTekst = t ? getal(t, 0) + (t.waarde !== null ? ' ' + esc(t.eenheid) : '') : (mist && mist.temp.indexOf(p) >= 0 ? 'geen temp.' : '');
    return '<div class="plb-tegel ' + x.ernst + (oud ? ' oud' : '') + '" data-pos="' + p + '"><small>' + POS_NAAM[p] + '</small>' +
      '<b>' + getal(d, drukDec(d ? d.eenheid : '')) + (d && d.waarde !== null ? '<i>' + esc(d.eenheid) + '</i>' : '') + '</b>' +
      '<span>' + tTekst + (x.afwijking ? (tTekst ? ' · ' : '') + (x.afwijking > 0 ? '+' : '') + x.afwijking + '%' : '') + '</span></div>';
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
      const w = n.st.wielen, mist = ontbreekt(n.ind);
      const gat = mist.druk.map(p => 'de druk ' + POS_NAAM[p].toLowerCase()).concat(mist.temp.map(p => 'de temperatuur ' + POS_NAAM[p].toLowerCase()));
      body = '<div class="plb-rooster">' + tegel('VL', w.VL, n.ind.VL, mist) + auto(n.st) + tegel('VR', w.VR, n.ind.VR, mist) +
        tegel('AL', w.AL, n.ind.AL, mist) + tegel('AR', w.AR, n.ind.AR, mist) + '</div>' +
        '<p class="plb-oordeel ' + n.st.ernst + '">' + esc(n.st.uitleg) + '</p>' +
        (gat.length ? '<p class="plb-uitleg plb-gat">Voor ' + esc(gat.join(' en ')) + ' staat geen sensor bij deze auto. Voeg hem toe in Mijn voertuigen → Sensoren, bijvoorbeeld uit "Codes voor dit model".</p>' : '') +
        '<p class="plb-uitleg">De app vergelijkt de vier banden met elkaar: 10% lager dan de rest is oranje, 20% rood. Of ze samen op de voorgeschreven druk staan, ' +
        'zie je op de sticker in de deurstijl — die kent de app niet. Gevraagd bij het openen van dit venster en van Slim visueel' +
        (_aan ? ', en elke vijf minuten' : '') + '; tik op ↻ om opnieuw te vragen. Een meting ouder dan ' + (_aan ? 'een kwartier' : 'een half uur') + ' is dof.</p>';
    }
    ov.innerHTML = '<div class="plb-vel"><div class="plb-kop"><h2 id="plBandenTtl">🛞 Banden</h2>' +
      (n.ind ? '<button type="button" class="plb-ververs" aria-label="Opnieuw vragen"' + (_bezig ? ' disabled' : '') + ' onclick="PLBanden.ververs()">↻</button>' : '') +
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
    ververs();
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

  /* Per wiel de kleur voor het autootje: het oordeel van die band, of
     'geen' als er geen verse druk is of de vier nog niet te vergelijken
     zijn. Groen betekent dus echt "gemeten en gelijk", niet "niets gezien". */
  function wielKleuren(st) {
    const uit = {};
    POS.forEach(p => {
      const w = st && st.wielen[p], d = w && w.druk;
      uit[p] = (!st || st.ernst === 'geen' || !d || d.waarde === null || d.oud) ? 'geen' : w.ernst;
    });
    return uit;
  }

  /* Voor het lampje in Slim visueel: {toon, ernst, titel, wielen}. */
  function lamp() {
    const n = nu();
    if (!n.ind) return { toon: false };
    return { toon: true, ernst: n.st.ernst, titel: 'Banden — ' + n.st.uitleg, wielen: wielKleuren(n.st) };
  }

  /* Het autootje van het venster in het klein, voor het lampje in Slim
     visueel (#371): dezelfde romp van bovenaf, met dikkere wielen zodat de
     kleur op 20 px breed nog te zien is. `wielen` = {VL:'ok'|'warn'|
     'danger'|'geen', …}. */
  function mini(wielen) {
    const k = p => (wielen && wielen[p]) || 'geen';
    const wiel = (p, x, y) => '<rect class="vbm-wiel ' + k(p) + '" x="' + x + '" y="' + y + '" width="22" height="46" rx="8"/>';
    return '<svg class="vbm" viewBox="0 0 120 220" aria-hidden="true">' +
      wiel('VL', 2, 30) + wiel('VR', 96, 30) + wiel('AL', 2, 146) + wiel('AR', 96, 146) +
      '<rect class="vbm-romp" x="20" y="8" width="80" height="204" rx="32"/>' +
      '<path class="vbm-ruit" d="M33 64q27-13 54 0l-5 24q-22-8-44 0z"/></svg>';
  }

  setInterval(tik, 30000);

  window.PLBanden = { POS, OUD_MS, OUD_AUTO_MS, AUTO_MS, oudNu, WARN, GEVAAR, indeling, ontbreekt, stand, oordeel, open, sluit, lamp, teken, wielKleuren, mini, vraagPids, ververs, eenmaal,
    moetVragen, aan, zetAan, tik, lijstRegel,
    nu: function () { return nu(); } };
})();
