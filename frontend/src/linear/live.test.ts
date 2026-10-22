import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "@shared/types";
import { LinearAuthError, LinearError } from "./client";
import { createOAuthLiveService } from "./live";
import { oauthTokenStore } from "./oauth";
import type { IssueNode } from "./mapIssue";

type Call = { query: string; variables: Record<string, unknown> };
type Reply = { data?: unknown; errors?: unknown[] };
type Responder = (call: Call) => Reply;

function scriptedFetch(respond: Responder) {
  const calls: Call[] = [];
  const fn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body)) as Call;
    calls.push(call);
    return new Response(JSON.stringify(respond(call)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

function signedInService(fetchImpl: typeof fetch) {
  oauthTokenStore.set({ accessToken: "at-test", refreshToken: null, expiresAt: Date.now() + 3_600_000 });
  return createOAuthLiveService(fetchImpl);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function issueNode(identifier: string, overrides: Partial<IssueNode> = {}): IssueNode {
  return {
    id: `id-${identifier}`,
    identifier,
    title: `Title ${identifier}`,
    description: null,
    url: `https://linear.app/x/issue/${identifier}/slug`,
    estimate: null,
    state: { name: "Todo" },
    assignee: null,
    labels: { nodes: [] },
    team: { id: "team-clfp", key: "CLFP" },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

function teamNode(id: string, estimationType: string, states: { id: string; name: string }[]) {
  return {
    id,
    key: id.toUpperCase(),
    name: `Team ${id}`,
    issueEstimationType: estimationType,
    issueEstimationExtended: false,
    issueEstimationAllowZero: false,
    states: { nodes: states.map((state) => ({ ...state, type: "started" })) },
  };
}

const FIBONACCI_TEAM = teamNode("team-clfp", "fibonacci", [
  { id: "state-todo", name: "Todo" },
  { id: "state-groomed", name: "Groomed" },
]);

function ticketFor(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "id-CLFP-1",
    identifier: "CLFP-1",
    title: "Title",
    description: "",
    url: "https://linear.app/x/issue/CLFP-1/slug",
    teamId: "team-clfp",
    teamKey: "CLFP",
    stateName: "Todo",
    assignee: null,
    labels: [],
    currentEstimate: null,
    blockedBy: [],
    ...overrides,
  };
}

describe("listTeams", () => {
  it("detects the GROOMED state case-insensitively and caches the result", async () => {
    const mock = scriptedFetch(({ query }) => {
      if (query.includes("teams(")) {
        return {
          data: {
            teams: {
              nodes: [
                FIBONACCI_TEAM,
                teamNode("team-other", "exponential", [{ id: "state-todo", name: "Todo" }]),
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      return { errors: [{ message: "unexpected" }] };
    });
    const service = signedInService(mock.fetch);

    const first = await service.listTeams();
    const second = await service.listTeams();

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      id: "team-clfp",
      key: "TEAM-CLFP",
      estimationType: "fibonacci",
      groomedStateId: "state-groomed",
    });
    expect(first[1]?.groomedStateId).toBeNull();
    expect(second).toBe(first);
    expect(mock.fn).toHaveBeenCalledTimes(1);
  });

  it("follows pagination cursors across team pages", async () => {
    const mock = scriptedFetch(({ variables }) => {
      if (variables.after === null || variables.after === undefined) {
        return {
          data: {
            teams: {
              nodes: [FIBONACCI_TEAM],
              pageInfo: { hasNextPage: true, endCursor: "page-2" },
            },
          },
        };
      }
      return {
        data: {
          teams: {
            nodes: [teamNode("team-two", "fibonacci", [])],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    });
    const service = signedInService(mock.fetch);

    const teams = await service.listTeams();

    expect(teams.map((team) => team.id)).toEqual(["team-clfp", "team-two"]);
    expect(mock.calls[1]?.variables.after).toBe("page-2");
  });

  it("retries after a failed fetch instead of caching the failure", async () => {
    let attempt = 0;
    const mock = scriptedFetch(() => {
      attempt += 1;
      if (attempt === 1) return { errors: [{ message: "temporary" }] };
      return { data: { teams: { nodes: [FIBONACCI_TEAM], pageInfo: { hasNextPage: false, endCursor: null } } } };
    });
    const service = signedInService(mock.fetch);

    await expect(service.listTeams()).rejects.toBeInstanceOf(LinearError);
    await expect(service.listTeams()).resolves.toHaveLength(1);
    expect(mock.fn).toHaveBeenCalledTimes(2);
  });
});

function projectNode(id: string, name: string, slugId: string, teamKeys: string[] = ["CLFP"]) {
  return {
    id,
    name,
    slugId,
    status: { name: "In Progress" },
    teams: { nodes: teamKeys.map((key) => ({ key })) },
  };
}

describe("listProjects", () => {
  it("maps projects with their status name and team keys, and caches the result", async () => {
    const mock = scriptedFetch(() => ({
      data: {
        projects: {
          nodes: [projectNode("p-1", "Docusense", "5aacc6eaba64", ["CLFP", "OPS"])],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }));
    const service = signedInService(mock.fetch);

    const first = await service.listProjects();
    const second = await service.listProjects();

    expect(first).toEqual([
      {
        id: "p-1",
        name: "Docusense",
        slugId: "5aacc6eaba64",
        stateName: "In Progress",
        teamKeys: ["CLFP", "OPS"],
      },
    ]);
    expect(second).toBe(first);
    expect(mock.fn).toHaveBeenCalledTimes(1);
    expect(mock.calls[0]?.query).toContain("projects(first: 100, after: $after)");
    expect(mock.calls[0]?.query).not.toContain("includeArchived");
  });

  it("follows pagination cursors across project pages", async () => {
    const mock = scriptedFetch(({ variables }) => {
      if (variables.after === "page-2") {
        return {
          data: {
            projects: {
              nodes: [projectNode("p-2", "Claims", "e41d08b3c6a9")],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      return {
        data: {
          projects: {
            nodes: [projectNode("p-1", "Docusense", "5aacc6eaba64")],
            pageInfo: { hasNextPage: true, endCursor: "page-2" },
          },
        },
      };
    });
    const service = signedInService(mock.fetch);

    const projects = await service.listProjects();

    expect(projects.map((project) => project.id)).toEqual(["p-1", "p-2"]);
    expect(mock.calls[0]?.variables.after).toBeNull();
    expect(mock.calls[1]?.variables.after).toBe("page-2");
  });

  it("stops after five pages even when Linear has more", async () => {
    let page = 0;
    const mock = scriptedFetch(() => {
      page += 1;
      return {
        data: {
          projects: {
            nodes: [projectNode(`p-${page}`, `Project ${page}`, `${page}`.padStart(12, "a"))],
            pageInfo: { hasNextPage: true, endCursor: `page-${page + 1}` },
          },
        },
      };
    });
    const service = signedInService(mock.fetch);

    const projects = await service.listProjects();

    expect(mock.fn).toHaveBeenCalledTimes(5);
    expect(projects).toHaveLength(5);
  });

  it("retries after a failed fetch instead of caching the failure", async () => {
    let attempt = 0;
    const mock = scriptedFetch(() => {
      attempt += 1;
      if (attempt === 1) return { errors: [{ message: "temporary" }] };
      return {
        data: {
          projects: {
            nodes: [projectNode("p-1", "Docusense", "5aacc6eaba64")],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    });
    const service = signedInService(mock.fetch);

    await expect(service.listProjects()).rejects.toBeInstanceOf(LinearError);
    await expect(service.listProjects()).resolves.toHaveLength(1);
    expect(mock.fn).toHaveBeenCalledTimes(2);
  });
});

describe("checkEstimateScale", () => {
  function serviceWithTeams(teams: unknown[]) {
    const mock = scriptedFetch(() => ({
      data: { teams: { nodes: teams, pageInfo: { hasNextPage: false, endCursor: null } } },
    }));
    return signedInService(mock.fetch);
  }

  it("reports a missing GROOMED status", async () => {
    const service = serviceWithTeams([teamNode("team-clfp", "fibonacci", [{ id: "s", name: "Todo" }])]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({
      ok: false,
      reason: "No GROOMED status found in this team",
    });
  });

  it("reports a non-Fibonacci estimate scale with its type", async () => {
    const service = serviceWithTeams([teamNode("team-clfp", "exponential", [{ id: "g", name: "Groomed" }])]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({
      ok: false,
      reason: "This team uses the exponential estimate scale; 1, 2, 3, 5 and 8 need the Fibonacci scale",
    });
  });

  it("passes when the team has GROOMED and a Fibonacci scale", async () => {
    const service = serviceWithTeams([FIBONACCI_TEAM]);
    await expect(service.checkEstimateScale("team-clfp")).resolves.toEqual({ ok: true, reason: null });
  });

  it("reports an unknown team instead of passing", async () => {
    const service = serviceWithTeams([FIBONACCI_TEAM]);
    const check = await service.checkEstimateScale("team-missing");
    expect(check.ok).toBe(false);
  });
});

describe("commitEstimate", () => {
  function commitService(teams: unknown[], success = true) {
    const mock = scriptedFetch(({ query }) => {
      if (query.includes("issueUpdate")) {
        return { data: { issueUpdate: { success } } };
      }
      return { data: { teams: { nodes: teams, pageInfo: { hasNextPage: false, endCursor: null } } } };
    });
    return { service: signedInService(mock.fetch), mock };
  }

  it("sends the estimate with the groomed state id", async () => {
    const { service, mock } = commitService([FIBONACCI_TEAM]);

    await service.commitEstimate(ticketFor({ id: "issue-uuid", teamId: "team-clfp" }), 5);

    const mutation = mock.calls.find((call) => call.query.includes("issueUpdate"));
    expect(mutation?.variables).toEqual({ id: "issue-uuid", estimate: 5, stateId: "state-groomed" });
  });

  it("throws without sending a mutation when the scale check fails", async () => {
    const { service, mock } = commitService([teamNode("team-clfp", "exponential", [{ id: "g", name: "Groomed" }])]);

    await expect(service.commitEstimate(ticketFor(), 3)).rejects.toBeInstanceOf(LinearError);
    expect(mock.calls.some((call) => call.query.includes("issueUpdate"))).toBe(false);
  });

  it("throws when Linear reports success false", async () => {
    const { service } = commitService([FIBONACCI_TEAM], false);
    await expect(service.commitEstimate(ticketFor(), 3)).rejects.toBeInstanceOf(LinearError);
  });
});

describe("issue paging", () => {
  it("passes the cursor through and returns nextCursor for project issues", async () => {
    const mock = scriptedFetch(({ variables }) => {
      if (variables.after === "cursor-1") {
        return {
          data: { issues: { nodes: [issueNode("CLFP-2")], pageInfo: { hasNextPage: false, endCursor: null } } },
        };
      }
      return {
        data: {
          issues: { nodes: [issueNode("CLFP-1")], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        },
      };
    });
    const service = signedInService(mock.fetch);

    const first = await service.issuesFromProject("project-1", { onlyUnestimated: true });
    expect(first.nextCursor).toBe("cursor-1");
    expect(first.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-1"]);

    const second = await service.issuesFromProject(
      "project-1",
      { onlyUnestimated: true },
      first.nextCursor ?? undefined,
    );
    expect(second.nextCursor).toBeNull();
    expect(second.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-2"]);
    expect(mock.calls[1]?.variables.after).toBe("cursor-1");
  });

  it("filters project issues to open states and Todo without an estimate when onlyUnestimated is on", async () => {
    const mock = scriptedFetch(() => ({
      data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    }));
    const service = signedInService(mock.fetch);

    await service.issuesFromProject("project-1", { onlyUnestimated: true });

    expect(mock.calls[0]?.variables.filter).toEqual({
      project: { id: { eq: "project-1" } },
      state: { type: { nin: ["completed", "canceled"] }, name: { eqIgnoreCase: "Todo" } },
      estimate: { null: true },
    });
  });

  it("filters project issues to open states only when onlyUnestimated is off", async () => {
    const mock = scriptedFetch(() => ({
      data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    }));
    const service = signedInService(mock.fetch);

    await service.issuesFromProject("project-1", { onlyUnestimated: false }, "cursor-9");

    expect(mock.calls[0]?.variables).toEqual({
      filter: {
        project: { id: { eq: "project-1" } },
        state: { type: { nin: ["completed", "canceled"] } },
      },
      after: "cursor-9",
    });
    expect(mock.calls[0]?.query).toContain("issues(filter: $filter, first: 50, after: $after)");
  });

  it("reads view issues through customView and passes the cursor", async () => {
    const mock = scriptedFetch(() => ({
      data: {
        customView: {
          issues: { nodes: [issueNode("CLFP-9")], pageInfo: { hasNextPage: true, endCursor: "next" } },
        },
      },
    }));
    const service = signedInService(mock.fetch);

    const page = await service.issuesFromView("view-1", "start");

    expect(mock.calls[0]?.variables).toEqual({ id: "view-1", after: "start" });
    expect(page.nextCursor).toBe("next");
  });
});

describe("issuesByRefs", () => {
  it("resolves refs in one batched query and reports the ones that were not found", async () => {
    const mock = scriptedFetch(() => ({
      data: {
        r0: issueNode("CLFP-123"),
        r1: null,
      },
      errors: [{ message: "Entity not found: Issue", path: ["r1"] }],
    }));
    const service = signedInService(mock.fetch);

    const result = await service.issuesByRefs(["CLFP-123", "NOPE-999"]);

    expect(mock.fn).toHaveBeenCalledTimes(1);
    expect(mock.calls[0]?.query).toContain("r0: issue(id: $r0)");
    expect(mock.calls[0]?.query).toContain("r1: issue(id: $r1)");
    expect(mock.calls[0]?.variables).toEqual({ r0: "CLFP-123", r1: "NOPE-999" });
    expect(result.tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-123"]);
    expect(result.notFound).toEqual(["NOPE-999"]);
  });

  it("does not call Linear when there is nothing to resolve", async () => {
    const mock = scriptedFetch(() => ({ data: {} }));
    const service = signedInService(mock.fetch);

    await expect(service.issuesByRefs([])).resolves.toEqual({ tickets: [], notFound: [] });
    expect(mock.fn).not.toHaveBeenCalled();
  });

});

function operationName(call: Call): string {
  return /query (\w+)/.exec(call.query)?.[1] ?? "";
}

function callsTo(calls: Call[], name: string): Call[] {
  return calls.filter((call) => operationName(call) === name);
}

function routedFetch(routes: Record<string, Responder>) {
  return scriptedFetch((call) => {
    const route = routes[operationName(call)];
    return route ? route(call) : { errors: [{ message: `unrouted ${operationName(call)}` }] };
  });
}

const RANGES_FOR_12 = [
  { number: { gte: 12, lte: 12 } },
  { number: { gte: 120, lte: 129 } },
  { number: { gte: 1200, lte: 1299 } },
  { number: { gte: 12000, lte: 12999 } },
];

const EMPTY_ISSUES = { data: { issues: { nodes: [] } } };
const EMPTY_REFS = { data: { r0: null } };
const EMPTY_FULL_TEXT = { data: { searchIssues: { nodes: [] } } };

describe("searchIssues", () => {
  it("sends a team-scoped number range filter, an exact lookup and a title search for a ticket ID", async () => {
    const mock = routedFetch({
      IssuesByRef: () => EMPTY_REFS,
      IssuesByNumber: () => EMPTY_ISSUES,
      SearchIssues: () => EMPTY_ISSUES,
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    await service.searchIssues("CTTP-12");

    expect(callsTo(mock.calls, "IssuesByNumber")[0]?.variables.filter).toEqual({
      and: [{ team: { key: { eqIgnoreCase: "CTTP" } } }, { or: RANGES_FOR_12 }],
    });
    expect(callsTo(mock.calls, "IssuesByRef")[0]?.variables).toEqual({ r0: "CTTP-12" });
    expect(callsTo(mock.calls, "SearchIssues")[0]?.variables).toEqual({
      filter: { title: { containsIgnoreCase: "CTTP-12" } },
    });
  });

  it("sends the number ranges without a team clause for a bare number", async () => {
    const mock = routedFetch({
      IssuesByRef: () => EMPTY_REFS,
      IssuesByNumber: () => EMPTY_ISSUES,
      SearchIssues: () => EMPTY_ISSUES,
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    await service.searchIssues("#12");

    expect(callsTo(mock.calls, "IssuesByNumber")[0]?.variables.filter).toEqual({ and: [{ or: RANGES_FOR_12 }] });
    expect(callsTo(mock.calls, "IssuesByRef")).toHaveLength(0);
  });

  it("skips the number prefix for a multi-word query and still resolves the exact ref and title search", async () => {
    const mock = routedFetch({
      IssuesByRef: () => EMPTY_REFS,
      IssuesByNumber: () => EMPTY_ISSUES,
      SearchIssues: () => EMPTY_ISSUES,
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    await service.searchIssues("CTTP-12 retry");

    expect(callsTo(mock.calls, "IssuesByNumber")).toHaveLength(0);
    expect(callsTo(mock.calls, "IssuesByRef")[0]?.variables).toEqual({ r0: "CTTP-12" });
    expect(callsTo(mock.calls, "SearchIssues")[0]?.variables).toEqual({
      filter: { title: { containsIgnoreCase: "CTTP-12 retry" } },
    });
  });

  it("merges exact, number prefix, title and full-text results in priority order without duplicates", async () => {
    const mock = routedFetch({
      IssuesByRef: () => ({ data: { r0: issueNode("CLFP-12") } }),
      IssuesByNumber: () => ({
        data: { issues: { nodes: [issueNode("CLFP-125"), issueNode("CLFP-12"), issueNode("CLFP-120")] } },
      }),
      SearchIssues: () => ({ data: { issues: { nodes: [issueNode("CLFP-300"), issueNode("CLFP-120")] } } }),
      FullTextSearch: () => ({
        data: {
          searchIssues: {
            nodes: [
              { id: "id-CLFP-9", identifier: "CLFP-9" },
              { id: "id-CLFP-300", identifier: "CLFP-300" },
            ],
          },
        },
      }),
      IssuesByIds: () => ({ data: { issues: { nodes: [issueNode("CLFP-300"), issueNode("CLFP-9")] } } }),
    });
    const service = signedInService(mock.fetch);

    const tickets = await service.searchIssues("CLFP-12");

    expect(tickets.map((ticket) => ticket.identifier)).toEqual([
      "CLFP-12",
      "CLFP-120",
      "CLFP-125",
      "CLFP-300",
      "CLFP-9",
    ]);
    expect(callsTo(mock.calls, "IssuesByIds")[0]?.variables).toEqual({ ids: ["id-CLFP-9", "id-CLFP-300"] });
  });

  it("keeps the results of the other sub-queries when one fails", async () => {
    const mock = routedFetch({
      IssuesByRef: () => ({ data: { r0: issueNode("CLFP-12") } }),
      IssuesByNumber: () => ({ errors: [{ message: "Complexity too high" }] }),
      SearchIssues: () => ({ data: { issues: { nodes: [issueNode("CLFP-7")] } } }),
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    const tickets = await service.searchIssues("CLFP-12");

    expect(tickets.map((ticket) => ticket.identifier)).toEqual(["CLFP-12", "CLFP-7"]);
  });

  it("rethrows the first error when every sub-query fails", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 500 }));
    const service = signedInService(fetchMock as unknown as typeof fetch);

    await expect(service.searchIssues("CLFP-12")).rejects.toThrow("Linear request failed with HTTP 500.");
  });

  it("rethrows an auth error even when other sub-queries succeed", async () => {
    const mock = routedFetch({
      IssuesByRef: () => ({ data: { r0: issueNode("CLFP-12") } }),
      IssuesByNumber: () => ({
        errors: [{ message: "Authentication required", extensions: { type: "authentication error" } }],
      }),
      SearchIssues: () => ({ data: { issues: { nodes: [issueNode("CLFP-7")] } } }),
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    await expect(service.searchIssues("CLFP-12")).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("trims the title search term", async () => {
    const mock = routedFetch({
      SearchIssues: () => EMPTY_ISSUES,
      FullTextSearch: () => EMPTY_FULL_TEXT,
    });
    const service = signedInService(mock.fetch);

    await service.searchIssues("  webhook retry ");

    expect(callsTo(mock.calls, "SearchIssues")[0]?.variables).toEqual({
      filter: { title: { containsIgnoreCase: "webhook retry" } },
    });
  });

  it("returns nothing and sends nothing for a blank query", async () => {
    const mock = routedFetch({});
    const service = signedInService(mock.fetch);

    await expect(service.searchIssues("   ")).resolves.toEqual([]);
    expect(mock.fn).not.toHaveBeenCalled();
  });
});

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function viewNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `View ${id}`,
    description: null,
    shared: false,
    modelName: "Issue",
    team: { key: "CLFP" },
    ...overrides,
  };
}

const VIEW_PAGE = {
  nodes: [
    viewNode("v1", { name: "Alpha", shared: true }),
    viewNode("v2", { name: "Beta" }),
    viewNode("v3", { name: "Gamma", shared: true, team: null }),
    viewNode("v4", { name: "Project view", modelName: "Project" }),
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};

function favoritesPage(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return { data: { favorites: { nodes, pageInfo: { hasNextPage, endCursor } } } };
}

describe("listViews", () => {
  it("sends the favourites query alongside customViews and marks favourite views with their order", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: () =>
        favoritesPage([
          { id: "f1", sortOrder: 2, customView: { id: "v1" } },
          { id: "f2", sortOrder: 1.5, customView: { id: "v3" } },
          { id: "f3", sortOrder: 0, customView: null },
        ]),
    });
    const service = signedInService(mock.fetch);

    const views = await service.listViews();

    expect(callsTo(mock.calls, "CustomViews")).toHaveLength(1);
    expect(callsTo(mock.calls, "Favorites")).toHaveLength(1);
    expect(callsTo(mock.calls, "Favorites")[0]?.variables).toEqual({ after: null });
    expect(callsTo(mock.calls, "Favorites")[0]?.query).toContain("customView { id }");
    expect(views).toEqual([
      {
        id: "v1",
        name: "Alpha",
        description: null,
        shared: true,
        teamKey: "CLFP",
        favorite: true,
        favoriteOrder: 2,
      },
      {
        id: "v2",
        name: "Beta",
        description: null,
        shared: false,
        teamKey: "CLFP",
        favorite: false,
        favoriteOrder: null,
      },
      {
        id: "v3",
        name: "Gamma",
        description: null,
        shared: true,
        teamKey: null,
        favorite: true,
        favoriteOrder: 1.5,
      },
    ]);
  });

  it("ignores favourites that are not saved views", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: () =>
        favoritesPage([
          { id: "f1", sortOrder: 1, customView: null },
          { id: "f2", sortOrder: 2, customView: null },
          { id: "f3", sortOrder: 3, customView: { id: "v4" } },
        ]),
    });
    const service = signedInService(mock.fetch);

    const views = await service.listViews();

    expect(views.map((view) => view.id)).toEqual(["v1", "v2", "v3"]);
    expect(views.every((view) => !view.favorite && view.favoriteOrder === null)).toBe(true);
  });

  it("flattens favourites nested in folders by reading the flat favourites list", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: () =>
        favoritesPage([
          { id: "folder", sortOrder: 0, customView: null },
          { id: "nested", sortOrder: 4, customView: { id: "v2" } },
        ]),
    });
    const service = signedInService(mock.fetch);

    const views = await service.listViews();

    expect(views.find((view) => view.id === "v2")).toMatchObject({ favorite: true, favoriteOrder: 4 });
    expect(views.filter((view) => view.favorite)).toHaveLength(1);
  });

  it("follows favourite pages and stops after five pages", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: ({ variables }) => {
        const page = variables.after === null ? 0 : Number(String(variables.after).slice(1));
        return favoritesPage([{ id: `f${page}`, sortOrder: page, customView: { id: "v1" } }], true, `c${page + 1}`);
      },
    });
    const service = signedInService(mock.fetch);

    const views = await service.listViews();

    const favoriteCalls = callsTo(mock.calls, "Favorites");
    expect(favoriteCalls).toHaveLength(5);
    expect(favoriteCalls[0]?.variables.after).toBeNull();
    expect(favoriteCalls[4]?.variables.after).toBe("c4");
    expect(favoriteCalls[0]?.query).toContain("first: 100");
    expect(views.find((view) => view.id === "v1")).toMatchObject({ favorite: true, favoriteOrder: 0 });
  });

  it("lists the views without favourites when the favourites request fails", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: () => ({ errors: [{ message: "Complexity too high" }] }),
    });
    const service = signedInService(mock.fetch);

    const views = await service.listViews();

    expect(views.map((view) => view.id)).toEqual(["v1", "v2", "v3"]);
    expect(views.every((view) => !view.favorite && view.favoriteOrder === null)).toBe(true);
  });

  it("propagates an auth error from the favourites request", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ data: { customViews: VIEW_PAGE } }),
      Favorites: () => ({
        errors: [{ message: "Authentication required", extensions: { type: "authentication error" } }],
      }),
    });
    const service = signedInService(mock.fetch);

    await expect(service.listViews()).rejects.toBeInstanceOf(LinearAuthError);
  });

  it("fails when the views request fails", async () => {
    const mock = routedFetch({
      CustomViews: () => ({ errors: [{ message: "Views unavailable" }] }),
      Favorites: () => favoritesPage([{ id: "f1", sortOrder: 1, customView: { id: "v1" } }]),
    });
    const service = signedInService(mock.fetch);

    await expect(service.listViews()).rejects.toBeInstanceOf(LinearError);
  });
});

describe("createOAuthLiveService", () => {
  const viewerBody = { data: { viewer: { id: "u1", name: "Tamas", email: "t@example.com" } } };

  beforeEach(() => {
    vi.stubEnv("VITE_LINEAR_CLIENT_ID", "client-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the OAuth access token as a Bearer header", async () => {
    oauthTokenStore.set({ accessToken: "at-1", refreshToken: "rt-1", expiresAt: Date.now() + 3_600_000 });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(viewerBody));

    const viewer = await createOAuthLiveService(fetchMock as unknown as typeof fetch).getViewer();

    expect(viewer).toEqual({ id: "u1", name: "Tamas", email: "t@example.com" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
  });

  it("refreshes the token and retries once when Linear rejects it", async () => {
    oauthTokenStore.set({ accessToken: "at-1", refreshToken: "rt-1", expiresAt: Date.now() + 3_600_000 });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.linear.app/oauth/token") {
        return jsonResponse({ access_token: "at-2", refresh_token: "rt-2", expires_in: 86399 });
      }
      const header = (init?.headers as Record<string, string>).Authorization;
      return header === "Bearer at-2" ? jsonResponse(viewerBody) : jsonResponse({}, 401);
    });

    const viewer = await createOAuthLiveService(fetchMock as unknown as typeof fetch).getViewer();

    expect(viewer.id).toBe("u1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(oauthTokenStore.get()?.refreshToken).toBe("rt-2");
  });

  it("fails with a sign-in error and does not call Linear when no tokens are stored", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(viewerBody));

    const error = await createOAuthLiveService(fetchMock as unknown as typeof fetch)
      .getViewer()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LinearAuthError);
    expect((error as LinearAuthError).message).toBe("Your Linear sign-in expired. Sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
