import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { Orb } from "./components/Orb";
import { StatusPill } from "./components/StatusPill";
import { InstallBridge } from "./components/InstallBridge";
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
        fontSize: 9,
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const easedRef = useRef({ r: 0, g: 0, b: 0, bri: 0 });
  const lastSentRef = useRef({ r: -1, g: -1, b: -1, bri: -1 });

  // ── Bridge bootstrap ────────────────────────────────────────────
  const checkBridge = useCallback(async () => {
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

  useEffect(() => {
    checkBridge();
  }, [checkBridge]);

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
    setTabName(null);
    setMetrics({ r: 0, g: 0, b: 0, bri: 0, lum: 0, chr: 0 });
    easedRef.current = { r: 0, g: 0, b: 0, bri: 0 };
    lastSentRef.current = { r: -1, g: -1, b: -1, bri: -1 };
    try {
      await turnBulbOff();
    } catch {
      /* ignore */
    }
    setAppState((s) => (s === "running" || s === "picking-tab" ? "idle" : s));
  }, []);

  const startTicking = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
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
      if (moved) {
        lastSentRef.current = send;
        setBulbColor(send.r, send.g, send.b, send.bri).catch(() => {
          stopCapture();
          setAppState("error");
        });
      }
    }, TICK_MS);
  }, [stopCapture]);

  const startCapture = useCallback(async () => {
    if (appState !== "idle") return;
    setAppState("picking-tab");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTabName(friendlyTabName(track));

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
  }, [appState, startTicking, stopCapture]);

  useEffect(() => () => { stopCapture(); }, [stopCapture]);

  // ── Render ──────────────────────────────────────────────────────
  const accent = ACCENT_COLORS[appState];
  const isRunning = appState === "running";

  const statusPill = (() => {
    switch (appState) {
      case "idle":
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
        return (
          <button
            onClick={startCapture}
            style={{
              ...baseStyle,
              background: accent,
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              padding: "12px 36px 10px",
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
            style={{
              ...baseStyle,
              background: accent,
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              padding: "12px 36px 10px",
              opacity: 0.5,
              cursor: "wait",
            }}
          >
            Waiting for picker…
          </button>
        );
      case "no-bridge":
      case "no-bulb":
      case "checking":
        return (
          <button
            disabled
            style={{
              ...baseStyle,
              background: "transparent",
              color: t.disabledText,
              padding: "12px 36px 10px",
              border: `1px solid ${t.disabledBorder}`,
              cursor: "not-allowed",
            }}
          >
            Start Aura →
          </button>
        );
      case "running":
        return (
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
            fontSize: 9,
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
              fontSize: 9,
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
              fontSize: 10,
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

      <main style={{
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
          fontSize: 9,
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
          fontSize: 9,
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
            <span style={{ fontSize: 8, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap", transition: "color 0.45s ease" }}>PHILIPS WIZ</span>
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
            <span style={{ fontSize: 8, color: t.annotationColor, letterSpacing: "0.12em", whiteSpace: "nowrap", transition: "color 0.45s ease" }}>A19 · 800LM</span>
          </div>
        </div>

        <div style={{ height: 56 }} />

        {isRunning && (
          <>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <p style={{
                fontSize: 9,
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

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 1,
              background: t.metricsBorder,
              marginBottom: 36,
              width: 440,
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
                    fontSize: 8,
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
              fontSize: 12,
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

        {/* Single source of truth for setup info — always visible
            below the orb (except in "running" mode, which we hide
            so the live experience isn't cluttered). The component
            only auto-polls /health when the bridge is actually
            missing, otherwise it's purely informational so users
            can copy the install command to set up another device. */}
        {!isRunning && (
          <div style={{ width: "100%", maxWidth: 860, marginTop: 80 }}>
            <InstallBridge appState={appState} onBridgeOnline={checkBridge} />
          </div>
        )}
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
          fontSize: 9,
          color: t.textGhost,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          transition: "color 0.45s ease",
        }}>Open source under MIT.</p>
        <p style={{
          fontSize: 9,
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
                fontSize: 8,
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

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
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
