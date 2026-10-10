// ══════════════════════════════════════════════════════════════════
// test-tank.js — PLTank: tankbeurten, beloofd bereik tegenover echt (#469)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE pidlane-tank.js met vm; niets overgeschreven.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • km die uit de ritten komen terwijl er twee km-standen zijn;
//   • geen ritten in een cyclus die als 0 km telt in plaats van onbekend;
//   • "gehaald" dat het resterende bereik vergeet (de klant tankt niet leeg);
//   • een volle-tankverbruik dat een halve beurt tussendoor overslaat, of
//     doorrekent terwijl een beurt geen liters heeft (dan is hij te laag);
//   • een CSV die Excel niet goed opent (punt als decimaal, puntkomma in
//     een notitie, geen BOM);
//   • een notitie die als HTML op het scherm komt.
//
// Draaien vanuit public/:  node test-tank.js     (exit 0 = goed)
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

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-tank.js'), 'utf8'), ctx, { filename: 'pidlane-tank.js' });
const T = ctx.window.PLTank;
if (!T) { console.log('FOUT PLTank niet gevonden'); process.exit(1); }

const t = (id, op, x) => Object.assign({ id, op }, x || {});
const rit = (start, km) => ({ start, km });

console.log('\n1. Km tussen twee tankbeurten');
{
  const a = t('a', '2026-10-01T12:00:00Z', { kmstand: 86000 }), b = t('b', '2026-10-08T12:00:00Z', { kmstand: 86540 });
  const rs = [rit('2026-10-02T08:00:00Z', 300), rit('2026-10-05T08:00:00Z', 250), rit('2026-09-30T08:00:00Z', 999), rit('2026-10-08T13:00:00Z', 999)];
  const k = T.kmTussen(a, b, rs);
  toets('twee km-standen winnen van de ritten', k.km === 540 && k.bron === 'kmstand', JSON.stringify(k));
  toets('alleen ritten binnen het venster tellen (550, niet 2548)', k.ritKm === 550 && k.ritten === 2, JSON.stringify(k));
  toets('de afwijking ritten ↔ km-stand in procent', k.afwijking === 1.9, String(k.afwijking));
  const z = T.kmTussen(t('a', a.op), t('b', b.op), rs);
  toets('zonder km-standen: de ritten', z.km === 550 && z.bron === 'ritten' && z.afwijking === null, JSON.stringify(z));
  const leeg = T.kmTussen(t('a', a.op), t('b', b.op), []);
  toets('geen ritten en geen km-stand: onbekend, niet 0', leeg.km === null && leeg.bron === null, JSON.stringify(leeg));
  const tik = T.kmTussen(a, t('b', b.op, { kmstand: 96540 }), rs);
  toets('een sprong van 10.540 km (tikfout) valt terug op de ritten', tik.km === 550 && tik.bron === 'ritten', JSON.stringify(tik));
  const terug = T.kmTussen(a, t('b', b.op, { kmstand: 85000 }), []);
  toets('een lagere km-stand geeft geen negatieve km', terug.km === null, JSON.stringify(terug));
}

