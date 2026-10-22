import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "@shared/protocol";
import type { RoomState } from "@shared/types";
import { RoomSocket, type Snapshot } from "./socket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const STATE: RoomState = {
  code: "abc123",
  players: [{ id: "p1", name: "Ann", connected: true, isHost: true }],
  tickets: [],
  references: {},
  currentTicketId: null,
  round: { phase: "idle", durationSec: 60, endsAt: null, voted: {}, votes: null },
  settings: { durationSec: 60, autoRevealWhenAllVoted: false },
  serverNow: 1_000,
};

let clock = 0;
let snaps: Snapshot[] = [];

function create(
  opts: { name?: string; hostSecret?: string; create?: boolean; onCreateSettled?: () => void; random?: () => number } = {},
): RoomSocket {
  return new RoomSocket({
    url: "ws://test/ws/abc123",
    playerId: "p1",
    name: opts.name ?? "Ann",
    hostSecret: opts.hostSecret,
    create: opts.create,
    createSocket: (url) => new FakeWebSocket(url),
    onSnapshot: (snap) => {
      snaps.push(snap);
    },
    onCreateSettled: opts.onCreateSettled,
    now: () => clock,
    random: opts.random ?? (() => 0),
  });
}

function fake(): FakeWebSocket {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no socket created");
  return ws;
}

function latest(): Snapshot {
  const snap = snaps.at(-1);
  if (!snap) throw new Error("no snapshot emitted");
  return snap;
}

