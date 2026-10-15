import { createContext, useContext } from "react";
import type { ClientAction, RoomState } from "@shared/types";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export type Me = { playerId: string; name: string; isHost: boolean };

export type RoomApi = {
  status: ConnectionStatus;
  state: RoomState | null;
  me: Me | null;
  clockOffsetMs: number;
  error: string | null;
  send: (action: ClientAction) => void;
};

export const RoomContext = createContext<RoomApi | null>(null);

export function useRoomApi(): RoomApi {
  const api = useContext(RoomContext);
  if (!api) throw new Error("useRoomApi must be used inside RoomProvider");
  return api;
}
