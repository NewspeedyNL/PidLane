// ══════════════════════════════════════════════════════════════════
// test-modulecmd.js — commando's naar één stuurapparaat (17-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-modulecmd.js met vm; de adapter is nagemaakt aan
// de rand (stuur), net als de bevestiging en de bus.
//
// De onderscheidende vragen:
//   - alleen hex komt door: geen AT-commando, geen oneven lengte, ≤ 7 bytes
//   - lezen (22, 19) gaat zonder vraag en zonder poort; 11, 2E, 31, 04, 10
//     en een onbekende dienst zijn schrijvend
//   - een schrijvend commando: eerst de vraag; nee = niets op de bus
//   - rijden of motor aan = niet verstuurd; toerental onleesbaar = ook niet
//   - 7F .. 78 is "bezig", het antwoord daarna telt; 7F .. 33 stopt de reeks
//   - na afloop staat de adapter weer op 7DF, ook na een fout
//   - recepten: gekeurd, op id vervangen, weg te halen; tekst geëscaped
//
// Draaien vanuit public/:  node test-modulecmd.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const c = { console: { warn() {}, log() {} }, Promise, Date, JSON, Math, Object, String, Array, parseInt, RegExp, logs: [] };
c.window = c;
c.log = (m) => c.logs.push(m);
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-modulecmd.js'), 'utf8'), c, { filename: 'pidlane-modulecmd.js' });
const M = c.PLModuleCmd;

/* Een nagemaakte adapter: antwoorden per commando, en een lijst van wat er ging. */
function adapter(antw) {
  const tx = [];
  const stuur = (cmd) => { tx.push(cmd); const a = antw[cmd]; return Promise.resolve(typeof a === 'function' ? a() : (a === undefined ? 'OK' : a)); };
  return { tx, stuur };
}
const stil = { '010D': '41 0D 00', '010C': '41 0C 00 00' };
const bus = (n, f) => f();

