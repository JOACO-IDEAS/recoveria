import { describe, expect, it } from "vitest";
import { AsyncProbeCoordinator, FakeProbeDispatcher, InMemoryStagingAsyncProbeRepository, StagingAsyncProbeWorker, deterministicProbeName } from "./async-probe";

describe("staging async probe boundary (no-provider)", () => {
  it("dispatches one task per durable probe and duplicate delivery reuses terminal truth", async () => {
    const tasks = new InMemoryStagingAsyncProbeRepository(); const dispatcher = new FakeProbeDispatcher(); const coordinator = new AsyncProbeCoordinator(tasks, dispatcher);
    const first = await coordinator.accept("org", "probe-intent"); const replay = await coordinator.accept("org", "probe-intent");
    expect(replay.name).toBe(first.name); expect(dispatcher.dispatched).toHaveLength(2); expect(tasks.records.size).toBe(1);
    const worker = new StagingAsyncProbeWorker(tasks);
    expect((await worker.deliver(first.name)).status).toBe("SUCCEEDED");
    expect((await worker.deliver(first.name)).status).toBe("SUCCEEDED"); // duplicate Cloud Tasks delivery after completion: safe, idempotent, no re-execution possible since there is nothing to execute
  });

  it("duplicate delivery while RUNNING does not double-claim (lease-style single winner)", async () => {
    const tasks = new InMemoryStagingAsyncProbeRepository(); const dispatcher = new FakeProbeDispatcher(); const coordinator = new AsyncProbeCoordinator(tasks, dispatcher);
    const task = await coordinator.accept("org", "probe-concurrent");
    const first = await tasks.claim(task.name); const second = await tasks.claim(task.name);
    expect(first?.claimed).toBe(true); expect(second?.claimed).toBe(false);
  });

  it("deterministic probe names are stable and namespaced distinctly from sync task names", () => {
    expect(deterministicProbeName("org", "probe-1")).toBe(deterministicProbeName("org", "probe-1"));
    expect(deterministicProbeName("org", "probe-1")).toMatch(/^probe-/);
    expect(deterministicProbeName("org", "probe-1")).not.toBe(deterministicProbeName("other-org", "probe-1"));
  });

  it("delivering an unknown probe name fails closed", async () => {
    const worker = new StagingAsyncProbeWorker(new InMemoryStagingAsyncProbeRepository());
    await expect(worker.deliver("probe-never-created")).rejects.toThrow("STAGING_PROBE_NOT_FOUND");
  });

  it("StagingAsyncProbeWorker exposes no execute/provider callback at all -- completing a probe cannot invoke any injected function, unlike StagingSyncWorker", () => {
    const worker = new StagingAsyncProbeWorker(new InMemoryStagingAsyncProbeRepository());
    expect(worker.deliver.length).toBe(1); // (name) only -- no execute parameter exists on the constructor or deliver()
    expect(StagingAsyncProbeWorker.length).toBe(1); // constructor takes only the repository, nothing else
  });
});
