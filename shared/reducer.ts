import {
  ALLOWED_ESTIMATES,
  COFFEE,
  DEFAULT_TIMER_SEC,
  MAX_PLAYERS,
  MAX_TICKETS,
  ROOM_TTL_MS,
  TIMER_OPTIONS_SEC,
} from "./types";
import type {
  Actor,
  CardValue,
  Estimate,
  Player,
  ReduceResult,
  RoomState,
  ServerAction,
  ServerRound,
  ServerRoom,
  Ticket,
  TicketEntry,
  TicketSync,
} from "./types";

type Outcome = { room: ServerRoom } | { error: string };

const NAME_MAX_LENGTH = 24;
const FALLBACK_NAME = "Guest";

const HOST_ONLY_ACTIONS: ReadonlySet<ServerAction["type"]> = new Set<ServerAction["type"]>([
  "addTickets",
  "removeTicket",
  "setCurrent",
  "startRound",
  "reveal",
  "revote",
  "accept",
  "setSync",
  "updateSettings",
]);

const ok = (room: ServerRoom): Outcome => ({ room });
const fail = (error: string): Outcome => ({ error });

const isEstimate = (value: unknown): value is Estimate =>
  (ALLOWED_ESTIMATES as readonly unknown[]).includes(value);

const isTimerOption = (value: number): boolean =>
  (TIMER_OPTIONS_SEC as readonly number[]).includes(value);

const sanitizeName = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === "") return FALLBACK_NAME;
  return Array.from(trimmed).slice(0, NAME_MAX_LENGTH).join("").trimEnd();
};

const nameKey = (sanitized: string): string => sanitized.replace(/\s+/g, " ").toLowerCase();

const omitSeats = <V>(record: Record<string, V>, playerIds: ReadonlySet<string>): Record<string, V> =>
  Object.fromEntries(Object.entries(record).filter(([id]) => !playerIds.has(id)));

const removeSeats = (room: ServerRoom, playerIds: ReadonlySet<string>): ServerRoom => ({
  ...room,
  players: room.players.filter((player) => !playerIds.has(player.id)),
  round: {
    ...room.round,
    votes: omitSeats(room.round.votes, playerIds),
    revealed: room.round.revealed === null ? null : omitSeats(room.round.revealed, playerIds),
  },
});

const claimName = (room: ServerRoom, playerId: string, sanitized: string): ServerRoom | null => {
  const key = nameKey(sanitized);
  const holders = room.players.filter(
    (player) => player.id !== playerId && nameKey(player.name) === key,
  );
  if (holders.some((player) => player.connected || player.id === room.hostId)) return null;
  if (holders.length === 0) return room;
  return removeSeats(room, new Set(holders.map((player) => player.id)));
};

const voteOf = (votes: Record<string, Estimate>, playerId: string): Estimate | undefined =>
  Object.prototype.hasOwnProperty.call(votes, playerId) ? votes[playerId] : undefined;

const hasPlayer = (room: ServerRoom, playerId: string): boolean =>
  room.players.some((player) => player.id === playerId);

const freshRound = (room: ServerRoom): ServerRound => ({
  phase: "idle",
  durationSec: room.settings.durationSec,
  endsAt: null,
  votes: {},
  revealed: null,
});

const openRound = (room: ServerRoom, now: number): ServerRound => ({
  phase: "voting",
  durationSec: room.settings.durationSec,
  endsAt: now + room.settings.durationSec * 1000,
  votes: {},
  revealed: null,
});

const revealRound = (room: ServerRoom): ServerRound => {
  const revealed: Record<string, CardValue> = {};
  for (const player of room.players) {
    const vote = voteOf(room.round.votes, player.id);
    if (player.connected) {
      revealed[player.id] = vote ?? COFFEE;
    } else if (vote !== undefined) {
      revealed[player.id] = vote;
    }
  }
  return { ...room.round, phase: "revealed", endsAt: null, revealed };
};

const everyConnectedVoted = (room: ServerRoom): boolean => {
  const connected = room.players.filter((player) => player.connected);
  return (
    connected.length > 0 &&
    connected.every((player) => voteOf(room.round.votes, player.id) !== undefined)
  );
};

const autoRevealIfComplete = (room: ServerRoom): ServerRoom =>
  room.round.phase === "voting" && room.settings.autoRevealWhenAllVoted && everyConnectedVoted(room)
    ? { ...room, round: revealRound(room) }
    : room;

const nextTodoId = (tickets: TicketEntry[], from: number): string | null => {
  const order = [...tickets.slice(from), ...tickets.slice(0, from)];
  const next = order.find((entry) => entry.status === "todo");
  return next ? next.ticket.id : null;
};

