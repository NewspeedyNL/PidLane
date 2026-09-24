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
    toets('alle tien tabbladen staan er', tabs === 10, 'gevonden: ' + tabs);
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

    // ── 6. opslaan van instellingen komt echt aan ───────────────
    // #146: saveAll() stuurde een plat object terwijl /api/config POST
    // items:[{Key,Value}] verwacht en anders "no_items" geeft. De oefen-nep is
    // nu net zo streng, dus deze rondgang wordt rood zodra de body-vorm afwijkt
    // — of saveAll nu plat stuurt, óf de nep een plat object zou mergen.
    console.log('\n6. Opslaan van instellingen landt in de config');
    await app.ev('toon("instellingen");loadConfig()');
    await rust(500);
    // Een functieschakelaar omzetten en een tekstveld invullen, dan bewaren.
    const nieuw = await app.ev('var e=document.getElementById("t_feat_demo");e.checked=!e.checked;String(e.checked)');
    await app.ev('document.getElementById("banner_text").value="proefbanner 146"');
    await app.ev('saveAll()');
    await rust(500);
    // In oefenmodus is OEFEN_DATA.config het enige eerlijke signaal: callWorker
    // gooit hier niet op ok:false, dus saveMsg toont sowieso "opgeslagen". Wat
    // wél onderscheidt is of de sleutels echt aankwamen — dat kan alleen als de
    // body items:[{Key,Value}] droeg én de nep die vorm eist.
    const bewaardeSchakelaar = await app.ev('String(OEFEN_DATA.config.feat_demo)');
    toets('een omgezette schakelaar landt in de config', bewaardeSchakelaar === nieuw,
      'schakelaar staat op ' + nieuw + ', config op ' + bewaardeSchakelaar + ' — saveAll stuurde vermoedelijk geen items:[...]');
    toets('ook een tekstveld gaat mee', await app.ev('OEFEN_DATA.config.banner_text') === 'proefbanner 146',
      'config.banner_text: ' + await app.ev('JSON.stringify(OEFEN_DATA.config.banner_text)'));

    // ── 7. de database als geheel ───────────────────────────────
    // Het overzicht wordt bij de start al geteld. De oefenregels hebben met
    // opzet één regel in het vangnet en twee actieve opdrachten; allebei
    // moeten ze als waarschuwing in beeld komen, want live zijn het precies
    // de dingen die niemand opmerkt tot er een rit mee verloren is.
    console.log('\n7. Het databasetabblad telt, toont ritten en bevraagt');
    await app.ev('toon("database")');
    await rust(900);
    toets('het overzicht is geteld', await app.ev('!!(DB.overzicht && DB.overzicht.log)'));
    toets('acht kerncijfers', await app.ev('document.querySelectorAll("#dbKpi .kpi").length') === 8);
    toets('de dagreeks heeft een staaf per dag, ook voor lege dagen',
      await app.ev('document.querySelectorAll("#dbPerDag .staaf").length') === 30,
      'gevonden: ' + await app.ev('document.querySelectorAll("#dbPerDag .staaf").length'));
    toets('het vangnet `onbekend` staat als waarschuwing in beeld',
      await app.ev('/onbekend/.test(document.getElementById("dbWaarschuwing").textContent)'));
    toets('twee actieve opdrachten staan als rode balk in beeld',
      await app.ev('/2 meetopdrachten/.test(document.getElementById("dbWaarschuwing").textContent)'));
    toets('de tabellenlijst komt uit het antwoord',
      await app.ev('document.querySelectorAll("#dbTabellen tbody tr").length') === 4);
    // De overzichtskaart op de startpagina rekent nu met de database.
    toets('de kerncijfers op het overzicht tellen de database',
      await app.ev('/in de database/.test(document.getElementById("kpiGrid").textContent)'));

    await rust(500);
    const ritten = await app.ev('RITTEN.length');
    toets('de recente ritten zijn opgehaald', ritten > 0, 'gevonden: ' + ritten);
    await app.ev('ritOpen(RITTEN[0].SessionId)');
    await rust(500);
    const ritRegels = await app.ev('DB.ritRijen.length');
    toets('een rit opent met al zijn regels', ritRegels > 0 &&
      await app.ev('document.querySelectorAll("#ritTabel tbody tr").length') === ritRegels);
    toets('alleen regels van die rit', await app.ev('DB.ritRijen.every(r => r.SessionId === DB.ritId)'));
    toets('in ontvangstvolgorde', await app.ev('DB.ritRijen.every((r,i,a) => !i || a[i-1].ontvangen <= r.ontvangen)'));
    await app.ev('document.getElementById("ritFilter").value="bevinding";ritTeken()');
    toets('het filter op bevindingen toont alleen FOUT, LET OP, BUG en uitkomsten',
      await app.ev('Array.from(document.querySelectorAll("#ritTabel tbody tr td:nth-child(3)")).every(td => /FOUT|LET OP|BUG|UITKOMST/.test(td.textContent)) || /Niets/.test(document.getElementById("ritTabel").textContent)'));
    // "Deze rit opruimen" wist niets: hij vult de voorwaarde in en laat je
    // eerst tellen. Zou hij zelf wissen, dan stond er een dialoog.
    const dialogenVoor = app.dialogen.length;
    await app.ev('ritOpruimen()');
    await rust(300);
    toets('opruimen vanuit de rit vult alleen de voorwaarde in',
      await app.ev('TAB === "tabellen" && document.getElementById("opSessie").value === DB.ritId && document.getElementById("opWis").disabled'));
    toets('en vraagt nog niets', app.dialogen.length === dialogenVoor, app.dialogen.slice(dialogenVoor).join(' | '));

    // TEGENPROEF op eerlijkheid: in oefenmodus draait er geen SQL, en dat
    // moet in beeld staan. Een tabel zonder die zin zou lezen als het
    // antwoord op je vraag.
    await app.ev('toon("database");sqlZet(SQL_VOORBEELDEN.ritfout[1]);sqlUitvoeren()');
    await rust(500);
    toets('de console zegt dat de vraag in oefenmodus niet is uitgevoerd',
      await app.ev('/NIET uitgevoerd/.test(document.getElementById("sqlMsg").textContent)'),
      'er staat: ' + await app.ev('document.getElementById("sqlMsg").textContent'));
    toets('en tekent de voorbeeldrijen', await app.ev('document.querySelectorAll("#sqlUit tbody tr").length') > 0);

    // ── 8. meetopdrachten ───────────────────────────────────────
    console.log('\n8. Meetopdrachten keuren met de echte keurder en er staat er één aan');
    await app.ev('toon("opdrachten")');
    await rust(700);
    toets('de keurder uit public/ is geladen', await app.ev('!!keurder() && !!window.ALL_PID_DEFS'));
    toets('alle drie de opdrachten staan er', await app.ev('document.querySelectorAll("#opdLijst .klantrij").length') === 3);
    toets('twee aan geeft een rode balk', await app.ev('/Er staan 2/.test(document.getElementById("opdWaarschuwing").textContent)'));
    toets('de opdracht met een onbekende sleutel keurt niet',
      await app.ev('opdKeur(OPD.rijen.find(o => o.id === "2").Opdracht).ok') === false);
    toets('en de goede wel', await app.ev('opdKeur(OPD.rijen.find(o => o.id === "3").Opdracht).ok') === true);
    // TEGENPROEF: een afgekeurde opdracht activeren wordt geweigerd, met
    // precies één melding — en er verandert niets.
    const voorA = app.dialogen.length;
    await app.ev('opdActiveer("2")');
    await rust(400);
    toets('activeren van een afgekeurde opdracht wordt geweigerd',
      app.dialogen.length === voorA + 1 && /Niet geactiveerd/.test(app.dialogen[voorA] || ''), app.dialogen.slice(voorA).join(' | '));
    toets('en er staan er nog steeds twee aan',
      await app.ev('OEFEN_DATA.opdracht.filter(o => o.fields.Actief === 1).length') === 2);
    app.dialogen.splice(voorA);
    // En de goede activeren zet de rest uit: één bevestiging, daarna één aan.
    const voorB = app.dialogen.length;
    await app.ev('opdActiveer("1")');
    await rust(700);
    toets('activeren vraagt één bevestiging en noemt wat er uitgaat',
      app.dialogen.length === voorB + 1 && /zet uit/.test(app.dialogen[voorB] || ''), app.dialogen.slice(voorB).join(' | '));
    app.dialogen.splice(voorB);
    toets('daarna staat er precies één aan, en het is deze',
      await app.ev('JSON.stringify(OEFEN_DATA.opdracht.filter(o => o.fields.Actief === 1).map(o => o.id))') === '["1"]');
    toets('de rode balk is weg', await app.ev('!/Er staan/.test(document.getElementById("opdWaarschuwing").textContent)'));
    // Het sjabloon hoort te keuren — anders begint elke nieuwe opdracht rood.
    await app.ev('opdNieuw()');
    await rust(200);
    toets('een nieuwe opdracht begint met een sjabloon dat keurt',
      await app.ev('/Keurt/.test(document.getElementById("opdKeuring").textContent)'),
      await app.ev('document.getElementById("opdKeuring").textContent'));
    await app.ev('document.getElementById("opdNaam").value="proef bproef";opdOpslaan(true)');
    await rust(700);
    toets('opslaan en activeren maakt hem aan en zet de vorige uit',
      await app.ev('JSON.stringify(OEFEN_DATA.opdracht.filter(o => o.fields.Actief === 1).map(o => o.fields.Naam))') === '["proef bproef"]',
      await app.ev('JSON.stringify(OEFEN_DATA.opdracht.map(o => [o.id, o.fields.Naam, o.fields.Actief]))'));

    // ── 9. de statuskaart liegt niet in oefenmodus ──────────────
    console.log('\n9. In oefenmodus staat er geen groene vink');
    const stat = await app.ev('document.getElementById("st_worker").textContent');
    toets('de status zegt "niet gemeten"', stat === 'niet gemeten', 'er staat: ' + stat);

    // ── 10. geen enkele uitzondering onderweg ───────────────────
    console.log('\n10. Wat de browser onderweg meldde');
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
