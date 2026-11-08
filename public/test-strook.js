// ══════════════════════════════════════════════════════════════════
// test-strook.js — PLStrook: de stappenstrook van stil verbinden
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-strook.js in een vm met een kleine DOM. Toetst de
// pure kern (wanneer klapt hij in, wat zegt het stoplicht, nooit een
// kentekenveld tijdens het rijden) en het gedrag: een fout markeert de
// lopende stap, aftellen met "altijd automatisch" verbindt meteen, en de
// foutcodes worden één keer per dag gelezen.
//
// Draaien vanuit public/:  node test-strook.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-strook.js'), 'utf8');
let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}

function laad(o) {
  o = o || {};
  const opslag = Object.assign({}, o.opslag);
  const elementen = {};
  const maak = (id) => ({ id, hidden: false, innerHTML: '', classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} });
  const s = {
    console: { warn() {}, log() {} },
    setTimeout: (f) => { if (o.nuTimers) f(); return 1; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Promise, Date, JSON, Math, String, Number, isFinite, Error,
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: {
      getElementById: (id) => elementen[id] || null,
      createElement: () => maak('nieuw'),
      body: { appendChild: (e) => { elementen.plStrook = e; e.id = 'plStrook'; } }
    },
    demoMode: !!o.demo, connected: !!o.verbonden, pidVals: o.pidVals || {},
    Capacitor: { isNativePlatform: () => o.native !== false },
    vehicleInfo: o.vehicleInfo || {},
    btDiag() {}
  };
  s.window = s; s.opslag = opslag; s.elementen = elementen;
  vm.createContext(s);
  vm.runInContext(bron, s);
  return s;
}

