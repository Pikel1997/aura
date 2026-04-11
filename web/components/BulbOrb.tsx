"use client";

import { motion } from "framer-motion";

/**
 * The big glowing orb that visualizes the current detected color in
 * real time. Two layered radial gradients give it depth, plus a soft
 * outer glow that bleeds onto the surrounding page.
 */
export function BulbOrb({
  color,
  brightness,
  size = 280,
}: {
  color: { r: number; g: number; b: number };
  brightness: number; // 0..255
  size?: number;
}) {
  const hex = `#${color.r.toString(16).padStart(2, "0")}${color.g
    .toString(16)
    .padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
  const rgba = (a: number) =>
    `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;

  const intensity = Math.max(0.15, brightness / 255);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${rgba(intensity * 0.9)} 0%, transparent 70%)`,
          transform: "scale(1.6)",
        }}
        animate={{ opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Mid glow */}
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle, ${rgba(intensity * 0.7)} 0%, transparent 65%)`,
          transform: "scale(1.2)",
        }}
      />

      {/* Core orb with gentle inner highlight */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          background: `
            radial-gradient(circle at 35% 30%, ${rgba(Math.min(1, intensity * 1.2))} 0%, ${hex} 35%, ${rgba(0.8)} 100%),
            ${hex}
          `,
          boxShadow: `
            inset 0 0 80px ${rgba(0.3)},
            inset 0 -40px 80px ${rgba(0.4)},
            0 0 60px ${rgba(intensity * 0.6)}
          `,
        }}
        animate={{ scale: [1, 1.015, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
