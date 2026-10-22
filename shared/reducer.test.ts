import { describe, expect, it } from "vitest";
import { createRoom, nextAlarmAt, reduce, toPublicState } from "./reducer";
import {
  COFFEE,
  DEFAULT_ROOM_LIMITS,
  DEFAULT_TIMER_SEC,
  HEARTBEAT_CHECK_MS,
  HEARTBEAT_TIMEOUT_MS,
  IDLE_EMPTY_TTL_MS,
  MAX_PLAYERS,
  MAX_REFERENCES,
  MAX_ROOM_AGE_MS,
  MAX_TICKETS,
} from "./types";
import type {
  Actor,
  ClientAction,
  Estimate,
  ReduceResult,
  RoomLimits,
  ServerAction,
  ServerRoom,
  Ticket,
} from "./types";

const T0 = 1_000_000;
const HOST: Actor = { playerId: "h", isHost: true };
const as = (playerId: string): Actor => ({ playerId, isHost: false });

const ticket = (id: string): Ticket => ({
  id,
  identifier: `CLM-${id}`,
  title: `Ticket ${id}`,
  description: "",
  url: `https://linear.app/example/${id}`,
  teamId: "team",
  teamKey: "CLM",
  stateName: "Todo",
  assignee: null,
  labels: ["backend"],
  currentEstimate: null,
});

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const must = (result: ReduceResult): ServerRoom => {
  expect(result.error).toBeUndefined();
  return result.room;
};

const act = (
  room: ServerRoom,
  action: ServerAction,
  actor: Actor = HOST,
  now: number = T0,
): ServerRoom => must(reduce(room, action, actor, now));

const seat = (
  room: ServerRoom,
  playerId: string,
  name: string,
  asHost = false,
  now: number = T0,
): ServerRoom => act(room, { type: "join", playerId, name, asHost }, as(playerId), now);

const lobby = (): ServerRoom => {
  let room = createRoom("abc123", T0);
  room = seat(room, "h", "Host", true);
  room = seat(room, "a", "Alice");
  room = seat(room, "b", "Bob");
  return room;
};

const withTickets = (room: ServerRoom, ids: string[]): ServerRoom =>
  act(room, { type: "addTickets", tickets: ids.map(ticket) });

const votingRoom = (now: number = T0): ServerRoom =>
  act(withTickets(lobby(), ["t1", "t2", "t3"]), { type: "startRound" }, HOST, now);

const statusOf = (room: ServerRoom, id: string) =>
  room.tickets.find((entry) => entry.ticket.id === id);

describe("createRoom", () => {
  it("creates an idle room with defaults", () => {
    expect(createRoom("abc123", T0)).toEqual({
      code: "abc123",
      createdAt: T0,
      lastActivityAt: T0,
      hostId: null,
      players: [],
      tickets: [],
      references: {},
      currentTicketId: null,
      round: {
        phase: "idle",
        durationSec: DEFAULT_TIMER_SEC,
        endsAt: null,
        votes: {},
        revealed: null,
      },
      settings: { durationSec: DEFAULT_TIMER_SEC, autoRevealWhenAllVoted: true },
    });
  });
});

