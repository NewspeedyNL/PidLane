/* test-uds.js — PLUds: foutcodes van alle stuurapparaten (UDS 0x19).
   Laadt de echte pidlane-uds.js; de bus is een nep-stuurfunctie die elk
   commando vastlegt, zodat ook het terugzetten van de adapter te zien is. */
'use strict';
const fs = require('fs');
const vm = require('vm');

const s = { console, Promise, setTimeout: (fn) => { fn(); return 0; } };
s.window = s; s.globalThis = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-uds.js', 'utf8'), s, { filename: 'pidlane-uds.js' });
const U = s.PLUds;
if (!U || typeof U.parse19 !== 'function') throw new Error('PLUds.parse19 niet gevonden');

let fouten = 0, aantal = 0;
function eis(ok, naam, extra) {
  aantal++;
  if (ok) console.log('  ok   ' + naam);
  else { fouten++; console.log('  FOUT ' + naam + (extra ? '\n       ' + extra : '')); }
}

(async () => {
  console.log('1. Het antwoord ontleden');
  let p = U.parse19('59 02 FF 01 71 00 08');
  eis(p.staat === 'gelezen' && p.codes.length === 1 && p.codes[0].code === 'P0171' && p.codes[0].ftb === '00' && p.codes[0].bevestigd && !p.codes[0].actief,
    'één bevestigde code, niet actief', JSON.stringify(p));
  p = U.parse19('00B\n0: 59 02 FF 50 73 00 08\n1: 40 35 11 89');
  eis(p.staat === 'gelezen' && p.codes.map((c) => c.code + '-' + c.ftb).join() === 'C0035-11,C1073-00',
    'multi-frame: twee codes, met lampje bovenaan', JSON.stringify(p.codes));
  eis(p.codes[0].lamp && p.codes[0].actief && !p.codes[1].lamp, 'statusbits: lampje en actief', JSON.stringify(p.codes));
  p = U.parse19('7F 19 78\n59 02 FF 01 71 00 08');
  eis(p.staat === 'gelezen' && p.codes.length === 1, '7F 19 78 (even geduld) gevolgd door het antwoord: gelezen', JSON.stringify(p));
  p = U.parse19('7F 19 11');
  eis(p.staat === 'geweigerd' && p.nrc === '11', 'een weigering is geen stilte', JSON.stringify(p));
  eis(U.parse19('NO DATA').staat === 'stil' && U.parse19('').staat === 'stil' && U.parse19('CAN ERROR').staat === 'stil', 'NO DATA, leeg en een busfout: stil');
  p = U.parse19('59 02 FF');
  eis(p.staat === 'gelezen' && p.codes.length === 0, 'TEGENPROEF: wel antwoord, geen codes, is "gelezen, leeg" en niet "stil"', JSON.stringify(p));
  p = U.parse19('59 02 FF 01 71 00 00 01 72 00 08');
  eis(p.codes.length === 1 && p.codes[0].code === 'P0172', 'een record met status 0 is geen code', JSON.stringify(p.codes));
  p = U.parse19('59 02 FF 11 7A 00 50 04 21 00 50 01 71 00 10 01 72 00 40');
  eis(p.staat === 'gelezen' && p.codes.length === 0, 'Mazda CX-5: alleen "test niet gedraaid" (bit 4/6) is geen fout', JSON.stringify(p.codes));
  p = U.parse19('59 02 FF 11 7A 00 50 04 21 00 28');
  eis(p.codes.length === 1 && p.codes[0].code === 'P0421' && p.codes[0].bevestigd && p.codes[0].eerder,
    'TEGENPROEF: dezelfde lijst met één echte fout (bevestigd) houdt die ene', JSON.stringify(p.codes));
  p = U.parse19('59 02 FF 01 71 00 20');
  eis(p.codes.length === 1 && p.codes[0].eerder && !p.codes[0].bevestigd, 'alleen "fout sinds het wissen" telt wel: dat is geschiedenis', JSON.stringify(p.codes));
  p = U.parse19('7E8 07 59 02 FF 01 71 00 08');
  eis(p.staat === 'gelezen' && p.codes.length === 1, 'met headers aan (7E8 + PCI) ook gelezen', JSON.stringify(p));
  p = U.parse19('41 0C 1A F8');
  eis(p.staat === 'stil', 'TEGENPROEF: een antwoord op een andere vraag is geen UDS-antwoord', JSON.stringify(p));

  console.log('\n2. De scan: per adres, en de adapter gaat altijd terug');
  const log = [];
  const nep = (A, opt) => {
    let hdr = '7DF';
    return async (cmd) => {
      log.push(cmd);
      if (cmd === 'ATDPN') return (opt && opt.proto) || 'A6';
      if (/^ATSH/.test(cmd)) { hdr = cmd.slice(4); return 'OK'; }
      if (/^AT/.test(cmd)) return 'OK';
      if (opt && opt.breek === hdr) throw new Error('verbinding weg');
      return A[hdr] || 'NO DATA';
    };
  };
  let res = await U.scan(nep({ '7E0': '59 02 FF 01 71 00 08', '760': '59 02 FF 40 35 11 09', '737': '7F 19 11' }));
  const m = (h) => res.modules.find((x) => x.hdr === h);
  eis(res.modules.length === U.MODULES.length, 'elk adres uit de lijst is gevraagd');
  eis(m('760').codes[0].code === 'C0035' && m('7E0').codes[0].code === 'P0171' && m('737').staat === 'geweigerd' && m('720').staat === 'stil',
    'per stuurapparaat de eigen uitkomst', JSON.stringify(res.modules));
  eis(log.indexOf('ATSH760') >= 0 && log[log.indexOf('ATSH760') + 1] === 'ATCRA768' && log[log.indexOf('ATSH760') + 2] === '1902FF',
    'ATSH, dan het ontvangstfilter op adres + 8, dan 19 02 FF', log.slice(0, 8).join(' '));
  eis(log.slice(-2).join() === 'ATSH7DF,ATCRA', 'de adapter staat daarna weer op 7DF zonder filter', log.slice(-3).join(' '));
  const regels = U.alsTekst(res);
  eis(regels.some((r) => /ABS.*C0035-11.*nu actief/.test(r)) && regels.some((r) => /Geen antwoord.*720/.test(r)),
    'het rapport noemt de code en zegt welke adressen stil waren', regels.join(' | '));

  log.length = 0;
  let fout = null;
  try { await U.scan(nep({}, { breek: '760' })); } catch (e) { fout = e; }
  eis(!fout && log.slice(-2).join() === 'ATSH7DF,ATCRA', 'een stuurapparaat dat de verbinding breekt: toch terug op 7DF', String(fout) + ' ' + log.slice(-3).join(' '));

  log.length = 0;
  res = await U.scan(nep({ '7E0': '59 02 FF 01 71 00 08' }, { proto: 'A3' }));
  eis(res.nietCan && !log.some((c) => /^ATSH/.test(c)) && !res.modules.length, 'geen CAN: niets gericht gevraagd, en dat staat erbij', log.join(' '));
  res = await U.scan(nep({ '7E0': '59 02 FF 01 71 00 08' }, { proto: '8' }));
  eis(!res.nietCan && res.modules[0].codes.length === 1, 'TEGENPROEF: 11-bit CAN op 250k (8) wordt wél gevraagd');

  res = await U.scan(U.demoStuur());
  eis(res.modules.some((x) => (x.codes || []).some((c) => c.code === 'C0035')), 'de demo levert een ABS-code', JSON.stringify(res.modules.filter((x) => x.staat !== 'stil')));

  console.log('\n3. Het verslag gaat mee: Rapporten en het foutcoderapport');
  const gemeld = [];
  s.registerSessionReport = (e) => { gemeld.push(e); return e; };
  res = await U.scan(nep({ '760': '59 02 FF 40 35 11 09' }));
  eis(U.laatste() === res, 'de laatste uitlezing is op te vragen');
  eis(U.bewaarInSessie(res) && gemeld.length === 1 && gemeld[0].type === 'uds' && /C0035-11/.test(gemeld[0].text),
    'bewaarInSessie zet het verslag in Rapporten', JSON.stringify(gemeld).slice(0, 200));
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-foutcodes.js', 'utf8'), s, { filename: 'pidlane-foutcodes.js' });
  const F = s.PLFoutcodes;
  const scan = await F.leesUit(F.demoStuur());
  let t = F.alsTekst(Object.assign({}, scan, { tijd: res.tijd }));
  eis(/=== ALLE STUURAPPARATEN \(UDS 19 02\) ===[\s\S]*C0035-11/.test(t), 'het bewaarde foutcoderapport noemt de ABS-code', t.slice(-400));
  t = F.alsTekst(Object.assign({}, scan, { tijd: res.tijd + 2 * 3600 * 1000 }));
  eis(!/ALLE STUURAPPARATEN/.test(t), 'TEGENPROEF: een UDS-uitlezing van twee uur eerder hoort er niet bij');

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT test brak af: ' + (e.stack || e)); process.exit(1); });
