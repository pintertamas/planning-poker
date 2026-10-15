import { useEffect, useRef, useState } from "react";
import { ALLOWED_ESTIMATES } from "@shared/types";
import type { Estimate, RoomState } from "@shared/types";
import { summarize } from "@shared/stats";
import { Chip, Icon, LabelValue, PillButton, SectionCard } from "../../ui";
import { useRoomApi, type RoomApi } from "../../net/api";
import { DistributionBars } from "./DistributionBars";
import { currentEntry, roundKey, votersByEstimate } from "./round";
import "./table.css";

type Send = RoomApi["send"];

const CONFETTI_COLORS = ["#ff6fc4", "#ffc5e8", "#1e5e3c", "#ffffff"];

export function ResultsSection() {
  const { state, me, send } = useRoomApi();
  return (
    <SectionCard title="Results">
      {state === null ? (
        <p className="pp-muted">Connecting to the table.</p>
      ) : (
        <ResultsBody state={state} isHost={me?.isHost === true} send={send} />
      )}
    </SectionCard>
  );
}

function ResultsBody({ state, isHost, send }: { state: RoomState; isHost: boolean; send: Send }) {
  const entry = currentEntry(state);
  const key = roundKey(state);
  const revealed = state.round.phase === "revealed";
  const votes = state.round.votes ?? {};
  const summary = summarize(votes);
  const [pick, setPick] = useState<{ key: string; value: Estimate | null } | null>(null);
  const chosen = pick !== null && pick.key === key ? pick.value : summary.suggested;
  const celebrateKey = revealed && summary.consensus ? key : null;
  const celebrated = useRef<string | null>(null);

  useEffect(() => {
    if (celebrateKey === null || celebrated.current === celebrateKey) return undefined;
    celebrated.current = celebrateKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    void import("canvas-confetti")
      .then(({ default: confetti }) =>
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: CONFETTI_COLORS }),
      )
      .catch(() => undefined);
    return undefined;
  }, [celebrateKey]);

  if (entry === null) {
    return <p className="pp-muted">No ticket is selected.</p>;
  }

  return (
    <div className="pp-results">
      <div className="pp-results-head">
        <div className="pp-results-ticket">
          <span className="pp-results-id">{entry.ticket.identifier}</span>
          <h3 className="pp-results-title">{entry.ticket.title}</h3>
        </div>
        {revealed && summary.consensus && <Chip tone="green">Consensus</Chip>}
      </div>

      {!revealed ? (
        <p className="pp-muted">Results appear here once the cards are revealed.</p>
      ) : (
        <>
          <DistributionBars counts={summary.counts} voters={votersByEstimate(votes, state.players)} />
          <div className="pp-grid">
            <LabelValue label="Average">{summary.average ?? "–"}</LabelValue>
            <LabelValue label="Median">{summary.median ?? "–"}</LabelValue>
            <LabelValue label="Most voted">{summary.mode ?? "–"}</LabelValue>
            <LabelValue label="Coffee">
              <span className="pp-coffee-count">
                <Icon name="coffee" size={14} />
                {summary.coffee}
              </span>
            </LabelValue>
          </div>

          <div className="pp-accept">
            {isHost ? (
              <>
                <span className="pp-field-label">Final estimate</span>
                <div className="pp-estimate-row" role="group" aria-label="Final estimate">
                  {ALLOWED_ESTIMATES.map((value) => (
                    <PillButton
                      key={value}
                      size="sm"
                      variant={chosen === value ? "primary" : "secondary"}
                      aria-pressed={chosen === value}
                      onClick={() => setPick({ key, value })}
                    >
                      {value}
                    </PillButton>
                  ))}
                </div>
                <div>
                  <PillButton
                    disabled={chosen === null}
                    onClick={() => {
                      if (chosen !== null) send({ type: "accept", estimate: chosen });
                    }}
                  >
                    Accept & next
                  </PillButton>
                </div>
              </>
            ) : (
              <div className="pp-accept-wait">
                <p className="pp-muted">Waiting for the host to accept an estimate</p>
                {summary.suggested !== null && <Chip tone="pink">Suggested {summary.suggested}</Chip>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
