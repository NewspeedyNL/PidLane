// ══════════════════════════════════════════════════════════════════
// test-elmpoort.js — de harde ELM-poort in pidlane-bt.js
// ──────────────────────────────────────────────────────────────────
// Laadt de ÉCHTE bron in een sandbox (geen kopie van de logica, anders
// test je je eigen aannames) en controleert de vier eigenschappen waar
// het om draait:
//   1. dicht = alles geweigerd, transport wordt niet aangeraakt
//   2. de init-reeks komt er wél door
//   3. het doorlaatbewijs is eenmalig — ook tijdens een await van de init
//   4. een weigering is geen lege respons (_emptyStreak blijft staan)
//   5. de poort gaat vanzelf open na de vervaltijd
//
// Draaien:  node test-elmpoort.js     (exit 0 = alles goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const BRON = path.join(__dirname, 'pidlane-bt.js');

// ── sandbox ──
// Alleen wat pidlane-bt.js tijdens deze paden aanraakt. Bewust minimaal:
// hoe minder stub, hoe minder kans dat de test iets test dat er niet is.
function bouwSandbox(){
  const gelogd = [];
  const win = {};
  const scope = {
    window: win,
    document: { getElementById: () => null, querySelector: () => null },
    navigator: { userAgent: 'test', bluetooth: undefined },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    btDiag: (m, l) => gelogd.push(String(l || 'info') + ': ' + m),
    log: (m, l) => gelogd.push('log/' + String(l || 'info') + ': ' + m),
    delay: (ms) => new Promise(r => setTimeout(r, Math.min(ms || 0, 1))),
    demoMode: false,
    connected: true,
    PLBus: {
      note(){}, claim(){ return 1; }, release(){ return true; },
      breek(){}, batchReset(){}, resetStats(){}, batchGroep(){ return 3; }
    },
    withBus: async (naam, fn) => await fn(),
    setConn(){}, logToSheets(){}, logUsage(){}, updateApiPill(){},
    showConnError(){}, startDemo(){}, resetToStep1(){},
    purgeImplausiblePids(){}, vehicleCylinderCount(){ return 4; },
    pollTimer: null, clearInterval(){}, setInterval(){ return 0; },
    setTimeout, clearTimeout, Promise, Date, Math, JSON, String, Number,
    Object, Array, Error, RegExp, TextEncoder, DataView, parseInt, parseFloat,
    isNaN, console
  };

  const namen = Object.keys(scope);
  const bron = fs.readFileSync(BRON, 'utf8');
  // Epiloog: alleen wat de test nodig heeft naar buiten tillen. _webSerialSend
  // is een functiedeclaratie en dus herbindbaar — daarmee hangen we een
  // nep-transport onderaan zonder de bron te wijzigen.
  const epiloog = `
    ;return {
      sendCmd, sendBT, _elmSend, _elmPoortDicht, _elmPoortOpen,
      zetTransport(fn){ _webSerialSend = fn; },
      poortStaatDicht(){ return _elmPoortTot !== 0; }
    };`;
  const fabriek = new Function(...namen, bron + epiloog);
  const api = fabriek(...namen.map(n => scope[n]));
  return { api, scope, gelogd, win };
}

let fouten = 0;
function ok(voorwaarde, omschrijving){
  if (voorwaarde){ console.log('  ✓ ' + omschrijving); }
  else { console.log('  ✗ ' + omschrijving); fouten++; }
}

