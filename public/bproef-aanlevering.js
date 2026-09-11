// ══════════════════════════════════════════════════════════════════
// bproef-aanlevering.js — bereikt de meetkwaliteit de AI echt? (#188)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-aanlevering.js toetst de REGELS van pidlane-aanlevering.js: krijgt een
// ontbrekende sensor de goede reden, blijft een niet-gemeten stilte null, krijgt
// een gat zijn naam. Dat is de helft van de vraag. De andere helft is of dat
// oordeel de AI ook werkelijk bereikt, en die is in node per definitie niet te
// beantwoorden: daar bestaat apiFetch() niet, PLRit en PLAchtergrond ook niet,
// en de module wordt er met vm uit zijn verband geknipt.
//
// Precies die koppeling was de bevinding. De app wist alles al — het kwam alleen
// nergens aan. Een module die perfect werkt en niet aangesloten is, is hetzelfde
// als geen module, en dat verschil is alleen in een draaiende app te zien.
//
// WAT ER GEMETEN WORDT, EN WAT NIET. De echte apiFetch() aanroepen zou een echte
// AI-call doen en dus tokens van een klant kosten. Deze proef gaat daarom tot
// precies één stap daarvóór: de systeemprompt wordt opgebouwd zoals apiFetch dat
// doet, en er wordt gekeken of het aanleveringsblok erin staat. Wat het model met
// die tekst doet, blijft een vraag voor CAMPAGNE.
//
// Draaien:  node bproef-aanlevering.js      (vanuit public/)
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
    // ── 1. IS DE MODULE ER, NA DE ECHTE BOOT? ────────────────────
    toets('PLAanlevering bestaat in de draaiende app',
          await app.ev(`typeof window.PLAanlevering === 'object' && window.PLAanlevering !== null`));
    toets('apiFetch() bestaat', await app.ev(`typeof apiFetch === 'function'`));

    // ── 2. DE BRONNEN DIE HIJ LEEST, BESTAAN HIER OOK ────────────
    // In node bestaan deze twee niet. Ontbreken ze hier, dan leest de module
    // stil uit niets en meldt hij netjes "geen onderbrekingen" over een rit met
    // gaten — de stille vorm die dit hele issue is.
    const bronnen = await app.ev(`JSON.stringify({
      rit: typeof window.PLRit === 'object' && !!window.PLRit,
      acht: typeof window.PLAchtergrond === 'object' && !!window.PLAchtergrond,
      kwal: typeof buildQualityReport === 'function',
      corr: typeof correlationLines === 'function',
      duiding: typeof plGatDuiding === 'function'
    })`);
    const b = JSON.parse(bronnen);
    toets('PLRit is bereikbaar voor de aanlevering', b.rit);
    toets('PLAchtergrond is bereikbaar voor de aanlevering', b.acht);
    toets('buildQualityReport() is bereikbaar', b.kwal);
    toets('correlationLines() is bereikbaar', b.corr);
    toets('plGatDuiding() is bereikbaar — anders krijgt geen gat een naam', b.duiding);

    // ── 3. LEEG ALS ER NIETS GEMETEN IS ──────────────────────────
    // Een verse app heeft geen selectie en geen historie. Dan hoort het blok
    // leeg te zijn: promptcaching staat uit, dus elke regel kost geld bij elke
    // analyse.
    await app.ev(`(function(){ activePIDs = new Set(); pidHist = {}; pidVals = {}; return true; })()`);
    const leeg = await app.ev(`PLAanlevering.blok()`);
    toets('zonder meting en zonder vraag blijft het blok leeg', leeg === '',
          'kreeg ' + JSON.stringify(String(leeg).slice(0, 120)));

    // ── 4. DE ECHTE MEETTOESTAND EROP ────────────────────────────
    // Twee sensoren uit de analyseset aanzetten met een geldige waarde, de rest
    // bewust weglaten. Welke sensoren de set vraagt komt uit ANALYSE_PID_SETS in
    // de app, niet uit een lijst in deze proef.
    const opgezet = JSON.parse(await app.ev(`(function(){
      const set = (window.ANALYSE_PID_SETS||{}).monteur || [];
      const aan = set.slice(0, 2);
      activePIDs = new Set(aan);
      supportedPIDs = new Set(set.slice(0, 4));
      pidVals = {}; pidHist = {};
      aan.forEach(function(p, i){
        pidVals[p] = (p === '0105') ? 88 : (800 + i);
        pidHist[p] = [{t: Date.now()-2000, v: pidVals[p]}, {t: Date.now(), v: pidVals[p]}];
      });
      return JSON.stringify({ set: set.length, aan: aan, ontbreekt: set.length - aan.length });
    })()`));
    toets('de analyseset komt uit de app en is niet leeg', opgezet.set > 2,
          JSON.stringify(opgezet));

    const blok = await app.ev(`PLAanlevering.blok({set:'monteur', vraag:'Loopt de motor te arm?'})`);
    toets('het blok is nu niet leeg', typeof blok === 'string' && blok.length > 200,
          'lengte ' + (blok || '').length);
    toets('de vraag van de aanroeper staat erin', /Loopt de motor te arm\?/.test(blok));
    toets('de ontbrekende sensoren staan erin met hun reden',
          /ONTBREEKT — hierover is NIETS gemeten/.test(blok), blok);
    toets('en een van die redenen wijst naar de PID-selectie',
          /PID-selectie/.test(blok));
    toets('het DATAKWALITEIT-blok gaat mee zonder dat de aanroeper eraan denkt',
          /DATAKWALITEIT/.test(blok));
    toets('de weegregel tegen "ontbrekend dus in orde" staat erin',
          /afwezige data is geen goed nieuws/.test(blok));

    // ── 4b. BEREIKT HET BLOK DE SYSTEEMPROMPT ECHT? ──────────────
    // DIT IS DE EIGENLIJKE VRAAG van deze proef, en hij is met opzet GEDRAG en
    // geen broncode. De eerste versie hiervan keek of de tekst "PLAanlevering.blok"
    // in apiFetch stond; die toets bleef groen toen de haak op `if(false)` werd
    // gezet, en bewees dus alleen dat er een regel stond — niet dat hij iets deed.
    //
    // De echte apiFetch() draait nu tot aan de verzendlaag. plFetch() is
    // vervangen door een opvangbak die het body-object bewaart en een geldig
    // antwoord teruggeeft; alles daarboven — het samenstellen van de
    // systeemprompt, de rijsituatie, de meetcontext, de aanlevering — is de
    // code van de app. Er gaat geen byte naar Anthropic en er wordt geen
    // tegoed aangesproken.
    const gevangen = JSON.parse(await app.ev(`(async function(){
      const echtFetch = window.plFetch;
      const echtCred  = window.PLCredits;
      // De meetcontext en de rapportenvraag beantwoord zetten, anders wacht
      // apiFetch op een venster dat in een proef niemand wegklikt. PLCredits
      // eruit: het kostenvenster is hier niet het onderwerp, en apiFetch heeft
      // er al een guard omheen.
      const echtCtx = window._plMeetcontext, echtSr = window._srUseContext;
      window._plMeetcontext = {}; window._srUseContext = false; window.PLCredits = null;
      let body = null;
      window.plFetch = async function(pad, opt){
        body = (opt && opt.json) || null;
        return { ok: true, headers: { get: function(){ return null; } },
                 json: async function(){ return { content: [{type:'text', text:'proef'}],
                        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }; } };
      };
      let fout = null;
      try { await apiFetch('Toets de aanlevering.', 50, null, null, {set:'monteur', vraag:'Loopt de motor te arm?'}); }
      catch(e){ fout = String(e && e.message || e); }
      window.plFetch = echtFetch; window.PLCredits = echtCred;
      window._plMeetcontext = echtCtx; window._srUseContext = echtSr;
      return JSON.stringify({ fout: fout, pad: !!body, sys: (body && body.system) || '' });
    })()`));
    toets('apiFetch() komt zonder fout tot aan de verzendlaag',
          gevangen.fout === null && gevangen.pad === true, String(gevangen.fout));
    toets('de AANLEVERING staat werkelijk in de systeemprompt die verstuurd wordt',
          /AANLEVERING — wat er over DEZE meting bekend is/.test(gevangen.sys),
          'de module draait dan wel, maar bereikt de AI niet (#188)');
    toets('en de dekking staat er met de ontbrekende sensoren in',
          /ONTBREEKT — hierover is NIETS gemeten/.test(gevangen.sys));
    toets('de vraag die de aanroeper meegaf staat erin',
          /Loopt de motor te arm\?/.test(gevangen.sys));
    // De tegenproef op deze toets zelf: de opvangbak moet ook de blokken vángen
    // die er al waren. Ziet hij die niet, dan meet hij de verkeerde string.
    toets('de opvangbak ziet ook de bestaande systeemprompt',
          /PidLane AI-Monteur/.test(gevangen.sys), String(gevangen.sys).slice(0, 200));

    // ── 5. TEGENPROEF ────────────────────────────────────────────
    // Zonder dit bewijst stap 4 alleen dat er tekst uit komt, niet dat die tekst
    // de meettoestand vólgt. Alles aanzetten met een geldige waarde: dan hoort
    // de ONTBREEKT-lijst te verdwijnen. Doet hij dat niet, dan staat er een vaste
    // tekst in plaats van een meting — en dat is precies de soort proef die
    // CLAUDE.md waardeloos noemt.
    await app.ev(`(function(){
      const set = (window.ANALYSE_PID_SETS||{}).monteur || [];
      activePIDs = new Set(set); supportedPIDs = new Set(set);
      pidVals = {}; pidHist = {};
      set.forEach(function(p, i){
        const d = (typeof getPidDef === 'function') ? getPidDef(p) : null;
        // Midden in het eigen bereik van de sensor: dan keurt assessPidQuality
        // niets af en is "ontbreekt" alleen nog te wijten aan de dekking zelf.
        const v = (d && typeof d.min === 'number' && typeof d.max === 'number')
          ? (d.min + (d.max - d.min) / 2) : (10 + i);
        pidVals[p] = Math.round(v * 100) / 100;
        pidHist[p] = [{t: Date.now()-2000, v: pidVals[p]}, {t: Date.now(), v: pidVals[p]}];
      });
      return true;
    })()`);
    const vol = await app.ev(`PLAanlevering.blok({set:'monteur'})`);
    toets('met alle sensoren erop verdwijnt de ONTBREEKT-lijst',
          !/ONTBREEKT — hierover is NIETS gemeten/.test(vol), vol);
    toets('en zegt het blok dat de dekking compleet is',
          /Alle sensoren die deze analyse nodig heeft, leveren data/.test(vol), vol);

    // ── 6. EEN GAT KRIJGT ZIJN NAAM, MET DE ECHTE PLAchtergrond ──
    // De overgangen van PLAchtergrond worden aangeroepen zoals de echte
    // luisteraar dat doet (_heen/_terug), zodat er een echte periode ontstaat.
    // Daarna een gat dat daar ruim buiten valt: dat hoort naar de adapter of de
    // bus te wijzen en niet naar de telefoon.
    const naam = await app.ev(`(function(){
      // De klok twee minuten vooruit tussen de twee overgangen, in plaats van
      // twee minuten wachten. PLAchtergrond meldt een periode pas boven zijn
      // eigen DREMPEL_MELDEN, en die drempel staat daar en niet hier.
      var echt = Date.now;
      try {
        PLAchtergrond.wis();
        PLAchtergrond._heen();
        Date.now = function(){ return echt.call(Date) + 120000; };
        PLAchtergrond._terug();
      } catch(e){ Date.now = echt; return 'FOUT: '+e.message; }
      Date.now = echt;
      const p = PLAchtergrond.perioden();
      if (!p.length) return 'GEEN_PERIODE';
      const ver = p[0].tot + 600000;
      const nep = Object.create(window.PLRit);
      nep.gaten = function(){ return [{van: ver, tot: ver + 90000, s: 90}]; };
      nep.meetgaten = function(){ return []; };
      nep.herverbindingen = function(){ return 0; };
      const echtRit = window.PLRit;
      window.PLRit = nep;
      const t = PLAanlevering.blok({set:'monteur'});
      window.PLRit = echtRit;
      return t;
    })()`);
    toets('een echte achtergrondperiode ontstaat via _heen/_terug',
          typeof naam === 'string' && naam.indexOf('FOUT') !== 0 && naam !== 'GEEN_PERIODE',
          String(naam).slice(0, 200));
    toets('een gat buiten die periode wijst naar de verbinding, niet naar de telefoon',
          /terwijl de app gewoon in beeld stond/.test(naam), String(naam).slice(0, 600));

  } finally {
    await app.stop();
  }

  console.log(fouten ? '\nbproef-aanlevering: ' + fouten + ' FOUT'
                     : '\nbproef-aanlevering: alles goed');
  process.exit(fouten ? 1 : 0);
})();
