# WiZ Ambient

Reactive lighting for your Philips WiZ smart bulb, driven by your Mac's screen or system audio. Lives in the menu bar, looks native, runs in the background.

<p align="center"><em>Menu bar app • Screen or audio reactive • Native macOS • Open source</em></p>

## Features

- **Audio mode** — Captures system audio via ScreenCaptureKit (no virtual audio driver needed). FFT-based mood classification (energetic / chill / ambient / romantic / dark / bright / happy) with beat detection, BPM estimation, and two styles:
  - *Smooth* — gradual color transitions that follow the music's mood and energy
  - *Snappy* — hard cuts on every beat from mood-aware color palettes
- **Video mode** — Captures the screen (or a specific window) and drives the bulb with the dominant color, with smoothed transitions
- **Window selection** — Target a specific app window (e.g., a YouTube tab) instead of the whole screen
- **Menu bar native** — Lives in the top bar, close the window and it keeps running
- **Color correction** — Compensates for the WiZ bulb's non-linear LED response so on-screen colors actually match the bulb
- **Settings persistence** — Your bulb IP, mode, sliders, and preferences are remembered across launches
- **Auto-discovery** — Finds bulbs on any local subnet
- **Session logs** — Human-readable logs per session for debugging

## Requirements

- macOS 13+ (Ventura or later)
- Python 3.11+
- A Philips WiZ WiFi smart bulb on the same network as your Mac

## Install (from source)

```bash
git clone https://github.com/YOUR_USERNAME/wiz-ambient.git
cd wiz-ambient

# Needed for Tk
brew install python-tk

# Virtualenv + deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Build the Swift audio helper
cd wiz_ambient
swiftc -O -o capture_audio capture_audio.swift \
  -framework ScreenCaptureKit -framework CoreMedia -framework Foundation
cd ..

python run.py
```

On first launch, macOS will prompt for **Screen Recording** permission — this is required for both screen capture and system audio capture. Grant it in *System Settings → Privacy & Security → Screen Recording*, then relaunch.

## Usage

1. Click **Discover** (or type the IP manually) and **Connect** to your bulb
2. Pick **Audio** or **Video** mode
3. Hit **Start**

Closing the window hides it to the menu bar — click the dot in the top bar to show it again or quit.

## How it works

### Audio pipeline

1. A Swift helper (`capture_audio.swift`) captures system audio via `ScreenCaptureKit` and pipes raw float32 PCM to stdout
2. Python reads chunks, runs FFT (1024 samples @ 44.1 kHz), splits into bass / mids / highs
3. Features (energy, spectral centroid, zero-crossing rate, band ratios) feed a 7-mood classifier with smoothing
4. Beat detection uses bass-energy onset with a 150 ms cooldown; BPM is estimated from the median beat interval over the last ~6 seconds
5. In *smooth* style, the mood's base color is modulated by energy and beat intensity. In *snappy* style, every beat triggers a hard cut to the next color in the mood's palette

### Video pipeline

1. `CGWindowListCreateImageFromArray` (full screen) or `CGWindowListCreateImage(IncludingWindow)` (specific window) captures frames at ~15 fps, excluding the app's own windows
2. Downscale to 48×48, convert to HSV, bucket into 9 hue families
3. Pick the dominant family, average its pixels, saturation-boost, and send
4. Exponential smoothing controls transition speed

### Color correction

The WiZ ESP25_SHRGB_01 has render factors R=255, G=110, B=140 (green and blue LEDs are weaker) and roughly linear LEDs. The correction linearizes sRGB input, compensates for the render factors, and re-encodes with a mild output gamma so the bulb reproduces what's on screen.

## Project layout

```
wiz_ambient/
  app.py              # customtkinter UI + NSStatusBar menu bar
  audio.py            # Audio analysis & mood classification
  video.py            # Screen & window capture, dominant color
  bulb.py             # WiZ discovery / control with color correction
  capture_audio.swift # ScreenCaptureKit system audio helper
  config.py           # JSON settings persistence
  logger.py           # Per-session logs
```

## Privacy

Everything runs locally on your Mac. The app:

- Talks to your bulb over your LAN (UDP port 38899)
- Uses ScreenCaptureKit for audio and Quartz for screen capture
- Writes session logs to `./logs/` and settings to `~/.config/wiz-ambient/config.json`
- Has no telemetry, no accounts, no cloud

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the basics.

## License

[MIT](LICENSE)