function connectAndWelcome(isHost = true): RoomSocket {
  const sock = create();
  sock.connect();
  fake().open();
  fake().receive({ t: "welcome", playerId: "p1", isHost, state: STATE });
  return sock;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  snaps = [];
  clock = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RoomSocket", () => {
  it("connects in the connecting status and sends hello with identity on open", () => {
    const sock = create({ hostSecret: "s3cret" });
    sock.connect();
    expect(latest().status).toBe("connecting");
    expect(fake().url).toBe("ws://test/ws/abc123");
    fake().open();
    expect(fake().sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann", hostSecret: "s3cret" }]);
  });

  it("welcome sets me, state and the open status", () => {
    connectAndWelcome(true);
    expect(latest()).toMatchObject({
      status: "open",
      state: STATE,
      me: { playerId: "p1", name: "Ann", isHost: true },
      error: null,
    });
  });

  it("state messages replace the room state and refresh isHost from the players list", () => {
    connectAndWelcome(false);
    expect(latest().me?.isHost).toBe(false);
    const next: RoomState = {
      ...STATE,
      currentTicketId: "t1",
      players: [{ id: "p1", name: "Ann", connected: true, isHost: true }],
    };
    fake().receive({ t: "state", state: next });
    expect(latest().state).toEqual(next);
    expect(latest().me?.isHost).toBe(true);
  });

  it("sends act messages once the socket is open", () => {
    const sock = connectAndWelcome();
    sock.send({ type: "vote", value: 5 });
    expect(fake().sent.at(-1)).toEqual({ t: "act", action: { type: "vote", value: 5 } });
  });

  it("drops sends made before the socket is open", () => {
    const sock = create();
    sock.send({ type: "startRound" });
    sock.connect();
    sock.send({ type: "startRound" });
    expect(fake().sent).toEqual([]);
    fake().open();
    expect(fake().sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann" }]);
  });

  it("reconnects with exponential backoff capped at 8 seconds and re-sends hello", () => {
    connectAndWelcome();
    let ws = fake();
    for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 8_000]) {
      ws.drop();
      expect(latest().status).toBe("reconnecting");
      const before = FakeWebSocket.instances.length;
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances.length).toBe(before);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances.length).toBe(before + 1);
      ws = fake();
    }
    ws.open();
    expect(ws.sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann" }]);
    ws.receive({ t: "welcome", playerId: "p1", isHost: true, state: STATE });
    expect(latest().status).toBe("open");
  });

  it("adds up to 25 percent jitter to the backoff delay", () => {
    const room = create({ random: () => 0.5 });
    room.connect();
    fake().drop();
    vi.advanceTimersByTime(561);
    expect(FakeWebSocket.instances.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it("a fatal server error stops reconnecting and sets the closed status", () => {
    connectAndWelcome();
    fake().receive({ t: "error", code: "room_full", message: "Room is full" });
    fake().drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(latest()).toMatchObject({ status: "closed", error: "Room is full" });
  });

  it("name_taken is fatal: no reconnect, closed status with the code and message", () => {
    create().connect();
    fake().open();
    fake().receive({ t: "error", code: "name_taken", message: "That name is already taken in this room." });
    fake().drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(latest()).toMatchObject({
      status: "closed",
      error: "That name is already taken in this room.",
      errorCode: "name_taken",
    });
  });

  it("exposes the code of a non-fatal error and clears it on welcome", () => {
    connectAndWelcome();
    fake().receive({ t: "error", code: "bad_request", message: "Bad move" });
    expect(latest()).toMatchObject({ status: "open", error: "Bad move", errorCode: "bad_request" });
    fake().receive({ t: "welcome", playerId: "p1", isHost: true, state: STATE });
    expect(latest()).toMatchObject({ status: "open", error: null, errorCode: null });
  });

  it("close() sets the closed status and does not reconnect", () => {
    const sock = connectAndWelcome();
    sock.close();
    expect(latest().status).toBe("closed");
    fake().drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it("asks the server to create the room only when create is requested with a host secret", () => {
    const sock = create({ hostSecret: "s3cret", create: true });
    sock.connect();
    fake().open();
    expect(fake().sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann", hostSecret: "s3cret", create: true }]);
  });

  it("omits create from the hello when it was not requested", () => {
    const sock = create({ hostSecret: "s3cret" });
    sock.connect();
    fake().open();
    expect(fake().sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann", hostSecret: "s3cret" }]);
    expect(fake().sent[0]).not.toHaveProperty("create");
  });

  it("omits create from the hello when there is no host secret to create the room with", () => {
    const sock = create({ create: true });
    sock.connect();
    fake().open();
    expect(fake().sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann" }]);
    expect(fake().sent[0]).not.toHaveProperty("create");
  });

  it("clears create after the first welcome so reconnects no longer ask to create", () => {
    const settled = vi.fn();
    const sock = create({ hostSecret: "s3cret", create: true, onCreateSettled: settled });
    sock.connect();
    fake().open();
    fake().receive({ t: "welcome", playerId: "p1", isHost: true, state: STATE });
    expect(settled).toHaveBeenCalledTimes(1);
    fake().drop();
    vi.advanceTimersByTime(60_000);
    const ws = fake();
    ws.open();
    expect(ws.sent).toEqual([{ t: "hello", playerId: "p1", name: "Ann", hostSecret: "s3cret" }]);
    ws.receive({ t: "welcome", playerId: "p1", isHost: true, state: STATE });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("clears create when the server answers room_closed, and does not reconnect", () => {
    const settled = vi.fn();
    const sock = create({ hostSecret: "s3cret", create: true, onCreateSettled: settled });
    sock.connect();
    fake().open();
    fake().receive({ t: "error", code: "room_closed", message: "This session has ended." });
    fake().drop();
    vi.advanceTimersByTime(60_000);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(latest()).toMatchObject({ status: "closed", errorCode: "room_closed" });
  });

  it("keeps the clock offset from the pong with the lowest round trip", () => {
    clock = 1_000;
    const sock = create();
    sock.connect();
    fake().open();
    fake().receive({ t: "welcome", playerId: "p1", isHost: true, state: { ...STATE, serverNow: 5_000 } });
    expect(latest().clockOffsetMs).toBe(4_000);

    clock = 10_000;
    vi.advanceTimersByTime(10_000);
    expect(fake().sent).toContainEqual({ t: "ping", clientTime: 10_000 });
    clock = 10_200;
    fake().receive({ t: "pong", clientTime: 10_000, serverNow: 20_000 });
    expect(latest().clockOffsetMs).toBe(9_900);

    clock = 20_000;
    vi.advanceTimersByTime(10_000);
    expect(fake().sent).toContainEqual({ t: "ping", clientTime: 20_000 });
    clock = 20_050;
    fake().receive({ t: "pong", clientTime: 20_000, serverNow: 30_000 });
    expect(latest().clockOffsetMs).toBe(9_975);

    clock = 30_000;
    vi.advanceTimersByTime(10_000);
    expect(fake().sent).toContainEqual({ t: "ping", clientTime: 30_000 });
    clock = 30_300;
    fake().receive({ t: "pong", clientTime: 30_000, serverNow: 40_000 });
    expect(latest().clockOffsetMs).toBe(9_975);
  });
});
