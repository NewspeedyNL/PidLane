// test-meetvenster.js — een opdracht rekent alleen op wat er ná het kiezen gemeten is (#277)
//
// Op 23-09-2026 kreeg "De adapter er even uit" binnen 3 s na het kiezen
// "gesloten", op 162 monsters van de opdracht ervoor, zonder dat de adapter
// eruit was geweest. "De goedkope adapter" werd op de MX+ beoordeeld. Oorzaak:
// PLOpdracht.meet() las PLRit.per(), en dat is de hele rit.
//
// Deze test laadt de échte PLRit (pidlane-testrun.js) en de échte opdracht-
// module (pidlane-opdracht.js) in één omgeving en speelt die rit na.
//
// Draaien vanuit public/:  node test-meetvenster.js   (exit 0 = goed)
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

const T0 = 1700000000000;

function laad() {
  const s = {};
  s.window = s;
  s.connected = true; s.demoMode = false; s._trBezig = false;
  // De versheidsbron zoals in test-rit.js: elke schrijfactie in pidVals zet
  // een stempel op de klok van de lopende tik.
  s._pidLastUpd = {};
  s._klokNu = T0;
  s.pidVals = new Proxy({}, {
    set: function (o, k, v) { o[k] = v; s._pidLastUpd[k] = s._klokNu; return true; },
    deleteProperty: function (o, k) { delete o[k]; delete s._pidLastUpd[k]; return true; }
  });
  s.console = { warn: function () {}, error: function () {}, log: function () {} };
  s.localStorage = { getItem: function () { return null; }, setItem: function () {}, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} } }; },
    querySelectorAll: function () { return []; }
  };
  s.setInterval = function () { return 0; };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  // Eén klok voor alles. kies() opent het venster met Date.now(), en de tikken
  // lopen op _klokNu; zonder dit valt een gat uit de test "vóór" het venster.
  const EchteDate = Date;
  s.Date = class extends EchteDate {
    constructor(...a) { if (a.length) super(...a); else super(s._klokNu); }
    static now() { return s._klokNu; }
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLRit || typeof s.PLRit.markeer !== 'function') {
    console.log('  FOUT  PLRit.markeer() bestaat niet — er is geen meetvenster (#277)');
    process.exit(1);
  }
  // De opdrachtmodule, met de lijst uit een nagemaakte Worker.
  s.featOn = function () { return true; };
  s.PROXY_URL = 'https://proxy';
  s.adapterNaam = 'OBDLink MX+ 90011';
  s._plLogAdapter = function () { return s.adapterNaam; };
  s.plFetch = function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ opdrachten: RIJEN }); } });
  };
  vm.runInContext(fs.readFileSync('pidlane-opdracht.js', 'utf8'), s, { filename: 'pidlane-opdracht.js' });
  return s;
}

// Drie opdrachten zoals ze in D1 staan, ingekort tot wat hier getoetst wordt.
const TOERENTAL = { naam: 'het toerental is echt gevolgd', pid: '010C', meet: 'veranderingen', tussen: [10, 1000000] };
const RIJEN = [
  { id: 'd', naam: 'Toerental gevolgd', opdracht: JSON.stringify({ schema: 2, naam: 'Toerental gevolgd',
      sensoren: ['010C'], duurS: 60, proeven: [TOERENTAL] }) },
  { id: 'b', naam: 'De adapter er even uit', opdracht: JSON.stringify({ schema: 2, naam: 'De adapter er even uit',
      sensoren: ['010C'], duurS: 300, proeven: [TOERENTAL],
      voorwaarden: [{ wat: 'de adapter is er even uit geweest', gebeurtenis: 'onderbreking', minS: 10 }] }) },
  { id: 'c', naam: 'De goedkope adapter', opdracht: JSON.stringify({ schema: 2, naam: 'De goedkope adapter',
      sensoren: ['010C'], duurS: 300, proeven: [TOERENTAL],
      voorwaarden: [{ wat: 'de kloon zit erin, niet de MX+', adapter: 'OBDLink', niet: true }] }) }
];

// Een rit: elke tik is 5 s, en een draaiende motor schrijft een wisselend toerental.
function rij(s, tikken, meten) {
  for (let i = 0; i < tikken; i++) {
    s._klokNu += 5000;
    if (meten !== false) s.pidVals['010C'] = 800 + ((s._klokNu / 5000) % 7) * 50;
    s.PLRit.tik(s._klokNu);
  }
}

