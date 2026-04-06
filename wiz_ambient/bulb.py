"""WiZ bulb discovery and control with color correction."""

import asyncio
import ipaddress
import math
import socket
import subprocess
import threading
import time
from pywizlight import wizlight, PilotBuilder, discovery


def _local_broadcasts() -> list[str]:
    """Detect broadcast addresses on every active interface via ifconfig."""
    broadcasts = []
    try:
        out = subprocess.check_output(["ifconfig"], text=True, timeout=2)
        for line in out.splitlines():
            line = line.strip()
            if "broadcast" in line:
                parts = line.split()
                if "broadcast" in parts:
                    bc = parts[parts.index("broadcast") + 1]
                    if bc not in broadcasts:
                        broadcasts.append(bc)
    except Exception:
        pass
    # Fallback broadcasts
    for fb in ["255.255.255.255", "172.16.0.255", "192.168.1.255",
               "192.168.0.255", "10.0.0.255", "10.0.1.255"]:
        if fb not in broadcasts:
            broadcasts.append(fb)
    return broadcasts


def _correct_color(r: int, g: int, b: int) -> tuple[int, int, int]:
    """
    Apply color correction to compensate for the difference between
    sRGB monitor colors and WiZ bulb LED reproduction.

    The WiZ ESP25_SHRGB_01 bulb has:
    - Render factors: R=255, G=110, B=140 (green/blue LEDs are weaker)
    - LED currents: R=9, G=8, B=6 (blue LED weakest)
    - No gamma curve (LEDs are ~linear, monitor is sRGB gamma 2.2)

    This correction:
    1. Removes sRGB gamma (linearize)
    2. Compensates for the bulb's render factors
    3. Re-encodes for the bulb's linear LEDs
    """
    # Normalize to 0-1
    r_n = r / 255.0
    g_n = g / 255.0
    b_n = b / 255.0

    # Step 1: Remove sRGB gamma → linear light
    # sRGB uses a piecewise gamma curve, simplified to gamma 2.2
    r_lin = math.pow(r_n, 2.2) if r_n > 0 else 0
    g_lin = math.pow(g_n, 2.2) if g_n > 0 else 0
    b_lin = math.pow(b_n, 2.2) if b_n > 0 else 0

    # Step 2: Compensate for bulb render factors
    # Render factors are R=255/255=1.0, G=110/255=0.43, B=140/255=0.55
    # The bulb internally scales G and B down, so we need to boost them
    # to get the intended color appearance
    g_lin *= (255 / 110)  # ~2.32x boost
    b_lin *= (255 / 140)  # ~1.82x boost

    # Step 3: Normalize back — find max and scale so nothing exceeds 1.0
    max_val = max(r_lin, g_lin, b_lin, 1.0)
    r_lin /= max_val
    g_lin /= max_val
    b_lin /= max_val

    # Step 4: Apply inverse — the bulb expects ~linear values
    # Use a mild gamma (1.2) since the bulb isn't perfectly linear
    gamma_out = 1.2
    r_out = math.pow(r_lin, 1.0 / gamma_out)
    g_out = math.pow(g_lin, 1.0 / gamma_out)
    b_out = math.pow(b_lin, 1.0 / gamma_out)

    # Back to 0-255
    return (
        max(0, min(255, int(r_out * 255))),
        max(0, min(255, int(g_out * 255))),
        max(0, min(255, int(b_out * 255))),
    )


class BulbController:
    """Controls a WiZ smart bulb over the local network."""

    def __init__(self):
        self.bulb = None
        self.bulb_ip = None
        self.connected = False
        self.color_correction = True  # Enable/disable correction
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self._last_rgb = (-1, -1, -1)
        self._last_bri = -1
        self._last_send = 0
        self._min_interval = 0.04  # ~25 updates/sec max
        self._consecutive_errors = 0
        # Store what we actually sent (after correction) for UI display
        self.last_corrected_rgb = (0, 0, 0)

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def _run_async(self, coro):
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=10)

    def discover(self) -> list[dict]:
        async def _discover():
            found = []
            for subnet in _local_broadcasts():
                try:
                    bulbs = await discovery.discover_lights(broadcast_space=subnet)
                    for b in bulbs or []:
                        if not any(f["ip"] == b.ip for f in found):
                            found.append({"ip": b.ip,
                                          "mac": getattr(b, "mac", "unknown")})
                except Exception:
                    continue
            return found
        try:
            return self._run_async(_discover())
        except Exception:
            return []

    def connect(self, ip: str) -> bool:
        async def _connect():
            bulb = wizlight(ip)
            await bulb.updateState()
            return bulb
        try:
            self.bulb = self._run_async(_connect())
            self.bulb_ip = ip
            self.connected = True
            self._consecutive_errors = 0
            self._last_rgb = (-1, -1, -1)
            return True
        except Exception as e:
            print(f"Connection failed: {e}")
            self.connected = False
            return False

    def _reconnect(self):
        if not self.bulb_ip:
            return False
        async def _connect():
            bulb = wizlight(self.bulb_ip)
            await bulb.updateState()
            return bulb
        try:
            self.bulb = self._run_async(_connect())
            self.connected = True
            self._consecutive_errors = 0
            return True
        except Exception:
            return False

    def set_color(self, r: int, g: int, b: int, brightness: int = 255,
                  force: bool = False):
        """
        Set bulb color. Applies color correction, throttled to avoid flooding.
        Use force=True to bypass dedup (for test buttons).
        """
        if not self.connected or not self.bulb:
            return

        now = time.time()
        if not force and now - self._last_send < self._min_interval:
            return

        rgb = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
        bri = max(1, min(255, brightness))

        # Apply color correction
        if self.color_correction:
            rgb = _correct_color(*rgb)
        self.last_corrected_rgb = rgb

        # Skip if color hasn't changed enough (unless forced)
        if not force:
            dr = abs(rgb[0] - self._last_rgb[0])
            dg = abs(rgb[1] - self._last_rgb[1])
            db = abs(rgb[2] - self._last_rgb[2])
            if dr + dg + db < 4:
                return

        self._last_rgb = rgb
        self._last_bri = bri
        self._last_send = now

        async def _set():
            try:
                await self.bulb.turn_on(PilotBuilder(rgb=rgb, brightness=bri))
                self._consecutive_errors = 0
            except Exception:
                self._consecutive_errors += 1
                if self._consecutive_errors > 10:
                    self._reconnect()

        try:
            asyncio.run_coroutine_threadsafe(_set(), self._loop)
        except Exception:
            pass

    def turn_off(self):
        if not self.connected or not self.bulb:
            return
        try:
            self._run_async(self.bulb.turn_off())
        except Exception:
            pass

    def shutdown(self):
        self._loop.call_soon_threadsafe(self._loop.stop)
