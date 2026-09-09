import type { AliasProjection, DecisionEvent } from "./types";

export function appendDecision(history:readonly DecisionEvent[], event:DecisionEvent):readonly DecisionEvent[] {
  if (history.some(({id})=>id===event.id)) throw new Error("DUPLICATE_DECISION_ID");
  if (event.supersedesId && !history.some(({id})=>id===event.supersedesId)) throw new Error("SUPERSEDED_DECISION_NOT_FOUND");
  return Object.freeze([...history, Object.freeze({...event, sourceRefs:Object.freeze([...event.sourceRefs])})]);
}

export function projectAliases(history:readonly DecisionEvent[]):readonly AliasProjection[] {
  const superseded=new Set(history.flatMap(e=>e.supersedesId?[e.supersedesId]:[]));
  return history.filter(e=>!superseded.has(e.id)&&e.entityId&&(e.action==="CONFIRM_EXISTING"||e.action==="REJECT_CANDIDATE"))
    .map(e=>({organizationId:e.organizationId,entityType:e.entityType,normalizedAlias:e.normalizedAlias,entityId:e.entityId!,effect:e.action==="CONFIRM_EXISTING"?"CONFIRMED" as const:"REJECTED" as const,sourceDecisionId:e.id}));
}
