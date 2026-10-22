import { describe, expect, it } from "vitest";
import type { Player } from "@shared/types";
import { connectedRoster, placeOnlinePanel } from "./onlineRoster";

const player = (id: string, connected: boolean, isHost = false): Player => ({ id, name: id, connected, isHost });

describe("connectedRoster", () => {
  it("lists only connected players", () => {
    const roster = connectedRoster([player("a", false), player("b", true), player("c", false), player("d", true)]);
    expect(roster.map((seat) => seat.id)).toEqual(["b", "d"]);
  });

  it("puts the host first and keeps the other players in state order", () => {
    const roster = connectedRoster([
      player("a", true),
      player("host", true, true),
      player("b", true),
      player("offline-host", false, true),
    ]);
    expect(roster.map((seat) => seat.id)).toEqual(["host", "a", "b"]);
  });

  it("does not show the host when the host is disconnected", () => {
    const roster = connectedRoster([player("host", false, true), player("a", true)]);
    expect(roster.map((seat) => seat.id)).toEqual(["a"]);
  });

  it("returns an empty list when nobody is connected", () => {
    expect(connectedRoster([player("a", false)])).toEqual([]);
    expect(connectedRoster([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = [player("a", true), player("host", true, true)];
    connectedRoster(input);
    expect(input.map((seat) => seat.id)).toEqual(["a", "host"]);
  });
});

describe("placeOnlinePanel", () => {
  const anchor = { top: 12, bottom: 48, left: 300, right: 340 };

  it("sits under the trigger and right-aligns with it", () => {
    const placement = placeOnlinePanel(anchor, 1280, 800);
    expect(placement.top).toBe(56);
    expect(placement.left + placement.width).toBe(340);
  });

  it("stays inside a 375px wide viewport", () => {
    const placement = placeOnlinePanel({ top: 12, bottom: 48, left: 230, right: 359 }, 375, 667);
    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.left + placement.width).toBeLessThanOrEqual(375 - 16);
    expect(placement.width).toBe(260);
  });

  it("shrinks the panel on very narrow viewports", () => {
    const placement = placeOnlinePanel({ top: 0, bottom: 20, left: 80, right: 300 }, 280, 500);
    expect(placement.width).toBe(248);
    expect(placement.left).toBe(16);
    expect(placement.left + placement.width).toBe(264);
  });

  it("never lets the anchor push the panel past the right edge", () => {
    const placement = placeOnlinePanel({ top: 0, bottom: 20, left: 500, right: 900 }, 375, 667);
    expect(placement.left + placement.width).toBeLessThanOrEqual(375 - 16);
  });

  it("limits the height to the space below the trigger", () => {
    expect(placeOnlinePanel(anchor, 1280, 800).maxHeight).toBe(800 - 56 - 16);
    expect(placeOnlinePanel(anchor, 1280, 40).maxHeight).toBe(0);
  });
});
