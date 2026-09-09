import { normalizeCuit, normalizeName } from "@/modules/ingestion/normalization";
import type { AliasProjection, Candidate, EntityRecord, ResolutionResult, ResolutionSignal, TemporalRelationship } from "./types";

export function resolveEntity(signal:ResolutionSignal, entities:readonly EntityRecord[], aliases:readonly AliasProjection[], relationships:readonly TemporalRelationship[]):ResolutionResult {
  const pool=entities.filter(e=>e.organizationId===signal.organizationId&&e.type===signal.entityType);
  const name=signal.normalizedName??(signal.rawName?normalizeName(signal.rawName):"");
  const tax=signal.taxId?normalizeCuit(signal.taxId):null;
  const aliasFor=(id:string,effect:"CONFIRMED"|"REJECTED")=>aliases.some(a=>a.organizationId===signal.organizationId&&a.entityType===signal.entityType&&a.normalizedAlias===name&&a.entityId===id&&a.effect===effect);
  const temporalIds=new Set(relationships.filter(r=>r.organizationId===signal.organizationId&&r.buildingId===signal.buildingId&&signal.invoiceDate&&r.validFrom<=signal.invoiceDate&&(!r.validTo||signal.invoiceDate<=r.validTo)).map(r=>r.administrationId));
  const candidates:Candidate[]=pool.flatMap(entity=>{
    const support:string[]=[], contradict:string[]=[], reasons:string[]=[];
    const entityTax=entity.taxId?normalizeCuit(entity.taxId):null;
    const names=[entity.legalName,entity.tradeName??""].filter(Boolean).map(normalizeName);
    if(tax&&entityTax===tax){support.push("exact tenant-scoped CUIT");reasons.push("EXACT_TAX_ID");}
    if(name&&names.includes(name)){support.push("exact normalized name");reasons.push("EXACT_NORMALIZED_NAME");}
    if(aliasFor(entity.id,"CONFIRMED")){support.push("active human-confirmed alias");reasons.push("CONFIRMED_ALIAS_MEMORY");}
    if(aliasFor(entity.id,"REJECTED")){contradict.push("active human rejection");reasons.push("REJECTED_ALIAS_MEMORY");}
    if(tax&&entityTax&&tax!==entityTax){contradict.push("different CUIT");reasons.push("CONTRADICTORY_TAX_ID");}
    if(temporalIds.has(entity.id)){support.push("building relationship valid on invoice date");reasons.push("TEMPORAL_BUILDING_RELATIONSHIP");}
    if(signal.email&&entity.emails?.includes(signal.email)){support.push("exact contact email (support only)");reasons.push("CONTACT_OVERLAP");}
    if(signal.phone&&entity.phones?.includes(signal.phone)){support.push("exact phone (support only)");reasons.push("CONTACT_OVERLAP");}
    return support.length||contradict.length?[{entityId:entity.id,supportingEvidence:support,contradictingEvidence:contradict,reasonCodes:reasons}]:[];
  });
  const conflicts=candidates.filter(c=>c.supportingEvidence.length&&c.reasonCodes.includes("CONTRADICTORY_TAX_ID"));
  if(conflicts.length)return result("CONFLICT",null,candidates,["STRONG_IDENTIFIER_CONTRADICTION"],signal,true);
  const exactTax=candidates.filter(c=>c.reasonCodes.includes("EXACT_TAX_ID")&&!c.contradictingEvidence.length);
  if(exactTax.length===1)return result("RESOLVED",exactTax[0].entityId,candidates,["AUTO_EXACT_TENANT_TAX_ID"],signal,false);
  const confirmed=candidates.filter(c=>c.reasonCodes.includes("CONFIRMED_ALIAS_MEMORY")&&!c.reasonCodes.includes("REJECTED_ALIAS_MEMORY")&&!c.reasonCodes.includes("CONTRADICTORY_TAX_ID"));
  if(confirmed.length===1)return result("RESOLVED",confirmed[0].entityId,candidates,["AUTO_CONFIRMED_ALIAS_MEMORY"],signal,false);
  const eligible=candidates.filter(c=>c.supportingEvidence.length&&!c.reasonCodes.includes("REJECTED_ALIAS_MEMORY"));
  if(eligible.length>1)return result("AMBIGUOUS",null,candidates,["MULTIPLE_CANDIDATES"],signal,true);
  if(eligible.length===1)return result("REVIEW_REQUIRED",null,candidates,["SUPPORT_INSUFFICIENT_FOR_IDENTITY"],signal,true);
  return result("NO_MATCH",null,candidates,candidates.some(c=>c.reasonCodes.includes("REJECTED_ALIAS_MEMORY"))?["HISTORICALLY_REJECTED"]:["NO_CANDIDATE"],signal,true);
}
function result(status:ResolutionResult["status"],resolvedEntityId:string|null,candidates:readonly Candidate[],reasonCodes:readonly string[],signal:ResolutionSignal,requiresHumanDecision:boolean):ResolutionResult{return{status,resolvedEntityId,candidates,reasonCodes,sourceRefs:signal.sourceRefs,requiresHumanDecision};}
