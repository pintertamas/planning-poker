import { describe, expect, it } from "vitest";
import { canCreateRoom } from "./roomCreation";

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
