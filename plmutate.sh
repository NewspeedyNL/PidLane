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

# ── Laag 2+3 zijn op 10-09-2026 weggehaald (zie §11). Deze twee mutaties
# bouwen precies terug wat er weg is: de middeling over twee monsters, en het
# tegenhouden van een sprong op een traag signaal. Ze staan hier omdat het
# geen verzonnen fouten zijn — die code stond er tot vandaag, en een
# "voorzichtige" hand zet zoiets zo weer terug.
"public/pidlane-datalog.js@@  return Math.round(rawVal*100)/100;\n}@@  if(FILTERED_PIDS.has(pid)){ pidSmooth[pid]=(pidSmooth[pid]||[]).concat(rawVal).slice(-2); return Math.round(pidSmooth[pid].reduce((a,b)=>a+b,0)/pidSmooth[pid].length*100)/100; }\n  return Math.round(rawVal*100)/100;\n}@@test-parser.js@@de middeling van laag 3 is terug: de app slaat weer een waarde op die de sensor niet kan geven"
"public/pidlane-datalog.js@@  return Math.round(rawVal*100)/100;\n}@@  if(FILTERED_PIDS.has(pid)&&pidVals[pid]!=null&&Math.abs(rawVal-pidVals[pid])/Math.max(1e-6,(def?.max??255)-(def?.min??0))*100>35) return null;\n  return Math.round(rawVal*100)/100;\n}@@test-parser.js@@het spike-filter van laag 2 is terug: een echte sprong wordt weer als NO DATA geboekt"
"public/pidlane-waakronde.js@@if (/NO DATA|ERROR|UNABLE|STOPPED|SEARCHING|\?/i.test(s)) return false;@@if (false) return false;@@test-waakronde.js@@de waakronde leest een foutmelding als een antwoord"
"public/pidlane-waakronde.js@@const marge = (d.max - d.min) * 0.02;@@const marge = 0;@@test-waakronde.js@@de 2%-marge op het verwachte bereik is weg"
"public/pidlane-rijsituatie.js@@_pidHealth[pid] = (h==='ok'||h==='twijfel'||h==='onzin'||h==='nodata') ? h : 'ok';@@_pidHealth[pid] = h;@@test-healthgate.js@@een onbekende sensor wordt uitgegrijsd in plaats van kiesbaar"
"public/pidlane-rijsituatie.js@@if(ok===0 && geen<pids.length){@@if(false){@@test-healthgate.js@@de veiligheidsfallback van de gezondheidscheck staat uit"

# ── De twee vensters bij de achtergrondgereedschappen. Zes fouten die je in
# een scherm maakt zonder dat iemand het ziet: een balkje staat altijd ergens,
# een grafiek ziet er altijd uit als een grafiek, en een zin met een getal
# erin leest als een meting. De VIN-mutatie staat er apart bij — dat is geen
# weergavefout maar een privacylek, en de enige regel hier die niet buigt.
"public/pidlane-waakvenster.js@@    var pos = Math.max(0, Math.min(1, frac)) * 100;@@    var pos = frac * 100;@@test-waakvenster.js@@de bereikmeter klemt niet meer: de marker schuift buiten zijn baan"
"public/pidlane-waakvenster.js@@    var frac = (v - d.min) / (d.max - d.min);@@    var frac = v / d.max;@@test-waakvenster.js@@de bereikmeter negeert de ondergrens en schaalt alles op max"
"public/pidlane-waakvenster.js@@        veh = { merk: vehicleInfo.merk || '', model: vehicleInfo.model || '',@@        veh = { vin: vehicleInfo.vin || '', merk: vehicleInfo.merk || '', model: vehicleInfo.model || '',@@test-waakvenster.js@@de VIN lekt ruw mee in de waakronde-export"
"public/pidlane-bulkvenster.js@@      var lo = blok[0], hi = blok[0];@@      var lo = blok[0], hi = blok[0]; if (1) { uit.push(blok[0]); continue; }@@test-bulkvenster.js@@het uitdunnen pakt elke n-de meting en eet de koelwaterpiek op"
"public/pidlane-bulkvenster.js@@      } else gatLoop = 0;@@      } else { }@@test-bulkvenster.js@@het langste gat wordt nooit teruggezet en telt de hele rit door"
"public/pidlane-bulkvenster.js@@  var MIN_KLIMREGELS = 50;@@  var MIN_KLIMREGELS = 0;@@test-bulkvenster.js@@de klimvergelijking meldt een verschil uit een handvol regels"

# ── De bestandsnaam (#207). Vier fouten die je maakt in code die een mens laat
# typen: de verbodenlijst vergeten, de terugval vergeten, de extensie dubbel
# laten staan, en de lengte niet afkappen. Alle vier leveren een bestand op dat
# niet opent of niet terug te vinden is, en geen van vier geeft een foutmelding.
"public/pidlane-export.js@@  if (!/[a-z0-9]/i.test(t)) return terugval;@@  if (false) return terugval;@@test-export.js@@een leeggetypte bestandsnaam levert een bestand zonder naam op"
"public/pidlane-export.js@@  t = t.slice(0, 80).replace(/[. ]+$/, '').trim();@@  t = t.trim();@@test-export.js@@een geplakte alinea wordt een bestandsnaam van vierhonderd tekens"
"public/pidlane-export.js@@  t = t.replace(/\.(txt|pdf)$/i, '');@@  t = t;@@test-export.js@@een zelf getypte extensie blijft staan en het bestand heet rapport.txt.txt"
"public/pidlane-export.js@@  t = t.replace(/^\.+/, '');@@  t = t;@@test-export.js@@een naam die met een punt begint blijft een verborgen bestand"

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
"public/pidlane-kaart.js@@          for (var di = 0; di < tredeDids.length && !_stop; di++) {@@          for (var di = 0; di < tredeDids.length; di++) {@@test-kaart.js@@de stopknop doet niets meer tijdens de DID-sweep"
"public/pidlane-bt.js@@  if(window._plScanActief) return;@@  if(false) return;@@test-elmpoort.js@@een scan telt zijn eigen lege antwoorden weer als een dode socket"
"public/pidlane-data.js@@    S.since=nu();\n    return true;@@    return true;@@test-busslot.js@@raak() vernieuwt niets: lang werk wordt weer als vastgelopen afgebroken"

# ── Wat de rit van 04-09-2026 op de CX-5 blootlegde. Achttien
# stuurapparaten, afgebroken na 171 s bij 193 van de 2944 identifiers op de
# eerste module — en het verslag zei van de zeventien andere "geen enkele
# identifier bestaat hier". Deze drie houden die lessen vast.
"public/pidlane-kaart.js@@      for (var ti = 0; ti < trap.length && !_stop; ti++) {@@      for (var ti = trap.length - 1; ti >= 0 && !_stop; ti--) {@@test-kaart.js@@de trap loopt achterstevoren: het speculatiefste blok gaat voor de identificatie"
"public/pidlane-kaart.js@@          m2.trede[trede.naam] = (gedaan >= tredeDids.length) ? 'volledig'@@          m2.trede[trede.naam] = 'volledig' || (gedaan >= tredeDids.length) ? 'volledig'@@test-kaart.js@@een afgebroken trede meldt zich als volledig afgezocht"
"public/pidlane-kaart.js@@        if (!antw.trim() || /\\?/.test(antw)) mislukt.push(@@        if (false) mislukt.push(@@test-kaart.js@@een geweigerd herstelcommando telt weer als geslaagd"
"public/pidlane-kaart.js@@            if (d.soort === 'geweigerd' && d.nrc === '78') {@@            if (false) {@@test-kaart.js@@\"antwoord volgt later\" wordt weer als weigering weggegooid"

# ── De ronde na de tweede rit (04-09, 13:43). De VIN stond vier keer rauw
# in het testrunlogboek — het derde VIN-pad uit §11, opnieuw geopend. En
# "waarvan 0 bewegend" stond er achttien keer terwijl de tweede pas nooit
# liep: niet-gemeten als gemeten, één laag hoger dan de vorige keer.
"public/pidlane-kaart.js@@    if (!tekst) return { bytes: hex, len: bytes.length };@@    if (true) return { bytes: hex, len: bytes.length };@@test-kaart.js@@de VIN-poort laat alles door: de ruwe VIN komt weer in de kaart"
"public/pidlane-kaart.js@@    return { bytes: null, len: bytes.length, vin: true, vinStaart: k.staart, vinId: k.id };@@    return { bytes: hex, len: bytes.length, vin: true, vinStaart: k.staart, vinId: k.id };@@test-kaart.js@@de VIN wordt gemaskeerd getoond maar tóch bewaard"
"public/pidlane-kaart.js@@          var herlezen = m.dids.filter(function (d) { return d.bytes2 != null; });@@          var herlezen = m.dids;@@test-kaart.js@@een niet-gedraaide tweede pas meldt zich als 0 bewegend"
"public/pidlane-kaart.js@@        if (keuze && keuze.indexOf(m.rx) < 0) { m.didOvergeslagen = 'niet gevraagd@@        if (false) { m.didOvergeslagen = 'niet gevraagd@@test-kaart.js@@een gerichte scan loopt alsnog alle stuurapparaten af"
"public/pidlane-kmcheck.js@@    if (sleutels.length > 1) {@@    if (false) {@@test-kmcheck.js@@twee verschillende voertuignummers in één auto leveren geen bevinding op"
"public/pidlane-kmcheck.js@@      if (uit.niveau === 'ok' || uit.niveau === 'onbevestigd') uit.niveau = 'let-op';@@      if (false) uit.niveau = 'let-op';@@test-kmcheck.js@@een blanco voertuignummer verdwijnt uit het oordeel"
"public/pidlane-kmcheck.js@@  var VIN_TEKENS = /^[A-HJ-NPR-Z0-9]{17}$/;@@  var VIN_TEKENS = /^[A-Z0-9]{17}$/;@@test-kmcheck.js@@de VIN-herkenning accepteert een O en een I, die in geen enkele VIN voorkomen"
"public/pidlane-rijsituatie.js@@if(q.status==='ok'){ ok++; updPID(pid,val); } else onzin++;@@updPID(pid,val);\n      if(q.status==='ok') ok++; else onzin++;@@test-healthherziening.js@@de gezondheidscheck stempelt de versheidsbron vóór het oordeel"
"public/pidlane-testrun.js@@    id: 'achtergrond',@@    id: 'achtergrondproef',@@test-begeleid.js@@een stap van de begeleide rit is hernoemd zonder de volgorderegel mee te nemen"
"public/pidlane-testrun.js@@const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C', '0155', '0156'];@@const RIT_PIDS = ['010D', '010B', '0133', '0123', '0159', '0104', '010C'];@@test-begeleid.js@@0155 en 0156 zijn weer uit de meet-PIDs verdwenen (#40 blijft dan onmeetbaar)"
"public/pidlane-achtergrond.js@@if (tot - van < DREMPEL_MELDEN) return null;@@if (false) return null;@@test-achtergrond.js@@elke vensterwissel wordt als bevriezing geboekt"
"public/pidlane-data.js@@if(this._iemandWacht(naam)) return 0;@@@@test-busslot.js@@de pollus dringt weer voor: een wachter op het busslot verhongert"
"public/pidlane-data.js@@S.wacht=S.wacht.filter(w=>t-w.sinds < this.WACHT_MAX_MS);@@@@test-busslot.js@@een wachter die zijn beurt niet pakt gijzelt de bus voor altijd"
"public/pidlane-achtergrond.js@@sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond')@@sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond', true)@@test-achtergrond.js@@de socketcontrole sloopt een gezonde verbinding in plaats van hem na te kijken"
# ── #18, de hartslag (08-09-2026). De reparatie van deze ronde is dat "weg" en
#    "stil" twee getallen zijn. Elke mutatie hieronder gooit dat onderscheid op
#    één van de manieren om waarop het werkelijk fout ging of kon gaan.
"public/pidlane-achtergrond.js@@      p.stil = Math.round(stilMs / 1000);@@      p.stil = Math.round((tot - van) / 1000);@@test-achtergrond.js@@de melding boekt de afwezigheid weer als stilte, precies de fout van 02-09"
"public/pidlane-achtergrond.js@@              door: null, stil: null, na: null,@@              door: 0, stil: 0, na: 0,@@test-achtergrond.js@@een niet-gemeten stilte leest als nul, dus als \"er was niets aan de hand\""
"public/pidlane-achtergrond.js@@    if (staart >= _stilMs) return { ms: staart, van: _laatste };@@    if (false) return { ms: staart, van: _laatste };@@test-achtergrond.js@@de staart telt niet mee: een bevriezing die tot het eind duurt wordt nul"
"public/pidlane-achtergrond.js@@    try { if (_timer !== null && typeof clearInterval === 'function') clearInterval(_timer); }@@    try { if (false) clearInterval(_timer); }@@test-achtergrond.js@@de hartslag blijft doorlopen als de app weer in beeld is"
"public/pidlane-testrun.js@@PLAchtergrond.stilsteS(m.ms - 2000) : null;@@PLAchtergrond.totaalS(m.ms - 2000) : null;@@test-achtergrondproef.js@@blok 5 vergelijkt het gat weer met de afwezigheid in plaats van met de stilte"
"public/pidlane-testrun.js@@return typeof x.na === 'number' && x.na >= 3; });@@return typeof x.na === 'number' && x.na >= 99999; });@@test-achtergrondproef.js@@afknijpen wordt niet meer herkend en gaat als bevriezing het verslag in"

# ── #18, de native meetdienst (11-09-2026). De dienst is tegelijk de
#    kandidaat-oplossing en het meetinstrument dat moet zeggen of hij werkt.
#    Elke mutatie hieronder laat hem er nog steeds uitzien alsof hij meet,
#    terwijl er iets anders gemeten wordt of niets. Dat is de vorm die hier
#    telt: #18 ging anderhalve week fout omdat een getal ergens anders over
#    ging dan de melding beweerde.
"public/pidlane-meetdienst.js@@    if (staart >= r.stilMs) return { ms: staart, van: r.laatste };@@    if (false) return { ms: staart, van: r.laatste };@@test-meetdienst.js@@de staart telt niet mee: een proces dat bevroren blijft tot het eind meet nul"
"public/pidlane-meetdienst.js@@    var leeg = { gemeten: false, reden: null, door: null, stil: null, na: null, slagen: null, hartslagMs: null };@@    var leeg = { gemeten: false, reden: null, door: 0, stil: 0, na: 0, slagen: 0, hartslagMs: null };@@test-meetdienst.js@@een niet-gemeten native periode leest als nul, dus als \"er was niets aan de hand\""
"public/pidlane-meetdienst.js@@    return nodig() ? start() : stop();@@    return start();@@test-meetdienst.js@@de meetdienst blijft draaien zonder verbinding, ook in demo"
"public/pidlane-meetdienst.js@@        _laatsteReden = r.reden || null;@@        _laatsteReden = null;@@test-meetdienst.js@@een geweigerde foreground service valt stil weg zonder reden"
"public/pidlane-meetdienst.js@@    var stilMs = st.ms >= SLAGEN_MINIMAAL * hb ? st.ms : 0;@@    var stilMs = st.ms;@@test-meetdienst.js@@de gewone speling van een timer wordt als bevriezing geboekt"
"public/pidlane-achtergrond.js@@      if (window.PLMeetdienst && typeof PLMeetdienst.nulstel === 'function') PLMeetdienst.nulstel();@@      if (false) PLMeetdienst.nulstel();@@test-achtergrond.js@@de native teller wordt niet op nul gezet en meet over een vreemd venster"
"public/pidlane-achtergrond.js@@              native: null };@@              native: { gemeten: true, door: 0, stil: 0, na: 0 } };@@test-achtergrond.js@@een periode zonder native meting doet alsof er wel een is"
"native/PLMeetdienst.java@@public static final long HARTSLAG_MS = 1000L;@@public static final long HARTSLAG_MS = 5000L;@@test-nativeschil.js@@de twee hartslagen tikken verschillend, dus het aantal slagen is niet meer te vergelijken"
"native/PLMeetdienst.java@@                startForeground(MELDING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);@@                startForeground(MELDING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);@@test-nativeschil.js@@het servicetype in de code past niet meer bij het manifest: SecurityException bij het verbinden"
"native/PLMeetdienst.java@@            Log.w(TAG, \"hartslagdraad niet netjes gestopt (#18)\", e);@@            /* stil */@@test-nativeschil.js@@een catch in de service zwijgt, en in een foreground service is dat onzichtbaar"
"native/PLMeetdienstPlugin.java@@    name = \"PLMeetdienst\",@@    name = \"PLMeting\",@@test-nativeschil.js@@de plugin heet anders dan wat de app opzoekt: Capacitor.Plugins.PLMeetdienst bestaat niet"
"native/PLMeetdienstPlugin.java@@    public void rapport(PluginCall call) {@@    public void verslag(PluginCall call) {@@test-nativeschil.js@@de app roept een methode aan die niet meer bestaat en krijgt een belofte die niets doet"
".github/workflows/build-apk.yml@@     - 'native/**'@@     - 'native-uit/**'@@test-nativeschil.js@@een wijziging aan de native meetdienst start geen build meer"
".github/workflows/build-apk.yml@@              print(\"FOUT: de meetdienst staat niet in de bundel — dan bevriest de app nog steeds (#18)\")@@              print(\"let op: geen meetdienst gevonden\")@@test-nativeschil.js@@de bundelpoort laat een .aab zonder meetdienst door"
"public/index.html@@<script src=\"pidlane-meetdienst.js\"></script>@@@@test-nativeschil.js@@de module hangt niet meer in index.html en de dienst start dus nooit"
"native/PLMeetdienst.java@@        stopSelf();\n        super.onTaskRemoved(rootIntent);@@        super.onTaskRemoved(rootIntent);@@test-nativeschil.js@@de melding blijft staan nadat de app uit het overzicht is geveegd"
"public/pidlane-meetdienst.js@@    if (!_meldingGevraagd) {@@    if (true) {@@test-meetdienst.js@@de meldingpermissie wordt bij elke herverbinding opnieuw gevraagd, dus tijdens het rijden"

