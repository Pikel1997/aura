import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeContext";

/**
 * Compact waveform widget — fixed to the bottom-left corner while
 * running + audio is shared. Industrial/technical look: thin vertical
 * frequency bars on a subtle background, matching the Aura annotation
 * style. Reads directly from the shared FFT Uint8Array ref on every
 * rAF — zero React re-renders.
 */
export function WaveformWidget({
  fftRef,
  color,
}: {
  fftRef: React.RefObject<Uint8Array | null>;
  color: { r: number; g: number; b: number };
}) {
  const { t } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  const W = 160;
  const H = 48;
  const BARS = 48;
  const BIN_OFFSET = 4;
  const GAP = 1;
  const BAR_W = Math.floor((W - GAP * (BARS - 1)) / BARS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const fft = fftRef.current;
      if (!fft) return;

      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < BARS; i++) {
        const bin = BIN_OFFSET + Math.floor((i / BARS) * (fft.length / 3));
        const val = (fft[bin] ?? 0) / 255;
        const barH = Math.max(1, val * (H - 4));
        const x = i * (BAR_W + GAP);
        const y = H - barH;
        const alpha = 0.25 + val * 0.6;

        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.fillRect(x, y, BAR_W, barH);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftRef, color, BAR_W, GAP]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "clamp(60px, 6vh, 90px)",
        left: "clamp(20px, 3vw, 40px)",
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: t.textSubtle,
          userSelect: "none",
        }}
      >
        Audio
      </span>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          width: W,
          height: H,
          border: `1px solid ${t.borderStrong}`,
          background: t.isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.06)",
        }}
      />
    </div>
  );
}
