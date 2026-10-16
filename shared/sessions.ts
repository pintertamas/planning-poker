import type { ServerRoom, SessionSummary } from "./types";

const FALLBACK_HOST_NAME = "Host";

export const summarizeRoom = (room: ServerRoom): SessionSummary => {
  const host = room.hostId === null ? undefined : room.players.find((player) => player.id === room.hostId);
  return {
    code: room.code,
    hostName: host?.name ?? FALLBACK_HOST_NAME,
    players: room.players.filter((player) => player.connected).length,
    ticketsTotal: room.tickets.length,
    ticketsGroomed: room.tickets.filter((entry) => entry.status === "groomed").length,
    phase: room.round.phase,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
  };
};

export const sameSummary = (a: SessionSummary, b: SessionSummary): boolean =>
  a.code === b.code &&
  a.hostName === b.hostName &&
  a.players === b.players &&
  a.ticketsTotal === b.ticketsTotal &&
  a.ticketsGroomed === b.ticketsGroomed &&
  a.phase === b.phase &&
  a.createdAt === b.createdAt;
