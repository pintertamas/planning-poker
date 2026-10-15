import { ALLOWED_ESTIMATES, COFFEE } from "@shared/types";
import type { CardValue, Estimate, Player, RoomState, TicketEntry } from "@shared/types";

export type Voter = { id: string; name: string };
export type VotersByEstimate = Record<Estimate, Voter[]>;

export function currentEntry(state: RoomState): TicketEntry | null {
  if (state.currentTicketId === null) return null;
  return state.tickets.find((entry) => entry.ticket.id === state.currentTicketId) ?? null;
}

export function roundKey(state: RoomState): string {
  return [state.currentTicketId ?? "none", state.round.phase, state.round.endsAt ?? "none"].join("|");
}

export function estimateFromKey(key: string): Estimate | null {
  return ALLOWED_ESTIMATES.find((estimate) => String(estimate) === key) ?? null;
}

export function votersByEstimate(votes: Record<string, CardValue>, players: readonly Player[]): VotersByEstimate {
  const names = new Map(players.map((player) => [player.id, player.name] as const));
  const groups: VotersByEstimate = { 1: [], 2: [], 3: [], 5: [], 8: [] };
  for (const [id, value] of Object.entries(votes)) {
    if (value === COFFEE) continue;
    groups[value].push({ id, name: names.get(id) ?? "Unknown" });
  }
  return groups;
}
