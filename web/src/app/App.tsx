import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { Orb } from "./components/Orb";
import { StatusPill } from "./components/StatusPill";
import { InstallBridge } from "./components/InstallBridge";
import { RequirementsModal } from "./components/RequirementsModal";
import { GrainOverlay } from "./components/GrainOverlay";
import { CropMarks } from "./components/CropMarks";
import {
  ping,
  discover,
  connectBulb,
  setBulbColor,
  turnBulbOff,
  BRIDGE_URL,
} from "../lib/bridge";
import { extractAuraColor, lumToBrightness } from "../lib/colors";

type AppState =
  | "idle"
  | "checking"
  | "no-bridge"
  | "no-bulb"
  | "picking-tab"
  | "running"
  | "error";

const STATE_LABELS: Record<AppState, string> = {
  idle: "Idle",
  checking: "Checking",
  "no-bridge": "No Bridge",
  "no-bulb": "No Bulb",
  "picking-tab": "Tab Select",
  running: "Running",
  error: "Error",
};

const ACCENT_COLORS: Record<AppState, string> = {
  idle: "#8060ff",
  checking: "#6050cc",
  "no-bridge": "#cc1800",
  "no-bulb": "#cc6600",
  "picking-tab": "#8060ff",
  running: "#ff8800",
  error: "#cc1800",
};

// Capture + animator constants — match the Python BulbController
const SAMPLE_SIZE = 96;
const TICK_MS = 100; // 10 Hz, matches accUdpPropRate
const SCENE_CUT_DELTA = 90;
const COLOR_EASE = 0.65;
const BRI_EASE = 0.8;

// Debug switcher only visible when ?debug is in the URL
const DEBUG = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).has("debug");

// Read a friendly name for the captured surface. Chrome's behavior
// here depends on the version and which surface the user picks:
//
//   - Tab capture          → usually the tab's <title>, sometimes the
//                            URL, sometimes "web-contents-media-stream://"
//   - Window capture       → window title (e.g. "Visual Studio Code")
//   - Whole-screen capture → "Screen 1" or empty
//
// We only filter the specific known-bad "web-contents-media-stream:"
// internal identifier. Anything else — title, URL, hostname — is shown
// verbatim because it's almost always more useful than a generic
// fallback. Only fall back to the surface type when the label is
// genuinely empty.
function friendlyTabName(track: MediaStreamTrack): string {
  const label = (track.label || "").trim();
  let surface: string | undefined;
  let settingsSnapshot: unknown;
  try {
    const s = track.getSettings();
    settingsSnapshot = s;
    surface = (s as { displaySurface?: string }).displaySurface;
  } catch {
    surface = undefined;
  }

  // Debug: log exactly what Chrome handed us so we can iterate.
  // Open DevTools → Console after clicking Start Aura.
  // eslint-disable-next-line no-console
  console.log("[Aura] track label/settings:", {
    label,
    surface,
    settings: settingsSnapshot,
  });

  // Drop only the specific Chrome internal identifier
  if (label && !label.startsWith("web-contents-media-stream:")) {
    return label;
  }

  // Truly empty / internal-only — fall back by surface
  if (surface === "browser") return "Browser tab";
  if (surface === "window") return "Application window";
  if (surface === "monitor") return "Entire screen";
  return "Captured source";
}

// ── Theme toggle ─────────────────────────────────────────────────
function ThemeToggle() {
  const { t, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={t.isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "transparent",
        border: `1px solid ${t.borderStrong}`,
        padding: "5px 11px 4px",
        cursor: "pointer",
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: t.textSubtle,
        transition: "all 0.2s ease",
        borderRadius: 0,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
        (e.currentTarget as HTMLButtonElement).style.borderColor = t.isDark
          ? "rgba(255,255,255,0.22)"
          : "rgba(0,0,0,0.22)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = t.textSubtle;
        (e.currentTarget as HTMLButtonElement).style.borderColor = t.borderStrong;
      }}
    >
      {t.isDark ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
          <line x1="5" y1="0.5" x2="5" y2="1.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="5" y1="8.2" x2="5" y2="9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="0.5" y1="5" x2="1.8" y2="5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="8.2" y1="5" x2="9.5" y2="5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="1.7" y1="1.7" x2="2.6" y2="2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="7.4" y1="7.4" x2="8.3" y2="8.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="8.3" y1="1.7" x2="7.4" y2="2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <line x1="2.6" y1="7.4" x2="1.7" y2="8.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M8.5 6.5A4 4 0 013.5 1.5a4 4 0 100 7 4 4 0 005-2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {t.isDark ? "Light" : "Dark"}
    </button>
  );
}

