import type { Ticket } from "@shared/types";
import { describe, expect, it } from "vitest";
import { LinearAuthError, LinearError } from "../../linear/client";
import {
  appendUnique,
  errorMessage,
  importMessage,
  isHttpUrl,
  isInRoom,
  plural,
  pointsLabel,
  roomKeysOf,
  splitForRoom,
  trimDescription,
} from "./ticketHelpers";

function ticket(id: string): Ticket {
  return {
    id,
    identifier: `ENG-${id}`,
    title: `Ticket ${id}`,
    description: "",
    url: "https://linear.app/x/issue/ENG-1",
    teamId: "team",
    teamKey: "ENG",
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
  };
}

describe("trimDescription", () => {
  it("keeps short text and cuts long text to the limit", () => {
    expect(trimDescription("short")).toBe("short");
    expect(trimDescription("a".repeat(4001))).toHaveLength(4000);
  });

  it("never leaves a lone high surrogate at the cut", () => {
    const text = "a".repeat(3999) + "\u{1F600}";
    const trimmed = trimDescription(text);
    expect(trimmed).toBe("a".repeat(3999));
  });
});

describe("isHttpUrl", () => {
  it("accepts only http and https absolute URLs", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("HTTP://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,hi")).toBe(false);
    expect(isHttpUrl("/relative")).toBe(false);
    expect(isHttpUrl("https://")).toBe(false);
  });
});

describe("pointsLabel", () => {
  it("pluralises points", () => {
    expect(pointsLabel(1)).toBe("1 pt");
    expect(pointsLabel(5)).toBe("5 pts");
  });
});

describe("errorMessage", () => {
  it("tells the host to sign in again when the Linear session is rejected", () => {
    expect(errorMessage(new LinearAuthError("raw"))).toContain("Your Linear sign-in expired");
    expect(errorMessage(new LinearAuthError("raw"))).toContain("Create a new room to sign in again");
  });

  it("passes through Linear and plain errors and falls back for unknown values", () => {
    expect(errorMessage(new LinearError("Rate limited"))).toBe("Rate limited");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("nope")).toBe("Something went wrong. Try again.");
  });
});

describe("appendUnique", () => {
  it("appends new tickets and skips ones already listed", () => {
    const merged = appendUnique([ticket("1"), ticket("2")], [ticket("2"), ticket("3")]);
    expect(merged.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });
});

describe("roomKeysOf and isInRoom", () => {
  it("matches a ticket by id or by identifier, ignoring identifier case", () => {
    const keys = roomKeysOf([{ ticket: ticket("1") }]);
    expect(isInRoom(ticket("1"), keys)).toBe(true);
    expect(isInRoom({ ...ticket("9"), identifier: "eng-1" }, keys)).toBe(true);
    expect(isInRoom(ticket("2"), keys)).toBe(false);
  });
});

describe("splitForRoom", () => {
  it("keeps only tickets that are not in the room yet and counts the ones that are", () => {
    const keys = roomKeysOf([{ ticket: ticket("1") }, { ticket: ticket("2") }]);
    const { fresh, alreadyIn } = splitForRoom([ticket("2"), ticket("3"), ticket("1"), ticket("4")], keys);
    expect(fresh.map((item) => item.id)).toEqual(["3", "4"]);
    expect(alreadyIn).toBe(2);
  });

  it("treats a ticket with a known identifier under a new id as already in the room", () => {
    const keys = roomKeysOf([{ ticket: ticket("1") }]);
    const { fresh, alreadyIn } = splitForRoom([{ ...ticket("7"), identifier: "ENG-1" }], keys);
    expect(fresh).toEqual([]);
    expect(alreadyIn).toBe(1);
  });

  it("collapses repeats within the batch without counting them as already in the room", () => {
    const { fresh, alreadyIn } = splitForRoom([ticket("5"), ticket("5"), { ...ticket("6"), identifier: "eng-5" }], roomKeysOf([]));
    expect(fresh.map((item) => item.id)).toEqual(["5"]);
    expect(alreadyIn).toBe(0);
  });
});

describe("importMessage", () => {
  it("reports a plain add when nothing was already there", () => {
    expect(importMessage(3, 0)).toBe("Added 3 tickets");
    expect(importMessage(1, 0)).toBe("Added 1 ticket");
  });

  it("reports how many were already in the session", () => {
    expect(importMessage(3, 2)).toBe("Added 3 tickets, 2 were already in the session");
    expect(importMessage(2, 1)).toBe("Added 2 tickets, 1 was already in the session");
  });

  it("says so when every ticket was already there", () => {
    expect(importMessage(0, 4)).toBe("Those tickets are already in the session");
  });
});

describe("plural", () => {
  it("pluralises by count", () => {
    expect(plural(0, "ticket")).toBe("0 tickets");
    expect(plural(1, "ticket")).toBe("1 ticket");
    expect(plural(2, "ticket")).toBe("2 tickets");
  });
});
