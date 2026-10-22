import { useState } from "react";
import type { TicketEntry } from "@shared/types";
import { useLinear } from "../../app/linearContext";
import { useRoomApi } from "../../net/api";
import { Chip, Icon, PillButton, SideRow } from "../../ui";
import { ImportDialog } from "./ImportDialog";
import { SyncBadge } from "./SyncBadge";
import { TicketDependencies } from "./TicketDependencies";
import { usePeek } from "./peek";
import { pointsLabel } from "./ticketHelpers";
import { useTicketReorder } from "./useTicketReorder";
import { useWriteback } from "./useWriteback";
import "./tickets.css";
import "./ticketOrder.css";

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
  const entries = state?.tickets ?? [];
  const currentId = state?.currentTicketId ?? null;
  const groomedCount = entries.filter((entry) => entry.status === "groomed").length;
  const reorder = useTicketReorder({
    entries,
    serverKey: state,
    enabled: isHost,
    sendOrder: (ticketIds) => send({ type: "reorderTickets", ticketIds }),
  });
  const shown = reorder.displayed;
  const dragged = reorder.drag === null ? null : shown.find((entry) => entry.ticket.id === reorder.drag?.id) ?? null;

  return (
    <div className="tk-panel">
      <div className="tk-panel-head">
        <span className="tk-progress">
          {entries.length > 0 ? `${groomedCount} / ${entries.length} groomed` : "No tickets yet"}
        </span>
        {isHost && state?.manualOrder === true && (
          <PillButton
            variant="ghost"
            size="sm"
            onClick={() => send({ type: "resetOrder" })}
          >
            Reset order
          </PillButton>
        )}
      </div>
      {isHost && (
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
          {isHost ? "Import tickets from Linear to start grooming." : "Waiting for the host to import tickets."}
        </p>
      ) : (
        <ul className="tk-list tk-reorder-list" ref={reorder.listRef}>
          {shown.map((entry, index) => {
            const id = entry.ticket.id;
            const isCurrent = id === currentId;
            const isPeeked = !isCurrent && id === peekedId;
            const canDrag = isHost && entry.status === "todo";
            return (
              <li
                key={id}
                className={reorder.drag?.id === id ? "tk-item is-dragging" : "tk-item"}
                ref={(el) => reorder.setRow(id, el)}
              >
                <SideRow active={isCurrent} peeked={isPeeked}>
                  {canDrag && (
                    <button
                      type="button"
                      className="tk-grip"
                      aria-label={`Reorder ${entry.ticket.identifier}, position ${index + 1} of ${shown.length}. Use the arrow keys to move it.`}
                      title="Drag to reorder"
                      ref={(el) => reorder.setGrip(id, el)}
                      onPointerDown={(event) => reorder.onGripPointerDown(event, id)}
                      onPointerMove={reorder.onGripPointerMove}
                      onPointerUp={reorder.onGripPointerUp}
                      onPointerCancel={reorder.onGripPointerCancel}
                      onKeyDown={(event) => reorder.onGripKeyDown(event, id)}
                    >
                      <Icon name="grip" size={14} />
                    </button>
                  )}
                  {isHost && !canDrag && <span className="tk-grip-spacer" aria-hidden="true" />}
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
                    <TicketDependencies entry={entry} index={index} entries={shown} />
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
          {reorder.drag !== null && reorder.drag.lineY !== null && (
            <li className="tk-drop-line" aria-hidden="true" style={{ top: reorder.drag.lineY }} />
          )}
        </ul>
      )}
      {dragged !== null && reorder.drag !== null && (
        <div
          className="tk-ghost"
          aria-hidden="true"
          style={{ top: reorder.drag.pointerY - reorder.drag.grabOffset, left: reorder.drag.left, width: reorder.drag.width }}
        >
          <span className="tk-row-id">{dragged.ticket.identifier}</span>
          <span className="tk-row-title">{dragged.ticket.title}</span>
        </div>
      )}
      <p className="tk-sr-only" role="status" aria-live="polite">
        {reorder.announcement}
      </p>
      {isHost && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
