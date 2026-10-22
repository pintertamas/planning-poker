import { describe, expect, it } from "vitest";
import { hydrateRoom, type StoredRoom } from "./hydrateRoom";

const storedTicket = {
  id: "id-1",
  identifier: "DEMO-1",
  title: "Title",
  description: "",
  url: "",
  teamId: "team",
  teamKey: "DEMO",
  stateName: "Todo",
  assignee: null,
  labels: [],
  currentEstimate: null,
};

const stored = (overrides: Partial<StoredRoom> = {}): StoredRoom => ({
  code: "abc123",
  createdAt: 1,
  lastActivityAt: 1,
  hostId: null,
  players: [],
  tickets: [{ ticket: storedTicket, status: "todo", finalEstimate: null, sync: "none" }],
  currentTicketId: null,
  round: { phase: "idle", durationSec: 30, endsAt: null, votes: {}, revealed: null },
  settings: { durationSec: 30, autoRevealWhenAllVoted: true },
  ...overrides,
});

describe("hydrateRoom", () => {
  it("defaults manualOrder to false for rooms stored before the flag existed", () => {
    expect(hydrateRoom(stored()).manualOrder).toBe(false);
  });

  it("keeps a stored manualOrder value", () => {
    expect(hydrateRoom(stored({ manualOrder: true })).manualOrder).toBe(true);
  });

  it("defaults blockedBy to an empty list for tickets stored without it", () => {
    const room = hydrateRoom(stored());
    expect(room.tickets[0]?.ticket.blockedBy).toEqual([]);
  });

  it("keeps stored blockedBy values", () => {
    const room = hydrateRoom(
      stored({
        tickets: [
          {
            ticket: { ...storedTicket, blockedBy: ["id-9"] },
            status: "todo",
            finalEstimate: null,
            sync: "none",
          },
        ],
      }),
    );
    expect(room.tickets[0]?.ticket.blockedBy).toEqual(["id-9"]);
  });

  it("leaves the other fields exactly as stored", () => {
    const room = hydrateRoom(stored({ currentTicketId: "id-1" }));
    expect(room.code).toBe("abc123");
    expect(room.currentTicketId).toBe("id-1");
    expect(room.tickets[0]?.status).toBe("todo");
    expect(room.tickets[0]?.ticket.identifier).toBe("DEMO-1");
  });
});
