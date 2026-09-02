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
// WAT ER IN 3.4 BIJ KWAM
// Blok 5 is herschreven voor de stille-catches-klus van 22-08: 584 lege catches
// over acht modules zijn gevuld. Die wijziging is gedragsneutraal, dus er valt
// niets "nieuws" te testen — wél of de wrappers die eronder zaten nog leven, en
// of de vondsten uit die klus (PLAN.md punt 19 en 20) in het veld afgaan.
//
// Nieuw is blok 11: een inventarisatie die ALLEEN LEEST en de bus niet aanraakt.
// Het verzamelt in één keer de cijfers waar punt 3 (mag de gate een stille
// sensor opruimen), punt 6 (verspreide logica) en punt 12 (bytelengtes) om
// vragen. Geen enkele beslissing, alleen tellen — zodat die drie sessies met
// getallen kunnen beginnen in plaats van met een schatting.
//
// VEILIGHEID
// Uitsluitend lezende commando's. VERBODEN hieronder wordt gecontroleerd
// vóórdat er iets de bus op gaat: geen 04 (foutgeheugen wissen), geen 2F/31
// (actuatoren), geen sleuteldiensten. En de selectie wordt hersteld in een
// finally, ook als de run halverwege klapt of je de app wegzwiept.
// ══════════════════════════════════════════════════════════════════
(function () {
'use strict';

const TESTRUN_VERSIE = '6.1 (02-09-2026)';
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
  try { _teken(); } catch (e) { console.warn('Testrun-log niet herteken op het scherm (het onderliggende logboek is wel bijgewerkt)', e); }
}

/* De app-log ophalen. (#29, 28-08-2026)

   Dit stond op drie plekken als `window._appLog || window.logBuffer || []`,
   en die twee globals BESTAAN NIET — nergens in public/. Alle drie de plekken
   kregen dus altijd een lege array, zonder ooit een fout te geven.

   Drie symptomen die daaruit volgden, alle drie zichtbaar in de run van 28-08:
     1. Blok 14 zei "niets opgeruimd" terwijl de opruimregel twee keer had
        gevuurd — die regels staan in de APP-log, en die werd nooit gelezen.
        Erger dan alleen missen: het advies eronder ("controleer of hij
        aanstaat") stuurt je naar precies het onderzoek dat je niet moet doen.
     2. "Meldingen sinds het begin van deze run" meldde structureel
        "app-log 0 regels" naast een BT-log van 1183 regels.
     3. Het opgeslagen rapport had nooit een APP-LOG-sectie.

   De echte bron is plLokaalLog() uit pidlane-auth.js, precies zoals
   pidlane-logboek.js hem al leest. Eén plek, zodat de volgende die de app-log
   nodig heeft hem niet opnieuw hoeft te raden. */
function _appLogRegels() {
  try {
    if (typeof plLokaalLog === 'function') {
      const a = plLokaalLog();
      if (Array.isArray(a)) return a;
    }
  } catch (e) { console.warn('plLokaalLog() gaf een fout — de app-log ontbreekt in deze run', e); }
  return [];
}

// ── DE OPRUIMMELDING (blok 14, punt 4) ────────────────────────────
// WAAROM DIT EEN EIGEN FUNCTIE IS (#29)
// Blok 14 las alleen het log, en dat is de verkeerde bron. Beide logs zijn
// ringbuffers: de app-log kapt stil af op 500 regels (`localLog.shift()` in
// pidlane-auth.js), de BT-log op 1400. Een rit van een half uur wist dus zijn
// eigen bewijs, en dan meldde blok 14 "niets opgeruimd — controleer of hij
// aanstaat": het onderzoek dat je juist NIET moet doen, want de regel had wél
// gevuurd. Dezelfde soort fout als #12 — de controle wees de verkeerde kant op.
//
// De bron is nu `pidOpgeruimdLijst()` uit pidlane-pidgate.js. Dat is een Set
// die de hele sessie blijft staan en per PID de reden bewaart. Het log doet
// nog mee, maar alleen voor de tijdstippen; het beslist niets meer.
//
// Apart en zuiver, zodat test-opruimmelding.js hem kan draaien zonder een
// browser en zonder testrun-context. Knippad: tussen de twee ankers hieronder.
function _opruimStand(lijst, regels, duurS) {
  const zoek = function (re) {
    return (regels || []).filter(function (l) { return l && re.test(String(l.msg || '')); })
                         .map(function (l) { return (l.ts ? l.ts + ' ' : '') + String(l.msg).slice(0, 110); });
  };
  const opLog = zoek(/opgeruimd/i);
  const terug = zoek(/antwoordt weer na/i);
  const minuten = Math.round((duurS || 0) / 60);
  const staart = terug.length
    ? '  ||  ' + terug.length + 'x hersteld vóór het opruimen, volgens het log: ' + terug.slice(0, 3).join(' | ')
    : '';

  // Geen bron, geen conclusie. Dit is de stand waarin de oude versie een
  // uitspraak deed die nergens op stoelde.
  if (!Array.isArray(lijst))
    return { staat: 'LET OP', detail: 'pidOpgeruimdLijst() ontbreekt of gaf een fout — zonder die bron is over ' +
      'de opruimregel niets vast te stellen. Het log noemt ' + opLog.length + ' regel(s)' + staart };

  if (lijst.length) {
    const namen = lijst.slice(0, 6).map(function (o) {
      return (o.pid || '?') + ' (' + (o.naam || o.pid || '?') + '): ' + (o.reden || 'geen reden vastgelegd');
    }).join(' | ');
    const meer = lijst.length > 6 ? ' … +' + (lijst.length - 6) + ' meer' : '';
    const logdeel = opLog.length
      ? '  |  het log bevestigt er ' + opLog.length + ': ' + opLog.slice(0, 3).join(' | ')
      : '  |  het log noemt er geen enkele — die buffer kapt af, dus dat is geen tegenspraak (#29)';
    return { staat: 'LET OP', detail: lijst.length + 'x opgeruimd in ' + minuten + ' min volgens de gate: ' +
      namen + meer + logdeel + staart + '  — dit is de meting waar de drempel op gekozen moet worden' };
  }

  // De gate is leeg. Noemt het log er tóch een, dan is dát de bevinding:
  // twee plekken die hetzelfde horen te weten spreken elkaar tegen.
  if (opLog.length)
    return { staat: 'FOUT', detail: 'de gate meldt niets opgeruimd terwijl het log ' + opLog.length +
      ' opruimregel(s) noemt: ' + opLog.slice(0, 3).join(' | ') + staart +
      ' — pidOpgeruimdLijst() en de log spreken elkaar tegen' };

  return { staat: 'ok', detail: 'niets opgeruimd in ' + minuten + ' min — gemeten aan de gate zelf ' +
    '(pidOpgeruimdLijst), niet aan het log. Geen enkele sensor bleef lang genoeg stil; dat is een ' +
    'uitkomst en geen storing' + staart };
}
// ── einde opruimmelding-blok ──────────────────────────────────────

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
  try { if (typeof activePIDs !== 'undefined') s.actief = Array.from(activePIDs); } catch (e) { console.warn('LET OP: actieve PIDs niet in het herstelpunt gezet — het herstel na deze run kan de selectie leegmaken in plaats van teruggeven', e); }
  try { if (typeof manualPIDs !== 'undefined') s.handmatig = Array.from(manualPIDs); } catch (e) { console.warn('LET OP: handmatige PIDs niet in het herstelpunt gezet — het herstel na deze run kan die selectie kwijtraken', e); }
  try { s.profiel = (typeof actiefPollProfiel === 'function') ? actiefPollProfiel() : null; } catch (e) { console.warn('LET OP: pollprofiel niet in het herstelpunt gezet', e); }
  _trHerstel = s;
  try { localStorage.setItem(HERSTEL_SLEUTEL, JSON.stringify(s)); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
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
    try { renderGauges(); } catch (e) { console.warn('Meters niet herberekend na het herstellen van de selectie — de selectie zelf is wel goed teruggezet', e); }
  } catch (e) {
    return 'HERSTEL MISLUKT: ' + (e.message || e);
  }
  try { localStorage.removeItem(HERSTEL_SLEUTEL); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
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
      } catch (e) { console.warn('Crash-herstel van de PID-selectie bij het opstarten mislukt', e); }
    }, 4000);
  }
} catch (e) { console.warn('Controle op een afgebroken vorige testrun mislukt bij het opstarten', e); }

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
try { PLBudget.start(); } catch (e) { console.warn('PLBudget niet gestart — het pollbudget-spoor voor PLAN.md punt 2 blijft dan leeg', e); }

// ══════════════════════════════════════════════════════════════════
// DE RITWAARNEMER (PLRit) — voor alles wat alleen een RIT kan beantwoorden
// ══════════════════════════════════════════════════════════════════
// 26-08-2026. Vier vragen staan al dagen open en geen van vieren is bij
// stilstand te beantwoorden:
//
//   raildruk 0123/0159   stonden een hele rit stil op 9900 — beweegt dat nu?
//   opruimregel          zes mislukkingen + vijf herkansingen kost >5 minuten
//   turbodetectie        vraagt MAP-monsters onder belasting
//   32 van de 55 PIDs    bewogen niet in 27 minuten rijden
//
// De testrun meet een MOMENT: hij vraagt elke PID één keer op en dat is het.
// Eén losse waarde van 10090 zegt niets over of de raildruk een half uur lang
// beweegt. Daar is een waarnemer voor nodig die de hele rit meeloopt, en dat is
// wat dit is — hetzelfde patroon als PLBudget hierboven: hij draait vanaf het
// laden, regelt niets, en de testrun leest hem achteraf uit (blok 14).
//
// Waarom niet pidHist gebruiken: die bewaart 120 monsters per PID. Op 1 Hz is
// dat twee minuten. Voor "bewoog deze sensor over de hele rit" heb je een
// accumulator nodig, geen venster.
//
// Tijdens een testrun wordt er NIET bemonsterd (_trBezig). De sweep vraagt 45
// PIDs achter elkaar op en blok 6 pookt in dode PIDs; die waarden horen niet in
// een beeld van "wat deed de auto tijdens het rijden".
const PLRit = (function () {
  const TIK = 5000;          // elke 5 s; een rit van 30 min = 360 tikken
  const GAT_MS = 20000;      // >20 s tussen twee tikken = de app lag stil
  let per = {};              // pid -> {n,tikken,gemist,min,max,laatst,veranderingen,tLaatsteVer,stempel}
  let start = 0, laatstT = 0, gaten = [], herverbindingen = 0;
  let vorigVerbonden = null, _aan = false;
  let zonderBron = 0;        // tikken waarin er geen versheidsbron was (#74)

  /* ── ÉÉN PID, ÉÉN TIK — de kern van #74 ──────────────────────────
     Tot 01-09 verhoogde deze lus `n` voor élke sleutel in `pidVals`. Dat is de
     bug: `pidVals` is een laatst-bekende-waarde-kaart zonder houdbaarheid. Hij
     wordt alleen geschreven door updPID() en alleen gewist bij het verbreken
     van de verbinding. Een PID die één keer gelezen is — door de
     gezondheidscheck bij het verbinden, door een eerdere sweep, door blok 6 —
     bleef daarna eeuwig "monsters" opleveren met nul veranderingen.

     Wat dat kostte: in de run van 01-09 meldden 0123 en 0159 evenveel monsters
     (56) als 010B, terwijl 010B er 390 busreads had en die twee nul. Blok 14
     noemde ze daarop "nog steeds bevroren tijdens het rijden — dit is een
     parser- of definitiefout". Ze waren simpelweg niet uitgevraagd. Op #19 is
     dezelfde meting drie keer gebruikt en één keer als sluitingsbewijs.

     De versheidsbron bestond al: updPID() zet `_pidLastUpd[pid]`. Verschuift
     dat stempel niet tussen twee tikken, dan is er niets gemeten — hoe vaak de
     waarde er ook staat.

     WAAROM DE EERSTE WAARNEMING NIET MEETELT. Bij de eerste tik waarin een PID
     opduikt is zijn stempel onbekend, en de waarde kan van minuten geleden
     zijn. Alleen een stempel dat VERSCHUIFT bewijst een leesbeurt binnen deze
     rit. Dat kost één meting per PID en dwaalt dus altijd de veilige kant op:
     liever "nog niet gemeten" dan een verzonnen monster.

     Los gehouden en naar buiten gebracht zodat test-rit.js hem zonder browser
     kan draaien, mét de oude stempelloze versie ernaast als tegenproef. */
  function neem(e, waarde, stempel, nu) {
    e.tikken++;
    if (typeof stempel !== 'number' || !isFinite(stempel)) { e.gemist++; return 'geen-stempel'; }
    if (e.stempel === stempel) { e.gemist++; return 'ongewijzigd'; }
    const eerste = (e.stempel === null);
    e.stempel = stempel;
    if (eerste) { e.gemist++; return 'eerste-waarneming'; }   // stempel bekend, meting nog niet bewezen
    if (e.n === 0) { e.n = 1; e.min = e.max = e.laatst = waarde; e.tLaatsteVer = nu; return 'gemeten'; }
    e.n++;
    if (waarde < e.min) e.min = waarde;
    if (waarde > e.max) e.max = waarde;
    if (waarde !== e.laatst) { e.veranderingen++; e.laatst = waarde; e.tLaatsteVer = nu; }
    return 'gemeten';
  }

  // nuOverride is er alleen voor de test (zie tik: hieronder). Zonder argument
  // is het gewoon Date.now().
  function tik(nuOverride) {
    try {
      const verbonden = !(typeof connected === 'undefined' || !connected);
      // Herverbindingen tellen: dit is het signaal van de achtergrondkwestie
      // (Android bevriest de WebView-timers). Ook tellen als we niet meten.
      if (vorigVerbonden === false && verbonden) herverbindingen++;
      vorigVerbonden = verbonden;

      if (!verbonden) return;
      if (typeof demoMode !== 'undefined' && demoMode) return;
      if (typeof _trBezig !== 'undefined' && _trBezig) return;   // niet tijdens een run
      if (typeof pidVals === 'undefined' || !pidVals) return;

      const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();
      if (!start) start = nu;
      // Een gat betekent dat deze lus zelf niet liep — precies het bewijs uit de
      // rit van 23-08 (het logboek zweeg op dezelfde kloktijden).
      if (laatstT && (nu - laatstT) > GAT_MS)
        gaten.push({ van: laatstT, tot: nu, s: Math.round((nu - laatstT) / 1000) });
      laatstT = nu;

      // De versheidsbron. Ontbreekt hij, dan wordt er NIET stilzwijgend
      // teruggevallen op de oude telling: dan is deze rit niet te beoordelen en
      // zegt blok 14 dat. Een terugval die "gewoon iets" meet is precies hoe
      // #74 vier ritten lang onzichtbaar bleef.
      const stempels = (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) ? _pidLastUpd : null;
      if (!stempels) { zonderBron++; return; }

      Object.keys(pidVals).forEach(function (p) {
        const v = pidVals[p];
        if (typeof v !== 'number' || !isFinite(v)) return;
        let e = per[p];
        if (!e) e = per[p] = { n: 0, tikken: 0, gemist: 0, min: v, max: v, laatst: v,
                               veranderingen: 0, tLaatsteVer: nu, stempel: null };
        neem(e, v, stempels[p], nu);
      });
    } catch (e) {
      // Bewust stil: een waarnemer op vreemde objecten mag de rit nooit
      // verstoren. Dat hij leeft is aan het monsteraantal te zien; staat dat op
      // 0, dan meldt blok 14 dat en niet deze catch.
    }
  }

  function start_() {
    if (_aan) return;
    _aan = true;
    setInterval(tik, TIK);
  }

  return {
    start: start_,
    // Bewust naar buiten: anders is de accumulator alleen te toetsen door vijf
    // seconden per monster te wachten, en dan wordt hij dus niet getoetst. Met
    // een klok-parameter kan test-rit.js een rit van een half uur in een paar
    // milliseconden naspelen. In de app roept niemand dit aan; het interval doet
    // het werk.
    tik: function (nuOverride) { return tik(nuOverride); },
    // Idem voor de kern van #74: los toetsbaar, inclusief de tegenproef.
    _neem: neem,
    per: function () { return JSON.parse(JSON.stringify(per)); },
    gaten: function () { return gaten.slice(); },
    herverbindingen: function () { return herverbindingen; },
    // Was er een versheidsbron? Zo niet, dan is er niets gemeten en hoort
    // blok 14 dat te zeggen in plaats van nullen te presenteren als uitkomst.
    bron: function () {
      return { stempels: (typeof _pidLastUpd !== 'undefined' && !!_pidLastUpd), zonderBron: zonderBron };
    },
    duurS: function (nuOverride) {
      const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();
      return start ? Math.round((nu - start) / 1000) : 0;
    },
    // Het hoogste aantal ECHTE metingen van één PID. Was tot 01-09 het aantal
    // tikken, en dat was hetzelfde getal voor een PID met 390 busreads als voor
    // een PID met nul (#74).
    monsters: function () {
      let n = 0; Object.keys(per).forEach(function (p) { if (per[p].n > n) n = per[p].n; }); return n;
    },
    tikken: function () {
      let n = 0; Object.keys(per).forEach(function (p) { if (per[p].tikken > n) n = per[p].tikken; }); return n;
    },
    // Hoeveel PIDs zijn deze rit daadwerkelijk uitgevraagd, en welke stonden er
    // alleen in het geheugen? Dat verschil is de hele bevinding van #74.
    dekking: function () {
      const uit = { gemeten: [], eenmalig: [], nietGemeten: [] };
      Object.keys(per).forEach(function (p) {
        if (per[p].n >= 2) uit.gemeten.push(p);
        else if (per[p].n === 1) uit.eenmalig.push(p);
        else uit.nietGemeten.push(p);
      });
      return uit;
    },
    // Zet de teller op nul aan het begin van een rit, zodat het beeld over déze
    // rit gaat en niet over alles sinds het opstarten van de app.
    wis: function () { per = {}; start = 0; laatstT = 0; gaten = []; herverbindingen = 0; zonderBron = 0; }
  };
})();

