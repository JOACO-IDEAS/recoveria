import type { AdministrationContactRelationship, ContactChannel, ContactIdentity, ContactRelationshipContext } from "@/modules/contact-relationships";
import type { CollectionCase } from "@/modules/collections-engine";

export const CONTACT_ORG = "org-recoveria-synthetic";
export const CONTACT_AS_OF = "2026-09-11T12:00:00.000Z";
const evidence = (id: string) => [`fixture:5b2a:${id}`];

export const contactOf = (id: string, overrides: Partial<ContactIdentity> = {}): ContactIdentity => ({ id, organizationId: CONTACT_ORG, displayName: `Contacto ${id}`, normalizedName: `contacto ${id}`, status: "CONFIRMED", evidenceRefs: evidence(id), ...overrides });
export const channelOf = (contactId: string, id: string, overrides: Partial<ContactChannel> = {}): ContactChannel => ({ id, organizationId: CONTACT_ORG, contactId, type: "WHATSAPP", rawValue: `+54 9 11 5555 ${id}`, normalizedValue: `+549115555${id}`, status: "CONFIRMED", firstObservedAt: "2026-01-01", lastConfirmedAt: "2026-09-01", evidenceRefs: evidence(id), ...overrides });
export const relationshipOf = (contactId: string, id: string, overrides: Partial<AdministrationContactRelationship> = {}): AdministrationContactRelationship => ({ id, organizationId: CONTACT_ORG, contactId, administrationId: "adm-a", role: "PAYMENTS", roleStatus: "CONFIRMED", scope: "ADMINISTRATION_WIDE", buildingIds: [], status: "CONFIRMED", validFrom: "2026-01-01", evidenceRefs: evidence(id), ...overrides });
export const contactCaseOf = (overrides: Partial<CollectionCase> = {}): CollectionCase => ({ id: "case-contact", organizationId: CONTACT_ORG, buildingId: "building-a", administrationId: "adm-a", invoiceIds: ["invoice-contact"], currency: "ARS", ...overrides });
export const contactContextOf = (overrides: Partial<ContactRelationshipContext> = {}): ContactRelationshipContext => {
  const contacts = overrides.contacts ?? [contactOf("juan")];
  return { organizationId: CONTACT_ORG, buildingId: "building-a", administrationId: "adm-a", asOf: CONTACT_AS_OF, contacts, channels: overrides.channels ?? contacts.map(contact => channelOf(contact.id, `channel-${contact.id}`)), relationships: overrides.relationships ?? contacts.map(contact => relationshipOf(contact.id, `relationship-${contact.id}`)), ...overrides };
};

const juan = contactOf("juan", { displayName: "Juan García" });
const maria = contactOf("maria", { displayName: "María López" });
export const PHASE_5B2A_SCENARIOS = {
  confirmed: contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "whatsapp-juan")], relationships: [relationshipOf(juan.id, "rel-juan")] }),
  multipleContacts: contactContextOf({ contacts: [juan, maria], channels: [channelOf(juan.id, "whatsapp-juan"), channelOf(maria.id, "email-maria", { type: "EMAIL", rawValue: "maria@example.invalid", normalizedValue: "maria@example.invalid" })], relationships: [relationshipOf(juan.id, "rel-juan"), relationshipOf(maria.id, "rel-maria", { role: "ACCOUNTING" })] }),
  staleChannel: contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "stale", { status: "STALE" })], relationships: [relationshipOf(juan.id, "rel-stale")] }),
  invalidChannel: contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "invalid", { status: "INVALID" })], relationships: [relationshipOf(juan.id, "rel-invalid")] }),
  unverifiedRelationship: contactContextOf({ contacts: [juan], relationships: [relationshipOf(juan.id, "rel-unverified", { status: "UNVERIFIED" })] }),
  conflictingRelationship: contactContextOf({ contacts: [juan], relationships: [relationshipOf(juan.id, "rel-conflict", { status: "CONFLICTING", evidenceRefs: ["fixture:5b2a:source-a", "fixture:5b2a:source-b"] })] }),
} as const;
