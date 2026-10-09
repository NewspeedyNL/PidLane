// ══════════════════════════════════════════════════════════════════
// opname.js — neemt de app-beelden op voor het filmpje "Meekijken"
// ──────────────────────────────────────────────────────────────────
// Twee keer de ECHTE index.html in Chromium, via plbrowser.js:
//   Sanne  — de klant langs de weg, met de nep-adapter als auto
//   Ruud   — de garage, die met de meekijkcode inlogt
// Wat hier nagebootst wordt, en verder niets:
//   • de auto: _sendBTOnce (de nep-adapter van plbrowser.js), met een
//     motor die niet aanslaat en foutcode P0340
//   • de server: fetch naar de Worker en de WebSocket van de sessie.
//     Dit script speelt de Durable Object na zoals worker.js hem doet:
//     telemetry van de local wordt een frame voor de expert, vstate en
//     response gaan door, request-* van de expert gaat naar de local.
// Alles daartussen — delen, de code, meekijken, de tegels, de
// foutcode-uitlezing op verzoek van de expert — is de echte app.
//
// Uitvoer: opname/<scène>/NNNN.png plus opname/scenes.js (fps per scène).
// Draaien vanuit de repo:  node marketing/meekijken/opname.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', '..', 'plbrowser.js'));

const UIT = path.join(__dirname, 'opname');
const FPS = 10;
const z = ms => new Promise(r => setTimeout(r, ms));
const hex = (n, b) => Math.max(0, Math.round(n)).toString(16).toUpperCase()
  .padStart(b * 2, '0').slice(-b * 2).match(/../g).join(' ');

/* De auto. Antwoorden in de vorm die een ELM met ATH0 geeft. `s` is de
   toestand van dit moment: toerental, accuspanning, koelwater. */
function ecu(s) {
  return {
    '0100': '41 00 BE 3F B8 13', '0120': '41 20 80 05 B0 15', '0140': '41 40 FE D0 04 01',
    '0160': '41 60 00 00 00 01', '0180': '41 80 00 00 00 01', '01A0': '41 A0 04 00 00 00',
    '0101': '41 01 81 07 65 04', '03': '43 01 03 40', '07': '47 00', '0A': '4A 00', '04': '44',
    '010C': '41 0C ' + hex(s.rpm * 4, 2), '010D': '41 0D 00', '0105': '41 05 ' + hex(s.koel + 40, 1),
    '0142': '41 42 ' + hex(s.accu * 1000, 2), '0104': '41 04 ' + hex(s.rpm > 50 ? 18 : 0, 1),
    '0111': '41 11 ' + hex(14 * 2.55, 1), '012F': '41 2F ' + hex(62 * 2.55, 1), '010F': '41 0F ' + hex(56, 1),
    '0106': '41 06 80', '0107': '41 07 82', '0110': '41 10 ' + hex(s.rpm > 50 ? 180 : 0, 2),
    '015E': '41 5E 00 00', '010B': '41 0B ' + hex(s.rpm > 50 ? 62 : 101, 1), '010E': '41 0E 80',
    '0146': '41 46 ' + hex(14 + 40, 1), '015C': '41 5C ' + hex(s.koel + 34, 1), '0133': '41 33 65',
    '0149': '41 49 28', '0144': '41 44 80 00', '0124': '41 24 80 00 80 00', '0134': '41 34 80 00 80 00',
    '0114': '41 14 5A 80', '0115': '41 15 5A 80', '013C': '41 3C ' + hex(3800, 2), '0121': '41 21 00 00',
    '0131': '41 31 ' + hex(3200, 2), '014E': '41 4E 00 00', '0130': '41 30 12'
  };
}

/* De server, voor zover de app hem ziet. Alleen het netwerk: geen enkele
   functie van de app wordt hier vervangen. */
