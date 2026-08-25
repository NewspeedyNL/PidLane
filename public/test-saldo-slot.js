// ══════════════════════════════════════════════════════════════════
// test-saldo-slot.js — het Saldo-slot lost de race écht op
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Tot 26-08-2026 lazen handleMessages (AI-afboeking), handleCreditsRedeem
// (activatiecode inwisselen) en handleKlantOnboarding (welkomstbonus) alle
// drie onafhankelijk hetzelfde Saldo-veld, rekenden een nieuwe waarde uit en
// schreven die terug — zonder dat iets die drie tegen elkaar beschermde.
// Airtable kent geen transacties: twee gelijktijdige mutaties op hetzelfde
// account lazen hetzelfde startgetal, en de laatst schrijvende won. De
// andere mutatie verdween geruisloos — geld zonder foutmelding kwijt.
//
// De oplossing hergebruikt het bestaande redeem-lock-patroon (al in gebruik
// voor activatiecodes) via een gedeelde _lock/_unlock-methode op de Durable
// Object en een nieuwe saldo:<email>-naamruimte, zodat elke Saldo-mutatie
// van dezelfde klant serieel loopt.
//
// Deze test voert de ECHTE code uit, niet een nagebouwde versie:
//   1. _lock/_unlock, geëxtraheerd uit de RemoteSessionDO-klasse en gedraaid
//      tegen een minimale storage-namaak — toetst het slot-algoritme zelf
//      (stale-reclaim, aparte sleutels lopen elkaar niet in de weg).
//   2. metSaldoSlot, geëxtraheerd en gedraaid tegen een namaak-REMOTE_SESSION
//      — toetst dat fn() nooit draait zonder slot, dat het slot ALTIJD
//      losgelaten wordt (ook als fn() gooit), en dat een ontbrekende
//      REMOTE_SESSION-binding een harde fout geeft in plaats van een
//      onbeschermde doorgang.
//   3. Een bronscan die bevestigt dat alle drie de Saldo-schrijvers
//      (handleMessages, handleCreditsRedeem, handleKlantOnboarding) hun
//      klantPatch(...Saldo...) daadwerkelijk BINNEN een metSaldoSlot-blok
//      hebben staan, en dat redeem- en saldo-sloten aparte naamruimtes
//      gebruiken zodat een activatiecode nooit botst met een e-mailadres.
//
// Draaien vanuit public/:  node test-saldo-slot.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/../worker.js', 'utf8');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

function pakBlok(bron, startMarker, viaAccolades) {
  const i = bron.indexOf(startMarker);
  if (i < 0) return null;
  const openIdx = bron.indexOf('{', i);
  let depth = 1, j = openIdx + 1;
  while (j < bron.length && depth > 0) {
    if (bron[j] === '{') depth++;
    else if (bron[j] === '}') depth--;
    j++;
  }
  return bron.slice(i, j);
}

console.log('\nSaldo-slot\n');

// ── 1. _lock/_unlock: het slot-algoritme zelf ──────────────────────
const lockSrc = pakBlok(src, 'async _lock(key, staleMs) {');
const unlockSrc = pakBlok(src, 'async _unlock(key) {');
if (!lockSrc || !unlockSrc) {
  console.error('FOUT: _lock/_unlock niet gevonden in worker.js — is de DO-klasse herschreven?');
  process.exit(1);
}

function maakHarnas() {
  const opslag = new Map();
  const ctx = {
    storage: {
      get: async (k) => (opslag.has(k) ? opslag.get(k) : undefined),
      put: async (k, v) => { opslag.set(k, v); },
      delete: async (k) => { opslag.delete(k); }
    },
    blockConcurrencyWhile: async (fn) => { await fn(); }
  };
  const obj = { ctx };
  obj._lock = new Function('return (' + lockSrc.replace(/^async _lock/, 'async function') + ')')().bind(obj);
  obj._unlock = new Function('return (' + unlockSrc.replace(/^async _unlock/, 'async function') + ')')().bind(obj);
  return { obj, opslag };
}

