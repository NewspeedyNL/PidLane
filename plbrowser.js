// ══════════════════════════════════════════════════════════════════
// plbrowser.js — start de ECHTE app in een echte browser, zonder auto
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
//
// Op 02-09-2026 stonden er 22 issues open. Vijftien daarvan hadden geen
// auto nodig — ze hadden een DRAAIENDE APP nodig, en die was er alleen
// tijdens een rit. Daardoor ging alles op één hoop: een tekstlabel dat te
// kort werd afgekapt (#95) wachtte net zo lang op een rit als een vraag
// die echt een motor nodig heeft (#20).
//
// De reden dat het zo gegroeid is staat in test-schermranden.js:
//
//   "Playwright kan dit gedrag meten [...] Voor de rest lukt dat hier niet
//    zonder de hele app-boot na te bouwen: openTestrun() weigert zonder
//    isAdmin(), en dat hangt aan een ingelogde sessie die een kale
//    testomgeving niet heeft."
//
// Die conclusie klopte niet, en dat is op 03-09-2026 nagemeten. De app-boot
// hoeft niet nagebouwd te worden — hij kan gewoon DRAAIEN. Alle 57 modules
// laden, alle kernobjecten leven, 146 PIDs staan in de tabel, nul fouten.
// Wat de boot tegenhield was één regel in de <head>: de stylesheet van
// Google Fonts. Een <script> wacht op openstaande CSS, en die CSS kwam in
// een testomgeving zonder internet nooit. Blokkeer extern verkeer en de
// app start in ongeveer vijftien seconden.
//
// WAT DIT WEL EN NIET IS
//
// Wel: de echte index.html, de echte modules, de echte functies, in de
// echte JS-engine. Een proef roept `validateAndSmooth()` aan zoals de app
// hem aanroept — niet een uit de bron geknipte kopie.
//
// Niet: een auto. Er zit geen ECU achter. De adapter is een tabel met
// antwoorden (zie nepAdapter hieronder), en die antwoorden komen bij
// voorkeur uit een ECHT testrunverslag — daar staat elke TX met zijn RX in.
// Wat een echte bus doet onder belasting blijft een vraag voor een rit.
//
// GEEN AFHANKELIJKHEDEN. Geen npm, geen Playwright, geen buildstap. Node
// praat rechtstreeks met Chromium over het debugprotocol; node 22 heeft
// daar een ingebouwde WebSocket voor. Dat is een harde keuze: dit project
// draait op Termux naast een baan, en een testgereedschap dat zelf
// onderhoud vraagt wordt niet gedraaid.
//
// Draaien:  bash plbrowser.sh .
// ══════════════════════════════════════════════════════════════════
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Waar Chromium kan staan. De eerste die bestaat wint. Staat er geen,
// dan meldt startApp() dat met zoveel woorden — hij doet niet alsof.
const CHROOMPADEN = [
  process.env.PL_CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].filter(Boolean);

function vindChromium() {
  for (const p of CHROOMPADEN) {
    try { if (fs.existsSync(p)) return p; }
    catch (e) { console.warn('plbrowser: kon ' + p + ' niet nakijken — ' + e.message); }
  }
  return null;
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
               '.webmanifest':'application/manifest+json' };

// Extern verkeer gaat er in een proef NIET uit. Twee redenen, en de tweede
// is de belangrijkste: (1) zonder internet hangt de boot op de font-CSS,
// (2) een proef die het net op kan is niet herhaalbaar — dan meet je de
// dag, niet de code.
const GEBLOKKEERD = ['*fonts.googleapis.com*', '*fonts.gstatic.com*',
                     '*workers.dev*', '*anthropic.com*', '*airtable.com*',
                     '*google-analytics.com*'];

