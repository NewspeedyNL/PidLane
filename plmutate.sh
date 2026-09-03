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
"public/pidlane-pids.js@@    if(hiddenPIDs.has(pid)) pidToon(pid); else pidVerberg(pid);@@    pidDeselect(pid);@@test-verbergen.js@@een dubbeltik op een tegel zet de sensor weer uit in plaats van hem te verbergen"
"public/pidlane-pids.js@@    if(hiddenPIDs.has(pid)) return;@@@@test-verbergen.js@@een verborgen PID krijgt tóch een tegel"
"public/pidlane-pids.js@@  hiddenPIDs.forEach(function(p){ if(!activePIDs.has(p)) hiddenPIDs.delete(p); });@@@@test-verbergen.js@@een opnieuw aangevinkte sensor blijft onzichtbaar door een achtergebleven verborgen-stand"
"public/pidlane-pids.js@@weg.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); pidDeselect(pid); };@@weg.onclick=function(ev){ if(ev&&ev.stopPropagation) ev.stopPropagation(); pidVerberg(pid); };@@test-verbergen.js@@het kruisje in de verborgen-strook zet niets uit"
"worker.js@@          const r1 = await fetch(recUrl, { headers: hdr });\n          if (!r1.ok) return { fout: \"Klant niet gevonden.\", status: 404 };\n          const huidig@@          const r1 = r0;\n          const huidig@@test-bijboeken.js@@bijboeken rekent met de lezing van vóór het slot in plaats van een verse"
"worker.js@@      if (uitkomst.bezet)\n        return json({ ok: false, code: \"saldo_bezet\", error: \"Er loopt al een andere tegoedwijziging voor deze klant. Probeer het zo nog eens.\" }, 409);@@@@test-bijboeken.js@@een bezet saldo-slot laat het bijboeken toch doorlopen"
"worker.js@@      if (!email)\n        return json({ ok: false, code: \"saldo_geen_email\", error: \"Deze klant heeft geen e-mailadres; het tegoed kan niet veilig gewijzigd worden.\" }, 409);@@@@test-bijboeken.js@@bijboeken zet het slot op een leeg e-mailadres in plaats van te weigeren"
"admin/admin.html@@  if (body?.code==='saldo_bezet') {@@  if (body?.code==='saldo_bezet_oud') {@@test-bijboeken.js@@admin.html kent de code voor een bezet saldo-slot niet meer"
"worker.js@@if (a.length !== b.length) return false;@@if (a.length !== b.length) return true;@@test-token.js@@safeEqual keurt ongelijke lengtes goed"
"worker.js@@if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;\\n    const p = JSON.parse(b64urlToString(payload));\\n    if (!p.exp@@const p = JSON.parse(b64urlToString(payload));\\n    if (!p.exp@@test-token.js@@verifyToken controleert de handtekening niet meer"
"worker.js@@if (!p.exp || Math.floor(Date.now() / 1e3) >= p.exp) return null;@@@@test-token.js@@een verlopen sessietoken blijft geldig"
"worker.js@@const legacyEnabled = String(env.ALLOW_LEGACY_APP_TOKEN || \"\").toLowerCase() === \"true\";@@const legacyEnabled = true;@@test-token.js@@het legacy-token werkt zonder dat de schakelaar aanstaat"
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
