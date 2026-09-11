import { deepFreeze } from "@/lib/domain/evidence";
import type { AdministrationContactRelationship, CollectionContactResolution, ContactEligibilityCandidate, ContactRelationshipContext, ContactScopedCase } from "./types";

const unique = (values: readonly string[]) => [...new Set(values)].sort();
const validOn = (relationship: AdministrationContactRelationship, asOf: string) => {
  const date = asOf.slice(0, 10);
  return (!relationship.validFrom || relationship.validFrom <= date) && (!relationship.validUntil || date <= relationship.validUntil);
};

function validateContext(collectionCase: ContactScopedCase, context: ContactRelationshipContext): void {
  if (collectionCase.organizationId !== context.organizationId || collectionCase.buildingId !== context.buildingId) throw new Error("Cross-tenant or cross-building contact resolution rejected");
  if (collectionCase.administrationId !== context.administrationId) throw new Error("Case administration must be explicit; liability cannot be inferred from a current building assignment");
  const tenantObjects = [...context.contacts, ...context.channels, ...context.relationships];
  if (tenantObjects.some(item => item.organizationId !== context.organizationId)) throw new Error("Cross-tenant contact data rejected");
  for (const records of [context.contacts, context.channels, context.relationships]) {
    if (new Set(records.map(item => item.id)).size !== records.length) throw new Error("Duplicate contact-domain identity rejected");
  }
  const contactIds = new Set(context.contacts.map(contact => contact.id));
  if (context.channels.some(channel => !contactIds.has(channel.contactId)) || context.relationships.some(relationship => !contactIds.has(relationship.contactId))) throw new Error("Contact relationship references an unknown tenant contact");
  for (const item of tenantObjects) if (!item.evidenceRefs.length) throw new Error("Contact domain facts require provenance evidence");
  for (const relationship of context.relationships) {
    if (relationship.scope === "BUILDING_SPECIFIC" && !relationship.buildingIds.length) throw new Error("Building-specific relationship requires explicit building scope");
    if (relationship.scope === "ADMINISTRATION_WIDE" && relationship.buildingIds.length) throw new Error("Administration-wide relationship cannot embed building scope");
    if (relationship.validFrom && relationship.validUntil && relationship.validUntil < relationship.validFrom) throw new Error("Invalid contact relationship validity interval");
    if (relationship.supersedesRelationshipId) {
      const prior = context.relationships.find(item => item.id === relationship.supersedesRelationshipId);
      if (!prior) throw new Error("Relationship correction must reference existing history");
      if (prior.organizationId !== relationship.organizationId || prior.administrationId !== relationship.administrationId) throw new Error("Relationship correction cannot cross tenant or administration");
      if (context.relationships.filter(item => item.supersedesRelationshipId === prior.id).length > 1) throw new Error("Forked relationship supersession rejected");
    }
  }
}

export function effectiveContactRelationships(history: readonly AdministrationContactRelationship[]): readonly AdministrationContactRelationship[] {
  const superseded = new Set(history.map(item => item.supersedesRelationshipId).filter((id): id is string => Boolean(id)));
  return history.filter(item => !superseded.has(item.id) && item.status !== "SUPERSEDED");
}

export function appendContactRelationship(history: readonly AdministrationContactRelationship[], relationship: AdministrationContactRelationship): readonly AdministrationContactRelationship[] {
  if (history.some(item => item.id === relationship.id)) throw new Error("Duplicate contact relationship rejected");
  if (relationship.supersedesRelationshipId) {
    const prior = history.find(item => item.id === relationship.supersedesRelationshipId);
    if (!prior) throw new Error("Relationship correction must reference existing history");
    if (prior.organizationId !== relationship.organizationId || prior.administrationId !== relationship.administrationId) throw new Error("Relationship correction cannot cross tenant or administration");
    if (history.some(item => item.supersedesRelationshipId === prior.id)) throw new Error("Forked relationship supersession rejected");
  }
  return Object.freeze([...history, deepFreeze({ ...relationship, buildingIds: [...relationship.buildingIds], evidenceRefs: [...relationship.evidenceRefs] })]);
}

