// ══════════════════════════════════════════════════════════════════
// bproef-groepsproef.js — groep 1 t/m 6 in de DRAAIENDE app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-groepsgrootte.js toetst de rekenkant los: het oordeel over een
// antwoord, het krimpvenster, het advies. Wat daar niet te zien is, is de
// keten eromheen: de groepsproef houdt de bus vast, gaat door sendCmd en
// PLBus.note(), laat de échte parser multiframe-antwoorden lezen, schrijft
// logregels en tekent het paneel. En de regelkring in de pollus hangt aan
// _pidLastOk en PLBus tegelijk.
//
// DE NEP-ECU. Vervangt _sendBTOnce(), net als plbrowser.nepAdapter, maar
// beantwoordt elk mode-01-groepsverzoek zoals een CAN-ECU dat doet: tot 7
// bytes in één frame, daarboven een ISO-TP-antwoord (lengte, 0:, 1:, …).
// Elk frame kost wat tijd, zodat een grotere groep per PID goedkoper is maar
// per verzoek duurder — de vorm die de groepsproef moet kunnen zien.
// In de stand KLOON valt in elk meerframe-antwoord de laatste PID weg: het
// foutbeeld van de ELM-kloon van 16-09 (#211). Dat is de tegenproef: met
// dezelfde proef moet het advies dan omslaan naar een kleine groep.
//
// WAT ER GEMETEN WORDT
//   1. de app start schoon op met de groepsproef erin
//   2. een schone ECU: de proef houdt de bus vast, meet twaalf stappen, geeft
//      groep 4–6 als advies, schrijft dertien logregels en zet zelf niets
//   3. TEGENPROEF — de kloon: hetzelfde, maar het advies wordt groep 2
//   4. de pollus met de kloon: de automaat krimpt van 3 naar 2 op de
//      onvolledige antwoorden; met de schone ECU blijft hij op 3
//
// Draaien:  node bproef-groepsproef.js      (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De nep-ECU, als tekst de pagina in. `kloon` en de PID-tabel staan op
// window, zodat de proef ze tussen de delen kan omzetten.
const NEP_ECU = `(function(){
  window._nepEcu = { kloon: false, log: [],
    // J1979-lengtes van de PIDs die deze nep-auto heeft; 0142 heeft hij niet.
    len: { '0C':2, '0D':1, '11':1, '04':1, '05':1, '0F':1, '0B':1, '10':2 } };
  const hx = (n) => ('0' + (n & 255).toString(16).toUpperCase()).slice(-2);
  window._sendBTOnce = async function(cmd){
    const E = window._nepEcu;
    const c = String(cmd || '').toUpperCase().replace(/\\s+/g, '');
    E.log.push(c);
    if (/^AT/.test(c)) return 'OK';
    if (!/^01(?:[0-9A-F]{2})+1?$/.test(c)) return 'NO DATA';
    let body = c.slice(2);
    if (body.length % 2 === 1) body = body.slice(0, -1);        // '010C1' → snelle terugkeer
    const pids = body.match(/../g).filter((p) => E.len[p]);
    if (!pids.length) { await new Promise((r) => setTimeout(r, 6)); return 'NO DATA'; }
    const delen = pids.map((p) => { const b = [p]; for (let i = 0; i < E.len[p]; i++) b.push(hx(0x20 + i + p.charCodeAt(1))); return b; });
    let bytes = ['41'].concat(...delen);
    if (E.kloon && bytes.length > 7) bytes = ['41'].concat(...delen.slice(0, -1));
    const frames = bytes.length <= 7 ? 1 : 1 + Math.ceil((bytes.length - 6) / 7);
    await new Promise((r) => setTimeout(r, 8 + 4 * frames));
    if (bytes.length <= 7) return bytes.join(' ');
    const regels = [('00' + bytes.length.toString(16).toUpperCase()).slice(-3), '0: ' + bytes.slice(0, 6).join(' ')];
    let rest = bytes.slice(6), k = 1;
    while (rest.length) {
      const f = rest.slice(0, 7); while (f.length < 7) f.push('00');
      regels.push(k.toString(16).toUpperCase() + ': ' + f.join(' '));
      rest = rest.slice(7); k++;
    }
    return regels.join('\\r');
  };
  // De bare bindingen van de app, niet window.* (#186).
  connected = true; demoMode = false;
  selectedNetwork = { id: '6', name: 'ISO 15765-4 CAN (11 bit ID, 500 kbaud)' };
  const lijst = ['010C','010D','0111','0104','0105','010F','010B','0110','0142'];
  activePIDs = new Set(lijst); supportedPIDs = new Set(lijst);
  return 'ok';
})()`;

