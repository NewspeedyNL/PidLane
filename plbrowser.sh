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
# ══════════════════════════════════════════════════════════════════

REPO="${1:-$HOME/PidLane}"
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
n=0; stuk=0
for f in bproef-*.js; do
  [ -e "$f" ] || continue
  n=$((n+1))
  echo "── $f"
  if node "$f"; then :; else
    echo "${ROOD}  ROOD${UIT}  $f gaf exit $?"
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
