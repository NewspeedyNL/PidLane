// ══════════════════════════════════════════════════════════════════
// test-achtergrond.js — weet de app dat hij weg is geweest? (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. Android bevriest de timers van een WebView zodra
// de app naar de achtergrond gaat; pollus, recorder en logger stoppen dan
// tegelijk. Dat is niet te repareren vanuit JavaScript — wél te WETEN. En daar
// hangt meer aan dan een regel in het logboek: bij terugkomst is de SPP-socket
// vaak door Android opgeruimd, en tot 02-09-2026 bleek dat pas als de pollus er
// een commando in probeerde te schrijven. Zestien seconden rommel, met de
// ELM-interpreter in een andere staat dan de app dacht.
//
// EN SINDS 08-09-2026 STAAT ER MEER OP HET SPEL DAN WETEN. De melding zei tot
// die dag *"de app was 120 s weg — de meetlus stond in die tijd stil"*, en dat
// tweede deel was nooit gemeten. Op de rit van 02-09 was het aantoonbaar fout:
// de app deed na het verbergen nog 36 seconden werk (een herverbinding met
// ELM-init, een sensoruitval, een verificatie) voordat Android hem stilzette.
// De module telt nu met een hartslag hoe lang hij écht stillag, en deze test
// bewaakt het onderscheid dat daaruit volgt:
//
//   stil = 0     de lus liep door; er was niets aan de hand
//   stil = null  de hartslag liep niet; er is NIETS gemeten
//   na >= 3      de lus ging uit zichzelf weer lopen: afgeknepen, niet bevroren
//
// Die drie door elkaar halen is precies hoe #18 anderhalve week lang een
// verkeerd getal rapporteerde, dus ze staan hieronder alle drie apart.
//
// HOE ER GETOETST WORDT. pidlane-achtergrond.js wordt in zijn geheel geladen in
// een sandbox met een nagemaakte document/window, en daarna worden de twee
// overgangen aangeroepen die de echte luisteraar ook aanroept. Er wordt niets
// overgeschreven: de drempels, de lijst en de socketbeslissing komen uit de
// module zelf. Verandert daar een drempel, dan verandert deze test mee.
//
// Draaien vanuit public/:  node test-achtergrond.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

