// ══════════════════════════════════════════════════════════════════
// bproef-thuis.js — het startscherm in de echte app (PLThuis, 06-11-2026)
// ──────────────────────────────────────────────────────────────────
// test-thuis.js toetst de kern. Dit toetst de koppeling: dat de held de
// toestand van de app volgt (geen adapter → Verbind, demo → Check, verbonden
// en gecheckt → Naar Live), dat de chips uit pidVals lezen, dat de
// winterkaart in laag 2 staat, dat Expert op afstand van Home weg is en in
// het verbindscherm en Meer staat, en dat een bewaarde indeling voor een
// klant in het account landt zonder de andere voorkeuren te wissen.
//
// Draaien vanuit public/:  node bproef-thuis.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 6000) / 100; i++) { if (await app.ev(expr)) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  };
  const zicht = id => `(function(){ const e=document.getElementById('${id}'); return !!e && !e.closest('[hidden]') && e.getClientRects().length > 0; })()`;

  try {
    console.log('\n── 1. zonder adapter ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    await app.ev(`plDemoZonderLogin(); 'ok'`);
    await new Promise(r => setTimeout(r, 2500));
    // De demo zonder login opent eerst de autokeuze; die dicht, en naar Home zoals "Verder zonder adapter".
    await app.ev(`(function(){ const m=document.getElementById('demoCarModal'); if(m) m.style.display='none'; demoMode=false; connected=false; goHome(); PLThuis.teken(); return 'ok'; })()`);
    toets('Home staat in beeld', await wacht(`!document.getElementById('welcomeScreen').classList.contains('hidden')`, 5000));
    toets('de held staat er, met "Verbind adapter" als enige hoofdknop',
      await wacht(`${zicht('plVerbindBtn')} && !${zicht('plCheckBtn')} && !${zicht('plLiveBtn')}`),
      await app.ev(`document.getElementById('plThuisHeld') ? document.getElementById('plThuisHeld').textContent.slice(0,160) : 'geen held'`));
    // Niet het attribuut maar wat je ziet: zonder de CSS-regel voor [hidden] stonden alle drie er.
    toets('precies één hoofdknop is echt zichtbaar', await app.ev(`[...document.querySelectorAll('#plThuisHeld .th-cta')].filter(b => b.getClientRects().length > 0 && b.offsetHeight > 0).length === 1`));
    toets('de pil zegt dat er geen adapter is', await app.ev(`document.getElementById('plThuisPil').dataset.t === 'geen'`));
    toets('Expert op afstand staat niet meer op Home', await app.ev(`!document.getElementById('plExpert') && !/Ik ben de expert/.test(document.getElementById('wmDoors').textContent)`));
    toets('…maar wel in Meer en in het verbindscherm',
      await app.ev(`!!document.querySelector('#kebabMenu #plExpertDeel') && !!document.querySelector('#kebabMenu #plExpertOntvang') && !!document.querySelector('#connActions [onclick*="expert(\\'deel\\')"]') && !!document.querySelector('#connActions [onclick*="openExpert"]')`));
    toets('de oude kaarten (Mijn voertuigen, Niet in de auto?) staan niet meer los in beeld', !(await app.ev(zicht('plZonderKaart'))) && !(await app.ev(zicht('plGarageKaart'))));
    toets('de winterkaart hangt in laag 2 (Voor jou nu)', await app.ev(`!!document.querySelector('#plThuisNu #plWinterKaart')`));
    await app.ev(`PLThuis.verbind(); 'ok'`);
    toets('Verbind adapter opent het verbindscherm', await wacht(`!document.getElementById('connOv').classList.contains('hidden')`, 3000));
    await app.ev(`closeConnOv(); 'ok'`);

    console.log('\n── 2. verbonden ──');
    const live = await app.ev(`(async function(){
      connected = true; demoMode = false;
      pidVals['0142'] = 14.1; pidVals['0105'] = 42;
      const echt = PLOpstart.checkVandaag; PLOpstart.checkVandaag = () => false;
      PLThuis.teken(); await new Promise(r => setTimeout(r, 50));
      const r1 = { check: !document.getElementById('plCheckBtn').hidden, verbind: !document.getElementById('plVerbindBtn').hidden,
        chips: [...document.querySelectorAll('#plThuisChips .th-chip')].map(x => x.dataset.k + '=' + x.querySelector('b').textContent).join(' '),
        nu: (document.querySelector('#plThuisNuKaart .th-nu') || {}).textContent || '', pil: document.getElementById('plThuisPil').dataset.t };
      PLOpstart.checkVandaag = () => true; PLThuis.teken(); await new Promise(r => setTimeout(r, 50));
      r1.live = !document.getElementById('plLiveBtn').hidden && document.getElementById('plCheckBtn').hidden;
      PLOpstart.checkVandaag = echt; connected = false; delete pidVals['0142']; delete pidVals['0105']; PLThuis.teken();
      return r1;
    })()`);
    toets('verbonden zonder check vandaag: Check mijn auto, geen Verbind', live.check && !live.verbind && live.pil === 'verbonden', JSON.stringify(live));
    toets('de chips lezen pidVals: 14,1 V en 42°', /volt=14,1 V/.test(live.chips) && /koel=42°/.test(live.chips), live.chips);
    toets('met koude motor zegt Voor jou nu dat de motor nog koud is', /Motor nog koud/.test(live.nu), live.nu);
    toets('na de check van vandaag: Naar Live', live.live, JSON.stringify(live));

    console.log('\n── 3. startscherm aanpassen (geen klant: op dit toestel) ──');
    await app.ev(`document.getElementById('kbThuis').click(); 'ok'`);
    toets('Meer → Startscherm aanpassen opent de editor', await wacht(zicht('plThuisOv'), 3000));
    const aanpas = await app.ev(`(async function(){
      PLThuis._blok('fav', true);
      PLThuis._snel('voorbereiding', false);
      PLThuis._schuif('blok', 1, -1);            // Snel naar boven Voor jou nu
      await PLThuis._bewaar();
      const ls = JSON.parse(localStorage.getItem('pl_thuis') || 'null');
      const orde = id => Number(document.querySelector('#plThuisBlokken [data-blok="' + id + '"]').style.order);
      return { ls: ls && ls.l, fav: !document.getElementById('plThuisFav').hidden, tegels: [...document.querySelectorAll('#plThuisTegels [data-snel]')].map(x => x.dataset.snel),
        snelVoorNu: orde('snel') < orde('nu'), dicht: document.getElementById('plThuisOv').hidden };
    })()`);
    toets('bewaard op dit toestel, editor dicht', Array.isArray(aanpas.ls) && aanpas.ls.indexOf('b:fav') >= 0 && aanpas.dicht, JSON.stringify(aanpas));
    toets('Favorieten staat nu op Home, Voorbereiden niet meer', aanpas.fav && aanpas.tegels.indexOf('voorbereiding') < 0 && aanpas.tegels.length === 3, JSON.stringify(aanpas.tegels));
    toets('de volgorde volgt de keuze: Snel naar boven Voor jou nu', aanpas.snelVoorNu, JSON.stringify(aanpas));
    toets('een tik op een Snel-tegel opent de wizard op zijn tak', await app.ev(`(function(){ let t=null; const e=PLWizard.open; PLWizard.open=x=>{t=x;}; document.querySelector('#plThuisTegels [data-snel="storing"]').click(); PLWizard.open=e; return t==='storing'; })()`));

    console.log('\n── 4. een klant: de indeling gaat naar het account, de rest blijft ──');
    const klant = await app.ev(`(async function(){
      const gestuurd = []; const echt = window.plFetch;
      window.plFetch = async function(pad, o){
        if (String(pad).indexOf('/klant/platform') < 0) return echt(pad, o);
        const b = (o && o.json) || {}; gestuurd.push(b);
        const d = b.actie === 'voorkeuren' ? { ok:true, voorkeur:{ druk:'psi' } } : b.actie === 'voorkeuren_opslaan' ? { ok:true, voorkeur:b.voorkeur } : { ok:true };
        return { ok:true, status:200, json: async () => d };
      };
      window.currentUser = { user:'k@voorbeeld.nl', role:'klant', label:'K' };
      try {
        PLThuis.aanpassen(); PLThuis._basis('kenner'); await PLThuis._bewaar();
      } finally { window.plFetch = echt; }
      const opslaan = gestuurd.filter(x => x.actie === 'voorkeuren_opslaan').pop();
      return { opslaan: opslaan && opslaan.voorkeur, huidig: PLVoorkeur.huidig() };
    })()`);
    toets('bewaren stuurt thuis mee, en de bestaande voorkeur (druk psi) blijft staan',
      !!klant.opslaan && Array.isArray(klant.opslaan.thuis) && klant.opslaan.thuis.indexOf('p:kenner') >= 0 && klant.opslaan.druk === 'psi', JSON.stringify(klant));
    toets('de app leest daarna de indeling uit het account', await app.ev(`document.querySelectorAll('#plThuisTegels [data-snel="live"]').length === 1`));

    console.log('\n── 5. smalle telefoon ──');
    await app.venster(360, 740);
    await app.ev(`PLThuis.teken(); 'ok'`);
    toets('geen horizontale scroll op 360 px', await app.ev(`document.documentElement.scrollWidth <= 361`), String(await app.ev('document.documentElement.scrollWidth')));
    toets('de hoofdknop staat boven de vouw (in de duimzone, boven de onderbalk)',
      await app.ev(`(function(){ const b=[...document.querySelectorAll('#plThuisHeld .th-cta')].find(x=>!x.hidden); if(!b) return false; const r=b.getBoundingClientRect(); return r.bottom < innerHeight - 60; })()`),
      await app.ev(`JSON.stringify([...document.querySelectorAll('#plThuisHeld .th-cta')].filter(x=>!x.hidden).map(x=>x.getBoundingClientRect().bottom))`));
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\nbproef-thuis: ' + (fouten ? fouten + ' FOUT' : 'goed'));
  process.exit(fouten ? 1 : 0);
})();
