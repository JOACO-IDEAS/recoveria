"use client";
import { useEffect } from "react";
import { Bell, CheckCheck, Clock3, FileText, Gavel, HandCoins } from "lucide-react";
import { useStore } from "@/lib/store";
import type { NotificationItem } from "@/lib/types";

const iconFor: Record<NotificationItem["kind"], React.ElementType> = { promesa_vencida: Clock3, pago_pendiente: HandCoins, disputa_nueva: Gavel, importacion_revision: FileText };

export function NotificationsPanel({ open, setOpen, onSelect }: { open: boolean; setOpen: (v: boolean) => void; onSelect: (n: NotificationItem) => void }) {
  const { state, dispatch } = useStore();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  if (!open) return null;
  const items = [...state.notifications].sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1) || b.createdAt.localeCompare(a.createdAt));
  return <>
    <div className="notif-backdrop" onClick={() => setOpen(false)} />
    <div className="notif-panel" role="menu" aria-label="Notificaciones">
      <div className="notif-head"><strong>Notificaciones</strong><button onClick={() => dispatch({ type: "MARK_ALL_NOTIFICATIONS_READ" })}><CheckCheck size={13} /> Marcar todas leídas</button></div>
      <div className="notif-list">
        {items.length === 0 && <div className="notif-empty">Sin notificaciones.</div>}
        {items.map((n) => { const Icon = iconFor[n.kind]; return <button key={n.id} className={"notif-item" + (n.read ? "" : " unread")} role="menuitem" onClick={() => { dispatch({ type: "MARK_NOTIFICATION_READ", id: n.id }); onSelect(n); setOpen(false); }}>
          <span className="notif-icon"><Icon size={15} /></span>
          <span className="notif-text"><strong>{n.label}</strong><span>{n.detail}</span></span>
          {!n.read && <i className="notif-dot" aria-hidden />}
        </button>; })}
      </div>
    </div>
  </>;
}

export function NotificationsBell({ onOpen }: { onOpen: () => void }) {
  const { state } = useStore();
  const unread = state.notifications.filter((n) => !n.read).length;
  return <button className="icon-btn" onClick={onOpen} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}><Bell size={18} />{unread > 0 && <em aria-hidden />}</button>;
}