window.PLRit = PLRit;
try { PLRit.start(); } catch (e) { console.warn('PLRit niet gestart — blok 14 (de rit) blijft dan leeg', e); }

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
      // HERZIEN 26-08: dit was LET OP, en sloeg op 25-08 vals alarm bij een
      // eerste verbinding met een onbekend VIN — geen profiel, dus terecht
      // een volle discovery, en toch een melding die eruitziet als een
      // storing. Nul profielen is precies wat een nieuw voertuig of een
      // verse installatie hoort te laten zien.
      return 'nog geen profiel voor dit voertuig opgeslagen — eerste verbinding, de app deed terecht een volle discovery';

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

    // HERZIEN 26-08: geladen===false betekende hier altijd LET OP, ook vlak
    // nadat een eerste volle discovery het profiel zojuist zélf heeft
    // aangemaakt — precies de situatie uit het log van 25-08 (opgeslagen om
    // 20:34:18, en de controle die er meteen overheen liep meldde alsnog
    // "niet geladen"). Zo'n vers profiel kán bij dít verbinden niet geladen
    // zijn, want het bestond toen nog niet. `uur` (hierboven al berekend)
    // onderscheidt dat van een profiel dat er al stond en genegeerd is.
    if (uur !== null && uur <= 0.1)
      return basis + ' — nog maar een paar minuten oud: dit profiel is tijdens déze sessie zelf ontstaan, dus terecht niet geladen bij het verbinden';
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
  try { _budgetVoor = (window.PLLoad && PLLoad.staat) ? PLLoad.staat().tempoPct : null; } catch (e) { console.warn('Tempo vóór de sweep niet gemeten — blok 4 kan dan geen vóór/na-vergelijking tonen voor PLAN.md punt 2/13', e); }
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
  } catch (e) { console.warn('PID-lijst voor de sweep niet opgebouwd — de melding \'geen PID-lijst beschikbaar\' hieronder kan dan een leesfout verbergen', e); }
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
  try { _busTok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-sweep', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor de sweep gaf een fout (niet alleen \'bezet\')', e); }
  if (!_busTok) _boek(3, 'Busslot', 'LET OP', 'bus niet vrijgekomen binnen 8 s — sweep loopt naast de pollus', null);
  else _boek(3, 'Busslot', 'ok', 'bus geclaimd voor de sweep', null);

  // Selectie verbreden zodat de pollus ze ook echt aanraakt.
  try {
    if (typeof activePIDs !== 'undefined') lijst.forEach(function (p) { activePIDs.add(p); });
    try { renderGauges(); } catch (e) { console.warn('Meters niet ververst na het verbreden van de selectie voor de sweep', e); }
  } catch (e) { console.warn('Selectie niet verbreed vóór de sweep — de pollus raakt dan niet alle geveegde PIDs aan', e); }

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
    try { if (typeof parsePID === 'function') waarde = parsePID(pid, raw); } catch (e) { console.warn('Parser klapte op ' + pid + ' — dit is het exacte onderscheid (ECU vs. parser) waar blok 3 voor bestaat: ' + (e.message || e)); }

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

  try { if (_busTok && window.PLBus && PLBus.release) PLBus.release(_busTok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }

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
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-stil', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor blok 6 gaf een fout (niet alleen \'bezet\')', e); }
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
        try { r = await sendCmd(pid, 2000); } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat dit blok test */ }
        if (!leeg(r)) { raak++; monsters.push(String(r).replace(/\s+/g, '').slice(0, 14)); }
        await _wacht(220);
      }
      bevinding.push('los 5x: ' + raak + ' raak' + (monsters.length ? ' (' + monsters[0] + ')' : ''));

      // 3 — ruime tijd
      let traag = '';
      try { traag = await sendCmd(pid, 9000); } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat dit blok test */ }
      bevinding.push('ruime timeout: ' + (leeg(traag) ? 'nog steeds stil' : 'WEL antwoord'));
      await _wacht(150);

      // 4 — groepering: met z'n tweeën en met z'n zessen
      const maat = doel.filter(function (p) { return p !== pid; }).slice(0, 1).concat([]);
      let duo = '';
      try { duo = await sendCmd(pid + (maat[0] || STIL_CONTROLE).slice(2), 3000); } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat dit blok test */ }
      bevinding.push('in een paar: ' + (leeg(duo) ? 'stil' : 'antwoord (' + String(duo).replace(/\s+/g, '').slice(0, 16) + ')'));
      await _wacht(150);

      // Groep van zes: de PID zelf plus vijf die het aantoonbaar doen. Zo is
      // te zien of een grote groep de kleine wegdrukt.
      const goeden = ['0C', '0D', '04', '11', '05'];
      let zes = '';
      try { zes = await sendCmd(pid + goeden.join(''), 4000); } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat dit blok test */ }
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
      } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat dit blok test */ }
      try { await sendCmd('ATH0', 1500); } catch (e) { console.warn('LET OP: ATH0 (headers uit) mislukt na de headertest — als dit blijft hangen praat de rest van de app mogelijk alleen nog tegen dit adres', e); }   // altijd terugzetten
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
      try { lijst = (typeof supportedPIDs !== 'undefined') ? Array.from(supportedPIDs) : []; } catch (e) { console.warn('supportedPIDs niet leesbaar voor de steunbit-vergelijking — de melding hieronder kan een leesfout verbergen als \'leeg\'', e); }
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
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
    try { await sendCmd('ATH0', 1500); } catch (e) { console.warn('LET OP: vangnet ATH0 (headers uit) mislukte ook — als de headertest headers aanzette, kan de rest van de app nu alleen nog tegen dat ene adres praten', e); }   // vangnet: headers nooit aan laten staan
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
    // 28-08-2026 (#12) — 0 ms is geen meting maar een ontbrekende meting, en
    // die hoort niet in de groep. Op 26-08 bestond de lage-bezettingsgroep uit
    // 0 ms-monsters; de mediaan werd 0, de deel-door-nul-vangst maakte er +0%
    // van, en 0% viel door |verschil| < 15 in de tak "vrijwel geen verschil".
    // Uitkomst: 0 ms tegen 144 ms werd gepresenteerd als "bezetting voorspelt
    // hier geen tegendruk" — precies de omgekeerde conclusie, op de regel die
    // de Slotsom voedt die bepaalt of de PLLoad-vraag (#15) dicht kan.
    const meet = function (m) { return m.ms > 0; };
    const alleLaag = sp.filter(function (m) { return m.bezet < d.bezetAf; });
    const alleHoog = sp.filter(function (m) { return m.bezet >= d.bezetOp; });
    const laag = alleLaag.filter(meet).map(function (m) { return m.ms; });
    const hoog = alleHoog.filter(meet).map(function (m) { return m.ms; });
    const weg = (alleLaag.length - laag.length) + (alleHoog.length - hoog.length);
    const staart = weg ? '  [' + weg + ' monster(s) van 0 ms buiten beschouwing gelaten — geen meting]' : '';

    if (!laag.length || !hoog.length)
      return { staat: 'LET OP', detail: 'te weinig bruikbare spreiding om te vergelijken (laag ' +
        laag.length + ', hoog ' + hoog.length + ' monsters met een echte responstijd)' + staart };

    const mLaag = med(laag), mHoog = med(hoog);
    // Derde tak: onmeetbaar. mLaag === 0 kan hier niet meer voorkomen omdat de
    // nulmonsters eruit zijn, maar de vangst blijft staan — hij mag nooit meer
    // stilletjes 0% opleveren als er ooit een andere bron van nullen bijkomt.
    if (!mLaag)
      return { staat: 'LET OP', detail: 'lage-bezettingsgroep heeft mediaan 0 ms — hier valt geen ' +
        'verhouding van te maken, dus over tegendruk zegt deze run niets' + staart };

    const verschil = Math.round((mHoog - mLaag) / mLaag * 100);
    const tekst = 'responstijd bij lage bezetting ' + mLaag + ' ms, bij hoge bezetting ' + mHoog + ' ms (' +
      (verschil >= 0 ? '+' : '') + verschil + '%)' + staart;
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
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-olie', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor blok 8 gaf een fout (niet alleen \'bezet\')', e); }
  _boek(8, 'Busslot', tok ? 'ok' : 'LET OP', tok ? 'bus geclaimd' : 'niet vrijgekomen — metingen lopen naast de pollus', null);

  const leeg = function (r) { return !r || /NO DATA|UNABLE|ERROR|STOPPED|\?/i.test(String(r)); };
  const hex = function (r) { return String(r || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); };

  let headerGezet = false;

  try {
    // ── Wat zegt de app er zelf al over? ──
    await _doe(8, 'Stand van zaken in de app', function () {
      const uit = [];
      try { uit.push('2101 in supportedPIDs: ' + ((typeof supportedPIDs !== 'undefined' && supportedPIDs.has('2101')) ? 'JA' : 'nee')); } catch (e) { uit.push('supportedPIDs onleesbaar'); }
      try { uit.push('015C dood volgens PLSched: ' + ((window.PLSched && PLSched.dood && PLSched.dood('015C')) ? 'JA' : 'nee')); } catch (e) { uit.push('PLSched.dood() onleesbaar'); }
      try { uit.push('probeUitgebreid bestaat: ' + (typeof probeUitgebreid === 'function' ? 'JA' : 'NEE')); } catch (e) { uit.push('probeUitgebreid-check faalde'); }
      try {
        const k = (window.PLUitgebreid && PLUitgebreid.kandidaten) ? PLUitgebreid.kandidaten() : null;
        uit.push('kandidaten volgens merkfilter: ' + (k ? (k.length ? k.join(', ') : 'GEEN — merk onbekend of gefilterd') : 'onbekend'));
      } catch (e) { uit.push('PLUitgebreid.kandidaten() onleesbaar'); }
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
    } catch (e) { console.warn('Koelwater-anker niet gelezen — de plausibiliteitscheck van de olietemperatuur draait dan zonder ijkpunt', e); }
    _boek(8, 'Koelwater (0105)', koel == null ? 'LET OP' : 'ok',
      koel == null ? 'niet gelezen — plausibiliteit is dan niet te beoordelen' : koel + ' °C', null);
    await _wacht(120);

    // ── Protocol: mag ik een header zetten? ──
    let protocol = '';
    try { protocol = String(await sendCmd('ATDPN', 1500) || '').trim(); } catch (e) { console.warn('Protocolopvraag (ATDPN) mislukt vóór de headertest', e); }
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
        try { r = await sendCmd('22111F', 3000); } catch (e) { /* stil: een fout hier telt hetzelfde als 'geen antwoord' — precies wat deze test meet */ }
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
    if (headerGezet) { try { await sendCmd('ATSH7DF', 1500); } catch (e) { _boek(8, 'Header terugzetten', 'FOUT', 'ATSH7DF mislukt — de adapter kan blijven hangen op 7E0 (alleen motorblok); verbreek en verbind opnieuw als andere modules niets meer teruggeven: ' + (e.message || e), null); } }
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
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
  try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-did', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor de DID-scan gaf een fout (niet alleen \'bezet\'); in tegenstelling tot blok 3/6/8 meldt blok 9 een gemiste claim niet apart in het logboek', e); }
  let headerGezet = false;
  const hex = function (r) { return String(r || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); };

  try {
    let proto = '';
    try { proto = String(await sendCmd('ATDPN', 1500) || '').trim(); } catch (e) { console.warn('Protocolopvraag (ATDPN) mislukt vóór de DID-scan', e); }
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
    } catch (e) { console.warn('Koelwater-anker niet gelezen — de DID-scan draait dan zonder ijkpunt voor de temperatuur-verdachten', e); }

    _boek(9, 'Scan gestart', 'ok', 'reeks 2211xx op header 7E0, 256 identifiers' +
      (koel != null ? '  |  koelwater ' + koel + ' °C' : ''), null);

    const treffers = [];
    let geweigerd = 0, stil = 0;
    const t0 = _nu();

    for (let n = 0; n < 256 && !_trStop; n++) {
      const did = '11' + n.toString(16).toUpperCase().padStart(2, '0');
      let r = '';
      try { r = await sendCmd('22' + did, 1200); } catch (e) { /* stil: een fout hier telt hetzelfde als 'stil', en 256 losse meldingen zouden de console overspoelen */ }
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
    if (headerGezet) { try { await sendCmd('ATSH7DF', 1500); } catch (e) { _boek(9, 'Header terugzetten', 'FOUT', 'ATSH7DF mislukt — de adapter kan blijven hangen op 7E0 (alleen motorblok); verbreek en verbind opnieuw als andere modules niets meer teruggeven: ' + (e.message || e), null); } }
    try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
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
  } catch (e) { console.warn('Kandidatenlijst voor de snelheidsproef niet opgebouwd — de melding \'geen bruikbare PIDs\' hieronder kan dan een leesfout verbergen', e); }
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
  try { ijkTok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-snelheid-ijk', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor de ijkfase gaf een fout (niet alleen \'bezet\')', e); }
  try {
    for (let i = 0; i < kandidaten.length && set.length < 8; i++) {
      if (_trStop) break;
      const r = await _snelheidVraag(kandidaten[i]);
      if (r.ok) set.push(kandidaten[i]);
      await _wacht(60);
    }
  } finally {
    try { if (ijkTok && window.PLBus && PLBus.release) PLBus.release(ijkTok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
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
    try { tok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-snelheid', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor trap ' + trap.naam + ' gaf een fout (niet alleen \'bezet\')', e); }
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
      try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
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
      try { ptok = (window.PLBus && PLBus.claim) ? PLBus.claim('testrun-snelheid-prik') : 0; } catch (e) { console.warn('Busslot-claim voor een hersteltik gaf een fout', e); }
      const r = await _snelheidVraag(set[0]);
      try { if (ptok && window.PLBus && PLBus.release) PLBus.release(ptok); } catch(e){ /* stil: opruimen: kan al gebeurd zijn */ }
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
    try { ld = (window.PLLoad && PLLoad.staat) ? PLLoad.staat() : null; } catch (e) { console.warn('PLLoad.staat() niet gelezen — de vergelijking met de app-regeling (PLAN.md punt 13) mist dan zijn belangrijkste getal', e); }
    let bs = null;
    try { bs = (window.PLBus && PLBus.stats) ? PLBus.stats() : null; } catch (e) { console.warn('PLBus.stats() niet gelezen — de vergelijking met de app-regeling (PLAN.md punt 13) mist dan de foutgraad', e); }
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

  // ══════════════════════════════════════════════════════════════
  // OPLEVERING 02-09-2026 — de tokenketen.
  //
  //   #52  de tokenchip volgt de rol en niet het laadmoment
  //   §8   de teller volgt de server: X-PidLane-Saldo wordt uitgelezen
  //   #42  geen koopknop in de app; de eerste fase loopt met de hand
  //   —    een activatiecode kan niet meer verbranden zonder account
  //
  // WAAROM DIT IN BLOK 5 STAAT EN NIET ALLEEN IN EEN NODE-TEST. De vier
  // node-tests (test-tokenchip, test-saldokop, test-codeverzilver,
  // test-proeftegoed) draaien de modules met een nagemaakte DOM en een
  // nagemaakte Airtable. Wat ze NIET kunnen zien is of die modules in de
  // dráaiende app aan elkaar hangen: of finishLogin() de chip werkelijk laat
  // herbeoordelen, of de configuratie op dit toestel de koopknop uit laat, en
  // of de Worker die hier draait het inwisselen zonder klantaccount ook echt
  // weigert. Dat is exact het soort verbinding dat bij #29, #74 en #52 ontbrak
  // zonder ooit een fout te geven. Vandaar: de weg meten, in de app.
  //
  // WAT ERUIT IS. De drie proeven voor #74 en de begeleide rit van 01-09 zijn
  // weg — die zijn beantwoord en staan in test-rit.js en test-begeleid.js met
  // tegenproef. De #58-proef BLIJFT: die gaf op 01-09 de enige FOUT van de run
  // en het is nog onbeslist of de melding klopt of de meting (#79).
  //
  // GELDVEILIGHEID. Geen enkele proef hieronder doet een AI-call; die kosten
  // een klant echte tokens. De code die naar /credits/redeem gaat bestaat
  // gegarandeerd niet, dus er valt niets af te stempelen.
  // ══════════════════════════════════════════════════════════════

  // ── TOEGEVOEGD 1 (#52): hoort de chip bij de rol die nu ingelogd is? ──
  // De fout van 29-08 in één zin: de chip werd getekend vóór de login en
  // daarna keek er niets meer naar. Een beheerder hield zo een chip die niet
  // bij hem hoort, met "tokens onbekend" erin. Deze proef kijkt naar de DOM
  // van dit moment — dat is de enige plek waar die vraag te beantwoorden is.
  await _doe(5, 'De tokenchip hoort bij de rol die nu ingelogd is', function () {
    if (!window.PLCredits) return { staat: 'FOUT', detail: 'PLCredits ontbreekt — de tegoedmodule is niet geladen' };
    if (typeof PLCredits.chip !== 'function')
      return { staat: 'FOUT', detail: 'PLCredits.chip() ontbreekt — dan kan niets de chip herbeoordelen na een rolwissel (#52)' };

    const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
    const rol = (window.currentUser && window.currentUser.role) || 'niemand ingelogd';
    const er = function () { return !!document.getElementById('plCredChip'); };

    // Eerst de stand zoals hij nu is: dít is wat een gebruiker ziet.
    if (er() !== klant)
      return { staat: 'FOUT', detail: 'rol "' + rol + '"' + (klant ? '' : ' hoort geen tokenchip te zien') +
        ' maar de chip is ' + (er() ? 'aanwezig' : 'afwezig') +
        ' — de chip volgt het laadmoment in plaats van de rol (#52)' };

    // En dan de haak zelf: een herbeoordeling mag het antwoord niet omgooien.
    // Doet hij dat wél, dan staat er ergens een tweede plek die dezelfde
    // beslissing neemt, en dat is in dit project al drie keer een bug geweest.
    PLCredits.chip();
    if (er() !== klant)
      return { staat: 'FOUT', detail: 'na PLCredits.chip() is de chip ' + (er() ? 'verschenen' : 'verdwenen') +
        ' terwijl de rol niet veranderde — twee plekken beslissen over dezelfde chip' };

    return 'rol "' + rol + '": chip ' + (klant ? 'aanwezig met ' +
      (PLCredits.saldoBekend() ? PLCredits.saldo() + ' tokens' : 'saldo nog onbekend') : 'afwezig') +
      ', en een herbeoordeling laat dat zo';
  });

  // ── TOEGEVOEGD 2 (§8): neemt de teller het saldo van de server over? ──
  // De Worker stuurt het saldo na afboeking mee in X-PidLane-Saldo. PIDLANE.md
  // beschreef sinds juli dat apiFetch die uitleest — er las niemand, en de
  // teller liep dus op de schatting. Een échte call zou hier tokens kosten, dus
  // we voeren alleen de kop aan de module en zetten daarna terug wat er stond.
  await _doe(5, 'De tokenteller neemt het saldo van de server over', function () {
    if (!window.PLCredits || typeof PLCredits.volgServer !== 'function')
      return { staat: 'FOUT', detail: 'PLCredits.volgServer() ontbreekt — dan blijft de teller op de schatting lopen (§8)' };
    const kop = function (v) { return { get: function (n) { return String(n).toLowerCase() === 'x-pidlane-saldo' ? String(v) : null; } }; };
    const bekend = PLCredits.saldoBekend();
    const voor = PLCredits.saldo();
    const proef = bekend ? voor + 1 : 7;

    PLCredits.volgServer(kop(proef), {});
    const raak = PLCredits.saldo() === proef;

    // Terugzetten, en wel precies naar de toestand van vóór deze proef. Bij een
    // klant is dat het oude getal; bij een beheerder was het saldo onbekend en
    // dat is vergeetKlant() — anders laat deze proef een verzonnen saldo achter.
    if (bekend) PLCredits.volgServer(kop(voor), {});
    else PLCredits.vergeetKlant();

    if (!raak)
      return { staat: 'FOUT', detail: 'een saldo van ' + proef + ' in de kop leverde ' + PLCredits.saldo() +
        ' op — de server is niet leidend en de teller loopt op de schatting' };
    if (PLCredits.saldo() !== voor || PLCredits.saldoBekend() !== bekend)
      return { staat: 'FOUT', detail: 'de proef heeft het saldo veranderd (' + voor + ' → ' + PLCredits.saldo() +
        ') — dat is een fout in deze proef, niet in de app, maar hij moet wel weg' };
    return 'de kop X-PidLane-Saldo zet de teller (' + proef + ' overgenomen), en de stand van vóór de proef staat terug';
  });

  // ── TOEGEVOEGD 3 (#42): staat de app in de handmatige eerste fase? ──
  // Tokens verkopen ín de app is precies wat Google's betaalregels raakt, en
  // die vraag is niet beantwoord. Zolang `tikkie_kopen` leeg is in de
  // Config-tabel is er geen koopknop en loopt het aanvragen per mail. Dit is
  // de enige plek waar de ECHTE configuratie van dit toestel te zien is — in
  // node is PID_CONFIG altijd leeg en klopt alles vanzelf.
  await _doe(5, 'Geen koopknop in de app; de aanvraag loopt per mail (#42)', function () {
    if (!window.PLKlant) return { staat: 'FOUT', detail: 'PLKlant ontbreekt' };
    const link = PLKlant.CFG.tikkieKopen;
    if (link)
      return { staat: 'FOUT', detail: 'er staat een koopknop in de app (tikkie_kopen is gevuld) terwijl de eerste ' +
        'fase handmatig is — zet de sleutel leeg in admin.html, of sluit #42 met de uitkomst erbij' };
    if (typeof PLKlant.aanvraagMail !== 'function')
      return { staat: 'FOUT', detail: 'PLKlant.aanvraagMail() ontbreekt — dan opent de knop een lege mail zonder account' };
    const mail = PLKlant.aanvraagMail();
    if (!/^mailto:/.test(mail))
      return { staat: 'FOUT', detail: 'de aanvraagknop wijst niet naar een mailto maar naar: ' + String(mail).slice(0, 60) };
    const klant = !!(PLKlant.isKlant && PLKlant.isKlant());
    const adres = (window.currentUser && window.currentUser.name) || '';
    if (klant && adres && mail.indexOf(encodeURIComponent(adres)) < 0)
      return { staat: 'FOUT', detail: 'de aanvraagmail draagt het account niet — dan begint elke handmatige ' +
        'aanvraag met "en wie ben jij?"' };
    return 'geen koopknop; de aanvraag gaat per mail' + (klant ? ' met het account erin' : ' (geen klant ingelogd, dus zonder account)');
  });

  // ── TOEGEVOEGD 4: weigert de Worker een code zonder klantaccount? ──
  // De route stempelde de code eerst af en keek pas daarna of er een account
  // was om hem op bij te schrijven. Zonder account was de code verbrand en het
  // tegoed nergens. De app haakte daar zelf al op af, maar dat is een verzoek
  // en geen grens — deze proef praat dus met de echte Worker.
  //
  // De code hieronder bestaat niet en kan niet bestaan (hij draagt een stempel
  // van dit moment), dus er valt niets af te stempelen. Een beheerder hoort
  // 401 te krijgen, een klant 404: gevonden-niet.
  await _doe(5, 'De Worker weigert een code zonder klantaccount', async function () {
    if (typeof PROXY_URL === 'undefined' || !PROXY_URL)
      return { staat: 'LET OP', detail: 'geen PROXY_URL — niet te meten zonder Worker' };
    if (!window.APP_TOKEN)
      return { staat: 'LET OP', detail: 'geen sessietoken — log eerst in' };
    const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
    const code = 'PIDL-B5' + String(Date.now()).slice(-6);
    let r;
    try {
      r = await fetch(String(PROXY_URL).replace(/\/$/, '') + '/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Token': window.APP_TOKEN },
        body: JSON.stringify({ code: code })
      });
    } catch (e) {
      return { staat: 'LET OP', detail: 'Worker niet bereikbaar: ' + ((e && e.message) || e) };
    }
    const d = await r.json().catch(function () { return {}; });
    if (d.ok === true)
      return { staat: 'FOUT', detail: 'een verzonnen code werd geaccepteerd — dat kan niet en betekent dat er ' +
        'iets heel anders mis is met /credits/redeem' };
    if (!klant && r.status !== 401)
      return { staat: 'FOUT', detail: 'zonder klantaccount gaf de Worker ' + r.status + ' in plaats van 401 — ' +
        'de sessiecontrole staat weer ná het afstempelen en dan kan een code verbranden' };
    // Een verlopen sessie geeft óók 401, en dan zegt deze proef niets over de
    // controle die we willen meten. Dat is LET OP en geen FOUT: een test die
    // rood staat om de verkeerde reden wordt genegeerd (CLAUDE.md).
    if (klant && r.status === 401)
      return { staat: 'LET OP', detail: 'de Worker weigert de sessie (401) terwijl er een klant is ingelogd — ' +
        'waarschijnlijk een verlopen sessietoken; log opnieuw in en draai deze proef nog eens' };
    if (klant && r.status !== 404)
      return { staat: 'FOUT', detail: 'met klantaccount gaf een niet-bestaande code ' + r.status +
        ' in plaats van 404 (' + (d.error || 'geen melding') + ')' };
    return (klant ? 'als klant: 404 code niet gevonden' : 'als beheerder: 401 log eerst in met je account') +
      ' — er is niets afgestempeld';
  });

  // ── VERWIJDERD: het abonnement dat niet bestaat ──────────────────
  // "Je bent ingelogd met een zakelijk account. Daarvoor gelden geen tokens —
  // analyses zitten in je abonnement." Dat abonnement bestaat niet: onder #49
  // is zo'n account personeel dat op de sleutel van de beheerder draait. De
  // tekst is op 29-08 vervangen; deze proef bewaakt dat hij niet terugkomt via
  // een andere weg, en dat het menu-item weg is voor wie geen klant is.
  await _doe(5, 'Nergens meer een abonnement beloofd aan personeel', function () {
    const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
    const acc = document.getElementById('kbAccount');
    if (acc && !klant && acc.style.display !== 'none')
      return { staat: 'FOUT', detail: '"Mijn account" staat in het menu terwijl er geen klantaccount is ingelogd — ' +
        'dat scherm gaat over een tegoed dat dit account niet heeft (#49)' };
    const tekst = document.body.innerHTML || '';
    if (/analyses zitten in je abonnement/i.test(tekst))
      return { staat: 'FOUT', detail: 'de oude tekst over een abonnement staat weer in beeld — dat abonnement bestaat niet' };
    return klant ? 'klantaccount: "Mijn account" hoort er te staan en staat er'
                 : 'geen klantaccount: "Mijn account" is verborgen en nergens wordt een abonnement beloofd';
  });

  // ── BLIJFT STAAN (#58/#79): kloppen de veilige zones op dit toestel? ──
  // Deze gaf op 01-09 de enige FOUT van de run, en het is nog onbeslist of
  // de melding klopt of de meting: op ≤760px krijgt .app height:auto en mág
  // #appGrid langer zijn dan het scherm. Stap 7 van de begeleide run zet er
  // een oog op; tot dat antwoord er is blijft deze proef staan (#79).
  // Dit is de enige plek waar dit écht te meten valt: in een browser zijn
  // beide zones 0 en klopt álles. Op een toestel met een statusbalk en drie
  // knoppen komen de getallen pas uit elkaar. Vandaar meten en niet lezen.
  await _doe(5, 'De app past tussen de statusbalk en de navigatiebalk', function () {
    const meet = function (token) {
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:' + token;
      document.body.appendChild(p);
      const h = p.getBoundingClientRect().height;
      p.remove();
      return h;
    };
    const sat = meet('var(--pl-sat)');
    const sab = meet('var(--pl-sab)');
    const top = meet('var(--pl-top)');
    if (Math.abs(top - (46 + sat)) > 1)
      return { staat: 'FOUT', detail: '--pl-top is ' + top.toFixed(1) + 'px maar de topbalk is 46 + ' +
        sat.toFixed(1) + ' = ' + (46 + sat).toFixed(1) + 'px hoog' };

    const bar = document.querySelector('.topbar');
    if (bar && Math.abs(bar.getBoundingClientRect().bottom - top) > 1.5)
      return { staat: 'FOUT', detail: 'de topbalk eindigt op ' + bar.getBoundingClientRect().bottom.toFixed(1) +
        'px terwijl --pl-top ' + top.toFixed(1) + 'px zegt — alles wat daaronder hangt staat dus verkeerd' };

    const app = document.getElementById('appGrid');
    if (!app) return { staat: 'LET OP', detail: '#appGrid niet gevonden' };
    const onder = app.getBoundingClientRect().bottom;
    const grens = window.innerHeight - sab;
    if (onder > grens + 1)
      return { staat: 'FOUT', detail: 'het werkscherm loopt tot ' + onder.toFixed(0) + 'px door terwijl er op ' +
        grens.toFixed(0) + 'px een navigatiebalk begint — de onderste ' + (onder - grens).toFixed(0) +
        'px valt daarachter weg (issue #58)' };
    return 'statusbalk ' + sat.toFixed(0) + 'px, navigatiebalk ' + sab.toFixed(0) +
           'px, werkscherm eindigt op ' + onder.toFixed(0) + ' van ' + grens.toFixed(0) + 'px' +
           (sat + sab === 0 ? ' (browser: geen zones, dus deze proef zegt hier weinig)' : '');
  });

}

