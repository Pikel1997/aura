"""Screen capture and dominant color extraction.
Uses CGWindowListCreateImage to exclude our own app window."""

import numpy as np
import threading
import time
import os
import Quartz
from PIL import Image



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
        # 10 fps matches the bulb's 100ms accUdpPropRate. Capturing faster
        # is wasted work — the bulb can't display frames the eye misses.
        self.capture_fps = 10
        self._error = None
        self._frame_count = 0
        self._all_black_count = 0

        self._raw_color = (0, 0, 0)
        self.transition_speed = 0.15  # kept for config compat, no longer used
        self.region = None

        self._our_pid = os.getpid()
        self._our_window_id = 0
        self.target_window_id = 0  # 0 = full screen, else specific window id

        # Perceptual scene luminance (0..1), drives bulb brightness
        self.scene_luminance = 0.0
        self._smooth_lum = 0.0
        # Mean chroma of the edge ring (0..1). Below the achromatic threshold
        # the scene is treated as white/grey instead of guessing a hue.
        self.scene_chroma = 0.0

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

                # Sample the edge ring of the frame at full resolution and
                # downsize each strip — this is what would actually "spill"
                # behind the screen, ignores center-of-frame bias toward
                # warm content (skin tones, lamps, etc).
                pixels = self._sample_edge_ring(rgb)

                self._frame_count += 1

                # Check for all-black (permission issue)
                avg_brightness = float(np.mean(pixels))
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

                if self._frame_count in (1, 10, 30) or self._frame_count % 30 == 0:
                    self._log(f"Frame {self._frame_count}: "
                              f"color={color} "
                              f"lum={self.scene_luminance:.2f} "
                              f"chroma={self.scene_chroma:.2f}")

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

    # Edge sampling — strip width as a fraction of frame size, target downsize
    EDGE_FRACTION = 0.15
    EDGE_TARGET = 64
    # Lite-pipeline thresholds
    SAT_FLOOR = 0.15  # below this a pixel is "grey" → ignored for hue voting
    LUM_FLOOR = 0.08  # below this a pixel is "dark" → ignored for hue voting

    def _crop_letterbox(self, frame: np.ndarray) -> np.ndarray:
        """Detect and crop letterbox bars (black rows/columns at edges)."""
        h, w = frame.shape[:2]
        # Scan from top
        top = 0
        for y in range(h // 4):  # don't crop more than 25%
            if frame[y, :, :].mean() < 5:
                top = y + 1
            else:
                break
        # Scan from bottom
        bottom = h
        for y in range(h - 1, h - h // 4, -1):
            if frame[y, :, :].mean() < 5:
                bottom = y
            else:
                break
        # Scan from left
        left = 0
        for x in range(w // 4):
            if frame[:, x, :].mean() < 5:
                left = x + 1
            else:
                break
        # Scan from right
        right = w
        for x in range(w - 1, w - w // 4, -1):
            if frame[:, x, :].mean() < 5:
                right = x
            else:
                break
        if top >= bottom or left >= right:
            return frame  # no valid crop
        return frame[top:bottom, left:right, :]

    def _sample_edge_ring(self, frame: np.ndarray) -> np.ndarray:
        """
        Return the four edge strips of `frame` (top/bottom/left/right) stacked
        as a single (N, 3) array of uint8 pixels. The strips are downsized so
        the total pixel budget stays bounded regardless of screen size.
        """
        frame = self._crop_letterbox(frame)
        h, w = frame.shape[:2]
        ew = max(1, int(w * self.EDGE_FRACTION))
        eh = max(1, int(h * self.EDGE_FRACTION))
        target = self.EDGE_TARGET

        # Crop strips
        top    = frame[:eh, :, :]
        bottom = frame[-eh:, :, :]
        left   = frame[:, :ew, :]
        right  = frame[:, -ew:, :]

        # Downsize each strip with PIL bilinear (cheap, anti-aliased)
        def _shrink(strip, tw, th):
            img = Image.fromarray(strip.astype(np.uint8))
            img = img.resize((max(1, tw), max(1, th)),
                             Image.Resampling.BILINEAR)
            return np.array(img, dtype=np.uint8)

        top_s    = _shrink(top,    target, max(2, target // 6))
        bottom_s = _shrink(bottom, target, max(2, target // 6))
        left_s   = _shrink(left,   max(2, target // 6), target)
        right_s  = _shrink(right,  max(2, target // 6), target)

        return np.concatenate([
            top_s.reshape(-1, 3),
            bottom_s.reshape(-1, 3),
            left_s.reshape(-1, 3),
            right_s.reshape(-1, 3),
        ], axis=0)

    def _find_dominant_color(self, pixels: np.ndarray) -> tuple[int, int, int]:
        """
        Chroma-weighted blend in linear light. Vivid bright pixels dominate,
        skin tones / dark / grey pixels are de-emphasized. The result is the
        actual perceptual color of the scene's most colorful content.

        Achromatic scenes (low scene chroma) are returned as white scaled
        by luminance — no warm-bias yellow from averaging skin/lamps.
        """
        flat = pixels.reshape(-1, 3).astype(np.float32) / 255.0

        # Linearize sRGB → linear light (gamma 2.2)
        lin = np.power(np.clip(flat, 0.0, 1.0), 2.2)

        # Per-pixel luminance (Rec. 709 linear) and HSV-style chroma (sRGB)
        lum_px = (lin[:, 0] * 0.2126
                  + lin[:, 1] * 0.7152
                  + lin[:, 2] * 0.0722)
        cmax = np.max(flat, axis=1)
        cmin = np.min(flat, axis=1)
        chroma_px = np.where(cmax > 1e-4, (cmax - cmin) / (cmax + 1e-6), 0.0)

        # Scene metrics for UI + brightness path
        scene_lum_lin = float(lum_px.mean())
        scene_lum = float(np.sqrt(max(0.0, scene_lum_lin)))  # display gamma
        weight_lum = np.sqrt(np.clip(lum_px, 0.0, 1.0))
        wsum = float(weight_lum.sum()) + 1e-9
        scene_chroma = float((chroma_px * weight_lum).sum() / wsum)

        with self._lock:
            self.scene_luminance = scene_lum
            self.scene_chroma = scene_chroma

        # Achromatic scene → white at scene luminance (no yellow bias)
        if scene_chroma < 0.12:
            v = int(round(255 * min(1.0, scene_lum * 1.05)))
            return (v, v, v)

        # Weighted blend in linear space.
        # weight = chroma² · √lum  — squaring chroma kills the influence of
        # low-saturation skin/wood tones and lets vivid content dominate
        w = (chroma_px * chroma_px) * weight_lum
        wtot = float(w.sum()) + 1e-9
        mean_lin = (lin * w[:, None]).sum(axis=0) / wtot

        # Re-encode linear → sRGB
        srgb = np.power(np.clip(mean_lin, 0.0, 1.0), 1.0 / 2.2)

        # Renormalize so the brightest channel hits 1.0 — gives the bulb a
        # saturated representation of the scene's hue. Brightness is handled
        # separately by the luminance path so dim scenes still go dim.
        peak = float(srgb.max())
        if peak > 1e-4:
            srgb = srgb / peak

        return (int(round(srgb[0] * 255)),
                int(round(srgb[1] * 255)),
                int(round(srgb[2] * 255)))

    def get_color(self) -> tuple[int, int, int]:
        # No smoothing here — the 3-tap median filter in the capture loop
        # handles spike removal, and BulbController's animator handles eased
        # interpolation. Stacking another smoother just added latency.
        with self._lock:
            return self._raw_color

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
