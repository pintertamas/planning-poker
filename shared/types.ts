export const ALLOWED_ESTIMATES = [1, 2, 3, 5, 8] as const;
export type Estimate = (typeof ALLOWED_ESTIMATES)[number];

export const COFFEE = "coffee" as const;
export type CardValue = Estimate | typeof COFFEE;

export const TIMER_OPTIONS_SEC = [15, 30, 60] as const;
export const DEFAULT_TIMER_SEC = 30;
export const IDLE_EMPTY_TTL_MS = 5 * 60 * 1000;
export const MAX_ROOM_AGE_MS = 70 * 60 * 1000;
export const MAX_TICKETS = 200;
export const MAX_PLAYERS = 30;

export type RoomLimits = { idleEmptyMs: number; maxAgeMs: number };

export const DEFAULT_ROOM_LIMITS: RoomLimits = {
  idleEmptyMs: IDLE_EMPTY_TTL_MS,
  maxAgeMs: MAX_ROOM_AGE_MS,
};

export type Ticket = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  teamId: string;
  teamKey: string;
  stateName: string;
  assignee: string | null;
  labels: string[];
  currentEstimate: number | null;
};

export type TicketSync = "none" | "pending" | "syncing" | "synced" | "failed";

export type TicketEntry = {
  ticket: Ticket;
  status: "todo" | "groomed";
  finalEstimate: Estimate | null;
  sync: TicketSync;
};

export type Player = {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
};

export type RoundPhase = "idle" | "voting" | "revealed";

export type Round = {
  phase: RoundPhase;
  durationSec: number;
  endsAt: number | null;
  voted: Record<string, boolean>;
  votes: Record<string, CardValue> | null;
};

export type RoomSettings = {
  durationSec: number;
  autoRevealWhenAllVoted: boolean;
};

export type RoomState = {
  code: string;
  players: Player[];
  tickets: TicketEntry[];
  currentTicketId: string | null;
  round: Round;
  settings: RoomSettings;
  serverNow: number;
};

export type ServerRound = {
  phase: RoundPhase;
  durationSec: number;
  endsAt: number | null;
  votes: Record<string, Estimate>;
  revealed: Record<string, CardValue> | null;
};

export type ServerRoom = {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  hostId: string | null;
  players: Player[];
  tickets: TicketEntry[];
  currentTicketId: string | null;
  round: ServerRound;
  settings: RoomSettings;
};

export type Actor = { playerId: string; isHost: boolean };

export type ClientAction =
  | { type: "rename"; name: string }
  | { type: "vote"; value: Estimate }
  | { type: "addTickets"; tickets: Ticket[] }
  | { type: "removeTicket"; ticketId: string }
  | { type: "setCurrent"; ticketId: string }
  | { type: "startRound" }
  | { type: "reveal" }
  | { type: "revote" }
  | { type: "accept"; estimate: Estimate }
  | { type: "setSync"; ticketId: string; sync: TicketSync }
  | { type: "updateSettings"; durationSec?: number; autoRevealWhenAllVoted?: boolean };

export type ServerAction =
  | ClientAction
  | { type: "join"; playerId: string; name: string; asHost: boolean }
  | { type: "leave"; playerId: string }
  | { type: "tick" };

export type ReduceResult = { room: ServerRoom; error?: string };

export type Summary = {
  counts: Record<Estimate, number>;
  voters: number;
  coffee: number;
  average: number | null;
  median: number | null;
  mode: Estimate | null;
  suggested: Estimate | null;
  consensus: boolean;
};