console.log('\n2. Beloofd tegenover gehaald');
{
  const tk = [
    t('b', '2026-10-08T12:00:00Z', { kmstand: 86540, bereik_voor: 90, bereik_dashboard: 660 }),
    t('a', '2026-10-01T12:00:00Z', { kmstand: 86000, bereik_dashboard: 650, bereik_app: 600 }),
    t('c', '2026-10-15T12:00:00Z', { kmstand: 87100 })
  ];
  const cs = T.cycli(tk, []);
  toets('twee cycli uit drie beurten, oudste eerst (ook als de invoer nieuwste eerst is)', cs.length === 2 && cs[0].vanId === 'a' && cs[1].vanId === 'b', JSON.stringify(cs.map((c) => c.vanId)));
  toets('opgemaakt = beloofd − wat er bij de volgende beurt nog stond (650 − 90)', cs[0].opgemaakt === 560 && cs[0].restBekend === true, JSON.stringify(cs[0]));
  toets('gehaald = 540 / 560 = 96,4 %', cs[0].gehaaldPct === 96.4, String(cs[0].gehaaldPct));
  toets('tegenover de app (600 km): 90 %', cs[0].gehaaldAppPct === 90, String(cs[0].gehaaldAppPct));
  toets('zonder bereik vóór: het hele beloofde bereik, en dat staat erbij', cs[1].opgemaakt === 660 && cs[1].restBekend === false && cs[1].gehaaldPct === 84.8, JSON.stringify(cs[1]));
  toets('dagen per cyclus', cs[0].dagen === 7);
  const s = T.samenvatting(tk, []);
  toets('samenvatting gewogen naar km: (540+560)/(560+660) = 90,2 %', s.gehaaldPct === 90.2 && s.gehaaldN === 2 && s.zonderRest === 1, JSON.stringify(s));
  toets('één beurt: geen cyclus, geen percentage', T.cycli([tk[0]], []).length === 0 && T.samenvatting([tk[0]], []).gehaaldPct === null);
  toets('zonder dashboardbereik: geen percentage, wel km', T.cycli([t('a', '2026-10-01T12:00:00Z', { kmstand: 1 }), t('b', '2026-10-02T12:00:00Z', { kmstand: 101 })], [])[0].gehaaldPct === null);
}

console.log('\n3. Echt verbruik met de volle-tankmethode');
{
  const tk = [
    t('a', '2026-10-01T12:00:00Z', { kmstand: 86000, liters: 40, vol: false }),     // niet vol: telt nog niet
    t('b', '2026-10-03T12:00:00Z', { kmstand: 86100, liters: 10, vol: true, literprijs: 2 }),
    t('c', '2026-10-06T12:00:00Z', { kmstand: 86400, liters: 15, vol: false, bedrag: 30 }),
    t('d', '2026-10-09T12:00:00Z', { kmstand: 86700, liters: 21, vol: true, literprijs: 2 })
  ];
  const vt = T.volleTank(tk, []);
  toets('één stuk: van de eerste volle (b) tot de volgende volle (d)', vt.length === 1 && vt[0].totId === 'd' && vt[0].beurten === 2, JSON.stringify(vt));
  toets('de halve beurt tussendoor telt mee: (15 + 21) l / 600 km = 6,0 l/100', vt[0].liters === 36 && vt[0].km === 600 && vt[0].l100 === 6, JSON.stringify(vt[0]));
  toets('kosten: € 30 + 21 × € 2 = € 72, € 12 per 100 km', vt[0].kosten === 72 && vt[0].per100 === 12, JSON.stringify(vt[0]));
  const gat = tk.map((x) => x.id === 'c' ? Object.assign({}, x, { liters: null }) : x);
  toets('een beurt zonder liters ertussen: geen verbruik (anders te laag)', T.volleTank(gat, []).length === 0);
  const zonderPrijs = tk.map((x) => x.id === 'c' ? Object.assign({}, x, { bedrag: null }) : x);
  const zp = T.volleTank(zonderPrijs, [])[0];
  toets('een beurt zonder prijs: wel verbruik, geen kosten', zp.l100 === 6 && zp.kosten === null && zp.per100 === null, JSON.stringify(zp));
  toets('samenvatting neemt het volle-tankverbruik over', T.samenvatting(tk, []).l100 === 6 && T.samenvatting(tk, []).per100 === 12);
}

console.log('\n4. Bedrag en literprijs');
{
  const a = T.bedragVan({ liters: 41.5, literprijs: 1.959 });
  toets('bedrag uit liters × prijs', a.bedrag === 81.3 && a.literprijs === 1.959, JSON.stringify(a));
  const b = T.bedragVan({ liters: 40, bedrag: 80 });
  toets('prijs uit bedrag ÷ liters', b.literprijs === 2 && b.bedrag === 80, JSON.stringify(b));
  const c = T.bedragVan({ liters: 40, bedrag: 75, literprijs: 2 });
  toets('wat de klant invulde wint van de rekensom', c.bedrag === 75 && c.literprijs === 2, JSON.stringify(c));
}

