// Phase 8A: minimum Client Zero kill switch, required before any Phase 8B
// ingestion code is wired. Fails closed -- ingestion is disabled unless this
// flag is explicitly and exactly "true". Any future Client Zero task
// dispatcher (provider sync, async ingestion task, scheduled source
// activity) MUST call assertClientZeroIngestionAllowed() before enqueueing or
// executing any provider read. This never touches already-ingested rows --
// it only gates new work from starting.
export function assertClientZeroIngestionAllowed(source: Record<string, string | undefined>): void {
  if (source.RECOVERIA_CLIENT_ZERO_INGESTION_ENABLED !== "true") throw new Error("CLIENT_ZERO_INGESTION_DISABLED");
}

export function clientZeroIngestionEnabled(source: Record<string, string | undefined>): boolean {
  try { assertClientZeroIngestionAllowed(source); return true; } catch { return false; }
}
