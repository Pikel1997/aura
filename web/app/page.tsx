"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Github,
  Power,
  Radio,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { Aurora } from "@/components/Aurora";
import { BulbOrb } from "@/components/BulbOrb";
import { extractAuraColor, lumToBrightness } from "@/lib/colors";
import { ping, discover, connect, setColor, turnOff } from "@/lib/bridge";

type BridgeState =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "no_bulb" }
  | { kind: "ready"; ip: string };

type RunState = "idle" | "picking" | "running";

const SAMPLE_SIZE = 96;
const TICK_MS = 100; // 10 Hz — matches the bulb's hardware tick
const SCENE_CUT_DELTA = 90;

function rgbHex(r: number, g: number, b: number) {
  return `rgb(${r}, ${g}, ${b})`;
}

export default function HomePage() {
  // ── State ──────────────────────────────────────────────────────────
  const [bridge, setBridge] = useState<BridgeState>({ kind: "checking" });
  const [run, setRun] = useState<RunState>("idle");
  const [color, setColorState] = useState({ r: 30, g: 20, b: 80 });
  const [bri, setBri] = useState(160);
  const [chroma, setChroma] = useState(0);
  const [lum, setLum] = useState(0);
  const [tabName, setTabName] = useState<string>("your tab");

  // ── Refs ───────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const lastSentRef = useRef({ r: -1, g: -1, b: -1, bri: -1 });
  const easedRef = useRef({ r: 30, g: 20, b: 80, bri: 160 });

  // ── Bridge bootstrap ──────────────────────────────────────────────
  const checkBridge = useCallback(async () => {
    setBridge({ kind: "checking" });
    try {
      const status = await ping();
      if (status.connected && status.ip) {
        setBridge({ kind: "ready", ip: status.ip });
        return;
      }
      // Try discovery
      const bulbs = await discover();
      if (!bulbs.length) {
        setBridge({ kind: "no_bulb" });
        return;
      }
      const ok = await connect(bulbs[0].ip);
      if (ok) setBridge({ kind: "ready", ip: bulbs[0].ip });
      else setBridge({ kind: "no_bulb" });
    } catch {
      setBridge({ kind: "missing" });
    }
  }, []);

  useEffect(() => {
    checkBridge();
  }, [checkBridge]);

  // ── Tab capture ───────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    setRun("picking");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: false,
        // Chrome-only hints — let the user pick a tab from the picker
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      setTabName(track.label || "your tab");

      // Auto-stop when the user clicks "Stop sharing" in Chrome's bar
      track.addEventListener("ended", () => {
        stopCapture();
      });

      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();

      setRun("running");
      startTicking();
    } catch {
      setRun("idle");
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setRun("idle");
    setBri(0);
    turnOff().catch(() => {});
  }, []);

  // ── Frame → color → bulb ──────────────────────────────────────────
  const startTicking = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.videoWidth === 0) return;

      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Letterboxed cover-fit downsize: shrink to SAMPLE_SIZE × SAMPLE_SIZE
      ctx.drawImage(v, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const img = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

      const result = extractAuraColor(img);
      const targetBri = lumToBrightness(result.lum);

      // Eased animator (matches the Python BulbController logic)
      const cur = easedRef.current;
      const dr = result.r - cur.r;
      const dg = result.g - cur.g;
      const db = result.b - cur.b;
      const dbri = targetBri - cur.bri;

      const delta = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
      const eColor = delta > SCENE_CUT_DELTA ? 1 : 0.65;
      const eBri = delta > SCENE_CUT_DELTA ? 1 : 0.8;

      cur.r += dr * eColor;
      cur.g += dg * eColor;
      cur.b += db * eColor;
      cur.bri += dbri * eBri;

      const send = {
        r: Math.max(0, Math.min(255, Math.round(cur.r))),
        g: Math.max(0, Math.min(255, Math.round(cur.g))),
        b: Math.max(0, Math.min(255, Math.round(cur.b))),
        bri: Math.max(0, Math.min(255, Math.round(cur.bri))),
      };

      // Update UI immediately
      setColorState({ r: send.r, g: send.g, b: send.b });
      setBri(send.bri);
      setChroma(result.chroma);
      setLum(result.lum);

      // Skip identical frames to spare the bridge
      const last = lastSentRef.current;
      const moved =
        Math.abs(send.r - last.r) +
          Math.abs(send.g - last.g) +
          Math.abs(send.b - last.b) >
          3 || Math.abs(send.bri - last.bri) > 3;
      if (moved) {
        lastSentRef.current = send;
        setColor(send.r, send.g, send.b, send.bri).catch(() => {
          // Bridge dropped — bounce back to idle
          stopCapture();
          setBridge({ kind: "missing" });
        });
      }
    }, TICK_MS);
  }, [stopCapture]);

  useEffect(() => () => stopCapture(), [stopCapture]);

  const activeRgb = rgbHex(color.r, color.g, color.b);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen overflow-hidden">
      <Aurora activeColor={activeRgb} />

      {/* Hidden capture surfaces */}
      <video
        ref={videoRef}
        className="hidden"
        muted
        playsInline
        autoPlay
      />
      <canvas
        ref={canvasRef}
        width={SAMPLE_SIZE}
        height={SAMPLE_SIZE}
        className="hidden"
      />

      {/* Top nav */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-text/80" />
          <span className="text-base font-semibold tracking-tight">
            Aura
          </span>
        </div>
        <a
          href="https://github.com/Pikel1997/aura"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-muted transition hover:border-white/20 hover:text-text"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
      </nav>

      <AnimatePresence mode="wait">
        {run !== "running" ? (
          <motion.section
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 mx-auto max-w-4xl px-6 pb-32 pt-16 text-center sm:pt-24"
          >
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-muted backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Real-time, frame by frame
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-auto max-w-3xl text-balance bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-5xl font-bold leading-[1.05] tracking-tight text-transparent sm:text-7xl"
            >
              Your screen,
              <br />
              <span className="bg-gradient-to-br from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                in your room.
              </span>
            </motion.h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mx-auto mt-6 max-w-xl text-balance text-lg text-muted sm:text-xl"
            >
              Aura turns your Philips WiZ smart bulb into ambient
              lighting that follows whatever&apos;s playing in any
              Chrome tab. Pick a tab. That&apos;s it.
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26 }}
              className="mt-10 flex flex-col items-center gap-4"
            >
              <BridgeBadge state={bridge} onRetry={checkBridge} />

              <button
                onClick={startCapture}
                disabled={bridge.kind !== "ready"}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_0_60px_rgba(255,255,255,0.15)] transition disabled:cursor-not-allowed disabled:opacity-40 hover:shadow-[0_0_80px_rgba(255,255,255,0.3)]"
              >
                <span className="relative">Start Aura</span>
                <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <p className="text-xs text-subtle">
                Works in Chrome, Edge, and Arc. Tab capture only —
                nothing leaves your machine.
              </p>
            </motion.div>

            {/* Feature cards */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-24 grid gap-4 sm:grid-cols-3"
            >
              <FeatureCard
                icon={<Zap className="h-5 w-5" />}
                title="140 ms latency"
                body="Edge-ring sampling, chroma-weighted blending, eased on the bulb's exact hardware tick rate."
              />
              <FeatureCard
                icon={<Radio className="h-5 w-5" />}
                title="Local-only"
                body="Your screen never leaves the browser. The bulb is reached over your LAN by a tiny Python bridge you run locally."
              />
              <FeatureCard
                icon={<Sparkles className="h-5 w-5" />}
                title="Made for movies"
                body="Hard cuts feel instant. Gradients glide. Skin tones don't poison the average. White scenes stay white."
              />
            </motion.div>

            {/* Setup section */}
            <SetupSection />
          </motion.section>
        ) : (
          <motion.section
            key="running"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-12"
          >
            <BulbOrb color={color} brightness={bri} />

            <div className="mt-12 w-full max-w-md space-y-4">
              <div className="text-center text-xs uppercase tracking-[0.2em] text-subtle">
                Reacting to
              </div>
              <div className="text-center text-base font-medium text-text/90">
                {tabName}
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3">
                <Metric label="R" value={color.r} accent />
                <Metric label="G" value={color.g} accent />
                <Metric label="B" value={color.b} accent />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Metric label="BRI" value={`${Math.round((bri / 255) * 100)}%`} />
                <Metric label="LUM" value={`${Math.round(lum * 100)}%`} />
                <Metric label="CHR" value={`${Math.round(chroma * 100)}%`} />
              </div>

              <button
                onClick={stopCapture}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-text transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <Power className="h-4 w-4" />
                Stop
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <footer className="relative z-10 border-t border-white/[0.04] py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-xs text-subtle">
          <span>Open source under MIT.</span>
          <span>Built for Philips WiZ smart bulbs.</span>
        </div>
      </footer>
    </main>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="glass rounded-2xl p-6 text-left">
      <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-text/80">
        {icon}
      </div>
      <div className="text-sm font-semibold text-text">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`glass flex flex-col items-center rounded-xl px-3 py-3 ${
        accent ? "" : ""
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-widest text-subtle">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm tabular-nums text-text">
        {value}
      </div>
    </div>
  );
}

function BridgeBadge({
  state,
  onRetry,
}: {
  state: BridgeState;
  onRetry: () => void;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur-md";
  if (state.kind === "checking") {
    return (
      <div
        className={`${base} border-white/10 bg-white/[0.03] text-muted`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Looking for the local bridge…
      </div>
    );
  }
  if (state.kind === "ready") {
    return (
      <div
        className={`${base} border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Bulb connected · {state.ip}
      </div>
    );
  }
  if (state.kind === "no_bulb") {
    return (
      <button
        onClick={onRetry}
        className={`${base} border-amber-400/20 bg-amber-400/[0.06] text-amber-300 hover:border-amber-400/40`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Bridge running, no bulb found · Retry
      </button>
    );
  }
  return (
    <button
      onClick={onRetry}
      className={`${base} border-rose-400/20 bg-rose-400/[0.06] text-rose-300 hover:border-rose-400/40`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
      Bridge not running · See setup below
    </button>
  );
}

function SetupSection() {
  return (
    <div className="mx-auto mt-32 max-w-3xl text-left">
      <div className="mb-2 text-center text-xs uppercase tracking-[0.2em] text-subtle">
        One-time setup
      </div>
      <h2 className="text-center text-3xl font-bold tracking-tight">
        Run the local bridge
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
        WiZ bulbs only speak to your local network. A 80-line Python
        script forwards commands from this page to your bulb. You only
        need to run it once per session.
      </p>

      <div className="glass mt-10 rounded-2xl p-6">
        <Step
          n={1}
          title="Clone the repo"
          code="git clone https://github.com/Pikel1997/aura.git && cd aura"
        />
        <Step
          n={2}
          title="Install dependencies"
          code="python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
        />
        <Step
          n={3}
          title="Start the bridge"
          code="python bridge.py"
          last
        />
      </div>

      <p className="mt-6 text-center text-xs text-subtle">
        The bridge auto-discovers your bulb on startup. Keep it running,
        come back to this page, and click <em>Start Aura</em>.
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  code,
  last = false,
}: {
  n: number;
  title: string;
  code: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-4 ${last ? "" : "mb-5"}`}>
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-text/80">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text">{title}</div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-xs text-text/80">
          <Terminal className="h-3.5 w-3.5 flex-shrink-0 text-subtle" />
          <code className="overflow-x-auto whitespace-nowrap">{code}</code>
        </div>
      </div>
    </div>
  );
}
