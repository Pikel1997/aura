"""Aura — reactive lighting for WiZ bulbs.

Linear setup flow: discover → mode → source → run.
No manual IP entry, no test panel, no extraneous knobs. The app validates
each requirement and tells the user exactly what's wrong if a step fails.
"""

import customtkinter as ctk
import subprocess
import threading
import time

from .bulb import BulbController
from .audio import AudioAnalyzer
from .video import VideoAnalyzer
from .logger import SessionLogger
from . import config as cfg_mod


# ── Apple HIG-inspired dark palette ──
BG       = "#1c1c1e"
SURFACE  = "#2c2c2e"
SURFACE2 = "#3a3a3c"
BORDER   = "#3a3a3c"
TEXT     = "#ffffff"
MUTED    = "#8e8e93"
SUBTLE   = "#636366"
ACCENT   = "#0a84ff"
ACCENT_HOVER = "#409cff"
OK       = "#30d158"
WARN     = "#ff9f0a"
ERR      = "#ff453a"

FONT_TITLE  = ("SF Pro Display", 28, "bold")
FONT_H      = ("SF Pro Display", 16, "bold")
FONT_BODY   = ("SF Pro Text", 13)
FONT_LBL    = ("SF Pro Text", 12)
FONT_CAP    = ("SF Pro Text", 10)
FONT_MONO   = ("SF Mono", 12)
FONT_BTN    = ("SF Pro Text", 13, "bold")


def _has_network() -> tuple[bool, str]:
    """Check whether the Mac has a usable non-loopback IPv4 interface."""
    try:
        out = subprocess.check_output(["ifconfig"], text=True, timeout=2)
    except Exception:
        return False, "unknown"
    iface = None
    for block in out.split("\n\n"):
        if "status: active" not in block and "inet " not in block:
            continue
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("inet ") and not line.startswith("inet 127."):
                ip = line.split()[1]
                # Get interface name from first line of block
                first = block.splitlines()[0]
                name = first.split(":")[0] if ":" in first else "?"
                return True, f"{name} ({ip})"
    return False, "none"


def _ssid() -> str | None:
    """Best-effort current Wi-Fi SSID via networksetup."""
    try:
        out = subprocess.check_output(
            ["networksetup", "-getairportnetwork", "en0"],
            text=True, timeout=2)
        if ":" in out:
            return out.split(":", 1)[1].strip() or None
    except Exception:
        pass
    return None


