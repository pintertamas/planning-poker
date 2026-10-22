import { useCallback, useEffect, useRef, useState } from "react";
import { useLinear } from "../../app/linearContext";
import { useRoomApi } from "../../net/api";
import type { ScaleCheck } from "../../linear/types";
import { Chip, HeroCard, Icon, LabelValue, PillButton, SectionCard, useToast } from "../../ui";
import { ImportDialog } from "./ImportDialog";
import { SyncBadge } from "./SyncBadge";
import { getPeekedId, usePeek } from "./peek";
import { TicketView } from "./TicketView";
import { findKnownTicket } from "./issueLinks";
import { pointsLabel } from "./ticketHelpers";

export function TicketStage() {
  const { state, me, send } = useRoomApi();
  const { service, mode } = useLinear();
  const toast = useToast();
  const { peekedId, setPeek } = usePeek();
  const [importOpen, setImportOpen] = useState(false);
  const [, setScaleVersion] = useState(0);
  const scaleCache = useRef(new Map<string, ScaleCheck>());
  const scalePending = useRef(new Set<string>());
  const previousCurrent = useRef<string | null>(state?.currentTicketId ?? null);

  const isHost = me?.isHost === true;
  const entries = state?.tickets ?? [];
  const currentId = state?.currentTicketId ?? null;
  const currentEntry = entries.find((entry) => entry.ticket.id === currentId) ?? null;
  const peekedEntry = peekedId === null ? null : (entries.find((entry) => entry.ticket.id === peekedId) ?? null);
  const shown = peekedEntry ?? currentEntry;
  const isPeeking = shown !== null && shown.ticket.id !== currentId;
  const teamId = currentEntry?.ticket.teamId ?? null;
  const shouldCheckScale = isHost && mode === "live" && service !== null && teamId !== null;
  const lookup = useCallback((identifier: string) => findKnownTicket(identifier, state), [state]);

  useEffect(() => {
    const previous = previousCurrent.current;
    previousCurrent.current = currentId;
    if (previous === currentId || currentId === null) return;
    const peeked = getPeekedId();
    if (peeked === null || peeked === currentId) return;
    if (!entries.some((entry) => entry.ticket.id === peeked)) return;
    const next = entries.find((entry) => entry.ticket.id === currentId);
    if (next) toast(`Host moved on to ${next.ticket.identifier}`, "info");
  }, [currentId]);

  useEffect(() => {
    if (state === null || peekedId === null) return;
    if (!entries.some((entry) => entry.ticket.id === peekedId)) setPeek(null);
  }, [state, peekedId, entries, setPeek]);

  useEffect(() => {
    if (!shouldCheckScale || !service || teamId === null) return;
    if (scaleCache.current.has(teamId) || scalePending.current.has(teamId)) return;
    scalePending.current.add(teamId);
    service.checkEstimateScale(teamId).then(
      (result) => {
        scalePending.current.delete(teamId);
        scaleCache.current.set(teamId, result);
        setScaleVersion((version) => version + 1);
      },
      () => {
        scalePending.current.delete(teamId);
      },
    );
  }, [shouldCheckScale, service, teamId]);

  const scale = teamId === null ? undefined : scaleCache.current.get(teamId);
  const blockedReason = shouldCheckScale && scale && !scale.ok ? (scale.reason ?? "this team uses an unsupported estimate scale") : null;

  if (entries.length === 0) {
    return (
      <HeroCard
        title="No tickets yet"
        actions={
          isHost ? (
            <>
              <PillButton variant="primary" size="md" icon="plus" disabled={!service} onClick={() => setImportOpen(true)}>
                Import tickets
              </PillButton>
              <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
            </>
          ) : undefined
        }
      >
        <p className="pp-muted">
          {isHost ? "Import tickets from Linear to start grooming." : "Waiting for the host to import tickets."}
        </p>
      </HeroCard>
    );
  }

  if (shown === null) {
    return (
      <HeroCard title="No ticket is current">
        <p className="pp-muted">
          {isHost
            ? "Use Make current on a ticket in the list to start grooming it."
            : "The host has not picked a ticket yet. Select one in the list to preview it."}
        </p>
      </HeroCard>
    );
  }

  const ticket = shown.ticket;
  const actions = (
    <>
      {isPeeking && (
        <PillButton variant="secondary" size="md" onClick={() => setPeek(null)}>
          Back to current
        </PillButton>
      )}
      {isPeeking && isHost && (
        <PillButton variant="primary" size="md" icon="play" onClick={() => send({ type: "setCurrent", ticketId: ticket.id })}>
          Make current
        </PillButton>
      )}
    </>
  );
  const groomedDetails =
    shown.status === "groomed" ? (
      <>
        <LabelValue label="Final estimate">
          {shown.finalEstimate !== null ? pointsLabel(shown.finalEstimate) : "Not set"}
        </LabelValue>
        <LabelValue label="Sync">
          {shown.sync === "none" ? "Not synced" : <SyncBadge ticketId={ticket.id} sync={shown.sync} />}
        </LabelValue>
      </>
    ) : null;

  return (
    <div className="tk-stage">
      {blockedReason !== null && (
        <div className="tk-warn" role="status">
          <Icon name="alert" size={16} />
          <span>{`Write-back is disabled: ${blockedReason}`}</span>
        </div>
      )}
      <TicketView
        ticket={ticket}
        lookup={lookup}
        tags={isPeeking ? <Chip tone="pink">PEEKING</Chip> : <Chip tone="dark">NOW GROOMING</Chip>}
        actions={actions}
        details={groomedDetails}
      />
    </div>
  );
}
