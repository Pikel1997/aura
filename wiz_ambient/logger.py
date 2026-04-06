"""Session logger — human-readable log files per session."""

import os
import time
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).parent.parent / "logs"


class SessionLogger:
    """Writes a human-readable log file for each app session."""

    def __init__(self):
        LOG_DIR.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self._path = LOG_DIR / f"session_{ts}.log"
        self._file = open(self._path, "w")
        self._start = time.time()
        self.log("SESSION START", f"Log file: {self._path}")

    def log(self, category: str, message: str):
        """Write a log line: [timestamp] [elapsed] [CATEGORY] message"""
        now = datetime.now().strftime("%H:%M:%S")
        elapsed = time.time() - self._start
        line = f"[{now}] [{elapsed:7.1f}s] [{category:<12}] {message}\n"
        try:
            self._file.write(line)
            self._file.flush()
        except Exception:
            pass

    def close(self):
        try:
            self.log("SESSION END", "App closed")
            self._file.close()
        except Exception:
            pass

    @property
    def path(self) -> str:
        return str(self._path)
