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
  text: "#f0f0e8",       // ~17:1 on bg — AAA
  textMuted: "#a8a89e",  // ~7.0:1 on bg — AAA (was #6a6a60 ≈ 4.0:1)
  textSubtle: "#7e7e74", // ~4.6:1 on bg — AA  (was #3a3a34 ≈ 1.8:1, invisible)
  textGhost: "#5a5a52",  // ~3.0:1 on bg — AA large/decorative
                          // (was #1e1e1a ≈ 1.1:1, completely invisible)
  border: "rgba(255,255,255,0.06)",
  borderMid: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.16)",
  scanlines: "rgba(0,0,0,0.12)",
  grainOpacity: 0.055,
  watermarkOpacity: 0.06,
  disabledBorder: "rgba(255,255,255,0.10)",
  disabledText: "#5a5a52",
  navText: "#f0f0e8",
  switcherBg: "rgba(10,10,8,0.96)",
  switcherBorder: "rgba(255,255,255,0.08)",
  switcherDivider: "rgba(255,255,255,0.06)",
  switcherInactive: "#5a5a52",
  switcherHover: "#a8a89e",
  annotationColor: "#5a5a52", // matches textGhost
  metricsBg: "#0c0c0a",
  metricsBorder: "rgba(255,255,255,0.10)",
  metricsDivider: "rgba(255,255,255,0.10)",
};

export const lightTheme: Theme = {
  isDark: false,
  bg: "#eeeae0",
  surface: "#e4e0d6",
  surfaceAlt: "#e8e4da",
  text: "#1a1814",        // ~14:1 on bg — AAA
  textMuted: "#5a5048",   // ~6.5:1 on bg — AAA (was #6a6058 ≈ 4.7:1)
  textSubtle: "#766c5e",  // ~4.6:1 on bg — AA  (was #a09880 ≈ 2.5:1)
  textGhost: "#8e8474",   // ~3.0:1 on bg — AA large/decorative
                           // (was #c4c0b8 ≈ 1.4:1, near invisible)
  border: "rgba(0,0,0,0.10)",
  borderMid: "rgba(0,0,0,0.14)",
  borderStrong: "rgba(0,0,0,0.20)",
  scanlines: "rgba(0,0,0,0.028)",
  grainOpacity: 0.10,
  watermarkOpacity: 0.08,
  disabledBorder: "rgba(0,0,0,0.10)",
  disabledText: "#8e8474",
  navText: "#1a1814",
  switcherBg: "rgba(224,220,212,0.97)",
  switcherBorder: "rgba(0,0,0,0.10)",
  switcherDivider: "rgba(0,0,0,0.06)",
  switcherInactive: "#8e8474",
  switcherHover: "#5a5048",
  annotationColor: "#8e8474",
  metricsBg: "#eeeae0",
  metricsBorder: "rgba(0,0,0,0.10)",
  metricsDivider: "rgba(0,0,0,0.10)",
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
