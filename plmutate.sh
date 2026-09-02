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
# Exit 1 = er is een fout doorheen gekomen; die test dekt minder dan hij lijkt.
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
"public/pidlane-uitgebreid.js@@schoon.indexOf(hdr) >= 0;@@true;@@test-mode21.js@@de uitgebreide probe accepteert elk antwoord"
"public/pidlane-plload.js@@const batchable=due.filter(p=>!isBitmapPid(p)&&_m01(p));@@const batchable=due.filter(p=>!isBitmapPid(p));@@test-mode21.js@@mode 21 gaat weer stilzwijgend mee in een mode-01-batch"
"public/pidlane-pids.js@@const sigma=Math.max(b.std, Math.abs(b.mean)*BASE_SIGMA_MIN, 1e-9);@@const sigma=Math.max(b.std, 1e-9);@@test-baseline.js@@de sigma-bodem is weg; strakke historie laat alles afgaan"
"public/pidlane-pids.js@@const BASE_DREMPEL = 3;@@const BASE_DREMPEL = 2.5;@@test-baseline.js@@de bevindingsdrempel is terug naar 2,5 sigma"
"worker.js@@if (a.length !== b.length) return false;@@if (a.length !== b.length) return true;@@test-token.js@@safeEqual keurt ongelijke lengtes goed"
"worker.js@@if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;@@@@test-token.js@@verifyToken controleert de handtekening niet meer"
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
    overgeslagen=$((overgeslagen+1)); continue
  fi
  if [ ! -f "$PUB/$test" ]; then
    echo "${GEEL}  OVERGESLAGEN${UIT}  $test bestaat niet"
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
zoek, vervang = os.environ['ZOEK'], os.environ['VERVANG']
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
