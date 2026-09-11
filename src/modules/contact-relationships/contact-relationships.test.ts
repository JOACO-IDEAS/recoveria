import { describe, expect, it } from "vitest";
import { CONTACT_AS_OF, CONTACT_ORG, PHASE_5B2A_SCENARIOS, channelOf, contactCaseOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { appendContactRelationship, effectiveContactRelationships, resolveCollectionContacts } from ".";

describe("Phase 5B.2A contact relationship foundation", () => {
  it("returns a confirmed payments contact with confirmed WhatsApp as ready", () => {
    const result = resolveCollectionContacts(contactCaseOf(), PHASE_5B2A_SCENARIOS.confirmed);
    expect(result.readyContacts).toHaveLength(1);
    expect(result.readyContacts[0]).toMatchObject({ role: "PAYMENTS", scope: "ADMINISTRATION_WIDE", disposition: "READY" });
    expect(result.readyContacts[0].eligibleChannels[0].type).toBe("WHATSAPP");
  });

  it("represents multiple contacts and roles without choosing a primary", () => {
    const result = resolveCollectionContacts(contactCaseOf(), PHASE_5B2A_SCENARIOS.multipleContacts);
    expect(result.readyContacts.map(item => item.role).sort()).toEqual(["ACCOUNTING", "PAYMENTS"]);
  });

  it("applies administration-wide scope across buildings", () => {
    const context = { ...PHASE_5B2A_SCENARIOS.confirmed, buildingId: "building-b" };
    expect(resolveCollectionContacts(contactCaseOf({ buildingId: "building-b" }), context).readyContacts).toHaveLength(1);
  });

  it("restricts building-specific relationships to explicit buildings", () => {
    const contact = contactOf("scoped");
    const relationship = relationshipOf(contact.id, "rel-scoped", { scope: "BUILDING_SPECIFIC", buildingIds: ["building-a"] });
    const allowed = contactContextOf({ contacts: [contact], relationships: [relationship] });
    expect(resolveCollectionContacts(contactCaseOf(), allowed).readyContacts).toHaveLength(1);
    const denied = { ...allowed, buildingId: "building-b" };
    expect(resolveCollectionContacts(contactCaseOf({ buildingId: "building-b" }), denied).ineligibleContacts[0].blockers).toContain("BUILDING_SCOPE_MISMATCH");
  });

  it.each([
    ["stale", PHASE_5B2A_SCENARIOS.staleChannel, "REVIEW_REQUIRED", "CHANNEL_STALE"],
    ["invalid", PHASE_5B2A_SCENARIOS.invalidChannel, "INELIGIBLE", "CHANNEL_INVALID"],
    ["unverified", PHASE_5B2A_SCENARIOS.unverifiedRelationship, "REVIEW_REQUIRED", "RELATIONSHIP_UNVERIFIED"],
    ["conflicting", PHASE_5B2A_SCENARIOS.conflictingRelationship, "REVIEW_REQUIRED", "CONFLICTING_EVIDENCE"],
  ] as const)("handles %s contact truth safely", (_name, context, disposition, blocker) => {
    const result = resolveCollectionContacts(contactCaseOf(), context);
    const candidate = [...result.readyContacts, ...result.reviewRequiredContacts, ...result.ineligibleContacts][0];
    expect(candidate.disposition).toBe(disposition);
    expect(candidate.blockers).toContain(blocker);
  });

  it("preserves superseded history and uses only the new relationship", () => {
    const oldContact = contactOf("old");
    const nextContact = contactOf("new");
    const oldRelationship = relationshipOf(oldContact.id, "rel-old", { validUntil: "2026-08-31" });
    const nextRelationship = relationshipOf(nextContact.id, "rel-new", { supersedesRelationshipId: oldRelationship.id, validFrom: "2026-09-01" });
    const history = appendContactRelationship([oldRelationship], nextRelationship);
    expect(history).toHaveLength(2);
    expect(effectiveContactRelationships(history).map(item => item.id)).toEqual(["rel-new"]);
    const context = contactContextOf({ contacts: [oldContact, nextContact], channels: [channelOf(oldContact.id, "old-channel"), channelOf(nextContact.id, "new-channel")], relationships: history });
    expect(resolveCollectionContacts(contactCaseOf(), context).readyContacts.map(item => item.contact.id)).toEqual(["new"]);
  });

  it("uses explicit temporal validity without inventing staleness thresholds", () => {
    const contact = contactOf("historical");
    const relationship = relationshipOf(contact.id, "rel-historical", { validFrom: "2024-01-01", validUntil: "2024-12-31" });
    const context = contactContextOf({ asOf: "2024-06-01T00:00:00.000Z", contacts: [contact], relationships: [relationship] });
    expect(resolveCollectionContacts(contactCaseOf(), context).readyContacts).toHaveLength(1);
    const current = resolveCollectionContacts(contactCaseOf(), { ...context, asOf: CONTACT_AS_OF });
    expect(current.ineligibleContacts[0].blockers).toContain("RELATIONSHIP_OUTSIDE_VALIDITY");
  });

  it("supports one contact across multiple administrations in the same tenant", () => {
    const contact = contactOf("shared");
    const relationships = [relationshipOf(contact.id, "rel-a"), relationshipOf(contact.id, "rel-b", { administrationId: "adm-b" })];
    const base = contactContextOf({ contacts: [contact], relationships });
    expect(resolveCollectionContacts(contactCaseOf(), base).readyContacts).toHaveLength(1);
    expect(resolveCollectionContacts(contactCaseOf({ administrationId: "adm-b" }), { ...base, administrationId: "adm-b" }).readyContacts).toHaveLength(1);
  });

  it("never reassigns case responsibility from a building's current administration", () => {
    const oldContact = contactOf("old-administration");
    const context = contactContextOf({ contacts: [oldContact], relationships: [relationshipOf(oldContact.id, "rel-old-administration", { administrationId: "adm-a" })] });
    expect(resolveCollectionContacts(contactCaseOf({ administrationId: "adm-a" }), context).readyContacts[0].contact.id).toBe(oldContact.id);
    expect(() => resolveCollectionContacts(contactCaseOf({ administrationId: "adm-a" }), { ...context, administrationId: "adm-b" })).toThrow(/liability cannot be inferred/);
  });

  it("hard-rejects cross-tenant contacts, channels and relationships", () => {
    const foreign = "other-tenant";
    expect(() => resolveCollectionContacts(contactCaseOf(), contactContextOf({ contacts: [contactOf("foreign", { organizationId: foreign })] }))).toThrow(/Cross-tenant/);
    expect(() => resolveCollectionContacts(contactCaseOf(), contactContextOf({ channels: [channelOf("juan", "foreign-channel", { organizationId: foreign })] }))).toThrow(/Cross-tenant/);
    expect(() => resolveCollectionContacts(contactCaseOf(), contactContextOf({ relationships: [relationshipOf("juan", "foreign-rel", { organizationId: foreign })] }))).toThrow(/Cross-tenant/);
  });

  it("is deterministic, immutable, and independent of Date.now", () => {
    const input = PHASE_5B2A_SCENARIOS.multipleContacts;
    const before = structuredClone(input);
    const originalNow = Date.now;
    Date.now = () => { throw new Error("Date.now is forbidden"); };
    try {
      const first = resolveCollectionContacts(contactCaseOf(), input);
      const second = resolveCollectionContacts(contactCaseOf(), input);
      expect(first).toEqual(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(input).toEqual(before);
    } finally {
      Date.now = originalNow;
    }
  });

  it("does not create communication actions or infer debtor liability", () => {
    const result = resolveCollectionContacts(contactCaseOf(), PHASE_5B2A_SCENARIOS.confirmed);
    expect(JSON.stringify(result)).not.toMatch(/send|schedule|message|debtor/i);
    expect(result.administrationId).toBe("adm-a");
    expect(result.organizationId).toBe(CONTACT_ORG);
  });
});
