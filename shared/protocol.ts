import type { ClientAction, RoomState } from "./types";

export type ClientMessage =
  | { t: "hello"; playerId: string; name: string; hostSecret?: string; create?: boolean }
  | { t: "act"; action: ClientAction }
  | { t: "ping"; clientTime: number };

export type ServerErrorCode =
  | "forbidden"
  | "bad_request"
  | "room_full"
  | "room_closed"
  | "name_taken";

export type ServerMessage =
  | { t: "welcome"; playerId: string; isHost: boolean; state: RoomState }
  | { t: "state"; state: RoomState }
  | { t: "pong"; clientTime: number; serverNow: number }
  | { t: "error"; code: ServerErrorCode; message: string };

export const WS_PATH_PREFIX = "/ws/";
export const ROOM_CODE_PATTERN = /^[a-z0-9]{6}$/;
export const ALLOWED_ORIGINS = ["https://pintertamas.github.io"];
export const LOCAL_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const SESSIONS_PATH = "/api/sessions";
