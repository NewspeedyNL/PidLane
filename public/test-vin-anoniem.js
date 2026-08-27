// ══════════════════════════════════════════════════════════════════
// test-vin-anoniem.js — de VIN mag de telefoon niet ruw verlaten
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Tot 25-08-2026 stuurde vlAtPush() het hele sessierecord als JSON naar
// Airtable, inclusief rec.veh.vin. Dat viel niet op omdat de VIN niet in een
// eigen kolom stond maar binnen het JSON-blob — je ziet hem pas als je een
// record opent en gaat lezen. Ondertussen vroeg het akkoordscherm toestemming
// voor "geanonimiseerde meetdata".
//
// TWEE PADEN, NIET ÉÉN — bijgewerkt 27-08-2026. Die fix raakte alleen
// Veldlab. logToSheets() in pidlane-auth.js schreef de volledige VIN in een
// EIGEN kolom, op élke logregel, met de gebruikersnaam in dezelfde rij. Deel 7
// hieronder dekt dat pad af. Beide paden delen nu één pseudoniemfunctie, dus
// dezelfde auto krijgt in beide tabellen hetzelfde staartje.
//
// En let op de naam van dit bestand: het is pseudonimisering, geen
// anonimisering. Het zout staat in clientcode. Zie de alinea boven
// VL_VIN_ZOUT in pidlane-veldlab.js, en test-toestemmingstekst.js voor de
// bewaking van de teksten die dat aan de gebruiker moeten uitleggen.
//
// Deze test knipt beide lagen uit hun bestand en voert ze echt uit: hij toetst
// gedrag, niet de aanwezigheid van een regel tekst. Een VIN die er via een
// nieuw veld weer in sluipt, valt hier om.
//
// Draaien vanuit public/:  node test-vin-anoniem.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-veldlab.js', 'utf8');
const van = src.indexOf('const VL_VIN_ZOUT');
const tot = src.indexOf('async function vlAtPush');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: anonimiseerlaag niet gevonden in pidlane-veldlab.js.');
  console.error('      Verwacht VL_VIN_ZOUT ... async function vlAtPush.');
  process.exit(1);
}

const maak = new Function('TextEncoder', 'crypto',
  src.slice(van, tot) + '\nreturn {_vlVinPseudoniem, _vlSchoonVoorVerzending};');
const { _vlVinPseudoniem, _vlSchoonVoorVerzending } = maak(TextEncoder, crypto);

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

const VIN = 'JM3KFBCL8J0123456';          // Mazda CX-5, het testvoertuig