// ══════════════════════════════════════════════════════════════════
// BLOK 11 — INVENTARISATIE VOOR DE OPENSTAANDE PUNTEN
// ══════════════════════════════════════════════════════════════════
// Raakt de bus NIET aan en verandert niets. Het telt alleen, zodat drie
// openstaande sessies met getallen kunnen beginnen in plaats van met een
// schatting. Kost een paar seconden en mag dus gewoon in elke run mee.
//
//   punt 3   mag de gate een stille sensor opruimen? → hoeveel zijn het er,
//            en hoe lang zwijgen ze al?
//   punt 6   verspreide logica → hoeveel modules pakken zelf een 41-header
//            uit, en hoeveel doen hun eigen fetch?
//   punt 12  bytelengtes → staan 0155/0156 er nog steeds naast?
const _bronCache = {};
async function _bron(naam) {
  if (Object.prototype.hasOwnProperty.call(_bronCache, naam)) return _bronCache[naam];
  let t = null;
  try {
    const r = await fetch(naam);
    t = r.ok ? await r.text() : null;
  } catch (e) { t = null; }
  _bronCache[naam] = t;
  return t;
}

/* ── BLOK 12 — WIE IS DEZE ADAPTER? (24-08-2026, alleen lezen) ────────
   Het logboek van 23-08 meldt "OBD2 adapter: OBDLink MX+ 90011" en pas
   daarna "ELM327 v1.4b". Dat tweede is de ATI-string, en juist die staat
   in PIDLANE.md als bewijs dat dit een clone zonder STN-chip is. Maar een
   echte OBDLink MX+ antwoordt op ATI óók met een ELM327-versie, puur voor
   compatibiliteit: de STN2120 die erin zit kan veel meer.

   Het onderscheid is één commando. STI is een STN-commando dat geen enkele
   ELM327 kent: een STN-adapter antwoordt met zijn eigen firmware ("STN2120
   v5.6.1"), een clone antwoordt "?" of niets. STDI geeft de merknaam.

   Waarom dit ertoe doet: als er een STN in zit, dan zijn STPX (één commando
   met eigen timeout en verwacht aantal frames) en MS-CAN wél beschikbaar.
   Dat raakt de hele pollstrategie. En zolang het onbeslist is, staat er een
   aanname in de architectuurkaart die de verkeerde kant op wijst.

   Alleen lezen: drie commando's, geen header, geen protocolwissel, geen
   schrijfactie richting de auto. Kost een seconde of twee. */
async function _blok12() {
  if (typeof connected === 'undefined' || !connected) {
    await _doe(12, 'Adapter-identiteit', function () {
      return { staat: 'LET OP', detail: 'niet verbonden — blok 12 vraagt de adapter zelf iets' };
    });
    return;
  }

  await _doe(12, 'Adapter-identiteit (ATI / STI / STDI)', async function () {
    let ati = '', sti = '', stdi = '';
    try { ati = String(await sendCmd('ATI', 2000) || '').trim(); } catch (e) { ati = 'FOUT'; }
    try { sti = String(await sendCmd('STI', 2000) || '').trim(); } catch (e) { sti = ''; }
    try { stdi = String(await sendCmd('STDI', 2000) || '').trim(); } catch (e) { stdi = ''; }

    const schoon = function (x) { return String(x).replace(/[\r\n>]+/g, ' ').replace(/\s+/g, ' ').trim(); };
    ati = schoon(ati); sti = schoon(sti); stdi = schoon(stdi);

    // "?" is het ELM327-antwoord op een onbekend commando. Leeg telt ook als
    // "kent het niet" — een clone die niets terugstuurt is nog steeds een clone.
    const kentSTI = !!sti && !/^\?+$/.test(sti) && !/^NO DATA$/i.test(sti);

    // 26-08b: PIDLANE.md IS bijgewerkt (§1 noemt STI/STDI en wat STPX betekent).
    // De oude tekst zei "PIDLANE.md zegt van niet en moet bij" en bleef dat
    // zeggen nadat het gedaan was — een opdracht die nooit afgaat leert je 'm
    // negeren. Blijft LET OP, want het is iets wat je moet wéten (de
    // pollstrategie hangt eraan), niet iets wat stuk is.
    if (kentSTI)
      return { staat: 'LET OP', detail: 'STN-adapter: STI="' + sti + '"' + (stdi ? ', STDI="' + stdi + '"' : '') +
        ' terwijl ATI="' + ati + '". STPX en MS-CAN zijn beschikbaar (staat zo in PIDLANE.md §1). ' +
        'Of STPX ook wint is blok 13 — bij stilstand niet, onder belasting nog te meten.' };

    return 'geen STN: ATI="' + ati + '", STI kent hij niet (' + (sti || 'geen antwoord') + ').';
  });
}

