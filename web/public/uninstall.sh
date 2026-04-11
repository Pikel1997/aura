#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  Aura bridge uninstaller
#
#  Removes everything install.sh sets up:
#    - ~/.aura/                                    (sources + venv + logs)
#    - ~/Library/LaunchAgents/app.aura.bridge.plist (launchd agent)
#    - any running bridge process
#
#  Hosted by your Aura web deployment alongside install.sh.
# ─────────────────────────────────────────────────────────────────────

set -e

AURA_DIR="$HOME/.aura"
PLIST_FILE="$HOME/Library/LaunchAgents/app.aura.bridge.plist"

cat <<'BANNER'

  ╭───────────────────────────────────────────────╮
  │                                               │
  │     A U R A   ·   bridge uninstaller          │
  │                                               │
  ╰───────────────────────────────────────────────╯

BANNER

# 1. Stop the launchd agent
if [ -f "$PLIST_FILE" ]; then
  echo "  →  Unloading launchd agent…"
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# 2. Kill any running bridge processes
echo "  →  Stopping bridge process…"
pkill -f "$AURA_DIR/bridge.py" 2>/dev/null || true
pkill -f "aura.*bridge.py" 2>/dev/null || true
sleep 1

# 3. Remove the plist
if [ -f "$PLIST_FILE" ]; then
  echo "  →  Removing launchd plist…"
  rm -f "$PLIST_FILE"
fi

# 4. Remove the install directory
if [ -d "$AURA_DIR" ]; then
  echo "  →  Removing $AURA_DIR…"
  rm -rf "$AURA_DIR"
fi

echo
echo "  ╭───────────────────────────────────────────────╮"
echo "  │                                               │"
echo "  │     ✓  Aura bridge fully removed.             │"
echo "  │                                               │"
echo "  │     To reinstall, open the Aura web app and   │"
echo "  │     copy the one-liner shown there.           │"
echo "  │                                               │"
echo "  ╰───────────────────────────────────────────────╯"
echo

exit 0
