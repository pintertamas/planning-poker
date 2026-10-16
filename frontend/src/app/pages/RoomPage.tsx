import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRoomApi, type RoomApi } from "../../net/api";
import { RoomProvider } from "../../net/RoomProvider";
import { getHostSecret, getName, getPlayerId, isDemo } from "../identity";
import { JoinScreen } from "./JoinScreen";
import { LinearProvider } from "../linearContext";
import { RoomShell } from "../RoomShell";

const NAME_TAKEN_MESSAGE = "That name is already taken in this room. Pick another one.";

export type GateView = "joining" | "rejected" | "room";

export const JOIN_TIMEOUT_MS = 10000;

export function gateView({
  me,
  status,
  error,
  errorCode,
  timedOut = false,
}: Pick<RoomApi, "me" | "status" | "error" | "errorCode"> & { timedOut?: boolean }): GateView {
  if (errorCode === "name_taken") return "rejected";
  if (timedOut) return "room";
  if (me === null && error === null && (status === "connecting" || status === "reconnecting")) return "joining";
  return "room";
}

function JoinGate({
  code,
  name,
  joinError,
  onNameTaken,
  children,
}: {
  code: string;
  name: string;
  joinError?: string;
  onNameTaken: (name: string) => void;
  children: ReactNode;
}) {
  const api = useRoomApi();
  const [timedOut, setTimedOut] = useState(false);
  const view = gateView({ ...api, timedOut });

  useEffect(() => {
    if (view === "rejected") onNameTaken(name);
  }, [view, name, onNameTaken]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), JOIN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (view === "rejected") return null;
  if (view === "joining") return <JoinScreen code={code} joining initialName={name} error={joinError} onJoin={() => undefined} />;
  return <>{children}</>;
}

export function RoomPage({ code }: { code: string }) {
  const [name, setName] = useState(() => getName());
  const [playerId] = useState(() => getPlayerId());
  const [hostSecret] = useState(() => getHostSecret(code) ?? undefined);
  const [demo] = useState(() => isDemo(code));
  const [rejection, setRejection] = useState<{ rejectedName: string } | null>(null);
  const [joinError, setJoinError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const rejectName = useCallback((rejectedName: string) => {
    setJoinError(NAME_TAKEN_MESSAGE);
    setRejection({ rejectedName });
  }, []);

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
        <JoinGate code={code} name={name} joinError={joinError} onNameTaken={rejectName}>
          <RoomShell />
        </JoinGate>
      </RoomProvider>
    </LinearProvider>
  );
}