# ── #18, de wake lock en de duiding (11-09-2026). Allebei gemeten werk: de
#    hartslag haperde bij een afwezigheid van acht minuten, en de melding
#    daarover beweerde meer dan hij gemeten had.
"native/PLMeetdienst.java@@        wakeAan();\n        synchronized (SLOT) { sDraait = true; }@@        synchronized (SLOT) { sDraait = true; }@@test-nativeschil.js@@de wake lock wordt niet meer geclaimd: de hartslag hapert zodra het toestel slaapt"
"native/PLMeetdienst.java@@            wakeLock.setReferenceCounted(false);\n            wakeLock.acquire();@@            wakeLock.setReferenceCounted(false);\n            wakeLock.acquire(60000L);@@test-nativeschil.js@@de lock krijgt een tijdslimiet en stopt midden in een rit stilletjes met beschermen"
".github/workflows/build-apk.yml@@<uses-permission android:name=\"android.permission.WAKE_LOCK\" />@@<uses-permission android:name=\"android.permission.NIETS\" />@@test-nativeschil.js@@de WAKE_LOCK-permissie valt uit het manifest: acquire() gooit een SecurityException"
"public/pidlane-meetdienst.js@@      venster: Math.round((r.nu - r.van) / 1000),@@      venster: 0,@@test-meetdienst.js@@het meetvenster is weg, dus de duiding kan geen verhouding meer noemen"
"public/pidlane-meetdienst.js@@      if (!venster || nat.stil * 2 >= venster)@@      if (true)@@test-meetdienst.js@@elke hapering heet weer een bevriezing, de fout van 11-09 terug"
"public/pidlane-meetdienst.js@@      if (!venster || nat.stil * 2 >= venster)@@      if (false)@@test-meetdienst.js@@een proces dat wél het grootste deel stillag wordt weggeschreven als hapering"

# ── #18, welke schil draait dit (11-09-2026). Twee keer op een dag was de
#    vraag of een meting op de nieuwe of de oude APK draaide, en het verslag
#    gaf geen antwoord. Elke mutatie hieronder maakt dat antwoord weer stil
#    onbetrouwbaar in plaats van afwezig -- dat is de gevaarlijke vorm.
"public/pidlane-schil.js@@    return isFinite(b) ? b : null;@@    return isFinite(b) ? b : 0;@@test-schil.js@@een onleesbare build leest als 0 in plaats van als onbekend"
"public/pidlane-schil.js@@    if (hier === null || !isFinite(daar)) return null;@@    if (false) return null;@@test-schil.js@@de achterstand wordt berekend zonder dat er twee getallen zijn"
"public/pidlane-schil.js@@    if (_nieuwste && !opnieuw) return Promise.resolve(_nieuwste);@@    if (false) return Promise.resolve(_nieuwste);@@test-schil.js@@elke vraag naar de nieuwste build doet een eigen netwerkaanroep"
"public/pidlane-schil.js@@        if (!r || !r.ok) {@@        if (!r) {@@test-schil.js@@een 404 van de Worker gaat door als geldig antwoord"
"public/pidlane-schil.js@@    return window.plFetch('/version.json', { geenToken: true })@@    return window.plFetch('/version.json')@@test-schil.js@@de versiecheck stuurt het sessietoken mee waar dat niet hoort"
"public/pidlane-testrun.js@@      if (achter > 0)@@      if (false)@@test-schilproef.js@@een achterlopende schil levert geen waarschuwing meer op"
"public/pidlane-testrun.js@@      if (achter < 0)@@      if (false)@@test-schilproef.js@@een zelf gebouwde schil die voorloopt wordt niet meer gemeld"

# ── #191, het scanslot (11-09-2026). Gemeld uit het gebruik: diep zoeken gaf
#    een dip met valse waarschuwingen. De reparatie zet twee bewakers stil, en
#    dat mag alleen mét vangnet. Elke mutatie hieronder haalt een van de twee
#    helften weg -- de vlag die de dip wegneemt, of het vangnet dat hem
#    vervangt. De tweede soort is de stilste en daarom de belangrijkste.
"public/pidlane-scanslot.js@@    window._plScanActief = true;@@    window._plScanActief = alAan;@@test-scanslot.js@@de scanvlag gaat niet meer aan: de dip met valse waarschuwingen is terug"
"public/pidlane-scanslot.js@@      if (!alAan) window._plScanActief = false;@@      if (false) window._plScanActief = false;@@test-scanslot.js@@de scanvlag blijft na afloop aan en de bewakers zijn voorgoed doof"
"public/pidlane-scanslot.js@@    var alAan = !!window._plScanActief;@@    var alAan = false;@@test-scanslot.js@@een geneste scan zet het vangnet van de lopende scan terug"
"public/pidlane-scanslot.js@@        if (!levend) throw new Error('verbinding weg: ATI gaf twee keer niets terug');@@        if (false) throw new Error('x');@@test-scanslot.js@@de scan ploetert stilletjes door op een dode socket"
"public/pidlane-scanslot.js@@      if (!String(r || '').trim()) leegReeks++; else leegReeks = 0;@@      leegReeks = 0;@@test-scanslot.js@@lege antwoorden tellen niet meer, dus de hartslag komt er nooit aan te pas"
"public/pidlane-scanslot.js@@      try { if (raakTimer !== null) clearInterval(raakTimer); }@@      try { if (false) clearInterval(raakTimer); }@@test-scanslot.js@@de raak-timer blijft lopen en tikt een slot aan dat al vergeven is"
"public/pidlane-scanslot.js@@      try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); }@@      try { if (false) PLBus.release(tok); }@@test-scanslot.js@@het busslot wordt nooit teruggegeven: elke houder valt buiten de noodrem"
"public/pidlane-rijsituatie.js@@      await PLScanSlot.doe('diep zoeken', {}, sweep);@@      await sweep(async (pid,t)=>await sendCmd(pid,t));@@test-diepzoeken.js@@diep zoeken gaat weer buiten het scanslot om (de fout zoals hij gemeld is)"
"public/pidlane-testrun.js@@  var kent = !!perioden;@@  var kent = true;@@test-gatduiding.js@@zonder PLAchtergrond wordt \"niet te zeggen\" toch een uitspraak over #18"
"public/pidlane-testrun.js@@  var SPELING = 12000;@@  var SPELING = 0;@@test-gatduiding.js@@de speling tussen de twee tijdassen is weg, dus bijna elk gat valt buiten"
"public/pidlane-testrun.js@@if (q && q !== '\\u2014' && uit.indexOf(q) === -1) uit.push(q);@@uit.push(q);@@test-blok5lijst.js@@de dekking van blok 5 ontdubbelt niet meer en laat de streep staan"
"public/pidlane-testrun.js@@    issue: '#29',@@    issue: '',@@test-blok5lijst.js@@een proef in blok 5 is zijn issue kwijt en valt daarmee uit de dekking"
"public/pidlane-testrun.js@@'BLOK 5 DEKT DEZE RONDE: ' + _dekkingB5().join(', ')@@'BLOK 5 DEKT DEZE RONDE: #19, #15'@@test-blok5lijst.js@@de dekkingsregel in CAMPAGNE is weer met de hand overgeschreven"
"public/pidlane-uitgebreid.js@@schoon.indexOf(hdr) >= 0;@@true;@@test-mode21.js@@de uitgebreide probe accepteert elk antwoord"
"public/pidlane-uihelpers.js@@'T' + _plTweeCijfers(d.getHours())@@'T' + _plTweeCijfers(d.getUTCHours())@@test-tijdklok.js@@de stempel valt terug op het UTC-uur (#17)"
"public/pidlane-privacy.js@@    if (klant)@@    if (true)@@test-account-verwijderen.js@@personeel wordt weer naar een knop gestuurd die het niet heeft (#69)"
"public/pidlane-uihelpers.js@@'-' + String(d.getMilliseconds()).padStart(3,'0');@@'-' + String(d.getMilliseconds());@@test-tijdklok.js@@milliseconden verliezen hun voorloopnullen en sorteren verkeerd (#17)"
"public/pidlane-uihelpers.js@@function plDatumLokaal(ms){\n  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);\n  return d.getFullYear() + '-' + _plTweeCijfers(d.getMonth()+1) + '-' + _plTweeCijfers(d.getDate());@@function plDatumLokaal(ms){\n  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);\n  return d.toISOString().slice(0,10);@@test-tijdklok.js@@de exportdatum staat weer op de UTC-dag (#17)"
# ── de ronde van 08-09-2026 (#112, #140) ──
"public/pidlane-veldlab.js@@      a.download='pidlane-survey-'+plDatumLokaal(t0)+'.json';@@      a.download='pidlane-survey-'+new Date(t0).toISOString().slice(0,10)+'.json';@@test-tijdklok.js@@een exportnaam bouwt zichzelf weer op de UTC-klok (#112)"
"public/pidlane-logboek.js@@    met.sort(function (a, b) { return a.ms - b.ms; });@@    met.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });@@test-logboeksort.js@@het logboek sorteert weer op de kloktijd en keert de nacht om (#140)"
"public/pidlane-logboek.js@@      if (vorige !== null && sec > vorige) dagen++;  // klok liep terugkijkend vooruit@@      if (false) dagen++;@@test-logboeksort.js@@een bron zonder epoch verliest de dagsprong weer (#140)"
# ── de veiligemarge-ronde van 08-09-2026 (#134, #135) ──
"public/pidlane.css@@.ai-sheet-b:last-child { padding-bottom:calc(14px + var(--pl-sab)); }@@.ai-sheet-b:last-child { padding-bottom:14px; }@@test-schermranden.js@@een vel zonder voettekst verliest zijn marge onder de knoppenbalk (#134)"
"public/pidlane.css@@#welcomeScreen .welcome-scroll { padding-bottom:calc(24px + var(--pl-sab)); }@@#welcomeScreen .welcome-scroll { padding-bottom:24px; }@@test-schermranden.js@@de onderste kaart van het keuzescherm valt weer achter de knoppenbalk (#135)"
"public/pidlane-logboek.js@@        t: r.t || '',\n        ms: (typeof r.ms === 'number' ? r.ms : null),\n        bron: 'PID',@@        t: r.ts || r.tijd || '',\n        ms: (typeof r.ms === 'number' ? r.ms : null),\n        bron: 'PID',@@test-logboeksort.js@@de PID-regels lezen weer een veldnaam die de diagring niet heeft"
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
"admin/beheer.html@@  if(code === 'saldo_bezet')@@  if(code === 'saldo_bezet_oud')@@test-bijboeken.js@@beheer.html kent de code voor een bezet saldo-slot niet meer"

# ── saldo ZETTEN door hetzelfde slot (03-09-2026, #93) ──
"worker.js@@          if (saldoWas !== null && huidig !== saldoWas)@@          if (saldoWas !== null && huidig === saldoWas)@@test-bijboeken.js@@de voorwaarde bij saldo zetten staat omgekeerd: een verschoven saldo wordt juist overschreven"
"worker.js@@          const z1 = await fetch(zetUrl, { headers: hdr });\n          if (!z1.ok) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const z1 = z0;\n          const huidig@@test-bijboeken.js@@saldo zetten vergelijkt met de lezing van vóór het slot in plaats van een verse"
"admin/beheer.html@@saldo:n, saldoWas:huidig }@@saldo:n }@@test-bijboeken.js@@de knop stuurt de voorwaarde niet mee, dus de Worker vergelijkt niets"
"admin/beheer.html@@  if(code === 'saldo_verschoven')@@  if(code === 'saldo_verschoven_oud')@@test-bijboeken.js@@beheer.html kent de code voor een verschoven saldo niet"
"admin/beheer.html@@  const code = (body && (body.code || body.error)) || '';@@  const code = (body && body.error) || '';@@test-bijboeken.js@@beheer.html leest de foutcode uit de leesbare tekst: de afhandeling staat er, maar wordt nooit bereikt"

