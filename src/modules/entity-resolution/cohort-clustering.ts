import { normalizeName } from "@/modules/ingestion/normalization";
import type { ProposalStatus, SourceEvidence } from "@/modules/ingestion/types";

// Phase 4.6B.1 — bottom-up customer identity clustering.
//
// entity-resolution/resolver.ts answers "does this signal match an existing
// catalog entity?" — it requires a catalog to already exist. Before any
// catalog exists for a brand-new document cohort, RecoverIA still needs to
// answer "which raw documents probably describe the same real-world
// customer?" without ever assuming a customer name is an Administration.
// This module answers only that narrower, catalog-free question. Promoting
// a cluster into an actual EntityRecord (of any EntityType, including
// ADMINISTRATION) is exclusively the job of the existing resolveEntity /
// DecisionEvent human-confirmation machinery — this module has no field
// through which it could express that promotion, by construction.
//
// The signal shape below is intentionally source-agnostic: a future
// CatedralAdapter or ContactImportAdapter can produce the same
// CustomerIdentitySignal[] shape and feed this same function, so evidence
// fusion across sources does not require a second clustering engine later.
export interface CustomerIdentitySignal {
  readonly sourceRef: string;
  readonly taxId: string | null;
  readonly normalizedName: string | null;
  readonly normalizedAddress: string | null;
  readonly evidence: readonly SourceEvidence[];
}

export interface IdentityClusterProposal {
  readonly clusterId: string;
  readonly status: ProposalStatus;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
  readonly taxId: string | null;
  readonly representativeName: string | null;
  readonly memberSourceRefs: readonly string[];
  readonly supportingSignals: readonly string[];
  readonly contradictingSignals: readonly string[];
  readonly reviewRequired: boolean;
  readonly evidence: readonly SourceEvidence[];
}

const mostCommon = (values: readonly (string | null)[]): string | null => {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const addressKey = (value: string): string => normalizeName(value);

export function proposeCustomerIdentityClusters(signals: readonly CustomerIdentitySignal[]): readonly IdentityClusterProposal[] {
  const clusters: IdentityClusterProposal[] = [];

  const byTaxId = new Map<string, CustomerIdentitySignal[]>();
  for (const signal of signals) if (signal.taxId) byTaxId.set(signal.taxId, [...(byTaxId.get(signal.taxId) ?? []), signal]);

  for (const [taxId, group] of byTaxId) {
    const names = [...new Set(group.map((s) => s.normalizedName).filter((v): v is string => Boolean(v)))];
    const addresses = [...new Set(group.map((s) => s.normalizedAddress).filter((v): v is string => Boolean(v)))];
    clusters.push({
      clusterId: `tax:${taxId}`,
      status: "PROPOSED",
      confidence: "HIGH",
      taxId,
      representativeName: mostCommon(group.map((s) => s.normalizedName)),
      memberSourceRefs: group.map((s) => s.sourceRef),
      supportingSignals: [`shared normalized tax id across ${group.length} source record(s)`],
      contradictingSignals: [],
      reviewRequired: names.length > 1 || addresses.length > 1,
      evidence: group.flatMap((s) => s.evidence),
    });
  }

  // Two different tax ids sharing the same displayed name AND address is a
  // real-world contradiction signal, not a merge instruction: flag both,
  // merge neither. (This is the "generic customer name" / "conflicting tax
  // identity" abstention case — a name match alone never reaches this path
  // because it requires an address match too.)
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const x = clusters[i]!, y = clusters[j]!;
      if (x.taxId === y.taxId || !x.representativeName || !y.representativeName) continue;
      if (normalizeName(x.representativeName) !== normalizeName(y.representativeName)) continue;
      const xAddresses = new Set(byTaxId.get(x.taxId!)!.map((s) => s.normalizedAddress).filter(Boolean).map((v) => addressKey(v!)));
      const yAddresses = new Set(byTaxId.get(y.taxId!)!.map((s) => s.normalizedAddress).filter(Boolean).map((v) => addressKey(v!)));
      const sharesAddress = [...xAddresses].some((a) => yAddresses.has(a));
      if (!sharesAddress) continue;
      clusters[i] = { ...x, status: "CONTRADICTED", contradictingSignals: [...x.contradictingSignals, `shares displayed name and address with a distinct tax id (${y.taxId})`], reviewRequired: true };
      clusters[j] = { ...y, status: "CONTRADICTED", contradictingSignals: [...y.contradictingSignals, `shares displayed name and address with a distinct tax id (${x.taxId})`], reviewRequired: true };
    }
  }

  const withoutTaxId = signals.filter((s) => !s.taxId);
  const stillUnattached: CustomerIdentitySignal[] = [];
  for (const signal of withoutTaxId) {
    if (!signal.normalizedAddress) { stillUnattached.push(signal); continue; }
    const key = addressKey(signal.normalizedAddress);
    const anchors = clusters.filter((c) => c.taxId && byTaxId.get(c.taxId)!.some((s) => s.normalizedAddress && addressKey(s.normalizedAddress) === key));
    if (anchors.length === 1) {
      const index = clusters.indexOf(anchors[0]!);
      clusters[index] = { ...clusters[index]!, memberSourceRefs: [...clusters[index]!.memberSourceRefs, signal.sourceRef], supportingSignals: [...clusters[index]!.supportingSignals, "additional record joined by address correlation only (no tax id)"], reviewRequired: true, evidence: [...clusters[index]!.evidence, ...signal.evidence] };
    } else if (anchors.length > 1) {
      clusters.push({ clusterId: `ambiguous-address:${signal.sourceRef}`, status: "AMBIGUOUS", confidence: "LOW", taxId: null, representativeName: signal.normalizedName, memberSourceRefs: [signal.sourceRef], supportingSignals: ["address matches more than one distinct tax-id cluster"], contradictingSignals: [], reviewRequired: true, evidence: signal.evidence });
    } else {
      stillUnattached.push(signal);
    }
  }

  const weakAddressGroups = new Map<string, CustomerIdentitySignal[]>();
  const truePlaceholders: CustomerIdentitySignal[] = [];
  for (const signal of stillUnattached) {
    if (signal.normalizedAddress) weakAddressGroups.set(addressKey(signal.normalizedAddress), [...(weakAddressGroups.get(addressKey(signal.normalizedAddress)) ?? []), signal]);
    else truePlaceholders.push(signal);
  }
  for (const group of weakAddressGroups.values()) {
    clusters.push({
      clusterId: `address:${group[0]!.sourceRef}`, status: "PROPOSED", confidence: "LOW", taxId: null,
      representativeName: mostCommon(group.map((s) => s.normalizedName)), memberSourceRefs: group.map((s) => s.sourceRef),
      supportingSignals: ["shared normalized address only; no tax id available to confirm identity"], contradictingSignals: [], reviewRequired: true,
      evidence: group.flatMap((s) => s.evidence),
    });
  }

  // Deliberate abstention: a bare name, or nothing at all, never clusters
  // with anything else. Each stays its own unresolved placeholder.
  for (const signal of truePlaceholders) {
    clusters.push({ clusterId: `unknown:${signal.sourceRef}`, status: "UNKNOWN", confidence: "LOW", taxId: null, representativeName: signal.normalizedName, memberSourceRefs: [signal.sourceRef], supportingSignals: [], contradictingSignals: [], reviewRequired: true, evidence: signal.evidence });
  }

  return clusters;
}
