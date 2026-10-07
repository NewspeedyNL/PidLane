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
# Draaien:  bash plmutate.sh                      (vanuit de repo-root)
#           bash plmutate.sh ~/PidLane
#           bash plmutate.sh . --sinds origin/main   alleen wat je branch raakte
#           bash plmutate.sh . --parallel 4          vier tegelijk (standaard:
#                                                    het aantal kernen, hoogstens 4)
#
# SNELLER SINDS 29-09-2026. De tabel telde 732 mutaties en een volledige run
# duurde zo'n 16 minuten. De tijd zat bijna helemaal in de 49 mutaties op een
# browserproef: elk daarvan start Chromium en de hele app (15–20 s), terwijl
# de 683 op een node-test samen twee à drie minuten kosten. Twee dingen:
#
#   --parallel N  elke werker krijgt een eigen `git worktree` van HEAD en pakt
#                 de volgende mutatie uit een gedeelde rij. Jouw werkmap wordt
#                 dus nooit meer aangeraakt, ook niet halverwege een Ctrl-C.
#                 De uitvoer blijft in tabelvolgorde. De browserproeven kunnen
#                 naast elkaar: plbrowser.js kiest zelf een vrije poort en een
#                 eigen profielmap.
#   --sinds REF   alleen de mutaties waarvan het bronbestand of de test sinds
#                 de splitsing met REF veranderde, plus de tabelregels die er
#                 sindsdien bij kwamen of veranderden. Dat is de vraag die je
#                 lokaal hebt: vangt mijn test iets? Het is GEEN vervanging van
#                 de volle run — een wijziging in bestand A kan een test op
#                 bestand B stil stukmaken, en dat ziet alleen de volle run.
#                 Daarom draait CI hem altijd helemaal, en zegt een deelrun dat
#                 in zijn laatste regel.
# ══════════════════════════════════════════════════════════════════

REPO=""; SINDS=""; PARALLEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sinds)      SINDS="$2"; shift 2 ;;
    --sinds=*)    SINDS="${1#*=}"; shift ;;
    --parallel|-j) PARALLEL="$2"; shift 2 ;;
    --parallel=*) PARALLEL="${1#*=}"; shift ;;
    -*)           echo "Onbekende optie: $1 (bekend: --sinds REF, --parallel N)"; exit 2 ;;
    *)            REPO="$1"; shift ;;
  esac
done
[ -n "$REPO" ] || REPO="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$REPO" && pwd)"
PUB="$REPO/public"
[ -d "$PUB" ] || { echo "Geen public/ in $REPO"; exit 2; }

ROOD=$'\033[31m'; GROEN=$'\033[32m'; GEEL=$'\033[33m'; GRIJS=$'\033[90m'; UIT=$'\033[0m'