const NEP_SERVER = `(function(){
  document.head.insertAdjacentHTML('beforeend','<style>#bronBanner,#plZonderKaart{display:none!important}</style>');
  const echt = window.fetch.bind(window);
  const J = o => new Response(JSON.stringify(o), {status:200, headers:{'Content-Type':'application/json'}});
  window.fetch = async function(u, o){
    const s = String(u && u.url || u);
    if (/\\/session\\/create/.test(s)) return J({sessionId:'s7f3k2', joinToken:'jt-film', localToken:'lt-film', exp:Math.floor(Date.now()/1000)+14400});
    if (/\\/code\\/create/.test(s)) return J({code:'4829130576'});
    if (/\\/code\\/resolve/.test(s)) return J({sessionId:'s7f3k2', joinToken:'jt-film'});
    if (!/\\.(js|css|png|svg|json|html|woff2?)(\\?|$)/.test(s)) return J({ok:true});
    return echt(u, o);
  };
  window._wsUit = []; window._wsIn = null;
  window.WebSocket = class {
    constructor(u){ this.url = u; this.readyState = 0; window._wsIn = this;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 300); }
    send(d){ window._wsUit.push(d); }
    close(){ this.readyState = 3; }
  };
  window.APP_TOKEN = 'film';
  return true;
})()`;

async function app(wie, label) {
  const a = await startApp({ root: path.join(__dirname, '..', '..', 'public') });
  if (a.fouten.length) throw new Error(wie + ': JS-fouten bij de boot: ' + a.fouten.join(' | '));
  await a.ev(NEP_SERVER);
  await a.ev(`finishLogin(${JSON.stringify(wie)},{role:'user',label:${JSON.stringify(label)},apiKey:''});true`);
  await z(1200);
  return a;
}
// Berichten die de app verstuurde ophalen, en berichten afleveren.
const haal = a => a.ev(`(function(){const u=window._wsUit.splice(0);return JSON.stringify(u);})()`).then(JSON.parse);
const geef = (a, m) => a.ev(`(function(){const w=window._wsIn;if(w&&w.readyState===1&&w.onmessage)w.onmessage({data:${JSON.stringify(JSON.stringify(m))}});return true;})()`);

let relayAan = false;
async function relay(sanne, ruud) {
  while (relayAan) {
    for (const raw of await haal(sanne)) {
      const m = JSON.parse(raw);
      if (m.type === 'telemetry') await geef(ruud, { type: 'frame', frame: { t: Date.now(), data: m.data } });
      else if (m.type === 'vstate') await geef(ruud, { type: 'vstate', data: m.data, t: Date.now() });
      else if (m.type === 'response') await geef(ruud, { type: 'response', reqId: m.reqId, data: m.data, t: Date.now() });
    }
    for (const raw of await haal(ruud)) {
      const m = JSON.parse(raw);
      if (/^request-/.test(m.type)) await geef(sanne, m);
    }
    await z(120);
  }
}

const scenes = {};
async function neem(a, naam, sec, elkeFrame) {
  const map = path.join(UIT, naam);
  fs.mkdirSync(map, { recursive: true });
  const n = Math.round(sec * FPS);
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    if (elkeFrame) await elkeFrame(i / FPS);
    await a.schermafdruk(path.join(map, String(i).padStart(4, '0') + '.png'));
    const rest = 1000 / FPS - (Date.now() - t0);
    if (rest > 0) await z(rest);
  }
  scenes[naam] = { fps: FPS, frames: n };
  console.log('  ' + naam + ': ' + n + ' frames');
}
async function still(a, naam) { return neem(a, naam, 0.1); }

