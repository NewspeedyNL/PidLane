// bproef-lagen.js — niets in Slim visueel ligt over iets anders (28-10-2026)
//
// Uit de auto: "plaatsing weergaves scheef of overlappend". De statusbalk lag
// staand over de toerenring en het knopje Slim, ⛶ en 🎨 lagen in de gewone
// weergave midden over de lampjes, het achtergrondknopje over het motorlampje.
// Elk daarvan was één regel CSS, en geen enkele proef keek ernaar: die keken
// per weergave naar één ding. Deze proef loopt alle weergaven af, staand en
// liggend, gewoon en op volledig scherm, en meet of een knop of lampje iets
// raakt — een ander knopje of lampje, of de inhoud.
//
// Ronde dingen (de ringen van Hyperlane, de basismeter, het G-vizier) tellen
// als cirkel: hun kader is vierkant, en een knop in een lege hoek raakt niets.
//
// Tegenproef: zet de statusbalk staand terug op +68px (zoals vóór deze dag),
// dan wordt Hyperlane staand rood.
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const PROFIELEN = ['basis', 'temp', 'emissie', 'verbruik', 'motor', 'telemetrie', 'hyperlane'];

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    await app.ev(`(function(){
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
      document.getElementById('welcomeScreen').classList.add('hidden');
      sw('live', null); return 1; })()`);
    for (const [bw, bh, stand] of [[412, 915, 'staand'], [915, 412, 'liggend']]) {
      await app.venster(bw, bh);
      console.log('\n' + stand + ' ' + bw + '×' + bh);
      for (const pr of PROFIELEN) {
        for (const vol of [false, true]) {
          const r = await app.ev(`(async function(){
            const wacht = ms => new Promise(r => setTimeout(r, ms));
            PLVisProfiel.bewaar('${pr}'); setPidView('overzicht'); await wacht(150); setPidView('visueel'); await wacht(1200);
            if (${vol}) { document.querySelector('.gg.view-visueel .vt-vol').click(); await wacht(1500); }
            const zicht = e => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
                                 const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
            const naam = e => String(e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ')[0] + (e.id ? '#' + e.id : '');
            const G = '.gg.view-visueel ';
            // Knoppen en lampjes: die mogen niets raken
            // Op volledig scherm is de statusbalk één capsule: die telt als geheel
            const knop = [...document.querySelectorAll(G + ':is(.vis-lamp:not(.leeg), .vt-knop, .vhl-vorm, .vhl-midden, .vhl-ritknop' + (${vol} ? ', .vis-lampen' : '') + ')')].filter(zicht);
            // De inhoud; rond = als cirkel meten
            const rond = new Set(['vhl-ring', 'vis-meter', 'vpf-g-svg', 'vpf-horizon-svg']);
            const inhoud = [...document.querySelectorAll(G + ':is(.vhl-ring, .vis-meter, .vpf-g-svg, .vpf-horizon-svg, .vhl-held, .vhl-strook, .vhl-kop, .vhl-tank, .vpf-buis, .vpf-lcd-groot, .vpf-ringen, .vpf-lambda, .vpf-rij, .vpf-or-vak, .vpf-tel-nul, .vpf-tel-getallen > div, .vpf-neon-getallen > div)')].filter(zicht);
            const T = 4;   // een paar pixels rand telt niet
            const raak = (a, b) => {
              const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
              const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left), oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
              if (ox <= T || oy <= T) return false;
              const cirkel = (c, r2) => { const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, rad = Math.min(c.width, c.height) / 2 * .95;
                const nx = Math.max(r2.left, Math.min(cx, r2.right)), ny = Math.max(r2.top, Math.min(cy, r2.bottom));
                return Math.hypot(nx - cx, ny - cy) < rad - T; };
              const ra = [...a.classList || []].some(k => rond.has(k)) || rond.has(String(a.className.baseVal || '').split(' ')[0]);
              const rb = [...b.classList || []].some(k => rond.has(k)) || rond.has(String(b.className.baseVal || '').split(' ')[0]);
              if (ra) return cirkel(p, q);
              if (rb) return cirkel(q, p);
              return true;
            };
            const bots = [];
            for (let i = 0; i < knop.length; i++) {
              for (let j = i + 1; j < knop.length; j++) if (!knop[i].contains(knop[j]) && !knop[j].contains(knop[i]) && raak(knop[i], knop[j])) bots.push(naam(knop[i]) + ' × ' + naam(knop[j]));
              for (const c of inhoud) if (!c.contains(knop[i]) && !knop[i].contains(c) && raak(knop[i], c)) bots.push(naam(knop[i]) + ' × ' + naam(c));
            }
            // Op volledig scherm: niets van de inhoud valt van het scherm
            const buiten = ${vol} ? inhoud.filter(e => { const r = e.getBoundingClientRect(); return r.left < -2 || r.right > innerWidth + 2 || r.top < -2 || r.bottom > innerHeight + 2; }).map(naam) : [];
            if (${vol}) { appBack(); await wacht(200); }
            return { bots: bots, buiten: buiten, knoppen: knop.length };
          })()`);
          toets(pr + (vol ? ' volledig scherm' : ' gewoon') + ': geen knop of lampje over iets anders, niets van het scherm',
            r.bots.length === 0 && r.buiten.length === 0 && r.knoppen > 0, JSON.stringify(r));
        }
      }
    }
    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-lagen: alles goed' : '\nbproef-lagen: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
