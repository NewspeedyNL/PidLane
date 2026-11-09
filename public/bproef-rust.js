// ══════════════════════════════════════════════════════════════════
// bproef-rust.js — schermtimers slapen in de echte app (#691, 07-11-2026)
// ──────────────────────────────────────────────────────────────────
// In de echte app, met de echte modulevolgorde:
//   1. na de boot hangen de schermtimers aan PLRust en lopen ze (sinds
//      08-11-2026 ook onderbalk, startscherm, topbar, grafiek, de kaarten
//      zonder adapter en winter, het weer, de AI-ping en de herinneringen)
//   2. de app uit beeld (visibilitychange): ze zijn weg, en de monitorchip
//      wordt in die tijd niet één keer ververst
//   3. terug in beeld: meteen ververst, en de timers lopen weer
//   4. TEGENPROEF: zonder melding van de wissel tikt de chip gewoon door —
//      de proef meet dus echt het stilvallen, niet een chip die nooit tikt
//   5. (08-11-2026) ÁLLE timers van de boot geteld, via een script vóór de
//      eerste module: uit beeld en zonder verbinding gaat er in 6,5 s geen
//      enkele af die niet in MAG_UIT_BEELD staat. Vóór deze ronde waren dat
//      er twintig, gear en telemetrie elke 200 ms. Met een verbinding lopen
//      de meettimers wél door (een rit met Maps ervoor).
//
// Draaien vanuit public/:  node bproef-rust.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

