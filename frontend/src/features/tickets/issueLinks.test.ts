import { describe, expect, it } from "vitest";
import type { RoomState, Ticket, TicketEntry } from "@shared/types";
import { REFERENCE_FETCH_LIMIT, extractIssueIdentifiers, findKnownTicket, parseIssueUrl, unresolvedIdentifiers } from "./issueLinks";

const ticket = (identifier: string, title = `Title ${identifier}`): Ticket => ({
  id: `id-${identifier}`,
  identifier,
  title,
  description: "",
  url: `https://linear.app/ws/issue/${identifier}`,
  teamId: "team",
  teamKey: identifier.split("-")[0] ?? "",
  stateName: "Todo",
  assignee: null,
  labels: [],
  currentEstimate: null,
});

const entry = (identifier: string): TicketEntry => ({
  ticket: ticket(identifier),
  status: "todo",
  finalEstimate: null,
  sync: "none",
});

const stateOf = (tickets: TicketEntry[], references: Record<string, Ticket> = {}): Pick<RoomState, "tickets" | "references"> => ({
  tickets,
  references,
});

describe("parseIssueUrl", () => {
  it("reads the identifier from a Linear issue URL with a slug", () => {
    expect(parseIssueUrl("https://linear.app/marshmallow/issue/CTTP-1234/restrict-cancelling")).toBe("CTTP-1234");
  });

  it("accepts URLs without a slug and with a trailing path, query or hash", () => {
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-1")).toBe("CTTP-1");
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-1/")).toBe("CTTP-1");
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-1/slug/comment/abc")).toBe("CTTP-1");
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-1?view=x")).toBe("CTTP-1");
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-1#comment-2")).toBe("CTTP-1");
  });

  it("upper-cases the identifier and accepts any workspace", () => {
    expect(parseIssueUrl("https://linear.app/other-team/issue/cttp-77/x")).toBe("CTTP-77");
  });

  it("rejects URLs that are not Linear issues", () => {
    expect(parseIssueUrl("https://linear.app/acme/project/payments-1234")).toBeNull();
    expect(parseIssueUrl("https://linear.app/acme/issue/not-an-id")).toBeNull();
    expect(parseIssueUrl("https://linear.app/acme/issue/CTTP-12x")).toBeNull();
    expect(parseIssueUrl("https://linear.app.example.com/acme/issue/CTTP-1")).toBeNull();
    expect(parseIssueUrl("https://example.com/linear.app/acme/issue/CTTP-1")).toBeNull();
    expect(parseIssueUrl("javascript:alert(1)")).toBeNull();
    expect(parseIssueUrl("CTTP-1234")).toBeNull();
  });
});

describe("extractIssueIdentifiers", () => {
  it("finds issue URLs in markdown links and bare text, unique and in order", () => {
    const markdown = [
      "Blocked by [CTTP-1234](https://linear.app/marshmallow/issue/CTTP-1234/restrict).",
      "See https://linear.app/marshmallow/issue/cttp-99/other, then https://linear.app/marshmallow/issue/CTTP-1234.",
      "Also (https://linear.app/marshmallow/issue/DEMO-7/x)",
    ].join("\n");
    expect(extractIssueIdentifiers(markdown)).toEqual(["CTTP-1234", "CTTP-99", "DEMO-7"]);
  });

  it("ignores links that are not Linear issues and plain identifiers", () => {
    expect(extractIssueIdentifiers("[docs](https://example.com/issue/CTTP-1) CTTP-2 https://linear.app/acme/project/x")).toEqual([]);
  });

  it("returns nothing for text without links", () => {
    expect(extractIssueIdentifiers("")).toEqual([]);
  });
});

describe("findKnownTicket", () => {
  it("finds room tickets first and then references, ignoring case", () => {
    const state = stateOf([entry("CTTP-1")], { "CTTP-2": ticket("CTTP-2", "Reference title") });
    expect(findKnownTicket("cttp-1", state)?.identifier).toBe("CTTP-1");
    expect(findKnownTicket("CTTP-2", state)?.title).toBe("Reference title");
  });

  it("returns null for unknown identifiers and a missing state", () => {
    expect(findKnownTicket("CTTP-9", stateOf([entry("CTTP-1")]))).toBeNull();
    expect(findKnownTicket("CTTP-1", null)).toBeNull();
  });

  it("does not match inherited object keys", () => {
    expect(findKnownTicket("CONSTRUCTOR", stateOf([]))).toBeNull();
  });
});

describe("unresolvedIdentifiers", () => {
  it("drops identifiers that are already known and de-duplicates across sources", () => {
    const sources = [
      "[a](https://linear.app/x/issue/CTTP-1/a) https://linear.app/x/issue/CTTP-2/b",
      "https://linear.app/x/issue/CTTP-2/b https://linear.app/x/issue/CTTP-3/c",
    ];
    expect(unresolvedIdentifiers(sources, new Set(["CTTP-1"]))).toEqual(["CTTP-2", "CTTP-3"]);
  });

  it("stops at the fetch limit", () => {
    const source = Array.from({ length: REFERENCE_FETCH_LIMIT + 10 }, (_, i) => `https://linear.app/x/issue/CTTP-${i + 1}`).join(" ");
    const identifiers = unresolvedIdentifiers([source], new Set());
    expect(identifiers).toHaveLength(REFERENCE_FETCH_LIMIT);
    expect(identifiers[0]).toBe("CTTP-1");
  });
});
