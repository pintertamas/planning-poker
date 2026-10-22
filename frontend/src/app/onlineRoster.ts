import type { Player } from "@shared/types";

export type PanelAnchor = { top: number; bottom: number; left: number; right: number };
export type PanelPlacement = { top: number; left: number; width: number; maxHeight: number };

const PANEL_WIDTH = 260;
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 16;

export function connectedRoster(players: readonly Player[]): Player[] {
  const connected = players.filter((player) => player.connected);
  return [...connected.filter((player) => player.isHost), ...connected.filter((player) => !player.isHost)];
}

export function placeOnlinePanel(anchor: PanelAnchor, viewportWidth: number, viewportHeight: number): PanelPlacement {
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(Math.max(anchor.right - width, VIEWPORT_MARGIN), viewportWidth - VIEWPORT_MARGIN - width);
  const top = anchor.bottom + PANEL_GAP;
  return { top, left, width, maxHeight: Math.max(0, viewportHeight - top - VIEWPORT_MARGIN) };
}
