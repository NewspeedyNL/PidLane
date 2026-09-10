// ══════════════════════════════════════════════════════════════════
// bproef-meetketen.js — de meetketen, gemeten in de DRAAIENDE app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// De test-*.js-reeks laadt functies met `vm` of `new Function` uit de bron.
// Dat werkt, maar het knipt ze los van de app: globals ontbreken, de
// volgorde waarin modules elkaar overschrijven verdwijnt, en een tabel die
// door een andere module wordt gevuld is leeg. §11 heeft daar een dure
// bevinding over — validateAndSmooth() slaat het spike-filter over voor
// álle PIDs omdat FILTERED_PIDS met suffix-sleutels is gevuld terwijl de
// meetketen de volledige PID doorgeeft. Zo'n fout gaat over de KOPPELING
// tussen twee modules, en die kun je per definitie niet zien als je één
// van de twee uit zijn verband knipt.
//
// Deze proef doet het andersom: hij start index.html in Chromium en vraagt
// het aan de app zelf. Geen kopie, geen sandbox, geen nagebouwde tabel.
//
// Naamgeving: `bproef-` en niet `test-`, met opzet. plcheck.sh draait
// `test-*.js` met node en dat moet op Termux blijven werken, waar geen
// Chromium staat. De browserproeven draaien via `bash plbrowser.sh .` en
// als eigen job in CI.
//
// Draaien:  node bproef-meetketen.js      (vanuit public/)
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
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      // Ontbrekende voorwaarden zijn LET OP en geen FOUT — CLAUDE.md: een
      // test die altijd rood staat wordt genegeerd.
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    // ── 1. START DE APP SCHOON OP ────────────────────────────────
    // Dit is op zichzelf een regressietoets. Een module die een fout gooit
    // tijdens de boot bleef tot nu toe onzichtbaar tot iemand de app op een
    // toestel opende — en een alert() in de <head> zou de hele app ophangen.
    toets('de app start zonder JS-fouten', app.fouten.length === 0,
          app.fouten.slice(0, 3).join(' | '));
    toets('de app start zonder dialoogvensters', app.dialogen.length === 0,
          app.dialogen.join(' | '));
    const kern = await app.ev(`['PLBus','PLLoad','PLSched','PLBedrading','PLRit']
      .filter(n => typeof window[n] === 'undefined')`);
    toets('alle kernobjecten leven', kern.length === 0, 'ontbreekt: ' + kern.join(', '));

    // ── 2. DE PARSER, IN DE APP ──────────────────────────────────
    const rpm = await app.ev(`parsePID('010C','410C08B8')`);
    toets('parsePID leest 410C08B8 als 558 tpm', rpm === 558, 'kreeg ' + rpm);
    const koel = await app.ev(`parsePID('0105','410585')`);
    toets('parsePID leest 410585 als 93 °C', koel === 93, 'kreeg ' + koel);

    // ── 3. LAAG 1: DE FYSIEKE GRENS ──────────────────────────────
    // 0105 staat in PID_HARD_LIMITS op -40…215. 300 hoort geweigerd, 90 niet.
    //
    // De buffers gaan er eerst uit, en dat is sinds #158 nodig. Toen ging 0105
    // door laag 3 lopen, en dan is de tweede waarde in een reeks een GEMIDDELDE:
    // deze toets gaf 91,5, want de 93 uit de parserproef hierboven stond nog in
    // pidSmooth. Dat is gewenst gedrag — blok 3b hieronder toetst het expliciet
    // — maar het maakt laag 1 onmeetbaar in diezelfde reeks.
    const hard = await app.ev(`(function(){
      const bS = pidSmooth['0105'], bV = pidVals['0105'];
      const schoon = function(){ delete pidSmooth['0105']; delete pidVals['0105']; };
      schoon(); const teHoog  = validateAndSmooth('0105', 300);
      schoon(); const normaal = validateAndSmooth('0105', 90);
      if (bS === undefined) delete pidSmooth['0105']; else pidSmooth['0105'] = bS;
      if (bV === undefined) delete pidVals['0105']; else pidVals['0105'] = bV;
      return JSON.stringify({ teHoog: teHoog, normaal: normaal });
    })()`);
    const h = JSON.parse(hard);
    toets('laag 1 weigert 300 °C koelwater', h.teHoog === null, 'kreeg ' + h.teHoog);
    toets('laag 1 laat 90 °C door', h.normaal === 90, 'kreeg ' + h.normaal);

    // ── 4. DE NEP-ADAPTER VOEDT DE ECHTE KETEN ───────────────────
    // Niet parsePID los aanroepen maar sendCmd, zodat PLBus.note() en
    // trackBtQuality() meedraaien — dat is waar de meetketen echt langsgaat.
    const n = await app.nepAdapter({ '010C': '410C08B8', '0105': '410585' });
    toets('de nep-adapter staat aan', n === 2, 'tabel telt ' + n);
    const voor = await app.ev(`PLBus.stats().totaal`);
    const ant = await app.ev(`(async()=>await sendCmd('010C'))()`);
    toets('sendCmd haalt het antwoord door de echte keten', ant === '410C08B8', 'kreeg ' + JSON.stringify(ant));
    const na = await app.ev(`PLBus.stats().totaal`);
    toets('PLBus heeft dat commando geteld', na === voor + 1, voor + ' → ' + na);

    // ── 5. TEGENPROEF ────────────────────────────────────────────
    // Zonder deze stap bewijst het bovenstaande alleen dat er iets groens
    // uit komt. Een PID die de nep-ECU niet kent moet 'NO DATA' geven, en
    // de keten moet dat als slecht tellen — niet als een geldige meting.
    const slechtVoor = await app.ev(`PLBus.stats().bad`);
    const leeg = await app.ev(`(async()=>await sendCmd('01FF'))()`);
    toets('een onbekende PID geeft NO DATA', leeg === 'NO DATA', 'kreeg ' + JSON.stringify(leeg));
    const slechtNa = await app.ev(`PLBus.stats().bad`);
    toets('en de keten telt dat als een slechte respons', slechtNa === slechtVoor + 1,
          slechtVoor + ' → ' + slechtNa);
    const geenWaarde = await app.ev(`parsePID('01FF','NO DATA')`);
    toets('parsePID maakt van NO DATA geen getal',
          geenWaarde === null || geenWaarde === undefined, 'kreeg ' + geenWaarde);

    // ── 6. #105 — LAAT BLOK 5 SPOREN NA IN DE MEETGESCHIEDENIS? ──
    // Dit is de toets die alleen hier kan. In node bestaat window._pidLetOp
    // niet, draait blok 4 niet, en is er geen app die twaalf seconden later
    // "Opvallende metingen: 0105 uiterste 200" rapporteert. De vraag gaat over
    // wat twee modules bij elkáár achterlaten, en dat is per definitie niet te
    // zien als je er één uit zijn verband knipt.
    //
    // UITGEBREID OP 10-09-2026. Tot vandaag keek deze toets alleen naar
    // `_pidLetOp`. Dat was genoeg zolang FILTERED_PIDS suffixen droeg, want dan
    // kwam geen enkele proef verder dan laag 1 en viel er in de reeksen niets
    // te vervuilen. Sinds #158 draait laag 2+3 wél, en schrijft dezelfde proef
    // in `pidSmooth`, `pidHist` en `_pidPending` — de reeksen waar de rit zelf
    // op rekent. Dat is wat de rit van 10-09 zichtbaar maakte, en daarom staan
    // ze hier nu alle vier in dezelfde vergelijking.
    const sporen = await app.ev(`(function(){
      const naam = ['Laag 1 houdt een fysiek onmogelijke waarde tegen',
                    'Laag 2+3 is bereikbaar zoals de app de meetketen aanroept'];
      const lijst = PLBlok5.proeven().filter(p => naam.indexOf(p.naam) >= 0);
      const beeld = () => JSON.stringify({
        letOp:  window._pidLetOp || null,
        smooth: (typeof pidSmooth !== 'undefined' && pidSmooth) ? (pidSmooth['0105'] || null) : null,
        hist:   (typeof pidHist   !== 'undefined' && pidHist)   ? (pidHist['0105']   || null) : null,
        pend:   (window._pidPending || {})['0105'] || null
      });
      const voor = beeld();
      lijst.forEach(p => { try { p.proef(); } catch(e){ /* de uitslag doet er hier niet toe */ } });
      const na = beeld();
      return JSON.stringify({ gevonden: lijst.length, gelijk: voor === na, voor: voor, na: na });
    })()`);
    const sp = JSON.parse(sporen);
    toets('beide meetketenproeven zitten in blok 5', sp.gevonden === 2, 'gevonden: ' + sp.gevonden);
    toets('blok 5 laat de meetgeschiedenis achter zoals hij hem vond (#105)',
          sp.gelijk, 'vóór ' + sp.voor + ' → ná ' + sp.na);

    // TEGENPROEF OP DE REEKSEN. Dezelfde vraag als hierboven, maar dan zonder
    // _zonderSporen(): één rechtstreekse aanroep hoort pidSmooth['0105'] wél te
    // veranderen. Slaat dit niet aan, dan bewijst de toets erboven niets over de
    // reeksen — dan is er gewoon niets te vervuilen.
    const reeksSpoor = await app.ev(`(function(){
      const voorS = JSON.stringify(pidSmooth['0105'] || null);
      const voorP = JSON.stringify((window._pidPending || {})['0105'] || null);
      validateAndSmooth('0105', 88);
      const naS = JSON.stringify(pidSmooth['0105'] || null);
      if (voorS === naS) return 'GEEN_SPOOR';
      if (voorS === 'null') delete pidSmooth['0105']; else pidSmooth['0105'] = JSON.parse(voorS);
      const q = window._pidPending; if (q) { if (voorP === 'null') delete q['0105']; else q['0105'] = JSON.parse(voorP); }
      return 'SPOOR';
    })()`);
    toets('en de tegenproef laat zien dat de reeks wél zou zijn veranderd',
          reeksSpoor === 'SPOOR', 'pidSmooth bleef gelijk — dan zegt de toets hierboven niets over de reeksen');

    // TEGENPROEF: zonder _zonderSporen() zou 200 °C blijven staan. Dat maken we
    // hier expliciet na door validateAndSmooth rechtstreeks aan te roepen — als
    // deze toets NIET aanslaat, meet de toets hierboven niets.
    const rauw = await app.ev(`(function(){
      const voor = JSON.stringify(window._pidLetOp || null);
      validateAndSmooth('0105', 200);
      const na = JSON.stringify(window._pidLetOp || null);
      if (voor === na) return 'GEEN_SPOOR';
      window._pidLetOp = voor === 'null' ? undefined : JSON.parse(voor);
      return 'SPOOR';
    })()`);
    toets('en de tegenproef laat zien dat er wél een spoor zou zijn geweest',
          rauw === 'SPOOR', 'validateAndSmooth liet niets achter — dan bewijst de toets hierboven niets');

    // ── LAAG 2+3, EN DIT WAS EEN WAARNEMING TOT 09-09-2026 ───────
    // Hier stond een LET OP met de gemeten waarde erbij, want laag 2+3 stond
    // uit voor álle PIDs: FILTERED_PIDS droeg suffixen ('05') terwijl de keten
    // de volledige pid doorgeeft. Er stond bij: "DIT IS VERANDERD: werk §11 en
    // deze proef bij". Dat is nu gebeurd (#158), dus het is een toets geworden.
    //
    // De vorm van de sleutels wordt er apart bij gemeten. Zonder die tweede
    // regel zou "alles geeft null" ook groen staan — bijvoorbeeld doordat laag
    // 1 iets weigert — en dan bewijst de eerste regel niet dat het spike-filter
    // draait maar alleen dat er íéts null teruggeeft.
    // Een sprong heeft een VORIGE waarde nodig — zonder die 50 valt er niets te
    // springen en komt 200 er terecht gewoon doorheen. Dat is precies waarom
    // deze proef hem zelf zet in plaats van te hopen dat er data staat: er
    // hangt geen auto aan deze browser.
    const l23 = await app.ev(`(function(){
      const bS = pidSmooth['0105'], bV = pidVals['0105'], bP = window._pidPending;
      delete pidSmooth['0105']; pidVals['0105'] = 50; window._pidPending = {};
      const uit = validateAndSmooth('0105', 200);
      window._pidPending = bP;
      if (bS === undefined) delete pidSmooth['0105']; else pidSmooth['0105'] = bS;
      if (bV === undefined) delete pidVals['0105']; else pidVals['0105'] = bV;
      return uit;
    })()`);
    toets('laag 2+3 draait: een sprong van 50 naar 200 °C wacht op bevestiging',
          l23 === null, 'validateAndSmooth("0105",200) gaf ' + l23 +
          ' in plaats van null — spike-filter en smoothing staan weer uit voor alle PIDs (#158)');

    const vorm = await app.ev(`(function(){
      if (typeof FILTERED_PIDS === 'undefined') return 'ontbreekt';
      return FILTERED_PIDS.has('0105') ? 'volledig' : (FILTERED_PIDS.has('05') ? 'suffix' : 'onbekend');
    })()`);
    toets('en FILTERED_PIDS draagt de vorm die de meetketen doorgeeft',
          vorm === 'volledig', 'sleutelvorm is "' + vorm + '" — de keten geeft de volledige pid door');
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-meetketen: alles goed' : '\nbproef-meetketen: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
