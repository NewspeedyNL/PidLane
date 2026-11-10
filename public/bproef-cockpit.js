// bproef-cockpit.js — de cockpit van Hyperlane op een tablet (02-11-2026)
//
// Wat test-cockpit.js niet kan zien: of de cockpit op een tablet liggend in
// volledig scherm echt verschijnt, met de plekken die hij nodig heeft
// (rempedaal, G, helling), of de G-cirkel en de grafiek tekenen, of de
// modules binnen het scherm en buiten de ringen blijven, of tik = groot
// werkt, en of hij op een telefoon weg blijft (geen extra bustijd daar).
//
// Tegenproef: op 915×412 (telefoon liggend) mag er geen cockpit staan en
// vraagt het profiel geen rempedaal of TL01.
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const OPEN = `(async function(){
  const wacht = ms => new Promise(r => setTimeout(r, ms));
  const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
  const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
  document.getElementById('welcomeScreen').classList.add('hidden');
  sw('live', null);
  PLVisProfiel.bewaar('hyperlane');
  setPidView('visueel');
  await wacht(300);
  PLVisThema.aan();
  await wacht(3500);
  return true;
})()`;
const MEET = `(async function(){
  const wacht = ms => new Promise(r => setTimeout(r, ms));
  // Steeds opnieuw opzoeken: een herbouw (draaien, keuze) vervangt het vak,
  // en een oud element heeft maat 0 (zo rood geworden in CI, 02-11-2026).
  const V = () => document.querySelector('.gg.view-visueel .vpf-hyper');
  let vak = V();
  const r = { vak: !!vak, cockpitNu: PLHyperlane.cockpitNu(), herbouw0: PLVisueel.sessie ? (PLVisueel.sessie().herbouw || 0) : null };
  if (!vak) return r;
  const ck = vak.querySelector('.vhl-ck');
  r.tablet = vak.classList.contains('vhl-tablet');
  r.zichtbaar = !!ck && ck.getClientRects().length > 0;
  const pl = PLVisueel.staat().ind.profiel.plekken;
  r.rolRem = 'rem' in pl; r.rolHelling = 'helling' in pl;
  if (!r.zichtbaar) return r;
  const px = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4); };
  r.gPx = px(vak.querySelector('.vhl-ck-g canvas'));
  // Wachten tot de demo-auto koelwater én een grafiek heeft geleverd, tot
  // 12 s: een vaste 1,5 s was te kort met vier browsers tegelijk (05-11-2026).
  const koelNu = () => Array.from(V().querySelectorAll('.vhl-tb:not(.leeg)')).some(t => t.getAttribute('data-rol') === 'koel' && /\d/.test(t.querySelector('b').textContent));
  for (let t = 0; t < 12000; t += 300) { await wacht(300); if (V() && koelNu() && px(V().querySelector('.vhl-ck-graf canvas')) > .002 && t >= 1200) break; }
  vak = V();
  r.grafPx = px(vak.querySelector('.vhl-ck-graf canvas'));
  r.temps = Array.from(vak.querySelectorAll('.vhl-tb:not(.leeg)')).map(t => t.getAttribute('data-rol') + '=' + t.querySelector('b').textContent).join(' ');
  r.gas = vak.style.getPropertyValue('--vhl-gas');
  // Binnen het scherm en niet over de ringen
  const B = vak.getBoundingClientRect(), bx = s => vak.querySelector(s).getBoundingClientRect();
  const raak = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const mods = ['.vhl-ck-links', '.vhl-ck-temps', '.vhl-ck-3d', '.vhl-ck-graf'];
  r.buiten = mods.filter(s => { const b = bx(s); return !(b.width > 0 && b.left >= B.left - 1 && b.right <= B.right + 1 && b.top >= B.top - 1 && b.bottom <= B.bottom + 1); })
    .map(s => { const b = bx(s); return s + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round).join(',') + ' in ' + [B.left, B.top, B.right, B.bottom].map(Math.round).join(','); });
  r.binnen = r.buiten.length === 0;
  r.vrij = mods.filter(s => raak(bx(s), bx('.vhl-pod.l')) || raak(bx(s), bx('.vhl-pod.r')));
  // Tik = groot: de demo-auto rijdt, en boven 10 km/h gaat groot terecht
  // dicht. Dus even stilstand: de snelheid die het profiel doorgeeft op 0.
  // De demo-auto voedt de snelheid via voed() en een interne zet(): alleen
  // PLHyperlane.zet onderscheppen liet onder CI-belasting tussen tik en
  // controle een snelheid boven 10 km/h door (05-11-2026). Dus beide.
  const zet = PLHyperlane.zet, voed = PLHyperlane.voed;
  PLHyperlane.zet = function (rol, v, st, vv) { return zet(rol, rol === 'snel' ? 0 : v, st, vv); };
  PLHyperlane.voed = function (pid, v, st) { return voed(pid, pid === '010D' ? 0 : v, st); };
  try {
    zet('snel', 0); await wacht(300);
    const m = () => V().querySelector('.vhl-ck-temps');
    m().click(); await wacht(120);
    r.groot = m().classList.contains('groot') && V().classList.contains('vhl-ck-groot');
    m().click(); await wacht(120);
    r.dicht = !m().classList.contains('groot');
    // En rijdend: een tik vergroot niet (tegenproef van grootMag)
    PLHyperlane.zet = zet; PLHyperlane.voed = voed; zet('snel', 50); await wacht(300);
    m().click(); await wacht(200);
    r.rijdendDicht = !m().classList.contains('groot');
  } finally { PLHyperlane.zet = zet; PLHyperlane.voed = voed; }
  const S = PLVisueel.sessie ? PLVisueel.sessie() : {};
  r.herbouw = (S.herbouw || 0) - (r.herbouw0 || 0); r.herbouwReden = JSON.stringify(S.herbouwReden || {});
  return r;
})()`;

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('\n1. Tablet liggend, volledig scherm: de cockpit');
    await app.venster(1280, 800);
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    await app.ev(OPEN);
    const r = await app.ev(MEET);
    if (process.env.PL_SCHERM) await app.schermafdruk(process.env.PL_SCHERM);
    toets('het vak staat er en de cockpit is aan', r.vak && r.cockpitNu && r.tablet, JSON.stringify(r));
    toets('de cockpit is zichtbaar in volledig scherm', r.zichtbaar, JSON.stringify(r));
    toets('het profiel vraagt rempedaal en helling erbij', r.rolRem && r.rolHelling, JSON.stringify(r));
    toets('de G-cirkel tekent', r.gPx > .01, 'gevuld ' + r.gPx);
    toets('de grafiek tekent', r.grafPx > .002, 'gevuld ' + r.grafPx);
    toets('koelwater staat in de temperatuurbalken', /koel=\d/.test(r.temps || ''), r.temps);
    toets('de modules blijven binnen het scherm', r.binnen, (r.buiten || []).join(' | '));
    toets('geen module over de ringen', r.vrij && r.vrij.length === 0, (r.vrij || []).join(','));
    toets('tik = groot, nog een tik = dicht', r.groot && r.dicht, JSON.stringify({ groot: r.groot, dicht: r.dicht, herbouw: r.herbouw, reden: r.herbouwReden }));
    toets('rijdend vergroot een tik niet', r.rijdendDicht, JSON.stringify({ rijdendDicht: r.rijdendDicht }));

    console.log('\n2. Telefoon liggend: geen cockpit, geen extra bustijd (tegenproef)');
    await app.venster(915, 412);
    await new Promise(r => setTimeout(r, 1200));
    const t = await app.ev(MEET);
    toets('op een telefoon geen cockpit', t.vak && !t.cockpitNu && !t.tablet && !t.zichtbaar, JSON.stringify(t));
    toets('op een telefoon geen rempedaal en geen helling gevraagd', !t.rolRem && !t.rolHelling, JSON.stringify(t));

    console.log('\n3. Telefoon liggend met "Simuleer tablet-modus" (Admin-menu, 10-11-2026)');
    toets('de schakelaar staat in het Admin-menu', /Simuleer tablet-modus: uit/.test(await app.ev(`(document.getElementById('kbTabSim') || {}).textContent || ''`)));
    await app.ev(`document.getElementById('kbTabSim').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 1500));
    const s = await app.ev(MEET);
    toets('met de simulatie: de cockpit op de telefoon', s.vak && s.cockpitNu && s.tablet && s.zichtbaar, JSON.stringify(s));
    toets('en de plekken van de cockpit erbij', s.rolRem && s.rolHelling, JSON.stringify(s));
    toets('de modules blijven binnen het telefoonscherm', s.binnen, (s.buiten || []).join(' | '));
    toets('geen module over de ringen', s.vrij && s.vrij.length === 0, (s.vrij || []).join(','));
    toets('de knop zegt aan, en het is bewaard', await app.ev(`/aan/.test(document.getElementById('kbTabSim').textContent) && localStorage.getItem('pl_hl_tablet_sim') === '1'`));
    await app.ev(`PLHyperlane.zetTabletSim(false); 'ok'`);
    await new Promise(r => setTimeout(r, 1500));
    const u = await app.ev(MEET);
    toets('TEGENPROEF: weer uit — geen cockpit', !u.cockpitNu && !u.tablet && !u.zichtbaar, JSON.stringify(u));
    if (app.fouten.length) toets('geen fouten in de console', false, app.fouten.slice(0, 3).join(' | '));
  } finally { await app.stop(); }
  console.log(fouten ? '\nFOUT: ' + fouten : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.log('  FOUT ' + e.message); process.exit(1); });