(async function () {
  console.log('\nVIN-pseudonimisering\n');

  // ── 1. de kern: geen VIN in wat er verstuurd wordt ──
  const rec = {
    type: 'survey', t: 1756123456789, tester: 'Nico',
    veh: { merk: 'Mazda', model: 'CX-5', jaar: '2018', vin: VIN, brandstof: 'Benzine' },
    calid: { ascii: 'PY0113', raw: '49040150593031313300' }
  };
  const uit = await _vlSchoonVoorVerzending(rec);
  const blob = JSON.stringify(uit);

  toets('vin-veld is weg', !('vin' in uit.veh), 'veh = ' + JSON.stringify(uit.veh));
  toets('VIN staat nergens meer in het JSON-blob', blob.indexOf(VIN) < 0,
        'dit is het blob dat naar Airtable gaat');
  toets('ook niet in kleine letters', blob.toUpperCase().indexOf(VIN) < 0);

  // ── 2. wat er wel doorheen moet ──
  toets('wmi blijft over', uit.veh.wmi === 'JM3', 'kreeg ' + uit.veh.wmi);
  toets('vinId is 16 hex-tekens', /^[0-9a-f]{16}$/.test(uit.veh.vinId || ''),
        'kreeg ' + uit.veh.vinId);
  toets('merk/model/jaar blijven staan',
        uit.veh.merk === 'Mazda' && uit.veh.model === 'CX-5' && uit.veh.jaar === '2018');
  toets('de rest van het record blijft heel',
        uit.calid && uit.calid.ascii === 'PY0113' && uit.tester === 'Nico');

  // ── 3. het origineel mag niet aangetast worden ──
  // De app toont de VIN zelf gewoon; anonimiseren is alleen voor verzending.
  toets('origineel record houdt zijn VIN', rec.veh.vin === VIN);

  // ── 4. groeperen moet blijven werken ──
  const a = await _vlVinPseudoniem(VIN);
  const b = await _vlVinPseudoniem(VIN);
  const c = await _vlVinPseudoniem('WVWZZZ3CZHE000000');
  toets('zelfde VIN geeft zelfde id', a === b, a + ' vs ' + b);
  toets('andere VIN geeft ander id', a !== c, a + ' vs ' + c);
  toets('streepjes en spaties maken niet uit',
        (await _vlVinPseudoniem(' jm3-kfbcl8j0123456 ')) === a);

  // ── 5. randgevallen ──
  toets('lege VIN geeft null', (await _vlVinPseudoniem('')) === null);
  toets('te korte VIN geeft null', (await _vlVinPseudoniem('ABC123')) === null);

  const zonder = await _vlSchoonVoorVerzending({ veh: { merk: 'Onbekend' }, t: 1 });
  toets('record zonder VIN gaat ongeschonden door',
        zonder.veh.merk === 'Onbekend' && !('vinId' in zonder.veh));

  const geenVeh = await _vlSchoonVoorVerzending({ type: 'sessie', t: 1 });
  toets('record zonder veh-blok valt niet om', geenVeh.type === 'sessie');

  // ── 6. het onserialiseerbare geval ──
  // Hier zat een gat: bij een kringverwijzing gaf de functie het ORIGINEEL
  // terug, VIN en al. Nu gooit hij, en vlAtPush verstuurt dan niets.
  const kring = { veh: { merk: 'Mazda', vin: VIN } };
  kring.zelf = kring;
  let gegooid = false, lek = null;
  try { lek = await _vlSchoonVoorVerzending(kring); }
  catch (e) { gegooid = true; }
  toets('onserialiseerbaar record gooit i.p.v. de VIN teruggeven', gegooid,
        gegooid ? '' : 'kreeg terug: ' + (lek && lek.veh && lek.veh.vin));

  // ── 7. het tweede pad: de Airtable-logregel ──
  // Dit is het gat dat op 25-08 openbleef. vlAtPush() was schoongemaakt,
  // maar logToSheets() in pidlane-auth.js schreef de volledige VIN in een
  // eigen kolom, op elke logregel, met de gebruikersnaam ernaast. Sinds
  // 27-08 loopt dat via _plVinVoorLog(). Zelfde toets als hierboven: gedrag,
  // niet de aanwezigheid van een regel tekst.
  const asrc = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
  const avan = asrc.indexOf('async function _plVinVoorLog');
  const atot = asrc.indexOf('async function logToSheets');
  if (avan < 0 || atot < 0 || atot < avan) {
    console.error('FOUT: _plVinVoorLog niet gevonden in pidlane-auth.js.');
    console.error('      Verwacht _plVinVoorLog ... async function logToSheets.');
    process.exit(1);
  }
  const maakLog = new Function('_vlVinPseudoniem', 'console',
    asrc.slice(avan, atot) + '\nreturn _plVinVoorLog;');
  const _plVinVoorLog = maakLog(_vlVinPseudoniem, console);

  const uitLog = await _plVinVoorLog(VIN);
  toets('logveld bevat de ruwe VIN niet', String(uitLog).indexOf(VIN) < 0,
        'kreeg ' + uitLog);
  toets('logveld is WMI:pseudoniem', /^JM3:[0-9a-f]{16}$/.test(uitLog),
        'kreeg ' + uitLog);
  toets('logveld gebruikt hetzelfde pseudoniem als Veldlab',
        uitLog === 'JM3:' + a, uitLog + ' vs JM3:' + a);
  toets('lege VIN geeft een leeg logveld', (await _plVinVoorLog('')) === '');
  toets('geen VIN-veld geeft een leeg logveld', (await _plVinVoorLog(undefined)) === '');

  // Zonder de pseudoniemfunctie (pidlane-veldlab.js niet geladen) mag er
  // hooguit een WMI overblijven — nooit een terugval op de ruwe waarde.
  const zonderFn = maakLog(undefined, console);
  const kaal = await zonderFn(VIN);
  toets('zonder pseudoniemfunctie blijft alleen de WMI over', kaal === 'JM3',
        'kreeg ' + kaal);

  // En als crypto omvalt ook niet.
  const stil = { warn: function () {} };
  const kapot = maakLog(function () { throw new Error('geen crypto.subtle'); }, stil);
  const naFout = await kapot(VIN);
  toets('crypto-fout valt niet terug op de ruwe VIN',
        String(naFout).indexOf(VIN) < 0 && naFout === 'JM3', 'kreeg ' + naFout);

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error('FOUT: test wierp een exception:', e); process.exit(1); });
