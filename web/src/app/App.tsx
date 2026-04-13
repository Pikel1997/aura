import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { Orb } from "./components/Orb";
import { StatusPill } from "./components/StatusPill";
import { InstallBridge } from "./components/InstallBridge";
import { RequirementsModal } from "./components/RequirementsModal";
import { WaveformWidget } from "./components/WaveformWidget";
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

// Track window dimensions so we can drive the orb size, metric grid
// columns, mobile detection, and "fit in one viewport" sizing from React.
// Constraining by min(vw, vh) is what makes the page fit on any screen
// without scrolling.
function useViewport() {
  const [size, setSize] = useState(() => ({
    vw: typeof window !== "undefined" ? window.innerWidth : 1440,
    vh: typeof window !== "undefined" ? window.innerHeight : 900,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setSize({
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

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
  if (surface === "browser") return "Screen capture";
  if (surface === "window") return "Application window";
  if (surface === "monitor") return "Entire screen";
  return "Screen capture";
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
  // Whether the captured stream actually has an audio track. We surface
  // this in the BPM badge so users know whether they need to redo the
  // capture with "Share tab audio" ticked.
  const [audioShared, setAudioShared] = useState(false);

  // Demo mode: skip the bridge entirely and run the orb visualization
  // for users who don't have a Philips WiZ bulb yet (or just want to
  // see what it does). Toggled by the RequirementsModal.
  const [demoMode, setDemoMode] = useState(false);

  // Pre-flight modal flow — controlled by parent (App). Both modals
  // are dismissible and only show when the user takes an action.
  // The yes/no question shows on every Start click — there's no
  // "remember my answer" persistence, because answering takes one
  // tap and is the central flow.
  const [reqsOpen, setReqsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  // When set, the next time the bridge bootstrap settles into a usable
  // state, automatically start a capture. This is how "click Start →
  // pick option in modal → capture begins" flows without race conditions.
  const [pendingStart, setPendingStart] = useState(false);

  // ── Responsive sizing ──────────────────────────────────────────
  const { vw, vh } = useViewport();
  const isMobile = vw < 720;
  const isCompact = vw < 1024;

  // Orb scales with viewport so it grows on big monitors AND fits on
  // short ones. Constrained by both width and height — whichever is
  // smaller wins, so the layout never overflows the viewport.
  // Idle state has more headroom (no metric grid below), running has
  // less (BPM badge + grid + buttons take ~280px under the orb).
  const orbIdleSize = Math.round(
    Math.min(Math.max(Math.min(vw * 0.24, vh * 0.45), 200), 480)
  );
  const orbRunningSize = Math.round(
    Math.min(Math.max(Math.min(vw * 0.26, vh * 0.36), 220), 520)
  );

  // Metric grid: 6 columns on desktop, 3 columns × 2 rows on mobile
  const metricColumns = isMobile ? 3 : 6;
  const metricGridWidth = Math.round(
    Math.min(Math.max(vw * 0.40, 320), 680)
  );

  // Mobile-only: clicking Start shows a one-line "use desktop" message
  // instead of opening the requirements modal. The message persists
  // until the user resizes the window or reloads.

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
  // Pre-created AudioContext from the Start click gesture. Stored in a
  // ref so it survives the async modal → bridge → useEffect chain.
  const preAudioCtxRef = useRef<AudioContext | null>(null);

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
    setAudioShared(false);
  }, []);

  // Accept a pre-created AudioContext so it stays in the user-gesture
  // context (Chrome blocks AudioContext creation outside gestures).
  const setUpAudio = useCallback((stream: MediaStream, preCtx?: AudioContext) => {
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      setAudioShared(false);
      return;
    }
    setAudioShared(true);
    try {
      const ctx = preCtx ?? new (window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      ctx.resume().catch(() => { /* ignore */ });
      const source = ctx.createMediaStreamSource(new MediaStream(tracks));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      audioFftRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      setAudioShared(false);
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
  // Pump FFT data into audioFftRef so the WaveformWidget can read it.
  // No beat detection — just a raw getByteFrequencyData call per tick.
  const pumpFft = useCallback(() => {
    const analyser = analyserRef.current;
    const fft = audioFftRef.current;
    if (!analyser || !fft) return;
    analyser.getByteFrequencyData(fft);
  }, []);

  const startTicking = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      pumpFft();

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
  }, [stopCapture, pumpFft]);

  const startCapture = useCallback(async () => {
    if (appState !== "idle") return;
    setAppState("picking-tab");

    // Consume the pre-created AudioContext from handleStartClick. It
    // was created in the user gesture and stored in a ref so it
    // survives the async chain.
    const preCtx = preAudioCtxRef.current ?? undefined;
    preAudioCtxRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTabName(friendlyTabName(track));

      // Wire up the pre-created AudioContext with the stream's audio
      // track. Audio data takes 2-3s to start flowing after capture
      // begins — the beat detection loop tolerates this automatically.
      setUpAudio(stream, preCtx);

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

  // Demo mode — random cycling colors, no screen capture, no bridge.
  // Works on mobile and for users without a bulb.
  const startDemo = useCallback(() => {
    setAppState("running");
    setTabName("Demo");

    let tgtR = Math.random() * 255;
    let tgtG = Math.random() * 255;
    let tgtB = Math.random() * 255;
    let curR = tgtR, curG = tgtG, curB = tgtB;
    let tick = 0;

    tickRef.current = window.setInterval(() => {
      tick++;
      // New target color every ~2.5s (75 ticks at 33ms)
      if (tick % 75 === 0) {
        tgtR = Math.random() * 255;
        tgtG = Math.random() * 255;
        tgtB = Math.random() * 255;
      }
      // Ease toward target
      curR += (tgtR - curR) * 0.06;
      curG += (tgtG - curG) * 0.06;
      curB += (tgtB - curB) * 0.06;

      const r = Math.round(curR);
      const g = Math.round(curG);
      const b = Math.round(curB);
      const bri = Math.round((r + g + b) / 3);

      setMetrics({ r, g, b, bri, lum: +(bri / 255).toFixed(2), chr: 0.5 });
    }, 33); // ~30fps
  }, []);

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
    if (isMobile) {
      // Mobile can't do screen capture — go straight to demo mode
      // with random cycling colors. No modal, no picker.
      setDemoMode(true);
      startDemo();
      return;
    }
    ensureAudioCtx();

    if (appState === "idle" && bulbIp) {
      proceedToCapture();
      return;
    }
    setReqsOpen(true);
  }, [isMobile, appState, bulbIp, proceedToCapture]);

  // Helper: ensure AudioContext exists in the current gesture. Called
  // from every click handler in the flow so at least one survives.
  const ensureAudioCtx = () => {
    try {
      if (!preAudioCtxRef.current || preAudioCtxRef.current.state === "closed") {
        const Ctx = window.AudioContext
          || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        preAudioCtxRef.current = new Ctx();
      }
      if (preAudioCtxRef.current.state === "suspended") {
        preAudioCtxRef.current.resume().catch(() => {});
      }
    } catch { /* ignore */ }
  };

  const handleReqsHaveBulb = useCallback(() => {
    ensureAudioCtx();
    setReqsOpen(false);
    setDemoMode(false);
    setPendingStart(true);
  }, []);

  const handleReqsNoBulb = useCallback(() => {
    ensureAudioCtx();
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
      startDemo();
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
          <div style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexDirection: isMobile ? "column" : "row",
            width: isMobile ? "100%" : "auto",
            maxWidth: isMobile ? 320 : "none",
          }}>
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
              background: "rgba(160,20,10,0.85)",
              color: "#ffffff",
              padding: "14px 40px 12px",
              minHeight: 48,
              border: "none",
              boxShadow: "0 2px 12px rgba(180,20,10,0.35)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
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
          fontSize: "clamp(140px, 32vw, 720px)",
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
        padding: "clamp(14px, 1.6vw, 28px) clamp(20px, 3vw, 56px)",
        borderBottom: `1px solid ${t.border}`,
        transition: "border-color 0.45s ease",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(18px, 1.6vw, 28px)",
            letterSpacing: "0.18em",
            color: t.text,
            transition: "color 0.45s ease",
          }}>AURA</span>
          {!isMobile && (
            <span style={{
              fontSize: 11,
              color: t.textGhost,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              transition: "color 0.45s ease",
            }}>v0.1.0</span>
          )}
        </div>

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 14 : 22,
        }}>
          {!isMobile && (
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
          )}

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
        // Vertically centred fit-in-viewport layout. The dynamic
        // viewport unit (dvh) handles iOS Safari's collapsing chrome.
        // Subtract approximate nav + footer heights so we never overflow.
        justifyContent: "center",
        height: "calc(100dvh - 120px)",
        paddingTop: "clamp(20px, 2vw, 48px)",
        paddingBottom: "clamp(20px, 2vw, 48px)",
        paddingLeft: "clamp(20px, 3vw, 80px)",
        paddingRight: "clamp(20px, 3vw, 80px)",
      }}>
        {/* Technical annotations — only on screens wide enough that
            they don't crowd the orb. Hidden on mobile / small tablets. */}
        {!isCompact && (
          <>
            <div style={{
              position: "absolute",
              top: 20,
              left: "clamp(20px, 3vw, 80px)",
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
              right: "clamp(20px, 3vw, 80px)",
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
          </>
        )}

        <div style={{ position: "relative" }}>
          <Orb
            state={appState}
            liveColor={isRunning ? { r: metrics.r, g: metrics.g, b: metrics.b } : undefined}
            size={isRunning ? orbRunningSize : orbIdleSize}
          />
          {/* Orb callout annotations — brand + bulb IP */}
          {!isCompact && (
            <>
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
                <div style={{ width: 48, height: 1, background: t.borderMid }} />
                <span style={{ fontSize: 11, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap" }}>PHILIPS WIZ</span>
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
                <div style={{ width: 48, height: 1, background: t.borderMid }} />
                <span style={{ fontSize: 11, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
                  {demoMode ? "DEMO" : "E27 · 806LM"}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={{ height: "clamp(28px, 3vh, 56px)" }} />

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
              margin: "clamp(14px, 2vh, 28px) 0",
              transition: "background 0.45s ease",
            }} />


            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${metricColumns}, 1fr)`,
              gap: 1,
              background: t.metricsBorder,
              marginBottom: "clamp(20px, 2.5vh, 36px)",
              width: metricGridWidth,
              maxWidth: "100%",
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
              // Constrain by both vw and vh so the title can't dominate
              // shorter screens. min(12vw, 18vh) → 240 cap.
              fontSize: "min(12vw, 18vh, 240px)",
              letterSpacing: "-0.02em",
              color: t.text,
              lineHeight: 0.9,
              marginBottom: "clamp(10px, 1.6vh, 18px)",
              marginTop: 0,
              textAlign: "center",
              transition: "color 0.45s ease",
            }}>AURA</h1>

            <p style={{
              fontSize: 13,
              color: t.textSubtle,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: "clamp(20px, 3vh, 36px)",
              textAlign: "center",
              lineHeight: 1.7,
              transition: "color 0.45s ease",
            }}>
              {appState === "error"
                ? "Connection lost. Bridge dropped mid-session."
                : "Reactive lighting for your screen."}
            </p>

            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "clamp(12px, 1.6vh, 20px)",
            }}>
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
        padding: "clamp(14px, 1.6vw, 28px) clamp(20px, 3vw, 56px)",
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

      {/* Compact waveform widget — bottom-left corner, running + audio only */}
      {isRunning && audioShared && (
        <WaveformWidget
          fftRef={audioFftRef}
          color={{ r: metrics.r, g: metrics.g, b: metrics.b }}
        />
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
