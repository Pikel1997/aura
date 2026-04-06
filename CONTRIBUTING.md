# Contributing

Thanks for your interest. This is a small hobby project — keep PRs focused and the scope tight.

## Dev setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cd wiz_ambient
swiftc -O -o capture_audio capture_audio.swift \
  -framework ScreenCaptureKit -framework CoreMedia -framework Foundation
cd ..

python run.py
```

## Guidelines

- One change per PR — bug fixes and features shouldn't mix
- Don't commit anything under `logs/`, `venv/`, `build/`, `dist/`, or the compiled `capture_audio` binary
- Test on your own WiZ bulb before opening a PR — include the model ID
- Match the existing code style; no large refactors without discussion first
- The app must keep working without Sparkle, without code signing, and without an Apple Developer account

## Reporting bugs

Open an issue with:

- macOS version
- Python version
- WiZ bulb model (found via `pywizlight`'s `getModelConfig` or the WiZ app)
- Relevant snippet from the latest file in `logs/`
- Steps to reproduce

## Security

For anything security-sensitive (e.g., you find a way to hijack someone else's bulb), please email the maintainer privately rather than opening a public issue.
