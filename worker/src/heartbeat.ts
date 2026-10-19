import { nextAlarmAt, reduce } from "@shared/reducer";
import type { RoomLimits, ServerRoom } from "@shared/types";

export const MIN_WAKE_DELAY_MS = 1_000;

export type WakeArgs = {
  now: number;
  room: ServerRoom;
  joinedSockets: number;
  limits: RoomLimits;
};

export const isStale = (lastSeenAt: number, now: number, timeoutMs: number): boolean =>
  now - lastSeenAt >= timeoutMs;

export const staleSocketIndexes = (lastSeen: number[], now: number, timeoutMs: number): number[] =>
  lastSeen.flatMap((seenAt, index) => (isStale(seenAt, now, timeoutMs) ? [index] : []));

export const departedPlayerIds = (stalePlayerIds: string[], livePlayerIds: string[]): string[] => {
  const live = new Set(livePlayerIds);
  return [...new Set(stalePlayerIds)].filter((playerId) => !live.has(playerId));
};

export const departPlayers = (room: ServerRoom, playerIds: string[], now: number): ServerRoom =>
  playerIds.reduce((current, playerId) => {
    const connected = current.players.some((player) => player.id === playerId && player.connected);
    if (!connected) return current;
    const result = reduce(current, { type: "leave", playerId }, { playerId, isHost: false }, now);
    return result.error === undefined ? result.room : current;
  }, room);

export const nextWakeAt = ({ now, room, joinedSockets, limits }: WakeArgs): number => {
  const deadlines = [nextAlarmAt(room, limits)];
  if (joinedSockets > 0) deadlines.push(now + limits.heartbeatCheckMs);
  return Math.max(now + MIN_WAKE_DELAY_MS, Math.min(...deadlines));
};
