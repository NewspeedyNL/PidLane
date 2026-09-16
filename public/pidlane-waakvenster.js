/* ═══════════════════════════════════════════════════════════════════
   pidlane-waakvenster.js — PLWaakUI: het scherm bij de waakronde
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT ER IS

   PLWaak meet al sinds lang de sensoren die je NIET hebt aangevinkt, en
   doet dat goed. Maar alles wat hij weet paste in één smalle strook
   boven het raster: een rij stipjes, één regel tekst, een telling. Dat
   is precies genoeg tijdens het rijden — en te weinig op elk ander
   moment.

   Want de strook kan drie vragen niet beantwoorden:

     "wat IS dit eigenlijk"   — nergens stond uitleg; de schakelaar zat
                                tussen de weergaveknoppen en wie hem niet
                                kende, liet hem staan.
     "wat heb je al gemeten"  — _lijst wordt bij elke ronde weggegooid.
                                Een sensor die drie rondes geleden buiten
                                bereik lag, was onvindbaar.
     "mag ik dat meenemen"    — er was geen enkele uitgang. Wat de
                                waakronde zag, bleef in de strook en ging
                                bij het sluiten van de tab verloren.

   Dit venster beantwoordt die drie. Het meet zelf niets en raakt de bus
   niet aan: het leest PLWaak en tekent. Eén bron, twee weergaven.

   WAT HET TOONT

     - de schakelaar, met uitleg eromheen in gewone woorden
     - vier cijfers: gelezen, bevindingen, rondes, looptijd
     - een verdeelbalk over de hele sessie (goed / buiten bereik /
       stil / nog niet gelezen)
     - de bevindingen als kaartjes, met de reden erbij
     - élke gemeten sensor met zijn laatste waarde, het bereik waarin
       die valt, hoe vaak hij gelezen is en hoe oud de meting is
     - export als JSON of CSV

   DE BEREIKMETER

   Het balkje achter elke sensor is het enige stukje eigen rekenwerk
   hier, en het verdient uitleg. Het zet de laatste waarde neer tussen
   de min en max uit de PID-definitie. Ligt de waarde daarbuiten, dan
   plakt de marker tegen de rand en kleurt het balkje oranje.

   Dat is bewust GEEN alarmdrempel. De grenzen in de definitie zijn
   weergavebereiken — PLWaak.beoordeel() hanteert er 2% marge omheen
   voordat iets een bevinding wordt, en dit balkje doet aan dat oordeel
   niets af. Het laat alleen zien wáár in zijn bereik een sensor zit,
   want "87" zegt niets als je niet weet of dat bij 0-120 of bij 80-90
   hoort.

   WAT HET BEWUST NIET DOET

   Geen eigen metingen, geen eigen oordeel, geen tweede telling naast
   die van PLWaak. Zodra dit venster zelf zou gaan rekenen over wat een
   bevinding is, staan er twee antwoorden op dezelfde vraag — en dat is
   in dit project al drie keer een bug geweest.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var VERVERS_MS = 2000;      // hertekenen zolang het venster open staat
  var _pols = null;
  var _sorteer = 'staat';     // staat | naam | tijd | aantal

  var STAAT = {
    ok:   { kleur: '#4f9c5a', naam: 'binnen bereik',  teken: '✓' },
    let:  { kleur: '#e0972f', naam: 'buiten bereik',  teken: '!' },
    stil: { kleur: '#6c7787', naam: 'geen antwoord',  teken: '·' },
    leeg: { kleur: '#2b3442', naam: 'nog niet gelezen', teken: '–' }
  };

  /* ═══════════════════ HULP ═══════════════════ */

  function def(pid) { try { return getPidDef(pid) || null; } catch (e) { return null; } }
  function naam(pid) { var d = def(pid); return (d && d.name) || pid; }
  function eenheid(pid) { var d = def(pid); return (d && d.unit) || ''; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toonWaarde(v, pid) {
    if (v === undefined || v === null || !isFinite(v)) return '—';
    try { return (typeof fv === 'function') ? fv(v, pid) : String(v); } catch (e) { return String(v); }
  }
  function el(id) { return document.getElementById(id); }

  // "3 min geleden" leest hier beter dan een tijdstip: de vraag bij een
  // waakrondemeting is niet wanneer precies, maar hoe vers hij nog is.
  function geleden(t) {
    if (!t) return '—';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + 's geleden';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min geleden';
    return Math.round(m / 60) + ' uur geleden';
  }
  function duur(ms) {
    if (!ms || ms < 0) return '—';
    var s = Math.round(ms / 1000);
    var u = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (u) return u + 'u ' + m + 'm';
    if (m) return m + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  function waak() { return (typeof window.PLWaak !== 'undefined') ? window.PLWaak : null; }

  /* ═══════════════════ DE BEREIKMETER ═══════════════════ */
  /* Waar ligt deze waarde binnen wat de definitie als bereik opgeeft?
     Zonder min/max valt er niets te tekenen en komt er een streepje. */

  function bereikMeter(pid, v, staat) {
    var d = def(pid);
    if (!d || typeof d.min !== 'number' || typeof d.max !== 'number' || d.max <= d.min)
      return '<span class="wkv-geenmeter">geen bereik bekend</span>';
    if (typeof v !== 'number' || !isFinite(v))
      return '<span class="wkv-geenmeter">niet gemeten</span>';

    var frac = (v - d.min) / (d.max - d.min);
    var buiten = (frac < 0 || frac > 1);
    var pos = Math.max(0, Math.min(1, frac)) * 100;
    var kleur = buiten ? STAAT.let.kleur : STAAT.ok.kleur;
    return '<span class="wkv-meter" title="' + esc(d.min + ' – ' + d.max + ' ' + (d.unit || '')) + '">' +
      '<span class="wkv-meter-baan"></span>' +
      '<span class="wkv-meter-punt" style="left:' + pos.toFixed(1) + '%;background:' + kleur + '"></span>' +
      '</span>' +
      '<span class="wkv-meter-rand">' + esc(d.min) + '–' + esc(d.max) + '</span>';
  }

  /* ═══════════════════ DE SCHIL ═══════════════════ */

  function stijl() {
    if (el('wkvStijl')) return;
    var st = document.createElement('style');
    st.id = 'wkvStijl';
    st.textContent = [
      '#wkvOv{display:none;position:fixed;inset:0;z-index:var(--z-modal-hoog,9800);',
        'background:rgba(4,8,14,.88);align-items:flex-start;justify-content:center;',
        'padding:14px;overflow:auto;font-family:var(--f,system-ui,sans-serif)}',
      '.wkv-paneel{width:100%;max-width:680px;background:var(--sur,#151b24);',
        'border:1.5px solid var(--bd,#26303b);border-radius:16px;padding:18px;',
        'color:var(--tx,#e6e9ef);margin:auto}',
      '.wkv-kop{display:flex;align-items:center;gap:9px;margin-bottom:3px}',
      '.wkv-kop b{font-size:16px}',
      '.wkv-x{background:none;border:0;color:var(--tx,#e6e9ef);font-size:22px;cursor:pointer;line-height:1}',
      '.wkv-pil{font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px;letter-spacing:.02em}',
      '.wkv-pil.aan{background:rgba(79,156,90,.18);color:#6cc47c}',
      '.wkv-pil.uit{background:rgba(255,255,255,.08);color:var(--tx3,#8b95a6)}',
      '.wkv-uitleg{font-size:12.5px;line-height:1.6;opacity:.8;margin:8px 0 14px}',
      '.wkv-sec{margin:18px 0 0}',
      '.wkv-sectitel{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;',
        'color:var(--tx3,#8b95a6);margin-bottom:8px}',
      '.wkv-knoprij{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}',
      '.wkv-btn{flex:1;min-width:132px;padding:11px;border-radius:10px;border:1px solid var(--bd,#26303b);',
        'background:var(--sur2,#0e1420);color:var(--tx,#e6e9ef);font-weight:700;font-size:13px;',
        'cursor:pointer;font-family:inherit}',
      '.wkv-btn:hover{border-color:#4f9c5a}',
      '.wkv-btn.pri{border:0;background:linear-gradient(135deg,#0e9f6e,#1a6fff);color:#fff;font-weight:800}',
      '.wkv-btn.stop{border:0;background:linear-gradient(135deg,#b4433a,#7c2f2a);color:#fff;font-weight:800}',
      '.wkv-cijfers{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px}',
      '.wkv-tegel{background:var(--sur2,#0e1420);border:1px solid var(--bd,#26303b);border-radius:11px;padding:10px 12px}',
      '.wkv-tegel-n{font-size:21px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums}',
      '.wkv-tegel-l{font-size:10.5px;opacity:.66;margin-top:2px;line-height:1.35}',
      '.wkv-balk{display:flex;height:13px;border-radius:7px;overflow:hidden;background:#2b3442;margin-bottom:7px}',
      '.wkv-balk span{display:block;height:100%}',
      '.wkv-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;opacity:.8}',
      '.wkv-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}',
      '.wkv-vind{background:rgba(224,151,47,.09);border:1px solid rgba(224,151,47,.34);border-radius:11px;',
        'padding:9px 11px;margin-bottom:7px}',
      '.wkv-vind b{font-size:13px;color:#e8ab52}',
      '.wkv-vind-r{font-size:11.5px;opacity:.82;margin-top:2px;line-height:1.5}',
      '.wkv-rij{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;',
        'padding:8px 0;border-bottom:1px solid rgba(255,255,255,.055)}',
      '.wkv-rij:last-child{border-bottom:0}',
      '.wkv-rij-n{font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:7px;min-width:0}',
      '.wkv-rij-n span.nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wkv-stip{width:9px;height:9px;border-radius:50%;flex:0 0 auto}',
      '.wkv-rij-v{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}',
      '.wkv-rij-m{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:10.5px;opacity:.62}',
      '.wkv-meter{position:relative;flex:1;height:5px;min-width:54px}',
      '.wkv-meter-baan{position:absolute;inset:0;background:rgba(255,255,255,.1);border-radius:3px}',
      '.wkv-meter-punt{position:absolute;top:-2px;width:3px;height:9px;border-radius:2px;transform:translateX(-1.5px)}',
      '.wkv-meter-rand{font-variant-numeric:tabular-nums;white-space:nowrap;opacity:.8}',
      '.wkv-geenmeter{flex:1;opacity:.5}',
      '.wkv-sorteer{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}',
      '.wkv-sbtn{font-size:11px;font-weight:700;padding:4px 10px;border-radius:7px;cursor:pointer;',
        'border:1px solid var(--bd,#26303b);background:var(--sur2,#0e1420);color:var(--tx2,#aab4c2);font-family:inherit}',
      '.wkv-sbtn.op{border-color:#4f9c5a;color:#6cc47c}',
      '.wkv-leeg{font-size:12px;opacity:.6;padding:14px 2px;line-height:1.6}',
      '.wkv-hoe{font-size:12px;line-height:1.75;opacity:.82}',
      '.wkv-hoe b{color:var(--tx,#e6e9ef)}',
      '@media(max-width:420px){.wkv-paneel{padding:14px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function bouw() {
    stijl();
    var o = document.createElement('div');
    o.id = 'wkvOv';
    o.innerHTML =
      '<div class="wkv-paneel">' +
        '<div class="wkv-kop">' +
          '<span style="font-size:19px">◉</span>' +
          '<b>Waakronde</b>' +
          '<span id="wkvPil" class="wkv-pil uit">uit</span>' +
          '<span style="flex:1"></span>' +
          '<button class="wkv-x" id="wkvX" aria-label="Sluiten">×</button>' +
        '</div>' +
        '<div class="wkv-uitleg">' +
          'Een trage ronde langs de sensoren die je <b>niet</b> hebt aangevinkt — drie tegelijk, ' +
          'elk groepje twaalf seconden uit elkaar. Hij claimt het busslot even, leest, en geeft het terug; ' +
          'jouw eigen sensoren blijven op tempo. Elke meting krijgt een oordeel, geen grafiek: ' +
          'binnen bereik, buiten bereik, of geen antwoord. De vraag die hij beantwoordt is niet ' +
          '“wat doen al mijn sensoren” maar “is er iets dat ik zou moeten weten”.' +
        '</div>' +
        '<div class="wkv-knoprij">' +
          '<button class="wkv-btn pri" id="wkvSchakel"></button>' +
          '<button class="wkv-btn" id="wkvHerstel">↺ Genegeerde terug</button>' +
        '</div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Deze sessie</div>' +
          '<div class="wkv-cijfers" id="wkvCijfers"></div></div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Verdeling over alles wat gemeten is</div>' +
          '<div class="wkv-balk" id="wkvBalk"></div><div class="wkv-leg" id="wkvLeg"></div></div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Bevindingen</div>' +
          '<div id="wkvVind"></div></div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Wat er gemeten is</div>' +
          '<div class="wkv-sorteer" id="wkvSort">' +
            '<button class="wkv-sbtn" data-s="staat">op oordeel</button>' +
            '<button class="wkv-sbtn" data-s="naam">op naam</button>' +
            '<button class="wkv-sbtn" data-s="tijd">op versheid</button>' +
            '<button class="wkv-sbtn" data-s="aantal">op aantal metingen</button>' +
          '</div>' +
          '<div id="wkvTabel"></div></div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Hoe je hem gebruikt</div>' +
          '<div class="wkv-hoe">' +
            '<b>Aanzetten en laten staan.</b> Hij is ontworpen om de hele rit mee te lopen zonder je af te leiden. ' +
            'Bij busdruk slaat hij een ronde over en hij dringt nooit voor.<br>' +
            '<b>Een bevinding wegtikken.</b> Op de strook boven het raster: kort tikken is “gezien” — ' +
            'volgende ronde mag hij zich opnieuw melden. Dat is expres, want een tweede melding zegt iets ' +
            'anders dan een eerste.<br>' +
            '<b>Een bevinding negeren.</b> Ingedrukt houden. Een accu die op 11,8 V blijft hangen meldt zich ' +
            'anders elke ronde opnieuw; genegeerde sensoren zwijgen de rest van de sessie en staan hierboven ' +
            'met ↺ weer terug te halen.<br>' +
            '<b>Wat hij niet doet.</b> Bevroren waardes en sensoruitval zijn het werk van de rit-monitor: ' +
            'die kijken naar historie. De waakronde kijkt juist naar sensoren die helemaal geen historie ' +
            'hebben omdat niemand ze pollt.' +
          '</div></div>' +
        '<div class="wkv-sec"><div class="wkv-sectitel">Meenemen</div>' +
          '<div class="wkv-knoprij">' +
            '<button class="wkv-btn" id="wkvJson">⤓ JSON-bestand</button>' +
            '<button class="wkv-btn" id="wkvCsv">⤓ CSV-bestand</button>' +
            '<button class="wkv-btn" id="wkvKlem">⧉ Naar klembord</button>' +
          '</div>' +
          '<div class="wkv-uitleg" style="margin:8px 0 0">De export draagt de hele sessiehistorie: ' +
            'per sensor het aantal metingen, het laatste oordeel met reden, en het bereik waarbinnen ' +
            'de waardes vielen.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);

    el('wkvX').addEventListener('click', sluit);
    o.addEventListener('click', function (e) { if (e.target === o) sluit(); });
    el('wkvSchakel').addEventListener('click', function () {
      var w = waak();
      if (!w) { melding('Waakronde is niet geladen'); return; }
      try { w.schakel(); } catch (e) { console.warn('schakelen mislukt:', e); melding('Schakelen mislukt'); }
      teken();
    });
    el('wkvHerstel').addEventListener('click', function () {
      var w = waak();
      if (!w) return;
      try { w.herstel(); melding('Genegeerde sensoren staan weer aan'); }
      catch (e) { console.warn('herstel mislukt:', e); }
      teken();
    });
    el('wkvSort').addEventListener('click', function (e) {
      var b = e.target.closest('.wkv-sbtn');
      if (!b) return;
      _sorteer = b.getAttribute('data-s');
      teken();
    });
    el('wkvJson').addEventListener('click', function () { exporteer('json'); });
    el('wkvCsv').addEventListener('click', function () { exporteer('csv'); });
    el('wkvKlem').addEventListener('click', klembord);
    return o;
  }

  function melding(t) {
    // showToast is de globale (pidlane-auth.js). `toast` bestaat wel in
    // pidlane-bulk.js maar is daar module-lokaal, dus een guard daarop is
    // altijd onwaar — en dan verdwijnt elke melding stil in de console.
    try { if (typeof showToast === 'function') { showToast(t); return; } }
    catch (e) { console.warn('showToast mislukt:', e); }
    try { console.log('[waakvenster] ' + t); } catch (e) { /* console kan in een schil ontbreken */ }
  }

  /* ═══════════════════ TEKENEN ═══════════════════ */

  function teken() {
    var w = waak();
    if (!el('wkvOv')) return;

    var aan = false, hist = [], ronde = 0, sinds = 0, nu = [], genegeerd = [];
    if (w) {
      try { aan = !!w.actief(); } catch (e) { console.warn('actief() mislukt:', e); }
      try { hist = w.historie() || []; } catch (e) { console.warn('historie() mislukt:', e); }
      try { ronde = w.ronde() || 0; } catch (e) { console.warn('ronde() mislukt:', e); }
      try { sinds = w.sinds() || 0; } catch (e) { console.warn('sinds() mislukt:', e); }
      try { nu = w.lijst() || []; } catch (e) { console.warn('lijst() mislukt:', e); }
      try { genegeerd = w.genegeerd() || []; } catch (e) { console.warn('genegeerd() mislukt:', e); }
    }

    var pil = el('wkvPil');
    pil.textContent = aan ? 'aan' : 'uit';
    pil.className = 'wkv-pil ' + (aan ? 'aan' : 'uit');
    var sch = el('wkvSchakel');
    sch.textContent = aan ? '■ Waakronde uitzetten' : '◉ Waakronde aanzetten';
    sch.className = 'wkv-btn ' + (aan ? 'stop' : 'pri');
    el('wkvHerstel').style.display = genegeerd.length ? '' : 'none';
    el('wkvHerstel').textContent = '↺ ' + genegeerd.length + ' genegeerd terug';

    // ── cijfers ──
    var bev = hist.filter(function (h) { return h.staat === 'let'; });
    var gelezenNu = nu.filter(function (r) { return r.staat !== 'leeg'; }).length;
    el('wkvCijfers').innerHTML = [
      tegel(hist.length, 'sensoren gemeten<br>deze sessie'),
      tegel(bev.length, 'sensoren staan nu<br>buiten bereik'),
      tegel(ronde, 'rondes<br>gedraaid'),
      tegel(sinds ? duur(Date.now() - sinds) : '—', 'looptijd sinds<br>de eerste start'),
      tegel(nu.length ? gelezenNu + '/' + nu.length : '—', 'gelezen in de<br>ronde die nu loopt')
    ].join('');

    // ── verdeelbalk: telt METINGEN, niet sensoren. Een sensor die twintig
    //    keer goed antwoordde weegt dan zwaarder dan een die één keer
    //    gelezen is, en dat is precies wat "hoe staat het ervoor" betekent.
    var t = { ok: 0, let: 0, stil: 0 };
    hist.forEach(function (h) { t.ok += h.ok || 0; t.let += h.let || 0; t.stil += h.stil || 0; });
    var tot = t.ok + t.let + t.stil;
    if (tot) {
      el('wkvBalk').innerHTML = ['ok', 'let', 'stil'].map(function (k) {
        if (!t[k]) return '';
        return '<span style="width:' + (t[k] / tot * 100).toFixed(2) + '%;background:' + STAAT[k].kleur +
          '" title="' + esc(STAAT[k].naam + ': ' + t[k]) + '"></span>';
      }).join('');
      el('wkvLeg').innerHTML = ['ok', 'let', 'stil'].map(function (k) {
        return '<span><i style="background:' + STAAT[k].kleur + '"></i>' +
          esc(STAAT[k].naam) + ' — ' + t[k] + ' metingen</span>';
      }).join('');
    } else {
      el('wkvBalk').innerHTML = '';
      el('wkvLeg').innerHTML = '<span style="opacity:.6">nog niets gemeten</span>';
    }

    // ── bevindingen ──
    var v = el('wkvVind');
    if (bev.length) {
      v.innerHTML = bev.map(function (h) {
        return '<div class="wkv-vind"><b>' + esc(naam(h.pid)) + '</b> — ' +
          esc(toonWaarde(h.waarde, h.pid)) + ' ' + esc(eenheid(h.pid)) +
          '<div class="wkv-vind-r">' + esc(h.reden || 'buiten bereik') +
          ' · ' + esc(geleden(h.laatst)) +
          ' · ' + h.let + ' van ' + h.n + ' metingen buiten bereik</div></div>';
      }).join('');
    } else {
      v.innerHTML = '<div class="wkv-leeg">' + (tot
        ? 'Niets buiten bereik. Alles wat gelezen is, viel binnen wat de definitie toelaat.'
        : 'Nog geen bevindingen — er is deze sessie nog niets gemeten.') + '</div>';
    }

    // ── tabel ──
    el('wkvSort').querySelectorAll('.wkv-sbtn').forEach(function (b) {
      b.classList.toggle('op', b.getAttribute('data-s') === _sorteer);
    });
    var rang = { let: 0, stil: 1, ok: 2, leeg: 3 };
    var rijen = hist.slice();
    rijen.sort(function (a, b) {
      if (_sorteer === 'naam')   return naam(a.pid).localeCompare(naam(b.pid));
      if (_sorteer === 'tijd')   return (b.laatst || 0) - (a.laatst || 0);
      if (_sorteer === 'aantal') return (b.n || 0) - (a.n || 0);
      var ra = rang[a.staat] === undefined ? 9 : rang[a.staat];
      var rb = rang[b.staat] === undefined ? 9 : rang[b.staat];
      if (ra !== rb) return ra - rb;
      return naam(a.pid).localeCompare(naam(b.pid));
    });

    var tab = el('wkvTabel');
    if (!rijen.length) {
      tab.innerHTML = '<div class="wkv-leeg">' + (aan
        ? 'De ronde is net begonnen — de eerste metingen komen binnen een paar tellen binnen.'
        : 'Nog niets gemeten. Zet de waakronde aan; na ongeveer twaalf seconden staan de eerste drie sensoren hier.') +
        '</div>';
    } else {
      var genSet = {};
      genegeerd.forEach(function (p) { genSet[p] = true; });
      tab.innerHTML = rijen.map(function (h) {
        var s = STAAT[h.staat] || STAAT.leeg;
        var spreiding = (typeof h.min === 'number' && typeof h.max === 'number' && h.min !== h.max)
          ? toonWaarde(h.min, h.pid) + '–' + toonWaarde(h.max, h.pid)
          : '';
        return '<div class="wkv-rij">' +
          '<div class="wkv-rij-n">' +
            '<span class="wkv-stip" style="background:' + s.kleur + '" title="' + esc(s.naam) + '"></span>' +
            '<span class="nm">' + esc(naam(h.pid)) + (genSet[h.pid] ? ' 🔕' : '') + '</span>' +
          '</div>' +
          '<div class="wkv-rij-v">' + esc(toonWaarde(h.waarde, h.pid)) +
            ' <span style="font-size:10px;opacity:.6;font-weight:600">' + esc(eenheid(h.pid)) + '</span></div>' +
          '<div class="wkv-rij-m">' +
            bereikMeter(h.pid, h.waarde, h.staat) +
            '<span>' + h.n + '×</span>' +
            (spreiding ? '<span>' + esc(spreiding) + '</span>' : '') +
            '<span>' + esc(geleden(h.laatst)) + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  function tegel(n, label) {
    return '<div class="wkv-tegel"><div class="wkv-tegel-n">' + esc(n) +
      '</div><div class="wkv-tegel-l">' + label + '</div></div>';
  }

  /* ═══════════════════ EXPORT ═══════════════════ */

  function bundel() {
    var w = waak();
    var hist = [];
    try { if (w) hist = w.historie() || []; } catch (e) { console.warn('historie() mislukt:', e); }
    var veh = {};
    try {
      if (typeof vehicleInfo !== 'undefined' && vehicleInfo) {
        veh = { merk: vehicleInfo.merk || '', model: vehicleInfo.model || '',
                jaar: vehicleInfo.year || '', brandstof: vehicleInfo.brandstof || '' };
      }
    } catch (e) { console.warn('vehicleInfo mislukt:', e); }
    // Geen VIN in de export. Die is via het RDW herleidbaar tot een persoon en
    // gaat nooit ruw de telefoon uit; zie §7 van PIDLANE.md. Voor het lezen
    // van een waakrondeverslag voegt hij ook niets toe.
    return {
      type: 'pidlane-waakronde', schema: 1,
      app: (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : '?',
      export: new Date().toISOString(),
      ronde: (function () { try { return w ? w.ronde() : 0; } catch (e) { return 0; } })(),
      sinds: (function () { try { return w ? w.sinds() : 0; } catch (e) { return 0; } })(),
      veh: veh,
      sensoren: hist.map(function (h) {
        return { pid: h.pid, naam: naam(h.pid), eenheid: eenheid(h.pid),
                 metingen: h.n, ok: h.ok, buiten: h.let, stil: h.stil,
                 laatsteStaat: h.staat, laatsteWaarde: h.waarde, reden: h.reden,
                 min: h.min, max: h.max, laatst: h.laatst };
      })
    };
  }

  function csv() {
    var b = bundel();
    var kop = ['pid', 'naam', 'eenheid', 'metingen', 'ok', 'buiten_bereik', 'geen_antwoord',
               'laatste_oordeel', 'laatste_waarde', 'reden', 'min', 'max', 'laatst_iso'];
    var regels = [kop.join(';')];
    b.sensoren.forEach(function (s) {
      regels.push([
        s.pid, '"' + String(s.naam).replace(/"/g, '""') + '"', s.eenheid,
        s.metingen, s.ok, s.buiten, s.stil, s.laatsteStaat,
        (typeof s.laatsteWaarde === 'number' ? s.laatsteWaarde : ''),
        '"' + String(s.reden || '').replace(/"/g, '""') + '"',
        (typeof s.min === 'number' ? s.min : ''), (typeof s.max === 'number' ? s.max : ''),
        s.laatst ? new Date(s.laatst).toISOString() : ''
      ].join(';'));
    });
    return regels.join('\n');
  }

  function dagStempel() {
    try { if (typeof plDatumLokaal === 'function') return plDatumLokaal(); }
    catch (e) { console.warn('plDatumLokaal mislukt:', e); }
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function bewaar(naamB, body, mime) {
    try { if (typeof download === 'function') { download(naamB, body); return true; } }
    catch (e) { console.warn('download() mislukt:', e); }
    try {
      var bl = new Blob([body], { type: mime || 'text/plain' });
      var u = URL.createObjectURL(bl);
      var a = document.createElement('a');
      a.href = u; a.download = naamB;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      return true;
    } catch (e) { console.warn('blob-download mislukt:', e); return false; }
  }

  function exporteer(vorm) {
    var b = bundel();
    if (!b.sensoren.length) { melding('Nog niets gemeten om te exporteren'); return; }
    var body = (vorm === 'csv') ? csv() : JSON.stringify(b, null, 2);
    var bestand = 'pidlane-waakronde-' + dagStempel() + (vorm === 'csv' ? '.csv' : '.json');
    if (bewaar(bestand, body, vorm === 'csv' ? 'text/csv' : 'application/json'))
      melding('Geëxporteerd: ' + b.sensoren.length + ' sensoren');
    else melding('Export mislukt — probeer het klembord');
  }

  function klembord() {
    var b = bundel();
    if (!b.sensoren.length) { melding('Nog niets gemeten om te kopiëren'); return; }
    var tekst = b.sensoren.map(function (s) {
      return [s.naam, toonWaarde(s.laatsteWaarde, s.pid) + ' ' + s.eenheid,
              s.laatsteStaat + (s.reden ? ' (' + s.reden + ')' : ''),
              s.metingen + ' metingen'].join(' · ');
    }).join('\n');
    try {
      navigator.clipboard.writeText(tekst).then(
        function () { melding('Naar klembord gekopieerd'); },
        function (e) { console.warn('klembord mislukt:', e); melding('Kopiëren mislukt'); }
      );
    } catch (e) { console.warn('klembord niet beschikbaar:', e); melding('Klembord niet beschikbaar'); }
  }

  /* ═══════════════════ OPEN / DICHT ═══════════════════ */

  function open() {
    var o = el('wkvOv') || bouw();
    o.style.display = 'flex';
    teken();
    if (_pols) clearInterval(_pols);
    _pols = setInterval(teken, VERVERS_MS);
  }

  function sluit() {
    var o = el('wkvOv');
    if (o) o.style.display = 'none';
    if (_pols) { clearInterval(_pols); _pols = null; }
  }

  window.PLWaakUI = {
    open: open, sluit: sluit,
    _bundel: bundel, _csv: csv, _bereikMeter: bereikMeter
  };
  window.openWaakvenster = open;

})();
