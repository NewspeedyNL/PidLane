// ══════════════════════════════════════════════════════════════════
// pidlane-testrun.js
// DE TESTRUN — één knop, één rit, één logboek
// ──────────────────────────────────────────────────────────────────
// WAT DIT VERVANGT EN WAAROM
// Er waren zes ingangen die allemaal hetzelfde deden — data verzamelen en
// zichtbaar maken — elk met een eigen exportformaat en een eigen half beeld:
// busdiagnose, zelftest, opdracht, diagnosebundel, logscherm en copiloot.
// Wie een probleem wilde natrekken moest ze alle zes langs en zelf de
// tijdlijnen op elkaar leggen. Dat is nu één ding.
//
// HET IDEE
// Je drukt vóór een rit op één knop. De testrun draait zelfstandig af,
// overschrijft daarbij tijdelijk je PID-selectie om álles te kunnen meten,
// zet die daarna exact terug, en levert één tekstbestand op. Dat bestand is
// het enige dat terug hoeft.
//
// PER UPDATE EEN NIEUWE INVULLING
// Onderaan staat CAMPAGNE: de vragen die déze versie moet beantwoorden. Elke
// update herschrijft dat blok. De rest van het bestand blijft staan. Zo is
// achteraf terug te zien welke vraag een run moest beantwoorden — en of hij
// dat deed.
//
// WAT ER IN 1.7 BIJ KWAM
// Twee sondes die vooruitlopen op PLAN.md punt 2 en 4. Ze veranderen NIETS aan
// het gedrag van de app — ze verzamelen het bewijs waarmee die twee sessies
// moeten beginnen. Blok 7 leest een spoor van de pollbudget-regeling dat de
// hele rit doorloopt; blok 8 vraagt drie kandidaten voor de olietemperatuur op
// en rekent beide gangbare schalingen uit. Wie van beide klopt, beslist de weg.
//
// VEILIGHEID
// Uitsluitend lezende commando's. VERBODEN hieronder wordt gecontroleerd
// vóórdat er iets de bus op gaat: geen 04 (foutgeheugen wissen), geen 2F/31
// (actuatoren), geen sleuteldiensten. En de selectie wordt hersteld in een
// finally, ook als de run halverwege klapt of je de app wegzwiept.
// ══════════════════════════════════════════════════════════════════
(function () {
'use strict';

const TESTRUN_VERSIE = '3.1 (21-08-2026)';
const VERBODEN = /^(04|2F|31|34|35|36|37|3E|27|28|29|2E|85|11)/i;

let _trBezig = false;
let _trStop = false;
let _trLog = [];
let _trStart = 0;
let _trDuur = 0;      // vastgezet bij het einde, anders telt de kop door tot je opslaat
let _trHerstel = null;      // momentopname van de selectie vóór de run

function _nu() { return Date.now(); }
function _klok() { return new Date().toTimeString().slice(0, 8); }
function _wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function _boek(blok, naam, staat, detail, ms) {
  _trLog.push({ t: _klok(), blok: blok, naam: naam, staat: staat, detail: detail || '', ms: ms == null ? null : Math.round(ms) });
  try { _teken(); } catch (e) {}
}

// Eén controle draaien. Een fout wordt GEBOEKT, niet weggeslikt — dat is het
// hele verschil met de zes losse dingen die dit vervangt.
async function _doe(blok, naam, fn) {
  if (_trStop) return false;
  const t0 = _nu();
  try {
    const r = await fn();
    const ms = _nu() - t0;
    if (r && r.staat) { _boek(blok, naam, r.staat, r.detail, ms); return r.staat !== 'FOUT'; }
    _boek(blok, naam, 'ok', typeof r === 'string' ? r : '', ms);
    return true;
  } catch (e) {
    _boek(blok, naam, 'FOUT', (e && e.message) || String(e), _nu() - t0);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════
// SELECTIE BEWAREN EN TERUGZETTEN
// ══════════════════════════════════════════════════════════════════
// De run overschrijft de PID-selectie volledig. Dat mag, maar dan moet het
// terugzetten waterdicht zijn: één momentopname vooraf, herstel in een
// finally, en een kopie in localStorage zodat een crash of een weggezwiepte
// app de selectie niet permanent kwijtmaakt.
const HERSTEL_SLEUTEL = 'pl_testrun_herstel';

function _bewaarSelectie() {
  const s = {
    actief: [],
    handmatig: [],
    profiel: null,
    t: _nu()
  };
  try { if (typeof activePIDs !== 'undefined') s.actief = Array.from(activePIDs); } catch (e) {}
  try { if (typeof manualPIDs !== 'undefined') s.handmatig = Array.from(manualPIDs); } catch (e) {}
  try { s.profiel = (typeof actiefPollProfiel === 'function') ? actiefPollProfiel() : null; } catch (e) {}
  _trHerstel = s;
  try { localStorage.setItem(HERSTEL_SLEUTEL, JSON.stringify(s)); } catch (e) {}
  return s;
}

function _herstelSelectie(bron) {
  const s = bron || _trHerstel;
  if (!s) return 'niets te herstellen';
  try {
    if (typeof activePIDs !== 'undefined') {
      activePIDs.clear();
      s.actief.forEach(function (p) { activePIDs.add(p); });
    }
    if (typeof manualPIDs !== 'undefined') {
      manualPIDs.clear();
      (s.handmatig || []).forEach(function (p) { manualPIDs.add(p); });
    }
    if (s.profiel && typeof setPollProfile === 'function') setPollProfile(s.profiel, 'testrun klaar');
    try { renderGauges(); } catch (e) {}
  } catch (e) {
    return 'HERSTEL MISLUKT: ' + (e.message || e);
  }
  try { localStorage.removeItem(HERSTEL_SLEUTEL); } catch (e) {}
  _trHerstel = null;
  return s.actief.length + ' PIDs teruggezet';
}

// Bij het laden kijken of er een run is afgebroken zonder te herstellen.
// Zonder dit zou een app-crash tijdens een run je selectie voorgoed wijzigen.
try {
  const rest = localStorage.getItem(HERSTEL_SLEUTEL);
  if (rest) {
    const s = JSON.parse(rest);
    setTimeout(function () {
      try {
        _herstelSelectie(s);
        if (typeof log === 'function') log('⚠ Vorige testrun is niet netjes geëindigd — PID-selectie teruggezet', 'warn');
      } catch (e) {}
    }, 4000);
  }
} catch (e) {}

// ══════════════════════════════════════════════════════════════════
// HET POLLBUDGET-SPOOR — meet mee, regelt niets
// ══════════════════════════════════════════════════════════════════
// PLAN.md punt 2: de regelkring schroeft het tempo terug op bezetting alleen,
// óók bij 0% fouten en vlakke responstijden. Gemeten op 17-08: 30% → 22% → 17%
// bij fout 0% en 124 ms. Het vermoeden is dat bezetting op deze bus geen bewijs
// van tegendruk is — bezetting is aanvraagtempo × responstijd, dus bij continu
// pollen per definitie hoog.
//
// Dit is een VERMOEDEN, en de wijziging zelf is sessie 2. Wat hier staat meet
// alleen: elke twee seconden een monster van PLBus.stats() en PLLoad.staat(),
// in een ring. PLLoad wordt NIET aangeraakt en niet gewrapt — de beslissing die
// PLLoad nam wordt achteraf gereconstrueerd uit zijn eigen drempels. Wijkt de
// reconstructie af van wat _mult werkelijk deed, dan is dát de bevinding.
//
// Waarom een eigen sampler en niet gewoon de BT-log: PLLoad logt pas bij een
// stap van 0,2. De trage terugloop zet stapjes van 0,03 en de spiraal bestaat
// juist uit die kleine stapjes. Die zijn in de log onzichtbaar.
//
// Draait vanaf het laden, ook zonder testrun — een spiraal ontstaat over een
// rit, niet in de twee minuten dat de run loopt.
const PLBudget = (function () {
  const MAX = 1800;                  // 2 s × 1800 = één uur
  let ring = [];
  let _aan = false;

  function monster() {
    try {
      if (typeof connected === 'undefined' || !connected) return;
      if (typeof demoMode !== 'undefined' && demoMode) return;
      if (!window.PLBus || typeof PLBus.stats !== 'function') return;
      if (!window.PLLoad || typeof PLLoad.staat !== 'function') return;
      const s = PLBus.stats();
      const st = PLLoad.staat();
      ring.push({
        t: Date.now(),
        mult: st.mult,
        tempo: st.tempoPct,
        bezet: s.belasting,
        fout: s.foutPct,
        ms: s.venGemMs,
        perSec: s.perSec,
        // De testrun belast de bus zelf: de sweep vraagt 50 PIDs achter elkaar
        // op, blok 6 pookt vijf keer in een dode PID, blok 8 vraagt er drie op
        // die gegarandeerd NO DATA geven. Op 20-08 leverde dat een foutpiek van
        // 82% op in een spoor dat over normaal rijden hoort te gaan.
        // Markeren in plaats van weglaten: het onderscheid is de informatie, en
        // een gat in de reeks is lastiger te lezen dan een gemarkeerd monster.
        run: !!_trBezig
      });
      if (ring.length > MAX) ring.splice(0, ring.length - MAX);
    } catch (e) {
      // Bewust stil: dit is een waarnemer op vreemde objecten, en een fout hier
      // mag nooit de rit verstoren. Dat de sampler leeft is aan het aantal
      // monsters te zien; staat dat op 0, dan meldt blok 7 dat.
    }
  }

  function start() {
    if (_aan) return;
    _aan = true;
    setInterval(monster, 2000);
  }

  // De drempels uit PLLoad zelf halen, niet overschrijven. Anders meet dit blok
  // straks tegen verouderde getallen zodra sessie 2 ze verzet.
  function drempels() {
    const c = (window.PLLoad && PLLoad.cfg) ? PLLoad.cfg : {};
    return {
      bezetOp: c.bezetOp == null ? 85 : c.bezetOp,
      bezetAf: c.bezetAf == null ? 55 : c.bezetAf,
      foutOp: c.foutOp == null ? 10 : c.foutOp,
      traagMs: c.traagMs == null ? 400 : c.traagMs,
      kalmFoutPct: c.kalmFoutPct == null ? 5 : c.kalmFoutPct
    };
  }

  // Welke tak zou PLLoad.tick() bij dit monster gekozen hebben?
  function zone(m) {
    const d = drempels();
    const druk = m.bezet >= d.bezetOp || m.fout >= d.foutOp;
    const ruim = m.bezet < d.bezetAf && m.fout < d.foutOp;
    if (druk) return 'druk';
    if (ruim) return 'ruim';
    if (m.fout <= d.kalmFoutPct && m.ms < d.traagMs) return 'kalm';
    return 'stil';                   // dode zone zonder aftasten
  }

  function mediaan(a) {
    if (!a.length) return 0;
    const s = a.slice().sort(function (x, y) { return x - y; });
    const h = Math.floor(s.length / 2);
    return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
  }

  return {
    start: start,
    spoor: function () { return ring.slice(); },
    aantal: function () { return ring.length; },
    zone: zone,
    drempels: drempels,
    mediaan: mediaan,
    wis: function () { ring = []; }
  };
})();
window.PLBudget = PLBudget;
try { PLBudget.start(); } catch (e) {}

// ══════════════════════════════════════════════════════════════════
// BLOK 1 — BEDRADING EN OMGEVING
// ══════════════════════════════════════════════════════════════════
async function _blok1() {
  await _doe(1, 'Bedradingscontrole', function () {
    if (!window.PLBedrading) return { staat: 'FOUT', detail: 'pidlane-bedrading.js niet geladen' };
    const weg = PLBedrading.controleer();
    if (weg.length) return { staat: 'FOUT', detail: weg.length + ' ontbreken: ' + weg.join(', ') };
    return PLBedrading.kritiek.length + ' verwachte functies aanwezig';
  });

  await _doe(1, 'Modulevolgorde', function () {
    const tags = document.querySelectorAll('script[src^="pidlane-"]');
    const laatste = tags.length ? tags[tags.length - 1].getAttribute('src') : '—';
    if (laatste !== 'pidlane-bedrading.js') return { staat: 'LET OP', detail: tags.length + ' modules, laatste is ' + laatste };
    return tags.length + ' modules, bedrading achteraan';
  });

  await _doe(1, 'Kernobjecten', function () {
    const nodig = ['PLBus', 'PLLoad', 'PLSched', 'PLBedrading', 'PIDS'];
    const weg = nodig.filter(function (n) { return typeof window[n] === 'undefined'; });
    if (weg.length) return { staat: 'FOUT', detail: 'ontbreekt: ' + weg.join(', ') };
    return nodig.join(', ');
  });

  await _doe(1, 'Herijking bedraad', function () {
    // NIET via de broncode van updPID: pidlane-remote.js wrapt die functie in
    // een closure, dus window.updPID toont de wrapper. Op de testrun van 16-08
    // meldde deze controle daardoor "ronde 5 staat stil" terwijl alles gewoon
    // bedraad was. Tellers in de gate zelf liegen niet.
    if (!window.PLGate || !PLGate.stats) return { staat: 'FOUT', detail: 'PLGate ontbreekt — pidgate niet geladen' };
    const st = PLGate.stats();
    if (!st.ticks) return { staat: 'FOUT', detail: 'plHerijkTick() is nog nooit aangeroepen — de haak in updPID ontbreekt' };
    return st.ticks + ' ticks, ' + st.herijkingen + ' herijkingen, ' + st.mapMonsters + ' MAP-monsters (max ' + st.maxMap + ' kPa)';
  });

  await _doe(1, 'ELM-poort', function () {
    // Idem: sendCmd is gewrapt, dus de broncode zegt niets. De poort meldt
    // zichzelf.
    if (!window.PLElm) return { staat: 'FOUT', detail: 'PLElm ontbreekt — de poort zit niet in deze build' };
    const dicht = PLElm.poortDicht();
    return dicht ? { staat: 'LET OP', detail: 'poort staat dicht — er loopt een herinitialisatie' } : 'aanwezig en open';
  });

  await _doe(1, 'VIN-profiel', function () {
    // Drie verbindingen op rij (19-08, 20-08 12:10, 20-08 12:31) sloeg de app
    // een profiel op onder JMZKF6W7600766507 en laadde het de keer erna niet:
    // geen "Bekend voertuig" in het log, direct bitmap-discovery. Daardoor
    // draait profielTegenSteunbits() nooit — die zit alleen in het profielpad —
    // en blijft PLAN.md punt 1 onbevestigd hangen.
    //
    // Waar het misgaat is van buiten niet te zien: applyVinProfileIfKnown()
    // vangt alles in één catch en geeft alleen false terug. Deze controle kijkt
    // daarom in de opslag zelf.
    const vin = (function () { try { return (vehicleInfo && vehicleInfo.vin) || ''; } catch (e) { return ''; } })();
    const alle = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('pl_vinprof_') === 0) alle.push(k);
      }
    } catch (e) { return { staat: 'FOUT', detail: 'localStorage onleesbaar' }; }

    if (!alle.length)
      return { staat: 'LET OP', detail: 'geen enkel opgeslagen profiel — saveVinProfile schrijft niet, of de opslag overleeft de sessie niet' };

    if (!vin)
      return { staat: 'LET OP', detail: alle.length + ' profiel(en) opgeslagen, maar geen VIN in deze sessie om tegen te matchen' };

    const sleutel = 'pl_vinprof_' + String(vin).toUpperCase();
    const raw = (function () { try { return localStorage.getItem(sleutel); } catch (e) { return null; } })();
    if (!raw) {
      // Het profiel bestaat wél, maar onder een andere sleutel. Dat is de
      // interessante uitkomst: dan wijkt de VIN van nu af van die bij opslaan.
      return { staat: 'FOUT', detail: 'huidige VIN ' + vin + ' heeft geen profiel; wél opgeslagen: ' +
        alle.map(function (k) { return k.replace('pl_vinprof_', ''); }).join(', ') };
    }
    let prof = null;
    try { prof = JSON.parse(raw); } catch (e) {
      return { staat: 'FOUT', detail: 'profiel staat er maar is onleesbaar (' + raw.length + ' tekens) — JSON stuk' };
    }
    if (!prof || !prof.pids || !prof.pids.length)
      return { staat: 'FOUT', detail: 'profiel bestaat maar bevat geen PIDs — daarom valt de app terug op discovery' };

    const uur = prof.ts ? Math.round((Date.now() - prof.ts) / 36e5 * 10) / 10 : null;
    const health = prof.health ? Object.keys(prof.health).length : 0;
    const basis = prof.pids.length + ' PIDs' + (health ? ', ' + health + ' health-oordelen' : ', GEEN health') +
      (uur == null ? '' : ', ' + uur + ' uur oud');

    // Tot 21-08 stond hier onvoorwaardelijk "dit had bij het verbinden geladen
    // moeten worden". Die zin controleerde niets: hij keek alleen of er een
    // profiel in de opslag lag, niet of het gebruikt was. Op 21-08 stond hij
    // twee runs lang in het log terwijl de app netjes een snelle start deed —
    // een melding die vals alarm slaat leer je binnen een week negeren, en dan
    // mis je de echte. profielHealth() is de betrouwbare vlag: die wordt gezet
    // door applyVinProfileIfKnown() en blijft null bij een volle discovery.
    let geladen = null;
    try { geladen = (typeof profielHealth === 'function') ? profielHealth() : undefined; } catch (e) { geladen = undefined; }
    if (geladen === undefined)
      return basis + ' — of het geladen is, is niet vast te stellen (profielHealth ontbreekt)';
    if (geladen)
      return basis + ' — bij het verbinden geladen, snelle start';
    return { staat: 'LET OP', detail: basis +
      ' — staat in de opslag maar is bij het verbinden NIET geladen; de app deed een volle discovery' };
  });

  await _doe(1, 'Opslag', function () {
    const k = '_tr_' + _nu();
    localStorage.setItem(k, '1');
    const t = localStorage.getItem(k);
    localStorage.removeItem(k);
    if (t !== '1') return { staat: 'FOUT', detail: 'localStorage schrijft niet' };
    let n = 0, b = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const s = localStorage.key(i);
      if (s && s.indexOf('pl') === 0) { n++; b += (localStorage.getItem(s) || '').length; }
    }
    return n + ' pl-sleutels, ' + Math.round(b / 1024) + ' kB' + (window.indexedDB ? ', IndexedDB aanwezig' : ', GEEN IndexedDB');
  });

  await _doe(1, 'Voertuig', function () {
    const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo : {};
    const velden = { merk: v.merk, model: v.model, bouwjaar: v.year || v.bouwjaar, brandstof: v.brandstof };
    const leeg = Object.keys(velden).filter(function (k) { return !velden[k]; });
    const s = Object.keys(velden).map(function (k) { return velden[k]; }).filter(Boolean).join(' ');
    if (!s) return { staat: 'LET OP', detail: 'geen voertuiggegevens' };
    // Op 17-08 stond hier alleen "Mazda" terwijl de run ervoor het volledige
    // "Mazda CX-5 2018 benzine" gaf. Een half gevuld vehicleInfo stuurt de
    // PID-gate en de presets aan, dus dat mag geen groen vinkje krijgen.
    if (leeg.length) return { staat: 'LET OP', detail: s + ' — mist: ' + leeg.join(', ') };
    return s + (v.vin ? '  VIN ' + String(v.vin).slice(-6) : '');
  });
}

