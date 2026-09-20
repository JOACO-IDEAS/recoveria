import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { stableSourceDocumentId, type DiscoveredDocument, type DocumentSource } from "./document-source";

const mimeTypeFor = (name: string): string => name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";

export class LocalFolderSource implements DocumentSource {
  readonly sourceType = "LOCAL_FOLDER" as const;
  readonly #root: string;

  private constructor(
    readonly organizationId: string,
    readonly sourceId: string,
    root: string,
  ) { this.#root = root; }

  static async create(organizationId: string, sourceId: string, root: string): Promise<LocalFolderSource> {
    return new LocalFolderSource(organizationId, sourceId, await realpath(root));
  }

  async discover(): Promise<readonly DiscoveredDocument[]> {
    const files: Array<{ absolute: string; relative: string }> = [];
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(absolute);
        else if (entry.isFile()) files.push({ absolute, relative: path.relative(this.#root, absolute).split(path.sep).join("/") });
      }
    };
    await walk(this.#root);
    return Promise.all(files.map(async ({ absolute, relative }) => {
      const metadata = await stat(absolute);
      const sourceDocumentId = stableSourceDocumentId(this.sourceType, `${this.organizationId}:${this.sourceId}`, relative);
      const mimeType = mimeTypeFor(relative);
      return {
        sourceDocumentId,
        displayName: path.basename(relative),
        mimeType,
        size: metadata.size,
        modifiedAt: metadata.mtime.toISOString(),
        supported: mimeType === "application/pdf",
        provenance: { sourceType: this.sourceType, sourceId: this.sourceId, sourceDocumentId, locator: relative },
        readContent: async () => new Uint8Array(await readFile(absolute)),
      } satisfies DiscoveredDocument;
    }));
  }
}
