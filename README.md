# Aura

Reactive lighting for your Philips WiZ smart bulb. Pick any Chrome tab,
watch your room glow with whatever's playing.

<p align="center"><em>Web frontend on Vercel · Local Python bridge · Real-time, frame by frame</em></p>

## How it works

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Aura web app    │    │  bridge.py       │    │  WiZ bulb        │
│  (Vercel)        │    │  (your machine)  │    │  (your LAN)      │
│                  │    │                  │    │                  │
│  Tab capture →   │───▶│  HTTP → UDP      │───▶│  port 38899      │
│  color extract   │    │                  │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

The web app handles tab capture and color extraction entirely in the
browser. WiZ bulbs only speak UDP on your LAN, so a tiny local Python
bridge translates HTTP requests from the page into UDP commands. The
bridge listens only on `127.0.0.1:8787` and registers a launchd agent
so it auto-starts on every login — you only have to set it up once.

Nothing about your screen ever leaves your machine.

## Quick start (the easy way)

Open your deployed Aura page in Chrome. The page shows a one-line
installer card. Click **Copy**, open Terminal once (⌘+Space → "Terminal"),
paste, hit return:

```bash
curl -fsSL https://YOUR-DEPLOYMENT.vercel.app/install.sh | bash
```

The script downloads the bridge into `~/.aura/`, installs `pywizlight`
in a virtualenv, registers a launchd LaunchAgent so the bridge starts
on every login, brings your browser back to the front, and closes the
Terminal window. Total time: ~30 seconds.

You'll never see this screen again — the next time you open Aura, the
bridge is already running and you go straight to picking a tab.

To **uninstall** later:

```bash
curl -fsSL https://YOUR-DEPLOYMENT.vercel.app/uninstall.sh | bash
```

This stops the launchd agent and removes `~/.aura/` and the plist.

## Quick start (the manual way)

If you'd rather see what you're running:

```bash
git clone https://github.com/Pikel1997/aura.git
cd aura
python3 bridge.py
```

The bridge will offer to auto-install its single Python dependency
(`pywizlight`) on first run. Then visit your deployed Aura page (or
run the frontend locally — see [`web/README.md`](web/README.md)) and
click **Start Aura**.

If `pip install` complains with "externally-managed-environment" on
recent macOS, use a virtualenv:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python bridge.py
```

## Repo layout

```
aura/
├── bridge.py                 ← local HTTP↔UDP bridge (~150 LOC, stdlib)
├── wiz_ambient/
│   ├── bulb.py               ← BulbController: WiZ discovery, eased animator
│   ├── video.py              ← (legacy desktop app)
│   ├── audio.py              ← (legacy desktop app)
│   └── app.py                ← (legacy desktop app — see below)
├── web/                      ← Vite + React + Tailwind v4 frontend
│   ├── public/
│   │   ├── install.sh        ← one-line bridge installer
│   │   └── uninstall.sh      ← one-line bridge uninstaller
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx       ← single-page experience + state machine
│   │   │   └── components/   ← Orb, InstallBridge, StatusPill, …
│   │   ├── lib/
│   │   │   ├── bridge.ts     ← typed API client for the local bridge
│   │   │   └── colors.ts     ← chroma²-weighted blend (TS port of video.py)
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
├── requirements.txt          ← Python deps for the bridge
├── README.md                 ← (you are here)
└── .vercelignore             ← hides Python from Vercel scanner
```

## Color algorithm

The same algorithm runs in Python (`wiz_ambient/video.py`) and
TypeScript (`web/src/lib/colors.ts`):

1. Sample the edge ring of the captured tab (top/bottom/left/right
   strips, ~15% width each)
2. Linearize sRGB → linear light (gamma 2.2)
3. Compute per-pixel luminance (Rec. 709) and HSV-style chroma
4. **Achromatic check**: if mean chroma is below 0.12, output white
   scaled by luminance. Stops white movie scenes from getting a yellow
   bulb from skin-tone bias.
5. Otherwise: weighted average in linear space with weight = chroma² ·
   √luminance. Squaring chroma kills the influence of skin tones, wood,
   and walls; vivid content dominates.
6. Re-encode linear → sRGB, renormalize so the brightest channel hits
   1.0, send to the bulb.

Brightness is mapped from perceptual luminance with a mild gamma curve
and a 10% floor — below the floor, the bulb turns off entirely (the
WiZ firmware can't dim past 10% anyway).

## Bulb animator

The bulb's WiZ firmware accepts updates at most every 100 ms
(`accUdpPropRate`). Aura's animator runs at exactly 10 Hz, eases color
toward the target at 65% per tick, eases brightness slightly faster
(80%) so luminance changes feel snappier than hue changes (the eye
notices brightness first), and snaps instantly on scene cuts. Total
perceptual latency is around 140 ms — the hardware floor.

## Privacy

- Tab capture and color extraction happen 100% in your browser
- The bridge only listens on `127.0.0.1` and only forwards to your bulb
- No telemetry, no accounts, no cloud
- The Vercel deployment is a static page — no backend, no database, no
  user tracking

## Legacy desktop app

The original native Mac app lives in `wiz_ambient/app.py`. It still
works (`python run.py`) and supports both audio and video modes, but
the web frontend is the recommended path going forward and the desktop
app will be removed once the web flow has feature parity.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
