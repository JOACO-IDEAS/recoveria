import { createHash } from "node:crypto";
import type { ConnectedSourceSyncSummary } from "../connected-sources/product-contract";
import type { SyncIntentRecord, SyncIntentRepository } from "../connected-sources/service";

export type StagingTaskStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export interface StagingSyncTask { readonly organizationId: string; readonly connectedSourceId: string; readonly syncIntentId: string; readonly executionId: string; readonly name: string; readonly status: StagingTaskStatus; readonly attempts: number; readonly failureCode?: string }
export interface StagingSyncTaskRepository { create(task: StagingSyncTask): Promise<{ created: boolean; task: StagingSyncTask }>; claim(name: string): Promise<{ claimed: boolean; task: StagingSyncTask } | null>; complete(name: string, status: "SUCCEEDED" | "FAILED", failureCode?: string): Promise<StagingSyncTask> }
export interface TaskDispatcher { dispatch(task: StagingSyncTask): Promise<void> }

export class InMemoryStagingSyncTaskRepository implements StagingSyncTaskRepository {
  readonly records = new Map<string, StagingSyncTask>();
  async create(task: StagingSyncTask) { const existing = this.records.get(task.name) ?? [...this.records.values()].find(item => item.organizationId === task.organizationId && item.syncIntentId === task.syncIntentId); if (existing) return { created: false, task: existing }; this.records.set(task.name, task); return { created: true, task }; }
  async claim(name: string) { const task = this.records.get(name); if (!task) return null; if (task.status !== "PENDING") return { claimed: false, task }; const claimed = { ...task, status: "RUNNING" as const, attempts: task.attempts + 1 }; this.records.set(name, claimed); return { claimed: true, task: claimed }; }
  async complete(name: string, status: "SUCCEEDED" | "FAILED", failureCode?: string) { const task = this.records.get(name); if (!task || task.status !== "RUNNING") throw new Error("STAGING_TASK_STATE_CONFLICT"); const completed = { ...task, status, failureCode }; this.records.set(name, completed); return completed; }
}

export class FakeTaskDispatcher implements TaskDispatcher { readonly dispatched: StagingSyncTask[] = []; async dispatch(task: StagingSyncTask) { this.dispatched.push(task); } }
export const deterministicTaskName = (organizationId: string, syncIntentId: string): string => `sync-${createHash("sha256").update(`${organizationId}\0${syncIntentId}`).digest("hex").slice(0, 40)}`;

export class AsyncSyncCoordinator {
  constructor(private readonly intents: SyncIntentRepository, private readonly tasks: StagingSyncTaskRepository, private readonly dispatcher: TaskDispatcher) {}
  async accept(record: SyncIntentRecord): Promise<StagingSyncTask> {
    const claimed = await this.intents.claim(record);
    if (!claimed.created && (claimed.record.actorId !== record.actorId || claimed.record.sessionBindingHash !== record.sessionBindingHash || claimed.record.connectedSourceId !== record.connectedSourceId)) throw new Error("CONNECTED_SOURCE_SYNC_INTENT_BINDING_MISMATCH");
    const candidate: StagingSyncTask = { organizationId: record.organizationId, connectedSourceId: record.connectedSourceId, syncIntentId: record.syncIntentId, executionId: claimed.record.executionId, name: deterministicTaskName(record.organizationId, record.syncIntentId), status: "PENDING", attempts: 0 };
    const task = await this.tasks.create(candidate);
    if (task.created) await this.dispatcher.dispatch(task.task);
    return task.task;
  }
}

export class StagingSyncWorker {
  constructor(private readonly intents: SyncIntentRepository, private readonly tasks: StagingSyncTaskRepository, private readonly execute: (task: StagingSyncTask) => Promise<ConnectedSourceSyncSummary>) {}
  async deliver(name: string): Promise<StagingSyncTask> {
    const claim = await this.tasks.claim(name);
    if (!claim) throw new Error("STAGING_TASK_NOT_FOUND");
    if (!claim.claimed) return claim.task;
    try { const summary = await this.execute(claim.task); await this.intents.complete({ organizationId: claim.task.organizationId, connectedSourceId: claim.task.connectedSourceId, syncIntentId: claim.task.syncIntentId, status: "SUCCEEDED", summary }); return this.tasks.complete(name, "SUCCEEDED"); }
    catch (error) { const failureCode = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_SYNC_FAILED"; await this.intents.complete({ organizationId: claim.task.organizationId, connectedSourceId: claim.task.connectedSourceId, syncIntentId: claim.task.syncIntentId, status: "FAILED", failureCode }); return this.tasks.complete(name, "FAILED", failureCode); }
  }
}
