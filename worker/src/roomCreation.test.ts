import { describe, expect, it } from "vitest";
import { canCreateRoom, parseRoomMode } from "./roomCreation";

describe("parseRoomMode", () => {
  it("defaults to standard when no mode is sent", () => {
    expect(parseRoomMode(undefined)).toBe("standard");
  });

  it("accepts standard and quick", () => {
    expect(parseRoomMode("standard")).toBe("standard");
    expect(parseRoomMode("quick")).toBe("quick");
  });

  it("rejects anything else, including null, other casings and non-strings", () => {
    for (const value of [null, "", "QUICK", "Quick", "quick ", "tickets", 1, true, {}, ["quick"]]) {
      expect(parseRoomMode(value)).toBeNull();
    }
  });
});

describe("canCreateRoom", () => {
  it("allows creating a missing room when the hello carries a host secret and create is requested", () => {
    expect(canCreateRoom({ hasRoom: false, hostSecret: "s3cret", create: true })).toBe(true);
  });

  it("refuses a missing room when create is not requested, even with a host secret", () => {
    expect(canCreateRoom({ hasRoom: false, hostSecret: "s3cret", create: false })).toBe(false);
  });

  it("refuses a missing room without a host secret, even when create is requested", () => {
    expect(canCreateRoom({ hasRoom: false, hostSecret: null, create: true })).toBe(false);
  });

  it("refuses an empty host secret", () => {
    expect(canCreateRoom({ hasRoom: false, hostSecret: "", create: true })).toBe(false);
  });

  it("never creates over an existing room", () => {
    expect(canCreateRoom({ hasRoom: true, hostSecret: "s3cret", create: true })).toBe(false);
  });
});
