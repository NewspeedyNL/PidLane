// ══════════════════════════════════════════════════════════════════
// test-demozandbak.js — in de demo wordt niets bewaard, en toch werkt alles
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// test-demoopslag.js toetst negen losse poorten, elk op zijn eigen plek.
// De zandbak in pidlane-demo.js (PLDemo) is de tweede lijn: één punt waar
// élke schrijfactie langskomt, zodat de volgende module die iets bewaart
// niet eerst een eigen poort nodig heeft. Wat hier moet blijven kloppen:
//
//   1. de opslaglaag: in de demo schrijven raakt het toestel niet, lezen ziet
//      wat de demo schreef, stoppen gooit het weg; de sessie van wie inlogt
//      en sessionStorage gaan gewoon door;
//   2. demoMode uit zonder plDemoStop() → de opslag gaat weer echt door (een
//      echte instelling mag nooit stil in een laag verdwijnen);
//   3. het netbesluit: lezen uit het klantplatform mag, schrijven niet; de AI,
//      het tegoed en de referentiemetingen gaan niet de deur uit — en de lijst
//      van leesacties wordt naast worker.js gelegd;
//   4. de vier haken — plFetch, apiFetch, plBewaarBestand en
//      registerSessionReport — met hun echte code uit de bron geknipt, elk
//      met de tegenproef buiten de demo;
//   5. start en stop: plDemoAan() zet de zandbak aan, plDemoStop() weer uit.
//
// Laadt het echte pidlane-demo.js. Draaien vanuit public/:
//   node test-demozandbak.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function bron(b) { return fs.readFileSync(path.join(__dirname, b), 'utf8'); }
function knip(bestand, van, tot, wat) {
  const s = bron(bestand);
  const a = s.indexOf(van), b = s.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden in ' + bestand + ' (anker verschoven?).'); process.exit(1); }
  return s.slice(a, b);
}

// Een Storage zoals de browser hem heeft: methoden op het prototype, de
// gegevens per instantie. Zo raakt het vervangen van Storage.prototype ook
// sessionStorage — en moet de zandbak zelf onderscheid maken.
function nepStorage(ctx) {
  vm.runInContext(`
    function Storage(){ Object.defineProperty(this,'_m',{value:{},enumerable:false}); }
    Storage.prototype.getItem=function(k){ return Object.prototype.hasOwnProperty.call(this._m,k)?this._m[k]:null; };
    Storage.prototype.setItem=function(k,v){ this._m[k]=String(v); };
    Storage.prototype.removeItem=function(k){ delete this._m[k]; };
    Storage.prototype.clear=function(){ for(const k of Object.keys(this._m)) delete this._m[k]; };
    Storage.prototype.key=function(i){ return Object.keys(this._m)[i]===undefined?null:Object.keys(this._m)[i]; };
    Object.defineProperty(Storage.prototype,'length',{get(){ return Object.keys(this._m).length; }});
    var localStorage=new Storage(), sessionStorage=new Storage();
  `, ctx);
}

