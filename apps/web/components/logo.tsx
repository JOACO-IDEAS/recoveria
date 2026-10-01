"use client";
import { useState } from "react";

// Recoveria V2.1 — canonical brand integration.
//
// The founder-approved canonical logo now lives at:
//   public/brand/recoveria-lockup.png   — the original supplied asset, re-encoded
//                                          to PNG verbatim (no crop, no edit).
//   public/brand/recoveria-symbol.png   — a pure pixel-bounding-box crop of the
//                                          symbol out of the same original file
//                                          (measured programmatically from the
//                                          actual non-white content region —
//                                          nothing was redrawn or reinterpreted).
//
// FallbackSymbol below is kept only as a defensive onError safety net (e.g. if
// a future deploy is missing the asset) — under normal operation it never
// renders, since the real files are present and used directly.

function FallbackSymbol({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="rvUpperFallback" x1="6" y1="3" x2="27" y2="15" gradientUnits="userSpaceOnUse"><stop stopColor="#0A2540" /><stop offset="1" stopColor="#2E6FEA" /></linearGradient>
      <linearGradient id="rvLowerFallback" x1="6" y1="17" x2="27" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#0F9488" /><stop offset="1" stopColor="#3FCB7C" /></linearGradient>
    </defs>
    <path d="M16 3.2C23.07 3.2 28.8 8.93 28.8 16C22.8 16 21 15 16 16C11 17 9.2 16 3.2 16C3.2 8.93 8.93 3.2 16 3.2Z" fill="url(#rvUpperFallback)" />
    <path d="M16 28.8C8.93 28.8 3.2 23.07 3.2 16C9.2 16 11 17 16 16C21 15 22.8 16 28.8 16C28.8 23.07 23.07 28.8 16 28.8Z" fill="url(#rvLowerFallback)" />
    <path d="M3.2 16C9.2 16 11 17 16 16C21 15 22.8 16 28.8 16" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}

export function LogoSymbol({ size = 22 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <FallbackSymbol size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/recoveria-symbol.png" width={size} height={size} alt="Recoveria" onError={() => setFailed(true)} style={{ display: "block", objectFit: "contain", flexShrink: 0 }} />;
}

/** `light` renders the wordmark as a single solid-white "Recoveria" for the
 * dark navy sidebar — one text node, one color, so it can never read as two
 * separate pieces. The default tone (navy "Recover" + teal "ia") is only for
 * the rare white-background fallback inside TaglineLockup. */
export function Wordmark({ size = 15, light = false }: { size?: number; light?: boolean }) {
  if (light) return <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.01em", whiteSpace: "nowrap", flexShrink: 0, color: "#FFFFFF" }}>Recoveria</span>;
  return <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", flexShrink: 0 }}>
    <span style={{ color: "#0A2540" }}>Recover</span><span style={{ color: "#0F9488" }}>ia</span>
  </span>;
}

/** SYMBOL + Recoveria — the standard compact operational lockup for sidebar/header. */
export function BrandLockup({ symbolSize = 20, wordmarkSize = 15, light = false }: { symbolSize?: number; wordmarkSize?: number; light?: boolean }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 11, flexWrap: "nowrap", flexShrink: 0, minWidth: 0, whiteSpace: "nowrap" }}>
    <LogoSymbol size={symbolSize} />
    <Wordmark size={wordmarkSize} light={light} />
  </span>;
}

/** Full canonical lockup (symbol + wordmark + tagline), rendered from the
 * original founder-supplied artwork directly — reserved for about/loading/
 * brand contexts, never repeated across operational screens. */
export function TaglineLockup() {
  const [failed, setFailed] = useState(false);
  if (failed) return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
    <LogoSymbol size={40} />
    <Wordmark size={22} />
    <span style={{ fontSize: 10, letterSpacing: "0.14em", fontWeight: 700, color: "#5c6b74", textTransform: "uppercase" }}>DE LA INFORMACIÓN AL COBRO</span>
  </div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/recoveria-lockup.png" width={260} height={260} alt="Recoveria — de la información al cobro" onError={() => setFailed(true)} style={{ display: "block", width: 260, height: "auto" }} />;
}
