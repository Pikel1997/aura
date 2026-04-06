"""Audio capture via ScreenCaptureKit and mood-based color mapping."""

import numpy as np
import subprocess
import threading
import time
import os

MOOD_PALETTES = {
    "energetic":  {"color": (255, 50, 0),    "desc": "Red/Orange — high energy"},
    "happy":      {"color": (255, 200, 0),   "desc": "Yellow — bright and upbeat"},
    "chill":      {"color": (0, 100, 255),   "desc": "Blue — calm and smooth"},
    "ambient":    {"color": (80, 0, 200),    "desc": "Purple — atmospheric"},
    "romantic":   {"color": (255, 80, 120),  "desc": "Pink — warm and soft"},
    "dark":       {"color": (150, 0, 50),    "desc": "Dark Red — intense"},
    "bright":     {"color": (0, 220, 180),   "desc": "Teal — fresh and clear"},
}

SNAPPY_PALETTES = {
    "energetic": [
        (255, 30, 0), (255, 100, 0), (255, 180, 0),
        (255, 50, 50), (255, 140, 30),
    ],
    "happy": [
        (255, 220, 0), (255, 150, 0), (0, 255, 100),
        (255, 200, 50), (100, 255, 0),
    ],
    "chill": [
        (0, 80, 255), (0, 150, 220), (50, 100, 255),
        (0, 180, 200), (80, 120, 255),
    ],
    "ambient": [
        (100, 0, 220), (60, 0, 180), (140, 0, 255),
        (80, 40, 200), (120, 0, 200),
    ],
    "romantic": [
        (255, 60, 120), (255, 80, 80), (255, 100, 150),
        (255, 50, 100), (200, 80, 120),
    ],
    "dark": [
        (180, 0, 30), (120, 0, 60), (80, 0, 120),
        (150, 0, 0), (100, 0, 80),
    ],
    "bright": [
        (0, 230, 180), (0, 200, 255), (0, 255, 200),
        (50, 220, 220), (0, 255, 150),
    ],
}

# Path to the Swift audio capture helper
_CAPTURE_BIN = os.path.join(os.path.dirname(__file__), "capture_audio")


