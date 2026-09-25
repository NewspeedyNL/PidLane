/* ═══════════════════════════════════════════════════════════════════
   pidlane-bulkvenster.js — PLBulkUI: de rit teruglezen, niet exporteren
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT ER IS

   PLBulk legt tien uur rijden weg op 1 Hz en kan daar precies één ding
   mee: er een NDJSON-bestand van maken. Dat bestand is goed — maar het
   veronderstelt dat er verderop iemand met een script klaarstaat. Op de
   telefoon in de auto is dat niemand.

   Dus schreef de app 36.000 regels vol en kon er zelf niets over
   zeggen. Dit venster doet dat wel: het leest dezelfde opslag terug en
   vertelt in gewone zinnen wat er in die rit staat.

   HET VERSCHIL MET DE RECORDER-DASHBOARD

   Het bestaande dashboard (PLBulk.open) is de BEDIENING: starten,
   pauzeren, markeren, exporteren, hoeveel regels er nu staan. Dat blijft
   precies zoals het is.

   Dit is de LEZING. Andere vraag, ander scherm. Ze delen één opslag —
   PLBulk.lees() — en niet één regel rekenwerk, want twee modules die
   allebei uitrekenen hoe lang een rit duurde, geven vroeg of laat twee
   antwoorden.

   WAT HET UITREKENT

     - per sessie: duur, regels, gaten, en waar de tijd in ging
       (rijden / klim / stil / motor-uit / pauze)
     - per PID: hoe vaak gemeten, min, gemiddelde, max
     - een tijdbalk van de segmenten en een lijngrafiek per kernsensor
     - conclusies in gewone taal, met het getal waarop ze rusten

   DE CONCLUSIES, EN WAT ZE WAARD ZIJN

   Elke zin hieronder rust op een telling uit de data en noemt die
   telling er zelf bij. Dat is met opzet: een oordeel zonder het getal
   erachter is niet te controleren, en in dit project is dat de reden
   dat een test "slaagde" op een geval dat niet bestond.

   Twee getallen verdienen een waarschuwing.

   De AFSTAND is geïntegreerde snelheid: elke regel telt als één seconde
   bij snelheid v. Dat klopt zolang de logger echt op 1 Hz liep. Valt er
   een gat (adapter weg, tunnel), dan telt de tijd wél door en de
   afstand niet — de schatting wordt dus eerder te laag dan te hoog. Het
   venster noemt het aantal gatregels erbij zodat je weet hoeveel
   vertrouwen die kilometer verdient.

   De KLIMVERGELIJKING zet de koelwatertemperatuur tijdens 'klim' naast
   die tijdens 'rijden'. Dat is de vergelijking waarvoor de recorder is
   gebouwd — zwaar trekken in de bergen — maar hij zegt alleen iets als
   er van beide genoeg regels zijn. Onder de vijftig regels per kant
   blijft hij weg in plaats van een verschil te melden dat toeval kan
   zijn.

   WAT HET NIET DOET

   Het raakt de bus niet aan en meet niets. Het leest wat er staat.
   Loopt de recorder nog, dan flusht PLBulk.lees() eerst de buffer, want
   anders mist de analyse precies de laatste minuut — de minuut waar je
   meestal naar zoekt.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var MIN_KLIMREGELS = 50;    // onder dit aantal geen klimvergelijking
  var SPARK_PUNTEN   = 140;   // waarnaar een reeks wordt uitgedund

  // Kernsensoren voor de grafieken. Bewust kort: vier lijnen die je in
  // één blik leest, niet dertig die je moet uitzoeken.
  var KERN = [
    { pid: '010D', label: 'Snelheid',      kleur: '#3d9be9' },
    { pid: '010C', label: 'Toerental',     kleur: '#9d7bff' },
    { pid: '0105', label: 'Koelwater',     kleur: '#e0603f' },
    { pid: '0104', label: 'Motorbelasting', kleur: '#d9a327' }
  ];

  var SEGKLEUR = {
    'rijden'   : '#3d9be9',
    'klim'     : '#e0603f',
    'stil'     : '#6c7787',
    'motor-uit': '#39424f',
    'pauze'    : '#8a6f3d',
    'hervat'   : '#8a6f3d',
    'onbekend' : '#2b3442'
  };
  var SEGNAAM = {
    'rijden': 'rijden', 'klim': 'klim / zwaar trekken', 'stil': 'stilstand',
    'motor-uit': 'motor uit', 'pauze': 'gepauzeerd', 'hervat': 'gepauzeerd',
    'onbekend': 'onbekend'
  };

  var _sessies = [];      // uitgerekende sessies, nieuwste eerst
  var _gekozen = null;    // sessie-id dat nu getoond wordt
  var _bezig = false;

  /* ═══════════════════ HULP ═══════════════════ */

  function el(id) { return document.getElementById(id); }
  function plausibel(pid) {
    try { return typeof vehiclePlausiblePid !== 'function' || vehiclePlausiblePid(pid); }
    catch (e) { console.warn('vehiclePlausiblePid(' + pid + ') mislukt:', e); return true; }
  }
  function def(pid) { try { return getPidDef(pid) || null; } catch (e) { return null; } }
  function naam(pid) { var d = def(pid); return (d && d.name) || pid; }
  function eenheid(pid) { var d = def(pid); return (d && d.unit) || ''; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function n1(v) { return (Math.round(v * 10) / 10).toString(); }
  function duur(ms) {
    if (!ms || ms < 0) return '—';
    var s = Math.round(ms / 1000);
    var u = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (u) return u + 'u ' + m + 'm';
    if (m) return m + 'm ' + (s % 60) + 's';
    return s + 's';
  }
  function klok(t) {
    if (!t) return '—';
    try {
      var d = new Date(t);
      return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) { console.warn('klok mislukt:', e); return '—'; }
  }
  function melding(t) {
    // showToast is de globale (pidlane-auth.js). `toast` bestaat wel in
    // pidlane-bulk.js maar is daar module-lokaal, dus een guard daarop is
    // altijd onwaar — en dan verdwijnt elke melding stil in de console.
    try { if (typeof showToast === 'function') { showToast(t); return; } }
    catch (e) { console.warn('showToast mislukt:', e); }
    try { console.log('[bulkvenster] ' + t); } catch (e) { /* console kan in een schil ontbreken */ }
  }

  /* ═══════════════════ REKENEN ═══════════════════ */
  /* Eén doorloop over de regels van een sessie. Alles wat het venster
     laat zien komt hieruit; er wordt nergens anders geteld. */

  function analyseer(sessieId, regels) {
    regels.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });

    var uit = {
      sessie: sessieId,
      van: regels.length ? regels[0].t : 0,
      tot: regels.length ? regels[regels.length - 1].t : 0,
      regels: regels.length,
      gaten: 0,
      langsteGat: 0,
      segTel: {},            // seg -> aantal regels (1 regel = 1 seconde)
      segRij: [],            // [{seg, n}] op volgorde, voor de tijdbalk
      pids: {},              // pid -> {n, min, max, som}
      nietPlausibel: {},     // pid -> true: niet bij dit voertuig, niet meegeteld
      reeks: {},             // pid -> [{t, v}] uitgedund
      markeringen: [],
      klim: { koelwater: [], n: 0 },
      rij:  { koelwater: [], n: 0 },
      afstandKm: 0
    };

    var ruw = {};            // pid -> volledige reeks, later uitgedund
    KERN.forEach(function (k) { ruw[k.pid] = []; });

    var gatLoop = 0;
    var vorigSeg = null;

    for (var i = 0; i < regels.length; i++) {
      var r = regels[i];
      var seg = r.seg || 'onbekend';

      uit.segTel[seg] = (uit.segTel[seg] || 0) + 1;
      if (seg !== vorigSeg) { uit.segRij.push({ seg: seg, n: 1 }); vorigSeg = seg; }
      else uit.segRij[uit.segRij.length - 1].n++;

      if (r.mark) uit.markeringen.push({ t: r.t, tekst: String(r.mark) });

      // Gat: geen enkele PID-waarde binnen. De recorder markeert dat zelf
      // met gat:1; n===0 is dezelfde toestand en vangt oudere opnames.
      if (r.gat || r.n === 0) {
        uit.gaten++; gatLoop++;
        if (gatLoop > uit.langsteGat) uit.langsteGat = gatLoop;
      } else gatLoop = 0;

      var v = r.v || {};
      for (var pid in v) {
        if (!Object.prototype.hasOwnProperty.call(v, pid)) continue;
        var w = v[pid];
        if (typeof w !== 'number' || !isFinite(w)) continue;
        // Opnames van vóór 26-09 bevatten PIDs die niet bij dit voertuig
        // passen (NOx en AdBlue op een benzineauto): de recorder schreef
        // toen alles uit pidVals weg. Die tellen hier niet mee — wel het
        // aantal, zodat je ziet dát er iets is weggelaten.
        if (!plausibel(pid)) { uit.nietPlausibel[pid] = true; continue; }
        var p = uit.pids[pid];
        if (!p) p = uit.pids[pid] = { n: 0, min: w, max: w, som: 0 };
        p.n++; p.som += w;
        if (w < p.min) p.min = w;
        if (w > p.max) p.max = w;
        if (ruw[pid]) ruw[pid].push({ t: r.t, v: w });
      }

      // Afstand: 1 regel = 1 seconde bij deze snelheid. Zie de kop over
      // wat deze schatting waard is als er gaten in de log zitten.
      var kmh = v['010D'];
      if (typeof kmh === 'number' && isFinite(kmh) && kmh > 0) uit.afstandKm += kmh / 3600;

      // Koelwater apart bijhouden per segment, voor de klimvergelijking.
      var kw = v['0105'];
      if (typeof kw === 'number' && isFinite(kw)) {
        if (seg === 'klim') { uit.klim.koelwater.push(kw); uit.klim.n++; }
        else if (seg === 'rijden') { uit.rij.koelwater.push(kw); uit.rij.n++; }
      }
    }

    KERN.forEach(function (k) { uit.reeks[k.pid] = dun(ruw[k.pid], SPARK_PUNTEN); });
    return uit;
  }

  // Uitdunnen met behoud van de pieken: per emmer de hoogste én de
  // laagste waarde meenemen. Alleen elke n-de meten zou precies de
  // koelwaterpiek weglaten waar je naar zoekt.
  function dun(reeks, doel) {
    if (!reeks || reeks.length <= doel) return reeks || [];
    var stap = Math.ceil(reeks.length / (doel / 2));
    var uit = [];
    for (var i = 0; i < reeks.length; i += stap) {
      var blok = reeks.slice(i, i + stap);
      if (!blok.length) continue;
      var lo = blok[0], hi = blok[0];
      for (var j = 1; j < blok.length; j++) {
        if (blok[j].v < lo.v) lo = blok[j];
        if (blok[j].v > hi.v) hi = blok[j];
      }
      if (lo.t <= hi.t) { uit.push(lo); if (hi !== lo) uit.push(hi); }
      else { uit.push(hi); if (hi !== lo) uit.push(lo); }
    }
    return uit;
  }

  function gem(a) {
    if (!a || !a.length) return null;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  /* ═══════════════════ CONCLUSIES ═══════════════════ */
  /* Elke zin noemt het getal waarop hij rust. Een zin die dat niet kan,
     wordt niet geschreven. */

  function conclusies(a) {
    var uit = [];
    var tijdMs = (a.tot - a.van) || 0;

    uit.push({ soort: 'info', kop: 'De opname',
      tekst: 'Deze sessie loopt van ' + klok(a.van) + ' tot ' + klok(a.tot) + ' — ' +
        duur(tijdMs) + ' met ' + a.regels.toLocaleString('nl-NL') + ' regels op 1 Hz.' });

    // ── waar ging de tijd in ──
    var segs = Object.keys(a.segTel).sort(function (x, y) { return a.segTel[y] - a.segTel[x]; });
    if (segs.length) {
      var grootste = segs[0];
      var deel = Math.round(a.segTel[grootste] / a.regels * 100);
      var stuk = segs.filter(function (s) { return s !== 'pauze' && s !== 'hervat'; })
        .map(function (s) { return (SEGNAAM[s] || s) + ' ' + Math.round(a.segTel[s] / a.regels * 100) + '%'; })
        .join(', ');
      uit.push({ soort: 'info', kop: 'Waar de tijd in ging',
        tekst: 'Vooral ' + (SEGNAAM[grootste] || grootste) + ' (' + deel + '% van de regels). Verdeling: ' + stuk + '.' });
    }

    // ── afstand ──
    if (a.afstandKm >= 0.5) {
      var gemKmh = a.segTel['rijden'] || a.segTel['klim']
        ? a.afstandKm / (((a.segTel['rijden'] || 0) + (a.segTel['klim'] || 0)) / 3600) : null;
      uit.push({ soort: 'info', kop: 'Afgelegde afstand',
        tekst: 'Ongeveer ' + n1(a.afstandKm) + ' km, uit de snelheid per seconde opgeteld' +
          (gemKmh ? ', gemiddeld ' + Math.round(gemKmh) + ' km/u terwijl de auto reed' : '') + '.' +
          (a.gaten > 30 ? ' Let op: ' + a.gaten + ' regels zonder data — die seconden tellen niet mee, ' +
            'dus de werkelijke afstand ligt hoger.' : '') });
    }

    // ── gaten ──
    if (a.gaten > 0) {
      var ernstig = a.langsteGat >= 30;
      uit.push({ soort: ernstig ? 'let' : 'info', kop: 'Gaten in de log',
        tekst: a.gaten + ' van de ' + a.regels + ' regels kwamen binnen zonder één sensorwaarde' +
          ' (' + Math.round(a.gaten / a.regels * 100) + '%). Langste aaneengesloten gat: ' +
          a.langsteGat + ' seconden.' +
          (ernstig ? ' Een gat van een halve minuut of meer wijst op een adapter die losliet of een bus die wegviel.' : '') });
    }

    // ── koelwater ──
    var kw = a.pids['0105'];
    if (kw && kw.n > 20) {
      var piek = kw.max;
      uit.push({ soort: piek >= 110 ? 'let' : 'ok', kop: 'Koelwatertemperatuur',
        tekst: 'Gemiddeld ' + Math.round(kw.som / kw.n) + ' °C, piek ' + Math.round(piek) +
          ' °C over ' + kw.n + ' metingen.' +
          (piek >= 110 ? ' Boven 110 °C is de moeite waard om na te lopen — kijk in de grafiek hieronder wanneer die piek viel.'
                       : ' Dat blijft binnen wat een warme motor normaal doet.') });
    }

    // ── de klimvergelijking ──
    if (a.klim.n >= MIN_KLIMREGELS && a.rij.n >= MIN_KLIMREGELS) {
      var gK = gem(a.klim.koelwater), gR = gem(a.rij.koelwater);
      if (gK !== null && gR !== null) {
        var verschil = gK - gR;
        uit.push({ soort: verschil >= 8 ? 'let' : 'ok', kop: 'Klimmen tegen gewoon rijden',
          tekst: 'Tijdens klim was het koelwater gemiddeld ' + Math.round(gK) + ' °C (' + a.klim.n +
            ' regels), tijdens gewoon rijden ' + Math.round(gR) + ' °C (' + a.rij.n + ' regels) — ' +
            (verschil >= 0 ? 'een stijging van ' + n1(verschil) : 'een daling van ' + n1(-verschil)) + ' °C.' +
            (verschil >= 8 ? ' Meer dan 8 °C erbij onder belasting is het bekijken waard: koelcapaciteit, thermostaat of een vervuilde radiateur.'
                           : ' Dat is wat je van een gezond koelsysteem onder belasting verwacht.') });
      }
    } else if (a.segTel['klim']) {
      uit.push({ soort: 'info', kop: 'Klimmen tegen gewoon rijden',
        tekst: 'Er staat ' + a.segTel['klim'] + ' seconden klim in deze sessie, te weinig om naast het ' +
          'gewone rijden te leggen (daar zijn er minimaal ' + MIN_KLIMREGELS + ' van beide voor nodig). ' +
          'Een langere zware klim vult dit vanzelf.' });
    }

    // ── toerental / belasting ──
    var rpm = a.pids['010C'];
    if (rpm && rpm.n > 20) {
      uit.push({ soort: 'info', kop: 'Toerental',
        tekst: 'Gemiddeld ' + Math.round(rpm.som / rpm.n) + ' tpm, hoogste ' + Math.round(rpm.max) + ' tpm.' });
    }

    // ── dekking ──
    var pidN = Object.keys(a.pids).length;
    if (pidN) {
      var mager = Object.keys(a.pids).filter(function (p) { return a.pids[p].n < a.regels * 0.5; });
      uit.push({ soort: mager.length ? 'let' : 'ok', kop: 'Dekking',
        tekst: pidN + ' sensoren staan in deze opname.' +
          (mager.length ? ' Daarvan zijn er ' + mager.length + ' in minder dan de helft van de regels ' +
            'aanwezig — die stonden niet de hele rit in je selectie, dus hun gemiddelden gaan over een deel van de rit.'
                        : ' Alle sensoren zijn in ruim de helft van de regels aanwezig.') });
    }
    var weg = Object.keys(a.nietPlausibel || {});
    if (weg.length) {
      uit.push({ soort: 'info', kop: 'Weggelaten',
        tekst: weg.length + ' sensor' + (weg.length === 1 ? '' : 'en') + ' in deze opname pas' + (weg.length === 1 ? 't' : 'sen') +
          ' niet bij dit voertuig (' + weg.slice(0, 4).map(naam).join(', ') + (weg.length > 4 ? ', …' : '') +
          ') en tell' + (weg.length === 1 ? 't' : 'en') + ' niet mee.' });
    }

    if (a.markeringen.length) {
      uit.push({ soort: 'info', kop: 'Eigen markeringen',
        tekst: a.markeringen.length + ' stuks: ' +
          a.markeringen.slice(0, 5).map(function (m) { return '“' + m.tekst + '” (' + klok(m.t) + ')'; }).join(', ') +
          (a.markeringen.length > 5 ? ', …' : '') + '.' });
    }

    return uit;
  }

  /* ═══════════════════ GRAFIEK ═══════════════════ */
  /* Eén lijn per kernsensor. De schaal komt uit de reeks zelf en elk
     label noemt een waarde die de lijn ook echt haalt. */

  function spark(reeks, kleur, pid) {
    var B = 44, H = 62, R = 6, L = 0;   // breedte in %, hoogte in px
    if (!reeks || reeks.length < 2)
      return '<div class="blv-geen">te weinig metingen voor een lijn</div>';

    var vmin = reeks[0].v, vmax = reeks[0].v, tmin = reeks[0].t, tmax = reeks[0].t;
    for (var i = 1; i < reeks.length; i++) {
      if (reeks[i].v < vmin) vmin = reeks[i].v;
      if (reeks[i].v > vmax) vmax = reeks[i].v;
      if (reeks[i].t < tmin) tmin = reeks[i].t;
      if (reeks[i].t > tmax) tmax = reeks[i].t;
    }
    var spanV = (vmax - vmin) || 1;
    var spanT = (tmax - tmin) || 1;
    var W = 300;

    var pts = reeks.map(function (p) {
      var x = ((p.t - tmin) / spanT) * (W - 2) + 1;
      var y = H - R - ((p.v - vmin) / spanV) * (H - R - R);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    return '<svg class="blv-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
        'role="img" aria-label="' + esc(naam(pid) + ' over de rit') + '">' +
        '<polyline points="' + pts + '" fill="none" stroke="' + kleur +
          '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* ═══════════════════ SCHIL ═══════════════════ */

  function stijl() {
    if (el('blvStijl')) return;
    var st = document.createElement('style');
    st.id = 'blvStijl';
    st.textContent = [
      '#blvOv{display:none;position:fixed;inset:0;z-index:var(--z-modal-hoog,9800);',
        'background:rgba(4,8,14,.88);align-items:flex-start;justify-content:center;',
        'padding:14px;overflow:auto;font-family:var(--f,system-ui,sans-serif)}',
      '.blv-paneel{width:100%;max-width:720px;background:var(--sur,#151b24);',
        'border:1.5px solid var(--bd,#26303b);border-radius:16px;padding:18px;',
        'color:var(--tx,#e6e9ef);margin:auto}',
      '.blv-kop{display:flex;align-items:center;gap:9px;margin-bottom:3px}',
      '.blv-kop b{font-size:16px}',
      '.blv-x{background:none;border:0;color:var(--tx,#e6e9ef);font-size:22px;cursor:pointer;line-height:1}',
      '.blv-uitleg{font-size:12.5px;line-height:1.6;opacity:.8;margin:8px 0 14px}',
      '.blv-sec{margin:18px 0 0}',
      '.blv-sectitel{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;',
        'color:var(--tx3,#8b95a6);margin-bottom:8px}',
      '.blv-knoprij{display:flex;gap:8px;flex-wrap:wrap}',
      '.blv-btn{flex:1;min-width:128px;padding:11px;border-radius:10px;border:1px solid var(--bd,#26303b);',
        'background:var(--sur2,#0e1420);color:var(--tx,#e6e9ef);font-weight:700;font-size:13px;',
        'cursor:pointer;font-family:inherit}',
      '.blv-btn:hover{border-color:#3d9be9}',
      '.blv-btn.pri{border:0;background:linear-gradient(135deg,#0e9f6e,#1a6fff);color:#fff;font-weight:800}',
      '.blv-sesrij{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}',
      '.blv-ses{font-size:11.5px;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;',
        'border:1px solid var(--bd,#26303b);background:var(--sur2,#0e1420);color:var(--tx2,#aab4c2);font-family:inherit}',
      '.blv-ses.op{border-color:#3d9be9;color:#7cc0f5}',
      '.blv-cijfers{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px}',
      '.blv-tegel{background:var(--sur2,#0e1420);border:1px solid var(--bd,#26303b);border-radius:11px;padding:10px 12px}',
      '.blv-tegel-n{font-size:20px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums}',
      '.blv-tegel-l{font-size:10.5px;opacity:.66;margin-top:2px;line-height:1.35}',
      '.blv-tijdbalk{display:flex;height:16px;border-radius:8px;overflow:hidden;background:#2b3442;margin-bottom:7px}',
      '.blv-tijdbalk span{display:block;height:100%}',
      '.blv-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;opacity:.82}',
      '.blv-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}',
      '.blv-bev{border-radius:11px;padding:9px 12px;margin-bottom:7px;border:1px solid}',
      '.blv-bev.ok{background:rgba(79,156,90,.08);border-color:rgba(79,156,90,.3)}',
      '.blv-bev.let{background:rgba(224,151,47,.09);border-color:rgba(224,151,47,.34)}',
      '.blv-bev.info{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.1)}',
      '.blv-bev b{font-size:12.5px;display:block;margin-bottom:2px}',
      '.blv-bev.ok b{color:#6cc47c}.blv-bev.let b{color:#e8ab52}.blv-bev.info b{color:var(--tx,#e6e9ef)}',
      '.blv-bev-t{font-size:12px;line-height:1.6;opacity:.86}',
      '.blv-graf{background:var(--sur2,#0e1420);border:1px solid var(--bd,#26303b);border-radius:11px;',
        'padding:10px 12px;margin-bottom:8px}',
      '.blv-graf-k{display:flex;align-items:baseline;gap:8px;font-size:12px;margin-bottom:4px}',
      '.blv-graf-k b{font-size:12.5px}',
      '.blv-graf-k span{opacity:.62;font-size:11px;font-variant-numeric:tabular-nums;margin-left:auto}',
      '.blv-spark{width:100%;height:62px;display:block}',
      '.blv-geen{font-size:11px;opacity:.55;padding:14px 0}',
      '.blv-prij{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:7px 0;',
        'border-bottom:1px solid rgba(255,255,255,.055);font-size:12px}',
      '.blv-prij:last-child{border-bottom:0}',
      '.blv-prij b{font-weight:700}',
      '.blv-prij-v{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;font-weight:700}',
      '.blv-prij-m{grid-column:1/-1;font-size:10.5px;opacity:.6;font-variant-numeric:tabular-nums}',
      '.blv-dek{height:3px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:3px;overflow:hidden}',
      '.blv-dek span{display:block;height:100%;background:#3d9be9}',
      '.blv-leeg{font-size:12px;opacity:.6;padding:16px 2px;line-height:1.65}',
      '@media(max-width:420px){.blv-paneel{padding:14px}}'
    ].join('');
    document.head.appendChild(st);
  }

  function bouw() {
    stijl();
    var o = document.createElement('div');
    o.id = 'blvOv';
    o.innerHTML =
      '<div class="blv-paneel">' +
        '<div class="blv-kop">' +
          '<span style="font-size:19px">📈</span>' +
          '<b>Bulk-analyse</b>' +
          '<span style="flex:1"></span>' +
          '<button class="blv-x" id="blvX" aria-label="Sluiten">×</button>' +
        '</div>' +
        '<div class="blv-uitleg">' +
          'De bulk-recorder legt tijdens het rijden elke seconde een momentopname weg — passief, ' +
          'zonder de OBD-bus aan te raken. Dit scherm leest die opname terug en vertelt wat erin staat: ' +
          'waar de tijd in ging, wat de sensoren deden, en waar de log gaten heeft. Er wordt hier niets ' +
          'gemeten; bedienen doe je in het recorder-venster.' +
        '</div>' +
        '<div class="blv-knoprij" style="margin-bottom:4px">' +
          '<button class="blv-btn pri" id="blvVerv">↻ Opnieuw inlezen</button>' +
          '<button class="blv-btn" id="blvRec">⏺ Recorder bedienen</button>' +
          '<button class="blv-btn" id="blvExp">⤓ Exporteer NDJSON</button>' +
        '</div>' +
        '<div id="blvBody"><div class="blv-leeg">Inlezen…</div></div>' +
      '</div>';
    document.body.appendChild(o);

    el('blvX').addEventListener('click', sluit);
    o.addEventListener('click', function (e) { if (e.target === o) sluit(); });
    el('blvVerv').addEventListener('click', function () { laad(true); });
    el('blvRec').addEventListener('click', function () {
      try { if (window.PLBulk && PLBulk.open) { sluit(); PLBulk.open(); } }
      catch (e) { console.warn('recorder openen mislukt:', e); melding('Recorder-venster niet beschikbaar'); }
    });
    el('blvExp').addEventListener('click', function () {
      try { if (window.PLBulk && PLBulk.exporteer) PLBulk.exporteer(); }
      catch (e) { console.warn('export mislukt:', e); melding('Export mislukt'); }
    });
    return o;
  }

  /* ═══════════════════ LADEN ═══════════════════ */

  async function laad(opnieuw) {
    if (_bezig) return;
    _bezig = true;
    var body = el('blvBody');
    if (body && (opnieuw || !_sessies.length)) body.innerHTML = '<div class="blv-leeg">Inlezen…</div>';
    try {
      if (!window.PLBulk || !PLBulk.lees) throw new Error('PLBulk.lees ontbreekt');
      var blokken = await PLBulk.lees();

      // Blokken naar sessies. Elk blok draagt zijn sessie-id; de regels
      // zelf krijgen dat pas bij de export mee, dus hier plakken we het
      // erbij in plaats van het per regel te verwachten.
      var perSessie = {};
      (blokken || []).forEach(function (b) {
        var sid = b.sessie || 'onbekend';
        if (!perSessie[sid]) perSessie[sid] = [];
        var r = b.regels || [];
        for (var i = 0; i < r.length; i++) perSessie[sid].push(r[i]);
      });

      _sessies = Object.keys(perSessie).map(function (sid) {
        return analyseer(sid, perSessie[sid]);
      }).filter(function (a) { return a.regels > 0; });
      _sessies.sort(function (a, b) { return b.van - a.van; });

      if (!_gekozen || !_sessies.some(function (s) { return s.sessie === _gekozen; }))
        _gekozen = _sessies.length ? _sessies[0].sessie : null;

      teken();
    } catch (e) {
      console.warn('bulk inlezen mislukt:', e);
      if (body) body.innerHTML = '<div class="blv-leeg">Inlezen mislukt: ' + esc(e && e.message || e) +
        '<br><br>De recorder bewaart in IndexedDB. Is er nog nooit een opname gestart, dan is er ook niets te lezen.</div>';
    } finally { _bezig = false; }
  }

  function teken() {
    var body = el('blvBody');
    if (!body) return;

    if (!_sessies.length) {
      body.innerHTML = '<div class="blv-leeg">Er staat nog geen opname in de opslag.<br><br>' +
        'Open het recorder-venster, druk op start en rijd een stuk. Elke seconde komt er één regel bij; ' +
        'na een minuut of wat staat hier al een analyse.</div>';
      return;
    }

    var a = _sessies.filter(function (s) { return s.sessie === _gekozen; })[0] || _sessies[0];
    var tijdMs = (a.tot - a.van) || 0;
    var h = [];

    // ── sessiekiezer ──
    if (_sessies.length > 1) {
      h.push('<div class="blv-sec"><div class="blv-sectitel">Sessies (' + _sessies.length + ')</div>' +
        '<div class="blv-sesrij">' + _sessies.map(function (s) {
          return '<button class="blv-ses' + (s.sessie === a.sessie ? ' op' : '') +
            '" data-ses="' + esc(s.sessie) + '">' + esc(klok(s.van)) + ' · ' + esc(duur(s.tot - s.van)) + '</button>';
        }).join('') + '</div></div>');
    }

    // ── cijfers ──
    h.push('<div class="blv-sec"><div class="blv-sectitel">Deze sessie in cijfers</div><div class="blv-cijfers">' +
      tegel(duur(tijdMs), 'duur van de<br>opname') +
      tegel(a.regels.toLocaleString('nl-NL'), 'regels<br>op 1 Hz') +
      tegel(n1(a.afstandKm) + ' km', 'afstand uit de<br>snelheid geteld') +
      tegel(Object.keys(a.pids).length, 'sensoren in<br>de opname') +
      tegel(a.gaten, 'regels zonder<br>enige data') +
      '</div></div>');

    // ── tijdbalk ──
    h.push('<div class="blv-sec"><div class="blv-sectitel">Waar de tijd in ging</div>' +
      '<div class="blv-tijdbalk">' + a.segRij.map(function (s) {
        return '<span style="width:' + (s.n / a.regels * 100).toFixed(3) + '%;background:' +
          (SEGKLEUR[s.seg] || SEGKLEUR.onbekend) + '" title="' +
          esc((SEGNAAM[s.seg] || s.seg) + ' — ' + duur(s.n * 1000)) + '"></span>';
      }).join('') + '</div><div class="blv-leg">' +
      Object.keys(a.segTel).sort(function (x, y) { return a.segTel[y] - a.segTel[x]; }).map(function (s) {
        return '<span><i style="background:' + (SEGKLEUR[s] || SEGKLEUR.onbekend) + '"></i>' +
          esc(SEGNAAM[s] || s) + ' — ' + duur(a.segTel[s] * 1000) + '</span>';
      }).join('') + '</div>' +
      '<div class="blv-uitleg" style="margin:7px 0 0">De balk loopt op volgorde van de rit, ' +
      'niet gegroepeerd: je ziet dus wanneer de klim viel, niet alleen hoeveel het er was.</div></div>');

    // ── conclusies ──
    h.push('<div class="blv-sec"><div class="blv-sectitel">Wat deze rit je vertelt</div>' +
      conclusies(a).map(function (c) {
        return '<div class="blv-bev ' + c.soort + '"><b>' + esc(c.kop) + '</b>' +
          '<div class="blv-bev-t">' + esc(c.tekst) + '</div></div>';
      }).join('') + '</div>');

    // ── grafieken ──
    var grafiek = KERN.filter(function (k) { return a.reeks[k.pid] && a.reeks[k.pid].length > 1; });
    if (grafiek.length) {
      h.push('<div class="blv-sec"><div class="blv-sectitel">Verloop over de rit</div>' +
        grafiek.map(function (k) {
          var p = a.pids[k.pid];
          var r = a.reeks[k.pid];
          var lo = r[0].v, hi = r[0].v;
          r.forEach(function (x) { if (x.v < lo) lo = x.v; if (x.v > hi) hi = x.v; });
          return '<div class="blv-graf">' +
            '<div class="blv-graf-k"><b style="color:' + k.kleur + '">' + esc(naam(k.pid)) + '</b>' +
              '<span>' + esc(n1(lo) + ' – ' + n1(hi) + ' ' + eenheid(k.pid)) +
              (p ? ' · gem ' + n1(p.som / p.n) : '') + '</span></div>' +
            spark(r, k.kleur, k.pid) +
          '</div>';
        }).join('') + '</div>');
    }

    // ── alle sensoren ──
    var pids = Object.keys(a.pids).sort(function (x, y) { return a.pids[y].n - a.pids[x].n; });
    h.push('<div class="blv-sec"><div class="blv-sectitel">Alle sensoren in deze opname</div>' +
      pids.map(function (pid) {
        var p = a.pids[pid];
        var dek = Math.min(100, p.n / a.regels * 100);
        return '<div class="blv-prij">' +
          '<div><b>' + esc(naam(pid)) + '</b></div>' +
          '<div class="blv-prij-v">' + esc(n1(p.som / p.n)) + ' <span style="font-size:10px;opacity:.6">' +
            esc(eenheid(pid)) + '</span></div>' +
          '<div class="blv-prij-m">' + esc(n1(p.min)) + ' – ' + esc(n1(p.max)) +
            ' · ' + p.n.toLocaleString('nl-NL') + ' metingen · ' + Math.round(dek) + '% dekking' +
            '<div class="blv-dek"><span style="width:' + dek.toFixed(1) + '%"></span></div></div>' +
        '</div>';
      }).join('') + '</div>');

    body.innerHTML = h.join('');

    var rij = body.querySelector('.blv-sesrij');
    if (rij) rij.addEventListener('click', function (e) {
      var b = e.target.closest('.blv-ses');
      if (!b) return;
      _gekozen = b.getAttribute('data-ses');
      teken();
    });
  }

  function tegel(n, label) {
    return '<div class="blv-tegel"><div class="blv-tegel-n">' + esc(n) +
      '</div><div class="blv-tegel-l">' + label + '</div></div>';
  }

  /* ═══════════════════ OPEN / DICHT ═══════════════════ */

  function open() {
    var o = el('blvOv') || bouw();
    o.style.display = 'flex';
    laad(false);
  }
  function sluit() {
    var o = el('blvOv');
    if (o) o.style.display = 'none';
  }

  window.PLBulkUI = {
    open: open, sluit: sluit,
    _analyseer: analyseer, _conclusies: conclusies, _dun: dun
  };
  window.openBulkAnalyse = open;

})();