(async () => {
  fs.rmSync(UIT, { recursive: true, force: true });
  fs.mkdirSync(UIT, { recursive: true });
  let s = { rpm: 0, accu: 12.4, koel: 86 };

  console.log('Sanne start');
  const sanne = await app('sanne', 'Sanne');
  await still(sanne, 'verbind');                       // het verbindscherm: "Plug in. Let's go."

  // Verbinden. De voertuigherkenning loopt via de demo-auto (een Mazda CX-5);
  // daarna gaat de demo uit en neemt de nep-adapter het over met de echte
  // pollketen, zodat de statusregel "Verbonden" zegt en niet "Demo".
  await sanne.ev(`startDemoCar(0); true`); await z(2200);
  await sanne.ev(`plDemoStop(); true`); await z(400);
  await sanne.nepAdapter(ecu(s));
  await sanne.ev(`demoMode=false;connected=true;setConn(true);_aiReach=true;showVtag('Mazda CX-5 2018');updateTopbarStatus();true`);
  await z(2000);
  await still(sanne, 'thuis');

  // Check mijn auto: de echte uitlezing, via sendCmd → _sendBTOnce.
  await sanne.ev(`document.getElementById('plCheckBtn').click();true`);
  await z(9000);
  if (!/P0340/.test(await sanne.ev(`document.body.innerText`))) throw new Error('P0340 staat niet in het checkvenster');
  await still(sanne, 'check');
  await sanne.ev(`PLFoutcodes.sluit();true`);
  await z(600);

  // Delen: de echte deelknop, de echte code.
  await sanne.ev(`PLRemote.openShare();PLRemote.shareStart();true`);
  await z(2500);
  const code = await sanne.ev(`document.getElementById('remShort').value`);
  if (code !== '482 913 0576') throw new Error('meekijkcode niet in beeld: ' + JSON.stringify(code));
  await still(sanne, 'delen');

  console.log('Ruud start');
  const ruud = await app('ruud', 'Ruud — Garage');
  relayAan = true; const r = relay(sanne, ruud);
  await ruud.ev(`PLRemote.openExpert();document.getElementById('remJoinIn').value='482 913 0576';true`);
  await z(400);
  await still(ruud, 'code-invoeren');
  await ruud.ev(`PLRemote.expertConnect();true`);
  await z(900);
  await geef(ruud, { type: 'meta', role: 'expert', meta: { vehicle: 'Mazda CX-5 2018', ownerLabel: 'Sanne', owner: 'sanne', exp: Math.floor(Date.now() / 1000) + 14400, status: 'open' } });
  await sanne.ev(`PLRemote.closeShare();true`);
  await z(2500);

  // Meekijken: Ruud ziet de tegels. "Probeer eens te starten": de motor
  // draait rond op de startmotor (~220 tpm), de accu zakt, hij slaat niet aan.
  await neem(ruud, 'meekijken', 7, async t => {
    const start = t > 1.5 && t < 4.5;
    s = { rpm: start ? 200 + Math.round(30 * Math.sin(t * 9)) : 0, accu: start ? 10.7 + 0.2 * Math.sin(t * 7) : 12.4, koel: 86 };
    await sanne.nepAdapter(ecu(s));
  });

  // Ruud vraagt de foutcodes op afstand op: request-dtc → de local leest
  // mode 03 uit via de nep-adapter → response → het logboek van de expert.
  await ruud.ev(`PLRemote.reqDtc();true`);
  await z(3500);
  if (!/P0340/.test(await ruud.ev(`document.getElementById('remExpLog').innerText`)))
    throw new Error('de expert kreeg P0340 niet binnen');
  await ruud.ev(`document.getElementById('remExpLog').scrollIntoView({block:'center'});true`);
  await z(300);
  await neem(ruud, 'foutcode', 2);

  relayAan = false; await r;
  // Als script en niet als JSON: film.html wordt vanaf file:// geopend, en
  // daar mag fetch() niet.
  fs.writeFileSync(path.join(UIT, 'scenes.js'), 'window.SCENES = ' + JSON.stringify(scenes, null, 2) + ';\n');
  const fout = [...sanne.fouten, ...ruud.fouten];
  await sanne.stop(); await ruud.stop();
  if (fout.length) { console.log('LET OP  JS-fouten tijdens de opname: ' + fout.slice(0, 5).join(' | ')); }
  console.log('klaar: ' + UIT);
})().catch(e => { console.error('FOUT  ' + e.message); process.exit(1); });
