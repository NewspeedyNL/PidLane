/* ═══════════════════════════════════════════════════════════════════
   pidlane-bulk.js — PLBulk: bulk-datarecorder voor lange ritten
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS
   Een PASSIEVE logger. Hij leest 1x per seconde de momentopname uit
   `pidVals` en schrijft die weg. Hij raakt de OBD-bus NOOIT aan: geen
   PLBus.claim, geen sendCmd, geen eigen poll. Precies hetzelfde patroon
   als caravanTick() in pidlane-caravan.js.

   WAAROM PASSIEF
   Twee passieve lezers vechten niet. Daardoor blijft ALLES beschikbaar
   terwijl de recorder loopt: caravan-rittracker, neon, PID-paneel,
   rapporten, Total Check. Je hoeft niet te pauzeren om PidLane normaal
   te gebruiken. Pauzeren kan wel — dan blijft de sessie open en komt er
   een segmentmarkering in de log.

   Voor de ACTIEVE kant (PID-sweep, CALID/CVN, readiness, bitmaps,
   DTC-modes) bestaat vlFullSurvey() in pidlane-veldlab.js al. Die
   claimt netjes het busslot. Draai die stilstaand bij elke tankstop;
   deze module doet het rijgedeelte.

   OPSLAG
   IndexedDB, niet localStorage. 10 uur x 1 Hz x ~30 PIDs past voor geen
   meter in de ~5 MB die localStorage biedt, en veldlab zit daar al voor
   een flink deel in. IndexedDB wordt nergens anders in PidLane gebruikt;
   deze module is de enige gebruiker en ruimt zijn eigen boel op.

   Regels in geheugen bufferen, elke FLUSH_MS wegschrijven in een blok.
   Sessiemeta staat in localStorage, zodat een herstart (telefoon in de
   hitte, browser die de tab weggooit) de sessie hervat in plaats van
   weggooit.

   CRASHVEILIG
   Alles staat in try/catch. Valt de recorder om, dan loopt de rest van
   de app gewoon door. Omgekeerd: als er even geen data is (adapter weg,
   tunnel) blijft de sessie open en gaan er lege regels in met een
   markering, zodat je in de export ziet WAAR het gat zat.

   Admin-only. Zichtbaar via het kebabmenu.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ═══════════════════ INSTELLINGEN ═══════════════════ */

var TICK_MS      = 1000;      // meetfrequentie: 1 Hz, zelfde als caravan
var FLUSH_MS     = 30000;     // elke 30 s een blok naar IndexedDB
var BUF_MAX      = 120;       // of eerder, als de buffer vol loopt
var DB_NAAM      = 'pidlane-bulk';
var DB_VERSIE    = 1;
var STORE        = 'blokken';
var META_KEY     = 'pl_bulk_sessie';   // localStorage: lopende sessie
var WAARSCHUW_MB = 200;                // boven deze schatting: waarschuwen

/* Segmentdetectie — drempels. Bewust ruim: liever een segment missen dan
   de hele rit in flip-flop tussen twee labels. */
var SEG = {
  stilMinSec  : 120,   // <2 km/h langer dan dit -> 'stil' (file of pauze)
  stilKmh     : 2,
  klimLoad    : 70,    // motorbelasting % ...
  klimMinKmh  : 45,    // ... bij deze snelheid ...
  klimMinSec  : 30,    // ... aangehouden -> 'klim'
  motorUitSec : 45     // geen rpm zo lang -> 'motor-uit' (tankstop)
};

/* ═══════════════════ STAAT ═══════════════════ */

var S = {
  actief    : false,
  gepauzeerd: false,
  sessieId  : null,
  gestart   : 0,
  timer     : null,
  flushTimer: null,
  buf       : [],       // regels die nog niet weggeschreven zijn
  nRegels   : 0,        // totaal weggeschreven + gebufferd
  nBlokken  : 0,
  bytes     : 0,        // ruwe schatting
  seg       : 'start',
  segSinds  : 0,
  _stilSinds: 0,
  _klimSinds: 0,
  _motorUit : 0,
  _laatsteTick: 0,
  gps       : null,     // {lat,lon,alt,acc,t}
  gpsWatch  : null,
  db        : null,
  fout      : ''
};

