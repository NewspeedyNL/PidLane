// test-opslagroute.js — kiest download() de route die de verbinding spaart? (#132)
//
// Zeven van de zeven afwezigheden in de logboeken van 11-09 lieten zien dat de
// SPP-socket binnen 2 tot 7 seconden na het wegschakelen omvalt. De deelkaart
// van Android is zo'n wegschakeling. Daarom gaat het bestand rechtstreeks naar
// een map en komt er geen venster tussen — sinds 27-09-2026 ook zonder
// verbinding, zodat de txt-knoppen doen wat de PDF-exports al deden.
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
const fuel = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
const pv = fuel.indexOf('async function pdfBewaar(){');
if (pv < 0) { console.log('FOUT: pdfBewaar() is niet meer te vinden in pidlane-fuel.js — anker versleten'); process.exit(1); }
const pdfStuk = fuel.slice(pv, fuel.indexOf('\n}\n', pv) + 3);

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
    document: { createElement: () => ({ click() { gedaan.webLink = true; }, remove() {}, set href(v) {}, set download(v) {} }),
                body: { appendChild() {} } },
    setTimeout: () => 0,
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
  // pdfBewaar() uit pidlane-fuel.js: wat er na een PDF-export gebeurt.
  vm.runInContext(pdfStuk, ctx, { filename: 'pdfBewaar' });
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
  toets('met de reden: de verbinding blijft staan', gedaan.log.some(l => /#132/.test(l)), true);
}

console.log('\n— zonder verbinding óók rechtstreeks, net als de PDF-exports —');
{
  const { ctx, gedaan } = maak({ connected: false, native: true });
  await ctx.download('foutcodes.txt', 'inhoud');
  toets('rechtstreeks weggeschreven', gedaan.direct, 'PidLane/foutcodes.txt');
  toets('en de deelkaart is NIET geopend', gedaan.gedeeld, null);
  toets('de logregel beweert niets over een verbinding die er niet is',
        gedaan.log.some(l => /#132/.test(l)), false);
}

console.log('\n— demo telt niet als verbinding: er is geen socket om te sparen —');
{
  const { ctx, gedaan } = maak({ connected: true, demo: true, native: true });
  await ctx.download('rit.txt', 'x');
  toets('rechtstreeks weggeschreven', gedaan.direct, 'PidLane/rit.txt');
  toets('zonder de verbindingsuitleg in het logboek', gedaan.log.some(l => /#132/.test(l)), false);
}

console.log('\n— mislukt het rechtstreeks schrijven, dan gaat het bestand niet verloren —');
{
  const { ctx, gedaan } = maak({ connected: true, native: true, directFaalt: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('terugval naar de deelkaart', gedaan.gedeeld, 'rit.txt');
  toets('en de reden staat in het logboek, met de bestandsnaam (#326)',
        gedaan.log.some(l => /Rechtstreeks opslaan van rit\.txt .*mislukt \(geen toestemming\)/.test(l)), true);
  toets('en de klant hoort waarom, vóór het deelvenster opengaat (#326)',
        gedaan.toast.some(t => /Opslaan in Documenten lukte niet \(geen toestemming\)/.test(t)), true);
}

console.log('\n— in de browser (geen Capacitor) blijft het een gewone download —');
{
  const { ctx, gedaan } = maak({ connected: true, native: false, geenPlugins: true });
  await ctx.download('rit.txt', 'inhoud');
  toets('gewone downloadlink gebruikt', gedaan.webLink, true);
  toets('geen deelkaart', gedaan.gedeeld, null);
}

console.log('\n— een PDF-export slaat ook rechtstreeks op, zonder keuzevenster (27-09-2026) —');
{
  const { ctx, gedaan } = maak({ connected: false, native: true });
  ctx._lastPdf = { blob: new ctx.Blob(['%PDF']), fname: 'PidLane_Mazda_2026-09-27.pdf' };
  const ok = await ctx.pdfBewaar();
  toets('de PDF staat rechtstreeks in de map', gedaan.direct, 'PidLane/PidLane_Mazda_2026-09-27.pdf');
  toets('zonder deelkaart', gedaan.gedeeld, null);
  toets('en meldt dat het gelukt is', ok, true);
  const leeg = maak({ connected: false, native: true });
  toets('zonder PDF gebeurt er niets', await leeg.ctx.pdfBewaar(), false);
}

console.log('\n— blok 5: kwam alles in Documenten? (#326) —');
{
  const { ctx } = maak({ connected: false, native: true });
  const O = ctx.plOpslagOordeel;
  toets('niets opgeslagen: LET OP', O({ gelukt: 0, mislukt: [] }).staat, 'LET OP');
  toets('twee keer gelukt: ok', O({ gelukt: 2, mislukt: [] }).staat, 'ok');
  const f = O({ gelukt: 1, mislukt: [{ naam: 'x.txt', reden: 'EACCES' }] });
  toets('een keer mislukt: FOUT met naam en reden', f.staat + ' ' + /x\.txt \(EACCES\)/.test(f.detail), 'FOUT true');
  await ctx.plBewaarBestand(new ctx.Blob(['a']), 'a.txt');
  toets('een geslaagde opslag telt mee', ctx._plOpslag.gelukt, 1);
  const g = maak({ connected: false, native: true, directFaalt: true });
  await g.ctx.plBewaarBestand(new g.ctx.Blob(['a']), 'b.txt');
  toets('een mislukte ook, met de reden', JSON.stringify(g.ctx._plOpslag.mislukt), JSON.stringify([{ naam: 'b.txt', reden: 'geen toestemming' }]));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
})();
