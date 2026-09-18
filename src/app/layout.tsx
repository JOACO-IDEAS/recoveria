import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { EvidenceInspectorProvider } from "@/components/evidence-inspector";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "RecoverIA",
  description: "Operaciones de cuentas por cobrar con autoridad humana",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable}`}><body><EvidenceInspectorProvider><AppShell>{children}</AppShell></EvidenceInspectorProvider></body></html>;
}
