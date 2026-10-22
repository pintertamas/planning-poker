import { describe, expect, it } from "vitest";
import type { TicketEntry } from "@shared/types";
import {
  blockedByLabel,
  blockerBelow,
  countAbove,
  dropIndex,
  moveItem,
  openBlockers,
  orderedBy,
  positionAnnouncement,
  segmentOf,
  stepTarget,
  unblocksCount,
} from "./ticketOrderView";

const entry = (identifier: string, blockedBy: string[] = [], status: "todo" | "groomed" = "todo"): TicketEntry => ({
  ticket: {
    id: `id-${identifier}`,
    identifier,
    title: identifier,
    description: "",
    url: "",
    teamId: "team",
    teamKey: "DEMO",
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
    blockedBy: blockedBy.map((ref) => `id-${ref}`),
  },
  status,
  finalEstimate: status === "groomed" ? 3 : null,
  sync: "none",
});

const ids = (entries: TicketEntry[]): string[] => entries.map((item) => item.ticket.identifier);

describe("openBlockers", () => {
  it("returns only blockers that are in the room and not groomed", () => {
    const entries = [entry("DEMO-1"), entry("DEMO-2", [], "groomed"), entry("DEMO-3", ["DEMO-1", "DEMO-2", "OTHER-9"])];
    expect(ids(openBlockers(entries[2] as TicketEntry, entries))).toEqual(["DEMO-1"]);
  });

  it("returns an empty list when nothing blocks the ticket", () => {
    const entries = [entry("DEMO-1")];
    expect(openBlockers(entries[0] as TicketEntry, entries)).toEqual([]);
  });
});

describe("blockedByLabel", () => {
  it("names one or two blockers", () => {
    expect(blockedByLabel(["CTTP-12"])).toBe("Blocked by CTTP-12");
    expect(blockedByLabel(["CTTP-12", "CTTP-40"])).toBe("Blocked by CTTP-12, CTTP-40");
  });

  it("shows two blockers and a count for the rest", () => {
    expect(blockedByLabel(["A-1", "A-2", "A-3"])).toBe("Blocked by A-1, A-2 +1");
    expect(blockedByLabel(["A-1", "A-2", "A-3", "A-4", "A-5"])).toBe("Blocked by A-1, A-2 +3");
  });
});

describe("unblocksCount", () => {
  it("counts the open tickets that wait on this one", () => {
    const entries = [entry("DEMO-5"), entry("DEMO-1", ["DEMO-5"]), entry("DEMO-2", ["DEMO-5"]), entry("DEMO-3")];
    expect(unblocksCount(entries[0] as TicketEntry, entries)).toBe(2);
    expect(unblocksCount(entries[3] as TicketEntry, entries)).toBe(0);
  });

  it("does not count dependents that are already groomed", () => {
    const entries = [entry("DEMO-5"), entry("DEMO-1", ["DEMO-5"], "groomed")];
    expect(unblocksCount(entries[0] as TicketEntry, entries)).toBe(0);
  });
});

describe("blockerBelow", () => {
  it("finds an open blocker that sits lower in the list", () => {
    const entries = [entry("DEMO-1", ["DEMO-3"]), entry("DEMO-2"), entry("DEMO-3")];
    expect(blockerBelow(0, entries[0] as TicketEntry, entries)?.ticket.identifier).toBe("DEMO-3");
  });

  it("ignores blockers above the ticket and groomed blockers below it", () => {
    const entries = [entry("DEMO-1"), entry("DEMO-2", ["DEMO-1"]), entry("DEMO-3", ["DEMO-4"]), entry("DEMO-4", [], "groomed")];
    expect(blockerBelow(1, entries[1] as TicketEntry, entries)).toBeNull();
    expect(blockerBelow(2, entries[2] as TicketEntry, entries)).toBeNull();
  });
});

