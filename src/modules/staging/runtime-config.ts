import { parseStagingEnvironment, parseStagingWorkerEnvironment } from "./environment";
import { cloudTasksConfiguration } from "./cloud-tasks";
export function validateStagingRuntimeConfiguration(source: Record<string, string | undefined>, role: "PRODUCT_API" | "WORKER") {
  const staging = role === "PRODUCT_API" ? parseStagingEnvironment(source) : parseStagingWorkerEnvironment(source); const required = (name: string) => { const value = source[name]?.trim(); if (!value) throw new Error(`STAGING_${name}_REQUIRED`); return value; };
  if (required("CONNECTED_SOURCE_DATABASE_URL") !== staging.RECOVERIA_DATABASE_URL) throw new Error("STAGING_DATABASE_COMPOSITION_MISMATCH");
  if (required("CONNECTED_SOURCE_ORGANIZATION_ID") !== staging.RECOVERIA_ORGANIZATION_ID || required("CONNECTED_SOURCE_CONNECTION_ID") !== staging.RECOVERIA_CONNECTION_ID) throw new Error("STAGING_SOURCE_COMPOSITION_MISMATCH");
  for (const name of ["CONNECTED_SOURCE_GOOGLE_CLIENT_ID", "CONNECTED_SOURCE_GOOGLE_CLIENT_SECRET_REFERENCE", "CONNECTED_SOURCE_CALLBACK_URL", "CONNECTED_SOURCE_KMS_KEY_VERSION", "CONNECTED_SOURCE_APPROVED_ROOT_ID", "CONNECTED_SOURCE_SOURCE_ID"]) required(name);
  if (role === "PRODUCT_API") {
    if (required("RECOVERIA_PRODUCT_SURFACE_DATABASE_URL") !== staging.RECOVERIA_DATABASE_URL) throw new Error("STAGING_DATABASE_COMPOSITION_MISMATCH");
    if (required("RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID") !== staging.RECOVERIA_ORGANIZATION_ID) throw new Error("STAGING_PRODUCT_SCOPE_MISMATCH");
    if (source.RECOVERIA_PRODUCT_SURFACE_DOCUMENT_DIRECTORY) throw new Error("STAGING_LOCAL_PREVIEW_FORBIDDEN");
    if (required("RECOVERIA_PREVIEW_ADAPTER") !== "provider") throw new Error("STAGING_PROVIDER_PREVIEW_REQUIRED");
    for (const name of ["CONNECTED_SOURCE_PICKER_API_KEY", "CONNECTED_SOURCE_GOOGLE_APP_ID"]) required(name);
    cloudTasksConfiguration(source);
  }
  return staging;
}
