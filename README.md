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
bridge is ~80 lines, has no auth, and listens only on `127.0.0.1:8787`.

Nothing about your screen ever leaves your machine.

## Quick start

### 1. Run the bridge

```bash
git clone https://github.com/Pikel1997/aura.git
cd aura
python3 bridge.py
```

The bridge will offer to auto-install its single Python dependency
(`pywizlight`) on first run, then auto-discover your bulb and print a
banner. Keep this terminal open.

If you'd rather use a virtualenv:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python bridge.py
```

If `pip install` fails on macOS with "externally-managed-environment",
use the venv path above — recent macOS Pythons block global installs by
default.

### 2. Open the web app

Visit your deployed Aura page (or run it locally — see
[`web/README.md`](web/README.md)).

Click **Start Aura**, pick a Chrome tab, done.

## Repo layout

```
aura/
├── bridge.py          ← local HTTP↔UDP bridge (80 LOC)
├── wiz_ambient/
│   ├── bulb.py        ← BulbController: WiZ discovery, eased animator
│   ├── video.py       ← (legacy desktop app)
│   ├── audio.py       ← (legacy desktop app)
│   └── app.py         ← (legacy desktop app — see below)
├── web/               ← Next.js + Tailwind + Framer Motion frontend
│   ├── app/
│   ├── components/
│   └── lib/
├── requirements.txt   ← Python deps for the bridge
└── vercel.json        ← Vercel monorepo config
```

## Color algorithm

Same algorithm in Python (`wiz_ambient/video.py`) and TypeScript
(`web/lib/colors.ts`):

1. Sample the edge ring of the captured tab (top/bottom/left/right
   strips, ~15% width each)
2. Linearize sRGB → linear light (gamma 2.2)
3. Compute per-pixel luminance (Rec. 709) and HSV-style chroma
4. **Achromatic check**: if average chroma is below 0.12, output white
   scaled by luminance. Stops white movie scenes from getting a yellow
   bulb from skin-tone bias.
5. Otherwise: weighted average in linear space with weight = chroma² ·
   √luminance. Squaring chroma kills the influence of skin tones, wood,
   and walls; vivid content dominates.
6. Re-encode linear → sRGB, renormalize so the brightest channel hits
   1.0, send to the bulb.

Brightness is mapped from perceptual luminance with a mild gamma curve
and a 10% floor. Below the floor → bulb off (the WiZ firmware can't go
dimmer than 10% anyway).

## Bulb animator

The bulb's WiZ firmware accepts updates at most every 100 ms
(`accUdpPropRate`). Aura's animator runs at exactly 10 Hz, eases color
toward the target at 65% per tick, eases brightness slightly faster
(80%) so luminance changes feel snappier than hue changes (the eye
notices brightness first), and snaps instantly on scene cuts. Total
perceptual latency: ~140 ms — the hardware floor.

## Privacy

- Tab capture and color extraction happen 100% in your browser
- The bridge only listens on `127.0.0.1` and only forwards to your bulb
- No telemetry, no accounts, no cloud
- The Vercel deployment is a static page — no backend, no database

## Legacy desktop app

The original native Mac app lives in `wiz_ambient/app.py`. It still
works (`python run.py`) and supports both audio and video modes, but
the web frontend is the recommended path going forward. The desktop app
will be removed once the web flow has feature parity.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
