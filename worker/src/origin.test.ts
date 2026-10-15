import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origin";

const PROD = "https://pintertamas.github.io";

describe("isAllowedOrigin", () => {
  it("rejects a missing origin", () => {
    expect(isAllowedOrigin(null, PROD)).toBe(false);
  });

  it("accepts an exact match from the allowlist", () => {
    expect(isAllowedOrigin(PROD, PROD)).toBe(true);
  });

  it("matches entries case-sensitively and exactly", () => {
    expect(isAllowedOrigin("https://PINTERTAMAS.github.io", PROD)).toBe(false);
    expect(isAllowedOrigin("https://pintertamas.github.io/", PROD)).toBe(false);
    expect(isAllowedOrigin("https://evil.pintertamas.github.io", PROD)).toBe(false);
  });

  it("trims entries of a comma-separated allowlist", () => {
    const csv = " https://a.example ,  https://b.example ";
    expect(isAllowedOrigin("https://a.example", csv)).toBe(true);
    expect(isAllowedOrigin("https://b.example", csv)).toBe(true);
    expect(isAllowedOrigin("https://c.example", csv)).toBe(false);
  });

  it("does not treat an empty allowlist entry as matching an empty origin", () => {
    expect(isAllowedOrigin("", "")).toBe(false);
    expect(isAllowedOrigin("", ",")).toBe(false);
  });

  it("accepts local development origins", () => {
    expect(isAllowedOrigin("http://localhost:5173", PROD)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1", PROD)).toBe(true);
  });

  it("rejects non-local http and https origins not on the allowlist", () => {
    expect(isAllowedOrigin("http://example.com", PROD)).toBe(false);
    expect(isAllowedOrigin("https://localhost.evil.com", PROD)).toBe(false);
  });
});
