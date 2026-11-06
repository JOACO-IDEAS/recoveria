import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { assertLocalWhatsAppActivationEnvironment } from "./activation-environment";
import { defaultUsageLimits, integerPrice, providerMode, requiredSecret } from "./configuration";
import { PrismaCrmInvoiceCatalog, ReadOnlyCatalogRecoveriaCrmAdapter } from "./crm-sync";
import { MockConversationInterpreter, OpenAIConversationInterpreter } from "./interpreter";
import { WhatsAppIntelligenceProcessor } from "./processor";
import { PrismaTenantPhoneRegistry, PrismaWhatsAppIntelligenceStore, WhatsAppPiiCipher } from "./prisma-store";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_NOT_CONFIGURED`); return value; };
let singleton: ReturnType<typeof createRuntime> | undefined;

function createRuntime() {
  if (process.env.WHATSAPP_ACTIVATION_MODE) assertLocalWhatsAppActivationEnvironment();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: required("RECOVERIA_DATABASE_URL"), max: 4 }) });
  const limits = defaultUsageLimits(); const mode = providerMode();
  const interpreter = mode === "openai" ? new OpenAIConversationInterpreter({
    apiKey: requiredSecret(process.env, "OPENAI_API_KEY"), model: required("OPENAI_WHATSAPP_MODEL"), limits,
    inputUsdMicrosPerMillionTokens: integerPrice(required("OPENAI_INPUT_USD_MICROS_PER_MILLION_TOKENS")),
    outputUsdMicrosPerMillionTokens: integerPrice(required("OPENAI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS")),
    reasoningEffort: process.env.OPENAI_WHATSAPP_REASONING_EFFORT === "low" || process.env.OPENAI_WHATSAPP_REASONING_EFFORT === "medium" ? process.env.OPENAI_WHATSAPP_REASONING_EFFORT : "none",
  }) : new MockConversationInterpreter();
  const store = new PrismaWhatsAppIntelligenceStore(prisma, WhatsAppPiiCipher.fromBase64(process.env.WHATSAPP_PII_KEY));
  const crm = new ReadOnlyCatalogRecoveriaCrmAdapter(new PrismaCrmInvoiceCatalog(prisma));
  return { prisma, registry: new PrismaTenantPhoneRegistry(prisma), store, processor: new WhatsAppIntelligenceProcessor(store, interpreter, crm, { limits, maxAttempts: 5, retryBaseMs: 1_000 }) };
}
export function whatsAppRuntime() { return singleton ??= createRuntime(); }
