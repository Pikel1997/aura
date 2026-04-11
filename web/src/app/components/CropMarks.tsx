import { useTheme } from "./ThemeContext";

export function CropMarks() {
  const { t } = useTheme();
  const color = t.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
  const size = 18;

  const Mark = ({
    top, right, bottom, left,
  }: { top?: number; right?: number; bottom?: number; left?: number }) => (
    <div style={{
      position: "fixed",
      zIndex: 50,
      pointerEvents: "none",
      top: top !== undefined ? top : undefined,
      right: right !== undefined ? right : undefined,
      bottom: bottom !== undefined ? bottom : undefined,
      left: left !== undefined ? left : undefined,
      width: size,
      height: size,
    }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: color, transform: "translateY(-50%)" }} />
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: color, transform: "translateX(-50%)" }} />
    </div>
  );

  return (
    <>
      <Mark top={16} left={16} />
      <Mark top={16} right={16} />
      <Mark bottom={16} left={16} />
      <Mark bottom={16} right={16} />
    </>
  );
}
