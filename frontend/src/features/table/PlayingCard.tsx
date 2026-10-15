import type { CSSProperties } from "react";
import { COFFEE } from "@shared/types";
import type { CardValue } from "@shared/types";
import { Icon } from "../../ui";
import { cx } from "../../ui/cx";
import "./table.css";

export function PlayingCard({
  value,
  className,
  style,
}: {
  value: CardValue | null;
  className?: string;
  style?: CSSProperties;
}) {
  if (value === null) {
    return <div aria-hidden="true" className={cx("pp-playing-card pp-playing-card--back", className)} style={style} />;
  }
  return (
    <div aria-hidden="true" className={cx("pp-playing-card pp-playing-card--front", className)} style={style}>
      {value === COFFEE ? (
        <span className="pp-cup">
          <Icon name="coffee" size={34} />
        </span>
      ) : (
        <span className="pp-card-numeral">{value}</span>
      )}
    </div>
  );
}