(async () => {
  console.log('\n1. De pure kern');
  const K = laad().PLStrook._kern;
  toets('vijf stappen in de volgorde van het ontwerp', K.STAPPEN.map(x => x.id).join(',') === 'adapter,protocol,auto,klaar,codes');
  const st = K.nieuw();
  toets('nieuw: alles wacht, niet ingeklapt', st.stappen.every(x => x.status === 'wacht') && !K.inklappen(st));
  K.STAPPEN.forEach(x => K.zet(st, x.id, 'ok'));
  toets('alles ok → inklappen', K.inklappen(st));
  K.zet(st, 'codes', 'over');
  toets('ok en overgeslagen → ook inklappen', K.inklappen(st));
  K.zet(st, 'codes', 'let');
  toets('TEGENPROEF: een let bij Foutcodes houdt hem open', !K.inklappen(st));
  K.zet(st, 'codes', 'ok'); st.vraag = 'kenteken';
  toets('TEGENPROEF: een open kentekenvraag houdt hem open', !K.inklappen(st));
  st.vraag = null; st.fout = 'weg';
  toets('TEGENPROEF: een fout houdt hem open', !K.inklappen(st));
  let gooit = false; try { K.zet(K.nieuw(), 'bestaatniet', 'ok'); } catch (e) { gooit = true; }
  toets('een onbekende stap is een fout, geen stille no-op', gooit);
  gooit = false; try { K.zet(K.nieuw(), 'adapter', 'groen'); } catch (e) { gooit = true; }
  toets('een onbekende status ook', gooit);

  toets('stoplicht groen → ok', K.foutcodeRegel({ kleur: 'groen', kop: 'Alles in orde' }).status === 'ok');
  toets('stoplicht rood → fout', K.foutcodeRegel({ kleur: 'rood', kop: '1 storing gevonden' }).status === 'fout');
  toets('stoplicht oranje → let', K.foutcodeRegel({ kleur: 'oranje', kop: 'Let op' }).status === 'let');
  toets('TEGENPROEF: grijs (niet gelezen) is nooit ok', K.foutcodeRegel({ kleur: 'grijs', kop: 'Nog niet uitgelezen' }).status === 'let');
  toets('geen stoplicht → niet gelezen', K.foutcodeRegel(null).status === 'let');

  toets('aftellen: half', Math.abs(K.aftelDeel(0, 2500, 5000) - 0.5) < 1e-9);
  toets('aftellen: nooit boven 1 of onder 0', K.aftelDeel(0, 9000, 5000) === 1 && K.aftelDeel(100, 0, 5000) === 0);

  toets('kenteken in stilstand: ja', K.magKentekenVragen(0));
  toets('kenteken zonder snelheid: ja (zoals PLOpstart)', K.magKentekenVragen(undefined));
  toets('TEGENPROEF: kenteken tijdens het rijden: nee', !K.magKentekenVragen(50));

  const lees = (o) => (k) => (k in o ? o[k] : null);
  toets('bekende adapter in de app', K.bekendeAdapter(lees({ spp_address: 'AA' }), true));
  toets('TEGENPROEF: zonder adres het verbindscherm', !K.bekendeAdapter(lees({}), true));
  toets('TEGENPROEF: in de browser altijd het verbindscherm (Chrome vraagt de poort)', !K.bekendeAdapter(lees({ spp_address: 'AA' }), false));

  console.log('\n2. Een fout markeert de stap die bezig was');
  {
    const s = laad();
    s.PLStrook.start();
    s.PLStrook.stap('adapter', 'ok', 'OBDLink');
    s.PLStrook.stap('protocol', 'bezig');
    s.PLStrook.fout('De adapter reageert niet.');
    const ss = s.PLStrook.staat().st.stappen;
    const status = Object.fromEntries(ss.map(x => [x.id, x.status]));
    toets('protocol krijgt het kruis', status.protocol === 'fout', JSON.stringify(status));
    toets('de adapter blijft ok', status.adapter === 'ok');
    toets('wat nog moest, is overgeslagen', status.auto === 'over' && status.klaar === 'over' && status.codes === 'over');
    toets('de strook staat open met Opnieuw', /plStrookOpnieuw/.test(s.elementen.plStrook.innerHTML) && !s.elementen.plStrook.hidden);
    toets('actief() blijft waar zolang de fout staat', s.PLStrook.actief());
  }

  console.log('\n3. In de demo geen strook');
  {
    const s = laad({ demo: true });
    s.PLStrook.start();
    toets('niets gestart', !s.PLStrook.staat().st);
  }

  console.log('\n4. Aftellen');
  {
    const s = laad({ opslag: { pl_verbind_altijd: '1' } });
    let ging = 0;
    s.PLStrook.aftellen(() => { ging++; });
    toets('altijd automatisch: meteen verbinden', ging === 1 && !s.PLStrook.staat().aftel);
  }
  {
    const s = laad();
    let ging = 0;
    s.PLStrook.aftellen(() => { ging++; });
    toets('zonder vinkje: eerst aftellen, nog niet verbonden', ging === 0 && s.PLStrook.staat().aftel);
    toets('met Annuleren, Nu verbinden en het vinkje', /plStrookAnnuleer/.test(s.elementen.plStrook.innerHTML) && /plStrookAltijd/.test(s.elementen.plStrook.innerHTML) && /plStrookNu/.test(s.elementen.plStrook.innerHTML));
    s.PLStrook._annuleer();
    toets('Annuleren: niet verbinden, strook weg', ging === 0 && !s.PLStrook.staat().aftel && s.elementen.plStrook.hidden);
    s.PLStrook._altijd(true);
    toets('het vinkje wordt bewaard', s.opslag.pl_verbind_altijd === '1');
    s.PLStrook._altijd(false);
    toets('en weer weggehaald', !('pl_verbind_altijd' in s.opslag));
  }
  {
    const s = laad();
    let ging = 0;
    s.PLStrook.aftellen(() => { ging++; });
    s.PLStrook._nu();
    toets('Nu verbinden: meteen', ging === 1);
  }

  console.log('\n5. Na het verbinden: foutcodes één keer per dag, stil');
  function metFoutcodes(o) {
    const s = laad(o);
    s.gelezen = 0; s.dag = !!o.vandaag; s.venster = 0;
    s.PLFoutcodes = {
      scanStil: () => { s.gelezen++; return Promise.resolve(o.scan === undefined ? { codes: {} } : o.scan); },
      stoplicht: (x) => (x ? { kleur: o.kleur || 'groen', kop: o.kop || 'Alles in orde' } : { kleur: 'grijs' }),
      staat: () => ({ scan: o.vorig || null }), open() {}
    };
    s.PLOpstart = { checkVandaag: () => s.dag, checkGedaan: () => { s.dag = true; } };
    s.PLNav = { autoCheck: () => !!o.autoCheck, naVerbinding: () => { s.venster++; return true; } };
    return s;
  }
  const codes = (s) => s.PLStrook.staat().st.stappen.find(x => x.id === 'codes');
  {
    const s = metFoutcodes({});
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('eerste keer vandaag: stil gelezen', s.gelezen === 1 && s.venster === 0);
    toets('en de dag is gemarkeerd', s.dag === true);
    toets('groen → vinkje', codes(s).status === 'ok', JSON.stringify(codes(s)));
  }
  {
    const s = metFoutcodes({ vandaag: true, vorig: { codes: {} } });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: vandaag al gelezen → niet nog eens', s.gelezen === 0);
    toets('wel de vorige uitslag in de regel', /vandaag al gelezen/.test(codes(s).tekst), codes(s).tekst);
  }
  {
    const s = metFoutcodes({ kleur: 'rood', kop: '1 storing gevonden' });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('rood → regel rood en de strook blijft open', codes(s).status === 'fout' && !s.PLStrook.staat().ingeklapt);
    toets('de regel is aan te tikken', /data-stap="codes" onclick="PLStrook._codes\(\)"/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({});
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({ hervat: true });
    toets('TEGENPROEF: een hervatting midden in de rit leest niet', s.gelezen === 0 && codes(s).status === 'over');
  }
  {
    const s = metFoutcodes({ scan: null });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('uitlezen mislukt: let, en de dag is NIET gemarkeerd', codes(s).status === 'let' && s.dag === false);
  }
  {
    const s = metFoutcodes({ autoCheck: true });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('"Check na verbinden" aan: het venster zoals altijd, geen tweede uitlezing', s.venster === 1 && s.gelezen === 0);
  }

  console.log('\n6. Kenteken in de strook');
  {
    const s = metFoutcodes({});
    s._plKentNaCheck = true;
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('nieuwe auto in stilstand: het invoerveld staat er', /plStrookKent"/.test(s.elementen.plStrook.innerHTML));
    toets('en de strook klapt niet in', !s.PLStrook._kern.inklappen(s.PLStrook.staat().st));
  }
  {
    const s = metFoutcodes({ pidVals: { '010D': 80 } });
    s._plKentNaCheck = true;
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: rijdend geen invoerveld', !/plStrookKent"/.test(s.elementen.plStrook.innerHTML) && /stilstaat/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({});
    s._plKentNaCheck = true;
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    s.elementen.plStrookKent = { value: 'xx-12-yz' };
    s.elementen.plStrookKentSt = { textContent: '' };
    let gevraagd = null;
    s.rdwLookup = (a, b) => { gevraagd = b.kenteken; s.opslag.pl_kenteken = b.kenteken; s.vehicleInfo.merk = 'Mazda'; return Promise.resolve({ ok: true }); };
    let herijkt = 0; s.herijkPidGate = () => { herijkt++; };
    await s.PLStrook._kenteken();
    const auto = s.PLStrook.staat().st.stappen.find(x => x.id === 'auto');
    toets('opgezocht met het schone kenteken', gevraagd === 'XX12YZ', gevraagd);
    toets('de zeef opnieuw (brandstof is nu bekend)', herijkt === 1);
    toets('Auto krijgt het vinkje met merk en kenteken', auto.status === 'ok' && /Mazda/.test(auto.tekst) && /XX12YZ/.test(auto.tekst), JSON.stringify(auto));
    toets('de vlag van PLOpstart is weg', s._plKentNaCheck === false);
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen ok'));
  process.exit(fout ? 1 : 0);
})();
