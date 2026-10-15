import { useEffect, useState } from "react";
import { remainingMs } from "./timer";

const TICK_MS = 100;

export function useCountdown(endsAt: number | null, clockOffsetMs: number, active: boolean): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((tick) => tick + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active || endsAt === null) return 0;
  return remainingMs(endsAt, Date.now(), clockOffsetMs);
}