// Wat uit beeld en zonder verbinding nog mag tikken, met de reden. Een nieuwe
// vaste timer die hier niet staat maakt deze proef rood: kies dan
// PLRust.elke (scherm) of PLRust.meet (meting), of zet hem hier met de reden.
const MAG_UIT_BEELD = {
  'pidlane-auth.js': 'de sessiehartslag naar de server (30 s)'
  // De wekker van PLRust zelf (10 s) telt niet mee: hij staat in pidlane-rust.js.
};
// Telt elke setInterval vanaf de eerste module, met het bestand waar hij gezet werd.
const VOORAF = `(function(){
  var echt = window.setInterval, wis = window.clearInterval, lijst = window.__plIv = {};
  window.setInterval = function(fn, ms){
    var waar = String((new Error()).stack || '').split('\\n').slice(2).map(function(r){ var m = r.match(/(pidlane-[a-z0-9-]+\\.js)/); return m ? m[1] : null; }).filter(Boolean)[0] || '?';
    var rec = { waar: waar, ms: ms, uit: 0, weg: false };
    var id = echt.call(window, function(){ if (document.visibilityState === 'hidden') rec.uit++; return typeof fn === 'function' ? fn.apply(this, arguments) : null; }, ms);
    lijst[id] = rec; return id;
  };
  window.clearInterval = function(id){ if (lijst[id]) lijst[id].weg = true; return wis.call(window, id); };
})();`;

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname), vooraf: VOORAF });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('1. Na de boot');
    const b = await app.ev(`(function(){
      return { er: !!window.PLRust, taken: PLRust.taken() };
    })()`);
    const namen = (b.taken || []).map(t => t.naam).sort().join(',');
    toets('PLRust is er', b.er);
    const scherm = (b.taken || []).filter(t => !t.meet).map(t => t.naam).sort().join(',');
    const meetN = (b.taken || []).filter(t => t.meet).map(t => t.naam);
    const VERWACHT = ['ai-ping', 'bulkdashboard', 'grafiek', 'help', 'herinneringen', 'monitorchip', 'monitorknop', 'onderbalk', 'run-stip', 'scherm-aan', 'startscherm', 'topbar', 'weer', 'weer-opstart', 'winterkaart', 'zonder-adapter'];
    toets('de schermtimers hangen eraan', scherm === VERWACHT.join(','), scherm);
    toets('de meettimers ook (versnelling, telemetrie, berekend, garage, accu)', ['versnelling', 'telemetrie', 'berekend', 'garage', 'accu'].every(x => meetN.indexOf(x) >= 0), meetN.join(','));
    toets('en ze lopen', (b.taken || []).every(t => t.loopt), JSON.stringify(b.taken));

    // De chip tellen: _monChipTick is een globale functie, de timer roept hem bij naam
    const meet = (melden) => app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      let n = 0; const echt = window._monChipTick; window._monChipTick = function(){ n++; return echt.apply(this, arguments); };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      if (${melden ? 'true' : 'false'}) document.dispatchEvent(new Event('visibilitychange'));
      await wacht(2600);
      const r = { verborgen: n, actief: PLRust.actief() };
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      r.terugMeteen = n - r.verborgen; r.terugActief = PLRust.actief();
      window._monChipTick = echt;
      return r;
    })()`);

    console.log('\n2. Uit beeld en terug');
    const r = await meet(true);
    toets('uit beeld: geen timer meer', r.actief === 0, JSON.stringify(r));
    toets('uit beeld: de chip niet één keer ververst in 2,6 s', r.verborgen === 0, JSON.stringify(r));
    toets('terug: meteen één keer ververst', r.terugMeteen === 1, JSON.stringify(r));
    toets('terug: alle timers lopen weer', r.terugActief === (b.taken || []).length, JSON.stringify(r));

    console.log('\n3. TEGENPROEF — de wissel niet melden');
    const t = await meet(false);
    toets('dan tikt de chip door (minstens twee keer in 2,6 s)', t.verborgen >= 2, JSON.stringify(t));

    console.log('\n4. Alle timers van de boot, uit beeld');
    const tel = (verbonden, melden) => app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const oud = connected; connected = ${verbonden ? 'true' : 'false'};
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      if (${melden ? 'true' : 'false'}) document.dispatchEvent(new Event('visibilitychange'));
      if (${verbonden ? 'true' : 'false'}) PLRust.verbinding();
      Object.keys(window.__plIv).forEach(function(k){ window.__plIv[k].uit = 0; });
      const voor = {}; PLRust.taken().forEach(function(t){ voor[t.naam] = t.n; });
      await wacht(6500);
      const uit = {};
      // Gewone timers per bestand; die van PLRust per taak (anders staat alles op pidlane-rust.js).
      Object.keys(window.__plIv).forEach(function(k){ const x = window.__plIv[k]; if (x.uit && !x.weg && x.waar !== 'pidlane-rust.js') uit[x.waar] = (uit[x.waar] || 0) + x.uit; });
      PLRust.taken().forEach(function(t){ const d = t.n - (voor[t.naam] || 0); if (d > 0) uit['PLRust:' + t.naam] = d; });
      connected = oud;
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      return uit;
    })()`);
    // Niet alleen wat binnen 6,5 s afgaat: ook een levende gewone timer van
    // 15 of 30 s telt. Zo glipte de scherm-aan-timer (15 s) er eerst door.
    const levend = await app.ev(`(function(){ const uit = {};
      Object.keys(window.__plIv).forEach(function(k){ const x = window.__plIv[k]; if (!x.weg && x.waar !== 'pidlane-rust.js') uit[x.waar] = (uit[x.waar] || 0) + 1; });
      return uit; })()`);
    const vast = Object.keys(levend).filter(f => !MAG_UIT_BEELD[f]);
    toets('geen levende gewone setInterval buiten MAG_UIT_BEELD (ook geen trage)', vast.length === 0, vast.map(f => f + ' ×' + levend[f]).join(', '));
    const stil = await tel(false, true);
    const teVeel = Object.keys(stil).filter(f => !MAG_UIT_BEELD[f]);
    toets('zonder verbinding: geen timer buiten MAG_UIT_BEELD', teVeel.length === 0, teVeel.map(f => f + ' ×' + stil[f]).join(', '));
    const rit = await tel(true, true);
    toets('mét verbinding uit beeld: de meettimers lopen door (telemetrie, berekend, versnelling)',
      ['PLRust:telemetrie', 'PLRust:berekend', 'PLRust:versnelling'].every(f => rit[f] > 0), JSON.stringify(rit));
    toets('maar de schermtimers niet (onderbalk, startscherm)', !rit['PLRust:onderbalk'] && !rit['PLRust:startscherm'], JSON.stringify(rit));
    const door = await tel(false, false);
    toets('TEGENPROEF: zonder melding van de wissel tikken ze wél (minstens vijf)', Object.keys(door).length >= 5, JSON.stringify(door));

    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e.stack || e)); process.exit(1); });
