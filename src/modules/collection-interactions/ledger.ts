import { deepFreeze } from "@/lib/domain/evidence";
import type { CanonicalPromise, CollectionInteraction, InvoiceDispute, PaymentClaim } from "./types";

type AppendableFact = CollectionInteraction | CanonicalPromise | PaymentClaim | InvoiceDispute;

export function appendInteractionFact<T extends AppendableFact>(history: readonly T[], fact: T): readonly T[] {
  if (history.some(item => item.id === fact.id)) throw new Error("Duplicate interaction fact rejected");
  const immutable = deepFreeze({
    ...fact,
    evidenceRefs: [...fact.evidenceRefs],
    ...(fact && "actor" in fact ? { actor: { ...fact.actor }, relatedInvoiceIds: [...fact.relatedInvoiceIds] } : {}),
    ...(fact && "invoiceIds" in fact ? { invoiceIds: [...fact.invoiceIds] } : {}),
  }) as T;
  return Object.freeze([...history, immutable]);
}
