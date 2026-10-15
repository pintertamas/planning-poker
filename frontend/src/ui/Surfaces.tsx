import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export function HeroCard({
  chips,
  title,
  actions,
  children,
}: {
  chips?: ReactNode;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="pp-hero">
      {(chips || actions) && (
        <div className="pp-hero-top">
          {chips && <div className="pp-hero-chips">{chips}</div>}
          {actions && <div className="pp-hero-actions">{actions}</div>}
        </div>
      )}
      <h1 className="pp-hero-title">{title}</h1>
      {children}
    </section>
  );
}

export function SectionCard({
  title,
  collapsible = false,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  return (
    <section className="pp-card" aria-labelledby={titleId}>
      <header className="pp-card-head">
        <h2 id={titleId} className="pp-card-title">
          {title}
        </h2>
        <div className="pp-card-tools">
          {actions}
          {collapsible && (
            <button
              type="button"
              className="pp-round"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
            </button>
          )}
        </div>
      </header>
      {open && (
        <div id={bodyId} className="pp-card-body">
          {children}
        </div>
      )}
    </section>
  );
}

export function TopBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <header className="pp-topbar">
      <div className="pp-topbar-left">{left}</div>
      <div className="pp-topbar-center">{center}</div>
      <div className="pp-topbar-right">{right}</div>
    </header>
  );
}

export function LabelValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pp-lv">
      <span className="pp-lv-label">{label}</span>
      <span className="pp-lv-value">{children}</span>
    </div>
  );
}
