// bproef-expertwerk.js — de werkplek van de expert op een laptop (18-10-2026)
//
// Wat test-expertwerk.js niet kan zien: of het meekijkvenster op een laptop
// echt het hele scherm vult en de kaarten naast elkaar zet, of de garagemodus
// aangaat, of inloggen het venster opent, en of "uit" het gewone smalle
// venster teruggeeft. De auto komt als vstate binnen zoals PLRemote hem
// krijgt; er zit geen telefoon achter.
//
// Tegenproef: met de stand op uit moet het venster weer smal zijn en de oude
// voorkennis zichtbaar. Blijft de werkplek staan, dan zegt deze proef dat.
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
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(1440, 900);
    console.log('\n1. Inloggen op een laptop: het meekijkvenster opent als werkplek');
    const r = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
      localStorage.setItem('pl_garagemodus', '0'); PLNav.ververs();
      PLExpertWerk.zetStand('aan');
      const r = { garage0: PLNav.garage(), opent: PLExpertWerk.naLogin() };
      await wacht(200);
      const ov = document.getElementById('remExpertOv'), kaart = ov.querySelector('.rem-card').getBoundingClientRect();
      r.open = ov.classList.contains('open'); r.werk = ov.classList.contains('pl-expertwerk');
      r.vol = kaart.width >= innerWidth - 2 && kaart.height >= innerHeight - 2;
      r.leeg = /meekijk-code/.test(document.getElementById('remWerkplek').textContent);
      r.knop = document.getElementById('remWerkKnop').textContent;
      return r;
    })()`);
    toets('inloggen opent het meekijkvenster', r.opent && r.open, JSON.stringify(r));
    toets('…schermvullend, als werkplek', r.werk && r.vol, JSON.stringify(r));
    toets('zonder auto zegt de werkplek hoe je verbindt', r.leeg, JSON.stringify(r));
    toets('de knop in de kop zegt de stand', /Expertweergave: aan/.test(r.knop), r.knop);

    console.log('\n2. Een VW 1.4 TSI met P0016 komt binnen');
    const a = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const kennis = autoKennisVoorMerk('Volkswagen', 'Benzine', { cc: 1390, jaar: 2010 });
      const vk = PLVoorkennis.bouw({ codes: ['P0016'], kennis, onderzoek: PLOnderzoek, dtcInfo: c => dtcInfo(c) });
      const vs = { veh: { merk: 'Volkswagen', model: 'Golf', year: '2010', brandstof: 'Benzine', wmi: 'WVW' }, pids: ['010C', '010D', '0105'], active: ['010C'],
                   health: { '0110': 'nodata' }, dtc: ['P0016'], rps: 12, voorkennis: vk };
      PLExpertWerk.toon(vs, { owner: 'klant@voorbeeld.nl' });
      await wacht(100);
      const kol = [...document.querySelectorAll('#remWerkplek .ew-kol')].map(k => Math.round(k.getBoundingClientRect().left));
      const titels = [...document.querySelectorAll('#remWerkplek .ew-proc summary')].map(s => s.textContent);
      const vkZichtbaar = getComputedStyle(document.getElementById('remVoorkennis')).display !== 'none';
      return { kol, titels, auto: (document.querySelector('.ew-auto') || {}).textContent, alarm: !!document.querySelector('.ew-kaart.ew-alarm'),
               garage: PLNav.garage(), lichaam: document.body.classList.contains('pl-garage'), vkZichtbaar };
    })()`);
    toets('drie kolommen naast elkaar', a.kol.length === 3 && a.kol[0] < a.kol[1] && a.kol[1] < a.kol[2], JSON.stringify(a.kol));
    toets('de auto staat bovenaan links', a.auto === 'Volkswagen Golf', a.auto);
    toets('de foutcode en de stille sensor maken de kaart "wijkt af" rood', a.alarm, JSON.stringify(a));
    toets('een procedure voor de ketting van déze motor', a.titels.some(t => /ketting/i.test(t)), JSON.stringify(a.titels));
    toets('…en het controleplan van P0016', a.titels.some(t => /P0016/.test(t)), JSON.stringify(a.titels));
    toets('de garagemodus staat aan', a.garage && a.lichaam, JSON.stringify(a));
    toets('de oude voorkenniskolom staat er niet dubbel', !a.vkZichtbaar, JSON.stringify(a));

    console.log('\n3. Uit: het gewone venster terug (tegenproef)');
    const u = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      PLExpertWerk.zetStand('uit'); PLExpertWerk.toon(null, null);
      await wacht(100);
      const ov = document.getElementById('remExpertOv'), kaart = ov.querySelector('.rem-card').getBoundingClientRect();
      const r = { werk: ov.classList.contains('pl-expertwerk'), breed: Math.round(kaart.width), leeg: document.getElementById('remWerkplek').innerHTML === '',
                  knop: document.getElementById('remWerkKnop').textContent };
      PLRemote.expertClose();
      r.naLogin = PLExpertWerk.naLogin();
      localStorage.removeItem('pl_expertweergave');
      return r;
    })()`);
    toets('met de stand op uit geen werkplek', !u.werk && u.leeg, JSON.stringify(u));
    toets('…en weer het smalle venster', u.breed <= 560, JSON.stringify(u));
    toets('…en inloggen opent het venster niet meer', u.naLogin === false, JSON.stringify(u));
    toets('de knop zegt uit', /Expertweergave: uit/.test(u.knop), u.knop);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-expertwerk: alles goed' : '\nbproef-expertwerk: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
