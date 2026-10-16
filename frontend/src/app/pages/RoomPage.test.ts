import { describe, expect, it } from "vitest";
import type { Me } from "../../net/api";
import { gateView } from "./RoomPage";

const me: Me = { playerId: "p1", name: "Ann", isHost: false };

describe("gateView", () => {
  it("shows the joining screen while the first join is pending", () => {
    expect(gateView({ me: null, status: "connecting", error: null, errorCode: null })).toBe("joining");
  });

  it("keeps the joining screen while the socket retries before the first welcome", () => {
    expect(gateView({ me: null, status: "reconnecting", error: null, errorCode: null })).toBe("joining");
  });

  it("rejects the join when the server refuses the name", () => {
    expect(
      gateView({ me: null, status: "closed", error: "That name is already taken.", errorCode: "name_taken" }),
    ).toBe("rejected");
  });

  it("shows the room once the server has accepted the join", () => {
    expect(gateView({ me, status: "open", error: null, errorCode: null })).toBe("room");
  });

  it("keeps the room during reconnects after the first welcome", () => {
    expect(gateView({ me, status: "reconnecting", error: null, errorCode: null })).toBe("room");
  });

  it("shows the room with its error banner when the join fails for another reason", () => {
    expect(gateView({ me: null, status: "closed", error: "The room is full.", errorCode: "room_full" })).toBe("room");
  });

  it("falls back to the room with its connection banner when the server stays silent", () => {
    expect(gateView({ me: null, status: "reconnecting", error: null, errorCode: null, timedOut: true })).toBe("room");
  });

  it("still rejects a taken name after the timeout", () => {
    expect(gateView({ me: null, status: "closed", error: "taken", errorCode: "name_taken", timedOut: true })).toBe("rejected");
  });

  it("shows the session-ended screen when a link points at a room that does not exist", () => {
    expect(
      gateView({
        me: null,
        status: "closed",
        error: "This session does not exist or has already ended.",
        errorCode: "room_closed",
      }),
    ).toBe("ended");
  });

  it("shows the session-ended screen when the room expires while the user is in it", () => {
    expect(
      gateView({ me, status: "closed", error: "This session has ended.", errorCode: "room_closed" }),
    ).toBe("ended");
  });

  it("keeps the session-ended screen ahead of the timeout fallback", () => {
    expect(
      gateView({
        me: null,
        status: "closed",
        error: "This session has ended.",
        errorCode: "room_closed",
        timedOut: true,
      }),
    ).toBe("ended");
  });
});