# ── het kasboek TokenLog (08-09-2026, #83) ──
# Acht fouten die je bij een kasboek écht maakt. De eerste drie gaan over
# rékenen: wie -kosten boekt in plaats van wat er werkelijk af ging, krijgt een
# kolom die niet meer optelt tegen SaldoNa — en dat merk je pas als je hem
# nodig hebt. De vierde is de belangrijkste: een kasboek dat de call meesleurt
# als Airtable hapert, is erger dan geen kasboek, want dan kost de administratie
# de klant zijn analyse. De laatste twee bewaken de leeskant: een boek dat je
# vanaf de beheerpagina kunt bijstellen bewijst alleen nog wat erin staat.
"worker.js@@credits: -afgeboekt, saldoNa, details: \"analyse afgeboekt\" + tekort@@credits: -kosten, saldoNa, details: \"analyse afgeboekt\" + tekort@@test-kasboek.js@@het kasboek boekt de volle prijs terwijl er minder van het saldo af ging (#83)"
"worker.js@@credits: 0, saldoNa: saldoVoor,@@credits: -kosten, saldoNa: saldoVoor,@@test-kasboek.js@@een mislukte afboeking wordt geboekt alsof hij gelukt is (#83)"
"worker.js@@if (na !== null) velden.SaldoNa = na;@@velden.SaldoNa = na || 0;@@test-kasboek.js@@een onbekend saldo komt als 0 in het kasboek en leest later als een leeg account (#83)"
"worker.js@@    } catch (e) {\n      try {\n        console.error(\"[kasboek] regel niet weggeschreven :: \" + String(e && e.message || e));\n      } catch (_) { /* stil: melden mag de stroom nooit breken */ }\n    }\n  })();@@    } catch (e) {\n      throw e;\n    }\n  })();@@test-kasboek.js@@een kapot kasboek sleurt de analyse mee: administratie kost de klant zijn antwoord (#83)"
"worker.js@@if (uit && uit.kasboek) await tegoedLog(env, ctx, uit.kasboek);@@@@test-kasboek.js@@de AI-afboeking laat geen spoor meer na — precies de toestand van vóór #83"
"worker.js@@if (res && res.body && res.body.ok && Number(res.body.toegekend) > 0)@@if (res && res.body && res.body.ok && Number(res.body.toegekend) >= 0)@@test-kasboek.js@@elke tweede onboarding schrijft een lege regel van 0 credits (#83)"
"worker.js@@Regels komen uitsluitend uit tegoedLog().\n    schrijven: false,@@Regels komen uitsluitend uit tegoedLog().\n    schrijven: true,@@test-adminbron.js@@het kasboek is vanaf de beheerpagina te bewerken (#83)"
"worker.js@@tableKey: \"AIRTABLE_TOKENLOG_TABLE\", sorteer: \"Moment\",@@tableKey: \"AIRTABLE_KLANTEN_TABLE\", sorteer: \"Moment\",@@test-adminbron.js@@de kasboekbron leest de Klanten-tabel; \"leeg\" ziet er hetzelfde uit als \"niets gebeurd\" (#83)"
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
"automerge-besluit.js@@  return (labels || []).some(l => String(l).trim().toLowerCase() === gezocht);@@  return (labels || []).indexOf(naam) >= 0;@@test-automerge.js@@labels weer hoofdlettergevoelig: \`Klaar\` doet niets meer"
"automerge-besluit.js@@  if (f.testsGroen !== true) {@@  if (false) {@@test-automerge.js@@via de labelroute wordt er samengevoegd zonder dat de testgate groen staat"
".github/workflows/automerge.yml@@        with:\n          ref: \${{ github.event.repository.default_branch }}@@@@test-automerge.js@@de checkout pakt bij een label-event de PR-head: een PR schrijft zijn eigen mergeregels"
".github/workflows/automerge.yml@@  pull_request:\n    types: [labeled]@@@@test-automerge.js@@het label doet niets meer als je het ná de testrun zet"
"automerge-besluit.js@@  if (f.headRepo !== f.eigenRepo) {@@  if (false) {@@test-automerge.js@@een PR uit een fork wordt weer samengevoegd door de bot"
"automerge-besluit.js@@  if (typeof f.achterstand === 'number' && f.achterstand > 0) {@@  if (false) {@@test-automerge.js@@een verlopen groene vlag telt weer: de basis mag opgeschoven zijn"
"automerge-besluit.js@@             melden: true, sleutel: 'geen-klaar' };@@             melden: false, sleutel: 'geen-klaar' };@@test-automerge.js@@een PR zonder label blijft stil liggen in plaats van het te zeggen"
# ── welke testrun de poort mag beantwoorden (17-09-2026) ──
# Deze vier bouwen na wat er die middag écht misging: PR #235 ging om 17:26:49
# via de labelroute mee terwijl zijn PR-run rood stond, omdat de groene
# push-run op dezelfde commit meetelde. De eerste is die fout zelf; de laatste
# zet het oordeel terug in de YAML, waar het niet te toetsen is.
"automerge-besluit.js@@    r && r.event === 'pull_request' && r.status === 'completed');@@    r && r.status === 'completed');@@test-automerge.js@@de push-run telt weer mee: een groene tak overstemt een rode PR-run"
"automerge-besluit.js@@  return vanDePR.every(r => r.conclusion === 'success');@@  return vanDePR.some(r => r.conclusion === 'success');@@test-automerge.js@@één groene run naast een rode telt weer als groen"
"automerge-besluit.js@@  if (!vanDePR.length) return null;@@  if (!vanDePR.length) return true;@@test-automerge.js@@geen PR-run gevonden geldt weer als toestemming in plaats van als twijfel"
".github/workflows/automerge.yml@@                return testsGroenUitRuns(data.workflow_runs || []);@@                const a = (data.workflow_runs || []).filter(r => r.status === 'completed');\n                return a.length ? a.some(r => r.conclusion === 'success') : null;@@test-automerge.js@@de workflow beslist weer zelf welke run telt, buiten het bereik van de toets"
# ── de ingangen van de testgate (18-09-2026) ──
# Sinds #245 telt alleen de PR-run en sinds #238 draait de push-run niet meer
# op takken. Die twee maken tests.yml zelf een poort: valt de pull_request-
# ingang weg, dan blijft élke PR stil liggen.
".github/workflows/tests.yml@@  pull_request:\n  workflow_dispatch:@@  workflow_dispatch:@@test-automerge.js@@de PR-run verdwijnt: de labelpoort vindt nooit meer een uitslag en elke PR blijft stil liggen"
".github/workflows/tests.yml@@  push:\n    branches: [main]@@  push:\n    branches: ['**']@@test-automerge.js@@de push-run draait weer op elke tak: de dubbele testtijd is terug"
# ── de namen waar de ruleset op wacht (18-09-2026) ──
# De ruleset op main eist vier checks op naam, en die lijst staat op GitHub.
# Hernoem je hier een job, dan wacht hij op een naam die nooit meer komt: geen
# rood kruis, alleen "Expected — waiting for status to be reported", en elke PR
# blokkeert. Deze twee bouwen dat na.
".github/workflows/tests.yml@@    name: browserproeven (de echte app in een echte browser)@@    name: browserproeven@@test-testgate.js@@een jobnaam is ingekort: de ruleset wacht op een naam die niet meer gerapporteerd wordt"
".github/workflows/tests.yml@@    name: Geen sleutels in de repo@@    name: Sleutelscan@@test-testgate.js@@de sleutelscan heet anders: elke PR blokkeert stil op de oude naam"
# ── de tak zelf bijwerken (18-09-2026, spoor 2 van #238) ──
# De duurste is de derde: het besluit zegt dan wel bijwerken, maar de workflow
# doet er niets mee. De poort staat dan groen getoetst dode code te zijn, en de
# PR blijft wachten op een mens — precies de toestand die dit moest opheffen.
"automerge-besluit.js@@    return { samenvoegen: false, bijwerken: true,@@    return { samenvoegen: false, bijwerken: false,@@test-automerge.js@@de achterstand wordt niet meer bijgewerkt: de PR wacht weer op een mens"
"automerge-besluit.js@@             melden: false, sleutel: 'achterstand' };@@             melden: true, sleutel: 'achterstand' };@@test-automerge.js@@de bot meldt weer wat hij zelf oplost: vals alarm op elke bijgewerkte PR"
".github/workflows/automerge.yml@@              if (b.bijwerken) {@@              if (false) {@@test-automerge.js@@de workflow negeert het bijwerk-besluit: de poort is dode code"
".github/workflows/automerge.yml@@          github-token: \${{ steps.app.outputs.token }}\n          script: |@@          script: |@@test-automerge.js@@github-script valt terug op GITHUB_TOKEN: de bijwerk-push start geen testrun"
".github/workflows/automerge.yml@@                    owner, repo, pull_number: pr.number, expected_head_sha: pr.head.sha@@                    owner, repo, pull_number: pr.number@@test-automerge.js@@bijwerken zonder expected_head_sha: een commit die deze run niet beoordeeld heeft gaat mee"
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

# ── de locatiepermissie in de BUNDEL (10-09-2026) ──
# Vier vormen van dezelfde fout, en de eerste twee zijn de fout zoals hij er
# echt stond: het app-manifest noemde de permissie niet, dus de merge nam de
# ongegrensde variant van de BT-plugins over en de .aab vroeg locatie op elke
# Android-versie. De oude toets liep met .every() over een lege lijst en stond
# daarom groen. De laatste twee bewaken de poort zelf: leest hij het
# samengevoegde manifest, en eist hij dat de permissie er ís?
".github/workflows/build-apk.yml@@<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\" android:maxSdkVersion=\"30\" />'@@'@@test-geen-gps.js@@de bundel krijgt de locatiepermissie weer ongegrensd van de plugins (de fout zoals hij was)"
".github/workflows/build-apk.yml@@android:name=\"android.permission.ACCESS_FINE_LOCATION\" android:maxSdkVersion=\"30\"@@android:name=\"android.permission.ACCESS_FINE_LOCATION\"@@test-geen-gps.js@@de grens valt van de locatiepermissie af: sensitive permission zonder disclosure"
".github/workflows/build-apk.yml@@android/app/build/intermediates/merged_manifests@@android/app/src@@test-geen-gps.js@@de poort kijkt weer naar het app-manifest en dus langs alles wat een plugin meebrengt"
".github/workflows/build-apk.yml@@              if not regels:\n                  print(\"FOUT: %s staat niet in het samengevoegde manifest.\" % naam)@@              if False:\n                  print(\"FOUT: %s ontbreekt.\" % naam)@@test-geen-gps.js@@de poort staat weer groen als hij niets vindt: geen bewijs telt weer als bewijs"
".github/workflows/build-apk.yml@@<uses-permission android:name=\"android.permission.CAMERA\" />'@@<uses-permission android:name=\"android.permission.CAMERA\" />'\n              '\\n    <uses-permission android:name=\"android.permission.RECORD_AUDIO\" />'@@test-privacydekking.js@@er komt een permissie in de bundel die de privacyverklaring niet noemt (de fout zoals CAMERA hem was)"
"public/privacy.html@@houdt de app de processor wakker@@houdt de app de processor in bedrijf@@test-privacydekking.js@@het woord waarmee een lezer de WAKE_LOCK-alinea vindt verdwijnt uit de verklaring"

# ── de schilgrenzen van de Play-app (10-09-2026) ──
# Twee dingen die §16a beloofde en die niemand nakeek. De eerste twee mutaties
# zetten de betaalroute buiten Play weer open vanuit een Airtable-veld; de
# derde zet een APK-download in de app, en dat is distributie buiten Play om
# door een app die Play zelf distribueert.
"public/pidlane-klant.js@@      if (c && c.isNativePlatform && c.isNativePlatform()) return '';@@      if (false) return '';@@test-schilgrenzen.js@@de koopknop kan weer vanuit Airtable in de Play-schil aangezet worden"
"public/pidlane-klant.js@@      console.warn('schildetectie mislukt — betaallink blijft uit', e);\n      return '';@@      console.warn('schildetectie mislukt — betaallink blijft uit', e);@@test-schilgrenzen.js@@een kapotte schildetectie laat de betaallink door in plaats van hem dicht te houden"
"public/pidlane-btflow.js@@'Een nieuwe APK-build (met Filesystem- en Share-plugins) lost dit definitief op.<br><br>'+@@'Een nieuwe APK-build (met Filesystem- en Share-plugins) lost dit definitief op. <a href=\"/download/pidlane.apk\">Nu downloaden</a><br><br>'+@@test-schilgrenzen.js@@de app biedt zelf een APK aan: een Play-app die buiten Play om distribueert"

# ── de adminbrowser: /admin/tabel (04-09-2026) ──
# Eén route die in zeven tabellen leest en in vijf schrijft. De fouten die
# hier tellen zijn niet rekenfouten maar weggevallen grendels: ze geven geen
# foutmelding, ze geven méér dan de bedoeling was.
"worker.js@@    if (geheim.indexOf(k) >= 0) {@@    if (false) {@@test-adminbron.js@@de wachtwoordhash en het resettoken gaan mee naar de beheerpagina"
"worker.js@@  const verboden = (def.beschermd || []).concat(def.geheim || []);@@  const verboden = [];@@test-adminbron.js@@Saldo en PassHash zijn hierlangs tóch te schrijven, buiten het saldoslot om"
# Het anker draagt de laatste commentaarregel mee: sinds het kasboek erbij
# kwam (#83) staat "schrijven: false" twee keer in ADMIN_BRONNEN, en dan bouwt
# een korter anker niets meer na.
"worker.js@@tabel zegt. Wijzigen doe je op de configkaart.\n    schrijven: false,@@tabel zegt. Wijzigen doe je op de configkaart.\n    schrijven: true,@@test-adminbron.js@@AppConfig is hierlangs te schrijven, langs de cacheverversing van /api/config heen"
"worker.js@@      if (ids.length > 10) return json({ ok: false, error: \"Maximaal 10 records per keer wissen.\" }, 400);@@@@test-adminbron.js@@meer dan tien records tegelijk wissen wordt stil half uitgevoerd"
"worker.js@@  if (veld && !VELDNAAM_OK.test(veld)) return json({ ok: false, error: \"Ongeldige veldnaam.\" }, 400);@@@@test-adminbron.js@@een veldnaam met formuletekens gaat ongefilterd de Airtable-formule in"

# ── een klant aanmaken vanuit het beheer (04-09-2026) ──
"worker.js@@      if (await klantZoek(env, email))\n        return json({ ok: false, error: \"Dit e-mailadres is al geregistreerd.\" }, 409);@@@@test-klant-aanmaken.js@@hetzelfde adres levert een tweede klantrij op: login pakt de eerste, jij boekt op de tweede bij"
"worker.js@@      if (pass) velden.PassHash = await hashPassword(pass, env);@@      if (pass) velden.PassHash = pass;@@test-klant-aanmaken.js@@het wachtwoord gaat ruw naar Airtable in plaats van gehasht"
"worker.js@@  if (actie !== \"opruimen\" && actie !== \"aanmaken\" && !/^rec[A-Za-z0-9]{14}$/.test(id))@@  if (false)@@test-klant-aanmaken.js@@de uitzondering op de id-eis is te ruim: bijboeken zonder id wordt een PATCH op niets"

# ── De escaping naar Airtable en naar de HTML van de expert (#142, 08-09-2026).
# Allebei dezelfde vorm: er stáát een wachter, maar hij dekt net niet alles af.
# Dat is het soort fout dat groen blijft staan, want de gewone invoer gaat er
# gewoon doorheen — alleen de rand niet.
"worker.js@@return metBackslash.replace(/'/g@@return String(s == null ? \"\" : s).replace(/'/g@@test-formule-escape.js@@de backslash wordt niet meer ontsnapt, dus een zoekterm kan de formule-string alsnog sluiten"
"worker.js@@const e = formuleTekst(q);\n      // &'' erachter@@const e = q;\n      // &'' erachter@@test-adminbron.js@@de zoekterm van /admin/tabel gaat ongeëscaped de filterByFormula in"
"public/pidlane-remote.js@@+getal(r.mn)+@@+r.mn+@@test-remote-tabel.js@@een cijferkolom van de opnametabel gaat weer ruw de HTML in"
"public/pidlane-remote.js@@+getal(r.n)+@@+r.n+@@test-remote-tabel.js@@het aantal metingen gaat weer ruw de HTML in"
# ── het proeftegoed hangt aan het account, niet aan het toestel (#113, 08-09-2026) ──
# StartTegoedGegeven is de hele grendel. Legt iemand alGehad plat, dan keert
# elke onboarding-call opnieuw KLANT_START_SALDO uit — hetzelfde gat als het
# oude localStorage-tegoed, alleen verplaatst van het toestel naar de route.
"worker.js@@      const alGehad = f.StartTegoedGegeven === true;@@      const alGehad = false;@@test-onboarding-tegoed.js@@de vlag doet niets meer: elke onboarding keert opnieuw proeftegoed uit"

# ── FILTERED_PIDS op de vorm die de meetketen doorgeeft (#158, 09-09-2026) ──
# De tabel stond op suffixen ('05') terwijl validateAndSmooth() de volledige
# pid toetst, dus laag 2+3 draaiden nergens. Twee kanten om het terug te
# breken, en allebei zijn ze plausibel: één regel in de oude vorm terugzetten,
# of de .slice(2) in fuel.js weer opvoeren die de suffixvorm compenseerde.
# ── Deze mutatie wees tot 10-09-2026 naar test-parser.js, want een suffix in
# FILTERED_PIDS liet laag 2+3 overslaan. Die lagen zijn weg, en toen ontsnapte
# hij: de lijst heeft nog één lezer, pidlane-fuel.js, en de test dáárvan had een
# overgetypte kopie van de tabel. Die kopie is nu de echte lijst uit de bron, en
# daarmee is dit weer een fout die gevangen wordt.
"public/pidlane-datalog.js@@  '0105', // koelwatertemperatuur@@  '05', // koelwatertemperatuur@@test-kerndekking.js@@FILTERED_PIDS staat weer op een suffix, dus een trage sensor telt als dynamisch en heeft ineens een volle reeks nodig"
"public/pidlane-fuel.js@@      const traag=traagSet.has(pid);@@      const traag=traagSet.has(pid.slice(2).toUpperCase());@@test-kerndekking.js@@de kerndekking zoekt weer een suffix in een lijst met volledige PIDs, dus elke trage sensor telt als dynamisch"

# ── De kostenraming hangt aan de uitvoer, niet aan het plafond (08-09-2026) ──
# Vier fouten die je bij deze verbouwing écht kunt maken. Ze delen één gevolg:
# de raming gaat weer met het plafond mee, en dan blokkeert de saldopoort
# klanten zodra iemand max_tokens verhoogt — precies wat deze wijziging moest
# wegnemen. De laatste is de stilste van de vier: geen verkeerd getal maar een
# NaN, en een NaN-vergelijking in preflight() is altijd false.
"public/pidlane-credits.js@@    if (k.uitN > 0) return Math.round(Math.min(max, k.uitGem));@@    if (k.uitN > 0) return Math.round(k.uitGem);@@test-uitvoerschatting.js@@het plafond is geen bovengrens meer voor de raming"
"public/pidlane-credits.js@@    const bak = k.perMax && k.perMax[String(max)];@@    const bak = null;@@test-uitvoerschatting.js@@elk plafond deelt weer één gemiddelde, dus een hulpvraag trekt het rapport omlaag"
"public/pidlane-credits.js@@          gem: bak && bak.n > 0 ? (bak.gem * (1 - wb) + uitTok * wb) : uitTok,@@          gem: bak && bak.n > 0 ? (bak.gem * (1 - wb) + (uitTok / maxTokens) * wb) : (uitTok / maxTokens),@@test-uitvoerschatting.js@@er wordt weer een verhouding tot het plafond opgeslagen in plaats van de echte uitvoer"
"public/pidlane-credits.js@@        if (!isFinite(o.uf) || o.uf <= 0) o.uf = CFG.uitvoerFactor;@@        if (false) o.uf = CFG.uitvoerFactor;@@test-uitvoerschatting.js@@een opslag van vóór deze wijziging geeft NaN in plaats van een raming"

# ── Het meetgat naast het loopgat (#133, 10-09-2026) ──
# De rit van 10-09: de adapter viel 39 s weg terwijl `connected` true bleef,
# en PLRit.gaten() (het loopgat) zag er niets van. Het meetgat vangt dat op
# door te tellen of een al bekende PID deze tik een verschoven stempel had.
# Twee fouten die je hier echt kunt maken: de bekendeTik-guard weglaten (dan
# meldt de openingstik van elke rit zichzelf als meetgat), en het sluiten van
# het interval weglaten (dan groeit een meetgat door tot ver na het herstel).
# De derde is de duurste en is met de hand nagemeten: bij een bevriezing staan
# de pollus en de tiklus samen stil, dus de eerste tik terug leest oude
# stempels. Zonder de loopgat-uitzondering geeft 90 s bevriezing een loopgat
# van 90 s én een meetgat van 5 s — en dan wijst blok 14 tegelijk naar de
# achtergrondkwestie en naar de bus. Dat is de vorm van #77 en #103.
"public/pidlane-testrun.js@@if (bekendeTik > 0 && gemetenTik === 0) {@@if (gemetenTik === 0) {@@test-rit.js@@de openingstik van een rit telt zichzelf als meetgat"
"public/pidlane-testrun.js@@} else if (meetgatSinds) {@@} else if (false) {@@test-rit.js@@een meetgat sluit niet meer af en groeit door tot na het herstel"
"public/pidlane-testrun.js@@if (!loopgatNu) {@@if (true) {@@test-rit.js@@een achtergrondbevriezing opent ook een meetgat en wijst zo naar de bus"

