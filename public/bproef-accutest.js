// ══════════════════════════════════════════════════════════════════
// bproef-accutest.js — staat de accupagina bovenop, en is hij te lezen?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// Op 26-10-2026, na de eerste versie: "venster opent niet op de voorgrond"
// en "de onderkant valt weg". Allebei gaan over de echte stapeling en de
// echte stijlen: de z-index tegen Mijn voertuigen en de onderbalk, de
// .vis-lampen-rij met pointer-events:none, en de veilige zone onderaan.
// test-accutest.js toetst de rekenkern; dit toetst de pagina in de app.
//
//   1. het accu-lampje in Slim visueel is aan te tikken en opent de pagina
//   2. de pagina ligt bovenop, ook boven een open Mijn voertuigen
//   3. de onderkant: na scrollen staat het laatste element binnen het scherm
//   4. elke tab tekent zonder fout, met grafieken en de sensortegels
//
// Draaien vanuit public/:  node bproef-accutest.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await app.venster(412, 915);
    await app.ev(`window.__fouten = []; window.addEventListener('error', function (e) { window.__fouten.push(String(e.message)); }); 1`);

    console.log('\n1. Het accu-lampje in Slim visueel opent de accupagina');
    await app.ev(`startDemoCar(0); true`);
    await wacht(1500);
    await app.ev(`(function(){ ['010C','010D','0105','0104','0142'].forEach(function(p){ activePIDs.add(p); }); setPidView('visueel'); return true; })()`);
    // Het inlogscherm en het startscherm van de demo opzij: naar Live, waar Slim visueel staat.
    await app.ev(`(function(){ var lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden'); PLNav.tab('live'); setPidView('visueel'); return 1; })()`);
    for (let i = 0; i < 40 && await app.ev(`/leeg/.test((document.getElementById('vis-lamp-accu') || { className: 'leeg' }).className)`); i++) await wacht(250);
    const l = JSON.parse(await app.ev(`(function(){
      var e = document.getElementById('vis-lamp-accu'); if (!e) return JSON.stringify({ er: false });
      var r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      var raak = document.elementFromPoint(x, y), opLamp = !!(raak && raak.closest && raak.closest('#vis-lamp-accu'));
      if (opLamp) raak.click();
      return JSON.stringify({ er: true, zichtbaar: r.width > 0 && getComputedStyle(e).visibility !== 'hidden', opLamp: opLamp, raak: raak ? raak.tagName + '#' + raak.id + '.' + raak.className : null,
        open: !!document.getElementById('plAccuTest') });
    })()`));
    toets('het lampje staat er en is zichtbaar', l.er && l.zichtbaar, JSON.stringify(l));
    toets('een tik op het lampje komt bij het lampje (niet door de rij heen)', l.opLamp, JSON.stringify(l));
    toets('en opent de accupagina', l.open, JSON.stringify(l));
    await app.ev(`PLAccu.sluit(); 1`);

    console.log('\n2. Bovenop, ook boven een open overlay van Mijn voertuigen');
    const b = JSON.parse(await app.ev(`(function(){
      var ov = document.createElement('div'); ov.id = 'plGarOv'; ov.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal,9600);background:#123';
      document.body.appendChild(ov);
      PLAccu.open('live');
      var p = document.getElementById('plAccuTest'), W = innerWidth, H = innerHeight;
      var bij = function (x, y) { var e = document.elementFromPoint(x, y); return !!(e && e.closest && e.closest('#plAccuTest')); };
      var r = p.getBoundingClientRect();
      var uit = { midden: bij(W / 2, H / 2), boven: bij(W / 2, 4), onder: bij(W / 2, H - 4), links: bij(4, H / 2), heel: r.top <= 0 && r.left <= 0 && r.right >= W && r.bottom >= H };
      ov.remove();
      return JSON.stringify(uit);
    })()`));
    toets('midden, boven, onder en links van het scherm is de accupagina', b.midden && b.boven && b.onder && b.links, JSON.stringify(b));
    toets('de pagina beslaat het hele scherm', b.heel, JSON.stringify(b));

    console.log('\n3. De onderkant is te lezen');
    for (const tab of ['live', 'trend', 'winter', 'uitleg', 'test']) {
      const o = JSON.parse(await app.ev(`(function(){
        PLAccu.open('${tab}');
        var body = document.querySelector('#plAccuTest .pa-body'), inn = document.getElementById('plAccuTab');
        body.scrollTop = body.scrollHeight;
        var laatste = inn.lastElementChild, r = laatste ? laatste.getBoundingClientRect() : null, H = innerHeight;
        var x = r ? Math.min(innerWidth - 2, r.left + 10) : 0, y = r ? Math.min(H - 2, r.bottom - 6) : 0, e = r ? document.elementFromPoint(x, y) : null;
        return JSON.stringify({ laatste: !!laatste, onder: r ? Math.round(r.bottom) : null, H: H, raak: !!(e && laatste.contains(e)),
          breed: document.documentElement.scrollWidth <= innerWidth + 1, svg: inn.querySelectorAll('svg.pa-svg').length, tekst: inn.textContent.length });
      })()`));
      toets('tab ' + tab + ': het laatste element staat na scrollen binnen het scherm en is aan te tikken', o.laatste && o.onder <= o.H && o.raak, JSON.stringify(o));
      toets('tab ' + tab + ': geen zijwaarts scrollen', o.breed, JSON.stringify(o));
    }

    console.log('\n4. Wat er op de pagina staat');
    const t = JSON.parse(await app.ev(`(function(){
      PLAccu.open('live');
      var inn = document.getElementById('plAccuTab');
      return JSON.stringify({ tegels: inn.querySelectorAll('.pa-tegel').length, svg: inn.querySelectorAll('svg.pa-svg').length, tekst: inn.textContent,
        tabs: document.querySelectorAll('#plAccuTest .pa-tabs button').length });
    })()`));
    toets('Live: de sensortegels (gevraagde laadspanning, laadtoestand, stroom, temperatuur, leeftijd + 2)', t.tegels >= 7, JSON.stringify({ tegels: t.tegels }));
    toets('Live: een grafiek van de spanning', t.svg >= 1, String(t.svg));
    toets('Live: noemt de Mazda-code van de gevraagde laadspanning als die niet ingesteld is', /220304/.test(t.tekst) || /22 0304/.test(t.tekst), t.tekst.slice(0, 300));
    toets('vijf tabs', t.tabs === 5, String(t.tabs));
    await app.ev(`document.querySelector('#plAccuTest [data-actie="sluit"]').click(); 1`);
    const weg = await app.ev(`!document.getElementById('plAccuTest')`);
    toets('✕ sluit de pagina', weg === true, String(weg));
    const f = JSON.parse(await app.ev(`JSON.stringify(window.__fouten)`));
    toets('zonder fouten in de console', f.length === 0, JSON.stringify(f));

    console.log('\nbproef-accutest: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
