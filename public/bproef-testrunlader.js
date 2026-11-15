// ══════════════════════════════════════════════════════════════════
// bproef-testrunlader.js — een klant laadt de testrun niet, de beheerder wel (#690)
// ──────────────────────────────────────────────────────────────────
// Start de ECHTE index.html zonder dat plbrowser de testrun laadt
// (zonderTestrun). Toetst:
//   1. na de boot: geen pidlane-testrun/meetkamer/meetcoach opgehaald, maar
//      PLRit en de gat-duidingen draaien wél (pidlane-ritwaarnemer.js)
//   2. een markering vóór het laden gaat niet verloren
//   3. openTestrun() laadt alle drie; als klant weigert de echte functie
//      daarna, zoals voorheen
//   4. TEGENPROEF in een tweede app: wordt de gebruiker beheerder, dan laadt
//      hij ze vanzelf
// Draaien:  node bproef-testrunlader.js   (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const LAAT = ['/pidlane-testrun.js', '/pidlane-meetkamer.js', '/pidlane-meetcoach.js'];

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname), zonderTestrun: true }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('\n1. Na de boot, als klant');
    const opgehaald = LAAT.filter((f) => app.verzoeken.indexOf(f) >= 0);
    toets('testrun, meetkamer en meetcoach niet opgehaald', opgehaald.length === 0, opgehaald.join(', '));
    const b = await app.ev(`({ live: typeof window.PLTestrunLive, coach: typeof window.PLMeetcoach, rit: typeof window.PLRit, budget: typeof window.PLBudget,
      duiding: typeof window.plGatDuiding, staat: PLTestrunLader.staat(), plaats: !!(window.openTestrun && window.openTestrun._plaatshouder) })`);
    toets('PLRit, PLBudget en plGatDuiding draaien wel', b.rit === 'object' && b.budget === 'object' && b.duiding === 'function', JSON.stringify(b));
    toets('PLTestrunLive en PLMeetcoach zijn er niet; openTestrun is een plaatshouder', b.live === 'undefined' && b.coach === 'undefined' && b.plaats && b.staat === 'niet', JSON.stringify(b));

    console.log('\n2. Een markering vóór het laden');
    await app.ev(`plMarkeer('proefmarkering', 'vóór het laden'); 'ok'`);
    await app.ev(`PLTestrunLader.laad('proef')`);
    const m2 = await app.ev(`PLBegeleid.markeringen().map(function(x){ return x.tekst; })`);
    toets('de markering staat na het laden in de lijst', (m2 || []).indexOf('proefmarkering') >= 0, JSON.stringify(m2));

    console.log('\n3. openTestrun() na het laden');
    const o = await app.ev(`(async function(){ await openTestrun(); await new Promise(r => setTimeout(r, 400));
      var p = document.getElementById('testrunOv') || document.querySelector('[id*="estrun"]');
      return { live: typeof window.PLTestrunLive, coach: typeof window.PLMeetcoach, kamer: typeof window.PLMeetkamer, echt: !(window.openTestrun && window.openTestrun._plaatshouder), paneel: !!(p && p.getClientRects().length) }; })()`);
    toets('alle drie geladen en openTestrun is de echte', o.live === 'object' && o.coach === 'object' && o.kamer === 'object' && o.echt, JSON.stringify(o));
    toets('als klant: de echte openTestrun weigert, het paneel blijft dicht', !o.paneel, JSON.stringify(o));
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally { await app.stop(); }

  console.log('\n4. TEGENPROEF: de beheerder krijgt ze vanzelf');
  const app2 = await startApp({ root: path.join(__dirname), zonderTestrun: true });
  try {
    const voor = await app2.ev(`PLTestrunLader.staat()`);
    await app2.ev(`currentUser = { role: 'admin', name: 'proef' }; 'ok'`);
    await new Promise((r) => setTimeout(r, 4500));
    const na = await app2.ev(`({ staat: PLTestrunLader.staat(), coach: typeof window.PLMeetcoach })`);
    toets('vóór de rol: niet geladen', voor === 'niet', voor);
    toets('na de rol beheerder: vanzelf geladen, met de meetcoach', na.staat === 'geladen' && na.coach === 'object', JSON.stringify(na));
    const p = await app2.ev(`(async function(){ openTestrun(); await new Promise(r => setTimeout(r, 400)); var o = document.getElementById('testrunOv'); return !!(o && o.getClientRects().length); })()`);
    toets('en de beheerder opent het testrunpaneel', p === true, String(p));
    toets('geen JS-fouten', app2.fouten.length === 0, app2.fouten.slice(0, 3).join(' | '));
  } finally { await app2.stop(); }

  console.log('\nbproef-testrunlader: ' + (fouten ? fouten + ' FOUT' : 'goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT bproef-testrunlader brak af: ' + e.message); process.exit(1); });
