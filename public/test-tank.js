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

console.log('\n7. Stap 2: tanken herkennen aan het brandstofpeil (13-10-2026)');
{
  toets('mediaan: één uitschieter telt niet', T.mediaan([12, 12, 40, 13, 12]) === 12 && T.mediaan([1, 3]) === 2 && T.mediaan([]) === null);
  toets('sprong van 12 naar 96: getankt', !!T.tankSprong({ pct: 12, t: 1 }, { pct: 96, t: 2 }));
  toets('sprong van 12 naar 26 (14 punt): niet', T.tankSprong({ pct: 12, t: 1 }, { pct: 26, t: 2 }) === null);
  toets('omlaag is nooit tanken', T.tankSprong({ pct: 80, t: 1 }, { pct: 20, t: 2 }) === null);
  toets('zonder anker (eerste keer): geen vraag', T.tankSprong(null, { pct: 96, t: 2 }) === null);

  // Een tikreeks: geeft per tik de uitkomst van peilTik terug, met het anker zoals PLGarage het bewaart.
  const reeks = (anker, tikken) => {
    let st = {}, a = anker; const vragen = [];
    tikken.forEach(([kmh, pct], i) => { const r = T.peilTik(st, kmh, pct, 1000 + i, a); st = r.st; if (r.anker) a = r.anker; if (r.sprong) vragen.push(r.sprong); });
    return { vragen, anker: a };
  };
  const stil = (pct, n) => Array.from({ length: n || 5 }, () => [0, pct]);

  // Geval 1: app dicht bij de pomp. Anker 12 %, nieuwe sessie start op 96 %.
  let r = reeks({ pct: 12, t: 0 }, stil(96));
  toets('na een sessie zonder app bij de pomp: één vraag, van 12 naar 96', r.vragen.length === 1 && r.vragen[0].voor === 12 && r.vragen[0].na === 96, JSON.stringify(r.vragen));
  toets('en het nieuwe anker is 96', r.anker.pct === 96);
  // Geval 2: contact aan bij de pomp: het peil loopt op binnen één stilstand.
  const oplopend = [].concat(stil(12), [14, 20, 30, 45, 60, 75, 90, 96, 96, 96, 96, 96].map(p => [0, p]));
  r = reeks({ pct: 30, t: 0 }, oplopend);
  toets('contact aan bij de pomp: ook gevangen, en maar één keer', r.vragen.length === 1 && r.vragen[0].voor === 12, JSON.stringify(r.vragen));
  // Klotsen tijdens het rijden telt niet.
  r = reeks({ pct: 40, t: 0 }, [[50, 70], [60, 75], [55, 80], [50, 72], [48, 71], [52, 74]]);
  toets('klotsen tijdens het rijden: geen vraag en geen nieuw anker', r.vragen.length === 0 && r.anker.pct === 40);
  // Eén uitschieter in stilstand dempt de mediaan.
  r = reeks({ pct: 40, t: 0 }, [[0, 40], [0, 41], [0, 90], [0, 40], [0, 40]]);
  toets('één uitschieter van 90 bij stilstand: geen vraag', r.vragen.length === 0, JSON.stringify(r.vragen));
  // Rijden, stoppen, rijden: een lager peil is gewoon verbruik.
  r = reeks({ pct: 60, t: 0 }, [].concat(stil(60), [[50, 55]], stil(52)));
  toets('stoppen na een stuk rijden: nieuw anker op het lagere peil, geen vraag', r.vragen.length === 0 && r.anker.pct === 52, JSON.stringify(r));
  toets('te weinig metingen in stilstand: nog geen oordeel', reeks({ pct: 10, t: 0 }, stil(96, 4)).vragen.length === 0);

  const u = T.uitSprong({ voor: 12, na: 96, op: Date.UTC(2026, 9, 13, 8) }, 612.4);
  toets('het formulier krijgt peil, vol, bereik van de app en bron app', u.tank_voor === 12 && u.tank_na === 96 && u.vol === true && u.bereik_app === 612 && u.bron === 'app' && /^2026-10-13T08/.test(u.op), JSON.stringify(u));
  toets('tot 80 %: niet vol, en zonder CA09 geen bereik', T.uitSprong({ voor: 12, na: 80, op: 1 }, null).vol === false && T.uitSprong({ voor: 12, na: 80, op: 1 }, null).bereik_app === null);

  const f = T.html({}, { tanken: [], ritten: [], form: u });
  toets('het formulier zegt wat de app zag en draagt het mee', /van 12 % naar 96 %/.test(f) && /id="tk_bron" value="app"/.test(f) && /id="tk_bereik_app" value="612"/.test(f), f.slice(0, 500));
  const f2 = T.html({}, { tanken: [], ritten: [], form: T.uitSprong({ voor: 12, na: 80, op: 1 }, null) });
  toets('niet vol: het vinkje staat uit', /id="tk_vol" type="checkbox">/.test(f2));
  const els = { tk_op: '2026-10-13T10:00', tk_liters: '45', tk_bron: 'app', tk_tank_voor: '12', tk_tank_na: '96', tk_bereik_app: '612' };
  const doc = { getElementById: (id) => id === 'tk_vol' ? { checked: true } : (id in els ? { value: els[id] } : null) };
  const g = T.uitFormulier(doc);
  toets('bewaren stuurt bron, peil en app-bereik mee', g.bron === 'app' && g.tank_voor === 12 && g.tank_na === 96 && g.bereik_app === 612, JSON.stringify(g));
  const hand = T.uitFormulier({ getElementById: (id) => id === 'tk_op' ? { value: '2026-10-13T10:00' } : null });
  toets('een gewone beurt stuurt geen bron mee', !('bron' in hand) && !('tank_na' in hand));
  const lijst = T.html({}, { tanken: [t('a', '2026-10-01T12:00:00Z', { liters: 40 }), t('b', '2026-10-08T12:00:00Z', { liters: 41, bron: 'app', tank_voor: 12, tank_na: 96, bereik_app: 612 })], ritten: [] });
  toets('in de lijst: "Herkend door de app" met het peil', /Herkend door de app: peil 12 → 96 %/.test(lijst));
}

