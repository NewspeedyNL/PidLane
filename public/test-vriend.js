// ══════════════════════════════════════════════════════════════════
// test-vriend.js — PLVriend: de app-kant van "nodig een vriend uit" (14-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-vriend.js in een vm. Toetst de code-regel (gelijk
// aan uitnodigCodeNorm in worker.js), het vangen van ?u=CODE uit de link tot
// aan de registratie, de deeltekst en de bedrading: menu-item, scriptvolgorde
// en het registratieveld. De beloning zelf staat in test-uitnodiging.js.
//
// Draaien vanuit public/:  node test-vriend.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
function laad(search) {
  const opslag = {};
  const s = {
    console: { warn() {}, log() {} },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    location: { search: search || '', href: 'https://app.pidlane.nl/' + (search || '') },
    history: { replaceState(a, b, u) { s.nieuweUrl = u; } },
    URL, document: { getElementById: () => null },
    toasts: [], showToast(t) { s.toasts.push(t); },
    timers: [], setTimeout(f) { s.timers.push(f); return s.timers.length; }, Promise, JSON
  };
  s.window = s; s.opslag = opslag;
  vm.createContext(s);
  vm.runInContext(lees('pidlane-vriend.js'), s);
  return s;
}

console.log('\n1. De code');
const K = laad().PLVriend._kern;
toets('PL-7K3PQR blijft gelijk', K.codeNorm('PL-7K3PQR') === 'PL-7K3PQR');
toets('kleine letters en spaties', K.codeNorm(' pl 7k3pqr ') === 'PL-7K3PQR');
toets('O, 0, I, 1 en L worden geweigerd', K.codeNorm('PL-O0I1L2') === '');
toets('dezelfde regel als de worker (één tekenreeks)', /\/\^\[A-HJKMNP-Z2-9\]\{6\}\$\//.test(lees('../worker.js')) && /\/\^\[A-HJKMNP-Z2-9\]\{6\}\$\//.test(lees('pidlane-vriend.js')));
toets('code uit de link', K.codeUitUrl('?x=1&u=pl-7k3pqr') === 'PL-7K3PQR' && K.codeUitUrl('?x=1') === '');

console.log('\n2. De link bewaart de code tot de registratie');
{
  const s = laad('?u=PL-7K3PQR');
  toets('bewaard', s.PLVriend.bewaardeCode() === 'PL-7K3PQR');
  toets('de link is schoongemaakt', s.nieuweUrl === '/', String(s.nieuweUrl));
  s.PLVriend.naRegistratie({ gekoppeld: true }, 'PL-7K3PQR');
  toets('na de registratie weg, met een melding', s.PLVriend.bewaardeCode() === '' && /gekoppeld/.test(s.toasts[0] || ''));
}
{
  const s = laad();
  s.PLVriend.naRegistratie({ gekoppeld: false, reden: 'onbekende code' }, 'PL-ZZZZZZ');
  toets('onbekende code: de klant hoort het, het account staat', /niet herkend/.test(s.toasts[0] || ''));
  const t = laad();
  t.PLVriend.naRegistratie(null, '');
  toets('zonder code: geen melding', t.toasts.length === 0);
}

console.log('\n3. Wat er gedeeld wordt');
const d = { mijnCode: 'PL-7K3PQR', link: 'https://app.pidlane.nl/?u=PL-7K3PQR', voorVriend: 10, voorJou: 20, beloond: 1, wacht: 2, verdiend: 20, max: 10 };
const tekst = K.deelTekst(d);
toets('de deeltekst noemt code, bonus en link', /PL-7K3PQR/.test(tekst) && /10 extra/.test(tekst) && /https:\/\/app\.pidlane\.nl\/\?u=PL-7K3PQR/.test(tekst), tekst);
toets('en niet "anoniem" (CLAUDE.md, privacy)', !/anoniem/i.test(tekst));
toets('voortgang', K.voortgang(d) === '1 vriend beloond · 20 credits verdiend · 2 wachten nog op de eerste verbinding · nog 9 te gaan', K.voortgang(d));
toets('maximum bereikt', /maximum is bereikt/.test(K.voortgang(Object.assign({}, d, { beloond: 10 }))));

console.log('\n4. De deelvoet onder rapporten');
{
  const s = laad();
  toets('zonder account: de kale link, nog geen code', s.PLVriend.voet() === 'Gemaakt met PidLane — lees je eigen auto gratis uit: https://app.pidlane.nl', s.PLVriend.voet());
  s.currentUser = { user: 'anna@voorbeeld.nl' };
  s.PLKlant = { isKlant: () => true };
  let vraag = 0;
  s.plFetch = () => { vraag++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, mijnCode: 'PL-7K3PQR' }) }); };
  s.PLVriend.voet();
  // haalCode loopt asynchroon; wacht een tik.
  setImmediate(() => {
    toets('de voet haalt de code één keer op de achtergrond', vraag === 1, String(vraag));
    toets('daarna met de eigen link', /https:\/\/app\.pidlane\.nl\/\?u=PL-7K3PQR$/.test(s.PLVriend.voet()), s.PLVriend.voet());
    toets('kort voor de PDF-voet', s.PLVriend.voetKort() === 'app.pidlane.nl/?u=PL-7K3PQR', s.PLVriend.voetKort());
    s.PLVriend.voet();
    toets('geen tweede ophaalronde', vraag === 1);
    s.currentUser = { user: 'bert@voorbeeld.nl' };
    toets('een ander account krijgt de code van de vorige niet', !/PL-7K3PQR/.test(s.PLVriend.voetKort()), s.PLVriend.voetKort());
    toets('na het laden wordt de code één keer opgehaald, met een losse timer', s.timers.length === 1);
    s.currentUser = { user: 'anna@voorbeeld.nl' };
    const ex = lees('pidlane-export.js');
    toets('export: tekst met de voet, niet bij een ruwe log', /const uit = plMetVoet\(_metOpmerking\(tekst, _opm\(\)\), o\);/.test(ex) && /if \(o\.ruw \|\| !window\.PLVriend/.test(ex));
    toets('export: de PDF-voet', /doc\.text\(_voetPdf\(o\) \+ new Date/.test(ex));
    toets('AI-rapport delen met de voet', /plMetVoet\(kaal\)/.test(lees('pidlane-fuel.js')));
    // De echte plMetVoet uit pidlane-export.js, met deze PLVriend.
    const i = ex.indexOf('function plMetVoet('), j = ex.indexOf('function _voetPdf(');
    const f = new Function('window', 'PLVriend', 'console', ex.slice(i, j) + '; return plMetVoet;')(s, s.PLVriend, console);
    toets('plMetVoet: voet onderaan', /\n\n— Gemaakt met PidLane.*PL-7K3PQR\n$/.test(f('Rapport\n\n')), JSON.stringify(f('Rapport')));
    toets('plMetVoet: ruw blijft ongemoeid', f('log', { ruw: true }) === 'log');
    rest();
  });
}
function rest() {
console.log('\n5. De bedrading');
const html = lees('index.html');
toets('menu-item roept PLVriend.open aan', /id="kbVriend"[^>]*onclick="closeKebab\(\);PLVriend\.open\(\)"/.test(html));
toets('het script staat in index.html', html.indexOf('<script src="pidlane-vriend.js"></script>') > 0);
const klant = lees('pidlane-klant.js');
toets('registratie heeft het codeveld en stuurt het mee', /_veld\('regUitnodiging'/.test(klant) && /klantRegistreer\(email, p1, naam, uitn\)/.test(klant));
toets('het menu-item alleen voor een klantaccount', /getElementById\('kbVriend'\);\s*if \(vr\) vr\.style\.display = isKlant\(\)/.test(klant));
toets('de garage meldt de bonus na voertuig_opslaan', /actie === 'voertuig_opslaan' && d\.uitnodiging && d\.uitnodiging\.beloond/.test(lees('pidlane-garage.js')));

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
process.exit(fout ? 1 : 0);
}
