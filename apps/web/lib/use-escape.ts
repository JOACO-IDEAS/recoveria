"use client";
import { useEffect } from "react";

/** Shared accessibility helper: Escape closes any overlay/drawer that uses it. */
export function useEscapeKey(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}
