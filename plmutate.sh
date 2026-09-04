#!/data/data/com.termux/files/usr/bin/bash
# ══════════════════════════════════════════════════════════════════
# plmutate.sh — de tegenproef onder plcheck.sh
# ──────────────────────────────────────────────────────────────────
# WAAROM DIT BESTAAT
#
# `plcheck.sh` meldt "65 stuks, allemaal exit 0". Dat is een uitspraak over
# hoeveel tests er GEDRAAID zijn, niet over wat ze zouden merken. Op
# 02-09-2026 is dat verschil gemeten: vier plausibele fouten in de meetketen
# — een off-by-one in de header-echo van parsePID, de harde fysieke limiet
# uitgezet, de NO DATA-poort van de waakronde open, en het oordeel over
# onbekende sensoren omgedraaid — en de volledige reeks bleef groen, met
# "Alles goed — veilig om te committen" eronder.
#
# De werkregel in CLAUDE.md zegt het al voor gewone tests: *een controle
# zonder tegenproef telt niet — bouw de fout na en laat zien dat de test dán
# rood wordt.* Dit script past diezelfde regel toe op de gate zelf.
#
# HOE HET WERKT
# Elke regel in de tabel hieronder is één nagebouwde fout: een bestand, een
# stuk tekst dat vervangen wordt, en de test die daarvan rood hoort te
# worden. Het script zet de fout erin, draait die ene test, verwacht exit 1,
# en zet het bestand daarna terug.
#
# Exit 0 = elke nagebouwde fout is gevangen.
# Exit 1 = er is een fout doorheen gekomen (die test dekt minder dan hij lijkt),
#          of een anker paste niet meer en die fout is dus niet eens nagebouwd.
#
# WANNEER JE HEM DRAAIT
# Niet bij elke commit — `plcheck.sh` blijft de poort vóór het committen.
# Draai hem als je een test toevoegt of verbouwt, en als je wilt weten of
# een groene reeks nog iets betekent.
#
# EEN MUTATIE TOEVOEGEN
# Neem een fout die je écht had kunnen maken, geen kunstmatige. De vraag is
# niet "kan ik deze code stukmaken" maar "welke stille fout hoort gevangen
# te worden". Zet de vervangtekst tussen @@ en houd hem uniek in het bestand.
#
# Draaien:  bash plmutate.sh          (vanuit de repo-root)
#           bash plmutate.sh ~/PidLane
# ══════════════════════════════════════════════════════════════════

REPO="${1:-$(cd "$(dirname "$0")" && pwd)}"
PUB="$REPO/public"
[ -d "$PUB" ] || { echo "Geen public/ in $REPO"; exit 2; }

ROOD=$'\033[31m'; GROEN=$'\033[32m'; GEEL=$'\033[33m'; GRIJS=$'\033[90m'; UIT=$'\033[0m'

