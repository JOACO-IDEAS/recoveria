import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { assertLocalWhatsAppActivationEnvironment, WHATSAPP_ACTIVATION_ORGANIZATION_ID } from "../../src/modules/whatsapp-intelligence/activation-environment";
import { readWhatsAppActivationSnapshot } from "../../src/modules/whatsapp-intelligence/activation-inspector";

async function main() {
  const databaseUrl = assertLocalWhatsAppActivationEnvironment().toString();
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }) });
  try {
    const snapshot = await readWhatsAppActivationSnapshot(client, WHATSAPP_ACTIVATION_ORGANIZATION_ID);
    if (!snapshot.message) throw new Error("WHATSAPP_ACTIVATION_MESSAGE_NOT_FOUND");
    if (snapshot.message.job?.status !== "SUCCEEDED") throw new Error("WHATSAPP_ACTIVATION_JOB_NOT_SUCCEEDED");
    if (snapshot.message.interpretation?.provider !== "mock") throw new Error("WHATSAPP_ACTIVATION_PROVIDER_MISMATCH");
    if (!snapshot.message.event?.invoiceIds.includes("wa-test-invoice-4567")) throw new Error("WHATSAPP_ACTIVATION_INVOICE_NOT_MATCHED");
    const latest = await client.whatsAppInboundMessage.findFirstOrThrow({ where: { organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const receivedAudits = await client.whatsAppAuditEvent.groupBy({ by: ["outcome"], where: { organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, action: "MESSAGE_RECEIVED", subjectId: latest.id }, _count: true });
    const auditCounts = Object.fromEntries(receivedAudits.map(item => [item.outcome, item._count]));
    if (process.env.WHATSAPP_EXPECT_DUPLICATE === "true" && !auditCounts.DUPLICATE) throw new Error("WHATSAPP_ACTIVATION_DUPLICATE_NOT_PROVEN");
    console.log(JSON.stringify({ ok: true, snapshot, receivedAudits: auditCounts }));
  } finally { await client.$disconnect(); }
}

main().catch(error => {
  const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : "WHATSAPP_ACTIVATION_VERIFICATION_FAILED";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
