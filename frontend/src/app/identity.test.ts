import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCreating, forgetHost, getHostSecret, isCreating, isDemo, markCreating, markDemo, createHostSecret } from "./identity";

class FakeStorage {
  private items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  has(key: string): boolean {
    return this.items.has(key);
  }
}

let local: FakeStorage;
let session: FakeStorage;

beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("creating flag", () => {
  it("is false until marked, then true until cleared", () => {
    expect(isCreating("cr3ate1")).toBe(false);
    markCreating("cr3ate1");
    expect(isCreating("cr3ate1")).toBe(true);
    clearCreating("cr3ate1");
    expect(isCreating("cr3ate1")).toBe(false);
  });

  it("lives in sessionStorage under the per-code key", () => {
    markCreating("cr3ate2");
    expect(session.getItem("pp.creating.cr3ate2")).toBe("1");
    expect(local.has("pp.creating.cr3ate2")).toBe(false);
  });

  it("only affects its own room code", () => {
    markCreating("cr3ate3");
    expect(isCreating("cr3ate4")).toBe(false);
  });
});

describe("forgetHost", () => {
  it("removes the host secret and the demo flag for that code and nothing else", () => {
    const secret = createHostSecret("forg3t1");
    markDemo("forg3t1");
    createHostSecret("keep01");
    markDemo("keep01");

    expect(getHostSecret("forg3t1")).toBe(secret);
    expect(isDemo("forg3t1")).toBe(true);

    forgetHost("forg3t1");

    expect(getHostSecret("forg3t1")).toBeNull();
    expect(isDemo("forg3t1")).toBe(false);
    expect(local.has("pp.host.forg3t1")).toBe(false);
    expect(session.has("pp.demo.forg3t1")).toBe(false);
    expect(getHostSecret("keep01")).not.toBeNull();
    expect(isDemo("keep01")).toBe(true);
  });
});