// De proef draaien met korte stappen, en onderweg kijken wie de bus heeft.
const DRAAI = `(async function(){
  const regels = [];
  const echt = logToSheets;
  logToSheets = function(type, bericht, extra){ if (type === 'groepsproef') regels.push({ bericht: String(bericht), extra: extra || {} }); };
  try {
    const bezig = PLAdapter.groepsproef({ stapSec: 0.4 });
    await new Promise((r) => setTimeout(r, 900));
    const eigenaar = PLBus.owner();
    const uit = await bezig;
    return JSON.stringify({ eigenaar, uit, regels, busNa: PLBus.busy(), groep: PLBus.batchGroep(), vast: PLBus.batchVast() });
  } finally { logToSheets = echt; }
})()`;

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n── 1. de app start met de groepsproef ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLAdapter.groepsproef en groepAdvies staan er',
      await app.ev(`typeof PLAdapter.groepsproef === 'function' && typeof PLAdapter.groepAdvies === 'function'`) === true);
    toets('plGroepOordeel staat er (de regelkring in de pollus)', await app.ev(`typeof plGroepOordeel === 'function'`) === true);
    await app.ev(NEP_ECU);
    await app.ev(`PLBus.batchZet(3, false); 'ok'`);

    console.log('\n── 2. een schone ECU ──');
    const a = JSON.parse(await app.ev(DRAAI));
    toets('de proef liep door', !a.uit.afgebroken, a.uit.afgebroken);
    toets('hij hield de bus vast terwijl hij mat', a.eigenaar === 'groepsproef', 'eigenaar: ' + a.eigenaar);
    toets('en liet hem daarna los', a.busNa === false);
    toets('de ijkronde liet 0142 weg (die heeft deze auto niet)',
      a.uit.ijk && a.uit.ijk.bewezen.length === 8 && a.uit.ijk.bewezen.indexOf('0142') < 0, JSON.stringify(a.uit.ijk));
    toets('twaalf stappen: groep 1 t/m 6 en terug',
      a.uit.stappen.length === 12 && a.uit.stappen.map((x) => x.groep).join('') === '123456654321', a.uit.stappen.map((x) => x.groep).join(''));
    const g6 = a.uit.advies.groepen.filter((x) => x.groep === 6)[0] || {};
    toets('groep 6 over meerdere frames: niets verloren', g6.onvolPct === 0 && g6.leegPct === 0 && g6.echo === 0, JSON.stringify(g6));
    toets('het advies is een groep boven de 3', a.uit.advies.groep >= 4, a.uit.advies.kop + ' — ' + a.uit.advies.reden);
    toets('dertien logregels, allemaal RecordType groepsproef',
      a.regels.length === 13 && a.regels.every((r) => r.extra.RecordType === 'groepsproef'), a.regels.length + ' regels');
    toets('de laatste logregel draagt de versie en het advies',
      /groepsproef 1/.test(a.regels[12] && a.regels[12].bericht) && /advies groep/.test(a.regels[12].bericht), a.regels[12] && a.regels[12].bericht);
    toets('de proef zette zelf niets: groep 3, niet vastgezet', a.groep === 3 && a.vast === false, 'groep ' + a.groep + ', vast ' + a.vast);
    await app.ev(`PLAdapter.open(); 'ok'`);
    const tekst = await app.ev(`document.getElementById('plAdapterBody').textContent`);
    toets('het paneel toont de uitslag', tekst.indexOf(a.uit.advies.kop) >= 0 && /GROEPSPROEF/.test(tekst), a.uit.advies.kop);
    await app.ev(`PLAdapter.sluit(); 'ok'`);

    console.log('\n── 3. TEGENPROEF — de kloon laat de laatste PID vallen ──');
    await app.ev(`_nepEcu.kloon = true; 'ok'`);
    const b = JSON.parse(await app.ev(DRAAI));
    const k3 = b.uit.advies.groepen.filter((x) => x.groep === 3)[0] || {};
    toets('groep 3 verliest nu PIDs', k3.onvolPct > 2, JSON.stringify(k3));
    toets('en het advies slaat om naar groep 2', b.uit.advies.groep === 2, b.uit.advies.kop + ' — ' + b.uit.advies.reden);

    console.log('\n── 4. de regelkring in de pollus ──');
    // De automaat, groep 3, de kloon aan. De pollus zelf draaien en kijken of
    // hij op de onvolledige antwoorden één stap krimpt — met de reden erbij.
    const c = JSON.parse(await app.ev(`(async function(){
      PLLoad.handmatig(false, 'bproef'); PLBus.batchZet(3, false); PLLoad.wisActies();
      window._batchSupported = undefined;
      _nepEcu.kloon = true;
      startPoll();
      const t0 = Date.now();
      while (Date.now() - t0 < 25000 && PLBus.batchGroep() === 3) await new Promise((r) => setTimeout(r, 200));
      const groep = PLBus.batchGroep();
      const actie = PLLoad.acties().filter((x) => x.wat === 'groep').pop() || null;
      return JSON.stringify({ groep, actie, ms: Date.now() - t0 });
    })()`));
    toets('de kloon: de automaat krimpt van 3 naar 2', c.groep === 2, 'groep ' + c.groep + ' na ' + c.ms + ' ms');
    toets('en zegt waarom', c.actie && /misten een PID die eerder wél antwoordde/.test(c.actie.reden), JSON.stringify(c.actie));
    // Minstens zo lang als de kloon nodig had om te krimpen: anders bewijst
    // "bleef op 3" alleen dat er te kort gekeken is.
    const kijkMs = Math.max(8000, c.ms);
    const d = JSON.parse(await app.ev(`(async function(){
      PLBus.batchZet(3, false); PLLoad.wisActies(); _nepEcu.kloon = false;
      const t0 = Date.now();
      while (Date.now() - t0 < ` + kijkMs + `) await new Promise((r) => setTimeout(r, 200));
      return JSON.stringify({ groep: PLBus.batchGroep(), acties: PLLoad.acties().filter((x) => x.wat === 'groep') });
    })()`));
    toets('tegenproef: met de schone ECU blijft hij op 3', d.groep === 3 && d.acties.length === 0, JSON.stringify(d));
    toets('de app draait nog steeds zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-groepsproef: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-groepsproef: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-groepsproef brak af: ' + e.message); process.exit(1); });
