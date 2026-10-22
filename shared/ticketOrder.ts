import type { TicketEntry } from "./types";

type Ranked = {
  id: string;
  entry: TicketEntry;
  team: string;
  number: number;
  index: number;
  blockers: Set<string>;
};

const IDENTIFIER_PATTERN = /-(\d+)$/;
const UNNUMBERED = Number.MAX_SAFE_INTEGER;

export const ticketNumber = (identifier: string): number => {
  const match = IDENTIFIER_PATTERN.exec(identifier);
  return match?.[1] === undefined ? UNNUMBERED : Number(match[1]);
};

const compareRanked = (a: Ranked, b: Ranked): number => {
  if (a.team !== b.team) return a.team < b.team ? -1 : 1;
  if (a.number !== b.number) return a.number - b.number;
  return a.index - b.index;
};

const lowest = (candidates: Ranked[]): Ranked | undefined =>
  candidates.reduce<Ranked | undefined>(
    (best, candidate) => (best === undefined || compareRanked(candidate, best) < 0 ? candidate : best),
    undefined,
  );

const reachesItself = (start: Ranked, byId: Map<string, Ranked>): boolean => {
  const seen = new Set<string>();
  const stack = [...start.blockers];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    if (id === start.id) return true;
    seen.add(id);
    const next = byId.get(id);
    if (next !== undefined) stack.push(...next.blockers);
  }
  return false;
};

const sortTodo = (todo: TicketEntry[]): TicketEntry[] => {
  const ids = new Set(todo.map((entry) => entry.ticket.id));
  const ranked: Ranked[] = todo.map((entry, index) => ({
    id: entry.ticket.id,
    entry,
    team: entry.ticket.teamKey,
    number: ticketNumber(entry.ticket.identifier),
    index,
    blockers: new Set(entry.ticket.blockedBy.filter((blocker) => blocker !== entry.ticket.id && ids.has(blocker))),
  }));
  const byId = new Map(ranked.map((item) => [item.id, item]));
  const cyclic = new Set(ranked.filter((item) => reachesItself(item, byId)).map((item) => item.id));
  const placed = new Set<string>();
  const sorted: TicketEntry[] = [];

  while (sorted.length < ranked.length) {
    const unplaced = ranked.filter((item) => !placed.has(item.id));
    const ready = unplaced.filter((item) => item.blockers.size === 0);
    const pick = lowest(ready) ?? lowest(unplaced.filter((item) => cyclic.has(item.id))) ?? lowest(unplaced);
    if (pick === undefined) break;
    placed.add(pick.id);
    sorted.push(pick.entry);
    for (const item of unplaced) item.blockers.delete(pick.id);
  }
  return sorted;
};

const isMovable = (entry: TicketEntry, pinnedId: string | null): boolean =>
  entry.status === "todo" && entry.ticket.id !== pinnedId;

export function defaultOrder(entries: TicketEntry[], pinnedId: string | null = null): TicketEntry[] {
  const queue = sortTodo(entries.filter((entry) => isMovable(entry, pinnedId)));
  return entries.map((entry) => (isMovable(entry, pinnedId) ? (queue.shift() ?? entry) : entry));
}

export function applyPermutation(entries: TicketEntry[], ticketIds: string[]): TicketEntry[] | null {
  if (ticketIds.length !== entries.length) return null;
  const byId = new Map(entries.map((entry) => [entry.ticket.id, entry]));
  if (byId.size !== entries.length) return null;
  const ordered: TicketEntry[] = [];
  for (const id of ticketIds) {
    const entry = byId.get(id);
    if (entry === undefined) return null;
    ordered.push(entry);
  }
  return new Set(ticketIds).size === ticketIds.length ? ordered : null;
}
