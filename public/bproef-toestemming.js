// bproef-toestemming.js — de klant geeft volledige toegang (#645, #646)
//
// Wat test-toestemming.js niet kan zien: of de echte app aan de kant van de
// klant de stroom goed doorloopt. Delen starten, de toestemming melden, een
// analyse van de expert tegenhouden, de vraag in beeld zetten, Toestaan,
// en bij "de expert is weg" weer terug naar basis. En of een vaste expert
// (#646) in het meekijkscherm staat, met een knop om in te trekken.
// De server is nagebouwd: plFetch en WebSocket worden vervangen, de rest
// van PLRemote is de echte code.
//
// Tegenproef: na Weigeren moet een analyse nog steeds tegengehouden worden.
// Gaat hij dan door, dan meldt deze proef dat.
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
  try {
    await app.venster(412, 900);
    console.log('\n1. Delen starten: de app meldt basistoegang');
    const a = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      window.APP_TOKEN = 'nep.token';
      window._uit = [];
      window.plFetch = async function (pad, o) {
        const b = (o && o.json) || {};
        window._uit.push({ pad: pad, b: b });
        const d = pad === '/session/create' ? { ok: true, sessionId: 'abc123def456', joinToken: 'j', localToken: 'l', exp: Math.floor(Date.now() / 1000) + 3600 }
          : pad === '/code/create' ? { ok: true, code: '1234567890' }
          : pad === '/klant/platform' ? { ok: true, experts: [], ingetrokken: 1 } : { ok: true };
        return { ok: true, status: 200, json: async () => d };
      };
      window.WebSocket = function (url) { window._ws = this; this.url = url; this.readyState = 1; this.verzonden = [];
        setTimeout(() => this.onopen && this.onopen(), 10); };
      window.WebSocket.prototype.send = function (t) { this.verzonden.push(JSON.parse(t)); };
      window.WebSocket.prototype.close = function () { this.readyState = 3; };
      PLRemote.openShare();
      await PLRemote.shareStart();
      await wacht(300);
      const t = window._ws.verzonden.filter(m => m.type === 'toestemming');
      return { ws: !!window._ws, eerste: t[0] || null };
    })()`);
    toets('de deelsessie start op de nagebouwde server', a.ws, JSON.stringify(a));
    toets('bij het openen meldt de app basis', a.eerste && a.eerste.niveau === 'basis' && a.eerste.blijvend === false, JSON.stringify(a));

    console.log('\n2. Een expert komt binnen en vraagt een analyse');
    const b = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const ws = window._ws, in_ = m => ws.onmessage({ data: JSON.stringify(m) });
      in_({ type: 'presence', experts: 1 });
      await wacht(200);
      ws.verzonden.length = 0;
      in_({ type: 'request-analyze', problem: 'x', reqId: 'r1' });
      await wacht(200);
      const af = ws.verzonden.find(m => m.reqId === 'r1');
      return { af: af || null, open: document.getElementById('remKlantOv').classList.contains('open'),
               niveau: (document.querySelector('.rem-klant-niveau') || {}).textContent || '' };
    })()`);
    toets('het meekijkscherm opent', b.open, JSON.stringify(b));
    toets('het zegt basistoegang', /Basistoegang/.test(b.niveau), b.niveau);
    toets('de analyse wordt op het toestel tegengehouden', b.af && b.af.data && b.af.data.geweigerd === 'geen_toestemming', JSON.stringify(b.af));

    console.log('\n3. De expert vraagt volledige toegang; de klant weigert eerst');
    const c = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const ws = window._ws, in_ = m => ws.onmessage({ data: JSON.stringify(m) });
      in_({ type: 'request-toestemming', niveau: 'volledig', reden: 'opname tijdens proefrit', reqId: 't1' });
      await wacht(200);
      const vraag = document.getElementById('remKlantVraag');
      const r = { vraag: !!vraag, tekst: vraag ? vraag.textContent : '' };
      PLRemote.toestemmingAntwoord(false);
      await wacht(100);
      ws.verzonden.length = 0;
      in_({ type: 'request-analyze', problem: 'x', reqId: 'r2' });
      await wacht(200);
      r.af = ws.verzonden.find(m => m.reqId === 'r2') || null;
      r.weg = !document.getElementById('remKlantVraag');
      return r;
    })()`);
    toets('de vraag staat in beeld, met de reden en het tegoed', c.vraag && /opname tijdens proefrit/.test(c.tekst) && /jouw tegoed/.test(c.tekst), c.tekst.slice(0, 200));
    toets('na Weigeren is de vraag weg', c.weg);
    toets('tegenproef: na Weigeren nog steeds geen analyse', c.af && c.af.data && c.af.data.geweigerd === 'geen_toestemming', JSON.stringify(c.af));

    console.log('\n4. Nog een keer, nu Toestaan; daarna gaat de expert weg');
    const d = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const ws = window._ws, in_ = m => ws.onmessage({ data: JSON.stringify(m) });
      in_({ type: 'request-toestemming', niveau: 'volledig', reden: '', reqId: 't2' });
      await wacht(200);
      ws.verzonden.length = 0;
      PLRemote.toestemmingAntwoord(true);
      await wacht(100);
      const r = { gemeld: ws.verzonden.find(m => m.type === 'toestemming') || null, antw: ws.verzonden.find(m => m.reqId === 't2') || null,
                  niveau: (document.querySelector('.rem-klant-niveau') || {}).textContent || '' };
      ws.verzonden.length = 0;
      in_({ type: 'request-record', action: 'stop', reqId: 'r3' });
      await wacht(200);
      r.stop = ws.verzonden.find(m => m.reqId === 'r3') || null;
      ws.verzonden.length = 0;
      in_({ type: 'presence', experts: 0 });
      await wacht(200);
      r.terug = ws.verzonden.find(m => m.type === 'toestemming') || null;
      return r;
    })()`);
    toets('Toestaan meldt volledig, niet blijvend', d.gemeld && d.gemeld.niveau === 'volledig' && d.gemeld.blijvend === false, JSON.stringify(d.gemeld));
    toets('de expert krijgt "gegeven"', d.antw && d.antw.data && d.antw.data.toestemming === 'gegeven', JSON.stringify(d.antw));
    toets('het scherm zegt volledige toegang, met Terug naar basis', /Volledige toegang/.test(d.niveau) && /Terug naar basis/.test(d.niveau), d.niveau);
    toets('een opname-stop wordt niet tegengehouden', d.stop && d.stop.data && d.stop.data.geweigerd === undefined, JSON.stringify(d.stop));
    toets('de expert weg: terug naar basis', d.terug && d.terug.niveau === 'basis', JSON.stringify(d.terug));

    console.log('\n5. Een vaste expert (#646) en intrekken');
    const e = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const ws = window._ws, in_ = m => ws.onmessage({ data: JSON.stringify(m) });
      window.confirm = () => true;
      in_({ type: 'presence', experts: 1 });
      in_({ type: 'vast', id: '00000000-0000-4000-8000-000000000000', naam: 'Garage Jansen', aan: true });
      PLRemote.klantToon();
      await wacht(200);
      const r = { niveau: (document.querySelector('.rem-klant-niveau') || {}).textContent || '' };
      ws.verzonden.length = 0;
      in_({ type: 'request-analyze', problem: 'x', reqId: 'r4', vast: true });
      await wacht(100);
      r.vastAf = ws.verzonden.find(m => m.reqId === 'r4' && m.data && m.data.geweigerd) || null;
      ws.verzonden.length = 0;
      window._uit.length = 0;
      await PLRemote.vastIntrekken();
      r.ws = ws.verzonden.find(m => m.type === 'toestemming') || null;
      r.server = window._uit.find(x => x.pad === '/klant/platform') || null;
      r.na = (document.querySelector('.rem-klant-niveau') || {}).textContent || '';
      await PLRemote.shareStop();
      return r;
    })()`);
    toets('het scherm noemt de vaste expert met een intrekknop', /Vaste toegang voor Garage Jansen/.test(e.niveau) && /Koppeling intrekken/.test(e.niveau), e.niveau);
    toets('een verzoek van de vaste expert wordt niet tegengehouden', e.vastAf === null, JSON.stringify(e.vastAf));
    toets('intrekken meldt het aan de sessie', e.ws && e.ws.vastIntrekken === true, JSON.stringify(e.ws));
    toets('…en trekt de koppeling op de server in', e.server && e.server.b.actie === 'expert_ontkoppel' && /^0{8}-/.test(e.server.b.id), JSON.stringify(e.server));
    toets('…en daarna staat er weer basis', /Basistoegang/.test(e.na), e.na);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-toestemming: alles goed' : '\nbproef-toestemming: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
