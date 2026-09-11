// ══════════════════════════════════════════════════════════════════
// bproef-ritrapport.js — bereikt de meting het model écht? (#196, #188)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-ritrapport.js toetst pidlane-rit.js in node: ritLogs draagt nog maar één
// soort regel, de cijfers gaan voluit mee, het gat hangt aan de juiste fase. Dat
// is de helft. De andere helft is of dat ook zo bij de verzendlaag aankomt, en
// die vraag is in node niet te stellen: daar bestaat apiFetch() niet, en
// PLAanlevering — dat het kwaliteitsblok erbovenop zet — ook niet.
//
// Juist die koppeling is hier het onderwerp. #188 bouwde de aanlevering en hing
// hem in apiFetch; §11 noteerde erbij dat hij dáárna nog door geen enkel model
// gelezen was, omdat het ritrapport omviel vóór de AI-call (#196). Deze proef
// meet precies dat: komt er een rit-analyse tot aan de verzendlaag, en staat de
// meetkwaliteit dan in wat er verstuurd zou worden.
//
// WAT ER NIET GEMETEN WORDT. Er gaat geen byte naar Anthropic. plFetch() is
// vervangen door een opvangbak; alles erboven — generateRitRapport, apiFetch,
// PLAanlevering, buildQualityReport — is de echte code van de app. Wat een model
// met die tekst dóet, blijft een vraag voor CAMPAGNE.
//
// Draaien:  node bproef-ritrapport.js      (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Een rit in de app zetten zoals analyseRitFase hem zou achterlaten: twee fases
// met statistieken, en één onderbreking die in fase A viel. De uitschieter naar
// 4200 rpm staat met opzet alleen in `max` — dat is de waarde die tot 11-09
// onderweg verdween omdat er alleen een gemiddelde werd doorgegeven.
const ZETKLAAR = `
  ritLogs = [
    {fase:'Stationair', duur:60, stats:{
      '010C':{name:'Toerental',unit:'rpm',min:800,max:4200,avg:1500,trend:2,ok:true,count:41}}},
    {fase:'Optrekken', duur:60, stats:{
      '0105':{name:'Koelwater',unit:'°C',min:84,max:92,avg:88,trend:1,ok:true,count:118}}}
  ];
  ritPauzeLog = [{t: Date.now()-30000, sec:120, faseIdx:0}];
  ritPauzeTotaal = 120000;
  ritStartTime = Date.now() - 240000;
  ritMode = '2min';
  ritSweepFindings = [];
`;

