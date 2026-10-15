import { describe, expect, it } from "vitest";
import { BAR_STAGGER_MS, barDelayMs, countUpValue, isRevealTransition, scrollBehavior } from "./motion";

describe("barDelayMs", () => {
  it("staggers each bar by the bar stagger step", () => {
    expect(BAR_STAGGER_MS).toBe(90);
    expect(barDelayMs(0)).toBe(0);
    expect(barDelayMs(1)).toBe(90);
    expect(barDelayMs(4)).toBe(360);
  });

  it("never returns a negative delay", () => {
    expect(barDelayMs(-2)).toBe(0);
  });
});

describe("countUpValue", () => {
  it("starts at zero and lands exactly on the target", () => {
    expect(countUpValue(0, 8)).toBe(0);
    expect(countUpValue(1, 8)).toBe(8);
    expect(countUpValue(1, 3.5)).toBe(3.5);
  });

  it("clamps progress outside the unit interval", () => {
    expect(countUpValue(-0.5, 5)).toBe(0);
    expect(countUpValue(3, 5)).toBe(5);
  });

  it("eases out so the number moves quickly at first", () => {
    expect(countUpValue(0.5, 8)).toBe(7);
    expect(countUpValue(0.25, 8)).toBe(5);
  });

  it("keeps integer targets whole and decimal targets to one decimal", () => {
    for (let step = 0; step <= 10; step += 1) {
      expect(Number.isInteger(countUpValue(step / 10, 8))).toBe(true);
      const tenths = countUpValue(step / 10, 3.5) * 10;
      expect(Math.abs(tenths - Math.round(tenths))).toBeLessThan(1e-9);
    }
    expect(countUpValue(0.5, 3.5)).toBe(3.1);
  });

  it("rises monotonically towards the target", () => {
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) {
      const value = countUpValue(step / 20, 5);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("scrollBehavior", () => {
  it("scrolls smoothly unless reduced motion is requested", () => {
    expect(scrollBehavior(false)).toBe("smooth");
    expect(scrollBehavior(true)).toBe("auto");
  });
});

describe("isRevealTransition", () => {
  it("is true only when the same ticket moves from voting to revealed", () => {
    expect(isRevealTransition({ phase: "voting", ticketId: "t1" }, { phase: "revealed", ticketId: "t1" })).toBe(true);
  });

  it("is false when a page opens on an already revealed round", () => {
    expect(isRevealTransition({ phase: "idle", ticketId: "t1" }, { phase: "revealed", ticketId: "t1" })).toBe(false);
  });

  it("is false for a re-render without a phase change", () => {
    expect(isRevealTransition({ phase: "revealed", ticketId: "t1" }, { phase: "revealed", ticketId: "t1" })).toBe(false);
    expect(isRevealTransition({ phase: "voting", ticketId: "t1" }, { phase: "voting", ticketId: "t1" })).toBe(false);
  });

  it("is false when the ticket changed during voting", () => {
    expect(isRevealTransition({ phase: "voting", ticketId: "t1" }, { phase: "revealed", ticketId: "t2" })).toBe(false);
  });
});
