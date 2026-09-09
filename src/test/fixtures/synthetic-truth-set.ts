import { deepFreeze } from "@/lib/domain/evidence";
import type { CaseRecord, InvoiceRecord, LedgerEntryRecord, SyntheticTruthSet } from "@/lib/domain/types";

export const SYNTHETIC_AS_OF = "2026-09-01T00:00:00.000Z";
const ORG = "org-recoveria-synthetic";
const cents = (pesos: number) => pesos * 100;

const invoiceSpecs = [
  ["i01", "F-0001", "adm1", "b01", "2026-07-01", "2026-08-01", 100_000, "ISSUED"],
  ["i02", "F-0002", "adm1", "b01", "2026-08-15", "2026-09-15", 200_000, "ISSUED"],
  ["i03", "F-0003", "adm1", "b02", "2026-07-20", "2026-08-20", 150_000, "ISSUED"],
  ["i04", "F-0004", "adm2", "b03", "2026-06-15", "2026-07-15", 300_000, "ISSUED"],
  ["i05", "F-0005", "adm2", "b04", "2026-05-15", "2026-06-15", 400_000, "ISSUED"],
  ["i06", "F-0006", "adm3", "b05", "2026-03-01", "2026-04-01", 500_000, "ISSUED"],
  ["i07", "F-0007", "adm3", "b06", "2025-12-01", "2026-01-01", 600_000, "ISSUED"],
  ["i08", "F-0008", "adm4", "b07", "2025-07-01", "2025-08-01", 700_000, "ISSUED"],
  ["i09", "F-0009", "adm4", "b08", "2019-12-01", "2020-01-01", 800_000, "ISSUED"],
  ["i10", "F-0010", "adm2", "b03", "2026-05-01", "2026-06-01", 500_000, "ISSUED"],
  ["i11", "F-0011", "adm2", "b04", "2026-06-01", "2026-07-01", 250_000, "DISPUTED"],
  ["i12", "F-0012", "adm3", "b05", "2026-04-01", "2026-05-01", 350_000, "ISSUED"],
  ["i13", "F-0013", "adm3", "b06", "2026-02-01", "2026-03-01", 450_000, "ISSUED"],
  ["i14", "F-0014", "adm4", "b07", "2026-01-01", "2026-02-01", 550_000, "ISSUED"],
  ["i15", "F-0015", undefined, "b09", "2026-06-15", "2026-07-15", 180_000, "ISSUED"],
  ["i16", "F-0016", "adm5", "b10", "2026-07-01", "2026-08-01", 220_000, "ISSUED"],
  ["i17", "F-0017", "adm6", "b11", "2026-05-20", "2026-06-20", 275_000, "ISSUED"],
  ["i18", "F-0018", "adm6", "b12", "2026-04-20", "2026-05-20", 325_000, "ISSUED"],
  ["i19", "F-0019", "adm1", "b02", "2026-05-01", "2026-06-01", 110_000, "ISSUED"],
  ["i20", "F-0020", "adm2", "b03", "2026-04-01", "2026-05-01", 120_000, "ISSUED"],
  ["i21", "F-0021", "adm1", "b01", "2026-07-10", "2026-08-10", 130_000, "ISSUED"],
  ["i22", "F-0022", "adm1", "b02", "2026-06-10", "2026-07-10", 140_000, "ISSUED"],
  ["i23", "F-0023", "adm2", "b03", "2026-05-10", "2026-06-10", 150_000, "ISSUED"],
  ["i24", "F-0024", "adm2", "b04", "2026-04-10", "2026-05-10", 160_000, "ISSUED"],
  ["i25", "F-0025", "adm3", "b05", "2026-03-10", "2026-04-10", 170_000, "ISSUED"],
  ["i26", "F-0026", "adm3", "b06", "2026-02-10", "2026-03-10", 180_000, "ISSUED"],
  ["i27", "F-0027", "adm4", "b07", "2026-01-10", "2026-02-10", 190_000, "ISSUED"],
  ["i28", "F-0028", "adm4", "b08", "2025-12-10", "2026-01-10", 200_000, "ISSUED"],
  ["i29", "F-0029", "adm5", "b09", "2025-11-10", "2025-12-10", 210_000, "ISSUED"],
  ["i30", "F-0030", "adm6", "b12", "2025-10-10", "2025-11-10", 220_000, "ISSUED"],
] as const;

const invoices: InvoiceRecord[] = invoiceSpecs.map(([id, invoiceNumber, administrationId, buildingId, issued, due, pesos, state]) => ({
  id, organizationId: ORG, invoiceNumber, administrationId, buildingId,
  issuedAt: `${issued}T00:00:00.000Z`, dueAt: `${due}T00:00:00.000Z`,
  currency: "ARS", totalCents: cents(pesos), state, evidenceRef: `doc:${id}`,
}));

const entries: LedgerEntryRecord[] = invoices.flatMap((invoice) => [{
  id: `le-${invoice.id}-issued`, organizationId: ORG, invoiceId: invoice.id,
  type: "INVOICE_ISSUED" as const, amountCents: invoice.totalCents, currency: "ARS" as const,
  effectiveAt: invoice.issuedAt, evidenceRef: invoice.evidenceRef,
}]);

