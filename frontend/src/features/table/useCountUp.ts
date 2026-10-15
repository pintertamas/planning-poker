import { useEffect, useState } from "react";
import { COUNT_UP_MS, countUpValue, prefersReducedMotion } from "./motion";

export function useCountUp(target: number, animate: boolean, durationMs: number = COUNT_UP_MS): number {
  const run = animate && !prefersReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!run) return undefined;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const next = Math.min(1, (now - start) / durationMs);
      setProgress(next);
      if (next < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [run, durationMs]);

  return countUpValue(run ? progress : 1, target);
}
