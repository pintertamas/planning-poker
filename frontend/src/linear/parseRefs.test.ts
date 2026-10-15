import { describe, expect, it } from "vitest";
import { parseRefs } from "./parseRefs";

describe("parseRefs", () => {
  it("extracts the identifier from a full Linear issue URL, ignoring the slug", () => {
    expect(parseRefs("https://linear.app/marshmallow/issue/clfp-123/some-slug-5")).toEqual(["CLFP-123"]);
  });

  it("extracts identifiers from mixed free text and uppercases them", () => {
    expect(parseRefs("Look at CLFP-12, then eng-7 and the notes")).toEqual(["CLFP-12", "ENG-7"]);
  });

  it("removes duplicates while keeping first-seen order", () => {
    expect(parseRefs("ENG-7 clfp-12 eng-7 https://linear.app/x/issue/CLFP-12/title CLFP-1")).toEqual([
      "ENG-7",
      "CLFP-12",
      "CLFP-1",
    ]);
  });

  it("does not pick up words from URLs that are not Linear issue links", () => {
    expect(parseRefs("see https://example.com/docs/retry-5 and ENG-9")).toEqual(["ENG-9"]);
  });

  it("returns an empty list when there is no identifier", () => {
    expect(parseRefs("nothing to see here, just words")).toEqual([]);
    expect(parseRefs("")).toEqual([]);
  });
});
