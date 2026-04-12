import { useEffect, useRef } from "react";

/**
 * Dithered frequency ring behind the orb. Three concentric dot layers:
 *   inner  — bass (bins 4-20), bigger dots, less scatter
 *   mid    — mids (bins 20-60), medium dots
 *   outer  — highs (bins 60-120), tiny dots, most scatter
 *
 * Each dot's radial distance from center is modulated by its nearest
 * FFT bin. All dots drawn in the live color — no new hues.
 *
 * Reads from a shared Uint8Array ref on every rAF — zero React state
 * updates, zero re-renders.
 */
export function WaveformRing({
  fftRef,
  color,
  size,
}: {
  fftRef: React.RefObject<Uint8Array | null>;
  color: { r: number; g: number; b: number };
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const TWO_PI = Math.PI * 2;

    // Seeded pseudo-random for consistent dot positions (no flicker).
    // Each dot gets a deterministic jitter based on its index.
    const seed = (i: number, k: number) =>
      ((i * 7919 + k * 6971) % 1000) / 1000;

    // Layer definitions — inner (bass), mid, outer (highs)
    const layers = [
      { dots: 90,  binLo: 4,  binHi: 20,  baseR: 0.53, maxMod: 0.18, dotMin: 1.8, dotMax: 3.5, jitterR: 6,  jitterA: 0.018, alphaBase: 0.15, alphaMod: 0.65 },
      { dots: 130, binLo: 20, binHi: 60,  baseR: 0.62, maxMod: 0.14, dotMin: 1.2, dotMax: 2.5, jitterR: 8,  jitterA: 0.024, alphaBase: 0.10, alphaMod: 0.55 },
      { dots: 180, binLo: 60, binHi: 120, baseR: 0.72, maxMod: 0.10, dotMin: 0.8, dotMax: 1.8, jitterR: 12, jitterA: 0.035, alphaBase: 0.08, alphaMod: 0.45 },
    ];

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const fft = fftRef.current;
      if (!fft) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      for (const layer of layers) {
        const binRange = layer.binHi - layer.binLo;

        for (let i = 0; i < layer.dots; i++) {
          const angle = (i / layer.dots) * TWO_PI;

          // Map dot index to FFT bin
          const bin = layer.binLo + Math.floor((i / layer.dots) * binRange);
          const val = Math.min(1, (fft[bin] ?? 0) / 255);
          if (val < 0.03) continue; // skip dead-silent dots

          // Deterministic jitter — consistent across frames, no flicker
          const jR = (seed(i, 0) - 0.5) * layer.jitterR;
          const jA = (seed(i, 1) - 0.5) * layer.jitterA;

          // Radial distance = base + audio modulation + jitter
          const r = (layer.baseR + val * layer.maxMod) * size + jR;
          const a = angle + jA;

          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;

          const dotR = layer.dotMin + val * (layer.dotMax - layer.dotMin);
          const alpha = layer.alphaBase + val * layer.alphaMod;

          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, TWO_PI);
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
          ctx.fill();
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftRef, color, size]);

  const canvasSize = Math.round(size * 2);

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
        opacity: 0.9,
      }}
    />
  );
}
