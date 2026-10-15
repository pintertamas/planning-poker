import type { ReactNode } from "react";
import { cx } from "./cx";

export function SidePanel({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="pp-side" aria-label={title ?? "Side panel"}>
      {title && <h2 className="pp-side-title">{title}</h2>}
      <div className="pp-side-body">{children}</div>
      {footer && <div className="pp-side-footer">{footer}</div>}
    </aside>
  );
}

export function SideRow({
  active,
  peeked,
  onClick,
  children,
}: {
  active?: boolean;
  peeked?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = cx("pp-side-row", active && "is-active", peeked && "is-peeked");
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-current={active ? "true" : undefined}>
        {children}
      </button>
    );
  }
  return <div className={className}>{children}</div>;
}