# ────────────────────────────────────────────────────────────────────────
# Reusable card primitive
# ────────────────────────────────────────────────────────────────────────
class Card(ctk.CTkFrame):
    """A grouped section card with caption + content area."""

    def __init__(self, parent, title: str, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        ctk.CTkLabel(self, text=title.upper(),
                     font=FONT_CAP, text_color=MUTED,
                     anchor="w").pack(fill="x", padx=4, pady=(0, 8))
        self.body = ctk.CTkFrame(self, fg_color=SURFACE,
                                 corner_radius=12, border_width=0)
        self.body.pack(fill="x")

    def set_enabled(self, enabled: bool):
        """Dim the card when locked behind a previous step."""
        color = SURFACE if enabled else BG
        self.body.configure(fg_color=color)


class WizAmbientApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.cfg = cfg_mod.load()

        self.title("Aura")
        self.geometry("440x680")
        self.minsize(440, 680)
        self.configure(fg_color=BG)
        ctk.set_appearance_mode("dark")

        self.logger = SessionLogger()
        self.bulb = BulbController()
        self.audio = AudioAnalyzer(logger=self.logger)
        self.video = VideoAnalyzer(logger=self.logger)
        self.bulb.color_correction = True

        # State
        self._active = False
        self._mode = self.cfg.get("mode", "audio")
        self._bulb_ip: str | None = None
        self._windows: list[dict] = []

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._really_quit)
        self.logger.log("APP", "UI built — running setup wizard")

        # Auto-start discovery on launch
        self.after(300, self._discover)

    # ────────────────────────────────────────────────────────────────────
    # UI
    # ────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # Two stacked containers — only one visible at a time
        self.setup_view = ctk.CTkFrame(self, fg_color=BG)
        self.running_view = ctk.CTkFrame(self, fg_color=BG)

        self._build_setup_view()
        self._build_running_view()

        self.setup_view.pack(fill="both", expand=True)

    # ── Setup view ──────────────────────────────────────────────────────
    def _build_setup_view(self):
        root = ctk.CTkFrame(self.setup_view, fg_color="transparent")
        root.pack(fill="both", expand=True, padx=24, pady=24)

        # Header
        ctk.CTkLabel(root, text="Aura",
                     font=FONT_TITLE, text_color=TEXT).pack(anchor="w")
        ctk.CTkLabel(root, text="Reactive lighting for your WiZ bulb",
                     font=FONT_BODY, text_color=MUTED).pack(anchor="w",
                                                            pady=(0, 24))

        # ── Step 1: Bulb ──
        self.card_bulb = Card(root, "1 — Connect your bulb")
        self.card_bulb.pack(fill="x", pady=(0, 16))

        b = ctk.CTkFrame(self.card_bulb.body, fg_color="transparent")
        b.pack(fill="x", padx=16, pady=16)

        self.bulb_status = ctk.CTkLabel(
            b, text="Searching for bulbs on your network…",
            font=FONT_BODY, text_color=MUTED, anchor="w", justify="left")
        self.bulb_status.pack(fill="x")

        self.find_btn = ctk.CTkButton(
            b, text="Search again", command=self._discover,
            height=32, corner_radius=8, font=FONT_BTN,
            fg_color=SURFACE2, hover_color=BORDER, text_color=TEXT)
        self.find_btn.pack(fill="x", pady=(12, 0))
        self.find_btn.pack_forget()  # hidden until first failure

        # Troubleshoot block (hidden until needed)
        self.trouble = ctk.CTkFrame(b, fg_color="transparent")
        # populated dynamically when shown

        # ── Step 2: Mode ──
        self.card_mode = Card(root, "2 — Pick a mode")
        self.card_mode.pack(fill="x", pady=(0, 16))

        m = ctk.CTkFrame(self.card_mode.body, fg_color="transparent")
        m.pack(fill="x", padx=16, pady=16)
        self.mode_var = ctk.StringVar(value=self._mode)
        self.seg_mode = ctk.CTkSegmentedButton(
            m, values=["audio", "video"], variable=self.mode_var,
            command=lambda _=None: self._mode_changed(),
            fg_color=SURFACE2, selected_color=ACCENT,
            selected_hover_color=ACCENT_HOVER,
            unselected_color=SURFACE2, unselected_hover_color=BORDER,
            text_color=TEXT, font=FONT_BTN, height=34, state="disabled")
        self.seg_mode.pack(fill="x")
        self.mode_caption = ctk.CTkLabel(
            m, text="", font=FONT_CAP, text_color=MUTED,
            anchor="w", justify="left")
        self.mode_caption.pack(fill="x", pady=(8, 0))

        # ── Step 3: Source (video only) ──
        self.card_source = Card(root, "3 — Choose source")
        # packed/unpacked dynamically based on mode

        s = ctk.CTkFrame(self.card_source.body, fg_color="transparent")
        s.pack(fill="x", padx=16, pady=16)
        self.source_var = ctk.StringVar(value="All Screens")
        self.source_menu = ctk.CTkOptionMenu(
            s, variable=self.source_var, values=["All Screens"],
            fg_color=SURFACE2, button_color=SURFACE2,
            button_hover_color=BORDER, text_color=TEXT,
            dropdown_fg_color=SURFACE2, dropdown_hover_color=BORDER,
            dropdown_text_color=TEXT,
            command=lambda _=None: self._source_changed(), height=32)
        self.source_menu.pack(fill="x")
        ctk.CTkButton(
            s, text="Refresh window list", command=self._refresh_sources,
            height=24, corner_radius=6, font=FONT_CAP,
            fg_color="transparent", hover_color=SURFACE2,
            text_color=MUTED).pack(anchor="w", pady=(8, 0))

        # ── Footer status + Start ──
        footer = ctk.CTkFrame(self.setup_view, fg_color="transparent")
        footer.pack(side="bottom", fill="x", padx=24, pady=(0, 24))

        self.footer_status = ctk.CTkLabel(
            footer, text="", font=FONT_LBL, text_color=MUTED)
        self.footer_status.pack(pady=(0, 10))

        self.start_btn = ctk.CTkButton(
            footer, text="Start", command=self._start, state="disabled",
            height=46, corner_radius=12, font=FONT_BTN,
            fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="#ffffff")
        self.start_btn.pack(fill="x")

        self._mode_changed()

    # ── Running view ────────────────────────────────────────────────────
    def _build_running_view(self):
        root = ctk.CTkFrame(self.running_view, fg_color="transparent")
        root.pack(fill="both", expand=True, padx=24, pady=24)

        ctk.CTkLabel(root, text="Aura",
                     font=FONT_TITLE, text_color=TEXT).pack(anchor="w")
        self.running_subtitle = ctk.CTkLabel(
            root, text="", font=FONT_BODY, text_color=MUTED)
        self.running_subtitle.pack(anchor="w", pady=(0, 24))

        # Big swatch
        self.swatch = ctk.CTkFrame(
            root, fg_color="#000000", corner_radius=14,
            height=140, border_width=0)
        self.swatch.pack(fill="x")
        self.swatch.pack_propagate(False)
        self.swatch_label = ctk.CTkLabel(
            self.swatch, text="—", font=FONT_MONO, text_color=TEXT)
        self.swatch_label.place(relx=0.5, rely=0.5, anchor="center")

        # Metrics under swatch
        metrics = ctk.CTkFrame(root, fg_color="transparent")
        metrics.pack(fill="x", pady=(20, 0))

        def _metric(label):
            row = ctk.CTkFrame(metrics, fg_color="transparent")
            row.pack(fill="x", pady=(6, 0))
            ctk.CTkLabel(row, text=label, font=FONT_LBL,
                         text_color=MUTED, width=88,
                         anchor="w").pack(side="left")
            bar = ctk.CTkProgressBar(
                row, height=4, fg_color=SURFACE2,
                progress_color=ACCENT, corner_radius=2)
            bar.set(0)
            bar.pack(side="left", fill="x", expand=True, padx=(0, 10))
            val = ctk.CTkLabel(row, text="—", font=FONT_MONO,
                               text_color=TEXT, width=44, anchor="e")
            val.pack(side="right")
            return bar, val

        self.run_level_bar, self.run_level_val = _metric("Level")
        self.run_chroma_bar, self.run_chroma_val = _metric("Chroma")
        self.run_lum_bar, self.run_lum_val = _metric("Luminance")

        # Mode-specific info row (BPM/Mood for audio)
        self.info_row = ctk.CTkFrame(root, fg_color="transparent")
        self.info_row.pack(fill="x", pady=(16, 0))
        self.info_left = ctk.CTkLabel(
            self.info_row, text="", font=FONT_LBL, text_color=MUTED,
            anchor="w")
        self.info_left.pack(side="left")
        self.info_right = ctk.CTkLabel(
            self.info_row, text="", font=FONT_LBL, text_color=MUTED,
            anchor="e")
        self.info_right.pack(side="right")

        # Stop button
        footer = ctk.CTkFrame(self.running_view, fg_color="transparent")
        footer.pack(side="bottom", fill="x", padx=24, pady=(0, 24))
        self.stop_btn = ctk.CTkButton(
            footer, text="Stop", command=self._stop,
            height=46, corner_radius=12, font=FONT_BTN,
            fg_color=SURFACE2, hover_color=BORDER, text_color=TEXT)
        self.stop_btn.pack(fill="x")

    # ────────────────────────────────────────────────────────────────────
    # State transitions
    # ────────────────────────────────────────────────────────────────────
    def _show_setup(self):
        self.running_view.pack_forget()
        self.setup_view.pack(fill="both", expand=True)

    def _show_running(self):
        self.setup_view.pack_forget()
        self.running_view.pack(fill="both", expand=True)

    def _set_step1_status(self, text, color=MUTED):
        self.bulb_status.configure(text=text, text_color=color)

    def _set_footer(self, text, color=MUTED):
        self.footer_status.configure(text=text, text_color=color)

    def _refresh_start_state(self):
        """Enable Start only when all preconditions are met."""
        ready = bool(self._bulb_ip and self.bulb.connected)
        if ready and self._mode == "video":
            # source is always at least "All Screens"
            ready = self.source_var.get() is not None
        if ready:
            self.start_btn.configure(state="normal")
            self._set_footer("Ready", OK)
        else:
            self.start_btn.configure(state="disabled")

    # ────────────────────────────────────────────────────────────────────
    # Step 1 — Discover bulb
    # ────────────────────────────────────────────────────────────────────
    def _discover(self):
        # Clear any troubleshoot block
        for w in self.trouble.winfo_children():
            w.destroy()
        self.trouble.pack_forget()
        self.find_btn.pack_forget()

        self._set_step1_status("Searching for bulbs on your network…", MUTED)
        self.bulb_status.update_idletasks()

        # Step A: do we even have a network?
        net_ok, net_label = _has_network()
        if not net_ok:
            self._show_troubleshoot(
                title="Your Mac isn't on a network.",
                checks=[
                    ("Connect this Mac to the same Wi-Fi as your bulb.",
                     False),
                ])
            return

        def _do():
            try:
                bulbs = self.bulb.discover()
            except Exception as e:
                bulbs = []
                self.logger.log("BULB", f"Discovery error: {e}")
            self.after(0, lambda: self._on_discovered(bulbs, net_label))

        threading.Thread(target=_do, daemon=True).start()

    def _on_discovered(self, bulbs, net_label):
        if not bulbs:
            self._show_troubleshoot_not_found(net_label)
            return

        # Connect to the first bulb
        ip = bulbs[0]["ip"]
        self._set_step1_status(f"Found bulb at {ip} — connecting…", MUTED)

        def _do():
            ok = self.bulb.connect(ip)
            self.after(0, lambda: self._on_connected(ok, ip))

        threading.Thread(target=_do, daemon=True).start()

    def _on_connected(self, ok, ip):
        if not ok:
            self._show_troubleshoot(
                title=f"Found bulb at {ip} but couldn't connect.",
                checks=[
                    ("Make sure the bulb isn't busy in the WiZ app",
                     False),
                    ("Power-cycle the bulb (off 5s, then on)", False),
                ])
            return

        self._bulb_ip = ip
        self.cfg["bulb_ip"] = ip
        cfg_mod.save(self.cfg)

        self._set_step1_status(f"●  Connected to bulb at {ip}", OK)
        self.find_btn.pack(fill="x", pady=(12, 0))
        self.find_btn.configure(text="Reconnect")

        # Unlock step 2
        self.seg_mode.configure(state="normal")
        self.card_mode.set_enabled(True)
        self._mode_changed()
        self._refresh_start_state()

    def _show_troubleshoot_not_found(self, net_label):
        ssid = _ssid()
        ssid_text = f" ({ssid})" if ssid else ""
        self._show_troubleshoot(
            title="Couldn't find a WiZ bulb on your network.",
            checks=[
                ("Bulb is plugged in and powered on", False),
                ("Bulb is set up in the Philips WiZ app", False),
                (f"This Mac is on Wi-Fi{ssid_text}, "
                 f"same network as the bulb", False),
                (f"Network interface: {net_label}", True),
            ])

    def _show_troubleshoot(self, title, checks):
        self._set_step1_status(f"⚠  {title}", WARN)

        # Build checklist UI
        for w in self.trouble.winfo_children():
            w.destroy()
        ctk.CTkLabel(self.trouble, text="Check the following:",
                     font=FONT_LBL, text_color=TEXT,
                     anchor="w").pack(fill="x", pady=(12, 6))
        for text, satisfied in checks:
            row = ctk.CTkFrame(self.trouble, fg_color="transparent")
            row.pack(fill="x", pady=(2, 0))
            mark = "✓" if satisfied else "○"
            mc = OK if satisfied else MUTED
            ctk.CTkLabel(row, text=mark, font=FONT_LBL,
                         text_color=mc, width=18,
                         anchor="w").pack(side="left")
            ctk.CTkLabel(row, text=text, font=FONT_LBL,
                         text_color=TEXT if not satisfied else MUTED,
                         anchor="w", justify="left").pack(side="left",
                                                          fill="x",
                                                          expand=True)

        self.trouble.pack(fill="x", pady=(0, 0))
        self.find_btn.pack(fill="x", pady=(12, 0))
        self.find_btn.configure(text="Search again")

        # Lock everything past step 1
        self.seg_mode.configure(state="disabled")
        self.card_mode.set_enabled(False)
        self.card_source.pack_forget()
        self._refresh_start_state()

    # ────────────────────────────────────────────────────────────────────
    # Step 2 / 3 — Mode + source
    # ────────────────────────────────────────────────────────────────────
    def _mode_changed(self):
        self._mode = self.mode_var.get()
        self.cfg["mode"] = self._mode
        cfg_mod.save(self.cfg)

        if self._mode == "audio":
            self.mode_caption.configure(
                text="Reacts to system audio — music, video, anything "
                     "playing through your Mac's output.")
            self.card_source.pack_forget()
        else:
            self.mode_caption.configure(
                text="Reacts to your screen content — pick a window or "
                     "let it watch your whole display.")
            self.card_source.pack(fill="x", pady=(0, 16),
                                  before=self._source_anchor())
            if not self._windows:
                self._refresh_sources()

        self._refresh_start_state()

    def _source_anchor(self):
        # Pack card_source just before the footer status — i.e., at the
        # bottom of the cards stack
        return self.card_mode

    def _refresh_sources(self):
        wins = self.video.list_windows()
        self._windows = wins
        values = ["All Screens"] + [w["label"] for w in wins]
        self.source_menu.configure(values=values)
        cur = self.source_var.get()
        if cur not in values:
            self.source_var.set("All Screens")
        self._source_changed()

    def _source_changed(self):
        sel = self.source_var.get()
        if sel == "All Screens":
            self.video.target_window_id = 0
        else:
            for w in self._windows:
                if w["label"] == sel:
                    self.video.target_window_id = w["id"]
                    break
        self._refresh_start_state()

    # ────────────────────────────────────────────────────────────────────
    # Run / stop
    # ────────────────────────────────────────────────────────────────────
    def _start(self):
        self._active = True
        self.logger.log("APP", f"Starting in {self._mode} mode")

        # Sensible auto-tuned defaults — sliders are gone
        if self._mode == "audio":
            self.audio.sensitivity = 1.5
            self.audio.snappy = False
            self.audio.start()
            self.running_subtitle.configure(text="Audio mode — listening")
        else:
            self.video.transition_speed = 0.15  # legacy, unused now
            self.video.start()
            sel = self.source_var.get()
            self.running_subtitle.configure(
                text=f"Video mode — {sel}")

        self._show_running()
        threading.Thread(target=self._update_loop, daemon=True).start()
        self._poll_running()

    def _stop(self):
        self._active = False
        self.audio.stop()
        self.video.stop()
        self.bulb.set_color(0, 0, 0, 0, force=True)
        self._show_setup()
        self._set_footer("Stopped", MUTED)

    def _poll_running(self):
        if not self._active:
            return
        if self._mode == "audio":
            bpm = self.audio.bpm
            self.info_left.configure(
                text=f"Mood: {self.audio.current_mood}")
            self.info_right.configure(
                text=f"BPM {bpm:.0f}" if bpm else "")
        else:
            self.info_left.configure(text="")
            self.info_right.configure(text="")
        self.after(400, self._poll_running)

    def _update_loop(self):
        while self._active:
            try:
                if self._mode == "audio":
                    r, g, b, bri = self.audio.get_color()
                    force = self.audio.snappy and self.audio._beat_detected
                    self.bulb.set_color(r, g, b, bri, force=force)
                    energy = self.audio.energy
                    self.after(0, lambda rv=r, gv=g, bv=b, e=energy:
                               self._update_metrics(rv, gv, bv,
                                                    level=e))
                else:
                    r, g, b = self.video.get_color()
                    lum = self.video.scene_luminance
                    self.video._smooth_lum += (lum - self.video._smooth_lum) * 0.25
                    sl = self.video._smooth_lum
                    chroma = self.video.scene_chroma
                    if sl < 0.04:
                        bri = 0
                    else:
                        bri = max(1, min(255,
                                         int(25 + (sl ** 0.7) * 230)))
                    self.bulb.set_color(r, g, b, bri)
                    self.after(0, lambda rv=r, gv=g, bv=b,
                               c=chroma, l=sl:
                               self._update_metrics(rv, gv, bv,
                                                    level=l, chroma=c,
                                                    lum=l))
            except Exception:
                pass
            time.sleep(0.05)

    def _update_metrics(self, r, g, b, level=0.0, chroma=None, lum=None):
        try:
            self.swatch.configure(fg_color=f"#{r:02x}{g:02x}{b:02x}")
            self.swatch_label.configure(
                text=f"{r}, {g}, {b}",
                text_color="#000000" if (r + g + b) > 360 else TEXT)
            self.run_level_bar.set(min(1.0, max(0.0, level)))
            self.run_level_val.configure(text=f"{int(level * 100)}%")
            if chroma is not None:
                self.run_chroma_bar.set(min(1.0, max(0.0, chroma)))
                self.run_chroma_val.configure(text=f"{int(chroma * 100)}%")
            else:
                self.run_chroma_bar.set(0)
                self.run_chroma_val.configure(text="—")
            if lum is not None:
                self.run_lum_bar.set(min(1.0, max(0.0, lum)))
                self.run_lum_val.configure(text=f"{int(lum * 100)}%")
            else:
                self.run_lum_bar.set(0)
                self.run_lum_val.configure(text="—")
        except Exception:
            pass

    # ────────────────────────────────────────────────────────────────────
    # Quit
    # ────────────────────────────────────────────────────────────────────
    def _really_quit(self):
        self._active = False
        try:
            self.audio.stop()
        except Exception:
            pass
        try:
            self.video.stop()
        except Exception:
            pass
        try:
            self.bulb.shutdown()
        except Exception:
            pass
        try:
            self.logger.close()
        except Exception:
            pass
        self.destroy()


def main():
    app = WizAmbientApp()
    app.mainloop()
