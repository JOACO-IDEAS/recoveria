export interface AgingBucketDefinition {
  readonly key: string;
  readonly minDaysOverdue: number;
  readonly maxDaysOverdue?: number;
}

export interface AgingPolicy {
  readonly key: string;
  readonly version: string;
  readonly buckets: readonly AgingBucketDefinition[];
  readonly legalReviewAfterDays: number;
}

export const DEFAULT_AGING_POLICY: AgingPolicy = Object.freeze({
  key: "recoveria-default",
  version: "1",
  legalReviewAfterDays: 1095,
  buckets: Object.freeze([
    { key: "CURRENT", minDaysOverdue: Number.MIN_SAFE_INTEGER, maxDaysOverdue: 0 },
    { key: "1-30", minDaysOverdue: 1, maxDaysOverdue: 30 },
    { key: "31-60", minDaysOverdue: 31, maxDaysOverdue: 60 },
    { key: "61-90", minDaysOverdue: 61, maxDaysOverdue: 90 },
    { key: "91-180", minDaysOverdue: 91, maxDaysOverdue: 180 },
    { key: "181-365", minDaysOverdue: 181, maxDaysOverdue: 365 },
    { key: "365+", minDaysOverdue: 366 },
  ]),
});

const DAY_MS = 86_400_000;

export function daysOverdue(dueAt: string, asOf: string): number {
  const due = Date.parse(dueAt);
  const date = Date.parse(asOf);
  if (!Number.isFinite(due) || !Number.isFinite(date)) throw new Error("Invalid aging date");
  return Math.floor((date - due) / DAY_MS);
}

export function agingBucket(days: number, policy: AgingPolicy = DEFAULT_AGING_POLICY): string {
  const bucket = policy.buckets.find(({ minDaysOverdue, maxDaysOverdue }) =>
    days >= minDaysOverdue && (maxDaysOverdue === undefined || days <= maxDaysOverdue));
  if (!bucket) throw new Error(`Aging policy ${policy.key}@${policy.version} does not cover ${days} days`);
  return bucket.key;
}

export function requiresLegalReview(days: number, policy: AgingPolicy = DEFAULT_AGING_POLICY): boolean {
  return days >= policy.legalReviewAfterDays;
}
