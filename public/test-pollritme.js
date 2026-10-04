// ══════════════════════════════════════════════════════════════════
// test-pollritme.js — haalt de pollus het tempo dat hij belooft?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Op 30-09-2026 stond op het adapterpaneel: 9,7 verzoeken/s, 54 ms per
// verzoek, 53% bus bezet, tempo 100%. De vraag erbij was de goede: bij 54 ms
// per verzoek kan de bus er 18 per seconde aan — waar blijft de rest?
//
// Niet bij de adapter. De pollus tikte elke 100 ms met een setInterval. Een
// PID van 120 ms werd daardoor pas op de tik ná zijn deadline gevraagd, en
// een ronde die langer duurde dan een tik liet de tik erna vallen. Met acht
// PIDs gaf dat precies het paneel: 10 verzoeken/s, 54% bezet, en de snelle
// klasse op 5 Hz in plaats van 8,3.
//
// Deze test draait de ECHTE startPoll(), _pollRonde(), pidsDueNow(),
// _pollHerplan(), _pollWacht() en pidPollInterval() uit pidlane-plload.js,
// met PID_POLL_CLASS en PLBus uit pidlane-data.js, op een nagemaakte klok.
// Alleen de adapter is nep: elk verzoek kost VERZOEK_MS.
//
// De tegenproef staat in plmutate.sh: laat _pollWacht altijd een volle tik
// wachten (de oude setInterval) en de snelle klasse zakt hier onder de eis.
//
// Draaien vanuit public/:  node test-pollritme.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

const PLLOAD = fs.readFileSync(__dirname + '/pidlane-plload.js', 'utf8');
function knip(van, tot) {
  const a = PLLOAD.indexOf(van), b = PLLOAD.indexOf(tot, a);
  if (a < 0 || b < 0) { console.log('FOUT anker verdwenen uit pidlane-plload.js: ' + (a < 0 ? van : tot)); process.exit(1); }
  return PLLOAD.slice(a, b);
}
// Van het tempo per PID tot en met de pollronde: alles wat bepaalt wanneer
// er iets gevraagd wordt.
const BRON = knip('function pidPollInterval(', '// Eén PID solo opvragen.');

const VERZOEK_MS = 54;          // het paneel van 30-09
const ACHT = ['010C', '010D', '0104', '0111', '0105', '0142', '010B', '010F'];

function bouw() {
  // ── de nagemaakte klok: timers in een rij, de test draait ze af ──
  let NU = 1785600000000;
  let rij = [], volg = 0;
  const klok = {
    setTimeout(fn, ms) { const id = ++volg; rij.push({ id, t: NU + Math.max(0, ms || 0), fn }); return id; },
    clearTimeout(id) { rij = rij.filter((x) => x.id !== id); }
  };
  const s = {
    console: { log() {}, warn(m, e) { s.waarschuwingen.push(String(m) + (e ? ' ' + e : '')); }, error() {} },
    waarschuwingen: [],
    Date: new Proxy(Date, { get: (t, p) => (p === 'now' ? () => NU : t[p]) }),
    Math, JSON, Object, Array, String, Number, Set, Map, Promise, RegExp, Error,
    setTimeout: klok.setTimeout, clearTimeout: klok.clearTimeout,
    setInterval() { throw new Error('de pollus hoort geen setInterval meer te gebruiken'); },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => ({ innerHTML: '' }) },
    btDiag() {}
  };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });

  // ── de nep-adapter en de rest van de app eromheen ──
  s.verzoeken = [];
  s.sendCmd = (cmd) => new Promise((r) => {
    s.verzoeken.push({ t: NU, cmd });
    klok.setTimeout(() => r('41' + cmd.slice(2)), VERZOEK_MS);
  });
  s.gevraagd = {};
  vm.runInContext(`
    var connected = true, demoMode = false, pollTimer = null, activePIDs = new Set();
    var dataStable = false, stabilityCount = {}, outlierCount = {};
    var _pidNextPoll = {}, _focusPIDs = new Set(), _pollMult = 1;
    var selectedNetwork = { id: '6' };
    function actiefPollProfiel(){ return 'basis'; }
    function detectEngineType(){ return 'benzine'; }
    function isMode01(p){ return /^01/i.test(String(p)); }
    var PLLoad = { reset(){}, tick(){}, mult(){ return 1; } };
    var PLAntwoordtal = { cmd(b){ return b; }, leer(){} };
    function splitBatchResponse(raw, grp){ const o = {}; grp.forEach(function(p){ o[p] = [1]; gevraagd[p] = (gevraagd[p]||[]).concat(Date.now()); }); return o; }
    function _diagNote(){} function plGroepOordeel(grp){ return { gekregen: grp.length, oordeel: 'goed' }; }
    function _groepTel(){} function batchOk(){} function batchDip(){}
    function applyParsedBytes(){ return 1; } function parsePID(){ return 1; }
    function plVraagSolo(pid){ gevraagd[pid] = (gevraagd[pid]||[]).concat(Date.now()); return sendCmd('01' + pid.slice(2) + '1'); }
    function updPID(){} function checkStability(){} function feedDatalog(){} function feedSessionStat(){}
    function runCorrelationEngine(){} function updateEVMode(){} function demo(){ return null; }
  ` + BRON, s, { filename: 'pidlane-plload.js (uitgeknipt)' });

  // Draai de klok af tot `tot` ms verder. Na elke timer eerst alle beloftes
  // laten lopen: de ronde wacht op sendCmd, en dat is een echte belofte.
  async function loop(ms) {
    const eind = NU + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      rij.sort((a, b) => a.t - b.t || a.id - b.id);
      const x = rij[0];
      if (!x || x.t > eind) { NU = eind; return; }
      rij.shift();
      NU = x.t;
      x.fn();
    }
  }
  return { s, loop, nu: () => NU, timers: () => rij.length };
}

