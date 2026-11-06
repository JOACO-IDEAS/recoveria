import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { assertLocalWhatsAppActivationEnvironment, WHATSAPP_ACTIVATION_ORGANIZATION_ID } from "../../src/modules/whatsapp-intelligence/activation-environment";

const ids = {
  issuer: "wa-test-issuer",
  debtor: "wa-test-debtor-lopez",
  invoice: "wa-test-invoice-4567",
  receivable: "wa-test-receivable-4567",
  case: "wa-test-case-lopez",
} as const;

async function main() {
  const databaseUrl = assertLocalWhatsAppActivationEnvironment().toString();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId || !/^\d{5,30}$/.test(phoneNumberId)) throw new Error("WHATSAPP_PHONE_NUMBER_ID_INVALID");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }) });
  try {
    const existingNumber = await client.whatsAppBusinessNumber.findUnique({ where: { phoneNumberId }, select: { organizationId: true } });
    if (existingNumber && existingNumber.organizationId !== WHATSAPP_ACTIVATION_ORGANIZATION_ID) throw new Error("WHATSAPP_PHONE_NUMBER_ALREADY_MAPPED");
    await client.$transaction(async tx => {
      await tx.organization.upsert({
        where: { id: WHATSAPP_ACTIVATION_ORGANIZATION_ID },
        create: { id: WHATSAPP_ACTIVATION_ORGANIZATION_ID, name: "Empresa ficticia Meta Test" },
        update: { name: "Empresa ficticia Meta Test" },
      });
      await tx.party.upsert({
        where: { id: ids.issuer },
        create: { id: ids.issuer, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, displayName: "RecoverIA Emisor Sintético", normalizedName: "recoveria emisor sintetico", roles: ["ISSUER"] },
        update: {},
      });
      await tx.party.upsert({
        where: { id: ids.debtor },
        create: { id: ids.debtor, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, displayName: "Administración López", normalizedName: "administracion lopez", roles: ["DEBTOR", "ADMINISTRATION"] },
        update: {},
      });
      await tx.invoice.upsert({
        where: { id: ids.invoice },
        create: { id: ids.invoice, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, issuerPartyId: ids.issuer, billedToPartyId: ids.debtor, invoiceNumber: "0001-00004567", issuedAt: new Date("2026-10-01T00:00:00.000Z"), dueAt: new Date("2026-10-31T00:00:00.000Z"), currency: "ARS", totalAmount: "850000.00" },
        update: {},
      });
      await tx.receivable.upsert({
        where: { invoiceId: ids.invoice },
        create: { id: ids.receivable, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, invoiceId: ids.invoice, currency: "ARS", openedAt: new Date("2026-10-01T00:00:00.000Z") },
        update: {},
      });
      await tx.collectionCase.upsert({
        where: { id: ids.case },
        create: { id: ids.case, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, partyId: ids.debtor, currency: "ARS", status: "OPEN", openedAt: new Date("2026-10-01T00:00:00.000Z") },
        update: {},
      });
      await tx.collectionCaseReceivable.upsert({
        where: { organizationId_caseId_receivableId: { organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, caseId: ids.case, receivableId: ids.receivable } },
        create: { organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, caseId: ids.case, receivableId: ids.receivable },
        update: {},
      });
      await tx.whatsAppBusinessNumber.upsert({
        where: { phoneNumberId },
        create: { organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, phoneNumberId, displayPhone: process.env.WHATSAPP_TEST_DISPLAY_PHONE?.trim() || "Meta official test number", retentionDays: 7, active: true },
        update: { active: true, retentionDays: 7 },
      });
    });
    console.log(JSON.stringify({ ok: true, organizationId: WHATSAPP_ACTIVATION_ORGANIZATION_ID, invoiceId: ids.invoice, invoiceNumber: "0001-00004567", phoneNumberMapped: true }));
  } finally { await client.$disconnect(); }
}

main().catch(error => {
  const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : "WHATSAPP_BOOTSTRAP_FAILED";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
