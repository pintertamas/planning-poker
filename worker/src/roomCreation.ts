import { ROOM_MODES } from "@shared/types";
import type { RoomMode } from "@shared/types";

export const parseRoomMode = (value: unknown): RoomMode | null => {
  if (value === undefined) return "standard";
  return (ROOM_MODES as readonly unknown[]).includes(value) ? (value as RoomMode) : null;
};

export type CreateDecision = {
  hasRoom: boolean;
  hostSecret: string | null;
  create: boolean;
};

export const canCreateRoom = ({ hasRoom, hostSecret, create }: CreateDecision): boolean =>
  !hasRoom && create && hostSecret !== null && hostSecret.length > 0;