describe("join", () => {
  it("appends a connected player who is not the host", () => {
    const room = seat(createRoom("abc123", T0), "a", "Alice");
    expect(room.players).toEqual([{ id: "a", name: "Alice", connected: true, isHost: false }]);
    expect(room.hostId).toBeNull();
  });

  it("makes the player host when asHost is set and flags only the host", () => {
    let room = seat(createRoom("abc123", T0), "a", "Alice");
    room = seat(room, "h", "Host", true);
    expect(room.hostId).toBe("h");
    expect(room.players.find((p) => p.id === "h")?.isHost).toBe(true);
    expect(room.players.find((p) => p.id === "a")?.isHost).toBe(false);
  });

  it("moves host status when another player joins as host", () => {
    let room = seat(createRoom("abc123", T0), "h", "Host", true);
    room = seat(room, "a", "Alice", true);
    expect(room.hostId).toBe("a");
    expect(room.players.map((p) => [p.id, p.isHost])).toEqual([
      ["h", false],
      ["a", true],
    ]);
  });

  it("keeps the host when a non-host player joins", () => {
    const room = lobby();
    expect(room.hostId).toBe("h");
    expect(room.players.find((p) => p.id === "h")?.isHost).toBe(true);
  });

  it("rejoining an existing player updates the name, reconnects and keeps the seat and vote", () => {
    let room = votingRoom();
    room = act(room, { type: "vote", value: 5 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = seat(room, "a", "  Alicia  ", false, T0 + 5);
    expect(room.players.map((p) => p.id)).toEqual(["h", "a", "b"]);
    expect(room.players[1]).toEqual({ id: "a", name: "Alicia", connected: true, isHost: false });
    expect(room.round.votes).toEqual({ a: 5 });
  });

  it("rejects a new player with room_full once the room holds MAX_PLAYERS", () => {
    let room = createRoom("abc123", T0);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      room = seat(room, `p${i}`, `P${i}`);
    }
    expect(room.players).toHaveLength(MAX_PLAYERS);
    const result = reduce(room, { type: "join", playerId: "late", name: "Late", asHost: false }, as("late"), T0);
    expect(result.error).toBe("room_full");
    expect(result.room).toBe(room);
  });

  it("lets an existing player rejoin even when the room is full", () => {
    let room = createRoom("abc123", T0);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      room = seat(room, `p${i}`, `P${i}`);
    }
    const result = reduce(room, { type: "join", playerId: "p0", name: "Back", asHost: false }, as("p0"), T0);
    expect(result.error).toBeUndefined();
    expect(result.room.players).toHaveLength(MAX_PLAYERS);
  });

  it("trims names, caps them at 24 characters and falls back to Guest", () => {
    let room = createRoom("abc123", T0);
    room = seat(room, "a", "   Alice   ");
    room = seat(room, "b", "x".repeat(40));
    room = seat(room, "c", "    ");
    expect(room.players.map((p) => p.name)).toEqual([
      "Alice",
      "x".repeat(24),
      "Guest",
    ]);
  });

  it("rejects a second joiner whose name matches a connected player ignoring case and spacing", () => {
    let room = seat(createRoom("abc123", T0), "a", "Mary  Jane");
    const result = reduce(room, { type: "join", playerId: "b", name: "  mary JANE ", asHost: false }, as("b"), T0);
    expect(result.error).toBe("name_taken");
    expect(result.room).toBe(room);
    room = result.room;
    expect(room.players.map((p) => [p.id, p.name])).toEqual([["a", "Mary  Jane"]]);
  });

  it("allows a name once its holder has disconnected and removes that seat with its vote", () => {
    let room = votingRoom();
    room = act(room, { type: "vote", value: 5 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = seat(room, "c", "alice", false, T0 + 5);
    expect(room.players.map((p) => [p.id, p.name, p.connected])).toEqual([
      ["h", "Host", true],
      ["b", "Bob", true],
      ["c", "alice", true],
    ]);
    expect(room.round.votes).toEqual({});
  });

  it("removes a disconnected seat's revealed value when its name is reclaimed", () => {
    let room = votingRoom();
    room = act(room, { type: "vote", value: 8 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = act(room, { type: "reveal" });
    expect(room.round.revealed).toEqual({ h: COFFEE, a: 8, b: COFFEE });
    room = seat(room, "c", "ALICE", false, T0 + 5);
    expect(room.round.revealed).toEqual({ h: COFFEE, b: COFFEE });
    expect(room.round.phase).toBe("revealed");
  });

  it("keeps the same player's seat when it rejoins with its own name", () => {
    let room = lobby();
    room = seat(room, "a", " alice ", false, T0 + 5);
    expect(room.players.map((p) => [p.id, p.name, p.connected])).toEqual([
      ["h", "Host", true],
      ["a", "alice", true],
      ["b", "Bob", true],
    ]);
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = seat(room, "a", "Alice", false, T0 + 10);
    expect(room.players.map((p) => p.id)).toEqual(["h", "a", "b"]);
    expect(room.players[1]).toEqual({ id: "a", name: "Alice", connected: true, isHost: false });
  });

  it("keeps a disconnected host's name taken", () => {
    let room = lobby();
    room = act(room, { type: "leave", playerId: "h" }, as("h"));
    const result = reduce(room, { type: "join", playerId: "c", name: "host", asHost: false }, as("c"), T0);
    expect(result.error).toBe("name_taken");
    expect(result.room).toBe(room);
    expect(result.room.hostId).toBe("h");
    expect(result.room.players.map((p) => p.id)).toEqual(["h", "a", "b"]);
  });

  it("rejects two empty names because both sanitize to Guest", () => {
    let room = seat(createRoom("abc123", T0), "a", "");
    const result = reduce(room, { type: "join", playerId: "b", name: "   ", asHost: false }, as("b"), T0);
    expect(result.error).toBe("name_taken");
    expect(result.room.players.map((p) => p.name)).toEqual(["Guest"]);
  });

  it("does not let the actor argument change the outcome", () => {
    const room = createRoom("abc123", T0);
    const result = reduce(room, { type: "join", playerId: "a", name: "A", asHost: false }, as("zzz"), T0);
    expect(result.error).toBeUndefined();
    expect(result.room.players.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("rename", () => {
  it("renames the acting player with sanitized text", () => {
    const room = act(lobby(), { type: "rename", name: "  Bobby Tables  " }, as("b"));
    expect(room.players.find((p) => p.id === "b")?.name).toBe("Bobby Tables");
    expect(room.players.find((p) => p.id === "a")?.name).toBe("Alice");
  });

  it("falls back to Guest for an empty name", () => {
    const room = act(lobby(), { type: "rename", name: "   " }, as("a"));
    expect(room.players.find((p) => p.id === "a")?.name).toBe("Guest");
  });

  it("fails with name_taken when the new name belongs to a connected player", () => {
    const room = lobby();
    const result = reduce(room, { type: "rename", name: "  aLiCe " }, as("b"), T0);
    expect(result.error).toBe("name_taken");
    expect(result.room).toBe(room);
  });

  it("succeeds when renaming to a free name or to the player's own name in another case", () => {
    let room = lobby();
    room = act(room, { type: "rename", name: " BOB " }, as("b"));
    expect(room.players.find((p) => p.id === "b")?.name).toBe("BOB");
    room = act(room, { type: "rename", name: "Robert" }, as("b"));
    expect(room.players.find((p) => p.id === "b")?.name).toBe("Robert");
  });

  it("reclaims a disconnected player's name and removes that seat", () => {
    let room = votingRoom();
    room = act(room, { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = act(room, { type: "rename", name: "alice" }, as("b"));
    expect(room.players.map((p) => [p.id, p.name])).toEqual([
      ["h", "Host"],
      ["b", "alice"],
    ]);
    expect(room.round.votes).toEqual({});
  });

  it("fails with name_taken when renaming onto a disconnected host", () => {
    let room = lobby();
    room = act(room, { type: "leave", playerId: "h" }, as("h"));
    const result = reduce(room, { type: "rename", name: "HOST" }, as("b"), T0);
    expect(result.error).toBe("name_taken");
    expect(result.room.players.map((p) => p.id)).toEqual(["h", "a", "b"]);
  });

  it("returns not_found for an unknown actor", () => {
    const room = lobby();
    const result = reduce(room, { type: "rename", name: "X" }, as("zz"), T0);
    expect(result.error).toBe("not_found");
    expect(result.room).toBe(room);
  });
});

describe("host-only actions", () => {
  const hostOnly: ClientAction[] = [
    { type: "addTickets", tickets: [ticket("t1")] },
    { type: "removeTicket", ticketId: "t1" },
    { type: "setCurrent", ticketId: "t1" },
    { type: "startRound" },
    { type: "reveal" },
    { type: "revote" },
    { type: "accept", estimate: 3 },
    { type: "setSync", ticketId: "t1", sync: "synced" },
    { type: "updateSettings", durationSec: 60 },
  ];

  it.each(hostOnly)("returns forbidden for a non-host sending $type", (action) => {
    const room = withTickets(lobby(), ["t1"]);
    const result = reduce(room, action, as("a"), T0 + 1);
    expect(result.error).toBe("forbidden");
    expect(result.room).toBe(room);
  });
});

describe("vote", () => {
  it("returns bad_state outside the voting phase", () => {
    const room = lobby();
    const result = reduce(room, { type: "vote", value: 3 }, as("a"), T0);
    expect(result.error).toBe("bad_state");
    expect(result.room).toBe(room);
  });

  it("returns bad_request for a value outside the allowed estimates", () => {
    const room = votingRoom();
    const result = reduce(room, { type: "vote", value: 4 as unknown as Estimate }, as("a"), T0);
    expect(result.error).toBe("bad_request");
    expect(result.room).toBe(room);
  });

  it("returns not_found when the actor is not a known player", () => {
    const room = votingRoom();
    const result = reduce(room, { type: "vote", value: 3 }, as("zz"), T0);
    expect(result.error).toBe("not_found");
  });

  it("stores the vote in private round votes", () => {
    const room = act(votingRoom(), { type: "vote", value: 3 }, as("a"), T0 + 1000);
    expect(room.round.votes).toEqual({ a: 3 });
    expect(room.round.phase).toBe("voting");
    expect(room.lastActivityAt).toBe(T0 + 1000);
  });

  it("lets a player change their vote until reveal", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 8 }, as("a"));
    expect(room.round.votes).toEqual({ a: 8 });
    expect(room.round.phase).toBe("voting");
  });

  it("hides votes from the public state while voting", () => {
    const room = act(votingRoom(), { type: "vote", value: 5 }, as("a"));
    const pub = toPublicState(room, T0 + 1);
    expect(pub.round.phase).toBe("voting");
    expect(pub.round.votes).toBeNull();
    expect(pub.round.voted).toEqual({ h: false, a: true, b: false });
    expect(JSON.stringify(pub)).not.toMatch(/"a":\s*5\b/);
  });

  it("keeps the public state identical across a vote change while voting", () => {
    const first = act(votingRoom(T0), { type: "vote", value: 3 }, as("a"));
    const changed = act(first, { type: "vote", value: 8 }, as("a"));
    const before = toPublicState(first, T0 + 1);
    const after = toPublicState(changed, T0 + 1);
    expect(after.round).toEqual(before.round);
    expect(after.round).toEqual({
      phase: "voting",
      durationSec: DEFAULT_TIMER_SEC,
      endsAt: T0 + DEFAULT_TIMER_SEC * 1000,
      voted: { h: false, a: true, b: false },
      votes: null,
    });
  });

  it("auto-reveals with the default settings once everyone has voted", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 8 }, HOST);
    expect(room.round.phase).toBe("voting");
    room = act(room, { type: "vote", value: 5 }, as("b"), T0 + 2000);
    expect(room.settings.autoRevealWhenAllVoted).toBe(true);
    expect(room.round.phase).toBe("revealed");
    expect(room.round.revealed).toEqual({ h: 8, a: 3, b: 5 });
  });

  it("lets a player change their vote until the last connected player has voted", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 5 }, as("a"));
    room = act(room, { type: "vote", value: 2 }, HOST);
    room = act(room, { type: "vote", value: 8 }, HOST);
    expect(room.round.phase).toBe("voting");
    room = act(room, { type: "vote", value: 1 }, as("b"), T0 + 2000);
    expect(room.round.revealed).toEqual({ h: 8, a: 5, b: 1 });
  });

  it("auto-reveals once every connected player has voted when the setting is on", () => {
    let room = act(votingRoom(), { type: "updateSettings", autoRevealWhenAllVoted: true });
    room = act(room, { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 8 }, HOST);
    expect(room.round.phase).toBe("voting");
    room = act(room, { type: "vote", value: 5 }, as("b"), T0 + 2000);
    expect(room.round.phase).toBe("revealed");
    expect(room.round.endsAt).toBeNull();
    expect(room.round.revealed).toEqual({ h: 8, a: 3, b: 5 });
  });

  it("does not auto-reveal when autoRevealWhenAllVoted is off", () => {
    let room = act(votingRoom(), { type: "updateSettings", autoRevealWhenAllVoted: false });
    room = act(room, { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 8 }, HOST);
    room = act(room, { type: "vote", value: 5 }, as("b"));
    expect(room.round.phase).toBe("voting");
  });
});

describe("leave", () => {
  it("marks the player disconnected but keeps the player and their vote", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    expect(room.players.find((p) => p.id === "a")).toEqual({
      id: "a",
      name: "Alice",
      connected: false,
      isHost: false,
    });
    expect(room.round.votes).toEqual({ a: 3 });
  });

  it("returns not_found for an unknown player", () => {
    const room = lobby();
    const result = reduce(room, { type: "leave", playerId: "zz" }, HOST, T0);
    expect(result.error).toBe("not_found");
  });

  it("auto-reveals when a straggler leaves and everyone remaining has voted", () => {
    let room = act(votingRoom(), { type: "updateSettings", autoRevealWhenAllVoted: true });
    room = act(room, { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 5 }, HOST);
    expect(room.round.phase).toBe("voting");
    room = act(room, { type: "leave", playerId: "b" }, as("b"), T0 + 3000);
    expect(room.round.phase).toBe("revealed");
    expect(room.round.revealed).toEqual({ h: 5, a: 3 });
  });

  it("reveals when a straggler leaves under the default settings", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 5 }, HOST);
    room = act(room, { type: "leave", playerId: "b" }, as("b"), T0 + 3000);
    expect(room.round.phase).toBe("revealed");
  });

  it("does not reveal when a straggler leaves and auto-reveal is off", () => {
    let room = act(votingRoom(), { type: "updateSettings", autoRevealWhenAllVoted: false });
    room = act(room, { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "vote", value: 5 }, HOST);
    room = act(room, { type: "leave", playerId: "b" }, as("b"), T0 + 3000);
    expect(room.round.phase).toBe("voting");
    expect(room.round.revealed).toBeNull();
  });

  it("does not reveal when nobody is left connected", () => {
    let room = votingRoom();
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = act(room, { type: "leave", playerId: "b" }, as("b"));
    room = act(room, { type: "leave", playerId: "h" }, HOST);
    expect(room.round.phase).toBe("voting");
    expect(room.players.every((p) => !p.connected)).toBe(true);
  });
});