// ── Inner app ────────────────────────────────────────────────────
function AuraApp() {
  const { t } = useTheme();

  const [appState, setAppState] = useState<AppState>("checking");
  const [bulbIp, setBulbIp] = useState<string | null>(null);
  const [tabName, setTabName] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    r: 0, g: 0, b: 0, bri: 0, lum: 0, chr: 0,
  });
  // Live BPM detected from the captured tab's audio (if shared). Drives
  // the orb's breathe animation only — the physical bulb is unaffected.
  const [liveBpm, setLiveBpm] = useState<number | null>(null);

  // Demo mode: skip the bridge entirely and run the orb visualization
  // for users who don't have a Philips WiZ bulb yet (or just want to
  // see what it does). Toggled by the RequirementsModal.
  const [demoMode, setDemoMode] = useState(false);

  // Pre-flight modal flow — controlled by parent (App). Both modals
  // are dismissible and only show when the user takes an action.
  const [reqsOpen, setReqsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [reqsCompleted, setReqsCompleted] = useState<boolean>(() => {
    try { return localStorage.getItem("aura.requirements.seen") === "1"; }
    catch { return false; }
  });
  // When set, the next time the bridge bootstrap settles into a usable
  // state, automatically start a capture. This is how "click Start →
  // pick option in modal → capture begins" flows without race conditions.
  const [pendingStart, setPendingStart] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const easedRef = useRef({ r: 0, g: 0, b: 0, bri: 0 });
  const lastSentRef = useRef({ r: -1, g: -1, b: -1, bri: -1 });

  // Audio analyzer state — only set up when the user shared tab audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioFftRef = useRef<Uint8Array | null>(null);
  const bassHistoryRef = useRef<number[]>([]);
  const lastBeatTimeRef = useRef(0);
  const beatTimesRef = useRef<number[]>([]);

  // Mirror demoMode in a ref so the long-lived setInterval can read the
  // current value without going stale across re-renders.
  const demoModeRef = useRef(demoMode);
  useEffect(() => { demoModeRef.current = demoMode; }, [demoMode]);

  // ── Bridge bootstrap ────────────────────────────────────────────
  const checkBridge = useCallback(async () => {
    // Demo mode skips the bridge entirely — go straight to "idle"
    // (which acts as "ready to capture, no bulb to control").
    if (demoMode) {
      setBulbIp(null);
      setAppState("idle");
      return;
    }
    setAppState("checking");
    try {
      const status = await ping();
      if (status.connected && status.ip) {
        setBulbIp(status.ip);
        setAppState("idle");
        return;
      }
      try {
        const bulbs = await discover();
        if (!bulbs.length) {
          setBulbIp(null);
          setAppState("no-bulb");
          return;
        }
        const ok = await connectBulb(bulbs[0].ip);
        if (ok) {
          setBulbIp(bulbs[0].ip);
          setAppState("idle");
        } else {
          setAppState("no-bulb");
        }
      } catch {
        setAppState("no-bulb");
      }
    } catch {
      setBulbIp(null);
      setAppState("no-bridge");
    }
  }, []);

  // The bridge bootstrap re-runs when demoMode flips so users can flow
  // smoothly between "demo" and "real bulb" without reloading the page.
  useEffect(() => {
    checkBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  // ── Audio analyzer (BPM only — bulb path is untouched) ─────────
  const tearDownAudio = useCallback(() => {
    try {
      analyserRef.current?.disconnect();
    } catch { /* ignore */ }
    try {
      audioCtxRef.current?.close();
    } catch { /* ignore */ }
    analyserRef.current = null;
    audioCtxRef.current = null;
    audioFftRef.current = null;
    bassHistoryRef.current = [];
    beatTimesRef.current = [];
    lastBeatTimeRef.current = 0;
    setLiveBpm(null);
  }, []);

  const setUpAudio = useCallback((stream: MediaStream) => {
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return; // user didn't tick "Share tab audio"
    try {
      const Ctx = (window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(new MediaStream(tracks));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      // Note: deliberately NOT connecting analyser to ctx.destination —
      // we don't want to duplicate the song into the user's speakers.
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      audioFftRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      // Audio analyzer setup failed — fall back silently to default pulse
      // eslint-disable-next-line no-console
      console.warn("[Aura] audio analyzer unavailable:", e);
    }
  }, []);

  // ── Capture lifecycle ──────────────────────────────────────────
  const stopCapture = useCallback(async () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    tearDownAudio();
    setTabName(null);
    setMetrics({ r: 0, g: 0, b: 0, bri: 0, lum: 0, chr: 0 });
    easedRef.current = { r: 0, g: 0, b: 0, bri: 0 };
    lastSentRef.current = { r: -1, g: -1, b: -1, bri: -1 };
    if (!demoModeRef.current) {
      try {
        await turnBulbOff();
      } catch {
        /* ignore */
      }
    }
    setAppState((s) => (s === "running" || s === "picking-tab" ? "idle" : s));
  }, [tearDownAudio]);

  // Beat onset detection — runs each tick when audio is available.
  // Reads bass-band FFT, compares to a rolling average, debounces beats,
  // computes BPM as median interval over the last 8 beats. Drives the
  // orb's pulse only — does NOT touch the bulb code path.
  const detectBeat = useCallback(() => {
    const analyser = analyserRef.current;
    const fft = audioFftRef.current;
    if (!analyser || !fft) return;

    analyser.getByteFrequencyData(fft);

    // Bass band: bins 1-10 ≈ 40-450 Hz at fftSize 1024 / sampleRate ~48k
    let bass = 0;
    for (let i = 1; i <= 10; i++) bass += fft[i];
    bass /= 10;

    const history = bassHistoryRef.current;
    history.push(bass);
    if (history.length > 43) history.shift(); // ~4.3s at 10 Hz tick
    if (history.length < 10) return;

    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const now = performance.now();
    const cooldownOk = now - lastBeatTimeRef.current > 220;
    const isOnset = bass > avg * 1.45 && bass > 30 && cooldownOk;
    if (!isOnset) return;

    lastBeatTimeRef.current = now;
    const beats = beatTimesRef.current;
    beats.push(now);
    // Keep last ~5s of beats
    while (beats.length > 0 && now - beats[0] > 5000) beats.shift();
    if (beats.length < 4) return;

    // Median inter-beat interval, filtered to musical range
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      const dt = beats[i] - beats[i - 1];
      if (dt > 250 && dt < 1100) intervals.push(dt);
    }
    if (intervals.length < 3) return;
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    const rawBpm = 60000 / median;
    if (rawBpm < 60 || rawBpm > 180) return;

    // Smoothed BPM
    setLiveBpm((prev) => (prev ? prev * 0.65 + rawBpm * 0.35 : rawBpm));
  }, []);

  const startTicking = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      detectBeat();

      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.videoWidth === 0) return;

      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(v, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const img = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const result = extractAuraColor(img);
      const targetBri = lumToBrightness(result.lum);

      // Eased animator (matches the Python BulbController)
      const cur = easedRef.current;
      const dr = result.r - cur.r;
      const dg = result.g - cur.g;
      const db = result.b - cur.b;
      const dbri = targetBri - cur.bri;
      const delta = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
      const eC = delta > SCENE_CUT_DELTA ? 1 : COLOR_EASE;
      const eB = delta > SCENE_CUT_DELTA ? 1 : BRI_EASE;
      cur.r += dr * eC;
      cur.g += dg * eC;
      cur.b += db * eC;
      cur.bri += dbri * eB;

      const send = {
        r: clamp255(Math.round(cur.r)),
        g: clamp255(Math.round(cur.g)),
        b: clamp255(Math.round(cur.b)),
        bri: clamp255(Math.round(cur.bri)),
      };

      setMetrics({
        r: send.r,
        g: send.g,
        b: send.b,
        bri: send.bri,
        lum: +result.lum.toFixed(2),
        chr: +result.chroma.toFixed(2),
      });

      const last = lastSentRef.current;
      const moved =
        Math.abs(send.r - last.r) +
          Math.abs(send.g - last.g) +
          Math.abs(send.b - last.b) >
          3 || Math.abs(send.bri - last.bri) > 3;
      // In demo mode the bulb path is skipped entirely — the orb still
      // animates from `metrics`, we just don't POST to the bridge.
      if (moved && !demoModeRef.current) {
        lastSentRef.current = send;
        setBulbColor(send.r, send.g, send.b, send.bri).catch(() => {
          stopCapture();
          setAppState("error");
        });
      }
    }, TICK_MS);
  }, [stopCapture, detectBeat]);

  const startCapture = useCallback(async () => {
    if (appState !== "idle") return;
    setAppState("picking-tab");
    try {
      // Request audio too — Chrome will show a "Share tab audio" tickbox
      // in the picker. If the user shares it we use it for BPM detection
      // (orb-only). If they don't, the orb falls back to its default
      // pulse and nothing else changes.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTabName(friendlyTabName(track));

      // Set up the audio analyzer if the stream has audio. Failures are
      // silent — bulb code path is unaffected.
      setUpAudio(stream);

      track.addEventListener("ended", () => {
        stopCapture();
      });

      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();

      setAppState("running");
      startTicking();
    } catch {
      setAppState("idle");
    }
  }, [appState, startTicking, stopCapture, setUpAudio]);

  // Hot-swap the captured source mid-session. Opens the picker again,
  // tears down the current stream + audio analyzer, and sets up the
  // new one without leaving the running state. If the user cancels
  // the picker we keep the existing capture intact.
  const switchTab = useCallback(async () => {
    if (appState !== "running") return;
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);

      // Tear down the old stream + audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      tearDownAudio();

      // Wire up the new one
      streamRef.current = newStream;
      const newTrack = newStream.getVideoTracks()[0];
      setTabName(friendlyTabName(newTrack));
      setUpAudio(newStream);
      newTrack.addEventListener("ended", () => { stopCapture(); });

      const v = videoRef.current!;
      v.srcObject = newStream;
      await v.play();

      // Reset the eased orb state so the new source doesn't ghost
      easedRef.current = { r: 0, g: 0, b: 0, bri: 0 };
      lastSentRef.current = { r: -1, g: -1, b: -1, bri: -1 };
      bassHistoryRef.current = [];
      beatTimesRef.current = [];
      setLiveBpm(null);
    } catch {
      // User cancelled the picker — keep the existing capture running
    }
  }, [appState, tearDownAudio, setUpAudio, stopCapture]);

  // ── Start-button orchestration ──────────────────────────────────
  // First click of Start opens the requirements modal. Subsequent
  // clicks proceed straight to capture (or show the install modal if
  // the bridge isn't ready). The modals are gated by reqsCompleted.
  const proceedToCapture = useCallback(() => {
    if (demoMode) {
      startCapture();
      return;
    }
    if (appState === "idle" && bulbIp) {
      startCapture();
      return;
    }
    // Bridge isn't connected yet — open the install modal so the user
    // sees the curl one-liner. The polling inside InstallBridge will
    // call checkBridge once the bridge appears.
    setInstallOpen(true);
  }, [demoMode, appState, bulbIp, startCapture]);

  const handleStartClick = useCallback(() => {
    if (!reqsCompleted) {
      setReqsOpen(true);
      return;
    }
    proceedToCapture();
  }, [reqsCompleted, proceedToCapture]);

  const persistReqs = () => {
    try { localStorage.setItem("aura.requirements.seen", "1"); }
    catch { /* ignore */ }
    setReqsCompleted(true);
  };

  const handleReqsHaveBulb = useCallback(() => {
    persistReqs();
    setReqsOpen(false);
    setDemoMode(false);
    setPendingStart(true);
  }, []);

  const handleReqsNoBulb = useCallback(() => {
    persistReqs();
    setReqsOpen(false);
    setDemoMode(true);
    setPendingStart(true);
  }, []);

  const handleReqsClose = useCallback(() => {
    setReqsOpen(false);
  }, []);

  // When pendingStart is set, watch for the app to settle into a state
  // we can capture from, then trigger startCapture (or open the install
  // modal if the bridge can't be reached).
  useEffect(() => {
    if (!pendingStart) return;
    if (demoMode && appState === "idle") {
      setPendingStart(false);
      startCapture();
      return;
    }
    if (!demoMode && appState === "idle" && bulbIp) {
      setPendingStart(false);
      startCapture();
      return;
    }
    if (!demoMode && (appState === "no-bridge" || appState === "no-bulb")) {
      setPendingStart(false);
      setInstallOpen(true);
      return;
    }
  }, [pendingStart, demoMode, appState, bulbIp, startCapture]);

  useEffect(() => () => { stopCapture(); }, [stopCapture]);

  // ── Render ──────────────────────────────────────────────────────
  const accent = ACCENT_COLORS[appState];
  const isRunning = appState === "running";

  const statusPill = (() => {
    switch (appState) {
      case "idle":
        if (demoMode) {
          return (
            <StatusPill variant="violet">
              Demo mode · No bulb required
            </StatusPill>
          );
        }
        return <StatusPill variant="connected">Bulb connected · {bulbIp}</StatusPill>;
      case "checking":
        return <StatusPill variant="checking">Looking for the local bridge…</StatusPill>;
      case "no-bridge":
        return (
          <StatusPill variant="error" onClick={checkBridge}>
            Bridge not running · See setup below
          </StatusPill>
        );
      case "no-bulb":
        return (
          <StatusPill variant="warning" onClick={checkBridge}>
            Bridge running, no bulb found · Retry
          </StatusPill>
        );
      case "picking-tab":
        return <StatusPill variant="violet">Pick a Chrome tab in the browser dialog…</StatusPill>;
      case "running":
        return null;
      case "error":
        return (
          <StatusPill variant="error" onClick={checkBridge}>
            Bridge connection lost · Reconnecting…
          </StatusPill>
        );
    }
  })();

  const primaryAction = (() => {
    const baseStyle: React.CSSProperties = {
      fontFamily: "'Bebas Neue', sans-serif",
      letterSpacing: "0.12em",
      fontSize: 18,
      cursor: "pointer",
      transition: "all 0.15s",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      border: "none",
    };

    switch (appState) {
      case "idle":
      case "no-bridge":
      case "no-bulb":
        // Start is always enabled in non-running states. The handler
        // figures out the right next step (modal / install / capture).
        return (
          <button
            onClick={handleStartClick}
            aria-label="Start Aura — open the requirements flow"
            style={{
              ...baseStyle,
              background: accent,
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              padding: "14px 40px 12px",
              minHeight: 48,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
          >
            Start Aura →
          </button>
        );
      case "picking-tab":
        return (
          <button
            disabled
            aria-label="Waiting for the browser tab picker"
            style={{
              ...baseStyle,
              background: accent,
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              padding: "14px 40px 12px",
              minHeight: 48,
              opacity: 0.5,
              cursor: "wait",
            }}
          >
            Waiting for picker…
          </button>
        );
      case "checking":
        return (
          <button
            onClick={handleStartClick}
            aria-label="Start Aura — checking bridge status"
            style={{
              ...baseStyle,
              background: accent,
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              padding: "14px 40px 12px",
              minHeight: 48,
              opacity: 0.7,
            }}
          >
            Start Aura →
          </button>
        );
      case "running":
        return (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={switchTab}
              style={{
                ...baseStyle,
                background: "transparent",
                color: t.textMuted,
                padding: "10px 22px 9px",
                border: `1px solid ${t.borderStrong}`,
                fontSize: 14,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = t.text;
                el.style.borderColor = t.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = t.textMuted;
                el.style.borderColor = t.borderStrong;
              }}
            >
              ↻ Switch Tab
            </button>
            <button
              onClick={stopCapture}
              style={{
                ...baseStyle,
                background: "transparent",
                color: t.textMuted,
                padding: "10px 28px 9px",
                border: `1px solid ${t.borderStrong}`,
                fontSize: 15,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = t.text;
                el.style.borderColor = t.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = t.textMuted;
                el.style.borderColor = t.borderStrong;
              }}
            >
              ⏻ STOP
            </button>
          </div>
        );
      case "error":
        return (
          <button
            onClick={checkBridge}
            style={{
              ...baseStyle,
              background: "transparent",
              color: "#cc1800",
              padding: "12px 36px 10px",
              border: "1px solid rgba(204,24,0,0.4)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(204,24,0,0.8)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(204,24,0,0.4)"; }}
          >
            Retry Connection →
          </button>
        );
      default:
        return null;
    }
  })();

  // Real-value technical annotations (no fake X·720 Y·450)
  const annotationLeft = isRunning ? [
    `R · ${metrics.r}`,
    `G · ${metrics.g}`,
    `B · ${metrics.b}`,
  ] : [
    `BRIDGE · ${BRIDGE_URL.replace("http://", "")}`,
    `STATE · ${STATE_LABELS[appState].toUpperCase()}`,
    `Ø · ${appState === "checking" ? "···" : appState === "running" ? "● LIVE" : "○ IDLE"}`,
  ];
  const annotationRight = [
    "WIZ · UDP/38899",
    `IP · ${bulbIp ?? "—"}`,
    isRunning
      ? `BRI · ${metrics.bri}`
      : `BRIDGE · ${appState === "no-bridge" ? "OFFLINE" : "ONLINE"}`,
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: t.bg,
      color: t.text,
      fontFamily: "'Space Mono', monospace",
      position: "relative",
      overflowX: "hidden",
      transition: "background 0.45s ease, color 0.45s ease",
    }}>
      {/* Skip-to-content link for keyboard users — invisible until focused */}
      <a href="#main-content" className="aura-skip-link">Skip to content</a>

      {/* Hidden capture surfaces */}
      <video ref={videoRef} muted playsInline autoPlay style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        width={SAMPLE_SIZE}
        height={SAMPLE_SIZE}
        style={{ display: "none" }}
      />

      <GrainOverlay />
      <CropMarks />

      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}>
        <p style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "clamp(180px, 28vw, 420px)",
          letterSpacing: "-0.04em",
          color: "transparent",
          WebkitTextStroke: `1px ${accent}`,
          opacity: t.watermarkOpacity,
          userSelect: "none",
          lineHeight: 1,
          transition: "-webkit-text-stroke-color 1.4s ease, opacity 0.45s ease",
        }}>
          AURA
        </p>
      </div>

      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${t.scanlines} 3px, ${t.scanlines} 4px)`,
        pointerEvents: "none",
        zIndex: 1,
        transition: "background-image 0.45s ease",
      }} />

      <nav style={{
        position: "relative",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 36px",
        borderBottom: `1px solid ${t.border}`,
        transition: "border-color 0.45s ease",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            letterSpacing: "0.18em",
            color: t.text,
            transition: "color 0.45s ease",
          }}>AURA</span>
          <span style={{
            fontSize: 11,
            color: t.textGhost,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            transition: "color 0.45s ease",
          }}>v0.1.0</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
              transition: "background 0.6s, box-shadow 0.6s",
              animation: appState === "checking" || appState === "running"
                ? "pulse-dot 1.4s ease-in-out infinite"
                : "none",
            }} />
            <span style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              color: t.textSubtle,
              textTransform: "uppercase",
              transition: "color 0.45s ease",
            }}>{STATE_LABELS[appState]}</span>
          </div>

          <ThemeToggle />

          <a
            href="https://github.com/Pikel1997/aura"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: t.textSubtle,
              textDecoration: "none",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = t.textMuted; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = t.textSubtle; }}
          >Github ↗</a>
        </div>
      </nav>

      <main id="main-content" style={{
        position: "relative",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: isRunning ? 60 : 80,
        paddingBottom: 40,
        paddingLeft: 36,
        paddingRight: 36,
        minHeight: "calc(100vh - 66px - 64px)",
      }}>
        <div style={{
          position: "absolute",
          top: 20,
          left: 36,
          fontSize: 11,
          color: t.annotationColor,
          letterSpacing: "0.08em",
          lineHeight: 1.8,
          userSelect: "none",
          transition: "color 0.45s ease",
        }}>
          {annotationLeft.map((line) => <div key={line}>{line}</div>)}
        </div>

        <div style={{
          position: "absolute",
          top: 20,
          right: 36,
          fontSize: 11,
          color: t.annotationColor,
          letterSpacing: "0.08em",
          textAlign: "right",
          lineHeight: 1.8,
          userSelect: "none",
          transition: "color 0.45s ease",
        }}>
          {annotationRight.map((line) => <div key={line}>{line}</div>)}
        </div>

        <div style={{ position: "relative" }}>
          <Orb
            state={appState}
            liveColor={isRunning ? { r: metrics.r, g: metrics.g, b: metrics.b } : undefined}
            bpm={isRunning ? liveBpm : null}
          />
          <div style={{
            position: "absolute",
            top: "50%",
            right: "-64px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}>
            <div style={{ width: 48, height: 1, background: t.borderMid, transition: "background 0.45s ease" }} />
            <span style={{ fontSize: 11, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap", transition: "color 0.45s ease" }}>PHILIPS WIZ</span>
          </div>
          <div style={{
            position: "absolute",
            top: "50%",
            left: "-72px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transform: "translateY(-50%)",
            pointerEvents: "none",
            flexDirection: "row-reverse",
          }}>
            <div style={{ width: 48, height: 1, background: t.borderMid, transition: "background 0.45s ease" }} />
            <span style={{ fontSize: 11, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap", transition: "color 0.45s ease" }}>A19 · 800LM</span>
          </div>
        </div>

        <div style={{ height: 56 }} />

        {isRunning && (
          <>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <p style={{
                fontSize: 11,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: t.textSubtle,
                marginBottom: 8,
                transition: "color 0.45s ease",
              }}>Reacting to</p>
              <p style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 28,
                letterSpacing: "0.06em",
                color: t.text,
                maxWidth: 500,
                textAlign: "center",
                lineHeight: 1.1,
                transition: "color 0.45s ease",
              }}>{tabName ?? "Unknown source"}</p>
            </div>

            <div style={{
              width: 320,
              height: 1,
              background: t.borderMid,
              margin: "28px 0",
              transition: "background 0.45s ease",
            }} />

            {/* BPM badge — only when audio is shared and a beat lock-on
                has happened. The orb's pulse is also locked to this. */}
            {liveBpm && liveBpm > 60 && (
              <div
                aria-live="polite"
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 18,
                  padding: "8px 16px 6px",
                  border: `1px solid ${t.borderStrong}`,
                  background: t.surface,
                }}
              >
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22,
                  letterSpacing: "0.06em",
                  color: t.text,
                }}>
                  {Math.round(liveBpm)}
                </span>
                <span style={{
                  fontSize: 12,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: t.textSubtle,
                }}>
                  BPM
                </span>
              </div>
            )}

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 1,
              background: t.metricsBorder,
              marginBottom: 36,
              width: 460,
            }}>
              {[
                { label: "R", value: metrics.r },
                { label: "G", value: metrics.g },
                { label: "B", value: metrics.b },
                { label: "BRI", value: metrics.bri },
                { label: "LUM", value: metrics.lum },
                { label: "CHR", value: metrics.chr },
              ].map((m) => (
                <div key={m.label} style={{
                  background: t.metricsBg,
                  padding: "14px 0",
                  textAlign: "center",
                  transition: "background 0.45s ease",
                }}>
                  <p style={{
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: t.textSubtle,
                    marginBottom: 6,
                    transition: "color 0.45s ease",
                  }}>{m.label}</p>
                  <p style={{
                    fontSize: 14,
                    color: t.textMuted,
                    fontFamily: "'Space Mono', monospace",
                    letterSpacing: "0.02em",
                    transition: "color 0.45s ease",
                  }}>{m.value}</p>
                </div>
              ))}
            </div>

            {primaryAction}
          </>
        )}

        {!isRunning && (
          <>
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(72px, 10vw, 120px)",
              letterSpacing: "-0.02em",
              color: t.text,
              lineHeight: 0.9,
              marginBottom: 18,
              textAlign: "center",
              transition: "color 0.45s ease",
            }}>AURA</h1>

            <p style={{
              fontSize: 13,
              color: t.textSubtle,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 36,
              textAlign: "center",
              lineHeight: 1.7,
              transition: "color 0.45s ease",
            }}>
              {appState === "error"
                ? "Connection lost. Bridge dropped mid-session."
                : "Reactive lighting for your screen."}
            </p>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {statusPill}
              {primaryAction}
            </div>
          </>
        )}

        {/* Page is intentionally clean below the orb — instructions
            and install steps live in modals triggered by Start Aura. */}
      </main>

      <footer style={{
        position: "relative",
        zIndex: 5,
        borderTop: `1px solid ${t.border}`,
        padding: "20px 36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        transition: "border-color 0.45s ease",
        marginBottom: DEBUG ? 44 : 0,
      }}>
        <p style={{
          fontSize: 11,
          color: t.textGhost,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          transition: "color 0.45s ease",
        }}>Open source under MIT.</p>
        <p style={{
          fontSize: 11,
          color: t.annotationColor,
          letterSpacing: "0.08em",
          transition: "color 0.45s ease",
        }}>©{new Date().getFullYear()} · Aura</p>
      </footer>

      {/* Debug state switcher — only with ?debug in the URL */}
      {DEBUG && (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          display: "flex",
          borderTop: `1px solid ${t.switcherBorder}`,
          background: t.switcherBg,
          backdropFilter: "blur(10px)",
          transition: "background 0.45s ease, border-color 0.45s ease",
        }}>
          {(Object.keys(STATE_LABELS) as AppState[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setAppState(s)}
              style={{
                flex: 1,
                padding: "10px 4px 9px",
                background: appState === s ? ACCENT_COLORS[s] : "transparent",
                border: "none",
                borderRight: i < Object.keys(STATE_LABELS).length - 1
                  ? `1px solid ${t.switcherDivider}`
                  : "none",
                color: appState === s
                  ? (t.isDark ? "#0c0c0a" : "#ffffff")
                  : t.switcherInactive,
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              onMouseEnter={(e) => {
                if (appState !== s) (e.currentTarget as HTMLButtonElement).style.color = t.switcherHover;
              }}
              onMouseLeave={(e) => {
                if (appState !== s) (e.currentTarget as HTMLButtonElement).style.color = t.switcherInactive;
              }}
            >{STATE_LABELS[s]}</button>
          ))}
        </div>
      )}

      {/* Pre-flight requirements modal — opened on first Start click */}
      <RequirementsModal
        open={reqsOpen}
        onContinueWithBulb={handleReqsHaveBulb}
        onContinueWithoutBulb={handleReqsNoBulb}
        onClose={handleReqsClose}
      />

      {/* Install modal — opened when Start was clicked but the bridge
          isn't reachable. The InstallBridge component does its own
          /health polling and calls checkBridge once it sees the bridge,
          which advances the state and lets the user click Start again. */}
      {installOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install Aura bridge"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: t.isDark ? "rgba(8,8,6,0.92)" : "rgba(220,216,208,0.92)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "48px 24px",
            overflowY: "auto",
            animation: "aura-fade-in 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onClick={() => setInstallOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 720,
              background: t.bg,
              border: `1px solid ${t.borderStrong}`,
              padding: "28px 32px 32px",
              boxShadow: t.isDark
                ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)"
                : "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
              position: "relative",
            }}
          >
            <button
              onClick={() => setInstallOpen(false)}
              aria-label="Close install dialog"
              style={{
                position: "absolute",
                top: 16,
                right: 20,
                background: "transparent",
                border: "none",
                color: t.textGhost,
                cursor: "pointer",
                fontSize: 18,
                padding: 6,
                lineHeight: 1,
                fontFamily: "inherit",
                minHeight: 32,
                minWidth: 32,
              }}
            >
              ✕
            </button>
            <InstallBridge
              appState={appState}
              onBridgeOnline={() => {
                checkBridge();
                // The pendingStart effect will pick up the new "idle"
                // state and trigger startCapture automatically.
                setPendingStart(true);
                setInstallOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes aura-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n));
}

// ── Root ─────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(true);
  return (
    <ThemeProvider isDark={isDark} toggle={() => setIsDark((d) => !d)}>
      <AuraApp />
    </ThemeProvider>
  );
}
