// ══════════════════════════════════════════════════════════════════
// test-voorkeur.js — toetst pidlane-voorkeur.js (PLVoorkeur, Mijn voorkeuren)
// ──────────────────────────────────────────────────────────────────
// WAT HIER ROOD HOORT TE WORDEN
//   • de lijst in de app en de lijst in worker.js lopen uit elkaar — dan
//     bewaart het scherm iets wat de server weigert, of andersom;
//   • een voorkeur "uit" zet een achtergrondfunctie uit die de klant net
//     zelf aanzette (voorkeuren zetten alleen AAN);
//   • het adapteradres uit het account overschrijft een adapter die op dit
//     toestel al gekoppeld is;
//   • zonder voorkeur verandert er iets aan het oude gedrag (vragen bij een
//     bekende auto, samenvatting tonen);
//   • de vaste sensorselectie zet een sensor aan die deze auto niet meldt.
//
// Draaien vanuit public/:  node test-voorkeur.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

function laad(extra) {
  const opslag = {};
  const s = {
    console: { log() { }, warn() { }, error() { } },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), head: { appendChild() { } }, body: { appendChild() { } } },
    setInterval: () => 0, setTimeout: (f) => { f(); return 0; },
    Number, Array, Object, JSON, Math, Promise, String
  };
  Object.assign(s, extra || {});
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-voorkeur.js', 'utf8'), s, { filename: 'pidlane-voorkeur.js' });
  return { V: s.PLVoorkeur, K: s.PLVoorkeur._kern, s, opslag };
}

