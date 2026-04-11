import { useTheme } from "./ThemeContext";

type OrbState = "idle" | "checking" | "no-bridge" | "no-bulb" | "picking-tab" | "running" | "error";

interface OrbConfig {
  size: number;
  core: string;
  shadow: string;
  lightShadow: string; // shadow variant for light bg
  ring1: string;
  ring2: string;
  glitch: boolean;
  pulse: boolean;
}

const configs: Record<OrbState, OrbConfig> = {
  idle: {
    size: 280,
    core: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.28) 0%, #a080ff 18%, #6040e0 40%, #2a1280 70%, #0e0520 100%)",
    shadow: "0 0 40px 8px rgba(140,90,255,0.55), 0 0 100px 30px rgba(100,50,240,0.28), 0 0 200px 60px rgba(80,30,200,0.10)",
    lightShadow: "0 0 40px 12px rgba(100,50,240,0.55), 0 0 100px 36px rgba(80,30,220,0.30), 0 20px 60px 10px rgba(0,0,0,0.18)",
    ring1: "rgba(140,90,255,0.10)",
    ring2: "rgba(100,50,240,0.05)",
    glitch: false,
    pulse: true,
  },
  checking: {
    size: 280,
    core: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.18) 0%, #7060cc 20%, #402888 44%, #1a1050 72%, #080418 100%)",
    shadow: "0 0 30px 6px rgba(100,70,200,0.40), 0 0 80px 24px rgba(70,40,180,0.18)",
    lightShadow: "0 0 30px 10px rgba(80,50,200,0.50), 0 0 80px 28px rgba(60,30,180,0.22), 0 16px 48px 8px rgba(0,0,0,0.14)",
    ring1: "rgba(100,70,200,0.08)",
    ring2: "rgba(70,40,180,0.04)",
    glitch: false,
    pulse: true,
  },
  "no-bridge": {
    size: 260,
    core: "radial-gradient(circle at 40% 35%, rgba(255,60,30,0.25) 0%, #801010 28%, #3a0808 56%, #180404 80%, #0a0303 100%)",
    shadow: "0 0 30px 6px rgba(200,20,20,0.35), 0 0 80px 24px rgba(160,10,10,0.15)",
    lightShadow: "0 0 30px 10px rgba(180,10,10,0.45), 0 0 80px 28px rgba(140,5,5,0.22), 0 16px 48px 8px rgba(0,0,0,0.14)",
    ring1: "rgba(200,20,20,0.07)",
    ring2: "rgba(160,10,10,0.03)",
    glitch: false,
    pulse: false,
  },
  "no-bulb": {
    size: 260,
    core: "radial-gradient(circle at 40% 35%, rgba(255,180,30,0.22) 0%, #804010 28%, #3a1c08 56%, #180c04 80%, #0a0603 100%)",
    shadow: "0 0 30px 6px rgba(200,100,20,0.32), 0 0 80px 24px rgba(160,70,10,0.13)",
    lightShadow: "0 0 30px 10px rgba(180,80,10,0.42), 0 0 80px 28px rgba(140,60,5,0.20), 0 16px 48px 8px rgba(0,0,0,0.14)",
    ring1: "rgba(200,100,20,0.06)",
    ring2: "rgba(160,70,10,0.03)",
    glitch: false,
    pulse: false,
  },
  "picking-tab": {
    size: 280,
    core: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.28) 0%, #a080ff 18%, #6040e0 40%, #2a1280 70%, #0e0520 100%)",
    shadow: "0 0 40px 8px rgba(140,90,255,0.55), 0 0 100px 30px rgba(100,50,240,0.28)",
    lightShadow: "0 0 40px 12px rgba(100,50,240,0.55), 0 0 100px 36px rgba(80,30,220,0.30), 0 20px 60px 10px rgba(0,0,0,0.18)",
    ring1: "rgba(140,90,255,0.10)",
    ring2: "rgba(100,50,240,0.05)",
    glitch: false,
    pulse: true,
  },
  running: {
    size: 380,
    core: "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.35) 0%, #ffe040 12%, #ff8800 35%, #cc4400 60%, #601800 82%, #200800 100%)",
    shadow: "0 0 60px 16px rgba(255,160,20,0.60), 0 0 140px 50px rgba(220,100,10,0.30), 0 0 280px 90px rgba(180,60,0,0.12)",
    lightShadow: "0 0 60px 20px rgba(220,130,10,0.65), 0 0 140px 56px rgba(200,80,5,0.35), 0 24px 80px 14px rgba(0,0,0,0.20)",
    ring1: "rgba(255,160,20,0.10)",
    ring2: "rgba(220,100,10,0.05)",
    glitch: false,
    pulse: true,
  },
  error: {
    size: 260,
    core: "radial-gradient(circle at 40% 35%, rgba(255,40,20,0.30) 0%, #cc1800 24%, #600800 50%, #280300 76%, #0e0101 100%)",
    shadow: "0 0 30px 6px rgba(220,30,20,0.45), 0 0 80px 24px rgba(180,15,10,0.20)",
    lightShadow: "0 0 30px 10px rgba(200,20,10,0.55), 0 0 80px 28px rgba(160,10,5,0.28), 0 16px 48px 8px rgba(0,0,0,0.14)",
    ring1: "rgba(220,30,20,0.08)",
    ring2: "rgba(180,15,10,0.04)",
    glitch: true,
    pulse: true,
  },
};

