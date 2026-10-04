import { describe, expect, it } from "vitest";
import { assertClientZeroIngestionAllowed, clientZeroIngestionEnabled } from "./kill-switch";

describe("Client Zero ingestion kill switch", () => {
  it("blocks ingestion by default (flag absent)", () => {
    expect(() => assertClientZeroIngestionAllowed({})).toThrow("CLIENT_ZERO_INGESTION_DISABLED");
    expect(clientZeroIngestionEnabled({})).toBe(false);
  });

  it("blocks ingestion on any value other than the exact string \"true\"", () => {
    for (const value of ["TRUE", "1", "yes", "false", ""]) {
      expect(() => assertClientZeroIngestionAllowed({ RECOVERIA_CLIENT_ZERO_INGESTION_ENABLED: value })).toThrow("CLIENT_ZERO_INGESTION_DISABLED");
    }
  });

  it("allows ingestion only when explicitly enabled", () => {
    expect(() => assertClientZeroIngestionAllowed({ RECOVERIA_CLIENT_ZERO_INGESTION_ENABLED: "true" })).not.toThrow();
    expect(clientZeroIngestionEnabled({ RECOVERIA_CLIENT_ZERO_INGESTION_ENABLED: "true" })).toBe(true);
  });
});
