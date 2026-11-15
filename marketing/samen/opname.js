// opname.js — gebruiker en expert naast elkaar, in hetzelfde moment (15-11-2026)
//
// Twee keer de echte app, met het harnas van marketing/meekijken/opname.js:
//   Sanne — bij de auto, met de nep-adapter als auto (motor slaat niet aan, P0340)
//   Ruud  — de garage, die met de meekijkcode meekijkt
// Het verschil met de meekijkfilm: hier worden beide toestellen elk beeld
// tegelijk vastgelegd, zodat je ziet dat wat Sanne doet bij Ruud binnenkomt.
//
//   node marketing/samen/opname.js            → opname/<scène>/{sanne,ruud}/NNNN.png
//   node marketing/samen/opname.js --proef    één beeld per scène + controle (exit 1 = mis)
//   node marketing/samen/opname.js --video    daarna uit/samen.mp4 (naast elkaar, met koppen)
'use strict';
const path = require('path'), fs = require('fs');
const mk = require(path.join(__dirname, '..', 'meekijken', 'opname.js'));
const film = require(path.join(__dirname, '..', 'filmpje.js'));
const UIT = path.join(__dirname, 'opname'), VIDEO = path.join(__dirname, 'uit');
const z = ms => new Promise(r => setTimeout(r, ms));
const arg = (n, std) => { const i = process.argv.indexOf('--' + n); return i < 0 ? std : (process.argv[i + 1] || std); };
const PROEF = process.argv.includes('--proef'), FPS = Number(arg('fps', 8));
const KOP = { links: 'Sanne · bij de auto', rechts: 'Ruud · garage, op afstand' };

// Beide toestellen in één tik: eerst de auto bijwerken, dan de twee afdrukken.
async function samen(sanne, ruud, naam, sec, elkBeeld) {
  const map = path.join(UIT, naam), ls = path.join(map, 'sanne'), lr = path.join(map, 'ruud');
  fs.rmSync(map, { recursive: true, force: true }); fs.mkdirSync(ls, { recursive: true }); fs.mkdirSync(lr, { recursive: true });
  const n = PROEF ? 1 : Math.round(sec * FPS), t0 = Date.now(), ms = [];
  for (let i = 0; i < n; i++) {
    if (elkBeeld) await elkBeeld((Date.now() - t0) / 1000);
    const f = String(i).padStart(4, '0') + '.png';
    await sanne.schermafdruk(path.join(ls, f)); await ruud.schermafdruk(path.join(lr, f));
    ms.push(Date.now() - t0);
    const rest = (i + 1) * 1000 / FPS - (Date.now() - t0);
    if (rest > 0) await z(rest);
  }
  for (const m of [ls, lr]) fs.writeFileSync(path.join(m, 'tijden.json'), JSON.stringify({ ms }));
  console.log('  ' + naam + ': ' + n + ' beelden');
}
const tekst = (a, sel) => a.ev(`(function(){ var e=${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'document.body'}; return e ? e.innerText : ''; })()`);

(async () => {
  let mis = 0;
  const eis = (goed, wat) => { if (!goed) { mis++; console.log('  MIS  ' + wat); } };
  let s = { rpm: 0, accu: 12.4, koel: 86 };
  const sanne = await mk.app('sanne', 'Sanne');
  // Verbinden zoals in de meekijkfilm: de demo herkent de auto, daarna neemt
  // de nep-adapter het over met de echte pollketen.
  await sanne.ev(`startDemoCar(0); true`); await z(2200);
  await sanne.ev(`plDemoStop(); true`); await z(400);
  await sanne.nepAdapter(mk.ecu(s));
  await sanne.ev(`demoMode=false;connected=true;setConn(true);_aiReach=true;showVtag('Mazda CX-5 2018');updateTopbarStatus();true`);
  await z(2000);
  await sanne.ev(`PLRemote.openShare();PLRemote.shareStart();true`); await z(2500);
  const code = await sanne.ev(`document.getElementById('remShort').value`);
  eis(/\d{3} \d{3} \d{4}/.test(code || ''), 'meekijkcode niet in beeld: ' + JSON.stringify(code));

  const ruud = await mk.app('ruud', 'Ruud — Garage');
  mk.zetRelay(true); const r = mk.relay(sanne, ruud);
  try {
    // 1. Sanne deelt de code, Ruud tikt hem in.
    await ruud.ev(`PLRemote.openExpert();document.getElementById('remJoinIn').value=${JSON.stringify(code)};true`);
    await z(400);
    await samen(sanne, ruud, '1-code', 3);
    await ruud.ev(`PLRemote.expertConnect();true`); await z(900);
    await mk.geef(ruud, { type: 'meta', role: 'expert', meta: { vehicle: 'Mazda CX-5 2018', ownerLabel: 'Sanne', owner: 'sanne', exp: Math.floor(Date.now() / 1000) + 14400, status: 'open' } });
    // Zoals worker.js na het aanmelden: het toegangsniveau. Zonder dit zegt de
    // expert "de app van de klant is ouder dan 29-10-2026".
    await mk.geef(ruud, { type: 'toestemming', niveau: 'basis', blijvend: false, vast: false, t: Date.now() });
    await sanne.ev(`PLRemote.closeShare();PLNav.tab('live');setPidView('overzicht');true`);
    await z(2500);
    eis(/Mazda CX-5/.test(await tekst(ruud)), 'Ruud ziet de sessie van Sanne niet');
    eis(!/ouder dan 29-10-2026/.test(await tekst(ruud)), 'Ruud krijgt geen toegangsniveau');

    // 2. "Start eens?" Sanne start, beide schermen zien toeren en accu tegelijk.
    await samen(sanne, ruud, '2-starten', 8, async t => {
      const start = t > 1.5 && t < 5;
      s = { rpm: start ? 200 + Math.round(30 * Math.sin(t * 9)) : 0, accu: start ? 10.7 + 0.2 * Math.sin(t * 7) : 12.4, koel: 86 };
      await sanne.nepAdapter(mk.ecu(s));
    });

    // 3. Ruud vraagt de foutcodes op afstand op; Sanne hoeft niets te doen.
    await ruud.ev(`PLRemote.reqDtc();true`); await z(3500);
    eis(/P0340/.test(await tekst(ruud, '#remExpLog')), 'de expert kreeg P0340 niet binnen');
    await ruud.ev(`var l=document.getElementById('remExpLog'); if(l) l.scrollIntoView({block:'center'}); true`);
    await z(300);
    await samen(sanne, ruud, '3-foutcode', 4);
  } finally {
    mk.zetRelay(false); await r;
    const fout = [...sanne.fouten, ...ruud.fouten];
    await sanne.stop(); await ruud.stop();
    if (fout.length) console.log('LET OP  JS-fouten: ' + fout.slice(0, 3).join(' | '));
  }
  if (PROEF && mis) { console.log('\n' + mis + ' controle(s) mis.'); process.exit(1); }
  if (!PROEF && process.argv.includes('--video')) {
    const sc = ['1-code', '2-starten', '3-foutcode'].map(n => path.join(UIT, n));
    film.naastElkaar(sc.map(m => path.join(m, 'sanne')), sc.map(m => path.join(m, 'ruud')), path.join(VIDEO, 'samen.mp4'), KOP, 1600);
  }
})().catch(e => { console.error('FOUT ' + e.message); process.exit(1); });