# ── De tabel ──────────────────────────────────────────────────────
# bestand @@ zoek @@ vervang @@ test @@ omschrijving
# Het bestandspad is relatief aan de repo-root.
MUTATIES=(
"public/pidlane-bt.js@@  if(!b || b.bron!=='gemeten' || !/^[0-9A-F]{2}$/@@  if(!b || b.bron==='standaard' || !/^[0-9A-F]{2}$/@@test-verbindprofiel.js@@het geheugen neemt een bijgestuurde ATST over als bodem: de ratel van #414, de CX-5 op 1020 ms"
"public/pidlane-bt.js@@      prof.verbind=plVerbindVoorGeheugen(this.profiel, this._gemeten, prof.verbind);@@      prof.verbind=JSON.parse(JSON.stringify(this.profiel));@@test-verbindprofiel.js@@het geheugen bewaart de bijgestuurde ATST in plaats van de koude meting — #414"
"public/pidlane-bt.js@@  v.st = gemeten ? Object.assign({}, gemeten) : { hex:ST_STANDAARD_HEX, bron:'standaard' };@@@@test-verbindprofiel.js@@het geheugen krijgt de ATST van de sessie mee in plaats van de meting — #414"
"public/pidlane-bt.js@@  if(!(gemeten && gemeten.bron==='gemeten') && vorig && vorig.st && vorig.st.bron==='gemeten') return JSON.parse(JSON.stringify(vorig));@@@@test-verbindprofiel.js@@een verbinding zonder meting wist de vorige meting uit het geheugen — #414"
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
"public/pidlane-kaart.js@@      var herstel = ['ATSH' + (K.bits === 29 ? '18DB33F1' : '7DF'), 'ATCRA', 'ATH0', 'ATAT1', @@      var herstel = ['ATCRA']; void [@@test-kaart.js@@de adapter blijft na de scan in scanstand staan"
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
"public/pidlane-veldlab.js@@    try{ download('pidlane-survey-'+plDatumLokaal(t0)+'.json',@@    try{ download('pidlane-survey-'+new Date(t0).toISOString().slice(0,10)+'.json',@@test-tijdklok.js@@een exportnaam bouwt zichzelf weer op de UTC-klok (#112)"
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
"worker.js@@          const r1 = await atHaal(env, \"klanten\", id);\n          if (!r1) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const r1 = r0;\n          const huidig@@test-bijboeken.js@@bijboeken rekent met de lezing van vóór het slot in plaats van een verse"
"worker.js@@      if (uitkomst.bezet)\n        return json({ ok: false, code: \"saldo_bezet\", error: \"Er loopt al een andere tegoedwijziging voor deze klant. Probeer het zo nog eens.\" }, 409);@@@@test-bijboeken.js@@een bezet saldo-slot laat het bijboeken toch doorlopen"
"worker.js@@      if (!email)\n        return json({ ok: false, code: \"saldo_geen_email\", error: \"Deze klant heeft geen e-mailadres; het tegoed kan niet veilig gewijzigd worden.\" }, 409);@@@@test-bijboeken.js@@bijboeken zet het slot op een leeg e-mailadres in plaats van te weigeren"
"admin/beheer.html@@  if(code === 'saldo_bezet')@@  if(code === 'saldo_bezet_oud')@@test-bijboeken.js@@beheer.html kent de code voor een bezet saldo-slot niet meer"

# ── saldo ZETTEN door hetzelfde slot (03-09-2026, #93) ──
"worker.js@@          if (saldoWas !== null && huidig !== saldoWas)@@          if (saldoWas !== null && huidig === saldoWas)@@test-bijboeken.js@@de voorwaarde bij saldo zetten staat omgekeerd: een verschoven saldo wordt juist overschreven"
"worker.js@@          const z1 = await atHaal(env, \"klanten\", id);\n          if (!z1) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const z1 = z0;\n          const huidig@@test-bijboeken.js@@saldo zetten vergelijkt met de lezing van vóór het slot in plaats van een verse"
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
"worker.js@@    naam: \"Kasboek (tokenmutaties)\", motor: \"d1\", d1: \"kasboek\", at: \"kasboek\",@@    naam: \"Kasboek (tokenmutaties)\", motor: \"d1\", d1: \"klanten\", at: \"kasboek\",@@test-adminbron.js@@de kasboekbron leest de klantentabel; \"leeg\" ziet er hetzelfde uit als \"niets gebeurd\" (#83)"
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
"package.json@@  \"version\": \"3.2.0\",@@  \"version\": \"3.3.0\",@@test-playteksten.js@@de afvinklijst bevestigt een versienummer dat niet meer gebouwd wordt"
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
"worker.js@@  const verboden = (b.def.beschermd || []).concat(b.def.geheim || []);@@  const verboden = [];@@test-adminbron.js@@Saldo en PassHash zijn hierlangs tóch te schrijven, buiten het saldoslot om"
# Het anker draagt de laatste commentaarregel mee: sinds het kasboek erbij
# kwam (#83) staat "schrijven: false" twee keer in ADMIN_BRONNEN, en dan bouwt
# een korter anker niets meer na.
"worker.js@@bedoeld. Wijzigen doe je op de configkaart.\n    schrijven: false,@@bedoeld. Wijzigen doe je op de configkaart.\n    schrijven: true,@@test-adminbron.js@@AppConfig is hierlangs te schrijven, langs de sleutelkeuring en de JSON-opslag van /api/config heen"

# ── een klant aanmaken vanuit het beheer (04-09-2026) ──
"worker.js@@      if (await klantZoek(env, email))\n        return json({ ok: false, error: \"Dit e-mailadres is al geregistreerd.\" }, 409);@@@@test-klant-aanmaken.js@@hetzelfde adres levert een tweede klantrij op: login pakt de eerste, jij boekt op de tweede bij"
"worker.js@@      if (pass) velden.PassHash = await hashPassword(pass, env);@@      if (pass) velden.PassHash = pass;@@test-klant-aanmaken.js@@het wachtwoord gaat ruw naar Airtable in plaats van gehasht"
"worker.js@@  if (actie !== \"opruimen\" && actie !== \"aanmaken\" && !/^rec[A-Za-z0-9]{14}$/.test(id))@@  if (false)@@test-klant-aanmaken.js@@de uitzondering op de id-eis is te ruim: bijboeken zonder id wordt een PATCH op niets"

# ── De escaping naar Airtable en naar de HTML van de expert (#142, 08-09-2026).
# Allebei dezelfde vorm: er stáát een wachter, maar hij dekt net niet alles af.
# Dat is het soort fout dat groen blijft staan, want de gewone invoer gaat er
# gewoon doorheen — alleen de rand niet.
"worker.js@@  return \"%\" + String(q).replace(/[\\\\%_]/g, (t) => \"\\\\\" + t) + \"%\";@@  return \"%\" + String(q) + \"%\";@@test-formule-escape.js@@een % of _ in het zoekvak van beheer vindt elke rij in plaats van wat er staat (sinds #327 de opvolger van #142)"
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
# ── Opnieuw verbinden uit het verbindingspaneel (#302, 26-09-2026) ──
"public/pidlane-adapter.js@@      await handleConnect();@@      await Promise.resolve();@@bproef-adapterpaneel.js@@Opnieuw verbinden hervat bovenop een open verbinding in plaats van eerst te verbreken"
"public/pidlane-adapter.js@@        localStorage.setItem('pl_selectie', JSON.stringify({ pids: [...activePIDs], t: Date.now() }));@@        void 0;@@bproef-adapterpaneel.js@@Opnieuw verbinden bewaart de selectie niet: de hervatstand kan de standaardset van 26 PIDs terugzetten"
"public/pidlane-adapter.js@@    if (nu >= 150 && nu >= min * 1.6) return@@    if (nu >= 150 && nu >= min * 2) return@@test-adapterpaneel.js@@de aanwijzing komt pas bij een verdubbeling en mist de 150 → 272 ms van de rit van 26-09"
# ── Oplevering 26-09: tien punten uit de proefrit (#300) ──
# Elke regel is een fout die bij dit werk echt gemaakt had kunnen worden, en
# die niemand ziet tot hij in de auto zit.
"public/pidlane-archief.js@@  try{ const x=_plBovensteSluitKnop(); if(x){ x.click(); return true; } }@@  try{ const x=null; if(x){ x.click(); return true; } }@@bproef-terugknop.js@@de terugknop kent weer alleen de vaste lijst: de waakronde en de bulkvensters gaan er niet mee dicht"
# (Geen mutatie op de z-index-vergelijking in _plBovensteSluitKnop: nagemeten
# op 26-09-2026 dat die bij overlappende vensters nooit beslist — een ✕ onder
# een ander venster valt al af op elementFromPoint(). bproef-terugknop.js 2b
# toetst het gelijke-z-geval wel, als gedrag.)
"public/pidlane-correlatie.js@@if(rest>0){ uit.push(_bevLaatst[id]);@@if(rest>BEV_MIN_MS){ uit.push(_bevLaatst[id]);@@test-bevindingen.js@@een bevinding die weer goed is verdwijnt meteen: één seconde in beeld, zoals vóór 26-09"
"public/pidlane-credits.js@@    chipTonen: false,@@    chipTonen: true,@@test-tokenchip.js@@de zwevende tokenteller hangt weer in beeld bij klanten"
"public/pidlane-auth.js@@  try{ const md=window.PLMeetdienst; if(md && typeof md.stop==='function') await binnen(md.stop()); }@@  try{ }@@test-afmelden.js@@Sluit de app laat de meetdienst draaien: het proces en de BT-socket blijven leven na exitApp()"
"public/pidlane-graph.js@@  w.classList.toggle('buiten', !ok);@@  w.classList.toggle('buiten', false);@@bproef-grafiek.js@@een waarde buiten het normaalbereik staat in de grafiek niet meer in het rood"
"public/pidlane-graph.js@@const GR_MAX = 3;@@const GR_MAX = 6;@@bproef-grafiek.js@@een groep zet weer zes lijnen in de grafiek in plaats van hoogstens drie"
"public/pidlane-totalcheck.js@@  if(!nu.has(sit)) mis.push(@@  if(false) mis.push(@@bproef-systeemtest.js@@de systeemtest kijkt niet meer naar de situatie: rijtests meten en falen tijdens stilstand"
"public/pidlane-totalcheck.js@@if(t.sit==='koud' && koudBijStart===false)@@if(false)@@bproef-systeemtest.js@@de koude-starttest blijft op een warme motor eeuwig wachten in plaats van eerlijk niet getest te heten"
"public/pidlane-bulk.js@@  _blkEl('blkAna').onclick   = function () {@@  _blkEl('blkAna').onclick   = function () { return;@@bproef-vensters.js@@de knop Analyse in de bulk-recorder doet niets: de bulk-analyse is dan nergens meer te openen"
"public/pidlane-btflow.js@@b.style.cssText='position:fixed;bottom:calc(10px + var(--pl-sab,0px) + var(--pl-nav-h,0px));@@b.style.cssText='position:fixed;bottom:10px;@@bproef-schermranden.js@@de balk van de scenariotest valt weer achter de Android-knoppen"
"public/pidlane-sppproef.js@@bottom:calc(12px + var(--pl-sab,0px));z-index:9000;@@bottom:12px;z-index:9000;@@bproef-schermranden.js@@de uitslag van de SPP-proef zakt weer achter de knoppenbalk: de drukste draden zijn onleesbaar (#302)"
# ── De tests gaan mee naar app.pidlane.nl (26-09-2026) ──
# public/.assetsignore houdt 2,3 MB aan tests van de site af. Te smal en een
# testsoort staat alsnog openbaar; te breed en een module van de app wordt niet
# geüpload. Allebei stil tot het live staat.
"public/.assetsignore@@bproef-*.js@@bproef-*.txt@@test-assetsignore.js@@de browserproeven gaan weer mee online"
"public/.assetsignore@@test-*.js@@test-*.js\npidlane-t*.js@@test-assetsignore.js@@een patroon te breed: pidlane-testrun.js en pidlane-theme.js worden niet geüpload"
# ── Een pagina wijst naar een bestand dat er niet is (26-09-2026) ──
# index.html wees maandenlang naar vier iconen die nooit bestaan hebben: vier
# 404's per paginalading, onzichtbaar tot het pre-launch-rapport van Play.
"public/index.html@@<link rel=\"apple-touch-icon\" href=\"apple-touch-icon.png\">@@<link rel=\"apple-touch-icon\" href=\"apple-touch-icon-180.png\">@@test-verwijzingen.js@@index.html wijst naar een icoon dat niet bestaat"
"public/manifest.webmanifest@@\"sizes\": \"192x192\"@@\"sizes\": \"144x144\"@@test-verwijzingen.js@@het manifest belooft een maat die het icoon niet heeft"
# ── §14 belooft iets wat §3 niet kent (10-09-2026) ──
# De release notes zijn een ingedikte §3, met de hand. Een functie erbij zetten
# zonder hem in de beschrijving te noemen is precies de vorm die §16 de kop
# kostte: twee velden die een reviewer allebei leest, met verschillende
# beloftes. Het valt niemand op tot het in de Console staat.
"PLAY-INZENDING.md@@Met slim visueel en telemetrie.@@Met slim visueel en wielophangingsscanner.@@test-playteksten.js@@de release notes beloven een functie die de beschrijving niet opsomt"
# En andersom: §3 hernoemt een functie, §14 blijft de oude naam beloven. Dat is
# de stillere van de twee — je verbetert de beschrijving en raakt het veld
# ernaast niet aan.
"PLAY-INZENDING.md@@• Slim visueel — de belangrijkste@@• Dashboardweergave — de belangrijkste@@test-playteksten.js@@§3 hernoemt een functie en §14 belooft de oude naam nog"
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
# verbinding, dan gaat het bestand daarom rechtstreeks naar een map — sinds
# 27-09 ook zonder, zodat txt en PDF hetzelfde doen. Fouten die geen
# foutmelding geven maar een herverbinding, een venster of een zoekgeraakt
# bestand.
"public/pidlane-motortype.js@@  const pad=await nativeSchrijfDirect(blob,name);@@  const pad=_plVerbindingStaat()?await nativeSchrijfDirect(blob,name):null;@@test-opslagroute.js@@zonder verbinding opent weer de deelkaart: de txt-knoppen doen iets anders dan de PDF-exports (27-09)"
"public/pidlane-motortype.js@@  const pad=await nativeSchrijfDirect(blob,name);@@  const pad=null;@@test-opslagroute.js@@de deelkaart gaat weer open tijdens een rit: elke export kost een herverbinding (#132)"
"public/pidlane-motortype.js@@    if(typeof demoMode!=='undefined' && demoMode) return false;@@@@test-opslagroute.js@@demo telt als verbinding: het logboek beweert dat er een socket gespaard is die er niet is"
"public/pidlane-motortype.js@@  if(pad){@@  if(true){@@test-opslagroute.js@@een mislukt rechtstreeks schrijven meldt succes: het bestand landt nergens en niemand ziet het"

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

# De bugmelding (30-09-2026). Het record en de mail gaan buiten _plVinVoorLog
# om de deur uit; een "handige" VIN erbij voor support is de fout die past.
"public/pidlane-auth.js@@  d.vin=await _plVinVoorLog(v.vin);@@  d.vin=String(v.vin||'');@@test-bugmelding-vin.js@@de bugmelding stuurt en toont het chassisnummer ruw in plaats van het pseudoniem"
"public/pidlane-auth.js@@'Voertuig: '+d.voertuig+@@'Voertuig: '+d.voertuig+' '+String((vehicleInfo||{}).vin||'')+@@test-bugmelding-vin.js@@de mail-terugval zet het chassisnummer achter het voertuig"

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

# ── 28-09-2026: groep 4–6 en onvolledige antwoorden (#333). De fouten die de
# automaat stil boven de 3 laten komen, een onvolledig antwoord weer als goed
# laten tellen, of de groepsproef iets anders laten meten dan hij zegt.
"public/pidlane-plload.js@@    oordeel: gekregen===0 ? 'leeg' : (mistBekend.length ? 'onvolledig' : 'goed')@@    oordeel: gekregen===0 ? 'leeg' : 'goed'@@test-groepsgrootte.js@@een antwoord met 4 van de 6 PIDs telt weer als geslaagd (#211)"
"public/pidlane-plload.js@@    return typeof w==='number' && w>0 && (t-w)<GROEP_BEKEND_MS;@@    return typeof w==='number' && w>0;@@test-groepsgrootte.js@@een PID van de auto van een uur geleden telt bij deze auto als bekend en laat de groep krimpen"
"public/pidlane-plload.js@@  if(n<GROEP_ONVOL_DREMPEL || groep<=GROEP_ONVOL_BODEM) return false;@@  if(n<GROEP_ONVOL_DREMPEL) return false;@@test-groepsgrootte.js@@onvolledige antwoorden laten de groep doorzakken naar 1 en verdrievoudigen het aantal verzoeken"
"public/pidlane-plload.js@@  if(groep!==_groepVensterN){ _groepVenster=[]; _groepVensterN=groep; }@@  _groepVensterN=groep;@@test-groepsgrootte.js@@groep 3 krimpt op wat groep 4 misdeed"
"public/pidlane-plload.js@@  if(Date.now()>=_groepHoudTot) PLBus.batchGroter();@@  PLBus.batchGroter();@@test-groepsgrootte.js@@na een krimp klimt de groep binnen seconden terug en schommelt hij op een kloon tussen 2 en 3"
"public/pidlane-plload.js@@          if(oordeel.oordeel==='onvolledig') _groepTel(true, oordeel);@@          if(false) _groepTel(true, oordeel);@@bproef-groepsproef.js@@de pollus ziet onvolledige antwoorden niet en blijft op groep 3 met een kloon die de laatste PID laat vallen"
"public/pidlane-data.js@@    const max=vast ? this.GROEP_HAND_MAX : this.GROEP_AUTO_MAX;@@    const max=this.GROEP_HAND_MAX;@@test-groepsgrootte.js@@terug naar de automaat laat de groep op 6 staan"
"public/pidlane-data.js@@    if(S.batchGroep>=this.batchPlafond()) return false;@@    if(S.batchGroep>=this.GROEP_HAND_MAX) return false;@@test-groepsgrootte.js@@de automaat klimt zelf naar groep 6 zonder dat een rit dat bewees"
"public/pidlane-adapter.js@@    for (let i = 1; i < schoon.length; i++) if (schoon[i].pidsPerSec >= best.pidsPerSec * 1.05) best = schoon[i];@@    for (let i = 1; i < schoon.length; i++) if (schoon[i].pidsPerSec >= best.pidsPerSec) best = schoon[i];@@test-groepsgrootte.js@@de groepsproef adviseert een grotere groep voor een winst binnen de meetruis"
"public/pidlane-adapter.js@@        schoon: onvolPct <= 2 && leegPct === 0 && p.echo === 0,@@        schoon: leegPct === 0,@@test-groepsgrootte.js@@de groepsproef adviseert een groep die PIDs verliest of frames herhaalt"
"public/pidlane-adapter.js@@      tok = await PLBus.wait('groepsproef', GP_BUS_WACHT_MS);@@      tok = -1;@@bproef-groepsproef.js@@de groepsproef meet dwars door de pollus heen in plaats van met de bus vast"
"public/pidlane-adapter.js@@        if (typeof plMarkeer === 'function') plMarkeer('groepsproef klaar',@@        if (typeof plMarkeer === 'function') plMarkeer('groepsproef',@@bproef-groepsproef.js@@de groepsproef zet een andere markering dan de meetopdracht voor #333 verwacht, en die blijft voor altijd op nog niet"
"public/pidlane-adapter.js@@    if (!uit.afgebroken) {\n      try {\n        if (typeof plMarkeer@@    if (true) {\n      try {\n        if (typeof plMarkeer@@bproef-groepsproef.js@@een afgebroken groepsproef telt voor de meetopdracht als gedraaid"

# Het antwoordcijfer op groepsverzoeken (#302). Een ELM met ATAT1 zit na elk
# groepsantwoord zijn geleerde wachttijd uit; het cijfer slaat die over. De
# fouten die ertoe doen: het cijfer te vroeg of te laag zetten (dan kapt de
# adapter een antwoord af), het niet meer bijleren, of het niet meer sturen —
# dat laatste is precies de toestand van vóór 28-09 en die is onzichtbaar.
"public/pidlane-plload.js@@      if(!e || e.zeker<ANTWOORDTAL_LEER || !(e.n>=1 && e.n<=15)) return basis;@@      if(!e || !(e.n>=1 && e.n<=15)) return basis;@@test-antwoordtal.js@@het cijfer gaat mee na één antwoord, voordat bekend is of er een tweede ECU meepraat"
"public/pidlane-plload.js@@      else if(f>e.n){ e.n=f; e.zeker=1; }@@      else { e.n=f; e.zeker=1; }@@test-antwoordtal.js@@één antwoord met een ontbrekende PID verlaagt het cijfer, en het volgende antwoord wordt afgekapt"
"public/pidlane-plload.js@@        if(e && oordeel!=='goed' && /41[0-9A-F]{2}/i.test(String(raw||''))){@@        if(false){@@test-antwoordtal.js@@een cijfer dat antwoorden afkapt blijft staan"
"public/pidlane-plload.js@@      if(++e.sinds>=ANTWOORDTAL_HERIJK){ e.sinds=0; return basis; }@@      ++e.sinds;@@test-antwoordtal.js@@het cijfer wordt nooit meer nagemeten, en een ECU die later meepraat wordt afgekapt"
"public/pidlane-plload.js@@    if(/^[0-9A-Fa-f]{4,}$/.test(hex)) n++;       // data; \"008\" (3 tekens) is een lengte@@    if(/^[0-9A-Fa-f]{3,}$/.test(hex)) n++;@@test-antwoordtal.js@@de lengteregel telt als frame en het cijfer is één te hoog, zodat de adapter alsnog zijn wachttijd uitzit"
"public/pidlane-plload.js@@          const cmd=PLAntwoordtal.cmd(basis);@@          const cmd=basis;@@bproef-antwoordtal.js@@de pollus stuurt het geleerde cijfer niet mee en de responstijd loopt weer op zoals in #302"

# SPP-antwoorden per event (#302). De browserproeven vervangen _sendBTOnce
# helemaal, dus alleen test-sppevents.js ziet deze laag. De fouten die ertoe
# doen: het eventpad niet gebruiken (terug op 50 ms per commando), na een
# herverbinding op een socket blijven wachten die geen events meer stuurt, een
# SEARCHING afkappen, of nooit terugvallen naar pollen.
"public/pidlane-bt.js@@      if(await _sppEventsKlaar(spp,address)) return await _sppVraagEvent(spp,address,cmd,str,TIMEOUT,myGen);\n@@@@test-sppevents.js@@de SPP-tak pollt weer elke 50 ms en elk commando kost minstens 50 ms"
"public/pidlane-bt.js@@function _sppNieuweSocket(){ window._sppSocketNr=(window._sppSocketNr||0)+1; _sppEv.aan=false; }@@function _sppNieuweSocket(){ }@@test-sppevents.js@@na een herverbinding wacht de app op events van een socket waar ze niet aan staan"
"public/pidlane-bt.js@@    if(!searchExtended && buf.includes('SEARCHING')){ searchExtended=true; deadline=start+13000; continue; }@@    if(false){ }@@test-sppevents.js@@een protocolzoektocht wordt na de gewone deadline afgekapt en het antwoord erna gaat verloren"
"public/pidlane-bt.js@@    if(_sppEv.missers>=SPP_EV_MISSERS) await _sppEventsUit(@@    if(false) await _sppEventsUit(@@test-sppevents.js@@een toestel dat geen events aflevert valt nooit terug naar pollen en elk commando loopt in de time-out"
"public/pidlane-bt.js@@  if(_sppEv.uitVoor===teken) return false;@@  if(false) return false;@@test-sppevents.js@@een plugin die startNotifications weigert, krijgt die vraag vóór elk commando opnieuw"
# De opruimread alleen na een onnette ronde (01-10-2026): weer elke keer
# flushen kost een brugrondgang per commando, nooit meer flushen laat een half
# laat antwoord aan het volgende plakken.
"public/pidlane-bt.js@@  if(_sppEv.vuil || _sppAltijdFlush()){@@  if(true){@@test-sppevents.js@@vóór elk commando weer een read() over de brug, ook als er niets te ruimen is"
"public/pidlane-bt.js@@    _sppEv.vuil=true;   // de rest van dit antwoord kan nog onderweg zijn@@    // weg@@test-sppevents.js@@na een time-out wordt er niet geruimd en plakt de rest van het late antwoord aan het volgende commando"

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
"public/pidlane-auth.js@@    const bericht=mailUit(String(message||'')+(staart.length?' · '+staart.join(' '):''));@@    const bericht=mailUit(String(message||''));@@test-livelog.js@@de context achter het bericht valt weer weg — precies de stille fout van vóór vandaag"
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
"public/pidlane-auth.js@@_atNoteer(false,resp.status,batch.length,reden||('HTTP '+resp.status));@@_atNoteer(true,resp.status,batch.length,reden||('HTTP '+resp.status));@@test-livelog.js@@een geweigerde batch wordt als geslaagd vastgelegd — precies de fout die de hele log platlegt, nu met groen ervoor"
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
"public/pidlane-pids.js@@  return uit.concat(pool.slice(0,vrij).map(k=>k.pid));@@  return uit.concat(pool.map(k=>k.pid));@@test-overzicht.js@@Overzicht geeft elke bewegende tegel een trendlijn: het maximum van vier is weg en het tekenwerk van Trends terug (#302)"
"public/pidlane-pids.js@@  const pool=kand.filter(k=>uit.indexOf(k.pid)<0 && k.score>SLIM_BEWEEG_DEEL)@@  const pool=kand.filter(k=>uit.indexOf(k.pid)<0)@@test-overzicht.js@@een sensor die stil ligt krijgt toch een trendlijn: een rechte streep die een plek van vier inneemt"
"public/pidlane-pids.js@@  if(_sparkGepland) return;\n  _sparkGepland=true;@@  _sparkGepland=true;@@test-overzicht.js@@elke meetwaarde plant zijn eigen tekenbeurt: zestig per seconde in plaats van vier (#302)"
"public/pidlane-pids.js@@    if(!svg || !svg.getClientRects || svg.getClientRects().length===0) return;@@    if(!svg) return;@@test-overzicht.js@@trendlijnen die niet in beeld zijn worden toch getekend"
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
"public/pidlane-auth.js@@  try{ if(typeof connected!=='undefined' && connected) await binnen(handleConnect()); }@@  try{ }@@test-afmelden.js@@Sluit de app sluit met een open verbinding: de sessie wordt niet bewaard en de adapter blijft bezet"
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
"public/pidlane-motortype.js@@  if(bf.includes('elektr') || mt.includes('elektr') || /\\bb?ev\\b/.test(mt)) return 'ev';@@  if(bf.includes('elektr') || mt.includes('elektr') || mt.includes('ev')) return 'ev';@@test-hybridebasis.js@@'ev' telt weer als stukje woord: \"Revolution\" heet een elektrische auto"
"public/pidlane-motortype.js@@  if(bf.includes('hybr') || mt.includes('hybr') || /\\b(p|m)?hev\\b/.test(mt)) return 'hybride';@@  if(bf.includes('hybr') || mt.includes('hybr')) return 'hybride';@@test-hybridebasis.js@@een motornaam met HEV of PHEV wordt niet meer als hybride herkend (Kia, Hyundai, Honda e:HEV)"
"public/pidlane-totalcheck.js@@  else if(et!=='ev') g.add('benzine');@@  else if(et==='benzine') g.add('benzine');@@test-hybridebasis.js@@een hybride verliest de benzinetests weer, terwijl hij een benzinemotor heeft"
"public/pidlane-totalcheck.js@@  if(bscMotorTest(t) && !nu.has('motorstabiel')){@@  if(false){@@test-hybridebasis.js@@motortests meten weer zonder draaiende motor: misfire op accurijden geeft twijfel op een gezonde hybride"
"public/pidlane-totalcheck.js@@  return venster.length>=3 && venster.every(x=>typeof x.v==='number' && x.v>400);@@  return venster.length>=3;@@test-hybridebasis.js@@de wachttijd na een motorstart is weg: de basislijn loopt weer over de aanloop"
"public/pidlane-totalcheck.js@@  if(hist[0].t>van) return false;   // de historie reikt niet ver genoeg terug@@@@test-hybridebasis.js@@een motor die net aansloeg heet meteen stabiel zolang er nog geen 6 s historie is"
"public/pidlane-data.js@@{id:'misfire', sit:'constant', motor:true,@@{id:'misfire', sit:'constant',@@test-hybridebasis.js@@de misfire-test mag weer meten terwijl de auto op de accu rijdt"
"public/pidlane-visueel.js@@  if(elektrisch && heeftVraag) return 'vermogen';@@  if(false) return 'vermogen';@@test-visueel.js@@een hybride houdt de toerennaald die op 0 staat terwijl hij 50 rijdt (#432)"
"public/pidlane-visueel.js@@const VRAAG_KETEN = ['015A','0149','014A'];@@const VRAAG_KETEN = ['015A','0149','014A','0111'];@@test-visueel.js@@de gasklep telt als vermogensvraag: op de accu optrekken staat dan op nul"
"public/pidlane-visueel.js@@  if(leer.min===null || leer.min===undefined || n<leer.min) leer.min=n;@@  if(leer.min===null || leer.min===undefined) leer.min=0;@@test-visueel.js@@de rustwaarde van het pedaal wordt niet geleerd: 0149 staat stil op 25% vraag"
"public/pidlane-visueel.js@@  if(b.v<VERMOGEN.LAAD_MIN_KMH) return 0;@@@@test-visueel.js@@de laadzone slaat uit bij het laatste stukje stilvallen, waar niets meer terugwint"
"public/pidlane-visueel.js@@  if(heeftV && vraag>VERMOGEN.RUST){@@  if(heeftV && vraag>VERMOGEN.RUST && !(heeftL && laad>0)){@@test-visueel.js@@vertragen wint van gas geven: de naald slaat naar laden terwijl je optrekt na een bocht"
"public/pidlane-visueel.js@@  if(heeftVraag) return 'vermogen';\n  return null;@@  return null;@@test-visueel.js@@zonder toerental weer geen naald, ook als het pedaal er is"
"public/pidlane-visprofiel.js@@  if(elektrisch(motor) && p.hybride) return p.hybride.plekken;\n@@@@test-visprofiel.js@@een hybride krijgt weer de benzine-Neon: toerental 0 in het midden terwijl hij 50 rijdt (#435)"
"public/pidlane-visprofiel.js@@function standaard(motor){ return elektrisch(motor) ? 'motor' : 'basis'; }@@function standaard(motor){ return 'basis'; }@@test-visprofiel.js@@een hybride opent weer op de toerennaald in plaats van de energieweergave"
"public/pidlane-visprofiel.js@@  if(stand && stand.laden) return 'Laden';\n@@@@test-visprofiel.js@@terugwinnen met draaiende motor heet 'Motor': het moment waar een hybride om draait is onzichtbaar"
"public/pidlane-visprofiel.js@@    if(x.soort==='energie' || x.soort==='afgeleid') return;\n@@@@test-visprofiel.js@@de ruwe pedaalwaarde overschrijft de energiering: in rust staat hij op 15% vraag"
"public/pidlane-onderzoek.js@@    if (ks.indexOf('controle') >= 0 && /diesel/i.test(String(ctx.brandstof || '')))@@    if (false)@@test-onderzoek.js@@een diesel zonder klacht wordt niet op roetfilter en EGR gecontroleerd (#434)"
"public/pidlane-onderzoek.js@@      h: ['valselucht', 'maf', 'lambda', 'kat', 'thermostaat', 'accu', 'laad', 'misfire'] }@@      h: ['valselucht', 'maf', 'lambda', 'thermostaat', 'accu', 'laad', 'misfire'] }@@test-onderzoek.js@@de brede ronde slaat de katalysator over: zonder klacht een gat in de controle"
"public/pidlane-foutcodes.js@@    else if (o.kleur === 'groen' && window.PLOnderzoek)@@    else if (false)@@test-onderzoek.js@@bij een groene check is er weer geen weg naar het onderzoek (#434)"
"public/pidlane-visueel.js@@  else if(toestand==='DRAAIT_RIJDT') uit.rijMs+=dt;@@  else uit.rijMs+=dt;@@test-visueel.js@@stilstaan voor het stoplicht telt als rijden: het EV-aandeel zakt bij elke stop (#437)"
"public/pidlane-visueel.js@@  const dt=(st && typeof st.t==='number') ? Math.max(0, Math.min(5000, nu-st.t)) : 0;@@  const dt=(st && typeof st.t==='number') ? Math.max(0, nu-st.t) : 0;@@test-visueel.js@@tien minuten op de achtergrond tellen als tien minuten elektrisch rijden"
"public/pidlane-visueel.js@@  if(toestand==='ACCU_RIJDT' && typeof kmh==='number' && isFinite(kmh) && kmh>0){@@  if(typeof kmh==='number' && isFinite(kmh) && kmh>0){@@test-visueel.js@@km met de motor aan tellen mee in het accubereik: het accubereik wordt veel te groot"
"public/pidlane-visueel.js@@  return Math.round((b.v-a.v)/dt*10)/10;@@  return Math.round((a.v-b.v)/dt*10)/10;@@test-visueel.js@@de versnelling staat andersom: remmen heet optrekken"
"public/pidlane-visueel.js@@  return { totaal:Math.round((b||0)+(e||0)),@@  return { totaal:Math.round(b||e||0),@@test-visueel.js@@het bereik telt brandstof of accu, niet allebei"
"public/pidlane-visprofiel.js@@    if(x.soort==='energie' || x.soort==='afgeleid') return;@@    if(x.soort==='energie') return;@@test-visprofiel.js@@de ruwe snelheid overschrijft de tegel van de versnelling"
"public/pidlane-pids.js@@  if(motor==='hybride') return ['rijden','elektrisch','motor',@@  if(motor==='hybride') return ['rijden','motor','elektrisch',@@test-overzicht.js@@een hybride leest weer eerst de motor: de aandrijfaccu staat onderaan (#439)"
"public/pidlane-pids.js@@const OVZ_PID_CAT = { '010F':'temp' };@@const OVZ_PID_CAT = {};@@test-overzicht.js@@inlaatlucht staat weer onder Motor in plaats van bij de temperaturen"
"public/pidlane-pids.js@@  const heeft=!!d && (typeof d.wL==='number' || typeof d.wH==='number');@@  const heeft=!!d;@@test-overzicht.js@@een sensor zonder bekende grens krijgt toch een groen vlak: de band beweert normaal zonder grond"
"public/pidlane-pids.js@@    return sa!==sb ? sa-sb : ovzRang(a, ord)-ovzRang(b, ord);@@    return ovzRang(a, ord)-ovzRang(b, ord);@@test-overzicht.js@@een afwijkende sensor blijft onderaan zijn kaart staan"
"public/pidlane-pids.js@@  if(hoog!==null) return 'Boven de '+ernst+' van '+f(hoog)+e;@@  if(hoog!==null) return '';@@test-overzicht.js@@te warm koelwater wordt oranje zonder te zeggen waarom"
"public/pidlane.css@@grid-template-columns:minmax(min(6.6em,34%),1fr) minmax(0,24%) 4.8em 40px 24px;@@grid-template-columns:minmax(0,1fr) 24% 86px 40px 24px;@@bproef-overzicht.js@@in Compact wijkt de naam weer voor de band: bij tekstgrootte L op 384 px staat er Sne… en Toe…"
"public/pidlane-pids.js@@    if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) return;@@    void 0;@@bproef-overzicht.js@@telemetrie staat weer in Overzicht: vier rijen met een streepje onder Rijden"
"public/pidlane-dashboard.js@@.filter(function(d){ return op.indexOf(d.pid)<0 && !telefoon(d.pid) && @@.filter(function(d){ return op.indexOf(d.pid)<0 && @@bproef-overzicht.js@@telemetrie is weer te kiezen als tegel op het Slim-dashboard"
"public/pidlane-banden.js@@(mist && mist.temp.indexOf(p) >= 0 ? 'geen temp.' : '')@@''@@bproef-banden.js@@een band zonder temperatuursensor toont weer een los punt voor zijn afwijking"
"public/pidlane-banden.js@@      if (POS.some(p => ind[p][k])) POS.forEach(@@      POS.forEach(@@test-banden.js@@een auto zonder bandtemperatuur krijgt bij alle vier de banden geen temp. en een melding dat hij ontbreekt"
"public/pidlane-pids.js@@  '0108':'Trim kort B2', '0109':'Trim lang B2', '0124':'Lambda B1S1',@@  '0108':'Trim kort B2', '0109':'Trim lang B2', '0124':'Lambda B1S1', '0106':'Brandstoftrim kort B1', '0107':'Brandstoftrim lang B1',@@test-overzicht.js@@de brandstoftrims krijgen weer hun lange naam: drie rijen 'Brandsto…' onder elkaar"
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
"public/pidlane-veldlab.js@@    log=function(msg,type){ _plOrigLog.apply(this,arguments); _plEvalCapture(msg,type); };@@    log=function(msg,type){ _plOrigLog(msg,type); _plEvalCapture(msg,type); };@@bproef-meetketen.js@@de omhulling van het veldlab laat het derde argument weer vallen: geenAirtable komt nooit aan en elke harde-limietmelding staat weer twee keer in D1 (#256)"

# ── Voorwaarden en het driewaardige oordeel (#257, 18-09-2026). Negen van de
# twintig LET OP-regels van 18-09 gingen niet over de auto maar over
# omstandigheden die er niet waren. Deze vijf halen dat onderscheid weer weg.
"public/pidlane-opdracht.js@@    var mist = vw.filter(function (v) { return v.vervuld !== true; });@@    var mist = [];@@test-opdrachtvoorwaarden.js@@de voorwaarden tellen niet meer mee: een rit met een koude motor heet weer gesloten"
"public/pidlane-opdracht.js@@    var stil = uit.filter(function (u) { return u.staat === 'LET OP'; });@@    var stil = [];@@test-opdrachtvoorwaarden.js@@een PID die niet gemeten is heet weer een bevinding: niet-gemeten en buiten-de-band zijn weer één ding"
"public/pidlane-opdracht.js@@          catch (e) { console.warn('Opdracht: de stapcontrole gaf een fout (#257)', e); gezien = null; }@@          catch (e) { console.warn('Opdracht: de stapcontrole gaf een fout (#257)', e); gezien = false; }@@test-opdrachtvoorwaarden.js@@een stapcontrole die stukgaat leest als \"de stap is niet gezet\" — niet-na-te-gaan wordt weer stil niet-gedaan (#227)"
"public/pidlane-opdracht.js@@    if (SCHEMAS.indexOf(o.schema) === -1)@@    if (o.schema !== SCHEMA)@@test-opdrachtvoorwaarden.js@@de hele voorraad van schema 1 wordt afgekeurd en elke rit kost eerst een nieuwe rij in de tabel"
"public/pidlane-opdracht.js@@(isApp ? 1 : 0) !== 1) {@@(isApp ? 1 : 0) === 0) {@@test-opdrachtvoorwaarden.js@@een voorwaarde met pid én stap komt erdoor, en dan meet de rit iets anders dan er op papier staat"

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
"public/pidlane-bt.js@@    if(vorig && _hervatActief()){@@    if(false){@@test-hervatten.js@@na een crash vraagt de app weer het kenteken: een tik tijdens het rijden (#229)"
"public/pidlane-bt.js@@  if(heeftAuto && selectedNetwork && selectedNetwork.auto && _hervatActief() && !window._plHervat.protocol){@@  if(false){@@test-hervatten.js@@na een crash moet het protocol weer met de hand bevestigd worden (#229)"
"public/pidlane-bt.js@@    window._plHervat.protocol = true;@@    void 0;@@test-hervatten.js@@elke hertekening start de protocolscan opnieuw: twee scans door elkaar op de bus (#229)"
"public/pidlane-bt.js@@          kentekenOverslaan();\n        }\n      }).catch(@@        }\n      }).catch(@@test-hervatten.js@@zonder bereik blijft een hervatting op het kentekenscherm hangen (#229)"
"public/pidlane-bt.js@@  window._plHervat = (opt && typeof opt.hervat === 'string') ? { t: Date.now(), reden: opt.hervat } : null;@@  window._plHervat = { t: Date.now(), reden: 'altijd' };@@test-herverbinden.js@@ook de knop slaat de vragen over: een andere auto krijgt het kenteken van gisteren (#229)"
"public/pidlane-auth.js@@  if(!vorige || !vorige.id || (Date.now()-(vorige.t||0))>=SESSIE_HERLAAD_MS) return null;@@  return null;@@test-sessiedoorloop.js@@na een crash begint weer een nieuwe sessie: de rit staat in twee stukken in de logtabel (#229)"
"public/pidlane-testrun.js@@  if (window._plDoorlopendeSessie) {@@  if (false) {@@test-sessiedoorloop.js@@de testrun negeert de doorlopende sessie: meetopdrachten na de crash krijgen een ander nummer dan de rest (#229)"
"public/pidlane-testrun.js@@    window._plDoorlopendeSessie = null;\n@@@@test-sessiedoorloop.js@@een nieuwe opdracht kiezen na een crash valt terug op het oude nummer: twee vragen onder een sessie (#229)"
"public/pidlane-pidgate.js@@  try{ localStorage.setItem('pl_selectie', JSON.stringify({ pids:[...nu], t:Date.now() })); }@@  try{ }@@test-sessiedoorloop.js@@de selectie wordt niet bewaard: na een crash staat de standaardset aan in plaats van wat er liep (#229)"
"public/pidlane-pidgate.js@@    if(!supportedPIDs.has(pid) && !inLijst.has(pid)) return;\n    if(!pidGate(pid,'kiesbaar')) return;\n    activePIDs.add(pid); manualPIDs.add(pid); n++;\n  });\n  plSelectieMeld(voor,'hervatten@@    if(!pidGate(pid,'kiesbaar')) return;\n    activePIDs.add(pid); manualPIDs.add(pid); n++;\n  });\n  plSelectieMeld(voor,'hervatten@@test-sessiedoorloop.js@@de teruggezette selectie neemt sensoren mee die deze auto niet heeft (#229)"
"public/pidlane-bt.js@@  if(!n){\n    bron='de standaardset';@@  if(false){\n    bron='de standaardset';@@test-sessiedoorloop.js@@een hervatting zonder bewaarde selectie zet nul sensoren aan: de meting staat stil, de fout van de eerste versie (#229)"
"public/pidlane.css@@padding:20px 18px calc(28px + var(--pl-sab));max-height:92vh@@padding:20px 18px 28px;max-height:92vh@@bproef-schermranden.js@@Start analyse valt weer half achter de Android-knoppenbalk (#286)"
"public/pidlane-theme.js@@  wcBind('wc-waak',()=>openWaakvenster());@@  wcBind('wc-waak',()=>{});@@bproef-vensters.js@@de kaart Waakronde doet niets: hij staat nergens meer, ook niet in het menu (#286)"
"public/pidlane-klant.js@@      ['admGroupBtn', 'admGroup', 'wc-bulkrec'].forEach(function (id) {@@      ['admGroupBtn', 'admGroup'].forEach(function (id) {@@bproef-vensters.js@@een klant ziet de bulk-recorder van beheer in de deur Live data (#286)"
"public/pidlane-archief.js@@  const vraagContext   = (window._plMeetcontext===null) && _plVoorvragenAan(opties);@@  const vraagContext   = (window._plMeetcontext===null);@@test-meetcontext.js@@de vier vragen komen weer vóór elke analyse in beeld, ook vóór de oorzakenlijst die alleen de klachttekst leest"
"public/pidlane-archief.js@@    window._srCtxDismiss=()=>{ gekozen._rap='nee'; done(false, true); };@@    window._srCtxDismiss=()=>{ gekozen._rap='nee'; done(false); };@@test-meetcontext.js@@terug of wegklikken vóór de analyse betekent weer ga door: de analyse en het tegoed lopen toch"
"public/pidlane-archief.js@@    if(!m){ m=_plMeetcontextUitMeting(); bron=@@    if(!m){ m={}; bron=@@test-meetcontext.js@@zonder vragen krijgt de AI niets meer over start/stop en gaten: een start/stop-stop leest weer als afslaan"
"public/pidlane-fuel.js@@    if(_ant && _ant.geannuleerd){@@    if(false){@@bproef-aanlevering.js@@een geannuleerde analyse wordt alsnog verstuurd"
"public/pidlane-fuel.js@@    if(e && e.plAfgebroken) throw e;                 // bewuste keuze van de gebruiker\n    console.warn('Eerdere rapporten@@    console.warn('Eerdere rapporten@@bproef-aanlevering.js@@de annulering wordt ingeslikt door de catch om de rapportenvraag heen en de analyse loopt door"
"public/pidlane-fuel.js@@    if(e && e.plAfgebroken){\n      contentEl.innerHTML=@@    if(false){\n      contentEl.innerHTML=@@test-analysestart.js@@een geannuleerde analyse krijgt een noodrapport alsof de AI stuk was"
"public/pidlane-fuel.js@@padding:10px 14px calc(10px + var(--pl-sab));background:linear-gradient(135deg,#161b2b@@padding:10px 14px;background:linear-gradient(135deg,#161b2b@@bproef-schermranden.js@@de balk AI analyseert valt weer achter de Android-knoppenbalk"
"public/pidlane-fuel.js@@    if(r.ok && recent){ resolve(true); return; }@@    if(r.ok){ resolve(true); return; }@@test-analysestart.js@@bij genoeg data gaat de analyse weer stil door: geen keuze tussen de meting van zojuist en nog even meten"
"public/pidlane-fuel.js@@          '<button class=\"mg-ter\" id=\"mgToch\">Toch doorgaan met wat er is</button>'+\n          '<button class=\"mg-ter\" id=\"mgAnnuleer\">Annuleren</button>'+@@          '<button class=\"mg-ter\" id=\"mgToch\">Toch doorgaan met wat er is</button>'+@@test-analysestart.js@@bij te weinig data is er weer alleen toch doorgaan en geen annuleren"
"public/pidlane-diagnose.js@@  if(!(await plVraagMeting('normaal', 'de uitwerking van \"'+causeName+'\"', false))) return;@@@@test-analysestart.js@@de AI-monteur werkt een oorzaak weer uit zonder meetscherm"
"schema.sql@@  Message       TEXT,@@  Bericht       TEXT,@@test-logschema.js@@een kolom in D1 hernoemd zonder de app mee te nemen: het berichtveld komt nergens meer aan"
# ── De logroute schrijft sinds #262 naar D1. Deze drie bouwen de fouten na
# die deze route al eens gemaakt heeft of makkelijk weer maakt, en ze gaan
# alle drie over hetzelfde: een mislukking die zich als succes voordoet. Die
# stond hier van 20-09 17:12 tot 22-09 live — `{ok:true}` met HTTP 200 terwijl
# er niets werd weggeschreven — en de proef in blok 5 die juist dat kanaal
# bewaakt keurde het goed. Een kanaal dat stil faalt is erger dan geen kanaal.
"worker.js@@async function handleLog(request, env) {\n  if (!await appTokenOk(request, env)) return json({ error: \"unauthorized\" }, 401);@@async function handleLog(request, env) {\n  return json({ ok: true, status: \"logging_paused\" }, 200);\n  if (!await appTokenOk(request, env)) return json({ error: \"unauthorized\" }, 401);@@test-logroute.js@@de logstop van 20-09 is terug: de route meldt 200 ok en schrijft niets — precies wat blok 5 niet zag"
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
# ── het logarchief (01-10-2026) ──
# Oude logregels worden samengevat en dan gewist. De fouten die ertoe doen:
# uitkomsten mee wissen, bij een tweede ronde het archief overschrijven of
# dubbel tellen, archiveren en wissen los van elkaar (dan kan een halve ronde
# een archiefrij achterlaten die de volgende ronde nog eens telt), en een
# beheerknop die zonder te vragen wist.
"worker.js@@  stmts.push(db.prepare(\`DELETE FROM logregels WHERE \${BINNEN} AND \${LA_WEG}\`)@@  stmts.push(db.prepare(\`DELETE FROM logregels WHERE \${BINNEN}\`)@@test-logarchief.js@@de archiefronde wist ook de uitkomstregels: het antwoord op een issue is weg"
"worker.js@@      regels: (Number(a && a.regels) || 0) + (Number(g.regels) || 0),@@      regels: (Number(g.regels) || 0),@@test-logarchief.js@@een tweede ronde op dezelfde rit overschrijft het aantal regels in plaats van op te tellen"
"worker.js@@      uitkomsten: Math.max(Number(a && a.uitkomsten) || 0, Number(g.uitkomsten) || 0),@@      uitkomsten: (Number(a && a.uitkomsten) || 0) + (Number(g.uitkomsten) || 0),@@test-logarchief.js@@de uitkomsten die blijven staan worden elke ronde opnieuw bij het archief opgeteld"
"worker.js@@  const BINNEN = \`ontvangen < ? AND (id <= ? OR NOT \${LA_WEG})\`;@@  const BINNEN = \`ontvangen < ? AND id <= ?\`;@@test-logarchief.js@@een uitkomst na de laatste gewiste regel van een rit valt buiten het archief: issues en uitkomsten ontbreken"
"worker.js@@  const res = await db.batch(stmts);@@  const res = []; for (const st of stmts) res.push(await st.run());@@test-logarchief.js@@archiveren en wissen in losse stappen: faalt het wissen, dan blijft er een archiefrij die de volgende ronde dubbel telt"
"worker.js@@proef: b0.proef !== false@@proef: b0.proef === true@@test-logarchief.js@@de beheerknop wist zonder proef:false — een klik zonder proefdraaien gooit regels weg"
"admin/beheer.html@@  if(AR.proefDagen !== dagen){@@  if(false){@@bproef-beheerpagina.js@@archiveren met een andere termijn dan de proef: je wist iets anders dan je net hebt gezien"
# De beheerpagina zelf (bproef-beheerpagina.js). Drie stille fouten die er
# allemaal goed uitzien: een afgekeurde opdracht gaat tóch aan (de app wijst
# hem bij de start af en de rit rijdt zonder dat iemand het weet), het vangnet
# verdwijnt uit beeld, en een dag zonder regels valt weg uit de reeks.
"admin/beheer.html@@  if(!k.ok){ alert(@@  if(false){ alert(@@bproef-beheerpagina.js@@een afgekeurde meetopdracht is toch te activeren: de app weigert hem bij de start en de rit rijdt zonder"
"admin/beheer.html@@  if(vangnet) waarsch.push(@@  if(false) waarsch.push(@@bproef-beheerpagina.js@@regels in het vangnet \`onbekend\` staan niet meer in beeld: een ontbrekende kolom valt niemand op"
"admin/beheer.html@@    uit.push([d, x[1], x[2]]);@@    if(x[1]) uit.push([d, x[1], x[2]]);@@bproef-beheerpagina.js@@een dag zonder regels valt weg uit de dagreeks: juist het gat is onzichtbaar"
# ── de opstart-intro (24-09-2026) ──
# De vorige splash ging op 26-07 weg omdat hij elke start ophield. Elke
# voorwaarde die dat nu voorkomt is een stille fout als hij wegvalt, en een
# vlak dat blijft staan maakt de hele app onbruikbaar.
"public/pidlane-intro.js@@    if (o.verminderd) return 'minder beweging';\n@@@@test-intro.js@@de intro speelt ook bij minder beweging in het besturingssysteem"
"public/pidlane-intro.js@@    bezig = true;\n    onthoud();@@    bezig = true;@@test-intro.js@@de intro wordt niet onthouden en speelt bij elke herlaadbeurt opnieuw in plaats van één keer per sessie"
"public/pidlane-intro.js@@    if (o.wachtMs > MAX_WACHT_MS) return@@    if (false) return@@test-intro.js@@na een trage opstart komt er nog eens bijna drie seconden intro bovenop"
"public/pidlane-intro.js@@    if (ev && ev.type === 'pointerdown') { ev.preventDefault(); ev.stopPropagation(); }@@@@test-intro.js@@de tik die de intro overslaat drukt ook de knop eronder in, bijvoorbeeld de demo"
"public/pidlane-intro.js@@  var DUUR_MS = 2900;@@  var DUUR_MS = 2000;@@test-intro.js@@de JS-timer ruimt de intro op midden in de doorzoom: het logo verdwijnt met een knip"
"public/pidlane.css@@#plIntro:not(.pli-speel){ animation:pliNood .01s@@#plIntro:not(.pli-speel){ animation:pliKlaar .01s@@test-intro.js@@noodrem en eindregel delen één keyframe: Chromium telt de 2,85 s dan vanaf het laden en de intro valt midden in het beeld weg"
"public/pidlane.css@@#plIntro.pli-speel .pli-logo{ animation:pliOverend @@#plIntro.pli-speel .pli-logo{ animation:pliOverEnd @@bproef-intro.js@@een verschreven keyframe-naam: geen fout in de console, maar het logo blijft de hele intro onzichtbaar"
# ── #297: het log staat in D1, en het scherm zegt dat ──
"public/pidlane-meetkamer.js@@    { sleutel: 'terug',  titel: 'D1' },@@    { sleutel: 'terug',  titel: 'Airtable' },@@test-meetkamer.js@@de meetkamer stuurt je voor de uitslag naar Airtable, waar het log sinds #262 niet meer staat"
# ── PID-tabel naar SAE J1979 (26-09-2026) ──
# Vanaf 0169 stonden namen en formules op de verkeerde nummers, en lazen de
# formules de steunbitmap als databyte. De fouten hieronder zijn die van toen.
"public/pidlane-data.js@@  '019E':{name:'Uitlaatgasdebiet',       unit:'kg/h',cat:'Emissie',  min:0,max:1311, parse:b=>((b[0]*256+b[1])/50)},@@  '019E':{name:'Turbo temp uitlaat A',   unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},@@test-piddefs.js@@019E is weer een turbotemperatuur van −38 °C op een auto zonder turbo"
"public/pidlane-data.js@@parse:b=>((b[0]&4)?(b[5]*100/255):null)},@@parse:b=>(b[5]*100/255)},@@test-piddefs.js@@AdBlue-tankniveau leest ook als het steunbit uit staat, en geeft dan een getal dat nergens op slaat"
"public/pidlane-data.js@@  '014A':{name:'Gaspedaal positie E',    @@  '014A':{name:'Gaspedaal positie D',    @@test-piddefs.js@@twee pedaalsensoren heten allebei D en de derde staat onder de naam van de tweede"
"public/pidlane-pidgate.js@@'0183','0185','0186','018B']);@@'0183','0186','018B']);@@test-bulkrecorder.js@@het AdBlue-tankniveau komt op een benzineauto weer in de opname"
"public/pidlane-rijsituatie.js@@ALL_PID_DEFS[pid]={name:SAE_PID_NAMES[suf],unit:'raw',@@ALL_PID_DEFS[pid]={name:SAE_PID_NAMES[suf],unit:'',@@test-diepzoeken.js@@een PID met alleen een SAE-naam verschijnt als sensor en toont zijn steunbitmap als meetwaarde"
# ── Rit-monitor: geen UITVAL als de app zelf niet meet (26-09-2026) ──
"public/pidlane-watchers.js@@PLAchtergrond.weg()) return 'app op de achtergrond';@@false) return 'app op de achtergrond';@@test-watcherpauze.js@@even wegschakelen levert weer een rij UITVAL-meldingen op, en twintig seconden later evenveel 'hersteld'"
"public/pidlane-watchers.js@@PLElm.poortDicht()) return 'adapter herstart';@@false) return 'adapter herstart';@@test-watcherpauze.js@@een ELM-herinitialisatie telt als uitval van elke snelle sensor"
"public/pidlane-watchers.js@@((vorige && nu-vorige > 3*this.cfg.tickMs) ? 'meetlus lag stil' : null)@@null@@test-watcherpauze.js@@na een bevroren WebView staat weg() alweer op false en rolt de uitval er bij terugkomst alsnog uit"
"public/pidlane-watchers.js@@      if(nu-Math.max(s.lastT, stilVanaf)>drempel){@@      if(nu-s.lastT>drempel){@@test-watcherpauze.js@@na een pauze telt de stilte van vóór de pauze mee: de trage groep valt 'uit' voordat hij terug kan zijn"
# ── Rit-monitor: niet melden bij schakelen, drempels voor moderne auto's, 👎 Klopt niet (04-10-2026) ──
"public/pidlane-watchers.js@@for(let j=Math.max(0,i-_SCHAKEL_SPAN);j<i;j++)@@for(let j=i-1;j<i;j++)@@test-watcherschakel.js@@een schakeling over vier metingen telt weer niet als schakelen, en RPM_CONST en RATIO_CONST melden onrust tijdens gewoon schakelen"
"public/pidlane-watchers.js@@      if(t.aandrijving && schakelRust) continue;@@@@test-watcherschakel.js@@de aandrijflijn-tests draaien door vlak na een schakelmoment"
"public/pidlane-watchers.js@@      if(gasLos && pid!=='010D') { delete this._flatCand[pid]; continue; }@@@@test-watcherschakel.js@@gasklep en belasting heten bevroren bij uitrollen met gas los"
"public/pidlane-watchers.js@@rpmBereik>=this.cfg.refVarMin && rpmBereik>=this.cfg.refVarRel*Math.max(1,rpmMid);@@rpmBereik>=40;@@test-watcherschakel.js@@60 rpm ruis bij constant rijden maakt de snelheid weer bevroren"
"public/pidlane-watchers.js@@        if(gem<12.7) return@@        if(gem<13.2) return@@test-watcherschakel.js@@een slimme dynamo op 12,9 V geeft weer een laadspanningsmelding"
"public/pidlane-watchers.js@@const t=c.val('0105'), GRENS=112, DIRECT=118;@@const t=c.val('0105'), GRENS=108, DIRECT=118;@@test-watcherschakel.js@@110 °C op een VAG bij deellast geeft weer een rode oververhittingsmelding"
"public/pidlane-watchers.js@@        const aanhoudend = w.length>=2 && w[w.length-1].t-w[i].t>=20000;@@        const aanhoudend = w.length>=2;@@test-watcherschakel.js@@een korte piek van 113 °C na stilstaan geeft al een oververhittingsmelding"
"public/pidlane-totalcheck.js@@const _MON_ERNSTIG=/^(ECT_HOOG|TEST:ECT_HOOG|@@const _MON_ERNSTIG=/^(ECT_HOOG|@@test-watcherschakel.js@@oververhitting komt in de rit-monitor weer oranje binnen, zonder Verifieer-knop"
"public/pidlane-monitor.js@@Outcome:(reden==='bug'?'bug':'vals')@@Outcome:'vals'@@test-watcherschakel.js@@een app-bug is in de logtabel niet meer te scheiden van een valse melding"
"public/pidlane-monitor.js@@    if (!ev || !this.FEEDBACK_REDENEN[reden]) return false;@@    if (!ev) return false;@@test-watcherschakel.js@@een willekeurige reden komt als feedback in de logtabel"
# ── Bulk-recorder: alleen verse metingen van PIDs die bij dit voertuig passen (26-09-2026) ──
"public/pidlane-bulk.js@@    if (typeof pidGate === 'function' && !pidGate(k, 'kiesbaar')) return false;@@@@test-bulkrecorder.js@@de recorder schrijft NOx en AdBlue weg op een benzineauto, 600 keer hetzelfde getal"
"public/pidlane-bulk.js@@    if (t && nu - t > VERS_MS) return false;@@@@test-bulkrecorder.js@@een PID die één keer antwoordde staat de hele rit als meting in de opname"
"public/pidlane-bulkvenster.js@@        if (!plausibel(pid)) { uit.nietPlausibel[pid] = true; continue; }@@@@test-bulkrecorder.js@@een oude opname toont in de analyse nog NOx en AdBlue op een benzineauto"
# ── Slim visueel (25-09-2026) ──
# Een vaste meter die de getallen niet mogen laten ontsporen, een keuze die bij
# een dode of trage PID moet doorvallen, een rem op de bus die precies zo lang
# duurt als de weergave open staat, en een meldingenvak dat leest en niets bewaart.
"public/pidlane-visueel.js@@  return Math.max(0, Math.min(100, (n-lo)/(hi-lo)*100));@@  return (n-lo)/(hi-lo)*100;@@test-visueel.js@@de vulling is niet meer begrensd: 99999 rpm zet de naald voorbij het laatste streepje"
"public/pidlane-visueel.js@@  R_CIJFER: 100, FS_CIJFER: 17,@@  R_CIJFER: 110, FS_CIJFER: 17,@@test-visueel.js@@de cijfers schuiven naar buiten en vallen over de streepjes"
"public/pidlane-visueel.js@@Y_SNEL: 192, Y_KMH: 222,@@Y_SNEL: 192, Y_KMH: 214,@@test-visueel.js@@km/h valt over het snelheidsgetal"
"public/pidlane-visueel.js@@X_ONDER_TEKST: 150, Y_ONDER: 330@@X_ONDER_TEKST: 150, Y_ONDER: 310@@test-visueel.js@@het olie-getal schuift omhoog over de ring van de cirkel"
"public/pidlane-visueel.js@@  RIJ_Y: [238, 255, 272],@@  RIJ_Y: [238, 255, 286],@@test-visueel.js@@de onderste rij onder de snelheid zakt op de oliebalk"
"public/pidlane-visueel.js@@    if(window.PLSched && window.PLSched.dood(pid)) return false;\n@@@@test-visueel.js@@een dode PID houdt zijn plek op de meter in plaats van door te vallen naar de volgende"
"public/pidlane-visueel.js@@if(h[i] && typeof h[i].t==='number' && h[i].t>=vanaf) t.push@@if(h[i] && typeof h[i].t==='number') t.push@@test-visueel.js@@metingen van vóór het openen (ander tempo) laten het pedaal ten onrechte van de onderboog vallen"
"public/pidlane-visueel.js@@    const p=PEDAAL_KETEN[i];\n    if(bruikbaar(p) && !_staat.traag.has(p)) return@@    const p=PEDAAL_KETEN[i];\n    if(bruikbaar(p)) return@@test-visueel.js@@een pedaal dat op deze auto te traag binnenkomt blijft in zijn rij staan en schokt"
"public/pidlane-visueel.js@@  if(t) _staat.turboVast=true;@@@@test-visueel.js@@de onderboog wisselt terug van laaddruk naar pedaal zodra het turbobewijs even wegvalt"
"public/pidlane-visueel.js@@    return n<KOEL_KOUD ? 'koud' : 'ok';@@    return 'ok';@@test-visueel.js@@een koude motor kleurt niet meer blauw"
"public/pidlane-visueel.js@@    if(isFinite(r) && r>MOTOR_DRAAIT && n<ACCU_LAADT) return 'warn';@@@@test-visueel.js@@een dynamo die niet laadt blijft grijs: 12,5 V bij draaiende motor leest als goed"
"public/pidlane-visueel.js@@return ((nu||Date.now())-laatste-krediet) >@@return ((nu||Date.now())-laatste) >@@test-visueel.js@@de meter wordt dof zodra een andere lezer de bus even bezet"
"public/pidlane-visueel.js@@  if(!hoofd.length) HOOFD.forEach(@@  HOOFD.forEach(@@test-visueel.js@@terwijl de caravanrit loopt staan er snelkoppelingen naar rit-monitor en bulk-recorder, en die horen niet tegelijk"
"public/pidlane-visueel.js@@(!h.admin || admin)@@(true)@@test-visueel.js@@een gewone gebruiker krijgt een bulk-recorderknop die alleen 'Alleen voor admin' zegt"
"public/pidlane-visueel.js@@  Y_LOGO: 112, LOGO_B: 56,@@  Y_LOGO: 140, LOGO_B: 56,@@test-visueel.js@@het embleem zakt op de naaf en de naald draait er niet meer omheen maar erdoorheen"
"public/pidlane-visueel.js@@    const b=draait ? pct(extra.belasting) : null;@@    const b=pct(extra.belasting);@@test-visueel.js@@in een start/stop-stop staat er een motorbelasting bij een motor die stilstaat"
"public/pidlane-visueel.js@@  if(ind.lamp){ if(ind.lamp.belasting) s.add(ind.lamp.belasting);@@  if(false){ if(ind.lamp.belasting) s.add(ind.lamp.belasting);@@test-visueel.js@@de belasting op het lampje wordt geremd tot eens per twee seconden en loopt achter op het gaspedaal"
"public/pidlane-visueel.js@@  diesel:  { max:6000, rood:4500 }@@  diesel:  { max:8000, rood:null }@@test-visueel.js@@een diesel krijgt weer de benzineplaat tot 8000 en het oranje pas bij 6000"
"public/pidlane-visueel.js@@  if(motor==='hybride' || motor==='ev' || (res && res.bewijstHybride)){@@  if(motor==='hybride' || motor==='ev'){@@test-visueel.js@@een auto die elektrisch rijdt maar als benzine op het kenteken staat krijgt geen dubbele accu"
"public/pidlane-visueel.js@@  hoofd.forEach(function(h){ uit.lopend.push(@@  hoofd.slice(0,1).forEach(function(h){ uit.lopend.push(@@test-visueel.js@@rit-monitor en recorder lopen samen en de rail toont er maar één — de recorder hangt weer als losse pil ernaast"
"public/pidlane-visueel.js@@  return !_staat.gebruik.has(pid);@@  return true;@@test-visueel.js@@de rem raakt ook wat op de meter staat"
"public/pidlane-plload.js@@  try{ if(window.PLVisueel && PLVisueel.remt(pid)) ms=Math.max(ms, PLVisueel.REM_MS); }@@  try{ }@@test-visueel.js@@de rem is losgekoppeld: de dubbele gasklep- en belasting-PIDs blijven de bus vullen"
"public/pidlane-correlatie.js@@  if(!_bevAan || !hits.length || inVak){@@  if(!_bevAan || !hits.length){@@bproef-visueel.js@@de bevindingen staan in Slim visueel twee keer: in het vak én in de balk erboven"
# ── Het foutcodevenster (PLFoutcodes, 26-09-2026). Vijf van de zes zijn de
#    fouten van het oude DTC-scherm, hier teruggezet; de zesde is de poort
#    op het laatste moment voor een motor die na de uitlezing gestart is.
"public/pidlane-foutcodes.js@@if (fr && huidig) { huidig.hex +=@@if (fr && huidig) { return; huidig.hex +=@@test-foutcodes.js@@multiframe: alles na frame 0 valt weg, zoals in realScanDTC()"
"public/pidlane-foutcodes.js@@    return gezien ? codes : null;@@    return codes;@@test-foutcodes.js@@geen antwoord op 03 leest als \"geen foutcodes\" (#218)"
"public/pidlane-foutcodes.js@@return (b[2] & (1 << bit)) && (b[3] & (1 << bit));@@return (b[3] & (1 << bit));@@test-foutcodes.js@@een niet-klaar-bit telt ook voor een monitor die de auto niet heeft"
"public/pidlane-foutcodes.js@@if (ok && weiger == null) return@@if (weiger == null) return@@test-foutcodes.js@@geen antwoord op 04 leest als gewist, zoals in clearDTC()"
"public/pidlane-foutcodes.js@@if (typeof ctx.rpm === 'number' && ctx.rpm > 0) blok.push(@@if (false) blok.push(@@test-foutcodes.js@@wissen mag terwijl de motor draait"
"public/pidlane-foutcodes.js@@        if (typeof rpm === 'number' && rpm > 0) {@@        if (false) {@@test-foutcodes.js@@de motor is na de uitlezing gestart en er gaat toch 04 de bus op"
"public/pidlane-foutcodes.js@@    if ((c.bevestigd || []).length || (c.pending || []).length || (c.permanent || []).length) return false;@@    if ((c.bevestigd || []).length || (c.permanent || []).length) return false;@@test-foutcodes.js@@een code in afwachting en de check gaat toch vanzelf door naar Live"
"public/pidlane-foutcodes.js@@    return !(s.readiness && s.readiness.mil);@@    return true;@@test-foutcodes.js@@het motorlampje brandt en de check gaat toch vanzelf door naar Live"
"public/pidlane-foutcodes.js@@        if (_st.door && !(e.target.closest && e.target.closest('.fc-door'))) stopDoor();@@        if (false) stopDoor();@@bproef-foutcodes.js@@de klant tikt in het venster en wordt toch naar Live gestuurd"
# ── Mijn voertuigen (klantplatform, 27-09-2026). Worker: de fouten die een
#    klant bij een ander laten binnenkijken of een persoonsgegeven onversleuteld
#    laten staan. App: de fouten die een rit, een issue of een rapport stil
#    verkeerd laten vastleggen.
"worker.js@@  return db.prepare(\"SELECT * FROM kp_voertuig WHERE id = ? AND klant_id = ?\").bind(String(id), klantId).first();@@  return db.prepare(\"SELECT * FROM kp_voertuig WHERE id = ?\").bind(String(id)).first();@@test-klantplatform.js@@een klant kan het voertuig van een andere klant wijzigen"
"worker.js@@    if ((tel.actief || 0) >= KP_MAX_ACTIEF)@@    if (false)@@test-klantplatform.js@@een vierde actief voertuig mag"
"worker.js@@      else if (!c.sleutel) kentekenOpgeslagen = false;   // niet bewaren is beter dan onversleuteld@@      else if (!c.sleutel) { zet.kenteken_enc = k; kentekenOpgeslagen = true; }@@test-klantplatform.js@@zonder sleutel gaat het kenteken leesbaar de database in"
"worker.js@@      if (!ak || ak.versie !== KP_AKKOORD_VERSIE)\n        return json({ ok: false, error: \"Eerst akkoord@@      if (false)\n        return json({ ok: false, error: \"Eerst akkoord@@test-klantplatform.js@@schrijven zonder akkoord op het bewaren"
"worker.js@@        rijp.splice(i, 1);@@@@test-klantplatform.js@@D1 faalt en het account wordt toch gewist — de sleutel naar de voertuigdata is dan weg"
"worker.js@@(v.kmstand == null || r.waarde >= v.kmstand)@@true@@test-klantplatform.js@@een gemeten kilometerstand zet de opgegeven stil lager"
"public/pidlane-garage.js@@    if (dt > CFG.ritGatMaxS) dt = 0;@@@@test-garage.js@@een meetgat telt als afgelegde weg"
"public/pidlane-garage.js@@    else if (typeof m.maf === 'number' && brandstof !== 'diesel')@@    else if (typeof m.maf === 'number')@@test-garage.js@@een dieselverbruik uit de luchtmassa"
"public/pidlane-garage.js@@    if (b.sLiters >= b.s * 0.7 && r.km >= 1)@@    if (b.sLiters > 0 && r.km >= 1)@@test-garage.js@@verbruik over een stukje van de rit geldt als ritverbruik"
"public/pidlane-garage.js@@    var volledig = u.gelezen ? (u.gelezen.bevestigd && u.gelezen.pending !== false) : !!u.volledig;@@    var volledig = true;@@test-garage.js@@een issue gaat dicht na een uitlezing die niet volledig was (#218)"
"public/pidlane-garage.js@@      if (!rec || !magBewaren()) return;@@      if (!rec) return;@@test-garage.js@@een rapport gaat zonder akkoord de server op"
"public/pidlane-garage.js@@    return km >= 20 ? {@@    return km >= 0 ? {@@test-garage.js@@een verbruiksoordeel op één korte rit"
"worker.js@@    if (ak && ak.versie === \"verwijderd\")\n      return json(@@    if (false)\n      return json(@@test-klantplatform.js@@een verwijderd account houdt met zijn lopende token toegang tot Mijn voertuigen"
"worker.js@@    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }@@    catch (e) { }@@test-klantplatform.js@@een migratie die om een andere reden faalt, wordt stil ingeslikt"
"worker.js@@  for (const s of KP_MIGRATIES) {@@  for (const s of []) {@@test-klantplatform.js@@de nieuwe kolommen komen er op een bestaande tabel nooit bij"
"public/pidlane-garage.js@@      if (!magBewaren() || !pid || _waakGemeld[pid]) return;@@      if (!magBewaren() || !pid) return;@@test-garage.js@@elke ronde met dezelfde waakbevinding stuurt hem opnieuw"
"public/pidlane-garage.js@@    if (['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng'].indexOf(b) >= 0) w.brandstof = b;@@    w.brandstof = b;@@test-garage.js@@vrije tekst uit het Voertuigoverzicht gaat als brandstof de server op"
"worker.js@@    else if (d.soort === \"janee\") { if (w === true || w === false) uit[k] = w; else fouten.push(k); }@@    else if (d.soort === \"janee\") { uit[k] = w; }@@test-klantplatform.js@@\"true\" als tekst wordt als ja/nee-voorkeur bewaard"
"worker.js@@  for (const t of [\"kp_rapport\", \"kp_rit\", \"kp_issue\", \"kp_voertuig\", \"kp_voorkeur\", \"kp_pid_stem\", \"kp_akkoord\"]) {@@  for (const t of [\"kp_rapport\", \"kp_rit\", \"kp_issue\", \"kp_voertuig\", \"kp_pid_stem\", \"kp_akkoord\"]) {@@test-klantplatform.js@@alles wissen (en het verwijderde account) laat de voorkeuren staan"
"public/pidlane-voorkeur.js@@      if (p[x[0]] === true && s && !s.aan) uit.push(x[1]);@@      if (s && typeof p[x[0]] === 'boolean' && s.aan !== p[x[0]]) uit.push(x[1]);@@test-voorkeur.js@@een voorkeur \"uit\" zet een achtergrondfunctie uit die de klant net aanzette"
"public/pidlane-voorkeur.js@@    if (p.adapterAdres && !toestel.adapterAdres) zet(@@    if (p.adapterAdres) zet(@@test-voorkeur.js@@het adres uit het account overschrijft een gekoppelde adapter op dit toestel"
"public/pidlane-voorkeur.js@@    if (!passend.length) return 0;@@@@test-voorkeur.js@@past er niets van de vaste selectie, dan staan er ineens geen sensoren meer aan"
"public/pidlane-voorkeur.js@@    scanBekend: function () { return (_pref && _pref.scanBekend) || 'vragen'; },@@    scanBekend: function () { return (_pref && _pref.scanBekend) || 'overslaan'; },@@test-voorkeur.js@@zonder voorkeur wordt de sensorscan bij een bekende auto stil overgeslagen"

# ── Versnellingsindicator (pidlane-gear.js). Drie fouten die stil een verkeerd
# cijfer of een lek opleveren: snelheid en toerental van verschillende momenten
# als paar, een oude cachewaarde als verse meting, en de ruwe VIN als sleutel.
"public/pidlane-gear.js@@    if (Math.abs(ts-tr)>CFG.alignMaxMs) return {los:true, kmh:s.v, rpm:r.v};@@@@test-gear.js@@snelheid en toerental van verschillende momenten tellen als één paar"
"public/pidlane-gear.js@@    if (t-ts>CFG.versMaxMs || t-tr>CFG.versMaxMs) return {oud:true};@@@@test-gear.js@@een oude cachewaarde levert nog een versnelling op"
"public/pidlane-gear.js@@      this._wissel(ps ? 'v_'+ps : 'onbekend');@@      this._wissel(ps ? 'v_'+vin : 'onbekend');@@test-gear.js@@het model wordt onder de ruwe VIN opgeslagen"

# ── 27-09-2026: versnelling aan het voertuig, de knop Fout, berekende PIDs,
# de trekmodus, ritlabels, nette rapporten en de terugknop op een gescrold
# venster. Elk een fout die stil blijft: een correctie die niets verschuift, een
# servermodel dat een verder gekomen model overschrijft, een CA-PID op de bus.
"public/pidlane-gear.js@@    return best.k+(idx-best.idx);@@    return idx+1;@@test-gear.js@@de knop Fout onthoudt het anker maar de nummering schuift niet mee"
"public/pidlane-gear.js@@    if (r===null || nu()-this._laatsteRT>CFG.ankerVersMs)\n      return { ok:false, reden:'Rij eerst een paar seconden rustig in die@@    if (r===null)\n      return { ok:false, reden:'Rij eerst een paar seconden rustig in die@@test-gear.js@@een correctie pakt een verouderde verhouding van een schakelmoment of stilstand"
"public/pidlane-gear.js@@    if (daar>hier || (daar===hier && ankersDaar>ankersHier)){@@    if (true){@@test-gear.js@@een kleiner model van de server overschrijft wat dit toestel al geleerd had"
"public/pidlane-plload.js@@    // Een berekende PID (CA..) rekent de app uit; de auto kent hem niet.\n    if(typeof plIsBerekend==='function' && plIsBerekend(pid)) continue;@@    // Een berekende PID (CA..) rekent de app uit; de auto kent hem niet.@@bproef-berekend.js@@de pollus stuurt een berekende PID (CA01) als commando naar de auto"
"public/pidlane-bt.js@@  if(/^CA[0-9A-F]{2}1?$/i.test(String(cmd||'').trim())){@@  if(false){@@bproef-berekend.js@@sendCmd laat een berekende PID door naar de adapter"
"public/pidlane-berekend.js@@    if (isDiesel && set.indexOf('0110')>=0) continue;@@@@test-berekend.js@@een dieselverbruik uit de luchtmassa (een diesel loopt arm)"
"public/pidlane-berekend.js@@      if (l===null || typeof kmh!=='number' || kmh<5) return null;@@      if (l===null || typeof kmh!=='number' || kmh<=0) return null;@@test-berekend.js@@liters per 100 km bij stapvoets rijden: delen door bijna nul"
"public/pidlane-berekend.js@@  return (nu-(x.t||0))<=max ? { v:x.v, t:x.t||0 } : undefined;@@  return { v:x.v, t:x.t||0 };@@bproef-berekend.js@@een berekende PID rekent door op bronwaarden van tien seconden oud"
"public/pidlane-visueel.js@@  if(p.length<5 || p[p.length-1].t-p[0].t<20000) return null;@@  if(p.length<2) return null;@@test-visueel.js@@de koelwatertrend spreekt zich uit op vier metingen"
"public/pidlane-visueel.js@@  return TREK.filter(function(t){ return !t.turbo || turbo; }).map(function(t){@@  return TREK.map(function(t){@@test-visueel.js@@de laaddruk staat in de trekstrook van een auto zonder turbo"
"public/pidlane-garage.js@@    if (!/^PidLane — Waakronde/.test(regels[0] || '')) return null;@@@@test-garage.js@@elk rapport wordt als waakrapport gelezen"
"public/pidlane-garage.js@@      if (!l) return;\n      var s = som[l]@@      var s = som[l]@@test-garage.js@@ritten zonder label tellen als een label \"null\""
"worker.js@@    const s = m === null ? null : kpJson(m, 16000);@@    const s = m === null ? null : JSON.stringify(m);@@test-klantplatform.js@@een versnellingsmodel zonder groottegrens"
"worker.js@@    const r = await c.db.prepare(\"UPDATE kp_rit SET label = ? WHERE id = ? AND klant_id = ?\")@@    const r = await c.db.prepare(\"UPDATE kp_rit SET label = ? WHERE id = ? AND klant_id = klant_id\")@@test-klantplatform.js@@een klant kan het label van andermans rit zetten"
"public/pidlane-archief.js@@  if(!weg) return false;@@  return false;@@bproef-terugknop.js@@terug doet niets op Mijn voertuigen zodra het ✕ weggescrold is"
# 28-09-2026, testrun 8.3: zo stond hij er, en het Run-venster bleef staan.
"public/pidlane-archief.js@@  if(_PL_SLUIT_TEKST.test(t) || _PL_SLUIT_WOORD.test(t)) return true;@@  if(_PL_SLUIT_TEKST.test(t)) return true;@@bproef-terugknop.js@@een knop \"Sluiten\" telt niet als sluitknop: terug laat het Run-venster staan"

# ── 27-09-2026, ronde 2: de voorstellen en de sluitende meetproeven. De
# gevaarlijkste is de eerste: een schakeladvies dat ooit TERUG adviseert, op de
# top van een klim. Daarna de meetproeven zelf: een oordeel dat een fout niet
# meer ziet is erger dan geen proef, want dan staat er "ok" onder een rit.
"public/pidlane-berekend.js@@  if (rpm<g.vanaf) return gear;@@  if (rpm<g.vanaf) return Math.max(1, gear-1);@@test-berekend.js@@het schakeladvies zegt terugschakelen bij laag toerental (op de top van een klim precies verkeerd)"
"public/pidlane-berekend.js@@  const heet=typeof m.temp==='number' && m.temp>=DPF.heet && !(typeof m.belasting==='number' && m.belasting>DPF.maxBelasting);@@  const heet=typeof m.temp==='number' && m.temp>=DPF.heet;@@test-berekend.js@@een hete uitlaat bij het trekken telt als roetfilterregeneratie"
"public/pidlane-berekend.js@@  if ((s.geweigerd||[]).length) fout.push(@@  if (false) fout.push(@@test-berekend.js@@de blok-5-proef ziet niet meer dat een CA-PID naar de adapter ging"
"public/pidlane-berekend.js@@      if (k===null || l===null || !(e>0) || l<0.5 || k<=0) return null;@@      if (k===null || l===null || !(e>0) || l<=0 || k<=0) return null;@@test-berekend.js@@rendement bij bijna nul debiet: delen door bijna nul"
"public/pidlane-gear.js@@      if (achteruit){\n        doel='R';@@      if (achteruit){\n        doel=undefined;@@test-gear.js@@een geleerde achteruit wordt nooit getoond: de klant ziet geen R"
"public/pidlane-gear.js@@    if (een && Math.abs(r-een)/een<=CFG.matchTol)@@    if (false)@@test-gear.js@@R met dezelfde verhouding als de 1e wordt geaccepteerd en maakt de 1e tot achteruit"
"public/pidlane-gear.js@@    return s>60 ? null : Math.max(0, Math.round(s*10)/10);@@    return s>60 ? null : Math.round(s*10)/10;@@test-gear.js@@koppelomvormer-slip wordt negatief bij uitrollen"
"public/pidlane-gear.js@@  if (pct<70) return { staat:'FOUT'@@  if (pct<0) return { staat:'FOUT'@@test-gear.js@@de blok-5-proef keurt een indicator goed die bij 60% van de metingen niet past"
"public/pidlane-pip.js@@    _open.maxGat = Math.max(_open.maxGat, nu - _open.laatste);\n    _open.laatste = nu; _open.n++;@@    _open.laatste = nu; _open.n++;@@test-pip.js@@een stilgevallen meetlus in beeld-in-beeld wordt niet gemeten (#319)"
"public/pidlane-pip.js@@    var slecht = lang.filter(function (p) { return p.maxGat > PIP_GAT_MS; });@@    var slecht = [];@@test-pip.js@@de #319-proef zegt ok bij een meetlus die acht seconden stillag"
"public/pidlane-pip.js@@        return tellen.length ? Math.round(Math.max.apply(null, tellen.map(function (p) { return p.maxGat; })) / 100) / 10 : null;@@        return tellen.length ? 0 : null;@@test-pip.js@@de meetopdracht van #319 hoort nooit een stil venster: pip-gat-s zegt altijd 0"
"public/pidlane-pip.js@@    var lang = perioden().filter(function (p) { return p.verbonden; });@@    var lang = perioden();@@test-pip.js@@een PiP-periode zonder verbinding haalt de voorwaarde van #319: 2 minuten klein op de oprit telt als meting"
"public/pidlane-adapter.js@@        for (let j = i - 3; j <= i + 3; j++)@@        for (let j = i; j < i; j++)@@test-adapterpaneel.js@@de stap ligt een paar monsters te vroeg en noemt de verkeerde oorzaak (#302)"
"public/pidlane-adapter.js@@    if (!(g.factor >= 1.3)) return@@    if (!(g.factor >= 3)) return@@test-adapterpaneel.js@@de drift van 150 naar 270 ms heet deze rit niet opgetreden (#302)"
"public/pidlane-visueel.js@@  if(nu-_laatsteAlarm<ALARM_MS) return false;@@@@bproef-visueel.js@@de koelwaterwaarschuwing piept elke tik op een lange klim"
"public/pidlane-visueel.js@@  const viel=(S.traag||[]).filter(function(p){ return PEDAAL_KETEN.indexOf(p)>=0 || p==='010B'; });@@  const viel=[];@@test-visueel.js@@de #294-proef ziet niet dat het pedaal van de meter viel"
"public/pidlane-garage.js@@    Object.keys(tel).forEach(function (l) { if (tel[l] >= 2 &&@@    Object.keys(tel).forEach(function (l) { if (tel[l] >= 1 &&@@test-garage.js@@één toevallig gelijkende rit geeft al een labelvoorstel"
"public/pidlane-garage.js@@String(r.label || '').replace(/;/g, ',')].join(';'));@@String(r.label || '')].join(';'));@@test-garage.js@@een puntkomma in een ritlabel breekt de CSV-export"
"worker.js@@\"DELETE FROM kp_rapport WHERE klant_id = ? AND id IN (\"@@\"DELETE FROM kp_rapport WHERE (klant_id = ? OR 1) AND id IN (\"@@test-klantplatform.js@@meerdere rapporten wissen raakt ook die van een andere klant"
"worker.js@@    return { waarde: Math.round(n * 1000) / 1000 };@@    return { waarde: Math.round(n * 10) / 10 };@@test-klantplatform.js@@een literprijs van 1,959 wordt 2,0"

# ── 27-09-2026, ronde 3: leren uit opnames en ritten, uit = alleen niet tonen,
# het auto-icoon en de ingeklapte rijsituatie.
"public/pidlane-gear.js@@(vorige && x.t-vorige.t>2500)@@(false)@@test-gear.js@@een gat in de opname telt als doorlopend stabiel stuk"
"public/pidlane-gear.js@@    if (bron && m.bronnen[bron]) return@@    if (false) return@@test-gear.js@@dezelfde opname telt twee keer: het model gaat scheef naar die ene rit"
"public/pidlane-gear.js@@    m.ankers=oud.ankers||[]; m.achteruit=oud.achteruit;@@    m.ankers=[]; m.achteruit=oud.achteruit;@@test-gear.js@@opnieuw opbouwen uit ritten gooit de correcties van de klant weg"
"public/pidlane-gear.js@@      if (!verbonden()){ this._zet(null); this._buf=[]; return; }@@      if (this.uit || !verbonden()){ this._zet(null); this._buf=[]; return; }@@test-gear.js@@met de indicator uit leert hij niet meer, en is hij bij aanzetten weer leeg"
"public/pidlane-rijsituatie.js@@  const open = !inklap || window._sitBlokOpen===true;@@  const open = true;@@bproef-garage.js@@de rijsituatie staat weer altijd open in het Voertuigoverzicht"

# ── 27-09-2026, ronde 4: eigen PIDs per voertuig, Slim visueel zonder knoppen,
# het Voertuigoverzicht zonder tweede formulier, direct opslaan.
"public/pidlane-uitgebreid.js@@  const EIGEN_CODE = /^(21[0-9A-F]{2}|22[0-9A-F]{4})$/;@@  const EIGEN_CODE = /^[0-9A-F]{4,8}$/;@@test-mode21.js@@een eigen PID mag een schrijfcode (2E) of een routine (31) zijn"
"public/pidlane-uitgebreid.js@@return (b) => (b && typeof b[k] === 'number') ? b[k] : null; }@@return (b) => (b && b[k]) || 0; }@@test-mode21.js@@een kort antwoord rekent met 0 voor de ontbrekende byte: een geloofwaardig maar verzonnen getal"
"public/pidlane-uitgebreid.js@@      if (window.ALL_PID_DEFS && ALL_PID_DEFS[r.code] && !ALL_PID_DEFS[r.code].eigen) return;@@      void 0;@@test-mode21.js@@een eigen PID overschrijft een definitie die de app al kent"
"worker.js@@.test(code)) return { fout: \"alleen leescodes@@.test(code) && false) return { fout: \"alleen leescodes@@test-klantplatform.js@@de server bewaart een schrijfcode als eigen PID en stuurt hem naar elk toestel"
"public/pidlane-voorkeur.js@@      return (supportedPIDs.has(pid) || inLijst(pid)) &&@@      return (supportedPIDs.has(pid)) &&@@test-voorkeur.js@@de vaste selectie laat eigen en berekende PIDs van het voertuig stil vallen"
"public/pidlane-plload.js@@  try{ if(window.PLEigen && PLEigen.is(pid)) return PLEigen.interval(pid); }@@  try{ if(false) return PLEigen.interval(pid); }@@bproef-garage.js@@een eigen PID valt op het trage tempo van mode 22 (10 s)"
"public/pidlane-garage.js@@return x ? ' value=\"' + esc(x) + '\"' : '';@@return '';@@bproef-garage.js@@na een foutmelding is wat de klant in het formulier typte weg"
"public/pidlane-voertuigdata.js@@    const w=a||{};@@    const w={};@@bproef-garage.js@@het Voertuigoverzicht toont de gegevens uit Mijn voertuigen niet"
"public/pidlane-visueel.js@@function trekAan(){ return caravanLoopt() || trekSituatie(); }@@function trekAan(){ return caravanLoopt(); }@@test-visueel.js@@rijsituatie caravan of beladen zet de trekstrook niet meer aan"
"public/pidlane-visueel.js@@      if(heeft.has(p) && !verborgen.has(p)){@@      if(heeft.has(p)){@@test-visueel.js@@Slim visueel zet een sensor terug die de klant verborgen heeft"
"public/pidlane-visueel.js@@  return g===0 ? 'N' : g===-1 ? 'R' : String(g);@@  return g===0 ? 'N' : String(g);@@test-visueel.js@@achteruit staat als -1 in het midden van de meter"
"public/pidlane-visueel.js@@  const d = rol==='koel' ? (n-G.KOEL_LO)/(G.KOEL_HI-G.KOEL_LO)*100 : n;@@  const d = n;@@test-visueel.js@@het koelwaterbalkje staat bij 90 °C al bijna vol"
"public/pidlane-uitgebreid.js@@      if (typeof t === 'number' && nu - t < grens) ok.push(@@      if (typeof t === 'number') ok.push(@@test-mode21.js@@blok 5 noemt een eigen PID die een minuut niets meer zei nog steeds goed"
"public/pidlane-uitgebreid.js@@      try { await sendCmd(functioneel, 1500); }@@      try { void 0; }@@test-mode21.js@@na een vraag met ECU-adres blijft de adapter op 7E1 staan: de motor antwoordt niet meer"
"public/pidlane-uitgebreid.js@@    const functioneel = 'ATSH' + (ecu.length === 8 ? '18DB33F1' : '7DF');@@    const functioneel = 'ATSH7DF';@@test-mode21.js@@een 29-bit auto krijgt na een eigen PID het 11-bit functionele adres terug"
"public/pidlane-uitgebreid.js@@    if (_terug) { await sendCmd(_terug, 1500); _terug = null; }@@    _terug = null;@@test-mode21.js@@mislukt het terugzetten één keer, dan blijft de adapter op het fysieke adres staan"
"public/pidlane-uitgebreid.js@@      if (!r.ok || !/^https?:@@      if (!r.ok || /^https?:@@test-mode21.js@@een kandidaat zonder bron (uit het geheugen van de AI) komt in de bibliotheek"
"public/pidlane-plload.js@@  if(window.PLEigen && PLEigen.is(pid)) return PLEigen.vraag(pid);@@  if(false) return PLEigen.vraag(pid);@@bproef-garage.js@@de pollus negeert het ECU-adres van een eigen PID"
"worker.js@@var KP_EIGEN_ECU = /^(7[0-9A-F]{2}|18DA[0-9A-F]{2}F1)$/;@@var KP_EIGEN_ECU = /^[0-9A-Z;]{3,12}$/;@@test-klantplatform.js@@de server bewaart een AT-commando als ECU-adres en stuurt het naar elk toestel"
"worker.js@@\"kp_voorkeur\", \"kp_pid_stem\", \"kp_akkoord\"]) {@@\"kp_voorkeur\", \"kp_akkoord\"]) {@@test-klantplatform.js@@alles wissen laat de stemmen in de PID-bibliotheek staan"
"worker.js@@    const e = (kpLees(v.eigen_pids) || []).find((x) => x.code === code && (x.ecu || \"\") === ecu);@@    const e = (kpLees(v.eigen_pids) || []).find((x) => true);@@test-klantplatform.js@@delen zet een code in de bibliotheek die niet bij het voertuig staat"
"public/pidlane-garage.js@@(/weigert|Geen antwoord/.test(r.fout || '') ? 'werkt_niet' : null)@@'werkt_niet'@@bproef-garage.js@@\"niet verbonden\" telt in de bibliotheek als \"werkt niet\""
"public/pidlane-garage.js@@          (S.ok[e.code] ? '<button class=\"gr-k klein\" onclick=\"PLGarage._sensDeel(@@          (true ? '<button class=\"gr-k klein\" onclick=\"PLGarage._sensDeel(@@bproef-garage.js@@een nooit geteste code kan gedeeld worden als bewezen"
"public/pidlane-uitgebreid.js@@    const tempo = EIGEN_TEMPO[e.tempo] ? e.tempo : (band ? 'opverzoek' : 'normaal');@@    const tempo = EIGEN_TEMPO[e.tempo] ? e.tempo : 'normaal';@@test-mode21.js@@acht bandensensoren worden elke 2 s via een ander ECU-adres gevraagd"
# ── banden op verzoek, buiten de pollus (#396, 06-10-2026) ──
"public/pidlane-uitgebreid.js@@    const tempo = EIGEN_TEMPO[e.tempo] ? e.tempo : (band ? 'opverzoek' : 'normaal');@@    const tempo = EIGEN_TEMPO[e.tempo] ? e.tempo : (band ? 'minuut' : 'normaal');@@test-banden.js@@de banden gaan weer elke minuut als acht losse PIDs de pollus in — #396"
"public/pidlane-plload.js@@    try{ if(window.PLEigen && window.PLEigen.opVerzoek && window.PLEigen.opVerzoek(pid)) continue; }@@    try{ if(false) continue; }@@test-banden.js@@een band op verzoek die nog in activePIDs staat gaat toch de pollus in — #396"
"public/pidlane-rijsituatie.js@@if(d.tempo!=='opverzoek' && !discoveredPIDDefs.some(@@if(!discoveredPIDDefs.some(@@test-banden.js@@de acht banden staan weer als losse tegels met een trend in de keuzelijst — #396"
"public/pidlane-banden.js@@    if (_gen === (window._btGen || 0)) return Promise.resolve({ ok: true, al: true });@@    if (false) return Promise.resolve({ ok: true, al: true });@@test-banden.js@@elke keer dat Slim visueel opbouwt worden de acht banden opnieuw gevraagd — #396"
"public/pidlane-banden.js@@    if (_bezig) return _bezig;\n    const pids = vraagPids@@    const pids = vraagPids@@test-banden.js@@twee keer tikken op ↻ vraagt de banden twee keer achter elkaar — #396"
"public/pidlane-banden.js@@  const OUD_MS = 30 * 60000;@@  const OUD_MS = 180000;@@test-banden.js@@op verzoek gevraagd en na drie minuten al dof: het lampje is grijs zolang je rijdt — #396"
# ── de regel die werkelijk wint (opruim-PR, 06-10-2026) ──
"public/pidlane.css@@#fabLane { bottom:calc(14px + var(--pl-sab) + var(--pl-nav-h)); }@@#fabLane { bottom:calc(14px + var(--pl-sab)); }@@test-schermranden.js@@de zwevende chips vallen achter de navigatiebalk: de regel die wint vergeet --pl-nav-h"
# ── geen PID twee keer in één tabel (06-10-2026) ──
"public/pidlane-data.js@@  '017D':{name:'NOx NTE status',@@  '017C':{name:'DPF temperatuur inlaat B1', unit:'°C', cat:'Emissie', min:-40,max:6513,parse:b=>null},\n  '017D':{name:'NOx NTE status',@@test-dubbelesleutels.js@@017C komt er een tweede keer in ALL_PID_DEFS bij en overschrijft de eerste stil"
# ── reparaties na de brede controle van 06-10-2026 ──
"public/pidlane-auth.js@@  try{ if(typeof liveLogStop==='function') Promise.resolve(liveLogStop())@@  try{ if(false) Promise.resolve(liveLogStop())@@test-afmelden.js@@het live-log van de beheerder schrijft door in de sessie van wie daarna inlogt"
"public/pidlane-auth.js@@  if(typeof connected==='undefined') return 'onbekend';@@  if(typeof isConnected==='undefined') return 'onbekend';@@test-meldregels.js@@de bugmelding zegt weer altijd \"Verbinding: onbekend\""
"public/pidlane-auth.js@@  return (typeof demoMode!=='undefined' && demoMode) ? 'demo' : 'verbonden';@@  return 'verbonden';@@test-meldregels.js@@een bugmelding uit de demo zegt dat er een echte auto verbonden was"
"public/pidlane-fuel.js@@  const d=(typeof _pidDead!=='undefined' && _pidDead) ? _pidDead : null;@@  const d=window._deadPIDs || null;@@test-meldregels.js@@het rapport meldt nooit meer dat PIDs herhaald geen data gaven"
"public/pidlane-banden.js@@  function oudNu() { return _aan ? OUD_AUTO_MS : OUD_MS; }@@  function oudNu() { return OUD_MS; }@@test-banden.js@@met de ronde van vijf minuten blijft een band een half uur groen op een meting die niemand ververst"
"public/pidlane-banden.js@@stand(ind, v, t, Date.now(), oudNu())@@stand(ind, v, t, Date.now())@@test-banden.js@@het lampje en het venster negeren de kortere grens van de ronde van vijf minuten"
# ── banden: één regel in de sensorlijst, elke vijf minuten (#396, 06-10-2026) ──
"public/pidlane-banden.js@@    return !!(aan && klaar && heeft && nu - (laatst || 0) >= AUTO_MS);@@    return !!(aan && klaar && heeft);@@test-banden.js@@de bandenronde draait elke tik van 30 s in plaats van elke vijf minuten — #396"
"public/pidlane-banden.js@@!(typeof demoMode !== 'undefined' && demoMode) && !!window._plVerbindingKlaar; }@@!(typeof demoMode !== 'undefined' && demoMode); }@@test-banden.js@@de bandenronde vraagt de bus midden in het verbinden, tijdens de koude poort — #396"
"public/pidlane-banden.js@@    if (_aan) _laatstGevraagd = 0;@@@@test-banden.js@@het vinkje aanzetten vraagt de banden pas vijf minuten later — #396"
"public/pidlane-banden.js@@    if (f && 'banden bandenspanning bandtemperatuur tpms'.indexOf(f) < 0 && !pids@@    if (f && false && !pids@@test-banden.js@@zoeken op \"olie\" toont de bandenregel toch — #396"
"public/pidlane-rijsituatie.js@@PLBanden.lijstRegel) ? PLBanden.lijstRegel(f) : null;@@PLBanden.lijstRegel) ? null : null;@@bproef-banden.js@@de acht banden verdwijnen uit de sensorlijst zonder dat er een regel voor terugkomt — #396"
"public/pidlane-uitgebreid.js@@    const aan = defs.filter(d => d.tempo === 'opverzoek' || actief.indexOf(d.pid) >= 0);@@    const aan = defs.filter(d => actief.indexOf(d.pid) >= 0);@@test-banden.js@@blok 5 zegt bij banden op verzoek dat er geen enkele eigen sensor aanstaat — #396"
"public/pidlane-uitgebreid.js@@    if (!DRUK_KPA[van] || !DRUK_KPA[doel] || van === doel) return null;@@    return null;@@test-mode21.js@@de bandenspanning blijft in psi, wat de klant ook kiest"
"public/pidlane-uitgebreid.js@@    if (voor === achter || links === rechts) return null;@@    if (false) return null;@@test-mode21.js@@een naam zonder duidelijke plek wordt toch een band (en staat dan op de verkeerde)"
"public/pidlane-uitgebreid.js@@.eenheid || '').toLowerCase()]) delete pidVals[c]; });@@.eenheid || '').toLowerCase()]) void 0; });@@test-mode21.js@@na een andere drukeenheid staat de oude waarde er een minuut lang met de nieuwe eenheid"
"public/pidlane-banden.js@@        if (a <= -GEVAAR) w[p].ernst = 'danger'; else if (a <= -WARN) w[p].ernst = 'warn';@@        if (a <= -GEVAAR) w[p].ernst = 'danger';@@test-banden.js@@een band die 10–20% zachter is dan de rest geeft geen melding"
"public/pidlane-banden.js@@oud: !(typeof t === 'number' && nu - t < grens) };@@oud: false };@@test-banden.js@@een bandenspanning van een kwartier geleden telt mee in het oordeel"
"public/pidlane-banden.js@@    if (vers.length >= 3) {@@    if (vers.length >= 1) {@@test-banden.js@@met twee banden gemeten oordeelt het venster al over alle vier"
"public/pidlane-visueel.js@@  e.style.display=l.toon ? '' : 'none';@@  e.style.display='';@@bproef-banden.js@@een auto zonder bandensensoren krijgt een leeg bandenlampje"
"worker.js@@var KP_EIGEN_TEMPO = [\"snel\", \"normaal\", \"traag\", \"minuut\"];@@var KP_EIGEN_TEMPO = [\"snel\", \"normaal\", \"traag\"];@@test-klantplatform.js@@de server gooit het tempo \"elke minuut\" weg"
"worker.js@@  if (e.tempo && KP_EIGEN_TEMPO.indexOf(e.tempo) >= 0) o.tempo = e.tempo;@@  if (e.tempo && KP_EIGEN_TEMPO.indexOf(e.tempo) >= 0 && e.tempo !== \"normaal\") o.tempo = e.tempo;@@test-klantplatform.js@@een gekozen \"elke 2 s\" voor een band wordt weer elke minuut"
"public/pidlane-uitgebreid.js@@: Math.max(30000, 2.5 * (EIGEN_TEMPO[d.tempo] || EIGEN_TEMPO.normaal));@@: 30000;@@test-mode21.js@@blok 5 noemt een eigen PID met tempo elke minuut na 50 s stil"
"public/pidlane-banden.js@@    if (st.ernst === 'ok') return { staat: 'ok', detail: d + ' — ' + st.uitleg };@@    if (st.ernst !== 'geen') return { staat: 'ok', detail: d + ' — ' + st.uitleg };@@test-banden.js@@blok 5 meldt een zachte band als ok"
"public/pidlane-pidgate.js@@    if(!supportedPIDs.has(pid) && !inLijst.has(pid)) return;@@    if(!supportedPIDs.has(pid)) return;@@test-sessiedoorloop.js@@hervatten laat eigen en berekende sensoren weer vallen"
"public/pidlane-garage.js@@PLVoorkeur.selectieToepassen(sel, v.naam || v.merk, { erbij: !basis.length })@@PLVoorkeur.selectieToepassen(sel, v.naam || v.merk, { erbij: false })@@bproef-garage.js@@de eigen sensoren van het voertuig vervangen de standaardset: geen toerental meer"
"public/pidlane-voorkeur.js@@    if (!erbij) {@@    if (true) {@@bproef-garage.js@@\"erbij\" wist toch de hele selectie"
"public/pidlane-garage.js@@    if (mist.length) return { staat: 'FOUT'@@    if (false) return { staat: 'FOUT'@@test-garage.js@@blok 5 ziet niet dat de vaste sensoren na het verbinden ontbreken"
"public/pidlane-uitgebreid.js@@    if (!/^(21|22[0-9A-F]{2})$/.test(prefix)) return@@    if (false) return@@test-mode21.js@@de buurscan scant ook een blok met schrijfcodes (2E)"
"public/pidlane-uitgebreid.js@@            if (ecu) { try { await sendCmd(functioneel, 1500); }@@            if (false) { try { await sendCmd(functioneel, 1500); }@@test-mode21.js@@na de buurscan blijft de adapter op ECU-adres 720 staan"
"public/pidlane-uitgebreid.js@@kandidatenUitTekst(tekst).filter(k => !al.has(k.code + '@' + (k.ecu || '')))@@kandidatenUitTekst(tekst).filter(k => true)@@test-mode21.js@@dieper zoeken levert de codes die al werken nog eens als nieuw"
"worker.js@@        if (b.ontwikkelaar !== true && b.ontwikkelaar !== false) return json(@@        if (false) return json(@@test-bijboeken.js@@een \"ja\" uit een kapotte pagina maakt iemand stil ontwikkelaar"
"public/pidlane-auth.js@@==='klant' && u.ontwikkelaar===true);@@==='klant' && !!u.ontwikkelaar);@@test-rolmenu.js@@een vlag \"ja\" geeft de ontwikkeltools"
"public/pidlane-klant.js@@      try { admin = (typeof magOntwikkelen === 'function') ? magOntwikkelen() :@@      try { admin = false ? magOntwikkelen() :@@test-rolmenu.js@@een klant met de ontwikkelaarsvlag ziet het ontwikkelmenu niet"
"worker.js@@WHERE vin_pseudo = ? AND id != ? AND \" + mee)@@WHERE vin_pseudo = ? AND id != ? AND ? IS NOT NULL\")@@test-klantplatform.js@@de techniek gaat ook naar een account dat het delen niet akkoord gaf"
"worker.js@@  if (nieuwKoppel) {@@  if (false) {@@test-klantplatform.js@@wie een bekende auto koppelt, begint toch weer leeg"
"worker.js@@  \"transmissie\", \"versnellingen\", \"tankinhoud\", \"eigen_pids\", \"gear_model\"];@@  \"transmissie\", \"versnellingen\", \"tankinhoud\", \"eigen_pids\", \"gear_model\", \"kmstand\", \"notities\"];@@test-klantplatform.js@@km-stand en notities gaan via de VIN naar een ander account"
"public/pidlane-gear.js@@if (nieuw && top) nieuw.scrollTop=top;@@void 0;@@bproef-garage.js@@het versnellingsvenster springt elke seconde terug naar boven"
"public/pidlane-gear.js@@    m.ankers.forEach(a=>{ if (plek(a.r)<0)@@    m.ankers.slice(-1).forEach(a=>{ if (plek(a.r)<0)@@test-gear.js@@alleen het laatste aangegeven anker telt; de eerdere tikken zijn weg"
"public/pidlane-gear.js@@    lijst.sort((a,b)=>(b.steun-a.steun)||(b.n-a.n)||(b.laatst-a.laatst));@@    lijst.sort((a,b)=>(b.laatst-a.laatst));@@test-gear.js@@één verkeerde tik overstemt twee goede"
"public/pidlane-gear.js@@    m.hist[b]=(m.hist[b]||0)+CFG.ankerGewicht; m.totaal+=CFG.ankerGewicht;@@    void 0;@@test-gear.js@@een tik telt niet mee in het histogram en het leren blijft traag"
"public/pidlane.css@@body.pl-visueel #plGear { display:none; }@@@@bproef-visueel.js@@in Slim visueel staat de versnelling ook nog in de topbalk"
"public/pidlane-plload.js@@return ++eigen<=EIGEN_PER_RONDE; }@@return true; }@@test-mode21.js@@acht banden in één ronde: seconden zonder toerental"
"public/pidlane-visueel.js@@const VIS_OUD_MIN_MS = 5000;@@const VIS_OUD_MIN_MS = 3000;@@test-visueel.js@@elke hapering van 3 s maakt de meter dof: knipperen"
"public/pidlane-visueel.js@@  if(perMin>1 || @@  if(perMin>100 || @@test-visueel.js@@blok 5 ziet een knipperende meter niet"
"public/pidlane-visueel.js@@X_BALK0: 120, X_BALK1: 186, B_BALK: 5, X_RIJ_TEKST: 191,@@X_BALK0: 120, X_BALK1: 196, B_BALK: 5, X_RIJ_TEKST: 191,@@test-visueel.js@@het balkje van een rij loopt door onder zijn getal"
"public/pidlane-uihelpers.js@@  const s=plStempelLokaal(ms).slice(0,16).replace('T','_');@@  const s=plStempelLokaal(ms).slice(0,10);@@test-tijdklok.js@@een bestandsnaam met alleen de datum: de tweede keer dezelfde naam en het deelvenster"
"public/pidlane-motortype.js@@  if(_plOpslagFout){@@  if(false){@@test-opslagroute.js@@het deelvenster gaat open zonder dat de klant hoort waarom"
"public/pidlane-motortype.js@@  if(m.length) return { staat:'FOUT'@@  if(false) return { staat:'FOUT'@@test-opslagroute.js@@blok 5 noemt een mislukte opslag goed"
"public/pidlane-fuel.js@@  return plBewaarBestand(blob,fname);@@  return nativeShareFile(blob,fname);@@test-opslagroute.js@@een PDF-export opent weer het deelmenu in plaats van op te slaan"

# ── de login tegen de gebruikerstabel in D1 (#327). Tot 01-10-2026 stonden
# hier vier mutaties op de cache van 28-09; die cache is weg sinds de tabel
# in D1 staat en lezen niets meer kost.
"worker.js@@      if (f.Active === false) continue;\n      out[name] = {@@      out[name] = {@@test-inlogcache.js@@een via beheer uitgezette gebruiker komt er gewoon in — zoals bij Airtable, waar een uitgevinkt vakje nooit false was"
"worker.js@@    await atPatch(env, \"gebruikers\", recId, { PassHash: await hashPassword(pass, env) });@@    await hashPassword(pass, env);@@test-inlogcache.js@@een oud sha256-wachtwoord wordt nooit herhasht en blijft voorgoed op het zwakke formaat staan"
"worker.js@@    if (hit) await atPatch(env, \"gebruikers\", hit.id, fields);\n    else await atMaak(env, \"gebruikers\", fields);@@    if (!hit) await atMaak(env, \"gebruikers\", fields);@@test-inlogcache.js@@een gewijzigd wachtwoord in beheer zegt ok maar wordt niet opgeslagen"

# ── 28-09-2026: Tegoed uit voor een klant met Ontwikkelaar aan. De fouten die
# gratis AI geven aan wie dat niet hoort te krijgen, of de schakelaar stil
# laten staan terwijl de ontwikkelaarsrechten al weg zijn.
"worker.js@@  return !!(f && f.Ontwikkelaar === true && f.TegoedUit === true);@@  return !!(f && f.TegoedUit === true);@@test-tegoeduit.js@@Tegoed uit geeft gratis AI zonder Ontwikkelaar"
"worker.js@@        if (klantTegoedUit(kf)) {@@        if (false) {@@test-tegoeduit.js@@Tegoed uit boekt toch af"
"worker.js@@      if (b.ontwikkelaar === false) f.TegoedUit = false;@@@@test-tegoeduit.js@@Ontwikkelaar uit laat Tegoed uit in Airtable staan"
"worker.js@@      if (f.TegoedUit === true && b.ontwikkelaar !== true) {@@      if (false) {@@test-tegoeduit.js@@Tegoed uit is te zetten bij een klant zonder Ontwikkelaar"
"worker.js@@    tegoedUit: klantTegoedUit(f)@@    tegoedUit: f.TegoedUit === true@@test-tegoeduit.js@@/klant/mij meldt tegoed uit terwijl de Worker wel afboekt"
"public/pidlane-credits.js@@    try { return window.currentUser.tegoedUit === true; }@@    try { return !!window.currentUser.tegoedUit; }@@test-tokenchip.js@@een vlag \"ja\" zet in de app de kostencontrole uit"

# ── 28-09-2026: een demo-auto laat niets achter. Elke mutatie haalt één
# demotoets weg; de fout die dan stil gebeurt staat erachter.
"public/pidlane-garage.js@@  function magBewaren() { return !isDemo() && isKlant()@@  function magBewaren() { return isKlant()@@test-garage.js@@demo-foutcodes, -rapporten en -waakrondes komen bij het echte actieve voertuig"
"public/pidlane-pids.js@@  if(typeof demoMode!=='undefined' && demoMode) return; // een demo-auto heeft geen dossier\n@@@@test-demoopslag.js@@een demosessie komt in het voertuigdossier van de demo-VIN"
"public/pidlane-waarneming.js@@      if (typeof demoMode !== 'undefined' && demoMode) return null;\n@@@@test-demoopslag.js@@een kentekendemo schrijft in het profiel van een echte auto van hetzelfde type"
"public/pidlane-berekend.js@@  if (typeof demoMode!=='undefined' && demoMode) return;   // demo: de teller@@  void 0;   // demo: de teller@@test-demoopslag.js@@de roetfilterteller van een demo-diesel wordt bewaard"
"public/pidlane-voertuigdata.js@@  if(typeof demoMode!=='undefined' && demoMode) return;\n  try{ localStorage.setItem(_uvKey()@@  try{ localStorage.setItem(_uvKey()@@test-demoopslag.js@@wat je in een demo invult, komt in het dossier onder je eigen kenteken"
"public/pidlane-voertuigdata.js@@  if(typeof demoMode!=='undefined' && demoMode) return;\n  try{ const s=localStorage.getItem(_uvKey())@@  try{ const s=localStorage.getItem(_uvKey())@@test-demoopslag.js@@een kentekendemo neemt het dossier van je eigen auto over"
"public/pidlane-diagnose.js@@function _diagDemo(){ try{ return typeof demoMode!=='undefined' && !!demoMode; }@@function _diagDemo(){ try{ return false; }@@test-demoopslag.js@@een AI-antwoord op demowaarden wordt veertien dagen aan echte auto's van dat type gegeven"
"public/pidlane-pidgate.js@@  if(!(typeof demoMode!=='undefined' && demoMode)){\n    try{ localStorage.setItem('pl_selectie'@@  if(true){\n    try{ localStorage.setItem('pl_selectie'@@test-demoopslag.js@@na een crash krijgt de echte auto de sensorselectie van de demo terug"
"public/pidlane-gear.js@@    if (typeof demoMode!=='undefined' && demoMode) return;\n    lsSet(LS_MODEL+this.sleutel@@    lsSet(LS_MODEL+this.sleutel@@test-demoopslag.js@@een ingetikte versnelling in demo komt in het model van het echte voertuig"
# (De mutatie "demologregels komen als echte ritten met merk en VIN in de
# logtabel" is weg sinds #360: een demoregel wordt niet meer geschreven. De
# fout die hij nabouwde vangt nu "logToSheets zet in de demo weer regels in
# de buffer" hieronder.)
"public/pidlane-demo.js@@  vehicleInfo={ merk:'Onbekend', model:'', year:'', vin:'', brandstof:'', motor:'' };\n  try{ resetVehicleSources(); }catch(e){ console.warn('Demo stoppen@@  try{ resetVehicleSources(); }catch(e){ console.warn('Demo stoppen@@test-demoopslag.js@@na de demo meet een echte auto zonder VIN door als de demo-auto"
# ── 29-09-2026: Rit beëindigen. Motor uit is een pauze, geen einde; het
# venster rondt de rit af vóór de verbinding weg is; ATPC geeft de bus vrij.
"public/pidlane-garage.js@@    if (stil > CFG.ritPauzeMs) return 'af';@@    if (stil > 3 * 60 * 1000) return 'af';@@test-garage.js@@drie minuten stil is weer het einde van de rit: één rit met een tankstop wordt er twee"
"public/pidlane-garage.js@@    if (!verbonden || stil > CFG.pauzeMinMs) return 'pauze';@@    if (!verbonden) return 'af';\n    if (stil > CFG.pauzeMinMs) return 'pauze';@@test-garage.js@@verbinding weg beëindigt de rit meteen"
"public/pidlane-garage.js@@    } else if (r && !r._weg) {@@    } else if (r) { ritAf('verbinding weg'); } else if (false) {@@test-garage.js@@de lus rondt de rit af zodra de verbinding wegvalt"
"public/pidlane-garage.js@@    if (kmh != null && kmh >= 2) r.bij = {@@    if (false) r.bij = {@@test-garage.js@@de rit eindigt een kwartier na aankomst in plaats van bij de laatste beweging"
"public/pidlane-garage.js@@if (t - r.tBeweeg > CFG.pauzeMinMs && r.sBeweeg > 0)@@if (t - r.tBeweeg > 0 && r.sBeweeg > 0)@@test-garage.js@@elk stoplicht telt als pauze in de rit"
"public/pidlane-garage.js@@    if (label) sam.label = String(label).slice(0, 40);\n@@@@test-garage.js@@de naam uit Rit beëindigen gaat niet mee de server op"
"public/pidlane-garage.js@@    if (ritStand(r, Date.now(), false) === 'af') ritAf('app gesloten tijdens de rit');@@    ritAf('app gesloten tijdens de rit');@@test-garage.js@@de app even dicht bij de pomp splitst de rit in tweeën"
"public/pidlane-garage.js@@    if (r && r.vid !== v.id) { ritAf('ander voertuig'); r = null; }\n@@@@test-garage.js@@een geparkeerde rit loopt door op een ander voertuig"
"worker.js@@kpJson(r.extra, 4000), label, kpNu()).run();@@kpJson(r.extra, 4000), null, kpNu()).run();@@test-klantplatform.js@@de naam van een rit gaat op de server verloren"
"public/pidlane-afsluiten.js@@    if (ctx.rit) st.push('rit');\n    var sluit = keuze.na === 'sluit' && !!ctx.schil;\n    if (ctx.verbonden && (keuze.na === 'verbreek' || sluit || keuze.uitloggen)) st.push('verbreek');@@    var sluit = keuze.na === 'sluit' && !!ctx.schil;\n    if (ctx.verbonden && (keuze.na === 'verbreek' || sluit || keuze.uitloggen)) st.push('verbreek');\n    if (ctx.rit) st.push('rit');@@test-afsluiten.js@@de verbinding gaat weg vóór de rit af is, en de garage parkeert hem"
"public/pidlane-afsluiten.js@@    var sluit = keuze.na === 'sluit' && !!ctx.schil;@@    var sluit = keuze.na === 'sluit';@@test-afsluiten.js@@\"App sluiten\" in de browser, waar afsluiten niet bestaat"
"public/pidlane-afsluiten.js@@    return vlagVooraf === '1' && stappen.indexOf('sluit') >= 0 && stappen.indexOf('uitlog') < 0;@@    return false;@@test-afsluiten.js@@na \"App sluiten\" verbindt de app de volgende keer niet meer vanzelf"
"public/pidlane-afsluiten.js@@          if (!dicht) { schrijf('pl_autoconn', null); gedaan.push@@          if (!dicht) { gedaan.push@@test-afsluiten.js@@na een mislukte exitApp() verbindt de app vanzelf weer terwijl je net losmaakte"
"public/pidlane-afsluiten.js@@    return Promise.race([Promise.resolve(p), new Promise(function (r) { setTimeout(function () { r('tijd'); }, AFSLUIT_STAP_MS); })]);@@    return Promise.resolve(p);@@test-afsluiten.js@@een adapter die niet antwoordt houdt het venster vast"
"public/pidlane-afsluiten.js@@    var dicht = _bezig || ctx.lopend.length > 0 || !stappen.length;@@    var dicht = _bezig || !stappen.length;@@bproef-afsluiten.js@@een caravanrit die nog loopt wordt bij afsluiten stil weggegooid"
"public/pidlane-uihelpers.js@@    if(!_wasDemo && typeof plBusVrijgeven==='function') await plBusVrijgeven();@@    void 0;@@bproef-afsluiten.js@@bij verbreken blijft de bus bezet: geen ATPC"
"public/pidlane-uihelpers.js@@  try{ if(window.PLAfsluiten) PLAfsluiten.verversMenu(); }@@  try{ if(false) PLAfsluiten.verversMenu(); }@@bproef-afsluiten.js@@het menu zegt \"Afsluiten\" terwijl er een rit loopt"
"public/pidlane-uihelpers.js@@    try{ if(window._webSerialWrite && typeof disconnectWebSerial==='function') await disconnectWebSerial(); }@@    try{ if(false) await disconnectWebSerial(); }@@bproef-afsluiten.js@@bewust verbreken laat een Web Serial-poort open: de volgende verbinding stuit op \"port already open\""

# ── De navigatie (29-09-2026). Fouten die je maakt bij het verbouwen van een
# startscherm: de volgorde van de tabs, wie de garagemodus krijgt, een tegel
# die naar een knoop wijst die er niet is, een beheerschakelaar die niets meer
# doet, en een stoplicht dat "niet gelezen" als groen telt.
"public/pidlane-nav.js@@    if (st.rapporten) return 'rapporten';\n    if (st.welkom) return 'auto';@@    if (st.welkom) return 'auto';\n    if (st.rapporten) return 'rapporten';@@test-nav.js@@het startscherm wint van het rapportenoverzicht: Rapporten licht nooit op"
"public/pidlane-nav.js@@  function garageStandaard(ingelogd, isKlant) {\n    return false;@@  function garageStandaard(ingelogd, isKlant) {\n    return !isKlant;@@test-nav.js@@de demo zonder login krijgt de garagemodus (en de reviewer het vakgereedschap)"
"public/pidlane-nav.js@@    if (opgeslagen === '0') return false;@@    if (opgeslagen === '0') return !!standaard;@@test-nav.js@@wie de garagemodus uitzet, krijgt hem terug zodra de standaard aan is"
"public/pidlane-nav.js@@    return !!(st.ingelogd || st.demo) && !st.dashboard;@@    return !st.dashboard;@@test-nav.js@@de balk staat er al op het inlogscherm"
"public/pidlane-wizard.js@@  voorbereiding: {nu:'voorb_wat',       set:{doel:'voorbereiding'}},@@  voorbereiding: {nu:'voorb_klaar',      set:{doel:'voorbereiding'}},@@test-wizardtakken.js@@de tegel Voorbereiden wijst naar een knoop die niet bestaat"
"public/pidlane-wizard.js@@  return m.filter(moduleAan);@@  return m;@@test-wizardtakken.js@@een functie die beheer uitzet, blijft in het wizardplan staan"
"public/pidlane-foutcodes.js@@    var ongelezen = ['bevestigd', 'pending', 'permanent'].filter(function (k) { return !g[k]; }).length;@@    var ongelezen = 0;@@test-foutcodes.js@@het stoplicht telt een niet-gelezen soort code als \"geen codes\" en wordt groen"
"public/pidlane-foutcodes.js@@    var vast = uniek([].concat(c.bevestigd || [], c.permanent || [])).length;@@    var vast = [].concat(c.bevestigd || [], c.permanent || []).length;@@test-foutcodes.js@@een code die bevestigd én permanent is, telt twee keer in de kop"
"public/pidlane-nav.js@@    schrijf(OPSLAG.autocheck, '0');   // eenmalig@@    void 0;                           // eenmalig@@bproef-navigatie.js@@de automatische check blijft aan en springt bij elke volgende verbinding opnieuw open (02-10-2026: eenmalig)"
"public/pidlane.css@@no-repeat; contain:strict; }@@no-repeat; contain:strict; animation:softblink 2.6s ease-in-out infinite; }@@bproef-navigatie.js@@de achtergrond van het startscherm beweegt weer eindeloos: de telefoon tekent hem bij elk beeldje opnieuw (#302)"
"public/pidlane-fuel.js@@  door_saving_active: 'tg-rit',@@  door_saving_active: 'tg-onderweg',@@bproef-navigatie.js@@de beheerschakelaar voor Rit starten wijst naar een tegel die er niet is"
"admin/beheer.html@@  ['door_saving_active','door_deal_active','door_prep_active'].forEach(k => zetToggle(k, c[k], true));@@  ['door_saving_active','door_deal_active','door_prep_active'].forEach(k => zetToggle(k, c[k], false));@@bproef-beheerpagina.js@@beheer toont een nooit opgeslagen tegel als uit, en Alles opslaan zet hem dan echt uit"
"public/pidlane.css@@.pl-live-acties { display:flex; gap:6px; margin:12px 0 calc(64px + var(--pl-sab, 0px)); }@@.pl-live-acties { display:flex; gap:6px; margin:12px 0 calc(64px + var(--pl-sab, 0px)); }\nbody:not(.pl-garage) #pidViewSwitch { display:none !important; }@@bproef-navigatie.js@@de weergavekeuze in Live staat alleen in de garagemodus: een klant zit vast in Slim"
"public/pidlane-uihelpers.js@@  if(t && !isVin) return t;@@  if(t) return t;@@test-nav.js@@de statusregel bovenin toont het chassisnummer (VIN) in plaats van merk en model"
"public/pidlane-uihelpers.js@@  if(!s.ai) return 'AI niet bereikbaar';\n  return s.naam || 'Verbonden';@@  return s.naam || 'Verbonden';@@test-nav.js@@de statusregel toont de autonaam terwijl de AI weg is"
# ── De demo-zandbak (29-09-2026) ──
# In de demo wordt niets bewaard, en toch werkt alles. Elke mutatie hieronder
# is een manier waarop dat stil stukgaat: er gaat weer iets naar de AI of het
# account, een demorapport blijft staan, een echte instelling verdwijnt in de
# laag, of een demo zonder login eindigt achter de login.
"public/pidlane-plfetch.js@@      if(besluit !== 'door') return PLDemo.weigerAntwoord(besluit);@@      if(false) return PLDemo.weigerAntwoord(besluit);@@test-demozandbak.js@@de demopoort in plFetch staat open: de AI rekent weer op een verzonnen auto"
"public/pidlane-fuel.js@@  if(window.PLDemo && PLDemo.actief() && !PLDemo.volledig()) return PLDemo.aiVoorbeeld(prompt, extra);@@  void 0;@@test-demozandbak.js@@apiFetch geeft in de demo geen voorbeeldrapport maar vraagt de echte AI (en rekent tegoed af)"
"public/pidlane-motortype.js@@  if(window.PLDemo && PLDemo.actief() && !PLDemo.volledig()){@@  if(false){@@test-demozandbak.js@@de demo schrijft weer bestanden naar Documenten/PidLane"
"public/pidlane-archief.js@@      demo:_demo,@@      demo:false,@@test-demozandbak.js@@een demorapport is niet als demo gemerkt en blijft na de demo in het overzicht staan"
"public/pidlane-demo.js@@      return LEES_ACTIES.indexOf(actie) >= 0 ? 'door' :@@      return true ? 'door' :@@test-demozandbak.js@@de demo mag weer schrijven naar het klantplatform: rapporten, ritten en open punten van een verzonnen auto"
"public/pidlane-demo.js@@    function vangt(self, k) { return self === opslag && actief() &&@@    function vangt(self, k) { return self === opslag &&@@test-demozandbak.js@@demoMode uit zonder plDemoStop: een echte instelling verdwijnt stil in de demolaag"
"public/pidlane-demo.js@@  var DOORLAAT = ['pl_session', 'pl_sessie', 'pl_tok', 'pl_uitloggen', 'ns_api_key'];@@  var DOORLAAT = ['pl_tok', 'pl_uitloggen', 'ns_api_key'];@@test-demozandbak.js@@wie tijdens de demo inlogt, is na het herladen weer uitgelogd"
"public/pidlane-demo.js@@  var DOORLAAT = ['pl_session', 'pl_sessie', 'pl_tok', 'pl_uitloggen', 'ns_api_key'];@@  var DOORLAAT = ['pl_session', 'pl_sessie', 'ns_api_key'];@@test-demozandbak.js@@uitloggen tijdens de demo wordt bij plDemoStop teruggedraaid: het sessietoken blijft op het toestel"
# ── de demo stuurt geen logregels, en geen 401-lus zonder sessie (#360) ──
"public/pidlane-demo.js@@,\n    { re: /\\/airtable\\/log\\b/, reden:@@,\n    { re: /\\/airtable\\/logXX\\b/, reden:@@test-demozandbak.js@@de demopoort laat /airtable/log weer door: logregels van een verzonnen auto komen in D1"
"public/pidlane-auth.js@@    if(typeof demoMode!=='undefined' && demoMode) return;\n    const vinId@@    const vinId@@test-demoopslag.js@@logToSheets zet in de demo weer regels in de buffer"
"public/pidlane-auth.js@@  if(!tok || tok===_atGeweigerdToken){@@  if(false){@@test-livelog.js@@zonder sessie wordt de log weer verstuurd, en elke keer een 401"
"public/pidlane-auth.js@@      if(resp.status===401){ _atGeweigerdToken=tok;@@      if(false){ _atGeweigerdToken=tok;@@test-livelog.js@@na een 401 wordt elke 15 s opnieuw geprobeerd met hetzelfde token"
"public/pidlane-auth.js@@      if(err && err.demo===true){@@      if(false){@@test-livelog.js@@een demoweigering zet de batch terug, en na de demo gaan de regels alsnog mee"
"public/pidlane-auth.js@@        User:       geenMail(currentUser?.name||''),@@        User:       String(currentUser?.name||''),@@test-logvelden.js@@het e-mailadres van een klant staat weer als User in elke logregel"
"public/pidlane-auth.js@@    const bericht=mailUit(String(message||'')@@    const bericht=(String(message||'')@@test-logvelden.js@@een e-mailadres in de tekst van een logregel gaat ongezien mee"
"public/pidlane-veldlab.js@@  try{ kopie=JSON.parse(_vlEmailUitTekst(JSON.stringify(rec))); }@@  try{ kopie=JSON.parse(JSON.stringify(rec)); }@@test-vin-anoniem.js@@een e-mailadres ergens in het veldlabrecord (foutregels, survey) gaat mee in het JSON-blob"
"public/pidlane-veldlab.js@@  if(kopie && 'tester' in kopie) kopie.tester=_vlGeenEmail(rec.tester);@@  if(kopie && 'tester' in kopie) kopie.tester=kopie.tester;@@test-vin-anoniem.js@@de Tester van een klant gaat als \"[e-mail]\" mee in plaats van leeg"
"worker.js@@        const sporen = await klantSporenWissen(env.LOGDB, emailVan[id]);@@        const sporen = null;@@test-klantsporen.js@@een verwijderd account laat zijn logregels en veldlabrecords met zijn e-mailadres staan"
"worker.js@@ OR INSTR(LOWER(\"JSON\"), LOWER(?)) > 0@@ OR ? IS NULL@@test-klantsporen.js@@een veldlabrecord met het adres alleen in het JSON-blob blijft na verwijderen staan"
"public/pidlane-demo.js@@      if (Array.isArray(l)) for (var i = l.length - 1; i >= 0; i--) if (l[i] && l[i].demo) l.splice(i, 1);@@      void 0;@@test-demozandbak.js@@demorapporten blijven na de demo in het overzicht — en gaan als eerdere rapporten mee naar de AI"
"public/pidlane-demo.js@@  demoMode=true; connected=true; dataStable=true;\n  plDemoAan();\n  closeConnOv();@@  demoMode=true; connected=true; dataStable=true;\n  closeConnOv();@@test-demozandbak.js@@de gewone demostart zet de zandbak niet aan"
"public/pidlane-demo.js@@    if(!ingelogd) setTimeout(()=>{ try{@@    if(false) setTimeout(()=>{ try{@@bproef-demozandbak.js@@een demo zonder login eindigt op een verbindscherm achter de login"
"public/pidlane-demo.js@@  const demoPIDs=demoPIDsForFuel(demoVin.brandstof);@@  const demoPIDs=demoPIDsForFuel('benzine');@@bproef-demozandbak.js@@elke demo-auto krijgt weer de sensoren van een benzine: lambdasondes op een diesel"
# ── Zonder adapter (29-09-2026) ──
# De kenteken-check zegt dingen waar iemand op handelt. Een verkeerde kleur
# hier is geen cosmetiek: "verzekerd" op een onverzekerde auto, of "logisch"
# op een onlogische tellerstand, is een verkeerd koopadvies.
"public/pidlane-zonder.js@@    else if (nee(rij.wam_verzekerd)) r('🛡️', 'WAM-verzekerd', 'nee — volgens het RDW niet verzekerd', 'rood');@@    else if (nee(rij.wam_verzekerd)) r('🛡️', 'WAM-verzekerd', 'nee — volgens het RDW niet verzekerd', null);@@test-zonder.js@@een onverzekerde auto staat niet in het rood"
"public/pidlane-zonder.js@@      var onlog = /onlogisch/i.test(teller), logisch = !onlog && /logisch/i.test(teller);@@      var onlog = false, logisch = /logisch/i.test(teller);@@test-zonder.js@@een onlogische tellerstand wordt als logisch gelezen (\"onlogisch\" bevat \"logisch\")"
"public/pidlane-zonder.js@@    if (dagen <= 30) return { ernst: 'oranje'@@    if (dagen <= 3) return { ernst: 'oranje'@@test-zonder.js@@een APK die over drie weken verloopt, staat in het groen"
"public/pidlane-zonder.js@@    if (/^[0-9][0-9A-F]{3}$/.test(s)) s = 'P' + s;@@    void 0;@@test-zonder.js@@een foutcode zonder letter (0301, zoals op een werkbon) wordt niet gevonden"
"public/pidlane-zonder.js@@    if (st.verbonden) return [];@@    if (false) return [];@@test-zonder.js@@de kaart zonder adapter staat er ook als de auto verbonden is"
"public/pidlane-zonder.js@@    var onbekend = !info.desc || /^Onbekende code/.test(info.desc);@@    var onbekend = !info.desc;@@test-zonder.js@@een onbekende foutcode krijgt de standaardernst van dtcInfo als oordeel"
# ── Herinneringen en de lampjesgids (29-09-2026) ──
# Een herinnering die op de verkeerde dag komt, dubbel, of vanuit de demo, is
# erger dan geen; een lampjesgids die bij rood "doorrijden" zegt, is gevaarlijk.
"public/pidlane-herinner.js@@  var TREDEN = [30, 7, 0];@@  var TREDEN = [30, 7];@@test-herinner.js@@op de dag zelf komt er geen herinnering meer"
"public/pidlane-herinner.js@@        if (isNaN(d) || d.getTime() <= nu) return;@@        if (isNaN(d)) return;@@test-herinner.js@@herinneringen voor een datum die al voorbij is, worden toch ingepland"
"public/pidlane-herinner.js@@    if (mijn && mijn.kent && datum8(mijn.keuring) && !gehad[kent(mijn.kent)]) {@@    if (mijn && mijn.kent && datum8(mijn.keuring)) {@@test-herinner.js@@een kenteken dat ook in Mijn voertuigen staat, krijgt twee APK-herinneringen"
"public/pidlane-herinner.js@@    if (isDemo() || _bezig) return { gedaan: false, reden: isDemo() ? 'demo' : 'bezig' };@@    if (_bezig) return { gedaan: false, reden: 'bezig' };@@test-herinner.js@@de demo plant echte Android-meldingen voor een verzonnen auto"
"public/pidlane-herinner.js@@        if (perm && perm.display === 'granted') {@@        if (true) {@@test-herinner.js@@zonder toestemming wordt er toch ingepland (en Android gooit een fout die niemand ziet)"
"public/pidlane-herinner.js@@    return (h >>> 1) || 1;@@    return h | 0;@@test-herinner.js@@een melding-id kan negatief zijn: Android weigert hem"
"public/pidlane-lampjes.js@@      doorrijden: 'nee', obd: null, zoek: 'olie oliepeil smering kannetje' },@@      doorrijden: 'voorzichtig', obd: null, zoek: 'olie oliepeil smering kannetje' },@@test-lampjes.js@@bij het oliedruklampje zegt de gids dat je voorzichtig door kunt rijden"
"public/pidlane-lampjes.js@@      doorrijden: 'nadat', obd: null, zoek: 'gordel riem piepen' },@@      doorrijden: 'ja', obd: null, zoek: 'gordel riem piepen' },@@test-lampjes.js@@een rood lampje zegt \"je kunt doorrijden\""
"public/pidlane-lampjes.js@@      return (l.naam + ' ' + l.vorm + ' ' + (l.zoek || '')).toLowerCase().indexOf(t) >= 0;@@      return l.naam.toLowerCase().indexOf(t) >= 0;@@test-lampjes.js@@zoeken op wat je ziet (schildpad, spiraaltje) vindt niets meer"
".github/workflows/build-apk.yml@@<uses-permission android:name=\"android.permission.SCHEDULE_EXACT_ALARM\" tools:node=\"remove\" />'@@'@@test-privacydekking.js@@de bundel vraagt SCHEDULE_EXACT_ALARM, een permissie die Play alleen wekker- en agenda-apps toestaat"
# ── de SPP-plugin laat geen draaiende leesdraden achter (#352, 30-09-2026) ──
# Een mislukte verbindpoging kostte een processorkern tot de app herstartte.
# De patch, zijn schakelaar voor de proef, en de proef die de bus bewerkt
# zonder dat de app het voor een storing aanziet.
"plspppatch.js@@if (!connection.verbonden())@@if (false)@@test-spppatch.js@@een mislukte poging komt als verbinding in de lijst en krijgt een draad — alleen de nieuwe lus houdt hem dan nog tegen"
"plspppatch.js@@private static volatile boolean PATCH_AAN = true;@@private static volatile boolean PATCH_AAN = false;@@test-spppatch.js@@de patch zit in de APK maar staat standaard uit"
"plspppatch.js@@oudGedrag || (status == ConnectionStatus.CONNECTED && !isInterrupted())@@oudGedrag || true@@test-spppatch.js@@de leesdraad stopt niet meer na disconnect(): de lege lus is terug, alleen later"
"public/pidlane-sppproef.js@@    if (_verbonden() && window.PLScanSlot) {@@    if (false) {@@test-sppproef.js@@de nep-connect blokkeert de plugindraad buiten het busslot: de pollus ziet zes lege antwoorden en herverbindt"
"public/pidlane-sppproef.js@@    if (!p.patch) _markeer(@@    if (false) _markeer(@@test-sppproef.js@@na een nabootsing zonder patch weet de app niet dat de bus aangetast is — het drift-oordeel geeft FOUT op de proef"
"public/pidlane-sppproef.js@@      if (erbij !== null && erbij > 0) { r.staat = 'FOUT';@@      if (erbij !== null && erbij > 0) { r.staat = 'OK';@@test-sppproef.js@@een patch-APK die toch een draad achterlaat heet in orde"
"public/pidlane-sppproef.js@@    const heeftPatch = !!(patch && patch.patch && patch.aan !== false);@@    const heeftPatch = !!(patch && patch.patch);@@test-sppproef.js@@een patch die voor de proef uitstaat telt als patch: de A/B-proef oordeelt verkeerd om"
"public/pidlane-adapter.js@@    if (g.proef) return@@    if (false) return@@test-adapterpaneel.js@@de oploop door de SPP-proef telt als de drift van #302"
".github/workflows/build-apk.yml@@(PLDradenPlugin.class)@@(PLDraden.class)@@test-nativeschil.js@@de draadmeting wordt niet geregistreerd: Capacitor.Plugins.PLDraden bestaat niet in de APK"
".github/workflows/build-apk.yml@@run: node plspppatch.js node_modules/@ascentio-it/capacitor-bluetooth-serial@@run: echo overgeslagen@@test-nativeschil.js@@de APK wordt gebouwd zonder de SPP-patch, zonder dat iets rood wordt"
"public/pidlane-sppproef.js@@      menu();\n      // De patchstand één keer opvragen@@      // De patchstand één keer opvragen@@bproef-sppproef.js@@de SPP-knoppen komen nooit in het Admin-menu: de module laadt, en niets zegt dat er iets ontbreekt"
# ── een meetopdracht over de app zelf, en twee schermfouten (#352, 30-09-2026) ──
"public/pidlane-opdracht.js@@            if (!Object.prototype.hasOwnProperty.call(APPMATEN, String(p.app)))@@            if (false)@@test-opdrachtappmaat.js@@een meetopdracht mag elke naam als app-maat opvragen: de witte lijst is geen grens meer"
"public/pidlane-opdracht.js@@                 vervuld: w === null ? null : (w >= v.tussen[0] && w <= v.tussen[1]),@@                 vervuld: w === null ? false : (w >= v.tussen[0] && w <= v.tussen[1]),@@test-opdrachtappmaat.js@@niet gemeten telt als niet vervuld — het verschil uit #227, nu voor app-maten"
"public/pidlane-opdracht.js@@    return (w >= lo && w <= hi) ? _uit('ok', staart, p, w, 1)@@    return true ? _uit('ok', staart, p, w, 1)@@test-opdrachtappmaat.js@@een app-maat buiten de band heet toch in orde: de opdracht van #352 kan niet rood worden"
"public/pidlane-sppproef.js@@      _volle.push({ t: Date.now(), patch: !!patch.patch, aan: !!(patch.patch && patch.aan !== false),@@      _volle.push({ t: Date.now(), patch: !!patch.patch, aan: !!patch.patch,@@test-sppproef.js@@een volle proef met de patch uit telt als proef met de patch aan: de tegenproef verdwijnt uit de meetopdracht"
"public/pidlane-archief.js@@display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:11px 2px@@display:flex;gap:6px 10px;align-items:center;padding:11px 2px@@bproef-regelruimte.js@@de knoppen van een rapport staan weer naast de titel, en op een telefoon met grote tekst valt alles over elkaar"
"public/pidlane-garage.js@@flex:0 1 auto;max-width:100%;min-width:0;white-space:normal;@@flex:0 0 auto;@@bproef-garage.js@@een lange knoptekst loopt de kaart uit"
# ── het anker van de BT-log na een herlaad (30-09-2026) ──
"public/pidlane-btflow.js@@Object.assign({},e,{vorige:true})@@Object.assign({},e)@@test-btlogcap.js@@teruggezette regels zijn niet meer herkenbaar: na een herlaad houdt het anker weer de vorige sessie vast en valt de VIN weg"
"public/pidlane-btflow.js@@const eigen=log.filter(r=>r && !r.vorige && !r.cap);@@const eigen=log.filter(r=>r && !r.cap);@@test-btlogcap.js@@de cap telt de vorige sessie mee als eigen regels: het anker is weer het pollverkeer van vóór de herlaad"
"public/pidlane-btflow.js@@  stand.weg+=eigen.length-kop.length-staart.length;@@  stand.weg=eigen.length-kop.length-staart.length;@@test-btlogcap.js@@de markering telt alleen de laatste ronde: \"301 regels weggelaten\" na tien minuten pollen"
# ── de accountstatus bij stand, elke keer vers uit D1 (#327, 01-10-2026) ──
# Hier stonden drie mutaties op de bewaartijd van PR #380; die is dezelfde
# dag weer weggehaald toen de klantentabel naar D1 ging.
"worker.js@@        if (pr) return json({ ok: false, error: pr.bericht, code: pr.code }, pr.status);\n        if (ak && ak.versie === \"verwijderd\") {@@        if (ak && ak.versie === \"verwijderd\") {@@test-klantstatus.js@@een geblokkeerde klant ziet gewoon zijn voertuigen: stand kijkt niet meer naar de status"
"worker.js@@  return await atZoek(env, \"klanten\", \"Email\", String(email || \"\").trim(), { lower: true });@@  return await atZoek(env, \"klanten\", \"Email\", String(email || \"\").trim());@@test-klantstatus.js@@een klant die zich met hoofdletters registreerde, wordt niet meer gevonden"
# ── AppConfig in D1, één keer overgezet (#327, 01-10-2026) ──
"worker.js@@  if (await db.prepare(\"SELECT 1 AS j FROM d1_overzet WHERE naam = 'appconfig'\").first()) return db;@@@@test-appconfig.js@@elke opstart leest AppConfig weer uit Airtable, ook na de overzet"
"worker.js@@      if (f.Key) rijen.push([String(f.Key), JSON.stringify(f.Value ?? \"\"),@@      if (f.Key) rijen.push([String(f.Key), String(f.Value ?? \"\"),@@test-appconfig.js@@een vinkje uit Airtable komt als tekst \"false\" terug, en dat leest de app als waar"
"worker.js@@    if (!r.ok) throw new Error(\"airtable_config_\" + r.status);@@@@test-appconfig.js@@een mislukte overzet wordt als gelukt genoteerd: de tabel blijft voorgoed leeg"
"worker.js@@    offset = d.offset || \"\";\n  } while (offset);\n  const nu@@    offset = \"\";\n  } while (offset);\n  const nu@@test-appconfig.js@@de tweede pagina uit Airtable valt weg bij de overzet"
# ── de D1-laag voor de rest van Airtable (#327, 01-10-2026) ──
"worker.js@@D1_TABELLEN.veldlab.velden[k])))];\n  if (onbekend.length) return json(@@D1_TABELLEN.veldlab.velden[k])))];\n  if (false) return json(@@test-veldlabroute.js@@een batch met één fout veld wordt half weggeschreven en komt bij de volgende poging dubbel"
"worker.js@@      gemaakt.push(await atUpsert(env, \"referentie\", \"RefID\", r2.fields));@@      gemaakt.push(await atMaak(env, \"referentie\", r2.fields));@@test-veldlabroute.js@@referentie maakt bij elke bevestiging een nieuwe rij in plaats van de oude bij te werken"
"worker.js@@  if (def && def.recId) return /^rec[A-Za-z0-9]{14}$/.test(String(v)) ? String(v) : null;@@  if (def && def.recId) return String(v);@@test-adminbron.js@@een willekeurige tekst gaat als id de WHERE in bij wissen in beheer"
"worker.js@@    offset = d.offset || \"\";\n  } while (offset);\n  const velden@@    offset = \"\";\n  } while (offset);\n  const velden@@test-d1laag.js@@bij de overzet van Klanten valt alles na de eerste honderd weg"
"worker.js@@    if (!al && env.AIRTABLE_TOKEN) await d1Overzet(env, db, sleutel, def);@@    if (env.AIRTABLE_TOKEN) await d1Overzet(env, db, sleutel, def);@@test-d1laag.js@@elke nieuwe isolate leest de hele Airtable-tabel opnieuw, ook na de overzet"
"worker.js@@    if (!r.ok) throw new Error(\`airtable_overzet_\${sleutel}_\${r.status}\`);@@@@test-d1laag.js@@een mislukte overzet wordt genoteerd als gelukt: de klantentabel blijft voorgoed leeg"
"worker.js@@    if (!r || !r.meta || !r.meta.changes) throw new Error(\`d1_niet_gevonden_\${def.d1}_\${id}\`);@@@@test-d1laag.js@@een saldowijziging op een klant die niet bestaat zegt gelukt"
"worker.js@@  if (soort === \"b\") return v === 1 || v === true;@@  if (soort === \"b\") return v === 1 || v === true || undefined;@@test-d1laag.js@@een uitgezet vinkje komt weer als \"geen veld\" terug, zoals bij Airtable, en uitzetten doet niets"
"worker.js@@  if (!Object.prototype.hasOwnProperty.call(def.velden, veld)) throw@@  if (false) throw@@test-d1laag.js@@een onbekend veld gaat ongezien als kolomnaam de SQL in"

"worker.js@@omschrijving = COALESCE(excluded.omschrijving, app_config.omschrijving)@@omschrijving = excluded.omschrijving@@test-appconfig.js@@opslaan in beheer zonder omschrijving wist de omschrijving"
# ── het element #btLog blijft begrensd (#302, 01-10-2026) ──
"public/pidlane-btflow.js@@logEl.appendChild(line); btLogDomAfkappen(logEl); @@logEl.appendChild(line); @@test-btlogdom.js@@het element #btLog groeit weer met elke regel mee: na tien minuten pollen kost elke btDiag 10 ms op de hoofddraad"
"public/pidlane-btflow.js@@  let weg=el.childElementCount-BTLOG_DOM;@@  let weg=0;@@test-btlogdom.js@@de afkapping staat erin maar haalt nooit iets weg"
# ── de snelheidsproef, stap voor stap (30-09-2026) ──
"public/pidlane-snelproef.js@@    if (nr !== verwacht) {@@    if (false) {@@test-snelproef.js@@een stap die niet aan de beurt is meet toch: stap 3 vóór stap 1 vergelijkt met niets"
"public/pidlane-snelproef.js@@      _zetPoll(was);\n      _zetStand('leesmanier terugzetten…');@@      _zetStand('leesmanier terugzetten…');@@test-snelproef.js@@na stap 3 blijft de app op de proefstand lezen, zonder dat iemand het weet"
"public/pidlane-snelproef.js@@    if (stap.actie === 'herstart' && !(await _herstartGezien())) {@@    if (false) {@@test-snelproef.js@@stap 6 telt zonder herstart: de uitslag zegt dat een herstart hielp terwijl er niets herstart is"
"public/pidlane-snelproef.js@@    window._lastSppReconnect = Date.now();\n    connected = false;@@    connected = false;@@test-snelproef.js@@de bewaker van de socket herverbindt mee tijdens het verversen: twee verbindingen door elkaar"
"public/pidlane-snelproef.js@@      try { await spp.disconnect({ address: adres }); }@@      try { }@@test-snelproef.js@@stap 2 opent een nieuwe socket zonder de oude te sluiten — dat is het pad van 01:11, geen verse verbinding"
"public/pidlane-snelproef.js@@    if (snel && ervoor > DOEL_MS) return@@    if (snel) return@@test-snelproef.js@@elke stap na de oplossing zegt ook \"dit hielp\": de uitslag wijst de verkeerde ingreep aan"
"public/pidlane-snelproef.js@@    if (typeof m.atrv === 'number') return m.atrv;\n    if (typeof m.ms === 'number') return m.ms;@@    if (typeof m.ms === 'number') return m.ms;\n    if (typeof m.atrv === 'number') return m.atrv;@@test-snelproef.js@@de tijd per groepsverzoek gaat voor de ATRV: een snelle adapter met een drukke bus heet traag"
"public/pidlane-snelproef.js@@    const rt = _rt(m);\n    if (rt === null)@@    const rt = (m && m.perSec >= 10) ? 1 : 999;\n    if (rt === null)@@test-snelproef.js@@het oordeel gaat weer over verzoeken/s: 9,7/s bij 54 ms heet traag, en een tempowissel heet een oplossing"
"public/pidlane-snelproef.js@@  try { document.addEventListener('DOMContentLoaded', menu); }@@  try { }@@bproef-snelproef.js@@de snelheidsproef laadt maar staat nergens in het menu"
# ── een socket die nog openstaat eerst dicht (30-09-2026) ──
"public/pidlane-bt.js@@  await sppOudeSluiten(spp, address);\n  await spp.connect({ address });@@  await spp.connect({ address });@@test-sppoudsluiten.js@@na een herlaad verbindt de app over een socket heen die nog openstaat: de MX+ weigert tot iemand op zijn knop drukt"
"public/pidlane-bt.js@@  if(!(c && (c.connected===true || c.isConnected===true))) return false;@@  if(c===false) return false;@@test-sppoudsluiten.js@@een onduidelijk antwoord van isConnected telt als open: de app sluit op een gok een verbinding die er niet is"
# ── versnelling: N alleen als het zeker is, de meter alleen een zeker cijfer (30-09-2026) ──
"public/pidlane-gear.js@@        doel = this._neutraal(r, p.rpm) ? 'N' : undefined;@@        doel = this._match(r) ? undefined : 'N';@@test-gear.js@@bij optrekken rond 1000 tpm staat er weer N terwijl je gas geeft"
"public/pidlane-gear.js@@    if (w===null || this.afwijking || !this.nummeringZeker()) return null;@@    if (w===null) return null;@@test-gear.js@@de meter toont een versnelling die bij afwijking of onzekere nummering niet klopt"
"public/pidlane-visueel.js@@window.PLGear.toonbaar() : null; }@@window.PLGear.waarde() : null; }@@bproef-visueel.js@@de meter vraagt weer waarde(): een onzeker cijfer in plaats van het embleem"
# ── live-acties onder de meter, bandenlampje rechtsonder (30-09-2026) ──
"public/pidlane.css@@.vis-lamp-banden { position:absolute; right:0; bottom:0; z-index:1; pointer-events:auto;@@.vis-lamp-banden { pointer-events:auto;@@bproef-banden.js@@het bandenlampje staat niet meer rechtsonder in de hoek van de meter"
# ── Slim visueel volgens #371 (30-09-2026): rijen, acculampje, autootje ──
"public/pidlane-visueel.js@@  if(ind && ind.plekken.pedaal) beoordeelTempo(ind.plekken.pedaal);\n@@@@test-visueel.js@@de tik meet het tempo van het pedaal niet meer: een traag pedaal blijft haperend in zijn rij"
"public/pidlane-visueel.js@@  ketens.push([ACCU_PID]);@@@@test-visueel.js@@Slim visueel zet de accuspanning niet meer aan, en het acculampje blijft leeg"
"public/pidlane-visueel.js@@  const vSt=plekOordeel('accu', extra.volt, null, extra.rpm);@@  const vSt=plekOordeel('accu', extra.volt, null);@@test-visueel.js@@het acculampje ziet niet meer dat een draaiende dynamo niet laadt"
"public/pidlane-visueel.js@@  } else if(volt){@@  } else if(volt && m){@@test-visueel.js@@het acculampje brandt alleen als er ook een motoroordeel is: zonder PLAandrijving geen spanning"
"public/pidlane-banden.js@@      uit[p] = (!st || st.ernst === 'geen' || !d || d.waarde === null || d.oud) ? 'geen' : w.ernst;@@      uit[p] = w ? w.ernst : 'geen';@@test-banden.js@@het autootje kleurt een band van een kwartier geleden groen"
"public/pidlane.css@@body.pl-visueel #plLiveWaak, body.pl-visueel #plLiveRec { display:none !important; }@@@@bproef-visueel.js@@Bewaken en Opnemen staan weer onder Slim visueel, naast de waakronde en de recorder in het vak"
# ── helling en G-kracht op één scherm (06-10-2026) ──
"public/pidlane-visprofiel.js@@  return '<div class=\"vpf-tel-boven\"><div>'+htmlHorizon(p, ind, 'hz-', false)@@  return '<div class=\"vpf-tel-boven\"><div>'+htmlHorizon(p, ind, '', false)@@test-visprofiel.js@@de horizon en de autootjes delen hun element-id's: de horizon beweegt niet en een autootje draait verkeerd"
"public/pidlane-visprofiel.js@@  try{ let v=localStorage.getItem(SLEUTEL); if(OUD_PROFIEL[v]) v=OUD_PROFIEL[v];@@  try{ let v=localStorage.getItem(SLEUTEL);@@test-visprofiel.js@@wie een van de oude telemetrieschermen gekozen had, valt terug op Basis"
# ── het emissiescherm is donker (06-10-2026) ──
"public/pidlane.css@@.vpf-licht { background:#0f141d;@@.vpf-licht { background:#f7f8fb;@@test-visprofiel.js@@het emissiescherm is weer wit en verblindt 's avonds in de auto"
# ── nooit een VIN als voertuignaam rechtsboven (06-10-2026) ──
"public/pidlane-uihelpers.js@@  el.dataset.naam = t ? (sysNaam(t, merk, vi.model) || 'Voertuig') : '';@@  el.dataset.naam = t||'';@@test-nav.js@@showVtag bewaart een VIN als naam: rechtsboven staan 17 tekens in plaats van de auto"
# ── het acculampje flitst niet meer weg bij een oude spanning (06-10-2026) ──
"public/pidlane-visueel.js@@  return { v:pidVals[pid], oud:isOud(pid, nu) };@@  return isOud(pid, nu) ? null : { v:pidVals[pid], oud:false };@@test-visueel.js@@een oude accuspanning gooit het lampje weg: de accu flitst weg tot de volgende meting"
"public/pidlane-visueel.js@@soort:'accu '+vSt+(extra.voltOud ? ' oud' : ''),@@soort:'accu '+vSt,@@test-visueel.js@@een oude accuspanning staat er even fel als een verse"
# ── G-cirkel: zij-G volgt het gevoel, piekballetje (#407) ──
"public/pidlane-visprofiel.js@@function gPunt(x, y){ return { cx:(100-x*80)@@function gPunt(x, y){ return { cx:(100+x*80)@@test-visprofiel.js@@rechts sturen zet de stip weer rechts, tegen het gevoel in"
"public/pidlane-visprofiel.js@@  if(!piek || t-piek.t > G_PIEK_MS || Math.hypot(x, y) >= Math.hypot(piek.x, piek.y)) return@@  if(true) return@@test-visprofiel.js@@het piekballetje volgt gewoon de stip: een hard remmoment is na het loslaten al weg"
"public/pidlane-visprofiel.js@@  if(!piek || t-piek.t > G_PIEK_MS ||@@  if(!piek ||@@test-visprofiel.js@@het piekballetje blijft eeuwig op de hardste rem van de rit staan"
"public/pidlane-visprofiel.js@@function gWis(){ _gNu={ x:0, y:0 }; _gPiek=null; gTeken(); }@@function gWis(){ _gNu={ x:0, y:0 }; gTeken(); }@@test-visprofiel.js@@Nulstellen laat het piekballetje van de oude stand staan"
# ── een gekozen berekende PID houdt zijn bronnen (#392) ──
"public/pidlane-berekend.js@@  if (_bronPoging[pid] && nu-_bronPoging[pid] < BRON_OPNIEUW_MS) return;@@  if (_bronPoging[pid]) return;@@test-berekendbronnen.js@@een bron die wegvalt komt niet terug: de tegel van de berekende PID blijft leeg tot een herstart"
"public/pidlane-berekend.js@@  if (_bronPoging[pid] && nu-_bronPoging[pid] < BRON_OPNIEUW_MS) return;\n  _bronPoging[pid]=nu;@@  _bronPoging[pid]=nu;@@test-berekendbronnen.js@@de bronnen worden bij elke tik opnieuw aangeboden: een logregel per 400 ms"
"public/pidlane-berekend.js@@      if (!set){ if (gekozen) nietTeBerekenen(pid, heeftNu); return; }@@      if (!set) return;@@test-berekendbronnen.js@@een gekozen berekende PID die op deze auto niet kan blijft leeg zonder te zeggen waarom"
"public/pidlane-berekend.js@@  if (r.weg && r.weg.length && !_bronGemeld['weg:'+pid]){\n    _bronGemeld['weg:'+pid]=true;@@  if (r.weg && r.weg.length){@@test-berekendbronnen.js@@een weigering van de sensorpoort komt elke 5 s opnieuw in het log"
# ── de koopcheck laat jouw kenteken staan (#331) ──
"public/pidlane-koopcheck.js@@_kent: kent, _val: val };\n@@_kent: kent, _val: val };\n    localStorage.setItem('pl_kenteken', kent);\n@@test-koopcheck-kenteken.js@@een koopcheck schrijft het kenteken van de gecheckte auto in pl_kenteken: je dossier hoort dan bij een vreemde auto"
# ── Bluetooth uit is geen "adapter niet gevonden" (#359) ──
"public/pidlane-bt.js@@    if (await btAanVoorKeten(spp, ble) === 'uit'){@@    if (false){@@test-btuit.js@@met Bluetooth uit start de keten toch: anderhalve minuut scannen en dan Contact aan?"
"public/pidlane-bt.js@@        if (e.__plBtUit || btUitFout(e.message)){@@        if (false){@@test-btuit.js@@een Bluetooth-is-uit-fout in de keten laat BLE en een tweede ronde nog lopen"
"public/pidlane-bt.js@@    if (btUitFout(se.message)){ const f@@    if (false){ const f@@test-btuit.js@@de SPP-scan zegt Bluetooth is disabled en de app zegt geen adapter gevonden"
"public/pidlane-bt.js@@const BT_UIT_RX = /\\b(bluetooth|ble)\\b( adapter)? @@const BT_UIT_RX = /( adapter)? @@test-btuit.js@@locatie uit leest als Bluetooth uit: de gebruiker zet iets aan dat al aan stond"
"public/pidlane-bt.js@@    if(ble && typeof ble.requestEnable === 'function') await ble.requestEnable();@@    if(false) await ble.requestEnable();@@test-btuit.js@@Android wordt niet gevraagd om Bluetooth aan te zetten, ook waar dat kan"
"public/pidlane-bt.js@@— keten loopt zoals altijd', 'warn'); return 'onbekend'; }@@— keten loopt zoals altijd', 'warn'); return 'uit'; }@@test-btuit.js@@een plugin die de stand niet geeft houdt elke verbinding tegen"
# ── eigen PIDs krijgen een standaardbereik: banden en olie (30-09-2026) ──
"public/pidlane-uitgebreid.js@@['wH', 'dH', 'dL'].forEach@@['wH'].forEach@@test-mode21.js@@een bandtemperatuur van 70 °C en een band op 1 bar blijven groen: de gevarengrenzen gaan niet mee (#370)"
"public/pidlane-uitgebreid.js@@      min: heeftBereik ? min : std ? std.min : -1e9, max: heeftBereik ? max : std ? std.max : 1e9,@@      min: heeftBereik ? min : -1e9, max: heeftBereik ? max : 1e9,@@test-mode21.js@@de banden en de olie staan weer op −1e9…1e9 en de balk in Slim blijft leeg"
"public/pidlane-uitgebreid.js@@return { min: 0, max: inU(4), dL: inU(1.5), dH: inU(3.5) };@@return { min: 0, max: 4, dL: 1.5, dH: 3.5 };@@test-mode21.js@@de bandenspanning in psi krijgt de grenzen in bar: 30 psi leest als te hoog"
"public/pidlane-pids.js@@  const top = (d && typeof d.balkVol==='number') ? d.balkVol\n            : (d && typeof d.dH==='number') ? d.dH@@  const top = (d && typeof d.dH==='number') ? d.dH@@test-mode21.js@@de balk van de bandtemperatuur loopt in Slim vol op 65 in plaats van 80 (#370)"
"public/pidlane-uitgebreid.js@@{ min: -40, max: 80, dH: 65, balkVol: 80 }@@{ min: 0, max: 80, dH: 65, balkVol: 80 }@@test-mode21.js@@een winterband van precies 0 °C leest als dummywaarde"
# ── geen ruwe VIN in een profielmelding (30-09-2026) ──
"public/pidlane-pids.js@@btDiag('Geen profiel onder '+_vinSleutelVoorLog(vin)+' — volle discovery','warn')@@btDiag('Geen profiel onder '+sleutel+' — volle discovery','warn')@@test-vin-meldingen.js@@de VIN staat weer voluit in het BT-log, en daarmee in elk gedeeld logboek"
"public/pidlane-pids.js@@function _vinSleutelVoorLog(vin){ return 'pl_vinprof_…'+String(vin||'').toUpperCase().slice(-6); }@@function _vinSleutelVoorLog(vin){ return vinProfileKey(vin); }@@test-vin-meldingen.js@@de maskerfunctie geeft de hele sleutel terug: elke melding lekt de VIN zonder dat de aanroepen veranderen"
"public/pidlane-sppproef.js@@      for (let i = 0; i < 120 && !klaar; i++) {@@      for (let i = 0; i < 0 && !klaar; i++) {@@test-sppproef.js@@de dode-socketknop meet weer midden in het opzetten van de verbinding, en noemt de duur van connectSerial"
# ── het proces, niet de pagina (30-09-2026, 12:31) ──
"native/PLDradenPlugin.java@@                    boolean rond = p >= 50;@@                    boolean rond = true;@@test-pldraden.js@@elke leesdraad telt als draaiend: de telling van 12:31 met \"5 draaiende draad\" is terug"
"native/PLDradenPlugin.java@@                r.put(\"pid\", android.os.Process.myPid());@@// pid weg@@test-pldraden.js@@het proces-ID ontbreekt: een nieuwe WebView in hetzelfde proces telt weer als herstart"
"public/pidlane-sppproef.js@@        if (a && a.proces && _procesNu && a.proces !== _procesNu) { localStorage.removeItem(SLEUTEL); }@@        if (false) { }@@test-sppproef.js@@een markering van een vorig proces blijft gelden: na een echte herstart blijft de bus \"aangetast\""
"public/pidlane-sppproef.js@@      if (_procesNu) localStorage.setItem(SLEUTEL, JSON.stringify(a));@@      if (false) localStorage.setItem(SLEUTEL, JSON.stringify(a));@@test-sppproef.js@@de markering staat weer in sessionStorage: wegvegen wist hem terwijl de draad blijft draaien"
"public/pidlane-sppproef.js@@    if (p && typeof p.beeindig === 'function') { await p.beeindig(); return true; }@@    /* beeindig weg */@@test-sppproef.js@@de knop beëindigt het proces niet en sluit alleen af — de draden blijven"
"public/pidlane-snelproef.js@@    if (nu && was) return nu !== was;@@    /* proces-ID weg */@@test-snelproef.js@@stap 6 telt wegvegen weer als herstart zolang sessionStorage leeg is"
"public/pidlane-plload.js@@  return Math.max(POLL_WACHT_MIN, Math.min(POLL_WACHT_MAX, eerste-now));@@  return POLL_WACHT_MAX;@@test-pollritme.js@@de pollus tikt weer vast om de 100 ms: de snelle klasse zakt naar 5 Hz en de bus staat half leeg"
"public/pidlane-plload.js@@  if(!connected||!activePIDs.size) return POLL_WACHT_MAX;@@@@test-pollritme.js@@zonder verbinding blijft alles aan de beurt en wordt de pollus 250 keer per seconde wakker"
"public/pidlane-plload.js@@    if(gen!==_pollGen) return;   // intussen gestopt of opnieuw gestart@@@@test-pollritme.js@@een stop tijdens een ronde plant toch de volgende: de app pollt door na het verbreken"
"public/pidlane-plload.js@@bezet?POLL_BEZET_MS:_pollWacht(Date.now())@@_pollWacht(Date.now())@@test-pollritme.js@@een bezette bus wordt elke paar ms opnieuw geprobeerd"
"public/pidlane-plload.js@@    const t=_pidDead.has(pid) ? (_pidDeadSince[pid]||0)+PID_REPROBE_MS : (_pidNextPoll[pid]||0);@@    const t=(_pidNextPoll[pid]||0);@@test-pollritme.js@@een gesnoeide PID staat altijd aan de beurt en houdt de pollus wakker voor niets"
"public/pidlane-data.js@@  if(!tok && naam!=='poll' && window.PLBus.owner()==='poll')@@  if(false)@@test-busslot.js@@de monitor grijpt naast het gat tussen twee pollrondes en komt er vrijwel nooit meer tussen"
"public/pidlane-data.js@@  if(!tok && naam!=='poll' && window.PLBus.owner()==='poll')@@  if(!tok && naam!=='poll')@@test-busslot.js@@ook achter een zware lezer gaat iedereen in de rij staan"

# De handleiding (30-09-2026). Drie fouten die gewoon gebeuren: een knop krijgt
# een andere id, een menuregel een andere tekst, en er sluipt een prijs in de
# tekst. De eerste twee laten een ! of een beschrijving stil verouderen.
"public/index.html@@id=\"plLiveDeel\"@@id=\"plLiveDelen\"@@test-help.js@@een knop met een uitroepteken is hernoemd en de tip vindt hem niet meer"
"public/index.html@@🩺 Check na verbinden<span@@🩺 Check na het verbinden<span@@test-help.js@@een menuregel is hernoemd en de handleiding noemt de oude tekst"
"public/pidlane-help-inhoud.js@@Codes worden met de hand verstuurd.@@Codes kosten € 4,99.@@test-help.js@@er staat een prijs in de handleiding"
# ── berekende PIDs uit bronnen van één moment (#337, 01-10-2026) ──
"public/pidlane-berekend.js@@      if (!samen(tijden)){@@      if (false){@@test-berekend.js@@bronnen van verschillende momenten rekenen weer samen: 96,7% rendement bij gas los"
"public/pidlane-berekend.js@@  return Math.max.apply(null, t)-Math.min.apply(null, t)<=SAMEN_MS;@@  return Math.max.apply(null, t)-Math.min.apply(null, t)<=VERS_MS;@@test-berekend.js@@de bronnen van één berekening mogen weer 3 s uit elkaar liggen"
"public/pidlane-berekend.js@@      return r1(Math.min(DEFS.CA03.max, Math.max(0, l/kmh*100)));@@      return r1(Math.min(99, Math.max(0, l/kmh*100)));@@test-berekend.js@@CA03 klemt weer op 99 en elk optrekken telt als buiten bereik"
"public/pidlane-berekend.js@@      return namen.length ? namen.reduce((a,k)=>a+p[k].buiten, 0) : null;@@      return namen.length ? 0 : null;@@test-berekend.js@@de app-maat berekend-buiten ziet een waarde buiten bereik niet"
# ── Slim visueel: tempo alleen rijdend, herbouw met reden (#338, 01-10-2026) ──
"public/pidlane-visueel.js@@  if(!rijdtNu() || !inBeeld()) return;\n  const t=gemetenTempo(pid,@@  if(!inBeeld()) return;\n  const t=gemetenTempo(pid,@@test-visueel.js@@een stilstand haalt het pedaal weer voor de hele rit van de meter"
"public/pidlane-visueel.js@@  const gat=_staat.laatsteTik>0 && nu-_staat.laatsteTik>3*VIS_TIK_MS;@@  const gat=false;@@test-visueel.js@@157 s op de achtergrond telt weer mee in het tempo van het pedaal"
"public/pidlane-visueel.js@@  const bus=_staat.pauze!==null && pauze!==_staat.pauze;@@  const bus=false;@@test-visueel.js@@een groepsproef of waakronde die de bus had, laat het pedaal van de meter vallen"
"public/pidlane-visueel.js@@  const t=gemetenTempo(pid, Math.max(_staat.rijdtSinds||0, Date.now()-VIS_VENSTER_MS));@@  const t=gemetenTempo(pid);@@test-visueel.js@@het tempo-oordeel kijkt weer over de hele sessie in plaats van het rijvenster"
"public/pidlane-visueel.js@@  if(selectieSleutel()!==_staat.selectie) return 'selectie';@@@@test-visueel.js@@een herbouw door een nieuwe sensorkeuze telt als knipperen dat de klant niet vroeg"
"public/pidlane-visueel.js@@  if(!rijdtNu() || !inBeeld()) return;\n  const t=gemetenTempo(pid,@@  if(!rijdtNu()) return;\n  const t=gemetenTempo(pid,@@test-visueel.js@@in beeld-in-beeld of op de achtergrond, met de meetdienst wakker, valt het pedaal van de meter"
"public/pidlane-visueel.js@@  if(perMin>1 || klant>herbouwMax) return@@  if(perMin>1 || (S.herbouw||0)>herbouwMax) return@@test-visueel.js@@de herbouwen van de testrun zelf maken de knipperproef weer rood"
# ── app-maten voor de meetrit: #302, #333, #376 (01-10-2026) ──
"public/pidlane-adapter.js@@    if (!uit.afgebroken && uit.situatie) _gpPer[uit.situatie] = uit;@@    if (uit.situatie) _gpPer[uit.situatie] = uit;@@test-adapterpaneel.js@@een afgebroken groepsproef telt als uitslag voor A, B of C"
"public/pidlane-adapter.js@@    if (koel >= 75) return 'b';@@    if (koel >= 50) return 'b';@@test-adapterpaneel.js@@een lauwe motor telt als warm, en proef B zegt dan iets over een koude bus"
"public/pidlane-adapter.js@@    if (kmh >= 50) return 'c';@@    if (kmh >= 5) return 'c';@@test-adapterpaneel.js@@stapvoets rijden telt als proef C op constante snelheid"
"public/pidlane-adapter.js@@    const g = (a.groepen || []).slice().sort(function (x, y) { return y.minuten - x.minuten; })[0] || null;\n    if (!g) return null;\n    switch (naam) {@@    const g = (a.groepen || []).slice(-1)[0] || null;\n    if (!g) return null;\n    switch (naam) {@@test-adapterpaneel.js@@de #302-maat kijkt naar de laatste verbinding in plaats van de langste, en een herverbinding wist de drift"
"public/pidlane-foutcodes.js@@    _door[hoe === 'vanzelf' || hoe === 'knop' ? hoe : 'gestopt']++;@@    _door.vanzelf++;@@test-foutcodes.js@@Blijf hier telt als vanzelf doorgegaan, en de meetopdracht van #376 sluit op ingrijpen"
# ── verbindprofiel (#388, 03-10-2026) ──
"public/pidlane-plload.js@@if(_plWeigeringen()!==_w0){ _plGeweigerdeRonde(cmd); break; }@@if(false){ _plGeweigerdeRonde(cmd); break; }@@test-pollritme.js@@een door de ELM-poort geweigerd groepsverzoek telt weer als lege batch (dip, PIDs stil) — #388"
"public/pidlane-plload.js@@if(_plPoortDicht()) return;@@if(false) return;@@test-pollritme.js@@de pollronde loopt door terwijl de ELM-poort dicht staat — #388"
"public/pidlane-bt.js@@const ref = ok.length>=5 ? ok[ok.length-2] : ok[ok.length-1];@@const ref = ok[ok.length-1];@@test-verbindprofiel.js@@één Bluetooth-haper bepaalt het ATST-plafond van een snelle auto"
"public/pidlane-bt.js@@const doel=Math.min(ST_TOP_MS, Math.max(ST_BODEM_MS, ref*2));@@const doel=Math.min(ST_TOP_MS, Math.max(ST_BODEM_MS, ref));@@test-verbindprofiel.js@@ATST zonder marge: het traagste antwoord valt precies op het plafond"
"public/pidlane-bt.js@@if(msNu!=null && !(b.ms>msNu)) return null;@@@@test-verbindprofiel.js@@het verbindgeheugen verlaagt ATST onder wat vandaag gemeten is"
"public/pidlane-bt.js@@if(String(bewaard.adapter||'')!==String(adapter||'')) return null;@@@@test-verbindprofiel.js@@het verbindgeheugen geldt ook over een andere adapter heen"
"public/pidlane-data.js@@if(S.batchGroep>=this.batchPlafond()) return false;@@if(S.batchGroep>=this.GROEP_AUTO_MAX) return false;@@test-verbindprofiel.js@@de groep klimt boven het plafond uit de groepsproef"
"public/pidlane-data.js@@c==='ATST64' ? 'ATST'+st :@@c==='ATST64' ? 'ATST64' :@@test-verbindprofiel.js@@de terugrol zet ATST weer op 400 ms in plaats van de gemeten waarde"
"worker.js@@vin_pseudo: vorm(b.vin_pseudo, /^[0-9a-f]{16}@@vin_pseudo: vorm(b.vin_pseudo, /^[0-9A-Za-z]{16,17}@@test-verbindprofiel.js@@een ruwe VIN komt als pseudoniem in de kennisbank (privacy)"
# ── verbindprofiel als app-maat (#394, 03-10-2026) ──
"public/pidlane-adapter.js@@return (st.msMet > 0 && st.msZonder > 0) ? Math.round((1 - st.msMet / st.msZonder) * 100) : null;@@return (st.msMet > 0 && st.msZonder > 0) ? Math.round((st.msMet / st.msZonder) * 100) : null;@@test-opdrachtappmaat.js@@de antwoordcijferwinst meldt de verhouding in plaats van de besparing: een cijfer dat niets doet lijkt 100% winst — #394"
"public/pidlane-adapter.js@@return st.totaal ? Math.round(st.bad / st.totaal * 100) : null;@@return st.foutPct;@@test-opdrachtappmaat.js@@het foutpercentage van de meetopdracht kijkt naar het venster van 10 s in plaats van de hele sessie — #394"
# ── verbinding met de hand (#394, 04-10-2026) ──
"public/pidlane-bt.js@@&& parseInt(st,16)>=0x0C) r.st=st;@@) r.st=st;@@test-verbindprofiel.js@@met de hand kan ATST onder de 48 ms-bodem — #394"
"public/pidlane-data.js@@(c==='ATAT1' ? 'ATAT'+at : c)@@c@@test-verbindprofiel.js@@de terugrol zet een met de hand gekozen ATAT weer op 1 — #394"
# ── ATST bijsturen tijdens de rit (#394, 04-10-2026) ──
"public/pidlane-bt.js@@return venster.slice(-ST_VENSTER).filter(Boolean).length>=ST_DREMPEL;@@return venster.slice(-ST_VENSTER).filter(Boolean).length>=1;@@test-verbindprofiel.js@@één ontbrekende PID zet ATST al omhoog — #394"
"public/pidlane-bt.js@@if(laatsteStap>0 && nu-laatsteStap<ST_RUST_MS) return false;@@@@test-verbindprofiel.js@@de ATST-regelaar stapt zonder rust, elke paar verzoeken een trede — #394"
"public/pidlane-bt.js@@for(const t of ST_TRAP) if(parseInt(t,16)>nu) return t;@@for(const t of ST_TRAP) if(parseInt(t,16)!==nu) return t;@@test-verbindprofiel.js@@de ATST-regelaar kan omlaag stappen — #394"
"public/pidlane-plload.js@@_plNoteVerbind(oordeel.mistBekend && oordeel.mistBekend.length>0);@@_plNoteVerbind(false);@@test-pollritme.js@@de pollronde meldt een verdwenen PID niet aan de ATST-regelaar — #394"
# ── de vensterhaken (#399, 04-10-2026) ──
"public/pidlane-bt.js@@window.plAtStand=plAtStand;@@window.plAtStand=function(){ return plAtStand(); };@@test-verbindprofiel.js@@de vensterhaak plAtStand roept zichzelf aan: stack overflow bij elke ELM-init, de app verbindt met geen enkele auto — #399"
"public/pidlane-telemetrie.js@@  return { helling:r1(asin(dot(u, voor))), kanteling:r1(asin(-dot(u, rechts))) };@@  return { helling:r1(asin(dot(u, voor))), kanteling:r1(asin(dot(u, rechts))) };@@test-telemetrie.js@@de kanteling heeft het omgekeerde teken: rechts omlaag leest als links omlaag"
"public/pidlane-telemetrie.js@@function beschikbaar(){ return _events>0 || _mEvents>0; }@@function beschikbaar(){ return true; }@@test-telemetrie.js@@de groep Telemetrie staat in de keuzelijst van een toestel zonder sensor: tegels die altijd — zeggen"
"public/pidlane-telemetrie.js@@  return vers() ? hoeken(_u, _nul || standaardNul(_u), _voor) : null;@@  return _u ? hoeken(_u, _nul || standaardNul(_u), _voor) : null;@@test-telemetrie.js@@een zwijgende sensor houdt zijn laatste hoek op de tegel alsof hij nog meet"
"public/pidlane-telemetrie.js@@  const kand=geleerd || (Math.abs(nul[2])<0.7 ? [0,0,-1] : [0,1,0]);@@  const kand=geleerd || [0,0,-1];@@test-telemetrie.js@@een plat liggende telefoon heeft geen vooruit: helling en kanteling worden onzin"
"public/pidlane-plload.js@@    // Een telefoonsensor (TL..) evenmin.\n    if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) continue;@@    // Een telefoonsensor (TL..) evenmin.@@bproef-telemetrie.js@@de pollus stuurt een telefoonsensor (TL01) als commando naar de auto"
"public/pidlane-bt.js@@  if(/^TL[0-9A-F]{2}1?$/i.test(String(cmd||'').trim())){@@  if(false){@@bproef-telemetrie.js@@sendCmd laat een telefoonsensor door naar de adapter"
"public/pidlane-telemetrie.js@@  const u=zwaarte(ag, aL, aD, ax.voor, ax.rechts);@@  const u=zwaarte(ag, 0, aD, ax.voor, ax.rechts);@@test-telemetrie.js@@remmen leest weer als voorover hellen: de rijversnelling gaat er niet af — #404"
"public/pidlane-telemetrie.js@@  const aD=(vers && typeof kmh==='number') ? -(kmh/3.6)*_gier : 0;@@  const aD=(vers && typeof kmh==='number') ? (kmh/3.6)*_gier : 0;@@test-telemetrie.js@@de bochtcorrectie heeft het verkeerde teken: een bocht leest als dubbele kanteling — #404"
"public/pidlane-telemetrie.js@@  _voor=null; _leer={ som:[0,0,0], n:0 };@@  _leer={ som:[0,0,0], n:0 };@@test-telemetrie.js@@na nulstellen in een andere houder blijft de oude rijrichting staan — #404"
"public/pidlane-visprofiel.js@@  else if(x.soort==='draai') f.setAttribute('transform', 'rotate('+(-v).toFixed(1)+' 100 100)');@@  else if(x.soort==='draai') f.setAttribute('transform', 'rotate('+(v).toFixed(1)+' 100 100)');@@test-visprofiel.js@@de kunstmatige horizon draait de verkeerde kant op: rechts omlaag leest als links omlaag"
"public/pidlane-visprofiel.js@@  const v=klem(val, x.lo, x.hi);@@  const v=Number(val)||0;@@test-visprofiel.js@@een onzinwaarde schuift de horizon uit het beeld"
"public/pidlane-functietest.js@@    if(/^tel(-|emetrie$)/.test(p.id)) return;@@    void 0;@@test-functietest.js@@de Full function test rekent de auto de telefoonweergaven aan als ongeschikt"
"public/pidlane-telemetrie.js@@  const gL=dot(lin, ax.voor)/G, gD=dot(lin, ax.rechts)/G;@@  const gL=dot(lin, ax.voor)/G, gD=-dot(lin, ax.rechts)/G;@@test-telemetrie.js@@de G-cirkel zet een bocht naar links aan de rechterkant"
"public/pidlane-telemetrie.js@@      if (hz.vast){ updPID(pid, w[pid]); _s.n++; }@@      if (true){ updPID(pid, w[pid]); _s.n++; }@@test-telemetrie.js@@een telefoon op schoot of los in een vakje telt mee in rapport, AI en bevindingen"
"public/pidlane-telemetrie.js@@  if (!o.genuld) return { vast:false, reden:'geen-nulstand' };\n@@@@test-telemetrie.js@@zonder nulstand geldt de telefoon als vast, ook al heeft niemand gezegd dat hij in een houder zit"
"public/pidlane-telemetrie.js@@    wiebelBij([w[0]-wg*ref[0], w[1]-wg*ref[1], w[2]-wg*ref[2]], nu);@@    wiebelBij(w, nu);@@test-telemetrie.js@@gieren telt als wiebel: elke rotonde maakt de telefoon in de houder onbetrouwbaar"
"public/pidlane-telemetrie.js@@  if (!(o.okMs>=HOUDER.rustMs)) return { vast:false, reden:'wacht' };\n@@@@test-telemetrie.js@@een telefoon die net is teruggezet telt meteen weer mee, zonder 5 s rust"
"public/pidlane-telemetrie.js@@  if (!houderNu().vast) return;\n  if (_nul && aL!==null)@@  if (_nul && aL!==null)@@test-telemetrie.js@@hard remmen telt als rijsituatie terwijl de telefoon los wiebelt"
# ── de beheerdersdemo (#409) ──
"public/pidlane-demo.js@@    try { return typeof window.isAdmin === 'function' && !!window.isAdmin(); }@@    try { return true; }@@test-demozandbak.js@@elke demo is een beheerdersdemo: een reviewer zonder login laat de echte AI rekenen — #409"
"public/pidlane-demo.js@@    if (!isDemo()) return false;\n    try { return typeof window.isAdmin@@    try { return typeof window.isAdmin@@test-demozandbak.js@@een beheerder buiten de demo telt als beheerdersdemo — #409"
"public/pidlane-demo.js@@ && !(beheer && WEIGER[i].beheer)) return WEIGER[i].reden;@@ && !beheer) return WEIGER[i].reden;@@test-demozandbak.js@@de beheerdersdemo stuurt verzonnen ritten naar de referentiedata en de applog — #409"
"public/pidlane-demo.js@@reden: 'de AI rekent niet op een verzonnen auto', beheer: true },@@reden: 'de AI rekent niet op een verzonnen auto' },@@test-demozandbak.js@@de beheerdersdemo krijgt toch het voorbeeldrapport: de AI-aanroep blijft dicht — #409"
"public/pidlane-plfetch.js@@PLDemo.netBesluit(pad, opties, PLDemo.volledig())@@PLDemo.netBesluit(pad, opties)@@test-demozandbak.js@@plFetch geeft de beheerdersdemo niet door: apiFetch vraagt de AI en krijgt een 403 — #409"
"public/pidlane-fuel.js@@ && !PLDemo.volledig()) return PLDemo.aiVoorbeeld(prompt, extra);@@) return PLDemo.aiVoorbeeld(prompt, extra);@@test-demozandbak.js@@de beheerdersdemo krijgt het voorbeeldrapport in plaats van de AI — #409"
"public/pidlane-motortype.js@@  if(window.PLDemo && PLDemo.actief() && !PLDemo.volledig()){@@  if(window.PLDemo && PLDemo.actief()){@@test-demozandbak.js@@de beheerdersdemo slaat geen bestanden op — #409"
# ── diesel: eigen sensoren op dezelfde weergaven (#393) ──
"public/pidlane-visprofiel.js@@  if(motor!=='diesel') return p.plekken;@@  return p.plekken;@@test-visprofiel.js@@een diesel krijgt weer lambda rond 1,00, de brandstoftrims en de ontsteking — #393"
"public/pidlane-visprofiel.js@@function ketens(id, motor, opts){\n  const p=voor(id, motor);@@function ketens(id, motor, opts){\n  const p=zoek(id);@@test-visprofiel.js@@Slim visueel zet op een diesel de roetfilter-PIDs niet aan: het scherm blijft leeg — #393"
"public/pidlane-visueel.js@@PF().indeling(pr, bruikbaar, motor, profielOpts())@@PF().indeling(pr, bruikbaar, undefined, profielOpts())@@test-visprofiel.js@@Slim visueel geeft de motorsoort niet door: een diesel ziet de benzinekaart — #393"
# ── Slim visueel: een plek zelf invullen (06-10-2026) ──
"public/pidlane-visprofiel.js@@eenheid:'°', soort:'thermo', lo:40, hi:150, dec:0, zoek:/olie|oil/i },@@eenheid:'°', soort:'thermo', lo:40, hi:150, dec:0 },@@test-visprofiel.js@@OLIE blijft leeg op de CX-5 terwijl de eigen motorolietemperatuur er is"
"public/pidlane-visprofiel.js@@      if(x.keten.indexOf(q)<0 && (bezet.indexOf(q)>=0 || eigen.indexOf(q)>=0)) continue;@@@@test-visprofiel.js@@een gekozen sensor staat twee keer in beeld, op zijn eigen plek en op de gekozen"
"public/pidlane-visprofiel.js@@  if(kz) k.push(kz);@@@@test-visprofiel.js@@de eigen keuze voor een plek wordt bewaard maar nooit getekend"
"public/pidlane-visprofiel.js@@function html(id, ind){\n  const p=voorInd(id, ind);@@function html(id, ind){\n  const p=voor(id, ind && ind.motor);@@test-visprofiel.js@@een gekozen accuspanning staat op BUITEN met het label Buiten en de schaal in graden"
"public/pidlane-visueel.js@@      if(t) kiesPlek(t.id.slice(6));@@      if(t) void 0;@@bproef-visplek.js@@tikken op een plek van Slim visueel doet niets: de keuzelijst opent nooit"
"public/pidlane-visprofiel.js@@        diesel:{ hi:6000 } },@@        diesel:{} },@@test-visprofiel.js@@de neonring van een diesel loopt tot 8000 tpm: 3000 staat er als bijna stationair — #393"
"public/pidlane-functietest.js@@    plekkenVan(p, brandstof).forEach(@@    p.plekken.forEach(@@test-functietest.js@@de Full function test beoordeelt een diesel op de benzinekaart — #393"

# ── Software als oorzaak (#426, 07-10-2026). Drie fouten die een vers gewiste
# auto, een benzineauto of een gewone sensorcode naar "inleren" zouden sturen.
"public/pidlane-data.js@@  const hangt = (sinds.km != null && sinds.km >= grens.km) || (sinds.warm != null && sinds.warm >= grens.warm);@@  const hangt = true;@@test-softwareoorzaak.js@@een monitor 40 km na wissen telt al als hangen: elke verse wis wordt een inleerprobleem"
"public/pidlane-data.js@@    if (f.brandstof && (brandstof === 'diesel' || brandstof === 'benzine') && f.brandstof !== brandstof) return null;@@@@test-softwareoorzaak.js@@een benzineauto krijgt het roetfilter-inleren voorgeschoteld"
"public/pidlane-data.js@@    if (!bewijs.length) return null;@@@@test-softwareoorzaak.js@@elke inleerfunctie verschijnt zonder enig bewijs, ook bij een gewone sensorcode"
"public/pidlane-data.js@@    if (f.sterkte === 'zwak' && !aanleiding) return null;@@@@test-softwareoorzaak.js@@een gewone P0420 komt als \"adaptaties wissen\" op het scherm: de sensorkant wordt software"
"public/pidlane-foutcodes.js@@    h += tekenSoftware(s, zelfGewist);\n@@@@test-foutcodes.js@@de keuringsstatus in Check mijn auto zegt nooit dat het software kan zijn — #426"
"public/pidlane-foutcodes.js@@    if (!s || zelfGewist) return [];@@    if (!s) return [];@@test-foutcodes.js@@direct na zelf wissen wijst elke hangende monitor naar inleren — #426"

# ── Het volledige onderzoek (#428, 07-10-2026). Wat de onderzoeker beslist:
# een andere richting op gaan, verbreden, doorpakken bij samenhang, de
# 2500-tpm-scheiding, het gewicht van een code in afwachting en de
# klachtherkenning. Plus de deur vanuit Check mijn auto.
"public/pidlane-onderzoek.js@@        speel(st, b.h, stap.titel);\n        stuk.nieuw.push(b.h);@@        return;@@test-onderzoek.js@@een foutcode die ergens anders naar wijst opent geen nieuwe richting"
"public/pidlane-onderzoek.js@@    if (st.verbreed) return false;@@    return false;@@test-onderzoek.js@@alles bij de klacht uitgesloten: hij verbreedt nooit"
"public/pidlane-onderzoek.js@@    if (samen) return true;@@@@test-onderzoek.js@@na \"accu zwak\" stopt hij zonder te kijken of de dynamo laadt"
"public/pidlane-onderzoek.js@@        if (s > 8 && t < s / 2) return [@@        if (s > 8 && t > s / 2) return [@@test-onderzoek.js@@de 2500-tpm-proef leest lek en luchtmassameter omgekeerd"
"public/pidlane-onderzoek.js@@      var gevonden = false, f = vast.indexOf(code) >= 0 ? 1 : 0.6;@@      var gevonden = false, f = 1;@@test-onderzoek.js@@een code in afwachting weegt even zwaar als een bevestigde"
"public/pidlane-onderzoek.js@@      if (KLACHTEN[k].kw.some(function (w) { return t.indexOf(' ' + w) >= 0; })) r.push(k);@@      if (KLACHTEN[k].kw.some(function (w) { return t.indexOf(w) >= 0; })) r.push(k);@@test-onderzoek.js@@\"verbruikt\" wordt rook: er staat \"ruikt\" in"
"public/pidlane-onderzoek.js@@  function nogOpen(c) { return c.open.filter(@@  function nogOpen(c) { return [].filter(@@test-onderzoek.js@@tegenstrijdig bewijs verdwijnt onder \"open\" uit de conclusie"
"public/pidlane-onderzoek.js@@    if (stap.garage && !st.ctx.garage) return false;@@@@test-onderzoek.js@@een klant krijgt de opdracht om tijdens het rijden vol op te trekken"
"public/pidlane-onderzoek.js@@      if (st.ctx.garage) h += tekenVerdenkingen(st)@@      h += tekenVerdenkingen(st)@@bproef-onderzoek.js@@een klant krijgt het hele verdenkingenbord en de tijdlijn te zien"
"public/pidlane-foutcodes.js@@      if (wat === 'oorzaak') { if (window.PLOnderzoek) PLOnderzoek.open({ scan: _st.scan }); else PLWizard.open('storing'); }@@      if (wat === 'oorzaak') PLWizard.open('storing');@@bproef-onderzoek.js@@Oorzaak laten zoeken opent weer de lijst losse modules in plaats van het onderzoek"
)

