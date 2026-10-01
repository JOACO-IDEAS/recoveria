import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { FounderSessionService, STAGING_SESSION_COOKIE } from "./auth";
import { GoogleIdTokenVerifier } from "./google-identity";
import { FounderIdentityService, PrismaTenantMembershipRepository } from "./identity";
import { PrismaStagingSessionRepository } from "./prisma-session";
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error("STAGING_AUTH_NOT_CONFIGURED"); return value; };
let runtime: ReturnType<typeof create> | undefined;
function create() { const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: required("RECOVERIA_DATABASE_URL"), max: 3 }) }); const email = required("RECOVERIA_FOUNDER_EMAIL").toLowerCase(); const entry = { email, actorId: required("RECOVERIA_FOUNDER_ACTOR_ID"), organizationId: required("RECOVERIA_ORGANIZATION_ID") }; const memberships = new PrismaTenantMembershipRepository(prisma); return { sessions: new FounderSessionService(new PrismaStagingSessionRepository(prisma), required("RECOVERIA_SESSION_KEY"), [email]), identities: new FounderIdentityService(new GoogleIdTokenVerifier(required("RECOVERIA_EXTERNAL_IDENTITY_CLIENT_ID")), [entry], memberships), memberships }; }
export function stagingAuthRuntime() { return runtime ??= create(); }
export function stagingCookie(request: Request): string | undefined { return request.headers.get("x-recoveria-browser-session") ?? request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${STAGING_SESSION_COOKIE}=`))?.slice(STAGING_SESSION_COOKIE.length + 1); }
