import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type PillVariant = "primary" | "secondary" | "ghost" | "danger";
export type PillSize = "sm" | "md" | "lg";

export type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PillVariant;
  size?: PillSize;
  icon?: IconName;
};

const ICON_SIZE: Record<PillSize, number> = { sm: 14, md: 16, lg: 20 };

export function PillButton({
  variant = "primary",
  size = "md",
  icon,
  className,
  type = "button",
  children,
  ...rest
}: PillButtonProps) {
  return (
    <button
      type={type}
      className={cx("pp-btn", `pp-btn--${variant}`, `pp-btn--${size}`, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children}
    </button>
  );
}

export type ChipTone = "dark" | "green" | "blue" | "teal" | "outline" | "pink";

export function Chip({ tone = "dark", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={cx("pp-chip", `pp-chip--${tone}`)}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx("pp-toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="pp-toggle-track" aria-hidden="true">
        <span className="pp-toggle-knob" />
      </span>
    </button>
  );
}
