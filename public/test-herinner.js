// ══════════════════════════════════════════════════════════════════
// test-herinner.js — APK en onderhoud als herinnering (PLHerinner)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// Een herinnering die een dag te laat komt, of twee keer, of op een datum
// die al voorbij is, maakt de functie erger dan niets. Wat hier vast moet
// staan: de juiste momenten (30, 7 en 0 dagen vooraf om 09:00), niets in het
// verleden, één herinnering per kenteken ook als dat in twee bronnen staat,
// vaste id's zodat opnieuw plannen overschrijft, en in de demo en zonder
// toestemming wordt er niets bij Android ingepland.
//
// Laadt de echte pidlane-herinner.js. Draaien vanuit public/:
//   node test-herinner.js   (exit 0 = goed)
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

function laad(extra) {
  const opslag = {};
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error() {} },
    document: { readyState: 'loading', addEventListener() {} },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    setTimeout() {}, setInterval() {}, JSON, Date, Math, Promise
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-herinner.js'), 'utf8'), ctx, { filename: 'pidlane-herinner.js' });
  if (!ctx.PLHerinner || !ctx.PLHerinner._kern) { console.log('FOUT PLHerinner hangt zijn kern niet meer naar buiten'); process.exit(1); }
  return { ctx, opslag };
}
const K = laad().ctx.PLHerinner._kern;
const NU = new Date(2026, 8, 29, 12, 0, 0).getTime();   // 29-09-2026 12:00 lokaal

