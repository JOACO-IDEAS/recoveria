export type ImmutableEvidence<T> = Readonly<T>;

export interface Correction<T> {
  readonly id: string;
  readonly priorEvidenceId: string;
  readonly correctedValue: T;
  readonly correctedBy: string;
  readonly correctedAt: string;
  readonly reason: string;
}

export function appendCorrection<T>(history: readonly Correction<T>[], correction: Correction<T>): readonly Correction<T>[] {
  if (history.some(({ id }) => id === correction.id)) throw new Error("Duplicate correction rejected");
  return Object.freeze([...history, Object.freeze({ ...correction })]);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
