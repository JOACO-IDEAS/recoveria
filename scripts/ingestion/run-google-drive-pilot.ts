import { assertGoogleDrivePilotConfigured } from "../../src/modules/ingestion/google-drive-pilot-command";

try { assertGoogleDrivePilotConfigured(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "GOOGLE_DRIVE_PILOT_NOT_CONFIGURED"}\n`); process.exitCode = 1; }
