// ══════════════════════════════════════════════════════════════════
// test-schil.js — weet de app welke APK hij is? (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT. Op 11-09-2026 stond twee keer op één dag de
// vraag of een meting op de nieuwe schil of op de oude draaide — bij de
// meetdienst en bij de wake lock. Beide keren was dat uit het testrunverslag
// niet te halen: daar staan `TESTRUN_VERSIE` en `APP_VERSION` in, en die twee
// komen uit de webpagina en zijn dus op élke APK gelijk.
//
// Een native wijziging zit alleen in de schil. Draait de nieuwe pagina op een
// oude APK, dan meet je oude code terwijl het verslag er nieuw uitziet — een
// hele rit voor niets, en niets dat erover klaagt.
//
// Deze test bewaakt daarom vooral het ONDERSCHEID tussen de drie antwoorden:
//
//   een getal   de schil heeft een versionCode en die staat in het verslag
//   null        er is geen schil (browser/PWA), of hij gaf niets terug
//   achterstand alleen te berekenen als BEIDE getallen er zijn
//
// Die derde is de gevaarlijkste: een achterstand van 0 omdat er niets te
// vergelijken viel, leest als "je bent bij". Dat is dezelfde fout die #18
// anderhalve week een verkeerd getal liet rapporteren.
//
// Draaien vanuit public/:  node test-schil.js          (exit 0 = goed)
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
/* STRIKT NULL, EN DAAR IS EEN REDEN VOOR. toets() vergelijkt met
   JSON.stringify, en `JSON.stringify(NaN)` is de tekst "null". Een achterstand
   die per ongeluk NaN wordt — bijvoorbeeld doordat de poort op twee geldige
   getallen wegvalt — glipt daar dus doorheen als "null".

   plmutate.sh ving dat op 11-09-2026: de mutatie die `if (hier === null ||
   !isFinite(daar)) return null;` uitzet bleef groen. Precies de vorm die dit
   project overal weert — een controle die niets ziet. Vandaar deze helper voor
   elk getal dat ONBEKEND hoort te zijn. */
function strikt(naam, waarde, verwacht) {
  n++;
  if (Object.is(waarde, verwacht)) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + String(waarde) + ' (' + typeof waarde + ')' +
      '\n        verwacht ' + String(verwacht));
  }
}
function bevat(naam, tekst, stuk) {
  n++;
  if (String(tekst).indexOf(stuk) !== -1) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + '\n        "' + stuk + '" staat niet in: ' + tekst); }
}

// ── de sandbox ────────────────────────────────────────────────────
// Alleen de bridge en plFetch zijn nagemaakt. De module is echt.
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.Promise = Promise;
  s.gevraagd = [];
  if (o.capacitor !== false) {
    s.Capacitor = {
      isNativePlatform: function () { return true; },
      Plugins: {
        App: {
          getInfo: function () {
            s.gevraagd.push('getInfo');
            if (o.infoStuk) return Promise.reject(new Error('bridge weg'));
            if (o.geenInfo) return Promise.resolve(null);
            return Promise.resolve(o.info || { name: 'PidLane', id: 'app.pidlane.obd', build: '438', version: '3.0.0' });
          }
        }
      }
    };
  }
  if (o.plFetch !== false) {
    s.plFetch = function (pad, opt) {
      s.gevraagd.push('plFetch ' + pad + (opt && opt.geenToken ? ' (geenToken)' : ''));
      if (o.fetchStuk) return Promise.reject(new Error('geen netwerk'));
      if (o.status && o.status !== 200) return Promise.resolve({ ok: false, status: o.status });
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(o.rmt || { versionName: '3.0.0', versionCode: 438, builtAt: '2026-09-11T09:53:12Z' }); } });
    };
  }
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-schil.js', 'utf8'), s, { filename: 'pidlane-schil.js' });
  if (!s.PLSchil) { console.error('FOUT: PLSchil niet geladen'); process.exit(1); }
  return s;
}
// De module leest de schil bij het laden; dat is een belofte.
const rust = () => new Promise(function (r) { setTimeout(r, 0); });

