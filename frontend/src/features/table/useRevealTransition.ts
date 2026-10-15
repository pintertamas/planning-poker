import { useState } from "react";
import type { RoundPhase } from "@shared/types";
import { isRevealTransition } from "./motion";

type Seen = { phase: RoundPhase; ticketId: string | null; animate: boolean };

export function useRevealTransition(phase: RoundPhase, ticketId: string | null): boolean {
  const [seen, setSeen] = useState<Seen>({ phase, ticketId, animate: false });
  if (seen.phase === phase && seen.ticketId === ticketId) return seen.animate;
  const animate = isRevealTransition({ phase: seen.phase, ticketId: seen.ticketId }, { phase, ticketId });
  setSeen({ phase, ticketId, animate });
  return animate;
}
