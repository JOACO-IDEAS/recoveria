import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const STAGING_SESSION_COOKIE = "__Host-recoveria_staging_session";
export const STAGING_SESSION_SECONDS = 60 * 60;

export interface FounderIdentity { readonly actorId: string; readonly email: string; readonly organizationId: string }
export interface StagingSessionRecord extends FounderIdentity { readonly idHash: string; readonly expiresAt: string; readonly revokedAt?: string }
export interface StagingSessionRepository { create(record: StagingSessionRecord): Promise<void>; load(idHash: string): Promise<StagingSessionRecord | null>; revoke(idHash: string): Promise<void> }

export class InMemoryStagingSessionRepository implements StagingSessionRepository {
  readonly records = new Map<string, StagingSessionRecord>();
  async create(record: StagingSessionRecord) { this.records.set(record.idHash, record); }
  async load(idHash: string) { return this.records.get(idHash) ?? null; }
  async revoke(idHash: string) { const record = this.records.get(idHash); if (record) this.records.set(idHash, { ...record, revokedAt: new Date().toISOString() }); }
}

export interface SessionPayload extends FounderIdentity { readonly sid: string; readonly csrf: string; readonly exp: number; readonly version: 1 }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (secret: string) => createHash("sha256").update(secret).digest();

export class FounderSessionService {
  constructor(private readonly repository: StagingSessionRepository, private readonly secret: string, private readonly allowlist: readonly string[], private readonly now: () => number = Date.now) { if (secret.length < 43) throw new Error("STAGING_SESSION_KEY_INVALID"); }
  async issue(identity: FounderIdentity): Promise<{ cookie: string; csrfToken: string; expiresAt: string }> {
    if (!this.allowlist.includes(identity.email.toLowerCase())) throw new Error("FOUNDER_IDENTITY_NOT_ALLOWED");
    const payload: SessionPayload = { ...identity, email: identity.email.toLowerCase(), sid: randomBytes(32).toString("base64url"), csrf: randomBytes(32).toString("base64url"), exp: this.now() + STAGING_SESSION_SECONDS * 1000, version: 1 };
    const expiresAt = new Date(payload.exp).toISOString();
    await this.repository.create({ actorId: payload.actorId, email: payload.email, organizationId: payload.organizationId, idHash: digest(payload.sid), expiresAt });
    return { cookie: this.seal(payload), csrfToken: payload.csrf, expiresAt };
  }
  async authenticate(cookie: string | undefined): Promise<SessionPayload> {
    if (!cookie) throw new Error("FOUNDER_SESSION_REQUIRED");
    const payload = this.open(cookie);
    const record = await this.repository.load(digest(payload.sid));
    if (!record || record.revokedAt || Date.parse(record.expiresAt) <= this.now() || payload.exp <= this.now()) throw new Error("FOUNDER_SESSION_INVALID");
    if (record.actorId !== payload.actorId || record.organizationId !== payload.organizationId || record.email !== payload.email) throw new Error("FOUNDER_SESSION_BINDING_MISMATCH");
    return payload;
  }
  async logout(cookie: string | undefined): Promise<void> { if (!cookie) return; const payload = this.open(cookie); await this.repository.revoke(digest(payload.sid)); }
  assertCsrf(session: SessionPayload, supplied: string | null): void { if (!supplied || supplied.length !== session.csrf.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf))) throw new Error("FOUNDER_CSRF_REJECTED"); }
  cookieHeader(value: string, secure = true): string { return `${STAGING_SESSION_COOKIE}=${value}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=${STAGING_SESSION_SECONDS}; Priority=High`; }
  clearCookieHeader(secure = true): string { return `${STAGING_SESSION_COOKIE}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0; Priority=High`; }
  private seal(payload: SessionPayload): string { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(this.secret), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]); return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString("base64url")).join("."); }
  private open(value: string): SessionPayload { try { const [iv, tag, encrypted, extra] = value.split("."); if (!iv || !tag || !encrypted || extra) throw new Error(); const decipher = createDecipheriv("aes-256-gcm", key(this.secret), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as SessionPayload; if (payload.version !== 1 || !payload.sid || !payload.csrf || !payload.actorId || !payload.organizationId || !payload.email || !Number.isSafeInteger(payload.exp)) throw new Error(); return payload; } catch { throw new Error("FOUNDER_SESSION_INVALID"); } }
}
