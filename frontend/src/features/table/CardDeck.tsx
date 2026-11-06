import type { CSSProperties } from "react";
import { ALLOWED_ESTIMATES, COFFEE } from "@shared/types";
import type { CardValue, RoundPhase } from "@shared/types";
import { cx } from "../../ui/cx";
import { PlayingCard } from "./PlayingCard";
import "./table.css";

const DECK: readonly CardValue[] = [...ALLOWED_ESTIMATES, COFFEE];

export function CardDeck({
  phase,
  selected,
  onVote,
}: {
  phase: RoundPhase;
  selected: CardValue | null;
  onVote: (value: CardValue) => void;
}) {
  const open = phase === "voting";
  return (
    <div className="pp-deck" role="group" aria-label="Pick an estimate">
      {DECK.map((value, index) => {
        const isSelected = value === selected;
        return (
          <button
            key={value}
            type="button"
            className={cx("pp-deck-card", isSelected && "is-selected", open && "is-dealing")}
            style={{ "--i": index } as CSSProperties}
            aria-pressed={isSelected}
            aria-label={value === COFFEE ? "Coffee" : `Estimate ${value}`}
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