// ══════════════════════════════════════════════════════════════════
// BLOK 2 — SCHERMEN
// ══════════════════════════════════════════════════════════════════
const SCHERMEN = [
  ['Ritanalyse', 'openRitAnalyse', 'closeRitAnalyse'],
  ['Caravan', 'openCaravan', 'closeCaravanDash'],
  ['Klimaatcheck', 'openClimateCheck', 'closeClimateCheck'],
  ['Diepe diagnose', 'openDeepDiag', 'closeDeepDiag'],
  ['PID-recorder', 'openPidRecorder', 'closePidRecorder'],
  ['Rapporten', 'openReportsOverview', 'closeReportsOverview'],
  ['Rijsituatie', 'openSituatie', 'closeSituatie'],
  ['Neon-dashboard', 'openNeonDashboard', 'closeNeonDashboard'],
  ['AI-rapport', 'openAIReportSheet', 'closeAIReportSheet'],
  ['Bulk-recorder', 'openBulkRecorder', null]
];

async function _blok2() {
  for (let i = 0; i < SCHERMEN.length; i++) {
    const s = SCHERMEN[i];
    await _doe(2, s[0], async function () {
      if (typeof window[s[1]] !== 'function') return { staat: 'LET OP', detail: s[1] + ' bestaat niet' };
      window[s[1]]();
      await _wacht(120);
      if (s[2] && typeof window[s[2]] === 'function') window[s[2]]();
      else if (s[0] === 'Bulk-recorder' && window.PLBulk && PLBulk.sluit) PLBulk.sluit();
      return 'geopend en gesloten';
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 3 — PID-SWEEP OVER ALLES
// ══════════════════════════════════════════════════════════════════
// Hier zit de kern. De selectie wordt overschreven met álles wat het voertuig
// volgens de discovery kan leveren, elk daarvan wordt één keer los gelezen, en
// de ruwe respons gaat mee het log in. Daarmee is achteraf te zien wat de ECU
// stuurde én wat de parser eruit las — precies het onderscheid dat je met een
// gewoon log niet kunt maken.
let _budgetVoor = null;

async function _blok3() {
  try { _budgetVoor = (window.PLLoad && PLLoad.staat) ? PLLoad.staat().tempoPct : null; } catch (e) {}
  if (typeof connected === 'undefined' || !connected) {
    _boek(3, 'PID-sweep', 'overgeslagen', 'geen verbinding', null);
    return;
  }
  if (typeof demoMode !== 'undefined' && demoMode) {
    _boek(3, 'PID-sweep', 'overgeslagen', 'demomodus', null);
    return;
  }

  let lijst = [];
  try {
    if (typeof discoveredPIDDefs !== 'undefined' && discoveredPIDDefs.length) {
      lijst = discoveredPIDDefs.map(function (d) { return d.pid; });
    } else if (typeof activePIDs !== 'undefined') {
      lijst = Array.from(activePIDs);
    }
  } catch (e) {}
  lijst = lijst.filter(function (p) { return p && !VERBODEN.test(p); });
  if (!lijst.length) { _boek(3, 'PID-sweep', 'overgeslagen', 'geen PID-lijst beschikbaar', null); return; }

  // PIDs die de ECU expliciet ontkent niet opvragen. Ze geven gegarandeerd
  // NO DATA, en elke misser telt mee in PLBus.foutPct — waarop PLLoad het
  // pollbudget terugschroeft. Op 20-08 kwamen ALLE 18 missers in een run van
  // 230 verzoeken van vier zulke PIDs (0114, 015E, 015C, 0146), goed voor 15%
  // foutgraad en de melding "veel lege antwoorden van de ECU" aan de
  // gebruiker. De testrun maakte dus zelf het probleem dat hij moest meten.
  //
  // Onbekend blijft gewoon meedoen: alleen een expliciete NEE is genoeg reden
  // om niet te vragen. Blok 6 onderzoekt de overgeslagen PIDs alsnog, maar
  // gericht en met veel minder verkeer.
  const _ontkend = [];
  if (typeof ecuSteunt === 'function') {
    lijst = lijst.filter(function (p) {
      if (ecuSteunt(p) === false) { _ontkend.push(p); return false; }
      return true;
    });
  }
  if (_ontkend.length)
    _boek(3, 'Niet opgevraagd', 'ok', _ontkend.length + ' PIDs overgeslagen — de ECU ontkent ze: ' +
      _ontkend.join(', ') + '  (zou alleen lege antwoorden opleveren)', null);

  _boek(3, 'PID-sweep', 'bezig', lijst.length + ' PIDs, selectie tijdelijk overschreven', null);

  // Bus claimen voor de duur van de sweep. Zonder dit interleaven de metingen
  // met de pollus: op de run van 16-08 stond het slot bij "poll" terwijl de
  // sweep liep, en dat is dezelfde klasse fout als de ELM-init die dwars door
  // de polls heen ging. Lukt de claim niet, dan meten we alsnog — maar dan
  // staat in het log dát het ongelokt gebeurde, in plaats van het te verzwijgen.
  // claim() is één poging: staat de pollus er net op, dan faalt hij meteen —
  // en dat gebeurde op de run van 17-08. wait() wacht tot de lopende cyclus
  // klaar is; die duurt een paar honderd ms, dus 8 s is ruim.
  let _busTok = 0;
  try { _busTok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-sweep', 8000) : 0; } catch (e) {}
  if (!_busTok) _boek(3, 'Busslot', 'LET OP', 'bus niet vrijgekomen binnen 8 s — sweep loopt naast de pollus', null);
  else _boek(3, 'Busslot', 'ok', 'bus geclaimd voor de sweep', null);

  // Selectie verbreden zodat de pollus ze ook echt aanraakt.
  try {
    if (typeof activePIDs !== 'undefined') lijst.forEach(function (p) { activePIDs.add(p); });
    try { renderGauges(); } catch (e) {}
  } catch (e) {}

  let gelukt = 0, leeg = 0, fout = 0;
  const stille = [];
  const bewaardeSelectie = (_trHerstel && _trHerstel.actief) ? _trHerstel.actief : [];
  for (let i = 0; i < lijst.length; i++) {
    if (_trStop) { _boek(3, 'PID-sweep', 'gestopt', 'afgebroken na ' + i + ' van ' + lijst.length, null); break; }
    const pid = lijst[i];
    const t0 = _nu();
    let raw = '';
    try { raw = await sendCmd(pid, 2500); } catch (e) { raw = 'FOUT: ' + (e.message || e); }
    const ms = _nu() - t0;

    let waarde = null;
    try { if (typeof parsePID === 'function') waarde = parsePID(pid, raw); } catch (e) {}

    const naam = (function () {
      try { const d = getPidDef(pid); return (d && d.name) || pid; } catch (e) { return pid; }
    })();

    const schoon = String(raw || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 44);
    if (!raw) { leeg++; stille.push(pid); _boek(3, pid + ' ' + naam, 'LET OP', 'geen antwoord', ms); }
    else if (/NO DATA|UNABLE|ERROR|STOPPED/i.test(raw)) { leeg++; stille.push(pid); _boek(3, pid + ' ' + naam, 'LET OP', schoon, ms); }
    else if (waarde == null) { fout++; _boek(3, pid + ' ' + naam, 'FOUT', 'parser gaf niets terug op "' + schoon + '"', ms); }
    else { gelukt++; _boek(3, pid + ' ' + naam, 'ok', waarde + '   [ruw: ' + schoon + ']', ms); }

    await _wacht(60);   // de bus even lucht geven tussen de metingen
  }

  try { if (_busTok && window.PLBus && PLBus.release) PLBus.release(_busTok); } catch (e) {}

  _boek(3, 'PID-sweep klaar', gelukt && !fout ? 'ok' : 'LET OP',
    gelukt + ' gelezen, ' + leeg + ' geen data, ' + fout + ' parserprobleem', null);

  // PIDs die nooit antwoorden maar wél in je selectie stonden: dat is precies
  // waar de gate voor bestaat. Ze hier apart noemen maakt zichtbaar of de
  // herijking ze had moeten opruimen.
  if (stille.length) {
    const inSelectie = stille.filter(function (p) { return bewaardeSelectie.indexOf(p) > -1; });
    _boek(3, 'Stille PIDs', inSelectie.length ? 'LET OP' : 'ok',
      stille.length + ' geven nooit data' + (inSelectie.length ? ', waarvan ' + inSelectie.length + ' in je actieve selectie: ' + inSelectie.join(', ') : ''), null);
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 4 — BUS EN REGELKRINGEN
// ══════════════════════════════════════════════════════════════════
async function _blok4() {
  await _doe(4, 'Busstatistiek', function () {
    if (!window.PLBus || !PLBus.stats) return { staat: 'LET OP', detail: 'geen PLBus.stats()' };
    const s = PLBus.stats();
    return JSON.stringify(s);
  });
  await _doe(4, 'Busbelasting', function () {
    if (!window.PLLoad || !PLLoad.staat) return { staat: 'LET OP', detail: 'geen PLLoad.staat()' };
    const st = PLLoad.staat();
    // De sweep zadelt de bus zelf met 100% bezetting op, dus de regelkring
    // schroeft terug terwijl er niets mis is. Vóór en ná naast elkaar zetten
    // maakt zichtbaar hoeveel daarvan door de meting zelf komt.
    const daling = (_budgetVoor != null) ? ('  [vóór de sweep ' + _budgetVoor + '% → nu ' + st.tempoPct + '%]') : '';
    return JSON.stringify(st) + daling;
  });
  await _doe(4, 'Pollprofiel', function () {
    return (typeof actiefPollProfiel === 'function') ? String(actiefPollProfiel()) : 'onbekend';
  });
  await _doe(4, 'Geleerde bytelengtes', function () {
    if (!window.PLPidLen) return { staat: 'LET OP', detail: 'PLPidLen ontbreekt' };
    const afw = PLPidLen.afwijkingen ? PLPidLen.afwijkingen() : null;
    const g = PLPidLen.geleerd ? PLPidLen.geleerd() : null;
    const nAfw = afw ? Object.keys(afw).length : 0;
    return (g ? Object.keys(g).length : 0) + ' geleerd, ' + nAfw + ' afwijkend' +
           (nAfw ? ': ' + JSON.stringify(afw).slice(0, 200) : '');
  });
  await _doe(4, 'Turbodetectie', function () {
    if (!window.PLGate || !PLGate.stats) return { staat: 'LET OP', detail: 'PLGate ontbreekt' };
    const st = PLGate.stats();
    if (!st.mapMonsters) return { staat: 'LET OP', detail: '0 MAP-monsters bij max ' + st.maxMap + ' kPa — motor stationair of atmosferisch' };
    return st.mapMonsters + ' MAP-monsters, max ' + st.maxMap + ' kPa';
  });
  await _doe(4, 'Busslot', function () {
    const e = (window.PLBus && PLBus.owner) ? PLBus.owner() : null;
    return e ? { staat: 'LET OP', detail: 'vastgehouden door "' + e + '"' } : 'vrij';
  });
  await _doe(4, 'Opvallende metingen', function () {
    const lo = window._pidLetOp || {};
    const k = Object.keys(lo);
    if (!k.length) return 'geen';
    return k.map(function (p) { return p + ' uiterste ' + lo[p].uiterste + ' (' + lo[p].n + 'x)'; }).join('; ');
  });
}

// ══════════════════════════════════════════════════════════════════
// BLOK 6 — WAAROM ZWIJGEN DEZE SENSOREN?
// ══════════════════════════════════════════════════════════════════
// Vier PIDs staan in de actieve selectie en geven nooit antwoord: 015C
// (motorolie), 0146 (omgevingstemperatuur), 015E (brandstofverbruik) en 0114
// (O2 B1S1). De sweep vraagt ze los op en krijgt NO DATA, maar dat sluit niet
// uit dat het eerder in de keten misgaat. Dit blok loopt de mogelijke oorzaken
// één voor één langs.
//
// DE VRAGEN, IN VOLGORDE VAN WAARSCHIJNLIJKHEID
//   1. Zégt de ECU eigenlijk dat hij ze ondersteunt? Mode 01 heeft
//      steunvragen (0100, 0120, 0140, 0160) die per PID één bit zetten. Staat
//      de bit uit, dan hoort de PID nooit in de lijst te komen en is het een
//      ontdekkingsfout, geen ECU-eigenaardigheid.
//   2. Is het wisselvallig? Vijf pogingen achter elkaar laten zien of het
//      altijd stil is of af en toe.
//   3. Is de tijd te kort? Eén poging met een ruime timeout.
//   4. Ligt het aan de groepering? Los, met z'n tweeën en met z'n zessen —
//      dat is het vermoeden waar dit blok voor gebouwd is.
//   5. Antwoordt een ander stuurapparaat? Met headers aan is te zien welk
//      adres reageert; misschien komt het antwoord binnen maar wordt het aan
//      de verkeerde toegeschreven.
//
// DE CONTROLE-PID
// 010C (toerental) gaat door exact dezelfde molen. Zonder die vergelijking
// weet je niet of een mislukte batch aan de PID ligt of aan het batchen zelf.
// Faalt 010C in een groep van zes, dan is de groepering stuk. Doet 010C het
// overal en de andere vier nergens, dan ligt het aan de PIDs.
//
// Kost ongeveer twee minuten. De uitkomst is een tabel per PID.
const STIL_VERDACHT = ['015C', '0146', '015E', '0114'];
const STIL_CONTROLE = '010C';

function _bitAan(steunRuw, pid) {
  // Antwoord op 0100/0120/0140/0160 is vier bytes: 32 bits, hoogste bit eerst,
  // voor de 32 PIDs die erop volgen.
  const hex = String(steunRuw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  const basis = parseInt(pid.slice(2), 16);
  const blok = Math.floor((basis - 1) / 32) * 32;
  const kop = '41' + (blok.toString(16).toUpperCase().padStart(2, '0'));
  const i = hex.indexOf(kop);
  if (i < 0) return null;
  const data = hex.slice(i + 4, i + 12);
  if (data.length < 8) return null;
  const bits = parseInt(data, 16);
  const positie = basis - blok;                 // 1..32
  return ((bits >>> (32 - positie)) & 1) === 1;
}

async function _blok6() {
  if (typeof connected === 'undefined' || !connected) { _boek(6, 'Stille sensoren', 'overgeslagen', 'geen verbinding', null); return; }
  if (typeof demoMode !== 'undefined' && demoMode) { _boek(6, 'Stille sensoren', 'overgeslagen', 'demomodus', null); return; }

  let tok = 0;
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-stil', 8000) : 0; } catch (e) {}
  _boek(6, 'Busslot', tok ? 'ok' : 'LET OP', tok ? 'bus geclaimd' : 'niet vrijgekomen — metingen lopen naast de pollus', null);

  // Waar dit blok voor bedoeld is: uitzoeken waaróm een sensor zwijgt. Maar
  // een PID waarvan de ECU zegt dat hij niet bestaat is dáármee verklaard —
  // daar vijf keer los, met ruime timeout, in een paar, in een groep van zes
  // én met headers in pooken levert alleen lege antwoorden op. Dat is precies
  // het verkeer dat op 20-08 de foutgraad naar 15% duwde.
  //
  // Sinds de steunbits centraal beschikbaar zijn (ecuSteunt) kan dat in één
  // regel worden vastgesteld in plaats van in dertig verzoeken. Wat overblijft
  // is de interessante categorie: steunbit JA, maar de auto zwijgt toch — de
  // ECU belooft dan meer dan hij levert, en dát moet de gate opruimen.
  const _verklaard = [];
  let doel = STIL_VERDACHT.slice();
  if (typeof ecuSteunt === 'function') {
    doel = doel.filter(function (p) {
      if (ecuSteunt(p) === false) { _verklaard.push(p); return false; }
      return true;
    });
  }
  if (_verklaard.length)
    _boek(6, 'Verklaard zonder meten', 'ok', _verklaard.length + ' PIDs: de ECU ontkent ze in de steunbits (' +
      _verklaard.join(', ') + ') — niet opnieuw opgevraagd, dat zou alleen de bus belasten', null);
  doel = doel.concat([STIL_CONTROLE]);
  const leeg = function (r) { return !r || /NO DATA|UNABLE|ERROR|STOPPED/i.test(r); };

  try {
    // ── 1. steunvragen ──
    const steun = {};
    for (const q of ['0100', '0120', '0140', '0160']) {
      try { steun[q] = await sendCmd(q, 3000); } catch (e) { steun[q] = ''; }
      await _wacht(80);
    }
    const alleSteun = Object.keys(steun).map(function (k) { return steun[k]; }).join(' ');
    _boek(6, 'Steunvragen gelezen', 'ok', ['0100', '0120', '0140', '0160'].map(function (q) {
      return q + '=' + String(steun[q] || '—').replace(/\s+/g, '').slice(0, 12);
    }).join('  '), null);

    for (const pid of doel) {
      const rol = (pid === STIL_CONTROLE) ? 'CONTROLE' : 'verdacht';
      const naam = (function () { try { const d = getPidDef(pid); return (d && d.name) || pid; } catch (e) { return pid; } })();
      const bevinding = [];

      // 1 — claimt de ECU ondersteuning?
      const bit = _bitAan(alleSteun, pid);
      bevinding.push('steunbit=' + (bit === null ? 'onbekend' : bit ? 'JA' : 'NEE'));

      // 2 — wisselvallig?
      let raak = 0;
      const monsters = [];
      for (let i = 0; i < 5; i++) {
        if (_trStop) break;
        let r = '';
        try { r = await sendCmd(pid, 2000); } catch (e) {}
        if (!leeg(r)) { raak++; monsters.push(String(r).replace(/\s+/g, '').slice(0, 14)); }
        await _wacht(220);
      }
      bevinding.push('los 5x: ' + raak + ' raak' + (monsters.length ? ' (' + monsters[0] + ')' : ''));

      // 3 — ruime tijd
      let traag = '';
      try { traag = await sendCmd(pid, 9000); } catch (e) {}
      bevinding.push('ruime timeout: ' + (leeg(traag) ? 'nog steeds stil' : 'WEL antwoord'));
      await _wacht(150);

      // 4 — groepering: met z'n tweeën en met z'n zessen
      const maat = doel.filter(function (p) { return p !== pid; }).slice(0, 1).concat([]);
      let duo = '';
      try { duo = await sendCmd(pid + (maat[0] || STIL_CONTROLE).slice(2), 3000); } catch (e) {}
      bevinding.push('in een paar: ' + (leeg(duo) ? 'stil' : 'antwoord (' + String(duo).replace(/\s+/g, '').slice(0, 16) + ')'));
      await _wacht(150);

      // Groep van zes: de PID zelf plus vijf die het aantoonbaar doen. Zo is
      // te zien of een grote groep de kleine wegdrukt.
      const goeden = ['0C', '0D', '04', '11', '05'];
      let zes = '';
      try { zes = await sendCmd(pid + goeden.join(''), 4000); } catch (e) {}
      const zesHex = String(zes).replace(/\s+/g, '');
      const eigenKop = ('4' + (parseInt(pid.slice(0, 2), 16) + 0x40).toString(16).slice(-1) + pid.slice(2)).toUpperCase();
      bevinding.push('in een groep van 6: ' + (leeg(zes) ? 'hele groep stil' :
        (zesHex.toUpperCase().indexOf(eigenKop) > -1 ? 'eigen antwoord aanwezig' : 'groep antwoordt, deze PID ontbreekt erin')));
      await _wacht(150);

      // 5 — welk stuurapparaat antwoordt?
      let metKop = '';
      try {
        await sendCmd('ATH1', 1500);
        metKop = await sendCmd(pid, 3000);
      } catch (e) {}
      try { await sendCmd('ATH0', 1500); } catch (e) {}   // altijd terugzetten
      const adres = String(metKop).replace(/\s+/g, '').slice(0, 6);
      bevinding.push('met headers: ' + (leeg(metKop) ? 'geen enkel adres reageert' : adres));

      const stil = (raak === 0 && leeg(traag) && leeg(duo));
      let staat = 'ok';
      if (rol === 'CONTROLE' && stil) staat = 'FOUT';           // dan is er iets veel groters mis
      else if (stil && bit === true) staat = 'LET OP';          // ECU belooft iets wat hij niet levert
      else if (stil && bit === false) staat = 'LET OP';         // hoort niet in de lijst te staan
      else if (stil) staat = 'LET OP';

      _boek(6, pid + ' ' + naam + ' [' + rol + ']', staat, bevinding.join('  |  '), null);
    }

    // Het hele profiel tegen de steunbits leggen. Dit is de brede versie van
    // dezelfde vraag: hoeveel PIDs staan er in de lijst die de ECU ontkent?
    await _doe(6, 'Profiel tegen de steunbits', function () {
      let lijst = [];
      try { lijst = (typeof supportedPIDs !== 'undefined') ? Array.from(supportedPIDs) : []; } catch (e) {}
      if (!lijst.length) return { staat: 'LET OP', detail: 'supportedPIDs is leeg' };
      const ontkend = [], onbekend = [];
      lijst.forEach(function (p) {
        if (!/^01[0-9A-F]{2}$/i.test(p)) return;      // mode 21/22 heeft geen steunbits
        const b = _bitAan(alleSteun, p);
        if (b === false) ontkend.push(p);
        else if (b === null) onbekend.push(p);
      });
      if (!ontkend.length) return lijst.length + ' PIDs, geen enkele door de ECU ontkend';
      return { staat: 'LET OP', detail: ontkend.length + ' van ' + lijst.length + ' worden door de ECU ONTKEND: ' + ontkend.join(', ') +
        (onbekend.length ? '  (' + onbekend.length + ' zonder steunblok)' : '') };
    });

    // Slotsom in één regel, zodat je niet zelf hoeft te puzzelen.
    _boek(6, 'Slotsom', 'ok',
      'Steunbit NEE + altijd stil = ontdekkingsfout, hoort niet in de lijst. ' +
      'Steunbit JA + altijd stil = ECU belooft meer dan hij levert, gate moet opruimen. ' +
      'Los stil maar in een groep wél = groeperingsfout. ' +
      'Controle-PID stil = de meting zelf deugt niet.', null);

  } finally {
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch (e) {}
    try { await sendCmd('ATH0', 1500); } catch (e) {}   // vangnet: headers nooit aan laten staan
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 7 — HET POLLBUDGET (PLAN.md punt 2)
// ══════════════════════════════════════════════════════════════════
// Leest het spoor uit PLBudget en beantwoordt één vraag: schroeft de regelkring
// terug zonder dat de ECU erom vraagt?
//
// "Vraagt erom" betekent: fouten, of een responstijd die oploopt. Bezetting
// alleen telt hier NIET als vraag — dat is precies het punt dat bewezen of
// weerlegd moet worden. Een terugschroefmoment bij fout 0% én een vlakke
// responstijd is een ONGEVRAAGDE rem. Zijn die er niet, dan is het vermoeden
// uit PLAN.md onjuist en kan punt 2 dicht.
//
// Dit blok verandert niets. Het levert het bewijsmateriaal waarmee sessie 2
// begint — en zonder dat bewijs moet die sessie niet beginnen, want dan weet je
// achteraf niet of het beter is geworden.
async function _blok7() {
  const alles = (window.PLBudget && typeof PLBudget.spoor === 'function') ? PLBudget.spoor() : [];
  // Alleen de monsters van buiten een testrun tellen mee. Wat de run zelf op de
  // bus doet — sweep, dode-PID-sondes — hoort niet in een oordeel over hoe de
  // regelkring zich tijdens rijden gedraagt.
  const sp = alles.filter(function (m) { return !m.run; });
  const eigen = alles.length - sp.length;

  if (!sp.length) {
    _boek(7, 'Pollbudget-spoor', 'overgeslagen', 'geen monsters — niet verbonden geweest, of de sampler draait niet', null);
    return;
  }
  if (sp.length < 30) {
    _boek(7, 'Pollbudget-spoor', 'LET OP',
      sp.length + ' monsters (' + Math.round(sp.length * 2) + ' s) — te kort voor een oordeel, rijd langer door', null);
  }

  const d = PLBudget.drempels();
  const med = PLBudget.mediaan;

  await _doe(7, 'Spoor', function () {
    const duur = Math.round((sp[sp.length - 1].t - sp[0].t) / 1000);
    return sp.length + ' monsters over ' + duur + ' s' +
      (eigen ? '  (' + eigen + ' tijdens een testrun weggelaten)' : '') +
      '  |  drempels: bezetOp ' + d.bezetOp + '%, bezetAf ' + d.bezetAf +
      '%, foutOp ' + d.foutOp + '%, traag ' + d.traagMs + ' ms';
  });

  await _doe(7, 'Tempoverloop', function () {
    const t = sp.map(function (m) { return m.tempo; });
    const eerste = t[0], laatste = t[t.length - 1];
    const laag = Math.min.apply(null, t), hoog = Math.max.apply(null, t);
    const tekst = 'start ' + eerste + '% → nu ' + laatste + '%  (laagst ' + laag + '%, hoogst ' + hoog + '%)';
    // Een netto daling is op zichzelf niet fout — dat hoort AIMD te doen als de
    // bus vol zit. Of het terecht was, beslist de controle hieronder.
    if (laatste < eerste) return { staat: 'LET OP', detail: tekst + '  — netto teruggeschroefd' };
    return tekst;
  });

  await _doe(7, 'Tijd per zone', function () {
    const tel = { druk: 0, ruim: 0, kalm: 0, stil: 0 };
    sp.forEach(function (m) { tel[PLBudget.zone(m)]++; });
    const pct = function (n) { return Math.round(n / sp.length * 100); };
    return 'druk ' + pct(tel.druk) + '%, ruim ' + pct(tel.ruim) + '%, kalm ' + pct(tel.kalm) +
      '%, dode zone ' + pct(tel.stil) + '%' +
      (tel.ruim === 0 ? '   [ruim is nooit bereikt — de vaste terugweg bestaat op deze bus niet]' : '');
  });

  // ── De kernmeting ──
  await _doe(7, 'Ongevraagde remmomenten', function () {
    // Elke stap waarbij het tempo omlaag ging. Per stap: waren er fouten, en
    // liep de responstijd op ten opzichte van het halve minuutje ervoor?
    const remmen = [];
    for (let i = 1; i < sp.length; i++) {
      if (sp[i].mult <= sp[i - 1].mult) continue;          // mult omhoog = tempo omlaag
      const vanaf = Math.max(0, i - 15);                   // 15 × 2 s = 30 s terug
      const eerder = sp.slice(vanaf, i).map(function (m) { return m.ms; });
      const basis = med(eerder);
      // PLLoad tikt op zijn eigen ritme; de beslissing viel ergens TUSSEN dit
      // monster en het vorige. Op 20-08 meldde het BT-log "bezet 89%" terwijl
      // het monster erna 84% aangaf — genoeg om een terechte rem als
      // ongevraagd te tellen. Daarom van beide monsters de zwaarste waarde
      // nemen: dat is de toestand die PLLoad gezien kán hebben.
      const bezet = Math.max(sp[i].bezet, sp[i - 1].bezet);
      const fout = Math.max(sp[i].fout, sp[i - 1].fout);
      const ms = Math.max(sp[i].ms, sp[i - 1].ms);
      const opgelopen = basis > 0 && ms > basis * 1.15;
      const drukGenoeg = bezet >= d.bezetOp;
      // "Ongevraagd" = geen fouten, geen oplopende responstijd, én ook niet
      // druk genoeg om de bezettingstak te verklaren.
      remmen.push({ i: i, fout: fout, ms: ms, basis: basis, bezet: bezet,
                    terecht: fout > 0 || opgelopen || drukGenoeg });
    }
    if (!remmen.length) return 'geen enkele stap omlaag in dit spoor';

    const ongevraagd = remmen.filter(function (r) { return !r.terecht; });
    const kop = remmen.length + ' remmomenten, waarvan ' + ongevraagd.length + ' zonder fouten én zonder oplopende responstijd';
    if (!ongevraagd.length) return kop + ' — de regelkring reageerde steeds op iets echts';

    const v = ongevraagd.slice(0, 4).map(function (r) {
      return 'bezet ' + r.bezet + '%, fout ' + r.fout + '%, ' + r.ms + ' ms (mediaan 30 s ervoor ' + r.basis + ' ms)';
    }).join(' | ');
    return { staat: 'LET OP', detail: kop + '.  Voorbeelden: ' + v };
  });

  await _doe(7, 'Zegt bezetting iets over de responstijd?', function () {
    // Als de responstijd niet meebeweegt met de bezetting, is bezetting op deze
    // bus geen bruikbaar tegendruksignaal — dan meet hij alleen hoe hard wíj
    // vragen, niet hoe zwaar de ECU het heeft.
    const laag = sp.filter(function (m) { return m.bezet < d.bezetAf; }).map(function (m) { return m.ms; });
    const hoog = sp.filter(function (m) { return m.bezet >= d.bezetOp; }).map(function (m) { return m.ms; });
    if (!laag.length || !hoog.length)
      return 'te weinig spreiding in de bezetting om te vergelijken (laag ' + laag.length + ', hoog ' + hoog.length + ' monsters)';
    const mLaag = med(laag), mHoog = med(hoog);
    const verschil = mLaag ? Math.round((mHoog - mLaag) / mLaag * 100) : 0;
    const tekst = 'responstijd bij lage bezetting ' + mLaag + ' ms, bij hoge bezetting ' + mHoog + ' ms (' +
      (verschil >= 0 ? '+' : '') + verschil + '%)';
    if (Math.abs(verschil) < 15)
      return { staat: 'LET OP', detail: tekst + ' — vrijwel geen verschil, dus bezetting voorspelt hier geen tegendruk' };
    return tekst;
  });

  await _doe(7, 'Foutbeeld', function () {
    const f = sp.map(function (m) { return m.fout; });
    const nul = f.filter(function (x) { return x === 0; }).length;
    const piek = Math.max.apply(null, f);
    const runPiek = eigen ? Math.max.apply(null, alles.filter(function (m) { return m.run; }).map(function (m) { return m.fout; })) : 0;
    return Math.round(nul / f.length * 100) + '% van de monsters had 0% fouten, hoogste foutgraad ' + piek + '%' +
      (runPiek > piek ? '   [tijdens testruns liep hij op tot ' + runPiek + '% — dat is de run zelf, niet de auto]' : '');
  });

  _boek(7, 'Slotsom', 'ok',
    'Ongevraagde remmomenten > 0 én bezetting voorspelt geen responstijd = het vermoeden uit PLAN.md punt 2 klopt; ' +
    'de tegendruk moet dan aan responstijd/fouten hangen, niet aan bezetting. ' +
    '0 ongevraagde remmomenten = het vermoeden klopt niet en punt 2 kan dicht.', null);
}

// ══════════════════════════════════════════════════════════════════
// BLOK 8 — WAAR ZIT DE OLIETEMPERATUUR? (PLAN.md punt 4)
// ══════════════════════════════════════════════════════════════════
// GEMETEN 19-08. Alle drie kandidaten gaven NO DATA; 22111F op header 7E0 gaf
// 7F 22 31 (requestOutOfRange), dus mode 22 leeft maar die identifier niet.
// 2101 is daarop uit UITGEBREID_DEFS verwijderd. Dit blok blijft draaien als
// controle: goedkoop, en een antwoord dat er nu wél is verandert de conclusie.
//
// De aanleiding, voor wie de geschiedenis nodig heeft. PLAN.md zei "mode 22 PID
// 2101, al gedefinieerd maar nergens opgevraagd". Dat klopte op twee punten niet:
//
//   1. `2101` is in dit project mode 21 PID 01, niet mode 22. Zie de kop van
//      pidlane-uitgebreid.js: een mode-22 identifier is twee bytes ('22'+'111F')
//      en past niet in de vier-tekens-sleutelconventie.
//   2. Het wordt WEL opgevraagd. pidlane-bt.js roept probeUitgebreid() aan na
//      het verbinden — in een stille catch, dus als dat faalt zie je niets.
//
// En er is een derde kandidaat die de code niet kent. In het veld circuleert
// voor SkyActiv al jaren mode 22 met identifier 111F, header 7E0, waarde A−50.
// De code gokt op mode 21 PID 01 met A−40. Twee onbewezen aannames naast
// elkaar, en geen van beide is ooit tegen deze auto gehouden.
//
// Dit blok kiest niet. Het vraagt alle kandidaten op, logt de rauwe bytes, en
// rekent beide schalingen uit naast het koelwater als plausibiliteitsanker:
// warme olie zit boven de koelwatertemperatuur en zelden meer dan ~40 °C erboven.
// Wat de rit oplevert, beslist welke definitie in pidlane-uitgebreid.js hoort.
//
// Alles is lezend. Mode 22 is ReadDataByIdentifier — er wordt niets geschreven.
const OLIE_KANDIDATEN = [
  ['2101',   'mode 21 PID 01 — op 19-08 dood bevonden, blijft als controle'],
  ['22111F', 'mode 22 DID 111F — de SkyActiv-kandidaat uit het veld'],
  ['015C',   'mode 01 PID 5C — de standaard, bekend dood op deze CX-5']
];

async function _blok8() {
  if (typeof connected === 'undefined' || !connected) { _boek(8, 'Olietemperatuur', 'overgeslagen', 'geen verbinding', null); return; }
  if (typeof demoMode !== 'undefined' && demoMode) { _boek(8, 'Olietemperatuur', 'overgeslagen', 'demomodus', null); return; }

  let tok = 0;
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-olie', 8000) : 0; } catch (e) {}
  _boek(8, 'Busslot', tok ? 'ok' : 'LET OP', tok ? 'bus geclaimd' : 'niet vrijgekomen — metingen lopen naast de pollus', null);

  const leeg = function (r) { return !r || /NO DATA|UNABLE|ERROR|STOPPED|\?/i.test(String(r)); };
  const hex = function (r) { return String(r || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); };

  let headerGezet = false;

  try {
    // ── Wat zegt de app er zelf al over? ──
    await _doe(8, 'Stand van zaken in de app', function () {
      const uit = [];
      try { uit.push('2101 in supportedPIDs: ' + ((typeof supportedPIDs !== 'undefined' && supportedPIDs.has('2101')) ? 'JA' : 'nee')); } catch (e) { uit.push('supportedPIDs onleesbaar'); }
      try { uit.push('015C dood volgens PLSched: ' + ((window.PLSched && PLSched.dood && PLSched.dood('015C')) ? 'JA' : 'nee')); } catch (e) {}
      try { uit.push('probeUitgebreid bestaat: ' + (typeof probeUitgebreid === 'function' ? 'JA' : 'NEE')); } catch (e) {}
      try {
        const k = (window.PLUitgebreid && PLUitgebreid.kandidaten) ? PLUitgebreid.kandidaten() : null;
        uit.push('kandidaten volgens merkfilter: ' + (k ? (k.length ? k.join(', ') : 'GEEN — merk onbekend of gefilterd') : 'onbekend'));
      } catch (e) {}
      return uit.join('  |  ');
    });

    // ── Koelwater als anker ──
    let koel = null;
    try {
      const rk = await sendCmd('0105', 2500);
      if (!leeg(rk)) {
        const h = hex(rk), i = h.indexOf('4105');
        if (i >= 0) koel = parseInt(h.substr(i + 4, 2), 16) - 40;
      }
    } catch (e) {}
    _boek(8, 'Koelwater (0105)', koel == null ? 'LET OP' : 'ok',
      koel == null ? 'niet gelezen — plausibiliteit is dan niet te beoordelen' : koel + ' °C', null);
    await _wacht(120);

    // ── Protocol: mag ik een header zetten? ──
    let protocol = '';
    try { protocol = String(await sendCmd('ATDPN', 1500) || '').trim(); } catch (e) {}
    const canElfBit = /^A?6$/i.test(protocol.replace(/[^0-9A-Za-z]/g, ''));
    _boek(8, 'Protocol', 'ok', 'ATDPN = "' + protocol + '"' +
      (canElfBit ? '  (11-bit CAN 500k — header 7E0 mag)' : '  (geen 11-bit CAN — headertest wordt overgeslagen)'), null);

    // ── De kandidaten, één voor één ──
    for (const [pid, wat] of OLIE_KANDIDATEN) {
      if (_trStop) break;
      if (VERBODEN.test(pid)) { _boek(8, pid, 'overgeslagen', 'staat op de verbodenlijst', null); continue; }
      // 015C staat hier als referentie, maar de steunbits zeggen het al. Eén
      // leeg antwoord is weinig, maar dit blok draait bij elke run en de
      // uitkomst ligt vast — dan is vragen zonde van de bus.
      if (typeof ecuSteunt === 'function' && ecuSteunt(pid) === false) {
        _boek(8, pid, 'ok', wat + '  |  niet opgevraagd: de ECU ontkent hem in de steunbits', null);
        continue;
      }

      const bevinding = [wat];
      const t0 = _nu();
      let raw = '';
      try { raw = await sendCmd(pid, 3000); } catch (e) { raw = 'FOUT: ' + (e.message || e); }
      const ms = _nu() - t0;
      const h = hex(raw);
      bevinding.push('ruw: ' + (String(raw || '—').replace(/\s+/g, ' ').trim().slice(0, 30)));

      // Verwachte positieve header: mode + 0x40, gevolgd door de identifier.
      const mode = parseInt(pid.slice(0, 2), 16);
      const kop = ((mode + 0x40).toString(16).toUpperCase().padStart(2, '0')) + pid.slice(2).toUpperCase();
      const i = h.indexOf(kop);

      // Negatief antwoord van de ECU herkennen: 7F <mode> <reden>. Dat is iets
      // anders dan NO DATA — de ECU heeft het gehoord en weigert bewust.
      const neg = h.indexOf('7F' + pid.slice(0, 2).toUpperCase());
      if (neg >= 0) {
        const reden = h.substr(neg + 4, 2);
        const uitleg = { '11': 'service niet ondersteund', '12': 'subfunctie niet ondersteund',
                         '31': 'identifier buiten bereik', '22': 'condities niet goed', '33': 'beveiliging' }[reden] || 'reden ' + reden;
        bevinding.push('ECU WEIGERT: 7F ' + pid.slice(0, 2) + ' ' + reden + ' — ' + uitleg);
        _boek(8, pid, 'LET OP', bevinding.join('  |  '), ms);
        await _wacht(180);
        continue;
      }

      if (leeg(raw) || i < 0) {
        bevinding.push(leeg(raw) ? 'geen bruikbaar antwoord' : 'antwoord bevat de kop ' + kop + ' niet');
        _boek(8, pid, 'LET OP', bevinding.join('  |  '), ms);
        await _wacht(180);
        continue;
      }

      // Databytes achter de kop. Beide gangbare offsets uitrekenen en tegen het
      // koelwater houden — de rit beslist welke klopt, niet dit bestand.
      const bytes = h.slice(i + kop.length);
      const A = parseInt(bytes.substr(0, 2), 16);
      bevinding.push('databytes: ' + bytes.slice(0, 12));
      if (isFinite(A)) {
        const m40 = A - 40, m50 = A - 50;
        bevinding.push('A=' + A + ' → A−40 = ' + m40 + ' °C, A−50 = ' + m50 + ' °C');
        if (koel != null) {
          const oordeel = function (v) {
            if (v < koel - 15) return 'onder koelwater';
            if (v > koel + 60) return 'onwaarschijnlijk hoog';
            return 'PLAUSIBEL';
          };
          bevinding.push('t.o.v. koelwater ' + koel + ' °C: A−40 ' + oordeel(m40) + ', A−50 ' + oordeel(m50));
        }
      }
      _boek(8, pid, 'ok', bevinding.join('  |  '), ms);
      await _wacht(180);
    }

    // ── Mode 22 nog eens, nu gericht aan het motorblok ──
    // Het veld noemt header 7E0. Zonder header gaat het verzoek functioneel
    // (7DF) de bus op en mag elk stuurapparaat antwoorden — of geen enkel.
    if (canElfBit && !_trStop) {
      await _doe(8, 'Mode 22 met header 7E0', async function () {
        try { await sendCmd('ATSH7E0', 1500); headerGezet = true; } catch (e) { return { staat: 'LET OP', detail: 'ATSH7E0 geweigerd' }; }
        let r = '';
        try { r = await sendCmd('22111F', 3000); } catch (e) {}
        const h = hex(r);
        const i = h.indexOf('62111F');
        if (i >= 0) {
          const A = parseInt(h.substr(i + 6, 2), 16);
          return 'ANTWOORD op 7E0: bytes ' + h.slice(i + 6, i + 14) + '  A=' + A +
                 ' → A−40 = ' + (A - 40) + ' °C, A−50 = ' + (A - 50) + ' °C' +
                 (koel != null ? '  (koelwater ' + koel + ' °C)' : '');
        }
        // Een 7F is géén stilte. 7F 22 11 betekent dat mode 22 niet bestaat op
        // dit adres; 7F 22 31 betekent dat mode 22 wél leeft en alleen déze
        // identifier onbekend is. Dat tweede is de opening voor de DID-scan
        // hieronder, dus het onderscheid moet in het log staan.
        const n = h.indexOf('7F22');
        if (n >= 0) {
          const reden = h.substr(n + 4, 2);
          if (reden === '31')
            return { staat: 'LET OP', detail: '7F 22 31 — mode 22 LEEFT op 7E0, identifier 111F bestaat niet. Draai de DID-scan.' };
          return { staat: 'LET OP', detail: '7F 22 ' + reden + ' — mode 22 geweigerd op 7E0 (' +
            ({ '11': 'service niet ondersteund', '12': 'subfunctie onbekend', '22': 'condities niet goed', '33': 'beveiliging' }[reden] || 'onbekende reden') + ')' };
        }
        return { staat: 'LET OP', detail: 'geen 62111F en geen 7F — ruw: ' + String(r || '—').replace(/\s+/g, ' ').slice(0, 30) };
      });
    }

    _boek(8, 'Slotsom', 'ok',
      'Op 19-08 gaven alle drie NO DATA en gaf 22111F op 7E0 een 7F 22 31: mode 22 leeft, ' +
      'identifier 111F bestaat niet. Deze drie blijven staan als controle — komt er nu wél ' +
      'een antwoord, dan hing het aan een voorwaarde die toen niet gold (koude motor, ' +
      'contact zonder lopende motor, ander stuurapparaat wakker). Blijft alles stil, ' +
      'dan is blok 9 de volgende stap.', null);

  } finally {
    // Header ALTIJD terugzetten naar de functionele broadcast. Blijft 7E0 staan,
    // dan praat de hele app daarna alleen nog tegen het motorblok — en dat merk
    // je pas als een andere module niets meer terugkrijgt.
    if (headerGezet) { try { await sendCmd('ATSH7DF', 1500); } catch (e) {} }
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch (e) {}
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 9 — DID-SCAN OVER MODE 22 (los te draaien)
// ══════════════════════════════════════════════════════════════════
// Draait NIET mee in de gewone run. Blok 8 van 19-08 leverde `7F 22 31` op
// header 7E0: mode 22 leeft, identifier 111F bestaat niet. Daarmee is de vraag
// niet meer "praat deze ECU mode 22" maar "op welke identifier".
//
// De reeks 11xx is de gok met de beste onderbouwing — de gedeelde Mazda-lijsten
// zitten daar (111F voor olie, 1177 voor MAF-spanning). 256 aanvragen à ~160 ms
// is ongeveer 45 seconden. Dat is te doen; blind alle 65536 DIDs niet.
//
// Wat een treffer is: een antwoord dat met 62 begint in plaats van 7F. De
// identifier bestaat dan. Wat het betekent staat er niet bij — dat is
// handwerk achteraf, met de waarde naast koelwater, toerental en luchtmassa.
//
// Alles lezend. Mode 22 schrijft niet.
async function _blok9() {
  if (typeof connected === 'undefined' || !connected) { _boek(9, 'DID-scan', 'overgeslagen', 'geen verbinding', null); return; }
  if (typeof demoMode !== 'undefined' && demoMode) { _boek(9, 'DID-scan', 'overgeslagen', 'demomodus', null); return; }

  let tok = 0;
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-did', 8000) : 0; } catch (e) {}
  let headerGezet = false;
  const hex = function (r) { return String(r || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); };

  try {
    let proto = '';
    try { proto = String(await sendCmd('ATDPN', 1500) || '').trim(); } catch (e) {}
    if (!/^A?6$/i.test(proto.replace(/[^0-9A-Za-z]/g, ''))) {
      _boek(9, 'DID-scan', 'overgeslagen', 'geen 11-bit CAN (ATDPN = "' + proto + '")', null);
      return;
    }
    try { await sendCmd('ATSH7E0', 1500); headerGezet = true; }
    catch (e) { _boek(9, 'DID-scan', 'LET OP', 'ATSH7E0 geweigerd', null); return; }

    // Koelwater als ijkpunt: een olietemperatuur moet daar in de buurt liggen.
    let koel = null;
    try {
      const rk = await sendCmd('0105', 2500), h = hex(rk), i = h.indexOf('4105');
      if (i >= 0) koel = parseInt(h.substr(i + 4, 2), 16) - 40;
    } catch (e) {}

    _boek(9, 'Scan gestart', 'ok', 'reeks 2211xx op header 7E0, 256 identifiers' +
      (koel != null ? '  |  koelwater ' + koel + ' °C' : ''), null);

    const treffers = [];
    let geweigerd = 0, stil = 0;
    const t0 = _nu();

    for (let n = 0; n < 256 && !_trStop; n++) {
      const did = '11' + n.toString(16).toUpperCase().padStart(2, '0');
      let r = '';
      try { r = await sendCmd('22' + did, 1200); } catch (e) {}
      const h = hex(r);
      const i = h.indexOf('62' + did);
      if (i >= 0) {
        const bytes = h.slice(i + 6, i + 18);
        const A = parseInt(bytes.substr(0, 2), 16);
        treffers.push({ did: did, bytes: bytes, A: A });
      } else if (h.indexOf('7F22') >= 0) geweigerd++;
      else stil++;
      await _wacht(20);
    }

    const duur = Math.round((_nu() - t0) / 1000);
    _boek(9, 'Scan klaar', 'ok', treffers.length + ' identifiers antwoorden, ' + geweigerd +
      ' geweigerd met 7F, ' + stil + ' stil  |  ' + duur + ' s', null);

    if (!treffers.length) {
      _boek(9, 'Slotsom', 'LET OP',
        'Geen enkele 11xx-identifier bestaat op 7E0. Mode 22 leeft wel, dus de olietemperatuur ' +
        'zit in een andere reeks of op een ander stuurapparaat (7E1 = transmissie). Verder ' +
        'zoeken heeft alleen zin met een echte Mazda-DID-lijst, niet met raden.', null);
      return;
    }

    // Alles tonen, met de temperatuur-verdachten apart. Een byte die als A−40
    // of A−50 vlak bij het koelwater uitkomt is een kandidaat — meer niet.
    for (const t of treffers) {
      const merk = [];
      if (isFinite(t.A) && koel != null) {
        if (Math.abs((t.A - 40) - koel) < 25) merk.push('A−40 = ' + (t.A - 40) + ' °C, dicht bij koelwater');
        if (Math.abs((t.A - 50) - koel) < 25) merk.push('A−50 = ' + (t.A - 50) + ' °C, dicht bij koelwater');
      }
      _boek(9, '22' + t.did, merk.length ? 'LET OP' : 'ok',
        'bytes ' + t.bytes + (merk.length ? '  [VERDACHT: ' + merk.join('; ') + ']' : ''), null);
    }

    _boek(9, 'Slotsom', 'ok',
      'Een identifier die antwoordt bestaat — wat hij betekent niet. Toets een verdachte door ' +
      'twee keer te meten: koud en warm. Loopt hij mee met het koelwater maar trager, dan is het ' +
      'de olie. Blijft hij staan, dan is het iets anders.', null);

  } finally {
    if (headerGezet) { try { await sendCmd('ATSH7DF', 1500); } catch (e) {} }
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch (e) {}
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 10 — SNELHEIDSPROEF: HOE SCHOON KAN DEZE VERBINDING?
// ══════════════════════════════════════════════════════════════════
// DE VRAAG (PLAN.md punt 2b)
// Op 21-08 om 11:36 stond de bus op gemMs 950 terwijl het venster op 148 ms
// zat, met 12 onvolledige verzoeken en tempoPct 30 dat binnen 500 s niet meer
// boven de 55% kwam. Om 11:47 was het beeld milder maar niet weg: 0% fouten in
// álle monsters en tóch een tempo van 56%. De missers zaten verspreid over alle
// gepollde PIDs, één of twee per stuk — geen enkele sensor stak eruit. Dat
// sluit een fantoom-PID uit en wijst op het transport.
//
// Blok 7 kijkt naar wat de app dóét. Dit blok kijkt naar wat de verbinding
// KAN. Het zet PLLoad buitenspel, polt zelf met vaste dichtheden, en meet waar
// het knikt.
//
// DE OPZET — vijf trappen van 70 s, met rust ertussen
//
//   ijking   ~25 s  welke PIDs antwoorden gegarandeerd
//   trap 1    70 s  één verzoek per 1000 ms   rustig
//   rust      30 s  alleen een prik per 5 s
//   trap 2    70 s  per 500 ms
//   rust      30 s
//   trap 3    70 s  per 250 ms
//   rust      30 s
//   trap 4    70 s  per 120 ms
//   rust      30 s
//   trap 5    70 s  zo snel als de adapter aankan
//   narust    45 s  herstelt de responstijd, en hoe snel
//
// Samen ongeveer 9,5 minuut.
//
// WAAROM EERST IJKEN
// Zonder ijking meet je twee dingen tegelijk: transportfouten en dode sensoren.
// Op 20-08 kwamen ALLE 18 missers van een run van vier PIDs die de ECU ontkent
// — dat gaf 15% foutgraad en een pollbudget van 55%, en het leek alsof de bus
// het niet aankon. De ijkronde vraagt elke kandidaat één keer op en houdt
// alleen over wat écht antwoordt. Daarna is elke misser een echte fout.
//
// WAAROM RUST TUSSEN DE TRAPPEN
// Dat is de eigenlijke vraag. Een adapter die onder druk trager wordt is
// normaal; een adapter die daarna niet meer bijkomt is een buffer die
// volloopt. De prik van één verzoek per 5 s belast niets en laat zien of de
// latentie terugzakt naar de waarde van vóór de trap.
//
// WAAROM PER TRAP CLAIMEN EN NIET ÉÉN KEER VOOR ALLES
// PLBus.MAX_HOLD_MS staat op 180 s: een houder die langer blijft wordt door de
// volgende claim afgebroken. Tien minuten vasthouden zou dus halverwege
// stilletjes worden weggenomen. Per trap claimen (70 s) blijft ruim binnen die
// grens, en tijdens de rust is de bus vrij — wat meteen realistischer is.
// ══════════════════════════════════════════════════════════════════

const SNELHEID_TRAPPEN = [
  { naam: 'trap 1', pauze: 1000, sec: 70 },
  { naam: 'trap 2', pauze:  500, sec: 70 },
  { naam: 'trap 3', pauze:  250, sec: 70 },
  { naam: 'trap 4', pauze:  120, sec: 70 },
  { naam: 'trap 5', pauze:    0, sec: 70 }
];
const SNELHEID_RUST_S = 30;
const SNELHEID_NARUST_S = 45;

function _pctl(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort(function (a, b) { return a - b; });
  const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[i];
}

function _wacht(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Eén verzoek. Geeft {ms, ok} terug. "ok" betekent: er kwam een antwoord dat
// parsePID kon lezen. Leeg, NO DATA, timeout en fout tellen allemaal als misser
// — na de ijking is dat allemaal transport.
async function _snelheidVraag(pid) {
  const t0 = _nu();
  let raw = '';
  try { raw = await sendCmd(pid, 2500); } catch (e) { raw = ''; }
  const ms = _nu() - t0;
  let ok = false;
  try {
    if (raw && !/NO DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) {
      const w = (typeof parsePID === 'function') ? parsePID(pid, raw) : null;
      ok = (w !== null && w !== undefined && !(typeof w === 'number' && isNaN(w)));
    }
  } catch (e) { ok = false; }
  return { ms: ms, ok: ok };
}

async function _blok10() {
  if (typeof connected === 'undefined' || !connected) {
    _boek(10, 'Snelheidsproef', 'overgeslagen', 'geen verbinding', null); return;
  }
  if (typeof demoMode !== 'undefined' && demoMode) {
    _boek(10, 'Snelheidsproef', 'overgeslagen', 'demomodus — dit meet de adapter, niet de app', null); return;
  }

  // ── ijking ──
  let kandidaten = [];
  try {
    if (typeof supportedPIDs !== 'undefined' && supportedPIDs.size) kandidaten = Array.from(supportedPIDs);
    else if (typeof activePIDs !== 'undefined') kandidaten = Array.from(activePIDs);
  } catch (e) {}
  kandidaten = kandidaten.filter(function (p) { return p && !VERBODEN.test(p); });
  if (typeof ecuSteunt === 'function')
    kandidaten = kandidaten.filter(function (p) { return ecuSteunt(p) !== false; });

  // Voorkeur voor sensoren die continu veranderen en die elke motor heeft.
  // Die geven bij herhaald opvragen echte antwoorden en geen gecachet blok.
  const voorkeur = ['010C', '010D', '0104', '0105', '010B', '010F', '0111', '0142', '0146'];
  kandidaten.sort(function (a, b) {
    const ia = voorkeur.indexOf(a), ib = voorkeur.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  kandidaten = kandidaten.slice(0, 12);

  if (!kandidaten.length) { _boek(10, 'Snelheidsproef', 'overgeslagen', 'geen bruikbare PIDs', null); return; }

  _boek(10, 'IJking', 'bezig', kandidaten.length + ' kandidaten, elk één proefvraag', null);

  const set = [];
  let ijkTok = 0;
  try { ijkTok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-snelheid-ijk', 8000) : 0; } catch (e) {}
  try {
    for (let i = 0; i < kandidaten.length && set.length < 8; i++) {
      if (_trStop) break;
      const r = await _snelheidVraag(kandidaten[i]);
      if (r.ok) set.push(kandidaten[i]);
      await _wacht(60);
    }
  } finally {
    try { if (ijkTok && window.PLBus && PLBus.release) PLBus.release(ijkTok); } catch (e) {}
  }

  if (set.length < 3) {
    _boek(10, 'IJking', 'FOUT', 'maar ' + set.length + ' van ' + kandidaten.length +
      ' PIDs antwoordden — met zo weinig is de proef niet te vertrouwen. ' +
      'Draait de motor? Staat de verbinding?', null);
    return;
  }
  _boek(10, 'IJking', 'ok', set.length + ' PIDs antwoorden gegarandeerd: ' + set.join(', ') +
    ' — vanaf hier is elke misser transport, geen dode sensor', null);

  const uitslag = [];
  let basis = null;     // mediaan van de rustigste trap, als ijkpunt voor herstel

  // ── de trappen ──
  for (let t = 0; t < SNELHEID_TRAPPEN.length; t++) {
    if (_trStop) { _boek(10, 'Snelheidsproef', 'gestopt', 'afgebroken na ' + t + ' trappen', null); break; }
    const trap = SNELHEID_TRAPPEN[t];

    let tok = 0;
    try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-snelheid', 8000) : 0; } catch (e) {}
    if (!tok) _boek(10, trap.naam, 'LET OP', 'bus niet vrijgekomen — deze trap loopt naast de pollus en telt dus mee met vreemd verkeer', null);

    const tijden = [];
    let n = 0, mis = 0, i = 0;
    const eind = _nu() + trap.sec * 1000;
    try {
      while (_nu() < eind && !_trStop) {
        const r = await _snelheidVraag(set[i % set.length]);
        i++; n++;
        if (r.ok) tijden.push(r.ms); else mis++;
        if (trap.pauze) await _wacht(trap.pauze);
      }
    } finally {
      try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch (e) {}
    }

    const med = _pctl(tijden, 0.5), p90 = _pctl(tijden, 0.9), max = tijden.length ? Math.max.apply(null, tijden) : 0;
    const misPct = n ? Math.round(mis / n * 100) : 0;
    const perSec = +(n / trap.sec).toFixed(1);
    if (basis === null && med) basis = med;

    uitslag.push({ naam: trap.naam, pauze: trap.pauze, n: n, mis: mis, misPct: misPct, perSec: perSec, med: med, p90: p90, max: max });

    // Alleen de trap zelf is FOUT-waardig als er missers vallen: na de ijking
    // hoort elk verzoek een antwoord te krijgen.
    _boek(10, trap.naam + ' — ' + (trap.pauze ? 'per ' + trap.pauze + ' ms' : 'zo snel mogelijk'),
      misPct > 0 ? 'LET OP' : 'ok',
      n + ' verzoeken (' + perSec + '/s), ' + mis + ' mis (' + misPct + '%), ' +
      'mediaan ' + med + ' ms, p90 ' + p90 + ' ms, traagste ' + max + ' ms' +
      (basis && med ? ', ' + (med >= basis ? '+' : '') + Math.round((med - basis) / basis * 100) + '% tegenover trap 1' : ''),
      null);

    // ── rust ──
    const rustSec = (t === SNELHEID_TRAPPEN.length - 1) ? SNELHEID_NARUST_S : SNELHEID_RUST_S;
    const prikken = [];
    const rustEind = _nu() + rustSec * 1000;
    let eersteHerstel = null;
    while (_nu() < rustEind && !_trStop) {
      await _wacht(5000);
      if (_trStop) break;
      let ptok = 0;
      try { ptok = (window.PLBus && PLBus.claim) ? PLBus.claim('testrun-snelheid-prik') : 0; } catch (e) {}
      const r = await _snelheidVraag(set[0]);
      try { if (ptok && window.PLBus && PLBus.release) PLBus.release(ptok); } catch (e) {}
      if (r.ok) {
        prikken.push(r.ms);
        if (eersteHerstel === null && basis && r.ms <= basis * 1.25)
          eersteHerstel = Math.round((rustSec * 1000 - (rustEind - _nu())) / 1000);
      }
    }

    if (prikken.length) {
      // Oordelen op de MEDIAAN van de laatste drie prikken, niet op de laatste.
      // De eerste versie keek naar één enkele meting, en op 21-08 bleek hoe
      // waardeloos dat is: de spreiding liep van 72 tot 364 ms, dus het oordeel
      // hing aan toeval. De rust na trap 5 kreeg "hersteld" (laatste 149) bij
      // een mediaan van 177, terwijl de rust na trap 1 "NIET hersteld" kreeg
      // (laatste 170) bij een mediaan van 151 — precies omgekeerd. Vier van de
      // vijf LET OP's in die run waren ruis.
      const staart = prikken.slice(-3);
      const nu = _pctl(staart, 0.5);
      const alles = _pctl(prikken, 0.5);
      const terug = (basis && nu <= basis * 1.25);
      _boek(10, 'rust na ' + trap.naam, terug ? 'ok' : 'LET OP',
        rustSec + ' s stil, ' + prikken.length + ' prikken: ' + prikken.join(', ') + ' ms' +
        ' — mediaan ' + alles + ' ms, laatste drie ' + nu + ' ms' +
        (basis ? ', trap 1 zat op ' + basis + ' ms: ' +
          (terug ? 'hersteld' + (eersteHerstel === null ? '' : ' binnen ' + eersteHerstel + ' s')
                 : 'blijft ' + Math.round((nu - basis) / basis * 100) + '% hoger') : ''),
        null);
    }
  }

  // ── slotsom ──
  if (uitslag.length >= 2) {
    const schoon = uitslag.filter(function (u) { return u.misPct === 0; });
    const snelste = schoon.length ? schoon[schoon.length - 1] : null;
    const knik = uitslag.filter(function (u) { return u.misPct > 0; })[0] || null;

    _boek(10, 'Wat deze verbinding aankan', snelste ? 'ok' : 'LET OP',
      (snelste
        ? 'zonder één misser tot ' + snelste.perSec + ' verzoeken/s (' + snelste.naam +
          ', mediaan ' + snelste.med + ' ms)'
        : 'geen enkele trap bleef foutloos') +
      (knik ? '. Eerste missers bij ' + knik.naam + ': ' + knik.misPct + '% op ' + knik.perSec + '/s'
            : '. Geen enkele trap gaf missers — de adapter is niet de beperking'),
      null);

    // De vergelijking waar het om begonnen is: loopt de latentie op met de
    // dichtheid, of springt hij pas op één punt weg?
    const rij = uitslag.map(function (u) {
      return u.naam + ' ' + u.perSec + '/s → ' + u.med + ' ms' + (u.misPct ? ' (' + u.misPct + '% mis)' : '');
    }).join('  |  ');
    _boek(10, 'Verloop', 'ok', rij, null);

    // En de vergelijking met wat de app op dat moment dacht.
    let ld = null;
    try { ld = (window.PLLoad && PLLoad.staat) ? PLLoad.staat() : null; } catch (e) {}
    let bs = null;
    try { bs = (window.PLBus && PLBus.stats) ? PLBus.stats() : null; } catch (e) {}
    if (ld || bs) {
      // Dit is de regel waar het om gaat. Op 21-08 stond hier "tempo 18%" bij
      // 0% fouten, terwijl de proef er net 9,1 verzoeken per seconde foutloos
      // doorheen had geduwd. De app schroefde dus terug op bezetting, en
      // bezetting is aanvraagtempo x responstijd — juist een SNELLE bus haalt
      // daar een hoog percentage. Zie PLAN.md punt 13.
      const snel = (uitslag.filter(function (u) { return u.misPct === 0; }).pop() || null);
      let oordeel = 'ok';
      if (ld && snel && bs && bs.foutPct === 0 && ld.tempoPct < 50)
        oordeel = 'LET OP';
      _boek(10, 'Stand van de app na de proef', oordeel,
        (ld ? 'tempo ' + ld.tempoPct + '%' : '') +
        (bs ? ', bus ' + bs.belasting + '% bezet, fout ' + bs.foutPct + '%, gem ' + bs.gemMs +
              ' ms (venster ' + bs.venGemMs + ' ms)' : '') +
        (oordeel === 'LET OP' && snel
          ? ' — de app staat op ' + ld.tempoPct + '% terwijl de verbinding zonder één misser ' +
            snel.perSec + '/s aankan. Terugschroeven op bezetting terwijl de foutgraad 0 is.'
          : ''),
        null);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// BLOK 5 — WAT ER IN DEZE UPDATE VERANDERD IS
// ══════════════════════════════════════════════════════════════════
// Dit blok hoort bij CAMPAGNE onderaan: daar staat de vráag, hier staat de
// controle. Zonder dit is de testrun een algemene meting en zie je niet of de
// wijziging van gisteren het ook echt doet — je ziet alleen dat de app nog
// draait.
//
// Herschrijf dit blok bij elke update, samen met CAMPAGNE. Twee soorten
// controles horen er altijd in:
//   TOEGEVOEGD  bestaat het nieuwe, en werkt het (niet: staat het in de bron)
//   VERWIJDERD  is het oude écht weg, of hangt er nog een restant
// Die tweede is de belangrijkste en het makkelijkst te vergeten: op 16-08 zijn
// zes ingangen gesloopt, en een achtergebleven verwijzing merk je pas als een
// klant erop drukt.
async function _blok5() {

  // ── TOEGEVOEGD 21-08 (avond): versies lopen niet meer uiteen ──
  await _doe(5, 'Versienummer klopt', function () {
    // package.json zei 2.1.0, config.js zei 2.9.0. De CI zet versionName uit
    // package.json, dus een gebruiker die "2.9.0" in het loginscherm zag had
    // een APK met versionName 2.1.0 op zijn toestel — en bij een bugmelding
    // zoek je dan in de verkeerde build. De app kan package.json niet lezen;
    // test-versie.js doet die vergelijking. Hier tonen we wat er draait.
    let v = '?';
    try { v = (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : '?'; } catch (e) {}
    if (v === '?') return { staat: 'FOUT', detail: 'APP_VERSION niet beschikbaar — config.js niet geladen?' };
    if (!/^\d+\.\d+\.\d+$/.test(v))
      return { staat: 'FOUT', detail: 'APP_VERSION "' + v + '" is geen semver — Play weigert dat als versionName' };
    return 'app ' + v + ', testrun ' + TESTRUN_VERSIE;
  });

  // ── VERWIJDERD 21-08 (avond): alle locatiefunctionaliteit ──
  await _doe(5, 'De app leest geen locatie meer', function () {
    // Drie verklaringen hangen hieraan: de Data safety-form, privacy.html en
    // het disclosurescherm. Eén teruggekeerde positie-aanroep maakt ze alle
    // drie onwaar, en dat merk je pas in een reviewmail.
    //
    // Deze controle kijkt naar GEDRAG, niet naar de bron. Twee redenen: de
    // wrappers in pidlane-remote.js maken broncode-inspectie in deze codebase
    // onbetrouwbaar, én test-geen-gps.js zou aanslaan op de zoekwoorden die
    // hier dan letterlijk zouden staan — die test scant álle modules, deze
    // erbij.
    if (typeof PLGps !== 'undefined')
      return { staat: 'FOUT', detail: 'PLGps bestaat nog — pidlane-gps.js is terug' };
    let s = {};
    try { s = (window.PLBulk && typeof PLBulk.status === 'function') ? PLBulk.status() : {}; } catch (e) {}
    if (Object.prototype.hasOwnProperty.call(s, 'gps'))
      return { staat: 'FOUT', detail: 'PLBulk.status() heeft nog een positieveld' };
    // blkStat is het statusblok in het recorderdashboard (pidlane-bulk.js
    // regel 555). Niet blkDash — die bestaat niet, en een getElementById op
    // een verzonnen id geeft null, waarna deze regel stilletjes altijd slaagt.
    const rij = document.getElementById('blkStat');
    if (rij && /GPS/.test(rij.innerHTML || ''))
      return { staat: 'FOUT', detail: 'het recorderdashboard toont nog een GPS-regel' };
    return 'geen PLGps, geen positie in de recorder';
  });

  // ── VERWIJDERD 21-08 (avond): de dode wizard-HTML ──
  await _doe(5, 'Wizard-HTML is opgeruimd', function () {
    const weg = ['wizS1', 'wizS2', 'wizS3', 'wizS4', 'wizS5', 'wizStepBar']
      .filter(function (id) { return !!document.getElementById(id); });
    if (weg.length)
      return { staat: 'FOUT', detail: 'staat nog in index.html: ' + weg.join(', ') };
    if (!document.getElementById('wizS6'))
      return { staat: 'FOUT', detail: 'de samenvatting is óók weg — te veel gesloopt' };
    const dood = ['wizNext', 'wizRdwLookup', 'wizToggleDetail']
      .filter(function (n) { return typeof window[n] === 'function'; });
    if (dood.length)
      return { staat: 'LET OP', detail: 'functies zonder knop: ' + dood.join(', ') };
    return 'stappenbalk en wizS1..wizS5 weg, samenvatting intact';
  });

  // ── BLIJFT STAAN: de Run-chip van vanmiddag ──
  await _doe(5, 'Run-chip zit in de topbar', function () {
    if (!window.PLRun || typeof PLRun.staat !== 'function')
      return { staat: 'FOUT', detail: 'PLRun ontbreekt — de module hangt niet in index.html' };
    if (!document.getElementById('runChip') || !document.getElementById('rdot'))
      return { staat: 'FOUT', detail: 'de chip of de dot staat niet in de topbar' };
    const st = PLRun.staat();
    const gelezen = Object.keys(st).filter(function (k) { return st[k] !== null; });
    if (gelezen.length < 3)
      return { staat: 'FOUT', detail: 'maar ' + gelezen.length + ' van de 5 modules leesbaar' };
    return gelezen.length + ' van 5 leesbaar, versie ' + PLRun.versie;
  });

  await _doe(5, 'Opslaan vraagt om een opmerking', function () {
    if (typeof plOpslaan !== 'function') return { staat: 'FOUT', detail: 'plOpslaan ontbreekt' };
    let bron = '';
    try { bron = String(window.plOpslaan || ''); } catch (e) {}
    if (bron && bron.indexOf('plExpOpm') < 0)
      return { staat: 'FOUT', detail: 'het veld zit niet in de keuzedialoog' };
    return 'veld aanwezig, gaat mee in tekst en PDF';
  });

  // ── BLIJFT STAAN: de 0143-fix ──
  await _doe(5, '0143 rekent in procenten', function () {
    let d = null;
    try { d = (typeof ALL_PID_DEFS !== 'undefined') ? ALL_PID_DEFS['0143'] : null; } catch (e) {}
    if (!d || typeof d.parse !== 'function')
      return { staat: 'FOUT', detail: '0143 heeft geen parser meer in ALL_PID_DEFS' };
    let v = null;
    try { v = d.parse([0x00, 0x38]); } catch (e) { return { staat: 'FOUT', detail: 'parser klapt: ' + (e.message || e) }; }
    if (!(v > 21.5 && v < 22.5))
      return { staat: 'FOUT', detail: '41430038 geeft ' + (Math.round(v * 100) / 100) + ', hoort 21,96 %' };
    if (!(d.max >= 400))
      return { staat: 'FOUT', detail: 'max staat op ' + d.max + ' — een turbo boven 100% wordt dan afgekeurd' };
    return '41430038 -> ' + (Math.round(v * 100) / 100) + ' %, max ' + d.max + '%';
  });

  // ── BLIJFT STAAN: de steunbitzeef (punt 1, gesloten 21-08) ──
  await _doe(5, 'Preset respecteert de steunbits', function () {
    if (typeof magToevoegen !== 'function' || typeof ecuSteunt !== 'function')
      return { staat: 'FOUT', detail: 'de poort ontbreekt — de preset kan weer fantomen terugzetten' };
    let bits = {};
    try { bits = (typeof steunbitsRuw === 'function') ? steunbitsRuw() : {}; } catch (e) {}
    const blokken = Object.keys(bits).length;
    if (!blokken)
      return { staat: 'LET OP', detail: 'nog geen bitmaps gelezen — de zeef laat dan alles door (bedoeld)' };
    const uit = [];
    if (magToevoegen('015C')) uit.push('015C zou nog toegevoegd worden');
    if (!magToevoegen('010C')) uit.push('010C wordt geweigerd — te gretige zeef');
    if (uit.length) return { staat: 'FOUT', detail: uit.join('; ') };
    return blokken + ' bitmapblokken gelezen, poort actief';
  });

  await _doe(5, 'Geen fantomen in supportedPIDs', function () {
    if (typeof supportedPIDs === 'undefined' || !supportedPIDs.size)
      return { staat: 'LET OP', detail: 'supportedPIDs leeg' };
    if (typeof ecuSteunt !== 'function') return { staat: 'FOUT', detail: 'ecuSteunt ontbreekt' };
    const ontkend = Array.from(supportedPIDs).filter(function (p) { return ecuSteunt(p) === false; });
    if (ontkend.length)
      return { staat: 'FOUT', detail: ontkend.length + ' van ' + supportedPIDs.size +
        ' worden door de ECU ontkend: ' + ontkend.join(', ') };
    return supportedPIDs.size + ' PIDs, geen enkele door de ECU ontkend';
  });

  // ── BLIJFT STAAN: twee structurele controles ──
  // Deze twee horen bij geen enkele update in het bijzonder; ze bewaken de run
  // zelf en de knoppen. De rest van het oude blok 5 (wizard, adaptertype,
  // brandstofpoort, startscherm, cascade) is op 21-08 verwijderd: die
  // wijzigingen zijn in het veld bevestigd, en een blok dat elke update
  // aangroeit wordt binnen een maand ongelezen.
  await _doe(5, 'Geen dode knoppen in het menu', function () {
    // Een knop die een gesloopte functie aanroept doet niets en meldt niets —
    // de gebruiker denkt dat de app hapert.
    //
    // De eerste versie hiervan (17-08) knipte het voorvoegsel van een
    // aanroep af: uit `PLRemote.openShare()` haalde hij `openShare`, zag die
    // niet op window staan, en meldde 27 dode knoppen die allemaal prima
    // werkten. Ook `event.preventDefault()` en `.catch()` telden mee. Een
    // controle die vals alarm slaat is erger dan geen controle: dan leer je
    // hem negeren.
    //
    // Nu: het hele pad oplossen (PLRemote.openShare → window.PLRemote.openShare)
    // en methodeaanroepen op een uitdrukking overslaan.
    const TAAL = ['if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'delete',
                  'void', 'catch', 'function', 'try', 'else', 'do', 'await', 'in', 'of'];
    const dood = [];
    const paden = /(?:^|[^.\w$])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;

    document.querySelectorAll('[onclick]').forEach(function (el) {
      const code = String(el.getAttribute('onclick') || '');
      let m;
      paden.lastIndex = 0;
      while ((m = paden.exec(code))) {
        const pad = m[1];
        const delen = pad.split('.');
        if (TAAL.indexOf(delen[0]) > -1) continue;
        // Aanroepen op iets wat pas tijdens het klikken bestaat (event, this,
        // document.getElementById(...)) kunnen we hier niet natrekken.
        if (['event', 'this', 'e', 'document', 'window', 'console', 'navigator', 'JSON', 'Math'].indexOf(delen[0]) > -1) continue;

        let obj = window, ok = true;
        for (let i = 0; i < delen.length; i++) {
          if (obj == null || typeof obj[delen[i]] === 'undefined') { ok = false; break; }
          obj = obj[delen[i]];
        }
        if (!ok || typeof obj !== 'function') {
          if (dood.indexOf(pad) === -1) dood.push(pad);
        }
      }
    });
    if (dood.length) return { staat: 'FOUT', detail: dood.length + ' knop(pen) roepen iets aan dat niet bestaat: ' + dood.join(', ') };
    return 'elke knop roept een bestaande functie aan';
  });

  await _doe(5, 'Geen restant van een afgebroken run', function () {
    // Let op de volgorde: _bewaarSelectie() schrijft het herstelpunt weg vóór
    // blok 5 draait, dus een naïeve check vindt altijd iets — en meldde op
    // 17-08 dat de vórige run niet netjes eindigde terwijl hij naar zijn eigen
    // vingerafdruk keek. Alleen een punt van vóór deze run telt.
    let r = null;
    try { r = localStorage.getItem('pl_testrun_herstel'); } catch (e) {}
    if (!r) return 'schoon';
    let t = 0;
    try { t = (JSON.parse(r) || {}).t || 0; } catch (e) {}
    if (t >= _trStart) return 'schoon (het punt van deze run staat klaar)';
    const min = Math.round((_trStart - t) / 60000);
    return { staat: 'LET OP', detail: 'herstelpunt van ' + min + ' min geleden staat er nog — die run eindigde niet netjes' };
  });

  // ── BLIJFT STAAN: de oude diagnose-ingangen ──
  await _doe(5, 'Oude ingangen opgeruimd', function () {
    const oud = ['openBusDiag', 'openZelftest', 'openOpdracht', 'plCopilotOpen', 'openLogCenter', 'plDiagBundle'];
    const rest = oud.filter(function (n) { return typeof window[n] === 'function'; });
    if (rest.length) return { staat: 'FOUT', detail: 'bestaat nog: ' + rest.join(', ') + ' — sloop niet afgemaakt' };
    return oud.length + ' verwijderde ingangen zijn echt weg';
  });
}


// ══════════════════════════════════════════════════════════════════
// AANSTUREN
// ══════════════════════════════════════════════════════════════════
async function startTestrun(blokken) {
  if (_trBezig) { try { showToast('Testrun loopt al'); } catch (e) {} return; }
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch (e) {} return; }
  const b = blokken || { b5: true, b1: true, b2: true, b3: true, b4: true, b6: true, b7: true, b8: true };

  _trBezig = true; _trStop = false; _trLog = []; _trStart = _nu();
  _boek(0, 'Testrun ' + TESTRUN_VERSIE, 'start', CAMPAGNE.titel, null);

  const bewaard = _bewaarSelectie();
  _boek(0, 'Selectie bewaard', 'ok', bewaard.actief.length + ' actieve PIDs, profiel ' + (bewaard.profiel || '—'), null);

  try {
    // Blok 5 eerst: als de update zelf niet klopt, wil je dat bovenaan zien
    // en niet onderaan een log van driehonderd regels.
    if (b.b5) await _blok5();
    if (b.b1) await _blok1();
    // Blok 7 vóór de sweep. De sweep claimt de bus en jaagt de bezetting naar
    // 100%, dus daarna is het spoor vervuild met onze eigen meting — precies de
    // vertekening die blok 4 al met "vóór de sweep" moest opvangen.
    if (b.b7) await _blok7();
    if (b.b2) await _blok2();
    if (b.b3) await _blok3();
    if (b.b4) await _blok4();
    if (b.b6) await _blok6();
    if (b.b8) await _blok8();
    // Blok 9 staat bewust niet in de standaardset: 45 s scannen hoort niet in
    // elke run. Alleen via de knop "DID-scan".
    if (b.b9) await _blok9();
    // Blok 10 duurt in zijn eentje ruim negen minuten en hoort daarom nooit in
    // de standaardset. Alleen via de knop "Snelheidsproef".
    if (b.b10) await _blok10();
  } catch (e) {
    _boek(0, 'Testrun', 'FOUT', (e && e.message) || String(e), null);
  } finally {
    // Altijd herstellen. Ook bij een fout, ook bij afbreken.
    const r = _herstelSelectie(bewaard);
    _boek(0, 'Selectie hersteld', r.indexOf('MISLUKT') === 0 ? 'FOUT' : 'ok', r, null);
    _trBezig = false;
    _trDuur = Math.round((_nu() - _trStart) / 1000);
    _boek(0, 'Klaar', 'klaar', 'duur ' + _trDuur + ' s', null);
  }
}

function stopTestrun() { _trStop = true; _boek(0, 'Stoppen gevraagd', 'gestopt', '', null); }

function _telling() {
  const t = { ok: 0, fout: 0, letop: 0, rest: 0 };
  for (let i = 0; i < _trLog.length; i++) {
    const s = _trLog[i].staat;
    if (s === 'ok') t.ok++;
    else if (s === 'FOUT') t.fout++;
    else if (s === 'LET OP') t.letop++;
    else t.rest++;
  }
  return t;
}

// ══════════════════════════════════════════════════════════════════
// HET LOGBOEK
// ══════════════════════════════════════════════════════════════════
// Alles in één tekstbestand: de campagnevragen bovenaan, dan de meetblokken,
// dan de staart van het app-log en het BT-log. Wat hiervoor over zes exports
// verdeeld was staat nu op één tijdlijn.
function testrunTekst() {
  const t = _telling();
  const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo : {};
  const r = [];
  r.push('PIDLANE TESTRUN ' + TESTRUN_VERSIE);
  r.push('════════════════════════════════════════════════');
  // Twee tijdstippen, want ze lopen uiteen: op 18-08 werd een run van 13:47
  // om 13:54 opgeslagen. De meetblokken waren toen zeven minuten oud terwijl
  // de TX/RX-staart hieronder vers was — twee verschillende momenten in één
  // bestand, en niets dat dat vertelde.
  const opgeslagen = new Date();
  const gestart = new Date(_trStart || Date.now());
  r.push('Run gestart : ' + gestart.toLocaleString('nl-NL'));
  r.push('Opgeslagen  : ' + opgeslagen.toLocaleString('nl-NL'));
  const kloof = Math.round((opgeslagen - gestart) / 60000);
  if (kloof >= 2) {
    r.push('              ⚠ ' + kloof + ' minuten na de run opgeslagen. De meetblokken');
    r.push('                hieronder zijn van de run; de TX/RX-staart en de logs');
    r.push('                onderaan zijn van NU en horen er niet bij.');
  }
  r.push('Voertuig    : ' + ([v.merk, v.model, v.year || v.bouwjaar, v.brandstof].filter(Boolean).join(' ') || 'onbekend'));
  r.push('Verbonden   : ' + ((typeof connected !== 'undefined' && connected) ? 'ja' : 'nee') +
    ((typeof demoMode !== 'undefined' && demoMode) ? '  (DEMO)' : ''));
  r.push('Toestel     : ' + navigator.userAgent);
  r.push('Duur        : ' + (_trDuur || Math.round((_nu() - _trStart) / 1000)) + ' s');
  r.push('Uitslag     : ' + t.ok + ' ok, ' + t.fout + ' fout, ' + t.letop + ' let op');
  r.push('');
  r.push('WAAR DEZE RUN OVER GAAT');
  r.push('────────────────────────────────────────────────');
  r.push(CAMPAGNE.titel);
  for (let i = 0; i < CAMPAGNE.vragen.length; i++) r.push('  ' + (i + 1) + '. ' + CAMPAGNE.vragen[i]);
  r.push('');

  const namen = { 0: 'RUN', 5: 'BLOK 5 — wat er in deze update veranderd is', 1: 'BLOK 1 — bedrading en omgeving', 2: 'BLOK 2 — schermen', 3: 'BLOK 3 — PID-sweep', 4: 'BLOK 4 — bus en regelkringen', 6: 'BLOK 6 — waarom zwijgen deze sensoren', 7: 'BLOK 7 — het pollbudget (PLAN.md punt 2)', 8: 'BLOK 8 — waar zit de olietemperatuur (PLAN.md punt 4)', 9: 'BLOK 9 — DID-scan mode 22', 10: 'BLOK 10 — snelheidsproef (PLAN.md punt 2b)' };
  let vorig = -99;
  for (let i = 0; i < _trLog.length; i++) {
    const x = _trLog[i];
    if (x.blok !== vorig) { vorig = x.blok; r.push(''); r.push(namen[x.blok] || 'OVERIG'); r.push('────────────────────────────────────────────────'); }
    const merk = x.staat === 'ok' ? '  ok  ' : x.staat === 'FOUT' ? ' FOUT ' : x.staat === 'LET OP' ? 'LETOP ' : '  ·   ';
    r.push('[' + x.t + ']' + merk + x.naam + (x.ms != null ? '  (' + x.ms + ' ms)' : ''));
    if (x.detail) r.push('                ' + x.detail);
  }

  // De TX/RX-gevallen uit de parser: hier zie je wat de ECU stuurde naast wat
  // PidLane erin las. Dit was de diagnosebundel.
  try {
    if (typeof plDiagGevallen === 'function') {
      const g = plDiagGevallen();
      if (g && g.length) {
        r.push('');
        r.push('TX/RX — laatste ' + Math.min(g.length, 60) + ' gevallen (LIVE, tot het moment van opslaan)');
        r.push('────────────────────────────────────────────────');
        g.slice(-60).forEach(function (c) {
          r.push('[' + c.t + '] TX ' + c.tx + '  RX ' + c.rx);
          if (c.mist && c.mist.length) r.push('           MIST: ' + c.mist.join(', '));
        });
      }
    }
  } catch (e) {}

  // Staart van de logs, zodat je niet apart hoeft te exporteren.
  try {
    const app = (window._appLog || window.logBuffer || []);
    if (app && app.length) {
      r.push('');
      r.push('APP-LOG — laatste 120 regels');
      r.push('────────────────────────────────────────────────');
      app.slice(-120).forEach(function (l) { r.push(typeof l === 'string' ? l : JSON.stringify(l)); });
    }
  } catch (e) {}
  try {
    const bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : null;
    if (bt && bt.length) {
      r.push('');
      r.push('BT-LOG — laatste 150 regels');
      r.push('────────────────────────────────────────────────');
      bt.slice(-150).forEach(function (l) { r.push(typeof l === 'string' ? l : JSON.stringify(l)); });
    }
  } catch (e) {}

  r.push('');
  r.push('════════════════════════════════════════════════');
  r.push(t.fout ? 'ER ZIJN FOUTEN.' : 'Geen fouten.');
  return r.join('\n');
}

function testrunOpslaan() {
  const tekst = testrunTekst();
  const d = new Date();
  const basis = 'PidLane-testrun-' + d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  // Formaatkeuze via pidlane-export.js: tekst voor jezelf, PDF als er iemand
  // meekijkt. Beide bevatten hetzelfde; alleen de opmaak verschilt.
  if (typeof plOpslaan === 'function') {
    plOpslaan(basis, tekst, { titel: 'Testrun ' + TESTRUN_VERSIE, ondertitel: CAMPAGNE.titel });
    return;
  }
  // Terugval als de exportmodule ontbreekt.
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tekst], { type: 'text/plain;charset=utf-8' }));
    a.download = basis + '.txt';
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════
// SCHERM
// ══════════════════════════════════════════════════════════════════
function openTestrun() {
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch (e) {} return; }
  let ov = document.getElementById('testrunOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'testrunOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9980;background:rgba(8,11,17,.97);display:flex;flex-direction:column;padding:14px;gap:9px;overflow-y:auto;-webkit-overflow-scrolling:touch';
    ov.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
        '<div style="font-size:16px;font-weight:800;color:var(--tx)">🔬 Testrun</div>' +
        '<span style="font-size:11px;color:var(--tx3)">' + TESTRUN_VERSIE + '</span>' +
        '<button onclick="closeTestrun()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:7px 14px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
      '</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;flex-shrink:0">' +
        '<button onclick="startTestrun()" style="background:var(--ac);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:700 13px var(--f);cursor:pointer">▶ Start</button>' +
        '<button onclick="startTestrun({b5:true,b1:true,b4:true,b7:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Snel (geen sweep)</button>' +
        // Los te draaien, want beide willen een wárme motor en een spoor van een
        // paar minuten. Dat is precies het moment waarop je géén sweep van drie
        // minuten wilt starten.
        '<button onclick="startTestrun({b9:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">DID-scan (45 s)</button>' +
        '<button onclick="startTestrun({b7:true,b8:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Budget + olie</button>' +
        '<button onclick="startTestrun({b10:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Snelheidsproef (10 min)</button>' +
        '<button onclick="stopTestrun()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">■ Stop</button>' +
        '<button onclick="testrunOpslaan()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">💾 Logboek</button>' +
      '</div>' +
      '<div id="testrunBody" style="flex:1"></div>';
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  _teken();
}
function closeTestrun() { const ov = document.getElementById('testrunOv'); if (ov) ov.style.display = 'none'; }

function _teken() {
  const box = document.getElementById('testrunBody');
  if (!box) return;
  if (!_trLog.length) {
    box.innerHTML = '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:11px 13px;margin-bottom:9px">' +
      '<div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">Waar deze run over gaat</div>' +
      '<div style="font-size:13px;color:var(--tx);margin-bottom:6px">' + CAMPAGNE.titel + '</div>' +
      '<ol style="margin:0;padding-left:18px;color:var(--tx2);font-size:12px;line-height:1.7">' +
      CAMPAGNE.vragen.map(function (v) { return '<li>' + v + '</li>'; }).join('') + '</ol></div>' +
      '<div style="color:var(--tx3);font-size:12px;line-height:1.7">De run overschrijft je PID-selectie tijdelijk en zet die daarna exact terug — ook als er iets misgaat. Alles is lezend; er gaat nooit een schrijfcommando naar de ECU.</div>';
    return;
  }
  const t = _telling();
  let h = '<div style="display:flex;gap:8px;margin-bottom:9px;font:700 12px var(--f)">' +
    '<span style="color:var(--gn)">' + t.ok + ' ok</span>' +
    '<span style="color:var(--rd)">' + t.fout + ' fout</span>' +
    '<span style="color:var(--or)">' + t.letop + ' let op</span>' +
    (_trBezig ? '<span style="margin-left:auto;color:var(--tx3)">bezig…</span>' : '') + '</div>';
  const start = Math.max(0, _trLog.length - 140);   // lange sweeps niet volledig tekenen
  if (start) h += '<div style="color:var(--tx3);font-size:11px;margin-bottom:6px">… ' + start + ' eerdere regels staan wél in het logboek</div>';
  for (let i = start; i < _trLog.length; i++) {
    const x = _trLog[i];
    const kl = x.staat === 'ok' ? 'var(--gn)' : x.staat === 'FOUT' ? 'var(--rd)' : x.staat === 'LET OP' ? 'var(--or)' : 'var(--tx3)';
    h += '<div style="display:flex;gap:7px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--bd)">' +
      '<span style="color:var(--tx3);flex-shrink:0">' + x.t + '</span>' +
      '<span style="color:' + kl + ';font-weight:700;flex-shrink:0;min-width:52px">' + x.staat + '</span>' +
      '<span style="color:var(--tx2);word-break:break-word">' + x.naam + (x.detail ? ' — ' + x.detail : '') + '</span></div>';
  }
  box.innerHTML = h;
}

// ══════════════════════════════════════════════════════════════════
// DE CAMPAGNE — herschrijf dit blok bij elke update
// ══════════════════════════════════════════════════════════════════
// Dit is wat déze versie moet uitwijzen. Het staat bovenaan het logboek, zodat
// achteraf duidelijk is welke vraag een run moest beantwoorden en of hij dat
// deed. Vervang bij de volgende update de titel én de vragen.
// Hoort bij _blok5() hierboven: daar staat de controle, hier de vraag.
// Herschrijf ze samen.
const CAMPAGNE = {
  titel: 'Snelheidsproef — wat kan deze verbinding schoon aan? (punt 2b)',
  vragen: [
    'VOORAF — blok 5 mag geen FOUT geven en hoort versie 3.0.0 te tonen. Dit is een aparte knop: "Snelheidsproef (10 min)". Draai hem NIET samen met de sweep, die vervuilt het spoor.',
    'VOORAF — rijd, of laat de motor minstens stationair warmdraaien. Een koude motor met een stabiel toerental geeft te gladde antwoorden; onderweg is de meting eerlijker.',
    'IJKING — hoeveel van de kandidaten antwoordden? Bij minder dan 3 stopt de proef. Staan er 6 tot 8 in de lijst, dan is elke misser daarna transport en geen dode sensor.',
    'KERNVRAAG — bij welke trap vallen de eerste missers? De regel "Wat deze verbinding aankan" zegt tot hoeveel verzoeken per seconde het foutloos bleef. Als geen enkele trap missers geeft, is de adapter niet de beperking en zit het probleem in PLLoad of in de app.',
    'KERNVRAAG — loopt de mediaan geleidelijk op of springt hij op één punt weg? Kijk naar de regel "Verloop". Geleidelijk is een adapter die het druk heeft; een sprong is een buffer die volloopt.',
    'HERSTEL — dit is waar het om begonnen is. Na elke trap staat er 30 s rust met prikken van één verzoek per 5 s. Zakt de responstijd terug naar de waarde van trap 1, en binnen hoeveel seconden? Een "NIET hersteld" na een zware trap verklaart waarom het tempo op 21-08 om 11:47 op 56% bleef hangen terwijl er 0% fouten waren.',
    'HERSTEL — de laatste rust duurt 45 s. Als hij daar wél herstelt en na 30 s niet, weet je hoeveel lucht de adapter nodig heeft.',
    'VERGELIJKING — onderaan staat de stand van de app (tempo, bus, fout). Hoe verhoudt het tempo van PLLoad zich tot wat de proef net foutloos haalde? Loopt de app ver onder wat de verbinding aankan, dan schroeft hij te ver terug.',
    'LOGBOEK — kijk of er tijdens de proef een BT-dip of herverbinding in het log staat. Op 16-08 waren het er vier in twaalf minuten, telkens gevolgd door "scherm blijft aan".',
    'CONTROLE — blijft blok 6 op 0 ontkende PIDs staan, en toont 0143 nog tientallen procenten? Die twee horen bij elke run even gecheckt te worden; een regressie daar verloopt stil.'
  ]
};





window.openTestrun = openTestrun;
window.closeTestrun = closeTestrun;
window.startTestrun = startTestrun;
window.stopTestrun = stopTestrun;
window.testrunOpslaan = testrunOpslaan;
window.testrunTekst = testrunTekst;

})();
