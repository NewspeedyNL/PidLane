// ══════════════════════════════════════════════════════════════════
// bproef-antwoordtal.js — het antwoordcijfer in de DRAAIENDE pollus (#302)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-antwoordtal.js toetst het leren los. Wat daar niet te zien is: of de
// pollus het cijfer ook echt de bus op stuurt, of de rest van de keten
// (sendCmd, trackBtQuality, splitBatchResponse, updPID) het antwoord nog
// goed leest met een cijfer achter het verzoek, en of de responstijd
// daardoor werkelijk laag blijft.
//
// DE NEP-ELM. Vervangt _sendBTOnce(). Beantwoordt mode-01-groepsverzoeken
// zoals een CAN-ECU, en gedraagt zich zoals de datasheet ATAT1 beschrijft:
// na het laatste frame wacht hij zijn GELEERDE wachttijd uit, en die volgt de
// traagste antwoorder die hij zag. Eén keer antwoordt er een trage module
// mee; daarna betaalt elk verzoek zonder cijfer daarvoor. Met cijfer stopt
// hij na het laatste frame. Een te laag cijfer kapt hij af, zoals een echte.
//
// WAT ER GEMETEN WORDT
//   1. de app start schoon op met PLAntwoordtal
//   2. de pollus op de nep-ELM: groepsverzoeken krijgen een cijfer, de
//      waarden kloppen, en na de trage module blijft de responstijd laag
//   3. TEGENPROEF — hetzelfde zonder PLAntwoordtal (cmd geeft altijd de
//      basis terug): de responstijd loopt op tot de geleerde wachttijd
//
// Draaien:  node bproef-antwoordtal.js      (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const NEP_ELM = `(function(){
  window._nepElm = { log: [], wacht: 15, traagNog: 0, verzoekMs: [],
    len: { '0C':2, '0D':1, '11':1, '04':1, '05':1, '0F':1 } };
  const hx = (n) => ('0' + (n & 255).toString(16).toUpperCase()).slice(-2);
  const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
  window._sendBTOnce = async function(cmd){
    const E = window._nepElm;
    const c = String(cmd || '').toUpperCase().replace(/\\s+/g, '');
    E.log.push(c);
    if (/^AT/.test(c)) return 'OK';
    if (!/^01(?:[0-9A-F]{2})+[0-9A-F]?$/.test(c)) return 'NO DATA';
    let body = c.slice(2), cijfer = 0;
    if (body.length % 2 === 1) { cijfer = parseInt(body.slice(-1), 16); body = body.slice(0, -1); }
    const pids = body.match(/../g).filter((p) => E.len[p]);
    const t0 = Date.now();
    if (!pids.length) { await slaap(E.wacht); return 'NO DATA'; }
    // Vaste waarden, zodat de proef kan nakijken wat er in pidVals landt:
    // 0C = 1AF8 (1726 rpm), 0D = 32 (50 km/h), de rest 0x40.
    const bytes = ['41'];
    pids.forEach((p) => { bytes.push(p); if (p === '0C') bytes.push('1A', 'F8'); else if (p === '0D') bytes.push('32'); else for (let i = 0; i < E.len[p]; i++) bytes.push('40'); });
    let regels;
    if (bytes.length <= 7) regels = [bytes.join('')];
    else {
      regels = [('00' + bytes.length.toString(16).toUpperCase()).slice(-3) + ' 0:' + bytes.slice(0, 6).join('')];
      let rest = bytes.slice(6), k = 1;
      while (rest.length) { const f = rest.slice(0, 7); while (f.length < 7) f.push('00'); regels.push(k.toString(16).toUpperCase() + ':' + f.join('')); rest = rest.slice(7); k++; }
    }
    await slaap(5 + 2 * regels.length);
    // De trage module: antwoordt één keer mee op 010D, na 150 ms. ATAT1 leert
    // daarvan: de wachttijd gaat naar 150 ms en blijft daar.
    if (E.traagNog > 0 && pids.indexOf('0D') >= 0) {
      E.traagNog--; await slaap(150); E.wacht = Math.max(E.wacht, 150);
      regels.push('410D32');
    }
    if (cijfer && cijfer < regels.length) regels = regels.slice(0, cijfer);   // te laag: afgekapt
    if (!cijfer || cijfer > regels.length) await slaap(E.wacht);              // de laatste wachttijd
    E.verzoekMs.push({ ms: Date.now() - t0, met: !!cijfer });
    return regels.join('\\r');
  };
  connected = true; demoMode = false;
  selectedNetwork = { id: '6', name: 'ISO 15765-4 CAN (11 bit ID, 500 kbaud)' };
  const lijst = ['010C','010D','0111','0104','0105','010F'];
  activePIDs = new Set(lijst); supportedPIDs = new Set(lijst);
  return 'ok';
})()`;

// De pollus een tijd laten lopen; de trage module na twee seconden.
function RIT(ms) {
  return `(async function(){
    PLLoad.handmatig(false, 'bproef'); PLBus.batchZet(3, false);
    window._batchSupported = undefined;
    PLAntwoordtal.reset(); _nepElm.log = []; _nepElm.verzoekMs = []; _nepElm.wacht = 15;
    pidVals = {};
    startPoll();
    await new Promise((r) => setTimeout(r, 2000));
    _nepElm.traagNog = 1;
    await new Promise((r) => setTimeout(r, ${ms}));
    clearInterval(pollTimer);
    await new Promise((r) => setTimeout(r, 400));
    const batches = _nepElm.log.filter((c) => /^01(?:[0-9A-F]{2}){2,}[0-9A-F]?$/.test(c));
    const staart = _nepElm.verzoekMs.slice(-20).map((x) => x.ms).sort((a, b) => a - b);
    return JSON.stringify({
      batches: batches.length,
      metCijfer: batches.filter((c) => c.length % 2 === 1).length,
      voorbeeld: batches.slice(-3),
      stand: PLAntwoordtal.stand(),
      medStaart: staart.length ? staart[staart.length >> 1] : null,
      wacht: _nepElm.wacht,
      rpm: pidVals['010C'], kmh: pidVals['010D']
    });
  })()`;
}

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
    console.log('\n── 1. de app start met PLAntwoordtal ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLAntwoordtal en plFrames staan er',
      await app.ev(`typeof PLAntwoordtal === 'object' && typeof PLAntwoordtal.cmd === 'function' && typeof plFrames === 'function'`) === true);
    await app.ev(NEP_ELM);

    console.log('\n── 2. de pollus met het antwoordcijfer ──');
    const a = JSON.parse(await app.ev(RIT(5000)));
    toets('de pollus stuurde groepsverzoeken', a.batches > 20, a.batches + ' batches');
    toets('het merendeel ging met antwoordcijfer', a.metCijfer > a.batches / 2, a.metCijfer + ' van ' + a.batches + ' · ' + a.voorbeeld.join(' '));
    toets('de trage module liet de nep-ELM zijn wachttijd leren (150 ms)', a.wacht === 150, 'wacht ' + a.wacht);
    toets('en toch bleef de responstijd laag (mediaan van de laatste 20 onder 60 ms)', a.medStaart !== null && a.medStaart < 60, a.medStaart + ' ms');
    toets('de waarden kloppen: 1726 rpm en 50 km/h', Math.round(a.rpm) === 1726 && Math.round(a.kmh) === 50, 'rpm ' + a.rpm + ', km/h ' + a.kmh);
    toets('geen blokkade: het cijfer kapte niets af', a.stand.blokkades === 0, JSON.stringify(a.stand));
    toets('stand() meet het verschil zelf: met cijfer sneller dan zonder',
      a.stand.msMet !== null && a.stand.msZonder !== null && a.stand.msMet < a.stand.msZonder, JSON.stringify(a.stand));

    console.log('\n── 3. TEGENPROEF — zonder antwoordcijfer ──');
    const b = JSON.parse(await app.ev(`(async function(){
      const echt = PLAntwoordtal.cmd;
      PLAntwoordtal.cmd = function (basis) { return basis; };
      try { return await ${RIT(5000)}; } finally { PLAntwoordtal.cmd = echt; }
    })()`));
    toets('geen enkel groepsverzoek met cijfer', b.metCijfer === 0, b.metCijfer + ' met cijfer');
    toets('en de responstijd loopt op tot de geleerde wachttijd (boven 150 ms)', b.medStaart >= 150, b.medStaart + ' ms');
    toets('de app draait nog steeds zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-antwoordtal: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-antwoordtal: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-antwoordtal brak af: ' + e.message); process.exit(1); });