# ── De tabel ──────────────────────────────────────────────────────
# bestand @@ zoek @@ vervang @@ test @@ omschrijving
# Het bestandspad is relatief aan de repo-root.
MUTATIES=(
"public/pidlane-diagbundel.js@@const ds=idx>=0?idx+hdr.length:4;@@const ds=idx>=0?idx+hdr.length-2:4;@@test-parser.js@@parsePID slaat de header-echo één byte te vroeg over"
"public/pidlane-diagbundel.js@@if(/[0-9A-Fa-f]\s*:/.test(line)){@@if(false){@@test-parser.js@@de batch-splitser ziet de framemarkers niet meer"
"public/pidlane-datalog.js@@if(lim&&(rawVal<lim.min||rawVal>lim.max)){@@if(false){@@test-parser.js@@laag 1 laat fysiek onmogelijke waarden door"
"public/pidlane-data.js@@'0105':{min:-40,max:215},@@'0105':{min:-400,max:2150},@@test-parser.js@@de harde limiet van koelwater is opgerekt"
"public/pidlane-waakronde.js@@if (/NO DATA|ERROR|UNABLE|STOPPED|SEARCHING|\?/i.test(s)) return false;@@if (false) return false;@@test-waakronde.js@@de waakronde leest een foutmelding als een antwoord"
"public/pidlane-waakronde.js@@const marge = (d.max - d.min) * 0.02;@@const marge = 0;@@test-waakronde.js@@de 2%-marge op het verwachte bereik is weg"
"public/pidlane-rijsituatie.js@@_pidHealth[pid] = (h==='ok'||h==='twijfel'||h==='onzin'||h==='nodata') ? h : 'ok';@@_pidHealth[pid] = h;@@test-healthgate.js@@een onbekende sensor wordt uitgegrijsd in plaats van kiesbaar"
"public/pidlane-rijsituatie.js@@if(ok===0 && geen<pids.length){@@if(false){@@test-healthgate.js@@de veiligheidsfallback van de gezondheidscheck staat uit"

# ── De km-check (PLKm). Zes fouten die je écht kunt maken in een module die
# uit vier bytes een oordeel over fraude trekt: de schaal verkeerd vastzetten,
# het fysieke bereik loslaten, het verschil niet meer wegen, de speling
# oprekken, het patroon omdraaien, en de adapter op één stuurapparaat laten
# staan. Die laatste is de stilste: de check klopt, en de rést van de app
# krijgt daarna niets meer terug.
"public/pidlane-kmcheck.js@@      if (binnen.length === 1) {@@      if (binnen.length >= 1) {@@test-kmcheck.js@@het anker zet een schaal vast terwijl beide lezingen passen"
"public/pidlane-kmcheck.js@@plausibel: km >= CFG.kmMin && km <= CFG.kmMax@@plausibel: true@@test-kmcheck.js@@de fysieke grens aan een tellerstand staat uit, dus geen enkele schaal valt af"
"public/pidlane-kmcheck.js@@      if (groepen.length >= 2 && verschil > tol) {@@      if (false) {@@test-kmcheck.js@@twee stuurapparaten die elkaar tegenspreken leveren geen bevinding op"
"public/pidlane-kmcheck.js@@    return Math.max(CFG.tolVastKm, Math.round(hoogste * CFG.tolPct));@@    return Math.max(CFG.tolVastKm, Math.round(hoogste * CFG.tolPct * 100));@@test-kmcheck.js@@de speling tussen twee stuurapparaten is honderd keer zo ruim"
"public/pidlane-kmcheck.js@@        if (TELLERGROEPEN[laagste.groep] && !TELLERGROEPEN[hoogste.groep]) {@@        if (TELLERGROEPEN[hoogste.groep] && !TELLERGROEPEN[laagste.groep]) {@@test-kmcheck.js@@het patroon van een teruggedraaide teller staat omgekeerd"
"public/pidlane-kmcheck.js@@      try { await sendCmd('ATSH7DF', CFG.atTimeoutMs); }@@      try { if (0) await sendCmd('ATSH7DF', CFG.atTimeoutMs); }@@test-kmcheck.js@@de adapter blijft op het laatste stuurapparaat staan"
"public/pidlane-kmcheck.js@@      var n = h.indexOf('7F' + vraagSid);@@      var n = h.indexOf('7F' + kop.slice(0, 2));@@test-kmcheck.js@@een geweigerde identifier wordt niet als weigering herkend"

# ── De kaartmaker (PLKaart) en de laag eronder. Geen verzonnen fouten: dit
# zijn precies de vier die elke vorige scan lieten mislukken, plus de twee
# die test-kaart.js bij zijn eerste run zelf vond. Ze staan hier zodat ze
# niet nog een keer stilletjes terug kunnen komen.
"public/pidlane-kaart.js@@      await stuur('ATH1', CFG.atTimeoutMs);      // DE belangrijkste regel van dit bestand@@      await stuur('ATH0', CFG.atTimeoutMs);      // DE belangrijkste regel van dit bestand@@test-kaart.js@@de headers staan uit: een antwoord is weer anoniem"
"public/pidlane-kaart.js@@        if ((p & 0xF0) === 0x20) uit += fr.slice(2);@@        if ((p & 0xF0) === 0x20) uit += fr;@@test-kaart.js@@de ISO-TP-teller gaat als databyte mee en verschuift elk lang antwoord"
"public/pidlane-kaart.js@@        if (nr % 0x20 === 0) continue;@@        if (false) continue;@@test-kaart.js@@de bitmap-PID zelf wordt als datapunt geteld"
"public/pidlane-kaart.js@@    if (LEZEND.indexOf(sid) < 0) return { mag: false, reden: 'service ' + sid + ' staat niet op de leeslijst' };@@    if (false) return { mag: false, reden: 'service ' + sid + ' staat niet op de leeslijst' };@@test-kaart.js@@de leeslijst beslist niet meer: een onbekende service mag de bus op"
"public/pidlane-kaart.js@@      var herstel = ['ATSH' + (K.bits === 29 ? '18DB33F1' : '7DF'), 'ATCRA', 'ATH0', 'ATAT1', 'ATST' + CFG.stHerstel];@@      var herstel = ['ATCRA'];@@test-kaart.js@@de adapter blijft na de scan in scanstand staan"
"public/pidlane-kaart.js@@        if (!levend) throw new Error('verbinding weg: ATI gaf twee keer niets terug');@@        if (false) throw new Error('verbinding weg: ATI gaf twee keer niets terug');@@test-kaart.js@@een dode adapter wordt niet meer opgemerkt: de scan draait door op niets"
"public/pidlane-kaart.js@@        for (var di = 0; di < dids.length && !_stop; di++) {@@        for (var di = 0; di < dids.length; di++) {@@test-kaart.js@@de stopknop doet niets meer tijdens de DID-sweep"
"public/pidlane-bt.js@@  if(window._plScanActief) return;@@  if(false) return;@@test-elmpoort.js@@een scan telt zijn eigen lege antwoorden weer als een dode socket"
"public/pidlane-data.js@@    S.since=nu();\n    return true;@@    return true;@@test-busslot.js@@raak() vernieuwt niets: lang werk wordt weer als vastgelopen afgebroken"
"public/pidlane-rijsituatie.js@@if(q.status==='ok'){ ok++; updPID(pid,val); } else onzin++;@@updPID(pid,val);\n      if(q.status==='ok') ok++; else onzin++;@@test-healthherziening.js@@de gezondheidscheck stempelt de versheidsbron vóór het oordeel"
"public/pidlane-testrun.js@@    id: 'achtergrond',@@    id: 'achtergrondproef',@@test-begeleid.js@@een stap van de begeleide rit is hernoemd zonder de volgorderegel mee te nemen"
"public/pidlane-testrun.js@@const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C', '0155', '0156'];@@const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C'];@@test-begeleid.js@@0155 en 0156 zijn weer uit de meet-PIDs verdwenen (#40 blijft dan onmeetbaar)"
"public/pidlane-achtergrond.js@@if (tot - van < DREMPEL_MELDEN) return null;@@if (false) return null;@@test-achtergrond.js@@elke vensterwissel wordt als bevriezing geboekt"
"public/pidlane-data.js@@if(this._iemandWacht(naam)) return 0;@@@@test-busslot.js@@de pollus dringt weer voor: een wachter op het busslot verhongert"
"public/pidlane-data.js@@S.wacht=S.wacht.filter(w=>t-w.sinds < this.WACHT_MAX_MS);@@@@test-busslot.js@@een wachter die zijn beurt niet pakt gijzelt de bus voor altijd"
"public/pidlane-achtergrond.js@@sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond')@@sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond', true)@@test-achtergrond.js@@de socketcontrole sloopt een gezonde verbinding in plaats van hem na te kijken"
"public/pidlane-testrun.js@@if (q && q !== '\\u2014' && uit.indexOf(q) === -1) uit.push(q);@@uit.push(q);@@test-blok5lijst.js@@de dekking van blok 5 ontdubbelt niet meer en laat de streep staan"
"public/pidlane-testrun.js@@    issue: '#29',@@    issue: '',@@test-blok5lijst.js@@een proef in blok 5 is zijn issue kwijt en valt daarmee uit de dekking"
"public/pidlane-testrun.js@@'BLOK 5 DEKT DEZE RONDE: ' + _dekkingB5().join(', ')@@'BLOK 5 DEKT DEZE RONDE: #19, #15'@@test-blok5lijst.js@@de dekkingsregel in CAMPAGNE is weer met de hand overgeschreven"
"public/pidlane-uitgebreid.js@@schoon.indexOf(hdr) >= 0;@@true;@@test-mode21.js@@de uitgebreide probe accepteert elk antwoord"
"public/pidlane-uihelpers.js@@'T' + _plTweeCijfers(d.getHours())@@'T' + _plTweeCijfers(d.getUTCHours())@@test-tijdklok.js@@de stempel valt terug op het UTC-uur (#17)"
"public/pidlane-privacy.js@@    if (klant)@@    if (true)@@test-account-verwijderen.js@@personeel wordt weer naar een knop gestuurd die het niet heeft (#69)"
"public/pidlane-uihelpers.js@@'-' + String(d.getMilliseconds()).padStart(3,'0');@@'-' + String(d.getMilliseconds());@@test-tijdklok.js@@milliseconden verliezen hun voorloopnullen en sorteren verkeerd (#17)"
"public/pidlane-uihelpers.js@@function plDatumLokaal(ms){\n  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);\n  return d.getFullYear() + '-' + _plTweeCijfers(d.getMonth()+1) + '-' + _plTweeCijfers(d.getDate());@@function plDatumLokaal(ms){\n  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);\n  return d.toISOString().slice(0,10);@@test-tijdklok.js@@de exportdatum staat weer op de UTC-dag (#17)"
# ── de vier reparaties van 03-09-2026 (#103 t/m #106) ──
"public/pidlane-testrun.js@@    if (gezien.has(sleutel)) return;@@@@test-opruimmelding.js@@dezelfde opruiming in beide logs telt weer dubbel (#104)"
"public/pidlane-testrun.js@@      if (vorigVerbonden === false) return false;   // tik() heeft de val gezien en telt hem zelf@@@@test-rit.js@@een gemelde herverbinding komt bovenop de bemonstering (#103)"
"public/pidlane-testrun.js@@      herverbindingen++;\n      vorigVerbonden = true;@@      vorigVerbonden = true;@@test-rit.js@@een gemelde herverbinding wordt niet meer geteld (#103)"
"public/pidlane-testrun.js@@  if (prof && prof.ts && typeof verbondenT === 'number' && prof.ts >= verbondenT)@@  if (false)@@test-profielmelding.js@@het profieloordeel kijkt weer naar leeftijd in plaats van naar het verbindingsmoment (#86)"
"public/pidlane-testrun.js@@    return new Set(_trHerstel.actief);@@    return new Set(activePIDs);@@test-stille-selectie.js@@de gebruikersselectie leest tijdens een run weer de sweeplijst (#90)"
"public/pidlane-testrun.js@@  const inSelectie = _gebruikersSelectie().has(pid);@@  const inSelectie = activePIDs.has(pid);@@test-stille-selectie.js@@_waaromNiet duidt weer op de sweeplijst (#90)"
"public/pidlane-plload.js@@const batchable=due.filter(p=>!isBitmapPid(p)&&_m01(p));@@const batchable=due.filter(p=>!isBitmapPid(p));@@test-mode21.js@@mode 21 gaat weer stilzwijgend mee in een mode-01-batch"
"public/pidlane-pids.js@@const sigma=Math.max(b.std, Math.abs(b.mean)*BASE_SIGMA_MIN, 1e-9);@@const sigma=Math.max(b.std, 1e-9);@@test-baseline.js@@de sigma-bodem is weg; strakke historie laat alles afgaan"
"public/pidlane-pids.js@@const BASE_DREMPEL = 3;@@const BASE_DREMPEL = 2.5;@@test-baseline.js@@de bevindingsdrempel is terug naar 2,5 sigma"
"public/pidlane-pids.js@@if(v!==undefined && v!==null && pidOordeel(d,v,pid)!=='ok') return 'groot';\n  const h=pidHist[pid];@@const h=pidHist[pid];@@test-slimmeweergave.js@@een waarschuwing die vastligt zakt naar de rustige strook in plaats van omhoog"
"public/pidlane-pids.js@@const SLIM_MAAT_MIN = 24;@@const SLIM_MAAT_MIN = 4;@@test-slimmeweergave.js@@stilstand wordt al na vier metingen vastgesteld"
"public/pidlane-pids.js@@if(card && card.parentNode && card.parentNode.id==='slimVak-rustig'\n     && (st!=='ok' || slimBeweegt(pid,d))) slimPlaats(pid);@@if(card) slimPlaats(pid);@@test-slimmeweergave.js@@elke meting deelt opnieuw in, dus de indeling verspringt tijdens het rijden"
"public/pidlane-pids.js@@if(tel[kort].length<2) return;@@return;@@test-slimmeweergave.js@@twee meters op de tellerplaat mogen weer dezelfde afkorting dragen"
"public/pidlane-neon.js@@    const laatst=mapped[mapped.length-1];\n    const eerder=mapped.slice(0,-1);\n    const over=MAX-laatst.length-eerder.length;      // de spaties meegerekend\n    const perWoord=Math.floor(over/eerder.length);\n    if(perWoord>=3){\n      const combo=eerder.map(function(w){ return w.slice(0,perWoord); }).join(' ')+' '+laatst;\n      if(combo.length<=MAX) return combo;\n    }@@    const a=mapped[0].slice(0,6), b=mapped[1].slice(0,4);\n    const combo=(a+' '+b);\n    if(combo.length<=MAX+1) return combo;@@test-slimmeweergave.js@@stap 3 kapt weer in het informatieve woord: \"ABS. MOTO\" (#95)"
"public/pidlane-neon.js@@  if(acc.indexOf(grootheid)<0 && grootheid.length<=MAX) return grootheid;@@@@test-slimmeweergave.js@@een naam die alleen de bepaling overhoudt (\"ABS.\") komt er weer door (#95)"
"public/pidlane-pids.js@@    if(hiddenPIDs.has(pid)) pidToon(pid); else pidVerberg(pid);@@    pidDeselect(pid);@@test-verbergen.js@@een dubbeltik op een tegel zet de sensor weer uit in plaats van hem te verbergen"
"public/pidlane-pids.js@@    if(hiddenPIDs.has(pid)) return;@@@@test-verbergen.js@@een verborgen PID krijgt tóch een tegel"
"public/pidlane-pids.js@@  hiddenPIDs.forEach(function(p){ if(!activePIDs.has(p)) hiddenPIDs.delete(p); });@@@@test-verbergen.js@@een opnieuw aangevinkte sensor blijft onzichtbaar door een achtergebleven verborgen-stand"
"public/pidlane-pids.js@@weg.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); pidDeselect(pid); };@@weg.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); pidVerberg(pid); };@@test-verbergen.js@@het kruisje in de verborgen-strook zet niets uit"
"worker.js@@          const r1 = await fetch(recUrl, { headers: hdr });\n          if (!r1.ok) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const r1 = r0;\n          const huidig@@test-bijboeken.js@@bijboeken rekent met de lezing van vóór het slot in plaats van een verse"
"worker.js@@      if (uitkomst.bezet)\n        return json({ ok: false, code: \"saldo_bezet\", error: \"Er loopt al een andere tegoedwijziging voor deze klant. Probeer het zo nog eens.\" }, 409);@@@@test-bijboeken.js@@een bezet saldo-slot laat het bijboeken toch doorlopen"
"worker.js@@      if (!email)\n        return json({ ok: false, code: \"saldo_geen_email\", error: \"Deze klant heeft geen e-mailadres; het tegoed kan niet veilig gewijzigd worden.\" }, 409);@@@@test-bijboeken.js@@bijboeken zet het slot op een leeg e-mailadres in plaats van te weigeren"
"admin/admin.html@@  if (body?.code==='saldo_bezet') {@@  if (body?.code==='saldo_bezet_oud') {@@test-bijboeken.js@@admin.html kent de code voor een bezet saldo-slot niet meer"

# ── saldo ZETTEN door hetzelfde slot (03-09-2026, #93) ──
"worker.js@@          if (saldoWas !== null && huidig !== saldoWas)@@          if (saldoWas !== null && huidig === saldoWas)@@test-bijboeken.js@@de voorwaarde bij saldo zetten staat omgekeerd: een verschoven saldo wordt juist overschreven"
"worker.js@@          const z1 = await fetch(zetUrl, { headers: hdr });\n          if (!z1.ok) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const z1 = z0;\n          const huidig@@test-bijboeken.js@@saldo zetten vergelijkt met de lezing van vóór het slot in plaats van een verse"
"admin/admin.html@@saldoWas:huidig,door:beheerderNaam()@@door:beheerderNaam()@@test-bijboeken.js@@de knop stuurt de voorwaarde niet mee, dus de Worker vergelijkt niets"
"admin/admin.html@@  if (body?.code==='saldo_verschoven') {@@  if (body?.code==='saldo_verschoven_oud') {@@test-bijboeken.js@@admin.html kent de code voor een verschoven saldo niet"
"worker.js@@if (a.length !== b.length) return false;@@if (a.length !== b.length) return true;@@test-token.js@@safeEqual keurt ongelijke lengtes goed"
"worker.js@@if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;\\n    const p = JSON.parse(b64urlToString(payload));\\n    if (!p.exp@@const p = JSON.parse(b64urlToString(payload));\\n    if (!p.exp@@test-token.js@@verifyToken controleert de handtekening niet meer"
"worker.js@@if (!p.exp || Math.floor(Date.now() / 1e3) >= p.exp) return null;@@@@test-token.js@@een verlopen sessietoken blijft geldig"
"worker.js@@const legacyEnabled = String(env.ALLOW_LEGACY_APP_TOKEN || \"\").toLowerCase() === \"true\";@@const legacyEnabled = true;@@test-token.js@@het legacy-token werkt zonder dat de schakelaar aanstaat"
# ── de buspoort van 03-09-2026 (#115) ──
# Alle vier de fouten die een handgeschreven claim/finally écht maakte: het
# slot niet teruggeven als het werk klapt, de uitslag van de claim negeren,
# alsnog gaan wachten waar dat niet mag, en ergens weer een eigen claim
# neerzetten.
"public/pidlane-data.js@@try{ return await fn(); }\n  finally{ window.PLBus.release(tok); }@@const uit=await fn(); window.PLBus.release(tok); return uit;@@test-busslot.js@@de poort geeft het slot niet terug als het werk er met een fout uitspringt"
"public/pidlane-data.js@@  if(!tok) return (typeof alsBezet==='function')?await alsBezet():undefined;@@@@test-busslot.js@@de poort negeert een bezette bus en praat er dwars doorheen"
"public/pidlane-data.js@@    if(lim<=0) return this.claim(naam);@@@@test-busslot.js@@de hersteltik gaat tóch staan wachten in plaats van eenmalig te proberen"
"public/pidlane-monitor.js@@    return await withBusOfNiets('monitor', ()=>this._cycleWerk());@@    const t = PLBus.claim('monitor'); if (!t) return; return await this._cycleWerk();@@test-busslot.js@@een module claimt het busslot weer met de hand, buiten de poort om"
# ── het uitpakken van een 41-antwoord (#116) ──
# De fout die hier telt is niet "de decoder rekent verkeerd" maar "de decoder
# gaat om de helper heen". Dat valt alleen op bij antwoordvormen die zijn
# eigen indexOf-lus niet kende: framemarkers midden in de regel.
"public/pidlane-verify.js@@    const b=splitBatchResponse(String(r), ['01'+pp])['01'+pp];\n    if (!b || !b.length) return null;\n    const A=b[0];\n    const B=b.length>=2 ? b[1] : 0;@@    const hex=String(r).replace(/[^0-9A-Fa-f]/g,'').toUpperCase();\n    const i=hex.indexOf('41'+pp);\n    if (i<0 || hex.length<i+6) return null;\n    const A=parseInt(hex.slice(i+4,i+6),16);\n    const B=hex.length>=i+8 ? parseInt(hex.slice(i+6,i+8),16) : 0;@@test-uitpakken.js@@de focus-decoder pakt zijn antwoord weer zelf uit"
"public/pidlane-veldlab.js@@    const b=splitBatchResponse(String(raw||''), ['0101'])['0101'];\n    if(!b||b.length<4) return null;\n    const A=b[0], B=b[1], C=b[2], D=b[3];@@    const h=_svNormHex(raw); const i=h.indexOf('4101');\n    if(i===-1||h.length<i+12) return null;\n    const A=parseInt(h.slice(i+4,i+6),16), B=parseInt(h.slice(i+6,i+8),16),\n          C=parseInt(h.slice(i+8,i+10),16), D=parseInt(h.slice(i+10,i+12),16);@@test-uitpakken.js@@de readiness-decoder pakt zijn 0101 weer zelf uit"
"public/pidlane-data.js@@  'A6':4\n};@@  'A6':1\n};@@test-uitpakken.js@@de odometer krijgt weer één byte in plaats van vier"
"public/pidlane-testrun.js@@        const b = splitBatchResponse(String(rk), ['0105'])['0105'];\n        if (b && b.length) koel = b[0] - 40;@@        const h = hex(rk), i = h.indexOf('4105');\n        if (i >= 0) koel = parseInt(h.substr(i + 4, 2), 16) - 40;@@test-uitpakken.js@@de testrun pakt zijn koelwater-anker weer zelf uit"
# ── de ene plek waar de app het net op gaat (#117) ──
# Elk van deze vier is een beslissing die plFetch juist wegneemt.
"public/pidlane-plfetch.js@@  return b + (p.charAt(0)==='/' ? p : '/'+p);@@  return b + p;@@test-plfetch.js@@een pad zonder beginslash plakt weer aan de host vast"
"public/pidlane-plfetch.js@@  if(!zonder && t && !kop['X-App-Token']) kop['X-App-Token']=t;@@  if(!zonder && t) kop['X-App-Token']=t;@@test-plfetch.js@@de helper overschrijft een tokenkop die de aanroeper zelf meegaf"
"public/pidlane-plfetch.js@@  try{ if(window.PLCredits && PLCredits.volgServer) PLCredits.volgServer(resp.headers, null); }@@  try{ if(false) PLCredits.volgServer(resp.headers, null); }@@test-plfetch.js@@het serversaldo uit X-PidLane-Saldo blijft weer liggen"
"public/pidlane-plfetch.js@@  if(resp.status===401) diag('Server weigert (401) bij '+pad+' — sessie verlopen of ongeldig','warn');@@@@test-plfetch.js@@een verlopen sessie is weer stil"
"public/pidlane-klant.js@@    const r = await plFetch(pad, { method: 'POST', geenToken: !metToken, json: body || {} });@@    const r = await fetch(_base() + pad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });@@test-plfetch.js@@een module doet zijn serveraanroep weer zelf, buiten de helper om"
# ── het scherm dat de gebruiker ziet als de app niet laadt ──
# Alle drie zijn stille fouten: de workflow bouwt gewoon door, de bundel ziet
# er goed uit, en je merkt het pas op een toestel zonder netwerk. Dat is het
# toestel waarop niemand meer kijkt — en bij een Play-review is het het
# toestel van de reviewer.
"capacitor.config.json@@    \"cleartext\": false,\n    \"errorPath\": \"error.html\"@@    \"cleartext\": false@@test-foutpagina.js@@de schil is zijn errorPath kwijt en valt terug op de kale WebView-fout"
".github/workflows/build-apk.yml@@cat > www/error.html@@cat > www/offline.html@@test-foutpagina.js@@de foutpagina is hernoemd zonder capacitor.config.json mee te nemen"
".github/workflows/build-apk.yml@@          <title>Geen verbinding — PidLane</title>@@          <title>Geen verbinding — PidLane</title>\n          <link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Inter\">@@test-foutpagina.js@@de foutpagina haalt een lettertype van het net dat er juist niet is"
# ── de knop waar de reviewnotitie naar wijst ──
# De halve schakelaar: één van de twee demoknoppen gedekt. Dat is precies hoe
# hij er tot 03-09 in stond, en de fout is onzichtbaar zolang feat_demo aan is.
"public/pidlane-fuel.js@@  feat_demo:         ['[id=\"btnDemo\"]','[id=\"btnDemoLogin\"]'],@@  feat_demo:         ['[id=\"btnDemo\"]'],@@test-demo-toegang.js@@feat_demo laat de demoknop op het loginscherm als dode knop staan"
# ── de tekst die in de Play Console geplakt wordt ──
# Drie fouten in een markdownbestand waar niets in de repo op afgaat: een
# dode link in een verplicht veld, een afvinklijst die een oude versie
# bevestigt, en het woord dat de hele Data safety-form onjuist maakt.
"PLAY-INZENDING.md@@\`\`\`\nhttps://app.pidlane.nl/privacy.html\n\`\`\`@@\`\`\`\nhttps://pidlane.nl/privacy.html\n\`\`\`@@test-playteksten.js@@de privacy-URL wijst naar een andere host dan de app zelf gebruikt"
"package.json@@  \"version\": \"3.0.0\",@@  \"version\": \"3.1.0\",@@test-playteksten.js@@de afvinklijst bevestigt een versienummer dat niet meer gebouwd wordt"
"PLAY-INZENDING.md@@| URL | \`https://app.pidlane.nl/verwijderen.html\` |@@| URL | \`https://pidlane.nl/verwijderen.html\` |@@test-playteksten.js@@de verwijder-URL wijst naar een andere host dan de app zelf gebruikt"
"PLAY-INZENDING.md@@## 8. Ads@@De gedeelde meetdata is geanonimiseerd.\n\n## 8. Ads@@test-playteksten.js@@het inzenddocument noemt de meetdata weer anoniem in plaats van gepseudonimiseerd"
# ── de poort voor automerge (03-09-2026) ──
# Dit is de stilste plek in de opzet om iets stuk te hebben: een verkeerd
# besluit hier voegt iets samen wat niet af is, en elke merge is een deploy.
# De vierde is de subtielste en daarom belangrijk: de poort blijft dicht maar
# zegt het niet meer, en dan blijft een PR liggen zoals vóór automerge.
"automerge-besluit.js@@  if (!heeftLabel(labels, LABEL_KLAAR)) {@@  if (false) {@@test-automerge.js@@de klaar-poort staat open: alles wordt weer vanzelf samengevoegd"
"automerge-besluit.js@@  return (labels || []).some(l => String(l).trim().toLowerCase() === gezocht);@@  return (labels || []).indexOf(naam) >= 0;@@test-automerge.js@@labels weer hoofdlettergevoelig: `Klaar` doet niets meer"
"automerge-besluit.js@@  if (f.testsGroen !== true) {@@  if (false) {@@test-automerge.js@@via de labelroute wordt er samengevoegd zonder dat de testgate groen staat"
".github/workflows/automerge.yml@@        with:\n          ref: \${{ github.event.repository.default_branch }}@@@@test-automerge.js@@de checkout pakt bij een label-event de PR-head: een PR schrijft zijn eigen mergeregels"
".github/workflows/automerge.yml@@  pull_request:\n    types: [labeled]@@@@test-automerge.js@@het label doet niets meer als je het ná de testrun zet"
"automerge-besluit.js@@  if (f.headRepo !== f.eigenRepo) {@@  if (false) {@@test-automerge.js@@een PR uit een fork wordt weer samengevoegd door de bot"
"automerge-besluit.js@@  if (typeof f.achterstand === 'number' && f.achterstand > 0) {@@  if (false) {@@test-automerge.js@@een verlopen groene vlag telt weer: de basis mag opgeschoven zijn"
"automerge-besluit.js@@             melden: true, sleutel: 'geen-klaar' };@@             melden: false, sleutel: 'geen-klaar' };@@test-automerge.js@@een PR zonder label blijft stil liggen in plaats van het te zeggen"
# ── het icoon en de buildtrigger (03-09-2026) ──
# Twee lijsten over hetzelfde, en de koppeling moet van beide kanten kloppen:
# een pad dat uit de trigger valt, én een kandidaat die erbij komt zonder dat
# de trigger meegaat. Allebei leveren een APK met het oude logo op zonder dat
# er iets rood staat.
".github/workflows/build-apk.yml@@     - 'public/icon-512.png'\n@@@@test-icoonpad.js@@het icoon in public/ start weer geen build (de fout zoals hij was)"
".github/workflows/build-apk.yml@@ICON=\$(ls icon-512.png public/icon-512.png icon-1024.png@@ICON=\$(ls icon-512.png public/icon-512.png icon-1024.png public/logo.png@@test-icoonpad.js@@er komt een iconkandidaat bij die geen build start"
# ── de weg van de build naar de telefoon (03-09-2026) ──
# Drie fouten die allemaal een groene buildhistorie naast een oude app
# opleveren, en de derde is de ergste: een branch-build wordt de publieke
# download, dus ongetoetste code als \"de app\".
".github/workflows/build-apk.yml@@zet \"apk/pidlane.apk\"@@zet \"apk/app.apk\"@@test-apkpad.js@@de build schrijft een andere R2-sleutel dan de Worker leest"
".github/workflows/build-apk.yml@@          npx --yes wrangler@4 r2 object get \"\$BUCKET/apk/pidlane.apk\" \\\n            --file=/tmp/terug.apk --remote@@          true@@test-apkpad.js@@de upload wordt niet meer teruggelezen: \"ok\" van het gereedschap telt weer als bewijs"
".github/workflows/build-apk.yml@@        if: github.ref == 'refs/heads/main'\n@@@@test-apkpad.js@@een branch-build mag de publieke APK-download overschrijven"
)

