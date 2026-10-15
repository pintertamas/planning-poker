import type { RoundPhase } from "@shared/types";

export const COUNT_UP_MS = 700;
export const BAR_STAGGER_MS = 90;

export type RoundMark = { phase: RoundPhase; ticketId: string | null };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function isRevealTransition(previous: RoundMark, next: RoundMark): boolean {
  return next.phase === "revealed" && previous.phase === "voting" && previous.ticketId === next.ticketId;
}

export function barDelayMs(index: number): number {
  return Math.max(0, Math.floor(index)) * BAR_STAGGER_MS;
}

export function countUpValue(progress: number, target: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped >= 1) return target;
  const eased = 1 - (1 - clamped) ** 3;
  const raw = target * eased;
  return Number.isInteger(target) ? Math.round(raw) : Math.round(raw * 10) / 10;
}

export function scrollBehavior(reduced: boolean): ScrollBehavior {
  return reduced ? "auto" : "smooth";
}
