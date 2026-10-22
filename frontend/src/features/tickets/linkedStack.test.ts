import { afterEach, describe, expect, it } from "vitest";
import { back, closeLinked, getLinkedStack, openLinked, subscribeLinkedStack } from "./linkedStack";

describe("linked ticket stack", () => {
  afterEach(() => closeLinked());

  it("starts empty and opens a ticket on top of the stack", () => {
    expect(getLinkedStack()).toEqual([]);
    openLinked("cttp-1234", "https://linear.app/ws/issue/CTTP-1234/slug");
    expect(getLinkedStack()).toEqual([{ identifier: "CTTP-1234", url: "https://linear.app/ws/issue/CTTP-1234/slug" }]);
  });

  it("pushes linked tickets and pops them back in order", () => {
    openLinked("CTTP-1");
    openLinked("CTTP-2");
    openLinked("cttp-3");
    expect(getLinkedStack().map((entry) => entry.identifier)).toEqual(["CTTP-1", "CTTP-2", "CTTP-3"]);
    back();
    expect(getLinkedStack().map((entry) => entry.identifier)).toEqual(["CTTP-1", "CTTP-2"]);
    back();
    expect(getLinkedStack().map((entry) => entry.identifier)).toEqual(["CTTP-1"]);
  });

  it("never pops the last ticket with back, so the popup stays on something", () => {
    openLinked("CTTP-1");
    back();
    expect(getLinkedStack()).toEqual([{ identifier: "CTTP-1", url: null }]);
  });

  it("ignores opening the ticket that is already on top", () => {
    openLinked("CTTP-1");
    const before = getLinkedStack();
    openLinked("cttp-1");
    expect(getLinkedStack()).toBe(before);
  });

  it("clears the whole stack on close", () => {
    openLinked("CTTP-1");
    openLinked("CTTP-2");
    closeLinked();
    expect(getLinkedStack()).toEqual([]);
  });

  it("notifies subscribers on every change and not for no-op changes", () => {
    let calls = 0;
    const unsubscribe = subscribeLinkedStack(() => {
      calls += 1;
    });
    openLinked("CTTP-1");
    openLinked("CTTP-1");
    back();
    closeLinked();
    closeLinked();
    unsubscribe();
    openLinked("CTTP-9");
    expect(calls).toBe(2);
  });
});
