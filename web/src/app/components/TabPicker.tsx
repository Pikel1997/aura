import { useTheme } from "./ThemeContext";

interface Tab {
  id: number;
  title: string;
  url: string;
  favicon: string;
}

const mockTabs: Tab[] = [
  { id: 1, title: "Daft Punk – Get Lucky · YouTube Music", url: "music.youtube.com", favicon: "▶" },
  { id: 2, title: "The 1975 – Robbers (Live) · YouTube", url: "youtube.com", favicon: "▶" },
  { id: 3, title: "Tame Impala – Let It Happen · Spotify", url: "open.spotify.com", favicon: "♫" },
  { id: 4, title: "Boards of Canada – Dayvan Cowboy", url: "soundcloud.com", favicon: "◉" },
];

interface TabPickerProps {
  onSelect: (tab: Tab) => void;
  onCancel: () => void;
}

export function TabPicker({ onSelect, onCancel }: TabPickerProps) {
  const { t } = useTheme();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 500,
        background: t.isDark ? "rgba(8,8,6,0.88)" : "rgba(220,216,208,0.88)",
        backdropFilter: "blur(2px)",
        fontFamily: "'Space Mono', monospace",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: t.bg,
          border: `1px solid ${t.borderStrong}`,
          width: 520,
          overflow: "hidden",
          boxShadow: t.isDark
            ? "0 24px 60px rgba(0,0,0,0.6)"
            : "0 24px 60px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px 13px",
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <p style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: t.textSubtle,
          }}>
            Select Chrome Tab
          </p>
          <p style={{ fontSize: 9, color: t.textGhost, letterSpacing: "0.1em" }}>
            ESC to cancel
          </p>
        </div>

        {/* Tab list */}
        <div>
          {mockTabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => onSelect(tab)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                padding: "16px 20px",
                background: "transparent",
                border: "none",
                borderBottom: i < mockTabs.length - 1 ? `1px solid ${t.border}` : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = t.isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.03)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span style={{
                fontSize: 11,
                color: t.textSubtle,
                paddingTop: 1,
                flexShrink: 0,
              }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  color: t.text,
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 4,
                  letterSpacing: "0.02em",
                }}>
                  {tab.title}
                </p>
                <p style={{
                  fontSize: 10,
                  color: t.textSubtle,
                  letterSpacing: "0.04em",
                }}>
                  {tab.url}
                </p>
              </div>
              <span style={{ fontSize: 10, color: t.textGhost, paddingTop: 1, flexShrink: 0 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { Tab };
