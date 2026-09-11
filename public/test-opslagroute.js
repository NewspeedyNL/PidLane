// test-opslagroute.js — kiest download() de route die de verbinding spaart? (#132)
//
// Zeven van de zeven afwezigheden in de logboeken van 11-09 lieten zien dat de
// SPP-socket binnen 2 tot 7 seconden na het wegschakelen omvalt. De deelkaart
// van Android is zo'n wegschakeling. Daarom: staat er een verbinding, dan gaat
// het bestand rechtstreeks naar een map en komt er geen venster tussen.
//
// Wat hier getoetst wordt is de KEUZE, niet het schrijven zelf — dat laatste
// is Capacitor en heeft een toestel nodig. De keuze is precies het deel waar
// een fout stil is: een verkeerde tak kost een herverbinding (of erger, een
// bestand dat nergens landt) zonder dat er iets misgaat op het scherm.
//
// Draaien vanuit public/:  node test-opslagroute.js
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}

// ── Het harnas ─────────────────────────────────────────────────────
// pidlane-motortype.js is groot en hangt van veel af; we knippen de drie
// functies eruit met een anker dat de test laat stoppen als ze verdwijnen.
const bron = fs.readFileSync(__dirname + '/pidlane-motortype.js', 'utf8');
const van = bron.indexOf('const PL_OPSLAGMAP');
const tot = bron.indexOf('function delay(ms)');
if (van < 0 || tot < 0 || tot <= van) {
  console.log('FOUT: de opslagroute is niet meer te vinden in pidlane-motortype.js — anker versleten');
  process.exit(1);
}
const stuk = bron.slice(van, tot);

function maak(opties) {
  const gedaan = { direct: null, gedeeld: null, webLink: null, toast: [], log: [] };
  const ctx = {
    console,
    log: (m, s) => gedaan.log.push(String(s || '') + '|' + String(m)),
    showToast: (m) => gedaan.toast.push(String(m)),
    showNeedsUpdate: () => { gedaan.web = 'needsUpdate'; },
    connected: opties.connected,
    demoMode: !!opties.demo,
    Blob: function (d) { this.d = d; },
    FileReader: function () {
      this.readAsDataURL = () => { this.result = 'data:text/plain;base64,QUJD'; setImmediate(() => this.onload()); };
    },
    URL: { createObjectURL: () => 'blob:proef' },
    document: { createElement: () => ({ click() { gedaan.webLink = true; }, set href(v) {}, set download(v) {} }) },
    Capacitor: {
      isNativePlatform: () => !!opties.native,
      Plugins: {
        Filesystem: {
          writeFile: async (a) => {
            if (a.directory === 'DOCUMENTS') {
              if (opties.directFaalt) throw new Error('geen toestemming');
              gedaan.direct = a.path; return { uri: 'file:///' + a.path };
            }
            gedaan.cache = a.path; return { uri: 'file:///cache/' + a.path };
          }
        },
        Share: { share: async (a) => { gedaan.gedeeld = a.title; } }
      }
    }
  };
  if (opties.geenPlugins) ctx.Capacitor.Plugins = {};
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(stuk, ctx, { filename: 'opslagroute' });
  return { ctx, gedaan };
}

(async () => {

console.log('\n— met een verbinding gaat het bestand rechtstreeks naar de map —');
{
  const { ctx, gedaan } = maak({ connected: true, native: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('rechtstreeks weggeschreven', gedaan.direct, 'PidLane/rit.txt');
  toets('en de deelkaart is NIET geopend', gedaan.gedeeld, null);
  toets('de gebruiker ziet waar het staat', gedaan.toast.some(t => /PidLane\/rit\.txt/.test(t)), true);
  toets('en het staat in het logboek', gedaan.log.some(l => l.indexOf('ok|') === 0), true);
}

console.log('\n— zonder verbinding blijft de deelkaart wat hij was —');
{
  const { ctx, gedaan } = maak({ connected: false, native: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('de deelkaart is geopend', gedaan.gedeeld, 'rit.txt');
  toets('en er is niets rechtstreeks weggeschreven', gedaan.direct, null);
}

console.log('\n— demo telt niet als verbinding: er is geen socket om te verliezen —');
{
  const { ctx, gedaan } = maak({ connected: true, demo: true, native: true });
  toets('de deelkaart is geopend', (await ctx.download('rit.txt', 'x'), gedaan.gedeeld), 'rit.txt');
}

console.log('\n— mislukt het rechtstreeks schrijven, dan gaat het bestand niet verloren —');
{
  const { ctx, gedaan } = maak({ connected: true, native: true, directFaalt: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('terugval naar de deelkaart', gedaan.gedeeld, 'rit.txt');
  toets('en de reden staat in het logboek',
        gedaan.log.some(l => /Rechtstreeks opslaan mislukt/.test(l)), true);
}

console.log('\n— in de browser (geen Capacitor) blijft het een gewone download —');
{
  const { ctx, gedaan } = maak({ connected: true, native: false, geenPlugins: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('gewone downloadlink gebruikt', gedaan.webLink, true);
  toets('geen deelkaart', gedaan.gedeeld, null);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
})();
