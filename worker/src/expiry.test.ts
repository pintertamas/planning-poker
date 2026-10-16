import { describe, expect, it } from "vitest";
import { createRoom } from "@shared/reducer";
import { DEFAULT_ROOM_LIMITS, IDLE_EMPTY_TTL_MS, MAX_ROOM_AGE_MS } from "@shared/types";
import type { RoomLimits, ServerRoom } from "@shared/types";
import { limitsFromEnv, roomExpiry } from "./expiry";

const T0 = 1_000_000;
const LIMITS: RoomLimits = { idleEmptyMs: 5_000, maxAgeMs: 70_000 };

const room = (): ServerRoom => createRoom("abc123", T0);

describe("roomExpiry", () => {
  it("is null for a fresh room with a live socket", () => {
    expect(roomExpiry(room(), 1, T0, LIMITS)).toBeNull();
  });

  it("is null for an empty room just before the idle deadline", () => {
    expect(roomExpiry(room(), 0, T0 + LIMITS.idleEmptyMs - 1, LIMITS)).toBeNull();
  });

  it("is idle for an empty room at the idle deadline", () => {
    expect(roomExpiry(room(), 0, T0 + LIMITS.idleEmptyMs, LIMITS)).toBe("idle");
  });

  it("is idle for an empty room well past the idle deadline", () => {
    expect(roomExpiry(room(), 0, T0 + LIMITS.idleEmptyMs * 10, LIMITS)).toBe("idle");
  });

  it("measures idle from the last activity, not the creation", () => {
    const active = { ...room(), lastActivityAt: T0 + 3_000 };
    expect(roomExpiry(active, 0, T0 + LIMITS.idleEmptyMs, LIMITS)).toBeNull();
    expect(roomExpiry(active, 0, T0 + 3_000 + LIMITS.idleEmptyMs, LIMITS)).toBe("idle");
  });

  it("never reports idle while a socket is live, however long the room has been quiet", () => {
    const longLived: RoomLimits = { idleEmptyMs: 5_000, maxAgeMs: 10_000_000 };
    const quietSince = T0 + 1_000_000;
    expect(roomExpiry(room(), 1, quietSince, longLived)).toBeNull();
    expect(roomExpiry(room(), 2, quietSince, longLived)).toBeNull();
  });

  it("is null just before the max age", () => {
    expect(roomExpiry(room(), 1, T0 + LIMITS.maxAgeMs - 1, LIMITS)).toBeNull();
  });

  it("is max_age at the max age even with live sockets", () => {
    expect(roomExpiry(room(), 3, T0 + LIMITS.maxAgeMs, LIMITS)).toBe("max_age");
  });

  it("is max_age at the max age for an empty room", () => {
    expect(roomExpiry(room(), 0, T0 + LIMITS.maxAgeMs, LIMITS)).toBe("max_age");
  });

  it("prefers max_age when both rules apply", () => {
    const active = { ...room(), lastActivityAt: T0 + LIMITS.maxAgeMs };
    expect(roomExpiry(active, 0, T0 + LIMITS.maxAgeMs + LIMITS.idleEmptyMs, LIMITS)).toBe("max_age");
  });

  it("counts the max age from createdAt", () => {
    const later = { ...room(), createdAt: T0 + 60_000 };
    expect(roomExpiry(later, 1, T0 + LIMITS.maxAgeMs, LIMITS)).toBeNull();
    expect(roomExpiry(later, 1, T0 + 60_000 + LIMITS.maxAgeMs, LIMITS)).toBe("max_age");
  });
});

describe("limitsFromEnv", () => {
  it("falls back to the defaults when nothing is set", () => {
    expect(limitsFromEnv({})).toEqual({ idleEmptyMs: IDLE_EMPTY_TTL_MS, maxAgeMs: MAX_ROOM_AGE_MS });
    expect(limitsFromEnv({})).toEqual(DEFAULT_ROOM_LIMITS);
  });

  it("parses positive integer strings", () => {
    expect(limitsFromEnv({ IDLE_EMPTY_TTL_MS: "4000", MAX_ROOM_AGE_MS: "15000" })).toEqual({
      idleEmptyMs: 4_000,
      maxAgeMs: 15_000,
    });
  });

  it.each(["", "0", "-5", "1.5", "abc", " 300", "1e3", "9007199254740993"])(
    "falls back to the default for %j",
    (raw) => {
      expect(limitsFromEnv({ IDLE_EMPTY_TTL_MS: raw, MAX_ROOM_AGE_MS: raw })).toEqual(DEFAULT_ROOM_LIMITS);
    },
  );

  it("reads each variable independently", () => {
    expect(limitsFromEnv({ MAX_ROOM_AGE_MS: "15000" })).toEqual({
      idleEmptyMs: IDLE_EMPTY_TTL_MS,
      maxAgeMs: 15_000,
    });
  });
});
