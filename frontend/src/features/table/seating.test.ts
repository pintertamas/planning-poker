import { describe, expect, it } from "vitest";
import type { Player, Round } from "@shared/types";
import { orderSeats, seatLabel, seatSlot } from "./seating";

const player = (id: string, connected: boolean): Player => ({ id, name: id, connected, isHost: false });

const round = (overrides: Partial<Round>): Round => ({
  phase: "idle",
  durationSec: 60,
  endsAt: null,
  voted: {},
  votes: null,
  ...overrides,
});

describe("orderSeats", () => {
  it("keeps connected players first and in join order", () => {
    const ordered = orderSeats([player("a", false), player("b", true), player("c", true), player("d", false)]);
    expect(ordered.map((seat) => seat.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("does not mutate the input", () => {
    const input = [player("a", false), player("b", true)];
    orderSeats(input);
    expect(input.map((seat) => seat.id)).toEqual(["a", "b"]);
  });
});

describe("seatSlot", () => {
  it("is empty when idle", () => {
    expect(seatSlot(round({ phase: "idle" }), "a")).toEqual({ kind: "empty" });
  });

  it("shows a hidden card once a player has voted", () => {
    const voting = round({ phase: "voting", voted: { a: true } });
    expect(seatSlot(voting, "a")).toEqual({ kind: "hidden" });
  });

  it("shows thinking while a player has not voted", () => {
    const voting = round({ phase: "voting", voted: { a: true } });
    expect(seatSlot(voting, "b")).toEqual({ kind: "thinking" });
  });

  it("reveals the value once revealed", () => {
    const revealed = round({ phase: "revealed", votes: { a: 5, b: "coffee" } });
    expect(seatSlot(revealed, "a")).toEqual({ kind: "value", value: 5 });
    expect(seatSlot(revealed, "b")).toEqual({ kind: "value", value: "coffee" });
  });

  it("marks a player who did not vote as missing on reveal", () => {
    expect(seatSlot(round({ phase: "revealed", votes: { a: 2 } }), "b")).toEqual({ kind: "missing" });
  });
});

describe("seatLabel", () => {
  it("describes each slot for assistive tech", () => {
    expect(seatLabel({ kind: "empty" })).toBe("");
    expect(seatLabel({ kind: "thinking" })).toBe("thinking");
    expect(seatLabel({ kind: "missing" })).toBe("no vote");
    expect(seatLabel({ kind: "hidden" })).toBe("voted");
    expect(seatLabel({ kind: "value", value: 8 })).toBe("voted 8");
    expect(seatLabel({ kind: "value", value: "coffee" })).toBe("coffee");
  });
});
