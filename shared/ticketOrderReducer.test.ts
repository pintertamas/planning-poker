import { describe, expect, it } from "vitest";
import { createRoom, reduce } from "./reducer";
import type { Actor, ReduceResult, ServerAction, ServerRoom, Ticket } from "./types";

const T0 = 1_000_000;
const HOST: Actor = { playerId: "h", isHost: true };
const as = (playerId: string): Actor => ({ playerId, isHost: false });

const ticket = (identifier: string, blockedBy: string[] = []): Ticket => {
  const number = identifier.split("-")[1] ?? "0";
  return {
    id: `id-${number}`,
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
    blockedBy: blockedBy.map((ref) => `id-${ref.split("-")[1] ?? "0"}`),
  };
};

const run = (room: ServerRoom, action: ServerAction, actor: Actor = HOST): ReduceResult =>
  reduce(room, action, actor, T0);

const must = (result: ReduceResult): ServerRoom => {
  expect(result.error).toBeUndefined();
  return result.room;
};

const act = (room: ServerRoom, action: ServerAction, actor: Actor = HOST): ServerRoom =>
  must(run(room, action, actor));

const joinedRoom = (): ServerRoom =>
  must(reduce(createRoom("abc123", T0), { type: "join", playerId: "h", name: "Host", asHost: true }, HOST, T0));

const seeded = (...identifiers: string[]): ServerRoom => {
  const room = joinedRoom();
  return act(room, { type: "addTickets", tickets: identifiers.map((identifier) => ticket(identifier)) });
};

const idsOf = (room: ServerRoom): string[] => room.tickets.map((entry) => entry.ticket.identifier);

const groom = (room: ServerRoom, estimate: 1 | 2 | 3 | 5 | 8 = 3): ServerRoom => {
  let next = act(room, { type: "startRound" });
  next = act(next, { type: "reveal" });
  return act(next, { type: "accept", estimate });
};

describe("addTickets ordering when manualOrder is false", () => {
  it("adds tickets in dependency-aware default order", () => {
    const room = act(joinedRoom(), {
      type: "addTickets",
      tickets: [ticket("DEMO-3", ["DEMO-1"]), ticket("DEMO-2"), ticket("DEMO-1")],
    });
    expect(idsOf(room)).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
  });

  it("places a new blocker above the tickets it blocks", () => {
    const room = act(seeded("DEMO-5", "DEMO-6"), {
      type: "addTickets",
      tickets: [ticket("DEMO-4", ["DEMO-6"])],
    });
    expect(idsOf(room)).toEqual(["DEMO-5", "DEMO-6", "DEMO-4"]);
  });

  it("keeps groomed tickets in their slots when later tickets are added", () => {
    let room = seeded("DEMO-1", "DEMO-2");
    room = groom(room);
    room = act(room, { type: "addTickets", tickets: [ticket("DEMO-9"), ticket("DEMO-0")] });
    expect(room.tickets.map((entry) => [entry.ticket.identifier, entry.status])).toEqual([
      ["DEMO-1", "groomed"],
      ["DEMO-0", "todo"],
      ["DEMO-2", "todo"],
      ["DEMO-9", "todo"],
    ]);
  });

  it("keeps the current ticket id when the list is reordered around it", () => {
    let room = seeded("DEMO-3", "DEMO-1");
    expect(room.currentTicketId).toBe("id-1");
    room = act(room, { type: "addTickets", tickets: [ticket("DEMO-2", ["DEMO-3"])] });
    expect(room.currentTicketId).toBe("id-1");
    expect(room.round.phase).toBe("idle");
  });

  it("sets the current ticket to the first todo of the new order when none was current", () => {
    const room = act(joinedRoom(), {
      type: "addTickets",
      tickets: [ticket("DEMO-4", ["DEMO-2"]), ticket("DEMO-2")],
    });
    expect(room.currentTicketId).toBe("id-2");
  });

  it("does not add an entry for a ticket already in the room", () => {
    const room = act(seeded("DEMO-1"), { type: "addTickets", tickets: [ticket("DEMO-1"), ticket("DEMO-2")] });
    expect(idsOf(room)).toEqual(["DEMO-1", "DEMO-2"]);
  });
});

describe("addTickets ordering when manualOrder is true", () => {
  it("appends new tickets after the existing list, ordered among themselves", () => {
    let room = seeded("DEMO-1", "DEMO-2", "DEMO-3");
    room = act(room, { type: "reorderTickets", ticketIds: ["id-3", "id-1", "id-2"] });
    room = act(room, {
      type: "addTickets",
      tickets: [ticket("DEMO-5", ["DEMO-4"]), ticket("DEMO-4"), ticket("DEMO-6")],
    });
    expect(room.manualOrder).toBe(true);
    expect(idsOf(room)).toEqual(["DEMO-3", "DEMO-1", "DEMO-2", "DEMO-4", "DEMO-5", "DEMO-6"]);
  });
});

