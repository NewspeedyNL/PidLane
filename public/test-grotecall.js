// ══════════════════════════════════════════════════════════════════
// test-grotecall.js — grote AI-calls en de afboekregel (#524)
// ──────────────────────────────────────────────────────────────────
// GEMETEN OP 15-10-2026. Eén analyse kostte 85 tokens (116k tokens invoer).
// Het logboek zei "Tegoed afgeboekt: -85 (saldo 0)", het kasboek SaldoNa 15.
// Twee dingen gingen mis, en deze test houdt ze allebei vast:
//
//   1. DE LOGREGEL KWAM VÓÓR HET SERVERSALDO. boek() schreef hem met zijn
//      eigen tussenstand; volgServer() zette het echte getal pas daarna. De
//      teller klopte dus, de regel niet. Nu schrijft meld() hem, ná
//      volgServer(), met de analyse erbij. Deel 1 en 2.
//   2. EEN CALL VAN 85 TOKENS GING DOOR OP ÉÉN TIK. Boven bevestigDrempel
//      moet het getal overgetypt worden, ook als "niet meer vragen" aanstaat,
//      en ook voor wie niet betaalt (beheerder, personeel: daar komt de
//      rekening bij de beheerder). Deel 3 t/m 6.
//
// plAnalyseRol() komt uit pidlane-fuel.js, met een anker geknipt. Deel 7.
//
// Draaien vanuit public/:  node test-grotecall.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Een overlay die onthoudt welke elementen er in zijn innerHTML staan, zodat
// de knoppen van het echte venster aan te klikken zijn.
function nepElement() {
  const el = { id: '', className: '', style: {}, onclick: null, _html: '', _kids: {} };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); el._kids = {}; }
  });
  el.querySelector = (sel) => {
    const id = String(sel).replace(/^#/, '');
    if (el._html.indexOf('id="' + id + '"') < 0) return null;
    if (!el._kids[id]) el._kids[id] = { id, onclick: null, oninput: null, disabled: false, value: '', checked: false, style: {} };
    return el._kids[id];
  };
  el.appendChild = () => {};
  return el;
}

function laad(gebruiker) {
  const opslag = {};
  const logs = [];
  const els = {};
  global.localStorage = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: (k) => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => {
      if (els[id]) return els[id];
      for (const k in els) { const kid = els[k].querySelector('#' + id); if (kid) return kid; }
      return null;
    },
    addEventListener() {},
    createElement: () => {
      const el = nepElement();
      return new Proxy(el, { set(t, k, v) { t[k] = v; if (k === 'id') els[v] = t; return true; } });
    },
    body: { appendChild() {} },
    querySelector: () => null
  };
  global.window = {
    currentUser: gebruiker,
    log: (m, t) => logs.push({ m: String(m), t }),
    showToast() {}
  };
  global.fetch = () => Promise.reject(new Error('geen net in de test'));
  eval(fs.readFileSync(path.join(__dirname, 'pidlane-credits.js'), 'utf8'));
  return { PLC: global.window.PLCredits, logs, venster: () => els.plCredSheet || null };
}

const klant = { name: 'klant@voorbeeld.nl', role: 'klant' };
const beheerder = { name: 'beheer', role: 'admin' };
const kop = (w) => ({ get: (n) => (String(n).toLowerCase() === 'x-pidlane-saldo' ? w : null) });
// Een prompt die ruim boven de drempel uitkomt, en een die eronder blijft.
const GROOT = 'Je bent expert automonteur.\n' + '0105 91 010C 2208 010D 59\n'.repeat(4000);
const KLEIN = 'Je bent expert automonteur. Kort: is 91 graden koelwater goed?';
const afboekregels = (logs) => logs.filter((l) => l.m.indexOf('Tegoed afgeboekt') === 0);
const nogBezig = async (p) => { const uit = await Promise.race([p.then(() => 'klaar', () => 'klaar'), new Promise((r) => setTimeout(() => r('wacht'), 20))]); return uit === 'wacht'; };

