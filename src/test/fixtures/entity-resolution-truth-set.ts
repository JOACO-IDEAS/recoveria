import { normalizeName } from "@/modules/ingestion/normalization";
import type { AliasProjection, EntityRecord, ResolutionSignal, ResolutionStatus, TemporalRelationship } from "@/modules/entity-resolution/types";
const O="org-recoveria-synthetic";
export const ENTITY_FIXTURES:readonly EntityRecord[]=[
 {id:"adm-garcia",organizationId:O,type:"ADMINISTRATION",legalName:"Administración García SRL",taxId:"30-70000001-1",emails:["shared@example.invalid"]},
 {id:"adm-garcia-norte",organizationId:O,type:"ADMINISTRATION",legalName:"García Norte Administraciones",tradeName:"García Administraciones",taxId:"30-70000002-2"},
 {id:"adm-sur",organizationId:O,type:"ADMINISTRATION",legalName:"Administración Sur SRL",tradeName:"Sur Administraciones",taxId:"30-70000003-3",emails:["shared@example.invalid"]},
 {id:"adm-nueva",organizationId:O,type:"ADMINISTRATION",legalName:"Administración Nueva SA"},
 {id:"foreign-garcia",organizationId:"other-tenant",type:"ADMINISTRATION",legalName:"Administración García SRL",taxId:"30-70000001-1"},
];
export const TEMPORAL_RELATIONSHIPS:readonly TemporalRelationship[]=[
 {id:"r1",organizationId:O,administrationId:"adm-garcia",buildingId:"building-x",validFrom:"2020-01-01",validTo:"2024-12-31"},
 {id:"r2",organizationId:O,administrationId:"adm-sur",buildingId:"building-x",validFrom:"2025-01-01"},
 {id:"r3",organizationId:O,administrationId:"adm-garcia",buildingId:"building-y",validFrom:"2020-01-01"},
];
export const BASE_ALIASES:readonly AliasProjection[]=[
 {organizationId:O,entityType:"ADMINISTRATION",normalizedAlias:normalizeName("ADM GARCIA"),entityId:"adm-garcia",effect:"CONFIRMED",sourceDecisionId:"d-confirm"},
 {organizationId:O,entityType:"ADMINISTRATION",normalizedAlias:normalizeName("GARCIA ADMINISTRACIONES"),entityId:"adm-garcia",effect:"REJECTED",sourceDecisionId:"d-reject"},
];
type Case={id:string;signal:ResolutionSignal;expectedStatus:ResolutionStatus;expectedEntity?:string;identityExists:boolean;expectedCandidate?:string};
const s=(rawName:string|undefined,extra:Partial<ResolutionSignal>={}):ResolutionSignal=>({organizationId:O,entityType:"ADMINISTRATION",rawName,sourceRefs:[`source:${rawName??"missing"}`],...extra});
export const RESOLUTION_CASES:readonly Case[]=[
 {id:"exact-cuit-format",signal:s("Nombre diferente",{taxId:"30-70000001-1"}),expectedStatus:"RESOLVED",expectedEntity:"adm-garcia",identityExists:true},
 {id:"abbreviated",signal:s("Adm. García"),expectedStatus:"RESOLVED",expectedEntity:"adm-garcia",identityExists:true},
 {id:"punctuation",signal:s("Administración García S.R.L."),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-garcia"},
 {id:"similar-different-cuit",signal:s("Administración García SRL",{taxId:"30-70000002-2"}),expectedStatus:"CONFLICT",identityExists:true,expectedCandidate:"adm-garcia"},
 {id:"building-old",signal:s(undefined,{buildingId:"building-x",invoiceDate:"2024-06-01"}),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-garcia"},
 {id:"building-new",signal:s(undefined,{buildingId:"building-x",invoiceDate:"2026-06-01"}),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-sur"},
 {id:"multi-building",signal:s(undefined,{buildingId:"building-y",invoiceDate:"2026-06-01"}),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-garcia"},
 {id:"missing-cuit",signal:s("Administración Sur SRL"),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-sur"},
 {id:"conflicting-cuit",signal:s("Administración Sur SRL",{taxId:"30-70000001-1"}),expectedStatus:"CONFLICT",identityExists:true,expectedCandidate:"adm-sur"},
 {id:"duplicate-trade",signal:s("García Administraciones"),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-garcia-norte"},
 {id:"confirmed-alias",signal:s("ADM GARCIA"),expectedStatus:"RESOLVED",expectedEntity:"adm-garcia",identityExists:true},
 {id:"rejected-alias",signal:s("GARCIA ADMINISTRACIONES"),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-garcia-norte"},
 {id:"ambiguous-contact",signal:s(undefined,{email:"shared@example.invalid"}),expectedStatus:"AMBIGUOUS",identityExists:true},
 {id:"no-candidate",signal:s("Administración Inexistente"),expectedStatus:"NO_MATCH",identityExists:false},
 {id:"cross-tenant",signal:s("Administración García Extranjera",{taxId:"30-79999999-9"}),expectedStatus:"NO_MATCH",identityExists:false},
 {id:"contact-only-one",signal:s(undefined,{phone:"5550000"}),expectedStatus:"NO_MATCH",identityExists:false},
 {id:"incomplete",signal:s(undefined),expectedStatus:"NO_MATCH",identityExists:false},
 {id:"name-only-new",signal:s("Administración Nueva SA"),expectedStatus:"REVIEW_REQUIRED",identityExists:true,expectedCandidate:"adm-nueva"},
 {id:"strong-name-conflict",signal:s("Administración García SRL",{taxId:"30-79999999-9"}),expectedStatus:"CONFLICT",identityExists:true,expectedCandidate:"adm-garcia"},
 {id:"tax-unformatted",signal:s(undefined,{taxId:"30700000033"}),expectedStatus:"RESOLVED",expectedEntity:"adm-sur",identityExists:true},
];
