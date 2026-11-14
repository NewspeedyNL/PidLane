// ══════════════════════════════════════════════════════════════════
// test-versie.js — PLVersie: de updatemelding na een deploy (14-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-versie.js in een vm met een nep-fetch voor
// /app-versie. Toetst: geen kaart bij dezelfde versie, wel bij een nieuwe;
// niet tijdens een verbinding of onder de intro (en wel zodra dat voorbij
// is); "Later" geldt alleen voor die ene versie; zonder antwoord van de
// server nooit een kaart op een gok; "Nu bijwerken" is plHardReload().
// Plus de worker: /app-versie bestaat, staat in run_worker_first en de
// binding in wrangler.toml — anders zwijgt de melding stil in productie.
//
// Draaien vanuit public/:  node test-versie.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-versie.js'), 'utf8');
let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}

function laad(o) {
  o = o || {};
  const elementen = {};
  const luister = {};
  const s = {
    console: { warn() {}, log() {}, info() {} },
    setTimeout, clearTimeout,
    intervallen: [],
    Promise, Date, JSON, String, Error,
    connected: !!o.verbonden,
    document: {
      visibilityState: 'visible',
      getElementById: (id) => elementen[id] || null,
      createElement: () => {
        const e = { hidden: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '' };
        return e;
      },
      body: { appendChild: (e) => { elementen[e.id] = e; } },
      addEventListener: (t, f) => { luister[t] = f; }
    },
    location: { reload() { s.herladen++; } },
    herladen: 0, hard: 0,
    plHardReload() { s.hard++; },
    PLVERSIE_HANDMATIG: true
  };
  s.setInterval = (f) => { s.intervallen.push(f); return s.intervallen.length; };
  s.clearInterval = () => {};
  s.antwoord = o.id === undefined ? 'A' : o.id;
  s.fetch = (url, opt) => {
    s.laatsteUrl = url; s.laatsteOpt = opt;
    if (s.antwoord === 'net') return Promise.reject(new Error('geen net'));
    if (s.antwoord === null) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ id: null }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: s.antwoord }) });
  };
  s.window = s; s.elementen = elementen; s.luister = luister;
  vm.createContext(s);
  vm.runInContext(bron, s);
  return s;
}
const kaart = (s) => !!(s.elementen.plVersie && !s.elementen.plVersie.hidden);