describe("ticket in an active round", () => {
  it("keeps the ticket being voted on in its slot when tickets are added", () => {
    let room = seeded("DEMO-1", "DEMO-2", "DEMO-3");
    room = act(room, { type: "startRound" });
    room = act(room, { type: "addTickets", tickets: [ticket("DEMO-0")] });
    expect(idsOf(room)).toEqual(["DEMO-1", "DEMO-0", "DEMO-2", "DEMO-3"]);
    expect(room.currentTicketId).toBe("id-1");
  });

  it("keeps the ticket being voted on in its slot on resetOrder", () => {
    let room = act(seeded("DEMO-1", "DEMO-2", "DEMO-3"), { type: "reorderTickets", ticketIds: ["id-3", "id-2", "id-1"] });
    room = act(room, { type: "setCurrent", ticketId: "id-2" });
    room = act(room, { type: "startRound" });
    room = act(room, { type: "resetOrder" });
    expect(idsOf(room)).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
    expect(room.currentTicketId).toBe("id-2");
    expect(room.round.phase).toBe("voting");
  });
});

describe("reorderTickets", () => {
  it("is host only", () => {
    const room = seeded("DEMO-1", "DEMO-2");
    expect(run(room, { type: "reorderTickets", ticketIds: ["id-2", "id-1"] }, as("a"))).toEqual({
      room,
      error: "forbidden",
    });
  });

  it("applies a full permutation and sets manualOrder", () => {
    const room = act(seeded("DEMO-1", "DEMO-2", "DEMO-3"), {
      type: "reorderTickets",
      ticketIds: ["id-3", "id-2", "id-1"],
    });
    expect(idsOf(room)).toEqual(["DEMO-3", "DEMO-2", "DEMO-1"]);
    expect(room.manualOrder).toBe(true);
  });

  it("rejects a list that is missing a ticket and leaves the room untouched", () => {
    const room = seeded("DEMO-1", "DEMO-2");
    expect(run(room, { type: "reorderTickets", ticketIds: ["id-2"] })).toEqual({ room, error: "bad_request" });
  });

  it("rejects an unknown id", () => {
    const room = seeded("DEMO-1", "DEMO-2");
    expect(run(room, { type: "reorderTickets", ticketIds: ["id-1", "id-9"] })).toEqual({
      room,
      error: "bad_request",
    });
  });

  it("rejects a duplicated id", () => {
    const room = seeded("DEMO-1", "DEMO-2");
    expect(run(room, { type: "reorderTickets", ticketIds: ["id-1", "id-1"] })).toEqual({
      room,
      error: "bad_request",
    });
  });

  it("does not touch the round or the current ticket", () => {
    let room = seeded("DEMO-1", "DEMO-2", "DEMO-3");
    room = act(room, { type: "startRound" });
    const roundBefore = room.round;
    room = act(room, { type: "reorderTickets", ticketIds: ["id-3", "id-2", "id-1"] });
    expect(room.round).toBe(roundBefore);
    expect(room.round.phase).toBe("voting");
    expect(room.currentTicketId).toBe("id-1");
  });

  it("keeps the order across later additions", () => {
    let room = act(seeded("DEMO-1", "DEMO-2"), { type: "reorderTickets", ticketIds: ["id-2", "id-1"] });
    room = act(room, { type: "addTickets", tickets: [ticket("DEMO-0")] });
    expect(idsOf(room)).toEqual(["DEMO-2", "DEMO-1", "DEMO-0"]);
  });
});

describe("resetOrder", () => {
  it("is host only", () => {
    const room = act(seeded("DEMO-1"), { type: "reorderTickets", ticketIds: ["id-1"] });
    expect(run(room, { type: "resetOrder" }, as("a"))).toEqual({ room, error: "forbidden" });
  });

  it("recomputes the default order and clears manualOrder", () => {
    let room = act(seeded("DEMO-1", "DEMO-2", "DEMO-3"), {
      type: "reorderTickets",
      ticketIds: ["id-3", "id-2", "id-1"],
    });
    room = act(room, { type: "resetOrder" });
    expect(idsOf(room)).toEqual(["DEMO-1", "DEMO-2", "DEMO-3"]);
    expect(room.manualOrder).toBe(false);
  });

  it("keeps groomed tickets exactly where they are", () => {
    let room = act(seeded("DEMO-1", "DEMO-2", "DEMO-3"), {
      type: "reorderTickets",
      ticketIds: ["id-3", "id-1", "id-2"],
    });
    room = groom(room);
    expect(room.tickets.map((entry) => entry.status)).toEqual(["todo", "groomed", "todo"]);
    room = act(room, { type: "resetOrder" });
    expect(room.tickets.map((entry) => [entry.ticket.identifier, entry.status])).toEqual([
      ["DEMO-2", "todo"],
      ["DEMO-1", "groomed"],
      ["DEMO-3", "todo"],
    ]);
    expect(room.manualOrder).toBe(false);
  });

  it("orders todo tickets by blockers when resetting", () => {
    const room = joinedRoom();
    const seededRoom = act(room, {
      type: "addTickets",
      tickets: [ticket("DEMO-1"), ticket("DEMO-2", ["DEMO-3"]), ticket("DEMO-3")],
    });
    const reordered = act(seededRoom, { type: "reorderTickets", ticketIds: ["id-2", "id-1", "id-3"] });
    expect(idsOf(act(reordered, { type: "resetOrder" }))).toEqual(["DEMO-1", "DEMO-3", "DEMO-2"]);
  });
});
