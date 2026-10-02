import { createHash } from "node:crypto";

// Staging-only, no-provider async wiring proof. A probe carries no
// connectedSourceId/syncIntentId/executionId and has no path to the Drive
// provider: completing one is a pure durable-state transition, never a call
// into ConnectedSourceService/composeRealGoogleDrivePilot.
export type StagingProbeStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export interface StagingAsyncProbeTask { readonly organizationId: string; readonly probeId: string; readonly name: string; readonly status: StagingProbeStatus; readonly attempts: number; readonly failureCode?: string; readonly startedAt?: string }
export interface StagingAsyncProbeRepository { create(task: StagingAsyncProbeTask): Promise<{ created: boolean; task: StagingAsyncProbeTask }>; claim(name: string): Promise<{ claimed: boolean; task: StagingAsyncProbeTask } | null>; complete(name: string, status: "SUCCEEDED" | "FAILED", failureCode?: string): Promise<StagingAsyncProbeTask> }
export interface ProbeTaskDispatcher { dispatch(task: StagingAsyncProbeTask): Promise<void> }

export class InMemoryStagingAsyncProbeRepository implements StagingAsyncProbeRepository {
  readonly records = new Map<string, StagingAsyncProbeTask>();
  async create(task: StagingAsyncProbeTask) { const existing = this.records.get(task.name) ?? [...this.records.values()].find(item => item.organizationId === task.organizationId && item.probeId === task.probeId); if (existing) return { created: false, task: existing }; this.records.set(task.name, task); return { created: true, task }; }
  async claim(name: string) { const task = this.records.get(name); if (!task) return null; if (task.status !== "PENDING") return { claimed: false, task }; const claimed = { ...task, status: "RUNNING" as const, attempts: task.attempts + 1, startedAt: new Date().toISOString() }; this.records.set(name, claimed); return { claimed: true, task: claimed }; }
  async complete(name: string, status: "SUCCEEDED" | "FAILED", failureCode?: string) { const task = this.records.get(name); if (!task || task.status !== "RUNNING") throw new Error("STAGING_PROBE_STATE_CONFLICT"); const completed = { ...task, status, failureCode }; this.records.set(name, completed); return completed; }
}

export class FakeProbeDispatcher implements ProbeTaskDispatcher { readonly dispatched: StagingAsyncProbeTask[] = []; async dispatch(task: StagingAsyncProbeTask) { this.dispatched.push(task); } }
export const deterministicProbeName = (organizationId: string, probeId: string): string => `probe-${createHash("sha256").update(`${organizationId}\0${probeId}`).digest("hex").slice(0, 40)}`;

export class AsyncProbeCoordinator {
  constructor(private readonly tasks: StagingAsyncProbeRepository, private readonly dispatcher: ProbeTaskDispatcher) {}
  async accept(organizationId: string, probeId: string): Promise<StagingAsyncProbeTask> {
    const candidate: StagingAsyncProbeTask = { organizationId, probeId, name: deterministicProbeName(organizationId, probeId), status: "PENDING", attempts: 0 };
    const task = await this.tasks.create(candidate);
    if (task.created || task.task.status === "PENDING") await this.dispatcher.dispatch(task.task);
    return task.task;
  }
}

// deliver() never calls any provider/Drive execution path. Completing a
// probe is exactly "mark it SUCCEEDED" -- there is no injected execute
// callback here (unlike StagingSyncWorker), by design: the no-provider
// branch is structural, not a flag that could be misconfigured.
export class StagingAsyncProbeWorker {
  constructor(private readonly tasks: StagingAsyncProbeRepository) {}
  async deliver(name: string): Promise<StagingAsyncProbeTask> {
    const claim = await this.tasks.claim(name);
    if (!claim) throw new Error("STAGING_PROBE_NOT_FOUND");
    if (!claim.claimed) return claim.task;
    return this.tasks.complete(name, "SUCCEEDED");
  }
}