describe("reveal", () => {
  it("returns bad_state when no round is running", () => {
    const result = reduce(withTickets(lobby(), ["t1"]), { type: "reveal" }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });

  it("fills connected non-voters with coffee and keeps a disconnected voter's vote", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "leave", playerId: "a" }, as("a"));
    room = act(room, { type: "reveal" });
    expect(room.round.phase).toBe("revealed");
    expect(room.round.revealed).toEqual({ h: COFFEE, a: 3, b: COFFEE });
  });

  it("excludes a disconnected player who never voted", () => {
    let room = act(votingRoom(), { type: "vote", value: 8 }, HOST);
    room = act(room, { type: "leave", playerId: "b" }, as("b"));
    room = act(room, { type: "reveal" });
    expect(room.round.revealed).toEqual({ h: 8, a: COFFEE });
    expect("b" in (room.round.revealed ?? {})).toBe(false);
  });

  it("exposes revealed votes as public round votes", () => {
    let room = act(votingRoom(), { type: "vote", value: 2 }, as("a"));
    room = act(room, { type: "reveal" });
    const pub = toPublicState(room, T0 + 10);
    expect(pub.round.votes).toEqual({ h: COFFEE, a: 2, b: COFFEE });
    expect(pub.round.voted).toEqual({ h: false, a: true, b: false });
  });

  it("reveals the latest vote of every player and coffee for each non-voter", () => {
    let room = act(votingRoom(), { type: "vote", value: 5 }, as("a"));
    room = act(room, { type: "vote", value: 2 }, as("a"));
    room = act(room, { type: "vote", value: 8 }, HOST);
    room = act(room, { type: "reveal" });
    const pub = toPublicState(room, T0 + 10);
    expect(pub.round.votes).toEqual({ h: 8, a: 2, b: COFFEE });
    expect(pub.round.voted).toEqual({ h: true, a: true, b: false });
  });
});

