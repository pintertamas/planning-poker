import type { RoundPhase } from "@shared/types";
import { Icon } from "../../ui";
import { cx } from "../../ui/cx";
import { fractionRemaining, timerTone, wholeSeconds } from "./timer";
import "./table.css";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerRing({
  remainingMs,
  durationSec,
  phase,
  animate = false,
}: {
  remainingMs: number;
  durationSec: number;
  phase: RoundPhase;
  animate?: boolean;
}) {
  const live = phase === "voting";
  const revealed = phase === "revealed";
  const fraction = live ? fractionRemaining(remainingMs, durationSec) : 1;
  const seconds = live ? wholeSeconds(remainingMs) : durationSec;
  const tone = live ? timerTone(remainingMs) : "calm";

  return (
    <div
      role="timer"
      aria-label={live ? `${seconds} seconds left` : revealed ? "Revealed" : `${durationSec} second timer`}
      className={cx("pp-timer", `is-${tone}`, !live && "is-muted", revealed && "is-done")}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="pp-timer-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="pp-timer-arc"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      {revealed ? (
        <span className={cx("pp-timer-check", animate && "is-popping")} aria-hidden="true">
          <Icon name="check" size={40} />
        </span>
      ) : (
        <span className="pp-timer-value" aria-hidden="true">
          {seconds}
        </span>
      )}
    </div>
  );
}