export function Orb({ state }: { state: OrbState }) {
  const { t } = useTheme();
  const cfg = configs[state];
  const isRunning = state === "running";
  const shadow = t.isDark ? cfg.shadow : cfg.lightShadow;

  return (
    <div
      style={{
        position: "relative",
        width: cfg.size,
        height: cfg.size,
        flexShrink: 0,
        transition: "width 1.4s cubic-bezier(0.22,1,0.36,1), height 1.4s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* Light-mode backdrop — gives the orb contrast on paper bg */}
      {!t.isDark && (
        <div style={{
          position: "absolute",
          inset: "-22%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.04) 50%, transparent 72%)",
          pointerEvents: "none",
          transition: "opacity 0.8s ease",
        }} />
      )}

      {/* Outer diffuse glow rings */}
      <div style={{
        position: "absolute",
        inset: "-40%",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${cfg.ring1} 0%, ${cfg.ring2} 50%, transparent 70%)`,
        transition: "background 1.4s ease",
        pointerEvents: "none",
      }} />

      {/* Orb sphere */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: cfg.core,
          boxShadow: shadow,
          animation: cfg.glitch
            ? "orb-glitch 0.4s steps(1) infinite"
            : cfg.pulse && isRunning
            ? "orb-breathe-hot 2.8s ease-in-out infinite"
            : cfg.pulse
            ? "orb-breathe 4.5s ease-in-out infinite"
            : "none",
          transition: "background 1.4s ease, box-shadow 1.4s ease",
          overflow: "hidden",
        }}
      >
        {/* Specular highlight */}
        <div style={{
          position: "absolute",
          top: "14%",
          left: "20%",
          width: "35%",
          height: "28%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.28) 0%, transparent 100%)",
          filter: "blur(4px)",
        }} />
        {/* Bottom rim light */}
        <div style={{
          position: "absolute",
          bottom: "12%",
          left: "20%",
          right: "20%",
          height: "10%",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          filter: "blur(6px)",
        }} />
      </div>

      <style>{`
        @keyframes orb-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes orb-breathe-hot {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.12); }
        }
        @keyframes orb-glitch {
          0%   { transform: translate(0,0) skewX(0deg); filter: hue-rotate(0deg); }
          20%  { transform: translate(-3px, 2px) skewX(-1deg); filter: hue-rotate(20deg); }
          40%  { transform: translate(3px, -1px) skewX(1deg); filter: hue-rotate(-20deg); }
          60%  { transform: translate(-2px, 3px) skewX(0.5deg); filter: hue-rotate(10deg); }
          80%  { transform: translate(2px, -2px) skewX(-0.5deg); filter: hue-rotate(-10deg); }
          100% { transform: translate(0,0) skewX(0deg); filter: hue-rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
