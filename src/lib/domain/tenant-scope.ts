export class TenantAccessError extends Error {
  constructor() {
    super("Cross-tenant access rejected");
    this.name = "TenantAccessError";
  }
}

export function requireTenantRecord<T extends { readonly organizationId: string }>(organizationId: string, record: T): T {
  if (record.organizationId !== organizationId) throw new TenantAccessError();
  return record;
}

export function tenantRecords<T extends { readonly organizationId: string }>(organizationId: string, records: readonly T[]): readonly T[] {
  return records.filter((record) => record.organizationId === organizationId);
}