# ── De begeleide run kost alleen nog wat een rit kost (#166, 10-09-2026) ──
# Vier fouten die je bij precies deze verbouwing maakt. De eerste twee zijn de
# terugval: een stilstaande stap weer in de ritronde zetten "omdat het er toch
# bij hoort", en de oogstpoort laten sluiten zonder dat er onder belasting
# gemeten is — dan was de optrekstap voor niets weggehaald. De derde is de
# ladderfout die #64 op 10-09 de kop kostte: het venster opent achter het
# testrunscherm. De vierde is de stille: de poort gaat open op een auto die
# nooit gereden heeft, omdat één waarneming al meetelt.
"public/pidlane-testrun.js@@    ronde: 'toestel', nodig: 'toestel', opent: 'venster', issues: ['#64'],@@    ronde: 'rit', nodig: 'toestel', opent: 'venster', issues: ['#64'],@@test-begeleid.js@@de meetcontextvragen kosten weer ritminuten terwijl ze stilstaand kunnen"
"public/pidlane-testrun.js@@        ? { naam: 'belasting', klaar: false, tekst: 'MAP ' + e10B.min + '–' + e10B.max + ' kPa (spreiding ' + spreiding +@@        ? { naam: 'belasting', klaar: true, tekst: 'MAP ' + e10B.min + '–' + e10B.max + ' kPa (spreiding ' + spreiding +@@test-begeleid.js@@de oogstpoort gaat open zonder dat er ooit onder belasting gemeten is"
"public/pidlane-testrun.js@@  if (s.opent === 'venster') {\n    try { _bgWijk(true); }@@  if (false) {\n    try { _bgWijk(true); }@@test-begeleid.js@@het testrunscherm gaat niet meer opzij, dus het vragenvenster opent erachter"
"public/pidlane-testrun.js@@  punten.push(!e10D || e10D.n < 2@@  punten.push(!e10D || e10D.n < 1@@test-begeleid.js@@één enkele snelheidswaarneming telt weer als bewijs dat er gereden is"

# ── Vier lezers van hetzelfde gat (#170, 10-09-2026) ──
# Alle vier komen uit de twee verslagen van 10-09 en zijn daar gemeten, niet
# bedacht. De eerste is de oudste en de stilste: de guard die tijdens een run
# het bemonsteren overslaat, returnde vóór `laatstT = nu`, dus boekte de tik ná
# de run een gat ter grootte van die run — en blok 14 stuurde je daarmee naar
# "de adapter, de bus of een vastgelopen sweep". De tweede is de stap die #133
# moet toetsen en alleen het loopgat las, precies het gat dat een losgetrokken
# adapter NIET maakt. De derde draait de duiding van een meetgat om: binnen de
# achtergrond is het de afknijping (#18), niet de bus. De vierde zet de lat van
# tien minuten terug in de #19-proef, die daarmee voor elke ronde onhaalbaar werd.
"public/pidlane-testrun.js@@if (zelfOvergeslagen) { laatstLoop = nu; return; }@@if (zelfOvergeslagen) { return; }@@test-rit.js@@een testrun boekt weer zijn eigen loopgat en stuurt je naar de bus"
"public/pidlane-testrun.js@@      const sindsLoop = sindsM(gaten), sindsMeet = sindsM(meetgaten);@@      const sindsLoop = sindsM(gaten), sindsMeet = [];@@test-begeleid.js@@de adapterstap is weer blind voor het meetgat, en dat is het enige gat dat er valt"
"public/pidlane-testrun.js@@        ? ' — alle meetgaten vallen binnen een periode waarin de app weg was: dan is dit de afgeknepen '@@        ? ' — alle meetgaten vallen buiten elke periode waarin de app weg was: dan is dit de '@@test-gatduiding.js@@een meetgat in de achtergrond wordt weer aan de bus toegeschreven"
"public/pidlane-testrun.js@@      if (blind.length) tekort.push(blind.join(' en ') + ' stond niet in de pollronde');@@      if (blind.length) tekort.push(blind.join(' en ') + ' stond niet in de pollronde');\n      if (duur < 600) tekort.push('maar ' + Math.round(duur / 60) + ' min gereden van de tien');@@test-blok5lijst.js@@de tien minuten staan weer als drempel in de #19-proef"

# ── De onderrand: bereikbaar of vast achter de balk (#172, 10-09-2026) ──
# Deze proef meldde vanaf 01-09 elke rit FOUT, terwijl de bestuurder op 10-09
# in de toestelronde "Alles vrij — er valt niets weg" antwoordde. De meting
# vroeg of #appGrid PASTE in plaats van of je erbij KUNT, en op een pagina die
# scrollt is dat altijd waar en nooit iets waard. De twee fouten die je hier
# echt kunt maken zijn allebei een terugval naar die oude vraag: de
# scrollruimte niet meewegen, of hem wél lezen maar niet aftrekken.
"public/pidlane-testrun.js@@  var vast = tekort - rest;                         // wat er ook uitgescrold blijft staan@@  var vast = tekort;                                // wat er ook uitgescrold blijft staan@@test-schermranden.js@@de scrollruimte telt niet meer mee: elke scrollende pagina is weer een bevinding"
"public/pidlane-testrun.js@@  var rest = Math.max(0, scrollRest || 0);          // hoeveel er nog te scrollen valt@@  var rest = 1e9;                                   // hoeveel er nog te scrollen valt@@test-schermranden.js@@er is altijd genoeg scrollruimte, dus een echt onbereikbare onderrand valt weg"
# ── Geen wachtwoord in de Play-inzending (#174, 10-09-2026) ──
# Deze repository is PUBLIEK, en §7 van PLAY-INZENDING.md vraagt om een
# reviewaccount met tegoed erop. De sleutelscan in CI zoekt naar API-sleutels
# en tokens, niet naar een wachtwoord in lopende tekst — die vangt dit dus
# niet. De fout die je hier echt maakt is de regex zo smal maken dat hij alleen
# het verzonnen voorbeeld uit zijn eigen tegenproef nog herkent; de controle
# staat dan groen op een document dat wel degelijk lekt.
"public/test-playteksten.js@@[:|=]\\s*([^\\s|*_\\x60]{8,})/i.test(nep);@@[:|=]\\s*(NOOITZOGENOEMD)/i.test(nep);@@test-playteksten.js@@de wachtwoordwachter herkent een echt wachtwoord niet meer"
# ── Union op de verkeerde bestanden (10-09-2026) ──
# .gitattributes haalt de handmatige conflictreparatie weg die op 10-09 in zes
# van zeven inhaalmerges nodig was. Beide fouten hieronder zijn stil: de eerste
# brengt die reparaties terug zonder dat er iets rood wordt, de tweede laat git
# bij een botsing twee keer dezelfde regel JS wegschrijven — en dat is precies
# de klasse fout die hier maanden blijft staan.
".gitattributes@@PIDLANE.md            merge=union@@PIDLANE.md            -merge@@test-gitattributes.js@@PIDLANE.md valt niet meer onder union, dus de conflicten komen terug"
".gitattributes@@CHANGELOG.md          merge=union@@CHANGELOG.md          merge=union\n*.js                  merge=union@@test-gitattributes.js@@union uitgebreid naar JS, waar een verdubbelde regel stil breekt"
# ── §14 belooft iets wat §3 niet kent (10-09-2026) ──
# De release notes zijn een ingedikte §3, met de hand. Een functie erbij zetten
# zonder hem in de beschrijving te noemen is precies de vorm die §16 de kop
# kostte: twee velden die een reviewer allebei leest, met verschillende
# beloftes. Het valt niemand op tot het in de Console staat.
"PLAY-INZENDING.md@@Met ritmonitor, koopcheck en diagnose op afstand.@@Met ritmonitor, koopcheck en wielophangingsscanner.@@test-playteksten.js@@de release notes beloven een functie die de beschrijving niet opsomt"
# En andersom: §3 hernoemt een functie, §14 blijft de oude naam beloven. Dat is
# de stillere van de twee — je verbetert de beschrijving en raakt het veld
# ernaast niet aan.
"PLAY-INZENDING.md@@• Koopcheck — een vaste doorloop@@• Aankoopkeuring — een vaste doorloop@@test-playteksten.js@@§3 hernoemt een functie en §14 belooft de oude naam nog"
# ── Inloggen kost geen credit meer (#179, 10-09-2026) ──
# Vijf fouten die deze reparatie ongedaan maken, en ze zijn geen van vijven
# verzonnen: de eerste is precies hoe het er tot vandaag in stond, en de
# tweede is de verleiding die hem terugbrengt ("even zeker weten dat het
# model antwoordt"). De laatste drie zijn de stille kant: de ping blijft
# gratis maar gaat groen melden waar /v1/messages weigert, en dan belooft de
# chip een keten die de eerste echte analyse niet waarmaakt.
# ── De inzending is nl-NL only (#177, 10-09-2026) ──
# Niet "er staat een Engels blok in het document" is de fout, maar "de velden
# lopen niet gelijk": dat is precies hoe #177 eruitzag — §1, §2 en §14 met een
# en-US-blok en §3 zonder. Vandaar twee mutaties, één per richting. De tweede
# is de stillere: je vertaalt de volledige beschrijving en vergeet de twee
# velden ernaast, en dan leest een reviewer alsnog twee talen door elkaar.
"PLAY-INZENDING.md@@Lees je auto uit via een OBD2-adapter en krijg een diagnose in gewone taal.\n\`\`\`\n@@Lees je auto uit via een OBD2-adapter en krijg een diagnose in gewone taal.\n\`\`\`\n\n**Engels (en-US), als je een tweede taal aanzet:**\n\n\`\`\`\nRead your car through an OBD2 adapter and get a diagnosis in plain language.\n\`\`\`\n@@test-playteksten.js@@§2 krijgt een tweede taal terug terwijl §3 er geen heeft (#177)"
"PLAY-INZENDING.md@@De volledige privacyverklaring: app.pidlane.nl/privacy.html\nVragen: info@pidlane.nl\n\`\`\`\n@@De volledige privacyverklaring: app.pidlane.nl/privacy.html\nVragen: info@pidlane.nl\n\`\`\`\n\n**en-US:**\n\n\`\`\`\nPidLane connects over Bluetooth to an OBD2 adapter in your car.\n\`\`\`\n@@test-playteksten.js@@§3 wordt als enige vertaald en loopt weg bij de velden ernaast (#177)"
"public/pidlane-auth.js@@    const resp=await plFetch('/v1/ping');@@    const resp=await plFetch('/v1/messages',{method:'POST',json:{model:'claude-sonnet-5',max_tokens:20,messages:[{role:'user',content:'ping'}]}});@@test-inlogkosten.js@@testApiKey() doet bij elke login weer een echte AI-call (#179)"
"worker.js@@  return json({ ok: true, sleutel: clientKey ? \"app\" : \"worker\", rol: session.r, kosten: 0 });@@  await fetch(\"https://api.anthropic.com/v1/messages\", { method: \"POST\", headers: { \"x-api-key\": apiKey }, body: \"{}\" });\n  return json({ ok: true, sleutel: clientKey ? \"app\" : \"worker\", rol: session.r, kosten: 0 });@@test-inlogkosten.js@@de ping toetst de keten weer door het model écht aan te roepen (#179)"
"worker.js@@  if (session.r === \"demo\" || session.u === \"legacy\")\n    return json({ ok: false, error: \"forbidden_role\", hint: \"Dit account heeft geen AI-toegang.\" }, 403);@@@@test-inlogkosten.js@@de ping meldt een werkende AI-keten aan een account dat geen AI mag gebruiken (#179)"
"worker.js@@  if (!apiKey)\n    return json({ ok: false, error: { message: \"Geen API-key beschikbaar in de Worker (check ANTHROPIC_API_KEY secret)\" } }, 401);@@@@test-inlogkosten.js@@de ping meldt groen terwijl er geen sleutel in de Worker staat (#179)"
"worker.js@@      if (url.pathname === \"/v1/ping\" && request.method === \"GET\")\n        return lockOrigin(request, await handlePing(request, env));\n@@@@test-inlogkosten.js@@de pingroute hangt niet meer in de router, dus elke login zet de chip op rood (#179)"

# ── De aanlevering naar de AI (#188, 11-09-2026). Deze module is de enige plek
# die een model vertelt hoe goed de meting was waar hij een oordeel over geeft.
# Een fout hier levert geen foutmelding op maar een verkeerd rapport, en dat is
# de duurste soort: er staat een factuur onder. Vijf fouten die je hier echt kunt
# maken, en die alle vijf stil zijn.
"public/pidlane-aanlevering.js@@      uit.stilsteS = (uit.gemetenPerioden) ? A.stilsteS(0) : null;@@      uit.stilsteS = A.stilsteS(0);@@test-aanlevering.js@@een niet-gemeten stilte gaat als 0 naar de AI: niet gemeten wordt niets aan de hand (#18)"
"public/pidlane-aanlevering.js@@      if (sup && !sup.has(pid)) reden = 'deze auto ondersteunt de sensor niet';\n      else if (act && !act.has(pid))@@      if (act && !act.has(pid)) reden = 'staat niet in de PID-selectie en is dus niet uitgevraagd';\n      else if (sup && !sup.has(pid))@@test-aanlevering.js@@een sensor die de auto niet heeft wordt gemeld als niet-geselecteerd, en de monteur zoekt een knop die niet helpt"
"public/pidlane-aanlevering.js@@      ondersteuningBekend: sup ? true : null,@@      ondersteuningBekend: !!sup,@@test-aanlevering.js@@een ongescande auto leest als een auto die de sensor niet kan: elke ontbrekende sensor wordt weggeverklaard"
"public/pidlane-aanlevering.js@@    if (!m.vraag && !m.set && !m.dekking && !m.gemeten) return '';@@    if (!m.gemeten) return '';@@test-aanlevering.js@@een analyse over een meting die er niet is krijgt geen enkele waarschuwing mee"
"public/pidlane-aanlevering.js@@            if (q && q.status === 'onzin') reden = 'gemeten, maar uitgesloten: ' + q.reden;@@            if (false) reden = q.reden;@@test-aanlevering.js@@een fysiek onmogelijke waarde telt als geleverde dekking terwijl het kwaliteitsblok hem uitsluit"

# ── En de aanroepkant ervan (#188, tweede ronde). De aanroepplekken geven geen
# PID-lijst mee maar de profielnaam die ze tóch al noemen in ensurePIDsActive().
# Die vertaling van naam naar set is de plek waar het stil misgaat: klopt hij
# niet, dan meldt de dekking iets over andere sensoren dan de analyse gebruikte.
"public/pidlane-aanlevering.js@@    basis.concat(prof).forEach@@    [].concat(prof).forEach@@test-aanlevering.js@@BASIS_PIDS loopt niet meer mee: de dekking mist de motorcontext die elke analyse gebruikt"
"public/pidlane-aanlevering.js@@    if (!Array.isArray(prof)) return null;@@    if (!Array.isArray(prof)) return [];@@test-aanlevering.js@@een onbekende profielnaam levert een lege dekking in plaats van geen dekking"
"public/pidlane-fuel.js@@      profiel:'brandstof'});@@      profiel:'brandstoff'});@@test-aanlevering.js@@een typefout in een profielnaam: de brandstofanalyse verliest stil haar dekking"

# ── Het ritrapport (#196, 11-09-2026). Hier eindigt de keten: de aanlevering
# hierboven bereikt pas een model als dit rapport overeind blijft. Op de rit van
# 11-09 deed het dat niet — dertien minuten meten, en één regel in het logboek.
# Vijf fouten die alle vijf geen foutmelding opleveren maar een slechter rapport.
"public/pidlane-rit.js@@  ritPauzeLog.push({t:Date.now(), sec:s, faseIdx:ritFaseIdx});@@  ritLogs.push({t:Date.now(), type:'onderbreking', sec:s});@@test-ritrapport.js@@de onderbrekingsregel staat weer tussen de fases: het rapport valt om op Object.values(undefined) (#196)"
"public/pidlane-rit.js@@ (min \${fv(s.min)}, max \${fv(s.max)}, \${s.count} metingen\${!s.ok?', BUITEN NORM':''})\`@@\`@@test-ritrapport.js@@de AI krijgt alleen het gemiddelde: een piek van 4200 rpm onder een gemiddelde van 1500 is onzichtbaar"
"public/pidlane-rit.js@@  const g=(ritPauzeLog||[]).filter(p=>p.faseIdx===i);@@  const g=[];@@test-ritrapport.js@@de weggevallen seconden worden aan geen enkele fase meer toegewezen: een dunne fase leest als een sensor die uitvalt"
"public/pidlane-rit.js@@faseIdx:ritFaseIdx});@@faseIdx:ritFaseIdx+1});@@test-ritrapport.js@@het gat hangt aan de volgende fase: het rapport wijst de verkeerde reeks aan als onbetrouwbaar"
"public/pidlane-rit.js@@    log(\`Rit rapport: de AI-analyse mislukte — \${msg}\`,'err');@@    ;@@test-ritrapport.js@@de stille catch is terug: een mislukte analyse zegt alleen dat er geen rapport is, niet waarom"
"public/pidlane-rit.js@@        .map(l=>l.aiAnalyse ? \`\${l.fase}: \${l.aiAnalyse}\` : '')@@        .map(l=>\`\${l.fase}: \${l.samenvatting||l.desc||''}\`)@@test-ritrapport.js@@de proefrit geeft de koopcheck weer fasenamen zonder bevindingen — een lege uitslag die er gevuld uitziet"

