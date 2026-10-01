export interface VerifiedFounderIdentity { readonly issuer: string; readonly subject: string; readonly audience: string; readonly email: string; readonly emailVerified: true }
export interface ExternalIdentityVerifier { verify(assertion: string): Promise<VerifiedFounderIdentity> }
export interface FounderDirectoryEntry { readonly email: string; readonly actorId: string; readonly organizationId: string }
export interface TenantMembershipRepository { active(organizationId: string, actorId: string): Promise<boolean> }

export class FounderIdentityService {
  constructor(private readonly verifier: ExternalIdentityVerifier, private readonly directory: readonly FounderDirectoryEntry[], private readonly memberships: TenantMembershipRepository) {}
  async resolve(assertion: string): Promise<FounderDirectoryEntry> {
    const verified = await this.verifier.verify(assertion);
    if (!verified.emailVerified || verified.issuer !== "https://accounts.google.com") throw new Error("FOUNDER_IDENTITY_INVALID");
    const entry = this.directory.find(item => item.email.toLowerCase() === verified.email.toLowerCase());
    if (!entry || !(await this.memberships.active(entry.organizationId, entry.actorId))) throw new Error("FOUNDER_NOT_AUTHORIZED");
    return { ...entry, email: entry.email.toLowerCase() };
  }
}

export class PrismaTenantMembershipRepository implements TenantMembershipRepository {
  constructor(private readonly client: { membership: { findFirst(input: unknown): Promise<unknown> } }) {}
  async active(organizationId: string, actorId: string): Promise<boolean> {
    return Boolean(await this.client.membership.findFirst({ where: { organizationId, userId: actorId, active: true } }));
  }
}