// ── de sandbox ────────────────────────────────────────────────────
// Alleen het scherm en de adapter zijn nagemaakt. De module zelf is echt.
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.logs = []; s.btlogs = []; s.guard = [];
  s.log = function (m, niveau) { s.logs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.btDiag = function (m, niveau) { s.btlogs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.connected = ('connected' in o) ? o.connected : true;
  if (o.spp !== false) s._sppConn = { spp: { naam: 'nep' }, address: 'AA:BB' };
  // De guard geeft een belofte terug, net als de echte. Wat hij MEEKRIJGT is
  // wat deze test wil weten: dat er niet met force=true gesloopt wordt.
  if (o.guard !== false) {
    s.sppReconnectGuard = function (spp, address, cmd, force) {
      s.guard.push({ address: address, cmd: String(cmd), force: force });
      return Promise.resolve();
    };
  }
  s.document = {
    _luisteraars: {},
    addEventListener: function (naam, fn) { this._luisteraars[naam] = fn; },
    visibilityState: 'visible'
  };
  /* DE HARTSLAG, MAAR DAN STUURBAAR. De module start bij heen() een
     setInterval en stopt hem bij terug(). Een echte timer zou deze test aan de
     klok van de machine hangen — dan meet hij hoe snel node is en niet wat de
     module doet. Deze nep-timer onthoudt alleen DAT hij gestart is en welke
     functie eraan hangt; de test laat hem zelf vuren met tik(), op de
     gestuurde klok. Dat is dezelfde afspraak als bij de rest van deze test:
     alles wat de module zelf beslist blijft echt.

     s.geenTimer=true bootst een omgeving na waar setInterval ontbreekt — dan
     hoort de module 'niet gemeten' te melden en niet stilzwijgend nul. */
  s.timers = { gestart: 0, gestopt: 0, fn: null, id: 0 };
  if (!o.geenTimer) {
    s.setInterval = function (fn) { s.timers.gestart++; s.timers.fn = fn; return ++s.timers.id; };
    s.clearInterval = function () { s.timers.gestopt++; s.timers.fn = null; };
  }
  /* DE NATIVE MEETDIENST, NAGEMAAKT TOT DE GRENS DIE IN DE APP OOK DE GRENS IS
     (#18). pidlane-achtergrond.js hoort de teller van de meetdienst op nul te
     zetten zodra de app verdwijnt, en bij terugkomst het rapport op te halen.
     Ontbreekt die koppeling, dan meet de native hartslag over een venster dat
     nergens bij hoort — en dat levert een getal op dat er goed uitziet en niets
     betekent. `o.meetdienst=false` bootst een browser na: dan hoort deze module
     precies niets te doen en `native` op null te laten staan. */
  s.meet = { nulstel: 0, rapport: 0 };
  if (o.meetdienst !== false) {
    s.PLMeetdienst = {
      nulstel: function () { s.meet.nulstel++; return Promise.resolve(true); },
      rapport: function () { s.meet.rapport++; return Promise.resolve(o.rapport || null); },
      oordeel: function (r) {
        return r ? { gemeten: true, reden: null, door: r.door, stil: r.stil, na: 0, slagen: r.slagen, hartslagMs: 1000 }
                 : { gemeten: false, reden: 'geen native meetdienst in deze schil', door: null, stil: null, na: null, slagen: null };
      },
      duiding: function (nat) { return nat.gemeten ? 'native: ' + nat.door + ' s door, ' + nat.stil + ' s stil' : 'native niet gemeten'; }
    };
  }
  vm.createContext(s);
  // Een stuurbare klok, vóór de module. Zonder dit hangt de test aan de echte
  // tijd: twee overgangen vlak na elkaar landen dan in dezelfde milliseconde en
  // knipt sinds() op ruis. Een test die soms groen is, is geen test.
  vm.runInContext('window.__nu = 1788000000000; Date.now = function () { return window.__nu; };', s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-achtergrond.js', 'utf8'),
    s, { filename: 'pidlane-achtergrond.js' });
  if (!s.PLAchtergrond) { console.error('FOUT: PLAchtergrond niet geladen'); process.exit(1); }
  return s;
}

// De klok een stuk vooruit zetten. Alles in deze test loopt hierop, dus de
// uitkomst hangt niet af van hoe snel de machine is.
function verstrijk(s, ms) { vm.runInContext('window.__nu += ' + ms + ';', s); }

// De hartslag laten lopen: ms milliseconden verstrijken, met elke seconde één
// tik. Zo speelt de test een app na die op de achtergrond gewoon doorloopt.
function loopt(s, ms) {
  for (let i = 0; i < Math.floor(ms / 1000); i++) { verstrijk(s, 1000); if (s.timers.fn) s.timers.fn(); }
  const rest = ms % 1000;
  if (rest) verstrijk(s, rest);
}
// En dit is de bevriezing: de tijd gaat door, de hartslag vuurt niet.
function bevroren(s, ms) { verstrijk(s, ms); }

// Weg en terug, met een gekozen duur. De module blijft echt; alleen de klok
// wordt gestuurd, en dat is precies de as waar deze module over gaat.
// `verloop` speelt na wat er tijdens de afwezigheid gebeurde; ontbreekt hij,
// dan vuurt de hartslag niet en is de hele afwezigheid dus stil.
function wegGeweest(s, ms, verloop) {
  const lijstVoor = s.PLAchtergrond.perioden().length;
  s.PLAchtergrond._heen();
  if (verloop) verloop(s); else verstrijk(s, ms);
  const p = s.PLAchtergrond._terug();
  return { p: p, nieuw: s.PLAchtergrond.perioden().length - lijstVoor };
}

console.log('\n── de drempels komen uit de module ──');
{
  const s = bouw();
  const d = s.PLAchtergrond._drempels();
  toets('melden vanaf 3 s', d.melden, 3000);
  toets('socket nakijken vanaf 10 s', d.socket, 10000);
  toets('de hartslag tikt elke seconde', d.hartslag, 1000);
  toets('en onder twee slagen heet het geen stilte', d.stil, 2000);
}

console.log('\n── een korte vensterwissel is geen bevriezing ──');
{
  // Zonder deze helft zou "leg alles vast" ook groen geven, en dan staat de
  // lijst vol met de bestandskiezer en de meldingenbalk.
  const s = bouw();
  const r = wegGeweest(s, 1500);
  toets('1,5 s levert geen periode op', r.nieuw, 0);
  toets('en geen regel in het logboek', s.logs.length, 0);
  toets('en de socket wordt met rust gelaten', s.guard.length, 0);
}

console.log('\n── weg, maar te kort voor de socket ──');
{
  const s = bouw();
  const r = wegGeweest(s, 5000);
  toets('5 s wordt wél vastgelegd', r.nieuw, 1);
  toets('met de duur erbij', r.p.s, 5);
  toets('het staat als waarschuwing in het logboek', s.logs.length && s.logs[0].niveau, 'warn');
  toets('de melding noemt het issue', /#18/.test(s.logs[0].m), true);
  toets('maar de socket wordt nog niet nagekeken', s.guard.length, 0);
  toets('en dat staat ook zo in de periode', r.p.socket, null);
}

console.log('\n── lang weg: de socket wordt nagekeken vóór het volgende commando ──');
{
  const s = bouw();
  const r = wegGeweest(s, 190000);
  toets('190 s wordt vastgelegd', r.p.s, 190);
  toets('de guard is aangeroepen', s.guard.length, 1);
  toets('op het adres van de verbinding', s.guard[0].address, 'AA:BB');
  // DIT is de kern. force=true sloopt de socket zonder te kijken; dat hoort
  // hier niet, want een gezonde verbinding mag een achtergrondpauze overleven.
  toets('met force UIT — eerst kijken, dan pas ingrijpen', !s.guard[0].force, true);
  toets('en de reden staat erbij', /achtergrond/.test(s.guard[0].cmd), true);
  toets('de periode meldt wat er gebeurd is', r.p.socket, 'socket nagekeken');
}

console.log('\n── zonder verbinding valt er niets na te kijken ──');
{
  const s = bouw({ connected: false });
  const r = wegGeweest(s, 190000);
  toets('de periode wordt nog steeds vastgelegd', r.p.s, 190);
  toets('maar de guard blijft ongemoeid', s.guard.length, 0);
  toets('en de reden staat in de periode', r.p.socket, 'niet verbonden');
}

console.log('\n── een ontbrekende guard faalt niet stil ──');
{
  // De bedradingscontrole bewaakt dit ook (sppReconnectGuard staat in KRITIEK),
  // maar hier is te zien wat er dan in het verslag komt.
  const s = bouw({ guard: false });
  const r = wegGeweest(s, 190000);
  toets('de periode blijft', r.p.s, 190);
  toets('en de periode zegt wat er ontbreekt', r.p.socket, 'sppReconnectGuard ontbreekt');
}

console.log('\n── DE MEETFOUT VAN 02-09: weg is niet hetzelfde als stil ──');
{
  /* De rit van 02-09 om 23:22, nagespeeld. De app was 120 s weg, liep daarvan
     de eerste 36 s gewoon door (herverbinding, ELM-init, verificatie) en lag
     de resterende 84 s stil. De oude module meldde 120 s stil, en blok 5 zette
     LET OP op het verschil tussen die 120 en de 64 s die PLRit afleidde.

     Dit is de toets die dat had gevangen: de duur en het oordeel moeten twee
     verschillende getallen zijn. */
  const s = bouw();
  const r = wegGeweest(s, 0, function (sb) { loopt(sb, 36000); bevroren(sb, 84000); });
  toets('de afwezigheid is 120 s', r.p.s, 120);
  toets('de aanlooptijd is gemeten op 36 s', r.p.door, 36);
  toets('en de bevriezing op 84 s', r.p.stil, 84);
  toets('hij liep daarna niet meer uit zichzelf', r.p.na, 0);
  toets('er zijn 36 hartslagen geteld', r.p.slagen, 36);
  // DE ONDERSCHEIDENDE HELFT. Een melding die "120 s stil" zegt is groen op
  // alles hierboven en toch fout — dit is de enige toets die dat merkt.
  toets('de melding noemt de stilte en niet de afwezigheid als stil',
    /36 s doorgelopen, daarna 84 s stil/.test(s.logs[0].m), true);
  toets('en beweert nergens dat de lus 120 s stillag',
    /120 s stil/.test(s.logs[0].m), false);
}

console.log('\n── weg, maar de lus liep gewoon door ──');
{
  // Dit gebeurt echt: korter dan de aanlooptijd van ~36 s wegschakelen kost
  // niets. Meldde de oude module als "20 s stil" — een verzonnen bevriezing.
  const s = bouw();
  const r = wegGeweest(s, 0, function (sb) { loopt(sb, 20000); });
  toets('20 s weg', r.p.s, 20);
  toets('en nul stil', r.p.stil, 0);
  toets('de hele periode is doorgelopen', r.p.door, 20);
  toets('dat is geen waarschuwing maar nieuws', s.logs[0].niveau, 'info');
  toets('en de melding zegt het ook zo', /liep gewoon door/.test(s.logs[0].m), true);
  // De socket wordt wél nagekeken: 20 s is boven de drempel, en of Android de
  // SPP-verbinding opruimt staat los van of de JS-timers liepen.
  toets('de socket wordt nog steeds nagekeken', r.p.socket, 'socket nagekeken');
}

console.log('\n── afgeknepen is iets anders dan bevroren ──');
{
  /* Chromium knijpt een verborgen tab eerst af naar één tik per minuut vóórdat
     Android het proces stilzet. Dat leest als een bevriezing van een minuut,
     maar de lus komt uit zichzelf terug — en dat vraagt om een andere
     oplossing dan een foreground service. Zonder `na` zijn die twee niet uit
     elkaar te houden. */
  const s = bouw();
  const r = wegGeweest(s, 0, function (sb) {
    loopt(sb, 10000);      // eerst normaal
    bevroren(sb, 60000);   // dan een minuut niets
    loopt(sb, 40000);      // en daarna weer gewoon door
  });
  toets('110 s weg', r.p.s, 110);
  /* 61 en niet 60, en dat is geen afrondingsfout maar de resolutie van de
     meting. Een hartslag van één seconde kan een stilte alleen begrenzen
     tussen de slag ervóór en de slag erná; die twee liggen 61 s uit elkaar.
     De module overschat dus met hoogstens één slag, en dat is de kant waar je
     hem wilt hebben — liever een seconde te veel stilte dan een seconde die
     stilzwijgend als "liep door" wordt geboekt. */
  toets('de langste stilte is de minuut, plus één slag resolutie', r.p.stil, 61);
  toets('die begon na 10 s', r.p.door, 10);
  toets('en daarna liep hij zelf nog 39 s', r.p.na, 39);
  toets('de drie delen tellen op tot de afwezigheid', r.p.door + r.p.stil + r.p.na, r.p.s);
  toets('de melding noemt het afgeknepen en niet bevroren',
    /afgeknepen, niet bevroren/.test(s.logs[0].m), true);
}

console.log('\n── de staart telt mee, hoe de volgorde ook uitvalt ──');
{
  /* Ontdooit de app een fractie vóór het visibilitychange-bericht, dan komt er
     nog één hartslag binnen. Zonder de staartregel in _stilte() zou de stilte
     dan uit de laatste twee slagen komen — en dat is een seconde in plaats van
     twee minuten. Een meetfout die van de volgorde van twee gebeurtenissen
     afhangt, is precies het soort dat maanden blijft staan. */
  const s = bouw();
  const r = wegGeweest(s, 0, function (sb) {
    loopt(sb, 5000);
    bevroren(sb, 120000);
    if (sb.timers.fn) sb.timers.fn();   // de app ontdooit, één slag glipt erdoor
  });
  toets('de bevriezing van 120 s is gevonden', r.p.stil, 120);
  toets('en niet de seconde ernaast', r.p.stil > 100, true);
}

console.log('\n── zonder hartslag is de stilte NIET NUL maar ONBEKEND ──');
{
  /* De kern van de reparatie van 08-09 in één toets. Nul betekent "de lus liep
     door" — een uitspraak. Kan de module die uitspraak niet doen, dan hoort er
     null te staan en hoort de melding dat te zeggen. Wie hier nul teruggeeft,
     bouwt precies de fout terug die dit issue anderhalve week lang open hield:
     een oordeel dat er stilzwijgend bij verzonnen wordt. */
  const s = bouw({ geenTimer: true });
  const r = wegGeweest(s, 120000);
  toets('de periode wordt gewoon vastgelegd', r.p.s, 120);
  toets('maar de stilte is onbekend, niet nul', r.p.stil, null);
  toets('en de aanlooptijd ook', r.p.door, null);
  toets('de melding zegt dat het niet gemeten is', /niet gemeten/.test(s.logs[0].m), true);
  // \d+ en niet los 's stil': "de meetlus stillag" bevat dat toevallig ook, en
  // dan is deze toets groen op de tekst die hij juist moet verbieden.
  toets('en noemt geen duur voor de stilte', /\d+ s stil/.test(s.logs[0].m), false);
  toets('stilsteS() telt een ongemeten periode niet mee', s.PLAchtergrond.stilsteS(0), 0);
  toets('en gemeten() zegt dat er niets te vergelijken valt', s.PLAchtergrond.gemeten(0), 0);
}

console.log('\n── de hartslag loopt alleen terwijl de app weg is ──');
{
  // Een hartslag die in beeld doorloopt is verspilde batterij én een verkeerde
  // meting: dan staat _laatste altijd vlak achter en meet de volgende
  // afwezigheid te weinig stilte.
  const s = bouw();
  toets('bij het laden loopt er nog niets', s.timers.gestart, 0);
  s.PLAchtergrond._heen();
  toets('heen() start hem', s.timers.gestart, 1);
  toets('en hij is nog niet gestopt', s.timers.gestopt, 0);
  verstrijk(s, 5000);
  s.PLAchtergrond._terug();
  toets('terug() stopt hem', s.timers.gestopt, 1);
  // Twee keer heen zonder terug mag geen tweede timer opleveren; anders lopen
  // er na een handvol vensterwissels tien hartslagen door elkaar.
  s.PLAchtergrond._heen();
  s.PLAchtergrond._heen();
  toets('twee keer heen start één hartslag', s.timers.gestart, 2);
}

console.log('\n── stilsteS() geeft de langste GEMETEN stilte, niet de langste afwezigheid ──');
{
  /* Dit is het getal dat blok 5 naast PLRit.gaten() legt. Legt hij de
     afwezigheid ernaast in plaats van de stilte, dan slaat hij alarm op de
     aanlooptijd — en dat is wat er op 02-09 gebeurde. */
  const s = bouw();
  wegGeweest(s, 0, function (sb) { loopt(sb, 36000); bevroren(sb, 84000); });  // 120 weg, 84 stil
  verstrijk(s, 30000);
  wegGeweest(s, 0, function (sb) { loopt(sb, 5000); bevroren(sb, 20000); });   // 25 weg, 20 stil
  toets('twee perioden', s.PLAchtergrond.perioden().length, 2);
  toets('de langste afwezigheid is 120 s', s.PLAchtergrond.totaalS(0), 145);
  toets('maar de langste gemeten stilte is 84 s', s.PLAchtergrond.stilsteS(0), 84);
  toets('en beide perioden hebben hem gemeten', s.PLAchtergrond.gemeten(0), 2);
}

console.log('\n── de lijst is per rit te bevragen ──');
{
  const s = bouw();
  wegGeweest(s, 5000);
  verstrijk(s, 60000);          // een minuut rijden tussen de twee onderbrekingen
  const tweede = wegGeweest(s, 8000).p;
  // Het knippunt komt uit de tweede periode zelf. Een eigen Date.now() ernaast
  // zetten werkt hier niet: de twee _heen()-aanroepen liggen microseconden uit
  // elkaar, en dan knipt de test op ruis in plaats van op een moment.
  toets('twee perioden vastgelegd', s.PLAchtergrond.perioden().length, 2);
  toets('sinds() knipt op het moment van nulstellen', s.PLAchtergrond.sinds(tweede.van).length, 1);
  toets('totaalS telt alleen wat daarna kwam', s.PLAchtergrond.totaalS(tweede.van), 8);
  toets('laatste() geeft de jongste', s.PLAchtergrond.laatste().s, 8);
  s.PLAchtergrond.wis();
  toets('wis() maakt de lijst leeg', s.PLAchtergrond.perioden().length, 0);
}

console.log('\n── de luisteraar hangt aan visibilitychange ──');
{
  const s = bouw();
  const fn = s.document._luisteraars['visibilitychange'];
  toets('er is een luisteraar', typeof fn, 'function');
  s.document.visibilityState = 'hidden';
  fn();
  toets('hidden zet de klok aan', s.PLAchtergrond.weg(), true);
  s.document.visibilityState = 'visible';
  fn();
  toets('visible zet hem uit', s.PLAchtergrond.weg(), false);
}

/* De laatste sectie is async, en dat is geen stijlkeuze. De native kant
   antwoordt met een belofte; terug() blijft synchroon omdat hij aan
   visibilitychange hangt. De periode wordt dus AANGEVULD zodra het antwoord er
   is, en dat valt alleen te toetsen door de microtaken te laten lopen. */
(async function () {

  console.log('\n── de native meetdienst wordt op nul gezet bij het weggaan (#18) ──');
  {
    const s = bouw();
    toets('nog niets gebeurd', s.meet.nulstel, 0);
    s.PLAchtergrond._heen();
    // DIT is het moment waarop het kan: vanaf hier is er geen garantie meer
    // dat er nog JavaScript draait. Gebeurt het later, dan meet de native
    // hartslag over een venster dat niet bij deze afwezigheid hoort.
    toets('heen() zet de native teller op nul', s.meet.nulstel, 1);
    loopt(s, 5000);
    s.PLAchtergrond._terug();
    toets('en terug() vraagt het rapport op', s.meet.rapport, 1);
  }

  console.log('\n── zonder native kant blijft native null, en niet nul ──');
  {
    // Een browser, een PWA, of elke APK van vóór deze ronde. "Niet gemeten"
    // als nul lezen is de fout die #18 anderhalve week een verkeerd getal
    // liet rapporteren.
    const s = bouw({ meetdienst: false });
    const r = wegGeweest(s, 60000);
    toets('er is een periode', r.nieuw, 1);
    toets('native blijft null', r.p.native, null);
    toets('en er is niets opgevraagd', s.meet.rapport, 0);
  }

  console.log('\n── het native oordeel wordt aan de periode geplakt ──');
  {
    const s = bouw({ rapport: { door: 50, stil: 132, slagen: 50 } });
    const r = wegGeweest(s, 182000);
    toets('meteen na terug() staat het er nog niet', r.p.native, null);
    await null; await null; await null;
    // Blok 5 en blok 14 lezen de lijst aan het eind van een rit; dan staat hij
    // er allang in. Deze toets bewijst dat hij er ooit in komt.
    toets('en daarna wel', r.p.native && r.p.native.gemeten, true);
    toets('met de aanlooptijd erbij', r.p.native.door, 50);
    toets('en de gemeten stilte', r.p.native.stil, 132);
    const nat = s.logs.filter(function (x) { return /native/.test(x.m); });
    toets('er staat één native regel in het logboek', nat.length, 1);
    toets('en die is een waarschuwing, want er lag iets stil', nat[0].niveau, 'warn');
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
})();