(async function(){
  console.log('ELM-poort — pidlane-bt.js\n');

  // ── 1. dicht = niets komt erdoor ──
  {
    const { api, win } = bouwSandbox();
    let verstuurd = [];
    win._webSerialWrite = true;
    api.zetTransport(async (cmd) => { verstuurd.push(cmd); return '41 0C 1A F8'; });

    const voor = await api.sendCmd('010C1');
    ok(voor !== '' , 'open poort: gewoon commando gaat door');
    verstuurd = [];

    api._elmPoortDicht('test');
    const na = await api.sendCmd('010C1');
    ok(na === '', 'dichte poort: commando geeft lege string terug');
    ok(verstuurd.length === 0, 'dichte poort: transport is niet aangeraakt');

    // 2. de init-reeks komt er wél door
    const init = await api._elmSend('ATWS');
    ok(verstuurd.length === 1 && verstuurd[0] === 'ATWS', 'dichte poort: _elmSend komt er wél door');
    ok(init !== '', 'dichte poort: _elmSend krijgt een echt antwoord');

    // 3. eenmalig — het bewijs is na één aanroep op
    verstuurd = [];
    await api.sendCmd('010C1');
    ok(verstuurd.length === 0, 'doorlaatbewijs is eenmalig, niet blijvend');
  }

  // ── 3b. het bewijs lekt niet naar code die tijdens een await draait ──
  // Dit is de kern: een "init loopt"-boolean zou hier zakken.
  {
    const { api, win } = bouwSandbox();
    const verstuurd = [];
    win._webSerialWrite = true;
    api.zetTransport(async (cmd) => {
      verstuurd.push(cmd);
      // Terwijl de init op het transport wacht, probeert de poll-loop iets.
      if (cmd === 'ATWS') await api.sendCmd('010C1');
      return 'OK';
    });
    api._elmPoortDicht('test');
    await api._elmSend('ATWS');
    ok(!verstuurd.includes('010C1'), 'poll-commando tijdens een await van de init wordt geweigerd');
  }

  // ── 4. een weigering is geen lege respons ──
  // Zou hij wél meetellen, dan haalt _emptyStreak binnen zes weigeringen de
  // "verbinding dood"-drempel en start de app een herverbinding — een
  // reconnect-lus veroorzaakt door de bescherming tegen reconnects.
  {
    const { api, win } = bouwSandbox();
    win._webSerialWrite = true;
    win._emptyStreak = 0;
    api.zetTransport(async () => '41 0C 1A F8');
    api._elmPoortDicht('test');
    for (let i = 0; i < 8; i++) await api.sendCmd('010C1');
    ok((win._emptyStreak || 0) === 0, 'acht weigeringen laten _emptyStreak op 0 staan');
  }

  // ── 5. vervaltijd: een vastgelopen init blokkeert de bus niet voorgoed ──
  {
    const { api, win } = bouwSandbox();
    const verstuurd = [];
    win._webSerialWrite = true;
    api.zetTransport(async (cmd) => { verstuurd.push(cmd); return 'OK'; });

    api._elmPoortDicht('test');
    await api.sendCmd('010C1');
    ok(verstuurd.length === 0, 'vlak na sluiten nog steeds dicht');

    const echteNow = Date.now;
    Date.now = () => echteNow() + 16000;      // voorbij ELM_POORT_MAX_MS (15 s)
    try {
      await api.sendCmd('010C1');
      ok(verstuurd.length === 1, 'na de vervaltijd gaat verkeer vanzelf weer door');
      ok(!api.poortStaatDicht(), 'poort is daarbij ook echt opengezet, niet alleen omzeild');
    } finally { Date.now = echteNow; }
  }

  // ── de scanvlag: een scan mag zijn eigen verbinding niet slopen ──
  // _emptyStreak telt écht lege responses; zes op rij betekent "socket dood"
  // en start een volledige herverbinding. Een adresscan over 700-7FF levert er
  // moeiteloos 250. Dat is de reden dat elke lange scan tot nu toe halverwege
  // omviel, en de reden dat window._plScanActief bestaat.
  {
    const { api, win, scope } = bouwSandbox();
    win._webSerialWrite = true;
    api.zetTransport(async () => '');            // adres bestaat niet: niets terug

    win._plScanActief = false;
    win._emptyStreak = 0;
    for (let i = 0; i < 5; i++) await api.sendCmd('0100');
    ok(win._emptyStreak === 5,
      'zonder scanvlag telt elke lege respons mee richting "socket dood"');

    win._plScanActief = true;
    win._emptyStreak = 0;
    for (let i = 0; i < 40; i++) await api.sendCmd('0100');
    ok(win._emptyStreak === 0,
      'met de scanvlag aan tellen veertig lege responses niet mee — de scan bewaakt zelf');
    ok(scope.connected === true,
      'en de verbinding wordt niet doodverklaard midden in een sweep');

    win._plScanActief = false;
  }

  // ── 6. handmatig openen werkt en is idempotent ──
  {
    const { api, win } = bouwSandbox();
    const verstuurd = [];
    win._webSerialWrite = true;
    api.zetTransport(async (cmd) => { verstuurd.push(cmd); return 'OK'; });
    api._elmPoortDicht('test');
    api._elmPoortOpen('test');
    api._elmPoortOpen('nog een keer');
    await api.sendCmd('010C1');
    ok(verstuurd.length === 1, 'na openen loopt het verkeer weer, twee keer openen schaadt niet');
  }

  console.log('\n' + (fouten ? fouten + ' test(s) gefaald' : 'alle tests geslaagd'));
  process.exit(fouten ? 1 : 0);
})();
