// bproef-banden.js — het bandenvenster en het lampje in de echte app (28-09-2026)
//
// Wat test-banden.js niet kan zien: of het venster in de echte app opent, de
// vier tegels op de goede plek en in de goede eenheid staan, het lampje boven
// Slim visueel verschijnt en kleurt, en de Android-terugknop het venster
// sluit. De eigen PIDs zijn precies die van de CX-5 op 28-09 (psi-formule,
// ECU 720); de waarden gaan via updPID(), zoals de pollus ze aanlevert.
//
// Tegenproef: met één band 20% lager moet het lampje rood worden — staat het
// lampje altijd op "ok", dan zegt deze proef dat.
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
    await app.venster(412, 915);
    console.log('\n1. De bandensensoren van de CX-5, in bar');
    const zet = await app.ev(`(function(){
      const psi = '((A*1373)/1000)*0.145037738';
      const namen = { '222A05':'Bandenspanning voor-links', '222A06':'Bandenspanning voor-rechts', '222A07':'Bandenspanning achter-links', '222A08':'Bandenspanning achter-rechts',
                      '222A0A':'Bandtemperatuur voor-links', '222A0B':'Bandtemperatuur voor-rechts', '222A0C':'Bandtemperatuur achter-links', '222A0D':'Bandtemperatuur achter-rechts' };
      const lijst = Object.keys(namen).map(c => ({ code: c, naam: namen[c], ecu: '720', formule: /Bandenspanning/.test(namen[c]) ? psi : 'A-50', eenheid: /Bandenspanning/.test(namen[c]) ? 'psi' : '°C' }));
      PLEigen.zet(lijst, 'CX-5');
      return { n: PLEigen.defs().length, eenheid: getPidDef('222A05').unit, tempo: pidPollInterval('222A05'), opVerzoek: PLEigen.opVerzoek('222A05'), waarde: getPidDef('222A05').parse([170]) };
    })()`);
    toets('acht bandensensoren, druk in bar (de standaard)', zet.n === 8 && zet.eenheid === 'bar', JSON.stringify(zet));
    toets('op verzoek: niet in de pollus (#396)', zet.opVerzoek === true && zet.tempo === 999999, JSON.stringify(zet));
    toets('170 wordt 2,33 bar', zet.waarde === 2.33, JSON.stringify(zet));

    console.log('\n2. Het venster');
    const venster = await app.ev(`(async function(){
      [['222A05',2.33],['222A06',2.33],['222A07',2.40],['222A08',2.40],['222A0A',24],['222A0B',25],['222A0C',23],['222A0D',24]]
        .forEach(x => updPID(x[0], x[1]));
      PLBanden.open();
      const ov = document.getElementById('plBandenOv');
      const tegel = p => { const e = ov.querySelector('.plb-tegel[data-pos="' + p + '"]'); return e ? { t: e.textContent, k: e.className } : null; };
      const r = { open: ov.style.display === 'flex', VL: tegel('VL'), AR: tegel('AR'), oordeel: (ov.querySelector('.plb-oordeel') || {}).className, ververs: !!ov.querySelector('.plb-ververs') };
      const b = ov.querySelector('.plb-vel').getBoundingClientRect();
      r.past = b.width <= innerWidth && [...ov.querySelectorAll('.plb-tegel')].every(e => { const q = e.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth && e.scrollWidth <= e.clientWidth + 1; });
      return r;
    })()`);
    toets('het venster opent', venster.open, JSON.stringify(venster));
    toets('met een knop ↻ om de banden opnieuw te vragen (#396)', venster.ververs, JSON.stringify(venster));
    toets('voor links: 2,33 bar en 24 °C', venster.VL && /Voor links/.test(venster.VL.t) && /2,33\s*bar/.test(venster.VL.t) && /24 °C/.test(venster.VL.t), JSON.stringify(venster.VL));
    toets('achter rechts: 2,40 bar', venster.AR && /2,40\s*bar/.test(venster.AR.t), JSON.stringify(venster.AR));
    toets('vier gelijke banden: oordeel ok', /\bok\b/.test(venster.oordeel || ''), JSON.stringify(venster));
    toets('op een telefoon van 412 px past alles, niets wordt afgekapt', venster.past, JSON.stringify(venster));

    const lek = await app.ev(`(async function(){
      updPID('222A06', 1.80);
      await new Promise(r => setTimeout(r, 2300));   // het venster ververst elke 2 s
      const ov = document.getElementById('plBandenOv');
      const e = ov.querySelector('.plb-tegel[data-pos="VR"]');
      return { k: e.className, band: ov.querySelector('.plb-band.danger') ? 1 : 0, uitleg: ov.querySelector('.plb-oordeel').textContent };
    })()`);
    toets('voor rechts 24% onder de mediaan (2,365): rode tegel, rode band, en de uitleg zegt welke', /danger/.test(lek.k) && lek.band === 1 && /voor rechts 24% lager/.test(lek.uitleg), JSON.stringify(lek));

    const terug = await app.ev(`(function(){ appBack(); return document.getElementById('plBandenOv').style.display; })()`);
    toets('de Android-terugknop sluit het venster', terug === 'none', terug);

    console.log('\n2b. De sensorlijst: één regel voor de acht banden (#396)');
    const lijstje = await app.ev(`(function(){
      supportedPIDs = new Set(['010C','010D','0105']);
      buildDiscoveredPIDList();
      const el = document.getElementById('pidList');
      const rijen = [...el.querySelectorAll('.pr')].map(r => r.querySelector('.pn').textContent);
      const regel = el.querySelector('.pr-banden');
      const r = { losseBanden: rijen.filter(n => /Banden(spanning)?\\b.*(links|rechts)|Bandtemperatuur/.test(n)).length,
                  regel: regel ? regel.textContent : null, aanVoor: PLBanden.aan(), sel: regel ? regel.classList.contains('sel') : null };
      regel && regel.click();
      const regel2 = document.getElementById('pidList').querySelector('.pr-banden');
      r.naKlik = PLBanden.aan(); r.selNa = regel2 ? regel2.classList.contains('sel') : null;
      r.inActief = [...activePIDs].filter(p => /^222A/.test(p)).length;
      regel2 && regel2.click();
      r.terug = PLBanden.aan();
      return r;
    })()`);
    toets('geen acht losse bandregels meer in de lijst', lijstje.losseBanden === 0, JSON.stringify(lijstje));
    toets('wel één regel "🛞 Banden" met "8 sensoren · elke 5 min"', /🛞 Banden/.test(lijstje.regel || '') && /8 sensoren · elke 5 min/.test(lijstje.regel || ''), JSON.stringify(lijstje));
    toets('standaard aangevinkt', lijstje.aanVoor === true && lijstje.sel === true, JSON.stringify(lijstje));
    toets('tikken zet de ronde van vijf minuten uit, en de regel volgt', lijstje.naKlik === false && lijstje.selNa === false, JSON.stringify(lijstje));
    toets('het vinkje zet geen bandcode in activePIDs', lijstje.inActief === 0, JSON.stringify(lijstje));
    toets('nog eens tikken zet hem weer aan', lijstje.terug === true, JSON.stringify(lijstje));

    console.log('\n3. Het lampje boven Slim visueel');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    const lamp = await app.ev(`(async function(){
      ['010C','010D'].forEach(p => activePIDs.add(p));
      setPidView('visueel');
      await new Promise(r => setTimeout(r, 1500));
      const e = document.getElementById('vis-banden');
      const wielen = function(){ return Array.from(e.querySelectorAll('.vbm-wiel')).map(function(w){ return w.getAttribute('class').replace('vbm-wiel ',''); }).join(','); };
      const r = { er: !!e && e.style.display !== 'none', k: e && e.className, titel: e && e.title, lek: wielen() };
      // Rechtsonder in de hoek van de meter (30-09-2026), niet meer bovenaan.
      const kb = e.getBoundingClientRect(), mb = document.querySelector('.vis-meter').getBoundingClientRect();
      r.plek = { rechts: Math.round(mb.right - kb.right), onder: Math.round(mb.bottom - kb.bottom), boven: Math.round(kb.top - mb.top), h: Math.round(mb.height) };
      updPID('222A06', 2.33); PLVisueel.tik();
      r.ok = e.className; r.heel = wielen();
      r.groen = getComputedStyle(e.querySelector('.vbm-wiel')).fill;
      e.click();
      r.opent = document.getElementById('plBandenOv').style.display === 'flex';
      PLBanden.sluit();
      PLEigen.zet(null); PLVisueel.tik();
      r.weg = e.style.display === 'none';
      return r;
    })()`);
    toets('het lampje staat er, rood bij de lekke band, met de uitleg als titel', lamp.er && /danger/.test(lamp.k) && /voor rechts/.test(lamp.titel || ''), JSON.stringify(lamp));
    toets('het lampje staat rechtsonder bij de meter', lamp.plek && Math.abs(lamp.plek.rechts) <= 4 && lamp.plek.onder >= -4 && lamp.plek.boven > lamp.plek.h / 2, JSON.stringify(lamp.plek));
    toets('weer gelijk: het lampje wordt ok', /\bok\b/.test(lamp.ok), JSON.stringify(lamp));
    toets('erin het autootje (#371): bij de lekke band alleen voor rechts rood', lamp.lek === 'ok,danger,ok,ok', lamp.lek);
    toets('…en weer gelijk: vier groene wielen', lamp.heel === 'ok,ok,ok,ok' && /rgb\(\s*(6, 179, 107|31, 209, 137)\)/.test(lamp.groen), JSON.stringify({ w: lamp.heel, kleur: lamp.groen }));
    toets('tikken opent het bandenvenster', lamp.opent, JSON.stringify(lamp));
    toets('een auto zonder bandensensoren: geen lampje', lamp.weg, JSON.stringify(lamp));

    console.log('\n4. Een band zonder temperatuursensor (CX-5 zonder 222A0C, 07-10-2026)');
    const gat = await app.ev(`(async function(){
      const psi = '((A*1373)/1000)*0.145037738';
      const namen = { '222A05':'Bandenspanning voor-links', '222A06':'Bandenspanning voor-rechts', '222A07':'Bandenspanning achter-links', '222A08':'Bandenspanning achter-rechts',
                      '222A0A':'Bandtemperatuur voor-links', '222A0B':'Bandtemperatuur voor-rechts', '222A0D':'Bandtemperatuur achter-rechts' };
      PLEigen.zet(Object.keys(namen).map(c => ({ code: c, naam: namen[c], ecu: '720', formule: /Bandenspanning/.test(namen[c]) ? psi : 'A-50', eenheid: /Bandenspanning/.test(namen[c]) ? 'psi' : '°C' })), 'CX-5');
      [['222A05',2.39],['222A06',2.39],['222A07',2.53],['222A08',2.55],['222A0A',28],['222A0B',29],['222A0D',27]].forEach(x => updPID(x[0], x[1]));
      PLBanden.open();
      const ov = document.getElementById('plBandenOv');
      const al = ov.querySelector('.plb-tegel[data-pos="AL"] span');
      const r = { al: al ? al.textContent : null, gat: (ov.querySelector('.plb-gat') || {}).textContent || '' };
      PLBanden.sluit();
      return r;
    })()`);
    toets('achter links zegt dat de temperatuur ontbreekt, geen los "·"', gat.al && /^geen temp\. · \+\d+%$/.test(gat.al), JSON.stringify(gat));
    toets('en het venster zegt waar je hem toevoegt', /temperatuur achter links/.test(gat.gat) && /Mijn voertuigen/.test(gat.gat), JSON.stringify(gat));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-banden: alles goed' : '\nbproef-banden: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
