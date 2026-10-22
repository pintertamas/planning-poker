import { describe, expect, it } from "vitest";
import { DEMO_GUIDE_STEPS } from "./demoGuideSteps";

const SENTENCE_BREAK = /[.!?](\s|$)/;

describe("demo guide steps", () => {
  it("has a short checklist", () => {
    expect(DEMO_GUIDE_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(DEMO_GUIDE_STEPS.length).toBeLessThanOrEqual(10);
  });

  it("holds one non-empty sentence per item", () => {
    for (const step of DEMO_GUIDE_STEPS) {
      expect(step).toBe(step.trim());
      expect(step.length, step).toBeGreaterThan(0);
      expect(step, step).toMatch(/[.?]$/);
      expect(step.slice(0, -1), step).not.toMatch(SENTENCE_BREAK);
      expect(step.length, step).toBeLessThanOrEqual(180);
    }
  });

  it("has no duplicate items", () => {
    expect(new Set(DEMO_GUIDE_STEPS).size).toBe(DEMO_GUIDE_STEPS.length);
  });
});
