import path from "node:path";
export type DataMode="SYNTHETIC"|"CLIENT_ZERO";
export const CLIENT_ZERO_ACK="I_UNDERSTAND_REAL_DATA_IS_SENSITIVE";
export interface ModeEnvironment{RECOVERIA_DATA_MODE?:string;RECOVERIA_CLIENT_ZERO_ACK?:string;RECOVERIA_CLIENT_ZERO_PATH?:string}
export function activateDataMode(env:ModeEnvironment,projectRoot:string):{mode:DataMode;inputPath?:string}{
 if(env.RECOVERIA_DATA_MODE!=="client-zero")return{mode:"SYNTHETIC"};
 if(env.RECOVERIA_CLIENT_ZERO_ACK!==CLIENT_ZERO_ACK)throw new Error("CLIENT_ZERO_ACK_REQUIRED");
 const boundary=path.resolve(projectRoot,".private/client-zero");const input=path.resolve(env.RECOVERIA_CLIENT_ZERO_PATH??"");
 if(!input.startsWith(`${boundary}${path.sep}`))throw new Error("CLIENT_ZERO_PATH_OUTSIDE_PRIVATE_BOUNDARY");
 return{mode:"CLIENT_ZERO",inputPath:input};
}
