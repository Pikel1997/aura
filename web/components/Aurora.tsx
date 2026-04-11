"use client";

import { motion } from "framer-motion";

/**
 * Animated aurora background — three blurred gradient blobs that drift
 * slowly. The active color (from the bulb) tints the central blob so the
 * whole page subtly reacts to whatever's on screen.
 */
export function Aurora({ activeColor }: { activeColor: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Top-left purple */}
      <motion.div
        className="absolute -top-1/3 -left-1/4 h-[80vh] w-[80vh] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(120, 80, 255, 0.7) 0%, transparent 60%)",
        }}
        animate={{
          x: [0, 60, 0],
          y: [0, 40, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Bottom-right cyan */}
      <motion.div
        className="absolute -bottom-1/3 -right-1/4 h-[80vh] w-[80vh] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 200, 255, 0.7) 0%, transparent 60%)",
        }}
        animate={{
          x: [0, -50, 0],
          y: [0, -30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Center reactive blob — tinted by current bulb color */}
      <motion.div
        className="absolute top-1/2 left-1/2 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${activeColor} 0%, transparent 65%)`,
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Subtle grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