/* ── BLOK 13 — LEVERT STPX WAT HET BELOOFT? (25-08-2026, alleen lezen) ─
   Blok 12 stelde vast dat dit een STN2255 is (OBDLink MX+), geen clone.
   Daarmee is STPX beschikbaar: één commando waarin je zelf de header, de
   data én het VERWACHTE AANTAL ANTWOORDFRAMES meegeeft.

   Waarom dat zoveel uitmaakt: bij een gewone ELM-uitvraag weet de adapter
   niet hoeveel frames er komen, dus wacht hij tot de timeout verstrijkt of
   tot hij denkt klaar te zijn. Dat is precies de reden dat deze app
   batchgroottes moet raden, bytelengtes moet leren (PLPidLen) en bij twijfel
   van drie naar één terugvalt. Met R:1 weet de adapter dat hij na één frame
   mag stoppen en antwoordt hij meteen.

   Dit blok meet dat verschil in plaats van het aan te nemen. Vijf keer
   hetzelfde PID langs beide wegen, mediaan vergelijken. Vijf is weinig, maar
   dit is een eerste peiling — als het verschil klein is, hoef je die hele
   laag niet aan te raken.

   ALLEEN LEZEN: STPX verandert geen enkele instelling van de adapter en
   schrijft niets naar de auto. Er wordt bewust NIET van protocol gewisseld
   (MS-CAN) — dat verandert wél de toestand en hoort niet in een testrun die
   je tijdens het rijden kunt draaien.

   Onzekerheid die ik eerlijk meld: de exacte STPX-syntax verschilt per
   firmwareversie. Daarom staat het rauwe antwoord in de uitslag. Komt er "?"
   terug, dan kent deze firmware de vorm niet en is dat het antwoord — niet
   een bewijs dat STPX niet werkt. */
