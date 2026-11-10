// ══════════════════════════════════════════════════════════════════
// test-strook.js — PLStrook: de stappenstrook van stil verbinden
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-strook.js in een vm met een kleine DOM. Toetst de
// pure kern (wanneer klapt hij in, wat zegt het stoplicht, nooit een
// kentekenveld tijdens het rijden) en het gedrag: een fout markeert de
// lopende stap, aftellen met "altijd automatisch" verbindt meteen, en de
// foutcodes worden één keer per dag gelezen. Sinds 08-11-2026 laadt hij
// ook de echte pidlane-identiteit.js: of de strook het kenteken vraagt,
// hangt aan PLIdentiteit en niet meer aan een losse vlag.
//
// Draaien vanuit public/:  node test-strook.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-strook.js'), 'utf8');
const bronId = fs.readFileSync(path.join(__dirname, 'pidlane-identiteit.js'), 'utf8');
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
  // innerHTML zetten bouwt het kentekenveld opnieuw, zoals een browser:
  // een nieuw element met de value uit de HTML. Zo is "invoer blijft staan
  // bij een herteken" iets wat hier rood kán worden.
  const maak = (id) => {
    let html = '';
    return { id, hidden: false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {},
      get innerHTML() { return html; },
      set innerHTML(h) {
        html = String(h);
        const m = html.match(/id="plStrookKent"[^>]*?value="([^"]*)"/);
        if (/id="plStrookKent"/.test(html)) elementen.plStrookKent = { value: m ? m[1] : '' };
        else delete elementen.plStrookKent;
      } };
  };
  const s = {
    console: { warn() {}, log() {} },
    setTimeout: (f) => { if (o.nuTimers) f(); return 1; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Promise, Date, JSON, Math, String, Number, isFinite, Error,
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: {
      getElementById: (id) => elementen[id] || null,
      createElement: () => maak('nieuw'),
      body: { appendChild: (e) => { elementen[e.id] = e; } }
    },
    demoMode: !!o.demo, connected: !!o.verbonden, pidVals: o.pidVals || {},
    Capacitor: { isNativePlatform: () => o.native !== false },
    vehicleInfo: o.vehicleInfo || {},
    btDiag() {}
  };
  s.window = s; s.opslag = opslag; s.elementen = elementen;
  vm.createContext(s);
  vm.runInContext(bronId, s);
  vm.runInContext(bron, s);
  // Standaard een verbinding met een bekend kenteken; kentOnbekend = een
  // nieuwe auto waarvan nog niemand het kenteken zei.
  s.PLIdentiteit.begin(false);
  if (!o.kentOnbekend) s.PLIdentiteit.bevestig('TEST01');
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

  console.log('\n6. Kenteken in de strook (PLIdentiteit)');
  {
    const s = metFoutcodes({ kentOnbekend: true });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('nieuwe auto in stilstand: het invoerveld staat er', /plStrookKent"/.test(s.elementen.plStrook.innerHTML));
    toets('en de strook klapt niet in', !s.PLStrook._kern.inklappen(s.PLStrook.staat().st));
  }
  {
    const s = metFoutcodes({});
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: kenteken van deze auto bekend → geen invoerveld', !/plStrookKent"/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({ kentOnbekend: true, opslag: { pl_kenteken: 'OUD123' } });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    const h = s.elementen.plStrook.innerHTML;
    toets('vorige auto: het laatste kenteken alleen als voorinvulling met "controleer"', /value="OUD123"/.test(h) && /controleer/.test(h), h.slice(0, 300));
    toets('en Auto staat niet op ok met dat kenteken', s.PLStrook.staat().st.stappen.find(x => x.id === 'auto').status !== 'ok');
  }
  {
    const s = metFoutcodes({ kentOnbekend: true, pidVals: { '010D': 80 } });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: rijdend geen invoerveld', !/plStrookKent"/.test(s.elementen.plStrook.innerHTML) && /stilstaat/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({ kentOnbekend: true });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    s.elementen.plStrookKent = { value: 'xx-12-yz' };
    s.elementen.plStrookKentSt = { textContent: '' };
    let gevraagd = null;
    // Zoals de echte rdwLookup: opzoeken = bevestigen.
    s.rdwLookup = (a, b) => { gevraagd = b.kenteken; s.PLIdentiteit.bevestig(b.kenteken); s.vehicleInfo.merk = 'Mazda'; return Promise.resolve({ ok: true }); };
    let herijkt = 0; s.herijkPidGate = () => { herijkt++; };
    await s.PLStrook._kenteken();
    const auto = s.PLStrook.staat().st.stappen.find(x => x.id === 'auto');
    toets('opgezocht met het schone kenteken', gevraagd === 'XX12YZ', gevraagd);
    toets('de zeef opnieuw (brandstof is nu bekend)', herijkt === 1);
    toets('Auto krijgt het vinkje met merk en kenteken', auto.status === 'ok' && /Mazda/.test(auto.tekst) && /XX12YZ/.test(auto.tekst), JSON.stringify(auto));
    toets('PLIdentiteit kent het kenteken nu', s.PLIdentiteit.bekend() && s.PLIdentiteit.kenteken() === 'XX12YZ');
  }
  {
    const s = metFoutcodes({ kentOnbekend: true });
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    s.elementen.plStrookKent = { value: 'AB-12-CD' };
    s.PLStrook.stap('codes', 'ok', 'later klaar');   // herteken terwijl de klant typt
    toets('een herteken wist getypte invoer niet', s.elementen.plStrookKent.value === 'AB-12-CD');
  }

  console.log('\n7. Een nieuwe auto: Inrichten als knop, niet als venster');
  {
    const s = metFoutcodes({ vehicleInfo: { vin: 'JMZZZZZZZJX000001' } });
    let rijden = 0;
    s.PLInrichten = { nodig: () => true, rijdenStil: () => { rijden++; }, open() {} };
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('knop Inrichten in de strook', /plStrookInricht/.test(s.elementen.plStrook.innerHTML));
    toets('en de strook klapt niet weg voordat de klant koos', !s.PLStrook._kern.inklappen(s.PLStrook.staat().st));
    s.PLStrook._nietNu();
    toets('Niet nu = Meteen rijden, bewaard', rijden === 1 && !/plStrookInricht/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({ kentOnbekend: true, vehicleInfo: {} });
    s.PLInrichten = { nodig: () => true, rijdenStil() {}, open() {} };
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: geen VIN en geen kenteken → nog geen Inrichten (sleutel zou "onbekend" zijn)', !/plStrookInricht/.test(s.elementen.plStrook.innerHTML));
  }
  {
    const s = metFoutcodes({ vehicleInfo: { vin: 'JMZZZZZZZJX000001' } });
    s.PLInrichten = { nodig: () => false, rijdenStil() {}, open() {} };
    s.PLStrook.start();
    await s.PLStrook.naVerbinding({});
    toets('TEGENPROEF: al ingericht → geen knop', !/plStrookInricht/.test(s.elementen.plStrook.innerHTML));
  }

  console.log('\n9. Doek achter de strook, en weg als het klaar is (09-11-2026)');
  {
    const K2 = laad().PLStrook._kern;
    const st = K2.nieuw();
    toets('nieuw: afdekken (alles wacht nog)', K2.afdekken(st));
    K2.zet(st, 'adapter', 'bezig');
    toets('tijdens een stap: afdekken', K2.afdekken(st));
    const fo = K2.nieuw(); fo.fout = 'x';
    toets('TEGENPROEF: bij een fout geen doek', !K2.afdekken(fo));
    const vr = K2.nieuw(); vr.vraag = 'kenteken';
    toets('TEGENPROEF: bij een kentekenvraag geen doek', !K2.afdekken(vr));
    const le = K2.nieuw(); K2.zet(le, 'protocol', 'let');
    toets('TEGENPROEF: verbindscherm neemt over ("let") → geen doek', !K2.afdekken(le));
    const ok = K2.nieuw(); ok.stappen.forEach(x => { x.status = 'ok'; });
    toets('TEGENPROEF: alles klaar → geen doek', !K2.afdekken(ok));
    toets('TEGENPROEF: zonder staat geen doek', !K2.afdekken(null));
  }
  {
    const s = laad();
    s.PLStrook.start();
    toets('start: het doek ligt er', s.elementen.plStrookDoek && !s.elementen.plStrookDoek.hidden);
    toets('en de strook heeft een knop Stoppen', /id="plStrookStop"/.test(s.elementen.plStrook.innerHTML));
    let gestopt = 0; s.plVerbindStop = () => { gestopt++; return true; };
    await s.PLStrook._stop();
    toets('Stoppen roept plVerbindStop aan', gestopt === 1);
    s.PLStrook.fout('stuk');
    toets('na een fout: geen knop Stoppen meer (er loopt niets)', !/plStrookStop/.test(s.elementen.plStrook.innerHTML));
    toets('na een fout: doek weg, strook blijft', s.elementen.plStrookDoek.hidden && !s.elementen.plStrook.hidden);
  }
  {
    const s = laad({ nuTimers: true });
    s.PLStrook.start();
    ['adapter', 'protocol', 'auto', 'klaar', 'codes'].forEach(id => s.PLStrook.stap(id, 'ok'));
    toets('alles ok: de strook is helemaal weg', s.elementen.plStrook.hidden && !s.PLStrook.staat().open, JSON.stringify(s.PLStrook.staat()));
    toets('en het doek ook', s.elementen.plStrookDoek.hidden);
    toets('de laatste verbinding blijft leesbaar (blok 5)', !!s.PLStrook.staat().st);
  }

  console.log('\n10. Weg zodra de auto verbonden is en niets meer loopt (10-11-2026)');
  {
    const K3 = laad().PLStrook._kern;
    const le = K3.nieuw(); le.stappen.forEach(x => { x.status = 'ok'; }); K3.zet(le, 'codes', 'let', 'Niet gelezen');
    toets('een "let" en verbonden → mag weg', K3.magWeg(le, true));
    toets('TEGENPROEF: een "let" en (nog) niet verbonden → blijft', !K3.magWeg(le, false));
    const bz = K3.nieuw(); K3.zet(bz, 'klaar', 'bezig');
    toets('TEGENPROEF: er loopt nog een stap → blijft, ook verbonden', !K3.magWeg(bz, true));
    const vr = K3.nieuw(); vr.stappen.forEach(x => { x.status = 'ok'; }); vr.vraag = 'kenteken';
    toets('TEGENPROEF: een open kentekenvraag → blijft', !K3.magWeg(vr, true));
    const ir = K3.nieuw(); ir.stappen.forEach(x => { x.status = 'ok'; }); ir.inricht = true;
    toets('TEGENPROEF: de knop Inrichten → blijft', !K3.magWeg(ir, true));
    const fo = K3.nieuw(); fo.fout = 'stuk';
    toets('TEGENPROEF: een fout → blijft', !K3.magWeg(fo, true));
    const ok = K3.nieuw(); ok.stappen.forEach(x => { x.status = 'ok'; });
    toets('alles ok, ook zonder verbinding → mag weg', K3.magWeg(ok, false));
  }
  {
    const s = laad({ nuTimers: true, verbonden: true });
    s.PLStrook.start();
    ['adapter', 'protocol', 'auto', 'klaar'].forEach(id => s.PLStrook.stap(id, 'ok'));
    s.PLStrook.stap('codes', 'let', 'Niet gelezen');
    toets('verbonden met een "let" bij Foutcodes: de strook gaat weg', s.elementen.plStrook.hidden && !s.PLStrook.staat().open, JSON.stringify(s.PLStrook.staat()));
  }
  {
    const s = laad({ verbonden: true });
    s.PLStrook.start();
    ['adapter', 'protocol', 'auto', 'klaar'].forEach(id => s.PLStrook.stap(id, 'ok'));
    s.PLStrook.stap('codes', 'let', 'Niet gelezen');
    s.PLStrook._wissel();
    toets('inklappen als er niets meer loopt = wegdoen, geen "Verbinden ▾"', s.elementen.plStrook.hidden && !s.PLStrook.staat().open, JSON.stringify(s.PLStrook.staat()));
  }
  {
    const s = laad({ verbonden: true });
    s.PLStrook.start();
    s.PLStrook._wissel();
    toets('TEGENPROEF: tijdens het verbinden klapt hij gewoon in', !s.elementen.plStrook.hidden && s.PLStrook.staat().ingeklapt, JSON.stringify(s.PLStrook.staat()));
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen ok'));
  process.exit(fout ? 1 : 0);
})();
