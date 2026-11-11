import type { Metadata } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Mirante", template: "%s · Mirante" },
  description: "Sinais visuais observáveis em gravações de reuniões, apresentações e treinamentos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
