import { spawn } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaClient } from "@prisma/client";
import { validateStagingRuntimeConfiguration } from "../../src/modules/staging/runtime-config";

let startupStage = "CONFIGURATION";

async function main(): Promise<void> {
  validateStagingRuntimeConfiguration(process.env, "PRODUCT_API");
  if (!process.env.PORT || !/^\d+$/.test(process.env.PORT)) throw new Error("STAGING_PORT_REQUIRED");
  startupStage = "DATABASE_PROBE";
  const probe = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.RECOVERIA_DATABASE_URL!, max: 1 }) });
  const rows = await probe.$queryRawUnsafe<Array<{ database: string }>>("SELECT current_database()::text AS database");
  await probe.$disconnect();
  if (rows[0]?.database !== "recoveria_pilot") throw new Error("STAGING_DATABASE_BOUNDARY_REJECTED");
  startupStage = "NEXT_START";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", process.env.PORT], { stdio: "inherit", env: process.env });
  const shutdown = (signal: NodeJS.Signals) => { child.kill(signal); };
  process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT"));
  child.on("exit", code => process.exit(code ?? 1));
}

void main().catch((error: unknown) => {
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value) ? value : undefined;
  console.error(JSON.stringify({ event: "STAGING_PRODUCT_API_START_FAILED", stage: startupStage, errorName: safe(candidate.name), errorCode: safe(candidate.code) }));
  process.exit(1);
});
