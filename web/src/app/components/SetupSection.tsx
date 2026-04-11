import { useTheme } from "./ThemeContext";

export function SetupSection() {
  const { t } = useTheme();

  const steps = [
    {
      n: "01",
      title: "Clone the repo",
      code: "git clone https://github.com/Pikel1997/aura.git && cd aura",
      isCommand: true,
    },
    {
      n: "02",
      title: "Run the bridge",
      code: "python3 bridge.py",
      isCommand: true,
    },
    {
      n: "03",
      title: "Come back and start",
      code: "Click Start Aura above.",
      isCommand: false,
    },
  ];

  return (
    <section style={{ width: "100%", fontFamily: "'Space Mono', monospace" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 48 }}>
        <div style={{ flex: 1, height: 1, background: t.borderMid }} />
        <p style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: t.textSubtle,
          whiteSpace: "nowrap",
        }}>
          One-time setup
        </p>
        <div style={{ flex: 1, height: 1, background: t.borderMid }} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 1,
        background: t.borderMid,
      }}>
        {steps.map((step) => (
          <div key={step.n} style={{ background: t.bg, padding: "28px 24px" }}>
            <p style={{
              fontSize: 11,
              color: t.textSubtle,
              letterSpacing: "0.05em",
              marginBottom: 12,
            }}>
              {step.n}
            </p>
            <p style={{
              fontSize: 13,
              fontWeight: 700,
              color: t.textMuted,
              letterSpacing: "0.03em",
              marginBottom: 16,
              textTransform: "uppercase",
              fontFamily: "'Space Mono', monospace",
            }}>
              {step.title}
            </p>
            {step.isCommand ? (
              <div style={{
                background: t.surface,
                border: `1px solid ${t.borderMid}`,
                padding: "10px 12px",
                fontSize: 11,
                color: t.textMuted,
                letterSpacing: "0.02em",
                wordBreak: "break-all",
                lineHeight: 1.6,
              }}>
                <span style={{ color: t.textSubtle, marginRight: 6 }}>$</span>
                {step.code}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: t.textSubtle, letterSpacing: "0.03em", lineHeight: 1.6 }}>
                {step.code}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