# ── Tekstgrootte en de onderrand (#192, 11-09-2026). S/M/L schalen de app met
# `zoom` op body. `zoom` vermenigvuldigt de UITKOMST van een berekening terwijl
# 100dvh de hele viewport blijft, dus elke hoogte die rechtstreeks uit de
# viewport komt is bij L 13% te lang en valt er onderaan uit. Vier fouten die
# geen foutmelding geven maar een half scherm.
#
# De gedragskant staat in bproef-schermranden.js en NIET hier: plmutate kent
# geen overslaan, en op een toestel zonder Chromium zou die proef exit 0 geven
# en als ONTSNAPT geboekt worden. Die proef draagt zijn eigen tegenproef, zoals
# het commentaar bovenin hem uitlegt. Wat hieronder staat is de broncontrole.
"public/pidlane.css@@  --pl-vh:  calc(100dvh / var(--pl-zoom));@@  --pl-vh:  100dvh;@@test-schermranden.js@@de viewport wordt niet meer door de zoom gedeeld: bij tekstgrootte L is elke schermhoge maat 13% te lang"
"public/pidlane.css@@  zoom: var(--pl-zoom);@@  zoom: 1;@@test-schermranden.js@@de zoomfactor en het getal staan los van elkaar: S en L schalen niets meer, of straks weer het verkeerde"
"public/pidlane.css@@height:var(--pl-top); display:flex; align-items:center; justify-content:space-between; gap:8px; position:sticky;@@height:calc(46px + var(--pl-sat)); display:flex; align-items:center; justify-content:space-between; gap:8px; position:sticky;@@test-schermranden.js@@de topbalk schrijft zijn hoogte weer apart op, dus .app wordt precies het verschil te lang (#58)"
"public/pidlane.css@@body.uiS{ --pl-zoom:0.9; } body.uiL{ --pl-zoom:1.13; --pl-topbar:42px; }@@body.uiS{ --pl-zoom:0.9; } body.uiL{ --pl-zoom:1.13; }@@test-schermranden.js@@tekstgrootte L rekent met een balk van 46px terwijl hij er 42 tekent"

# ── De opslagroute (#132, 11-09-2026). De deelkaart van Android duwt de app
# naar de achtergrond, en dat kost binnen 2 tot 7 seconden de SPP-socket —
# zeven van de zeven afwezigheden in de logboeken van 11-09. Staat er een
# verbinding, dan gaat het bestand daarom rechtstreeks naar een map. Drie
# fouten die geen foutmelding geven maar een herverbinding of een zoekgeraakt
# bestand.
"public/pidlane-motortype.js@@  if(_plVerbindingStaat()){@@  if(false){@@test-opslagroute.js@@de deelkaart gaat weer open tijdens een rit: elke export kost een herverbinding (#132)"
"public/pidlane-motortype.js@@    if(typeof demoMode!=='undefined' && demoMode) return false;@@@@test-opslagroute.js@@demo telt als verbinding: in demo verdwijnt de deelkaart terwijl er geen socket te verliezen is"
"public/pidlane-motortype.js@@    if(pad){@@    if(true){@@test-opslagroute.js@@een mislukt rechtstreeks schrijven meldt succes: het bestand landt nergens en niemand ziet het"

# ── De dubbeltik-tip (#145, 11-09-2026). Hij hing aan renderGauges() en kwam
# dus op het keuzescherm voorbij, waar geen tegel staat — en daarna nooit meer,
# want het slot in localStorage staat dan dicht. Beide fouten hieronder zijn
# stil: de tip verschijnt gewoon niet.
"public/pidlane-pids.js@@  var g = document.getElementById('gGrid');@@  var g = document.getElementById('gauges');@@test-tegeltip.js@@de tip zoekt een container die niet bestaat en verschijnt stil nooit meer"
"public/pidlane-uihelpers.js@@  if(name==='live'){ try{ _tegelTipEenmalig(); }catch(e){ console.warn('Dubbeltik-tip niet getoond:', e); } }@@@@test-tegeltip.js@@de haak op de Live view is weg en niets roept de tip nog aan"

# ── Geld en privacy hadden geen tegenproef (11-09-2026) ──
# Vier van de zwaarste tests in deze repo stonden groen zonder dat iemand ooit
# gemeten had of ze rood kúnnen worden: het saldoslot, het proeftegoed, de
# VIN-pseudonimisering en de toestemmingstekst. Dat zijn precies de vier waar
# een stille fout niet "een knop doet het niet" betekent maar "de klant betaalt
# dubbel" of "een chassisnummer verlaat het toestel".

# Het saldoslot. Beide fouten hieronder zijn de vriendelijke soort: iemand die
# een harde stop wegneemt omdat hij hem overdreven vindt.
"worker.js@@  if (!env.REMOTE_SESSION) throw new Error(\"geen REMOTE_SESSION-binding — saldo kan niet veilig gemuteerd worden\");@@  if (!env.REMOTE_SESSION) return { bezet: false, result: await fn() };@@test-saldo-slot.js@@zonder binding gaat de saldomutatie onbeschermd door in plaats van te stoppen"
"worker.js@@  if (!grendel.ok) return { bezet: true, result: void 0 };@@  if (!grendel.ok) console.log(\"slot bezet, toch proberen\");@@test-saldo-slot.js@@een mislukte grendel wordt genegeerd: twee verzoeken muteren tegelijk hetzelfde saldo"

# Het proeftegoed. De eerste is letterlijk de bug van #49 terug: onbekend saldo
# als proeftegoed lezen, waarna elke wis-actie 25 tokens uitdeelt.
"public/pidlane-credits.js@@    if (raw === null || raw === '') return 0;@@    if (raw === null || raw === '') return 25;@@test-proeftegoed.js@@onbekend saldo leest weer als proeftegoed: wissen deelt tokens uit (#49)"
"public/pidlane-credits.js@@    return !(raw === null || raw === '');@@    return true;@@test-proeftegoed.js@@de derde toestand valt weg: een toestel dat nooit een saldo zag denkt dat het er een heeft"

# De VIN. De tweede is de fout die je niet ziet: alles blijft werken, het
# pseudoniem blijft 16 hextekens en blijft stabiel — maar zonder zout rekent
# een tabel een VIN terug, en dan klopt de toestemmingstekst niet meer.
"public/pidlane-veldlab.js@@    delete v.vin;@@@@test-vin-anoniem.js@@het chassisnummer blijft in het verzonden record staan"
"public/pidlane-veldlab.js@@  const buf=new TextEncoder().encode(VL_VIN_ZOUT+':'+schoon);@@  const buf=new TextEncoder().encode(schoon);@@test-vin-anoniem.js@@het zout valt weg: het pseudoniem is een kale SHA-256 van de VIN en dus terug te rekenen"

# De toestemmingstekst. Beide zijn een redactionele verbetering die de
# juridische lading omgooit — en een eerder gegeven akkoord ongeldig maakt.
"public/pidlane-klant.js@@Dat is pseudonimisering en geen anonimisering: wie ' +@@Dat is volledig anoniem: wie ' +@@test-toestemmingstekst.js@@het akkoordscherm belooft anonimisering die de app niet levert"
"public/pidlane-klant.js@@_vink('onbAnon', 'Meetdata delen onder een pseudoniem',@@_vink('onbAnon', 'Meetdata anoniem delen',@@test-toestemmingstekst.js@@de kop van het vinkje zegt anoniem terwijl de uitleg eronder pseudoniem zegt"

# De pakketnaam (12-09-2026). Het enige veld in de bundel dat na de eerste
# Play-upload onomkeerbaar vastligt, en tot vandaag keek er niets naar. De
# eerste mutatie is de fout die de inzending tegenhield; de tweede haalt de
# poort weg die dat voortaan vóór de upload zichtbaar maakt.
"capacitor.config.json@@\"appId\": \"nl.pidlane.app\",@@\"appId\": \"nl.PidLane.app\",@@test-nativeschil.js@@een hoofdletter in de pakketnaam: Play weigert de bundel met \"Voer een geldige pakketnaam in\""
"capacitor.config.json@@\"appId\": \"nl.pidlane.app\",@@\"appId\": \"pidlane\",@@test-nativeschil.js@@een pakketnaam van één deel, en dat is geen pakketnaam"
".github/workflows/build-apk.yml@@              print(\"── Pakketnaam in de bundel ──\")@@              print(\"── pakket ──\")@@test-nativeschil.js@@de bundelpoort leest de pakketnaam niet meer uit het gebouwde manifest"
# ── de ronde van 16-09-2026 (#210, #211, #212) ──
# Voor het eerst met een andere adapter gemeten: een goedkope ELM327-kloon
# herhaalt frames binnen één antwoord. De parser plakte die echo aan dezelfde
# hexstroom en leverde daardoor niet alleen gaten op maar ook één plausibel
# verkeerd getal — 0110 op 166,51 g/s terwijl een losse 0110 in dezelfde
# seconde 1,45 gaf, binnen de harde limiet en zonder MIST. De eerste vier
# mutaties bouwen elk één helft van die reparatie terug af.
"public/pidlane-diagbundel.js@@if(_pakLen(h, 8) && lenGezien>1 && hex){ echo=true; break; }@@_pakLen(h, 8);@@test-parser.js@@een tweede lengteregel wordt weer genegeerd: de echo schuift de laatste PID eruit"
"public/pidlane-diagbundel.js@@if(_pakLen(delen[0], 2) && lenGezien>1 && hex){ echo=true; break; }@@_pakLen(delen[0], 2);@@test-parser.js@@een lengte vóór een framemarker stopt niet meer: dezelfde echo op één regel glipt erdoor"
"public/pidlane-diagbundel.js@@const kand=kort?[pidByteLen(suf)]:[pidByteLen(suf),1,2,4];@@const kand=[pidByteLen(suf),1,2,4];@@test-parser.js@@op een afgekapt antwoord wordt een PID weer ingekort tot hij past (0134 als één byte)"
"public/pidlane-diagbundel.js@@if(/^7E[0-9A-F]$/.test(laatste)) return false;@@@@test-parser.js@@een CAN-header telt weer als lengte-indicator en de stop slaat bij frame 0 toe"
"public/pidlane-diagbundel.js@@if(echo){ try{ if(window.PLBus && typeof PLBus.noteEcho==='function') PLBus.noteEcho(); }@@if(false){ try{ if(window.PLBus && typeof PLBus.noteEcho==='function') PLBus.noteEcho(); }@@test-parser.js@@de echoteller loopt niet meer: de stop werkt, maar niemand kan zien dát hij werkt"
# En de regelkring eromheen. Het gevaarlijkste hier is niet dat een knop niet
# werkt maar dat hij wél lijkt te werken: een handmatige stand die stilletjes
# weggeregeld wordt, of een advies dat bij een echoënde adapter juist harder
# gaat pollen.
"public/pidlane-plload.js@@mult(){ return this._handmatig ? this._handMult : this._mult; },@@mult(){ return this._mult; },@@test-adapterpaneel.js@@de handmatige stand komt nergens aan: het schuifje beweegt en het tempo niet"
"public/pidlane-plload.js@@    if(this._handmatig){\n      this._vorigEcho=s.echoTot; this._vorigVenMs=s.venGemMs;@@    if(false){\n      this._vorigEcho=s.echoTot; this._vorigVenMs=s.venGemMs;@@test-adapterpaneel.js@@de automaat regelt een handmatige keuze binnen twee tikken weer weg"
"public/pidlane-plload.js@@    echoBodem:2,        // hier stopt de automatische krimp@@    echoBodem:1,        // hier stopt de automatische krimp@@test-adapterpaneel.js@@de echo-krimp zakt door naar groep 1 en derdeelt het tempo zonder dat iemand dat koos"
"public/pidlane-plload.js@@    if(erbij>=this.cfg.echoOp){@@    if(erbij>=1){@@test-adapterpaneel.js@@één herhaling is al genoeg om te krimpen: de groep staat binnen een minuut altijd op 2"
"public/pidlane-adapter.js@@    if (metEcho.length === st.length) {@@    if (false) {@@test-adapterpaneel.js@@het advies negeert herhaalde frames en adviseert harder pollen — precies de verkeerde kant op"
"public/pidlane-data.js@@  batchKleiner(){\n    if(S.batchVast) return false;@@  batchKleiner(){@@test-adapterpaneel.js@@een vastgezette groep wordt alsnog door de automaat verkleind"

# En de laatste meter van die keten: van PLLoad.mult() naar het interval dat de
# scheduler werkelijk gebruikt. Blok 5 dacht op 17-09-2026 dat die meter stuk
# was en meldde FOUT; in werkelijkheid mat de proef tegen de automaat in plaats
# van tegen de handmatige stand (zie §11). Deze twee mutaties zetten vast wat
# er dan wél kapot zou zijn geweest.
"public/pidlane-plload.js@@  const lm=(window.PLLoad&&typeof PLLoad.mult==='function')?PLLoad.mult():1;@@  const lm=1;@@test-adapterpaneel.js@@het schuifje verzet de multiplier wel maar pidPollInterval() kijkt er niet naar"
"public/pidlane-plload.js@@    if(nieuwStand) this._handMult=this._mult;@@    if(nieuwStand) this._handMult=1.0;@@test-adapterpaneel.js@@overnemen springt naar vol tempo in plaats van de stand over te nemen die er stond"