const join = (room: ServerRoom, playerId: string, name: string, asHost: boolean): Outcome => {
  const cleanName = sanitizeName(name);
  const exists = hasPlayer(room, playerId);
  if (!exists && room.players.length >= MAX_PLAYERS) return fail("room_full");
  const claimed = claimName(room, playerId, cleanName);
  if (claimed === null) return fail("name_taken");
  const hostId = asHost ? playerId : claimed.hostId;
  const players: Player[] = exists
    ? claimed.players.map((player) =>
        player.id === playerId ? { ...player, name: cleanName, connected: true } : player,
      )
    : [...claimed.players, { id: playerId, name: cleanName, connected: true, isHost: false }];
  return ok({
    ...claimed,
    hostId,
    players: players.map((player) => ({ ...player, isHost: player.id === hostId })),
  });
};

const leave = (room: ServerRoom, playerId: string): Outcome => {
  if (!hasPlayer(room, playerId)) return fail("not_found");
  const players = room.players.map((player) =>
    player.id === playerId ? { ...player, connected: false } : player,
  );
  return ok(autoRevealIfComplete({ ...room, players }));
};

const tick = (room: ServerRoom, now: number): Outcome => {
  const due =
    room.round.phase === "voting" && room.round.endsAt !== null && now >= room.round.endsAt;
  return ok(due ? { ...room, round: revealRound(room) } : room);
};

const rename = (room: ServerRoom, playerId: string, name: string): Outcome => {
  if (!hasPlayer(room, playerId)) return fail("not_found");
  const cleanName = sanitizeName(name);
  const claimed = claimName(room, playerId, cleanName);
  if (claimed === null) return fail("name_taken");
  return ok({
    ...claimed,
    players: claimed.players.map((player) =>
      player.id === playerId ? { ...player, name: cleanName } : player,
    ),
  });
};

const vote = (room: ServerRoom, playerId: string, value: unknown): Outcome => {
  if (room.round.phase !== "voting") return fail("bad_state");
  if (!isEstimate(value)) return fail("bad_request");
  if (!hasPlayer(room, playerId)) return fail("not_found");
  return ok(
    autoRevealIfComplete({
      ...room,
      round: { ...room.round, votes: { ...room.round.votes, [playerId]: value } },
    }),
  );
};

const addTickets = (room: ServerRoom, incoming: Ticket[]): Outcome => {
  const entries = [...room.tickets];
  const seen = new Set(entries.map((entry) => entry.ticket.id));
  for (const ticket of incoming) {
    if (entries.length >= MAX_TICKETS) break;
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    entries.push({
      ticket: { ...ticket, labels: [...ticket.labels] },
      status: "todo",
      finalEstimate: null,
      sync: "none",
    });
  }
  const added = entries.length > room.tickets.length;
  const currentTicketId =
    room.currentTicketId === null && added
      ? (entries.find((entry) => entry.status === "todo")?.ticket.id ?? null)
      : room.currentTicketId;
  return ok({ ...room, tickets: entries, currentTicketId });
};

const removeTicket = (room: ServerRoom, ticketId: string): Outcome => {
  const index = room.tickets.findIndex((entry) => entry.ticket.id === ticketId);
  if (index === -1) return fail("not_found");
  const tickets = room.tickets.filter((_, i) => i !== index);
  if (room.currentTicketId !== ticketId) return ok({ ...room, tickets });
  return ok({
    ...room,
    tickets,
    currentTicketId: nextTodoId(tickets, index),
    round: freshRound(room),
  });
};

const setCurrent = (room: ServerRoom, ticketId: string): Outcome => {
  if (!room.tickets.some((entry) => entry.ticket.id === ticketId)) return fail("not_found");
  return ok({
    ...room,
    currentTicketId: ticketId,
    round: room.round.phase === "idle" ? room.round : freshRound(room),
  });
};

const startRound = (room: ServerRoom, now: number): Outcome => {
  if (room.currentTicketId === null || room.round.phase !== "idle") return fail("bad_state");
  return ok({ ...room, round: openRound(room, now) });
};

const reveal = (room: ServerRoom): Outcome => {
  if (room.round.phase !== "voting") return fail("bad_state");
  return ok({ ...room, round: revealRound(room) });
};

const revote = (room: ServerRoom, now: number): Outcome => {
  if (room.currentTicketId === null || room.round.phase === "idle") return fail("bad_state");
  return ok({ ...room, round: openRound(room, now) });
};