function laadDemo(extra) {
  const ctx = Object.assign({ console: { log() {}, warn() {}, error() {} }, demoMode: false, Response, JSON, Map, Promise, setTimeout }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  nepStorage(ctx);
  vm.runInContext(bron('pidlane-demo.js'), ctx, { filename: 'pidlane-demo.js' });
  if (!ctx.PLDemo || !ctx.PLDemo._kern) { console.log('FOUT PLDemo hangt zijn kern niet meer naar buiten'); process.exit(1); }
  return ctx;
}
const echt = (ctx, k) => vm.runInContext('localStorage._m[' + JSON.stringify(k) + ']', ctx);

(async () => {
  console.log('1. De opslaglaag');
  {
    const c = laadDemo();
    const P = vm.runInContext('Storage.prototype', c);
    const origSet = P.setItem;
    c.localStorage.setItem('pl_y', 'echt');

    // Tegenproef: zonder zandbak gaat een schrijfactie gewoon naar het toestel.
    c.demoMode = true;
    c.localStorage.setItem('pl_voor', '1');
    toets('zonder zandbak schrijft ook de demo naar het toestel (de tegenproef: de test onderscheidt)', echt(c, 'pl_voor') === '1');

    toets('aan() zet de zandbak aan', c.PLDemo._kern.aan() === true && c.PLDemo.stand().aan === true);
    c.localStorage.setItem('pl_x', 'demo');
    toets('in de demo komt een nieuwe sleutel niet op het toestel', echt(c, 'pl_x') === undefined);
    toets('… maar lezen ziet hem wél: de demo werkt', c.localStorage.getItem('pl_x') === 'demo');
    c.localStorage.setItem('pl_y', 'overschreven');
    toets('een bestaande sleutel overschrijven raakt het toestel niet', echt(c, 'pl_y') === 'echt' && c.localStorage.getItem('pl_y') === 'overschreven');
    c.localStorage.removeItem('pl_voor');
    toets('verwijderen in de demo: weg voor de demo, niet van het toestel', c.localStorage.getItem('pl_voor') === null && echt(c, 'pl_voor') === '1');
    c.localStorage.setItem('pl_session', 'nico');
    c.localStorage.setItem('pl_sessie', '{"t":1}');
    toets('inloggen tijdens de demo blijft bewaard (DOORLAAT)', echt(c, 'pl_session') === 'nico' && echt(c, 'pl_sessie') === '{"t":1}');

    // Uitloggen tijdens de demo (01-10-2026): logout() wist pl_tok, en daarna
    // sluit handleConnect() de demo. Zat pl_tok in de laag, dan stond het
    // token na plDemoStop() weer op het toestel en logde de app je bij de
    // volgende start vanzelf in.
    const auth = bron('pidlane-auth.js');
    const sleutel = (naam) => { const m = auth.match(new RegExp('const ' + naam + "\\s*=\\s*'([^']+)'")); return m ? m[1] : null; };
    const tok = sleutel('TOK_KEY'), uitlog = sleutel('UITLOG_KEY');
    if (!tok || !uitlog) { console.log('FOUT TOK_KEY of UITLOG_KEY niet gevonden in pidlane-auth.js (anker verschoven?)'); process.exit(1); }
    toets('de sleutels van inloggen en uitloggen gaan door de zandbak (' + tok + ', ' + uitlog + ')',
      c.PLDemo._kern.DOORLAAT.indexOf(tok) >= 0 && c.PLDemo._kern.DOORLAAT.indexOf(uitlog) >= 0,
      'DOORLAAT = ' + JSON.stringify(c.PLDemo._kern.DOORLAAT));
    vm.runInContext('localStorage._m[' + JSON.stringify(tok) + "]='{\"token\":\"x\"}'", c);
    c.localStorage.removeItem(tok);
    toets('uitloggen tijdens de demo wist het sessietoken op het toestel zelf', echt(c, tok) === undefined);
    c.sessionStorage.setItem('s', '1');
    toets('sessionStorage merkt niets van de zandbak', vm.runInContext('sessionStorage._m.s', c) === '1');
    c.localStorage.clear();
    toets('clear() in de demo wist niets van het toestel, maar de demo ziet een lege opslag (behalve de sessie)',
      echt(c, 'pl_y') === 'echt' && c.localStorage.getItem('pl_y') === null && c.localStorage.getItem('pl_session') === 'nico');

    // demoMode uit zonder plDemoStop(): dan weer gewoon naar het toestel.
    c.demoMode = false;
    c.localStorage.setItem('pl_na', 'echt');
    toets('demoMode uit zonder stop: de opslag gaat weer echt door', echt(c, 'pl_na') === 'echt' && c.localStorage.getItem('pl_y') === 'echt');
    c.demoMode = true;

    const weg = c.PLDemo._kern.uit();
    toets('uit() telt wat er weggegooid is', weg >= 2, 'telling ' + weg);
    toets('uit() zet de echte methoden terug', P.setItem === origSet);
    toets('na uit() is de demolaag weg: het toestel is zoals het was',
      c.localStorage.getItem('pl_x') === null && c.localStorage.getItem('pl_y') === 'echt' && c.localStorage.getItem('pl_voor') === '1');
    c.localStorage.setItem('pl_daarna', '1');
    toets('na uit() schrijft ook demoMode=true weer echt (de zandbak is dicht)', echt(c, 'pl_daarna') === '1');

    c.PLDemo._kern.aan(); c.localStorage.setItem('pl_a', '1');
    c.PLDemo._kern.aan();
    toets('een tweede aan() (wisselen van demo-auto) houdt de laag', c.localStorage.getItem('pl_a') === '1');
    c.PLDemo._kern.uit();
  }

  console.log('\n2. Het netbesluit');
  {
    const c = laadDemo();
    const nb = c.PLDemo._kern.netBesluit;
    toets('de AI gaat in de demo niet de deur uit', nb('/v1/messages', { method: 'POST' }) !== 'door');
    toets('tegoed inwisselen ook niet', nb('/credits/redeem', {}) !== 'door');
    toets('een referentiemeting ook niet — ook als absoluut adres', nb('https://pidlane-proxy.x.workers.dev/airtable/veldlab', {}) !== 'door');
    toets('de applog ook niet (#360) — ook als absoluut adres', nb('https://pidlane-proxy.x.workers.dev/airtable/log', {}) !== 'door');
    toets('het RDW wél: opzoeken bewaart niets', nb('/proxy?url=' + encodeURIComponent('https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=AB123C')) === 'door');
    toets('je voertuigen lezen mag (stand, als json)', nb('/klant/platform', { method: 'POST', json: { actie: 'stand' } }) === 'door');
    toets('je rapporten lezen mag (rapport, als body)', nb('/klant/platform', { method: 'POST', body: JSON.stringify({ actie: 'rapport', id: 'x' }) }) === 'door');
    for (const a of ['rapport_opslaan', 'rit_opslaan', 'issues_bijwerken', 'status_opslaan', 'voertuig_opslaan', 'voorkeuren_opslaan', 'alles_wissen', 'akkoord'])
      toets('schrijven naar het account wordt geweigerd: ' + a, nb('/klant/platform', { json: { actie: a } }) !== 'door');
    toets('een platformverzoek zonder actie wordt geweigerd (onbekend is schrijven)', nb('/klant/platform', { method: 'POST' }) !== 'door');

    // De leesacties naast worker.js: bestaan ze, en schrijft er geen een?
    const w = bron('../worker.js');
    const a = w.indexOf('var KP_ACTIES = {'), b = w.indexOf('\n};', a);
    if (a < 0 || b < 0) { console.error('FOUT: KP_ACTIES niet gevonden in worker.js (anker verschoven?).'); process.exit(1); }
    const blok = w.slice(a, b);
    const acties = {};
    const re = /\n  async ([a-z_]+)\(c(?:, b)?\) \{/g;
    let m, vorige = null;
    while ((m = re.exec(blok))) {
      if (vorige) acties[vorige.naam] = blok.slice(vorige.i, m.index);
      vorige = { naam: m[1], i: m.index };
    }
    if (vorige) acties[vorige.naam] = blok.slice(vorige.i);
    const SCHRIJFT = /\.run\(|\.batch\(|\b(INSERT|UPDATE|DELETE)\b|kpBibErbij|kpBibStem|kpVinDelen/;
    toets('de schrijfherkenning onderscheidt (tegenproef: rit_opslaan en voorkeuren_opslaan schrijven)',
      SCHRIJFT.test(acties.rit_opslaan || '') && SCHRIJFT.test(acties.voorkeuren_opslaan || ''));
    for (const act of c.PLDemo._kern.LEES_ACTIES) {
      toets('leesactie ' + act + ' bestaat in worker.js en schrijft niets', !!acties[act] && !SCHRIJFT.test(acties[act]),
        acties[act] ? 'deze actie schrijft — dan hoort hij niet in LEES_ACTIES' : 'niet in KP_ACTIES');
    }
  }

  console.log('\n3. De haak in plFetch');
  {
    const c = laadDemo();
    let gehaald = [];
    c.fetch = async (url) => { gehaald.push(url); return new Response('{}', { status: 200 }); };
    c.PROXY_URL = 'https://proxy.test';
    vm.runInContext(bron('pidlane-plfetch.js'), c, { filename: 'pidlane-plfetch.js' });
    c.demoMode = true;
    const r1 = await c.plFetch('/v1/messages', { method: 'POST', json: { x: 1 } });
    const b1 = await r1.json();
    toets('in de demo: de AI-aanroep komt niet bij fetch, en krijgt een 403 met demo:true',
      gehaald.length === 0 && r1.status === 403 && b1.demo === true, JSON.stringify({ gehaald, status: r1.status, b1 }));
    await c.plFetch('/klant/platform', { method: 'POST', json: { actie: 'rapporten' } });
    toets('in de demo: je rapporten lezen gaat wél naar buiten', gehaald.length === 1);
    c.demoMode = false; gehaald = [];
    await c.plFetch('/v1/messages', { method: 'POST', json: { x: 1 } });
    toets('buiten de demo: de AI-aanroep gaat gewoon (tegenproef)', gehaald.length === 1);
  }

  console.log('\n4. De haak in apiFetch');
  {
    const src = knip('pidlane-fuel.js', 'async function apiFetch(', 'function aiVerdict(', 'apiFetch');
    for (const demo of [true, false]) {
      let gevraagd = 0;
      const c = { console: { log() {}, warn() {} }, currentUser: null, USERS: {},
        log() { throw new Error('VERDER'); },
        PLDemo: { actief: () => demo, aiVoorbeeld: async () => { gevraagd++; return 'VOORBEELD'; } } };
      c.window = c;
      vm.createContext(c);
      vm.runInContext(src + '\nglobalThis.__f = apiFetch;', c);
      let uit;
      try { uit = await c.__f('vraag', 100); } catch (e) { uit = 'fout:' + e.message; }
      if (demo) toets('in de demo geeft apiFetch het voorbeeldrapport, vóór er iets anders gebeurt', uit === 'VOORBEELD' && gevraagd === 1, String(uit));
      else toets('buiten de demo loopt apiFetch gewoon door (tegenproef)', uit === 'fout:VERDER' && gevraagd === 0, String(uit));
    }
    const c = laadDemo();
    const t = c.PLDemo._kern.voorbeeldTekst({ merk: 'Mazda', model: 'CX-5', year: '2018', brandstof: 'benzine' },
      [{ naam: 'Motortoerental', eenheid: 'RPM', waarde: 812.4 }, { naam: 'Accuspanning', eenheid: 'V', waarde: 14.13 }, { naam: 'kapot', waarde: NaN }]);
    toets('het voorbeeldrapport zegt dat het geen echte analyse is, en toont de gesimuleerde waarden',
      /VOORBEELDRAPPORT/.test(t) && /geen echte analyse/.test(t) && /Motortoerental: 812 RPM/.test(t) && /Accuspanning: 14,1 V/.test(t) && !/kapot/.test(t), t);
    const z = c.PLDemo._kern.voorbeeldTekst({}, [{ naam: 'x', waarde: 1 }], true);
    toets('met de zoektool (online zoeken): geen meetwaarden, wel waarom niet', !/Gemeten/.test(z) && /echte sessie/.test(z));
  }

  console.log('\n5. De haak in plBewaarBestand');
  {
    const src = knip('pidlane-motortype.js', 'async function plBewaarBestand(', 'function delay(', 'plBewaarBestand');
    for (const demo of [true, false]) {
      let geschreven = 0;
      const c = { console: { log() {}, warn() {} }, log() {}, showToast() {},
        nativeSchrijfDirect: async () => { geschreven++; return 'Documenten/PidLane/x.txt'; },
        _plVerbindingStaat: () => false, _plOpslagFout: '',
        PLDemo: { actief: () => demo } };
      c.window = c; c.window._plOpslag = { gelukt: 0, mislukt: [] };
      vm.createContext(c);
      vm.runInContext(src + '\nglobalThis.__f = plBewaarBestand;', c);
      const uit = await c.__f({}, 'x.txt');
      if (demo) toets('in de demo wordt er geen bestand geschreven', uit === false && geschreven === 0);
      else toets('buiten de demo wel (tegenproef)', uit === true && geschreven === 1);
    }
  }

  console.log('\n6. Het rapportenoverzicht');
  {
    const src = knip('pidlane-archief.js', 'function registerSessionReport(entry){', 'function _srUpdateBadge(){', 'registerSessionReport');
    const c = laadDemo({ _srSeq: 0, _srUpdateBadge() {}, _srAutoTitle: () => 'Rapport', logUsage() {} });
    c._sessionReports = [];
    vm.runInContext('let _srSeq=0;\n' + src + '\nglobalThis.__reg = registerSessionReport;', c);
    c.demoMode = false;
    const echtRec = c.__reg({ type: 'ai', text: 'echt rapport' });
    c.demoMode = true;
    const demoRec = c.__reg({ type: 'ai', text: 'demo rapport' });
    toets('een demorapport draagt demo en DEMO in de titel; een echt rapport niet',
      demoRec && demoRec.demo === true && /DEMO/.test(demoRec.title) && echtRec && echtRec.demo === false && !/DEMO/.test(echtRec.title));
    c.PLDemo.stop();
    toets('bij het stoppen verdwijnt het demorapport, het echte blijft',
      c._sessionReports.length === 1 && c._sessionReports[0] === echtRec, JSON.stringify(c._sessionReports.map(r => r.title)));
  }

  console.log('\n7. Starten en stoppen');
  {
    const src = knip('pidlane-demo.js', 'function plDemoStop(){', 'function demoRefresh(){', 'plDemoStop en plDemoAan');
    const tel = { start: 0, stop: 0 };
    const c = { console: { log() {}, warn() {} }, vehicleInfo: {}, resetVehicleSources() {}, showToast() {}, setTimeout() {},
      PLDemo: { start() { tel.start++; }, stop() { tel.stop++; }, stand: () => ({ aan: tel.start > tel.stop }) } };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(src + '\nglobalThis.__aan = plDemoAan; globalThis.__stop = plDemoStop;', c);
    c.__aan();
    toets('plDemoAan() zet de zandbak aan', tel.start === 1);
    c.__stop();
    toets('plDemoStop() zet hem weer uit', tel.stop === 1);
    const d = bron('pidlane-demo.js');
    const aanroepen = (d.match(/demoMode=true; connected=true; dataStable=true;\n\s*plDemoAan\(\);/g) || []).length;
    const zetten = (d.match(/demoMode=true;/g) || []).length;
    toets('elke plek die demoMode aanzet, roept direct daarna plDemoAan() aan', zetten > 0 && aanroepen === zetten,
      zetten + ' keer demoMode=true, ' + aanroepen + ' keer direct gevolgd door plDemoAan() — broncode gelezen omdat het de volgorde is die telt');
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