async function main() {

  console.log('\n── in een browser is er geen schil, en dat staat er ──');
  {
    const s = bouw({ capacitor: false });
    await rust();
    strikt('bouw() is null', s.PLSchil.bouw(), null);
    toets('en er is niets aan de bridge gevraagd', s.gevraagd.length, 0);
    bevat('de regel zegt het zonder omhaal', s.PLSchil.regel(), 'geen APK');
    // NIET-GEMETEN IS GEEN NUL. Een achterstand van 0 zou hier lezen als "je
    // bent bij", terwijl er niets te vergelijken viel.
    strikt('achterstand blijft null (en geen NaN)', s.PLSchil.achterstand(), null);
  }

  console.log('\n── in de schil staat de build in het verslag ──');
  {
    const s = bouw();
    await rust();
    toets('de bridge is één keer gelezen', s.gevraagd, ['getInfo']);
    toets('bouw() geeft een GETAL, niet de tekst van Capacitor', s.PLSchil.bouw(), 438);
    toets('en dat is echt een number', typeof s.PLSchil.bouw(), 'number');
    toets('de regel voor de kop', s.PLSchil.regel(), 'build 438 (3.0.0)');
  }

  console.log('\n── een schil die niets teruggeeft liegt niet ──');
  {
    const s = bouw({ infoStuk: true });
    await rust();
    strikt('bouw() blijft null', s.PLSchil.bouw(), null);
    bevat('met de fout erbij', s.PLSchil.reden(), 'bridge weg');
    bevat('en de regel zegt onbekend', s.PLSchil.regel(), 'onbekend');
  }
  {
    const s = bouw({ geenInfo: true });
    await rust();
    strikt('getInfo() zonder antwoord → null', s.PLSchil.bouw(), null);
    bevat('met een reden', s.PLSchil.reden(), 'gaf niets terug');
  }
  {
    // Een schil die wél antwoordt maar geen bruikbare build meegeeft.
    const s = bouw({ info: { name: 'PidLane', version: '3.0.0' } });
    await rust();
    strikt('zonder build blijft bouw() null, geen NaN', s.PLSchil.bouw(), null);
  }

  console.log('\n── de nieuwste build komt van de Worker ──');
  {
    const s = bouw();
    await rust();
    const j = await s.PLSchil.haalNieuwste();
    toets('er is één keer gevraagd, zonder sessietoken',
      s.gevraagd.filter(function (x) { return /plFetch/.test(x); }), ['plFetch /version.json (geenToken)']);
    toets('en het antwoord komt binnen', j.versionCode, 438);
    // Tweede aanroep gebruikt het bewaarde antwoord: blok 5 mag het vaker
    // vragen zonder er een netwerkaanroep per keer aan te hangen.
    await s.PLSchil.haalNieuwste();
    toets('een tweede vraag doet geen tweede aanroep',
      s.gevraagd.filter(function (x) { return /plFetch/.test(x); }).length, 1);
  }

  console.log('\n── en als de Worker niet antwoordt, is er geen getal ──');
  {
    const s = bouw({ fetchStuk: true });
    await rust();
    toets('haalNieuwste() geeft null', await s.PLSchil.haalNieuwste(), null);
    bevat('met de reden erbij', s.PLSchil.nieuwsteReden(), 'niet bereikbaar');
    strikt('en de achterstand blijft null (en geen NaN)', s.PLSchil.achterstand(), null);
  }
  {
    const s = bouw({ status: 404 });
    await rust();
    toets('een 404 levert ook null', await s.PLSchil.haalNieuwste(), null);
    bevat('met de status erbij', s.PLSchil.nieuwsteReden(), '404');
  }

  console.log('\n── de achterstand, en alleen als er twee getallen zijn ──');
  {
    const s = bouw();
    await rust();
    s.PLSchil._zetNieuwste({ versionCode: 438 });
    toets('gelijk → 0', s.PLSchil.achterstand(), 0);
    s.PLSchil._zetNieuwste({ versionCode: 441 });
    toets('drie builds achter → 3', s.PLSchil.achterstand(), 3);
    // Vooruit lopen kan: een zelf gebouwde schil. Dat is geen fout, maar het
    // hoort wel zichtbaar te zijn — wat je dan meet heeft niemand anders.
    s.PLSchil._zetNieuwste({ versionCode: 430 });
    toets('vooruit → negatief', s.PLSchil.achterstand(), -8);
    s.PLSchil._zetNieuwste({ versionCode: 'onzin' });
    strikt('onleesbaar getal → null, geen 0 en geen NaN', s.PLSchil.achterstand(), null);
    s.PLSchil._zetNieuwste(null);
    strikt('niets opgehaald → null, geen NaN', s.PLSchil.achterstand(), null);
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}

main().catch(function (e) { console.error('FOUT: de test zelf klapte —', e); process.exit(1); });
