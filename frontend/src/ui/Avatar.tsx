const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "var(--pink-hero)", fg: "var(--ink)" },
  { bg: "var(--pink-soft)", fg: "var(--ink)" },
  { bg: "var(--green-soft)", fg: "var(--green)" },
  { bg: "var(--cream-deep)", fg: "var(--ink)" },
  { bg: "var(--sand)", fg: "var(--ink)" },
  { bg: "var(--pink-accent)", fg: "var(--ink)" },
  { bg: "var(--teal)", fg: "var(--white)" },
  { bg: "var(--blue)", fg: "var(--white)" },
];

function hashName(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials || "?";
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const swatch = PALETTE[hashName(name) % PALETTE.length];
  return (
    <span
      className="pp-avatar"
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: swatch?.bg,
        color: swatch?.fg,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
