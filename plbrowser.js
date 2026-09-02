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
  for (let i = 0; i < 120 && !wsUrl; i++) await new Promise(r => setTimeout(r, 250));
  if (!wsUrl) {
    ch.kill(); srv.close();
    throw new Error('Chromium gaf geen debugpoort binnen 30 s. Meldingen:\n' + stderr.slice(0, 800));
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
      try { fs.rmSync(profiel, { recursive: true, force: true }); }
      catch (e) { console.warn('plbrowser: profielmap ' + profiel + ' bleef staan — ' + e.message); }
    }
  };
}

module.exports = { startApp, vindChromium };
