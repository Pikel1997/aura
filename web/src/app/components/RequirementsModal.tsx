import { useEffect, useState } from "react";
import { useTheme } from "./ThemeContext";

const STORAGE_KEY = "aura.requirements.seen";

interface Props {
  /** Called when the user picks "I have a bulb". */
  onContinueWithBulb: () => void;
  /** Called when the user picks "No bulb, demo only". */
  onContinueWithoutBulb: () => void;
}

/**
 * First-load requirements modal. Lays out what Aura needs (a Philips
 * WiZ bulb on the same Wi-Fi as this Mac) and gives the user two
 * paths: real-bulb mode (the default) or a "no-bulb / demo" mode that
 * runs the orb visualization without ever talking to a bulb.
 *
 * Only shown on first load — dismiss state is persisted in
 * localStorage so returning users go straight to the page.
 */
export function RequirementsModal({
  onContinueWithBulb,
  onContinueWithoutBulb,
}: Props) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        // Small delay so the page has time to fade in first
        const id = window.setTimeout(() => setOpen(true), 350);
        return () => window.clearTimeout(id);
      }
    } catch {
      // localStorage blocked (private mode) — show anyway, won't persist
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  const handleBulb = () => {
    dismiss();
    onContinueWithBulb();
  };

  const handleDemo = () => {
    dismiss();
    onContinueWithoutBulb();
  };

  // Lightweight stack-style requirements list
  const requirements = [
    {
      id: "browser",
      title: "Modern Chrome / Edge / Brave / Arc",
      body: "You're already here, so this is good.",
      auto: true,
    },
    {
      id: "bulb",
      title: "A Philips WiZ smart bulb",
      body: "Any Wi-Fi WiZ bulb works (E27, A19, GU10, BR30, light strips).",
      auto: false,
    },
    {
      id: "wifi",
      title: "Bulb on the same Wi-Fi as this Mac",
      body: "Aura discovers the bulb on your local network — make sure they're on the same SSID.",
      auto: false,
    },
    {
      id: "wizapp",
      title: "Bulb already set up in the Philips WiZ app",
      body: "Pair the bulb in WiZ first, then come back here. Aura doesn't do initial pairing.",
      auto: false,
    },
  ];

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
      onClick={handleDemo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 580,
          background: t.bg,
          border: `1px solid ${t.borderStrong}`,
          boxShadow: t.isDark
            ? "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)"
            : "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px 28px 20px",
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
        }}>
          <div>
            <p style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: t.textSubtle,
              marginBottom: 8,
            }}>
              Before you start
            </p>
            <p style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
              letterSpacing: "0.04em",
              color: t.text,
              lineHeight: 1.1,
            }}>
              Requirements
            </p>
          </div>
          <button
            onClick={handleDemo}
            aria-label="Skip this"
            style={{
              background: "transparent",
              border: "none",
              color: t.textGhost,
              cursor: "pointer",
              fontSize: 16,
              padding: 4,
              lineHeight: 1,
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        {/* Requirements list */}
        <div style={{ padding: "8px 0" }}>
          {requirements.map((req, i) => (
            <div
              key={req.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                padding: "16px 28px",
                borderBottom: i < requirements.length - 1
                  ? `1px solid ${t.border}`
                  : "none",
              }}
            >
              <div style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                marginTop: 1,
                border: `1px solid ${req.auto ? "rgba(48,209,88,0.5)" : t.borderStrong}`,
                background: req.auto ? "rgba(48,209,88,0.10)" : "transparent",
                color: req.auto ? "#30d158" : t.textSubtle,
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {req.auto ? "✓" : String(i + 1).padStart(2, "0").slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: t.text,
                  letterSpacing: "0.02em",
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}>
                  {req.title}
                </p>
                <p style={{
                  fontSize: 11,
                  color: t.textSubtle,
                  letterSpacing: "0.02em",
                  lineHeight: 1.65,
                }}>
                  {req.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with the two CTAs */}
        <div style={{
          padding: "20px 28px 24px",
          borderTop: `1px solid ${t.border}`,
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
            I have a bulb — let's set up →
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
            No bulb — just show me the orb
          </button>
          <p style={{
            marginTop: 6,
            fontSize: 9,
            color: t.textGhost,
            letterSpacing: "0.06em",
            textAlign: "center",
            lineHeight: 1.7,
          }}>
            Demo mode runs the same color extraction and animation
            without controlling a physical bulb. Switch to bulb mode
            anytime from the page.
          </p>
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