/* ═══════════════════ KLEINE HULPJES ═══════════════════ */

function el(id) { try { return document.getElementById(id); } catch (e) { return null; } }

function toast(m) {
  try { if (typeof showToast === 'function') { showToast(m); return; } } catch (e) {}
  try { console.log('[PLBulk] ' + m); } catch (e) {}
}

function logg(m, lvl) {
  try { if (typeof log === 'function') { log('📼 ' + m, lvl || 'info'); return; } } catch (e) {}
  try { console.log('[PLBulk] ' + m); } catch (e) {}
}

function magIk() {
  try { if (typeof isAdmin === 'function') return !!isAdmin(); } catch (e) {}
  return false;
}

function nu() { return Date.now(); }

function tijdKort(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var u = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  var r = s % 60;
  if (u > 0) return u + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  return m + ':' + String(r).padStart(2, '0');
}

function mb(bytes) { return (bytes / 1048576).toFixed(1); }

/* Momentopname van alle PID-waarden die de app op dit moment heeft.
   We kopiëren wat er IS — niet wat we denken dat er zou moeten zijn.
   Zo logt de recorder automatisch mee met wat de scheduler doet. */
function pakPidVals() {
  var uit = {};
  try {
    if (typeof pidVals === 'undefined' || !pidVals) return uit;
    for (var k in pidVals) {
      if (!Object.prototype.hasOwnProperty.call(pidVals, k)) continue;
      var v = pidVals[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'number') { if (isFinite(v)) uit[k] = Math.round(v * 1000) / 1000; }
      else if (typeof v === 'string' || typeof v === 'boolean') uit[k] = v;
    }
  } catch (e) {}
  return uit;
}

function getPid(p) {
  try { if (typeof pidVals !== 'undefined' && pidVals) return pidVals[p]; } catch (e) {}
  return undefined;
}

/* ═══════════════════ INDEXEDDB ═══════════════════ */
/* Bewust minimaal: één store, autoIncrement, append-only. Geen indexen,
   geen migraties. Wat erin gaat is een blok regels; wat eruit komt is
   diezelfde blokken in volgorde. */

