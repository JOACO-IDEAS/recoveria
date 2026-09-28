import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";

const coreDirectory = process.cwd();
const visualDirectory = resolve(coreDirectory, "../RecoverIA-V2-Deploy/recoveria-vercel");
const databaseReference = resolve(coreDirectory, ".private/synthetic-pilot/neon-recoveria-pilot-url");

async function main() {
  await access(resolve(visualDirectory, "package.json"));
  const databaseUrl = (await readFile(databaseReference, "utf8")).trim();
  if (!databaseUrl) throw new Error("PILOT_DATABASE_NOT_CONFIGURED");

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const result = await pool.query<{ organizationId: string; sourceType: string; sourceId: string; connectionId: string }>('SELECT "organizationId", "sourceType", "sourceId", "connectionId" FROM "DriveSourceCheckpoint"');
  await pool.end();
  if (result.rows.length !== 1 || result.rows[0]?.sourceType !== "GOOGLE_DRIVE") throw new Error("PRODUCT_SURFACE_CHECKPOINT_BOUNDARY_AMBIGUOUS");

  const boundary = result.rows[0]; const token = randomBytes(32).toString("base64url");
  const core = spawn("npm", ["run", "start", "--", "-p", "3100"], { cwd: coreDirectory, stdio: "inherit", env: { ...process.env, RECOVERIA_PRODUCT_SURFACE_DATABASE_URL: databaseUrl, RECOVERIA_PRODUCT_SURFACE_API_TOKEN: token, RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID: boundary.organizationId, RECOVERIA_PRODUCT_SURFACE_SOURCE_ID: boundary.sourceId, RECOVERIA_PRODUCT_SURFACE_CONNECTION_ID: boundary.connectionId } });
  const visual = spawn("pnpm", ["exec", "next", "dev", "-p", "3101"], { cwd: visualDirectory, stdio: "inherit", env: { ...process.env, RECOVERIA_CORE_PRODUCT_SURFACE_URL: "http://127.0.0.1:3100", RECOVERIA_CORE_PRODUCT_SURFACE_TOKEN: token } });
  const stop = () => { core.kill("SIGTERM"); visual.kill("SIGTERM"); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  await Promise.race([new Promise((done) => core.on("exit", done)), new Promise((done) => visual.on("exit", done))]);
  stop();
}

void main();
