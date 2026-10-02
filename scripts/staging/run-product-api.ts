import { spawn } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaClient } from "@prisma/client";
import { validateStagingRuntimeConfiguration } from "../../src/modules/staging/runtime-config";

async function main(): Promise<void> {
  validateStagingRuntimeConfiguration(process.env, "PRODUCT_API");
  if (!process.env.PORT || !/^\d+$/.test(process.env.PORT)) throw new Error("STAGING_PORT_REQUIRED");
  const probe = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.RECOVERIA_DATABASE_URL!, max: 1 }) });
  const rows = await probe.$queryRawUnsafe<Array<{ database: string }>>("SELECT current_database() AS database");
  await probe.$disconnect();
  if (rows[0]?.database !== "recoveria_pilot") throw new Error("STAGING_DATABASE_BOUNDARY_REJECTED");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", process.env.PORT], { stdio: "inherit", env: process.env });
  const shutdown = (signal: NodeJS.Signals) => { child.kill(signal); };
  process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT"));
  child.on("exit", code => process.exit(code ?? 1));
}

void main().catch(() => { console.error(JSON.stringify({ event: "STAGING_PRODUCT_API_START_FAILED" })); process.exit(1); });
