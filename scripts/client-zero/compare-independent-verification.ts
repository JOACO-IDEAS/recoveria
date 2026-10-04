import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareIndependentVerification } from "../../src/modules/client-zero/independent-comparison";
import type { IndependentVerificationArtifact } from "../../src/modules/client-zero/independent-verification-types";
import type { DocumentProposal } from "../../src/modules/client-zero/ground-truth-types";

const ANALYSIS_ROOT = path.resolve(process.cwd(), ".private", "client-zero", "analysis");
const PROPOSALS_PATH = path.join(ANALYSIS_ROOT, "phase-8b2-pipeline-proposals.json");
const OBSERVATIONS_PATH = path.join(ANALYSIS_ROOT, "phase-8b2a-independent-verification.json");
const OUTPUT_PATH = path.join(ANALYSIS_ROOT, "phase-8b2a-comparison.json");

async function main(): Promise<void> {
  // The observation artifact must already exist durably before proposals are
  // opened. This process never invokes the verifier.
  const observations = JSON.parse(await readFile(OBSERVATIONS_PATH, "utf8")) as IndependentVerificationArtifact;
  if (observations.schemaVersion !== 1 || observations.verifierContractVersion !== "phase-8b2a-v1") throw new Error("INDEPENDENT_OBSERVATION_ARTIFACT_INVALID");
  const proposals = JSON.parse(await readFile(PROPOSALS_PATH, "utf8")) as readonly DocumentProposal[];
  const artifact = compareIndependentVerification(proposals, observations.documents);
  const temporary = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, OUTPUT_PATH); await chmod(OUTPUT_PATH, 0o600);
  console.log(JSON.stringify({ documents: artifact.documents.length, totals: artifact.totals, servicePeriod: artifact.servicePeriod, output: ".private/client-zero/analysis/phase-8b2a-comparison.json" }));
}

void main();
