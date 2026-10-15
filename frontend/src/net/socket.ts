import type { ClientMessage, ServerMessage } from "@shared/protocol";
import type { ClientAction, RoomState } from "@shared/types";
import type { ConnectionStatus, Me } from "./api";

export type WebSocketLike = Pick<
  WebSocket,
  "readyState" | "send" | "close" | "onopen" | "onmessage" | "onclose" | "onerror"
>;

export type Snapshot = {
  status: ConnectionStatus;
  state: RoomState | null;
  me: Me | null;
  clockOffsetMs: number;
  error: string | null;
};

export type RoomSocketOptions = {
  url: string;
  playerId: string;
  name: string;
  hostSecret?: string;
  createSocket?: (url: string) => WebSocketLike;
  onSnapshot: (snap: Snapshot) => void;
  now?: () => number;
  random?: () => number;
};

const OPEN = 1;
const PING_INTERVAL_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;
const JITTER_RATIO = 0.25;
const FATAL_CODES: ReadonlySet<string> = new Set(["forbidden", "room_full", "room_closed"]);

export class RoomSocket {
  private readonly url: string;
  private readonly playerId: string;
  private readonly hostSecret: string | undefined;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly onSnapshot: (snap: Snapshot) => void;
  private readonly now: () => number;
  private readonly random: () => number;
  private name: string;
  private snap: Snapshot = { status: "connecting", state: null, me: null, clockOffsetMs: 0, error: null };
  private ws: WebSocketLike | null = null;
  private attempt = 0;
  private bestRttMs = Number.POSITIVE_INFINITY;
  private closedByUser = false;
  private fatal = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: RoomSocketOptions) {
    this.url = opts.url;
    this.playerId = opts.playerId;
    this.name = opts.name;
    this.hostSecret = opts.hostSecret;
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url));
    this.onSnapshot = opts.onSnapshot;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? (() => Math.random());
  }

  connect(): void {
    if (this.ws !== null || this.reconnectTimer !== null || this.closedByUser || this.fatal) return;
    this.setSnap({ status: "connecting" });
    this.openSocket();
  }

  send(action: ClientAction): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN) return;
    this.transmit(ws, { t: "act", action });
  }

  setName(name: string): void {
    this.name = name;
  }

  close(): void {
    this.closedByUser = true;
    const ws = this.ws;
    this.ws = null;
    this.stopTimers();
    ws?.close();
    this.setSnap({ status: "closed" });
  }

  private openSocket(): void {
    const ws = this.createSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws === ws) {
        this.transmit(ws, { t: "hello", playerId: this.playerId, name: this.name, hostSecret: this.hostSecret });
      }
    };
    ws.onmessage = (event) => {
      if (this.ws === ws) this.handleMessage(event.data);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.handleClose();
    };
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const msg = parsed as ServerMessage;
    switch (msg.t) {
      case "welcome":
        this.attempt = 0;
        this.setSnap({
          ...this.seedClock(msg.state.serverNow),
          status: "open",
          state: msg.state,
          me: { playerId: msg.playerId, name: this.nameIn(msg.state), isHost: msg.isHost },
          error: null,
        });
        this.startPing();
        return;
      case "state":
        this.setSnap({
          ...this.seedClock(msg.state.serverNow),
          state: msg.state,
          me: this.refreshHost(msg.state),
        });
        return;
      case "pong":
        this.applyPong(msg.clientTime, msg.serverNow);
        return;
      case "error":
        if (FATAL_CODES.has(msg.code)) {
          this.fail(msg.message);
        } else {
          this.setSnap({ error: msg.message });
        }
        return;
    }
  }

  private applyPong(clientTime: number, serverNow: number): void {
    const rtt = this.now() - clientTime;
    if (rtt >= this.bestRttMs) return;
    this.bestRttMs = rtt;
    this.setSnap({ clockOffsetMs: serverNow - (clientTime + rtt / 2) });
  }

  private seedClock(serverNow: number): Partial<Snapshot> {
    return this.bestRttMs === Number.POSITIVE_INFINITY ? { clockOffsetMs: serverNow - this.now() } : {};
  }

  private nameIn(state: RoomState): string {
    return state.players.find((p) => p.id === this.playerId)?.name ?? this.name;
  }

  private refreshHost(state: RoomState): Me | null {
    const me = this.snap.me;
    if (!me) return null;
    const player = state.players.find((p) => p.id === me.playerId);
    return player ? { ...me, isHost: player.isHost } : me;
  }

  private handleClose(): void {
    this.ws = null;
    this.stopTimers();
    if (this.closedByUser || this.fatal) return;
    this.setSnap({ status: "reconnecting" });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    const delay = base + Math.floor(base * JITTER_RATIO * this.random());
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private fail(message: string): void {
    this.fatal = true;
    const ws = this.ws;
    this.ws = null;
    this.stopTimers();
    ws?.close();
    this.setSnap({ status: "closed", error: message });
  }

  private startPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (ws && ws.readyState === OPEN) this.transmit(ws, { t: "ping", clientTime: this.now() });
    }, PING_INTERVAL_MS);
  }

  private stopTimers(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private transmit(ws: WebSocketLike, msg: ClientMessage): void {
    ws.send(JSON.stringify(msg));
  }

  private setSnap(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.onSnapshot(this.snap);
  }
}
