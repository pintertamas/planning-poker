import type { RoundPhase } from "@shared/types";

export type ScrollSnapshot = {
  currentTicketId: string | null;
  phase: RoundPhase;
  endsAt: number | null;
};

export type ScrollTarget = "ticket" | "table";

export function scrollTargetFor(previous: ScrollSnapshot | null, next: ScrollSnapshot): ScrollTarget | null {
  if (previous === null) return null;
  const votingStarted =
    next.phase === "voting" && (previous.phase !== "voting" || previous.endsAt !== next.endsAt);
  if (votingStarted) return "table";
  const ticketChanged = next.currentTicketId !== null && next.currentTicketId !== previous.currentTicketId;
  return ticketChanged ? "ticket" : null;
}
