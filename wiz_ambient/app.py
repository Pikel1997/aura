"""WiZ Ambient — minimal native-feeling Mac app.

Clean dark UI, menu bar integration (NSStatusBar), settings persistence,
window selection, BPM display, hide-on-close background operation.
"""

import customtkinter as ctk
import threading
import time

from .bulb import BulbController
from .audio import AudioAnalyzer
from .video import VideoAnalyzer
from .logger import SessionLogger
from . import config as cfg_mod


# ── Palette (European minimal dark) ──
BG       = "#0e0e10"
SURFACE  = "#17171a"
SURFACE2 = "#1f1f24"
BORDER   = "#26262d"
TEXT     = "#e9e9ec"
MUTED    = "#8a8a93"
ACCENT   = "#d4d4d9"
OK       = "#7ecf8a"
WARN     = "#e5a45a"
ERR      = "#e57373"

FONT_H   = ("SF Pro Display", 22, "normal")
FONT_LBL = ("SF Pro Display", 10)
FONT_CAP = ("SF Pro Display", 9)
FONT_MONO = ("SF Mono", 10)
FONT_BTN = ("SF Pro Display", 12)


def _section(parent, title):
    """Create a bordered section container with a caption."""
    wrap = ctk.CTkFrame(parent, fg_color="transparent")
    wrap.pack(fill="x", padx=18, pady=(14, 0))
    ctk.CTkLabel(wrap, text=title.upper(), font=FONT_CAP,
                 text_color=MUTED, anchor="w").pack(fill="x", pady=(0, 6))
    box = ctk.CTkFrame(wrap, fg_color=SURFACE, corner_radius=10,
                       border_width=1, border_color=BORDER)
    box.pack(fill="x")
    return box


class WizAmbientApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.cfg = cfg_mod.load()

        self.title("WiZ Ambient")
        self.geometry("440x720")
        self.minsize(440, 720)
        self.configure(fg_color=BG)

        ctk.set_appearance_mode("dark")

        self.logger = SessionLogger()
        self.bulb = BulbController()
        self.audio = AudioAnalyzer(logger=self.logger)
        self.video = VideoAnalyzer(logger=self.logger)

        self.bulb.color_correction = self.cfg.get("color_correction", True)

        self._active = False
        self._mode = self.cfg.get("mode", "audio")
        self._test_running = False
        self._windows = []  # list of {id,label}

        self._build_ui()
        self._apply_cfg()
        self.protocol("WM_DELETE_WINDOW", self._on_close_hide)
        self.logger.log("APP", "UI built, ready")

        self._install_menu_bar()

        if self.cfg.get("start_hidden"):
            self.withdraw()

        if self.cfg.get("auto_start") and self.cfg.get("bulb_ip"):
            self.after(500, self._auto_connect_and_start)

    # ────────────────────────────────────────────────────────────────────
    # UI
    # ────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        root = ctk.CTkScrollableFrame(self, fg_color=BG,
                                      scrollbar_button_color=SURFACE2,
                                      scrollbar_button_hover_color=BORDER)
        root.pack(fill="both", expand=True)

        # Header
        head = ctk.CTkFrame(root, fg_color="transparent")
        head.pack(fill="x", padx=18, pady=(18, 0))
        ctk.CTkLabel(head, text="WiZ Ambient",
                     font=FONT_H, text_color=TEXT).pack(anchor="w")
        ctk.CTkLabel(head, text="Reactive lighting",
                     font=FONT_LBL, text_color=MUTED).pack(anchor="w")

        # ── Bulb ──
        box = _section(root, "Bulb")
        inner = ctk.CTkFrame(box, fg_color="transparent")
        inner.pack(fill="x", padx=12, pady=12)
        self.ip_entry = ctk.CTkEntry(
            inner, placeholder_text="IP address",
            fg_color=SURFACE2, border_color=BORDER, text_color=TEXT,
            height=32)
        self.ip_entry.pack(fill="x")
        btn_row = ctk.CTkFrame(inner, fg_color="transparent")
        btn_row.pack(fill="x", pady=(8, 0))
        self.connect_btn = ctk.CTkButton(
            btn_row, text="Connect", command=self._connect, height=30,
            fg_color=SURFACE2, hover_color=BORDER, text_color=TEXT,
            border_width=1, border_color=BORDER, font=FONT_BTN)
        self.connect_btn.pack(side="left", fill="x", expand=True, padx=(0, 4))
        self.discover_btn = ctk.CTkButton(
            btn_row, text="Discover", command=self._discover, height=30,
            fg_color=SURFACE2, hover_color=BORDER, text_color=MUTED,
            border_width=1, border_color=BORDER, font=FONT_BTN)
        self.discover_btn.pack(side="left", fill="x", expand=True, padx=(4, 0))
        self.conn_status = ctk.CTkLabel(
            inner, text="Not connected", text_color=MUTED, font=FONT_LBL)
        self.conn_status.pack(anchor="w", pady=(8, 0))

        # ── Mode ──
        box = _section(root, "Mode")
        mrow = ctk.CTkFrame(box, fg_color="transparent")
        mrow.pack(fill="x", padx=12, pady=12)
        self.mode_var = ctk.StringVar(value=self._mode)
        self.seg_mode = ctk.CTkSegmentedButton(
            mrow, values=["audio", "video"],
            variable=self.mode_var, command=lambda _=None: self._mode_changed(),
            fg_color=SURFACE2, selected_color=BORDER,
            selected_hover_color=BORDER, unselected_color=SURFACE2,
            unselected_hover_color=SURFACE2, text_color=TEXT,
            font=FONT_BTN, height=32)
        self.seg_mode.pack(fill="x")

        # ── Audio panel ──
        self.audio_box = _section(root, "Audio")
        a = ctk.CTkFrame(self.audio_box, fg_color="transparent")
        a.pack(fill="x", padx=12, pady=12)

        ctk.CTkLabel(a, text="Style", font=FONT_LBL,
                     text_color=MUTED).pack(anchor="w")
        self.audio_style_var = ctk.StringVar(
            value=self.cfg.get("audio_style", "smooth"))
        self.seg_style = ctk.CTkSegmentedButton(
            a, values=["smooth", "snappy"], variable=self.audio_style_var,
            command=lambda _=None: self._save_cfg(),
            fg_color=SURFACE2, selected_color=BORDER,
            selected_hover_color=BORDER, unselected_color=SURFACE2,
            unselected_hover_color=SURFACE2, text_color=TEXT,
            font=FONT_BTN, height=30)
        self.seg_style.pack(fill="x", pady=(4, 10))

        ctk.CTkLabel(a, text="Sensitivity", font=FONT_LBL,
                     text_color=MUTED).pack(anchor="w")
        self.sens_slider = ctk.CTkSlider(
            a, from_=0.1, to=5.0, number_of_steps=49,
            fg_color=SURFACE2, progress_color=ACCENT, button_color=TEXT,
            button_hover_color=ACCENT, command=lambda _=None: self._save_cfg())
        self.sens_slider.set(self.cfg.get("audio_sensitivity", 1.5))
        self.sens_slider.pack(fill="x", pady=(4, 8))

        # BPM display
        bpm_row = ctk.CTkFrame(a, fg_color="transparent")
        bpm_row.pack(fill="x")
        ctk.CTkLabel(bpm_row, text="BPM", font=FONT_LBL,
                     text_color=MUTED).pack(side="left")
        self.bpm_value = ctk.CTkLabel(
            bpm_row, text="—", font=("SF Mono", 12), text_color=TEXT)
        self.bpm_value.pack(side="right")

        mood_row = ctk.CTkFrame(a, fg_color="transparent")
        mood_row.pack(fill="x", pady=(4, 0))
        ctk.CTkLabel(mood_row, text="Mood", font=FONT_LBL,
                     text_color=MUTED).pack(side="left")
        self.mood_value = ctk.CTkLabel(
            mood_row, text="—", font=FONT_MONO, text_color=TEXT)
        self.mood_value.pack(side="right")

        # ── Video panel ──
        self.video_box = _section(root, "Video")
        v = ctk.CTkFrame(self.video_box, fg_color="transparent")
        v.pack(fill="x", padx=12, pady=12)

        ctk.CTkLabel(v, text="Source", font=FONT_LBL,
                     text_color=MUTED).pack(anchor="w")
        self.source_var = ctk.StringVar(
            value=self.cfg.get("video_source", "All Screens"))
        self.source_menu = ctk.CTkOptionMenu(
            v, variable=self.source_var, values=["All Screens"],
            fg_color=SURFACE2, button_color=SURFACE2, button_hover_color=BORDER,
            text_color=TEXT, dropdown_fg_color=SURFACE2,
            dropdown_hover_color=BORDER, dropdown_text_color=TEXT,
            command=lambda _=None: self._source_changed(), height=32)
        self.source_menu.pack(fill="x", pady=(4, 4))
        refresh = ctk.CTkButton(
            v, text="Refresh sources", command=self._refresh_sources,
            height=26, fg_color="transparent", hover_color=SURFACE2,
            text_color=MUTED, font=FONT_CAP)
        refresh.pack(anchor="w")

        ctk.CTkLabel(v, text="Smoothing", font=FONT_LBL,
                     text_color=MUTED).pack(anchor="w", pady=(10, 0))
        self.smooth_slider = ctk.CTkSlider(
            v, from_=0.03, to=0.4, number_of_steps=37,
            fg_color=SURFACE2, progress_color=ACCENT, button_color=TEXT,
            button_hover_color=ACCENT, command=lambda _=None: self._save_cfg())
        self.smooth_slider.set(self.cfg.get("video_smoothing", 0.15))
        self.smooth_slider.pack(fill="x", pady=(4, 0))

        # ── Preview ──
        box = _section(root, "Preview")
        p = ctk.CTkFrame(box, fg_color="transparent")
        p.pack(fill="x", padx=12, pady=12)
        self.swatch = ctk.CTkFrame(
            p, fg_color="#000000", corner_radius=8, height=54,
            border_width=1, border_color=BORDER)
        self.swatch.pack(fill="x")
        self.swatch.pack_propagate(False)
        self.swatch_label = ctk.CTkLabel(
            self.swatch, text="—", font=FONT_MONO, text_color=TEXT)
        self.swatch_label.place(relx=0.5, rely=0.5, anchor="center")

        lvl_row = ctk.CTkFrame(p, fg_color="transparent")
        lvl_row.pack(fill="x", pady=(8, 0))
        ctk.CTkLabel(lvl_row, text="Level", font=FONT_LBL,
                     text_color=MUTED).pack(side="left")
        self.level_bar = ctk.CTkProgressBar(
            lvl_row, height=4, fg_color=SURFACE2, progress_color=ACCENT)
        self.level_bar.set(0)
        self.level_bar.pack(side="left", fill="x", expand=True, padx=(8, 0))

        # ── Options ──
        box = _section(root, "Options")
        o = ctk.CTkFrame(box, fg_color="transparent")
        o.pack(fill="x", padx=12, pady=12)
        self.cc_var = ctk.BooleanVar(
            value=self.cfg.get("color_correction", True))
        ctk.CTkCheckBox(
            o, text="Color correction", variable=self.cc_var,
            command=self._cc_changed, font=FONT_LBL, text_color=TEXT,
            fg_color=ACCENT, hover_color=ACCENT, border_color=BORDER,
            checkmark_color=BG).pack(anchor="w")
        self.as_var = ctk.BooleanVar(value=self.cfg.get("auto_start", False))
        ctk.CTkCheckBox(
            o, text="Auto-start on launch", variable=self.as_var,
            command=self._save_cfg, font=FONT_LBL, text_color=TEXT,
            fg_color=ACCENT, hover_color=ACCENT, border_color=BORDER,
            checkmark_color=BG).pack(anchor="w", pady=(6, 0))
        self.sh_var = ctk.BooleanVar(value=self.cfg.get("start_hidden", False))
        ctk.CTkCheckBox(
            o, text="Start hidden in menu bar", variable=self.sh_var,
            command=self._save_cfg, font=FONT_LBL, text_color=TEXT,
            fg_color=ACCENT, hover_color=ACCENT, border_color=BORDER,
            checkmark_color=BG).pack(anchor="w", pady=(6, 0))

        # ── Status + Start ──
        self.status_label = ctk.CTkLabel(
            root, text="Ready", font=FONT_LBL, text_color=MUTED)
        self.status_label.pack(pady=(14, 6))

        self.start_btn = ctk.CTkButton(
            root, text="Start", command=self._toggle, state="disabled",
            height=42, font=("SF Pro Display", 14, "bold"),
            fg_color=TEXT, hover_color=ACCENT, text_color=BG)
        self.start_btn.pack(fill="x", padx=18, pady=(0, 18))

    def _apply_cfg(self):
        ip = self.cfg.get("bulb_ip", "")
        if ip:
            self.ip_entry.insert(0, ip)
        self._mode_changed()

    # ────────────────────────────────────────────────────────────────────
    # Settings persistence
    # ────────────────────────────────────────────────────────────────────
    def _push_settings(self):
        """Push current UI values into analyzers (call from main thread only)."""
        try:
            self.audio.sensitivity = float(self.sens_slider.get())
            self.audio.snappy = (self.audio_style_var.get() == "snappy")
            self.video.transition_speed = float(self.smooth_slider.get())
        except Exception:
            pass

    def _save_cfg(self, *_):
        self._push_settings()
        self.cfg.update({
            "bulb_ip": self.ip_entry.get().strip(),
            "mode": self.mode_var.get(),
            "audio_sensitivity": float(self.sens_slider.get()),
            "audio_style": self.audio_style_var.get(),
            "video_smoothing": float(self.smooth_slider.get()),
            "video_source": self.source_var.get(),
            "color_correction": bool(self.cc_var.get()),
            "auto_start": bool(self.as_var.get()),
            "start_hidden": bool(self.sh_var.get()),
        })
        cfg_mod.save(self.cfg)

    def _cc_changed(self):
        self.bulb.color_correction = bool(self.cc_var.get())
        self._save_cfg()

    # ────────────────────────────────────────────────────────────────────
    # Mode + sources
    # ────────────────────────────────────────────────────────────────────
    def _mode_changed(self):
        self._mode = self.mode_var.get()
        if self._mode == "audio":
            self.video_box.master.pack_forget()
            self.audio_box.master.pack(fill="x", padx=18, pady=(14, 0),
                                       before=self._preview_parent())
        else:
            self.audio_box.master.pack_forget()
            self.video_box.master.pack(fill="x", padx=18, pady=(14, 0),
                                       before=self._preview_parent())
            if len(self._windows) == 0:
                self._refresh_sources()
        self._save_cfg()

    def _preview_parent(self):
        # The Preview section's wrap frame — find it heuristically
        # Just use the swatch's grandparent wrap
        return self.swatch.master.master.master

    def _refresh_sources(self):
        wins = self.video.list_windows()
        self._windows = wins
        values = ["All Screens"] + [w["label"] for w in wins]
        self.source_menu.configure(values=values)
        # Preserve selection if still available
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
        self._save_cfg()

    # ────────────────────────────────────────────────────────────────────
    # Bulb
    # ────────────────────────────────────────────────────────────────────
    def _discover(self):
        self.conn_status.configure(text="Searching…", text_color=WARN)
        self.discover_btn.configure(state="disabled")

        def _do():
            bulbs = self.bulb.discover()
            self.after(0, lambda: self._on_discovered(bulbs))

        threading.Thread(target=_do, daemon=True).start()

    def _on_discovered(self, bulbs):
        self.discover_btn.configure(state="normal")
        if bulbs:
            ip = bulbs[0]["ip"]
            self.ip_entry.delete(0, "end")
            self.ip_entry.insert(0, ip)
            self.conn_status.configure(text=f"Found {ip}", text_color=OK)
            self._save_cfg()
        else:
            self.conn_status.configure(
                text="No bulbs found. Enter IP manually.", text_color=WARN)

    def _connect(self):
        ip = self.ip_entry.get().strip()
        if not ip:
            self.conn_status.configure(text="Enter an IP", text_color=WARN)
            return
        self.conn_status.configure(text="Connecting…", text_color=WARN)
        self.connect_btn.configure(state="disabled")

        def _do():
            ok = self.bulb.connect(ip)
            self.after(0, lambda: self._on_connected(ok, ip))

        threading.Thread(target=_do, daemon=True).start()

    def _on_connected(self, ok, ip):
        self.connect_btn.configure(state="normal")
        if ok:
            self.conn_status.configure(text=f"Connected {ip}", text_color=OK)
            self.start_btn.configure(state="normal")
            self._save_cfg()
        else:
            self.conn_status.configure(text="Failed. Check IP.", text_color=ERR)

    def _auto_connect_and_start(self):
        ip = self.cfg.get("bulb_ip", "")
        if not ip:
            return

        def _do():
            ok = self.bulb.connect(ip)
            self.after(0, lambda: self._auto_continue(ok, ip))

        threading.Thread(target=_do, daemon=True).start()

    def _auto_continue(self, ok, ip):
        if ok:
            self.conn_status.configure(text=f"Connected {ip}", text_color=OK)
            self.start_btn.configure(state="normal")
            self._start()

    # ────────────────────────────────────────────────────────────────────
    # Start / stop loop
    # ────────────────────────────────────────────────────────────────────
    def _toggle(self):
        if self._active:
            self._stop()
        else:
            self._start()

    def _start(self):
        self._active = True
        self.start_btn.configure(text="Stop", fg_color=ERR, text_color=TEXT)
        mode = self._mode
        self.logger.log("APP", f"Starting in {mode} mode")

        if mode == "audio":
            self.audio.sensitivity = float(self.sens_slider.get())
            self.audio.snappy = (self.audio_style_var.get() == "snappy")
            self.audio.start()
        else:
            self.video.transition_speed = float(self.smooth_slider.get())
            self.video.start()

        threading.Thread(target=self._update_loop, daemon=True).start()
        self._poll_status()

    def _stop(self):
        self._active = False
        self.start_btn.configure(text="Start", fg_color=TEXT, text_color=BG)
        self.audio.stop()
        self.video.stop()
        self.status_label.configure(text="Stopped", text_color=MUTED)

    def _poll_status(self):
        if not self._active:
            return
        if self._mode == "audio":
            st = self.audio.get_status()
            self.bpm_value.configure(
                text=f"{self.audio.bpm:.0f}" if self.audio.bpm else "—")
            self.mood_value.configure(text=self.audio.current_mood)
        else:
            st = self.video.get_status()
        color = OK if "error" not in st.lower() and "black" not in st.lower() else WARN
        self.status_label.configure(text=st, text_color=color)
        self.after(400, self._poll_status)

    def _update_loop(self):
        while self._active:
            try:
                if self._mode == "audio":
                    r, g, b, bri = self.audio.get_color()
                    force = self.audio.snappy and self.audio._beat_detected
                    self.bulb.set_color(r, g, b, bri, force=force)
                    energy = self.audio.energy
                    self.after(0, lambda rv=r, gv=g, bv=b, e=energy:
                               self._update_swatch(rv, gv, bv, e))
                else:
                    r, g, b = self.video.get_color()
                    bri = max(40, min(255, int((r + g + b) / 3 * 1.5)))
                    self.bulb.set_color(r, g, b, bri)
                    self.after(0, lambda rv=r, gv=g, bv=b:
                               self._update_swatch(rv, gv, bv, 0))
            except Exception:
                pass
            time.sleep(0.02)

    def _update_swatch(self, r, g, b, energy):
        try:
            self.swatch.configure(fg_color=f"#{r:02x}{g:02x}{b:02x}")
            self.swatch_label.configure(
                text=f"{r},{g},{b}",
                text_color="#000000" if (r + g + b) > 360 else TEXT)
            self.level_bar.set(min(1.0, energy))
        except Exception:
            pass

    # ────────────────────────────────────────────────────────────────────
    # Menu bar (NSStatusBar via PyObjC)
    # ────────────────────────────────────────────────────────────────────
    def _install_menu_bar(self):
        try:
            from AppKit import (NSStatusBar, NSVariableStatusItemLength,
                                NSMenu, NSMenuItem)
            from Foundation import NSObject
            import objc

            app_ref = self

            class WizMenuTarget(NSObject):
                def show_(self, sender):
                    app_ref.after(0, app_ref._show_window)

                def toggle_(self, sender):
                    app_ref.after(0, app_ref._toggle)

                def quit_(self, sender):
                    app_ref.after(0, app_ref._really_quit)

            bar = NSStatusBar.systemStatusBar()
            self._status_item = bar.statusItemWithLength_(
                NSVariableStatusItemLength)
            self._status_item.button().setTitle_("●")

            menu = NSMenu.alloc().init()
            target = WizMenuTarget.alloc().init()
            self._menu_target = target

            show = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
                "Show WiZ Ambient", "show:", "")
            show.setTarget_(target)
            menu.addItem_(show)

            tog = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
                "Start / Stop", "toggle:", "")
            tog.setTarget_(target)
            menu.addItem_(tog)

            menu.addItem_(NSMenuItem.separatorItem())

            q = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
                "Quit", "quit:", "q")
            q.setTarget_(target)
            menu.addItem_(q)

            self._status_item.setMenu_(menu)
            self.logger.log("APP", "Menu bar installed")
        except Exception as e:
            self.logger.log("APP", f"Menu bar unavailable: {e}")

    def _show_window(self):
        try:
            self.deiconify()
        except Exception:
            pass
        try:
            self.lift()
        except Exception:
            pass
        try:
            self.attributes("-topmost", True)
            self.after(100, lambda: self.attributes("-topmost", False))
        except Exception:
            pass

    def _on_close_hide(self):
        # Hide window; keep app alive in menu bar
        try:
            self.withdraw()
        except Exception:
            self._really_quit()

    def _really_quit(self):
        self._active = False
        self._test_running = False
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
