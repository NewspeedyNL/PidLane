// ══════════════════════════════════════════════════════════════════
// test-nativeschil.js — hangt de native meetdienst overal aan hetzelfde? (#18)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BRONCODE LEEST EN GEEN GEDRAG. De regel in dit project is
// dat een test zijn onderwerp LAADT en niet overschrijft. Voor Java lukt dat
// niet: er is geen Android in node, en de android/-map bestaat niet eens in de
// repo — die wordt elke build opnieuw gegenereerd. De vraag die hier wél te
// beantwoorden is, is een koppelingsvraag, en dat is precies de vraag die hier
// stukgaat.
//
// De meetdienst hangt aan VIER plekken die elkaar niet kennen:
//
//   native/PLMeetdienstPlugin.java      de naam waaronder de plugin bestaat
//   native/PLMeetdienst.java            de service en zijn type
//   .github/workflows/build-apk.yml     de injectie en het manifest
//   public/pidlane-meetdienst.js        de aanroepen vanuit de app
//
// Loopt er één uit de pas, dan is het gevolg stil: Capacitor.Plugins.
// PLMeetdienst bestaat niet, de app valt terug op "geen native meetdienst in
// deze schil", en dat is precies wat een browser óók zegt. Je ziet het dus
// niet aan het logboek — je ziet het pas als er een rit voor niets gereden is.
//
// Dat is dezelfde vorm als #35 en als de locatiecontrole die groen stond omdat
// hij niets vond: een controle die niets ziet is geen controle. Daarom staat
// hier bij elke koppeling een toets die rood wordt als één van de twee kanten
// verschuift — en niet één die alleen kijkt of er íéts staat.
//
// Draaien vanuit public/:  node test-nativeschil.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const WORTEL = path.join(__dirname, '..');
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
function bevat(naam, tekst, stuk) {
  n++;
  if (String(tekst).indexOf(stuk) !== -1) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + '\n        ontbreekt: ' + stuk); }
}
function lees(p) {
  const vol = path.join(WORTEL, p);
  if (!fs.existsSync(vol)) { console.error('FOUT: ' + p + ' bestaat niet'); process.exit(1); }
  return fs.readFileSync(vol, 'utf8');
}

const plugin = lees('native/PLMeetdienstPlugin.java');
const dienst = lees('native/PLMeetdienst.java');
const wf     = lees('.github/workflows/build-apk.yml');
const js     = lees('public/pidlane-meetdienst.js');
const cfg    = JSON.parse(lees('capacitor.config.json'));

console.log('\n── het pakket is één pakket ──');
{
  // De workflow zoekt de doelmap op via de package-regel. Wijkt die af van de
  // appId, dan bestaat android/app/src/main/java/<pakket> niet en stopt de
  // build daar — maar liever hier, in een seconde.
  const pak = (plugin.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1];
  toets('de plugin zit in het pakket van de appId', pak, cfg.appId);
  toets('en de service in hetzelfde pakket',
    (dienst.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1], cfg.appId);

  // En de appId zelf moet een pakketnaam ZIJN. Play weigert een bundel waarvan
  // de naam niet aan deze vorm voldoet met "Voer een geldige pakketnaam in" —
  // een melding die niets zegt over welk teken het probleem is, en die je pas
  // ziet als je de .aab al aan het uploaden bent. De vorm: minstens twee
  // delen, elk deel begint met een kleine letter, verder alleen a-z, 0-9 en _.
  // Dezelfde toets staat in build-apk.yml op de GEBOUWDE bundel; deze staat
  // hier omdat plcheck.sh voor elke commit draait en de APK-build niet.
  const delen = String(cfg.appId).split('.');
  toets('de appId heeft minstens twee delen', delen.length >= 2, true);
  toets('elk deel van de appId is een geldige pakketcomponent',
    delen.filter(d => !/^[a-z][a-z0-9_]*$/.test(d)), []);

  // De poort op de GEBOUWDE bundel. Deze toets hierboven leest de bedoeling;
  // die poort leest wat er werkelijk uit de manifest-merge komt. Valt hij weg,
  // dan is de bedoeling nog steeds bewaakt maar het resultaat niet meer — en
  // dat is precies het gat waar de inzending van 12-09-2026 op strandde.
  bevat('de bundelpoort leest de pakketnaam uit het manifest', wf, 'Pakketnaam in de bundel');
  bevat('en legt hem naast capacitor.config.json', wf, 'maar capacitor.config.json zegt');
}