async function _blok13() {
  if (typeof connected === 'undefined' || !connected) {
    await _doe(13, 'STPX-winst', function () {
      return { staat: 'LET OP', detail: 'niet verbonden — blok 13 vraagt de adapter zelf iets' };
    });
    return;
  }

  const schoon = function (x) { return String(x == null ? '' : x).replace(/[\r\n>]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  const mediaan = function (a) { const b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; };

  // 1. Kent deze firmware de STPX-vorm überhaupt?
  let vorm = '';
  await _doe(13, 'STPX: kent de adapter het commando', async function () {
    let r = '';
    try { r = schoon(await sendCmd('STPX D:0100, R:1', 3000)); } catch (e) { r = 'FOUT: ' + (e && e.message || e); }
    vorm = r;
    if (!r) return { staat: 'FOUT', detail: 'geen antwoord op STPX' };
    if (/^\?+$/.test(r)) return { staat: 'FOUT', detail: 'antwoord "?" — deze firmware kent deze STPX-vorm niet. Rauw: "' + r + '"' };
    if (/^41 ?00/i.test(r.replace(/\s/g, '')) || /4100/i.test(r.replace(/\s/g, '')))
      return 'STPX antwoordt als een normale uitvraag: "' + r + '"';
    return { staat: 'LET OP', detail: 'antwoord niet herkend als 4100 — beoordeel zelf. Rauw: "' + r + '"' };
  });

  if (/^\?+$/.test(vorm) || !vorm) return;

  // 2. Hoeveel scheelt het? Vijf metingen per weg, om en om zodat een
  //    tijdelijk drukke bus beide kanten even hard raakt.
  await _doe(13, 'STPX: hoeveel sneller dan een gewone uitvraag', async function () {
    // 26-08b — DE OMSTANDIGHEDEN ERBIJ. Twee runs gaven +8% en −1%, allebei bij
    // stilstand, en aan de uitslag alleen was dat niet te zien. STPX hoort juist
    // te winnen als de bus vol staat: dan wacht een gewone uitvraag op een
    // timeout terwijl R:1 meteen afrondt. Zonder de bezetting en de snelheid
    // erbij is een meting van 156 vs 155 ms niet te onderscheiden van dezelfde
    // meting tijdens het rijden — en dan blijft de vraag eeuwig open staan.
    const omstandigheid = function () {
      let bezet = null, perSec = null, kmh = null;
      try { const s = PLBus.stats(); bezet = s.belasting; perSec = s.perSec; } catch (e) { /* stil: alleen context */ }
      try { if (typeof pidVals !== 'undefined' && pidVals && typeof pidVals['010D'] === 'number') kmh = pidVals['010D']; }
      catch (e) { /* stil: alleen context */ }
      return { bezet: bezet, perSec: perSec, kmh: kmh };
    };
    const voor = omstandigheid();

    const gewoon = [], stpx = [];
    for (let i = 0; i < 5; i++) {
      let t = Date.now();
      try { await sendCmd('010C', 3000); } catch (e) { /* mislukte poging telt niet mee */ }
      gewoon.push(Date.now() - t);
      t = Date.now();
      try { await sendCmd('STPX D:010C, R:1', 3000); } catch (e) { /* mislukte poging telt niet mee */ }
      stpx.push(Date.now() - t);
    }
    const na = omstandigheid();
    const g = mediaan(gewoon), x = mediaan(stpx);
    if (!g || !x) return { staat: 'LET OP', detail: 'geen bruikbare tijden gemeten' };
    const pct = Math.round((g - x) / g * 100);

    const kmh = (na.kmh == null ? voor.kmh : na.kmh);
    const bezet = (voor.bezet == null ? na.bezet : Math.round(((voor.bezet || 0) + (na.bezet || 0)) / 2));
    const rijdt = (typeof kmh === 'number' && kmh >= 15);
    const ctx = 'bij ' + (bezet == null ? '?' : bezet + '%') + ' busbezetting, ' +
      (kmh == null ? 'snelheid onbekend' : kmh + ' km/u') +
      (voor.perSec == null ? '' : ', ' + voor.perSec + ' verzoeken/s');
    const regel = 'gewoon ' + g + ' ms, STPX ' + x + ' ms (' + (pct >= 0 ? '−' : '+') + Math.abs(pct) + '%)  [' + ctx + ']';

    // Zonder een drukke bus is dit het gunstigste geval en dus geen antwoord op
    // de openstaande vraag. Dat expliciet zeggen, anders leest een klein
    // verschil bij stilstand als "STPX levert niets op".
    const staart = rijdt ? '' :
      '  — LET OP: dit is bij stilstand gemeten, het gunstigste geval voor een gewone uitvraag. ' +
      'De openstaande vraag is of STPX wint als de bus vol staat; draai dit blok tijdens het rijden ' +
      'met alle vier de aanvragers aan.';

    if (pct >= 20)
      return { staat: 'LET OP', detail: regel + ' — dit is de moeite waard: met R: hoeft de adapter niet meer op een timeout te wachten. Overweeg de batchgok, PLPidLen en de terugval drie-naar-één te vervangen.' + staart };
    if (pct <= -10)
      return { staat: 'LET OP', detail: regel + ' — STPX is hier LANGZAMER. Niet doen dus, of de syntax klopt niet.' + staart };
    return { staat: rijdt ? 'ok' : 'LET OP',
      detail: regel + ' — verschil te klein om die laag voor om te bouwen' + staart };
  });

  // 3. Wat de firmware verder meldt. Puur informatief; MS-CAN wordt bewust
  //    niet uitgeprobeerd, want daarvoor moet je van protocol wisselen.
  await _doe(13, 'STPX: protocol en kanaal', async function () {
    let dpn = '', stp = '';
    try { dpn = schoon(await sendCmd('ATDPN', 2000)); } catch (e) { dpn = ''; }
    try { stp = schoon(await sendCmd('STPRS', 2000)); } catch (e) { stp = ''; }
    return 'ATDPN="' + (dpn || 'geen antwoord') + '", STPRS="' + (stp || 'geen antwoord') +
      '" — MS-CAN is niet geprobeerd: dat vraagt een protocolwissel en die hoort niet in een testrun tijdens het rijden';
  });
}

// De PIDs die een rit moet kunnen beantwoorden. De begeleide run zet ze in
// stap 2 in de selectie; blok 14 kijkt achteraf of dat gelukt is. Zo verdwijnt
// de regel "staat hij in de actieve selectie?" uit het verslag: die vraag is
// dan vóór de rit beantwoord in plaats van erna.
const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C'];
let _ritGevraagd = [];      // wat stap 2 heeft aangezet, met de weigeringen erbij

/* Eén PID, één oordeel over de MEETBAARHEID — los van wat er gemeten is.
   Op één plek, want dit onderscheid is de hele bevinding van #74 en het komt
   in vier regels van dit blok terug. Drie standen:

     niet-gemeten   nul verversingen: hij stond niet in de pollronde. Over zijn
                    gedrag valt niets te zeggen, ook niet "hij stond stil".
     te-weinig      één verversing: te weinig om beweging op te beoordelen.
     gemeten        twee of meer verversingen. Nu pas telt `veranderingen`. */
function _meetStand(e) {
  if (!e) return { stand: 'niet-gemeten', tekst: 'geen enkele waarneming' };
  if (e.n === 0) return { stand: 'niet-gemeten',
    tekst: '0 verversingen over ' + e.tikken + ' tik(ken) — deze rit niet uitgevraagd' };
  if (e.n === 1) return { stand: 'te-weinig',
    tekst: '1 verversing over ' + e.tikken + ' tik(ken) — te weinig voor een oordeel' };
  return { stand: 'gemeten', tekst: e.n + ' verversingen over ' + e.tikken + ' tik(ken)' };
}

// Waarom een PID niet gemeten is, in gebruikerstaal. Het verschil tussen "je
// hebt hem niet aangezet" en "je hebt hem aangezet en hij antwoordt niet" is
// het enige dat je hierna kunt doen, dus dat moet erbij.
function _waaromNiet(pid) {
  const gevraagd = _ritGevraagd.indexOf(pid) > -1;
  let inSelectie = false;
  try { inSelectie = !!(typeof activePIDs !== 'undefined' && activePIDs && activePIDs.has && activePIDs.has(pid)); }
  catch (e) { console.warn('activePIDs niet leesbaar bij het duiden van een niet-gemeten PID', e); }
  if (gevraagd && inSelectie) return 'staat sinds stap 2 in de selectie en levert tóch niets — dát is een bevinding';
  if (inSelectie) return 'staat wél in de selectie maar kwam niet aan de beurt — kijk naar het pollbudget (blok 7)';
  return 'stond niet in de selectie; start de begeleide run, stap 2 zet hem erbij';
}

/* ── BLOK 14 — DE RIT (26-08-2026, meet niets zelf) ───────────────────
   Leest PLRit uit. Raakt de bus NIET aan: alles hieronder komt uit wat er
   tijdens het rijden al langskwam. Daarom veilig om tijdens de rit te draaien.

   Beantwoordt de vragen die bij stilstand onbeantwoordbaar zijn. De eerste twee
   controles zijn de belangrijkste en staan bewust vóór alle andere: heeft de
   auto gereden, en is er überhaupt iets gemeten. Tot 01-09 ontbrak die tweede,
   en daardoor kon dit blok een PID die niemand uitvroeg "bevroren" noemen
   (#74). */
async function _blok14() {
  const R = window.PLRit;
  if (!R) {
    await _doe(14, 'De rit', function () {
      return { staat: 'FOUT', detail: 'PLRit ontbreekt — pidlane-testrun.js is niet meegekomen (cache?)' };
    });
    return;
  }

  const per = R.per();
  const duur = R.duurS();
  const pids = Object.keys(per);
  const nz = function (p) { return per[p] || null; };

  // ── 0a. Is er iets gemeten? ──
  // Vóór de rijvraag, want zonder versheidsbron is ook "er is gereden" niet te
  // zeggen. Dit is de controle die #74 had moeten vangen.
  let meetbaar = false;
  await _doe(14, 'Meet de ritwaarnemer echte verversingen?', function () {
    const b = R.bron();
    if (!b.stempels)
      return { staat: 'FOUT', detail: 'geen versheidsbron (_pidLastUpd ontbreekt) — er is deze rit NIETS gemeten. ' +
        'Alles hieronder zou dan over de inhoud van pidVals gaan en niet over de auto; dat is de toestand van #74' };
    const d = R.dekking();
    meetbaar = d.gemeten.length > 0;
    const kop = d.gemeten.length + ' PID(s) echt uitgevraagd, ' + d.eenmalig.length + ' maar één keer, ' +
      d.nietGemeten.length + ' alleen uit het geheugen (' + R.tikken() + ' tikken, hoogste telling ' + R.monsters() + ')';
    if (!meetbaar)
      return { staat: 'FOUT', detail: kop + ' — geen enkele PID werd tijdens deze rit twee keer ververst. ' +
        'Draaide de pollus wel? Zonder verversingen zegt de rest van dit blok niets' };
    if (b.zonderBron)
      return { staat: 'LET OP', detail: kop + '  [' + b.zonderBron + ' tik(ken) zonder versheidsbron overgeslagen]' };
    return kop + ' — alleen de eerste groep telt mee in de oordelen hieronder';
  });

  // ── 0b. Heeft deze auto überhaupt gereden? ──
  // Zonder dit is elke uitspraak hieronder een uitspraak over stilstand.
  let gereden = false;
  await _doe(14, 'Is er gereden?', function () {
    const sp = nz('010D');                      // voertuigsnelheid
    const m = _meetStand(sp);
    if (m.stand !== 'gemeten')
      return { staat: 'LET OP', detail: 'voertuigsnelheid (010D): ' + m.tekst + ' — ' + _waaromNiet('010D') +
        '. Zonder snelheidsmonsters is niet vast te stellen of er gereden is, en alles hieronder ' +
        'staat dan open' };
    gereden = sp.max >= 15;
    const kop = 'hoogste snelheid ' + sp.max + ' km/u over ' + Math.round(duur / 60) + ' min (' + m.tekst + ')';
    if (!gereden)
      return { staat: 'LET OP', detail: kop + ' — de auto heeft niet gereden. Alles hieronder gaat dan over stilstand ' +
        'en beantwoordt de openstaande vragen NIET. Rijd en draai dit blok opnieuw.' };
    return kop;
  });

  // ── 1. Raildruk — de vraag sinds 23-08 (#19) ──
  // Tot 01-09 stond hier "0 wijzigingen = bevroren = parser- of definitiefout".
  // Dat was drie ritten lang onjuist: 0123 en 0159 stonden in geen van die
  // ritten in de pollronde, en nul verversingen kan geen enkele uitspraak over
  // een sensor dragen (#74). De sluiting van #19 rustte erop.
  await _doe(14, 'Raildruk 0123/0159 — bewegen ze?', function () {
    const rij = [], stil = [], blind = [];
    ['0123', '0159'].forEach(function (p) {
      const e = nz(p), m = _meetStand(e);
      rij.push(p + ': ' + m.tekst + (m.stand === 'gemeten' ? ', ' + e.veranderingen + ' wijzigingen, ' + e.min + '–' + e.max : ''));
      if (m.stand === 'gemeten') { if (e.veranderingen === 0) stil.push(p); }
      else blind.push(p);
    });
    if (blind.length === 2)
      return { staat: 'LET OP', detail: rij.join('  |  ') + ' — allebei niet gemeten, dus over #19 zegt deze rit niets. ' +
        _waaromNiet('0123') };
    if (blind.length)
      return { staat: 'LET OP', detail: rij.join('  |  ') + ' — ' + blind.join(' en ') + ' niet gemeten; ' + _waaromNiet(blind[0]) };
    if (stil.length && gereden)
      return { staat: 'LET OP', detail: rij.join('  |  ') + ' — bevroren terwijl ze WEL werden uitgevraagd en de auto reed. ' +
        'Op directe inspuiting kan dat niet: dit is een parser- of definitiefout (#19)' };
    if (stil.length)
      return { staat: 'LET OP', detail: rij.join('  |  ') + ' — stil, maar er is niet gereden; zegt nog niets' };
    return rij.join('  |  ') + ' — allebei in beweging, gemeten en wel: de bevinding van 23-08 is hiermee weg';
  });

  // ── 2. Welke sensoren bewogen niet? ──
  // 23-08: 32 van de 55 bewogen niet in 27 minuten. Dat getal was voor het
  // grootste deel #74: PIDs die niemand uitvroeg. Deze telling scheidt de drie
  // groepen nu, want alleen de eerste is een bevinding.
  await _doe(14, 'Sensoren die niet bewogen', function () {
    if (!pids.length) return { staat: 'LET OP', detail: 'nog geen waarnemingen — draait PLRit? (' + R.tikken() + ' tikken)' };
    // Deze PIDs HOREN constant te zijn: status, configuratie en tellers die
    // alleen bij een storing oplopen. Ze meetellen als "bevroren sensor" geeft
    // elke rit een handvol vals alarm.
    const MAG_STIL = {
      '0101': 'MIL-status', '0121': 'afstand met MIL aan', '011C': 'OBD-norm',
      '0113': 'O2-sensoren aanwezig', '0151': 'brandstoftype', '0163': 'referentiekoppel',
      '0165': 'aux-ondersteuning', '0141': 'monitors deze rit', '0103': 'brandstofsysteemstatus',
      '014D': 'tijd met MIL aan', '0130': 'warmlopen sinds wissen', '011F': 'motorlooptijd',
      // Steunbitmaskers. Ze staan in pidVals omdat blok 6 en de ontdekking ze
      // uitvragen, maar het zijn geen sensoren: "0120 vast op 160" is de eerste
      // byte van een bitmasker en betekent niets.
      '0100': 'steunbits 01-20', '0120': 'steunbits 21-40',
      '0140': 'steunbits 41-60', '0160': 'steunbits 61-80', '0102': 'DTC uit freeze frame'
    };
    const stil = [], beweegt = [], blind = [], eenmalig = [], verwacht = [];
    pids.forEach(function (p) {
      const m = _meetStand(per[p]);
      if (m.stand === 'niet-gemeten') { blind.push(p); return; }
      if (m.stand === 'te-weinig') { eenmalig.push(p); return; }
      if (per[p].veranderingen > 0) { beweegt.push(p); return; }
      (MAG_STIL[p] ? verwacht : stil).push(p);
    });
    const kop = pids.length + ' PIDs in beeld: ' + beweegt.length + ' bewogen, ' + stil.length + ' gemeten maar stil, ' +
      verwacht.length + ' horen stil te staan, ' + eenmalig.length + ' te weinig gemeten, ' +
      blind.length + ' niet gemeten';
    const naam = function (p) {
      const d = (window.ALL_PID_DEFS && ALL_PID_DEFS[p]) ? ALL_PID_DEFS[p].name : p;
      return p + ' (' + d + ') vast op ' + per[p].laatst;
    };
    if (!stil.length)
      return kop + ' — geen enkele gemeten sensor stond stil. De ' + blind.length +
        ' niet-gemeten PIDs zijn GEEN bevinding: over die groep zegt deze rit niets (#74)';
    const lijst = stil.slice(0, 12).map(naam).join(', ');
    return { staat: gereden ? 'LET OP' : 'ok',
      detail: kop + '.  Gemeten en tóch stil: ' + lijst + (stil.length > 12 ? ' … +' + (stil.length - 12) + ' meer' : '') +
        (gereden ? '  — DIT is de populatie voor de opruimregel (#16) en voor punt 12; de niet-gemeten groep hoort er niet bij'
                 : '  — er is niet gereden, dus verwacht') };
  });

  // ── 3. Turbo — MAP onder belasting ──
  await _doe(14, 'MAP onder belasting (turbodetectie)', function () {
    const m = nz('010B'), st = _meetStand(m);
    if (st.stand !== 'gemeten')
      return { staat: 'LET OP', detail: 'MAP (010B): ' + st.tekst + ' — ' + _waaromNiet('010B') +
        '. Geen oordeel over turbo' };
    const baro = nz('0133');
    const baroSt = _meetStand(baro);
    const grens = (baroSt.stand === 'gemeten' ? baro.max : 101) + 9;
    const kop = 'MAP ' + m.min + '–' + m.max + ' kPa over ' + st.tekst + ', barometer ' +
      (baroSt.stand === 'gemeten' ? baro.max : '? (niet gemeten, 101 aangenomen)') + ', grens ' + grens;
    if (!gereden) return { staat: 'LET OP', detail: kop + ' — niet gereden, dus geen oordeel over turbo' };
    if (m.max > grens) return kop + ' — boven de grens: dit is een TURBO';
    return kop + ' — nooit boven de grens: atmosferisch, of niet hard genoeg getrokken';
  });

  // ── 4. De opruimregel — draaide hij, en wat deed hij? ──
  await _doe(14, 'Opruimregel: is er iets opgeruimd?', function () {
    // De gate is de bron; het log levert hoogstens de tijdstippen. Waarom die
    // volgorde omkeerde staat bij _opruimStand() — kort: allebei de logs zijn
    // ringbuffers en een rit van een half uur wist zijn eigen bewijs (#29).
    let bt = [];
    try { bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : []; } catch (e) { bt = []; }
    const alles = [].concat(bt || [], _appLogRegels() || []);
    let lijst = null;
    try { if (typeof pidOpgeruimdLijst === 'function') lijst = pidOpgeruimdLijst(); }
    catch (e) { console.warn('pidOpgeruimdLijst() gaf een fout — blok 14 kan de opruimregel niet beoordelen', e); }
    return _opruimStand(lijst, alles, duur);
  });

  // ── 5. Liep de app door, of bevroor hij? ──
  // De bevinding van 23-08: veertien stiltes in het logboek, elke herverbinding
  // volgde op een stilte. Dit is dezelfde meting, maar dan geteld in plaats van
  // achteraf uit twee logs gereconstrueerd.
  await _doe(14, 'Liep de app door tijdens de rit?', function () {
    const g = R.gaten(), hv = R.herverbindingen();
    const kop = Math.round(duur / 60) + ' min waargenomen, ' + R.tikken() + ' tikken, hoogste PID-telling ' +
      R.monsters() + ' verversingen, ' + g.length + ' gat(en), ' + hv + ' herverbinding(en)';
    if (!g.length && !hv) return kop + ' — ononderbroken';
    const lijst = g.slice(0, 5).map(function (x) { return x.s + ' s'; }).join(', ');
    return { staat: 'LET OP', detail: kop + (g.length ? '. Stiltes: ' + lijst : '') +
      ' — een gat betekent dat de meetlus zelf niet liep (Android bevriest WebView-timers op de achtergrond). ' +
      'Volgt elke herverbinding op een gat, dan is dat de achtergrondkwestie en niet de bus. ' +
      'Let op: de eerste verbinding van een sessie telt nu nog als herverbinding (#77).' };
  });
}

async function _blok11() {
  // ── PUNT 3: hoe groot is het probleem van de stille sensoren? ──
  // De vraag uit PLAN.md is "op hoeveel mislukte pogingen mag de herijking hem
  // uit activePIDs halen". Die drempel kun je niet kiezen zonder te weten hoe
  // de verdeling eruitziet. Hier staat hij.
  await _doe(11, 'Stille sensoren: hoeveel en hoe hardnekkig', function () {
    let h = {};
    try { h = (typeof _pidHealth !== 'undefined' && _pidHealth) ? _pidHealth : {}; } catch (e) { throw new Error('_pidHealth onleesbaar'); }
    const sleutels = Object.keys(h);
    if (!sleutels.length) return { staat: 'LET OP', detail: 'geen health-oordelen — nog niet lang genoeg gepolld' };

    let actief = new Set();
    try { if (typeof activePIDs !== 'undefined') actief = activePIDs; } catch (e) { /* stil: valt terug op een lege set */ }

    const perStaat = {};
    const stilInSelectie = [];
    sleutels.forEach(function (p) {
      const st = String(h[p] && h[p].staat ? h[p].staat : h[p]);
      perStaat[st] = (perStaat[st] || 0) + 1;
      if (st !== 'ok' && actief.has && actief.has(p)) stilInSelectie.push(p);
    });

    const verdeling = Object.keys(perStaat).map(function (k) { return k + ': ' + perStaat[k]; }).join(', ');
    if (!stilInSelectie.length)
      return sleutels.length + ' beoordeeld (' + verdeling + '), geen enkele niet-ok PID staat in je selectie';
    return { staat: 'LET OP', detail: sleutels.length + ' beoordeeld (' + verdeling + '). ' +
      stilInSelectie.length + ' NIET-OK maar wél in de actieve selectie: ' + stilInSelectie.join(', ') +
      '  — dit is de populatie waar punt 3 een drempel voor moet kiezen' };
  });

  // Bijbehorende vraag uit punt 3: hoe komt een opgeruimde sensor ooit terug?
  // Dat kan alleen als er een pad is dat hem opnieuw beoordeelt. Bestaat dat?
  await _doe(11, 'Punt 3: is er een terugweg voor een opgeruimde sensor', function () {
    const haken = ['plHerijkTick', 'herijkPidGate', 'pidToevoegen', 'magToevoegen'];
    const er = haken.filter(function (n) { return typeof window[n] === 'function'; });
    const weg = haken.filter(function (n) { return typeof window[n] !== 'function'; });
    if (weg.length)
      return { staat: 'LET OP', detail: 'aanwezig: ' + (er.join(', ') || 'geen') + '  |  ONTBREEKT: ' + weg.join(', ') +
        ' — zonder terugweg bouwt punt 3 een zeef die sensoren voorgoed wegwerkt' };
    return 'alle vier de haken bestaan (' + er.join(', ') + ') — een terugweg is technisch mogelijk';
  });

  // ── PUNT 6: verspreide logica, de inventarisatie die dat punt als eerste vraagt ──
  await _doe(11, 'Punt 6: wie pakt zelf een 41-header uit', async function () {
    const mods = ['pidlane-bt.js', 'pidlane-diagbundel.js', 'pidlane-graph.js', 'pidlane-monitor.js',
                  'pidlane-uitgebreid.js', 'pidlane-veldlab.js', 'pidlane-verify.js', 'pidlane-waakronde.js'];
    const eigen = [], viaHelper = [], onleesbaar = [];
    for (const m of mods) {
      const bron = await _bron(m);
      if (bron == null) { onleesbaar.push(m.replace('pidlane-', '').replace('.js', '')); continue; }
      const helper = (bron.match(/splitBatchResponse/g) || []).length;
      // Ruwe maat: een eigen zoekactie naar een 41-antwoordkop.
      const zelf = (bron.match(/indexOf\(\s*['"]4[0-9A-F]/gi) || []).length;
      const naam = m.replace('pidlane-', '').replace('.js', '');
      if (helper) viaHelper.push(naam + '(' + helper + ')');
      if (zelf) eigen.push(naam + '(' + zelf + ')');
    }
    const staart = onleesbaar.length ? '  |  niet gelezen: ' + onleesbaar.join(', ') : '';
    if (!eigen.length && !onleesbaar.length)
      return 'geen enkele module pakt nog zelf uit — punt 6 is op dit onderdeel klaar';
    return { staat: 'LET OP', detail: 'eigen uitpakwerk: ' + (eigen.join(', ') || 'geen') +
      '  |  via splitBatchResponse: ' + (viaHelper.join(', ') || 'geen') + staart };
  });

  await _doe(11, 'Punt 6: hoeveel modules doen hun eigen fetch', async function () {
    const mods = ['pidlane-auth.js', 'pidlane-fuel.js', 'pidlane-koopcheck.js', 'pidlane-remote.js',
                  'pidlane-veldlab.js', 'pidlane-credits.js', 'pidlane-klant.js', 'pidlane-export.js'];
    const rij = [], onleesbaar = [];
    let totaal = 0;
    for (const m of mods) {
      const bron = await _bron(m);
      if (bron == null) { onleesbaar.push(m.replace('pidlane-', '').replace('.js', '')); continue; }
      const n = (bron.match(/[^.\w]fetch\s*\(/g) || []).length;
      if (n) { rij.push(m.replace('pidlane-', '').replace('.js', '') + ': ' + n); totaal += n; }
    }
    const heeftHelper = (typeof window.plFetch === 'function');
    const staart = onleesbaar.length ? '  |  niet gelezen: ' + onleesbaar.join(', ') : '';
    return { staat: totaal > 1 && !heeftHelper ? 'LET OP' : 'ok',
      detail: totaal + ' losse fetch-aanroepen over ' + rij.length + ' modules (' + (rij.join(', ') || 'geen') + ')' +
        '  |  plFetch-helper: ' + (heeftHelper ? 'bestaat' : 'NOG NIET') + staart };
  });

  // ── PUNT 6 (deelvraag): de merkGroep-asymmetrie, live te toetsen ──
  await _doe(11, 'Punt 6: merkGroep-asymmetrie MINI vs BMW', function () {
    if (typeof merkGroep !== 'function')
      return { staat: 'LET OP', detail: 'merkGroep() bestaat niet in deze build' };
    const proef = ['MINI', 'MINI COOPER', 'BMW', 'BMW 320D'];
    const uit = proef.map(function (m) {
      let r = '?';
      try { r = String(merkGroep(m)); } catch (e) { r = 'FOUT'; }
      return m + '→' + r;
    });
    let mini = '', miniLang = '', bmw = '', bmwLang = '';
    try { mini = String(merkGroep('MINI')); miniLang = String(merkGroep('MINI COOPER'));
          bmw = String(merkGroep('BMW')); bmwLang = String(merkGroep('BMW 320D')); } catch (e) { /* stil: uit-rij hieronder toont het al */ }
    const scheef = (mini === miniLang) && (bmw !== bmwLang);
    if (scheef)
      return { staat: 'LET OP', detail: uit.join('  ') + '  — MINI matcht op prefix, BMW op gelijkheid. Dit is de asymmetrie uit punt 6 (§14, DTC-lookup)' };
    return uit.join('  ');
  });

  // ── PUNT 12: komen de afwijkende bytelengtes terug? ──
  await _doe(11, 'Punt 12: bytelengtes 0155 en 0156', function () {
    if (!window.PLPidLen || !PLPidLen.afwijkingen)
      return { staat: 'LET OP', detail: 'PLPidLen.afwijkingen() ontbreekt' };
    let afw = {};
    try { afw = PLPidLen.afwijkingen() || {}; } catch (e) { throw new Error('PLPidLen.afwijkingen() klapt'); }
    const k = Object.keys(afw);
    if (!k.length) return 'geen enkele afwijking gemeten';
    const verdacht = k.filter(function (p) { return p === '0155' || p === '0156'; });
    return { staat: 'LET OP', detail: k.length + ' afwijkend: ' + JSON.stringify(afw).slice(0, 220) +
      (verdacht.length ? '  — 0155/0156 staan er wéér bij, dus de lengtetabel klopt niet voor die twee (punt 12)' : '') };
  });

  // ── De opruimklus zelf: gaat er iets af dat er eerder niet was? ──
  // 584 catches praten nu. Deze regel zet het aantal meldingen sinds het begin
  // van de run naast elkaar, zodat je in het logboek kunt zien of er iets
  // nieuws bij zit zonder de hele staart door te lezen.
  await _doe(11, 'Meldingen sinds het begin van deze run', function () {
    const app = _appLogRegels();
    let bt = [];
    try { bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : []; } catch (e) { bt = []; }
    const tel = function (arr, soort) {
      let n = 0;
      (arr || []).forEach(function (l) {
        const t = (l && l.type) ? String(l.type) : '';
        if (t === soort) n++;
      });
      return n;
    };
    return 'app-log ' + (app.length || 0) + ' regels (' + tel(app, 'warn') + ' warn, ' + tel(app, 'err') + ' err)' +
           '  |  BT-log ' + (bt.length || 0) + ' regels (' + tel(bt, 'warn') + ' warn, ' + tel(bt, 'err') + ' err)' +
           '  — kijk in de staart van het logboek of er meldingen bij zitten die je nog nooit gezien hebt';
  });
}


// ══════════════════════════════════════════════════════════════════
// AANSTUREN
// ══════════════════════════════════════════════════════════════════
async function startTestrun(blokken) {
  if (_trBezig) { try { showToast('Testrun loopt al'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } return; }
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } return; }
  // b8 zat hier tot 24-08 in. Dat is de olietemperatuur-jacht (mode 21/22), en
  // die is losgelaten. Hem in de standaardset laten staan zou betekenen dat elke
  // volle run alsnog scant naar iets waar we niet meer naar zoeken — inclusief
  // het header-gedoe op 7E0 dat daarbij hoort. Los aan te roepen blijft het:
  // startTestrun({b8:true}).
  // b14 (de rit) staat in de standaardset: hij meet niets zelf, leest alleen
  // PLRit uit en kost dus geen buscommando's. Bij stilstand zegt hij netjes dat
  // er niet gereden is in plaats van vier groene vinkjes te geven.
  const b = blokken || { b5: true, b1: true, b2: true, b3: true, b4: true, b6: true, b7: true, b11: true, b12: true, b13: true, b14: true };

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
    // Blok 11 leest alleen (health, bronbestanden, tabellen) en raakt de bus
    // niet aan, dus de plek maakt niet uit — hier staat het tussen de goedkope
    // blokken, ruim vóór de trage metingen van blok 6 en 8.
    if (b.b11) await _blok11();
    // Blok 14 leest alleen PLRit uit en raakt de bus niet aan. Vóór blok 12/13,
    // want die vragen de adapter wél iets en dat wil je niet in het ritbeeld.
    if (b.b14) await _blok14();
    if (b.b12) await _blok12();
    if (b.b13) await _blok13();
    if (b.b6) await _blok6();
    // Blok 8 en 9 horen sinds 24-08 in geen enkele knop meer thuis: dat is de
    // mode 21/22-olietemperatuur en die zoektocht is gestaakt. De code blijft
    // staan zodat een losse aanroep vanuit de console nog kan, mocht er ooit
    // een echte Mazda-DID-lijst opduiken.
    if (b.b8) await _blok8();
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
  // Is er nog niet gemeten (vroegtijdig afgerond), dan is het startmoment dat
  // van de begeleide run — anders zou hier "nu" staan en leest een half
  // verslag als een run van nul seconden.
  const gestart = new Date(_trStart || _BG.gestart || Date.now());
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
  // Is er nog niet gemeten, dan is de duur die van de begeleide rit — anders
  // rekent dit vanaf epoch en staat er een getal van 56 jaar in de kop.
  const duurBasis = _trStart || _BG.gestart;
  r.push('Duur        : ' + (_trDuur || (duurBasis ? Math.round((_nu() - duurBasis) / 1000) : 0)) + ' s' +
    (_trStart ? '' : '  (nog niet gemeten — dit is de duur van de begeleide rit)'));
  r.push('Uitslag     : ' + t.ok + ' ok, ' + t.fout + ' fout, ' + t.letop + ' let op');
  r.push('');
  r.push('WAAR DEZE RUN OVER GAAT');
  r.push('────────────────────────────────────────────────');
  r.push(CAMPAGNE.titel);
  for (let i = 0; i < CAMPAGNE.vragen.length; i++) r.push('  ' + (i + 1) + '. ' + CAMPAGNE.vragen[i]);
  r.push('');

  // Wat er tijdens de rit is gedaan, bevestigd, overgeslagen en gemarkeerd.
  // Bewust vóór de meetblokken: een meting waarvan de voorwaarden niet klopten
  // lees je anders als een uitkomst.
  try { _bgVerslag().forEach(function (l) { r.push(l); }); }
  catch (e) { r.push('(stappenblok niet toegevoegd — ' + ((e && e.message) || e) + ')'); r.push(''); }

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
  } catch (e) { r.push(''); r.push('(TX/RX-sectie niet toegevoegd — plDiagGevallen() gaf een fout: ' + (e.message || e) + ')'); }

  // Staart van de logs, zodat je niet apart hoeft te exporteren.
  try {
    const app = _appLogRegels();
    if (app && app.length) {
      r.push('');
      r.push('APP-LOG — laatste 120 regels');
      r.push('────────────────────────────────────────────────');
      app.slice(-120).forEach(function (l) { r.push(typeof l === 'string' ? l : JSON.stringify(l)); });
    }
  } catch (e) { r.push(''); r.push('(APP-LOG-sectie niet toegevoegd — lezen mislukt: ' + (e.message || e) + ')'); }
  try {
    const bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : null;
    if (bt && bt.length) {
      r.push('');
      r.push('BT-LOG — laatste 150 regels');
      r.push('────────────────────────────────────────────────');
      bt.slice(-150).forEach(function (l) { r.push(typeof l === 'string' ? l : JSON.stringify(l)); });
    }
  } catch (e) { r.push(''); r.push('(BT-LOG-sectie niet toegevoegd — lezen mislukt: ' + (e.message || e) + ')'); }

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
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch(e){ /* stil: element kan al weg zijn */ } }, 1500);
  } catch (e) { console.warn('Opslaan mislukt — geen rapport gedownload', e); }
}

// ══════════════════════════════════════════════════════════════════
// MARKERINGEN — een tijdstempel met een opmerking erbij
// ══════════════════════════════════════════════════════════════════
// WAAROM DIT BESTAAT. Het verslag van een rit is een lange tijdlijn van
// buscommando's. Wat er ontbrak is de andere kant: wat DEED de bestuurder op
// dat moment. Zonder dat is "0104 piekte om 22:31:14" niet te koppelen aan
// "toen trok ik op", en dan is de piek een getal zonder betekenis.
//
// Een markering gaat naar vier plekken tegelijk, want ze worden alle vier op
// een ander moment teruggelezen: de app-log (die je in het logboekscherm
// opent), de BT-log (die naast het buskeer staat), de bulk-recorder (die per
// meting opslaat) en de eigen lijst hieronder, die als één blok bovenaan het
// verslag komt. Eén aanroep, vier bestemmingen — anders wordt er precies één
// bijgehouden en zijn de andere drie stil.
let _markeringen = [];

function plMarkeer(tekst, opmerking) {
  const t = new Date();
  const m = {
    t: _klok(),
    ms: t.getTime(),
    tekst: String(tekst || 'markering').slice(0, 80),
    opm: String(opmerking || '').slice(0, 300),
    kmh: null, rpm: null
  };
  // De omstandigheden erbij, want een markering zonder toestand is achteraf
  // niet te plaatsen. Uit pidVals, dus dit is de laatst bekende waarde en niet
  // per se een verse meting — daarom staat dat er zo bij in het verslag.
  try {
    if (typeof pidVals !== 'undefined' && pidVals) {
      if (typeof pidVals['010D'] === 'number') m.kmh = pidVals['010D'];
      if (typeof pidVals['010C'] === 'number') m.rpm = Math.round(pidVals['010C']);
    }
  } catch (e) { console.warn('Markering zonder snelheid/toerental — pidVals niet leesbaar', e); }
  _markeringen.push(m);

  const regel = '📍 ' + m.tekst + (m.opm ? ' — ' + m.opm : '') +
    (m.kmh == null ? '' : '  [' + m.kmh + ' km/u' + (m.rpm == null ? '' : ', ' + m.rpm + ' tpm') + ']');
  try { if (typeof log === 'function') log(regel, 'ok'); }
  catch (e) { console.warn('Markering niet in de app-log gezet', e); }
  try { if (typeof btDiag === 'function') btDiag(regel, 'info'); }
  catch (e) { console.warn('Markering niet in de BT-log gezet', e); }
  try { if (window.PLBulk && typeof PLBulk.markeer === 'function' && PLBulk.status && PLBulk.status().actief) PLBulk.markeer(m.tekst); }
  catch (e) { console.warn('Markering niet in de bulk-recorder gezet', e); }
  try { _teken(); } catch (e) { console.warn('Markering niet op het scherm bijgewerkt', e); }
  return m;
}

function markeringen() { return _markeringen.slice(); }

// ══════════════════════════════════════════════════════════════════
// DE BEGELEIDE RUN — één stap tegelijk, en niets stilzwijgend overgeslagen
// ══════════════════════════════════════════════════════════════════
// WAAROM DIT ER IS. Tot 5.9 stond de volgorde van een meetrit in CAMPAGNE, als
// negen stappen tekst die je vóór het wegrijden moest lezen en onderweg moest
// onthouden. In de praktijk gebeurde dat niet: de rit van 01-09 sloeg STAP 1
// (nulstellen) en STAP 9 (de veilige zones) over, reed vijf minuten waar er
// tien nodig waren, en liet 0123/0159 buiten de selectie — precies de PIDs
// waar de hoofdvraag over ging. Het verslag meldde dat allemaal pas achteraf,
// als "staat hij in de actieve selectie?" en "niet uitgevoerd deze run".
//
// DAT IS DE FOUT DIE DIT REPAREERT. Een voorwaarde die je achteraf meldt is
// een verwijt; dezelfde voorwaarde vóóraf is een knop. Elke stap hieronder
// doet wat de app zelf kan doen, laat zien wat er gebeurd is, en laat je
// bevestigen. Overslaan mag — maar dan met een reden, en die reden komt in het
// verslag te staan. Een lege plek in de meting is er niet meer bij.
//
// ONTWERPKEUZES
//  1. De stappen zijn data, geen code die door elkaar loopt. De volgorde en de
//     voorwaarden staan in één lijst, zodat test-begeleid.js ze zonder browser
//     kan nalopen en de volgende oplevering er een stap in kan zetten zonder
//     de motor aan te raken.
//  2. `controle()` beslist niet óf je door mag, maar wát er in het verslag
//     komt. Doorgaan kan altijd. De rit staat stil terwijl je hierin zit en de
//     bestuurder heeft het laatste woord.
//  3. Pauzeren en afronden kan bij elke stap. Een rit die halverwege moet
//     stoppen levert een half verslag op — dat is oneindig veel meer waard dan
//     een verloren rit, en de reden dat de afrondknop overal staat.
const _BG = {
  aan: false, i: 0, gepauzeerd: false, gestart: 0, timer: null,
  gedaan: [],        // per stap: {id, titel, t, uitkomst, opm}
  laatsteActie: ''   // wat de app zojuist zelf deed, zodat de stap dat kan tonen
};

// Elke stap: wat de APP doet (doe), wat JIJ doet (wat), waar we op letten
// (controle) en wat er in het log komt (markering).
const _STAPPEN = [
  {
    id: 'verbinding',
    titel: 'Staat alles klaar om te meten?',
    waarom: 'Zonder versheidsbron meet de ritwaarnemer het geheugen in plaats van de auto (#74). Dat wil je vóór de rit weten, niet erna.',
    wat: 'Niets — de app kijkt zelf. Zie je hieronder een kruisje, los dat dan eerst op.',
    knop: 'Klopt, verder',
    markering: 'begeleide run gestart',
    controle: function () {
      const uit = [];
      if (typeof connected === 'undefined' || !connected) uit.push('niet verbonden');
      if (typeof demoMode !== 'undefined' && demoMode) uit.push('demomodus staat aan — dan meet je verzonnen waarden');
      if (typeof _pidLastUpd === 'undefined' || !_pidLastUpd) uit.push('_pidLastUpd ontbreekt: geen versheidsbron (#74)');
      if (!window.PLRit) uit.push('PLRit ontbreekt');
      if (!window.PLBudget) uit.push('PLBudget ontbreekt — blok 7 blijft dan leeg');
      return uit.length ? { ok: false, tekst: uit.join('; ') } : { ok: true, tekst: 'verbonden, versheidsbron aanwezig, beide waarnemers leven' };
    }
  },
  {
    id: 'pids',
    titel: 'De meet-PIDs in de selectie',
    waarom: 'Een PID die niet in de pollronde staat, wordt niet gemeten — en over zijn gedrag valt dan niets te zeggen. Dit is waarom #19 drie ritten lang de verkeerde uitkomst gaf.',
    wat: 'Niets. Kijk alleen of er iets geweigerd is; dan staat de reden erbij.',
    knop: 'Selectie klopt, verder',
    markering: 'meet-PIDs aangezet',
    doe: function () {
      if (typeof pidToevoegen !== 'function') return 'pidToevoegen() ontbreekt — de selectie is niet aan te vullen';
      let r = { ok: [], weg: [] };
      try { r = pidToevoegen(RIT_PIDS, { niveau: 'kiesbaar', force: true }); }
      catch (e) { return 'pidToevoegen() gaf een fout: ' + ((e && e.message) || e); }
      _ritGevraagd = RIT_PIDS.slice();
      return r.ok.length + ' erbij of al aan (' + (r.ok.join(', ') || '—') + ')' +
        (r.weg.length ? '  |  GEWEIGERD door de gate: ' + r.weg.join(', ') : '');
    },
    controle: function () {
      if (typeof activePIDs === 'undefined' || !activePIDs) return { ok: false, tekst: 'activePIDs onbereikbaar' };
      const mist = RIT_PIDS.filter(function (p) { return !activePIDs.has(p); });
      if (!mist.length) return { ok: true, tekst: 'alle ' + RIT_PIDS.length + ' meet-PIDs staan in de selectie' };
      return { ok: false, tekst: mist.join(', ') + ' staan er niet in — die vragen blijven deze rit onbeantwoord, en dat komt zo in het verslag' };
    }
  },
  {
    id: 'aanvragers',
    titel: 'Zet de bus vol — alle aanvragers aan',
    waarom: 'Blok 7 en de STPX-vraag (#15) gaan over een DRUKKE bus. Bij stilstand met één aanvrager is dat het gunstigste geval, en dan zegt de meting niets over de vraag die openstaat.',
    wat: 'De app zet de waakronde, de rit-monitor en de bulk-recorder aan. Wil je de caravan-tracker erbij, start die dan zelf via het ☰-menu.',
    knop: 'Aanvragers staan aan, verder',
    markering: 'aanvragers aan — bus onder belasting',
    doe: function () {
      const gedaan = [];
      try { if (window.PLWaak && typeof PLWaak.start === 'function' && !PLWaak.actief()) { PLWaak.start(); gedaan.push('waakronde gestart'); } else if (window.PLWaak && PLWaak.actief()) gedaan.push('waakronde liep al'); }
      catch (e) { gedaan.push('waakronde mislukt: ' + ((e && e.message) || e)); }
      try {
        if (typeof toggleRitMonitor === 'function' && typeof PLMon !== 'undefined' && !PLMon.userAan) { toggleRitMonitor(); gedaan.push('rit-monitor aangezet'); }
        else if (typeof PLMon !== 'undefined' && PLMon.userAan) gedaan.push('rit-monitor stond al aan');
      } catch (e) { gedaan.push('rit-monitor mislukt: ' + ((e && e.message) || e)); }
      try {
        if (window.PLBulk && typeof PLBulk.start === 'function' && !(PLBulk.status() || {}).actief) { PLBulk.start(); gedaan.push('bulk-recorder gestart'); }
        else if (window.PLBulk && (PLBulk.status() || {}).actief) gedaan.push('bulk-recorder liep al');
      } catch (e) { gedaan.push('bulk-recorder mislukt: ' + ((e && e.message) || e)); }
      return gedaan.join('  |  ') || 'geen enkele aanvrager gevonden om aan te zetten';
    },
    controle: function () {
      const aan = [];
      try { if (window.PLWaak && PLWaak.actief()) aan.push('waakronde'); } catch (e) { console.warn('waakrondestand onleesbaar', e); }
      try { if (typeof PLMon !== 'undefined' && PLMon.active) aan.push('rit-monitor'); } catch (e) { console.warn('monitorstand onleesbaar', e); }
      try { if (window.PLBulk && (PLBulk.status() || {}).actief) aan.push('bulk-recorder'); } catch (e) { console.warn('bulkstand onleesbaar', e); }
      try { if (typeof caravanActive !== 'undefined' && caravanActive) aan.push('caravan-tracker'); } catch (e) { console.warn('caravanstand onleesbaar', e); }
      let bezet = null;
      try { bezet = PLBus.stats().belasting; } catch (e) { console.warn('busbelasting onleesbaar bij de aanvragerscontrole', e); }
      const kop = aan.length + ' aanvrager(s) actief: ' + (aan.join(', ') || '—') + (bezet == null ? '' : '  |  busbelasting ' + bezet + '%');
      return aan.length >= 2 ? { ok: true, tekst: kop } : { ok: false, tekst: kop + ' — met minder dan twee aanvragers meet blok 7 een rustige bus' };
    }
  },
  {
    id: 'nulmeting',
    titel: 'Nulmeting — hier begint de rit',
    waarom: 'Zonder nulstellen gaat het ritbeeld over alles sinds het opstarten van de app. Op 01-09 is deze stap overgeslagen en liep de meting vanaf het verbinden.',
    wat: 'Druk op de knop hieronder. Dat wist de ritwaarnemer én het pollbudget-spoor, zodat beide over déze rit gaan.',
    actie: { label: '🚗 Nu nulstellen', fn: function () {
      let uit = [];
      try { PLRit.wis(); uit.push('ritwaarnemer op nul'); } catch (e) { uit.push('PLRit.wis() mislukte: ' + ((e && e.message) || e)); }
      try { if (window.PLBudget && PLBudget.wis) { PLBudget.wis(); uit.push('pollbudget-spoor op nul'); } } catch (e) { uit.push('PLBudget.wis() mislukte: ' + ((e && e.message) || e)); }
      return uit.join(', ');
    } },
    knop: 'Nulgesteld, we gaan rijden',
    markering: 'NULMETING — rit begint hier',
    controle: function () {
      let d = null;
      try { d = PLRit.duurS(); } catch (e) { return { ok: false, tekst: 'PLRit.duurS() onbereikbaar' }; }
      if (d > 120) return { ok: false, tekst: 'de ritwaarnemer loopt al ' + Math.round(d / 60) + ' min — je hebt niet genulsteld, dus dit beeld gaat over meer dan deze rit' };
      return { ok: true, tekst: 'ritwaarnemer staat op ' + d + ' s — dit beeld gaat over deze rit' };
    }
  },
  {
    id: 'rijden',
    titel: 'Rijden — minstens tien minuten',
    waarom: 'De opruimregel heeft vijf pogingen plus vijf herkansingen nodig; dat kost meer dan vijf minuten. Op 01-09 werd er vijf minuten gereden en bleef #29 daardoor onbeantwoord.',
    wat: 'Rijd. Kijk ondertussen naar de teller hieronder: die laat zien of er ECHT gemeten wordt en niet alleen geteld. Laat het scherm aan.',
    knop: 'Genoeg gereden, verder',
    markering: 'rijfase afgesloten',
    minS: 600,
    leeft: function () {
      // Tijdens deze stap live tonen; dit is de enige plek waar je tijdens de
      // rit kunt zien dat de meting werkt in plaats van het achteraf te lezen.
      let d = 0, dk = { gemeten: [], eenmalig: [], nietGemeten: [] }, kmh = '—';
      try { d = PLRit.duurS(); dk = PLRit.dekking(); } catch (e) { console.warn('ritstand onleesbaar tijdens de rijstap', e); }
      try { if (typeof pidVals !== 'undefined' && typeof pidVals['010D'] === 'number') kmh = pidVals['010D'] + ' km/u'; }
      catch (e) { console.warn('snelheid onleesbaar tijdens de rijstap', e); }
      return Math.floor(d / 60) + ' min ' + (d % 60) + ' s gereden  ·  ' + kmh +
        '  ·  ' + dk.gemeten.length + ' PID(s) worden echt ververst, ' + dk.nietGemeten.length + ' staan alleen in het geheugen';
    },
    controle: function () {
      let d = 0, sp = null;
      try { d = PLRit.duurS(); sp = PLRit.per()['010D'] || null; } catch (e) { return { ok: false, tekst: 'ritstand onbereikbaar' }; }
      const uit = [];
      if (d < 600) uit.push('pas ' + Math.round(d / 60) + ' min gereden van de tien die #29 nodig heeft');
      if (!sp || sp.n < 2) uit.push('geen snelheidsmetingen — 010D is niet ververst');
      else if (sp.max < 15) uit.push('hoogste snelheid ' + sp.max + ' km/u: er is niet echt gereden');
      return uit.length ? { ok: false, tekst: uit.join('; ') } : { ok: true, tekst: Math.round(d / 60) + ' min gereden, hoogste snelheid ' + sp.max + ' km/u' };
    }
  },
  {
    id: 'optrekken',
    titel: 'Eén keer stevig optrekken',
    waarom: 'De turbo-vraag en de sleepwijzer van #68 hebben een piek nodig. Zonder markering is die piek achteraf niet terug te vinden in duizend logregels.',
    wat: 'Trek één keer stevig op (veilig, en bij voorkeur op een oprit). Druk daarna op de knop — de markering krijgt de snelheid en het toerental van dat moment mee.',
    actie: { label: '📍 Markeer het optrekken', fn: function () { plMarkeer('optrekken', 'stevige acceleratie voor turbo/MAP en de sleepwijzer'); return 'markering gezet'; } },
    knop: 'Gedaan, verder',
    markering: 'optrekstap afgesloten',
    controle: function () {
      const raak = _markeringen.filter(function (m) { return /optrekken/i.test(m.tekst); });
      return raak.length ? { ok: true, tekst: raak.length + ' optrekmarkering(en) gezet' }
                         : { ok: false, tekst: 'geen optrekmarkering — de MAP- en sleepwijzervragen blijven onbeantwoord' };
    }
  },
  {
    id: 'liveview',
    titel: 'Bekijk de live view',
    waarom: 'Blok 5 meet de app-schil maar kan niet zien of de tellerplaat iets ZEGT. Dat oordeel kan alleen jij geven, en alleen tijdens het rijden.',
    wat: 'Sluit dit scherm even, kijk naar de tellerplaat (toeren, pedaal, gasklep, belasting naast elkaar) en naar de temperatuurbalken. Gaan pedaal en klep samen omhoog met de belasting erachteraan?',
    actie: { label: '👁 Live view openen', fn: function () { closeTestrun(); return 'testrunscherm gesloten — open het straks weer via ☰ → Testrun'; } },
    keuzes: ['Klopt — ze lopen gelijk op', 'Klopt niet — ze lopen uiteen', 'Niet kunnen kijken'],
    knop: 'Verder',
    markering: 'live view beoordeeld',
    controle: function () { return { ok: true, tekst: 'jouw oordeel staat hieronder in het verslag' }; }
  },
  {
    id: 'logboek',
    titel: 'Kijk in het logboek',
    waarom: 'De staart van het logboek is de enige plek waar een melding staat die je nog nooit gezien hebt. Achteraf in het verslag lees je hem niet meer, want dan is de buffer al afgekapt (#72).',
    wat: 'Open het logboek en scroll door de laatste meldingen. Zie je iets nieuws, druk dan op de markeerknop — dan is het tijdstip vastgelegd.',
    actie: { label: '📖 Logboek openen', fn: function () {
      try { if (typeof openLogboek === 'function') { openLogboek(); return 'logboek geopend'; } } catch (e) { console.warn('openLogboek() mislukt', e); }
      return 'logboek niet automatisch te openen — via ☰ → Logboek';
    } },
    keuzes: ['Niets bijzonders gezien', 'Wel iets nieuws — gemarkeerd', 'Niet gekeken'],
    knop: 'Verder',
    markering: 'logboek nagelopen',
    controle: function () { return { ok: true, tekst: 'jouw oordeel staat hieronder in het verslag' }; }
  },
  {
    id: 'meten',
    titel: 'De metingen draaien',
    waarom: 'Nu pas, want de sweep en blok 6 belasten de bus zelf en horen niet in het ritbeeld. De ritwaarnemer staat tijdens de run stil.',
    wat: 'Zet de auto bij voorkeur stil of laat een bijrijder dit doen. De run duurt ongeveer een halve minuut.',
    actie: { label: '▶ Meetblokken draaien', fn: function () { startTestrun(); return 'testrun gestart — wacht tot "Klaar" onderaan staat'; } },
    knop: 'Metingen klaar, afronden',
    markering: 'meetblokken gedraaid',
    controle: function () {
      if (_trBezig) return { ok: false, tekst: 'de run loopt nog' };
      if (!_trLog.length) return { ok: false, tekst: 'er is nog niet gemeten — het verslag krijgt dan alleen de markeringen en de logs' };
      const t = _telling();
      return { ok: true, tekst: t.ok + ' ok, ' + t.fout + ' fout, ' + t.letop + ' let op' };
    }
  },
  {
    id: 'afronden',
    titel: 'Verslag wegschrijven',
    waarom: 'Het verslag is het enige dat terug hoeft. Alles wat je hierboven hebt bevestigd, overgeslagen of beantwoord staat erin.',
    wat: 'Druk op afronden. Je krijgt het bestand meteen te downloaden.',
    knop: '🏁 Afronden en verslag opslaan',
    markering: 'begeleide run afgerond',
    controle: function () { return { ok: true, tekst: 'klaar' }; }
  }
];

function _bgStap() { return _STAPPEN[_BG.i] || null; }

/* De overgang, apart en zonder scherm eromheen. Test-begeleid.js draait hem
   zonder browser: dit is de enige plek waar besloten wordt of een stap als
   gedaan, overgeslagen of onvoldoende de boeken in gaat. */
function _bgUitkomst(controle, gedwongen) {
  if (!controle) return gedwongen ? 'overgeslagen' : 'gedaan';
  if (controle.ok) return 'gedaan';
  return gedwongen ? 'overgeslagen' : 'gedaan-met-bezwaar';
}

function begeleidStart() {
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch (e) { console.warn('toast mislukt', e); } return; }
  _BG.aan = true; _BG.i = 0; _BG.gepauzeerd = false; _BG.gestart = _nu(); _BG.gedaan = []; _BG.laatsteActie = '';
  _markeringen = [];
  plMarkeer('BEGELEIDE RUN GESTART', 'testrun ' + TESTRUN_VERSIE + ' — ' + _STAPPEN.length + ' stappen');
  _bgBinnen();
  if (_BG.timer) clearInterval(_BG.timer);
  // Alleen hertekenen zolang de begeleide run loopt en niet gepauzeerd is; een
  // stap met een lopende teller moet meelopen, de rest hoeft niets.
  _BG.timer = setInterval(function () {
    if (!_BG.aan || _BG.gepauzeerd) return;
    const s = _bgStap();
    if (s && s.leeft) { try { _teken(); } catch (e) { console.warn('begeleide run niet hertekend', e); } }
  }, 2000);
  _teken();
}

// Wat de app zelf doet bij het BINNENkomen van een stap. Los van de knop
// waarmee je hem afsluit, zodat je ziet wat er gebeurd is vóórdat je bevestigt.
function _bgBinnen() {
  const s = _bgStap();
  _BG.laatsteActie = '';
  if (!s || !s.doe) return;
  try { _BG.laatsteActie = String(s.doe() || ''); }
  catch (e) { _BG.laatsteActie = 'de automatische stap gaf een fout: ' + ((e && e.message) || e); }
}

function begeleidActie() {
  const s = _bgStap();
  if (!s || !s.actie) return;
  try { _BG.laatsteActie = String(s.actie.fn() || 'gedaan'); }
  catch (e) { _BG.laatsteActie = 'de knop gaf een fout: ' + ((e && e.message) || e); }
  _teken();
}

function begeleidAntwoord(n) {
  const s = _bgStap();
  if (!s || !s.keuzes) return;
  const keus = s.keuzes[n];
  if (!keus) return;
  _BG.antwoord = keus;
  plMarkeer(s.titel, 'antwoord: ' + keus);
  _teken();
}

// gedwongen = de gebruiker drukte op "Overslaan". Dan gaat de reden mee het
// verslag in; dat is het verschil met een stap die er gewoon niet was.
function begeleidVolgende(gedwongen) {
  const s = _bgStap();
  if (!s) return;
  let c = null;
  if (s.controle) {
    try { c = s.controle(); }
    catch (e) { c = { ok: false, tekst: 'de controle gaf een fout: ' + ((e && e.message) || e) }; }
  }
  const uitkomst = _bgUitkomst(c, !!gedwongen);
  const opm = (c ? c.tekst : '') + (_BG.antwoord ? '  |  antwoord: ' + _BG.antwoord : '') +
              (_BG.laatsteActie ? '  |  app deed: ' + _BG.laatsteActie : '');
  _BG.gedaan.push({ id: s.id, titel: s.titel, t: _klok(), uitkomst: uitkomst, opm: opm });
  plMarkeer('stap ' + (_BG.i + 1) + '/' + _STAPPEN.length + ' — ' + s.markering, uitkomst.toUpperCase() + ': ' + opm);
  _BG.antwoord = null;

  if (s.id === 'afronden') { begeleidAfronden('alle stappen doorlopen'); return; }
  _BG.i++;
  _bgBinnen();
  _teken();
}

function begeleidOverslaan() { begeleidVolgende(true); }

function begeleidPauze() {
  if (!_BG.aan) return;
  _BG.gepauzeerd = !_BG.gepauzeerd;
  plMarkeer(_BG.gepauzeerd ? 'PAUZE' : 'HERVAT', _BG.gepauzeerd
    ? 'de begeleide run staat stil; de ritwaarnemer loopt gewoon door'
    : 'verder bij stap ' + (_BG.i + 1) + '/' + _STAPPEN.length);
  _teken();
}

// Overal bereikbaar, en dat is de bedoeling: een rit die halverwege moet
// stoppen levert een half verslag op, en dat is oneindig veel meer waard dan
// een verloren rit. Schrijft altijd weg, ook als er nog niet gemeten is.
function begeleidAfronden(reden) {
  const laatste = _bgStap();
  if (_BG.aan && laatste && laatste.id !== 'afronden')
    _BG.gedaan.push({ id: laatste.id, titel: laatste.titel, t: _klok(), uitkomst: 'niet-bereikt',
                      opm: 'de run is hier afgerond: ' + (reden || 'vroegtijdig afgerond') });
  plMarkeer('BEGELEIDE RUN AFGEROND', (reden || 'afgerond') + ' — ' + _BG.gedaan.length + ' van ' + _STAPPEN.length + ' stappen doorlopen');
  _BG.aan = false;
  if (_BG.timer) { clearInterval(_BG.timer); _BG.timer = null; }
  _teken();
  try { testrunOpslaan(); }
  catch (e) { console.warn('Verslag niet weggeschreven bij het afronden van de begeleide run', e); }
}

// Het stappenblok voor bovenin het verslag. Los van de meetblokken, want
// startTestrun() wist _trLog en deze lijst moet dat overleven.
function _bgVerslag() {
  const r = [];
  if (!_BG.gedaan.length && !_markeringen.length) return r;
  r.push('DE BEGELEIDE RUN — WAT ER IS GEDAAN');
  r.push('────────────────────────────────────────────────');
  if (_BG.gestart) r.push('Gestart om ' + new Date(_BG.gestart).toLocaleTimeString('nl-NL') + ', ' +
    _BG.gedaan.length + ' van ' + _STAPPEN.length + ' stappen doorlopen');
  const merk = { 'gedaan': '  ok  ', 'gedaan-met-bezwaar': 'LETOP ', 'overgeslagen': 'OVERG ', 'niet-bereikt': '  --  ' };
  _BG.gedaan.forEach(function (g, i) {
    r.push('[' + g.t + ']' + (merk[g.uitkomst] || '  ·   ') + (i + 1) + '. ' + g.titel);
    if (g.opm) r.push('                ' + g.opm);
  });
  const open = _STAPPEN.slice(_BG.gedaan.length).map(function (s) { return s.titel; });
  if (open.length) { r.push(''); r.push('NIET MEER AAN TOEGEKOMEN: ' + open.join('; ')); }
  if (_markeringen.length) {
    r.push('');
    r.push('MARKERINGEN (' + _markeringen.length + ')');
    r.push('────────────────────────────────────────────────');
    _markeringen.forEach(function (m) {
      r.push('[' + m.t + '] ' + m.tekst +
        (m.kmh == null ? '' : '  [' + m.kmh + ' km/u' + (m.rpm == null ? '' : ', ' + m.rpm + ' tpm') + ']'));
      if (m.opm) r.push('             ' + m.opm);
    });
    r.push('(snelheid en toerental zijn de laatst bekende waarden op dat moment, niet per se een verse meting)');
  }
  r.push('');
  return r;
}

// Het stappenpaneel bovenin het testrunscherm. Staat boven het meetlog, want
// zolang de begeleide run loopt is dít waar je naar kijkt.
function _bgTeken() {
  if (!_BG.aan) return '';
  const s = _bgStap();
  if (!s) return '';
  const knop = function (fn, tekst, kleur, rand) {
    return '<button onclick="' + fn + '" style="background:' + (kleur || 'var(--sur2)') + ';color:' + (rand || 'var(--tx2)') +
      ';border:1px solid ' + (rand || 'var(--bd)') + ';border-radius:8px;padding:9px 13px;font:700 12px var(--f);cursor:pointer">' + tekst + '</button>';
  };
  const veilig = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  let c = null;
  if (s.controle) { try { c = s.controle(); } catch (e) { c = { ok: false, tekst: 'controle gaf een fout: ' + ((e && e.message) || e) }; } }

  let h = '<div style="background:var(--sur);border:2px solid var(--ac);border-radius:12px;padding:13px 14px;margin-bottom:11px">';
  h += '<div style="display:flex;align-items:center;gap:9px;margin-bottom:7px">' +
    '<span style="font:800 11px var(--f);color:var(--ac);letter-spacing:.5px">STAP ' + (_BG.i + 1) + ' VAN ' + _STAPPEN.length + '</span>' +
    (_BG.gepauzeerd ? '<span style="font:800 11px var(--f);color:var(--or)">⏸ GEPAUZEERD</span>' : '') +
    '<span style="margin-left:auto;font-size:11px;color:var(--tx3)">' + _markeringen.length + ' markering(en)</span></div>';
  h += '<div style="font:800 15px var(--f);color:var(--tx);margin-bottom:5px">' + veilig(s.titel) + '</div>';
  h += '<div style="font-size:12px;color:var(--tx3);line-height:1.6;margin-bottom:8px">' + veilig(s.waarom) + '</div>';
  h += '<div style="background:var(--sur2);border-radius:8px;padding:9px 11px;font-size:12.5px;color:var(--tx);line-height:1.6;margin-bottom:9px">' +
    '<b>Wat jij doet:</b> ' + veilig(s.wat) + '</div>';

  if (s.leeft) {
    let live = '';
    try { live = s.leeft(); } catch (e) { live = 'de teller gaf een fout: ' + ((e && e.message) || e); }
    h += '<div style="font:700 13px var(--f);color:var(--gn);margin-bottom:9px">' + veilig(live) + '</div>';
  }
  if (_BG.laatsteActie)
    h += '<div style="font-size:12px;color:var(--tx2);margin-bottom:9px">↳ <b>de app deed:</b> ' + veilig(_BG.laatsteActie) + '</div>';
  if (c)
    h += '<div style="font-size:12px;color:' + (c.ok ? 'var(--gn)' : 'var(--or)') + ';margin-bottom:9px">' +
      (c.ok ? '✓ ' : '⚠ ') + veilig(c.tekst) + '</div>';
  if (s.keuzes) {
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">' +
      s.keuzes.map(function (k, i) {
        const gekozen = (_BG.antwoord === k);
        return knop('begeleidAntwoord(' + i + ')', (gekozen ? '● ' : '○ ') + veilig(k), gekozen ? 'var(--ac)' : 'var(--sur2)', gekozen ? '#fff' : 'var(--tx2)');
      }).join('') + '</div>';
  }

  h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  if (s.actie) h += knop('begeleidActie()', veilig(s.actie.label), 'var(--sur2)', 'var(--bl)');
  h += knop('begeleidVolgende()', (s.knop || 'Volgende stap') + ' →', 'var(--ac)', '#fff');
  h += knop('begeleidOverslaan()', 'Overslaan', 'var(--sur2)', 'var(--tx3)');
  h += knop('begeleidPauze()', _BG.gepauzeerd ? '▶ Hervatten' : '⏸ Pauze', 'var(--sur2)', 'var(--or)');
  h += knop("begeleidAfronden('vroegtijdig afgerond door de gebruiker')", '🏁 Nu afronden + verslag', 'var(--sur2)', 'var(--rd)');
  h += '</div>';

  // De stappenbalk eronder: wat is er geweest, en met welke uitkomst.
  if (_BG.gedaan.length) {
    const teken = { 'gedaan': '✓', 'gedaan-met-bezwaar': '⚠', 'overgeslagen': '⤼', 'niet-bereikt': '·' };
    h += '<div style="margin-top:10px;font-size:11px;color:var(--tx3);line-height:1.7">' +
      _BG.gedaan.map(function (g, i) { return (teken[g.uitkomst] || '·') + ' ' + (i + 1) + '. ' + veilig(g.titel); }).join('<br>') + '</div>';
  }
  h += '</div>';
  return h;
}


// ══════════════════════════════════════════════════════════════════
// SCHERM
// ══════════════════════════════════════════════════════════════════
function openTestrun() {
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } return; }
  let ov = document.getElementById('testrunOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'testrunOv';
    // Zelfde reden als de logboekoverlay: dit paneel stond flush tegen de
    // bovenkant en schoof onder de statusbalk op Android 15+.
    ov.style.cssText = 'position:fixed;inset:0;z-index:9980;background:rgba(8,11,17,.97);display:flex;flex-direction:column;' +
      'padding:calc(14px + var(--pl-sat,0px)) 14px calc(14px + var(--pl-sab,0px));gap:9px;overflow-y:auto;-webkit-overflow-scrolling:touch';
    ov.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
        '<div style="font-size:16px;font-weight:800;color:var(--tx)">🔬 Testrun</div>' +
        '<span style="font-size:11px;color:var(--tx3)">' + TESTRUN_VERSIE + '</span>' +
        '<button onclick="closeTestrun()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:7px 14px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
      '</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;flex-shrink:0">' +
        // De begeleide run staat vooraan: hij is sinds 6.0 de manier waarop een
        // meetrit hoort te lopen. "Start" ernaast blijft voor wie alleen even
        // wil meten zonder rit eromheen.
        '<button onclick="begeleidStart()" style="background:var(--ac);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:700 13px var(--f);cursor:pointer">🧭 Begeleide rit</button>' +
        '<button onclick="startTestrun()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">▶ Alleen meten</button>' +
        '<button onclick="startTestrun({b5:true,b1:true,b4:true,b7:true,b11:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Snel (geen sweep)</button>' +
        // Weg op 24-08: "DID-scan (45 s)" (blok 9) en "Budget + olie" (blok 7+8).
        // Beide dienden de jacht op de mode 22-olietemperatuur, en die is op
        // 23-08 definitief losgelaten — zonder echte Mazda-DID-lijst is verder
        // zoeken raden. De blokken zelf staan er nog en zijn los aan te roepen
        // met startTestrun({b8:true}) of {b9:true} vanuit de console; ze slopen
        // is een mechanische stap en die gaat apart. Wat blijft is blok 7, het
        // pollbudget, want dat heeft niets met olie te maken.
        '<button onclick="startTestrun({b7:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Budget</button>' +
        '<button onclick="startTestrun({b10:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Snelheidsproef (10 min)</button>' +
        // De rit (26-08b). Twee knoppen omdat het twee momenten zijn: nulstellen
        // aan het begin van de rit, uitlezen aan het eind. Blok 14 zit óók in de
        // standaardset, dus wie gewoon "Start" drukt krijgt het ritbeeld erbij.
        '<button onclick="ritNulstellen()" style="background:var(--sur2);color:var(--gn);border:1px solid var(--gn);border-radius:8px;padding:9px 12px;font:700 12px var(--f);cursor:pointer">🚗 Rit begint (nulstellen)</button>' +
        '<button onclick="startTestrun({b14:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Ritverslag</button>' +
        // Alleen tellen, geen bus: mag ook los, bijvoorbeeld thuis op de bank.
        '<button onclick="startTestrun({b11:true})" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">Inventarisatie</button>' +
        '<button onclick="stopTestrun()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">■ Stop</button>' +
        '<button onclick="plMarkeer(\'losse markering\', \'met de hand gezet\')" style="background:var(--sur2);color:var(--bl);border:1px solid var(--bl);border-radius:8px;padding:9px 12px;font:700 12px var(--f);cursor:pointer">📍 Markeer nu</button>' +
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
  // Loopt er een begeleide run, dan staat die bovenaan: zolang je stappen aan
  // het doorlopen bent is dát waar je naar kijkt, niet naar het meetlog.
  let bg = '';
  try { bg = _bgTeken(); } catch (e) { console.warn('Het stappenpaneel is niet getekend — de begeleide run loopt wel door', e); }
  if (!_trLog.length) {
    if (bg) { box.innerHTML = bg; return; }
    box.innerHTML = '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:11px 13px;margin-bottom:9px">' +
      '<div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;text-transform:uppercase;margin-bottom:6px">Waar deze run over gaat</div>' +
      '<div style="font-size:13px;color:var(--tx);margin-bottom:6px">' + CAMPAGNE.titel + '</div>' +
      '<ol style="margin:0;padding-left:18px;color:var(--tx2);font-size:12px;line-height:1.7">' +
      CAMPAGNE.vragen.map(function (v) { return '<li>' + v + '</li>'; }).join('') + '</ol></div>' +
      '<div style="color:var(--tx3);font-size:12px;line-height:1.7">De run overschrijft je PID-selectie tijdelijk en zet die daarna exact terug — ook als er iets misgaat. Alles is lezend; er gaat nooit een schrijfcommando naar de ECU.</div>';
    return;
  }
  const t = _telling();
  let h = bg + '<div style="display:flex;gap:8px;margin-bottom:9px;font:700 12px var(--f)">' +
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
  titel: 'OPLEVERING 02-09 \u2014 de tokenketen: de teller volgt de server, de chip volgt de rol (#52, #42)',
  vragen: [
    '\u2500\u2500 WAAROM DEZE RONDE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',

    'Deze ronde gaat over geld, en dat is een andere soort fout dan een verkeerde meting: een teller die er 3 tokens naast zit merkt niemand, tot iemand belt dat zijn tegoed weg is. Er is niets gerepareerd aan het verdienmodel zelf \u2014 het besluit uit #49 staat \u2014 maar wel aan de keten eromheen. Drie van de vier vondsten waren onzichtbaar in het gebruik: ze gaven geen foutmelding, geen rode rand, niets.',

    'DE ZWAARSTE. handleCreditsRedeem stempelde een activatiecode eerst af als gebruikt en keek P\u00c1S DAARNA of er een ingelogde klant was om hem op bij te schrijven. Was die er niet, dan gaf hij ok:true met saldo:null terug. De code verbruikt, het tegoed nergens, en de klant die er \u20ac4,99 voor betaalde staat met lege handen. De app haakte daar sinds 29-08 zelf al op af, maar een controle in de app is een verzoek en geen grens: een oudere versie, een herhaald verzoek of een curl kwam er gewoon langs. Het commentaar erboven legde die vorm nog uit als een keuze ("werkt BEWUST zonder account") \u2014 die keuze is met #49 vervallen en het commentaar was blijven staan.',

    'DE STILSTE. De Worker boekt af op het echte verbruik en stuurt het saldo daarna mee terug in de header X-PidLane-Saldo. Die header staat zelfs in Access-Control-Expose-Headers, en \u00a78 van PIDLANE.md beschreef sinds juli dat apiFetch hem uitleest en doorzet naar PLCredits. Dat deed niemand. Er stond nergens in public/ een regel die die header las. De teller in beeld liep dus op de SCHATTING, en die is nooit precies gelijk aan de afboeking \u2014 zeker niet als de PATCH op Airtable mislukte (dan ging er niets af terwijl de app wel aftrok) of als het antwoord van Anthropic niet te ontleden was (dan boekte de Worker het minimum af en de app een volle schatting).',

    'DAT LAATSTE IS DE ECHTE LES VAN DEZE RONDE. Niet de bug, maar hoe hij bleef staan: er stond een correcte beschrijving in de documentatie van iets dat niet gebouwd was. Wie \u00a78 las, kruiste dit punt af. Bij het nalezen bleek er nog zoiets te staan \u2014 het "Kasboek TokenLog", een tabel met negen velden en twee vastgelegde regels, geschreven door een functie tegoedLog() die in worker.js niet voorkomt en er blijkens de geschiedenis nooit in heeft gestaan. Dat is nu #83, en \u00a78 zegt voortaan wat er w\u00e9l staat.',

    '\u2500\u2500 WAT ER IS VERANDERD \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',

    '#52 \u2014 de tokenchip volgt de rol. finishLogin() en logout() laten hem opnieuw beoordelen; PLCredits.chip() bestond al als publieke ingang maar werd door niemand aangeroepen. En de regel eronder is teruggebracht tot \u00e9\u00e9n zin: alleen een ingelogde klant betaalt met tokens, en alleen die ziet de chip. De vierde toestand ontbrak namelijk \u2014 NIEMAND ingelogd viel door alle takken van _vrijgesteld() heen en gold als "betaalt", waardoor er ook op het loginscherm een chip stond.',

    '\u00a78 \u2014 apiFetch leest X-PidLane-Saldo uit, op beide paden: na een geslaagd antwoord \u00e9n bij een 402 (daar staat het saldo in de body). volgServer() in PLCredits doet dat werk, fail-open zoals de rest van die module.',

    'CODES \u2014 /credits/redeem eist een klantsessie v\u00f3\u00f3r de eerste schrijfactie, en GebruiktDoor komt uit die sessie in plaats van uit de body (dat veld was door de aanvrager zelf op te geven). Een geldige sessie zonder klantrecht levert geen ok:true meer met saldo:null.',

    '#42 \u2014 vastgelegd dat de eerste fase handmatig is: geen koopknop in de app, `tikkie_kopen` blijft leeg, codes gaan met de hand. De aanvraagmail draagt nu het account waar de tokens op moeten \u2014 zonder dat begint elke aanvraag met "en wie ben jij?".',

    'TESTS \u2014 test-tokenchip.js (19 toetsen), test-saldokop.js (16) en test-codeverzilver.js (21) zijn nieuw, alle drie met tegenproef: bouw de oude fout terug en er worden er 4, 4 en 1 rood. test-proeftegoed.js logt nu in als klant, want een tegoed zonder account bestaat niet meer.',

    '\u2500\u2500 STAP VOOR STAP \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',

    'STAP A. Draai de run zoals je bent ingelogd (beheerder). Blok 5 hoort dan te melden: geen chip, geen koopknop, en 401 op /credits/redeem. Die 401 is de hoofdvraag van deze ronde \u2014 hij bewijst dat de sessiecontrole v\u00f3\u00f3r het afstempelen staat.',

    'STAP B. Log daarna in met een KLANTACCOUNT en draai blok 5 opnieuw. Nu hoort er w\u00e9l een chip te staan, met hetzelfde getal als "Mijn tokens", en hoort de code-proef 404 te geven. Dit is de enige proef in de reeks die twee rollen nodig heeft; \u00e9\u00e9n van de twee helften meet niets.',

    'STAP C. Nog steeds als klant: doe \u00e9\u00e9n echte analyse (bijvoorbeeld de conditiecheck) en kijk naar het getal in de chip v\u00f3\u00f3r en n\u00e1 afloop. Vergelijk het daarna met "Mijn tokens", dat het saldo rechtstreeks bij de server ophaalt. Staan die twee gelijk, dan neemt de teller de server over. Staan ze er een paar naast, dan draait de app nog op de schatting en is de haak niet aangekomen. DIT KOST TOKENS \u2014 het is de enige vraag van deze ronde die niet gratis te beantwoorden is, en de reden dat blok 5 hem niet zelf stelt.',

    'STAP D. Log uit terwijl je als klant bent ingelogd en kijk naar de linkeronderhoek van het loginscherm. Daar hoort niets te staan. Bleef er "\u26a1 tokens onbekend" hangen, dan is de aanroep in logout() niet aangekomen.',

    'STAP E. #79/#58, onveranderd en nog steeds alleen op het toestel. Blok 5 meldde op 01-09 FOUT op de veilige zones. Scroll de live view helemaal naar beneden en kijk of de onderste regel vrij van de drie Android-knoppen blijft. Blijft hij vrij, dan is de MELDING fout en niet de layout \u2014 dat is het antwoord dat #79 nodig heeft.',

    '\u2500\u2500 WAT DEZE RONDE NIET OPLOST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',

    '#82 \u2014 bijboeken vanuit admin.html leest-en-schrijft het saldo BUITEN het saldo-slot om, als enige van de vier plekken die dat doen. Boekt een beheerder bij op het moment dat er een analyse loopt, dan overschrijft de \u00e9\u00e9n de ander. Gevonden tijdens deze ronde, bewust niet in dezelfde commit gerepareerd (\u00e9\u00e9n onderwerp per PR).',

    '#83 \u2014 het kasboek TokenLog staat in \u00a78 beschreven maar bestaat niet. Zolang dat zo is, is een verdwenen token alleen te achterhalen door de code te lezen \u2014 precies waar die alinea in juli over ging.',

    '#49 \u2014 promptcaching staat nog uit. Cache-reads kosten 10% van het invoertarief en de systeemprompt plus AUTO_KENNIS gaat bij elke analyse opnieuw mee. Let op: caching werkt op een exacte prefix, en `ai_system_override` uit de config zit daarin. Meten v\u00f3\u00f3r bouwen.',

    '#75, #76, #77, #78 \u2014 onveranderd. De meldingenteller telt nog de hele ringbuffer, blok 7 rekent de zoneverdeling met de PLLoad-regel van v\u00f3\u00f3r 23-08, de eerste verbinding van een sessie telt nog als herverbinding, en een health-oordeel wordt na de eerste scan nooit herzien.'
  ]
};











