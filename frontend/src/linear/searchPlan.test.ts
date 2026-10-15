import { describe, expect, it } from "vitest";
import {
  identifiersFor,
  issueNumber,
  matchesIdQuery,
  mergeTickets,
  numberPrefixRanges,
  parseIdQuery,
} from "./searchPlan";

describe("numberPrefixRanges", () => {
  it("expands a two digit prefix into exact and widening ranges", () => {
    expect(numberPrefixRanges("12")).toEqual([
      { gte: 12, lte: 12 },
      { gte: 120, lte: 129 },
      { gte: 1200, lte: 1299 },
      { gte: 12000, lte: 12999 },
    ]);
  });

  it("stops at the maximum digit count", () => {
    expect(numberPrefixRanges("12345")).toEqual([{ gte: 12345, lte: 12345 }]);
    expect(numberPrefixRanges("1", 3)).toEqual([
      { gte: 1, lte: 1 },
      { gte: 10, lte: 19 },
      { gte: 100, lte: 199 },
    ]);
  });

  it("returns nothing for an empty string, a leading zero or a non-digit input", () => {
    expect(numberPrefixRanges("")).toEqual([]);
    expect(numberPrefixRanges("012")).toEqual([]);
    expect(numberPrefixRanges("0")).toEqual([]);
    expect(numberPrefixRanges("1a")).toEqual([]);
    expect(numberPrefixRanges("123456")).toEqual([]);
  });
});

describe("parseIdQuery", () => {
  it.each([
    ["CTTP-12", { teamKey: "CTTP", digits: "12" }],
    ["cttp-12", { teamKey: "CTTP", digits: "12" }],
    ["cttp12", { teamKey: "CTTP", digits: "12" }],
    ["CTTP-1234", { teamKey: "CTTP", digits: "1234" }],
    ["  CTTP-12  ", { teamKey: "CTTP", digits: "12" }],
    ["#12", { teamKey: null, digits: "12" }],
    ["12", { teamKey: null, digits: "12" }],
    ["1234", { teamKey: null, digits: "1234" }],
  ])("accepts %j", (query, expected) => {
    expect(parseIdQuery(query)).toEqual(expected);
  });

  it.each([
    "",
    "CTTP",
    "CTTP-",
    "-12",
    "CTTP-123456",
    "123456",
    "CTTP-12 retry",
    "CTTP 12",
    "#CTTP-12",
    "1-2",
    "CTTP_12",
    "12a",
    "https://linear.app/x/issue/CTTP-12/slug",
  ])("rejects %j", (query) => {
    expect(parseIdQuery(query)).toBeNull();
  });
});

describe("identifiersFor", () => {
  it("builds the exact identifier from a team key and digits without duplicates", () => {
    expect(identifiersFor("cttp12")).toEqual(["CTTP-12"]);
    expect(identifiersFor("CTTP-12")).toEqual(["CTTP-12"]);
  });

  it("returns no identifiers for bare numbers", () => {
    expect(identifiersFor("12")).toEqual([]);
    expect(identifiersFor("#12")).toEqual([]);
  });

  it("finds identifiers inside multi-word queries", () => {
    expect(identifiersFor("CTTP-12 retry ENG-7")).toEqual(["CTTP-12", "ENG-7"]);
  });
});

describe("issueNumber", () => {
  it("reads the trailing number of an identifier", () => {
    expect(issueNumber("CTTP-1234")).toBe(1234);
  });

  it("sorts identifiers without a number last", () => {
    expect(issueNumber("CTTP")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("matchesIdQuery", () => {
  it("matches the team key and number prefix together", () => {
    const query = { teamKey: "DEMO", digits: "10" };
    expect(matchesIdQuery("DEMO-101", query)).toBe(true);
    expect(matchesIdQuery("DEMO-10", query)).toBe(true);
    expect(matchesIdQuery("DEMO-1000", query)).toBe(true);
    expect(matchesIdQuery("DEMO-110", query)).toBe(false);
    expect(matchesIdQuery("OTHER-101", query)).toBe(false);
  });

  it("matches any team when no team key is given", () => {
    const query = { teamKey: null, digits: "12" };
    expect(matchesIdQuery("CTTP-125", query)).toBe(true);
    expect(matchesIdQuery("ENG-12000", query)).toBe(true);
    expect(matchesIdQuery("ENG-13", query)).toBe(false);
  });
});

describe("mergeTickets", () => {
  it("keeps list order, drops repeats and stops at the limit", () => {
    const merged = mergeTickets(
      [
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "c" }],
        [{ id: "d" }, { id: "e" }],
      ],
      4,
    );
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});
