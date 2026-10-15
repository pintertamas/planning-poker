import { ALLOWED_ESTIMATES, COFFEE } from "./types";
import type { CardValue, Estimate, Summary } from "./types";

const roundOneDecimal = (n: number): number => Math.round(n * 10) / 10;

const isEstimate = (value: CardValue): value is Estimate =>
  (ALLOWED_ESTIMATES as readonly CardValue[]).includes(value);

const medianOf = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const modeOf = (counts: Record<Estimate, number>): Estimate | null => {
  let mode: Estimate | null = null;
  let best = 0;
  for (const candidate of ALLOWED_ESTIMATES) {
    const count = counts[candidate];
    if (count > 0 && count >= best) {
      best = count;
      mode = candidate;
    }
  }
  return mode;
};

export function snapToAllowed(n: number): Estimate {
  let best: Estimate = ALLOWED_ESTIMATES[0];
  for (const candidate of ALLOWED_ESTIMATES) {
    if (Math.abs(n - candidate) <= Math.abs(n - best)) {
      best = candidate;
    }
  }
  return best;
}

export function summarize(votes: Record<string, CardValue>): Summary {
  const counts: Record<Estimate, number> = { 1: 0, 2: 0, 3: 0, 5: 0, 8: 0 };
  const numeric: Estimate[] = [];
  let coffee = 0;

  for (const value of Object.values(votes)) {
    if (value === COFFEE) {
      coffee += 1;
    } else if (isEstimate(value)) {
      counts[value] += 1;
      numeric.push(value);
    }
  }

  const voters = numeric.length;
  const mode = modeOf(counts);
  const sum = numeric.reduce((total, value) => total + value, 0);

  return {
    counts,
    voters,
    coffee,
    average: voters === 0 ? null : roundOneDecimal(sum / voters),
    median: voters === 0 ? null : medianOf([...numeric].sort((a, b) => a - b)),
    mode,
    suggested: mode,
    consensus: voters >= 2 && numeric.every((value) => value === numeric[0]),
  };
}
