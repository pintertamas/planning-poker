import { describe, expect, it } from "vitest";
import { scrollTargetFor, type ScrollSnapshot } from "./autoScroll";

const idle = (currentTicketId: string | null = "t1"): ScrollSnapshot => ({
  currentTicketId,
  phase: "idle",
  endsAt: null,
});

const voting = (endsAt = 1000, currentTicketId: string | null = "t1"): ScrollSnapshot => ({
  currentTicketId,
  phase: "voting",
  endsAt,
});

const revealed = (currentTicketId: string | null = "t1"): ScrollSnapshot => ({
  currentTicketId,
  phase: "revealed",
  endsAt: 1000,
});

describe("scrollTargetFor", () => {
  it("does nothing until a previous state has been seen", () => {
    expect(scrollTargetFor(null, voting())).toBeNull();
    expect(scrollTargetFor(null, idle("t2"))).toBeNull();
  });

  it("scrolls to the table when voting starts from idle", () => {
    expect(scrollTargetFor(idle(), voting())).toBe("table");
  });

  it("scrolls to the table when a revote opens a new round after a reveal", () => {
    expect(scrollTargetFor(revealed(), voting(2000))).toBe("table");
  });

  it("scrolls to the table when a new round starts while already voting", () => {
    expect(scrollTargetFor(voting(1000), voting(2000))).toBe("table");
  });

  it("does not scroll again for updates within the same voting round", () => {
    expect(scrollTargetFor(voting(1000), voting(1000))).toBeNull();
  });

  it("scrolls to the ticket when a different ticket becomes current", () => {
    expect(scrollTargetFor(idle("t1"), idle("t2"))).toBe("ticket");
  });

  it("scrolls to the ticket when the first ticket becomes current", () => {
    expect(scrollTargetFor(idle(null), idle("t1"))).toBe("ticket");
  });

  it("prefers the table when the ticket changes in the same update as voting starts", () => {
    expect(scrollTargetFor(idle("t1"), voting(1000, "t2"))).toBe("table");
  });

  it("does nothing when the current ticket is cleared", () => {
    expect(scrollTargetFor(idle("t1"), idle(null))).toBeNull();
  });

  it("does nothing when voting is revealed", () => {
    expect(scrollTargetFor(voting(1000), revealed())).toBeNull();
  });

  it("does nothing for an unchanged room", () => {
    expect(scrollTargetFor(idle("t1"), idle("t1"))).toBeNull();
    expect(scrollTargetFor(revealed(), revealed())).toBeNull();
  });
});