entries.push(
  { id: "le-i01-payment", organizationId: ORG, invoiceId: "i01", type: "PAYMENT", amountCents: -cents(100_000), currency: "ARS", effectiveAt: "2026-08-05T00:00:00.000Z", evidenceRef: "synthetic-payment:i01" },
  { id: "le-i10-payment", organizationId: ORG, invoiceId: "i10", type: "PAYMENT", amountCents: -cents(200_000), currency: "ARS", effectiveAt: "2026-07-01T00:00:00.000Z", evidenceRef: "synthetic-payment:i10" },
  { id: "le-i19-payment", organizationId: ORG, invoiceId: "i19", type: "PAYMENT", amountCents: -cents(110_000), currency: "ARS", effectiveAt: "2026-06-04T00:00:00.000Z", evidenceRef: "synthetic-payment:i19" },
  { id: "le-i20-payment", organizationId: ORG, invoiceId: "i20", type: "PAYMENT", amountCents: -cents(120_000), currency: "ARS", effectiveAt: "2026-05-03T00:00:00.000Z", evidenceRef: "synthetic-payment:i20" },
);

const caseEvents: Record<string, CaseRecord["events"]> = {
  b03: [{ id: "ev-partial", type: "PARTIAL_PAYMENT", occurredAt: "2026-07-01T00:00:00.000Z", evidenceRef: "synthetic-payment:i10" }],
  b04: [{ id: "ev-dispute", type: "INVOICE_DISPUTED", occurredAt: "2026-07-10T00:00:00.000Z", evidenceRef: "doc:i11" }],
  b05: [{ id: "ev-promise", type: "PROMISE_RECORDED", occurredAt: "2026-08-20T00:00:00.000Z", evidenceRef: "promise:p-open" }],
  b06: [{ id: "ev-missed", type: "PROMISE_MISSED", occurredAt: "2026-08-16T00:00:00.000Z", evidenceRef: "promise:p-missed" }],
  b07: [{ id: "ev-no-response", type: "NO_RESPONSE", occurredAt: "2026-08-10T00:00:00.000Z", evidenceRef: "synthetic-note:no-response" }],
};

const cases: CaseRecord[] = Array.from({ length: 12 }, (_, index) => {
  const buildingId = `b${String(index + 1).padStart(2, "0")}`;
  const related = invoices.filter((invoice) => invoice.buildingId === buildingId);
  return {
    id: `case-${buildingId}`, organizationId: ORG, buildingId,
    administrationId: related.find(({ administrationId }) => administrationId)?.administrationId,
    invoiceIds: related.map(({ id }) => id), currency: "ARS",
    events: caseEvents[buildingId] ?? [{ id: `ev-open-${buildingId}`, type: "CASE_OPENED", occurredAt: "2026-08-01T00:00:00.000Z", evidenceRef: `case:${buildingId}` }],
    promises: buildingId === "b05" ? [{ id: "p-open", amountCents: cents(350_000), promisedFor: "2026-09-10T00:00:00.000Z", status: "OPEN", evidenceRef: "synthetic-note:p-open" }]
      : buildingId === "b06" ? [{ id: "p-missed", amountCents: cents(450_000), promisedFor: "2026-08-15T00:00:00.000Z", status: "MISSED", evidenceRef: "synthetic-note:p-missed" }] : [],
  };
});

export const SYNTHETIC_TRUTH_SET: SyntheticTruthSet = deepFreeze({
  organization: { id: ORG, name: "Ascensores Horizonte S.A. (synthetic)" },
  parties: [
    { id: "issuer", organizationId: ORG, displayName: "Ascensores Horizonte S.A.", normalizedName: "ASCENSORES HORIZONTE SA", roles: ["ISSUER"] },
    ...["García", "Río", "Centro", "Norte", "Plaza", "Sur"].map((name, i) => ({ id: `adm${i + 1}`, organizationId: ORG, displayName: `Administración ${name} SRL`, normalizedName: `ADMINISTRACION ${name.toUpperCase()} SRL`, roles: ["ADMINISTRATION" as const] })),
  ],
  buildings: [
    "Consorcio Av. Rivadavia 4520", "Consorcio San Martín 210", "Consorcio Belgrano 1180", "Consorcio Av. Callao 830",
    "Consorcio Lavalle 990", "Consorcio Av. Pueyrredón 1420", "Consorcio Moreno 560", "Consorcio Av. Santa Fe 3200",
    "Consorcio Sarmiento 745", "Consorcio Av. Corrientes 2860", "Consorcio Independencia 410", "Consorcio Av. Cabildo 1650",
  ].map((displayName, i) => ({ id: `b${String(i + 1).padStart(2, "0")}`, organizationId: ORG, displayName, administrationId: `adm${Math.floor(i / 2) + 1}` })),
  contacts: [1, 2, 3, 4].map((i) => ({ id: `contact${i}`, organizationId: ORG, displayName: `Contacto administrativo ${i}`, administrationId: `adm${i}`, points: [{ type: "EMAIL" as const, value: `contacto${i}@example.invalid` }] })),
  invoices,
  ledgerEntries: entries,
  resolutionEvidence: [
    { id: "res-i15", organizationId: ORG, invoiceId: "i15", rawValue: "SIN ADMINISTRACION", normalizedCandidate: "", candidatePartyIds: [], status: "PENDING", evidenceRef: "doc:i15#administration" },
    { id: "res-i17", organizationId: ORG, invoiceId: "i17", rawValue: "ADM. SUR", normalizedCandidate: "ADMINISTRACION SUR", candidatePartyIds: ["adm6", "adm4"], status: "PENDING", evidenceRef: "doc:i17#administration" },
    { id: "res-i18", organizationId: ORG, invoiceId: "i18", rawValue: "SUR ADMINISTRACIONES", normalizedCandidate: "ADMINISTRACION SUR SRL", candidatePartyIds: ["adm6"], status: "PENDING", evidenceRef: "doc:i18#administration" },
  ],
  cases,
});
