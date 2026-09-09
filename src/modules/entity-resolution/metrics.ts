import type { ResolutionResult } from "./types";
export interface Metric {correct:number;total:number;rate:number}
export interface ResolutionTruth {identityExists:boolean;expectedStatus:string;expectedEntity?:string;expectedCandidate?:string}
const m=(correct:number,total:number):Metric=>({correct,total,rate:total?correct/total:1});
export function resolutionMetrics(rows:readonly {truth:ResolutionTruth;result:ResolutionResult}[]){
 const identity=rows.filter(r=>r.truth.identityExists);
 const auto=rows.filter(r=>r.result.status==="RESOLVED");
 const correctAuto=auto.filter(r=>r.result.resolvedEntityId===r.truth.expectedEntity);
 const expectedCandidateRows=rows.filter(r=>r.truth.expectedEntity||r.truth.expectedCandidate);
 return {
  candidateRecall:m(expectedCandidateRows.filter(r=>r.result.candidates.some(c=>c.entityId===(r.truth.expectedEntity??r.truth.expectedCandidate))).length,expectedCandidateRows.length),
  autoPrecision:m(correctAuto.length,auto.length),
  autoRecall:m(correctAuto.length,identity.length),
  reviewRouting:m(rows.filter(r=>r.result.status===r.truth.expectedStatus).length,rows.length),
  conflictDetection:m(rows.filter(r=>r.truth.expectedStatus==="CONFLICT"&&r.result.status==="CONFLICT").length,rows.filter(r=>r.truth.expectedStatus==="CONFLICT").length),
  falseAutoResolutions:auto.length-correctAuto.length,
 };
}
