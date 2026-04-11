import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./ThemeContext";
import { ping } from "../../lib/bridge";

interface Props {
  /**
   * Current app state. The polling indicator and auto-recheck only run
   * when the bridge is actually missing — for every other state the
   * panel is just informational so users can copy the install command
   * for another device.
   */
  appState: string;
  /**
   * Called when /health starts responding while we're polling.
   */
  onBridgeOnline: () => void;
}

export function InstallBridge({ appState, onBridgeOnline }: Props) {
  const { t } = useTheme();
  const [copied, setCopied] = useState(false);

  // The install command points at *this* deployment — whatever URL the
  // user is currently on. That way the curl URL and the install.sh path
  // always match, regardless of which Vercel domain you're using.
  const installCmd = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `curl -fsSL ${origin}/install.sh | bash`;
  }, []);

  const needsBridge = appState === "no-bridge";

  // Auto-poll /health every 2s while the bridge is missing. The moment
  // it responds we advance the parent state out of no-bridge.
  useEffect(() => {
    if (!needsBridge) return;
    const id = window.setInterval(async () => {
      try {
        const status = await ping();
        if (status?.service === "aura-bridge") {
          window.clearInterval(id);
          onBridgeOnline();
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [needsBridge, onBridgeOnline]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* clipboard blocked — user can still select manually */
    }
  };

  return (
    <section style={{ width: "100%", fontFamily: "'Space Mono', monospace" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 36 }}>
        <div style={{ flex: 1, height: 1, background: t.borderMid }} />
        <p style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: t.textSubtle,
          whiteSpace: "nowrap",
        }}>
          One-time install
        </p>
        <div style={{ flex: 1, height: 1, background: t.borderMid }} />
      </div>

      {/* Headline */}
      <p style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 28,
        letterSpacing: "0.04em",
        color: t.text,
        textAlign: "center",
        lineHeight: 1.15,
        marginBottom: 16,
      }}>
        Install the bridge in 30 seconds.
      </p>

      <p style={{
        fontSize: 12,
        color: t.textSubtle,
        letterSpacing: "0.02em",
        textAlign: "center",
        lineHeight: 1.7,
        maxWidth: 600,
        margin: "0 auto 36px",
      }}>
        Aura needs a tiny background process running on your Mac to
        talk to your bulb. Open Terminal once, paste the line below,
        hit return — that&apos;s it. From then on the bridge auto-starts
        every time you log in. You&apos;ll never see this screen again.
      </p>

      {/* Command card */}
      <div style={{
        background: t.surface,
        border: `1px solid ${t.borderStrong}`,
        padding: 0,
        marginBottom: 24,
        maxWidth: 700,
        margin: "0 auto 24px",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: `1px solid ${t.border}`,
          background: t.isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.04)",
        }}>
          <span style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: t.textSubtle,
            fontWeight: 700,
            flex: 1,
          }}>
            paste this into terminal
          </span>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? "#30d158" : "transparent",
              border: `1px solid ${copied ? "rgba(48,209,88,0.5)" : t.borderStrong}`,
              color: copied ? (t.isDark ? "#0c0c0a" : "#ffffff") : t.textMuted,
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "4px 12px 3px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                (e.currentTarget as HTMLButtonElement).style.color = t.text;
                (e.currentTarget as HTMLButtonElement).style.borderColor = t.isDark
                  ? "rgba(255,255,255,0.28)"
                  : "rgba(0,0,0,0.28)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                (e.currentTarget as HTMLButtonElement).style.borderColor = t.borderStrong;
              }
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div style={{
          padding: "18px 20px",
          fontSize: 13,
          color: t.text,
          letterSpacing: "0.01em",
          fontFamily: "'Space Mono', monospace",
          wordBreak: "break-all",
          lineHeight: 1.6,
        }}>
          <span style={{ color: t.textSubtle, marginRight: 8 }}>$</span>
          {installCmd}
        </div>
      </div>

      {/* Polling indicator — only while the bridge is actually missing */}
      {needsBridge && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 36,
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#a080ff",
            boxShadow: "0 0 8px rgba(160,128,255,0.6)",
            animation: "pulse-dot 1.4s ease-in-out infinite",
          }} />
          <p style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: t.textSubtle,
          }}>
            Waiting for bridge…
          </p>
        </div>
      )}

      {/* What to expect */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 1,
        background: t.borderMid,
        maxWidth: 760,
        margin: "0 auto",
      }}>
        {[
          {
            n: "01",
            title: "Open Terminal",
            body: "Hit ⌘+Space, type \"Terminal\", press return.",
          },
          {
            n: "02",
            title: "Paste & run",
            body: "Click Copy above, paste, hit return. Takes ~30 seconds.",
          },
          {
            n: "03",
            title: "Come back here",
            body: "Terminal closes itself and brings you back. This page advances automatically.",
          },
        ].map((step) => (
          <div key={step.n} style={{ background: t.bg, padding: "22px 20px" }}>
            <p style={{
              fontSize: 11,
              color: t.textSubtle,
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}>
              {step.n}
            </p>
            <p style={{
              fontSize: 12,
              fontWeight: 700,
              color: t.textMuted,
              letterSpacing: "0.03em",
              marginBottom: 10,
              textTransform: "uppercase",
            }}>
              {step.title}
            </p>
            <p style={{
              fontSize: 11,
              color: t.textSubtle,
              letterSpacing: "0.02em",
              lineHeight: 1.6,
            }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>

      {/* Reassurance footer */}
      <p style={{
        marginTop: 32,
        fontSize: 10,
        color: t.textGhost,
        letterSpacing: "0.06em",
        textAlign: "center",
        lineHeight: 1.7,
        maxWidth: 600,
        marginLeft: "auto",
        marginRight: "auto",
      }}>
        The script downloads from{" "}
        <a
          href="https://github.com/Pikel1997/aura"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: t.textMuted, textDecoration: "underline" }}
        >
          github.com/Pikel1997/aura
        </a>
        {" "}— open source under MIT. It installs into{" "}
        <span style={{ color: t.textMuted }}>~/.aura</span>{" "}
        and registers a launchd agent so the bridge starts on every login.
        Nothing leaves your machine.
      </p>
    </section>
  );
}
