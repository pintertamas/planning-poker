import { DEFAULT_ROOM_LIMITS } from "@shared/types";
import type { RoomLimits, ServerRoom } from "@shared/types";
import type { Env } from "./env";

export type RoomExpiry = "max_age" | "idle";

type LimitEnv = Pick<Env, "IDLE_EMPTY_TTL_MS" | "MAX_ROOM_AGE_MS">;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

const parseLimit = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || !POSITIVE_INTEGER.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : fallback;
};

export const limitsFromEnv = (env: LimitEnv): RoomLimits => ({
  idleEmptyMs: parseLimit(env.IDLE_EMPTY_TTL_MS, DEFAULT_ROOM_LIMITS.idleEmptyMs),
  maxAgeMs: parseLimit(env.MAX_ROOM_AGE_MS, DEFAULT_ROOM_LIMITS.maxAgeMs),
});

export const roomExpiry = (
  room: ServerRoom,
  liveSocketCount: number,
  now: number,
  limits: RoomLimits,
): RoomExpiry | null => {
  if (now >= room.createdAt + limits.maxAgeMs) return "max_age";
  if (liveSocketCount === 0 && now >= room.lastActivityAt + limits.idleEmptyMs) return "idle";
  return null;
};
