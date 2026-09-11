import type { CollectionCase } from "@/modules/collections-engine";

export type ContactIdentityStatus = "CONFIRMED" | "UNVERIFIED" | "CONFLICTING";
export type ContactRole = "ADMINISTRATOR" | "PAYMENTS" | "ACCOUNTING" | "TREASURY" | "OPERATIONS" | "OWNER" | "ASSISTANT" | "GENERAL" | "OTHER";
export type ContactChannelType = "PHONE" | "WHATSAPP" | "EMAIL";
export type ContactChannelStatus = "UNVERIFIED" | "CONFIRMED" | "STALE" | "INVALID";
export type ContactRelationshipStatus = "UNVERIFIED" | "CONFIRMED" | "SUPERSEDED" | "INVALID" | "CONFLICTING";
export type ContactRelationshipScope = "ADMINISTRATION_WIDE" | "BUILDING_SPECIFIC";

export interface ContactIdentity {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly normalizedName?: string;
  readonly status: ContactIdentityStatus;
  readonly evidenceRefs: readonly string[];
}

export interface ContactChannel {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly type: ContactChannelType;
  readonly rawValue: string;
  readonly normalizedValue?: string;
  readonly status: ContactChannelStatus;
  readonly firstObservedAt?: string;
  readonly lastConfirmedAt?: string;
  readonly evidenceRefs: readonly string[];
}

export interface AdministrationContactRelationship {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly administrationId: string;
  readonly role: ContactRole;
  readonly roleStatus: "CONFIRMED" | "UNVERIFIED" | "CONFLICTING";
  readonly scope: ContactRelationshipScope;
  readonly buildingIds: readonly string[];
  readonly status: ContactRelationshipStatus;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly evidenceRefs: readonly string[];
  readonly supersedesRelationshipId?: string;
}

export interface ContactRelationshipContext {
  readonly organizationId: string;
  readonly buildingId: string;
  readonly administrationId: string;
  readonly asOf: string;
  readonly contacts: readonly ContactIdentity[];
  readonly channels: readonly ContactChannel[];
  readonly relationships: readonly AdministrationContactRelationship[];
}

export interface ContactEligibilityCandidate {
  readonly contact: ContactIdentity;
  readonly role: ContactRole;
  readonly relationshipId: string;
  readonly relationshipStatus: ContactRelationshipStatus;
  readonly scope: ContactRelationshipScope;
  readonly buildingIds: readonly string[];
  readonly channels: readonly ContactChannel[];
  readonly eligibleChannels: readonly ContactChannel[];
  readonly disposition: "READY" | "REVIEW_REQUIRED" | "INELIGIBLE";
  readonly blockers: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface CollectionContactResolution {
  readonly organizationId: string;
  readonly caseId: string;
  readonly buildingId: string;
  readonly administrationId?: string;
  readonly readyContacts: readonly ContactEligibilityCandidate[];
  readonly reviewRequiredContacts: readonly ContactEligibilityCandidate[];
  readonly ineligibleContacts: readonly ContactEligibilityCandidate[];
  readonly blockers: readonly string[];
}

export type ContactScopedCase = Pick<CollectionCase, "id" | "organizationId" | "buildingId" | "administrationId">;
