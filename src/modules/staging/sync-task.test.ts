import { describe, expect, it } from "vitest";
import { InMemorySyncIntentRepository, type SyncIntentRecord } from "../connected-sources/service";
import { AsyncSyncCoordinator, FakeTaskDispatcher, InMemoryStagingSyncTaskRepository, StagingSyncWorker } from "./sync-task";

const intent: SyncIntentRecord = { organizationId: "org", connectedSourceId: "source", syncIntentId: "intent", actorId: "founder", sessionBindingHash: "hash", executionId: "execution", status: "RUNNING" };
const summary = { documentsAnalyzed: 40, uniqueDocuments: 39, exactDuplicates: 1, possibleDuplicates: 0, detectedEntities: 0, reviewRequired: 147 };

describe("staging task boundary", () => {
  it("dispatches one task per durable intent and duplicate delivery reuses terminal truth", async () => {
    const intents = new InMemorySyncIntentRepository(); const tasks = new InMemoryStagingSyncTaskRepository(); const dispatcher = new FakeTaskDispatcher(); const coordinator = new AsyncSyncCoordinator(intents, tasks, dispatcher);
    const first = await coordinator.accept(intent); const replay = await coordinator.accept({ ...intent, executionId: "ignored" });
    expect(replay.name).toBe(first.name); expect(dispatcher.dispatched).toHaveLength(2); expect(tasks.records.size).toBe(1);
    let executions = 0; const worker = new StagingSyncWorker(intents, tasks, async () => { executions += 1; return summary; });
    expect((await worker.deliver(first.name)).status).toBe("SUCCEEDED"); expect((await worker.deliver(first.name)).status).toBe("SUCCEEDED"); expect(executions).toBe(1);
  });
  it("rejects cross-session replay", async () => { const coordinator = new AsyncSyncCoordinator(new InMemorySyncIntentRepository(), new InMemoryStagingSyncTaskRepository(), new FakeTaskDispatcher()); await coordinator.accept(intent); await expect(coordinator.accept({ ...intent, sessionBindingHash: "other" })).rejects.toThrow("BINDING_MISMATCH"); });
  it("recovers dispatch response loss with the same durable task and execution", async () => { const intents = new InMemorySyncIntentRepository(); const tasks = new InMemoryStagingSyncTaskRepository(); let attempts = 0; const coordinator = new AsyncSyncCoordinator(intents, tasks, { async dispatch() { attempts += 1; if (attempts === 1) throw new Error("RESPONSE_LOST"); } }); await expect(coordinator.accept(intent)).rejects.toThrow("RESPONSE_LOST"); await expect(coordinator.accept({ ...intent, executionId: "ignored" })).resolves.toMatchObject({ executionId: intent.executionId, status: "PENDING" }); expect(attempts).toBe(2); expect(tasks.records.size).toBe(1); });
});
