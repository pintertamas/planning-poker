import type { Ticket } from "@shared/types";
import { LinearAuthError, LinearError } from "../../linear/client";

export const DESCRIPTION_LIMIT = 4000;

export function trimDescription(text: string, limit: number = DESCRIPTION_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function pointsLabel(points: number): string {
  return points === 1 ? "1 pt" : `${points} pts`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof LinearAuthError) {
    return "Linear rejected the API key. Reconnect Linear on this device and try again.";
  }
  if (error instanceof LinearError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

export function appendUnique(existing: Ticket[], incoming: Ticket[]): Ticket[] {
  const seen = new Set(existing.map((ticket) => ticket.id));
  const merged = [...existing];
  for (const ticket of incoming) {
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    merged.push(ticket);
  }
  return merged;
}