class AudioAnalyzer:
    """Captures system audio via ScreenCaptureKit and classifies mood."""

    def __init__(self, logger=None, sample_rate=44100, chunk_size=1024):
        self.log = logger
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.sensitivity = 1.5
        self.snappy = False
        self._process = None
        self._thread = None
        self._running = False
        self._lock = threading.Lock()
        self._error = None
        self._callback_count = 0

        self.energy = 0.0
        self.raw_rms = 0.0
        self.bass_ratio = 0.0
        self.mid_ratio = 0.0
        self.high_ratio = 0.0
        self.spectral_centroid = 0.0
        self.zero_crossing_rate = 0.0
        self.beat_intensity = 0.0
        self.current_mood = "chill"
        self._mood_scores = {m: 0.0 for m in MOOD_PALETTES}
        self._mood_smooth = {m: (1.0 if m == "chill" else 0.0) for m in MOOD_PALETTES}

        self._peak_rms = 0.001
        self._energy_history = []
        self._onset_history = []

        # Smooth mode
        self._smooth_r = 50.0
        self._smooth_g = 20.0
        self._smooth_b = 100.0
        self._smooth_bri = 60.0

        # Snappy mode
        self._beat_detected = False
        self._snappy_color_idx = 0
        self._snappy_current = (0, 0, 255)
        self._snappy_bri = 200
        self._last_beat_time = 0.0
        self._beat_cooldown = 0.15
        self._beat_times = []  # for BPM estimation
        self.bpm = 0.0

    def _log(self, msg):
        if self.log:
            self.log.log("AUDIO", msg)

    def start(self, device_index=None):
        """Start capturing system audio via the Swift helper."""
        if self._running:
            return
        self._running = True
        self._error = None
        self._peak_rms = 0.001
        self._callback_count = 0
        self._onset_history = []
        self._last_beat_time = 0.0

        if not os.path.exists(_CAPTURE_BIN):
            self._error = f"Audio capture binary not found: {_CAPTURE_BIN}"
            self._log(f"ERROR: {self._error}")
            self._running = False
            return

        mode_str = "snappy" if self.snappy else "smooth"
        self._log(f"Starting system audio capture, sensitivity={self.sensitivity:.1f}, mode={mode_str}")

        try:
            self._process = subprocess.Popen(
                [_CAPTURE_BIN, str(self.sample_rate), "1"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
            )
            self._thread = threading.Thread(target=self._read_loop, daemon=True)
            self._thread.start()

            # Read stderr for log messages in background
            self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
            self._stderr_thread.start()

        except Exception as e:
            self._error = f"Failed to start audio capture: {e}"
            self._log(f"ERROR: {self._error}")
            self._running = False

    def _read_stderr(self):
        """Read log messages from the Swift helper."""
        try:
            for line in self._process.stderr:
                msg = line.decode().strip()
                if msg:
                    self._log(f"capture: {msg}")
        except Exception:
            pass

    def _read_loop(self):
        """Read raw float32 audio from the Swift helper and analyze it."""
        bytes_per_chunk = self.chunk_size * 4  # float32 = 4 bytes

        try:
            while self._running and self._process and self._process.poll() is None:
                raw = self._process.stdout.read(bytes_per_chunk)
                if not raw:
                    break

                audio = np.frombuffer(raw, dtype=np.float32).copy()
                if len(audio) < self.chunk_size // 2:
                    continue

                self._analyze(audio)

        except Exception as e:
            self._error = f"Audio read error: {e}"
            self._log(f"ERROR: {e}")

        if self._running:
            self._log("Audio stream ended unexpectedly")
            self._running = False

    def _analyze(self, audio: np.ndarray):
        """Analyze a chunk of audio data."""
        self._callback_count += 1
        raw_rms = float(np.sqrt(np.mean(audio ** 2)))

        if self._callback_count in (1, 10, 50):
            self._log(f"Chunk #{self._callback_count}: raw_rms={raw_rms:.6f}")

        # Apply sensitivity
        audio = audio * self.sensitivity

        # FFT
        windowed = audio * np.hanning(len(audio))
        fft = np.abs(np.fft.rfft(windowed))
        freqs = np.fft.rfftfreq(len(audio), 1.0 / self.sample_rate)

        bass_mask = (freqs >= 20) & (freqs < 300)
        mid_mask = (freqs >= 300) & (freqs < 2000)
        high_mask = (freqs >= 2000) & (freqs < 8000)

        bass_e = np.sum(fft[bass_mask] ** 2) if np.any(bass_mask) else 0
        mid_e = np.sum(fft[mid_mask] ** 2) if np.any(mid_mask) else 0
        high_e = np.sum(fft[high_mask] ** 2) if np.any(high_mask) else 0
        total_e = bass_e + mid_e + high_e + 1e-10

        rms = np.sqrt(np.mean(audio ** 2))

        # Auto-gain
        if rms > self._peak_rms:
            self._peak_rms = rms
        else:
            self._peak_rms = self._peak_rms * 0.9995 + rms * 0.0005
        norm_energy = min(1.0, rms / (self._peak_rms + 1e-10))

        mag_sum = np.sum(fft) + 1e-10
        centroid = np.sum(freqs * fft) / mag_sum
        norm_centroid = min(1.0, centroid / 5000)

        zcr = np.sum(np.abs(np.diff(np.sign(audio)))) / (2 * len(audio))

        # Beat detection (bass-focused)
        bass_rms = np.sqrt(bass_e / (np.sum(bass_mask) + 1))
        self._onset_history.append(bass_rms)
        if len(self._onset_history) > 30:
            self._onset_history.pop(0)

        self._energy_history.append(rms)
        if len(self._energy_history) > 43:
            self._energy_history.pop(0)
        avg_e = np.mean(self._energy_history)
        beat_smooth = max(0, (rms - avg_e * 1.3) / (avg_e + 1e-10))

        beat_detected = False
        if len(self._onset_history) > 5:
            avg_onset = np.mean(self._onset_history[:-1])
            current_onset = self._onset_history[-1]
            now = time.time()
            if (current_onset > avg_onset * 1.4 and
                    current_onset > 0.01 and
                    now - self._last_beat_time > self._beat_cooldown):
                beat_detected = True
                self._last_beat_time = now
                self._beat_times.append(now)
                # Keep last ~6 seconds of beats
                cutoff = now - 6.0
                self._beat_times = [t for t in self._beat_times if t > cutoff]
                if len(self._beat_times) >= 4:
                    diffs = np.diff(self._beat_times)
                    # Filter outliers (very short/long gaps)
                    diffs = diffs[(diffs > 0.25) & (diffs < 1.2)]
                    if len(diffs) >= 2:
                        bpm = 60.0 / float(np.median(diffs))
                        self.bpm = self.bpm * 0.7 + bpm * 0.3 if self.bpm else bpm

        # Mood classification
        bass_r = bass_e / total_e
        mid_r = mid_e / total_e
        high_r = high_e / total_e

        scores = {}
        scores["energetic"] = norm_energy * 0.5 + bass_r * 0.3 + beat_smooth * 0.2
        scores["happy"] = norm_centroid * 0.4 + norm_energy * 0.3 + high_r * 0.3
        scores["chill"] = (1 - norm_energy) * 0.4 + max(0, 1 - zcr * 10) * 0.3 + mid_r * 0.3
        scores["ambient"] = (1 - norm_energy) * 0.3 + (1 - norm_centroid) * 0.4 + bass_r * 0.3
        scores["romantic"] = mid_r * 0.4 + max(0, 1 - zcr * 10) * 0.3 + norm_energy * 0.3
        scores["dark"] = bass_r * 0.4 + (1 - norm_centroid) * 0.3 + norm_energy * 0.3
        scores["bright"] = norm_centroid * 0.5 + high_r * 0.3 + (1 - bass_r) * 0.2

        for k in scores:
            scores[k] = max(0, min(1, scores[k]))

        blend = 0.05
        for k in scores:
            self._mood_smooth[k] = self._mood_smooth[k] * (1 - blend) + scores[k] * blend

        best_mood = max(self._mood_smooth, key=self._mood_smooth.get)

        # Snappy: on beat, pick next color from mood palette
        if beat_detected and self.snappy:
            palette = SNAPPY_PALETTES.get(best_mood, SNAPPY_PALETTES["energetic"])
            self._snappy_color_idx = (self._snappy_color_idx + 1) % len(palette)
            self._snappy_current = palette[self._snappy_color_idx]
            self._snappy_bri = int(150 + norm_energy * 105)

        with self._lock:
            self.raw_rms = raw_rms
            self.energy = norm_energy
            self.bass_ratio = bass_r
            self.mid_ratio = mid_r
            self.high_ratio = high_r
            self.spectral_centroid = norm_centroid
            self.zero_crossing_rate = zcr
            self.beat_intensity = min(1.0, beat_smooth)
            self._beat_detected = beat_detected
            prev_mood = self.current_mood
            self.current_mood = best_mood
            self._mood_scores = scores

        if best_mood != prev_mood and self._callback_count > 10:
            self._log(f"Mood: {prev_mood} -> {best_mood} (energy={norm_energy:.2f})")
        if beat_detected and self.snappy:
            self._log(f"BEAT! [{best_mood}] -> RGB{self._snappy_current} "
                      f"(energy={norm_energy:.2f})")

    def stop(self):
        self._running = False
        if self._process:
            try:
                self._process.kill()
                self._process.wait(timeout=2)
            except Exception:
                pass
            self._process = None
        self._log("Audio stopped")

    def get_color(self) -> tuple[int, int, int, int]:
        if self.snappy:
            return self._get_color_snappy()
        else:
            return self._get_color_smooth()

    def _get_color_smooth(self) -> tuple[int, int, int, int]:
        with self._lock:
            energy = self.energy
            mood = self.current_mood
            beat = self.beat_intensity

        palette = MOOD_PALETTES.get(mood, MOOD_PALETTES["chill"])
        base_r, base_g, base_b = palette["color"]

        if energy < 0.05:
            target_r, target_g, target_b = 25, 10, 5
            target_bri = 15
        else:
            intensity = 0.3 + energy * 0.7
            target_r = base_r * intensity
            target_g = base_g * intensity
            target_b = base_b * intensity

            if beat > 0.3:
                pulse = 1.0 + beat * 0.6
                target_r *= pulse
                target_g *= pulse
                target_b *= pulse

            target_bri = 40 + energy * 215

        speed = 0.08 + beat * 0.12
        self._smooth_r += (target_r - self._smooth_r) * speed
        self._smooth_g += (target_g - self._smooth_g) * speed
        self._smooth_b += (target_b - self._smooth_b) * speed
        self._smooth_bri += (target_bri - self._smooth_bri) * speed

        return (int(np.clip(self._smooth_r, 0, 255)),
                int(np.clip(self._smooth_g, 0, 255)),
                int(np.clip(self._smooth_b, 0, 255)),
                int(np.clip(self._smooth_bri, 1, 255)))

    def _get_color_snappy(self) -> tuple[int, int, int, int]:
        with self._lock:
            energy = self.energy
        if energy < 0.05:
            return (5, 5, 5, 10)
        r, g, b = self._snappy_current
        bri = int(max(80, self._snappy_bri * (0.5 + energy * 0.5)))
        return (r, g, b, min(255, bri))

    def get_status(self) -> str:
        if self._error:
            return self._error
        if not self._running:
            return "Stopped"
        if self._callback_count == 0:
            return "Starting capture..."
        with self._lock:
            rms = self.raw_rms
            mood = self.current_mood
            energy = self.energy
        if rms < 0.0001:
            return "No audio — is something playing?"
        mode_str = "Snappy" if self.snappy else "Smooth"
        desc = MOOD_PALETTES[mood]["desc"]
        return f"[{mode_str}] Mood: {mood} | Energy: {energy:.0%}"

    @property
    def is_running(self):
        return self._running
