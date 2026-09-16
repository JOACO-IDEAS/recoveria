import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { InMemoryCommunicationExecutionStore, PrismaCommunicationExecutionStore } from "@/modules/communication-execution";
import { CONTROLLED_SMOKE, ControlledSmokeDryRunProvider, assertControlledSmokeCliArguments, controlledSmokeConfigurationFromEnvironment, controlledSmokeDryRunOperatorReport, createRealSmokeProvider, runControlledEmailSmokeTest } from "@/modules/controlled-email-smoke";

async function main(): Promise<void> {
  assertControlledSmokeCliArguments(process.argv.slice(2));
  const configuration = controlledSmokeConfigurationFromEnvironment(process.env);
  let prisma: PrismaClient | undefined;
  try {
    if (configuration.mode === "DRY_RUN") {
      const provider = new ControlledSmokeDryRunProvider();
      const { result } = await runControlledEmailSmokeTest({ configuration, store: new InMemoryCommunicationExecutionStore(), provider });
      console.log(JSON.stringify(controlledSmokeDryRunOperatorReport(result)));
    } else {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: configuration.smokeDatabaseUrl!, max: 2 }) });
      const existingOrganization = await prisma.organization.findUnique({ where: { id: CONTROLLED_SMOKE.organizationId } });
      if (existingOrganization && existingOrganization.name !== CONTROLLED_SMOKE.organizationName) throw new Error("Synthetic smoke organization identifier collides with non-smoke data");
      if (!existingOrganization) await prisma.organization.create({ data: { id: CONTROLLED_SMOKE.organizationId, name: CONTROLLED_SMOKE.organizationName } });
      const existingCase = await prisma.collectionCase.findUnique({ where: { id: CONTROLLED_SMOKE.caseId } });
      if (existingCase && (existingCase.organizationId !== CONTROLLED_SMOKE.organizationId || existingCase.currency !== "ARS")) throw new Error("Synthetic smoke case identifier collides with non-smoke data");
      if (!existingCase) await prisma.collectionCase.create({ data: { id: CONTROLLED_SMOKE.caseId, organizationId: CONTROLLED_SMOKE.organizationId, currency: "ARS", status: "OPEN", openedAt: new Date(CONTROLLED_SMOKE.asOf) } });
      const { result } = await runControlledEmailSmokeTest({ configuration, store: new PrismaCommunicationExecutionStore(prisma), provider: createRealSmokeProvider(configuration) });
      const sanitizedOutcome = result.kind === "OUTCOME_RECORDED" && result.outcome.status === "UNKNOWN" ? "UNKNOWN — reconciliation required" : result.kind;
      console.log(JSON.stringify({ mode: "REAL", result: sanitizedOutcome, automaticRetry: false }));
    }
  } finally {
    await prisma?.$disconnect();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Controlled smoke command failed");
  process.exitCode = 1;
});