(async function () {
  const { V, K } = laad();

  console.log('\n1. Eén lijst in app en Worker');
  const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  const i = bron.lastIndexOf('export {');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vk-')), 'w.mjs');
  fs.writeFileSync(f, bron.slice(0, i) + 'export { KP_VOORKEUR };\n');
  const { KP_VOORKEUR } = await import('file://' + f);
  const app = Object.keys(K.SPEC).sort(), srv = Object.keys(KP_VOORKEUR).sort();
  eis(JSON.stringify(app) === JSON.stringify(srv), 'dezelfde sleutels', 'app: ' + app.join(',') + '\n       worker: ' + srv.join(','));
  const verschil = app.filter((k) => K.SPEC[k].uit && JSON.stringify(K.SPEC[k].uit) !== JSON.stringify((KP_VOORKEUR[k] || {}).uit));
  eis(!verschil.length, 'dezelfde keuzes per sleutel', verschil.join(','));
  eis(app.every((k) => K.SPEC[k].soort === (KP_VOORKEUR[k] || {}).soort), 'dezelfde soort per sleutel');

  console.log('\n2. Schoon');
  const sch = K.schoon({ weergave: 'visueel', thema: 'paars', letter: 15.5, waakronde: 'true', favorieten: ['wc-live', 'javascript:x'], onbekend: 1, rapport: '' });
  eis(sch.weergave === 'visueel' && !('thema' in sch) && !('letter' in sch) && !('waakronde' in sch) && !('onbekend' in sch) && !('rapport' in sch), 'alleen geldige waarden blijven', JSON.stringify(sch));
  eis(JSON.stringify(sch.favorieten) === '["wc-live"]', 'een favoriet die geen kaart is, valt eruit');

  console.log('\n3. Toepassen bij het inloggen');
  const gedaan = [];
  const doe = {};
  ['tekst', 'letter', 'weergave', 'favorieten', 'autoVerbinden', 'adapterType', 'adapter', 'oudeData'].forEach((k) => { doe[k] = (w) => gedaan.push([k, w]); });
  let t = K.toepassen({ thema: 'licht', tekst: 'l', weergave: 'slim', adapterAdres: '00:04:3E:AA:BB:CC', adapterNaam: 'OBDLink MX+' }, doe, {});
  eis(t.join(',') === 'tekst,weergave,adapterAdres', 'wat er staat wordt toegepast, in volgorde; een thema bestaat niet (alleen donker sinds 11-09)', t.join(','));
  eis(gedaan.some((g) => g[0] === 'adapter' && g[1].adres === '00:04:3E:AA:BB:CC' && g[1].naam === 'OBDLink MX+'), 'adapter met adres en naam');
  gedaan.length = 0;
  t = K.toepassen({ adapterAdres: '00:04:3E:AA:BB:CC' }, doe, { adapterAdres: '11:22:33:44:55:66' });
  eis(t.length === 0 && gedaan.length === 0, 'een toestel met een eigen gekoppelde adapter houdt die');
  gedaan.length = 0;
  t = K.toepassen({}, doe, {});
  eis(t.length === 0 && gedaan.length === 0, 'zonder voorkeuren verandert er niets');
  const kapot = { weergave: () => { throw new Error('stuk'); }, tekst: (w) => gedaan.push(['tekst', w]) };
  t = K.toepassen({ weergave: 'slim', tekst: 's' }, kapot, {});
  eis(t.join(',') === 'tekst', 'één handeling die faalt houdt de rest niet tegen');

  console.log('\n4. Achtergrondfuncties bij verbinden');
  let a = K.achtergrond({ waakronde: true, ritmonitor: true, bulk: false }, { waak: { aan: false }, monitor: { aan: true }, bulk: { aan: true } });
  eis(JSON.stringify(a) === '["waak"]', 'alleen wat aan moet en nog uit staat', JSON.stringify(a));
  a = K.achtergrond({ waakronde: false }, { waak: { aan: true } });
  eis(a.length === 0, 'een voorkeur "uit" zet niets uit');
  a = K.achtergrond({ waakronde: true }, { waak: null });
  eis(a.length === 0, 'een module die ontbreekt wordt niet geschakeld');

  console.log('\n5. Verbruik, rapport en de standaard zonder voorkeur');
  eis(K.verbruikTekst(6.8, 'l100') === '6,8 l/100 km', 'l/100 km', K.verbruikTekst(6.8, 'l100'));
  eis(K.verbruikTekst(5, 'kml') === '20 km/l', '5 l/100 = 20 km/l', K.verbruikTekst(5, 'kml'));
  eis(K.verbruikTekst(0, 'kml') === '—', 'nul is geen verbruik');
  eis(/kort/.test(K.promptRegel({ rapport: 'kort' })) && K.promptRegel({ rapport: 'normaal' }) === '' && K.promptRegel({}) === '', 'rapportvorm alleen als er iets gekozen is');
  eis(V.scanBekend() === 'vragen' && V.samenvatting() === true && V.promptRegel() === '', 'zonder voorkeur: vragen, samenvatting tonen, geen promptregel');
  eis(V.druk() === 'bar', 'zonder voorkeur: druk in bar');
  eis(JSON.stringify(K.schoon({ druk: 'psi' })) === '{"druk":"psi"}' && !('druk' in K.schoon({ druk: 'atm' })), 'druk: bar of psi, niets anders', JSON.stringify(K.schoon({ druk: 'atm' })));

  console.log('\n6. De vaste sensorselectie van een voertuig');
  const gemeld = [];
  const L = laad({
    activePIDs: new Set(['0104']), manualPIDs: new Set(['0104']), supportedPIDs: new Set(['010C', '010D', '0105', '015E']),
    pidGate: (p) => p !== '015E', plSelectieVoor: () => 'voor', plSelectieMeld: (v, w) => gemeld.push(w),
    buildPIDList: () => { }, renderGauges: () => { }, rebuildGSel: () => { }, showToast: () => { }
  });
  const n = L.V.selectieToepassen(['010C', '0105', '015E', '0142'], 'Blauwe Mazda');
  eis(n === 2 && JSON.stringify([...L.s.activePIDs]) === '["010C","0105"]', 'alleen wat de auto meldt én de poort kiesbaar vindt', JSON.stringify([...L.s.activePIDs]));
  eis(gemeld[0] === 'de vaste selectie van Blauwe Mazda', 'de wijziging gaat via de gedeelde melder (logboek)');
  const L2 = laad({ activePIDs: new Set(['0104']), manualPIDs: new Set(), supportedPIDs: new Set(['010C']), pidGate: () => true });
  eis(L2.V.selectieToepassen(['0199'], 'x') === 0 && L2.s.activePIDs.has('0104'), 'past er niets van, dan blijft de huidige selectie staan');
  // Berekende en eigen PIDs meldt de auto niet, maar ze staan wel in de
  // keuzelijst (27-09-2026): die horen er dan ook bij.
  const L3 = laad({ activePIDs: new Set(), manualPIDs: new Set(), supportedPIDs: new Set(['010C']), pidGate: () => true,
    discoveredPIDDefs: [{ pid: '010C' }, { pid: 'CA03' }, { pid: '221E1C' }] });
  const n3 = L3.V.selectieToepassen(['010C', 'CA03', '221E1C', '229999'], 'x');
  eis(n3 === 3 && L3.s.activePIDs.has('221E1C') && L3.s.activePIDs.has('CA03') && !L3.s.activePIDs.has('229999'),
    'eigen en berekende PIDs uit de keuzelijst gaan mee, een onbekende code niet', JSON.stringify([...L3.s.activePIDs]));

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
