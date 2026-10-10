// ══════════════════════════════════════════════════════════════════
// bproef-foutcodes.js — het foutcodevenster in de echte app
// ──────────────────────────────────────────────────────────────────
// test-foutcodes.js toetst de parsers en de wispoort los. Wat daar niet te
// zien is, is de KOPPELING: dat de deur op het startscherm het venster
// opent, dat de uitlezing via de echte sendCmd → sendBT → _sendBTOnce
// loopt (met PLBus en de ELM-poort ertussen), en dat de wisknop in het
// venster zelf dicht blijft zolang de motor draait.
//
// De nep-adapter staat op het laagste punt (_sendBTOnce); alles erboven is
// de echte app. De antwoorden hebben de vorm die een MX+ met ATH0 geeft.
//
// Draaien vanuit public/:  node bproef-foutcodes.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const ECU = {
  '0101': '41 01 82 07 65 04',
  '03': '00A\r0: 43 03 01 71 04\r1: 20 03 00 00 00 00\r',
  '07': '47 01 01 33',
  '0A': '4A 01 04 20',
  '0131': '41 31 0B B8', '0130': '41 30 FF', '014E': '41 4E 00 3C', '0121': '41 21 00 2A',
  '020200': '42 02 00 01 71', '020500': '42 05 00 7B', '020C00': '42 0C 00 0C 80',
  '010C': '41 0C 0C 80',          // motor draait: 800 tpm
  '010D': '41 0D 00',
  '04': '44'
};

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

  try {
    console.log('\n── 1. de app start met de module, de check staat op het startscherm ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLFoutcodes staat er', await app.ev(`typeof PLFoutcodes === 'object'`));
    // Sinds 29-09-2026 is de deur de hoofdknop "Check mijn auto" geworden.
    toets('"Check mijn auto" is het eerste op het startscherm',
      await app.ev(`(function(){ const d=document.querySelector('#wmDoors button'); return !!d && d.id === 'plCheckBtn'; })()`));

    console.log('\n── 2. de knop opent het venster en leest uit via de echte keten ──');
    toets('nep-adapter staat aan', await app.nepAdapter(ECU) > 0);
    // De app leest een BARE binding (let connected in auth.js), niet
    // window.connected — die fout uit #186 maken we hier niet.
    await app.ev(`connected = true; demoMode = false; 'ok'`);
    await app.ev(`document.getElementById('plCheckBtn').click(); 'ok'`);
    toets('het venster staat open', await app.ev(`getComputedStyle(document.getElementById('plFcOv')).display === 'flex'`));
    const klaar = await wacht(`!!(PLFoutcodes.staat().scan && !PLFoutcodes.staat().bezig)`, 15000);
    toets('de uitlezing is afgerond', klaar);
    const tekst = await app.ev(`document.getElementById('plFcBody').textContent`);
    toets('bevestigd, multiframe: P0300 (de derde code) staat in beeld', /P0300/.test(tekst));
    toets('pending P0133 en permanent P0420 staan in beeld', /P0133/.test(tekst) && /P0420/.test(tekst));
    toets('het freeze frame hoort bij P0171', /Opgeslagen bij P0171/.test(tekst));
    toets('de keuringsstatus noemt EVAP niet klaar', /Verdampingssysteem \(EVAP\)/.test(tekst) && /niet klaar/.test(tekst));
    const log = await app.ev(`window._plNepLog.slice()`);
    toets('03, 07 en 0A gingen de bus op', ['03', '07', '0A'].every(c => log.indexOf(c) >= 0), log.join(','));

    console.log('\n── 3. de wisknop blijft dicht zolang de motor draait ──');
    await app.ev(`PLFoutcodes.naarWissen(); 'ok'`);
    const wis = await app.ev(`(function(){
      const b=document.getElementById('plFcWisKnop'); const t=document.getElementById('plFcBody').textContent;
      const v=document.getElementById('plFcAkkoord'); v.click();
      return { dicht: document.getElementById('plFcWisKnop').disabled, motor: /De motor draait/.test(t), verlies: /freeze frame van P0171/.test(t) };
    })()`);
    toets('het venster zegt wat er verloren gaat (freeze frame)', wis.verlies);
    toets('het venster zegt dat de motor draait', wis.motor);
    toets('ook met het vinkje aan blijft "Nu wissen" dicht', wis.dicht);
    toets('er is geen 04 verstuurd', (await app.ev(`window._plNepLog.indexOf('04')`)) < 0);

    console.log('\n── 4. motor uit: wissen, het antwoord lezen, opnieuw uitlezen ──');
    await app.nepAdapter(Object.assign({}, ECU, {
      '010C': '41 0C 00 00',
      '03': '43 00', '07': '47 00', '0101': '41 01 00 07 65 65', '0131': '41 31 00 00'
    }));
    await app.ev(`PLFoutcodes._terug(); PLFoutcodes.scan(); 'ok'`);
    await wacht(`!!(PLFoutcodes.staat().scan && !PLFoutcodes.staat().bezig)`, 15000);
    // De eerste uitlezing van de nieuwe tabel is al "na": zet de codes van
    // vóór terug zodat de voor/na-vergelijking iets te vergelijken heeft.
    await app.ev(`(function(){ const s=PLFoutcodes.staat().scan; s.codes.bevestigd=['P0171','P0420','P0300']; PLFoutcodes.naarWissen(); document.getElementById('plFcAkkoord').click(); })(); 'ok'`);
    toets('met motor uit gaat "Nu wissen" aan na het vinkje', await app.ev(`!document.getElementById('plFcWisKnop').disabled`));
    await app.ev(`document.getElementById('plFcWisKnop').click(); 'ok'`);
    await wacht(`PLFoutcodes.staat().fase === 'na'`, 15000);
    const na = await app.ev(`({ u: PLFoutcodes.staat().uitslag, t: document.getElementById('plFcBody').textContent, log: window._plNepLog.slice() })`);
    toets('04 is verstuurd', na.log.indexOf('04') >= 0);
    toets('het antwoord 44 is gelezen als bevestigd', na.u && na.u.staat === 'bevestigd', JSON.stringify(na.u));
    toets('na het wissen is opnieuw uitgelezen', na.log.lastIndexOf('03') > na.log.indexOf('04'));
    toets('de permanente P0420 staat als "blijft staan" in beeld', /Blijft staan \(permanent\): P0420/.test(na.t));

    console.log('\n── 5. tegenproef: een ECU die weigert ──');
    await app.nepAdapter(Object.assign({}, ECU, { '010C': '41 0C 00 00', '04': '7F 04 22' }));
    await app.ev(`PLFoutcodes._terug(); PLFoutcodes.scan(); 'ok'`);
    await wacht(`!!(PLFoutcodes.staat().scan && !PLFoutcodes.staat().bezig)`, 15000);
    await app.ev(`PLFoutcodes.naarWissen(); document.getElementById('plFcAkkoord').click(); document.getElementById('plFcWisKnop').click(); 'ok'`);
    await wacht(`PLFoutcodes.staat().fase === 'na'`, 15000);
    const nee = await app.ev(`({ u: PLFoutcodes.staat().uitslag, t: document.getElementById('plFcBody').textContent })`);
    toets('7F 04 22 wordt "niet gewist", met de reden', nee.u && nee.u.staat === 'geweigerd' && /Niet gewist/.test(nee.t) && /motor/.test(nee.t), JSON.stringify(nee.u));
    toets('de codes staan er na de weigering nog', /P0171/.test(nee.t));

    console.log('\n── 6. de terugknop sluit het venster ──');
    await app.ev(`PLFoutcodes._terug(); appBack(); 'ok'`);
    toets('het venster is dicht', await app.ev(`getComputedStyle(document.getElementById('plFcOv')).display === 'none'`));
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));

    // Na het verbinden opent de check vanzelf (PLNav.naVerbinding). Is er
    // niets te zien, dan loopt een balk leeg en gaat de app door naar Slim
    // visueel; de readinesslijst is geen landingsscherm (01-10-2026).
    console.log('\n── 7. na het verbinden: niets gevonden → vanzelf naar Live ──');
    const SCHOON = { '0101': '41 01 00 07 65 00', '03': '43 00', '07': '47 00', '0A': '4A 00', '010C': '41 0C 00 00', '010D': '41 0D 00' };
    await app.nepAdapter(SCHOON);
    await app.ev(`setPidView('overzicht'); PLFoutcodes.staat().scan = null; if (!PLNav.autoCheck()) PLNav.wisselAutoCheck(); PLNav.naVerbinding(); 'ok'`);
    toets('de balk staat er na de uitlezing', await wacht(`!!document.querySelector('#plFcOv .fc-door')`, 15000));
    toets('het oordeel is groen', await app.ev(`!!document.querySelector('#plFcOv .fc-oordeel.groen')`));
    toets('na het aftellen is het venster dicht', await wacht(`getComputedStyle(document.getElementById('plFcOv')).display === 'none'`, 8000));
    toets('en staat Live open in Slim visueel', await app.ev(`pidViewMode === 'visueel' && document.getElementById('welcomeScreen').classList.contains('hidden')`),
      await app.ev(`pidViewMode`));

    console.log('\n── 8. aanraken = blijven; codes = geen balk; zelf geopend en groen = terug naar het hoofdscherm ──');
    await app.ev(`setPidView('overzicht'); PLFoutcodes.staat().scan = null; PLFoutcodes.open({ auto: true }); 'ok'`);
    await wacht(`!!document.querySelector('#plFcOv .fc-door')`, 15000);
    await app.ev(`document.querySelector('#plFcOv .fc-oordeel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 'ok'`);
    toets('een tik in het venster haalt de balk weg', await app.ev(`!document.querySelector('#plFcOv .fc-door')`));
    await new Promise(r => setTimeout(r, 6000));
    toets('en het venster blijft staan', await app.ev(`getComputedStyle(document.getElementById('plFcOv')).display === 'flex' && pidViewMode === 'overzicht'`));

    // Sinds 10-10-2026 loopt de balk ook als je zelf tikt, maar terug naar
    // het hoofdscherm in plaats van door naar Live.
    await app.ev(`PLFoutcodes.sluit(); setPidView('overzicht'); PLFoutcodes.staat().scan = null; PLFoutcodes.open(); 'ok'`);
    toets('zelf op Check mijn auto getikt, groen → de balk naar het hoofdscherm', await wacht(`/hoofdscherm/.test((document.querySelector('#plFcOv .fc-door')||{}).textContent||'')`, 15000));
    toets('na het aftellen is het venster dicht', await wacht(`getComputedStyle(document.getElementById('plFcOv')).display === 'none'`, 8000));
    toets('en staat het hoofdscherm open, niet Live', await app.ev(`!document.getElementById('welcomeScreen').classList.contains('hidden') && pidViewMode === 'overzicht'`),
      await app.ev(`pidViewMode + ' / welkom verborgen: ' + document.getElementById('welcomeScreen').classList.contains('hidden')`));

    await app.nepAdapter(ECU);
    await app.ev(`PLFoutcodes.sluit(); PLFoutcodes.staat().scan = null; PLFoutcodes.open({ auto: true }); 'ok'`);
    await wacht(`!!(PLFoutcodes.staat().scan && !PLFoutcodes.staat().bezig)`, 15000);
    toets('codes gevonden → geen balk, het venster blijft', await app.ev(`!document.querySelector('#plFcOv .fc-door') && getComputedStyle(document.getElementById('plFcOv')).display === 'flex'`));
    await app.ev(`PLFoutcodes.sluit(); 'ok'`);
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-foutcodes: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-foutcodes: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-foutcodes brak af: ' + e.message); process.exit(1); });
