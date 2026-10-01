"use client";
import { useEffect } from "react";
import { RotateCcw, X } from "lucide-react";
import { useResetDemo } from "@/lib/store";
import { TaglineLockup } from "./logo";

export function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reset = useResetDemo();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="cmdk-backdrop" onClick={onClose}>
    <div className="about-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Acerca de Recoveria">
      <button className="about-close" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
      <TaglineLockup />
      <p className="about-text">Showroom interactivo con datos 100% sintéticos. Ninguna acción envía comunicaciones reales, se conecta a bases de datos o modifica sistemas de producción.</p>
      <button className="secondary about-reset" onClick={() => { reset(); onClose(); }}><RotateCcw size={14} /> Restablecer datos de demostración</button>
    </div>
  </div>;
}