echo
echo "PidLane — tegenproef op de testreeks"
echo "─────────────────────────────────────────"

# Een vuile werkmap zou hier onherstelbaar beschadigd raken: het script zet
# bestanden terug naar hun opgeslagen inhoud, niet naar jouw wijzigingen.
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "${ROOD}  De werkmap heeft niet-vastgelegde wijzigingen.${UIT}"
  echo "  Dit script wijzigt bronbestanden en zet ze daarna terug. Commit of"
  echo "  stash je werk eerst, anders raak je het kwijt."
  echo
  exit 2
fi

gevangen=0; ontsnapt=0; overgeslagen=0
ONTSNAPT_LIJST=""
OVERGESLAGEN_LIJST=""

herstel() { [ -n "$HUIDIG" ] && [ -f "$RESERVE" ] && cp "$RESERVE" "$REPO/$HUIDIG" && rm -f "$RESERVE"; }
trap 'herstel; echo; echo "${GEEL}Afgebroken — bronbestand teruggezet.${UIT}"; exit 130' INT TERM

for regel in "${MUTATIES[@]}"; do
  bestand="${regel%%@@*}";        rest="${regel#*@@}"
  zoek="${rest%%@@*}";            rest="${rest#*@@}"
  vervang="${rest%%@@*}";         rest="${rest#*@@}"
  test="${rest%%@@*}"
  omschrijving="${rest#*@@}"

  doel="$REPO/$bestand"
  if [ ! -f "$doel" ]; then
    echo "${GEEL}  OVERGESLAGEN${UIT}  $bestand bestaat niet"
    OVERGESLAGEN_LIJST="$OVERGESLAGEN_LIJST\n    - $omschrijving ($bestand bestaat niet)"
    overgeslagen=$((overgeslagen+1)); continue
  fi
  if [ ! -f "$PUB/$test" ]; then
    echo "${GEEL}  OVERGESLAGEN${UIT}  $test bestaat niet"
    OVERGESLAGEN_LIJST="$OVERGESLAGEN_LIJST\n    - $omschrijving ($test bestaat niet)"
    overgeslagen=$((overgeslagen+1)); continue
  fi

  HUIDIG="$bestand"; RESERVE="$(mktemp)"
  cp "$doel" "$RESERVE"

  # Vervangen met python: de zoektekst bevat regex-tekens en aanhalingstekens
  # die sed zouden laten struikelen. count=1 dwingt af dat het anker uniek
  # genoeg is; is het dat niet, dan moet de tabel scherper.
  raak=$(ZOEK="$zoek" VERVANG="$vervang" python3 - "$doel" <<'PY'
import os, sys
pad = sys.argv[1]
# \n in de tabel is een echte nieuwe regel: zo blijft elke mutatie op
# één tabelregel staan, ook als het anker meerdere regels moet omvatten
# om uniek te zijn.
zoek = os.environ['ZOEK'].replace('\\n', '\n')
vervang = os.environ['VERVANG'].replace('\\n', '\n')
bron = open(pad, encoding='utf8').read()
n = bron.count(zoek)
if n != 1:
    print(n); sys.exit(0)
open(pad, 'w', encoding='utf8').write(bron.replace(zoek, vervang, 1))
print(1)
PY
)

  if [ "$raak" != "1" ]; then
    herstel
    echo "${GEEL}  OVERGESLAGEN${UIT}  $omschrijving"
    echo "                ${GRIJS}anker $raak× gevonden in $bestand (moet 1× zijn)${UIT}"
    OVERGESLAGEN_LIJST="$OVERGESLAGEN_LIJST\n    - $omschrijving (anker $raak× in $bestand)"
    overgeslagen=$((overgeslagen+1)); continue
  fi

  ( cd "$PUB" && node "$test" >/dev/null 2>&1 )
  uitkomst=$?
  herstel

  if [ $uitkomst -ne 0 ]; then
    echo "${GROEN}  gevangen${UIT}      $omschrijving"
    echo "                ${GRIJS}$test werd rood${UIT}"
    gevangen=$((gevangen+1))
  else
    echo "${ROOD}  ONTSNAPT${UIT}      $omschrijving"
    echo "                ${GRIJS}$test bleef groen — die test dekt dit niet${UIT}"
    ontsnapt=$((ontsnapt+1))
    ONTSNAPT_LIJST="$ONTSNAPT_LIJST\n    - $omschrijving ($test)"
  fi
