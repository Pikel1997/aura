# Contributing

Small hobby project. Keep PRs focused.

## Architecture

Vite + React web app on Vercel captures a Chrome tab via
`getDisplayMedia`, extracts a dominant color in JS at 10 Hz, and POSTs
it to a tiny local Python bridge. The bridge forwards to a Philips WiZ
bulb over UDP (LAN-only, no cloud).

Each user runs the bridge once via a one-line installer
(`web/public/install.sh`), which registers a launchd LaunchAgent so it
auto-starts on every login.

## Dev setup

Frontend:

```bash
cd web
npm install
npm run dev
```

Bridge (separate terminal, repo root):

```bash
python3 bridge.py
```

If macOS blocks pip:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python bridge.py
```

## Guidelines

- One change per PR
- Don't commit `logs/`, `venv/`, `web/node_modules/`, `web/dist/`, or
  `wiz_ambient/capture_audio`
- The color algorithm lives in two places (`wiz_ambient/video.py` and
  `web/src/lib/colors.ts`) — keep them in sync
- Same for the animator constants (`wiz_ambient/bulb.py` and
  `web/src/app/App.tsx`)
- Test on a real WiZ bulb before opening a PR

## Bug reports

Include:

- Browser + version
- macOS + Python versions
- WiZ bulb model
- Bridge log (`~/.aura/bridge.log` if installed via the one-liner)
- Steps to reproduce

## Security

For anything sensitive (e.g. a way to hijack someone else's bulb, or
to make the bridge listen beyond loopback), email the maintainer
privately rather than opening a public issue.