# ── "Welk onderdeel?" wees een gezonde sensor aan (16-09-2026) ──
# De melding kwam uit het gebruik met een schermafdruk erbij: brandstofpeil en
# afstand-met-MIL-aan als "sterke aanwijzing: draadbreuk, stekker of sensor".
# Elke mutatie hieronder zet één van de vier poorten terug waarop dat misging.
# Ze delen één vorm: de module blijft precies zo overtuigd klinken, maar het
# bewijs eronder is weg -- en dat is de dure kant, want deze tekst stuurt
# iemand naar de garage voor een onderdeel dat het doet.
"public/pidlane-onderdeel.js@@      var drempel=Math.max(R.min, iv*R.factor);@@      var drempel=R.min;@@test-onderdeel.js@@de vaste 8-secondendrempel is terug: elke trage sensor is weer kapot (de fout zoals hij gemeld is)"
"public/pidlane-onderdeel.js@@      if(!gevraagd){ uit.wacht.push(pid); return; }@@      if(false){ uit.wacht.push(pid); return; }@@test-onderdeel.js@@stilte telt weer als uitval, ook zonder dat er iets gevraagd is"
"public/pidlane-onderdeel.js@@      if(TELLER_PIDS.has(pid)){ uit.tellers.push(pid); return; }@@      if(false){ uit.tellers.push(pid); return; }@@test-onderdeel.js@@een teller van de ECU krijgt weer een draadbreuk toegedicht"
"public/pidlane-onderdeel.js@@      var stilMs=nu-t-busKrediet(pid);@@      var stilMs=nu-t;@@test-onderdeel.js@@de bus-pauze telt weer als stilte van de sensor: elke sweep levert defecte sensoren op"
"public/pidlane-onderdeel.js@@  if(!S || typeof S.interval!=='function' || typeof S.laatstePoging!=='function') return uit;@@  if(!S){ S={interval:function(){return 1000;},laatstePoging:function(){return Date.now();},laatsteSucces:function(){return 0;},dood:function(){return false;}}; }@@test-onderdeel.js@@zonder cadansregister wordt er alsnog geoordeeld, op een verzonnen tempo"
"public/pidlane-onderdeel.js@@  try{ if(typeof dtcCodes!=='undefined' && Array.isArray(dtcCodes)) codes=dtcCodes.slice(); }@@  try{ if(typeof window._laatsteDTC!=='undefined') codes=window._laatsteDTC.slice(); }@@test-onderdeel.js@@de foutcodes komen weer uit een bron die niet bestaat: de halve module doet niets"
"public/pidlane-onderdeel.js@@        if(c.draait!==true) return null;\n        var map=V('010B');\n        if(map===null||c.rpm===null) return null;\n        if(c.rpm>1200) return null;@@        var map=V('010B');\n        if(map===null||c.rpm===null) return null;\n        if(c.rpm>1200) return null;@@test-onderdeel.js@@met de motor uit leest de inlaatdruk de buitenlucht en dat heet weer een vacuümlek"
"public/pidlane-onderdeel.js@@        if(c.looptijd!==null) return c.looptijd>=600;@@        if(c.looptijd!==null) return true;@@test-onderdeel.js@@elke koude start is weer een kapotte thermostaat"
"public/pidlane-onderdeel.js@@        return reeksOordeel(aanhoudend('0105', function(v){ return v<75; }, 600000, 10));@@        return true;@@test-onderdeel.js@@zonder motorlooptijd wordt koud koelwater weer zonder meer een thermostaat"
"public/pidlane-onderdeel.js@@  if(!R.length && !rails.length && !uitvalKaart){@@  if(!R.length){@@test-onderdeel.js@@het scherm zegt weer \"geen enkel onderdeel aan te wijzen\" boven een rode kaart die er wel een aanwijst"
"public/pidlane-onderdeel.js@@      var n=aanhoudend(pid, function(w){ return Math.abs(w-r.v)<tol; }, RAIL_MIN_MS, RAIL_MIN_N);\n      if(!n) return;@@      var n=1;@@test-onderdeel.js@@één misgelezen frame tegen de eindwaarde is weer genoeg voor een diagnose"
"public/pidlane-onderdeel.js@@      var tol=(typeof r.tol==='number')?r.tol:RAIL_TOL;@@      var tol=RAIL_TOL;@@test-onderdeel.js@@de speling van 0,6 geldt weer voor een signaal dat tot 1,275 loopt: een vette meting is een kortsluiting"
"public/pidlane-onderdeel.js@@        return c.ect===null?null:(c.ect>105);\n      }, {xor:'temp'})@@        return c.ect===null?null:(c.ect>105);\n      })@@test-onderdeel.js@@te koud en te warm straffen elkaar weer af, dus de thermostaatregel haalt de ondergrens nooit"
"public/pidlane-onderdeel.js@@  if(eis==='warmbelast') return c.draait===true && c.warm===true &&\n                                c.belasting!==null && c.belasting>=20;@@  if(eis==='warmbelast') return c.draait===true && c.warm===true;@@test-onderdeel.js@@uitrollen met afgesloten inspuiting levert weer een dode lambdasonde op"
# De ruisdrempel is uit de browserproef gekomen en niet uit het hoofd: op de
# demo-auto, die niets mankeert, stond "EGR-klep" op het scherm op grond van
# één voorwaarde van gewicht 2. Zet hem terug en die kaart komt terug.
"public/pidlane-onderdeel.js@@    var draagt = voor.length>=2 || zwaarste>=3;@@    var draagt = true;@@test-onderdeel.js@@één losse hint van gewicht 2 maakt weer een verdachte"

# ── De testrun levert tijdens de rit aan (17-09-2026, fase 1) ──
# Twee kanten, en de gevaarlijkste is niet "er komt niets" maar "er komt te
# veel": een onbekende veldnaam levert een 422 van Airtable op, waarna de hele
# batch van tien terugkomt in de buffer en elke vijftien seconden opnieuw
# faalt. Dan legt één verkeerde sleutel de hele log plat en niet één regel.
"public/pidlane-auth.js@@        if(AT_KOLOMMEN.has(k)) velden[k]=(typeof w==='boolean'||typeof w==='number')?w:String(w);\n        else staart.push(k+'='+(typeof w==='object'?JSON.stringify(w):String(w)));@@        velden[k]=w;@@test-livelog.js@@elke sleutel gaat als veld naar Airtable: één onbekende naam legt de hele log plat"
"public/pidlane-auth.js@@    const bericht=String(message||'')+(staart.length?' · '+staart.join(' '):'');@@    const bericht=String(message||'');@@test-livelog.js@@de context achter het bericht valt weer weg — precies de stille fout van vóór vandaag"
"public/pidlane-auth.js@@        Message:    bericht.slice(0,500),@@        Message:    bericht,@@test-livelog.js@@een lange staart omzeilt de grens van 500 tekens"
"public/pidlane-testrun.js@@  if (st === 'FOUT' || st === 'LET OP' || st === 'LETOP') {@@  if (true) {@@test-livelog.js@@elke stap gaat naar de live-log: vijftig regels per rit en de tabel loopt vol"
"public/pidlane-testrun.js@@    _liveSchrijf(st === 'FOUT' ? 'error' : 'opvallend',@@    if (st === 'FOUT') _liveSchrijf('error',@@test-livelog.js@@een LET OP komt onderweg niet meer naar buiten"
"public/pidlane-testrun.js@@  if (blok !== _liveBlok) {\n    _liveBlokKlaar();@@  if (blok !== _liveBlok) {@@test-livelog.js@@een blok wordt nooit afgesloten: er valt onderweg niets af te vinken"
"public/pidlane-testrun.js@@      Demo: !!(typeof demoMode !== 'undefined' && demoMode)@@      Demo: false@@test-livelog.js@@een demo-run komt als echte meting in de tabel"
"public/pidlane-testrun.js@@  } catch (e) {\n    console.warn('Testrun: regel niet naar de live-log gestuurd — de run gaat gewoon door', e);\n    return false;\n  }@@  } finally { }@@test-livelog.js@@een kapotte log sleurt de hele testrun mee"

# ── KWAM HET AAN? (#235, 17-09-2026, nagemeten aan de andere kant van de lijn)
# De logtabel telde die avond 722 regels en nul daarvan kwam van een testrun,
# terwijl gewone regels er diezelfde avond nog in kwamen. Het live-pad was dus
# opgeleverd en niemand kon zien dat er niets doorheen kwam: een mislukte batch
# ging alleen naar console.warn, op een telefoon, tijdens een rit.
# Blok 5 vraagt het nu aan plLiveLogStatus(). Deze vijf fouten laten die vraag
# allemaal een geruststellend antwoord geven dat nergens op slaat.
"public/pidlane-auth.js@@        _atNoteer(true,resp.status,batch.length,'',g);@@        void 0;@@test-livelog.js@@een geslaagde verzending laat geen spoor na: blok 5 ziet nooit een uitslag en kan niets onderscheiden"
"public/pidlane-auth.js@@_atNoteer(false,resp.status,batch.length,err?.error?.message||('HTTP '+resp.status));@@_atNoteer(true,resp.status,batch.length,err?.error?.message||('HTTP '+resp.status));@@test-livelog.js@@een geweigerde batch wordt als geslaagd vastgelegd — precies de fout die de hele log platlegt, nu met groen ervoor"
"public/pidlane-auth.js@@      if(Number.isFinite(g)&&g>=batch.length){@@      if(true){@@test-livelog.js@@de Worker mag weer ok zeggen zonder te melden dat hij iets wegschreef: logging_paused leest weer als succes"
"public/pidlane-auth.js@@    _atNoteer(false,null,batch.length,e.message||'netwerkfout');@@    void 0;@@test-livelog.js@@een netwerkfout laat de vorige uitslag staan: de log is weg en blok 5 meldt de verzending van tien minuten geleden"
"public/pidlane-auth.js@@function plLiveLogStatus(){ return _atLaatste?Object.assign({},_atLaatste):null; }@@function plLiveLogStatus(){ return _atLaatste; }@@test-livelog.js@@de beller krijgt de toestand zelf in handen en kan zijn eigen uitslag groen maken"
"public/pidlane-auth.js@@  if(!_atBuffer.length) return;@@  if(false) return;@@test-livelog.js@@een lege buffer telt als geslaagde verzending: 'er stond niets klaar' leest als 'het is aangekomen'"

# En de andere helft: de proef zelf. Deze drie laten hem iets zeggen dat niet
# klopt zonder dat er ook maar iets omvalt — een vals alarm of een vals groen
# tijdens een rit, en dat is precies het soort proef dat genegeerd gaat worden.
"public/pidlane-testrun.js@@      if (na.status === 401 || na.status === 403)@@      if (false)@@test-livelog.js@@een sessie zonder app-token levert FOUT in plaats van LET OP: de proef staat rood op elke run zonder login"
"public/pidlane-testrun.js@@      while ((!na || (voor && na.tijd === voor.tijd)) && gewacht < 5000) {@@      while (!na && gewacht < 5000) {@@test-livelog.js@@een geslaagde verzending van vóór deze proef telt als bewijs: de proef keurt zijn eigen regel goed zonder dat die verstuurd is"
"public/pidlane-testrun.js@@        return { staat: 'LET OP', detail: 'er is geen logadres ingesteld (AIRTABLE_URL leeg)@@        return { staat: 'FOUT', detail: 'er is geen logadres ingesteld (AIRTABLE_URL leeg)@@test-livelog.js@@een ontbrekende voorwaarde wordt als kapot kanaal gemeld"

# ── DE METING IN BEELD HOUDEN (#228, 17-09-2026). Acht fouten die het venster
# stil laten uitvallen of juist stil laten opkomen. Geen ervan geeft een
# foutmelding: het enige symptoom is dat de meetlus tijdens een rit alsnog
# stilvalt, en dat merk je pas bij het lezen van het verslag.
"public/pidlane-pip.js@@    if (!f.toggleAan)@@    if (false)@@test-pip.js@@de uitzetknop in de Config doet niets meer: de beheerder zet hem om en het venster komt toch op"
"public/pidlane-pip.js@@      if (v === undefined || v === null || v === '') return true;@@      if (v === undefined || v === null || v === '') return false;@@test-pip.js@@een Config zonder de sleutel leest als UIT: de functie staat nergens aan tot iemand hem expliciet inschakelt"
"public/pidlane-pip.js@@    if (_laatsteVlag === b.aan) return Promise.resolve(b);@@    if (false) return Promise.resolve(b);@@test-pip.js@@elke sync stuurt opnieuw naar de bridge, ook als er niets veranderd is"
"public/pidlane-pip.js@@    return Promise.resolve(p.zetGewenst({ aan: b.aan }))@@    return Promise.resolve(p.zetGewenst({ aan: true }))@@test-pip.js@@de vlag gaat nooit meer uit: de app springt in een klein venster terwijl er niets gemeten wordt"
"public/pidlane-pip.js@@      if (document.body) document.body.classList[_inPip ? 'add' : 'remove']('pl-pip');@@      if (document.body) document.body.classList.add('pl-pip');@@test-pip.js@@de PiP-weergave gaat er nooit meer af: na een keer wegschakelen is de app een zwart scherm met drie getallen"
"public/pidlane-pip.js@@      p.addListener('pipModus', function (ev) { modus(!!(ev && ev.in)); });@@      p.addListener('pipMode', function (ev) { modus(!!(ev && ev.in)); });@@test-pip.js@@de gebeurtenis heet anders dan wat java stuurt: het kleine venster verschijnt nooit en de volle weergave staat in 240x135"
"native/PLPip.java@@        if (!gewenst) return;@@        if (false) return;@@test-nativeschil.js@@het venster komt op ongeacht wat de app besloot — ook met de functie uitgezet in de Config"
".github/workflows/build-apk.yml@@                  \"        PLPip.leaveHint(this);\",@@                  \"        // haak eruit\",@@test-nativeschil.js@@de enige haak waarop Android PiP toestaat valt weg: alles lijkt in orde en het venster gaat nooit aan"
# ── #277: één rit, alle opdrachten, en groen is gesloten (23-09-2026) ──
# Op 23-09 sloot "adapter eruit" zonder onderbreking en was het scherm groen
# terwijl de knop NOG NIET zei. Eén rit telt wél voor elke opdracht.
"public/pidlane-opdracht.js@@    return (_opdrachten || []).filter(function (r) { return !!r.opdracht; }).map(@@    return (_opdrachten || []).filter(function (r) { return !!r.opdracht && r.id === (_herkomst || {}).id; }).map(@@test-meetvenster.js@@de rit telt weer alleen voor de gekozen opdracht: tien minuten rijden per opdracht opnieuw"
"public/pidlane-testrun.js@@r.afgerond && !r.alVerzonden; });\n    if (!klaar.length)@@!r.alVerzonden; });\n    if (!klaar.length)@@test-meetvenster.js@@verzend alle stuurt ook nog-niet mee: een tussenstand leest in de tabel als antwoord"
"public/pidlane-testrun.js@@r.afgerond && !r.alVerzonden; });\n    if (!klaar.length)@@r.afgerond; });\n    if (!klaar.length)@@test-meetvenster.js@@verzend alle stuurt wat al verzonden is opnieuw: dubbele uitkomsten in de tabel"
"public/pidlane-opdracht.js@@    var ok = v.niet ? !bevat : bevat;@@    var ok = bevat;@@test-meetvenster.js@@niet wordt genegeerd: de goedkope-adapteropdracht sluit op de MX+"
"public/pidlane-meetkamer.js@@    oor = eindoordeel(oor, s.verzend);\n@@@@test-meetvenster.js@@het grote cijfer kleurt weer op de proeven alleen: groen boven, NOG NIET op de knop"
"public/pidlane-meetkamer.js@@      _vragen(s) +\n      _verzendKnop(s) +@@      _verzendKnop(s) +@@test-meetvenster.js@@de vragen van de opdracht komen weer niet in beeld: de bestuurder ziet ze nooit (#283)"
"public/pidlane-testrun.js@@  if (antw) _liveSchrijf(@@  if (false) _liveSchrijf(@@test-meetvenster.js@@de antwoorden gaan weer niet mee naar de tabel: beantwoord op het scherm, nergens terug te vinden (#283)"
"public/pidlane-testrun.js@@  return ((o && o.naam) || '') + '|' + vonnis.staat + '|' + vonnis.reden + '|' + antw;@@  return ((o && o.naam) || '') + '|' + vonnis.staat + '|' + vonnis.reden;@@test-meetvenster.js@@een antwoord na het verzenden telt niet als nieuw: de knop blijft op al verzonden staan en het antwoord komt nooit aan (#283)"
"public/pidlane-opdracht.js@@    if (opties.indexOf(optie) < 0) return false;\n@@@@test-meetvenster.js@@elk vrij antwoord telt: de tabel krijgt tekst die buiten de opties valt (#283)"
# ── #229: een rendercrash neemt het proces niet mee (22-09-2026) ──
"native/PLRender.java@@                return true;\n            }\n        });@@                return false;\n            }\n        });@@test-nativeschil.js@@de luisteraar geeft false: Capacitor geeft dat door en Android schiet het proces af, meetdienst en al"
".github/workflows/build-apk.yml@@                  \"        PLRender.koppel(this, getBridge());\",\n@@@@test-nativeschil.js@@de luisteraar hangt niet meer aan de Java-MainActivity: de plugin bestaat, maar niemand vangt de rendercrash af"
"native/PLRender.java@@                noteer(act, crash);\n@@@@test-nativeschil.js@@de crash wordt niet meer vastgelegd: na de herstart vermomt hij zich als een bevroren proces"
"public/pidlane-render.js@@log(m, 'err')@@log(m, 'warn')@@test-nativeschil.js@@de melding na een rendercrash is een waarschuwing en komt niet meer in D1"
"public/pidlane-render.js@@    _stuurStartregel().then(function () { return p.proef(); }).catch(@@    Promise.resolve(p.proef()).catch(@@test-nativeschil.js@@de proefcrash wacht niet meer op D1: de startregel sterft met de pagina en de crash lijkt onbesteld (23-09-2026 gemeten)"
"public/pidlane-render.js@@    }), plafond]);@@    })]);@@test-nativeschil.js@@geen plafond meer: bij een hangende verbinding gaat de proefcrash nooit af"

