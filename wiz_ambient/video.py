"""Screen capture and dominant color extraction.
Uses CGWindowListCreateImage to exclude our own app window."""

import numpy as np
import threading
import time
import os
import Quartz
from PIL import Image

COLOR_FAMILIES = [
    ("red",     (0, 15),    (255, 30, 30)),
    ("orange",  (15, 40),   (255, 140, 0)),
    ("yellow",  (40, 70),   (255, 230, 0)),
    ("green",   (70, 160),  (0, 220, 50)),
    ("cyan",    (160, 195), (0, 210, 220)),
    ("blue",    (195, 260), (30, 60, 255)),
    ("purple",  (260, 300), (160, 30, 255)),
    ("pink",    (300, 345), (255, 50, 150)),
    ("red2",    (345, 360), (255, 30, 30)),
]


def _find_our_window_id() -> int:
    """Find the window ID of our app so we can exclude it from capture."""
    pid = os.getpid()
    window_list = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
    for w in window_list:
        if w.get(Quartz.kCGWindowOwnerPID) == pid:
            return w.get(Quartz.kCGWindowNumber, 0)
    return 0


def _capture_screen_excluding_window(window_id: int) -> np.ndarray | None:
    """Capture the entire screen, excluding the specified window."""
    # kCGWindowListOptionOnScreenBelowWindow captures everything below our window
    # Combined with kCGWindowListOptionOnScreenOnly to get all on-screen windows
    # But the simplest approach: capture all windows except ours

    if window_id > 0:
        # Capture everything on screen, but use our window as the "above" reference
        # This captures all windows BELOW our window in the z-order
        # Plus we add kCGWindowListOptionOnScreenAboveWindow to get everything
        # Actually, best approach: capture all on-screen windows excluding ours
        image = Quartz.CGWindowListCreateImage(
            Quartz.CGRectInfinite,
            Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
            Quartz.kCGNullWindowID,
            Quartz.kCGWindowImageDefault
        )
    else:
        image = Quartz.CGWindowListCreateImage(
            Quartz.CGRectInfinite,
            Quartz.kCGWindowListOptionOnScreenOnly,
            Quartz.kCGNullWindowID,
            Quartz.kCGWindowImageDefault
        )

    if image is None:
        return None

    width = Quartz.CGImageGetWidth(image)
    height = Quartz.CGImageGetHeight(image)
    bpr = Quartz.CGImageGetBytesPerRow(image)

    data_provider = Quartz.CGImageGetDataProvider(image)
    data = Quartz.CGDataProviderCopyData(data_provider)

    # Convert to numpy — data is BGRA
    arr = np.frombuffer(data, dtype=np.uint8).reshape(height, bpr // 1)
    # Extract BGRA channels (bpr might be wider than width*4 due to padding)
    bgra = arr[:, :width * 4].reshape(height, width, 4)
    # Convert BGRA to RGB
    rgb = bgra[:, :, [2, 1, 0]].astype(np.float32)

    return rgb


def _capture_excluding_pid(pid: int) -> np.ndarray | None:
    """Capture screen excluding all windows belonging to our PID."""
    # Get all on-screen windows
    all_windows = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)

    # Find windows NOT belonging to our app
    other_window_ids = []
    for w in all_windows:
        if w.get(Quartz.kCGWindowOwnerPID) != pid:
            wid = w.get(Quartz.kCGWindowNumber)
            if wid:
                other_window_ids.append(wid)

    if not other_window_ids:
        return None

    # Create image from the list of other windows
    window_array = Quartz.CFArrayCreate(None, [Quartz.CFNumberCreate(None, Quartz.kCFNumberIntType, wid) for wid in other_window_ids], len(other_window_ids), None) if other_window_ids else None

    # Simpler approach: capture full screen, we'll just use CGWindowListCreateImage
    # with the option to exclude desktop elements
    image = Quartz.CGWindowListCreateImage(
        Quartz.CGRectInfinite,
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID,
        Quartz.kCGWindowImageDefault
    )

    if image is None:
        return None

    width = Quartz.CGImageGetWidth(image)
    height = Quartz.CGImageGetHeight(image)
    bpr = Quartz.CGImageGetBytesPerRow(image)

    data_provider = Quartz.CGImageGetDataProvider(image)
    data = Quartz.CGDataProviderCopyData(data_provider)

    arr = np.frombuffer(data, dtype=np.uint8).reshape(height, bpr)
    bgra = arr[:, :width * 4].reshape(height, width, 4)
    rgb = bgra[:, :, [2, 1, 0]].astype(np.float32)

    return rgb


