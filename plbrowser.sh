#!/data/data/com.termux/files/usr/bin/bash
# ══════════════════════════════════════════════════════════════════
# plbrowser.sh — draai de browserproeven (bproef-*.js)
# ──────────────────────────────────────────────────────────────────
# WAAROM DIT NAAST plcheck.sh STAAT EN ER NIET IN
#
# plcheck.sh is de commit-poort en moet op Termux draaien. Daar staat geen
# Chromium, en die krijgt er ook geen: een poort die op de telefoon niet
# kan draaien is geen poort meer.
#
# Deze proeven starten de ECHTE index.html in een echte browser. Dat is de
# enige manier om iets te toetsen dat over de KOPPELING tussen modules gaat
# — precies de fouten die de test-*.js-reeks per definitie niet ziet, omdat
# die functies uit hun verband knipt.
#
# Ontbreekt Chromium, dan slaat dit script over met exit 0 en zegt dat er
# niets gemeten is. Dat is met opzet: "overgeslagen" mag nooit als "goed"
# gelezen worden, maar het mag ook geen commit tegenhouden op een toestel
# waar het niet kán.
#
# In CI staat Chromium er wél, en daar draait dit als eigen job. Overslaan
# is daar dus geen ontsnapping.
#
# Draaien:  bash plbrowser.sh .
#           bash plbrowser.sh . --parallel 4   vier proeven tegelijk
#
# PARALLEL SINDS 14-10-2026. 49 proeven na elkaar kostten in CI 8,5 minuut,
# bijna allemaal wachten op Chromium en de app-boot. plbrowser.js kiest per
# proef een vrije poort en een eigen profielmap — plmutate.sh draait ze al
# vier tegelijk — dus naast elkaar kan. De uitvoer blijft in bestandsvolgorde.
# Standaard: het aantal kernen, hoogstens 4.
# ══════════════════════════════════════════════════════════════════

REPO=""; PARALLEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --parallel|-j) PARALLEL="$2"; shift 2 ;;
    --parallel=*)  PARALLEL="${1#*=}"; shift ;;
    -*)            echo "Onbekende optie: $1 (bekend: --parallel N)"; exit 2 ;;
    *)             REPO="$1"; shift ;;
  esac
done
REPO="${REPO:-$HOME/PidLane}"
if [ -z "$PARALLEL" ]; then
  PARALLEL=$( (nproc || getconf _NPROCESSORS_ONLN || echo 1) 2>/dev/null | head -1 )
  [ "$PARALLEL" -gt 4 ] 2>/dev/null && PARALLEL=4
fi
[[ "$PARALLEL" =~ ^[1-9][0-9]*$ ]] || { echo "--parallel verwacht een getal vanaf 1, niet '$PARALLEL'"; exit 2; }
PUB="$REPO/public"
[ -d "$PUB" ] || { echo "Geen public/ in $REPO"; exit 2; }

ROOD=$'\033[31m'; GROEN=$'\033[32m'; GEEL=$'\033[33m'; UIT=$'\033[0m'

echo
echo "PidLane — browserproeven van $(basename "$REPO")"
echo "─────────────────────────────────────────"

# Chromium zoeken via het harnas zelf, zodat er één lijst met paden is en
# niet twee die uit de pas gaan lopen.
CHROOM=$(cd "$REPO" && node -e "process.stdout.write(require('./plbrowser.js').vindChromium()||'')" 2>/dev/null)
if [ -z "$CHROOM" ]; then
  echo "${GEEL}  OVERGESLAGEN${UIT}  geen Chromium op dit toestel"
  echo
  echo "  Er is dus NIETS gemeten — dit is geen groen licht."
  echo "  In CI draaien deze proeven wel. Wil je ze hier ook: zet PL_CHROME"
  echo "  naar een Chromium-binary, of draai ze op een pc."
  echo
  exit 0
fi
echo "  Chromium: $CHROOM"
echo

cd "$PUB" || exit 2
PROEVEN=(); for f in bproef-*.js; do [ -e "$f" ] && PROEVEN+=("$f"); done
n=${#PROEVEN[@]}; stuk=0
UITMAP="$(mktemp -d "${TMPDIR:-/tmp}/plbrowser.XXXXXX")"
trap 'rm -rf "$UITMAP"' EXIT
echo "  ${#PROEVEN[@]} proeven, $PARALLEL tegelijk"
echo

# Elke proef schrijft naar zijn eigen bestand; de exitcode komt als laatste
# in <naam>.exit, dus "bestaat .exit" betekent "klaar".
draai() { node "$1" > "$UITMAP/$1.uit" 2>&1; echo $? > "$UITMAP/$1.exit"; }
lopend=0
for f in "${PROEVEN[@]}"; do
  if [ "$lopend" -ge "$PARALLEL" ]; then wait -n; lopend=$((lopend-1)); fi
  draai "$f" &
  lopend=$((lopend+1))
done
wait

for f in "${PROEVEN[@]}"; do
  echo "── $f"
  cat "$UITMAP/$f.uit"
  code=$(cat "$UITMAP/$f.exit" 2>/dev/null || echo "?")
  if [ "$code" != "0" ]; then
    echo "${ROOD}  ROOD${UIT}  $f gaf exit $code"
    stuk=$((stuk+1))
  fi
  echo
done

echo "─────────────────────────────────────────"
if [ "$n" -eq 0 ]; then
  echo "${GEEL}Geen bproef-*.js gevonden.${UIT}"
  exit 0
fi
if [ "$stuk" -eq 0 ]; then
  echo "${GROEN}$n browserproef/proeven, allemaal goed.${UIT}"
  exit 0
fi
echo "${ROOD}$stuk van $n browserproeven staat rood.${UIT}"
exit 1
