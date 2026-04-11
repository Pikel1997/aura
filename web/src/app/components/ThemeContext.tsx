import { createContext, useContext, ReactNode } from "react";

export type ThemeMode = "dark" | "light";

export interface Theme {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textGhost: string;
  border: string;
  borderMid: string;
  borderStrong: string;
  scanlines: string;
  grainOpacity: number;
  watermarkOpacity: number;
  disabledBorder: string;
  disabledText: string;
  navText: string;
  switcherBg: string;
  switcherBorder: string;
  switcherDivider: string;
  switcherInactive: string;
  switcherHover: string;
  annotationColor: string;
  metricsBg: string;
  metricsBorder: string;
  metricsDivider: string;
}

export const darkTheme: Theme = {
  isDark: true,
  bg: "#0c0c0a",
  surface: "#111110",
  surfaceAlt: "#0f0f0d",
  text: "#f0f0e8",
  textMuted: "#6a6a60",
  textSubtle: "#3a3a34",
  textGhost: "#1e1e1a",
  border: "rgba(255,255,255,0.04)",
  borderMid: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",
  scanlines: "rgba(0,0,0,0.12)",
  grainOpacity: 0.055,
  watermarkOpacity: 0.04,
  disabledBorder: "rgba(255,255,255,0.07)",
  disabledText: "#2a2a24",
  navText: "#f0f0e8",
  switcherBg: "rgba(10,10,8,0.96)",
  switcherBorder: "rgba(255,255,255,0.06)",
  switcherDivider: "rgba(255,255,255,0.04)",
  switcherInactive: "#2a2a24",
  switcherHover: "#6a6a60",
  annotationColor: "#1e1e1a",
  metricsBg: "#0c0c0a",
  metricsBorder: "rgba(255,255,255,0.05)",
  metricsDivider: "rgba(255,255,255,0.06)",
};

export const lightTheme: Theme = {
  isDark: false,
  bg: "#eeeae0",
  surface: "#e4e0d6",
  surfaceAlt: "#e8e4da",
  text: "#1a1814",
  textMuted: "#6a6058",
  textSubtle: "#a09880",
  textGhost: "#c4c0b8",
  border: "rgba(0,0,0,0.06)",
  borderMid: "rgba(0,0,0,0.08)",
  borderStrong: "rgba(0,0,0,0.13)",
  scanlines: "rgba(0,0,0,0.028)",
  grainOpacity: 0.10,
  watermarkOpacity: 0.055,
  disabledBorder: "rgba(0,0,0,0.07)",
  disabledText: "#c4c0b8",
  navText: "#1a1814",
  switcherBg: "rgba(224,220,212,0.97)",
  switcherBorder: "rgba(0,0,0,0.08)",
  switcherDivider: "rgba(0,0,0,0.04)",
  switcherInactive: "#c0bcb4",
  switcherHover: "#8a8478",
  annotationColor: "#c4c0b8",
  metricsBg: "#eeeae0",
  metricsBorder: "rgba(0,0,0,0.05)",
  metricsDivider: "rgba(0,0,0,0.06)",
};

interface ThemeContextValue {
  t: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  t: darkTheme,
  toggle: () => {},
});

export function ThemeProvider({
  children,
  isDark,
  toggle,
}: {
  children: ReactNode;
  isDark: boolean;
  toggle: () => void;
}) {
  return (
    <ThemeContext.Provider value={{ t: isDark ? darkTheme : lightTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
