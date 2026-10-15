import { parseRefs } from "./parseRefs";

export const SEARCH_LIMIT = 30;

export type NumberRange = { gte: number; lte: number };

export type IdQuery = { teamKey: string | null; digits: string };

const ID_QUERY = /^(?:([A-Za-z]+)-?|#)?(\d{1,5})$/;

export function numberPrefixRanges(digits: string, maxDigits = 5): NumberRange[] {
  if (!/^[1-9]\d*$/.test(digits)) return [];
  const base = Number(digits);
  const ranges: NumberRange[] = [];
  for (let extra = 0; digits.length + extra <= maxDigits; extra += 1) {
    const span = 10 ** extra;
    ranges.push({ gte: base * span, lte: base * span + span - 1 });
  }
  return ranges;
}

export function parseIdQuery(query: string): IdQuery | null {
  const match = ID_QUERY.exec(query.trim());
  if (!match) return null;
  const [, team, digits] = match;
  return { teamKey: team ? team.toUpperCase() : null, digits: digits ?? "" };
}

export function identifiersFor(query: string): string[] {
  const refs = new Set(parseRefs(query));
  const idQuery = parseIdQuery(query);
  if (idQuery?.teamKey) refs.add(`${idQuery.teamKey}-${idQuery.digits}`);
  return [...refs];
}

export function issueNumber(identifier: string): number {
  const match = /-(\d+)$/.exec(identifier);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function matchesIdQuery(identifier: string, query: IdQuery): boolean {
  const dash = identifier.lastIndexOf("-");
  if (query.teamKey !== null && identifier.slice(0, dash).toUpperCase() !== query.teamKey) return false;
  const number = issueNumber(identifier);
  return numberPrefixRanges(query.digits).some((range) => number >= range.gte && number <= range.lte);
}

export function mergeTickets<T extends { id: string }>(lists: T[][], limit: number = SEARCH_LIMIT): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (merged.length >= limit) return merged;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