function hz(tijden, van, tot) {
  const n = (tijden || []).filter((t) => t >= van && t < tot).length;
  return n / ((tot - van) / 1000);
}

(async function () {
  // ── 1. acht PIDs, 54 ms per verzoek: het paneel van 30-09 ──
  console.log('— acht PIDs, ' + VERZOEK_MS + ' ms per verzoek —');
  {
    const { s, loop, nu } = bouw();
    ACHT.forEach((p) => s.activePIDs.add(p));
    s.startPoll();
    await loop(5000);                        // inlopen
    const van = nu();
    const nVoor = s.verzoeken.length;
    await loop(30000);
    const tot = nu();
    const perSec = (s.verzoeken.length - nVoor) / 30;
    let bezet = 0;
    s.verzoeken.filter((v) => v.t >= van).forEach(() => { bezet += VERZOEK_MS; });
    const bezetPct = Math.round(bezet / (tot - van) * 100);
    const snel = ACHT.filter((p) => s.PID_POLL_CLASS[p.slice(2)] === 120);
    const snelHz = snel.map((p) => hz(s.gevraagd[p], van, tot));
    const minSnel = Math.min.apply(null, snelHz);
    console.log('       ' + perSec.toFixed(1) + ' verzoeken/s, ' + bezetPct + '% bezet, snelle klasse ' +
      snelHz.map((x) => x.toFixed(1)).join(' / ') + ' Hz (belofte ' + (1000 / 120).toFixed(1) + ')');
    // De kern. De oude tik gaf hier 5,0 Hz; de belofte is 8,3.
    eis(minSnel >= 8.0, 'de snelle klasse haalt zijn 120 ms (traagste: ' + minSnel.toFixed(1) + ' Hz)');
    eis(perSec >= 15, 'de bus wordt gebruikt: ' + perSec.toFixed(1) + ' verzoeken/s (de oude tik gaf 10)');
    // En de rest haalt zijn klasse ook, niet ten koste van de snelle.
    const middel = hz(s.gevraagd['010B'], van, tot);  // 300 ms
    eis(middel >= 3.0 && middel <= 3.4, '0B (300 ms) komt ' + middel.toFixed(2) + ' keer per seconde');
    const traag = hz(s.gevraagd['0105'], van, tot);   // 10 s
    eis(traag >= 0.09 && traag <= 0.11, '05 (10 s) komt niet vaker dan beloofd: ' + traag.toFixed(2) + '/s');
    s.stopPoll();
  }

  // ── 2. weinig te doen: de pollus vraagt niet vaker dan zijn klasse ──
  // Meer tempo mag nooit betekenen: vaker vragen dan het interval. Twee
  // trage PIDs van 10 s horen elk één keer per 10 s te komen, ook al staat de
  // bus vrijwel leeg.
  console.log('— twee trage PIDs —');
  {
    const { s, loop, nu } = bouw();
    s.activePIDs.add('0105'); s.activePIDs.add('010F');
    s.startPoll();
    await loop(1000);
    const van = nu();
    await loop(60000);
    const n = s.verzoeken.filter((v) => v.t >= van).length;
    eis(n >= 5 && n <= 7, 'één groepsverzoek per 10 s: ' + n + ' in een minuut');
  }

  // ── 3. geen verbinding: geen drukke lus ──
  // _pollWacht() geeft bij een PID die al aan de beurt is de kortste wachttijd.
  // Zonder verbinding wordt hij nooit gevraagd en blijft hij aan de beurt —
  // dan hoort de pollus terug te vallen op een rustige tik, niet 250 keer per
  // seconde wakker te worden.
  console.log('— zonder verbinding —');
  {
    const { s, loop } = bouw();
    ACHT.forEach((p) => s.activePIDs.add(p));
    s.connected = false;
    let wakker = 0;
    const echt = s.setTimeout;
    s.setTimeout = function (fn, ms) { wakker++; return echt(fn, ms); };
    vm.runInContext('setTimeout = window.setTimeout', s);
    s.startPoll();
    await loop(1000);
    eis(wakker <= 12, 'hoogstens tien keer per seconde wakker (' + wakker + ')');
    eis(s.verzoeken.length === 0, 'en er gaat niets de bus op');
    s.stopPoll();
  }

  // ── 3b. een gesnoeide PID houdt de pollus niet wakker ──
  // Een dode PID staat in _pidNextPoll nog op zijn oude deadline, maar
  // pidsDueNow() laat hem pas na PID_REPROBE_MS weer toe. Kijkt _pollWacht()
  // alleen naar die deadline, dan is er altijd iets "aan de beurt" dat niet
  // gevraagd wordt — en wordt de pollus elke paar ms wakker voor niets.
  console.log('— een gesnoeide PID —');
  {
    const { s, loop } = bouw();
    s.activePIDs.add('0105'); s.activePIDs.add('010F');
    vm.runInContext('_pidDead.add("010F"); _pidDeadSince["010F"] = Date.now();', s);
    s.startPoll();
    await loop(200);                         // 0105 is gevraagd, 010F is dood
    let wakker = 0;
    const echt = s.setTimeout;
    s.setTimeout = function (fn, ms) { wakker++; return echt(fn, ms); };
    vm.runInContext('setTimeout = window.setTimeout', s);
    await loop(1000);
    eis(wakker <= 12, 'hoogstens tien keer per seconde wakker (' + wakker + ')');
    s.stopPoll();
  }

  // ── 4. bus van een ander: kort terugkomen, niets vragen ──
  console.log('— bus bezet door een ander —');
  {
    const { s, loop, nu } = bouw();
    ACHT.forEach((p) => s.activePIDs.add(p));
    const tok = s.PLBus.claim('survey');
    let wakker = 0;
    const echt = s.setTimeout;
    s.setTimeout = function (fn, ms) { wakker++; return echt(fn, ms); };
    vm.runInContext('setTimeout = window.setTimeout', s);
    s.startPoll();
    await loop(500);
    eis(s.verzoeken.length === 0, 'geen verzoek zolang de survey het slot heeft');
    // Alles staat aan de beurt, dus _pollWacht() zou de kortste tijd geven:
    // 125 keer per halve seconde aankloppen bij een slot dat een ander heeft.
    eis(wakker <= 22, 'en hij klopt niet elke paar ms aan (' + wakker + ' keer in 500 ms)');
    s.PLBus.release(tok);
    const los = nu();
    await loop(100);
    const eerste = s.verzoeken.length ? s.verzoeken[0].t - los : null;
    const bezetMs = vm.runInContext('POLL_BEZET_MS', s);
    eis(eerste !== null && eerste <= bezetMs, 'binnen ' + bezetMs + ' ms na vrijgave weer aan de slag (' + eerste + ' ms)');
    s.stopPoll();
  }

  // ── 5. stoppen midden in een ronde ──
  // Met een setInterval was clearInterval() genoeg. Een keten van setTimeouts
  // plant na elke ronde de volgende — ook na een stop die tíjdens de ronde
  // kwam, tenzij hij dat merkt. Dan pollt de app door na het verbreken.
  console.log('— stoppen tijdens een ronde —');
  {
    const { s, loop, timers } = bouw();
    ACHT.forEach((p) => s.activePIDs.add(p));
    s.startPoll();
    await loop(10);                          // de eerste ronde is begonnen
    eis(s.verzoeken.length > 0, 'de ronde loopt');
    s.stopPoll();
    const n = s.verzoeken.length;
    await loop(2000);
    eis(s.verzoeken.length - n <= 3, 'na de stop maakt hij hoogstens zijn ronde af (' + (s.verzoeken.length - n) + ' erbij)');
    eis(timers() === 0, 'en plant hij niets meer');
  }

  // ── 6. opnieuw starten tijdens een ronde: één keten, niet twee ──
  console.log('— opnieuw starten tijdens een ronde —');
  {
    const { s, loop, nu, timers } = bouw();
    ['0105', '010F'].forEach((p) => s.activePIDs.add(p));
    s.startPoll();
    await loop(10);
    s.startPoll();                           // nieuwe verbinding, zelfde PIDs
    await loop(1000);
    const van = nu();
    await loop(60000);
    const n = s.verzoeken.filter((v) => v.t >= van).length;
    eis(n >= 5 && n <= 7, 'nog steeds één groepsverzoek per 10 s (' + n + ')');
    // Twee ketens delen _pidNextPoll en vragen dus niet vaker; ze worden wel
    // allebei wakker. Het aantal verzoeken zegt het dus niet — het aantal
    // geplande tikken wel.
    eis(timers() === 1, 'er staat één tik gepland, niet twee (' + timers() + ')');
    s.stopPoll();
  }

  // ── 7. een geweigerd verzoek is geen busmeting (#388) ──
  // Staat de ELM-poort dicht, dan komt elk verzoek als '' terug. Dat mag geen
  // dip worden en geen PID als stil boeken. Tegenproef in dezelfde opzet: een
  // lege string zónder weigering (de auto antwoordde echt niet) moet wél een
  // dip geven — anders bewijst de eerste helft niets.
  console.log('— geweigerd door de ELM-poort —');
  for (const geweigerd of [true, false]) {
    const { s, loop } = bouw();
    ['010C', '010D', '0104', '0111'].forEach((p) => s.activePIDs.add(p));
    let w = 0;
    s.PLElm = { weigeringen: () => w, poortDicht: () => false };
    s.sendCmd = (cmd) => { s.verzoeken.push({ cmd }); if (geweigerd) w++; return Promise.resolve(''); };
    vm.runInContext('var _dips = 0, _stil = 0; batchDip = function(){ _dips++; }; markPidNoData = function(){ _stil++; };' +
      'splitBatchResponse = function(){ return {}; }; plGroepOordeel = function(grp){ return { gekregen: 0, mist: grp, mistBekend: [], oordeel: "leeg" }; };', s);
    s.startPoll();
    await loop(3000);
    s.stopPoll();
    if (geweigerd) {
      eis(s.verzoeken.length > 0, 'de ronde probeerde het wel (' + s.verzoeken.length + ' verzoeken)');
      eis(s._dips === 0, 'geweigerd: geen enkele dip (' + s._dips + ')');
      eis(s._stil === 0, 'geweigerd: geen PID als stil geboekt (' + s._stil + ')');
    } else {
      eis(s._dips > 0, 'tegenproef — echt leeg antwoord: wél een dip (' + s._dips + ')');
    }
  }
  {
    const { s, loop } = bouw();
    ['010C', '010D'].forEach((p) => s.activePIDs.add(p));
    s.PLElm = { weigeringen: () => 0, poortDicht: () => true };
    s.startPoll();
    await loop(3000);
    s.stopPoll();
    eis(s.verzoeken.length === 0, 'poort dicht: de ronde stuurt niets (' + s.verzoeken.length + ')');
  }

  // ── 8. de ATST-regelaar krijgt het signaal (#394) ──
  // Mist een groep een PID die kort geleden nog antwoordde, dan hoort
  // PLVerbind dat. Tegenproef: mist hij niets bekends, dan alleen "goed".
  console.log('— signaal voor de ATST-regelaar —');
  for (const bekendWeg of [true, false]) {
    const { s, loop } = bouw();
    ['010C', '010D', '0104', '0111'].forEach((p) => s.activePIDs.add(p));
    const signalen = [];
    s.PLVerbind = { noteAntwoord: (m) => signalen.push(m) };
    vm.runInContext('plGroepOordeel = function(grp){ return { gekregen: grp.length - 1, mist: [grp[0]], mistBekend: ' +
      (bekendWeg ? '[grp[0]]' : '[]') + ', oordeel: "' + (bekendWeg ? 'onvolledig' : 'goed') + '" }; };', s);
    s.startPoll();
    await loop(3000);
    s.stopPoll();
    if (bekendWeg) eis(signalen.length > 0 && signalen.every(Boolean), 'een bekende PID weg: de regelaar hoort "mist" (' + signalen.length + '×)');
    else eis(signalen.length > 0 && !signalen.some(Boolean), 'tegenproef — niets bekends weg: alleen "goed" (' + signalen.length + '×)');
  }

  if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
  console.log('Alles goed — de pollus vraagt wat zijn klassen beloven');
})().catch((e) => { console.log('FOUT ' + (e && e.stack || e)); process.exit(1); });
