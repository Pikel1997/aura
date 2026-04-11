import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura — reactive lighting for your screen",
  description:
    "Pick a Chrome tab. Watch your room glow with whatever you're watching. Aura turns any Philips WiZ smart bulb into ambient lighting that follows your screen in real time.",
  metadataBase: new URL("https://aura.vercel.app"),
  openGraph: {
    title: "Aura — reactive lighting for your screen",
    description:
      "Pick a Chrome tab. Watch your room glow with whatever you're watching.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
