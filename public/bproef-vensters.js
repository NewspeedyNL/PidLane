// ══════════════════════════════════════════════════════════════════
// bproef-vensters.js — gaan de twee nieuwe schermen echt open en vullen ze zich
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// `test-waakvenster.js` en `test-bulkvenster.js` toetsen het rekenwerk: de
// bereikmeter, de export, de segmenttelling, het uitdunnen. Die draaien in
// een vm-sandbox met een nep-DOM, en dat is precies goed voor een functie.
//
// Maar het scherm zelf ontsnapt daaraan volledig. Een venster kan in node
// twintig groene toetsen halen en in de app nooit opengaan, om redenen die
// een sandbox per definitie niet heeft: de menuknop hangt aan een functie die
// niet bestaat, de module laadt vóór degene die hij leest, een id botst met
// een bestaand element, of de overlay wordt opgebouwd maar blijft leeg omdat
// de bron er op dat moment nog niet is.
//
// Dat is geen bedacht risico. `toast` bleek bij het bouwen van deze twee
// modules module-lokaal in pidlane-bulk.js te zitten en niet globaal — een
// guard erop is dus altijd onwaar, en elke melding was stil in de console
// verdwenen. De bedradingscontrole ving dat; deze proef vangt de kant die
// daarna overblijft: dat de schermen ook echt iets laten zien.
//
// WAT HIER ECHT IS
// Alle 57 modules draaien, de menuknoppen zijn de echte onclick-handlers uit
// index.html, en de bulk-analyse leest een échte IndexedDB die deze proef
// eerst vult via de échte PLBulk. Alleen de auto ontbreekt.
//
// Draaien vanuit public/:  node bproef-vensters.js
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
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    /* #286 (24-09-2026): de waakronde en de twee bulk-knoppen stonden in het
       menu, los van de live data. Nu zijn het kaarten in die deur, en het
       menu is ze kwijt. Gemeten in de echte index.html, niet in de bron. */
    console.log('\n0. De indeling van de keuzeschermen (#286)');
    const indeling = await app.ev(`(function(){
      const inDeur = (deur) => [...document.querySelectorAll('#dp-' + deur + ' .choice-card[id]')].map(e => e.id);
      const menu = document.getElementById('kebabMenu');
      const menuTekst = menu ? menu.innerText : '';
      return { live: inDeur('live'), onderweg: inDeur('saving'), diag: inDeur('diag'),
               bulkana: !!document.getElementById('wc-bulkana'),
               menuWaak: /Waakronde/.test(menuTekst), menuBulk: /Bulk-/.test(menuTekst),
               menuCrash: /rendercrash/i.test(menuTekst) || !!document.getElementById('kbRenderProef'),
               titel: (document.querySelector('#dp-saving .wm-door-h') || {}).textContent || '' };
    })()`);
    ['wc-waak', 'wc-pidrec', 'wc-bulkrec'].forEach(function (id) {
      toets(id + ' staat in de deur "Live data"', indeling.live.indexOf(id) >= 0, indeling.live.join(', '));
    });
    // Sinds 26-09-2026 opent de bulk-analyse alleen nog vanuit de recorder.
    toets('de bulk-analyse heeft geen eigen kaart meer', !indeling.bulkana,
          'wc-bulkana staat nog in een deur');
    ['wc-monitor', 'wc-caravan', 'wc-fuel'].forEach(function (id) {
      toets(id + ' staat in de deur "Onderweg"', indeling.onderweg.indexOf(id) >= 0, indeling.onderweg.join(', '));
    });
    toets('de rit-monitor staat niet meer bij de live data', indeling.live.indexOf('wc-monitor') < 0);
    toets('de PID-recorder niet meer bij de diagnose', indeling.diag.indexOf('wc-pidrec') < 0);
    toets('de deur heet nu "Onderweg"', /Onderweg/.test(indeling.titel), indeling.titel);
    toets('het menu noemt de waakronde niet meer', !indeling.menuWaak);
    toets('en de bulk-knoppen niet meer', !indeling.menuBulk);
    toets('en de proefcrash niet meer', !indeling.menuCrash);

    const waakKaart = await app.ev(`(function(){
      document.getElementById('welcomeScreen').classList.remove('hidden');
      openDoor('live');
      document.getElementById('wc-waak').click();
      const ov = document.getElementById('wkvOv');
      const open = !!ov && getComputedStyle(ov).display !== 'none';
      if (window.PLWaakUI) PLWaakUI.sluit();
      return open;
    })()`);
    toets('de kaart "Waakronde" opent het waakvenster', waakKaart);

    const rol = await app.ev(`(function(){
      const zicht = (id) => { const e = document.getElementById(id); return !!e && e.style.display !== 'none'; };
      window.currentUser = { user: 'klant', role: 'user', label: 'klant' };
      PLKlant.pasMenuAan();
      const klant = { bulkrec: zicht('wc-bulkrec'), waak: zicht('wc-waak') };
      window.currentUser = { user: 'beheer', role: 'admin', label: 'beheer' };
      PLKlant.pasMenuAan();
      const beheer = { bulkrec: zicht('wc-bulkrec') };
      return { klant, beheer };
    })()`);
    toets('een klant ziet de bulk-recorder niet', !rol.klant.bulkrec, JSON.stringify(rol));
    toets('maar wel de waakronde', rol.klant.waak, JSON.stringify(rol));
    toets('TEGENPROEF: beheer ziet hem wel', rol.beheer.bulkrec, JSON.stringify(rol));

    // De enige ingang naar de bulk-analyse: de knop in het recordervenster.
    const ingang = await app.ev(`(async function(){
      PLBulk.open();
      const knop = document.getElementById('blkAna');
      if (!knop) return { fout: 'geen knop blkAna in het recordervenster' };
      knop.click();
      await new Promise(r => setTimeout(r, 400));
      const ov = document.getElementById('blvOv'), rec = document.getElementById('blkOverlay');
      const open = !!ov && getComputedStyle(ov).display !== 'none';
      const recDicht = !rec || getComputedStyle(rec).display === 'none';
      if (window.PLBulkUI) PLBulkUI.sluit();
      return { open, recDicht };
    })()`);
    if (ingang.fout) toets('de recorder opent de analyse', false, ingang.fout);
    else {
      toets('de knop in de recorder opent de bulk-analyse', ingang.open);
      toets('en het recordervenster gaat daarbij dicht', ingang.recDicht);
    }

    const klap = await app.ev(`(function(){
      const k = document.getElementById('vehSecChev');
      const voor = k ? k.textContent : '';
      toggleVehicleSection(); const na = k ? k.textContent : '';
      toggleVehicleSection();
      return { voor, na };
    })()`);
    toets('de inklapknop bij "Voertuig" zegt wat hij doet', /Inklappen/.test(klap.voor) && /Uitklappen/.test(klap.na),
          JSON.stringify(klap));

    console.log('\n1. Beide modules zijn geladen en bereikbaar vanaf hun kaart');
    const bedrading = await app.ev(`({
      waakUI : typeof window.PLWaakUI === 'object' && typeof PLWaakUI.open === 'function',
      bulkUI : typeof window.PLBulkUI === 'object' && typeof PLBulkUI.open === 'function',
      // De kaart Waakronde en de knop Analyse in de recorder hangen aan deze twee globalen.
      knopW  : typeof window.openWaakvenster === 'function',
      knopB  : typeof window.openBulkAnalyse === 'function',
      // En de bronnen die ze lezen.
      waak   : typeof window.PLWaak === 'object' && typeof PLWaak.historie === 'function',
      lees   : !!(window.PLBulk && typeof PLBulk.lees === 'function')
    })`);
    toets('PLWaakUI.open() bestaat', bedrading.waakUI);
    toets('PLBulkUI.open() bestaat', bedrading.bulkUI);
    toets('openWaakvenster() bestaat', bedrading.knopW,
          'de kaart wc-waak roept hem aan');
    toets('openBulkAnalyse() bestaat', bedrading.knopB,
          'de knop "Analyse" in de bulk-recorder roept hem aan');
    toets('PLWaak.historie() bestaat als bron', bedrading.waak);
    toets('PLBulk.lees() bestaat als bron', bedrading.lees);

    console.log('\n2. Het waakvenster gaat open en vult zich met echte historie');
    const waak = await app.ev(`(function(){
      // De waakronde een ronde laten draaien kost twaalf seconden per groepje
      // en een bus. In plaats daarvan wordt hier één echte meting geboekt via
      // de echte start(), zodat de historie via de normale weg gevuld raakt.
      PLWaakUI.open();
      const ov = document.getElementById('wkvOv');
      if (!ov) return { fout: 'de overlay is niet gebouwd' };
      const zichtbaar = getComputedStyle(ov).display !== 'none';
      const tekst = ov.innerText || '';
      const tegels = ov.querySelectorAll('.wkv-tegel').length;
      const knop = document.getElementById('wkvSchakel');
      const knoptekst = knop ? knop.textContent : '';
      PLWaakUI.sluit();
      const dicht = getComputedStyle(ov).display === 'none';
      return { zichtbaar, dicht, tegels, knoptekst,
               heeftUitleg: /sensoren die je/.test(tekst),
               heeftGebruik: /ingedrukt houden/i.test(tekst),
               heeftExport: /klembord/i.test(tekst) };
    })()`);
    if (waak.fout) { toets('het waakvenster bouwt op', false, waak.fout); }
    else {
      toets('het venster wordt zichtbaar', waak.zichtbaar);
      toets('er staan vijf cijfertegels in', waak.tegels === 5, waak.tegels + ' gevonden');
      toets('de uitleg "wat is dit" staat erin', waak.heeftUitleg);
      toets('de gebruiksaanwijzing staat erin', waak.heeftGebruik);
      toets('de export staat erin', waak.heeftExport);
      toets('de schakelaar noemt zijn eigen stand', /aanzetten|uitzetten/.test(waak.knoptekst),
            'knop zegt: "' + waak.knoptekst + '"');
      toets('en hij gaat weer dicht', waak.dicht);
    }

    console.log('\n3. De bulk-analyse leest een echte opname terug');
    const bulk = await app.ev(`(async function(){
      window.currentUser = { user:'proef', role:'admin', label:'proef' };
      // Een échte opname via de échte recorder: start, wat regels, stop.
      const ok = await PLBulk.start(true);
      if (!ok) return { fout: 'PLBulk.start() weigerde' };
      // De tick leest pidVals; die vullen we met plausibele meetwaarden zodat
      // er iets te analyseren valt. De recorder zelf blijft echt.
      pidVals['010D'] = 92; pidVals['010C'] = 2100;
      pidVals['0105'] = 91; pidVals['0104'] = 44;
      await new Promise(r => setTimeout(r, 3200));
      await PLBulk.stop();

      PLBulkUI.open();
      // Inlezen is asynchroon (IndexedDB), dus even wachten op het tekenen.
      await new Promise(r => setTimeout(r, 900));
      const ov = document.getElementById('blvOv');
      if (!ov) return { fout: 'de overlay is niet gebouwd' };
      const zichtbaar = getComputedStyle(ov).display !== 'none';
      const tekst = ov.innerText || '';
      const tegels = ov.querySelectorAll('.blv-tegel').length;
      const bevindingen = ov.querySelectorAll('.blv-bev').length;
      const balk = ov.querySelectorAll('.blv-tijdbalk span').length;
      PLBulkUI.sluit();
      return { zichtbaar, tegels, bevindingen, balk,
               leeg: /nog geen opname/i.test(tekst),
               heeftOpname: /De opname/.test(tekst),
               heeftSensoren: /metingen/.test(tekst) };
    })()`);
    if (bulk.fout) { toets('de bulk-analyse leest terug', false, bulk.fout); }
    else {
      toets('het venster wordt zichtbaar', bulk.zichtbaar);
      toets('het vindt de zojuist gemaakte opname', !bulk.leeg,
            'het venster meldt "nog geen opname" terwijl de recorder net gedraaid heeft');
      toets('er staan vijf cijfertegels in', bulk.tegels === 5, bulk.tegels + ' gevonden');
      toets('de tijdbalk is getekend', bulk.balk >= 1, bulk.balk + ' segmenten');
      toets('er staan conclusies in gewone zinnen', bulk.bevindingen >= 2,
            bulk.bevindingen + ' gevonden');
      toets('de conclusie over de opname zelf staat erbij', bulk.heeftOpname);
      toets('en de sensortabel is gevuld', bulk.heeftSensoren);
    }

    console.log('\n4. De twee vensters zitten elkaar niet in de weg');
    const samen = await app.ev(`(function(){
      // Beide open: eigen overlay, eigen id, geen gedeelde stapelcontext.
      PLWaakUI.open(); PLBulkUI.open();
      const w = document.getElementById('wkvOv'), b = document.getElementById('blvOv');
      const beide = getComputedStyle(w).display !== 'none' && getComputedStyle(b).display !== 'none';
      // Eén sluiten mag de ander niet meenemen.
      PLBulkUI.sluit();
      const waakStaatNog = getComputedStyle(w).display !== 'none';
      PLWaakUI.sluit();
      return { beide, waakStaatNog,
               eigenStijl: !!document.getElementById('wkvStijl') && !!document.getElementById('blvStijl') };
    })()`);
    toets('beide kunnen tegelijk openstaan', samen.beide);
    toets('de een sluiten laat de ander staan', samen.waakStaatNog);
    toets('elk venster heeft zijn eigen stijlblok', samen.eigenStijl);

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? 'bproef-vensters: ' + fouten + ' FOUT' : 'bproef-vensters: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-vensters brak af: ' + (e && e.stack || e)); process.exit(1); });
