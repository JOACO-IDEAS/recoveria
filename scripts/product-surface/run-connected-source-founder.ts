import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const core = process.cwd();
const visual = resolve(core, "../RecoverIA-V2-Deploy/recoveria-vercel");
const privateDirectory = resolve(core, ".private/synthetic-pilot");
const readPrivate = async (name: string) => (await readFile(resolve(privateDirectory, name), "utf8")).trim();

async function main() {
  const databaseUrl = await readPrivate("neon-recoveria-pilot-url");
  const rootId = await readPrivate("drive-root-id.pending");
  const pickerKey = await readPrivate("google-picker-api-key");
  if (new URL(databaseUrl).pathname !== "/recoveria_pilot") throw new Error("FOUNDER_FLOW_DATABASE_TARGET_REJECTED");
  if (!/^[A-Za-z0-9_-]{10,}$/.test(rootId) || !pickerKey) throw new Error("FOUNDER_FLOW_PRIVATE_CONFIGURATION_INVALID");
  const cloudToken = spawnSync("gcloud", ["auth", "application-default", "print-access-token"], { encoding: "utf8" });
  if (cloudToken.status !== 0 || !cloudToken.stdout.trim()) throw new Error("FOUNDER_FLOW_ADC_UNAVAILABLE");
  const productSurfaceToken = randomBytes(32).toString("base64url");
  const environment = {
    ...process.env,
    CONNECTED_SOURCE_DATABASE_URL: databaseUrl,
    CONNECTED_SOURCE_APPROVED_ROOT_ID: rootId,
    CONNECTED_SOURCE_SOURCE_ID: rootId,
    CONNECTED_SOURCE_PICKER_API_KEY: pickerKey,
    CONNECTED_SOURCE_GOOGLE_APP_ID: "27126432407",
    CONNECTED_SOURCE_GOOGLE_CLOUD_ACCESS_TOKEN: cloudToken.stdout.trim(),
    CONNECTED_SOURCE_ORGANIZATION_ID: "recoveria-synthetic-pilot",
    CONNECTED_SOURCE_CONNECTION_ID: "google-drive-pilot",
    CONNECTED_SOURCE_GOOGLE_CLIENT_ID: "27126432407-945995r3f070v7nd05dprfm44b8dqtqr.apps.googleusercontent.com",
    CONNECTED_SOURCE_GOOGLE_CLIENT_SECRET_REFERENCE: "projects/recoveria-pilot/secrets/google-oauth-client-secret/versions/1",
    CONNECTED_SOURCE_CALLBACK_URL: "https://recoveria-pilot-runtime-72qfitymsq-rj.a.run.app/oauth/google/callback",
    CONNECTED_SOURCE_KMS_KEY_VERSION: "projects/recoveria-pilot/locations/southamerica-east1/keyRings/recoveria-pilot/cryptoKeys/oauth-refresh-token/cryptoKeyVersions/1",
    RECOVERIA_PRODUCT_SURFACE_DATABASE_URL: databaseUrl,
    RECOVERIA_PRODUCT_SURFACE_API_TOKEN: productSurfaceToken,
    RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID: "recoveria-synthetic-pilot",
    RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY: resolve(privateDirectory, "c5a-drive-corpus/invoices"),
  };
  const coreProcess = spawn("npm", ["run", "dev", "--", "-p", "3100"], { cwd: core, stdio: "inherit", env: environment });
  const visualProcess = spawn("pnpm", ["exec", "next", "dev", "-p", "3101"], { cwd: visual, stdio: "inherit", env: { ...process.env, RECOVERIA_CORE_PRODUCT_SURFACE_URL: "http://127.0.0.1:3100", RECOVERIA_CORE_PRODUCT_SURFACE_TOKEN: productSurfaceToken } });
  const stop = () => { coreProcess.kill("SIGTERM"); visualProcess.kill("SIGTERM"); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  await Promise.race([new Promise(done => coreProcess.on("exit", done)), new Promise(done => visualProcess.on("exit", done))]);
  stop();
}

void main();
