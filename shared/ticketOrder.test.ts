import { describe, expect, it } from "vitest";
import { applyPermutation, defaultOrder, ticketNumber } from "./ticketOrder";
import type { TicketEntry } from "./types";

const todo = (identifier: string, blockedBy: string[] = [], teamKey = identifier.split("-")[0] ?? ""): TicketEntry => ({
  ticket: {
    id: `id-${identifier}`,
    identifier,
    title: identifier,
    description: "",
    url: "",
    teamId: "team",
    teamKey,
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
    blockedBy: blockedBy.map((ref) => `id-${ref}`),
  },
  status: "todo",
  finalEstimate: null,
  sync: "none",
});

const groomed = (identifier: string): TicketEntry => ({ ...todo(identifier), status: "groomed", finalEstimate: 3 });

const identifiers = (entries: TicketEntry[]): string[] => entries.map((entry) => entry.ticket.identifier);

describe("ticketNumber", () => {
  it("reads the number after the last dash", () => {
    expect(ticketNumber("CLM-12")).toBe(12);
    expect(ticketNumber("CLM-1107")).toBe(1107);
  });

  it("sorts identifiers without a number after every numbered one", () => {
    expect(ticketNumber("CLM")).toBeGreaterThan(ticketNumber("CLM-999999"));
    expect(ticketNumber("CLM-x")).toBeGreaterThan(ticketNumber("CLM-999999"));
  });
});

