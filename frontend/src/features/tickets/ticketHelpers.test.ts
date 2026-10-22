import type { Ticket } from "@shared/types";
import { describe, expect, it } from "vitest";
import { LinearAuthError, LinearError } from "../../linear/client";
import { appendUnique, errorMessage, isHttpUrl, pointsLabel, trimDescription } from "./ticketHelpers";

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
    blockedBy: [],
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
