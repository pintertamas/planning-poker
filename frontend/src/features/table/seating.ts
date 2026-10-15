import { COFFEE } from "@shared/types";
import type { CardValue, Player, Round } from "@shared/types";

export type SeatSlot =
  | { kind: "empty" }
  | { kind: "thinking" }
  | { kind: "missing" }
  | { kind: "hidden" }
  | { kind: "value"; value: CardValue };

export function orderSeats(players: readonly Player[]): Player[] {
  return [...players.filter((player) => player.connected), ...players.filter((player) => !player.connected)];
}

export function seatSlot(round: Round, playerId: string): SeatSlot {
  if (round.phase === "idle") return { kind: "empty" };
  if (round.phase === "voting") {
    return round.voted[playerId] === true ? { kind: "hidden" } : { kind: "thinking" };
  }
  const value = round.votes?.[playerId];
  return value === undefined ? { kind: "missing" } : { kind: "value", value };
}

export function seatLabel(slot: SeatSlot): string {
  switch (slot.kind) {
    case "empty":
      return "";
    case "thinking":
      return "thinking";
    case "missing":
      return "no vote";
    case "hidden":
      return "voted";
    case "value":
      return slot.value === COFFEE ? "coffee" : `voted ${slot.value}`;
  }
}