describe("defaultOrder", () => {
  it("returns an empty list for no tickets", () => {
    expect(defaultOrder([])).toEqual([]);
  });

  it("orders independent tickets by team key and then ticket number", () => {
    const entries = [todo("OPS-1"), todo("CTTP-10"), todo("CTTP-2"), todo("CTTP-9")];
    expect(identifiers(defaultOrder(entries))).toEqual(["CTTP-2", "CTTP-9", "CTTP-10", "OPS-1"]);
  });

  it("compares numbers numerically rather than as text", () => {
    expect(identifiers(defaultOrder([todo("DEMO-105"), todo("DEMO-99"), todo("DEMO-100")]))).toEqual([
      "DEMO-99",
      "DEMO-100",
      "DEMO-105",
    ]);
  });

  it("places a blocker before the ticket it blocks even when its number is higher", () => {
    const entries = [todo("DEMO-101", ["DEMO-105"]), todo("DEMO-102"), todo("DEMO-105")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-102", "DEMO-105", "DEMO-101"]);
  });

  it("keeps the number order of independent tickets around a dependency", () => {
    const entries = [todo("DEMO-101", ["DEMO-104"]), todo("DEMO-102"), todo("DEMO-103"), todo("DEMO-104")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-102", "DEMO-103", "DEMO-104", "DEMO-101"]);
  });

  it("orders a chain of blockers from the root to the leaf", () => {
    const entries = [todo("DEMO-1", ["DEMO-2"]), todo("DEMO-2", ["DEMO-3"]), todo("DEMO-3")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-3", "DEMO-2", "DEMO-1"]);
  });

  it("lets one blocker unblock several dependents in number order", () => {
    const entries = [todo("DEMO-9", ["DEMO-1"]), todo("DEMO-4", ["DEMO-1"]), todo("DEMO-1")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-1", "DEMO-4", "DEMO-9"]);
  });

  it("ignores blockers that are not in the room", () => {
    const entries = [todo("DEMO-3", ["OTHER-7"]), todo("DEMO-2")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-2", "DEMO-3"]);
  });

  it("ignores blockers that are already groomed", () => {
    const entries = [groomed("DEMO-5"), todo("DEMO-3", ["DEMO-5"]), todo("DEMO-2")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-5", "DEMO-2", "DEMO-3"]);
  });

  it("ignores a ticket that lists itself as a blocker", () => {
    const entries = [todo("DEMO-2", ["DEMO-2"]), todo("DEMO-1")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-1", "DEMO-2"]);
  });

  it("keeps groomed tickets in their slots and orders only the todo tickets among the rest", () => {
    const entries = [groomed("DEMO-50"), todo("DEMO-9"), todo("DEMO-1"), groomed("DEMO-60"), todo("DEMO-5")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-50", "DEMO-1", "DEMO-5", "DEMO-60", "DEMO-9"]);
  });

  it("keeps a groomed ticket in place even when it would sort elsewhere", () => {
    const entries = [todo("DEMO-3"), groomed("DEMO-1"), todo("DEMO-2")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-2", "DEMO-1", "DEMO-3"]);
  });

  it("keeps a groomed ticket fixed while the todo tickets around it move", () => {
    const entries = [todo("DEMO-7", ["DEMO-8"]), groomed("DEMO-6"), todo("DEMO-8")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-8", "DEMO-6", "DEMO-7"]);
  });

  it("falls back to number order inside a cycle and still returns every ticket", () => {
    const entries = [todo("DEMO-3", ["DEMO-2"]), todo("DEMO-2", ["DEMO-3"]), todo("DEMO-1")];
    expect(identifiers(defaultOrder(entries))).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
  });

  it("does not crash on a cycle that a ticket outside of it depends on", () => {
    const entries = [todo("DEMO-4", ["DEMO-5"]), todo("DEMO-5", ["DEMO-6"]), todo("DEMO-6", ["DEMO-5"])];
    const ordered = identifiers(defaultOrder(entries));
    expect([...ordered].sort()).toEqual(["DEMO-4", "DEMO-5", "DEMO-6"]);
    expect(ordered.indexOf("DEMO-5")).toBeLessThan(ordered.indexOf("DEMO-4"));
  });

  it("keeps a pinned todo ticket in its slot and orders the rest around it", () => {
    const entries = [todo("DEMO-3"), todo("DEMO-2"), todo("DEMO-1")];
    expect(identifiers(defaultOrder(entries, "id-DEMO-2"))).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
    expect(identifiers(defaultOrder([todo("DEMO-9"), todo("DEMO-5"), todo("DEMO-1")], "id-DEMO-9"))).toEqual([
      "DEMO-9",
      "DEMO-1",
      "DEMO-5",
    ]);
  });

  it("does not mutate the input array or its entries", () => {
    const entries = [todo("DEMO-2", ["DEMO-1"]), todo("DEMO-1")];
    const snapshot = structuredClone(entries);
    defaultOrder(entries);
    expect(entries).toEqual(snapshot);
  });

  it("returns the same entries it was given", () => {
    const entries = [todo("DEMO-2"), todo("DEMO-1", ["DEMO-2"])];
    const ordered = defaultOrder(entries);
    expect(ordered).toHaveLength(entries.length);
    expect(ordered.every((entry) => entries.includes(entry))).toBe(true);
  });
});

describe("applyPermutation", () => {
  const entries = [todo("DEMO-1"), groomed("DEMO-2"), todo("DEMO-3")];

  it("reorders the entries to the given id sequence", () => {
    const result = applyPermutation(entries, ["id-DEMO-3", "id-DEMO-1", "id-DEMO-2"]);
    expect(result && identifiers(result)).toEqual(["DEMO-3", "DEMO-1", "DEMO-2"]);
  });

  it("rejects a list that misses a ticket", () => {
    expect(applyPermutation(entries, ["id-DEMO-1", "id-DEMO-2"])).toBeNull();
  });

  it("rejects a list with an unknown id", () => {
    expect(applyPermutation(entries, ["id-DEMO-1", "id-DEMO-2", "id-DEMO-9"])).toBeNull();
  });

  it("rejects a list that repeats an id to fill the length", () => {
    expect(applyPermutation(entries, ["id-DEMO-1", "id-DEMO-1", "id-DEMO-3"])).toBeNull();
  });

  it("accepts an empty room with an empty list", () => {
    expect(applyPermutation([], [])).toEqual([]);
  });
});
