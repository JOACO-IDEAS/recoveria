import { describe, expect, it } from "vitest";
import { sha256Hex } from "./durable-canary-ingestion";

describe("durable canary ingestion helpers", () => {
  it("sha256Hex is deterministic and matches node crypto directly", () => {
    const bytes = new TextEncoder().encode("synthetic-test-content");
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
    expect(sha256Hex(bytes)).toHaveLength(64);
  });

  it("sha256Hex differs for different content", () => {
    expect(sha256Hex(new TextEncoder().encode("a"))).not.toBe(sha256Hex(new TextEncoder().encode("b")));
  });
});
