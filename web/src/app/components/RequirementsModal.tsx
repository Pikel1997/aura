import { useTheme } from "./ThemeContext";

interface Props {
  /** Whether the modal is currently visible. Parent-controlled. */
  open: boolean;
  /** Called when the user picks "I have a bulb". */
  onContinueWithBulb: () => void;
  /** Called when the user picks "No bulb, demo only". */
  onContinueWithoutBulb: () => void;
  /** Called when the user dismisses the modal without picking. */
  onClose: () => void;
}

/**
 * Pre-flight requirements modal. Lays out what Aura needs (a Philips
 * WiZ bulb on the same Wi-Fi as this Mac) and gives the user two
 * paths: real-bulb mode or a "no-bulb / demo" mode that runs the orb
 * visualization without ever talking to a bulb. Triggered when the
 * user clicks Start Aura for the first time.
 */
export function RequirementsModal({
  open,
  onContinueWithBulb,
  onContinueWithoutBulb,
  onClose,
}: Props) {
  const { t } = useTheme();

  if (!open) return null;

  const handleBulb = () => onContinueWithBulb();
  const handleDemo = () => onContinueWithoutBulb();
  const handleClose = () => onClose();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: t.isDark ? "rgba(8,8,6,0.92)" : "rgba(220,216,208,0.92)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        animation: "aura-fade-in 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        fontFamily: "'Space Mono', monospace",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: t.bg,
          border: `1px solid ${t.borderStrong}`,
          boxShadow: t.isDark
            ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)"
            : "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "36px 32px 28px",
          position: "relative",
        }}
      >
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "transparent",
            border: "none",
            color: t.textGhost,
            cursor: "pointer",
            fontSize: 18,
            padding: 6,
            lineHeight: 1,
            fontFamily: "inherit",
          }}
        >
          ✕
        </button>

        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: t.textSubtle,
          marginBottom: 14,
          textAlign: "center",
        }}>
          One question
        </p>
        <p style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 32,
          letterSpacing: "0.04em",
          color: t.text,
          lineHeight: 1.1,
          textAlign: "center",
          marginBottom: 28,
        }}>
          Do you have a Philips WiZ bulb?
        </p>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <button
            onClick={handleBulb}
            style={{
              background: "#8060ff",
              color: t.isDark ? "#0c0c0a" : "#ffffff",
              border: "none",
              padding: "14px 24px 12px",
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 16,
              letterSpacing: "0.12em",
              cursor: "pointer",
              transition: "filter 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
          >
            Yes — set it up →
          </button>
          <button
            onClick={handleDemo}
            style={{
              background: "transparent",
              color: t.textMuted,
              border: `1px solid ${t.borderStrong}`,
              padding: "12px 24px 10px",
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 14,
              letterSpacing: "0.12em",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = t.text;
              el.style.borderColor = t.isDark
                ? "rgba(255,255,255,0.28)"
                : "rgba(0,0,0,0.28)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = t.textMuted;
              el.style.borderColor = t.borderStrong;
            }}
          >
            No — show me the orb
          </button>
        </div>
      </div>

      <style>{`
        @keyframes aura-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
