// ══════════════════════════════════════════════════════════════════
// bproef-logimport.js — een ingelezen log gaat niet over de verbonden auto
// ──────────────────────────────────────────────────────────────────
// Gevonden op 16-11-2026 met thermostaat-open.csv: het rapport over een
// Golf-log stond op naam van de Mazda die in de app actief was (kenteken,
// VIN, APK), de AI kreeg het dossier van de Mazda mee, en het rapport ging
// het dossier van die Mazda in. Dat raakt drie modules (apiFetch, het
// archief, PLRapport), dus een browserproef:
//
//   1. apiFetch met aanlevering.extern: voertuig uit de log, geen live
//      toestand en geen aanlevering van de verbonden auto — en zónder
//      extern wél (de tegenproef binnen de proef)
//   2. registerSessionReport met extern: titel "Ingelezen log", niet naar
//      PLGarage.rapport
//   3. PLRapport.uitApp met een extern-meting: voertuig uit de log, geen
//      kenteken
//
// Draaien:  node bproef-logimport.js   (of via plbrowser.sh)
// ══════════════════════════════════════════════════════════════════
'use strict';
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
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    toets('PLLogImport en de knop in het adminmenu bestaan',
      await app.ev(`!!window.PLLogImport && typeof PLLogImport.open === 'function' && !!document.getElementById('kbLogImport')`));

    // De verbonden auto: een Mazda met draaiende motor.
    await app.ev(`(function(){ vehicleInfo = Object.assign(vehicleInfo || {}, {merk:'Mazda', model:'CX-5', year:'2018', brandstof:'benzine'});
      pidVals = {'010C': 900}; try { localStorage.setItem('pl_kenteken', 'XX999X'); } catch (e) { console.warn(e); } return true; })()`);

    const sysVan = async (ext) => JSON.parse(await app.ev(`(async function(){
      const echtFetch = window.plFetch, echtCred = window.PLCredits, echtCtx = window._plMeetcontext, echtSr = window._srUseContext;
      window._plMeetcontext = {}; window._srUseContext = false; window.PLCredits = null;
      let body = null;
      window.plFetch = async function(pad, opt){
        body = (opt && opt.json) || null;
        return { ok: true, headers: { get: function(){ return null; } },
                 json: async function(){ return { content: [{type:'text', text:'proef'}], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }; } };
      };
      let fout = null;
      try { await apiFetch('Toets de log.', 50, null, null, Object.assign({vraag:'Ingelezen log?'}, ${ext ? `{extern:{naam:'t.csv', voertuig:{merk:'Ford', model:'Focus 2.0', year:'2008', brandstof:'benzine'}}}` : '{}'})); }
      catch(e){ fout = String(e && e.message || e); }
      window.plFetch = echtFetch; window.PLCredits = echtCred; window._plMeetcontext = echtCtx; window._srUseContext = echtSr;
      return JSON.stringify({ fout: fout, sys: (body && body.system) || '' });
    })()`));

    const zonder = await sysVan(false);
    toets('tegenproef: zonder extern staat de verbonden Mazda in de systeemprompt',
      zonder.fout === null && /VOERTUIG: Mazda CX-5/.test(zonder.sys) && /DRAAIT/.test(zonder.sys), zonder.fout || zonder.sys.slice(0, 200));
    const met = await sysVan(true);
    toets('met extern: het voertuig uit de log', met.fout === null && /VOERTUIG: Ford Focus 2\.0 2008/.test(met.sys), met.fout || met.sys.slice(0, 200));
    toets('met extern: niets van de Mazda, geen live toestand, geen aanlevering',
      !/Mazda/.test(met.sys) && !/DRAAIT/.test(met.sys) && !/AANLEVERING/.test(met.sys), met.sys.slice(0, 600));

    const arch = JSON.parse(await app.ev(`(function(){
      const echt = window.PLGarage && PLGarage.rapport; let gestuurd = 0;
      if (window.PLGarage) PLGarage.rapport = function(){ gestuurd++; };
      const a = registerSessionReport({ type:'ai', text:'Log-rapport ' + Date.now(), extern:{naam:'t.csv', voertuig:{merk:'Ford'}} });
      const b = registerSessionReport({ type:'ai', text:'Gewoon rapport ' + Date.now() });
      if (window.PLGarage) PLGarage.rapport = echt;
      return JSON.stringify({ titel: a && a.title, extern: !!(a && a.extern), gestuurd: gestuurd, garage: !!window.PLGarage, b: !!b });
    })()`));
    toets('het archief noemt het een ingelezen log', /Ingelezen log · t\.csv/.test(arch.titel || ''), arch.titel);
    toets('alleen het gewone rapport gaat naar het dossier van het actieve voertuig',
      arch.garage && arch.b && arch.extern && arch.gestuurd === 1, JSON.stringify(arch));

    const ctx = JSON.parse(await app.ev(`(function(){
      const c = PLRapport.uitApp({ ts: new Date().toISOString(), text: 'x', meting: { extern: { naam:'t.csv', voertuig:{merk:'Ford', model:'Focus'} } } });
      const d = PLRapport.uitApp({ ts: new Date().toISOString(), text: 'x', meting: {} });
      return JSON.stringify({ merk: c.voertuig.merk, kenteken: c.kenteken, dtc: c.dtc, gewoon: d.voertuig.merk, gewoonKt: d.kenteken });
    })()`));
    toets('het rapport over een log draagt het voertuig uit de log en geen kenteken',
      ctx.merk === 'Ford' && ctx.kenteken === '' && ctx.dtc === null, JSON.stringify(ctx));
    toets('tegenproef: een gewoon rapport houdt de verbonden auto', ctx.gewoon === 'Mazda' && ctx.gewoonKt === 'XX999X', JSON.stringify(ctx));
  } finally {
    await app.stop();
  }
  console.log(fouten ? '\n' + fouten + ' fout' : '\nalles goed');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