function dbOpen() {
  return new Promise(function (res, rej) {
    try {
      if (!('indexedDB' in window) || !window.indexedDB) { rej(new Error('IndexedDB niet beschikbaar')); return; }
      var rq = window.indexedDB.open(DB_NAAM, DB_VERSIE);
      rq.onupgradeneeded = function (ev) {
        try {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
        } catch (e) {}
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror   = function () { rej(rq.error || new Error('open mislukt')); };
      rq.onblocked = function () { rej(new Error('IndexedDB geblokkeerd')); };
    } catch (e) { rej(e); }
  });
}

async function dbKlaar() {
  if (S.db) return S.db;
  S.db = await dbOpen();
  return S.db;
}

function dbSchrijf(blok) {
  return new Promise(function (res, rej) {
    try {
      var tx = S.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(blok);
      tx.oncomplete = function () { res(true); };
      tx.onerror    = function () { rej(tx.error || new Error('schrijffout')); };
      tx.onabort    = function () { rej(tx.error || new Error('afgebroken')); };
    } catch (e) { rej(e); }
  });
}

function dbAlles() {
  return new Promise(function (res, rej) {
    try {
      var tx = S.db.transaction(STORE, 'readonly');
      var rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = function () { res(rq.result || []); };
      rq.onerror   = function () { rej(rq.error || new Error('leesfout')); };
    } catch (e) { rej(e); }
  });
}

function dbWis() {
  return new Promise(function (res, rej) {
    try {
      var tx = S.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = function () { res(true); };
      tx.onerror    = function () { rej(tx.error || new Error('wisfout')); };
    } catch (e) { rej(e); }
  });
}

/* ═══════════════════ GPS ═══════════════════ */
/* Hoogte is het halve verhaal bij klimbelasting. Optioneel: geen GPS is
   geen probleem, dan blijft het veld gewoon leeg. */

function gpsStart() {
  try {
    if (!navigator.geolocation) return;
    S.gpsWatch = navigator.geolocation.watchPosition(function (p) {
      try {
        S.gps = {
          lat: Math.round(p.coords.latitude  * 1e5) / 1e5,
          lon: Math.round(p.coords.longitude * 1e5) / 1e5,
          alt: (p.coords.altitude === null || p.coords.altitude === undefined)
                 ? null : Math.round(p.coords.altitude),
          acc: Math.round(p.coords.accuracy || 0),
          t  : nu()
        };
      } catch (e) {}
    }, function () { /* geweigerd of geen fix: stil doorgaan */ },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  } catch (e) {}
}

function gpsStop() {
  try { if (S.gpsWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(S.gpsWatch); } catch (e) {}
  S.gpsWatch = null;
}

/* ═══════════════════ SEGMENTDETECTIE ═══════════════════ */
/* Automatisch, want tijdens het rijden met een caravan druk je niks in.
   Volgorde is een prioriteitsladder: motor-uit wint van stil, stil wint
   van klim, klim wint van rijden. */

function bepaalSegment() {
  var t = nu();
  var kmh = getPid('010D');
  var rpm = getPid('010C');
  var load = getPid('0104');

  var heeftRpm = (typeof rpm === 'number' && isFinite(rpm) && rpm > 200);
  var heeftKmh = (typeof kmh === 'number' && isFinite(kmh));

  /* motor uit */
  if (!heeftRpm) { if (!S._motorUit) S._motorUit = t; }
  else S._motorUit = 0;
  if (S._motorUit && (t - S._motorUit) / 1000 >= SEG.motorUitSec) return 'motor-uit';

  /* stilstand: file of pauze langs de weg */
  if (heeftKmh && kmh <= SEG.stilKmh) { if (!S._stilSinds) S._stilSinds = t; }
  else S._stilSinds = 0;
  if (S._stilSinds && (t - S._stilSinds) / 1000 >= SEG.stilMinSec) return 'stil';

  /* klim: hoge belasting die aanhoudt bij reissnelheid */
  var klimNu = (typeof load === 'number' && load >= SEG.klimLoad &&
                heeftKmh && kmh >= SEG.klimMinKmh);
  if (klimNu) { if (!S._klimSinds) S._klimSinds = t; }
  else S._klimSinds = 0;
  if (S._klimSinds && (t - S._klimSinds) / 1000 >= SEG.klimMinSec) return 'klim';

  if (heeftKmh && kmh > SEG.stilKmh) return 'rijden';
  return 'onbekend';
}

/* ═══════════════════ DE TICK ═══════════════════ */

function tick() {
  if (!S.actief || S.gepauzeerd) return;
  try {
    var t = nu();
    var seg = bepaalSegment();
    if (seg !== S.seg) {
      logg('segment: ' + S.seg + ' → ' + seg);
      S.seg = seg;
      S.segSinds = t;
    }

    var vals = pakPidVals();
    var regel = {
      t   : t,
      seg : seg,
      n   : Object.keys(vals).length,
      v   : vals
    };
    if (S.gps && (t - S.gps.t) < 30000) regel.g = S.gps;
    /* Geen enkele PID-waarde binnen: markeer het gat expliciet, zodat je
       in de export ziet WAAR de adapter of de bus wegviel. */
    if (regel.n === 0) regel.gat = 1;

    S.buf.push(regel);
    S.nRegels++;
    S._laatsteTick = t;

    if (S.buf.length >= BUF_MAX) flush();
    chipBij();
  } catch (e) {
    S.fout = String(e && e.message || e);
  }
}

/* ═══════════════════ FLUSH ═══════════════════ */

async function flush() {
  if (!S.buf.length) return;
  var blok = {
    sessie : S.sessieId,
    van    : S.buf[0].t,
    tot    : S.buf[S.buf.length - 1].t,
    regels : S.buf
  };
  S.buf = [];
  try {
    await dbKlaar();
    await dbSchrijf(blok);
    S.nBlokken++;
    try { S.bytes += JSON.stringify(blok).length; } catch (e) {}
    if (S.bytes > WAARSCHUW_MB * 1048576) {
      toast('Bulk-recorder: al ' + mb(S.bytes) + ' MB opgeslagen — exporteer tussendoor');
      S.bytes = 0;   // niet blijven zeuren
    }
    metaBewaar();
  } catch (e) {
    /* Wegschrijven mislukt: regels teruggeven aan de buffer, maar begrensd,
       anders vreet een kapotte DB al het geheugen op. */
    S.fout = String(e && e.message || e);
    if (S.buf.length < 2000) S.buf = blok.regels.concat(S.buf);
    logg('wegschrijven mislukt: ' + S.fout, 'warn');
  }
}

/* ═══════════════════ SESSIEMETA (herstart overleven) ═══════════════════ */

function metaBewaar() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({
      id      : S.sessieId,
      gestart : S.gestart,
      actief  : S.actief,
      pauze   : S.gepauzeerd,
      regels  : S.nRegels,
      blokken : S.nBlokken,
      seg     : S.seg
    }));
  } catch (e) {}
}

