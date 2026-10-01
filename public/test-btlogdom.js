// ══════════════════════════════════════════════════════════════════
// test-btlogdom.js — het element #btLog blijft begrensd, net als _btLog
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (01-10-2026, #302)
// btDiag() kapte de array _btLog af op 1400 regels, maar hing in het
// element #btLog bij elke regel een div bij die er nooit meer uitging.
// Bij twee à drie regels per verzoek (TX, klaar) stonden er na tien
// minuten pollen ruim 30.000 in. Gemeten in Chromium met de echte app:
//
//   1.000 regels in het element   →  0,3 ms per nieuwe regel
//  31.000 regels in het element   → 10   ms per nieuwe regel
//
// Lineair met de lengte, op de hoofddraad die ook de antwoorden van de
// adapter afhandelt. Dat past op het verloop van 01-10 08:43–08:51
// (43 → ~120 ms per verzoek in tien minuten).
//
// Deze test laadt de echte btDiag() en btLogDomAfkappen() en schrijft er
// 5000 regels doorheen. De tegenproef haalt de afkapping uit de bron en
// laat zien dat het element dan meegroeit.
//
// Draaien vanuit public/:  node test-btlogdom.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-btflow.js', 'utf8');
function knip(van, tot) {
  const a = bron.indexOf(van);
  if (a < 0) { console.log('  FOUT anker niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.log('  FOUT eindanker niet gevonden na: ' + van); process.exit(1); }
  return bron.slice(a, b);
}

const capBron = knip('const BTLOG_CAP=', 'function btDiag(');
const diagBron = knip('function btDiag(', '// ── BT LOG MODAL');

// Een element dat zijn kinderen echt bijhoudt: dat is waar het hier om gaat.
function maakEl() {
  const kids = [];
  return {
    style: {}, textContent: '', title: '', scrollTop: 0, scrollHeight: 0,
    kids,
    get childElementCount() { return kids.length; },
    get firstElementChild() { return kids[0] || null; },
    get children() { return kids; },
    get firstChild() { return kids[0] || null; },
    appendChild(k) { kids.push(k); return k; },
    removeChild(k) { const i = kids.indexOf(k); if (i >= 0) kids.splice(i, 1); return k; },
    set innerHTML(v) { kids.length = 0; },
  };
}

function laad(diag) {
  const logEl = maakEl();
  const document = {
    getElementById: (id) => (id === 'btLog' ? logEl : null),
    createElement: () => maakEl(),
  };
  const _btLog = [];
  const f = new Function('_btLog', 'document', 'liveLogWrite', 'setTimeout', 'console',
    'let _btPersistT=1; function _btPersistNow(){}\n' + capBron + '\n' + diag +
    '\nreturn { btDiag, DOM: typeof BTLOG_DOM==="undefined" ? null : BTLOG_DOM, CAP: BTLOG_CAP };');
  const m = f(_btLog, document, () => {}, () => 0, { warn() {} });
  m.log = _btLog; m.el = logEl;
  return m;
}

console.log('\n1. Na 5000 regels staat het element op zijn grens');
{
  const m = laad(diagBron);
  for (let i = 0; i < 5000; i++) m.btDiag('010C0D11 klaar: 43ms ' + i, 'info');
  toets('BTLOG_DOM bestaat', typeof m.DOM === 'number' && m.DOM > 0, String(m.DOM));
  toets('het element houdt hoogstens ' + m.DOM + ' regels', m.el.childElementCount <= m.DOM,
        m.el.childElementCount + ' regels');
  toets('en houdt er ook echt ' + m.DOM + ' (de staart wordt niet leeggegooid)', m.el.childElementCount === m.DOM,
        m.el.childElementCount + ' regels');
  const laatste = m.el.kids[m.el.kids.length - 1];
  toets('de laatste regel is de nieuwste', laatste && laatste.kids[2] && laatste.kids[2].textContent === '010C0D11 klaar: 43ms 4999',
        laatste && laatste.kids[2] && laatste.kids[2].textContent);
  toets('de array houdt zijn eigen cap (die verandert hier niet)', m.log.length <= m.CAP, m.log.length + ' regels');
  toets('het venster toont minder dan de array bewaart', m.DOM < m.CAP, m.DOM + ' tegen ' + m.CAP);
}

console.log('\n2. TEGENPROEF — zonder de afkapping groeit het element mee');
{
  const zonder = diagBron.replace('btLogDomAfkappen(logEl); ', '');
  toets('de afkapping is uit de bron te knippen', zonder !== diagBron, 'aanroep niet gevonden in btDiag()');
  const m = laad(zonder);
  for (let i = 0; i < 5000; i++) m.btDiag('010C0D11 klaar: 43ms ' + i, 'info');
  toets('zonder afkapping staan er alle 5000 in het element', m.el.childElementCount === 5000,
        m.el.childElementCount + ' regels');
}

console.log(fouten ? `\n${fouten} FOUT` : '\nAlles goed');
process.exit(fouten ? 1 : 0);