# ── DE MEETOPDRACHT VAN BUITEN (#241, 17-09-2026). De keurder is het enige wat
# tussen een rij in Airtable en een meting op een rijdende auto staat. Elke
# fout hieronder laat iets door dat daarna wordt uitgevoerd, en geen ervan
# geeft een foutmelding: de rit draait, het verslag komt binnen, en alleen de
# waarden kloppen niet met wat er gevraagd was.
"public/pidlane-opdracht.js@@      if (TOEGESTAAN.indexOf(k) === -1) fouten.push('onbekende sleutel \`' + k + '\`');@@      void k;@@test-opdracht.js@@de witte lijst laat alles door: een sleutel die deze app niet kent glipt mee naar de uitvoering"
"public/pidlane-opdracht.js@@    if (SCHEMAS.indexOf(o.schema) === -1)\n      fouten.push(@@    if (false)\n      fouten.push(@@test-opdracht.js@@een opdracht uit een schema dat deze app niet kent wordt alsnog uitgevoerd"
"public/pidlane-opdracht.js@@        if (!PID_VORM.test(String(p))) { fouten.push('\`' + p + '\` is geen PID-code'); return; }@@        if (false) { return; }@@test-opdracht.js@@een sensor die geen PID-code is komt door"
"public/pidlane-opdracht.js@@    var binnen = (w >= lo && w <= hi);@@    var binnen = true;@@test-opdracht.js@@elke gemeten waarde valt binnen de band: de opdracht kan niet meer rood worden"
"public/pidlane-opdracht.js@@          // NIET stil terugvallen op de vorige opdracht: dan meet de rit iets\n          // anders dan er in Airtable staat en is het verschil onzichtbaar.\n          _actief = null; _herkomst = null;@@          void 0;@@test-opdracht.js@@een afgekeurde opdracht laat de vorige staan: de rit meet iets anders dan er in de tabel staat"
"public/pidlane-opdracht.js@@  function haal() {\n    _laatsteFout = null;\n    if (!toggleAan()) {@@  function haal() {\n    _laatsteFout = null;\n    if (false) {@@test-opdracht.js@@de uitzetknop houdt het verkeer niet meer tegen"
"worker.js@@  if (ruw.length > 8192)@@  if (false)@@test-opdrachtroute.js@@de groottegrens valt weg: een tekst van een megabyte gaat eerst de telefoon in"
"worker.js@@WHERE Actief = 1 ORDER BY Gewijzigd DESC LIMIT 5@@WHERE Actief = 1 ORDER BY Gewijzigd ASC LIMIT 5@@test-opdrachtroute.js@@bij twee actieve rijen wint de OUDSTE: je zet een opdracht aan en er draait een andere"
"worker.js@@FROM meetopdrachten WHERE Actief >= 0 ORDER BY Gewijzigd DESC LIMIT 12@@FROM meetopdrachten ORDER BY Gewijzigd DESC LIMIT 12@@test-opdrachtroute.js@@het archief staat weer in de lijst: een opdracht over een dicht issue krijgt elke rit een oordeel en gaat mee met verzenden"
"worker.js@@    meer: rijen.length > 1 ? rijen.length : 0,@@    meer: 0,@@test-opdrachtroute.js@@twee actieve rijen worden niet meer gemeld: stil draait er een andere opdracht dan je bedoelde"
# ── OP WELKE BRON DRAAIT DE APP (#242, 17-09-2026). Een preview draait dezelfde
# app met andere code; van buiten is het verslag van de twee niet te
# onderscheiden. Elke fout hieronder haalt precies dat onderscheid weg, en geen
# ervan geeft een foutmelding -- je merkt het pas bij het lezen van een rit die
# je opnieuw moet doen.
"public/pidlane-bron.js@@  function isProductie() { return huidige() === PRODUCTIE; }@@  function isProductie() { return huidige().indexOf('pidlane') >= 0; }@@test-bron.js@@een adres met pidlane in de naam telt als productie: de banner blijft weg op een preview"
"public/pidlane-bron.js@@    if (!/^https:\/\/[a-z0-9.-]+(\/|$)/i.test(ruw)) {@@    if (false) {@@test-bron.js@@elk stuk tekst uit de Config wordt een navigatie, ook javascript: en data:"
"public/pidlane-bron.js@@    if (isProductie()) return null;@@    if (false) return null;@@test-bron.js@@de previewbanner staat ook op productie: een waarschuwing die er altijd staat wordt genegeerd"
"public/pidlane-bron.js@@    var doel = isProductie() ? preview() : PRODUCTIE;@@    var doel = preview();@@test-bron.js@@vanaf een preview kom je niet meer terug naar de live-app"
"public/pidlane-bron.js@@      b.textContent = '⚠ PREVIEW — ' + huidige() + ' · dit is niet de live app';@@      b.textContent = 'PREVIEW';@@test-bron.js@@de banner noemt het adres niet meer: je ziet dat het een preview is maar niet welke"
"public/pidlane-onderdeel.js@@    r.vc.forEach(function(vc){ if(voor.indexOf(vc.tekst)>=0 && vc.w>zwaarste) zwaarste=vc.w; });@@    r.vc.forEach(function(vc){ if(vc.w>zwaarste) zwaarste=vc.w; });@@test-onderdeel.js@@het zwaarste gewicht wordt uit alle voorwaarden gehaald in plaats van uit de voorwaarden die aansloegen"
"public/pidlane-onderdeel.js@@        var perL=maf/l;\n        return (perL<0.2) || (perL>2.5);@@        var perL=maf;\n        return (perL<2) || (perL>7);@@test-onderdeel.js@@de oude MAF-grens 2–7 g/s zonder motorinhoud is terug: een gezonde 2,0 liter stationair heet weer defect (#232)"
"public/pidlane-onderdeel.js@@        if(c.rpm===null || c.rpm>1000) return null;\n        if(c.snelheid!==null@@        if(c.rpm===null) return null;\n        if(c.snelheid!==null@@test-onderdeel.js@@de MAF-regel oordeelt weer buiten stationair: vol gas op 91 g/s past dan niet (#232)"
"public/pidlane-onderdeel.js@@        return a===null?null:(a<-25||a>45);@@        return a===null?null:(a<-5||a>45);@@test-onderdeel.js@@de ontstekingsgrens staat weer op −5°: een warme motor die tot −20° terugneemt heet weer een versleten ketting (#231)"
"public/pidlane-onderdeel.js@@    _scanMislukt=false;\n    render();@@    _scanMislukt=false;@@test-onderdeel.js@@na het uitlezen vanuit het paneel wordt er niet opnieuw getekend: er staat nog steeds dat de foutcodes niet uitgelezen zijn (#233)"
# ── #218: de DTC-vlag zegt "er is gekeken" (22-09-2026) ──
# De vlag ging aan op de eerste regel van scanDTC(); het onderdeelpaneel zei dan
# tijdens de scan en na een fout "geen foutcodes" in plaats van "niet uitgelezen".
"public/pidlane-graph.js@@async function scanDTC(){\n  document.getElementById('bscan').disabled=true;@@async function scanDTC(){\n  window._didDTCScan=true;\n  document.getElementById('bscan').disabled=true;@@test-dtcvlag.js@@de DTC-vlag gaat weer aan vóór het antwoord: tijdens de scan en na een fout heet het geen foutcodes"
# ── #261: afmelden opent geen verbindingsscherm, sluiten verbreekt eerst (22-09-2026) ──
"public/pidlane-auth.js@@  if(typeof connected!=='undefined' && connected) handleConnect();\n}@@  handleConnect();\n}@@test-afmelden.js@@afmelden roept de verbindingsschakelaar weer blind aan en opent zonder verbinding het verbindingsscherm"
"public/pidlane-auth.js@@  try{ if(typeof connected!=='undefined' && connected) await handleConnect(); }@@  try{ }@@test-afmelden.js@@Sluit de app sluit met een open verbinding: de sessie wordt niet bewaard en de adapter blijft bezet"
"public/pidlane-archief.js@@  if(window._plBackMelding) return;@@  window.plSluitApp?.();\n  if(window._plBackMelding) return;@@test-terugknop.js@@de terugknop gaat via Sluit de app alsnog naar de uitgang"

# ── De aandrijfstatus (17-09-2026). Zes fouten die de balk bovenin de
# Live-weergave stil verkeerd laten staan — en "stil" is hier het punt: een
# toestandsbalk ziet er altijd uit alsof hij iets weet. De eerste is een
# regressie en geen verzinsel: die klem zat er tot vandaag in.
"public/pidlane-plload.js@@     && !(typeof EV_ANKER_SUFFIX!=='undefined' && EV_ANKER_SUFFIX.has(suf))) return 999999;@@     ) return 999999;@@test-aandrijving.js@@de EV-klem is terug: toerental wordt meegepauzeerd en de EV-modus kan zichzelf niet meer opheffen"
"public/pidlane-aandrijving.js@@    return g.heeftGedraaid ? 'STARTSTOP' : 'UIT_VOOR_START';@@    return 'UIT_VOOR_START';@@test-aandrijving.js@@de voorgeschiedenis doet niet meer mee: een start/stop-stop leest als een auto die nog niet gestart is"
"public/pidlane-aandrijving.js@@    if (lt !== null && lt > 0) { uit.heeftGedraaid = true; uit.bronGedraaid = 'looptijd'; return uit; }@@    if (false) { uit.heeftGedraaid = true; uit.bronGedraaid = 'looptijd'; return uit; }@@test-aandrijving.js@@motorlooptijd telt niet meer mee, dus aankoppelen tijdens een start/stop-stop wordt 'motor uit'"
"public/pidlane-aandrijving.js@@    var dood = (nu.ecuLeeft === false) || rpm === null || spd === null ||\n      (_getal(nu.ouderdomMs) !== null && nu.ouderdomMs > D.versMs);@@    var dood = false;@@test-aandrijving.js@@een wegvallende bus wordt als motor-uit gelezen in plaats van als onbekend"
"public/pidlane-aandrijving.js@@      motorDraait = (v && v.motorDraait) ? (rpm > D.rpmUit) : (rpm >= D.rpmAan);@@      motorDraait = (rpm >= D.rpmAan);@@test-aandrijving.js@@de hysterese op het toerental is weg: de balk knippert rond de drempel"
"public/pidlane-aandrijving.js@@      } else if (v.kandidaat === rauw && (t - v.kandidaatSinds) >= D.stabielMs) {@@      } else if (true) {@@test-aandrijving.js@@de stabilisatie staat uit: één mislukt monster verandert de getoonde toestand"

# ── De start/stop-waarneming die het meetcontextvenster voorvult (#64,
# 17-09-2026). Die vraag stond tot vandaag blind in een venster vlak vóór een
# betaalde analyse; nu vult de app hem voor uit wat hij zelf gezien heeft. Drie
# fouten die geen foutmelding geven maar een prompt die iets beweert dat
# niemand gemeten heeft — en dat is precies wat die vraag moest voorkomen.
"public/pidlane-aandrijving.js@@      startStopGezien: !!((v && v.startStopGezien) || toestand === 'STARTSTOP'),@@      startStopGezien: toestand === 'STARTSTOP',@@test-aandrijving.js@@de waarneming verdwijnt zodra de motor weer aanslaat: het venster stelt alleen 'ja' voor als je toevallig bij een stoplicht op Analyseer drukt"
"public/pidlane-aandrijving.js@@      startStopGezien: !!((v && v.startStopGezien) || toestand === 'STARTSTOP'),@@      startStopGezien: !!((v && v.startStopGezien) || toestand === 'STARTSTOP' || toestand === 'UIT_VOOR_START'),@@test-aandrijving.js@@'motor uit vóór de eerste start' telt als start/stop: contact aan is genoeg voor een 'ja' in de prompt"
"public/pidlane-archief.js@@    return {waarde:'', reden:'geen start/stop-stop gezien; dat kan ook betekenen dat je niet lang genoeg stilstond met een warme motor'};@@    return {waarde:'nee', reden:'geen start/stop-stop gezien'};@@test-meetcontext.js@@niets-gezien wordt als 'nee' voorgesteld, en dan leest de AI een normale start/stop-stop als afslaan"
"public/pidlane-archief.js@@        gekozen[v]=b.dataset.waarde;\n        geklikt[v]=true;@@        gekozen[v]=b.dataset.waarde;@@test-meetcontext.js@@een aangeklikt antwoord is niet meer van een blijven-staand voorstel te onderscheiden: punt 3 van #64 meet zichzelf kapot"

# ── Het register van waarnemingen per auto (#225, 17-09-2026). De autolaag
# naast de sessielaag: "deze auto HEEFT start/stop" verandert nooit en hoort
# dus niet elke verbinding weggegooid te worden. Vijf fouten die geen
# foutmelding geven — alleen een venster dat weer iets vraagt wat de app al
# wist, of erger, iets beweert wat niemand gemeten heeft.
"public/pidlane-waarneming.js@@        wat: wat, status: 'onbekend', bron: null, wanneer: null, bewijs: null,@@        wat: wat, status: 'weerlegd', bron: null, wanneer: null, bewijs: null,@@test-waarneming.js@@een leeg register leest als 'deze auto heeft het niet' — niet-gemeten wordt stilletjes nee"
"public/pidlane-waarneming.js@@      if (oud.weerlegdOp && nieuw.wanneer <= oud.weerlegdOp) return;@@      if (false) return;@@test-waarneming.js@@een oudere waarneming heropent de weerlegging: de gebruiker kan de app niet meer corrigeren"
"public/pidlane-waarneming.js@@      if (oud.status === 'gezien') return;@@      if (false) return;@@test-waarneming.js@@elke volgende waarneming schuift het moment op, en dan is een valse positief achteraf niet meer te herkennen"
"public/pidlane-waarneming.js@@    _sleutel = k;\n    _bewaard = false;\n    _reg = k ? _laad(k) : {};@@    _sleutel = k;\n    _bewaard = false;@@test-waarneming.js@@de volgende auto begint met de waarnemingen van de vorige — in een werkplaats is dat de normale gang van zaken"
"public/pidlane-aandrijving.js@@    if (_stand.startStopGezien && !gezienWas) _promoveer(_stand, nu);@@    if (false) _promoveer(_stand, nu);@@test-waarneming.js@@de waarneming wordt niet meer naar de auto gepromoveerd: alles blijft groen en de vraag komt volgende rit gewoon terug"
"public/pidlane-archief.js@@    if(w && w.status==='weerlegd')@@    if(w && w.status!=='gezien')@@test-meetcontext.js@@een register dat niets weet levert 'nee' op, en dan leest de AI een normale start/stop-stop als afslaan"

# ── De meetkamer (#246, 18-09-2026). Het scherm dat de vraag van de rit
# toont is gevaarlijker dan geen scherm zodra het iets anders zegt dan het
# verslag: je stopt met het verslag lezen. Deze tien bouwen die stille
# afwijking na — plus de fout die de eerste versie onleesbaar maakte: elk
# issue tonen in plaats van alleen wat deze rit aangaat.
"public/pidlane-meetkamer.js@@      uit.binnen = /afgekeurd/i.test(r)@@      uit.binnen = /nooit-waar-xyz/i.test(r)@@test-meetkamer.js@@een AFGEKEURDE opdracht leest als 'er stond niets klaar': de rit meet iets anders dan de tabel zegt en niemand ziet het"
"public/pidlane-meetkamer.js@@    if (isNaN(_g(u.waarde))) return basis;@@    if (false) return basis;@@test-meetkamer.js@@een niet-gemeten proef krijgt een balk op nul: een rit zonder meting leest als een rit ver buiten de band"
"public/pidlane-meetkamer.js@@    if (v === null || v === undefined || v === '') return NaN;@@    if (v === undefined) return NaN;@@test-meetkamer.js@@een ontbrekende band wordt stil een band van 0 tot 0 en de meting staat keurig in het midden van iets dat niet bestaat"
"public/pidlane-meetkamer.js@@    var marge = (span > 0) ? span * (RAND / (1 - 2 * RAND)) : 1;@@    var marge = span * (RAND / (1 - 2 * RAND));@@test-meetkamer.js@@een band van één punt deelt door nul en zet NaN op het scherm"
"public/pidlane-meetkamer.js@@      if (!r || r.blok !== 5 || !r.naam) return;@@      if (!r || !r.naam) return;@@test-meetkamer.js@@regels uit andere blokken kleuren de chips: een issue wordt groen op werk dat er niet over ging"
"public/pidlane-meetkamer.js@@      if (RANG[staat] > RANG[b.staat]) b.staat = staat;@@      b.staat = staat;@@test-meetkamer.js@@de laatste proef wint in plaats van de zwaarste: een issue met één FOUT en daarna een LET OP kleurt oranje"
"public/pidlane-meetkamer.js@@      if (DEEL_VORM.test(q)) { delen++; return; }@@      if (false) { delen++; return; }@@test-meetkamer.js@@§11 en §4 staan weer als issuechip op het scherm en verwijzen naar niets"
"public/pidlane-meetkamer.js@@      if (st === 'fout' || st === 'let op') { draag(q, p.naam, st, 'blok5'); return; }@@      { draag(q, p.naam, st || 'wacht', 'blok5'); return; }@@test-meetkamer.js@@elk gedekt issue komt weer als chip op het scherm: 43 pillen in plaats van wat deze rit aangaat"
"public/pidlane-meetkamer.js@@    if (fout.length) regel = fout[0].detail || fout[0].naam;@@    if (false) regel = fout[0].detail || fout[0].naam;@@test-meetkamer.js@@het oordeel bovenaan noemt de fout niet meer: er staat een rood cijfer zonder te zeggen wat er mis is"
"public/pidlane-meetkamer.js@@    if (_tikker) return;@@    if (false) return;@@test-meetkamer.js@@elke keer openen zet er een tikker bij, en die ververst daarna onzichtbaar door tijdens het rijden"
"public/pidlane-opdracht.js@@    return binnen ? _uit('ok', staart, proef, w, r.n)@@    return binnen ? _uit('ok', staart, proef, null, r.n)@@test-meetkamer.js@@de uitslag draagt de gemeten waarde niet meer: het scherm tekent geen enkele balk en niemand merkt het"