function metaLees() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { return null; }
}

function metaWeg() {
  try { localStorage.removeItem(META_KEY); } catch (e) {}
}

/* ═══════════════════ ZWEVENDE CHIP ═══════════════════ */
/* Zelfde baan als de wizard-chip en de totalcheck-chip: #fabLane regelt
   positie en stapeling, de chip zelf doet alleen zijn eigen uiterlijk. */

function chipMaak() {
  var c = el('blkChipFab');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'blkChipFab';
  c.style.cssText = 'display:none;align-items:center;gap:7px;background:var(--sur,#151b24);' +
    'border:1.5px solid var(--bd,#26303b);color:var(--tx,#e6e9ef);border-radius:22px;' +
    'padding:7px 13px;font-family:var(--f);font-size:13px;font-weight:800;' +
    'box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;user-select:none;' +
    '-webkit-tap-highlight-color:transparent';
  c.title = 'Bulk-recorder openen';
  c.onclick = function () { openDash(); };
  var lane = el('fabLane');
  if (lane) lane.appendChild(c); else document.body.appendChild(c);
  return c;
}

function chipBij() {
  var c = el('blkChipFab');
  if (!c) return;
  if (!S.actief) { c.style.display = 'none'; return; }
  c.style.display = 'flex';
  var bol = S.gepauzeerd ? '⏸️' : '🔴';
  var tekst = S.gepauzeerd ? 'gepauzeerd' : tijdKort(nu() - S.gestart);
  c.innerHTML = '<span>' + bol + '</span><span>Recorder ' + tekst + '</span>' +
    '<span style="opacity:.7;font-weight:600">' + S.nRegels + '</span>';
}

function chipWeg() {
  var c = el('blkChipFab');
  if (c) c.style.display = 'none';
}

/* ═══════════════════ PUBLIEKE BEDIENING ═══════════════════ */

async function start(stil) {
  if (!magIk()) { toast('Alleen voor admin'); return false; }
  if (S.actief) { toast('Recorder loopt al'); return false; }
  try { await dbKlaar(); }
  catch (e) { toast('Opslag niet beschikbaar: ' + (e && e.message || e)); return false; }

  S.actief = true;
  S.gepauzeerd = false;
  S.sessieId = 'blk-' + new Date().toISOString().replace(/[:.]/g, '-');
  S.gestart = nu();
  S.buf = [];
  S.nRegels = 0;
  S.nBlokken = 0;
  S.bytes = 0;
  S.seg = 'start';
  S.segSinds = S.gestart;
  S._stilSinds = S._klimSinds = S._motorUit = 0;
  S.fout = '';

  gpsStart();
  S.timer      = setInterval(tick, TICK_MS);
  S.flushTimer = setInterval(function () { flush(); }, FLUSH_MS);
  chipMaak(); chipBij();
  metaBewaar();
  logg('bulk-recorder gestart (' + S.sessieId + ')', 'ok');
  if (!stil) toast('Recorder loopt — PidLane blijft gewoon bruikbaar');
  return true;
}

