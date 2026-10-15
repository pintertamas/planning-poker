import { describe, expect, it } from "vitest";
import { snapToAllowed, summarize } from "./stats";
import { COFFEE } from "./types";

describe("snapToAllowed", () => {
  it("returns allowed values unchanged", () => {
    for (const value of [1, 2, 3, 5, 8] as const) {
      expect(snapToAllowed(value)).toBe(value);
    }
  });

  it("clamps below the lowest and above the highest estimate", () => {
    expect(snapToAllowed(0)).toBe(1);
    expect(snapToAllowed(-4)).toBe(1);
    expect(snapToAllowed(8.1)).toBe(8);
    expect(snapToAllowed(100)).toBe(8);
  });

  it("snaps to the nearest value", () => {
    expect(snapToAllowed(1.4)).toBe(1);
    expect(snapToAllowed(4.4)).toBe(5);
    expect(snapToAllowed(5.9)).toBe(5);
    expect(snapToAllowed(6.4)).toBe(5);
    expect(snapToAllowed(7)).toBe(8);
  });

  it("breaks exact ties toward the higher value", () => {
    expect(snapToAllowed(1.5)).toBe(2);
    expect(snapToAllowed(2.5)).toBe(3);
    expect(snapToAllowed(4)).toBe(5);
    expect(snapToAllowed(6.5)).toBe(8);
  });
});

describe("summarize", () => {
  it("returns an empty summary with all counts present when there are no votes", () => {
    expect(summarize({})).toEqual({
      counts: { 1: 0, 2: 0, 3: 0, 5: 0, 8: 0 },
      voters: 0,
      coffee: 0,
      average: null,
      median: null,
      mode: null,
      suggested: null,
      consensus: false,
    });
  });

  it("returns null statistics and counts coffee when every vote is coffee", () => {
    const summary = summarize({ a: COFFEE, b: COFFEE, c: COFFEE });
    expect(summary.voters).toBe(0);
    expect(summary.coffee).toBe(3);
    expect(summary.average).toBeNull();
    expect(summary.median).toBeNull();
    expect(summary.mode).toBeNull();
    expect(summary.suggested).toBeNull();
    expect(summary.consensus).toBe(false);
  });

  it("counts each numeric vote and fills every key", () => {
    const summary = summarize({ a: 1, b: 1, c: 8 });
    expect(summary.counts).toEqual({ 1: 2, 2: 0, 3: 0, 5: 0, 8: 1 });
    expect(summary.voters).toBe(3);
  });

  it("treats a single vote as its own average, median and mode without consensus", () => {
    const summary = summarize({ a: 5 });
    expect(summary.average).toBe(5);
    expect(summary.median).toBe(5);
    expect(summary.mode).toBe(5);
    expect(summary.suggested).toBe(5);
    expect(summary.consensus).toBe(false);
  });

  it("reports consensus only when at least two numeric votes are identical", () => {
    expect(summarize({ a: 3, b: 3, c: 3 }).consensus).toBe(true);
    expect(summarize({ a: 3, b: 5 }).consensus).toBe(false);
    expect(summarize({ a: 3, b: 3, c: 5 }).consensus).toBe(false);
  });

  it("rounds the average to one decimal place", () => {
    expect(summarize({ a: 1, b: 2, c: 2 }).average).toBe(1.7);
    expect(summarize({ a: 2, b: 3 }).average).toBe(2.5);
    expect(summarize({ a: 1, b: 8 }).average).toBe(4.5);
  });

  it("uses the middle value as the median for an odd count", () => {
    expect(summarize({ a: 8, b: 1, c: 5 }).median).toBe(5);
  });

  it("averages the two middle values as the median for an even count", () => {
    expect(summarize({ a: 1, b: 2, c: 3, d: 5 }).median).toBe(2.5);
    expect(summarize({ a: 3, b: 5, c: 8, d: 8 }).median).toBe(6.5);
  });

  it("picks the highest count as the mode", () => {
    expect(summarize({ a: 2, b: 5, c: 5, d: 5, e: 3 }).mode).toBe(5);
  });

  it("breaks mode ties toward the higher value", () => {
    expect(summarize({ a: 2, b: 2, c: 3, d: 3 }).mode).toBe(3);
    expect(summarize({ a: 1, b: 1, c: 8, d: 8, e: 5 }).mode).toBe(8);
    expect(summarize({ a: 1, b: 1, c: 2 }).mode).toBe(1);
  });

  it("sets suggested to the mode", () => {
    const summary = summarize({ a: 2, b: 3, c: 3 });
    expect(summary.suggested).toBe(summary.mode);
    expect(summary.suggested).toBe(3);
  });

  it("ignores coffee for average, median, mode and consensus", () => {
    const summary = summarize({ a: 3, b: COFFEE, c: COFFEE, d: COFFEE });
    expect(summary.voters).toBe(1);
    expect(summary.coffee).toBe(3);
    expect(summary.average).toBe(3);
    expect(summary.median).toBe(3);
    expect(summary.mode).toBe(3);
    expect(summary.consensus).toBe(false);
  });

  it("keeps consensus when the only other vote is coffee", () => {
    const summary = summarize({ a: 3, b: 3, c: COFFEE });
    expect(summary.consensus).toBe(true);
    expect(summary.coffee).toBe(1);
    expect(summary.voters).toBe(2);
  });

  it("does not let coffee shift the median", () => {
    expect(summarize({ a: 1, b: COFFEE, c: 8 }).median).toBe(4.5);
  });
});
