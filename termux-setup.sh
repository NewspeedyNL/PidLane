#!/data/data/com.termux/files/usr/bin/bash
# ══════════════════════════════════════════════════════════════════
# termux-setup.sh — PidLane-werkplek op de telefoon
# ──────────────────────────────────────────────────────────────────
# Eenmalig draaien in Termux. Daarna heb je op je toestel:
#   - Node.js, dus `node --check` en de volledige testsuite
#   - git met SSH-sleutel voor push naar GitHub
#   - het commando `plcheck` dat alles valideert vóór een commit
#
# Termux uit F-Droid halen, NIET uit de Play Store: die versie is jaren
# oud en de pakketbron werkt er niet meer op.
#
# Draaien:  bash termux-setup.sh
# ══════════════════════════════════════════════════════════════════
set -e

REPO_SSH="git@github.com:GEBRUIKERSNAAM/PidLane.git"   # <-- pas dit aan
MAP="$HOME/PidLane"

echo "── 1/6 pakketbron bijwerken ──"
pkg update -y && pkg upgrade -y

echo "── 2/6 gereedschap installeren ──"
# nodejs-lts is stabieler dan nodejs voor dit doel; openssh voor de push;
# nano zodat je onderweg een regel kunt aanpassen zonder een editor te zoeken.
pkg install -y nodejs-lts git openssh nano which
node --version
git --version

echo "── 3/6 opslag koppelen ──"
# Geeft toegang tot ~/storage/downloads, handig om een zip of log uit de app
# naar de repo te kopiëren. Android vraagt om toestemming.
termux-setup-storage || echo "  (overgeslagen — kan later met termux-setup-storage)"

echo "── 4/6 git instellen ──"
git config --global user.name  "${GIT_NAAM:-Nico}"
git config --global user.email "${GIT_MAIL:-nico@example.com}"
git config --global init.defaultBranch main
git config --global pull.rebase false

if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  echo "  SSH-sleutel aanmaken (Enter bij elke vraag = geen wachtwoord)"
  ssh-keygen -t ed25519 -C "termux-s26" -f "$HOME/.ssh/id_ed25519" -N ""
  echo
  echo "  ▼ ZET DEZE SLEUTEL IN GITHUB → Settings → SSH and GPG keys → New SSH key"
  echo
  cat "$HOME/.ssh/id_ed25519.pub"
  echo
  read -p "  Klaar? Enter om door te gaan. " _
fi

echo "── 5/6 repo ophalen ──"
if [ -d "$MAP/.git" ]; then
  echo "  bestaat al, alleen bijwerken"
  git -C "$MAP" pull --ff-only || echo "  (pull overgeslagen)"
else
  git clone "$REPO_SSH" "$MAP" || {
    echo
    echo "  Clonen mislukt. Staat REPO_SSH bovenin dit script goed, en is de"
    echo "  sleutel in GitHub gezet? Handmatig: git clone <url> $MAP"
    exit 1
  }
fi

echo "── 6/6 plcheck installeren ──"
mkdir -p "$HOME/.local/bin"
cp "$MAP/plcheck.sh" "$HOME/.local/bin/plcheck" 2>/dev/null || {
  echo "  plcheck.sh nog niet in de repo — kopieer 'm daar later heen."
}
chmod +x "$HOME/.local/bin/plcheck" 2>/dev/null || true

RC="$HOME/.bashrc"
grep -q 'PidLane-werkplek' "$RC" 2>/dev/null || cat >> "$RC" <<'EOF'

# ── PidLane-werkplek ──
export PATH="$HOME/.local/bin:$PATH"
alias pl='cd ~/PidLane'
alias plt='cd ~/PidLane/public && for t in test-*.js; do printf "%-24s" "$t"; node "$t" >/dev/null 2>&1 && echo ok || echo FAAL; done; cd - >/dev/null'
EOF

echo
echo "════════════════════════════════════════════"
echo " Klaar. Nieuwe sessie openen of:  source ~/.bashrc"
echo
echo "   pl        → naar de repo"
echo "   plcheck   → alles valideren vóór een commit"
echo "   plt       → alleen de tests"
echo "════════════════════════════════════════════"
