// ══════════════════════════════════════════════════════════════════
// bproef-lampfoto.js — een foto van het dashboard, de AI wijst het lampje aan (#492)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (14-10-2026)
// De foto gaat door drie echte stukken: het verkleinen op een canvas, apiFetch
// (die hem als afbeeldingsblok vóór de tekst zet) en de gids die opent op wat
// herkend is. In node draait geen canvas en geen apiFetch, dus dit is een
// browserproef. Alleen /v1/messages is nep: hij onthoudt wat er verstuurd
// werd en antwoordt met een vast blok.
//
//   node bproef-lampfoto.js   (of via plbrowser.sh)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fout = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); return; }
  fout++;
  console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : ''));
}

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('\n1. Zonder login en zonder akkoord');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    await app.ev(`document.getElementById('loginOv') && document.getElementById('loginOv').classList.add('hidden'); window.currentUser = null; PLLampjes.open(); 'ok'`);
    toets('de gids heeft de knop "Foto van het dashboard"', await app.ev(`!!document.getElementById('pllFotoKnop')`));
    await app.ev(`window.__toast=[]; window.showToast=function(t){ window.__toast.push(t); }; PLLampjes._foto(); 'ok'`);
    toets('niet ingelogd: uitleg, geen bestandskiezer en geen AI', /Log in/.test(await app.ev(`window.__toast.join(' ')`)));
    await app.ev(`window.currentUser = { user: 'proef' }; localStorage.removeItem('pl_lampfoto_akkoord'); window.__toast=[]; PLLampjes._foto(); 'ok'`);
    toets('ingelogd, eerste keer: eerst de toestemming, met Anthropic en "niet bewaard" erin',
      /Anthropic/.test(await app.ev(`document.getElementById('plLampOv').textContent`)) && /niet bewaard/.test(await app.ev(`document.getElementById('plLampOv').textContent`)));

    console.log('\n2. Een foto, verkleind, als afbeelding naar de AI');
    await app.ev(`(function(){
      window.__ai = [];
      window.plFetch = async function(url, opt){
        if (String(url).indexOf('/v1/messages') < 0) return new Response('{}', { status: 404 });
        window.__ai.push(opt && opt.json);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '<lampjes>{"ids":["olie","bestaatniet"],"zeker":"hoog"}</lampjes>' }],
          usage: { input_tokens: 900, output_tokens: 20 }, stop_reason: 'end_turn' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      localStorage.setItem('pl_lampfoto_akkoord', '1');
      return true; })()`);
    const klaar = await app.ev(`(async function(){
      var c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
      var g = c.getContext('2d'); g.fillStyle = '#123'; g.fillRect(0, 0, 3000, 2000); g.fillStyle = '#f80'; g.fillRect(1400, 900, 200, 200);
      var blob = await new Promise(function(ok){ c.toBlob(ok, 'image/jpeg', 0.95); });
      PLLampjes.open();
      await PLLampjes._herken(new File([blob], 'dash.jpg', { type: 'image/jpeg' }));
      return true; })()`);
    const b = await app.ev(`window.__ai[0] || null`);
    toets('er ging één vraag naar /v1/messages', !!klaar && !!b, JSON.stringify(b).slice(0, 120));
    const inh = b && b.messages && b.messages[0] && b.messages[0].content;
    toets('eerst een afbeeldingsblok, dan de tekst', Array.isArray(inh) && inh[0].type === 'image' && inh[0].source.type === 'base64' && inh[1].type === 'text', JSON.stringify(inh && inh.map((x) => x.type)));
    const data = inh && inh[0] && inh[0].source && inh[0].source.data || '';
    toets('de foto is verkleind: onder de grens van de Worker (230.000 tekens)', data.length > 1000 && data.length < 230000, String(data.length));
    toets('de vraag noemt de id\'s van de gids', inh && /olie: Oliedruk/.test(inh[1].text) && /handrem/.test(inh[1].text));
    const scherm = await app.ev(`document.getElementById('plLampOv').textContent`);
    toets('één lampje, vrij zeker: de gids opent op de oliedruk', /Oliedruk/.test(scherm) && /Niet doorrijden/.test(scherm), scherm.slice(0, 120));
    await app.ev(`PLLampjes._terug(); 'ok'`);
    const tegels = await app.ev(`[...document.querySelectorAll('#plLampOv [data-lamp]')].map(function(b){ return b.dataset.lamp; }).join(',')`);
    toets('terug: alleen wat herkend is, het onbekende id telt niet', tegels === 'olie', tegels);
    toets('met de melding dat het van de foto komt, en een weg terug naar alles', await app.ev(`!!document.getElementById('pllFotoBand')`));
    await app.ev(`PLLampjes.open(); 'ok'`);
    toets('de gids opnieuw openen geeft weer alle lampjes', (await app.ev(`document.querySelectorAll('#plLampOv [data-lamp]').length`)) >= 27);
    toets('geen JS-fouten onderweg', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } catch (e) {
    toets('proef brak af', false, e && e.message);
  } finally {
    await app.stop();
  }
  console.log(fout ? '\nbproef-lampfoto: ' + fout + ' fout' : '\nbproef-lampfoto: alles goed');
  process.exit(fout ? 1 : 0);
})();
