import type { CSSProperties } from "react";
import { ALLOWED_ESTIMATES } from "@shared/types";
import type { Estimate, RoundPhase } from "@shared/types";
import { cx } from "../../ui/cx";
import { PlayingCard } from "./PlayingCard";
import "./table.css";

export function CardDeck({
  phase,
  selected,
  onVote,
}: {
  phase: RoundPhase;
  selected: Estimate | null;
  onVote: (value: Estimate) => void;
}) {
  const open = phase === "voting";
  return (
    <div className="pp-deck" role="group" aria-label="Pick an estimate">
      {ALLOWED_ESTIMATES.map((value, index) => {
        const isSelected = value === selected;
        return (
          <button
            key={value}
            type="button"
            className={cx("pp-deck-card", isSelected && "is-selected", open && "is-dealing")}
            style={{ "--i": index } as CSSProperties}
            aria-pressed={isSelected}
            aria-label={`Estimate ${value}`}
            disabled={!open}
            onClick={() => onVote(value)}
          >
            <PlayingCard value={value} />
          </button>
        );
      })}
    </div>
  );
}