echo
echo "PidLane — tegenproef op de testreeks"
echo "─────────────────────────────────────────"

# Een vuile werkmap wordt niet meer beschadigd (de werkers draaien in hun eigen
# worktree), maar hij zou ook niet getoetst worden: een worktree is HEAD. Wie
# net een test verbouwde en niet committe, zou "gevangen" lezen over de oude.
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "${ROOD}  De werkmap heeft niet-vastgelegde wijzigingen.${UIT}"
  echo "  De tegenproef toetst wat er in HEAD staat, niet wat er in je werkmap"
  echo "  staat. Commit of stash je werk eerst, anders toets je de vorige versie."
  echo
  exit 2
fi

# ── Welke mutaties ────────────────────────────────────────────────
veld() {   # veld <regel> <n>: het n-de veld (0 = bestand … 4 = omschrijving)
  local r="$1" i
  for ((i=0; i<$2; i++)); do r="${r#*@@}"; done
  [ "$2" -lt 4 ] && r="${r%%@@*}"
  printf '%s' "$r"
}

KEUZE=()
if [ -n "$SINDS" ]; then
  basis=$(git -C "$REPO" merge-base "$SINDS" HEAD 2>/dev/null) || {
    echo "${ROOD}  --sinds $SINDS: geen gemeenschappelijke basis met HEAD gevonden.${UIT}"
    echo "  Haal hem eerst binnen (git fetch origin main) of noem een andere ref."
    exit 2
  }
  GEWIJZIGD=$'\n'"$(git -C "$REPO" diff --name-only "$basis" HEAD)"$'\n'
  # Tabelregels die sinds de basis bij kwamen of veranderden. Bash leest ze
  # zelf in, net als de tabel hierboven: dan is \" in de diff hetzelfde als "
  # in de array, en vergelijk je dezelfde vorm.
  eval "NIEUWE=( $(git -C "$REPO" diff -U0 "$basis" HEAD -- plmutate.sh | sed -n 's/^+"/"/p') )"
  NIEUW=$'\n'; for m in "${NIEUWE[@]}"; do NIEUW+="$m"$'\n'; done
  for i in "${!MUTATIES[@]}"; do
    m="${MUTATIES[$i]}"
    b=$(veld "$m" 0); t=$(veld "$m" 3)
    if [[ "$GEWIJZIGD" == *$'\n'"$b"$'\n'* || "$GEWIJZIGD" == *$'\n'"public/$t"$'\n'* || "$NIEUW" == *$'\n'"$m"$'\n'* ]]; then
      KEUZE+=("$i")
    fi
  done
  echo "${GRIJS}  deelrun: ${#KEUZE[@]} van ${#MUTATIES[@]} mutaties raken wat sinds $SINDS veranderde${UIT}"
