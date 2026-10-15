import { ALLOWED_ESTIMATES } from "@shared/types";
import type { Estimate } from "@shared/types";
import { Avatar } from "../../ui";
import { cx } from "../../ui/cx";
import type { VotersByEstimate } from "./round";
import "./table.css";

export function DistributionBars({
  counts,
  voters,
}: {
  counts: Record<Estimate, number>;
  voters: VotersByEstimate;
}) {
  const peak = Math.max(1, ...ALLOWED_ESTIMATES.map((value) => counts[value]));
  return (
    <div className="pp-bars" role="list" aria-label="Vote distribution">
      {ALLOWED_ESTIMATES.map((value) => {
        const count = counts[value];
        const isPeak = count > 0 && count === peak;
        return (
          <div key={value} className="pp-bar" role="listitem">
            <span className="pp-bar-count">{count}</span>
            <div className="pp-bar-track">
              <div className={cx("pp-bar-fill", isPeak && "is-peak")} style={{ height: `${(count / peak) * 100}%` }} />
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
