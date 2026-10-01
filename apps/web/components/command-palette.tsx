"use client";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { FileText, Inbox, LayoutDashboard, Search, UploadCloud, WalletCards } from "lucide-react";
import { useStore } from "@/lib/store";
import { entityTotals, money } from "@/lib/selectors";
import type { View } from "@/lib/view-types";

export function CommandPalette({ open, setOpen, setView, onOpenCase, onOpenEntity, onOpenInvoice }: {
  open: boolean; setOpen: (v: boolean) => void; setView: (v: View) => void;
  onOpenCase: (id: string) => void; onOpenEntity: (id: string) => void; onOpenInvoice: (id: string) => void;
}) {
  const { state } = useStore();
  const views: { id: View; label: string; icon: React.ElementType }[] = [
    { id: "inicio", label: "Resumen", icon: LayoutDashboard },
    { id: "cartera", label: "Cartera", icon: WalletCards },
    { id: "facturas", label: "Facturas", icon: FileText },
    { id: "casos", label: "Casos prioritarios", icon: Inbox },
    { id: "importaciones", label: "Importaciones", icon: UploadCloud },
  ];
  const entities = entityTotals(state);
  const run = (fn: () => void) => { fn(); setOpen(false); };
  return <CommandDialog open={open} onOpenChange={setOpen} label="Buscar en Recoveria" contentClassName="cmdk-panel" overlayClassName="cmdk-backdrop">
    <div className="cmdk-input-row"><Search size={16} /><CommandInput placeholder="Buscar cliente, factura, caso o vista…" /><kbd>Esc</kbd></div>
    <CommandList className="cmdk-list">
      <CommandEmpty className="cmdk-empty">Sin resultados. Probá con otro nombre o número de factura.</CommandEmpty>
      <CommandGroup heading="Vistas">
        {views.map((v) => <CommandItem key={v.id} value={v.label} onSelect={() => run(() => setView(v.id))} className="cmdk-item"><v.icon size={15} /> {v.label}</CommandItem>)}
      </CommandGroup>
      <CommandGroup heading="Casos prioritarios">
        {state.cases.filter((c) => c.status !== "resuelto").map((c) => <CommandItem key={c.id} value={`${c.property} ${c.id} caso`} onSelect={() => run(() => { setView("casos"); onOpenCase(c.id); })} className="cmdk-item"><Inbox size={15} /> {c.property}<small>{c.id}</small></CommandItem>)}
      </CommandGroup>
      <CommandGroup heading="Administraciones">
        {entities.map((e) => <CommandItem key={e.entity.id} value={`${e.entity.name} administracion`} onSelect={() => run(() => { setView("cartera"); onOpenEntity(e.entity.id); })} className="cmdk-item"><WalletCards size={15} /> {e.entity.name}<small>{money(e.outstandingCents)}</small></CommandItem>)}
      </CommandGroup>
      <CommandGroup heading="Facturas / Documentos">
        {state.invoices.map((i) => <CommandItem key={i.id} value={`${i.id} ${i.property} factura documento`} onSelect={() => run(() => { setView("facturas"); onOpenInvoice(i.id); })} className="cmdk-item"><FileText size={15} /> {i.id} · {i.property}<small>{money(i.outstandingCents || i.nominalAmountCents)}</small></CommandItem>)}
      </CommandGroup>
    </CommandList>
  </CommandDialog>;
}