describe("tick", () => {
  it("reveals only at or after endsAt", () => {
    const room = votingRoom(T0);
    expect(room.round.endsAt).toBe(T0 + DEFAULT_TIMER_SEC * 1000);
    const endsAt = room.round.endsAt as number;

    const early = reduce(room, { type: "tick" }, HOST, endsAt - 1);
    expect(early.error).toBeUndefined();
    expect(early.room).toBe(room);
    expect(early.room.round.phase).toBe("voting");

    const exact = reduce(room, { type: "tick" }, HOST, endsAt);
    expect(exact.room.round.phase).toBe("revealed");
    expect(exact.room.round.revealed).toEqual({ h: COFFEE, a: COFFEE, b: COFFEE });
    expect(exact.room.lastActivityAt).toBe(endsAt);
  });

  it("reveals after endsAt has passed", () => {
    const room = votingRoom(T0);
    const after = reduce(room, { type: "tick" }, HOST, T0 + 10 * 60 * 1000);
    expect(after.room.round.phase).toBe("revealed");
  });

  it("changes nothing and leaves lastActivityAt alone when there is nothing to do", () => {
    const idle = withTickets(lobby(), ["t1"]);
    const result = reduce(idle, { type: "tick" }, HOST, T0 + 999_999);
    expect(result.error).toBeUndefined();
    expect(result.room).toBe(idle);
    expect(result.room.lastActivityAt).toBe(idle.lastActivityAt);
  });

  it("is a no-op during a revealed round", () => {
    const revealed = act(votingRoom(), { type: "reveal" });
    const result = reduce(revealed, { type: "tick" }, HOST, T0 + 999_999);
    expect(result.room).toBe(revealed);
  });
});