done
trap - INT TERM

echo "─────────────────────────────────────────"
echo "$gevangen gevangen, $ontsnapt ontsnapt, $overgeslagen overgeslagen"

# Laatste zekerheid: de werkmap moet weer zijn zoals hij was.
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "${ROOD}  LET OP: de werkmap is niet schoon achtergelaten.${UIT}"
  git -C "$REPO" status --short
  exit 2
fi

# Een overgeslagen mutatie is precies het stille falen waar dit script tegen
# bestaat: het anker past niet meer, dus die fout wordt niet meer nagebouwd, en
# de regel eronder meldt vrolijk "gevangen" over alles wat er nog wél in stond.
# Vandaar exit 1 en niet een gele regel. Repareer het anker (een \n erbij maakt
# hem langer en dus unieker) of haal de mutatie weg met de reden erbij.
if [ $overgeslagen -gt 0 ]; then
  echo
  echo "${ROOD}Er is een mutatie niet uitgevoerd:${UIT}"
  printf "$OVERGESLAGEN_LIJST\n"
  echo
  echo "Een mutatie die niet meer past bouwt niets na. Zolang dit zo staat"
  echo "zegt \"alles gevangen\" minder dan het lijkt."
  echo
  exit 1
fi

if [ $ontsnapt -gt 0 ]; then
  echo
  echo "${ROOD}Er is een nagebouwde fout doorheen gekomen:${UIT}"
  printf "$ONTSNAPT_LIJST\n"
  echo
  echo "Dat is geen reden om de mutatie te schrappen. De test die groen bleef"
  echo "dekt minder dan zijn naam belooft — daar hoort een controle bij."
  echo
  exit 1
fi

echo "${GROEN}Elke nagebouwde fout is gevangen.${UIT}"
echo
exit 0
