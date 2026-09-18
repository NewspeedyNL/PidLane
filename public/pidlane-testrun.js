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

const TESTRUN_VERSIE = '7.8 (16-09-2026)';
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

/* ══════════════════════════════════════════════════════════════════
   MEEKIJKEN TIJDENS DE RIT (17-09-2026)
   ──────────────────────────────────────────────────────────────────
   Tot vandaag leverde een testrun één ding op: een tekstverslag ná afloop,
   dat met de hand geplakt moest worden. Wie onderweg wilde weten of blok 7
   al goed was, moest stoppen en lezen.

   Het kanaal daarvoor lag er al en werd alleen niet gebruikt: `logToSheets()`
   bufferde en stuurde elke vijftien seconden naar Airtable, en deed dat elke
   rit al voor uitschieters en verbindingen. `pidlane-testrun.js` riep hem
   nul keer aan.

   WAT ER WEL EN NIET WEGGESCHREVEN WORDT, en waarom dat een keuze is.
   Een volle run doet vijftig stappen. Alles wegschrijven geeft vijftig
   regels per rit in een tabel die op 17-09 al 719 regels telde, en dan is
   het kanaal binnen een paar ritten vol met "ok". Daarom drie soorten:

     • één startregel met het ritnummer, zodat er iets te zoeken valt;
     • elke FOUT en elke LET OP meteen als hij valt — dat is waar je tijdens
       een rit op wilt kunnen bijsturen;
     • één regel per blok zodra het volgende blok begint, met de telling.
       Dat is het afvinken: "blok 7 klaar, 9 ok, 0 fout".

   Een blok is klaar als er een regel van een ánder blok binnenkomt. Dat is
   hier de goedkoopste grens: `_boek()` is de enige trechter waar elke stap
   doorheen gaat, dus er is één plek nodig in plaats van veertien aanroepen
   in `runTestrun()` die stuk voor stuk vergeten kunnen worden.

   Het ritnummer is met opzet leesbaar en niet willekeurig: het is waarnaar
   gezocht wordt als er later gevraagd wordt "wat deed hij die rit". */
const LIVE_SCHEMA = 1;
let _liveRit = null, _liveBlok = null, _liveTel = null;

function _liveRitId() {
  if (_liveRit) return _liveRit;
  const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  _liveRit = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
             '-' + p(d.getHours()) + p(d.getMinutes());
  return _liveRit;
}

/* Eén regel naar Airtable. Faalt dit, dan mag de run er niets van merken:
   een testrun die stukloopt op zijn eigen verslaglegging is erger dan een
   run zonder verslaglegging. */
function _liveSchrijf(type, bericht, extra) {
  try {
    if (typeof logToSheets !== 'function') return false;
    const mee = Object.assign({
      RecordType: 'testrun',
      SchemaVersion: LIVE_SCHEMA,
      SessionId: _liveRitId(),
      // Een demo-run hoort herkenbaar te zijn, anders staat er straks een
      // meetreeks in de tabel die nooit een auto gezien heeft.
      Demo: !!(typeof demoMode !== 'undefined' && demoMode)
    }, extra || {});
    logToSheets(type, bericht, mee);
    return true;
  } catch (e) {
    console.warn('Testrun: regel niet naar de live-log gestuurd — de run gaat gewoon door', e);
    return false;
  }
}

/* Het vorige blok afsluiten met zijn telling. */
function _liveBlokKlaar() {
  if (_liveBlok === null || !_liveTel) return;
  const t = _liveTel;
  _liveSchrijf(t.fout ? 'opvallend' : 'info',
    'blok ' + _liveBlok + ' klaar — ' + t.ok + ' ok, ' + t.letop + ' let op, ' + t.fout + ' fout');
  _liveBlok = null; _liveTel = null;
}

/* Wordt vanuit _boek() aangeroepen, dus bij élke stap. Goedkoop gehouden:
   tellen, en alleen schrijven bij een blokwissel of een bevinding. */
function _liveTik(blok, naam, staat, detail) {
  const st = String(staat || '').toUpperCase();
  if (blok !== _liveBlok) {
    _liveBlokKlaar();
    _liveBlok = blok;
    _liveTel = { ok: 0, letop: 0, fout: 0 };
  }
  if (st === 'FOUT') _liveTel.fout++;
  else if (st === 'LET OP' || st === 'LETOP') _liveTel.letop++;
  else _liveTel.ok++;

  if (st === 'FOUT' || st === 'LET OP' || st === 'LETOP') {
    _liveSchrijf(st === 'FOUT' ? 'error' : 'opvallend',
      'blok ' + blok + ' ' + st + ' — ' + naam + (detail ? ': ' + detail : ''));
  }
}

/* De run is klaar: het laatste blok afsluiten en de tak sluiten. Apart van
   _liveBlokKlaar(), want een run kan ook afgebroken worden en dan hoort er
   te staan dát hij afgebroken is. */
function _liveEinde(reden) {
  _liveBlokKlaar();
  _liveSchrijf('info', 'testrun ' + (reden || 'klaar') + ' — ' +
    (typeof TESTRUN_VERSIE !== 'undefined' ? TESTRUN_VERSIE : '?'));
  _liveRit = null;
}

function _boek(blok, naam, staat, detail, ms) {
  // `epoch` erbij op 16-09-2026 (#214). `t` is "HH:MM:SS" en daarmee niet van
  // een ander tijdstip af te trekken; de kop van het verslag had precies dat
  // nodig om te kunnen zeggen hoe oud de meetblokken zijn.
  _trLog.push({ t: _klok(), epoch: Date.now(), blok: blok, naam: naam, staat: staat, detail: detail || '', ms: ms == null ? null : Math.round(ms) });
  try { _teken(); } catch (e) { console.warn('Testrun-log niet herteken op het scherm (het onderliggende logboek is wel bijgewerkt)', e); }
  try { _liveTik(blok, naam, staat, detail); } catch (e) { console.warn('Testrun: live-regel overgeslagen', e); }
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
// ── STILLE SENSOREN (blok 11) ─────────────────────────────────────
// Apart en zuiver zodat test-stille-selectie.js hem kan draaien zonder browser
// en zonder testrun-context. `actief` wordt BEWUST doorgegeven in plaats van
// hier opgehaald: welke selectie de juiste is, is precies wat #90 fout had, en
// een functie die zijn eigen bron kiest kun je daar niet op toetsen.
// Knippad: tussen de twee ankers hieronder.
function _stilleSensorenStand(h, actief) {
  const sleutels = Object.keys(h || {});
  if (!sleutels.length) return { staat: 'LET OP', detail: 'geen health-oordelen — nog niet lang genoeg gepolld' };

  const perStaat = {};
  const stilInSelectie = [];
  sleutels.forEach(function (p) {
    const st = String(h[p] && h[p].staat ? h[p].staat : h[p]);
    perStaat[st] = (perStaat[st] || 0) + 1;
    if (st !== 'ok' && actief && actief.has && actief.has(p)) stilInSelectie.push(p);
  });

  const verdeling = Object.keys(perStaat).map(function (k) { return k + ': ' + perStaat[k]; }).join(', ');
  if (!stilInSelectie.length)
    return sleutels.length + ' beoordeeld (' + verdeling + '), geen enkele niet-ok PID staat in je selectie';
  return { staat: 'LET OP', detail: sleutels.length + ' beoordeeld (' + verdeling + '). ' +
    stilInSelectie.length + ' NIET-OK maar wél in de actieve selectie: ' + stilInSelectie.join(', ') +
    '  — dit is de populatie waar punt 3 een drempel voor moet kiezen' };
}
// ── einde stille-sensoren-blok ────────────────────────────────────

// ── HET PROFIELOORDEEL (blok 1) ───────────────────────────────────
// WAAROM DIT EEN EIGEN FUNCTIE IS (#86, 03-09-2026)
// Dit oordeel zat in een anonieme functie in _blok1() en was daarmee alleen te
// toetsen door een hele testrun te draaien. Apart en zuiver, zodat
// test-profielmelding.js hem kan draaien zonder browser en zonder testrun-
// context. Knippad: tussen de twee ankers hieronder.
//
// WAT ER MIS WAS. De vraag "had dit profiel bij het verbinden geladen moeten
// worden?" hing aan een leeftijdsdrempel: jonger dan 0.1 uur = zes minuten
// betekende "tijdens deze sessie ontstaan, dus terecht niet geladen". Bij een
// begeleide rit zit er een kwartier tussen verbinden en meten, dus sloeg die
// proef vals alarm — en precies in de sessies waarin je een verse oplevering
// uitprobeert (nieuwe versie, schone opslag), wat de sessies zijn waarin je
// hem het hardst nodig hebt.
//
// De marge oprekken verschuift dat alleen: bij een rit van veertig minuten is
// het weer mis. De vraag is niet hoe OUD het profiel is maar of het ná dit
// verbinden is ontstaan, en daar is een tijdstip voor nodig en geen drempel.
// `window._plVerbondenT` wordt gezet in connectSerial().
//
// De leeftijdsregel blijft staan als terugval voor het geval dat stempel
// ontbreekt — een sessie die al verbonden was voordat deze versie werd
// geladen, bijvoorbeeld. Dat staat er dan bij, zodat je aan de melding ziet
// waarop hij is beoordeeld.
function _profielOordeel(prof, geladen, verbondenT, nuOverride) {
  const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();
  const uur = prof && prof.ts ? Math.round((nu - prof.ts) / 36e5 * 10) / 10 : null;
  const health = prof && prof.health ? Object.keys(prof.health).length : 0;
  const basis = (prof && prof.pids ? prof.pids.length : 0) + ' PIDs' +
    (health ? ', ' + health + ' health-oordelen' : ', GEEN health') +
    (uur == null ? '' : ', ' + uur + ' uur oud');

  // Tot 21-08 stond hier onvoorwaardelijk "dit had bij het verbinden geladen
  // moeten worden". Die zin controleerde niets: hij keek alleen of er een
  // profiel in de opslag lag, niet of het gebruikt was. profielHealth() is de
  // betrouwbare vlag: die wordt gezet door applyVinProfileIfKnown() en blijft
  // null bij een volle discovery.
  if (geladen === undefined)
    return basis + ' — of het geladen is, is niet vast te stellen (profielHealth ontbreekt)';
  if (geladen)
    return basis + ' — bij het verbinden geladen, snelle start';

  // Ná het verbinden aangemaakt? Dan kán het bij dít verbinden niet geladen
  // zijn, hoeveel tijd er sindsdien ook verstreken is. Dit is het antwoord op
  // #86 en het heeft geen drempel.
  if (prof && prof.ts && typeof verbondenT === 'number' && prof.ts >= verbondenT)
    return basis + ' — ná het verbinden van deze sessie aangemaakt, dus terecht niet geladen bij het verbinden';

  // Terugval zonder stempel: dan is leeftijd het enige dat er is, met de reden
  // erbij zodat de melding niet stelliger klinkt dan hij kan zijn.
  if (typeof verbondenT !== 'number' && uur !== null && uur <= 0.1)
    return basis + ' — nog maar een paar minuten oud, dus vermoedelijk tijdens déze sessie ontstaan ' +
      '(het verbindingsmoment is niet vastgelegd, dus beoordeeld op leeftijd)';

  return { staat: 'LET OP', detail: basis +
    ' — staat in de opslag maar is bij het verbinden NIET geladen; de app deed een volle discovery' };
}
// ── einde profieloordeel-blok ─────────────────────────────────────

// Eén gebeurtenis, één regel. (#104, 03-09-2026)
//
// pidOpruimen() schrijft dezelfde opruiming TWEE keer weg: via btDiag() naar de
// BT-log en via log() naar de app-log, die tweede met een 🧹 ervoor. Alles wat
// beide buffers aan elkaar plakt — blok 14 én de #29-proef in blok 5 — telde
// daardoor elke opruiming dubbel.
//
// En niet betrouwbaar dubbel, wat het erger maakt: de BT-log is een ringbuffer
// met zware doorloop. Op 02-09 meldde blok 14 om 23:22:13 "de gate zegt 1, het
// log bevestigt er 2" en om 23:23:54 "bevestigt er 1" — dezelfde ene
// gebeurtenis, twee antwoorden, afhankelijk van hoeveel busverkeer er intussen
// doorheen was gegaan. Een teller die met de ringbuffer meebeweegt is geen
// meting, en dit is nu juist de meting waar de drempel op gekozen moet worden.
//
// De sleutel is tijdstip + de tekst zonder opmaak. Twee opruimingen van
// VERSCHILLENDE PIDs in dezelfde seconde houden een eigen sleutel, want de
// sensornaam staat in de tekst; dezelfde PID twee keer opruimen kan niet, want
// _pidOpgeruimd is een Set.
function _opruimOntdubbel(regels, re) {
  const gezien = new Set(), uit = [];
  (regels || []).forEach(function (l) {
    const msg = String((l && (l.msg || l.m || l.tekst)) || l || '');
    if (!re.test(msg)) return;
    const kern = msg.replace(/[^0-9A-Za-z]+/g, ' ').trim().toLowerCase().slice(0, 80);
    const sleutel = ((l && l.ts) || '') + '|' + kern;
    if (gezien.has(sleutel)) return;
    gezien.add(sleutel);
    uit.push(((l && l.ts) ? l.ts + ' ' : '') + msg.slice(0, 110));
  });
  return uit;
}

function _opruimStand(lijst, regels, duurS) {
  const zoek = function (re) { return _opruimOntdubbel(regels, re); };
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

/* ── WAT HAD DE GEBRUIKER AANSTAAN? (#90, 03-09-2026) ──────────────
   Blok 3 overschrijft `activePIDs` voor de duur van de PID-sweep, en het
   herstel gebeurt pas in het `finally` van runTestrun() — dus aan het einde
   van de HELE run. Alles wat daartussen draait en `activePIDs` leest, meet de
   sweep en niet de gebruiker.

   Wat dat oplevert, uit de run van 02-09 13:14:

     13:13:59  Selectie bewaard — 28 actieve PIDs
     13:14:00  PID-sweep — 46 PIDs, selectie tijdelijk overschreven
     13:14:12  Stille sensoren leest activePIDs → ziet er 46
     13:14:23  Selectie hersteld — 28 PIDs teruggezet

   De melding die eruit kwam noemde 016D en 019D als "NIET-OK maar wél in de
   actieve selectie". De busstatistiek van diezelfde run laat zien dat de
   pollus er 28 heeft uitgevraagd en die twee daar niet bij zaten: ze stonden
   in de selectie van de SWEEP. De proef wees dus een populatie aan die niet
   bestond — en juist die proef zegt van zichzelf dat hij de populatie aanwijst
   waar een drempel op gekozen moet worden.

   Erger dan fout is dat hij STIL fout is: in de run van 12:05 gaf dezelfde
   proef "geen enkele niet-ok PID staat in je selectie", en dat was net zo goed
   de sweep-selectie. Hij klopte daar alleen toevallig.

   Eén bron voor de vraag "wat had de gebruiker aanstaan": tijdens een run is
   dat het herstelpunt, daarbuiten de live selectie. Het `finally` blijft het
   vangnet voor een afgebroken run — dat is met opzet niet verplaatst. */
function _gebruikersSelectie() {
  if (typeof _trBezig !== 'undefined' && _trBezig &&
      _trHerstel && Array.isArray(_trHerstel.actief))
    return new Set(_trHerstel.actief);
  try {
    if (typeof activePIDs !== 'undefined' && activePIDs) return new Set(activePIDs);
  } catch (e) {
    console.warn('Testrun: activePIDs onleesbaar bij het bepalen van de gebruikersselectie', e);
  }
  return new Set();
}

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

  /* Welke tak zou PLLoad.tick() bij dit monster gekozen hebben?

     HERZIEN OP 02-09-2026 (#76). Hier stond een eigen kopie van die
     beoordeling, en die kopie was blijven staan op de regel van vóór 23-08:
     `bezet >= bezetOp || fout >= foutOp`. Precies de OF die toen uit PLLoad is
     gehaald, met een lang blok commentaar erboven waarom bezetting alléén geen
     tegendruk is. De spiegel is niet meeverhuisd.

     Wat dat kostte: blok 7 meldde over de rit van 01-09 "Tijd per zone: druk
     87%, ruim 10%, kalm 3%" naast "Tempoverloop: start 100% → nu 100%" en
     "geen enkele stap omlaag". Die drie zijn alleen te rijmen als de
     zoneverdeling niet meet wat PLLoad doet — en dat was zo: met de echte
     regel (foutPct hoogstens 1%, venGemMs 193 tegen traagMs 400) was `druk`
     geen enkele keer waar. 0%, niet 87%. Het rapport las als een defecte
     regelkring die er niet was.

     Nu leent hij de beslissing bij PLLoad.zoneVan(), net zoals drempels()
     de getallen al bij PLLoad.cfg haalt in plaats van ze te herhalen.
     `venStijgt` heeft de vorige responstijd nodig; die staat per monster in
     het spoor, dus die geven we mee — vandaar de tweede parameter.

     Terugval als PLLoad ontbreekt: 'onbekend'. Bewust géén nabouw van de
     regel, want dat is precies hoe deze bug ontstond. Blok 7 meldt dan dat de
     zoneverdeling niet te bepalen was, en dat is eerlijker dan een getal. */
  function zone(m, vorigMs) {
    if (!window.PLLoad || typeof PLLoad.zoneVan !== 'function') return 'onbekend';
    const s = { belasting: m.bezet, foutPct: m.fout, venGemMs: m.ms };
    const vorig = (typeof vorigMs === 'number') ? vorigMs : null;
    // De multiplier van dat moment hoort erbij: PLLoad rekent 'kalm' alleen
    // als er nog iets te winnen valt (_mult > MIN). Stond hij de hele rit op
    // 1,0, dan is 'kalm' onbereikbaar — en dat is informatie, geen gebrek.
    try { return PLLoad.zoneVan(s, vorig, m.mult); }
    catch (e) { console.warn('PLLoad.zoneVan() klapte op een spoormonster', e); return 'onbekend'; }
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
  let laatstLoop = 0;        // wanneer de lus voor het laatst LIEP — #170, zie tik()
  let vorigVerbonden = null, _aan = false;
  let zonderBron = 0;        // tikken waarin er geen versheidsbron was (#74)
  let meetgaten = [], meetgatSinds = 0;   // #133, zie de uitleg bij tik() hieronder

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
      /* Herverbindingen tellen: dit is het signaal van de achtergrondkwestie
         (Android bevriest de WebView-timers). Ook tellen als we niet meten.

         HERZIEN OP 02-09-2026 (#77). Hier stond `if (vorigVerbonden === false
         && verbonden)`, met `vorigVerbonden` beginnend op null. PLRit.start()
         draait bij het laden van de app, dus de tikken vóór het verbinden
         zetten die vlag op false — en de eerste, volstrekt normale verbinding
         telde daarna als herverbinding. In de rit van 01-09 meldde blok 14
         "1 herverbinding" bij 0 gaten, terwijl er niets verbroken was: de app
         laadde om 22:25:53 en de SPP-verbinding kwam om 22:26:46.

         Dat is niet alleen een getal te veel. De regel eronder zegt "volgt elke
         herverbinding op een gat, dan is dat de achtergrondkwestie en niet de
         bus" — met 0 gaten en 1 herverbinding wijst die tekst je naar de bus of
         de adapter. Een gratis vals spoor in precies de meting die #18 moet
         beantwoorden.

         Nu blijft `vorigVerbonden` op null tot de EERSTE keer dat er verbinding
         is. Pas daarna kan false→true een herverbinding zijn. PLRit.wis() raakt
         deze vlag bewust niet aan: anders levert "Rit nulstellen" dezelfde
         valse telling opnieuw op. */
      if (verbonden) {
        if (vorigVerbonden === false) herverbindingen++;
        vorigVerbonden = true;
      } else if (vorigVerbonden !== null) {
        vorigVerbonden = false;
      }

      if (!verbonden) {
        /* Een lopend meetgat afsluiten op een échte onderbreking. Zodra
           `connected` false wordt is de oorzaak niet langer dubbelzinnig —
           dat hoort bij het loopgat/de herverbinding hierboven, niet bij het
           meetgat hieronder. Zonder dit zou een meetgat dat overgaat in een
           formele disconnect nooit afgesloten worden. */
        if (meetgatSinds) {
          meetgaten.push({ van: meetgatSinds, tot: laatstT, s: Math.round((laatstT - meetgatSinds) / 1000) });
          meetgatSinds = 0;
        }
        return;
      }
      const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();

      /* EEN TIK DIE WIJ ZELF OVERSLAAN IS GEEN GAT (10-09-2026, #170).

         Deze twee guards slaan het bemonsteren over omdat wij dat willen: in
         demo zijn de waarden verzonnen, en tijdens een testrun vraagt de sweep
         45 PIDs achter elkaar op. De LUS liep daar gewoon door — hij besloot
         alleen niets te meten. Tot vandaag returnden ze vóór `laatstT = nu`, en
         dan zag de eerstvolgende tik ná de run een gat ter grootte van die hele
         run staan. Nagemeten met een run van 70 s: één loopgat van 75 s.

         Dat is geen cosmetisch getal. Blok 14 legt elk loopgat naast
         PLAchtergrond, en zo'n zelfgemaakt gat valt buiten elke
         achtergrondperiode — waarna er in het verslag van 10-09 stond: "de lus
         lag daar stil terwijl de app in beeld stond … kijk naar de adapter, de
         bus of een vastgelopen sweep." Precies de verkeerde jacht.

         `laatstLoop` houdt daarom bij wanneer de lus voor het laatst LIEP, en
         daar meet het loopgat tegen. `laatstT` blijft wat het was — de laatste
         tik waarin er werkelijk bemonsterd is — want dat is de klok waar het
         meetgat zijn einde aan ontleent, en tijdens een run weten we juist
         niets over de datastroom.

         DE VERBROKEN VERBINDING HIERBOVEN IS BEWUST NIET MEEGENOMEN. Ook daar
         loopt de lus door, dus strikt genomen is dat óók geen loopgat. Maar een
         onderbreking van tien minuten zou dan alleen nog als "1 herverbinding"
         zichtbaar zijn, en dat is minder dan er nu staat. Dat vraagt een eigen
         soort gat en een eigen meting; zie #170. */
      const zelfOvergeslagen = (typeof demoMode !== 'undefined' && demoMode) ||
                               (typeof _trBezig !== 'undefined' && _trBezig);
      if (zelfOvergeslagen) { laatstLoop = nu; return; }
      if (typeof pidVals === 'undefined' || !pidVals) return;

      if (!start) start = nu;
      // Een gat betekent dat deze lus zelf niet liep — precies het bewijs uit de
      // rit van 23-08 (het logboek zweeg op dezelfde kloktijden).
      let loopgatNu = false;
      if (laatstLoop && (nu - laatstLoop) > GAT_MS) {
        gaten.push({ van: laatstLoop, tot: nu, s: Math.round((nu - laatstLoop) / 1000) });
        loopgatNu = true;
      }
      laatstT = nu; laatstLoop = nu;

      // De versheidsbron. Ontbreekt hij, dan wordt er NIET stilzwijgend
      // teruggevallen op de oude telling: dan is deze rit niet te beoordelen en
      // zegt blok 14 dat. Een terugval die "gewoon iets" meet is precies hoe
      // #74 vier ritten lang onzichtbaar bleef.
      const stempels = (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) ? _pidLastUpd : null;
      if (!stempels) { zonderBron++; return; }

      let bekendeTik = 0, gemetenTik = 0;
      Object.keys(pidVals).forEach(function (p) {
        const v = pidVals[p];
        if (typeof v !== 'number' || !isFinite(v)) return;
        let e = per[p];
        const alBekend = !!e;
        if (!e) e = per[p] = { n: 0, tikken: 0, gemist: 0, min: v, max: v, laatst: v,
                               veranderingen: 0, tLaatsteVer: nu, stempel: null };
        const uitkomst = neem(e, v, stempels[p], nu);
        // Alleen PIDs die deze accumulator al eerder zag tellen mee als
        // bewijs. Bij hun EERSTE waarneming kan neem() per definitie nooit
        // 'gemeten' teruggeven (zie de uitleg boven neem()), en dan zou de
        // openingstik van elke rit zelf al als meetgat gelden.
        if (alBekend) {
          bekendeTik++;
          if (uitkomst === 'gemeten') gemetenTik++;
        }
      });

      /* MEETGAT NAAST LOOPGAT (10-09-2026, #133). Een loopgat hierboven
         betekent dat de lus zelf niet tikte (Android bevriest de WebView-
         timers). Dat is niet wat er gebeurde op de rit van 10-09: een
         BT-SPP-socket sterft niet als de adapter zijn voeding verliest, dus
         `connected` bleef de volle 39 s true en de lus tikte gewoon door om
         de 5 s. Wat stilviel was de data — geen enkele PID-stempel in
         `_pidLastUpd` verschoof — en PLRit.gaten() was daar blind voor: 0
         gaten, terwijl 28 van de 31 sensoren een gat in pidHist had.

         Geen nieuwe bron nodig: neem() telt dat al per PID op in `gemist`.
         Een tik waarin elke al bekende PID `gemist` oplevert (dus geen
         enkele 'gemeten') is een meetgat. Opeenvolgende meetgat-tikken worden
         tot één interval samengevoegd, net als bij `gaten`.

         EEN BEVRIEZING IS GEEN MEETGAT, en dat is de uitzondering hieronder.
         Bij een bevriezing staan de pollus en deze tiklus SAMEN stil — dat is
         wat bevriezen is. De eerste tik terug boekt hierboven terecht een
         loopgat, maar leest daarna stempels die nog van vóór de stilte zijn en
         zou dus ook een meetgat openen. Nagemeten: 90 s bevriezing gaf een
         loopgat van 90 s én een meetgat van 5 s, en blok 14 wijst je dan
         tegelijk naar de achtergrondkwestie en naar de bus. Dat is de vorm van
         #77 en #103 — één signaal te veel dat je de verkeerde kant op stuurt.
         Een lopend meetgat blijft op zo'n tik staan zoals het stond: deze tik
         weet niets over de data, dus hij opent en sluit er ook niets mee. */
      if (!loopgatNu) {
        if (bekendeTik > 0 && gemetenTik === 0) {
          if (!meetgatSinds) meetgatSinds = nu;
        } else if (meetgatSinds) {
          meetgaten.push({ van: meetgatSinds, tot: nu, s: Math.round((nu - meetgatSinds) / 1000) });
          meetgatSinds = 0;
        }
      }
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
    // Een lopend meetgat (de adapter is NU weg) hoort er ook in te staan,
    // anders zegt blok 14 pas iets zodra de adapter terugkomt.
    meetgaten: function () {
      const lijst = meetgaten.slice();
      if (meetgatSinds) lijst.push({ van: meetgatSinds, tot: laatstT, s: Math.round((laatstT - meetgatSinds) / 1000) });
      return lijst;
    },
    herverbindingen: function () { return herverbindingen; },

    /* Een herverbinding MELDEN in plaats van hem uit `connected` afleiden.
       (#103, 03-09-2026)

       tik() leest `connected` als momentopname. Een socket die tussen twee
       tikken sterft en herstelt is daarmee onzichtbaar, en dat is precies wat
       er op 02-09 gebeurde: het app-log heeft om 23:18:05 "SPP automatisch
       herverbonden" staan met een volledige ELM-init erachteraan, en zowel
       blok 5 als blok 14 meldden `0 herverbinding(en) bij 1 gat(en)`.

       Dat is niet één getal te weinig. De regel eronder zegt "volgt elke
       herverbinding op een gat, dan is dat de achtergrondkwestie en niet de
       bus" — met nul herverbindingen valt er niets te volgen en leest het gat
       als een zuivere bevriezing. Spiegelbeeld van #77, dat er juist één te
       veel telde en je naar de bus stuurde.

       sppReconnectGuard weet zéker dát het gebeurde. Die zekerheid is beter dan
       elke bemonstering, hoe vaak je ook kijkt.

       DUBBELTELLEN VOORKOMEN. Zag tik() de onderbreking óók (vorigVerbonden is
       dan false), dan telt hij hem bij de eerstvolgende tik zelf al. In dat
       geval doet deze melding niets — anders staat er twee waar er één was, en
       dan hebben we #77 teruggebouwd aan de andere kant. */
    meldHerverbinding: function (bron) {
      if (vorigVerbonden === false) return false;   // tik() heeft de val gezien en telt hem zelf
      herverbindingen++;
      vorigVerbonden = true;
      try { if (typeof btDiag === 'function') btDiag('PLRit telt een herverbinding (' + (bron || 'onbekend') + ')', 'info'); }
      catch (e) { console.warn('PLRit: herverbinding wel geteld, niet gemeld in de BT-log', e); }
      return true;
    },
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
    wis: function () { per = {}; start = 0; laatstT = 0; laatstLoop = 0; gaten = []; herverbindingen = 0; zonderBron = 0;
                       meetgaten = []; meetgatSinds = 0; }
  };
})();

/* ELK GAT TOEWIJZEN IN PLAATS VAN HET TOE TE SCHRIJVEN (08-09-2026, #18).

   In blok 14 stond "een gat betekent dat de meetlus zelf niet liep (Android
   bevriest WebView-timers op de achtergrond)". Het eerste deel is waar — een
   gat IS een lus die niet liep. Het tweede is een OORZAAK, en die werd aan élk
   gat toegekend zonder ernaar te kijken. Een gat door een dode adapter, een
   vastgelopen sweep of een trage bus las precies hetzelfde, en dat stuurt je
   op de verkeerde jacht.

   PLAchtergrond weet welke perioden de app werkelijk weg was. Valt een gat
   binnen zo'n periode, dan is het de achtergrondkwestie; valt het erbuiten,
   dan lag de lus stil terwijl de app gewoon in beeld stond — en dat is een
   heel ander en veel interessanter probleem.

   `perioden` is NULL als PLAchtergrond er niet is. Dat is met opzet iets
   anders dan een lege lijst: geen module betekent "niet te zeggen", een lege
   lijst betekent "gemeten, en de app was niet weg". Die twee als hetzelfde
   lezen is dezelfde fout als stil=0 tegen stil=null in pidlane-achtergrond.js.

   Los gehouden en naar buiten gebracht omdat blok 14 zelf een halve testrun
   nodig heeft om te draaien, en een oordeel dat alleen in de auto te toetsen
   is, wordt niet getoetst. test-gatduiding.js draait hem zonder browser. */
/* DE SPLITSING ZELF, ÉÉN KEER (10-09-2026, #170). Loopgaten kregen sinds
   08-09 hun duiding tegen PLAchtergrond; meetgaten kregen tot vandaag alleen
   een duur. Op de rit van 10-09 stond er daardoor `Meetgaten: 15 s, 35 s, 75 s`
   zonder dat te zien was welke daarvan de adapter was en welke de achtergrond.

   Dat is geen cosmetisch verschil: tijdens een AFGEKNEPEN achtergrond (gemeten
   op die rit: 146 s weg, waarvan 60 s doorgelopen en 86 s stil) blijft de lus
   tikken zonder loopgat te boeken, maar ververst de data niet. Er opent dan een
   meetgat, en de regel eronder wees dat toe aan "de adapter of de bus" —
   dezelfde verwisseling van #18 met de bus die het meetgat juist moest
   wegnemen.

   De overlapregel staat daarom op één plek. Twee plekken met dezelfde regel is
   in dit project al drie keer een bug geweest, en de duiding eronder verschilt
   nu juist per soort gat: een loopgat in de achtergrond is de bevriezing, een
   meetgat in de achtergrond is de afknijping. */
function _plGatenSplits(gaten, perioden) {
  var g = gaten || [];
  // Twee tikken speling: PLRit meet van tik tot tik, PLAchtergrond van
  // gebeurtenis tot gebeurtenis. Die randen vallen nooit precies samen.
  var SPELING = 12000;
  var kent = !!perioden;
  var inBg = function (x) {
    return kent && perioden.some(function (b) { return x.van >= b.van - SPELING && x.tot <= b.tot + SPELING; });
  };
  return {
    g: g,
    kent: kent,
    buiten: kent ? g.filter(function (x) { return !inBg(x); }) : [],
    lijst: g.slice(0, 5).map(function (x) { return x.s + ' s' + (inBg(x) ? ' (app weg)' : ''); }).join(', ')
  };
}

function plGatDuiding(gaten, perioden) {
  var sp = _plGatenSplits(gaten, perioden);
  var g = sp.g, kent = sp.kent, buiten = sp.buiten, lijst = sp.lijst;
  var duiding = !kent
    ? ' — PLAchtergrond ontbreekt, dus er valt niet te zeggen wélke gaten van de achtergrond kwamen.'
    : !g.length
      ? ''
      : !buiten.length
        ? ' — alle gaten vallen binnen een periode waarin de app aantoonbaar weg was: dat is #18 en niet de bus.'
        : ' — ' + buiten.length + ' van de ' + g.length + ' gaten vielen BUITEN elke achtergrondperiode (grootste ' +
          buiten.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0) + ' s). De lus lag daar stil terwijl de app ' +
          'in beeld stond, en dat is #18 niet — kijk naar de adapter, de bus of een vastgelopen sweep.';
  return { lijst: lijst, buiten: buiten, duiding: duiding };
}

/* Hetzelfde, maar voor het MEETGAT — de lus tikte, de data niet (#133/#170).
   De kanten wisselen hier van betekenis: valt een meetgat binnen een periode
   waarin de app weg was, dan is het de afgeknepen achtergrond (#18) en niet de
   bus; valt het erbuiten, dan stond de app gewoon in beeld en kwam er tóch
   niets binnen — en dát is de adapter of de bus. */
function plMeetgatDuiding(meetgaten, perioden) {
  var sp = _plGatenSplits(meetgaten, perioden);
  var g = sp.g, kent = sp.kent, buiten = sp.buiten, lijst = sp.lijst;
  var duiding = !g.length
    ? ''
    : !kent
      ? ' — PLAchtergrond ontbreekt, dus er valt niet te zeggen wélke meetgaten van de achtergrond kwamen.'
      : !buiten.length
        ? ' — alle meetgaten vallen binnen een periode waarin de app weg was: dan is dit de afgeknepen ' +
          'achtergrond (#18) en niet de bus.'
        : ' — ' + buiten.length + ' van de ' + g.length + ' meetgaten vielen BUITEN elke achtergrondperiode ' +
          '(grootste ' + buiten.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0) + ' s). De app stond ' +
          'in beeld en de lus tikte, en er kwam tóch niets binnen: dat is de adapter of de bus (#133).';
  return { lijst: lijst, buiten: buiten, duiding: duiding };
}
/* IS DE ONDERRAND BEREIKBAAR, OF LIGT HIJ VAST ACHTER DE BALK? (10-09-2026, #172)

   De proef die dit gebruikt meldde vanaf 01-09 elke rit FOUT: "#appGrid loopt
   door tot onder de navigatiebalk". Op 10-09 zei de bestuurder in dezelfde
   sessie "Alles vrij — er valt niets weg", en dat was het antwoord waar die
   proef zelf om vroeg.

   Dat #appGrid LANGER is dan het scherm is op ≤760px met opzet zo: `.app`
   krijgt daar `height:auto` en de pagina scrollt. De oude regel mat of het
   element binnen de vouw paste; de vraag is of een mens bij de onderste regel
   kan. Op een pagina die scrollt vallen die twee nooit samen, en dan is de
   melding altijd waar en nooit iets waard — precies de "test die altijd rood
   staat" uit CLAUDE.md.

   De scrollruimte is wat het onderscheid maakt. Kun je nog `rest` pixels
   omlaag, dan komt de onderrand `rest` omhoog. Wat dán nog achter de balk
   staat, staat er vast — en dát is #58.

   Los gehouden en naar buiten gebracht omdat het oordeel zonder browser te
   toetsen hoort te zijn: de DOM-kant (welke maten) blijft in de proef, de
   regel (wat betekenen ze) staat hier. */
function plOnderrandOordeel(onder, grens, scrollRest) {
  var tekort = onder - grens;                       // wat er nu achter de balk zit
  var rest = Math.max(0, scrollRest || 0);          // hoeveel er nog te scrollen valt
  var vast = tekort - rest;                         // wat er ook uitgescrold blijft staan
  var maat = 'werkscherm eindigt op ' + Math.round(onder) + ' van ' + Math.round(grens) + 'px';
  if (tekort <= 1)
    return { ok: true, tekort: tekort, rest: rest, vast: vast, tekst: maat + ' — past binnen het scherm' };
  if (vast <= 1)
    return { ok: true, tekort: tekort, rest: rest, vast: vast,
             tekst: maat + ' — loopt ' + Math.round(tekort) + 'px door onder de balk, maar er is nog ' +
                    Math.round(rest) + 'px scrollruimte: bereikbaar' };
  return { ok: false, tekort: tekort, rest: rest, vast: vast,
           tekst: maat + ' — ' + Math.round(vast) + 'px blijft achter de navigatiebalk staan, ook volledig ' +
                  'uitgescrold (' + Math.round(tekort) + 'px eronder, ' + Math.round(rest) + 'px scrollruimte)' };
}

/* Hoeveel er onder een element nog weg te scrollen valt. De pagina zelf kan
   scrollen, maar ook een bak eromheen — welke van de twee het is, verschilt
   per scherm, dus we nemen de ruimste. */
function _plScrollRestOnder(el) {
  var rest = 0;
  var doc = document.scrollingElement || document.documentElement;
  if (doc) rest = Math.max(rest, doc.scrollHeight - doc.clientHeight - doc.scrollTop);
  for (var n = el; n && n !== document.body; n = n.parentElement) {
    var ov = '';
    try { ov = getComputedStyle(n).overflowY; }
    catch (e) { console.warn('overflowY onleesbaar bij het meten van de scrollruimte', e); continue; }
    if (ov === 'auto' || ov === 'scroll')
      rest = Math.max(rest, n.scrollHeight - n.clientHeight - n.scrollTop);
  }
  return rest;
}

window.plGatDuiding = plGatDuiding;
window.plMeetgatDuiding = plMeetgatDuiding;
window.plOnderrandOordeel = plOnderrandOordeel;
// Ook de meetkant naar buiten: welke bak er scrollt is een DOM-vraag, en die
// is alleen in een echte browser te beantwoorden (bproef-schermranden.js).
window._plScrollRestOnder = _plScrollRestOnder;
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
      // Gemaskeerd sinds 03-09-2026 (#102). Hier stond de volledige huidige VIN
      // én de volledige VIN van élk profiel dat ooit op dit toestel is
      // opgeslagen — in een verslag dat bedoeld is om te delen. Dat is meer
      // dan de twee logregels waar het issue over ging: het lekt niet één auto
      // maar alle auto's die dit toestel ooit heeft gezien.
      //
      // De laatste zes tekens zijn genoeg voor wat deze proef moet laten zien,
      // namelijk DAT de VIN van nu afwijkt van die bij het opslaan. Blok 1
      // toont de auto al in dezelfde vorm ("VIN 766507"), dus dit is ook de
      // vorm waarin je ze naast elkaar kunt leggen.
      const kort = function (v) { return '…' + String(v || '').slice(-6); };
      return { staat: 'FOUT', detail: 'huidige VIN ' + kort(vin) + ' heeft geen profiel; wél opgeslagen: ' +
        alle.map(function (k) { return kort(k.replace('pl_vinprof_', '')); }).join(', ') };
    }
    let prof = null;
    try { prof = JSON.parse(raw); } catch (e) {
      return { staat: 'FOUT', detail: 'profiel staat er maar is onleesbaar (' + raw.length + ' tekens) — JSON stuk' };
    }
    if (!prof || !prof.pids || !prof.pids.length)
      return { staat: 'FOUT', detail: 'profiel bestaat maar bevat geen PIDs — daarom valt de app terug op discovery' };

    let geladen = null;
    try { geladen = (typeof profielHealth === 'function') ? profielHealth() : undefined; }
    catch (e) { geladen = undefined; console.warn('Testrun: profielHealth() gaf een fout', e); }
    const verbT = (typeof window !== 'undefined' && typeof window._plVerbondenT === 'number')
      ? window._plVerbondenT : null;
    return _profielOordeel(prof, geladen, verbT);
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
  // HOE LANG het wachten duurde is sinds 7.1 de meting van #98. Met vier
  // aanvragers kreeg de sweep het slot op 02-09 in acht seconden niet, omdat de
  // pollus het na elke cyclus meteen terugpakte. PLBus houdt nu een wachtrij
  // bij; werkt die, dan hoort dit een paar honderd milliseconden te zijn — één
  // pollcyclus. Loopt het in de seconden, dan dringt er nog iets voor.
  /* WIE HIELD HET SLOT VAST, EN HOE LANG AL? (#159)

     Dit blok las de houder tot 11-09 pas NA de wait(). Bij een geslaagde
     claim is dat per definitie 'testrun-sweep' zelf — de eigen naam, elke
     keer. De meting van 09-09 meldde daarom "pas na 2098 ms wachten" zonder
     te kunnen zeggen achter wie, en precies die drie vragen hield #159 open:
     wie hield hem vast, hoe lang had die hem al, en stond er een rij voor.

     De houder wordt nu vóór het wachten vastgelegd en tijdens het wachten
     bemonsterd. Dat tweede is nodig omdat het slot binnen die twee seconden
     van hand kan wisselen: één naam aan het begin zegt dan niet waar de tijd
     heen ging. */
  let _houderStart = null, _houderMs = 0, _rijVoor = [];
  try {
    if (window.PLBus) {
      _houderStart = PLBus.owner ? PLBus.owner() : null;
      _houderMs = PLBus.heldMs ? PLBus.heldMs() : 0;
      _rijVoor = PLBus.wachtenden ? PLBus.wachtenden().slice() : [];
    }
  } catch (e) { console.warn('Bushouder onleesbaar vóór de sweep', e); }

  // Elke houder die we tijdens het wachten voorbij zien komen, met de langste
  // tijd die hij op dat moment had staan.
  const _gezien = Object.create(null);
  const _noteer = function () {
    try {
      if (!window.PLBus || !PLBus.owner) return;
      const n = PLBus.owner();
      if (!n || n === 'testrun-sweep') return;
      const h = PLBus.heldMs ? PLBus.heldMs() : 0;
      if (!(n in _gezien) || h > _gezien[n]) _gezien[n] = h;
    } catch (e) { /* niet stil: de lus mag doorlopen, maar de reden hoort gelogd */
      console.warn('Bushouder niet te bemonsteren tijdens het wachten', e); }
  };
  if (_houderStart) _gezien[_houderStart] = _houderMs;

  const _slotT0 = _nu();
  const _bemonster = setInterval(_noteer, 100);
  try { _busTok = (window.PLBus && PLBus.wait) ? await PLBus.wait('testrun-sweep', 8000) : 0; } catch (e) { console.warn('Busslot-claim voor de sweep gaf een fout (niet alleen bezet)', e); }
  clearInterval(_bemonster);
  const _slotMs = _nu() - _slotT0;

  // De houders op een rij, langste vasthoudtijd eerst.
  const _namen = Object.keys(_gezien).sort(function (a, b) { return _gezien[b] - _gezien[a]; });
  const _wie = _namen.length
    ? _namen.map(function (n) { return '"' + n + '" (had hem al ' + Math.round(_gezien[n]) + ' ms)'; }).join(', ')
    : null;
  const _rij = _rijVoor.length ? ' Er stonden er ' + _rijVoor.length + ' vóór ons in de rij: ' + _rijVoor.join(', ') + '.' : '';

  if (!_busTok) _boek(3, 'Busslot', 'LET OP', 'bus niet vrijgekomen binnen 8 s — sweep loopt naast de pollus' +
    (_wie ? ' (vastgehouden door ' + _wie + ')' : '') + _rij +
    ' De wachtrij van PLBus hoort dit te voorkomen; staat dit er nog, dan dringt er iets voor (#98)', null);
  else if (_slotMs > 2000) _boek(3, 'Busslot', 'LET OP', 'bus geclaimd, maar pas na ' + _slotMs + ' ms wachten — ' +
    'met de wachtrij hoort dat een pollcyclus te zijn, geen seconden (#98). ' +
    (_wie ? 'Vastgehouden door ' + _wie + '.' : 'Geen houder gezien tijdens het wachten — dan zat de vertraging niet in een andere houder maar in de wachtrij zelf.') +
    _rij, null);
  else _boek(3, 'Busslot', 'ok', 'bus geclaimd voor de sweep na ' + _slotMs + ' ms wachten' +
    (_wie && _slotMs > 200 ? ', achter ' + _wie : ''), null);

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

  // Het tempo erbij (7.1). Dit is de andere helft van #98: op 02-09 duurde de
  // sweep 73 s in plaats van 12, en 1250 ms per PID in plaats van 200, omdat hij
  // zonder slot naast de pollus mat. Zonder dit getal in het verslag is dat
  // verschil alleen terug te vinden door tijdstempels af te trekken.
  const _sweepMs = _nu() - _slotT0;
  const _perPid = gelukt ? Math.round(_sweepMs / gelukt) : null;
  _boek(3, 'PID-sweep klaar', gelukt && !fout ? 'ok' : 'LET OP',
    gelukt + ' gelezen, ' + leeg + ' geen data, ' + fout + ' parserprobleem' +
    '  |  ' + Math.round(_sweepMs / 1000) + ' s' + (_perPid === null ? '' : ', ' + _perPid + ' ms per PID') +
    (_busTok ? ' (met slot)' : ' (ZONDER slot — naast de pollus, dus deze tijden zeggen niets over de bus)'), null);

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
    const tel = { druk: 0, ruim: 0, kalm: 0, stil: 0, onbekend: 0 };
    // De vorige responstijd meegeven: `venStijgt` in PLLoad kijkt naar de stap
    // tussen twee tikken, en zonder dat argument zou deze telling opnieuw een
    // andere regel meten dan de regeling (#76). Het eerste monster heeft er
    // geen — daar is venStijgt bij PLLoad ook onbekend.
    let vorigMs = null;
    sp.forEach(function (m) {
      const z = PLBudget.zone(m, vorigMs);
      if (tel[z] === undefined) tel[z] = 0;
      tel[z]++;
      vorigMs = m.ms;
    });
    const pct = function (n) { return Math.round(n / sp.length * 100); };
    if (tel.onbekend === sp.length)
      return { staat: 'LET OP', detail: 'PLLoad.zoneVan() ontbreekt — de zoneverdeling is niet te bepalen. ' +
        'Bewust geen eigen nabouw van de regel: dat was precies hoe deze meting op 23-08 uit de pas ging lopen (#76)' };
    return 'druk ' + pct(tel.druk) + '%, ruim ' + pct(tel.ruim) + '%, kalm ' + pct(tel.kalm) +
      '%, dode zone ' + pct(tel.stil) + '%' +
      (tel.onbekend ? ', niet te bepalen ' + pct(tel.onbekend) + '%' : '') +
      (tel.ruim === 0 ? '   [ruim is nooit bereikt — de vaste terugweg bestaat op deze bus niet]' : '') +
      (tel.kalm === 0 ? '   [kalm vraagt _mult > 1,0; stond het tempo de hele rit op 100%, dan is die zone onbereikbaar]' : '');
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
    // TWEE STANDEN DIE NIET HETZELFDE ZIJN (#76). "Nooit geremd" is geen bewijs
    // dat de regelkring eerlijk remt — het is een rit waarin hij nooit heeft
    // hoeven remmen, en die zegt over de vraag niets. De Slotsom hieronder las
    // dat tot 02-09-2026 als "0 ongevraagd, dus punt 2 kan dicht". Daarom
    // draagt deze uitkomst nu zelf de waarschuwing, en niet alleen de Slotsom.
    if (!remmen.length)
      return { staat: 'LET OP', detail: 'geen enkele stap omlaag in dit spoor — de regelkring heeft in deze rit ' +
        'nooit geremd. Dat is GEEN antwoord op de vraag of hij terecht remt; daarvoor is een rit nodig waarin ' +
        'de bus vol genoeg staat (#15)' };

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

  // DRIE UITKOMSTEN, NIET TWEE (#76). De oude Slotsom kende alleen "meer dan 0
  // ongevraagd" en "0 ongevraagd", en gooide daarmee de belangrijkste stand
  // weg: een rit waarin er helemaal niet geremd is. Die telt als "0
  // ongevraagd" en zou punt 2 dus sluiten op een meting die er niet was.
  const _remStanden = (function () {
    let n = 0;
    for (let i = 1; i < sp.length; i++) if (sp[i].mult > sp[i - 1].mult) n++;
    return n;
  })();
  _boek(7, 'Slotsom', _remStanden ? 'ok' : 'LET OP',
    _remStanden === 0
      ? 'In deze rit is geen enkele keer geremd (' + sp.length + ' monsters). Punt 2 kan hierop NIET dicht: ' +
        'de vraag is of de regelkring terecht remt, en dat is alleen te zien in een rit waarin hij remt. ' +
        'Nodig: een volle bus — alle aanvragers aan, en lang genoeg rijden (#15).'
      : 'Ongevraagde remmomenten > 0 én bezetting voorspelt geen responstijd = het vermoeden uit PLAN.md punt 2 klopt; ' +
        'de tegendruk moet dan aan responstijd/fouten hangen, niet aan bezetting. ' +
        _remStanden + ' remmomenten gemeten, waarvan geen enkele ongevraagd = het vermoeden klopt niet en punt 2 kan dicht.', null);
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
        // Uitpakken via splitBatchResponse() sinds #116: de testrun mag niet
        // zijn eigen parser hebben naast die van de app — dan meet hij zichzelf.
        const b = splitBatchResponse(String(rk), ['0105'])['0105'];
        if (b && b.length) koel = b[0] - 40;
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
      const rk = await sendCmd('0105', 2500);
      const b = splitBatchResponse(String(rk || ''), ['0105'])['0105'];   // #116
      if (b && b.length) koel = b[0] - 40;
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
    /* ── VIEL DE VERBINDING WEG TIJDENS DEZE TRAP? (#213, 16-09-2026) ──────
       Op 16-09 herverbond de SPP-socket om 16:08:58, midden in de rust na trap
       1, en het verslag meldde over datzelfde venster "hersteld binnen 20 s".
       Blok 10 keek nergens naar `connected`, dus een meting kon een volledige
       herverbinding mét ELM-initialisatie overspannen zonder dat er iets van
       in de regel stond. Eén vlag, en het oordeel weet voortaan waar het
       overheen keek. */
    let losgeraakt = false;
    const _kijkVerbinding = function () {
      try { if (typeof connected !== 'undefined' && !connected) losgeraakt = true; }
      catch (e) { /* stil: `connected` is een lexicale binding; ontbreekt hij, dan valt er niets te zien */ }
    };
    const eind = _nu() + trap.sec * 1000;
    try {
      while (_nu() < eind && !_trStop) {
        const r = await _snelheidVraag(set[i % set.length]);
        i++; n++;
        if (r.ok) tijden.push(r.ms); else mis++;
        _kijkVerbinding();
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
      (misPct > 0 || losgeraakt) ? 'LET OP' : 'ok',
      n + ' verzoeken (' + perSec + '/s), ' + mis + ' mis (' + misPct + '%), ' +
      'mediaan ' + med + ' ms, p90 ' + p90 + ' ms, traagste ' + max + ' ms' +
      (basis && med ? ', ' + (med >= basis ? '+' : '') + Math.round((med - basis) / basis * 100) + '% tegenover trap 1' : '') +
      (losgeraakt ? ' — LET OP: de verbinding was tijdens deze trap even weg, dus deze getallen lopen over een herverbinding heen' : ''),
      null);

    // ── rust ──
    const rustSec = (t === SNELHEID_TRAPPEN.length - 1) ? SNELHEID_NARUST_S : SNELHEID_RUST_S;
    const prikken = [];
    const rustEind = _nu() + rustSec * 1000;
    let eersteHerstel = null, prikTotaal = 0;
    while (_nu() < rustEind && !_trStop) {
      await _wacht(5000);
      if (_trStop) break;
      // Slot pakken als het vrij is, maar NIET wachten: deze prik meet hoe snel
      // de bus na een trap herstelt, en dat is ook een meting waard als een
      // ander er net op zit. Vandaar withBus met wachttijd 0 in plaats van de
      // eigen claim met een handgeschreven release die hier tot #115 stond —
      // withBus() kan het teruggeven niet vergeten, ook niet als de vraag
      // hieronder er met een fout uitspringt.
      const r = (typeof withBus === 'function')
        ? await withBus('testrun-snelheid-prik', () => _snelheidVraag(set[0]), 0)
        : await _snelheidVraag(set[0]);
      /* Elke prik telt mee, ook de mislukte (#213, 16-09-2026). Hier stond
         alleen de `if (r.ok)`-tak, zonder else: een prik die niets opleverde
         verdween spoorloos. Juist tijdens een herstelmeting is dát het
         interessantste dat er kan gebeuren — en op 16-09 stonden er na trap 1
         drie prikken waar er vijf hoorden, precies rond een herverbinding, met
         niets in de regel dat dat verried. */
      prikTotaal++;
      _kijkVerbinding();
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
      const kwijt = prikTotaal - prikken.length;
      _boek(10, 'rust na ' + trap.naam, (terug && !kwijt && !losgeraakt) ? 'ok' : 'LET OP',
        rustSec + ' s stil, ' + prikken.length + ' van ' + prikTotaal + ' prikken gelukt: ' + prikken.join(', ') + ' ms' +
        ' — mediaan ' + alles + ' ms, laatste drie ' + nu + ' ms' +
        (basis ? ', trap 1 zat op ' + basis + ' ms: ' +
          (terug ? 'hersteld' + (eersteHerstel === null ? '' : ' binnen ' + eersteHerstel + ' s')
                 : 'blijft ' + Math.round((nu - basis) / basis * 100) + '% hoger') : '') +
        (kwijt ? ' — ' + kwijt + ' prik' + (kwijt === 1 ? '' : 'ken') + ' gaven niets terug, dus dit oordeel staat op minder metingen dan het lijkt' : '') +
        (losgeraakt ? ' — en de verbinding was in dit venster even weg' : ''),
        null);
    } else if (prikTotaal) {
      // Alle prikken mislukt. Dat is geen "geen meting" maar een meting met een
      // duidelijke uitkomst, en zonder deze tak stond er over dit venster niets.
      _boek(10, 'rust na ' + trap.naam, 'LET OP',
        rustSec + ' s stil, 0 van ' + prikTotaal + ' prikken gelukt — de bus gaf tijdens de rust niets terug' +
        (losgeraakt ? ' en de verbinding was even weg' : ''), null);
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
      /* ── HET DERDE GETAL (#212, 16-09-2026) ──────────────────────────────
         Deze regel toonde tempo, bezetting, foutgraad en responstijd, en
         concludeerde daaruit dat de app te voorzichtig was. Op 16-09 klopte
         die conclusie niet: de app had gelijk en de proef keek de verkeerde
         kant op. Blok 10 vraagt namelijk één PID per verzoek terwijl de app in
         groepen van drie polt, en op een adapter die frames herhaalt is dat
         precies het verschil tussen "niets aan de hand" en "een derde van de
         batches verliest zijn laatste PID".

         `onvolPct` en de echoteller bestonden al in PLBus.stats() maar stonden
         in het hele verslag nergens. Nu wel — en dan leest de tegenspraak
         zichzelf in plaats van dat iemand hem achteraf uit de TX/RX-staart moet
         halen. Dat de proef zelf ook in batchvorm hoort te meten blijft open;
         het adapterpaneel doet dat inmiddels wél (PLAdapter.meet()). */
      _boek(10, 'Stand van de app na de proef', oordeel,
        (ld ? 'tempo ' + ld.tempoPct + '%' + (ld.handmatig ? ' (handmatig)' : '') : '') +
        (bs ? ', bus ' + bs.belasting + '% bezet, fout ' + bs.foutPct + '%, gem ' + bs.gemMs +
              ' ms (venster ' + bs.venGemMs + ' ms), onvolledig ' + bs.onvolPct + '%' +
              (bs.echoTot ? ', ' + bs.echoTot + ' herhaalde antwoorden' : '') : '') +
        (oordeel === 'LET OP' && snel
          ? ' — de app staat op ' + ld.tempoPct + '% terwijl de verbinding zonder één misser ' +
            snel.perSec + '/s aankan. Terugschroeven op bezetting terwijl de foutgraad 0 is.' +
            (bs && bs.onvolPct > 8
              ? ' LET OP: ' + bs.onvolPct + '% van de batches kwam onvolledig terug — deze proef vraagt solo, ' +
                'dus zij ziet dat niet en de foutgraad telt het met opzet niet mee.'
              : '')
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
// ══════════════════════════════════════════════════════════════════
// BLOK 5 — DE PROEVEN VAN DEZE OPLEVERING, ALS LIJST
// ══════════════════════════════════════════════════════════════════
// Tot 6.6 was dit één functie van 585 regels waar elke oplevering in werd
// geknipt en geplakt, met bovenaan een banner die opsomde welke proeven er
// nieuw waren en welke eruit gingen. Die banner zei hetzelfde als CAMPAGNE:
// twee lijsten van hetzelfde, bijgehouden met de hand. Dat is in dit project
// al twee keer misgegaan — PIDLANE-WERK.md, en daarna §11 van PIDLANE.md.
//
// Nu is het een lijst. Een oplevering voegt een entry toe of haalt er een
// weg; _blok5() eronder blijft ongemoeid. En welke issues deze ronde dekt is
// af te lezen uit de data (PLTestrun.dekking()) in plaats van uit een
// opsomming die iemand moet onthouden bij te werken.
//
// Elke entry:
//   issue   waar de proef over gaat: '#40', '§8', of '—' als er geen issue
//           bij hoort. Dit veld is de reden dat de opsomming weg kon.
//   naam    de regel die in het verslag komt te staan
//   waarom  één zin: waarom dit hier gemeten wordt en niet in een node-test
//   proef   de meting zelf, met hetzelfde contract als _doe(): een string bij
//           ok, of { staat, detail } om zelf het oordeel te bepalen
//
// WAAROM DEZE PROEVEN IN DE APP STAAN EN NIET ALLEEN IN NODE. De node-tests
// draaien de modules met een nagemaakte DOM en een nagemaakte Airtable. Wat
// ze NIET kunnen zien is of die modules in de dráaiende app aan elkaar hangen
// — precies het soort verbinding dat bij #29, #74 en #52 ontbrak zonder ooit
// een fout te geven. Vandaar: de weg meten, in de app.
//
// GELDVEILIGHEID. Geen enkele proef hieronder doet een AI-call; die kosten
// een klant echte tokens.
// ══════════════════════════════════════════════════════════════════

// Hoeveel aanvragers stonden er tijdens de rit aan? Twee proeven hieronder
// hangen ervan af, dus één keer bepalen en niet twee keer half.
function _aanvragersNu() {
  const aan = [];
  try { if (window.PLWaak && PLWaak.actief()) aan.push('waakronde'); } catch (e) { console.warn('waakrondestand onleesbaar in de rit-oogst', e); }
  try { if (typeof PLMon !== 'undefined' && PLMon.active) aan.push('rit-monitor'); } catch (e) { console.warn('monitorstand onleesbaar in de rit-oogst', e); }
  try { if (window.PLBulk && (PLBulk.status() || {}).actief) aan.push('bulk-recorder'); } catch (e) { console.warn('bulkstand onleesbaar in de rit-oogst', e); }
  try { if (typeof caravanActive !== 'undefined' && caravanActive) aan.push('caravan-tracker'); } catch (e) { console.warn('caravanstand onleesbaar in de rit-oogst', e); }
  return aan;
}

/* ── EEN PROEF LAAT GEEN SPOREN NA (#105, 03-09-2026) ──────────────
   Twee proeven in blok 5 schieten verzonnen waarden in de meetketen: 300 °C
   op 0105 om te zien of laag 1 hem tegenhoudt, en 200 °C om te zien of laag
   2+3 bereikbaar is. Dat is met opzet en het is de goede manier om GEDRAG te
   toetsen — CLAUDE.md schrijft het zelfs voor.

   Alleen schreef validateAndSmooth() die waarden ook wég, en dan is de toets
   in de bron gaan schrijven die hij toetst. Op 02-09 rapporteerde blok 4
   twaalf seconden later:

       Opvallende metingen — 0105 uiterste 200 (1x)

   De werkelijke koelwatertemperatuur die rit was 91–93 °C. De 200 kwam nooit
   uit de auto. Wie dat verslag over een paar weken terugleest heeft geen
   enkele manier om te zien dat het de testrun zelf was.

   Dit is dezelfde regel als bij blok 3, dat de PID-selectie tijdelijk
   overschrijft en er "Selectie hersteld — 33 PIDs teruggezet" onder zet: wie
   in de app schrijft, zet terug. De log-regels blijven staan — die zijn waar,
   de proef heeft echt gedraaid — maar er staat nu een markering omheen zodat
   ze te plaatsen zijn. */
function _zonderSporen(naam, fn) {
  const bewaard = {};
  const pak = function (sleutel, lees) {
    try { bewaard[sleutel] = JSON.stringify(lees()); }
    catch (e) { bewaard[sleutel] = undefined;
      console.warn('Testrun: ' + sleutel + ' niet bewaard vóór "' + naam + '" — die teller kan vervuild raken', e); }
  };
  pak('letOp',    function () { return window._pidLetOp || null; });
  pak('letOpLog', function () { return window._letOpGelogd || null; });
  pak('outlier',  function () { return (typeof outlierCount !== 'undefined') ? outlierCount : null; });

  try { if (typeof log === 'function') log('🔬 Testrun: proef "' + naam + '" voedt met opzet onmogelijke waarden in — de meldingen hierna tot "proef klaar" komen niet uit de auto', 'info'); }
  catch (e) { console.warn('Testrun: markering vóór de proef niet gelogd', e); }

  try {
    return fn();
  } finally {
    const zet = function (sleutel, schrijf) {
      if (bewaard[sleutel] === undefined) return;
      try { schrijf(JSON.parse(bewaard[sleutel])); }
      catch (e) { console.warn('Testrun: ' + sleutel + ' niet teruggezet na "' + naam + '"', e); }
    };
    zet('letOp',    function (v) { if (v === null) delete window._pidLetOp;   else window._pidLetOp = v; });
    zet('letOpLog', function (v) { if (v === null) delete window._letOpGelogd; else window._letOpGelogd = v; });
    zet('outlier',  function (v) { if (v !== null && typeof outlierCount !== 'undefined') outlierCount = v; });
    try { if (typeof log === 'function') log('🔬 Testrun: proef "' + naam + '" klaar — de meetgeschiedenis staat terug zoals hij was', 'info'); }
    catch (e) { console.warn('Testrun: markering ná de proef niet gelogd', e); }
  }
}

const PROEVEN_B5 = [

  // ── zegt het scherm hetzelfde als het verslag? (#246, 18-09-2026) ──
  // De meetkamer tekent de lus terwijl hij loopt. Dat is nuttig zolang hij
  // hetzelfde zegt als dit verslag, en gevaarlijk zodra dat niet meer zo is:
  // een scherm dat groen wijst waar blok 5 rood zegt, laat je stoppen met
  // lezen. Precies de vorm van test-healthgate.js, maar dan waar je naar kijkt.
  //
  // test-meetkamer.js toetst de afleiding zonder browser en bproef-meetkamer.js
  // toetst dat het paneel er werkelijk in hangt. Wat allebei NIET kunnen is dit:
  // tijdens een échte rit, op de échte meetwaarden, geven de twee dan nog
  // steeds hetzelfde oordeel? Dat is wat hier gemeten wordt, en het is
  // goedkoop — beide kanten zijn al berekend.
  {
    issue: '#246',
    naam: 'Het scherm en het verslag geven hetzelfde oordeel',
    waarom: 'Een tegel die groen wijst waar het verslag rood zegt, is erger dan geen tegel: je stopt met het verslag lezen en meet daarna maanden naast.',
    proef: async function () {
      if (!window.PLMeetkamer)
        return { staat: 'FOUT', detail: 'PLMeetkamer ontbreekt — pidlane-meetkamer.js hangt niet in index.html, dus de lus is tijdens de rit onzichtbaar (#246)' };

      var s = null;
      try { s = PLMeetkamer.momentopname(); }
      catch (e) { return { staat: 'FOUT', detail: 'het scherm kon zijn bronnen niet lezen: ' + ((e && e.message) || e) }; }

      if (!s.opdracht)
        return { staat: 'LET OP', detail: 'geen opdracht geladen, dus er valt hier niets naast elkaar te leggen — ' +
          'het scherm meldt: ' + (s.reden || 'onbekend') };

      // DE VERGELIJKING. Beide kanten komen uit PLOpdracht.meet(), dus ze
      // HOREN gelijk te zijn — en juist daarom is een verschil hier een harde
      // bevinding en geen ruis: het betekent dat er ergens een tweede oordeel
      // is ontstaan.
      var scheef = [];
      s.uitslagen.forEach(function (u) {
        var m = PLMeetkamer.meter(u);
        if (m.staat !== u.staat) { scheef.push(u.naam + ': verslag ' + u.staat + ', scherm ' + m.staat); return; }
        // Een balk zonder waarde en een oordeel mét waarde horen niet samen.
        var heeftWaarde = (u.waarde !== null && u.waarde !== undefined);
        if (heeftWaarde && m.pos === null) scheef.push(u.naam + ': er is ' + u.waarde + ' gemeten maar het scherm tekent geen balk');
        if (!heeftWaarde && m.pos !== null) scheef.push(u.naam + ': niets gemeten maar het scherm tekent wél een balk op ' + m.pos);
      });

      if (scheef.length)
        return { staat: 'FOUT', detail: scheef.length + ' proef/proeven worden op het scherm anders getoond dan hier geboekt: ' +
          scheef.join(' | ') + ' — er is een tweede oordeel ontstaan' };

      // De issuebaan mag niets tonen dat blok 5 niet dekt.
      var baan = PLMeetkamer.issuebaan(s);
      var bekend = {};
      s.proeven.forEach(function (p) { if (p.issue) bekend[p.issue] = 1; });
      (s.opdracht.proeven || []).forEach(function (p) { if (p.issue) bekend[p.issue] = 1; });
      var verzonnen = baan.filter(function (b) { return !bekend[b.issue]; }).map(function (b) { return b.issue; });
      if (verzonnen.length)
        return { staat: 'FOUT', detail: 'de issuebaan toont ' + verzonnen.length + ' issue(s) die in geen enkele lijst staan: ' +
          verzonnen.join(', ') + ' — dat is een tweede lijst aan het ontstaan' };

      return { staat: 'ok', detail: s.uitslagen.length + ' proef/proeven en ' + baan.length +
        ' issue(s) staan op het scherm precies zoals ze hier geboekt worden' };
    }
  },

  // ── de meetopdracht van buiten (#241, 17-09-2026) ──
  // De lus: de testrun schrijft tijdens de rit naar de logtabel, die tabel
  // wordt buiten de app gelezen, en daaruit volgt een volgende meting. Zonder
  // deze proef kost die volgende meting elke keer een deploy naar 100% van
  // het verkeer.
  //
  // Wat er binnenkomt is DATA en geen code: sensoren, een duur, vragen,
  // drempels, en proeven van de vorm "PID X, maat Y, tussen A en B". Het
  // keuren gebeurt in pidlane-opdracht.js, vóór er iets mee gebeurt.
  //
  // DE UITSLAG GAAT MET NAAM EN AL DE LIVE-LOG IN. Dat is de terugweg: wie de
  // tabel leest ziet niet alleen dát er gemeten is maar ook WELKE opdracht dat
  // deed. Zonder die koppeling staan er straks uitslagen in de tabel waarvan
  // niemand meer weet bij welke vraag ze hoorden.
  {
    issue: '#241',
    naam: 'De meetopdracht van buiten is uitgevoerd',
    waarom: 'Een opdracht die stil niet aankomt of stil wordt afgekeurd, is een rit die iets anders meet dan er gevraagd is — en dat merk je pas bij het lezen van het verslag.',
    proef: async function () {
      if (!window.PLOpdracht || typeof PLOpdracht.haal !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht ontbreekt — dan is er geen weg meer van buiten naar de meting (#241)' };

      if (!PLOpdracht.toggleAan())
        return { staat: 'LET OP', detail: 'het ophalen van meetopdrachten staat uit in de Config (`feat_opdracht`) — ' +
          'de testrun draait zoals hij in de build staat. Dat is hier een keuze, geen fout.' };

      var o = null;
      try { o = await PLOpdracht.haal(); }
      catch (e) { return { staat: 'FOUT', detail: 'de opdracht kon niet opgehaald worden: ' + ((e && e.message) || e) }; }

      if (!o) {
        var r = PLOpdracht.reden() || 'onbekend';
        // Afgekeurd is iets anders dan er-staat-niets. Het eerste is een fout
        // in wat er klaargezet is en moet opvallen; het tweede is de normale
        // stand tussen twee rondes in.
        if (/afgekeurd/i.test(r))
          return { staat: 'FOUT', detail: 'er stond een opdracht klaar en die is AFGEKEURD — ' + r +
            '. De rit meet nu dus iets anders dan er in de tabel staat.' };
        return { staat: 'LET OP', detail: 'geen opdracht uitgevoerd: ' + r };
      }

      var h = PLOpdracht.herkomst() || {};
      var kop = '"' + o.naam + '"' + (h.id ? ' (' + h.id + ')' : '') + (o.reden ? ' — ' + o.reden : '');

      // De sensoren van de opdracht moeten aan hebben gestaan; staat er een
      // pas nú bij, dan is er deze rit over die PID niets gemeten en zegt de
      // proef dat in plaats van een leeg getal te melden.
      var laat = PLOpdracht.zetSensoren();

      var uitslagen = o.proeven.map(function (p) {
        var u = PLOpdracht.meet(p);
        return { naam: p.naam, issue: p.issue, staat: u.staat, detail: u.detail };
      });

      // DE TERUGWEG. Elke uitslag apart naar de live-log, met de naam van de
      // opdracht erbij, zodat de tabel buiten de app leesbaar blijft zonder
      // dit verslag ernaast.
      uitslagen.forEach(function (u) {
        _liveSchrijf(u.staat === 'FOUT' ? 'error' : (u.staat === 'ok' ? 'info' : 'opvallend'),
          'opdracht ' + o.naam + ' — ' + u.naam + ': ' + u.staat + ' — ' + u.detail,
          { Outcome: u.staat, Repro: u.issue || '' });
      });

      var fout = uitslagen.filter(function (u) { return u.staat === 'FOUT'; });
      var letop = uitslagen.filter(function (u) { return u.staat === 'LET OP'; });
      var staart = uitslagen.map(function (u) { return u.naam + ': ' + u.detail; }).join(' | ');
      var laatst = laat.length ? ' [' + laat.join(', ') + ' stond(en) niet aan en zijn nu pas aangezet — over deze rit zeggen ze niets]' : '';

      if (!o.proeven.length)
        return { staat: 'LET OP', detail: kop + ' — de opdracht draagt geen proeven, dus er valt hier niets te toetsen. ' +
          'De sensoren en de vragen zijn wel gezet.' + laatst };

      if (fout.length)
        return { staat: 'FOUT', detail: kop + ' — ' + fout.length + ' van de ' + uitslagen.length + ' buiten de band: ' + staart + laatst };
      if (letop.length)
        return { staat: 'LET OP', detail: kop + ' — ' + letop.length + ' van de ' + uitslagen.length + ' niet te meten: ' + staart + laatst };
      return { staat: 'ok', detail: kop + ' — alle ' + uitslagen.length + ' binnen de band: ' + staart + laatst };
    }
  },

  // ── blijft de meting in beeld als je wegschakelt? (#228, 17-09-2026) ──
  // De split-screenproef van vanavond wees zichtbaarheid aan als de trekker:
  // zichtbaar en niet vooraan liep de lus 99 s door zonder één gat, verborgen
  // viel hij na ~60 s stil. Picture-in-picture houdt de WebView zichtbaar, en
  // dat is wat deze ronde erbij is gekomen.
  //
  // Het VENSTER zelf kan deze proef niet aanzetten — dat mag alleen op het
  // moment dat de gebruiker wegschakelt, en dat moment is hier niet. Wat hij
  // wél kan is de stille fout vangen die eromheen zit: de app denkt dat de
  // vlag aanstaat en de native kant houdt iets anders vast. Dan gebeurt er bij
  // het wegschakelen niets, en niets zegt waarom.
  {
    issue: '#228',
    naam: 'De meting blijft in beeld: app en schil houden dezelfde vlag vast',
    waarom: 'PiP wordt aangevraagd door de native kant op een moment dat JavaScript niet kan halen. Staat daar een andere vlag dan de app denkt, dan valt de meetlus stil zoals voorheen en is er geen enkel spoor.',
    proef: async function () {
      if (!window.PLPip || typeof PLPip.besluit !== 'function')
        return { staat: 'FOUT', detail: 'PLPip ontbreekt — de meting valt dan stil zodra je wegschakelt, precies zoals vóór #228' };

      var b = PLPip.besluit(PLPip.feiten());

      // Uitgezet in de Config is een besluit van een mens en geen storing.
      if (b.sleutel === 'uit')
        return { staat: 'LET OP', detail: 'picture-in-picture staat uit in de Config (`feat_pip`) — ' +
          'de app gaat bij wegschakelen gewoon naar de achtergrond en de meetlus valt na ~60 s stil (#228). Dat is hier een keuze, geen fout.' };

      if (!PLPip.beschikbaar())
        return { staat: 'LET OP', detail: 'deze schil heeft geen picture-in-picture — browser, PWA of een APK van vóór deze ronde. ' +
          'Het besluit zegt: ' + b.reden };

      var st = null;
      try { st = await PLPip.status(); }
      catch (e) { return { staat: 'FOUT', detail: 'de schil antwoordt niet op de PiP-status: ' + ((e && e.message) || e) }; }
      st = st || {};

      if (!st.ondersteund)
        return { staat: 'LET OP', detail: 'dit toestel of deze Android-versie kent picture-in-picture niet (nodig: Android 8+ met de systeemfunctie). ' +
          'Dan blijft voor #228 alleen een native meetlus over.' };

      // DE STILLE BREUK. De app heeft een besluit genomen en náár native
      // gestuurd; houdt native iets anders vast, dan is die vlag onderweg
      // blijven hangen. Alles blijft werken, er komt geen melding, en het
      // enige wat je merkt is dat het venster niet opkomt — tijdens een rit,
      // als je er niet naar kijkt.
      if (!!st.gewenst !== !!b.aan)
        return { staat: 'FOUT', detail: 'de app besloot "' + (b.aan ? 'aan' : 'uit') + '" (' + b.reden + ') ' +
          'maar de schil houdt "' + (st.gewenst ? 'aan' : 'uit') + '" vast — de vlag is niet aangekomen, ' +
          'dus bij wegschakelen gebeurt er iets anders dan de app denkt (#228)' };

      if (b.aan)
        return { staat: 'ok', detail: 'PiP staat scherp: er wordt gemeten en de schil weet het. ' +
          'Schakel je nu weg, dan blijft het kleine venster in beeld en loopt de lus door. ' +
          'Dat dit ook werkelijk zo is, is een vraag voor de rit — hier staat alleen dat beide kanten hetzelfde vasthouden.' };

      return { staat: 'LET OP', detail: 'PiP staat klaar maar is nu niet gewenst: ' + b.reden +
        '. App en schil zijn het eens, dus de keten is heel — er is alleen niets te meten.' };
    }
  },

  // ── komt de live-log werkelijk aan? (#235, 17-09-2026) ──
  // Het live-pad is op 17-09 opgeleverd en dezelfde avond nagemeten aan de
  // andere kant van de lijn: de logtabel telde 722 regels en NUL daarvan
  // kwam van een testrun. Gewone regels kwamen wél binnen ("Data stabiel",
  // 18:44), dus het kanaal deed het en de testrun kwam er niet doorheen.
  //
  // Waarom dat kon blijven staan: flushAirtable() meldde een mislukte batch
  // alleen met console.warn — op een telefoon, tijdens een rit, waar niemand
  // bij kan. De run zag niets, het verslag zei niets, en wie meekeek zag een
  // lege tabel zonder te weten of er niets gemeten was of niets aangekomen.
  //
  // Deze proef toetst het enige dat van binnenuit te toetsen is: zet een
  // regel in de buffer, dwing de verzending af, en vraag wat de Worker
  // antwoordde. Wat hij NIET bewijst staat in de uitslag zelf — zie de
  // tekst bij 'ok'.
  {
    issue: '#235',
    naam: 'De live-log komt werkelijk aan bij Airtable',
    waarom: 'Een kanaal dat stil faalt is erger dan geen kanaal: je leest een lege tabel als "niets bijzonders" terwijl er niets is aangekomen. Op 17-09 was dat precies de toestand.',
    proef: async function () {
      if (typeof logToSheets !== 'function')
        return { staat: 'FOUT', detail: 'logToSheets ontbreekt — de testrun schrijft dan niets meer weg en niemand kan tijdens de rit meekijken (#235)' };
      if (typeof plLiveLogStatus !== 'function')
        return { staat: 'FOUT', detail: 'plLiveLogStatus ontbreekt — dan is de uitkomst van een verzending weer onzichtbaar en is dit precies de toestand van 17-09' };
      if (typeof flushAirtable !== 'function')
        return { staat: 'FOUT', detail: 'flushAirtable ontbreekt — de buffer loopt dan vol zonder dat er ooit iets verstuurd wordt' };
      if (typeof AIRTABLE_URL === 'undefined' || !AIRTABLE_URL)
        return { staat: 'LET OP', detail: 'er is geen logadres ingesteld (AIRTABLE_URL leeg) — het kanaal is hier niet te toetsen. Dat is geen fout van de meting maar een ontbrekende voorwaarde.' };

      // De uitkomst van vóór deze proef onthouden: zonder dat zou een oude
      // geslaagde verzending van tien minuten geleden deze proef groen maken.
      var voor = plLiveLogStatus();

      if (!_liveSchrijf('info', 'blok 5: proefregel — komt de live-log aan?'))
        return { staat: 'FOUT', detail: 'de proefregel kwam niet eens in de buffer — logToSheets weigerde hem, en dan gaat er tijdens een rit ook niets weg' };

      // logToSheets() is async (het pseudonimiseren van de VIN duurt een tick)
      // en wordt bewust niet afgewacht door de aanroeper. Even ruimte geven,
      // anders is de buffer nog leeg als de verzending wordt afgedwongen.
      await _wacht(300);
      try { await flushAirtable(); } catch (e) {
        return { staat: 'FOUT', detail: 'flushAirtable wierp een fout in plaats van hem vast te leggen: ' + ((e && e.message) || e) };
      }

      // Was de buffer net door de eigen timer geleegd, dan komt de uitslag van
      // díé verzending — vandaar wachten op een uitkomst die nieuwer is dan
      // wat er bij binnenkomst stond, en niet op de eerste de beste.
      var na = plLiveLogStatus(), gewacht = 0;
      while ((!na || (voor && na.tijd === voor.tijd)) && gewacht < 5000) {
        await _wacht(200); gewacht += 200; na = plLiveLogStatus();
      }
      if (!na || (voor && na.tijd === voor.tijd))
        return { staat: 'FOUT', detail: 'de proefregel staat in de buffer maar er kwam binnen ' +
          Math.round((gewacht + 300) / 100) / 10 + ' s geen enkele uitslag terug — er wordt dus niets verstuurd' };

      if (na.ok)
        return { staat: 'ok', detail: 'de Worker nam ' + na.aantal + ' regel(s) aan (HTTP ' + na.status + '). ' +
          'Dat is bewijs dat de lijn er is, niet dat de regel in de tabel staat: wat Airtable met een onbekende veldnaam doet zie je pas dáár.' };

      if (na.status === 401 || na.status === 403)
        return { staat: 'LET OP', detail: 'de Worker weigerde de regel (HTTP ' + na.status + ') — geen geldig app-token in deze sessie. ' +
          'Dat is een ontbrekende voorwaarde en geen kapot kanaal; log in en draai dit blok opnieuw.' };

      return { staat: 'FOUT', detail: 'de live-log komt niet aan: ' +
        (na.status ? 'HTTP ' + na.status : 'netwerkfout') + (na.fout ? ' — ' + na.fout : '') +
        '. ' + na.aantal + ' regel(s) staan terug in de buffer; tijdens een rit ziet niemand daar iets van.' };
    }
  },

  // ── klopt de aandrijfbalk met wat de sensoren zeggen? ──
  // De balk bovenin de Live-weergave zegt in één regel wat de auto doet. Dat
  // leest als een feit, dus hij moet het waar kunnen maken uit de waarden die
  // op datzelfde moment binnenkomen. test-aandrijving.js toetst de
  // toestandsmachine op verzonnen monsters; dit toetst hem op een echte auto,
  // en vergelijkt bovendien wat de MODULE zegt met wat er in de DOM staat.
  //
  // Zonder bevinding is de opbrengst de waarneming zelf: die regel is precies
  // wat de rit moet opleveren voor de i-stop-vraag van deze CX-5 — is er een
  // start/stop-stop gezien, en wat deed 011F daarbij.
  {
    issue: '§11',
    naam: 'De aandrijfbalk beweert niets dat de meetwaarden niet dragen',
    waarom: 'Een toestandsregel bovenin het scherm leest als een feit. Zegt hij "start/stop actief" terwijl de motor draait, dan is alles eronder ook verdacht.',
    proef: function () {
      if (!window.PLAandrijving || !window.PLAandrijfbalk)
        return { staat: 'FOUT', detail: 'PLAandrijving of PLAandrijfbalk ontbreekt \u2014 de balk is niet geladen' };
      var r = PLAandrijving.laatste();
      if (!r) return { staat: 'LET OP', detail: 'nog geen aandrijfstand \u2014 updateEVMode() is nog niet langsgekomen' };

      var D = PLAandrijving.drempels, fout = [];
      var rpm = (typeof pidVals !== 'undefined') ? pidVals['010C'] : undefined;
      var spd = (typeof pidVals !== 'undefined') ? pidVals['010D'] : undefined;

      if ((r.toestand === 'DRAAIT_STIL' || r.toestand === 'DRAAIT_RIJDT') && rpm !== undefined && rpm <= D.rpmUit)
        fout.push('toont "' + r.label + '" bij ' + rpm + ' tpm');
      if ((r.toestand === 'STARTSTOP' || r.toestand === 'UIT_VOOR_START') && rpm !== undefined && rpm >= D.rpmAan)
        fout.push('toont "' + r.label + '" terwijl de motor op ' + rpm + ' tpm draait');
      if (r.toestand === 'ACCU_RIJDT' && spd !== undefined && spd < D.vStil)
        fout.push('toont "rijdt op accu" bij ' + spd + ' km/h');
      if (r.toestand === 'STARTSTOP' && !r.heeftGedraaid)
        fout.push('toont start/stop terwijl de motor deze sessie nooit gedraaid heeft');

      var el = document.getElementById('aandrijfBalk');
      if (!el) fout.push('het element aandrijfBalk staat niet in de pagina');
      else if (el.getAttribute('data-toestand') && el.getAttribute('data-toestand') !== r.toestand)
        fout.push('het scherm toont ' + el.getAttribute('data-toestand') + ' terwijl de module ' + r.toestand + ' zegt');

      if (fout.length) return { staat: 'FOUT', detail: fout.join('; ') };

      var d = 'nu: ' + r.label + ' (' + r.zekerheid + ')' +
        ', motor heeft gedraaid: ' + (r.heeftGedraaid ? 'ja via ' + r.bronGedraaid : 'nee') +
        ', 011F: ' + (r.looptijd === null || r.looptijd === undefined ? 'niet beschikbaar' : r.looptijd + ' s') +
        ', hybride bewezen: ' + (r.bewijstHybride ? 'ja' : 'nee');
      if (r.toestand === 'STARTSTOP') return { staat: 'ok', detail: 'START/STOP GEZIEN \u2014 ' + d };
      return { staat: 'LET OP', detail: d + '. Een start/stop-stop is deze sessie nog niet waargenomen \u2014 dat vraagt stilstand met een warme motor.' };
    }
  },

  // \u2500\u2500 weet deze auto volgende rit nog wat hij liet zien? (#225) \u2500\u2500
  // De aandrijfstatus hierboven is een SESSIElaag: bij elke herverbinding
  // begint hij terecht op nul, want "de motor heeft gedraaid" zegt niets over
  // de volgende rit. Maar "deze auto HEEFT start/stop" is geen eigenschap van
  // de meting \u2014 die verandert nooit, en werd tot vandaag toch elke sessie
  // weggegooid. Dat is de reden dat het meetcontextvenster die vraag elke keer
  // opnieuw stelde.
  //
  // test-waarneming.js toetst het register en de promotie op verzonnen
  // monsters. Wat daar niet te maken is, is een ECHTE auto met een echte
  // sleutel en een echte opslag: of `vehicleInfo` op tijd een VIN draagt, of
  // localStorage op dit toestel werkt, en of de waarneming van vorige week er
  // nog staat. Dat is precies wat hier gemeten wordt.
  {
    issue: '#225',
    naam: 'Wat deze auto liet zien, weet hij volgende rit nog',
    waarom: 'Een eigenschap van de auto die als eigenschap van de meting bewaard wordt, is elke sessie opnieuw een vraag aan de gebruiker \u2014 vlak v\u00f3\u00f3r een betaalde analyse.',
    proef: function () {
      if (!window.PLWaarneming || typeof PLWaarneming.lees !== 'function')
        return { staat: 'FOUT', detail: 'PLWaarneming ontbreekt \u2014 dan begint elke sessie weer op nul en komt de start/stop-vraag elke rit terug (#225)' };

      var w = PLWaarneming.lees('startstop');
      var stand = (window.PLAandrijving && typeof PLAandrijving.laatste === 'function') ? PLAandrijving.laatste() : null;

      // DE STILLE BREUK. De sessie heeft de stop gezien en het register weet
      // het niet: dan is de promotie in tik() eruit gevallen. Alles blijft
      // werken, de balk klopt, en het enige wat je merkt is dat de vraag
      // volgende rit terug is \u2014 en dat merk je pas volgende rit.
      if (stand && stand.startStopGezien && w.status !== 'gezien')
        return { staat: 'FOUT', detail: 'de sessie zag een start/stop-stop maar het register staat op "' + w.status +
          '" \u2014 de promotie van sessie naar auto is eruit gevallen (#225)' };

      var sleutel = PLWaarneming.sleutel();
      var waar = !sleutel ? 'nog geen auto herkend (geen VIN en geen merk), dus dit blijft bij deze sessie'
        : (w.reikwijdte === 'auto' ? 'vastgelegd bij deze auto' : 'de opslag doet het niet \u2014 het blijft bij deze sessie');

      if (w.status === 'gezien') {
        var b = w.bewijs || {};
        return { staat: 'ok', detail: 'start/stop: GEZIEN op ' + new Date(w.wanneer).toLocaleString('nl-NL') +
          ' (' + (w.bron || 'onbekende bron') + ')' +
          (b.looptijd != null ? ', 011F ' + b.looptijd + ' s' : '') +
          (b.rpm != null ? ', ' + b.rpm + ' tpm' : '') + ' \u2014 ' + waar +
          '. Het venster stelt hier "ja" voor, ook als deze rit geen stop oplevert.' };
      }
      if (w.status === 'weerlegd')
        return { staat: 'ok', detail: 'start/stop: door de gebruiker weerlegd op ' + new Date(w.wanneer).toLocaleString('nl-NL') +
          ' \u2014 ' + waar + '. Een nieuwe waarneming van n\u00e1 dat moment wint alsnog.' };

      return { staat: 'LET OP', detail: 'over start/stop is op deze auto nog niets vastgelegd \u2014 ' + waar +
        '. Niet-weten is hier de juiste uitkomst: niets-zien bewijst niet dat de auto het niet heeft. Sta \u00e9\u00e9n keer stil met een warme motor en dit vult zichzelf.' };
    }
  },

  // ── wijst "Welk onderdeel?" alleen sensoren aan die écht zwijgen? ──
  // Gemeld met een schermafdruk erbij: brandstofpeil en afstand-met-MIL-aan
  // als "sterke aanwijzing — draadbreuk, stekker of sensor", op een auto waar
  // niets mis mee was. De oorzaak was een vaste drempel van 8 seconden over
  // sensoren die elke 60 seconden aan de beurt komen.
  //
  // test-onderdeel.js toetst die scheiding op verzonnen data. Wat daar niet
  // te maken is, is een échte pollronde met een échte bus eronder: wie er
  // wanneer aan de beurt was, hoeveel de bus stilstond voor een sweep, en
  // welke sensor deze auto werkelijk traag levert. Daarom deze proef, en
  // daarom draait hij op wat de app op dít moment zegt.
  //
  // Hij toetst geen broncode maar de uitkomst: elke sensor die de module als
  // uitgevallen aanwijst moet volgens het scheduler-register gevraagd zijn
  // zónder antwoord. Kan de module dat niet waarmaken, dan staat er een valse
  // verdenking op het scherm en is dat een FOUT — ook al draait alles verder.
  {
    issue: '§11',
    naam: 'Welk onderdeel wijst geen sensor aan die alleen op zijn beurt wacht',
    waarom: 'Deze tekst stuurt iemand naar de garage. Een sensor die binnen zijn eigen meettempo zwijgt is niet kapot.',
    proef: function () {
      if (!window.PLOnderdeel) return { staat: 'FOUT', detail: 'PLOnderdeel ontbreekt — het paneel is niet geladen' };
      var mist = ['stilteBeeld', 'beoordeel', 'railTreffers', 'dtcBron'].filter(function (k) {
        return typeof PLOnderdeel[k] !== 'function';
      });
      if (mist.length) return { staat: 'FOUT', detail: 'PLOnderdeel mist ' + mist.join(', ') };

      var b = PLOnderdeel.stilteBeeld();
      if (!b.register)
        return { staat: 'LET OP', detail: 'geen cadansregister (PLSched) — de module zwijgt dan over uitval, en dat is de bedoeling' };

      var S = window.PLSched, R = PLOnderdeel.cadansRegels(), fout = [];
      b.stil.forEach(function (x) {
        if (PLOnderdeel.tellers.has(x.pid))
          { fout.push(x.pid + ' is een teller van de ECU, geen sensor'); return; }
        var drempel = Math.max(R.min, S.interval(x.pid) * R.factor);
        var pog = S.laatstePoging(x.pid) || 0, ok = S.laatsteSucces(x.pid) || 0;
        if (!(S.dood(x.pid) || (pog > 0 && (pog - ok) > drempel * 0.5)))
          fout.push(x.pid + ' is aangewezen terwijl er sinds het laatste antwoord niet naar gevraagd is');
        if (x.stilMs <= drempel)
          fout.push(x.pid + ' is aangewezen na ' + Math.round(x.stilMs / 1000) + ' s stilte terwijl zijn eigen tempo ' +
            Math.round(drempel / 1000) + ' s toelaat');
      });
      if (fout.length)
        return { staat: 'FOUT', detail: 'valse verdenking: ' + fout.join('; ') };

      // De foutcodekant. Tot 16-09 las deze module een bron die niet bestaat
      // (window._laatsteDTC), en dan staat er nooit iets — precies het soort
      // stilte dat je niet ziet.
      var bron = PLOnderdeel.dtcBron();
      var echt = (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes)) ? dtcCodes.length : null;
      if (echt !== null && bron.codes.length !== echt)
        return { staat: 'FOUT', detail: 'de module ziet ' + bron.codes.length + ' foutcodes terwijl de app er ' +
          echt + ' heeft — de DTC-bron is weer losgeraakt' };

      var verdacht = PLOnderdeel.beoordeel();
      var deel = verdacht.length ? (' Kandidaten: ' + verdacht.map(function (r) { return r.naam; }).join(', ') + '.') : '';
      return { staat: 'OK', detail: b.stil.length + ' als uitgevallen aangewezen, ' + b.levend.length +
        ' binnen hun tempo, ' + b.wacht.length + ' nog niet aan de beurt, ' + b.tellers.length +
        ' tellers overgeslagen, ' + PLOnderdeel.railTreffers().length + ' railtreffers.' +
        ' Foutcodes ' + (bron.gescand ? 'gelezen (' + bron.codes.length + ')' : 'nog niet uitgelezen') + '.' + deel };
    }
  },

  // ── #217: wat deed de boordspanning deze rit? ──
  // Na ritten met de goedkope kloon stonden er vier storingen tegelijk in de
  // auto (DSC, keyless, SCBS, parkeerrem). Vier onafhankelijke modules die
  // tegelijk klagen is het beeld van ONDERSPANNING en niet van een verstoorde
  // bus \u2014 en dan is dit de meting die het uitmaakt. Eén rit met deze proef
  // erin sluit #217, of laat zien dat de spanning het niet was.
  //
  // Twee bronnen, in die volgorde. Staat 0142 aangevinkt, dan komt het uit
  // PLRit.per() \u2014 dezelfde bron als blok 14, zodat er geen tweede telling
  // ontstaat. Staat hij niet aangevinkt (het normale geval: niemand zet de
  // accuspanning in zijn selectie), dan pakt de waakronde hem op en leest
  // deze proef PLWaak.historie(). Dat is precies waar die historie voor is.
  //
  // De grenzen komen uit PID_LET_OP en de PID-definitie, niet uit deze proef.
  // Een eigen tabel hier zou bewijzen over een geval dat niet bestaat \u2014 dat
  // is de fout die test-waakronde.js in zijn voorganger vond.
  {
    issue: '#217',
    naam: 'De boordspanning bleef binnen het laadbereik',
    waarom: 'Vier modules tegelijk in storing wijst op onderspanning; alleen een rit met een echte accu en dynamo meet dat.',
    proef: function () {
      var laag = null, hoog = null;
      try {
        var L = window.PID_LET_OP && window.PID_LET_OP['0142'];
        if (L) { laag = L.min; hoog = L.max; }
      } catch (e) { console.warn('PID_LET_OP onleesbaar bij de #217-proef', e); }
      if (laag === null)
        return { staat: 'FOUT', detail: 'PID_LET_OP["0142"] ontbreekt \u2014 dan is er geen laadbereik om tegen te toetsen' };

      var min, max, n = 0, bron = '';

      // 1. Aangevinkt? Dan telt blok 14 hem al mee.
      try {
        var e = (window.PLRit && PLRit.per) ? (PLRit.per() || {})['0142'] : null;
        var m = e ? _meetStand(e) : null;
        if (m && m.stand === 'gemeten') {
          min = e.min; max = e.max; n = e.n; bron = 'ritbeeld, ' + m.tekst;
        }
      } catch (e2) { console.warn('ritbeeld onleesbaar bij de #217-proef', e2); }

      // 2. Niet aangevinkt? Dan heeft de waakronde hem gelezen.
      if (min === undefined) {
        try {
          var h = (window.PLWaak && PLWaak.historie) ? PLWaak.historie() : [];
          var r = h.filter(function (x) { return x.pid === '0142'; })[0];
          if (r && typeof r.min === 'number') {
            min = r.min; max = r.max; n = r.n;
            bron = 'waakronde, ' + r.n + ' meting(en)';
          }
        } catch (e3) { console.warn('waakronde-historie onleesbaar bij de #217-proef', e3); }
      }

      if (min === undefined)
        return { staat: 'LET OP', detail: 'de boordspanning (0142) is deze rit niet gemeten \u2014 vink hem aan, ' +
          'of zet de waakronde aan, anders blijft #217 onbeantwoord' };

      var tekst = min + '\u2013' + max + ' V (' + bron + '), normaal is ' + laag + '\u2013' + hoog + ' V';

      // Onder de ondergrens is precies het beeld dat bij #217 hoort. Dat is
      // hier een BEVINDING en geen fout in de app: de app meet goed, de auto
      // doet iets. Vandaar LET OP met de uitleg erbij en niet FOUT.
      if (min < laag)
        return { staat: 'LET OP', detail: tekst + ' \u2014 de spanning zakte onder het laadbereik. ' +
          'Dat is het beeld waar #217 naar zoekt: te weinig spanning verklaart vier modules die tegelijk ' +
          'een storing vastleggen. Kijk of de storingen terugkomen zonder adapter in de stekker.' };
      if (max > hoog)
        return { staat: 'LET OP', detail: tekst + ' \u2014 de spanning liep boven het laadbereik uit; ' +
          'dat wijst eerder op de spanningsregelaar dan op de adapter (#217)' };

      return { staat: 'OK', detail: tekst + ' \u2014 binnen bereik over ' + n +
        ' meting(en); onderspanning is hiermee g\u00e9\u00e9n verklaring voor de storingen uit #217' };
    }
  },

  // ── kan de waakronde vertellen wat ze gemeten heeft? ──
  // De strook boven het raster toont de ronde die nú loopt; _lijst wordt bij
  // elke nieuweRonde() weggegooid. Tot 16-09 was dat álles wat er was, en dus
  // was "welke sensor lag drie rondes geleden buiten bereik" onbeantwoordbaar.
  // De historie is er sindsdien, maar die leeft in de draaiende app en niet in
  // de repo: alleen een rit kan zeggen of hij ook echt vult. Deze proef kijkt
  // niet of er iets ín staat (op een koude start hoort dat leeg te zijn) maar
  // of de haken bestaan en de vorm klopt — dat is wat het waakvenster nodig
  // heeft en wat stilletjes kan breken bij een wijziging aan PLWaak.
  {
    issue: '§11',
    naam: 'De waakronde geeft zijn sessiehistorie door',
    waarom: 'Het waakvenster leest PLWaak.historie(); breekt die vorm, dan staat het scherm leeg zonder foutmelding.',
    proef: function () {
      if (!window.PLWaak)   return { staat: 'FOUT', detail: 'PLWaak ontbreekt' };
      if (!window.PLWaakUI) return { staat: 'FOUT', detail: 'PLWaakUI ontbreekt — het waakvenster is niet geladen' };
      var mist = ['historie', 'ronde', 'sinds', 'lijst'].filter(function (k) {
        return typeof PLWaak[k] !== 'function';
      });
      if (mist.length)
        return { staat: 'FOUT', detail: 'PLWaak mist ' + mist.join(', ') + ' — het waakvenster kan niets tonen' };

      var h = PLWaak.historie();
      if (!Array.isArray(h)) return { staat: 'FOUT', detail: 'historie() gaf geen lijst terug' };

      // lijst() moet reden en tijd dragen; tot 16-09 deed hij dat niet en was
      // niet te zien WAAROM iets een bevinding was.
      var l = PLWaak.lijst();
      if (l.length && !('reden' in l[0] && 'tijd' in l[0]))
        return { staat: 'FOUT', detail: 'lijst() draagt geen reden/tijd — bevindingen zijn dan niet te duiden' };

      if (!h.length)
        return { staat: 'LET OP', detail: 'historie is leeg — de waakronde heeft deze sessie nog niets gemeten' +
          (PLWaak.actief() ? ' (hij staat wel aan; de eerste groep komt na ~12 s)' : ' (hij staat uit)') };

      var stuk = h.filter(function (r) { return !r.pid || typeof r.n !== 'number'; });
      if (stuk.length) return { staat: 'FOUT', detail: stuk.length + ' historieregels missen pid of telling' };

      var bev = h.filter(function (r) { return r.staat === 'let'; });
      return { staat: 'OK', detail: h.length + ' sensoren in de historie over ' + PLWaak.ronde() +
        ' rondes, ' + bev.length + ' nu buiten bereik' };
    }
  },

  // ── kan de bulk-analyse de opname terugvinden? ──
  // PLBulk schreef tot 16-09 alleen wég. Het leesluik (PLBulk.lees) is nieuw en
  // is het enige pad naar de opslag; valt dat om, dan staat het analysevenster
  // met een lege lijst zonder dat iemand het merkt. Een rit is de enige plek
  // waar er echt data in IndexedDB staat om dat op te toetsen.
  {
    issue: '§11',
    naam: 'De bulk-opname is terug te lezen en te analyseren',
    waarom: 'Zonder werkend leesluik toont de analyse een lege rit in plaats van een fout.',
    proef: async function () {
      if (!window.PLBulk)   return { staat: 'FOUT', detail: 'PLBulk ontbreekt' };
      if (!window.PLBulkUI) return { staat: 'FOUT', detail: 'PLBulkUI ontbreekt — het analysevenster is niet geladen' };
      if (typeof PLBulk.lees !== 'function')
        return { staat: 'FOUT', detail: 'PLBulk.lees ontbreekt — de analyse heeft geen pad naar de opslag' };
      if (typeof PLBulkUI._analyseer !== 'function')
        return { staat: 'FOUT', detail: 'PLBulkUI._analyseer ontbreekt' };

      var blokken;
      try { blokken = await PLBulk.lees(); }
      catch (e) { return { staat: 'FOUT', detail: 'lezen mislukt: ' + (e && e.message || e) }; }
      if (!Array.isArray(blokken)) return { staat: 'FOUT', detail: 'lees() gaf geen lijst terug' };
      if (!blokken.length)
        return { staat: 'LET OP', detail: 'geen opname in de opslag — de recorder heeft deze telefoon nog niet gedraaid' };

      var regels = [];
      blokken.forEach(function (b) { (b.regels || []).forEach(function (r) { regels.push(r); }); });
      if (!regels.length) return { staat: 'FOUT', detail: blokken.length + ' blokken zonder één regel erin' };

      var a = PLBulkUI._analyseer('proef', regels);
      if (a.regels !== regels.length)
        return { staat: 'FOUT', detail: 'analyse telde ' + a.regels + ' van ' + regels.length + ' regels' };

      var segs = Object.keys(a.segTel);
      if (!segs.length) return { staat: 'FOUT', detail: 'geen enkel segment herkend in ' + regels.length + ' regels' };

      var pidN = Object.keys(a.pids).length;
      return { staat: 'OK', detail: regels.length + ' regels over ' + blokken.length + ' blokken, ' +
        pidN + ' sensoren, ' + segs.length + ' segmentsoorten, ' + a.gaten + ' gatregels, ' +
        Math.round(a.afstandKm) + ' km' };
    }
  },

  // ── draagt de schil een pakketnaam die Play accepteert? ──
  // De inzending van 12-09 strandde op "Voer een geldige pakketnaam in". De
  // bouwketen bleek in orde; de naam zelf deugde niet. Er staan nu twee
  // poorten omheen (test-nativeschil.js en de bundelstap), maar allebei kijken
  // naar de BEDOELING in de repo. Dit is de enige plek die kijkt naar de schil
  // die op dit toestel staat te draaien — en dus de enige die kan zeggen of
  // deze rit op de nieuwe naam gemeten is of nog op de oude.
  //
  // De naam staat hier BEWUST niet letterlijk in. Dat zou een tweede waarheid
  // naast capacitor.config.json zijn, en dan is bij de volgende wijziging niet
  // te zien welke van de twee wint. Wat hier getoetst wordt is de vorm die
  // Play eist, plus dat de naam er überhaupt is.
  {
    issue: '§11',
    naam: 'De schil draagt een pakketnaam die Play accepteert',
    waarom: 'Alleen de draaiende schil weet zijn eigen pakketnaam; de repo kent alleen de bedoeling.',
    proef: function () {
      if (!window.PLSchil)
        return { staat: 'FOUT', detail: 'PLSchil ontbreekt — dan staat er geen schilgegeven in dit verslag' };
      var info = PLSchil.info();
      if (!info)
        return { staat: 'LET OP', detail: 'geen schilgegevens (' + PLSchil.reden() +
          ') — in een browser is er geen pakketnaam, dus hier valt niets te meten' };
      var id = info.id;
      if (!id)
        return { staat: 'FOUT', detail: 'App.getInfo() gaf geen id terug — een schil zonder pakketnaam bestaat niet' };
      var delen = String(id).split('.');
      var slecht = delen.filter(function (d) { return !/^[a-z][a-z0-9_]*$/.test(d); });
      if (delen.length < 2 || slecht.length)
        return { staat: 'FOUT', detail: 'pakketnaam "' + id + '" voldoet niet aan de vorm die Play eist' +
          (slecht.length ? ' (fout deel: ' + slecht.join(', ') + ')' : ' (minder dan twee delen)') +
          ' — deze schil komt niet door de upload' };
      return 'schil "' + id + '", build ' + (info.build || 'onbekend');
    }
  },

  // ── hoort de chip bij de rol die nu ingelogd is? ──
  // De fout van 29-08 in één zin: de chip werd getekend vóór de login en
  // daarna keek er niets meer naar. Een beheerder hield zo een chip die niet
  // bij hem hoort, met "tokens onbekend" erin. Deze proef kijkt naar de DOM
  // van dit moment — dat is de enige plek waar die vraag te beantwoorden is.
  {
    issue: '#52',
    naam: 'De tokenchip hoort bij de rol die nu ingelogd is',
    waarom: 'Alleen de DOM van dit moment laat zien of de chip bij de ingelogde rol hoort.',
    proef: function () {
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
    }
  },

  // ── neemt de teller het saldo van de server over? ──
  // De Worker stuurt het saldo na afboeking mee in X-PidLane-Saldo. PIDLANE.md
  // beschreef sinds juli dat apiFetch die uitleest — er las niemand, en de
  // teller liep dus op de schatting. Een échte call zou hier tokens kosten, dus
  // we voeren alleen de kop aan de module en zetten daarna terug wat er stond.
  {
    issue: '§8',
    naam: 'De tokenteller neemt het saldo van de server over',
    waarom: 'De kop X-PidLane-Saldo wordt hier aan de echte module gevoerd; een echte call zou tokens kosten.',
    proef: function () {
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
    }
  },

  // ── houdt de schil de betaalroute buiten Play dicht? ──
  // Tokens verkopen ín de app is precies wat Google's betaalregels raakt, en
  // die vraag is niet beantwoord (#42). Tot 10-09-2026 hing dat op één lege
  // Airtable-sleutel: wie `tikkie_kopen` vulde zette een koopknop in dezelfde
  // app die Play beoordeeld heeft, zonder commit en zonder build. Sinds die
  // dag houdt _betaallink() de link in de schil hoe dan ook tegen.
  //
  // Dit is de enige plek waar dat te méten valt. Een node-test draait zonder
  // Capacitor en met een lege PID_CONFIG: daar klopt de grens vanzelf, want er
  // is geen schil en er is geen link. Hier staan ze allebei echt.
  {
    issue: '#42',
    naam: 'Geen koopknop in de Play-schil, wat er ook in de Config staat (#42)',
    waarom: 'Alleen op een toestel staan de echte Config én de echte schil naast elkaar; in node ontbreken ze allebei en klopt de grens vanzelf.',
    proef: function () {
      if (!window.PLKlant) return { staat: 'FOUT', detail: 'PLKlant ontbreekt' };

      const schil = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      let ruw = '';
      try { ruw = String((window.PID_CONFIG || {}).tikkie_kopen || '').trim(); }
      catch (e) { return { staat: 'FOUT', detail: 'PID_CONFIG niet leesbaar, dus deze proef meet niets: ' + e.message }; }
      const link = PLKlant.CFG.tikkieKopen;

      if (schil && link)
        return { staat: 'FOUT', detail: 'de Play-schil toont een koopknop (' + String(link).slice(0, 40) + ') — ' +
          'de schilgrens in _betaallink() doet niets, en dan staat er een betaalroute buiten Play in een Play-app' };
      if (!schil && ruw)
        return { staat: 'FOUT', detail: 'er staat een koopknop in de browserversie (tikkie_kopen is gevuld) terwijl de eerste ' +
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
      const staart = 'de aanvraag gaat per mail' + (klant ? ' met het account erin' : ' (geen klant ingelogd, dus zonder account)');
      if (schil && ruw)
        return 'de Config draagt een koopknop en de schil geeft hem niet door — de grens is hier echt gemeten; ' + staart;
      if (schil)
        return { staat: 'LET OP', detail: 'geen koopknop, maar tikkie_kopen is leeg in de Config, dus de schilgrens is ' +
          'hier niet op de proef gesteld. Zet de sleutel tijdelijk in admin.html en draai deze blok opnieuw als je ' +
          'de grens wilt zien werken. ' + staart };
      return 'geen koopknop; ' + staart;
    }
  },

  // ── weigert de Worker een code zonder klantaccount? ──
  // De route stempelde de code eerst af en keek pas daarna of er een account
  // was om hem op bij te schrijven. Zonder account was de code verbrand en het
  // tegoed nergens. De app haakte daar zelf al op af, maar dat is een verzoek
  // en geen grens — deze proef praat dus met de echte Worker.
  //
  // De code hieronder bestaat niet en kan niet bestaan (hij draagt een stempel
  // van dit moment), dus er valt niets af te stempelen. Een beheerder hoort
  // 401 te krijgen, een klant 404: gevonden-niet.
  {
    issue: '#42',
    naam: 'De Worker weigert een code zonder klantaccount',
    waarom: 'De grens ligt in de Worker, niet in de app — dus praat deze proef met de echte Worker.',
    proef: async function () {
      if (typeof PROXY_URL === 'undefined' || !PROXY_URL)
        return { staat: 'LET OP', detail: 'geen PROXY_URL — niet te meten zonder Worker' };
      if (!window.APP_TOKEN)
        return { staat: 'LET OP', detail: 'geen sessietoken — log eerst in' };
      const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
      const code = 'PIDL-B5' + String(Date.now()).slice(-6);
      let r;
      try {
        r = await plFetch('/credits/redeem', { method: 'POST', json: { code: code } });
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
    }
  },

  // ── het abonnement dat niet bestaat ──────────────────
  // "Je bent ingelogd met een zakelijk account. Daarvoor gelden geen tokens —
  // analyses zitten in je abonnement." Dat abonnement bestaat niet: onder #49
  // is zo'n account personeel dat op de sleutel van de beheerder draait. De
  // tekst is op 29-08 vervangen; deze proef bewaakt dat hij niet terugkomt via
  // een andere weg, en dat het menu-item weg is voor wie geen klant is.
  {
    issue: '#49',
    naam: 'Nergens meer een abonnement beloofd aan personeel',
    waarom: 'Bewaakt dat de belofte van een abonnement niet via een andere weg terugkomt.',
    proef: function () {
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
    }
  },

  // ── meet blok 7 wat PLLoad doet? ──────────────
  // In node vergelijkt test-zonespiegel.js 2160 combinaties. Wat die test niet
  // kan zien is of de twee modules in DEZE app aan elkaar hangen: PLBudget zit
  // in pidlane-testrun.js en PLLoad in een ander bestand, en dat is precies het
  // soort verbinding dat bij #29 en #74 ontbrak zonder ooit een fout te geven.
  {
    issue: '#76',
    naam: 'Blok 7 leent de zoneregel bij PLLoad (#76)',
    waarom: 'Of PLBudget en PLLoad in DEZE app aan elkaar hangen, ziet test-zonespiegel.js niet.',
    proef: function () {
      if (!window.PLLoad || typeof PLLoad.zoneVan !== 'function')
        return { staat: 'FOUT', detail: 'PLLoad.zoneVan() ontbreekt — blok 7 kan de regel dan niet lenen en meldt "niet te bepalen"' };
      const sp = PLBudget.spoor().filter(function (m) { return !m.run; });
      if (!sp.length)
        return { staat: 'LET OP', detail: 'nog geen spoor — niet verbonden, of de app draait net' };
      let vorig = null, mis = 0, druk = 0;
      sp.forEach(function (m) {
        const a = PLBudget.zone(m, vorig);
        const b = PLLoad.zoneVan({ belasting: m.bezet, foutPct: m.fout, venGemMs: m.ms }, vorig, m.mult);
        if (a !== b) mis++;
        if (a === 'druk') druk++;
        vorig = m.ms;
      });
      if (mis)
        return { staat: 'FOUT', detail: mis + ' van de ' + sp.length + ' monsters krijgen van blok 7 een ander oordeel ' +
          'dan van PLLoad zelf — de spiegel loopt weer uit de pas (#76)' };
      return sp.length + ' monsters, elk oordeel gelijk aan dat van PLLoad; ' +
        Math.round(druk / sp.length * 100) + '% druk op dit moment';
    }
  },

  // ── klopt het verslag over zichzelf? ──
  // Drie kleine metingen die alleen in een lopende sessie iets betekenen: de
  // verbindingsteller, de tijdstempels in beide logs, en de geheugen-cap.
  {
    issue: '#75',
    naam: 'De run telt zijn eigen meldingen en verbindingen eerlijk',
    waarom: 'Verbindingsteller, tijdstempels en geheugen-cap betekenen alleen iets in een lopende sessie.',
    proef: function () {
      const uit = [];
      // #77 — een herverbinding zonder gat was tot vandaag de normale eerste
      // verbinding. Nu hoort dat een echte onderbreking te zijn.
      if (window.PLRit) {
        // Sinds #133 zijn er twee soorten gat, en deze regel moet ze allebei
        // kennen: op de rit van 10-09 stond het loopgat op 0 terwijl de adapter
        // 39 s weg was, en dan wees "zonder enig gat" je naar een heropstart.
        const hv = PLRit.herverbindingen(), g = PLRit.gaten().length;
        let mg = 0;
        try { mg = (PLRit.meetgaten ? (PLRit.meetgaten() || []) : []).length; }
        catch (e) { console.warn('PLRit.meetgaten() onleesbaar bij de #75-proef', e); }
        if (hv > 0 && g === 0 && mg === 0)
          uit.push('LET OP: ' + hv + ' herverbinding(en) zonder loopgat én zonder meetgat. Sinds #77 telt de eerste ' +
                   'verbinding niet meer mee, dus dit is er dan ook echt een — een socket die stierf en herstelde ' +
                   'tussen twee tikken, of de app is heropgestart');
        else uit.push(hv + ' herverbinding(en) bij ' + g + ' loopgat(en) en ' + mg + ' meetgat(en)');
      }
      // #75/#72 — de app-log moet dateerbaar zijn, anders telt de meldingenregel
      // in blok 11 altijd nul.
      const app = _appLogRegels();
      const zonderT = app.filter(function (l) { return typeof (l && l.t) !== 'number'; }).length;
      if (app.length && zonderT === app.length)
        return { staat: 'FOUT', detail: 'geen enkele app-logregel draagt een epoch-tijdstempel — dan telt ' +
          '"meldingen sinds het begin van deze run" structureel nul (#75)' };
      uit.push(app.length + ' app-logregels, waarvan ' + zonderT + ' zonder tijdstempel');
      // De afkapping moet zichtbaar zijn als hij is opgetreden.
      const weg = app.filter(function (l) { return /weggelaten \(geheugen-cap\)/.test((l && l.msg) || ''); }).length;
      uit.push(weg ? 'de app-log is afgekapt en zegt dat ook (#72)' : 'de app-log is nog niet tegen de cap gelopen');
      return uit.join('.  ');
    }
  },

  // ── kloppen de veilige zones op dit toestel? ──
  // Dit is de enige plek waar dit écht te meten valt: in een browser zijn
  // beide zones 0 en klopt álles. Op een toestel met een statusbalk en drie
  // knoppen komen de getallen pas uit elkaar. Vandaar meten en niet lezen.
  //
  // HET OORDEEL OVER DE ONDERRAND IS OP 10-09-2026 HERZIEN (#172). Hier stond
  // dat het "nog onbeslist" was of de melding klopte of de meting, en dat een
  // oog dat moest beslissen. Dat oog heeft gesproken: in de toestelronde van
  // 10-09 beoordeelde de bestuurder de onderrand met "Alles vrij — er valt
  // niets weg", terwijl deze proef in dezelfde sessie twee keer FOUT meldde
  // (41px en 46px). De melding klopte niet.
  //
  // De meting stelde de verkeerde vraag: of #appGrid binnen de vouw PAST, in
  // plaats van of een mens bij de onderste regel KAN. Op ≤760px krijgt .app
  // bewust height:auto en scrollt de pagina — dan is "loopt door tot onder de
  // balk" per definitie waar en per definitie betekenisloos. Zie
  // plOnderrandOordeel() voor de regel die er nu onder ligt.
  {
    issue: '#79',
    naam: 'De app past tussen de statusbalk en de navigatiebalk',
    waarom: 'In een browser zijn beide zones 0 en klopt alles; de getallen komen pas op een toestel uit elkaar.',
    proef: function () {
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
      const o = plOnderrandOordeel(onder, grens, _plScrollRestOnder(app));
      const zones = 'statusbalk ' + sat.toFixed(0) + 'px, navigatiebalk ' + sab.toFixed(0) + 'px';
      if (!o.ok) return { staat: 'FOUT', detail: zones + ' — ' + o.tekst + ' (issue #58)' };
      return zones + ' — ' + o.tekst +
             (sat + sab === 0 ? ' (browser: geen zones, dus deze proef zegt hier weinig)' : '');
    }
  },

  // ══════════════════════════════════════════════════════════════
  // OPLEVERING 02-09-2026 (tweede) — DE MEETKETEN MEET ZICHZELF
  //
  // §20 noemt dit als vierde punt op de lijst "wat er nog te automatiseren
  // valt": een blok dat aan het begin van een run naloopt of elke bron
  // bestaat en beweegt. #29, #74, #75 en #76 waren alle vier dezelfde fout —
  // een controle die zijn antwoord uit de verkeerde bron haalt en er tóch
  // een stellige conclusie op plakt.
  //
  // De drie proeven hieronder zijn de runtime-helft van test-parser.js. Die
  // node-test draait de parser in een sandbox met de echte tabellen; wat hij
  // niet kan zien is of dezelfde keten in de DRÁAIENDE app aan elkaar hangt.
  // Precies het gat waar #29 en #74 in vielen.
  //
  // Ze zijn alle drie gratis: er gaat geen commando naar de bus en geen
  // AI-call overheen. Er wordt gerekend op een antwoord dat hier ter plekke
  // verzonnen is.
  // ══════════════════════════════════════════════════════════════

  // ── leest de parser een bekend antwoord goed? ──
  {
    issue: '—',
    naam: 'De parser leest een bekend ELM-antwoord goed',
    waarom: 'De runtime-helft van test-parser.js: hangt de keten in de draaiende app aan elkaar?',
    proef: function () {
      if (typeof parsePID !== 'function')
        return { staat: 'FOUT', detail: 'parsePID() ontbreekt — dan komt er geen enkele meetwaarde binnen' };
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse() ontbreekt — dan valt een batch stil uit elkaar' };

      // 410C0A98 = 0x0A98 / 4 = 678 rpm. Eén nibble verschuiving geeft hier een
      // geldig maar verkeerd getal, en dát is de fout die je in een log niet ziet.
      const rpm = parsePID('010C', '410C0A98');
      if (rpm !== 678)
        return { staat: 'FOUT', detail: 'parsePID("010C","410C0A98") gaf ' + rpm + ' in plaats van 678 rpm — ' +
          'de header-echo wordt verkeerd overgeslagen en élke meting staat scheef' };

      const uit = splitBatchResponse('410C0A98 410D50 410584', ['010C', '010D', '0105']);
      const mist = ['010C', '010D', '0105'].filter(function (p) { return !uit || !uit[p]; });
      if (mist.length)
        return { staat: 'FOUT', detail: 'de batch-splitser verloor ' + mist.join(', ') +
          ' uit een antwoord waar ze alle drie in staan' };

      return 'parsePID leest 678 rpm en de batch levert alle drie de PIDs';
    }
  },

  // ── houdt laag 1 een onmogelijke waarde tegen? ──
  {
    issue: '—',
    naam: 'Laag 1 houdt een fysiek onmogelijke waarde tegen',
    waarom: 'Of de harde fysieke limiet ook in de draaiende app tussen parser en opslag staat.',
    proef: function () { return _zonderSporen('Laag 1', function () {
      if (typeof validateAndSmooth !== 'function')
        return { staat: 'FOUT', detail: 'validateAndSmooth() ontbreekt — dan loopt de meetketen zonder laag 1 t/m 3' };
      if (typeof PID_HARD_LIMITS === 'undefined' || !PID_HARD_LIMITS['0105'])
        return { staat: 'FOUT', detail: 'PID_HARD_LIMITS mist 0105 — laag 1 heeft dan geen meetlat' };

      // 300 °C koelwater kan niet. Komt dat er tóch doorheen, dan staat laag 1
      // uit en gaan onmogelijke waarden mee de AI-prompt in.
      if (validateAndSmooth('0105', 300) !== null)
        return { staat: 'FOUT', detail: 'koelwater van 300 °C werd geaccepteerd terwijl de harde limiet op ' +
          PID_HARD_LIMITS['0105'].max + ' staat — laag 1 filtert niet' };
      /* HERZIEN OP 10-09-2026 NA DE RIT VAN 12:41. Hier stond `!== 90`, en dat
         werd op die rit een FOUT met de tekst "laag 1 filtert te veel" —
         terwijl laag 1 de waarde gewoon doorliet en laag 3 hem middelde met de
         vorige koelwatermeting van de draaiende motor. De proef mat dus laag 3
         en wees de schuld aan laag 1 toe.

         Laag 3 is intussen weg, dus `!== 90` zou het nu weer doen. Toch blijft
         het bij deze vorm: de vraag van laag 1 ís null of niet-null, en een
         proef die precies vraagt wat zijn onderwerp beslist kan niet nog eens
         omvallen op iets dat een laag verderop gebeurt. Het exacte getal is de
         vraag van de meetgetrouwheidsproef hieronder. */
      const door = validateAndSmooth('0105', 90);
      if (door === null)
        return { staat: 'FOUT', detail: 'koelwater van 90 °C werd tegengehouden terwijl het binnen de meetlat ' +
          PID_HARD_LIMITS['0105'].min + '…' + PID_HARD_LIMITS['0105'].max + ' valt — laag 1 filtert te veel' };
      if (typeof door !== 'number' || !isFinite(door))
        return { staat: 'FOUT', detail: 'koelwater van 90 °C gaf ' + door + ' terug in plaats van een getal' };

      return 'laag 1 weigert 300 °C en laat 90 °C door (kwam er als ' + door + ' uit), meetlat ' +
        PID_HARD_LIMITS['0105'].min + '…' + PID_HARD_LIMITS['0105'].max;
    }); }
  },

  // ── blijft de meting van de auto de meting van de auto? ──
  // Hier stond een proef die toetste of laag 2+3 bereikbaar was. Die lagen zijn
  // op 10-09-2026 weggehaald, dus die vraag bestaat niet meer. Wat er voor in
  // de plaats komt is de omgekeerde vraag, en die is op een rit méér waard: komt
  // wat de ECU zei ook ongewijzigd bij de opslag aan?
  //
  // Waarom dat een rit nodig heeft en test-parser.js het niet kan: in node staat
  // er één functie met een verzonnen reeks eromheen. Hier draait de app met de
  // echte meetgeschiedenis van dít moment, en juist een reeks die er al staat
  // was wat een middeling zichtbaar maakte. Op de rit van 10-09 gaf de proef
  // hierboven een FOUT op laag 1 die in werkelijkheid laag 3 was.
  {
    issue: '#158',
    naam: 'De meting van de auto komt ongewijzigd bij de opslag aan',
    waarom: 'Alleen op een draaiende app staat er een echte meetreeks omheen — en juist een bestaande reeks maakte de middeling zichtbaar.',
    proef: function () { return _zonderSporen('Meetgetrouwheid', function () {
      if (typeof validateAndSmooth !== 'function')
        return { staat: 'FOUT', detail: 'validateAndSmooth() ontbreekt — dan loopt de meetketen zonder laag 1' };

      // 200 °C koelwater is opvallend (laag 1b meldt het) maar fysiek mogelijk,
      // dus het is een METING. Kwam er null uit, dan staat het spike-filter van
      // laag 2 terug — en dan boekt de meetlus dit als NO DATA van de ECU.
      const bewaar = (typeof pidVals !== 'undefined') ? pidVals['0105'] : undefined;
      let sprong, tweede;
      try {
        if (typeof pidVals !== 'undefined') pidVals['0105'] = 50;
        sprong = validateAndSmooth('0105', 200);
        tweede = validateAndSmooth('0105', 90);
      } finally {
        if (typeof pidVals !== 'undefined') {
          if (bewaar === undefined) delete pidVals['0105']; else pidVals['0105'] = bewaar;
        }
      }

      if (sprong === null)
        return { staat: 'FOUT', detail: 'validateAndSmooth("0105",200) gaf null terwijl 200 °C binnen ' +
          'de fysieke grenzen valt. Dan is het spike-filter terug, en de meetlus boekt zo\'n waarde ' +
          'als NO DATA van de ECU — niet te onderscheiden van een dode bus (#133)' };
      if (sprong !== 200)
        return { staat: 'FOUT', detail: 'validateAndSmooth("0105",200) gaf ' + sprong +
          ' in plaats van 200 — er zit weer een bewerking tussen de ECU en de opslag' };
      if (tweede !== 90)
        return { staat: 'FOUT', detail: 'de meting erna gaf ' + tweede + ' in plaats van 90. ' +
          'Dat is het gemiddelde van twee monsters: de middeling van laag 3 is terug, en dan slaat ' +
          'de app een waarde op die de sensor niet kán geven' };

      return 'twee metingen op een traag signaal (200 en 90 °C) komen allebei ongewijzigd terug — ' +
        'geen filter en geen middeling tussen de ECU en de opslag';
    }); }
  },

  // ════════════════════════════════════════════════════════════
  // DE RIT-OOGST (6.5) — kan er na DÍT logboek een issue dicht?
  //
  // WAAROM DIT BLOK BESTAAT. Vijf issues staan al weken op "wacht op een rit",
  // en er zijn intussen vier ritten geweest. Elke keer bleek achteraf dat er
  // één voorwaarde niet gehaald was: de caravan-tracker stond niet aan, er werd
  // vier minuten gereden in plaats van tien, of de PID stond niet in de
  // selectie. Dat stond dan verspreid over blok 4, 7 en 14 — nergens stond de
  // vraag die je eigenlijk had: is dit issue hiermee dicht te doen?
  //
  // Deze proeven meten daarom niets nieuws. Ze lezen de bronnen die er al zijn
  // (PLRit, PLBudget, PLBus, PLPidLen, PLBulk, de gate) en spreken één oordeel
  // uit per issue: SLUIT, of wat er precies ontbrak. Dat laatste is de helft
  // die tot nu toe miste — "onvoldoende" zonder reden is een verwijt, met reden
  // is een boodschappenlijstje voor de volgende rit.
  //
  // Ze zijn alle zes gratis: geen buscommando, geen AI-call.
  // ════════════════════════════════════════════════════════════

  // ── #19: bewegen 0123 en 0159 over een HELE rit, met de bus vol? ────
  // Blok 14 meet of ze bewogen. Wat daar niet staat is of de voorwaarden uit
  // het issue gehaald zijn — en zonder die twee helften naast elkaar is het
  // issue niet te sluiten. Dit is dus geen tweede meting maar het oordeel.
  {
    issue: '#19',
    naam: '#19 — raildruk over een hele rit, met alle aanvragers aan',
    waarom: 'Blok 14 meet of ze bewogen; hier staat of de voorwaarden uit het issue gehaald zijn.',
    proef: function () {
      if (!window.PLRit) return { staat: 'LET OP', detail: 'PLRit ontbreekt — geen ritbeeld' };
      let duur = 0, per = {};
      // Via window en niet via de closure-const, zodat test-blok5lijst.js hem
      // met een nagemaakte ritstand kan voeden. In de app is het hetzelfde
      // object; het verschil bestaat alleen buiten de browser.
      try { duur = window.PLRit.duurS(); per = window.PLRit.per() || {}; }
      catch (e) { return { staat: 'LET OP', detail: 'ritstand onleesbaar' }; }
      const aan = _aanvragersNu();
      // _meetStand() is dezelfde bron als blok 14 gebruikt. Bewust niet hier
      // opnieuw uitgerekend: "wanneer telt een PID als gemeten" is één regel, en
      // twee plekken met dezelfde regel is in dit project al drie keer een bug
      // geweest. Het verschil tussen 0, 1 en meer verversingen is precies wat
      // #74 liet zien.
      const rij = [], stil = [], blind = [];
      ['0123', '0159'].forEach(function (p) {
        const e = per[p], m = _meetStand(e);
        if (m.stand !== 'gemeten') { blind.push(p); rij.push(p + ': ' + m.tekst); return; }
        rij.push(p + ': ' + m.tekst + ', ' + (e.veranderingen || 0) + ' wijzigingen, ' + e.min + '–' + e.max);
        if (!e.veranderingen) stil.push(p);
      });
      const kop = rij.join('  |  ') + '  |  ' + Math.round(duur / 60) + ' min, ' + aan.length + ' aanvrager(s): ' + (aan.join(', ') || '—');

      /* DE TIEN MINUTEN ZIJN HIER OOK WEG (10-09-2026, #170).

         Deze proef eiste tien minuten én vier aanvragers. Sinds #166 sluit de
         rijstap op de OOGST en niet op de klok, en dat maakte deze lat op de
         rit van 10-09 onhaalbaar voor élke ronde: de meetrit viel af op
         "maar 7 min gereden van de tien", de toestelronde op "maar 3 van de 4
         aanvragers aan". Geen van beide rondes kan hem nog halen, en een proef
         die altijd LET OP staat wordt genegeerd — dat staat zo in CLAUDE.md.

         Wat overblijft is wat deze proef werkelijk moet zeggen: bewegen die
         twee sensoren, en onder welke omstandigheden is dat gemeten. Het
         aantal aanvragers blijft er als CONTEXT bij staan, want dat is wat de
         meting kleurt — maar het is geen lat meer die de proef laat zakken.
         #19 is bovendien dicht; wat hier nog toe doet is dat het antwoord
         waar blijft. */
      const tekort = [];
      if (blind.length) tekort.push(blind.join(' en ') + ' stond niet in de pollronde');
      if (stil.length && !blind.length)
        return { staat: 'LET OP', detail: kop + ' — ' + stil.join(' en ') + ' stond STIL terwijl hij wél werd uitgevraagd. ' +
          'Op directe inspuiting kan dat niet: dit is de kandidaat voor moetBewegen:\'draait\' uit PIDLANE-CONTRACT.md §4 (#19)' };
      if (tekort.length)
        return { staat: 'LET OP', detail: kop + ' — nog niets over te zeggen: ' + tekort.join('; ') };
      return kop + ' — allebei in beweging, gemeten en wel. Dat is het antwoord waar #19 om vroeg, ' +
        'en het aantal aanvragers hierboven zegt onder welke belasting het gemeten is';
    }
  },

  // ── #15: wat deden vier aanvragers met de bus? ──────────────
  // Het besluit gaat over één poort of vier. Dat is een ontwerpvraag, maar hij
  // is onbeslisbaar zonder te weten wat vier aanvragers op deze bus dóen — en
  // dat cijfer bestond nog niet, want er is nooit met vier gereden.
  {
    issue: '#15',
    naam: '#15 — wat vier aanvragers met de bus deden',
    waarom: 'De ontwerpvraag is onbeslisbaar zonder te weten wat vier aanvragers op deze bus doen.',
    proef: function () {
      const aan = _aanvragersNu();
      if (!window.PLBudget || !PLBudget.spoor) return { staat: 'LET OP', detail: 'PLBudget ontbreekt — geen spoor' };
      let sp = [];
      try { sp = (PLBudget.spoor() || []).filter(function (m) { return !m.run; }); } catch (e) { return { staat: 'LET OP', detail: 'pollbudget-spoor onleesbaar' }; }
      // DE ACHTERGRONDPAUZE ERUIT (02-09-2026). De run van 22:15 meldde
      // "responstijd gem 897 ms (hoogst 185785 ms)". Die 186 seconden is geen
      // bus maar de bevriezing uit stap 7: de meetlus stond 190 s stil en de
      // eerste meting daarna droeg die hele stilte als responstijd. #15 gaat
      // over wat vier aanvragers met de BUS doen, dus zo'n monster hoort er
      // niet in — en het weglaten zonder het te melden hoort ook niet. Vandaar
      // allebei: eruit, en met het aantal erbij.
      let gaten = [];
      try { gaten = (window.PLRit && window.PLRit.gaten) ? (window.PLRit.gaten() || []) : []; } catch (e) { console.warn('PLRit.gaten() onleesbaar bij de #15-proef', e); }
      const inGat = function (m) {
        return gaten.some(function (g) { return typeof m.t === 'number' && m.t >= g.van && m.t <= g.tot + 5000; });
      };
      const vuil = sp.filter(inGat).length;
      sp = sp.filter(function (m) { return !inGat(m); });
      if (sp.length < 20) return { staat: 'LET OP', detail: sp.length + ' bruikbare monsters — te kort om iets over #15 te zeggen' };
      const bez = sp.map(function (m) { return m.bezet; }).filter(function (v) { return typeof v === 'number'; });
      const ms = sp.map(function (m) { return m.ms; }).filter(function (v) { return typeof v === 'number' && v > 0; });
      const fout = sp.map(function (m) { return m.fout; }).filter(function (v) { return typeof v === 'number'; });
      const gem = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; };
      const hoog = function (a) { return a.length ? Math.max.apply(null, a) : null; };
      // Mediaan erbij, want één trage uitschieter trekt een gemiddelde scheef en
      // juist de uitschieters zijn hier het onderwerp.
      const mid = function (a) { if (!a.length) return null; const b = a.slice().sort(function (x, y) { return x - y; }); return Math.round(b[Math.floor(b.length / 2)]); };
      const kop = aan.length + ' aanvrager(s) (' + (aan.join(', ') || '—') + ') over ' + sp.length + ' monsters' +
        (vuil ? ' (' + vuil + ' weggelaten: die vielen in de achtergrondpauze)' : '') + ': ' +
        'bezetting gem ' + gem(bez) + '% (hoogst ' + hoog(bez) + '%), responstijd mediaan ' + mid(ms) + ' ms ' +
        '(gem ' + gem(ms) + ', hoogst ' + hoog(ms) + '), foutgraad hoogst ' + hoog(fout) + '%';
      if (aan.length < 4)
        return { staat: 'LET OP', detail: kop + ' — dit is het beeld bij ' + aan.length + ' aanvragers. #15 gaat over vier; ' +
          'zonder die vierde is het cijfer niet het cijfer waar het besluit over gaat' };
      return kop + ' — gemeten met alle vier tegelijk: dit is het getal waar #15 op wachtte';
    }
  },

  // ── #40: stuurt de auto één byte waar de tabel er twee zegt? ─────
  // PLPidLen leert uit metingen. Staan 0155/0156 niet in de pollronde, dan
  // leert hij niets en meldt blok 4 "0 afwijkend" — wat leest als "opgelost"
  // terwijl het "niet gekeken" betekent. Dat is precies wat de run van 13:14
  // deed. Sinds 6.5 staan ze in RIT_PIDS; hier staat wat dat opleverde.
  {
    issue: '#40',
    naam: '#40 — leest de app 0155/0156 goed, ook al wijken ze van de tabel af',
    waarom: 'De lerende laag hoort te winnen van de tabel. Afwijken is geen fout maar de bedoeling.',
    proef: function () {
      if (!window.PLPidLen || !PLPidLen.geleerd) return { staat: 'LET OP', detail: 'PLPidLen ontbreekt' };
      let g = {};
      try { g = PLPidLen.geleerd() || {}; } catch (e) { return { staat: 'LET OP', detail: 'PLPidLen.geleerd() gaf een fout' }; }
      const tabel = window.PID_BYTE_LEN || {};
      const rij = [], zonder = [], bewijs = [];
      ['55', '56'].forEach(function (sfx) {
        const e = g[sfx], t = tabel[sfx];
        if (!e) { zonder.push('01' + sfx); rij.push('01' + sfx + ': niets geleerd (tabel ' + t + ')'); return; }
        rij.push('01' + sfx + ': gemeten ' + e.n + ' byte' + (e.n === 1 ? '' : 's') + ' uit ' + e.hits + ' meting(en) via ' +
          e.bron + (e.conflict ? ', ' + e.conflict + ' tegenspraak/tegenspraken' : '') + ' — tabel zegt ' + t);
        if (t != null && e.n !== t && e.hits >= 2 && !e.conflict) bewijs.push('01' + sfx);
      });
      const kop = rij.join('  |  ');
      if (zonder.length)
        return { staat: 'LET OP', detail: kop + ' — ' + zonder.join(' en ') + ' kwam deze rit niet langs. ' +
          'Ze staan sinds 6.5 in RIT_PIDS; stond stap 2 aan?' };
      /* HERZIEN OP 03-09-2026 (#106). Hier stond: "#40 KAN DICHT, de tabel in
         pidlane-data.js hoort naar de gemeten waarde". Dat advies was fout, en
         het bleef elke rit opnieuw op het scherm staan terwijl #40 op 02-09 om
         20:27 al gesloten was — met de ANDERE uitkomst.

         0155/0156 zijn in J1979 de secundaire lambdatrim voor twee bankparen:
         twee bytes, één per bank. Een motor met één bank antwoordt met één. De
         tabelwaarde 2 is dus in het algemeen goed en deze CX-5 antwoordt korter.
         Dat is precies waar de lerende laag voor bestaat, en pidByteLen() geeft
         PLPidLen.lengte() al voorrang op de tabel.

         De proef stelde daarmee de verkeerde vraag. "Gemeten wijkt af van de
         tabel" is bij een lerende laag geen bevinding maar de normale toestand;
         een proef die dáár LET OP op zet staat vanaf de eerste rit in deze auto
         permanent oranje, en CLAUDE.md zegt wat daarvan komt: een test die
         altijd rood staat wordt genegeerd.

         De vraag is nu GEDRAG: pakt de app de bytes goed uit? Dus of de
         geleerde lengte wint van de tabel, en of een batch mét 0155 erin de PID
         eráchter nog steeds goed uitpakt. test-parser.js toetst dat laatste al
         op de echte functies; hier staat wat déze auto ervan liet zien. */
      if (typeof pidByteLen !== 'function')
        return { staat: 'FOUT', detail: kop + ' — pidByteLen() ontbreekt, dus er is geen laag die kan kiezen ' +
          'tussen de tabel en wat er gemeten is' };

      const misleest = [];
      ['55', '56'].forEach(function (sfx) {
        const e = g[sfx];
        if (!e || e.hits < 2 || e.conflict) return;   // te weinig bewijs: hieronder afgehandeld
        let gebruikt = null;
        try { gebruikt = pidByteLen(sfx); }
        catch (err) { misleest.push('01' + sfx + ': pidByteLen() gaf een fout — ' + (err.message || err)); return; }
        if (gebruikt !== e.n)
          misleest.push('01' + sfx + ': gemeten ' + e.n + ' byte(s) maar de app rekent met ' + gebruikt);
      });

      if (misleest.length)
        return { staat: 'FOUT', detail: kop + '  ||  ' + misleest.join(' | ') +
          ' — de lerende laag wint NIET van de tabel. Een batch met deze PID erin schuift dan alles ' +
          'wat erachter zit een byte op, en dat is stil: de waarde ziet er nog goed uit.' };

      if (bewijs.length === 2)
        return kop + ' — allebei bevestigd met minstens twee metingen en zonder tegenspraak, en de app leest ' +
          'ze ook echt met de gemeten lengte. De tabel blijft staan: die klopt voor een motor met twee banken ' +
          '(J1979), deze CX-5 heeft er één. #40 is hiermee gesloten (02-09); dit blijft staan als bewaking.';
      return kop + ' — de app leest ze met de lengte die hij zelf gemeten heeft. Voor een harde uitspraak over ' +
        'dit voertuig zijn per PID twee bevestigende metingen zonder tegenspraak nodig; die zijn er nog niet.';
    }
  },

  // ── #18: bevriest de app op de achtergrond? ───────────────
  // Stap 7 van de begeleide rit zet de markering; hier staat wat eruit kwam.
  // Zonder die stap kan deze proef niets zeggen, en dat zegt hij dan ook.
  {
    issue: '#18',
    naam: '#18 — weet de app dat hij weg was, en komt hij met opzet terug?',
    waarom: 'De bevriezing zelf is niet vanuit JavaScript te repareren. Wat wél kan is ervan weten én hem meten — hoe lang de app na het verbergen nog doorliep, en hoe lang hij daarna werkelijk stillag.',
    proef: function () {
      const m = _markeringen.filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      // Geen hard stapnummer meer (#170): sinds #166 is de achtergrondstap van
      // 7 naar 6 geschoven en bleef deze tekst naar de oude plek wijzen. De
      // stap heet altijd zo; het nummer verschuift met de lijst mee.
      if (!m) return { staat: 'LET OP', detail: 'geen achtergrondmarkering — de achtergrondstap van de meetrit is niet gedaan, ' +
        'dus over #18 zegt deze rit niets' };
      if (!window.PLAchtergrond || typeof PLAchtergrond.sinds !== 'function')
        return { staat: 'FOUT', detail: 'PLAchtergrond ontbreekt — dan weet de app nog steeds niets van zijn eigen pauze, ' +
          'en blijft het gat iets dat PLRit achteraf moet raden (#18)' };

      let gaten = [];
      try { gaten = PLRit.gaten() || []; } catch (e) { return { staat: 'LET OP', detail: 'PLRit.gaten() onbereikbaar' }; }
      const sinds = gaten.filter(function (g) { return g.van >= m.ms - 2000; });
      const grootste = sinds.reduce(function (a, g) { return Math.max(a, g.s || 0); }, 0);

      let bgs = [];
      try { bgs = PLAchtergrond.sinds(m.ms - 2000) || []; } catch (e) { return { staat: 'LET OP', detail: 'PLAchtergrond.sinds() gaf een fout' }; }
      const bgGrootste = bgs.reduce(function (a, p) { return Math.max(a, p.s || 0); }, 0);
      const bgStil = (typeof PLAchtergrond.stilsteS === 'function') ? PLAchtergrond.stilsteS(m.ms - 2000) : null;
      const bgGemeten = (typeof PLAchtergrond.gemeten === 'function') ? PLAchtergrond.gemeten(m.ms - 2000) : 0;
      const kop = 'markering om ' + m.t + '  |  PLRit leidt ' + sinds.length + ' onderbreking(en) af, grootste ' + grootste +
        ' s  |  PLAchtergrond wéét er ' + bgs.length + ', langste afwezigheid ' + bgGrootste + ' s' +
        (bgStil === null ? '' : ', langste gemeten stilte ' + bgStil + ' s');

      // DE KERN, HERZIEN OP 08-09-2026. Twee bronnen die langs verschillende
      // weg naar hetzelfde moeten wijzen: PLRit LEIDT het gat af uit zijn
      // eigen tikken, PLAchtergrond WEET van visibilitychange dat de app weg
      // was en meet sindsdien met een hartslag hoe lang de lus werkelijk
      // stillag.
      //
      // WAT HIER TOT 7.3 FOUT AAN WAS. De proef vergeleek `grootste` (het gat
      // in de meetlus) met `bgGrootste` (hoe lang de app weg was) en zette
      // LET OP zodra die meer dan een kwart uiteenliepen. Dat is geen
      // bevinding maar de normale uitkomst: tussen "app verborgen" en "Android
      // bevriest de app" zit een aanlooptijd, op 02-09 gemeten op ~36 s. De
      // proef sloeg dus alarm op precies het verschil dat hij hoorde te
      // rapporteren, en op de rit van 02-09 deed hij dat ook — met een log
      // eronder dat de aanlooptijd regel voor regel liet zien.
      //
      // Wat blijft alarmeren is het BESTAAN: ziet PLRit een gat waar
      // PLAchtergrond niets van weet, dan lag de lus stil zonder dat de app
      // het doorhad. Dat is de stille vorm die deze module moest wegnemen.
      // Wat een meetwaarde wordt is de DUUR, en die vergelijking loopt nu
      // tussen twee getallen die hetzelfde meten: het gat van PLRit tegen de
      // gemeten stilte van de hartslag.
      if (!bgs.length && grootste >= 30)
        return { staat: 'FOUT', detail: kop + ' — de meetlus stond ' + grootste + ' s stil maar PLAchtergrond legde niets vast. ' +
          'De luisteraar op visibilitychange vuurde dus niet: precies de stille vorm die 7.0 moest wegnemen' };
      if (bgs.length && !sinds.length)
        return { staat: 'LET OP', detail: kop + ' — PLAchtergrond zag een pauze waar PLRit geen gat afleidt. ' +
          'Dat kan: kort weg, of de pollus liep door. Geen bevinding, wel het vermelden waard' };
      if (bgs.length && grootste >= 30 && !bgGemeten)
        return { staat: 'LET OP', detail: kop + ' — PLAchtergrond weet dát de app weg was maar heeft de stilte niet gemeten ' +
          '(de hartslag startte niet). Dan is er niets om het gat van PLRit naast te leggen' };
      /* DE MEETWAARDE VAN DEZE PROEF, EN DE REDEN DAT HIJ SINDS 08-09 BESTAAT.
         De aanlooptijd: hoeveel seconden bleef de app na het verbergen nog
         dóórlopen voordat Android hem stilzette. Op 02-09 was dat ~36 s, en
         dat getal is het bruikbaarste dat de hele rit opleverde — het bepaalt
         welke oplossing überhaupt zin heeft. Een foreground service hoeft geen
         milliseconden te winnen; hij moet een gat van deze orde overbruggen.
         Tot 7.3 kwam dat getal alleen uit met de hand naast elkaar gelegde
         logregels. Nu meet de hartslag het, en staat het in het verslag. */
      // De tweede helft van deze proef: is de socket bij terugkomst nagekeken?
      // Staat hier bovenaan omdat elke uitkomst hieronder hem meldt — de
      // achtergrondpauze en de dode socket zijn twee kanten van hetzelfde.
      const laatste = bgs.length ? bgs[bgs.length - 1] : null;
      const sock = laatste ? (laatste.socket || 'niet nagekeken (korter dan de drempel)') : '—';

      const aanloop = bgs.filter(function (x) { return typeof x.door === 'number' && x.stil; });
      const meet = aanloop.length
        ? '  |  aanlooptijd tot de bevriezing: ' + aanloop.map(function (x) { return x.door + ' s'; }).join(', ') +
          ' (daarna ' + aanloop.map(function (x) { return x.stil + ' s'; }).join(', ') + ' stil)'
        : '';

      /* AFKNIJPEN KOMT VÓÓR DE VERGELIJKING, EN DAT IS GEEN VOLGORDE MAAR EEN
         REDENERING. Knijpt Chromium een verborgen tab af naar één tik per
         minuut, dan ziet de hartslag een reeks stiltes van een minuut terwijl
         PLRit — die om de vijf seconden tikt — er één lang gat van maakt. Die
         twee getallen lopen dan per definitie uiteen, en de vergelijking
         hieronder zou daar LET OP op zetten met "een van beide telt iets
         anders mee". Dat is precies de vorm van de fout die deze ronde
         wegneemt: alarm slaan op een verschil waar de verklaring al bekend is.
         Staat de verklaring vast, dan hoort die er te staan — en niet het
         alarm eronder. */
      const afgeknepen = bgs.filter(function (x) { return typeof x.na === 'number' && x.na >= 3; });
      if (afgeknepen.length)
        return { staat: 'LET OP', detail: kop + meet + '  |  socket: ' + sock + ' — de meetlus is ' + afgeknepen.length +
          ' keer uit zichzelf weer gaan lopen terwijl de app nog weg was. Dat is Chromium die een verborgen tab AFKNIJPT ' +
          '(één tik per minuut), niet Android die het proces bevriest. Twee verschillende oorzaken met twee verschillende ' +
          'oplossingen; noteer het merk en de Android-versie erbij' };

      // Pas hier vergelijken, en alleen tussen twee getallen die hetzelfde
      // meten. Een kwart speling is ruim: PLRit tikt om de vijf seconden en
      // de hartslag om de seconde, dus een paar seconden verschil is de
      // resolutie en geen meetfout.
      if (bgStil >= 30 && grootste >= 30 && Math.abs(bgStil - grootste) > Math.max(15, grootste * 0.25))
        return { staat: 'LET OP', detail: kop + ' — het gat van PLRit (' + grootste + ' s) en de gemeten stilte (' + bgStil +
          ' s) lopen meer dan een kwart uiteen, terwijl ze hetzelfde horen te meten. Een van beide telt iets anders mee' };

      if (laatste && /ontbreekt/.test(String(laatste.socket)))
        return { staat: 'FOUT', detail: kop + '  |  socket: ' + sock + ' — de haak naar sppReconnectGuard is weg, ' +
          'dus de app komt weer per ongeluk achter een dode socket in plaats van met opzet' };

      if (!bgs.length && !sinds.length)
        return { staat: 'LET OP', detail: kop + ' — geen van beide bronnen zag een onderbreking. Ben je wel echt ' +
          'twee minuten weg geweest, en bleef de app draaien?' };

      return kop + meet + '  |  socket: ' + sock + ' — beide bronnen wijzen dezelfde kant op: de app weet dat hij weg was, ' +
        'meet hoe lang hij stillag en komt met opzet terug. De bevriezing zelf blijft native werk';
    }
  },

  // ── draait deze meting op de schil die je denkt? ──────────────
  // Twee keer op 11-09-2026 was dit de vraag, en beide keren pas achteraf.
  // Een native wijziging zit alleen in de APK; de webpagina laadt los bij.
  {
    issue: '#18',
    naam: 'De schil is de nieuwste die er ligt',
    waarom: 'Een native wijziging zit alleen in de APK. Draait de nieuwe pagina op een oude schil, dan meet je oude code terwijl het verslag er nieuw uitziet — en dat is een hele rit voor niets.',
    proef: async function () {
      if (!window.PLSchil) return { staat: 'FOUT', detail: 'PLSchil ontbreekt — dan staat er niet in het verslag welke schil deze meting opleverde (#18)' };
      const hier = PLSchil.bouw();
      if (hier === null)
        return { staat: 'LET OP', detail: 'geen schil-build te lezen: ' + PLSchil.reden() +
          ' — in een browser klopt dat, in de APK niet' };

      let daar = null;
      try { daar = await PLSchil.haalNieuwste(true); }
      catch (e) { return { staat: 'LET OP', detail: 'build ' + hier + '  |  de nieuwste build is niet op te halen: ' + (e.message || e) }; }
      if (!daar)
        return { staat: 'LET OP', detail: 'build ' + hier + '  |  niet te vergelijken: ' + PLSchil.nieuwsteReden() +
          '. Zonder /version.json is er niets om naast te leggen' };

      const achter = PLSchil.achterstand();
      const kop = 'schil build ' + hier + ', nieuwste in R2 ' + daar.versionCode +
        (daar.builtAt ? ' (gebouwd ' + daar.builtAt + ')' : '');
      if (achter === null)
        return { staat: 'LET OP', detail: kop + ' — de vergelijking leverde geen getal op' };
      // VOORUIT LOPEN MAG. Een build die zelf gemaakt en geïnstalleerd is
      // loopt vóór op R2; dat is geen bevinding maar het vermelden waard,
      // want dan meet je iets wat niemand anders heeft.
      if (achter < 0)
        return { staat: 'LET OP', detail: kop + ' — deze schil loopt ' + (-achter) + ' build(s) VOOR op wat er in R2 ligt. ' +
          'Dat kan (zelf gebouwd), maar wat je hier meet staat dan bij niemand anders' };
      if (achter > 0)
        return { staat: 'LET OP', detail: kop + ' — de schil loopt ' + achter + ' build(s) achter. Native wijzigingen ' +
          'uit die builds zitten NIET in deze meting; de webpagina is wel bij. Installeer de nieuwe APK ' +
          'vóór je een native bevinding uit deze rit trekt (#18)' };
      return kop + ' — gelijk, dus wat er gemeten wordt is wat er gebouwd is';
    }
  },

  // ── #18: doet de native meetdienst wat hij belooft? ───────────
  // De vorige proef meet wat de WEBVIEW deed. Deze meet wat het PROCES deed,
  // en dat verschil is de hele reden dat de meetdienst bestaat: van buiten
  // zien een bevroren proces en een afgeknepen pagina er hetzelfde uit, en ze
  // vragen om een andere oplossing.
  {
    issue: '#18',
    naam: '#18 — houdt de native meetdienst het proces aan de praat?',
    waarom: 'Of een foreground service de bevriezing wegneemt, is met redeneren niet te beantwoorden — Chromium throttelt op zichtbaarheid en niet op procesprioriteit. Alleen twee hartslagen naast elkaar zeggen welk van de twee mechanismen de meting stilzette.',
    proef: async function () {
      const schil = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if (!window.PLMeetdienst)
        return { staat: 'FOUT', detail: 'PLMeetdienst ontbreekt — dan is er niets dat het proces wakker houdt ' +
          'en niets dat meet of dat zou helpen (#18)' };
      if (!schil)
        return { staat: 'LET OP', detail: 'geen Capacitor-schil (browser of PWA) — een foreground service bestaat hier niet, ' +
          'dus over #18 zegt deze proef niets' };
      if (!PLMeetdienst.beschikbaar())
        return { staat: 'FOUT', detail: 'de schil heeft geen native meetdienst: ' + (PLMeetdienst.reden() || 'reden onbekend') +
          '. Dit is een APK van vóór de meetdienst, óf de plugin is niet geregistreerd — en die twee zijn van binnenuit ' +
          'niet te onderscheiden (#18)' };

      let st = {};
      try { st = (await PLMeetdienst.status()) || {}; }
      catch (e) { return { staat: 'LET OP', detail: 'PLMeetdienst.status() gaf een fout: ' + (e.message || e) }; }

      const moet = PLMeetdienst.nodig();
      const kop = 'schil met meetdienst (Android SDK ' + (st.sdk || '?') + '), hartslag ' + (st.hartslagMs || '?') + ' ms  |  ' +
        'verbonden: ' + (moet ? 'ja' : 'nee') + ', dienst draait: ' + (st.draait ? 'ja' : 'nee');

      // DE HARDE POORT. Er is een echte adapterverbinding, dus de dienst hoort
      // te draaien. Doet hij dat niet, dan valt de meting bij het eerste
      // wegschakelen stil op precies de manier waar #18 over gaat — en de
      // reden staat klaar, want die is bij het starten bewaard.
      if (moet && !st.draait)
        return { staat: 'FOUT', detail: kop + ' — er is verbinding maar de meetdienst draait niet: ' +
          (PLMeetdienst.reden() || 'geen reden vastgelegd') + '. Op de achtergrond valt de meting dan stil (#18)' };
      if (!moet && st.draait)
        return { staat: 'LET OP', detail: kop + ' — de dienst draait zonder verbinding. Dat is een melding in de ' +
          'statusbalk zonder meting eronder; hij hoort mee te stoppen met de verbinding' };

      // En dan de meting zelf, als de achtergrondstap gedaan is.
      const m = _markeringen.filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      if (!m) return kop + ' — de dienst staat goed; de achtergrondstap is niet gedaan, dus over de bevriezing ' +
        'zegt deze rit nog niets';

      let bgs = [];
      try { bgs = (window.PLAchtergrond && PLAchtergrond.sinds(m.ms - 2000)) || []; }
      catch (e) { return { staat: 'LET OP', detail: kop + ' — PLAchtergrond.sinds() gaf een fout' }; }
      const metNative = bgs.filter(function (x) { return x.native && x.native.gemeten; });
      if (!bgs.length)
        return { staat: 'LET OP', detail: kop + ' — geen onderbreking sinds de markering. Ben je wel echt weg geweest?' };
      if (!metNative.length)
        return { staat: 'LET OP', detail: kop + ' — de app was weg, maar er is geen native meting bij die periode ' +
          'terechtgekomen: ' + ((bgs[bgs.length - 1].native && bgs[bgs.length - 1].native.reden) || 'reden onbekend') +
          '. Dan valt er niets naast de hartslag van de webview te leggen (#18)' };

      /* DIT IS DE UITKOMST WAAR DE HELE RONDE OM DRAAIT, en hij wordt met
         opzet niet als FOUT geboekt. Alle drie de mogelijkheden zijn een
         geldig meetresultaat; twee ervan wijzen alleen een andere kant op dan
         gehoopt. Een bevinding maken van "het werkte niet" zou de meting
         verwarren met het oordeel — dezelfde fout die deze proef bij zijn
         buurman hierboven op 08-09 kwam repareren. */
      const p = metNative[metNative.length - 1];
      const zin = PLMeetdienst.duiding(p.native, p);
      const rest = metNative.length > 1 ? '  |  ' + (metNative.length - 1) + ' eerdere periode(n) ook gemeten' : '';
      const opgelost = p.native.stil <= 3 && typeof p.stil === 'number' && p.stil <= 3;
      if (opgelost) return kop + '  |  ' + zin + rest;
      return { staat: 'LET OP', detail: kop + '  |  ' + zin + rest };
    }
  },

  // ── #17: UTC in de recorder, lokale tijd in de logger ──────────
  // Dit is de goedkoopste van de zes en had er allang moeten staan: het bewijs
  // ligt in het sessie-id van de recorder en op de klok van het toestel. Tot nu
  // toe stond het alleen als beschrijving in het issue.
  {
    issue: '#17',
    naam: '#17 — schrijft de bulk-recorder dezelfde tijd als de logger?',
    waarom: 'Het bewijs ligt in het sessie-id van de recorder naast het epoch-moment waarop hij begon.',
    proef: function () {
      if (!window.PLBulk || !PLBulk.status) return { staat: 'LET OP', detail: 'PLBulk ontbreekt' };
      if (typeof plStempelLokaal !== 'function')
        return { staat: 'FOUT', detail: 'plStempelLokaal() ontbreekt — dan bouwt de recorder zijn id weer met UTC (#17)' };
      let st = {};
      try { st = PLBulk.status() || {}; } catch (e) { return { staat: 'LET OP', detail: 'PLBulk.status() gaf een fout' }; }
      if (!st.sessie) return { staat: 'LET OP', detail: 'geen sessie-id — de recorder heeft deze rit niet gelopen' };
      if (!st.gestart) return { staat: 'FOUT', detail: 'PLBulk.status() geeft geen `gestart` mee — zonder dat epoch-getal ' +
        'is het etiket nergens meer aan te toetsen (#17)' };

      // Het epoch-moment is de waarheid (PIDLANE-CONTRACT.md §6); het id is er
      // het etiket van. Ze horen exact hetzelfde moment te noemen, in de klok
      // die de gebruiker op het scherm ziet. Niet vergelijken met de klok van
      // NU: de recorder kan uren geleden begonnen zijn.
      const hoort = 'blk-' + plStempelLokaal(st.gestart);
      const offsetMin = -new Date().getTimezoneOffset();
      const kop = 'recorder-id "' + String(st.sessie) + '", gestart ' +
        new Date(st.gestart).toTimeString().slice(0, 8) + ' lokaal (klok ' +
        (offsetMin >= 0 ? '+' : '') + (offsetMin / 60) + ' uur t.o.v. UTC)';

      if (/Z$/.test(String(st.sessie)))
        return { staat: 'FOUT', detail: kop + ' — het id eindigt op Z en claimt daarmee UTC. Dat was de leugen ' +
          'uit #17: de app-log ernaast schrijft lokale tijd' };
      if (String(st.sessie) !== hoort)
        return { staat: 'FOUT', detail: kop + ' — verwacht "' + hoort + '". Het etiket loopt niet gelijk met het ' +
          'moment waarop de recorder begon, en dan zijn twee bestanden van dezelfde rit niet naast elkaar te leggen (#17)' };
      if (offsetMin === 0)
        return kop + ' — het id klopt met het startmoment, maar dit toestel stáát op UTC, dus het verschil uit #17 ' +
          'zou hier hoe dan ook niet zichtbaar zijn. Meet dit nog eens in de zomertijd of met een andere tijdzone';
      return kop + ' — het id draagt exact dat moment in dezelfde klok als het logboek';
    }
  },

  // ── #29: meldt blok 14 een opruiming die echt gebeurd is? ───────
  // De reparatie van 01-09 liet blok 14 aan de gate meten in plaats van in een
  // aflopend log. Wat sindsdien ontbreekt is een rit waarin de regel óók echt
  // vuurt — anders is "niets opgeruimd" nog steeds niet te onderscheiden van
  // "niet gezien". Deze proef legt de twee bronnen naast elkaar.
  {
    issue: '#29',
    naam: '#29 — ziet blok 14 een opruiming die echt gebeurde?',
    waarom: 'Legt de gate en het opruimlog naast elkaar: niets opgeruimd, of niet gezien?',
    proef: function () {
      let lijst = null;
      try { if (typeof pidOpgeruimdLijst === 'function') lijst = pidOpgeruimdLijst(); }
      catch (e) { return { staat: 'LET OP', detail: 'pidOpgeruimdLijst() gaf een fout — dan is er geen bron' }; }
      if (!lijst) return { staat: 'LET OP', detail: 'pidOpgeruimdLijst() ontbreekt — blok 14 leest dan weer een log (#29)' };
    // pidOpgeruimdLijst() geeft {pid, naam, reden} — geen strings. De run van
    // 02-09 22:15 zette daar "gate: [object Object]" van in het verslag en trok
    // er wél een stellige conclusie uit. Het oordeel klopte toevallig, maar het
    // bewijs eronder was onleesbaar, en dat is precies de vorm die §11 zes keer
    // beschrijft. Vandaar hier uitpakken in plaats van joinen.
    const _naam = function (x) {
      if (x && typeof x === 'object') return (x.pid || '?') + (x.naam ? ' (' + x.naam + ')' : '');
      return String(x);
    };
    const gate = (lijst && lijst.size !== undefined) ? Array.from(lijst)
               : (Array.isArray(lijst) ? lijst : Object.keys(lijst || {}));
      let bt = [];
      try { bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : []; }
      catch (e) { bt = []; console.warn('Testrun: BT-log onleesbaar bij de #29-proef', e); }
      // Ontdubbelen (#104): btDiag en log krijgen dezelfde opruiming, dus zonder
      // dit telt deze proef er twee waar er één gebeurde.
      const regels = _opruimOntdubbel([].concat(bt || [], _appLogRegels() || []), /opgeruimd/i);
    const kop = 'gate: ' + (gate.length ? gate.map(_naam).join(', ') : 'leeg') + '  |  logregels met "opgeruimd": ' + regels.length;
      if (!gate.length && !regels.length)
        return { staat: 'LET OP', detail: kop + ' — er is deze rit niets opgeruimd, dus #29 is niet te toetsen. ' +
          'De regel heeft vijf pogingen plus vijf herkansingen nodig: rijd langer, of neem een sensor mee die zwijgt' };
      if (gate.length && !regels.length)
        return kop + ' — de gate meldt een opruiming die niet meer in de logs staat. Precies daarom leest blok 14 sinds ' +
          '01-09 de gate: het log is een ringbuffer en wist zijn eigen bewijs. #29 KAN DICHT';
      if (!gate.length && regels.length)
        return { staat: 'FOUT', detail: kop + ' — het log meldt een opruiming en de gate niet. Dat is de fout van #29 ' +
          'in spiegelbeeld: nu is de gate de bron die iets mist' };
      return kop + ' — gate en log wijzen dezelfde kant op: blok 14 ziet wat er echt gebeurde. #29 KAN DICHT';
    }
  },

  // ── verbergt een dubbeltik, of zet hij nog steeds uit? ──
  // In node is dit tot op de laatste tak getoetst, maar altijd tegen een
  // nagebootste DOM. Wat daar niet te zien is, is of de strook in de
  // dráaiende app bestaat en of het gebaar bij de echte tegels aankomt —
  // precies het soort verbinding dat bij #29, #74 en #52 ontbrak zonder ooit
  // een fout te geven. Deze proef verbergt een tegel, kijkt, en zet hem terug.
  {
    issue: '#61',
    naam: 'Een dubbeltik verbergt de tegel en laat de meting met rust',
    waarom: 'Of het gebaar bij de echte tegels aankomt en de strook echt bestaat, is alleen in de draaiende app te zien.',
    proef: function () {
      if (typeof pidVerberg !== 'function' || typeof pidToon !== 'function')
        return { staat: 'FOUT', detail: 'pidVerberg()/pidToon() ontbreken — dan zet een dubbeltik de sensor weer uit in plaats van hem te verbergen' };
      const strook = document.getElementById('verborgenStrook');
      if (!strook)
        return { staat: 'FOUT', detail: '#verborgenStrook staat niet in index.html — een verborgen tegel is dan nergens meer terug te halen' };

      const kandidaat = Array.from(activePIDs).find(function (p) {
        return !pidVerborgen(p) && document.getElementById('gc-' + p);
      });
      if (!kandidaat)
        return { staat: 'LET OP', detail: 'geen zichtbare tegel om mee te proeven — kies eerst sensoren en open de live view' };

      const naam = (getPidDef(kandidaat) || {}).name || kandidaat;
      const voorAantal = activePIDs.size;
      const voorWaarde = pidVals[kandidaat];

      pidVerberg(kandidaat);
      const tegelWeg = !document.getElementById('gc-' + kandidaat);
      const inStrook = !!document.getElementById('vb-' + kandidaat);
      const nogGeselecteerd = activePIDs.has(kandidaat);
      const zelfdeAantal = (activePIDs.size === voorAantal);
      const kopt = String(strook.textContent || '');

      // Terugzetten, hoe de proef ook afloopt: deze rit gaat niet over een
      // tegel die ik heb weggeklikt.
      pidToon(kandidaat);
      const terug = !!document.getElementById('gc-' + kandidaat);

      if (!nogGeselecteerd || !zelfdeAantal)
        return { staat: 'FOUT', detail: 'verbergen van "' + naam + '" haalde de sensor uit de selectie (' +
          voorAantal + ' → ' + activePIDs.size + ') — dan wordt er niet meer gemeten, en dat is precies wat verbergen niet is' };
      if (!tegelWeg)
        return { staat: 'FOUT', detail: 'de tegel van "' + naam + '" bleef staan na pidVerberg() — het gebaar komt niet bij de tegel aan' };
      if (!inStrook)
        return { staat: 'FOUT', detail: '"' + naam + '" verdween maar staat niet in de strook onderaan — dan is hij niet terug te halen' };
      if (!terug)
        return { staat: 'FOUT', detail: '"' + naam + '" kwam na pidToon() niet terug in beeld; deze proef heeft een tegel achtergelaten' };
      if (!/gemeten/i.test(kopt))
        return { staat: 'FOUT', detail: 'de strook zegt nergens dat er dóórgemeten wordt ("' + kopt.slice(0, 60) +
          '") — dan is "verborgen" niet van "uit" te onderscheiden' };
      if (voorWaarde !== undefined && pidVals[kandidaat] === undefined)
        return { staat: 'FOUT', detail: 'de waarde van "' + naam + '" is tijdens het verbergen verdwenen uit pidVals' };

      const nu = Array.from(activePIDs).filter(function (p) { return pidVerborgen(p); }).length;
      return '"' + naam + '" verborgen en teruggehaald: selectie bleef ' + voorAantal +
        ', de strook noemde hem, en de kop zegt dat er doorgemeten wordt. Nu verborgen: ' + nu;
    }
  },

  // ── deelt de slimme weergave DEZE auto goed in? ──
  // slimMaat() is in node getoetst op een verzonnen setje PIDs. Wat daar niet
  // te zien is, is hoe de indeling uitpakt op de sensoren die déze auto
  // werkelijk levert: welke er stil liggen, of er iets in twee vakken tegelijk
  // hangt, en of twee meters op de tellerplaat dezelfde naam dragen. Dat
  // laatste hangt aan de combinatie van PIDs en niet aan de code, dus het is
  // per auto een andere vraag — precies het soort dat alleen hier te stellen is.
  {
    issue: '#61',
    naam: 'De slimme weergave deelt de sensoren van deze auto in',
    waarom: 'Hoe de maat uitpakt hangt aan de sensoren die déze auto levert; in node is die combinatie verzonnen.',
    proef: function () {
      const vakken = ['dash', 'meter', 'temp', 'rest', 'rustig'];
      const inhoud = {}, gezien = {};
      let totaal = 0, dubbel = [];
      for (const g of vakken) {
        const box = document.getElementById('slimVak-' + g);
        if (!box) return { staat: 'LET OP', detail: 'vak "' + g + '" bestaat niet in de DOM — de live view staat ' +
          'waarschijnlijk niet in de slimme weergave, dus er valt niets in te delen' };
        inhoud[g] = Array.from(box.children).map(function (c) { return String(c.id).slice(3); });
        totaal += inhoud[g].length;
        for (const pid of inhoud[g]) {
          if (gezien[pid]) dubbel.push(pid + ' (' + gezien[pid] + ' én ' + g + ')');
          gezien[pid] = g;
        }
      }
      if (!totaal) return { staat: 'LET OP', detail: 'er staat geen enkele tegel in beeld — kies eerst sensoren' };

      const kop = vakken.map(function (g) { return g + ' ' + inhoud[g].length; }).join(' · ');
      const naamVan = function (pid) {
        try { const d = getPidDef(pid); return (d && d.name) || pid; } catch (e) { return pid; }
      };

      // 1. Een tegel in twee vakken tegelijk. Dat kán alleen als een
      //    verplaatsing hem niet bij zijn oude ouder weghaalde, en dan staat
      //    dezelfde meting twee keer in beeld met twee verschillende vormen.
      if (dubbel.length)
        return { staat: 'FOUT', detail: kop + ' — dezelfde tegel hangt in twee vakken: ' + dubbel.join(', ') };

      // 2. Twee meters met dezelfde naam op de tellerplaat. In node getoetst op
      //    vijf vaste PIDs; welke combinatie déze auto levert is een andere vraag.
      const labels = {}, botsing = [];
      for (const pid of inhoud.meter) {
        const el = document.getElementById('gc-' + pid);
        const t = el ? String(el.textContent || '').toUpperCase() : '';
        const naam = t ? t.replace(/[\d.,%°λ\s]+/g, ' ').trim() : naamVan(pid).toUpperCase();
        if (labels[naam]) botsing.push('"' + naam + '" op ' + labels[naam] + ' én ' + pid);
        labels[naam] = pid;
      }
      if (botsing.length)
        return { staat: 'FOUT', detail: kop + ' — twee meters op de tellerplaat dragen dezelfde naam: ' +
          botsing.join(', ') + '. De plaat wijst dan een signaal aan zonder te zeggen welk (#68)' };

      // 3. En de waarneming zelf: wat ligt er op déze auto stil? Dat is geen
      //    fout maar de vraag die de rit moet beantwoorden — is dit inderdaad
      //    wat je niet groot in beeld wilt hebben?
      const stil = inhoud.rustig.map(naamVan);
      return kop + (stil.length ? ' — stil deze rit: ' + stil.join(', ') : ' — niets ligt stil; alles beweegt of heeft nog te weinig historie');
    }
  },

  // ── passen de namen op de tellerplaat op DIT scherm? ──
  // bproef-plaatnamen.js meet dit ook, en preciezer: alle 146 namen. Maar hij
  // meet ze op de standaard tekstgrootte, in één vensterbreedte, met een
  // demo-auto. Hier staat de plaat zoals hij nu is: de sensoren die déze auto
  // levert, de tekstgrootte die deze gebruiker koos (S/M/L schaalt de hele
  // app), en het lettertype dat dit toestel werkelijk gebruikt. Dat is een
  // andere vraag dan "past het in het harnas", en alleen hier te stellen.
  {
    issue: '#95',
    naam: 'De namen op de tellerplaat passen op dit scherm',
    waarom: 'De kolombreedte hangt aan het aantal meters van déze auto en de tekstgrootte van deze gebruiker.',
    proef: function () {
      const labels = document.querySelectorAll('.slim-meter .gn2');
      if (!labels.length)
        return { staat: 'LET OP', detail: 'geen tellerplaat in beeld — de live view staat niet in de slimme ' +
          'weergave, of er staan geen meters op' };

      const lh = parseFloat(getComputedStyle(labels[0]).lineHeight) || 0;
      if (!lh) return { staat: 'LET OP', detail: 'de regelhoogte is niet uit te lezen — dan valt er niets te meten' };

      const teveel = [], terugval = [], namen = {}, dubbel = [];
      let breedte = 0;
      labels.forEach(function (el) {
        const t = String(el.textContent || '').trim();
        if (!t) return;
        breedte = Math.round(el.getBoundingClientRect().width);
        // De CSS geeft de naam twee regels (-webkit-line-clamp:2). Meer dan dat
        // wordt afgekapt, en juist het staartje van een naam is wat hem van de
        // meter ernaast onderscheidt.
        const regels = Math.round(el.scrollHeight / lh);
        if (regels > 2) {
          // Twee heel verschillende oorzaken, en ze mogen niet op één hoop.
          // slimMeterLabels() zet bij een BOTSING met opzet de volledige naam
          // terug — "leesbaar verkeerd is erger dan lang", en die keuze staat
          // los van deze grens. Zo'n naam kan best over drie regels lopen; dat
          // is een bekend gevolg, geen fout. Loopt een AFGEKORTE naam eroverheen,
          // dan is de grens zelf te ruim voor dit scherm, en dat is #95.
          const kaart = el.closest ? el.closest('.gc') : null;
          const pid = kaart ? String(kaart.id).slice(3) : '';
          let vol = '';
          try { const d = getPidDef(pid); vol = (d && d.name) || ''; } catch (e) { vol = ''; }
          if (vol && vol.toUpperCase() === t.toUpperCase()) terugval.push('"' + t + '"');
          else teveel.push('"' + t + '" (' + regels + ' regels)');
        }
        const sleutel = t.toUpperCase();
        if (namen[sleutel]) dubbel.push('"' + t + '"');
        namen[sleutel] = true;
      });

      const kop = labels.length + ' meters, kolom ' + breedte + 'px, regelhoogte ' + Math.round(lh * 10) / 10 + 'px';
      if (dubbel.length)
        return { staat: 'FOUT', detail: kop + ' — twee meters dragen dezelfde naam: ' + dubbel.join(', ') +
          '. De plaat wijst dan een signaal aan zonder te zeggen welk (#68)' };
      if (teveel.length)
        return { staat: 'FOUT', detail: kop + ' — een AFGEKORTE naam loopt over twee regels heen: ' +
          teveel.join(', ') + '. Op dit scherm is SLIM_METER_MAX dus te ruim (#95)' };
      const staart = terugval.length
        ? ' (' + terugval.join(', ') + ' viel terug op de volledige naam bij een botsing en wordt na twee regels ' +
          'afgekapt — bekend gevolg van die terugval, de volledige naam staat in de tooltip)'
        : '';
      return kop + ' — alle afgekorte namen passen binnen twee regels: ' +
        Object.keys(namen).length + ' verschillende' + staart;
    }
  },

  // ── blijven de onderste vellen boven de navigatiebalk? ──
  // bproef-schermranden.js meet dit ook, maar met een NAGEBOOTSTE inset van
  // 48px: in een browser is --pl-sab altijd 0px. Op dit toestel is hij echt —
  // Capacitor leest hem uit WindowInsetsCompat — en dat maakt dit de enige
  // plek waar de vraag over dít scherm beantwoord wordt, met dít lettertype
  // en déze knophoogtes. Vandaar hier én daar, en niet alleen daar.
  {
    issue: '#71',
    naam: 'De onderste vellen blijven boven de navigatiebalk',
    waarom: 'Alleen op een toestel is --pl-sab echt gevuld; in een browser is hij 0px en ziet elk vel er goed uit.',
    proef: function () {
      const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pl-sab')) || 0;
      if (sab <= 0)
        return { staat: 'LET OP', detail: '--pl-sab is 0px op dit toestel — er is hier geen navigatiebalk om ' +
          'achter te vallen, dus deze proef kan niets vaststellen. bproef-schermranden.js meet het na met 48px' };

      const VELLEN = [
        { naam: 'demo-autokiezer', open: 'openDemoCarChooser', id: 'demoCarModal' },
        { naam: 'rijsituatie', open: 'openSituatie', id: 'situatieSheet' },
        { naam: 'voertuigoverzicht', open: 'openVehicleOverview', id: 'vehOverview' }
      ];
      const krap = [], gemeten = [], over = [];

      for (const v of VELLEN) {
        if (typeof window[v.open] !== 'function') { over.push(v.naam + ' (' + v.open + '() bestaat niet)'); continue; }

        // De stand van vóór de proef onthouden. Een vel dat er al stond mag
        // hier niet dicht- of opengaan: dan verandert deze proef het scherm
        // van de gebruiker, en dat is geen meten meer.
        const bestond = document.getElementById(v.id);
        const oudeStand = bestond ? bestond.style.display : null;

        try { window[v.open](); }
        catch (e) { over.push(v.naam + ' (openen mislukte: ' + e.message + ')'); continue; }

        const m = document.getElementById(v.id);
        if (!m) { over.push(v.naam + ' (bouwde geen #' + v.id + ' — functie uitgeschakeld?)'); continue; }

        // Naar beneden scrollen zoals een gebruiker doet om de onderste knop
        // te bereiken; wat daarna nog onder de onderrand hangt is niet in beeld
        // en zegt dus niets.
        m.querySelectorAll('*').forEach(function (e) { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });
        let laagste = null, onder = -1e9;
        m.querySelectorAll('button,input,textarea,select,a').forEach(function (e) {
          const r = e.getBoundingClientRect();
          if (r.height <= 0 || r.top > window.innerHeight) return;
          if (r.bottom > onder) { onder = r.bottom; laagste = e; }
        });

        if (bestond) m.style.display = oudeStand;
        else m.style.display = 'none';

        if (!laagste) { over.push(v.naam + ' (geen zichtbare knop)'); continue; }
        const ruimte = Math.round(window.innerHeight - onder);
        const knop = String(laagste.textContent || laagste.id || laagste.tagName).trim().slice(0, 20);
        gemeten.push(v.naam + ' ' + ruimte + 'px');
        if (ruimte < sab) krap.push(v.naam + ': ' + ruimte + 'px onder "' + knop + '"');
      }

      if (!gemeten.length)
        return { staat: 'LET OP', detail: 'geen enkel vel gemeten — ' + (over.join('; ') || 'onbekende reden') };

      const kop = 'navigatiebalk ' + Math.round(sab) + 'px; ruimte onder de laagste knop: ' + gemeten.join(', ');
      if (krap.length)
        return { staat: 'FOUT', detail: kop + ' — te krap bij ' + krap.join(' en ') +
          '. Die knop zit deels achter de Android-knoppen (#71)' };
      return kop + (over.length ? ' (niet gemeten: ' + over.join('; ') + ')' : '');
    }
  },

  // ── #144: het Run-venster, en waarom de knopmaat hier niet volstaat ──
  // De proef hierboven meet de laagste KNOP. Dat is precies de maat die #144
  // liet lopen: bij het Run-venster stond de knop met 65px ruim boven de balk
  // terwijl de uitleg eronder op 43px lag — leesbaar noch te raken. Sinds #123
  // hangt de bevindingenschakelaar met zijn tekst onderaan dit paneel, en op
  // een kort scherm gaat de bak daardoor scrollen.
  //
  // Waarom óók hier en niet alleen in bproef-schermranden.js: daar is de inset
  // nagebootst op 48px. Op dít toestel is hij echt, en de tekst wordt met dít
  // lettertype gezet — een regel die in de browser net past, kan hier omslaan
  // en dan is de onderste regel een andere.
  {
    issue: '#144',
    naam: 'De onderste regel van het Run-venster blijft leesbaar',
    waarom: 'De knopmaat stond hier groen terwijl de tekst eronder achter de balk lag; alleen op een toestel is --pl-sab echt.',
    proef: function () {
      const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pl-sab')) || 0;
      if (sab <= 0)
        return { staat: 'LET OP', detail: '--pl-sab is 0px op dit toestel — geen navigatiebalk om achter te ' +
          'vallen. bproef-schermranden.js meet het na met 48px op een kort scherm' };
      if (typeof openRunPaneel !== 'function')
        return { staat: 'FOUT', detail: 'openRunPaneel() ontbreekt — dan is het Run-venster niet te openen (#144)' };

      // Stond hij al open, dan laten we hem open: deze proef hoort het scherm
      // van de gebruiker niet te veranderen.
      const bestond = document.getElementById('runOv');
      const stondOpen = !!bestond && bestond.style.display !== 'none';

      try { openRunPaneel(); }
      catch (e) { return { staat: 'FOUT', detail: 'Run-venster openen mislukte: ' + e.message }; }

      const m = document.getElementById('runOv');
      if (!m) return { staat: 'FOUT', detail: 'openRunPaneel() bouwde geen #runOv' };

      // De bak ZELF scrollen, niet alleen wat eronder hangt: #runOv draagt de
      // overflow. Zonder deze regel meet je de bovenkant van een paneel dat je
      // nooit hebt uitgescrold.
      if (m.scrollHeight > m.clientHeight + 2) m.scrollTop = m.scrollHeight;
      m.querySelectorAll('*').forEach(function (e) { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });

      let knopOnder = -1e9;
      m.querySelectorAll('button,input,textarea,select,a').forEach(function (e) {
        const r = e.getBoundingClientRect();
        if (r.height <= 0 || r.top > window.innerHeight) return;
        if (r.bottom > knopOnder) knopOnder = r.bottom;
      });

      // De laagste zichtbare TEKST. Een Range om de tekstknoop geeft de regel
      // zelf en niet de doos eromheen — anders meet je de volschermwikkel, en
      // die loopt per definitie tot de onderrand.
      const loper = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
      const bereik = document.createRange();
      let tekstOnder = -1e9, tekst = null;
      for (let n = loper.nextNode(); n; n = loper.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const ouder = n.parentElement;
        if (!ouder) continue;
        const st = getComputedStyle(ouder);
        if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue;
        bereik.selectNodeContents(n);
        const r = bereik.getBoundingClientRect();
        if (r.height <= 0 || r.top > window.innerHeight) continue;
        if (r.bottom > tekstOnder) { tekstOnder = r.bottom; tekst = n.nodeValue.trim().slice(0, 24); }
      }

      const scrolde = m.scrollHeight > m.clientHeight + 2;
      if (!stondOpen) { try { PLRun.sluit(); } catch (e) { m.style.display = 'none'; } }

      if (tekstOnder === -1e9)
        return { staat: 'LET OP', detail: 'geen zichtbare tekst in het Run-venster — niets te meten' };

      const ruimteTekst = Math.round(window.innerHeight - tekstOnder);
      const ruimteKnop = knopOnder === -1e9 ? null : Math.round(window.innerHeight - knopOnder);
      const kop = 'navigatiebalk ' + Math.round(sab) + 'px; onderste regel "' + tekst + '" op ' +
        ruimteTekst + 'px' + (ruimteKnop === null ? '' : ', laagste knop op ' + ruimteKnop + 'px') +
        (scrolde ? '; het paneel scrolde' : '; het paneel paste in beeld');

      if (ruimteTekst < sab)
        return { staat: 'FOUT', detail: kop + ' — die regel ligt ' + Math.round(sab - ruimteTekst) +
          'px achter de Android-knoppen (#144)' };
      return kop;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // DRIE PROEVEN DIE DE RIT LATEN VASTLEGGEN WAT NU VAN OPLETTEN AFHANGT
  // ──────────────────────────────────────────────────────────────
  // #66, #64 en #133 staan alle drie open met dezelfde vorm: het antwoord is
  // alleen tijdens een rit te geven, en het staat in de issues als "kijk of
  // het klopt". Kijken is geen meten — wat er dan van een rit terugkomt is een
  // herinnering, en die is er de volgende ronde niet meer.
  //
  // Deze drie zetten het in het verslag, met een echte faaltoestand erin; een
  // blok dat alleen kán rapporteren wordt na twee ritten niet meer gelezen.
  // ══════════════════════════════════════════════════════════════

  // ── #66: is 2% van het bereik de goede drempel voor "beweegt"? ──
  // Het issue vraagt om een oordeel dat een machine niet kan geven: staat er
  // een lijn waar je er een wilt. Wat de machine wél kan is de meting eronder
  // opschrijven — per sensor het bereik tegen de drempel — zodat die vraag ná
  // de rit met getallen te beantwoorden is in plaats van uit het hoofd. De
  // faaltoestand is de ijkvraag uit het issue zelf: draait de motor, dan MOET
  // het toerental bewegen. Doet het dat niet, dan is niet de drempel verkeerd
  // maar de reeks eronder stuk.
  {
    issue: '#66',
    naam: 'De drempel voor "beweegt" scheidt beweging van stilstand',
    waarom: 'Alleen tijdens een rit beweegt er iets; stilstaand is de vraag niet te beantwoorden.',
    proef: function () {
      if (typeof slimBeweegt !== 'function' || typeof SLIM_BEWEEG_DEEL !== 'number')
        return { staat: 'FOUT', detail: 'slimBeweegt() of SLIM_BEWEEG_DEEL ontbreekt — dan tekent de ' +
          'slimme weergave geen enkele trendlijn meer (#66)' };

      let lijst = [];
      try { lijst = [...(activePIDs || [])]; } catch (e) { return { staat: 'LET OP', detail: 'activePIDs onleesbaar' }; }

      // Twee cijfers is genoeg en houdt de regel leesbaar: een drempel van
      // 0,0032 zegt evenveel als 0,003 en een bereik van 812,4 als 812.
      const afr = function (x) { return (Math.abs(x) >= 10) ? Math.round(x) : Math.round(x * 100) / 100; };

      const beweegt = [], stil = [], krap = [];
      lijst.forEach(function (pid) {
        let d = null;
        try { d = (typeof getPidDef === 'function') ? getPidDef(pid) : null; } catch (e) { return; }
        const h = (typeof pidHist !== 'undefined') && pidHist[pid];
        if (!Array.isArray(h) || h.length < 4) return;
        const v = h.slice(-24).map(function (x) { return x.v; })
                   .filter(function (x) { return typeof x === 'number' && isFinite(x); });
        if (v.length < 4) return;
        const rg = Math.max.apply(null, v) - Math.min.apply(null, v);
        const span = (d && typeof d.max === 'number' && typeof d.min === 'number') ? (d.max - d.min) : 0;
        const gem = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
        const drempel = span > 0 ? span * SLIM_BEWEEG_DEEL : Math.abs(gem) * SLIM_BEWEEG_DEEL;
        let uit = false;
        try { uit = !!slimBeweegt(pid, d); } catch (e) { return; }
        const naam = (d && d.name) || pid;
        const regel = naam + ' ' + afr(rg) + '/' + afr(drempel);
        if (uit) beweegt.push(regel); else stil.push(regel);
        // Wat vlak onder de drempel zit is de interessantste groep: dáár
        // beslist die 2% werkelijk iets, en dáár hoort de vraag "te hoog of
        // te laag?" thuis.
        if (!uit && drempel > 0 && rg > drempel * 0.5) krap.push(regel);
      });

      if (!beweegt.length && !stil.length)
        return { staat: 'LET OP', detail: 'geen enkele sensor heeft genoeg geschiedenis — ' +
          'stilstaand of net verbonden valt hier niets over te zeggen' };

      let rpm = null;
      try { rpm = (typeof pidVals !== 'undefined') ? pidVals['010C'] : null; } catch (e) { /* stil: pidVals kan ontbreken */ }
      const rpmH = (typeof pidHist !== 'undefined') && pidHist['010C'];
      const rpmGemeten = Array.isArray(rpmH) && rpmH.length >= 4;
      let rpmBeweegt = false;
      try { rpmBeweegt = !!slimBeweegt('010C', (typeof getPidDef === 'function') ? getPidDef('010C') : null); }
      catch (e) { console.warn('slimBeweegt() op het toerental mislukte bij de #66-proef', e); }

      const kop = 'drempel ' + (Math.round(SLIM_BEWEEG_DEEL * 1000) / 10) + '% van het bereik; ' +
        beweegt.length + ' bewegen, ' + stil.length + ' stil' +
        (beweegt.length ? '. Beweegt: ' + beweegt.slice(0, 6).join(', ') : '') +
        (krap.length ? '. Vlak onder de drempel: ' + krap.slice(0, 6).join(', ') : '');

      /* DE IJKVRAAG, HERZIEN NA DE RIT VAN 09-09-2026.

         Hier stond: draait de motor en telt het toerental niet als bewegend,
         dan is FOUT — "dan is niet de drempel verkeerd maar de reeks eronder".
         Die proef sloeg op zijn eerste rit meteen alarm, en hij had ongelijk.
         Gemeten om 13:27, stationair op 652 rpm: het toerental had een bereik
         van 108 tegen een drempel van 160. Dat is geen kapotte reeks — dat is
         een motor die stationair 108 toeren op en neer gaat, precies zoals
         hoort. De bestuurder antwoordde bij stap 9 van de begeleide run dan
         ook "balken én lijnen kloppen".

         De fout zat in de gevolgtrekking, niet in de meting: de melding gaf een
         OORZAAK ("de reeks eronder") die nergens uit bleek. Dat is dezelfde
         vorm als #18, waar de melding beweerde wat hij niet gemeten had — en
         die staat één kopje verderop in §11 opgeschreven.

         Nu wordt er onderscheiden wat werkelijk verschilt:
           • bereik nul terwijl de motor draait → de reeks staat stil, en dát is
             een defect dat niets met de drempel te maken heeft;
           • bereik onder de drempel → precies de vraag van #66, met het getal
             erbij. Dat is een meetwaarde, geen bevinding. */
      const rpmBereik = (function () {
        if (!rpmGemeten) return null;
        const w = rpmH.slice(-24).map(function (x) { return x.v; })
                     .filter(function (x) { return typeof x === 'number' && isFinite(x); });
        return w.length >= 4 ? (Math.max.apply(null, w) - Math.min.apply(null, w)) : null;
      })();

      if (typeof rpm !== 'number' || rpm <= 400)
        return { staat: 'LET OP', detail: kop + ' — motor uit, dus de ijkvraag ' +
          '(beweegt het toerental?) is niet gesteld' };

      if (rpmBereik === 0)
        return { staat: 'FOUT', detail: kop + ' — de motor draait (' + Math.round(rpm) +
          ' rpm) en het toerental staat over de laatste 24 metingen exact stil. Dat is de reeks ' +
          'eronder, niet de drempel (#66)' };

      if (rpmGemeten && !rpmBeweegt)
        return { staat: 'LET OP', detail: kop + ' — het toerental beweegt ' + afr(rpmBereik) +
          ' bij ' + Math.round(rpm) + ' rpm en haalt de drempel niet. De reeks is in orde; ' +
          'dit is het getal waar #66 om vraagt: bij dit motortoerental is 2% van het volle ' +
          'bereik te grof om een trendlijn te krijgen' };

      return kop;
    }
  },

  // ── #64: komt het antwoord op de meetcontext werkelijk in de prompt? ──
  // De kern van dat issue in één zin: "verandert er niets, dan komt de regel
  // niet aan en is de hele vraag versiering". Dat is precies wat hier getoetst
  // wordt — niet of het venster mooi is, maar of een gegeven antwoord de
  // promptregel haalt. En is er niets beantwoord, dan is DAT het cijfer waar
  // het issue om vraagt: hoe vaak wordt het venster werkelijk ingevuld?
  {
    issue: '#64',
    naam: 'Een beantwoorde meetcontext haalt de AI-prompt',
    waarom: 'Alleen op een toestel waar een mens de vragen echt beantwoord heeft, is dit te meten.',
    proef: function () {
      if (typeof plMeetcontextPromptLine !== 'function')
        return { staat: 'FOUT', detail: 'plMeetcontextPromptLine() ontbreekt — dan gaat de meetcontext ' +
          'nooit mee, hoe vaak een gebruiker de vragen ook beantwoordt (#64)' };

      let m = null;
      try { m = window._plMeetcontext; } catch (e) { console.warn('_plMeetcontext onleesbaar bij de #64-proef', e); }
      let regel = '';
      try { regel = plMeetcontextPromptLine() || ''; } catch (e) {
        return { staat: 'FOUT', detail: 'plMeetcontextPromptLine() gooide een fout: ' + (e.message || e) };
      }

      // Wat de app zélf al zou invullen. Sinds 17-09-2026 vult het venster de
      // start/stop-vraag voor uit de aandrijfstatus; is er niets beantwoord,
      // dan is dát nog steeds het cijfer waar #64 om vraagt, maar het voorstel
      // erbij zegt of die voorvulling op deze auto werkelijk iets oplevert.
      var voorstel = '';
      try {
        if (typeof plMeetStartStopVoorstel === 'function') {
          var vs = plMeetStartStopVoorstel();
          voorstel = ' Het venster zou start/stop nu voorstellen op "' +
            (vs.waarde || 'weet ik niet') + '" (' + vs.reden + ').';
        }
      } catch (e) { console.warn('plMeetStartStopVoorstel() gooide een fout bij de #64-proef', e); }

      if (!m)
        return { staat: 'LET OP', detail: 'het meetcontextvenster is deze sessie niet beantwoord — ' +
          'en juist dat is het getal waar #64 om vraagt: hoe vaak wordt er werkelijk geantwoord?' + voorstel };

      const vragen = (typeof PL_VOORVRAGEN !== 'undefined') ? PL_VOORVRAGEN : [];
      let gegeven = [];
      try {
        gegeven = vragen.filter(function (v) { return m[v.key]; })
                        .map(function (v) { return v.key + '=' + m[v.key]; });
      } catch (e) { console.warn('PL_VOORVRAGEN niet af te lopen bij de #64-proef', e); }
      const extra = String((m && m.extra) || '').trim();

      if (!gegeven.length && !extra)
        return { staat: 'LET OP', detail: 'het venster is geopend maar alles bleef op "weet ik niet" — ' +
          'ook dat is een antwoord op #64.' + voorstel };

      // DIT is de toets. Er is iets ingevuld, dus er hoort iets in de prompt te
      // staan. Staat daar niets, dan is de vraag inderdaad versiering.
      if (!regel.trim())
        return { staat: 'FOUT', detail: 'beantwoord (' + gegeven.join(', ') +
          (extra ? ', plus een opmerking' : '') + ') maar de promptregel is leeg — ' +
          'het antwoord bereikt de AI niet (#64)' };

      /* Met hoeveel handelingen. Een voorgevuld antwoord dat blijft staan is
         een antwoord voor de AI maar geen keuze van een mens, en juist dat
         onderscheid is wat #64 punt 3 wil weten. */
      var bron = (m && m.bron) || {};
      var perBron = { klik: 0, voorstel: 0, eerder: 0 };
      Object.keys(bron).forEach(function (k) { if (perBron[bron[k]] !== undefined) perBron[bron[k]]++; });
      var herkomst = (m && m.bron)
        ? '; ' + perBron.klik + ' aangeklikt, ' + perBron.voorstel + ' uit de meting overgenomen' +
          (perBron.eerder ? ', ' + perBron.eerder + ' uit een eerdere ronde' : '')
        : '; herkomst niet vastgelegd (venster van vóór 17-09)';

      return gegeven.length + ' van de ' + vragen.length + ' vragen beantwoord (' + gegeven.join(', ') + ')' +
        (extra ? ' plus een vrije opmerking' : '') + herkomst + '; de promptregel draagt ' +
        regel.trim().split('\n').length + ' regel(s) mee';
    }
  },

  // ── #133: weet de analyse dat de verbinding is weggevallen? ──
  // Het issue in één zin: valt de verbinding weg, dan moet de analyse dóór
  // krijgen dat de auto niet raar doet maar de data. plMeetStabielVoorstel()
  // (#62) telt de gaten en vult daarmee de vraag "stabiele meting" voor. De
  // faaltoestand is de tegenspraak: PLRit ziet een onderbreking en de
  // voorstelregel zegt "ja, stabiel" — dan krijgt de AI te horen dat de meting
  // schoon was.
  //
  // AANVULLING 10-09-2026. Deze proef toetste eerst alleen PLRit.gaten() (het
  // loopgat). Op de rit van 10-09 stond die op 0 terwijl de adapter 39 s weg
  // was: een BT-SPP-socket sterft niet, dus `connected` bleef true en de lus
  // tikte door zonder dat er iets gemeten werd. Precies wat deze proef had
  // moeten vangen, ving hij niet. Het meetgat (PLRit.meetgaten()) is
  // toegevoegd voor dát geval en telt hier nu mee.
  {
    issue: '#133',
    naam: 'Een weggevallen verbinding komt in het oordeel over de meting terecht',
    waarom: 'Alleen tijdens een rit vallen er gaten; nagebouwd bewijst dit niets over deze auto.',
    proef: function () {
      if (typeof plMeetStabielVoorstel !== 'function')
        return { staat: 'FOUT', detail: 'plMeetStabielVoorstel() ontbreekt — dan gaat er geen enkel ' +
          'oordeel over de meetkwaliteit mee naar de analyse (#133)' };

      let v = null;
      try { v = plMeetStabielVoorstel() || {}; }
      catch (e) { return { staat: 'FOUT', detail: 'plMeetStabielVoorstel() gooide een fout: ' + (e.message || e) }; }

      let gaten = [], meetgaten = [];
      try { gaten = (window.PLRit && window.PLRit.gaten) ? (window.PLRit.gaten() || []) : []; }
      catch (e) { console.warn('PLRit.gaten() onleesbaar bij de #133-proef', e); }
      try { meetgaten = (window.PLRit && window.PLRit.meetgaten) ? (window.PLRit.meetgaten() || []) : []; }
      catch (e) { console.warn('PLRit.meetgaten() onleesbaar bij de #133-proef', e); }
      const onderbroken = gaten.length + meetgaten.length;

      const kop = 'voorstel "stabiele meting": ' + (v.waarde || '(leeg)') + ' — ' + (v.reden || '?') +
        '; PLRit telt ' + gaten.length + ' loopgat(en) en ' + meetgaten.length + ' meetgat(en) in deze rit';

      if (onderbroken && v.waarde === 'ja')
        return { staat: 'FOUT', detail: kop + ' — de rit zag een onderbreking en de analyse krijgt ' +
          'te horen dat de meting schoon was. Dan wijt de AI het aan de auto (#133)' };

      if (!onderbroken && !v.waarde)
        return { staat: 'LET OP', detail: kop + ' — nog geen oordeel te geven; rijd door of wacht ' +
          'tot de datastroom als stabiel gemeld is' };

      return kop;
    }
  },

  // ── de kostenraming hangt aan de uitvoer, niet aan het plafond ──
  // test-uitvoerschatting.js toetst de rekenregel op een verse, nagemaakte
  // opslag. Dit toestel heeft iets wat die test niet kan hebben: een ECHT
  // gegroeide kalibratie in localStorage, opgebouwd uit de analyses die hier
  // gedraaid zijn. Juist daar zou de migratie stil kunnen mislukken — een
  // opslag van vóór 08-09-2026 draagt alleen {tpt, uf, n}, en als het aanvullen
  // daarvan niet werkt is de raming NaN. Een NaN-vergelijking in preflight() is
  // altijd false, dus dan blokkeert de saldopoort niets meer en merkt niemand
  // het tot er een rekening komt.
  {
    issue: '#114',
    naam: 'De kostenraming schaalt niet mee met het max_tokens-plafond',
    waarom: 'Alleen dit toestel heeft een echt gegroeide kalibratie; een verse opslag zou de migratie niet toetsen.',
    proef: function () {
      if (!window.PLCredits || typeof PLCredits.ontleed !== 'function')
        return { staat: 'FOUT', detail: 'PLCredits.ontleed() ontbreekt — dan is de kostenraming niet te meten' };

      const p = 'x'.repeat(4000), s = 'y'.repeat(500);
      let laag, hoog;
      try {
        laag = PLCredits.ontleed(p, s, 4000);
        hoog = PLCredits.ontleed(p, s, 16000);
      } catch (e) {
        return { staat: 'FOUT', detail: 'ontleed() gooide een fout: ' + (e.message || e) };
      }

      // Eerst het stille geval: een raming die geen getal is.
      if (!isFinite(laag.uitTok) || !isFinite(laag.credits))
        return { staat: 'FOUT', detail: 'de raming is geen getal (uitTok=' + laag.uitTok +
          ', credits=' + laag.credits + ') — dan laat de saldopoort alles door (#114)' };

      let kalib = null;
      try { kalib = JSON.parse(localStorage.getItem('pl_credits_kalib') || 'null'); } catch (e) { /* stil: opslag kan corrupt zijn */ }
      const metingen = (kalib && kalib.uitN) || 0;

      const kop = 'raming bij plafond 4000: ' + laag.uitTok + ' tokens (' + laag.credits +
        ' credits), bij 16000: ' + hoog.uitTok + ' (' + hoog.credits + '); ' +
        metingen + ' uitvoermeting(en) op dit toestel';

      // Zonder metingen valt de raming bewust terug op de oude vorm, en dán
      // hoort hij wél mee te schalen. Dat is geen fout maar een koude start.
      if (metingen === 0)
        return { staat: 'LET OP', detail: kop + ' — nog geen enkele analyse gemeten, dus de ' +
          'raming staat nog op de koude-startvorm (maxTokens x uitvoerFactor) en schaalt terecht mee' };

      if (hoog.uitTok > laag.uitTok)
        return { staat: 'FOUT', detail: kop + ' — een ruimer plafond geeft een hogere raming, ' +
          'dus het plafond stuurt de kosten nog steeds. Dan sluit een verhoging van max_tokens ' +
          'klanten buiten op tegoed dat ze niet nodig hebben (#114)' };

      return kop;
    }
  },

  // ── #115: geeft de buspoort het slot altijd terug? ──
  // De reparatie van deze ronde is niet "er staat een helper", maar dat het
  // slot niet meer met de hand teruggegeven hoeft te worden. Het enige wat een
  // handgeschreven finally fout kan doen is hem vergeten — en dan hangt de bus
  // tot het einde van de sessie, buiten élke noodrem van PLBus om. Dit meet dat
  // op het ECHTE slot van dit toestel, niet op een nagebouwde.
  {
    issue: '#115',
    naam: 'De buspoort geeft het slot terug, ook als het werk klapt',
    waarom: 'Toetst het echte PLBus van deze sessie; een nagebouwd slot zou alleen zichzelf bewijzen.',
    proef: async function () {
      if (typeof withBusOfNiets !== 'function')
        return { staat: 'FOUT', detail: 'withBusOfNiets() ontbreekt — dan claimt elke ronde-lus weer met de hand (#115)' };
      if (!window.PLBus) return { staat: 'FOUT', detail: 'PLBus ontbreekt' };
      if (PLBus.busy())
        return { staat: 'LET OP', detail: 'de bus is nu van "' + PLBus.owner() + '" — deze proef claimt zelf en zou een lopende meting storen' };

      const uit = [];
      // 1. Vrije bus: het werk draait en het slot komt terug.
      let liep = 0;
      await withBusOfNiets('blok5-poort', async function () { liep++; });
      if (liep !== 1 || PLBus.busy())
        return { staat: 'FOUT', detail: 'op een vrije bus liep het werk ' + liep + 'x en het slot is ' +
          (PLBus.busy() ? 'NIET' : 'wel') + ' teruggegeven' };
      uit.push('vrije bus: werk draait, slot terug');

      // 2. DE KERN: een fout in het werk mag het slot niet gijzelen.
      let geknald = false;
      try { await withBusOfNiets('blok5-poort', async function () { throw new Error('proef'); }); }
      catch (e) { geknald = true; }
      if (!geknald)
        return { staat: 'FOUT', detail: 'een fout in het werk kwam niet naar buiten — dan verdwijnt een busstoring stil' };
      if (PLBus.busy())
        return { staat: 'FOUT', detail: 'na een fout in het werk houdt "' + PLBus.owner() + '" het slot vast — ' +
          'dat is precies de vergeten finally waar #115 over gaat, en geen noodrem vangt hem' };
      uit.push('fout in het werk: slot tóch terug');

      // 3. Bezette bus: de beurt wordt overgeslagen, niet afgepakt.
      // De houder is hier de poort zélf, geen losse claim met een eigen
      // finally: die staat sinds #115 alleen nog in pidlane-data.js, en deze
      // proef hoort daar geen uitzondering op te zijn.
      let liep2 = 0, bezet = 0;
      const gelukt = await withBusOfNiets('blok5-houder', async function () {
        await withBusOfNiets('blok5-poort', async function () { liep2++; }, function () { bezet++; });
        return true;
      });
      if (!gelukt) return { staat: 'LET OP', detail: uit.join('  |  ') + '  |  bezet-tak niet gemeten: het slot was niet te pakken' };
      if (liep2 !== 0 || bezet !== 1)
        return { staat: 'FOUT', detail: 'op een bezette bus liep het werk ' + liep2 + 'x en de uitweg ' + bezet + 'x — ' +
          'de poort praat dwars door een lopende lezer heen' };
      if (PLBus.busy())
        return { staat: 'FOUT', detail: 'na de bezet-proef houdt "' + PLBus.owner() + '" het slot nog vast' };
      uit.push('bezette bus: beurt overgeslagen');

      return uit.join('  |  ') + ' — en een los slot claimen kan alleen nog in pidlane-data.js';
    }
  },

  // ── #116: leest élke module een 41-antwoord met dezelfde parser? ──
  // Geen broncodetelling (die doet blok 11), maar de vraag eronder: geeft de
  // decoder ná de verhuizing hetzelfde getal, óók bij de antwoordvormen waar
  // zijn eigen indexOf-lus op stukliep? Dit draait op de echte PLVerify van
  // deze build, met de echte PID_BYTE_LEN van dit toestel.
  {
    issue: '#116',
    naam: 'De focus-decoder leest een antwoord met framemarkers goed',
    waarom: 'Draait op de geladen PLVerify en de geleerde bytelengtes van dit toestel — niet op een kopie.',
    proef: function () {
      if (!window.PLVerify || typeof PLVerify._decode !== 'function')
        return { staat: 'FOUT', detail: 'PLVerify._decode() ontbreekt' };
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse() ontbreekt — dan is er geen ene plek om door te lopen' };

      // Dezelfde bytes, drie verpakkingen. 0x0B95 / 4 = 741 toeren.
      const kaal = PLVerify._decode('010C', '41 0C 0B 95');
      const metHdr = PLVerify._decode('010C', '7E8 04 41 0C 0B 95');
      const metFrames = PLVerify._decode('010C', '004 0:410C 1:0B95');
      if (kaal !== 741)
        return { staat: 'FOUT', detail: 'een kaal antwoord 410C0B95 gaf ' + kaal + ' in plaats van 741 toeren' };
      if (metHdr !== kaal || metFrames !== kaal)
        return { staat: 'FOUT', detail: 'zelfde bytes, andere uitkomst: kaal ' + kaal + ', met CAN-header ' + metHdr +
          ', met framemarkers ' + metFrames + ' — de decoder gaat om splitBatchResponse heen (#116)' };

      // De odometer: zonder PID_BYTE_LEN['A6'] valt de helper terug op één byte
      // en wordt 248.000 km ineens 24.
      const odo = splitBatchResponse('41 A6 00 25 D7 90', ['01A6'])['01A6'];
      if (!odo || odo.length !== 4)
        return { staat: 'FOUT', detail: '01A6 kwam terug met ' + (odo ? odo.length : 0) +
          ' byte(s) in plaats van 4 — de odometer leest dan een fractie van de kilometerstand' };

      return '741 toeren uit alle drie de verpakkingen (kaal, CAN-header, framemarkers) en 01A6 in vier bytes';
    }
  },

  // ── #117: doet de ene fetch-helper wat hij belooft, op DIT toestel? ──
  // De basis-URL is hier geen testwaarde maar de echte PROXY_URL van deze
  // build, en de tokenkop hangt aan de sessie die nu ingelogd is. Dat is
  // precies het stuk dat een node-test niet kan zien.
  {
    issue: '#117',
    naam: 'plFetch bouwt de URL en de tokenkop van dit toestel',
    waarom: 'PROXY_URL en APP_TOKEN zijn hier de echte van deze sessie; een node-test kent alleen verzonnen waarden.',
    proef: async function () {
      if (typeof plFetch !== 'function' || typeof plFetchUrl !== 'function')
        return { staat: 'FOUT', detail: 'plFetch() ontbreekt — dan beslist elke aanroep weer zelf over URL, token en 401 (#117)' };
      if (typeof PROXY_URL === 'undefined' || !PROXY_URL)
        return { staat: 'LET OP', detail: 'geen PROXY_URL op dit toestel — niets te bouwen' };

      const basis = String(PROXY_URL).replace(/\/$/, '');
      const met = plFetchUrl('/klant/mij'), zonder = plFetchUrl('klant/mij');
      if (met !== basis + '/klant/mij' || zonder !== met)
        return { staat: 'FOUT', detail: 'URL-opbouw klopt niet: "/klant/mij" → ' + met + ', "klant/mij" → ' + zonder };
      const abs = 'https://api.airtable.com/v0/x/y';
      if (plFetchUrl(abs) !== abs)
        return { staat: 'FOUT', detail: 'een absolute URL werd verbouwd tot ' + plFetchUrl(abs) + ' — dan is Airtable onbereikbaar' };

      // En dan de echte ketting. /api/config is een GET die niets verandert en
      // niets kost, maar hij gaat wél door de Worker heen — dus hij bewijst dat
      // de tokenkop die plFetch erop zet ook geaccepteerd wordt.
      if (!window.APP_TOKEN)
        return { staat: 'LET OP', detail: 'URL-opbouw klopt (' + met + '), maar zonder sessietoken is de tokenkop niet te toetsen — log in en draai opnieuw' };
      let r;
      try { r = await plFetch('/api/config'); }
      catch (e) {
        return { staat: 'LET OP', detail: 'URL-opbouw klopt, maar de Worker is niet bereikbaar: ' + ((e && e.message) || e) };
      }
      if (r.status === 401)
        return { staat: 'FOUT', detail: 'de Worker weigerde /api/config met 401 terwijl er een sessietoken is — ' +
          'plFetch zet de kop X-App-Token niet of niet goed' };
      if (!r.ok)
        return { staat: 'LET OP', detail: 'URL-opbouw klopt; /api/config gaf HTTP ' + r.status + ' (geen tokenprobleem, wel iets anders)' };
      return 'URL-opbouw klopt (' + met + ') en /api/config antwoordt met de kop die plFetch erop zette';
    }
  },

  // ── zet de beheerdersschakelaar béide demoknoppen weg? ──
  // De reviewnotitie in PLAY-INZENDING.md wijst naar één knop: "Try demo — no
  // adapter needed" op het loginscherm. Die knop hing tot 03-09 buiten
  // FEATURE_TOGGLES.feat_demo, dat alleen '[id="btnDemo"]' noemde — de knop in
  // het verbindscherm. Met feat_demo=false verdween dus de ene en bleef de
  // andere staan: zichtbaar, en bij aanraken alleen een toast "uitgeschakeld
  // door beheerder". Voor een reviewer die de notitie volgt is dat erger dan
  // geen knop.
  //
  // test-demo-toegang.js leest of beide id's in de lijst staan. Deze proef
  // doet iets anders en dat is de reden dat hij er is: hij DRAAIT de
  // schakelaar in de echte app en kijkt wat de CSS er werkelijk mee doet. Een
  // selector die er wel staat maar niets raakt — een hernoemd id, een regel
  // die door iets specifiekers wordt overstemd — komt alleen zo aan het licht.
  {
    issue: '#42',
    naam: 'De beheerdersschakelaar zet beide demoknoppen weg, of geen van beide',
    waarom: 'Alleen in de draaiende app is te zien wat de gegenereerde CSS werkelijk raakt; de bronlijst zegt dat niet.',
    proef: function () {
      if (typeof applyFeatureToggles !== 'function')
        return { staat: 'FOUT', detail: 'applyFeatureToggles() ontbreekt — dan doet geen enkele featureschakelaar nog iets' };

      const KNOPPEN = [
        { id: 'btnDemoLogin', waar: 'loginscherm (de knop uit de reviewnotitie)' },
        { id: 'btnDemo',      waar: 'verbindscherm' }
      ];
      const weg = [];
      for (const k of KNOPPEN) {
        if (!document.getElementById(k.id)) weg.push(k.id + ' (' + k.waar + ')');
      }
      if (weg.length)
        return { staat: 'FOUT', detail: 'demoknop niet in de DOM: ' + weg.join(', ') +
          ' — de reviewnotitie wijst naar een knop die er niet staat (#42)' };

      // De stand van vóór de proef, inclusief het geval dat de sleutel
      // helemaal niet in PID_CONFIG stond: dan moet hij daarna ook weer weg.
      const cfg = (window.PID_CONFIG = window.PID_CONFIG || {});
      const stond = Object.prototype.hasOwnProperty.call(cfg, 'feat_demo');
      const oud = cfg.feat_demo;
      const zichtbaar = function (id) {
        return getComputedStyle(document.getElementById(id)).display !== 'none';
      };

      let uit, na;
      try {
        cfg.feat_demo = false;
        applyFeatureToggles();
        uit = KNOPPEN.map(function (k) { return { id: k.id, waar: k.waar, zichtbaar: zichtbaar(k.id) }; });
      } finally {
        // Altijd terugzetten. Blijft feat_demo op false staan omdat deze proef
        // ergens klapte, dan heeft de testrun de demo uitgezet op het toestel
        // waarop de reviewer hem straks zoekt.
        if (stond) cfg.feat_demo = oud; else delete cfg.feat_demo;
        try { applyFeatureToggles(); } catch (e) {
          console.warn('Testrun: featureschakelaars niet teruggezet na de demoknop-proef', e);
        }
        na = KNOPPEN.map(function (k) { return zichtbaar(k.id); });
      }

      const blijven = uit.filter(function (k) { return k.zichtbaar; });
      if (blijven.length && blijven.length < uit.length)
        return { staat: 'FOUT', detail: 'met feat_demo=false bleef ' +
          blijven.map(function (k) { return '#' + k.id + ' op het ' + k.waar; }).join(' en ') +
          ' staan terwijl de andere verdween — een halve schakelaar laat een dode knop achter (#42)' };
      if (blijven.length === uit.length)
        return { staat: 'FOUT', detail: 'met feat_demo=false bleven beide demoknoppen staan — ' +
          'de schakelaar raakt niets; zijn de id\'s hernoemd?' };

      if (na.indexOf(false) >= 0)
        return { staat: 'FOUT', detail: 'na het terugzetten is een demoknop verborgen gebleven — ' +
          'deze proef heeft de demo uitgezet op dit toestel. Herlaad de app vóór de review' };

      return 'feat_demo=false verbergt beide demoknoppen (loginscherm én verbindscherm), ' +
        'en na het terugzetten staan ze allebei weer';
    }
  },

  // ── de km-check: zit hij in DEZE app, en oordeelt hij hier hetzelfde? ──
  // test-kmcheck.js dekt de rekenkant met 50 toetsen, en dat is de plek waar
  // die hoort. Wat node niet kan zien: of de module ook echt in de pagina
  // hangt, of de knop in de koopcheck naar een bestaande functie wijst, en of
  // het oordeel dat de geladen kopie geeft hetzelfde is als het oordeel dat
  // de test op schijf toetst. Precies die drie zijn hier stil kapot te maken —
  // een vergeten scripttag, een hernoemde functie, een tweede kopie.
  //
  // Geen bus nodig: PLKm.oordeel() is puur. Dat is met opzet zo gebouwd.
  {
    issue: '§4',
    naam: 'De km-check hangt in de app en oordeelt daar hetzelfde',
    waarom: 'Alleen de draaiende app laat zien of de module geladen is en of de knop in de koopcheck ergens op uitkomt.',
    proef: function () {
      if (!window.PLKm)
        return { staat: 'FOUT', detail: 'PLKm ontbreekt — pidlane-kmcheck.js hangt niet in index.html' };
      if (typeof PLKm.oordeel !== 'function' || typeof PLKm.check !== 'function')
        return { staat: 'FOUT', detail: 'PLKm mist oordeel() of check()' };
      if (typeof PLKm.draaiUI !== 'function')
        return { staat: 'FOUT', detail: 'PLKm.draaiUI() ontbreekt — de knop in de koopcheck roept iets aan dat niet bestaat' };

      const knop = document.getElementById('koopKmCheckBtn');
      const vak = document.getElementById('koopKmCheckUit');
      if (!knop || !vak)
        return { staat: 'FOUT', detail: 'de knop (#koopKmCheckBtn) of het uitvoervak (#koopKmCheckUit) staat niet in de koopcheck' };

      // Een teruggedraaide teller: motorblok 214.050, dashboard 118.000.
      const m = function (groep, km) {
        return { rol: 'odo', groep: groep, module: 'proef ' + groep, cmd: '220201', km: km, zeker: true };
      };
      const fraude = PLKm.oordeel([m('7E0', 214050), m('720', 118000)], null);
      if (fraude.niveau !== 'kritiek')
        return { staat: 'FOUT', detail: '96.000 km verschil tussen motorblok en dashboard levert hier "' +
          fraude.niveau + '" op in plaats van kritiek — de geladen module oordeelt anders dan de toets op schijf' };
      if (fraude.bevindingen[0].patroon !== 'teller-lager')
        return { staat: 'FOUT', detail: 'het verschil wordt gezien, maar niet als het patroon van een ' +
          'teruggedraaide teller — dan mist de koper de reden waarom het erg is' };

      // En de tegenkant: een gezonde auto mag hier geen alarm geven, anders
      // is een groene uitslag niets waard.
      const gezond = PLKm.oordeel([m('7E0', 89240), m('720', 89230)], null);
      if (gezond.niveau !== 'ok')
        return { staat: 'FOUT', detail: '10 km verschil op 89.240 levert "' + gezond.niveau +
          '" op — dat is een vals alarm bij een koper' };

      const stil = PLKm.oordeel([], null);
      if (stil.niveau !== 'onbekend' || stil.bevindingen.length)
        return { staat: 'FOUT', detail: 'een stille bus levert "' + stil.niveau + '" met ' +
          stil.bevindingen.length + ' bevinding(en) — afwezigheid mag nooit een verdenking worden' };

      return 'PLKm geladen met ' + PLKm.bronnen().length + ' bronnen, knop en uitvoervak aanwezig; ' +
        'de geladen kopie meldt de teruggedraaide teller als kritiek, de gezonde auto als ok en de ' +
        'stille bus als onbekend';
    }
  },

  // ── de kaartmaker: hangt hij erin, en staat de scanvlag uit? ──────
  // De vlag window._plScanActief zet de dode-socket-detectie in
  // pidlane-bt.js uit. Blijft hij per ongeluk aanstaan — een scan die klapte
  // vóór zijn finally, een tweede scan die de vlag van de eerste wist — dan
  // merkt de app de rest van de sessie niet meer dat de verbinding wegvalt.
  // Dat is precies het soort stille toestand dat alleen in de draaiende app
  // te zien is: op schijf staat de vlag nergens aan.
  {
    issue: '§21',
    naam: 'De kaartmaker hangt erin en laat geen scanvlag achter',
    waarom: 'Een blijven hangende scanvlag zet de dode-socket-detectie uit, en dat is alleen in de draaiende app te zien.',
    proef: function () {
      if (!window.PLKaart)
        return { staat: 'FOUT', detail: 'PLKaart ontbreekt — pidlane-kaart.js hangt niet in index.html' };
      if (typeof window.kaartStart !== 'function')
        return { staat: 'FOUT', detail: 'kaartStart() ontbreekt — de knoppen in dit paneel roepen iets aan dat niet bestaat' };

      const knoppen = Array.prototype.slice.call(document.querySelectorAll('#testrunOv button'))
        .filter(function (b) { return /Kaart maken|Volledig/.test(b.textContent || ''); });
      if (knoppen.length < 2)
        return { staat: 'FOUT', detail: 'de kaartknoppen staan niet in het testrunpaneel (' + knoppen.length + ' gevonden)' };

      if (window._plScanActief)
        return { staat: 'FOUT', detail: 'window._plScanActief staat AAN terwijl er geen scan loopt — ' +
          'de dode-socket-detectie in pidlane-bt.js is daarmee uitgeschakeld; verbreek en verbind opnieuw' };
      if (PLKaart.staat().bezig)
        return { staat: 'FOUT', detail: 'PLKaart meldt zichzelf als bezig terwijl er geen scan loopt' };

      // De leespoort van de gelááden kopie, niet die op schijf.
      const verboden = ['1101', '2EF19012', '31010203', '14FFFFFF', '2703'];
      const door = verboden.filter(function (c) { return PLKaart.magVerzenden(c).mag; });
      if (door.length)
        return { staat: 'FOUT', detail: 'de leespoort laat schrijvende commando\'s door: ' + door.join(', ') +
          ' — een scan mag de auto nooit veranderen' };
      if (!PLKaart.magVerzenden('22F190').mag)
        return { staat: 'FOUT', detail: 'de leespoort weigert een gewone leesvraag (22F190) — dan scant hij niets' };

      const zonderBron = PLKaart.trap().filter(function (t) { return !t.bron; });
      if (zonderBron.length)
        return { staat: 'FOUT', detail: zonderBron.length + ' trede(n) van de DID-trap zeggen niet waar ze vandaan komen — ' +
          'dan is niet te zien wat genormeerd is en wat ooit gegokt is' };

      const sch = PLKaart.schatting({ volledig: true });
      return 'PLKaart geladen, ' + PLKaart.trap().length + ' treden met bronvermelding, twee knoppen in dit paneel, ' +
        'scanvlag uit; de volledige sweep wordt vooraf opgegeven als ' + sch.tekst;
    }
  },

  // ── de VIN-poort van de kaartmaker, in de geladen app ────────────
  // De kaartrit van 04-09 om 11:49 vond vier stuurapparaten die 22F190
  // beantwoorden, en het verslag drukte die VIN vier keer als ruwe hex af —
  // in het testrunlogboek, dat geplakt en gedeeld wordt. Dat is het derde
  // VIN-pad uit §11, door de kaartmaker opnieuw geopend.
  //
  // test-kaart.js dekt de poort met een nagebouwde bus. Wat node NIET kan
  // zien: of de geladen kopie van PLKaart de poort van PLKm ook werkelijk
  // vindt. Die twee modules hangen los in index.html, en een hernoemde
  // interne functie zou de poort stilzwijgend openzetten — de bytes gaan dan
  // gewoon door, zonder fout, met de VIN erin.
  {
    issue: '§7',
    naam: 'De kaartmaker houdt de VIN buiten de kaart',
    waarom: 'Alleen in de draaiende app is te zien of PLKaart de VIN-poort van PLKm werkelijk vindt.',
    proef: async function () {
      if (!window.PLKaart) return { staat: 'FOUT', detail: 'PLKaart ontbreekt' };
      if (!window.PLKm || !PLKm._intern) return { staat: 'FOUT', detail: 'PLKm ontbreekt — dan is er geen VIN-poort' };
      if (typeof PLKm._intern.isVin !== 'function' || typeof PLKm._intern.bytesNaarTekst !== 'function')
        return { staat: 'FOUT', detail: 'PLKm._intern.isVin/bytesNaarTekst ontbreekt — de kaartmaker zoekt daarnaar ' +
          'achter een guard, dus zonder deze twee gaat de VIN ongemerkt de kaart in (§7)' };
      if (typeof PLKm.vinConsistentie !== 'function')
        return { staat: 'FOUT', detail: 'PLKm.vinConsistentie() ontbreekt — dan draagt de kaart wel VIN-metingen maar geen oordeel' };

      const proef = 'JMZKF6W7600766507';
      if (!PLKm._intern.isVin(proef))
        return { staat: 'FOUT', detail: 'de geladen kopie herkent een geldige VIN niet — de poort staat dan open' };
      if (PLKm._intern.isVin('B61L-67XK6-B'))
        return { staat: 'FOUT', detail: 'de geladen kopie ziet een onderdeelnummer aan voor een VIN' };

      const k = await PLKm._intern.vinKenmerk(proef);
      if (!k || !k.staart || k.staart.indexOf(proef.slice(-6)) < 0)
        return { staat: 'FOUT', detail: 'vinKenmerk() levert geen leesbare staart' };
      if (JSON.stringify(k).indexOf(proef) >= 0)
        return { staat: 'FOUT', detail: 'vinKenmerk() geeft de RUWE VIN terug — dat is precies wat niet mag (§7)' };
      if (!k.id)
        return { staat: 'LET OP', detail: 'geen pseudoniem (staat _vlVinPseudoniem klaar?) — de kaart maskeert dan wél, ' +
          'maar twee stuurapparaten zijn niet meer met elkaar te vergelijken' };

      const oud = PLKm.vinConsistentie([
        { rol: 'vin', module: 'proef A', groep: '7E0', vinId: 'x1', vinStaart: '…111111' },
        { rol: 'vin', module: 'proef B', groep: '720', vinId: 'x2', vinStaart: '…222222' }
      ]);
      if (oud.niveau !== 'kritiek')
        return { staat: 'FOUT', detail: 'twee verschillende voertuignummers leveren hier "' + oud.niveau +
          '" op in plaats van kritiek — de geladen kopie oordeelt anders dan de toets op schijf' };

      return 'VIN-poort staat: een geldige VIN wordt herkend, een onderdeelnummer niet, het kenmerk draagt ' +
        'alleen ' + k.staart + ' plus een pseudoniem, en twee verschillende nummers geven kritiek';
    }
  },

  // ── staat het logboek op tijd, of op tekst? ──
  // Het logboek sorteerde op de tijdstring "HH:MM:SS" terwijl BT en APP er sinds
  // #75 een epoch naast zetten. Binnen één dag valt dat niet op; over
  // middernacht zet het de nacht bovenaan (#140). Alleen hier te meten: node
  // heeft geen gevulde ringen, en de fout zit juist in de VOLGORDE van wat er
  // werkelijk in staat.
  {
    issue: '#140',
    naam: 'Het logboek staat op tijdvolgorde, ook over middernacht',
    waarom: 'De ringen zijn hier gevuld; de fout zat in de volgorde van échte regels, niet in een nagebouwde lijst.',
    proef: function () {
      if (!window.PLLogboek || typeof PLLogboek.verzamel !== 'function')
        return { staat: 'FOUT', detail: 'PLLogboek.verzamel() ontbreekt — dan is de volgorde van het logboek niet te meten' };
      const rijen = PLLogboek.verzamel();
      if (!rijen.length) return { staat: 'LET OP', detail: 'nog geen logregels — niets te sorteren' };

      const met = rijen.filter(function (r) { return typeof r.ms === 'number'; });
      if (!met.length)
        return { staat: 'FOUT', detail: rijen.length + ' regels en geen enkele met een epoch — het logboek sorteert dan ' +
          'weer op de kloktijd, en die loopt over middernacht terug (#140)' };

      for (let i = 1; i < met.length; i++) {
        if (met[i].ms < met[i - 1].ms)
          return { staat: 'FOUT', detail: 'regel ' + i + ' (' + met[i].t + ', ' + met[i].bron + ') staat ná ' +
            met[i - 1].t + ' terwijl hij ouder is — het logboek staat niet op tijdvolgorde' };
      }

      // Hoeveel dagen staan er in? Dat is precies het geval waarin de oude
      // sortering omviel, dus het is de moeite van het melden waard.
      const dagen = {};
      met.forEach(function (r) { dagen[new Date(r.ms).toDateString()] = 1; });
      const n = Object.keys(dagen).length;
      return met.length + ' van ' + rijen.length + ' regels dragen een epoch en staan op volgorde' +
        (n > 1 ? ', verdeeld over ' + n + ' dagen' : '');
    }
  },

  // ── staat de bevindingenschakelaar waar hij hoort? ──
  // Verhuisd uit het ☰-menu naar het Run-venster (#123). Twee dingen kunnen hier
  // stil misgaan: het knopje tekent niet (dan is de schakelaar onbereikbaar), of
  // het oude exemplaar staat er nog (dan zijn er twee plekken voor één stand).
  {
    issue: '#123',
    naam: 'De bevindingenschakelaar staat in het Run-venster en nergens anders',
    waarom: 'Alleen de DOM van de draaiende app laat zien of het knopje daadwerkelijk getekend wordt.',
    proef: function () {
      if (!window.PLRun || typeof PLRun.teken !== 'function')
        return { staat: 'FOUT', detail: 'PLRun.teken() ontbreekt — dan tekent het Run-venster niets' };
      if (typeof bevindingenZet !== 'function')
        return { staat: 'FOUT', detail: 'bevindingenZet() ontbreekt — de schakelaar zou dan niets doen' };

      const kebab = document.getElementById('kebabMenu');
      if (kebab && /bevindingenZet\(/.test(kebab.innerHTML))
        return { staat: 'FOUT', detail: 'het ☰-menu draagt de schakelaar nog steeds — twee plekken voor één stand (#123)' };

      // Het venster tekenen zonder het te openen: teken() vult de containers,
      // open() zet alleen display. Zo blijft het scherm van de gebruiker staan.
      const eerder = document.getElementById('runOv');
      const zichtbaar = !!(eerder && eerder.style.display === 'flex');
      if (!eerder) PLRun.open();
      PLRun.teken();
      const aan = document.getElementById('bevAanBtn'), uit = document.getElementById('bevUitBtn');
      if (!eerder && !zichtbaar) PLRun.sluit();

      if (!aan || !uit)
        return { staat: 'FOUT', detail: 'het Run-venster tekent geen Aan/Uit-knop voor de bevindingenbalk — ' +
          'de schakelaar is uit het ☰-menu weg en hier niet aangekomen (#123)' };

      const stand = (typeof bevindingenAan === 'function') ? (bevindingenAan() ? 'aan' : 'uit') : '?';
      const gemarkeerd = aan.classList.contains('on') || uit.classList.contains('on');
      if (!gemarkeerd)
        return { staat: 'LET OP', detail: 'de knoppen staan er maar geen van beide is gemarkeerd — ' +
          'bevindingenMenuBij() kleurt de stand niet' };

      return 'de schakelaar staat in het Run-venster (stand: ' + stand + ') en niet meer in het ☰-menu';
    }
  },

  // ── belooft een tegel nog dat een dubbeltik de sensor uitzet? ──
  // Sinds 02-09 verbergt een dubbeltik alleen; uitzetten is het kruisje in de
  // strook. De tooltip op de tegels bleef "sensor uitzetten" beloven — de enige
  // uitleg die er stond, en die was onjuist (#124).
  {
    issue: '#124',
    naam: 'De uitleg op een tegel klopt met wat een dubbeltik doet',
    waarom: 'De tegels bestaan pas als er gemeten wordt; hun tekst is alleen hier te lezen.',
    proef: function () {
      const tegels = document.querySelectorAll('.gc[id^="gc-"], .vast-item[id^="vt-"]');
      if (!tegels.length) return { staat: 'LET OP', detail: 'geen tegels in beeld — niets om te lezen' };

      let leeg = 0;
      for (let i = 0; i < tegels.length; i++) {
        const tip = tegels[i].title || '';
        if (!tip) { leeg++; continue; }
        if (/uitzetten/i.test(tip) && !/verbergen/i.test(tip))
          return { staat: 'FOUT', detail: 'tegel ' + tegels[i].id + ' belooft "' + tip + '" terwijl een dubbeltik ' +
            'alleen verbergt — de sensor blijft gemeten worden (#124)' };
      }
      if (leeg === tegels.length)
        return { staat: 'FOUT', detail: 'geen enkele van de ' + tegels.length + ' tegels draagt uitleg over de dubbeltik' };

      return tegels.length + ' tegels gelezen; de uitleg zegt verbergen en niet uitzetten';
    }
  },

  // ── hoort de AI wat er met DEZE meting mis was? ──
  // Tot 11-09 ging alles wat de app over zijn eigen meetkwaliteit wist naar
  // precies één lezer: dit verslag. De betaalde analyse kreeg er niets van mee,
  // en een gat van twee minuten leest dan als een sensor die uitvalt (#188).
  //
  // test-aanlevering.js toetst de regels in node. Wat dáár niet te zien is, is
  // of de module in de DRAAIENDE app dezelfde bronnen leest als de rest: PLRit
  // en PLAchtergrond bestaan in node niet, en juist die koppeling was de
  // bevinding. Deze proef legt de twee lezers van hetzelfde feit naast elkaar —
  // lopen ze uiteen, dan leest er één de verkeerde bron.
  {
    issue: '#188',
    naam: 'De AI hoort de gaten in deze meting',
    waarom: 'PLRit en PLAchtergrond bestaan alleen in de draaiende app; hun koppeling is alleen hier te meten.',
    proef: function () {
      if (!window.PLAanlevering)
        return { staat: 'FOUT', detail: 'PLAanlevering ontbreekt — de AI krijgt dan niets over de meetkwaliteit te horen (#188)' };

      const ob = PLAanlevering.onderbrekingen();
      if (ob === null)
        return { staat: 'LET OP', detail: 'noch PLRit noch PLAchtergrond is bereikbaar — er valt niets te vergelijken' };

      // Twee lezers van hetzelfde feit. Dit is de hele proef: de module mag
      // geen eigen telling hebben, hij hoort die van PLRit door te geven.
      const echt = window.PLRit ? PLRit.gaten().length : null;
      if (echt !== null && ob.loopgaten !== echt)
        return { staat: 'FOUT', detail: 'PLRit telt ' + echt + ' gat(en), de aanlevering meldt ' + ob.loopgaten +
          ' — de module leest een andere bron dan het verslag (#188)' };

      const wegEcht = window.PLAchtergrond ? PLAchtergrond.perioden().length : null;
      if (wegEcht !== null && ob.perioden !== null && ob.perioden !== wegEcht)
        return { staat: 'FOUT', detail: 'PLAchtergrond kent ' + wegEcht + ' periode(n), de aanlevering meldt ' +
          ob.perioden + ' (#188)' };

      /* DE HAAK ZELF WORDT HIER NIET GEMETEN, EN DAT IS EEN BESLUIT.

         Er stond hier eerst een broncodecontrole: staat de tekst
         "PLAanlevering.blok" in apiFetch. Die is op 11-09 nagemeten door de haak
         op `if(false)` te zetten — en hij bleef groen. Hij bewees dat er een
         regel stond, niet dat die regel iets deed, en dat is precies de proef
         die CLAUDE.md waardeloos noemt.

         De echte vraag is gedrag: komt het blok in de systeemprompt die
         verstuurd wordt. Dat is te meten door plFetch te onderscheppen, maar
         niet hier: deze proef draait midden in een rit in de app van een klant,
         en de verzendlaag onderuit halen om te kijken of hij het goed doet is
         een risico dat niet bij een testrun hoort. Het staat in
         bproef-aanlevering.js, dat bij elke push in CI draait en waar de
         tegenproef ook echt rood wordt. */

      const blok = PLAanlevering.blok({ set: 'monteur' });
      if (!blok)
        return { staat: 'LET OP', detail: 'er is nog niets gemeten, dus het blok is leeg — dat is de bedoeling' };

      /* EN DE DEKKING OVER HET PROFIEL DAT NU DRAAIT. De aanroepplekken geven
         geen PID-lijst mee maar de profielnaam die ze tóch al noemen in
         ensurePIDsActive(). relevantSupportedPIDs() schrijft die naam op in
         window._laatstProfiel, dus hier valt te zien wat de laatste analyse
         werkelijk vroeg — en of de dekking daar iets over te zeggen heeft.
         Levert die niets op terwijl er wel een profiel liep, dan is de naam
         verkeerd gespeld en verdwijnt de dekking stil uit elke analyse. */
      const prof = window._laatstProfiel || '';
      let dekTxt = 'nog geen analyseprofiel opgevraagd deze rit';
      if (prof) {
        const kern = PLAanlevering.profielSet(prof);
        if (!kern)
          return { staat: 'FOUT', detail: 'profiel "' + prof + '" staat niet in ANALYSE_PIDS — ' +
            'een analyse met deze naam levert stil geen dekking op (#188)' };
        const dek = PLAanlevering.dekking({ profiel: prof });
        dekTxt = 'profiel "' + prof + '": ' + dek.geleverd.length + ' van ' + dek.nodig.length +
          ' sensoren leveren data' + (dek.ontbreekt.length ? ', ' + dek.ontbreekt.length + ' ontbreekt' : '');
      }

      const stukken = [];
      if (ob.perioden) stukken.push(ob.perioden + '\u00d7 achtergrond');
      if (ob.loopgaten) stukken.push(ob.loopgaten + ' loopgat(en)');
      if (ob.meetgaten) stukken.push(ob.meetgaten + ' meetgat(en)');
      if (ob.herverbindingen) stukken.push(ob.herverbindingen + ' herverbinding(en)');
      return blok.length + ' tekens gaan mee naar de AI' +
        (stukken.length ? ', met ' + stukken.join(', ') : ', zonder onderbrekingen') +
        '; de tellingen komen overeen met het verslag. ' + dekTxt;
    }
  },

  // ── kwam het ritrapport er, en stonden de twee soorten regels uit elkaar? ──
  // #196 was geen rekenfout maar een vormfout: ritLogs droeg fase-regels mét
  // stats en onderbrekingsregels zonder, en het rapport las ze allebei als
  // fases. In node is dat nu getoetst met een nagebouwde rit, en in de browser
  // met een gezette lijst. Wat op geen van beide plekken kan: een ECHTE rit,
  // waar de onderbreking ontstaat doordat Android de app wegzet en niet doordat
  // een test visibilitychange afvuurt. Alleen hier staat de lijst zoals hij na
  // een rit werkelijk is.
  {
    issue: '#196',
    naam: 'De onderbrekingen van de rit staan buiten de fase-lijst',
    waarom: 'Alleen een gereden rit vult ritLogs; in node en in de browserproef is die lijst gezet in plaats van gemeten.',
    proef: function () {
      if (typeof ritLogs === 'undefined' || typeof ritPauzeLog === 'undefined')
        return { staat: 'FOUT', detail: 'ritLogs of ritPauzeLog bestaat niet — pidlane-rit.js is niet geladen' };
      if (!ritLogs.length)
        return { staat: 'LET OP', detail: 'er is deze sessie geen rit-analyse afgerond, dus er is niets om de vorm van af te lezen' };

      // 1. De vormfout zelf. Eén regel zonder stats is genoeg om het rapport
      //    om te gooien, en dat kostte op 11-09 dertien minuten meetdata.
      const zonder = ritLogs.filter(function (l) { return !l || !l.stats; });
      if (zonder.length)
        return { staat: 'FOUT', detail: zonder.length + ' van de ' + ritLogs.length +
          ' regels in ritLogs heeft geen stats' +
          (zonder[0] && zonder[0].type ? ' (type "' + zonder[0].type + '")' : '') +
          ' — generateRitRapport() valt daarop om vóór de AI-call (#196)' };

      // 2. En de andere kant: de onderbrekingen horen wél ergens te staan.
      //    Waren ze er (PLRit/PLAchtergrond weten dat onafhankelijk) maar is
      //    ritPauzeLog leeg, dan zijn ze bij het splitsen kwijtgeraakt en weet
      //    het rapport niet meer waar de gaten zaten.
      var achtergrond = null;
      try { achtergrond = (window.PLAchtergrond && PLAchtergrond.perioden) ? PLAchtergrond.perioden().length : null; }
      catch (e) { return { staat: 'FOUT', detail: 'PLAchtergrond.perioden() faalde: ' + (e && e.message) }; }
      if (achtergrond && !ritPauzeLog.length)
        return { staat: 'LET OP', detail: 'PLAchtergrond telde ' + achtergrond + ' achtergrondperiode(n) maar ritPauzeLog is leeg — ' +
          'die vielen buiten de rit, of de onderbreking is niet geregistreerd' };

      // 3. Hangt elk gat aan een fase die bestaat? Een index buiten de lijst
      //    verdwijnt stil: de seconden staan nergens meer in het rapport.
      const buiten = ritPauzeLog.filter(function (p) {
        return typeof p.faseIdx !== 'number' || p.faseIdx < 0 || p.faseIdx >= ritLogs.length;
      });
      if (buiten.length)
        return { staat: 'FOUT', detail: buiten.length + ' onderbreking(en) wijzen naar een fase die niet in ritLogs staat — ' +
          'die seconden komen in geen enkele fase van het rapport terecht (#196)' };

      const sec = ritPauzeLog.reduce(function (a, p) { return a + (p.sec || 0); }, 0);
      return ritLogs.length + ' fases, alle met stats; ' + ritPauzeLog.length +
        ' onderbreking(en) van samen ' + sec + ' s, elk toegewezen aan een bestaande fase' +
        (achtergrond === null ? '' : ' (PLAchtergrond telde ' + achtergrond + ' periode(n))');
    }
  },

  // ── stopt de parser bij een tweede bericht? ──
  // De opgenomen regel van 16-09-2026, uit het BT-log van een goedkope
  // ELM327-kloon. Zonder de stop uit #210 vulden de echobytes (41 0B) de
  // opgegeven lengte precies af en kwam 0110 eruit op 166,51 g/s — een schone,
  // complete parse volgens de parser zelf, terwijl een losse 0110 in diezelfde
  // seconde 1,45 g/s gaf. Geen MIST, geen melding, en binnen de harde limiet
  // van 0-655, dus dat getal komt overal doorheen.
  //
  // Dit is gedrag en geen broncode: de échte functie krijgt de échte bytes.
  {
    issue: '#210',
    naam: 'Een herhaald frame levert een gat op en geen verzonnen getal',
    waarom: 'De parser draait hier met de tabellen en geleerde bytelengtes van DEZE auto; in node zijn die leeg.',
    proef: function () {
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse ontbreekt — de parser waar de hele app op draait is niet geladen' };

      var echo = '008\r0:410B1E0E8B10\r008\r1:410B\r2:00760000000000\r\r>';
      var uit = splitBatchResponse(echo, ['010B', '010E', '0110']);

      if ('0110' in uit) {
        var b = uit['0110'];
        var g = (b && b.length >= 2) ? ((b[0] * 256 + b[1]) / 100) : null;
        return { staat: 'FOUT', detail: '0110 kwam uit een geëchood antwoord terug' +
          (g === null ? '' : ' op ' + g.toFixed(2) + ' g/s') +
          ' — de stop bij het tweede bericht werkt niet (#210)' };
      }
      if (!('010B' in uit) || !('010E' in uit))
        return { staat: 'FOUT', detail: 'de twee PIDs vóór de echo vielen ook weg (' +
          Object.keys(uit).join(', ') + ') — er wordt te vroeg gestopt' };
      if (uit['010B'][0] !== 0x1E)
        return { staat: 'FOUT', detail: '010B las ' + uit['010B'][0] + ' in plaats van 30 — de bytes schuiven op' };

      // En de tegenkant: een schoon antwoord mag hier niets van merken.
      var schoon = splitBatchResponse('008\r0:410C08A50D00\r1:111C\r\r>', ['010C', '010D', '0111']);
      if (!('0111' in schoon))
        return { staat: 'FOUT', detail: 'een SCHOON multiframe-antwoord verliest nu zijn laatste PID — de stop slaat te vroeg toe' };

      var s = null;
      try { s = (window.PLBus && PLBus.stats) ? PLBus.stats() : null; } catch (e) { s = null; }
      return 'echo levert een gat op (0110 ontbreekt), schoon antwoord blijft compleet' +
             (s ? '; deze sessie ' + s.echoTot + ' herhaalde antwoorden op de echte bus' : '');
    }
  },

  // ── doet de handmatige stand werkelijk iets? ──
  // Een schuifje dat het tempo niet verzet is erger dan geen schuifje: het
  // wekt vertrouwen dat er niets onder zit. Deze proef zet de stand écht om,
  // meet het effect op de multiplier, en zet alles terug zoals het stond.
  // Draait tijdens een rit, dus het terugzetten is geen nettigheid maar een
  // voorwaarde.
  //
  // HET IJKPUNT LIGT IN DE HANDMATIGE STAND ZELF (17-09-2026). Tot vandaag
  // las deze proef het interval vóór het overnemen en eiste daarna een
  // verdubbeling. Dat gaat alleen op als de automaat toevallig op 100% staat:
  // `handmatig(true)` neemt met opzet de stand over die er stond, dus op een
  // teruggeschroefde bus meet je 55% tegen 50% en dat is geen verdubbeling.
  // Zie §11.
  {
    issue: '#211',
    naam: 'De handmatige stand van het adapterpaneel verzet het tempo echt',
    waarom: 'Alleen in de draaiende app hangt pidPollInterval() aan PLLoad; in node is die koppeling er niet.',
    proef: function () {
      if (!window.PLAdapter) return { staat: 'FOUT', detail: 'PLAdapter ontbreekt — het verbindingspaneel is niet geladen' };
      if (!window.PLLoad || typeof PLLoad.handmatig !== 'function')
        return { staat: 'FOUT', detail: 'PLLoad.handmatig() ontbreekt — de knop in het paneel kan dan niets omzetten' };
      if (typeof pidPollInterval !== 'function')
        return { staat: 'FOUT', detail: 'pidPollInterval() ontbreekt — dan is niet te meten of het tempo doorwerkt' };

      var warenHandmatig = PLLoad.isHandmatig();
      var oudTempo = PLLoad.staat().tempoPct;
      var oudGroep = 3, oudVast = false;
      try { oudGroep = PLBus.batchGroep(); oudVast = PLBus.batchVast(); } catch (e) { /* stil: dan blijft de terugzet-stand de standaard */ }
      var fout = null, letop = null, gemeten = '';
      try {
        // Eerst overnemen, dán pas het ijkpunt lezen — anders meet je de
        // automaat en niet het schuifje.
        PLLoad.handmatig(true, 'blok 5');
        PLLoad.zetTempo(100);

        /* Een PID die op de bodem van 80 ms ligt kan hier niets bewijzen:
           Math.max() knijpt het verschil weg en dan geeft een wérkende
           multiplier tóch geen verdubbeling. Focus-PIDs (vast op 120 ms) en
           PIDs die de EV-modus uitzet (999999) vallen om dezelfde reden af.
           Vandaar een lijstje en niet één vaste PID. */
        var kandidaten = ['010C', '010D', '0104', '010B', '0111', '0105', '010F'];
        var probe = null, vol = 0;
        for (var i = 0; i < kandidaten.length; i++) {
          var kpid = kandidaten[i];
          if (typeof _focusPIDs !== 'undefined' && _focusPIDs && typeof _focusPIDs.has === 'function'
              && _focusPIDs.has(kpid)) continue;
          var ms = pidPollInterval(kpid);
          if (ms > 80 && ms < 99999) { probe = kpid; vol = ms; break; }
        }
        if (!probe) {
          letop = 'geen bruikbare PID om op te meten — alles lag op de bodem van 80 ms, stond op focus, ' +
                  'of was door de EV-modus uitgezet';
        } else {
          PLLoad.zetTempo(50);
          var half = pidPollInterval(probe);
          // Halve snelheid hoort het interval exact te verdubbelen. `vol` en
          // `half` zijn afgeronde hele milliseconden, en die afronding is met
          // twee ms gedekt — meer speling zou een halve fout doorlaten.
          if (Math.abs(half - vol * 2) > 2)
            fout = 'op 50% tempo ging ' + probe + ' van ' + vol + ' naar ' + half + ' ms terwijl ' +
                   (vol * 2) + ' ms hoort — de handmatige multiplier komt niet in pidPollInterval() aan';
          else gemeten = 'tempo 100% → 50%: ' + probe + ' van ' + vol + ' naar ' + half + ' ms; ';
        }

        // En de groep: vastzetten moet de automaat buiten de deur houden.
        if (!fout && !letop && window.PLBus && typeof PLBus.batchZet === 'function') {
          PLBus.batchZet(2, true);
          if (PLBus.batchKleiner() !== false)
            fout = 'PLBus.batchKleiner() verzette een vastgezette groep — de automaat regelt een handmatige keuze weg';
          else gemeten += 'groep 2 vastgezet: de automaat komt er niet aan';
        }
      } catch (e) {
        fout = 'de proef zelf viel om: ' + ((e && e.message) || e);
      } finally {
        // Terugzetten gebeurt hoe dan ook. Een proef die de app in een andere
        // stand achterlaat dan hij hem aantrof, meet de volgende ronde iets
        // anders dan hij denkt.
        try {
          PLLoad.zetTempo(oudTempo);
          PLLoad.handmatig(warenHandmatig, 'blok 5 zet terug');
          if (window.PLBus && typeof PLBus.batchZet === 'function') PLBus.batchZet(oudGroep, oudVast);
        } catch (e) { console.warn('Blok 5 kon de tempostand niet terugzetten:', e); }
      }
      if (fout) return { staat: 'FOUT', detail: fout };
      if (letop) return { staat: 'LET OP', detail: letop };
      return gemeten;
    }
  },

  // ── wijst het advies de goede kant op? ──
  // De meting zelf heeft een adapter nodig, het oordeel niet. Dit voert het
  // geval van 16-09 in — een verbinding die op elke trap frames herhaalt — en
  // controleert dat het advies dan over de GROEP gaat en niet over het tempo.
  // Harder pollen maakt een echo vaker; dat advies zou de fout vergroten.
  {
    issue: '#212',
    naam: 'Het snelheidsadvies wijst bij herhaalde frames naar de groep, niet naar het tempo',
    waarom: 'Het oordeel hoort los van de meting te draaien; alleen hier staat hij naast de echte PLBus-cijfers.',
    proef: function () {
      if (!window.PLAdapter || typeof PLAdapter.advies !== 'function')
        return { staat: 'FOUT', detail: 'PLAdapter.advies() ontbreekt — dan geeft de snelheidstest geen oordeel' };

      var metEcho = [
        { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 30, echo: 4 },
        { naam: 'vol gas', n: 50, perSec: 5.0, medMs: 190, soloMisPct: 0, batchOnvolPct: 35, echo: 9 }
      ];
      var a = PLAdapter.advies(metEcho, { perSec: 3, tempoPct: 60 });
      if (a.tempoPct !== null && a.tempoPct !== undefined)
        return { staat: 'FOUT', detail: 'bij 13 herhaalde antwoorden adviseert hij tempo ' + a.tempoPct +
          '% — harder pollen maakt een echo juist vaker (#211)' };
      if (a.groep !== 2)
        return { staat: 'FOUT', detail: 'bij herhaalde antwoorden adviseert hij geen kleinere groep maar "' + a.kop + '"' };

      // De tegenkant: zonder echo's hoort er wél een tempo uit te komen, en
      // dat moet rekenwerk zijn. 60% op 3/s, schoon tot 6/s → 120, afgekapt
      // op 100. Een advies dat altijd hetzelfde zegt, zegt niets.
      var schoon = [
        { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 0, echo: 0 },
        { naam: 'vol gas', n: 60, perSec: 6.0, medMs: 200, soloMisPct: 0, batchOnvolPct: 0, echo: 0 }
      ];
      var b = PLAdapter.advies(schoon, { perSec: 3, tempoPct: 60 });
      if (b.tempoPct !== 100)
        return { staat: 'FOUT', detail: 'schoon tot 6/s bij 3/s op 60% hoort 100% te adviseren, kreeg ' + b.tempoPct };

      var laatste = PLAdapter.laatsteMeting();
      return 'echo → groep 2, schoon → tempo 100%' +
             (laatste ? '; laatste echte test om ' + new Date(laatste.t).toTimeString().slice(0, 8) +
                        ': ' + laatste.advies.kop : '; nog geen echte test gedraaid deze sessie');
    }
  },

];

// Welke issues dekt blok 5 deze ronde? Afgeleid, niet opgeschreven. Dit is
// het antwoord op de vraag die tot 6.5 twee keer met de hand beantwoord werd:
// één keer in de banner boven _blok5() en één keer in CAMPAGNE. Beide konden
// verouderen zonder dat er iets rood werd; deze kan dat niet.
function _dekkingB5() {
  const uit = [];
  for (let i = 0; i < PROEVEN_B5.length; i++) {
    const q = PROEVEN_B5[i].issue;
    if (q && q !== '\u2014' && uit.indexOf(q) === -1) uit.push(q);
  }
  return uit;
}

// De loper. Hij kent de proeven niet en hoeft dus niet mee te veranderen
// als er een oplevering langskomt — dat was het hele punt van de lijst.
async function _blok5() {
  // Geen eigen stopcheck: _doe() kijkt zelf naar _trStop en boekt dan niets.
  // Er hier nóg een zetten zou een tweede plek maken die dezelfde beslissing
  // neemt, en dat is in dit project al drie keer een bug geweest.
  for (let i = 0; i < PROEVEN_B5.length; i++) {
    await _doe(5, PROEVEN_B5[i].naam, PROEVEN_B5[i].proef);
  }
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
/* De modulelijst voor blok 11 komt uit de DOM en niet uit een lijst hier.
   ─────────────────────────────────────────────────────────────────────
   Tot #116 liep punt 6 twee met de hand bijgehouden lijstjes van bestandsnamen
   af. Die liepen uit de pas, precies zoals CLAUDE.md over elke tweede lijst
   zegt: pidlane-testrun.js en pidlane-voertuigdata.js pakten allebei zelf een
   41-header uit en stonden in geen van beide. De telling meldde daardoor acht
   plekken over vijf modules terwijl het er elf over zeven waren — en de
   inventarisatie die de maat moest zijn, mat naast.
   De <script>-regels in index.html zijn de enige lijst die niet kan verouderen:
   staat een module er niet in, dan draait hij ook niet. */
function _appModules() {
  const uit = [];
  try {
    const el = document.querySelectorAll('script[src]');
    for (let i = 0; i < el.length; i++) {
      const src = String(el[i].getAttribute('src') || '').split('?')[0];
      if (/(^|\/)pidlane-[^/]+\.js$/.test(src) && uit.indexOf(src) === -1) uit.push(src);
    }
  } catch (e) { console.warn('Testrun: de modulelijst is niet uit de DOM te lezen — blok 11 telt dan niets', e); }
  return uit;
}

function _modNaam(pad) {
  return String(pad).replace(/^.*\//, '').replace('pidlane-', '').replace('.js', '');
}

/* Regels die met // of * beginnen zijn commentaar en geen code. Zonder deze
   zeef telt een zin ÓVER een aanroep mee als de aanroep zelf — en dan wordt
   het uitleggen van een reparatie een bevinding. */
function _zonderCommentaar(bron) {
  return String(bron).split('\n').filter(function (r) { return !/^\s*(\/\/|\*|\/\*)/.test(r); }).join('\n');
}

/* splitBatchResponse() zelf telt niet mee: dát indexOf('41') IS het uitpakken,
   en de helper die de telling meet als overtreder aanrekenen maakt de telling
   onhaalbaar. De ankers zijn dezelfde als die test-parser.js gebruikt om die
   functie los in te laden; verdwijnt er een, dan geeft dit null terug en meldt
   blok 11 het bestand als niet gelezen in plaats van stilletjes goed. */
function _zonderParser(bron) {
  const t = String(bron);
  const a = t.indexOf('function splitBatchResponse');
  if (a < 0) return _zonderCommentaar(t);
  const b = t.indexOf('window.plMeetPidLengte', a);
  if (b < 0) return null;
  return _zonderCommentaar(t.slice(0, a) + t.slice(b));
}

/* GEEN plFetch (#117): dit haalt geen server op maar een eigen bronbestand van
   dezelfde map — geen basis-URL, geen tokenkop, geen 401. Zou dit door plFetch
   lopen, dan kreeg elk bestandsnaampje er PROXY_URL voor geplakt. */
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
// 0155 en 0156 zijn er op 02-09 bij gekomen voor #40. De tabel zegt 2 bytes,
// de auto stuurt er 1 — maar dat is alleen te bewijzen als ze in de pollronde
// staan: PLPidLen leert uit metingen, en de run van 13:14 meldde "0 afwijkend"
// puur omdat ze die rit nooit langskwamen. Een issue dat je niet meet, sluit je
// ook niet.
const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C', '0155', '0156'];
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
  // De selectie van de GEBRUIKER, niet die van de sweep (#90). Blok 14 draait
  // ná blok 3, dus activePIDs staat hier vol met de sweeplijst.
  const inSelectie = _gebruikersSelectie().has(pid);
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
    // De MIL-familie komt uit PID_NUL_NORMAAL in pidlane-data.js (#78): daar
    // staat dat nul voor die PIDs de GEZONDE waarde is, en de gezondheidscheck
    // leest dezelfde lijst. Tot 02-09-2026 wist blok 14 dat wel ("hoort stil te
    // staan") en assessPidQuality het tegenovergestelde ("waarde gelijk aan
    // sensor-minimum — waarschijnlijk niet aanwezig"): twee plekken met een
    // tegenstrijdig oordeel over dezelfde PID. De letterlijke lijst hieronder
    // wint bij een dubbele sleutel, zodat de namen in dit rapport blijven staan
    // zoals ze waren.
    const MAG_STIL = Object.assign({}, (window.PID_NUL_NORMAAL || {}), {
      '0101': 'MIL-status', '0121': 'afstand met MIL aan', '011C': 'OBD-norm',
      '0113': 'O2-sensoren aanwezig', '0151': 'brandstoftype', '0163': 'referentiekoppel',
      '0165': 'aux-ondersteuning', '0141': 'monitors deze rit', '0103': 'brandstofsysteemstatus',
      '014D': 'tijd met MIL aan', '0130': 'warmlopen sinds wissen', '011F': 'motorlooptijd',
      // Steunbitmaskers. Ze staan in pidVals omdat blok 6 en de ontdekking ze
      // uitvragen, maar het zijn geen sensoren: "0120 vast op 160" is de eerste
      // byte van een bitmasker en betekent niets.
      '0100': 'steunbits 01-20', '0120': 'steunbits 21-40',
      '0140': 'steunbits 41-60', '0160': 'steunbits 61-80', '0102': 'DTC uit freeze frame'
    });
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
    const g = R.gaten(), mg = R.meetgaten(), hv = R.herverbindingen();
    const kop = Math.round(duur / 60) + ' min waargenomen, ' + R.tikken() + ' tikken, hoogste PID-telling ' +
      R.monsters() + ' verversingen, ' + g.length + ' loopgat(en), ' + mg.length + ' meetgat(en), ' +
      hv + ' herverbinding(en)';
    if (!g.length && !mg.length && !hv) return kop + ' — ononderbroken';

    /* ELK GAT TOEWIJZEN IN PLAATS VAN HET TOE TE SCHRIJVEN (08-09-2026, #18).
       Hier stond "een gat betekent dat de meetlus zelf niet liep (Android
       bevriest WebView-timers op de achtergrond)". Het eerste deel is waar —
       een gat IS een lus die niet liep. Het tweede is een oorzaak, en die werd
       aan élk gat toegekend zonder ernaar te kijken. Een gat door een dode
       adapter, een vastgelopen sweep of een trage bus las precies hetzelfde,
       en dat stuurt je op de verkeerde jacht.

       PLAchtergrond weet welke perioden de app werkelijk weg was. Valt een gat
       binnen zo'n periode, dan is het de achtergrondkwestie; valt het erbuiten,
       dan lag de lus stil terwijl de app gewoon in beeld stond — en dat is een
       heel ander en veel interessanter probleem. */
    let bgp = null;
    try { bgp = (window.PLAchtergrond && PLAchtergrond.perioden) ? PLAchtergrond.perioden() : null; }
    catch (e) { console.warn('blok 14: PLAchtergrond onleesbaar bij het toewijzen van de gaten', e); }
    const d = plGatDuiding(g, bgp);

    /* MEETGAT ERNAAST, NIET ERONDER (10-09-2026, #133). Een loopgat is de lus
       zelf die stilstond. Een meetgat is de lus die wél tikte maar geen enkele
       PID-stempel zag verschuiven — de rit van 10-09: 0 loopgaten, 39 s zonder
       één verschoven stempel, want een BT-SPP-socket sterft niet als de
       adapter zijn voeding verliest. Dat wijst naar de adapter of de bus, niet
       naar de achtergrond, en zonder deze telling zag PLRit.gaten() er niets
       van.

       EN SINDS 10-09 KRIJGT HET MEETGAT DEZELFDE DUIDING (#170). Er stond
       alleen een duur, en op de rit van 10-09 leverde dat `Meetgaten: 15 s,
       35 s, 75 s` op zonder dat te zien was welke de adapter was. Een meetgat
       binnen een achtergrondperiode is de AFGEKNEPEN achtergrond — de lus
       tikt door zonder loopgat te boeken, maar de data staat stil — en dat is
       #18 en niet de bus. */
    const md = plMeetgatDuiding(mg, bgp);

    return { staat: 'LET OP', detail: kop +
      (g.length ? '. Loopgaten: ' + d.lijst + d.duiding : '') +
      (mg.length ? '. Meetgaten: ' + md.lijst + md.duiding : '') +
      ' Volgt een herverbinding op een loopgat, dan is dat de achtergrondkwestie; volgt hij op een ' +
      'meetgat buiten de achtergrond, dan is dat de adapter of de bus; komt er geen van beide aan ' +
      'te pas, dan stierf een socket en herstelde hij tussen twee tikken. ' +
      'De eerste verbinding van een sessie telt sinds 02-09-2026 niet meer mee (#77), dus elke ' +
      'herverbinding hierboven is er ook echt een.' };
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
    // Niet activePIDs (#90): blok 3 heeft die overschreven met de sweeplijst en
    // herstelt hem pas aan het eind van de run.
    return _stilleSensorenStand(h, _gebruikersSelectie());
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
    const mods = _appModules();
    if (!mods.length) return { staat: 'LET OP', detail: 'geen modules uit de DOM te lezen — deze telling zegt niets' };
    const eigen = [], anderModus = [], viaHelper = [], onleesbaar = [];
    for (const m of mods) {
      const naam = _modNaam(m);
      const bron = await _bron(m);
      if (bron == null) { onleesbaar.push(naam); continue; }
      const romp = _zonderParser(bron);
      if (romp == null) { onleesbaar.push(naam + ' (ankers van de parser weg)'); continue; }
      const helper = (romp.match(/splitBatchResponse/g) || []).length;
      // Mode 01: een eigen zoekactie naar de 41-echo. Dít is wat
      // splitBatchResponse() doet, dus dit hoort op nul te staan.
      const zelf = (romp.match(/indexOf\(\s*['"]41/gi) || []).length;
      // Andere modes: 42 (freeze frame) en 43/47/4A (foutcodes).
      // splitBatchResponse() spreekt alléén mode 01 — zijn sleutels zijn
      // '01'+suffix en zijn lengtetabel is PID_BYTE_LEN. Die antwoorden kán
      // hij dus niet overnemen; ze staan hier als stand, niet als bevinding.
      const anders = (romp.match(/indexOf\(\s*['"]4[23789A]/gi) || []).length;
      if (helper) viaHelper.push(naam + '(' + helper + ')');
      if (zelf) eigen.push(naam + '(' + zelf + ')');
      if (anders) anderModus.push(naam + '(' + anders + ')');
    }
    const staart = (anderModus.length ? '  |  buiten mode 01 (niet door de helper te doen): ' + anderModus.join(', ') : '') +
                   (onleesbaar.length ? '  |  niet gelezen: ' + onleesbaar.join(', ') : '');
    if (!eigen.length && !onleesbaar.length)
      return 'geen enkele module pakt nog zelf een 41-header uit — punt 6 is op dit onderdeel klaar' + staart;
    return { staat: 'LET OP', detail: 'eigen uitpakwerk in mode 01: ' + (eigen.join(', ') || 'geen') +
      '  |  via splitBatchResponse: ' + (viaHelper.join(', ') || 'geen') + staart };
  });

  await _doe(11, 'Punt 6: hoeveel modules doen hun eigen fetch', async function () {
    const mods = _appModules();
    if (!mods.length) return { staat: 'LET OP', detail: 'geen modules uit de DOM te lezen — deze telling zegt niets' };
    // Twee bestanden mógen hun eigen fetch doen, en waaróm staat erbij. Meer
    // uitzonderingen dan deze twee horen er niet te komen: elke extra is weer
    // een plek die zelf over de basis-URL, de tokenkop en een 401 beslist.
    const magZelf = {
      'pidlane-plfetch.js': 'is de helper zelf',
      'pidlane-testrun.js': 'leest eigen bronbestanden in voor deze telling — geen server, geen token'
    };
    const rij = [], metReden = [], onleesbaar = [];
    let totaal = 0, viaHelper = 0;
    for (const m of mods) {
      const naam = _modNaam(m), best = String(m).replace(/^.*\//, '');
      const bron = await _bron(m);
      if (bron == null) { onleesbaar.push(naam); continue; }
      const code = _zonderCommentaar(bron);
      viaHelper += (code.match(/[^.\w]plFetch\s*\(/g) || []).length;
      const n = (code.match(/[^.\w]fetch\s*\(/g) || []).length;
      if (!n) continue;
      if (magZelf[best]) { metReden.push(naam + '(' + n + '): ' + magZelf[best]); continue; }
      rij.push(naam + ': ' + n); totaal += n;
    }
    const heeftHelper = (typeof window.plFetch === 'function');
    const staart = (metReden.length ? '  |  met reden: ' + metReden.join('; ') : '') +
                   (onleesbaar.length ? '  |  niet gelezen: ' + onleesbaar.join(', ') : '');
    if (!heeftHelper)
      return { staat: 'LET OP', detail: 'plFetch bestaat NIET — ' + totaal + ' losse fetch-aanroepen beslissen elk zelf ' +
        'over basis-URL, tokenkop en 401 (' + (rij.join(', ') || 'geen') + ')' + staart };
    if (totaal)
      return { staat: 'LET OP', detail: totaal + ' losse fetch-aanroepen buiten plFetch om (' + rij.join(', ') + ')' +
        '  |  via plFetch: ' + viaHelper + staart };
    return viaHelper + ' aanroepen via plFetch, geen enkele module doet nog zijn eigen fetch' + staart;
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
    // HERZIEN 03-09-2026 (#106). Dit stond op LET OP zodra gemeten en tabel
    // verschilden, en dat verschil is bij een lerende laag de normale toestand —
    // in deze auto dus élke rit oranje. Een afwijking is pas iets als de app er
    // ook echt mee misrekent; dat is wat hieronder getoetst wordt.
    if (typeof pidByteLen !== 'function')
      return { staat: 'LET OP', detail: k.length + ' afwijkend, maar pidByteLen() ontbreekt — niet na te gaan ' +
        'of de app de geleerde lengte gebruikt' };
    const mis = k.filter(function (p) {
      const sfx = String(p).slice(-2), e = afw[p];
      const gemeten = (e && (e.gemeten != null ? e.gemeten : e.n));
      if (gemeten == null) return false;
      try { return pidByteLen(sfx) !== gemeten; } catch (err) { return true; }
    });
    if (mis.length)
      return { staat: 'FOUT', detail: mis.length + ' van ' + k.length + ' afwijkingen worden door de app ' +
        'MISgelezen: ' + mis.join(', ') + ' — pidByteLen() volgt daar de tabel in plaats van de meting, en dan ' +
        'schuift een batch alles wat erachter zit een byte op' };
    return k.length + ' afwijking(en) van de tabel, allemaal correct gelezen door de lerende laag: ' +
      JSON.stringify(afw).slice(0, 200);
  });

  /* ── De opruimklus zelf: gaat er iets af dat er eerder niet was? ──
     584 catches praten nu. Deze regel zet het aantal meldingen sinds het begin
     van de run naast elkaar, zodat je in het logboek kunt zien of er iets
     nieuws bij zit zonder de hele staart door te lezen.

     HERZIEN OP 02-09-2026 (#75). De regel heette "sinds het begin van deze run"
     en telde `app.length` en `bt.length`: de volledige inhoud van beide
     ringbuffers, zonder enige tijdsgrens. In de run van 01-09 meldde hij
     "app-log 33 regels"; in het opgeslagen rapport staat de complete app-log —
     precies 33 regels, waarvan de laatste van 22:29:21, terwijl de run om
     22:32:02 begon. Er was geen enkele regel bij gekomen. Voor de BT-log kwam
     er nog iets bij: het rapport wordt ná de run opgeslagen, dus de 1232
     getelde regels bevatten ook twee minuten polverkeer van daarna.

     Het advies eronder ("kijk in de staart van het logboek") veronderstelt dat
     het getal over de run gaat. Nu doet het dat ook: beide lijsten worden
     afgekapt op `t >= _trStart`.

     WAAROM DAT EEN EPOCH-VELD NODIG HAD. Beide logs droegen alleen `ts` als
     kloktijdstring ("22:33:41"). Vergelijken met een starttijd vraagt dan een
     omrekening die om middernacht stukgaat. log() en btDiag() zetten er sinds
     02-09-2026 `t` (epoch) bij — zie PIDLANE-CONTRACT.md §6.

     Regels zonder `t` worden NIET meegeteld maar wel gemeld. Dat zijn er twee
     soorten: regels uit een vorige sessie die restoreBtLog() heeft teruggezet,
     en regels van vóór deze versie. Beide horen niet bij deze run — maar
     stilzwijgend weglaten is precies de fout die hierboven staat. */
  await _doe(11, 'Meldingen sinds het begin van deze run', function () {
    const app = _appLogRegels();
    let bt = [];
    try { bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : []; } catch (e) { bt = []; }
    const vanaf = _trStart || 0;
    const sinds = function (arr) {
      const uit = { regels: [], ongedateerd: 0 };
      (arr || []).forEach(function (l) {
        const t = l && typeof l.t === 'number' ? l.t : null;
        if (t === null) { uit.ongedateerd++; return; }
        if (t >= vanaf) uit.regels.push(l);
      });
      return uit;
    };
    const tel = function (arr, soort) {
      let n = 0;
      (arr || []).forEach(function (l) {
        const t = (l && l.type) ? String(l.type) : '';
        if (t === soort) n++;
      });
      return n;
    };
    const a = sinds(app), b = sinds(bt);
    const oud = a.ongedateerd + b.ongedateerd;
    return 'app-log ' + a.regels.length + ' regels (' + tel(a.regels, 'warn') + ' warn, ' + tel(a.regels, 'err') + ' err)' +
           '  |  BT-log ' + b.regels.length + ' regels (' + tel(b.regels, 'warn') + ' warn, ' + tel(b.regels, 'err') + ' err)' +
           '  — geteld vanaf de start van deze run' +
           (oud ? '; ' + oud + ' regel(s) zonder tijdstempel niet meegeteld (vorige sessie of oudere versie)' : '') +
           '.  Kijk in de staart van het logboek of er meldingen bij zitten die je nog nooit gezien hebt';
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
  // Nieuw ritnummer per run, vóór de eerste _boek(): die maakt hem anders
  // aan bij de eerste stap en dan draagt de startregel een ander nummer dan
  // de rest.
  _liveRit = null; _liveBlok = null; _liveTel = null;
  /* De BRON hoort in de startregel (#242). Een preview draait dezelfde app met
     andere code, en van buiten is het verslag van de twee niet te
     onderscheiden — dat is precies hoe je een rit weggooit. Ontbreekt PLBron
     (een oude schil), dan staat er niets in plaats van een verzonnen
     "productie". */
  var _bron = '';
  try { _bron = (window.PLBron && typeof PLBron.stempel === 'function') ? ' · ' + PLBron.stempel() : ''; }
  catch (e) { console.warn('Testrun: bron niet vast te stellen voor de live-log (#242)', e); }
  _liveSchrijf('info', 'testrun gestart — ' + TESTRUN_VERSIE + _bron + ' · ' + CAMPAGNE.titel);
  _boek(0, 'Testrun ' + TESTRUN_VERSIE, 'start', CAMPAGNE.titel, null);
  // Het ritnummer als eigen regel in het verslag: dat is waarmee je later
  // terugvindt wat er die rit gemeten is, en wat je doorgeeft als iemand
  // meekijkt terwijl je rijdt.
  _boek(0, 'Ritnummer', 'ok', _liveRitId(), null);

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
    // In het finally-blok: een afgebroken run hoort net zo goed een slotregel
    // te krijgen, anders eindigt de tak in de tabel zonder dat iemand kan
    // zien of hij klaar was of onderweg gestopt.
    try { _liveEinde(_trStop ? 'afgebroken' : 'klaar'); }
    catch (e) { console.warn('Testrun: slotregel niet naar de live-log gestuurd', e); }
  }
}

function stopTestrun() {
  // Eén stopknop, één betekenis: stop wat er draait. Draait de kaartmaker,
  // dan is dát wat er draait — die heeft de bus en de adapter in handen.
  try { if (window.PLKaart && typeof PLKaart.stop === 'function') PLKaart.stop(); }
  catch (e) { console.warn('Stopverzoek aan de kaartmaker mislukt', e); } _trStop = true; _boek(0, 'Stoppen gevraagd', 'gestopt', '', null); }

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
  /* ── DE KLOOF REKENT VANAF DE LAATSTE METING (#214, 16-09-2026) ─────────
     Hier stond `opgeslagen - gestart`, en dat is de duur van de run PLUS de
     vertraging bij het opslaan. Op 16-09 meldde de kop daardoor "10 minuten na
     de run opgeslagen" terwijl er 39 seconden tussen de laatste meetregel en
     het opslaan zat: de run zelf duurde 532 s. Elke lange run droeg die
     waarschuwing dus automatisch, ook als je meteen opsloeg.

     De waarschuwing zelf klopt en is nuttig — de TX/RX-staart en de logs
     hieronder zijn wél van "nu". Maar een waarschuwing die bij elke lange run
     vanzelf verschijnt wordt een waarschuwing die niemand meer leest, en dan
     is hij weg op het moment dat hij iets betekent.

     Is er niets gemeten, dan is `gestart` het enige ijkpunt dat er is — zelfde
     terugval als bij `gestart` zelf een paar regels hierboven. */
  const _laatsteMeting = (function () {
    for (let i = _trLog.length - 1; i >= 0; i--) if (_trLog[i] && _trLog[i].epoch) return _trLog[i].epoch;
    return null;
  })();
  const kloof = Math.round((opgeslagen - (_laatsteMeting || gestart)) / 60000);
  if (kloof >= 2) {
    r.push('              ⚠ ' + kloof + ' minuten na de laatste meting opgeslagen. De');
    r.push('                meetblokken hieronder zijn van de run; de TX/RX-staart en');
    r.push('                de logs onderaan zijn van NU en horen er niet bij.');
  }
  r.push('Voertuig    : ' + ([v.merk, v.model, v.year || v.bouwjaar, v.brandstof].filter(Boolean).join(' ') || 'onbekend'));
  r.push('Verbonden   : ' + ((typeof connected !== 'undefined' && connected) ? 'ja' : 'nee') +
    ((typeof demoMode !== 'undefined' && demoMode) ? '  (DEMO)' : ''));
  r.push('Toestel     : ' + navigator.userAgent);
  /* WELKE SCHIL DIT IS (#18, 11-09-2026). TESTRUN_VERSIE en APP_VERSION
     komen allebei uit de webpagina en zijn dus op elke APK gelijk. Een
     native wijziging zit ALLEEN in de schil, en op 11-09 stond twee keer
     op één dag de vraag of een meting op de nieuwe of de oude draaide —
     zonder dat het verslag antwoord gaf. Nu wel. */
  r.push('APK         : ' + ((window.PLSchil && PLSchil.regel) ? PLSchil.regel() : 'onbekend (PLSchil ontbreekt)'));
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
//
// TWEE RONDES UIT ÉÉN LIJST (10-09-2026, #166). Van de vijftien stappen hadden
// er elf geen RIJDENDE auto nodig — ze hadden de app nodig, of de app met de
// motor aan, en dat kan stilstaand. Ze stonden alleen in de ritvolgorde omdat
// de lijst zo gegroeid was. Een rit is de schaarse grondstof: wat een rit kost
// en niets oplevert, kost ook de stappen die er niet meer bij passen.
//
// Elke stap draagt daarom twee velden. `nodig` zegt wat hij van de wereld
// vraagt — 'rijden' (de auto moet bewegen), 'auto' (stilstaand, maar mét
// adapter of draaiende motor) of 'toestel' (alleen de app) — en `ronde` in
// welke ronde hij meeloopt. Die middelste is het onderscheid dat telt: een
// zelfgemaakt adaptergat hoort in de rit omdat het gat in DEZE meetreeks moet
// vallen, en de drie meetcontextvragen horen dat niet, want die hebben aan de
// app genoeg. De
// lijst blijft één lijst — twee filters, geen tweede lijst, want dat is precies
// de vorm die CAMPAGNE en §11 eerder de kop kostte.
//
// EN `issues` IS DATA GEWORDEN, om dezelfde reden. Negen stappen noemden een
// issue in hun `waarom`, en zeven daarvan waren dicht: #19, #15, #29, #68, #66,
// #79 en #58. Niets werd daar rood van, want de koppeling stond in proza. Nu
// staat er per stap wat hij voedt, en sluit het verslag af met wat déze ronde
// werkelijk opgeleverd heeft.
const _BG = {
  aan: false, i: 0, gepauzeerd: false, gestart: 0, timer: null,
  soort: 'rit',      // welke ronde er loopt
  lijst: [],         // de stappen van díé ronde — _STAPPEN blijft de bron
  gedaan: [],        // per stap: {id, titel, t, uitkomst, opm}
  laatsteActie: ''   // wat de app zojuist zelf deed, zodat de stap dat kan tonen
};

const _RONDES = {
  rit:     { naam: 'Meetrit',      uitleg: 'alles waar een rijdende auto voor nodig is' },
  toestel: { naam: 'Toestelronde', uitleg: 'stilstaand — op de parkeerplaats of thuis' }
};

/* DE OOGSTPOORT (10-09-2026, #166) — wat een rit moet opleveren, niet hoe
   lang hij moet duren.

   De rijstap eiste tien minuten. De onderbouwing daarvoor was #29: "vijf
   pogingen plus vijf herkansingen kosten meer dan vijf minuten". Dat issue is
   op 02-09 gesloten, mét `test-opruimmelding.js` als tegenproef — die minuten
   kochten dus niets meer, en ze stonden vóór álles wat daarna nog moest.

   Een klok meet ook het verkeerde ding. Tien minuten stapvoets in de file
   leveren minder op dan drie minuten met wisselend gas, en de bestuurder kreeg
   in beide gevallen hetzelfde antwoord. Wat de rit moet opleveren is te
   benoemen, en dus te meten:

     1. is er echt gereden (snelheid bewezen, niet uit het geheugen)
     2. is er onder belasting gemeten (de MAP heeft spreiding) — dit is wat de
        losse optrekstap deed, nu zonder aparte stop
     3. zijn de meet-PIDs die in de selectie staan ook twee keer ververst

   Los gehouden en naar buiten gebracht zodat test-begeleid.js hem zonder
   browser kan draaien; de stap zelf toont hem live én sluit erop af, zodat je
   tijdens het rijden ziet wat er nog mist.

   EEN PUNT DAT NIET TE HALEN IS, BLOKKEERT NIET. Staat de MAP niet in de
   selectie, dan is "onder belasting gemeten" geen eis maar een mededeling —
   anders is de poort een muur op een auto die die sensor niet levert. */
function _ritOogst() {
  const punten = [];
  let per = {}, actief = null;
  // Bewust via window en niet via de closure-const: dan kan test-begeleid.js
  // hem met een nagemaakte ritstand voeden. In de app zijn het hetzelfde object.
  try { per = (window.PLRit && window.PLRit.per) ? (window.PLRit.per() || {}) : {}; }
  catch (e) { console.warn('PLRit.per() onleesbaar bij de oogstpoort', e); }
  try { actief = (typeof activePIDs !== 'undefined' && activePIDs) ? activePIDs : null; }
  catch (e) { console.warn('activePIDs onleesbaar bij de oogstpoort', e); }

  const inSelectie = function (p) { return !actief || actief.has(p); };
  const e10D = per['010D'] || null, e10B = per['010B'] || null;

  // 1. Er is gereden. Zonder dit gaat elke uitspraak hieronder over stilstand.
  punten.push(!e10D || e10D.n < 2
    ? { naam: 'snelheid', klaar: false, tekst: 'snelheid nog niet gemeten (010D niet ververst)' }
    : e10D.max < 15
      ? { naam: 'snelheid', klaar: false, tekst: 'hoogste snelheid ' + e10D.max + ' km/u — nog niet echt gereden' }
      : { naam: 'snelheid', klaar: true, tekst: 'gereden tot ' + e10D.max + ' km/u' });

  // 2. Onder belasting gemeten. Spreiding op de MAP is het bewijs dat er meer
  //    gebeurd is dan stationair rollen; blok 14 haalt de turbovraag uit
  //    dezelfde min/max, dus dit is precies het getal dat straks telt.
  const spreiding = e10B && e10B.n >= 2 ? (e10B.max - e10B.min) : null;
  punten.push(!inSelectie('010B') && (!e10B || e10B.n < 2)
    ? { naam: 'belasting', klaar: null, tekst: 'MAP (010B) staat niet in de selectie — over belasting zegt deze rit niets' }
    : spreiding === null
      ? { naam: 'belasting', klaar: false, tekst: 'MAP (010B) nog niet ververst — nog niets over belasting te zeggen' }
      : spreiding < 10
        ? { naam: 'belasting', klaar: false, tekst: 'MAP ' + e10B.min + '–' + e10B.max + ' kPa (spreiding ' + spreiding +
            ') — nog niet onder belasting; trek een keer stevig op' }
        : { naam: 'belasting', klaar: true, tekst: 'MAP ' + e10B.min + '–' + e10B.max + ' kPa, onder belasting gemeten' });

  // 3. De meet-PIDs die de rit heeft aangezet, moeten ook echt gelezen zijn.
  //    Wat de gate geweigerd heeft telt hier niet mee: dat is de melding van de
  //    PID-stap en niet iets waar de bestuurder op kan wachten.
  const wil = RIT_PIDS.filter(inSelectie);
  const mist = wil.filter(function (p) { return !per[p] || per[p].n < 2; });
  punten.push(!wil.length
    ? { naam: 'meet-PIDs', klaar: null, tekst: 'geen enkele meet-PID staat in de selectie' }
    : mist.length
      ? { naam: 'meet-PIDs', klaar: false, tekst: (wil.length - mist.length) + ' van de ' + wil.length +
          ' meet-PIDs twee keer ververst — nog open: ' + mist.join(', ') }
      : { naam: 'meet-PIDs', klaar: true, tekst: 'alle ' + wil.length + ' meet-PIDs twee keer ververst' });

  return { klaar: punten.every(function (p) { return p.klaar !== false; }), punten: punten };
}

// Elke stap: wat de APP doet (doe), wat JIJ doet (wat), waar we op letten
// (controle) en wat er in het log komt (markering). Plus `ronde`, `nodig` en
// `issues` — zie de uitleg hierboven.
const _STAPPEN = [
  {
    id: 'verbinding',
    ronde: 'beide', nodig: 'auto', voorwaarde: true, issues: [],
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
    ronde: 'rit', nodig: 'auto', voorwaarde: true, issues: [],
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
    ronde: 'rit', nodig: 'auto', issues: ['#159'],
    titel: 'Zet de bus vol — alle aanvragers aan',
    waarom: 'Blok 7 en de STPX-vraag (#15) gaan over een DRUKKE bus. Bij stilstand met één aanvrager is dat het gunstigste geval, en dan zegt de meting niets over de vraag die openstaat. #19 vraagt bovendien met zoveel woorden om alle VIER tegelijk — dat is de rit die er nog niet is geweest.',
    wat: 'De app zet ze alle vier aan: waakronde, rit-monitor, bulk-recorder en caravan-tracker. Lukt de caravan-tracker niet, dan staat de reden hieronder — meestal is dat de knop 🔌 Check connectie die nog niet is ingedrukt.',
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
      // De vierde. Tot 6.4 stond hier "start die zelf via het menu", en dat is
      // in vier ritten geen enkele keer gebeurd — dus stond #19 nog steeds op
      // "wacht op een rit met alle vier tegelijk". startCaravan() is async en
      // kan afketsen op de connectiecheck; de uitkomst blijkt hieronder uit
      // controle(), dat is de eerlijke plek. Geen await: de stap moet niet
      // blijven hangen op een dialoog.
      try {
        if (typeof caravanActive !== 'undefined' && caravanActive) gedaan.push('caravan-tracker liep al');
        else if (typeof startCaravan === 'function') {
          Promise.resolve(startCaravan()).catch(function (e) { console.warn('startCaravan() mislukt', e); });
          gedaan.push('caravan-tracker gestart (loopt op)');
        } else gedaan.push('caravan-tracker niet gevonden');
      } catch (e) { gedaan.push('caravan-tracker mislukt: ' + ((e && e.message) || e)); }
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
      if (aan.length >= 4) return { ok: true, tekst: kop + ' — alle vier: dit is de rit waar #19 en #15 om vragen' };
      const mist = ['waakronde', 'rit-monitor', 'bulk-recorder', 'caravan-tracker'].filter(function (n) { return aan.indexOf(n) < 0; });
      if (aan.length >= 2)
        return { ok: false, tekst: kop + ' — ' + mist.join(' en ') + ' ontbreekt. Blok 7 meet zo wel een drukke bus, ' +
          'maar #19 en #15 vragen om alle vier tegelijk en blijven dus open' };
      return { ok: false, tekst: kop + ' — met minder dan twee aanvragers meet blok 7 een rustige bus' };
    }
  },
  {
    id: 'nulmeting',
    ronde: 'rit', nodig: 'auto', voorwaarde: true, issues: [],
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
    ronde: 'rit', nodig: 'rijden', voorwaarde: true, issues: [],
    titel: 'Rijden — tot de oogst binnen is',
    waarom: 'Hier stond "minstens tien minuten", voor #29. Dat issue is op 02-09 gesloten met een node-test als tegenproef, dus die klok kocht niets meer. Wat een rit moet opleveren is wél te benoemen: gereden, onder belasting gemeten, en de meet-PIDs echt ververst. Dat sluit op een goede rit ruim binnen tien minuten, en op een slechte rit zegt het wát er nog mist.',
    wat: 'Rijd met wisselend gas, en trek onderweg één keer stevig op (veilig — dat vervangt de losse optrekstap). Hieronder zie je live wat er nog ontbreekt; zodra alles groen staat mag je verder.',
    knop: 'Verder',
    markering: 'rijfase afgesloten',
    leeft: function () {
      // Tijdens deze stap live tonen: dit is de enige plek waar je tijdens de
      // rit ziet dat de meting werkt in plaats van het achteraf te lezen. De
      // duur staat er als mededeling bij en niet als eis.
      let d = 0;
      try { d = PLRit.duurS(); } catch (e) { console.warn('ritduur onleesbaar tijdens de rijstap', e); }
      const o = _ritOogst();
      const teken = function (p) { return (p.klaar === true ? '✓ ' : p.klaar === null ? '– ' : '· ') + p.tekst; };
      return Math.floor(d / 60) + ' min ' + (d % 60) + ' s onderweg' +
        (o.klaar ? '  ·  OOGST BINNEN' : '') + '\n' + o.punten.map(teken).join('\n');
    },
    controle: function () {
      let d = 0;
      try { d = PLRit.duurS(); } catch (e) { return { ok: false, tekst: 'ritstand onbereikbaar' }; }
      const o = _ritOogst();
      const kop = Math.round(d / 60) + ' min gereden';
      const open = o.punten.filter(function (p) { return p.klaar === false; });
      if (open.length)
        return { ok: false, tekst: kop + ' — de oogst is nog niet binnen: ' +
          open.map(function (p) { return p.tekst; }).join('; ') };
      return { ok: true, tekst: kop + ' — ' + o.punten.map(function (p) { return p.tekst; }).join('; ') };
    }
  },
  /* DE OPTREKSTAP IS WEG (10-09-2026, #166). Hij vroeg om één stevige
     acceleratie plus een druk op een markeerknop, "voor de turbo-vraag en de
     sleepwijzer van #68". #68 is gesloten, en de turbovraag had die markering
     sowieso nooit nodig: blok 14 leidt hem af uit de min/max die PLRit over de
     hele rit bijhoudt, niet uit een moment in het log. Wat de stap wél deed —
     de bestuurder laten weten dát er onder belasting gemeten moet worden —
     staat nu in de oogstlijst van de rijstap hierboven, waar het geen aparte
     stop en geen extra knop kost. */
  {
    id: 'achtergrond',
    ronde: 'rit', nodig: 'rijden', issues: ['#18'],
    titel: 'Zet de app twee minuten op de achtergrond',
    waarom: '#18 zegt dat de pollus, de recorder en de logger tegelijk stoppen zodra de app naar de achtergrond gaat. Dat is niet vanaf een bureau te meten en ook niet uit een log te reconstrueren: het moet gebeuren terwijl de ritwaarnemer loopt, want alleen dan is het gat van dít moment.',
    wat: 'Druk op de knop hieronder, ga daarna naar het beginscherm van de telefoon (of open een andere app) en laat PidLane twee minuten met rust. Kom dan terug en druk op Verder. Blijf rijden — een gat bij stilstand zegt minder. KIJK ONDERWEG ÉÉN KEER NAAR DE STATUSBALK: staat er een PidLane-melding dat de meting doorloopt? Dat is de nieuwe meetdienst (#18), en of die melding er stond is het enige dat de app zelf niet kan vaststellen.',
    actie: { label: '📴 Ik ga nu naar de achtergrond', fn: function () {
      plMarkeer('achtergrond in', 'app naar de achtergrond — het gat hierna is de meting voor #18');
      return 'moment vastgelegd; ga nu weg en kom over twee minuten terug';
    } },
    knop: 'Terug — verder',
    markering: 'achtergrondproef afgesloten',
    leeft: function () {
      const m = _markeringen.filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      if (!m) return 'nog niet gemarkeerd — druk eerst op de knop hierboven';
      const weg = Math.round((_nu() - m.ms) / 1000);
      return Math.floor(weg / 60) + ' min ' + (weg % 60) + ' s sinds de markering';
    },
    controle: function () {
      const m = _markeringen.filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      if (!m) return { ok: false, tekst: 'geen achtergrondmarkering gezet — dan is er niets om een gat aan af te meten en blijft #18 open' };
      const weg = Math.round((_nu() - m.ms) / 1000);
      if (weg < 90) return { ok: false, tekst: 'pas ' + weg + ' s weg geweest; #18 gaat over minuten, niet over seconden' };
      let gaten = [];
      try { gaten = PLRit.gaten() || []; } catch (e) { return { ok: false, tekst: 'PLRit.gaten() onbereikbaar — de proef kan niets zeggen' }; }
      const sinds = gaten.filter(function (g) { return g.van >= m.ms - 2000; });
      const grootste = sinds.reduce(function (a, g) { return Math.max(a, g.s || 0); }, 0);
      // SINDS 7.0 STAAN ER TWEE BRONNEN NAAST ELKAAR. PLRit LEIDT een gat af
      // uit zijn eigen tikken: hij ziet achteraf dat er niets langskwam.
      // PLAchtergrond WEET het, want die hangt aan visibilitychange. Wijzen ze
      // dezelfde kant op, dan klopt het beeld; ziet PLRit een gat dat
      // PLAchtergrond niet kent, dan lag de lus stil om een andere reden en is
      // dat een bevinding op zichzelf.
      let bg = null;
      try { bg = (window.PLAchtergrond && PLAchtergrond.laatste) ? PLAchtergrond.laatste() : null; }
      catch (e) { console.warn('PLAchtergrond onleesbaar bij de achtergrondstap', e); }
      // SINDS 08-09 STAAT DE GEMETEN STILTE ERBIJ. `bg.s` is hoe lang de app
      // weg was; dat wist deze stap al. `bg.door` en `bg.stil` komen van de
      // hartslag en zeggen hoe lang de lus daarvan werkelijk niets deed. Juist
      // dat eerste getal — de aanlooptijd — is wat je hier op het toestel wilt
      // zien, want het is de maat waarop een oplossing gebouwd moet worden.
      const bgMeet = !bg ? ''
        : (bg.stil === null ? ' (stilte niet gemeten — de hartslag startte niet)'
          : !bg.stil ? ' weg, en de meetlus liep dóór'
          : ' weg, waarvan ' + bg.door + ' s doorgelopen en ' + bg.stil + ' s stil' +
            (bg.na >= 3 ? ', daarna zelf weer ' + bg.na + ' s aan — afgeknepen, niet bevroren' : ''));
      const bgTekst = !window.PLAchtergrond ? 'PLAchtergrond ontbreekt — dan weet de app nog steeds niets van zijn eigen pauze (#18)'
        : (!bg ? 'PLAchtergrond legde niets vast' : 'PLAchtergrond: ' + bg.s + ' s' + bgMeet + (bg.socket ? ', ' + bg.socket : ''));
      // Allebei de uitkomsten zijn een meting. Dat is het punt: tot nu toe was
      // er alleen een vermoeden, en een vermoeden sluit geen issue.
      if (grootste >= 30)
        return { ok: true, tekst: weg + ' s weg geweest, grootste gat daarna ' + grootste + ' s over ' + sinds.length +
          ' onderbreking(en) — de meetlus stond stil terwijl de app op de achtergrond was. Dat is #18, gereproduceerd.  |  ' + bgTekst };
      if (!sinds.length)
        return { ok: true, tekst: weg + ' s weg geweest en GEEN gat in de meting — de lus liep door op de achtergrond. ' +
          'Dat spreekt #18 tegen op dit toestel; noteer het merk en de Android-versie erbij.  |  ' + bgTekst };
      return { ok: true, tekst: weg + ' s weg geweest, grootste gat ' + grootste + ' s — te klein om de bevriezing uit #18 te zijn, ' +
        'maar de lus haperde wel.  |  ' + bgTekst };
    }
  },
  {
    id: 'liveview',
    ronde: 'toestel', nodig: 'auto', opent: 'app', issues: ['#141'],
    titel: 'Bekijk de live view',
    waarom: 'Blok 5 meet de app-schil maar kan niet zien of de tellerplaat iets ZEGT. Dat oordeel kan alleen jij geven. Het hoefde nooit rijdend: gas geven met de auto stil laat pedaal, klep en belasting net zo goed bewegen, en dat scheelt de rit een stop.',
    wat: 'Doe dit stilstaand, bij voorkeur vlak na een rit met de motor nog warm. Sluit dit scherm, geef een paar keer rustig gas en kijk naar de tellerplaat (toeren, pedaal, gasklep, belasting naast elkaar). Gaan pedaal en klep samen omhoog met de belasting erachteraan?',
    actie: { label: '👁 Live view openen', fn: function () { closeTestrun(); return 'testrunscherm gesloten — open het straks weer via ☰ → Testrun'; } },
    keuzes: ['Klopt — ze lopen gelijk op', 'Klopt niet — ze lopen uiteen', 'Niet kunnen kijken'],
    knop: 'Verder',
    markering: 'live view beoordeeld',
    controle: function () { return { ok: true, tekst: 'jouw oordeel staat hieronder in het verslag' }; }
  },
  {
    id: 'slimweergave',
    ronde: 'toestel', nodig: 'auto', opent: 'app', issues: ['#161'],
    titel: 'Slimme weergave — kloppen de balken en de lijnen?',
    waarom: '#66 is gesloten; wat er nog ligt is #161: de drempel voor "beweegt" is 2% van het definitiebereik, en het toerental haalt die stationair niet (108 tegen 160 gemeten op 09-09). Juist het STILSTAANDE geval is dus de vraag — deze stap hoorde nooit in de rit thuis. Blok 5 meet de getallen elke ronde; jouw oordeel gaat over of het beeld ook klopt.',
    wat: 'Doe dit stilstaand met een warme motor, vlak na een rit. Zet de weergave op 🧠 Slim. Twee dingen: (1) staat koelwater op 90 °C hóger in beeld dan de buitenlucht op 20 °C, en staat uitlaatgas op 500 °C juist NIET vol? (2) heeft het toerental een trendlijn als je gas geeft — en blijven de stille sensoren stil?',
    actie: { label: '👁 Live view openen', fn: function () { closeTestrun(); return 'testrunscherm gesloten — open het straks weer via ☰ → Testrun'; } },
    keuzes: ['Allebei goed — balken én lijnen kloppen', 'Balken kloppen niet (volgorde of vulling)', 'Lijnen kloppen niet (te veel of te weinig)', 'Allebei niet — of niet kunnen kijken'],
    knop: 'Verder',
    markering: 'slimme weergave beoordeeld',
    controle: function () { return { ok: true, tekst: 'jouw oordeel staat hieronder in het verslag (#161)' }; }
  },
  {
    id: 'zones',
    ronde: 'toestel', nodig: 'toestel', opent: 'app', issues: ['#141'],
    titel: 'Valt de onderkant achter de Android-knoppen?',
    waarom: '#79 en #58 zijn dicht, maar de vraag eronder leeft door in #141: de run kan zelf niet kiezen of de MELDING klopt of de METING, want op ≤760px mag #appGrid bewust langer zijn dan het scherm. Alleen jouw oog beslist dit, en de Android-knoppen zijn in geen enkele browserproef na te bootsen — dit toestel is dus de meetbank, niet de weg.',
    wat: 'Stilstaand. Sluit dit scherm, scroll de live view helemaal naar beneden en kijk naar de onderste regel. Blijft die vrij van de drie Android-knoppen, of valt er iets achter?',
    actie: { label: '👁 Live view openen', fn: function () { closeTestrun(); return 'testrunscherm gesloten — open het straks weer via ☰ → Testrun'; } },
    keuzes: ['Alles vrij — er valt niets weg', 'Er valt wel iets achter de knoppen', 'Niet kunnen kijken'],
    knop: 'Verder',
    markering: 'veilige zones beoordeeld',
    controle: function () { return { ok: true, tekst: 'jouw oordeel staat hieronder in het verslag (#141)' }; }
  },
  {
    id: 'logboek',
    ronde: 'toestel', nodig: 'toestel', opent: 'venster', issues: [],
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
  /* ── SPLIT-SCREEN: IS HET ZICHTBAARHEID OF IS HET HET TOESTEL? (#228) ──

     De meetdienst heeft de eerste helft van #18 beslist: het app-proces leeft
     (310 native slagen over 310 s). De tweede helft bleef staan — de WEBVIEW
     valt na 59, 59 en 60 s stil, drie keer hetzelfde getal ongeacht hoe lang
     de app wegblijft.

     WAT ER OP 17-09 IS AFGEVALLEN, ZONDER RIT:

       de renderer-prioriteit   de Android-documentatie zegt dat de standaard
                                al RENDERER_PRIORITY_IMPORTANT is, ongeacht
                                zichtbaarheid. Er is geen knop om hoger te
                                zetten; IMPORTANT is het maximum.
       Chromium's bevriezing    die raakt WebView niet, en het getal is 5
                                minuten en geen 60 seconden.
       het framework            Capacitor 8 roept nergens pauseTimers() of
                                webView.onPause() aan.

     Wat overblijft zijn TWEE richtingen, en deze stap kiest ertussen. In
     split-screen blijft de WebView ZICHTBAAR terwijl een andere app de focus
     heeft. Loopt de lus dan door, dan is zichtbaarheid de trekker en is
     picture-in-picture een echte oplossing. Stopt hij alsnog, dan is het
     procesbeheer van het toestel en helpt alleen een native meetlus.

     DE PROEF KOST NIETS: geen rit, geen tokens, geen nieuwe schil. Hij leest
     twee instrumenten die er al zijn — PLRit voor de gaten en PLAchtergrond
     voor de vraag óf Android de pagina überhaupt als verborgen meldde. Dat
     tweede is geen bijvangst maar de controlevraag: meldt Android split-screen
     tóch als verborgen, dan meet deze stap de oude vraag opnieuw en niet de
     nieuwe, en dan hoort dat er met zoveel woorden te staan. */
  {
    id: 'splitscreen',
    ronde: 'toestel', nodig: 'auto', issues: ['#228'],
    titel: 'Split-screen — blijft de meting lopen als de app zichtbaar is maar niet vooraan?',
    waarom: '#228 heeft nog twee kandidaten over en dit is het enige dat ze scheidt. Op de achtergrond is de WebView verborgen én staat de app niet vooraan; in split-screen is hij zichtbaar en staat hij niet vooraan. Precies één verschil, en dus een antwoord in plaats van een vermoeden.',
    wat: 'Stilstaand, met de adapter verbonden. Druk op de knop, zet PidLane daarna in split-screen (veeg omhoog, houd het app-icoon vast → "Split screen view") en open er een andere app naast — bijvoorbeeld de navigatie, want dat is het echte gebruiksgeval. Zorg dat PidLane ZICHTBAAR blijft en tik in de andere app. Wacht twee minuten, kom terug en druk op Verder.',
    actie: { label: '◧ Ik ga nu naar split-screen', fn: function () {
      plMarkeer('split-screen in', 'app naar split-screen — zichtbaar maar niet vooraan; dit scheidt de twee kandidaten van #228');
      return 'moment vastgelegd; zet nu split-screen aan en kom over twee minuten terug';
    } },
    knop: 'Terug — verder',
    markering: 'split-screenproef afgesloten',
    leeft: function () {
      const m = _markeringen.filter(function (x) { return /split-screen in/i.test(x.tekst); }).pop();
      if (!m) return 'nog niet gemarkeerd — druk eerst op de knop hierboven';
      const weg = Math.round((_nu() - m.ms) / 1000);
      return Math.floor(weg / 60) + ' min ' + (weg % 60) + ' s sinds de markering';
    },
    controle: function () {
      const m = _markeringen.filter(function (x) { return /split-screen in/i.test(x.tekst); }).pop();
      if (!m) return { ok: false, tekst: 'geen split-screenmarkering gezet — dan is er niets om een gat aan af te meten en blijft #228 op twee kandidaten staan' };
      const weg = Math.round((_nu() - m.ms) / 1000);
      // De drie metingen van 11-09 kwamen op 59, 59 en 60 s aanlooptijd. Korter
      // dan anderhalve minuut bewijst dus niets: dan was je binnen de drempel.
      if (weg < 90) return { ok: false, tekst: 'pas ' + weg + ' s in split-screen; de stilte begon op 11-09 drie keer pas na ~60 s, dus korter dan anderhalve minuut zegt niets' };

      let gaten = [];
      try { gaten = PLRit.gaten() || []; } catch (e) { return { ok: false, tekst: 'PLRit.gaten() onbereikbaar — de proef kan niets zeggen' }; }
      const sinds = gaten.filter(function (g) { return g.van >= m.ms - 2000; });
      const grootste = sinds.reduce(function (a, g) { return Math.max(a, g.s || 0); }, 0);

      // DE CONTROLEVRAAG. PLAchtergrond hangt aan visibilitychange. Meldt hij
      // een periode, dan noemde Android deze app verborgen en is split-screen
      // hier geen ander geval dan de achtergrond — dan meet deze stap de oude
      // vraag opnieuw, en dat hoort er te staan in plaats van stil de conclusie
      // te vervuilen.
      let bg = [];
      try { bg = (window.PLAchtergrond && typeof PLAchtergrond.sinds === 'function') ? (PLAchtergrond.sinds(m.ms - 2000) || []) : []; }
      catch (e) { console.warn('PLAchtergrond onleesbaar bij de split-screenstap', e); }

      const staart = ' | ' + weg + ' s split-screen, ' + sinds.length + ' onderbreking(en), grootste ' + grootste + ' s';

      if (bg.length)
        return { ok: true, tekst: 'ANDROID MELDDE DE PAGINA TOCH ALS VERBORGEN (' + bg.length + ' periode(n)). Split-screen is op dit toestel dus geen ander geval dan de achtergrond, ' +
          'en deze proef scheidt de twee kandidaten van #228 hier niet. Noteer merk en Android-versie erbij — dat de app zichtbaar op het scherm stond en tóch als verborgen telt, is zelf de bevinding.' + staart };

      if (grootste >= 30)
        return { ok: true, tekst: 'ZICHTBAAR EN TOCH STIL: de WebView stond in beeld, Android meldde geen enkele verborgen periode, en de meetlus viel alsnog ' + grootste + ' s stil. ' +
          'Dan is zichtbaarheid NIET de trekker en helpt picture-in-picture niet — #228 gaat richting een native meetlus.' + staart };

      if (!sinds.length)
        return { ok: true, tekst: 'ZICHTBAAR EN DOORGELOPEN: geen enkel gat terwijl een andere app de focus had. Dan is ZICHTBAARHEID de trekker, ' +
          'en is picture-in-picture een echte oplossing voor #228 in plaats van een gok.' + staart };

      return { ok: true, tekst: 'zichtbaar gebleven en grootste gat ' + grootste + ' s — te klein voor de stilte uit #228 (die duurt minuten), maar de lus haperde wel. ' +
        'Herhaal deze stap voordat je er een richting op bouwt.' + staart };
    }
  },

  // ── DE TWEE STAPPEN DIE OP 09-09-2026 IN CAMPAGNE STONDEN EN NIET GEBEURDEN ──
  // Ze stonden als losse tekst in CAMPAGNE, en de bestuurder liep de begeleide
  // run af — dertien eigen stappen, waar deze twee niet in zaten. Gevolg: #64
  // meldde "het venster is niet beantwoord" en #133 kwam op "ok" zonder dat de
  // proef ooit onder spanning stond. Twee lijsten met ritstappen naast elkaar
  // is dezelfde vorm die §11 en PIDLANE-WERK.md eerder de kop kostte; de lijst
  // die gevolgd wordt is deze, dus hier horen ze.
  {
    id: 'meetcontext',
    ronde: 'toestel', nodig: 'toestel', opent: 'venster', issues: ['#64'],
    titel: 'De meetcontext — beantwoord de drie vragen',
    waarom: '#64 vraagt twee dingen die alleen een mens kan geven: wordt dit venster werkelijk ingevuld, en komt een gegeven antwoord er aan de andere kant weer uit in de AI-prompt? Het venster staat normaal vlak vóór een betaalde analyse, en op 09-09 bleek wat er dan gebeurt — geen analyse gevraagd, dus venster nooit gezien, dus de vraag nog steeds open.',
    wat: 'Druk op de knop, beantwoord de drie vragen écht (niet overslaan), en kom terug. Dit kost geen tokens: het venster gaat los open, er vertrekt geen analyse. Het testrunscherm zakt er even onder, zodat de vragen ook werkelijk in beeld komen (#166).',
    actie: { label: '📝 Meetcontextvragen openen', fn: function () {
      if (typeof plVoorAnalyse !== 'function') return 'plVoorAnalyse() ontbreekt — het venster is niet te openen (#64)';
      try { plVoorAnalyse(false); } catch (e) { return 'het venster gaf een fout: ' + ((e && e.message) || e); }
      return 'venster geopend — beantwoord de drie vragen en kom hier terug';
    } },
    knop: 'Beantwoord — verder',
    markering: 'meetcontext beantwoord',
    controle: function () {
      if (typeof plMeetcontextPromptLine !== 'function')
        return { ok: false, tekst: 'plMeetcontextPromptLine() ontbreekt — dan gaat de meetcontext nooit mee naar de AI (#64)' };
      let m = null, regel = '';
      try { m = window._plMeetcontext; } catch (e) { console.warn('_plMeetcontext onleesbaar bij de meetcontextstap', e); }
      try { regel = plMeetcontextPromptLine() || ''; }
      catch (e) { return { ok: false, tekst: 'plMeetcontextPromptLine() gaf een fout: ' + ((e && e.message) || e) }; }

      if (!m) return { ok: false, tekst: 'het venster is niet beantwoord — dan blijft #64 open, en dát is precies de uitkomst die het issue vreest' };

      const vragen = (typeof PL_VOORVRAGEN !== 'undefined' && PL_VOORVRAGEN) ? PL_VOORVRAGEN : [];
      let gegeven = [];
      try {
        gegeven = vragen.filter(function (v) { return m[v.key]; })
                        .map(function (v) { return v.key + '=' + m[v.key]; });
      } catch (e) { console.warn('PL_VOORVRAGEN niet af te lopen bij de meetcontextstap', e); }
      const extra = String((m && m.extra) || '').trim();

      if (!gegeven.length && !extra)
        return { ok: false, tekst: 'het venster is geopend maar alles bleef op "weet ik niet" — dat telt als niet beantwoord voor #64' };

      // DIT is de vraag van het issue: komt het antwoord aan de andere kant
      // weer terug? Zo niet, dan is de hele vraag versiering.
      if (!regel.trim())
        return { ok: false, tekst: 'beantwoord (' + gegeven.join(', ') + (extra ? ', plus een opmerking' : '') +
          ') maar de promptregel is leeg — het antwoord bereikt de AI niet (#64)' };

      return { ok: true, tekst: gegeven.length + ' van de ' + vragen.length + ' vragen beantwoord (' + gegeven.join(', ') + ')' +
        (extra ? ' plus een vrije opmerking' : '') + '; de promptregel draagt ' + regel.trim().split('\n').length + ' regel(s) mee' };
    }
  },
  {
    id: 'adapterlos',
    ronde: 'rit', nodig: 'auto', issues: ['#133'],
    titel: 'Trek de adapter er even uit',
    waarom: '#133 gaat niet over of de app herverbindt — dat doet hij — maar of de ANALYSE doorkrijgt dat een gat aan de meting lag en niet aan de auto. Dat is alleen vast te stellen met een gat dat je zelf gemaakt hebt, want dan weet je wat het antwoord hoort te zijn. Op 09-09 kwam deze proef op "ok" zonder ooit onder spanning te staan.',
    wat: 'Doe dit als laatste vóór het meten, en stilstaand. Druk op de knop, trek de OBD-adapter uit de poort, wacht een halve minuut, steek hem terug en wacht tot de app weer verbonden is. Hierna heeft de meetreeks een gat — dat is de bedoeling.',
    actie: { label: '🔌 Ik trek hem er nu uit', fn: function () {
      plMarkeer('adapter los', 'adapter er met opzet uit — het gat hierna is de meting voor #133');
      return 'moment vastgelegd; trek hem er nu uit en steek hem na een halve minuut terug';
    } },
    knop: 'Weer verbonden — verder',
    markering: 'adapter losgetrokken en teruggeplaatst',
    leeft: function () {
      const m = _markeringen.filter(function (x) { return /adapter los/i.test(x.tekst); }).pop();
      if (!m) return 'nog niet gemarkeerd — druk eerst op de knop hierboven';
      const s = Math.round((_nu() - m.ms) / 1000);
      const verb = (typeof connected !== 'undefined' && connected) ? 'weer verbonden' : 'NOG NIET verbonden';
      return s + ' s sinds de markering, ' + verb;
    },
    controle: function () {
      const m = _markeringen.filter(function (x) { return /adapter los/i.test(x.tekst); }).pop();
      if (!m) return { ok: false, tekst: 'geen markering gezet — dan is er geen gat om aan af te meten en blijft #133 open' };
      if (typeof connected !== 'undefined' && !connected)
        return { ok: false, tekst: 'de app is nog niet opnieuw verbonden — wacht daarop, anders meet blok 5 een verbinding die er niet is' };

      /* DEZE STAP LAS ALLEEN HET LOOPGAT (10-09-2026, #170) — en dat is precies
         het gat dat een losgetrokken adapter NIET maakt. Een BT-SPP-socket
         sterft niet als de voeding wegvalt, dus `connected` blijft true en de
         lus blijft tikken: geen loopgat. Daar is bij #133 het meetgat voor
         gebouwd, en blok 14 en twee proeven in blok 5 zijn toen omgezet — deze
         stap, juist de stap die #133 moet toetsen, bleef achter.

         Gemeten op de rit van 10-09 19:11: blok 14 meldde een meetgat van 35 s
         over dezelfde adaptertrek, terwijl deze stap "PLRit ziet geen gat"
         zei. Het verslag boekte #133 daarna als AANGERAAKT MAAR NIET BINNEN,
         terwijl de meting geslaagd was. */
      let gaten = [], meetgaten = [];
      try { gaten = (window.PLRit && window.PLRit.gaten) ? (window.PLRit.gaten() || []) : []; }
      catch (e) { return { ok: false, tekst: 'PLRit.gaten() onbereikbaar — de proef kan niets vaststellen' }; }
      try { meetgaten = (window.PLRit && window.PLRit.meetgaten) ? (window.PLRit.meetgaten() || []) : []; }
      catch (e) { console.warn('PLRit.meetgaten() onleesbaar bij de adapterstap', e); }
      const sindsM = function (lijst) { return lijst.filter(function (g) { return g.van >= m.ms - 2000; }); };
      const sindsLoop = sindsM(gaten), sindsMeet = sindsM(meetgaten);
      const grootsteVan = function (lijst) { return lijst.reduce(function (a, g) { return Math.max(a, g.s || 0); }, 0); };
      const grootste = Math.max(grootsteVan(sindsLoop), grootsteVan(sindsMeet));
      const aantal = sindsLoop.length + sindsMeet.length;
      const soort = sindsMeet.length
        ? (sindsLoop.length ? 'loop- én meetgat' : 'meetgat')
        : 'loopgat';

      let v = null;
      try { v = (typeof plMeetStabielVoorstel === 'function') ? (plMeetStabielVoorstel() || {}) : null; }
      catch (e) { console.warn('plMeetStabielVoorstel() gaf een fout bij de adapterstap', e); }
      const vTekst = !v ? 'plMeetStabielVoorstel() ontbreekt — dan gaat er geen oordeel over de meetkwaliteit mee (#133)'
        : 'voorstel "stabiele meting": ' + (v.waarde || '(leeg)') + ' — ' + (v.reden || '?');

      if (!aantal)
        return { ok: false, tekst: 'de adapter is losgetrokken maar PLRit ziet geen enkel gat — loopgat noch meetgat. ' +
          'Dan meet de ritwaarnemer de onderbreking niet, en kan de analyse er ook niets van weten.  |  ' + vTekst };

      // DE KERN VAN #133: het gat is er, dus het oordeel over de meetkwaliteit
      // mag niet "schoon" zijn. Staat het er tóch, dan wijt de AI het aan de auto.
      if (v && v.waarde === 'ja')
        return { ok: false, tekst: soort + ' van ' + grootste + ' s gemeten over ' + aantal + ' onderbreking(en), ' +
          'maar de analyse krijgt te horen dat de meting schoon was. Dan wijt de AI dit aan het voertuig (#133).  |  ' + vTekst };

      return { ok: true, tekst: soort + ' van ' + grootste + ' s gemeten over ' + aantal + ' onderbreking(en), ' +
        'en het oordeel over de meting geeft dat door.  |  ' + vTekst };
    }
  },
  {
    id: 'meten',
    ronde: 'beide', nodig: 'auto', voorwaarde: true, issues: [],
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
    ronde: 'beide', nodig: 'toestel', voorwaarde: true, issues: [],
    titel: 'Verslag wegschrijven',
    waarom: 'Het verslag is het enige dat terug hoeft. Alles wat je hierboven hebt bevestigd, overgeslagen of beantwoord staat erin.',
    wat: 'Druk op afronden. Je krijgt het bestand meteen te downloaden.',
    knop: '🏁 Afronden en verslag opslaan',
    markering: 'begeleide run afgerond',
    controle: function () { return { ok: true, tekst: 'klaar' }; }
  }
];

function _bgStap() { return _BG.lijst[_BG.i] || null; }

/* De overgang, apart en zonder scherm eromheen. Test-begeleid.js draait hem
   zonder browser: dit is de enige plek waar besloten wordt of een stap als
   gedaan, overgeslagen of onvoldoende de boeken in gaat. */
function _bgUitkomst(controle, gedwongen) {
  if (!controle) return gedwongen ? 'overgeslagen' : 'gedaan';
  if (controle.ok) return 'gedaan';
  return gedwongen ? 'overgeslagen' : 'gedaan-met-bezwaar';
}

// Welke stappen horen bij welke ronde. Los gehouden zodat test-begeleid.js hem
// zonder browser kan draaien: dat een ritronde geen stilstaande stappen meesleept
// is de hele winst van #166, en dat hoort een toets te zijn en geen belofte.
function _bgLijst(soort) {
  return _STAPPEN.filter(function (s) { return s.ronde === soort || s.ronde === 'beide'; });
}

function begeleidStart(soort) {
  if (typeof isAdmin === 'function' && !isAdmin()) { try { showToast('Alleen voor admin'); } catch (e) { console.warn('toast mislukt', e); } return; }
  const s = _RONDES[soort] ? soort : 'rit';
  _BG.soort = s; _BG.lijst = _bgLijst(s);
  _BG.aan = true; _BG.i = 0; _BG.gepauzeerd = false; _BG.gestart = _nu(); _BG.gedaan = []; _BG.laatsteActie = '';
  _markeringen = [];
  plMarkeer('BEGELEIDE RUN GESTART', 'testrun ' + TESTRUN_VERSIE + ' — ' + _RONDES[s].naam.toLowerCase() +
    ', ' + _BG.lijst.length + ' stappen (' + _RONDES[s].uitleg + ')');
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

/* HET TESTRUNSCHERM GAAT OPZIJ (10-09-2026, #166).

   Het testrunscherm staat op z-index 9980, hoog in de ladder omdat het over de
   hele app heen moet. Maar de begeleide run stuurt je vanuit dát scherm naar
   ándere vensters, en die staan er onder: de meetcontextvragen op 9920, het
   logboek op 9975. Ze openden dus ACHTER het scherm waar de stap in staat.

   Zo mislukte de meetcontextproef van #64 op de rit van 10-09: de drie vragen
   waren geopend, maar onzichtbaar. De stap meldde daarna "het venster is niet
   beantwoord" — een bevinding over het issue, terwijl het de ladder was.

   Eén regel, op één plek: opent een stap een ander venster, dan zakt dit scherm
   eronder tot de stap klaar is. Voor stappen die je naar de APP zelf sturen
   (de live view) helpt dat niet — die zit onder álle overlays — en daar blijft
   sluiten de goede zet; dat verschil staat als `opent: 'venster'` of
   `opent: 'app'` in de stap zelf. */
const _BG_WIJK_Z = '9900';    // onder de meetcontextvragen (9920) en het logboek (9975)
function _bgWijk(opzij) {
  const ov = document.getElementById('testrunOv');
  if (!ov) return false;
  ov.style.zIndex = opzij ? _BG_WIJK_Z : '9980';
  return true;
}

function begeleidActie() {
  const s = _bgStap();
  if (!s || !s.actie) return;
  // Vóór de knop, niet erna: het venster gaat in fn() open en moet dan al
  // ruimte hebben.
  if (s.opent === 'venster') {
    try { _bgWijk(true); } catch (e) { console.warn('testrunscherm ging niet opzij — het venster opent mogelijk erachter', e); }
  }
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
  // Het scherm terug naar zijn eigen plek in de ladder; de stap is klaar, dus
  // het venster dat ervoor stond is dat ook.
  if (s.opent === 'venster') {
    try { _bgWijk(false); } catch (e) { console.warn('testrunscherm niet teruggezet in de ladder', e); }
  }
  _BG.gedaan.push({ id: s.id, titel: s.titel, t: _klok(), uitkomst: uitkomst, opm: opm });
  plMarkeer('stap ' + (_BG.i + 1) + '/' + _BG.lijst.length + ' — ' + s.markering, uitkomst.toUpperCase() + ': ' + opm);
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
    : 'verder bij stap ' + (_BG.i + 1) + '/' + _BG.lijst.length);
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
  plMarkeer('BEGELEIDE RUN AFGEROND', (reden || 'afgerond') + ' — ' + _BG.gedaan.length + ' van ' + _BG.lijst.length + ' stappen doorlopen');
  _BG.aan = false;
  if (_BG.timer) { clearInterval(_BG.timer); _BG.timer = null; }
  // Ook hier terug in de ladder: afronden kan midden in een stap die een
  // venster geopend had, en dan blijft het scherm anders weggezakt.
  try { _bgWijk(false); } catch (e) { console.warn('testrunscherm niet teruggezet bij het afronden', e); }
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
  if (_BG.gestart) r.push('Ronde: ' + ((_RONDES[_BG.soort] || {}).naam || _BG.soort) +
    '. Gestart om ' + new Date(_BG.gestart).toLocaleTimeString('nl-NL') + ', ' +
    _BG.gedaan.length + ' van ' + _BG.lijst.length + ' stappen doorlopen');
  const merk = { 'gedaan': '  ok  ', 'gedaan-met-bezwaar': 'LETOP ', 'overgeslagen': 'OVERG ', 'niet-bereikt': '  --  ' };
  _BG.gedaan.forEach(function (g, i) {
    r.push('[' + g.t + ']' + (merk[g.uitkomst] || '  ·   ') + (i + 1) + '. ' + g.titel);
    if (g.opm) r.push('                ' + g.opm);
  });
  const open = _BG.lijst.slice(_BG.gedaan.length).map(function (s) { return s.titel; });
  if (open.length) { r.push(''); r.push('NIET MEER AAN TOEGEKOMEN: ' + open.join('; ')); }

  /* WAT DEZE RONDE HEEFT OPGELEVERD (10-09-2026, #166). De aanleiding is de
     telling van dat issue: zeven van de negen stappen dienden een issue dat al
     dicht was, en niets werd daar rood van. Nu draagt elke stap zijn issues als
     data, en sluit het verslag af met de vraag die ertoe doet — welke open
     vragen zijn er met déze rit werkelijk gevoed, en welke niet? */
  const gehaald = {}, gemist = {};
  _BG.gedaan.forEach(function (g) {
    const st = _STAPPEN.filter(function (s) { return s.id === g.id; })[0];
    if (!st || !st.issues || !st.issues.length) return;
    const naar = (g.uitkomst === 'gedaan') ? gehaald : gemist;
    st.issues.forEach(function (q) { naar[q] = true; });
  });
  const lijst = function (o) { return Object.keys(o).sort().join(', '); };
  r.push('');
  r.push('WAT DEZE RONDE VOEDT: ' + (lijst(gehaald) || '(niets — geen enkele stap met een open vraag is gehaald)'));
  if (lijst(gemist)) r.push('AANGERAAKT MAAR NIET BINNEN: ' + lijst(gemist));
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
    '<span style="font:800 11px var(--f);color:var(--ac);letter-spacing:.5px">' +
      veilig((_RONDES[_BG.soort] || {}).naam || _BG.soort).toUpperCase() +
      ' — STAP ' + (_BG.i + 1) + ' VAN ' + _BG.lijst.length + '</span>' +
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
      // HET PANEEL VAN DE MEETKAMER KOMT HIER TUSSEN (#246). Het wordt door
      // pidlane-meetkamer.js zelf ingehangen vóór #testrunBody, zodat de twee
      // niet in hetzelfde element schrijven.
      '<div style="display:flex;gap:7px;flex-wrap:wrap;flex-shrink:0">' +
        // De begeleide run staat vooraan: hij is sinds 6.0 de manier waarop een
        // meetrit hoort te lopen. "Start" ernaast blijft voor wie alleen even
        // wil meten zonder rit eromheen.
        '<button onclick="begeleidStart(\'rit\')" style="background:var(--ac);color:#fff;border:0;border-radius:8px;padding:10px 16px;font:700 13px var(--f);cursor:pointer">🧭 Meetrit</button>' +
        // De toestelronde (#166). Alles wat geen RIJDENDE auto nodig heeft
        // staat hier, zodat het geen ritminuten kost: de schermoordelen, het
        // logboek en de meetcontextvragen. Stilstaand op de parkeerplaats of
        // thuis op de bank.
        '<button onclick="begeleidStart(\'toestel\')" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--ac);border-radius:8px;padding:10px 14px;font:700 12px var(--f);cursor:pointer">📱 Toestelronde</button>' +
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
        // DE KAARTMAKER (blok 15). Staat bewust náást de meetknoppen en niet
        // ertussen: hij neemt de verbinding over, zet de adapter in een andere
        // stand en duurt minuten. Dat is geen meting maar een expeditie.
        '<button onclick="kaartStart(false)" style="background:var(--sur2);color:var(--bl);border:1px solid var(--bl);border-radius:8px;padding:9px 12px;font:700 12px var(--f);cursor:pointer">🗺️ Kaart maken</button>' +
        '<button onclick="kaartStart(true)" style="background:var(--sur2);color:var(--tx3);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">🗺️ Volledig (uren)</button>' +
        '<button onclick="kaartGericht()" style="background:var(--sur2);color:var(--bl);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">🎯 Gericht</button>' +
        '<button onclick="stopTestrun()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">■ Stop</button>' +
        '<button onclick="plMarkeer(\'losse markering\', \'met de hand gezet\')" style="background:var(--sur2);color:var(--bl);border:1px solid var(--bl);border-radius:8px;padding:9px 12px;font:700 12px var(--f);cursor:pointer">📍 Markeer nu</button>' +
        '<button onclick="testrunOpslaan()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;font:600 12px var(--f);cursor:pointer">💾 Logboek</button>' +
      '</div>' +
      '<div id="testrunBody" style="flex:1"></div>';
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  _teken();
  // De meetkamer ververst zichzelf elke seconde zolang dit scherm open staat
  // (#246). Ontbreekt de module, dan draait de testrun gewoon door zoals
  // hiervoor — het paneel is een venster op de lus, geen onderdeel ervan.
  try { if (window.PLMeetkamer) PLMeetkamer.start(); }
  catch (e) { console.warn('De meetkamer is niet gestart — de testrun werkt verder normaal (#246)', e); }
}
// ══════════════════════════════════════════════════════════════════
// BLOK 15 — DE DATAPUNTENKAART
// ══════════════════════════════════════════════════════════════════
// Draait NIET mee in de gewone run: dit is geen meting maar een expeditie.
// De scan neemt de verbinding over (busslot, ATH1, korte timeout) en duurt
// minuten tot uren. Alles wat hij vindt komt in het testrunlogboek terecht,
// dus één keer "Logboek" na afloop en de hele kaart zit in het verslag.
//
// De uitvoering zit in pidlane-kaart.js; hier staat alleen wat een mens
// nodig heeft: een waarschuwing vooraf met de geschatte duur, de voortgang
// terwijl het loopt, en het verslag erna. Die scheiding is met opzet — de
// scanlogica is met test-kaart.js te toetsen, een knop niet.
let _kaartBezig = false;

async function kaartStart(volledig, extra) {
  extra = extra || {};
  if (!window.PLKaart) { _boek(15, 'Kaart', 'FOUT', 'PLKaart ontbreekt — pidlane-kaart.js hangt niet in index.html', null); return; }
  if (_kaartBezig) { try { showToast('De kaartmaker loopt al'); } catch (e) { /* stil: melding mag nooit de stroom breken */ } return; }
  if (typeof connected === 'undefined' || !connected) { _boek(15, 'Kaart', 'overgeslagen', 'geen verbinding met de adapter', null); return; }
  if (typeof demoMode !== 'undefined' && demoMode) { _boek(15, 'Kaart', 'overgeslagen', 'demomodus levert geen echte kaart', null); return; }

  const gericht = Array.isArray(extra.modules) && extra.modules.length;
  const sch = PLKaart.schatting({
    volledig: !!volledig,
    trap: extra.trap ? PLKaart.trapVan(extra.trap) : null,
    modules: gericht ? extra.modules.length : undefined,
    hergebruikAdressen: !!extra.hergebruikAdressen
  });
  const waarschuwing = (gericht ? 'GERICHT op ' + extra.modules.join(', ') + ' — blok "' + (extra.trap || 'alles') + '".\n\n' : '') +
    'De kaartmaker neemt de verbinding helemaal over: de gewone metingen staan stil, ' +
    'de adapter gaat in scanstand en er gaan ongeveer ' + sch.commandos.toLocaleString('nl-NL') +
    ' commando\'s de bus op.\n\nGeschatte duur: ' + sch.tekst + '.\n\n' +
    (volledig ? 'Dit is de VOLLEDIGE sweep over alle 65.536 identifiers per stuurapparaat. ' +
      'Laat de motor draaien of het contact aan staan, en de telefoon aan de lader.\n\n' : '') +
    'Alles is lezend; er wordt niets in de auto veranderd.\n\nDoorgaan?';
  if (typeof confirm === 'function' && !confirm(waarschuwing)) {
    _boek(15, 'Kaart', 'overgeslagen', 'afgebroken bij de bevestiging', null);
    return;
  }

  _kaartBezig = true;
  _boek(15, 'Kaart gestart', 'ok', (volledig ? 'volledige sweep'
      : gericht ? 'gericht op ' + extra.modules.join(', ') + ', blok "' + (extra.trap || 'alles') + '"'
      : 'getrapte sweep') +
    ' — schatting ' + sch.tekst + ', ' + sch.commandos + ' commando\'s', null);
  const t0 = _nu();
  let laatsteFase = '';
  try {
    const K = await PLKaart.scan({
      volledig: !!volledig,
      modules: extra.modules || null,
      trap: extra.trap || null,
      hergebruikAdressen: !!extra.hergebruikAdressen,
      onStap: function (st) {
        // Niet elke stap boeken: dat zijn er duizenden. Wel elke faseovergang,
        // plus de tussenstanden die de module zelf de moeite waard vindt.
        if (st.fase !== laatsteFase) { laatsteFase = st.fase; _boek(15, st.fase, 'ok', st.tekst, null); return; }
        if (st.totaal && st.gedaan) _voortgangKaart(st);
      }
    });
    const n = (K.modules || []).length;
    _boek(15, 'Kaart klaar', K.afgebroken ? 'FOUT' : 'ok',
      n + ' stuurapparaten, ' + PLKaart._intern.telDatapunten(K) + ' datapunten, ' +
      K.commandos + ' commando\'s' + (K.afgebroken ? '  |  AFGEBROKEN: ' + K.afgebroken : '') +
      (K.gestopt ? '  |  met de hand gestopt' : ''), _nu() - t0);
    if (K.herstelFout) {
      _boek(15, 'Adapterherstel', 'FOUT', K.herstelFout +
        '— verbreek en verbind opnieuw voordat je verder meet, anders praat de app tegen één stuurapparaat', null);
    }
    if (K.headersAan !== true) {
      _boek(15, 'Headers', 'LET OP',
        'de adapter gaf geen bruikbare CAN-id\'s terug; antwoorden zijn dan niet aan een ' +
        'stuurapparaat toe te wijzen en de kaart is een lijst zonder adressen', null);
    }
    // De hele kaart als één regel in het logboek: dat is het spoor dat
    // achteraf herlezen moet kunnen worden, met de ruwe bytes erin.
    _boek(15, 'Kaart', 'ok', '\n' + PLKaart.naarTekst(K), null);
  } catch (e) {
    _boek(15, 'Kaart', 'FOUT', 'de scan liep niet af: ' + (e.message || e), _nu() - t0);
  } finally {
    _kaartBezig = false;
  }
}

/* ── GERICHT ZOEKEN ────────────────────────────────────────────────
   De volledige trap kostte op de CX-5 van 04-09 bijna twee uur: achttien
   stuurapparaten maal 2944 identifiers, gemeten op 127 ms per commando. De
   vraag is bijna nooit "alles". Na die rit was hij heel precies: de
   OEM-blokken op ALLEEN het instrumentenpaneel — 1792 identifiers, ruim vier
   minuten.

   Daar was geen knop voor: de kaartmaker deed alle modules of niets. Deze
   kiezer vult dat gat. Hij leest de adressen uit de vorige scan (die worden
   onder het VIN-pseudoniem bewaard), zodat de sweep over 256 adressen — 89
   van de 171 seconden van de eerste rit — wordt overgeslagen.

   Geen adressen bekend? Dan eerst een gewone kaart draaien. Dat zeggen we,
   in plaats van stilletjes de hele sweep alsnog te doen. */
function kaartGericht() {
  if (!window.PLKaart) { _boek(15, 'Gericht', 'FOUT', 'PLKaart ontbreekt', null); return; }
  const box = document.getElementById('testrunBody');
  if (!box) return;

  const bekend = PLKaart.bekendeAdressen();
  const kaart = PLKaart.kaart();
  const adressen = bekend || ((kaart && kaart.modules) || []).map(function (m) { return { rx: m.rx, tx: m.tx }; });

  if (!adressen.length) {
    _boek(15, 'Gericht', 'overgeslagen',
      'nog geen adressen bekend van deze auto — draai eerst één keer "Kaart maken"; ' +
      'de adressen worden daarna onthouden en de sweep over 256 adressen kan dan overgeslagen worden', null);
    return;
  }

  // Wat de kaart al van dit adres weet, zodat de keuze niet blind is.
  const weet = {};
  ((kaart && kaart.modules) || []).forEach(function (m) {
    const n = (m.dids || []).length;
    weet[m.rx] = n ? n + ' identifiers gevonden' : 'nog niets gevonden';
  });

  let h = '<div class="pl-km pl-km-ok"><div class="pl-km-kop">🎯 Gericht zoeken — kies één stuurapparaat</div>' +
    '<div class="pl-m06-note">De adressen komen uit de vorige scan, dus de sweep over 256 adressen ' +
    'wordt overgeslagen. Kies daarna welk blok je wilt aflopen.</div><ul class="pl-km-bev">';
  adressen.forEach(function (a) {
    h += '<li><b>' + a.rx + '</b> <span style="opacity:.7">(zenden op ' + (a.tx || '?') + ')</span> ' +
      '<span style="opacity:.6">' + (weet[a.rx] || '') + '</span><br>' +
      '<button onclick="kaartStartGericht(\'' + a.rx + '\',\'oem\')" style="margin:5px 5px 0 0;background:var(--sur2);color:var(--bl);border:1px solid var(--bl);border-radius:7px;padding:6px 10px;font:700 11px var(--f);cursor:pointer">OEM-blokken (1792)</button>' +
      '<button onclick="kaartStartGericht(\'' + a.rx + '\',\'genormeerd\')" style="margin:5px 5px 0 0;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:7px;padding:6px 10px;font:600 11px var(--f);cursor:pointer">Genormeerd (1152)</button>' +
      '<button onclick="kaartStartGericht(\'' + a.rx + '\',\'alles\')" style="margin:5px 5px 0 0;background:var(--sur2);color:var(--tx3);border:1px solid var(--bd);border-radius:7px;padding:6px 10px;font:600 11px var(--f);cursor:pointer">Alles (2944)</button>' +
      '</li>';
  });
  h += '</ul></div>';
  box.innerHTML = h + box.innerHTML;
}

async function kaartStartGericht(rx, trap) {
  await kaartStart(false, { modules: [rx], trap: trap, hergebruikAdressen: true });
}

window.kaartGericht = kaartGericht;
window.kaartStartGericht = kaartStartGericht;

// Voortgang zonder het logboek vol te schrijven: één regel die zichzelf
// overschrijft. Duizend regels "adres 7A3" helpen niemand.
function _voortgangKaart(st) {
  const laatste = _trLog[_trLog.length - 1];
  const tekst = st.tekst + '  (' + st.gedaan + '/' + st.totaal + ')';
  if (laatste && laatste.blok === 15 && laatste.naam === 'voortgang') {
    laatste.detail = tekst;
    try { _teken(); } catch (e) { console.warn('Testrun-log niet hertekend tijdens de kaartscan', e); }
  } else {
    _boek(15, 'voortgang', 'ok', tekst, null);
  }
}

window.kaartStart = kaartStart;

function closeTestrun() {
  const ov = document.getElementById('testrunOv');
  if (ov) ov.style.display = 'none';
  // De tikker van de meetkamer moet mee uit: een verversing die doorloopt op
  // een verborgen scherm kost accu en meet niets (#246).
  try { if (window.PLMeetkamer) PLMeetkamer.stop(); }
  catch (e) { console.warn('De meetkamer is niet gestopt — hij blijft dan ververen op een gesloten scherm (#246)', e); }
}

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
  titel: 'OPLEVERING 16-09 (elfde) — de goedkope adapter, een scherm voor de verbinding, en twee gereedschappen die eindelijk iets terugzeggen (#210, #211, #212)',
  vragen: [
    '── WAAROM DEZE RONDE ────────',
    'ER IS VOOR HET EERST MET EEN ANDERE ADAPTER GEMETEN. Op 16-09 hing er geen MX+ aan maar een goedkope ELM327-kloon van AliExpress. Blok 10 meldde "zonder één misser tot 3.2 verzoeken/s" terwijl de app op datzelfde moment op 19% pollbudget stond. Die twee kunnen niet allebei waar zijn, en het antwoord stond niet in de meetblokken maar in de TX/RX-staart eronder: tien van de zestig antwoorden misten een PID, en negen van de negen keer was dat de LAATSTE PID van de batch.',
    'DE OORZAAK IS EEN TWEEDE LENGTE-INDICATOR MIDDEN IN HET ANTWOORD. De kloon herhaalt frames: "008 0:410C08670D00 008 1:410C 2:111C…". De parser gooide die tweede 008 weg en plakte het frame erachter aan dezelfde hexstroom, en kapte daarna af op de eerste opgegeven lengte. Meestal koste dat één PID. Eén keer was het duurder: bij 010B0E10 vulden de echobytes de lengte precies af en kwam 0110 eruit op 166,51 g/s, terwijl een losse 0110 in dezelfde seconde 1,45 g/s gaf. Geen MIST, geen melding, en binnen de harde limiet — dus dat getal komt overal doorheen.',
    'DAT IS GEREPAREERD (#210). De parser stopt nu bij het tweede bericht, en op een afgekapt antwoord mag hij een PID niet meer korter maken om hem passend te krijgen. Beide gevallen van 16-09 leveren daardoor een eerlijk gat op in plaats van een verzonnen getal. Blok 5 voert de opgenomen regels erdoorheen.',
    'EN ER IS EEN SCHERM BIJ GEKOMEN. Tik op de OBD-chip en je ziet wat de verbinding doet: verzoeken per seconde, responstijd, bezetting, foutgraad, onvolledige antwoorden, herhaalde frames, twee grafieken, en wat de automaat deed mét de reden. Je kunt het tempo overnemen, de groepsgrootte vastzetten, en een snelheidstest van veertig seconden draaien die solo én batch meet.',
    'EN ER ZIJN TWEE MOTORKAPPEN OPENGEGAAN. De waakronde meet al lang de sensoren die je niet aanvinkt, en de bulk-recorder legt tien uur rijden weg op 1 Hz — maar van geen van beide was een scherm. De waakronde paste in één strook stipjes en gooide bij elke ronde alles weg; de recorder kon alleen een NDJSON-bestand maken voor iemand met een script. Allebei hebben nu een eigen pagina in het ☰-menu: de waakronde met sessiehistorie, bereikmeters en export, de recorder met een analyse die in gewone zinnen vertelt wat er in de rit staat.',
    'DEZE RONDE HEEFT DUS DRIE VRAGEN, EN ALLE DRIE VRAGEN ZE EEN ADAPTER. Eén: verdwijnen de rare waarden op de goedkope adapter. Twee: klopt wat het paneel toont met wat de auto doet. Drie: geeft de snelheidstest een advies dat ergens op slaat.',
    '── WAT ÉÉN RUN DEZE RONDE MOET SLUITEN ────────',
    'DEZE RONDE IS ZO INGERICHT DAT ÉÉN RIT MEERDERE ISSUES AFMAAKT. Niet omdat er meer gemeten wordt, maar omdat blok 5 nu de gegevens oplevert waarop een besluit rust. Rijd één keer goed, lees het verslag, en er kunnen er drie dicht.',
    '#217 (boordspanning) — SLUIT OP DE METING. Blok 5 leest 0142 uit het ritbeeld, of uit de waakronde als je hem niet aangevinkt hebt. Blijft de spanning binnen 11,5–15,2 V, dan is onderspanning geén verklaring voor de vier storingen en is de adapter de verdachte. Zakt hij eronder, dan is het de accu. Beide uitkomsten sluiten het issue — alleen “niet gemeten” doet dat niet.',
    '#212 (blok 10 in batchvorm) — SLUIT OP EEN OORDEEL. De reparatie is al gedaan; wat overblijft is de vraag of blok 10 zélf ook in batchvorm hoort te meten. Kijk in het adapterpaneel of de solo- en batchkolom noemenswaardig uit elkaar lopen. Doen ze dat niet op deze adapter, dan is het antwoord nee en kan hij dicht.',
    '#64 (meetcontext) — SLUIT ALS JE DE A/B-PROEF DOET. Vraag één analyse met start/stop op “ja” en één met “nee”, en lees of het rapport werkelijk anders leest. Leest het hetzelfde, dan is de vraag versiering en gaat hij eruit. Dat is een antwoord en geen mislukking.',
    'WAT NIET MEER OPEN STAAT. #161 (de drempel voor “beweegt”) en #202 (de renderer na 59–60 s) zijn op 16-09 met een besluit gesloten en niet met een reparatie; de reden staat in §11. Ze hoeven deze rit dus niets te bewijzen — de proeven eromheen blijven wel meelopen, zodat een verandering opvalt.',
    '── STAP VOOR STAP ────────',
    'STAP 0 — VOORAF. Zet de app op de nieuwste versie (☰ → Nieuwste versie laden). Een nieuwe APK is deze ronde NIET nodig: alles zit in de webpagina. Draai je nog op de oude schil van vóór 12-09, kijk dan wel of de pakketnaam in blok 5 nl.pidlane.app is.',
    'STAP 1 — DOE HET MET DE GOEDKOPE ADAPTER, MAAR HAAL HEM ER DAARNA UIT (#217). Dit is de ronde waarin die adapter het meetinstrument is. Gaat het niet, doe hem dan met de MX+ en zeg dat erbij — dan is dit een controle dat er niets kapot is gegaan, en geen antwoord op de vraag. Nieuw sinds 16-09: laat hem NIET zitten als je niet rijdt. Na ritten met deze kloon stonden er vier storingen tegelijk in de auto (DSC, keyless entry, SCBS, parkeerrem), en dat is het beeld van onderspanning — een adapter die de bus wakker houdt, trekt de accu leeg.',
    'STAP 1B — VINK DE BOORDSPANNING AAN (0142). Dat is de één meting die #217 beslist: is het de accu, de adapter, of allebei. Rustend onder ~12,2 V of een diepe dip bij het starten, en je hebt je antwoord. De waakronde pakt hem ook vanzelf op — het is precies zo\'n sensor die niemand aanvinkt.',
    'STAP 2 — OPEN HET PANEEL VÓÓR DE RIT. Tik op de chip linksboven (Systeem → OBD). Lees de bovenste regel: staat er "Deze adapter herhaalt frames"? Onthoud het getal. Kijk of de naam en het ATI-antwoord kloppen met wat er in de auto zit.',
    'STAP 3 — DRUK OP DE SNELHEIDSTEST, STILSTAAND MET DRAAIENDE MOTOR. Veertig seconden. Lees de tabel: de kolom "solo" en de kolom "batch" horen op deze adapter uit elkaar te lopen. Onthoud het advies bovenaan.',
    'DE MEETRIT (🧭). Rijd met wisselend gas en trek onderweg één keer stevig op. Daarna minstens drie minuten naar de achtergrond met het scherm uit (#202), en schakel nog een andere app open. Als laatste de adapter er even uit (#133).',
    'STAP 3B — ZET DE WAAKRONDE AAN EN DE BULK-RECORDER OOK, VÓÓR DE RIT. Waakronde: ☰ → Waakronde → aanzetten. Bulk: ☰ → Admin → Bulk-recorder → start. Allebei lopen ze passief mee; ze horen de rest van de meting niet te raken. Merk je onderweg dat de app trager ververst, dan is dát de bevinding.',
    'STAP 4 — KIJK NA DE RIT NOG EENS IN HET PANEEL. Hoeveel herhaalde antwoorden staan er nu? Wat deed de automaat, en staat er bij elke stap een reden die klopt? Is de groep vanzelf naar 2 gegaan?',
    'DE TOESTELRONDE (📱). Vlak na de rit, stilstaand met een warme motor. Vier oordelen die alleen een mens kan geven plus de drie meetcontextvragen (#64).',
    'STAP 4B — OPEN \u201cWELK ONDERDEEL?\u201d, TWEE KEER. E\u00e9n keer met het contact aan en de motor UIT, en daarna met een draaiende warme motor. V\u00f3\u00f3r vandaag noemde dat scherm op een gezonde auto het brandstofpeil kapot; staat er nu nog iets dat je niet herkent, schrijf het over met de meetwaarde die eronder staat. Lees ook de foutcodes uit v\u00f3\u00f3r je kijkt \u2014 zonder scan doet de halve module niets, en dat zegt het scherm nu zelf.',
    'STAP 5 — LEES DE TWEE NIEUWE SCHERMEN NA DE RIT. Waakronde: klopt wat er bij “wat er gemeten is” staat met wat de auto doet, en staat er een bevinding tussen die je herkent? Bulk-analyse (☰ → Admin → Bulk-analyse): klopt de afstand ongeveer met je kilometerteller, klopt de tijdbalk met hoe de rit ging, en zeggen de conclusies iets dat je zelf ook gezien had? Een conclusie die niet klopt is waardevoller dan een die klopt — schrijf hem over.',
    'NA AFLOOP. Plak uit het ruwe verslag alleen de FOUT- en LET OP-regels met hun blokkop, en zet er drie dingen bij die er niet in staan: WELKE ADAPTER erin zat, wat het paneel als advies gaf, en of de getallen in het paneel klopten met wat je zag.',
    '── WAT DEZE RONDE NIET OPLOST ────────',
    'DAT DE ECHO WEG IS UIT DE METING BETEKENT NIET DAT DE METING COMPLEET IS. De reparatie van #210 verandert een verzonnen getal in een gat. Dat is beter, maar het gat blijft: op 16-09 miste 0111 zeven van de twintig keer. De kleinere groep (#211) moet dat terugbrengen, en of dat werkelijk gebeurt is deze ronde de meting.',
    'DE ECHO-KRIMP GAAT NIET TOT GROEP 1. Groep 1 verdrievoudigt het aantal verzoeken en de meting die dat zou rechtvaardigen bestaat niet — bij groep 2 is niet gemeten hoeveel er overblijft. Wie tot 1 wil, zet het paneel op handmatig. Blijft het gat bij groep 2 groot, dan is dát de bevinding.',
    'DE SNELHEIDSTEST IS GEEN BLOK 10. Veertig seconden tegenover negen en een halve minuut, vier trappen tegenover vijf, en geen rustmeting ertussen. Voor "kan ik nu harder" is dat genoeg; voor "loopt er een buffer vol die niet meer leegloopt" niet. Juist dat laatste sloeg op 16-09 aan: vier van de vijf rustmetingen bleven LET OP en de latentie zakte na trap 2 niet meer terug.',
    'HET ADVIES IS REKENWERK EN GEEN BELOFTE. "Bij 6/s hoort 100%" volgt uit de verhouding met wat de app nu doet. Of de bus dat een half uur volhoudt staat er niet in — dat is precies wat de rustmeting van blok 10 wél toetst.',
    'DAT DE MX+ DEZE ECHO NOOIT GEEFT IS NIET NAGEMETEN. Aannemelijk, want in geen van de eerdere runs stond er één, maar er is van die adapter geen TX/RX-staart met dezelfde batches naast gelegd. Rijd je deze ronde met de MX+, kijk dan of de echoteller op nul blijft — dan is dat alsnog gemeten.',
    '#202 EN #161 KRIJGEN DEZE RONDE GEEN ANTWOORD. De renderer die na 59-60 s stilvalt vraagt picture-in-picture, en dat is een eigen bouwronde. De drempel voor "beweegt" is een ontwerpbesluit en geen meetvraag.',
    'OF DE APP ZELF AAN DE STORINGEN IN #217 BIJDRAAGT, IS NIET GEMETEN. Mode 01-verzoeken zijn leesacties en horen in andere modules geen DTC te zetten. Maar van deze kloon is alleen gemeten wat er aan de SERIËLE kant uitkwam — dat hij frames herhaalt (#210) — en niet wat hij daarbij op de CAN-kant doet. Zolang dat er niet naast ligt, is “de app kan dit niet veroorzaken” een aanname en geen bevinding.',
    'DE AFSTAND IN DE BULK-ANALYSE IS EEN SCHATTING, EN BIJ GATEN TE LAAG. Hij telt de snelheid per seconde op; valt de adapter weg, dan loopt de tijd door en de afstand niet. Het venster noemt het aantal gatregels erbij, maar hoeveel kilometer dat scheelt is niet nagemeten — daarvoor moet er een kilometerstand naast.',
    'DE KLIMVERGELIJKING IS NOG NOOIT OP EEN ECHTE KLIM GEDRAAID. Hij zwijgt onder vijftig regels per kant, en in Nederland haal je die zelden. De drempel van 8 °C verschil komt uit redeneren, niet uit een meting: tot er een zware rit met caravan door de bergen onder ligt, is dat een aanname in de code en geen grens die iets bewezen heeft.',
    'DE WAAKRONDE-HISTORIE OVERLEEFT HET HERLADEN VAN DE PAGINA NIET. Hij staat in het geheugen, niet in localStorage. Dat is met opzet — een oordeel van twee ritten geleden zegt niets over nu — maar het betekent ook dat “Nieuwste versie laden” je sessieoverzicht wist. Wil je het bewaren, exporteer dan vóór het herladen.',
    'DE DREMPELS IN \u201cWELK ONDERDEEL?\u201d ZIJN NIET NAGEMETEN. 46 kPa stationair, 13,2 V laadspanning, 0,5 V sprei op de achterste lambdasonde: dat is redeneerwerk en gangbare praktijk, geen meting aan d\u00e9ze auto. Wat deze ronde wel vaststaat is wann\u00e9\u00e9r ze \u00fcberhaupt iets mogen betekenen \u2014 motor draaiend, warm, lang genoeg. Een kandidaat die opduikt terwijl je niets merkt is dus een bevinding over de drempel, niet over de auto.',
    'BLOK 5 DEKT DEZE RONDE: ' + _dekkingB5().join(', ') + '. Deze regel wordt uit de proevenlijst zelf afgeleid, niet met de hand bijgehouden \u2014 komt er een proef bij, dan staat hij hier vanzelf.'
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

/* Het live-pad naar buiten (17-09-2026). Twee redenen, en de tweede is de
   belangrijkste: het ritnummer is wat je doorgeeft aan wie meekijkt terwijl
   je rijdt, en zonder uitgang is dat alleen uit het verslag te vissen. De
   eerste is dat een gedragstest anders niets aan te roepen heeft — dit
   bestand is één IIFE, dus wat hier niet staat bestaat buiten niet. */
window.PLTestrunLive = {
  ritId: _liveRitId,
  tik: _liveTik,
  einde: _liveEinde,
  schema: LIVE_SCHEMA,

  /* ── WAT DE MEETKAMER MAG LEZEN (#246, 18-09-2026) ───────────────
     Het scherm dat de lus tekent heeft drie dingen nodig die hier binnen de
     IIFE staan: welke issues deze ronde gedekt worden, wat er tot nu toe
     geboekt is, en of er nog iets loopt.

     Dit zijn UITLENINGEN en geen kopieën, en dat is het hele punt. De
     meetkamer mag geen eigen lijstje issues bijhouden en geen eigen telling
     van wat er goed ging — dat is exact de vorm die §11 en PIDLANE-WERK.md
     de kop kostte: twee lijsten van hetzelfde die uit de pas lopen. Komt er
     een proef bij in PROEVEN_B5, dan staat hij vanzelf op het scherm.

     `proeven()` geeft alleen de METADATA terug, niet de proeffuncties: het
     scherm moet ze tonen, niet draaien. Draaien doet blok 5. */
  proeven: function () {
    return PROEVEN_B5.map(function (p) { return { issue: p.issue, naam: p.naam, waarom: p.waarom }; });
  },
  log: function () { return _trLog.slice(); },
  bezig: function () { return !!_trBezig; },
  campagne: function () { return CAMPAGNE.titel; }
};

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
// Bewust naar buiten voor test-blok5lijst.js. De lijst is sinds 6.6 de enige
// plek waar staat wat blok 5 deze ronde meet; een lijst die niet getoetst
// wordt verliest bij de eerste opruimactie stil een entry.
window.PLBlok5 = {
  proeven: function () { return PROEVEN_B5.map(function (p) { return { issue: p.issue, naam: p.naam, waarom: p.waarom, proef: p.proef }; }); },
  dekking: _dekkingB5,
  // CAMPAGNE hoort er hier bij en niet als eigen export: de enige vraag die de
  // test erover stelt is of de dekkingsregel dáár uit dezelfde lijst komt.
  campagne: function () { return CAMPAGNE; }
};

window.PLBegeleid = {
  stappen: function () { return _STAPPEN; },
  // De rondes en de filterregel erbij (#166): dat een ritronde niets
  // stilstaands meesleept is de hele winst, en die hoort getoetst te worden
  // in plaats van beloofd.
  rondes: function () { return Object.keys(_RONDES); },
  lijst: _bgLijst,
  // De oogstpoort los, zodat test-begeleid.js hem op een nagemaakte ritstand
  // kan draaien zonder browser en zonder auto.
  oogst: _ritOogst,
  // De meet-PIDs erbij sinds 6.5. Ze staan hier niet voor de app maar voor
  // test-begeleid.js: welke sensoren een rit moet aanzetten is een afspraak met
  // de issues (#19 de raildruk, #40 de twee bytelengtes), en zo'n afspraak die
  // alleen in een array staat verdwijnt bij de eerste opruimactie zonder dat
  // iets rood wordt.
  ritPids: function () { return RIT_PIDS.slice(); },
  stand: function () { return { aan: _BG.aan, i: _BG.i, gepauzeerd: _BG.gepauzeerd, gedaan: _BG.gedaan.slice() }; },
  markeringen: markeringen,
  _uitkomst: _bgUitkomst,
  _verslag: _bgVerslag
};

})();