(async () => {
  // eerste acquire lukt
  {
    const { obj } = maakHarnas();
    const g = await obj._lock('saldoLock', 12e4);
    toets('eerste acquire lukt', g === true);
  }
  // tweede acquire vóór unlock faalt
  {
    const { obj } = maakHarnas();
    await obj._lock('saldoLock', 12e4);
    const g2 = await obj._lock('saldoLock', 12e4);
    toets('tweede acquire vóór unlock faalt (bezet)', g2 === false);
  }
  // na unlock lukt een nieuwe acquire weer
  {
    const { obj } = maakHarnas();
    await obj._lock('saldoLock', 12e4);
    await obj._unlock('saldoLock');
    const g3 = await obj._lock('saldoLock', 12e4);
    toets('na unlock lukt acquire weer', g3 === true);
  }
  // een slot ouder dan staleMs is reclaimbaar zonder unlock
  {
    const { obj, opslag } = maakHarnas();
    opslag.set('saldoLock', Date.now() - 200000);      // 200s oud, staleMs=120000
    const g4 = await obj._lock('saldoLock', 12e4);
    toets('verouderd slot (> staleMs) is reclaimbaar', g4 === true);
  }
  // een slot jonger dan staleMs is NIET reclaimbaar
  {
    const { obj, opslag } = maakHarnas();
    opslag.set('saldoLock', Date.now() - 1000);         // 1s oud, ruim binnen 120000
    const g5 = await obj._lock('saldoLock', 12e4);
    toets('vers slot (< staleMs) is NIET reclaimbaar', g5 === false);
  }
  // twee verschillende sleutels lopen elkaar niet in de weg (saldoLock vs redeemLock)
  {
    const { obj } = maakHarnas();
    const gA = await obj._lock('saldoLock', 12e4);
    const gB = await obj._lock('redeemLock', 3e4);
    toets('saldoLock en redeemLock zijn onafhankelijke sleutels', gA === true && gB === true);
  }

  // ── 2. metSaldoSlot: mag fn() nooit onbeschermd draaien ──────────
  const msSrc = pakBlok(src, 'async function metSaldoSlot(env, email, fn) {');
  const stubSrc = pakBlok(src, 'function saldoStub(env, email) {');
  if (!msSrc || !stubSrc) { console.error('FOUT: metSaldoSlot/saldoStub niet gevonden'); process.exit(1); }
  const saldoStub = new Function('return (' + stubSrc + ')')();
  const metSaldoSlot = new Function('saldoStub', 'return (' + msSrc + ')')(saldoStub);

  function fakeEnv(gedrag) {
    // gedrag: 'ok' | 'bezet' | 'kapot'
    return {
      REMOTE_SESSION: {
        idFromName: (naam) => naam,
        get: (naam) => ({
          fetch: async (url) => {
            if (gedrag === 'kapot') throw new Error('DO onbereikbaar (test)');
            const op = url.split('/').pop();
            if (op === 'saldo-lock') return { ok: gedrag !== 'bezet' };
            return { ok: true };  // saldo-unlock lukt altijd
          }
        })
      }
    };
  }

  // gewone gang: fn draait, resultaat komt terug, bezet=false
  {
    let draaide = false;
    const env = fakeEnv('ok');
    const r = await metSaldoSlot(env, 'test@voorbeeld.nl', async () => { draaide = true; return 42; });
    toets('fn() draait en het resultaat komt terug', draaide === true && r.bezet === false && r.result === 42);
  }

  // slot bezet: fn draait NOOIT
  {
    let draaide = false;
    const env = fakeEnv('bezet');
    const r = await metSaldoSlot(env, 'test@voorbeeld.nl', async () => { draaide = true; return 42; });
    toets('slot bezet → fn() draait niet, bezet=true', draaide === false && r.bezet === true);
  }

  // fn() gooit: de fout komt door, EN het slot wordt losgelaten
  {
    let unlockAangeroepen = false;
    const env = {
      REMOTE_SESSION: {
        idFromName: (naam) => naam,
        get: () => ({
          fetch: async (url) => {
            if (url.endsWith('saldo-unlock')) unlockAangeroepen = true;
            return { ok: true };
          }
        })
      }
    };
    let gegooid = false;
    try { await metSaldoSlot(env, 'test@voorbeeld.nl', async () => { throw new Error('fn faalde'); }); }
    catch (e) { gegooid = true; }
    toets('fn() die gooit: de fout komt door', gegooid === true);
    toets('fn() die gooit: het slot wordt alsnog losgelaten', unlockAangeroepen === true);
  }

  // ontbrekende REMOTE_SESSION: harde fout, fn() draait NOOIT
  {
    let draaide = false;
    let gegooid = false, foutmelding = '';
    try { await metSaldoSlot({}, 'test@voorbeeld.nl', async () => { draaide = true; return 1; }); }
    catch (e) { gegooid = true; foutmelding = String(e && e.message || e); }
    toets('geen REMOTE_SESSION → gooit i.p.v. onbeschermd doorgaan', gegooid === true);
    toets('geen REMOTE_SESSION → fn() draait niet', draaide === false);
    // Niet zomaar "gooit ergens" — moet de EXPLICIETE guard zijn, niet een
    // toevallige TypeError uit saldoStub die per ongeluk hetzelfde effect
    // heeft. Die guard bestaat juist om een duidelijke, opzoekbare fout te
    // geven in plaats van "Cannot read properties of undefined".
    toets('de fout komt van de expliciete REMOTE_SESSION-guard, niet van toeval',
      /REMOTE_SESSION-binding/.test(foutmelding), 'kreeg: ' + foutmelding);
  }

  // ── 3. Bronscan: alle drie de Saldo-schrijvers zitten in het slot ──
  const FUNCTIES = [
    ['handleMessages', 'async function handleMessages(request, env) {', '__name(handleMessages, "handleMessages");'],
    ['handleCreditsRedeem', 'async function handleCreditsRedeem(request, env) {', '__name(handleCreditsRedeem, "handleCreditsRedeem");'],
    ['handleKlantOnboarding', 'async function handleKlantOnboarding(request, env) {', '__name(handleKlantOnboarding, "handleKlantOnboarding");']
  ];
  for (const [naam, startM, eindM] of FUNCTIES) {
    const i = src.indexOf(startM);
    const j = src.indexOf(eindM, i);
    toets(naam + ' bestaat nog op de verwachte plek', i >= 0 && j > i);
    if (i < 0 || j < i) continue;
    const lijf = src.slice(i, j);
    const metSlotIdx = lijf.indexOf('metSaldoSlot(env,');
    toets(naam + ' gebruikt metSaldoSlot', metSlotIdx >= 0);
    const patchMatch = lijf.match(/klantPatch\([^)]*\{[^}]*Saldo/);
    toets(naam + ' schrijft Saldo via klantPatch', !!patchMatch);
    if (metSlotIdx >= 0 && patchMatch) {
      toets(naam + ': de Saldo-patch staat NA het begin van metSaldoSlot (dus binnen het slot)',
        patchMatch.index > metSlotIdx,
        'metSaldoSlot op ' + metSlotIdx + ', klantPatch op ' + patchMatch.index);
    }
  }

  // aparte naamruimtes: een activatiecode mag nooit botsen met een e-mailadres
  toets('redeemStub gebruikt de naamruimte "redeem:"', /idFromName\("redeem:" \+ code\)/.test(src));
  toets('saldoStub gebruikt de naamruimte "saldo:"', /idFromName\("saldo:" \+/.test(src));

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error('FOUT: test wierp een exception:', e); process.exit(1); });
