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
    return "Your Linear sign-in expired. Create a new room to sign in again.";
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

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export type RoomKeys = { ids: ReadonlySet<string>; identifiers: ReadonlySet<string> };

const identifierKey = (identifier: string): string => identifier.toLowerCase();

export function roomKeysOf(entries: ReadonlyArray<{ ticket: Ticket }>): RoomKeys {
  return {
    ids: new Set(entries.map((entry) => entry.ticket.id)),
    identifiers: new Set(entries.map((entry) => identifierKey(entry.ticket.identifier))),
  };
}

export function isInRoom(ticket: Ticket, keys: RoomKeys): boolean {
  return keys.ids.has(ticket.id) || keys.identifiers.has(identifierKey(ticket.identifier));
}

export function splitForRoom(incoming: Ticket[], keys: RoomKeys): { fresh: Ticket[]; alreadyIn: number } {
  const fresh: Ticket[] = [];
  const seen = { ids: new Set(keys.ids), identifiers: new Set(keys.identifiers) };
  let alreadyIn = 0;
  for (const ticket of incoming) {
    if (isInRoom(ticket, keys)) {
      alreadyIn += 1;
      continue;
    }
    if (isInRoom(ticket, seen)) continue;
    seen.ids.add(ticket.id);
    seen.identifiers.add(identifierKey(ticket.identifier));
    fresh.push(ticket);
  }
  return { fresh, alreadyIn };
}

export function importMessage(added: number, alreadyIn: number): string {
  if (added === 0) return "Those tickets are already in the session";
  const suffix = alreadyIn === 0 ? "" : `, ${alreadyIn === 1 ? "1 was" : `${alreadyIn} were`} already in the session`;
  return `Added ${plural(added, "ticket")}${suffix}`;
}
