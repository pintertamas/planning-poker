import { useCallback, useEffect, useState } from "react";
import type { Estimate, RoomState } from "@shared/types";
import { SectionCard } from "../../ui";
import { useRoomApi, type Me, type RoomApi } from "../../net/api";
import { CardDeck } from "./CardDeck";
import { HostControls } from "./HostControls";
import { Seats } from "./Seats";
import { TimerRing } from "./TimerRing";
import { useCountdown } from "./useCountdown";
import { currentEntry, estimateFromKey, roundKey } from "./round";
import "./table.css";

type Send = RoomApi["send"];

const STATUS_LINE = {
  idle: "Waiting for the host to start",
  voting: "Voting open: pick a card",
  revealed: "Revealed",
} as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function TableSection() {
  const { state, me, clockOffsetMs, send } = useRoomApi();
  return (
    <SectionCard title="Table">
      {state === null ? (
        <p className="pp-muted">Connecting to the table.</p>
      ) : (
        <TableBody state={state} me={me} clockOffsetMs={clockOffsetMs} send={send} />
      )}
    </SectionCard>
  );
}

function TableBody({
  state,
  me,
  clockOffsetMs,
  send,
}: {
  state: RoomState;
  me: Me | null;
  clockOffsetMs: number;
  send: Send;
}) {
  const { round, settings, players } = state;
  const entry = currentEntry(state);
  const key = roundKey(state);
  const live = round.phase === "voting";
  const remaining = useCountdown(round.endsAt, clockOffsetMs, live);
  const [pick, setPick] = useState<{ key: string; value: Estimate } | null>(null);
  const selected = pick !== null && pick.key === key ? pick.value : null;
  const isHost = me?.isHost === true;

  const vote = useCallback(
    (value: Estimate) => {
      setPick({ key, value });
      send({ type: "vote", value });
    },
    [key, send],
  );

  useEffect(() => {
    if (!live) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const value = estimateFromKey(event.key);
      if (value === null) return;
      vote(value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, vote]);

  if (entry === null) {
    return (
      <div className="pp-table-empty">
        <p className="pp-table-empty-title">Import tickets to start</p>
        <p className="pp-muted">The table opens once a ticket is selected.</p>
      </div>
    );
  }

  return (
    <div className="pp-table">
      <div className="pp-table-top">
        <TimerRing remainingMs={remaining} durationSec={live ? round.durationSec : settings.durationSec} phase={round.phase} />
        <div className="pp-table-controls">
          {isHost ? (
            <HostControls phase={round.phase} settings={settings} send={send} />
          ) : (
            <p className="pp-table-status" role="status">
              {STATUS_LINE[round.phase]}
            </p>
          )}
        </div>
      </div>
      <Seats key={`seats-${key}`} players={players} round={round} selfId={me?.playerId ?? null} />
      <CardDeck key={`deck-${key}`} phase={round.phase} selected={selected} onVote={vote} />
    </div>
  );
}