console.log('\n── de naam waaronder de app de plugin zoekt ──');
{
  const naam = (plugin.match(/@CapacitorPlugin\s*\(\s*name\s*=\s*"([^"]+)"/) || [])[1];
  toets('@CapacitorPlugin draagt een naam', typeof naam, 'string');
  // DE KOPPELING. Staat hier iets anders dan wat de app opzoekt, dan is
  // Capacitor.Plugins.PLMeetdienst undefined en zegt de app "geen native
  // meetdienst" — dezelfde zin als in een browser.
  bevat('en de app zoekt exact die naam op', js, 'Plugins.' + naam);
  toets('de klassenaam volgt de pluginnaam', plugin.indexOf('class ' + naam + 'Plugin ') !== -1, true);
}

console.log('\n── elke methode die de app aanroept bestaat, en andersom ──');
{
  const inJava = [];
  const reJava = /@PluginMethod\s+public\s+void\s+(\w+)\s*\(/g;
  let mj;
  while ((mj = reJava.exec(plugin))) inJava.push(mj[1]);
  inJava.sort();
  // Wat de app aanroept: elke p.<naam>( in de module, waar p de plugin is.
  const inJs = Array.from(new Set((js.match(/\bp\.(\w+)\(/g) || [])
    .map(function (m) { return m.slice(2, -1); }))).sort();
  toets('er staan @PluginMethod-methoden in de plugin', inJava.length > 0, true);
  // Beide kanten op. Een methode die de app aanroept maar die niet bestaat
  // levert een belofte op die nooit iets doet; een methode in Java die
  // niemand aanroept is dode native code die wél in de app meegaat.
  toets('de app roept niets aan wat niet bestaat',
    inJs.filter(function (m) { return inJava.indexOf(m) === -1; }), []);
  toets('en java biedt niets aan wat niemand gebruikt',
    inJava.filter(function (m) { return inJs.indexOf(m) === -1; }), []);
}

console.log('\n── de hartslag tikt aan beide kanten even snel ──');
{
  // Anders is "native deed 120 slagen en de webview 3" geen meting maar een
  // verschil in instelling, en dat is precies het getal waar de keuze tussen
  // foreground service, PiP en native meetlus op gebaseerd wordt.
  const java = Number((dienst.match(/HARTSLAG_MS\s*=\s*(\d+)L?/) || [])[1]);
  const web = Number((js.match(/var HARTSLAG_MS\s*=\s*(\d+)/) || [])[1]);
  toets('java tikt op 1000 ms', java, 1000);
  toets('en de app rekent met hetzelfde getal', web, java);
}

console.log('\n── het servicetype past bij de permissie ──');
{
  // Android 14 houdt deze drie tegen elkaar aan. Klopt één ervan niet, dan
  // gooit startForeground() een SecurityException op het moment dat de
  // gebruiker verbindt — in de auto, niet hier.
  bevat('java start met het type connectedDevice', dienst, 'FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE');
  bevat('de workflow zet datzelfde type in het manifest', wf, 'android:foregroundServiceType="connectedDevice"');
  bevat('en vraagt de permissie die erbij hoort', wf, 'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE');
  bevat('de service staat niet open voor buiten', wf, 'android:exported="false"');
  // En de poort op het SAMENGEVOEGDE manifest, want dat is wat er in de .aab
  // belandt. De injectie controleren is de invoer controleren.
  bevat('de bundelpoort eist de meetdienst zelf', wf, 'de meetdienst staat niet in de bundel');
  bevat('de bundelpoort koppelt type aan permissie', wf, 'Android 14 weigert startForeground()');
}

console.log('\n── de plugin wordt geregistreerd, en op tijd ──');
{
  // Een plugin die in de app zelf woont staat niet in capacitor.plugins.json:
  // dat bestand gaat alleen over node_modules. Zonder registerPlugin bestaat
  // hij niet, en de app kan dat niet van "geen schil" onderscheiden.
  bevat('de workflow registreert de plugin', wf, 'registerPlugin(PLMeetdienstPlugin');
  const blok = wf.slice(wf.indexOf('"        registerPlugin(PLMeetdienstPlugin.class);"'));
  // registerPlugin MOET vóór super.onCreate(): de bridge leest de lijst
  // tijdens het opstarten en kijkt er daarna niet meer naar.
  const reg = wf.indexOf('registerPlugin(PLMeetdienstPlugin.class)');
  const sup = wf.indexOf('super.onCreate(savedInstanceState);');
  toets('en doet dat vóór super.onCreate()', reg > -1 && sup > -1 && reg < sup, true);
  toets('de registratie faalt hard als de vorm verandert',
    /MainActivity-vorm is veranderd/.test(wf), true);
  toets('het blok is niet leeg', blok.length > 0, true);
}

console.log('\n── de bestanden komen mee, en een wijziging start een build ──');
{
  bevat('de workflow kopieert native/', wf, 'bron = pathlib.Path("native")');
  // Zonder deze padregel bouwt een wijziging aan de Java niets, en staat de
  // oude dienst in de volgende APK terwijl de diff iets anders laat zien.
  // Dat is exact de fout die met het app-icoon al een keer gemaakt is.
  bevat('en native/** start een build', wf, "- 'native/**'");
}

console.log('\n── de app laadt de module ──');
{
  const html = lees('public/index.html');
  bevat('pidlane-meetdienst.js hangt in index.html', html, 'src="pidlane-meetdienst.js"');
  // Hij wikkelt setConn, dus hij moet ná pidlane-uihelpers.js staan waar die
  // gedefinieerd wordt. Anders is setConn nog geen functie en volgt de dienst
  // de verbinding niet — stil, want dat zit achter een guard.
  toets('en staat ná pidlane-uihelpers.js',
    html.indexOf('src="pidlane-meetdienst.js"') > html.indexOf('src="pidlane-uihelpers.js"'), true);
}

console.log('\n── de wake lock en zijn permissie horen bij elkaar ──');
{
  /* GEMETEN OP 11-09-2026, EN DAAROM STAAT DIT ER. Met alleen de foreground
     service liep de native hartslag perfect bij afwezigheden van 77 en 310 s
     (78/78 en 310/310 slagen), maar bij 485 s haalde hij er 373 van de ~485
     met een gat van 34 s vanaf 222 s. Een service houdt het PROCES uit de
     cached-toestand; hij houdt de CPU niet wakker.

     De permissie is de stille helft: zonder WAKE_LOCK in het manifest gooit
     newWakeLock().acquire() een SecurityException. De dienst draait dan
     gewoon door en de hartslag hapert pas na minuten — je ziet het niet aan
     de app, je ziet het aan een rit die je al gereden hebt. */
  bevat('de service neemt een partial wake lock', dienst, 'PARTIAL_WAKE_LOCK');
  bevat('en geeft hem vrij als hij stopt', dienst, 'wakeUit()');
  // Op de INJECTIEVORM en niet op de kale naam: die staat ook in de
  // bundelpoort hieronder, en dan blijft deze toets groen terwijl de
  // injectie verdwenen is. Een controle die niets ziet is geen controle.
  bevat('de workflow injecteert de permissie', wf,
    '<uses-permission android:name="android.permission.WAKE_LOCK" />');
  bevat('en de bundelpoort eist hem', wf, 'de partial wake lock van de meetdienst (#18)');
  // De lock wordt geclaimd vóór de teller op nul gaat: anders meet het eerste
  // stuk van het venster een CPU die nog kan gaan slapen.
  const claim = dienst.indexOf('wakeAan();');
  const nul = dienst.indexOf('nulstel();', claim > -1 ? claim : 0);
  toets('de lock is er vóór het meetvenster begint', claim > -1 && nul > claim, true);
  /* Geen time-out: die stopt midden in een rit met beschermen zonder dat iets
     dat meldt, en dat is precies de stille vorm waar #18 over gaat.

     EN DEZE TOETS LAS ZICHZELF. Hij zocht eerst op `acquire()` en matchte
     daarmee op het COMMENTAARBLOK in PLMeetdienst.java, waar de zin "een
     acquire() met tijdslimiet stopt midden in een rit" staat. De mutatie die
     er `acquire(60000L)` van maakte bleef daardoor groen — plmutate.sh ving
     hem op 11-09-2026 als ONTSNAPT. Vandaar dat hier nu op de AANROEP gekeken
     wordt, met de ontvanger ervoor, én dat de tegenvorm expliciet afwezig moet
     zijn. Een toets die op zijn eigen uitleg kan slagen, toetst niets. */
  toets('zonder tijdslimiet',
    /wakeLock\.acquire\(\s*\)\s*;/.test(dienst) && !/wakeLock\.acquire\(\s*[^)\s]/.test(dienst), true);
}

console.log('\n── de dienst stopt als de app weg is ──');
{
  /* Swipet de gebruiker de app uit het overzicht, dan is er geen WebView meer
     en dus niets te meten. Zonder onTaskRemoved blijft de dienst staan — en
     START_STICKY zet hem zelfs terug — met een melding die doormeten belooft
     terwijl er niets meer is. Die melding is dan ook niet weg te krijgen
     zonder de app opnieuw te openen. */
  const blok = (dienst.match(/onTaskRemoved[\s\S]{0,400}?\n    \}/) || [''])[0];
  toets('de service vangt onTaskRemoved af', blok.length > 0, true);
  bevat('en stopt zichzelf', blok, 'stopSelf()');
}

console.log('\n── geen stille catch in de native code ──');
{
  /* Dezelfde regel als voor de rest van dit project, en hier weegt hij extra:
     een uitzondering in een foreground service is onzichtbaar — er is geen
     scherm om hem op te zetten. Zonder Log.* in het blok is de enige uitkomst
     dat de meting niet loopt en dat niemand weet waarom. */
  [['PLMeetdienst.java', dienst], ['PLMeetdienstPlugin.java', plugin]].forEach(function (paar) {
    const src = paar[1];
    const stil = [];
    const re = /catch\s*\(([^)]*)\)\s*\{([\s\S]*?)\n(\s*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      if (!/Log\.[eiwd]\s*\(/.test(m[2])) stil.push(m[1].trim());
    }
    toets(paar[0] + ': elk catch-blok logt', stil, []);
  });
}

console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
process.exit(fout ? 1 : 0);
