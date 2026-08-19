/* ═══════════════════════════════════════════════════════════════════
   pidlane-logboek.js — één logscherm dat alles bij elkaar houdt
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Er wordt op vier plekken gelogd en er is sinds de testrun-consolidatie
   geen scherm meer dat ze samen laat zien:

     log()            pidlane-auth.js       localLog, 500 regels
     btDiag()         pidlane-btflow.js     _btLog, 1400 regels, persist
     _diagRing        pidlane-diagbundel.js plDiagGevallen(), 400 gevallen
     liveLogWrite()   pidlane-koopcheck.js  schijf/localStorage-spiegel

   Los van elkaar zijn ze alle vier onvolledig. De vraag die je in een
   auto stelt is bijna altijd "wat gebeurde er rond 14:38:25", en dat
   antwoord staat verspreid over drie ringen met verschillende lengtes.

   HOE — TREKKEN, NIET DUWEN

   Dit scherm LEEST de bestaande bronnen op het moment dat je het opent.
   Het hangt zich niet in log() of btDiag() en vervangt niets. Reden: de
   codebase heeft al één laag wrappers (pidlane-remote.js) en die maakt
   broncode-inspectie onbetrouwbaar. Een tweede laag zou dat verergeren,
   en een logvenster dat het gedrag van de app verandert is een slecht
   logvenster.

   Gevolg van die keuze: de ringen zijn zo lang als hun eigenaar ze
   maakt. Wat uit _btLog is gerold komt hier niet terug. De kop van de
   sessie blijft wel staan — btDiag houdt de eerste 300 regels vast.

   PERSISTENTIE

   Na een crash of herstart van de WebView is _btLog in het geheugen weg,
   maar staat er nog een kopie in localStorage (pl_btlog) en eventueel in
   de live-log-spiegel. Dit scherm leest die kopieën als de ring in het
   geheugen leeg is, zodat je ná een crash niet met lege handen staat.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const LOGBOEK_VERSIE = '1.0 (20-08-2026)';

  // ── 1. BRONNEN OPHALEN ────────────────────────────────────────────
  // Elke bron levert {t, bron, type, msg}. `t` is een tijdstring HH:MM:SS
  // zoals de bronnen hem zelf maken — geen enkele bewaart een echte
  // timestamp, dus sorteren gaat op die string. Dat werkt binnen een dag
  // en breekt rond middernacht; daarom staat de datum in de kop.

  function _uitBtLog() {
    const uit = [];
    let bron = null;
    try { if (typeof _btLog !== 'undefined' && _btLog && _btLog.length) bron = _btLog; } catch (e) {}
    if (!bron) {
      // Geheugen leeg (verse start na een crash) — val terug op de kopie.
      try { bron = JSON.parse(sessionStorage.getItem('pl_btlog') || 'null'); } catch (e) {}
      if (!bron) { try { bron = JSON.parse(localStorage.getItem('pl_btlog') || 'null'); } catch (e) {} }
    }
    if (!Array.isArray(bron)) return uit;
    for (const r of bron) {
      if (!r) continue;
      uit.push({ t: r.ts || '', bron: 'BT', type: r.type || 'info', msg: String(r.msg == null ? r : r.msg) });
    }
    return uit;
  }

  function _uitAppLog() {
    const uit = [];
    let bron = null;
    try { if (typeof plLokaalLog === 'function') bron = plLokaalLog(); } catch (e) {}
    if (!Array.isArray(bron)) return uit;
    for (const r of bron) {
      if (!r) continue;
      uit.push({ t: r.ts || '', bron: 'APP', type: r.type || 'info', msg: String(r.msg == null ? r : r.msg) });
    }
    return uit;
  }

  function _uitDiagRing() {
    const uit = [];
    let bron = null;
    try { if (typeof plDiagGevallen === 'function') bron = plDiagGevallen(); } catch (e) {}
    if (!Array.isArray(bron)) return uit;
    for (const r of bron) {
      if (!r) continue;
      // De diagbundel bewaart hele gevallen (pid, tx, rx, ms). Platslaan tot
      // één regel, want dit scherm is een tijdlijn en geen inspecteur.
      const stuk = [];
      if (r.pid) stuk.push(r.pid);
      if (r.tx) stuk.push('TX ' + r.tx);
      if (r.rx) stuk.push('RX ' + String(r.rx).replace(/\s+/g, ' ').slice(0, 60));
      if (r.ms != null) stuk.push(r.ms + ' ms');
      if (r.note) stuk.push(r.note);
      uit.push({
        t: r.ts || r.tijd || '',
        bron: 'PID',
        type: r.fout || r.err ? 'err' : 'info',
        msg: stuk.length ? stuk.join('  ') : JSON.stringify(r).slice(0, 160)
      });
    }
    return uit;
  }

  function _uitLiveSpiegel() {
    // Alleen gebruiken als de andere bronnen weinig opleveren. De spiegel
    // bevat regels die al in BT/APP staan; dubbel tonen maakt het onleesbaar.
    const uit = [];
    let tekst = '';
    try { tekst = localStorage.getItem('pl_livelog_mirror') || ''; } catch (e) {}
    if (!tekst) return uit;
    const regels = tekst.split('\n').filter(Boolean).slice(-600);
    for (const r of regels) {
      const m = r.match(/^\[(?:BT\])?\[?(\d{2}:\d{2}:\d{2})\]\s*\[([A-Z]+)\]\s*([\s\S]*)$/);
      if (m) uit.push({ t: m[1], bron: 'SPIEGEL', type: m[2].toLowerCase(), msg: m[3] });
      else uit.push({ t: '', bron: 'SPIEGEL', type: 'info', msg: r });
    }
    return uit;
  }

  // Alles samen, op tijd gesorteerd. Regels zonder tijd blijven achteraan
  // staan in de volgorde waarin ze binnenkwamen — beter dan ze bovenaan
  // dumpen alsof ze het oudst zijn.
  function verzamel() {
    let alles = [].concat(_uitBtLog(), _uitAppLog(), _uitDiagRing());
    if (alles.length < 40) alles = alles.concat(_uitLiveSpiegel());
    const met = alles.filter(function (r) { return r.t; });
    const zonder = alles.filter(function (r) { return !r.t; });
    met.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    return met.concat(zonder);
  }

  // ── 2. FILTEREN ───────────────────────────────────────────────────
  const _st = { bron: 'ALLES', niveau: 'ALLES', zoek: '', regels: [] };

  function _pastNiveau(type) {
    if (_st.niveau === 'ALLES') return true;
    if (_st.niveau === 'PROBLEMEN') return type === 'err' || type === 'warn';
    return type === _st.niveau.toLowerCase();
  }

  function gefilterd() {
    const z = _st.zoek.trim().toLowerCase();
    return _st.regels.filter(function (r) {
      if (_st.bron !== 'ALLES' && r.bron !== _st.bron) return false;
      if (!_pastNiveau(r.type)) return false;
      if (z && (r.msg || '').toLowerCase().indexOf(z) < 0 && (r.t || '').indexOf(z) < 0) return false;
      return true;
    });
  }

  // ── 3. TEKST VOOR EXPORT ──────────────────────────────────────────
  function logboekTekst() {
    const r = [];
    const d = new Date();
    r.push('PIDLANE LOGBOEK ' + LOGBOEK_VERSIE);
    r.push('════════════════════════════════════════════════');
    r.push('Opgeslagen  : ' + d.toLocaleString('nl'));
    try {
      const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo : null;
      if (v) r.push('Voertuig    : ' + [v.merk, v.model, v.bouwjaar, v.brandstof].filter(Boolean).join(' '));
    } catch (e) {}
    try { r.push('Verbonden   : ' + ((typeof connected !== 'undefined' && connected) ? 'ja' : 'nee')); } catch (e) {}
    const g = gefilterd();
    r.push('Regels      : ' + g.length + ' van ' + _st.regels.length +
      (_st.bron !== 'ALLES' || _st.niveau !== 'ALLES' || _st.zoek ?
        '  (gefilterd: bron ' + _st.bron + ', niveau ' + _st.niveau + (_st.zoek ? ', zoek "' + _st.zoek + '"' : '') + ')' : ''));
    r.push('');
    r.push('────────────────────────────────────────────────');
    for (const x of g) r.push('[' + (x.t || '        ') + '] [' + x.bron.padEnd(7) + '] [' + String(x.type || 'info').toUpperCase().padEnd(5) + '] ' + x.msg);
    r.push('');
    r.push('════════════════════════════════════════════════');
    r.push('Bronnen: BT = btDiag (transport), APP = log (applicatie), ');
    r.push('PID = diagbundel (per meting), SPIEGEL = live-log op schijf.');
    return r.join('\n');
  }

  function logboekOpslaan() {
    const d = new Date();
    const basis = 'PidLane-logboek-' + d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    const tekst = logboekTekst();
    if (typeof plOpslaan === 'function') {
      plOpslaan(basis, tekst, { titel: 'Logboek', ondertitel: gefilterd().length + ' regels' });
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([tekst], { type: 'text/plain;charset=utf-8' }));
      a.download = basis + '.txt';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
    } catch (e) {}
  }

  // ── 4. SCHERM ─────────────────────────────────────────────────────
  const KLEUR = { info: 'var(--tx2)', ok: 'var(--gn)', warn: 'var(--or)', err: 'var(--rd)', proto: '#a78bfa', device: '#00f5ff' };
  const BRONKLEUR = { BT: '#00f5ff', APP: 'var(--tx3)', PID: '#a78bfa', SPIEGEL: 'var(--or)' };

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _knop(tekst, actief, actie) {
    return '<button onclick="' + actie + '" style="background:' + (actief ? 'var(--ac)' : 'var(--sur2)') +
      ';color:' + (actief ? '#fff' : 'var(--tx2)') + ';border:1px solid ' + (actief ? 'var(--ac)' : 'var(--bd)') +
      ';border-radius:7px;padding:6px 10px;font:600 11px var(--f);cursor:pointer">' + tekst + '</button>';
  }

  function teken() {
    const lijst = document.getElementById('lbLijst');
    if (!lijst) return;
    const g = gefilterd();

    const tel = document.getElementById('lbTel');
    if (tel) tel.textContent = g.length + ' van ' + _st.regels.length + ' regels';

    if (!g.length) {
      lijst.innerHTML = '<div style="color:var(--tx3);font-size:12px;padding:20px;text-align:center">' +
        (_st.regels.length ? 'Niets dat aan het filter voldoet.' :
          'Nog niets gelogd. Verbind met de auto, of open dit scherm opnieuw na een sessie.') + '</div>';
      return;
    }

    // Bij veel regels alleen de staart tekenen. 1500 DOM-knopen is op een
    // telefoon al traag genoeg; de rest zit gewoon in de export.
    const kap = 1200;
    const toon = g.length > kap ? g.slice(-kap) : g;
    const kopregel = g.length > kap
      ? '<div style="color:var(--or);font-size:11px;padding:6px 4px">… ' + (g.length - kap) +
        ' oudere regels niet getekend (wel in de export) …</div>'
      : '';

    lijst.innerHTML = kopregel + toon.map(function (r) {
      return '<div style="display:flex;gap:7px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03)">' +
        '<span style="color:var(--tx3);flex:none;font-size:10.5px">' + _esc(r.t || '--:--:--') + '</span>' +
        '<span style="color:' + (BRONKLEUR[r.bron] || 'var(--tx3)') + ';flex:none;font-size:10px;font-weight:700;width:48px">' + _esc(r.bron) + '</span>' +
        '<span style="color:' + (KLEUR[r.type] || 'var(--tx2)') + ';min-width:0;word-break:break-word;font-size:11.5px">' + _esc(r.msg) + '</span>' +
        '</div>';
    }).join('');
    lijst.scrollTop = lijst.scrollHeight;
  }

  function ververs() {
    _st.regels = verzamel();
    teken();
  }

  function zetBron(b) { _st.bron = b; _bouwBalk(); teken(); }
  function zetNiveau(n) { _st.niveau = n; _bouwBalk(); teken(); }
  function zetZoek(v) { _st.zoek = v; teken(); }

  function _bouwBalk() {
    const balk = document.getElementById('lbBalk');
    if (!balk) return;
    const bronnen = ['ALLES', 'BT', 'APP', 'PID'];
    const niveaus = ['ALLES', 'PROBLEMEN', 'warn', 'err', 'ok'];
    balk.innerHTML =
      '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">' +
        '<span style="font-size:10px;color:var(--tx3);width:100%">BRON</span>' +
        bronnen.map(function (b) { return _knop(b, _st.bron === b, "PLLogboek.zetBron('" + b + "')"); }).join('') +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        '<span style="font-size:10px;color:var(--tx3);width:100%">NIVEAU</span>' +
        niveaus.map(function (n) { return _knop(n === 'PROBLEMEN' ? '⚠ problemen' : n, _st.niveau === n, "PLLogboek.zetNiveau('" + n + "')"); }).join('') +
      '</div>';
  }

  function openLogboek() {
    let ov = document.getElementById('logboekOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'logboekOv';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9975;background:rgba(8,11,17,.97);display:flex;flex-direction:column;padding:12px;gap:8px';
      ov.innerHTML =
        '<div style="display:flex;align-items:center;gap:9px;flex-shrink:0">' +
          '<div style="font-size:16px;font-weight:800;color:var(--tx)">📜 Logboek</div>' +
          '<span id="lbTel" style="font-size:11px;color:var(--tx3)"></span>' +
          '<button onclick="PLLogboek.sluit()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:7px 14px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<input id="lbZoek" placeholder="Zoek in de regels…" oninput="PLLogboek.zetZoek(this.value)" ' +
            'style="flex:1;min-width:0;background:var(--sur2);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:8px 10px;font:400 12px var(--f)">' +
          '<button onclick="PLLogboek.ververs()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;font:600 12px var(--f);cursor:pointer">↻</button>' +
          '<button onclick="PLLogboek.opslaan()" style="background:var(--ac);color:#fff;border:0;border-radius:8px;padding:8px 14px;font:700 12px var(--f);cursor:pointer">Opslaan</button>' +
        '</div>' +
        '<div id="lbBalk" style="flex-shrink:0"></div>' +
        '<div id="lbLijst" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--sur);border:1px solid var(--bd);border-radius:9px;padding:8px;font-family:ui-monospace,Menlo,monospace"></div>';
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    _bouwBalk();
    ververs();
  }

  function sluit() {
    const ov = document.getElementById('logboekOv');
    if (ov) ov.style.display = 'none';
  }

  window.openLogboek = openLogboek;
  window.PLLogboek = {
    open: openLogboek,
    sluit: sluit,
    ververs: ververs,
    opslaan: logboekOpslaan,
    tekst: logboekTekst,
    zetBron: zetBron,
    zetNiveau: zetNiveau,
    zetZoek: zetZoek,
    verzamel: verzamel,
    versie: LOGBOEK_VERSIE
  };

  try { if (typeof btDiag === 'function') btDiag('pidlane-logboek.js geladen — ' + LOGBOEK_VERSIE, 'info'); } catch (e) {}
})();
