// ══════════════════════════════════════════════════════════════════
// bproef-beheerpagina.js — admin/beheer.html start en tekent echt
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// De beheerpagina is één bestand met acht schermen die allemaal pas iets doen
// nadat er gegevens binnen zijn. In node valt daar niets van te toetsen: er is
// geen DOM, geen localStorage en geen fetch. Tot nu toe was "hij doet het" dus
// letterlijk: openen en kijken. Dat is precies de vorm waarin #95 maandenlang
// onopgemerkt bleef — een scherm dat er goed uitziet tot je het opmeet.
//
// De oefenmodus maakt dit toetsbaar zonder Worker en zonder token: alle
// antwoorden komen uit voorbeeldgegevens in de pagina zelf, en callWorker()
// gaat er niet langs. Wat hier gemeten wordt is dus de KOPPELING — starten,
// tabbladen, lijsten tekenen, de logvisualisatie, en de grendels op de
// tabellenbrowser — en niet of Airtable meewerkt.
//
// DE TEGENPROEVEN DIE ERIN ZITTEN
//   • Deel 4: het masker. PassHash mag in de tabellenbrowser niet als
//     bewerkbaar veld verschijnen. Zou hij dat wel doen, dan is de grendel in
//     de Worker het enige dat een onbruikbare hash tegenhoudt — en dan merkt
//     niemand het tot er iemand niet meer kan inloggen.
//   • Deel 5: de statuskaart zegt in oefenmodus "niet gemeten" en geen groene
//     vink. Een groene vink zou een werkende keten suggereren die niet is
//     aangeraakt.
//   • Deel 6: geen enkele uitzondering tijdens de hele rit.
//
// Draaien vanuit public/:  node bproef-beheerpagina.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname, '..'), pagina: '/admin/beheer.html',
                           breedte: 1100, hoogte: 900, rustMs: 800 });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  OVERGESLAGEN — geen Chromium. Er is niets gemeten.');
      process.exit(0);
    }
    throw e;
  }

  try {
    // ── 1. de poort ─────────────────────────────────────────────
    console.log('\n1. De pagina start op de toegangspoort');
    toets('de poort staat er', await app.ev('!!document.getElementById("gate") && !document.getElementById("gate").classList.contains("hidden")'));
    toets('het dashboard is nog verborgen', await app.ev('document.getElementById("app").classList.contains("hidden")'));
    toets('er is geen token nodig om te oefenen', await app.ev('typeof oefenStart === "function"'));

    // ── 2. oefenmodus opent alle schermen ───────────────────────
    console.log('\n2. Oefenmodus opent het dashboard');
    await app.ev('oefenStart()');
    await rust(900);
    toets('het dashboard staat open', await app.ev('!document.getElementById("app").classList.contains("hidden")'));
    toets('de oefenbalk is zichtbaar en niet weg te klikken zonder herladen',
      await app.ev('!document.getElementById("oefenBalk").classList.contains("hidden")'));
    const tabs = await app.ev('document.querySelectorAll("#tabs .tab").length');
    toets('alle acht tabbladen staan er', tabs === 8, 'gevonden: ' + tabs);
    const kpi = await app.ev('document.querySelectorAll("#kpiGrid .kpi").length');
    toets('de kerncijfers zijn getekend', kpi === 8, 'gevonden: ' + kpi);

    // ── 3. klanten ──────────────────────────────────────────────
    console.log('\n3. De klantenlijst komt uit de voorbeelden');
    const klanten = await app.ev('document.querySelectorAll("#kLijst .klantrij").length');
    toets('vijf voorbeeldklanten in beeld', klanten === 5, 'gevonden: ' + klanten);
    toets('de geblokkeerde klant is als zodanig gemerkt',
      await app.ev('/geblokkeerd/.test(document.getElementById("kLijst").textContent)'));
    // Aanmaken loopt door dezelfde weg als bij een echte Worker.
    await app.ev('document.getElementById("nkEmail").value="proef@voorbeeld.nl";' +
                 'document.getElementById("nkSaldo").value="25";klantAanmaken()');
    await rust(700);
    const na = await app.ev('KLANTEN_CACHE.length');
    toets('een aangemaakte klant komt in de lijst', na === 6, 'lijst telt nu ' + na);
    toets('met het opgegeven beginsaldo',
      await app.ev('(KLANTEN_CACHE.find(k=>k.email==="proef@voorbeeld.nl")||{}).saldo') === 25);
    toets('en er staat een auditregel bij',
      await app.ev('/aangemaakt door beheerder/.test((KLANTEN_CACHE.find(k=>k.email==="proef@voorbeeld.nl")||{}).audit||"")'));

    // ── 4. het logboek en zijn grafieken ────────────────────────
    console.log('\n4. Het logboek wordt opgehaald en uitgetekend');
    await app.ev('toon("logboek");logLaden()');
    await rust(900);
    const regels = await app.ev('LOG_RIJEN.length');
    toets('er zijn regels opgehaald', regels > 0, 'regels: ' + regels);
    const staven = await app.ev('document.querySelectorAll("#lgPerDag .staaf").length');
    toets('de dagstaven zijn getekend (14 dagen, ook de lege)', staven === 14, 'staven: ' + staven);
    toets('de staven hebben een hoogte in procenten',
      await app.ev('[].every.call(document.querySelectorAll("#lgPerDag .staaf"),e=>/%$/.test(e.style.height))'));
    toets('de typeverdeling staat er', await app.ev('document.querySelectorAll("#lgPerType .balk").length') > 0);
    toets('de tabel toont dezelfde regels',
      await app.ev('document.querySelectorAll("#lgTabel tbody tr").length') === regels,
      'rijen in de tabel wijken af van LOG_RIJEN');
    // Een typefilter moet de tabel én de grafiek meenemen; alleen de tabel
    // filteren zou een grafiek opleveren die iets anders vertelt dan de lijst
    // eronder — en dat is precies waar iemand een verkeerde conclusie trekt.
    const eersteType = await app.ev('LOG_RIJEN[0].fields.Type');
    await app.ev('document.getElementById("lgType").value=' + JSON.stringify(eersteType) + ';logTeken()');
    await rust(200);
    const gefilterd = await app.ev('document.querySelectorAll("#lgTabel tbody tr").length');
    toets('filteren op type beperkt de tabel', gefilterd > 0 && gefilterd <= regels, 'na filter: ' + gefilterd);
    toets('en de grafiek telt hetzelfde aantal',
      await app.ev('logZichtbaar().length') === gefilterd);
    await app.ev('document.getElementById("lgType").value="";logTeken()');

    // ── 5. de tabellenbrowser en zijn grendels ──────────────────
    console.log('\n5. De tabellenbrowser schermt af wat afgeschermd hoort');
    await app.ev('toon("tabellen");document.getElementById("tbBron").value="klanten";tbBronGewisseld();' +
                 'document.getElementById("tbBron").value="klanten";tbLaden(true)');
    await rust(800);
    toets('er staan records in de tabel', await app.ev('TB.records.length') > 0);
    toets('Saldo staat als beschermd bekend', await app.ev('TB.beschermd.indexOf("Saldo")>=0'),
      await app.ev('JSON.stringify(TB.beschermd)'));
    toets('de kolomkop draagt het slotje', await app.ev('/Saldo 🔒/.test(document.getElementById("tbTabel").innerHTML)'));
    // TEGENPROEF: een beschermd veld mag niet bewerkbaar in het detail staan.
    await app.ev('tbOpen(TB.records[0].id)');
    await rust(300);
    toets('het detailpaneel is open', await app.ev('!document.getElementById("tbDetailKaart").classList.contains("hidden")'));
    toets('Saldo staat op alleen-lezen', await app.ev('!!(document.getElementById("tbv_Saldo")||{}).readOnly'),
      'het veld is bewerkbaar — dan is de Worker het enige dat het tegenhoudt');
    toets('PassHash ook', await app.ev('!!(document.getElementById("tbv_PassHash")||{}).readOnly'));
    toets('en de hash zelf staat er niet in',
      await app.ev('!/\\$2|hash\\$|[a-f0-9]{40}/.test((document.getElementById("tbv_PassHash")||{}).value||"")'));
    toets('een gewoon veld is wél bewerkbaar', await app.ev('!(document.getElementById("tbv_Naam")||{readOnly:true}).readOnly'));
    // AppConfig is alleen-lezen; dat moet je in het scherm kunnen zien.
    await app.ev('document.getElementById("tbBron").value="config";tbBronGewisseld();tbLaden(true)');
    await rust(700);
    toets('AppConfig meldt zich als alleen-lezen', await app.ev('TB.schrijven') === false);

    // ── 6. de statuskaart liegt niet in oefenmodus ──────────────
    console.log('\n6. In oefenmodus staat er geen groene vink');
    const stat = await app.ev('document.getElementById("st_worker").textContent');
    toets('de status zegt "niet gemeten"', stat === 'niet gemeten', 'er staat: ' + stat);

    // ── 7. geen enkele uitzondering onderweg ────────────────────
    console.log('\n7. Wat de browser onderweg meldde');
    toets('geen uitzonderingen', app.fouten.length === 0, app.fouten.join(' | '));
    toets('geen onverwachte dialogen', app.dialogen.length === 0, app.dialogen.join(' | '));
    const gemist = app.gemist.filter(p => !/favicon/.test(p));
    toets('geen ontbrekende bestanden', gemist.length === 0, gemist.join(', '));

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('\nAFGEBROKEN: ' + (e && e.message || e)); process.exit(1); });
