import { assertGoogleDrivePilotConfigured } from "../../src/modules/ingestion/google-drive-pilot-command";
import { assertPilotEnabled, DISABLED_GOOGLE_DRIVE_PILOT_GATE } from "../../src/modules/ingestion/google-drive-pilot-infrastructure";

try { assertPilotEnabled(DISABLED_GOOGLE_DRIVE_PILOT_GATE); assertGoogleDrivePilotConfigured(); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "GOOGLE_DRIVE_PILOT_NOT_CONFIGURED"}\n`); process.exitCode = 1; }
