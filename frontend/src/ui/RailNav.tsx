import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type RailItem = {
  id: string;
  label: string;
  icon: IconName;
  active?: boolean;
  onClick: () => void;
};

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="pp-logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="pp-logo-disc" cx="24" cy="24" r="24" />
      <rect className="pp-logo-card" x="15" y="11" width="18" height="26" rx="4" transform="rotate(-14 24 24)" />
      <circle className="pp-logo-pip" cx="24" cy="24" r="2.6" transform="rotate(-14 24 24)" />
    </svg>
  );
}

function RailButton({ item }: { item: RailItem }) {
  return (
    <li>
      <button
        type="button"
        className={cx("pp-rail-item", item.active && "is-active")}
        aria-current={item.active ? "page" : undefined}
        onClick={item.onClick}
      >
        <span className="pp-rail-tile">
          <Icon name={item.icon} size={22} />
        </span>
        <span className="pp-rail-label">{item.label}</span>
      </button>
    </li>
  );
}

export function RailNav({ items, bottom }: { items: RailItem[]; bottom?: RailItem[] }) {
  return (
    <nav className="pp-rail" aria-label="Main">
      <div className="pp-rail-logo" role="img" aria-label="Planning Poker">
        <LogoMark />
      </div>
      <ul className="pp-rail-list">
        {items.map((item) => (
          <RailButton key={item.id} item={item} />
        ))}
      </ul>
      {bottom && bottom.length > 0 && (
        <ul className="pp-rail-list pp-rail-bottom">
          {bottom.map((item) => (
            <RailButton key={item.id} item={item} />
          ))}
        </ul>
      )}
    </nav>
  );
}
