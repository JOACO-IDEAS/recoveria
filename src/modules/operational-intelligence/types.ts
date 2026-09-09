export type AttentionType="REVIEW_ENTITY"|"ADD_CONTACT"|"FOLLOW_UP"|"VERIFY_PROMISE"|"REVIEW_DISPUTE"|"REVIEW_OLD_RECEIVABLE"|"REVIEW_LEGAL_THRESHOLD"|"NO_ACTION";
export type PriorityTier="CRITICAL"|"HIGH"|"MEDIUM"|"LOW";
export interface EvidenceValue<T>{readonly value:T;readonly evidenceRefs:readonly string[]}
export interface OperationalCase{
 readonly id:string;readonly organizationId:string;readonly partyId?:string;readonly administrationId?:string;readonly buildingId?:string;readonly currency:"ARS";
 readonly outstandingCents:EvidenceValue<number>;readonly overdueInvoiceCount:EvidenceValue<number>;readonly oldestDaysOverdue:EvidenceValue<number>;
 readonly lastContactAt:EvidenceValue<string|null>;readonly daysSinceLastContact:EvidenceValue<number|null>;readonly contactAttemptCount:EvidenceValue<number>;
 readonly promise:EvidenceValue<"NONE"|"ACTIVE"|"FULFILLED"|"MISSED">;readonly dispute:EvidenceValue<boolean>;readonly contactAvailable:EvidenceValue<boolean>;
 readonly entityState:EvidenceValue<"CONFIRMED"|"AMBIGUOUS"|"UNRESOLVED">;readonly legalReviewFlag:EvidenceValue<boolean>;readonly invoiceEvidenceConflict:EvidenceValue<boolean>;
}
export interface Explanation{readonly code:string;readonly text:string;readonly evidenceRefs:readonly string[]}
export interface AttentionItem{readonly caseId:string;readonly organizationId:string;readonly attentionType:AttentionType;readonly priorityTier:PriorityTier;readonly outstandingCents:number;readonly currency:string;readonly reasons:readonly Explanation[];readonly blockers:readonly Explanation[];readonly evidenceReferences:readonly string[]}