function pauzeer() {
  if (!S.actief || S.gepauzeerd) return;
  S.gepauzeerd = true;
  S.buf.push({ t: nu(), seg: 'pauze', n: 0, v: {}, mark: 'pauze-start' });
  flush();
  metaBewaar(); chipBij(); dashBij();
  logg('gepauzeerd', 'info');
}

function hervat() {
  if (!S.actief || !S.gepauzeerd) return;
  S.gepauzeerd = false;
  S._stilSinds = S._klimSinds = S._motorUit = 0;   // drempels opnieuw opbouwen
  S.buf.push({ t: nu(), seg: 'hervat', n: 0, v: {}, mark: 'pauze-eind' });
  metaBewaar(); chipBij(); dashBij();
  logg('hervat', 'ok');
}

async function stop() {
  if (!S.actief) return;
  S.actief = false;
  S.gepauzeerd = false;
  if (S.timer)      { clearInterval(S.timer);      S.timer = null; }
  if (S.flushTimer) { clearInterval(S.flushTimer); S.flushTimer = null; }
  gpsStop();
  await flush();
  metaWeg();
  chipWeg(); dashBij();
  logg('gestopt — ' + S.nRegels + ' regels in ' + S.nBlokken + ' blokken', 'ok');
  toast('Recorder gestopt. Vergeet niet te exporteren.');
}

/* Handmatige markering — één knop, alleen te gebruiken als je stilstaat. */
function markeer(tekst) {
  if (!S.actief) return;
  S.buf.push({ t: nu(), seg: S.seg, n: 0, v: {}, mark: String(tekst || 'markering').slice(0, 60) });
  toast('Markering gezet');
  dashBij();
}

/* ═══════════════════ EXPORT ═══════════════════ */
/* NDJSON: één regel JSON per meting. Groeit lineair, is met elke tekst-
   editor te openen, en een half kapot bestand blijft voor 99% leesbaar —
   in tegenstelling tot één grote JSON-array. */

