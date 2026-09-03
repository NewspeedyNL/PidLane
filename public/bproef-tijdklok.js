// ══════════════════════════════════════════════════════════════════
// bproef-tijdklok.js — recorder en logboek lopen op dezelfde klok
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// De bulk-recorder bouwde zijn sessie-id met toISOString(), dus met UTC,
// terwijl log() ernaast lokale tijd schrijft. Twee keer hard gemeten in een
// rit (23-08 en 02-09-2026): dezelfde seconde stond in het app-log als
// 23:16:03 en in de naam van de recordersessie als 21-16-03. Wie die twee
// naast elkaar legt concludeert eerst dat ze niet bij elkaar horen (#17).
//
// WAAROM DIT NIET IN node KAN
// Een gewone test zou dit missen, en niet een beetje: een CI-runner staat op
// UTC, en daar geeft toISOString() precies dezelfde tijd als de lokale klok.
// De fout is dan onzichtbaar. Deze proef zet daarom TZ op Europe/Amsterdam
// vóórdat Chromium start — die variabele erft de browser mee — zodat er twee
// uur verschil te MÉTEN valt in plaats van te beredeneren.
//
// En hij toetst het aan de echte functies: log() uit pidlane-auth.js schrijft
// in de echte ringbuffer, PLBulk.start() maakt een echt sessie-id met een
// echte IndexedDB eronder. Geen van beide is hier nagebouwd.
//
// Draaien vanuit public/:  node bproef-tijdklok.js
// ══════════════════════════════════════════════════════════════════
'use strict';

// Vóór de require: plbrowser.js start Chromium met deze omgeving, en een
// tijdzone die ná het starten verandert bereikt die browser niet meer.
process.env.TZ = 'Europe/Amsterdam';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n1. De browser staat op een klok die van UTC verschilt');
    const offset = await app.ev(`new Date().getTimezoneOffset()`);
    if (offset === 0) {
      // Zonder verschil meet deze proef niets: dan zijn UTC en lokaal gelijk
      // en zou de oude fout ook groen staan. Dat is LET OP en geen FOUT —
      // een proef die altijd rood staat wordt genegeerd.
      console.log('  LET OP  de browser staat op UTC (offset 0) — TZ=Europe/Amsterdam kwam niet aan.');
      console.log('          Er valt dan geen verschil te meten; deze proef zegt niets.');
      process.exit(0);
    }
    toets('de klok wijkt af van UTC', offset !== 0, 'offset ' + offset + ' minuten');
    console.log('      offset ' + (-offset) + ' minuten t.o.v. UTC');

    console.log('\n2. De recorder en het logboek noemen hetzelfde uur');
    const meting = await app.ev(`(async function(){
      window.currentUser = { user:'proef', role:'admin', label:'proef' };
      const voor = localLog.length;
      const ok = await PLBulk.start(true);
      if (!ok) return { fout: 'PLBulk.start() weigerde — draait de recorder al, of is de opslag dicht?' };
      // De regel die start() zelf in het logboek zet: daar staat het uur van
      // het scherm in. In het sessie-id staat het uur van de bestandsnaam.
      const regel = localLog.slice(voor).filter(function(r){ return /bulk-recorder gestart/.test(r.msg); })[0];
      const id = PLBulk.status().sessie;
      await PLBulk.stop();
      return { id: String(id||''), ts: regel ? String(regel.ts) : '', msg: regel ? String(regel.msg) : '',
               utc: new Date().toISOString().slice(11,16) };
    })()`);
    if (meting.fout) { toets('de recorder start', false, meting.fout); throw new Error(meting.fout); }

    // Uit 'blk-2026-09-02T23-16-03-568' het uur en de minuut halen, en uit
    // '23:16:03' hetzelfde. Ze horen gelijk te zijn.
    const uitId = /T(\d\d)-(\d\d)/.exec(meting.id);
    const uitLog = /^(\d\d):(\d\d)/.exec(meting.ts);
    toets('het sessie-id draagt een leesbare kloktijd', !!uitId, 'id: "' + meting.id + '"');
    toets('de logregel draagt een kloktijd', !!uitLog, 'ts: "' + meting.ts + '"');
    if (uitId && uitLog) {
      console.log('      id "' + meting.id + '"   logregel ' + meting.ts + '   (UTC was ' + meting.utc + ')');
      toets('beide noemen hetzelfde uur en dezelfde minuut',
            uitId[1] === uitLog[1] && uitId[2] === uitLog[2],
            'id zegt ' + uitId[1] + ':' + uitId[2] + ', het logboek zegt ' + uitLog[1] + ':' + uitLog[2] +
            ' — dat is het verschil uit #17');
      toets('en het id claimt geen UTC meer met een Z',
            !/Z$/.test(meting.id),
            'id: "' + meting.id + '" — een Z betekent UTC, en dit is lokale tijd');
    }

    console.log('\n3. Tegenproef — zou de oude vorm hier wél door de mand vallen?');
    const oud = await app.ev(`(function(){
      const oudId = 'blk-' + new Date().toISOString().replace(/[:.]/g, '-');
      const lokaal = new Date().toTimeString().slice(0,5).replace(':','-');
      return { oudId: oudId, lokaal: lokaal, gelijk: oudId.indexOf('T'+lokaal) > -1 };
    })()`);
    toets('met toISOString() lopen de twee klokken wél uit elkaar',
          !oud.gelijk,
          'ook de oude vorm gaf hier hetzelfde uur (' + oud.oudId + ') — dan meet blok 2 niets');
    console.log('      oude vorm: "' + oud.oudId + '" tegenover de schermklok ' + oud.lokaal);

    console.log('\n4. De datum van een exportbestand volgt ook de lokale dag');
    const dag = await app.ev(`(function(){
      return { lokaal: plDatumLokaal(), utc: new Date().toISOString().slice(0,10),
               scherm: new Date().getFullYear() + '-' +
                       String(new Date().getMonth()+1).padStart(2,'0') + '-' +
                       String(new Date().getDate()).padStart(2,'0') };
    })()`);
    toets('plDatumLokaal() geeft de dag van het scherm', dag.lokaal === dag.scherm,
          'kreeg ' + dag.lokaal + ', het scherm staat op ' + dag.scherm);
    console.log('      lokaal ' + dag.lokaal + ', UTC ' + dag.utc +
                (dag.lokaal === dag.utc ? ' (zelfde dag op dit moment — het verschil valt rond middernacht)' : ' — vandaag verschillen ze'));
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-tijdklok: alles goed' : '\nbproef-tijdklok: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
