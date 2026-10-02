import type { StagingSyncTask, TaskDispatcher } from "./sync-task";
import type { ProbeTaskDispatcher, StagingAsyncProbeTask } from "./async-probe";

export interface CloudTasksConfiguration { readonly projectId: string; readonly location: string; readonly queue: string; readonly workerUrl: string; readonly taskServiceAccount: string; readonly workerAudience: string }
export interface AccessTokenProvider { get(): Promise<string> }

export class MetadataAccessTokenProvider implements AccessTokenProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async get(): Promise<string> { const response = await this.fetcher("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) }); if (!response.ok) throw new Error("METADATA_IDENTITY_UNAVAILABLE"); const body = await response.json() as { access_token?: unknown; expires_in?: unknown }; if (typeof body.access_token !== "string" || typeof body.expires_in !== "number" || body.expires_in <= 0) throw new Error("METADATA_IDENTITY_INVALID"); return body.access_token; }
}

export class CloudTasksSyncTaskDispatcher implements TaskDispatcher {
  constructor(private readonly configuration: CloudTasksConfiguration, private readonly tokens: AccessTokenProvider, private readonly fetcher: typeof fetch = fetch) {}
  async dispatch(task: StagingSyncTask): Promise<void> {
    const token = await this.tokens.get(); const parent = `projects/${this.configuration.projectId}/locations/${this.configuration.location}/queues/${this.configuration.queue}`;
    const response = await this.fetcher(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ task: { name: `${parent}/tasks/${task.name}`, httpRequest: { httpMethod: "POST", url: `${this.configuration.workerUrl.replace(/\/$/, "")}/internal/tasks/sync`, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ taskName: task.name })).toString("base64"), oidcToken: { serviceAccountEmail: this.configuration.taskServiceAccount, audience: this.configuration.workerAudience } } } }), signal: AbortSignal.timeout(10_000) });
    if (response.status === 409) return; if (!response.ok) throw new Error("CLOUD_TASK_DISPATCH_FAILED");
  }
}

// Dispatches only to /internal/tasks/probe with a {probeName} payload -- a
// structurally separate target path and body shape from the real sync
// dispatcher above, so a probe task can never be delivered to, or confused
// with, the real /internal/tasks/sync provider-execution route.
export class CloudTasksProbeDispatcher implements ProbeTaskDispatcher {
  constructor(private readonly configuration: CloudTasksConfiguration, private readonly tokens: AccessTokenProvider, private readonly fetcher: typeof fetch = fetch) {}
  async dispatch(task: StagingAsyncProbeTask): Promise<void> {
    const token = await this.tokens.get(); const parent = `projects/${this.configuration.projectId}/locations/${this.configuration.location}/queues/${this.configuration.queue}`;
    const response = await this.fetcher(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ task: { name: `${parent}/tasks/${task.name}`, httpRequest: { httpMethod: "POST", url: `${this.configuration.workerUrl.replace(/\/$/, "")}/internal/tasks/probe`, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ probeName: task.name })).toString("base64"), oidcToken: { serviceAccountEmail: this.configuration.taskServiceAccount, audience: this.configuration.workerAudience } } } }), signal: AbortSignal.timeout(10_000) });
    if (response.status === 409) return; if (!response.ok) throw new Error("CLOUD_TASK_DISPATCH_FAILED");
  }
}

export function cloudTasksConfiguration(source: Record<string, string | undefined>): CloudTasksConfiguration {
  const required = (name: string) => { const value = source[name]?.trim(); if (!value) throw new Error(`STAGING_${name}_REQUIRED`); return value; };
  const workerUrl = required("RECOVERIA_WORKER_URL"); const workerAudience = required("RECOVERIA_WORKER_AUDIENCE"); if (!workerUrl.startsWith("https://") || workerUrl !== workerAudience) throw new Error("STAGING_WORKER_AUDIENCE_INVALID");
  return { projectId: required("RECOVERIA_GOOGLE_PROJECT_ID"), location: required("RECOVERIA_TASK_LOCATION"), queue: required("RECOVERIA_TASK_QUEUE"), workerUrl, workerAudience, taskServiceAccount: required("RECOVERIA_TASK_SERVICE_ACCOUNT") };
}