describe("startRound", () => {
  it("starts voting with the settings duration and a deadline", () => {
    const room = votingRoom(T0 + 500);
    expect(room.round).toEqual({
      phase: "voting",
      durationSec: DEFAULT_TIMER_SEC,
      endsAt: T0 + 500 + DEFAULT_TIMER_SEC * 1000,
      votes: {},
      revealed: null,
    });
    expect(room.lastActivityAt).toBe(T0 + 500);
  });

  it("uses the configured duration", () => {
    let room = act(withTickets(lobby(), ["t1"]), { type: "updateSettings", durationSec: 60 });
    room = act(room, { type: "startRound" }, HOST, T0);
    expect(room.round.durationSec).toBe(60);
    expect(room.round.endsAt).toBe(T0 + 60_000);
  });

  it("returns bad_state without a current ticket", () => {
    const result = reduce(lobby(), { type: "startRound" }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });

  it("returns bad_state when a round is already running", () => {
    const room = votingRoom();
    const result = reduce(room, { type: "startRound" }, HOST, T0 + 1);
    expect(result.error).toBe("bad_state");
    expect(result.room).toBe(room);
  });
});

describe("revote", () => {
  it("clears votes and restarts the timer during voting", () => {
    let room = act(votingRoom(T0), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "revote" }, HOST, T0 + 20_000);
    expect(room.round.phase).toBe("voting");
    expect(room.round.votes).toEqual({});
    expect(room.round.endsAt).toBe(T0 + 20_000 + DEFAULT_TIMER_SEC * 1000);
  });

  it("restarts from the revealed phase and clears the revealed map", () => {
    let room = act(votingRoom(), { type: "vote", value: 5 }, as("a"));
    room = act(room, { type: "reveal" });
    room = act(room, { type: "revote" }, HOST, T0 + 1);
    expect(room.round.phase).toBe("voting");
    expect(room.round.revealed).toBeNull();
    expect(room.round.votes).toEqual({});
  });

  it("returns bad_state when idle", () => {
    const result = reduce(withTickets(lobby(), ["t1"]), { type: "revote" }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });

  it("returns bad_state without a current ticket", () => {
    const result = reduce(lobby(), { type: "revote" }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });
});

describe("accept", () => {
  const revealedRoom = (): ServerRoom =>
    act(
      act(votingRoom(), { type: "vote", value: 3 }, as("a")),
      { type: "reveal" },
    );

  it("grooms the current ticket, advances to the next todo and resets the round", () => {
    const room = act(revealedRoom(), { type: "accept", estimate: 5 });
    expect(statusOf(room, "t1")).toEqual({
      ticket: ticket("t1"),
      status: "groomed",
      finalEstimate: 5,
      sync: "pending",
    });
    expect(room.currentTicketId).toBe("t2");
    expect(room.round).toEqual({
      phase: "idle",
      durationSec: DEFAULT_TIMER_SEC,
      endsAt: null,
      votes: {},
      revealed: null,
    });
  });

  it("wraps to the first todo from the start when none follows", () => {
    let room = act(revealedRoom(), { type: "accept", estimate: 5 });
    room = act(room, { type: "setCurrent", ticketId: "t3" });
    room = act(room, { type: "startRound" });
    room = act(room, { type: "reveal" });
    room = act(room, { type: "accept", estimate: 2 });
    expect(statusOf(room, "t3")?.status).toBe("groomed");
    expect(room.currentTicketId).toBe("t2");
  });

  it("gives null when the last todo is accepted", () => {
    let room = withTickets(lobby(), ["only"]);
    room = act(room, { type: "startRound" });
    room = act(room, { type: "reveal" });
    room = act(room, { type: "accept", estimate: 8 });
    expect(room.currentTicketId).toBeNull();
    expect(statusOf(room, "only")?.finalEstimate).toBe(8);
  });

  it("returns bad_state unless the round is revealed", () => {
    const result = reduce(votingRoom(), { type: "accept", estimate: 3 }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });

  it("returns bad_state without a current ticket", () => {
    const result = reduce(lobby(), { type: "accept", estimate: 3 }, HOST, T0);
    expect(result.error).toBe("bad_state");
  });

  it("returns bad_request for an estimate outside the allowed set", () => {
    const room = revealedRoom();
    const result = reduce(room, { type: "accept", estimate: 13 as unknown as Estimate }, HOST, T0);
    expect(result.error).toBe("bad_request");
    expect(result.room).toBe(room);
  });
});

describe("setCurrent", () => {
  it("selects a ticket while idle without touching the round", () => {
    const room = act(withTickets(lobby(), ["t1", "t2"]), { type: "setCurrent", ticketId: "t2" });
    expect(room.currentTicketId).toBe("t2");
    expect(room.round.phase).toBe("idle");
  });

  it("resets an in-progress round to idle when switching tickets", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "setCurrent", ticketId: "t2" });
    expect(room.currentTicketId).toBe("t2");
    expect(room.round).toEqual({
      phase: "idle",
      durationSec: DEFAULT_TIMER_SEC,
      endsAt: null,
      votes: {},
      revealed: null,
    });
  });

  it("allows the host to re-select an already groomed ticket", () => {
    let room = act(votingRoom(), { type: "reveal" });
    room = act(room, { type: "accept", estimate: 3 });
    room = act(room, { type: "setCurrent", ticketId: "t1" });
    expect(room.currentTicketId).toBe("t1");
    expect(statusOf(room, "t1")?.status).toBe("groomed");
  });

  it("returns not_found for an unknown ticket", () => {
    const room = withTickets(lobby(), ["t1"]);
    const result = reduce(room, { type: "setCurrent", ticketId: "nope" }, HOST, T0);
    expect(result.error).toBe("not_found");
    expect(result.room).toBe(room);
  });
});

