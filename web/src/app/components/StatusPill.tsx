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

  // Shared visual styles — applied to either a button or a div depending
  // on whether the pill is interactive.
  const visual: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px 7px",
    minHeight: 32,
    border: `1px solid ${c.border}`,
    borderRadius: 0,
    background: c.bg,
    color: c.text,
    fontSize: 12,
    fontFamily: "'Space Mono', monospace",
    fontWeight: 400,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    userSelect: "none",
    transition: "border-color 0.15s, background 0.15s, outline-color 0.15s",
    filter: t.isDark ? "none" : "saturate(1.1)",
  };

  const dot = (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: c.dot,
        flexShrink: 0,
        animation: variant === "checking" ? "dot-blink 1.2s ease-in-out infinite" : "none",
      }}
    />
  );

  // Always-present keyframes
  const styleTag = (
    <style>{`
      @keyframes dot-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.15; }
      }
    `}</style>
  );

  // Interactive: real button with focus ring + role
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-live="polite"
        style={{
          ...visual,
          cursor: "pointer",
          padding: "10px 20px 9px",
          background: `${c.dot}18`,
          borderColor: `${c.dot}66`,
          fontWeight: 700,
          // Custom focus ring matching the variant color
          outline: "none",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = `${c.dot}28`;
          el.style.borderColor = `${c.dot}99`;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.background = `${c.dot}18`;
          el.style.borderColor = `${c.dot}66`;
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            `0 0 0 2px ${c.border}, 0 0 0 4px ${c.dot}55`;
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        {dot}
        {children}
        {styleTag}
      </button>
    );
  }

  // Static: a div, but still announced via aria-live so screen readers
  // pick up state transitions (idle → no-bridge → connected, etc.)
  return (
    <div role="status" aria-live="polite" style={visual}>
      {dot}
      {children}
      {styleTag}
    </div>
  );
}
