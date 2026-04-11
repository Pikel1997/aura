# Contributing

Thanks for your interest. This is a small hobby project — keep PRs
focused and the scope tight.

## Architecture in one paragraph

Aura is a Vite + React web app deployed on Vercel that captures a
Chrome tab via `getDisplayMedia`, extracts a dominant color in JS at
10 Hz, and POSTs that color to a tiny local Python bridge running on
the user's machine. The bridge (`bridge.py` at the repo root) forwards
the color to a Philips WiZ smart bulb over UDP. The bulb is on the
user's LAN and only speaks UDP, the browser can only speak HTTP — the
bridge is the translator. Each user runs the bridge once via a one-line
installer (`web/public/install.sh`), which registers a launchd
LaunchAgent so the bridge auto-starts on every login from then on.

## Dev setup

You'll usually want both halves running side-by-side.

### Frontend (Vite)

```bash
cd web
npm install
npm run dev
```

Opens <http://localhost:3000>. See [`web/README.md`](web/README.md)
for the project layout, state machine, and the `?debug` flag.

### Bridge (Python)

From the repo root, in a separate terminal:

```bash
python3 bridge.py
```

The bridge will offer to auto-install `pywizlight` on first run. If
your system Python complains about `externally-managed-environment`,
make a venv:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python bridge.py
```

The bridge listens on `http://127.0.0.1:8787` and exposes
`/health`, `/discover`, `/status`, `/connect`, `/color`, and `/off`.
The frontend's `src/lib/bridge.ts` is the typed client.

You'll need a real Philips WiZ bulb on your local network. The
algorithm has been tuned against an `ESP25_SHRGB_01` — other models
should work but may want different `MIN_BRI` / animator constants in
`wiz_ambient/bulb.py`.

## Guidelines

- One change per PR — bug fixes and features shouldn't mix
- Don't commit anything under `logs/`, `venv/`, `web/node_modules/`,
  `web/dist/`, or the compiled `wiz_ambient/capture_audio` binary
- The color algorithm lives in two places (`wiz_ambient/video.py`
  and `web/src/lib/colors.ts`) — keep them in sync if you tune one
- Same for the animator constants (`wiz_ambient/bulb.py` and
  `web/src/app/App.tsx`)
- Test on a real WiZ bulb before opening a PR — include the model ID
  from `getModelConfig`
- Match the existing code style; no large refactors without discussion
  first

## Reporting bugs

Open an issue with:

- Browser version (Chrome / Arc / Edge / etc.)
- macOS version
- Python version
- WiZ bulb model (run `python3 -c "import asyncio,pywizlight;
  print(asyncio.run(pywizlight.wizlight('YOUR_IP').getModelConfig()))"`)
- What the bridge prints in its terminal window (or `~/.aura/bridge.log`
  if installed via the one-liner)
- Steps to reproduce

## Security

For anything security-sensitive (e.g., you find a way to hijack
someone else's bulb, or a way to make the bridge expose itself beyond
loopback), please email the maintainer privately rather than opening
a public issue.
