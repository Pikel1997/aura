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

    # Bulb hardware constants (verified from getModelConfig on ESP25_SHRGB_01)
    TICK = 0.10           # 10 Hz — matches the bulb's accUdpPropRate (100 ms)
    EASE = 0.65           # color ease per tick — half-life ~145ms, smooth glide
    BRI_EASE = 0.80       # brightness eases faster than color: the eye notices
                          # luminance changes before hue, so this *feels*
                          # responsive even though hue takes its normal time
    MIN_BRI = 26          # 10% floor — below this the bulb cannot dim → OFF
    SCENE_CUT_DELTA = 90  # |ΔR|+|ΔG|+|ΔB| above this → snap, don't ease

    def __init__(self):
        self.bulb = None
        self.bulb_ip = None
        self.connected = False
        self.color_correction = True
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self._consecutive_errors = 0

        # Animator state — public set_color() updates targets only;
        # the animator task in _loop ticks at 10 Hz and eases current → target.
        self._tgt_rgb = (0, 0, 0)
        self._tgt_bri = 0
        self._cur_rgb = (0.0, 0.0, 0.0)
        self._cur_bri = 0.0
        self._is_off = True
        self._anim_started = False

        # Last value actually sent to bulb (post-correction) for UI display
        self.last_corrected_rgb = (0, 0, 0)

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def _run_async(self, coro, timeout=30):
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)

    def discover(self) -> list[dict]:
        async def _discover():
            # Skip link-local (169.254.x.x) — those are macOS DHCP-failure
            # addresses, never have bulbs. Walk the rest sequentially with
            # a short wait_time and stop on the first hit. Parallel
            # discovery doesn't work because pywizlight binds UDP 38899.
            broadcasts = [b for b in _local_broadcasts()
                          if not b.startswith("169.254.")]

            for subnet in broadcasts:
                try:
                    bulbs = await discovery.discover_lights(
                        broadcast_space=subnet, wait_time=2)
                    if bulbs:
                        return [{"ip": b.ip,
                                 "mac": getattr(b, "mac", "unknown")}
                                for b in bulbs]
                except Exception:
                    continue
            return []
        try:
            # Worst case: ~6 broadcasts × 2s = 12s
            return self._run_async(_discover(), timeout=20)
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
            if not self._anim_started:
                asyncio.run_coroutine_threadsafe(self._animator(), self._loop)
                self._anim_started = True
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
        Update the animator's target color/brightness.

        The actual UDP transmission happens in the animator coroutine at 10 Hz
        with eased interpolation, matching the bulb's hardware tick rate.
        Brightness below MIN_BRI (≈10%) → bulb off (no fade through the floor).

        `force=True` snaps the current value to the target instantly — used by
        test buttons so taps respond immediately instead of easing.
        """
        if not self.connected or not self.bulb:
            return

        rgb = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
        if self.color_correction and max(rgb) >= 8:
            rgb = _correct_color(*rgb)
        self.last_corrected_rgb = rgb

        bri = max(0, min(255, int(brightness)))
        self._tgt_rgb = rgb
        self._tgt_bri = bri

        if force:
            self._cur_rgb = (float(rgb[0]), float(rgb[1]), float(rgb[2]))
            self._cur_bri = float(bri)

    async def _animator(self):
        """10 Hz animator: eases current toward target, handles off cutoff."""
        while True:
            try:
                await self._tick()
            except Exception:
                self._consecutive_errors += 1
                if self._consecutive_errors > 10:
                    self._reconnect()
            await asyncio.sleep(self.TICK)

    async def _tick(self):
        if not self.bulb:
            return

        tgt_rgb = self._tgt_rgb
        tgt_bri = self._tgt_bri

        # Off path: target below floor → cut, don't fade through it
        if tgt_bri < self.MIN_BRI:
            if not self._is_off:
                await self.bulb.turn_off()
                self._is_off = True
                self._cur_bri = 0.0
                self._consecutive_errors = 0
            return

        # Coming back from off: snap on at the target (skip the 10% pop)
        if self._is_off:
            self._cur_rgb = (float(tgt_rgb[0]),
                             float(tgt_rgb[1]),
                             float(tgt_rgb[2]))
            self._cur_bri = float(max(self.MIN_BRI, tgt_bri))
            self._is_off = False
            await self.bulb.turn_on(PilotBuilder(
                rgb=tgt_rgb,
                brightness=int(self._cur_bri)))
            self._consecutive_errors = 0
            return

        # Scene-cut bypass: if the target jumped a lot, snap instantly so
        # hard cuts in movies feel immediate. Slow gradients still ease.
        delta = (abs(tgt_rgb[0] - self._cur_rgb[0])
                 + abs(tgt_rgb[1] - self._cur_rgb[1])
                 + abs(tgt_rgb[2] - self._cur_rgb[2]))
        if delta > self.SCENE_CUT_DELTA:
            e_color = 1.0  # snap on cuts
            e_bri = 1.0
        else:
            e_color = self.EASE
            e_bri = self.BRI_EASE  # brightness leads color (perceptual trick)

        nr = self._cur_rgb[0] + (tgt_rgb[0] - self._cur_rgb[0]) * e_color
        ng = self._cur_rgb[1] + (tgt_rgb[1] - self._cur_rgb[1]) * e_color
        nb = self._cur_rgb[2] + (tgt_rgb[2] - self._cur_rgb[2]) * e_color
        nbri = self._cur_bri + (tgt_bri - self._cur_bri) * e_bri
        self._cur_rgb = (nr, ng, nb)
        self._cur_bri = nbri

        send_bri = max(self.MIN_BRI, min(255, int(round(nbri))))
        send_rgb = (max(0, min(255, int(round(nr)))),
                    max(0, min(255, int(round(ng)))),
                    max(0, min(255, int(round(nb)))))

        await self.bulb.turn_on(PilotBuilder(
            rgb=send_rgb, brightness=send_bri))
        self._consecutive_errors = 0

    def turn_off(self):
        if not self.connected or not self.bulb:
            return
        try:
            self._run_async(self.bulb.turn_off())
        except Exception:
            pass

    def shutdown(self):
        self._loop.call_soon_threadsafe(self._loop.stop)
