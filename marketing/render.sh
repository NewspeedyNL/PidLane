#!/bin/bash
# Rendert marketing/advertentie.html naar drie PNG's in marketing/.
# Voorkeur: headless_shell (exacte beeldmaat); anders een gewone Chromium met --headless.
set -e
cd "$(dirname "$0")"
CHROME=${CHROME:-$(ls /opt/pw-browsers/chromium_headless_shell-*/*/headless_shell 2>/dev/null | head -1)}
[ -x "$CHROME" ] || CHROME=$(command -v chromium || command -v google-chrome)
EXTRA=; [ "$(basename "$CHROME")" = headless_shell ] || EXTRA=--headless
for f in "vierkant 1080,1080" "staand 1080,1920" "breed 1200,628"; do
  set -- $f
  "$CHROME" $EXTRA --no-sandbox --hide-scrollbars --virtual-time-budget=5000 \
    --window-size="$2" --screenshot="$PWD/pidlane-$1.png" "file://$PWD/advertentie.html?f=$1" 2>/dev/null
  echo "pidlane-$1.png"
done
