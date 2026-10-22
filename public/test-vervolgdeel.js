// ══════════════════════════════════════════════════════════════════
// test-vervolgdeel.js — vervolgdelen bij max_tokens (#526, punt 4)
// ──────────────────────────────────────────────────────────────────
// GEMETEN IN D1 OP 22-10-2026. Een vervolgdeel stuurt de hele invoer opnieuw.
// In het kasboek stonden er 6, in 5 analyses: deel 1 stopte telkens precies op
// het plafond van de aanroeper (600, 1600, 4000), en deel 2 schreef daarna nog
// 9 tot 1009 tokens. Eén keer werd 3348 tokens invoer betaald voor 9 tokens.
//
// Deze test draait de echte apiFetch() uit pidlane-fuel.js (geknipt op zijn
// kop en die van aiVerdict) tegen een nep-plFetch die doet wat Anthropic doet:
// hij schrijft wat het model wil, tot aan body.max_tokens. De bodies gaan
// daarna door de echte plRolUit() uit worker.js — dat is wat het kasboek ziet.
//
// Draaien vanuit public/:  node test-vervolgdeel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

function knip(bestand, van, tot) {
  const bron = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = bron.indexOf(van), b = bron.indexOf(tot, a);
  if (a < 0 || b < 0) { console.log('FOUT anker niet gevonden in ' + bestand + ': ' + (a < 0 ? van : tot)); process.exit(1); }
  return bron.slice(a, b);
}
const plRolUit = new Function(knip('../worker.js', 'function plRolUit(', '__name(plRolUit') + '; return plRolUit;')();
const apiBron = knip('pidlane-fuel.js', 'async function apiFetch(', '\nfunction aiVerdict(');

// wil = hoeveel tokens het model per deel zou schrijven als niets het afkapt.
function bouw(wil) {
  const bodies = [];
  const plFetch = async (url, o) => {
    const body = JSON.parse(JSON.stringify(o.json));
    bodies.push(body);
    const nodig = wil[bodies.length - 1] || 0;
    const uit = Math.min(nodig, body.max_tokens);
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({
        stop_reason: uit < nodig ? 'max_tokens' : 'end_turn',
        content: [{ type: 'text', text: 'deel' + bodies.length + ' ' }],
        usage: { input_tokens: 3000, output_tokens: uit }
      })
    };
  };
  const stubs = {
    window: {}, currentUser: null, localStorage: { getItem: () => null }, log() {}, plFetch,
    plZonderVin: (x) => x, plAnalyseRol: () => 'diagnose', aiBusyBegin() {}, aiBusyEnd() {},
    trackTokens() {}, PidLaneEvalLog: { log() {} }, extractAIText: (d) => d.content[0].text
  };
  // Alles wat apiFetch verder aanroept (prompt-opbouw) is hier niet het
  // onderwerp en geeft een lege tekst.
  const scope = new Proxy(stubs, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : k in globalThis ? globalThis[k] : () => '')
  });
  const apiFetch = new Function('scope', 'with(scope){' + apiBron + '; return apiFetch;}')(scope);
  return { apiFetch, bodies };
}

(async function () {
  console.log('1. Het geval uit D1: 600 gevraagd, 609 nodig — nu één call');
  {
    const t = bouw([609]);
    await t.apiFetch('vraag', 600, 'sys');
    toets('één call, geen vervolgdeel', t.bodies.length === 1, t.bodies.length + ' calls');
    toets('plafond is 2× wat de aanroeper vroeg', t.bodies[0].max_tokens === 1200, String(t.bodies[0].max_tokens));
    toets('deel 1 draagt geen pl_deel', !('pl_deel' in t.bodies[0]), JSON.stringify(Object.keys(t.bodies[0])));
  }

  console.log('\n2. Het plafond blijft onder de grens van de Worker');
  {
    const t = bouw([10]);
    await t.apiFetch('vraag', 6000, 'sys');
    toets('6000 gevraagd → 8192, niet 12000', t.bodies[0].max_tokens === 8192, String(t.bodies[0].max_tokens));
  }

  console.log('\n3. Echt te lang: het vangnet werkt nog, en het kasboek ziet elk deel');
  {
    const t = bouw([99999, 99999, 99999]);
    const tekst = await t.apiFetch('vraag', 900, 'sys');
    toets('drie calls', t.bodies.length === 3, t.bodies.length + ' calls');
    toets('de tekst zegt dat hij ingekort is', /Rapport ingekort/.test(tekst), JSON.stringify(tekst.slice(-80)));
    const det = t.bodies.map((b) => plRolUit(b));
    toets('Details: diagnose, dan vervolgdeel 2 en 3',
      det[0] === 'diagnose' && det[1] === 'diagnose — vervolgdeel 2' && det[2] === 'diagnose — vervolgdeel 3',
      JSON.stringify(det));
    toets('na plRolUit gaat er geen pl_-veld naar Anthropic',
      t.bodies.every((b) => !Object.keys(b).some((k) => k.indexOf('pl_') === 0)),
      JSON.stringify(t.bodies.map((b) => Object.keys(b))));
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})();
