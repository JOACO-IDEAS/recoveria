import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { GOOGLE_DRIVE_READONLY_SCOPE } from "../../src/modules/ingestion/google-drive-pilot-infrastructure";

const required = (name: string): string => { const value = process.env[name]?.trim(); if (!value) throw new Error(`OAUTH_INIT_${name}_REQUIRED`); return value; };
const databaseUrl = required("DATABASE_URL");
const clientId = required("GOOGLE_CLIENT_ID");
const organizationId = required("ORGANIZATION_ID");
const operatorId = required("OPERATOR_ID");
const connectionId = required("CONNECTION_ID");
const callbackUrl = required("EXACT_CALLBACK_URL");
if (process.env.OPERATOR_CONFIRMED !== "true") throw new Error("OAUTH_INIT_OPERATOR_CONFIRMATION_REQUIRED");
const callback = new URL(callbackUrl);
if (callback.protocol !== "https:" || callback.search || callback.hash) throw new Error("OAUTH_INIT_CALLBACK_INVALID");

async function main(): Promise<void> {
 const pool = new Pool({ connectionString: databaseUrl, max: 1 });
 const client = await pool.connect();
 try {
  await client.query("BEGIN");
  const database = await client.query<{ name: string }>("SELECT current_database() AS name");
  if (database.rows[0]?.name !== "recoveria_pilot") throw new Error("OAUTH_INIT_DATABASE_IDENTITY_MISMATCH");
  const lifecycle = await client.query<{ state: string }>('SELECT state FROM "DriveConnectionState" WHERE "organizationId" = $1 AND "connectionId" = $2 FOR UPDATE', [organizationId, connectionId]);
  if (lifecycle.rows.length > 1 || (lifecycle.rows.length === 1 && !["DISCONNECTED", "REAUTHORIZATION_REQUIRED"].includes(lifecycle.rows[0]!.state))) throw new Error("OAUTH_INIT_LIFECYCLE_INVALID");
  const pending = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM "DriveOAuthState" WHERE "organizationId" = $1 AND "connectionId" = $2 AND "consumedAt" IS NULL AND "expiresAt" > NOW()', [organizationId, connectionId]);
  if (pending.rows[0]?.count !== "0") throw new Error("OAUTH_INIT_ACTIVE_STATE_EXISTS");
  const credentials = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM "DriveCredentialEnvelope" WHERE "organizationId" = $1 AND "connectionId" = $2', [organizationId, connectionId]);
  if (credentials.rows[0]?.count !== "0") throw new Error("OAUTH_INIT_CREDENTIAL_EXISTS");
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  await client.query('INSERT INTO "DriveOAuthState" ("stateHash", "nonceHash", "organizationId", "operatorId", "connectionId", "callbackUrl", "schemaVersion", "createdAt", "expiresAt") VALUES ($1,$1,$2,$3,$4,$5,1,NOW(),NOW() + INTERVAL \'10 minutes\')', [stateHash, organizationId, operatorId, connectionId, callbackUrl]);
  if (lifecycle.rows.length === 0) await client.query('INSERT INTO "DriveConnectionState" ("organizationId", "connectionId", state, revision, "updatedAt") VALUES ($1,$2,\'AUTHORIZATION_PENDING\',1,NOW())', [organizationId, connectionId]);
  else await client.query('UPDATE "DriveConnectionState" SET state = \'AUTHORIZATION_PENDING\', revision = revision + 1, "updatedAt" = NOW() WHERE "organizationId" = $1 AND "connectionId" = $2', [organizationId, connectionId]);
  await client.query("COMMIT");
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl, response_type: "code", access_type: "offline", prompt: "consent", scope: GOOGLE_DRIVE_READONLY_SCOPE, state }).toString();
  process.stdout.write(`${authorization.toString()}\n`);
 } catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  const code = error instanceof Error && /^OAUTH_INIT_[A-Z_]+$/.test(error.message) ? error.message : "OAUTH_INIT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
 } finally {
  client.release();
  await pool.end();
 }
}

void main();
