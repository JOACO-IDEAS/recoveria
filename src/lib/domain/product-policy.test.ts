import { describe, expect, it } from "vitest";
import { AI_ALLOWED_ACTIONS, AI_PROHIBITED_ACTIONS, PRIORITIZATION_SIGNALS, PRIMARY_NAVIGATION } from "./product-policy";

describe("Phase 0 product boundaries", () => {
  it("keeps autonomous sending outside the allowed action set", () => {
    expect(AI_ALLOWED_ACTIONS).not.toContain("SEND");
    expect(AI_PROHIBITED_ACTIONS).toContain("SEND");
  });

  it("uses explicit prioritization signals", () => {
    expect(PRIORITIZATION_SIGNALS).toContain("daysOverdue");
    expect(PRIORITIZATION_SIGNALS).toContain("configuredLegalReviewFlag");
  });

  it("frames the product as an operational workspace", () => {
    expect(PRIMARY_NAVIGATION).toEqual(expect.arrayContaining(["Inicio", "Cartera", "Importaciones", "Agente"]));
  });
});
