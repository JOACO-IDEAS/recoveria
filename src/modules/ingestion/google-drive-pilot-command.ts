export interface GoogleDrivePilotConfiguration { readonly organizationId: string; readonly connectionId: string; readonly authorizedRootId: string; readonly credentialsConfigured: boolean }
export function assertGoogleDrivePilotConfigured(configuration?: GoogleDrivePilotConfiguration): GoogleDrivePilotConfiguration {
  if (!configuration?.credentialsConfigured || !configuration.organizationId || !configuration.connectionId || !configuration.authorizedRootId) throw new Error("GOOGLE_DRIVE_PILOT_NOT_CONFIGURED");
  return configuration;
}
