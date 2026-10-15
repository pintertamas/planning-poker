import { describe, expect, it } from "vitest";
import { sha256Hex, timingSafeEqualHex } from "./auth";

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the SHA-256 of the empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns 64 lowercase hex characters", async () => {
    expect(await sha256Hex("host secret")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("timingSafeEqualHex", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualHex("abcdef", "abcdef")).toBe(true);
  });

  it("returns false for strings differing in one character", () => {
    expect(timingSafeEqualHex("abcdef", "abcdee")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(timingSafeEqualHex("abcdef", "abcde")).toBe(false);
    expect(timingSafeEqualHex("", "a")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});