console.log('\n5. CSV voor Excel');
{
  const tk = [
    t('b', '2026-10-08T12:00:00Z', { kmstand: 86540, liters: 38.25, literprijs: 1.959, vol: true, bereik_voor: 90, bereik_dashboard: 660, notitie: 'Shell; snelweg\nterug' }),
    t('a', '2026-10-01T12:00:00Z', { kmstand: 86000, liters: 41.5, vol: true, bereik_dashboard: 650 })
  ];
  const c = T.csv(tk, []);
  const regels = c.replace(/^﻿/, '').split('\n');
  toets('begint met een BOM (anders leest Excel € en é verkeerd)', c.charCodeAt(0) === 0xFEFF);
  toets('kop plus één regel per beurt, oudste eerst', regels.length === 3 && regels[1].startsWith('2026-10-01') && regels[2].startsWith('2026-10-08'), regels.join(' | '));
  const kol = regels[0].split(';'), r2 = regels[2].split(';');
  toets('evenveel velden als kolommen (de puntkomma in de notitie breekt niets)', regels.every((r) => r.split(';').length === kol.length), regels.map((r) => r.split(';').length).join(','));
  const veld = (naam) => r2[kol.indexOf(naam)];
  toets('komma als decimaal', veld('liters') === '38,25' && veld('literprijs') === '1,959' && veld('bedrag_eur') === '74,93', regels[2]);
  toets('de cyclus staat op de beurt waarop hij eindigt', veld('km_sinds_vorige') === '540,0' && veld('gehaald_pct') === '96,4' && veld('km_bron') === 'kmstand', regels[2]);
  toets('verbruik volle tank op de sluitende beurt: 38,25 / 540 = 7,1', veld('verbruik_l100_volle_tank') === '7,1', regels[2]);
  toets('de eerste beurt heeft geen cyclus', regels[1].split(';')[kol.indexOf('km_sinds_vorige')] === '');
}

console.log('\n6. Formulier en scherm');
{
  const els = { tk_op: '2026-10-10T14:30', tk_liters: '41,5', tk_kmstand: '', tk_literprijs: '1,959', tk_bedrag: '', tk_bereik_voor: '80', tk_bereik_dashboard: '640', tk_notitie: '  Esso  ' };
  const doc = { getElementById: (id) => id === 'tk_vol' ? { checked: true } : (id in els ? { value: els[id] } : null) };
  const f = T.uitFormulier(doc);
  toets('komma wordt punt, leeg wordt null, vol uit het vinkje', f.liters === 41.5 && f.literprijs === 1.959 && f.kmstand === null && f.bedrag === null && f.vol === true && f.notitie === 'Esso', JSON.stringify(f));
  toets('het tijdstip als ISO', typeof f.op === 'string' && !isNaN(new Date(f.op)), String(f.op));
  const zonder = T.uitFormulier({ getElementById: (id) => id === 'tk_op' ? { value: '' } : null });
  toets('geen datum: op = null (de knop weigert dan)', zonder.op === null);

  const tk = [t('a', '2026-10-01T12:00:00Z', { kmstand: 86000, bereik_dashboard: 650, notitie: '<img src=x onerror=alert(1)>' }), t('b', '2026-10-08T12:00:00Z', { kmstand: 86540, bereik_voor: 90 })];
  const h = T.html({ verbruik_opgegeven: 6.5 }, { tanken: tk, ritten: [], form: null });
  toets('een notitie komt als tekst op het scherm, niet als HTML', h.indexOf('<img') < 0 && h.indexOf('&lt;img') >= 0);
  toets('het scherm noemt wat er gehaald is', /96 %/.test(h) && /540 km gereden/.test(h), h.slice(0, 400));
  toets('zonder beurten: uitleg, geen exportknop', T.html({}, { tanken: [], ritten: [] }).indexOf('_tankExport') < 0);
  toets('nog aan het laden: ⏳', T.html({}, { tanken: null, ritten: [] }).indexOf('⏳') >= 0);
  const form = T.html({ brandstofprijs: 1.899 }, { tanken: [], ritten: [], form: {} });
  toets('nieuw formulier: literprijs uit het profiel, vol standaard aan', /value="1.899"/.test(form) && /id="tk_vol" type="checkbox" checked/.test(form), form.slice(0, 300));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
