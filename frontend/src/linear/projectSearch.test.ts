import { describe, expect, it } from "vitest";
import { matchProjects, parseProjectLink } from "./projectSearch";
import type { LinearProject } from "./types";

const DOCUSENSE_URL = "https://linear.app/marshmallow/project/docusense-for-medical-report-5aacc6eaba64/overview";
const DOCUSENSE_ISSUES_URL =
  "https://linear.app/marshmallow/project/docusense-for-medical-report-5aacc6eaba64/issues?layout=list&ordering=priority&view=all";

function project(name: string, slugId: string, overrides: Partial<LinearProject> = {}): LinearProject {
  return { id: `id-${slugId}`, name, slugId, stateName: "Planned", teamKeys: ["DEMO"], ...overrides };
}

const PAYMENTS = project("Payment Improvements", "9c2e5b7a1f40");
const DOCUSENSE = project("Docusense for medical report", "5aacc6eaba64");
const CLAIMS = project("Claims Finance Reporting", "e41d08b3c6a9");
const MOBILE = project("Mobile polish", "b07f3a92d18e");
const IMPROVED = project("Improved imports", "1a2b3c4d5e6f");
const CAFE = project("Café menu redesign", "aaaaaaaaaaaa");
const ALL = [MOBILE, DOCUSENSE, PAYMENTS, CLAIMS, IMPROVED, CAFE];

describe("parseProjectLink", () => {
  it("reads the slug id from a project overview link", () => {
    expect(parseProjectLink(DOCUSENSE_URL)).toBe("5aacc6eaba64");
  });

  it("reads the slug id from a project issues link with a query string", () => {
    expect(parseProjectLink(DOCUSENSE_ISSUES_URL)).toBe("5aacc6eaba64");
  });

  it("accepts a link with the slug missing", () => {
    expect(parseProjectLink("https://linear.app/marshmallow/project/5aacc6eaba64")).toBe("5aacc6eaba64");
  });

  it("accepts a trailing slash, a hash and no protocol", () => {
    expect(parseProjectLink("https://linear.app/marshmallow/project/docusense-5aacc6eaba64/")).toBe("5aacc6eaba64");
    expect(parseProjectLink("https://linear.app/marshmallow/project/docusense-5aacc6eaba64#overview")).toBe(
      "5aacc6eaba64",
    );
    expect(parseProjectLink("linear.app/marshmallow/project/docusense-5aacc6eaba64")).toBe("5aacc6eaba64");
  });

  it("returns the slug id in lower case whatever the case of the link", () => {
    expect(parseProjectLink("https://linear.app/marshmallow/project/Docusense-5AACC6EABA64/overview")).toBe(
      "5aacc6eaba64",
    );
    expect(parseProjectLink("https://LINEAR.app/marshmallow/PROJECT/5AACC6EABA64")).toBe("5aacc6eaba64");
  });

  it("finds a link that is mixed into other text", () => {
    expect(parseProjectLink(`see ${DOCUSENSE_URL} for context`)).toBe("5aacc6eaba64");
  });

  it("accepts a bare 12 character id as the whole input", () => {
    expect(parseProjectLink("5aacc6eaba64")).toBe("5aacc6eaba64");
    expect(parseProjectLink("  5AACC6EABA64  ")).toBe("5aacc6eaba64");
  });

  it("does not treat a Linear issue link as a project link", () => {
    expect(parseProjectLink("https://linear.app/marshmallow/issue/CTTP-12/foo")).toBeNull();
    expect(parseProjectLink("https://linear.app/marshmallow/issue/CTTP-12/5aacc6eaba64")).toBeNull();
  });

  it("returns null for plain text and near misses", () => {
    expect(parseProjectLink("payment improvements")).toBeNull();
    expect(parseProjectLink("")).toBeNull();
    expect(parseProjectLink("5aacc6eaba6")).toBeNull();
    expect(parseProjectLink("5aacc6eaba64f")).toBeNull();
    expect(parseProjectLink("zzacc6eaba64")).toBeNull();
    expect(parseProjectLink("https://linear.app/marshmallow/project/")).toBeNull();
    expect(parseProjectLink("https://linear.app/marshmallow/project/docusense5aacc6eaba64")).toBeNull();
    expect(parseProjectLink("https://example.com/project/docusense-5aacc6eaba64")).toBeNull();
  });
});

