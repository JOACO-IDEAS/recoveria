import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "../public/fonts/manrope-latin.woff2", weight: "400 800", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Recoveria — Gestión inteligente de cobranzas",
  description: "Priorizá, gestioná y recuperá cuentas por cobrar con trazabilidad completa.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/brand/recoveria-symbol.png",
    shortcut: "/brand/recoveria-symbol.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={sans.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
