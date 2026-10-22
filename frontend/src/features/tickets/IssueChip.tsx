import { createContext, useContext, type MouseEvent } from "react";
import type { IssueLookup } from "./issueLinks";
import { openLinked } from "./linkedStack";

export const TITLE_LIMIT = 60;

export const IssueLookupContext = createContext<IssueLookup>(() => null);

export function truncateTitle(title: string, limit: number = TITLE_LIMIT): string {
  const chars = Array.from(title);
  if (chars.length <= limit) return title;
  return `${chars.slice(0, limit - 1).join("").trimEnd()}…`;
}

export function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function IssueChip({ href, identifier }: { href: string; identifier: string }) {
  const lookup = useContext(IssueLookupContext);
  const known = lookup(identifier);

  return (
    <a
      className="tk-issue-chip"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={known ? `${identifier} ${known.title}` : identifier}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        openLinked(identifier, href);
      }}
    >
      <strong className="tk-issue-chip-id">{identifier}</strong>
      {known && <span className="tk-issue-chip-title">{truncateTitle(known.title)}</span>}
    </a>
  );
}
