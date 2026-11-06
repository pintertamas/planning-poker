import { describe, expect, it } from "vitest";
import { decideStartVote } from "./startVote";

const TICKETS = ["t1", "t2", "t3"];

describe("decideStartVote", () => {
  it("starts straight away when nothing is peeked", () => {
    expect(decideStartVote("t1", null, TICKETS)).toEqual({ kind: "start" });
  });

  it("starts straight away when the peeked ticket is the current one", () => {
    expect(decideStartVote("t2", "t2", TICKETS)).toEqual({ kind: "start" });
  });

  it("asks the owner to choose when a different ticket is peeked", () => {
    expect(decideStartVote("t1", "t2", TICKETS)).toEqual({ kind: "choose", peekedId: "t2" });
  });

  it("starts straight away when the peeked ticket is no longer in the room", () => {
    expect(decideStartVote("t1", "gone", TICKETS)).toEqual({ kind: "start" });
  });

  it("starts straight away when there is no current ticket", () => {
    expect(decideStartVote(null, "t2", TICKETS)).toEqual({ kind: "start" });
  });
});
