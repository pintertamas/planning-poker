import { useCallback, useEffect, useState } from "react";
import { useRoomApi } from "../../net/api";
import { RoomProvider } from "../../net/RoomProvider";
import { getHostSecret, getName, getPlayerId, isDemo } from "../identity";
import { JoinScreen } from "./JoinScreen";
import { LinearProvider } from "../linearContext";
import { RoomShell } from "../RoomShell";

const NAME_TAKEN_MESSAGE = "That name is already taken in this room. Pick another one.";

function NameTakenWatcher({ name, onNameTaken }: { name: string; onNameTaken: (name: string) => void }) {
  const { errorCode } = useRoomApi();

  useEffect(() => {
    if (errorCode === "name_taken") onNameTaken(name);
  }, [errorCode, name, onNameTaken]);

  return null;
}

export function RoomPage({ code }: { code: string }) {
  const [name, setName] = useState(() => getName());
  const [playerId] = useState(() => getPlayerId());
  const [hostSecret] = useState(() => getHostSecret(code) ?? undefined);
  const [demo] = useState(() => isDemo(code));
  const [rejection, setRejection] = useState<{ rejectedName: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const rejectName = useCallback((rejectedName: string) => setRejection({ rejectedName }), []);

  function join(next: string) {
    setName(next);
    setRejection(null);
    setAttempt((current) => current + 1);
  }

  if (rejection !== null) {
    return (
      <JoinScreen code={code} initialName={rejection.rejectedName} error={NAME_TAKEN_MESSAGE} onJoin={join} />
    );
  }

  if (name.trim() === "") {
    return <JoinScreen code={code} onJoin={join} />;
  }

  return (
    <LinearProvider demo={demo}>
      <RoomProvider key={attempt} code={code} playerId={playerId} name={name} hostSecret={hostSecret}>
        <NameTakenWatcher name={name} onNameTaken={rejectName} />
        <RoomShell />
      </RoomProvider>
    </LinearProvider>
  );
}