/* ── DE NEP-ADAPTER ────────────────────────────────────────────────
   Vervangt _sendBTOnce(): het laagste punt in pidlane-bt.js waar één
   commando één antwoord krijgt. BEWUST daar en niet hoger: alles erboven
   — sendBT met zijn herhaalgedrag, sendCmd met PLBus.note() en
   trackBtQuality() — blijft dan de echte code en wordt dus meegetoetst.

   `tabel` is {commando: antwoord}. Een commando dat er niet in staat
   krijgt 'NO DATA', want dat is wat een ECU doet met een PID die hij niet
   kent — niet een lege string, want dat betekent iets anders (dode
   socket) en dan zou de proef het verkeerde geval nabouwen. */
function nepAdapterCode(tabel, vertraagMs) {
  return `(function(){
    const T = ${JSON.stringify(tabel)};
    window._plNepLog = [];
    window._sendBTOnce = async function(cmd){
      const c = String(cmd||'').toUpperCase();
      window._plNepLog.push(c);
      ${vertraagMs ? `await new Promise(r=>setTimeout(r,${vertraagMs}));` : ''}
      if (Object.prototype.hasOwnProperty.call(T, c)) return T[c];
      const kaal = c.replace(/1$/, '');            // '010C1' → '010C': snelle-terugkeer-suffix
      if (Object.prototype.hasOwnProperty.call(T, kaal)) return T[kaal];
      return 'NO DATA';
    };
    window.connected = true;
    window.demoMode  = false;
    return window._sendBTOnce.length >= 0;
  })()`;
}

/* ── STARTEN ───────────────────────────────────────────────────────
   Geeft een handvat terug met ev() om iets in de app te vragen, plus de
   verzamelde fouten en dialogen. Alles wat misgaat wordt gemeld; er zit
   geen stille catch in dit bestand. */
