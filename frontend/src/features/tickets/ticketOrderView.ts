import type { TicketEntry } from "@shared/types";

export type Segment = { start: number; end: number };

const CHIP_IDENTIFIER_LIMIT = 2;

export function openBlockers(entry: TicketEntry, entries: TicketEntry[]): TicketEntry[] {
  const wanted = new Set(entry.ticket.blockedBy);
  return entries.filter(
    (other) =>
      other.ticket.id !== entry.ticket.id && other.status === "todo" && wanted.has(other.ticket.id),
  );
}

export function blockedByLabel(identifiers: string[]): string {
  const shown = identifiers.slice(0, CHIP_IDENTIFIER_LIMIT).join(", ");
  const hidden = identifiers.length - CHIP_IDENTIFIER_LIMIT;
  return hidden > 0 ? `Blocked by ${shown} +${hidden}` : `Blocked by ${shown}`;
}

export function unblocksCount(entry: TicketEntry, entries: TicketEntry[]): number {
  return entries.filter(
    (other) =>
      other.ticket.id !== entry.ticket.id &&
      other.status === "todo" &&
      other.ticket.blockedBy.includes(entry.ticket.id),
  ).length;
}

export function blockerBelow(index: number, entry: TicketEntry, entries: TicketEntry[]): TicketEntry | null {
  const below = openBlockers(entry, entries).filter((blocker) => entries.indexOf(blocker) > index);
  return below[0] ?? null;
}

export function segmentOf(entries: TicketEntry[], index: number): Segment {
  if (entries[index]?.status !== "todo") return { start: index, end: index };
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (entries[i]?.status === "groomed") {
      start = i + 1;
      break;
    }
  }
  let end = entries.length - 1;
  for (let i = index + 1; i < entries.length; i += 1) {
    if (entries[i]?.status === "groomed") {
      end = i - 1;
      break;
    }
  }
  return { start, end };
}

export function countAbove(midpoints: number[], pointerY: number): number {
  return midpoints.filter((midpoint) => midpoint < pointerY).length;
}

export function dropIndex(segment: Segment, from: number, midpoints: number[], pointerY: number): number {
  const others = midpoints.filter((_, offset) => segment.start + offset !== from);
  return segment.start + countAbove(others, pointerY);
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const target = Math.min(Math.max(to, 0), items.length - 1);
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];
  next.splice(target, 0, moved);
  return next;
}

export function stepTarget(segment: Segment, from: number, direction: -1 | 1): number | null {
  const to = from + direction;
  return to < segment.start || to > segment.end ? null : to;
}

export function orderedBy(entries: TicketEntry[], ids: string[]): TicketEntry[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const known = entries.filter((entry) => rank.has(entry.ticket.id));
  if (known.length !== entries.length) return entries;
  return [...known].sort((a, b) => (rank.get(a.ticket.id) ?? 0) - (rank.get(b.ticket.id) ?? 0));
}

export function positionAnnouncement(identifier: string, position: number, total: number): string {
  return `${identifier} moved to position ${position} of ${total}`;
}
