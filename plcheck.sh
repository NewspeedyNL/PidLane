#!/data/data/com.termux/files/usr/bin/bash
# ══════════════════════════════════════════════════════════════════
# plcheck.sh — valideer PidLane vóór een commit
# ──────────────────────────────────────────────────────────────────
# Doet in één keer wat er tot nu toe met de hand gebeurde, en wat dus
# soms is overgeslagen:
#
#   1. node --check op elk JS-bestand
#   2. de volledige testsuite (elke test moet exit 0 geven)
#   3. div-balans van de HTML
#   4. scripttag-controle: elke pidlane-*.js hangt in index.html
#      (pidlane-bedrading.js moet als LAATSTE staan)
#
# Draaien:  plcheck            (vanuit elke map)
#           plcheck ~/pad/repo (andere repo)
#
# Exit 0 = veilig om te committen. Alles daarboven = niet doen.
# ══════════════════════════════════════════════════════════════════

REPO="${1:-$HOME/PidLane}"
PUB="$REPO/public"
[ -d "$PUB" ] || { echo "Geen public/ in $REPO"; exit 2; }
cd "$PUB" || exit 2

ROOD=$'\033[31m'; GROEN=$'\033[32m'; GEEL=$'\033[33m'; UIT=$'\033[0m'
fout=0

echo
echo "PidLane — validatie van $(basename "$REPO")"
echo "─────────────────────────────────────────"

# ── 1. syntax ──
n=0; stuk=0
for f in *.js; do
  n=$((n+1))
  if ! node --check "$f" >/dev/null 2>&1; then
    echo "${ROOD}  SYNTAXFOUT${UIT}  $f"
    node --check "$f" 2>&1 | head -3 | sed 's/^/              /'
    stuk=$((stuk+1))
  fi
done
[ $stuk -eq 0 ] && echo "${GROEN}  ok${UIT}  syntax — $n bestanden" || fout=$((fout+stuk))

# ── 2. tests ──
t=0; gefaald=0
for f in test-*.js; do
  [ -e "$f" ] || continue
  t=$((t+1))
  if ! node "$f" >/tmp/plcheck_$$.log 2>&1; then
    echo "${ROOD}  TEST FAALT${UIT}  $f"
    tail -12 /tmp/plcheck_$$.log | sed 's/^/              /'
    gefaald=$((gefaald+1))
  fi
done
rm -f /tmp/plcheck_$$.log
[ $gefaald -eq 0 ] && echo "${GROEN}  ok${UIT}  tests — $t stuks, allemaal exit 0" || fout=$((fout+gefaald))

# ── 3. div-balans ──
for h in index.html admin.html; do
  [ -e "$h" ] || continue
  op=$(grep -o '<div\b' "$h" | wc -l)
  dicht=$(grep -o '</div>' "$h" | wc -l)
  if [ "$op" -ne "$dicht" ]; then
    echo "${ROOD}  DIV SCHEEF${UIT}  $h — $op open, $dicht dicht"
    fout=$((fout+1))
  else
    echo "${GROEN}  ok${UIT}  div-balans $h — $op/$dicht"
  fi
done

# ── 4. scripttags ──
# Een module die niet in index.html hangt, laadt niet — en faalt dan stil,
# want de aanroepen zitten in try-catch. Precies het geval waar de
# bedradingscontrole voor bestaat, maar dan één laag eerder.
ontbreekt=""
for f in pidlane-*.js; do
  grep -q "src=\"$f\"" index.html || ontbreekt="$ontbreekt $f"
done
if [ -n "$ontbreekt" ]; then
  echo "${GEEL}  LET OP${UIT}  niet in index.html:$ontbreekt"
  fout=$((fout+1))
else
  echo "${GROEN}  ok${UIT}  elke module hangt in index.html"
fi

laatste=$(grep -o 'src="pidlane-[a-z0-9-]*\.js"' index.html | tail -1)
if [ "$laatste" != 'src="pidlane-bedrading.js"' ]; then
  echo "${GEEL}  LET OP${UIT}  pidlane-bedrading.js hoort als laatste script te staan"
  echo "              nu laatste: $laatste"
  fout=$((fout+1))
else
  echo "${GROEN}  ok${UIT}  bedradingscontrole staat achteraan"
fi

echo "─────────────────────────────────────────"
if [ $fout -eq 0 ]; then
  echo "${GROEN}Alles goed — veilig om te committen.${UIT}"
  echo
  git -C "$REPO" status --short | head -20
  echo
  exit 0
fi
echo "${ROOD}$fout probleem(en) — nog niet committen.${UIT}"
echo
exit 1
