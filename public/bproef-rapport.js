// ══════════════════════════════════════════════════════════════════
// bproef-rapport.js — het analyserapport in de echte app (07-10-2026)
// ──────────────────────────────────────────────────────────────────
// test-rapport.js toetst het model en de PDF-opbouw los. Hier gaat het om
// de koppeling: AI-monteur → verzamelscherm → AI → "Download PDF", en of
// het rapport onderweg de meting meekrijgt (de reeksen voor de grafieken,
// de klacht), of het scherm en het archief de leesbare tekst tonen en niet
// het <rapport>-blok, en of de PDF-knop het vaste rapport maakt.
// In demo-modus; de AI-aanroep en jsPDF zijn nagebouwd (jsPDF komt anders
// van internet), er gaat niets de deur uit en er wordt niets opgeslagen.
//
// Draaien vanuit public/:  node bproef-rapport.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const ANTWOORD = 'SAMENVATTING\\nDe motor loopt rustig.\\n\\n<rapport>{"probleem":"Temperatuur loopt op.","aanpak":"Warm stationair gelezen.",' +
  '"hypothesen":[{"naam":"Thermostaat","uitkomst":"open","voor":[],"tegen":["koelwater stabiel"]}],"conclusie":"Geen afwijking gevonden in deze meting.",' +
  '"advies":[{"wat":"Opnieuw meten in de file","urgentie":"later"}],"nameten":[],"oordeel":"groen"}</rapport>';

// Een jsPDF die alleen opschrijft wat er getekend wordt.
const NEP_PDF = `window.__pdf = { teksten: [], logo: 0, paginas: 1 };
window.__NepPdf = function () {};
['setFillColor','setDrawColor','setTextColor','setLineWidth','setFont','setFontSize','setLineDashPattern','rect','roundedRect','circle','line']
  .forEach(function (f) { window.__NepPdf.prototype[f] = function () {}; });
window.__NepPdf.prototype.addImage = function () { window.__pdf.logo++; };
window.__NepPdf.prototype.addPage = function () { window.__pdf.paginas++; };
window.__NepPdf.prototype.setPage = function () {};
window.__NepPdf.prototype.getNumberOfPages = function () { return window.__pdf.paginas; };
window.__NepPdf.prototype.getTextWidth = function (t) { return String(t).length * 1.8; };
window.__NepPdf.prototype.splitTextToSize = function (t) { return [String(t)]; };
window.__NepPdf.prototype.text = function (t) { [].concat(t).forEach(function (r) { window.__pdf.teksten.push(String(r)); }); };
window.__NepPdf.prototype.output = function () { return new Blob(['%PDF'], { type: 'application/pdf' }); };
'ok'`;

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  };
  const zichtbaar = (id) => `(function(){ var e=document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none'; })()`;

  try {
    console.log('\n── 1. AI-monteur: meten, dan de AI ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLRapport staat er', await app.ev(`typeof PLRapport === 'object' && typeof PLRapport.maak === 'function'`));
    await app.ev(`startDemoCar(0); true`);
    await app.ev(`window.__prompts = []; window.apiFetch = function (p) { window.__prompts.push(String(p)); return Promise.resolve('${ANTWOORD}'); }; 'ok'`);
    await app.ev(`runQuickAI({ klacht: 'Temperatuurmeter loopt op in de file' }); 'ok'`);
    toets('het verzamelscherm staat open', await wacht(zichtbaar('plVzOv'), 5000));
    await wacht(`document.querySelectorAll('#plVzOv .vz-rij').length >= 3`, 8000);
    await new Promise(r => setTimeout(r, 2500));   // een paar meetrondes, zodat de reeksen punten hebben
    await app.ev(`document.querySelector('#plVzOv [data-a="nu"]').click(); 'ok'`);
    await wacht(`!!document.querySelector('#plVzOv [data-a="ai"]')`, 3000);
    await app.ev(`document.querySelector('#plVzOv [data-a="ai"]').click(); 'ok'`);
    toets('er ging één prompt weg, met de vraag om het rapportblok', await wacht(`window.__prompts.length === 1 && window.__prompts[0].indexOf('<rapport>') > 0`, 8000),
      await app.ev(`window.__prompts.length + ' / ' + (window.__prompts[0]||'').slice(-120)`));
    toets('het rapport staat er, met de meting erbij', await wacht(`!!(window._lastAIReport && window._lastAIReport.meting)`, 5000));
    toets('… met de reeksen van de meting (voor de grafieken)', await app.ev(`(function(){ var h = window._lastAIReport.meting.hist || {}; return Object.keys(h).some(function (p) { return h[p].length >= 3 && typeof h[p][0].t === 'number'; }); })()`),
      await app.ev(`JSON.stringify(Object.keys(window._lastAIReport.meting.hist || {}).map(function (p) { return p + ':' + window._lastAIReport.meting.hist[p].length; }))`));
    toets('… en met de klacht en waarvoor er gemeten werd', await app.ev(`window._lastAIReport.meting.klacht === 'Temperatuurmeter loopt op in de file' && window._lastAIReport.meting.watVoor === 'de AI-monteur'`));

    console.log('\n── 2. het scherm en het archief tonen de leesbare tekst ──');
    toets('het rapport op het scherm heeft het blok niet', await app.ev(`!/<rapport>|"hypothesen"/.test(window._lastAIReport.html)`));
    toets('het archief bewaart de leesbare tekst …', await app.ev(`(function(){ var l = window._sessionReports || []; var r = l[l.length - 1]; return !!r && r.text.indexOf('<rapport>') < 0 && /rustig/.test(r.text); })()`));
    toets('… en de bron, zodat een PDF uit het archief dezelfde secties krijgt', await app.ev(`(function(){ var l = window._sessionReports || []; var r = l[l.length - 1]; return !!r && /<rapport>/.test(r.bron || ''); })()`));

    console.log('\n── 3. Download PDF: het vaste rapport ──');
    await app.ev(NEP_PDF);
    await app.ev(`window.loadJsPDF = function () { return Promise.resolve(window.__NepPdf); }; window.plBewaarBestand = function () { return Promise.resolve(true); }; 'ok'`);
    await app.ev(`window.__pdfKlaar = false; exportAIReportPDF(null).then(function () { window.__pdfKlaar = true; }); 'ok'`);
    toets('de PDF is gemaakt', await wacht(`window.__pdfKlaar && !!window._lastPdf`, 8000), await app.ev(`String(window.__pdfKlaar)`));
    const t = (k) => app.ev(`window.__pdf.teksten.indexOf(${JSON.stringify(k)}) >= 0`);
    toets('voorblad met het oordeel van de AI', await t('ANALYSERAPPORT') && await t('Geen urgente problemen gevonden'));
    for (const k of ['1. Autokennis', '5. Uitvoering en metingen', '6. Hypothesen en bewijs', '8. Disclaimer en grenzen van deze meting', 'Bijlage A — Meetdata per sensor'])
      toets('hoofdstuk "' + k + '" staat erin', await t(k));
    toets('de klacht staat erin', await app.ev(`window.__pdf.teksten.some(function (x) { return /Temperatuurmeter loopt op/.test(x); })`));
    toets('grafieken uit de meting (met "0 s" op de tijdas)', await t('0 s'));
    toets('het logo komt van de app zelf', await app.ev(`window.__pdf.logo === 1`), await app.ev(`String(window.__pdf.logo)`));
    toets('geen JS-fouten onderweg', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'FOUT: ' + fouten : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