(async () => {
  console.log('\n1. De pure kern');
  const K = laad().PLVersie._kern;
  toets('zelfde id: niet nieuwer', !K.nieuwer('A', 'A'));
  toets('ander id: nieuwer', K.nieuwer('A', 'B'));
  toets('onbekend id: geen uitspraak', !K.nieuwer(null, 'B') && !K.nieuwer('A', null));
  toets('nieuw, niet verbonden, geen intro: tonen', K.magTonen({ nieuw: true, live: 'B', zichtbaar: true }));
  toets('verbonden: niet tonen', !K.magTonen({ nieuw: true, live: 'B', verbonden: true }));
  toets('onder de intro: niet tonen', !K.magTonen({ nieuw: true, live: 'B', intro: true }));
  toets('op de achtergrond: niet tonen', !K.magTonen({ nieuw: true, live: 'B', zichtbaar: false }));
  toets('Later voor deze versie: niet tonen', !K.magTonen({ nieuw: true, live: 'B', later: 'B' }));
  toets('Later voor een oudere versie: wel tonen', K.magTonen({ nieuw: true, live: 'C', later: 'B' }));

  console.log('\n2. Het gedrag');
  {
    const s = laad();
    await s.PLVersie.controleer();
    toets('vraagt /app-versie zonder cache', /^\/app-versie\?/.test(s.laatsteUrl) && s.laatsteOpt && s.laatsteOpt.cache === 'no-store', s.laatsteUrl);
    toets('eerste antwoord = wat de pagina draait, geen kaart', s.PLVersie.staat().geladen === 'A' && !kaart(s));
    await s.PLVersie.controleer();
    toets('zelfde versie: geen kaart', !kaart(s));
    s.antwoord = 'B';
    await s.PLVersie.controleer();
    toets('nieuwe deploy: kaart in beeld', kaart(s));
    toets('met Nu bijwerken en Later', /plVersieNu/.test(s.elementen.plVersie.innerHTML) && /plVersieLater/.test(s.elementen.plVersie.innerHTML));
    s.PLVersie.nu();
    toets('Nu bijwerken = plHardReload()', s.hard === 1 && s.herladen === 0);
    s.PLVersie.later();
    toets('Later: kaart weg', !kaart(s));
    await s.PLVersie.controleer();
    toets('Later geldt voor deze versie', !kaart(s));
    s.antwoord = 'C';
    await s.PLVersie.controleer();
    toets('de volgende deploy vraagt het opnieuw', kaart(s));
  }
  {
    const s = laad({ verbonden: true });
    await s.PLVersie.controleer();
    s.antwoord = 'B';
    await s.PLVersie.controleer();
    toets('verbonden met de auto: geen kaart', !kaart(s));
    toets('…maar hij blijft kijken', s.intervallen.length === 1);
    s.connected = false;
    s.intervallen[0]();
    toets('verbinding weg: kaart komt alsnog', kaart(s));
  }
  {
    const s = laad();
    s.PLIntro = { bezig: () => true };
    await s.PLVersie.controleer();
    s.antwoord = 'B';
    await s.PLVersie.controleer();
    toets('onder de intro: geen kaart', !kaart(s));
    s.PLIntro.bezig = () => false;
    s.intervallen[s.intervallen.length - 1]();
    toets('intro voorbij: kaart', kaart(s));
  }
  {
    const s = laad({ id: null });
    await s.PLVersie.controleer();
    s.antwoord = 'B';
    await s.PLVersie.controleer();
    toets('geen id bij het laden: geen kaart op een gok', !kaart(s) && s.PLVersie.staat().geladen === 'B');
  }
  {
    const s = laad();
    await s.PLVersie.controleer();
    s.antwoord = 'net';
    await s.PLVersie.controleer();
    toets('geen net: geen kaart', !kaart(s));
  }
  {
    const s = laad();
    s.PLVersie.start();
    toets('start luistert naar terugkeer in de app', typeof s.luister.visibilitychange === 'function');
  }

  console.log('\n3. De worker en wrangler.toml');
  {
    const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
    const t = fs.readFileSync(path.join(__dirname, '..', 'wrangler.toml'), 'utf8');
    toets('worker.js routeert /app-versie', /url\.pathname === "\/app-versie"[^\n]*\n\s*return handleAppVersie\(env\)/.test(w));
    toets('/app-versie staat in run_worker_first', /run_worker_first = \[[\s\S]*?"\/app-versie"[\s\S]*?\]/.test(t));
    toets('de binding CF_VERSION_METADATA staat in wrangler.toml', /\[version_metadata\]\s*\nbinding = "CF_VERSION_METADATA"/.test(t));
    // De echte handler: met en zonder binding.
    const i = w.indexOf('function handleAppVersie(env) {'), j = w.indexOf('__name(handleAppVersie', i);
    toets('handleAppVersie gevonden', i > 0 && j > i);
    const ctx = { CORS: {}, Response: class { constructor(b, o) { this.body = b; this.status = o.status; this.headers = o.headers; } }, JSON };
    vm.createContext(ctx);
    vm.runInContext(w.slice(i, j) + '\nthis.h = handleAppVersie;', ctx);
    const met = ctx.h({ CF_VERSION_METADATA: { id: 'v1', tag: '', timestamp: 't' } });
    toets('met binding: 200, het id en no-store', met.status === 200 && JSON.parse(met.body).id === 'v1' && met.headers['Cache-Control'] === 'no-store');
    const zonder = ctx.h({});
    toets('zonder binding: 503 en id null', zonder.status === 503 && JSON.parse(zonder.body).id === null);
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
  process.exit(fout ? 1 : 0);
})();
