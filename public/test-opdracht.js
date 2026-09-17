// ══════════════════════════════════════════════════════════════════
// test-opdracht.js — wat komt er binnen, en wat hoort er te stranden? (#241)
// ──────────────────────────────────────────────────────────────────
// WAAROM HIER HET ZWAARTEPUNT LIGT.
//
// `keur()` is het enige wat tussen een rij in Airtable en een meting op een
// rijdende auto staat. Wat hij doorlaat wordt uitgevoerd. Een fout hier is
// dus geen tikfout maar een gedragsverandering, en hij is van buiten
// onzichtbaar: de rit draait, het verslag komt binnen, en alleen de waarden
// kloppen niet met wat er gevraagd was.
//
// DE TOETS MOET ONDERSCHEIDEN, niet alleen kloppen. Een keurder die alles
// afwijst haalt elke "hoort te stranden"-toets en is toch stuk. Daarom staat
// naast elke afwijzing de bijna-identieke opdracht die er wél doorheen moet —
// dat is het verschil tussen een grens en een muur.
//
// WAT ER NIET IN STAAT. Geen eigen kopie van de grenzen: die worden bij de
// module opgevraagd (`_grenzen()`). Een test met overgeschreven grenzen blijft
// groen als de grens in de module verandert, en dan toetst hij zijn eigen
// verleden.
//
// Draaien vanuit public/:  node test-opdracht.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

