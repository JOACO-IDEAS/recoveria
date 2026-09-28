import type { PrismaClient } from "@prisma/client";
import type { SourceCheckpoint } from "@/modules/ingestion/incremental-corpus-processor";
import type { VersionedSourceCheckpoint } from "@/modules/ingestion/production-source-checkpoint-port";
import type { ProductSurfaceCheckpointReader } from "./read-model";
import type { ProductSurfaceScope } from "./types";

type CheckpointClient = Pick<PrismaClient, "driveSourceCheckpoint">;

export class PrismaProductSurfaceCheckpointReader implements ProductSurfaceCheckpointReader {
  constructor(private readonly client: CheckpointClient) {}

  async load(scope: ProductSurfaceScope): Promise<VersionedSourceCheckpoint | null> {
    const row = await this.client.driveSourceCheckpoint.findUnique({
      where: {
        organizationId_sourceType_sourceId_connectionId: {
          organizationId: scope.organizationId,
          sourceType: scope.sourceType,
          sourceId: scope.sourceId,
          connectionId: scope.connectionId,
        },
      },
      select: { version: true, connectionId: true, checkpoint: true },
    });
    return row ? { version: row.version, connectionId: row.connectionId, checkpoint: row.checkpoint as unknown as SourceCheckpoint } : null;
  }
}
