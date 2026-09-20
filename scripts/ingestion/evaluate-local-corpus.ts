import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { CorpusProcessor } from "../../src/modules/ingestion/corpus-processor";
import { DeterministicDocumentUnderstandingProvider } from "../../src/modules/ingestion/document-understanding-provider";
import { LocalFolderSource } from "../../src/modules/ingestion/local-folder-source";

const repositoryRoot = path.resolve(process.cwd());
const privateRoot = path.join(repositoryRoot, ".private", "client-zero");
const authorizedInvoiceRoot = path.join(privateRoot, "invoices");
const authorizedAnalysisRoot = path.join(privateRoot, "analysis");

const within = (candidate: string, root: string): boolean => candidate === root || candidate.startsWith(`${root}${path.sep}`);

async function main(): Promise<void> {
  const [inputArgument, outputArgument] = process.argv.slice(2);
  if (!inputArgument || !outputArgument) throw new Error("Usage: evaluate-local-corpus <private-input-directory> <private-output-json>");
  const inputDirectory = await realpath(path.resolve(inputArgument));
  const outputPath = path.resolve(outputArgument);
  if (!within(inputDirectory, authorizedInvoiceRoot) || !within(outputPath, authorizedAnalysisRoot)) throw new Error("PRIVATE_EVALUATION_BOUNDARY_REJECTED");
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const source = await LocalFolderSource.create("private-local-evaluation-only", "authorized-private-local-corpus", inputDirectory);
  const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(source);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify(report.summary)}\n`);
}

void main();

