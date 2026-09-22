// test-afmelden.js — #261: afmelden is afmelden, en "Sluit de app" sluit.
//
// 1. logout() riep aan het eind handleConnect() aan om de verbinding te
//    verbreken. Maar dat is een schakelaar: zonder verbinding opent hij het
//    verbindingsscherm. Na het afmelden stond dat dan open, en de app leek
//    gewoon door te gaan.
// 2. plSluitApp() verbreekt eerst de verbinding en roept dan App.exitApp();
//    in de browser bestaat afsluiten niet en blijft de knop verborgen.
//
// Laadt de echte functies uit pidlane-auth.js; de rest van de app is
// nagebootst, handleConnect() ook, zodat we zien wanneer hij geroepen wordt.
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

const bron = fs.readFileSync('pidlane-auth.js', 'utf8');
const begin = bron.indexOf('async function logout(){');
const EIND = 'niet getoond:\', e); }\n';
const eind = bron.indexOf(EIND, begin);
if (begin < 0 || eind < 0) {
  console.log('  FOUT  logout() of plSluitApp() niet gevonden in pidlane-auth.js — anker verdwenen');
  process.exit(1);
}
const code = bron.slice(begin, eind + EIND.length);

function laad(opt) {
  const els = {};
  const el = id => (els[id] = els[id] || {
    value: 'x', style: { display: 'none' }, dataset: {},
    classList: { remove() {}, add() {} },
  });
  const s = {
    connected: !!opt.verbonden,
    _handleConnect: 0, _exit: 0,
    localStorage: { removeItem() {}, setItem() {}, getItem() { return null; } },
    document: { getElementById: el },
    console: { warn() {}, log() {} },
    currentUser: { name: 'a' },
    uitlogVlagAan() {}, uitlogVlagWeg() {}, tokClear() {},
    plLoginMeld() {}, closeConnOv() {},
  };
  s.handleConnect = () => { s._handleConnect++; s.connected = !s.connected; return Promise.resolve(); };
  s.window = { PLCredits: { vergeetKlant() {}, chip() {} } };
  if (opt.schil) {
    s.window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { App: { exitApp: () => { s._exit++; s._verbondenBijExit = s.connected; return Promise.resolve(); } } },
    };
  }
  s.els = els;
  vm.createContext(s);
  vm.runInContext(code + '\nthis.logout = logout; this.plSluitApp = plSluitApp;', s);
  return s;
}

(async () => {
  console.log('1. Afmelden');
  {
    const s = laad({ verbonden: false });
    await s.logout();
    toets('zonder verbinding wordt handleConnect() niet aangeroepen',
      s._handleConnect === 0,
      'handleConnect() opent zonder verbinding het verbindingsscherm — na afmelden staat dat dan open');
  }
  {
    const s = laad({ verbonden: true });
    await s.logout();
    toets('met verbinding wordt die wél verbroken',
      s._handleConnect === 1 && s.connected === false);
  }

  console.log('\n2. Sluit de app');
  {
    const s = laad({ verbonden: true, schil: true });
    toets('in de APK staat de knop zichtbaar',
      s.els.kebabSluitApp && s.els.kebabSluitApp.style.display === '');
    const r = await s.plSluitApp();
    toets('hij sluit de app', r === true && s._exit === 1);
    toets('en verbreekt eerst de verbinding',
      s._handleConnect === 1 && s._verbondenBijExit === false,
      'afsluiten met een open verbinding bewaart de sessie niet en houdt de adapter bezet');
  }
  {
    const s = laad({ verbonden: false, schil: true });
    await s.plSluitApp();
    toets('zonder verbinding opent hij geen verbindingsscherm',
      s._handleConnect === 0 && s._exit === 1);
  }
  {
    const s = laad({ verbonden: false, schil: false });
    const knop = s.els.kebabSluitApp;
    toets('in de browser blijft de knop verborgen',
      !knop || knop.style.display === 'none');
    const r = await s.plSluitApp();
    toets('en doet hij niets', r === false && s._exit === 0 && s._handleConnect === 0);
  }

  console.log(`\n${n - fout}/${n} goed`);
  process.exit(fout ? 1 : 0);
})();