describe("segmentOf", () => {
  it("covers the whole todo block when nothing is groomed", () => {
    const entries = [entry("DEMO-1"), entry("DEMO-2"), entry("DEMO-3")];
    expect(segmentOf(entries, 1)).toEqual({ start: 0, end: 2 });
  });

  it("stops at groomed rows on either side", () => {
    const entries = [entry("DEMO-1", [], "groomed"), entry("DEMO-2"), entry("DEMO-3"), entry("DEMO-4", [], "groomed"), entry("DEMO-5")];
    expect(segmentOf(entries, 2)).toEqual({ start: 1, end: 2 });
    expect(segmentOf(entries, 4)).toEqual({ start: 4, end: 4 });
  });

  it("returns a single slot for a groomed row", () => {
    const entries = [entry("DEMO-1", [], "groomed"), entry("DEMO-2")];
    expect(segmentOf(entries, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("countAbove and dropIndex", () => {
  it("counts midpoints above the pointer", () => {
    expect(countAbove([10, 30, 50], 35)).toBe(2);
    expect(countAbove([10, 30, 50], 5)).toBe(0);
    expect(countAbove([10, 30, 50], 90)).toBe(3);
  });

  it("drops the dragged row where the pointer is among the other rows", () => {
    const segment = { start: 0, end: 2 };
    const midpoints = [10, 30, 50];
    expect(dropIndex(segment, 0, midpoints, 5)).toBe(0);
    expect(dropIndex(segment, 0, midpoints, 35)).toBe(1);
    expect(dropIndex(segment, 0, midpoints, 90)).toBe(2);
    expect(dropIndex(segment, 2, midpoints, 5)).toBe(0);
  });

  it("uses absolute indices for a segment that does not start at zero", () => {
    const segment = { start: 2, end: 4 };
    expect(dropIndex(segment, 3, [10, 30, 50], 90)).toBe(4);
    expect(dropIndex(segment, 4, [10, 30, 50], 5)).toBe(2);
  });

  it("gives the same result as moving the item to the computed index", () => {
    const items = ["a", "b", "c", "d"];
    const segment = { start: 0, end: 3 };
    const midpoints = [10, 30, 50, 70];
    expect(moveItem(items, 0, dropIndex(segment, 0, midpoints, 55))).toEqual(["b", "c", "a", "d"]);
  });
});

describe("moveItem", () => {
  it("moves an item forward and backward", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns a copy for a no-op move", () => {
    const items = ["a", "b"];
    const result = moveItem(items, 1, 1);
    expect(result).toEqual(["a", "b"]);
    expect(result).not.toBe(items);
  });

  it("clamps the target and ignores an invalid source", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const items = ["a", "b", "c"];
    moveItem(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("stepTarget", () => {
  const segment = { start: 1, end: 3 };

  it("steps up and down inside the segment", () => {
    expect(stepTarget(segment, 2, -1)).toBe(1);
    expect(stepTarget(segment, 2, 1)).toBe(3);
  });

  it("refuses to step past the segment edges", () => {
    expect(stepTarget(segment, 1, -1)).toBeNull();
    expect(stepTarget(segment, 3, 1)).toBeNull();
  });
});

describe("orderedBy", () => {
  it("applies a pending id order to the entries", () => {
    const entries = [entry("DEMO-1"), entry("DEMO-2"), entry("DEMO-3")];
    expect(ids(orderedBy(entries, ["id-DEMO-3", "id-DEMO-1", "id-DEMO-2"]))).toEqual(["DEMO-3", "DEMO-1", "DEMO-2"]);
  });

  it("falls back to the entries when the ids do not cover them", () => {
    const entries = [entry("DEMO-1"), entry("DEMO-2")];
    expect(orderedBy(entries, ["id-DEMO-2"])).toBe(entries);
  });
});

describe("positionAnnouncement", () => {
  it("describes the new one-based position", () => {
    expect(positionAnnouncement("DEMO-102", 2, 5)).toBe("DEMO-102 moved to position 2 of 5");
  });
});
