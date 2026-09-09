export type SafeStage="PREFLIGHT"|"CLASSIFY"|"PARSE"|"NORMALIZE"|"VALIDATE"|"COMPLETE"|"CLEANUP";
export interface SafeLogEvent{documentInternalId:string;stage:SafeStage;reasonCode:string;status:"STARTED"|"SUCCEEDED"|"FAILED";errorClass?:string}
const FORBIDDEN=/raw|content|name|address|cuit|email|phone|invoice(number)?|customer|administration/i;
export function serializeSafeLog(event:SafeLogEvent):string{for(const key of Object.keys(event))if(FORBIDDEN.test(key)&&key!=="documentInternalId")throw new Error("UNSAFE_LOG_FIELD");return JSON.stringify(event);}
export function safeParserError(documentInternalId:string,stage:SafeStage,error:unknown):SafeLogEvent{return{documentInternalId,stage,reasonCode:"PARSER_FAILURE",status:"FAILED",errorClass:error instanceof Error?error.name:"UnknownError"};}
