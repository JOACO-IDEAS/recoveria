import type { CallbackHttpRequest, CallbackHttpResponse } from "./google-drive-cloud-adapters";

export interface CloudRuntimeRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface CloudRuntimeResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" } as const;

export function createGoogleDriveCloudRuntime(input: {
  readonly callbackPath: string;
  readonly expectedDatabase: string;
  readonly databaseProbe: () => Promise<string>;
  readonly callbackHandler: (request: CallbackHttpRequest) => Promise<CallbackHttpResponse>;
}): (request: CloudRuntimeRequest) => Promise<CloudRuntimeResponse> {
  if (!input.callbackPath.startsWith("/") || input.callbackPath === "/health" || input.callbackPath.includes("?") || input.callbackPath.includes("#")) throw new Error("CLOUD_RUNTIME_CALLBACK_PATH_INVALID");
  if (!input.expectedDatabase) throw new Error("CLOUD_RUNTIME_DATABASE_IDENTITY_REQUIRED");
  return async request => {
    if (request.path === "/health") {
      if (request.method !== "GET") return { status: 404, headers: JSON_HEADERS, body: JSON.stringify({ status: "NOT_FOUND" }) };
      try {
        const database = await input.databaseProbe();
        if (database !== input.expectedDatabase) throw new Error("DATABASE_IDENTITY_MISMATCH");
        return { status: 200, headers: JSON_HEADERS, body: JSON.stringify({ status: "READY", oauth: "NOT_READY", drive: "DISABLED" }) };
      } catch {
        return { status: 503, headers: JSON_HEADERS, body: JSON.stringify({ status: "NOT_READY" }) };
      }
    }
    if (request.path === input.callbackPath) return input.callbackHandler(request);
    return { status: 404, headers: JSON_HEADERS, body: JSON.stringify({ status: "NOT_FOUND" }) };
  };
}

export function callbackQuery(searchParams: URLSearchParams): Readonly<Record<string, string | readonly string[] | undefined>> {
  const output: Record<string, string | readonly string[]> = {};
  for (const key of new Set(searchParams.keys())) { const values = searchParams.getAll(key); output[key] = values.length === 1 ? values[0]! : values; }
  return output;
}
