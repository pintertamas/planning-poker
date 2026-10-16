import { useState } from "react";
import { RoomProvider } from "../../net/RoomProvider";
import { getHostSecret, getName, getPlayerId, isDemo } from "../identity";
import { JoinScreen } from "./JoinScreen";
import { LinearProvider } from "../linearContext";
import { RoomShell } from "../RoomShell";

export function RoomPage({ code }: { code: string }) {
  const [name, setName] = useState(() => getName());
  const [playerId] = useState(() => getPlayerId());
  const [hostSecret] = useState(() => getHostSecret(code) ?? undefined);
  const [demo] = useState(() => isDemo(code));

  if (name.trim() === "") {
    return <JoinScreen code={code} onJoin={setName} />;
  }

  return (
    <LinearProvider demo={demo}>
      <RoomProvider code={code} playerId={playerId} name={name} hostSecret={hostSecret}>
        <RoomShell />
      </RoomProvider>
    </LinearProvider>
  );
}
