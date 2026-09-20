import { normalizeName } from "./normalization";
import type { CohortDocument } from "./document-relationships";

export interface RelationshipCandidatePlan {
  readonly pairs: readonly (readonly [number, number])[];
  readonly pairsBeforeBlocking: number;
  readonly pairsAfterBlocking: number;
  readonly reductionRatio: number;
  readonly fallbackAbstentions: number;
}

export function buildRelationshipCandidatePlan(documents: readonly CohortDocument[]): RelationshipCandidatePlan {
  const buckets = new Map<string, Set<number>>();
  const add = (key: string | null, index: number) => {
    if (!key) return;
    const bucket = buckets.get(key) ?? new Set<number>(); bucket.add(index); buckets.set(key, bucket);
  };
  let fallbackAbstentions = 0;
  documents.forEach(({ understanding }, index) => {
    const taxId = understanding.customerTaxId.normalized;
    const address = understanding.customerAddress.normalized ? normalizeName(understanding.customerAddress.normalized) : null;
    const name = understanding.customerName.normalized ? normalizeName(understanding.customerName.normalized) : null;
    add(taxId ? `customer-tax:${taxId}` : null, index);
    add(address ? `customer-address:${address}` : null, index);
    // Name is not merge evidence. It is included only because the existing
    // engine uses equal names to surface contradictory tax identifiers.
    add(name ? `customer-name-contradiction:${name}` : null, index);
    if (!taxId && !address && !name) fallbackAbstentions += 1;
  });
  const uniquePairs = new Map<string, readonly [number, number]>();
  for (const bucket of buckets.values()) {
    const indexes = [...bucket].sort((a, b) => a - b);
    for (let left = 0; left < indexes.length; left += 1) for (let right = left + 1; right < indexes.length; right += 1) {
      const pair = [indexes[left]!, indexes[right]!] as const; uniquePairs.set(`${pair[0]}:${pair[1]}`, pair);
    }
  }
  const pairs = [...uniquePairs.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pairsBeforeBlocking = documents.length * (documents.length - 1) / 2;
  return { pairs, pairsBeforeBlocking, pairsAfterBlocking: pairs.length, reductionRatio: pairsBeforeBlocking ? 1 - pairs.length / pairsBeforeBlocking : 0, fallbackAbstentions };
}

