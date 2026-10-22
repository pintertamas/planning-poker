import type { RoomState, Ticket } from "@shared/types";

export type IssueLookup = (identifier: string) => Ticket | null;

export const REFERENCE_FETCH_LIMIT = 40;

const ISSUE_URL = /^https?:\/\/linear\.app\/[^/\s?#]+\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)(?=$|[/?#])/i;
const URL_CANDIDATE = /https?:\/\/[^\s<>()[\]]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

export function parseIssueUrl(url: string): string | null {
  const match = ISSUE_URL.exec(url);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export function extractIssueIdentifiers(markdown: string): string[] {
  const seen = new Set<string>();
  for (const match of markdown.matchAll(URL_CANDIDATE)) {
    const identifier = parseIssueUrl(match[0].replace(TRAILING_PUNCTUATION, ""));
    if (identifier !== null) seen.add(identifier);
  }
  return [...seen];
}

export function findKnownTicket(
  identifier: string,
  state: Pick<RoomState, "tickets" | "references"> | null,
): Ticket | null {
  if (state === null) return null;
  const key = identifier.toUpperCase();
  const inRoom = state.tickets.find((entry) => entry.ticket.identifier.toUpperCase() === key);
  if (inRoom) return inRoom.ticket;
  return Object.prototype.hasOwnProperty.call(state.references, key) ? (state.references[key] ?? null) : null;
}

export function unresolvedIdentifiers(
  sources: readonly string[],
  known: ReadonlySet<string>,
  limit: number = REFERENCE_FETCH_LIMIT,
): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    for (const identifier of extractIssueIdentifiers(source)) {
      if (seen.size >= limit) return [...seen];
      if (known.has(identifier)) continue;
      seen.add(identifier);
    }
  }
  return [...seen];
}
