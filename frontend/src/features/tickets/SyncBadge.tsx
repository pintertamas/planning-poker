import type { TicketSync } from "@shared/types";
import { useRoomApi } from "../../net/api";
import { Icon } from "../../ui";

export function SyncBadge({ ticketId, sync }: { ticketId: string; sync: TicketSync }) {
  const { me, send } = useRoomApi();

  if (sync === "none") return null;

  if (sync === "pending" || sync === "syncing") {
    return (
      <span className="tk-sync tk-sync--busy" role="status">
        <span className="tk-spin" aria-hidden="true">
          <Icon name="refresh" size={12} />
        </span>
        Syncing
      </span>
    );
  }

  if (sync === "synced") {
    return (
      <span className="tk-sync tk-sync--ok">
        <Icon name="check" size={12} />
        In Linear
      </span>
    );
  }

  return (
    <span className="tk-sync tk-sync--fail" role="status">
      Sync failed
      {me?.isHost && (
        <button
          type="button"
          className="tk-retry"
          onClick={() => send({ type: "setSync", ticketId, sync: "pending" })}
        >
          Retry
        </button>
      )}
    </span>
  );
}