async function startApp(opties) {
  const o = opties || {};
  const root = path.resolve(o.root || 'public');
  const chrome = vindChromium();
  if (!chrome) {
    const e = new Error('GEEN_CHROMIUM');
    e.uitleg = 'Geen Chromium gevonden. Gezocht in: ' + CHROOMPADEN.join(', ') +
               '\nZet PL_CHROME naar het pad, of sla de browserproeven over.';
    throw e;
  }

  const verzoeken = [], gemist = [];
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    verzoeken.push(p);
    fs.readFile(path.join(root, p), (err, data) => {
      if (err) { gemist.push(p); rs.writeHead(404); rs.end('niet gevonden'); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      rs.end(data);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const appUrl = 'http://127.0.0.1:' + srv.address().port + '/index.html';

  const profiel = fs.mkdtempSync(path.join(require('os').tmpdir(), 'plbrowser-'));
  const ch = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--remote-debugging-port=0',
    '--user-data-dir=' + profiel, '--window-size=412,915', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });

  let wsUrl = null, stderr = '';
  ch.stderr.on('data', d => {
    stderr += d;
    const m = /ws:\/\/[^\s]+/.exec(stderr);
    if (m && !wsUrl) wsUrl = m[0];
  });

  // WAAROM 90 SECONDEN EN NIET 30 — gemeten op de CI-runner van 03-09-2026.
  //
  // In die run brak de EERSTE browserproef af op precies 30 s, terwijl de vier
  // proeven daarna in de ZELFDE job elk in ongeveer 3 s startten, op dezelfde
  // Chromium. Het is dus geen kapotte browser en geen ontbrekende poort: het is
  // een koude start. De eerste keer betaalt de runner voor het inlezen van het
  // binaire bestand en zijn bibliotheken en voor het aanmaken van het profiel;
  // daarna staat dat in de paginacache van de kernel en is het weg.
  //
  // Dat maakt dit een grens die per definitie alleen de eerste proef raakt, en
  // die dus willekeurig lijkt: op een warme runner haalt hij het wél. "Flake"
  // is hier geen oorzaak maar een naam voor niet gekeken hebben.
  //
  // Ophogen kost niets als het goed gaat: de lus stopt zodra de ws-regel er is,
  // dus een warme start blijft ~3 s. De enige prijs is dat een Chromium die
  // écht niet kan starten er langer over doet om dat te melden, en dat is de
  // goedkopere kant om fout te zitten dan een reeks die om de zoveel run rood
  // staat zonder dat er iets stuk is.
  const WACHT_START_MS = 90000;
  const TIK = 250;
  for (let i = 0; i < WACHT_START_MS / TIK && !wsUrl; i++) await new Promise(r => setTimeout(r, TIK));

  if (!wsUrl) {
    // SIGTERM en, als dat niet aankomt, SIGKILL. Een Chromium die nog aan het
    // opstarten is pakt het eerste signaal niet altijd op: in de run van
    // 03-09 meldde de runner na afloop "Terminate orphan process: chrome" voor
    // precies deze mislukte start. Dat proces liep dus nog dóór tijdens de vier
    // proeven erna en vocht daar om dezelfde processor — een mislukte eerste
    // proef maakte de rest van de reeks zo trager dan nodig.
    ch.kill();
    setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {
      console.warn('plbrowser: Chromium liet zich niet afsluiten na een mislukte start —', e.message);
    } }, 2000).unref();
    srv.close();

    // De dbus-regels hieronder zijn op een headless runner normaal en zeggen
    // niets over de oorzaak. Dat er expliciet bij, want ze staan bovenaan de
    // melding en sturen je anders een uur de verkeerde kant op.
    throw new Error('Chromium gaf geen debugpoort binnen ' + (WACHT_START_MS / 1000) + ' s.\n' +
      'Meldingen hieronder; "Failed to connect to the bus" is normaal zonder desktop\n' +
      'en is niet de oorzaak.\n' + stderr.slice(0, 800));
  }

  const sock = new WebSocket(wsUrl);
  let volgnr = 0;
  const wacht = new Map();
  const fouten = [], dialogen = [];
  let geladen = false, sessieId = null;

  sock.addEventListener('message', ev => {
    let m;
    try { m = JSON.parse(ev.data); }
    catch (e) { console.warn('plbrowser: onleesbaar bericht van Chromium — ' + e.message); return; }
    if (m.id && wacht.has(m.id)) { wacht.get(m.id)(m); wacht.delete(m.id); return; }
    if (m.method === 'Page.loadEventFired') geladen = true;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      fouten.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      // Wegklikken, maar wél melden: een alert() tijdens de boot is zelf een
      // bevinding. Stil accepteren zou precies het soort fout verbergen dat
      // deze harnas moet vinden.
      dialogen.push(m.params.type + ': ' + String(m.params.message).slice(0, 120));
      sock.send(JSON.stringify({ id: ++volgnr, method: 'Page.handleJavaScriptDialog',
                                 params: { accept: true }, sessionId: sessieId }));
    }
  });
  await new Promise(r => sock.addEventListener('open', r));

  // sessionId pas meesturen zodra we ergens aan gehecht zijn. Een expliciete
  // `sessionId: null` is voor het debugprotocol geen "laat maar weg" maar een
  // ongeldige sessie, en dan komt er een foutantwoord zonder result terug.
  const cmd = (method, params) => new Promise(r => {
    const n = ++volgnr;
    wacht.set(n, r);
    const bericht = { id: n, method, params: params || {} };
    if (sessieId) bericht.sessionId = sessieId;
    sock.send(JSON.stringify(bericht));
  });

  // Elk antwoord nakijken in plaats van blind .result te lezen: een fout van
  // het debugprotocol komt terug als {error:{message}}, en die melding is het
  // enige wat vertelt wat er mis is.
  function uit(antwoord, wat) {
    if (!antwoord || !antwoord.result) {
      const m = antwoord && antwoord.error ? antwoord.error.message : 'geen antwoord';
      throw new Error('Chromium weigerde ' + wat + ': ' + m);
    }
    return antwoord.result;
  }
  const doel = uit(await cmd('Target.createTarget', { url: 'about:blank' }), 'Target.createTarget');
  const gehecht = uit(await cmd('Target.attachToTarget',
                                { targetId: doel.targetId, flatten: true }), 'Target.attachToTarget');
  sessieId = gehecht.sessionId;

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Network.enable');
  /* De vensterbreedte instellen via het debugprotocol en niet via
     --window-size. Nagemeten op 03-09-2026: met alleen die vlag rapporteerde
     window.innerWidth 500 in plaats van 412, en dat is precies het soort stille
     fout waar dit harnas voor bestaat — een proef die een tekstlabel opmeet zou
     dan de verkeerde telefoon meten en te ruim concluderen.
     412x915 is een gangbare telefoon; deviceScaleFactor 2 en mobile:true zorgen
     dat media queries en rem-maten zich ook als telefoon gedragen. */
  await cmd('Emulation.setDeviceMetricsOverride',
            { width: o.breedte || 412, height: o.hoogte || 915,
              deviceScaleFactor: 2, mobile: true });
  await cmd('Network.setBlockedURLs', { urls: GEBLOKKEERD });
  await cmd('Page.navigate', { url: appUrl });

  const tot = o.wachtMs || 30000;
  for (let i = 0; i < tot / 250 && !geladen; i++) await new Promise(r => setTimeout(r, 250));
  if (!geladen) {
    ch.kill(); srv.close();
    throw new Error('De app gaf binnen ' + (tot / 1000) + ' s geen load-event. ' +
      'Opgehaald: ' + verzoeken.length + ' bestanden, gemist: ' + JSON.stringify(gemist));
  }
  // De modules hangen onderaan de body en draaien hun eigen opstart nog even
  // door na het load-event (PLRit.start(), bedradingscontrole, thema).
  await new Promise(r => setTimeout(r, o.rustMs || 2000));

  async function ev(expressie) {
    const r = await cmd('Runtime.evaluate',
      { expression: expressie, returnByValue: true, awaitPromise: true });
    const res = r.result || {};
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('fout in de app: ' +
        ((d.exception && d.exception.description) || d.text || 'onbekend').split('\n')[0]);
    }
    return res.result ? res.result.value : undefined;
  }

  return {
    ev,
    fouten, dialogen, verzoeken, gemist,
    // De nep-adapter aanzetten. Geeft terug hoeveel commando's er in de
    // tabel staan, zodat een proef kan controleren dat hij echt aan staat.
    async nepAdapter(tabel, vertraagMs) {
      await ev(nepAdapterCode(tabel || {}, vertraagMs || 0));
      return Object.keys(tabel || {}).length;
    },
    async stop() {
      try { sock.close(); } catch (e) { console.warn('plbrowser: socket sluiten mislukt — ' + e.message); }
      // Wachten tot Chromium echt weg is voordat de profielmap weggaat: hij
      // schrijft bij het afsluiten nog naar Default/, en dan geeft rmSync
      // ENOTEMPTY. Dat is geen echte fout, maar wel elke keer een regel ruis.
      const dood = new Promise(r => { ch.once('exit', r); setTimeout(r, 3000); });
      try { ch.kill(); } catch (e) { console.warn('plbrowser: Chromium stoppen mislukt — ' + e.message); }
      await dood;
      await new Promise(r => srv.close(r));
      // Chromium schrijft bij het afsluiten nog even door in Default/. Twee
      // pogingen met een pauze ertussen; lukt het dan nog niet, dan melden we
      // het en laten we de map staan — een achtergebleven tijdelijke map is
      // geen reden om een proef te laten mislukken.
      let opgeruimd = false;
      for (let poging = 0; poging < 2 && !opgeruimd; poging++) {
        if (poging) await new Promise(r => setTimeout(r, 500));
        try { fs.rmSync(profiel, { recursive: true, force: true }); opgeruimd = true; }
        catch (e) {
          if (poging) console.warn('plbrowser: profielmap ' + profiel + ' bleef staan — ' + e.message);
        }
      }
    }
  };
}

module.exports = { startApp, vindChromium };
