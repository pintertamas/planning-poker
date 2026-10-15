export type TimerTone = "calm" | "warning" | "critical";

export const WARNING_MS = 20_000;
export const CRITICAL_MS = 10_000;

export function remainingMs(endsAt: number, nowMs: number, clockOffsetMs: number): number {
  return Math.max(0, endsAt - (nowMs + clockOffsetMs));
}

export function fractionRemaining(remaining: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / (durationSec * 1000)));
}

export function wholeSeconds(remaining: number): number {
  return Math.ceil(Math.max(0, remaining) / 1000);
}

export function timerTone(remaining: number): TimerTone {
  if (remaining < CRITICAL_MS) return "critical";
  if (remaining < WARNING_MS) return "warning";
  return "calm";
}
