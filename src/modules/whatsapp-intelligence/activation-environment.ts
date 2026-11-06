export const WHATSAPP_ACTIVATION_MODE = "local-meta-test" as const;
export const WHATSAPP_ACTIVATION_ORGANIZATION_ID = "recoveria-whatsapp-meta-test" as const;
export const WHATSAPP_ACTIVATION_DATABASE_NAME = "recoveria_whatsapp_test" as const;

type Environment = Readonly<Record<string, string | undefined>>;

export function assertLocalWhatsAppActivationEnvironment(environment: Environment = process.env): URL {
  if (environment.WHATSAPP_ACTIVATION_MODE !== WHATSAPP_ACTIVATION_MODE) throw new Error("WHATSAPP_ACTIVATION_MODE_INVALID");
  if (environment.RECOVERIA_ENVIRONMENT !== "LOCAL") throw new Error("WHATSAPP_ACTIVATION_ENVIRONMENT_INVALID");
  if ((environment.WHATSAPP_INTERPRETER_PROVIDER ?? "mock") !== "mock") throw new Error("WHATSAPP_ACTIVATION_PROVIDER_INVALID");
  if (environment.WHATSAPP_ACTIVATION_ORGANIZATION_ID !== WHATSAPP_ACTIVATION_ORGANIZATION_ID) throw new Error("WHATSAPP_ACTIVATION_TENANT_INVALID");
  const raw = environment.RECOVERIA_DATABASE_URL?.trim();
  if (!raw) throw new Error("RECOVERIA_DATABASE_URL_NOT_CONFIGURED");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("WHATSAPP_ACTIVATION_DATABASE_INVALID"); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("WHATSAPP_ACTIVATION_DATABASE_INVALID");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("WHATSAPP_ACTIVATION_DATABASE_NOT_LOCAL");
  if (decodeURIComponent(url.pathname.replace(/^\//, "")) !== WHATSAPP_ACTIVATION_DATABASE_NAME) throw new Error("WHATSAPP_ACTIVATION_DATABASE_NAME_INVALID");
  return url;
}