export function resolveCollectionContacts(collectionCase: ContactScopedCase, context: ContactRelationshipContext): CollectionContactResolution {
  validateContext(collectionCase, context);
  const contacts = new Map(context.contacts.map(contact => [contact.id, contact]));
  const channelsByContact = new Map<string, typeof context.channels>();
  for (const contact of context.contacts) channelsByContact.set(contact.id, context.channels.filter(channel => channel.contactId === contact.id));
  const evaluated: ContactEligibilityCandidate[] = [];
  for (const relationship of effectiveContactRelationships(context.relationships).filter(item => item.administrationId === context.administrationId)) {
    const contact = contacts.get(relationship.contactId)!;
    const allChannels = channelsByContact.get(contact.id) ?? [];
    const eligibleChannels = allChannels.filter(channel => channel.status === "CONFIRMED");
    const blockers: string[] = [];
    const scopeMatches = relationship.scope === "ADMINISTRATION_WIDE" || relationship.buildingIds.includes(context.buildingId);
    if (!scopeMatches) blockers.push("BUILDING_SCOPE_MISMATCH");
    if (!validOn(relationship, context.asOf)) blockers.push("RELATIONSHIP_OUTSIDE_VALIDITY");
    if (relationship.status === "INVALID" || relationship.status === "SUPERSEDED") blockers.push("RELATIONSHIP_NOT_VALID");
    if (relationship.status === "CONFLICTING" || relationship.roleStatus === "CONFLICTING" || contact.status === "CONFLICTING") blockers.push("CONFLICTING_EVIDENCE");
    if (contact.status === "UNVERIFIED") blockers.push("IDENTITY_UNVERIFIED");
    if (relationship.status === "UNVERIFIED" || relationship.roleStatus === "UNVERIFIED") blockers.push("RELATIONSHIP_UNVERIFIED");
    if (!eligibleChannels.length) blockers.push(allChannels.some(channel => channel.status === "STALE") ? "CHANNEL_STALE" : allChannels.some(channel => channel.status === "UNVERIFIED") ? "CHANNEL_UNVERIFIED" : allChannels.some(channel => channel.status === "INVALID") ? "CHANNEL_INVALID" : "NO_VALID_CHANNEL");
    const hardBlockers = new Set(["BUILDING_SCOPE_MISMATCH", "RELATIONSHIP_OUTSIDE_VALIDITY", "RELATIONSHIP_NOT_VALID", "CHANNEL_INVALID", "NO_VALID_CHANNEL"]);
    const disposition = blockers.some(blocker => hardBlockers.has(blocker)) ? "INELIGIBLE" : blockers.length ? "REVIEW_REQUIRED" : "READY";
    evaluated.push(deepFreeze({ contact, role: relationship.role, relationshipId: relationship.id, relationshipStatus: relationship.status, scope: relationship.scope, buildingIds: [...relationship.buildingIds], eligibleChannels, disposition, blockers: unique(blockers), evidenceRefs: unique([...contact.evidenceRefs, ...allChannels.flatMap(channel => channel.evidenceRefs), ...relationship.evidenceRefs]) }));
  }
  evaluated.sort((a, b) => a.contact.displayName.localeCompare(b.contact.displayName) || a.relationshipId.localeCompare(b.relationshipId));
  const result = { organizationId: context.organizationId, caseId: collectionCase.id, buildingId: context.buildingId, administrationId: collectionCase.administrationId, readyContacts: evaluated.filter(item => item.disposition === "READY"), reviewRequiredContacts: evaluated.filter(item => item.disposition === "REVIEW_REQUIRED"), ineligibleContacts: evaluated.filter(item => item.disposition === "INELIGIBLE"), blockers: unique(evaluated.length ? evaluated.flatMap(item => item.blockers) : ["NO_CONTACT_RELATIONSHIP"]) };
  return deepFreeze(result);
}
