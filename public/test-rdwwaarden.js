// ══════════════════════════════════════════════════════════════════
// test-rdwwaarden.js — de RDW zegt wat hij zegt (17-10-2026)
// ──────────────────────────────────────────────────────────────────
// Uit het logboek van de CX-5 van 17-10-2026, nagemeten op de open data:
//   - "Terugroepacties R054XD: 1 openstaande terugroepactie", terwijl de
//     RDW-vlag "Nee" zei. t49b-isb7 had code_status P, "Producent heeft
//     herstel gemeld" — en "herstel" is geen "hersteld". 4,8 van de 5,8
//     miljoen statusregels hebben P: bij vier van de vijf auto's met ooit een
//     actie stond er een open recall in de koopcheck en de AI-prompt;
//   - "RDW weggelaten — Tellerstandoordeel: onbekende RDW-status": de
//     koopcheck kende alleen Logisch/Onlogisch. "Geen oordeel" (3,4 mln) en
//     "Niet geregistreerd" (4,9 mln) gingen weg, en de AI hoorde "onbekend".
// Op de echte pidlane-recall.js en de echte validateRdwVehicle() uit
// pidlane-koopcheck.js, met een nep-RDW die de echte waarden teruggeeft.
// Draaien vanuit de repo:  node public/test-rdwwaarden.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, ok = 0;
function t(naam, waar, uitleg) {
  if (waar) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

// ── 1. PLRecall ─────────────────────────────────────────────────
const rdw = { status: [], vlag: 'Nee' };
const s = {
  console: { log() {}, warn() {}, error() {} },
  document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }) },
  addEventListener() {},
  btDiag() {},
  plFetch: async (url) => {
    const doel = decodeURIComponent(url.split('url=')[1]);
    let body = [];
    if (/m9d7-ebf2/.test(doel)) body = [{ kenteken: 'R054XD', merk: 'MAZDA', handelsbenaming: 'CX-5', openstaande_terugroepactie_indicator: rdw.vlag }];
    else if (/t49b-isb7/.test(doel)) body = rdw.status;
    return { ok: true, status: 200, json: async () => body };
  }
};
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-recall.js', 'utf8'), s, { filename: 'pidlane-recall.js' });
if (!s.PLRecall) { console.error('FOUT: PLRecall niet geladen'); process.exit(1); }

(async () => {
  console.log('\n1. Terugroepacties: code_status beslist');
  const check = async (status, vlag) => {
    rdw.status = status; rdw.vlag = vlag;
    s.PLRecall.wisCache();
    return (await s.PLRecall.check('R054XD')).samenvatting;
  };
  let r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'MGP210643', code_status: 'P', status: 'Producent heeft herstel gemeld' }], 'Nee');
  t('de CX-5: P "Producent heeft herstel gemeld" is afgehandeld, niet open', r.aantalOpen === 0 && r.niveau !== 'kritiek', JSON.stringify(r));
  r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'X1', code_status: 'O', status: 'Openstaande terugroepactie' }], 'Ja');
  t('tegenproef: O "Openstaande terugroepactie" is open', r.aantalOpen === 1 && r.niveau === 'kritiek', JSON.stringify(r));
  r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'X2', status: 'Producent heeft herstel gemeld' }], 'Nee');
  t('zonder code beslist de tekst: "herstel gemeld" is afgehandeld', r.aantalOpen === 0, JSON.stringify(r));
  r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'X4', code_status: 'P', status: 'tekst die nergens op lijkt' }], 'Nee');
  t('code P wint van een tekst die niets zegt', r.aantalOpen === 0, JSON.stringify(r));
  r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'X5', code_status: 'O', status: 'nog niet hersteld' }], 'Ja');
  t('code O wint van een tekst met "hersteld" erin', r.aantalOpen === 1, JSON.stringify(r));
  r = await check([{ kenteken: 'R054XD', referentiecode_rdw: 'X3', status: 'iets nieuws' }], 'Ja');
  t('een onbekende tekst zonder code blijft open (de veilige kant)', r.aantalOpen === 1, JSON.stringify(r));

  // ── 2. Tellerstandoordeel ─────────────────────────────────────
  console.log('\n2. Tellerstandoordeel: alle vier de RDW-waarden');
  const kb = fs.readFileSync(__dirname + '/pidlane-koopcheck.js', 'utf8');
  const a = kb.indexOf('// RDW-DATAVALIDATIE'), b = kb.indexOf('function formatRdwDate(');
  if (a < 0 || b < a) { console.error('FOUT: validateRdwVehicle-blok niet gevonden in pidlane-koopcheck.js'); process.exit(1); }
  const K = new Function(kb.slice(a, b) + '\nreturn { validateRdwVehicle, tellerUitleg };')();
  const basis = { kenteken: 'R054XD', merk: 'MAZDA', handelsbenaming: 'CX-5', datum_eerste_toelating: '20180301' };
  for (const w of ['Logisch', 'Onlogisch', 'Geen oordeel', 'Niet geregistreerd']) {
    const v = K.validateRdwVehicle(Object.assign({ tellerstandoordeel: w }, basis));
    t('"' + w + '" blijft staan en wordt niet weggelaten', v.velden.tellerstandoordeel === w && !v.weggelaten.some((x) => /Teller/.test(x.label)), JSON.stringify(v));
  }
  const raar = K.validateRdwVehicle(Object.assign({ tellerstandoordeel: 'xyz123' }, basis));
  t('tegenproef: een onbekende waarde gaat wél weg', !raar.velden.tellerstandoordeel && raar.weggelaten.some((x) => /Teller/.test(x.label)), JSON.stringify(raar));
  t('alleen Onlogisch is een fraudesignaal voor de AI', /LET OP/.test(K.tellerUitleg('Onlogisch')) && !/LET OP/.test(K.tellerUitleg('Geen oordeel')) && /geen fraudesignaal/.test(K.tellerUitleg('Geen oordeel')) && /geen fraudesignaal/.test(K.tellerUitleg('Niet geregistreerd')) && K.tellerUitleg('Logisch') === '');

  console.log('\n' + ok + ' goed, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('  FOUT  test brak af — ' + (e && e.stack || e)); process.exit(1); });
