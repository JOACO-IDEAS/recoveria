import {describe,expect,it} from "vitest";
import {normalizeName} from "@/modules/ingestion/normalization";
import {appendDecision,projectAliases} from "./memory";
import {resolutionMetrics} from "./metrics";
import {resolveEntity} from "./resolver";
import type {DecisionEvent} from "./types";
import {BASE_ALIASES,ENTITY_FIXTURES,RESOLUTION_CASES,TEMPORAL_RELATIONSHIPS} from "@/test/fixtures/entity-resolution-truth-set";

const results=RESOLUTION_CASES.map(truth=>({truth,result:resolveEntity(truth.signal,ENTITY_FIXTURES,BASE_ALIASES,TEMPORAL_RELATIONSHIPS)}));
const by=(id:string)=>results.find(r=>r.truth.id===id)!.result;

describe("deterministic identity policy",()=>{
 it("auto-resolves exact tenant CUIT formatting",()=>expect(by("exact-cuit-format")).toEqual(expect.objectContaining({status:"RESOLVED",resolvedEntityId:"adm-garcia",reasonCodes:["AUTO_EXACT_TENANT_TAX_ID"]})));
 it("reuses a confirmed alias",()=>expect(by("confirmed-alias").resolvedEntityId).toBe("adm-garcia"));
 it("keeps name-only identity for review",()=>expect(by("punctuation")).toEqual(expect.objectContaining({status:"REVIEW_REQUIRED",resolvedEntityId:null})));
 it("detects contradictory CUIT",()=>expect(by("strong-name-conflict")).toEqual(expect.objectContaining({status:"CONFLICT",reasonCodes:["STRONG_IDENTIFIER_CONTRADICTION"]})));
 it("returns ambiguity for contact overlap",()=>expect(by("ambiguous-contact")).toEqual(expect.objectContaining({status:"AMBIGUOUS",resolvedEntityId:null})));
 it("returns no match without inventing an entity",()=>expect(by("no-candidate")).toEqual(expect.objectContaining({status:"NO_MATCH",resolvedEntityId:null})));
 it("never returns the cross-tenant lookalike",()=>expect(by("cross-tenant").candidates.some(c=>c.entityId==="foreign-garcia")).toBe(false));
});

describe("human decision memory",()=>{
 const base:DecisionEvent={id:"d1",organizationId:"org-recoveria-synthetic",entityType:"ADMINISTRATION",normalizedAlias:normalizeName("Alias Humano"),entityId:"adm-garcia",action:"CONFIRM_EXISTING",decidedBy:"reviewer",decidedAt:"2026-09-09T00:00:00Z",sourceRefs:["doc:1"],reason:"Evidence reviewed"};
 it("appends confirmation and projects current alias",()=>{const h=appendDecision([],base);expect(projectAliases(h)[0]).toEqual(expect.objectContaining({effect:"CONFIRMED",sourceDecisionId:"d1"}));expect(Object.isFrozen(h)).toBe(true);});
 it("uses projected confirmation on a later signal",()=>{const aliases=projectAliases([base]);const r=resolveEntity({organizationId:base.organizationId,entityType:"ADMINISTRATION",rawName:"Alias Humano",sourceRefs:["doc:2"]},ENTITY_FIXTURES,aliases,TEMPORAL_RELATIONSHIPS);expect(r.resolvedEntityId).toBe("adm-garcia");});
 it("honors rejection memory",()=>{const reject={...base,id:"d2",normalizedAlias:normalizeName("Alias Rechazado"),action:"REJECT_CANDIDATE" as const};const r=resolveEntity({organizationId:base.organizationId,entityType:"ADMINISTRATION",rawName:"Alias Rechazado",sourceRefs:["doc:3"]},ENTITY_FIXTURES,projectAliases([reject]),TEMPORAL_RELATIONSHIPS);expect(r.reasonCodes).toEqual(["HISTORICALLY_REJECTED"]);});
 it("corrects by superseding, never deleting history",()=>{const correction={...base,id:"d3",action:"REJECT_CANDIDATE" as const,supersedesId:"d1"};const history=appendDecision(appendDecision([],base),correction);expect(history).toHaveLength(2);expect(projectAliases(history)).toEqual([expect.objectContaining({effect:"REJECTED",sourceDecisionId:"d3"})]);});
 it("retains create-new and defer events without alias projection",()=>{const create={...base,id:"d4",entityId:undefined,action:"CREATE_NEW" as const};const defer={...base,id:"d5",entityId:undefined,action:"DEFER" as const};expect(projectAliases([create,defer])).toEqual([]);});
});

describe("temporal and supporting evidence",()=>{
 it("uses administration valid at historical invoice date",()=>expect(by("building-old").candidates.find(c=>c.entityId==="adm-garcia")?.reasonCodes).toContain("TEMPORAL_BUILDING_RELATIONSHIP"));
 it("does not reassign history after administration changes",()=>{expect(by("building-new").candidates.some(c=>c.entityId==="adm-sur")).toBe(true);expect(by("building-new").candidates.some(c=>c.entityId==="adm-garcia")).toBe(false);});
 it("does not auto-resolve building or contact evidence",()=>{expect(by("building-old").status).toBe("REVIEW_REQUIRED");expect(by("ambiguous-contact").resolvedEntityId).toBeNull();});
});

describe("truth-set metrics",()=>{
 it("achieves zero false automatic and cross-tenant resolutions",()=>{const metrics=resolutionMetrics(results);expect(metrics.candidateRecall.rate).toBe(1);expect(metrics.autoPrecision.rate).toBe(1);expect(metrics.falseAutoResolutions).toBe(0);expect(metrics.reviewRouting.rate).toBe(1);expect(metrics.conflictDetection.rate).toBe(1);});
});