describe("addTickets", () => {
  it("appends todo entries with no estimate and sync none", () => {
    const room = withTickets(lobby(), ["t1", "t2"]);
    expect(room.tickets.map((e) => [e.ticket.id, e.status, e.finalEstimate, e.sync])).toEqual([
      ["t1", "todo", null, "none"],
      ["t2", "todo", null, "none"],
    ]);
  });

  it("sets the current ticket to the first todo when none was selected", () => {
    const room = withTickets(lobby(), ["t1", "t2"]);
    expect(room.currentTicketId).toBe("t1");
  });

  it("keeps an existing current ticket", () => {
    let room = withTickets(lobby(), ["t1"]);
    room = act(room, { type: "addTickets", tickets: [ticket("t2")] });
    expect(room.currentTicketId).toBe("t1");
  });

  it("leaves the current ticket null when nothing is added", () => {
    const room = act(lobby(), { type: "addTickets", tickets: [] });
    expect(room.currentTicketId).toBeNull();
  });

  it("skips duplicate ids, both existing and repeated within the batch", () => {
    let room = withTickets(lobby(), ["t1", "t2"]);
    room = act(room, { type: "addTickets", tickets: [ticket("t2"), ticket("t3"), ticket("t3")] });
    expect(room.tickets.map((e) => e.ticket.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("caps the total at MAX_TICKETS and drops the extras", () => {
    const ids = Array.from({ length: MAX_TICKETS + 5 }, (_, i) => `t${i}`);
    const room = withTickets(lobby(), ids);
    expect(room.tickets).toHaveLength(MAX_TICKETS);
    expect(room.tickets[MAX_TICKETS - 1]?.ticket.id).toBe(`t${MAX_TICKETS - 1}`);

    const again = act(room, { type: "addTickets", tickets: [ticket("late")] });
    expect(again.tickets).toHaveLength(MAX_TICKETS);
    expect(again.tickets.some((e) => e.ticket.id === "late")).toBe(false);
  });
});

describe("removeTicket", () => {
  it("removes a non-current ticket and keeps the round", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "removeTicket", ticketId: "t3" });
    expect(room.tickets.map((e) => e.ticket.id)).toEqual(["t1", "t2"]);
    expect(room.currentTicketId).toBe("t1");
    expect(room.round.phase).toBe("voting");
    expect(room.round.votes).toEqual({ a: 3 });
  });

  it("moves the current ticket to the next todo and resets the round", () => {
    let room = act(votingRoom(), { type: "vote", value: 3 }, as("a"));
    room = act(room, { type: "removeTicket", ticketId: "t1" });
    expect(room.tickets.map((e) => e.ticket.id)).toEqual(["t2", "t3"]);
    expect(room.currentTicketId).toBe("t2");
    expect(room.round.phase).toBe("idle");
    expect(room.round.votes).toEqual({});
  });

  it("wraps to the first todo when the removed ticket was last", () => {
    let room = act(votingRoom(), { type: "setCurrent", ticketId: "t3" });
    room = act(room, { type: "removeTicket", ticketId: "t3" });
    expect(room.currentTicketId).toBe("t1");
  });

  it("sets the current ticket to null when no todo remains", () => {
    let room = withTickets(lobby(), ["only"]);
    room = act(room, { type: "removeTicket", ticketId: "only" });
    expect(room.tickets).toEqual([]);
    expect(room.currentTicketId).toBeNull();
  });

  it("returns not_found for an unknown ticket", () => {
    const result = reduce(withTickets(lobby(), ["t1"]), { type: "removeTicket", ticketId: "zz" }, HOST, T0);
    expect(result.error).toBe("not_found");
  });
});

describe("setSync", () => {
  it("updates the sync state of one ticket", () => {
    const room = act(withTickets(lobby(), ["t1", "t2"]), { type: "setSync", ticketId: "t2", sync: "syncing" });
    expect(statusOf(room, "t2")?.sync).toBe("syncing");
    expect(statusOf(room, "t1")?.sync).toBe("none");
  });

  it("returns not_found for an unknown ticket", () => {
    const result = reduce(withTickets(lobby(), ["t1"]), { type: "setSync", ticketId: "zz", sync: "failed" }, HOST, T0);
    expect(result.error).toBe("not_found");
  });
});

describe("updateSettings", () => {
  it("applies every field provided", () => {
    const room = act(lobby(), { type: "updateSettings", durationSec: 60, autoRevealWhenAllVoted: false });
    expect(room.settings).toEqual({ durationSec: 60, autoRevealWhenAllVoted: false });
  });

  it("applies only the fields provided", () => {
    const room = act(lobby(), { type: "updateSettings", autoRevealWhenAllVoted: false });
    expect(room.settings).toEqual({ durationSec: DEFAULT_TIMER_SEC, autoRevealWhenAllVoted: false });
  });

  it("rejects a duration outside TIMER_OPTIONS_SEC", () => {
    const room = lobby();
    const result = reduce(room, { type: "updateSettings", durationSec: 45 }, HOST, T0);
    expect(result.error).toBe("bad_request");
    expect(result.room).toBe(room);
  });

  it("rejects a non-boolean autoReveal flag", () => {
    const result = reduce(
      lobby(),
      { type: "updateSettings", autoRevealWhenAllVoted: "yes" as unknown as boolean },
      HOST,
      T0,
    );
    expect(result.error).toBe("bad_request");
  });

  it("leaves a running round's duration and deadline unchanged", () => {
    const running = votingRoom(T0);
    const room = act(running, { type: "updateSettings", durationSec: 30 }, HOST, T0 + 1);
    expect(room.round.durationSec).toBe(DEFAULT_TIMER_SEC);
    expect(room.round.endsAt).toBe(running.round.endsAt);
    expect(room.settings.durationSec).toBe(30);
  });
});

describe("lastActivityAt", () => {
  it("is stamped with now on success", () => {
    const room = act(lobby(), { type: "rename", name: "Zed" }, as("a"), T0 + 7000);
    expect(room.lastActivityAt).toBe(T0 + 7000);
  });

  it("is not changed on failure", () => {
    const room = lobby();
    const result = reduce(room, { type: "startRound" }, HOST, T0 + 7000);
    expect(result.error).toBe("bad_state");
    expect(result.room.lastActivityAt).toBe(T0);
  });
});

describe("reduce purity", () => {
  it("never mutates a frozen input and returns new objects", () => {
    const frozen = deepFreeze(withTickets(lobby(), ["t1", "t2"]));
    const actions: [ServerAction, Actor][] = [
      [{ type: "rename", name: "Q" }, as("a")],
      [{ type: "startRound" }, HOST],
      [{ type: "vote", value: 3 }, as("a")],
      [{ type: "leave", playerId: "b" }, as("b")],
      [{ type: "reveal" }, HOST],
      [{ type: "accept", estimate: 3 }, HOST],
    ];
    let room: ServerRoom = frozen;
    for (const [action, actor] of actions) {
      const result = reduce(room, action, actor, T0 + 1);
      expect(result.error).toBeUndefined();
      expect(result.room).not.toBe(room);
      room = result.room;
    }
    expect(room.tickets[0]?.status).toBe("groomed");
  });
});

describe("toPublicState", () => {
  it("copies the room and stamps serverNow", () => {
    const room = withTickets(lobby(), ["t1"]);
    const pub = toPublicState(room, T0 + 42);
    expect(pub).toEqual({
      code: "abc123",
      players: room.players,
      tickets: room.tickets,
      references: {},
      currentTicketId: "t1",
      round: { phase: "idle", durationSec: DEFAULT_TIMER_SEC, endsAt: null, voted: { h: false, a: false, b: false }, votes: null },
      settings: { durationSec: DEFAULT_TIMER_SEC, autoRevealWhenAllVoted: true },
      serverNow: T0 + 42,
    });
    expect(pub.players).not.toBe(room.players);
  });

  it("marks nobody as voted when idle even if stale votes exist", () => {
    const pub = toPublicState(lobby(), T0);
    expect(Object.values(pub.round.voted).every((v) => v === false)).toBe(true);
    expect(pub.round.votes).toBeNull();
  });

  it("never exposes round votes while voting", () => {
    const room = act(votingRoom(), { type: "vote", value: 8 }, HOST);
    const pub = toPublicState(room, T0);
    expect(pub.round.votes).toBeNull();
    expect(pub.round.voted.h).toBe(true);
  });

  it("does not count coffee as having voted after reveal", () => {
    const room = act(votingRoom(), { type: "reveal" });
    const pub = toPublicState(room, T0);
    expect(pub.round.voted).toEqual({ h: false, a: false, b: false });
    expect(pub.round.votes).toEqual({ h: COFFEE, a: COFFEE, b: COFFEE });
  });
});

describe("nextAlarmAt", () => {
  const HEARTBEAT = { heartbeatTimeoutMs: 120_000, heartbeatCheckMs: 60_000 };
  const LIMITS: RoomLimits = { idleEmptyMs: 5_000, maxAgeMs: 70_000, ...HEARTBEAT };
  const ROUND_END = T0 + DEFAULT_TIMER_SEC * 1000;

  const disconnectAll = (room: ServerRoom): ServerRoom => ({
    ...room,
    players: room.players.map((player) => ({ ...player, connected: false })),
  });

  it("uses the idle deadline for an empty room", () => {
    expect(nextAlarmAt(createRoom("abc123", T0), LIMITS)).toBe(T0 + LIMITS.idleEmptyMs);
  });

  it("uses the idle deadline from the last activity", () => {
    const room = { ...createRoom("abc123", T0), lastActivityAt: T0 + 2_000 };
    expect(nextAlarmAt(room, LIMITS)).toBe(T0 + 2_000 + LIMITS.idleEmptyMs);
  });

  it("ignores the idle deadline while someone is connected", () => {
    expect(nextAlarmAt(lobby(), LIMITS)).toBe(T0 + LIMITS.maxAgeMs);
  });

  it("ignores the idle deadline when only one of several players is connected", () => {
    const room = lobby();
    const partly = {
      ...room,
      players: room.players.map((player, index) => ({ ...player, connected: index !== 0 })),
    };
    expect(nextAlarmAt(partly, LIMITS)).toBe(T0 + LIMITS.maxAgeMs);
  });

  it("uses the round deadline when it is earlier than the max age and someone is connected", () => {
    expect(nextAlarmAt(votingRoom(T0), LIMITS)).toBe(ROUND_END);
  });

  it("uses the round deadline when it is earlier than the idle deadline and nobody is connected", () => {
    const room = disconnectAll(votingRoom(T0));
    expect(nextAlarmAt(room, { idleEmptyMs: 60_000, maxAgeMs: 70_000, ...HEARTBEAT })).toBe(ROUND_END);
  });

  it("uses the max age when it is earlier than the round deadline and someone is connected", () => {
    expect(
      nextAlarmAt(votingRoom(T0), { idleEmptyMs: 5_000, maxAgeMs: 10_000, ...HEARTBEAT }),
    ).toBe(T0 + 10_000);
  });

  it("uses the max age when it is earlier than the idle deadline and nobody is connected", () => {
    const room = disconnectAll(createRoom("abc123", T0));
    expect(nextAlarmAt(room, { idleEmptyMs: 60_000, maxAgeMs: 10_000, ...HEARTBEAT })).toBe(T0 + 10_000);
  });

  it("uses the idle deadline when it is the earliest and nobody is connected", () => {
    const room = disconnectAll(votingRoom(T0));
    expect(nextAlarmAt(room, { idleEmptyMs: 1_000, maxAgeMs: 70_000, ...HEARTBEAT })).toBe(T0 + 1_000);
  });

  it("ignores the round deadline once the round is revealed", () => {
    const room = disconnectAll(act(votingRoom(T0), { type: "reveal" }, HOST, T0 + 1));
    expect(nextAlarmAt(room, LIMITS)).toBe(T0 + 1 + LIMITS.idleEmptyMs);
  });

  it("uses the default limits when none are given", () => {
    expect(nextAlarmAt(createRoom("abc123", T0))).toBe(T0 + IDLE_EMPTY_TTL_MS);
    expect(nextAlarmAt(lobby())).toBe(T0 + MAX_ROOM_AGE_MS);
    expect(DEFAULT_ROOM_LIMITS).toEqual({
      idleEmptyMs: IDLE_EMPTY_TTL_MS,
      maxAgeMs: MAX_ROOM_AGE_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      heartbeatCheckMs: HEARTBEAT_CHECK_MS,
    });
  });
});

describe("addReferences", () => {
  const linked = (identifier: string, description = ""): Ticket => ({
    ...ticket(identifier),
    identifier,
    title: `Title of ${identifier}`,
    description,
  });

  const addRefs = (room: ServerRoom, tickets: Ticket[], actor: Actor = as("a")): ServerRoom =>
    act(room, { type: "addReferences", tickets }, actor);

  it("starts every room with no references", () => {
    expect(createRoom("abc123", T0).references).toEqual({});
  });

  it("lets any joined player add references, not only the host", () => {
    const room = addRefs(lobby(), [linked("CTTP-1")], as("b"));
    expect(Object.keys(room.references)).toEqual(["CTTP-1"]);
  });

  it("rejects references from someone who has not joined the room", () => {
    const result = reduce(lobby(), { type: "addReferences", tickets: [linked("CTTP-1")] }, as("ghost"), T0);
    expect(result.error).toBe("not_found");
    expect(result.room.references).toEqual({});
  });

  it("keys references by the upper-cased identifier and exposes them publicly", () => {
    const room = addRefs(lobby(), [linked("cttp-1234", "Body")]);
    expect(room.references["CTTP-1234"]).toEqual({ ...linked("cttp-1234", "Body"), labels: ["backend"] });
    expect(toPublicState(room, T0).references).toEqual(room.references);
  });

  it("ignores identifiers already held as references, keeping the first copy", () => {
    let room = addRefs(lobby(), [linked("CTTP-1", "first")]);
    room = addRefs(room, [linked("cttp-1", "second")]);
    expect(room.references["CTTP-1"]?.description).toBe("first");
    expect(Object.keys(room.references)).toHaveLength(1);
  });

  it("ignores identifiers that are already room tickets, ignoring case", () => {
    const room = addRefs(
      act(lobby(), { type: "addTickets", tickets: [{ ...ticket("x"), identifier: "CLM-9" }] }),
      [linked("clm-9"), linked("CTTP-2")],
    );
    expect(Object.keys(room.references)).toEqual(["CTTP-2"]);
  });

  it("returns the same room when nothing new was added", () => {
    const room = addRefs(lobby(), [linked("CTTP-1")]);
    expect(reduce(room, { type: "addReferences", tickets: [linked("CTTP-1")] }, as("a"), T0).room).toBe(room);
    expect(reduce(room, { type: "addReferences", tickets: [] }, as("a"), T0).room).toBe(room);
  });

  it("caps the map at MAX_REFERENCES and drops the extras", () => {
    const incoming = Array.from({ length: MAX_REFERENCES + 5 }, (_, i) => linked(`CTTP-${i + 1}`));
    const room = addRefs(lobby(), incoming);
    expect(Object.keys(room.references)).toHaveLength(MAX_REFERENCES);
    expect(room.references[`CTTP-${MAX_REFERENCES}`]).toBeDefined();
    expect(room.references[`CTTP-${MAX_REFERENCES + 1}`]).toBeUndefined();
  });

  it("counts existing references against the cap", () => {
    const first = addRefs(lobby(), Array.from({ length: MAX_REFERENCES - 1 }, (_, i) => linked(`CTTP-${i + 1}`)));
    const room = addRefs(first, [linked("CTTP-900"), linked("CTTP-901")]);
    expect(Object.keys(room.references)).toHaveLength(MAX_REFERENCES);
    expect(room.references["CTTP-900"]).toBeDefined();
    expect(room.references["CTTP-901"]).toBeUndefined();
  });

  it("truncates each description to 3000 characters", () => {
    const room = addRefs(lobby(), [linked("CTTP-1", "x".repeat(5000))]);
    expect(room.references["CTTP-1"]?.description).toHaveLength(3000);
  });

  it("reads a room stored before references existed as having none", () => {
    const { references: _unused, ...legacy } = lobby();
    const old = legacy as ServerRoom;
    expect(toPublicState(old, T0).references).toEqual({});
    const room = addRefs(old, [linked("CTTP-7")]);
    expect(Object.keys(room.references)).toEqual(["CTTP-7"]);
  });

  it("keeps a legacy room usable for other actions", () => {
    const { references: _unused, ...legacy } = lobby();
    const result = reduce(legacy as ServerRoom, { type: "addTickets", tickets: [ticket("t9")] }, HOST, T0);
    expect(result.error).toBeUndefined();
    expect(result.room.references).toEqual({});
    expect(result.room.tickets).toHaveLength(1);
  });
});
