import { TIMER_OPTIONS_SEC } from "@shared/types";
import type { RoomSettings, RoundPhase } from "@shared/types";
import { PillButton, Toggle } from "../../ui";
import { cx } from "../../ui/cx";
import type { RoomApi } from "../../net/api";
import "./table.css";

type Send = RoomApi["send"];

export function HostControls({ phase, settings, send }: { phase: RoundPhase; settings: RoomSettings; send: Send }) {
  return (
    <div className="pp-host">
      <div className="pp-host-actions">
        {phase === "idle" && (
          <PillButton icon="play" onClick={() => send({ type: "startRound" })}>
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
    </div>
  );
}
