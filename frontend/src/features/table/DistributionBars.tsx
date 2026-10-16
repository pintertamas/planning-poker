import type { CSSProperties } from "react";
import { ALLOWED_ESTIMATES } from "@shared/types";
import type { Estimate } from "@shared/types";
import { Avatar } from "../../ui";
import { cx } from "../../ui/cx";
import { barDelayMs, prefersReducedMotion } from "./motion";
import type { VotersByEstimate } from "./round";
import "./table.css";

export function DistributionBars({
  counts,
  voters,
  animate = false,
}: {
  counts: Record<Estimate, number>;
  voters: VotersByEstimate;
  animate?: boolean;
}) {
  const peak = Math.max(1, ...ALLOWED_ESTIMATES.map((value) => counts[value]));
  const growing = animate && !prefersReducedMotion();
  return (
    <div className="pp-bars" role="list" aria-label="Vote distribution">
      {ALLOWED_ESTIMATES.map((value, index) => {
        const count = counts[value];
        const isPeak = count > 0 && count === peak;
        const style = {
          height: `calc(var(--bar-min) + ${count / peak} * (var(--bar-max) - var(--bar-min)))`,
          "--bar-delay": `${growing ? barDelayMs(index) : 0}ms`,
        } as CSSProperties;
        return (
          <div key={value} className="pp-bar" role="listitem">
            <span className="pp-bar-count">{count}</span>
            <div className="pp-bar-track">
              <div
                className={cx("pp-bar-fill", isPeak && "is-peak", count === 0 && "is-empty", growing && "is-growing")}
                style={style}
              />
            </div>
            <span className="pp-bar-value">{value}</span>
            <div className="pp-bar-voters">
              {voters[value].map((voter) => (
                <span key={voter.id} title={voter.name}>
                  <Avatar name={voter.name} size={26} />
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