(async function () {

  console.log('1. De afboekregel draagt het saldo van de server, niet de tussenstand');
  {
    // Het geval van 15-10: lokaal stond er minder dan de kosten, de server had 100.
    const { PLC, logs } = laad(klant);
    PLC.zetServerSaldo(50);
    const res = { credits: 80, tekensIn: 250000, maxTokens: 2000, geboekt: false };
    PLC.boek(res, { input_tokens: 116015, output_tokens: 945 });
    toets('boek() schrijft zelf geen afboekregel meer', afboekregels(logs).length === 0,
          JSON.stringify(afboekregels(logs)));
    const vanServer = PLC.volgServer(kop('15'), {});
    PLC.meld(res, vanServer, 'brandstof');
    const r = afboekregels(logs);
    toets('meld() schrijft precies één regel', r.length === 1, r.length + ' regels');
    toets('met de echte kosten', r[0] && r[0].m.indexOf('-85') > 0, r[0] && r[0].m);
    toets('en het saldo van de server (15, niet 0)', r[0] && /saldo 15[ ,)]/.test(r[0].m), r[0] && r[0].m);
    toets('met de analyse erbij', r[0] && r[0].m.indexOf('voor brandstof') > 0, r[0] && r[0].m);
    toets('zonder "geschat": de server gaf een getal', r[0] && r[0].m.indexOf('geschat') < 0, r[0] && r[0].m);
    PLC.meld(res, vanServer, 'brandstof');
    toets('een tweede meld() voor dezelfde call schrijft niets', afboekregels(logs).length === 1,
          afboekregels(logs).length + ' regels — een vervolgdeel bij max_tokens is geen tweede afboeking');
  }

  console.log('\n2. Zonder getal van de server zegt de regel dat het een schatting is');
  {
    const { PLC, logs } = laad(klant);
    PLC.zetServerSaldo(100);
    const res = { credits: 6, tekensIn: 4000, maxTokens: 2000, geboekt: false };
    PLC.boek(res, { input_tokens: 4880, output_tokens: 720 });
    PLC.meld(res, PLC.volgServer(kop(null), {}), '');
    const r = afboekregels(logs);
    toets('er staat "geschat" in', r[0] && r[0].m.indexOf('geschat') > 0, r[0] && r[0].m);
  }

  console.log('\n3. Grote call bij een klant: het venster wacht op het overgetypte getal');
  {
    const { PLC, venster } = laad(klant);
    PLC.zetServerSaldo(500);
    const a = PLC.ontleed(GROOT, '', 2000);
    toets('de testprompt ligt boven de drempel', a.credits > PLC.CFG.bevestigDrempel, a.credits + ' credits');
    const p = PLC.preflight(GROOT, '', 2000, 'claude-sonnet-5');
    const ov = venster();
    toets('het venster staat open', !!ov && ov.style.display === 'flex', ov && ov.style.display);
    const ja = ov && ov.querySelector('#plCredJa');
    const typ = ov && ov.querySelector('#plCredTyp');
    toets('er is een invulveld', !!typ);
    toets('geen "niet meer vragen" in het grote venster', ov && !ov.querySelector('#plCredStil'));
    toets('de knop staat uit tot er iets getypt is', ja && ja.disabled === true);
    ja.onclick();
    toets('een tik op de uitgeschakelde knop doet niets', await nogBezig(p));
    typ.value = String(a.credits + 1); typ.oninput();
    toets('een verkeerd getal zet hem niet aan', ja.disabled === true);
    typ.value = ' ' + a.credits + ' '; typ.oninput();
    toets('het goede getal wel', ja.disabled === false);
    ja.onclick();
    const res = await p;
    toets('daarna gaat de analyse door', res && res.credits === a.credits, JSON.stringify(res));
  }

  console.log('\n4. "Niet meer vragen" slaat een grote call niet over');
  {
    const { PLC, venster } = laad(klant);
    PLC.zetServerSaldo(500);
    PLC.stil(true);
    const p = PLC.preflight(GROOT, '', 2000, 'claude-sonnet-5');
    toets('het venster staat toch open', venster() && venster().style.display === 'flex');
    toets('en de call wacht', await nogBezig(p));
    venster().querySelector('#plCredNee').onclick();
    let afgebroken = false;
    try { await p; } catch (e) { afgebroken = !!e.plAfgebroken; }
    toets('annuleren breekt af', afgebroken);
    const k = await PLC.preflight(KLEIN, '', 300, 'claude-sonnet-5');
    toets('een kleine call blijft wél stil', k && venster().style.display === 'none',
          'venster: ' + (venster() && venster().style.display));
  }

  console.log('\n5. De beheerder betaalt niet, maar ziet een grote call wel');
  {
    const { PLC, venster } = laad(beheerder);
    const k = await PLC.preflight(KLEIN, '', 300, 'claude-sonnet-5');
    toets('een kleine call: geen venster, geen afrekening', k === null && !venster());
    const p = PLC.preflight(GROOT, '', 2000, 'claude-sonnet-5');
    const ov = venster();
    toets('een grote call: het venster staat open', !!ov && ov.style.display === 'flex');
    toets('met wie er betaalt in plaats van een saldo', ov && ov.innerHTML.indexOf('de beheerder') > 0);
    const typ = ov.querySelector('#plCredTyp');
    const ja = ov.querySelector('#plCredJa');
    toets('ook hier moet het getal overgetypt worden', ja && ja.disabled === true && !!typ);
    typ.value = String(PLC.ontleed(GROOT, '', 2000).credits); typ.oninput(); ja.onclick();
    toets('na bevestigen: geen afrekening (er valt niets af te boeken)', (await p) === null);
  }

  console.log('\n6. Een klant met tegoed uit ziet hem ook');
  {
    const { PLC, venster } = laad({ name: 'dev@voorbeeld.nl', role: 'klant', tegoedUit: true });
    const p = PLC.preflight(GROOT, '', 2000, 'claude-sonnet-5');
    toets('het venster staat open', venster() && venster().style.display === 'flex');
    venster().querySelector('#plCredX').onclick();
    let afgebroken = false;
    try { await p; } catch (e) { afgebroken = !!e.plAfgebroken; }
    toets('sluiten breekt af', afgebroken);
  }

  console.log('\n7. plAnalyseRol() noemt de analyse');
  {
    const bron = fs.readFileSync(path.join(__dirname, 'pidlane-fuel.js'), 'utf8');
    const van = bron.indexOf('function plAnalyseRol(');
    const tot = bron.indexOf('async function apiFetch(');
    if (van < 0 || tot < van) { console.error('FOUT: plAnalyseRol niet gevonden in pidlane-fuel.js (anker verschoven?)'); process.exit(1); }
    const plAnalyseRol = new Function(bron.slice(van, tot) + '\nreturn plAnalyseRol;')();
    toets('met profiel en vraag', plAnalyseRol('x', { profiel: 'brandstof', vraag: 'waar gaat het heen?' }) === 'brandstof: waar gaat het heen?',
          plAnalyseRol('x', { profiel: 'brandstof', vraag: 'waar gaat het heen?' }));
    toets('zonder profiel: de eerste zin van de prompt',
          plAnalyseRol('Je bent brandstofefficiëntie specialist. Analyseer deze OBD2 data.', { meet: false }) === 'Je bent brandstofefficiëntie specialist.',
          plAnalyseRol('Je bent brandstofefficiëntie specialist. Analyseer deze OBD2 data.', { meet: false }));
    toets('nooit langer dan 80 tekens', plAnalyseRol('a'.repeat(500), null).length === 80);
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})();
