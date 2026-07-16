import type { Metadata } from "next";
import { Merriweather_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const merriweatherSans = Merriweather_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pulseapp.top"),
  title: "Pulse — live token radar for Robinhood Chain",
  description:
    "Every new token on Robinhood Chain, live — Flap, Pons, Klik, Virtuals & more, with real market data and AI analysis.",
  openGraph: {
    title: "Pulse — live token radar for Robinhood Chain",
    description: "Every new token on Robinhood Chain, live, with real market data and AI analysis.",
    images: ["/logo.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${merriweatherSans.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="bg-glow noise min-h-full">
        <div className="relative z-10 min-h-full">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
