import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const display = Oswald({ subsets: ["latin"], weight: ["500","600","700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "World Cup 2026 — Live Tracker",
  description: "Live scores, group standings, and an auto-updating knockout bracket for the 48-team 2026 FIFA World Cup across the USA, Canada and Mexico.",
  openGraph: {
    title: "World Cup 2026 — Live Tracker",
    description: "Live scores, standings, and a bracket that fills itself in as results come in.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Nav />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
