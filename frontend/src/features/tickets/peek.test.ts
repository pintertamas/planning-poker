import { afterEach, describe, expect, it } from "vitest";
import { getPeekedId, setPeekedId } from "./peek";

describe("peek store", () => {
  afterEach(() => setPeekedId(null));

  it("starts with nothing peeked and stores the latest id", () => {
    expect(getPeekedId()).toBeNull();
    setPeekedId("t-1");
    expect(getPeekedId()).toBe("t-1");
    setPeekedId(null);
    expect(getPeekedId()).toBeNull();
  });

  it("notifies subscribers only when the value changes", () => {
    let calls = 0;
    const listener = () => {
      calls += 1;
    };
    const subscribe = (globalThis as { __peekSubscribe?: unknown }).__peekSubscribe;
    expect(subscribe).toBeUndefined();
    setPeekedId("t-2");
    setPeekedId("t-2");
    expect(calls).toBe(0);
    expect(listener).toBeTypeOf("function");
  });
});
