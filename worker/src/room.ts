import { DurableObject } from "cloudflare:workers";
import { ROOM_CODE_PATTERN } from "@shared/protocol";
import type { ServerErrorCode, ServerMessage } from "@shared/protocol";
import { createRoom, nextAlarmAt, reduce, toPublicState } from "@shared/reducer";
import { ROOM_TTL_MS } from "@shared/types";
import type { ServerRoom } from "@shared/types";
import { sha256Hex, timingSafeEqualHex } from "./auth";
import type { Env } from "./env";
import { ROOM_CODE_HEADER } from "./env";
import { sanitizeAction } from "./sanitize";

const MAX_MESSAGE_CHARS = 900000;
const MAX_HOST_SECRET_CHARS = 128;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const ROOM_KEY = "room";
const HOST_HASH_KEY = "hostHash";
const NAME_TAKEN_MESSAGE = "That name is already taken in this room.";

type Attachment = { playerId: string; isHost: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const readAttachment = (ws: WebSocket): Attachment | null => {
  const value: unknown = ws.deserializeAttachment();
  if (!isRecord(value)) return null;
  if (typeof value.playerId !== "string" || typeof value.isHost !== "boolean") return null;
  return { playerId: value.playerId, isHost: value.isHost };
};

const trySend = (socket: WebSocket, payload: string): void => {
  try {
    socket.send(payload);
  } catch {
    return;
  }
};

const closeSocket = (socket: WebSocket, code: number, reason: string): void => {
  try {
    socket.close(code, reason);
  } catch {
    return;
  }
};

export class RoomDO extends DurableObject<Env> {
  private room: ServerRoom | null = null;
  private lock: Promise<unknown> = Promise.resolve();

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task);
    this.lock = run.catch(() => undefined);
    return run;
  }

  async fetch(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      const code = request.headers.get(ROOM_CODE_HEADER);
      if (code === null || !ROOM_CODE_PATTERN.test(code)) {
        return new Response("Invalid room", { status: 400 });
      }
      await this.ensureRoom(code);
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    if (message.length > MAX_MESSAGE_CHARS) {
      this.sendError(ws, "bad_request", "Message too large");
      return;
    }
    return this.exclusive(() => this.handleMessage(ws, message));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    return this.exclusive(() => this.handleDisconnect(ws));
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.exclusive(() => this.handleDisconnect(ws));
  }

  async alarm(): Promise<void> {
    return this.exclusive(async () => {
      const room = await this.loadRoom();
      if (room === null) return;
      const now = Date.now();
      if (now >= room.lastActivityAt + ROOM_TTL_MS) {
        for (const socket of this.ctx.getWebSockets()) {
          closeSocket(socket, 1001, "Room expired");
        }
        this.room = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      const next = reduce(room, { type: "tick" }, { playerId: "", isHost: false }, now).room;
      if (next !== room) {
        await this.store(next);
        this.broadcast(next);
      }
      await this.ctx.storage.setAlarm(nextAlarmAt(next));
    });
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    const data = parseJson(raw);
    if (!isRecord(data) || typeof data.t !== "string") {
      this.sendError(ws, "bad_request", "Malformed message");
      return;
    }
    switch (data.t) {
      case "hello":
        return this.handleHello(ws, data);
      case "act":
        return this.handleAct(ws, data);
      case "ping":
        return this.handlePing(ws, data);
      default:
        this.sendError(ws, "bad_request", "Unknown message type");
    }
  }

  private async handleHello(ws: WebSocket, data: Record<string, unknown>): Promise<void> {
    const { playerId, name } = data;
    const hostSecret = data.hostSecret ?? null;
    if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId) || typeof name !== "string") {
      this.sendError(ws, "bad_request", "Invalid hello");
      return;
    }
    if (
      hostSecret !== null &&
      (typeof hostSecret !== "string" || hostSecret.length === 0 || hostSecret.length > MAX_HOST_SECRET_CHARS)
    ) {
      this.sendError(ws, "bad_request", "Invalid host secret");
      return;
    }
    const room = await this.loadRoom();
    if (room === null) {
      this.rejectClosed(ws);
      return;
    }

    let isHost = false;
    let claimedHash: string | null = null;
    if (typeof hostSecret === "string") {
      const hash = await sha256Hex(hostSecret);
      const storedHash = await this.ctx.storage.get<string>(HOST_HASH_KEY);
      if (storedHash === undefined) {
        claimedHash = hash;
        isHost = true;
      } else if (timingSafeEqualHex(storedHash, hash)) {
        isHost = true;
      } else {
        this.sendError(ws, "forbidden", "Host secret does not match this room");
        closeSocket(ws, 1008, "Forbidden");
        return;
      }
    }

    const now = Date.now();
    const result = reduce(room, { type: "join", playerId, name, asHost: isHost }, { playerId, isHost }, now);
    if (result.error !== undefined) {
      if (result.error === "name_taken") {
        this.sendError(ws, "name_taken", NAME_TAKEN_MESSAGE);
      } else {
        const code: ServerErrorCode = result.error === "room_full" ? "room_full" : "bad_request";
        this.sendError(ws, code, result.error);
      }
      closeSocket(ws, 1008, "Rejected");
      return;
    }

    if (claimedHash !== null) {
      await this.ctx.storage.put(HOST_HASH_KEY, claimedHash);
    }
    ws.serializeAttachment({ playerId, isHost } satisfies Attachment);
    await this.commit(result.room);
    this.send(ws, { t: "welcome", playerId, isHost, state: toPublicState(result.room, now) });
    this.broadcast(result.room, ws);
  }

  private async handleAct(ws: WebSocket, data: Record<string, unknown>): Promise<void> {
    const attachment = readAttachment(ws);
    if (attachment === null) {
      this.sendError(ws, "bad_request", "Join the room before acting");
      return;
    }
    const action = sanitizeAction(data.action);
    if (action === null) {
      this.sendError(ws, "bad_request", "Invalid action");
      return;
    }
    const room = await this.loadRoom();
    if (room === null) {
      this.rejectClosed(ws);
      return;
    }
    const result = reduce(room, action, { playerId: attachment.playerId, isHost: attachment.isHost }, Date.now());
    if (result.error !== undefined) {
      this.sendError(ws, "bad_request", result.error);
      return;
    }
    await this.commit(result.room);
    this.broadcast(result.room);
  }

  private handlePing(ws: WebSocket, data: Record<string, unknown>): void {
    const { clientTime } = data;
    if (typeof clientTime !== "number" || !Number.isFinite(clientTime)) {
      this.sendError(ws, "bad_request", "Invalid ping");
      return;
    }
    this.send(ws, { t: "pong", clientTime, serverNow: Date.now() });
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    closeSocket(ws, 1000, "Closed");
    const attachment = readAttachment(ws);
    if (attachment === null) return;
    const stillConnected = this.ctx
      .getWebSockets()
      .some((socket) => socket !== ws && readAttachment(socket)?.playerId === attachment.playerId);
    if (stillConnected) return;
    const room = await this.loadRoom();
    if (room === null) return;
    const result = reduce(room, { type: "leave", playerId: attachment.playerId }, { playerId: attachment.playerId, isHost: attachment.isHost }, Date.now());
    if (result.error !== undefined) return;
    await this.commit(result.room);
    this.broadcast(result.room);
  }

  private async ensureRoom(code: string): Promise<ServerRoom> {
    const existing = await this.loadRoom();
    if (existing !== null) return existing;
    const room = createRoom(code, Date.now());
    await this.commit(room);
    return room;
  }

  private async loadRoom(): Promise<ServerRoom | null> {
    if (this.room === null) {
      this.room = (await this.ctx.storage.get<ServerRoom>(ROOM_KEY)) ?? null;
    }
    return this.room;
  }

  private async store(room: ServerRoom): Promise<void> {
    await this.ctx.storage.put(ROOM_KEY, room);
    this.room = room;
  }

  private async commit(room: ServerRoom): Promise<void> {
    await this.store(room);
    await this.ctx.storage.setAlarm(nextAlarmAt(room));
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    trySend(ws, JSON.stringify(message));
  }

  private sendError(ws: WebSocket, code: ServerErrorCode, message: string): void {
    this.send(ws, { t: "error", code, message });
  }

  private rejectClosed(ws: WebSocket): void {
    this.sendError(ws, "room_closed", "Room no longer exists");
    closeSocket(ws, 1000, "Room closed");
  }

  private broadcast(room: ServerRoom, except?: WebSocket): void {
    const payload = JSON.stringify({ t: "state", state: toPublicState(room, Date.now()) } satisfies ServerMessage);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except || readAttachment(socket) === null) continue;
      trySend(socket, payload);
    }
  }
}