function laad(extra) {
  const s = Object.assign({ PID_CONFIG: {} }, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  s.document = { addEventListener() { } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-opdracht.js', 'utf8'), s,
    { filename: 'pidlane-opdracht.js' });
  if (!s.PLOpdracht) { console.error('FOUT: PLOpdracht hangt niet naar buiten'); process.exit(1); }
  return s;
}

const s = laad();
const K = s.PLOpdracht.keur;
const G = s.PLOpdracht._grenzen();

// De opdracht die overal als vertrekpunt dient. Eén ding per geval veranderen
// is wat de gevallen vergelijkbaar maakt.
function goed(over) {
  return Object.assign({
    schema: 1,
    naam: 'boordspanning en looptijd',
    reden: '#217 — accu of adapter',
    sensoren: ['0142', '011F'],
    duurS: 300,
    tikS: 10,
    vragen: [{ id: 'startstop', tekst: 'Ging de motor uit bij stilstand?', opties: ['ja', 'nee', 'weet ik niet'] }],
    drempels: [{ pid: '0142', onder: 12.2, melding: 'boordspanning onder 12,2 V' }],
    proeven: [{ issue: '#217', naam: 'boordspanning blijft binnen bereik', pid: '0142', meet: 'min', tussen: [11.5, 15.2] }]
  }, over || {});
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. een goede opdracht komt er doorheen, en compleet');
// ══════════════════════════════════════════════════════════════════
{
  const r = K(goed());
  toets('de opdracht wordt goedgekeurd', r.ok === true, JSON.stringify(r.fouten || []));
  if (r.ok) {
    toets('sensoren komen er in hoofdletters uit', r.opdracht.sensoren.join(',') === '0142,011F');
    toets('de proef is overgenomen met zijn band',
      r.opdracht.proeven[0].tussen[0] === 11.5 && r.opdracht.proeven[0].tussen[1] === 15.2);
    toets('de vraag staat er met zijn opties', r.opdracht.vragen[0].opties.length === 3);
  }
  // Dezelfde opdracht als TEKST, want zo komt hij uit Airtable.
  const t = K(JSON.stringify(goed()));
  toets('en hij mag ook als JSON-tekst binnenkomen', t.ok === true, JSON.stringify(t.fouten || []));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. wat er moet stranden — met telkens het bijna-gelijke geval dat door moet');
// ══════════════════════════════════════════════════════════════════
{
  function strandt(naam, over, stuk) {
    const r = K(goed(over));
    const raak = r.ok === false && (!stuk || r.fouten.some(f => new RegExp(stuk, 'i').test(f)));
    toets(naam, raak, 'gaf: ' + JSON.stringify(r.ok ? 'GOEDGEKEURD' : r.fouten));
  }

  // DE BELANGRIJKSTE. Een sleutel die deze app niet kent betekent dat de
  // schrijver iets bedoelde wat hier niet gebeurt. Doorgaan met de rest zou
  // een meting opleveren die iets anders doet dan er staat.
  strandt('een onbekende sleutel wordt afgewezen', { script: 'alert(1)' }, 'onbekende sleutel');
  strandt('ook als hij onschuldig lijkt', { opmerking: 'even testen' }, 'onbekende sleutel');

  strandt('een ander schema wordt afgewezen', { schema: 2 }, 'schema');
  strandt('geen naam', { naam: '' }, 'naam');
  strandt('een naam over de grens', { naam: 'x'.repeat(G.naamMax + 1) }, 'naam');
  strandt('geen sensoren', { sensoren: [] }, 'sensoren');
  strandt('te veel sensoren', { sensoren: Array(G.sensorenMax + 1).fill('010C') }, 'sensoren');
  strandt('iets dat geen PID is', { sensoren: ['0142', 'rm -rf'] }, 'geen PID-code');
  strandt('een duur onder de ondergrens', { duurS: G.duurMin - 1 }, 'duurS');
  strandt('een duur boven de bovengrens', { duurS: G.duurMax + 1 }, 'duurS');
  strandt('een tik van 0 s', { tikS: 0 }, 'tikS');
  strandt('een vraag zonder tekst', { vragen: [{ id: 'x', tekst: '' }] }, 'tekst');
  strandt('een vraag-id met rare tekens', { vragen: [{ id: 'a b', tekst: 'ok' }] }, 'id');
  strandt('een drempel zonder grens', { drempels: [{ pid: '0142', melding: 'iets' }] }, 'onder');
  strandt('een drempel zonder melding', { drempels: [{ pid: '0142', onder: 1 }] }, 'melding');
  strandt('een proef met een onbekende maat',
    { proeven: [{ naam: 'x', pid: '0142', meet: 'gemiddelde', tussen: [1, 2] }] }, 'meet');
  strandt('een proef met een omgekeerde band',
    { proeven: [{ naam: 'x', pid: '0142', meet: 'min', tussen: [5, 1] }] }, 'tussen');
  // Niet via `strandt`: die bouwt altijd een geldige opdracht als basis. Deze
  // gevallen zijn juist de invoer die géén opdracht is.
  [null, 42, 'losse tekst', ['een', 'lijst']].forEach(function (w) {
    const r = K(w);
    toets('geen opdracht: ' + JSON.stringify(w) + ' strandt', r.ok === false,
      'gaf: ' + JSON.stringify(r.ok ? 'GOEDGEKEURD' : r.fouten));
  });

  // EN DE ANDERE KANT: bijna dezelfde opdracht die er wél door moet. Zonder
  // deze zes toetst hierboven alleen dat de keurder streng is, niet dat hij
  // onderscheidt.
  const doorMoet = [
    ['zonder reden', { reden: undefined }],
    ['zonder vragen', { vragen: undefined }],
    ['zonder drempels', { drempels: undefined }],
    ['zonder proeven', { proeven: undefined }],
    ['zonder tikS (die heeft een standaard)', { tikS: undefined }],
    ['op de grens van de duur', { duurS: G.duurMax }],
    ['met het maximum aan sensoren', { sensoren: Array(G.sensorenMax).fill('010C') }]
  ];
  doorMoet.forEach(function (g) {
    const r = K(goed(g[1]));
    toets('komt er wél doorheen: ' + g[0], r.ok === true, JSON.stringify(r.fouten || []));
  });

  // De standaard voor tikS staat in de module, niet hier.
  const zonderTik = K(goed({ tikS: undefined }));
  toets('tikS krijgt een standaard in plaats van undefined',
    zonderTik.ok && typeof zonderTik.opdracht.tikS === 'number', JSON.stringify(zonderTik.opdracht || {}));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. tekst die te groot of kapot is');
// ══════════════════════════════════════════════════════════════════
{
  const groot = 'x'.repeat(G.jsonMax + 1);
  const r = K(groot);
  toets('een tekst over de groottegrens wordt niet eens geparseerd',
    r.ok === false && /tekens/.test(r.fouten[0]), JSON.stringify(r.fouten));
  const kapot = K('{"schema":1,');
  toets('kapotte JSON levert een leesbare reden', kapot.ok === false && /JSON/.test(kapot.fouten[0]),
    JSON.stringify(kapot.fouten));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. de PID-tabel doet mee als hij er is');
// ══════════════════════════════════════════════════════════════════
{
  // Zonder getPidDef blijft de vormcontrole over — dat is de stand in een
  // losse test. Mét de echte ingang hoort een PID die de app niet kent te
  // stranden, want een opdracht die een onbekende sensor vraagt levert een
  // lege meting op.
  const tabel = { '0142': { naam: 'Boordspanning' }, '011F': { naam: 'Looptijd' } };
  const met = laad({ getPidDef: function (p) { return tabel[p] || null; } });
  const r1 = met.PLOpdracht.keur(goed());
  toets('bekende PIDs komen door', r1.ok === true, JSON.stringify(r1.fouten || []));
  const r2 = met.PLOpdracht.keur(goed({ sensoren: ['0142', '01FF'] }));
  toets('een PID die de app niet kent strandt', r2.ok === false && /kent deze app niet/.test(r2.fouten.join(' ')),
    JSON.stringify(r2.fouten || []));
  // TEGENPROEF: zonder tabel mag diezelfde opdracht er wél doorheen, anders
  // zou een ontbrekende tabel alles blokkeren en zou niemand weten waarom.
  const r3 = K(goed({ sensoren: ['0142', '01FF'] }));
  toets('TEGENPROEF: zonder getPidDef blijft alleen de vormcontrole over', r3.ok === true,
    JSON.stringify(r3.fouten || []));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. de schakelaar uit de Config');
// ══════════════════════════════════════════════════════════════════
{
  toets('zonder sleutel staat het ophalen aan', laad().PLOpdracht.toggleAan() === true);
  toets('de Config zet het uit', laad({ PID_CONFIG: { feat_opdracht: 'false' } }).PLOpdracht.toggleAan() === false);
  const metFeat = laad({ featOn: function (k) { return k !== 'feat_opdracht'; } });
  toets('featOn() wint als hij bestaat', metFeat.PLOpdracht.toggleAan() === false);
  toets('en de module vraagt de sleutel die beheer.html toont',
    laad().PLOpdracht._sleutel() === 'feat_opdracht');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6. meten tegen het ritbeeld');
// ══════════════════════════════════════════════════════════════════
{
  const m = laad({
    PLRit: { per: function () { return { '0142': { n: 40, min: 11.9, max: 14.4, laatst: 14.1, veranderingen: 33 } }; } }
  });
  m.PLRit = m.PLRit; // de module leest window.PLRit
  const binnen = m.PLOpdracht.meet({ pid: '0142', meet: 'min', tussen: [11.5, 15.2] });
  toets('binnen de band → ok', binnen.staat === 'ok' && /11\.9/.test(binnen.detail), JSON.stringify(binnen));
  const buiten = m.PLOpdracht.meet({ pid: '0142', meet: 'min', tussen: [12.2, 15.2] });
  toets('buiten de band → FOUT, met de gemeten waarde erbij',
    buiten.staat === 'FOUT' && /11\.9/.test(buiten.detail), JSON.stringify(buiten));
  const weg = m.PLOpdracht.meet({ pid: '010C', meet: 'max', tussen: [0, 7000] });
  toets('een PID die niet gemeten is → LET OP en geen nul',
    weg.staat === 'LET OP' && /niet gemeten/.test(weg.detail), JSON.stringify(weg));
  const geenRit = laad().PLOpdracht.meet({ pid: '0142', meet: 'min', tussen: [0, 1] });
  toets('zonder ritbeeld → LET OP, niet stil groen',
    geenRit.staat === 'LET OP' && /ritbeeld/.test(geenRit.detail), JSON.stringify(geenRit));
  // Elke maat uit de lijst moet werkelijk iets opleveren; een maat die de
  // module aanbiedt maar niet kan lezen is een belofte zonder dekking.
  m.PLOpdracht._maten().forEach(function (maat) {
    const r = m.PLOpdracht.meet({ pid: '0142', meet: maat, tussen: [-1e9, 1e9] });
    toets('de maat "' + maat + '" levert een waarde', r.staat === 'ok', JSON.stringify(r));
  });
}

// ══════════════════════════════════════════════════════════════════
console.log('\n7. ophalen: wat er gebeurt als de tabel iets doorgeeft');
// ══════════════════════════════════════════════════════════════════
// De gevaarlijkste van allemaal staat hieronder: een afgekeurde opdracht mag
// NIET stil terugvallen op de vorige. Doet hij dat wel, dan meet de rit iets
// anders dan er in de tabel staat en is dat verschil van buiten onzichtbaar.
(async function () {
  function metWorker(antwoorden) {
    const beurten = antwoorden.slice();
    const s2 = laad({
      PROXY_URL: 'https://w.test',
      plFetch: function () {
        const a = beurten.shift();
        if (a === 'stuk') return Promise.resolve({ ok: false, status: 502 });
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(a); } });
      }
    });
    return s2;
  }

  const goedeRij = { ok: true, id: 'rec1', naam: 'eerste', opdracht: JSON.stringify(goed()) };
  const stukkeRij = { ok: true, id: 'rec2', naam: 'tweede',
    opdracht: JSON.stringify(goed({ script: 'alert(1)' })) };

  {
    const w = metWorker([goedeRij]);
    const o = await w.PLOpdracht.haal();
    toets('een goede rij wordt de actieve opdracht', o && o.naam === goed().naam, JSON.stringify(o));
    toets('en de herkomst wijst naar de rij', (w.PLOpdracht.herkomst() || {}).id === 'rec1');
  }
  {
    const w = metWorker([goedeRij, stukkeRij]);
    await w.PLOpdracht.haal();
    const tweede = await w.PLOpdracht.haal();
    toets('een afgekeurde rij levert niets op', tweede === null);
    toets('en de VORIGE opdracht is ook weg', w.PLOpdracht.actief() === null,
      'stille terugval: de rit meet dan iets anders dan er in de tabel staat');
    toets('de reden zegt dat hij is afgekeurd', /afgekeurd/i.test(w.PLOpdracht.reden() || ''),
      w.PLOpdracht.reden());
  }
  {
    const w = metWorker([{ ok: true, opdracht: null, reden: 'geen actieve opdracht' }]);
    const o = await w.PLOpdracht.haal();
    toets('geen actieve rij is geen fout', o === null && !/afgekeurd/i.test(w.PLOpdracht.reden() || ''),
      w.PLOpdracht.reden());
  }
  {
    const w = metWorker(['stuk']);
    const o = await w.PLOpdracht.haal();
    toets('een 502 levert geen opdracht en een leesbare reden',
      o === null && /502|niet opgehaald/.test(w.PLOpdracht.reden() || ''), w.PLOpdracht.reden());
  }
  {
    const w = laad({ PROXY_URL: 'https://w.test', PID_CONFIG: { feat_opdracht: 'false' },
      plFetch: function () { w.gehaald = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); } });
    const o = await w.PLOpdracht.haal();
    toets('met de Config uit gaat er geen verzoek de deur uit',
      o === null && !w.gehaald && /Config/.test(w.PLOpdracht.reden() || ''), w.PLOpdracht.reden());
  }
  {
    const w = laad({ PROXY_URL: 'https://w.test' });   // geen plFetch
    const o = await w.PLOpdracht.haal();
    toets('zonder plFetch is dat een bedradingsfout en geen netwerkfout',
      o === null && /plFetch/.test(w.PLOpdracht.reden() || ''), w.PLOpdracht.reden());
  }

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                            : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
})();