(async () => {
  console.log('1. De punten uit de twee bronnen');
  const mijn = { kent: 'ab-123-c', keuring: '20261215', merk: 'Mazda', model: 'CX-5' };
  const vt = [
    { id: 'v1', status: 'actief', naam: 'Onze Skoda', kenteken: 'XY999Z', apk_tot: '2026-11-10', onderhoud_datum: '2027-01-05' },
    { id: 'v2', status: 'archief', naam: 'Oude', kenteken: 'OO111O', apk_tot: '2026-10-10' }
  ];
  const p = K.punten(mijn, vt);
  toets('APK en onderhoud van een actief voertuig, plus je eigen kenteken', p.length === 3, JSON.stringify(p.map((x) => x.sleutel)));
  toets('een gearchiveerd voertuig krijgt geen herinnering', !p.some((x) => x.kenteken === 'OO111O'));
  const dubbel = K.punten({ kent: 'XY-999-Z', keuring: '20261201' }, vt);
  toets('hetzelfde kenteken in beide bronnen telt één keer — Mijn voertuigen wint',
    dubbel.filter((x) => x.soort === 'apk').length === 1 && dubbel.find((x) => x.soort === 'apk').datum === '20261110');
  toets('zonder datum geen punt', K.punten({ kent: 'AB123C' }, []).length === 0);

  console.log('\n2. Het plan');
  const pl = K.plan(K.punten(mijn, []), NU);
  const data = pl.map((x) => new Date(x.at));
  toets('drie momenten voor één APK', pl.length === 3, String(pl.length));
  toets('30 dagen vooraf, 7 dagen vooraf en op de dag zelf',
    data[0].getDate() === 15 && data[0].getMonth() === 10 && data[1].getDate() === 8 && data[1].getMonth() === 11 && data[2].getDate() === 15 && data[2].getMonth() === 11,
    data.map((d) => d.toString()).join(' | '));
  toets('om 09:00 lokale tijd', data.every((d) => d.getHours() === 9 && d.getMinutes() === 0));
  toets('gesorteerd op tijd', pl.every((x, i) => i === 0 || pl[i - 1].at <= x.at));
  const bijna = K.plan(K.punten({ kent: 'AB123C', keuring: '20261010' }, []), NU);
  toets('wat al voorbij is, wordt niet ingepland (APK over 11 dagen: alleen 7 en 0)',
    bijna.length === 2 && bijna.map((x) => x.trede).join(',') === '7,0', JSON.stringify(bijna.map((x) => x.trede)));
  toets('een verlopen APK plant niets', K.plan(K.punten({ kent: 'AB123C', keuring: '20260901' }, []), NU).length === 0);
  const vandaag = K.plan(K.punten({ kent: 'AB123C', keuring: '20260929' }, []), new Date(2026, 8, 29, 8, 0).getTime());
  toets('de dag zelf, vóór 09:00: die ene komt nog', vandaag.length === 1 && vandaag[0].trede === 0);

  console.log('\n3. Id\'s en teksten');
  toets('hetzelfde punt en dezelfde trede geven altijd hetzelfde id', K.meldId('apk:AB123C', 7) === K.meldId('apk:AB123C', 7));
  toets('een andere trede of een ander kenteken een ander id', K.meldId('apk:AB123C', 7) !== K.meldId('apk:AB123C', 30) && K.meldId('apk:AB123C', 7) !== K.meldId('apk:AB123D', 7));
  const ids = new Set(); let ok = true;
  for (let i = 0; i < 2000; i++) { const id = K.meldId('apk:K' + i, i % 3); if (!(id > 0 && id <= 2147483647)) ok = false; ids.add(id); }
  toets('id\'s zijn positieve 32-bit getallen (wat Android eist), zonder botsingen over 2000 stuks', ok && ids.size === 2000);
  const t30 = K.tekstVoor({ soort: 'apk', naam: 'Mazda CX-5', kenteken: 'AB123C', datum: '20261215' }, 30);
  const t0 = K.tekstVoor({ soort: 'apk', naam: 'Mazda CX-5', kenteken: 'AB123C', datum: '20261215' }, 0);
  toets('de tekst noemt de auto, het kenteken en de datum', /Mazda CX-5/.test(t30.titel) && /AB123C/.test(t30.titel) && /15-12-2026/.test(t30.tekst));
  toets('30 dagen en de dag zelf zeggen iets anders', /30 dagen/.test(t30.titel) && /vandaag/.test(t0.titel));

  console.log('\n4. Binnenkort (de melding in de app)');
  const bk = K.binnenkort([{ soort: 'apk', sleutel: 'a', datum: '20261010' }, { soort: 'apk', sleutel: 'b', datum: '20270101' }, { soort: 'apk', sleutel: 'c', datum: '20260920' }], NU);
  toets('binnen 30 dagen en pas verlopen wel, ver weg niet', bk.map((x) => x.sleutel).join(',') === 'a,c' && bk.find((x) => x.sleutel === 'c').dagen === -9);

  console.log('\n5. Inplannen bij Android');
  function nepPlugin(toestemming) {
    const log = { gepland: [], weg: [], gevraagd: 0 };
    return { log, LN: {
      checkPermissions: async () => ({ display: toestemming }),
      requestPermissions: async () => { log.gevraagd++; return { display: toestemming }; },
      schedule: async (o) => { log.gepland.push(...o.notifications); },
      cancel: async (o) => { log.weg.push(...o.notifications.map((x) => x.id)); }
    } };
  }
  {
    const np = nepPlugin('granted');
    const { ctx, opslag } = laad({ Capacitor: { Plugins: { LocalNotifications: np.LN } }, demoMode: false, showToast() {} });
    opslag.pl_zonder_mijn = JSON.stringify({ kent: 'AB123C', keuring: '20991215', merk: 'Mazda' });
    await ctx.PLHerinner.synchroniseer(true);
    toets('uit (de standaard): er wordt niets ingepland', np.log.gepland.length === 0);
    await ctx.PLHerinner.zet(true);
    toets('aan: drie herinneringen bij Android, met een datum', np.log.gepland.length === 3 && np.log.gepland.every((x) => x.schedule && x.schedule.at instanceof Date || (x.schedule && typeof x.schedule.at === 'object')), JSON.stringify(np.log.gepland.map((x) => x.id)));
    toets('de ids staan bewaard, om later weg te halen', JSON.parse(opslag.pl_herinner_ids).length === 3);
    await ctx.PLHerinner.zet(false);
    toets('uit: de ingeplande worden weer weggehaald', np.log.weg.length === 3 && JSON.parse(opslag.pl_herinner_ids).length === 0);
  }
  {
    const np = nepPlugin('denied');
    const { ctx, opslag } = laad({ Capacitor: { Plugins: { LocalNotifications: np.LN } }, demoMode: false, showToast() {} });
    opslag.pl_zonder_mijn = JSON.stringify({ kent: 'AB123C', keuring: '20991215' });
    await ctx.PLHerinner.zet(true);
    toets('zonder toestemming: gevraagd, niets ingepland, de knop staat wel aan (terugval in de app)',
      np.log.gevraagd === 1 && np.log.gepland.length === 0 && ctx.PLHerinner.aan() === true);
  }
  {
    const np = nepPlugin('granted');
    const { ctx, opslag } = laad({ Capacitor: { Plugins: { LocalNotifications: np.LN } }, demoMode: true, showToast() {} });
    opslag.pl_zonder_mijn = JSON.stringify({ kent: 'AB123C', keuring: '20991215' });
    opslag.pl_herinner = 'true';
    await ctx.PLHerinner.zet(true);
    await ctx.PLHerinner.synchroniseer(true);
    toets('in de demo wordt er niets bij Android ingepland — daar kan de zandbak niet bij', np.log.gepland.length === 0 && np.log.gevraagd === 0);
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
