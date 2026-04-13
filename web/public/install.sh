#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  Aura bridge installer
#
#  Sets up a tiny local HTTP→UDP bridge that lets the Aura web app
#  control your Philips WiZ smart bulb. After this runs once, the
#  bridge will auto-start on every login — you never need to touch
#  Terminal again.
#
#  Re-running this script updates the bridge to the latest version.
#
#  This script is hosted by your Aura web deployment — visit the page
#  in your browser and copy the one-liner shown there to run it.
# ─────────────────────────────────────────────────────────────────────

set -e

AURA_DIR="$HOME/.aura"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/app.aura.bridge.plist"
LOG_FILE="$AURA_DIR/bridge.log"
TARBALL_URL="https://github.com/Pikel1997/aura/archive/refs/heads/main.tar.gz"

# ── Banner ──────────────────────────────────────────────────────────
cat <<'BANNER'

  ╭───────────────────────────────────────────────╮
  │                                               │
  │     A U R A   ·   bridge installer            │
  │                                               │
  ╰───────────────────────────────────────────────╯

BANNER

# ── 1. Sanity check ─────────────────────────────────────────────────
if ! command -v python3 >/dev/null 2>&1; then
  echo "  ✗  python3 is not installed."
  echo
  echo "     Install Python from https://www.python.org/downloads/"
  echo "     and run this installer again."
  echo
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "  ✗  curl is not installed (this should never happen on macOS)."
  exit 1
fi

# ── 2. Stop any previous bridge ─────────────────────────────────────
echo "  →  Cleaning up any previous instance…"
launchctl unload "$PLIST_FILE" 2>/dev/null || true
pkill -f "$AURA_DIR/bridge.py" 2>/dev/null || true
sleep 1

# ── 3. Download latest sources ──────────────────────────────────────
echo "  →  Downloading the bridge from github.com/Pikel1997/aura…"
mkdir -p "$AURA_DIR"
cd "$AURA_DIR"
curl -fsSL "$TARBALL_URL" | tar -xz --strip-components=1

# ── 4. Set up the Python environment ────────────────────────────────
echo "  →  Setting up Python environment…"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --quiet --disable-pip-version-check --upgrade pip
./venv/bin/pip install --quiet --disable-pip-version-check pywizlight

# ── 5. Register the LaunchAgent (auto-start on every login) ─────────
if [ "$(uname)" = "Darwin" ]; then
  echo "  →  Registering bridge to auto-start on login…"
  mkdir -p "$PLIST_DIR"
  cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>app.aura.bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$AURA_DIR/venv/bin/python</string>
    <string>$AURA_DIR/bridge.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$AURA_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AURA_AUTO_INSTALL</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
</dict>
</plist>
PLIST
  launchctl load "$PLIST_FILE"
else
  # Linux fallback — no launchd, just nohup
  echo "  →  Starting bridge in the background…"
  nohup ./venv/bin/python bridge.py > "$LOG_FILE" 2>&1 &
  disown
fi

# ── 6. Wait for the bridge to respond ───────────────────────────────
echo "  →  Verifying bridge is running…"
ok="no"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s http://127.0.0.1:8787/health >/dev/null 2>&1; then
    ok="yes"
    break
  fi
  sleep 1
done

if [ "$ok" = "yes" ]; then
  echo "  ✓  Bridge running on http://127.0.0.1:8787"
else
  echo "  ⚠  Bridge installed but didn't respond yet — give it a moment."
  echo "     Check $LOG_FILE if it still doesn't connect."
fi

# ── 7. Bring the browser back ───────────────────────────────────────
if [ "$(uname)" = "Darwin" ]; then
  echo "  →  Returning you to your browser…"
  # Bring back whatever browser the user was using — detect the default
  # browser from macOS Launch Services instead of hardcoding Chrome.
  DEFAULT_BROWSER=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is false and background only is false' 2>/dev/null || echo "")
  # Fallback: read the default HTTP handler
  if [ -z "$DEFAULT_BROWSER" ]; then
    BUNDLE_ID=$(defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers 2>/dev/null \
      | grep -B1 "https" | grep "LSHandlerRoleAll" | head -1 | sed 's/.*= "//;s/";//' 2>/dev/null || echo "")
    case "$BUNDLE_ID" in
      *chrome*)  DEFAULT_BROWSER="Google Chrome" ;;
      *safari*)  DEFAULT_BROWSER="Safari" ;;
      *arc*)     DEFAULT_BROWSER="Arc" ;;
      *brave*)   DEFAULT_BROWSER="Brave Browser" ;;
      *firefox*) DEFAULT_BROWSER="Firefox" ;;
      *edge*)    DEFAULT_BROWSER="Microsoft Edge" ;;
      *)         DEFAULT_BROWSER="" ;;
    esac
  fi
  # Try the detected browser first, fall back to common ones
  if [ -n "$DEFAULT_BROWSER" ]; then
    osascript -e "tell application \"$DEFAULT_BROWSER\" to activate" 2>/dev/null || true
  else
    osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null \
      || osascript -e 'tell application "Safari" to activate' 2>/dev/null \
      || osascript -e 'tell application "Arc" to activate' 2>/dev/null \
      || true
  fi
fi

# ── 8. Friendly closing message ─────────────────────────────────────
echo
echo "  ╭───────────────────────────────────────────────╮"
echo "  │                                               │"
echo "  │     ✓  All set. Head back to your browser.    │"
echo "  │                                               │"
echo "  │     The bridge will auto-start every time     │"
echo "  │     you log in — you're done with Terminal.   │"
echo "  │                                               │"
echo "  ╰───────────────────────────────────────────────╯"
echo

# ── 9. Auto-close this terminal window (best effort) ────────────────
if [ "$(uname)" = "Darwin" ]; then
  sleep 2
  osascript -e 'tell application "Terminal" to close (front window)' 2>/dev/null || true
fi

exit 0
