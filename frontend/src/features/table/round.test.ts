import { describe, expect, it } from "vitest";
import type { Player, RoomState, Ticket, TicketEntry } from "@shared/types";
import { currentEntry, estimateFromKey, roundKey, votersByEstimate } from "./round";

const ticket = (id: string): Ticket => ({
  id,
  identifier: `ENG-${id}`,
  title: `Ticket ${id}`,
  description: "",
  url: "",
  teamId: "team",
  teamKey: "ENG",
  stateName: "Todo",
  assignee: null,
  labels: [],
  currentEstimate: null,
});

const entry = (id: string): TicketEntry => ({ ticket: ticket(id), status: "todo", finalEstimate: null, sync: "none" });

const player = (id: string, name: string): Player => ({ id, name, connected: true, isHost: false });

const room = (overrides: Partial<RoomState> = {}): RoomState => ({
  code: "abc123",
  players: [player("p1", "Ada"), player("p2", "Grace")],
  tickets: [entry("1"), entry("2")],
  currentTicketId: "1",
  round: { phase: "idle", durationSec: 60, endsAt: null, voted: {}, votes: null },
  settings: { durationSec: 60, autoRevealWhenAllVoted: false },
  serverNow: 0,
  ...overrides,
});

describe("currentEntry", () => {
  it("finds the entry for the current ticket id", () => {
    expect(currentEntry(room({ currentTicketId: "2" }))?.ticket.identifier).toBe("ENG-2");
  });

  it("is null when no ticket is current", () => {
    expect(currentEntry(room({ currentTicketId: null }))).toBeNull();
  });

  it("is null when the current id is not in the list", () => {
    expect(currentEntry(room({ currentTicketId: "missing" }))).toBeNull();
  });
});

describe("roundKey", () => {
  it("changes when the round starts again", () => {
    const first = room({ round: { phase: "voting", durationSec: 60, endsAt: 1000, voted: {}, votes: null } });
    const second = room({ round: { phase: "voting", durationSec: 60, endsAt: 2000, voted: {}, votes: null } });
    expect(roundKey(first)).not.toBe(roundKey(second));
  });

  it("changes when the phase changes", () => {
    const voting = room({ round: { phase: "voting", durationSec: 60, endsAt: 1000, voted: {}, votes: null } });
    const revealed = room({ round: { phase: "revealed", durationSec: 60, endsAt: 1000, voted: {}, votes: {} } });
    expect(roundKey(voting)).not.toBe(roundKey(revealed));
  });

  it("changes when the ticket changes", () => {
    expect(roundKey(room({ currentTicketId: "1" }))).not.toBe(roundKey(room({ currentTicketId: "2" })));
  });

  it("is stable for the same round", () => {
    const state = room({ round: { phase: "voting", durationSec: 60, endsAt: 1000, voted: { p1: true }, votes: null } });
    expect(roundKey(state)).toBe(roundKey({ ...state, round: { ...state.round, voted: {} } }));
  });
});

describe("estimateFromKey", () => {
  it("maps the allowed number keys to estimates", () => {
    expect(estimateFromKey("1")).toBe(1);
    expect(estimateFromKey("2")).toBe(2);
    expect(estimateFromKey("3")).toBe(3);
    expect(estimateFromKey("5")).toBe(5);
    expect(estimateFromKey("8")).toBe(8);
  });

  it("ignores other keys", () => {
    expect(estimateFromKey("4")).toBeNull();
    expect(estimateFromKey("0")).toBeNull();
    expect(estimateFromKey("Enter")).toBeNull();
    expect(estimateFromKey("")).toBeNull();
  });
});

describe("votersByEstimate", () => {
  const players = [player("p1", "Ada"), player("p2", "Grace"), player("p3", "Linus")];

  it("groups voters under their numeric estimate", () => {
    const groups = votersByEstimate({ p1: 3, p2: 3, p3: 8 }, players);
    expect(groups[3]).toEqual([
      { id: "p1", name: "Ada" },
      { id: "p2", name: "Grace" },
    ]);
    expect(groups[8]).toEqual([{ id: "p3", name: "Linus" }]);
    expect(groups[1]).toEqual([]);
  });

  it("never counts coffee votes", () => {
    const groups = votersByEstimate({ p1: "coffee", p2: 5 }, players);
    expect(groups[5]).toEqual([{ id: "p2", name: "Grace" }]);
    const total = Object.values(groups).reduce((sum, voters) => sum + voters.length, 0);
    expect(total).toBe(1);
  });

  it("falls back to a placeholder name for voters who left", () => {
    const groups = votersByEstimate({ gone: 2 }, players);
    expect(groups[2]).toEqual([{ id: "gone", name: "Unknown" }]);
  });
});
