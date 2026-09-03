// ══════════════════════════════════════════════════════════════════
// bproef-vinlek.js — de ruwe VIN komt niet in de logbuffer (#102)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// PIDLANE.md §7 kende twee uitgaande paden voor de VIN en allebei waren
// dicht. Op 02-09-2026 bleek er een derde: de app-logbuffer. Twee aanroepen
// schreven de volledige VIN daar rechtstreeks in, en het testrunverslag
// exporteert die buffer integraal — een bestand dat bedoeld is om gedeeld
// te worden, waarbij de gebruiker zelf de bestemming kiest.
//
// De les uit §11 is dat "uitgaand pad" twee keer verkeerd is afgebakend:
// eerst als de verzendfunctie, daarna als de route naar Airtable. De
// buffer zelf was steeds de plek waar het misging. Deze proef toetst
// daarom niet één aanroep maar DE BUFFER: staat er, na de echte
// codepaden, ergens een ruwe VIN in?
//
// WAAROM DIT EEN BROWSERPROEF IS
// Er is geen node-test die dit kan. plLokaalLog() bestaat alleen in een
// draaiende app, saveVinProfile() schrijft in localStorage, en tryReadVIN()
// praat met de adapter. De vraag gaat bovendien over wat DRIE modules bij
// elkaar in één buffer achterlaten — precies het soort koppeling dat
// onzichtbaar is als je een functie met vm uit zijn verband knipt.
//
// Draaien:  node bproef-vinlek.js      (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

// Verzonnen VIN, bewust niet die van een echte auto uit een verslag.
// Zelfde waarde als in test-vin-anoniem.js, zodat de twee toetsen over
// hetzelfde geval praten.
const VIN = 'WVWZZZ3CZHE000000';
// De ELM-respons op 0902 die precies deze VIN oplevert: 4902 (moderespons),
// 01 (telbyte), daarna 17 bytes ASCII.
const VIN_HEX = '5756575A5A5A33435A4845303030303030';
const ANTWOORD_0902 = '490201' + VIN_HEX;

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    // ── 1. DE MASKEERFUNCTIE ZELF ────────────────────────────────
    toets('_plVinVoorLog() bestaat in de draaiende app',
          await app.ev(`typeof _plVinVoorLog === 'function'`));
    const gemaskeerd = await app.ev(`_plVinVoorLog(${JSON.stringify(VIN)})`);
    toets('en levert nooit de ruwe VIN op',
          typeof gemaskeerd === 'string' && gemaskeerd.indexOf(VIN) < 0, 'kreeg ' + gemaskeerd);
    toets('wél de fabrikantcode plus een staartje',
          /^WVW:[0-9a-f]{16}$/.test(String(gemaskeerd)), 'kreeg ' + gemaskeerd);

    // ── 2. DE ECHTE VIN-LEESROUTE ────────────────────────────────
    // Nep-ECU: AT-commando's krijgen OK, 0902 krijgt een echte multiframe-
    // respons. Alles erboven — sendCmd, extractVIN, de logregel — is de
    // code van de app.
    await app.ev(`(function(){
      window._sendBTOnce = async function(cmd){
        const c = String(cmd||'').toUpperCase().trim();
        if (c.indexOf('AT') === 0 || c.indexOf('ST') === 0) return 'OK';
        if (c.indexOf('0902') === 0) return ${JSON.stringify(ANTWOORD_0902)};
        return 'NO DATA';
      };
      window.connected = true; window.demoMode = false;
      return true;
    })()`);

    // tryReadVIN() geeft een voertuigobject terug, niet een kale string — de
    // VIN zit in .vin, met de WMI en een merk/bouwjaar dat uit de VIN zelf is
    // afgeleid. Dat is precies waarom deze proef in de app draait en niet op
    // een aanname: de vorm van dit antwoord stond nergens opgeschreven.
    const gelezen = await app.ev(`(async()=>{ try { return await tryReadVIN(); } catch(e){ return {fout: e.message}; } })()`);
    toets('tryReadVIN() leest de VIN uit de nep-ECU',
          gelezen && gelezen.vin === VIN, 'kreeg ' + JSON.stringify(gelezen));
    toets('en geeft de fabrikantcode los mee', gelezen && gelezen.wmi === 'WVW',
          'kreeg ' + (gelezen && gelezen.wmi));

    // ── 3. DE PROFIELROUTE ───────────────────────────────────────
    const bewaard = await app.ev(`(async()=>{ try { await saveVinProfile(${JSON.stringify(VIN)}); return 'klaar'; }
                                              catch(e){ return 'FOUT: '+e.message; } })()`);
    toets('saveVinProfile() draait door zonder fout', bewaard === 'klaar', String(bewaard));

    // ── 4. DE BUFFER — DIT IS DE EIGENLIJKE VRAAG ────────────────
    const scan = async () => JSON.parse(await app.ev(`(function(){
      const r = (typeof plLokaalLog === 'function') ? plLokaalLog() : [];
      const tekst = r.map(x => String((x && x.msg) || '')).join('\\n');
      return JSON.stringify({
        regels: r.length,
        ruw: tekst.indexOf(${JSON.stringify(VIN)}) >= 0,
        kort: tekst.indexOf('…' + ${JSON.stringify(VIN)}.slice(-6)) >= 0,
        pseudo: /WVW:[0-9a-f]{16}/.test(tekst)
      });
    })()`));

    const na = await scan();
    toets('de app-logbuffer is gevuld', na.regels > 0, na.regels + ' regels');
    toets('de RUWE VIN staat er nergens in (#102)', na.ruw === false,
          'de volledige VIN staat in de buffer die het verslag exporteert');
    toets('de laatste zes tekens staan er wél — je herkent je eigen auto', na.kort);
    toets('en het pseudoniem ook — te koppelen aan de Airtable-logkolom', na.pseudo);

    // ── 5. TEGENPROEF ────────────────────────────────────────────
    // Zonder dit bewijst stap 4 alleen dat de scan niets vond, niet dat hij
    // iets zou kúnnen vinden. Eén ruwe VIN erin schrijven via de echte log()
    // en kijken of de scan hem ziet.
    await app.ev(`log('proefregel — ruwe VIN ' + ${JSON.stringify(VIN)}, 'info')`);
    const vuil = await scan();
    toets('de scan ziet een ruwe VIN wél als hij er staat', vuil.ruw === true,
          'de scan uit stap 4 meet niets — hij zou een lek niet opmerken');
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-vinlek: alles goed' : '\nbproef-vinlek: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
