import { useState, type FormEvent } from "react";
import { RoomProvider } from "../../net/RoomProvider";
import { Modal, PillButton } from "../../ui";
import { getHostSecret, getName, getPlayerId, isDemo, setName } from "../identity";
import { LinearProvider } from "../linearContext";
import { RoomShell } from "../RoomShell";
import { navigate } from "../router";

const noop = (): void => undefined;

export function RoomPage({ code }: { code: string }) {
  const [name, setNameState] = useState(() => getName());
  const [draft, setDraft] = useState("");
  const [playerId] = useState(() => getPlayerId());
  const [hostSecret] = useState(() => getHostSecret(code) ?? undefined);
  const [demo] = useState(() => isDemo(code));
  const needsName = name.trim() === "";

  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed === "") return;
    setName(trimmed);
    setNameState(trimmed);
  }

  return (
    <>
      <Modal open={needsName} onClose={noop} title="Pick a display name" dismissible={false}>
        <form className="pp-form" onSubmit={submitName}>
          <p>Other players see this name at the table.</p>
          <label className="pp-field">
            <span className="pp-field-label">Your name</span>
            <input
              className="pp-input"
              value={draft}
              placeholder="Ada Lovelace"
              autoComplete="name"
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="pp-modal-actions">
            <PillButton variant="ghost" onClick={() => navigate("/")}>
              Back to start
            </PillButton>
            <PillButton type="submit" disabled={draft.trim() === ""}>
              Join room
            </PillButton>
          </div>
        </form>
      </Modal>
      {!needsName && (
        <LinearProvider demo={demo}>
          <RoomProvider code={code} playerId={playerId} name={name} hostSecret={hostSecret}>
            <RoomShell />
          </RoomProvider>
        </LinearProvider>
      )}
    </>
  );
}
