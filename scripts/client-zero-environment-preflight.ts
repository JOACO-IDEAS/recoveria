import { clientZeroEnvironmentPreflight } from "../src/modules/client-zero/environment-preflight";

const result = clientZeroEnvironmentPreflight(process.env);
console.log(JSON.stringify(result));
if (!result.ok) process.exit(1);