// Nulstellen aan het begin van een rit, zodat blok 14 over DEZE rit gaat en
// niet over alles sinds het opstarten van de app. Bewust een knop en geen
// automatische haak aan "verbonden": dan zou elke herverbinding onderweg het
// ritbeeld wissen, en juist die herverbindingen zijn wat we willen tellen.
function ritNulstellen() {
  if (!window.PLRit) { try { showToast('PLRit ontbreekt'); } catch (e) { /* stil */ } return; }
  PLRit.wis();
  try { showToast('Rit nulgesteld — rijden maar'); } catch (e) { /* stil: melding mag de stroom niet breken */ }
  try { log('Ritwaarnemer nulgesteld — blok 14 meet vanaf nu', 'ok'); } catch (e) { /* stil */ }
  try { btDiag('PLRit nulgesteld', 'ok'); } catch (e) { /* stil */ }
}

// 27-08-2026 naar buiten gebracht. Het inlogscherm toont dit nummer, want dat
// is de plek waar je vóór een rit kijkt of je build vers is — en dat was tot nu
// toe alleen te zien door de testrun te openen, wat achter isAdmin() zit. Op
// 26-08 is een hele rit verloren gegaan omdat het toestel 4.8 draaide terwijl
// 4.9 al klaar stond; dat was op het inlogscherm niet te zien.
window.TESTRUN_VERSIE = TESTRUN_VERSIE;