describe("matchProjects", () => {
  function names(projects: LinearProject[]) {
    return projects.map((item) => item.name);
  }

  it("returns every project sorted by name for an empty query", () => {
    expect(names(matchProjects(ALL, ""))).toEqual([
      "Café menu redesign",
      "Claims Finance Reporting",
      "Docusense for medical report",
      "Improved imports",
      "Mobile polish",
      "Payment Improvements",
    ]);
    expect(names(matchProjects(ALL, "   "))).toHaveLength(ALL.length);
  });

  it("matches a partial first word followed by a partial second word", () => {
    expect(names(matchProjects(ALL, "Pay imp"))).toEqual(["Payment Improvements"]);
  });

  it("matches the words in any order", () => {
    expect(names(matchProjects(ALL, "improvements pay"))).toEqual(["Payment Improvements"]);
  });

  it("requires every token to match", () => {
    expect(matchProjects(ALL, "pay docusense")).toEqual([]);
  });

  it("ignores case", () => {
    expect(names(matchProjects(ALL, "DOCUSENSE"))).toEqual(["Docusense for medical report"]);
  });

  it("ignores accents on either side", () => {
    expect(names(matchProjects(ALL, "cafe"))).toEqual(["Café menu redesign"]);
    expect(names(matchProjects([project("Cafe bar", "bbbbbbbbbbbb")], "café"))).toEqual(["Cafe bar"]);
  });

  it("ranks names that start with the first token above later matches", () => {
    const ranked = matchProjects(
      [project("Mobile payments", "cccccccccccc"), project("Payment Improvements", "9c2e5b7a1f40")],
      "pay",
    );
    expect(names(ranked)).toEqual(["Payment Improvements", "Mobile payments"]);
  });

  it("ranks an earlier match position above a later one", () => {
    const ranked = matchProjects(
      [
        project("Zeta mobile", "dddddddddddd"),
        project("Alpha mobile", "eeeeeeeeeeee"),
        project("Mobile polish", "b07f3a92d18e"),
      ],
      "mobile",
    );
    expect(names(ranked)).toEqual(["Mobile polish", "Zeta mobile", "Alpha mobile"]);
  });

  it("returns only the project named by a project link", () => {
    expect(matchProjects(ALL, DOCUSENSE_URL)).toEqual([DOCUSENSE]);
    expect(matchProjects(ALL, DOCUSENSE_ISSUES_URL)).toEqual([DOCUSENSE]);
    expect(matchProjects(ALL, "5AACC6EABA64")).toEqual([DOCUSENSE]);
  });

  it("matches the slug id case-insensitively", () => {
    const upper = project("Upper case slug", "ABCDEF123456");
    expect(matchProjects([upper], "https://linear.app/marshmallow/project/x-abcdef123456")).toEqual([upper]);
  });

  it("returns nothing for a project link that matches no project", () => {
    expect(matchProjects(ALL, "https://linear.app/marshmallow/project/gone-ffffffffffff/overview")).toEqual([]);
  });

  it("does not treat an issue link as a project link", () => {
    expect(matchProjects(ALL, "https://linear.app/marshmallow/issue/CTTP-12/foo")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(matchProjects(ALL, "nothing like this")).toEqual([]);
    expect(matchProjects([], "anything")).toEqual([]);
  });

  it("does not mutate the input order", () => {
    const input = [MOBILE, PAYMENTS];
    matchProjects(input, "");
    expect(input).toEqual([MOBILE, PAYMENTS]);
  });
});