// De opvangbak. Zelfde vorm als bproef-aanlevering.js: de echte apiFetch draait
// tot precies één stap vóór het versturen.
function vangOp(voorbereiding, aanroep) {
  return `(async function(){
    const echtFetch = window.plFetch, echtCred = window.PLCredits;
    const echtCtx = window._plMeetcontext, echtSr = window._srUseContext;
    const echtDl = window.download;
    window._plMeetcontext = {}; window._srUseContext = false; window.PLCredits = null;
    // download() zou in een kale Chromium een bestandsdialoog openen; het
    // bestand zelf is hier niet het onderwerp, de verzonden tekst wel.
    let bestand = null;
    window.download = function(naam, tekst){ bestand = tekst; };
    let body = null;
    window.plFetch = async function(pad, opt){
      body = (opt && opt.json) || null;
      return { ok: true, headers: { get: function(){ return null; } },
               json: async function(){ return { content: [{type:'text', text:'proef'}],
                      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }; } };
    };
    ${voorbereiding}
    let fout = null;
    try { ${aanroep} } catch(e){ fout = String(e && e.message || e); }
    window.plFetch = echtFetch; window.PLCredits = echtCred; window.download = echtDl;
    window._plMeetcontext = echtCtx; window._srUseContext = echtSr;
    const bericht = body && body.messages && body.messages[0] ? body.messages[0].content : '';
    return JSON.stringify({ fout: fout, verstuurd: !!body,
      prompt: typeof bericht === 'string' ? bericht : JSON.stringify(bericht),
      sys: (body && body.system) || '', bestand: bestand || '' });
  })()`;
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
    // ── 1. STAAT DE KETEN ER, NA DE ECHTE BOOT? ──────────────────
    toets('generateRitRapport() bestaat in de draaiende app',
          await app.ev(`typeof generateRitRapport === 'function'`));
    toets('ritPauzeLog bestaat als eigen lijst (#196)',
          await app.ev(`typeof ritPauzeLog !== 'undefined' && Array.isArray(ritPauzeLog)`),
          'staat hij er niet, dan zitten de onderbrekingen weer tussen de fases');
    toets('PLAanlevering staat ernaast', await app.ev(`!!window.PLAanlevering`));

    // ── 2. DE RIT MET EEN GAT ERIN, TOT AAN DE VERZENDLAAG ───────
    const r = JSON.parse(await app.ev(vangOp(ZETKLAAR, `await generateRitRapport('techniek');`)));
    toets('generateRitRapport() komt zonder fout tot aan de verzendlaag',
          r.fout === null && r.verstuurd === true,
          'fout: ' + r.fout + ', verstuurd: ' + r.verstuurd);
    toets('er is een rapporttekst geschreven', r.bestand.length > 100, 'lengte ' + r.bestand.length);

    // ── 3. KRIJGT HET MODEL DE CIJFERS, OF ALLEEN HET GEMIDDELDE? ─
    toets('min gaat mee naar het model', /min 800/.test(r.prompt), r.prompt.slice(0, 400));
    toets('max gaat mee — de piek die het gemiddelde verstopt', /max 4200/.test(r.prompt));
    toets('het aantal metingen per sensor gaat mee', /41 metingen/.test(r.prompt));

    // ── 4. WEET HET MODEL WAAR HET GAT ZAT? ──────────────────────
    const regelA = r.prompt.split('\n').find(x => x.indexOf('Stationair') === 0) || '';
    const regelB = r.prompt.split('\n').find(x => x.indexOf('Optrekken') === 0) || '';
    toets('de fase mét gat meldt de weggevallen seconden',
          /120s zonder meetdata/.test(regelA), regelA);
    toets('de fase zonder gat meldt niets', !/zonder meetdata/.test(regelB), regelB);

    // ── 5. EN BEREIKT DE AANLEVERING NU EINDELIJK EEN MODEL? ─────
    // Dit was de enige openstaande vraag van #188: het blok werd gebouwd en
    // ingehangen, maar het ritrapport viel om vóór de AI-call, dus er was nooit
    // een verstuurde prompt om het in aan te wijzen.
    toets('het AANLEVERING-blok staat in de systeemprompt van het ritrapport',
          /AANLEVERING — wat er over DEZE meting bekend is/.test(r.sys),
          'de aanlevering bereikt via dit pad nog steeds geen model (#188)');
    toets('met het profiel dat het ritpad meegeeft',
          /analyseprofiel "rit"/.test(r.sys), String(r.sys).slice(0, 300));

    // ── 6. TEGENPROEF: VOLGT DE TEKST DE METING? ─────────────────
    // Zonder dit bewijst stap 4 alleen dat er tekst uit komt, niet dat die tekst
    // iets meet. Dezelfde rit zonder onderbrekingen hoort het gat te verliezen.
    const zonder = JSON.parse(await app.ev(vangOp(
      ZETKLAAR + `ritPauzeLog = []; ritPauzeTotaal = 0;`,
      `await generateRitRapport('techniek');`)));
    toets('zonder onderbreking verdwijnt de meldregel volledig',
          zonder.fout === null && !/zonder meetdata/.test(zonder.prompt),
          'er staat een vaste tekst in plaats van een meting');
    toets('en de cijfers staan er dan nog steeds', /max 4200/.test(zonder.prompt));

    // ── 7. HET VANGNET, IN DE ECHTE APP ──────────────────────────
    // De bekende crash is bij de bron weggenomen; dit toetst wat er gebeurt bij
    // de volgende. Een regel zonder stats — de vorm van #196 — mag de rit niet
    // meer kosten: het tekstbestand moet er hoe dan ook komen.
    const kapot = JSON.parse(await app.ev(vangOp(
      ZETKLAAR + `ritLogs.push({t: Date.now(), type:'onderbreking', sec:120});`,
      `await generateRitRapport('techniek');`)));
    toets('een regel zonder stats gooit het rapport niet meer omver',
          kapot.fout === null, 'fout: ' + kapot.fout);
    toets('en de meetdata is alsnog bewaard',
          kapot.bestand.indexOf('FASE 1: Stationair') >= 0,
          kapot.bestand.slice(0, 200));

  } finally {
    await app.stop();
  }

  console.log(fouten ? '\nbproef-ritrapport: ' + fouten + ' FOUT'
                     : '\nbproef-ritrapport: alles goed');
  process.exit(fouten ? 1 : 0);
})();
