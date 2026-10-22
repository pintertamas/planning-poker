import { describe, expect, it } from "vitest";
import { sanitizeAction } from "./sanitize";
import { MAX_TICKETS } from "@shared/types";

const validTicket = {
  id: "uuid-1",
  identifier: "CLM-1",
  title: "Title",
  description: "Body",
  url: "https://linear.app/x/CLM-1",
  teamId: "team-1",
  teamKey: "CLM",
  stateName: "Todo",
  assignee: null,
  labels: ["backend"],
  currentEstimate: null,
};

describe("sanitizeAction blockedBy", () => {
  it("defaults blockedBy to an empty list when an older client omits it", () => {
    expect(sanitizeAction({ type: "addTickets", tickets: [validTicket] })).toEqual({
      type: "addTickets",
      tickets: [{ ...validTicket, blockedBy: [] }],
    });
  });

  it("accepts up to 20 blocker ids of at most 100 characters", () => {
    const blockedBy = Array.from({ length: 20 }, (_, i) => `blocker-${i}`);
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy }] })).toEqual({
      type: "addTickets",
      tickets: [{ ...validTicket, blockedBy }],
    });
    const longest = "b".repeat(100);
    expect(
      sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy: [longest] }] }),
    ).not.toBeNull();
  });

  it("rejects more than 20 blocker ids", () => {
    const blockedBy = Array.from({ length: 21 }, (_, i) => `blocker-${i}`);
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy }] })).toBeNull();
  });

  it("rejects blocker ids that are too long or not strings", () => {
    expect(
      sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy: ["b".repeat(101)] }] }),
    ).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy: [42] }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy: "id-1" }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, blockedBy: null }] })).toBeNull();
  });
});

describe("sanitizeAction ordering", () => {
  it("validates reorderTickets with an array of id strings", () => {
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: ["a", "b"], extra: 1 })).toEqual({
      type: "reorderTickets",
      ticketIds: ["a", "b"],
    });
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: [] })).toEqual({
      type: "reorderTickets",
      ticketIds: [],
    });
  });

  it("rejects reorderTickets with a malformed list", () => {
    expect(sanitizeAction({ type: "reorderTickets" })).toBeNull();
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: "a" })).toBeNull();
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: ["a", 2] })).toBeNull();
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: [null] })).toBeNull();
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: ["i".repeat(201)] })).toBeNull();
  });

  it("limits reorderTickets to MAX_TICKETS ids", () => {
    const atLimit = Array.from({ length: MAX_TICKETS }, (_, i) => `id-${i}`);
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: atLimit })).not.toBeNull();
    expect(sanitizeAction({ type: "reorderTickets", ticketIds: [...atLimit, "extra"] })).toBeNull();
  });

  it("accepts resetOrder and strips extra fields", () => {
    expect(sanitizeAction({ type: "resetOrder", extra: true })).toEqual({ type: "resetOrder" });
  });
});
