import type { RoundPhase } from "@shared/types";
import type { SessionsErrorKind } from "../../net/sessions";
import type { ChipTone } from "../../ui/Controls";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type PhaseChip = { label: string; tone: ChipTone };

const PHASE_CHIPS: Record<RoundPhase, PhaseChip> = {
  idle: { label: "WAITING", tone: "outline" },
  voting: { label: "VOTING", tone: "pink" },
  revealed: { label: "REVEALED", tone: "green" },
};

const ERROR_COPY: Record<SessionsErrorKind, string> = {
  unauthorized: "Your Linear sign-in is no longer valid. Go back to the start and sign in again.",
  wrong_workspace: "Live sessions are only available to people in the company's Linear workspace.",
  forbidden: "You do not have access to live sessions right now.",
  unavailable: "Could not load sessions. Try again.",
};

function elapsedMs(now: number, then: number): number {
  return Math.max(0, now - then);
}

export function formatRelativeTime(now: number, then: number): string {
  const elapsed = elapsedMs(now, then);
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} h ago`;
  return `${Math.floor(elapsed / DAY_MS)} d ago`;
}

export function startedLabel(now: number, createdAt: number): string {
  if (elapsedMs(now, createdAt) < MINUTE_MS) return "started just now";
  return `started ${formatRelativeTime(now, createdAt)}`;
}

export function phaseChip(phase: RoundPhase): PhaseChip {
  return PHASE_CHIPS[phase];
}

export function playersLabel(count: number): string {
  return count === 1 ? "1 player" : `${count} players`;
}

export function groomedLabel(groomed: number, total: number): string {
  return `${groomed} / ${total} groomed`;
}

export function sessionsErrorMessage(kind: SessionsErrorKind): string {
  return ERROR_COPY[kind];
}

export function isFatalSessionsError(kind: SessionsErrorKind): boolean {
  return kind !== "unavailable";
}
