import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildSyntheticDrivePilotCorpus, syntheticDrivePilotManifest } from "../../src/test/fixtures/google-drive-synthetic-pilot-corpus";

const target = resolve(process.cwd(), ".private/synthetic-pilot/c5a-drive-corpus");
const invoices = resolve(target, "invoices");
if (!target.startsWith(resolve(process.cwd(), ".private/synthetic-pilot/") + "/")) throw new Error("SYNTHETIC_CORPUS_PRIVATE_BOUNDARY_INVALID");

async function main(): Promise<void> {
  const files = buildSyntheticDrivePilotCorpus();
  if (files.length !== 40) throw new Error("SYNTHETIC_CORPUS_SIZE_INVALID");
  await rm(target, { recursive: true, force: true });
  await mkdir(invoices, { recursive: true, mode: 0o700 });
  for (const file of files) await writeFile(resolve(invoices, file.fileName), file.bytes, { mode: 0o600 });
  await writeFile(resolve(target, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, syntheticOnly: true, files: syntheticDrivePilotManifest(files) }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: "SYNTHETIC_CORPUS_PREPARED", pdfCount: files.length, target: ".private/synthetic-pilot/c5a-drive-corpus/invoices" })}\n`);
}

void main().catch(() => { process.stderr.write("SYNTHETIC_CORPUS_PREPARATION_FAILED\n"); process.exitCode = 1; });
