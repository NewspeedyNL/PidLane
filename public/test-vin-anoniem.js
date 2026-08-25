// ══════════════════════════════════════════════════════════════════
// test-vin-anoniem.js — de VIN mag de telefoon niet ruw verlaten
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Tot 25-08-2026 stuurde vlAtPush() het hele sessierecord als JSON naar
// Airtable, inclusief rec.veh.vin. Dat viel niet op omdat de VIN niet in een
// eigen kolom stond maar binnen het JSON-blob — je ziet hem pas als je een
// record opent en gaat lezen. Ondertussen vraagt het akkoordscherm toestemming
// voor "geanonimiseerde meetdata".
//
// Deze test knipt de anonimiseerlaag uit pidlane-veldlab.js en voert hem echt
// uit: hij toetst gedrag, niet de aanwezigheid van een regel tekst. Een VIN
// die er via een nieuw veld weer in sluipt, valt hier om.
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
  console.log('\nVIN-anonimisering\n');

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

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error('FOUT: test wierp een exception:', e); process.exit(1); });