async function exporteer() {
  try {
    await flush();
    await dbKlaar();
    var blokken = await dbAlles();
    if (!blokken.length) { toast('Niets om te exporteren'); return; }

    var uit = [];
    uit.push(JSON.stringify({
      type   : 'pidlane-bulk',
      schema : 1,
      app    : (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : '?',
      export : new Date().toISOString(),
      veh    : (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? {
                 merk: vehicleInfo.merk || '', model: vehicleInfo.model || '',
                 jaar: vehicleInfo.year || '', vin: vehicleInfo.vin || '',
                 brandstof: vehicleInfo.brandstof || ''
               } : {}
    }));
    blokken.sort(function (a, b) { return (a.van || 0) - (b.van || 0); });
    for (var i = 0; i < blokken.length; i++) {
      var r = blokken[i].regels || [];
      for (var j = 0; j < r.length; j++) {
        r[j].s = blokken[i].sessie;
        uit.push(JSON.stringify(r[j]));
      }
    }
    var body = uit.join('\n');
    var naam = 'pidlane-bulk-' + new Date().toISOString().slice(0, 10) + '.ndjson';
    bewaarBestand(naam, body);
    toast('Geëxporteerd: ' + uit.length + ' regels (' + mb(body.length) + ' MB)');
  } catch (e) {
    toast('Export mislukt: ' + (e && e.message || e));
  }
}

function bewaarBestand(naam, body) {
  try { if (typeof download === 'function') { download(naam, body); return; } } catch (e) {}
  try {
    var b = new Blob([body], { type: 'application/x-ndjson' });
    var u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u; a.download = naam;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  } catch (e) {}
}

async function wisAlles() {
  if (S.actief) { toast('Stop eerst de recorder'); return; }
  if (!confirm('Alle opgenomen bulk-data wissen? Dit kan niet terug.')) return;
  try {
    await dbKlaar();
    await dbWis();
    S.nRegels = 0; S.nBlokken = 0; S.bytes = 0;
    metaWeg(); dashBij();
    toast('Bulk-opslag gewist');
  } catch (e) { toast('Wissen mislukt'); }
}

/* ═══════════════════ DASHBOARD ═══════════════════ */

function openDash() {
  if (!magIk()) { toast('Alleen voor admin'); return; }
  var o = el('blkOverlay');
  if (!o) { o = bouwDash(); }
  o.style.display = 'flex';
  dashBij();
}

function sluitDash() {
  var o = el('blkOverlay');
  if (o) o.style.display = 'none';
  if (S.actief) { chipMaak(); chipBij(); }
}

function bouwDash() {
  var o = document.createElement('div');
  o.id = 'blkOverlay';
  o.style.cssText = 'display:none;position:fixed;inset:0;z-index:9200;background:rgba(4,8,14,.86);' +
    'align-items:center;justify-content:center;padding:16px;font-family:var(--f)';
  o.innerHTML =
    '<div style="width:100%;max-width:460px;max-height:86vh;overflow:auto;background:var(--sur,#151b24);' +
      'border:1.5px solid var(--bd,#26303b);border-radius:16px;padding:18px;color:var(--tx,#e6e9ef)">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:4px">' +
        '<span style="font-size:19px">📼</span>' +
        '<b style="font-size:16px">Bulk-recorder</b>' +
        '<span style="flex:1"></span>' +
        '<button id="blkX" style="background:none;border:0;color:var(--tx,#e6e9ef);font-size:20px;cursor:pointer;line-height:1">×</button>' +
      '</div>' +
      '<div style="font-size:12px;opacity:.72;line-height:1.5;margin-bottom:13px">' +
        'Passieve logger op 1 Hz. Raakt de OBD-bus niet aan — caravan-tracker en de rest van PidLane blijven gewoon werken.' +
      '</div>' +
      '<div id="blkStat" style="font-size:13px;line-height:1.85;background:var(--bg2,#0e1420);' +
        'border:1px solid var(--bd,#26303b);border-radius:11px;padding:11px 13px;margin-bottom:13px"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button id="blkStart" class="btn" style="flex:1;min-width:130px;padding:11px;border-radius:10px;' +
          'border:0;background:linear-gradient(135deg,#0e9f6e,#1a6fff);color:#fff;font-weight:800;font-size:13px;cursor:pointer"></button>' +
        '<button id="blkPauze" class="btn" style="flex:1;min-width:110px;padding:11px;border-radius:10px;' +
          'border:1.5px solid var(--bd,#26303b);background:transparent;color:var(--tx,#e6e9ef);font-weight:800;font-size:13px;cursor:pointer"></button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
        '<button id="blkMark" class="btn" style="flex:1;min-width:110px;padding:10px;border-radius:10px;' +
          'border:1.5px solid var(--bd,#26303b);background:transparent;color:var(--tx,#e6e9ef);font-weight:700;font-size:12px;cursor:pointer">🔖 Markeer moment</button>' +
        '<button id="blkExp" class="btn" style="flex:1;min-width:110px;padding:10px;border-radius:10px;' +
          'border:1.5px solid var(--bd,#26303b);background:transparent;color:var(--tx,#e6e9ef);font-weight:700;font-size:12px;cursor:pointer">⬇️ Exporteer</button>' +
      '</div>' +
      '<button id="blkWis" style="width:100%;margin-top:8px;padding:9px;border-radius:10px;border:0;' +
        'background:transparent;color:#e05555;font-weight:700;font-size:12px;cursor:pointer">Opslag wissen</button>' +
      '<div style="font-size:11px;opacity:.55;line-height:1.6;margin-top:12px">' +
        'Voor de PID-sweep, CALID/CVN en readiness: gebruik <b>📋 Full survey</b> bij stilstand, ' +
        'bijvoorbeeld bij elke tankstop. Die claimt wél het busslot.' +
      '</div>' +
    '</div>';
  document.body.appendChild(o);

  o.addEventListener('click', function (ev) { if (ev.target === o) sluitDash(); });
  el('blkX').onclick     = sluitDash;
  el('blkStart').onclick = function () { if (S.actief) stop(); else start(); };
  el('blkPauze').onclick = function () { if (S.gepauzeerd) hervat(); else pauzeer(); };
  el('blkMark').onclick  = function () { markeer('handmatig'); };
  el('blkExp').onclick   = function () { exporteer(); };
  el('blkWis').onclick   = function () { wisAlles(); };
  return o;
}

function dashBij() {
  var st = el('blkStat');
  if (st) {
    var duur = S.actief ? tijdKort(nu() - S.gestart) : '—';
    st.innerHTML =
      '<div><b>Status</b> · ' + (S.actief ? (S.gepauzeerd ? '⏸️ gepauzeerd' : '🔴 opnemen') : '⚪ gestopt') + '</div>' +
      '<div><b>Looptijd</b> · ' + duur + '</div>' +
      '<div><b>Segment</b> · ' + S.seg + '</div>' +
      '<div><b>Regels</b> · ' + S.nRegels + ' &nbsp;<span style="opacity:.6">(' + S.nBlokken + ' blokken, buffer ' + S.buf.length + ')</span></div>' +
      '<div><b>GPS</b> · ' + (S.gps ? (S.gps.alt !== null ? S.gps.alt + ' m hoogte' : 'fix, geen hoogte') : 'geen') + '</div>' +
      (S.fout ? '<div style="color:#e0a055"><b>Laatste fout</b> · ' + S.fout + '</div>' : '');
  }
  var b1 = el('blkStart'); if (b1) b1.textContent = S.actief ? '⏹️ Stop opname' : '▶️ Start opname';
  var b2 = el('blkPauze');
  if (b2) {
    b2.textContent = S.gepauzeerd ? '▶️ Hervat' : '⏸️ Pauzeer';
    b2.disabled = !S.actief;
    b2.style.opacity = S.actief ? '1' : '.45';
  }
}

/* Elke seconde de chip en (indien open) het dashboard bijwerken. Los van
   de meet-tick, zodat een trage DOM de meting nooit ophoudt. */
setInterval(function () {
  try {
    if (S.actief) chipBij();
    var o = el('blkOverlay');
    if (o && o.style.display !== 'none') dashBij();
  } catch (e) {}
}, 1000);

/* ═══════════════════ HERSTART OVERLEVEN ═══════════════════ */
/* Telefoon in een hete auto, browser die de tab weggooit: dan is de
   sessie in localStorage het enige wat we nog hebben. De al weggeschreven
   blokken staan veilig in IndexedDB; we openen simpelweg een NIEUWE
   sessie-id en gaan door. Bij export staan ze netjes op tijd gesorteerd
   achter elkaar. */

function herstelPoging() {
  try {
    if (S.actief) return;              // handmatig gestart binnen de 3 s: niks doen
    var m = metaLees();
    if (!m || !m.actief) return;
    if (!magIk()) return;
    var mins = Math.round((nu() - (m.gestart || nu())) / 60000);
    toast('Bulk-recorder liep nog (' + mins + ' min) — hervat');
    logg('sessie hervat na herstart', 'warn');
    start(true);
  } catch (e) {}
}

try {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { setTimeout(herstelPoging, 3000); });
  else setTimeout(herstelPoging, 3000);
} catch (e) {}

/* Laatste kans om de buffer te redden als de pagina weggaat. */
try {
  window.addEventListener('pagehide', function () { try { if (S.actief) { metaBewaar(); flush(); } } catch (e) {} });
  document.addEventListener('visibilitychange', function () {
    try { if (document.visibilityState === 'hidden' && S.actief) flush(); } catch (e) {}
  });
} catch (e) {}

/* ═══════════════════ EXPORT NAAR GLOBALE SCOPE ═══════════════════ */

window.PLBulk = {
  start    : start,
  stop     : stop,
  pauzeer  : pauzeer,
  hervat   : hervat,
  markeer  : markeer,
  exporteer: exporteer,
  open     : openDash,
  sluit    : sluitDash,
  status   : function () {
    return { actief: S.actief, gepauzeerd: S.gepauzeerd, regels: S.nRegels,
             blokken: S.nBlokken, segment: S.seg, sessie: S.sessieId, fout: S.fout };
  }
};

/* Losse globale voor de kebab-regel in index.html (inline on*-handler). */
window.openBulkRecorder = openDash;

})();
