// ══════════════════════════════════════════════════════════════════
// pidlane-samenhang.js — PLSamenhang: de meting lezen zoals een monteur (#446)
// ══════════════════════════════════════════════════════════════════
// Het verzamelscherm (#443) legde per sensor het hoogste en laagste punt
// naast een vaste grens. Dat is twee getallen vergelijken. Een monteur, en de
// OBD-monitors in de auto zelf, doen het andersom: eerst vaststellen in welke
// toestand de motor was, en een waarde alleen beoordelen onder de voorwaarden
// waarin hij iets zegt ("enable criteria"). Trims alleen warm en in gesloten
// lus; laadspanning alleen stationair, want een slim laadsysteem zakt bij
// optrekken naar 12 à 13 V en dat is normaal; de katalysator alleen als de
// voorste sonde regelt.
//
// GEEN TWEEDE KENNISBANK. Wat een trim van +14 % stationair betekent, staat
// in de stappen van het volledig onderzoek (pidlane-onderzoek.js, #428). Die
// meet zelf, met een opdracht ("houd 2500 tpm vast"). Dit bestand knipt een
// meting die er al is op in toestanden, en geeft elke stap alleen de stukken
// waar zijn voorwaarde gold. Het bewijs wordt gewogen door dezelfde
// verwerk() en conclusie(). Verandert een regel in het onderzoek, dan
// verandert hij hier mee.
//
// TOESTANDEN, met de grenzen van het onderzoek (PLOnderzoek.cfg.grens):
//   uit             toerental onder uitRpm
//   start           ertussen (de startmotor draait)
//   stationair_koud stil, motor aan tot STATIONAIR_MAX, koelwater onder warmC
//   stationair_warm stil, motor aan tot STATIONAIR_MAX, warm
//   stil_gas        stil, boven STATIONAIR_MAX en niet rond 2500 tpm
//   toeren2500      stil, warm, 2200–2900 tpm (de scheidingstest van het onderzoek)
//   rijden_koud / rijden_warm  boven rijKmh
//   vollast         rijdend met belasting ≥ 80 % boven 1500 tpm
// en per moment de gesloten lus uit PID 0103 (bit 2), als de auto hem levert.
//
// EERLIJK OVER WAT NIET KON. Elke stap die niet beoordeeld is, staat erbij
// met de reden ("geen warm stationair stuk van 15 s in deze meting").
//
// Tests: test-samenhang.js (scenario's: gezonde koude start, lek, luchtmassa,
// dynamo, liegende sensor, warme file, open lus, kort venster).
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Twee monsters horen bij hetzelfde moment als ze hooguit zo ver uit
  // elkaar liggen. Een trage sensor (1 s) en een snelle pollus passen erin.
  const TOL_MS = 2500;
  // Boven dit toerental is stilstaand geen stationair meer, maar gas geven.
  const STATIONAIR_MAX = 1200;

  const NAAM = {
    uit: 'motor uit', start: 'starten', stationair_koud: 'stationair koud', stationair_warm: 'stationair warm',
    toeren2500: 'rond 2500 tpm stilstaand', stil_gas: 'stilstaand gas geven', rijden_koud: 'rijden koud', rijden_warm: 'rijden warm', vollast: 'vollast'
  };

  /* Welke stap van het onderzoek op welk stuk van de meting gelezen mag
     worden. minMs: hoe lang dat stuk minstens moet zijn (ongeveer de helft
     van wat het onderzoek zelf meet). gesloten: alleen in gesloten lus, als
     de auto 0103 levert. uitgelijnd: de stap koppelt sensoren per moment
     (zie knip). Niet erin: `laden_belast` (vraagt een opdracht —
     koplampen aan — die uit de data niet te zien is) en de vragen. */
  const LEZEN = [
    { id: 'rust',        toestand: ['uit'],                                   minMs: 5000 },
    { id: 'koudstart',   toestand: ['uit'],                                   minMs: 3000 },
    { id: 'laden',       toestand: ['stationair_koud', 'stationair_warm'],    minMs: 10000 },
    { id: 'stationair',  toestand: ['stationair_warm'],                       minMs: 15000, gesloten: true },
    { id: 'toeren2500',  toestand: ['toeren2500'],                            minMs: 10000, gesloten: true },
    { id: 'lambda',      toestand: ['stationair_warm', 'rijden_warm'],        minMs: 15000, gesloten: true },
    { id: 'temperatuur', toestand: ['stationair_koud', 'stationair_warm', 'toeren2500', 'rijden_koud', 'rijden_warm', 'vollast'], minMs: 60000 },
    { id: 'laaddruk',    toestand: ['vollast'],                               minMs: 3000, uitgelijnd: true }
  ];

  /* Signalen die horen te bewegen, en waar "staat exact stil" dus geen
     uitslag is maar een meetvraag. De lambdasondes: een regelende sonde
     wisselt altijd, en een auto met een breedbandsonde meldt op 0114 vaak
     een dode smalbandwaarde (zie b1s1Line in pidlane-correlatie.js). Een
     stap krijgt zo'n sensor dan niet, en zegt waarom. Niet voor koelwater:
     dat staat warm minutenlang op één graad, en dat is gewoon. */
  const MOET_BEWEGEN = ['0114', '0115'];
  const VAST_MIN = 8;

  const getal = v => typeof v === 'number' && isFinite(v);

  /* Het dichtstbijzijnde monster bij tijd t, binnen TOL_MS. `reeks` is
     gesorteerd op t; `i` is een wijzer die alleen vooruit loopt. */
  function dichtbij(reeks, t, wijzer) {
    if (!reeks || !reeks.length) return null;
    let i = wijzer.i;
    while (i + 1 < reeks.length && reeks[i + 1].t <= t) i++;
    wijzer.i = i;
    let beste = null, afstand = Infinity;
    [i, i + 1].forEach(j => {
      const m = reeks[j];
      if (!m || !getal(m.v)) return;
      const d = Math.abs(m.t - t);
      if (d < afstand) { afstand = d; beste = m.v; }
    });
    return afstand <= TOL_MS ? beste : null;
  }

  /* De tijdlijn: één moment per toerentalmonster, en op elk moment van elke
     sensor de waarde van dat moment. Zonder toerental is de toestand niet
     vast te stellen, en dan geeft hij null. Puur. */
  function tijdlijn(hist) {
    const h = hist || {};
    const rpm = (h['010C'] || []).filter(m => m && getal(m.v) && getal(m.t)).slice().sort((a, b) => a.t - b.t);
    if (rpm.length < 2) return null;
    const pids = Object.keys(h).filter(p => (h[p] || []).length);
    const gesorteerd = {}, wijzers = {};
    pids.forEach(p => { gesorteerd[p] = h[p].filter(m => m && getal(m.t)).slice().sort((a, b) => a.t - b.t); wijzers[p] = { i: 0 }; });
    const t = rpm.map(m => m.t);
    const kol = {};
    pids.forEach(p => { kol[p] = t.map(tt => dichtbij(gesorteerd[p], tt, wijzers[p])); });
    return { t, kol, pids };
  }

  /* De toestand op moment i. g = PLOnderzoek.cfg.grens. Puur. */
  function toestandOp(tl, i, g) {
    const v = p => (tl.kol[p] ? tl.kol[p][i] : null);
    const rpm = v('010C'), snel = v('010D'), ect = v('0105'), last = v('0104');
    if (!getal(rpm) || rpm < g.uitRpm) return 'uit';
    if (rpm <= g.aanRpm) return 'start';
    const warm = getal(ect) && ect >= g.warmC;
    if (getal(snel) && snel > g.rijKmh) {
      if (getal(last) && last >= 80 && rpm > 1500) return 'vollast';
      return warm ? 'rijden_warm' : 'rijden_koud';
    }
    if (warm && rpm >= 2200 && rpm <= 2900) return 'toeren2500';
    // Stilstaand gas geven is geen stationair: een paar tikken op het gas
    // zouden anders als een schommelend toerental lezen.
    if (rpm > STATIONAIR_MAX) return 'stil_gas';
    return warm ? 'stationair_warm' : 'stationair_koud';
  }
  // Gesloten lus volgens 0103: true, false, of null als de auto het niet zegt.
  function geslotenOp(tl, i) {
    const s = tl.kol['0103'] ? tl.kol['0103'][i] : null;
    return getal(s) ? (s & 2) === 2 : null;
  }

  /* De stukken van één soort. Twee vormen, en het verschil is geen detail:
       uitgelijnd  per moment van de tijdlijn één waarde per sensor, per
                   index gelijklopend — nodig waar een stap twee sensoren
                   op hetzelfde moment koppelt (laaddruk: map[i] bij last[i]).
       ruw         per sensor álle monsters die binnen die stukken vallen.
                   Dat is de standaard: een voorste lambdasonde wisselt een
                   paar keer per seconde, en op het tempo van het toerental
                   afgetast valt hij steeds op hetzelfde punt van de golf —
                   dan lijkt een regelende sonde stil te staan (#446).
     ms: de tijd die de stukken samen beslaan, zonder gaten groter dan
     2× TOL_MS. Puur. */
  function knip(tl, labels, toestanden, gesloten, pids, hist, uitgelijnd) {
    const idx = [];
    for (let i = 0; i < tl.t.length; i++) {
      if (labels.indexOf(toestanden[i]) < 0) continue;
      if (gesloten) { const g = geslotenOp(tl, i); if (g === false) continue; }
      idx.push(i);
    }
    let ms = 0;
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1], b = idx[k];
      if (b === a + 1) { const d = tl.t[b] - tl.t[a]; if (d > 0 && d <= 2 * TOL_MS) ms += d; }
    }
    const reeks = {};
    const welke = pids || tl.pids;
    if (uitgelijnd || !hist) {
      welke.forEach(p => { reeks[p] = idx.map(i => (tl.kol[p] ? tl.kol[p][i] : null)); });
      return { reeks, ms, n: idx.length };
    }
    // Tijdvakken rond de gekozen momenten: halverwege naar de buren.
    const vak = [];
    idx.forEach(i => {
      const voor = i > 0 ? (tl.t[i] - tl.t[i - 1]) / 2 : 500, na = i + 1 < tl.t.length ? (tl.t[i + 1] - tl.t[i]) / 2 : 500;
      const a = tl.t[i] - Math.min(voor, TOL_MS), b = tl.t[i] + Math.min(na, TOL_MS);
      const laatst = vak[vak.length - 1];
      if (laatst && a <= laatst[1]) laatst[1] = Math.max(laatst[1], b); else vak.push([a, b]);
    });
    welke.forEach(p => {
      const ms_ = (hist[p] || []).filter(m => m && getal(m.t) && getal(m.v)).slice().sort((x, y) => x.t - y.t);
      const uit = []; let j = 0;
      ms_.forEach(m => {
        while (j < vak.length && vak[j][1] < m.t) j++;
        if (j < vak.length && m.t >= vak[j][0] && m.t <= vak[j][1]) uit.push(m.v);
      });
      reeks[p] = uit;
    });
    return { reeks, ms, n: idx.length };
  }

  function duurPer(tl, toestanden) {
    const d = {};
    for (let i = 1; i < tl.t.length; i++) {
      const dt = tl.t[i] - tl.t[i - 1];
      if (dt <= 0 || dt > 2 * TOL_MS) continue;
      d[toestanden[i]] = (d[toestanden[i]] || 0) + dt;
    }
    return d;
  }

  /* Heeft de auto lang stilgestaan? Alleen uit de meting zelf, en zonder
     het koelwater — dat is juist wat de koudstartstap toetst. Wel: de motor
     staat uit, en inlaatlucht en buitenlucht zijn gelijk (de motorruimte is
     afgekoeld). Zonder buitentemperatuur (0146) niet vast te stellen. */
  function koudGeweekt(tl, toestanden) {
    const iat = tl.kol['010F'], buiten = tl.kol['0146'];
    if (!iat || !buiten) return null;
    let n = 0, gelijk = 0;
    for (let i = 0; i < tl.t.length; i++) {
      if (toestanden[i] !== 'uit' || !getal(iat[i]) || !getal(buiten[i])) continue;
      n++; if (Math.abs(iat[i] - buiten[i]) <= 4) gelijk++;
    }
    return n >= 3 ? gelijk / n >= 0.8 : null;
  }

  /* Leest de meting. O = PLOnderzoek (in de app window.PLOnderzoek), ctx =
     {brandstof, liters, garage}. Geeft terug:
       toestanden  {label: ms}
       gelezen     [{id, titel, ms, bewijs:[{h,d,t}], tekst}]
       niet        [{id, titel, reden}]
       conclusie   PLOnderzoek.conclusie(st)
     of {geen: 'reden'} als er niets te lezen valt. Puur. */
  function lees(hist, O, ctx) {
    if (!O || !O.STAPPEN || !O.nieuw) return { geen: 'het volledig onderzoek is niet geladen' };
    const tl = tijdlijn(hist);
    if (!tl) return { geen: 'zonder toerental is niet vast te stellen of de motor draaide' };
    const g = (O.cfg && O.cfg.grens) || { uitRpm: 100, aanRpm: 400, rijKmh: 5, warmC: 70 };
    const toestanden = tl.t.map((_, i) => toestandOp(tl, i, g));
    const duur = duurPer(tl, toestanden);
    const c = ctx || {};
    const st = O.nieuw({ klachten: ['controle'], brandstof: c.brandstof, liters: c.liters, garage: true });
    // Elke verdenking die een van deze stappen kan raken, doet mee: ook
    // tegenbewijs telt ("laadspanning 14,1 V — de dynamo laadt").
    LEZEN.forEach(l => { const s = O.STAPPEN.find(x => x.id === l.id); Object.keys((s && s.test) || {}).forEach(h => O.speel(st, h, 'samenhang')); });
    // Wat het onderzoek de gebruiker vraagt, haalt dit uit de meting zelf.
    const aanMs = Object.keys(duur).filter(k => k !== 'uit' && k !== 'start').reduce((a, k) => a + duur[k], 0);
    if (aanMs >= 15 * 60000) st.antwoorden.looptijd = 'lang';
    const koud = koudGeweekt(tl, toestanden);
    if (koud === true) st.antwoorden.koud = 'ja';
    const heeft0103 = !!tl.kol['0103'] && tl.kol['0103'].some(getal);

    const gelezen = [], niet = [];
    LEZEN.forEach(l => {
      const stap = O.STAPPEN.find(x => x.id === l.id);
      if (!stap) return;
      const ontbreekt = (stap.pids || []).filter(p => !tl.kol[p] || !tl.kol[p].some(getal));
      if (ontbreekt.length === (stap.pids || []).length) { niet.push({ id: l.id, titel: stap.titel, reden: 'deze meting heeft de sensoren niet' }); return; }
      if (stap.alleenAls && !stap.alleenAls(st)) {
        niet.push({ id: l.id, titel: stap.titel, reden: l.id === 'koudstart' ? (koud === null ? 'niet vast te stellen of de auto lang stilstond (geen buitentemperatuur)' : 'de motor was niet afgekoeld')
                                                                                : 'niet nodig: het stuk ervoor gaf er geen aanleiding toe' });
        return;
      }
      const k = knip(tl, l.toestand, toestanden, l.gesloten && heeft0103, stap.pids, hist, l.uitgelijnd);
      if (k.ms < l.minMs) {
        niet.push({ id: l.id, titel: stap.titel,
          reden: 'geen ' + l.toestand.map(x => NAAM[x]).join(' of ') + (l.gesloten && heeft0103 ? ' in gesloten lus' : '') +
                 ' van ' + Math.round(l.minMs / 1000) + ' s in deze meting (' + Math.round(k.ms / 1000) + ' s)' });
        return;
      }
      const vast = MOET_BEWEGEN.filter(p => {
        const a = (k.reeks[p] || []).filter(getal);
        return a.length >= VAST_MIN && Math.max.apply(null, a) === Math.min.apply(null, a);
      });
      if (vast.length) {
        // Altijd melden, ook als de stap met de rest nog iets kan lezen.
        vast.forEach(p => { k.reeks[p] = []; });
        niet.push({ id: l.id, titel: stap.titel, reden: 'de sensor staat exact stil (' + vast.join(', ') + ') — een meetvraag, geen uitslag; vaak een breedbandsonde die op dit adres niets meldt' });
        if ((stap.pids || []).every(p => !(k.reeks[p] || []).some(getal))) return;
      }
      const voor = st.log.length;
      O.verwerk(st, stap, { reeks: k.reeks, ontbreekt: ontbreekt.concat(vast) });
      const stuk = st.log.slice(voor).filter(x => x.soort === 'stap').pop() || {};
      gelezen.push({ id: l.id, titel: stap.titel, ms: k.ms, bewijs: stuk.bewijs || [], tekst: stuk.t || '' });
    });
    const r = { toestanden: duur, gelezen, niet, conclusie: O.conclusie(st), gesloten: heeft0103 };
    r.regel = toestandRegel(r);
    return r;
  }

  function sec(ms) { const s = Math.round(ms / 1000), m = Math.floor(s / 60); return m ? m + ':' + String(s % 60).padStart(2, '0') + ' min' : s + ' s'; }
  function toestandRegel(r) {
    return Object.keys(r.toestanden || {}).filter(k => r.toestanden[k] >= 1000)
      .sort((a, b) => r.toestanden[b] - r.toestanden[a]).map(k => NAAM[k] + ' ' + sec(r.toestanden[k])).join(' · ');
  }

  /* Wat de AI krijgt. Bovenaan de sensorsamenvatting, zodat hij vanuit een
     redenering werkt en niet vanuit een lijst getallen. */
  function promptBlok(r) {
    if (!r || r.geen) return r && r.geen ? '\n\nSAMENHANG: niet bepaald — ' + r.geen + '.' : '';
    const c = r.conclusie || { top: [], uitgesloten: [] };
    const bew = x => (x.bewijs || []).map(b => (b.d > 0 ? '▲ ' : '▼ ') + b.t).join('; ');
    let s = '\n\nSAMENHANG (de regels van het volledig onderzoek, alleen toegepast op de stukken van het meetvenster waar hun voorwaarden golden' +
      (r.gesloten ? '; trims en lambda alleen in gesloten lus volgens PID 0103' : '') + '):';
    s += '\nToestanden in de meting: ' + (r.regel || toestandRegel(r) || 'onbekend') + '.';
    if (!r.gelezen.length) s += '\nNiets in samenhang beoordeeld: geen stuk van de meting voldeed aan de voorwaarden van een stap. Trek dus ook geen conclusie dat alles in orde is.';
    else if (c.top.length) s += '\nAANWIJZINGEN:\n' + c.top.map(x => '- ' + x.naam + ' (' + x.status + '): ' + bew(x)).join('\n');
    else s += '\nGeen verdenking komt boven de drempel.';
    if (c.uitgesloten.length) s += '\nTEGENGESPROKEN DOOR DE METING:\n' + c.uitgesloten.map(x => '- ' + x.naam + ': ' + bew(x)).join('\n');
    if (r.niet.length) s += '\nNIET BEOORDEELD IN DEZE METING:\n' + r.niet.map(n => '- ' + n.titel + ': ' + n.reden).join('\n');
    s += '\nREGEL: dit zijn regels van de app op vaste drempels. Toets ze aan de data, zeg het als je het oneens bent, en trek geen conclusie over wat hier niet beoordeeld is.';
    return s;
  }

  /* Uit de app: de onderzoeksmodule en het voertuig. */
  function leesApp(hist) {
    let v = {};
    try { v = (typeof getVehicle === 'function' && getVehicle()) || {}; } catch (e) { console.warn('PLSamenhang: voertuig onbekend', e); }
    const O = window.PLOnderzoek;
    return lees(hist, O, { brandstof: v.brandstof, liters: O && O.liters ? O.liters(v) : null });
  }

  window.PLSamenhang = { TOL_MS, STATIONAIR_MAX, MOET_BEWEGEN, LEZEN, NAAM, tijdlijn, toestandOp, knip, koudGeweekt, lees, leesApp, promptBlok, toestandRegel };
})();
