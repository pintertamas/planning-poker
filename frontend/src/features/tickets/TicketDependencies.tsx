import type { TicketEntry } from "@shared/types";
import { Icon } from "../../ui";
import { blockedByLabel, blockerBelow, openBlockers, unblocksCount } from "./ticketOrderView";
import "./ticketOrder.css";

export function TicketDependencies({
  entry,
  index,
  entries,
}: {
  entry: TicketEntry;
  index: number;
  entries: TicketEntry[];
}) {
  if (entry.status !== "todo") return null;
  const blockers = openBlockers(entry, entries);
  const unblocks = unblocksCount(entry, entries);
  const below = blockerBelow(index, entry, entries);
  if (blockers.length === 0 && unblocks === 0 && below === null) return null;
  const warning = below === null ? null : `${below.ticket.identifier} should be groomed first`;
  return (
    <span className="tk-deps">
      {blockers.length > 0 && (
        <span className="tk-dep tk-dep--blocked">
          {blockedByLabel(blockers.map((blocker) => blocker.ticket.identifier))}
        </span>
      )}
      {unblocks > 0 && <span className="tk-dep">{`Unblocks ${unblocks}`}</span>}
      {warning !== null && (
        <span className="tk-dep-warn" role="img" aria-label={warning} title={warning}>
          <Icon name="alert" size={12} />
        </span>
      )}
    </span>
  );
}
