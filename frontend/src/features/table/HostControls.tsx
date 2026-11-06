import { useState } from "react";
import { TIMER_OPTIONS_SEC } from "@shared/types";
import type { RoomSettings, RoundPhase, TicketEntry } from "@shared/types";
import { Modal, PillButton, Toggle } from "../../ui";
import { cx } from "../../ui/cx";
import type { RoomApi } from "../../net/api";
import { usePeek } from "../tickets/peek";
import { decideStartVote } from "./startVote";
import "./table.css";

type Send = RoomApi["send"];

function StartVoteDialog({
  peekedIdentifier,
  currentIdentifier,
  onGroomPeeked,
  onVoteCurrent,
  onCancel,
}: {
  peekedIdentifier: string;
  currentIdentifier: string;
  onGroomPeeked: () => void;
  onVoteCurrent: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open onClose={onCancel} title="Start voting on which ticket?">
      <p>
        You are peeking at {peekedIdentifier}, but {currentIdentifier} is the current ticket. Choose which one to vote
        on. Voting starts only after you choose.
      </p>
      <div className="pp-modal-actions">
        <PillButton variant="ghost" onClick={onCancel}>
          Cancel
        </PillButton>
        <PillButton variant="secondary" onClick={onVoteCurrent}>
          Vote on {currentIdentifier}
        </PillButton>
        <PillButton icon="play" onClick={onGroomPeeked}>
          Make {peekedIdentifier} current and vote
        </PillButton>
      </div>
    </Modal>
  );
}

export function HostControls({
  phase,
  settings,
  send,
  tickets,
  currentTicketId,
}: {
  phase: RoundPhase;
  settings: RoomSettings;
  send: Send;
  tickets: TicketEntry[];
  currentTicketId: string | null;
}) {
  const { peekedId, setPeek } = usePeek();
  const [pendingPeekId, setPendingPeekId] = useState<string | null>(null);

  const peekedEntry = pendingPeekId === null ? undefined : tickets.find((entry) => entry.ticket.id === pendingPeekId);
  const currentEntry = tickets.find((entry) => entry.ticket.id === currentTicketId);

  function startVoting() {
    const decision = decideStartVote(currentTicketId, peekedId, tickets.map((entry) => entry.ticket.id));
    if (decision.kind === "start") {
      send({ type: "startRound" });
      return;
    }
    setPendingPeekId(decision.peekedId);
  }

  function finishChoice(ticketId: string | null) {
    if (ticketId !== null) send({ type: "setCurrent", ticketId });
    send({ type: "startRound" });
    setPeek(null);
    setPendingPeekId(null);
  }

  return (
    <div className="pp-host">
      <div className="pp-host-actions">
        {phase === "idle" && (
          <PillButton icon="play" onClick={startVoting}>
            Start voting
          </PillButton>
        )}
        {phase === "voting" && (
          <>
            <PillButton onClick={() => send({ type: "reveal" })}>Reveal estimates</PillButton>
            <PillButton variant="ghost" icon="refresh" onClick={() => send({ type: "revote" })}>
              Restart
            </PillButton>
          </>
        )}
        {phase === "revealed" && (
          <PillButton variant="secondary" icon="refresh" onClick={() => send({ type: "revote" })}>
            Vote again
          </PillButton>
        )}
      </div>
      <div className="pp-host-settings">
        <div className="pp-host-timer">
          <span className="pp-field-label">Timer</span>
          <div className="pp-seg-group" role="group" aria-label="Timer length">
            {TIMER_OPTIONS_SEC.map((sec) => {
              const active = sec === settings.durationSec;
              return (
                <button
                  key={sec}
                  type="button"
                  className={cx("pp-seg", active && "is-active")}
                  aria-pressed={active}
                  onClick={() => send({ type: "updateSettings", durationSec: sec })}
                >
                  {sec}s
                </button>
              );
            })}
          </div>
        </div>
        <Toggle
          checked={settings.autoRevealWhenAllVoted}
          label="Reveal automatically when everyone has voted"
          onChange={(value) => send({ type: "updateSettings", autoRevealWhenAllVoted: value })}
        />
      </div>
      {phase === "idle" && peekedEntry !== undefined && currentEntry !== undefined && (
        <StartVoteDialog
          peekedIdentifier={peekedEntry.ticket.identifier}
          currentIdentifier={currentEntry.ticket.identifier}
          onGroomPeeked={() => finishChoice(peekedEntry.ticket.id)}
          onVoteCurrent={() => finishChoice(null)}
          onCancel={() => setPendingPeekId(null)}
        />
      )}
    </div>
  );
}
