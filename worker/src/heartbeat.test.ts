import { describe, expect, it } from "vitest";
import { createRoom, nextAlarmAt } from "@shared/reducer";
import type { Player, RoomLimits, ServerRoom } from "@shared/types";
import {
  MIN_WAKE_DELAY_MS,
  departPlayers,
  departedPlayerIds,
  isStale,
  nextWakeAt,
  staleSocketIndexes,
} from "./heartbeat";

const T0 = 1_000_000;
const TIMEOUT = 120_000;
const CHECK = 60_000;
const LIMITS: RoomLimits = {
  idleEmptyMs: 300_000,
  maxAgeMs: 4_200_000,
  heartbeatTimeoutMs: TIMEOUT,
  heartbeatCheckMs: CHECK,
};

const player = (id: string, connected: boolean): Player => ({ id, name: id, connected, isHost: false });

const roomWith = (players: Player[]): ServerRoom => ({ ...createRoom("abc123", T0), players });

const votingUntil = (endsAt: number): ServerRoom => ({
  ...roomWith([player("alpha-0001", true)]),
  round: { phase: "voting", durationSec: 30, endsAt, votes: {}, revealed: null },
});

describe("isStale", () => {
  it("is false just before the timeout", () => {
    expect(isStale(T0, T0 + TIMEOUT - 1, TIMEOUT)).toBe(false);
  });

  it("is true exactly at the timeout", () => {
    expect(isStale(T0, T0 + TIMEOUT, TIMEOUT)).toBe(true);
  });

  it("is true well past the timeout", () => {
    expect(isStale(T0, T0 + TIMEOUT * 10, TIMEOUT)).toBe(true);
  });

  it("is false for a socket seen at the current instant", () => {
    expect(isStale(T0, T0, TIMEOUT)).toBe(false);
  });
});

describe("staleSocketIndexes", () => {
  it("returns the positions of only the stale sockets, in order", () => {
    const lastSeen = [T0, T0 + 100_000, T0 - 1];
    expect(staleSocketIndexes(lastSeen, T0 + TIMEOUT, TIMEOUT)).toEqual([0, 2]);
  });

  it("returns an empty list when every socket is fresh", () => {
    expect(staleSocketIndexes([T0 + 1, T0 + 2], T0 + TIMEOUT, TIMEOUT)).toEqual([]);
  });

  it("returns an empty list when there are no sockets", () => {
    expect(staleSocketIndexes([], T0 + TIMEOUT, TIMEOUT)).toEqual([]);
  });
});

describe("departedPlayerIds", () => {
  it("keeps stale players who have no live socket, once each", () => {
    expect(departedPlayerIds(["alpha-0001", "beta-00002", "alpha-0001"], ["beta-00002"])).toEqual([
      "alpha-0001",
    ]);
  });

  it("is empty when every stale player still has a live socket", () => {
    expect(departedPlayerIds(["alpha-0001"], ["alpha-0001"])).toEqual([]);
  });

  it("is empty when nothing is stale", () => {
    expect(departedPlayerIds([], ["alpha-0001"])).toEqual([]);
  });
});

describe("departPlayers", () => {
  it("disconnects the named players and leaves the others connected", () => {
    const room = roomWith([player("alpha-0001", true), player("beta-00002", true)]);
    const next = departPlayers(room, ["alpha-0001"], T0 + 5);
    expect(next.players).toEqual([player("alpha-0001", false), player("beta-00002", true)]);
    expect(next.lastActivityAt).toBe(T0 + 5);
  });

  it("disconnects several players in one pass", () => {
    const room = roomWith([player("alpha-0001", true), player("beta-00002", true)]);
    const next = departPlayers(room, ["alpha-0001", "beta-00002"], T0 + 5);
    expect(next.players.every((entry) => !entry.connected)).toBe(true);
  });

  it("returns the same room when the player is already disconnected", () => {
    const room = roomWith([player("alpha-0001", false)]);
    expect(departPlayers(room, ["alpha-0001"], T0 + 5)).toBe(room);
  });

  it("returns the same room when the player is unknown", () => {
    const room = roomWith([player("alpha-0001", true)]);
    expect(departPlayers(room, ["ghost-00001"], T0 + 5)).toBe(room);
  });
});

describe("nextWakeAt", () => {
  it("uses the idle deadline with no joined sockets, ignoring the check interval", () => {
    const room = roomWith([player("alpha-0001", false)]);
    expect(nextWakeAt({ now: T0, room, joinedSockets: 0, limits: LIMITS })).toBe(
      nextAlarmAt(room, LIMITS),
    );
    expect(nextWakeAt({ now: T0, room, joinedSockets: 0, limits: LIMITS })).toBe(T0 + LIMITS.idleEmptyMs);
  });

  it("uses the max age with no joined sockets when someone is still marked connected", () => {
    const room = roomWith([player("alpha-0001", true)]);
    expect(nextWakeAt({ now: T0, room, joinedSockets: 0, limits: LIMITS })).toBe(T0 + LIMITS.maxAgeMs);
  });

  it("wakes at the check interval when a joined socket exists and nothing is sooner", () => {
    const room = roomWith([player("alpha-0001", true)]);
    expect(nextWakeAt({ now: T0, room, joinedSockets: 1, limits: LIMITS })).toBe(T0 + CHECK);
  });

  it("wakes at the voting deadline when it is earlier than the check interval", () => {
    expect(nextWakeAt({ now: T0, room: votingUntil(T0 + 10_000), joinedSockets: 1, limits: LIMITS })).toBe(
      T0 + 10_000,
    );
  });

  it("wakes at the check interval when the voting deadline is later", () => {
    expect(nextWakeAt({ now: T0, room: votingUntil(T0 + 90_000), joinedSockets: 1, limits: LIMITS })).toBe(
      T0 + CHECK,
    );
  });

  it("wakes at the idle deadline when it is earlier than the check interval", () => {
    const room = { ...roomWith([player("alpha-0001", false)]), lastActivityAt: T0 };
    const limits: RoomLimits = { ...LIMITS, idleEmptyMs: 5_000 };
    expect(nextWakeAt({ now: T0, room, joinedSockets: 1, limits })).toBe(T0 + 5_000);
  });

  it("never schedules a wake less than a second away", () => {
    const overdue = votingUntil(T0 - 5_000);
    for (const joinedSockets of [0, 2]) {
      expect(nextWakeAt({ now: T0, room: overdue, joinedSockets, limits: LIMITS })).toBe(
        T0 + MIN_WAKE_DELAY_MS,
      );
    }
  });

  it("keeps the one second floor when the check interval is shorter", () => {
    const room = roomWith([player("alpha-0001", true)]);
    const fast: RoomLimits = { ...LIMITS, heartbeatCheckMs: 200 };
    expect(nextWakeAt({ now: T0, room, joinedSockets: 1, limits: fast })).toBe(T0 + MIN_WAKE_DELAY_MS);
  });
});
