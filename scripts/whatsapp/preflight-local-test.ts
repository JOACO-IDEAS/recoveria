import "dotenv/config";
import { assertLocalWhatsAppActivationEnvironment, WHATSAPP_ACTIVATION_DATABASE_NAME, WHATSAPP_ACTIVATION_ORGANIZATION_ID } from "../../src/modules/whatsapp-intelligence/activation-environment";

const runtimeUrl = assertLocalWhatsAppActivationEnvironment();
const migrationRaw = process.env.DATABASE_URL?.trim();
if (!migrationRaw) throw new Error("DATABASE_URL_NOT_CONFIGURED");
let migrationUrl: URL;
try { migrationUrl = new URL(migrationRaw); } catch { throw new Error("DATABASE_URL_INVALID"); }
if (migrationUrl.toString() !== runtimeUrl.toString()) throw new Error("WHATSAPP_ACTIVATION_DATABASE_URL_MISMATCH");
if (process.env.WHATSAPP_CONNECTOR_ENABLED !== "true") throw new Error("WHATSAPP_CONNECTOR_DISABLED");
console.log(JSON.stringify({ ok: true, databaseHost: runtimeUrl.hostname, databaseName: WHATSAPP_ACTIVATION_DATABASE_NAME, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, provider: "mock", connectorEnabled: true }));
