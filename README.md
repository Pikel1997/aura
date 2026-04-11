# Aura

Reactive lighting for your Philips WiZ smart bulb. Pick a Chrome tab,
watch your room glow with whatever's playing.

## How it works

```
Browser  ──HTTP──▶  bridge.py  ──UDP──▶  WiZ bulb
(Vercel)            (your Mac)           (your LAN)
```

WiZ bulbs only speak UDP on your LAN. Browsers can't speak UDP. So a
tiny local Python bridge translates between them. Runs on every login,
listens only on `127.0.0.1:8787`. ~150 lines, stdlib only.

## Quick start

Open the deployed Aura page → click **Start Aura** → pick *I have a
bulb* → copy the curl line → paste into Terminal → return.

That's it. After the first install the bridge auto-starts on every
login forever.

To uninstall:

```bash
curl -fsSL https://YOUR-DEPLOYMENT.vercel.app/uninstall.sh | bash
```

## Manual setup

```bash
git clone https://github.com/Pikel1997/aura.git
cd aura
python3 bridge.py
```

The bridge offers to auto-install `pywizlight` on first run. If
macOS blocks it ("externally-managed-environment"), use a venv:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python bridge.py
```

## Repo layout

```
aura/
├── bridge.py            # local HTTP↔UDP bridge
├── wiz_ambient/         # BulbController + legacy desktop app
├── web/                 # Vite + React + Tailwind v4 frontend
│   ├── public/
│   │   ├── install.sh
│   │   └── uninstall.sh
│   └── src/
└── requirements.txt
```

## How the colors are picked

Same algorithm in `wiz_ambient/video.py` and `web/src/lib/colors.ts`:

1. Sample the edge ring of the captured tab (15% strips, top/bottom/left/right)
2. Linearize sRGB → linear light
3. Per-pixel luminance (Rec. 709) and HSV-style chroma
4. If mean chroma < 0.12 → output white scaled by luminance (kills the
   skin-tone yellow bias on white scenes)
5. Otherwise: weighted average in linear space, weight = chroma² · √luminance
6. Re-encode and renormalize so the brightest channel hits 1.0

Brightness is mapped from perceptual luminance with a 10% floor —
below the floor, the bulb turns off (the WiZ firmware can't dim past
10% anyway).

## Bulb animator

WiZ firmware accepts updates at most every 100 ms. Aura's animator
runs at exactly 10 Hz, eases color toward target at 0.65/tick,
brightness at 0.80/tick, snaps instantly on scene cuts. ~140 ms total
perceptual latency — the hardware floor.

## Privacy

- Tab capture and color extraction happen 100% in your browser
- The bridge only listens on `127.0.0.1`
- No telemetry, no accounts, no cloud
- The Vercel page is fully static — no backend

## Legacy desktop app

The original native Mac app lives in `wiz_ambient/app.py`
(`python run.py`). Still works, supports both audio and video modes,
but the web flow is the recommended path going forward.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
