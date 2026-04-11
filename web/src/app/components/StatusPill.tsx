import { useTheme } from "./ThemeContext";

type PillVariant = "connected" | "checking" | "warning" | "error" | "violet";

interface StatusPillProps {
  variant: PillVariant;
  children: React.ReactNode;
  onClick?: () => void;
}

const colors: Record<PillVariant, { dot: string; border: string; text: string; bg: string }> = {
  connected: { dot: "#30d158", border: "rgba(48,209,88,0.45)", text: "#30d158", bg: "rgba(48,209,88,0.05)" },
  checking:  { dot: "#a080ff", border: "rgba(160,128,255,0.45)", text: "#9070ee", bg: "rgba(160,128,255,0.05)" },
  warning:   { dot: "#ff9f0a", border: "rgba(255,159,10,0.45)", text: "#e08800", bg: "rgba(255,159,10,0.05)" },
  error:     { dot: "#ff3c28", border: "rgba(255,60,40,0.45)", text: "#e02c1a", bg: "rgba(255,60,40,0.05)" },
  violet:    { dot: "#a080ff", border: "rgba(160,128,255,0.45)", text: "#9070ee", bg: "rgba(160,128,255,0.05)" },
};

export function StatusPill({ variant, children, onClick }: StatusPillProps) {
  const { t } = useTheme();
  const c = colors[variant];

  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px 5px",
        border: `1px solid ${c.border}`,
        borderRadius: 0,
        background: c.bg,
        color: c.text,
        fontSize: 11,
        fontFamily: "'Space Mono', monospace",
        fontWeight: 400,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transition: "border-color 0.15s, background 0.15s",
        // slightly stronger saturation on light so it reads
        filter: t.isDark ? "none" : "saturate(1.1)",
      }}
    >
      <span style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: c.dot,
        flexShrink: 0,
        animation: variant === "checking" ? "dot-blink 1.2s ease-in-out infinite" : "none",
      }} />
      {children}
      <style>{`
        @keyframes dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
