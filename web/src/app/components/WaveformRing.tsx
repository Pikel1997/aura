import { useEffect, useRef } from "react";

/**
 * Radial frequency bar ring rendered behind the orb when audio is
 * shared. Reads from a shared Uint8Array ref (the FFT data from the
 * AnalyserNode) on every animation frame — no React state updates, no
 * re-renders, just a canvas draw loop.
 *
 * All bars are drawn in the live color so no new hues are introduced.
 */
export function WaveformRing({
  fftRef,
  color,
  size,
}: {
  /** Ref to the Uint8Array from AnalyserNode.getByteFrequencyData(). */
  fftRef: React.RefObject<Uint8Array | null>;
  /** Live RGB for bar color. */
  color: { r: number; g: number; b: number };
  /** Diameter of the ring (should match or slightly exceed the orb size). */
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BARS = 64;
    const TWO_PI = Math.PI * 2;
    // Skip the first ~4 bins (sub-bass rumble that doesn't look nice)
    const BIN_OFFSET = 4;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const fft = fftRef.current;
      if (!fft) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const innerR = size * 0.52; // start just outside the orb sphere
      const maxBarH = size * 0.28;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < BARS; i++) {
        const bin = BIN_OFFSET + Math.floor((i / BARS) * (fft.length / 2));
        const val = (fft[bin] ?? 0) / 255;
        if (val < 0.05) continue; // skip silent bars

        const angle = (i / BARS) * TWO_PI - Math.PI / 2;
        const barH = val * maxBarH;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + barH);
        const y2 = cy + Math.sin(angle) * (innerR + barH);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.25 + val * 0.55})`;
        ctx.lineWidth = Math.max(2, (TWO_PI * innerR) / BARS * 0.45);
        ctx.lineCap = "round";
        ctx.stroke();
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftRef, color, size]);

  const canvasSize = Math.round(size * 1.7);

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        opacity: 0.85,
      }}
    />
  );
}
