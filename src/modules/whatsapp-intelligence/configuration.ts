import { z } from "zod";
import type { UsageLimits } from "./types";

const positiveInt = (value: string | undefined, fallback: number) => { const parsed = Number(value ?? fallback); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("WHATSAPP_CONFIGURATION_INVALID"); return parsed; };
type Environment = Readonly<Record<string, string | undefined>>;
export const defaultUsageLimits = (environment: Environment = process.env): UsageLimits => ({
  maxInputCharacters: positiveInt(environment.WHATSAPP_MAX_INPUT_CHARACTERS, 24_000), maxContextMessages: positiveInt(environment.WHATSAPP_MAX_CONTEXT_MESSAGES, 20),
  maxOutputTokens: positiveInt(environment.WHATSAPP_MAX_OUTPUT_TOKENS, 800), monthlyTokenLimit: positiveInt(environment.WHATSAPP_MONTHLY_TOKEN_LIMIT, 1_000_000),
  monthlyCostUsdMicrosLimit: positiveInt(environment.WHATSAPP_MONTHLY_COST_USD_MICROS_LIMIT, 10_000_000),
});
export const integerPrice = (value: string | undefined) => { const parsed = Number(value ?? "0"); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("WHATSAPP_OPENAI_PRICE_INVALID"); return parsed; };
export const requiredSecret = (environment: Environment, name: "OPENAI_API_KEY" | "META_APP_SECRET" | "WHATSAPP_VERIFY_TOKEN") => { const value = environment[name]?.trim(); if (!value) throw new Error(`${name}_NOT_CONFIGURED`); return value; };
export const providerMode = (environment: Environment = process.env) => z.enum(["mock", "openai"]).parse(environment.WHATSAPP_INTERPRETER_PROVIDER ?? "mock");