window.openTestrun = openTestrun;
window.closeTestrun = closeTestrun;
window.startTestrun = startTestrun;
window.ritNulstellen = ritNulstellen;
window.stopTestrun = stopTestrun;
window.testrunOpslaan = testrunOpslaan;
window.testrunTekst = testrunTekst;
window.plMarkeer = plMarkeer;
window.begeleidStart = begeleidStart;
window.begeleidVolgende = begeleidVolgende;
window.begeleidOverslaan = begeleidOverslaan;
window.begeleidActie = begeleidActie;
window.begeleidAntwoord = begeleidAntwoord;
window.begeleidPauze = begeleidPauze;
window.begeleidAfronden = begeleidAfronden;
// Bewust naar buiten voor test-begeleid.js: de stappenlijst en de
// overgangsregel zijn de twee dingen die zonder browser te toetsen zijn, en
// een stappenmachine die niet getoetst wordt slaat straks stil een stap over.
window.PLBegeleid = {
  stappen: function () { return _STAPPEN; },
  stand: function () { return { aan: _BG.aan, i: _BG.i, gepauzeerd: _BG.gepauzeerd, gedaan: _BG.gedaan.slice() }; },
  markeringen: markeringen,
  _uitkomst: _bgUitkomst,
  _verslag: _bgVerslag
};

})();
