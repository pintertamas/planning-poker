import { useState } from "react";
import type { TicketEntry } from "@shared/types";
import { useLinear } from "../../app/linearContext";
import { useRoomApi } from "../../net/api";
import { Chip, Icon, PillButton, SideRow } from "../../ui";
import { ImportDialog } from "./ImportDialog";
import { SyncBadge } from "./SyncBadge";
import { usePeek } from "./peek";
import { pointsLabel } from "./ticketHelpers";
import { useWriteback } from "./useWriteback";
import "./tickets.css";

function RowStatus({ entry, isCurrent }: { entry: TicketEntry; isCurrent: boolean }) {
  if (!isCurrent && entry.status !== "groomed") return null;
  return (
    <span className="tk-row-status">
      {isCurrent && (
        <span className="tk-now">
          <span className="tk-now-dot" aria-hidden="true" />
          Now grooming
        </span>
      )}
      {entry.status === "groomed" && (
        <>
          <Chip tone="green">{entry.finalEstimate !== null ? pointsLabel(entry.finalEstimate) : "Groomed"}</Chip>
          <SyncBadge ticketId={entry.ticket.id} sync={entry.sync} />
        </>
      )}
    </span>
  );
}

export function TicketPanel() {
  const { state, me, send } = useRoomApi();
  const { service } = useLinear();
  const { peekedId, setPeek } = usePeek();
  const [importOpen, setImportOpen] = useState(false);
  useWriteback();

  const isHost = me?.isHost === true;
  const canImport = isHost || service !== null;
  const entries = state?.tickets ?? [];
  const currentId = state?.currentTicketId ?? null;
  const groomedCount = entries.filter((entry) => entry.status === "groomed").length;

  return (
    <div className="tk-panel">
      <div className="tk-panel-head">
        <span className="tk-progress">
          {entries.length > 0 ? `${groomedCount} / ${entries.length} groomed` : "No tickets yet"}
        </span>
      </div>
      {canImport && (
        <PillButton
          variant="primary"
          size="sm"
          icon="plus"
          className="tk-import-btn"
          disabled={!service}
          onClick={() => setImportOpen(true)}
        >
          Import tickets
        </PillButton>
      )}
      {isHost && !service && (
        <p className="pp-muted">Linear is not connected for this room. Create a new room to sign in.</p>
      )}
      {entries.length === 0 ? (
        <p className="tk-empty">
          {canImport ? "Import tickets from Linear to start grooming." : "Waiting for the host to import tickets."}
        </p>
      ) : (
        <ul className="tk-list">
          {entries.map((entry) => {
            const id = entry.ticket.id;
            const isCurrent = id === currentId;
            const isPeeked = !isCurrent && id === peekedId;
            return (
              <li key={id} className="tk-item">
                <SideRow active={isCurrent} peeked={isPeeked}>
                  <div className="tk-row-body">
                    <button
                      type="button"
                      className="tk-row-main"
                      aria-current={isCurrent ? "true" : undefined}
                      onClick={() => setPeek(isCurrent ? null : id)}
                    >
                      <span className="tk-row-id">{entry.ticket.identifier}</span>
                      <span className="tk-row-title">{entry.ticket.title}</span>
                    </button>
                    <RowStatus entry={entry} isCurrent={isCurrent} />
                  </div>
                  {isHost && (
                    <div className="tk-row-actions">
                      {!isCurrent && (
                        <button
                          type="button"
                          className="tk-icon-btn"
                          aria-label={`Make ${entry.ticket.identifier} current`}
                          title="Make current"
                          onClick={() => send({ type: "setCurrent", ticketId: id })}
                        >
                          <Icon name="play" size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="tk-icon-btn"
                        aria-label={`Remove ${entry.ticket.identifier}`}
                        title="Remove"
                        onClick={() => send({ type: "removeTicket", ticketId: id })}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  )}
                </SideRow>
              </li>
            );
          })}
        </ul>
      )}
      {canImport && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
