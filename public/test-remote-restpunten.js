// ══════════════════════════════════════════════════════════════════
// test-remote-restpunten.js — de vier restpunten van #602
// ──────────────────────────────────────────────────────────────────
// 1. Poll-set: elk request-poll is de volle wens van de expert. Tot 24-10
//    werd hij bij de eigen set opgeteld en die som werd de eigen set, dus
//    groeide hij per verzoek en ging er nooit iets af.
// 2. Buslock: PLBus.wait() geeft 0 na de time-out en "gaat tóch door". Voor
//    een verzoek van de expert is dat fout: dan lopen twee lezers door elkaar.
// 3. Lokaal: een lege respons op mode 03 gaf [] → "Geen foutcodes". Géén
//    antwoord is een fout; NO DATA blijft [] (dat zegt een ECU zonder codes).
// 4. Opname: de expert kan ook CA.., TL.. en mode 21 laten opnemen.
//
// Elk faalgeval staat naast het gewone geval dat moet blijven werken.
// Draaien vanuit public/:  node test-remote-restpunten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
function knipUit(bestand, van, tot, wat) {
  const bron = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}
const R = 'pidlane-remote.js';
const pollSetSrc = knipUit(R, 'function pollSet(eigen,expAlleen,wens){', 'function applyExpertPoll(m){', 'pollSet');
const lockSrc = knipUit(R, 'async function withBtLock(fn){', 'async function readSuffix(sfx){', 'withBtLock');
const recSrc = knipUit(R, 'async function answerRecord(m){', 'async function answerAnalyze(m){', 'answerRecord');
const remPidSrc = knipUit(R, 'function remPid(k){', 'function feed(pid,val){', 'remPid');
const dtcSrc = knipUit('pidlane-graph.js', 'async function realScanDTC(){', 'function renderDTC(){', 'realScanDTC');
const bitsSrc = knipUit('pidlane-bt.js', 'function plProtocolBits(id){', '// Puur. De CAN-adressen', 'plProtocolBits');

(async () => {
  console.log('\n1. Poll-set: vervangen, niet opstapelen');
  {
    const pollSet = new Function(pollSetSrc + '\nreturn pollSet;')();
    const eigen = new Set(['010C', '010D']);
    let r = pollSet(eigen, new Set(), ['0105', '010C']);
    toets('eerste wens: eigen ∪ wens', r.set.sort().join() === '0105,010C,010D', r.set.join());
    toets('alleen 0105 is van de expert', [...r.expAlleen].join() === '0105', [...r.expAlleen].join());
    r = pollSet(new Set(r.set), r.expAlleen, ['010B']);
    toets('tweede wens vervangt de eerste', r.set.sort().join() === '010B,010C,010D', r.set.join());
    let set = new Set(r.set), exp = r.expAlleen;
    for (let i = 0; i < 20; i++) { const w = ['01' + (0x10 + i).toString(16).toUpperCase()]; r = pollSet(set, exp, w); set = new Set(r.set); exp = r.expAlleen; }
    toets('twintig verzoeken → niet gegroeid', set.size === 3, set.size + ': ' + [...set].join());
    r = pollSet(set, exp, []);
    toets('afmelden → terug naar de eigen set', r.set.sort().join() === '010C,010D', r.set.join());
    r = pollSet(new Set(['010C', '010D']), new Set(), ['010C']);
    toets('wens die de klant al had → blijft van de klant', r.expAlleen.size === 0, [...r.expAlleen].join());
  }

  console.log('\n2. Buslock: remote gaat niet tóch door');
  {
    let gedraaid = 0, vrij = 0;
    const maak = (tok) => new Function('PLBus', lockSrc + '\nreturn withBtLock;')(
      { wait: async () => tok, release: () => { vrij++; } });
    let fout = null;
    try { await maak(0)(async () => { gedraaid++; }); } catch (e) { fout = e; }
    toets('bus bezet → fout, opdracht niet gedraaid', fout && gedraaid === 0, String(fout));
    const uit = await maak(7)(async () => { gedraaid++; return 'x'; });
    toets('bus vrij → opdracht draait en slot gaat vrij', uit === 'x' && gedraaid === 1 && vrij === 1);
  }

  console.log('\n3. Lokaal: geen antwoord op mode 03 is geen "nul codes"');
  async function lees(antwoord) {
    const s = { selectedNetwork: { id: '6' }, sendCmd: async () => antwoord };
    vm.createContext(s);
    vm.runInContext(bitsSrc + dtcSrc + '\nthis.realScanDTC = realScanDTC;', s);
    try { return { ok: true, v: await s.realScanDTC() }; } catch (e) { return { ok: false, e: String(e.message) }; }
  }
  {
    let r = await lees('');
    toets('lege respons → fout', !r.ok, JSON.stringify(r));
    r = await lees(null);
    toets('null-respons → fout', !r.ok, JSON.stringify(r));
    r = await lees('NO DATA');
    toets('NO DATA → [] (echt geen codes)', r.ok && Array.isArray(r.v) && r.v.length === 0, JSON.stringify(r));
  }

  console.log('\n4. Opname: ook CA.., TL.. en mode 21');
  {
    const uit = [];
    const ctx = {
      sendWs: (o) => uit.push(o), logA() {}, logUsage() {}, _remRecStatus() {},
      _recActive: false, _recSel: new Set(), activePIDs: new Set(['010C']),
      supportedPIDs: new Set(['010C', '0105']),
      getPidDef: (p) => ['010C', '0105', 'CA05', 'TL01', '210C'].includes(p) ? { name: p } : null,
      pidRecStartRec() { ctx._recActive = true; },
      setInterval: () => 1, clearInterval() {}
    };
    const f = new Function('ctx', 'with(ctx){' + remPidSrc + '\nlet _remRecStatT=null;\n' + recSrc + '\nreturn answerRecord;}')(ctx);
    await f({ action: 'start', reqId: 'r1', pids: ['0C', 'CA05', 'TL01', '210C', '<x>'] });
    const d = uit[0] && uit[0].data;
    const p = (d && d.pids) || [];
    toets('kale 0C → 010C', p.includes('010C'), JSON.stringify(d));
    toets('CA05, TL01 en 210C gaan mee', ['CA05', 'TL01', '210C'].every((k) => p.includes(k)), JSON.stringify(d));
    toets('rommel niet', !p.some((k) => /[<>]/.test(k)), JSON.stringify(d));
    toets('niet als 01CA05 of 01TL01', !p.some((k) => /^01(CA|TL)/.test(k)), JSON.stringify(d));
  }

  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
