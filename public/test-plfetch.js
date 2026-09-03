// ══════════════════════════════════════════════════════════════════
// test-plfetch.js — de vier beslissingen die maar één keer genomen horen
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (#117)
//
// Er stonden zesentwintig losse fetch-aanroepen verspreid over elf modules, en
// elk daarvan besliste zelf over de basis-URL, de kop X-App-Token, wat er bij
// een 401 gebeurt en of er iets gelogd wordt. Vier beslissingen, zesentwintig
// keer genomen — en dus zesentwintig kansen om er één anders te nemen. Dat is
// geen theorie: X-PidLane-Saldo werd maar op één plek uitgelezen, en dat
// werkte pas nadat het daar met de hand in was gezet.
//
// Wat hier getoetst wordt is niet dat plFetch bestaat, maar dat hij die vier
// beslissingen ook écht neemt — en dat er geen module meer omheen gaat.
//
// De module wordt geladen, niet nagebouwd. fetch() zelf is de enige nep hier:
// die vangt de aanroep op zodat de URL en de koppen te lezen zijn.
//
// Draaien vanuit public/:  node test-plfetch.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0;
function toets(naam, gemeten, verwacht) {
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + ' — kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
}

// ── de sandbox: de echte module, met fetch als opvangbak ──
function bouw(opt) {
  const o = opt || {};
  const s = {
    console: { warn() {}, error() {}, log() {} },
    JSON, Object, String, Number, Promise,
    gezien: null, meldingen: [], saldoKoppen: []
  };
  s.window = s;
  s.PROXY_URL = ('proxy' in o) ? o.proxy : 'https://proxy.test';
  s.APP_TOKEN = ('token' in o) ? o.token : 'TOK123';
  s.btDiag = function (m, l) { s.meldingen.push(l + ': ' + m); };
  s.PLCredits = { volgServer: function (h) { s.saldoKoppen.push(h && h.get ? h.get('X-PidLane-Saldo') : null); } };
  s.fetch = function (url, init) {
    s.gezien = { url: url, init: init };
    if (o.stuk) return Promise.reject(new Error('Failed to fetch'));
    return Promise.resolve({
      ok: (o.status || 200) < 400,
      status: o.status || 200,
      headers: { get: function (n) { return String(n).toLowerCase() === 'x-pidlane-saldo' ? (o.saldo === undefined ? null : String(o.saldo)) : null; } }
    });
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plfetch.js', 'utf8'), s, { filename: 'pidlane-plfetch.js' });
  return s;
}

console.log('plFetch — basis-URL, tokenkop, 401 en het serversaldo (#117)\n');

// ══════════════════════════════════════════════════════════════════
console.log('── beslissing 1: de basis-URL ──');
{
  const s = bouw();
  const roep = (pad, opt) => vm.runInContext('plFetch(' + JSON.stringify(pad) + ',' + JSON.stringify(opt || {}) + ')', s);
  const url = async (pad, opt) => { await roep(pad, opt); return s.gezien.url; };

  (async () => {
    toets('een pad met slash hangt onder PROXY_URL', await url('/klant/mij'), 'https://proxy.test/klant/mij');
    toets('een pad zonder slash krijgt er een', await url('klant/mij'), 'https://proxy.test/klant/mij');
    toets('een absolute URL gaat ongemoeid door',
      await url('https://api.airtable.test/v0/app/tabel'), 'https://api.airtable.test/v0/app/tabel');

    // Een afsluitende slash op PROXY_URL gaf vroeger "//klant/mij". Vier van de
    // aanroepers deden die replace zelf, de rest niet.
    const t = bouw({ proxy: 'https://proxy.test/' });
    await vm.runInContext('plFetch("/klant/mij")', t);
    toets('een dubbele slash kan niet meer ontstaan', t.gezien.url, 'https://proxy.test/klant/mij');

    // Geen PROXY_URL: dat hoort een fout te zijn MET het pad erin. Zonder pad
    // staat er in het logboek alleen "PROXY_URL ontbreekt" en is niet te zien
    // welke aanroep het was.
    const l = bouw({ proxy: '' });
    let bericht = '';
    try { await vm.runInContext('plFetch("/klant/mij")', l); } catch (e) { bericht = e.message; }
    toets('zonder PROXY_URL een fout, mét het pad erin',
      [bericht.indexOf('PROXY_URL') >= 0, bericht.indexOf('/klant/mij') >= 0], [true, true]);
    toets('en er is dan niets verstuurd', l.gezien, null);

    vervolg();
  })();
}

function vervolg() {
  console.log('\n── beslissing 2: de kop X-App-Token ──');
  (async () => {
    {
      const s = bouw();
      await vm.runInContext('plFetch("/klant/mij")', s);
      toets('de tokenkop gaat vanzelf mee', s.gezien.init.headers['X-App-Token'], 'TOK123');
    }
    {
      // Het inloggen zelf: dáár is nog geen sessie, en een kop uit een oude
      // sessie zou de server op het verkeerde been zetten.
      const s = bouw();
      await vm.runInContext('plFetch("/auth/login",{geenToken:true})', s);
      toets('geenToken laat hem weg', s.gezien.init.headers['X-App-Token'], undefined);
    }
    {
      const s = bouw({ token: '' });
      await vm.runInContext('plFetch("/klant/mij")', s);
      toets('zonder token geen lege kop', s.gezien.init.headers['X-App-Token'], undefined);
    }
    {
      // pidlane-fuel.js geeft bij het laden van de config een token mee dat uit
      // de onthouden sessie komt en nog niet in window.APP_TOKEN staat.
      const s = bouw();
      await vm.runInContext('plFetch("/api/config",{headers:{"X-App-Token":"EIGEN"}})', s);
      toets('een eigen tokenkop wint', s.gezien.init.headers['X-App-Token'], 'EIGEN');
    }
    {
      const s = bouw();
      await vm.runInContext('plFetch("/code/resolve",{method:"POST",json:{code:"ABC"}})', s);
      toets('json zet het type', s.gezien.init.headers['Content-Type'], 'application/json');
      toets('en maakt de body', s.gezien.init.body, '{"code":"ABC"}');
      toets('en json blijft niet als optie hangen', s.gezien.init.json, undefined);
      toets('geenToken ook niet', s.gezien.init.geenToken, undefined);
      let bericht = '';
      try { await vm.runInContext('plFetch("/x",{json:{a:1},body:"b"})', s); } catch (e) { bericht = e.message; }
      toets('json én body samen is een fout', bericht.indexOf('dubbelop') >= 0, true);
    }

    console.log('\n── beslissing 3: wat er bij een 401 gebeurt ──');
    {
      const s = bouw({ status: 401 });
      const r = await vm.runInContext('plFetch("/klant/mij")', s);
      toets('een 401 komt gewoon terug — de aanroeper beslist', r.status, 401);
      toets('maar hij is nooit meer stil', s.meldingen.length, 1);
      toets('en de melding noemt het pad', s.meldingen[0].indexOf('/klant/mij') >= 0, true);
    }
    {
      const s = bouw({ status: 200 });
      await vm.runInContext('plFetch("/klant/mij")', s);
      toets('een geslaagde aanroep meldt niets', s.meldingen, []);
    }
    {
      // Een netwerkfout hoort naar buiten te komen, niet in een stille catch te
      // verdwijnen — mét het pad, want "Failed to fetch" zegt niet wélke.
      const s = bouw({ stuk: true });
      let f = null;
      try { await vm.runInContext('plFetch("/session/create")', s); } catch (e) { f = e; }
      toets('een netwerkfout komt naar buiten', !!f, true);
      toets('met het pad erin', f && f.message.indexOf('/session/create') >= 0, true);
      toets('en de oorspronkelijke fout eraan', f && f.oorzaak && f.oorzaak.message, 'Failed to fetch');
    }

    console.log('\n── beslissing 4: het saldo dat de server meestuurt ──');
    {
      // Dit is het concrete geval uit het issue: X-PidLane-Saldo komt op ELK
      // antwoord mee, maar werd op één plek uitgelezen. Nu op alle.
      const s = bouw({ saldo: 42 });
      await vm.runInContext('plFetch("/proxy?url=x")', s);
      toets('elk antwoord gaat langs volgServer', s.saldoKoppen, ['42']);
    }
    {
      // Ook een weigering draagt het saldo. Zonder deze regel blijft de teller
      // op een te hoog lokaal getal staan en probeert de app het opnieuw.
      const s = bouw({ status: 402, saldo: 0 });
      await vm.runInContext('plFetch("/v1/messages",{method:"POST",json:{}})', s);
      toets('ook een weigering', s.saldoKoppen, ['0']);
    }
    {
      // Geen PLCredits (die module laadt later): mag niet klappen.
      const s = bouw();
      s.PLCredits = undefined;
      const r = await vm.runInContext('plFetch("/klant/mij")', s);
      toets('zonder PLCredits gaat de aanroep gewoon door', r.status, 200);
    }

    console.log('\n── en gaat er niemand meer omheen? ──');
    {
      // Alles hierboven blijft groen als er morgen ergens weer een losse fetch
      // bijkomt: die toetst zichzelf niet. Dit is de enige toets die dat merkt.
      // Twee bestanden mogen het, en waarom staat erbij — meer uitzonderingen
      // horen er niet te komen.
      const magZelf = { 'pidlane-plfetch.js': 'de helper zelf',
                        'pidlane-testrun.js': 'leest eigen bronbestanden in, geen server' };
      const zelf = fs.readdirSync(__dirname)
        .filter(f => /^pidlane-.*\.js$/.test(f) && !magZelf[f])
        .map(f => {
          const code = fs.readFileSync(__dirname + '/' + f, 'utf8')
            .split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
          const n = (code.match(/[^.\w]fetch\s*\(/g) || []).length;
          return n ? f.replace('pidlane-', '').replace('.js', '') + '(' + n + ')' : null;
        })
        .filter(Boolean);
      toets('geen enkele module doet nog zijn eigen fetch', zelf, []);

      // Tegenproef op de uitzonderingen: staan ze er nog, en doen ze nog wat
      // de reden zegt? Verdwijnt zo'n bestand, dan is de uitzondering dood
      // gewicht dat een echte overtreder kan gaan dekken.
      const ontbreekt = Object.keys(magZelf).filter(f => !fs.existsSync(__dirname + '/' + f));
      toets('de twee uitzonderingen bestaan nog', ontbreekt, []);
    }

    console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
    process.exit(fout ? 1 : 0);
  })();
}
