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

describe("sanitizeAction", () => {
  it("rejects non-object input", () => {
    expect(sanitizeAction(null)).toBeNull();
    expect(sanitizeAction("startRound")).toBeNull();
    expect(sanitizeAction([{ type: "startRound" }])).toBeNull();
    expect(sanitizeAction({})).toBeNull();
    expect(sanitizeAction({ type: 42 })).toBeNull();
  });

  it("rejects unknown action types", () => {
    expect(sanitizeAction({ type: "explode" })).toBeNull();
    expect(sanitizeAction({ type: "join", playerId: "x", name: "x", asHost: true })).toBeNull();
  });

  it("accepts argument-less actions and strips extra fields", () => {
    expect(sanitizeAction({ type: "startRound", extra: 1 })).toEqual({ type: "startRound" });
    expect(sanitizeAction({ type: "reveal" })).toEqual({ type: "reveal" });
    expect(sanitizeAction({ type: "revote" })).toEqual({ type: "revote" });
  });

  it("validates rename", () => {
    expect(sanitizeAction({ type: "rename", name: "Ada" })).toEqual({ type: "rename", name: "Ada" });
    expect(sanitizeAction({ type: "rename", name: 5 })).toBeNull();
    expect(sanitizeAction({ type: "rename" })).toBeNull();
  });

  it("validates vote and accept as numbers", () => {
    expect(sanitizeAction({ type: "vote", value: 3 })).toEqual({ type: "vote", value: 3 });
    expect(sanitizeAction({ type: "vote", value: "3" })).toBeNull();
    expect(sanitizeAction({ type: "accept", estimate: 8 })).toEqual({ type: "accept", estimate: 8 });
    expect(sanitizeAction({ type: "accept", estimate: null })).toBeNull();
  });

  it("validates ticket id actions", () => {
    expect(sanitizeAction({ type: "removeTicket", ticketId: "t1" })).toEqual({
      type: "removeTicket",
      ticketId: "t1",
    });
    expect(sanitizeAction({ type: "setCurrent", ticketId: 1 })).toBeNull();
  });

  it("validates setSync against the sync enum", () => {
    expect(sanitizeAction({ type: "setSync", ticketId: "t1", sync: "synced" })).toEqual({
      type: "setSync",
      ticketId: "t1",
      sync: "synced",
    });
    expect(sanitizeAction({ type: "setSync", ticketId: "t1", sync: "done" })).toBeNull();
    expect(sanitizeAction({ type: "setSync", ticketId: "t1" })).toBeNull();
  });

  it("validates updateSettings fields when present", () => {
    expect(sanitizeAction({ type: "updateSettings", durationSec: 90 })).toEqual({
      type: "updateSettings",
      durationSec: 90,
      autoRevealWhenAllVoted: undefined,
    });
    expect(sanitizeAction({ type: "updateSettings", autoRevealWhenAllVoted: false })).toEqual({
      type: "updateSettings",
      durationSec: undefined,
      autoRevealWhenAllVoted: false,
    });
    expect(sanitizeAction({ type: "updateSettings", durationSec: "90" })).toBeNull();
    expect(sanitizeAction({ type: "updateSettings", autoRevealWhenAllVoted: "yes" })).toBeNull();
  });

  it("accepts a valid addTickets and returns a cleaned copy", () => {
    const result = sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, extra: true }] });
    expect(result).toEqual({ type: "addTickets", tickets: [validTicket] });
  });

  it("accepts an empty addTickets list", () => {
    expect(sanitizeAction({ type: "addTickets", tickets: [] })).toEqual({
      type: "addTickets",
      tickets: [],
    });
  });

  it("rejects addTickets with more than MAX_TICKETS entries", () => {
    const tickets = Array.from({ length: MAX_TICKETS + 1 }, () => validTicket);
    expect(sanitizeAction({ type: "addTickets", tickets })).toBeNull();
    const atLimit = Array.from({ length: MAX_TICKETS }, () => validTicket);
    expect(sanitizeAction({ type: "addTickets", tickets: atLimit })).not.toBeNull();
  });

  it("rejects addTickets when a ticket is malformed", () => {
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, title: null }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, labels: "x" }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, assignee: {} }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, currentEstimate: "3" }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, currentEstimate: NaN }] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: ["ticket"] })).toBeNull();
    expect(sanitizeAction({ type: "addTickets", tickets: null })).toBeNull();
  });

  it("truncates string fields to their maximum lengths", () => {
    const result = sanitizeAction({
      type: "addTickets",
      tickets: [
        {
          ...validTicket,
          id: "i".repeat(250),
          title: "t".repeat(400),
          description: "d".repeat(9000),
          assignee: "a".repeat(150),
          labels: ["l".repeat(80), "m"],
        },
      ],
    });
    expect(result).toEqual({
      type: "addTickets",
      tickets: [
        {
          ...validTicket,
          id: "i".repeat(200),
          title: "t".repeat(300),
          description: "d".repeat(8000),
          assignee: "a".repeat(100),
          labels: ["l".repeat(50), "m"],
        },
      ],
    });
  });

  it("limits labels to 20 entries", () => {
    const labels = Array.from({ length: 21 }, (_, i) => `label${i}`);
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, labels }] })).toBeNull();
    const twenty = labels.slice(0, 20);
    expect(sanitizeAction({ type: "addTickets", tickets: [{ ...validTicket, labels: twenty }] })).not.toBeNull();
  });

  it("coerces primitive string fields via String", () => {
    const result = sanitizeAction({
      type: "addTickets",
      tickets: [{ ...validTicket, identifier: 42, labels: [7] }],
    });
    expect(result).toEqual({
      type: "addTickets",
      tickets: [{ ...validTicket, identifier: "42", labels: ["7"] }],
    });
  });

  it("accepts a numeric currentEstimate", () => {
    const result = sanitizeAction({
      type: "addTickets",
      tickets: [{ ...validTicket, currentEstimate: 5 }],
    });
    expect(result).toEqual({ type: "addTickets", tickets: [{ ...validTicket, currentEstimate: 5 }] });
  });
});