class VideoAnalyzer:
    """Captures the screen (excluding our app window) and extracts dominant color."""

    def __init__(self, logger=None):
        self.log = logger
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
        self.monitor_index = 0
        self.capture_fps = 15
        self._error = None
        self._frame_count = 0
        self._all_black_count = 0

        self._raw_color = (0, 0, 0)
        self._smooth_r = 0.0
        self._smooth_g = 0.0
        self._smooth_b = 0.0
        self.transition_speed = 0.15
        self.region = None

        self.color_breakdown = {}
        self._our_pid = os.getpid()
        self._our_window_id = 0
        self.target_window_id = 0  # 0 = full screen, else specific window id

    def list_windows(self) -> list[dict]:
        """List user-facing on-screen windows (excluding our app)."""
        try:
            wins = Quartz.CGWindowListCopyWindowInfo(
                Quartz.kCGWindowListOptionOnScreenOnly
                | Quartz.kCGWindowListExcludeDesktopElements,
                Quartz.kCGNullWindowID)
        except Exception:
            return []
        out = []
        for w in wins or []:
            if w.get(Quartz.kCGWindowOwnerPID) == self._our_pid:
                continue
            if (w.get(Quartz.kCGWindowLayer, 0) or 0) != 0:
                continue
            name = w.get(Quartz.kCGWindowOwnerName, "")
            title = w.get(Quartz.kCGWindowName, "") or ""
            wid = w.get(Quartz.kCGWindowNumber, 0)
            bounds = w.get(Quartz.kCGWindowBounds, {}) or {}
            if not wid or not name:
                continue
            if (bounds.get("Width", 0) or 0) < 200:
                continue
            label = f"{name} — {title}" if title else name
            out.append({"id": int(wid), "label": label[:80]})
        return out

    def _log(self, msg):
        if self.log:
            self.log.log("VIDEO", msg)

    def list_monitors(self) -> list[dict]:
        try:
            displays = Quartz.CGGetActiveDisplayList(10, None, None)
            monitors = [{"index": 0, "name": "All monitors", "width": 0, "height": 0}]
            if displays and displays[1]:
                for i, d in enumerate(displays[1]):
                    bounds = Quartz.CGDisplayBounds(d)
                    monitors.append({
                        "index": i + 1,
                        "name": f"Monitor {i + 1}",
                        "width": int(bounds.size.width),
                        "height": int(bounds.size.height),
                    })
            self._log(f"Found {len(monitors)} monitors")
            return monitors
        except Exception as e:
            self._log(f"Monitor list error: {e}")
            return [{"index": 0, "name": "All monitors", "width": 0, "height": 0}]

    def start(self, monitor_index=0):
        if self._running:
            return
        self.monitor_index = monitor_index
        self._running = True
        self._error = None
        self._frame_count = 0
        self._all_black_count = 0
        self._our_window_id = _find_our_window_id()
        self._log(f"Starting screen capture (excluding our window {self._our_window_id}), "
                  f"fps={self.capture_fps}, smoothing={self.transition_speed:.2f}")
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None
        self._log(f"Stopped after {self._frame_count} frames")

    def _capture_loop(self):
        while self._running:
            t0 = time.time()

            try:
                # Capture screen excluding our app window
                rgb = self._capture_frame()

                if rgb is None:
                    self._error = "Screen capture failed"
                    time.sleep(0.1)
                    continue

                # Resize to 48x48 for speed
                img = Image.fromarray(rgb.astype(np.uint8))
                img = img.resize((48, 48), Image.Resampling.BILINEAR)
                pixels = np.array(img, dtype=np.float32)

                self._frame_count += 1

                # Check for all-black (permission issue)
                avg_brightness = np.mean(pixels)
                if avg_brightness < 1.0:
                    self._all_black_count += 1
                    if self._all_black_count > 30:
                        self._error = ("Screen is black — grant Screen Recording "
                                       "permission in System Settings > Privacy & Security")
                        if self._all_black_count == 31:
                            self._log(f"WARNING: {self._error}")
                else:
                    self._all_black_count = 0
                    self._error = None

                color = self._find_dominant_color(pixels)

                if self._frame_count in (1, 10, 50) or self._frame_count % 200 == 0:
                    self._log(f"Frame {self._frame_count}: "
                              f"dominant=RGB{color}, avg_brightness={avg_brightness:.1f}")

                with self._lock:
                    self._raw_color = color

            except Exception as e:
                self._error = str(e)
                self._log(f"Capture error: {e}")

            elapsed = time.time() - t0
            sleep_time = max(0, (1.0 / self.capture_fps) - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    def _capture_frame(self) -> np.ndarray | None:
        """Capture screen excluding our own app windows, or a specific window."""
        if self.target_window_id:
            img = Quartz.CGWindowListCreateImage(
                Quartz.CGRectNull,
                Quartz.kCGWindowListOptionIncludingWindow,
                int(self.target_window_id),
                Quartz.kCGWindowImageBoundsIgnoreFraming,
            )
            if img is None:
                return None
            w = Quartz.CGImageGetWidth(img)
            h = Quartz.CGImageGetHeight(img)
            if w == 0 or h == 0:
                return None
            bpr = Quartz.CGImageGetBytesPerRow(img)
            data = Quartz.CGDataProviderCopyData(Quartz.CGImageGetDataProvider(img))
            arr = np.frombuffer(data, dtype=np.uint8).reshape(h, bpr)
            bgra = arr[:, :w * 4].reshape(h, w, 4)
            return bgra[:, :, [2, 1, 0]]
        # Get all windows
        all_windows = Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)

        if not all_windows:
            return None

        # Find a window that's NOT ours to use as reference
        # We capture "all on-screen windows below" a reference, excluding ours
        # Simpler: build a list of window IDs excluding our PID
        other_ids = []
        for w in all_windows:
            owner_pid = w.get(Quartz.kCGWindowOwnerPID, 0)
            wid = w.get(Quartz.kCGWindowNumber, 0)
            layer = w.get(Quartz.kCGWindowLayer, 0)
            if owner_pid != self._our_pid and wid > 0 and layer >= 0:
                other_ids.append(wid)

        if not other_ids:
            return None

        # Use CGImage from window list — capture specific windows by ID
        id_array = Quartz.CGWindowListCreateImageFromArray(
            Quartz.CGRectInfinite,
            other_ids,
            Quartz.kCGWindowImageDefault
        )

        if id_array is None:
            # Fallback: capture everything (including our window)
            id_array = Quartz.CGWindowListCreateImage(
                Quartz.CGRectInfinite,
                Quartz.kCGWindowListOptionOnScreenOnly,
                Quartz.kCGNullWindowID,
                Quartz.kCGWindowImageDefault
            )

        if id_array is None:
            return None

        width = Quartz.CGImageGetWidth(id_array)
        height = Quartz.CGImageGetHeight(id_array)

        if width == 0 or height == 0:
            return None

        bpr = Quartz.CGImageGetBytesPerRow(id_array)
        data_provider = Quartz.CGImageGetDataProvider(id_array)
        data = Quartz.CGDataProviderCopyData(data_provider)

        arr = np.frombuffer(data, dtype=np.uint8).reshape(height, bpr)
        bgra = arr[:, :width * 4].reshape(height, width, 4)
        rgb = bgra[:, :, [2, 1, 0]]

        return rgb

    def _find_dominant_color(self, pixels: np.ndarray) -> tuple[int, int, int]:
        flat = pixels.reshape(-1, 3)
        r, g, b = flat[:, 0], flat[:, 1], flat[:, 2]

        r_n, g_n, b_n = r / 255.0, g / 255.0, b / 255.0
        cmax = np.maximum(np.maximum(r_n, g_n), b_n)
        cmin = np.minimum(np.minimum(r_n, g_n), b_n)
        delta = cmax - cmin

        sat = np.where(cmax > 0, delta / (cmax + 1e-10), 0)
        val = cmax

        colorful = (sat > 0.12) & (val > 0.12) & (val < 0.97)
        colorful_count = int(np.sum(colorful))

        total_px = len(flat)

        if colorful_count < 20:
            neutral_pct = ((total_px - colorful_count) / total_px) * 100
            with self._lock:
                self.color_breakdown = {"neutral": round(neutral_pct, 1)}
            avg = np.mean(flat, axis=0).astype(int)
            return (int(avg[0]), int(avg[1]), int(avg[2]))

        r_c, g_c, b_c = r_n[colorful], g_n[colorful], b_n[colorful]
        cmax_c = cmax[colorful]
        delta_c = delta[colorful] + 1e-10

        hue = np.zeros(colorful_count)
        is_r = cmax_c == r_c
        is_g = (~is_r) & (cmax_c == g_c)
        is_b = (~is_r) & (~is_g)

        hue[is_r] = (60 * ((g_c[is_r] - b_c[is_r]) / delta_c[is_r])) % 360
        hue[is_g] = (60 * ((b_c[is_g] - r_c[is_g]) / delta_c[is_g]) + 120) % 360
        hue[is_b] = (60 * ((r_c[is_b] - g_c[is_b]) / delta_c[is_b]) + 240) % 360

        family_counts = {}
        for name, (h_lo, h_hi), _ in COLOR_FAMILIES:
            key = name.rstrip("2")
            count = int(np.sum((hue >= h_lo) & (hue < h_hi)))
            family_counts[key] = family_counts.get(key, 0) + count

        # Store breakdown
        breakdown = {}
        if sum(family_counts.values()) > 0:
            for name, count in sorted(family_counts.items(), key=lambda x: -x[1]):
                pct = (count / total_px) * 100
                if pct >= 0.5:
                    breakdown[name] = round(pct, 1)
            neutral_pct = ((total_px - colorful_count) / total_px) * 100
            if neutral_pct >= 1:
                breakdown["neutral"] = round(neutral_pct, 1)
        with self._lock:
            self.color_breakdown = breakdown

        if not family_counts:
            avg = np.mean(flat, axis=0).astype(int)
            return (int(avg[0]), int(avg[1]), int(avg[2]))

        winner = max(family_counts, key=family_counts.get)

        winner_mask = np.zeros(colorful_count, dtype=bool)
        for name, (h_lo, h_hi), _ in COLOR_FAMILIES:
            if name.rstrip("2") == winner:
                winner_mask |= (hue >= h_lo) & (hue < h_hi)

        if np.sum(winner_mask) > 0:
            winning_pixels = flat[colorful][winner_mask]
            avg_color = np.mean(winning_pixels, axis=0)
            gray_val = np.mean(avg_color)
            boosted = gray_val + (avg_color - gray_val) * 1.5
            boosted = np.clip(boosted, 0, 255)
            return (int(boosted[0]), int(boosted[1]), int(boosted[2]))
        else:
            for name, _, target in COLOR_FAMILIES:
                if name.rstrip("2") == winner:
                    return target
            return (128, 128, 128)

    def get_color(self) -> tuple[int, int, int]:
        with self._lock:
            tr, tg, tb = self._raw_color

        speed = self.transition_speed
        self._smooth_r += (tr - self._smooth_r) * speed
        self._smooth_g += (tg - self._smooth_g) * speed
        self._smooth_b += (tb - self._smooth_b) * speed

        return (int(np.clip(self._smooth_r, 0, 255)),
                int(np.clip(self._smooth_g, 0, 255)),
                int(np.clip(self._smooth_b, 0, 255)))

    def get_status(self) -> str:
        if self._error:
            return self._error
        if not self._running:
            return "Stopped"
        if self._frame_count == 0:
            return "Starting capture..."
        with self._lock:
            r, g, b = self._raw_color
        return f"Active — dominant: RGB({r},{g},{b})"

    @property
    def is_running(self):
        return self._running
