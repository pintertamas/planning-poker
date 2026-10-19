import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClientAction } from "@shared/types";
import { RoomContext, type RoomApi } from "./api";
import { wsUrl } from "./config";
import { RoomSocket, type Snapshot } from "./socket";

type RoomProviderProps = {
  code: string;
  playerId: string;
  name: string;
  hostSecret?: string;
  create?: boolean;
  onCreateSettled?: () => void;
  children: ReactNode;
};

const INITIAL: Snapshot = {
  status: "connecting",
  state: null,
  me: null,
  clockOffsetMs: 0,
  error: null,
  errorCode: null,
};

export function RoomProvider({ code, playerId, name, hostSecret, create, onCreateSettled, children }: RoomProviderProps) {
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    let active = true;
    const socket = new RoomSocket({
      url: wsUrl(code),
      playerId,
      name,
      hostSecret,
      create,
      onSnapshot: (next) => {
        if (active) setSnap(next);
      },
      onCreateSettled,
    });
    socketRef.current = socket;
    setSnap(INITIAL);
    socket.connect();
    return () => {
      active = false;
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [code, playerId]);

  useEffect(() => {
    socketRef.current?.setName(name);
  }, [name]);

  const send = useCallback((action: ClientAction) => {
    socketRef.current?.send(action);
  }, []);

  const api = useMemo<RoomApi>(() => ({ ...snap, send }), [snap, send]);

  return <RoomContext.Provider value={api}>{children}</RoomContext.Provider>;
}