else
  KEUZE=("${!MUTATIES[@]}")
fi

if [ -z "$PARALLEL" ]; then
  PARALLEL=$( (nproc || getconf _NPROCESSORS_ONLN || echo 1) 2>/dev/null | head -1 )
  [ "$PARALLEL" -gt 4 ] 2>/dev/null && PARALLEL=4
fi
[[ "$PARALLEL" =~ ^[1-9][0-9]*$ ]] || { echo "--parallel verwacht een getal vanaf 1, niet '$PARALLEL'"; exit 2; }
[ "$PARALLEL" -gt "${#KEUZE[@]}" ] && PARALLEL=${#KEUZE[@]}

if [ "${#KEUZE[@]}" -eq 0 ]; then
  echo "  Niets te doen: geen enkele mutatie raakt wat sinds $SINDS veranderde."
  echo
  echo "${GEEL}Deelrun zonder mutaties — dit zegt niets over de volle tabel.${UIT}"
  exit 0
fi
echo "${GRIJS}  ${#KEUZE[@]} mutaties, $PARALLEL tegelijk${UIT}"

# ── De werkers ────────────────────────────────────────────────────
WERK="$(mktemp -d "${TMPDIR:-/tmp}/plmutate.XXXXXX")"
WERKERS=()
opruimen() {
  for p in "${WERKERS[@]}"; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  for ((k=1; k<=PARALLEL; k++)); do
    [ -d "$WERK/w$k" ] && git -C "$REPO" worktree remove --force "$WERK/w$k" >/dev/null 2>&1
  done
  git -C "$REPO" worktree prune >/dev/null 2>&1
  rm -rf "$WERK"
}
trap 'opruimen; echo; echo "${GEEL}Afgebroken — de werkmap is niet aangeraakt.${UIT}"; exit 130' INT TERM

mkdir -p "$WERK/rij" "$WERK/uit"
for ((k=1; k<=PARALLEL; k++)); do
  git -C "$REPO" worktree add --detach --quiet "$WERK/w$k" HEAD || { echo "${ROOD}  git worktree add mislukte${UIT}"; opruimen; exit 2; }
done

# Eén mutatie in één worktree. Schrijft de uitslag naar $WERK/uit/<i>:
# regel 1 is gevangen/ontsnapt/overgeslagen, regel 2 de toelichting.
draai() {
  local w="$1" i="$2" regel="${MUTATIES[$2]}"
  local bestand zoek vervang test uit="$WERK/uit/$2" raak uitkomst
  bestand=$(veld "$regel" 0); zoek=$(veld "$regel" 1); vervang=$(veld "$regel" 2); test=$(veld "$regel" 3)
  if [ ! -f "$w/$bestand" ]; then printf 'overgeslagen\n%s bestaat niet\n' "$bestand" > "$uit.tmp"; mv "$uit.tmp" "$uit"; return; fi
  if [ ! -f "$w/public/$test" ]; then printf 'overgeslagen\n%s bestaat niet\n' "$test" > "$uit.tmp"; mv "$uit.tmp" "$uit"; return; fi

  # Vervangen met python: de zoektekst bevat regex-tekens en aanhalingstekens
  # die sed zouden laten struikelen. count=1 dwingt af dat het anker uniek
  # genoeg is; is het dat niet, dan moet de tabel scherper.
  raak=$(ZOEK="$zoek" VERVANG="$vervang" python3 - "$w/$bestand" <<'PY'
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
    git -C "$w" checkout --quiet -- "$bestand"
    printf 'overgeslagen\nanker %s× gevonden in %s (moet 1× zijn)\n' "$raak" "$bestand" > "$uit.tmp"; mv "$uit.tmp" "$uit"; return
  fi
  ( cd "$w/public" && node "$test" >/dev/null 2>&1 )
  uitkomst=$?
  git -C "$w" checkout --quiet -- "$bestand"
  if [ $uitkomst -ne 0 ]; then printf 'gevangen\n%s werd rood\n' "$test" > "$uit.tmp"
  else printf 'ontsnapt\n%s bleef groen — die test dekt dit niet\n' "$test" > "$uit.tmp"; fi
  mv "$uit.tmp" "$uit"
}

# Een werker loopt de rij af en claimt elke mutatie met mkdir: dat is atomair,
# dus twee werkers pakken nooit dezelfde. De trage (browserproeven) verdelen
# zich zo vanzelf.
werker() {
  local w="$1" i
  for i in "${KEUZE[@]}"; do
    mkdir "$WERK/rij/$i" 2>/dev/null || continue
    draai "$w" "$i"
  done
}
for ((k=1; k<=PARALLEL; k++)); do
  werker "$WERK/w$k" &
  WERKERS+=($!)
done

# ── Het verslag, in tabelvolgorde ─────────────────────────────────
gevangen=0; ontsnapt=0; overgeslagen=0
ONTSNAPT_LIJST=""
OVERGESLAGEN_LIJST=""
for i in "${KEUZE[@]}"; do
  while [ ! -f "$WERK/uit/$i" ]; do
    # Een werker die stierf laat zijn mutatie nooit af: niet eeuwig wachten.
    levend=0; for p in "${WERKERS[@]}"; do kill -0 "$p" 2>/dev/null && levend=1; done
    [ $levend -eq 0 ] && [ ! -f "$WERK/uit/$i" ] && { echo "${ROOD}  werkers gestopt vóór mutatie $i klaar was${UIT}"; opruimen; exit 2; }
    sleep 0.2
  done
  omschrijving=$(veld "${MUTATIES[$i]}" 4)
  { read -r soort; read -r uitleg; } < "$WERK/uit/$i"
  case "$soort" in
    gevangen)
      echo "${GROEN}  gevangen${UIT}      $omschrijving"
      echo "                ${GRIJS}$uitleg${UIT}"
      gevangen=$((gevangen+1)) ;;
    ontsnapt)
      echo "${ROOD}  ONTSNAPT${UIT}      $omschrijving"
      echo "                ${GRIJS}$uitleg${UIT}"
      ontsnapt=$((ontsnapt+1))
      ONTSNAPT_LIJST="$ONTSNAPT_LIJST\n    - $omschrijving ($(veld "${MUTATIES[$i]}" 3))" ;;
    *)
      echo "${GEEL}  OVERGESLAGEN${UIT}  $omschrijving"
      echo "                ${GRIJS}$uitleg${UIT}"
      overgeslagen=$((overgeslagen+1))
      OVERGESLAGEN_LIJST="$OVERGESLAGEN_LIJST\n    - $omschrijving ($uitleg)" ;;
  esac
done
wait
trap - INT TERM
opruimen

echo "─────────────────────────────────────────"
echo "$gevangen gevangen, $ontsnapt ontsnapt, $overgeslagen overgeslagen"

# Laatste zekerheid: de werkmap moet zijn zoals hij was.
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

if [ -n "$SINDS" ]; then
  echo "${GROEN}Elke nagebouwde fout in deze deelrun is gevangen.${UIT}"
  echo "${GEEL}Deelrun: ${#KEUZE[@]} van ${#MUTATIES[@]}. De volle tabel draait in CI.${UIT}"
else
  echo "${GROEN}Elke nagebouwde fout is gevangen.${UIT}"
fi
echo
exit 0
