import { describe, expect, it } from "vitest";
import { createRoom } from "./reducer";
import { sameSummary, summarizeRoom } from "./sessions";
import type { Player, ServerRoom, SessionSummary, Ticket, TicketEntry } from "./types";

const T0 = 1_000_000;

const player = (id: string, name: string, connected: boolean): Player => ({
  id,
  name,
  connected,
  isHost: false,
});

const entry = (id: string, status: TicketEntry["status"]): TicketEntry => {
  const ticket: Ticket = {
    id,
    identifier: `CLM-${id}`,
    title: `Ticket ${id}`,
    description: "",
    url: "",
    teamId: "t",
    teamKey: "CLM",
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
    blockedBy: [],
  };
  return { ticket, status, finalEstimate: null, sync: "none" };
};

const roomWith = (overrides: Partial<ServerRoom>): ServerRoom => ({
  ...createRoom("abc123", T0),
  ...overrides,
});

const summary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  code: "abc123",
  hostName: "Alice",
  players: 2,
  ticketsTotal: 3,
  ticketsGroomed: 1,
  phase: "voting",
  createdAt: T0,
  lastActivityAt: T0 + 5_000,
  ...overrides,
});

describe("summarizeRoom", () => {
  it("summarizes an empty fresh room", () => {
    expect(summarizeRoom(createRoom("abc123", T0))).toEqual({
      code: "abc123",
      hostName: "Host",
      players: 0,
      ticketsTotal: 0,
      ticketsGroomed: 0,
      phase: "idle",
      createdAt: T0,
      lastActivityAt: T0,
    });
  });

  it("uses the name of the player whose id is the host id", () => {
    const room = roomWith({
      hostId: "host-1",
      players: [player("guest-1", "Bob", true), player("host-1", "Alice", true)],
    });
    expect(summarizeRoom(room).hostName).toBe("Alice");
  });

  it("falls back to Host when the host player is not in the room", () => {
    const room = roomWith({ hostId: "gone-1", players: [player("guest-1", "Bob", true)] });
    expect(summarizeRoom(room).hostName).toBe("Host");
  });

  it("falls back to Host when there is no host id", () => {
    const room = roomWith({ hostId: null, players: [player("guest-1", "Bob", true)] });
    expect(summarizeRoom(room).hostName).toBe("Host");
  });

  it("counts only connected players", () => {
    const room = roomWith({
      players: [
        player("a", "A", true),
        player("b", "B", false),
        player("c", "C", true),
      ],
    });
    expect(summarizeRoom(room).players).toBe(2);
  });

  it("counts all tickets and only the groomed ones as groomed", () => {
    const room = roomWith({
      tickets: [entry("1", "groomed"), entry("2", "todo"), entry("3", "groomed")],
    });
    const result = summarizeRoom(room);
    expect(result.ticketsTotal).toBe(3);
    expect(result.ticketsGroomed).toBe(2);
  });

  it("reports the round phase", () => {
    const room = roomWith({
      round: { phase: "revealed", durationSec: 30, endsAt: null, votes: {}, revealed: {} },
    });
    expect(summarizeRoom(room).phase).toBe("revealed");
  });

  it("carries createdAt and lastActivityAt from the room", () => {
    const room = { ...roomWith({}), createdAt: T0, lastActivityAt: T0 + 9_000 };
    const result = summarizeRoom(room);
    expect(result.createdAt).toBe(T0);
    expect(result.lastActivityAt).toBe(T0 + 9_000);
  });
});

describe("sameSummary", () => {
  it("is true for identical summaries", () => {
    expect(sameSummary(summary(), summary())).toBe(true);
  });

  it("ignores lastActivityAt", () => {
    expect(sameSummary(summary(), summary({ lastActivityAt: T0 + 999_999 }))).toBe(true);
  });

  it.each<[string, Partial<SessionSummary>]>([
    ["code", { code: "zzz999" }],
    ["hostName", { hostName: "Bob" }],
    ["players", { players: 3 }],
    ["ticketsTotal", { ticketsTotal: 4 }],
    ["ticketsGroomed", { ticketsGroomed: 0 }],
    ["phase", { phase: "revealed" }],
    ["createdAt", { createdAt: T0 + 1 }],
  ])("is false when %s differs", (_field, change) => {
    expect(sameSummary(summary(), summary(change))).toBe(false);
  });
});
