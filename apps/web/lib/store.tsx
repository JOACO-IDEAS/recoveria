"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { seedState } from "./seed-data";
import type { AppState, CommunicationDraft, DisputeRecord, ImportRecord, PromiseRecord } from "./types";

const STORAGE_KEY = "recoveria-v2-demo-state";
const STORAGE_VERSION = 3;

type Action =
  | { type: "CONFIRM_INFO"; caseId: string }
  | { type: "REQUEST_REVIEW"; caseId: string }
  | { type: "REGISTER_PROMISE"; caseId: string; amountCents: number; promisedDate: string }
  | { type: "REGISTER_DISPUTE"; caseId: string; invoiceId: string; reason: string }
  | { type: "RESOLVE_DISPUTE"; caseId: string }
  | { type: "CONFIRM_PAYMENT"; caseId: string }
  | { type: "REJECT_PAYMENT_CLAIM"; caseId: string }
  | { type: "DISMISS_ASSOCIATION"; caseId: string }
  | { type: "MARK_PROMISE_FULFILLED"; caseId: string }
  | { type: "GENERATE_DRAFT"; caseId: string }
  | { type: "APPROVE_DRAFT"; draftId: string }
  | { type: "DISCARD_DRAFT"; draftId: string }
  | { type: "MARK_NOTIFICATION_READ"; id: string }
  | { type: "MARK_ALL_NOTIFICATIONS_READ" }
  | { type: "START_IMPORT"; fileName: string }
  | { type: "COMPLETE_IMPORT"; importId: string; itemsFound: number; itemsReview: number }
  | { type: "RESET_DEMO" };

let uid = 1000;
const nextId = (prefix: string) => `${prefix}-${(uid += 1)}`;

