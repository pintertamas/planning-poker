import type { Directory } from "./directory";
import type { RoomDO } from "./room";

export const ROOM_CODE_HEADER = "x-room-code";

export type Env = {
  ROOMS: DurableObjectNamespace<RoomDO>;
  DIRECTORY: DurableObjectNamespace<Directory>;
  ALLOWED_ORIGINS: string;
  ALLOWED_LINEAR_ORG_KEY: string;
  IDLE_EMPTY_TTL_MS?: string;
  MAX_ROOM_AGE_MS?: string;
};