const accept = (room: ServerRoom, estimate: unknown): Outcome => {
  if (room.round.phase !== "revealed" || room.currentTicketId === null) return fail("bad_state");
  if (!isEstimate(estimate)) return fail("bad_request");
  const currentId = room.currentTicketId;
  const index = room.tickets.findIndex((entry) => entry.ticket.id === currentId);
  if (index === -1) return fail("not_found");
  const tickets = room.tickets.map((entry, i): TicketEntry =>
    i === index
      ? { ...entry, status: "groomed", finalEstimate: estimate, sync: "pending" }
      : entry,
  );
  return ok({
    ...room,
    tickets,
    currentTicketId: nextTodoId(tickets, index + 1),
    round: freshRound(room),
  });
};

const setSync = (room: ServerRoom, ticketId: string, sync: TicketSync): Outcome => {
  if (!room.tickets.some((entry) => entry.ticket.id === ticketId)) return fail("not_found");
  return ok({
    ...room,
    tickets: room.tickets.map((entry) =>
      entry.ticket.id === ticketId ? { ...entry, sync } : entry,
    ),
  });
};

const updateSettings = (
  room: ServerRoom,
  durationSec: number | undefined,
  autoRevealWhenAllVoted: boolean | undefined,
): Outcome => {
  if (durationSec !== undefined && !isTimerOption(durationSec)) return fail("bad_request");
  if (autoRevealWhenAllVoted !== undefined && typeof autoRevealWhenAllVoted !== "boolean") {
    return fail("bad_request");
  }
  return ok({
    ...room,
    settings: {
      durationSec: durationSec ?? room.settings.durationSec,
      autoRevealWhenAllVoted: autoRevealWhenAllVoted ?? room.settings.autoRevealWhenAllVoted,
    },
  });
};

const apply = (room: ServerRoom, action: ServerAction, actor: Actor, now: number): Outcome => {
  switch (action.type) {
    case "join":
      return join(room, action.playerId, action.name, action.asHost);
    case "leave":
      return leave(room, action.playerId);
    case "tick":
      return tick(room, now);
    case "rename":
      return rename(room, actor.playerId, action.name);
    case "vote":
      return vote(room, actor.playerId, action.value);
    case "addTickets":
      return addTickets(room, action.tickets);
    case "removeTicket":
      return removeTicket(room, action.ticketId);
    case "setCurrent":
      return setCurrent(room, action.ticketId);
    case "startRound":
      return startRound(room, now);
    case "reveal":
      return reveal(room);
    case "revote":
      return revote(room, now);
    case "accept":
      return accept(room, action.estimate);
    case "setSync":
      return setSync(room, action.ticketId, action.sync);
    case "updateSettings":
      return updateSettings(room, action.durationSec, action.autoRevealWhenAllVoted);
  }
};

export function createRoom(code: string, now: number): ServerRoom {
  return {
    code,
    createdAt: now,
    lastActivityAt: now,
    hostId: null,
    players: [],
    tickets: [],
    currentTicketId: null,
    round: {
      phase: "idle",
      durationSec: DEFAULT_TIMER_SEC,
      endsAt: null,
      votes: {},
      revealed: null,
    },
    settings: {
      durationSec: DEFAULT_TIMER_SEC,
      autoRevealWhenAllVoted: true,
    },
  };
}

export function reduce(
  room: ServerRoom,
  action: ServerAction,
  actor: Actor,
  now: number,
): ReduceResult {
  if (HOST_ONLY_ACTIONS.has(action.type) && !actor.isHost) {
    return { room, error: "forbidden" };
  }
  const outcome = apply(room, action, actor, now);
  if ("error" in outcome) return { room, error: outcome.error };
  if (outcome.room === room) return { room };
  return { room: { ...outcome.room, lastActivityAt: now } };
}

const isVoted = (room: ServerRoom, playerId: string): boolean => {
  if (room.round.phase === "voting") return voteOf(room.round.votes, playerId) !== undefined;
  if (room.round.phase === "revealed") {
    const value = room.round.revealed?.[playerId];
    return value !== undefined && value !== COFFEE;
  }
  return false;
};

export function toPublicState(room: ServerRoom, now: number): RoomState {
  const voted: Record<string, boolean> = {};
  for (const player of room.players) {
    voted[player.id] = isVoted(room, player.id);
  }
  return {
    code: room.code,
    players: room.players.map((player) => ({ ...player })),
    tickets: room.tickets.map((entry) => ({ ...entry })),
    currentTicketId: room.currentTicketId,
    round: {
      phase: room.round.phase,
      durationSec: room.round.durationSec,
      endsAt: room.round.endsAt,
      voted,
      votes: room.round.phase === "revealed" ? room.round.revealed : null,
    },
    settings: { ...room.settings },
    serverNow: now,
  };
}

export function nextAlarmAt(room: ServerRoom): number {
  const inactiveAt = room.lastActivityAt + ROOM_TTL_MS;
  if (room.round.phase === "voting" && room.round.endsAt !== null) {
    return Math.min(room.round.endsAt, inactiveAt);
  }
  return inactiveAt;
}