(async () => {
  console.log('\n1. Invoer keuren');
  toets('7D0 + 10 03 is goed', M.keur('7d0', '10 03').ok && M.keur('7d0', '10 03').bytes === '1003');
  toets('AT-commando kan niet', !M.keur('7D0', 'ATMA').ok);
  toets('oneven lengte kan niet', !M.keur('7D0', '100').ok);
  toets('meer dan 7 bytes kan niet', !M.keur('7D0', '01 02 03 04 05 06 07 08').ok);
  toets('29-bit of onzin-adres kan niet', !M.keur('18DA10F1', '1003').ok && !M.keur('8D0', '1003').ok && !M.keur('7G0', '1003').ok);

  console.log('\n2. Lezend of schrijvend');
  toets('22 en 19 en 01 zijn lezend', !M.schrijft('22F190') && !M.schrijft('1902FF') && !M.schrijft('010C'));
  toets('11, 2E, 31, 14, 10, 27 zijn schrijvend', ['1101', '2EF19000', '3101FF00', '14FFFFFF', '1003', '2701'].every((b) => M.schrijft(b)));
  toets('04 (foutcodes wissen) is schrijvend', M.schrijft('04'));
  toets('een onbekende dienst is schrijvend', M.schrijft('A1'));

  console.log('\n3. Het antwoord');
  toets('positief: 51 01', M.oordeel('1101', '51 01').staat === 'ok');
  toets('7F 11 78 dan 51 01: het echte antwoord telt', M.oordeel('1101', '7F 11 78\n51 01').staat === 'ok');
  const w = M.oordeel('2701', '7F 27 33');
  toets('7F 27 33: geweigerd met de reden', w.staat === 'geweigerd' && /beveiliging/.test(w.tekst), JSON.stringify(w));
  toets('NO DATA is stil, geen ok', M.oordeel('1101', 'NO DATA').staat === 'stil');
  toets('een antwoord van een andere dienst is niet ok', M.oordeel('1101', '62 F1 90 01').staat === 'onbekend');
  toets('multiframe wordt aan elkaar geplakt', M.oordeel('22F190', '014\n0: 62 F1 90 4A 4D 5A\n1: 4B 45 31 32 33 34 35').data.indexOf('F1904A4D5A4B45') === 0);

  console.log('\n4. De poort');
  toets('0 km/u en 0 tpm: door', M.poortOordeel('41 0D 00', '41 0C 00 00').ok);
  toets('rijden: niet', !M.poortOordeel('41 0D 05', '41 0C 00 00').ok);
  toets('motor aan (800 tpm): niet', !M.poortOordeel('41 0D 00', '41 0C 0C 80').ok);
  toets('toerental onleesbaar: niet', !M.poortOordeel('41 0D 00', 'NO DATA').ok);

  console.log('\n5. Uitvoeren');
  let a = adapter(Object.assign({ '22F190': '62 F1 90 4A' }, stil));
  let vragen = 0;
  let r = await M.voerUit('7E0', ['22 F1 90'], { stuur: a.stuur, vraag: () => { vragen++; return Promise.resolve(true); }, bus });
  toets('lezen: geen vraag, geen poort', r.staat === 'ok' && vragen === 0 && a.tx.indexOf('010D') < 0, JSON.stringify(a.tx));
  toets('lezen: adres en filter gezet, daarna terug op 7DF', a.tx.indexOf('ATSH7E0') >= 0 && a.tx.indexOf('ATCRA7E8') >= 0 && a.tx[a.tx.length - 2] === 'ATSH7DF', JSON.stringify(a.tx));

  a = adapter(Object.assign({ '1101': '51 01' }, stil));
  r = await M.voerUit('7D0', ['11 01'], { stuur: a.stuur, vraag: () => Promise.resolve(false), bus });
  toets('schrijvend + nee: niets op de bus', r.staat === 'afgebroken' && a.tx.length === 0, JSON.stringify(a.tx));

  a = adapter({ '1101': '51 01', '010D': '41 0D 00', '010C': '41 0C 0C 80' });
  r = await M.voerUit('7D0', ['11 01'], { stuur: a.stuur, vraag: () => Promise.resolve(true), bus });
  toets('schrijvend met draaiende motor: niet verstuurd', r.staat === 'geweigerd' && a.tx.indexOf('1101') < 0 && /motor/.test(r.tekst), JSON.stringify(r));
  toets('ook na weigeren terug op 7DF', a.tx[a.tx.length - 2] === 'ATSH7DF', JSON.stringify(a.tx));

  a = adapter(Object.assign({ '1003': '50 03 00 32 01 F4', '2701': '7F 27 33', '1101': '51 01' }, stil));
  let tekst = '';
  r = await M.voerUit('7D0', ['10 03', '27 01', '11 01'], { stuur: a.stuur, vraag: (t) => { tekst = t; return Promise.resolve(true); }, bus });
  toets('één vraag noemt elk schrijvend commando', /10 03/.test(tekst) && /27 01/.test(tekst) && /11 01/.test(tekst), tekst);
  toets('poort vóór het eerste commando', a.tx.indexOf('010C') >= 0 && a.tx.indexOf('010C') < a.tx.indexOf('1003'), JSON.stringify(a.tx));
  toets('7F 27 33 stopt de reeks: 11 01 gaat niet', r.staat === 'geweigerd' && a.tx.indexOf('1101') < 0 && r.regels.length === 2, JSON.stringify(r));
  toets('elk commando staat in het logboek', c.logs.some((m) => /7D0 TX 1003/.test(m)) && c.logs.some((m) => /7D0 TX 2701 .*beveiliging/.test(m)), c.logs.join(' | '));

  a = adapter(Object.assign({ '1101': () => { throw new Error('socket dicht'); } }, stil));
  r = await M.voerUit('7D0', ['11 01'], { stuur: a.stuur, vraag: () => Promise.resolve(true), bus });
  toets('een fout onderweg: gemeld, en toch terug op 7DF', r.staat === 'fout' && /socket dicht/.test(r.tekst) && a.tx.indexOf('ATSH7DF', a.tx.indexOf('1101')) > 0, JSON.stringify(a.tx));

  r = await M.voerUit('7D0', ['ATMA'], { stuur: a.stuur, vraag: () => Promise.resolve(true), bus });
  toets('ongeldige stap: niets uitgevoerd', r.staat === 'fout');

  console.log('\n6. Recepten');
  let l = M.receptBij([], { id: 'a', naam: 'Airbag reset', merk: 'Hyundai', model: 'i20', module: 'SRS', hdr: '7d0', stappen: '10 03\n11 01' });
  toets('een recept met twee stappen', l.ok && l.lijst.length === 1 && l.recept.stappen.join() === '1003,1101' && l.recept.hdr === '7D0', JSON.stringify(l));
  l = M.receptBij(l.lijst, { id: 'a', naam: 'Airbag reset v2', hdr: '7D0', stappen: ['1003'] });
  toets('zelfde id vervangt', l.lijst.length === 1 && l.lijst[0].naam === 'Airbag reset v2');
  toets('een stap met AT wordt geweigerd', !M.receptBij(l.lijst, { naam: 'x', hdr: '7D0', stappen: 'ATMA' }).ok);
  toets('zonder naam geweigerd', !M.receptBij([], { hdr: '7D0', stappen: '1003' }).ok);
  toets('weghalen', M.receptWeg(l.lijst, 'a').length === 0);

  console.log('\n7. Sjablonen');
  const sj = M.SJABLONEN.map((t, i) => M.sjabloon(i)).filter((t, i) => !M.SJABLONEN[i].leeg);
  toets('er is een i20-airbagsjabloon op 7D0', sj.some((t) => /i20/.test(t.model) && t.hdr === '7D0'));
  toets('elk sjabloon komt door de receptkeuring', sj.every((t) => M.receptKeur(t).ok), JSON.stringify(sj.map((t) => M.receptKeur(t))));
  toets('elk sjabloon zegt dat het ongeverifieerd is', sj.every((t) => /ongeverifieerd/i.test(t.notitie)));
  toets('een sjabloon heeft geen id (bewaren maakt een nieuw recept)', sj.every((t) => t.id === ''));
  toets('het lege formulier is geen geldig recept', !M.receptKeur(M.sjabloon(M.SJABLONEN.length - 1)).ok);
  toets('elk sjabloon opent eerst een diagnosesessie (10 ..)', sj.every((t) => M.receptKeur(t).recept.stappen[0].slice(0, 2) === '10'));
  toets('geen sjabloon buiten de lijst', M.sjabloon(99) === null);
  toets('een sjabloon wist met 14 en is dus schrijvend', sj.every((t) => M.receptKeur(t).recept.stappen.some((b) => b.slice(0, 2) === '14' && M.schrijft(b))));

  console.log('\n8. Bewijs: alleen een positief beantwoorde reeks');
  let bl = M.receptBij([], { id: 'b', naam: 'x', hdr: '7D0', stappen: '10 03\n14 FF FF FF' }).lijst;
  toets('een nieuw recept is niet bewezen', !bl[0].bewezen);
  let na = M.bewijs(bl, 'b', { staat: 'geweigerd', tekst: 'stilstand' }, 'T1');
  toets('een weigering bewijst niets, maar staat in laatst', !na[0].bewezen && na[0].laatst.staat === 'geweigerd');
  toets('afgebroken vóór versturen telt niet', M.bewijs(bl, 'b', { staat: 'afgebroken' }, 'T1')[0].laatst === null);
  na = M.bewijs(na, 'b', { staat: 'ok', tekst: '2 stappen' }, 'T2');
  toets('ok maakt bewezen', na[0].bewezen && na[0].bewezen.datum === 'T2');
  na = M.bewijs(na, 'b', { staat: 'fout', tekst: '7F 14 33' }, 'T3');
  toets('een latere weigering laat bewezen staan, laatst toont hem', na[0].bewezen.datum === 'T2' && na[0].laatst.staat === 'fout');
  toets('bewezen overleeft de receptkeuring', M.receptKeur(na[0]).recept.bewezen.datum === 'T2');
  toets('bewijs raakt andere recepten niet', M.bewijs([{ id: 'z' }], 'b', { staat: 'ok' }, 'T')[0].bewezen === undefined);

  console.log('\n9. AI-voorstellen keuren');
  const vtg = { merk: 'Hyundai', model: 'i20', bouwjaar: 2009, motor: '1.4', kenteken: '12-ABC-3', vin: 'KMHBT51GP9U000000' };
  const pr = M.zoekPrompt(vtg, 'PB 95910-1J400', 'airbag wissen');
  toets('de prompt draagt merk, model, jaar en idents', /Hyundai/.test(pr) && /i20/.test(pr) && /2009/.test(pr) && /95910-1J400/.test(pr));
  toets('kenteken en VIN gaan niet mee', !/12-ABC-3/.test(pr) && !/KMHBT/.test(pr));
  const aiAntw = 'Hier: ' + JSON.stringify({ recepten: [
    { naam: 'SRS wissen', module: 'SRS', hdr: '7D0', stappen: ['10 03', '14 FF FF FF'], bron: 'GDS handleiding', zekerheid: 'hoog' },
    { naam: 'zonder bron', hdr: '7D0', stappen: ['10 03'], bron: '', zekerheid: 'hoog' },
    { naam: 'gok', hdr: '7D0', stappen: ['10 03'], bron: 'x', zekerheid: 'laag' },
    { naam: 'sleutel', hdr: '7D0', stappen: ['10 03', '27 01'], bron: 'forum', zekerheid: 'hoog' },
    { naam: 'schrijven', hdr: '7D0', stappen: ['2E F1 90 00'], bron: 'forum', zekerheid: 'middel' },
    { naam: 'routine', hdr: '7D0', stappen: ['31 01 FF 00'], bron: 'forum', zekerheid: 'middel' },
    { naam: 'raar adres', hdr: '18DA', stappen: ['10 03'], bron: 'forum', zekerheid: 'middel' }] }) + ' klaar';
  const la = M.leesAiRecepten(aiAntw, vtg);
  toets('één voorstel blijft over', la.ok && la.recepten.length === 1 && la.recepten[0].naam === 'SRS wissen', JSON.stringify(la));
  toets('zes afgekeurd, elk met reden', la.weg.length === 6 && la.weg.every((w) => w.reden));
  toets('27, 2E en 31 vallen af op de dienst', ['sleutel', 'schrijven', 'routine'].every((nm) => la.weg.some((w) => w.naam === nm && /dienst/.test(w.reden))));
  const vs = la.recepten[0];
  toets('een voorstel is AI, niet bewezen, met bron in de notitie', vs.ai && !vs.bewezen && /niet bewezen/.test(vs.notitie) && /GDS/.test(vs.notitie));
  toets('merk en model komen uit het voertuig', vs.merk === 'Hyundai' && /i20/.test(vs.model) && /2009/.test(vs.model));
  toets('geen JSON = nette fout', !M.leesAiRecepten('ik weet het niet', vtg).ok);
  toets('lege lijst = ok, niets', M.leesAiRecepten('{"recepten":[]}', vtg).recepten.length === 0);
  let gevraagd = null;
  const za = await M.zoekAi(vtg, 'PB', 'x', { ai: (p, sys) => { gevraagd = { p, sys }; return Promise.resolve(aiAntw); } });
  toets('zoekAi stuurt de systeemprompt mee en keurt het antwoord', gevraagd && /Verzin niets/.test(gevraagd.sys) && za.recepten.length === 1);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT  test gooide: ' + (e.stack || e)); process.exit(1); });
