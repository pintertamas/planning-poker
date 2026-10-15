import { describe, expect, it } from "vitest";
import { fractionRemaining, remainingMs, timerTone, wholeSeconds } from "./timer";

describe("remainingMs", () => {
  it("subtracts the server-adjusted clock from endsAt", () => {
    expect(remainingMs(10_000, 4_000, 1_000)).toBe(5_000);
  });

  it("never goes below zero", () => {
    expect(remainingMs(10_000, 20_000, 0)).toBe(0);
  });

  it("applies a negative clock offset", () => {
    expect(remainingMs(10_000, 4_000, -1_000)).toBe(7_000);
  });
});

describe("fractionRemaining", () => {
  it("is the remaining share of the configured duration", () => {
    expect(fractionRemaining(30_000, 60)).toBe(0.5);
  });

  it("clamps to the unit interval", () => {
    expect(fractionRemaining(90_000, 60)).toBe(1);
    expect(fractionRemaining(-5, 60)).toBe(0);
  });

  it("is zero for a non-positive duration", () => {
    expect(fractionRemaining(30_000, 0)).toBe(0);
  });
});

describe("wholeSeconds", () => {
  it("rounds partial seconds up so the last second reads 1", () => {
    expect(wholeSeconds(59_001)).toBe(60);
    expect(wholeSeconds(59_000)).toBe(59);
    expect(wholeSeconds(1)).toBe(1);
  });

  it("reads zero once the round has ended", () => {
    expect(wholeSeconds(0)).toBe(0);
    expect(wholeSeconds(-300)).toBe(0);
  });
});

describe("timerTone", () => {
  it("is calm above 20 seconds", () => {
    expect(timerTone(20_000)).toBe("calm");
    expect(timerTone(60_000)).toBe("calm");
  });

  it("warns under 20 seconds", () => {
    expect(timerTone(19_999)).toBe("warning");
    expect(timerTone(10_000)).toBe("warning");
  });

  it("is critical under 10 seconds", () => {
    expect(timerTone(9_999)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
  });
});