# ── Meerdere vragen per rit (#248, 18-09-2026). Een rit is hier de schaarste:
# wie #217 en #19 wil weten reed tot nu toe twee keer. Deze zeven bouwen de
# stille fouten na die dat weer zouden weggooien — een sessie die niet splitst,
# een afgekeurde rij die stil verdwijnt, en een keuze die de vorige opdracht
# laat staan terwijl je denkt dat je gewisseld bent.
"public/pidlane-opdracht.js@@    if (!rij) { _laatsteFout = 'geen opdracht met id ' + id; return null; }@@    if (!rij) { return _actief; }@@test-meetkamer.js@@een onbekend id laat stil de vorige opdracht staan terwijl de gebruiker denkt dat hij gewisseld is"
"public/pidlane-opdracht.js@@    if (!rij.opdracht) { _laatsteFout = rij.fout || 'die opdracht is niet bruikbaar'; return null; }@@    if (!rij.opdracht) { return _actief; }@@test-meetkamer.js@@een afgekeurde rij levert de vorige opdracht op in plaats van een weigering"
"public/pidlane-meetkamer.js@@    if (_bezigLaden) return Promise.resolve(null);@@    if (false) return Promise.resolve(null);@@test-meetkamer.js@@twee keer op ophalen drukken stuurt twee verzoeken en de laatste wint, afhankelijk van het netwerk"

# ── De knop die het live oordeel vastlegt (19-09-2026). Op 19-09 zijn dertien
# opdrachten achter elkaar gekozen en van elk het oordeel op het scherm
# gelezen; in de logtabel stond er nul van terug. Deze vier bouwen na wat die
# knop weer waardeloos zou maken: niets versturen, dubbel versturen, nooit
# meer mogen, of het verkeerde woord op de knop zetten.
"public/pidlane-testrun.js@@  _verzonden[o.naam] = _opdrachtStempel(o, vonnis);@@  _verzonden[o.naam] = null;@@test-verzendoordeel.js@@de knop vergeet wat hij verstuurd heeft: tien keer drukken is tien keer dezelfde rij in de tabel"
"public/pidlane-testrun.js@@  return ((o && o.naam) || '') + '|' + vonnis.staat + '|' + vonnis.reden + '|' + antw;@@  return 'altijd-hetzelfde';@@test-verzendoordeel.js@@de stempel kent het oordeel niet meer: een veranderde uitkomst is niet meer te versturen en de rit is weggegooid"
"public/pidlane-testrun.js@@    if (nu.alVerzonden) return { ok: false, reden: 'deze uitkomst staat er al@@    if (false) return { ok: false, reden: 'deze uitkomst staat er al@@test-verzendoordeel.js@@de dubbelcheck staat uit: elke druk op de knop levert een nieuwe reeks rijen op"
"public/pidlane-meetkamer.js@@    var woord = st === 'gesloten' ? 'GESLOTEN' : st === 'bevinding' ? 'BEVINDING' : 'NOG NIET';@@    var woord = 'GESLOTEN';@@test-verzendoordeel.js@@de knop zegt GESLOTEN bij elke uitkomst: je verstuurt een lege meting in de veronderstelling dat de vraag beantwoord is"
"public/pidlane-meetkamer.js@@    if (!o) {\n      // Niet stil falen@@    if (false) {\n      // Niet stil falen@@test-meetkamer.js@@een mislukte keuze begint tóch een nieuwe sessie: een leeg ritnummer waar nooit iets onder komt"
"public/pidlane-testrun.js@@  if (basis === _liveVorigId) { _liveVolg++; _liveRit = basis + '-' + _liveVolg; }@@  if (false) { _liveRit = basis; }@@bproef-meetkamer.js@@twee opdrachten binnen dezelfde minuut delen één ritnummer: buiten de app is niet te zien welke regel bij welke vraag hoorde"
"public/pidlane-meetkamer.js@@    return veilig(String(v == null ? '' : v).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, \"\\\\'\"));@@    return veilig(String(v == null ? '' : v));@@test-meetkamer.js@@een apostrof in een Airtable-id breekt de onclick van de keuzeknop"
"worker.js@@  const alle = new URL(request.url).searchParams.get(\"alle\") === \"1\";@@  const alle = false;@@test-opdrachtroute.js@@?alle=1 geeft nog steeds alleen de actieve rij: de keuzeknoppen tonen er altijd maar een"
"worker.js@@        opdracht: ruw2.length > 8192 ? \"\" : ruw2,@@        opdracht: ruw2,@@test-opdrachtroute.js@@een opdracht van een megabyte gaat alsnog de telefoon in voordat iemand hem afkeurt"
"public/pidlane-testrun.js@@      var baan = PLMeetkamer.ronde(s);@@      var baan = PLMeetkamer.issuebaan(s);@@test-meetkamer.js@@de blok-5-proef roept een functie aan die na de hernoeming niet meer bestaat — precies de regressie die op 18-09 19:53 op productie stond"

# ── De markeringen overleven de volgende ronde (#255, 18-09-2026). De bedoelde
# volgorde is meetrit → testrun → toestelronde → testrun, en juist die maakte de
# tweede run blind. Acht aanroepplekken lezen die lijst; alle acht vielen terug
# op hun "niet gedaan"-tak en zeiden dat als een feit over de rit.
"public/pidlane-testrun.js@@  _BG.aan = true; _BG.i = 0; _BG.gepauzeerd = false; _BG.gestart = _nu(); _BG.gedaan = []; _BG.laatsteActie = '';@@  _BG.aan = true; _BG.i = 0; _BG.gepauzeerd = false; _BG.gestart = _nu(); _BG.gedaan = []; _BG.laatsteActie = '';\n  _markeringen = [];@@test-markeringen.js@@de toestelronde wist de markeringen van de meetrit: de tweede testrun meldt dat de achtergrondstap niet gedaan is terwijl hij dat wel was"
"public/pidlane-testrun.js@@      try { return (_BG && _BG.aan && _BG.soort) ? _BG.soort : 'los'; }@@      try { return 'los'; }@@test-markeringen.js@@een markering zegt niet meer uit welke ronde hij komt, en dan is filteren per ronde weer giswerk"

# ── Wat er in de logtabel terechtkomt (#256, 18-09-2026). Die tabel is sinds
# #241 de bron waarop de volgende meetopdracht gebouwd wordt. Deze vijf bouwen
# de fouten na die er op 18-09 werkelijk in stonden: proefwaarden als echte
# metingen, elke uitschieter dubbel, en 61 rijen zonder sessienummer.
"public/pidlane-auth.js@@        SessionId:  sessie,@@        SessionId:  '',@@test-logvelden.js@@de gewone logregels komen weer binnen zonder sessienummer: de conclusie van de testrun en het bewijs eronder zijn niet aan elkaar te knopen"
"public/pidlane-auth.js@@  try{ if(window._plProefWaarden) return 'proefwaarde'; }@@  try{ if(false) return 'proefwaarde'; }@@test-logvelden.js@@de 300 °C die blok 5 met opzet inschiet staat weer als echte meting in de tabel, op een auto die 91–93 °C loopt"
"public/pidlane-auth.js@@        Adapter:    adapter,@@        Adapter:    '',@@test-logvelden.js@@de adapter blijft weer leeg terwijl hij dé variabele is in #217 en #254: welke adapter erin zat moet weer uit een tekstregel gevist worden"
"public/pidlane-auth.js@@  if(opties&&opties.geenAirtable) return;@@  if(false) return;@@test-logvelden.js@@elke harde-limietmelding staat weer twee keer in de tabel en elke telling telt dubbel"
"public/pidlane-auth.js@@  if(type==='warn'&&(msg.includes('buiten')||msg.includes('sprong')||msg.includes('outlier'))) logToSheets('outlier',msg);@@  if(type==='warn'&&msg.includes('buiten')||msg.includes('sprong')||msg.includes('outlier')) logToSheets('outlier',msg);@@test-logvelden.js@@de haakjes zijn weg: && bindt sterker dan ||, dus elke regel met \"oorsprong\" erin gaat als uitschieter naar Airtable"

# ── Voorwaarden en het driewaardige oordeel (#257, 18-09-2026). Negen van de
# twintig LET OP-regels van 18-09 gingen niet over de auto maar over
# omstandigheden die er niet waren. Deze vijf halen dat onderscheid weer weg.
"public/pidlane-opdracht.js@@    var mist = vw.filter(function (v) { return v.vervuld !== true; });@@    var mist = [];@@test-opdrachtvoorwaarden.js@@de voorwaarden tellen niet meer mee: een rit met een koude motor heet weer gesloten"
"public/pidlane-opdracht.js@@    var stil = uit.filter(function (u) { return u.staat === 'LET OP'; });@@    var stil = [];@@test-opdrachtvoorwaarden.js@@een PID die niet gemeten is heet weer een bevinding: niet-gemeten en buiten-de-band zijn weer één ding"
"public/pidlane-opdracht.js@@          catch (e) { console.warn('Opdracht: de stapcontrole gaf een fout (#257)', e); gezien = null; }@@          catch (e) { console.warn('Opdracht: de stapcontrole gaf een fout (#257)', e); gezien = false; }@@test-opdrachtvoorwaarden.js@@een stapcontrole die stukgaat leest als \"de stap is niet gezet\" — niet-na-te-gaan wordt weer stil niet-gedaan (#227)"
"public/pidlane-opdracht.js@@    if (SCHEMAS.indexOf(o.schema) === -1)@@    if (o.schema !== SCHEMA)@@test-opdrachtvoorwaarden.js@@de hele voorraad van schema 1 wordt afgekeurd en elke rit kost eerst een nieuwe rij in de tabel"
"public/pidlane-opdracht.js@@(isAdapter ? 1 : 0) !== 1) {@@(isAdapter ? 1 : 0) === 0) {@@test-opdrachtvoorwaarden.js@@een voorwaarde met pid én stap komt erdoor, en dan meet de rit iets anders dan er op papier staat"

# ── De logtabel staat sinds #262 in D1 en niet meer in Airtable, en dat
# verandert één ding wezenlijk: Airtable maakte een onbekend veld vanzelf aan,
# SQLite niet. De veldnamen staan daardoor op twee plekken — AT_KOLOMMEN in de
# app en schema.sql — en dat is in dit project de vorm die al twee documenten
# de kop kostte. Deze twee bouwen precies de twee kanten van die vergissing na:
# iemand zet een veld in de app en vergeet het schema, of hernoemt een kolom in
# het schema en vergeet de app. Beide keren raakt er data stil weg.
"public/pidlane-auth.js@@  'Demo','Repro','Device']);@@  'Demo','Repro','Device','Koelwater']);@@test-logschema.js@@een nieuw logveld in de app zonder kolom in D1: die waarde belandt stil in \`onbekend\`"
"public/pidlane-bt.js@@          try{ localStorage.setItem('pl_autoconn','1'); }@@          try{ }@@test-herverbinden.js@@niets zet de herverbindvlag: na elke rendercrash weer met de hand op Verbinden, zoals tot 24-09 (#229)"
"public/pidlane-uihelpers.js@@    try{ localStorage.removeItem('pl_autoconn'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ } // bewust verbroken@@    // bewust verbroken@@test-herverbinden.js@@bewust verbreken wist de wens niet: de app verbindt opnieuw terwijl je hem net losmaakte (#229)"
"schema.sql@@  Message       TEXT,@@  Bericht       TEXT,@@test-logschema.js@@een kolom in D1 hernoemd zonder de app mee te nemen: het berichtveld komt nergens meer aan"
# ── De logroute schrijft sinds #262 naar D1. Deze drie bouwen de fouten na
# die deze route al eens gemaakt heeft of makkelijk weer maakt, en ze gaan
# alle drie over hetzelfde: een mislukking die zich als succes voordoet. Die
# stond hier van 20-09 17:12 tot 22-09 live — `{ok:true}` met HTTP 200 terwijl
# er niets werd weggeschreven — en de proef in blok 5 die juist dat kanaal
# bewaakt keurde het goed. Een kanaal dat stil faalt is erger dan geen kanaal.
"worker.js@@  if (!await appTokenOk(request, env)) return json({ error: \"unauthorized\" }, 401);\n  if (!env.LOGDB) return json({ error: \"no_logdb\" }, 500);\n  let payload;@@  return json({ ok: true, status: \"logging_paused\" }, 200);\n  if (!await appTokenOk(request, env)) return json({ error: \"unauthorized\" }, 401);\n  if (!env.LOGDB) return json({ error: \"no_logdb\" }, 500);\n  let payload;@@test-logroute.js@@de logstop van 20-09 is terug: de route meldt 200 ok en schrijft niets — precies wat blok 5 niet zag"
"worker.js@@    return json({ error: \"schrijven_mislukt\", detail: String(e && e.message || e) }, 502);@@    return json({ ok: true }, 200);@@test-logroute.js@@een mislukte schrijfactie heet weer geslaagd: de app gooit de batch weg en niemand mist de regels"
"worker.js@@    if (Object.keys(rest).length && kolommen.has(\"onbekend\")) {@@    if (false) {@@test-logroute.js@@het vangnet is weg: een veld zonder kolom verdwijnt stil in plaats van in \`onbekend\` te landen"

# ── De opruimkant van D1 (#260). Bij Airtable kon bulkwissen niet, dus deze
# fouten konden daar ook niet bestaan; nu wel, en ze zijn alle drie
# onomkeerbaar. De eerste is de ergste: een regel met een Outcome is het
# antwoord op een issue, en daar is een rit voor gereden.
"worker.js@@    if (body.ookUitkomsten !== true && kol.has(\"Outcome\"))@@    if (false)@@test-adminbron-d1.js@@opruimen neemt de uitkomsten mee: het antwoord op een issue verdwijnt samen met de ruis"
"worker.js@@    const proef = body.proef !== false;@@    const proef = body.proef === true;@@test-adminbron-d1.js@@opruimen wist meteen in plaats van eerst te tellen — een vergissing kost dan rijen en geen getal"
"worker.js@@    if (!waar.length)@@    if (false)@@test-adminbron-d1.js@@een opruimregel zonder enkele voorwaarde komt erdoor, en dat is de hele tabel"

# ── /admin/d1 (24-09-2026): de SQL-console en de meetopdrachten ──
# De console belooft alleen te lezen, en die belofte rust op twee lagen: de
# vraag als subquery, en de tekstkeuring ervóór. Elke laag apart uitzetten
# moet rood worden — anders hangt "alleen lezen" aan één regel zonder dat
# iemand het weet. De opdrachtmutaties bouwen 22-09 na: negen actieve rijen,
# en de verkeerde won.
"worker.js@@db.prepare(ingepakt).bind(D1_SQL_MAX_RIJEN + 1).all()@@db.prepare(kern).all()@@test-admind1.js@@de console draait de vraag kaal in plaats van als subquery: zonder de tekstkeuring schrijft hij"
"worker.js@@  const m = kaal.match(D1_SQL_VERBODEN);@@  const m = null;@@test-admind1.js@@de tekstkeuring laat schrijfwoorden door: alleen de subquery houdt de console nog op lezen"
"worker.js@@  const skelet = d1SqlSkelet(tekst);@@  const skelet = tekst;@@test-admind1.js@@de keuring leest tekstwaarden mee: een zoekvraag op '%DELETE%' wordt geweigerd"
"worker.js@@      db.prepare(\"UPDATE meetopdrachten SET Actief = 0 WHERE Actief = 1 AND id <> ?\").bind(id),\n@@@@test-admind1.js@@een opdracht aanzetten laat de andere aan staan: de app kiest er dan zelf een, zoals op 22-09"
"worker.js@@      ? await db.batch([db.prepare(\"UPDATE meetopdrachten SET Actief = 0 WHERE Actief = 1\"), invoeg])@@      ? [await invoeg.run()]@@test-admind1.js@@een nieuwe actieve opdracht zet de oude niet uit"
"worker.js@@var D1_OPDRACHT_VELDEN = [\"Naam\", \"Reden\", \"Opdracht\", \"Notitie\"];@@var D1_OPDRACHT_VELDEN = [\"Naam\", \"Reden\", \"Opdracht\", \"Notitie\", \"Gewijzigd\"];@@test-admind1.js@@Gewijzigd is met de hand te zetten: dan kies je stil welke opdracht er rijdt"
# De beheerpagina zelf (bproef-beheerpagina.js). Drie stille fouten die er
# allemaal goed uitzien: een afgekeurde opdracht gaat tóch aan (de app wijst
# hem bij de start af en de rit rijdt zonder dat iemand het weet), het vangnet
# verdwijnt uit beeld, en een dag zonder regels valt weg uit de reeks.
"admin/beheer.html@@  if(!k.ok){ alert(@@  if(false){ alert(@@bproef-beheerpagina.js@@een afgekeurde meetopdracht is toch te activeren: de app weigert hem bij de start en de rit rijdt zonder"
"admin/beheer.html@@  if(vangnet) waarsch.push(@@  if(false) waarsch.push(@@bproef-beheerpagina.js@@regels in het vangnet \`onbekend\` staan niet meer in beeld: een ontbrekende kolom valt niemand op"
"admin/beheer.html@@    uit.push([d, x[1], x[2]]);@@    if(x[1]) uit.push([d, x[1], x[2]]);@@bproef-beheerpagina.js@@een dag zonder regels valt weg uit de dagreeks: juist het gat is onzichtbaar"
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