console.log('\n8. Stap 3: de ritten van één tankcyclus');
{
  const tk = [t('a', '2026-10-01T12:00:00Z'), t('b', '2026-10-08T12:00:00Z')];
  const rs = [rit('2026-09-30T08:00:00Z', 10), rit('2026-10-02T08:00:00Z', 20), rit('2026-10-08T11:59:00Z', 30), rit('2026-10-08T12:00:00Z', 40), rit('2026-10-09T08:00:00Z', 50)];
  const c = T.cyclusRitten(tk, rs, 'b');
  toets('de cyclus die op b eindigt: de ritten vanaf a tot b, b zelf niet', c.ritten.map(x => x.km).join(',') === '20,30', JSON.stringify(c));
  const lopend = T.cyclusRitten(tk, rs, null);
  toets('de lopende cyclus: alles sinds de laatste beurt', lopend.ritten.map(x => x.km).join(',') === '40,50' && lopend.tot === null);
  toets('de eerste beurt heeft geen cyclus', T.cyclusRitten(tk, rs, 'a') === null);
  toets('zonder tankbeurten geen lopende cyclus', T.cyclusRitten([], rs, null) === null);
  const h = T.html({}, { tanken: tk, ritten: rs });
  toets('knoppen: per cyclus en sinds de laatste beurt', /_tankCyclus\(&quot;b&quot;\)/.test(h) && /_tankCyclus\(null\)/.test(h) && !/_tankCyclus\(&quot;a&quot;\)/.test(h));
}

console.log('\n9. Stap 3: de samenvatting per cyclus');
{
  const r = (start, km, duur_s, liters) => ({ start, km, duur_s, liters });
  const tk = [t('a', '2026-10-01T12:00:00Z', { vol: true, liters: 40 }), t('b', '2026-10-08T12:00:00Z', { vol: true, liters: 50, literprijs: 2 })];
  const rs = [r('2026-09-30T08:00:00Z', 99, 3600, 9), r('2026-10-02T08:00:00Z', 300, 10800, 21), r('2026-10-05T08:00:00Z', 200, 7200, 24), r('2026-10-08T12:00:00Z', 50, 1800, 4)];
  const c = T.cycli(tk, rs)[0];
  toets('alleen de ritten binnen de cyclus (de rit op het tankmoment zelf niet)', c.rit.ritten === 2 && c.rit.km === 500, JSON.stringify(c.rit));
  toets('rijtijd en gemiddelde snelheid uit de ritten', c.rit.rijMin === 300 && c.rit.kmh === 100, JSON.stringify(c.rit));
  toets('liters en verbruik volgens de app', c.rit.liters === 45 && c.rit.l100 === 9, JSON.stringify(c.rit));
  toets('getankt en kosten van de beurt die de cyclus afsluit', c.getankt === 50 && c.kosten === 100, JSON.stringify([c.getankt, c.kosten]));
  toets('vol tot vol: de app mat 90 % van wat er getankt is', c.appVsGetanktPct === 90, String(c.appVsGetanktPct));
  const half = T.cycli([tk[0], Object.assign({}, tk[1], { vol: false })], rs)[0];
  toets('TEGENPROEF: niet vol getankt — geen vergelijking, want dan is getankt niet verbruikt', half.appVsGetanktPct === null, String(half.appVsGetanktPct));
  const gat = T.cycli(tk, rs.map((x, i) => i === 2 ? Object.assign({}, x, { liters: null }) : x))[0];
  toets('TEGENPROEF: een rit zonder liters — geen vergelijking, de som is te laag', gat.appVsGetanktPct === null && gat.rit.litersVolledig === false, JSON.stringify(gat.rit));
  toets('het verbruik telt dan alleen de ritten met liters', gat.rit.l100 === 7, String(gat.rit.l100));
  const kort = T.ritSom([r('2026-10-02T08:00:00Z', 8, 600, 1)], Date.parse('2026-10-01'), Date.parse('2026-10-08'));
  toets('onder 20 km met liters: geen verbruik uit de ritten', kort.l100 === null && kort.liters === 1, JSON.stringify(kort));
  toets('zonder ritten: niet gemeten, geen nul', T.ritSom([], 0, Date.now()) === null);
  const regels = T.csv(tk, rs).replace(/^\uFEFF/, '').split('\n'), kol = regels[0].split(';'), r2 = regels[2].split(';');
  toets('CSV: de cycluskolommen staan bij de beurt die de cyclus afsluit',
    r2[kol.indexOf('ritten')] === '2' && r2[kol.indexOf('rijtijd_min')] === '300' && r2[kol.indexOf('liters_app')] === '45,00' && r2[kol.indexOf('app_tegenover_getankt_pct')] === '90,0', regels[2]);
  toets('CSV: de notitie blijft de laatste kolom', kol[kol.length - 1] === 'notitie');
  const h = T.html({}, { tanken: tk, ritten: rs });
  toets('scherm: ritten, rijtijd en de vergelijking met getankt', /2 ritten · 5:00 u gereden · gem\. 100 km\/u/.test(h) && /de app mat 45,0 l \(90 %\)/.test(h), h.slice(h.indexOf('ritten') - 80, h.indexOf('ritten') + 220));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