function addTimeline(state: AppState, caseId: string, label: string, detail?: string, kind: "decision" | "sistema" | "evento" = "decision"): AppState {
  return { ...state, timeline: [...state.timeline, { id: nextId("tl"), caseId, label, detail, occurredAt: new Date().toISOString(), kind }] };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "CONFIRM_INFO": {
      const cases = state.cases.map((c) => c.id === action.caseId ? { ...c, infoConfirmed: true } : c);
      return addTimeline({ ...state, cases }, action.caseId, "Información confirmada por el operador");
    }
    case "REQUEST_REVIEW": {
      const cases = state.cases.map((c) => c.id === action.caseId ? { ...c, reviewRequested: true } : c);
      return addTimeline({ ...state, cases }, action.caseId, "Se solicitó revisión adicional");
    }
    case "REGISTER_PROMISE": {
      const promise: PromiseRecord = { id: nextId("prom"), caseId: action.caseId, amountCents: action.amountCents, promisedDate: action.promisedDate, status: "vigente" };
      const cases = state.cases.map((c) => c.id === action.caseId ? { ...c, promiseId: promise.id } : c);
      return addTimeline({ ...state, cases, promises: [...state.promises, promise] }, action.caseId, "Promesa de pago registrada", `${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(action.amountCents / 100).replace("ARS", "$")} para el ${new Date(action.promisedDate).toLocaleDateString("es-AR")}`);
    }
    case "REGISTER_DISPUTE": {
      const dispute: DisputeRecord = { id: nextId("dis"), caseId: action.caseId, invoiceId: action.invoiceId, reason: action.reason, openedAt: new Date().toISOString(), status: "abierta" };
      const cases = state.cases.map((c) => c.id === action.caseId ? { ...c, disputeId: dispute.id } : c);
      const invoices = state.invoices.map((i) => i.id === action.invoiceId ? { ...i, status: "disputada" as const, disputeId: dispute.id } : i);
      const withDispute = addTimeline({ ...state, cases, invoices, disputes: [...state.disputes, dispute] }, action.caseId, "Disputa registrada", "Cobranza rutinaria pausada");
      return { ...withDispute, notifications: [...withDispute.notifications, { id: nextId("not"), kind: "disputa_nueva", label: "Nueva disputa", detail: reasonPreview(action.reason), refType: "case", refId: action.caseId, read: false, createdAt: new Date().toISOString() }] };
    }
    case "RESOLVE_DISPUTE": {
      const c = state.cases.find((x) => x.id === action.caseId);
      const disputes = state.disputes.map((d) => d.id === c?.disputeId ? { ...d, status: "resuelta" as const } : d);
      return addTimeline({ ...state, disputes }, action.caseId, "Disputa resuelta", "El seguimiento de rutina puede continuar");
    }
    case "CONFIRM_PAYMENT": {
      const c = state.cases.find((x) => x.id === action.caseId);
      const paymentClaims = state.paymentClaims.map((p) => p.id === c?.paymentClaimId ? { ...p, status: "confirmado" as const } : p);
      const invoiceIds = c?.invoiceIds ?? [];
      const invoices = state.invoices.map((i) => invoiceIds.includes(i.id) ? { ...i, status: "pagada" as const, outstandingCents: 0, paidAt: state.asOf.slice(0, 10) } : i);
      const cases = state.cases.map((x) => x.id === action.caseId ? { ...x, status: "resuelto" as const } : x);
      return addTimeline({ ...state, paymentClaims, invoices, cases }, action.caseId, "Pago confirmado", "Conciliado contra la evidencia bancaria informada");
    }
    case "REJECT_PAYMENT_CLAIM": {
      const c = state.cases.find((x) => x.id === action.caseId);
      const paymentClaims = state.paymentClaims.map((p) => p.id === c?.paymentClaimId ? { ...p, status: "rechazado" as const } : p);
      return addTimeline({ ...state, paymentClaims }, action.caseId, "Pago informado rechazado", "No se encontró respaldo bancario suficiente");
    }
    case "DISMISS_ASSOCIATION": {
      const cases = state.cases.map((c) => c.id === action.caseId ? { ...c, identityDismissed: true, status: "resuelto" as const } : c);
      return addTimeline({ ...state, cases }, action.caseId, "Asociación descartada", "El operador determinó que la propiedad no corresponde a esta administración");
    }
    case "MARK_PROMISE_FULFILLED": {
      const c = state.cases.find((x) => x.id === action.caseId);
      const promises = state.promises.map((p) => p.id === c?.promiseId ? { ...p, status: "cumplida" as const } : p);
      const promise = state.promises.find((p) => p.id === c?.promiseId);
      const existingClaim = c?.paymentClaimId ? state.paymentClaims.find((p) => p.id === c.paymentClaimId) : undefined;
      let paymentClaims = state.paymentClaims;
      let cases = state.cases;
      if (!existingClaim && promise) {
        const claim = { id: nextId("claim"), caseId: action.caseId, amountCents: promise.amountCents, claimedAt: new Date().toISOString(), method: "Confirmado por el cliente", status: "informado" as const };
        paymentClaims = [...state.paymentClaims, claim];
        cases = state.cases.map((x) => x.id === action.caseId ? { ...x, paymentClaimId: claim.id } : x);
      }
      return addTimeline({ ...state, promises, paymentClaims, cases }, action.caseId, "Promesa cumplida", "El cliente indicó haber realizado el pago; queda pendiente de validación bancaria");
    }
    case "GENERATE_DRAFT": {
      const c = state.cases.find((x) => x.id === action.caseId);
      if (!c) return state;
      const draft: CommunicationDraft = {
        id: nextId("draft"), caseId: action.caseId, channel: "email",
        subject: `Seguimiento de saldo pendiente — ${c.property}`,
        body: `Hola, te escribimos desde Recoveria en representación de la gestión de cobranzas de ${c.property}. Nuestros registros muestran un saldo pendiente relacionado con ${c.invoiceIds.join(", ")}. Si ya realizaste el pago, contanos para poder verificarlo. Si tenés alguna consulta, respondé este mensaje.`,
        status: "sugerido", createdAt: new Date().toISOString(),
      };
      return addTimeline({ ...state, drafts: [...state.drafts, draft] }, action.caseId, "Borrador de seguimiento generado", "Requiere aprobación humana antes de cualquier envío");
    }
    case "APPROVE_DRAFT": {
      const drafts = state.drafts.map((d) => d.id === action.draftId ? { ...d, status: "aprobado_simulacion" as const } : d);
      const draft = state.drafts.find((d) => d.id === action.draftId);
      return draft ? addTimeline({ ...state, drafts }, draft.caseId, "Seguimiento aprobado — simulación", "No se envió ningún mensaje real") : { ...state, drafts };
    }
    case "DISCARD_DRAFT": {
      const drafts = state.drafts.map((d) => d.id === action.draftId ? { ...d, status: "descartado" as const } : d);
      return { ...state, drafts };
    }
    case "MARK_NOTIFICATION_READ":
      return { ...state, notifications: state.notifications.map((n) => n.id === action.id ? { ...n, read: true } : n) };
    case "MARK_ALL_NOTIFICATIONS_READ":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };
    case "START_IMPORT": {
      const record: ImportRecord = { id: nextId("imp"), fileName: action.fileName, status: "procesando", itemsFound: 0, itemsReview: 0, createdAt: new Date().toISOString() };
      return { ...state, imports: [record, ...state.imports] };
    }
    case "COMPLETE_IMPORT": {
      const imports = state.imports.map((i) => i.id === action.importId ? { ...i, status: (action.itemsReview > 0 ? "revision" : "completada") as ImportRecord["status"], itemsFound: action.itemsFound, itemsReview: action.itemsReview } : i);
      const needsReview = action.itemsReview > 0;
      const notifications = needsReview ? [...state.notifications, { id: nextId("not"), kind: "importacion_revision" as const, label: "Importación requiere revisión", detail: `${action.itemsReview} elementos necesitan confirmación.`, refType: "import" as const, refId: action.importId, read: false, createdAt: new Date().toISOString() }] : state.notifications;
      return { ...state, imports, notifications };
    }
    case "RESET_DEMO":
      return seedState();
    default:
      return state;
  }
}

function reasonPreview(reason: string) { return reason.length > 70 ? `${reason.slice(0, 70)}…` : reason; }

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

function loadInitial(): AppState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as { version: number; state: AppState };
    if (parsed.version !== STORAGE_VERSION || !parsed.state) return seedState();
    return parsed.state;
  } catch {
    return seedState();
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state })); } catch { /* demo persistence is best-effort only */ }
  }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useResetDemo() {
  const { dispatch } = useStore();
  return useCallback(() => dispatch({ type: "RESET_DEMO" }), [dispatch]);
}