(async function () {
  console.log('1. Kiezen is beginnen');
  {
    const s = laad();
    await s.PLOpdracht.lijst();
    rij(s, 40);                                  // twintig minuten data vóór de keuze… nou ja, 200 s
    s.PLOpdracht.kies('d');
    const o = s.PLOpdracht.actief();
    const direct = s.PLOpdracht.oordeel(o);
    toets('direct na het kiezen is er nog geen antwoord',
      direct.staat === 'nog niet',
      'kreeg "' + direct.staat + '": ' + direct.reden + ' — dat is de fout van 23-09: het oordeel over een andere rit');
    toets('het oordeel draagt zijn venster', !!(direct.venster && typeof direct.venster.start === 'number'));
    rij(s, 20);
    const later = s.PLOpdracht.oordeel(o);
    toets('na een eigen stuk rit wel', later.staat === 'gesloten', later.staat + ': ' + later.reden);
    const aantal = s.PLRit.venster(s._klokNu).per['010C'].n;
    toets('en dan telt alleen wat er ná de keuze gemeten is', aantal < 20,
      aantal + ' monsters in het venster, terwijl de rit er ' + s.PLRit.per()['010C'].n + ' heeft');
  }

  console.log('\n2. Een opdracht over een onderbreking vraagt een onderbreking');
  {
    const s = laad();
    await s.PLOpdracht.lijst();
    s.PLOpdracht.kies('b');
    rij(s, 30);
    const zonder = s.PLOpdracht.oordeel(s.PLOpdracht.actief());
    toets('zonder dat de adapter eruit was: nog niet', zonder.staat === 'nog niet', zonder.staat + ': ' + zonder.reden);
    toets('en de reden zegt dat', /geen onderbreking/.test(zonder.reden), zonder.reden);

    rij(s, 4, false);                             // 20 s geen data: de adapter is eruit
    rij(s, 10);
    const met = s.PLOpdracht.oordeel(s.PLOpdracht.actief());
    toets('met een meetgat van 20 s: gesloten', met.staat === 'gesloten', met.staat + ': ' + met.reden);

    s.PLOpdracht.kies('b');                       // opnieuw kiezen = nieuw venster, oude gat telt niet
    rij(s, 10);
    const opnieuw = s.PLOpdracht.oordeel(s.PLOpdracht.actief());
    toets('opnieuw kiezen neemt het oude gat niet mee', opnieuw.staat === 'nog niet', opnieuw.staat + ': ' + opnieuw.reden);
  }

  console.log('\n3. Een opdracht over een adapter vraagt die adapter');
  {
    const s = laad();
    await s.PLOpdracht.lijst();
    s.PLOpdracht.kies('c');
    rij(s, 20);
    let u = s.PLOpdracht.oordeel(s.PLOpdracht.actief());
    toets('met de MX+ erin: nog niet', u.staat === 'nog niet', u.staat + ': ' + u.reden);
    s.adapterNaam = 'OBDII';
    u = s.PLOpdracht.oordeel(s.PLOpdracht.actief());
    toets('met de kloon erin: gesloten', u.staat === 'gesloten', u.staat + ': ' + u.reden);
    s.adapterNaam = 'onbekend';
    const vw = s.PLOpdracht.voorwaarden(s.PLOpdracht.actief())[0];
    toets('adapter onbekend is niet na te gaan, geen nee', vw.vervuld === null, JSON.stringify(vw));
  }

  console.log('\n4. De keurder kent de twee nieuwe soorten');
  {
    const s = laad();
    const k = function (vw) {
      return s.PLOpdracht.keur({ schema: 2, naam: 'x', sensoren: ['010C'], duurS: 60, voorwaarden: [vw] });
    };
    toets('een gebeurtenis mag', k({ wat: 'w', gebeurtenis: 'meetgat' }).ok === true);
    toets('een adapter mag', k({ wat: 'w', adapter: 'vLinker' }).ok === true);
    toets('een onbekende gebeurtenis niet', k({ wat: 'w', gebeurtenis: 'ontploffing' }).ok === false);
    toets('twee soorten tegelijk niet', k({ wat: 'w', gebeurtenis: 'meetgat', pid: '010C', meet: 'max', tussen: [0, 1] }).ok === false);
    toets('`niet` moet een ja/nee zijn', k({ wat: 'w', adapter: 'x', niet: 'ja' }).ok === false);
  }

  console.log('\n5. Het scherm zegt wat er verzonden wordt');
  {
    const s = laad();
    vm.runInContext(fs.readFileSync('pidlane-meetkamer.js', 'utf8'), s, { filename: 'pidlane-meetkamer.js' });
    const M = s.PLMeetkamer;
    if (!M || typeof M.eindoordeel !== 'function') {
      toets('PLMeetkamer.eindoordeel bestaat', false, 'zonder die functie volgt het grote cijfer alleen de proeven');
    } else {
      /* De toestand van 23-09: alle proeven groen, een voorwaarde niet. */
      const proefstand = { staat: 'ja', goed: 3, totaal: 3, kop: 'binnen bereik', regel: 'deze rit beantwoordt de vraag' };
      const vonnis = { staat: 'nog niet', reden: '1 van de 1 voorwaarden niet vervuld',
        voorwaarden: [{ wat: 'de adapter is er even uit geweest', vervuld: false, detail: 'geen onderbreking in dit venster van 3:12' }],
        venster: { start: T0, s: 192 } };
      const e = M.eindoordeel(proefstand, { vonnis: vonnis });
      toets('proeven groen, voorwaarde niet: het grote cijfer is niet groen', e.staat !== 'ja', JSON.stringify(e));
      toets('het zegt NOG NIET', e.kop === 'NOG NIET', e.kop);
      toets('en noemt wat er ontbreekt', /adapter is er even uit/.test(e.regel), e.regel);
      toets('gesloten is groen', M.eindoordeel(proefstand, { vonnis: { staat: 'gesloten', reden: '', voorwaarden: [] } }).staat === 'ja');
      toets('het venster staat in beeld', /3:12/.test(M.vensterRegel({ start: T0 }, 900, T0 + 192000)),
        M.vensterRegel({ start: T0 }, 900, T0 + 192000));

      /* En het scherm zelf: de échte html() met die toestand. Zonder deze
         toets kon eindoordeel() kloppen terwijl _vraag() hem niet aanriep. */
      let h = '';
      try {
        h = M.html({ nu: T0 + 192000, opdracht: { naam: 'De adapter er even uit', reden: '', duurS: 900,
            sensoren: ['010C'], proeven: [{ naam: 'toerental gevolgd', pid: '010C', meet: 'veranderingen', tussen: [10, 1e6], issue: '#133' }] },
          herkomst: { id: 'b' }, reden: '', toggleAan: true,
          uitslagen: [{ naam: 'toerental gevolgd', issue: '#133', staat: 'ok', detail: '', pid: '010C', maat: 'veranderingen', waarde: 40, lo: 10, hi: 1e6, n: 40 }],
          verzend: { o: { naam: 'De adapter er even uit' }, vonnis: vonnis, alVerzonden: false },
          live: { ok: true, status: 200, aantal: 1, tijd: T0, fout: '' }, log: [], proeven: [], bezig: true, bron: '', ritId: 'r1' });
      } catch (err) { h = 'html() gooide: ' + err.message; }
      const cijfer = (h.match(/class="mk-cijfer" style="color:([^"]+)"/) || [])[1];
      toets('op het scherm: het cijfer is niet groen', !!cijfer && cijfer !== 'var(--gn)', 'kleur: ' + cijfer);
      toets('op het scherm: NOG NIET en het venster', /NOG NIET/.test(h) && /3:12/.test(h), h.slice(0, 300));

      const af = M.afgebroken({ o: { naam: 'De adapter er even uit' }, vonnis: vonnis, alVerzonden: false });
      toets('wisselen zonder verzenden heet afgebroken', /afgebroken na 3:12 min, niet verzonden/.test(af), af);
      toets('wisselen ná verzenden niet', M.afgebroken({ o: { naam: 'x' }, vonnis: vonnis, alVerzonden: true }) === '');
    }
  }

  console.log('\n' + (n - fout) + '/' + n + ' goed');
  process.exit(fout ? 1 : 0);
})();
