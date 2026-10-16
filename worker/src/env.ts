import type { RoomDO } from "./room";

export const ROOM_CODE_HEADER = "x-room-code";

export type Env = {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ALLOWED_ORIGINS: string;
  IDLE_EMPTY_TTL_MS?: string;
  MAX_ROOM_AGE_MS?: string;
};
