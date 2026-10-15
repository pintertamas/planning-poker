import { afterEach, describe, expect, it, vi } from "vitest";
import { keyStore, maskKey } from "./keyStore";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException("denied", "SecurityError");
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("keyStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores, reads and clears the key under pp.linearKey", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);

    expect(keyStore.get()).toBeNull();
    keyStore.set("lin_api_123");
    expect(storage.getItem("pp.linearKey")).toBe("lin_api_123");
    expect(keyStore.get()).toBe("lin_api_123");
    keyStore.clear();
    expect(keyStore.get()).toBeNull();
  });

  it("does not throw when storage access throws", () => {
    vi.stubGlobal("localStorage", throwingStorage());

    expect(() => keyStore.set("lin_api_123")).not.toThrow();
    expect(keyStore.get()).toBeNull();
    expect(() => keyStore.clear()).not.toThrow();
  });

  it("returns null when storage is not available at all", () => {
    expect(keyStore.get()).toBeNull();
    expect(() => keyStore.set("lin_api_123")).not.toThrow();
  });
});

describe("maskKey", () => {
  it("shows only the last four characters", () => {
    const masked = maskKey("lin_api_abcd1234");
    expect(masked.endsWith("1234")).toBe(true);
    expect(masked).not.toContain("lin_api");
    expect(masked).not.toContain("abcd");
  });

  it("hides short keys entirely", () => {
    expect(maskKey("abc")).toBe("••••");
  });
});
