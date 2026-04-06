"""Settings persistence."""

import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "wiz-ambient"
CONFIG_PATH = CONFIG_DIR / "config.json"

DEFAULTS = {
    "bulb_ip": "",
    "mode": "audio",
    "audio_sensitivity": 1.5,
    "audio_style": "smooth",
    "video_smoothing": 0.15,
    "video_source": "All Screens",
    "color_correction": True,
    "auto_start": False,
    "start_hidden": False,
}


def load() -> dict:
    cfg = dict(DEFAULTS)
    try:
        if CONFIG_PATH.exists():
            cfg.update(json.loads(CONFIG_PATH.read_text()))
    except Exception:
        pass
    return cfg


def save(cfg: dict):
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    except Exception:
        pass
